// Protocolo do servidor MCP local (Passo 2C1): JSON-RPC 2.0, uma mensagem por linha, transporte stdio.
// Módulo puro quanto à base: não lê arquivos nem conhece services/. Recebe as ferramentas por injeção.
//
// Regras: processamento em série; capacidade anunciada só `tools`; mensagens de erro fixas e sem `data`; linha acima de
// 64 KB (inclusive sem quebra de linha) é descartada e respondida com -32600 sem derrubar o processo.

import readline from 'node:readline';
import { Transform } from 'node:stream';

export const LIMITE_LINHA = 64 * 1024;
export const VERSOES_PROTOCOLO = Object.freeze(['2024-11-05', '2025-03-26', '2025-06-18', '2025-11-25']);
export const VERSAO_MAIS_RECENTE = VERSOES_PROTOCOLO[VERSOES_PROTOCOLO.length - 1];
export const INFORMACOES_DO_SERVIDOR = Object.freeze({ name: 'sema-orienta-base', version: '0.1.0' });

export const ERROS_JSONRPC = Object.freeze({
  analise: Object.freeze({ code: -32700, message: 'Erro de análise.' }),
  requisicao: Object.freeze({ code: -32600, message: 'Requisição inválida.' }),
  metodo: Object.freeze({ code: -32601, message: 'Método não encontrado.' }),
  parametros: Object.freeze({ code: -32602, message: 'Parâmetros inválidos.' }),
  interno: Object.freeze({ code: -32603, message: 'Erro interno.' }),
});

// Marcador interno de linha grande demais. Contém byte nulo, que não pode aparecer cru em JSON válido.
const MARCADOR_LINHA_GRANDE = '\u0000linha_grande_demais';

const ehObjeto = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const idValido = (id) => typeof id === 'string' || (typeof id === 'number' && Number.isFinite(id));

const resposta = (id, result) => ({ jsonrpc: '2.0', id, result });
const erro = (id, tipo) => ({ jsonrpc: '2.0', id, error: { code: tipo.code, message: tipo.message } });

/**
 * Divide a entrada em linhas de até `limite` bytes. Guarda no máximo uma linha; acima do limite, descarta o restante até
 * a próxima quebra de linha e entrega o marcador interno (imediatamente, mesmo que a quebra de linha nunca chegue).
 */
export function criarDivisorDeLinhas(limite = LIMITE_LINHA) {
  let partes = [];
  let tamanho = 0;
  let descartando = false;
  return new Transform({
    transform(pedaco, _codificacao, concluir) {
      const buffer = Buffer.isBuffer(pedaco) ? pedaco : Buffer.from(String(pedaco), 'utf8');
      let inicio = 0;
      while (inicio < buffer.length) {
        const quebra = buffer.indexOf(0x0a, inicio);
        const fim = quebra === -1 ? buffer.length : quebra;
        if (descartando) {
          if (quebra !== -1) descartando = false;
        } else if (tamanho + (fim - inicio) > limite) {
          partes = [];
          tamanho = 0;
          this.push(Buffer.from(`${MARCADOR_LINHA_GRANDE}\n`, 'utf8'));
          descartando = quebra === -1;
        } else {
          partes.push(buffer.subarray(inicio, fim));
          tamanho += fim - inicio;
          if (quebra !== -1) {
            partes.push(Buffer.from('\n', 'utf8'));
            this.push(Buffer.concat(partes));
            partes = [];
            tamanho = 0;
          }
        }
        inicio = quebra === -1 ? buffer.length : quebra + 1;
      }
      concluir();
    },
    flush(concluir) {
      if (!descartando && tamanho > 0) this.push(Buffer.concat(partes));
      partes = [];
      tamanho = 0;
      concluir();
    },
  });
}

/**
 * Cria o processador de mensagens. `ferramentas` = { listar(): definições, chamar(nome, argumentos) }.
 * `chamar` devolve { desconhecida: true } para nome inexistente ou { isError, dados, resultado }, em que `resultado` é o
 * objeto result completo de tools/call, já filtrado e com o limite de 256 KB conferido.
 * `aoErroInterno` recebe só um código fixo.
 */
export function criarProcessador({ ferramentas, aoErroInterno = () => {} }) {
  function tratar(mensagem) {
    if (!ehObjeto(mensagem)) return erro(null, ERROS_JSONRPC.requisicao);
    const temId = Object.prototype.hasOwnProperty.call(mensagem, 'id');
    if (temId && !idValido(mensagem.id)) return erro(null, ERROS_JSONRPC.requisicao);
    const id = temId ? mensagem.id : null;
    if (mensagem.jsonrpc !== '2.0' || typeof mensagem.method !== 'string') return erro(id, ERROS_JSONRPC.requisicao);
    // Notificações (sem id) nunca recebem resposta, inclusive notifications/initialized.
    if (!temId) return null;

    const { method } = mensagem;
    const temParams = Object.prototype.hasOwnProperty.call(mensagem, 'params');
    const params = temParams ? mensagem.params : {};
    if (temParams && !ehObjeto(params)) {
      return Array.isArray(params) ? erro(id, ERROS_JSONRPC.parametros) : erro(id, ERROS_JSONRPC.requisicao);
    }

    if (method === 'initialize') {
      const pedida = params.protocolVersion;
      const protocolVersion = typeof pedida === 'string' && VERSOES_PROTOCOLO.includes(pedida) ? pedida : VERSAO_MAIS_RECENTE;
      return resposta(id, {
        protocolVersion,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { ...INFORMACOES_DO_SERVIDOR },
      });
    }
    if (method === 'ping') return resposta(id, {});
    if (method === 'tools/list') return resposta(id, { tools: ferramentas.listar() });
    if (method === 'tools/call') {
      if (typeof params.name !== 'string') return erro(id, ERROS_JSONRPC.parametros);
      const r = ferramentas.chamar(params.name, Object.prototype.hasOwnProperty.call(params, 'arguments') ? params.arguments : undefined);
      if (!r || r.desconhecida || !ehObjeto(r.resultado)) return erro(id, ERROS_JSONRPC.parametros);
      // O resultado completo já vem montado e com o limite de tamanho conferido no ponto central (ferramentas.chamar).
      return resposta(id, r.resultado);
    }
    return erro(id, ERROS_JSONRPC.metodo);
  }

  /** Processa uma linha recebida. Retorna o texto da resposta (sem quebra de linha) ou null quando não há resposta. */
  return function processarLinha(linha) {
    if (linha === MARCADOR_LINHA_GRANDE) return JSON.stringify(erro(null, ERROS_JSONRPC.requisicao));
    if (typeof linha !== 'string' || linha.trim() === '') return null;
    let mensagem;
    try {
      mensagem = JSON.parse(linha);
    } catch {
      return JSON.stringify(erro(null, ERROS_JSONRPC.analise));
    }
    // Lotes (arrays) não são aceitos.
    if (Array.isArray(mensagem)) return JSON.stringify(erro(null, ERROS_JSONRPC.requisicao));
    try {
      const r = tratar(mensagem);
      return r === null ? null : JSON.stringify(r);
    } catch {
      aoErroInterno('mcp_erro_interno');
      const id = ehObjeto(mensagem) && idValido(mensagem.id) ? mensagem.id : null;
      return JSON.stringify(erro(id, ERROS_JSONRPC.interno));
    }
  };
}

/**
 * Liga o processador a um fluxo de entrada e um de saída. Uma mensagem JSON-RPC por linha na saída.
 * Retorna uma promessa resolvida quando a entrada termina.
 */
export function ligarTransporte({ entrada, saida, processarLinha }) {
  const divisor = criarDivisorDeLinhas();
  entrada.pipe(divisor);
  const linhas = readline.createInterface({ input: divisor, crlfDelay: Infinity, terminal: false });
  linhas.on('line', (linha) => {
    const texto = processarLinha(linha);
    if (texto !== null) saida.write(`${texto}\n`);
  });
  return new Promise((resolver) => {
    linhas.once('close', resolver);
  });
}
