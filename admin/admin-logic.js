// Lógica da tela "Gestão de conteúdo": funções puras (sem DOM, sem armazenamento do navegador, sem relógio) e um cliente
// do endpoint administrativo local com `fetch` injetável. Este arquivo existe só no ambiente de desenvolvimento local:
// a pasta admin/ não entra no build nem no preview.
//
// O token da sessão fica numa variável DENTRO do cliente (memória): não há como lê-lo de fora, e ele nunca é devolvido,
// exibido, gravado ou registrado. As mensagens de erro vêm de uma tabela fixa em português, nunca da resposta bruta.

export const LIMITES = Object.freeze({ id: 60, nome: 120, descricao: 1000, sigla: 20, termos: 20, termo: 120 });
export const ROTAS = Object.freeze({
  sessao: '/__admin/sessao',
  catalogo: '/__admin/catalogo',
  assuntos: '/__admin/assuntos',
  servicos: '/__admin/servicos',
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
  else if (PADRAO_EMAIL.test(t) || PADRAO_TELEFONE.test(t)) erros[campo] = `Não informe e-mail nem telefone em ${nomeDoCampo}.`;
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
  const id = validarId(v.id, erros, 'id');
  const nome = textoLivre(v.nome, LIMITES.nome, 'o nome', erros, 'nome');
  const descricao = textoLivre(v.descricao, LIMITES.descricao, 'a descrição', erros, 'descricao');
  return Object.keys(erros).length ? { ok: false, erros } : { ok: true, dados: { id, nome, descricao } };
}

/** Valida o formulário "Novo serviço". `assuntos` é a lista do catálogo; só assunto ativo é aceito. */
export function validarFormServico(valores, assuntos) {
  const v = ehObjeto(valores) ? valores : {};
  const erros = {};
  const lista = Array.isArray(assuntos) ? assuntos : [];
  const assunto = lista.find((a) => ehObjeto(a) && a.id === v.assuntoId);
  if (!ehTexto(v.assuntoId) || v.assuntoId === '') erros.assuntoId = 'Escolha o assunto.';
  else if (!assunto || assunto.ativo !== true) erros.assuntoId = 'Escolha um assunto existente e ativo.';
  const id = validarId(v.id, erros, 'id');
  const nome = textoLivre(v.nome, LIMITES.nome, 'o nome', erros, 'nome');

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
  const dados = { assuntoId: v.assuntoId, id, nome, sigla, termosEquivalentes: termos };
  return { ok: true, dados };
}

/** Corpo enviado ao endpoint: somente os campos permitidos (sigla só quando informada). */
export function corpoDoAssunto({ id, nome, descricao }) {
  return { id, nome, descricao };
}
export function corpoDoServico({ id, assuntoId, nome, sigla, termosEquivalentes }) {
  const corpo = { id, assuntoId, nome, termosEquivalentes: [...termosEquivalentes] };
  if (sigla) corpo.sigla = sigla;
  return corpo;
}

/** Linhas do resumo mostrado antes da gravação (nunca inclui o token). */
export function resumoDoAssunto(dados) {
  return [
    { rotulo: 'Identificador', valor: dados.id },
    { rotulo: 'Nome', valor: dados.nome },
    { rotulo: 'Descrição', valor: dados.descricao },
  ];
}
export function resumoDoServico(dados, assuntos = []) {
  const assunto = assuntos.find((a) => a.id === dados.assuntoId);
  return [
    { rotulo: 'Assunto', valor: assunto ? `${assunto.nome} (${assunto.id})` : dados.assuntoId },
    { rotulo: 'Identificador', valor: dados.id },
    { rotulo: 'Nome', valor: dados.nome },
    { rotulo: 'Sigla', valor: dados.sigla ?? 'não informada (ficará PENDENTE)' },
    { rotulo: 'Termos equivalentes', valor: dados.termosEquivalentes.join('; ') },
    { rotulo: 'Situação inicial', valor: 'Versão 1 em rascunho, sem conteúdo e não publicada' },
  ];
}

// ---------- Catálogo ----------

export const ROTULOS_ESTADO = Object.freeze({
  rascunho: 'Rascunho',
  em_validacao: 'Em validação',
  ajustes_solicitados: 'Ajustes solicitados',
  validado_materialmente: 'Validado materialmente',
  autorizado_publicacao: 'Autorizado para publicação',
  publicado: 'Publicado',
  validado: 'Validado',
});
export const rotuloEstado = (estado) => (ehTexto(estado) && Object.hasOwn(ROTULOS_ESTADO, estado) ? ROTULOS_ESTADO[estado] : 'Estado indisponível');
export const rotuloPublicacao = (versaoPublicadaId) => (ehTexto(versaoPublicadaId) && versaoPublicadaId !== '' ? `Publicada (${versaoPublicadaId})` : 'Não publicada');

/**
 * Agrupa os serviços por assunto, na ordem do catálogo. `estados` mapeia id do serviço -> estado da versão atual.
 * Serviços cujo assunto não está na lista aparecem num grupo final sem assunto.
 */
export function agruparCatalogo(catalogo, estados = {}) {
  const assuntos = ehObjeto(catalogo) && Array.isArray(catalogo.assuntos) ? catalogo.assuntos : [];
  const servicos = ehObjeto(catalogo) && Array.isArray(catalogo.servicos) ? catalogo.servicos : [];
  const item = (s) => ({
    id: s.id, nome: ehTexto(s.nome) ? s.nome : s.id, sigla: ehTexto(s.sigla) ? s.sigla : null, versaoAtualId: s.versaoAtualId,
    estado: rotuloEstado(estados[s.id] ?? null), publicacao: rotuloPublicacao(s.versaoPublicadaId),
  });
  const grupos = assuntos.map((a) => ({ assunto: { id: a.id, nome: a.nome, descricao: a.descricao, ativo: a.ativo === true }, servicos: servicos.filter((s) => s.assuntoId === a.id).map(item) }));
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

// ---------- Mensagens ----------

const ROTULO_DO_CAMPO = Object.freeze({
  id: 'identificador', nome: 'nome', descricao: 'descrição', assuntoId: 'assunto', sigla: 'sigla', termosEquivalentes: 'termos equivalentes',
});
export const MENSAGENS = Object.freeze({
  rede: 'Não foi possível falar com o servidor local. Confira se o servidor de desenvolvimento está ativo e recarregue a página.',
  sessao: 'A sessão administrativa não está disponível. Recarregue a página para iniciar uma nova sessão.',
  catalogo: 'Não foi possível carregar o catálogo. Recarregue a página e tente novamente.',
  emAndamento: 'Uma gravação já está em andamento. Aguarde a conclusão.',
  generica: 'Não foi possível concluir a operação. Nada foi alterado.',
});

/** Converte o código do endpoint em mensagem curta em português. Nunca usa texto bruto da resposta. */
export function mensagemDeErro(status, corpo) {
  const erro = ehObjeto(corpo) && ehTexto(corpo.erro) ? corpo.erro : null;
  const campo = ehObjeto(corpo) && ehTexto(corpo.campo) ? corpo.campo : null;
  if (status === 401) return 'A sessão administrativa é inválida ou expirou. Recarregue a página para iniciar uma nova sessão.';
  if (status === 403) return 'Acesso recusado. A administração só funciona neste computador, pelo endereço local.';
  if (status === 409) {
    if (erro === 'operacao_em_andamento') return 'Outra gravação está em andamento. Aguarde alguns segundos e tente de novo.';
    if (campo === 'nome') return 'Já existe um item com este nome. Escolha outro nome.';
    return 'Já existe um item com este identificador. Escolha outro identificador.';
  }
  if (status === 413) return 'Os dados enviados são grandes demais.';
  if (status === 415) return 'O formato do envio não foi aceito.';
  if (status === 422) {
    const campos = ehObjeto(corpo) && Array.isArray(corpo.campos) ? corpo.campos : [];
    if (campos.includes('extras')) return 'Os dados enviados contêm campos que não são permitidos.';
    if (campos.length === 1 && campos[0] === 'assuntoId') return 'O assunto escolhido não existe ou está inativo.';
    const nomes = campos.filter((c) => Object.hasOwn(ROTULO_DO_CAMPO, c)).map((c) => ROTULO_DO_CAMPO[c]);
    return nomes.length ? `Revise os campos: ${nomes.join(', ')}.` : 'Revise os dados informados.';
  }
  if (status === 400) return 'Os dados enviados não puderam ser lidos. Revise o formulário e tente de novo.';
  if (status === 404) return 'O recurso pedido não foi encontrado.';
  if (status === 405) return 'Esta operação não é permitida.';
  if (status === 500) return 'O servidor local não conseguiu concluir a operação. Nada foi alterado; tente novamente.';
  return MENSAGENS.generica;
}

// ---------- Cliente do endpoint administrativo ----------

/**
 * Cria o cliente. `fetchImpl` é o `fetch` (injetado para teste). O token fica só na variável `token`, sem acesso externo.
 * Cada gravação só começa se a sessão existir e nenhuma outra estiver em andamento (sem envio duplicado).
 */
export function criarClienteAdmin({ fetchImpl }) {
  let token = null;
  let gravando = false;

  async function chamar(metodo, caminho, corpo, { comToken = true } = {}) {
    const cabecalhos = { Accept: 'application/json' };
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
    return { status: resposta.status, corpo: json, ok: resposta.status >= 200 && resposta.status < 300 };
  }

  return {
    sessaoPronta: () => token !== null,
    gravando: () => gravando,

    /** Obtém o token da sessão (GET /__admin/sessao). */
    async iniciarSessao() {
      const r = await chamar('GET', ROTAS.sessao, undefined, { comToken: false });
      if (r.falhaDeRede) return { ok: false, mensagem: MENSAGENS.rede };
      if (!r.ok || !ehObjeto(r.corpo) || !ehTexto(r.corpo.token) || !/^[0-9a-f]{64}$/.test(r.corpo.token)) return { ok: false, mensagem: r.status === 403 ? mensagemDeErro(403, r.corpo) : MENSAGENS.sessao };
      token = r.corpo.token;
      return { ok: true };
    },

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

    /** Cadastra um assunto ou um serviço. Retorna { ok, item } ou { ok: false, mensagem }. */
    async cadastrar(tipo, corpo) {
      const rota = tipo === 'assunto' ? ROTAS.assuntos : tipo === 'servico' ? ROTAS.servicos : null;
      if (rota === null) return { ok: false, mensagem: MENSAGENS.generica };
      if (token === null) return { ok: false, mensagem: MENSAGENS.sessao };
      if (gravando) return { ok: false, emAndamento: true, mensagem: MENSAGENS.emAndamento };
      gravando = true;
      try {
        const r = await chamar('POST', rota, corpo);
        if (r.falhaDeRede) return { ok: false, mensagem: MENSAGENS.rede };
        if (r.status === 201 && ehObjeto(r.corpo)) {
          const item = tipo === 'assunto' ? r.corpo.assunto : r.corpo.servico;
          if (ehObjeto(item) && ehTexto(item.id) && ehTexto(item.nome)) return { ok: true, item: { id: item.id, nome: item.nome } };
        }
        return { ok: false, mensagem: mensagemDeErro(r.status, r.corpo) };
      } finally {
        gravando = false;
      }
    },
  };
}
