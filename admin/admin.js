// Tela "Gestão de conteúdo" (ambiente administrativo local, sem autenticação). Só liga a lógica (admin-logic.js) ao DOM.
// Regras: somente textContent e APIs seguras do DOM (nada de HTML montado como texto), sem armazenamento do navegador,
// sem cookies e sem log; o token fica dentro do cliente (memória) e nunca aparece na tela; só cadastro de assunto e
// serviço (sem edição, sem exclusão e sem as etapas posteriores do fluxo de versões).

import {
  agruparCatalogo, corpoDoAssunto, corpoDoServico, criarClienteAdmin, MENSAGENS, resumoDoAssunto, resumoDoServico,
  validarFormAssunto, validarFormServico,
} from './admin-logic.js';

const cliente = criarClienteAdmin({ fetchImpl: (...argumentos) => fetch(...argumentos) });
const $ = (id) => document.getElementById(id);

const CAMPOS = {
  assunto: { id: 'assunto-id', nome: 'assunto-nome', descricao: 'assunto-descricao' },
  servico: { assuntoId: 'servico-assunto', id: 'servico-id', nome: 'servico-nome', sigla: 'servico-sigla', termosEquivalentes: 'servico-termos' },
};
const FORMULARIOS = { assunto: 'form-assunto', servico: 'form-servico' };
const BOTOES = { assunto: 'assunto-enviar', servico: 'servico-enviar' };

let catalogo = null;
let estados = {};
let pendente = null; // { tipo, dados, gatilho }
let destinoDoFoco = 'gatilho';

const status = $('status');
const dialogo = $('confirmacao');
const botaoVoltar = $('confirmacao-voltar');
const botaoConfirmar = $('confirmacao-confirmar');

/** Mostra uma mensagem no painel de status (aria-live). Com `foco`, leva o foco para ela. */
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

// ---------- Catálogo ----------

function renderizarCatalogo() {
  const raiz = $('catalogo');
  raiz.replaceChildren();
  raiz.setAttribute('aria-busy', 'false');
  if (catalogo === null) {
    raiz.append(criar('p', 'vazio', 'O catálogo não está disponível.'));
    return;
  }
  const grupos = agruparCatalogo(catalogo, estados);
  if (grupos.length === 0) raiz.append(criar('p', 'vazio', 'Nenhum assunto cadastrado.'));
  for (const grupo of grupos) {
    const secao = criar('section', 'grupo');
    const titulo = criar('h3', '', grupo.assunto ? grupo.assunto.nome : 'Serviços sem assunto');
    if (grupo.assunto) {
      titulo.append(criar('span', grupo.assunto.ativo ? 'selo' : 'selo selo--inativo', grupo.assunto.ativo ? 'Ativo' : 'Inativo'));
    }
    secao.append(titulo);
    if (grupo.assunto) secao.append(criar('p', 'grupo__descricao', `${grupo.assunto.id} — ${grupo.assunto.descricao ?? ''}`));
    if (grupo.servicos.length === 0) {
      secao.append(criar('p', 'vazio', 'Nenhum serviço cadastrado neste assunto.'));
    } else {
      const lista = criar('ul', 'servicos');
      for (const s of grupo.servicos) {
        const item = criar('li', 'servico');
        item.append(criar('p', 'servico__nome', s.sigla ? `${s.nome} (${s.sigla})` : s.nome));
        const codigo = criar('code', '', s.id);
        const linhaId = criar('p', 'servico__linha', 'Identificador: ');
        linhaId.append(codigo);
        item.append(linhaId);
        item.append(criar('p', 'servico__linha', `Versão atual: ${s.versaoAtualId}`));
        item.append(criar('p', 'servico__linha', `Estado: ${s.estado}`));
        item.append(criar('p', 'servico__linha', `Publicação: ${s.publicacao}`));
        lista.append(item);
      }
      secao.append(lista);
    }
    raiz.append(secao);
  }
}

function preencherAssuntos() {
  const select = $('servico-assunto');
  const atual = select.value;
  select.replaceChildren();
  const ativos = catalogo ? catalogo.assuntos.filter((a) => a.ativo === true) : [];
  const primeiro = document.createElement('option');
  primeiro.value = '';
  primeiro.textContent = ativos.length ? 'Escolha o assunto' : 'Cadastre um assunto primeiro';
  select.append(primeiro);
  for (const a of ativos) {
    const opcao = document.createElement('option');
    opcao.value = a.id;
    opcao.textContent = a.nome;
    select.append(opcao);
  }
  if (ativos.some((a) => a.id === atual)) select.value = atual;
}

/** Os botões de envio só ficam ativos com sessão e catálogo disponíveis e sem gravação em andamento. */
function atualizarPermissoes() {
  const pronto = cliente.sessaoPronta() && catalogo !== null && !cliente.gravando();
  for (const tipo of Object.keys(BOTOES)) $(BOTOES[tipo]).disabled = !pronto;
}

async function carregar() {
  const r = await cliente.carregarCatalogo();
  if (!r.ok) {
    catalogo = null;
    estados = {};
    renderizarCatalogo();
    preencherAssuntos();
    atualizarPermissoes();
    return r;
  }
  catalogo = r.catalogo;
  estados = r.estados;
  renderizarCatalogo();
  preencherAssuntos();
  atualizarPermissoes();
  return r;
}

// ---------- Formulários ----------

function limparErros(tipo) {
  for (const campoId of Object.values(CAMPOS[tipo])) {
    const campo = $(campoId);
    const erro = $(`${campoId}-erro`);
    campo.removeAttribute('aria-invalid');
    erro.hidden = true;
    erro.textContent = '';
  }
}

function mostrarErros(tipo, erros) {
  limparErros(tipo);
  let primeiro = null;
  for (const [nome, campoId] of Object.entries(CAMPOS[tipo])) {
    if (!Object.hasOwn(erros, nome)) continue;
    const campo = $(campoId);
    const erro = $(`${campoId}-erro`);
    campo.setAttribute('aria-invalid', 'true');
    erro.textContent = erros[nome];
    erro.hidden = false;
    if (primeiro === null) primeiro = campo;
  }
  mostrarStatus('Revise os campos indicados e tente novamente.', 'erro');
  if (primeiro !== null) primeiro.focus();
}

function lerValores(tipo) {
  const valores = {};
  for (const [nome, campoId] of Object.entries(CAMPOS[tipo])) valores[nome] = $(campoId).value;
  return valores;
}

function aoEnviar(tipo, evento) {
  evento.preventDefault();
  if (!(cliente.sessaoPronta() && catalogo !== null) || cliente.gravando()) return;
  const valores = lerValores(tipo);
  const r = tipo === 'assunto' ? validarFormAssunto(valores) : validarFormServico(valores, catalogo.assuntos);
  if (!r.ok) {
    mostrarErros(tipo, r.erros);
    return;
  }
  limparErros(tipo);
  mostrarStatus('', 'info');
  abrirConfirmacao(tipo, r.dados, $(BOTOES[tipo]));
}

// ---------- Confirmação ----------

function abrirConfirmacao(tipo, dados, gatilho) {
  pendente = { tipo, dados, gatilho };
  destinoDoFoco = 'gatilho';
  $('confirmacao-titulo').textContent = tipo === 'assunto' ? 'Confirmar cadastro do assunto' : 'Confirmar cadastro do serviço';
  const resumo = $('confirmacao-resumo');
  resumo.replaceChildren();
  const linhas = tipo === 'assunto' ? resumoDoAssunto(dados) : resumoDoServico(dados, catalogo.assuntos);
  for (const { rotulo, valor } of linhas) {
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

// Fecha a confirmação e devolve o foco na hora (sem depender do evento "close", que pode chegar atrasado).
function fecharConfirmacao() {
  if (typeof dialogo.close === 'function') dialogo.close();
  else dialogo.removeAttribute('open');
  aplicarFoco();
  if (destinoDoFoco !== 'status') pendente = null;
  atualizarPermissoes();
}

function aplicarFoco() {
  if (destinoDoFoco === 'status') status.focus();
  else if (pendente !== null) pendente.gatilho.focus();
}

async function confirmar() {
  if (pendente === null || cliente.gravando()) return;
  const { tipo, dados } = pendente;
  botaoVoltar.disabled = true;
  botaoConfirmar.disabled = true;
  dialogo.setAttribute('aria-busy', 'true');
  atualizarPermissoes();
  const corpo = tipo === 'assunto' ? corpoDoAssunto(dados) : corpoDoServico(dados);
  const promessa = cliente.cadastrar(tipo, corpo);
  atualizarPermissoes(); // a gravação começou: os envios ficam bloqueados até o fim
  const r = await promessa;
  destinoDoFoco = 'status';
  if (r.ok) {
    $(FORMULARIOS[tipo]).reset();
    limparErros(tipo);
    pendente = null;
    fecharConfirmacao();
    const atualizado = await carregar();
    const rotulo = tipo === 'assunto' ? 'Assunto' : 'Serviço';
    const complemento = atualizado.ok ? '' : ' O catálogo não pôde ser atualizado; recarregue a página.';
    mostrarStatus(`${rotulo} “${r.item.nome}” cadastrado. Ele já aparece no catálogo, sem conteúdo e não publicado.${complemento}`, 'info', true);
    return;
  }
  pendente = null;
  fecharConfirmacao();
  atualizarPermissoes();
  mostrarStatus(r.mensagem, 'erro', true);
}

// Fechamento pelo teclado (Esc): o foco volta ao botão que abriu a confirmação.
dialogo.addEventListener('close', () => {
  if (pendente !== null && destinoDoFoco !== 'status') {
    aplicarFoco();
    pendente = null;
  }
  atualizarPermissoes();
});
// Com uma gravação em andamento, Esc não fecha a confirmação (o resultado ainda precisa ser mostrado).
dialogo.addEventListener('cancel', (evento) => {
  if (cliente.gravando()) evento.preventDefault();
});
botaoVoltar.addEventListener('click', fecharConfirmacao);
botaoConfirmar.addEventListener('click', confirmar);
$(FORMULARIOS.assunto).addEventListener('submit', (e) => aoEnviar('assunto', e));
$(FORMULARIOS.servico).addEventListener('submit', (e) => aoEnviar('servico', e));

// ---------- Início ----------

async function iniciar() {
  atualizarPermissoes();
  mostrarStatus('Preparando a sessão administrativa…');
  const sessao = await cliente.iniciarSessao();
  if (!sessao.ok) {
    renderizarCatalogo();
    preencherAssuntos();
    mostrarStatus(sessao.mensagem ?? MENSAGENS.sessao, 'erro');
    return;
  }
  const r = await carregar();
  if (!r.ok) {
    mostrarStatus(r.mensagem, 'erro');
    return;
  }
  mostrarStatus('Sessão iniciada. O catálogo foi carregado.');
}

iniciar();
