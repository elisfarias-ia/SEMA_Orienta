// Sprint 7, Passo 7C: ator como parâmetro { usuarioId, perfil, setor }, conferido contra a lista fixa; histórico com resultado
// "ok" ou "negado"; decisões no formato novo, com o antigo aceito na leitura; manifesto só com perfil e setor (sem usuarioId,
// nome nem e-mail). Sprint 8, Passo 8A: usuários fictícios selecionáveis (Maria e Carlos) e atores aceitos (demonstração,
// Maria e Carlos, sem nome). As gravações rodam em cópias temporárias fora do repositório; a base real não é tocada.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ATORES_ACEITOS, ATOR_DEMONSTRACAO, ATOR_LEGADO, ATOR_PADRAO, PERFIS, SETOR_CLABI, USUARIOS_SELECIONAVEIS, atorDoUsuario, registroDoAtor, resolverAtor,
  responsavelPublico, validarAtor, validarAtorSelecionavel, validarResponsavelPublico,
} from '../services/admin/atores.js';
import { validarRegistro } from '../services/admin/decisoes.js';
import { criarHistoricoRevisao, validarAcaoRevisao, validarAcaoTema } from '../services/admin/historico-revisao.js';
import { criarServicoPublicacao } from '../services/admin/publicacao.js';
import { criarServicoRevisao } from '../services/admin/revisao-servico.js';
import { validarVersao } from '../services/admin/versao.js';
import { validarServicos } from '../scripts/validate-services.js';
import { ate } from './admin-auxiliar.js';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const AGORA = () => new Date(2026, 10, 17, 12, 0, 0);
// Usuário fictício FORA da lista de atores aceitos.
const DE_FORA = Object.freeze({ usuarioId: 'usuario-ficticio', perfil: 'revisor', setor: 'Setor fictício' });
// Usuários fictícios de demonstração do login simulado, no formato do ator (sem nome).
const MARIA = Object.freeze({ usuarioId: 'maria-silva', perfil: 'cadastrante', setor: 'CLABI' });
const CARLOS = Object.freeze({ usuarioId: 'carlos-silva', perfil: 'revisor', setor: 'CLABI' });
const PUBLICO = responsavelPublico(ATOR_PADRAO);

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

// ---------- atores.js ----------

test('AT1. listas fixas: selecionáveis só Maria e Carlos; aceitos = demonstração, Maria e Carlos (sem nome); tudo congelado', () => {
  assert.equal(SETOR_CLABI, 'CLABI');
  assert.deepEqual(USUARIOS_SELECIONAVEIS, [
    { usuarioId: 'maria-silva', nome: 'Maria Silva', perfil: 'cadastrante', setor: 'CLABI' },
    { usuarioId: 'carlos-silva', nome: 'Carlos Silva', perfil: 'revisor', setor: 'CLABI' },
  ]);
  assert.deepEqual(ATORES_ACEITOS, [ATOR_DEMONSTRACAO, MARIA, CARLOS]);
  assert.equal(ATOR_PADRAO, ATOR_DEMONSTRACAO);
  assert.deepEqual(ATOR_DEMONSTRACAO, { usuarioId: 'servidor-demonstracao', perfil: 'demonstracao', setor: 'Ambiente local de demonstração' });
  assert.deepEqual([...PERFIS], ['demonstracao', 'cadastrante', 'revisor']);
  for (const lista of [USUARIOS_SELECIONAVEIS, ATORES_ACEITOS]) {
    assert.ok(Object.isFrozen(lista));
    for (const item of lista) assert.ok(Object.isFrozen(item), JSON.stringify(item));
  }
  assert.ok(Object.isFrozen(ATOR_DEMONSTRACAO));
  for (const ator of ATORES_ACEITOS) assert.equal('nome' in ator, false);
  for (const ator of [ATOR_PADRAO, { ...ATOR_PADRAO }, MARIA, { ...CARLOS }]) assert.deepEqual(validarAtor(ator), [], JSON.stringify(ator));
  for (const ator of [DE_FORA, { ...ATOR_PADRAO, perfil: 'revisor' }, { ...ATOR_PADRAO, setor: 'Outro' }, { ...ATOR_PADRAO, usuarioId: 'outro' },
    { ...ATOR_PADRAO, nome: 'Fulano' }, { usuarioId: ATOR_PADRAO.usuarioId, perfil: ATOR_PADRAO.perfil }, 'servidor-demonstracao', null, [], {},
    USUARIOS_SELECIONAVEIS[0], { ...MARIA, nome: 'Maria Silva' }, { ...MARIA, perfil: 'revisor' }, { ...CARLOS, perfil: 'cadastrante' },
    { ...MARIA, setor: ATOR_PADRAO.setor }, { ...CARLOS, usuarioId: 'maria-silva' }]) {
    assert.notDeepEqual(validarAtor(ator), [], JSON.stringify(ator));
  }
});

test('AT1b. validarAtorSelecionavel e atorDoUsuario: só Maria e Carlos, sempre sem nome', () => {
  assert.deepEqual(validarAtorSelecionavel(MARIA), []);
  assert.deepEqual(validarAtorSelecionavel({ ...CARLOS }), []);
  for (const ator of [ATOR_DEMONSTRACAO, DE_FORA, USUARIOS_SELECIONAVEIS[1], { ...MARIA, perfil: 'revisor' }, null, {}, 'maria-silva']) {
    assert.notDeepEqual(validarAtorSelecionavel(ator), [], JSON.stringify(ator));
  }
  const maria = atorDoUsuario('maria-silva');
  assert.deepEqual(maria, { ok: true, ator: { ...MARIA } });
  assert.equal('nome' in maria.ator, false);
  assert.deepEqual(atorDoUsuario('carlos-silva'), { ok: true, ator: { ...CARLOS } });
  maria.ator.perfil = 'revisor';
  assert.deepEqual(atorDoUsuario('maria-silva').ator, { ...MARIA }, 'devolve cópia');
  for (const id of ['servidor-demonstracao', 'usuario-ficticio', 'Maria Silva', 'MARIA-SILVA', '', '__proto__', 'constructor', null, undefined, 1, {}]) {
    assert.deepEqual(atorDoUsuario(id), { ok: false, erro: 'usuario_invalido' }, String(id));
  }
});

test('AT2. resolverAtor: sem ator vale o de demonstração; ator inválido é recusado; devolve cópia', () => {
  const padrao = resolverAtor(undefined);
  assert.deepEqual(padrao, { ok: true, ator: { ...ATOR_PADRAO } });
  assert.notEqual(padrao.ator, ATOR_PADRAO);
  assert.deepEqual(resolverAtor(ATOR_PADRAO).ator, { ...ATOR_PADRAO });
  assert.deepEqual(resolverAtor(MARIA), { ok: true, ator: { ...MARIA } });
  assert.deepEqual(resolverAtor(CARLOS), { ok: true, ator: { ...CARLOS } });
  for (const ator of [null, DE_FORA, {}, 'x', USUARIOS_SELECIONAVEIS[0], { ...CARLOS, perfil: 'cadastrante' }]) {
    assert.deepEqual(resolverAtor(ator), { ok: false, erro: 'ator_invalido' });
  }
});

test('AT3. responsável público: só perfil e setor de um ator aceito; nunca usuarioId, nome ou e-mail', () => {
  assert.deepEqual(PUBLICO, { perfil: 'demonstracao', setor: 'Ambiente local de demonstração' });
  assert.deepEqual(responsavelPublico(MARIA), { perfil: 'cadastrante', setor: 'CLABI' });
  for (const r of [PUBLICO, { perfil: 'cadastrante', setor: 'CLABI' }, { perfil: 'revisor', setor: 'CLABI' }]) {
    assert.deepEqual(validarResponsavelPublico(r), [], JSON.stringify(r));
  }
  const arroba = '@';
  for (const r of [{ ...PUBLICO, usuarioId: 'servidor-demonstracao' }, { ...PUBLICO, nome: 'Fulano' }, { ...PUBLICO, email: `a${arroba}b.gov.br` },
    { perfil: 'revisor', setor: PUBLICO.setor }, { perfil: PUBLICO.perfil, setor: 'Outro setor' }, { perfil: PUBLICO.perfil }, null,
    { perfil: 'demonstracao', setor: 'CLABI' }, { perfil: 'cadastrante', setor: PUBLICO.setor }, { perfil: 'revisor', setor: 'CLABI', nome: 'Carlos Silva' },
    { perfil: 'cadastrante', setor: 'clabi' }]) {
    assert.notDeepEqual(validarResponsavelPublico(r), [], JSON.stringify(r));
  }
});

test('AT4. registroDoAtor: compara o formato novo e aceita o legado só para o ator de demonstração', () => {
  assert.equal(registroDoAtor({ ator: { ...ATOR_PADRAO } }, ATOR_PADRAO), true);
  assert.equal(registroDoAtor({ ator: DE_FORA }, ATOR_PADRAO), false);
  assert.equal(registroDoAtor({ ...ATOR_LEGADO }, ATOR_PADRAO), true);
  assert.equal(registroDoAtor({ responsavel: 'outro', unidade: ATOR_LEGADO.unidade }, ATOR_PADRAO), false);
  assert.equal(registroDoAtor({ ...ATOR_LEGADO }, DE_FORA), false);
  assert.equal(registroDoAtor(null, ATOR_PADRAO), false);
});

// ---------- histórico privado ----------

const acao = (extra = {}) => ({
  id: 'acao-000001', tipo: 'acao_revisao', servicoId: 'lac', versaoId: 'lac-v1', hashConteudo: null, acao: 'revisar_fonte',
  dataHora: '2026-11-17T15:00:00.000Z', resultado: 'ok', ator: { ...ATOR_PADRAO }, itemId: null, itemTipo: null, ...extra,
});

test('AT5. histórico: aceita ator da lista e o texto antigo; resultado ok ou negado; recusa ator de fora e outros resultados', () => {
  assert.deepEqual(validarAcaoRevisao(acao()), []);
  assert.deepEqual(validarAcaoRevisao(acao({ resultado: 'negado' })), []);
  assert.deepEqual(validarAcaoRevisao(acao({ ator: ATOR_LEGADO.responsavel })), [], 'registro antigo continua válido');
  assert.deepEqual(validarAcaoRevisao(acao({ ator: { ...MARIA } })), []);
  assert.deepEqual(validarAcaoRevisao(acao({ ator: { ...CARLOS }, acao: 'publicar' })), []);
  assert.notDeepEqual(validarAcaoRevisao(acao({ ator: { ...MARIA, nome: 'Maria Silva' } })), []);
  for (const extra of [{ ator: DE_FORA }, { ator: 'Outro ator' }, { ator: null }, { resultado: 'erro' }, { resultado: 'OK' }]) {
    assert.notDeepEqual(validarAcaoRevisao(acao(extra)), [], JSON.stringify(extra));
  }
  const tema = { id: 'acao-000001', tipo: 'acao_tema', acao: 'editar_tema', dataHora: '2026-11-17T15:00:00.000Z', resultado: 'negado', ator: { ...ATOR_PADRAO }, itemId: 'licenciamento-ambiental', itemTipo: 'tema' };
  assert.deepEqual(validarAcaoTema(tema), []);
  assert.deepEqual(validarAcaoTema({ ...tema, ator: ATOR_LEGADO.responsavel, resultado: 'ok' }), []);
  assert.notDeepEqual(validarAcaoTema({ ...tema, ator: DE_FORA }), []);
});

test('AT6. registrarAcao: grava o ator (padrão ou informado) e o resultado negado; ator ou resultado inválido não grava nada', () => {
  const pai = fs.mkdtempSync(path.join(os.tmpdir(), 'sema-atores-'));
  try {
    const h = criarHistoricoRevisao({ raiz: pai, agora: AGORA });
    assert.equal(h.registrarAcao('lac', { versaoId: 'lac-v1', acao: 'revisar_fonte' }).ok, true);
    assert.equal(h.registrarAcao('lac', { versaoId: 'lac-v1', acao: 'publicar', ator: ATOR_PADRAO, resultado: 'negado' }).ok, true);
    assert.deepEqual(h.registrarAcao('lac', { versaoId: 'lac-v1', acao: 'publicar', ator: DE_FORA }), { ok: false, erro: 'ator_invalido' });
    assert.deepEqual(h.registrarAcao('lac', { versaoId: 'lac-v1', acao: 'publicar', resultado: 'talvez' }), { ok: false, erro: 'resultado_invalido' });
    assert.deepEqual(h.registrarAcaoDeTema('licenciamento-ambiental', { ator: DE_FORA }), { ok: false, erro: 'ator_invalido' });
    const registros = h.listarAcoes('lac').registros;
    assert.deepEqual(registros.map((r) => [r.acao, r.resultado, r.ator]), [['revisar_fonte', 'ok', { ...ATOR_PADRAO }], ['publicar', 'negado', { ...ATOR_PADRAO }]]);
  } finally {
    fs.rmSync(pai, { recursive: true, force: true });
  }
});

// ---------- decisões ----------

test('AT7. decisões: formato novo (ator) e antigo (responsavel e unidade) aceitos; mistura ou ator de fora recusados', () => {
  const { v } = ate('em_validacao');
  const base = { id: 'decisao-1', versaoId: v.id, hashConteudo: v.hashConteudo, data: '2026-01-12', observacao: null, tipo: 'decisao_material', decisao: 'validado_materialmente' };
  assert.deepEqual(validarRegistro({ ...base, ator: { ...ATOR_PADRAO } }), []);
  assert.deepEqual(validarRegistro({ ...base, ...ATOR_LEGADO }), [], 'registro antigo continua válido');
  assert.deepEqual(validarRegistro({ ...base, ator: { ...CARLOS } }), []);
  assert.deepEqual(validarRegistro({ ...base, ator: { ...MARIA } }), []);
  assert.notDeepEqual(validarRegistro({ ...base, ator: { ...CARLOS, perfil: 'cadastrante' } }), []);
  assert.notDeepEqual(validarRegistro({ ...base, ator: DE_FORA }), []);
  assert.notDeepEqual(validarRegistro({ ...base, ator: { ...ATOR_PADRAO }, responsavel: 'x', unidade: 'y' }), []);
  assert.notDeepEqual(validarRegistro({ ...base }), []);
  const revogacao = { ...base, tipo: 'revogacao', motivo: 'Motivo fictício.' };
  delete revogacao.decisao;
  assert.deepEqual(validarRegistro({ ...revogacao, ator: { ...ATOR_PADRAO } }), []);
});

// ---------- manifesto ----------

test('AT8. manifesto: responsaveis só com perfil e setor, nas etapas compatíveis com o estado', () => {
  const { v } = ate('revogado');
  const completo = { validacao: PUBLICO, autorizacao: PUBLICO, publicacao: PUBLICO, revogacao: PUBLICO };
  assert.deepEqual(validarVersao({ ...v, responsaveis: completo }), []);
  assert.deepEqual(validarVersao(v), [], 'versão sem responsaveis continua válida');
  const CLABI_REVISOR = responsavelPublico(CARLOS);
  assert.deepEqual(validarVersao({ ...v, responsaveis: { validacao: CLABI_REVISOR, autorizacao: CLABI_REVISOR, publicacao: CLABI_REVISOR, revogacao: PUBLICO } }), []);
  assert.deepEqual(validarVersao({ ...v, responsaveis: { validacao: responsavelPublico(MARIA), autorizacao: PUBLICO, publicacao: PUBLICO, revogacao: PUBLICO } }), []);
  const publicada = ate('publicado').v;
  assert.deepEqual(validarVersao({ ...publicada, responsaveis: { validacao: PUBLICO, autorizacao: PUBLICO, publicacao: PUBLICO } }), []);
  assert.ok(validarVersao({ ...publicada, responsaveis: { revogacao: PUBLICO } }).includes('responsaveis.revogacao não é permitido neste estado'));
  assert.ok(validarVersao({ ...ate('validado_materialmente').v, responsaveis: { autorizacao: PUBLICO } }).includes('responsaveis.autorizacao não é permitido neste estado'));
  for (const responsaveis of [{}, [], { validacao: { ...PUBLICO, usuarioId: 'servidor-demonstracao' } }, { validacao: { ...PUBLICO, nome: 'Fulano' } },
    { aprovacao: PUBLICO }, { validacao: { perfil: 'revisor', setor: 'Setor fictício' } }]) {
    assert.notDeepEqual(validarVersao({ ...v, responsaveis }), [], JSON.stringify(responsaveis));
  }
});

// ---------- serviços, em cópia temporária ----------

const lerJ = (raiz, ...p) => JSON.parse(fs.readFileSync(path.join(raiz, ...p), 'utf8'));
const gravarJ = (raiz, p, d) => fs.writeFileSync(path.join(raiz, ...p), `${JSON.stringify(d, null, 2)}\n`);
const bloco = {
  id: 'bc-atores', tipo: 'conhecimento', titulo: 'Informação fictícia', texto: 'Orientação fictícia aprovada para teste do ator.',
  fonteIds: ['manual-lac-siga-2020'], referencias: [{ fonteId: 'manual-lac-siga-2020', localizacao: 'página 1' }], origem: 'fonte', ambiente: 'publico',
  statusValidacao: 'rascunho', publicado: false, revisaoAtualidade: 'pendente', criadoEm: '2026-11-10', atualizadoEm: '2026-11-10',
};

function comCopia(fn) {
  const pai = fs.mkdtempSync(path.join(os.tmpdir(), 'sema-orienta-atores-'));
  const raiz = path.join(pai, 'raiz');
  fs.mkdirSync(raiz);
  fs.cpSync(path.join(RAIZ, 'services'), path.join(raiz, 'services'), { recursive: true });
  try {
    const conteudo = lerJ(raiz, 'services', 'lac', 'versoes', 'v1', 'conteudo-assistente.json');
    conteudo.blocos.push(bloco);
    gravarJ(raiz, ['services', 'lac', 'versoes', 'v1', 'conteudo-assistente.json'], conteudo);
    fn(raiz);
  } finally {
    fs.rmSync(pai, { recursive: true, force: true });
  }
}

/** Todos os arquivos de uma pasta, como texto. */
function textos(pasta) {
  const lista = [];
  const andar = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) andar(p);
      else lista.push([p, fs.readFileSync(p, 'utf8')]);
    }
  };
  if (fs.existsSync(pasta)) andar(pasta);
  return lista;
}

/** Arquivos de DADOS da base (registro, assuntos e pastas dos serviços); fora o código e os esquemas, que documentam os campos. */
function dadosDaBase(raiz) {
  const pasta = path.join(raiz, 'services');
  return textos(pasta).filter(([a]) => {
    const partes = path.relative(pasta, a).split(path.sep);
    if (partes.length === 1) return partes[0] === 'registry.json' || partes[0] === 'assuntos.json';
    return partes[0] !== 'admin' && partes[0] !== 'schemas';
  });
}

test('AT9. ciclo completo: manifesto com perfil e setor por etapa; usuarioId só em data/admin-private/, nunca em services/', () => {
  comCopia((raiz) => {
    const rev = criarServicoRevisao({ raiz, agora: AGORA });
    const sit = () => rev.consultar('lac').situacao;
    for (const id of sit().fontes.filter((f) => f.usadaPorBloco && !f.revisada).map((f) => f.id)) assert.equal(rev.revisarFonte('lac', { fonteId: id, revisao: sit().revisao }).ok, true);
    for (const id of sit().blocos.filter((b) => !b.aceito).map((b) => b.id)) assert.equal(rev.aceitarBloco('lac', { blocoId: id, revisao: sit().revisao, ator: ATOR_PADRAO }).ok, true);
    const concluida = rev.concluirRevisao('lac', { revisao: sit().revisao });
    assert.equal(concluida.ok, true);
    const manifesto = () => lerJ(raiz, 'services', 'lac', 'versoes', 'v1', 'versao.json');
    assert.deepEqual(manifesto().responsaveis, { validacao: PUBLICO });
    const pub = criarServicoPublicacao({ raiz, agora: AGORA });
    assert.equal(pub.autorizar('lac', { revisao: concluida.hash }).ok, true);
    assert.deepEqual(manifesto().responsaveis, { validacao: PUBLICO, autorizacao: PUBLICO });
    assert.equal(pub.publicar('lac', { revisao: concluida.hash, ator: ATOR_PADRAO }).ok, true);
    assert.deepEqual(manifesto().responsaveis, { validacao: PUBLICO, autorizacao: PUBLICO, publicacao: PUBLICO });
    assert.equal(pub.revogar('lac', { revisao: concluida.hash, motivo: 'Motivo fictício de revogação.' }).ok, true);
    assert.deepEqual(manifesto().responsaveis, { validacao: PUBLICO, autorizacao: PUBLICO, publicacao: PUBLICO, revogacao: PUBLICO });
    assert.deepEqual(validarServicos(raiz).erros, []);

    // Auditoria completa só no histórico privado.
    const privados = textos(path.join(raiz, 'data', 'admin-private'));
    assert.ok(privados.length >= 2);
    assert.ok(privados.every(([, t]) => t.includes('"usuarioId":"servidor-demonstracao"')));
    // Nada de usuarioId, nem do identificador do ator, nos DADOS de services/ (o que vai para o Git).
    const dados = dadosDaBase(raiz);
    assert.ok(dados.some(([a]) => a.endsWith('versao.json')) && dados.some(([a]) => a.includes(`${path.sep}publico${path.sep}`)));
    for (const [arquivo, texto] of dados) assert.doesNotMatch(texto, /usuarioId|servidor-demonstracao/, path.relative(raiz, arquivo));
  });
});

test('AT10. ator inválido é recusado (ator_invalido) em todas as gravações, sem mudar nada', () => {
  comCopia((raiz) => {
    const antes = retrato(raiz);
    const rev = criarServicoRevisao({ raiz, agora: AGORA });
    const s = rev.consultar('lac').situacao;
    const pub = criarServicoPublicacao({ raiz, agora: AGORA });
    const resultados = [
      rev.revisarFonte('lac', { fonteId: 'manual-lac-siga-2020', revisao: s.revisao, ator: DE_FORA }),
      rev.aceitarBloco('lac', { blocoId: 'bc-atores', revisao: s.revisao, ator: DE_FORA }),
      rev.concluirRevisao('lac', { revisao: s.revisao, ator: DE_FORA }),
      rev.criarNovaVersao('lac', { ator: DE_FORA }),
      pub.autorizar('lac', { revisao: s.revisao, ator: DE_FORA }),
      pub.publicar('lac', { revisao: s.revisao, ator: DE_FORA }),
      pub.revogar('lac', { revisao: s.revisao, motivo: 'Motivo fictício.', ator: DE_FORA }),
    ];
    for (const r of resultados) assert.deepEqual(r, { ok: false, erro: 'ator_invalido' });
    assert.deepEqual(retrato(raiz), antes);
  });
});

test('AT12. guarda: os usuários fictícios não aparecem nos dados da base real (só leitura)', () => {
  const dados = dadosDaBase(RAIZ);
  assert.ok(dados.length > 0);
  for (const [arquivo, texto] of dados) {
    for (const termo of ['Maria Silva', 'Carlos Silva', 'maria-silva', 'carlos-silva']) assert.equal(texto.includes(termo), false, `${termo} em ${path.relative(RAIZ, arquivo)}`);
  }
});

test('AT11. a base real não tem responsaveis nem usuarioId, e não foi alterada', () => {
  for (const [arquivo, texto] of dadosDaBase(RAIZ)) assert.doesNotMatch(texto, /usuarioId|servidor-demonstracao/, path.relative(RAIZ, arquivo));
  assert.equal('responsaveis' in lerJ(RAIZ, 'services', 'lac', 'versoes', 'v1', 'versao.json'), false);
  assert.deepEqual(retrato(RAIZ), RETRATO_REAL_ANTES);
  assert.equal(fs.existsSync(path.join(RAIZ, 'data')), false);
});
