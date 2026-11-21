// Endpoint administrativo local de leitura (Marco 7, Passo 7D), testado com requisições e respostas simuladas
// (sem abrir porta). Dados fictícios e cópias temporárias fora do repositório; nada é gravado.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { hashConteudo } from '../services/admin/hash.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import {
  criarManipuladorAdmin, criarPluginAdminDev, CABECALHO_TOKEN, ROTA_SESSAO, ROTA_CATALOGO, LIMITE_RESPOSTA,
} from '../services/admin/admin-endpoint.js';
import config from '../vite.config.js';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lerTexto = (...p) => fs.readFileSync(path.join(RAIZ, ...p), 'utf8');
const lerJson = (...p) => JSON.parse(lerTexto(...p));
const V1 = ['services', 'lac', 'versoes', 'v1'];
const ROTA_LAC = '/__admin/servicos/lac/versao-atual';
const HEADERS_OK = { host: 'localhost:5173' };

/** Executa o manipulador com uma requisição simulada. */
async function chamar(manipulador, { url = ROTA_CATALOGO, method = 'GET', headers = HEADERS_OK, remoteAddress = '127.0.0.1', localPort = 5173, token } = {}) {
  const cabecalhos = {};
  let corpo = null;
  let proximo = false;
  const res = {
    statusCode: 0,
    setHeader: (nome, valor) => { cabecalhos[nome.toLowerCase()] = valor; },
    end: (texto) => { corpo = texto; },
  };
  const h = { ...headers };
  if (token !== undefined) h[CABECALHO_TOKEN] = token;
  await manipulador({ url, method, headers: h, socket: { remoteAddress, localPort } }, res, () => { proximo = true; });
  return { status: res.statusCode, corpo: corpo === null ? null : JSON.parse(corpo), textoBruto: corpo ?? '', cabecalhos, proximo };
}

/** Passo 8B: entra com um usuário selecionável (POST /__admin/sessao) e devolve a resposta. */
async function entrarComo(manipulador, usuarioId = 'maria-silva') {
  const buffer = Buffer.from(JSON.stringify({ usuarioId }));
  const headers = { ...HEADERS_OK, 'content-type': 'application/json', 'content-length': String(buffer.length) };
  const cabecalhos = {};
  let corpo = null;
  const res = { statusCode: 0, setHeader: (n, v) => { cabecalhos[n.toLowerCase()] = v; }, end: (t) => { corpo = t; } };
  const req = Object.assign(Readable.from([buffer]), { url: ROTA_SESSAO, method: 'POST', headers, socket: { remoteAddress: '127.0.0.1', localPort: 5173 } });
  await manipulador(req, res, () => {});
  return { status: res.statusCode, corpo: corpo === null ? null : JSON.parse(corpo), textoBruto: corpo ?? '', cabecalhos };
}
const obterToken = async (m) => (await entrarComo(m)).corpo.token;

const novo = (extra = {}) => criarManipuladorAdmin({ raiz: RAIZ, ...extra });
async function comToken(extra = {}) {
  const m = novo(extra);
  return { m, token: await obterToken(m) };
}

/** Cópia temporária (fora do repositório) com um "dado privado" fictício que o endpoint nunca pode ler. */
async function comCopia(fn) {
  const pai = fs.mkdtempSync(path.join(os.tmpdir(), 'sema-orienta-admin-endpoint-'));
  const raiz = path.join(pai, 'raiz');
  fs.mkdirSync(raiz);
  fs.cpSync(path.join(RAIZ, 'services'), path.join(raiz, 'services'), { recursive: true });
  fs.mkdirSync(path.join(raiz, 'data', 'admin-private'), { recursive: true });
  fs.writeFileSync(path.join(raiz, 'data', 'admin-private', 'historico.jsonl'), '{"id":"decisao-privada-ficticia","responsavel":"SEGREDO-FICTICIO"}\n');
  try {
    return await fn({ raiz, pai });
  } finally {
    fs.rmSync(pai, { recursive: true, force: true });
  }
}
const instantaneo = (dir) => {
  const itens = [];
  const percorrer = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) percorrer(p);
      else itens.push(`${path.relative(dir, p)}|${fs.statSync(p).size}|${fs.statSync(p).mtimeMs}`);
    }
  };
  percorrer(dir);
  return itens.sort().join('\n');
};

// ---------- Sessão e token ----------

test('AD1. (8B) GET /__admin/sessao sem usuário não cria token; a entrada (POST) entrega um token aleatório de 64 hex, que o GET devolve depois', async () => {
  const m = novo();
  const vazio = await chamar(m, { url: ROTA_SESSAO });
  assert.equal(vazio.status, 200);
  assert.deepEqual(Object.keys(vazio.corpo), ['usuario', 'usuarios']);
  assert.equal(vazio.corpo.usuario, null);
  assert.equal(vazio.cabecalhos['cache-control'], 'no-store');
  assert.equal(vazio.cabecalhos['x-content-type-options'], 'nosniff');
  assert.match(vazio.cabecalhos['content-type'], /^application\/json/);
  const a = await entrarComo(m);
  assert.equal(a.status, 200);
  assert.match(a.corpo.token, /^[0-9a-f]{64}$/);
  assert.equal(a.cabecalhos['cache-control'], 'no-store');
  assert.equal((await chamar(m, { url: ROTA_SESSAO })).corpo.token, a.corpo.token);
  const tokens = new Set();
  for (let i = 0; i < 20; i += 1) tokens.add(await obterToken(novo()));
  assert.equal(tokens.size, 20);
});

test('AD2. (8B) o token só é criado na entrada (POST), uma vez por entrada, e vem do gerador injetado quando houver', async () => {
  let chamadas = 0;
  const fixo = 'ab'.repeat(32);
  const m = novo({ gerarToken: () => { chamadas += 1; return fixo; } });
  assert.equal(chamadas, 0, 'nada é gerado ao criar o manipulador');
  await chamar(m, { url: ROTA_CATALOGO, token: fixo });
  await chamar(m, { url: ROTA_SESSAO });
  assert.equal(chamadas, 0, 'rotas protegidas e a leitura da sessão não geram token');
  assert.equal(await obterToken(m), fixo);
  await chamar(m, { url: ROTA_SESSAO });
  assert.equal(chamadas, 1);
  // Um gerador que devolva token fora do formato é recusado, sem vazar nada.
  const ruim = novo({ gerarToken: () => 'curto' });
  const r = await entrarComo(ruim);
  assert.equal(r.status, 500);
  assert.deepEqual(r.corpo, { erro: 'indisponivel' });
  assert.equal(r.textoBruto.includes('curto'), false);
});

test('AD3. rotas protegidas exigem o token: ausente, inválido e antes da sessão são recusados; o correto é aceito', async () => {
  const m = novo();
  assert.equal((await chamar(m, { url: ROTA_CATALOGO, token: 'a'.repeat(64) })).status, 401, 'sem sessão criada');
  const token = await obterToken(m);
  for (const rota of [ROTA_CATALOGO, ROTA_LAC]) {
    assert.equal((await chamar(m, { url: rota })).status, 401, `${rota} sem token`);
    for (const ruim of ['', 'x', 'a'.repeat(64), token.slice(1), `${token}0`, token.toUpperCase(), ` ${token}`, `${token} `, 'null', '0'.repeat(64)]) {
      const r = await chamar(m, { url: rota, token: ruim });
      assert.equal(r.status, 401, `${rota} ${ruim.slice(0, 8)}`);
      assert.deepEqual(r.corpo, { erro: 'nao_autorizado' });
    }
    assert.equal((await chamar(m, { url: rota, token })).status, 200, `${rota} com token`);
  }
  // Token em outro cabeçalho ou como lista não vale.
  for (const headers of [{ ...HEADERS_OK, authorization: token }, { ...HEADERS_OK, cookie: `token=${token}` }, { ...HEADERS_OK, 'x-admin-token-2': token }, { ...HEADERS_OK, [CABECALHO_TOKEN]: [token] }]) {
    assert.equal((await chamar(m, { url: ROTA_CATALOGO, headers })).status, 401);
  }
});

test('AD3b. (8B) leituras simultâneas de /__admin/sessao depois da entrada recebem todas o mesmo token, que depois acessa catálogo e versão atual', async () => {
  const saidas = [];
  const originais = {};
  for (const nivel of ['log', 'info', 'warn', 'error', 'debug']) {
    originais[nivel] = console[nivel];
    console[nivel] = (...a) => saidas.push(a.join(' '));
  }
  let sessoes;
  let token;
  let acessos;
  let erros;
  let geradas = 0;
  try {
    // Gerador injetado só para contar as criações: cada chamada devolveria um valor diferente, então
    // qualquer corrida na inicialização faria chamadas simultâneas receberem tokens distintos.
    const m = novo({ gerarToken: () => { geradas += 1; return crypto.randomBytes(32).toString('hex'); } });
    await obterToken(m);
    sessoes = await Promise.all(Array.from({ length: 50 }, () => chamar(m, { url: ROTA_SESSAO })));
    token = sessoes[0].corpo.token;
    acessos = await Promise.all([chamar(m, { url: ROTA_CATALOGO, token }), chamar(m, { url: ROTA_LAC, token })]);
    erros = await Promise.all([
      chamar(m, { url: ROTA_CATALOGO }), chamar(m, { url: ROTA_CATALOGO, token: 'a'.repeat(64) }), chamar(m, { url: ROTA_LAC, token: token.slice(1) }),
      chamar(m, { url: ROTA_SESSAO, remoteAddress: '10.0.0.2' }), chamar(m, { url: ROTA_SESSAO, headers: { host: 'evil.example' } }),
      chamar(m, { url: `${ROTA_SESSAO}?x=1` }), chamar(m, { url: ROTA_SESSAO, method: 'PUT' }),
    ]);
  } finally {
    Object.assign(console, originais);
  }
  assert.equal(sessoes.length, 50);
  assert.ok(sessoes.every((s) => s.status === 200), 'todas retornam sucesso');
  assert.ok(sessoes.every((s) => typeof s.corpo.token === 'string' && /^[0-9a-f]{64}$/.test(s.corpo.token)), 'formato e tamanho esperados');
  assert.equal(new Set(sessoes.map((s) => s.corpo.token)).size, 1, 'exatamente o mesmo token em todas');
  assert.equal(geradas, 1, 'o token é criado uma única vez');
  assert.equal(acessos[0].status, 200);
  assert.equal(acessos[1].status, 200);
  assert.deepEqual(erros.map((r) => r.status), [401, 401, 401, 403, 403, 400, 405]);
  for (const r of erros) assert.equal(r.textoBruto.includes(token), false, 'o token não aparece em mensagens de erro');
  assert.equal(saidas.some((s) => s.includes(token)), false, 'o token não aparece em logs');
  assert.deepEqual(saidas, []);
});

test('AD4. o token de uma sessão não vale em outra instância (servidor reiniciado)', async () => {
  const { token } = await comToken();
  const outra = novo();
  await obterToken(outra);
  assert.equal((await chamar(outra, { url: ROTA_CATALOGO, token })).status, 401);
});

test('AD5. o token não aparece em respostas de erro, em log nem em console, e o código não escreve na saída do processo', async () => {
  const saidas = [];
  const originais = {};
  for (const nivel of ['log', 'info', 'warn', 'error', 'debug']) {
    originais[nivel] = console[nivel];
    console[nivel] = (...a) => saidas.push(a.join(' '));
  }
  let respostas;
  let token;
  try {
    const m = novo();
    token = await obterToken(m);
    respostas = await Promise.all([
      chamar(m, { url: ROTA_CATALOGO }), chamar(m, { url: ROTA_CATALOGO, token: 'a'.repeat(64) }), chamar(m, { url: ROTA_CATALOGO, method: 'POST', token }),
      chamar(m, { url: `${ROTA_CATALOGO}?t=${token}`, token }), chamar(m, { url: '/__admin/outra', token }), chamar(m, { url: ROTA_LAC, remoteAddress: '10.0.0.2', token }),
      chamar(m, { url: ROTA_CATALOGO, headers: { host: 'evil.example' }, token }), chamar(m, { url: '/__admin/servicos/nao-existe/versao-atual', token }),
    ]);
  } finally {
    Object.assign(console, originais);
  }
  for (const r of respostas) assert.equal(r.textoBruto.includes(token), false);
  assert.deepEqual(saidas, [], 'nenhuma saída de log foi produzida');
  const codigo = lerTexto('services', 'admin', 'admin-endpoint.js');
  assert.doesNotMatch(codigo, /console\.|process\.stdout|process\.stderr|debugger/);
});

// ---------- Origem local ----------

test('AD6. só atende conexão local; qualquer outra recebe 403 genérico em todas as rotas', async () => {
  const { m, token } = await comToken();
  for (const remoteAddress of ['192.168.0.10', '10.0.0.5', '203.0.113.9', '::2', null, '']) {
    for (const url of [ROTA_SESSAO, ROTA_CATALOGO, ROTA_LAC]) {
      const r = await chamar(m, { url, remoteAddress, token });
      assert.equal(r.status, 403, `${url} ${remoteAddress}`);
      assert.deepEqual(r.corpo, { erro: 'acesso_somente_local' });
    }
  }
  for (const remoteAddress of ['127.0.0.1', '::1', '::ffff:127.0.0.1']) assert.equal((await chamar(m, { url: ROTA_CATALOGO, remoteAddress, token })).status, 200, remoteAddress);
});

test('AD7. valida o Host: só localhost, 127.0.0.1 e [::1], na porta em que o servidor escuta', async () => {
  const { m, token } = await comToken();
  const invalidos = [undefined, '', 'evil.example', 'evil.example:5173', 'localhost.evil.com', 'localhost:5173.evil.com', '127.0.0.1.nip.io:5173', 'user@localhost:5173',
    '[::2]:5173', 'localhost:9999', 'localhost:', 'localhost:99999999', '0.0.0.0:5173', 'localhost 5173', 'localhost:5173/x', 'http://localhost:5173'];
  for (const host of invalidos) {
    const headers = host === undefined ? {} : { host };
    const r = await chamar(m, { url: ROTA_CATALOGO, headers, token });
    assert.equal(r.status, 403, String(host));
    assert.deepEqual(r.corpo, { erro: 'acesso_somente_local' });
  }
  for (const host of ['localhost:5173', '127.0.0.1:5173', '[::1]:5173', 'LOCALHOST:5173']) {
    assert.equal((await chamar(m, { url: ROTA_CATALOGO, headers: { host }, token })).status, 200, host);
  }
  // Em outra porta de desenvolvimento, o Host acompanha a porta real.
  assert.equal((await chamar(m, { url: ROTA_CATALOGO, headers: { host: 'localhost:5180' }, localPort: 5180, token })).status, 200);
});

test('AD8. valida a Origin: se enviada, deve coincidir com o host local da requisição; sem CORS', async () => {
  const { m, token } = await comToken();
  assert.equal((await chamar(m, { url: ROTA_CATALOGO, token })).status, 200, 'sem Origin (mesma origem) é aceito');
  for (const origin of ['http://localhost:5173']) {
    assert.equal((await chamar(m, { url: ROTA_CATALOGO, headers: { ...HEADERS_OK, origin }, token })).status, 200, origin);
  }
  assert.equal((await chamar(m, { url: ROTA_CATALOGO, headers: { host: '127.0.0.1:5173', origin: 'http://127.0.0.1:5173' }, token })).status, 200);
  for (const origin of ['http://evil.example', 'https://evil.example', 'null', '', 'http://127.0.0.1:5173', 'http://localhost:5174', 'http://localhost', 'http://localhost:5173/', 'file://', 'http://localhost:5173.evil.com']) {
    const r = await chamar(m, { url: ROTA_CATALOGO, headers: { ...HEADERS_OK, origin }, token });
    assert.equal(r.status, 403, origin);
    assert.deepEqual(r.corpo, { erro: 'acesso_somente_local' });
  }
  for (const site of ['cross-site', 'same-site', '', 'qualquer']) {
    assert.equal((await chamar(m, { url: ROTA_CATALOGO, headers: { ...HEADERS_OK, 'sec-fetch-site': site }, token })).status, 403, site);
  }
  for (const site of ['same-origin', 'none']) {
    assert.equal((await chamar(m, { url: ROTA_CATALOGO, headers: { ...HEADERS_OK, 'sec-fetch-site': site }, token })).status, 200, site);
  }
  // Nunca há cabeçalhos CORS, nem em sucesso, nem em erro, nem em preflight.
  for (const r of [await chamar(m, { url: ROTA_CATALOGO, token }), await chamar(m, { url: ROTA_CATALOGO }), await chamar(m, { url: ROTA_CATALOGO, method: 'OPTIONS', headers: { ...HEADERS_OK, origin: 'http://localhost:5173' } })]) {
    assert.deepEqual(Object.keys(r.cabecalhos).filter((k) => k.startsWith('access-control-')), []);
    assert.equal(r.cabecalhos['cache-control'], 'no-store');
  }
  assert.doesNotMatch(lerTexto('services', 'admin', 'admin-endpoint.js'), /Access-Control|Set-Cookie/i);
});

// ---------- Método, query, corpo e rotas ----------

test('AD9. aceita somente GET: os demais métodos recebem 405 com Allow: GET, mesmo com token válido (a sessão aceita também POST e DELETE: 8B)', async () => {
  const { m, token } = await comToken();
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS', 'TRACE', 'get']) {
    for (const url of [ROTA_CATALOGO, ROTA_LAC]) {
      const r = await chamar(m, { url, method, token });
      assert.equal(r.status, 405, `${method} ${url}`);
      assert.equal(r.cabecalhos.allow, 'GET');
      assert.deepEqual(r.corpo, { erro: 'metodo_nao_permitido' });
    }
  }
});

test('AD10. recusa query string e corpo, sem repetir o que foi enviado', async () => {
  const { m, token } = await comToken();
  for (const url of [`${ROTA_CATALOGO}?a=SEGREDO123`, `${ROTA_CATALOGO}?`, `${ROTA_SESSAO}?x`, `${ROTA_LAC}?pergunta=SEGREDO123`, `${ROTA_CATALOGO}?token=${token}`]) {
    const r = await chamar(m, { url, token });
    assert.equal(r.status, 400, url);
    assert.deepEqual(r.corpo, { erro: 'requisicao_invalida' });
    assert.equal(r.textoBruto.includes('SEGREDO123'), false);
  }
  for (const extra of [{ 'content-length': '5' }, { 'content-length': '1' }, { 'transfer-encoding': 'chunked' }]) {
    const r = await chamar(m, { url: ROTA_CATALOGO, headers: { ...HEADERS_OK, ...extra }, token });
    assert.equal(r.status, 400, JSON.stringify(extra));
    assert.deepEqual(r.corpo, { erro: 'requisicao_invalida' });
  }
  assert.equal((await chamar(m, { url: ROTA_CATALOGO, headers: { ...HEADERS_OK, 'content-length': '0' }, token })).status, 200);
});

test('AD11. rotas desconhecidas, travessia e ids inválidos ou não cadastrados recebem 404 genérico (401 sem token)', async () => {
  const { m, token } = await comToken();
  const urls = [
    '/__admin', '/__admin/', '/__admin/outra', '/__admin/catalogo/', '/__admin/catalogo/x', '/__admin/sessao/x', '/__admin/servicos/', '/__admin/assuntos/',
    '/__admin/servicos/lac', '/__admin/servicos/lac/', '/__admin/servicos/lac/versao-atual/', '/__admin/servicos/lac/versao-atual/x', '/__admin/servicos/lac/versoes',
    '/__admin/servicos/../versao-atual', '/__admin/servicos/lac/../versao-atual', '/__admin/servicos/%2e%2e/versao-atual', '/__admin/servicos/lac%2f..%2fx/versao-atual',
    '/__admin/servicos/..%2f..%2fetc/versao-atual', '/__admin/servicos/LAC/versao-atual', '/__admin/servicos/lac_1/versao-atual', '/__admin/servicos/1lac/versao-atual',
    '/__admin/servicos/lac\\x/versao-atual', '/__admin/servicos/nao-existe/versao-atual', '/__admin/servicos/lac%00/versao-atual', '/__admin/servicos//versao-atual',
    '/__admin/servicos/lac/versao-atual%2f', '/__admin/../etc/passwd', '/__admin/data/admin-private/historico.jsonl', '/__admin/services/registry.json',
  ];
  for (const url of urls) {
    const r = await chamar(m, { url, token });
    assert.equal(r.status, 404, url);
    assert.deepEqual(r.corpo, { erro: 'nao_encontrado' });
    assert.equal((await chamar(m, { url })).status, 401, `${url} sem token`);
  }
});

test('AD12. caminhos fora de /__admin passam adiante (next) sem resposta do endpoint', async () => {
  const m = novo();
  for (const url of ['/', '/index.html', '/__administrador', '/__adminx/sessao', '/x/__admin/sessao', '//__admin/sessao', '/__assistente/blocos', '/api/chat', '/services/registry.json', '']) {
    const r = await chamar(m, { url });
    assert.equal(r.proximo, true, url);
    assert.equal(r.status, 0, url);
  }
});

// ---------- Conteúdo ----------

test('AD13. o catálogo traz os assuntos e os serviços com versão atual e publicada, sem caminhos internos', async () => {
  const { m, token } = await comToken();
  const r = await chamar(m, { url: ROTA_CATALOGO, token });
  assert.equal(r.status, 200);
  assert.deepEqual(r.corpo.assuntos, lerJson('services', 'assuntos.json').assuntos);
  const registro = lerJson('services', 'registry.json').servicos[0];
  const servico = lerJson(...V1, 'service.json');
  assert.deepEqual(r.corpo.servicos, [{
    id: 'lac', assuntoId: 'licenciamento-ambiental', nome: servico.nome, sigla: 'LAC', versaoAtualId: 'lac-v1', versaoPublicadaId: null,
    statusValidacao: registro.statusValidacao, publicado: false,
  }]);
  assert.deepEqual(Object.keys(r.corpo).sort(), ['assuntos', 'servicos']);
  assert.equal(r.textoBruto.includes('services/'), false);
});

test('AD14. a versão atual traz o manifesto e os arquivos modulares, idênticos aos arquivos da base', async () => {
  const { m, token } = await comToken();
  const r = await chamar(m, { url: ROTA_LAC, token });
  assert.equal(r.status, 200);
  assert.deepEqual(Object.keys(r.corpo).sort(), ['conteudoAssistente', 'documentos', 'fontes', 'manifesto', 'perguntasFrequentes', 'revisaoFontes', 'roteiro', 'service', 'servicoId', 'versaoId']);
  assert.equal(r.corpo.servicoId, 'lac');
  assert.equal(r.corpo.versaoId, 'lac-v1');
  assert.deepEqual(r.corpo.manifesto, lerJson(...V1, 'versao.json'));
  assert.equal(r.corpo.manifesto.estado, 'rascunho');
  assert.deepEqual(r.corpo.service, lerJson(...V1, 'service.json'));
  assert.deepEqual(r.corpo.documentos, lerJson(...V1, 'documentos.json'));
  assert.deepEqual(r.corpo.perguntasFrequentes, lerJson(...V1, 'perguntas-frequentes.json'));
  assert.deepEqual(r.corpo.fontes, lerJson(...V1, 'fontes.json'));
  assert.equal(r.corpo.revisaoFontes, hashConteudo(lerJson(...V1, 'fontes.json')), 'revisão = SHA-256 do conteúdo de fontes.json');
  assert.match(r.corpo.revisaoFontes, /^[0-9a-f]{64}$/);
  assert.deepEqual(r.corpo.conteudoAssistente, lerJson(...V1, 'conteudo-assistente.json'));
  assert.equal(r.corpo.roteiro, lerTexto(...V1, 'roteiro.md'));
  assert.ok(r.textoBruto.length < LIMITE_RESPOSTA);
});

test('AD15. nenhuma decisão privada é exposta nem lida: o endpoint nunca toca em data/admin-private', async () => {
  const lidos = [];
  const original = fs.readFileSync;
  fs.readFileSync = (p, ...r) => { lidos.push(String(p)); return original(p, ...r); };
  try {
    await comCopia(async ({ raiz }) => {
      const m = criarManipuladorAdmin({ raiz });
      const token = await obterToken(m);
      const respostas = [await chamar(m, { url: ROTA_CATALOGO, token }), await chamar(m, { url: ROTA_LAC, token }), await chamar(m, { url: '/__admin/data/admin-private/historico.jsonl', token })];
      for (const r of respostas) {
        assert.equal(r.textoBruto.includes('SEGREDO-FICTICIO'), false);
        assert.equal(r.textoBruto.includes('decisao-privada-ficticia'), false);
        assert.doesNotMatch(r.textoBruto, /decisoes|"historico"|autorizacao_publicacao|decisao_material/);
      }
      assert.equal(respostas[0].status, 200);
      assert.equal(respostas[1].status, 200);
      assert.equal(respostas[2].status, 404);
    });
  } finally {
    fs.readFileSync = original;
  }
  assert.ok(lidos.length > 0);
  assert.equal(lidos.some((p) => p.includes('admin-private')), false);
});

// ---------- Somente leitura, concorrência, limites e falhas ----------

test('AD16. requisições simultâneas não alteram estado persistente: mesmo token, mesmas respostas, nenhuma escrita (8B: leituras da sessão depois da entrada)', async () => {
  const escritas = [];
  let gravando = false; // só conta chamadas feitas enquanto as requisições são atendidas (não a preparação do teste)
  const originais = {};
  for (const nome of ['writeFileSync', 'appendFileSync', 'renameSync', 'mkdirSync', 'unlinkSync', 'rmSync', 'copyFileSync', 'truncateSync', 'openSync']) {
    originais[nome] = fs[nome];
    fs[nome] = (...a) => { if (gravando && String(a[0]).includes('sema-orienta-admin-endpoint-')) escritas.push(nome); return originais[nome](...a); };
  }
  try {
    await comCopia(async ({ raiz }) => {
      const antes = instantaneo(raiz);
      gravando = true;
      const m = criarManipuladorAdmin({ raiz });
      await obterToken(m);
      const sessoes = await Promise.all(Array.from({ length: 30 }, () => chamar(m, { url: ROTA_SESSAO })));
      const token = sessoes[0].corpo.token;
      assert.ok(sessoes.every((s) => s.corpo.token === token), 'um único token para todas as chamadas simultâneas');
      const pedidos = Array.from({ length: 30 }, (_, i) => chamar(m, { url: i % 2 ? ROTA_CATALOGO : ROTA_LAC, token }));
      const respostas = await Promise.all(pedidos);
      assert.ok(respostas.every((r) => r.status === 200));
      assert.equal(new Set(respostas.filter((_, i) => i % 2).map((r) => r.textoBruto)).size, 1);
      assert.equal(new Set(respostas.filter((_, i) => !(i % 2)).map((r) => r.textoBruto)).size, 1);
      gravando = false;
      assert.equal(instantaneo(raiz), antes, 'nenhum arquivo foi criado, alterado ou removido');
    });
  } finally {
    Object.assign(fs, originais);
  }
  assert.deepEqual(escritas, []);
});

test('AD17. limites: resposta grande demais e arquivo grande demais viram erro genérico', async () => {
  // Passo 8C: a resposta da sessão ganhou `acoes` (cerca de 520 bytes com Maria) e também passa do limite de 200 bytes: ela vira
  // 500 genérico, mas a sessão já foi aberta; com o gerador de token fixo, o token é conhecido e as demais rotas são conferidas.
  const token = 'd'.repeat(64);
  const m = novo({ limiteResposta: 200, gerarToken: () => token });
  const entrada = await entrarComo(m);
  assert.deepEqual([entrada.status, entrada.corpo], [500, { erro: 'indisponivel' }]);
  for (const url of [ROTA_CATALOGO, ROTA_LAC]) {
    const r = await chamar(m, { url, token });
    assert.equal(r.status, 500, url);
    assert.deepEqual(r.corpo, { erro: 'indisponivel' });
  }
  await comCopia(async ({ raiz }) => {
    fs.writeFileSync(path.join(raiz, ...V1, 'documentos.json'), `{"x":"${'a'.repeat(6 * 1024 * 1024)}"}`);
    const m2 = criarManipuladorAdmin({ raiz });
    const t = await obterToken(m2);
    const r = await chamar(m2, { url: ROTA_LAC, token: t });
    assert.deepEqual(r.corpo, { erro: 'indisponivel' });
    assert.equal(r.textoBruto.includes('documentos'), false);
  });
  await comCopia(async ({ raiz }) => {
    fs.writeFileSync(path.join(raiz, ...V1, 'roteiro.md'), 'a'.repeat(1024 * 1024 + 1));
    const m2 = criarManipuladorAdmin({ raiz });
    const t = await obterToken(m2);
    assert.deepEqual((await chamar(m2, { url: ROTA_LAC, token: t })).corpo, { erro: 'indisponivel' });
  });
});

test('AD18. falhas de leitura devolvem 500 genérico, sem caminho interno nem conteúdo', async () => {
  const casos = {
    'registro ausente': ({ raiz }) => fs.rmSync(path.join(raiz, 'services', 'registry.json')),
    'manifesto corrompido': ({ raiz }) => fs.writeFileSync(path.join(raiz, ...V1, 'versao.json'), '{ conteúdo-secreto-fictício'),
    'arquivo ausente': ({ raiz }) => fs.rmSync(path.join(raiz, ...V1, 'fontes.json')),
    'assuntos ausentes': ({ raiz }) => fs.rmSync(path.join(raiz, 'services', 'assuntos.json')),
  };
  for (const [nome, preparar] of Object.entries(casos)) {
    await comCopia(async ({ raiz, pai }) => {
      const m = criarManipuladorAdmin({ raiz });
      const token = await obterToken(m);
      preparar({ raiz });
      for (const url of [ROTA_CATALOGO, ROTA_LAC]) {
        const r = await chamar(m, { url, token });
        if (r.status === 200) continue;
        assert.equal(r.status, 500, `${nome} ${url}`);
        assert.deepEqual(r.corpo, { erro: 'indisponivel' });
        assert.equal(r.textoBruto.includes(pai), false);
        assert.equal(r.textoBruto.includes('secreto'), false);
      }
      const rVersao = await chamar(m, { url: ROTA_LAC, token });
      assert.equal(rVersao.status === 500 || nome === 'assuntos ausentes', true, nome);
    });
  }
  const semRaiz = criarManipuladorAdmin({ raiz: 'relativa/invalida' });
  const s = await obterToken(semRaiz);
  assert.deepEqual((await chamar(semRaiz, { url: ROTA_CATALOGO, token: s })).corpo, { erro: 'indisponivel' });
});

test('AD19. pasta de versão que é link simbólico não é lida', async () => {
  await comCopia(async ({ raiz, pai }) => {
    const fora = path.join(pai, 'fora');
    fs.cpSync(path.join(raiz, ...V1), fora, { recursive: true });
    fs.rmSync(path.join(raiz, ...V1), { recursive: true });
    fs.symlinkSync(fora, path.join(raiz, ...V1), 'junction');
    const m = criarManipuladorAdmin({ raiz });
    const token = await obterToken(m);
    const r = await chamar(m, { url: ROTA_LAC, token });
    assert.equal(r.status, 500);
    assert.deepEqual(r.corpo, { erro: 'indisponivel' });
    assert.equal(r.textoBruto.includes('"roteiro"'), false);
  });
});

// ---------- Plugin, código e isolamento do módulo ----------

test('AD20. o plugin só vale no servidor de desenvolvimento: sem build, sem preview', () => {
  const plugin = criarPluginAdminDev({ raiz: RAIZ });
  assert.equal(plugin.apply, 'serve');
  assert.equal(typeof plugin.configureServer, 'function');
  assert.equal('configurePreviewServer' in plugin, false);
  assert.ok(config.plugins.some((p) => p.name === 'sema-orienta-admin-dev' && p.apply === 'serve'));
  assert.ok(config.plugins.some((p) => p.name === 'sema-orienta-assistente-dev' && p.apply === 'serve'));
  assert.ok(config.plugins.filter((p) => p.name !== 'sema-orienta-conteudo-publico').every((p) => p.apply === 'serve' && !('configurePreviewServer' in p)));
  assert.ok(config.plugins.every((p) => !('configurePreviewServer' in p)));
  const registrados = [];
  plugin.configureServer({ middlewares: { use: (fn) => registrados.push(fn) } });
  assert.equal(registrados.length, 1);
  assert.equal(typeof registrados[0], 'function');
});

test('AD21. o código só grava pelo cadastro transacional e usa node:crypto: sem escrita direta, cookie, localStorage, ambiente nem caminho fixo da LAC', () => {
  const codigo = lerTexto('services', 'admin', 'admin-endpoint.js');
  // As gravações do cadastro passam por executarTransacao (e, dentro dele, pelo armazenamento); o endpoint só cria e remove a cópia temporária do ensaio.
  assert.doesNotMatch(codigo, /writeFile|appendFile|renameSync|unlinkSync|copyFile|truncate|createWriteStream|gravarJson|gravarTexto|acrescentarJsonl/);
  assert.match(codigo, /executarTransacao/);
  assert.doesNotMatch(codigo, /localStorage|sessionStorage|document\.cookie|Set-Cookie|process\.env|Date\.now|fetch\(|node:http|node:net/);
  assert.equal((codigo.match(/new Date\(\)/g) ?? []).length, 1, 'o relógio padrão é o único uso de Date e é injetável');
  assert.doesNotMatch(codigo, /services\/lac|'lac'|"lac"|conteudo-assistente\.json|fontes\.json|documentos\.json/);
  // 8B: o token e a comparação em tempo constante ficam no módulo puro da sessão.
  const sessao = lerTexto('services', 'admin', 'sessao.js');
  assert.match(sessao, /crypto\.randomBytes\(32\)/);
  assert.match(sessao, /crypto\.timingSafeEqual/);
  assert.doesNotMatch(codigo, /console\./);
  const imports = [...codigo.matchAll(/^import [^;]*? from '([^']+)';/gms)].map((m) => m[1]).sort();
  // Passo 8C: + acoes-das-rotas.js (ações por rota), atores.js (segunda barreira), historico-revisao.js (auditoria) e permissoes.js (matriz).
  assert.deepEqual(imports, ['../../scripts/validate-services.js', '../versao-atual.js', './acoes-das-rotas.js', './armazenamento.js', './atores.js', './cadastro-guiado.js', './cadastro.js', './conhecimento.js', './edicao-fonte.js', './edicao-tema-servico.js', './entradas-gravacao.js', './gestao-simples.js', './hash.js', './historico-revisao.js', './importacao-conteudo.js', './permissoes.js', './publicacao.js', './reutilizacao.js', './revisao-servico.js', './revisao.js', './saude.js', './sessao.js', './transacao.js', './versao.js', 'node:crypto', 'node:fs', 'node:os', 'node:path']);
});
