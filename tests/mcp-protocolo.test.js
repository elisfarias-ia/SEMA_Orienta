// Protocolo do servidor MCP local (Passo 2C1): JSON-RPC 2.0 por linha, initialize, notificações, erros e limites.
// Não grava arquivos: usa a base real só para leitura, por fluxos em memória.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import {
  criarProcessador,
  VERSOES_PROTOCOLO,
  VERSAO_MAIS_RECENTE,
  LIMITE_LINHA,
  INFORMACOES_DO_SERVIDOR,
} from '../scripts/mcp/protocolo.js';

// servidor.js é importado sem nenhuma marca: medimos os ouvintes do processo antes e depois da importação.
const ouvintes = () => ({
  data: process.stdin.listenerCount('data'),
  readable: process.stdin.listenerCount('readable'),
  end: process.stdin.listenerCount('end'),
  fluxo: process.stdin.readableFlowing,
  uncaughtException: process.listenerCount('uncaughtException'),
  unhandledRejection: process.listenerCount('unhandledRejection'),
});
const OUVINTES_ANTES = ouvintes();
const { criarServidorMcp } = await import('../scripts/mcp/servidor.js');
const OUVINTES_DEPOIS = ouvintes();

const FERRAMENTAS_FALSAS = {
  listar: () => [{ name: 'eco', description: 'falsa', inputSchema: { type: 'object', properties: {}, additionalProperties: false } }],
  chamar: (nome) => (nome === 'eco'
    ? { isError: false, dados: { ok: true }, resultado: { content: [{ type: 'text', text: '{"ok":true}' }], structuredContent: { ok: true } } }
    : { desconhecida: true }),
};

test('P0. importar servidor.js não liga nada ao process.stdin nem registra tratadores globais', () => {
  assert.deepEqual(OUVINTES_DEPOIS, OUVINTES_ANTES);
  assert.equal(globalThis[Symbol.for('sema-orienta.mcp.sem-inicio-automatico')], undefined);
});
const processar = criarProcessador({ ferramentas: FERRAMENTAS_FALSAS });
const enviar = (obj) => {
  const texto = processar(typeof obj === 'string' ? obj : JSON.stringify(obj));
  return texto === null ? null : JSON.parse(texto);
};
const MENSAGENS_FIXAS = new Map([
  [-32700, 'Erro de análise.'],
  [-32600, 'Requisição inválida.'],
  [-32601, 'Método não encontrado.'],
  [-32602, 'Parâmetros inválidos.'],
  [-32603, 'Erro interno.'],
]);
function assertErro(r, codigo, id) {
  assert.equal(r.jsonrpc, '2.0');
  assert.deepEqual(Object.keys(r).sort(), ['error', 'id', 'jsonrpc']);
  assert.equal(r.id, id);
  assert.deepEqual(r.error, { code: codigo, message: MENSAGENS_FIXAS.get(codigo) });
}

/** Servidor real sobre fluxos em memória; devolve a função de envio e a coleta das linhas de saída. */
function servidorEmMemoria() {
  const entrada = new PassThrough();
  const saida = new PassThrough();
  const erro = new PassThrough();
  let textoSaida = '';
  let textoErro = '';
  saida.on('data', (d) => { textoSaida += d.toString('utf8'); });
  erro.on('data', (d) => { textoErro += d.toString('utf8'); });
  const { encerrado } = criarServidorMcp({ entrada, saida, erro });
  return {
    entrada,
    encerrado,
    linhas: () => textoSaida.split('\n').filter((l) => l !== '').map((l) => JSON.parse(l)),
    erro: () => textoErro,
    textoSaida: () => textoSaida,
  };
}
const esperar = () => new Promise((r) => setImmediate(r));

test('P1. initialize ecoa versão suportada e responde a mais recente para versão desconhecida', () => {
  assert.deepEqual([...VERSOES_PROTOCOLO], ['2024-11-05', '2025-03-26', '2025-06-18', '2025-11-25']);
  for (const versao of VERSOES_PROTOCOLO) {
    const r = enviar({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: versao, capabilities: {}, clientInfo: { name: 'teste', version: '1' } } });
    assert.equal(r.result.protocolVersion, versao);
  }
  for (const desconhecida of ['1999-01-01', 'abc', 42, undefined]) {
    const r = enviar({ jsonrpc: '2.0', id: 'x', method: 'initialize', params: { protocolVersion: desconhecida } });
    assert.equal(r.error, undefined);
    assert.equal(r.result.protocolVersion, VERSAO_MAIS_RECENTE);
  }
  const r = enviar({ jsonrpc: '2.0', id: 7, method: 'initialize', params: { protocolVersion: '2025-06-18' } });
  assert.deepEqual(r, {
    jsonrpc: '2.0',
    id: 7,
    result: { protocolVersion: '2025-06-18', capabilities: { tools: { listChanged: false } }, serverInfo: { name: 'sema-orienta-base', version: '0.1.0' } },
  });
  assert.deepEqual({ ...INFORMACOES_DO_SERVIDOR }, { name: 'sema-orienta-base', version: '0.1.0' });
  assert.deepEqual(Object.keys(r.result.capabilities), ['tools']);
});

test('P2. notificações não recebem resposta; ping responde objeto vazio; id devolvido igual', () => {
  assert.equal(enviar({ jsonrpc: '2.0', method: 'notifications/initialized' }), null);
  assert.equal(enviar({ jsonrpc: '2.0', method: 'notifications/cancelled', params: { requestId: 1 } }), null);
  assert.equal(enviar({ jsonrpc: '2.0', method: 'metodo/desconhecido' }), null);
  for (const id of [0, 1, -5, 3.5, 'abc', '', 'id-com-ç']) {
    assert.deepEqual(enviar({ jsonrpc: '2.0', id, method: 'ping' }), { jsonrpc: '2.0', id, result: {} });
  }
  assert.equal(enviar(''), null);
  assert.equal(enviar('   '), null);
});

test('P3. -32700 para JSON inválido, com id null e mensagem fixa', () => {
  for (const linha of ['{', 'API_KEY=SEGREDO_FICTICIO', '{"jsonrpc":"2.0",}', 'nul']) {
    const texto = processar(linha);
    assert.doesNotMatch(texto, /SEGREDO|API_KEY|Unexpected|position|token/i);
    assertErro(JSON.parse(texto), -32700, null);
  }
});

test('P4. -32600 para envelope inválido e para lote em array', () => {
  assertErro(enviar('[]'), -32600, null);
  assertErro(enviar([{ jsonrpc: '2.0', id: 1, method: 'ping' }]), -32600, null);
  assertErro(enviar('42'), -32600, null);
  assertErro(enviar('"texto"'), -32600, null);
  assertErro(enviar('null'), -32600, null);
  assertErro(enviar({ jsonrpc: '1.0', id: 3, method: 'ping' }), -32600, 3);
  assertErro(enviar({ id: 4, method: 'ping' }), -32600, 4);
  assertErro(enviar({ jsonrpc: '2.0', id: 5, method: 12 }), -32600, 5);
  assertErro(enviar({ jsonrpc: '2.0', id: 6 }), -32600, 6);
  assertErro(enviar({ jsonrpc: '2.0', id: { a: 1 }, method: 'ping' }), -32600, null);
  assertErro(enviar({ jsonrpc: '2.0', id: null, method: 'ping' }), -32600, null);
  assertErro(enviar({ jsonrpc: '2.0', id: true, method: 'ping' }), -32600, null);
  assertErro(enviar({ jsonrpc: '2.0', id: 8, method: 'ping', params: 'texto' }), -32600, 8);
});

test('P5. -32601 para método desconhecido, resources/* e prompts/*', () => {
  for (const method of ['desconhecido', 'resources/list', 'resources/read', 'resources/templates/list', 'prompts/list', 'prompts/get', 'completion/complete', 'logging/setLevel']) {
    assertErro(enviar({ jsonrpc: '2.0', id: 9, method }), -32601, 9);
  }
});

test('P6. -32602 para ferramenta desconhecida e parâmetros inválidos de tools/call', () => {
  assertErro(enviar({ jsonrpc: '2.0', id: 10, method: 'tools/call', params: { name: 'nao_existe' } }), -32602, 10);
  assertErro(enviar({ jsonrpc: '2.0', id: 11, method: 'tools/call', params: {} }), -32602, 11);
  assertErro(enviar({ jsonrpc: '2.0', id: 12, method: 'tools/call', params: { name: 42 } }), -32602, 12);
  assertErro(enviar({ jsonrpc: '2.0', id: 13, method: 'tools/call', params: [] }), -32602, 13);
  assertErro(enviar({ jsonrpc: '2.0', id: 14, method: 'tools/call' }), -32602, 14);
  const ok = enviar({ jsonrpc: '2.0', id: 15, method: 'tools/call', params: { name: 'eco' } });
  assert.deepEqual(ok.result, { content: [{ type: 'text', text: '{"ok":true}' }], structuredContent: { ok: true } });
});

test('P7. -32603 com mensagem fixa e sem data quando a ferramenta lança exceção', () => {
  const codigos = [];
  const quebrado = criarProcessador({
    ferramentas: { listar: () => { throw new Error('C:\\caminho\\secreto SEGREDO_FICTICIO'); }, chamar: () => ({ desconhecida: true }) },
    aoErroInterno: (c) => codigos.push(c),
  });
  const texto = quebrado(JSON.stringify({ jsonrpc: '2.0', id: 16, method: 'tools/list' }));
  assert.doesNotMatch(texto, /SEGREDO|caminho|Error|at /);
  assertErro(JSON.parse(texto), -32603, 16);
  assert.deepEqual(codigos, ['mcp_erro_interno']);
});

test('P8. transporte: \\r\\n aceito, respostas em ordem, linha acima de 64 KB recusada sem derrubar o processo', async () => {
  const s = servidorEmMemoria();
  s.entrada.write('{"jsonrpc":"2.0","id":1,"method":"ping"}\r\n');
  s.entrada.write(`{"jsonrpc":"2.0","id":2,"method":"ping","params":{"x":"${'a'.repeat(LIMITE_LINHA)}"}}\n`);
  // Mensagem dividida em pedaços, inclusive no meio de um caractere de vários bytes.
  const dividida = Buffer.from('{"jsonrpc":"2.0","id":"ç3","method":"ping"}\n', 'utf8');
  s.entrada.write(dividida.subarray(0, 25));
  s.entrada.write(dividida.subarray(25));
  s.entrada.write('{"jsonrpc":"2.0","id":4,"method":"tools/list"}\n');
  s.entrada.end();
  await s.encerrado;
  const linhas = s.linhas();
  assert.equal(linhas.length, 4);
  assert.deepEqual(linhas[0], { jsonrpc: '2.0', id: 1, result: {} });
  assertErro(linhas[1], -32600, null);
  assert.deepEqual(linhas[2], { jsonrpc: '2.0', id: 'ç3', result: {} });
  assert.deepEqual(linhas[3].result.tools.map((t) => t.name), ['listar_assuntos', 'listar_servicos', 'consultar_fontes', 'resumir_base']);
  assert.equal(s.erro(), '');
});

test('P9. transporte: entrada enorme sem quebra de linha é recusada logo, descartada e o processo segue respondendo', async () => {
  const s = servidorEmMemoria();
  for (let i = 0; i < 20; i += 1) s.entrada.write('x'.repeat(16 * 1024));
  await esperar();
  const antes = s.linhas();
  assert.equal(antes.length, 1, 'a recusa sai antes de chegar a quebra de linha');
  assertErro(antes[0], -32600, null);
  s.entrada.write('continuação descartada\n');
  s.entrada.write('{"jsonrpc":"2.0","id":99,"method":"ping"}\n');
  s.entrada.end();
  await s.encerrado;
  const linhas = s.linhas();
  assert.equal(linhas.length, 2);
  assert.deepEqual(linhas[1], { jsonrpc: '2.0', id: 99, result: {} });
  assert.ok(s.textoSaida().length < 1024, 'a entrada descartada não é ecoada');
});

test('P10. transporte: linha final sem quebra de linha é processada no fim da entrada', async () => {
  const s = servidorEmMemoria();
  s.entrada.end('{"jsonrpc":"2.0","id":"fim","method":"ping"}');
  await s.encerrado;
  assert.deepEqual(s.linhas(), [{ jsonrpc: '2.0', id: 'fim', result: {} }]);
});
