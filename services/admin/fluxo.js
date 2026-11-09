// Fluxo de estados da VERSÃO de um serviço (modelo do Marco 7). Funções puras: não leem arquivos nem variáveis de ambiente.
//
// Estes seis estados pertencem à versão do serviço. Não substituem os status atuais de serviço, fontes,
// documentos e perguntas (rascunho / em_validacao / validado), que continuam como estão.
// Neste passo o fluxo ainda não é aplicado a nenhum conteúdo: não há validação material nem publicação autorizada.

export const ESTADOS_VERSAO = Object.freeze([
  'rascunho',
  'em_validacao',
  'ajustes_solicitados',
  'validado_materialmente',
  'autorizado_publicacao',
  'publicado',
]);

// Transições permitidas. `ajustes_solicitados` e `publicado` não têm saída: depois de ajustes pede-se uma NOVA versão
// (que nasce em rascunho), e uma versão publicada só é substituída por outra versão.
export const TRANSICOES = Object.freeze({
  rascunho: Object.freeze(['em_validacao']),
  em_validacao: Object.freeze(['ajustes_solicitados', 'validado_materialmente']),
  ajustes_solicitados: Object.freeze([]),
  validado_materialmente: Object.freeze(['autorizado_publicacao']),
  autorizado_publicacao: Object.freeze(['publicado']),
  publicado: Object.freeze([]),
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
