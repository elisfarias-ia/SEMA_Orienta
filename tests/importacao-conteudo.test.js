// Passo 5B3c: importar conteúdo existente como informação em elaboração. SEMPRE em cópias temporárias fora do repositório, com dados
// fictícios; a LAC real, o registro e o armazenamento privado real nunca são tocados.

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
import { alterarBlocoConhecimento } from '../services/admin/conhecimento.js';
import { listarCandidatos, validarCorpoImportacao } from '../services/admin/importacao-conteudo.js';
import { selecionarBlocosAssistente } from '../services/assistant-content.js';
import { validarConteudoAssistente, validarServicos } from '../scripts/validate-services.js';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const AGORA = () => new Date(2026, 10, 18, 12, 0, 0);
const SEMA = 'sema-orientacoes-lac';
const REVOGADO = 'decreto-695-2020';
const MANUAL = 'manual-lac-siga-2020';

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

async function enviar(m, { url, method = 'POST', corpo, token, host = 'localhost:5173' } = {}) {
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
const lerJ = (raiz, ...p) => JSON.parse(fs.readFileSync(path.join(raiz, ...p), 'utf8'));
const gravarJ = (raiz, p, d) => fs.writeFileSync(path.join(raiz, ...p), `${JSON.stringify(d, null, 2)}\n`);
const arq = (nome, v = 'v1') => ['services', 'lac', 'versoes', v, nome];
const bytes = (raiz, nome, v = 'v1') => fs.readFileSync(path.join(raiz, ...arq(nome, v)));
const ANTIGOS = ['service.json', 'roteiro.md', 'documentos.json', 'perguntas-frequentes.json', 'fontes.json'];

/** Cópia temporária da LAC (só conteúdo antigo, sem informações cadastradas), válida. */
async function comCopia(fn, { opcoes = {} } = {}) {
  const pai = fs.mkdtempSync(path.join(os.tmpdir(), 'sema-orienta-importacao-'));
  const raiz = path.join(pai, 'raiz');
  fs.mkdirSync(raiz);
  fs.cpSync(path.join(RAIZ, 'services'), path.join(raiz, 'services'), { recursive: true });
  assert.deepEqual(validarServicos(raiz).erros, [], 'a LAC de teste precisa ser válida');
  try {
    const m = criarManipuladorAdmin({ raiz, agora: AGORA, diretorioTemporario: pai, ...opcoes });
    const token = (await enviar(m, { url: ROTA_SESSAO, method: 'GET' })).corpo.token;
    const base = '/__admin/servicos/lac';
    const ctx = {
      m, token, raiz, pai,
      situacao: async () => (await enviar(m, { url: `${base}/revisao`, method: 'GET', token })).corpo,
      cand: () => enviar(m, { url: `${base}/importacao`, method: 'GET', token }),
      importar: (corpo) => enviar(m, { url: `${base}/importacao`, corpo, token }),
      post: (rota, corpo) => enviar(m, { url: `${base}/${rota}`, corpo, token }),
      blocos: () => lerJ(raiz, ...arq('conteudo-assistente.json')).blocos.filter((b) => b.tipo === 'conhecimento'),
    };
    await fn(ctx);
  } finally {
    fs.rmSync(pai, { recursive: true, force: true });
  }
}

/** Corpo do POST como a tela monta: o que a pessoa conferiu no formulário (candidato + local na fonte preenchido). */
function corpoDe(lista, ref, revisao, extra = {}) {
  const c = lista.candidatos.find((x) => x.ref === ref);
  assert.ok(c, `candidato ${ref} deveria existir`);
  const referencias = c.referencias.map((r) => ({ fonteId: r.fonteId, localizacao: r.localizacao || 'página 1' }));
  return { revisao, ref, titulo: c.titulo, texto: c.texto, fonteIds: referencias.map((r) => r.fonteId), referencias, ...(c.alertas.length ? { alertas: c.alertas } : {}), ...extra };
}

test('IM1. a lista só lê: candidatos em linguagem comum, sem regra institucional nem norma revogada; nada é gravado', async () => {
  await comCopia(async ({ cand, raiz }) => {
    const antes = retrato(raiz);
    const r = await cand();
    assert.equal(r.status, 200, r.bruto);
    assert.match(r.corpo.revisao, /^[0-9a-f]{64}$/);
    const tipos = new Set(r.corpo.candidatos.map((c) => c.tipo));
    for (const t of ['descricao', 'etapas', 'norma', 'link', 'bloco', 'documento', 'pergunta']) assert.ok(tipos.has(t), `tipo ${t}`);
    const refs = r.corpo.candidatos.map((c) => c.ref);
    assert.equal(new Set(refs).size, refs.length);
    const antigos = lerJ(raiz, ...arq('conteudo-assistente.json')).blocos;
    const doBloco = refs.filter((x) => x.startsWith('bloco:')).map((x) => x.slice(6));
    assert.ok(doBloco.length > 0);
    for (const id of doBloco) assert.equal(antigos.find((b) => b.id === id).origem, 'fonte');
    for (const b of antigos.filter((x) => x.origem === 'regra_institucional' || x.tipo === 'sem_conteudo')) assert.ok(!refs.includes(`bloco:${b.id}`));
    assert.ok(!refs.includes(`norma:${REVOGADO}`) && !refs.includes(`link:${REVOGADO}`), 'fonte revogada não é candidata');
    for (const c of r.corpo.candidatos) {
      assert.ok(c.titulo.trim() !== '' && c.texto.trim() !== '');
      assert.ok(c.fonteIds.every((id) => id !== REVOGADO));
    }
    assert.deepEqual(retrato(raiz), antes, 'abrir a lista não grava nada');
    assert.equal(fs.existsSync(path.join(raiz, 'data')), false, 'nenhum histórico é criado ao abrir');
  });
});

test('IM2. importar UM item: em elaboração, nunca aceita nem publicada; conteúdo antigo intacto byte a byte; só o arquivo de informações muda', async () => {
  await comCopia(async ({ cand, importar, raiz, blocos, situacao }) => {
    const l = (await cand()).corpo;
    const antigosAntes = ANTIGOS.map((n) => bytes(raiz, n));
    const manifestoAntes = bytes(raiz, 'versao.json');
    const registroAntes = fs.readFileSync(path.join(raiz, 'services', 'registry.json'));
    const r = await importar(corpoDe(l, 'descricao', l.revisao));
    assert.equal(r.status, 201, r.bruto);
    assert.match(r.corpo.revisao, /^[0-9a-f]{64}$/);
    assert.notEqual(r.corpo.revisao, l.revisao);
    const bs = blocos();
    assert.equal(bs.length, 1, 'um item por vez: um bloco criado');
    const b = bs[0];
    assert.deepEqual([b.statusValidacao, b.revisaoAtualidade, b.publicado, b.origem, b.ambiente], ['rascunho', 'pendente', false, 'fonte', 'publico']);
    assert.deepEqual(b.origemImportacao, { tipo: 'descricao', referencia: 'descricao' });
    assert.deepEqual([b.criadoEm, b.atualizadoEm], ['2026-11-18', '2026-11-18']);
    ANTIGOS.forEach((n, i) => assert.ok(bytes(raiz, n).equals(antigosAntes[i]), `${n} intacto`));
    assert.ok(bytes(raiz, 'versao.json').equals(manifestoAntes));
    assert.ok(fs.readFileSync(path.join(raiz, 'services', 'registry.json')).equals(registroAntes));
    assert.deepEqual(validarServicos(raiz).erros, []);
    const s = await situacao();
    assert.equal(s.blocos.find((x) => x.id === b.id).aceito, false, 'entra no fluxo normal, ainda não aceita');
    const depois = (await cand()).corpo;
    assert.ok(!depois.candidatos.some((c) => c.ref === 'descricao'));
    assert.ok(depois.candidatos.some((c) => c.ref === 'etapas'));
    assert.equal(depois.candidatos.length, l.candidatos.length - 1);
  });
});

test('IM3. duplicação: o mesmo item não é importado duas vezes (409); editar a informação mantém a origem', async () => {
  await comCopia(async ({ cand, importar, blocos, raiz, situacao }) => {
    const l = (await cand()).corpo;
    assert.equal((await importar(corpoDe(l, 'etapas', l.revisao))).status, 201);
    const s = await situacao();
    const r2 = await importar(corpoDe(l, 'etapas', s.revisao));
    assert.deepEqual([r2.status, r2.corpo.erro], [409, 'ja_importado']);
    assert.equal(blocos().length, 1);
    const doc = lerJ(raiz, ...arq('conteudo-assistente.json'));
    const fontes = lerJ(raiz, ...arq('fontes.json')).fontes;
    const manifesto = lerJ(raiz, ...arq('versao.json'));
    const b = blocos()[0];
    const alt = alterarBlocoConhecimento(manifesto, doc, fontes, b.id, { titulo: 'Título novo', texto: b.texto, fonteIds: b.fonteIds, referencias: b.referencias }, { data: '2026-11-19' });
    assert.equal(alt.ok, true, JSON.stringify(alt));
    assert.deepEqual(alt.bloco.origemImportacao, { tipo: 'etapas', referencia: 'etapas' });
  });
});

test('IM4. fonte ativa é exigida: excluída, revogada, inexistente ou ausente são recusadas; nada é gravado', async () => {
  await comCopia(async ({ cand, importar, raiz }) => {
    const l = (await cand()).corpo;
    const base = corpoDe(l, 'descricao', l.revisao);
    const com = (fonteId) => ({ ...base, fonteIds: [fonteId], referencias: [{ fonteId, localizacao: 'página 1' }] });
    for (const f of [REVOGADO, 'fonte-que-nao-existe']) assert.equal((await importar(com(f))).status, 422, f);
    assert.equal((await importar({ ...base, fonteIds: [], referencias: [] })).status, 422);
    const doc = lerJ(raiz, ...arq('fontes.json'));
    doc.fontes.find((f) => f.id === MANUAL).excluidaEm = '2026-11-17';
    gravarJ(raiz, arq('fontes.json'), doc);
    const apos = retrato(raiz);
    const l2 = (await cand()).corpo;
    const r = await importar({ ...com(MANUAL), revisao: l2.revisao });
    assert.equal(r.status, 422, r.bruto);
    assert.deepEqual(retrato(raiz), apos);
    assert.equal(fs.existsSync(path.join(raiz, 'data')), false);
  });
});

test('IM5. não são candidatos: vazio, pergunta sem resposta, fonte excluída ou revogada, texto de teste local, sem etapas', async () => {
  await comCopia(async ({ cand, raiz }) => {
    const docs = lerJ(raiz, ...arq('documentos.json'));
    const perg = lerJ(raiz, ...arq('perguntas-frequentes.json'));
    const cont = lerJ(raiz, ...arq('conteudo-assistente.json'));
    const fontes = lerJ(raiz, ...arq('fontes.json'));
    const svc = lerJ(raiz, ...arq('service.json'));
    const [d0, d1, d2] = docs.documentos;
    d0.descricao = '   ';
    d1.fonteId = REVOGADO;
    const [p0, p1] = perg.perguntas;
    p0.conteudoFonte = '';
    p0.respostaPublicavel = null;
    p1.fonteId = 'fonte-inexistente';
    const teste = cont.blocos.find((b) => b.tipo === 'descricao');
    teste.texto = `${teste.texto} (texto de teste local)`;
    svc.etapas = [];
    fontes.fontes.find((f) => f.id === MANUAL).excluidaEm = '2026-11-17';
    gravarJ(raiz, arq('documentos.json'), docs);
    gravarJ(raiz, arq('perguntas-frequentes.json'), perg);
    gravarJ(raiz, arq('conteudo-assistente.json'), cont);
    gravarJ(raiz, arq('fontes.json'), fontes);
    gravarJ(raiz, arq('service.json'), svc);
    const l = (await cand()).corpo;
    const refs = l.candidatos.map((c) => c.ref);
    assert.ok(!refs.includes(`documento:${d0.id}`), 'descrição vazia');
    assert.ok(!refs.includes(`documento:${d1.id}`), 'fonte revogada');
    assert.ok(refs.includes(`documento:${d2.id}`) || d2.fonteId === MANUAL);
    assert.ok(!refs.includes(`pergunta:${p0.id}`), 'pergunta sem resposta');
    assert.ok(!refs.includes(`pergunta:${p1.id}`), 'fonte inexistente');
    assert.ok(!refs.includes(`bloco:${teste.id}`), 'texto marcado como teste local');
    assert.ok(!refs.includes('etapas'), 'sem etapas');
    assert.ok(!l.candidatos.some((c) => c.fonteIds.includes(MANUAL)), 'fonte excluída nunca é sugerida');
    assert.ok(!refs.some((x) => x.endsWith(MANUAL)), 'fonte excluída não é candidata');
  });
  assert.deepEqual(listarCandidatos({ service: { descricao: 'Texto.' }, fontes: { fontes: [{ id: 'a', excluidaEm: '2026-01-01' }] }, conteudoAssistente: { blocos: [] } }), []);
});

test('IM6. fluxo normal até concluir; congelada recusa com 409; a nova versão importa e preserva a anterior', async () => {
  await comCopia(async ({ cand, importar, post, situacao, raiz }) => {
    let l = (await cand()).corpo;
    const r = await importar(corpoDe(l, 'descricao', l.revisao));
    assert.equal(r.status, 201, r.bruto);
    let s = await situacao();
    const id = s.blocos[0].id;
    if (s.fontes.find((f) => f.id === SEMA)?.podeRevisar) {
      assert.equal((await post('revisao/fontes', { fonteId: SEMA, revisao: s.revisao })).status, 200);
      s = await situacao();
    }
    assert.equal((await post('revisao/blocos/aceitar', { blocoId: id, revisao: s.revisao })).status, 200);
    s = await situacao();
    assert.equal((await post('revisao/concluir', { revisao: s.revisao })).status, 200, 'conclusão');
    const v1 = retrato(raiz).filter((x) => x.includes(`v1${path.sep}`));
    l = await cand();
    assert.deepEqual([l.status, l.corpo.erro], [409, 'versao_congelada']);
    s = await situacao();
    const recusada = await importar({ revisao: s.revisao, ref: 'etapas', titulo: 'T', texto: 'Texto.', fonteIds: [SEMA], referencias: [{ fonteId: SEMA, localizacao: 'p. 1' }] });
    assert.deepEqual([recusada.status, recusada.corpo.erro], [409, 'versao_congelada']);
    assert.deepEqual(retrato(raiz).filter((x) => x.includes(`v1${path.sep}`)), v1);
    assert.equal((await post('nova-versao', {})).status, 201);
    l = (await cand()).corpo;
    assert.ok(!l.candidatos.some((c) => c.ref === 'descricao'), 'o que já foi importado continua importado na nova versão');
    const ok = await importar(corpoDe(l, 'etapas', l.revisao));
    assert.equal(ok.status, 201, ok.bruto);
    assert.deepEqual(retrato(raiz).filter((x) => x.includes(`v1${path.sep}`)), v1, 'a versão anterior continua intacta byte a byte');
    const v2 = lerJ(raiz, ...arq('conteudo-assistente.json', 'v2')).blocos.filter((b) => b.tipo === 'conhecimento');
    assert.deepEqual(v2.map((b) => [b.origemImportacao.referencia, b.statusValidacao]).sort(), [['descricao', 'rascunho'], ['etapas', 'rascunho']]);
    assert.deepEqual(validarServicos(raiz).erros, []);
  });
});

test('IM7. revisão divergente: o conteúdo mudou depois da lista; recusa com 409 e não grava', async () => {
  await comCopia(async ({ cand, importar, post, situacao, raiz }) => {
    const l = (await cand()).corpo;
    // outra ação grava antes: cadastra uma informação, e a revisão muda
    const l0 = corpoDe(l, 'etapas', l.revisao);
    assert.equal((await importar(l0)).status, 201);
    const s = await situacao();
    assert.notEqual(s.revisao, l.revisao);
    const antes = retrato(raiz);
    const r = await importar(corpoDe(l, 'descricao', l.revisao));
    assert.deepEqual([r.status, r.corpo.erro], [409, 'revisao_divergente']);
    assert.deepEqual(retrato(raiz), antes);
    assert.ok(post);
  });
});

test('IM8. uma gravação por vez: segunda importação durante a primeira recebe 409 operacao_em_andamento', async () => {
  let liberar;
  const portao = new Promise((r) => { liberar = r; });
  let entrou;
  const aguardando = new Promise((r) => { entrou = r; });
  await comCopia(async ({ cand, importar, blocos }) => {
    const l = (await cand()).corpo;
    const primeira = importar(corpoDe(l, 'descricao', l.revisao));
    await aguardando;
    const segunda = await importar(corpoDe(l, 'etapas', l.revisao));
    assert.deepEqual([segunda.status, segunda.corpo.erro], [409, 'operacao_em_andamento']);
    liberar();
    assert.equal((await primeira).status, 201);
    assert.equal(blocos().length, 1);
  }, { opcoes: { antesDeGravar: () => { entrou(); return portao; } } });
});

test('IM9. rollback: falha em cada gravação (e conferência final recusada) desfaz tudo; o histórico não registra a ação', async () => {
  await comCopia(async ({ raiz, cand }) => {
    const l = (await cand()).corpo;
    const corpo = corpoDe(l, 'descricao', l.revisao);
    const { revisao, ref, ...entrada } = corpo;
    const antes = retrato(raiz);
    let total = 0;
    const contar = { ...fs, renameSync(o, d) { total += 1; return fs.renameSync(o, d); } };
    const ensaio = criarServicoRevisao({ raiz, sistema: contar, agora: AGORA, verificarFinal: () => ['recusado'] }).importarConteudo('lac', { revisao, ref, entrada });
    assert.deepEqual([ensaio.ok, ensaio.revertido], [false, true], JSON.stringify(ensaio));
    assert.ok(total >= 2, `gravações contadas: ${total}`);
    assert.deepEqual(retrato(raiz), antes);
    for (let k = 1; k <= total / 2 + 1; k += 1) {
      let n = 0;
      const sistema = { ...fs, renameSync(o, d) { n += 1; if (n === k) throw new Error('falha injetada'); return fs.renameSync(o, d); } };
      const r = criarServicoRevisao({ raiz, sistema, agora: AGORA }).importarConteudo('lac', { revisao, ref, entrada });
      assert.deepEqual([r.ok, r.revertido], [false, true], `falha no ponto ${k}`);
      assert.deepEqual(retrato(raiz), antes, `base alterada no ponto ${k}`);
    }
    assert.equal(criarHistoricoRevisao({ raiz }).listarAcoes('lac').registros.length, 0);
    assert.equal(criarServicoRevisao({ raiz, agora: AGORA }).importarConteudo('lac', { revisao, ref, entrada }).ok, true);
  });
});

test('IM10. histórico privado só com metadados (ação, tipo do item); sem texto, título nem URL', async () => {
  await comCopia(async ({ cand, importar, raiz, blocos }) => {
    const l = (await cand()).corpo;
    const link = l.candidatos.find((c) => c.tipo === 'link');
    const r = await importar(corpoDe(l, link.ref, l.revisao));
    assert.equal(r.status, 201, r.bruto);
    const h = criarHistoricoRevisao({ raiz }).listarAcoes('lac').registros;
    assert.deepEqual(h.map((x) => [x.acao, x.itemTipo, x.itemId]), [['importar_conteudo', 'link', blocos()[0].id]]);
    const bruto = JSON.stringify(h);
    assert.ok(!bruto.includes(link.titulo) && !bruto.includes('http') && !bruto.includes(link.texto.slice(0, 30)));
    assert.match(h[0].hashConteudo, /^[0-9a-f]{64}$/);
  });
});

test('IM11. corpo inválido: extras (id, estado, publicação), revisão ausente, referência desconhecida; erros sem eco', async () => {
  await comCopia(async ({ cand, importar, raiz }) => {
    const l = (await cand()).corpo;
    const base = corpoDe(l, 'descricao', l.revisao);
    const antes = retrato(raiz);
    for (const extra of [{ id: 'bc-meu' }, { statusValidacao: 'validado' }, { publicado: true }, { origemImportacao: { tipo: 'descricao', referencia: 'x' } }, { revisaoAtualidade: 'concluida' }]) {
      const r = await importar({ ...base, ...extra });
      assert.equal(r.status, 422, Object.keys(extra)[0]);
      assert.ok(!r.bruto.includes('bc-meu'));
    }
    const { revisao, ...semRevisao } = base;
    assert.ok(revisao);
    assert.equal((await importar(semRevisao)).status, 422);
    assert.equal((await importar({ ...base, revisao: 'abc' })).status, 422);
    const desconhecida = await importar({ ...base, ref: 'documento:nao-existe' });
    assert.deepEqual([desconhecida.status, desconhecida.corpo.erro], [404, 'candidato_nao_encontrado']);
    assert.equal((await importar({ ...base, ref: 'Inválido!' })).status, 422);
    const dado = await importar({ ...base, texto: 'Ligue para ' + ['(65)', '9'.repeat(5) + '-' + '9'.repeat(4)].join(' ') + ' para falar.' });
    assert.equal(dado.status, 422);
    assert.ok(!dado.bruto.includes('99999'));
    assert.deepEqual(retrato(raiz), antes);
    assert.deepEqual(validarCorpoImportacao([]), { ok: false, campos: ['corpo'] });
  });
});

test('IM12. o validador e os leitores toleram origemImportacao; formato inválido é recusado; o assistente não a vê', () => {
  const fonte = { id: 'f1', tipo: 'pagina_oficial', formaEntrada: 'link', publicado: true, statusValidacao: 'validado', vigencia: { situacao: 'nao_se_aplica' } };
  const bloco = (extra = {}) => ({
    id: 'b1', tipo: 'conhecimento', titulo: 'Título', texto: 'Texto de teste.', origem: 'fonte', fonteIds: ['f1'], referencias: [{ fonteId: 'f1', localizacao: 'item 1' }],
    ambiente: 'publico', statusValidacao: 'validado', publicado: true, revisaoAtualidade: 'concluida', criadoEm: '2026-11-10', atualizadoEm: '2026-11-10', ...extra,
  });
  const doc = (b) => ({ serviceId: 'lac', statusValidacao: 'em_validacao', blocos: [b] });
  const opcoes = { idServico: 'lac', fontesPorId: new Map([['f1', fonte]]) };
  const erros = (b) => validarConteudoAssistente(doc(b), opcoes);
  assert.deepEqual(erros(bloco({ origemImportacao: { tipo: 'link', referencia: 'link:f1' } })), []);
  assert.deepEqual(erros(bloco({ origemImportacao: { tipo: 'etapas', referencia: 'etapas' } })), []);
  assert.deepEqual(erros(bloco()), []);
  for (const ruim of [{ tipo: 'outro', referencia: 'x' }, { tipo: 'link' }, { tipo: 'link', referencia: 'Link:F1' }, { tipo: 'link', referencia: 'a', extra: 1 }, 'texto', null, []]) {
    assert.ok(erros(bloco({ origemImportacao: ruim })).some((e) => e.includes('origemImportacao')), JSON.stringify(ruim));
  }
  const limitacao = { id: 'l1', tipo: 'limitacao', texto: 'Texto.', origem: 'regra_institucional', fonteIds: [], ambiente: 'teste_local', statusValidacao: 'em_validacao', publicado: false, revisaoAtualidade: 'pendente', origemImportacao: { tipo: 'link', referencia: 'a' } };
  assert.ok(validarConteudoAssistente(doc(limitacao), opcoes).some((e) => e.includes('origemImportacao')));
  const liberados = selecionarBlocosAssistente({ conteudo: doc(bloco({ origemImportacao: { tipo: 'link', referencia: 'link:f1' } })), fontes: [fonte] }, 'publico');
  assert.equal(liberados.length, 1);
  assert.equal(Object.hasOwn(liberados[0], 'origemImportacao'), false);
});

test('IM13. a base real e o histórico real continuam intactos', () => {
  assert.deepEqual(retrato(RAIZ), RETRATO_REAL_ANTES);
  assert.equal(fs.existsSync(path.join(RAIZ, 'data')), EXISTIA_DATA);
});
