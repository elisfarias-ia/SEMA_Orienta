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
  const urls = new Set();
  doc.fontes.forEach((fonte, i) => {
    const ref = `${rotulo}[${i}]`;
    if (!ehObjeto(fonte)) {
      erros.push(`${ref}: fonte deve ser um objeto`);
      return;
    }
    if (!textoPreenchido(fonte.id)) erros.push(`${ref}: id obrigatório`);
    else if (ids.has(fonte.id)) erros.push(`${ref}: id duplicado "${fonte.id}"`);
    else ids.add(fonte.id);

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

function validarRoteiro(texto, servico, rotulo) {
  const erros = [];
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
    if (servico.statusValidacao === 'rascunho') {
      const corpo = secoes.get(nome);
      if (!(corpo.length === 1 && corpo[0] === PENDENTE)) {
        erros.push(`${rotulo}: seção "${nome}" deve conter somente ${PENDENTE} enquanto o serviço estiver em rascunho`);
      }
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

    if (arquivos.documentos) {
      const docs = lerJson(raiz, arquivos.documentos, erros, `${rotulo} documentos`);
      if (docs) erros.push(...validarListaDeItens(docs, { rotulo: `${rotulo} documentos`, chave: 'documentos', idServico: id, idsFontes }));
    }
    if (arquivos.perguntasFrequentes) {
      const perguntas = lerJson(raiz, arquivos.perguntasFrequentes, erros, `${rotulo} perguntas`);
      if (perguntas) erros.push(...validarListaDeItens(perguntas, { rotulo: `${rotulo} perguntas`, chave: 'perguntas', idServico: id, idsFontes }));
    }
    if (arquivos.roteiro) {
      const caminho = resolverDentro(raiz, arquivos.roteiro);
      if (!caminho) erros.push(`${rotulo}: roteiro fora da pasta services/`);
      else if (!fs.existsSync(caminho)) erros.push(`${rotulo}: arquivo não encontrado: ${arquivos.roteiro}`);
      else erros.push(...validarRoteiro(fs.readFileSync(caminho, 'utf8'), servico, `${rotulo} roteiro`));
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
