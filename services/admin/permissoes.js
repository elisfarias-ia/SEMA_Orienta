// Matriz de permissões por perfil (Sprint 8, Passo 8A). Funções puras, sem I/O.
//
// Cada ação pertence a exatamente UM perfil: o Cadastrante cadastra, edita, revisa e envia para revisão; o Revisor valida
// materialmente, solicita ajustes, autoriza, publica e revoga. O perfil de demonstração não tem nenhuma ação.
// A matriz AINDA NÃO é usada pelas rotas nem pelas telas: a aplicação nas gravações é o Passo 8C.
// "concluir_revisao" (nome legado da ação que leva a versão para validação) não entra aqui; o 8C/8D decide seu destino.

const lista = (...perfis) => Object.freeze(perfis);
const CADASTRANTE = lista('cadastrante');
const REVISOR = lista('revisor');

/** Ação → perfis que podem executá-la (exatamente um). */
export const PERMISSOES = Object.freeze({
  cadastrar_tema: CADASTRANTE,
  cadastrar_servico: CADASTRANTE,
  cadastrar_fonte: CADASTRANTE,
  cadastrar_link: CADASTRANTE,
  cadastrar_texto: CADASTRANTE,
  cadastrar_informacao: CADASTRANTE,
  editar_informacao: CADASTRANTE,
  excluir_informacao: CADASTRANTE,
  editar_fonte: CADASTRANTE,
  excluir_fonte: CADASTRANTE,
  editar_servico: CADASTRANTE,
  editar_tema: CADASTRANTE,
  importar_conteudo: CADASTRANTE,
  revisar_fonte: CADASTRANTE,
  aceitar_bloco: CADASTRANTE,
  rejeitar_bloco: CADASTRANTE,
  reabrir_bloco: CADASTRANTE,
  nova_versao: CADASTRANTE,
  enviar_para_revisao: CADASTRANTE,
  validar_materialmente: REVISOR,
  solicitar_ajustes: REVISOR,
  autorizar_publicacao: REVISOR,
  publicar: REVISOR,
  revogar: REVISOR,
});

export const ACOES = Object.freeze(Object.keys(PERMISSOES));

/** O perfil pode executar a ação? false para entradas que não sejam texto, perfil ou ação desconhecidos e chaves de protótipo. */
export function podeExecutar(perfil, acao) {
  if (typeof perfil !== 'string' || typeof acao !== 'string') return false;
  if (!Object.hasOwn(PERMISSOES, acao)) return false;
  return PERMISSOES[acao].includes(perfil);
}

/** Ações do perfil (cópia; lista vazia se o perfil for desconhecido). */
export function acoesDoPerfil(perfil) {
  if (typeof perfil !== 'string') return [];
  return ACOES.filter((a) => PERMISSOES[a].includes(perfil));
}
