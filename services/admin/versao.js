// Versões de serviço (Marco 7, Passo 7B). Funções puras: recebem ids e datas de fora, não usam relógio, UUID aleatório,
// variáveis de ambiente nem arquivos, e nunca modificam os objetos recebidos (devolvem cópias novas).
//
// A versão guarda REFERÊNCIAS aos arquivos modulares do serviço (`arquivos`), não o conteúdo. O conteúdo é entregue
// a `enviarParaValidacao` só para calcular o hash. Nenhuma versão real existe ainda: nada foi migrado nem gravado.
//
// Resultado das operações: { ok: true, ... } ou { ok: false, erro: '<codigo>', detalhes?: [...] }.

import { validarResponsavelPublico } from './atores.js';
import { ESTADOS_VERSAO, estadoVersaoValido, conteudoEditavel, verificarTransicao } from './fluxo.js';
import { hashConteudo } from './hash.js';

export const PADRAO_ID = /^[a-z][a-z0-9-]*$/;
const PADRAO_DATA = /^\d{4}-\d{2}-\d{2}$/;
const PADRAO_HASH = /^[0-9a-f]{64}$/;

/** Estados a partir dos quais se pode abrir uma nova versão (nunca de rascunho nem de em_validacao). */
export const ESTADOS_QUE_PERMITEM_NOVA_VERSAO = Object.freeze([
  'ajustes_solicitados',
  'validado_materialmente',
  'autorizado_publicacao',
  'publicado',
  'revogado',
]);

const ehObjeto = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const textoPreenchido = (v) => typeof v === 'string' && v.trim() !== '';
export const idValido = (v) => typeof v === 'string' && PADRAO_ID.test(v);
export const falha = (erro, detalhes) => (detalhes && detalhes.length ? { ok: false, erro, detalhes } : { ok: false, erro });

/** Data AAAA-MM-DD existente no calendário. */
export function dataIsoValida(valor) {
  if (typeof valor !== 'string' || !PADRAO_DATA.test(valor)) return false;
  const data = new Date(`${valor}T00:00:00Z`);
  return !Number.isNaN(data.getTime()) && data.toISOString().slice(0, 10) === valor;
}

/** Referências aos arquivos modulares: objeto simples, valores = caminhos relativos (texto). Conteúdo embutido é recusado. */
export function validarArquivos(arquivos) {
  const erros = [];
  if (!ehObjeto(arquivos) || Object.keys(arquivos).length === 0) return ['arquivos deve ser um objeto não vazio de referências'];
  for (const [chave, caminho] of Object.entries(arquivos)) {
    if (!idValidoChave(chave)) erros.push(`arquivos: chave inválida ${JSON.stringify(chave)}`);
    if (typeof caminho !== 'string' || caminho.trim() === '') {
      erros.push(`arquivos.${chave}: deve ser o caminho (texto) de um arquivo modular`);
    } else if (/^([a-zA-Z]:|[\\/])/.test(caminho) || caminho.split(/[\\/]/).includes('..') || /[\r\n]/.test(caminho) || caminho.length > 200) {
      erros.push(`arquivos.${chave}: caminho deve ser relativo, curto e sem ".."`);
    }
  }
  return erros;
}
const idValidoChave = (c) => /^[a-zA-Z][a-zA-Z0-9]*$/.test(c);

// Responsáveis públicos da versão (Sprint 7, Passo 7C): cada etapa só existe a partir do estado em que ela acontece, e cada valor
// é exatamente { perfil, setor } de um usuário autorizado (atores.js). Nunca usuarioId, nome ou e-mail: o manifesto vai para o Git.
export const ETAPAS_COM_RESPONSAVEL = Object.freeze({
  validacao: Object.freeze(['validado_materialmente', 'autorizado_publicacao', 'publicado', 'revogado']),
  autorizacao: Object.freeze(['autorizado_publicacao', 'publicado', 'revogado']),
  publicacao: Object.freeze(['publicado', 'revogado']),
  revogacao: Object.freeze(['revogado']),
});

function validarResponsaveis(responsaveis, estado) {
  if (!ehObjeto(responsaveis) || Object.keys(responsaveis).length === 0) return ['responsaveis deve ser um objeto não vazio'];
  const erros = [];
  for (const [etapa, responsavel] of Object.entries(responsaveis)) {
    if (!Object.hasOwn(ETAPAS_COM_RESPONSAVEL, etapa)) {
      erros.push('responsaveis: etapa não prevista');
      continue;
    }
    if (!ETAPAS_COM_RESPONSAVEL[etapa].includes(estado)) erros.push(`responsaveis.${etapa} não é permitido neste estado`);
    erros.push(...validarResponsavelPublico(responsavel).map((e) => `responsaveis.${etapa}: ${e}`));
  }
  return erros;
}

/**
 * Confere a estrutura e a coerência de uma versão. Retorna a lista de erros (vazia se estiver correta).
 * Coerência: rascunho não tem hash nem envio; qualquer outro estado tem os dois.
 */
export function validarVersao(v) {
  if (!ehObjeto(v)) return ['versão deve ser um objeto'];
  const erros = [];
  const esperados = ['arquivos', 'baseadaEm', 'criadoEm', 'enviadaEm', 'estado', 'hashConteudo', 'id', 'numero', 'servicoId'];
  // `publicadoEm` e `revogadoEm` são opcionais: só existem na versão publicada ou revogada (datas fora do hash, que não cobre o manifesto).
  // `responsaveis` (Sprint 7, Passo 7C) é opcional: perfil e setor de quem validou, autorizou, publicou ou revogou.
  const opcionais = ['publicadoEm', 'revogadoEm', 'responsaveis'];
  for (const k of Object.keys(v)) if (!esperados.includes(k) && !opcionais.includes(k)) erros.push(`campo não previsto: ${k}`);
  for (const k of esperados) if (!(k in v)) erros.push(`campo obrigatório ausente: ${k}`);
  if (erros.length) return erros;

  if (!idValido(v.id)) erros.push('id inválido');
  if (!idValido(v.servicoId)) erros.push('servicoId inválido');
  if (!Number.isInteger(v.numero) || v.numero < 1) erros.push('numero deve ser um inteiro maior ou igual a 1');
  if (v.numero === 1 && v.baseadaEm !== null) erros.push('a primeira versão não é baseada em outra (baseadaEm deve ser null)');
  if (Number.isInteger(v.numero) && v.numero > 1 && !idValido(v.baseadaEm)) erros.push('baseadaEm deve indicar a versão anterior');
  if (v.baseadaEm !== null && v.baseadaEm === v.id) erros.push('uma versão não pode ser baseada nela mesma');
  if (!estadoVersaoValido(v.estado)) erros.push('estado inválido');
  erros.push(...validarArquivos(v.arquivos));
  if (!dataIsoValida(v.criadoEm)) erros.push('criadoEm deve ser uma data válida AAAA-MM-DD');

  if (v.estado === 'rascunho') {
    if (v.hashConteudo !== null) erros.push('rascunho não pode ter hashConteudo');
    if (v.enviadaEm !== null) erros.push('rascunho não pode ter enviadaEm');
  } else if (estadoVersaoValido(v.estado)) {
    if (typeof v.hashConteudo !== 'string' || !PADRAO_HASH.test(v.hashConteudo)) erros.push('hashConteudo (SHA-256) obrigatório fora de rascunho');
    if (!dataIsoValida(v.enviadaEm)) erros.push('enviadaEm deve ser uma data válida fora de rascunho');
    else if (dataIsoValida(v.criadoEm) && v.enviadaEm < v.criadoEm) erros.push('enviadaEm não pode ser anterior a criadoEm');
  }
  if ('publicadoEm' in v) {
    if (v.estado !== 'publicado' && v.estado !== 'revogado') erros.push('publicadoEm só é permitido em versão publicada ou revogada');
    else if (!dataIsoValida(v.publicadoEm)) erros.push('publicadoEm deve ser uma data válida AAAA-MM-DD');
    else if (dataIsoValida(v.enviadaEm) && v.publicadoEm < v.enviadaEm) erros.push('publicadoEm não pode ser anterior a enviadaEm');
  }
  // Revogação (Sprint 7, Passo 7A): a versão revogada foi publicada antes e guarda as duas datas. `revogadoEm` em qualquer outro
  // estado significa uma versão revogada que voltou a ser usada, o que nunca é permitido.
  if (v.estado === 'revogado') {
    if (!('publicadoEm' in v)) erros.push('versão revogada exige publicadoEm (só se revoga o que foi publicado)');
    if (!('revogadoEm' in v)) erros.push('versão revogada exige revogadoEm');
    else if (!dataIsoValida(v.revogadoEm)) erros.push('revogadoEm deve ser uma data válida AAAA-MM-DD');
    else if (dataIsoValida(v.publicadoEm) && v.revogadoEm < v.publicadoEm) erros.push('revogadoEm não pode ser anterior a publicadoEm');
  } else if ('revogadoEm' in v) {
    erros.push('revogadoEm só é permitido em versão revogada: uma versão revogada não volta a ser usada');
  }
  if ('responsaveis' in v) erros.push(...validarResponsaveis(v.responsaveis, v.estado));
  return erros;
}

const entradaInvalida = (versao) => {
  const erros = validarVersao(versao);
  return erros.length ? falha('versao_invalida', erros) : null;
};

/** 1. Cria a primeira versão de um serviço, em rascunho. */
export function criarVersao({ id, servicoId, arquivos, criadoEm } = {}) {
  const versao = { id, servicoId, numero: 1, baseadaEm: null, estado: 'rascunho', arquivos: structuredCloneSeguro(arquivos), hashConteudo: null, criadoEm, enviadaEm: null };
  const erros = validarVersao(versao);
  return erros.length ? falha('dados_invalidos', erros) : { ok: true, versao };
}

/** Altera as referências do rascunho. Versões em validação ou posteriores estão congeladas. */
export function alterarArquivos(versao, arquivos) {
  const invalida = entradaInvalida(versao);
  if (invalida) return invalida;
  if (!conteudoEditavel(versao.estado)) return falha('versao_congelada');
  const erros = validarArquivos(arquivos);
  if (erros.length) return falha('dados_invalidos', erros);
  return { ok: true, versao: { ...versao, arquivos: structuredCloneSeguro(arquivos) } };
}

/** 2. Envia o rascunho para validação e calcula o hash do conteúdo. O conteúdo não é guardado na versão. */
export function enviarParaValidacao(versao, conteudo, enviadaEm) {
  const invalida = entradaInvalida(versao);
  if (invalida) return invalida;
  const t = verificarTransicao(versao.estado, 'em_validacao');
  if (!t.permitida) return falha(versao.estado === 'rascunho' ? t.motivo : 'versao_congelada');
  if (!dataIsoValida(enviadaEm)) return falha('data_invalida');
  if (enviadaEm < versao.criadoEm) return falha('data_anterior_a_criacao');
  if (!ehObjeto(conteudo) || Object.keys(conteudo).length === 0) return falha('conteudo_invalido');
  let hash;
  try {
    hash = hashConteudo(conteudo);
  } catch {
    return falha('conteudo_invalido');
  }
  return { ok: true, versao: { ...versao, estado: 'em_validacao', hashConteudo: hash, enviadaEm } };
}

/** Confere se o conteúdo atual ainda é o que foi enviado (mesmo hash). */
export function conteudoConfere(versao, conteudo) {
  if (!ehObjeto(versao) || typeof versao.hashConteudo !== 'string') return false;
  try {
    return hashConteudo(conteudo) === versao.hashConteudo;
  } catch {
    return false;
  }
}

/**
 * 10. Cria nova versão em rascunho a partir de uma versão que já recebeu decisão ou foi publicada.
 * `existentes` são todas as versões do serviço (para numerar e evitar id repetido); a anterior é preservada.
 * Não se cria nova versão a partir de rascunho nem de em_validacao (sem decisão).
 */
export function criarNovaVersao(anterior, { id, criadoEm, arquivos } = {}, existentes = [anterior]) {
  const invalida = entradaInvalida(anterior);
  if (invalida) return invalida;
  if (!ESTADOS_QUE_PERMITEM_NOVA_VERSAO.includes(anterior.estado)) {
    return falha(anterior.estado === 'em_validacao' ? 'validacao_em_andamento' : 'estado_nao_permite_nova_versao');
  }
  if (!Array.isArray(existentes) || !existentes.includes(anterior) && !existentes.some((e) => ehObjeto(e) && e.id === anterior.id)) {
    return falha('existentes_invalidas');
  }
  if (!existentes.every((e) => ehObjeto(e) && validarVersao(e).length === 0 && e.servicoId === anterior.servicoId)) {
    return falha('existentes_invalidas');
  }
  if (existentes.some((e) => e.id === id)) return falha('id_duplicado');
  const numero = Math.max(...existentes.map((e) => e.numero)) + 1;
  const nova = {
    id, servicoId: anterior.servicoId, numero, baseadaEm: anterior.id, estado: 'rascunho',
    arquivos: structuredCloneSeguro(arquivos === undefined ? anterior.arquivos : arquivos),
    hashConteudo: null, criadoEm, enviadaEm: null,
  };
  const erros = validarVersao(nova);
  if (erros.length) return falha('dados_invalidos', erros);
  if (criadoEm < anterior.criadoEm) return falha('data_anterior_a_versao_base');
  return { ok: true, versao: nova };
}

/** Cópia profunda sem lançar para entradas estranhas (devolve o próprio valor, que a validação recusará). */
export function structuredCloneSeguro(valor) {
  try {
    return structuredClone(valor);
  } catch {
    return valor;
  }
}

export { ESTADOS_VERSAO };
