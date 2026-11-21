// Sprint 7, Passo 7A: domínio da revogação (funções puras) e as checagens do validador da base.
// As funções puras usam versões fictícias em memória; o validador roda em cópias temporárias fora do repositório,
// e a base real e o armazenamento privado real não são tocados (retrato por hash antes e depois).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ACOES_DA_VERSAO, acoesPermitidas, verificarAcao, verificarTransicao } from '../services/admin/fluxo.js';
import { LIMITE_MOTIVO, TIPO_REVOGACAO, publicarVersao, revogarVersao, validarHistorico, validarRegistro } from '../services/admin/decisoes.js';
import { criarNovaVersao, validarVersao } from '../services/admin/versao.js';
import { criarServicoPublicacao } from '../services/admin/publicacao.js';
import { criarServicoRevisao } from '../services/admin/revisao-servico.js';
import { lerConteudoPublicado } from '../services/publicacao-publica.js';
import { validarServicos } from '../scripts/validate-services.js';
import { ate, base, congelar } from './admin-auxiliar.js';
import { CARLOS, MARIA } from './admin-auxiliar.js';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function retrato(raiz, pastas = ['services', 'data']) {
  const itens = [];
  const andar = (d) => {
    if (!fs.existsSync(d)) return;
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) andar(p);
      else itens.push(`${path.relative(raiz, p)} ${crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')}`);
    }
  };
  for (const p of pastas) andar(path.join(raiz, p));
  return itens.sort();
}
const RETRATO_REAL_ANTES = retrato(RAIZ);

/** Versão publicada fictícia, com a data de publicação que a publicação real grava no manifesto. */
function publicada() {
  const { v, h } = ate('publicado');
  return { v: congelar({ ...v, publicadoEm: '2026-01-14' }), h };
}
const revogacao = (v, extra = {}) => base(v, { id: 'revogacao-1', data: '2026-01-15', motivo: 'Conteúdo desatualizado (motivo fictício).', ...extra });

// ---------- fluxo ----------

test('R1. fluxo: revogar só a partir de publicado; revogado não tem saída além de nova versão', () => {
  assert.deepEqual(ACOES_DA_VERSAO.revogar.de, ['publicado']);
  assert.equal(ACOES_DA_VERSAO.revogar.para, 'revogado');
  assert.deepEqual(verificarAcao('revogar', 'publicado'), { permitida: true, para: 'revogado', motivo: null });
  for (const estado of ['rascunho', 'em_validacao', 'ajustes_solicitados', 'validado_materialmente', 'autorizado_publicacao', 'revogado']) {
    assert.equal(verificarAcao('revogar', estado).permitida, false, estado);
  }
  assert.deepEqual(acoesPermitidas('revogado'), ['nova_versao']);
  for (const para of ['publicado', 'autorizado_publicacao', 'validado_materialmente', 'rascunho']) {
    assert.equal(verificarTransicao('revogado', para).permitida, false, para);
  }
});

// ---------- revogarVersao ----------

test('R2. revogar: publicado -> revogado, com revogadoEm = data, publicadoEm preservado e o registro só acrescentado', () => {
  const { v, h } = publicada();
  const r = revogarVersao(v, h, revogacao(v));
  assert.equal(r.ok, true);
  assert.equal(r.versao.estado, 'revogado');
  assert.equal(r.versao.revogadoEm, '2026-01-15');
  assert.equal(r.versao.publicadoEm, '2026-01-14');
  assert.equal(r.versao.hashConteudo, v.hashConteudo);
  assert.deepEqual(validarVersao(r.versao), []);
  assert.equal(r.historico.length, h.length + 1);
  assert.deepEqual(r.historico.slice(0, -1), h);
  assert.deepEqual(r.registro, { ...revogacao(v), observacao: null, tipo: TIPO_REVOGACAO });
  assert.deepEqual(validarHistorico(r.historico), []);
  // as entradas não são modificadas
  assert.equal(v.estado, 'publicado');
  assert.equal('revogadoEm' in v, false);
});

test('R3. motivo obrigatório: ausente, vazio, só espaços, longo demais ou com e-mail é recusado', () => {
  const { v, h } = publicada();
  const semMotivo = revogacao(v);
  delete semMotivo.motivo;
  const arroba = '@';
  for (const entrada of [semMotivo, revogacao(v, { motivo: '' }), revogacao(v, { motivo: '   ' }), revogacao(v, { motivo: 42 }),
    revogacao(v, { motivo: 'x'.repeat(LIMITE_MOTIVO + 1) }), revogacao(v, { motivo: `Pedido de fulano${arroba}exemplo.com` })]) {
    const r = revogarVersao(v, h, entrada);
    assert.equal(r.ok, false);
    assert.equal(r.erro, 'revogacao_invalida', JSON.stringify(entrada.motivo));
  }
  assert.equal(revogarVersao(v, h, revogacao(v, { motivo: 'x'.repeat(LIMITE_MOTIVO) })).ok, true);
  assert.equal(revogarVersao(v, h, null).erro, 'revogacao_invalida');
  assert.equal(revogarVersao(v, h, { ...revogacao(v), extra: 1 }).erro, 'revogacao_invalida');
});

// Dados pessoais e credenciais montados por concatenação, para que nenhum literal fique nos arquivos de teste.
const SENSIVEIS = Object.freeze({
  'CPF formatado': `Pedido do titular ${['123', '456', '789'].join('.')}-${'09'}`,
  'CPF só dígitos': `Pedido do titular ${'123456'}${'78909'}`,
  'telefone celular com DDD': `Ligar para ${['(65)', '9' + '8765'].join(' ')}-${'4321'}`,
  credencial: `Acesso ${'sen' + 'ha'}: ${'abc' + '123'}`,
  'Bearer com token curto': `Chave ${'Bear' + 'er'} ${'abcdef' + '123456'}`,
  'e-mail': `Pedido de fulano${'@'}${['exemplo', 'com'].join('.')}`,
});

test('R3b. motivo com CPF, telefone, credencial ou e-mail é recusado sem ecoar o texto; motivo limpo é aceito', () => {
  const { v, h } = publicada();
  const hAntes = structuredClone(h);
  for (const [nome, motivo] of Object.entries(SENSIVEIS)) {
    const r = revogarVersao(v, h, revogacao(v, { motivo }));
    assert.equal(r.ok, false, nome);
    assert.equal(r.erro, 'revogacao_invalida', nome);
    assert.equal(JSON.stringify(r).includes(motivo), false, nome);
  }
  // nada foi gravado nem modificado nas entradas
  assert.equal(v.estado, 'publicado');
  assert.equal('revogadoEm' in v, false);
  assert.deepEqual(h, hAntes);
  assert.equal(revogarVersao(v, h, revogacao(v, { motivo: 'Conteúdo desatualizado após mudança de norma' })).ok, true);
});

test('R3c. proteção contra regressão: histórico já gravado com motivo parecido com telefone continua válido na leitura (não testa a recusa nova)', () => {
  const { v, h } = publicada();
  const r = revogarVersao(v, h, revogacao(v));
  assert.equal(r.ok, true);
  const antigo = r.historico.map((reg) => (reg.tipo === TIPO_REVOGACAO ? { ...reg, motivo: SENSIVEIS['telefone celular com DDD'] } : reg));
  assert.deepEqual(validarRegistro(antigo.at(-1)), []);
  assert.deepEqual(validarHistorico(antigo), []);
});

test('R4. só se revoga o que está publicado: demais estados e a própria versão revogada são recusados', () => {
  for (const estado of ['em_validacao', 'ajustes_solicitados', 'validado_materialmente', 'autorizado_publicacao']) {
    const { v, h } = ate(estado);
    assert.equal(revogarVersao(v, h, revogacao(v, { data: '2026-01-20' })).erro, 'versao_nao_publicada', estado);
  }
  const { v, h } = ate('revogado');
  assert.equal(v.estado, 'revogado');
  assert.equal(revogarVersao(v, h, revogacao(v, { id: 'revogacao-2', data: '2026-01-20' })).erro, 'versao_nao_publicada');
});

test('R5. coerência: versão, hash, id único e datas (não antes da publicação nem do último registro)', () => {
  const { v, h } = publicada();
  assert.equal(revogarVersao(v, h, revogacao(v, { versaoId: 'outra-versao' })).erro, 'versao_divergente');
  assert.equal(revogarVersao(v, h, revogacao(v, { hashConteudo: 'f'.repeat(64) })).erro, 'hash_divergente');
  assert.equal(revogarVersao(v, h, revogacao(v, { id: h[0].id })).erro, 'id_duplicado');
  assert.equal(revogarVersao(v, h, revogacao(v, { data: '2026-01-13' })).erro, 'data_anterior_a_publicacao');
  assert.equal(revogarVersao(v, h, revogacao(v, { data: '2026-01-12' })).erro, 'data_anterior_ao_historico');
  // versão publicada sem a data de publicação não pode ser revogada (a revogada exige publicadoEm)
  const semData = ate('publicado');
  assert.equal(revogarVersao(semData.v, semData.h, revogacao(semData.v)).erro, 'versao_invalida');
});

test('R6. revogado não volta a publicado: publicar e transições recusadas; revogadoEm fora de revogado é erro', () => {
  const { v, h } = ate('revogado');
  assert.equal(publicarVersao(v, h).ok, false);
  assert.equal(verificarTransicao('revogado', 'publicado').permitida, false);
  assert.ok(validarVersao({ ...v, estado: 'publicado' }).includes('revogadoEm só é permitido em versão revogada: uma versão revogada não volta a ser usada'));
  for (const estado of ['rascunho', 'em_validacao', 'autorizado_publicacao']) {
    assert.ok(validarVersao({ ...v, estado }).some((e) => e.startsWith('revogadoEm só é permitido')), estado);
  }
  // nova versão a partir da revogada nasce em rascunho, sem as datas de publicação e de revogação
  const nova = criarNovaVersao(v, { id: 'versao-2', criadoEm: '2026-02-01' });
  assert.equal(nova.ok, true);
  assert.equal(nova.versao.estado, 'rascunho');
  assert.equal('publicadoEm' in nova.versao || 'revogadoEm' in nova.versao, false);
});

test('R7. versão revogada exige publicadoEm e revogadoEm válidos, sem revogadoEm anterior à publicação', () => {
  const { v } = ate('revogado');
  assert.deepEqual(validarVersao(v), []);
  const semRevogadoEm = { ...v };
  delete semRevogadoEm.revogadoEm;
  assert.ok(validarVersao(semRevogadoEm).includes('versão revogada exige revogadoEm'));
  const semPublicadoEm = { ...v };
  delete semPublicadoEm.publicadoEm;
  assert.ok(validarVersao(semPublicadoEm).includes('versão revogada exige publicadoEm (só se revoga o que foi publicado)'));
  assert.ok(validarVersao({ ...v, revogadoEm: '2026-01-13' }).includes('revogadoEm não pode ser anterior a publicadoEm'));
  assert.ok(validarVersao({ ...v, revogadoEm: '2026-02-30' }).includes('revogadoEm deve ser uma data válida AAAA-MM-DD'));
});

test('R8. registro de revogação: tipo reconhecido no histórico; tipo desconhecido citado na mensagem', () => {
  const { h } = ate('revogado');
  assert.equal(h.at(-1).tipo, 'revogacao');
  assert.deepEqual(validarHistorico(h), []);
  assert.deepEqual(validarRegistro({ tipo: 'outro' }), ['tipo deve ser decisao_material, autorizacao_publicacao ou revogacao']);
});

// ---------- validador da base, em cópia temporária ----------

const AGORA = () => new Date(2026, 10, 17, 12, 0, 0);
const lerJ = (raiz, ...p) => JSON.parse(fs.readFileSync(path.join(raiz, ...p), 'utf8'));
const gravarJ = (raiz, p, d) => fs.writeFileSync(path.join(raiz, ...p), `${JSON.stringify(d, null, 2)}\n`);
const MANIFESTO = ['services', 'lac', 'versoes', 'v1', 'versao.json'];
const REGISTRO = ['services', 'registry.json'];
const bloco = (id) => ({
  id, tipo: 'conhecimento', titulo: 'Informação fictícia', texto: 'Orientação fictícia aprovada para teste de revogação.', fonteIds: ['manual-lac-siga-2020'],
  referencias: [{ fonteId: 'manual-lac-siga-2020', localizacao: 'página 1' }], origem: 'fonte', ambiente: 'publico',
  statusValidacao: 'rascunho', publicado: false, revisaoAtualidade: 'pendente', criadoEm: '2026-11-10', atualizadoEm: '2026-11-10',
});

/** Cópia temporária com a LAC publicada pelo caminho real (revisão, autorização e publicação), com um bloco fictício. */
function comLacPublicada(fn) {
  const pai = fs.mkdtempSync(path.join(os.tmpdir(), 'sema-orienta-revogacao-'));
  const raiz = path.join(pai, 'raiz');
  fs.mkdirSync(raiz);
  fs.cpSync(path.join(RAIZ, 'services'), path.join(raiz, 'services'), { recursive: true });
  try {
    const conteudo = lerJ(raiz, 'services', 'lac', 'versoes', 'v1', 'conteudo-assistente.json');
    conteudo.blocos.push(bloco('bc-revogacao'));
    gravarJ(raiz, ['services', 'lac', 'versoes', 'v1', 'conteudo-assistente.json'], conteudo);
    const rev = criarServicoRevisao({ raiz, agora: AGORA });
    const sit = () => rev.consultar('lac').situacao;
    for (const id of sit().fontes.filter((f) => f.usadaPorBloco && !f.revisada).map((f) => f.id)) assert.equal(rev.revisarFonte('lac', { ator: MARIA, fonteId: id, revisao: sit().revisao }).ok, true);
    for (const id of sit().blocos.filter((b) => !b.aceito).map((b) => b.id)) assert.equal(rev.aceitarBloco('lac', { ator: MARIA, blocoId: id, revisao: sit().revisao }).ok, true);
    const concluida = rev.concluirRevisao('lac', { ator: CARLOS, revisao: sit().revisao });
    assert.equal(concluida.ok, true);
    const pub = criarServicoPublicacao({ raiz, agora: AGORA });
    assert.equal(pub.autorizar('lac', { ator: CARLOS, revisao: concluida.hash }).ok, true);
    assert.equal(pub.publicar('lac', { ator: CARLOS, revisao: concluida.hash }).ok, true);
    assert.deepEqual(validarServicos(raiz).erros, []);
    fn(raiz);
  } finally {
    fs.rmSync(pai, { recursive: true, force: true });
  }
}

/** Grava na cópia o estado que a revogação deixará (a transação é do Passo 7B): manifesto revogado e registro sem publicação. */
function simularRevogacao(raiz, { manifesto = {}, registro = {} } = {}) {
  const m = lerJ(raiz, ...MANIFESTO);
  gravarJ(raiz, MANIFESTO, { ...m, estado: 'revogado', revogadoEm: '2026-11-18', ...manifesto });
  const r = lerJ(raiz, ...REGISTRO);
  const servicoJson = lerJ(raiz, 'services', 'lac', 'versoes', 'v1', 'service.json');
  r.servicos[0] = { ...r.servicos[0], publicado: false, versaoPublicadaId: null, statusValidacao: servicoJson.statusValidacao, ...registro };
  gravarJ(raiz, REGISTRO, r);
}

test('R9. base: versão revogada coerente é válida, o arquivo público fica no disco e deixa de ser servido', () => {
  comLacPublicada((raiz) => {
    const arquivosPublicos = fs.readdirSync(path.join(raiz, 'services', 'lac', 'publico'));
    assert.equal(arquivosPublicos.length, 1);
    assert.notEqual(lerConteudoPublicado(raiz, 'lac'), null);
    simularRevogacao(raiz);
    assert.deepEqual(validarServicos(raiz).erros, []);
    assert.deepEqual(fs.readdirSync(path.join(raiz, 'services', 'lac', 'publico')), arquivosPublicos);
    assert.equal(lerConteudoPublicado(raiz, 'lac'), null);
  });
});

test('R10. base: as três checagens da revogação', () => {
  comLacPublicada((raiz) => {
    const original = { manifesto: lerJ(raiz, ...MANIFESTO), registro: lerJ(raiz, ...REGISTRO) };
    const restaurar = () => {
      gravarJ(raiz, MANIFESTO, original.manifesto);
      gravarJ(raiz, REGISTRO, original.registro);
    };
    const erros = () => validarServicos(raiz).erros.join('\n');

    // 1. versão revogada sem revogadoEm
    simularRevogacao(raiz);
    const m = lerJ(raiz, ...MANIFESTO);
    delete m.revogadoEm;
    gravarJ(raiz, MANIFESTO, m);
    assert.match(erros(), /versão revogada exige revogadoEm/);
    restaurar();

    // 2. registro apontando para a versão revogada
    simularRevogacao(raiz, { registro: { publicado: true, versaoPublicadaId: 'lac-v1', statusValidacao: original.registro.servicos[0].statusValidacao } });
    assert.match(erros(), /versaoPublicadaId não pode apontar para uma versão revogada/);
    restaurar();

    // 3. versão revogada voltando a publicado (mantém revogadoEm)
    simularRevogacao(raiz, { manifesto: { estado: 'publicado' } });
    const r = lerJ(raiz, ...REGISTRO);
    r.servicos[0] = original.registro.servicos[0];
    gravarJ(raiz, REGISTRO, r);
    assert.match(erros(), /revogadoEm só é permitido em versão revogada/);
    restaurar();

    assert.deepEqual(validarServicos(raiz).erros, []);
  });
});

test('R11. a base real e o armazenamento privado real não foram alterados', () => {
  assert.deepEqual(retrato(RAIZ), RETRATO_REAL_ANTES);
  assert.equal(fs.existsSync(path.join(RAIZ, 'data')), false);
});
