// Cadastro administrativo de assunto e serviço (Marco 7, Passo 7E1): funções PURAS. Não leem arquivos, não usam
// relógio, variáveis de ambiente nem aleatoriedade: a data vem de fora e nada recebido é modificado.
//
// Um serviço novo nasce SEMPRE como versão 1 em rascunho, não publicada, sem hash, decisão, responsável nem autorização,
// com todo o conteúdo material PENDENTE. Nenhum conteúdo ambiental é inventado: só o que a pessoa informou (id, nome,
// sigla e termos equivalentes) entra no esqueleto.

import { criarVersao } from './versao.js';
import { caminhosDaVersao } from '../versao-atual.js';

export const PADRAO_ID = /^[a-z][a-z0-9-]*$/;
export const LIMITE_CORPO = 32 * 1024;
export const CAMPOS_ASSUNTO = Object.freeze(['id', 'nome', 'descricao']);
export const CAMPOS_SERVICO = Object.freeze(['id', 'assuntoId', 'nome', 'sigla', 'termosEquivalentes']);
export const SECOES_ROTEIRO = Object.freeze(['Descrição do serviço', 'Quem pode solicitar', 'Condições', 'Etapas', 'Onde iniciar', 'Observações', 'Fontes']);
export const PENDENTE = 'PENDENTE';

const LIMITE_ID = 60;
const LIMITE_NOME = 120;
const LIMITE_DESCRICAO = 1000;
const LIMITE_TERMOS = 20;
const PADRAO_SIGLA = /^[\p{L}\p{N}][\p{L}\p{N} ./-]{0,19}$/u;
const CONTROLE = /[\u0000-\u001f\u007f]/;
const PADRAO_EMAIL = /[\w.+-]+@[\w-]+(\.[\w-]+)+/;
const PADRAO_TELEFONE = /(\(\d{2}\)|\b\d{2})\s?\d{4,5}[-\s]?\d{4}\b/;

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

/** Texto livre aceitável: string, sem caracteres de controle, sem e-mail nem telefone e dentro do limite. Retorna o texto aparado ou null. */
function textoLivre(valor, limite) {
  if (typeof valor !== 'string' || CONTROLE.test(valor)) return null;
  const t = valor.trim().replace(/ {2,}/g, ' ');
  if (t === '' || t.length > limite || PADRAO_EMAIL.test(t) || PADRAO_TELEFONE.test(t)) return null;
  return t;
}
const idAceitavel = (v) => typeof v === 'string' && v.length <= LIMITE_ID && PADRAO_ID.test(v);

/** Campos do corpo que não fazem parte do conjunto permitido (a contagem não repete o conteúdo enviado). */
function camposExtras(corpo, permitidos) {
  return Object.keys(corpo).some((k) => !permitidos.includes(k));
}

/**
 * Valida o corpo do cadastro de assunto: somente id, nome e descricao. Retorna { ok: true, dados } ou
 * { ok: false, campos } com os NOMES dos campos inválidos (nunca os valores enviados).
 */
export function validarCorpoAssunto(corpo) {
  if (!ehObjeto(corpo)) return { ok: false, campos: ['corpo'] };
  const campos = [];
  if (camposExtras(corpo, CAMPOS_ASSUNTO)) campos.push('extras');
  const id = corpo.id;
  const nome = textoLivre(corpo.nome, LIMITE_NOME);
  const descricao = textoLivre(corpo.descricao, LIMITE_DESCRICAO);
  if (!idAceitavel(id)) campos.push('id');
  if (nome === null) campos.push('nome');
  if (descricao === null) campos.push('descricao');
  return campos.length ? { ok: false, campos } : { ok: true, dados: { id, nome, descricao } };
}

/**
 * Valida o corpo do cadastro de serviço: id, assuntoId, nome, termosEquivalentes e sigla opcional.
 * Sem sigla, o serviço recebe PENDENTE.
 */
export function validarCorpoServico(corpo) {
  if (!ehObjeto(corpo)) return { ok: false, campos: ['corpo'] };
  const campos = [];
  if (camposExtras(corpo, CAMPOS_SERVICO)) campos.push('extras');
  if (!idAceitavel(corpo.id)) campos.push('id');
  if (!idAceitavel(corpo.assuntoId)) campos.push('assuntoId');
  const nome = textoLivre(corpo.nome, LIMITE_NOME);
  if (nome === null) campos.push('nome');

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
  return campos.length ? { ok: false, campos } : { ok: true, dados: { id: corpo.id, assuntoId: corpo.assuntoId, nome, sigla, termosEquivalentes: termos } };
}

/** Novo assunto: sempre ativo, com as datas informadas (geradas pelo servidor). */
export function montarAssunto({ id, nome, descricao }, data) {
  return { id, nome, descricao, ativo: true, criadoEm: data, atualizadoEm: data };
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

  return {
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
  };
}
