// Fluxo de estados da VERSÃO de um serviço (modelo do Marco 7). Funções puras: não leem arquivos nem variáveis de ambiente.
//
// Estes oito estados pertencem à versão do serviço. Não substituem os status atuais de serviço, fontes,
// documentos e perguntas (rascunho / em_validacao / validado), que continuam como estão.
// Neste passo o fluxo ainda não é aplicado a nenhum conteúdo: não há validação material nem publicação autorizada.

export const ESTADOS_VERSAO = Object.freeze([
  'rascunho',
  'em_validacao',
  'ajustes_solicitados',
  'validado_materialmente',
  'autorizado_publicacao',
  'publicado',
  'revogado',
  'substituido',
]);

// Transições permitidas. `ajustes_solicitados` e `revogado` não têm saída: depois de ajustes pede-se uma NOVA versão
// (que nasce em rascunho). Uma versão publicada só sai de uso substituída por outra versão ou revogada (Sprint 7, Passo 7A);
// uma versão revogada NUNCA volta a publicado: só uma nova versão, com nova autorização, pode ser publicada.
// `substituido` é terminal: a versão publicada vira substituída quando outra versão é publicada (nenhuma ação do usuário leva a ele).
export const TRANSICOES = Object.freeze({
  rascunho: Object.freeze(['em_validacao']),
  em_validacao: Object.freeze(['ajustes_solicitados', 'validado_materialmente']),
  ajustes_solicitados: Object.freeze([]),
  validado_materialmente: Object.freeze(['autorizado_publicacao']),
  autorizado_publicacao: Object.freeze(['publicado']),
  publicado: Object.freeze(['revogado', 'substituido']),
  revogado: Object.freeze([]),
  substituido: Object.freeze([]),
});

export const estadoVersaoValido = (estado) => ESTADOS_VERSAO.includes(estado);

/** Estados seguintes permitidos a partir de `estado` (lista vazia se o estado for desconhecido ou final). */
export function proximosEstados(estado) {
  return estadoVersaoValido(estado) ? [...TRANSICOES[estado]] : [];
}

/** Verifica uma transição. Retorna { permitida, motivo }; nunca lança exceção nem altera nada. */
export function verificarTransicao(de, para) {
  if (!estadoVersaoValido(de)) return { permitida: false, motivo: 'estado_de_origem_desconhecido' };
  if (!estadoVersaoValido(para)) return { permitida: false, motivo: 'estado_de_destino_desconhecido' };
  if (de === para) return { permitida: false, motivo: 'mesmo_estado' };
  if (!TRANSICOES[de].includes(para)) return { permitida: false, motivo: 'transicao_nao_permitida' };
  return { permitida: true, motivo: null };
}

export const transicaoPermitida = (de, para) => verificarTransicao(de, para).permitida;

/** O conteúdo de uma versão só pode ser alterado enquanto ela está em rascunho; depois disso fica congelado. */
export const conteudoEditavel = (estado) => estado === 'rascunho';

/** Depois de ajustes solicitados, ou de qualquer estado posterior ao rascunho, mudar o conteúdo exige nova versão. */
export const exigeNovaVersaoParaAlterar = (estado) => estadoVersaoValido(estado) && estado !== 'rascunho';

// Tabela PURA das ações humanas da versão e dos estados em que cada uma é permitida (Sprint 5, Passo 5A). Revisão e autorização
// são ações separadas; publicar é outra. "enviar_para_revisao" (Cadastrante) congela a versão e calcula o hash; "validar_materialmente"
// e "solicitar_ajustes" (Revisor) decidem sobre ela (Sprint 8, Passo 8D). "nova_versao" não muda a versão
// de origem: cria outra, que nasce em rascunho.
export const ACOES_DA_VERSAO = Object.freeze({
  enviar_para_revisao: Object.freeze({ de: Object.freeze(['rascunho']), para: 'em_validacao' }),
  solicitar_ajustes: Object.freeze({ de: Object.freeze(['em_validacao']), para: 'ajustes_solicitados' }),
  validar_materialmente: Object.freeze({ de: Object.freeze(['em_validacao']), para: 'validado_materialmente' }),
  autorizar_publicacao: Object.freeze({ de: Object.freeze(['validado_materialmente']), para: 'autorizado_publicacao' }),
  publicar: Object.freeze({ de: Object.freeze(['autorizado_publicacao']), para: 'publicado' }),
  // Revogar tira de uso a versão publicada inteira (Sprint 7). Exige motivo (decisoes.js); nada volta a publicado sozinho.
  revogar: Object.freeze({ de: Object.freeze(['publicado']), para: 'revogado' }),
  nova_versao: Object.freeze({ de: Object.freeze(['ajustes_solicitados', 'validado_materialmente', 'autorizado_publicacao', 'publicado', 'revogado']), para: 'rascunho' }),
});

/** Ações permitidas no estado dado (lista vazia se o estado for desconhecido). */
export function acoesPermitidas(estado) {
  if (!estadoVersaoValido(estado)) return [];
  return Object.keys(ACOES_DA_VERSAO).filter((a) => ACOES_DA_VERSAO[a].de.includes(estado));
}

/** Verifica uma ação no estado atual. Retorna { permitida, para, motivo }. */
export function verificarAcao(acao, estado) {
  if (!Object.hasOwn(ACOES_DA_VERSAO, acao)) return { permitida: false, para: null, motivo: 'acao_desconhecida' };
  if (!estadoVersaoValido(estado)) return { permitida: false, para: null, motivo: 'estado_de_origem_desconhecido' };
  const a = ACOES_DA_VERSAO[acao];
  return a.de.includes(estado) ? { permitida: true, para: a.para, motivo: null } : { permitida: false, para: null, motivo: 'acao_nao_permitida_no_estado' };
}
