// Ponto de entrada do servidor MCP local (Passo 2C1). Uso: npm run mcp (ou node scripts/mcp/iniciar.js), iniciado pelo
// cliente MCP conforme .mcp.json. Liga stdin/stdout/stderr ao servidor; o stdout recebe só JSON-RPC e o stderr só
// códigos fixos. Falha inesperada: código fixo e saída 1. Fim do stdin: saída 0.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { criarServidorMcp } from './servidor.js';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const CODIGO_FALHA_INESPERADA = 'mcp_falha_inesperada';

const encerrarComFalha = () => {
  try {
    process.stderr.write(`${CODIGO_FALHA_INESPERADA}\n`);
  } finally {
    process.exit(1);
  }
};
process.on('uncaughtException', encerrarComFalha);
process.on('unhandledRejection', encerrarComFalha);

const { encerrado } = criarServidorMcp({ raiz: RAIZ, entrada: process.stdin, saida: process.stdout, erro: process.stderr });
encerrado.then(() => {
  process.exitCode = 0;
});
