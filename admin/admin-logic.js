// Lógica da tela "Gestão de conteúdo": funções puras (sem DOM, sem armazenamento do navegador, sem relógio) e um cliente
// do endpoint administrativo local com `fetch` injetável. Este arquivo existe só no ambiente de desenvolvimento local:
// a pasta admin/ não entra no build nem no preview.
//
// O token da sessão fica numa variável DENTRO do cliente (memória): não há como lê-lo de fora, e ele nunca é devolvido,
// exibido, gravado ou registrado. As mensagens de erro vêm de uma tabela fixa em português, nunca da resposta bruta.

import { contemEmailNaoPermitido } from '../services/admin/contatos-permitidos.js';

export const LIMITES = Object.freeze({ id: 60, nome: 120, descricao: 1000, sigla: 20, termos: 20, termo: 120 });
export const ROTAS = Object.freeze({
  sessao: '/__admin/sessao',
  catalogo: '/__admin/catalogo',
  assuntos: '/__admin/assuntos',
  servicos: '/__admin/servicos',
  saude: '/__admin/saude',
});
export const CABECALHO_TOKEN = 'X-Admin-Token';

const PADRAO_ID = /^[a-z][a-z0-9-]*$/;
const PADRAO_SIGLA = /^[\p{L}\p{N}][\p{L}\p{N} ./-]{0,19}$/u;
const CONTROLE = /[\u0000-\u001f\u007f]/;
const PADRAO_EMAIL = /[\w.+-]+@[\w-]+(\.[\w-]+)+/;
const PADRAO_TELEFONE = /(\(\d{2}\)|\b\d{2})\s?\d{4,5}[-\s]?\d{4}\b/;

const ehObjeto = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const ehTexto = (v) => typeof v === 'string';

/** Minúsculas, sem acentos e com espaços colapsados, para comparar nomes e termos. */
export function normalizar(texto) {
  return String(texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Termos equivalentes digitados um por linha: remove espaços e linhas vazias. */
export function parseTermos(texto) {
  if (!ehTexto(texto)) return [];
  return texto
    .split(/\r?\n/)
    .map((linha) => linha.trim().replace(/ {2,}/g, ' '))
    .filter((linha) => linha !== '');
}

// ---------- Validação dos formulários (espelha as regras do servidor; o servidor continua sendo a palavra final) ----------

function textoLivre(valor, limite, nomeDoCampo, erros, campo) {
  if (!ehTexto(valor)) {
    erros[campo] = `Preencha ${nomeDoCampo}.`;
    return null;
  }
  const t = valor.trim().replace(/ {2,}/g, ' ');
  if (t === '') erros[campo] = `Preencha ${nomeDoCampo}.`;
  else if (CONTROLE.test(valor)) erros[campo] = `${capitalizar(nomeDoCampo)} contém caracteres não permitidos.`;
  else if (t.length > limite) erros[campo] = `${capitalizar(nomeDoCampo)} deve ter no máximo ${limite} caracteres.`;
  else if (contemEmailNaoPermitido(t) || PADRAO_TELEFONE.test(t)) erros[campo] = `Não informe e-mail nem telefone em ${nomeDoCampo}.`;
  else return t;
  return null;
}
const capitalizar = (t) => t.charAt(0).toUpperCase() + t.slice(1);

function validarId(valor, erros, campo) {
  if (!ehTexto(valor) || valor.trim() === '') {
    erros[campo] = 'Preencha o identificador.';
    return null;
  }
  const id = valor.trim();
  if (id.length > LIMITES.id) erros[campo] = `O identificador deve ter no máximo ${LIMITES.id} caracteres.`;
  else if (!PADRAO_ID.test(id)) erros[campo] = 'Use só letras minúsculas sem acento, números e hífen, começando por uma letra.';
  else return id;
  return null;
}

/** Valida o formulário "Novo assunto". Retorna { ok, dados, erros } (erros: mensagem por campo). */
export function validarFormAssunto(valores) {
  const v = ehObjeto(valores) ? valores : {};
  const erros = {};
  const nome = textoLivre(v.nome, LIMITES.nome, 'o nome', erros, 'nome');
  if (nome !== null && !/\p{L}/u.test(nome)) erros.nome = 'O nome deve conter ao menos uma letra.';
  const descricao = textoLivre(v.descricao, LIMITES.descricao, 'a descrição', erros, 'descricao');
  return Object.keys(erros).length ? { ok: false, erros } : { ok: true, dados: { nome, descricao } };
}

/** Valida o formulário "Novo serviço". `assuntos` é a lista do catálogo; só assunto ativo é aceito. */
export function validarFormServico(valores, assuntos) {
  const v = ehObjeto(valores) ? valores : {};
  const erros = {};
  const lista = Array.isArray(assuntos) ? assuntos : [];
  const assunto = lista.find((a) => ehObjeto(a) && a.id === v.assuntoId);
  if (!ehTexto(v.assuntoId) || v.assuntoId === '') erros.assuntoId = 'Escolha o assunto.';
  else if (!assunto || assunto.ativo !== true) erros.assuntoId = 'Escolha um assunto existente e ativo.';
  const nome = textoLivre(v.nome, LIMITES.nome, 'o nome', erros, 'nome');
  if (nome !== null && !/\p{L}/u.test(nome)) erros.nome = 'O nome deve conter ao menos uma letra.';

  let sigla = null;
  if (ehTexto(v.sigla) && v.sigla.trim() !== '') {
    const s = v.sigla.trim();
    if (!PADRAO_SIGLA.test(s) || PADRAO_EMAIL.test(s)) erros.sigla = `A sigla deve ter até ${LIMITES.sigla} caracteres (letras, números, espaço, ponto, barra ou hífen).`;
    else sigla = s;
  }

  const termos = parseTermos(v.termosEquivalentes);
  const vistos = new Set();
  if (termos.length === 0) erros.termosEquivalentes = 'Informe ao menos um termo equivalente, um por linha.';
  else if (termos.length > LIMITES.termos) erros.termosEquivalentes = `Informe no máximo ${LIMITES.termos} termos.`;
  else {
    for (const t of termos) {
      if (t.length > LIMITES.termo) erros.termosEquivalentes = `Cada termo deve ter no máximo ${LIMITES.termo} caracteres.`;
      else if (CONTROLE.test(t)) erros.termosEquivalentes = 'Os termos contêm caracteres não permitidos.';
      else if (PADRAO_EMAIL.test(t) || PADRAO_TELEFONE.test(t)) erros.termosEquivalentes = 'Não informe e-mail nem telefone nos termos.';
      else if (vistos.has(normalizar(t))) erros.termosEquivalentes = 'Há termos repetidos (sem diferenciar acentos e maiúsculas).';
      if (erros.termosEquivalentes) break;
      vistos.add(normalizar(t));
    }
  }
  if (Object.keys(erros).length) return { ok: false, erros };
  const dados = { assuntoId: v.assuntoId, nome, sigla, termosEquivalentes: termos };
  return { ok: true, dados };
}

/** Corpo enviado ao endpoint: somente os campos permitidos (sigla só quando informada). O id é gerado pelo servidor e nunca é enviado. */
export function corpoDoAssunto({ nome, descricao }) {
  return { nome, descricao };
}
export function corpoDoServico({ assuntoId, nome, sigla, termosEquivalentes }) {
  const corpo = { assuntoId, nome, termosEquivalentes: [...termosEquivalentes] };
  if (sigla) corpo.sigla = sigla;
  return corpo;
}

// ---------- Fontes do serviço (Passo 7E3A) ----------

export const TIPOS_FONTE = Object.freeze(['legislacao', 'pagina_oficial', 'manual', 'formulario', 'sistema', 'canal_atendimento', 'outro']);
export const ROTULOS_TIPO_FONTE = Object.freeze({
  legislacao: 'Legislação', pagina_oficial: 'Página oficial', manual: 'Manual', formulario: 'Formulário', sistema: 'Sistema', canal_atendimento: 'Canal de atendimento', outro: 'Outro',
});
export const rotuloTipoFonte = (tipo) => (ehTexto(tipo) && Object.hasOwn(ROTULOS_TIPO_FONTE, tipo) ? ROTULOS_TIPO_FONTE[tipo] : 'Tipo desconhecido');
export const AJUDA_ORIGEM_OFICIAL = 'Origem oficial identifica a procedência, mas não significa que o conteúdo foi validado.';
export const LIMITES_FONTE = Object.freeze({ id: 60, titulo: 200, orgaoResponsavel: 120, url: 500, descricao: 1000, dispositivoRelevante: 200 });
const PARAMETRO_SECRETO = /^(token|access_token|api[_-]?key|key|senha|password|passwd|secret|auth|authorization|sessao|session)$/i;

/** Data AAAA-MM-DD existente no calendário (sem usar relógio). */
function dataIsoValida(valor) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valor);
  if (!m) return false;
  const [ano, mes, dia] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (mes < 1 || mes > 12 || dia < 1) return false;
  const bissexto = (ano % 4 === 0 && ano % 100 !== 0) || ano % 400 === 0;
  const dias = [31, bissexto ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mes - 1];
  return dia <= dias;
}

/** "DD-MM-AAAA" (existente no calendário) -> "AAAA-MM-DD"; null se o formato ou a data forem inválidos. */
export function converterDataBrParaIso(texto) {
  const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(typeof texto === 'string' ? texto : '');
  if (!m) return null;
  const iso = `${m[3]}-${m[2]}-${m[1]}`;
  return dataIsoValida(iso) ? iso : null;
}

/** "AAAA-MM-DD" -> "DD-MM-AAAA" para exibição; devolve o texto original se não estiver nesse formato. */
export function formatarDataBr(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(typeof iso === 'string' ? iso : '');
  return m ? `${m[3]}-${m[2]}-${m[1]}` : iso;
}

/** URL aceitável para uma fonte: https, sem usuário e senha, sem parâmetro de credencial, sem e-mail nem telefone. */
function validarUrlDaFonte(valor, erros) {
  if (!ehTexto(valor) || valor.trim() === '') {
    erros.url = 'Preencha a URL da fonte.';
    return null;
  }
  const t = valor.trim();
  let url;
  try {
    url = new URL(t);
  } catch {
    erros.url = 'A URL não é válida. Use o endereço completo, começando por https://.';
    return null;
  }
  if (t.length > LIMITES_FONTE.url || /\s/.test(t) || CONTROLE.test(t)) erros.url = `A URL deve ter no máximo ${LIMITES_FONTE.url} caracteres, sem espaços.`;
  else if (url.protocol !== 'https:') erros.url = 'A URL deve começar por https://.';
  else if (url.username !== '' || url.password !== '') erros.url = 'A URL não pode conter usuário e senha.';
  else if ([...url.searchParams.keys()].some((nome) => PARAMETRO_SECRETO.test(nome))) erros.url = 'A URL não pode conter parâmetros de credencial (como token, chave ou senha).';
  else if (PADRAO_EMAIL.test(t) || PADRAO_TELEFONE.test(t)) erros.url = 'Não informe e-mail nem telefone na URL.';
  else return t;
  return null;
}

/** Valida o formulário "Nova fonte". `valores.origemOficial` é booleano (caixa de seleção). Retorna { ok, dados, erros }. */
export function validarFormFonte(valores) {
  const v = ehObjeto(valores) ? valores : {};
  const erros = {};
  const id = validarId(v.id, erros, 'id');
  const titulo = textoLivre(v.titulo, LIMITES_FONTE.titulo, 'o título', erros, 'titulo');
  if (!ehTexto(v.tipo) || !TIPOS_FONTE.includes(v.tipo)) erros.tipo = 'Escolha o tipo da fonte.';
  const orgaoResponsavel = textoLivre(v.orgaoResponsavel, LIMITES_FONTE.orgaoResponsavel, 'o órgão responsável', erros, 'orgaoResponsavel');
  const url = validarUrlDaFonte(v.url, erros);
  const descricao = textoLivre(v.descricao, LIMITES_FONTE.descricao, 'a descrição', erros, 'descricao');
  const origemOficial = v.origemOficial === true;

  // A tela usa DD-MM-AAAA; antes do envio a data é convertida para o formato interno AAAA-MM-DD.
  let dataPublicacao = null;
  if (ehTexto(v.dataPublicacao) && v.dataPublicacao.trim() !== '') {
    dataPublicacao = converterDataBrParaIso(v.dataPublicacao.trim());
    if (dataPublicacao === null) erros.dataPublicacao = 'Use uma data válida no formato DD-MM-AAAA, ou deixe em branco.';
  }
  let dispositivoRelevante = null;
  if (ehTexto(v.dispositivoRelevante) && v.dispositivoRelevante.trim() !== '') {
    dispositivoRelevante = textoLivre(v.dispositivoRelevante, LIMITES_FONTE.dispositivoRelevante, 'o dispositivo relevante', erros, 'dispositivoRelevante');
  }
  if (Object.keys(erros).length) return { ok: false, erros };
  return { ok: true, dados: { id, titulo, tipo: v.tipo, orgaoResponsavel, url, descricao, origemOficial, dataPublicacao, dispositivoRelevante } };
}

/** Corpo enviado: os campos permitidos mais a revisão das fontes lida antes (os opcionais só quando informados). */
export function corpoDaFonte(dados, revisao) {
  const corpo = {
    revisao, id: dados.id, titulo: dados.titulo, tipo: dados.tipo, orgaoResponsavel: dados.orgaoResponsavel, url: dados.url, descricao: dados.descricao, origemOficial: dados.origemOficial === true,
  };
  if (dados.dataPublicacao) corpo.dataPublicacao = dados.dataPublicacao;
  if (dados.dispositivoRelevante) corpo.dispositivoRelevante = dados.dispositivoRelevante;
  return corpo;
}

export function resumoDaFonte(dados, servico) {
  return [
    { rotulo: 'Serviço', valor: servico ? servico.nome : 'não identificado' },
    { rotulo: 'Identificador', valor: dados.id },
    { rotulo: 'Título', valor: dados.titulo },
    { rotulo: 'Tipo', valor: rotuloTipoFonte(dados.tipo) },
    { rotulo: 'Órgão responsável', valor: dados.orgaoResponsavel },
    { rotulo: 'URL', valor: dados.url },
    { rotulo: 'Descrição', valor: dados.descricao },
    { rotulo: 'Origem oficial', valor: dados.origemOficial ? `Sim. ${AJUDA_ORIGEM_OFICIAL}` : 'Não' },
    { rotulo: 'Data de publicação', valor: dados.dataPublicacao ? formatarDataBr(dados.dataPublicacao) : 'não informada' },
    { rotulo: 'Dispositivo relevante', valor: dados.dispositivoRelevante ?? 'não informado' },
    { rotulo: 'Situação inicial', valor: `Rascunho e não publicada; a data de consulta e a vigência são definidas pelo sistema${dados.tipo === 'legislacao' ? ' (legislação: vigência a confirmar)' : ''}` },
  ];
}

/** Rótulo da situação de validação da fonte ("validado" na base significa só procedência e metadados conferidos). */
export function rotuloSituacaoFonte(statusValidacao) {
  if (statusValidacao === 'rascunho') return 'Rascunho';
  if (statusValidacao === 'em_validacao') return 'Em validação';
  if (statusValidacao === 'validado') return 'Procedência validada';
  return 'Situação indisponível';
}

/** Lista de exibição das fontes de um serviço (somente campos públicos, nunca a resposta bruta). */
export function resumirFontes(documento) {
  const lista = ehObjeto(documento) && Array.isArray(documento.fontes) ? documento.fontes : [];
  return lista.filter((f) => ehObjeto(f) && ehTexto(f.id)).map((f) => ({
    id: f.id, titulo: ehTexto(f.titulo) ? f.titulo : f.id, tipo: rotuloTipoFonte(f.tipo), orgao: ehTexto(f.orgaoResponsavel) ? f.orgaoResponsavel : '—',
    situacao: rotuloSituacaoFonte(f.statusValidacao), publicacao: f.publicado === true ? 'Publicada' : 'Não publicada',
  }));
}

/** Linhas do resumo mostrado antes da gravação (nunca inclui o token). */
export function resumoDoAssunto(dados) {
  return [
    { rotulo: 'Nome', valor: dados.nome },
    { rotulo: 'Descrição', valor: dados.descricao },
  ];
}
export function resumoDoServico(dados, assuntos = []) {
  const assunto = assuntos.find((a) => a.id === dados.assuntoId);
  return [
    { rotulo: 'Assunto', valor: assunto ? assunto.nome : 'não identificado' },
    { rotulo: 'Nome', valor: dados.nome },
    { rotulo: 'Sigla', valor: dados.sigla ?? 'não informada (ficará PENDENTE)' },
    { rotulo: 'Termos equivalentes', valor: dados.termosEquivalentes.join('; ') },
    { rotulo: 'Situação inicial', valor: 'Rascunho, sem conteúdo e não publicado' },
  ];
}

// ---------- Saúde do sistema (Passo 8B) ----------

export const CAPACIDADES_SAUDE = Object.freeze({ implementado: 'Implementado', nao_implementado: 'Não implementado', nao_se_aplica: 'Não se aplica' });
export const ESTADOS_SAUDE = Object.freeze({ operacional: 'Operacional', degradado: 'Degradado', indisponivel: 'Indisponível', nao_verificado: 'Não verificado' });
export const NOMES_DOS_COMPONENTES = Object.freeze({
  aplicacao_administrativa: 'Aplicação administrativa',
  base_assuntos: 'Base de assuntos',
  base_servicos_versoes: 'Serviços e versões',
  base_referencias: 'Referências da base',
  armazenamento: 'Armazenamento',
  conteudo_publicado: 'Conteúdo publicado',
  processamento_fontes: 'Processamento de fontes',
  banco_de_dados: 'Banco de dados',
  ia_externa: 'IA externa',
});
const PADRAO_ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;

/**
 * Formata um instante ISO como DD-MM-AAAA HH:mm:ss no horário local. `criarData` (uma função que cria a data
 * a partir do texto) é injetada para manter este arquivo sem relógio. Retorna 'data indisponível' se o texto não for um instante ISO válido.
 */
export function formatarDataHoraBr(iso, criarData) {
  if (!ehTexto(iso) || !PADRAO_ISO.test(iso) || typeof criarData !== 'function') return 'data indisponível';
  const d = criarData(iso);
  if (!d || Number.isNaN(d.getTime())) return 'data indisponível';
  const dois = (n) => String(n).padStart(2, '0');
  return `${dois(d.getDate())}-${dois(d.getMonth() + 1)}-${d.getFullYear()} ${dois(d.getHours())}:${dois(d.getMinutes())}:${dois(d.getSeconds())}`;
}

/** Normaliza a resposta de saúde: só componentes conhecidos, com capacidade e estado válidos; nada além disso é usado. */
export function normalizarSaude(corpo) {
  if (!ehObjeto(corpo) || !ehTexto(corpo.geradoEm) || !PADRAO_ISO.test(corpo.geradoEm) || !Array.isArray(corpo.componentes)) return null;
  const componentes = [];
  for (const c of corpo.componentes) {
    if (!ehObjeto(c) || !Object.hasOwn(NOMES_DOS_COMPONENTES, c.componente) || !Object.hasOwn(CAPACIDADES_SAUDE, c.capacidade) || !Object.hasOwn(ESTADOS_SAUDE, c.estado)) continue;
    if (!ehTexto(c.verificadoEm) || !PADRAO_ISO.test(c.verificadoEm) || !ehTexto(c.mensagem)) continue;
    componentes.push({ id: c.componente, nome: NOMES_DOS_COMPONENTES[c.componente], capacidade: c.capacidade, estado: c.estado, verificadoEm: c.verificadoEm, mensagem: c.mensagem.slice(0, 200) });
  }
  return componentes.length > 0 ? { geradoEm: corpo.geradoEm, componentes } : null;
}

/** Resumo em uma frase: quantos componentes em cada estado. */
export const NOTA_NAO_IMPLEMENTADO = 'Ainda não existe no sistema. Isso não é uma falha.';

// Estados contam só componentes implementados; os não implementados têm contagem própria (e os "não se aplica" só aparecem se existirem).
export function resumoDaSaude(componentes) {
  const implementados = componentes.filter((c) => c.capacidade === 'implementado');
  const n = (estado) => implementados.filter((c) => c.estado === estado).length;
  const total = (capacidade) => componentes.filter((c) => c.capacidade === capacidade).length;
  const partes = [`Operacionais: ${n('operacional')}.`, `Degradados: ${n('degradado')}.`, `Indisponíveis: ${n('indisponivel')}.`, `Não verificados: ${n('nao_verificado')}.`, `Não implementados: ${total('nao_implementado')}.`];
  if (total('nao_se_aplica') > 0) partes.push(`Não se aplicam: ${total('nao_se_aplica')}.`);
  return partes.join(' ');
}

// ---------- Catálogo ----------

export const ROTULOS_ESTADO = Object.freeze({
  rascunho: 'Rascunho',
  em_validacao: 'Em análise',
  ajustes_solicitados: 'Precisa de ajustes',
  validado_materialmente: 'Conteúdo validado',
  autorizado_publicacao: 'Pronto para publicação',
  publicado: 'Publicado',
  revogado: 'Publicação revogada',
  validado: 'Validado',
});
export const rotuloEstado = (estado) => (ehTexto(estado) && Object.hasOwn(ROTULOS_ESTADO, estado) ? ROTULOS_ESTADO[estado] : 'Estado indisponível');
export const rotuloPublicacao = (versaoPublicadaId) => (ehTexto(versaoPublicadaId) && versaoPublicadaId !== '' ? 'Publicado' : 'Não publicado');

/**
 * Agrupa os serviços por assunto, na ordem do catálogo, só com dados de exibição (nome, descrição, sigla, situação e
 * publicação): ids, versões e hashes não saem daqui. `estados` mapeia id do serviço -> estado da versão atual.
 * Serviços cujo assunto não está na lista aparecem num grupo final sem assunto.
 */
export function agruparCatalogo(catalogo, estados = {}) {
  const assuntos = ehObjeto(catalogo) && Array.isArray(catalogo.assuntos) ? catalogo.assuntos : [];
  const servicos = ehObjeto(catalogo) && Array.isArray(catalogo.servicos) ? catalogo.servicos : [];
  const item = (s) => ({
    nome: ehTexto(s.nome) && s.nome !== '' ? s.nome : 'Serviço sem nome', sigla: ehTexto(s.sigla) && s.sigla !== 'PENDENTE' ? s.sigla : null,
    situacao: rotuloEstado(estados[s.id] ?? null), publicacao: rotuloPublicacao(s.versaoPublicadaId),
  });
  const grupos = assuntos.map((a) => ({ assunto: { nome: a.nome, descricao: ehTexto(a.descricao) ? a.descricao : '', ativo: a.ativo === true }, servicos: servicos.filter((s) => s.assuntoId === a.id).map(item) }));
  const conhecidos = new Set(assuntos.map((a) => a.id));
  const soltos = servicos.filter((s) => !conhecidos.has(s.assuntoId)).map(item);
  if (soltos.length) grupos.push({ assunto: null, servicos: soltos });
  return grupos;
}

/** Valida o formato do catálogo recebido do endpoint. */
export function catalogoValido(c) {
  return ehObjeto(c)
    && Array.isArray(c.assuntos) && c.assuntos.every((a) => ehObjeto(a) && ehTexto(a.id) && ehTexto(a.nome))
    && Array.isArray(c.servicos) && c.servicos.every((s) => ehObjeto(s) && ehTexto(s.id) && ehTexto(s.assuntoId));
}

// ---------- Blocos de conhecimento (Sprint 3, Passo 3B2) ----------

// Mesmos limites do servidor (services/admin/conhecimento.js); o servidor continua sendo a palavra final.
export const LIMITES_CONHECIMENTO = Object.freeze({ titulo: 200, texto: 2000, alerta: 300, alertas: 10, fontes: 10, localizacao: 200 });
const CONTROLE_LONGO = /[\u0000-\u0008\u000b-\u001f\u007f]/; // permite quebra de linha e tabulação
const ROTULOS_REVISAO = Object.freeze({ pendente: 'Revisão pendente', em_revisao: 'Em revisão', concluida: 'Revisão concluída' });
export const rotuloSituacaoBloco = (s) => (s === 'rascunho' ? 'Em elaboração (rascunho)' : s === 'em_validacao' ? 'Em análise' : s === 'validado' ? 'Validada' : 'Situação indisponível');
export const rotuloRevisao = (r) => (ehTexto(r) && Object.hasOwn(ROTULOS_REVISAO, r) ? ROTULOS_REVISAO[r] : 'Revisão indisponível');

function textoLongo(valor, limite, nomeDoCampo, erros, campo) {
  if (!ehTexto(valor) || valor.trim() === '') erros[campo] = `Preencha ${nomeDoCampo}.`;
  else if (CONTROLE_LONGO.test(valor)) erros[campo] = `${capitalizar(nomeDoCampo)} contém caracteres não permitidos.`;
  else if (valor.trim().length > limite) erros[campo] = `${capitalizar(nomeDoCampo)} deve ter no máximo ${limite} caracteres.`;
  else if (contemEmailNaoPermitido(valor) || PADRAO_TELEFONE.test(valor)) erros[campo] = `Não informe e-mail nem telefone em ${nomeDoCampo}.`;
  else return valor.trim();
  return null;
}

/**
 * Valida o formulário de bloco de conhecimento. `valores`: { titulo, texto, alertas (texto, um por linha), selecionadas: [{ fonteId, localizacao }] }.
 * `fontes`: fontes da versão ([{ id, revogada }]). Retorna { ok, dados } ou { ok: false, erros } (mensagem por campo; `localizacoes` por fonte).
 */
export function validarFormConhecimento(valores, fontes = []) {
  const v = ehObjeto(valores) ? valores : {};
  const L = LIMITES_CONHECIMENTO;
  const erros = {};
  const titulo = textoLivre(v.titulo, L.titulo, 'o tema da informação', erros, 'titulo');
  const texto = textoLongo(v.texto, L.texto, 'o que o chatbot deve informar ao cidadão', erros, 'texto');

  const disponiveis = new Map(fontes.filter((f) => ehObjeto(f) && ehTexto(f.id)).map((f) => [f.id, f]));
  const selecionadas = Array.isArray(v.selecionadas) ? v.selecionadas : [];
  const referencias = [];
  if (selecionadas.length === 0) erros.fontes = 'Escolha ao menos uma fonte que comprove a informação.';
  else if (selecionadas.length > L.fontes) erros.fontes = `Escolha no máximo ${L.fontes} fontes.`;
  else if (new Set(selecionadas.map((s) => s?.fonteId)).size !== selecionadas.length) erros.fontes = 'Cada fonte pode ser escolhida uma só vez.';
  else if (selecionadas.some((s) => !ehObjeto(s) || !disponiveis.has(s.fonteId) || disponiveis.get(s.fonteId).revogada === true)) {
    erros.fontes = 'Escolha apenas fontes disponíveis neste serviço (fontes revogadas não podem ser usadas).';
  } else {
    const locais = {};
    for (const s of selecionadas) {
      const e = {};
      const localizacao = textoLivre(s.localizacao, L.localizacao, 'onde a informação aparece na fonte', e, 'x');
      if (localizacao === null) locais[s.fonteId] = e.x === 'Preencha onde a informação aparece na fonte.' ? 'Informe onde esta informação aparece na fonte. Exemplo: página 3, item 2.1 ou seção Como solicitar.' : e.x;
      else referencias.push({ fonteId: s.fonteId, localizacao });
    }
    if (Object.keys(locais).length) erros.localizacoes = locais;
  }

  const alertas = parseTermos(v.alertas);
  if (alertas.length > L.alertas) erros.alertas = `Informe no máximo ${L.alertas} avisos.`;
  else if (alertas.some((a) => a.length > L.alerta)) erros.alertas = `Cada aviso deve ter no máximo ${L.alerta} caracteres.`;
  else if (alertas.some((a) => CONTROLE.test(a))) erros.alertas = 'Os avisos contêm caracteres não permitidos.';
  else if (alertas.some((a) => contemEmailNaoPermitido(a) || PADRAO_TELEFONE.test(a))) erros.alertas = 'Não informe e-mail nem telefone nos avisos.';

  if (Object.keys(erros).length) return { ok: false, erros };
  return { ok: true, dados: { titulo, texto, fonteIds: referencias.map((r) => r.fonteId), referencias, alertas } };
}

/** Corpo enviado: somente titulo, texto, fonteIds, referencias e alertas (alertas só quando houver). Id, datas e estados nunca vão. */
export function corpoDoConhecimento(dados) {
  const corpo = {
    titulo: dados.titulo, texto: dados.texto, fonteIds: [...dados.fonteIds], referencias: dados.referencias.map((r) => ({ fonteId: r.fonteId, localizacao: r.localizacao })),
  };
  if (Array.isArray(dados.alertas) && dados.alertas.length > 0) corpo.alertas = [...dados.alertas];
  return corpo;
}

/** Linhas do resumo mostrado antes de gravar (sem ids): fontes por título. */
export function resumoDoConhecimento(dados, fontes = [], servico = null) {
  const titulos = new Map(fontes.map((f) => [f.id, f.titulo]));
  return [
    { rotulo: 'Serviço', valor: servico ?? 'não identificado' },
    { rotulo: 'Tema da informação', valor: dados.titulo },
    { rotulo: 'O que o chatbot deve informar ao cidadão?', valor: dados.texto },
    { rotulo: 'Documentos ou links usados', valor: dados.referencias.map((r) => `${titulos.get(r.fonteId) ?? 'Fonte'} — ${r.localizacao}`).join('; ') },
    { rotulo: 'Avisos ou limitações', valor: dados.alertas.length ? dados.alertas.join('; ') : 'nenhum' },
    { rotulo: 'Situação inicial', valor: 'Em elaboração (rascunho); ainda não disponível no chatbot' },
  ];
}

/**
 * Resume a resposta de GET versao-atual para a tela de blocos: nome do serviço, número e estado da versão, fontes (título e tipo)
 * e somente os blocos do tipo conhecimento, com datas em DD-MM-AAAA. Nada interno além do necessário às chamadas é copiado.
 * Retorna null se o formato não for o esperado.
 */
export function resumirConhecimento(c) {
  if (!ehObjeto(c) || !ehObjeto(c.manifesto) || !ehTexto(c.manifesto.estado) || !Number.isInteger(c.manifesto.numero)) return null;
  if (!ehObjeto(c.service) || !ehObjeto(c.fontes) || !Array.isArray(c.fontes.fontes)) return null;
  if (!ehObjeto(c.conteudoAssistente) || !Array.isArray(c.conteudoAssistente.blocos)) return null;
  const fontes = c.fontes.fontes.filter((f) => ehObjeto(f) && ehTexto(f.id) && !ehTexto(f.excluidaEm)).map((f) => ({
    id: f.id, titulo: ehTexto(f.titulo) ? f.titulo : 'Fonte', tipo: rotuloTipoFonte(f.tipo), revogada: ehObjeto(f.vigencia) && f.vigencia.situacao === 'revogada',
  }));
  const titulos = new Map(fontes.map((f) => [f.id, f.titulo]));
  const blocos = c.conteudoAssistente.blocos.filter((b) => ehObjeto(b) && b.tipo === 'conhecimento' && ehTexto(b.id)).map((b) => {
    const referencias = (Array.isArray(b.referencias) ? b.referencias : []).filter(ehObjeto)
      .map((r) => ({ fonteId: r.fonteId, fonteTitulo: titulos.get(r.fonteId) ?? 'Fonte', localizacao: ehTexto(r.localizacao) ? r.localizacao : '' }));
    return {
      id: b.id, titulo: ehTexto(b.titulo) ? b.titulo : '', texto: ehTexto(b.texto) ? b.texto : '', referencias,
      alertas: Array.isArray(b.alertas) ? b.alertas.filter(ehTexto) : [],
      situacao: rotuloSituacaoBloco(b.statusValidacao), revisao: rotuloRevisao(b.revisaoAtualidade), publicacao: b.publicado === true ? 'Disponível no chatbot.' : 'Ainda não disponível no chatbot.',
      criadoEm: formatarDataBr(b.criadoEm), atualizadoEm: formatarDataBr(b.atualizadoEm),
      editavel: b.statusValidacao === 'rascunho' && b.publicado === false && b.revisaoAtualidade === 'pendente',
    };
  });
  return {
    nomeServico: ehTexto(c.service.nome) && c.service.nome !== '' ? c.service.nome : 'Serviço sem nome', numero: c.manifesto.numero, estado: c.manifesto.estado,
    editavel: c.manifesto.estado === 'rascunho', fontes, blocos,
  };
}

// ---------- Mensagens ----------

const ROTULO_DO_CAMPO = Object.freeze({
  id: 'identificador', nome: 'nome', descricao: 'descrição', assuntoId: 'assunto', sigla: 'sigla', termosEquivalentes: 'termos equivalentes',
  titulo: 'título', tipo: 'tipo', orgaoResponsavel: 'órgão responsável', url: 'URL', origemOficial: 'origem oficial', dataPublicacao: 'data de publicação',
  dispositivoRelevante: 'dispositivo relevante', revisao: 'revisão das fontes',
  texto: 'o que o chatbot deve informar ao cidadão', fonteIds: 'fontes', referencias: 'onde a informação aparece na fonte', alertas: 'avisos ou limitações',
});
export const MENSAGENS = Object.freeze({
  rede: 'Não foi possível falar com o servidor local. Confira se o servidor de desenvolvimento está ativo e recarregue a página.',
  sessao: 'A sessão administrativa não está disponível. Recarregue a página para iniciar uma nova sessão.',
  catalogo: 'Não foi possível carregar o catálogo. Recarregue a página e tente novamente.',
  fontes: 'Não foi possível carregar as fontes deste serviço. Tente novamente.',
  saude: 'Não foi possível verificar a saúde do sistema. Tente novamente.',
  emAndamento: 'Uma gravação já está em andamento. Aguarde a conclusão.',
  conhecimento: 'Não foi possível carregar as informações deste serviço. Tente novamente.',
  generica: 'Não foi possível concluir a operação. Nada foi alterado.',
});

/** Converte o código do endpoint em mensagem curta em português. Nunca usa texto bruto da resposta. */
export function mensagemDeErro(status, corpo, contexto = 'geral') {
  const erro = ehObjeto(corpo) && ehTexto(corpo.erro) ? corpo.erro : null;
  const campo = ehObjeto(corpo) && ehTexto(corpo.campo) ? corpo.campo : null;
  if (status === 401) return 'A sessão administrativa é inválida ou expirou. Recarregue a página para iniciar uma nova sessão.';
  if (status === 403) return 'Acesso recusado. A administração só funciona neste computador, pelo endereço local.';
  if (contexto === 'conhecimento') {
    if (status === 404) return 'Esta informação ou este serviço não foi encontrado. A lista foi recarregada.';
    if (status === 409) {
      if (erro === 'operacao_em_andamento') return 'Outra gravação está em andamento. Aguarde alguns segundos e tente de novo.';
      if (erro === 'versao_nao_editavel') return 'A versão atual deste serviço não está em rascunho; não é possível alterar as informações. A tela foi recarregada.';
      if (erro === 'bloco_nao_editavel') return 'Esta informação não está mais em elaboração (rascunho) e não pode ser editada. A lista foi recarregada.';
      if (erro === 'bloco_nao_removivel') return 'Esta informação não está mais em elaboração (rascunho) e não pode ser excluída. A lista foi recarregada.';
      return MENSAGENS.generica;
    }
  }
  if (status === 409) {
    if (erro === 'operacao_em_andamento') return 'Outra gravação está em andamento. Aguarde alguns segundos e tente de novo.';
    if (erro === 'revisao_divergente') return 'As fontes deste serviço mudaram desde que a lista foi aberta. A lista foi recarregada; confira e tente de novo.';
    if (erro === 'versao_nao_editavel') return 'A versão atual deste serviço não está em rascunho; não é possível cadastrar fontes.';
    if (campo === 'url') return 'Já existe uma fonte com esta URL.';
    if (campo === 'nome') return 'Já existe um item com este nome. Escolha outro nome.';
    return 'Já existe um item com este identificador. Escolha outro identificador.';
  }
  if (status === 413) return 'Os dados enviados são grandes demais.';
  if (status === 415) return 'O formato do envio não foi aceito.';
  if (status === 422) {
    const campos = ehObjeto(corpo) && Array.isArray(corpo.campos) ? corpo.campos : [];
    if (campos.includes('extras')) return 'Os dados enviados contêm campos que não são permitidos.';
    if (campos.length === 1 && campos[0] === 'assuntoId') return 'O assunto escolhido não existe ou está inativo.';
    const rotulos = contexto === 'conhecimento' ? { ...ROTULO_DO_CAMPO, titulo: 'tema da informação' } : ROTULO_DO_CAMPO;
    const nomes = campos.filter((c) => Object.hasOwn(rotulos, c)).map((c) => rotulos[c]);
    return nomes.length ? `Revise os campos: ${nomes.join(', ')}.` : 'Revise os dados informados.';
  }
  if (status === 400) return 'Os dados enviados não puderam ser lidos. Revise o formulário e tente de novo.';
  if (status === 404) return 'O recurso pedido não foi encontrado.';
  if (status === 405) return 'Esta operação não é permitida.';
  if (status === 500) return 'O servidor local não conseguiu concluir a operação. Nada foi alterado; tente novamente.';
  return MENSAGENS.generica;
}

// ---------- Sessão do login simulado (Sprint 8, Passo 8B) ----------
// Usuários fictícios, sem senha: escolher um usuário não comprova identidade. O token fica só dentro de cada cliente.

const PADRAO_TOKEN_SESSAO = /^[0-9a-f]{64}$/;
const ROTULOS_DO_PERFIL = Object.freeze({ cadastrante: 'Cadastrante', revisor: 'Revisor' });
const CAMPOS_DO_USUARIO = 'nome,perfil,setor,usuarioId';
export const MENSAGEM_USUARIO_MUDOU = 'O usuário da sessão mudou. Atualize a página.';
export const MENSAGEM_SEM_USUARIO = 'Escolha o usuário na Gestão de conteúdo.';
export const MENSAGEM_ESCOLHA_USUARIO = 'Escolha com qual usuário entrar.';
export const AVISO_USUARIOS_FICTICIOS = 'Usuários fictícios de demonstração, sem senha.';

/** Rótulo do perfil para a tela; perfil desconhecido não é repetido. */
export const rotuloDoPerfil = (perfil) => (ehTexto(perfil) && Object.hasOwn(ROTULOS_DO_PERFIL, perfil) ? ROTULOS_DO_PERFIL[perfil] : 'Perfil indisponível');
/** "Nome — Perfil" (topo das páginas). */
export const rotuloDoUsuario = (u) => `${u.nome} — ${rotuloDoPerfil(u.perfil)}`;
/** "Nome — Perfil, Setor" (opções da escolha). */
export const rotuloDaEscolha = (u) => `${u.nome} — ${rotuloDoPerfil(u.perfil)}, ${u.setor}`;

const textoDeUsuarioOk = (v, max) => ehTexto(v) && v.trim() !== '' && v.length <= max && !CONTROLE.test(v);

function usuarioDaSessao(u) {
  if (!ehObjeto(u) || Object.keys(u).sort().join(',') !== CAMPOS_DO_USUARIO) return null;
  if (!ehTexto(u.usuarioId) || u.usuarioId.length > 60 || !PADRAO_ID.test(u.usuarioId)) return null;
  if (!textoDeUsuarioOk(u.nome, 120) || !textoDeUsuarioOk(u.setor, 120)) return null;
  if (!ehTexto(u.perfil) || !Object.hasOwn(ROTULOS_DO_PERFIL, u.perfil)) return null;
  return { usuarioId: u.usuarioId, nome: u.nome, perfil: u.perfil, setor: u.setor };
}

/**
 * Confere a resposta da sessão em formato fechado. Aceita a leitura (GET: usuario, usuarios e, só com usuário, token) e a
 * entrada (POST: token e usuario). Devolve { usuario, usuarios, token } (usuarios = null na entrada) ou null.
 */
export function normalizarSessao(corpo) {
  if (!ehObjeto(corpo)) return null;
  const chaves = Object.keys(corpo).sort().join(',');
  const temToken = Object.hasOwn(corpo, 'token');
  if (temToken && (!ehTexto(corpo.token) || !PADRAO_TOKEN_SESSAO.test(corpo.token))) return null;
  if (chaves === 'token,usuario') {
    const usuario = usuarioDaSessao(corpo.usuario);
    return usuario === null ? null : { usuario, usuarios: null, token: corpo.token };
  }
  if (chaves !== 'usuario,usuarios' && chaves !== 'token,usuario,usuarios') return null;
  if (!Array.isArray(corpo.usuarios) || corpo.usuarios.length === 0 || corpo.usuarios.length > 20) return null;
  const usuarios = corpo.usuarios.map(usuarioDaSessao);
  if (usuarios.some((u) => u === null) || new Set(usuarios.map((u) => u.usuarioId)).size !== usuarios.length) return null;
  const usuario = corpo.usuario === null ? null : usuarioDaSessao(corpo.usuario);
  if (corpo.usuario !== null && usuario === null) return null;
  if ((usuario !== null) !== temToken) return null;
  if (usuario !== null && !usuarios.some((u) => u.usuarioId === usuario.usuarioId)) return null;
  return { usuario, usuarios, token: temToken ? corpo.token : null };
}

/**
 * Operações de sessão comuns aos dois clientes. `chamar(metodo, caminho, corpo, comToken)`; o token é lido e trocado só pelas
 * funções `lerToken`/`definirToken` da closure do cliente.
 */
function operacoesDeSessao({ chamar, lerToken, definirToken, rota, mensagens }) {
  async function recuperarSessao() {
    const r = await chamar('GET', rota, undefined, false);
    if (r.falhaDeRede) return { ok: false, mensagem: mensagens.rede };
    if (r.status === 403) return { ok: false, mensagem: mensagens.acesso };
    const s = r.ok ? normalizarSessao(r.corpo) : null;
    if (s === null || s.usuarios === null) return { ok: false, mensagem: mensagens.falha };
    definirToken(s.token);
    return { ok: true, usuario: s.usuario, usuarios: s.usuarios };
  }
  return {
    recuperarSessao,
    /** Retoma a sessão já escolhida (sem escolher usuário). Sem usuário na sessão, falha com a orientação de escolha. */
    async retomarSessao() {
      const r = await recuperarSessao();
      if (!r.ok) return r;
      if (r.usuario === null) return { ok: false, semUsuario: true, mensagem: MENSAGEM_SEM_USUARIO };
      return { ok: true };
    },
    /** Entra com um usuário selecionável (POST só com usuarioId). Um token novo substitui o anterior. */
    async entrarComo(usuarioId) {
      if (!ehTexto(usuarioId) || usuarioId.length > 60 || !PADRAO_ID.test(usuarioId)) return { ok: false, mensagem: MENSAGEM_ESCOLHA_USUARIO };
      const r = await chamar('POST', rota, { usuarioId }, false);
      if (r.falhaDeRede) return { ok: false, mensagem: mensagens.rede };
      if (r.status === 403) return { ok: false, mensagem: mensagens.acesso };
      if (r.status === 422) return { ok: false, mensagem: MENSAGEM_ESCOLHA_USUARIO };
      const s = r.ok ? normalizarSessao(r.corpo) : null;
      if (s === null || s.usuarios !== null) return { ok: false, mensagem: mensagens.falha };
      definirToken(s.token);
      return { ok: true, usuario: s.usuario };
    },
    /** Sai: envia DELETE com o token atual e só depois zera o token local (mesmo se o servidor recusar). */
    async sair() {
      const atual = lerToken();
      if (atual === null) return { ok: true };
      const r = await chamar('DELETE', rota, undefined, true);
      if (lerToken() === atual) definirToken(null);
      if (r.falhaDeRede) return { ok: false, mensagem: mensagens.rede };
      return { ok: true };
    },
  };
}

// ---------- Cliente do endpoint administrativo ----------

/**
 * Cria o cliente. `fetchImpl` é o `fetch` (injetado para teste). O token fica só na variável `token`, sem acesso externo.
 * Cada gravação só começa se a sessão existir e nenhuma outra estiver em andamento (sem envio duplicado).
 */
export function criarClienteAdmin({ fetchImpl, aoPerderSessao } = {}) {
  let token = null;
  let gravando = false;

  async function chamar(metodo, caminho, corpo, { comToken = true, extras = {} } = {}) {
    const cabecalhos = { Accept: 'application/json', ...extras };
    const tokenUsado = token;
    if (comToken) cabecalhos[CABECALHO_TOKEN] = token;
    const opcoes = { method: metodo, headers: cabecalhos, cache: 'no-store', credentials: 'omit', redirect: 'error' };
    if (corpo !== undefined) {
      cabecalhos['Content-Type'] = 'application/json';
      opcoes.body = JSON.stringify(corpo);
    }
    let resposta;
    try {
      resposta = await fetchImpl(caminho, opcoes);
    } catch {
      return { falhaDeRede: true };
    }
    let json = null;
    try {
      json = await resposta.json();
    } catch { /* corpo ausente ou inválido: tratado só pelo status */ }
    // 401 com o token em uso: o usuário da sessão mudou (outra aba ou reinício). Zera o token e avisa a tela.
    if (comToken && resposta.status === 401 && caminho !== ROTAS.sessao && tokenUsado !== null && token === tokenUsado) {
      token = null;
      if (typeof aoPerderSessao === 'function') aoPerderSessao();
    }
    return { status: resposta.status, corpo: json, ok: resposta.status >= 200 && resposta.status < 300 };
  }
  const sessao = operacoesDeSessao({
    chamar: (metodo, caminho, corpo, comToken) => chamar(metodo, caminho, corpo, { comToken }),
    lerToken: () => token,
    definirToken: (novo) => { token = novo; },
    rota: ROTAS.sessao,
    mensagens: { rede: MENSAGENS.rede, acesso: mensagemDeErro(403, null), falha: MENSAGENS.sessao },
  });

  return {
    sessaoPronta: () => token !== null,
    gravando: () => gravando,

    /** Lê a sessão (GET /__admin/sessao): usuário atual (ou null) e usuários selecionáveis; guarda o token, se houver. */
    recuperarSessao: sessao.recuperarSessao,
    /** Retoma a sessão já escolhida; sem usuário escolhido, falha com a orientação de escolher na Gestão de conteúdo. */
    iniciarSessao: sessao.retomarSessao,
    /** Entra com um usuário selecionável (POST só com usuarioId). */
    entrarComo: sessao.entrarComo,
    /** Sai: DELETE /__admin/sessao com o token atual e, depois, zera o token local. */
    sair: sessao.sair,

    /** Carrega o catálogo e o estado da versão atual de cada serviço (apenas o campo "estado" do manifesto é usado). */
    async carregarCatalogo() {
      if (token === null) return { ok: false, mensagem: MENSAGENS.sessao };
      const r = await chamar('GET', ROTAS.catalogo);
      if (r.falhaDeRede) return { ok: false, mensagem: MENSAGENS.rede };
      if (!r.ok || !catalogoValido(r.corpo)) return { ok: false, mensagem: r.status === 401 ? mensagemDeErro(401, r.corpo) : MENSAGENS.catalogo };
      const catalogo = { assuntos: r.corpo.assuntos, servicos: r.corpo.servicos };
      const estados = {};
      await Promise.all(catalogo.servicos.map(async (s) => {
        const v = await chamar('GET', `${ROTAS.servicos}/${encodeURIComponent(s.id)}/versao-atual`);
        estados[s.id] = v.ok && ehObjeto(v.corpo) && ehObjeto(v.corpo.manifesto) && ehTexto(v.corpo.manifesto.estado) ? v.corpo.manifesto.estado : null;
      }));
      return { ok: true, catalogo, estados };
    },

    /** Verifica a saúde do sistema (GET /__admin/saude). Retorna { ok, saude } ou { ok: false, mensagem }. */
    async carregarSaude() {
      if (token === null) return { ok: false, mensagem: MENSAGENS.sessao };
      const r = await chamar('GET', ROTAS.saude);
      if (r.falhaDeRede) return { ok: false, mensagem: MENSAGENS.rede };
      const saude = r.ok ? normalizarSaude(r.corpo) : null;
      if (saude === null) return { ok: false, mensagem: r.status === 401 ? mensagemDeErro(401, r.corpo) : MENSAGENS.saude };
      return { ok: true, saude };
    },

    /** Lê a versão atual de um serviço: estado, revisão das fontes e a lista de fontes (só campos de exibição). */
    async carregarFontes(servicoId) {
      if (token === null) return { ok: false, mensagem: MENSAGENS.sessao };
      if (!ehTexto(servicoId) || !PADRAO_ID.test(servicoId)) return { ok: false, mensagem: MENSAGENS.generica };
      const r = await chamar('GET', `${ROTAS.servicos}/${encodeURIComponent(servicoId)}/versao-atual`);
      if (r.falhaDeRede) return { ok: false, mensagem: MENSAGENS.rede };
      const c = r.corpo;
      const valido = r.ok && ehObjeto(c) && ehObjeto(c.manifesto) && ehTexto(c.manifesto.estado) && ehTexto(c.versaoId)
        && ehTexto(c.revisaoFontes) && /^[0-9a-f]{64}$/.test(c.revisaoFontes) && ehObjeto(c.fontes) && Array.isArray(c.fontes.fontes);
      if (!valido) return { ok: false, mensagem: r.status === 401 ? mensagemDeErro(401, r.corpo) : MENSAGENS.fontes };
      return { ok: true, versaoId: c.versaoId, estado: c.manifesto.estado, revisao: c.revisaoFontes, fontes: resumirFontes(c.fontes) };
    },

    /** Lê a versão atual do serviço para a tela de blocos de conhecimento. */
    async carregarConhecimento(servicoId) {
      if (token === null) return { ok: false, mensagem: MENSAGENS.sessao };
      if (!ehTexto(servicoId) || !PADRAO_ID.test(servicoId)) return { ok: false, mensagem: MENSAGENS.generica };
      const r = await chamar('GET', `${ROTAS.servicos}/${encodeURIComponent(servicoId)}/versao-atual`);
      if (r.falhaDeRede) return { ok: false, mensagem: MENSAGENS.rede };
      const resumo = r.ok ? resumirConhecimento(r.corpo) : null;
      if (resumo === null) return { ok: false, mensagem: r.status === 401 ? mensagemDeErro(401, r.corpo) : MENSAGENS.conhecimento };
      return { ok: true, ...resumo };
    },

    /**
     * Cria (operacao 'criar'), altera ('alterar') ou exclui ('excluir') um bloco de conhecimento. Uma gravação por vez no cliente.
     * Retorna { ok } ou { ok: false, mensagem, recarregar? } (recarregar: o estado mudou no servidor e a tela deve ser recarregada).
     */
    async gravarConhecimento(operacao, servicoId, blocoId, corpo) {
      if (!ehTexto(servicoId) || !PADRAO_ID.test(servicoId) || !['criar', 'alterar', 'excluir'].includes(operacao)) return { ok: false, mensagem: MENSAGENS.generica };
      if (operacao !== 'criar' && (!ehTexto(blocoId) || !PADRAO_ID.test(blocoId))) return { ok: false, mensagem: MENSAGENS.generica };
      if (token === null) return { ok: false, mensagem: MENSAGENS.sessao };
      if (gravando) return { ok: false, emAndamento: true, mensagem: MENSAGENS.emAndamento };
      const base = `${ROTAS.servicos}/${encodeURIComponent(servicoId)}/conhecimentos`;
      gravando = true;
      try {
        const r = operacao === 'criar' ? await chamar('POST', base, corpo)
          : operacao === 'alterar' ? await chamar('PATCH', `${base}/${encodeURIComponent(blocoId)}`, corpo)
            : await chamar('DELETE', `${base}/${encodeURIComponent(blocoId)}`);
        if (r.falhaDeRede) return { ok: false, mensagem: MENSAGENS.rede };
        const esperado = { criar: 201, alterar: 200, excluir: 204 }[operacao];
        if (r.status === esperado) return { ok: true };
        const recarregar = r.status === 404 || (r.status === 409 && ehObjeto(r.corpo) && ['versao_nao_editavel', 'bloco_nao_editavel', 'bloco_nao_removivel'].includes(r.corpo.erro));
        const mensagem = mensagemDeErro(r.status, r.corpo, 'conhecimento');
        return recarregar ? { ok: false, mensagem, recarregar: true } : { ok: false, mensagem };
      } finally {
        gravando = false;
      }
    },

    /** Lê a situação da revisão do serviço (fontes, informações, pendências e a revisão otimista a devolver em cada ação). */
    carregarRevisao(servicoId) {
      if (token === null) return Promise.resolve({ ok: false, mensagem: MENSAGENS.sessao });
      return lerRevisaoDoServico(chamar, servicoId, MENSAGENS.rede);
    },
    /** Resumo de autorização e publicação (somente leitura). */
    carregarResumoPublicacao(servicoId) {
      if (token === null) return Promise.resolve({ ok: false, mensagem: MENSAGENS.sessao });
      return lerResumoDePublicacao(chamar, servicoId, MENSAGENS.rede);
    },

    /** Grava uma ação da revisão. Uma gravação por vez; retorna { ok } ou { ok: false, mensagem, recarregar? }. */
    /** Campos atuais de uma fonte para o formulário de edição (o texto original só vem daqui, sob demanda). */
    async carregarFonteParaEdicao(servicoId, fonteId) {
      if (token === null) return { ok: false, mensagem: MENSAGENS.sessao };
      if (!idSeguro(servicoId) || !idSeguro(fonteId)) return { ok: false, mensagem: MENSAGENS.generica };
      const r = await chamar('GET', `${ROTAS.servicos}/${encodeURIComponent(servicoId)}/fontes/${encodeURIComponent(fonteId)}`);
      if (r.falhaDeRede) return { ok: false, mensagem: MENSAGENS.rede };
      const resumo = r.ok ? resumirFonteParaEdicao(r.corpo) : null;
      if (resumo === null) return { ok: false, mensagem: r.status === 401 || r.status === 404 || r.status === 409 ? mensagemDaFonte(r.status, r.corpo).mensagem : 'Não foi possível carregar esta fonte. Tente de novo.' };
      return { ok: true, ...resumo };
    },

    /** Impacto da exclusão de uma fonte (somente leitura): informações e conteúdo antigo afetados, em linguagem comum. */
    async carregarImpactoDaFonte(servicoId, fonteId) {
      if (token === null) return { ok: false, mensagem: MENSAGENS.sessao };
      if (!idSeguro(servicoId) || !idSeguro(fonteId)) return { ok: false, mensagem: MENSAGENS.generica };
      const r = await chamar('GET', `${ROTAS.servicos}/${encodeURIComponent(servicoId)}/fontes/${encodeURIComponent(fonteId)}/impacto`);
      if (r.falhaDeRede) return { ok: false, mensagem: MENSAGENS.rede };
      const resumo = r.ok ? resumirImpacto(r.corpo) : null;
      if (resumo === null) return { ok: false, ...(r.ok ? { mensagem: 'Não foi possível carregar o impacto da exclusão. Tente de novo.' } : mensagemDaFonte(r.status, r.corpo)) };
      return { ok: true, ...resumo };
    },

    /** Edita uma fonte (PATCH): `campos` só com o que mudou; a revisão atual vai junto. Retorna { ok, blocosReabertos } ou { ok: false, mensagem, ... }. */
    async editarFonte(servicoId, fonteId, campos, revisaoAtual) {
      if (token === null) return { ok: false, mensagem: MENSAGENS.sessao };
      if (!idSeguro(servicoId) || !idSeguro(fonteId) || !ehObjeto(campos) || !ehTexto(revisaoAtual)) return { ok: false, mensagem: MENSAGENS.generica };
      if (gravando) return { ok: false, emAndamento: true, mensagem: MENSAGENS.emAndamento };
      gravando = true;
      try {
        const r = await chamar('PATCH', `${ROTAS.servicos}/${encodeURIComponent(servicoId)}/fontes/${encodeURIComponent(fonteId)}`, { ...campos, revisao: revisaoAtual });
        if (r.falhaDeRede) return { ok: false, mensagem: MENSAGENS.rede };
        if (r.status === 200) return { ok: true, blocosReabertos: ehObjeto(r.corpo) && Number.isInteger(r.corpo.blocosReabertos) && r.corpo.blocosReabertos > 0 ? r.corpo.blocosReabertos : 0 };
        return { ok: false, ...mensagemDaFonte(r.status, r.corpo) };
      } finally {
        gravando = false;
      }
    },

    /** Exclusão LÓGICA (DELETE sem corpo; a revisão atual vai no cabeçalho X-Revisao). */
    async excluirFonte(servicoId, fonteId, revisaoAtual) {
      if (token === null) return { ok: false, mensagem: MENSAGENS.sessao };
      if (!idSeguro(servicoId) || !idSeguro(fonteId) || !ehTexto(revisaoAtual)) return { ok: false, mensagem: MENSAGENS.generica };
      if (gravando) return { ok: false, emAndamento: true, mensagem: MENSAGENS.emAndamento };
      gravando = true;
      try {
        const r = await chamar('DELETE', `${ROTAS.servicos}/${encodeURIComponent(servicoId)}/fontes/${encodeURIComponent(fonteId)}`, undefined, { extras: { 'X-Revisao': revisaoAtual } });
        if (r.falhaDeRede) return { ok: false, mensagem: MENSAGENS.rede };
        if (r.status === 200) return { ok: true };
        return { ok: false, ...mensagemDaFonte(r.status, r.corpo) };
      } finally {
        gravando = false;
      }
    },

    async gravarRevisao(acao, servicoId, corpo) {
      if (token === null) return { ok: false, mensagem: MENSAGENS.sessao };
      if (gravando) return { ok: false, emAndamento: true, mensagem: MENSAGENS.emAndamento };
      gravando = true;
      try {
        return await enviarAcaoDeRevisao(chamar, servicoId, acao, corpo, MENSAGENS.rede);
      } finally {
        gravando = false;
      }
    },

    /** Candidatos à importação de conteúdo existente (GET, somente leitura; nada é gravado). */
    async carregarCandidatosDeImportacao(servicoId) {
      if (token === null) return { ok: false, mensagem: MENSAGENS.sessao };
      if (!idSeguro(servicoId)) return { ok: false, mensagem: MENSAGENS.generica };
      const r = await chamar('GET', `${ROTAS.servicos}/${encodeURIComponent(servicoId)}/importacao`);
      if (r.falhaDeRede) return { ok: false, mensagem: MENSAGENS.rede };
      const resumo = r.ok ? resumirCandidatos(r.corpo) : null;
      if (resumo === null) return { ok: false, ...(r.ok ? { mensagem: 'Não foi possível carregar o conteúdo existente. Tente de novo.' } : mensagemDaRevisao(r.status, r.corpo)) };
      return { ok: true, ...resumo };
    },

    /** Importa UM item (POST): informação em elaboração. Retorna { ok } ou { ok: false, mensagem, recarregar? }. */
    async importarConteudo(servicoId, corpo) {
      if (token === null) return { ok: false, mensagem: MENSAGENS.sessao };
      if (!idSeguro(servicoId) || !ehObjeto(corpo)) return { ok: false, mensagem: MENSAGENS.generica };
      if (gravando) return { ok: false, emAndamento: true, mensagem: MENSAGENS.emAndamento };
      gravando = true;
      try {
        const r = await chamar('POST', `${ROTAS.servicos}/${encodeURIComponent(servicoId)}/importacao`, corpo);
        if (r.falhaDeRede) return { ok: false, mensagem: MENSAGENS.rede };
        if (r.status === 201) return { ok: true };
        return { ok: false, ...mensagemDaRevisao(r.status, r.corpo) };
      } finally {
        gravando = false;
      }
    },

    /**
     * Cadastra um assunto, um serviço ou uma fonte (nesse caso, `contexto.servicoId` indica o serviço).
     * Retorna { ok, item } ou { ok: false, mensagem }.
     */
    async cadastrar(tipo, corpo, contexto = {}) {
      let rota = null;
      if (tipo === 'assunto') rota = ROTAS.assuntos;
      else if (tipo === 'servico') rota = ROTAS.servicos;
      else if (tipo === 'fonte' && ehTexto(contexto.servicoId) && PADRAO_ID.test(contexto.servicoId)) rota = `${ROTAS.servicos}/${encodeURIComponent(contexto.servicoId)}/fontes`;
      if (rota === null) return { ok: false, mensagem: MENSAGENS.generica };
      if (token === null) return { ok: false, mensagem: MENSAGENS.sessao };
      if (gravando) return { ok: false, emAndamento: true, mensagem: MENSAGENS.emAndamento };
      gravando = true;
      try {
        const r = await chamar('POST', rota, corpo);
        if (r.falhaDeRede) return { ok: false, mensagem: MENSAGENS.rede };
        if (r.status === 201 && ehObjeto(r.corpo)) {
          const item = tipo === 'assunto' ? r.corpo.assunto : tipo === 'servico' ? r.corpo.servico : r.corpo.fonte;
          const nome = tipo === 'fonte' && ehObjeto(item) ? item.titulo : ehObjeto(item) ? item.nome : null;
          if (ehObjeto(item) && ehTexto(item.id) && ehTexto(nome)) return { ok: true, item: { id: item.id, nome } };
        }
        // Só para a tela recarregar a lista de fontes: o código vem de uma lista fixa, nunca da resposta bruta.
        const codigo = ehObjeto(r.corpo) ? r.corpo.erro : null;
        const recarregar = tipo === 'fonte' && r.status === 409 && (codigo === 'revisao_divergente' || codigo === 'versao_nao_editavel');
        return recarregar ? { ok: false, mensagem: mensagemDeErro(r.status, r.corpo), recarregar: true } : { ok: false, mensagem: mensagemDeErro(r.status, r.corpo) };
      } finally {
        gravando = false;
      }
    },
  };
}

// ---------- Gestão por serviço (Passo 4B2): entrada de demonstração, serviço com tema e informações ----------
// Tudo aqui é lógica pura mais um cliente com `fetch` injetável. O token de demonstração fica só numa variável do cliente.

export const ROTAS_GESTAO = Object.freeze({
  sessao: '/__admin/sessao',
  catalogo: '/__admin/catalogo',
  servicoComTema: '/__admin/servico-com-tema',
});
export const LIMITES_GESTAO = Object.freeze({ nome: 120, tema: 120, titulo: 200, texto: 20000, descricao: 1000, orgao: 120, url: 500, consulta: 100 });
export const TIPOS_LINK = Object.freeze([
  ['pagina_oficial', 'Página de um site oficial'],
  ['legislacao', 'Lei, decreto ou norma'],
  ['manual', 'Manual ou guia'],
  ['outro', 'Outro'],
]);
export const AVISO_DADOS_PESSOAIS = 'Não escreva dados pessoais (CPF, telefone, e-mail, endereço) nem conteúdo restrito ou sigiloso.';
export const MENSAGENS_GESTAO = Object.freeze({
  rede: 'Não foi possível falar com o servidor local. Confira se ele está ativo e tente de novo.',
  entrada: 'Não foi possível acessar a administração. Tente de novo.',
  catalogo: 'Não foi possível carregar os serviços. Tente de novo.',
  informacoes: 'Não foi possível carregar as informações deste serviço. Tente de novo.',
  busca: 'Não foi possível buscar os links cadastrados. Tente de novo.',
  semEntrada: 'Acesse a administração para continuar.',
  expirada: 'Sua entrada expirou. Saia e entre de novo.',
  acessoLocal: 'Acesso recusado. Esta área só funciona neste computador.',
  ocupado: 'Há outra gravação em andamento, tente de novo.',
  generica: 'Não foi possível concluir. Nada foi salvo.',
  naoEditavel: 'Este serviço não está em elaboração e não aceita novas informações.',
  naoEncontrado: 'Não encontramos o serviço ou o link escolhido. A lista foi atualizada.',
  nomeRepetido: 'Já existe um serviço com este nome.',
  urlRepetida: 'Este link já está cadastrado neste serviço.',
  linkRepetido: 'Este link já está neste serviço.',
});
const MENSAGEM_DO_CAMPO = Object.freeze({
  nome: 'Revise o nome do serviço.',
  tema: 'Revise o tema.',
  titulo: 'Revise o título.',
  texto: 'Revise o texto. Ele precisa ter conteúdo e não pode ter dados pessoais nem senhas.',
  descricao: 'Revise a descrição.',
  orgaoResponsavel: 'Revise o órgão responsável.',
  tipo: 'Escolha o tipo do link.',
  url: 'Revise o endereço do link. Use um endereço que comece com https://.',
  origemOficial: 'Revise a indicação de site oficial.',
});

/** Temas (assuntos ativos) em ordem alfabética: só id e nome. */
export function temasAtivos(catalogo) {
  const lista = ehObjeto(catalogo) && Array.isArray(catalogo.assuntos) ? catalogo.assuntos : [];
  return lista
    .filter((a) => ehObjeto(a) && a.ativo !== false && ehTexto(a.id) && ehTexto(a.nome) && a.nome !== '')
    .map((a) => ({ id: a.id, nome: a.nome }))
    .sort((x, y) => x.nome.localeCompare(y.nome, 'pt-BR'));
}

/** Serviços para a lista (com busca por nome ou tema, sem acento nem maiúscula): só id, nome e tema. */
export function servicosDaLista(catalogo, consulta = '') {
  const servicos = ehObjeto(catalogo) && Array.isArray(catalogo.servicos) ? catalogo.servicos : [];
  const nomesDosTemas = new Map(temasAtivos(catalogo).map((t) => [t.id, t.nome]));
  const termo = normalizar(consulta);
  return servicos
    .filter((s) => ehObjeto(s) && ehTexto(s.id) && PADRAO_ID.test(s.id) && ehTexto(s.nome) && s.nome !== '')
    .map((s) => ({ id: s.id, nome: s.nome, temaNome: nomesDosTemas.get(s.assuntoId) ?? '' }))
    .filter((s) => termo === '' || normalizar(`${s.nome} ${s.temaNome}`).includes(termo))
    .sort((x, y) => x.nome.localeCompare(y.nome, 'pt-BR'));
}

/** Se o texto digitado é um tema existente (sem diferença de acento ou maiúscula), usa o existente; senão, é um tema novo. */
export function resolverTema(texto, temas) {
  const alvo = normalizar(texto);
  const achado = (Array.isArray(temas) ? temas : []).find((t) => normalizar(t.nome) === alvo);
  return achado ? { id: achado.id } : { nome: String(texto ?? '').trim().replace(/\s+/g, ' ') };
}

/** Verdadeiro se o texto parece ter e-mail, telefone, CPF ou credencial (a conferência definitiva é do servidor). */
export function pareceDadoPessoal(texto) {
  const t = String(texto ?? '');
  return contemEmailNaoPermitido(t) || PADRAO_TELEFONE.test(t) || /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/.test(t)
    || /\b(senha|password|token|api[ _-]?key|chave de acesso)\s*[:=]/i.test(t);
}

const textoAparado = (v) => (ehTexto(v) ? v.trim().replace(/\s+/g, ' ') : '');

function validarTitulo(valores, erros, dados) {
  const titulo = textoAparado(valores.titulo);
  if (titulo === '') erros.titulo = 'Escreva um título.';
  else if (titulo.length > LIMITES_GESTAO.titulo) erros.titulo = `Use até ${LIMITES_GESTAO.titulo} caracteres no título.`;
  else if (pareceDadoPessoal(titulo)) erros.titulo = 'O título não pode ter dados pessoais nem senhas.';
  dados.titulo = titulo;
}

/** Novo serviço: só nome e tema. Retorna { ok, erros, corpo } (corpo só com nome e tema). */
export function validarNovoServico(valores, temas) {
  const v = ehObjeto(valores) ? valores : {};
  const erros = {};
  const nome = textoAparado(v.nome);
  if (nome === '') erros.nome = 'Escreva o nome do serviço.';
  else if (nome.length > LIMITES_GESTAO.nome) erros.nome = `Use até ${LIMITES_GESTAO.nome} caracteres no nome.`;
  else if (!/[\p{L}\p{N}]/u.test(nome)) erros.nome = 'O nome precisa ter letras ou números.';
  const tema = textoAparado(v.tema);
  if (tema === '') erros.tema = 'Escolha um tema da lista ou escreva um novo.';
  else if (tema.length > LIMITES_GESTAO.tema) erros.tema = `Use até ${LIMITES_GESTAO.tema} caracteres no tema.`;
  else if (!/[\p{L}\p{N}]/u.test(tema)) erros.tema = 'O tema precisa ter letras ou números.';
  if (Object.keys(erros).length) return { ok: false, erros };
  return { ok: true, erros: {}, corpo: { nome, tema: resolverTema(tema, temas) } };
}

/** Informação em texto: título e texto obrigatórios; descrição e órgão opcionais. */
export function validarEntradaTexto(valores) {
  const v = ehObjeto(valores) ? valores : {};
  const erros = {};
  const dados = {};
  validarTitulo(v, erros, dados);
  const texto = ehTexto(v.texto) ? v.texto.trim() : '';
  if (texto === '') erros.texto = 'Escreva o texto da informação.';
  else if (Array.from(texto).length > LIMITES_GESTAO.texto) erros.texto = `Use até ${LIMITES_GESTAO.texto.toLocaleString('pt-BR')} caracteres no texto.`;
  else if (pareceDadoPessoal(texto)) erros.texto = 'O texto parece ter dado pessoal, telefone, e-mail ou senha. Retire essa parte e tente de novo.';
  const descricao = textoAparado(v.descricao);
  if (descricao.length > LIMITES_GESTAO.descricao) erros.descricao = `Use até ${LIMITES_GESTAO.descricao} caracteres na descrição.`;
  else if (pareceDadoPessoal(descricao)) erros.descricao = 'A descrição não pode ter dados pessoais nem senhas.';
  const orgao = textoAparado(v.orgaoResponsavel);
  if (orgao.length > LIMITES_GESTAO.orgao) erros.orgaoResponsavel = `Use até ${LIMITES_GESTAO.orgao} caracteres no órgão.`;
  if (Object.keys(erros).length) return { ok: false, erros };
  const corpo = { titulo: dados.titulo, texto };
  if (descricao !== '') corpo.descricao = descricao;
  if (orgao !== '') corpo.orgaoResponsavel = orgao;
  return { ok: true, erros: {}, corpo };
}

/** Link novo: título, tipo, órgão, endereço https e descrição obrigatórios. */
export function validarLinkNovo(valores) {
  const v = ehObjeto(valores) ? valores : {};
  const erros = {};
  const dados = {};
  validarTitulo(v, erros, dados);
  const tipo = ehTexto(v.tipo) ? v.tipo : '';
  if (!TIPOS_LINK.some(([valor]) => valor === tipo)) erros.tipo = 'Escolha o tipo do link.';
  const orgao = textoAparado(v.orgaoResponsavel);
  if (orgao === '') erros.orgaoResponsavel = 'Informe o órgão responsável.';
  else if (orgao.length > LIMITES_GESTAO.orgao) erros.orgaoResponsavel = `Use até ${LIMITES_GESTAO.orgao} caracteres no órgão.`;
  const descricao = textoAparado(v.descricao);
  if (descricao === '') erros.descricao = 'Escreva uma descrição curta do link.';
  else if (descricao.length > LIMITES_GESTAO.descricao) erros.descricao = `Use até ${LIMITES_GESTAO.descricao} caracteres na descrição.`;
  else if (pareceDadoPessoal(descricao)) erros.descricao = 'A descrição não pode ter dados pessoais nem senhas.';
  const url = ehTexto(v.url) ? v.url.trim() : '';
  if (url === '') erros.url = 'Informe o endereço do link.';
  else if (url.length > LIMITES_GESTAO.url) erros.url = `Use até ${LIMITES_GESTAO.url} caracteres no endereço.`;
  else {
    let objeto = null;
    try { objeto = new URL(url); } catch { /* endereço inválido, tratado abaixo */ }
    if (objeto === null || objeto.protocol !== 'https:' || !objeto.hostname.includes('.')) erros.url = 'Use um endereço completo que comece com https://.';
    else if (objeto.username !== '' || objeto.password !== '' || /\s/.test(url)) erros.url = 'O endereço não pode ter usuário, senha nem espaços.';
    else if (pareceDadoPessoal(url)) erros.url = 'O endereço parece ter dado pessoal ou senha. Use o endereço público da página.';
  }
  if (Object.keys(erros).length) return { ok: false, erros };
  return { ok: true, erros: {}, corpo: { titulo: dados.titulo, tipo, orgaoResponsavel: orgao, url, descricao, origemOficial: v.origemOficial === true } };
}

const ROTULO_SITUACAO_INFORMACAO = Object.freeze({ rascunho: 'Em elaboração', em_validacao: 'Em análise', validado: 'Validada' });
const httpsOuNulo = (v) => {
  if (!ehTexto(v)) return null;
  try { return new URL(v).protocol === 'https:' ? v : null; } catch { return null; }
};

/** Lista de informações de um serviço, só com o que é exibido (nada de identificadores). */
export function resumirInformacoes(corpo) {
  if (!ehObjeto(corpo) || !Array.isArray(corpo.itens)) return null;
  const itens = corpo.itens.filter(ehObjeto).filter((i) => ehTexto(i.titulo) && (i.tipo === 'texto' || i.tipo === 'link')).map((i) => ({
    tipo: i.tipo,
    titulo: i.titulo,
    descricao: ehTexto(i.descricao) ? i.descricao : '',
    texto: i.tipo === 'texto' && ehTexto(i.texto) ? i.texto : '',
    textoCortado: i.textoCortado === true,
    data: ehTexto(i.criadoEm) ? formatarDataBr(i.criadoEm.slice(0, 10)) : '',
    url: i.tipo === 'link' ? httpsOuNulo(i.url) : null,
    orgao: ehTexto(i.orgaoResponsavel) ? i.orgaoResponsavel : '',
    situacao: Object.hasOwn(ROTULO_SITUACAO_INFORMACAO, i.situacao) ? ROTULO_SITUACAO_INFORMACAO[i.situacao] : 'Em elaboração',
    reutilizado: ehObjeto(i.reutilizadoDe) || (ehTexto(i.reutilizadoDe) && i.reutilizadoDe !== ''),
  }));
  return { editavel: corpo.estadoVersao === 'rascunho' || corpo.estadoVersao === undefined, itens };
}

/** Resultado da busca por links já cadastrados. A identidade (servicoId e fonteId) fica só para o envio; nunca é exibida. */
export function resumirLinksExistentes(corpo) {
  if (!ehObjeto(corpo) || !Array.isArray(corpo.itens)) return null;
  const itens = corpo.itens.filter(ehObjeto)
    .filter((i) => ehTexto(i.servicoId) && PADRAO_ID.test(i.servicoId) && ehTexto(i.fonteId) && PADRAO_ID.test(i.fonteId) && ehTexto(i.titulo))
    .map((i) => ({
      identidade: { servicoId: i.servicoId, fonteId: i.fonteId },
      titulo: i.titulo,
      descricao: ehTexto(i.descricao) ? i.descricao : '',
      orgao: ehTexto(i.orgaoResponsavel) ? i.orgaoResponsavel : '',
      url: httpsOuNulo(i.url),
      jaNoServico: i.jaNoServico === true,
    }));
  return { itens, truncado: corpo.truncado === true };
}

/** Corpo do uso de um link já cadastrado: SÓ a identidade, nunca o objeto da fonte. */
export const corpoDoLinkExistente = (item) => ({ servicoId: item.identidade.servicoId, fonteId: item.identidade.fonteId });

/** Mensagem curta por código. Nunca usa texto da resposta. Em 422, `erros` traz mensagens por campo. */
export function mensagemDaGestao(status, corpo, contexto = 'geral') {
  const erro = ehObjeto(corpo) && ehTexto(corpo.erro) ? corpo.erro : null;
  const campo = ehObjeto(corpo) && ehTexto(corpo.campo) ? corpo.campo : null;
  if (status === 401) return { mensagem: MENSAGENS_GESTAO.expirada };
  if (status === 403) return { mensagem: MENSAGENS_GESTAO.acessoLocal };
  if (status === 404) return { mensagem: MENSAGENS_GESTAO.naoEncontrado, recarregar: true };
  if (status === 409) {
    if (erro === 'operacao_em_andamento') return { mensagem: MENSAGENS_GESTAO.ocupado, emAndamento: true };
    if (erro === 'versao_nao_editavel') return { mensagem: MENSAGENS_GESTAO.naoEditavel, recarregar: true };
    if (campo === 'nome') return { mensagem: MENSAGENS_GESTAO.nomeRepetido, erros: { nome: MENSAGENS_GESTAO.nomeRepetido } };
    if (campo === 'url') return { mensagem: MENSAGENS_GESTAO.urlRepetida, erros: { url: MENSAGENS_GESTAO.urlRepetida } };
    if (contexto === 'link-existente') return { mensagem: MENSAGENS_GESTAO.linkRepetido, recarregar: true };
    return { mensagem: MENSAGENS_GESTAO.generica };
  }
  if (status === 413) return { mensagem: 'O texto enviado é grande demais. Reduza o tamanho e tente de novo.' };
  if (status === 422) {
    const campos = ehObjeto(corpo) && Array.isArray(corpo.campos) ? corpo.campos.filter((c) => ehTexto(c) && Object.hasOwn(MENSAGEM_DO_CAMPO, c)) : [];
    const erros = {};
    for (const c of campos) erros[c] = MENSAGEM_DO_CAMPO[c];
    return campos.length ? { mensagem: 'Revise os campos indicados e tente de novo.', erros } : { mensagem: 'Revise os dados e tente de novo.' };
  }
  if (status === 500) return { mensagem: 'O servidor local não conseguiu concluir. Nada foi salvo; tente de novo.' };
  return { mensagem: MENSAGENS_GESTAO.generica };
}

/**
 * Cliente da gestão por serviço. O token vem da sessão (POST /__admin/sessao ao escolher o usuário, ou GET para retomá-la) e
 * fica só nesta variável (memória).
 * Gravações são uma por vez: com uma em andamento, a seguinte nem é enviada.
 */
export function criarClienteGestao({ fetchImpl, aoPerderSessao } = {}) {
  let token = null;
  let gravando = false;

  async function chamar(metodo, caminho, corpo, comToken = true) {
    const cabecalhos = { Accept: 'application/json' };
    const tokenUsado = token;
    if (comToken) cabecalhos[CABECALHO_TOKEN] = token;
    const opcoes = { method: metodo, headers: cabecalhos, cache: 'no-store', credentials: 'omit', redirect: 'error' };
    if (corpo !== undefined) {
      cabecalhos['Content-Type'] = 'application/json';
      opcoes.body = JSON.stringify(corpo);
    }
    let resposta;
    try {
      resposta = await fetchImpl(caminho, opcoes);
    } catch {
      return { falhaDeRede: true };
    }
    let json = null;
    try { json = await resposta.json(); } catch { /* sem corpo legível: vale só o status */ }
    // 401 com o token em uso: o usuário da sessão mudou (outra aba ou reinício). Zera o token e avisa a tela.
    if (comToken && resposta.status === 401 && caminho !== ROTAS_GESTAO.sessao && tokenUsado !== null && token === tokenUsado) {
      token = null;
      if (typeof aoPerderSessao === 'function') aoPerderSessao();
    }
    return { status: resposta.status, corpo: json, ok: resposta.status >= 200 && resposta.status < 300 };
  }
  const sessao = operacoesDeSessao({
    chamar,
    lerToken: () => token,
    definirToken: (novo) => { token = novo; },
    rota: ROTAS_GESTAO.sessao,
    mensagens: { rede: MENSAGENS_GESTAO.rede, acesso: MENSAGENS_GESTAO.acessoLocal, falha: MENSAGENS_GESTAO.entrada },
  });
  const rotaDoServico = (id, final) => `/__admin/servicos/${encodeURIComponent(id)}/${final}`;
  const idOk = (id) => ehTexto(id) && PADRAO_ID.test(id);
  const recusa = () => Promise.resolve({ ok: false, mensagem: MENSAGENS_GESTAO.generica });
  const falha = (r, contexto) => (r.falhaDeRede ? { ok: false, mensagem: MENSAGENS_GESTAO.rede } : { ok: false, ...mensagemDaGestao(r.status, r.corpo, contexto) });

  // Única porta de gravação: uma por vez, sempre POST JSON.
  async function gravar(caminho, corpo, aoCriar, contexto) {
    if (token === null) return { ok: false, mensagem: MENSAGENS_GESTAO.semEntrada };
    if (gravando) return { ok: false, emAndamento: true, mensagem: MENSAGENS_GESTAO.ocupado };
    gravando = true;
    try {
      const r = await chamar('POST', caminho, corpo);
      if (r.status === 201 && ehObjeto(r.corpo)) {
        const resultado = aoCriar(r.corpo);
        if (resultado !== null) return { ok: true, ...resultado };
      }
      return falha(r, contexto);
    } finally {
      gravando = false;
    }
  }

  return {
    entrou: () => token !== null,
    gravando: () => gravando,
    /** Sai: DELETE /__admin/sessao com o token atual e, depois, zera o token local. */
    sair: sessao.sair,
    /** Lê a sessão: usuário atual (ou null) e usuários selecionáveis; guarda o token, se houver. */
    recuperarSessao: sessao.recuperarSessao,
    /** Retoma a sessão já escolhida (sem escolher usuário). */
    entrar: sessao.retomarSessao,
    /** Entra com um usuário selecionável (POST só com usuarioId). */
    entrarComo: sessao.entrarComo,

    async carregarCatalogo() {
      if (token === null) return { ok: false, mensagem: MENSAGENS_GESTAO.semEntrada };
      const r = await chamar('GET', ROTAS_GESTAO.catalogo);
      if (r.falhaDeRede) return { ok: false, mensagem: MENSAGENS_GESTAO.rede };
      if (!r.ok || !catalogoValido(r.corpo)) return { ok: false, mensagem: r.status === 401 ? MENSAGENS_GESTAO.expirada : MENSAGENS_GESTAO.catalogo };
      return { ok: true, catalogo: { assuntos: r.corpo.assuntos, servicos: r.corpo.servicos } };
    },

    async carregarInformacoes(servicoId) {
      if (token === null) return { ok: false, mensagem: MENSAGENS_GESTAO.semEntrada };
      if (!idOk(servicoId)) return { ok: false, mensagem: MENSAGENS_GESTAO.generica };
      const r = await chamar('GET', rotaDoServico(servicoId, 'informacoes'));
      if (r.falhaDeRede) return { ok: false, mensagem: MENSAGENS_GESTAO.rede };
      const resumo = r.ok ? resumirInformacoes(r.corpo) : null;
      if (resumo === null) return { ok: false, mensagem: r.status === 401 ? MENSAGENS_GESTAO.expirada : MENSAGENS_GESTAO.informacoes };
      return { ok: true, ...resumo };
    },

    async buscarLinks(servicoId, consulta) {
      if (token === null) return { ok: false, mensagem: MENSAGENS_GESTAO.semEntrada };
      if (!idOk(servicoId)) return { ok: false, mensagem: MENSAGENS_GESTAO.generica };
      const corpo = {};
      const c = textoAparado(consulta);
      if (c !== '') corpo.consulta = c.slice(0, LIMITES_GESTAO.consulta);
      const r = await chamar('POST', rotaDoServico(servicoId, 'links-existentes/busca'), corpo);
      if (r.falhaDeRede) return { ok: false, mensagem: MENSAGENS_GESTAO.rede };
      const resumo = r.ok ? resumirLinksExistentes(r.corpo) : null;
      if (resumo === null) return { ok: false, mensagem: r.status === 401 ? MENSAGENS_GESTAO.expirada : MENSAGENS_GESTAO.busca };
      return { ok: true, ...resumo };
    },

    carregarRevisao(servicoId) {
      if (token === null) return Promise.resolve({ ok: false, mensagem: MENSAGENS_GESTAO.semEntrada });
      return lerRevisaoDoServico(chamar, servicoId, MENSAGENS_GESTAO.rede);
    },
    carregarResumoPublicacao(servicoId) {
      if (token === null) return Promise.resolve({ ok: false, mensagem: MENSAGENS_GESTAO.semEntrada });
      return lerResumoDePublicacao(chamar, servicoId, MENSAGENS_GESTAO.rede);
    },
    /** Cria uma nova versão editável a partir da versão concluída. Envia exatamente `{}`. */
    async criarNovaVersao(servicoId) {
      if (token === null) return { ok: false, mensagem: MENSAGENS_GESTAO.semEntrada };
      if (gravando) return { ok: false, emAndamento: true, mensagem: MENSAGENS_GESTAO.ocupado };
      gravando = true;
      try {
        return await enviarAcaoDeRevisao(chamar, servicoId, 'nova-versao', {}, MENSAGENS_GESTAO.rede);
      } finally {
        gravando = false;
      }
    },
    criarServico: (corpo) => gravar(ROTAS_GESTAO.servicoComTema, corpo, (c) => (
      ehObjeto(c.servico) && ehTexto(c.servico.id) && PADRAO_ID.test(c.servico.id) && ehTexto(c.servico.nome)
        ? { servico: { id: c.servico.id, nome: c.servico.nome, temaNome: ehTexto(c.servico.temaNome) ? c.servico.temaNome : '' }, temaCriado: c.temaCriado === true }
        : null), 'servico'),
    adicionarTexto: (servicoId, corpo) => (idOk(servicoId)
      ? gravar(rotaDoServico(servicoId, 'entradas-texto'), corpo, (c) => (c.criado === true ? {} : null), 'texto')
      : recusa()),
    adicionarLink: (servicoId, corpo) => (idOk(servicoId)
      ? gravar(rotaDoServico(servicoId, 'links'), corpo, (c) => (ehObjeto(c.fonte) ? {} : null), 'link')
      : recusa()),
    usarLinkExistente: (servicoId, item) => (idOk(servicoId) && ehObjeto(item) && ehObjeto(item.identidade)
      ? gravar(rotaDoServico(servicoId, 'links-existentes'), corpoDoLinkExistente(item), (c) => (ehObjeto(c.fonte) ? {} : null), 'link-existente')
      : recusa()),

    /** Nome e serviços afetados de um tema (somente leitura), com a revisão a devolver ao salvar. */
    async carregarEdicaoDoTema(temaId) {
      if (token === null) return { ok: false, mensagem: MENSAGENS_GESTAO.semEntrada };
      if (!idOk(temaId)) return { ok: false, mensagem: MENSAGENS_GESTAO.generica };
      const r = await chamar('GET', `/__admin/temas/${encodeURIComponent(temaId)}/edicao`);
      if (r.falhaDeRede) return { ok: false, mensagem: MENSAGENS_GESTAO.rede };
      const resumo = r.ok ? resumirEdicaoDoTema(r.corpo) : null;
      if (resumo === null) return { ok: false, ...(r.ok ? { mensagem: 'Não foi possível carregar o tema. Tente de novo.' } : mensagemDaEdicao(r.status, r.corpo, 'tema')) };
      return { ok: true, ...resumo };
    },
    /** Nome, tema e informações aceitas do serviço aberto (somente leitura), com a revisão a devolver ao salvar. */
    async carregarEdicaoDoServico(servicoId) {
      if (token === null) return { ok: false, mensagem: MENSAGENS_GESTAO.semEntrada };
      if (!idOk(servicoId)) return { ok: false, mensagem: MENSAGENS_GESTAO.generica };
      const r = await chamar('GET', rotaDoServico(servicoId, 'edicao'));
      if (r.falhaDeRede) return { ok: false, mensagem: MENSAGENS_GESTAO.rede };
      const resumo = r.ok ? resumirEdicaoDoServico(r.corpo) : null;
      if (resumo === null) return { ok: false, ...(r.ok ? { mensagem: 'Não foi possível carregar o serviço. Tente de novo.' } : mensagemDaEdicao(r.status, r.corpo)) };
      return { ok: true, ...resumo };
    },
    /** Altera o nome do tema (PATCH). A confirmação já foi dada pela pessoa no diálogo de impacto. Uma gravação por vez. */
    async editarTema(temaId, nome, revisaoAtual) {
      if (token === null) return { ok: false, mensagem: MENSAGENS_GESTAO.semEntrada };
      if (!idOk(temaId) || !ehTexto(nome) || !ehTexto(revisaoAtual)) return { ok: false, mensagem: MENSAGENS_GESTAO.generica };
      if (gravando) return { ok: false, emAndamento: true, mensagem: MENSAGENS_GESTAO.ocupado };
      gravando = true;
      try {
        const r = await chamar('PATCH', `/__admin/temas/${encodeURIComponent(temaId)}/edicao`, { revisao: revisaoAtual, nome, confirmado: true });
        if (r.falhaDeRede) return { ok: false, mensagem: MENSAGENS_GESTAO.rede };
        if (r.status === 200) return { ok: true };
        return { ok: false, ...mensagemDaEdicao(r.status, r.corpo, 'tema') };
      } finally {
        gravando = false;
      }
    },
    /** Altera nome e/ou tema do serviço (PATCH): `corpo` só com o que mudou; `confirmado` só depois do diálogo de impacto. */
    async editarServico(servicoId, corpo, revisaoAtual, confirmado) {
      if (token === null) return { ok: false, mensagem: MENSAGENS_GESTAO.semEntrada };
      if (!idOk(servicoId) || !ehObjeto(corpo) || !ehTexto(revisaoAtual)) return { ok: false, mensagem: MENSAGENS_GESTAO.generica };
      if (gravando) return { ok: false, emAndamento: true, mensagem: MENSAGENS_GESTAO.ocupado };
      gravando = true;
      try {
        const r = await chamar('PATCH', rotaDoServico(servicoId, 'edicao'), { ...corpo, revisao: revisaoAtual, ...(confirmado === true ? { confirmado: true } : {}) });
        if (r.falhaDeRede) return { ok: false, mensagem: MENSAGENS_GESTAO.rede };
        if (r.status === 200) return { ok: true, blocosReabertos: ehObjeto(r.corpo) && Number.isInteger(r.corpo.blocosReabertos) ? r.corpo.blocosReabertos : 0 };
        return { ok: false, ...mensagemDaEdicao(r.status, r.corpo) };
      } finally {
        gravando = false;
      }
    },
  };
}

// ---------- Revisão do conteúdo (Passo 5B2) ----------
// Lógica pura mais os trechos de cliente compartilhados pelas duas páginas ("Gestão de conteúdo"). Nunca exibe ids, hashes,
// códigos internos nem nomes técnicos de estado: tudo vem de rótulos em linguagem comum. A publicação não existe nesta etapa.

export const TEXTO_CONFIRMAR_CONCLUSAO = 'Depois de concluir, esta versão não poderá mais ser editada. Para fazer novas alterações, será necessário criar uma nova versão.';
export const MENSAGEM_REVISAO_DIVERGENTE = 'O conteúdo mudou. Os dados foram atualizados; confira e tente de novo.';
const ROTULO_PADRAO_SITUACAO = 'Situação indisponível';
const ACOES_REVISAO = Object.freeze({
  fonte: 'revisao/fontes',
  'bloco-aceitar': 'revisao/blocos/aceitar',
  'bloco-rejeitar': 'revisao/blocos/rejeitar',
  'bloco-reabrir': 'revisao/blocos/reabrir',
  concluir: 'revisao/concluir',
  'nova-versao': 'nova-versao',
  autorizar: 'autorizacao',
  publicar: 'publicacao',
  revogar: 'revogacao',
});
const textoCurto = (v, limite = 200) => (ehTexto(v) ? v.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, limite) : '');
const idSeguro = (v) => ehTexto(v) && PADRAO_ID.test(v);
const contagem = (v) => (Number.isInteger(v) && v >= 0 ? v : 0);

/** Rótulo do tipo da fonte: nunca devolve o texto original. */
export const rotuloFormaDaFonte = (forma) => (forma === 'link' ? 'Link' : 'Texto informado');
export function rotuloSituacaoDaFonte(f) {
  if (f.excluida) return 'Excluída';
  if (f.revogada) return 'Revogada';
  if (f.revisada) return 'Revisado';
  // Fonte que nenhum bloco usa pode ficar sem revisão: não é pendência para concluir.
  return f.usadaPorBloco === false ? 'Ainda não revisada' : 'Revisão pendente';
}
export const rotuloSituacaoDoBloco = (aceito) => (aceito ? 'Aceita' : 'Em elaboração');

/** Resumo em uma frase: só blocos pendentes e fontes usadas por eles contam como pendência para concluir. */
export function frasePendenciasParaConcluir(resumo) {
  const n = resumo.pendenciasParaConcluir;
  const pendencias = n === 0 ? 'Nenhuma pendência para concluir.' : n === 1 ? '1 pendência para concluir.' : `${n} pendências para concluir.`;
  const nao = resumo.fontesNaoUsadas;
  const naoUsadas = nao > 0 ? ` ${nao === 1 ? '1 documento ou link ainda não é usado por nenhuma informação' : `${nao} documentos ou links ainda não são usados por nenhuma informação`}; isso não impede a conclusão.` : '';
  return `${pendencias} Informações aceitas: ${resumo.informacoesAceitas}.${naoUsadas}`;
}

/** Traduz uma pendência da API para uma frase comum. O título (nome dado pelo servidor) é o único dado variável. */
export function traduzirPendencia(p) {
  const titulo = ehObjeto(p) ? textoCurto(p.titulo) : '';
  const nome = titulo === '' ? '' : ` "${titulo}"`;
  switch (ehObjeto(p) ? p.codigo : null) {
    case 'sem_bloco_aceito': return FRASE_SEM_INFORMACAO_ACEITA;
    case 'bloco_pendente': return `A informação${nome} ainda não foi aceita nem excluída.`;
    case 'fonte_pendente': return `O documento ou link${nome} ainda não foi revisado.`;
    case 'fonte_revogada': return `O documento ou link${nome} foi revogado e não pode mais ser usado.`;
    case 'fonte_inexistente': return `A informação${nome} usa um documento ou link que não existe mais. Edite a informação.`;
    case 'entrada_invalida': return 'Há um dado inválido neste serviço. Procure a equipe responsável.';
    default: return 'Há uma pendência a resolver antes de concluir a revisão.';
  }
}

/** Resume GET .../revisao só com o que a tela usa. Retorna null se o formato não for o esperado. */
export function resumirRevisao(corpo) {
  if (!ehObjeto(corpo) || !ehTexto(corpo.revisao) || corpo.revisao === '' || corpo.revisao.length > 200) return null;
  if (!ehObjeto(corpo.resumo) || !Array.isArray(corpo.fontes) || !Array.isArray(corpo.blocos) || !Array.isArray(corpo.pendencias)) return null;
  const fontes = corpo.fontes.filter(ehObjeto).filter((f) => idSeguro(f.id)).map((f) => {
    const base = { id: f.id, titulo: textoCurto(f.titulo) || 'Documento ou link', forma: f.forma === 'link' ? 'link' : 'texto', revisada: f.revisada === true, revogada: f.revogada === true, excluida: f.excluida === true, usadaPorBloco: f.usadaPorBloco === true, podeRevisar: f.podeRevisar === true, podeEditar: f.podeEditar === true, podeExcluir: f.podeExcluir === true };
    return { ...base, rotuloForma: rotuloFormaDaFonte(base.forma), situacao: rotuloSituacaoDaFonte(base) };
  });
  const blocos = corpo.blocos.filter(ehObjeto).filter((b) => idSeguro(b.id)).map((b) => ({
    id: b.id,
    titulo: textoCurto(b.titulo),
    aceito: b.aceito === true,
    situacao: rotuloSituacaoDoBloco(b.aceito === true),
    fontesPendentes: Array.isArray(b.fontesPendentes) ? b.fontesPendentes.filter(idSeguro) : [],
    podeAceitar: b.podeAceitar === true,
    podeReabrir: b.podeReabrir === true,
    podeRejeitar: b.podeRejeitar === true,
  }));
  const pendenciasDetalhe = corpo.pendencias.filter(ehObjeto).map((p) => ({ codigo: ehTexto(p.codigo) ? p.codigo : '', id: idSeguro(p.id) ? p.id : null, titulo: textoCurto(p.titulo), frase: traduzirPendencia(p) }));
  const pendencias = pendenciasDetalhe.map((p) => p.frase);
  const editavel = corpo.editavel === true;
  return {
    revisao: corpo.revisao,
    rotulo: textoCurto(corpo.rotulo, 60) || ROTULO_PADRAO_SITUACAO,
    // Fonte única dos números e do selo: a própria lista de impedimentos devolvida pela API.
    revisaoPendente: pendencias.length > 0,
    editavel,
    congelada: !editavel,
    resumo: {
      informacoesAceitas: contagem(corpo.resumo.informacoesAceitas),
      fontesNaoUsadas: contagem(corpo.resumo.fontesNaoUsadas),
      pendenciasParaConcluir: pendencias.length,
    },
    fontes,
    blocos,
    pendencias,
    pendenciasDetalhe,
    podeConcluir: corpo.podeConcluir === true && editavel,
  };
}

/** Títulos das fontes pendentes de um bloco, em frase comum. */
export function explicarFontesPendentes(bloco, fontes) {
  const nomes = bloco.fontesPendentes.map((id) => fontes.find((f) => f.id === id)).filter(Boolean).map((f) => `"${f.titulo}"`);
  if (nomes.length === 0) return '';
  return `Para aceitar esta informação, marque antes como revisado: ${nomes.join(', ')}.`;
}

/** Mensagem curta por código de erro da revisão. Nunca usa texto bruto da resposta. `recarregar`: a tela deve buscar os dados de novo. */
export function mensagemDaRevisao(status, corpo) {
  const erro = ehObjeto(corpo) && ehTexto(corpo.erro) ? corpo.erro : null;
  if (status === 401) return { mensagem: 'A sessão administrativa é inválida ou expirou. Recarregue a página para iniciar uma nova sessão.' };
  if (status === 403) return { mensagem: 'Acesso recusado. A administração só funciona neste computador, pelo endereço local.' };
  if (status === 404) return { mensagem: 'Não encontramos este item. Os dados foram atualizados.', recarregar: true };
  if (status === 409) {
    if (erro === 'revisao_divergente') return { mensagem: MENSAGEM_REVISAO_DIVERGENTE, recarregar: true };
    if (erro === 'operacao_em_andamento') return { mensagem: 'Outra gravação está em andamento. Aguarde alguns segundos e tente de novo.' };
    if (erro === 'versao_congelada') return { mensagem: 'Esta versão já foi concluída e não pode mais ser editada. Os dados foram atualizados.', recarregar: true };
    if (erro === 'ja_importado') return { mensagem: 'Este conteúdo já foi importado. Os dados foram atualizados.', recarregar: true };
    if (erro === 'fonte_ja_revisada') return { mensagem: 'Este documento ou link já foi revisado. Os dados foram atualizados.', recarregar: true };
    if (erro === 'bloco_ja_aceito') return { mensagem: 'Esta informação já foi aceita. Os dados foram atualizados.', recarregar: true };
    if (erro === 'estado_nao_permite_nova_versao') return { mensagem: 'Ainda não é possível criar uma nova versão. Conclua a revisão antes.', recarregar: true };
    return { mensagem: 'Não foi possível concluir. Nada foi alterado.', recarregar: true };
  }
  if (status === 422) {
    if (erro === 'revisao_incompleta') return { mensagem: 'Ainda há pendências. Resolva-as antes de concluir a revisão.', recarregar: true };
    if (erro === 'fonte_pendente') return { mensagem: 'Marque antes como revisados os documentos ou links usados por esta informação.', recarregar: true };
    if (erro === 'fonte_revogada') return { mensagem: 'Um dos documentos ou links foi revogado e não pode ser usado.', recarregar: true };
    if (erro === 'bloco_sem_fonte') return { mensagem: 'Esta informação não tem documento ou link. Edite e escolha uma fonte antes de aceitar.', recarregar: true };
    if (erro === 'bloco_nao_aceitavel' || erro === 'bloco_nao_aceito') return { mensagem: 'Esta ação não é possível para a informação neste momento. Os dados foram atualizados.', recarregar: true };
    return { mensagem: 'Não foi possível concluir. Nada foi alterado.' };
  }
  if (status === 413) return { mensagem: 'Os dados enviados são grandes demais.' };
  if (status === 500) {
    if (erro === 'desfazer_incompleto') return { mensagem: 'A operação não terminou por completo. Recarregue a página e confira os dados.', recarregar: true };
    return { mensagem: 'O servidor local não conseguiu concluir. Nada foi alterado; tente de novo.' };
  }
  return { mensagem: 'Não foi possível concluir. Nada foi alterado.' };
}

/** Leitura da revisão (GET). `chamar` é o `chamar` do cliente que a usa; falha de rede e 401 viram mensagens fixas. */
export async function lerRevisaoDoServico(chamar, servicoId, mensagemRede) {
  if (!idSeguro(servicoId)) return { ok: false, mensagem: 'Não foi possível carregar a revisão deste serviço. Tente de novo.' };
  const r = await chamar('GET', `/__admin/servicos/${encodeURIComponent(servicoId)}/revisao`);
  if (r.falhaDeRede) return { ok: false, mensagem: mensagemRede };
  const resumo = r.ok ? resumirRevisao(r.corpo) : null;
  if (resumo === null) return { ok: false, mensagem: r.status === 401 ? mensagemDaRevisao(401).mensagem : 'Não foi possível carregar a revisão deste serviço. Tente de novo.' };
  return { ok: true, ...resumo };
}

/**
 * Grava uma ação da revisão (sempre POST JSON). `acao`: fonte, bloco-aceitar, bloco-rejeitar, bloco-reabrir, concluir ou nova-versao.
 * Para nova-versao o corpo é exatamente `{}`; nas demais, `corpo` já traz a `revisao` atual.
 */
export async function enviarAcaoDeRevisao(chamar, servicoId, acao, corpo, mensagemRede) {
  if (!idSeguro(servicoId) || !Object.hasOwn(ACOES_REVISAO, acao)) return { ok: false, mensagem: 'Não foi possível concluir. Nada foi alterado.' };
  const r = await chamar('POST', `/__admin/servicos/${encodeURIComponent(servicoId)}/${ACOES_REVISAO[acao]}`, acao === 'nova-versao' ? {} : corpo);
  if (r.falhaDeRede) return { ok: false, mensagem: mensagemRede };
  if (r.status === (acao === 'nova-versao' ? 201 : 200)) return { ok: true };
  return { ok: false, ...(acao === 'autorizar' || acao === 'publicar' || acao === 'revogar' ? mensagemDaPublicacao(r.status, r.corpo, acao) : mensagemDaRevisao(r.status, r.corpo)) };
}

// ---------- Autorizar e publicar (Passo 5C) ----------
// Três etapas distintas: revisar (conferir e concluir), autorizar (registrar a decisão; nada vira público) e publicar (disponibilizar
// ao cidadão). Nada aqui mostra hash, ids ou códigos internos.

export const TEXTO_DIFERENCA_ETAPAS = 'Revisar é conferir as informações e os documentos e concluir a revisão. Autorizar é registrar que esta versão pode ser publicada, sem disponibilizá-la. Publicar é disponibilizar o conteúdo ao cidadão no chatbot.';
export const AVISO_AUTORIZACAO = 'A próxima ação disponibilizará conteúdo ao cidadão.';
export const TEXTO_CONFIRMAR_AUTORIZACAO = 'Autorizar registra a decisão de que esta versão pode ser publicada. Ainda não publica nada: o chatbot continua sem este conteúdo até a publicação, que é uma ação à parte.';
export const TEXTO_CONFIRMAR_PUBLICACAO = 'Ao publicar, as informações desta versão passam a ser usadas pelo chatbot nas respostas ao cidadão. A versão publicada não poderá mais ser editada; para alterar, será necessário criar uma nova versão.';
export const AVISO_CONCLUIR_NAO_PUBLICA = 'Concluir a revisão não publica nada. Depois dela ainda é preciso autorizar e, em seguida, publicar.';
export const MENSAGENS_PUBLICACAO = Object.freeze({
  autorizada: 'Publicação autorizada. O conteúdo ainda não está disponível ao cidadão: use "Publicar" quando quiser disponibilizá-lo.',
  publicada: 'Versão publicada. O conteúdo já está disponível ao cidadão. Para alterar, crie uma nova versão.',
  revogada: 'Publicação revogada. O chatbot deixou de usar este conteúdo. Para publicar de novo, crie uma nova versão e passe por revisão, autorização e publicação.',
  indisponivel: 'Não foi possível ler a situação da publicação agora. Recarregue a página e tente de novo.',
});
// Revogação (Sprint 7, Passo 7B): tira de uso a versão publicada inteira; o motivo é obrigatório e fica registrado.
export const TEXTO_CONFIRMAR_REVOGACAO = 'Ao revogar, o chatbot deixa de usar o conteúdo desta versão. A versão não volta a ser publicada: para publicar de novo, será preciso criar uma nova versão e passar por revisão, autorização e publicação.';
export const AVISO_MOTIVO_REVOGACAO = 'Informe o motivo da revogação, sem nomes nem outros dados pessoais. O sistema recusa os formatos comuns de e-mail, telefone, CPF e senha; um número de processo ou protocolo com 10 ou 11 dígitos seguidos também é recusado, por parecer telefone.';
export const MENSAGEM_MOTIVO_OBRIGATORIO = 'Informe o motivo da revogação.';
export const LIMITE_MOTIVO_REVOGACAO = 500;

/** Data em dd/mm/aaaa a partir do início de um texto ISO (sem fuso do navegador); texto inválido vira null. */
export function dataDaRevisaoBr(valor) {
  const m = ehTexto(valor) ? /^(\d{4})-(\d{2})-(\d{2})(?:$|T)/.exec(valor) : null;
  return m === null ? null : `${m[3]}/${m[2]}/${m[1]}`;
}

/** Resume GET .../publicacao/resumo só com o que a tela usa; null se o formato não for o esperado. `etapa`: autorizar, publicar, publicado ou indisponivel. */
export function resumirPublicacao(corpo) {
  if (!ehObjeto(corpo) || !Number.isInteger(corpo.versao) || corpo.versao < 1) return null;
  const publicado = corpo.publicado === true;
  const revogado = !publicado && corpo.revogado === true;
  const podePublicar = !publicado && !revogado && corpo.podePublicar === true;
  const podeAutorizar = !publicado && !revogado && !podePublicar && corpo.podeAutorizar === true;
  return {
    versao: corpo.versao,
    rotulo: textoCurto(corpo.rotulo, 60) || ROTULO_PADRAO_SITUACAO,
    dataRevisao: dataDaRevisaoBr(corpo.dataRevisao),
    dataPublicacao: dataDaRevisaoBr(corpo.dataPublicacao),
    dataRevogacao: dataDaRevisaoBr(corpo.dataRevogacao),
    informacoesAceitas: contagem(corpo.informacoesAceitas),
    links: contagem(corpo.links),
    textos: contagem(corpo.textos),
    podeAutorizar,
    podePublicar,
    podeRevogar: publicado && corpo.podeRevogar === true,
    publicado,
    revogado,
    etapa: publicado ? 'publicado' : revogado ? 'revogado' : podePublicar ? 'publicar' : podeAutorizar ? 'autorizar' : 'indisponivel',
  };
}

const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

/** Linhas (rótulo e valor) do diálogo de autorização e do de publicação. */
export function linhasDoResumoDePublicacao(r) {
  return [
    { rotulo: 'Versão', valor: String(r.versao) },
    { rotulo: 'Data da revisão', valor: r.dataRevisao ?? 'Não informada' },
    { rotulo: 'Informações aceitas', valor: String(r.informacoesAceitas) },
    { rotulo: 'Links', valor: String(r.links) },
    { rotulo: 'Textos', valor: String(r.textos) },
  ];
}

/** Frase do estado de publicação para o painel (sem termos internos). */
export function frasePublicacao(r) {
  const itens = `${plural(r.informacoesAceitas, 'informação aceita', 'informações aceitas')}, ${plural(r.links, 'link', 'links')} e ${plural(r.textos, 'texto', 'textos')}`;
  const dataBase = r.dataRevisao === null ? '' : ` Revisão concluída em ${r.dataRevisao}.`;
  const data = r.etapa === 'publicado' && r.dataPublicacao !== null ? ` Publicado em ${r.dataPublicacao}.` : dataBase;
  switch (r.etapa) {
    case 'publicado': return `Publicado. Esta versão (${r.versao}) já está disponível ao cidadão e não pode mais ser editada.${data} ${itens}.`;
    case 'revogado': return `Publicação revogada. Esta versão (${r.versao}) não está mais disponível ao cidadão e não volta a ser publicada.${r.dataRevogacao === null ? '' : ` Revogada em ${r.dataRevogacao}.`} Para publicar de novo, crie uma nova versão.`;
    case 'publicar': return `Publicação autorizada, mas ainda não publicada. O conteúdo não está disponível ao cidadão.${data} ${itens}.`;
    case 'autorizar': return `Revisão concluída; a publicação ainda não foi autorizada. O conteúdo não está disponível ao cidadão.${data} ${itens}.`;
    default: return 'Autorizar ou publicar não está disponível agora. Recarregue a página; se continuar assim, procure a equipe responsável.';
  }
}

/** Visibilidade dos botões por etapa. `ocupado`: uma requisição está em andamento (tudo desabilitado). */
export function botoesDePublicacao(r, ocupado = false) {
  const etapa = r === null ? 'indisponivel' : r.etapa;
  return {
    autorizar: { visivel: etapa === 'autorizar', habilitado: etapa === 'autorizar' && !ocupado },
    publicar: { visivel: etapa === 'publicar', habilitado: etapa === 'publicar' && !ocupado },
    // Revogar: só com a versão publicada (e quando o servidor confirma que ela é a que está em uso).
    revogar: { visivel: etapa === 'publicado' && r.podeRevogar === true, habilitado: etapa === 'publicado' && r.podeRevogar === true && !ocupado },
    novaVersao: { visivel: etapa === 'publicado' || etapa === 'revogado', habilitado: (etapa === 'publicado' || etapa === 'revogado') && !ocupado },
  };
}

/** Corpo das ações de autorizar e publicar: só a revisão que a pessoa viu. */
export const corpoDaPublicacao = (revisaoAtual) => ({ revisao: revisaoAtual });

/** Mensagem por código de erro ao autorizar ou publicar. Nunca usa texto bruto da resposta. */
export function mensagemDaPublicacao(status, corpo, acao = 'autorizar') {
  const erro = ehObjeto(corpo) && ehTexto(corpo.erro) ? corpo.erro : null;
  const verbo = acao === 'publicar' ? 'publicar' : acao === 'revogar' ? 'revogar' : 'autorizar';
  if (status === 401 || status === 403 || status === 404 || status === 413) return mensagemDaRevisao(status, corpo);
  if (status === 409) {
    if (erro === 'revisao_divergente') return { mensagem: MENSAGEM_REVISAO_DIVERGENTE, recarregar: true };
    if (erro === 'operacao_em_andamento') return { mensagem: 'Outra gravação está em andamento. Aguarde alguns segundos e tente de novo.' };
    if (erro === 'nada_publicado') return { mensagem: 'Não há publicação em uso para revogar. Os dados foram atualizados.', recarregar: true };
    if (erro === 'estado_invalido') return { mensagem: `Esta versão não está mais na etapa de ${verbo}. Os dados foram atualizados.`, recarregar: true };
    return { mensagem: `Não foi possível ${verbo}. Nada foi alterado.`, recarregar: true };
  }
  if (status === 422) {
    if (erro === 'motivo_invalido') return { mensagem: `Informe um motivo de até ${LIMITE_MOTIVO_REVOGACAO} caracteres, sem e-mail, telefone, CPF ou senha. Nada foi alterado.`, campo: 'motivo' };
    if (erro === 'sem_informacao_aceita') return { mensagem: 'Não há nenhuma informação aceita para publicar. Nada foi alterado.', recarregar: true };
    if (erro === 'revisao_incompleta') return { mensagem: 'Ainda há pendências na revisão. Nada foi alterado.', recarregar: true };
    if (erro === 'conteudo_excluido_citado') return { mensagem: 'Há informação que ainda cita um documento ou link excluído. Nada foi alterado; crie uma nova versão para corrigir.', recarregar: true };
    if (erro === 'hash_divergente' || erro === 'historico_incompativel') return { mensagem: `A conferência do conteúdo não permitiu ${verbo}. Nada foi alterado; procure a equipe responsável.`, recarregar: true };
    return { mensagem: `Não foi possível ${verbo}. Nada foi alterado.` };
  }
  if (status === 500) {
    if (erro === 'desfazer_incompleto') return { mensagem: 'A operação não terminou por completo. Recarregue a página e confira os dados.', recarregar: true };
    return { mensagem: `O servidor local não conseguiu ${verbo}. Nada foi alterado; tente de novo.` };
  }
  return { mensagem: `Não foi possível ${verbo}. Nada foi alterado.` };
}

/** Leitura do resumo de publicação (GET, somente leitura; nada é gravado). */
export async function lerResumoDePublicacao(chamar, servicoId, mensagemRede) {
  if (!idSeguro(servicoId)) return { ok: false, mensagem: MENSAGENS_PUBLICACAO.indisponivel };
  const r = await chamar('GET', `/__admin/servicos/${encodeURIComponent(servicoId)}/publicacao/resumo`);
  if (r.falhaDeRede) return { ok: false, mensagem: mensagemRede };
  const resumo = r.ok ? resumirPublicacao(r.corpo) : null;
  if (resumo === null) return { ok: false, mensagem: r.status === 401 ? mensagemDaRevisao(401).mensagem : MENSAGENS_PUBLICACAO.indisponivel };
  return { ok: true, ...resumo };
}

/** `?pendencias=1`: abre a área de pendências ao carregar a página de conteúdo. */
export const pendenciasDaUrl = (busca) => { try { return new URLSearchParams(ehTexto(busca) ? busca : '').get('pendencias') === '1'; } catch { return false; } };

/** Lê `?servico=` e devolve o id apenas se tiver o formato válido; qualquer outro valor é ignorado. */
export function servicoDaUrl(busca) {
  let valor = null;
  try { valor = new URLSearchParams(ehTexto(busca) ? busca : '').get('servico'); } catch { return null; }
  return ehTexto(valor) && valor.length <= LIMITES.id && PADRAO_ID.test(valor) ? valor : null;
}

// ---------- Editar e excluir fontes (Passo 5B3a) ----------

export const TEXTO_CONFIRMAR_EXCLUSAO_FONTE = 'Este item não aparecerá mais na gestão. O histórico será preservado.';
export const TEXTO_EXCLUSAO_APLICADA_NA_PUBLICACAO = 'A exclusão será aplicada ao chatbot após a publicação desta versão.';
export const FRASE_SEM_INFORMACAO_ACEITA = 'Inclua e aceite pelo menos uma informação para concluir a revisão.';
export const PASSOS_PARA_RESOLVER = Object.freeze(['Incluir ou editar uma informação.', 'Relacionar ao menos uma fonte ativa.', 'Revisar a fonte usada.', 'Aceitar a informação.', 'Concluir a revisão.']);
export const AVISO_EDITAR_FONTE = 'Ao salvar, esta fonte volta para revisão e as informações aceitas que a usam voltam para Em elaboração.';
export const MENSAGEM_URL_DUPLICADA = 'Já existe outro link com este endereço neste serviço.';
const CAMPOS_FORMULARIO_FONTE = Object.freeze({ link: ['titulo', 'url', 'orgaoResponsavel', 'descricao', 'dataPublicacao', 'localizacao'], texto: ['titulo', 'texto'] });
export const LIMITES_EDICAO_FONTE = Object.freeze({ localizacao: 200 });

const DESFECHOS = Object.freeze({
  continua: 'continuará com outras fontes',
  volta_para_elaboracao: 'voltará para Em elaboração',
  sai_do_conteudo_ativo: 'sairá do conteúdo ativo',
});

export function fraseBlocosReabertos(n) {
  if (!Number.isInteger(n) || n <= 0) return '';
  return n === 1 ? '1 informação voltou para Em elaboração.' : `${n} informações voltaram para Em elaboração.`;
}

/**
 * GET .../fontes/<id>/impacto: o que a exclusão causa, em linguagem comum e sem ids. Retorna null se o formato não for o esperado.
 * informacoes: título e desfecho; conteudoAntigo: o que sai do conteúdo ativo e os campos do serviço que ficam pendentes.
 */
export function resumirImpacto(corpo) {
  if (!ehObjeto(corpo) || !Array.isArray(corpo.informacoes)) return null;
  const informacoes = corpo.informacoes.filter(ehObjeto).map((i) => ({
    titulo: textoCurto(i.titulo),
    desfecho: Object.hasOwn(DESFECHOS, i.desfecho) ? i.desfecho : 'volta_para_elaboracao',
    frase: DESFECHOS[Object.hasOwn(DESFECHOS, i.desfecho) ? i.desfecho : 'volta_para_elaboracao'],
  }));
  const a = ehObjeto(corpo.conteudoAntigo) ? corpo.conteudoAntigo : {};
  const antigo = {
    blocosDeTeste: contagem(a.blocosDeTeste),
    documentos: contagem(a.documentos),
    perguntas: contagem(a.perguntas),
    camposDoServico: Array.isArray(a.camposDoServico) ? a.camposDoServico.filter(ehTexto).map((t) => textoCurto(t, 80)).filter((t) => t !== '').slice(0, 30) : [],
    normasRelacionadas: contagem(a.normasRelacionadas),
    secoesDoRoteiro: Array.isArray(a.secoesDoRoteiro) ? a.secoesDoRoteiro.filter(ehTexto).map((t) => textoCurto(t, 80)).filter((t) => t !== '').slice(0, 30) : [],
  };
  return { informacoes, conteudoAntigo: antigo };
}

/** Frases do que sai do conteúdo antigo (só o que existir). */
export function frasesConteudoAntigo(a) {
  const frases = [];
  const plural = (n, um, varios) => (n === 1 ? `1 ${um}` : `${n} ${varios}`);
  if (a.documentos > 0) frases.push(`${plural(a.documentos, 'documento', 'documentos')} do conteúdo antigo sairá do conteúdo ativo.`.replace('sairá', a.documentos === 1 ? 'sairá' : 'sairão'));
  if (a.perguntas > 0) frases.push(`${plural(a.perguntas, 'pergunta frequente', 'perguntas frequentes')} do conteúdo antigo ${a.perguntas === 1 ? 'sairá' : 'sairão'} do conteúdo ativo.`);
  if (a.blocosDeTeste > 0) frases.push(`${plural(a.blocosDeTeste, 'bloco de teste', 'blocos de teste')} do conteúdo antigo ${a.blocosDeTeste === 1 ? 'sairá' : 'sairão'} do conteúdo ativo.`);
  if (a.camposDoServico.length > 0) frases.push(`O texto dos campos do serviço que dependem só desta fonte será apagado e eles ficarão pendentes: ${a.camposDoServico.join(', ')}.`);
  if ((a.secoesDoRoteiro ?? []).length > 0) frases.push(`No roteiro do serviço, ficarão pendentes as seções: ${a.secoesDoRoteiro.join(', ')}.`);
  if (a.normasRelacionadas > 0) frases.push(`A relação entre normas será ajustada em ${plural(a.normasRelacionadas, 'fonte', 'fontes')}.`);
  return frases;
}

/** GET ...: só os campos de edição (strings) e a revisão. Retorna null se o formato não for o esperado. */
export function resumirFonteParaEdicao(corpo) {
  if (!ehObjeto(corpo) || (corpo.forma !== 'link' && corpo.forma !== 'texto')) return null;
  const campos = {};
  for (const c of CAMPOS_FORMULARIO_FONTE[corpo.forma]) campos[c] = ehTexto(corpo[c]) ? corpo[c] : '';
  return { forma: corpo.forma, campos, revisao: ehTexto(corpo.revisao) ? corpo.revisao : '' };
}

function mensagemDeUrlInvalida(url) {
  if (url === '') return 'Informe o endereço do link.';
  if (url.length > LIMITES_GESTAO.url) return `Use até ${LIMITES_GESTAO.url} caracteres no endereço.`;
  let objeto = null;
  try { objeto = new URL(url); } catch { /* inválido, tratado abaixo */ }
  if (objeto === null || objeto.protocol !== 'https:' || !objeto.hostname.includes('.')) return 'Use um endereço completo que comece com https://.';
  if (objeto.username !== '' || objeto.password !== '' || /\s/.test(url)) return 'O endereço não pode ter usuário, senha nem espaços.';
  if (pareceDadoPessoal(url)) return 'O endereço parece ter dado pessoal ou senha. Use o endereço público da página.';
  return null;
}

/**
 * Valida o formulário de edição de uma fonte. `original`: campos carregados (para enviar só o que mudou).
 * Retorna { ok: true, corpo } (corpo pode ser vazio: nada mudou) ou { ok: false, erros } com mensagens por campo.
 */
export function validarEdicaoDeFonte(forma, valores, original) {
  const v = ehObjeto(valores) ? valores : {};
  const o = ehObjeto(original) ? original : {};
  const erros = {};
  const novo = {};
  const dados = {};
  validarTitulo(v, erros, dados);
  novo.titulo = dados.titulo;
  if (forma === 'texto') {
    const texto = ehTexto(v.texto) ? v.texto.trim() : '';
    if (texto === '') erros.texto = 'Escreva o texto.';
    else if (Array.from(texto).length > LIMITES_GESTAO.texto) erros.texto = `Use até ${LIMITES_GESTAO.texto.toLocaleString('pt-BR')} caracteres no texto.`;
    else if (pareceDadoPessoal(texto)) erros.texto = 'O texto parece ter dado pessoal, telefone, e-mail ou senha. Retire essa parte e tente de novo.';
    novo.texto = texto;
  } else {
    const url = ehTexto(v.url) ? v.url.trim() : '';
    const erroUrl = mensagemDeUrlInvalida(url);
    if (erroUrl !== null) erros.url = erroUrl;
    novo.url = url;
    const orgao = textoAparado(v.orgaoResponsavel);
    if (orgao === '') erros.orgaoResponsavel = 'Informe o órgão que publicou o conteúdo.';
    else if (orgao.length > LIMITES_GESTAO.orgao) erros.orgaoResponsavel = `Use até ${LIMITES_GESTAO.orgao} caracteres no órgão.`;
    novo.orgaoResponsavel = orgao;
    const descricao = textoAparado(v.descricao);
    if (descricao.length > LIMITES_GESTAO.descricao) erros.descricao = `Use até ${LIMITES_GESTAO.descricao} caracteres na descrição.`;
    else if (pareceDadoPessoal(descricao)) erros.descricao = 'A descrição não pode ter dados pessoais nem senhas.';
    novo.descricao = descricao;
    const data = ehTexto(v.dataPublicacao) ? v.dataPublicacao.trim() : '';
    if (data !== '' && !dataIsoValida(data)) erros.dataPublicacao = 'Use uma data válida, ou deixe em branco.';
    novo.dataPublicacao = data;
    const localizacao = textoAparado(v.localizacao);
    if (localizacao.length > LIMITES_EDICAO_FONTE.localizacao) erros.localizacao = `Use até ${LIMITES_EDICAO_FONTE.localizacao} caracteres.`;
    else if (pareceDadoPessoal(localizacao)) erros.localizacao = 'A referência não pode ter dados pessoais nem senhas.';
    novo.localizacao = localizacao;
  }
  if (Object.keys(erros).length) return { ok: false, erros };
  const corpo = {};
  for (const [campo, valor] of Object.entries(novo)) {
    const antes = ehTexto(o[campo]) ? (campo === 'texto' ? o[campo].trim() : textoAparado(o[campo])) : '';
    if (valor !== antes) corpo[campo] = valor;
  }
  return { ok: true, erros: {}, corpo };
}

/** Mensagem curta por código (editar e excluir fonte). Nunca usa texto da resposta, exceto os títulos de informações que usam a fonte. */
export function mensagemDaFonte(status, corpo) {
  const erro = ehObjeto(corpo) && ehTexto(corpo.erro) ? corpo.erro : null;
  if (status === 401 || status === 403) return mensagemDaRevisao(status, corpo);
  if (status === 404) return { mensagem: 'Não encontramos esta fonte. Os dados foram atualizados.', recarregar: true };
  if (status === 409) {
    if (erro === 'revisao_divergente') return { mensagem: MENSAGEM_REVISAO_DIVERGENTE, recarregar: true };
    if (erro === 'versao_congelada') return { mensagem: 'Esta versão já foi concluída e não pode mais ser editada. Os dados foram atualizados.', recarregar: true };
    if (erro === 'url_duplicada') return { mensagem: MENSAGEM_URL_DUPLICADA, erros: { url: MENSAGEM_URL_DUPLICADA } };
    if (erro === 'fonte_excluida' || erro === 'fonte_ja_excluida') return { mensagem: 'Esta fonte não está mais disponível. Os dados foram atualizados.', recarregar: true };
    if (erro === 'operacao_em_andamento') return { mensagem: 'Outra gravação está em andamento. Aguarde alguns segundos e tente de novo.' };
    return { mensagem: 'Não foi possível concluir. Nada foi alterado.', recarregar: true };
  }
  if (status === 422) {
    const campos = ehObjeto(corpo) && Array.isArray(corpo.campos) ? corpo.campos.filter((c) => ehTexto(c) && ['titulo', 'url', 'orgaoResponsavel', 'descricao', 'dataPublicacao', 'localizacao', 'texto'].includes(c)) : [];
    if (campos.length) return { mensagem: 'Revise os campos indicados e tente de novo.', erros: Object.fromEntries(campos.map((c) => [c, 'Revise este campo.'])) };
    return { mensagem: 'Revise os dados e tente de novo.' };
  }
  if (status === 413) return { mensagem: 'Os dados enviados são grandes demais.' };
  if (status === 500) return { mensagem: 'O servidor local não conseguiu concluir. Nada foi alterado; tente de novo.' };
  return { mensagem: 'Não foi possível concluir. Nada foi alterado.' };
}

// ---------- Editar tema e serviço (Passo 5B3b) ----------
// Lógica pura: validação do formulário, texto do impacto em linguagem comum (sem ids, hashes nem nomes técnicos) e mensagens por
// código. O id do tema e do serviço fica só na memória da tela; nunca é mostrado nem editável.

export const MENSAGEM_NOME_TEMA_REPETIDO = 'Já existe um tema com este nome.';
export const MENSAGEM_NOME_SERVICO_REPETIDO = 'Já existe um serviço com este nome.';
export const MENSAGEM_VERSAO_CONCLUIDA_PARA_EDITAR = 'Esta versão já foi concluída e não pode mais ser editada. Use "Criar nova versão para editar".';
export const AVISO_SERVICO_CONCLUIDO_PARA_EDITAR = 'Para editar o nome ou o tema deste serviço, use "Criar nova versão para editar".';

/** Todos os temas do catálogo (ativos ou não), para conferir nomes repetidos: só id e nome. */
export function todosOsTemas(catalogo) {
  const lista = ehObjeto(catalogo) && Array.isArray(catalogo.assuntos) ? catalogo.assuntos : [];
  return lista
    .filter((a) => ehObjeto(a) && ehTexto(a.id) && PADRAO_ID.test(a.id) && ehTexto(a.nome) && a.nome !== '')
    .map((a) => ({ id: a.id, nome: a.nome }))
    .sort((x, y) => x.nome.localeCompare(y.nome, 'pt-BR'));
}

function validarNomeEditado(valor, rotulo, erros, campo) {
  const nome = textoAparado(valor);
  if (nome === '') erros[campo] = `Escreva o nome do ${rotulo}.`;
  else if (nome.length > LIMITES_GESTAO.nome) erros[campo] = `Use até ${LIMITES_GESTAO.nome} caracteres no nome.`;
  else if (!/[\p{L}\p{N}]/u.test(nome)) erros[campo] = 'O nome precisa ter letras ou números.';
  else if (pareceDadoPessoal(nome)) erros[campo] = 'O nome não pode ter dados pessoais nem senhas.';
  return nome;
}

/**
 * Formulário de edição de TEMA. `original`: { id, nome }; `temas`: todos os temas { id, nome }.
 * Retorna { ok: true, mudou, nome } ou { ok: false, erros: { nome } }. O nome repetido (sem acento nem maiúscula) é recusado.
 */
export function validarEdicaoDeTema(valores, original, temas) {
  const v = ehObjeto(valores) ? valores : {};
  const o = ehObjeto(original) ? original : {};
  const erros = {};
  const nome = validarNomeEditado(v.nome, 'tema', erros, 'nome');
  if (erros.nome === undefined && (Array.isArray(temas) ? temas : []).some((t) => ehObjeto(t) && t.id !== o.id && normalizar(t.nome) === normalizar(nome))) erros.nome = MENSAGEM_NOME_TEMA_REPETIDO;
  if (Object.keys(erros).length) return { ok: false, erros };
  return { ok: true, erros: {}, mudou: nome !== textoAparado(o.nome), nome };
}

/**
 * Formulário de edição de SERVIÇO. `original`: { id, nome, temaId }; `temas`: temas ativos; `servicos`: serviços do catálogo { id, nome }.
 * Retorna { ok: true, mudou, temaMudou, corpo } (corpo só com o que mudou: nome e/ou temaId) ou { ok: false, erros }.
 */
export function validarEdicaoDeServico(valores, original, temas, servicos) {
  const v = ehObjeto(valores) ? valores : {};
  const o = ehObjeto(original) ? original : {};
  const erros = {};
  const nome = validarNomeEditado(v.nome, 'serviço', erros, 'nome');
  if (erros.nome === undefined && (Array.isArray(servicos) ? servicos : []).some((s) => ehObjeto(s) && s.id !== o.id && normalizar(s.nome) === normalizar(nome))) erros.nome = MENSAGEM_NOME_SERVICO_REPETIDO;
  const temaId = ehTexto(v.temaId) ? v.temaId : '';
  if (!(Array.isArray(temas) ? temas : []).some((t) => ehObjeto(t) && t.id === temaId)) erros.tema = 'Escolha um tema da lista.';
  if (Object.keys(erros).length) return { ok: false, erros };
  const corpo = {};
  if (nome !== textoAparado(o.nome)) corpo.nome = nome;
  const temaMudou = temaId !== o.temaId;
  if (temaMudou) corpo.temaId = temaId;
  return { ok: true, erros: {}, mudou: Object.keys(corpo).length > 0, temaMudou, corpo };
}

/** GET .../temas/<id>/edicao: nome atual, nomes dos serviços que usam o tema e a revisão. Retorna null se o formato não for o esperado. */
export function resumirEdicaoDoTema(corpo) {
  if (!ehObjeto(corpo) || !ehTexto(corpo.nome) || !Array.isArray(corpo.servicos) || !ehTexto(corpo.revisao)) return null;
  return { nome: corpo.nome, servicos: corpo.servicos.filter(ehTexto).map((t) => textoCurto(t)).filter((t) => t !== '').slice(0, 200), revisao: corpo.revisao };
}

/** GET .../servicos/<id>/edicao: nome, tema atual (id, só na memória), títulos das informações aceitas e a revisão. */
export function resumirEdicaoDoServico(corpo) {
  if (!ehObjeto(corpo) || !ehTexto(corpo.nome) || !ehTexto(corpo.temaId) || !Array.isArray(corpo.informacoesAceitas) || !ehTexto(corpo.revisao)) return null;
  return {
    nome: corpo.nome, temaId: corpo.temaId, revisao: corpo.revisao,
    informacoesAceitas: corpo.informacoesAceitas.filter(ehTexto).map((t) => textoCurto(t)).filter((t) => t !== '').slice(0, 200),
  };
}

/** Texto do impacto da edição de um tema, em linguagem comum. Retorna { frases, lista }. */
export function impactoDaEdicaoDoTema(nomeAtual, nomeNovo, servicos) {
  const nomes = Array.isArray(servicos) ? servicos : [];
  const quem = nomes.length === 0 ? 'Nenhum serviço usa este tema agora.'
    : nomes.length === 1 ? 'Este serviço usa o tema e passará a mostrar o novo nome:' : 'Estes serviços usam o tema e passarão a mostrar o novo nome:';
  return { frases: [`O tema "${nomeAtual}" passará a se chamar "${nomeNovo}".`, quem], lista: nomes };
}

/**
 * Texto do impacto da edição de um serviço, em linguagem comum. `d`: { nomeAtual, nomeNovo, temaAtualNome, temaNovoNome, informacoesAceitas }.
 * `exigeConfirmacao` segue a regra do servidor: mudança de tema ou informações aceitas que voltam para elaboração.
 */
export function impactoDaEdicaoDoServico(d) {
  const frases = [];
  if (d.nomeNovo !== d.nomeAtual) frases.push(`O serviço "${d.nomeAtual}" passará a se chamar "${d.nomeNovo}".`);
  const temaMudou = d.temaNovoNome !== d.temaAtualNome;
  if (temaMudou) frases.push(`O serviço sairá do tema "${d.temaAtualNome}" e passará para o tema "${d.temaNovoNome}".`);
  const aceitas = Array.isArray(d.informacoesAceitas) ? d.informacoesAceitas : [];
  if (aceitas.length > 0) frases.push(aceitas.length === 1 ? 'Esta informação aceita voltará para "Em elaboração" e precisará ser revisada e aceita de novo:' : 'Estas informações aceitas voltarão para "Em elaboração" e precisarão ser revisadas e aceitas de novo:');
  return { frases, lista: aceitas, exigeConfirmacao: temaMudou || aceitas.length > 0 };
}

const MENSAGEM_DO_CAMPO_EDICAO = Object.freeze({
  nome: 'Revise o nome.',
  tema: 'Escolha um tema da lista.',
});

/** Mensagem curta por código (editar tema e serviço). Nunca usa texto da resposta. `recarregar`: a tela deve buscar os dados de novo. */
export function mensagemDaEdicao(status, corpo, contexto = 'servico') {
  const erro = ehObjeto(corpo) && ehTexto(corpo.erro) ? corpo.erro : null;
  const campo = ehObjeto(corpo) && ehTexto(corpo.campo) ? corpo.campo : null;
  if (status === 401 || status === 403) return mensagemDaRevisao(status, corpo);
  if (status === 404) return { mensagem: 'Não encontramos este item. Os dados foram atualizados.', recarregar: true };
  if (status === 409) {
    if (erro === 'revisao_divergente') return { mensagem: MENSAGEM_REVISAO_DIVERGENTE, recarregar: true };
    if (erro === 'versao_congelada') return { mensagem: MENSAGEM_VERSAO_CONCLUIDA_PARA_EDITAR, recarregar: true };
    if (erro === 'operacao_em_andamento') return { mensagem: 'Outra gravação está em andamento. Aguarde alguns segundos e tente de novo.' };
    if (erro === 'ja_existe' && campo === 'nome') {
      const m = contexto === 'tema' ? MENSAGEM_NOME_TEMA_REPETIDO : MENSAGEM_NOME_SERVICO_REPETIDO;
      return { mensagem: m, erros: { nome: m } };
    }
    return { mensagem: 'Não foi possível concluir. Nada foi alterado.', recarregar: true };
  }
  if (status === 422) {
    const campos = ehObjeto(corpo) && Array.isArray(corpo.campos) ? corpo.campos : [];
    if (campos.includes('nada_a_alterar')) return { mensagem: 'Nenhuma alteração para salvar.' };
    if (campos.includes('confirmacao')) return { mensagem: 'Confirme a alteração para continuar.' };
    const erros = {};
    for (const c of campos) if (ehTexto(c) && Object.hasOwn(MENSAGEM_DO_CAMPO_EDICAO, c)) erros[c] = MENSAGEM_DO_CAMPO_EDICAO[c];
    return Object.keys(erros).length ? { mensagem: 'Revise os campos indicados e tente de novo.', erros } : { mensagem: 'Revise os dados e tente de novo.' };
  }
  if (status === 413) return { mensagem: 'Os dados enviados são grandes demais.' };
  if (status === 500) return { mensagem: 'O servidor local não conseguiu concluir. Nada foi alterado; tente de novo.' };
  return { mensagem: 'Não foi possível concluir. Nada foi alterado.' };
}

// ---------- Importar conteúdo existente (Passo 5B3c) ----------

export const ROTULOS_CANDIDATO = Object.freeze({
  descricao: 'Descrição', etapas: 'Etapas', requisitos: 'Condições e requisitos', link: 'Link', norma: 'Norma', bloco: 'Conteúdo anterior', documento: 'Documento exigido', pergunta: 'Pergunta frequente',
});
export const TEXTO_IMPORTACAO = 'Escolha somente as orientações que ainda são úteis. Os documentos e normas continuam disponíveis como fontes.';
export const FRASE_SEM_CANDIDATOS = 'Nenhuma orientação encontrada no conteúdo antigo.';
export const MENSAGEM_IMPORTADA = 'Informação importada. Ela está em elaboração e ainda não está disponível no chatbot. O conteúdo existente continua preservado.';
const LIMITE_PREVIA = 300;

/** Prévia curta do texto (sem quebras), para a lista de candidatos. */
export const previaDoTexto = (texto, limite = LIMITE_PREVIA) => {
  const t = textoCurto(texto, 100000).replace(/\s+/g, ' ');
  return t.length > limite ? `${t.slice(0, limite).trimEnd()}…` : t;
};

/**
 * Resume GET .../importacao só com o que a tela usa. `ref` e `fonteIds` são internos (nunca exibidos). Retorna null se o formato
 * não for o esperado.
 */
export function resumirCandidatos(corpo) {
  if (!ehObjeto(corpo) || !ehTexto(corpo.revisao) || !/^[0-9a-f]{64}$/.test(corpo.revisao) || !Array.isArray(corpo.candidatos)) return null;
  const candidatos = corpo.candidatos.filter(ehObjeto).filter((c) => ehTexto(c.ref) && /^[a-z]+(:[a-z][a-z0-9-]*)?$/.test(c.ref) && Object.hasOwn(ROTULOS_CANDIDATO, c.tipo) && ehTexto(c.titulo) && ehTexto(c.texto)).map((c) => ({
    ref: c.ref,
    tipo: c.tipo,
    rotulo: ROTULOS_CANDIDATO[c.tipo],
    titulo: c.titulo,
    texto: c.texto,
    previa: previaDoTexto(c.texto),
    referencias: (Array.isArray(c.referencias) ? c.referencias : []).filter(ehObjeto).filter((r) => idSeguro(r.fonteId)).map((r) => ({ fonteId: r.fonteId, localizacao: ehTexto(r.localizacao) ? r.localizacao : '' })),
    alertas: (Array.isArray(c.alertas) ? c.alertas : []).filter(ehTexto),
  }));
  return { revisao: corpo.revisao, candidatos };
}

/** Corpo do POST: só o que a pessoa conferiu no formulário mais a referência do item e a revisão vista. Nunca estados nem ids novos. */
export function corpoDaImportacao(ref, dados, revisaoAtual) {
  return { ...corpoDoConhecimento(dados), ref, revisao: revisaoAtual };
}
