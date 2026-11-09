// Mensagens institucionais fixas do assistente em modo de teste local.
// Ficam NO SERVIDOR (entregues pelo endpoint exclusivo do Vite em desenvolvimento) e nunca no código da interface,
// para que o build de produção não contenha nenhum texto de teste.

/** Frase de escopo aprovada: usada quando a pergunta é sobre licenciamento em geral. */
export const FRASE_ESCOPO =
  'Neste momento, a base possui conteúdo apenas sobre a LAC. Isso não significa que essa modalidade seja adequada ao seu caso.';

/** Faixa exibida na interface sempre que houver conteúdo de teste local. */
export const FAIXA_TESTE_LOCAL = 'Modo de teste local — conteúdo em validação, não oficial.';
