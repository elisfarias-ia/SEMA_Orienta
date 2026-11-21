// Edição de TEMA e de SERVIÇO existentes (Sprint 5, Passo 5B3b). Regras PURAS (sem arquivos, relógio nem aleatoriedade; a data vem de
// fora e nada recebido é modificado) e a orquestração da edição de tema (o serviço é orquestrado em revisao-servico.js).
//
// TEMA: só o nome muda (o id é fixo e nunca é aceito do cliente no corpo). O nome vive em services/assuntos.json (catálogo comum a
// vários serviços), gravado de forma atômica. A edição exige confirmação explícita depois de mostrar quais serviços usam o tema.
// Nome repetido (sem acento nem maiúscula) é recusado. O campo "categoria" dos serviços NÃO é reescrito: é um rótulo copiado na criação
// do serviço e mexer nele em versões já concluídas quebraria o hash delas.
//
// SERVIÇO (somente a versão atual em elaboração): só o nome e o tema relacionado. O id é fixo. Mover para outro tema muda o assuntoId
// no registro e no service.json (os dois precisam continuar iguais) e a categoria do service.json. Critério CONSERVADOR de reabertura:
// qualquer alteração de nome ou de tema devolve a "Em elaboração" TODAS as informações já aceitas, porque o texto aceito pode citar o
// nome ou o enquadramento do serviço e a revisão humana precisa conferir de novo. Nunca publica. O roteiro e os termos equivalentes não
// são reescritos (podem ter sido editados por pessoas).
//
// Resultado: { ok: true, ... } ou { ok: false, erro } (códigos; nunca o conteúdo digitado).

import { baseDoId, contemCredencial, normalizarNome, PADRAO_ID, textoLivre } from './cadastro.js';
import { hashConteudo } from './hash.js';
import { criarArmazenamento } from './armazenamento.js';
import { resolverAtorDeGravacao } from './atores.js';
import { criarHistoricoRevisao } from './historico-revisao.js';
import { executarTransacao } from './transacao.js';
import { dataIsoValida, falha } from './versao.js';
import { localizarVersaoAtual } from '../versao-atual.js';
import { validarAssuntos, validarServicos } from '../../scripts/validate-services.js';
import fs from 'node:fs';

const ehObjeto = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const PADRAO_REVISAO = /^[0-9a-f]{64}$/;
const LIMITE_NOME = 120;
const LIMITE_ID = 60;
const idValido = (v) => typeof v === 'string' && v.length <= LIMITE_ID && PADRAO_ID.test(v);
const dataLocal = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export const temaIdValido = idValido;

/** Nome aceitável: texto livre sem dado sensível, com letras ou números e sem credencial. Retorna o nome aparado ou null. */
function nomeAceitavel(valor) {
  const nome = textoLivre(valor, LIMITE_NOME);
  return nome !== null && baseDoId(nome) !== null && !contemCredencial(nome) ? nome : null;
}

/** Corpo do PATCH do tema: SÓ revisao, nome e confirmado (true). O id vem da rota. Retorna { ok, dados } ou { ok: false, campos }. */
export function validarCorpoEdicaoTema(corpo) {
  if (!ehObjeto(corpo)) return { ok: false, campos: ['corpo'] };
  const campos = [];
  if (Object.keys(corpo).some((k) => !['revisao', 'nome', 'confirmado'].includes(k))) campos.push('extras');
  if (typeof corpo.revisao !== 'string' || !PADRAO_REVISAO.test(corpo.revisao)) campos.push('revisao');
  const nome = nomeAceitavel(corpo.nome);
  if (nome === null) campos.push('nome');
  if (corpo.confirmado !== true) campos.push('confirmacao');
  return campos.length ? { ok: false, campos } : { ok: true, dados: { revisao: corpo.revisao, nome } };
}

/** Corpo do PATCH do serviço: revisao e, ao menos, nome ou temaId; `confirmado` opcional (booleano). O id vem da rota. */
export function validarCorpoEdicaoServico(corpo) {
  if (!ehObjeto(corpo)) return { ok: false, campos: ['corpo'] };
  const campos = [];
  if (Object.keys(corpo).some((k) => !['revisao', 'nome', 'temaId', 'confirmado'].includes(k))) campos.push('extras');
  if (typeof corpo.revisao !== 'string' || !PADRAO_REVISAO.test(corpo.revisao)) campos.push('revisao');
  const dados = { revisao: corpo.revisao, confirmado: false };
  if (corpo.nome === undefined && corpo.temaId === undefined) campos.push('nada_a_alterar');
  if (corpo.nome !== undefined) {
    const nome = nomeAceitavel(corpo.nome);
    if (nome === null) campos.push('nome'); else dados.nome = nome;
  }
  if (corpo.temaId !== undefined) {
    if (!idValido(corpo.temaId)) campos.push('tema'); else dados.temaId = corpo.temaId;
  }
  if (corpo.confirmado !== undefined) {
    if (typeof corpo.confirmado !== 'boolean') campos.push('confirmacao'); else dados.confirmado = corpo.confirmado;
  }
  return campos.length ? { ok: false, campos: [...new Set(campos)] } : { ok: true, dados };
}

/** Novo documento do catálogo com o nome do tema alterado (id e demais campos intactos). */
export function editarTemaNoCatalogo(documento, temaId, nome, data) {
  if (!ehObjeto(documento) || !Array.isArray(documento.assuntos) || !idValido(temaId) || !dataIsoValida(data)) return falha('dados_invalidos');
  const alvo = documento.assuntos.find((a) => ehObjeto(a) && a.id === temaId);
  if (!alvo) return falha('tema_nao_encontrado');
  const limpo = nomeAceitavel(nome);
  if (limpo === null) return falha('dados_invalidos');
  if (documento.assuntos.some((a) => ehObjeto(a) && a.id !== temaId && normalizarNome(a.nome) === normalizarNome(limpo))) return falha('nome_duplicado');
  if (alvo.nome === limpo) return falha('nada_a_alterar');
  const atualizadoEm = dataIsoValida(alvo.criadoEm) && data < alvo.criadoEm ? alvo.criadoEm : data;
  const novo = structuredClone(documento);
  novo.assuntos = novo.assuntos.map((a) => (ehObjeto(a) && a.id === temaId ? { ...a, nome: limpo, atualizadoEm } : a));
  return { ok: true, assuntos: novo };
}

/** Títulos das informações (blocos de conhecimento) já aceitas: as que voltam a "Em elaboração" quando o nome ou o tema do serviço muda. */
export function informacoesAceitas(conteudoAssistente) {
  const blocos = ehObjeto(conteudoAssistente) && Array.isArray(conteudoAssistente.blocos) ? conteudoAssistente.blocos : [];
  return blocos.filter((b) => ehObjeto(b) && b.tipo === 'conhecimento' && b.statusValidacao === 'validado').map((b) => String(b.titulo));
}

/** Reabre (rascunho, revisão pendente, não publicado) todas as informações aceitas. Retorna { doc, titulos }. */
function reabrirInformacoesAceitas(conteudoAssistente, data) {
  const doc = structuredClone(conteudoAssistente);
  const titulos = [];
  doc.blocos = (Array.isArray(doc.blocos) ? doc.blocos : []).map((b) => {
    if (!ehObjeto(b) || b.tipo !== 'conhecimento' || b.statusValidacao !== 'validado') return b;
    titulos.push(String(b.titulo));
    const atualizadoEm = dataIsoValida(b.criadoEm) && data < b.criadoEm ? b.criadoEm : data;
    return { ...b, statusValidacao: 'rascunho', revisaoAtualidade: 'pendente', publicado: false, atualizadoEm };
  });
  return { doc, titulos };
}

/**
 * Edição do serviço (PURA). `contexto`: { service, conteudoAssistente, entradaRegistro, assuntos (documento), nomesOutros: [nomes dos outros serviços] }.
 * `pedido`: { nome?, temaId? }. Retorna { ok: true, service, conteudoAssistente, entradaRegistro?, blocosReabertos: [títulos], temaMudou, nomeMudou }.
 */
export function editarServicoPuro(contexto, pedido, data) {
  if (!dataIsoValida(data) || !ehObjeto(contexto) || !ehObjeto(pedido) || !ehObjeto(contexto.service)) return falha('dados_invalidos');
  const nomeNovo = pedido.nome === undefined ? contexto.service.nome : nomeAceitavel(pedido.nome);
  if (nomeNovo === null) return falha('dados_invalidos');
  if (pedido.nome !== undefined && (contexto.nomesOutros ?? []).some((n) => normalizarNome(n) === normalizarNome(nomeNovo))) return falha('nome_duplicado');
  let temaNovo = null;
  if (pedido.temaId !== undefined) {
    temaNovo = (Array.isArray(contexto.assuntos?.assuntos) ? contexto.assuntos.assuntos : []).find((a) => ehObjeto(a) && a.id === pedido.temaId);
    if (!temaNovo || temaNovo.ativo !== true) return falha('tema_invalido');
  }
  const temaMudou = temaNovo !== null && temaNovo.id !== contexto.service.assuntoId;
  const nomeMudou = nomeNovo !== contexto.service.nome;
  if (!temaMudou && !nomeMudou) return falha('nada_a_alterar');

  const service = { ...contexto.service, nome: nomeNovo };
  const resultado = { ok: true, service, temaMudou, nomeMudou };
  if (temaMudou) {
    service.assuntoId = temaNovo.id;
    service.categoria = temaNovo.nome.toLowerCase();
    resultado.entradaRegistro = { ...contexto.entradaRegistro, assuntoId: temaNovo.id };
  }
  const reaberto = reabrirInformacoesAceitas(contexto.conteudoAssistente, data);
  resultado.conteudoAssistente = reaberto.doc;
  resultado.blocosReabertos = reaberto.titulos;
  return resultado;
}

/** Verdadeiro se a edição do serviço exige confirmação explícita: mudança de tema ou informações aceitas que voltam para elaboração. */
export const edicaoDoServicoExigeConfirmacao = (temaMudou, qtdAceitas) => temaMudou === true || qtdAceitas > 0;

/** Ator-nome do serviço atual (versão atual), ou null. Só leitura. */
export function nomeDoServicoNoDisco(arm, raiz, servicoId) {
  const v = localizarVersaoAtual(raiz, servicoId);
  if (!v.ok) return null;
  const r = arm.lerJson(v.arquivos.service);
  return r.ok && ehObjeto(r.dados) && typeof r.dados.nome === 'string' ? r.dados.nome : null;
}

/** Edição de tema com leitura, revisão otimista, transação (desfazer) e histórico privado. Sem rotas. */
export function criarEdicaoTema({ raiz, sistema = fs, agora = () => new Date(), verificarFinal = (r) => validarServicos(r).erros } = {}) {
  const arm = criarArmazenamento({ raiz, sistema });
  const historico = criarHistoricoRevisao({ raiz, sistema, agora });

  /** Catálogo, serviços que usam o tema (nomes) e a revisão (hash do catálogo mais os serviços afetados). */
  function carregar(temaId) {
    if (arm.ok === false) return falha('raiz_invalida');
    if (!idValido(temaId)) return falha('tema_nao_encontrado');
    const assuntos = arm.lerJson('services/assuntos.json');
    const registro = arm.lerJson('services/registry.json');
    if (!assuntos.ok || !registro.ok || !Array.isArray(assuntos.dados.assuntos) || !Array.isArray(registro.dados.servicos)) return falha('registro_indisponivel');
    const tema = assuntos.dados.assuntos.find((a) => ehObjeto(a) && a.id === temaId);
    if (!tema) return falha('tema_nao_encontrado');
    const servicos = registro.dados.servicos
      .filter((s) => ehObjeto(s) && s.assuntoId === temaId)
      .map((s) => ({ id: s.id, nome: nomeDoServicoNoDisco(arm, raiz, s.id) ?? '' }))
      .sort((a, b) => a.id.localeCompare(b.id));
    return { ok: true, documento: assuntos.dados, tema, servicos, hash: hashConteudo({ catalogo: assuntos.dados, servicos }) };
  }

  /** Nome atual e serviços afetados (só nomes, em ordem alfabética), mais a `revisao` a devolver ao salvar. Somente leitura. */
  function ler(temaId) {
    try {
      const c = carregar(temaId);
      if (!c.ok) return c;
      return { ok: true, edicao: { nome: c.tema.nome, servicos: c.servicos.map((s) => s.nome).sort((a, b) => a.localeCompare(b, 'pt-BR')) }, revisao: c.hash };
    } catch {
      return falha('indisponivel');
    }
  }

  function editar(temaId, { revisao, nome, ator } = {}) {
    try {
      // Sprint 8, Passo 8C: ator obrigatório, com perfil que pode editar tema (segunda barreira).
      const quem = resolverAtorDeGravacao(ator, 'editar_tema');
      if (!quem.ok) return falha(quem.erro);
      const c = carregar(temaId);
      if (!c.ok) return c;
      if (c.hash !== revisao) return falha('revisao_divergente');
      const r = editarTemaNoCatalogo(c.documento, temaId, nome, dataLocal(agora()));
      if (!r.ok) return r;
      let motivo = null;
      const t = executarTransacao({
        raiz,
        sistema,
        passos: [{ caminho: 'services/assuntos.json', tipo: 'json', conteudo: r.assuntos, novo: false, validar: (d) => validarAssuntos(d).erros }],
        verificar: () => {
          const erros = verificarFinal(raiz);
          if (erros.length > 0) return erros;
          if (!historico.registrarAcaoDeTema(temaId, { ator: quem.ator }).ok) {
            motivo = 'historico_indisponivel';
            return ['historico'];
          }
          return [];
        },
      });
      if (t.ok) {
        const depois = carregar(temaId);
        return { ok: true, revisao: depois.ok ? depois.hash : undefined };
      }
      if (t.revertido === false) return { ok: false, erro: 'desfazer_incompleto', revertido: false };
      return falha(motivo ?? (t.erro === 'dados_invalidos' || t.erro === 'verificacao_recusada' ? 'dados_invalidos' : 'falha_de_escrita'));
    } catch {
      return falha('indisponivel');
    }
  }

  return { ler, editar };
}
