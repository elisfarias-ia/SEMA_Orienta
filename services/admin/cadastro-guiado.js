// Cadastro guiado da base (Sprint 4, Passo 4A1): validação e preparação PURAS de uma única operação que junta assunto,
// serviço e fontes. Não lê nem grava arquivos, não usa relógio, variáveis de ambiente nem aleatoriedade: a data e o estado
// atual da base chegam por parâmetro e nada recebido é modificado. O resultado é um PLANO de alterações (passos de gravação)
// que o endpoint, em passo posterior, entrega à transação já existente (acrescentando o `validar` de cada arquivo, por caminho).
//
// Não há segunda lógica de cadastro: as regras de assunto, serviço e fonte são as de cadastro.js (validarCorpoAssunto,
// validarCorpoServico, validarCorpoFonte, gerarId, montarAssunto, montarEsqueletoServico, montarFonte). O cliente NÃO envia ids: o servidor gera
// os ids (a partir do nome ou do título). Só com serviço existente o cliente envia `revisao` (revisão otimista do fontes.json, como na rota de fontes).
//
// Combinações aceitas:
//   assunto existente + serviço existente + fontes  (acrescenta fontes ao fontes.json da versão atual, que deve ser rascunho)
//   assunto existente + serviço novo      + fontes  (cria o serviço, versão 1 em rascunho, já com as fontes)
//   assunto novo      + serviço novo      + fontes  (cria também o assunto)
// Recusada: assunto novo + serviço existente.

import {
  CAMPOS_FONTE, IDS_RESERVADOS, PADRAO_ID, PADRAO_REVISAO, gerarId, montarAssunto, montarEsqueletoServico, montarFonte, normalizarNome, urlNormalizada,
  validarCorpoAssunto, validarCorpoFonte, validarCorpoServico, PENDENTE,
} from './cadastro.js';
import { hashConteudo } from './hash.js';
import { LIMITES_CONHECIMENTO, dataValida } from '../../scripts/validate-services.js';

// `revisao` só vale com serviço existente (hash do fontes.json lido pelo cliente, a mesma revisão otimista da rota de fontes).
export const CAMPOS_PEDIDO = Object.freeze(['assunto', 'servico', 'fontes', 'revisao']);
export const CAMPOS_FONTE_GUIADA = Object.freeze(CAMPOS_FONTE.filter((c) => c !== 'id' && c !== 'revisao'));
// Mínimo de 1 fonte. Máximo de 10: os esquemas não limitam o vetor de fontes; o teto é o mesmo de um bloco de conhecimento
// (LIMITES_CONHECIMENTO.fontes), para que todas as fontes cadastradas possam ser citadas por uma informação.
export const MINIMO_FONTES = 1;
export const MAXIMO_FONTES = LIMITES_CONHECIMENTO.fontes;
export const COMBINACOES = Object.freeze({
  EXISTENTE_EXISTENTE: 'assunto_existente_servico_existente',
  EXISTENTE_NOVO: 'assunto_existente_servico_novo',
  NOVO_NOVO: 'assunto_novo_servico_novo',
});

const ehObjeto = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const temExtras = (obj, permitidos) => Object.keys(obj).some((k) => !permitidos.includes(k));
const invalido = (campos) => ({ ok: false, status: 422, erro: 'dados_invalidos', campos });
const combinacaoInvalida = (campos) => ({ ok: false, status: 422, erro: 'combinacao_invalida', campos });
const jaExiste = (campo) => ({ ok: false, status: 409, erro: 'ja_existe', campo });
const naoEncontrado = (campo) => ({ ok: false, status: 404, erro: 'nao_encontrado', campo });
const prefixar = (prefixo, campos) => campos.map((c) => (c === 'extras' || c === 'corpo' ? prefixo : `${prefixo}.${c}`));

const LIMITE_ID = 60;
/** Referência a registro existente: somente { id } com id no formato de id do sistema (nunca caminho). Retorna o id ou null. */
const referenciaExistente = (v) => (ehObjeto(v) && Object.keys(v).length === 1 && typeof v.id === 'string' && v.id.length <= LIMITE_ID && PADRAO_ID.test(v.id) ? v.id : null);
const ehNovo = (v) => ehObjeto(v) && !Object.hasOwn(v, 'id');

/**
 * Valida a ESTRUTURA do pedido, sem consultar a base. Retorna { ok: true, dados } com a combinação, as partes normalizadas
 * e as fontes ainda sem id, ou { ok: false, status, erro, campos } (somente nomes de campos, nunca os valores enviados).
 */
export function validarPedidoGuiado(corpo) {
  if (!ehObjeto(corpo)) return invalido(['corpo']);
  const campos = [];
  if (temExtras(corpo, CAMPOS_PEDIDO)) campos.push('extras');

  const assuntoExistente = referenciaExistente(corpo.assunto);
  const servicoExistente = referenciaExistente(corpo.servico);
  const assuntoNovo = ehNovo(corpo.assunto);
  const servicoNovo = ehNovo(corpo.servico);

  if (assuntoNovo && servicoExistente !== null) return combinacaoInvalida(['servico']);
  if (assuntoExistente === null && !assuntoNovo) campos.push('assunto');
  if (servicoExistente === null && !servicoNovo) campos.push('servico');

  let assunto = null;
  if (assuntoNovo) {
    const r = validarCorpoAssunto(corpo.assunto);
    if (r.ok) assunto = r.dados;
    else campos.push(...prefixar('assunto', r.campos));
  }
  let servico = null;
  if (servicoNovo) {
    // O assuntoId do serviço não vem do cliente: é o do assunto escolhido ou o gerado; aqui entra só um marcador válido.
    const r = validarCorpoServico({ ...corpo.servico, assuntoId: assuntoExistente ?? 'marcador' });
    if (r.ok) servico = r.dados;
    else campos.push(...prefixar('servico', r.campos.filter((c) => c !== 'assuntoId')));
  }
  // Um serviço enviado com assuntoId próprio é campo extra do fluxo guiado (o assuntoId do serviço é derivado do assunto).
  if (servicoNovo && Object.hasOwn(corpo.servico, 'assuntoId')) campos.push('servico');

  // Revisão: obrigatória e no formato de hash somente com serviço existente; recusada com serviço novo.
  if (servicoExistente !== null && !(typeof corpo.revisao === 'string' && PADRAO_REVISAO.test(corpo.revisao))) campos.push('revisao');
  if (servicoNovo && Object.hasOwn(corpo, 'revisao')) campos.push('revisao');

  const fontes = [];
  if (!Array.isArray(corpo.fontes) || corpo.fontes.length < MINIMO_FONTES || corpo.fontes.length > MAXIMO_FONTES) {
    campos.push('fontes');
  } else {
    corpo.fontes.forEach((f, i) => {
      if (!ehObjeto(f) || temExtras(f, CAMPOS_FONTE_GUIADA)) {
        campos.push(`fontes[${i}]`);
        return;
      }
      fontes.push(f);
    });
  }
  if (campos.length) return invalido([...new Set(campos)]);

  const combinacao = assuntoExistente !== null
    ? (servicoExistente !== null ? COMBINACOES.EXISTENTE_EXISTENTE : COMBINACOES.EXISTENTE_NOVO)
    : COMBINACOES.NOVO_NOVO;
  return {
    ok: true,
    dados: { combinacao, assuntoId: assuntoExistente, servicoId: servicoExistente, revisao: servicoExistente !== null ? corpo.revisao : null, assunto, servico, fontes },
  };
}

/**
 * Valida cada fonte com a validação existente (validarCorpoFonte) e monta o id de cada uma no servidor. `revisao` e os ids
 * entram no corpo apenas aqui, gerados pelo servidor. Detecta URL repetida dentro do pedido e contra as fontes existentes.
 * Retorna { ok: true, itens: [{ dados, id }] } ou { ok: false, ... }.
 */
function prepararFontes(fontes, { revisao, fontesExistentes }) {
  const ids = new Set(fontesExistentes.map((f) => f.id));
  const urls = new Set(fontesExistentes.map((f) => urlNormalizada(f.url)));
  const itens = [];
  const campos = [];
  fontes.forEach((f, i) => {
    const id = typeof f.titulo === 'string' ? gerarId(f.titulo, ids) : null;
    if (id === null) {
      campos.push(`fontes[${i}].titulo`);
      return;
    }
    const r = validarCorpoFonte({ ...f, id, revisao });
    if (!r.ok) {
      campos.push(...r.campos.filter((c) => c !== 'id' && c !== 'revisao').map((c) => `fontes[${i}].${c}`));
      return;
    }
    itens.push({ dados: r.dados, id, indice: i });
    ids.add(id);
  });
  if (campos.length) return invalido(campos);
  for (const { dados, indice } of itens) {
    const normalizada = urlNormalizada(dados.url);
    if (urls.has(normalizada)) return jaExiste(`fontes[${indice}].url`);
    urls.add(normalizada);
  }
  return { ok: true, itens };
}

/**
 * Prepara o plano de alterações a partir do pedido já estruturado (validarPedidoGuiado) e do estado da base:
 *   contexto.data         AAAA-MM-DD (data do servidor);
 *   contexto.documentoAssuntos  conteúdo atual de services/assuntos.json (contexto.assuntos é a lista dentro dele);
 *   contexto.assuntos     lista de assuntos;
 *   contexto.servicos     [{ id, assuntoId, nome }] do registro (nome do service.json da versão atual);
 *   contexto.idsOcupados  nomes de pasta já existentes em services/ (além dos ids do registro e dos reservados);
 *   contexto.registro     conteúdo atual de services/registry.json;
 *   contexto.servico      só com serviço existente: { id, assuntoId, versaoAtualId, estadoVersao, caminhoFontes, documentoFontes }.
 * Retorna { ok: true, plano } ou { ok: false, status, erro, campos | campo }.
 */
export function prepararCadastroGuiado(dados, contexto) {
  if (!contexto || typeof contexto.data !== 'string' || !dataValida(contexto.data)) throw new Error('contexto_invalido');
  const { combinacao } = dados;
  const assuntos = contexto.assuntos;
  const servicosAtuais = contexto.servicos;

  // 1) Assunto.
  let assunto;
  let assuntoCriado = false;
  if (dados.assuntoId !== null) {
    assunto = assuntos.find((a) => a.id === dados.assuntoId);
    if (!assunto) return naoEncontrado('assunto');
    if (assunto.ativo !== true) return invalido(['assunto']);
    // O nome volta na resposta: base inconsistente (sem nome legível) falha de forma genérica, sem gravar.
    if (typeof assunto.nome !== 'string' || assunto.nome.trim() === '') return { ok: false, status: 500, erro: 'indisponivel' };
  } else {
    const nome = normalizarNome(dados.assunto.nome);
    if (assuntos.some((a) => normalizarNome(a.nome) === nome)) return jaExiste('assunto.nome');
    const id = gerarId(dados.assunto.nome, new Set(assuntos.map((a) => a.id)));
    if (id === null) return invalido(['assunto.nome']);
    assunto = montarAssunto({ id, nome: dados.assunto.nome, descricao: dados.assunto.descricao }, contexto.data);
    assuntoCriado = true;
  }

  // 2) Serviço: existente (versão atual em rascunho e do mesmo assunto) ou novo (nome livre; id gerado).
  let existente = null;
  let nomeExistente = null;
  let servicoNovo = null;
  if (combinacao === COMBINACOES.EXISTENTE_EXISTENTE) {
    existente = contexto.servico;
    const registrado = servicosAtuais.find((s) => s.id === dados.servicoId);
    if (!registrado || !existente || existente.id !== dados.servicoId) return naoEncontrado('servico');
    if (registrado.assuntoId !== assunto.id) return combinacaoInvalida(['servico']);
    nomeExistente = registrado.nome;
    if (existente.estadoVersao !== 'rascunho') return { ok: false, status: 409, erro: 'versao_nao_editavel' };
    // O nome volta na resposta: se não puder ser obtido de uma base válida, falha de forma genérica, sem gravar.
    if (typeof registrado.nome !== 'string' || registrado.nome.trim() === '') return { ok: false, status: 500, erro: 'indisponivel' };
    // Revisão otimista, com a mesma regra da rota de fontes: o hash atual do arquivo deve ser o que o cliente leu.
    if (hashConteudo(existente.documentoFontes) !== dados.revisao) return { ok: false, status: 409, erro: 'revisao_divergente' };
  } else {
    const nome = normalizarNome(dados.servico.nome);
    if (servicosAtuais.some((s) => normalizarNome(s.nome) === nome)) return jaExiste('servico.nome');
    const ocupados = new Set([...servicosAtuais.map((s) => s.id), ...contexto.idsOcupados, ...IDS_RESERVADOS]);
    const id = gerarId(dados.servico.nome, ocupados);
    if (id === null) return invalido(['servico.nome']);
    servicoNovo = { ...dados.servico, assuntoId: assunto.id, id };
  }

  // 3) Fontes: validação existente, com revisão e ids gerados aqui.
  const esqueleto = servicoNovo ? montarEsqueletoServico(servicoNovo, assunto, contexto.data) : null;
  const arquivoFontes = esqueleto ? esqueleto.arquivos.find((a) => a.caminho.endsWith('/fontes.json')) : null;
  const caminhoFontes = existente ? existente.caminhoFontes : arquivoFontes.caminho;
  const documentoFontes = existente ? existente.documentoFontes : arquivoFontes.conteudo;
  const preparadas = prepararFontes(dados.fontes, { revisao: hashConteudo(documentoFontes), fontesExistentes: documentoFontes.fontes });
  if (!preparadas.ok) return preparadas;
  const fontes = preparadas.itens.map(({ dados: d, id }) => montarFonte({ ...d, id }, contexto.data));
  const documentoNovo = {
    ...documentoFontes,
    fontes: [...documentoFontes.fontes, ...fontes],
    ...(existente ? {} : { pendencia: `${PENDENTE}: fontes em rascunho, ainda não validadas.` }),
  };

  // 4) Plano, na ordem de gravação: assunto, arquivos do serviço (o registro por último, pois é ele que torna o serviço visível).
  const passos = [];
  if (assuntoCriado) {
    passos.push({ caminho: 'services/assuntos.json', tipo: 'json', conteudo: { ...contexto.documentoAssuntos, assuntos: [...assuntos, assunto] }, novo: false });
  }
  if (existente) {
    passos.push({ caminho: caminhoFontes, tipo: 'json', conteudo: documentoNovo, novo: false });
  } else {
    for (const a of esqueleto.arquivos) {
      passos.push({ caminho: a.caminho, tipo: a.tipo, conteudo: a.caminho === caminhoFontes ? documentoNovo : a.conteudo, novo: true });
    }
    passos.push({ caminho: 'services/registry.json', tipo: 'json', conteudo: { ...contexto.registro, servicos: [...contexto.registro.servicos, esqueleto.entradaRegistro] }, novo: false });
  }

  const servicoId = existente ? existente.id : servicoNovo.id;
  return {
    ok: true,
    plano: {
      combinacao,
      passos,
      resposta: {
        assunto: { id: assunto.id, nome: assunto.nome, criado: assuntoCriado },
        servico: {
          id: servicoId,
          nome: existente ? nomeExistente : servicoNovo.nome,
          criado: !existente,
          versaoAtualId: existente ? existente.versaoAtualId : esqueleto.versaoId,
        },
        fontes: fontes.map((f) => ({ id: f.id, titulo: f.titulo })),
        ...(existente ? { revisao: hashConteudo(documentoNovo) } : {}),
        proximo: { servicoId },
      },
    },
  };
}
