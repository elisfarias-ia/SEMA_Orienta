// Área administrativa local (ambiente de demonstração). Só liga a lógica (admin-logic.js) ao DOM.
// Regras: textos montados com textContent e createElement (nunca HTML em texto), sem armazenamento do navegador, sem cookies
// e sem log. A chave da sessão fica dentro do cliente (memória): recarregar a página ou sair exige uma nova entrada.
// Nada é gravado ao abrir a página; a entrada só lê a sessão e o catálogo.

import {
  AVISO_DADOS_PESSOAIS, criarClienteGestao, servicosDaLista, temasAtivos, validarEntradaTexto, validarLinkNovo, validarNovoServico,
} from './admin-logic.js';

const cliente = criarClienteGestao({ fetchImpl: (...argumentos) => fetch(...argumentos) });
const $ = (id) => document.getElementById(id);

const CAMPOS = {
  novo: { nome: 'novo-nome', tema: 'novo-tema' },
  texto: { titulo: 'texto-titulo', texto: 'texto-texto', descricao: 'texto-descricao', orgaoResponsavel: 'texto-orgao' },
  link: { titulo: 'link-titulo', url: 'link-url', tipo: 'link-tipo', orgaoResponsavel: 'link-orgao', descricao: 'link-descricao', origemOficial: 'link-oficial' },
};
const MANEIRAS = { texto: 'maneira-texto', link: 'maneira-link', existente: 'maneira-existente' };
const PAINEIS = { texto: 'painel-texto', link: 'painel-link', existente: 'painel-existente' };
const VISTAS = { lista: 'vista-lista', novo: 'vista-novo', servico: 'vista-servico' };

let catalogo = null;
let servicoAtual = null; // { id, nome, temaNome }
let ocupado = false; // uma ação de gravação por vez na tela
let sequenciaBusca = 0;
let sequenciaInformacoes = 0;
let resultadoBusca = [];

const status = $('status');

/** Painel de status (aria-live). Com `foco`, leva o foco para ele. */
function mostrarStatus(texto, tipo = 'info', foco = false) {
  status.textContent = texto;
  status.dataset.tipo = tipo;
  if (foco) status.focus();
}

function criar(tag, classe, texto) {
  const elemento = document.createElement(tag);
  if (classe) elemento.className = classe;
  if (texto !== undefined) elemento.textContent = texto;
  return elemento;
}

function focar(elemento) {
  if (elemento) elemento.focus();
}

// ---------- Erros junto ao campo ----------

function limparErro(id) {
  const erro = $(`${id}-erro`);
  const campo = $(id);
  if (erro) {
    erro.textContent = '';
    erro.hidden = true;
  }
  if (campo) campo.removeAttribute('aria-invalid');
}

/** Mostra os erros por campo e devolve o primeiro campo com erro (na ordem da tela). */
function mostrarErros(grupo, erros) {
  let primeiro = null;
  for (const [campo, id] of Object.entries(CAMPOS[grupo])) {
    const mensagem = erros && erros[campo];
    if (!mensagem) {
      limparErro(id);
      continue;
    }
    const erro = $(`${id}-erro`);
    erro.textContent = mensagem;
    erro.hidden = false;
    $(id).setAttribute('aria-invalid', 'true');
    if (primeiro === null) primeiro = $(id);
  }
  return primeiro;
}

function limparFormulario(grupo, formulario) {
  formulario.reset();
  mostrarErros(grupo, {});
}

for (const campos of Object.values(CAMPOS)) {
  for (const id of Object.values(campos)) $(id).addEventListener('input', () => limparErro(id));
}

/** Desabilita o botão enquanto envia (sem clique duplo) e marca o formulário como ocupado. */
function marcarOcupado(botao, formulario, sim, textoOcupado, textoNormal) {
  ocupado = sim;
  botao.disabled = sim;
  botao.textContent = sim ? textoOcupado : textoNormal;
  formulario.setAttribute('aria-busy', sim ? 'true' : 'false');
}

// ---------- Vistas ----------

function mostrarVista(nome) {
  for (const [chave, id] of Object.entries(VISTAS)) $(id).hidden = chave !== nome;
}

function fecharPaineis() {
  for (const chave of Object.keys(PAINEIS)) {
    $(PAINEIS[chave]).hidden = true;
    $(MANEIRAS[chave]).setAttribute('aria-expanded', 'false');
  }
}

// ---------- Entrada e saída ----------

async function entrar() {
  if (ocupado) return;
  const botao = $('botao-entrar');
  ocupado = true;
  botao.disabled = true;
  mostrarStatus('Entrando…');
  const sessao = await cliente.entrar();
  const dados = sessao.ok ? await cliente.carregarCatalogo() : sessao;
  ocupado = false;
  if (!dados.ok) {
    cliente.sair();
    botao.disabled = false;
    mostrarStatus(dados.mensagem, 'erro', true);
    return;
  }
  catalogo = dados.catalogo;
  $('entrada').hidden = true;
  $('gestao').hidden = false;
  $('barra-sessao').hidden = false;
  $('aviso-demo').textContent = 'Servidor de demonstração: esta entrada não é autenticação real e não confirma quem você é.';
  mostrarVista('lista');
  renderizarLista();
  mostrarStatus('Você entrou como servidor de demonstração.');
  const titulo = $('titulo-lista');
  titulo.setAttribute('tabindex', '-1');
  titulo.focus();
}

function sair() {
  if (ocupado) return;
  cliente.sair();
  catalogo = null;
  servicoAtual = null;
  resultadoBusca = [];
  sequenciaBusca += 1;
  sequenciaInformacoes += 1;
  limparFormulario('novo', $('form-novo'));
  limparFormulario('texto', $('form-texto'));
  limparFormulario('link', $('form-link'));
  $('busca-servico').value = '';
  $('existente-consulta').value = '';
  fecharPaineis();
  $('lista-servicos').replaceChildren();
  $('informacoes-lista').replaceChildren();
  $('existente-lista').replaceChildren();
  $('gestao').hidden = true;
  $('barra-sessao').hidden = true;
  $('entrada').hidden = false;
  $('botao-entrar').disabled = false;
  $('aviso-demo').textContent = 'Ambiente administrativo local — sem autenticação';
  mostrarStatus('Você saiu da demonstração.');
  $('botao-entrar').focus();
}

// ---------- Lista de serviços ----------

function renderizarLista() {
  const lista = $('lista-servicos');
  const consulta = $('busca-servico').value;
  const todos = servicosDaLista(catalogo, '');
  const itens = servicosDaLista(catalogo, consulta);
  lista.replaceChildren();
  for (const s of itens) {
    const li = criar('li', 'servico');
    const botao = criar('button', 'servico__botao');
    botao.type = 'button';
    botao.append(criar('span', 'servico__nome', s.nome));
    if (s.temaNome !== '') botao.append(criar('span', 'servico__linha', `Tema: ${s.temaNome}`));
    botao.addEventListener('click', () => abrirServico(s));
    li.append(botao);
    lista.append(li);
  }
  $('lista-resumo').textContent = todos.length === 0
    ? 'Nenhum serviço cadastrado ainda. Use "Novo serviço" para começar.'
    : itens.length === 0 ? 'Nenhum serviço encontrado para essa pesquisa.'
      : `${itens.length} ${itens.length === 1 ? 'serviço' : 'serviços'}.`;
}

async function atualizarCatalogo() {
  const r = await cliente.carregarCatalogo();
  if (r.ok) {
    catalogo = r.catalogo;
    renderizarLista();
  }
  return r.ok;
}

$('busca-servico').addEventListener('input', renderizarLista);

// ---------- Novo serviço ----------

function abrirNovoServico() {
  if (ocupado) return;
  const datalista = $('temas-lista');
  datalista.replaceChildren();
  for (const t of temasAtivos(catalogo)) {
    const opcao = document.createElement('option');
    opcao.value = t.nome;
    datalista.append(opcao);
  }
  limparFormulario('novo', $('form-novo'));
  mostrarVista('novo');
  $('novo-nome').focus();
}

function cancelarNovoServico() {
  if (ocupado) return;
  mostrarVista('lista');
  $('botao-novo-servico').focus();
}

async function enviarNovoServico(evento) {
  evento.preventDefault();
  if (ocupado) return;
  const validacao = validarNovoServico({ nome: $('novo-nome').value, tema: $('novo-tema').value }, temasAtivos(catalogo));
  if (!validacao.ok) {
    focar(mostrarErros('novo', validacao.erros));
    mostrarStatus('Revise os campos indicados.', 'erro');
    return;
  }
  mostrarErros('novo', {});
  marcarOcupado($('novo-enviar'), $('form-novo'), true, 'Criando…', 'Criar serviço');
  mostrarStatus('Criando o serviço…');
  const r = await cliente.criarServico(validacao.corpo);
  marcarOcupado($('novo-enviar'), $('form-novo'), false, 'Criando…', 'Criar serviço');
  if (!r.ok) {
    const primeiro = mostrarErros('novo', r.erros);
    mostrarStatus(r.mensagem, 'erro');
    if (primeiro) primeiro.focus();
    else status.focus();
    return;
  }
  await atualizarCatalogo();
  limparFormulario('novo', $('form-novo'));
  await abrirServico(r.servico, `Serviço "${r.servico.nome}" criado. Agora você pode adicionar informações.`);
}

// ---------- Serviço e informações ----------

async function abrirServico(servico, mensagemInicial = '') {
  servicoAtual = servico;
  $('titulo-servico').textContent = servico.nome;
  $('servico-tema').textContent = servico.temaNome === '' ? '' : `Tema: ${servico.temaNome}`;
  limparFormulario('texto', $('form-texto'));
  limparFormulario('link', $('form-link'));
  $('existente-consulta').value = '';
  $('existente-lista').replaceChildren();
  $('existente-resumo').textContent = '';
  fecharPaineis();
  for (const id of Object.values(MANEIRAS)) $(id).disabled = false;
  mostrarVista('servico');
  mostrarStatus(mensagemInicial);
  $('titulo-servico').focus();
  await carregarInformacoes();
}

function voltarParaLista() {
  if (ocupado) return;
  servicoAtual = null;
  sequenciaInformacoes += 1;
  mostrarVista('lista');
  renderizarLista();
  mostrarStatus('');
  $('titulo-lista').focus();
}

function itemDaInformacao(i) {
  const li = criar('li', 'servico informacao');
  const topo = criar('p', 'servico__nome');
  topo.append(document.createTextNode(i.titulo));
  topo.append(criar('span', 'selo', i.tipo === 'texto' ? 'Texto' : 'Link'));
  topo.append(criar('span', 'selo', i.situacao));
  li.append(topo);
  if (i.descricao !== '') li.append(criar('p', 'servico__linha', i.descricao));
  if (i.tipo === 'texto' && i.texto !== '') li.append(criar('p', 'informacao__texto', i.textoCortado ? `${i.texto}…` : i.texto));
  if (i.url !== null) {
    const linha = criar('p', 'servico__linha');
    const a = criar('a', 'link-externo', i.url);
    a.href = i.url;
    a.rel = 'noopener noreferrer';
    a.target = '_blank';
    linha.append(a);
    li.append(linha);
  }
  const detalhes = [i.orgao !== '' ? `Órgão: ${i.orgao}` : '', i.data !== '' ? `Cadastrado em ${i.data}` : ''].filter((t) => t !== '');
  if (detalhes.length) li.append(criar('p', 'servico__linha', detalhes.join(' · ')));
  if (i.reutilizado) li.append(criar('p', 'servico__linha', 'Link copiado de outro serviço. Precisa de nova revisão.'));
  return li;
}

async function carregarInformacoes() {
  if (servicoAtual === null) return;
  const minha = ++sequenciaInformacoes;
  const lista = $('informacoes-lista');
  lista.setAttribute('aria-busy', 'true');
  $('informacoes-resumo').textContent = 'Carregando as informações…';
  const r = await cliente.carregarInformacoes(servicoAtual.id);
  if (minha !== sequenciaInformacoes) return;
  lista.setAttribute('aria-busy', 'false');
  lista.replaceChildren();
  if (!r.ok) {
    $('informacoes-resumo').textContent = r.mensagem;
    return;
  }
  for (const i of r.itens) lista.append(itemDaInformacao(i));
  for (const id of Object.values(MANEIRAS)) $(id).disabled = !r.editavel;
  $('informacoes-resumo').textContent = !r.editavel
    ? 'Este serviço não está em elaboração e não aceita novas informações.'
    : r.itens.length === 0 ? 'Nenhuma informação ainda. Escolha uma das três maneiras acima para adicionar.'
      : `${r.itens.length} ${r.itens.length === 1 ? 'informação' : 'informações'}. Nada aqui foi publicado nem está disponível no chat.`;
}

function alternarPainel(nome) {
  if (ocupado) return;
  const abrir = $(PAINEIS[nome]).hidden;
  fecharPaineis();
  if (!abrir) return;
  $(PAINEIS[nome]).hidden = false;
  $(MANEIRAS[nome]).setAttribute('aria-expanded', 'true');
  if (nome === 'texto') $('texto-titulo').focus();
  else if (nome === 'link') $('link-titulo').focus();
  else {
    $('existente-consulta').focus();
    buscarLinks();
  }
}

function fecharPainel(nome) {
  if (ocupado) return;
  fecharPaineis();
  $(MANEIRAS[nome]).focus();
}

/** Falha de gravação: mostra o erro junto ao campo (se houver) e atualiza a lista quando o estado mudou. */
async function tratarFalha(grupo, r) {
  const primeiro = mostrarErros(grupo, r.erros);
  mostrarStatus(r.mensagem, 'erro');
  if (primeiro) primeiro.focus();
  else status.focus();
  if (r.recarregar) await carregarInformacoes();
}

async function concluirAdicao(mensagem) {
  fecharPaineis();
  mostrarStatus(mensagem);
  await carregarInformacoes();
  const titulo = $('titulo-informacoes');
  titulo.scrollIntoView({ block: 'nearest' });
  titulo.focus();
}

async function enviarTexto(evento) {
  evento.preventDefault();
  if (ocupado || servicoAtual === null) return;
  const validacao = validarEntradaTexto({
    titulo: $('texto-titulo').value, texto: $('texto-texto').value, descricao: $('texto-descricao').value, orgaoResponsavel: $('texto-orgao').value,
  });
  if (!validacao.ok) {
    focar(mostrarErros('texto', validacao.erros));
    mostrarStatus('Revise os campos indicados.', 'erro');
    return;
  }
  mostrarErros('texto', {});
  marcarOcupado($('texto-enviar'), $('form-texto'), true, 'Salvando…', 'Adicionar texto');
  mostrarStatus('Salvando o texto…');
  const r = await cliente.adicionarTexto(servicoAtual.id, validacao.corpo);
  marcarOcupado($('texto-enviar'), $('form-texto'), false, 'Salvando…', 'Adicionar texto');
  if (!r.ok) {
    await tratarFalha('texto', r);
    return;
  }
  limparFormulario('texto', $('form-texto'));
  await concluirAdicao('Texto adicionado. Ele fica em elaboração e ainda precisa ser revisado.');
}

async function enviarLink(evento) {
  evento.preventDefault();
  if (ocupado || servicoAtual === null) return;
  const validacao = validarLinkNovo({
    titulo: $('link-titulo').value, url: $('link-url').value, tipo: $('link-tipo').value, orgaoResponsavel: $('link-orgao').value,
    descricao: $('link-descricao').value, origemOficial: $('link-oficial').checked,
  });
  if (!validacao.ok) {
    focar(mostrarErros('link', validacao.erros));
    mostrarStatus('Revise os campos indicados.', 'erro');
    return;
  }
  mostrarErros('link', {});
  marcarOcupado($('link-enviar'), $('form-link'), true, 'Salvando…', 'Adicionar link');
  mostrarStatus('Salvando o link…');
  const r = await cliente.adicionarLink(servicoAtual.id, validacao.corpo);
  marcarOcupado($('link-enviar'), $('form-link'), false, 'Salvando…', 'Adicionar link');
  if (!r.ok) {
    await tratarFalha('link', r);
    return;
  }
  limparFormulario('link', $('form-link'));
  await concluirAdicao('Link adicionado. Ele fica em elaboração e ainda precisa ser revisado.');
}

// ---------- Usar link já cadastrado ----------

function desenharResultadoBusca(truncado) {
  const lista = $('existente-lista');
  lista.replaceChildren();
  for (const item of resultadoBusca) {
    const li = criar('li', 'servico');
    li.append(criar('p', 'servico__nome', item.titulo));
    if (item.descricao !== '') li.append(criar('p', 'servico__linha', item.descricao));
    if (item.orgao !== '') li.append(criar('p', 'servico__linha', `Órgão: ${item.orgao}`));
    if (item.url !== null) li.append(criar('p', 'servico__linha', item.url));
    const botao = criar('button', 'botao botao--secundario', item.jaNoServico ? 'Já neste serviço' : 'Usar este link');
    botao.type = 'button';
    botao.disabled = item.jaNoServico;
    botao.setAttribute('aria-label', item.jaNoServico ? `Já neste serviço: ${item.titulo}` : `Usar este link: ${item.titulo}`);
    botao.addEventListener('click', () => usarLink(item));
    const acoes = criar('p', 'servico__acoes');
    acoes.append(botao);
    li.append(acoes);
    lista.append(li);
  }
  $('existente-resumo').textContent = resultadoBusca.length === 0
    ? 'Nenhum link cadastrado encontrado.'
    : `${resultadoBusca.length} ${resultadoBusca.length === 1 ? 'link encontrado' : 'links encontrados'}.${truncado ? ' Mostrando só os primeiros; pesquise para refinar.' : ''}`;
}

async function buscarLinks(evento) {
  if (evento) evento.preventDefault();
  if (servicoAtual === null) return;
  const minha = ++sequenciaBusca;
  const lista = $('existente-lista');
  lista.setAttribute('aria-busy', 'true');
  $('existente-resumo').textContent = 'Pesquisando…';
  const r = await cliente.buscarLinks(servicoAtual.id, $('existente-consulta').value);
  if (minha !== sequenciaBusca) return;
  lista.setAttribute('aria-busy', 'false');
  if (!r.ok) {
    resultadoBusca = [];
    lista.replaceChildren();
    $('existente-resumo').textContent = r.mensagem;
    return;
  }
  resultadoBusca = r.itens;
  desenharResultadoBusca(r.truncado);
}

async function usarLink(item) {
  if (ocupado || servicoAtual === null) return;
  ocupado = true;
  const botoes = $('existente-lista').querySelectorAll('button');
  for (const b of botoes) b.disabled = true;
  mostrarStatus('Copiando o link para este serviço…');
  const r = await cliente.usarLinkExistente(servicoAtual.id, item);
  ocupado = false;
  if (!r.ok) {
    mostrarStatus(r.mensagem, 'erro');
    await buscarLinks();
    if (r.recarregar) await carregarInformacoes();
    status.focus();
    return;
  }
  await concluirAdicao('Link copiado para este serviço como rascunho. Ele precisa de uma nova revisão.');
}

// ---------- Ligações ----------

for (const aviso of document.querySelectorAll('.aviso-dados')) aviso.textContent = AVISO_DADOS_PESSOAIS;
$('botao-entrar').addEventListener('click', entrar);
$('botao-sair').addEventListener('click', sair);
$('botao-novo-servico').addEventListener('click', abrirNovoServico);
$('novo-cancelar').addEventListener('click', cancelarNovoServico);
$('form-novo').addEventListener('submit', enviarNovoServico);
$('botao-voltar').addEventListener('click', voltarParaLista);
for (const nome of Object.keys(MANEIRAS)) $(MANEIRAS[nome]).addEventListener('click', () => alternarPainel(nome));
$('texto-cancelar').addEventListener('click', () => fecharPainel('texto'));
$('link-cancelar').addEventListener('click', () => fecharPainel('link'));
$('existente-cancelar').addEventListener('click', () => fecharPainel('existente'));
$('form-texto').addEventListener('submit', enviarTexto);
$('form-link').addEventListener('submit', enviarLink);
$('form-busca').addEventListener('submit', buscarLinks);
