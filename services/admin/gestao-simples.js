// Gestão simples por serviço (Sprint 4, Passo 4B2): validações PURAS dos corpos das rotas novas. O cliente nunca envia ids de
// serviço, fonte ou entrada a gravar, nem revisão, status, publicação ou objeto de fonte: só nomes, textos e a IDENTIDADE
// (servicoId + fonteId) de um link já cadastrado, que o servidor relê do disco. Erros trazem só nomes de campos.

import { PADRAO_ID, baseDoId, textoLivre, validarCorpoAssunto } from './cadastro.js';

const ehObjeto = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const temExtras = (obj, permitidos) => Object.keys(obj).some((k) => !permitidos.includes(k));
const LIMITE_ID = 60;
const idValido = (v) => typeof v === 'string' && v.length <= LIMITE_ID && PADRAO_ID.test(v);

export const CAMPOS_SERVICO_SIMPLES = Object.freeze(['nome', 'tema']);
export const CAMPOS_LINK_NOVO = Object.freeze(['titulo', 'tipo', 'orgaoResponsavel', 'url', 'descricao', 'origemOficial']);
export const CAMPOS_LINK_EXISTENTE = Object.freeze(['servicoId', 'fonteId']);
export const CAMPOS_BUSCA_LINK = Object.freeze(['consulta']);
const LIMITE_NOME = 120;
const LIMITE_CONSULTA = 100;

/**
 * Serviço novo: somente `nome` e `tema`. O tema é { id } (tema existente, escolhido na lista) ou { nome } (digitado: se já
 * existir um tema com esse nome, o servidor o reutiliza). Retorna { ok, dados: { nome, temaId | temaNome } } ou { ok: false, campos }.
 */
export function validarCorpoServicoSimples(corpo) {
  if (!ehObjeto(corpo)) return { ok: false, campos: ['corpo'] };
  const campos = [];
  if (temExtras(corpo, CAMPOS_SERVICO_SIMPLES)) campos.push('extras');
  const nome = textoLivre(corpo.nome, LIMITE_NOME);
  if (nome === null || baseDoId(nome) === null) campos.push('nome');
  let tema = {};
  if (ehObjeto(corpo.tema) && Object.keys(corpo.tema).length === 1 && Object.hasOwn(corpo.tema, 'id')) {
    if (idValido(corpo.tema.id)) tema = { temaId: corpo.tema.id };
    else campos.push('tema');
  } else if (ehObjeto(corpo.tema) && Object.keys(corpo.tema).length === 1 && Object.hasOwn(corpo.tema, 'nome')) {
    const r = validarCorpoAssunto({ nome: corpo.tema.nome });
    if (r.ok) tema = { temaNome: r.dados.nome };
    else campos.push('tema');
  } else {
    campos.push('tema');
  }
  return campos.length ? { ok: false, campos } : { ok: true, dados: { nome, ...tema } };
}

/** Link novo: só os campos permitidos (sem id, revisão, status nem publicação). A validação fina é a de validarCorpoFonte. */
export function validarCamposLinkNovo(corpo) {
  if (!ehObjeto(corpo)) return { ok: false, campos: ['corpo'] };
  if (temExtras(corpo, CAMPOS_LINK_NOVO)) return { ok: false, campos: ['extras'] };
  return { ok: true, dados: { ...corpo } };
}

/** Identidade do link a reutilizar: somente { servicoId, fonteId } (formato de id). Nunca o objeto da fonte. */
export function validarIdentidadeLink(corpo) {
  if (!ehObjeto(corpo)) return { ok: false, campos: ['corpo'] };
  const campos = [];
  if (temExtras(corpo, CAMPOS_LINK_EXISTENTE)) campos.push('extras');
  if (!idValido(corpo.servicoId)) campos.push('servicoId');
  if (!idValido(corpo.fonteId)) campos.push('fonteId');
  return campos.length ? { ok: false, campos } : { ok: true, dados: { servicoId: corpo.servicoId, fonteId: corpo.fonteId } };
}

/** Pesquisa de links já cadastrados: só `consulta` (texto opcional, curto). */
export function validarBuscaLink(corpo) {
  if (!ehObjeto(corpo)) return { ok: false, campos: ['corpo'] };
  if (temExtras(corpo, CAMPOS_BUSCA_LINK)) return { ok: false, campos: ['extras'] };
  const c = corpo.consulta;
  if (c === undefined || c === null) return { ok: true, dados: { consulta: '' } };
  if (typeof c !== 'string' || c.length > LIMITE_CONSULTA || /[\u0000-\u001f\u007f]/.test(c)) return { ok: false, campos: ['consulta'] };
  return { ok: true, dados: { consulta: c.trim() } };
}
