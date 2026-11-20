// Histórico PRIVADO da revisão (Sprint 5, Passo 5B1). Só acréscimo, em arquivos .jsonl dentro de data/admin-private/ (fora do
// Git, do MCP, do assistente, do build e do dist/). Reaproveita o armazenamento seguro e os registros de decisoes.js.
//
//   data/admin-private/revisao/<servicoId>.jsonl    ações da revisão (revisar fonte, aceitar e rejeitar bloco, concluir, nova versão)
//   data/admin-private/decisoes/<servicoId>.jsonl   decisões materiais (registros de decisoes.js)
//
// Cada ação guarda SOMENTE: serviço, versão, hash, ação, data e hora, resultado e o ator fixo de demonstração. Nunca conteúdo,
// texto original, token, caminho local, e-mail nem nome pessoal. O ator "Servidor de demonstração" NÃO comprova identidade
// nem representa validação jurídica. Erros são códigos.

import fs from 'node:fs';
import { criarArmazenamento } from './armazenamento.js';
import { validarHistorico, validarRegistro } from './decisoes.js';

export const ATOR_DEMONSTRACAO = Object.freeze({ responsavel: 'Servidor de demonstração', unidade: 'Ambiente local de demonstração' });
export const ACOES_REGISTRADAS = Object.freeze(['revisar_fonte', 'aceitar_bloco', 'rejeitar_bloco', 'reabrir_bloco', 'editar_fonte', 'excluir_fonte', 'editar_servico', 'editar_tema', 'importar_conteudo', 'concluir_revisao', 'autorizar_publicacao', 'publicar', 'revogar', 'nova_versao']);
export const TIPO_ACAO_REVISAO = 'acao_revisao';
export const PASTA_PRIVADA = 'data/admin-private';

const CAMPOS_ACAO = ['id', 'tipo', 'servicoId', 'versaoId', 'hashConteudo', 'acao', 'dataHora', 'resultado', 'ator', 'itemId', 'itemTipo'];
const TIPOS_DE_ITEM = ['fonte', 'link', 'texto', 'servico', 'tema', 'descricao', 'etapas', 'requisitos', 'norma', 'bloco', 'documento', 'pergunta'];
const PADRAO_ID = /^[a-z][a-z0-9-]*$/;
const PADRAO_HASH = /^[0-9a-f]{64}$/;
const PADRAO_DATA_HORA = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;
const ehObjeto = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

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
  if (r.resultado !== 'ok') erros.push('resultado inválido');
  if (r.ator !== ATOR_DEMONSTRACAO.responsavel) erros.push('ator inválido');
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
  if (r.resultado !== 'ok') erros.push('resultado inválido');
  if (r.ator !== ATOR_DEMONSTRACAO.responsavel) erros.push('ator inválido');
  if (typeof r.itemId !== 'string' || !PADRAO_ID.test(r.itemId)) erros.push('itemId inválido');
  if (r.itemTipo !== 'tema') erros.push('itemTipo inválido');
  return erros;
}

const falha = (erro) => ({ ok: false, erro });

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

  /** Acrescenta uma ação concluída com sucesso. `entrada`: { versaoId, hashConteudo|null, acao }. */
  function registrarAcao(servicoId, { versaoId, hashConteudo = null, acao, itemId = null, itemTipo = null }) {
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
      resultado: 'ok',
      ator: ATOR_DEMONSTRACAO.responsavel,
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
    const r = arm.acrescentarJsonl(caminhoDecisoes(servicoId), registro, (x) => validarRegistro(x));
    return r.ok ? { ok: true } : falha('historico_indisponivel');
  }

  const caminhoTemas = `${PASTA_PRIVADA}/temas/historico.jsonl`;
  /** Acrescenta a edição de um tema (só o id interno e o tipo; nunca o nome). */
  function registrarAcaoDeTema(temaId) {
    if (arm.ok === false || !idValido(temaId)) return falha('historico_indisponivel');
    const existentes = arm.listarJsonl(caminhoTemas);
    if (!existentes.ok) return falha('historico_indisponivel');
    const registro = {
      id: `acao-${String(existentes.registros.length + 1).padStart(6, '0')}`,
      tipo: TIPO_ACAO_TEMA,
      acao: 'editar_tema',
      dataHora: agora().toISOString(),
      resultado: 'ok',
      ator: ATOR_DEMONSTRACAO.responsavel,
      itemId: temaId,
      itemTipo: 'tema',
    };
    const r = arm.acrescentarJsonl(caminhoTemas, registro, (x) => validarAcaoTema(x));
    return r.ok ? { ok: true, registro } : falha('historico_indisponivel');
  }

  return { listarAcoes, registrarAcao, registrarAcaoDeTema, caminhoTemas, listarDecisoes, registrarDecisao, caminhoAcoes, caminhoDecisoes };
}
