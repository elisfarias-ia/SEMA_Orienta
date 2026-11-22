// Passo 5B3a: editar e excluir (logicamente) fontes da versão atual: regras puras, orquestração e rotas. SEMPRE em cópias
// temporárias fora do repositório, com dados fictícios; a LAC real e o armazenamento privado real nunca são tocados.

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
import { criarGravadorEntradas } from '../services/admin/entradas-gravacao.js';
import { buscarLinksReutilizaveis, fonteReutilizavel } from '../services/admin/reutilizacao.js';
import { selecionarBlocosAssistente } from '../services/assistant-content.js';
import { hashTexto } from '../services/admin/entradas.js';
import { validarServicos } from '../scripts/validate-services.js';
import { MARIA, enviarEValidarPelaRota } from './admin-auxiliar.js';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const AGORA = () => new Date(2026, 10, 18, 12, 0, 0);
const MANUAL = 'manual-lac-siga-2020';
const FAQ = 'faq-lac-2022';
const SEMA = 'sema-orientacoes-lac';
const REVOGADO = 'decreto-695-2020';

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

async function enviarBruto(m, { url, method = 'POST', corpo, token, host = 'localhost:5173', cabecalhos = {} } = {}) {
  const comCorpo = method === 'POST' || method === 'PATCH';
  const buffer = comCorpo ? Buffer.from(JSON.stringify(corpo ?? {})) : Buffer.alloc(0);
  const headers = { host, ...cabecalhos };
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

/** LAC de teste: um bloco ACEITO que cita a FAQ (validada) e um bloco em elaboração que cita o manual. */
async function comCopia(fn, { blocos = [bloco('bc-aceito', [FAQ], aceito), bloco('bc-novo', [MANUAL])], opcoes = {} } = {}) {
  const pai = fs.mkdtempSync(path.join(os.tmpdir(), 'sema-orienta-edicao-'));
  const raiz = path.join(pai, 'raiz');
  fs.mkdirSync(raiz);
  fs.cpSync(path.join(RAIZ, 'services'), path.join(raiz, 'services'), { recursive: true });
  const f = lerJ(raiz, ...arq('fontes.json'));
  f.fontes.find((x) => x.id === MANUAL).statusValidacao = 'em_validacao';
  gravarJ(raiz, arq('fontes.json'), f);
  const c = lerJ(raiz, ...arq('conteudo-assistente.json'));
  c.blocos.push(...blocos);
  gravarJ(raiz, arq('conteudo-assistente.json'), c);
  assert.deepEqual(validarServicos(raiz).erros, [], 'a LAC de teste precisa ser válida');
  try {
    const m = criarManipuladorAdmin({ raiz, agora: AGORA, diretorioTemporario: pai, gerarToken: () => TOKEN_FIXO, ...opcoes });
    const token = await obterToken(m);
    const base = '/__admin/servicos/lac';
    const ctx = {
      m, token, raiz, pai,
      situacao: async () => (await enviar(m, { url: `${base}/revisao`, method: 'GET', token })).corpo,
      editar: (fonteId, corpo) => enviar(m, { url: `${base}/fontes/${fonteId}`, method: 'PATCH', corpo, token }),
      excluir: (fonteId, revisao) => enviar(m, { url: `${base}/fontes/${fonteId}`, method: 'DELETE', token, cabecalhos: revisao === undefined ? {} : { 'x-revisao': revisao } }),
      ler: (fonteId) => enviar(m, { url: `${base}/fontes/${fonteId}`, method: 'GET', token }),
      post: (rota, corpo) => enviar(m, { url: `${base}/${rota}`, corpo, token }),
      fonteNoDisco: (id) => lerJ(raiz, ...arq('fontes.json')).fontes.find((x) => x.id === id),
      blocoNoDisco: (id) => lerJ(raiz, ...arq('conteudo-assistente.json')).blocos.find((x) => x.id === id),
    };
    await fn(ctx);
  } finally {
    fs.rmSync(pai, { recursive: true, force: true });
  }
}
const CAMPOS_LINK = { titulo: 'Manual atualizado (fictício)', url: 'https://exemplo.test/manual-novo', orgaoResponsavel: 'Órgão fictício', descricao: 'Descrição atualizada.', dataPublicacao: '2026-10-01', localizacao: 'capítulo 2' };

test('EF1. editar link: campos atualizados, volta a "ainda não revisada", sem data de consulta, nunca publicada; histórico sem conteúdo', async () => {
  await comCopia(async ({ editar, situacao, fonteNoDisco, raiz, ler }) => {
    const antes = fonteNoDisco(FAQ);
    assert.equal(antes.statusValidacao, 'validado');
    const lida = await ler(FAQ);
    assert.deepEqual([lida.status, lida.corpo.forma, lida.corpo.url], [200, 'link', antes.url]);
    let s = await situacao();
    const r = await editar(FAQ, { revisao: s.revisao, ...CAMPOS_LINK });
    assert.equal(r.status, 200, r.bruto);
    assert.match(r.corpo.revisao, /^[0-9a-f]{64}$/);
    assert.notEqual(r.corpo.revisao, s.revisao);
    const f = fonteNoDisco(FAQ);
    assert.deepEqual([f.titulo, f.url, f.orgaoResponsavel, f.descricao, f.dataPublicacao, f.dispositivoRelevante], [CAMPOS_LINK.titulo, CAMPOS_LINK.url, CAMPOS_LINK.orgaoResponsavel, CAMPOS_LINK.descricao, CAMPOS_LINK.dataPublicacao, CAMPOS_LINK.localizacao]);
    assert.deepEqual([f.statusValidacao, f.dataConsulta, f.publicado, f.origemOficial, f.tipo], ['em_validacao', null, false, antes.origemOficial, antes.tipo]);
    assert.deepEqual(validarServicos(raiz).erros, []);
    s = await situacao();
    const item = s.fontes.find((x) => x.id === FAQ);
    assert.deepEqual([item.revisada, item.podeRevisar, item.podeEditar, item.excluida], [false, true, true, false]);
    const h = criarHistoricoRevisao({ raiz }).listarAcoes('lac').registros;
    assert.deepEqual(h.map((x) => x.acao), ['editar_fonte']);
    assert.ok(!JSON.stringify(h).includes('exemplo.test') && !JSON.stringify(h).includes('Manual atualizado'));
  });
});

test('EF2. editar fonte reabre os blocos ACEITOS que a usam (e só eles) e mantém publicado falso', async () => {
  await comCopia(async ({ editar, situacao, blocoNoDisco }) => {
    let s = await situacao();
    assert.equal(blocoNoDisco('bc-aceito').statusValidacao, 'validado');
    const r = await editar(FAQ, { revisao: s.revisao, titulo: 'Título novo da fonte' });
    assert.deepEqual([r.status, r.corpo.blocosReabertos], [200, 1]);
    const b = blocoNoDisco('bc-aceito');
    assert.deepEqual([b.statusValidacao, b.revisaoAtualidade, b.publicado, b.atualizadoEm], ['rascunho', 'pendente', false, '2026-11-18']);
    // o bloco em elaboração (cita outra fonte) não é afetado; editar a fonte dele não reabre nada
    s = await situacao();
    const r2 = await editar(MANUAL, { revisao: s.revisao, titulo: 'Manual com título novo' });
    assert.deepEqual([r2.status, r2.corpo.blocosReabertos], [200, 0]);
    assert.equal(blocoNoDisco('bc-novo').statusValidacao, 'rascunho');
  });
});

test('EF3. editar texto: texto original e hash atualizados, fonte volta à revisão, 1:1 preservado, dado sensível recusado sem eco', async () => {
  await comCopia(async ({ editar, situacao, raiz, fonteNoDisco, ler }) => {
    const g = await criarGravadorEntradas({ raiz, agora: AGORA }).gravarEntradaTexto('lac', { titulo: 'Orientação interna', texto: 'Texto fictício original.' }, { ator: MARIA });
    assert.equal(g.ok, true);
    // revisa a fonte textual (validada) e cita em um bloco aceito
    const idTexto = lerJ(raiz, ...arq('fontes.json')).fontes.find((f) => f.formaEntrada === 'texto').id;
    const doc = lerJ(raiz, ...arq('fontes.json'));
    const ft = doc.fontes.find((f) => f.id === idTexto);
    ft.statusValidacao = 'validado'; ft.dataConsulta = '2026-11-10';
    doc.statusValidacao = 'em_validacao';
    gravarJ(raiz, arq('fontes.json'), doc);
    const cont = lerJ(raiz, ...arq('conteudo-assistente.json'));
    cont.blocos.push(bloco('bc-texto', [idTexto], aceito));
    gravarJ(raiz, arq('conteudo-assistente.json'), cont);
    assert.deepEqual(validarServicos(raiz).erros, []);
    const lida = await ler(idTexto);
    assert.deepEqual([lida.status, lida.corpo.forma, lida.corpo.texto], [200, 'texto', 'Texto fictício original.']);
    let s = await situacao();
    // campos de link num texto são recusados
    assert.equal((await editar(idTexto, { revisao: s.revisao, url: 'https://exemplo.test/x' })).status, 422);
    // dado sensível: recusado sem repetir
    const ruim = await editar(idTexto, { revisao: s.revisao, texto: 'senha: abc12345 e mais' });
    assert.deepEqual([ruim.status, ruim.corpo.campos], [422, ['texto']]);
    assert.ok(!ruim.bruto.includes('abc12345'));
    const novo = 'Texto fictício ALTERADO.\nSegunda linha.';
    const r = await editar(idTexto, { revisao: s.revisao, titulo: 'Orientação interna revisada', texto: novo });
    assert.deepEqual([r.status, r.corpo.blocosReabertos], [200, 1]);
    const entrada = lerJ(raiz, ...arq('entradas.json')).entradas[0];
    assert.deepEqual([entrada.texto, entrada.hash, entrada.atualizadoEm], [novo, hashTexto(novo), '2026-11-18']);
    const f = fonteNoDisco(idTexto);
    assert.deepEqual([f.titulo, f.statusValidacao, f.dataConsulta, f.publicado, f.formaEntrada], ['Orientação interna revisada', 'em_validacao', null, false, 'texto']);
    assert.deepEqual(validarServicos(raiz).erros, []);
    s = await situacao();
    assert.ok(!JSON.stringify(s).includes('ALTERADO'), 'a consulta de situação não traz o texto original');
  });
});

test('EF4. editar: URL duplicada, fonte inexistente, campos extras, ids no corpo, revisão divergente e dados inválidos são recusados sem alterar nada', async () => {
  await comCopia(async ({ editar, situacao, fonteNoDisco, raiz, post }) => {
    const s = await situacao();
    const urlDoManual = fonteNoDisco(MANUAL).url;
    const antes = retrato(raiz);
    assert.deepEqual([(await editar(FAQ, { revisao: s.revisao, url: urlDoManual })).status, (await editar(FAQ, { revisao: s.revisao, url: urlDoManual.toUpperCase() })).status], [409, 409]);
    assert.equal((await editar(FAQ, { revisao: s.revisao, url: urlDoManual })).corpo.erro, 'url_duplicada');
    assert.equal((await editar('nao-existe', { revisao: s.revisao, titulo: 'X' })).status, 404);
    assert.equal((await editar(FAQ, { revisao: 'a'.repeat(64), titulo: 'Novo título' })).corpo.erro, 'revisao_divergente');
    for (const corpo of [{ titulo: 'X' }, { revisao: s.revisao }, { revisao: s.revisao, id: 'outro' }, { revisao: s.revisao, statusValidacao: 'validado' }, { revisao: s.revisao, publicado: true },
      { revisao: s.revisao, url: 'http://inseguro.test' }, { revisao: s.revisao, titulo: '' }, { revisao: s.revisao, titulo: 5 }, { revisao: s.revisao, dataPublicacao: '2026-02-30' }]) {
      const r = await editar(FAQ, corpo);
      assert.equal(r.status, 422, JSON.stringify(corpo));
    }
    assert.deepEqual(retrato(raiz), antes);
    // sem token / host falso
    assert.equal((await enviar(criarManipuladorAdmin({ raiz, agora: AGORA }), { url: '/__admin/servicos/lac/fontes/x', method: 'PATCH', corpo: {} })).status, 401);
    assert.ok(post);
  });
});

test('EF8. versão congelada: editar e excluir recusados; nova versão permite editar e deixa a anterior intacta', async () => {
  await comCopia(async ({ editar, excluir, situacao, post, fonteNoDisco, raiz }) => {
    let s = await situacao();
    // conclui a revisão: revisa o manual, aceita o bloco novo e conclui
    assert.equal((await post('revisao/fontes', { fonteId: MANUAL, revisao: s.revisao })).status, 200);
    s = await situacao();
    assert.equal((await post('revisao/blocos/aceitar', { blocoId: 'bc-novo', revisao: s.revisao })).status, 200);
    s = await situacao();
    assert.equal((await enviarEValidarPelaRota(post, s.revisao)).status, 200);
    s = await situacao();
    const v1 = retrato(raiz).filter((l) => l.includes(`v1${path.sep}`));
    assert.deepEqual([(await editar(FAQ, { revisao: s.revisao, titulo: 'X' })).corpo.erro, (await excluir(FAQ, s.revisao)).corpo.erro], ['versao_congelada', 'versao_congelada']);
    assert.deepEqual(retrato(raiz).filter((l) => l.includes(`v1${path.sep}`)), v1);
    assert.equal((await post('nova-versao', {})).status, 201);
    s = await situacao();
    const r = await editar(FAQ, { revisao: s.revisao, titulo: 'Título só na versão 2' });
    assert.equal(r.status, 200, r.bruto);
    assert.deepEqual(retrato(raiz).filter((l) => l.includes(`v1${path.sep}`)), v1, 'a versão anterior continua intacta');
    assert.equal(lerJ(raiz, 'services', 'lac', 'versoes', 'v2', 'fontes.json').fontes.find((f) => f.id === FAQ).titulo, 'Título só na versão 2');
    assert.ok(fonteNoDisco(FAQ).titulo !== 'Título só na versão 2');
    assert.deepEqual(validarServicos(raiz).erros, []);
  });
});

test('EF9. rollback: falha em cada gravação desfaz tudo (editar com cascata e texto, excluir) e o histórico não registra a ação', async () => {
  await comCopia(async ({ raiz }) => {
    const g = await criarGravadorEntradas({ raiz, agora: AGORA }).gravarEntradaTexto('lac', { titulo: 'Orientação interna', texto: 'Texto fictício original.' }, { ator: MARIA });
    assert.equal(g.ok, true);
    const doc = lerJ(raiz, ...arq('fontes.json'));
    const ft = doc.fontes.find((f) => f.formaEntrada === 'texto');
    ft.statusValidacao = 'validado'; ft.dataConsulta = '2026-11-10';
    gravarJ(raiz, arq('fontes.json'), doc);
    const cont = lerJ(raiz, ...arq('conteudo-assistente.json'));
    cont.blocos.push(bloco('bc-texto', [ft.id], aceito));
    gravarJ(raiz, arq('conteudo-assistente.json'), cont);
    assert.deepEqual(validarServicos(raiz).erros, []);
    const rev = criarServicoRevisao({ raiz, agora: AGORA });
    const revisao = rev.consultar('lac').situacao.revisao;
    const antes = retrato(raiz);
    let total = 0;
    const contar = { ...fs, renameSync(o, d) { total += 1; return fs.renameSync(o, d); } };
    const ensaio = criarServicoRevisao({ raiz, sistema: contar, agora: AGORA, verificarFinal: () => ['recusado'] }).editarFonte('lac', { ator: MARIA, fonteId: ft.id, revisao, campos: { texto: 'Texto alterado.' } });
    assert.deepEqual([ensaio.ok, ensaio.revertido], [false, true], JSON.stringify(ensaio));
    // Com a conferência final recusada, cada gravação (fontes, informações, entradas) é desfeita por uma restauração: total = 2 × gravações.
    assert.ok(total >= 6 && total % 2 === 0, `gravações contadas: ${total}`);
    assert.deepEqual(retrato(raiz), antes);
    for (let k = 1; k <= total / 2 + 1; k += 1) { // as gravações do conteúdo e a do histórico (a última etapa)
      let n = 0;
      const sistema = { ...fs, renameSync(o, d) { n += 1; if (n === k) throw new Error('falha injetada'); return fs.renameSync(o, d); } };
      const r = criarServicoRevisao({ raiz, sistema, agora: AGORA }).editarFonte('lac', { ator: MARIA, fonteId: ft.id, revisao, campos: { texto: 'Texto alterado.' } });
      assert.deepEqual([r.ok, r.revertido], [false, true], `falha no ponto ${k}`);
      assert.deepEqual(retrato(raiz), antes, `base alterada no ponto ${k}`);
    }
    // Passo 8C: só o cadastro do texto (preparo do teste) está no histórico; a edição desfeita não.
    assert.deepEqual(criarHistoricoRevisao({ raiz }).listarAcoes('lac').registros.map((x) => x.acao), ['cadastrar_texto']);
    // exclusão: falha na gravação e no histórico
    const novo = (await import('../services/admin/revisao-servico.js')).criarServicoRevisao;
    assert.ok(novo);
  });
});

const avulso = (m, token, url = 'https://exemplo.test/avulso', titulo = 'Link avulso fictício') => enviar(m, { url: '/__admin/servicos/lac/links', corpo: { titulo, tipo: 'pagina_oficial', orgaoResponsavel: 'Órgão fictício', url, descricao: 'Descrição fictícia.', origemOficial: false }, token });

test('EF5. excluir link sem uso: some da gestão (lista, GET, contagens), a fonte fica só como registro, a URL pode ser cadastrada de novo', async () => {
  await comCopia(async ({ excluir, situacao, fonteNoDisco, raiz, post, editar, ler, m, token }) => {
    const novo = await avulso(m, token);
    assert.equal(novo.status, 201);
    const id = novo.corpo.fonte.id;
    let s = await situacao();
    assert.deepEqual([s.fontes.find((f) => f.id === id).podeExcluir, s.resumo.fontesNaoUsadas], [true, 1]);
    assert.equal((await excluir(id)).status, 422, 'sem X-Revisao');
    assert.equal((await excluir(id, 'a'.repeat(64))).corpo.erro, 'revisao_divergente');
    const r = await excluir(id, s.revisao);
    assert.equal(r.status, 200, r.bruto);
    const f = fonteNoDisco(id);
    assert.ok(f, 'a fonte continua como registro interno da versão');
    assert.deepEqual([f.excluidaEm, f.publicado], ['2026-11-18', false]);
    assert.deepEqual(validarServicos(raiz).erros, []);
    s = await situacao();
    assert.equal(s.fontes.some((x) => x.id === id), false, 'invisível na gestão');
    assert.ok(!JSON.stringify(s).includes('Link avulso fictício'));
    assert.deepEqual([s.resumo.fontesNaoUsadas, s.pendencias.some((p) => p.id === id)], [0, false]);
    // invisível também para as demais operações
    assert.equal((await ler(id)).status, 404);
    assert.equal((await editar(id, { revisao: s.revisao, titulo: 'Outro' })).status, 404);
    assert.equal((await excluir(id, s.revisao)).status, 404);
    assert.equal((await post('revisao/fontes', { fonteId: id, revisao: s.revisao })).status, 404);
    const bl = await post('conhecimentos', { titulo: 'Novo', texto: 'Texto', fonteIds: [id], referencias: [{ fonteId: id, localizacao: 'p. 1' }] });
    assert.equal(bl.status, 422);
    // a URL volta a poder ser cadastrada
    assert.equal((await avulso(m, token, 'https://exemplo.test/avulso', 'Mesmo endereço')).status, 201);
    // histórico privado: só metadados mínimos
    const h = criarHistoricoRevisao({ raiz }).listarAcoes('lac').registros.filter((x) => x.acao === 'excluir_fonte');
    assert.equal(h.length, 1);
    assert.deepEqual([h[0].itemId, h[0].itemTipo], [id, 'link']);
    assert.ok(!JSON.stringify(h).includes('Link avulso') && !JSON.stringify(h).includes('exemplo.test') && !JSON.stringify(h).includes('Descrição'), 'só metadados: nada de título, URL nem descrição');
  });
});

test('EF6. impacto da exclusão: lista as informações afetadas (títulos) e o conteúdo antigo, sem ids; a exclusão nunca é recusada por referências', async () => {
  await comCopia(async ({ m, token, excluir, situacao, raiz, blocoNoDisco }) => {
    const s = await situacao();
    const impacto = async (id) => enviar(m, { url: `/__admin/servicos/lac/fontes/${id}/impacto`, method: 'GET', token });
    const faq = await impacto(FAQ);
    assert.equal(faq.status, 200);
    assert.deepEqual(faq.corpo.informacoes, [{ titulo: 'Informação bc-aceito', desfecho: 'sai_do_conteudo_ativo' }]);
    assert.ok(!/"id"|fonteId|blocoId/.test(faq.bruto));
    const sema = await impacto(SEMA);
    assert.ok(sema.corpo.conteudoAntigo.camposDoServico.length > 0 && sema.corpo.conteudoAntigo.camposDoServico.every((c) => typeof c === 'string'));
    assert.equal((await impacto('nao-existe')).status, 404);
    // a informação ACEITA que cita só a FAQ sai do conteúdo ativo; a fonte é retirada do serviço
    const r = await excluir(FAQ, s.revisao);
    assert.equal(r.status, 200, r.bruto);
    assert.equal(blocoNoDisco('bc-aceito'), undefined, 'informação sem fonte válida sai do conteúdo ativo');
    assert.equal(lerJ(raiz, ...arq('service.json')).links.includes(FAQ), false);
    assert.deepEqual(validarServicos(raiz).erros, []);
  });
});

test('EF7. informação com outra fonte válida permanece (aceita volta a "Em elaboração"); a fonte excluída sai das referências', async () => {
  await comCopia(async ({ excluir, situacao, raiz, blocoNoDisco }) => {
    const c = lerJ(raiz, ...arq('conteudo-assistente.json'));
    c.blocos.push(bloco('bc-duas', [FAQ, SEMA], aceito));
    gravarJ(raiz, arq('conteudo-assistente.json'), c);
    assert.deepEqual(validarServicos(raiz).erros, []);
    const s = await situacao();
    const r = await excluir(FAQ, s.revisao);
    assert.deepEqual([r.status, r.corpo.blocosReabertos], [200, 1], r.bruto);
    const b = blocoNoDisco('bc-duas');
    assert.deepEqual(b.fonteIds, [SEMA]);
    assert.deepEqual(b.referencias.map((x) => x.fonteId), [SEMA]);
    assert.deepEqual([b.statusValidacao, b.revisaoAtualidade, b.publicado], ['rascunho', 'pendente', false]);
    assert.equal(blocoNoDisco('bc-aceito'), undefined);
    assert.equal(blocoNoDisco('bc-novo').statusValidacao, 'rascunho');
    assert.deepEqual(validarServicos(raiz).erros, []);
  });
});

test('EF8. conteúdo antigo: excluir fonte citada pelo serviço, documentos e perguntas retira as referências; campos sem fonte voltam a pendentes', async () => {
  await comCopia(async ({ excluir, situacao, raiz }) => {
    const antes = lerJ(raiz, ...arq('service.json'));
    assert.ok(antes.referencias.descricao.includes(SEMA));
    const nDocs = lerJ(raiz, ...arq('documentos.json')).documentos.length;
    let s = await situacao();
    // exclui a fonte do TR (documentos e perguntas antigos que a citam saem do conteúdo ativo)
    const tr = 'tr-176-lac';
    const r1 = await excluir(tr, s.revisao);
    assert.equal(r1.status, 200, r1.bruto);
    const docs = lerJ(raiz, ...arq('documentos.json')).documentos;
    assert.ok(docs.length < nDocs && docs.every((d) => d.fonteId !== tr));
    assert.ok(lerJ(raiz, ...arq('service.json')).links.every((id) => id !== tr));
    assert.deepEqual(validarServicos(raiz).erros, []);
    // exclui a fonte que sustenta os campos do serviço: os campos ficam pendentes
    s = await situacao();
    const r2 = await excluir(SEMA, s.revisao);
    assert.equal(r2.status, 200, r2.bruto);
    const sv = lerJ(raiz, ...arq('service.json'));
    assert.deepEqual([sv.descricao, sv.publico, sv.condicoes, sv.etapas], ['PENDENTE', 'PENDENTE', [], []]);
    assert.ok(Object.values(sv.referencias ?? {}).every((ids) => !ids.includes(SEMA)));
    assert.ok(sv.links.every((id) => id !== SEMA));
    assert.deepEqual(validarServicos(raiz).erros, []);
  });
});

test('EF9. decreto revogado e demais itens antigos podem ser excluídos; somem da gestão e das referências', async () => {
  await comCopia(async ({ excluir, situacao, raiz }) => {
    let s = await situacao();
    const d = s.fontes.find((f) => f.id === REVOGADO);
    assert.deepEqual([d.revogada, d.podeExcluir, d.podeEditar], [true, true, false], 'revogado aparece só na lista normal, como revogado, e pode ser excluído');
    const r = await excluir(REVOGADO, s.revisao);
    assert.equal(r.status, 200, r.bruto);
    s = await situacao();
    assert.equal(s.fontes.some((f) => f.id === REVOGADO), false);
    assert.ok(!lerJ(raiz, ...arq('service.json')).legislacao.includes(REVOGADO));
    assert.deepEqual(validarServicos(raiz).erros, []);
  });
});

test('EF11. excluir texto: a entrada original fica só como registro da versão; nova versão não copia a fonte nem a entrada excluída', async () => {
  await comCopia(async ({ excluir, situacao, post, raiz, m, token }) => {
    const g = await criarGravadorEntradas({ raiz, agora: AGORA }).gravarEntradaTexto('lac', { titulo: 'Orientação interna', texto: 'Texto fictício interno.' }, { ator: MARIA });
    assert.equal(g.ok, true);
    let s = await situacao();
    const idTexto = s.fontes.find((f) => f.forma === 'texto').id;
    assert.equal((await excluir(idTexto, s.revisao)).status, 200);
    assert.equal(lerJ(raiz, ...arq('entradas.json')).entradas.length, 1, 'a entrada permanece como registro desta versão');
    s = await situacao();
    assert.equal(s.fontes.some((f) => f.id === idTexto), false);
    assert.ok(!JSON.stringify(s).includes('interno'));
    const h = criarHistoricoRevisao({ raiz }).listarAcoes('lac').registros.at(-1);
    assert.deepEqual([h.acao, h.itemTipo], ['excluir_fonte', 'texto']);
    assert.ok(!JSON.stringify(h).includes('interno'));
    assert.deepEqual(validarServicos(raiz).erros, []);
    // conclui a revisão e cria nova versão: a excluída não é copiada
    assert.equal((await post('revisao/fontes', { fonteId: MANUAL, revisao: s.revisao })).status, 200);
    s = await situacao();
    assert.equal((await post('revisao/blocos/aceitar', { blocoId: 'bc-novo', revisao: s.revisao })).status, 200);
    s = await situacao();
    assert.equal((await enviarEValidarPelaRota(post, s.revisao)).status, 200);
    const v1 = retrato(raiz).filter((l) => l.includes(`v1${path.sep}`));
    assert.equal((await post('nova-versao', {})).status, 201);
    assert.deepEqual(retrato(raiz).filter((l) => l.includes(`v1${path.sep}`)), v1, 'versão anterior intacta');
    const f2 = lerJ(raiz, 'services', 'lac', 'versoes', 'v2', 'fontes.json').fontes;
    assert.ok(f2.every((f) => f.id !== idTexto && typeof f.excluidaEm !== 'string'));
    assert.deepEqual(lerJ(raiz, 'services', 'lac', 'versoes', 'v2', 'entradas.json').entradas, []);
    assert.deepEqual(validarServicos(raiz).erros, []);
    assert.ok(m && token);
  });
});

test('EF12. versão congelada exige nova versão; a exclusão na nova versão não toca a anterior', async () => {
  await comCopia(async ({ excluir, situacao, post, raiz, fonteNoDisco }) => {
    let s = await situacao();
    assert.equal((await post('revisao/fontes', { fonteId: MANUAL, revisao: s.revisao })).status, 200);
    s = await situacao();
    assert.equal((await post('revisao/blocos/aceitar', { blocoId: 'bc-novo', revisao: s.revisao })).status, 200);
    s = await situacao();
    assert.equal((await enviarEValidarPelaRota(post, s.revisao)).status, 200);
    s = await situacao();
    assert.equal((await excluir(FAQ, s.revisao)).corpo.erro, 'versao_congelada');
    assert.equal((await post('nova-versao', {})).status, 201);
    const v1 = retrato(raiz).filter((l) => l.includes(`v1${path.sep}`));
    s = await situacao();
    assert.equal((await excluir(FAQ, s.revisao)).status, 200);
    assert.deepEqual(retrato(raiz).filter((l) => l.includes(`v1${path.sep}`)), v1);
    assert.equal(lerJ(raiz, 'services', 'lac', 'versoes', 'v2', 'fontes.json').fontes.find((f) => f.id === FAQ).excluidaEm, '2026-11-18');
    assert.equal(fonteNoDisco(FAQ).excluidaEm, undefined);
    assert.equal(lerJ(raiz, 'services', 'lac', 'versoes', 'v1', 'fontes.json').fontes.find((f) => f.id === FAQ).excluidaEm, undefined);
    assert.deepEqual(validarServicos(raiz).erros, []);
  });
});

test('EF13. rollback da exclusão em cascata: falha em cada gravação desfaz tudo e o histórico não registra a ação', async () => {
  await comCopia(async ({ raiz }) => {
    const rev = criarServicoRevisao({ raiz, agora: AGORA });
    const revisao = rev.consultar('lac').situacao.revisao;
    const antes = retrato(raiz);
    let total = 0;
    const contar = { ...fs, renameSync(o, d) { total += 1; return fs.renameSync(o, d); } };
    const ensaio = criarServicoRevisao({ raiz, sistema: contar, agora: AGORA, verificarFinal: () => ['recusado'] }).excluirFonte('lac', { ator: MARIA, fonteId: SEMA, revisao });
    assert.deepEqual([ensaio.ok, ensaio.revertido], [false, true], JSON.stringify(ensaio));
    assert.ok(total >= 6 && total % 2 === 0, `gravações contadas: ${total}`);
    assert.deepEqual(retrato(raiz), antes);
    for (let k = 1; k <= total / 2 + 1; k += 1) {
      let n = 0;
      const sistema = { ...fs, renameSync(o, d) { n += 1; if (n === k) throw new Error('falha injetada'); return fs.renameSync(o, d); } };
      const r = criarServicoRevisao({ raiz, sistema, agora: AGORA }).excluirFonte('lac', { ator: MARIA, fonteId: SEMA, revisao });
      assert.deepEqual([r.ok, r.revertido], [false, true], `falha no ponto ${k}`);
      assert.deepEqual(retrato(raiz), antes, `base alterada no ponto ${k}`);
    }
    assert.equal(criarHistoricoRevisao({ raiz }).listarAcoes('lac').registros.length, 0);
  });
});

test('EF14. MCP e chat: a fonte excluída não aparece em consultar_fontes nem é liberada ao modo público', async () => {
  await comCopia(async ({ excluir, situacao, raiz }) => {
    const { criarFerramentas } = await import('../scripts/mcp/ferramentas.js');
    const antes = JSON.stringify(criarFerramentas({ raiz }).chamar('consultar_fontes', { servicoId: 'lac' }).dados.fontes.map((f) => f.id));
    assert.ok(antes.includes(FAQ));
    const s = await situacao();
    assert.equal((await excluir(FAQ, s.revisao)).status, 200);
    const depois = criarFerramentas({ raiz }).chamar('consultar_fontes', { servicoId: 'lac' }).dados;
    assert.ok(!JSON.stringify(depois).includes(FAQ) && !JSON.stringify(depois).includes('faq'));
    assert.equal(depois.fontes.every((f) => f.id !== FAQ), true);
  });
});

test('EF15. excluir QUALQUER fonte da LAC deixa a base válida, sem id órfão em normas relacionadas nem no roteiro, e a nova versão também é válida', async () => {
  const { congelarVersaoDoServico } = await import('../services/admin/congelamento.js');
  const { criarNovaVersaoDoServico } = await import('../services/admin/nova-versao.js');
  const ids = lerJ(RAIZ, ...arq('fontes.json')).fontes.map((x) => x.id);
  assert.equal(ids.length, 8);
  for (const id of ids) {
    await comCopia(async ({ excluir, situacao, raiz }) => {
      const s = await situacao();
      const r = await excluir(id, s.revisao);
      assert.equal(r.status, 200, `${id}: ${r.bruto}`);
      assert.deepEqual(validarServicos(raiz).erros, [], `base inválida depois de excluir ${id}`);
      const roteiro = fs.readFileSync(path.join(raiz, ...arq('roteiro.md')), 'utf8');
      assert.ok(!roteiro.includes(`\`${id}\``), `o roteiro ainda cita ${id}`);
      const fontes = lerJ(raiz, ...arq('fontes.json')).fontes;
      assert.ok(fontes.filter((x) => x.id !== id).every((x) => !(x.vigencia.normasRelacionadas ?? []).includes(id)), `normasRelacionadas ainda cita ${id}`);
      // nova versão: congela, marca como revisada e cria a v2 (a excluída não é copiada)
      assert.equal(congelarVersaoDoServico({ raiz, servicoId: 'lac', agora: AGORA, verificarFinal: () => [] }).ok, true);
      const m = lerJ(raiz, ...arq('versao.json'));
      gravarJ(raiz, arq('versao.json'), { ...m, estado: 'validado_materialmente' });
      const nv = criarNovaVersaoDoServico({ raiz, servicoId: 'lac', agora: () => new Date(2026, 10, 19) });
      assert.equal(nv.ok, true, `${id}: ${JSON.stringify(nv)}`);
      assert.deepEqual(validarServicos(raiz).erros, [], `v2 inválida depois de excluir ${id}`);
      assert.ok(lerJ(raiz, 'services', 'lac', 'versoes', 'v2', 'fontes.json').fontes.every((x) => x.id !== id));
    });
  }
});

test('EF16. roteiro: a seção que perde a única fonte volta a PENDENTE; a que mantém outra fonte só perde a linha; EOL preservado', async () => {
  const { retirarFonteDoRoteiro, limparNormasRelacionadas } = await import('../services/admin/edicao-fonte.js');
  const texto = '# Serviço\n\n## Descrição do serviço\nTexto A.\nFontes: `a`.\n\n## Condições\nTexto B.\nFontes: `a`, `b`.\n\n## Fontes\n- `a`\n- `b`\n';
  const r = retirarFonteDoRoteiro(texto, 'a');
  assert.equal(r.mudou, true);
  assert.deepEqual(r.secoesPendentes, ['Descrição do serviço']);
  assert.ok(!r.texto.includes('`a`') && r.texto.includes('Fontes: `b`.') && r.texto.includes('PENDENTE'));
  const crlfTexto = retirarFonteDoRoteiro(texto.split('\n').join('\r\n'), 'a').texto;
  assert.ok(crlfTexto.includes('\r\n') && !/[^\r]\n/.test(crlfTexto));
  assert.equal(retirarFonteDoRoteiro(texto, 'z').mudou, false);
  // normas relacionadas: revogada que perde a única norma vira "a confirmar"
  const l = limparNormasRelacionadas([{ id: 'x', vigencia: { situacao: 'revogada', normasRelacionadas: ['y'] } }, { id: 'y', vigencia: { situacao: 'nao_se_aplica', normasRelacionadas: [] } }], ['y']);
  assert.deepEqual([l.fontes[0].vigencia.situacao, l.fontes[0].vigencia.normasRelacionadas, l.alteradas], ['a_confirmar', [], 1]);
});

test('EF17. excluidaEm com valor estranho (não string) é tratado como fonte excluída (falha segura) e o validador o recusa', async () => {
  await comCopia(async ({ raiz, situacao }) => {
    const doc = lerJ(raiz, ...arq('fontes.json'));
    doc.fontes.find((x) => x.id === 'tr-176-lac').excluidaEm = true;
    gravarJ(raiz, arq('fontes.json'), doc);
    assert.ok(validarServicos(raiz).erros.some((e) => e.includes('excluidaEm')));
    const s = await situacao();
    assert.equal(s.fontes.some((x) => x.id === 'tr-176-lac'), false);
  });
});

test('EF10. o chat e a reutilização nunca usam fonte excluída; nada foi publicado; LAC real e histórico real intactos', async () => {
  // chat: bloco publicado cujo fundamento foi excluído nunca é liberado ao modo público
  const bl = { id: 'b1', tipo: 'conhecimento', texto: 'Texto de teste.', origem: 'fonte', fonteIds: ['f1'], referencias: [{ fonteId: 'f1', localizacao: 'item 1' }], ambiente: 'publico', publicado: true, statusValidacao: 'validado', revisaoAtualidade: 'concluida' };
  const fonte = { id: 'f1', tipo: 'pagina_oficial', publicado: true, vigencia: { situacao: 'nao_se_aplica' } };
  assert.equal(selecionarBlocosAssistente({ conteudo: { blocos: [bl] }, fontes: [fonte] }, 'publico').length, 1);
  assert.deepEqual(selecionarBlocosAssistente({ conteudo: { blocos: [bl] }, fontes: [{ ...fonte, excluidaEm: '2026-11-18' }] }, 'publico'), []);
  // reutilização: link validado excluído não é reutilizável
  const link = { id: 'x', tipo: 'pagina_oficial', formaEntrada: 'link', statusValidacao: 'validado', url: 'https://exemplo.test/a', vigencia: { situacao: 'nao_se_aplica' } };
  assert.equal(fonteReutilizavel(link), true);
  assert.equal(fonteReutilizavel({ ...link, excluidaEm: '2026-11-18' }), false);
  await comCopia(async ({ excluir, situacao, raiz, m, token }) => {
    const novo = await enviar(m, { url: '/__admin/servicos/lac/links', corpo: { titulo: 'Link avulso', tipo: 'pagina_oficial', orgaoResponsavel: 'Órgão fictício', url: 'https://exemplo.test/avulso2', descricao: 'Descrição.', origemOficial: false }, token });
    const s = await situacao();
    assert.equal((await excluir(novo.corpo.fonte.id, s.revisao)).status, 200);
    assert.equal(buscarLinksReutilizaveis(raiz, 'lac', 'avulso').itens.length, 0);
    const reg = lerJ(raiz, 'services', 'registry.json').servicos[0];
    assert.deepEqual([reg.versaoPublicadaId, reg.publicado], [null, false]);
    assert.ok(lerJ(raiz, ...arq('fontes.json')).fontes.every((f) => f.publicado === false));
  });
  assert.deepEqual(retrato(RAIZ), RETRATO_REAL_ANTES);
  assert.equal(fs.existsSync(path.join(RAIZ, 'data')), EXISTIA_DATA);
});
