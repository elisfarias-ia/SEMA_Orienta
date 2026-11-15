// Entradas de texto (Sprint 4, Passo 4B1): modelo de dados e regras PURAS. Sem fs, relógio ou aleatoriedade: datas e estado da
// base chegam por parâmetro e nada recebido é modificado. O texto cadastrado NUNCA aparece em erros, mensagens ou logs: os
// erros trazem só códigos e nomes de campos.
//
// Cada versão de serviço pode ter um `entradas.json` (ao lado de fontes.json). Cada entrada de texto corresponde 1:1 a uma fonte
// textual em fontes.json (formaEntrada "texto", tipo "texto_cadastrado", url null, entradaId apontando para a entrada). O hash
// (SHA-256 dos bytes UTF-8 do texto, exatamente como enviado) fica SOMENTE em entradas.json.
//
// Atenção a ciclos de importação: este módulo é importado por scripts/validate-services.js, que é importado por cadastro.js.
// Por isso nada aqui lê constantes importadas durante a avaliação do módulo: só dentro das funções.

import { createHash } from 'node:crypto';
import { contemCredencial, contemDadoSensivel, gerarId, textoLivre } from './cadastro.js';
import { conteudoEditavel } from './fluxo.js';
import { dataIsoValida } from './versao.js';

export const NOME_ARQUIVO_ENTRADAS = 'entradas.json';
export const CHAVE_ENTRADAS = 'entradas';
export const TIPO_FONTE_TEXTO = 'texto_cadastrado';
export const FORMAS_ENTRADA = Object.freeze(['link', 'texto']);
export const LIMITES_ENTRADA = Object.freeze({ caracteres: 20000, caracteresVersao: 100000, bytes: 80000, bytesVersao: 400000 });
export const CAMPOS_ARQUIVO_ENTRADAS = Object.freeze(['servicoId', 'entradas']);
export const CAMPOS_ENTRADA = Object.freeze(['id', 'fonteId', 'texto', 'hash', 'criadoEm', 'atualizadoEm']);
// Corpo aceito do cliente: nunca ids, hash, datas, status, publicação, url nem origem oficial.
export const CAMPOS_CORPO_ENTRADA = Object.freeze(['titulo', 'texto', 'orgaoResponsavel', 'descricao']);
export const CAMPOS_FONTE_TEXTO = Object.freeze([
  'id', 'titulo', 'tipo', 'formaEntrada', 'entradaId', 'orgaoResponsavel', 'url', 'descricao', 'origemOficial', 'statusValidacao', 'publicado',
  'dataPublicacao', 'dataConsulta', 'dispositivoRelevante', 'vigencia',
]);

const LIMITE_TITULO = 200;
const LIMITE_ORGAO = 120;
const LIMITE_DESCRICAO = 1000;
const PADRAO_HASH = /^[0-9a-f]{64}$/;
const PADRAO_ID = /^[a-z][a-z0-9-]*$/;
// Controles C0 (exceto \t \n \r), incluindo o byte nulo, mais DEL.
const CONTROLE_PROIBIDO = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
const SUBSTITUTO_SOLTO = /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/;

const ehObjeto = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const temExtras = (obj, permitidos) => Object.keys(obj).some((k) => !permitidos.includes(k));
const contarCaracteres = (texto) => Array.from(texto).length;
const contarBytes = (texto) => Buffer.byteLength(texto, 'utf8');

/** SHA-256 hexadecimal (64) dos bytes UTF-8 do texto, exatamente como submetido (sem trim e sem normalizar). */
export function hashTexto(texto) {
  return createHash('sha256').update(Buffer.from(texto, 'utf8')).digest('hex');
}

/**
 * Problemas de um texto de entrada, só como códigos: nao_texto, vazio, controle, codificacao, limite_caracteres, limite_bytes,
 * dado_pessoal. Lista vazia = aceitável. O texto nunca é copiado para o resultado.
 */
export function problemasDoTexto(texto) {
  if (typeof texto !== 'string') return ['nao_texto'];
  const problemas = [];
  if (texto.trim() === '') problemas.push('vazio');
  if (CONTROLE_PROIBIDO.test(texto)) problemas.push('controle');
  if (SUBSTITUTO_SOLTO.test(texto)) problemas.push('codificacao');
  if (texto.length > LIMITES_ENTRADA.caracteres * 2 || contarCaracteres(texto) > LIMITES_ENTRADA.caracteres) problemas.push('limite_caracteres');
  if (contarBytes(texto) > LIMITES_ENTRADA.bytes) problemas.push('limite_bytes');
  // Só procura dado pessoal em texto dentro dos limites: evita varrer um texto enorme já recusado.
  if (!problemas.includes('limite_caracteres') && !problemas.includes('limite_bytes') && contemDadoSensivel(texto)) problemas.push('dado_pessoal');
  return problemas;
}

/**
 * Valida o corpo do cadastro de uma entrada de texto: titulo e texto obrigatórios; orgaoResponsavel e descricao opcionais.
 * O texto é preservado exatamente como enviado. Retorna { ok: true, dados } ou { ok: false, campos } (só nomes de campos).
 */
export function validarCorpoEntradaTexto(corpo) {
  if (!ehObjeto(corpo)) return { ok: false, campos: ['corpo'] };
  const campos = [];
  if (temExtras(corpo, CAMPOS_CORPO_ENTRADA)) campos.push('extras');
  const titulo = textoLivre(corpo.titulo, LIMITE_TITULO);
  if (titulo === null || gerarId(titulo, new Set()) === null || contemCredencial(titulo)) campos.push('titulo');
  if (problemasDoTexto(corpo.texto).length > 0) campos.push('texto');
  const opcional = (valor, limite) => (valor === undefined || valor === null || valor === '' ? undefined : textoLivre(valor, limite));
  const orgao = opcional(corpo.orgaoResponsavel, LIMITE_ORGAO);
  if (orgao === null) campos.push('orgaoResponsavel');
  const descricao = opcional(corpo.descricao, LIMITE_DESCRICAO);
  if (descricao === null || (descricao !== undefined && contemCredencial(descricao))) campos.push('descricao');
  if (campos.length) return { ok: false, campos };
  return { ok: true, dados: { titulo, texto: corpo.texto, orgaoResponsavel: orgao ?? null, descricao: descricao ?? '' } };
}

/** Documento de entradas vazio, para serviço novo (ou versão que ainda não tem o arquivo). */
export const entradasVazias = (servicoId) => ({ servicoId, entradas: [] });

/** Fonte textual correspondente a uma entrada: rascunho, não publicada, sem URL, sem origem oficial e sem verificacaoOrigem. */
export function montarFonteTexto({ id, titulo, orgaoResponsavel, descricao }, entradaId) {
  return {
    id,
    titulo,
    tipo: TIPO_FONTE_TEXTO,
    formaEntrada: 'texto',
    entradaId,
    orgaoResponsavel,
    url: null,
    descricao,
    origemOficial: false,
    statusValidacao: 'rascunho',
    publicado: false,
    dataPublicacao: null,
    dataConsulta: null,
    dispositivoRelevante: null,
    vigencia: { situacao: 'nao_se_aplica', normasRelacionadas: [], observacao: null },
  };
}

/** Totais de caracteres e de bytes dos textos de uma lista de entradas (ignora itens malformados). */
export function totaisDasEntradas(entradas) {
  let caracteres = 0;
  let bytes = 0;
  for (const e of Array.isArray(entradas) ? entradas : []) {
    if (ehObjeto(e) && typeof e.texto === 'string') {
      caracteres += contarCaracteres(e.texto);
      bytes += contarBytes(e.texto);
    }
  }
  return { caracteres, bytes };
}

/**
 * Prepara a nova entrada de texto e a fonte textual correspondente.
 *   dados             resultado de validarCorpoEntradaTexto;
 *   contexto.data     AAAA-MM-DD (data do servidor);
 *   contexto.servicoId
 *   contexto.estadoVersao  estado da versão atual (só rascunho é editável);
 *   contexto.documentoFontes   fontes.json atual;
 *   contexto.documentoEntradas entradas.json atual, ou null se a versão ainda não tem o arquivo.
 * Retorna { ok: true, entrada, fonte, documentoEntradas, documentoFontes, criaArquivo } ou { ok: false, erro, campo? }.
 */
export function prepararEntradaTexto(dados, contexto) {
  if (!contexto || !dataIsoValida(contexto.data) || typeof contexto.servicoId !== 'string' || !ehObjeto(contexto.documentoFontes)
    || !Array.isArray(contexto.documentoFontes.fontes)) throw new Error('contexto_invalido');
  if (!conteudoEditavel(contexto.estadoVersao)) return { ok: false, erro: 'versao_nao_editavel' };
  const criaArquivo = contexto.documentoEntradas === null || contexto.documentoEntradas === undefined;
  const atual = criaArquivo ? entradasVazias(contexto.servicoId) : contexto.documentoEntradas;
  if (!ehObjeto(atual) || atual.servicoId !== contexto.servicoId || !Array.isArray(atual.entradas)) throw new Error('contexto_invalido');

  const totais = totaisDasEntradas(atual.entradas);
  if (totais.caracteres + contarCaracteres(dados.texto) > LIMITES_ENTRADA.caracteresVersao
    || totais.bytes + contarBytes(dados.texto) > LIMITES_ENTRADA.bytesVersao) {
    return { ok: false, erro: 'limite_versao', campo: 'texto' };
  }
  const idsFontes = new Set(contexto.documentoFontes.fontes.map((f) => f.id));
  const idsEntradas = new Set(atual.entradas.map((e) => e.id));
  const fonteId = gerarId(dados.titulo, idsFontes);
  const entradaId = gerarId(`texto ${dados.titulo}`, idsEntradas);
  if (fonteId === null || entradaId === null) return { ok: false, erro: 'dados_invalidos', campo: 'titulo' };

  const entrada = { id: entradaId, fonteId, texto: dados.texto, hash: hashTexto(dados.texto), criadoEm: contexto.data, atualizadoEm: contexto.data };
  const fonte = montarFonteTexto({ id: fonteId, titulo: dados.titulo, orgaoResponsavel: dados.orgaoResponsavel, descricao: dados.descricao }, entradaId);
  const fontesAtuais = contexto.documentoFontes.fontes;
  const documentoFontes = {
    ...contexto.documentoFontes,
    fontes: [...fontesAtuais, fonte],
    ...(fontesAtuais.length === 0 ? { pendencia: 'PENDENTE: fontes em rascunho, ainda não validadas.' } : {}),
  };
  return { ok: true, entrada, fonte, documentoEntradas: { ...atual, entradas: [...atual.entradas, entrada] }, documentoFontes, criaArquivo };
}

/**
 * Valida o conteúdo de entradas.json e a associação 1:1 com as fontes textuais.
 *   fontes: lista de fontes (fontes.json) ou null quando indisponível; `servicoId` é o serviço da versão.
 * Retorna a lista de erros (vazia = correto). Nenhuma mensagem contém o texto cadastrado.
 */
export function validarArquivoEntradas(doc, { servicoId, fontes, rotulo = 'entradas' } = {}) {
  if (!ehObjeto(doc)) return [`${rotulo}: conteúdo deve ser um objeto`];
  const erros = [];
  if (temExtras(doc, CAMPOS_ARQUIVO_ENTRADAS)) erros.push(`${rotulo}: campo não previsto`);
  if (doc.servicoId !== servicoId) erros.push(`${rotulo}: servicoId difere do serviço`);
  if (!Array.isArray(doc.entradas)) return [...erros, `${rotulo}: "entradas" deve ser uma lista`];

  const lista = Array.isArray(fontes) ? fontes.filter(ehObjeto) : [];
  const fontesPorId = new Map(lista.map((f) => [f.id, f]));
  const ids = new Set();
  const fontesUsadas = new Set();
  let caracteres = 0;
  let bytes = 0;
  doc.entradas.forEach((e, i) => {
    const ref = `${rotulo}[${i}]`;
    if (!ehObjeto(e)) {
      erros.push(`${ref}: entrada deve ser um objeto`);
      return;
    }
    if (temExtras(e, CAMPOS_ENTRADA)) erros.push(`${ref}: campo não previsto`);
    for (const campo of CAMPOS_ENTRADA) if (!(campo in e)) erros.push(`${ref}: campo obrigatório ausente: ${campo}`);
    if (typeof e.id !== 'string' || !PADRAO_ID.test(e.id)) erros.push(`${ref}: id inválido`);
    else if (ids.has(e.id)) erros.push(`${ref}: id duplicado`);
    else ids.add(e.id);

    if (typeof e.texto === 'string') {
      caracteres += contarCaracteres(e.texto);
      bytes += contarBytes(e.texto);
      for (const p of problemasDoTexto(e.texto)) erros.push(`${ref}: texto recusado (${p})`);
      if (typeof e.hash !== 'string' || !PADRAO_HASH.test(e.hash)) erros.push(`${ref}: hash deve ser SHA-256 hexadecimal`);
      else if (e.hash !== hashTexto(e.texto)) erros.push(`${ref}: hash não confere com o texto`);
    } else {
      erros.push(`${ref}: texto deve ser texto`);
    }
    for (const campo of ['criadoEm', 'atualizadoEm']) {
      if (!dataIsoValida(e[campo])) erros.push(`${ref}: ${campo} deve ser uma data válida AAAA-MM-DD`);
    }
    if (dataIsoValida(e.criadoEm) && dataIsoValida(e.atualizadoEm) && e.atualizadoEm < e.criadoEm) {
      erros.push(`${ref}: atualizadoEm não pode ser anterior a criadoEm`);
    }

    if (typeof e.fonteId !== 'string') {
      erros.push(`${ref}: fonteId inválido`);
    } else if (fontesUsadas.has(e.fonteId)) {
      erros.push(`${ref}: fonteId usado por mais de uma entrada`);
    } else {
      fontesUsadas.add(e.fonteId);
      const fonte = fontesPorId.get(e.fonteId);
      if (!fonte) erros.push(`${ref}: fonteId não existe em fontes.json`);
      else if (fonte.formaEntrada !== 'texto') erros.push(`${ref}: a fonte correspondente não é uma fonte textual`);
      else if (fonte.entradaId !== e.id) erros.push(`${ref}: entradaId da fonte não aponta para esta entrada`);
    }
  });
  if (caracteres > LIMITES_ENTRADA.caracteresVersao) erros.push(`${rotulo}: limite de caracteres por versão excedido`);
  if (bytes > LIMITES_ENTRADA.bytesVersao) erros.push(`${rotulo}: limite de bytes por versão excedido`);

  // Fonte textual sem entrada (inclui o caso de entradas.json ausente, tratado por quem chama com doc vazio).
  for (const f of lista) {
    if (f.formaEntrada === 'texto' && !(typeof f.entradaId === 'string' && ids.has(f.entradaId))) {
      erros.push(`${rotulo}: fonte textual "${f.id}" sem entrada correspondente`);
    }
  }
  return erros;
}

/**
 * Cópia das entradas para uma nova versão (a anterior é preservada, nada é alterado). Retorna { ok: true, documento } com cópia
 * profunda, ou { ok: false, erro }. Sem o arquivo na versão anterior (null), a nova versão recebe o documento vazio.
 */
export function copiarEntradasParaNovaVersao(documentoEntradas, servicoId) {
  if (documentoEntradas === null || documentoEntradas === undefined) return { ok: true, documento: entradasVazias(servicoId) };
  if (!ehObjeto(documentoEntradas) || documentoEntradas.servicoId !== servicoId || !Array.isArray(documentoEntradas.entradas)) {
    return { ok: false, erro: 'entradas_invalidas' };
  }
  return { ok: true, documento: structuredClone(documentoEntradas) };
}

/**
 * Serviço novo: acrescenta ao esqueleto (montarEsqueletoServico) o entradas.json vazio e o registro `arquivos.entradas` no
 * manifesto da versão. Devolve um novo esqueleto; o original não é alterado. (Ainda não ligado ao cadastro guiado: ver pendências.)
 */
export function acrescentarEntradasAoEsqueleto(esqueleto, servicoId) {
  const caminho = `${esqueleto.pasta}/${NOME_ARQUIVO_ENTRADAS}`;
  const versao = { ...esqueleto.versao, arquivos: { ...esqueleto.versao.arquivos, [CHAVE_ENTRADAS]: caminho } };
  const arquivos = esqueleto.arquivos.map((a) => (a.conteudo === esqueleto.versao ? { ...a, conteudo: versao } : a));
  arquivos.push({ caminho, tipo: 'json', conteudo: entradasVazias(servicoId) });
  return { ...esqueleto, versao, arquivos };
}
