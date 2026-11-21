// Área administrativa local (ambiente local). Só liga a lógica (admin-logic.js) ao DOM.
// Regras: textos montados com textContent e createElement (nunca HTML em texto), sem armazenamento do navegador, sem cookies
// e sem log. A chave da sessão fica dentro do cliente (memória). Login simulado (Passo 8B): ao abrir, a página lê a sessão do
// servidor local; sem usuário escolhido, mostra a escolha entre os usuários fictícios; com usuário, entra direto.
// Nada é gravado ao abrir a página; a entrada só lê a sessão e o catálogo.

import {
  AVISO_DADOS_PESSOAIS, AVISO_SERVICO_CONCLUIDO_PARA_EDITAR, AVISO_USUARIOS_FICTICIOS, criarClienteGestao, MENSAGEM_ESCOLHA_USUARIO, MENSAGEM_USUARIO_MUDOU,
  rotuloDaEscolha, rotuloDoUsuario, frasePublicacao, fraseBlocosReabertos, frasePendenciasParaConcluir, impactoDaEdicaoDoServico, impactoDaEdicaoDoTema,
  servicoDaUrl, servicosDaLista, temasAtivos, todosOsTemas, validarEdicaoDeServico, validarEdicaoDeTema, validarEntradaTexto, validarLinkNovo, validarNovoServico,
} from './admin-logic.js';

// Se o servidor recusar a chave da sessão (outro usuário entrou em outra aba ou o servidor reiniciou), a tela volta à escolha.
const cliente = criarClienteGestao({ fetchImpl: (...argumentos) => fetch(...argumentos), aoPerderSessao: () => setTimeout(perderSessao, 0) });
const $ = (id) => document.getElementById(id);

const CAMPOS = {
  novo: { nome: 'novo-nome', tema: 'novo-tema' },
  texto: { titulo: 'texto-titulo', texto: 'texto-texto' },
  link: { titulo: 'link-titulo', url: 'link-url', tipo: 'link-tipo', orgaoResponsavel: 'link-orgao', descricao: 'link-descricao', origemOficial: 'link-oficial' },
};
const MANEIRAS = { texto: 'maneira-texto', link: 'maneira-link' };
const PAINEIS = { texto: 'painel-texto', link: 'painel-link' };
const VISTAS = { lista: 'vista-lista', novo: 'vista-novo', servico: 'vista-servico' };

let catalogo = null;
let servicoAtual = null; // { id, nome, temaNome }
let ocupado = false; // uma ação de gravação por vez na tela
let sequenciaBusca = 0;
let sequenciaInformacoes = 0;
let sequenciaRevisao = 0;
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

let usuarioAtual = null; // { usuarioId, nome, perfil, setor } da sessão
let trocando = false; // a escolha foi reaberta por "Trocar usuário" (cancelar volta sem mudar)

function mostrarErroEscolha(texto) {
  const erro = $('escolha-erro');
  erro.textContent = texto;
  erro.hidden = texto === '';
}

/** Monta as opções a partir dos usuários devolvidos pelo servidor (textContent; nada de HTML em texto). */
function montarEscolha(usuarios) {
  const caixa = $('escolha-opcoes');
  caixa.replaceChildren();
  usuarios.forEach((u, i) => {
    const linha = criar('div', 'campo campo--caixa');
    const opcao = document.createElement('input');
    opcao.type = 'radio';
    opcao.name = 'usuario';
    opcao.id = `usuario-${i + 1}`;
    opcao.value = u.usuarioId;
    opcao.addEventListener('change', () => mostrarErroEscolha(''));
    const rotulo = criar('label', '', rotuloDaEscolha(u));
    rotulo.htmlFor = opcao.id;
    linha.append(opcao, rotulo);
    caixa.append(linha);
  });
}

function marcarEscolha(usuarioId) {
  for (const opcao of document.querySelectorAll('input[name="usuario"]')) opcao.checked = opcao.value === usuarioId;
}

/** Mostra a escolha de usuário. Na troca, a gestão fica escondida até confirmar ou cancelar. */
function mostrarEscolha({ troca = false } = {}) {
  trocando = troca;
  mostrarErroEscolha('');
  marcarEscolha(troca && usuarioAtual !== null ? usuarioAtual.usuarioId : null);
  $('gestao').hidden = true;
  $('barra-sessao').hidden = true;
  $('entrada').hidden = false;
  $('botao-cancelar-troca').hidden = !troca;
  $('botao-entrar').disabled = false;
}

function abrirGestao(usuario, dadosDoCatalogo) {
  usuarioAtual = usuario;
  trocando = false;
  catalogo = dadosDoCatalogo;
  $('sessao-usuario').textContent = rotuloDoUsuario(usuario);
  $('entrada').hidden = true;
  $('botao-cancelar-troca').hidden = true;
  $('gestao').hidden = false;
  $('barra-sessao').hidden = false;
  mostrarVista('lista');
  renderizarLista();
  renderizarTemas();
  mostrarStatus('Você acessou a administração.');
  const titulo = $('titulo-lista');
  titulo.setAttribute('tabindex', '-1');
  titulo.focus();
}

/** Escolha confirmada: entra com o usuário marcado (chave nova; a anterior deixa de valer) e carrega o catálogo. */
async function entrar(evento) {
  if (evento) evento.preventDefault();
  if (ocupado) return;
  const escolhido = document.querySelector('input[name="usuario"]:checked');
  if (escolhido === null) {
    mostrarErroEscolha(MENSAGEM_ESCOLHA_USUARIO);
    $('escolha-usuario').focus();
    return;
  }
  const botao = $('botao-entrar');
  ocupado = true;
  botao.disabled = true;
  mostrarStatus('Entrando…');
  const sessao = await cliente.entrarComo(escolhido.value);
  if (sessao.ok) {
    // O servidor já trocou o usuário: o topo passa a mostrar o novo e a troca termina, mesmo se o catálogo falhar depois.
    usuarioAtual = sessao.usuario;
    trocando = false;
    $('sessao-usuario').textContent = rotuloDoUsuario(sessao.usuario);
    $('botao-cancelar-troca').hidden = true;
  }
  const dados = sessao.ok ? await cliente.carregarCatalogo() : sessao;
  ocupado = false;
  if (!dados.ok) {
    botao.disabled = false;
    mostrarStatus(dados.mensagem, 'erro', true);
    return;
  }
  limparTela();
  abrirGestao(sessao.usuario, dados.catalogo);
  // Vindo de "Conteúdo para respostas": reabre o mesmo serviço (id validado na URL, nunca exibido).
  const idDaUrl = servicoDaUrl(window.location.search);
  const doCatalogo = idDaUrl === null ? undefined : servicosDaLista(catalogo, '').find((s) => s.id === idDaUrl);
  if (doCatalogo !== undefined) await abrirServico(doCatalogo);
}

/** Limpa o estado da gestão (sem falar com o servidor). */
function limparTela() {
  catalogo = null;
  servicoAtual = null;
  resultadoBusca = [];
  sequenciaBusca += 1;
  sequenciaInformacoes += 1;
  sequenciaRevisao += 1;
  limparFormulario('novo', $('form-novo'));
  limparFormulario('texto', $('form-texto'));
  limparFormulario('link', $('form-link'));
  $('busca-servico').value = '';
  $('existente-consulta').value = '';
  fecharPaineis();
  $('lista-servicos').replaceChildren();
  $('lista-temas').replaceChildren();
  edicao = null;
  for (const dlg of [dlgImpacto, dlgEdicao]) if (dlg.open) dlg.close();
  $('informacoes-lista').replaceChildren();
  $('existente-lista').replaceChildren();
}

async function sair() {
  if (ocupado) return;
  ocupado = true;
  $('botao-sair').disabled = true;
  const r = await cliente.sair();
  ocupado = false;
  $('botao-sair').disabled = false;
  usuarioAtual = null;
  limparTela();
  mostrarEscolha();
  mostrarStatus(r.ok ? 'Você saiu da administração.' : r.mensagem, r.ok ? 'info' : 'erro');
  $('botao-entrar').focus();
}

function trocarUsuario() {
  if (ocupado || cliente.gravando()) return;
  mostrarEscolha({ troca: true });
  mostrarStatus('');
  $('escolha-usuario').focus();
}

function cancelarTroca() {
  if (ocupado || !trocando || usuarioAtual === null) return;
  trocando = false;
  mostrarErroEscolha('');
  $('entrada').hidden = true;
  $('botao-cancelar-troca').hidden = true;
  $('gestao').hidden = false;
  $('barra-sessao').hidden = false;
  mostrarStatus('');
  $('botao-trocar').focus();
}

/** O servidor recusou a chave em uso: outro usuário entrou (outra aba) ou o servidor reiniciou. Volta à escolha. */
function perderSessao() {
  ocupado = false;
  usuarioAtual = null;
  limparTela();
  mostrarEscolha();
  mostrarStatus(MENSAGEM_USUARIO_MUDOU, 'erro', true);
}

/** Ao abrir: lê a sessão do servidor local. Sem usuário, mostra a escolha; com usuário, entra direto. */
async function iniciar() {
  const botao = $('botao-entrar');
  ocupado = true;
  botao.disabled = true;
  // A escolha só aparece depois de saber que não há usuário na sessão (evita mostrá-la e escondê-la em seguida).
  $('entrada').hidden = true;
  mostrarStatus('Verificando a sessão…');
  const r = await cliente.recuperarSessao();
  if (!r.ok) {
    ocupado = false;
    mostrarEscolha();
    mostrarStatus(r.mensagem, 'erro');
    return;
  }
  montarEscolha(r.usuarios);
  if (r.usuario === null) {
    ocupado = false;
    mostrarEscolha();
    mostrarStatus('');
    return;
  }
  const dados = await cliente.carregarCatalogo();
  ocupado = false;
  if (!dados.ok) {
    mostrarEscolha();
    mostrarStatus(dados.mensagem, 'erro');
    return;
  }
  abrirGestao(r.usuario, dados.catalogo);
  const idDaUrl = servicoDaUrl(window.location.search);
  const doCatalogo = idDaUrl === null ? undefined : servicosDaLista(catalogo, '').find((s) => s.id === idDaUrl);
  if (doCatalogo !== undefined) await abrirServico(doCatalogo);
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
    renderizarTemas();
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
  $('painel-revisar').href = `./conteudo/?servico=${encodeURIComponent(servico.id)}`;
  $('painel-situacao-texto').textContent = 'Carregando a situação…';
  $('painel-resumo').textContent = '';
  $('painel-nova-versao').hidden = true;
  $('painel-resolver').hidden = true;
  $('botao-editar-servico').disabled = true; // só é liberado quando a situação confirmar que a versão está em elaboração
  $('editar-servico-ajuda').hidden = true;
  mostrarVista('servico');
  mostrarStatus(mensagemInicial);
  $('titulo-servico').focus();
  await atualizarServico();
}

/** Recarrega a lista de informações e a situação da revisão do serviço aberto. */
function atualizarServico() {
  return Promise.all([carregarInformacoes(), carregarRevisao()]);
}

async function carregarRevisao() {
  if (servicoAtual === null) return;
  const minha = ++sequenciaRevisao;
  const [r, pub] = await Promise.all([cliente.carregarRevisao(servicoAtual.id), cliente.carregarResumoPublicacao(servicoAtual.id)]);
  if (minha !== sequenciaRevisao) return;
  const situacao = $('painel-situacao-texto');
  situacao.replaceChildren();
  if (!r.ok) {
    situacao.textContent = r.mensagem;
    $('painel-resumo').textContent = '';
    $('painel-nova-versao').hidden = true;
    $('painel-resolver').hidden = true;
    return;
  }
  $('botao-editar-servico').disabled = r.congelada;
  $('editar-servico-ajuda').textContent = r.congelada ? AVISO_SERVICO_CONCLUIDO_PARA_EDITAR : '';
  $('editar-servico-ajuda').hidden = !r.congelada;
  situacao.append('Situação: ', criar('strong', '', r.rotulo));
  if (r.revisaoPendente) situacao.append(criar('span', 'selo selo--pendente', 'Revisão pendente'));
  // Versão bloqueada: o painel mostra a etapa de publicação (a ação em si fica na página de revisão).
  const etapa = r.congelada && pub.ok ? pub : null;
  $('painel-resumo').textContent = etapa !== null ? frasePublicacao(etapa) : frasePendenciasParaConcluir(r.resumo);
  $('painel-revisar').textContent = etapa === null ? 'Revisar informações' : { autorizar: 'Autorizar publicação', publicar: 'Publicar', publicado: 'Ver informações' }[etapa.etapa] ?? 'Revisar informações';
  $('painel-nova-versao').hidden = !r.congelada;
  $('painel-resolver').hidden = r.congelada || r.pendencias.length === 0;
  if (servicoAtual !== null) $('painel-resolver').href = `./conteudo/?servico=${encodeURIComponent(servicoAtual.id)}&pendencias=1`;
}

async function criarNovaVersao() {
  if (ocupado || servicoAtual === null) return;
  ocupado = true;
  const botao = $('painel-nova-versao');
  botao.disabled = true;
  mostrarStatus('Criando a nova versão…');
  const r = await cliente.criarNovaVersao(servicoAtual.id);
  ocupado = false;
  botao.disabled = false;
  if (r.ok) {
    await atualizarCatalogo();
    await atualizarServico();
    mostrarStatus('Nova versão criada. Ela está em elaboração e nada foi publicado.', 'info', true);
    return;
  }
  mostrarStatus(r.mensagem, 'erro');
  if (r.recarregar) await atualizarServico();
  status.focus();
}

function voltarParaLista() {
  if (ocupado) return;
  servicoAtual = null;
  sequenciaInformacoes += 1;
  sequenciaRevisao += 1;
  if (window.location.search !== '') window.history.replaceState(null, '', window.location.pathname);
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
  $('titulo-adicionar').hidden = !r.editavel;
  $('grupo-adicionar').hidden = !r.editavel;
  if (!r.editavel) fecharPaineis();
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
  else {
    $('link-titulo').focus();
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
  if (r.recarregar) await atualizarServico();
}

async function concluirAdicao(mensagem) {
  fecharPaineis();
  mostrarStatus(mensagem);
  await atualizarServico();
  const titulo = $('titulo-informacoes');
  titulo.scrollIntoView({ block: 'nearest' });
  titulo.focus();
}

async function enviarTexto(evento) {
  evento.preventDefault();
  if (ocupado || servicoAtual === null) return;
  const validacao = validarEntradaTexto({
    titulo: $('texto-titulo').value, texto: $('texto-texto').value,
  });
  if (!validacao.ok) {
    focar(mostrarErros('texto', validacao.erros));
    mostrarStatus('Revise os campos indicados.', 'erro');
    return;
  }
  mostrarErros('texto', {});
  marcarOcupado($('texto-enviar'), $('form-texto'), true, 'Salvando…', 'Incluir texto');
  mostrarStatus('Salvando o texto…');
  const r = await cliente.adicionarTexto(servicoAtual.id, validacao.corpo);
  marcarOcupado($('texto-enviar'), $('form-texto'), false, 'Salvando…', 'Incluir texto');
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
  marcarOcupado($('link-enviar'), $('form-link'), true, 'Salvando…', 'Incluir link');
  mostrarStatus('Salvando o link…');
  const r = await cliente.adicionarLink(servicoAtual.id, validacao.corpo);
  marcarOcupado($('link-enviar'), $('form-link'), false, 'Salvando…', 'Incluir link');
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
    if (r.recarregar) await atualizarServico();
    status.focus();
    return;
  }
  await concluirAdicao('Link copiado para este serviço como rascunho. Ele precisa de uma nova revisão.');
}

// ---------- Editar tema e serviço ----------
// O id do tema ou do serviço fica só na memória (variável `edicao`) e nunca aparece na tela. Nada é enviado ao abrir o diálogo:
// a gravação só acontece depois de "Salvar" (e, quando há impacto, depois de "Confirmar alteração").

const dlgEdicao = $('dialogo-edicao');
const dlgImpacto = $('dialogo-impacto');
const CAMPOS_EDICAO = { nome: 'ed-nome', tema: 'ed-tema' };
let edicao = null; // { tipo, id, original, revisao, temas, servicos, informacoesAceitas, pendente, gatilho }

function renderizarTemas() {
  const lista = $('lista-temas');
  lista.replaceChildren();
  for (const t of todosOsTemas(catalogo)) {
    const li = criar('li', 'servico');
    li.__temaId = t.id;
    li.append(criar('p', 'servico__nome', t.nome));
    const botao = criar('button', 'botao botao--secundario', 'Editar');
    botao.type = 'button';
    botao.setAttribute('aria-label', `Editar o tema ${t.nome}`);
    botao.addEventListener('click', () => abrirEdicaoTema(t, botao));
    const acoes = criar('p', 'servico__acoes');
    acoes.append(botao);
    li.append(acoes);
    lista.append(li);
  }
}

const botaoDoTema = (id) => [...document.querySelectorAll('#lista-temas li')].find((li) => li.__temaId === id)?.querySelector('button') ?? null;

function abrirDialogo(dlg) {
  if (typeof dlg.showModal === 'function') dlg.showModal();
  else dlg.setAttribute('open', '');
}

function devolverFoco(gatilho) {
  if (gatilho && gatilho.isConnected && !gatilho.disabled) gatilho.focus();
  else status.focus();
}

function limparErrosEdicao() {
  for (const id of Object.values(CAMPOS_EDICAO)) limparErro(id);
  $('ed-mensagem').hidden = true;
  $('ed-mensagem').textContent = '';
}

function mostrarErrosEdicao(erros, mensagem) {
  limparErrosEdicao();
  let primeiro = null;
  for (const [campo, id] of Object.entries(CAMPOS_EDICAO)) {
    const texto = erros && erros[campo];
    if (!texto) continue;
    $(`${id}-erro`).textContent = texto;
    $(`${id}-erro`).hidden = false;
    $(id).setAttribute('aria-invalid', 'true');
    if (primeiro === null) primeiro = $(id);
  }
  if (mensagem) {
    $('ed-mensagem').textContent = mensagem;
    $('ed-mensagem').hidden = false;
  }
  (primeiro ?? $('ed-mensagem')).focus();
}

function bloquearEdicao(sim) {
  for (const id of ['ed-nome', 'ed-tema', 'ed-salvar']) $(id).disabled = sim;
  $('form-edicao').setAttribute('aria-busy', sim ? 'true' : 'false');
}

function prepararDialogoEdicao(titulo, comTema) {
  $('form-edicao').reset();
  $('ed-tema').replaceChildren();
  limparErrosEdicao();
  $('ed-titulo').textContent = titulo;
  $('ed-grupo-tema').hidden = !comTema;
  $('ed-carregando').hidden = false;
  bloquearEdicao(true);
  abrirDialogo(dlgEdicao);
  $('ed-cancelar').focus();
}

/** Depois da leitura: se falhou, mostra a mensagem no diálogo (e atualiza a tela quando o estado mudou); senão libera o formulário. */
async function aoLerEdicao(r, id, preencher) {
  if (edicao === null || edicao.id !== id || !dlgEdicao.open) return;
  $('ed-carregando').hidden = true;
  if (!r.ok) {
    mostrarErrosEdicao({}, r.mensagem);
    if (r.recarregar) await (edicao.tipo === 'tema' ? atualizarCatalogo() : atualizarServico());
    return;
  }
  preencher(r);
  edicao.revisao = r.revisao;
  bloquearEdicao(false);
  $('ed-nome').focus();
}

async function abrirEdicaoTema(tema, gatilho) {
  if (ocupado || cliente.gravando()) return;
  edicao = { tipo: 'tema', id: tema.id, original: null, revisao: '', temas: [], servicos: [], informacoesAceitas: [], pendente: null, gatilho };
  prepararDialogoEdicao('Editar tema', false);
  const r = await cliente.carregarEdicaoDoTema(tema.id);
  await aoLerEdicao(r, tema.id, (lido) => {
    $('ed-nome').value = lido.nome;
    edicao.original = { id: tema.id, nome: lido.nome };
    edicao.servicos = lido.servicos;
  });
}

async function abrirEdicaoServico(gatilho) {
  if (ocupado || cliente.gravando() || servicoAtual === null) return;
  const { id } = servicoAtual;
  edicao = { tipo: 'servico', id, original: null, revisao: '', temas: [], servicos: [], informacoesAceitas: [], pendente: null, gatilho };
  prepararDialogoEdicao('Editar nome e tema', true);
  const r = await cliente.carregarEdicaoDoServico(id);
  await aoLerEdicao(r, id, (lido) => {
    const temas = temasAtivos(catalogo);
    if (!temas.some((t) => t.id === lido.temaId)) {
      const atual = todosOsTemas(catalogo).find((t) => t.id === lido.temaId);
      if (atual) temas.push(atual);
    }
    for (const t of temas) {
      const opcao = document.createElement('option');
      opcao.value = t.id;
      opcao.textContent = t.nome;
      $('ed-tema').append(opcao);
    }
    $('ed-tema').value = lido.temaId;
    $('ed-nome').value = lido.nome;
    edicao.original = { id, nome: lido.nome, temaId: lido.temaId };
    edicao.temas = temas;
    edicao.informacoesAceitas = lido.informacoesAceitas;
  });
}

function abrirImpacto(frases, lista) {
  const resumo = $('im-resumo');
  resumo.replaceChildren();
  for (const frase of frases) resumo.append(criar('p', '', frase));
  const itens = $('im-lista');
  itens.replaceChildren();
  for (const texto of lista) itens.append(criar('li', '', texto));
  itens.hidden = lista.length === 0;
  $('im-mensagem').hidden = true;
  $('im-mensagem').textContent = '';
  $('im-voltar').disabled = false;
  $('im-confirmar').disabled = false;
  dlgImpacto.removeAttribute('aria-busy');
  abrirDialogo(dlgImpacto);
  $('im-voltar').focus();
}

async function salvarEdicao(evento) {
  evento.preventDefault();
  if (edicao === null || edicao.original === null || ocupado || cliente.gravando()) return;
  if (edicao.tipo === 'tema') {
    const v = validarEdicaoDeTema({ nome: $('ed-nome').value }, edicao.original, todosOsTemas(catalogo));
    if (!v.ok) {
      mostrarErrosEdicao(v.erros, 'Revise os campos indicados e tente novamente.');
      return;
    }
    if (!v.mudou) {
      mostrarErrosEdicao({}, 'Nenhuma alteração para salvar.');
      return;
    }
    limparErrosEdicao();
    edicao.pendente = { nome: v.nome };
    const impacto = impactoDaEdicaoDoTema(edicao.original.nome, v.nome, edicao.servicos);
    abrirImpacto(impacto.frases, impacto.lista);
    return;
  }
  const temaEscolhido = $('ed-tema').value;
  const v = validarEdicaoDeServico({ nome: $('ed-nome').value, temaId: temaEscolhido }, edicao.original, edicao.temas, servicosDaLista(catalogo, ''));
  if (!v.ok) {
    mostrarErrosEdicao(v.erros, 'Revise os campos indicados e tente novamente.');
    return;
  }
  if (!v.mudou) {
    mostrarErrosEdicao({}, 'Nenhuma alteração para salvar.');
    return;
  }
  limparErrosEdicao();
  const nomeDoTema = (id) => (edicao.temas.find((t) => t.id === id) ?? { nome: '' }).nome;
  const impacto = impactoDaEdicaoDoServico({
    nomeAtual: edicao.original.nome, nomeNovo: v.corpo.nome ?? edicao.original.nome,
    temaAtualNome: nomeDoTema(edicao.original.temaId), temaNovoNome: nomeDoTema(temaEscolhido), informacoesAceitas: edicao.informacoesAceitas,
  });
  edicao.pendente = { corpo: v.corpo, confirmar: impacto.exigeConfirmacao };
  if (impacto.exigeConfirmacao) {
    abrirImpacto(impacto.frases, impacto.lista);
    return;
  }
  await enviarEdicao();
}

function fecharDialogosDeEdicao() {
  for (const dlg of [dlgImpacto, dlgEdicao]) if (dlg.open) dlg.close();
}

async function enviarEdicao() {
  const e = edicao;
  if (e === null || e.pendente === null || ocupado || cliente.gravando()) return;
  ocupado = true;
  bloquearEdicao(true);
  $('ed-cancelar').disabled = true;
  $('im-voltar').disabled = true;
  $('im-confirmar').disabled = true;
  dlgImpacto.setAttribute('aria-busy', 'true');
  const promessa = e.tipo === 'tema'
    ? cliente.editarTema(e.id, e.pendente.nome, e.revisao)
    : cliente.editarServico(e.id, e.pendente.corpo, e.revisao, e.pendente.confirmar);
  const r = await promessa;
  dlgImpacto.removeAttribute('aria-busy');
  if (r.ok || r.recarregar) {
    edicao = null;
    fecharDialogosDeEdicao();
    $('ed-cancelar').disabled = false;
    await atualizarCatalogo();
    if (e.tipo === 'servico' && servicoAtual !== null && servicoAtual.id === e.id) {
      const novo = servicosDaLista(catalogo, '').find((s) => s.id === e.id);
      if (novo !== undefined) {
        servicoAtual = novo;
        $('titulo-servico').textContent = novo.nome;
        $('servico-tema').textContent = novo.temaNome === '' ? '' : `Tema: ${novo.temaNome}`;
      }
      await atualizarServico();
    }
    ocupado = false;
    if (r.ok) {
      const reabertas = e.tipo === 'servico' ? fraseBlocosReabertos(r.blocosReabertos) : '';
      mostrarStatus(e.tipo === 'tema'
        ? 'Tema alterado. O novo nome já aparece nos serviços que o usam.'
        : `Serviço alterado. Nada foi publicado.${reabertas === '' ? '' : ` ${reabertas}`}`);
      devolverFoco(e.tipo === 'tema' ? botaoDoTema(e.id) : $('botao-editar-servico'));
    } else {
      mostrarStatus(r.mensagem, 'erro', true);
    }
    return;
  }
  ocupado = false;
  $('ed-cancelar').disabled = false;
  bloquearEdicao(false);
  $('im-voltar').disabled = false;
  $('im-confirmar').disabled = false;
  if (r.erros || !dlgImpacto.open) {
    if (dlgImpacto.open) dlgImpacto.close();
    mostrarErrosEdicao(r.erros, r.mensagem);
    return;
  }
  $('im-mensagem').textContent = r.mensagem;
  $('im-mensagem').hidden = false;
  $('im-mensagem').focus();
}

dlgEdicao.addEventListener('cancel', (evento) => { if (ocupado || cliente.gravando()) evento.preventDefault(); });
dlgEdicao.addEventListener('close', () => {
  if (edicao !== null) devolverFoco(edicao.gatilho);
  edicao = null;
});
dlgImpacto.addEventListener('cancel', (evento) => { if (ocupado || cliente.gravando()) evento.preventDefault(); });
dlgImpacto.addEventListener('close', () => {
  if (edicao !== null && dlgEdicao.open) $('ed-salvar').focus();
});
for (const id of Object.values(CAMPOS_EDICAO)) $(id).addEventListener('input', () => limparErro(id));
$('ed-cancelar').addEventListener('click', () => { if (!ocupado && !cliente.gravando() && dlgEdicao.open) dlgEdicao.close(); });
$('im-voltar').addEventListener('click', () => { if (!ocupado && !cliente.gravando() && dlgImpacto.open) dlgImpacto.close(); });
$('im-confirmar').addEventListener('click', enviarEdicao);
$('form-edicao').addEventListener('submit', salvarEdicao);
$('botao-editar-servico').addEventListener('click', (evento) => abrirEdicaoServico(evento.currentTarget));

// ---------- Ligações ----------

for (const aviso of document.querySelectorAll('.aviso-dados')) aviso.textContent = AVISO_DADOS_PESSOAIS;
$('escolha-aviso').textContent = AVISO_USUARIOS_FICTICIOS;
$('form-entrada').addEventListener('submit', entrar);
$('botao-trocar').addEventListener('click', trocarUsuario);
$('botao-cancelar-troca').addEventListener('click', cancelarTroca);

// Menu: o link da página atual não recarrega a tela; só volta à lista de serviços.
for (const link of document.querySelectorAll('.navegacao__link--atual')) {
  link.addEventListener('click', (evento) => {
    evento.preventDefault();
    if (!$('gestao').hidden) voltarParaLista();
  });
}

$('botao-sair').addEventListener('click', sair);
$('botao-novo-servico').addEventListener('click', abrirNovoServico);
$('novo-cancelar').addEventListener('click', cancelarNovoServico);
$('form-novo').addEventListener('submit', enviarNovoServico);
$('botao-voltar').addEventListener('click', voltarParaLista);
$('painel-nova-versao').addEventListener('click', criarNovaVersao);
for (const nome of Object.keys(MANEIRAS)) $(MANEIRAS[nome]).addEventListener('click', () => alternarPainel(nome));
$('texto-cancelar').addEventListener('click', () => fecharPainel('texto'));
$('link-cancelar').addEventListener('click', () => fecharPainel('link'));
$('form-texto').addEventListener('submit', enviarTexto);
$('form-link').addEventListener('submit', enviarLink);
$('form-busca').addEventListener('submit', buscarLinks);

iniciar();
