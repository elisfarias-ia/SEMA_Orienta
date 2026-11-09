// Validador da base de serviços. Usa apenas recursos nativos do Node.
// Não acessa a rede: as URLs são conferidas somente quanto ao formato.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const STATUS_VALIDOS = ['rascunho', 'em_validacao', 'validado'];
export const TIPOS_FONTE = [
  'legislacao',
  'pagina_oficial',
  'manual',
  'formulario',
  'sistema',
  'canal_atendimento',
  'outro',
];
export const SITUACOES_VIGENCIA = ['vigente', 'alterada', 'revogada', 'a_confirmar', 'nao_se_aplica'];
export const GRUPOS_DOCUMENTO = [
  'empreendedor_empreendimento',
  'responsavel_tecnico',
  'imovel',
  'documentos_especificos',
  'estudos_planos_projetos',
];
export const ESTADOS_REVISAO_ATUALIDADE = ['pendente', 'em_revisao', 'concluida'];
export const TEMAS_PERGUNTA = [
  'conceito',
  'enquadramento',
  'legislacao',
  'siga',
  'documentos',
  'responsavel_tecnico',
  'imovel',
  'taxa',
  'prazo',
  'validade',
  'atendimento',
  'correcao',
  'outro',
];
export const TIPOS_BLOCO_ASSISTENTE = ['limitacao', 'descricao', 'sequencia', 'link', 'sem_conteudo'];
export const AMBIENTES_ASSISTENTE = ['teste_local', 'publico'];
export const BLOQUEIOS_PERGUNTA = [
  'desatualizacao',
  'vigencia',
  'informacao_variavel',
  'fonte_complementar',
  'conflito_com_base',
  'contato_desatualizado',
  'procedimento_do_sistema',
  'enquadramento_dependente_de_analise',
];
export const PENDENTE = 'PENDENTE';

const SECOES_ROTEIRO = [
  'Descrição do serviço',
  'Quem pode solicitar',
  'Condições',
  'Etapas',
  'Onde iniciar',
  'Observações',
  'Fontes',
];
const ARQUIVOS_COMPLEMENTARES = ['roteiro', 'documentos', 'perguntasFrequentes', 'fontes'];
const PADRAO_ID = /^[a-z][a-z0-9-]*$/;
const PADRAO_DATA = /^\d{4}-\d{2}-\d{2}$/;

const ehObjeto = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const textoPreenchido = (v) => typeof v === 'string' && v.trim() !== '';

/** Data no formato AAAA-MM-DD e existente no calendário (rejeita 2026-02-31). */
export function dataValida(valor) {
  if (typeof valor !== 'string' || !PADRAO_DATA.test(valor)) return false;
  const data = new Date(`${valor}T00:00:00Z`);
  return !Number.isNaN(data.getTime()) && data.toISOString().slice(0, 10) === valor;
}
const dataNulaOuValida = (v) => v === null || dataValida(v);

/** Valida e normaliza uma URL. Retorna { ok, erro, normalizada }. */
export function analisarUrl(valor) {
  if (typeof valor !== 'string' || valor.trim() === '') {
    return { ok: false, erro: 'URL ausente ou vazia' };
  }
  let url;
  try {
    url = new URL(valor);
  } catch {
    return { ok: false, erro: `URL inválida: "${valor}"` };
  }
  if (url.protocol !== 'https:') {
    return { ok: false, erro: `URL deve usar https://: "${valor}"` };
  }
  if (!url.hostname) {
    return { ok: false, erro: `URL sem endereço de servidor: "${valor}"` };
  }
  url.hash = '';
  const normalizada = url.href.replace(/\/+$/, '').toLowerCase();
  return { ok: true, normalizada };
}

/** Controle de vigência de uma fonte: situação, normas relacionadas e coerência com o tipo e a publicação. */
function validarVigencia(fonte, ref) {
  const erros = [];
  const v = fonte.vigencia;
  if (!ehObjeto(v)) return [`${ref}: vigencia obrigatória, com situacao, normasRelacionadas e observacao`];

  if (!SITUACOES_VIGENCIA.includes(v.situacao)) {
    erros.push(`${ref}: vigencia.situacao inválida ${JSON.stringify(v.situacao)}`);
  }
  if (!Array.isArray(v.normasRelacionadas) || !v.normasRelacionadas.every(textoPreenchido)) {
    erros.push(`${ref}: vigencia.normasRelacionadas deve ser uma lista de ids`);
  }
  if (v.observacao !== null && typeof v.observacao !== 'string') {
    erros.push(`${ref}: vigencia.observacao deve ser texto ou null`);
  }
  if (!SITUACOES_VIGENCIA.includes(v.situacao)) return erros;

  if (fonte.tipo === 'legislacao' && v.situacao === 'nao_se_aplica') {
    erros.push(`${ref}: fonte do tipo legislacao não pode usar vigencia nao_se_aplica`);
  }
  if (TIPOS_FONTE.includes(fonte.tipo) && fonte.tipo !== 'legislacao' && v.situacao !== 'nao_se_aplica') {
    erros.push(`${ref}: fonte que não é legislação deve usar vigencia nao_se_aplica`);
  }
  if (v.situacao === 'revogada' && Array.isArray(v.normasRelacionadas) && v.normasRelacionadas.length === 0) {
    erros.push(`${ref}: norma revogada deve citar ao menos uma norma em normasRelacionadas`);
  }
  if (fonte.publicado === true && v.situacao === 'revogada') {
    erros.push(`${ref}: norma revogada não pode estar publicada`);
  }
  if (fonte.publicado === true && v.situacao === 'a_confirmar') {
    erros.push(`${ref}: norma com vigência a_confirmar não pode estar publicada`);
  }
  return erros;
}

/**
 * Valida o conteúdo de um arquivo de fontes (objeto já carregado).
 * Retorna uma lista de mensagens de erro (vazia quando tudo está correto).
 */
export function validarFontes(doc, rotulo = 'fontes') {
  const erros = [];
  if (!ehObjeto(doc)) return [`${rotulo}: conteúdo deve ser um objeto`];
  if (!STATUS_VALIDOS.includes(doc.statusValidacao)) {
    erros.push(`${rotulo}: statusValidacao inválido: ${JSON.stringify(doc.statusValidacao)}`);
  }
  if (!Array.isArray(doc.fontes)) {
    erros.push(`${rotulo}: "fontes" deve ser uma lista`);
    return erros;
  }

  const ids = new Set();
  const tiposPorId = new Map();
  const urls = new Set();
  doc.fontes.forEach((fonte, i) => {
    const ref = `${rotulo}[${i}]`;
    if (!ehObjeto(fonte)) {
      erros.push(`${ref}: fonte deve ser um objeto`);
      return;
    }
    if (!textoPreenchido(fonte.id)) erros.push(`${ref}: id obrigatório`);
    else if (ids.has(fonte.id)) erros.push(`${ref}: id duplicado "${fonte.id}"`);
    else {
      ids.add(fonte.id);
      tiposPorId.set(fonte.id, fonte.tipo);
    }

    if (!textoPreenchido(fonte.titulo)) erros.push(`${ref}: título obrigatório`);
    if (!TIPOS_FONTE.includes(fonte.tipo)) {
      erros.push(`${ref}: tipo desconhecido ${JSON.stringify(fonte.tipo)}`);
    }
    if (!textoPreenchido(fonte.orgaoResponsavel)) erros.push(`${ref}: orgaoResponsavel obrigatório`);
    if (typeof fonte.descricao !== 'string') erros.push(`${ref}: descricao deve ser texto`);

    const url = analisarUrl(fonte.url);
    if (!url.ok) erros.push(`${ref}: ${url.erro}`);
    else if (urls.has(url.normalizada)) erros.push(`${ref}: URL duplicada "${fonte.url}"`);
    else urls.add(url.normalizada);

    for (const campo of ['dataConsulta', 'dataPublicacao']) {
      if (!(campo in fonte) || !dataNulaOuValida(fonte[campo])) {
        erros.push(`${ref}: ${campo} deve ser null ou uma data válida AAAA-MM-DD`);
      }
    }
    if ('dispositivoRelevante' in fonte && fonte.dispositivoRelevante !== null && typeof fonte.dispositivoRelevante !== 'string') {
      erros.push(`${ref}: dispositivoRelevante deve ser texto ou null`);
    }

    // Origem oficial, validação e publicação são conceitos independentes.
    if ('oficial' in fonte) erros.push(`${ref}: campo "oficial" foi substituído por "origemOficial"`);
    if (typeof fonte.origemOficial !== 'boolean') erros.push(`${ref}: origemOficial deve ser booleano`);
    if (typeof fonte.publicado !== 'boolean') erros.push(`${ref}: publicado deve ser booleano`);
    if (!STATUS_VALIDOS.includes(fonte.statusValidacao)) {
      erros.push(`${ref}: statusValidacao inválido ${JSON.stringify(fonte.statusValidacao)}`);
    } else if (fonte.statusValidacao !== 'validado') {
      if (fonte.publicado === true) erros.push(`${ref}: fonte não validada não pode estar publicada`);
    } else if (fonte.dataConsulta === null) {
      erros.push(`${ref}: fonte validada exige dataConsulta`);
    }
    if (doc.statusValidacao === 'rascunho' && fonte.statusValidacao === 'validado') {
      erros.push(`${ref}: arquivo em rascunho não pode conter fonte validada`);
    }
    erros.push(...validarVigencia(fonte, ref));
  });

  // Referências entre normas: somente ids existentes no mesmo arquivo.
  doc.fontes.forEach((fonte, i) => {
    const relacionadas = ehObjeto(fonte) && ehObjeto(fonte.vigencia) ? fonte.vigencia.normasRelacionadas : null;
    if (!Array.isArray(relacionadas)) return;
    for (const idRelacionado of relacionadas) {
      if (!ids.has(idRelacionado)) {
        erros.push(`${rotulo}[${i}]: normasRelacionadas cita fonte inexistente "${idRelacionado}"`);
      } else if (idRelacionado === fonte.id) {
        erros.push(`${rotulo}[${i}]: normasRelacionadas não pode citar a própria fonte`);
      } else if (fonte.tipo !== 'legislacao' && tiposPorId.get(idRelacionado) !== 'legislacao') {
        // Fonte não legislativa (manual, FAQ, TR...) só pode relacionar legislação, nunca outra fonte documental.
        erros.push(`${rotulo}[${i}]: fonte não legislativa só pode relacionar fontes do tipo legislacao ("${idRelacionado}" não é)`);
      }
    }
  });

  if (doc.statusValidacao === 'validado' && doc.fontes.some((f) => ehObjeto(f) && f.statusValidacao !== 'validado')) {
    erros.push(`${rotulo}: arquivo validado não pode conter fonte não validada`);
  }
  if (doc.fontes.length === 0 && !(typeof doc.pendencia === 'string' && doc.pendencia.startsWith(PENDENTE))) {
    erros.push(`${rotulo}: lista vazia exige "pendencia" iniciada por ${PENDENTE}`);
  }
  return erros;
}

function validarListaDeItens(doc, { rotulo, chave, idServico, idsFontes }) {
  const erros = [];
  if (!ehObjeto(doc)) return [`${rotulo}: conteúdo deve ser um objeto`];
  if (doc.serviceId !== idServico) {
    erros.push(`${rotulo}: serviceId "${doc.serviceId}" difere do serviço "${idServico}"`);
  }
  if (!STATUS_VALIDOS.includes(doc.statusValidacao)) {
    erros.push(`${rotulo}: statusValidacao inválido ${JSON.stringify(doc.statusValidacao)}`);
  }
  if (!Array.isArray(doc[chave])) {
    erros.push(`${rotulo}: "${chave}" deve ser uma lista`);
    return erros;
  }
  const ids = new Set();
  doc[chave].forEach((item, i) => {
    const ref = `${rotulo}[${i}]`;
    if (!ehObjeto(item)) {
      erros.push(`${ref}: item deve ser um objeto`);
      return;
    }
    if (!textoPreenchido(item.id)) erros.push(`${ref}: id obrigatório`);
    else if (ids.has(item.id)) erros.push(`${ref}: id duplicado "${item.id}"`);
    else ids.add(item.id);
    if (!STATUS_VALIDOS.includes(item.statusValidacao)) {
      erros.push(`${ref}: statusValidacao inválido ${JSON.stringify(item.statusValidacao)}`);
    }
    if (doc.statusValidacao === 'rascunho' && item.statusValidacao === 'validado') {
      erros.push(`${ref}: arquivo em rascunho não pode conter item validado`);
    }
    if (item.fonteId !== undefined && !idsFontes.has(item.fonteId)) {
      erros.push(`${ref}: fonteId "${item.fonteId}" não existe em fontes.json`);
    }
  });
  if (doc[chave].length === 0 && !(typeof doc.pendencia === 'string' && doc.pendencia.startsWith(PENDENTE))) {
    erros.push(`${rotulo}: lista vazia exige "pendencia" iniciada por ${PENDENTE}`);
  }
  return erros;
}

/**
 * Valida o arquivo de documentos (checklist) de um serviço.
 * `obrigatorio: null` significa "obrigatoriedade atual ainda não confirmada" (não é dispensa).
 */
export function validarDocumentos(doc, { rotulo = 'documentos', idServico, fontesPorId = new Map() } = {}) {
  const erros = [];
  if (!ehObjeto(doc)) return [`${rotulo}: conteúdo deve ser um objeto`];
  if (idServico !== undefined && doc.serviceId !== idServico) {
    erros.push(`${rotulo}: serviceId "${doc.serviceId}" difere do serviço "${idServico}"`);
  }
  if (!STATUS_VALIDOS.includes(doc.statusValidacao)) {
    erros.push(`${rotulo}: statusValidacao inválido ${JSON.stringify(doc.statusValidacao)}`);
  }
  if (!Array.isArray(doc.documentos)) {
    erros.push(`${rotulo}: "documentos" deve ser uma lista`);
    return erros;
  }

  const ids = new Set();
  doc.documentos.forEach((item, i) => {
    const ref = `${rotulo}[${i}]`;
    if (!ehObjeto(item)) {
      erros.push(`${ref}: item deve ser um objeto`);
      return;
    }
    if (!textoPreenchido(item.id)) erros.push(`${ref}: id obrigatório`);
    else if (ids.has(item.id)) erros.push(`${ref}: id duplicado "${item.id}"`);
    else ids.add(item.id);

    if (!GRUPOS_DOCUMENTO.includes(item.grupo)) erros.push(`${ref}: grupo inválido ${JSON.stringify(item.grupo)}`);
    for (const campo of ['nome', 'descricao', 'aplicabilidade']) {
      if (!textoPreenchido(item[campo])) erros.push(`${ref}: "${campo}" obrigatório`);
    }
    if (typeof item.condicional !== 'boolean') erros.push(`${ref}: condicional deve ser booleano`);
    if (item.observacao !== undefined && typeof item.observacao !== 'string') {
      erros.push(`${ref}: observacao deve ser texto`);
    }

    // Fonte: obrigatória, existente e não revogada.
    let fonte = null;
    if (!textoPreenchido(item.fonteId)) erros.push(`${ref}: documento sem fonteId`);
    else if (!fontesPorId.has(item.fonteId)) erros.push(`${ref}: fonteId "${item.fonteId}" não existe em fontes.json`);
    else {
      fonte = fontesPorId.get(item.fonteId);
      if (ehObjeto(fonte.vigencia) && fonte.vigencia.situacao === 'revogada') {
        erros.push(`${ref}: documento usa fonte revogada "${item.fonteId}" como fundamento`);
      }
    }
    if (!textoPreenchido(item.localizacaoFonte)) erros.push(`${ref}: localizacaoFonte obrigatória`);

    if (!STATUS_VALIDOS.includes(item.statusValidacao)) {
      erros.push(`${ref}: statusValidacao inválido ${JSON.stringify(item.statusValidacao)}`);
    }
    if (!ESTADOS_REVISAO_ATUALIDADE.includes(item.revisaoAtualidade)) {
      erros.push(`${ref}: revisaoAtualidade inválida ${JSON.stringify(item.revisaoAtualidade)}`);
    }
    if (!Array.isArray(item.alertas) || !item.alertas.every(textoPreenchido)) {
      erros.push(`${ref}: alertas deve ser uma lista de textos não vazios`);
    }
    if (doc.statusValidacao === 'rascunho' && item.statusValidacao === 'validado') {
      erros.push(`${ref}: arquivo em rascunho não pode conter item validado`);
    }

    // Obrigatoriedade: true, false ou null; só se define após revisão de atualidade e validação.
    if (item.obrigatorio !== null && typeof item.obrigatorio !== 'boolean') {
      erros.push(`${ref}: obrigatorio deve ser true, false ou null`);
    } else if (item.obrigatorio !== null && !(item.revisaoAtualidade === 'concluida' && item.statusValidacao === 'validado')) {
      erros.push(`${ref}: obrigatoriedade só pode ser definida (true/false) após revisão de atualidade concluída e validação; use null enquanto não confirmada`);
    }

    // Publicação: exige validação, revisão concluída e fonte publicada.
    if (typeof item.publicado !== 'boolean') erros.push(`${ref}: publicado deve ser booleano`);
    else if (item.publicado) {
      if (item.statusValidacao !== 'validado') erros.push(`${ref}: documento ${item.statusValidacao} não pode estar publicado`);
      if (item.revisaoAtualidade !== 'concluida') erros.push(`${ref}: documento publicado não pode ter revisão de atualidade ${item.revisaoAtualidade}`);
      if (fonte && fonte.publicado !== true) erros.push(`${ref}: documento publicado não pode usar fonte não publicada "${item.fonteId}"`);
    }
  });

  if (doc.documentos.length === 0 && !(typeof doc.pendencia === 'string' && doc.pendencia.startsWith(PENDENTE))) {
    erros.push(`${rotulo}: lista vazia exige "pendencia" iniciada por ${PENDENTE}`);
  }
  return erros;
}

const PADRAO_EMAIL = /[\w.+-]+@[\w-]+(\.[\w-]+)+/;
const PADRAO_TELEFONE = /(\(\d{2}\)|\b\d{2})\s?\d{4,5}[-\s]?\d{4}\b/;

/**
 * Valida o arquivo de perguntas frequentes de um serviço.
 * `conteudoFonte` é resumo de fonte histórica e nunca é usado pelo assistente;
 * só `respostaPublicavel` (aprovada e publicada) poderá ser usada.
 * Contatos (e-mails e telefones) não podem ser armazenados no arquivo.
 */
export function validarPerguntas(doc, { rotulo = 'perguntas', idServico, fontesPorId = new Map() } = {}) {
  const erros = [];
  if (!ehObjeto(doc)) return [`${rotulo}: conteúdo deve ser um objeto`];
  if (idServico !== undefined && doc.serviceId !== idServico) {
    erros.push(`${rotulo}: serviceId "${doc.serviceId}" difere do serviço "${idServico}"`);
  }
  if (!STATUS_VALIDOS.includes(doc.statusValidacao)) {
    erros.push(`${rotulo}: statusValidacao inválido ${JSON.stringify(doc.statusValidacao)}`);
  }
  if (!Array.isArray(doc.perguntas)) {
    erros.push(`${rotulo}: "perguntas" deve ser uma lista`);
    return erros;
  }

  const ids = new Set();
  const numeros = new Set();
  doc.perguntas.forEach((item, i) => {
    const ref = `${rotulo}[${i}]`;
    if (!ehObjeto(item)) {
      erros.push(`${ref}: item deve ser um objeto`);
      return;
    }
    if (!textoPreenchido(item.id)) erros.push(`${ref}: id obrigatório`);
    else if (ids.has(item.id)) erros.push(`${ref}: id duplicado "${item.id}"`);
    else ids.add(item.id);

    if (!textoPreenchido(item.numeroFonte)) erros.push(`${ref}: numeroFonte obrigatório`);
    else if (numeros.has(`${item.fonteId}|${item.numeroFonte}`)) erros.push(`${ref}: numeroFonte duplicado "${item.numeroFonte}"`);
    else numeros.add(`${item.fonteId}|${item.numeroFonte}`);

    if (!textoPreenchido(item.pergunta)) erros.push(`${ref}: "pergunta" obrigatória`);
    if (!textoPreenchido(item.conteudoFonte)) erros.push(`${ref}: "conteudoFonte" obrigatório`);
    if (!TEMAS_PERGUNTA.includes(item.tema)) erros.push(`${ref}: tema inválido ${JSON.stringify(item.tema)}`);
    if (item.temasSecundarios !== undefined) {
      if (!Array.isArray(item.temasSecundarios) || !item.temasSecundarios.every((t) => TEMAS_PERGUNTA.includes(t))) {
        erros.push(`${ref}: temasSecundarios deve ser uma lista de temas válidos`);
      } else {
        if (new Set(item.temasSecundarios).size !== item.temasSecundarios.length) erros.push(`${ref}: temasSecundarios com tema repetido`);
        if (item.temasSecundarios.includes(item.tema)) erros.push(`${ref}: temasSecundarios repete o tema principal`);
      }
    }

    let fonte = null;
    if (!textoPreenchido(item.fonteId)) erros.push(`${ref}: pergunta sem fonteId`);
    else if (!fontesPorId.has(item.fonteId)) erros.push(`${ref}: fonteId "${item.fonteId}" não existe em fontes.json`);
    else {
      fonte = fontesPorId.get(item.fonteId);
      if (ehObjeto(fonte.vigencia) && fonte.vigencia.situacao === 'revogada') {
        erros.push(`${ref}: pergunta usa fonte revogada "${item.fonteId}" como fundamento`);
      }
    }
    if (!textoPreenchido(item.localizacaoFonte)) erros.push(`${ref}: localizacaoFonte obrigatória`);
    if (!STATUS_VALIDOS.includes(item.statusValidacao)) erros.push(`${ref}: statusValidacao inválido ${JSON.stringify(item.statusValidacao)}`);
    if (!ESTADOS_REVISAO_ATUALIDADE.includes(item.revisaoAtualidade)) {
      erros.push(`${ref}: revisaoAtualidade inválida ${JSON.stringify(item.revisaoAtualidade)}`);
    }
    if (!Array.isArray(item.bloqueios) || !item.bloqueios.every((b) => BLOQUEIOS_PERGUNTA.includes(b))) {
      erros.push(`${ref}: bloqueios deve ser uma lista de motivos válidos`);
    } else if (new Set(item.bloqueios).size !== item.bloqueios.length) {
      erros.push(`${ref}: bloqueios com motivo repetido`);
    }
    if (!Array.isArray(item.alertas) || !item.alertas.every(textoPreenchido)) {
      erros.push(`${ref}: alertas deve ser uma lista de textos não vazios`);
    }
    if (doc.statusValidacao === 'rascunho' && item.statusValidacao === 'validado') {
      erros.push(`${ref}: arquivo em rascunho não pode conter item validado`);
    }

    // Resposta publicável: null até haver aprovação; só preenchida após revisão concluída e validação.
    if (item.respostaPublicavel !== null && !textoPreenchido(item.respostaPublicavel)) {
      erros.push(`${ref}: respostaPublicavel deve ser null ou um texto não vazio`);
    } else if (item.respostaPublicavel !== null && !(item.revisaoAtualidade === 'concluida' && item.statusValidacao === 'validado')) {
      erros.push(`${ref}: respostaPublicavel só pode ser preenchida após revisão de atualidade concluída e validação`);
    }

    // Publicação: exige validação, revisão concluída, resposta publicável, nenhum bloqueio e fonte publicada.
    if (typeof item.publicado !== 'boolean') erros.push(`${ref}: publicado deve ser booleano`);
    else if (item.publicado) {
      if (item.statusValidacao !== 'validado') erros.push(`${ref}: pergunta ${item.statusValidacao} não pode estar publicada`);
      if (item.revisaoAtualidade !== 'concluida') erros.push(`${ref}: pergunta publicada não pode ter revisão de atualidade ${item.revisaoAtualidade}`);
      if (item.respostaPublicavel === null) erros.push(`${ref}: pergunta publicada exige respostaPublicavel`);
      if (Array.isArray(item.bloqueios) && item.bloqueios.length > 0) erros.push(`${ref}: pergunta publicada não pode ter bloqueios`);
      if (fonte && fonte.publicado !== true) erros.push(`${ref}: pergunta publicada não pode usar fonte não publicada "${item.fonteId}"`);
    }

    // Privacidade: nenhum e-mail ou telefone em qualquer campo de texto.
    for (const [campo, valor] of Object.entries(item)) {
      const textos = Array.isArray(valor) ? valor : [valor];
      for (const texto of textos) {
        if (typeof texto === 'string' && (PADRAO_EMAIL.test(texto) || PADRAO_TELEFONE.test(texto))) {
          erros.push(`${ref}: o campo "${campo}" contém e-mail ou telefone; contatos não podem ser armazenados`);
        }
      }
    }
  });

  if (doc.perguntas.length === 0 && !(typeof doc.pendencia === 'string' && doc.pendencia.startsWith(PENDENTE))) {
    erros.push(`${rotulo}: lista vazia exige "pendencia" iniciada por ${PENDENTE}`);
  }
  if (typeof doc.pendencia === 'string' && (PADRAO_EMAIL.test(doc.pendencia) || PADRAO_TELEFONE.test(doc.pendencia))) {
    erros.push(`${rotulo}: a pendência contém e-mail ou telefone; contatos não podem ser armazenados`);
  }
  return erros;
}

// Temas que não podem aparecer em bloco de teste local (ficam bloqueados até validação da área competente).
const CONTEUDO_PROIBIDO_NO_TESTE = [
  [/\bUPFs?\b|R\$\s?\d/i, 'valor ou taxa'],
  [/\b\d+\s*(dias?|anos?|meses|horas?)\b|\b(dois|três|dez|seis)\s+(dias|anos|meses)\b/i, 'prazo ou validade'],
  [/\b(Decreto|Lei|Resolução|Portaria|Instrução Normativa)\b/i, 'norma'],
  // Afirmar que uma norma está vigente é confirmação jurídica que o conteúdo em teste não pode fazer.
  // Avisos como "norma pendente de confirmação" ou "situação de vigência a confirmar" continuam permitidos.
  [/\b(est[áa]|est[ãa]o|[ée]|s[ãa]o|continua|continuam|permanece|permanecem|segue|seguem|encontra-se|encontram-se)\s+(plenamente\s+|atualmente\s+)?(vigentes?|em vigor)\b|\b(norma|decreto|lei|resolu[çc][ãa]o|legisla[çc][ãa]o)s?\s+(vigentes?|em vigor)\b/i, 'norma apresentada como vigente'],
  [/\bobrigat[óo]ri/i, 'obrigatoriedade documental'],
  [/e-?sac/i, 'canal de protocolo'],
];

/**
 * Valida o arquivo de conteúdo do assistente (blocos por ambiente).
 * Bloco teste_local nunca é publicado nem validado; a autorização de teste não é aprovação material nem pública.
 */
export function validarConteudoAssistente(doc, { rotulo = 'conteudoAssistente', idServico, fontesPorId = new Map() } = {}) {
  const erros = [];
  if (!ehObjeto(doc)) return [`${rotulo}: conteúdo deve ser um objeto`];
  if (idServico !== undefined && doc.serviceId !== idServico) {
    erros.push(`${rotulo}: serviceId "${doc.serviceId}" difere do serviço "${idServico}"`);
  }
  if (!STATUS_VALIDOS.includes(doc.statusValidacao)) {
    erros.push(`${rotulo}: statusValidacao inválido ${JSON.stringify(doc.statusValidacao)}`);
  }
  if (!Array.isArray(doc.blocos)) {
    erros.push(`${rotulo}: "blocos" deve ser uma lista`);
    return erros;
  }

  const temBlocoDeTeste = doc.blocos.some((b) => ehObjeto(b) && b.ambiente === 'teste_local');
  const a = doc.autorizacao;
  if (a !== undefined && !ehObjeto(a)) {
    erros.push(`${rotulo}: autorizacao deve ser um objeto`);
  } else if (a === undefined) {
    if (temBlocoDeTeste) erros.push(`${rotulo}: bloco teste_local exige autorizacao estruturada`);
  } else {
    if (a.escopo !== 'teste_local') erros.push(`${rotulo}: autorizacao.escopo deve ser "teste_local"`);
    if (!dataValida(a.data)) erros.push(`${rotulo}: autorizacao.data deve ser uma data válida AAAA-MM-DD`);
    if (a.aprovacaoMaterial !== false) erros.push(`${rotulo}: autorizacao.aprovacaoMaterial deve ser false (a autorização de teste não é aprovação material)`);
    if (a.aprovacaoPublica !== false) erros.push(`${rotulo}: autorizacao.aprovacaoPublica deve ser false (a autorização de teste não é aprovação pública)`);
    if (!textoPreenchido(a.observacao)) erros.push(`${rotulo}: autorizacao.observacao obrigatória`);
  }

  const ids = new Set();
  doc.blocos.forEach((b, i) => {
    const ref = `${rotulo}[${i}]`;
    if (!ehObjeto(b)) {
      erros.push(`${ref}: bloco deve ser um objeto`);
      return;
    }
    if (!textoPreenchido(b.id)) erros.push(`${ref}: id obrigatório`);
    else if (ids.has(b.id)) erros.push(`${ref}: id duplicado "${b.id}"`);
    else ids.add(b.id);
    if (!TIPOS_BLOCO_ASSISTENTE.includes(b.tipo)) erros.push(`${ref}: tipo inválido ${JSON.stringify(b.tipo)}`);
    if (!textoPreenchido(b.texto)) erros.push(`${ref}: texto obrigatório`);
    if (!AMBIENTES_ASSISTENTE.includes(b.ambiente)) erros.push(`${ref}: ambiente inválido ${JSON.stringify(b.ambiente)}`);
    if (!STATUS_VALIDOS.includes(b.statusValidacao)) erros.push(`${ref}: statusValidacao inválido ${JSON.stringify(b.statusValidacao)}`);
    if (!ESTADOS_REVISAO_ATUALIDADE.includes(b.revisaoAtualidade)) {
      erros.push(`${ref}: revisaoAtualidade inválida ${JSON.stringify(b.revisaoAtualidade)}`);
    }
    if (typeof b.publicado !== 'boolean') erros.push(`${ref}: publicado deve ser booleano`);
    if (b.aviso !== undefined && !textoPreenchido(b.aviso)) erros.push(`${ref}: aviso deve ser um texto não vazio`);

    // Origem e fontes: bloco apoiado em fonte cita fontes existentes e não revogadas.
    const fonteIds = Array.isArray(b.fonteIds) ? b.fonteIds : null;
    if (!fonteIds || !fonteIds.every(textoPreenchido)) erros.push(`${ref}: fonteIds deve ser uma lista de ids`);
    if (b.origem === 'fonte') {
      if (!fonteIds || fonteIds.length === 0) erros.push(`${ref}: bloco com origem "fonte" exige fonteIds`);
      for (const id of fonteIds ?? []) {
        const fonte = fontesPorId.get(id);
        if (!fonte) erros.push(`${ref}: fonteId "${id}" não existe em fontes.json`);
        else if (ehObjeto(fonte.vigencia) && fonte.vigencia.situacao === 'revogada') {
          erros.push(`${ref}: bloco usa fonte revogada "${id}" como fundamento`);
        }
      }
    } else if (b.origem === 'regra_institucional') {
      if (fonteIds && fonteIds.length > 0) erros.push(`${ref}: bloco com origem "regra_institucional" não cita fontes`);
    } else {
      erros.push(`${ref}: origem inválida ${JSON.stringify(b.origem)}`);
    }

    // Link: a URL deve ser a da fonte citada e constar do texto.
    if (b.tipo === 'link') {
      const fonte = fonteIds && fonteIds.length === 1 ? fontesPorId.get(fonteIds[0]) : null;
      const url = analisarUrl(b.url);
      if (!url.ok) erros.push(`${ref}: ${url.erro}`);
      else if (!fonte || fonte.url !== b.url) erros.push(`${ref}: a url do link deve ser a da fonte citada`);
      if (textoPreenchido(b.texto) && typeof b.url === 'string' && !b.texto.includes(b.url)) {
        erros.push(`${ref}: o texto do link deve conter a url`);
      }
    } else if (b.url !== undefined) {
      erros.push(`${ref}: url só é permitida em bloco do tipo link`);
    }

    if (b.ambiente === 'teste_local') {
      if (b.publicado !== false) erros.push(`${ref}: bloco teste_local não pode estar publicado`);
      if (b.statusValidacao === 'validado') erros.push(`${ref}: bloco teste_local não pode estar validado`);
      if (textoPreenchido(b.texto)) {
        for (const [regex, tema] of CONTEUDO_PROIBIDO_NO_TESTE) {
          if (regex.test(b.texto)) erros.push(`${ref}: bloco teste_local contém ${tema}, que permanece bloqueado`);
        }
        if (PADRAO_EMAIL.test(b.texto) || PADRAO_TELEFONE.test(b.texto)) {
          erros.push(`${ref}: bloco teste_local contém e-mail ou telefone; contatos não podem ser armazenados`);
        }
      }
    } else if (b.ambiente === 'publico' && b.publicado === true) {
      if (b.statusValidacao !== 'validado') erros.push(`${ref}: bloco ${b.statusValidacao} não pode estar publicado`);
      if (b.revisaoAtualidade !== 'concluida') erros.push(`${ref}: bloco publicado não pode ter revisão de atualidade ${b.revisaoAtualidade}`);
      if (b.origem === 'fonte') {
        for (const id of fonteIds ?? []) {
          const fonte = fontesPorId.get(id);
          if (fonte && fonte.publicado !== true) erros.push(`${ref}: bloco publicado não pode usar fonte não publicada "${id}"`);
        }
      }
    }
  });

  if (doc.blocos.length === 0 && !(typeof doc.pendencia === 'string' && doc.pendencia.startsWith(PENDENTE))) {
    erros.push(`${rotulo}: lista vazia exige "pendencia" iniciada por ${PENDENTE}`);
  }
  return erros;
}

/**
 * Regra de bloqueio para perguntas: só pergunta publicada, validada, com revisão concluída, sem bloqueios,
 * com resposta publicável e fonte publicada e não revogada é liberada. O assistente recebe apenas
 * { id, pergunta, respostaPublicavel, fonteId } e NUNCA o conteudoFonte.
 */
export function perguntasDisponiveisParaAssistente(doc, fontesPorId = new Map()) {
  if (!ehObjeto(doc) || !Array.isArray(doc.perguntas)) return [];
  return doc.perguntas
    .filter((item) => {
      if (!ehObjeto(item) || item.publicado !== true) return false;
      if (item.statusValidacao !== 'validado' || item.revisaoAtualidade !== 'concluida') return false;
      if (!textoPreenchido(item.respostaPublicavel)) return false;
      if (!Array.isArray(item.bloqueios) || item.bloqueios.length > 0) return false;
      const fonte = fontesPorId.get(item.fonteId);
      if (!fonte || fonte.publicado !== true) return false;
      return !(ehObjeto(fonte.vigencia) && fonte.vigencia.situacao === 'revogada');
    })
    .map(({ id, pergunta, respostaPublicavel, fonteId }) => ({ id, pergunta, respostaPublicavel, fonteId }));
}

/**
 * Regra de bloqueio: somente documentos publicados, validados, com revisão de atualidade concluída
 * e fonte publicada e não revogada podem ser disponibilizados ao assistente.
 */
export function documentosDisponiveisParaAssistente(doc, fontesPorId = new Map()) {
  if (!ehObjeto(doc) || !Array.isArray(doc.documentos)) return [];
  return doc.documentos.filter((item) => {
    if (!ehObjeto(item) || item.publicado !== true) return false;
    if (item.statusValidacao !== 'validado' || item.revisaoAtualidade !== 'concluida') return false;
    const fonte = fontesPorId.get(item.fonteId);
    if (!fonte || fonte.publicado !== true) return false;
    return !(ehObjeto(fonte.vigencia) && fonte.vigencia.situacao === 'revogada');
  });
}

/** Em rascunho, o conteúdo material deve estar pendente (nunca preenchido por suposição). */
function validarConteudoPendente(servico, rotulo) {
  const erros = [];
  for (const campo of ['descricao', 'publico', 'unidadeResponsavel']) {
    if (servico[campo] !== PENDENTE) erros.push(`${rotulo}: "${campo}" deve ser ${PENDENTE} enquanto o serviço estiver em rascunho`);
  }
  // links e legislacao podem referenciar fontes em validação (por id); a publicação segue bloqueada.
  for (const campo of ['condicoes', 'etapas']) {
    if (!Array.isArray(servico[campo]) || servico[campo].length > 0) {
      erros.push(`${rotulo}: "${campo}" deve ser lista vazia enquanto o serviço estiver em rascunho`);
    }
  }
  for (const campo of ['responsavelValidacao', 'dataRevisao']) {
    if (servico[campo] !== null) erros.push(`${rotulo}: "${campo}" deve ser null enquanto o serviço estiver em rascunho`);
  }
  for (const campo of ['canalAtendimento', 'sistemaInicio']) {
    const v = servico[campo];
    if (!ehObjeto(v) || v.nome !== PENDENTE || v.url !== null) {
      erros.push(`${rotulo}: "${campo}" deve ser { nome: "${PENDENTE}", url: null } enquanto o serviço estiver em rascunho`);
    }
  }
  return erros;
}

/**
 * Fora do rascunho, todo campo de conteúdo preenchido precisa indicar suas fontes em "referencias"
 * (ids de fontes existentes e não revogadas).
 */
function validarReferencias(servico, rotulo, fontesPorId) {
  const erros = [];
  const referencias = servico.referencias;
  if (referencias !== undefined && !ehObjeto(referencias)) {
    return [`${rotulo}: "referencias" deve ser um objeto de listas de ids`];
  }
  const mapa = referencias ?? {};
  for (const [campo, ids] of Object.entries(mapa)) {
    if (!Array.isArray(ids) || ids.length === 0 || !ids.every(textoPreenchido)) {
      erros.push(`${rotulo}: referencias.${campo} deve ser uma lista não vazia de ids`);
      continue;
    }
    for (const id of ids) {
      const fonte = fontesPorId.get(id);
      if (!fonte) erros.push(`${rotulo}: referencias.${campo} cita fonte inexistente "${id}"`);
      else if (ehObjeto(fonte.vigencia) && fonte.vigencia.situacao === 'revogada') {
        erros.push(`${rotulo}: referencias.${campo} cita fonte revogada "${id}" como fundamento`);
      }
    }
  }
  if (servico.statusValidacao === 'rascunho') return erros;

  const preenchido = {
    descricao: textoPreenchido(servico.descricao) && servico.descricao !== PENDENTE,
    publico: textoPreenchido(servico.publico) && servico.publico !== PENDENTE,
    condicoes: Array.isArray(servico.condicoes) && servico.condicoes.length > 0,
    etapas: Array.isArray(servico.etapas) && servico.etapas.length > 0,
    sistemaInicio: ehObjeto(servico.sistemaInicio) && servico.sistemaInicio.nome !== PENDENTE,
    canalAtendimento: ehObjeto(servico.canalAtendimento) && servico.canalAtendimento.nome !== PENDENTE,
  };
  for (const [campo, temConteudo] of Object.entries(preenchido)) {
    if (temConteudo && !(Array.isArray(mapa[campo]) && mapa[campo].length > 0)) {
      erros.push(`${rotulo}: "${campo}" tem conteúdo mas não indica fonte em referencias.${campo}`);
    }
  }
  return erros;
}

function validarServicoValidado(servico, rotulo) {
  const erros = [];
  for (const campo of ['descricao', 'publico', 'unidadeResponsavel']) {
    if (!textoPreenchido(servico[campo]) || servico[campo] === PENDENTE) erros.push(`${rotulo}: "${campo}" deve estar preenchido em serviço validado`);
  }
  if (!textoPreenchido(servico.responsavelValidacao)) erros.push(`${rotulo}: responsavelValidacao obrigatório em serviço validado`);
  if (!dataValida(servico.dataRevisao)) {
    erros.push(`${rotulo}: dataRevisao (AAAA-MM-DD) obrigatória em serviço validado`);
  }
  return erros;
}

function validarPontoDeAcesso(servico, campo, rotulo) {
  const v = servico[campo];
  if (!ehObjeto(v) || typeof v.nome !== 'string' || !('url' in v)) {
    return [`${rotulo}: "${campo}" deve ter { nome, url }`];
  }
  if (v.url === null) return [];
  const url = analisarUrl(v.url);
  return url.ok ? [] : [`${rotulo}: ${campo}.${url.erro}`];
}

function validarRoteiro(texto, servico, rotulo, fontesPorId = new Map()) {
  const erros = [];
  const verificarIds = (linha, contexto) => {
    for (const m of linha.matchAll(/`([^`]+)`/g)) {
      const fonte = fontesPorId.get(m[1]);
      if (!fonte) erros.push(`${rotulo}: ${contexto} cita fonte inexistente "${m[1]}"`);
      else if (ehObjeto(fonte.vigencia) && fonte.vigencia.situacao === 'revogada') {
        erros.push(`${rotulo}: ${contexto} cita fonte revogada "${m[1]}" como fundamento`);
      }
    }
  };
  const secoes = new Map();
  let atual = null;
  for (const linha of texto.split(/\r?\n/)) {
    const m = /^##\s+(.+?)\s*$/.exec(linha);
    if (m) {
      atual = m[1];
      secoes.set(atual, []);
    } else if (atual !== null && linha.trim() !== '') {
      secoes.get(atual).push(linha.trim());
    }
  }
  for (const nome of SECOES_ROTEIRO) {
    if (!secoes.has(nome)) {
      erros.push(`${rotulo}: seção ausente "${nome}"`);
      continue;
    }
    const corpo = secoes.get(nome);
    const somentePendente = corpo.length === 1 && corpo[0] === PENDENTE;
    if (servico.statusValidacao === 'rascunho') {
      if (!somentePendente) {
        erros.push(`${rotulo}: seção "${nome}" deve conter somente ${PENDENTE} enquanto o serviço estiver em rascunho`);
      }
      continue;
    }
    // Fora do rascunho, toda seção com conteúdo (exceto a lista "Fontes") deve indicar suas fontes por id.
    if (nome === 'Fontes') {
      corpo.forEach((linha) => verificarIds(linha, 'seção "Fontes"'));
    } else if (!somentePendente) {
      const linhasFontes = corpo.filter((linha) => /^Fontes?:/i.test(linha));
      if (linhasFontes.length === 0) erros.push(`${rotulo}: seção "${nome}" tem conteúdo mas não indica "Fontes:" por id`);
      linhasFontes.forEach((linha) => {
        if (!/`[^`]+`/.test(linha)) erros.push(`${rotulo}: seção "${nome}" indica "Fontes:" sem nenhum id`);
        verificarIds(linha, `seção "${nome}"`);
      });
    }
  }
  return erros;
}

/** Lê um JSON; registra erro se o arquivo não existir ou não for JSON válido. */
function lerJson(raiz, caminhoRelativo, erros, rotulo) {
  const completo = resolverDentro(raiz, caminhoRelativo);
  if (!completo) {
    erros.push(`${rotulo}: caminho fora da pasta services/: "${caminhoRelativo}"`);
    return null;
  }
  if (!fs.existsSync(completo)) {
    erros.push(`${rotulo}: arquivo não encontrado: ${caminhoRelativo}`);
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(completo, 'utf8'));
  } catch (e) {
    erros.push(`${rotulo}: JSON inválido em ${caminhoRelativo} (${e.message})`);
    return null;
  }
}

/** Resolve um caminho relativo garantindo que fique dentro de <raiz>/services. */
function resolverDentro(raiz, caminhoRelativo) {
  if (typeof caminhoRelativo !== 'string' || caminhoRelativo === '') return null;
  const base = path.resolve(raiz, 'services');
  const completo = path.resolve(raiz, caminhoRelativo);
  return completo.startsWith(base + path.sep) ? completo : null;
}

/**
 * Valida o registro e todos os serviços a partir de uma pasta raiz.
 * Retorna { erros, servicos } e nunca lança por problemas de conteúdo.
 */
/**
 * Valida o catálogo de assuntos (services/assuntos.json). Assunto é uma área ampla da SEMA; serviço é um
 * atendimento específico vinculado a um assunto. Retorna { erros, assuntos } (assuntos: Map id -> assunto).
 */
export function validarAssuntos(doc, rotulo = 'assuntos') {
  const erros = [];
  const assuntos = new Map();
  if (!ehObjeto(doc)) return { erros: [`${rotulo}: arquivo deve ser um objeto`], assuntos };
  if (!Number.isInteger(doc.versaoEstrutura) || doc.versaoEstrutura < 1) {
    erros.push(`${rotulo}: versaoEstrutura deve ser um inteiro maior ou igual a 1`);
  }
  if (!Array.isArray(doc.assuntos) || doc.assuntos.length === 0) {
    erros.push(`${rotulo}: "assuntos" deve ser uma lista não vazia`);
    return { erros, assuntos };
  }
  doc.assuntos.forEach((a, i) => {
    const ref = `${rotulo}[${i}]`;
    if (!ehObjeto(a)) {
      erros.push(`${ref}: assunto deve ser um objeto`);
      return;
    }
    if (typeof a.id !== 'string' || !PADRAO_ID.test(a.id)) {
      erros.push(`${ref}: id inválido ${JSON.stringify(a.id)}`);
      return;
    }
    const nome = `assunto "${a.id}"`;
    if (assuntos.has(a.id)) {
      erros.push(`${nome}: identificador duplicado`);
      return;
    }
    assuntos.set(a.id, a);
    for (const campo of ['nome', 'descricao']) {
      if (!textoPreenchido(a[campo])) erros.push(`${nome}: "${campo}" obrigatório`);
    }
    if (typeof a.ativo !== 'boolean') erros.push(`${nome}: "ativo" deve ser booleano`);
    for (const campo of ['criadoEm', 'atualizadoEm']) {
      if (!dataValida(a[campo])) erros.push(`${nome}: ${campo} deve ser uma data válida AAAA-MM-DD`);
    }
    if (dataValida(a.criadoEm) && dataValida(a.atualizadoEm) && a.atualizadoEm < a.criadoEm) {
      erros.push(`${nome}: atualizadoEm não pode ser anterior a criadoEm`);
    }
  });
  return { erros, assuntos };
}

/** Confere o assuntoId do registro e do service.json: obrigatório, igual nos dois, existente e ativo. */
function validarAssuntoDoServico(entrada, servico, rotulo, catalogo) {
  const erros = [];
  const idRegistro = entrada.assuntoId;
  const idServico = servico.assuntoId;
  for (const [origem, valor] of [['registro', idRegistro], ['service.json', idServico]]) {
    if (typeof valor !== 'string' || !PADRAO_ID.test(valor)) erros.push(`${rotulo}: assuntoId obrigatório e válido no ${origem}`);
  }
  if (typeof idRegistro === 'string' && typeof idServico === 'string' && idRegistro !== idServico) {
    erros.push(`${rotulo}: assuntoId difere entre registro e service.json`);
  }
  if (catalogo) {
    for (const valor of new Set([idRegistro, idServico])) {
      if (typeof valor !== 'string' || !PADRAO_ID.test(valor)) continue;
      const assunto = catalogo.get(valor);
      if (!assunto) erros.push(`${rotulo}: assuntoId "${valor}" não existe em services/assuntos.json`);
      else if (assunto.ativo !== true) erros.push(`${rotulo}: assunto "${valor}" está inativo e não aceita serviços`);
    }
  }
  return erros;
}

export function validarServicos(raiz) {
  const erros = [];
  const registro = lerJson(raiz, 'services/registry.json', erros, 'registry');
  if (!registro) return { erros, servicos: [] };

  if (!Number.isInteger(registro.versaoEstrutura) || registro.versaoEstrutura < 1) {
    erros.push('registry: versaoEstrutura deve ser um inteiro maior ou igual a 1');
  }
  if (!Array.isArray(registro.servicos)) {
    erros.push('registry: "servicos" deve ser uma lista');
    return { erros, servicos: [] };
  }

  // Catálogo de assuntos (conceito distinto do serviço).
  let catalogo = null;
  const docAssuntos = lerJson(raiz, 'services/assuntos.json', erros, 'assuntos');
  if (docAssuntos) {
    const r = validarAssuntos(docAssuntos);
    erros.push(...r.erros);
    catalogo = r.assuntos;
  }

  const idsVistos = new Set();
  const validados = [];
  registro.servicos.forEach((entrada, i) => {
    const ref = `registry.servicos[${i}]`;
    if (!ehObjeto(entrada)) {
      erros.push(`${ref}: entrada deve ser um objeto`);
      return;
    }
    const { id } = entrada;
    if (typeof id !== 'string' || !PADRAO_ID.test(id)) {
      erros.push(`${ref}: id inválido ${JSON.stringify(id)}`);
      return;
    }
    if (idsVistos.has(id)) {
      erros.push(`${ref}: identificador duplicado "${id}"`);
      return;
    }
    idsVistos.add(id);
    const rotulo = `serviço "${id}"`;

    if (!STATUS_VALIDOS.includes(entrada.statusValidacao)) {
      erros.push(`${rotulo}: statusValidacao inválido no registro: ${JSON.stringify(entrada.statusValidacao)}`);
    }
    if (typeof entrada.publicado !== 'boolean') {
      erros.push(`${rotulo}: "publicado" deve ser booleano no registro`);
    } else if (entrada.publicado && entrada.statusValidacao !== 'validado') {
      erros.push(`${rotulo}: serviço ${entrada.statusValidacao} não pode estar publicado`);
    }
    if (entrada.arquivo !== `services/${id}/service.json`) {
      erros.push(`${rotulo}: "arquivo" deve ser services/${id}/service.json`);
    }

    const servico = lerJson(raiz, entrada.arquivo, erros, rotulo);
    if (!servico) return;
    validados.push(id);

    if (servico.id !== id) erros.push(`${rotulo}: id do service.json ("${servico.id}") difere do registro`);
    erros.push(...validarAssuntoDoServico(entrada, servico, rotulo, catalogo));
    if (servico.statusValidacao !== entrada.statusValidacao) {
      erros.push(`${rotulo}: statusValidacao difere entre registro e service.json`);
    }
    if (servico.publicado !== entrada.publicado) {
      erros.push(`${rotulo}: "publicado" difere entre registro e service.json`);
    }
    if (!STATUS_VALIDOS.includes(servico.statusValidacao)) {
      erros.push(`${rotulo}: statusValidacao inválido no service.json`);
    }
    if (servico.publicado === true && servico.statusValidacao !== 'validado') {
      erros.push(`${rotulo}: serviço ${servico.statusValidacao} não pode estar publicado`);
    }
    for (const campo of ['nome', 'sigla', 'categoria']) {
      if (!textoPreenchido(servico[campo])) erros.push(`${rotulo}: "${campo}" obrigatório`);
    }
    if (!Array.isArray(servico.termosEquivalentes) || servico.termosEquivalentes.length === 0 || !servico.termosEquivalentes.every(textoPreenchido)) {
      erros.push(`${rotulo}: termosEquivalentes deve ser uma lista não vazia de textos`);
    }
    erros.push(...validarPontoDeAcesso(servico, 'canalAtendimento', rotulo));
    erros.push(...validarPontoDeAcesso(servico, 'sistemaInicio', rotulo));

    if (servico.statusValidacao === 'rascunho') erros.push(...validarConteudoPendente(servico, rotulo));
    if (servico.statusValidacao === 'validado') erros.push(...validarServicoValidado(servico, rotulo));

    // Arquivos complementares
    const arquivos = ehObjeto(servico.arquivos) ? servico.arquivos : {};
    if (!ehObjeto(servico.arquivos)) erros.push(`${rotulo}: "arquivos" deve ser um objeto`);
    for (const chave of ARQUIVOS_COMPLEMENTARES) {
      const caminho = arquivos[chave];
      if (typeof caminho !== 'string' || caminho === '') {
        erros.push(`${rotulo}: arquivos.${chave} não informado`);
        arquivos[chave] = undefined;
      } else if (!caminho.startsWith(`services/${id}/`)) {
        erros.push(`${rotulo}: arquivos.${chave} deve estar em services/${id}/`);
      }
    }

    const fontes = arquivos.fontes ? lerJson(raiz, arquivos.fontes, erros, `${rotulo} fontes`) : null;
    const idsFontes = new Set();
    const fontesPorId = new Map();
    if (fontes) {
      if (fontes.serviceId !== id) erros.push(`${rotulo} fontes: serviceId "${fontes.serviceId}" difere do serviço`);
      erros.push(...validarFontes(fontes, `${rotulo} fontes`));
      if (Array.isArray(fontes.fontes)) {
        fontes.fontes.forEach((f) => {
          if (ehObjeto(f)) {
            idsFontes.add(f.id);
            fontesPorId.set(f.id, f);
          }
        });
      }
    }
    for (const campo of ['links', 'legislacao']) {
      if (Array.isArray(servico[campo])) {
        for (const refFonte of servico[campo]) {
          const fonteCitada = fontesPorId.get(refFonte);
          if (!idsFontes.has(refFonte)) {
            erros.push(`${rotulo}: ${campo} cita fonte inexistente "${refFonte}"`);
            continue;
          }
          if (campo === 'legislacao' && fonteCitada.tipo !== 'legislacao') {
            erros.push(`${rotulo}: legislacao cita fonte "${refFonte}" que não é do tipo legislacao`);
          }
          // Serviço publicado só pode referenciar fonte validada, publicada e não revogada.
          if (servico.publicado === true) {
            const vigencia = ehObjeto(fonteCitada.vigencia) ? fonteCitada.vigencia.situacao : null;
            if (fonteCitada.statusValidacao !== 'validado' || fonteCitada.publicado !== true || vigencia === 'revogada') {
              erros.push(`${rotulo}: serviço publicado não pode referenciar a fonte "${refFonte}" (não validada, não publicada ou revogada)`);
            }
          }
        }
      } else {
        erros.push(`${rotulo}: "${campo}" deve ser uma lista`);
      }
    }
    for (const campo of ['condicoes', 'etapas', 'pendencias']) {
      if (!Array.isArray(servico[campo])) erros.push(`${rotulo}: "${campo}" deve ser uma lista`);
    }
    erros.push(...validarReferencias(servico, rotulo, fontesPorId));

    if (arquivos.documentos) {
      const docs = lerJson(raiz, arquivos.documentos, erros, `${rotulo} documentos`);
      if (docs) erros.push(...validarDocumentos(docs, { rotulo: `${rotulo} documentos`, idServico: id, fontesPorId }));
    }
    if (arquivos.perguntasFrequentes) {
      const perguntas = lerJson(raiz, arquivos.perguntasFrequentes, erros, `${rotulo} perguntas`);
      if (perguntas) erros.push(...validarPerguntas(perguntas, { rotulo: `${rotulo} perguntas`, idServico: id, fontesPorId }));
    }
    // Conteúdo do assistente (opcional): blocos separados por ambiente.
    if (arquivos.conteudoAssistente !== undefined) {
      if (typeof arquivos.conteudoAssistente !== 'string' || !arquivos.conteudoAssistente.startsWith(`services/${id}/`)) {
        erros.push(`${rotulo}: arquivos.conteudoAssistente deve estar em services/${id}/`);
      } else {
        const conteudo = lerJson(raiz, arquivos.conteudoAssistente, erros, `${rotulo} conteudoAssistente`);
        if (conteudo) {
          erros.push(...validarConteudoAssistente(conteudo, { rotulo: `${rotulo} conteudoAssistente`, idServico: id, fontesPorId }));
        }
      }
    }
    if (arquivos.roteiro) {
      const caminho = resolverDentro(raiz, arquivos.roteiro);
      if (!caminho) erros.push(`${rotulo}: roteiro fora da pasta services/`);
      else if (!fs.existsSync(caminho)) erros.push(`${rotulo}: arquivo não encontrado: ${arquivos.roteiro}`);
      else erros.push(...validarRoteiro(fs.readFileSync(caminho, 'utf8'), servico, `${rotulo} roteiro`, fontesPorId));
    }
  });

  return { erros, servicos: validados };
}

// Execução pela linha de comando: npm run validate:services
const executadoDiretamente =
  process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (executadoDiretamente) {
  const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const { erros, servicos } = validarServicos(raiz);
  if (erros.length > 0) {
    console.error(`Validação dos serviços FALHOU (${erros.length} problema(s)):`);
    for (const e of erros) console.error(` - ${e}`);
    process.exit(1);
  }
  console.log(`Validação dos serviços concluída sem erros. Serviços verificados: ${servicos.join(', ')}.`);
}
