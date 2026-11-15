// Gestão simples por serviço (Sprint 4, Passo 4B2): rotas novas do endpoint administrativo. Requisições simuladas SEMPRE contra
// cópias temporárias fora do repositório, com dados fictícios. A base real não é tocada (os testes comparam o hash da LAC).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { criarManipuladorAdmin, CABECALHO_TOKEN, ROTA_SESSAO, ROTA_SERVICO_COM_TEMA } from '../services/admin/admin-endpoint.js';
import { validarServicos } from '../scripts/validate-services.js';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const AGORA = () => new Date(2026, 10, 15, 12, 0, 0);
const CANARIO = 'CANARIO-SIMPLES-ORIENTACAO-FICTICIA-8842 que não pode aparecer fora da administração.';
const LINK = { titulo: 'Link novo fictício', tipo: 'pagina_oficial', orgaoResponsavel: 'Órgão fictício', url: 'https://exemplo.test/link-novo', descricao: 'Descrição fictícia.', origemOficial: true };

async function enviar(m, { url, method = 'POST', corpo, token, host = 'localhost:5173' } = {}) {
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

function hashDaPasta(dir) {
  const h = crypto.createHash('sha256');
  const andar = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) andar(p);
      else h.update(path.relative(dir, p)).update(fs.readFileSync(p));
    }
  };
  andar(dir);
  return h.digest('hex');
}

async function comCopia(fn, opcoes = {}) {
  const pai = fs.mkdtempSync(path.join(os.tmpdir(), 'sema-orienta-simples-'));
  const raiz = path.join(pai, 'raiz');
  fs.mkdirSync(raiz);
  fs.cpSync(path.join(RAIZ, 'services'), path.join(raiz, 'services'), { recursive: true });
  const hashReal = hashDaPasta(path.join(RAIZ, 'services'));
  try {
    const m = criarManipuladorAdmin({ raiz, agora: AGORA, diretorioTemporario: pai, ...opcoes });
    const token = (await enviar(m, { url: ROTA_SESSAO, method: 'GET' })).corpo.token;
    const ctx = {
      m, token, raiz,
      post: (url, corpo) => enviar(m, { url, corpo, token }),
      get: (url) => enviar(m, { url, method: 'GET', token }),
      catalogo: async () => (await enviar(m, { url: '/__admin/catalogo', method: 'GET', token })).corpo,
      criarServico: async (nome, tema) => (await enviar(m, { url: ROTA_SERVICO_COM_TEMA, corpo: { nome, tema }, token })).corpo.servico.id,
    };
    await fn(ctx);
    assert.equal(hashDaPasta(path.join(RAIZ, 'services')), hashReal, 'a base real não pode mudar');
  } finally {
    fs.rmSync(pai, { recursive: true, force: true });
  }
}

test('S1. serviço novo com tema novo: ids gerados pelo servidor, tema sem descrição, entradas.json vazio e base válida', async () => {
  await comCopia(async ({ post, raiz, catalogo }) => {
    const r = await post(ROTA_SERVICO_COM_TEMA, { nome: 'Serviço Simples Fictício', tema: { nome: 'Tema Simples Fictício' } });
    assert.equal(r.status, 201);
    assert.equal(r.corpo.temaCriado, true);
    const { servico } = r.corpo;
    assert.match(servico.id, /^[a-z][a-z0-9-]*$/);
    const cat = await catalogo();
    assert.ok(cat.servicos.some((s) => s.id === servico.id && s.nome === 'Serviço Simples Fictício'));
    const tema = cat.assuntos.find((a) => a.id === servico.assuntoId);
    assert.equal(tema.nome, 'Tema Simples Fictício');
    assert.equal('descricao' in tema, false);
    const pasta = path.join(raiz, 'services', servico.id, 'versoes', 'v1');
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(pasta, 'entradas.json'), 'utf8')), { servicoId: servico.id, entradas: [] });
    assert.deepEqual(validarServicos(raiz).erros, []);
  });
});

test('S2. serviço novo com tema existente (por id ou digitado igual) reutiliza o tema; validações e duplicidade', async () => {
  await comCopia(async ({ post, catalogo }) => {
    const antes = await catalogo();
    const temaId = antes.assuntos[0].id;
    const a = await post(ROTA_SERVICO_COM_TEMA, { nome: 'Serviço Um Fictício', tema: { id: temaId } });
    assert.equal(a.status, 201);
    assert.equal(a.corpo.servico.assuntoId, temaId);
    const b = await post(ROTA_SERVICO_COM_TEMA, { nome: 'Serviço Dois Fictício', tema: { nome: antes.assuntos[0].nome.toUpperCase() } });
    assert.equal(b.status, 201);
    assert.equal(b.corpo.temaCriado, false);
    assert.equal(b.corpo.servico.assuntoId, temaId);
    assert.equal((await catalogo()).assuntos.length, antes.assuntos.length);
    assert.deepEqual((await post(ROTA_SERVICO_COM_TEMA, { nome: 'serviço um fictício', tema: { id: temaId } })).corpo, { erro: 'ja_existe', campo: 'nome' });
    for (const corpo of [{ nome: 'X', tema: { id: temaId }, sigla: 'S' }, { nome: '', tema: { id: temaId } }, { nome: 'Serviço Três', tema: {} },
      { nome: 'Serviço Três', tema: { id: temaId, nome: 'x' } }, { nome: 'Serviço Três', tema: { id: 'nao-existe' } }, { nome: 'Serviço Três' }, []]) {
      const r = await post(ROTA_SERVICO_COM_TEMA, corpo);
      assert.equal(r.status, 422, JSON.stringify(corpo));
    }
  });
});

test('S3. texto: grava pela rota, aparece só na lista do serviço, recusa credencial e dado pessoal sem repetir o conteúdo', async () => {
  await comCopia(async ({ post, get, criarServico, raiz }) => {
    const id = await criarServico('Serviço Texto Fictício', { nome: 'Tema Texto Fictício' });
    const rota = `/__admin/servicos/${id}/entradas-texto`;
    const ok = await post(rota, { titulo: 'Orientação fictícia', texto: CANARIO });
    assert.equal(ok.status, 201);
    assert.ok(!ok.bruto.includes('CANARIO'));
    const lista = (await get(`/__admin/servicos/${id}/informacoes`)).corpo;
    assert.equal(lista.itens.length, 1);
    assert.equal(lista.itens[0].tipo, 'texto');
    assert.equal(lista.itens[0].texto, CANARIO);
    assert.equal(lista.estadoVersao, 'rascunho');
    assert.ok(!JSON.stringify(lista).match(/[0-9a-f]{64}/));
    for (const corpo of [{ titulo: 'T', texto: 'senha: 99887766' }, { titulo: 'senha=abc', texto: 'x' }, { titulo: 'T', texto: 'x', descricao: 'token: abcdef' },
      { titulo: 'T', texto: 'fale com fulano' + '@' + 'exemplo.test' }, { titulo: 'T', texto: 'x', id: 'abc' }, { titulo: 'T', texto: '' }]) {
      const r = await post(rota, corpo);
      assert.equal(r.status, 422, JSON.stringify(corpo));
      assert.ok(!r.bruto.includes('99887766') && !r.bruto.includes('abcdef') && !r.bruto.includes('fulano'));
    }
    assert.equal((await post('/__admin/servicos/nao-existe/entradas-texto', { titulo: 'T', texto: 'x' })).status, 404);
    assert.equal(JSON.parse(fs.readFileSync(path.join(raiz, 'services', id, 'versoes', 'v1', 'entradas.json'), 'utf8')).entradas.length, 1);
    assert.deepEqual(validarServicos(raiz).erros, []);
  });
});

test('S4. link novo: id gerado pelo servidor, nasce em rascunho, URL repetida e campos extras recusados', async () => {
  await comCopia(async ({ post, get, criarServico }) => {
    const id = await criarServico('Serviço Link Fictício', { nome: 'Tema Link Fictício' });
    const rota = `/__admin/servicos/${id}/links`;
    const ok = await post(rota, LINK);
    assert.equal(ok.status, 201);
    assert.equal(ok.corpo.fonte.statusValidacao, 'rascunho');
    assert.equal(ok.corpo.fonte.publicado, false);
    assert.equal((await post(rota, LINK)).status, 409);
    for (const extra of [{ id: 'meu-id' }, { revisao: 'a'.repeat(64) }, { publicado: true }, { statusValidacao: 'validado' }]) {
      assert.equal((await post(rota, { ...LINK, url: 'https://exemplo.test/outro', ...extra })).status, 422, JSON.stringify(extra));
    }
    assert.equal((await post(rota, { ...LINK, titulo: 'Outro', url: 'http://inseguro.test' })).status, 422);
    const lista = (await get(`/__admin/servicos/${id}/informacoes`)).corpo.itens;
    assert.deepEqual(lista.map((i) => [i.tipo, i.titulo]), [['link', 'Link novo fictício']]);
  });
});

test('S5. usar link já cadastrado: busca somente leitura; o servidor relê a fonte do disco; a cópia nasce em rascunho', async () => {
  await comCopia(async ({ post, get, criarServico, raiz }) => {
    const destino = await criarServico('Serviço Destino Fictício', { nome: 'Tema Destino Fictício' });
    const lacAntes = hashDaPasta(path.join(raiz, 'services', 'lac'));
    const busca = await post(`/__admin/servicos/${destino}/links-existentes/busca`, { consulta: 'manual' });
    assert.equal(busca.status, 200);
    assert.deepEqual(busca.corpo.itens.map((i) => i.fonteId), ['manual-lac-siga-2020']);
    assert.equal(hashDaPasta(path.join(raiz, 'services', 'lac')), lacAntes);
    const rota = `/__admin/servicos/${destino}/links-existentes`;
    const ok = await post(rota, { servicoId: 'lac', fonteId: 'manual-lac-siga-2020' });
    assert.equal(ok.status, 201);
    assert.equal(ok.corpo.fonte.statusValidacao, 'rascunho');
    assert.equal(ok.corpo.fonte.publicado, false);
    assert.deepEqual(ok.corpo.fonte.reutilizadaDe, { servicoId: 'lac', versaoId: 'lac-v1', fonteId: 'manual-lac-siga-2020' });
    const gravada = JSON.parse(fs.readFileSync(path.join(raiz, 'services', destino, 'versoes', 'v1', 'fontes.json'), 'utf8')).fontes[0];
    assert.equal(gravada.dataConsulta, null);
    assert.notEqual(gravada.id, 'manual-lac-siga-2020');
    assert.equal(hashDaPasta(path.join(raiz, 'services', 'lac')), lacAntes, 'o serviço de origem não pode mudar');
    assert.equal((await post(rota, { servicoId: 'lac', fonteId: 'manual-lac-siga-2020' })).status, 409);
    // O cliente não envia objeto de fonte nem campos extras; a fonte revogada e a inexistente são recusadas.
    assert.equal((await post(rota, { servicoId: 'lac', fonteId: 'faq-lac-2022', fonte: { titulo: 'x' } })).status, 422);
    assert.equal((await post(rota, { servicoId: 'lac', fonteId: 'decreto-695-2020' })).status, 422);
    assert.equal((await post(rota, { servicoId: 'lac', fonteId: 'nao-existe' })).status, 404);
    assert.equal((await post(rota, { servicoId: 'nao-existe', fonteId: 'x' })).status, 404);
    assert.equal((await post(`/__admin/servicos/lac/links-existentes`, { servicoId: 'lac', fonteId: 'faq-lac-2022' })).status, 422);
    const lista = (await get(`/__admin/servicos/${destino}/informacoes`)).corpo.itens;
    assert.equal(lista[0].reutilizadoDe, 'Licenciamento Ambiental Concomitante (LAC)'.length > 0 ? lista[0].reutilizadoDe : '');
    assert.equal(typeof lista[0].reutilizadoDe, 'string');
    assert.deepEqual(validarServicos(raiz).erros, []);
  });
});

test('S6. fonte textual de outro serviço não é pesquisável nem reutilizável', async () => {
  await comCopia(async ({ post, criarServico, raiz }) => {
    const a = await criarServico('Serviço Origem Texto', { nome: 'Tema Origem Texto' });
    const b = await criarServico('Serviço Destino Texto', { nome: 'Tema Destino Texto' });
    assert.equal((await post(`/__admin/servicos/${a}/entradas-texto`, { titulo: 'Texto interno fictício', texto: CANARIO })).status, 201);
    const fonteTexto = JSON.parse(fs.readFileSync(path.join(raiz, 'services', a, 'versoes', 'v1', 'fontes.json'), 'utf8')).fontes[0].id;
    const busca = await post(`/__admin/servicos/${b}/links-existentes/busca`, { consulta: 'texto interno' });
    assert.deepEqual(busca.corpo.itens, []);
    assert.ok(!busca.bruto.includes('CANARIO'));
    assert.equal((await post(`/__admin/servicos/${b}/links-existentes`, { servicoId: a, fonteId: fonteTexto })).status, 422);
  });
});

test('S7. trava comum: uma gravação por vez em todas as rotas novas; a segunda recebe 409 sem alterar nada', async () => {
  let liberar;
  const portao = new Promise((r) => { liberar = r; });
  let entrou;
  const chegou = new Promise((r) => { entrou = r; });
  let primeira = false;
  await comCopia(async ({ m, token, criarServico }) => {
    const id = await criarServico('Serviço Trava Fictício', { nome: 'Tema Trava Fictício' });
    primeira = true;
    const p1 = enviar(m, { url: `/__admin/servicos/${id}/entradas-texto`, corpo: { titulo: 'Primeira', texto: 'Texto um.' }, token });
    await chegou;
    for (const [url, corpo] of [
      [`/__admin/servicos/${id}/entradas-texto`, { titulo: 'Segunda', texto: 'Texto dois.' }],
      [`/__admin/servicos/${id}/links`, LINK],
      [`/__admin/servicos/${id}/links-existentes`, { servicoId: 'lac', fonteId: 'manual-lac-siga-2020' }],
      [ROTA_SERVICO_COM_TEMA, { nome: 'Outro Serviço Fictício', tema: { nome: 'Outro Tema' } }],
    ]) {
      const r = await enviar(m, { url, corpo, token });
      assert.deepEqual([r.status, r.corpo.erro], [409, 'operacao_em_andamento'], url);
    }
    liberar();
    assert.equal((await p1).status, 201);
  }, {
    antesDeGravar: async () => {
      if (primeira) { primeira = false; entrou(); await portao; }
    },
  });
});

test('S8. falha na conferência final desfaz tudo: nada fica gravado, sem conteúdo no erro', async () => {
  let recusar = false;
  await comCopia(async ({ post, criarServico, raiz }) => {
    const id = await criarServico('Serviço Rollback Fictício', { nome: 'Tema Rollback Fictício' });
    const antes = hashDaPasta(path.join(raiz, 'services'));
    recusar = true;
    for (const [url, corpo] of [
      [`/__admin/servicos/${id}/entradas-texto`, { titulo: 'Falha', texto: CANARIO }],
      [`/__admin/servicos/${id}/links`, LINK],
      [`/__admin/servicos/${id}/links-existentes`, { servicoId: 'lac', fonteId: 'manual-lac-siga-2020' }],
    ]) {
      const r = await post(url, corpo);
      assert.ok([422, 500].includes(r.status), `${url} ${r.status}`);
      assert.ok(!r.bruto.includes('CANARIO'));
    }
    assert.equal(hashDaPasta(path.join(raiz, 'services')), antes);
  }, { verificarFinal: (r) => (recusar ? ['recusado'] : validarServicos(r).erros) });
});

test('S9. acesso: sem token 401, host não local 403, método errado 405', async () => {
  await comCopia(async ({ m, token, criarServico }) => {
    const id = await criarServico('Serviço Acesso Fictício', { nome: 'Tema Acesso Fictício' });
    const rota = `/__admin/servicos/${id}/entradas-texto`;
    assert.equal((await enviar(m, { url: rota, corpo: { titulo: 'T', texto: 'x' } })).status, 401);
    assert.equal((await enviar(m, { url: rota, corpo: { titulo: 'T', texto: 'x' }, token, host: 'exemplo.test' })).status, 403);
    assert.equal((await enviar(m, { url: rota, method: 'GET', token })).status, 405);
    assert.equal((await enviar(m, { url: `/__admin/servicos/${id}/informacoes`, corpo: {}, token })).status, 405);
    assert.equal((await enviar(m, { url: `/__admin/servicos/${id}/informacoes`, method: 'GET' })).status, 401);
    assert.equal((await enviar(m, { url: '/__admin/servicos/nao-existe/informacoes', method: 'GET', token })).status, 404);
  });
});
