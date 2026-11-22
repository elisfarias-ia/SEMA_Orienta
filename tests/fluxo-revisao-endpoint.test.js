// Sprint 8, Passo 8D: rotas do envio para revisão (Cadastrante), da validação material e do pedido de ajustes (Revisor), com
// requisições simuladas (sem abrir porta). A rota antiga revisao/concluir responde 404. O motivo dos ajustes nunca sai em
// resposta de gravação nem em log (console espionado); só a consulta GET da situação o devolve, e só em ajustes solicitados.
// Usuários FICTÍCIOS (Maria Silva, Cadastrante; Carlos Silva, Revisor). Tudo em cópias temporárias fora do repositório.

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
import { MARIA } from './admin-auxiliar.js';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const AGORA = () => new Date(2026, 10, 21, 12, 0, 0);
const MANUAL = 'manual-lac-siga-2020';
const MOTIVO = 'CANARIO-8D-MOTIVO Ajustar o prazo fictício da etapa 2.';
const BASE = '/__admin/servicos/lac';

function retrato(raiz, sub = 'services') {
  const itens = [];
  const andar = (d) => {
    if (!fs.existsSync(d)) return;
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) andar(p);
      else itens.push(`${path.relative(raiz, p)} ${crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')}`);
    }
  };
  andar(path.join(raiz, sub));
  return itens.sort();
}
const RETRATO_REAL_ANTES = retrato(RAIZ);
const RETRATO_DATA_REAL_ANTES = retrato(RAIZ, 'data');
const arq = (nome) => ['services', 'lac', 'versoes', 'v1', nome];
const lerJ = (raiz, ...p) => JSON.parse(fs.readFileSync(path.join(raiz, ...p), 'utf8'));
const gravarJ = (raiz, p, d) => fs.writeFileSync(path.join(raiz, ...p), `${JSON.stringify(d, null, 2)}\n`);

/** Requisição simulada. `lido` diz se o corpo chegou a ser consumido pelo manipulador. */
async function chamar(m, { url, method = 'POST', corpo, token } = {}) {
  const buffer = Buffer.from(corpo === undefined ? '' : JSON.stringify(corpo));
  let consumido = false;
  let entregue = false;
  const stream = new Readable({
    read() {
      consumido = true;
      if (!entregue && buffer.length > 0) { entregue = true; this.push(buffer); }
      this.push(null);
    },
  });
  const h = { host: 'localhost:5173' };
  if (buffer.length > 0) { h['content-type'] = 'application/json'; h['content-length'] = String(buffer.length); }
  if (token !== undefined) h[CABECALHO_TOKEN] = token;
  let resposta = null;
  const res = { statusCode: 0, setHeader: () => {}, end: (t) => { resposta = t ?? null; } };
  await m(Object.assign(stream, { url, method, headers: h, socket: { remoteAddress: '127.0.0.1', localPort: 5173 } }), res, () => {});
  return { status: res.statusCode, corpo: resposta === null || resposta === '' ? null : JSON.parse(resposta), bruto: resposta ?? '', lido: consumido };
}
const entrar = async (m, usuarioId) => (await chamar(m, { url: ROTA_SESSAO, corpo: { usuarioId } })).corpo.token;

/** Cópia com a LAC pronta para envio (fonte revisada e informação aceita por Maria, pelas funções). Console espionado. */
async function comCopia(fn) {
  const pai = fs.mkdtempSync(path.join(os.tmpdir(), 'sema-orienta-fluxo-rotas-'));
  const raiz = path.join(pai, 'raiz');
  fs.mkdirSync(raiz);
  fs.cpSync(path.join(RAIZ, 'services'), path.join(raiz, 'services'), { recursive: true });
  const f = lerJ(raiz, ...arq('fontes.json'));
  f.fontes.find((x) => x.id === MANUAL).statusValidacao = 'em_validacao';
  gravarJ(raiz, arq('fontes.json'), f);
  const c = lerJ(raiz, ...arq('conteudo-assistente.json'));
  c.blocos.push({
    id: 'bc-rotas', tipo: 'conhecimento', titulo: 'Informação fictícia 8D', texto: 'Orientação fictícia.', fonteIds: [MANUAL],
    referencias: [{ fonteId: MANUAL, localizacao: 'página 1' }], origem: 'fonte', ambiente: 'publico', statusValidacao: 'rascunho', publicado: false,
    revisaoAtualidade: 'pendente', criadoEm: '2026-11-10', atualizadoEm: '2026-11-10',
  });
  gravarJ(raiz, arq('conteudo-assistente.json'), c);
  const rev = criarServicoRevisao({ raiz, agora: AGORA });
  const sit = () => rev.consultar('lac').situacao;
  assert.equal(rev.revisarFonte('lac', { ator: MARIA, fonteId: MANUAL, revisao: sit().revisao }).ok, true);
  assert.equal(rev.aceitarBloco('lac', { ator: MARIA, blocoId: 'bc-rotas', revisao: sit().revisao }).ok, true);
  const saidas = [];
  const originais = {};
  for (const nome of ['log', 'info', 'warn', 'error', 'debug']) {
    originais[nome] = console[nome];
    console[nome] = (...args) => { saidas.push(args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ')); };
  }
  try {
    const m = criarManipuladorAdmin({ raiz, agora: AGORA, diretorioTemporario: pai });
    const situacao = async (token) => (await chamar(m, { url: `${BASE}/revisao`, method: 'GET', token })).corpo;
    return await fn({ raiz, m, situacao, saidas });
  } finally {
    for (const nome of Object.keys(originais)) console[nome] = originais[nome];
    fs.rmSync(pai, { recursive: true, force: true });
  }
}

test('FE1. as três rotas: Maria envia (200 { revisao, estado }), Carlos valida; nada é publicado; nada em log', async () => {
  await comCopia(async ({ raiz, m, situacao, saidas }) => {
    let token = await entrar(m, 'maria-silva');
    const s = await situacao(token);
    assert.deepEqual([s.podeEnviar, s.podeValidar, s.motivoAjustes], [true, false, null]);
    const e = await chamar(m, { url: `${BASE}/revisao/enviar`, corpo: { revisao: s.revisao }, token });
    assert.deepEqual([e.status, e.corpo], [200, { revisao: s.revisao, estado: 'em_validacao' }]);
    const analise = await situacao(token);
    assert.deepEqual([analise.rotulo, analise.podeValidar, analise.podeSolicitarAjustes], ['Em análise', true, true]);
    token = await entrar(m, 'carlos-silva');
    const v = await chamar(m, { url: `${BASE}/revisao/validar`, corpo: { revisao: s.revisao }, token });
    assert.deepEqual([v.status, v.corpo], [200, { revisao: s.revisao, estado: 'validado_materialmente' }]);
    assert.equal(lerJ(raiz, ...arq('versao.json')).estado, 'validado_materialmente');
    assert.equal(lerJ(raiz, 'services', 'registry.json').servicos.find((x) => x.id === 'lac').publicado, false);
    assert.deepEqual(saidas, []);
  });
});

test('FE2. perfil errado: 403 perfil_sem_permissao antes de ler o corpo (Carlos não envia; Maria não valida nem pede ajustes)', async () => {
  await comCopia(async ({ raiz, m, situacao }) => {
    let token = await entrar(m, 'carlos-silva');
    const s = await situacao(token);
    const antes = retrato(raiz);
    const r = await chamar(m, { url: `${BASE}/revisao/enviar`, corpo: { revisao: s.revisao }, token });
    assert.deepEqual([r.status, r.corpo, r.lido], [403, { erro: 'perfil_sem_permissao' }, false]);
    token = await entrar(m, 'maria-silva');
    assert.equal((await chamar(m, { url: `${BASE}/revisao/enviar`, corpo: { revisao: s.revisao }, token })).status, 200);
    const depois = retrato(raiz);
    for (const [rota, corpo] of [['revisao/validar', { revisao: s.revisao }], ['revisao/ajustes', { revisao: s.revisao, motivo: MOTIVO }]]) {
      const x = await chamar(m, { url: `${BASE}/${rota}`, corpo, token });
      assert.deepEqual([x.status, x.corpo, x.lido], [403, { erro: 'perfil_sem_permissao' }, false], rota);
    }
    assert.notDeepEqual(depois, antes);
    assert.deepEqual(retrato(raiz), depois);
    // As recusas ficam no histórico privado de negadas, sem corpo nem motivo.
    const negadas = fs.readFileSync(path.join(raiz, 'data', 'admin-private', 'negadas', 'historico.jsonl'), 'utf8');
    assert.deepEqual(negadas.trim().split('\n').map((l) => JSON.parse(l).acao), ['enviar_para_revisao', 'validar_materialmente', 'solicitar_ajustes']);
    assert.ok(!negadas.includes('CANARIO-8D'));
  });
});

test('FE3. a rota antiga revisao/concluir não existe: 404 genérico para qualquer método e usuário, sem ler o corpo nem gravar', async () => {
  await comCopia(async ({ raiz, m, situacao }) => {
    for (const usuario of ['maria-silva', 'carlos-silva']) {
      const token = await entrar(m, usuario);
      const s = await situacao(token);
      const antes = retrato(raiz);
      for (const method of ['POST', 'GET', 'PUT']) {
        const r = await chamar(m, { url: `${BASE}/revisao/concluir`, method, corpo: method === 'GET' ? undefined : { revisao: s.revisao }, token });
        assert.deepEqual([r.status, r.corpo, r.lido], [404, { erro: 'nao_encontrado' }, false], `${usuario} ${method}`);
      }
      assert.deepEqual(retrato(raiz), antes);
    }
    assert.equal((await chamar(m, { url: '/__admin/servicos/nao-existe/revisao/concluir', corpo: {} })).status, 404);
    assert.equal(fs.existsSync(path.join(raiz, 'data', 'admin-private', 'negadas')), false, 'a rota antiga não é registrada como recusa');
  });
});

test('FE4. corpos: campos extras ou revisão inválida → 422 dados_invalidos; estado e revisão errados → 409; motivo inválido → 422', async () => {
  await comCopia(async ({ m, situacao }) => {
    let token = await entrar(m, 'maria-silva');
    const s = await situacao(token);
    for (const corpo of [{ revisao: s.revisao, hash: s.revisao }, { revisao: 'curta' }, {}, { revisao: s.revisao, motivo: 'x' }]) {
      const r = await chamar(m, { url: `${BASE}/revisao/enviar`, corpo, token });
      assert.deepEqual([r.status, r.corpo.erro], [422, 'dados_invalidos'], JSON.stringify(corpo));
    }
    assert.deepEqual((await chamar(m, { url: `${BASE}/revisao/enviar`, corpo: { revisao: 'a'.repeat(64) }, token })).corpo, { erro: 'revisao_divergente' });
    token = await entrar(m, 'carlos-silva');
    assert.deepEqual((await chamar(m, { url: `${BASE}/revisao/validar`, corpo: { revisao: s.revisao }, token })).corpo, { erro: 'estado_invalido' }, 'ainda em elaboração');
    token = await entrar(m, 'maria-silva');
    assert.equal((await chamar(m, { url: `${BASE}/revisao/enviar`, corpo: { revisao: s.revisao }, token })).status, 200);
    assert.deepEqual((await chamar(m, { url: `${BASE}/revisao/enviar`, corpo: { revisao: s.revisao }, token })).corpo, { erro: 'versao_congelada' });
    token = await entrar(m, 'carlos-silva');
    for (const corpo of [{ revisao: s.revisao, motivo: MOTIVO, estado: 'x' }, { motivo: MOTIVO }, { revisao: s.revisao, motivo: 'x', extra: true }]) {
      const r = await chamar(m, { url: `${BASE}/revisao/ajustes`, corpo, token });
      assert.deepEqual([r.status, r.corpo.erro], [422, 'dados_invalidos'], JSON.stringify(corpo));
      assert.ok(!r.bruto.includes('CANARIO-8D'));
    }
    assert.deepEqual((await chamar(m, { url: `${BASE}/revisao/validar`, corpo: { revisao: s.revisao, motivo: 'x' }, token })).corpo.erro, 'dados_invalidos');
    const arroba = '@';
    for (const motivo of ['', '   ', 'x'.repeat(501), `Fale com pessoa${arroba}provedor.com.br`, 7]) {
      const r = await chamar(m, { url: `${BASE}/revisao/ajustes`, corpo: { revisao: s.revisao, motivo }, token });
      assert.deepEqual([r.status, r.corpo], [422, { erro: 'motivo_invalido' }], JSON.stringify(motivo));
    }
    assert.deepEqual((await chamar(m, { url: `${BASE}/revisao/ajustes`, corpo: { revisao: 'b'.repeat(64), motivo: MOTIVO }, token })).corpo, { erro: 'revisao_divergente' });
  });
});

test('FE5. ajustes: o motivo nunca sai em resposta de gravação nem em log; o GET da situação o devolve só em ajustes solicitados', async () => {
  await comCopia(async ({ raiz, m, situacao, saidas }) => {
    let token = await entrar(m, 'maria-silva');
    const s = await situacao(token);
    assert.equal((await chamar(m, { url: `${BASE}/revisao/enviar`, corpo: { revisao: s.revisao }, token })).status, 200);
    token = await entrar(m, 'carlos-silva');
    assert.equal((await situacao(token)).motivoAjustes, null, 'em análise não há motivo');
    const r = await chamar(m, { url: `${BASE}/revisao/ajustes`, corpo: { revisao: s.revisao, motivo: MOTIVO }, token });
    assert.deepEqual([r.status, r.corpo], [200, { revisao: s.revisao, estado: 'ajustes_solicitados' }]);
    assert.ok(!r.bruto.includes('CANARIO-8D'));
    // Gravações seguintes (recusadas) também não devolvem o motivo.
    for (const rota of ['revisao/ajustes', 'revisao/validar']) {
      const x = await chamar(m, { url: `${BASE}/${rota}`, corpo: rota === 'revisao/ajustes' ? { revisao: s.revisao, motivo: MOTIVO } : { revisao: s.revisao }, token });
      assert.deepEqual([x.status, x.corpo], [409, { erro: 'estado_invalido' }], rota);
    }
    const resumo = await chamar(m, { url: `${BASE}/publicacao/resumo`, method: 'GET', token });
    assert.ok(!resumo.bruto.includes('CANARIO-8D'));
    // O GET da situação (local, com token) é a única leitura com o motivo, para Maria e para Carlos.
    assert.equal((await situacao(token)).motivoAjustes, MOTIVO);
    token = await entrar(m, 'maria-silva');
    const comMotivo = await situacao(token);
    assert.deepEqual([comMotivo.rotulo, comMotivo.motivoAjustes], ['Ajustes solicitados', MOTIVO]);
    assert.equal((await chamar(m, { url: `${BASE}/revisao`, method: 'GET' })).status, 401, 'sem token não há situação');
    // Na nova versão o motivo não aparece mais.
    const nova = await chamar(m, { url: `${BASE}/nova-versao`, corpo: {}, token });
    assert.deepEqual([nova.status, nova.corpo.numero], [201, 2]);
    assert.ok(!nova.bruto.includes('CANARIO-8D'));
    assert.equal((await situacao(token)).motivoAjustes, null);
    // Em services/ (o que vai para o Git) o motivo não existe; no histórico de ações também não.
    for (const linha of retrato(raiz)) {
      const relativo = linha.split(' ')[0];
      assert.ok(!fs.readFileSync(path.join(raiz, relativo), 'utf8').includes('CANARIO-8D'), relativo);
    }
    assert.ok(!fs.readFileSync(path.join(raiz, 'data', 'admin-private', 'revisao', 'lac.jsonl'), 'utf8').includes('CANARIO-8D'));
    assert.ok(fs.readFileSync(path.join(raiz, 'data', 'admin-private', 'decisoes', 'lac.jsonl'), 'utf8').includes('CANARIO-8D'), 'só a decisão privada guarda o motivo');
    assert.deepEqual(saidas, [], 'nada foi escrito em log');
  });
});

test('FE6. a LAC real e o armazenamento privado real não foram alterados por nenhum teste deste arquivo', () => {
  assert.deepEqual(retrato(RAIZ), RETRATO_REAL_ANTES);
  assert.deepEqual(retrato(RAIZ, 'data'), RETRATO_DATA_REAL_ANTES);
});
