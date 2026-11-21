// Cadastro administrativo de assunto e serviço (Marco 7, Passo 7E1): funções PURAS. Não leem arquivos, não usam
// relógio, variáveis de ambiente nem aleatoriedade: a data vem de fora e nada recebido é modificado.
//
// Um serviço novo nasce SEMPRE como versão 1 em rascunho, não publicada, sem hash, decisão, responsável nem autorização,
// com todo o conteúdo material PENDENTE. Nenhum conteúdo ambiental é inventado: só o que a pessoa informou (id, nome,
// sigla e termos equivalentes) entra no esqueleto.

import { criarVersao } from './versao.js';
import { contemEmailNaoPermitido } from './contatos-permitidos.js';
import { acrescentarEntradasAoEsqueleto } from './entradas.js';
import { caminhosDaVersao } from '../versao-atual.js';
import { analisarUrl, dataValida, TIPOS_FONTE } from '../../scripts/validate-services.js';

export const PADRAO_ID = /^[a-z][a-z0-9-]*$/;
export const LIMITE_CORPO = 32 * 1024;
// O identificador (id) NÃO é enviado pelo cliente: o servidor o gera a partir do nome, uma única vez (ver gerarId).
export const CAMPOS_ASSUNTO = Object.freeze(['nome', 'descricao']);
export const CAMPOS_SERVICO = Object.freeze(['assuntoId', 'nome', 'sigla', 'termosEquivalentes']);
export const IDS_RESERVADOS = Object.freeze(['admin', 'schemas', 'versoes', 'registry', 'assuntos']);
export const SECOES_ROTEIRO = Object.freeze(['Descrição do serviço', 'Quem pode solicitar', 'Condições', 'Etapas', 'Onde iniciar', 'Observações', 'Fontes']);
export const PENDENTE = 'PENDENTE';

const LIMITE_ID = 60;
const LIMITE_NOME = 120;
const LIMITE_DESCRICAO = 1000;
const LIMITE_TERMOS = 20;
const PADRAO_SIGLA = /^[\p{L}\p{N}][\p{L}\p{N} ./-]{0,19}$/u;
const CONTROLE = /[\u0000-\u001f\u007f]/;
// Parte local limitada a 64 caracteres (limite de e-mail): evita custo quadrático em textos longos sem arroba.
export const PADRAO_EMAIL = /[\w.+-]{1,64}@[\w-]+(\.[\w-]+)+/;
export const PADRAO_TELEFONE = /(\(\d{2}\)|\b\d{2})\s?\d{4,5}[-\s]?\d{4}\b/;
/** CPF formatado (três grupos de 3 dígitos separados por ponto e 2 dígitos após hífen), mesmo padrão da regra do hook de commit. CPF só com dígitos já cai em PADRAO_TELEFONE. */
export const PADRAO_CPF = /(?<!\d)\d{3}\.\d{3}\.\d{3}-\d{2}(?!\d)/;

const ehObjeto = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/** Minúsculas, sem acentos, espaços colapsados: para comparar nomes e termos. */
export function normalizarNome(texto) {
  return String(texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Credencial com ALTA CONFIANÇA (só a ocorrência da palavra não basta): (1) atribuição explícita de senha, password, token,
 * secret, api_key ou chave_api (inclui refresh_token, client_secret, db_password...) com ":" ou "=" e valor; (2) "Bearer"
 * seguido de sequência com aparência de token; (3) "senha" seguida diretamente de valor alfanumérico com algum dígito.
 * Frases como "A senha deve ser trocada" ou "Informe login e senha" não são recusadas. Não retorna o trecho encontrado.
 */
const PADROES_CREDENCIAL = Object.freeze([
  /(?<![A-Za-z0-9])(?:senha|password|passwd|token|secret|api[_-]?key|chave[_-]?api) {0,3}[:=] {0,3}\S/i,
  /(?<![A-Za-z0-9])Bearer +[A-Za-z0-9._~+/=-]{12,}/i,
  /(?<![A-Za-z0-9])senha +(?=[A-Za-z0-9]{0,30}\d)[A-Za-z0-9]{4,31}(?![A-Za-z0-9])/i,
]);
export function contemCredencial(texto) {
  return typeof texto === 'string' && PADROES_CREDENCIAL.some((p) => p.test(texto));
}

/** Texto com dado pessoal ou credencial: e-mail, telefone ou credencial de alta confiança. Retorna booleano. */
export function contemDadoSensivel(texto) {
  if (typeof texto !== 'string') return false;
  return contemEmailNaoPermitido(texto) || PADRAO_TELEFONE.test(texto) || contemCredencial(texto);
}

/** Texto livre aceitável: string, sem caracteres de controle, sem e-mail nem telefone e dentro do limite. Retorna o texto aparado ou null. */
export function textoLivre(valor, limite) {
  if (typeof valor !== 'string' || CONTROLE.test(valor)) return null;
  const t = valor.trim().replace(/ {2,}/g, ' ');
  if (t === '' || t.length > limite || contemEmailNaoPermitido(t) || PADRAO_TELEFONE.test(t)) return null;
  return t;
}
const idAceitavel = (v) => typeof v === 'string' && v.length <= LIMITE_ID && PADRAO_ID.test(v);
const LIMITE_BASE_DO_ID = 52; // deixa espaço para o sufixo de colisão ("-2", "-3", ...) dentro de LIMITE_ID

/**
 * Base do identificador a partir do nome: minúsculas, sem acentos, espaços e símbolos viram hífen, só letras, números e
 * hífen, começando por letra (se o nome começar por número, recebe o prefixo "item-"). Retorna null se o nome não tiver
 * nenhuma letra. Função pura e determinística.
 */
export function baseDoId(nome) {
  const s = String(nome ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (!/[a-z]/.test(s)) return null;
  let base = /^[a-z]/.test(s) ? s : `item-${s}`;
  if (base.length > LIMITE_BASE_DO_ID) base = base.slice(0, LIMITE_BASE_DO_ID).replace(/-+$/, '');
  return base;
}

/**
 * Gera o identificador único do novo registro. Colisão com `existentes` (Set de ids já usados) é resolvida de forma
 * determinística: base, base-2, base-3... (o primeiro livre). Nunca reaproveita um id existente. Retorna null se o nome for inválido.
 */
export function gerarId(nome, existentes) {
  const base = baseDoId(nome);
  if (base === null) return null;
  if (!existentes.has(base)) return base;
  for (let n = 2; n < 10000; n += 1) {
    const candidato = `${base}-${n}`;
    if (!existentes.has(candidato)) return candidato;
  }
  return null;
}

/** Campos do corpo que não fazem parte do conjunto permitido (a contagem não repete o conteúdo enviado). */
function camposExtras(corpo, permitidos) {
  return Object.keys(corpo).some((k) => !permitidos.includes(k));
}

/**
 * Valida o corpo do cadastro de assunto: somente nome e descricao (o id é gerado pelo servidor). Retorna { ok: true, dados } ou
 * { ok: false, campos } com os NOMES dos campos inválidos (nunca os valores enviados).
 */
export function validarCorpoAssunto(corpo) {
  if (!ehObjeto(corpo)) return { ok: false, campos: ['corpo'] };
  const campos = [];
  if (camposExtras(corpo, CAMPOS_ASSUNTO)) campos.push('extras');
  const nome = textoLivre(corpo.nome, LIMITE_NOME);
  // A descrição é OPCIONAL: ausente, null ou vazia = omitida (nunca vira "PENDENTE"). Se vier preenchida, segue a regra de texto livre.
  const omitida = corpo.descricao === undefined || corpo.descricao === null || corpo.descricao === '';
  const descricao = omitida ? undefined : textoLivre(corpo.descricao, LIMITE_DESCRICAO);
  if (nome === null || baseDoId(nome) === null) campos.push('nome');
  if (descricao === null) campos.push('descricao');
  return campos.length ? { ok: false, campos } : { ok: true, dados: descricao === undefined ? { nome } : { nome, descricao } };
}

/**
 * Valida o corpo do cadastro de serviço: assuntoId, nome, termosEquivalentes e sigla opcional (o id é gerado pelo servidor).
 * Sem sigla, o serviço recebe PENDENTE.
 */
export function validarCorpoServico(corpo) {
  if (!ehObjeto(corpo)) return { ok: false, campos: ['corpo'] };
  const campos = [];
  if (camposExtras(corpo, CAMPOS_SERVICO)) campos.push('extras');
  if (!idAceitavel(corpo.assuntoId)) campos.push('assuntoId');
  const nome = textoLivre(corpo.nome, LIMITE_NOME);
  if (nome === null || baseDoId(nome) === null) campos.push('nome');

  let sigla = PENDENTE;
  if (corpo.sigla !== undefined) {
    if (typeof corpo.sigla !== 'string' || !PADRAO_SIGLA.test(corpo.sigla.trim()) || PADRAO_EMAIL.test(corpo.sigla)) campos.push('sigla');
    else sigla = corpo.sigla.trim();
  }

  const termos = [];
  const vistos = new Set();
  const lista = corpo.termosEquivalentes;
  if (!Array.isArray(lista) || lista.length === 0 || lista.length > LIMITE_TERMOS) {
    campos.push('termosEquivalentes');
  } else {
    for (const termo of lista) {
      const t = textoLivre(termo, LIMITE_NOME);
      if (t === null || vistos.has(normalizarNome(t))) {
        campos.push('termosEquivalentes');
        break;
      }
      vistos.add(normalizarNome(t));
      termos.push(t);
    }
  }
  return campos.length ? { ok: false, campos } : { ok: true, dados: { assuntoId: corpo.assuntoId, nome, sigla, termosEquivalentes: termos } };
}

/** Novo assunto: sempre ativo, com as datas informadas (geradas pelo servidor). */
export function montarAssunto({ id, nome, descricao }, data) {
  // Sem descrição, a chave é omitida (o catálogo aceita assunto sem descricao).
  return { id, nome, ...(typeof descricao === 'string' ? { descricao } : {}), ativo: true, criadoEm: data, atualizadoEm: data };
}

/** Roteiro inicial: somente as seções obrigatórias, todas PENDENTE. */
export function montarRoteiroInicial(nome) {
  return [`# ${nome}`, '', ...SECOES_ROTEIRO.flatMap((s) => [`## ${s}`, PENDENTE, ''])].join('\n');
}

function cabecalho(id, pendencia) {
  return { serviceId: id, statusValidacao: 'rascunho', pendencia: `${PENDENTE}: ${pendencia}` };
}

/**
 * Monta o esqueleto do serviço novo (versão 1, rascunho) e a entrada do registro. Retorna
 * { pasta, versaoId, entradaRegistro, versao, arquivos: [{ caminho, tipo, conteudo }] }, sem tocar em disco.
 * `assunto` é o assunto (já validado como existente e ativo) ao qual o serviço será vinculado.
 */
export function montarEsqueletoServico({ id, assuntoId, nome, sigla, termosEquivalentes }, assunto, data) {
  const pasta = `services/${id}/versoes/v1`;
  const versaoId = `${id}-v1`;
  const caminhos = caminhosDaVersao(pasta);
  const criada = criarVersao({ id: versaoId, servicoId: id, arquivos: caminhos, criadoEm: data });
  if (!criada.ok) throw new Error('esqueleto_invalido');

  const service = {
    id, assuntoId, nome, sigla, categoria: assunto.nome.toLowerCase(), termosEquivalentes: [...termosEquivalentes],
    arquivos: {
      roteiro: caminhos.roteiro, documentos: caminhos.documentos, perguntasFrequentes: caminhos.perguntasFrequentes,
      fontes: caminhos.fontes, conteudoAssistente: caminhos.conteudoAssistente,
    },
    statusValidacao: 'rascunho', publicado: false,
    descricao: PENDENTE, publico: PENDENTE, condicoes: [], etapas: [],
    unidadeResponsavel: PENDENTE, responsavelValidacao: null, dataRevisao: null,
    canalAtendimento: { nome: PENDENTE, url: null }, sistemaInicio: { nome: PENDENTE, url: null },
    links: [], legislacao: [],
    pendencias: ['descricao', 'publico', 'condicoes', 'etapas', 'unidadeResponsavel', 'responsavelValidacao', 'dataRevisao', 'canalAtendimento',
      'sistemaInicio', 'documentos', 'perguntasFrequentes', 'fontes', 'publicacao'],
  };

  // Serviço novo nasce com entradas.json vazio e arquivos.entradas no manifesto (Passo 4B1).
  return acrescentarEntradasAoEsqueleto({
    pasta,
    versaoId,
    entradaRegistro: {
      id, assuntoId, versaoAtualId: versaoId, versaoPublicadaId: null, arquivo: caminhos.service, statusValidacao: 'rascunho', publicado: false,
    },
    versao: criada.versao,
    arquivos: [
      { caminho: caminhos.versao ?? `${pasta}/versao.json`, tipo: 'json', conteudo: criada.versao },
      { caminho: caminhos.service, tipo: 'json', conteudo: service },
      { caminho: caminhos.roteiro, tipo: 'texto', conteudo: montarRoteiroInicial(nome) },
      { caminho: caminhos.documentos, tipo: 'json', conteudo: { ...cabecalho(id, 'nenhum documento cadastrado.'), documentos: [] } },
      { caminho: caminhos.perguntasFrequentes, tipo: 'json', conteudo: { ...cabecalho(id, 'nenhuma pergunta cadastrada.'), perguntas: [] } },
      { caminho: caminhos.fontes, tipo: 'json', conteudo: { ...cabecalho(id, 'nenhuma fonte cadastrada.'), fontes: [] } },
      { caminho: caminhos.conteudoAssistente, tipo: 'json', conteudo: { ...cabecalho(id, 'nenhum bloco cadastrado.'), blocos: [] } },
    ],
  }, id);
}

// ---------- Fontes (Passo 7E3A) ----------

export const CAMPOS_FONTE = Object.freeze(['revisao', 'id', 'titulo', 'tipo', 'orgaoResponsavel', 'url', 'descricao', 'origemOficial', 'dataPublicacao', 'dispositivoRelevante']);
const LIMITE_TITULO = 200;
const LIMITE_ORGAO = 120;
const LIMITE_URL = 500;
const LIMITE_DISPOSITIVO = 200;
export const PADRAO_REVISAO = /^[0-9a-f]{64}$/;
export const PARAMETRO_SECRETO = /^(token|access_token|api[_-]?key|key|senha|password|passwd|secret|auth|authorization|sessao|session)$/i;

/** URL aceitável: https, sem usuário e senha, sem parâmetro de credencial, sem e-mail nem telefone. Retorna a URL aparada ou null. */
function urlAceitavel(valor) {
  if (typeof valor !== 'string' || CONTROLE.test(valor)) return null;
  const t = valor.trim();
  if (t === '' || t.length > LIMITE_URL || /\s/.test(t) || PADRAO_EMAIL.test(t) || PADRAO_TELEFONE.test(t)) return null;
  if (!analisarUrl(t).ok) return null;
  const u = new URL(t);
  if (u.username !== '' || u.password !== '') return null;
  for (const nome of u.searchParams.keys()) if (PARAMETRO_SECRETO.test(nome)) return null;
  return t;
}

/** URL normalizada (a mesma regra do validador da base), para detectar repetição. */
export const urlNormalizada = (url) => {
  const r = analisarUrl(url);
  return r.ok ? r.normalizada : null;
};

/**
 * Valida o corpo do cadastro de fonte: revisao (hash de fontes.json lido antes), id, titulo, tipo, orgaoResponsavel, url,
 * descricao, origemOficial, e dataPublicacao e dispositivoRelevante opcionais. Status, publicação, data de consulta e
 * vigência NUNCA vêm do cliente: qualquer outro campo é recusado. Retorna { ok, dados } ou { ok: false, campos }.
 */
export function validarCorpoFonte(corpo) {
  if (!ehObjeto(corpo)) return { ok: false, campos: ['corpo'] };
  const campos = [];
  if (camposExtras(corpo, CAMPOS_FONTE)) campos.push('extras');
  if (typeof corpo.revisao !== 'string' || !PADRAO_REVISAO.test(corpo.revisao)) campos.push('revisao');
  if (!idAceitavel(corpo.id)) campos.push('id');
  const titulo = textoLivre(corpo.titulo, LIMITE_TITULO);
  if (titulo === null || contemCredencial(titulo)) campos.push('titulo');
  // texto_cadastrado só nasce pela entrada de texto (entradas.js); a rota de fonte-link não o aceita.
  if (typeof corpo.tipo !== 'string' || !TIPOS_FONTE.includes(corpo.tipo) || corpo.tipo === 'texto_cadastrado') campos.push('tipo');
  const orgao = textoLivre(corpo.orgaoResponsavel, LIMITE_ORGAO);
  if (orgao === null) campos.push('orgaoResponsavel');
  const url = urlAceitavel(corpo.url);
  if (url === null) campos.push('url');
  const descricao = textoLivre(corpo.descricao, LIMITE_DESCRICAO);
  if (descricao === null || contemCredencial(descricao)) campos.push('descricao');
  if (typeof corpo.origemOficial !== 'boolean') campos.push('origemOficial');

  let dataPublicacao = null;
  if (corpo.dataPublicacao !== undefined && corpo.dataPublicacao !== null && corpo.dataPublicacao !== '') {
    if (typeof corpo.dataPublicacao !== 'string' || !dataValida(corpo.dataPublicacao)) campos.push('dataPublicacao');
    else dataPublicacao = corpo.dataPublicacao;
  }
  let dispositivoRelevante = null;
  if (corpo.dispositivoRelevante !== undefined && corpo.dispositivoRelevante !== null && corpo.dispositivoRelevante !== '') {
    dispositivoRelevante = textoLivre(corpo.dispositivoRelevante, LIMITE_DISPOSITIVO);
    if (dispositivoRelevante === null) campos.push('dispositivoRelevante');
  }
  if (campos.length) return { ok: false, campos };
  return {
    ok: true,
    dados: { revisao: corpo.revisao, id: corpo.id, titulo, tipo: corpo.tipo, orgaoResponsavel: orgao, url, descricao, origemOficial: corpo.origemOficial, dataPublicacao, dispositivoRelevante },
  };
}

/**
 * Nova fonte: nunca validada nem publicada. Status, publicação, data de consulta (a data do servidor) e vigência são
 * definidos aqui: legislação nasce com vigência "a_confirmar"; os demais tipos, "nao_se_aplica". Origem oficial só
 * identifica a procedência; não significa que o conteúdo foi validado.
 */
export function montarFonte(dados, dataConsulta) {
  return {
    id: dados.id,
    titulo: dados.titulo,
    tipo: dados.tipo,
    orgaoResponsavel: dados.orgaoResponsavel,
    url: dados.url,
    descricao: dados.descricao,
    origemOficial: dados.origemOficial,
    statusValidacao: 'rascunho',
    publicado: false,
    dataPublicacao: dados.dataPublicacao,
    dataConsulta,
    dispositivoRelevante: dados.dispositivoRelevante,
    vigencia: { situacao: dados.tipo === 'legislacao' ? 'a_confirmar' : 'nao_se_aplica', normasRelacionadas: [], observacao: null },
  };
}
