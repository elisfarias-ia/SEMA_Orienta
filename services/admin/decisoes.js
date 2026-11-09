// Decisões de validação material e autorização de publicação (Marco 7, Passo 7B).
// Funções puras: ids e datas vêm de fora; nada é lido, gravado ou modificado (devolvem cópias novas).
//
// O histórico é uma lista em que só se ACRESCENTA: decisões anteriores nunca são editadas, apagadas nem reordenadas.
// Cada registro prova qual versão e qual conteúdo (hash) foram decididos. `responsavel` e `unidade` são identificadores
// de registro, sem valor de comprovação de identidade. Nenhuma decisão real foi registrada; decisões com identificação
// pessoal ficam fora do Git.

import { verificarTransicao } from './fluxo.js';
import { dataIsoValida, falha, idValido, structuredCloneSeguro, validarVersao } from './versao.js';

export const DECISOES_MATERIAIS = Object.freeze(['ajustes_solicitados', 'validado_materialmente']);
export const TIPO_DECISAO_MATERIAL = 'decisao_material';
export const TIPO_AUTORIZACAO = 'autorizacao_publicacao';

const PADRAO_HASH = /^[0-9a-f]{64}$/;
const PADRAO_EMAIL = /[\w.+-]+@[\w-]+(\.[\w-]+)+/;
const ehObjeto = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const textoPreenchido = (v) => typeof v === 'string' && v.trim() !== '';

const CAMPOS_COMUNS = ['id', 'versaoId', 'hashConteudo', 'responsavel', 'unidade', 'data', 'observacao', 'tipo'];

function validarComuns(r) {
  const erros = [];
  if (!idValido(r.id)) erros.push('id inválido');
  if (!idValido(r.versaoId)) erros.push('versaoId inválido');
  if (typeof r.hashConteudo !== 'string' || !PADRAO_HASH.test(r.hashConteudo)) erros.push('hashConteudo (SHA-256) inválido');
  for (const campo of ['responsavel', 'unidade']) {
    if (!textoPreenchido(r[campo])) erros.push(`${campo} obrigatório`);
    else if (r[campo].length > 80 || PADRAO_EMAIL.test(r[campo])) erros.push(`${campo} deve ser um identificador curto, sem e-mail`);
  }
  if (!dataIsoValida(r.data)) erros.push('data deve ser uma data válida AAAA-MM-DD');
  if (r.observacao !== null && typeof r.observacao !== 'string') erros.push('observacao deve ser texto ou null');
  return erros;
}

function camposInesperados(r, esperados) {
  return [
    ...Object.keys(r).filter((k) => !esperados.includes(k)).map((k) => `campo não previsto: ${k}`),
    ...esperados.filter((k) => !(k in r)).map((k) => `campo obrigatório ausente: ${k}`),
  ];
}

/** Confere um registro do histórico (decisão material ou autorização). Retorna a lista de erros. */
export function validarRegistro(r) {
  if (!ehObjeto(r)) return ['registro deve ser um objeto'];
  if (r.tipo === TIPO_DECISAO_MATERIAL) {
    const erros = camposInesperados(r, [...CAMPOS_COMUNS, 'decisao']);
    if (erros.length) return erros;
    erros.push(...validarComuns(r));
    if (!DECISOES_MATERIAIS.includes(r.decisao)) erros.push('decisao deve ser ajustes_solicitados ou validado_materialmente');
    if (r.decisao === 'ajustes_solicitados' && !textoPreenchido(r.observacao)) erros.push('observacao obrigatória em ajustes_solicitados');
    return erros;
  }
  if (r.tipo === TIPO_AUTORIZACAO) {
    const erros = camposInesperados(r, CAMPOS_COMUNS);
    if (erros.length) return erros;
    return validarComuns(r);
  }
  return ['tipo deve ser decisao_material ou autorizacao_publicacao'];
}

/** Confere o histórico inteiro: lista de registros válidos, ids únicos e datas sem retrocesso. */
export function validarHistorico(historico) {
  if (!Array.isArray(historico)) return ['historico deve ser uma lista'];
  const erros = [];
  const ids = new Set();
  historico.forEach((r, i) => {
    erros.push(...validarRegistro(r).map((e) => `historico[${i}]: ${e}`));
    if (ehObjeto(r) && typeof r.id === 'string') {
      if (ids.has(r.id)) erros.push(`historico[${i}]: id duplicado "${r.id}"`);
      ids.add(r.id);
    }
    const anterior = historico[i - 1];
    if (i > 0 && ehObjeto(r) && ehObjeto(anterior) && dataIsoValida(r.data) && dataIsoValida(anterior.data) && r.data < anterior.data) {
      erros.push(`historico[${i}]: data anterior à do registro anterior`);
    }
  });
  return erros;
}

function verificarEntrada(versao, historico) {
  const versaoErros = validarVersao(versao);
  if (versaoErros.length) return falha('versao_invalida', versaoErros);
  const historicoErros = validarHistorico(historico);
  if (historicoErros.length) return falha('historico_invalido', historicoErros);
  return null;
}

/** Acrescenta o registro ao final, sem tocar nos anteriores. O registro e a lista devolvidos são cópias novas. */
function acrescentar(historico, registro) {
  return [...historico.map(structuredCloneSeguro), structuredCloneSeguro(registro)];
}

/** Verifica versaoId, hash, id duplicado e ordem cronológica de um novo registro contra a versão e o histórico. */
function conferirRegistro(versao, historico, r) {
  if (r.versaoId !== versao.id) return falha('versao_divergente');
  if (r.hashConteudo !== versao.hashConteudo) return falha('hash_divergente');
  if (historico.some((h) => h.id === r.id)) return falha('id_duplicado');
  if (r.data < versao.enviadaEm) return falha('data_anterior_ao_envio');
  const ultimo = historico[historico.length - 1];
  if (ultimo && r.data < ultimo.data) return falha('data_anterior_ao_historico');
  return null;
}

/**
 * 3 a 7. Registra a decisão de validação material de uma versão em validação:
 * `ajustes_solicitados` (observação obrigatória) ou `validado_materialmente`.
 * Recusa versaoId ou hash divergente e id de decisão duplicado.
 */
export function registrarDecisaoMaterial(versao, historico, entrada) {
  const problema = verificarEntrada(versao, historico);
  if (problema) return problema;
  if (versao.estado !== 'em_validacao') return falha('versao_nao_esta_em_validacao');
  if (!ehObjeto(entrada)) return falha('decisao_invalida', ['entrada deve ser um objeto']);
  const registro = { observacao: null, ...structuredCloneSeguro(entrada), tipo: TIPO_DECISAO_MATERIAL };
  const erros = validarRegistro(registro);
  if (erros.length) return falha('decisao_invalida', erros);
  const divergencia = conferirRegistro(versao, historico, registro);
  if (divergencia) return divergencia;
  const t = verificarTransicao(versao.estado, registro.decisao);
  if (!t.permitida) return falha(t.motivo);
  return { ok: true, versao: { ...versao, estado: registro.decisao }, historico: acrescentar(historico, registro), registro };
}

const temDecisaoValidada = (historico, versao) =>
  historico.some((h) => h.tipo === TIPO_DECISAO_MATERIAL && h.decisao === 'validado_materialmente' && h.versaoId === versao.id && h.hashConteudo === versao.hashConteudo);
const temAutorizacao = (historico, versao) =>
  historico.some((h) => h.tipo === TIPO_AUTORIZACAO && h.versaoId === versao.id && h.hashConteudo === versao.hashConteudo);

/** 8. Autoriza a publicação, somente depois da validação material do mesmo hash. É uma decisão separada da validação. */
export function autorizarPublicacao(versao, historico, entrada) {
  const problema = verificarEntrada(versao, historico);
  if (problema) return problema;
  if (versao.estado !== 'validado_materialmente') return falha('versao_nao_validada_materialmente');
  if (!ehObjeto(entrada)) return falha('autorizacao_invalida', ['entrada deve ser um objeto']);
  const registro = { observacao: null, ...structuredCloneSeguro(entrada), tipo: TIPO_AUTORIZACAO };
  const erros = validarRegistro(registro);
  if (erros.length) return falha('autorizacao_invalida', erros);
  const divergencia = conferirRegistro(versao, historico, registro);
  if (divergencia) return divergencia;
  if (!temDecisaoValidada(historico, versao)) return falha('sem_validacao_material_do_mesmo_hash');
  const t = verificarTransicao(versao.estado, 'autorizado_publicacao');
  if (!t.permitida) return falha(t.motivo);
  return { ok: true, versao: { ...versao, estado: 'autorizado_publicacao' }, historico: acrescentar(historico, registro), registro };
}

/** 9. Publica somente depois da autorização do mesmo hash (e da validação material que a precede). */
export function publicarVersao(versao, historico) {
  const problema = verificarEntrada(versao, historico);
  if (problema) return problema;
  if (versao.estado !== 'autorizado_publicacao') return falha('versao_nao_autorizada');
  if (!temDecisaoValidada(historico, versao)) return falha('sem_validacao_material_do_mesmo_hash');
  if (!temAutorizacao(historico, versao)) return falha('sem_autorizacao_do_mesmo_hash');
  const t = verificarTransicao(versao.estado, 'publicado');
  if (!t.permitida) return falha(t.motivo);
  return { ok: true, versao: { ...versao, estado: 'publicado' }, historico: historico.map(structuredCloneSeguro) };
}
