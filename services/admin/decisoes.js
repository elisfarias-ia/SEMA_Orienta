// Decisões de validação material e autorização de publicação (Marco 7, Passo 7B) e revogação (Sprint 7, Passo 7A).
// Funções puras: ids e datas vêm de fora; nada é lido, gravado ou modificado (devolvem cópias novas).
//
// O histórico é uma lista em que só se ACRESCENTA: decisões anteriores nunca são editadas, apagadas nem reordenadas.
// Cada registro prova qual versão e qual conteúdo (hash) foram decididos. `responsavel` e `unidade` são identificadores
// de registro, sem valor de comprovação de identidade. Nenhuma decisão real foi registrada; decisões com identificação
// pessoal ficam fora do Git.

import { validarAtor } from './atores.js';
import { contemDadoSensivel, PADRAO_CPF } from './cadastro.js';
import { verificarTransicao } from './fluxo.js';
import { dataIsoValida, falha, idValido, structuredCloneSeguro, validarVersao } from './versao.js';

export const DECISOES_MATERIAIS = Object.freeze(['ajustes_solicitados', 'validado_materialmente']);
export const TIPO_DECISAO_MATERIAL = 'decisao_material';
export const TIPO_AUTORIZACAO = 'autorizacao_publicacao';
export const TIPO_REVOGACAO = 'revogacao';
export const LIMITE_MOTIVO = 500;

const PADRAO_HASH = /^[0-9a-f]{64}$/;
const PADRAO_EMAIL = /[\w.+-]+@[\w-]+(\.[\w-]+)+/;
const ehObjeto = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const textoPreenchido = (v) => typeof v === 'string' && v.trim() !== '';

// Quem decidiu (Sprint 7, Passo 7C): novas gravações usam `ator` { usuarioId, perfil, setor }, da lista fixa de atores.js.
// O formato anterior (`responsavel` e `unidade`, identificadores curtos) continua aceito, para os registros antigos.
const CAMPOS_BASE = ['id', 'versaoId', 'hashConteudo', 'data', 'observacao', 'tipo'];
const camposDoAtor = (r) => ('ator' in r ? ['ator'] : ['responsavel', 'unidade']);
const camposComuns = (r) => [...CAMPOS_BASE, ...camposDoAtor(r)];

function validarComuns(r) {
  const erros = [];
  if (!idValido(r.id)) erros.push('id inválido');
  if (!idValido(r.versaoId)) erros.push('versaoId inválido');
  if (typeof r.hashConteudo !== 'string' || !PADRAO_HASH.test(r.hashConteudo)) erros.push('hashConteudo (SHA-256) inválido');
  if ('ator' in r) {
    erros.push(...validarAtor(r.ator));
  } else {
    for (const campo of ['responsavel', 'unidade']) {
      if (!textoPreenchido(r[campo])) erros.push(`${campo} obrigatório`);
      else if (r[campo].length > 80 || PADRAO_EMAIL.test(r[campo])) erros.push(`${campo} deve ser um identificador curto, sem e-mail`);
    }
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

// Sprint 8, Passo 8C: decisão material, autorização e revogação são do Revisor. Na GRAVAÇÃO de um registro novo ({ nova: true }),
// um ator com perfil de Cadastrante é recusado. A leitura do histórico (validarHistorico) não usa a opção: registros antigos continuam legíveis.
const ERRO_CADASTRANTE = 'ator com perfil cadastrante não pode registrar esta decisão';
const atorCadastrante = (r) => ehObjeto(r.ator) && r.ator.perfil === 'cadastrante';

/** Confere um registro do histórico (decisão material, autorização ou revogação). Retorna a lista de erros. */
export function validarRegistro(r, { nova = false } = {}) {
  if (!ehObjeto(r)) return ['registro deve ser um objeto'];
  const erros = validarRegistroLido(r);
  if (erros.length === 0 && nova === true && atorCadastrante(r)) return [ERRO_CADASTRANTE];
  return erros;
}

function validarRegistroLido(r) {
  if (r.tipo === TIPO_DECISAO_MATERIAL) {
    const erros = camposInesperados(r, [...camposComuns(r), 'decisao']);
    if (erros.length) return erros;
    erros.push(...validarComuns(r));
    if (!DECISOES_MATERIAIS.includes(r.decisao)) erros.push('decisao deve ser ajustes_solicitados ou validado_materialmente');
    if (r.decisao === 'ajustes_solicitados' && !textoPreenchido(r.observacao)) erros.push('observacao obrigatória em ajustes_solicitados');
    return erros;
  }
  if (r.tipo === TIPO_AUTORIZACAO) {
    const erros = camposInesperados(r, camposComuns(r));
    if (erros.length) return erros;
    return validarComuns(r);
  }
  if (r.tipo === TIPO_REVOGACAO) {
    // Revogação (Sprint 7, Passo 7A): motivo obrigatório, curto e sem e-mail. Não exige autorização de publicação.
    // Na gravação nova, revogarVersao recusa também telefone, CPF e credencial; aqui (também usado na leitura do
    // histórico) só o e-mail é recusado, para que registros antigos continuem legíveis.
    const erros = camposInesperados(r, [...camposComuns(r), 'motivo']);
    if (erros.length) return erros;
    erros.push(...validarComuns(r));
    if (!textoPreenchido(r.motivo)) erros.push('motivo obrigatório na revogação');
    else if (r.motivo.length > LIMITE_MOTIVO || PADRAO_EMAIL.test(r.motivo)) erros.push(`motivo deve ter até ${LIMITE_MOTIVO} caracteres, sem e-mail`);
    return erros;
  }
  return ['tipo deve ser decisao_material, autorizacao_publicacao ou revogacao'];
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
  const erros = validarRegistro(registro, { nova: true });
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
  const erros = validarRegistro(registro, { nova: true });
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

/**
 * 10. Revoga a versão publicada inteira (Sprint 7, Passo 7A): `publicado` -> `revogado`, com motivo obrigatório.
 * Não exige autorização (reduz a exposição), mas confere versão, hash, id único e datas (não antes da publicação nem do
 * histórico). A versão revogada guarda `publicadoEm` e ganha `revogadoEm` = data da decisão; ela nunca volta a publicado.
 */
export function revogarVersao(versao, historico, entrada) {
  const problema = verificarEntrada(versao, historico);
  if (problema) return problema;
  if (versao.estado !== 'publicado') return falha('versao_nao_publicada');
  if (!ehObjeto(entrada)) return falha('revogacao_invalida', ['entrada deve ser um objeto']);
  const registro = { observacao: null, ...structuredCloneSeguro(entrada), tipo: TIPO_REVOGACAO };
  const erros = validarRegistro(registro, { nova: true });
  if (erros.length) return falha('revogacao_invalida', erros);
  if (contemDadoSensivel(registro.motivo) || PADRAO_CPF.test(registro.motivo)) {
    return falha('revogacao_invalida', ['motivo não pode conter e-mail, telefone, CPF ou credencial']);
  }
  const divergencia = conferirRegistro(versao, historico, registro);
  if (divergencia) return divergencia;
  if (dataIsoValida(versao.publicadoEm) && registro.data < versao.publicadoEm) return falha('data_anterior_a_publicacao');
  const t = verificarTransicao(versao.estado, 'revogado');
  if (!t.permitida) return falha(t.motivo);
  const revogada = { ...versao, estado: 'revogado', revogadoEm: registro.data };
  const versaoErros = validarVersao(revogada);
  if (versaoErros.length) return falha('versao_invalida', versaoErros);
  return { ok: true, versao: revogada, historico: acrescentar(historico, registro), registro };
}
