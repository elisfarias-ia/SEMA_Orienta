// Reconhecimento de intenção e montagem da resposta do assistente. Funções puras, sem rede, sem DOM e sem IA externa.
// A pergunta é processada SOMENTE no navegador e nunca é enviada a nenhum servidor.
//
// Regra central: todo texto sobre a LAC vem, palavra por palavra, dos blocos recebidos em `conteudo`
// (quando houver). O código só acrescenta uma pergunta de esclarecimento neutra e a mensagem de indisponibilidade.
// Sem conteúdo, a resposta é sempre a mensagem segura de indisponibilidade.

import { RESPOSTA_TEMPORARIA } from './chat.js';

export const PERGUNTA_ESCLARECIMENTO =
  'Sobre a LAC, você quer saber o que ela é, como solicitar ou onde está o link oficial?';

const TIPOS_DE_BLOCO = ['limitacao', 'descricao', 'sequencia', 'link', 'sem_conteudo'];

const ehObjeto = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/** Minúsculas, sem acentos e sem pontuação, para comparar com palavras equivalentes. */
export function normalizar(texto) {
  return String(texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// Palavras equivalentes de cada intenção (aplicadas ao texto já normalizado).
const REGRAS = {
  conceito: [
    /\bo que (e|significa|quer dizer|seria)\b/,
    /\b(conceito|definicao|definir|define|explique|explica|explicar|significado|me fale|fale sobre)\b/,
  ],
  solicitar: [
    /\bcomo\b.*\b(solicit\w*|pedi\w*|requer\w*|tirar|tiro|emit\w*|obter|obtenho|fazer|faco|abrir|dar entrada|iniciar)\b/,
    /\b(solicitar|solicitacao|requerimento|pedido|dar entrada)\b/,
  ],
  etapas: [/\b(etapas?|passos?|passo a passo|fluxo|procedimentos?|roteiro|sequencia|como funciona|processo|tramite)\b/],
  link: [/\b(links?|sites?|pagina|paginas|url|portal|fonte oficial|fontes oficiais|onde encontro|onde acesso|onde consulto)\b/],
  enquadramento: [
    /\b(minha|meu|nossa|nosso) (atividade|empreendimento|empresa|negocio|obra|propriedade|fazenda|projeto)\b/,
    /\bposso (obter|ter|usar|licenciar|me enquadrar|pedir|solicitar|tirar|conseguir)\b/,
    /\b(se encaixa|encaixo|enquadr\w*|elegivel|apto|apta|tenho direito|tem direito|pode obter|qual licenca|qual modalidade)\b/,
    /\bpreciso (de|da) (uma )?(lac|licenca)\b/,
    /\bconsigo (a )?lac\b/,
  ],
  // Assuntos que a base ainda não cobre com conteúdo validado.
  documentos: [/\b(documentos?|documentacao|papeis|checklist|exigencias?|exigidos?|comprovantes?|apresentar|levar)\b/],
  taxa: [/\b(taxas?|valor|valores|custo|custos|custa|preco|precos|pagar|pagamento|boleto)\b/, /\bquanto (e|eu pago|vou pagar)\b/],
  prazo: [/\b(prazos?|demora|demorar|demorado|dias|quanto tempo|fica pronta|ficar pronta)\b/],
  validade: [/\b(validade|vigencia|vence|vencimento|renovacao|renovar|duracao|quanto dura|por quanto tempo)\b/],
  contato: [/\b(telefone|contatos?|e mail|email|whatsapp|ligar|falar com|atendimento|horario|canal|endereco)\b/],
};
const FORA_DA_BASE = ['documentos', 'taxa', 'prazo', 'validade', 'contato'];
const RECONHECIDAS = ['conceito', 'solicitar', 'etapas', 'link', 'enquadramento', ...FORA_DA_BASE];

const MENCIONA_LAC = /\blac\b|\badesao e compromisso\b|\badesao compromisso\b/;
// "O que é a LAC", "explique a licença por adesão e compromisso": o assunto do "o que é" é a própria LAC.
const CONCEITO_DA_LAC =
  /\b(o que (e|sao|significa|quer dizer|seria)|explique|explica|explicar|fale sobre|me fale sobre|conceito de|definicao de|significado de)\s+(a |o |da |de |do |uma |um )?(lac|licenca por adesao|adesao e compromisso)\b/;
const LICENCIAMENTO_GERAL = /\b(licenciamento|licenca ambiental|licencas ambientais|licenca|licencas|licenciar|ambiental)\b/;

/**
 * Reconhece a(s) intenção(ões) da pergunta livre.
 * @returns {{ intencoes: string[], mencionaLac: boolean, licenciamentoGeral: boolean }}
 */
export function reconhecerIntencao(pergunta) {
  // "endereço eletrônico" é pedido de link, não de contato.
  const t = normalizar(pergunta).replace(/\bendereco eletronico\b/g, 'site');
  const comoPosso = /\bcomo (eu )?posso\b/.test(t);
  const intencoes = [];
  for (const nome of RECONHECIDAS) {
    let regras = REGRAS[nome];
    if (nome === 'enquadramento' && comoPosso) {
      // "como posso solicitar" é pedido de procedimento, não de enquadramento.
      regras = regras.filter((r) => !r.source.includes('posso'));
    }
    if (regras.some((r) => r.test(t))) intencoes.push(nome);
  }
  const mencionaLac = MENCIONA_LAC.test(t);

  // Prioridade: temas bloqueados (enquadramento; documentos, taxa, prazo, validade, contato) vêm antes do "o que é" genérico.
  // O conceito (descrição da LAC) só vale quando a pergunta cita a LAC e, havendo tema bloqueado, quando o "o que é" é sobre a própria LAC.
  const bloqueado = intencoes.includes('enquadramento') || FORA_DA_BASE.some((nome) => intencoes.includes(nome));
  if (intencoes.includes('conceito') && (!mencionaLac || (bloqueado && !CONCEITO_DA_LAC.test(t)))) {
    intencoes.splice(intencoes.indexOf('conceito'), 1);
  }
  return { intencoes, mencionaLac, licenciamentoGeral: LICENCIAMENTO_GERAL.test(t) && !mencionaLac };
}

/** Resposta segura quando não há conteúdo (endpoint ausente, falha ou sem blocos). */
export function respostaIndisponivel() {
  return { tipo: 'indisponivel', partes: [RESPOSTA_TEMPORARIA], fontes: [], avisos: [] };
}

function urlHttps(valor) {
  if (typeof valor !== 'string') return null;
  try {
    const url = new URL(valor);
    return url.protocol === 'https:' && url.hostname ? valor : null;
  } catch {
    return null;
  }
}

/**
 * Valida a resposta do endpoint antes de usá-la. Retorna null se algo estiver fora do formato esperado
 * ou se não houver a mensagem da faixa de teste (conteúdo de teste nunca é usado sem o aviso).
 */
export function validarPayload(json) {
  if (!ehObjeto(json) || !Array.isArray(json.blocos)) return null;
  const blocos = json.blocos
    .filter(
      (b) =>
        ehObjeto(b) &&
        typeof b.id === 'string' &&
        TIPOS_DE_BLOCO.includes(b.tipo) &&
        typeof b.texto === 'string' &&
        b.texto.trim() !== '' &&
        Array.isArray(b.fonteIds),
    )
    .map((b) => ({
      id: b.id,
      tipo: b.tipo,
      texto: b.texto,
      fonteIds: b.fonteIds.filter((x) => typeof x === 'string'),
      aviso: typeof b.aviso === 'string' && b.aviso.trim() !== '' ? b.aviso : null,
      url: urlHttps(b.url),
    }));
  if (blocos.length === 0) return null;

  const fontes = (Array.isArray(json.fontes) ? json.fontes : [])
    .filter((f) => ehObjeto(f) && typeof f.id === 'string' && typeof f.titulo === 'string' && urlHttps(f.url))
    .map((f) => ({ id: f.id, titulo: f.titulo, url: f.url }));

  const m = ehObjeto(json.mensagens) ? json.mensagens : {};
  const faixa = typeof m.faixa === 'string' && m.faixa.trim() !== '' ? m.faixa : null;
  if (!faixa) return null;
  const escopo = typeof m.escopo === 'string' && m.escopo.trim() !== '' ? m.escopo : null;
  return { blocos, fontes, mensagens: { faixa, escopo } };
}

/**
 * Monta a resposta usando somente os blocos do conteúdo recebido.
 * @param {string} pergunta
 * @param {object|null} conteudo resultado de validarPayload (ou null quando indisponível)
 * @returns {{ tipo: string, partes: string[], fontes: {titulo: string, url: string}[], avisos: string[] }}
 */
export function responderPergunta(pergunta, conteudo) {
  if (!conteudo || !Array.isArray(conteudo.blocos) || conteudo.blocos.length === 0) return respostaIndisponivel();

  const porTipo = new Map();
  for (const b of conteudo.blocos) if (!porTipo.has(b.tipo)) porTipo.set(b.tipo, b);
  const reconhecido = reconhecerIntencao(pergunta);
  const tem = (nome) => reconhecido.intencoes.includes(nome);
  const foraDaBase = FORA_DA_BASE.some(tem);
  const escolhidos = [];
  const usar = (tipo) => {
    const bloco = porTipo.get(tipo);
    if (bloco && !escolhidos.includes(bloco)) escolhidos.push(bloco);
  };

  let tipo = 'resposta';
  const escopo = conteudo.mensagens.escopo;
  if (reconhecido.licenciamentoGeral && escopo) {
    // Pergunta sobre licenciamento em geral (sem citar a LAC): informa o escopo da base, sem afirmar adequação ao caso.
    tipo = 'escopo';
    if (foraDaBase || tem('enquadramento')) {
      usar('sem_conteudo');
      usar('limitacao');
    }
  } else if (reconhecido.intencoes.length > 0) {
    if (tem('conceito')) usar('descricao');
    if (tem('solicitar') || tem('etapas')) usar('sequencia');
    if (tem('link')) usar('link');
    if (foraDaBase || tem('enquadramento')) usar('sem_conteudo');
    usar('limitacao');
  } else if (reconhecido.mencionaLac) {
    return { tipo: 'esclarecimento', partes: [PERGUNTA_ESCLARECIMENTO], fontes: [], avisos: [] };
  } else {
    tipo = 'sem_conteudo';
    usar('sem_conteudo');
  }

  if (tipo !== 'escopo' && escolhidos.length === 0) return respostaIndisponivel();

  const fontes = [];
  const avisos = [];
  for (const bloco of escolhidos) {
    for (const id of bloco.fonteIds) {
      const fonte = conteudo.fontes.find((f) => f.id === id);
      if (fonte && !fontes.some((f) => f.url === fonte.url)) fontes.push({ titulo: fonte.titulo, url: fonte.url });
    }
    if (bloco.aviso && !avisos.includes(bloco.aviso)) avisos.push(bloco.aviso);
  }
  if (tipo === 'escopo') {
    const partes = [escopo, ...escolhidos.map((b) => b.texto)];
    if (escolhidos.length === 0) partes.push(PERGUNTA_ESCLARECIMENTO);
    return { tipo, partes, fontes, avisos };
  }
  return { tipo, partes: escolhidos.map((b) => b.texto), fontes, avisos };
}

// ---------------------------------------------------------------------------------------------------------------------
// Conteúdo PÚBLICO publicado (Passo 5C). O arquivo vem do próprio site (meta "conteudo-publico"); aqui só se confere o formato
// e se monta a resposta, palavra por palavra, a partir das informações publicadas. Sem IA externa e sem rede nesta etapa.
// Informação de texto não mostra fonte; informação de link mostra só a URL.
// ---------------------------------------------------------------------------------------------------------------------

export const RESPOSTA_SEM_INFORMACAO_PUBLICADA =
  'Não encontrei essa informação no conteúdo publicado. Para saber mais, consulte os canais oficiais da SEMA.';
export const AVISO_ANALISE_DA_SEMA =
  'Não é possível dizer se o seu caso se enquadra: isso depende da análise da SEMA.';

const CHAVES_PUBLICO = ['formato', 'servico', 'tema', 'informacoes', 'integridade'];
const CHAVES_INFORMACAO = ['titulo', 'texto', 'tipo', 'links', 'alertas'];
const mesmasChaves = (obj, esperadas) => ehObjeto(obj) && Object.keys(obj).length === esperadas.length && esperadas.every((k) => Object.hasOwn(obj, k));
const textoNaoVazio = (v) => typeof v === 'string' && v.trim() !== '';

/** Confere o formato fechado do conteúdo publicado. Retorna { servico, tema, informacoes } ou null (nada é usado se algo divergir). */
export function validarConteudoPublicado(json) {
  if (!mesmasChaves(json, CHAVES_PUBLICO) || json.formato !== 1) return null;
  if (!mesmasChaves(json.servico, ['nome']) || !textoNaoVazio(json.servico.nome)) return null;
  if (!mesmasChaves(json.tema, ['nome']) || !textoNaoVazio(json.tema.nome)) return null;
  if (!Array.isArray(json.informacoes) || json.informacoes.length === 0) return null;
  for (const i of json.informacoes) {
    if (!mesmasChaves(i, CHAVES_INFORMACAO) || !textoNaoVazio(i.titulo) || !textoNaoVazio(i.texto)) return null;
    if (!Array.isArray(i.links) || !i.links.every((l) => mesmasChaves(l, ['url']) && urlHttps(l.url))) return null;
    if (i.tipo !== (i.links.length > 0 ? 'link' : 'texto')) return null;
    if (!Array.isArray(i.alertas) || !i.alertas.every(textoNaoVazio)) return null;
  }
  return {
    servico: json.servico.nome,
    tema: json.tema.nome,
    informacoes: json.informacoes.map((i) => ({ titulo: i.titulo, texto: i.texto, links: i.links.map((l) => l.url), alertas: [...i.alertas] })),
  };
}

const PALAVRAS_COMUNS = new Set([
  'para', 'como', 'qual', 'quais', 'quando', 'onde', 'quem', 'sobre', 'esta', 'esse', 'essa', 'isso', 'esta', 'seu', 'sua', 'que',
  'com', 'por', 'uma', 'uns', 'umas', 'dos', 'das', 'nos', 'nas', 'mais', 'muito', 'posso', 'pode', 'preciso', 'quero', 'gostaria',
  'saber', 'fazer', 'tenho', 'minha', 'meu', 'voce', 'favor', 'ola', 'bom', 'boa', 'dia', 'tarde', 'noite',
]);

function palavrasUteis(texto) {
  return [...new Set(normalizar(texto).split(' ').filter((p) => p.length >= 3 && !PALAVRAS_COMUNS.has(p)))];
}

const casam = (a, b) => a === b || (a.length >= 5 && b.length >= 5 && a.slice(0, 5) === b.slice(0, 5));

/** Pontua uma informação: palavras da pergunta que aparecem no título (peso 2) ou no texto (peso 1). */
function pontuar(palavras, informacao) {
  const titulo = palavrasUteis(informacao.titulo);
  const corpo = palavrasUteis(informacao.texto);
  let pontos = 0;
  for (const p of palavras) {
    if (titulo.some((t) => casam(p, t))) pontos += 2;
    else if (corpo.some((t) => casam(p, t))) pontos += 1;
  }
  return pontos;
}

/**
 * Responde SOMENTE com as informações publicadas (busca simples por palavras, determinística).
 * @param {string} pergunta
 * @param {{ informacoes: object[] }|null} publicado resultado de validarConteudoPublicado
 */
export function responderComConteudoPublicado(pergunta, publicado) {
  if (!publicado || !Array.isArray(publicado.informacoes) || publicado.informacoes.length === 0) return respostaIndisponivel();
  const palavras = palavrasUteis(pergunta);
  const avisos = reconhecerIntencao(pergunta).intencoes.includes('enquadramento') ? [AVISO_ANALISE_DA_SEMA] : [];
  const pontuadas = publicado.informacoes
    .map((informacao, ordem) => ({ informacao, ordem, pontos: pontuar(palavras, informacao) }))
    .filter((x) => x.pontos > 0)
    .sort((a, b) => b.pontos - a.pontos || a.ordem - b.ordem);
  if (pontuadas.length === 0) return { tipo: 'sem_informacao', partes: [RESPOSTA_SEM_INFORMACAO_PUBLICADA], fontes: [], avisos };
  const melhor = pontuadas[0].pontos;
  const escolhidas = pontuadas.filter((x) => x.pontos * 2 >= melhor).slice(0, 2).map((x) => x.informacao);
  const fontes = [];
  for (const i of escolhidas) for (const url of i.links) if (!fontes.some((f) => f.url === url)) fontes.push({ titulo: url, url });
  for (const i of escolhidas) for (const alerta of i.alertas) if (!avisos.includes(alerta)) avisos.push(alerta);
  return { tipo: 'publicado', partes: escolhidas.map((i) => i.texto), fontes, avisos };
}
