// Passo 5B3b: editar tema e serviço existentes (regras puras, orquestração e rotas). SEMPRE em cópias temporárias fora do repositório,
// com dados fictícios; a LAC real, o catálogo real e o armazenamento privado real nunca são tocados.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { criarManipuladorAdmin, CABECALHO_TOKEN, ROTA_SESSAO } from '../services/admin/admin-endpoint.js';
import { criarServicoRevisao } from '../services/admin/revisao-servico.js';
import { criarHistoricoRevisao } from '../services/admin/historico-revisao.js';
import { criarEdicaoTema, edicaoDoServicoExigeConfirmacao, editarServicoPuro, editarTemaNoCatalogo, validarCorpoEdicaoServico, validarCorpoEdicaoTema } from '../services/admin/edicao-tema-servico.js';
import { validarServicos } from '../scripts/validate-services.js';
import { MARIA } from './admin-auxiliar.js';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const AGORA = () => new Date(2026, 10, 18, 12, 0, 0);
const FAQ = 'faq-lac-2022';
const NOME_NOVO_TEMA = 'Licenciamento Ambiental e Florestal';
const NOME_NOVO_SERVICO = 'Licença Simplificada por Compromisso';
const REVISAO_FALSA = 'a'.repeat(64);

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
const EXISTIA_DATA = fs.existsSync(path.join(RAIZ, 'data'));

async function enviarBruto(m, { url, method = 'POST', corpo, token, host = 'localhost:5173' } = {}) {
  const comCorpo = method === 'POST' || method === 'PATCH';
  const buffer = comCorpo ? Buffer.from(JSON.stringify(corpo ?? {})) : Buffer.alloc(0);
  const headers = { host };
  if (comCorpo) { headers['content-type'] = 'application/json'; headers['content-length'] = String(buffer.length); }
  if (token !== undefined) headers[CABECALHO_TOKEN] = token;
  const req = Object.assign(Readable.from([buffer]), { url, method, headers, socket: { remoteAddress: '127.0.0.1', localPort: 5173 } });
  let resposta = null;
  const res = { statusCode: 0, setHeader: () => {}, end: (t) => { resposta = t; } };
  await m(req, res, () => {});
  return { status: res.statusCode, corpo: resposta === null ? null : JSON.parse(resposta), bruto: resposta ?? '' };
}

// Passo 8C (ajuste mecânico, só troca de usuário): concluir, autorizar, publicar e revogar são do Revisor. Nestes testes o token
// é fixo (TOKEN_FIXO) e, antes dessas rotas, a sessão passa a Carlos Silva; depois volta a Maria Silva. As verificações não mudam.
const TOKEN_FIXO = 'c'.repeat(64);
const ROTA_DO_REVISOR = /\/(revisao\/concluir|autorizacao|publicacao|revogacao)$/;
const entrarComo = (m, usuarioId) => enviarBruto(m, { url: ROTA_SESSAO, corpo: { usuarioId } });
async function enviar(m, opcoes = {}) {
  const { method = 'POST' } = opcoes;
  if (method !== 'POST' || opcoes.token === undefined || !ROTA_DO_REVISOR.test(opcoes.url ?? '')) return enviarBruto(m, opcoes);
  await entrarComo(m, 'carlos-silva');
  try {
    return await enviarBruto(m, opcoes);
  } finally {
    await entrarComo(m, 'maria-silva');
  }
}

// Passo 8B: o token só existe depois de escolher um usuário selecionável (POST /__admin/sessao).
const obterToken = async (m) => (await enviar(m, { url: ROTA_SESSAO, corpo: { usuarioId: 'maria-silva' } })).corpo.token;
const lerJ = (raiz, ...p) => JSON.parse(fs.readFileSync(path.join(raiz, ...p), 'utf8'));
const gravarJ = (raiz, p, d) => fs.writeFileSync(path.join(raiz, ...p), `${JSON.stringify(d, null, 2)}\n`);
const arq = (nome) => ['services', 'lac', 'versoes', 'v1', nome];
const bloco = (id, fonteIds, extra = {}) => ({
  id, tipo: 'conhecimento', titulo: `Informação ${id}`, texto: 'Texto fictício de orientação.', fonteIds,
  referencias: fonteIds.map((f) => ({ fonteId: f, localizacao: 'página 1' })), origem: 'fonte', ambiente: 'publico',
  statusValidacao: 'rascunho', publicado: false, revisaoAtualidade: 'pendente', criadoEm: '2026-11-10', atualizadoEm: '2026-11-10', ...extra,
});
const aceito = { statusValidacao: 'validado', revisaoAtualidade: 'concluida' };

/** LAC de teste (cópia): por padrão, um bloco ACEITO e um em elaboração; `blocos: []` deixa a versão sem informações de conhecimento. */
async function comCopia(fn, { blocos = [bloco('bc-aceito', [FAQ], aceito), bloco('bc-novo', [FAQ])], opcoes = {} } = {}) {
  const pai = fs.mkdtempSync(path.join(os.tmpdir(), 'sema-orienta-edicao-ts-'));
  const raiz = path.join(pai, 'raiz');
  fs.mkdirSync(raiz);
  fs.cpSync(path.join(RAIZ, 'services'), path.join(raiz, 'services'), { recursive: true });
  const c = lerJ(raiz, ...arq('conteudo-assistente.json'));
  c.blocos.push(...blocos);
  gravarJ(raiz, arq('conteudo-assistente.json'), c);
  assert.deepEqual(validarServicos(raiz).erros, [], 'a LAC de teste precisa ser válida');
  try {
    const m = criarManipuladorAdmin({ raiz, agora: AGORA, diretorioTemporario: pai, gerarToken: () => TOKEN_FIXO, ...opcoes });
    const token = await obterToken(m);
    const ctx = {
      m, token, raiz, pai,
      lerTema: (id) => enviar(m, { url: `/__admin/temas/${id}/edicao`, method: 'GET', token }),
      editarTema: (id, corpo) => enviar(m, { url: `/__admin/temas/${id}/edicao`, method: 'PATCH', corpo, token }),
      lerServico: (id = 'lac') => enviar(m, { url: `/__admin/servicos/${id}/edicao`, method: 'GET', token }),
      editarServico: (corpo, id = 'lac') => enviar(m, { url: `/__admin/servicos/${id}/edicao`, method: 'PATCH', corpo, token }),
      post: (url, corpo) => enviar(m, { url, corpo, token }),
      situacao: async () => (await enviar(m, { url: '/__admin/servicos/lac/revisao', method: 'GET', token })).corpo,
      criarTema: async (nome) => (await enviar(m, { url: '/__admin/assuntos', corpo: { nome }, token })).corpo.assunto,
      criarServico: async (nome, temaId) => (await enviar(m, { url: '/__admin/servico-com-tema', corpo: { nome, tema: { id: temaId } }, token })).corpo.servico,
    };
    await fn(ctx);
  } finally {
    fs.rmSync(pai, { recursive: true, force: true });
  }
}
const historicoDeTemas = (raiz) => {
  const p = path.join(raiz, 'data', 'admin-private', 'temas', 'historico.jsonl');
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
};

// ---------- Regras puras ----------

test('TS1. corpos: tema exige revisão, nome e confirmação; serviço aceita só nome, tema, revisão e confirmação; nunca id', () => {
  const ok = validarCorpoEdicaoTema({ revisao: REVISAO_FALSA, nome: '  Novo   nome ', confirmado: true });
  assert.deepEqual(ok, { ok: true, dados: { revisao: REVISAO_FALSA, nome: 'Novo nome' } });
  for (const [corpo, campo] of [[{ revisao: REVISAO_FALSA, nome: 'X' }, 'confirmacao'], [{ revisao: REVISAO_FALSA, nome: '', confirmado: true }, 'nome'], [{ revisao: REVISAO_FALSA, nome: '123', confirmado: true }, 'nome'],
    [{ revisao: 'x', nome: 'Y', confirmado: true }, 'revisao'], [{ revisao: REVISAO_FALSA, nome: 'Y', confirmado: true, id: 'outro' }, 'extras'], [{ revisao: REVISAO_FALSA, nome: 'senha: abc1234', confirmado: true }, 'nome'],
    [{ revisao: REVISAO_FALSA, nome: 'fale com ana' + '@' + 'exemplo.test', confirmado: true }, 'nome']]) {
    const r = validarCorpoEdicaoTema(corpo);
    assert.equal(r.ok, false, JSON.stringify(corpo));
    assert.ok(r.campos.includes(campo), `${JSON.stringify(corpo)} -> ${r.campos}`);
  }
  assert.equal(validarCorpoEdicaoTema(null).ok, false);
  assert.deepEqual(validarCorpoEdicaoServico({ revisao: REVISAO_FALSA, nome: 'Novo' }), { ok: true, dados: { revisao: REVISAO_FALSA, confirmado: false, nome: 'Novo' } });
  assert.equal(validarCorpoEdicaoServico({ revisao: REVISAO_FALSA, temaId: 'tema-x', confirmado: true }).ok, true);
  for (const [corpo, campo] of [[{ revisao: REVISAO_FALSA }, 'nada_a_alterar'], [{ revisao: REVISAO_FALSA, nome: 'A', id: 'x' }, 'extras'], [{ revisao: REVISAO_FALSA, nome: 'A', sigla: 'S' }, 'extras'],
    [{ revisao: REVISAO_FALSA, temaId: 'Tema X' }, 'tema'], [{ revisao: REVISAO_FALSA, nome: 'A', confirmado: 'sim' }, 'confirmacao'], [{ nome: 'A' }, 'revisao']]) {
    const r = validarCorpoEdicaoServico(corpo);
    assert.equal(r.ok, false, JSON.stringify(corpo));
    assert.ok(r.campos.includes(campo), `${JSON.stringify(corpo)} -> ${r.campos}`);
  }
});

test('TS2. editarTemaNoCatalogo: só o nome muda; id intacto; duplicado sem acento nem caixa recusado; nada a alterar; entrada não é modificada', () => {
  const doc = { versaoEstrutura: 1, assuntos: [
    { id: 'tema-a', nome: 'Água e Solo', ativo: true, criadoEm: '2026-11-09', atualizadoEm: '2026-11-09' },
    { id: 'tema-b', nome: 'Fauna', ativo: false, criadoEm: '2026-11-09', atualizadoEm: '2026-11-09' }] };
  const copia = structuredClone(doc);
  const r = editarTemaNoCatalogo(doc, 'tema-a', 'Águas e Solos', '2026-11-18');
  assert.equal(r.ok, true);
  assert.deepEqual(r.assuntos.assuntos[0], { id: 'tema-a', nome: 'Águas e Solos', ativo: true, criadoEm: '2026-11-09', atualizadoEm: '2026-11-18' });
  assert.deepEqual(r.assuntos.assuntos[1], doc.assuntos[1]);
  assert.deepEqual(doc, copia);
  assert.equal(editarTemaNoCatalogo(doc, 'tema-a', '  FAUNA ', '2026-11-18').erro, 'nome_duplicado', 'compara também com tema inativo');
  const grafia = editarTemaNoCatalogo(doc, 'tema-a', 'agua  e solo', '2026-11-18');
  assert.deepEqual([grafia.ok, grafia.assuntos.assuntos[0].nome], [true, 'agua e solo'], 'o próprio tema pode mudar só a grafia; espaços repetidos são reduzidos');
  assert.equal(editarTemaNoCatalogo(doc, 'tema-a', 'Água e Solo', '2026-11-18').erro, 'nada_a_alterar');
  assert.equal(editarTemaNoCatalogo(doc, 'nao-existe', 'X Y', '2026-11-18').erro, 'tema_nao_encontrado');
  assert.equal(editarTemaNoCatalogo(doc, 'tema-a', '', '2026-11-18').erro, 'dados_invalidos');
  assert.equal(editarTemaNoCatalogo(doc, 'tema-a', 'Novo', 'data').erro, 'dados_invalidos');
});

test('TS3. editarServicoPuro: reabre todas as informações aceitas (critério conservador), id e sigla intactos, categoria só se o tema mudar', () => {
  const contexto = {
    service: { id: 'svc', nome: 'Serviço A', sigla: 'SA', assuntoId: 'tema-a', categoria: 'tema a', publicado: false },
    conteudoAssistente: { blocos: [
      { id: 'b1', tipo: 'conhecimento', titulo: 'Aceita', statusValidacao: 'validado', revisaoAtualidade: 'concluida', publicado: false, criadoEm: '2026-11-10' },
      { id: 'b2', tipo: 'conhecimento', titulo: 'Em elaboração', statusValidacao: 'rascunho', revisaoAtualidade: 'pendente', publicado: false, criadoEm: '2026-11-10' },
      { id: 'b3', tipo: 'descricao', titulo: 'Bloco de teste', statusValidacao: 'validado' }] },
    entradaRegistro: { id: 'svc', assuntoId: 'tema-a', publicado: false },
    assuntos: { assuntos: [{ id: 'tema-a', nome: 'Tema A', ativo: true }, { id: 'tema-b', nome: 'Tema B', ativo: true }, { id: 'tema-c', nome: 'Tema C', ativo: false }] },
    nomesOutros: ['Serviço Z'],
  };
  const copia = structuredClone(contexto);
  const so = editarServicoPuro(contexto, { nome: 'Serviço Novo' }, '2026-11-18');
  assert.deepEqual([so.ok, so.temaMudou, so.nomeMudou, so.blocosReabertos, so.entradaRegistro], [true, false, true, ['Aceita'], undefined]);
  assert.deepEqual([so.service.id, so.service.sigla, so.service.assuntoId, so.service.categoria, so.service.publicado], ['svc', 'SA', 'tema-a', 'tema a', false]);
  assert.deepEqual(so.conteudoAssistente.blocos.map((b) => b.statusValidacao), ['rascunho', 'rascunho', 'validado'], 'o bloco que não é de conhecimento não muda');
  assert.deepEqual(so.conteudoAssistente.blocos[0], { id: 'b1', tipo: 'conhecimento', titulo: 'Aceita', statusValidacao: 'rascunho', revisaoAtualidade: 'pendente', publicado: false, criadoEm: '2026-11-10', atualizadoEm: '2026-11-18' });
  const mover = editarServicoPuro(contexto, { temaId: 'tema-b' }, '2026-11-18');
  assert.deepEqual([mover.ok, mover.temaMudou, mover.nomeMudou, mover.service.assuntoId, mover.service.categoria, mover.entradaRegistro.assuntoId], [true, true, false, 'tema-b', 'tema b', 'tema-b']);
  assert.equal(editarServicoPuro(contexto, { nome: ' serviço   z ' }, '2026-11-18').erro, 'nome_duplicado');
  assert.equal(editarServicoPuro(contexto, { temaId: 'tema-c' }, '2026-11-18').erro, 'tema_invalido', 'tema inativo');
  assert.equal(editarServicoPuro(contexto, { temaId: 'tema-x' }, '2026-11-18').erro, 'tema_invalido');
  assert.equal(editarServicoPuro(contexto, { nome: 'Serviço A', temaId: 'tema-a' }, '2026-11-18').erro, 'nada_a_alterar');
  assert.equal(editarServicoPuro(contexto, { nome: '' }, '2026-11-18').erro, 'dados_invalidos');
  assert.deepEqual(contexto, copia, 'a entrada não é modificada');
  assert.deepEqual([edicaoDoServicoExigeConfirmacao(false, 0), edicaoDoServicoExigeConfirmacao(true, 0), edicaoDoServicoExigeConfirmacao(false, 2)], [false, true, true]);
});

// ---------- Tema pelas rotas ----------

test('TS4. tema: lê nome e serviços afetados (sem ids), edita só o nome com confirmação; id, demais dados, serviços e LAC intactos; histórico sem o nome', async () => {
  await comCopia(async ({ lerTema, editarTema, raiz }) => {
    const antesServicos = retrato(raiz).filter((l) => !l.includes('assuntos.json'));
    const antesDoc = lerJ(raiz, 'services', 'assuntos.json');
    const l = await lerTema('licenciamento-ambiental');
    assert.equal(l.status, 200, l.bruto);
    assert.deepEqual([l.corpo.nome, l.corpo.servicos], ['Licenciamento Ambiental', ['Licença por Adesão e Compromisso']]);
    assert.deepEqual(Object.keys(l.corpo).sort(), ['nome', 'revisao', 'servicos']);
    assert.match(l.corpo.revisao, /^[0-9a-f]{64}$/);
    assert.ok(!l.bruto.includes('licenciamento-ambiental') && !l.bruto.includes('"id"'), 'nenhum id na resposta');
    const r = await editarTema('licenciamento-ambiental', { revisao: l.corpo.revisao, nome: NOME_NOVO_TEMA, confirmado: true });
    assert.equal(r.status, 200, r.bruto);
    assert.match(r.corpo.revisao, /^[0-9a-f]{64}$/);
    assert.notEqual(r.corpo.revisao, l.corpo.revisao);
    const depois = lerJ(raiz, 'services', 'assuntos.json');
    assert.deepEqual(depois.assuntos[0], { ...antesDoc.assuntos[0], nome: NOME_NOVO_TEMA, atualizadoEm: '2026-11-18' });
    assert.equal(depois.assuntos.length, 1);
    assert.deepEqual(retrato(raiz).filter((x) => !x.includes('assuntos.json')), antesServicos, 'só o catálogo foi gravado');
    assert.deepEqual(validarServicos(raiz).erros, []);
    const h = historicoDeTemas(raiz);
    assert.equal(h.length, 1);
    assert.deepEqual([h[0].acao, h[0].itemTipo, h[0].itemId, h[0].resultado, h[0].ator], ['editar_tema', 'tema', 'licenciamento-ambiental', 'ok', { ...MARIA }]);
    assert.deepEqual(Object.keys(h[0]).sort(), ['acao', 'ator', 'dataHora', 'id', 'itemId', 'itemTipo', 'resultado', 'tipo']);
    assert.ok(!JSON.stringify(h).includes('Florestal') && !JSON.stringify(h).includes('Licenciamento Ambiental'), 'o histórico não guarda nomes');
    const lido = await lerTema('licenciamento-ambiental');
    assert.equal(lido.corpo.nome, NOME_NOVO_TEMA);
  });
});

test('TS5. tema: recusas (sem confirmação, vazio, duplicado, extras, revisão divergente, inexistente, sem token, sem alteração) não alteram nada', async () => {
  await comCopia(async ({ lerTema, editarTema, criarTema, raiz, m }) => {
    const outro = await criarTema('Recursos Hídricos');
    assert.ok(outro && outro.id);
    const antes = retrato(raiz);
    const { revisao } = (await lerTema('licenciamento-ambiental')).corpo;
    const base = { revisao, nome: NOME_NOVO_TEMA, confirmado: true };
    const antesRevisao = retrato(raiz);
    const semConfirmar = await editarTema('licenciamento-ambiental', { revisao, nome: NOME_NOVO_TEMA });
    assert.deepEqual([semConfirmar.status, semConfirmar.corpo.campos], [422, ['confirmacao']]);
    assert.deepEqual((await editarTema('licenciamento-ambiental', { ...base, confirmado: false })).corpo.campos, ['confirmacao']);
    assert.deepEqual((await editarTema('licenciamento-ambiental', { ...base, nome: '   ' })).corpo.campos, ['nome']);
    assert.equal((await editarTema('licenciamento-ambiental', { ...base, id: 'outro' })).status, 422);
    assert.equal((await editarTema('licenciamento-ambiental', { ...base, ativo: false })).status, 422);
    for (const nome of ['recursos hidricos', 'RECURSOS   HÍDRICOS']) {
      const dup = await editarTema('licenciamento-ambiental', { ...base, nome });
      assert.deepEqual([dup.status, dup.corpo], [409, { erro: 'ja_existe', campo: 'nome' }], nome);
    }
    assert.equal((await editarTema('licenciamento-ambiental', { ...base, revisao: REVISAO_FALSA })).corpo.erro, 'revisao_divergente');
    assert.equal((await editarTema('licenciamento-ambiental', { ...base, nome: 'Licenciamento Ambiental' })).status, 422);
    assert.equal((await editarTema('nao-existe', base)).status, 404);
    assert.equal((await lerTema('nao-existe')).status, 404);
    assert.deepEqual(retrato(raiz), antesRevisao);
    assert.ok(antes.length > 0);
    assert.equal((await enviar(m, { url: '/__admin/temas/licenciamento-ambiental/edicao', method: 'PATCH', corpo: base })).status, 401);
    assert.equal((await enviar(m, { url: '/__admin/temas/licenciamento-ambiental/edicao', method: 'POST', corpo: base, token: 'a'.repeat(64) })).status, 405);
    assert.deepEqual(historicoDeTemas(raiz), []);
    // revisão divergente de verdade: o catálogo muda (outro tema) depois da leitura
    const l2 = (await lerTema('licenciamento-ambiental')).corpo.revisao;
    await criarTema('Fauna Silvestre');
    assert.equal((await editarTema('licenciamento-ambiental', { revisao: l2, nome: NOME_NOVO_TEMA, confirmado: true })).corpo.erro, 'revisao_divergente');
    assert.equal(lerJ(raiz, 'services', 'assuntos.json').assuntos[0].nome, 'Licenciamento Ambiental');
  });
});

test('TS6. trava comum: com uma gravação em andamento, a edição de tema recebe 409 operacao_em_andamento e nada é perdido', async () => {
  let liberar;
  const portao = new Promise((r) => { liberar = r; });
  let entrou;
  const aviso = new Promise((r) => { entrou = r; });
  let primeira = true;
  const antesDeGravar = async () => { if (primeira) { primeira = false; entrou(); await portao; } };
  await comCopia(async ({ lerTema, editarTema, editarServico, lerServico, raiz }) => {
    const t = (await lerTema('licenciamento-ambiental')).corpo.revisao;
    const s = (await lerServico()).corpo.revisao;
    const p1 = editarTema('licenciamento-ambiental', { revisao: t, nome: NOME_NOVO_TEMA, confirmado: true });
    await aviso;
    const r2 = await editarTema('licenciamento-ambiental', { revisao: t, nome: 'Outro nome', confirmado: true });
    const r3 = await editarServico({ revisao: s, nome: NOME_NOVO_SERVICO });
    assert.deepEqual([r2.status, r2.corpo, r3.status, r3.corpo], [409, { erro: 'operacao_em_andamento' }, 409, { erro: 'operacao_em_andamento' }]);
    liberar();
    assert.equal((await p1).status, 200);
    assert.equal(lerJ(raiz, 'services', 'assuntos.json').assuntos[0].nome, NOME_NOVO_TEMA);
    assert.equal(lerJ(raiz, ...arq('service.json')).nome, 'Licença por Adesão e Compromisso');
  }, { opcoes: { antesDeGravar } });
});

test('TS7. tema: falha em cada gravação (e conferência recusada, e histórico) desfaz o catálogo e não registra a ação', async () => {
  await comCopia(async ({ raiz }) => {
    const antes = retrato(raiz);
    const base = criarEdicaoTema({ raiz, agora: AGORA });
    const lida = base.ler('licenciamento-ambiental');
    assert.equal(lida.ok, true);
    const pedido = { revisao: lida.revisao, nome: NOME_NOVO_TEMA };
    let total = 0;
    const contar = { ...fs, renameSync(o, d) { total += 1; return fs.renameSync(o, d); } };
    const ensaio = criarEdicaoTema({ raiz, sistema: contar, agora: AGORA, verificarFinal: () => ['recusado'] }).editar('licenciamento-ambiental', { ...pedido, ator: MARIA });
    assert.equal(ensaio.ok, false, JSON.stringify(ensaio));
    assert.ok(total >= 2, `gravações contadas: ${total}`);
    assert.deepEqual(retrato(raiz), antes);
    for (let k = 1; k <= total / 2 + 1; k += 1) { // o catálogo e, depois, o histórico (última etapa)
      let n = 0;
      const sistema = { ...fs, renameSync(o, d) { n += 1; if (n === k) throw new Error('falha injetada'); return fs.renameSync(o, d); } };
      const r = criarEdicaoTema({ raiz, sistema, agora: AGORA }).editar('licenciamento-ambiental', { ...pedido, ator: MARIA });
      assert.equal(r.ok, false, `falha no ponto ${k}`);
      assert.deepEqual(retrato(raiz), antes, `catálogo alterado no ponto ${k}`);
      assert.equal(lerJ(raiz, 'services', 'assuntos.json').assuntos[0].nome, 'Licenciamento Ambiental');
    }
    assert.deepEqual(historicoDeTemas(raiz), []);
    assert.deepEqual(validarServicos(raiz).erros, []);
    // sem falha: grava
    assert.equal(base.editar('licenciamento-ambiental', { ...pedido, ator: MARIA }).ok, true);
    assert.equal(historicoDeTemas(raiz).length, 1);
  });
});

// ---------- Serviço pelas rotas ----------

test('TS8. serviço: lê nome, tema e informações aceitas; edita o nome com confirmação, reabre as informações aceitas e mantém id, sigla e publicado falso', async () => {
  await comCopia(async ({ lerServico, editarServico, raiz }) => {
    const antes = lerJ(raiz, ...arq('service.json'));
    const regAntes = lerJ(raiz, 'services', 'registry.json');
    const l = await lerServico();
    assert.equal(l.status, 200, l.bruto);
    assert.deepEqual([l.corpo.nome, l.corpo.temaId, l.corpo.informacoesAceitas], ['Licença por Adesão e Compromisso', 'licenciamento-ambiental', ['Informação bc-aceito']]);
    // o servidor exige a confirmação quando há informação aceita
    const sem = await editarServico({ revisao: l.corpo.revisao, nome: NOME_NOVO_SERVICO });
    assert.deepEqual([sem.status, sem.corpo.campos], [422, ['confirmacao']]);
    assert.equal(lerJ(raiz, ...arq('service.json')).nome, antes.nome);
    const r = await editarServico({ revisao: l.corpo.revisao, nome: NOME_NOVO_SERVICO, confirmado: true });
    assert.equal(r.status, 200, r.bruto);
    assert.deepEqual([r.corpo.blocosReabertos, typeof r.corpo.revisao], [1, 'string']);
    const s = lerJ(raiz, ...arq('service.json'));
    assert.deepEqual({ ...s, nome: antes.nome }, antes, 'só o nome mudou');
    assert.equal(s.nome, NOME_NOVO_SERVICO);
    assert.deepEqual([s.id, s.sigla, s.publicado, s.statusValidacao], [antes.id, antes.sigla, false, antes.statusValidacao]);
    assert.deepEqual(lerJ(raiz, 'services', 'registry.json'), regAntes, 'o registro não muda quando o tema é o mesmo');
    const blocos = lerJ(raiz, ...arq('conteudo-assistente.json')).blocos;
    const aceitoDepois = blocos.find((b) => b.id === 'bc-aceito');
    assert.deepEqual([aceitoDepois.statusValidacao, aceitoDepois.revisaoAtualidade, aceitoDepois.publicado, aceitoDepois.atualizadoEm], ['rascunho', 'pendente', false, '2026-11-18']);
    assert.deepEqual(blocos.find((b) => b.id === 'bc-novo').statusValidacao, 'rascunho');
    assert.deepEqual(validarServicos(raiz).erros, []);
    const h = criarHistoricoRevisao({ raiz }).listarAcoes('lac').registros;
    assert.deepEqual(h.map((x) => [x.acao, x.itemTipo, x.itemId]), [['editar_servico', 'servico', 'lac']]);
    assert.ok(!JSON.stringify(h).includes('Simplificada'), 'o histórico não guarda o nome');
    const l2 = await lerServico();
    assert.deepEqual([l2.corpo.nome, l2.corpo.informacoesAceitas], [NOME_NOVO_SERVICO, []]);
  });
});

test('TS9. serviço sem informação aceita: nome muda sem confirmação; tema novo muda registro, service.json e categoria e exige confirmação', async () => {
  await comCopia(async ({ lerServico, editarServico, criarTema, raiz }) => {
    let l = await lerServico();
    assert.deepEqual(l.corpo.informacoesAceitas, []);
    assert.equal((await editarServico({ revisao: l.corpo.revisao, nome: NOME_NOVO_SERVICO })).status, 200, 'sem informações aceitas não precisa confirmar');
    const tema = await criarTema('Recursos Hídricos');
    l = await lerServico();
    const sem = await editarServico({ revisao: l.corpo.revisao, temaId: tema.id });
    assert.deepEqual([sem.status, sem.corpo.campos], [422, ['confirmacao']], 'mover para outro tema exige confirmação');
    assert.equal(lerJ(raiz, 'services', 'registry.json').servicos[0].assuntoId, 'licenciamento-ambiental');
    const r = await editarServico({ revisao: l.corpo.revisao, temaId: tema.id, confirmado: true });
    assert.equal(r.status, 200, r.bruto);
    const reg = lerJ(raiz, 'services', 'registry.json').servicos[0];
    const s = lerJ(raiz, ...arq('service.json'));
    assert.deepEqual([reg.assuntoId, s.assuntoId, s.categoria, reg.publicado, reg.versaoPublicadaId, reg.id], [tema.id, tema.id, 'recursos hídricos', false, null, 'lac']);
    assert.deepEqual(validarServicos(raiz).erros, []);
    // o tema antigo deixou de listar o serviço e o novo passou a listar
    assert.deepEqual((await enviarLerTema(raiz, tema.id)).servicos, [NOME_NOVO_SERVICO]);
  }, { blocos: [] });
});

async function enviarLerTema(raiz, temaId) {
  const r = criarEdicaoTema({ raiz, agora: AGORA }).ler(temaId);
  assert.equal(r.ok, true);
  return r.edicao;
}

test('TS10. serviço: recusas (nome repetido, vazio, tema inexistente ou inativo, extras, id, revisão divergente, sem alteração, outro serviço inexistente) não alteram nada', async () => {
  await comCopia(async ({ lerServico, editarServico, criarTema, criarServico, raiz }) => {
    const tema = await criarTema('Recursos Hídricos');
    const outro = await criarServico('Outorga de Água', tema.id);
    assert.ok(outro && outro.id);
    const antes = retrato(raiz);
    const { revisao } = (await lerServico()).corpo;
    for (const nome of ['outorga de agua', ' OUTORGA   DE ÁGUA ']) {
      const dup = await editarServico({ revisao, nome, confirmado: true });
      assert.deepEqual([dup.status, dup.corpo], [409, { erro: 'ja_existe', campo: 'nome' }], nome);
    }
    assert.deepEqual((await editarServico({ revisao, nome: '', confirmado: true })).corpo.campos, ['nome']);
    assert.deepEqual((await editarServico({ revisao, temaId: 'tema-que-nao-existe', confirmado: true })).corpo.campos, ['tema']);
    assert.equal((await editarServico({ revisao, nome: 'X novo', id: 'outro' })).status, 422);
    assert.equal((await editarServico({ revisao, nome: 'X novo', sigla: 'ZZ' })).status, 422);
    assert.equal((await editarServico({ revisao, nome: 'X novo', publicado: true })).status, 422);
    assert.equal((await editarServico({ revisao })).status, 422);
    assert.equal((await editarServico({ revisao: REVISAO_FALSA, nome: 'X novo', confirmado: true })).corpo.erro, 'revisao_divergente');
    assert.deepEqual((await editarServico({ revisao, nome: 'Licença por Adesão e Compromisso', confirmado: true })).corpo.campos, ['nada_a_alterar']);
    assert.equal((await editarServico({ revisao, nome: 'X novo', confirmado: true }, 'nao-existe')).status, 404);
    assert.equal((await lerServico('nao-existe')).status, 404);
    assert.deepEqual(retrato(raiz), antes);
    // tema inativo
    const doc = lerJ(raiz, 'services', 'assuntos.json');
    doc.assuntos.find((a) => a.id === tema.id).ativo = false;
    gravarJ(raiz, ['services', 'assuntos.json'], doc);
    const rev2 = (await lerServico()).corpo.revisao;
    assert.deepEqual((await editarServico({ revisao: rev2, temaId: tema.id, confirmado: true })).corpo.campos, ['tema']);
    assert.equal(lerJ(raiz, 'services', 'registry.json').servicos[0].assuntoId, 'licenciamento-ambiental');
  });
});

test('TS11. serviço com versão concluída: GET e PATCH recusados com 409 versao_congelada; nova versão permite editar e a anterior fica intacta', async () => {
  await comCopia(async ({ lerServico, editarServico, post, situacao, raiz }) => {
    let s = await situacao();
    // conclui: aceita o bloco em elaboração (a FAQ já está validada) e conclui a revisão
    assert.equal((await post('/__admin/servicos/lac/revisao/blocos/aceitar', { blocoId: 'bc-novo', revisao: s.revisao })).status, 200);
    s = await situacao();
    assert.equal((await post('/__admin/servicos/lac/revisao/concluir', { revisao: s.revisao })).status, 200);
    s = await situacao();
    const v1 = retrato(raiz).filter((l) => l.includes(`v1${path.sep}`));
    const regAntes = lerJ(raiz, 'services', 'registry.json');
    const lido = await lerServico();
    assert.deepEqual([lido.status, lido.corpo.erro], [409, 'versao_congelada']);
    const r = await editarServico({ revisao: s.revisao, nome: NOME_NOVO_SERVICO, confirmado: true });
    assert.deepEqual([r.status, r.corpo.erro], [409, 'versao_congelada']);
    assert.deepEqual(retrato(raiz).filter((l) => l.includes(`v1${path.sep}`)), v1);
    assert.deepEqual(lerJ(raiz, 'services', 'registry.json'), regAntes);
    assert.equal((await post('/__admin/servicos/lac/nova-versao', {})).status, 201);
    const l2 = await lerServico();
    assert.equal(l2.status, 200, l2.bruto);
    const e = await editarServico({ revisao: l2.corpo.revisao, nome: NOME_NOVO_SERVICO, confirmado: true });
    assert.equal(e.status, 200, e.bruto);
    assert.deepEqual(retrato(raiz).filter((l) => l.includes(`v1${path.sep}`)), v1, 'a versão anterior continua intacta');
    assert.equal(lerJ(raiz, 'services', 'lac', 'versoes', 'v2', 'service.json').nome, NOME_NOVO_SERVICO);
    assert.equal(lerJ(raiz, ...arq('service.json')).nome, 'Licença por Adesão e Compromisso');
    assert.deepEqual(validarServicos(raiz).erros, []);
  });
});

test('TS12. serviço: falha em cada gravação (service.json, informações, registro, histórico) ou conferência recusada desfaz tudo', async () => {
  await comCopia(async ({ raiz, criarTema }) => {
    const tema = await criarTema('Recursos Hídricos');
    const antes = retrato(raiz);
    const rev = criarServicoRevisao({ raiz, agora: AGORA });
    const revisao = rev.consultar('lac').situacao.revisao;
    const pedido = { revisao, nome: NOME_NOVO_SERVICO, temaId: tema.id, confirmado: true };
    let total = 0;
    const contar = { ...fs, renameSync(o, d) { total += 1; return fs.renameSync(o, d); } };
    const ensaio = criarServicoRevisao({ raiz, sistema: contar, agora: AGORA, verificarFinal: () => ['recusado'] }).editarServico('lac', { ...pedido, ator: MARIA });
    assert.equal(ensaio.ok, false, JSON.stringify(ensaio));
    assert.equal(ensaio.revertido, true);
    // service.json, informações e registro: 3 gravações, cada uma desfeita por uma restauração
    assert.ok(total >= 6 && total % 2 === 0, `gravações contadas: ${total}`);
    assert.deepEqual(retrato(raiz), antes);
    for (let k = 1; k <= total / 2 + 1; k += 1) {
      let n = 0;
      const sistema = { ...fs, renameSync(o, d) { n += 1; if (n === k) throw new Error('falha injetada'); return fs.renameSync(o, d); } };
      const r = criarServicoRevisao({ raiz, sistema, agora: AGORA }).editarServico('lac', { ...pedido, ator: MARIA });
      assert.deepEqual([r.ok, r.revertido], [false, true], `falha no ponto ${k}`);
      assert.deepEqual(retrato(raiz), antes, `base alterada no ponto ${k}`);
    }
    assert.equal(criarHistoricoRevisao({ raiz }).listarAcoes('lac').registros.length, 0);
    assert.deepEqual(validarServicos(raiz).erros, []);
    assert.equal(criarServicoRevisao({ raiz, agora: AGORA }).editarServico('lac', { ...pedido, ator: MARIA }).ok, true);
    assert.deepEqual(validarServicos(raiz).erros, []);
  });
});

test('TS13. a LAC real, o catálogo real e o histórico real continuam intactos; nada foi publicado', async () => {
  assert.deepEqual(retrato(RAIZ), RETRATO_REAL_ANTES);
  assert.equal(fs.existsSync(path.join(RAIZ, 'data')), EXISTIA_DATA);
  assert.deepEqual(validarServicos(RAIZ).erros, []);
  assert.deepEqual(lerJ(RAIZ, 'services', 'assuntos.json').assuntos.map((a) => a.nome), ['Licenciamento Ambiental']);
  const reg = lerJ(RAIZ, 'services', 'registry.json').servicos[0];
  assert.deepEqual([reg.publicado, reg.versaoPublicadaId], [false, null]);
});
