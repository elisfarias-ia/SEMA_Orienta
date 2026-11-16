// Contato institucional permitido (Sprint 5): configuração ÚNICA dos domínios de e-mail que podem aparecer no texto informado.
// Função pura, sem dependências do Node (também é usada pela interface administrativa local, que só existe no `npm run dev`).
//
// Regras: o domínio é comparado sem diferença entre maiúsculas e minúsculas e EXATAMENTE (subdomínio ou sufixo de outro site,
// como "sema.mt.gov.br.exemplo.com", não é o domínio institucional). E-mails de qualquer outro domínio (pessoais ou externos)
// continuam bloqueados. Este módulo nunca registra nem devolve o endereço encontrado: só um booleano.

export const DOMINIOS_EMAIL_PERMITIDOS = Object.freeze(['sema.mt.gov.br']);

// Parte local limitada (limite de e-mail) para não haver custo quadrático em textos longos sem arroba.
const PADRAO_EMAIL_GLOBAL = /[\w.+-]{1,64}@([\w-]+(?:\.[\w-]+)+)/g;

/** Verdadeiro se o texto tem algum e-mail cujo domínio NÃO é um dos permitidos. Nunca devolve nem registra o endereço. */
export function contemEmailNaoPermitido(texto) {
  if (typeof texto !== 'string') return false;
  for (const m of texto.matchAll(PADRAO_EMAIL_GLOBAL)) {
    if (!DOMINIOS_EMAIL_PERMITIDOS.includes(m[1].toLowerCase())) return true;
  }
  return false;
}
