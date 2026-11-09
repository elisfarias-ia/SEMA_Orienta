// Lógica da conversa. Sem rede e sem IA. O estado fica apenas em memória.

export const MENSAGEM_INICIAL =
  'Olá! Sou o SEMA Orienta. Escreva sua dúvida sobre serviços ambientais para iniciar o atendimento.';

export const RESPOSTA_TEMPORARIA =
  'Recebi sua pergunta. A base de informações da LAC está em configuração e será disponibilizada após a validação do conteúdo oficial.';

/** Remove espaços nas pontas; retorna '' se não houver texto útil. */
export function normalizarMensagem(texto) {
  return typeof texto === 'string' ? texto.trim() : '';
}

/** Gera a resposta temporária (igual para qualquer pergunta; não usa o texto recebido). */
export function gerarRespostaTemporaria() {
  return RESPOSTA_TEMPORARIA;
}

/** Resposta padrão quando nenhum responsável é informado: a mensagem segura de indisponibilidade. */
function respostaPadrao() {
  return { partes: [gerarRespostaTemporaria()], fontes: [], avisos: [] };
}

/**
 * Cria o estado da conversa, mantido apenas em memória (nada é gravado ou enviado).
 * `enviar(texto, responder)`: `responder(texto)` devolve { partes, fontes, avisos }; sem ele, usa a resposta temporária.
 */
export function criarConversa() {
  let mensagens = [{ autor: 'assistente', texto: MENSAGEM_INICIAL }];

  return {
    listar: () => mensagens.slice(),
    enviar(texto, responder) {
      const limpo = normalizarMensagem(texto);
      if (!limpo) return null;
      const resposta = typeof responder === 'function' ? responder(limpo) : respostaPadrao();
      const partes = Array.isArray(resposta?.partes) && resposta.partes.length > 0 ? resposta.partes : [gerarRespostaTemporaria()];
      const usuario = { autor: 'usuario', texto: limpo };
      const assistente = {
        autor: 'assistente',
        texto: partes.join('\n\n'),
        partes,
        fontes: Array.isArray(resposta?.fontes) ? resposta.fontes : [],
        avisos: Array.isArray(resposta?.avisos) ? resposta.avisos : [],
      };
      mensagens.push(usuario, assistente);
      return { usuario, assistente };
    },
    reiniciar() {
      mensagens = [{ autor: 'assistente', texto: MENSAGEM_INICIAL }];
    },
  };
}
