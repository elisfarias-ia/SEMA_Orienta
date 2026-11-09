// Endpoint exclusivo do servidor de desenvolvimento do Vite: GET /__assistente/blocos.
// Testado com requisições e respostas simuladas (sem abrir porta). Nada é gravado.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { criarManipuladorBlocos, criarPluginAssistenteDev, lerDadosDaBase, ROTA_BLOCOS } from '../services/assistant-endpoint.js';
import { FRASE_ESCOPO, FAIXA_TESTE_LOCAL } from '../services/assistant-messages.js';
import config from '../vite.config.js';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lerTexto = (...partes) => fs.readFileSync(path.join(RAIZ, ...partes), 'utf8');
const IDS = ['lac-limitacoes', 'lac-descricao', 'lac-sequencia-geral', 'lac-link-oficial', 'lac-sem-conteudo'];

/** Executa o manipulador com requisição simulada e devolve { status, corpo, cabecalhos, proximo }. */
async function chamar({ url = ROTA_BLOCOS, method = 'GET', remoteAddress = '127.0.0.1', lerDados = () => lerDadosDaBase(RAIZ) } = {}) {
  const manipulador = criarManipuladorBlocos({ lerDados });
  const cabecalhos = {};
  let corpo = null;
  let proximo = false;
  const res = {
    statusCode: 0,
    setHeader: (nome, valor) => { cabecalhos[nome.toLowerCase()] = valor; },
    end: (texto) => { corpo = texto; },
  };
  await manipulador({ url, method, socket: { remoteAddress } }, res, () => { proximo = true; });
  return { status: res.statusCode, corpo: corpo === null ? null : JSON.parse(corpo), textoBruto: corpo, cabecalhos, proximo };
}

test('E1. GET local devolve os cinco blocos em modo teste_local, as mensagens fixas e as fontes https', async () => {
  const r = await chamar();
  assert.equal(r.status, 200);
  assert.equal(r.corpo.modo, 'teste_local');
  assert.deepEqual(r.corpo.blocos.map((b) => b.id), IDS);
  assert.equal(r.corpo.mensagens.escopo, FRASE_ESCOPO);
  assert.equal(r.corpo.mensagens.faixa, FAIXA_TESTE_LOCAL);
  assert.deepEqual(r.corpo.fontes.map((f) => f.id), ['sema-orientacoes-lac']);
  assert.ok(r.corpo.fontes.every((f) => f.url.startsWith('https://')));
  assert.match(r.cabecalhos['content-type'], /^application\/json/);
  assert.equal(r.cabecalhos['cache-control'], 'no-store');
  assert.equal(r.cabecalhos['x-content-type-options'], 'nosniff');
});

test('E2. a frase de escopo é exatamente a aprovada', () => {
  assert.equal(FRASE_ESCOPO, 'Neste momento, a base possui conteúdo apenas sobre a LAC. Isso não significa que essa modalidade seja adequada ao seu caso.');
});

test('E3. aceita somente GET: os demais métodos recebem 405 com Allow: GET', async () => {
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']) {
    const r = await chamar({ method });
    assert.equal(r.status, 405, method);
    assert.equal(r.cabecalhos.allow, 'GET', method);
    assert.deepEqual(r.corpo, { erro: 'metodo_nao_permitido' }, method);
  }
});

test('E4. só atende origem local; qualquer outra recebe 403 sem conteúdo', async () => {
  // null = endereço de origem desconhecido (undefined acionaria o valor padrão do auxiliar de teste).
  for (const remoteAddress of ['192.168.0.10', '10.0.0.5', '203.0.113.9', null, '']) {
    const r = await chamar({ remoteAddress });
    assert.equal(r.status, 403, String(remoteAddress));
    assert.deepEqual(r.corpo, { erro: 'acesso_somente_local' });
  }
  for (const remoteAddress of ['127.0.0.1', '::1', '::ffff:127.0.0.1']) assert.equal((await chamar({ remoteAddress })).status, 200, remoteAddress);
});

test('E5. não recebe nem repete a pergunta: qualquer parâmetro é recusado e não é ecoado', async () => {
  for (const url of [`${ROTA_BLOCOS}?pergunta=SEGREDO123`, `${ROTA_BLOCOS}?q=lac&x=1`, `${ROTA_BLOCOS}?a`]) {
    const r = await chamar({ url });
    assert.equal(r.status, 400, url);
    assert.deepEqual(r.corpo, { erro: 'parametros_nao_aceitos' }, url);
    assert.equal(r.textoBruto.includes('SEGREDO123'), false);
    assert.equal(r.textoBruto.includes('pergunta'), false);
  }
  // "?" vazio não carrega parâmetro.
  assert.equal((await chamar({ url: `${ROTA_BLOCOS}?` })).status, 200);
});

test('E6. outros caminhos passam adiante (next) sem resposta do endpoint', async () => {
  for (const url of ['/', '/index.html', '/__assistente', `${ROTA_BLOCOS}/outro`, '/api/chat', '/services/lac/conteudo-assistente.json']) {
    const r = await chamar({ url });
    assert.equal(r.proximo, true, url);
    assert.equal(r.status, 0, url);
  }
});

test('E7. falha ao ler a base devolve 500 genérico, sem detalhes internos', async () => {
  const r = await chamar({ lerDados: async () => { throw new Error('/caminho/secreto/falhou'); } });
  assert.equal(r.status, 500);
  assert.deepEqual(r.corpo, { erro: 'indisponivel' });
  assert.equal(r.textoBruto.includes('secreto'), false);
});

test('E8. sem autorização válida ou sem blocos, o endpoint devolve lista vazia (nunca conteúdo)', async () => {
  const dados = async () => {
    const base = lerDadosDaBase(RAIZ);
    return { ...base, conteudo: { ...base.conteudo, autorizacao: { ...base.conteudo.autorizacao, aprovacaoPublica: true } } };
  };
  const r = await chamar({ lerDados: dados });
  assert.equal(r.status, 200);
  assert.deepEqual(r.corpo.blocos, []);
  assert.deepEqual(r.corpo.fontes, []);
});

test('E9. o modo é fixo no servidor (teste_local); o cliente não escolhe o modo', async () => {
  const r = await chamar({ url: `${ROTA_BLOCOS}?modo=publico` });
  assert.equal(r.status, 400);
  const codigo = lerTexto('services', 'assistant-endpoint.js');
  assert.match(codigo, /MODO_DO_ENDPOINT = 'teste_local'/);
  assert.doesNotMatch(codigo, /req\.(query|body)|URLSearchParams|searchParams|process\.env/);
});

test('E10. o plugin do Vite só vale no servidor de desenvolvimento (não existe no build nem no preview)', () => {
  const plugin = criarPluginAssistenteDev({ raiz: RAIZ });
  assert.equal(plugin.apply, 'serve');
  assert.equal(typeof plugin.configureServer, 'function');
  assert.equal('configurePreviewServer' in plugin, false);
  assert.ok(config.plugins.some((p) => p.name === 'sema-orienta-assistente-dev' && p.apply === 'serve'));
  const registrados = [];
  plugin.configureServer({ middlewares: { use: (fn) => registrados.push(fn) } });
  assert.equal(registrados.length, 1);
  assert.equal(typeof registrados[0], 'function');
});

test('E11. nenhum arquivo da interface importa o endpoint, as mensagens do servidor ou o JSON do conteúdo', () => {
  for (const arquivo of ['src/main.js', 'src/chat.js', 'src/assistant.js']) {
    const texto = lerTexto(arquivo);
    assert.doesNotMatch(texto, /assistant-endpoint|assistant-messages|assistant-content|conteudo-assistente|from '\.\.\/services|import\(.*services/, arquivo);
    assert.doesNotMatch(texto, /import .*\.json/, arquivo);
  }
});

test('E12. a conferência do dist/ (scripts/check-dist.js) não encontra conteúdo de teste, quando dist/ existir', { skip: !fs.existsSync(path.join(RAIZ, 'dist')) }, async () => {
  const { conferirDist, termosProibidos } = await import('../scripts/check-dist.js');
  assert.ok(termosProibidos(RAIZ).length >= 15);
  assert.deepEqual(conferirDist(RAIZ), []);
});
