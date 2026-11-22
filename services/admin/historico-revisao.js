// Histórico PRIVADO da revisão (Sprint 5, Passo 5B1). Só acréscimo, em arquivos .jsonl dentro de data/admin-private/ (fora do
// Git, do MCP, do assistente, do build e do dist/). Reaproveita o armazenamento seguro e os registros de decisoes.js.
//
//   data/admin-private/revisao/<servicoId>.jsonl    ações da revisão (revisar fonte, aceitar e rejeitar bloco, enviar, validar, ajustes, nova versão)
//   data/admin-private/decisoes/<servicoId>.jsonl   decisões materiais (registros de decisoes.js); o motivo dos ajustes só fica aqui
//   data/admin-private/temas/historico.jsonl        edições de tema (acao_tema)
//   data/admin-private/cadastros/historico.jsonl    cadastros de tema e serviço bem-sucedidos (acao_cadastro; Sprint 8, Passo 8C)
//   data/admin-private/negadas/historico.jsonl      gravações recusadas por perfil (acao_negada; Sprint 8, Passo 8C)
//
// Sprint 8, Passo 8C: toda gravação nova exige o ator real da sessão (um usuário selecionável de atores.js); não há ator padrão.
// A leitura continua aceitando o ator de demonstração e o formato antigo, para os registros gravados antes.
//
// Cada ação guarda SOMENTE: serviço, versão, hash, ação, data e hora, resultado ("ok" ou "negado") e o ator
// { usuarioId, perfil, setor } da lista fixa de atores.js (Sprint 7, Passo 7C). Nunca conteúdo, texto original, token, caminho
// local nem e-mail. Registros antigos, com o ator como texto ("Servidor de demonstração"), continuam válidos na leitura.
// O ator NÃO comprova identidade nem representa validação jurídica. Erros são códigos.

import fs from 'node:fs';
import { criarArmazenamento } from './armazenamento.js';
import { ATOR_LEGADO, validarAtor, validarAtorSelecionavel } from './atores.js';
import { ACOES } from './permissoes.js';
import { validarHistorico, validarRegistro } from './decisoes.js';

export const RESULTADOS = Object.freeze(['ok', 'negado']);
export const ACOES_REGISTRADAS = Object.freeze([
  'revisar_fonte', 'aceitar_bloco', 'rejeitar_bloco', 'reabrir_bloco', 'editar_fonte', 'excluir_fonte', 'editar_servico', 'editar_tema', 'importar_conteudo',
  'concluir_revisao', 'autorizar_publicacao', 'publicar', 'revogar', 'nova_versao',
  // Sprint 8, Passo 8D: envio, validação e pedido de ajustes substituem concluir_revisao (que só continua válido na LEITURA).
  'enviar_para_revisao', 'validar_materialmente', 'solicitar_ajustes',
  // Sprint 8, Passo 8C: os cadastros com versão também ficam auditados.
  'cadastrar_fonte', 'cadastrar_link', 'cadastrar_texto', 'cadastrar_informacao', 'editar_informacao', 'excluir_informacao',
]);
/** Ações aceitas só na leitura de registros antigos: nenhuma gravação nova pode usá-las (Sprint 8, Passo 8D). */
export const ACOES_SO_LEITURA = Object.freeze(['concluir_revisao']);
export const TIPO_ACAO_REVISAO = 'acao_revisao';
export const PASTA_PRIVADA = 'data/admin-private';

const CAMPOS_ACAO = ['id', 'tipo', 'servicoId', 'versaoId', 'hashConteudo', 'acao', 'dataHora', 'resultado', 'ator', 'itemId', 'itemTipo'];
const TIPOS_DE_ITEM = ['fonte', 'link', 'texto', 'servico', 'tema', 'descricao', 'etapas', 'requisitos', 'norma', 'bloco', 'documento', 'pergunta'];
const PADRAO_ID = /^[a-z][a-z0-9-]*$/;
const PADRAO_HASH = /^[0-9a-f]{64}$/;
const PADRAO_DATA_HORA = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;
const ehObjeto = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
/** Ator do registro: o formato novo (da lista fixa) ou o texto antigo do ator de demonstração. */
const atorAceito = (ator) => (typeof ator === 'string' ? ator === ATOR_LEGADO.responsavel : validarAtor(ator).length === 0);

/** Confere um registro de ação (lista de erros; vazia = válido). Não repete valores nas mensagens. */
export function validarAcaoRevisao(r) {
  if (!ehObjeto(r)) return ['registro deve ser um objeto'];
  const erros = [];
  for (const k of Object.keys(r)) if (!CAMPOS_ACAO.includes(k)) erros.push(`campo não previsto: ${k}`);
  for (const k of CAMPOS_ACAO) if (!(k in r)) erros.push(`campo obrigatório ausente: ${k}`);
  if (erros.length) return erros;
  if (typeof r.id !== 'string' || !PADRAO_ID.test(r.id)) erros.push('id inválido');
  if (r.tipo !== TIPO_ACAO_REVISAO) erros.push('tipo inválido');
  if (typeof r.servicoId !== 'string' || !PADRAO_ID.test(r.servicoId)) erros.push('servicoId inválido');
  if (typeof r.versaoId !== 'string' || !PADRAO_ID.test(r.versaoId)) erros.push('versaoId inválido');
  if (r.hashConteudo !== null && (typeof r.hashConteudo !== 'string' || !PADRAO_HASH.test(r.hashConteudo))) erros.push('hashConteudo inválido');
  if (!ACOES_REGISTRADAS.includes(r.acao)) erros.push('acao inválida');
  if (typeof r.dataHora !== 'string' || !PADRAO_DATA_HORA.test(r.dataHora) || Number.isNaN(Date.parse(r.dataHora))) erros.push('dataHora inválida');
  if (!RESULTADOS.includes(r.resultado)) erros.push('resultado inválido');
  if (!atorAceito(r.ator)) erros.push('ator inválido');
  // Só metadados mínimos do item (identificador interno e tipo); nunca título, URL, texto ou descrição.
  if (r.itemId !== null && (typeof r.itemId !== 'string' || !PADRAO_ID.test(r.itemId))) erros.push('itemId inválido');
  if (r.itemTipo !== null && !TIPOS_DE_ITEM.includes(r.itemTipo)) erros.push('itemTipo inválido');
  return erros;
}

// Ação sobre um tema (catálogo comum, sem serviço nem versão): só id interno do tema, tipo do item, ação, data e hora e ator. Nunca o nome.
export const TIPO_ACAO_TEMA = 'acao_tema';
const CAMPOS_ACAO_TEMA = ['id', 'tipo', 'acao', 'dataHora', 'resultado', 'ator', 'itemId', 'itemTipo'];

/** Confere um registro de ação sobre tema (lista de erros; vazia = válido). Não repete valores nas mensagens. */
export function validarAcaoTema(r) {
  if (!ehObjeto(r)) return ['registro deve ser um objeto'];
  const erros = [];
  for (const k of Object.keys(r)) if (!CAMPOS_ACAO_TEMA.includes(k)) erros.push(`campo não previsto: ${k}`);
  for (const k of CAMPOS_ACAO_TEMA) if (!(k in r)) erros.push(`campo obrigatório ausente: ${k}`);
  if (erros.length) return erros;
  if (typeof r.id !== 'string' || !PADRAO_ID.test(r.id)) erros.push('id inválido');
  if (r.tipo !== TIPO_ACAO_TEMA) erros.push('tipo inválido');
  if (r.acao !== 'editar_tema') erros.push('acao inválida');
  if (typeof r.dataHora !== 'string' || !PADRAO_DATA_HORA.test(r.dataHora) || Number.isNaN(Date.parse(r.dataHora))) erros.push('dataHora inválida');
  if (!RESULTADOS.includes(r.resultado)) erros.push('resultado inválido');
  if (!atorAceito(r.ator)) erros.push('ator inválido');
  if (typeof r.itemId !== 'string' || !PADRAO_ID.test(r.itemId)) erros.push('itemId inválido');
  if (r.itemTipo !== 'tema') erros.push('itemTipo inválido');
  return erros;
}

// Cadastro de tema ou serviço (Sprint 8, Passo 8C): só o id interno criado, o tipo, a ação, data e hora e o ator. Nunca o nome.
export const TIPO_ACAO_CADASTRO = 'acao_cadastro';
const CAMPOS_ACAO_CADASTRO = ['id', 'tipo', 'acao', 'dataHora', 'resultado', 'ator', 'itemId', 'itemTipo'];
const ITEM_DO_CADASTRO = Object.freeze({ cadastrar_tema: 'tema', cadastrar_servico: 'servico' });

/** Confere um registro de cadastro (lista de erros; vazia = válido). Não repete valores nas mensagens. */
export function validarAcaoCadastro(r) {
  if (!ehObjeto(r)) return ['registro deve ser um objeto'];
  const erros = [];
  for (const k of Object.keys(r)) if (!CAMPOS_ACAO_CADASTRO.includes(k)) erros.push(`campo não previsto: ${k}`);
  for (const k of CAMPOS_ACAO_CADASTRO) if (!(k in r)) erros.push(`campo obrigatório ausente: ${k}`);
  if (erros.length) return erros;
  if (typeof r.id !== 'string' || !PADRAO_ID.test(r.id)) erros.push('id inválido');
  if (r.tipo !== TIPO_ACAO_CADASTRO) erros.push('tipo inválido');
  if (!Object.hasOwn(ITEM_DO_CADASTRO, r.acao)) erros.push('acao inválida');
  if (typeof r.dataHora !== 'string' || !PADRAO_DATA_HORA.test(r.dataHora) || Number.isNaN(Date.parse(r.dataHora))) erros.push('dataHora inválida');
  if (r.resultado !== 'ok') erros.push('resultado inválido');
  if (validarAtorSelecionavel(r.ator).length > 0) erros.push('ator inválido');
  if (typeof r.itemId !== 'string' || !PADRAO_ID.test(r.itemId)) erros.push('itemId inválido');
  if (Object.hasOwn(ITEM_DO_CADASTRO, r.acao) && r.itemTipo !== ITEM_DO_CADASTRO[r.acao]) erros.push('itemTipo inválido');
  return erros;
}

// Gravação recusada por perfil (Sprint 8, Passo 8C): campos fechados. Sem versão, hash, corpo, título, URL nem nome.
export const TIPO_ACAO_NEGADA = 'acao_negada';
const CAMPOS_ACAO_NEGADA = ['id', 'tipo', 'acao', 'dataHora', 'resultado', 'motivo', 'ator', 'servicoId'];

/** Confere um registro de ação negada (lista de erros; vazia = válido). Não repete valores nas mensagens. */
export function validarAcaoNegada(r) {
  if (!ehObjeto(r)) return ['registro deve ser um objeto'];
  const erros = [];
  for (const k of Object.keys(r)) if (!CAMPOS_ACAO_NEGADA.includes(k)) erros.push(`campo não previsto: ${k}`);
  for (const k of CAMPOS_ACAO_NEGADA) if (!(k in r)) erros.push(`campo obrigatório ausente: ${k}`);
  if (erros.length) return erros;
  if (typeof r.id !== 'string' || !PADRAO_ID.test(r.id)) erros.push('id inválido');
  if (r.tipo !== TIPO_ACAO_NEGADA) erros.push('tipo inválido');
  if (!ACOES.includes(r.acao)) erros.push('acao inválida');
  if (typeof r.dataHora !== 'string' || !PADRAO_DATA_HORA.test(r.dataHora) || Number.isNaN(Date.parse(r.dataHora))) erros.push('dataHora inválida');
  if (r.resultado !== 'negado') erros.push('resultado inválido');
  if (r.motivo !== 'perfil_sem_permissao') erros.push('motivo inválido');
  if (validarAtorSelecionavel(r.ator).length > 0) erros.push('ator inválido');
  if (r.servicoId !== null && (typeof r.servicoId !== 'string' || !PADRAO_ID.test(r.servicoId))) erros.push('servicoId inválido');
  return erros;
}

const falha = (erro) => ({ ok: false, erro });
/** Ator de uma gravação nova: obrigatório e da lista de usuários selecionáveis (cópia, sem nome). */
function atorDaGravacao(ator) {
  if (ator === undefined || ator === null) return falha('ator_ausente');
  if (validarAtorSelecionavel(ator).length > 0) return falha('ator_invalido');
  return { ok: true, ator: { usuarioId: ator.usuarioId, perfil: ator.perfil, setor: ator.setor } };
}

/** Histórico privado da revisão sobre uma raiz de projeto (ou cópia temporária, nos testes). */
export function criarHistoricoRevisao({ raiz, sistema = fs, agora = () => new Date() } = {}) {
  const arm = criarArmazenamento({ raiz, sistema });
  const caminhoAcoes = (servicoId) => `${PASTA_PRIVADA}/revisao/${servicoId}.jsonl`;
  const caminhoDecisoes = (servicoId) => `${PASTA_PRIVADA}/decisoes/${servicoId}.jsonl`;
  const idValido = (v) => typeof v === 'string' && PADRAO_ID.test(v);

  function listarAcoes(servicoId) {
    if (arm.ok === false || !idValido(servicoId)) return falha('historico_indisponivel');
    const r = arm.listarJsonl(caminhoAcoes(servicoId));
    return r.ok ? { ok: true, registros: r.registros } : falha('historico_indisponivel');
  }

  /**
   * Acrescenta uma ação. `entrada`: { versaoId, hashConteudo|null, acao, itemId?, itemTipo?, ator, resultado? }.
   * O ator é obrigatório e precisa ser um usuário selecionável (Passo 8C); `resultado` é "ok" (padrão) ou "negado".
   */
  function registrarAcao(servicoId, { versaoId, hashConteudo = null, acao, itemId = null, itemTipo = null, ator, resultado = 'ok' }) {
    const quem = atorDaGravacao(ator);
    if (!quem.ok) return quem;
    if (!RESULTADOS.includes(resultado)) return falha('resultado_invalido');
    if (ACOES_SO_LEITURA.includes(acao)) return falha('acao_invalida');
    const existentes = listarAcoes(servicoId);
    if (!existentes.ok) return existentes;
    const registro = {
      id: `acao-${String(existentes.registros.length + 1).padStart(6, '0')}`,
      tipo: TIPO_ACAO_REVISAO,
      servicoId,
      versaoId,
      hashConteudo,
      acao,
      dataHora: agora().toISOString(),
      resultado,
      ator: quem.ator,
      itemId,
      itemTipo,
    };
    const r = arm.acrescentarJsonl(caminhoAcoes(servicoId), registro, (x) => validarAcaoRevisao(x));
    return r.ok ? { ok: true, registro } : falha('historico_indisponivel');
  }

  function listarDecisoes(servicoId) {
    if (arm.ok === false || !idValido(servicoId)) return falha('historico_indisponivel');
    const r = arm.listarJsonl(caminhoDecisoes(servicoId));
    if (!r.ok) return falha('historico_indisponivel');
    if (validarHistorico(r.registros).length > 0) return falha('historico_invalido');
    return { ok: true, registros: r.registros };
  }

  /** Acrescenta uma decisão material já validada por decisoes.js. */
  function registrarDecisao(servicoId, registro) {
    if (arm.ok === false || !idValido(servicoId)) return falha('historico_indisponivel');
    const r = arm.acrescentarJsonl(caminhoDecisoes(servicoId), registro, (x) => validarRegistro(x, { nova: true }));
    return r.ok ? { ok: true } : falha('historico_indisponivel');
  }

  const caminhoTemas = `${PASTA_PRIVADA}/temas/historico.jsonl`;
  /** Acrescenta a edição de um tema (só o id interno e o tipo; nunca o nome). O ator é obrigatório e selecionável (Passo 8C). */
  function registrarAcaoDeTema(temaId, { ator, resultado = 'ok' } = {}) {
    const quem = atorDaGravacao(ator);
    if (!quem.ok) return quem;
    if (!RESULTADOS.includes(resultado)) return falha('resultado_invalido');
    if (arm.ok === false || !idValido(temaId)) return falha('historico_indisponivel');
    const existentes = arm.listarJsonl(caminhoTemas);
    if (!existentes.ok) return falha('historico_indisponivel');
    const registro = {
      id: `acao-${String(existentes.registros.length + 1).padStart(6, '0')}`,
      tipo: TIPO_ACAO_TEMA,
      acao: 'editar_tema',
      dataHora: agora().toISOString(),
      resultado,
      ator: quem.ator,
      itemId: temaId,
      itemTipo: 'tema',
    };
    const r = arm.acrescentarJsonl(caminhoTemas, registro, (x) => validarAcaoTema(x));
    return r.ok ? { ok: true, registro } : falha('historico_indisponivel');
  }

  const caminhoCadastros = `${PASTA_PRIVADA}/cadastros/historico.jsonl`;
  /** Acrescenta o cadastro de um tema ou serviço (só o id interno e o tipo; nunca o nome). Chamado só na gravação real. */
  function registrarAcaoCadastro({ acao, itemId, ator } = {}) {
    const quem = atorDaGravacao(ator);
    if (!quem.ok) return quem;
    if (!Object.hasOwn(ITEM_DO_CADASTRO, acao) || !idValido(itemId)) return falha('registro_invalido');
    if (arm.ok === false) return falha('historico_indisponivel');
    const existentes = arm.listarJsonl(caminhoCadastros);
    if (!existentes.ok) return falha('historico_indisponivel');
    const registro = {
      id: `cadastro-${String(existentes.registros.length + 1).padStart(6, '0')}`,
      tipo: TIPO_ACAO_CADASTRO,
      acao,
      dataHora: agora().toISOString(),
      resultado: 'ok',
      ator: quem.ator,
      itemId,
      itemTipo: ITEM_DO_CADASTRO[acao],
    };
    const r = arm.acrescentarJsonl(caminhoCadastros, registro, (x) => validarAcaoCadastro(x));
    return r.ok ? { ok: true, registro } : falha('historico_indisponivel');
  }

  const caminhoNegadas = `${PASTA_PRIVADA}/negadas/historico.jsonl`;
  /** Acrescenta uma gravação recusada por perfil. `servicoId` é o da rota ou null. Nunca corpo, título, URL nem nome. */
  function registrarAcaoNegada({ acao, ator, servicoId = null } = {}) {
    const quem = atorDaGravacao(ator);
    if (!quem.ok) return quem;
    if (!ACOES.includes(acao) || (servicoId !== null && !idValido(servicoId))) return falha('registro_invalido');
    if (arm.ok === false) return falha('historico_indisponivel');
    const existentes = arm.listarJsonl(caminhoNegadas);
    if (!existentes.ok) return falha('historico_indisponivel');
    const registro = {
      id: `negada-${String(existentes.registros.length + 1).padStart(6, '0')}`,
      tipo: TIPO_ACAO_NEGADA,
      acao,
      dataHora: agora().toISOString(),
      resultado: 'negado',
      motivo: 'perfil_sem_permissao',
      ator: quem.ator,
      servicoId,
    };
    const r = arm.acrescentarJsonl(caminhoNegadas, registro, (x) => validarAcaoNegada(x));
    return r.ok ? { ok: true, registro } : falha('historico_indisponivel');
  }

  return {
    listarAcoes, registrarAcao, registrarAcaoDeTema, caminhoTemas, listarDecisoes, registrarDecisao, caminhoAcoes, caminhoDecisoes,
    registrarAcaoCadastro, caminhoCadastros, registrarAcaoNegada, caminhoNegadas,
  };
}
