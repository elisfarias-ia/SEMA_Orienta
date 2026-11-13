// Processo do servidor MCP local (Passo 2C1): inicia `node scripts/mcp/iniciar.js` como processo filho (o spawn existe
// só neste teste), contra a base real e só lendo. Confere stdout só com JSON-RPC, stderr vazio, saída 0 ao fechar o
// stdin e services/ inalterado.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SERVIDOR = path.join(RAIZ, 'scripts', 'mcp', 'iniciar.js');

function hashDaPasta(pasta) {
  const h = crypto.createHash('sha256');
  const visitar = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const p = path.join(dir, e.name);
      h.update(path.relative(pasta, p).split(path.sep).join('/'));
      if (e.isDirectory()) visitar(p);
      else h.update(fs.readFileSync(p));
    }
  };
  visitar(pasta);
  return h.digest('hex');
}

/** Executa o servidor com as linhas dadas; o diretório de trabalho é o temporário, para provar que a raiz não vem dele. */
function executar(linhas, { fecharEntrada = true } = {}) {
  return new Promise((resolver, rejeitar) => {
    const filho = spawn(process.execPath, [SERVIDOR], { cwd: os.tmpdir(), stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    let saida = '';
    let erro = '';
    const limite = setTimeout(() => {
      filho.kill();
      rejeitar(new Error('tempo esgotado'));
    }, 20000);
    filho.stdout.on('data', (d) => { saida += d.toString('utf8'); });
    filho.stderr.on('data', (d) => { erro += d.toString('utf8'); });
    filho.on('error', rejeitar);
    filho.on('close', (codigo) => {
      clearTimeout(limite);
      resolver({ codigo, saida, erro });
    });
    for (const l of linhas) filho.stdin.write(`${l}\n`);
    if (fecharEntrada) filho.stdin.end();
  });
}

test('PR1. sessão completa: initialize, tools/list e as 4 ferramentas; stdout só JSON-RPC, stderr vazio, saída 0', async () => {
  const antes = hashDaPasta(path.join(RAIZ, 'services'));
  const pedidos = [
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'teste', version: '0' } } },
    { jsonrpc: '2.0', method: 'notifications/initialized' },
    { jsonrpc: '2.0', id: 2, method: 'tools/list' },
    { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'listar_assuntos', arguments: {} } },
    { jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'listar_servicos', arguments: {} } },
    { jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'consultar_fontes', arguments: { servicoId: 'lac' } } },
    { jsonrpc: '2.0', id: 6, method: 'tools/call', params: { name: 'resumir_base' } },
    { jsonrpc: '2.0', id: 7, method: 'resources/list' },
  ];
  const { codigo, saida, erro } = await executar(pedidos.map((p) => JSON.stringify(p)));
  assert.equal(codigo, 0);
  assert.equal(erro, '');
  assert.ok(saida.endsWith('\n'));
  const linhas = saida.split('\n').filter((l) => l !== '');
  assert.equal(linhas.length, 7, 'a notificação não recebe resposta');
  const respostas = linhas.map((l) => JSON.parse(l));
  for (const r of respostas) {
    assert.equal(r.jsonrpc, '2.0');
    assert.ok('result' in r !== 'error' in r);
  }
  assert.deepEqual(respostas.map((r) => r.id), [1, 2, 3, 4, 5, 6, 7]);
  assert.equal(respostas[0].result.protocolVersion, '2025-06-18');
  assert.deepEqual(respostas[1].result.tools.map((t) => t.name), ['listar_assuntos', 'listar_servicos', 'consultar_fontes', 'resumir_base']);
  for (const r of respostas.slice(2, 6)) {
    assert.notEqual(r.result.isError, true);
    assert.deepEqual(JSON.parse(r.result.content[0].text), r.result.structuredContent);
  }
  const lac = respostas[3].result.structuredContent.servicos[0];
  assert.equal(lac.versao.estado, 'rascunho');
  assert.equal(lac.registro.statusValidacao, 'em_validacao');
  assert.equal(lac.registro.versaoPublicadaId, null);
  assert.equal(respostas[6].error.code, -32601);
  assert.ok(!saida.includes(RAIZ) && !saida.includes(RAIZ.split(path.sep).join('/')) && !saida.includes(os.tmpdir()));
  assert.equal(hashDaPasta(path.join(RAIZ, 'services')), antes);
});

test('PR2. entradas inválidas e linha grande não derrubam o processo; saída 0 ao fechar o stdin', async () => {
  const { codigo, saida, erro } = await executar([
    'isto não é json',
    '[{"jsonrpc":"2.0","id":1,"method":"ping"}]',
    `{"jsonrpc":"2.0","id":2,"method":"ping","params":{"x":"${'a'.repeat(70 * 1024)}"}}`,
    '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"consultar_fontes","arguments":{"servicoId":"../.env"}}}',
    '{"jsonrpc":"2.0","id":4,"method":"ping"}',
  ]);
  assert.equal(codigo, 0);
  assert.equal(erro, '');
  const respostas = saida.split('\n').filter((l) => l !== '').map((l) => JSON.parse(l));
  assert.deepEqual(respostas.map((r) => (r.error ? r.error.code : 'ok')), [-32700, -32600, -32600, 'ok', 'ok']);
  assert.equal(respostas[3].result.isError, true);
  assert.equal(respostas[3].result.structuredContent.erro, 'parametro_invalido');
  assert.ok(!saida.includes('.env'));
  assert.deepEqual(respostas[4], { jsonrpc: '2.0', id: 4, result: {} });
});

test('PR3. stdin fechado sem nenhuma mensagem encerra com 0 e sem saída', async () => {
  const { codigo, saida, erro } = await executar([]);
  assert.equal(codigo, 0);
  assert.equal(saida, '');
  assert.equal(erro, '');
});
