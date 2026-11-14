// Página "Informações do chatbot" (ambiente administrativo local, sem autenticação). Só liga a lógica (admin-logic.js) ao DOM.
// Regras: somente textContent e APIs seguras do DOM, sem armazenamento do navegador, sem cookies e sem log; o token fica
// dentro do cliente (memória); ids, origem, ambiente, estados internos e datas ISO nunca aparecem; nada é gravado ao abrir a página:
// toda gravação exige formulário válido e confirmação explícita, e só uma gravação acontece por vez.

import {
  corpoDoConhecimento, criarClienteAdmin, MENSAGENS, resumoDoConhecimento, rotuloEstado, validarFormConhecimento,
} from '../admin-logic.js';

const cliente = criarClienteAdmin({ fetchImpl: (...argumentos) => fetch(...argumentos) });
const $ = (id) => document.getElementById(id);

let catalogo = null;
let contexto = null; // { servicoId, nomeServico, numero, estado, editavel, fontes, blocos }
let editando = null; // id do bloco em edição (só em memória, nunca exibido)
let pendente = null; // { operacao, servicoId, blocoId, corpo, dados, gatilho }
let destinoDoFoco = 'gatilho';
let sequencia = 0;

const status = $('status');
const dialogo = $('confirmacao');
const botaoVoltar = $('confirmacao-voltar');
const botaoConfirmar = $('confirmacao-confirmar');

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

const servicoDoCatalogo = (id) => (catalogo ? catalogo.servicos.find((s) => s.id === id) : undefined);

// ---------- Seleção de assunto e serviço ----------

function preencherAssuntos() {
  const select = $('assunto');
  select.replaceChildren();
  const assuntos = catalogo ? catalogo.assuntos : [];
  const primeiro = document.createElement('option');
  primeiro.value = '';
  primeiro.textContent = assuntos.length ? 'Escolha o assunto' : 'Nenhum assunto cadastrado';
  select.append(primeiro);
  for (const a of assuntos) {
    const opcao = document.createElement('option');
    opcao.value = a.id;
    opcao.textContent = a.nome;
    select.append(opcao);
  }
  select.disabled = assuntos.length === 0;
  preencherServicos();
}

function preencherServicos() {
  const select = $('servico');
  select.replaceChildren();
  const assuntoId = $('assunto').value;
  const servicos = catalogo && assuntoId ? catalogo.servicos.filter((s) => s.assuntoId === assuntoId) : [];
  const primeiro = document.createElement('option');
  primeiro.value = '';
  primeiro.textContent = !assuntoId ? 'Escolha primeiro o assunto' : servicos.length ? 'Escolha o serviço' : 'Nenhum serviço neste assunto';
  select.append(primeiro);
  for (const s of servicos) {
    const opcao = document.createElement('option');
    opcao.value = s.id;
    opcao.textContent = typeof s.nome === 'string' && s.nome !== '' ? s.nome : 'Serviço sem nome';
    select.append(opcao);
  }
  select.disabled = servicos.length === 0;
}

// ---------- Situação, lista e formulário ----------

function limparContexto(mensagem = 'Escolha um serviço para ver as informações.') {
  contexto = null;
  editando = null;
  $('servico-situacao').hidden = true;
  $('blocos').replaceChildren(criar('p', 'vazio', mensagem));
  $('blocos').setAttribute('aria-busy', 'false');
  renderizarFontes();
  limparFormulario();
  atualizarPermissoes();
}

function renderizarSituacao() {
  const raiz = $('servico-situacao');
  if (contexto === null) {
    raiz.hidden = true;
    return;
  }
  raiz.hidden = false;
  $('situacao-nome').textContent = contexto.nomeServico;
  $('situacao-versao').textContent = `Versão ${contexto.numero}`;
  $('situacao-estado').textContent = contexto.estado === 'rascunho' ? 'Em elaboração (rascunho)' : rotuloEstado(contexto.estado);
  const s = servicoDoCatalogo($('servico').value);
  $('situacao-publicacao').textContent = s && s.versaoPublicadaId ? 'Existe versão publicada; a versão atual não está publicada' : 'Não publicada';
  $('situacao-edicao').textContent = contexto.editavel
    ? 'Este serviço está em elaboração (rascunho): você pode cadastrar, editar e excluir informações.'
    : 'Este serviço não está mais em elaboração: cadastro, edição e exclusão estão bloqueados.';
}

function renderizarBlocos() {
  const raiz = $('blocos');
  raiz.replaceChildren();
  raiz.setAttribute('aria-busy', 'false');
  if (contexto === null) {
    raiz.append(criar('p', 'vazio', 'Escolha um serviço para ver as informações.'));
    return;
  }
  if (contexto.blocos.length === 0) {
    raiz.append(criar('p', 'vazio', 'Nenhuma orientação foi cadastrada para este serviço.'));
    return;
  }
  const lista = criar('ul', 'blocos');
  for (const b of contexto.blocos) {
    const item = criar('li', 'bloco');
    item.append(criar('p', 'bloco__titulo', b.titulo));
    item.append(criar('p', 'bloco__texto', b.texto));
    const fontes = criar('ul', 'bloco__fontes');
    for (const r of b.referencias) fontes.append(criar('li', '', `${r.fonteTitulo} — ${r.localizacao}`));
    item.append(criar('p', 'bloco__rotulo', 'Fontes que comprovam a informação'));
    item.append(fontes);
    if (b.alertas.length > 0) {
      item.append(criar('p', 'bloco__rotulo', 'Avisos ou limitações'));
      const alertas = criar('ul', 'bloco__alertas');
      for (const a of b.alertas) alertas.append(criar('li', '', a));
      item.append(alertas);
    }
    const situacao = criar('p', 'bloco__linha');
    situacao.append('Situação: ', criar('span', 'selo', b.situacao));
    item.append(situacao);
    item.append(criar('p', 'bloco__linha bloco__disponibilidade', b.publicacao));
    item.append(criar('p', 'bloco__linha', `Criado em ${b.criadoEm} · Atualizado em ${b.atualizadoEm}`));
    const acoes = criar('div', 'bloco__acoes');
    const editar = criar('button', 'botao botao--secundario', 'Editar');
    editar.type = 'button';
    editar.dataset.acao = 'editar';
    editar.setAttribute('aria-label', `Editar a informação ${b.titulo}`);
    const excluir = criar('button', 'botao botao--secundario', 'Excluir');
    excluir.type = 'button';
    excluir.dataset.acao = 'excluir';
    excluir.setAttribute('aria-label', `Excluir a informação ${b.titulo}`);
    editar.addEventListener('click', () => iniciarEdicao(b));
    excluir.addEventListener('click', () => pedirExclusao(b, excluir));
    acoes.append(editar, excluir);
    item.append(acoes);
    lista.append(item);
    item.__bloco = b;
  }
  raiz.append(lista);
  atualizarPermissoes();
}

function renderizarFontes(selecionadas = []) {
  const raiz = $('bloco-fontes');
  raiz.replaceChildren();
  if (contexto === null || contexto.fontes.length === 0) {
    raiz.append(criar('p', 'vazio', contexto === null ? 'Escolha um serviço para ver as fontes.' : 'Esta versão não tem fontes cadastradas. Cadastre uma fonte em Assuntos, serviços e fontes antes de cadastrar informações.'));
    return;
  }
  const mapa = new Map(selecionadas.map((s) => [s.fonteId, s.localizacao]));
  contexto.fontes.forEach((f, i) => {
    const linha = criar('div', 'fonte-opcao');
    const caixa = criar('div', 'caixa');
    const marca = document.createElement('input');
    marca.type = 'checkbox';
    marca.id = `fonte-marca-${i}`;
    marca.dataset.indice = String(i);
    marca.disabled = f.revogada;
    marca.checked = mapa.has(f.id) && !f.revogada;
    const rotulo = criar('label', '', `${f.titulo} (${f.tipo})${f.revogada ? ' — revogada, indisponível' : ''}`);
    rotulo.htmlFor = marca.id;
    caixa.append(marca, rotulo);
    const campo = criar('div', 'fonte-opcao__local');
    const rotuloLocal = criar('label', '', `Onde esta informação aparece na fonte? (${f.titulo})`);
    rotuloLocal.htmlFor = `fonte-local-${i}`;
    const local = document.createElement('input');
    local.type = 'text';
    local.id = `fonte-local-${i}`;
    local.maxLength = 200;
    local.autocomplete = 'off';
    local.placeholder = 'Ex.: página 3, item 2.1 ou seção Como solicitar.';
    local.value = mapa.get(f.id) ?? '';
    local.disabled = !marca.checked;
    local.setAttribute('aria-describedby', `fonte-local-${i}-ajuda fonte-local-${i}-erro`);
    const ajudaLocal = criar('p', 'ajuda', 'Exemplo: página 3, item 2.1 ou seção Como solicitar.');
    ajudaLocal.id = `fonte-local-${i}-ajuda`;
    const erro = criar('p', 'erro');
    erro.id = `fonte-local-${i}-erro`;
    erro.hidden = true;
    marca.addEventListener('change', () => {
      local.disabled = !marca.checked;
      if (marca.checked) local.focus();
    });
    campo.append(rotuloLocal, local, ajudaLocal, erro);
    linha.append(caixa, campo);
    raiz.append(linha);
  });
}

function lerFormulario() {
  const selecionadas = [];
  if (contexto !== null) {
    contexto.fontes.forEach((f, i) => {
      if ($(`fonte-marca-${i}`)?.checked) selecionadas.push({ fonteId: f.id, localizacao: $(`fonte-local-${i}`).value });
    });
  }
  return { titulo: $('bloco-titulo').value, texto: $('bloco-texto').value, alertas: $('bloco-alertas').value, selecionadas };
}

function limparErros() {
  for (const id of ['bloco-titulo', 'bloco-texto', 'bloco-alertas']) {
    $(id).removeAttribute('aria-invalid');
    $(`${id}-erro`).hidden = true;
    $(`${id}-erro`).textContent = '';
  }
  $('bloco-fontes-erro').hidden = true;
  $('bloco-fontes-erro').textContent = '';
  if (contexto !== null) {
    contexto.fontes.forEach((_, i) => {
      $(`fonte-local-${i}`)?.removeAttribute('aria-invalid');
      const e = $(`fonte-local-${i}-erro`);
      if (e) { e.hidden = true; e.textContent = ''; }
    });
  }
}

function mostrarErros(erros) {
  limparErros();
  let primeiro = null;
  const marcar = (campo, erro, mensagem) => {
    campo.setAttribute('aria-invalid', 'true');
    erro.textContent = mensagem;
    erro.hidden = false;
    if (primeiro === null) primeiro = campo;
  };
  if (erros.titulo) marcar($('bloco-titulo'), $('bloco-titulo-erro'), erros.titulo);
  if (erros.texto) marcar($('bloco-texto'), $('bloco-texto-erro'), erros.texto);
  if (erros.fontes) {
    $('bloco-fontes-erro').textContent = erros.fontes;
    $('bloco-fontes-erro').hidden = false;
    if (primeiro === null) primeiro = contexto && contexto.fontes.length ? $('fonte-marca-0') : null;
  }
  if (erros.localizacoes && contexto !== null) {
    contexto.fontes.forEach((f, i) => {
      if (Object.hasOwn(erros.localizacoes, f.id)) marcar($(`fonte-local-${i}`), $(`fonte-local-${i}-erro`), erros.localizacoes[f.id]);
    });
  }
  if (erros.alertas) marcar($('bloco-alertas'), $('bloco-alertas-erro'), erros.alertas);
  mostrarStatus('Revise os campos indicados e tente novamente.', 'erro');
  if (primeiro !== null) primeiro.focus();
}

function limparFormulario() {
  $('form-bloco').reset();
  editando = null;
  $('titulo-form').textContent = 'Nova informação';
  $('bloco-enviar').textContent = 'Conferir antes de salvar';
  limparErros();
  renderizarFontes();
}

function iniciarEdicao(bloco) {
  if (!podeEditar() || !bloco.editavel) return;
  limparErros();
  editando = bloco.id;
  $('titulo-form').textContent = 'Editar informação';
  $('bloco-enviar').textContent = 'Conferir antes de salvar';
  $('bloco-titulo').value = bloco.titulo;
  $('bloco-texto').value = bloco.texto;
  $('bloco-alertas').value = bloco.alertas.join('\n');
  renderizarFontes(bloco.referencias.map((r) => ({ fonteId: r.fonteId, localizacao: r.localizacao })));
  mostrarStatus('');
  $('titulo-form').focus();
}

function cancelar() {
  if (cliente.gravando()) return;
  limparFormulario();
  mostrarStatus('');
  atualizarPermissoes();
}

// ---------- Permissões ----------

const podeEditar = () => cliente.sessaoPronta() && contexto !== null && contexto.editavel && !cliente.gravando();

function atualizarPermissoes() {
  const livre = podeEditar();
  $('bloco-enviar').disabled = !livre || contexto.fontes.length === 0;
  $('bloco-cancelar').disabled = cliente.gravando();
  for (const botao of document.querySelectorAll('#blocos button[data-acao]')) {
    const item = botao.closest('li');
    botao.disabled = !livre || !(item && item.__bloco && item.__bloco.editavel);
  }
}

// ---------- Confirmação ----------

function abrirConfirmacao(configuracao) {
  pendente = { ...configuracao };
  destinoDoFoco = 'gatilho';
  $('confirmacao-titulo').textContent = configuracao.titulo;
  botaoConfirmar.textContent = configuracao.rotuloConfirmar;
  const resumo = $('confirmacao-resumo');
  resumo.replaceChildren();
  for (const { rotulo, valor } of configuracao.linhas) {
    resumo.append(criar('dt', '', rotulo));
    resumo.append(criar('dd', '', valor));
  }
  botaoVoltar.disabled = false;
  botaoConfirmar.disabled = false;
  dialogo.removeAttribute('aria-busy');
  if (typeof dialogo.showModal === 'function') dialogo.showModal();
  else dialogo.setAttribute('open', '');
  botaoVoltar.focus();
}

function aplicarFoco() {
  if (destinoDoFoco === 'status') status.focus();
  else if (pendente !== null && pendente.gatilho) pendente.gatilho.focus();
}

function fecharConfirmacao() {
  if (typeof dialogo.close === 'function') dialogo.close();
  else dialogo.removeAttribute('open');
  aplicarFoco();
  if (destinoDoFoco !== 'status') pendente = null;
  atualizarPermissoes();
}

function aoEnviar(evento) {
  evento.preventDefault();
  if (!podeEditar() || contexto.fontes.length === 0) return;
  const r = validarFormConhecimento(lerFormulario(), contexto.fontes);
  if (!r.ok) {
    mostrarErros(r.erros);
    return;
  }
  limparErros();
  mostrarStatus('');
  const criando = editando === null;
  abrirConfirmacao({
    operacao: criando ? 'criar' : 'alterar', servicoId: contexto.servicoId, blocoId: editando, dados: r.dados, corpo: corpoDoConhecimento(r.dados), gatilho: $('bloco-enviar'),
    titulo: criando ? 'Confirmar cadastro da informação' : 'Confirmar alteração da informação', rotuloConfirmar: 'Salvar informação',
    linhas: resumoDoConhecimento(r.dados, contexto.fontes, contexto.nomeServico),
  });
}

function pedirExclusao(bloco, gatilho) {
  if (!podeEditar() || !bloco.editavel) return;
  abrirConfirmacao({
    operacao: 'excluir', servicoId: contexto.servicoId, blocoId: bloco.id, dados: null, corpo: undefined, gatilho,
    titulo: 'Confirmar exclusão da informação', rotuloConfirmar: 'Excluir informação',
    linhas: [
      { rotulo: 'Serviço', valor: contexto.nomeServico },
      { rotulo: 'Tema da informação', valor: bloco.titulo },
      { rotulo: 'Fontes que comprovam', valor: bloco.referencias.map((r) => `${r.fonteTitulo} — ${r.localizacao}`).join('; ') },
      { rotulo: 'Atenção', valor: 'A informação é removida da lista. Esta ação não pode ser desfeita por esta tela.' },
    ],
  });
}

const MENSAGEM_SUCESSO = { criar: 'Informação salva. Ela está em elaboração (rascunho) e ainda não está disponível no chatbot.', alterar: 'Informação alterada. Ela continua em elaboração (rascunho) e ainda não está disponível no chatbot.', excluir: 'Informação excluída.' };

async function confirmar() {
  if (pendente === null || cliente.gravando()) return;
  const { operacao, servicoId, blocoId, corpo } = pendente;
  botaoVoltar.disabled = true;
  botaoConfirmar.disabled = true;
  dialogo.setAttribute('aria-busy', 'true');
  const promessa = cliente.gravarConhecimento(operacao, servicoId, blocoId, corpo);
  atualizarPermissoes(); // a gravação começou: ações bloqueadas até o fim
  const r = await promessa;
  destinoDoFoco = 'status';
  pendente = null;
  if (r.ok) {
    limparFormulario();
    fecharConfirmacao();
    const atualizado = await carregarServico(servicoId);
    mostrarStatus(`${MENSAGEM_SUCESSO[operacao]}${atualizado.ok ? '' : ' A lista não pôde ser atualizada; recarregue a página.'}`, 'info', true);
    return;
  }
  fecharConfirmacao();
  if (r.recarregar) await carregarServico(servicoId);
  atualizarPermissoes();
  mostrarStatus(r.mensagem, 'erro', true);
}

dialogo.addEventListener('close', () => {
  if (pendente !== null && destinoDoFoco !== 'status') {
    aplicarFoco();
    pendente = null;
  }
  atualizarPermissoes();
});
dialogo.addEventListener('cancel', (evento) => {
  if (cliente.gravando()) evento.preventDefault();
});
botaoVoltar.addEventListener('click', fecharConfirmacao);
botaoConfirmar.addEventListener('click', confirmar);
$('form-bloco').addEventListener('submit', aoEnviar);
$('bloco-cancelar').addEventListener('click', cancelar);

// ---------- Carregamento ----------

/** Lê a versão atual do serviço e redesenha situação, lista e fontes. Resultados atrasados (outra escolha feita) são ignorados. */
async function carregarServico(servicoId) {
  const minha = ++sequencia;
  if (!servicoId) {
    limparContexto();
    return { ok: true };
  }
  $('blocos').setAttribute('aria-busy', 'true');
  const r = await cliente.carregarConhecimento(servicoId);
  if (minha !== sequencia) return r;
  if (!r.ok) {
    limparContexto('Não foi possível mostrar as informações deste serviço.');
    mostrarStatus(r.mensagem, 'erro');
    return r;
  }
  const mantidaEdicao = editando !== null && r.blocos.some((b) => b.id === editando && b.editavel);
  contexto = { servicoId, nomeServico: r.nomeServico, numero: r.numero, estado: r.estado, editavel: r.editavel, fontes: r.fontes, blocos: r.blocos };
  if (!mantidaEdicao) limparFormulario();
  else renderizarFontes(lerFormularioAtualParaManter());
  renderizarSituacao();
  renderizarBlocos();
  atualizarPermissoes();
  return r;
}

// Ao recarregar durante uma edição válida, mantém o que já foi digitado nas fontes.
function lerFormularioAtualParaManter() {
  return contexto === null ? [] : lerFormulario().selecionadas;
}

async function carregarCatalogo() {
  const r = await cliente.carregarCatalogo();
  if (!r.ok) {
    catalogo = null;
    preencherAssuntos();
    return r;
  }
  catalogo = r.catalogo;
  preencherAssuntos();
  return r;
}

$('assunto').addEventListener('change', () => {
  preencherServicos();
  carregarServico('');
});
$('servico').addEventListener('change', (evento) => carregarServico(evento.target.value));

async function iniciar() {
  atualizarPermissoes();
  mostrarStatus('Preparando a sessão administrativa…');
  const sessao = await cliente.iniciarSessao();
  if (!sessao.ok) {
    preencherAssuntos();
    mostrarStatus(sessao.mensagem ?? MENSAGENS.sessao, 'erro');
    return;
  }
  const r = await carregarCatalogo();
  if (!r.ok) {
    mostrarStatus(r.mensagem, 'erro');
    return;
  }
  mostrarStatus('Sessão iniciada. Escolha o assunto e o serviço.');
  atualizarPermissoes();
}

iniciar();
