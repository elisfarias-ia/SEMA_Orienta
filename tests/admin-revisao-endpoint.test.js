// Passo 5B1: rotas administrativas da revisão. Requisições simuladas SEMPRE contra cópias temporárias fora do repositório, com
// dados fictícios. A base real e o armazenamento privado real não são tocados (retrato antes/depois).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { criarManipuladorAdmin, CABECALHO_TOKEN, ROTA_SESSAO } from '../services/admin/admin-endpoint.js';
import { validarServicos } from '../scripts/validate-services.js';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const AGORA = () => new Date(2026, 10, 17, 12, 0, 0);
const MANUAL = 'manual-lac-siga-2020';

function retrato(raiz) {
  const itens = [];
  const andar = (d) => {
    if (!fs.existsSync(d)) return;
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) {
        itens.push(`D ${path.relative(raiz, p)}`);
        andar(p);
      } else {
        itens.push(`F ${path.relative(raiz, p)} ${crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')}`);
      }
    }
  };
  andar(path.join(raiz, 'services'));
  return itens.sort();
}
const RETRATO_REAL_ANTES = retrato(RAIZ);
const EXISTIA_DATA = fs.existsSync(path.join(RAIZ, 'data'));

async function enviarBruto(m, { url, method = 'POST', corpo, token, host = 'localhost:5173' } = {}) {
  const buffer = method === 'GET' ? Buffer.alloc(0) : Buffer.from(JSON.stringify(corpo ?? {}));
  const headers = { host };
  if (method !== 'GET') { headers['content-type'] = 'application/json'; headers['content-length'] = String(buffer.length); }
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
const bloco = (id, fonteIds) => ({
  id, tipo: 'conhecimento', titulo: `Informação ${id}`, texto: 'Texto fictício de orientação.', fonteIds,
  referencias: fonteIds.map((f) => ({ fonteId: f, localizacao: 'página 1' })), origem: 'fonte', ambiente: 'publico',
  statusValidacao: 'rascunho', publicado: false, revisaoAtualidade: 'pendente', criadoEm: '2026-11-10', atualizadoEm: '2026-11-10',
});

async function comCopia(fn, opcoes = {}) {
  const pai = fs.mkdtempSync(path.join(os.tmpdir(), 'sema-orienta-revisao-ep-'));
  const raiz = path.join(pai, 'raiz');
  fs.mkdirSync(raiz);
  fs.cpSync(path.join(RAIZ, 'services'), path.join(raiz, 'services'), { recursive: true });
  const f = lerJ(raiz, ...arq('fontes.json'));
  f.fontes.find((x) => x.id === MANUAL).statusValidacao = 'em_validacao';
  gravarJ(raiz, arq('fontes.json'), f);
  const c = lerJ(raiz, ...arq('conteudo-assistente.json'));
  c.blocos.push(bloco('bc-um', [MANUAL]));
  gravarJ(raiz, arq('conteudo-assistente.json'), c);
  try {
    const m = criarManipuladorAdmin({ raiz, agora: AGORA, diretorioTemporario: pai, gerarToken: () => TOKEN_FIXO, ...opcoes });
    const token = await obterToken(m);
    const ctx = {
      m, token, raiz,
      post: (rota, corpo) => enviar(m, { url: `/__admin/servicos/lac/${rota}`, corpo, token }),
      situacao: async () => (await enviar(m, { url: '/__admin/servicos/lac/revisao', method: 'GET', token })).corpo,
    };
    await fn(ctx);
  } finally {
    fs.rmSync(pai, { recursive: true, force: true });
  }
}

test('E1. GET revisao: situação e pendências, sem caminhos nem texto original; exige token', async () => {
  await comCopia(async ({ m, token, situacao }) => {
    const r = await enviar(m, { url: '/__admin/servicos/lac/revisao', method: 'GET', token });
    assert.equal(r.status, 200);
    assert.deepEqual([r.corpo.estadoVersao, r.corpo.rotulo, r.corpo.editavel, r.corpo.podeConcluir], ['rascunho', 'Em elaboração', true, false]);
    assert.match(r.corpo.revisao, /^[0-9a-f]{64}$/);
    assert.ok(r.corpo.pendencias.some((p) => p.codigo === 'fonte_pendente'));
    assert.ok(!/[A-Za-z]:\\|services\/|node_modules/.test(r.bruto));
    assert.equal((await enviar(m, { url: '/__admin/servicos/lac/revisao', method: 'GET' })).status, 401);
    assert.equal((await enviar(m, { url: '/__admin/servicos/nao-existe/revisao', method: 'GET', token })).status, 404);
    assert.equal((await enviar(m, { url: '/__admin/servicos/lac/revisao', method: 'POST', token, corpo: {} })).status, 405);
    assert.ok((await situacao()).fontes.length > 0);
  });
});

test('E2. fluxo completo pelas rotas: revisar fonte, aceitar bloco, concluir; nada é publicado; edição posterior recusada', async () => {
  await comCopia(async ({ post, situacao, raiz }) => {
    let s = await situacao();
    let r = await post('revisao/fontes', { fonteId: MANUAL, revisao: s.revisao });
    assert.equal(r.status, 200);
    assert.match(r.corpo.revisao, /^[0-9a-f]{64}$/);
    s = await situacao();
    assert.equal(s.revisao, r.corpo.revisao);
    r = await post('revisao/blocos/aceitar', { blocoId: 'bc-um', revisao: s.revisao });
    assert.equal(r.status, 200);
    s = await situacao();
    assert.deepEqual([s.podeConcluir, s.pendencias], [true, []]);
    r = await post('revisao/concluir', { revisao: s.revisao });
    assert.deepEqual([r.status, r.corpo.estado, r.corpo.revisao], [200, 'validado_materialmente', s.revisao]);
    const reg = lerJ(raiz, 'services', 'registry.json').servicos[0];
    assert.deepEqual([reg.versaoPublicadaId, reg.publicado], [null, false]);
    assert.equal(lerJ(raiz, ...arq('versao.json')).hashConteudo, s.revisao);
    assert.deepEqual(validarServicos(raiz).erros, []);
    // depois de concluída: nenhuma edição, em nenhuma rota
    for (const [rota, corpo] of [['revisao/fontes', { fonteId: 'tr-176-lac', revisao: s.revisao }], ['revisao/blocos/aceitar', { blocoId: 'bc-um', revisao: s.revisao }],
      ['revisao/blocos/rejeitar', { blocoId: 'bc-um', revisao: s.revisao }], ['revisao/concluir', { revisao: s.revisao }]]) {
      const x = await post(rota, corpo);
      assert.deepEqual([x.status, x.corpo.erro], [409, 'versao_congelada'], rota);
    }
    const edit = await post('conhecimentos', { titulo: 'Novo', texto: 'Texto', fonteIds: [MANUAL], referencias: [{ fonteId: MANUAL, localizacao: 'p. 1' }] });
    assert.equal(edit.status, 409, 'as rotas existentes de edição também recusam versão congelada');
    const texto = await post('entradas-texto', { titulo: 'Texto', texto: 'Texto fictício.' });
    assert.equal(texto.status, 409);
    const link = await post('links', { titulo: 'Link', tipo: 'pagina_oficial', orgaoResponsavel: 'Órgão', url: 'https://exemplo.test/x', descricao: 'Descrição.', origemOficial: true });
    assert.equal(link.status, 409);
  });
});

test('E3. nova versão pela rota: cria a v2 em elaboração, preserva a v1; recusada em elaboração', async () => {
  await comCopia(async ({ post, situacao, raiz }) => {
    assert.equal((await post('nova-versao', {})).status, 409);
    let s = await situacao();
    await post('revisao/fontes', { fonteId: MANUAL, revisao: s.revisao });
    s = await situacao();
    await post('revisao/blocos/aceitar', { blocoId: 'bc-um', revisao: s.revisao });
    s = await situacao();
    assert.equal((await post('revisao/concluir', { revisao: s.revisao })).status, 200);
    const v1 = retrato(raiz).filter((l) => l.includes(`v1${path.sep}`));
    const r = await post('nova-versao', {});
    assert.deepEqual([r.status, r.corpo.numero], [201, 2]);
    assert.deepEqual(retrato(raiz).filter((l) => l.includes(`v1${path.sep}`)), v1);
    const nova = await situacao();
    assert.deepEqual([nova.rotulo, nova.editavel, nova.estadoVersao], ['Em elaboração', true, 'rascunho']);
    assert.deepEqual(validarServicos(raiz).erros, []);
  });
});

test('E4. erros: revisão divergente 409, concluir incompleto 422 com pendências, corpo com campos extras 422, ids inválidos', async () => {
  await comCopia(async ({ post, situacao }) => {
    const s = await situacao();
    assert.deepEqual((await post('revisao/fontes', { fonteId: MANUAL, revisao: 'a'.repeat(64) })).corpo, { erro: 'revisao_divergente' });
    const inc = await post('revisao/concluir', { revisao: s.revisao });
    assert.equal(inc.status, 422);
    assert.equal(inc.corpo.erro, 'revisao_incompleta');
    assert.ok(inc.corpo.pendencias.some((p) => p.codigo === 'sem_bloco_aceito'));
    for (const [rota, corpo] of [
      ['revisao/fontes', { fonteId: MANUAL, revisao: s.revisao, statusValidacao: 'validado' }], ['revisao/fontes', { fonteId: 'X', revisao: s.revisao }],
      ['revisao/blocos/aceitar', { blocoId: 'bc-um' }], ['revisao/concluir', { revisao: s.revisao, hash: s.revisao }], ['nova-versao', { x: 1 }],
    ]) {
      const x = await post(rota, corpo);
      assert.deepEqual([x.status, x.corpo.erro], [422, 'dados_invalidos'], rota);
    }
    assert.equal((await post('revisao/fontes', { fonteId: 'nao-existe', revisao: s.revisao })).status, 404);
    assert.equal((await post('revisao/blocos/aceitar', { blocoId: 'bc-um', revisao: s.revisao })).corpo.erro, 'fonte_pendente');
  });
});

test('E5. acesso: sem token 401, host não local 403, rota de outro serviço 404; erros não vazam caminho nem conteúdo', async () => {
  await comCopia(async ({ m, token, situacao }) => {
    const s = await situacao();
    const url = '/__admin/servicos/lac/revisao/fontes';
    assert.equal((await enviar(m, { url, corpo: { fonteId: MANUAL, revisao: s.revisao } })).status, 401);
    assert.equal((await enviar(m, { url, corpo: { fonteId: MANUAL, revisao: s.revisao }, token, host: 'exemplo.test' })).status, 403);
    assert.equal((await enviar(m, { url: '/__admin/servicos/nao-existe/revisao/concluir', corpo: { revisao: s.revisao }, token })).status, 404);
    const e = await enviar(m, { url, corpo: { fonteId: MANUAL, revisao: 'b'.repeat(64) }, token });
    assert.ok(!/[A-Za-z]:\\|\/Users\/|services\/|stack|ENOENT/.test(e.bruto));
  });
});

test('E6. trava comum: uma gravação por vez; a segunda recebe 409 operacao_em_andamento sem alterar nada', async () => {
  let liberar;
  const portao = new Promise((r) => { liberar = r; });
  let entrou;
  const chegou = new Promise((r) => { entrou = r; });
  let armado = false;
  await comCopia(async ({ m, token, situacao, raiz }) => {
    const s = await situacao();
    armado = true;
    const p1 = enviar(m, { url: '/__admin/servicos/lac/revisao/fontes', corpo: { fonteId: MANUAL, revisao: s.revisao }, token });
    await chegou;
    const antes = retrato(raiz);
    for (const [rota, corpo] of [['revisao/fontes', { fonteId: 'tr-176-lac', revisao: s.revisao }], ['revisao/blocos/aceitar', { blocoId: 'bc-um', revisao: s.revisao }],
      ['revisao/blocos/rejeitar', { blocoId: 'bc-um', revisao: s.revisao }], ['revisao/concluir', { revisao: s.revisao }], ['nova-versao', {}]]) {
      const r = await enviar(m, { url: `/__admin/servicos/lac/${rota}`, corpo, token });
      assert.deepEqual([r.status, r.corpo.erro], [409, 'operacao_em_andamento'], rota);
    }
    assert.deepEqual(retrato(raiz), antes);
    liberar();
    assert.equal((await p1).status, 200);
  }, { antesDeGravar: async () => { if (armado) { armado = false; entrou(); await portao; } } });
});

test('E7. rollback pela rota: falha na conferência final deixa a base e o histórico como estavam', async () => {
  let recusar = false;
  await comCopia(async ({ post, situacao, raiz }) => {
    const s = await situacao();
    const antes = retrato(raiz);
    recusar = true;
    const r = await post('revisao/fontes', { fonteId: MANUAL, revisao: s.revisao });
    assert.ok([422, 500].includes(r.status));
    assert.deepEqual(retrato(raiz), antes);
    assert.equal(fs.existsSync(path.join(raiz, 'data', 'admin-private', 'revisao', 'lac.jsonl')), false);
  }, { verificarFinal: (r) => (recusar ? ['recusado'] : validarServicos(r).erros) });
});

test('E9. reabrir bloco pela rota: 200 antes de concluir, 422 se não está aceito, 409 depois de concluir; corpo só com blocoId e revisao', async () => {
  await comCopia(async ({ post, situacao }) => {
    let s = await situacao();
    assert.deepEqual([(await post('revisao/blocos/reabrir', { blocoId: 'bc-um', revisao: s.revisao })).status], [422]);
    await post('revisao/fontes', { fonteId: MANUAL, revisao: s.revisao });
    s = await situacao();
    await post('revisao/blocos/aceitar', { blocoId: 'bc-um', revisao: s.revisao });
    s = await situacao();
    assert.equal(s.blocos[0].podeReabrir, true);
    assert.equal((await post('revisao/blocos/reabrir', { blocoId: 'bc-um', revisao: s.revisao, x: 1 })).status, 422);
    const r = await post('revisao/blocos/reabrir', { blocoId: 'bc-um', revisao: s.revisao });
    assert.deepEqual([r.status, typeof r.corpo.revisao], [200, 'string']);
    s = await situacao();
    assert.deepEqual([s.blocos[0].aceito, s.resumo.informacoesPendentes, s.rotulo], [false, 1, 'Em elaboração']);
    await post('revisao/blocos/aceitar', { blocoId: 'bc-um', revisao: s.revisao });
    s = await situacao();
    assert.equal((await post('revisao/concluir', { revisao: s.revisao })).status, 200);
    const x = await post('revisao/blocos/reabrir', { blocoId: 'bc-um', revisao: s.revisao });
    assert.deepEqual([x.status, x.corpo.erro], [409, 'versao_congelada']);
  });
});

test('E8. a LAC real e o armazenamento privado real não foram alterados por nenhum teste deste arquivo', () => {
  assert.deepEqual(retrato(RAIZ), RETRATO_REAL_ANTES);
  assert.equal(fs.existsSync(path.join(RAIZ, 'data')), EXISTIA_DATA);
});
