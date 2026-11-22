// Sprint 8, Passo 8D: o antigo "concluir revisão" virou três ações (services/admin/revisao-servico.js):
//   - enviarParaRevisao (Cadastrante): rascunho -> em_validacao, congela a versão (hash e enviadaEm); não grava decisão;
//   - validarMaterialmente (Revisor): em_validacao -> validado_materialmente, com decisão material;
//   - solicitarAjustes (Revisor): em_validacao -> ajustes_solicitados, com motivo SÓ na decisão privada.
// Todos os testes usam cópias temporárias fora do repositório; a base real e data/ reais não são tocadas.
// Maria Silva (Cadastrante) e Carlos Silva (Revisor) são usuários FICTÍCIOS do login simulado. Sem e-mail nem telefone escritos
// por extenso aqui (teste C1): os exemplos sensíveis são montados por partes.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { criarServicoRevisao } from '../services/admin/revisao-servico.js';
import { criarServicoPublicacao } from '../services/admin/publicacao.js';
import { ACOES_SO_LEITURA, criarHistoricoRevisao, validarAcaoRevisao } from '../services/admin/historico-revisao.js';
import { registrarDecisaoMaterial } from '../services/admin/decisoes.js';
import { validarVersao } from '../services/admin/versao.js';
import { validarServicos } from '../scripts/validate-services.js';
import { CARLOS, MARIA, ate, base } from './admin-auxiliar.js';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const AGORA = () => new Date(2026, 10, 21, 12, 0, 0);
const MANUAL = 'manual-lac-siga-2020';
const MOTIVO = 'Ajustar o prazo fictício da etapa 2 conforme o manual.';
const ARROBA = '@';
const EMAIL = `pessoa${ARROBA}provedor.com.br`;
const TELEFONE = '(65) 9' + '9999-1234';
const CPF = ['123', '456', '789'].join('.') + '-09';
const CREDENCIAL = 'senha' + ': ' + 'x'.repeat(12);
const CADASTRANTE_PUBLICO = { perfil: 'cadastrante', setor: 'CLABI' };
const REVISOR_PUBLICO = { perfil: 'revisor', setor: 'CLABI' };

function retrato(raiz, sub = 'services') {
  const itens = [];
  const andar = (d) => {
    if (!fs.existsSync(d)) return;
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { itens.push(`D ${path.relative(raiz, p)}`); andar(p); } else itens.push(`F ${path.relative(raiz, p)} ${crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')}`);
    }
  };
  andar(path.join(raiz, sub));
  return itens.sort();
}
const RETRATO_REAL_ANTES = retrato(RAIZ);
const RETRATO_DATA_REAL_ANTES = retrato(RAIZ, 'data');

const arq = (nome, n = 1) => ['services', 'lac', 'versoes', `v${n}`, nome];
const lerJ = (raiz, ...p) => JSON.parse(fs.readFileSync(path.join(raiz, ...p), 'utf8'));
const gravarJ = (raiz, p, d) => fs.writeFileSync(path.join(raiz, ...p), `${JSON.stringify(d, null, 2)}\n`);
const textoDe = (raiz, ...p) => (fs.existsSync(path.join(raiz, ...p)) ? fs.readFileSync(path.join(raiz, ...p), 'utf8') : '');
const bloco = (id, fonteIds) => ({
  id, tipo: 'conhecimento', titulo: `Informação ${id}`, texto: 'Texto fictício de orientação.', fonteIds,
  referencias: fonteIds.map((f) => ({ fonteId: f, localizacao: 'página 1' })), origem: 'fonte', ambiente: 'publico',
  statusValidacao: 'rascunho', publicado: false, revisaoAtualidade: 'pendente', criadoEm: '2026-11-10', atualizadoEm: '2026-11-10',
});

/** Cópia da base com um bloco em elaboração que cita o manual (pendente). */
async function comCopia(fn) {
  const pai = fs.mkdtempSync(path.join(os.tmpdir(), 'sema-orienta-fluxo-revisao-'));
  const raiz = path.join(pai, 'raiz');
  fs.mkdirSync(raiz);
  fs.cpSync(path.join(RAIZ, 'services'), path.join(raiz, 'services'), { recursive: true });
  const f = lerJ(raiz, ...arq('fontes.json'));
  f.fontes.find((x) => x.id === MANUAL).statusValidacao = 'em_validacao';
  gravarJ(raiz, arq('fontes.json'), f);
  const c = lerJ(raiz, ...arq('conteudo-assistente.json'));
  c.blocos.push(bloco('bc-fluxo', [MANUAL]));
  gravarJ(raiz, arq('conteudo-assistente.json'), c);
  assert.deepEqual(validarServicos(raiz).erros, [], 'a LAC de teste precisa ser válida');
  try {
    return await fn({ raiz, pai });
  } finally {
    fs.rmSync(pai, { recursive: true, force: true });
  }
}

/** Resolve as pendências da versão atual (Maria revisa as fontes usadas e aceita as informações). Devolve o serviço. */
function semPendencias(raiz, rev = criarServicoRevisao({ raiz, agora: AGORA })) {
  const sit = () => rev.consultar('lac').situacao;
  for (const id of sit().fontes.filter((x) => x.usadaPorBloco && !x.revisada).map((x) => x.id)) assert.equal(rev.revisarFonte('lac', { ator: MARIA, fonteId: id, revisao: sit().revisao }).ok, true);
  for (const id of sit().blocos.filter((b) => !b.aceito).map((b) => b.id)) assert.equal(rev.aceitarBloco('lac', { ator: MARIA, blocoId: id, revisao: sit().revisao }).ok, true);
  assert.deepEqual(sit().pendencias, []);
  return rev;
}
const revisaoDe = (rev) => rev.consultar('lac').situacao.revisao;
const acoes = (raiz) => criarHistoricoRevisao({ raiz }).listarAcoes('lac').registros;
const decisoes = (raiz) => criarHistoricoRevisao({ raiz }).listarDecisoes('lac').registros;

/** Envia como Maria e devolve { rev, hash }. */
function enviada(raiz) {
  const rev = semPendencias(raiz);
  const e = rev.enviarParaRevisao('lac', { ator: MARIA, revisao: revisaoDe(rev) });
  assert.equal(e.ok, true, JSON.stringify(e));
  return { rev, hash: e.hash };
}

test('FR1. envio por Maria: hash e enviadaEm no manifesto, responsaveis.envio só com perfil e setor, ação no histórico e nenhuma decisão', async () => {
  await comCopia(async ({ raiz }) => {
    const rev = semPendencias(raiz);
    const s = rev.consultar('lac').situacao;
    assert.equal(s.podeEnviar, true);
    const e = rev.enviarParaRevisao('lac', { ator: MARIA, revisao: s.revisao });
    assert.deepEqual(e, { ok: true, versaoId: 'lac-v1', hash: s.revisao, estado: 'em_validacao' });
    const m = lerJ(raiz, ...arq('versao.json'));
    assert.deepEqual([m.estado, m.hashConteudo, m.enviadaEm, m.responsaveis], ['em_validacao', s.revisao, '2026-11-21', { envio: CADASTRANTE_PUBLICO }]);
    assert.deepEqual(validarVersao(m), []);
    assert.doesNotMatch(textoDe(raiz, ...arq('versao.json')), /usuarioId|maria-silva|Maria Silva/);
    assert.deepEqual(acoes(raiz).at(-1).acao, 'enviar_para_revisao');
    assert.deepEqual(acoes(raiz).at(-1).ator, { ...MARIA });
    assert.deepEqual(decisoes(raiz), [], 'o envio não grava decisão');
    const depois = rev.consultar('lac').situacao;
    assert.deepEqual([depois.rotulo, depois.editavel, depois.podeEnviar, depois.podeValidar, depois.podeSolicitarAjustes], ['Em análise', false, false, true, true]);
    assert.deepEqual(validarServicos(raiz).erros, []);
  });
});

test('FR2. Carlos não envia; pendências e revisão divergente bloqueiam o envio; nada muda', async () => {
  await comCopia(async ({ raiz }) => {
    const rev = criarServicoRevisao({ raiz, agora: AGORA });
    const antes = retrato(raiz);
    assert.deepEqual(rev.enviarParaRevisao('lac', { ator: CARLOS, revisao: revisaoDe(rev) }), { ok: false, erro: 'perfil_sem_permissao' });
    const inc = rev.enviarParaRevisao('lac', { ator: MARIA, revisao: revisaoDe(rev) });
    assert.equal(inc.erro, 'revisao_incompleta');
    assert.ok(inc.pendencias.some((p) => p.codigo === 'bloco_pendente'));
    assert.deepEqual(retrato(raiz), antes);
    semPendencias(raiz, rev);
    const meio = retrato(raiz);
    assert.equal(rev.enviarParaRevisao('lac', { ator: MARIA, revisao: 'a'.repeat(64) }).erro, 'revisao_divergente');
    assert.deepEqual(rev.enviarParaRevisao('lac', { revisao: revisaoDe(rev) }), { ok: false, erro: 'ator_ausente' });
    assert.deepEqual(retrato(raiz), meio);
    assert.equal(lerJ(raiz, ...arq('versao.json')).estado, 'rascunho');
  });
});

test('FR3. validação por Carlos: decisão material, responsaveis.validacao e histórico; Maria não valida; validar em rascunho é estado_invalido', async () => {
  await comCopia(async ({ raiz }) => {
    const rev = semPendencias(raiz);
    assert.equal(rev.validarMaterialmente('lac', { ator: CARLOS, revisao: revisaoDe(rev) }).erro, 'estado_invalido', 'ainda em elaboração');
    const e = rev.enviarParaRevisao('lac', { ator: MARIA, revisao: revisaoDe(rev) });
    const antes = retrato(raiz);
    assert.deepEqual(rev.validarMaterialmente('lac', { ator: MARIA, revisao: e.hash }), { ok: false, erro: 'perfil_sem_permissao' });
    assert.deepEqual(retrato(raiz), antes);
    const v = rev.validarMaterialmente('lac', { ator: CARLOS, revisao: e.hash });
    assert.deepEqual(v, { ok: true, versaoId: 'lac-v1', hash: e.hash, estado: 'validado_materialmente' });
    const m = lerJ(raiz, ...arq('versao.json'));
    assert.deepEqual([m.estado, m.responsaveis], ['validado_materialmente', { envio: CADASTRANTE_PUBLICO, validacao: REVISOR_PUBLICO }]);
    const d = decisoes(raiz);
    assert.deepEqual(d.map((x) => [x.id, x.decisao, x.observacao, x.ator]), [[`decisao-lac-v1-${e.hash.slice(0, 16)}`, 'validado_materialmente', null, { ...CARLOS }]]);
    assert.deepEqual(acoes(raiz).slice(-2).map((x) => [x.acao, x.ator.usuarioId]), [['enviar_para_revisao', 'maria-silva'], ['validar_materialmente', 'carlos-silva']]);
    assert.deepEqual(validarServicos(raiz).erros, []);
  });
});

test('FR4. hash em disco divergente: validar e pedir ajustes são recusados (revisão antiga e hash do manifesto) e nada muda', async () => {
  await comCopia(async ({ raiz }) => {
    const { rev, hash } = enviada(raiz);
    // alguém altera o conteúdo congelado direto no disco
    fs.appendFileSync(path.join(raiz, ...arq('roteiro.md')), '\nAlteração externa fictícia.\n');
    const antes = retrato(raiz);
    assert.equal(rev.validarMaterialmente('lac', { ator: CARLOS, revisao: hash }).erro, 'revisao_divergente');
    const atual = revisaoDe(rev);
    assert.notEqual(atual, hash);
    assert.equal(rev.consultar('lac').situacao.podeValidar, false, 'a tela não oferece validar com o hash divergente');
    assert.equal(rev.validarMaterialmente('lac', { ator: CARLOS, revisao: atual }).erro, 'hash_divergente');
    assert.equal(rev.solicitarAjustes('lac', { ator: CARLOS, revisao: atual, motivo: MOTIVO }).erro, 'hash_divergente');
    assert.deepEqual(retrato(raiz), antes);
    assert.deepEqual(decisoes(raiz), []);
  });
});

test('FR5. ajustes com motivo: o motivo fica só na decisão privada; nunca no manifesto, no histórico de ações nem no resultado', async () => {
  await comCopia(async ({ raiz }) => {
    const { rev, hash } = enviada(raiz);
    assert.deepEqual(rev.solicitarAjustes('lac', { ator: MARIA, revisao: hash, motivo: MOTIVO }), { ok: false, erro: 'perfil_sem_permissao' });
    const r = rev.solicitarAjustes('lac', { ator: CARLOS, revisao: hash, motivo: `  ${MOTIVO}  ` });
    assert.deepEqual(r, { ok: true, versaoId: 'lac-v1', hash, estado: 'ajustes_solicitados' });
    assert.doesNotMatch(JSON.stringify(r), /prazo fictício/);
    const m = lerJ(raiz, ...arq('versao.json'));
    assert.deepEqual([m.estado, m.responsaveis], ['ajustes_solicitados', { envio: CADASTRANTE_PUBLICO, ajustes: REVISOR_PUBLICO }]);
    assert.deepEqual(validarVersao(m), []);
    // Motivo: só no arquivo privado de decisões (aparado), em nenhum arquivo de services/ e nunca no histórico de ações.
    const d = decisoes(raiz);
    assert.deepEqual(d.map((x) => [x.decisao, x.observacao, x.ator]), [['ajustes_solicitados', MOTIVO, { ...CARLOS }]]);
    assert.ok(textoDe(raiz, 'data', 'admin-private', 'decisoes', 'lac.jsonl').includes(MOTIVO));
    assert.ok(!textoDe(raiz, 'data', 'admin-private', 'revisao', 'lac.jsonl').includes('prazo fictício'));
    for (const linha of retrato(raiz)) {
      if (!linha.startsWith('F ')) continue;
      const relativo = linha.split(' ')[1];
      assert.ok(!fs.readFileSync(path.join(raiz, relativo), 'utf8').includes('prazo fictício'), relativo);
    }
    assert.deepEqual(acoes(raiz).at(-1).acao, 'solicitar_ajustes');
    // A consulta (GET local) é a única leitura que devolve o motivo, e só em ajustes solicitados.
    const s = rev.consultar('lac').situacao;
    assert.deepEqual([s.rotulo, s.motivoAjustes, s.podeValidar, s.podeSolicitarAjustes, s.editavel], ['Ajustes solicitados', MOTIVO, false, false, false]);
    assert.equal(rev.validarMaterialmente('lac', { ator: CARLOS, revisao: hash }).erro, 'estado_invalido');
    assert.equal(rev.solicitarAjustes('lac', { ator: CARLOS, revisao: hash, motivo: MOTIVO }).erro, 'estado_invalido');
    assert.deepEqual(validarServicos(raiz).erros, []);
  });
});

test('FR6. motivo inválido (vazio, só espaços, mais de 500, e-mail, telefone, CPF, credencial, não texto) → motivo_invalido, sem gravar nada', async () => {
  await comCopia(async ({ raiz }) => {
    const { rev, hash } = enviada(raiz);
    const antes = retrato(raiz);
    const antesPrivado = retrato(raiz, 'data');
    for (const motivo of ['', '   ', ' \t\n ', 'x'.repeat(501), `Fale com ${EMAIL}.`, `Ligue ${TELEFONE}.`, `CPF ${CPF}.`, `Use ${CREDENCIAL}.`, 123, null, undefined, ['lista']]) {
      assert.deepEqual(rev.solicitarAjustes('lac', { ator: CARLOS, revisao: hash, motivo }), { ok: false, erro: 'motivo_invalido' }, JSON.stringify(motivo));
    }
    assert.deepEqual(retrato(raiz), antes);
    assert.deepEqual(retrato(raiz, 'data'), antesPrivado);
    assert.equal(lerJ(raiz, ...arq('versao.json')).estado, 'em_validacao');
    // Exatamente 500 caracteres é aceito.
    assert.equal(rev.solicitarAjustes('lac', { ator: CARLOS, revisao: hash, motivo: 'a'.repeat(500) }).ok, true);
  });
  // A regra pura (decisoes.js) também recusa dado sensível no motivo dos ajustes de um registro novo.
  const { v, h } = ate('em_validacao');
  const r = registrarDecisaoMaterial(v, h, base(v, { id: 'decisao-1', decisao: 'ajustes_solicitados', observacao: `Fale com ${EMAIL}.` }));
  assert.equal(r.erro, 'decisao_invalida');
  assert.equal(registrarDecisaoMaterial(v, h, base(v, { id: 'decisao-1', decisao: 'ajustes_solicitados', observacao: 'Ajuste fictício.' })).ok, true);
});

test('FR7. ajustes → nova versão (Maria) → novo envio: a v1 fica em ajustes solicitados e a v2 segue o fluxo', async () => {
  await comCopia(async ({ raiz }) => {
    const { rev, hash } = enviada(raiz);
    assert.equal(rev.criarNovaVersao('lac', { ator: MARIA }).erro, 'validacao_em_andamento', 'em análise não se cria nova versão');
    assert.equal(rev.solicitarAjustes('lac', { ator: CARLOS, revisao: hash, motivo: MOTIVO }).ok, true);
    assert.deepEqual(rev.criarNovaVersao('lac', { ator: CARLOS }), { ok: false, erro: 'perfil_sem_permissao' });
    const nova = rev.criarNovaVersao('lac', { ator: MARIA });
    assert.deepEqual([nova.ok, nova.versaoId, nova.baseadaEm], [true, 'lac-v2', 'lac-v1']);
    assert.equal(lerJ(raiz, ...arq('versao.json', 1)).estado, 'ajustes_solicitados');
    const s = rev.consultar('lac').situacao;
    assert.deepEqual([s.versaoId, s.rotulo, s.editavel, s.motivoAjustes], ['lac-v2', 'Em elaboração', true, null]);
    semPendencias(raiz, rev);
    const e2 = rev.enviarParaRevisao('lac', { ator: MARIA, revisao: revisaoDe(rev) });
    assert.deepEqual([e2.ok, e2.versaoId, e2.estado], [true, 'lac-v2', 'em_validacao']);
    assert.deepEqual(lerJ(raiz, ...arq('versao.json', 2)).responsaveis, { envio: CADASTRANTE_PUBLICO });
    assert.equal(rev.validarMaterialmente('lac', { ator: CARLOS, revisao: e2.hash }).ok, true);
    assert.deepEqual(validarServicos(raiz).erros, []);
  });
});

test('FR8. falha do histórico desfaz tudo; decisão órfã do mesmo tipo é reaproveitada; de outro tipo, historico_invalido', async () => {
  await comCopia(async ({ raiz }) => {
    const { hash } = enviada(raiz);
    const base0 = retrato(raiz);
    const falhaEm = (trecho) => ({ ...fs, renameSync(o, d) { if (String(d).includes(trecho)) throw new Error('falha injetada'); return fs.renameSync(o, d); } });
    // 1) a decisão não pôde ser gravada: nada fica
    let r = criarServicoRevisao({ raiz, sistema: falhaEm(`${path.sep}decisoes${path.sep}`), agora: AGORA }).solicitarAjustes('lac', { ator: CARLOS, revisao: hash, motivo: MOTIVO });
    assert.deepEqual([r.ok, r.erro, r.revertido], [false, 'historico_indisponivel', true]);
    assert.deepEqual(retrato(raiz), base0);
    assert.deepEqual(decisoes(raiz), []);
    // 2) a decisão foi gravada, a ação não: a base volta; a decisão órfã fica
    r = criarServicoRevisao({ raiz, sistema: falhaEm(`${path.sep}revisao${path.sep}lac.jsonl`), agora: AGORA }).solicitarAjustes('lac', { ator: CARLOS, revisao: hash, motivo: MOTIVO });
    assert.deepEqual([r.ok, r.erro, r.revertido], [false, 'historico_indisponivel', true]);
    assert.deepEqual(retrato(raiz), base0);
    assert.equal(lerJ(raiz, ...arq('versao.json')).estado, 'em_validacao');
    assert.equal(decisoes(raiz).length, 1);
    // 3) decisão órfã de OUTRO tipo (ajustes) com o mesmo id: validar é recusado e nada muda
    const antes = retrato(raiz);
    const antesPrivado = retrato(raiz, 'data');
    assert.equal(criarServicoRevisao({ raiz, agora: AGORA }).validarMaterialmente('lac', { ator: CARLOS, revisao: hash }).erro, 'historico_invalido');
    assert.deepEqual(retrato(raiz), antes);
    assert.deepEqual(retrato(raiz, 'data'), antesPrivado);
    // 4) do mesmo tipo e ator: reaproveitada, sem duplicar. Limitação conhecida (documentada): a nova tentativa, mesmo com OUTRO
    // motivo, reaproveita a decisão órfã e o motivo que fica é o da primeira tentativa.
    const outroMotivo = 'Outro motivo fictício, digitado na segunda tentativa.';
    r = criarServicoRevisao({ raiz, agora: AGORA }).solicitarAjustes('lac', { ator: CARLOS, revisao: hash, motivo: outroMotivo });
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(decisoes(raiz).length, 1, 'a decisão não é duplicada');
    assert.equal(decisoes(raiz)[0].observacao, MOTIVO, 'fica o motivo da primeira tentativa');
    assert.ok(!textoDe(raiz, 'data', 'admin-private', 'decisoes', 'lac.jsonl').includes('segunda tentativa'));
    assert.equal(criarServicoRevisao({ raiz, agora: AGORA }).consultar('lac').situacao.motivoAjustes, MOTIVO, 'a tela mostra o motivo registrado');
    assert.deepEqual(acoes(raiz).at(-1).acao, 'solicitar_ajustes');
  });
});

test('FR9. depois da validação: ajustes recusado; validar → autorizar → publicar continua funcionando; a Cadastrante não valida, autoriza, publica nem revoga', async () => {
  await comCopia(async ({ raiz }) => {
    const { rev, hash } = enviada(raiz);
    const pub = criarServicoPublicacao({ raiz, agora: AGORA });
    assert.deepEqual(pub.autorizar('lac', { ator: CARLOS, revisao: hash }), { ok: false, erro: 'estado_invalido' }, 'em análise não se autoriza');
    assert.equal(rev.validarMaterialmente('lac', { ator: CARLOS, revisao: hash }).ok, true);
    assert.equal(rev.solicitarAjustes('lac', { ator: CARLOS, revisao: hash, motivo: MOTIVO }).erro, 'estado_invalido');
    assert.deepEqual(pub.autorizar('lac', { ator: MARIA, revisao: hash }), { ok: false, erro: 'perfil_sem_permissao' });
    assert.equal(pub.autorizar('lac', { ator: CARLOS, revisao: hash }).ok, true);
    assert.deepEqual(pub.publicar('lac', { ator: MARIA, revisao: hash }), { ok: false, erro: 'perfil_sem_permissao' });
    const p = pub.publicar('lac', { ator: CARLOS, revisao: hash });
    assert.equal(p.ok, true, JSON.stringify(p));
    assert.deepEqual(pub.revogar('lac', { ator: MARIA, revisao: hash, motivo: 'Motivo fictício.' }), { ok: false, erro: 'perfil_sem_permissao' });
    const m = lerJ(raiz, ...arq('versao.json'));
    assert.deepEqual([m.estado, Object.keys(m.responsaveis).sort()], ['publicado', ['autorizacao', 'envio', 'publicacao', 'validacao']]);
    assert.equal(lerJ(raiz, 'services', 'registry.json').servicos.find((s) => s.id === 'lac').versaoPublicadaId, 'lac-v1');
    assert.deepEqual(validarServicos(raiz).erros, []);
  });
});

test('FR10. manifesto: cadastrante só em responsaveis.envio; ajustes só do revisor e só em ajustes solicitados; cada etapa no seu estado', () => {
  const v = ate('em_validacao').v;
  const comEstado = (estado, responsaveis) => ({ ...v, estado, responsaveis });
  assert.deepEqual(validarVersao(comEstado('em_validacao', { envio: CADASTRANTE_PUBLICO })), []);
  assert.deepEqual(validarVersao(comEstado('ajustes_solicitados', { envio: CADASTRANTE_PUBLICO, ajustes: REVISOR_PUBLICO })), []);
  assert.deepEqual(validarVersao(comEstado('validado_materialmente', { envio: CADASTRANTE_PUBLICO, validacao: REVISOR_PUBLICO })), []);
  for (const [estado, responsaveis] of [
    ['validado_materialmente', { validacao: CADASTRANTE_PUBLICO }],
    ['ajustes_solicitados', { ajustes: CADASTRANTE_PUBLICO }],
    ['em_validacao', { envio: REVISOR_PUBLICO }],
    ['em_validacao', { envio: { perfil: 'demonstracao', setor: 'Ambiente local de demonstração' } }],
    ['validado_materialmente', { ajustes: REVISOR_PUBLICO }],
    ['em_validacao', { envio: { ...CADASTRANTE_PUBLICO, usuarioId: 'maria-silva' } }],
  ]) {
    assert.ok(validarVersao(comEstado(estado, responsaveis)).length > 0, JSON.stringify([estado, responsaveis]));
  }
  // Em rascunho não há envio.
  const rascunho = { ...v, estado: 'rascunho', hashConteudo: null, enviadaEm: null, responsaveis: { envio: CADASTRANTE_PUBLICO } };
  assert.ok(validarVersao(rascunho).length > 0);
});

test('FR11. histórico: concluir_revisao só na leitura de registros antigos; nenhuma gravação nova pode usá-lo', async () => {
  assert.deepEqual(ACOES_SO_LEITURA, ['concluir_revisao']);
  const antigo = {
    id: 'acao-000001', tipo: 'acao_revisao', servicoId: 'lac', versaoId: 'lac-v1', hashConteudo: 'a'.repeat(64), acao: 'concluir_revisao',
    dataHora: '2026-11-10T12:00:00.000Z', resultado: 'ok', ator: { ...CARLOS }, itemId: null, itemTipo: null,
  };
  assert.deepEqual(validarAcaoRevisao(antigo), [], 'registro antigo continua legível');
  for (const acao of ['enviar_para_revisao', 'validar_materialmente', 'solicitar_ajustes']) assert.deepEqual(validarAcaoRevisao({ ...antigo, acao }), [], acao);
  await comCopia(async ({ raiz }) => {
    const h = criarHistoricoRevisao({ raiz, agora: AGORA });
    assert.deepEqual(h.registrarAcao('lac', { versaoId: 'lac-v1', hashConteudo: null, acao: 'concluir_revisao', ator: CARLOS }), { ok: false, erro: 'acao_invalida' });
    assert.equal(fs.existsSync(path.join(raiz, 'data')), false, 'nada foi gravado');
    assert.equal(typeof criarServicoRevisao({ raiz }).concluirRevisao, 'undefined', 'a função antiga não existe mais');
  });
});

test('FR12. a LAC real e o armazenamento privado real não foram alterados por nenhum teste deste arquivo', () => {
  assert.deepEqual(retrato(RAIZ), RETRATO_REAL_ANTES);
  assert.deepEqual(retrato(RAIZ, 'data'), RETRATO_DATA_REAL_ANTES);
});
