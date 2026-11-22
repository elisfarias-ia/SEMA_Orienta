// Revisão humana da versão em elaboração (Sprint 5, Passo 5B1): regras PURAS. Não leem arquivos, não usam relógio nem
// aleatoriedade e nunca modificam o que recebem (devolvem cópias novas). A data (AAAA-MM-DD) vem de fora.
//
// Ações (todas só na versão atual em rascunho, sempre por uma pessoa; nenhuma acessa link, usa agente ou IA, nem publica):
//   - revisarFonte: marca a fonte como VALIDADA (conferência humana dos metadados), com dataConsulta; não altera origemOficial,
//     não publica e não declara confirmação jurídica;
//   - aceitarBloco: bloco de conhecimento em elaboração, com fontes existentes, revisadas e não revogadas, passa a validado com
//     revisão concluída, ainda NÃO publicado; o texto original em entradas.json não é tocado;
//   - rejeitarBloco: remove bloco de conhecimento ainda em rascunho (a fonte e a entrada original ficam);
//   - avaliarPendencias / situacaoDaRevisao: o que falta para enviar a versão para revisão (Sprint 8, Passo 8D: o envio é da
//     Cadastrante; validar ou pedir ajustes é do Revisor, sobre a versão já enviada e congelada).
// Blocos `teste_local` e os demais tipos nunca participam. Resultado: { ok: true, ... } ou { ok: false, erro, ... } (códigos,
// nunca conteúdo).

import { conteudoEditavel } from './fluxo.js';
import { removerBlocoConhecimento, TIPO_CONHECIMENTO } from './conhecimento.js';
import { entradasVazias, validarArquivoEntradas } from './entradas.js';
import { dataIsoValida, falha } from './versao.js';
import { fonteExcluida, fonteIndisponivel, fonteRevogadaPorVigencia } from './edicao-fonte.js';
import { validarConteudoAssistente } from '../../scripts/validate-services.js';

const ehObjeto = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const PADRAO_ID = /^[a-z][a-z0-9-]*$/;
const PADRAO_REVISAO = /^[0-9a-f]{64}$/;
const LIMITE_ID = 60;

export const ROTULO_EM_ELABORACAO = 'Em elaboração';
/** Rótulo da situação da versão em linguagem comum (nunca o nome técnico do estado). */
export function rotuloDaSituacao(estado) {
  if (estado === 'rascunho') return ROTULO_EM_ELABORACAO;
  if (estado === 'validado_materialmente' || estado === 'autorizado_publicacao') return 'Pronto para publicar';
  if (estado === 'publicado') return 'Publicado';
  if (estado === 'revogado') return 'Publicação revogada';
  if (estado === 'ajustes_solicitados') return 'Ajustes solicitados';
  return 'Em análise';
}
const ehConhecimento = (b) => ehObjeto(b) && b.tipo === TIPO_CONHECIMENTO;
// "Revogada" aqui inclui a fonte excluída logicamente: nenhuma das duas pode ser usada nem revisada.
const fonteRevogada = (f) => fonteIndisponivel(f);
const idValido = (v) => typeof v === 'string' && v.length <= LIMITE_ID && PADRAO_ID.test(v);
const listaDe = (doc, chave) => (ehObjeto(doc) && Array.isArray(doc[chave]) ? doc[chave].filter(ehObjeto) : []);
const mapaDeFontes = (arquivos) => new Map(listaDe(arquivos.fontes, 'fontes').map((f) => [f.id, f]));

/** Corpos aceitos de cada ação: somente os campos listados (nunca ids novos, status, hash, datas nem texto). */
export const CAMPOS_DA_ACAO = Object.freeze({
  revisar_fonte: Object.freeze(['fonteId', 'revisao']),
  aceitar_bloco: Object.freeze(['blocoId', 'revisao']),
  rejeitar_bloco: Object.freeze(['blocoId', 'revisao']),
  reabrir_bloco: Object.freeze(['blocoId', 'revisao']),
  // Sprint 8, Passo 8D: concluir_revisao deu lugar a três ações. O motivo dos ajustes é texto livre: aqui só se apara; o conteúdo
  // (obrigatório, até 500 caracteres, sem e-mail, telefone, CPF ou credencial) é conferido uma única vez, por decisoes.js.
  enviar_para_revisao: Object.freeze(['revisao']),
  validar_materialmente: Object.freeze(['revisao']),
  solicitar_ajustes: Object.freeze(['revisao', 'motivo']),
  nova_versao: Object.freeze([]),
});

/** Valida o corpo de uma ação. Retorna { ok: true, dados } ou { ok: false, campos } (só nomes de campos). */
export function validarCorpoDaAcao(acao, corpo) {
  if (!Object.hasOwn(CAMPOS_DA_ACAO, acao)) return { ok: false, campos: ['acao'] };
  if (!ehObjeto(corpo)) return { ok: false, campos: ['corpo'] };
  const permitidos = CAMPOS_DA_ACAO[acao];
  const campos = [];
  if (Object.keys(corpo).some((k) => !permitidos.includes(k))) campos.push('extras');
  for (const campo of permitidos) {
    if (campo === 'motivo') continue;
    if (campo === 'revisao' ? typeof corpo.revisao !== 'string' || !PADRAO_REVISAO.test(corpo.revisao) : !idValido(corpo[campo])) campos.push(campo);
  }
  const valor = (c) => (c === 'motivo' && typeof corpo.motivo === 'string' ? corpo.motivo.trim() : corpo[c]);
  return campos.length ? { ok: false, campos } : { ok: true, dados: Object.fromEntries(permitidos.map((c) => [c, valor(c)])) };
}

/** Entradas íntegras: hash de cada texto confere e há 1:1 com as fontes textuais. Lista de erros (vazia = íntegras). */
function errosDeEntradas(arquivos, servicoId) {
  const doc = ehObjeto(arquivos.entradas) ? arquivos.entradas : entradasVazias(servicoId);
  return validarArquivoEntradas(doc, { servicoId, fontes: listaDe(arquivos.fontes, 'fontes') });
}

/**
 * Pendências para enviar a versão para revisão (somente códigos e títulos de itens da própria administração):
 *   sem_bloco_aceito, bloco_pendente, fonte_pendente, fonte_revogada, fonte_inexistente, entrada_invalida.
 * Considera só blocos de conhecimento; teste_local e demais tipos não participam.
 */
export function avaliarPendencias(arquivos, servicoId) {
  const pendencias = [];
  const fontes = mapaDeFontes(arquivos);
  const blocos = listaDe(arquivos.conteudoAssistente, 'blocos').filter(ehConhecimento);
  const aceitos = blocos.filter((b) => b.statusValidacao === 'validado');
  if (aceitos.length === 0) pendencias.push({ codigo: 'sem_bloco_aceito' });
  for (const b of blocos) if (b.statusValidacao !== 'validado') pendencias.push({ codigo: 'bloco_pendente', id: b.id, titulo: b.titulo });
  const vistas = new Set();
  for (const b of blocos) {
    for (const id of Array.isArray(b.fonteIds) ? b.fonteIds : []) {
      if (vistas.has(id)) continue;
      vistas.add(id);
      const f = fontes.get(id);
      if (!f) pendencias.push({ codigo: 'fonte_inexistente', id });
      else if (fonteRevogada(f)) pendencias.push({ codigo: 'fonte_revogada', id, titulo: f.titulo });
      else if (f.statusValidacao !== 'validado') pendencias.push({ codigo: 'fonte_pendente', id, titulo: f.titulo });
    }
  }
  if (errosDeEntradas(arquivos, servicoId).length > 0) pendencias.push({ codigo: 'entrada_invalida' });
  return pendencias;
}

/**
 * Situação da revisão para a consulta: estado da versão, o que pode ser feito e as pendências. Os itens trazem só título,
 * situação e se podem ser revisados ou aceitos; nada do texto original das entradas.
 * Sprint 8, Passo 8D: `motivoAjustes` (o motivo da decisão de ajustes desta versão, lido do histórico privado) só é devolvido
 * quando a versão está em ajustes_solicitados. É a ÚNICA resposta que pode conter o motivo (GET local, com token).
 */
export function situacaoDaRevisao({ servicoId, manifesto, arquivos, revisao, motivoAjustes = null }) {
  const editavel = conteudoEditavel(manifesto.estado);
  const fontes = mapaDeFontes(arquivos);
  const blocos = listaDe(arquivos.conteudoAssistente, 'blocos').filter(ehConhecimento);
  const usadas = new Set(blocos.flatMap((b) => (Array.isArray(b.fonteIds) ? b.fonteIds : [])));
  const pendencias = avaliarPendencias(arquivos, servicoId);
  return {
    servicoId,
    versaoId: manifesto.id,
    estadoVersao: manifesto.estado,
    rotulo: rotuloDaSituacao(manifesto.estado),
    revisaoPendente: editavel && pendencias.length > 0,
    // "Pendências para concluir" = todos os impedimentos (nenhuma informação aceita, informações em elaboração, fontes USADAS ainda não
    // revisadas, fonte revogada ou inexistente, entrada inválida). Fonte não usada por nenhum bloco NÃO conta nem impede concluir.
    // Fonte não usada por nenhum bloco pode continuar sem revisão: não entra na contagem, não impede concluir e não vai ao público.
    resumo: (() => {
      const informacoesPendentes = blocos.filter((b) => b.statusValidacao !== 'validado').length;
      const fontesPendentes = [...fontes.values()].filter((f) => usadas.has(f.id) && f.statusValidacao !== 'validado').length;
      return {
        fontesPendentes,
        informacoesPendentes,
        informacoesAceitas: blocos.filter((b) => b.statusValidacao === 'validado').length,
        fontesNaoUsadas: [...fontes.values()].filter((f) => !usadas.has(f.id) && f.statusValidacao !== 'validado' && !fonteRevogada(f)).length,
        // Fonte única: a contagem é o número de impedimentos devolvidos pelo domínio (a mesma lista de `pendencias`).
        pendenciasParaConcluir: pendencias.length,
      };
    })(),
    editavel,
    revisao,
    // Fonte excluída é invisível na gestão: não entra na lista nem nas contagens.
    fontes: [...fontes.values()].filter((f) => !fonteExcluida(f)).map((f) => ({
      id: f.id,
      titulo: f.titulo,
      forma: f.formaEntrada === 'texto' ? 'texto' : 'link',
      revisada: f.statusValidacao === 'validado',
      revogada: fonteRevogadaPorVigencia(f),
      excluida: fonteExcluida(f),
      usadaPorBloco: usadas.has(f.id),
      podeRevisar: editavel && f.statusValidacao !== 'validado' && !fonteRevogada(f),
      podeEditar: editavel && !fonteRevogada(f),
      podeExcluir: editavel,
    })),
    blocos: blocos.map((b) => {
      const fontesPendentes = (Array.isArray(b.fonteIds) ? b.fonteIds : []).filter((id) => {
        const f = fontes.get(id);
        return !f || fonteRevogada(f) || f.statusValidacao !== 'validado';
      });
      const emElaboracao = b.statusValidacao !== 'validado';
      return {
        id: b.id,
        titulo: b.titulo,
        aceito: !emElaboracao,
        fontesPendentes,
        podeAceitar: editavel && emElaboracao && b.revisaoAtualidade === 'pendente' && fontesPendentes.length === 0 && (b.fonteIds ?? []).length > 0,
        podeReabrir: editavel && !emElaboracao && b.publicado === false,
        podeRejeitar: editavel && emElaboracao && b.statusValidacao === 'rascunho' && b.publicado === false && b.revisaoAtualidade === 'pendente',
      };
    }),
    pendencias,
    // Sprint 8, Passo 8D: o envio (Cadastrante) só em elaboração e sem pendências; validar e pedir ajustes (Revisor) só na versão
    // enviada cujo conteúdo em disco ainda é o que foi enviado (hash do manifesto = revisão atual).
    podeEnviar: editavel && pendencias.length === 0,
    podeValidar: manifesto.estado === 'em_validacao' && manifesto.hashConteudo === revisao && pendencias.length === 0,
    podeSolicitarAjustes: manifesto.estado === 'em_validacao' && manifesto.hashConteudo === revisao,
    motivoAjustes: manifesto.estado === 'ajustes_solicitados' && typeof motivoAjustes === 'string' && motivoAjustes.trim() !== '' ? motivoAjustes : null,
  };
}

/** Marca uma fonte como revisada (validada). Retorna { ok: true, fontes } (arquivo inteiro novo) ou { ok: false, erro }. */
export function revisarFonte(arquivos, fonteId, data, servicoId) {
  if (!dataIsoValida(data) || !idValido(fonteId)) return falha('dados_invalidos');
  const doc = arquivos.fontes;
  const lista = listaDe(doc, 'fontes');
  const alvo = lista.find((f) => f.id === fonteId);
  if (!alvo) return falha('fonte_nao_encontrada');
  if (fonteExcluida(alvo)) return falha('fonte_nao_encontrada'); // excluída = invisível
  if (fonteRevogada(alvo)) return falha('fonte_revogada');
  if (alvo.statusValidacao === 'validado') return falha('fonte_ja_revisada');
  // Fonte textual: a entrada original precisa estar íntegra (hash confere e 1:1) antes de ser revisada.
  if (alvo.formaEntrada === 'texto' && errosDeEntradas(arquivos, servicoId).length > 0) return falha('entrada_invalida');
  const fontes = structuredClone(doc);
  fontes.fontes = fontes.fontes.map((f) => (ehObjeto(f) && f.id === fonteId ? { ...f, statusValidacao: 'validado', dataConsulta: f.dataConsulta ?? data } : f));
  if (fontes.statusValidacao === 'rascunho') fontes.statusValidacao = 'em_validacao';
  return { ok: true, fontes };
}

function conferirConteudoAssistente(novo, arquivos) {
  const erros = validarConteudoAssistente(novo, { idServico: novo.serviceId, fontesPorId: mapaDeFontes(arquivos) });
  return erros.length ? falha('conteudo_invalido') : null;
}

/** Aceita um bloco de conhecimento em elaboração. Retorna { ok: true, conteudoAssistente } ou { ok: false, erro, fontes? }. */
export function aceitarBloco(arquivos, blocoId, data) {
  if (!dataIsoValida(data) || !idValido(blocoId)) return falha('dados_invalidos');
  const doc = arquivos.conteudoAssistente;
  const bloco = listaDe(doc, 'blocos').find((b) => b.id === blocoId);
  if (!bloco) return falha('bloco_nao_encontrado');
  if (!ehConhecimento(bloco)) return falha('bloco_nao_aceitavel');
  if (bloco.statusValidacao === 'validado') return falha('bloco_ja_aceito');
  if (bloco.statusValidacao !== 'rascunho' || bloco.publicado !== false || bloco.revisaoAtualidade !== 'pendente') return falha('bloco_nao_aceitavel');
  const ids = Array.isArray(bloco.fonteIds) ? bloco.fonteIds : [];
  if (ids.length === 0) return falha('bloco_sem_fonte');
  const fontes = mapaDeFontes(arquivos);
  const pendentes = [];
  for (const id of ids) {
    const f = fontes.get(id);
    if (!f) return falha('fonte_inexistente');
    if (fonteRevogada(f)) return falha('fonte_revogada');
    if (f.statusValidacao !== 'validado') pendentes.push(id);
  }
  if (pendentes.length > 0) return { ok: false, erro: 'fonte_pendente', fontes: pendentes };
  const novo = structuredClone(doc);
  const atualizadoEm = dataIsoValida(bloco.criadoEm) && data < bloco.criadoEm ? bloco.criadoEm : data;
  novo.blocos = novo.blocos.map((b) => (ehObjeto(b) && b.id === blocoId ? { ...b, statusValidacao: 'validado', revisaoAtualidade: 'concluida', publicado: false, atualizadoEm } : b));
  if (novo.statusValidacao === 'rascunho') novo.statusValidacao = 'em_validacao';
  return conferirConteudoAssistente(novo, arquivos) ?? { ok: true, conteudoAssistente: novo };
}

/**
 * Reabre para correção um bloco aceito, enquanto a versão ainda está em rascunho: volta a rascunho, revisão de atualidade
 * pendente e `publicado` falso. Não existe depois de concluída a revisão (a versão fica congelada). Retorna
 * { ok: true, conteudoAssistente } ou { ok: false, erro }.
 */
export function reabrirBloco(arquivos, blocoId, data) {
  if (!dataIsoValida(data) || !idValido(blocoId)) return falha('dados_invalidos');
  const doc = arquivos.conteudoAssistente;
  const bloco = listaDe(doc, 'blocos').find((b) => b.id === blocoId);
  if (!bloco) return falha('bloco_nao_encontrado');
  if (!ehConhecimento(bloco)) return falha('bloco_nao_aceitavel');
  if (bloco.statusValidacao !== 'validado' || bloco.publicado !== false) return falha('bloco_nao_aceito');
  const novo = structuredClone(doc);
  const atualizadoEm = dataIsoValida(bloco.criadoEm) && data < bloco.criadoEm ? bloco.criadoEm : data;
  novo.blocos = novo.blocos.map((b) => (ehObjeto(b) && b.id === blocoId ? { ...b, statusValidacao: 'rascunho', revisaoAtualidade: 'pendente', publicado: false, atualizadoEm } : b));
  return conferirConteudoAssistente(novo, arquivos) ?? { ok: true, conteudoAssistente: novo };
}

/** Rejeita (remove) um bloco de conhecimento ainda em rascunho. A fonte e a entrada original ficam. */
export function rejeitarBloco(manifesto, arquivos, blocoId) {
  if (!idValido(blocoId)) return falha('dados_invalidos');
  const r = removerBlocoConhecimento(manifesto, arquivos.conteudoAssistente, blocoId);
  if (!r.ok) return falha(r.erro === 'versao_nao_editavel' ? 'versao_congelada' : r.erro);
  return conferirConteudoAssistente(r.conteudo, arquivos) ?? { ok: true, conteudoAssistente: r.conteudo };
}
