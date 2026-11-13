// Ferramentas do servidor MCP local (Passo 2C1): listar_assuntos, listar_servicos, consultar_fontes e resumir_base.
// SOMENTE LEITURA. Toda leitura passa por leitura-segura.js. A saída usa só campos de uma lista permitida, repassa os
// status com o valor literal e o campo de origem, e preserva PENDENTE e null. Nada aqui decide validação ou publicação.
//
// Erros de ferramenta: { erro: '<codigo>' } de uma lista fechada, sem entrada recebida, caminho, pilha ou mensagem interna.

import { criarLeituraSegura } from './leitura-segura.js';
import { ARQUIVOS_DA_VERSAO, NOME_DO_MANIFESTO, caminhosDaVersao, pastaDaVersao } from '../../services/versao-atual.js';
import { ESTADOS_VERSAO } from '../../services/admin/fluxo.js';
import {
  PENDENTE,
  SITUACOES_VIGENCIA,
  STATUS_VALIDOS,
  TIPOS_FONTE,
  validarAssuntos,
  validarConteudoAssistente,
  validarDocumentos,
  validarFontes,
  validarPerguntas,
} from '../validate-services.js';
// Só constantes e validadores puros, que recebem objetos já lidos pela leitura segura. validate-services.js carrega,
// de forma transitiva, o módulo de versões da administração (versao.js, cujas funções não acessam disco): risco aceito e
// registrado no plano. Nenhuma função dele é chamada aqui.

export const AVISO =
  'Conteúdo em validação e não publicado. `statusValidacao: validado` em fonte significa conferência de metadados, não autorização de uso. `PENDENTE` significa ausente. Não usar para orientar o cidadão.';

export const CODIGOS_DE_ERRO = Object.freeze([
  'parametro_invalido',
  'assunto_nao_encontrado',
  'servico_nao_encontrado',
  'fonte_nao_encontrada',
  'versao_indisponivel',
  'base_indisponivel',
  'resposta_grande_demais',
]);

/** Códigos sanitizados que resumir_base pode devolver em `validacao.codigos`. */
export const CODIGOS_DO_RESUMO = Object.freeze(['base_com_erros_de_validacao', 'validacao_indisponivel']);

export const LIMITE_ITENS = 200;
export const LIMITE_TEXTO = 2000;
export const LIMITE_RESPOSTA = 256 * 1024;
export const TAMANHO_MAXIMO_ID = 60;
export const MARCA_DE_CORTE = ' [texto cortado pelo servidor MCP]';

const PADRAO_ID = /^[a-z][a-z0-9-]*$/;
const PADRAO_NOME_DE_CAMPO = /^[A-Za-z][A-Za-z0-9]{0,59}$/;
const ehObjeto = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const tem = (obj, chave) => Object.prototype.hasOwnProperty.call(obj, chave);

const ESQUEMA_ID = Object.freeze({ type: 'string', pattern: '^[a-z][a-z0-9-]*$', minLength: 1, maxLength: TAMANHO_MAXIMO_ID });

export const DEFINICOES = Object.freeze([
  {
    name: 'listar_assuntos',
    description:
      'Lista os assuntos de services/assuntos.json (somente leitura). Conteúdo em validação e não publicado; não usar para orientar o cidadão.',
    inputSchema: {
      type: 'object',
      properties: { ativo: { type: 'boolean', description: 'Filtra pelo valor literal do campo ativo.' } },
      additionalProperties: false,
    },
  },
  {
    name: 'listar_servicos',
    description:
      'Lista os serviços do registro com metadados da versão atual e status literais (registro.* e versao.estado), sem conteúdo material. Somente leitura.',
    inputSchema: {
      type: 'object',
      properties: { assuntoId: { ...ESQUEMA_ID, description: 'Id de um assunto existente em services/assuntos.json.' } },
      additionalProperties: false,
    },
  },
  {
    name: 'consultar_fontes',
    description:
      'Consulta os metadados das fontes da versão atual de um serviço. statusValidacao validado em fonte é conferência de metadados, não autorização de uso. Somente leitura; URLs nunca são acessadas.',
    inputSchema: {
      type: 'object',
      properties: {
        servicoId: { ...ESQUEMA_ID, description: 'Id de um serviço do registro.' },
        fonteId: { ...ESQUEMA_ID, description: 'Id de uma fonte da versão atual.' },
        tipo: { type: 'string', enum: [...TIPOS_FONTE] },
        statusValidacao: { type: 'string', enum: [...STATUS_VALIDOS] },
        situacaoVigencia: { type: 'string', enum: [...SITUACOES_VIGENCIA] },
      },
      required: ['servicoId'],
      additionalProperties: false,
    },
  },
  {
    name: 'resumir_base',
    description:
      'Resumo quantitativo da base (contagens e códigos sanitizados). Não devolve mensagens de validação; para detalhes, rodar npm run validate:services. Somente leitura.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
]);

// ---------- Auxiliares de saída ----------

/** Corta textos longos com marcação explícita (nunca corte silencioso). */
export function cortarTexto(valor) {
  if (typeof valor !== 'string' || valor.length <= LIMITE_TEXTO) return valor;
  let corte = valor.slice(0, LIMITE_TEXTO);
  const ultimo = corte.charCodeAt(corte.length - 1);
  if (ultimo >= 0xd800 && ultimo <= 0xdbff) corte = corte.slice(0, -1);
  return `${corte}${MARCA_DE_CORTE}`;
}

/** Repassa só valores escalares JSON (texto cortado se longo). Ausente vira null; objeto ou lista não é repassado. */
function escalar(valor) {
  if (valor === null || valor === undefined) return null;
  if (typeof valor === 'boolean') return valor;
  if (typeof valor === 'number') return Number.isFinite(valor) ? valor : null;
  if (typeof valor === 'string') return cortarTexto(valor);
  return null;
}

const campo = (obj, chave) => (ehObjeto(obj) && tem(obj, chave) ? escalar(obj[chave]) : null);

/** Lista de textos limitada: { total, truncado, itens }. */
function listaDeTextos(lista) {
  const textos = Array.isArray(lista) ? lista.filter((v) => typeof v === 'string') : [];
  return { total: textos.length, truncado: textos.length > LIMITE_ITENS, itens: textos.slice(0, LIMITE_ITENS).map(cortarTexto) };
}

/** URL só https://, devolvida como texto e nunca acessada. Outra coisa vira null. */
function urlHttps(valor) {
  if (typeof valor !== 'string' || valor.length > LIMITE_TEXTO) return null;
  try {
    return new URL(valor).protocol === 'https:' ? valor : null;
  } catch {
    return null;
  }
}

/** Caminhos dos campos de um objeto cujo valor é literalmente PENDENTE (ex.: "canalAtendimento.nome"). */
function caminhosPendentes(valor, prefixo = '', profundidade = 0, saida = []) {
  if (profundidade > 8) return saida;
  if (valor === PENDENTE && prefixo !== '') saida.push(prefixo);
  else if (Array.isArray(valor)) valor.forEach((v, i) => caminhosPendentes(v, `${prefixo}[${i}]`, profundidade + 1, saida));
  else if (ehObjeto(valor)) {
    for (const chave of Object.keys(valor)) {
      if (!PADRAO_NOME_DE_CAMPO.test(chave)) continue;
      caminhosPendentes(valor[chave], prefixo ? `${prefixo}.${chave}` : chave, profundidade + 1, saida);
    }
  }
  return saida;
}

/** Monta os dados de sucesso com o aviso fixo. O tamanho é conferido num único ponto (chamar). */
function concluir(dados) {
  return { isError: false, dados: { aviso: AVISO, ...dados } };
}

/** Resultado completo de tools/call: content (texto JSON) + structuredContent (+ isError quando houver erro). */
export function montarResultado({ isError, dados }) {
  const resultado = { content: [{ type: 'text', text: JSON.stringify(dados) }], structuredContent: dados };
  if (isError) resultado.isError = true;
  return resultado;
}

/** Tamanho, em bytes UTF-8, do resultado completo serializado. */
export const tamanhoDoResultado = (resultado) => Buffer.byteLength(JSON.stringify(resultado), 'utf8');

function falhar(codigo) {
  const erro = CODIGOS_DE_ERRO.includes(codigo) ? codigo : 'base_indisponivel';
  return { isError: true, dados: { aviso: AVISO, erro } };
}

// ---------- Validação de argumentos (sem acesso a disco) ----------

const idValido = (v) => typeof v === 'string' && v.length >= 1 && v.length <= TAMANHO_MAXIMO_ID && PADRAO_ID.test(v);
const enumValido = (lista) => (v) => typeof v === 'string' && lista.includes(v);

const REGRAS = Object.freeze({
  listar_assuntos: { obrigatorios: [], campos: { ativo: (v) => typeof v === 'boolean' } },
  listar_servicos: { obrigatorios: [], campos: { assuntoId: idValido } },
  consultar_fontes: {
    obrigatorios: ['servicoId'],
    campos: {
      servicoId: idValido,
      fonteId: idValido,
      tipo: enumValido(TIPOS_FONTE),
      statusValidacao: enumValido(STATUS_VALIDOS),
      situacaoVigencia: enumValido(SITUACOES_VIGENCIA),
    },
  },
  resumir_base: { obrigatorios: [], campos: {} },
});

/** Valida `arguments`. Retorna o objeto de argumentos (cópia só com chaves permitidas) ou null. */
export function validarArgumentos(nome, argumentos) {
  const regra = tem(REGRAS, nome) ? REGRAS[nome] : null;
  if (!regra) return null;
  if (argumentos === undefined) argumentos = {};
  if (!ehObjeto(argumentos)) return null;
  const prototipo = Object.getPrototypeOf(argumentos);
  if (prototipo !== Object.prototype && prototipo !== null) return null;
  const chaves = Object.keys(argumentos);
  const permitidas = Object.keys(regra.campos);
  if (!chaves.every((c) => permitidas.includes(c))) return null;
  if (!regra.obrigatorios.every((c) => chaves.includes(c))) return null;
  const limpos = {};
  for (const chave of chaves) {
    const valor = argumentos[chave];
    if (!regra.campos[chave](valor)) return null;
    limpos[chave] = valor;
  }
  return limpos;
}

// ---------- Ferramentas ----------

/**
 * Cria as ferramentas sobre uma raiz de projeto. `sistema` (opcional) troca o módulo de arquivos da leitura segura.
 * `limiteResposta` (opcional, padrão 256 KB) existe para os testes medirem o resultado sem o corte.
 * Retorna { listar(), chamar(nome, argumentos) }.
 */
export function criarFerramentas({ raiz, sistema, limiteResposta = LIMITE_RESPOSTA } = {}) {
  const leitura = criarLeituraSegura(sistema ? { raiz, sistema } : { raiz });

  function lerCatalogo(relativo, chave) {
    const r = leitura.lerJson(relativo);
    if (!r.ok || !ehObjeto(r.dados) || !Array.isArray(r.dados[chave])) return null;
    return r.dados;
  }

  /** Resolve a versão atual pelo registro. Caminhos declarados só são aceitos se iguais aos esperados. */
  function resolverVersao(entrada) {
    const id = entrada.id;
    const pasta = pastaDaVersao(id, entrada.versaoAtualId);
    if (!pasta) return null;
    const esperados = caminhosDaVersao(pasta);
    if (entrada.arquivo !== esperados.service) return null;
    const m = leitura.lerJson(`${pasta}/${NOME_DO_MANIFESTO}`);
    if (!m.ok || !ehObjeto(m.dados)) return null;
    const manifesto = m.dados;
    if (manifesto.id !== entrada.versaoAtualId || manifesto.servicoId !== id) return null;
    const declarados = manifesto.arquivos;
    const chaves = ehObjeto(declarados) ? Object.keys(declarados) : [];
    const coerente =
      chaves.length === Object.keys(esperados).length && Object.keys(esperados).every((c) => tem(declarados, c) && declarados[c] === esperados[c]);
    if (!coerente) return null;
    const s = leitura.lerJson(esperados.service);
    if (!s.ok || !ehObjeto(s.dados) || s.dados.id !== id) return null;
    const servico = s.dados;
    if (tem(servico, 'arquivos')) {
      const doServico = servico.arquivos;
      if (!ehObjeto(doServico)) return null;
      for (const chave of Object.keys(doServico)) {
        if (chave === 'service' || !tem(ARQUIVOS_DA_VERSAO, chave) || doServico[chave] !== esperados[chave]) return null;
      }
    }
    return { pasta, manifesto, servico, arquivos: esperados };
  }

  const entradasValidas = (registro) => registro.servicos.filter((e) => ehObjeto(e) && idValido(e.id));

  function listarAssuntos({ ativo }) {
    const doc = lerCatalogo('services/assuntos.json', 'assuntos');
    if (!doc) return falhar('base_indisponivel');
    const registro = lerCatalogo('services/registry.json', 'servicos');
    if (!registro) return falhar('base_indisponivel');
    const validacao = validarAssuntos(doc);
    const todos = doc.assuntos.filter(ehObjeto).filter((a) => ativo === undefined || a.ativo === ativo);
    const assuntos = todos.slice(0, LIMITE_ITENS).map((a) => ({
      id: campo(a, 'id'),
      nome: campo(a, 'nome'),
      descricao: campo(a, 'descricao'),
      ativo: campo(a, 'ativo'),
      criadoEm: campo(a, 'criadoEm'),
      atualizadoEm: campo(a, 'atualizadoEm'),
      totalServicos: registro.servicos.filter((e) => ehObjeto(e) && typeof a.id === 'string' && e.assuntoId === a.id).length,
    }));
    return concluir({
      total: todos.length,
      truncado: todos.length > LIMITE_ITENS,
      consistente: validacao.erros.length === 0,
      totalErros: validacao.erros.length,
      assuntos,
    });
  }

  function itemDeServico(entrada) {
    const v = resolverVersao(entrada);
    if (!v) return { id: entrada.id, erro: 'versao_indisponivel' };
    const { manifesto, servico } = v;
    return {
      id: entrada.id,
      assuntoId: campo(entrada, 'assuntoId'),
      nome: campo(servico, 'nome'),
      sigla: campo(servico, 'sigla'),
      categoria: campo(servico, 'categoria'),
      registro: {
        statusValidacao: campo(entrada, 'statusValidacao'),
        publicado: campo(entrada, 'publicado'),
        versaoPublicadaId: campo(entrada, 'versaoPublicadaId'),
      },
      versao: {
        id: campo(manifesto, 'id'),
        numero: campo(manifesto, 'numero'),
        estado: campo(manifesto, 'estado'),
        baseadaEm: campo(manifesto, 'baseadaEm'),
        criadoEm: campo(manifesto, 'criadoEm'),
        enviadaEm: campo(manifesto, 'enviadaEm'),
        temHash: typeof manifesto.hashConteudo === 'string' && manifesto.hashConteudo !== '',
      },
      pendencias: listaDeTextos(servico.pendencias),
      camposPendentes: listaDeTextos(caminhosPendentes(servico)),
      coerente: entrada.statusValidacao === servico.statusValidacao && entrada.publicado === servico.publicado,
    };
  }

  function listarServicos({ assuntoId }) {
    if (assuntoId !== undefined) {
      const assuntos = lerCatalogo('services/assuntos.json', 'assuntos');
      if (!assuntos) return falhar('base_indisponivel');
      if (!assuntos.assuntos.some((a) => ehObjeto(a) && a.id === assuntoId)) return falhar('assunto_nao_encontrado');
    }
    const registro = lerCatalogo('services/registry.json', 'servicos');
    if (!registro) return falhar('base_indisponivel');
    const todos = registro.servicos
      .filter(ehObjeto)
      .filter((e) => assuntoId === undefined || e.assuntoId === assuntoId);
    const servicos = todos.slice(0, LIMITE_ITENS).map((e) => (idValido(e.id) ? itemDeServico(e) : { id: null, erro: 'versao_indisponivel' }));
    return concluir({ total: todos.length, truncado: todos.length > LIMITE_ITENS, servicos });
  }

  function citacoes(servico, fonteId) {
    const citada = [];
    for (const chave of ['links', 'legislacao']) {
      if (Array.isArray(servico[chave]) && servico[chave].includes(fonteId)) citada.push(chave);
    }
    if (ehObjeto(servico.referencias)) {
      for (const chave of Object.keys(servico.referencias)) {
        const ids = servico.referencias[chave];
        if (PADRAO_NOME_DE_CAMPO.test(chave) && Array.isArray(ids) && ids.includes(fonteId)) citada.push(`referencias.${chave}`);
      }
    }
    return citada.slice(0, LIMITE_ITENS);
  }

  function itemDeFonte(fonte, servico) {
    const vigencia = ehObjeto(fonte.vigencia) ? fonte.vigencia : {};
    const normas = Array.isArray(vigencia.normasRelacionadas) ? vigencia.normasRelacionadas.filter((n) => typeof n === 'string') : [];
    const item = {
      id: campo(fonte, 'id'),
      titulo: campo(fonte, 'titulo'),
      tipo: campo(fonte, 'tipo'),
      orgaoResponsavel: campo(fonte, 'orgaoResponsavel'),
      url: urlHttps(fonte.url),
      origemOficial: campo(fonte, 'origemOficial'),
      statusValidacao: campo(fonte, 'statusValidacao'),
      publicado: campo(fonte, 'publicado'),
      dataPublicacao: campo(fonte, 'dataPublicacao'),
      dataConsulta: campo(fonte, 'dataConsulta'),
      vigencia: {
        situacao: campo(vigencia, 'situacao'),
        normasRelacionadas: normas.slice(0, LIMITE_ITENS).map(cortarTexto),
      },
      citadaEm: typeof fonte.id === 'string' ? citacoes(servico, fonte.id) : [],
    };
    if (normas.length > LIMITE_ITENS) item.vigencia.normasRelacionadasTruncado = true;
    return item;
  }

  function consultarFontes({ servicoId, fonteId, tipo, statusValidacao, situacaoVigencia }) {
    const registro = lerCatalogo('services/registry.json', 'servicos');
    if (!registro) return falhar('base_indisponivel');
    const entrada = entradasValidas(registro).find((e) => e.id === servicoId);
    if (!entrada) return falhar('servico_nao_encontrado');
    const v = resolverVersao(entrada);
    if (!v) return falhar('versao_indisponivel');
    const r = leitura.lerJson(v.arquivos.fontes);
    if (!r.ok || !ehObjeto(r.dados) || !Array.isArray(r.dados.fontes)) return falhar('versao_indisponivel');
    const doc = r.dados;
    let fontes = doc.fontes.filter(ehObjeto);
    if (fonteId !== undefined) {
      fontes = fontes.filter((f) => f.id === fonteId);
      if (fontes.length === 0) return falhar('fonte_nao_encontrada');
    }
    if (tipo !== undefined) fontes = fontes.filter((f) => f.tipo === tipo);
    if (statusValidacao !== undefined) fontes = fontes.filter((f) => f.statusValidacao === statusValidacao);
    if (situacaoVigencia !== undefined) fontes = fontes.filter((f) => ehObjeto(f.vigencia) && f.vigencia.situacao === situacaoVigencia);
    return concluir({
      servicoId: entrada.id,
      versaoId: campo(v.manifesto, 'id'),
      versao: { estado: campo(v.manifesto, 'estado') },
      statusValidacaoArquivo: campo(doc, 'statusValidacao'),
      pendencia: campo(doc, 'pendencia'),
      total: fontes.length,
      truncado: fontes.length > LIMITE_ITENS,
      consistente: validarFontes(doc).length === 0,
      fontes: fontes.slice(0, LIMITE_ITENS).map((f) => itemDeFonte(f, v.servico)),
    });
  }

  const contador = (chaves) => Object.fromEntries([...chaves.map((c) => [c, 0]), ['outros', 0]]);
  const contar = (mapa, valor) => {
    if (typeof valor === 'string' && valor !== 'outros' && tem(mapa, valor)) mapa[valor] += 1;
    else mapa.outros += 1;
  };


  function resumirBase() {
    const assuntosDoc = lerCatalogo('services/assuntos.json', 'assuntos');
    const registro = lerCatalogo('services/registry.json', 'servicos');
    if (!assuntosDoc || !registro) return falhar('base_indisponivel');
    const assuntos = assuntosDoc.assuntos.filter(ehObjeto);
    const entradas = registro.servicos.filter(ehObjeto);

    const servicos = { total: entradas.length, porStatusValidacao: contador(STATUS_VALIDOS), publicados: 0 };
    const versoes = { porEstado: contador(ESTADOS_VERSAO), versoesPublicadas: 0 };
    const fontes = { total: 0, porStatusValidacao: contador(STATUS_VALIDOS), publicadas: 0, naoPublicadas: 0, porSituacaoVigencia: contador(SITUACOES_VIGENCIA) };
    const documentos = { total: 0, publicados: 0 };
    const perguntas = { total: 0, publicados: 0 };
    const blocosAssistente = { total: 0, publicados: 0 };
    let camposPendentes = 0;

    // Validação calculada só com validadores puros sobre objetos lidos pela leitura segura; as mensagens deles nunca são
    // repassadas. Qualquer leitura que falhe (ausente, link, fora de services/, grande demais, JSON inválido) torna a
    // validação indisponível, sempre com a mesma resposta: não revela existência, caminho nem conteúdo.
    let leituraFalhou = false;
    let totalErros = validarAssuntos(assuntosDoc).erros.length;

    const lerLista = (relativo, chave) => {
      const r = leitura.lerJson(relativo);
      if (!r.ok || !ehObjeto(r.dados) || !Array.isArray(r.dados[chave])) {
        leituraFalhou = true;
        return null;
      }
      return r.dados;
    };
    const somar = (doc, chave, destino) => {
      const itens = doc[chave].filter(ehObjeto);
      destino.total += itens.length;
      destino.publicados += itens.filter((i) => i.publicado === true).length;
    };

    for (const entrada of entradas) {
      contar(servicos.porStatusValidacao, entrada.statusValidacao);
      if (entrada.publicado === true) servicos.publicados += 1;
      if (entrada.versaoPublicadaId !== null && entrada.versaoPublicadaId !== undefined) versoes.versoesPublicadas += 1;
      const v = idValido(entrada.id) ? resolverVersao(entrada) : null;
      if (!v) {
        leituraFalhou = true;
        continue;
      }
      contar(versoes.porEstado, v.manifesto.estado);
      camposPendentes += caminhosPendentes(v.servico).length;
      if (entrada.statusValidacao !== v.servico.statusValidacao) totalErros += 1;
      if (entrada.publicado !== v.servico.publicado) totalErros += 1;

      const fontesPorId = new Map();
      const docFontes = lerLista(v.arquivos.fontes, 'fontes');
      if (docFontes) {
        totalErros += validarFontes(docFontes).length;
        for (const f of docFontes.fontes.filter(ehObjeto)) {
          fontesPorId.set(f.id, f);
          fontes.total += 1;
          contar(fontes.porStatusValidacao, f.statusValidacao);
          if (f.publicado === true) fontes.publicadas += 1;
          else fontes.naoPublicadas += 1;
          contar(fontes.porSituacaoVigencia, ehObjeto(f.vigencia) ? f.vigencia.situacao : undefined);
        }
      }
      const opcoes = { idServico: entrada.id, fontesPorId };
      const docDocumentos = lerLista(v.arquivos.documentos, 'documentos');
      if (docDocumentos) {
        somar(docDocumentos, 'documentos', documentos);
        totalErros += validarDocumentos(docDocumentos, opcoes).length;
      }
      const docPerguntas = lerLista(v.arquivos.perguntasFrequentes, 'perguntas');
      if (docPerguntas) {
        somar(docPerguntas, 'perguntas', perguntas);
        totalErros += validarPerguntas(docPerguntas, opcoes).length;
      }
      const docConteudo = lerLista(v.arquivos.conteudoAssistente, 'blocos');
      if (docConteudo) {
        somar(docConteudo, 'blocos', blocosAssistente);
        totalErros += validarConteudoAssistente(docConteudo, opcoes).length;
      }
    }

    const validacao = leituraFalhou
      ? { ok: null, totalErros: null, codigos: ['validacao_indisponivel'] }
      : { ok: totalErros === 0, totalErros, codigos: totalErros > 0 ? ['base_com_erros_de_validacao'] : [] };

    return concluir({
      assuntos: {
        total: assuntos.length,
        ativos: assuntos.filter((a) => a.ativo === true).length,
        inativos: assuntos.filter((a) => a.ativo === false).length,
      },
      servicos,
      versoes,
      fontes,
      documentos,
      perguntas,
      blocosAssistente,
      camposPendentes,
      validacao,
    });
  }

  const EXECUTORES = new Map([
    ['listar_assuntos', listarAssuntos],
    ['listar_servicos', listarServicos],
    ['consultar_fontes', consultarFontes],
    ['resumir_base', resumirBase],
  ]);

  return Object.freeze({
    listar: () => DEFINICOES.map((d) => JSON.parse(JSON.stringify(d))),
    /**
     * Retorna { desconhecida: true } ou { isError, dados, resultado }. Ponto central do limite de 256 KB: mede o
     * resultado completo de tools/call (content + structuredContent + isError) e o troca por resposta_grande_demais se
     * exceder. Nunca lança exceção para o chamador.
     */
    chamar(nome, argumentos) {
      if (typeof nome !== 'string' || !EXECUTORES.has(nome)) return { desconhecida: true };
      let r;
      const limpos = validarArgumentos(nome, argumentos);
      if (!limpos) r = falhar('parametro_invalido');
      else {
        try {
          r = EXECUTORES.get(nome)(limpos);
        } catch {
          r = falhar('base_indisponivel');
        }
      }
      let resultado = montarResultado(r);
      if (tamanhoDoResultado(resultado) > limiteResposta) {
        r = falhar('resposta_grande_demais');
        resultado = montarResultado(r);
      }
      return { isError: r.isError, dados: r.dados, resultado };
    },
  });
}
