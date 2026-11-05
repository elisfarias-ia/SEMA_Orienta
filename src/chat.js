// Lógica da conversa. Sem rede, sem IA, sem conteúdo da LAC.

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

/** Cria o estado da conversa, mantido apenas em memória. */
export function criarConversa() {
  let mensagens = [{ autor: 'assistente', texto: MENSAGEM_INICIAL }];

  return {
    listar: () => mensagens.slice(),
    enviar(texto) {
      const limpo = normalizarMensagem(texto);
      if (!limpo) return null;
      const usuario = { autor: 'usuario', texto: limpo };
      const assistente = { autor: 'assistente', texto: gerarRespostaTemporaria() };
      mensagens.push(usuario, assistente);
      return { usuario, assistente };
    },
    reiniciar() {
      mensagens = [{ autor: 'assistente', texto: MENSAGEM_INICIAL }];
    },
  };
}
