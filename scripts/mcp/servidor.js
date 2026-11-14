// Servidor MCP local do SEMA Orienta (Passo 2C1): módulo puro e importável. Não liga stdin, não registra tratadores
// globais e não encerra o processo; isso é papel do ponto de entrada (iniciar.js).
//
// A raiz padrão do projeto vem de import.meta.url; nunca da linha de comando, do diretório de trabalho nem de variáveis
// de ambiente.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { criarProcessador, ligarTransporte } from './protocolo.js';
import { criarFerramentas } from './ferramentas.js';

export const RAIZ_DO_PROJETO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const CODIGO_ERRO_INTERNO = 'mcp_erro_interno';

/**
 * Cria o servidor sobre fluxos explícitos. `erro` recebe só códigos fixos. `sistema` (opcional) troca o módulo de
 * arquivos da leitura segura. Retorna { processarLinha, encerrado } (encerrado: promessa resolvida no fim da entrada).
 */
export function criarServidorMcp({ raiz = RAIZ_DO_PROJETO, entrada, saida, erro, sistema } = {}) {
  const ferramentas = criarFerramentas(sistema ? { raiz, sistema } : { raiz });
  const aoErroInterno = () => {
    if (erro && typeof erro.write === 'function') erro.write(`${CODIGO_ERRO_INTERNO}\n`);
  };
  const processarLinha = criarProcessador({ ferramentas, aoErroInterno });
  const encerrado = entrada && saida ? ligarTransporte({ entrada, saida, processarLinha }) : Promise.resolve();
  return { processarLinha, encerrado };
}
