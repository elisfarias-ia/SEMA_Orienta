// Tela "Gestão de conteúdo" (ambiente administrativo local, sem autenticação). Só liga a lógica (admin-logic.js) ao DOM.
// Regras: somente textContent e APIs seguras do DOM (nada de HTML montado como texto), sem armazenamento do navegador,
// sem cookies e sem log; o token fica dentro do cliente (memória) e nunca aparece na tela; só cadastro de assunto, serviço
// e fonte (sem edição, sem exclusão e sem as etapas posteriores do fluxo de versões).

import {
  agruparCatalogo, corpoDaFonte, corpoDoAssunto, corpoDoServico, criarClienteAdmin, MENSAGENS, resumoDaFonte, resumoDoAssunto,
  resumoDoServico, rotuloEstado, validarFormAssunto, validarFormFonte, validarFormServico,
} from './admin-logic.js';

const cliente = criarClienteAdmin({ fetchImpl: (...argumentos) => fetch(...argumentos) });
const $ = (id) => document.getElementById(id);

const CAMPOS = {
  assunto: { id: 'assunto-id', nome: 'assunto-nome', descricao: 'assunto-descricao' },
  servico: { assuntoId: 'servico-assunto', id: 'servico-id', nome: 'servico-nome', sigla: 'servico-sigla', termosEquivalentes: 'servico-termos' },
  fonte: {
    id: 'fonte-id', titulo: 'fonte-titulo', tipo: 'fonte-tipo', orgaoResponsavel: 'fonte-orgao', url: 'fonte-url', descricao: 'fonte-descricao',
    origemOficial: 'fonte-oficial', dataPublicacao: 'fonte-data', dispositivoRelevante: 'fonte-dispositivo',
  },
};
const FORMULARIOS = { assunto: 'form-assunto', servico: 'form-servico', fonte: 'form-fonte' };
const BOTOES = { assunto: 'assunto-enviar', servico: 'servico-enviar', fonte: 'fonte-enviar' };
const TITULOS_DA_CONFIRMACAO = { assunto: 'Confirmar cadastro do assunto', servico: 'Confirmar cadastro do serviço', fonte: 'Confirmar cadastro da fonte' };

let catalogo = null;
let estados = {};
let fontes = { servicoId: null, versaoId: null, estado: null, revisao: null, lista: [] };
let sequenciaDeFontes = 0;
let pendente = null; // { tipo, dados, gatilho, servicoId }
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

// ---------- Fontes do serviço ----------

const fontesPodeGravar = () => fontes.servicoId !== null && fontes.estado === 'rascunho' && fontes.revisao !== null;

function preencherServicosDasFontes() {
  const select = $('fontes-servico');
  const atual = select.value;
  select.replaceChildren();
  const servicos = catalogo ? catalogo.servicos : [];
  const primeiro = document.createElement('option');
  primeiro.value = '';
  primeiro.textContent = servicos.length ? 'Escolha o serviço' : 'Nenhum serviço cadastrado';
  select.append(primeiro);
  for (const s of servicos) {
    const opcao = document.createElement('option');
    opcao.value = s.id;
    opcao.textContent = typeof s.nome === 'string' && s.nome !== '' ? `${s.nome} (${s.id})` : s.id;
    select.append(opcao);
  }
  if (servicos.some((s) => s.id === atual)) select.value = atual;
  else if (fontes.servicoId !== null) limparFontes();
}

function limparFontes() {
  fontes = { servicoId: null, versaoId: null, estado: null, revisao: null, lista: [] };
  renderizarFontes('Escolha um serviço para ver as fontes.');
}

function renderizarFontes(mensagem) {
  const raiz = $('fontes-lista');
  raiz.replaceChildren();
  raiz.setAttribute('aria-busy', 'false');
  if (fontes.servicoId === null) {
    $('fontes-situacao').textContent = mensagem;
    atualizarPermissoes();
    return;
  }
  const bloqueio = fontes.estado === 'rascunho'
    ? 'É possível cadastrar fontes.'
    : 'O cadastro de fontes está bloqueado: só é permitido em versão em rascunho.';
  $('fontes-situacao').textContent = `Versão atual: ${fontes.versaoId}. Estado: ${rotuloEstado(fontes.estado)}. ${bloqueio}`;
  if (fontes.lista.length === 0) {
    raiz.append(criar('p', 'vazio', 'Nenhuma fonte cadastrada neste serviço.'));
  } else {
    const lista = criar('ul', 'fontes');
    for (const f of fontes.lista) {
      const item = criar('li', 'fonte');
      item.append(criar('p', 'fonte__titulo', f.titulo));
      item.append(criar('p', 'fonte__linha', `Tipo: ${f.tipo} · Órgão: ${f.orgao}`));
      item.append(criar('p', 'fonte__linha', `Validação: ${f.situacao} · ${f.publicacao}`));
      lista.append(item);
    }
    raiz.append(lista);
  }
  atualizarPermissoes();
}

/** Lê a versão atual do serviço escolhido (estado, revisão e fontes) e mostra a lista. Resultados atrasados são ignorados. */
async function carregarFontesDoServico(servicoId) {
  const sequencia = ++sequenciaDeFontes;
  if (!servicoId) {
    limparFontes();
    return { ok: true };
  }
  fontes = { servicoId: null, versaoId: null, estado: null, revisao: null, lista: [] };
  $('fontes-lista').replaceChildren();
  $('fontes-lista').setAttribute('aria-busy', 'true');
  $('fontes-situacao').textContent = 'Carregando as fontes do serviço…';
  atualizarPermissoes();
  const r = await cliente.carregarFontes(servicoId);
  if (sequencia !== sequenciaDeFontes) return r;
  if (!r.ok) {
    fontes = { servicoId: null, versaoId: null, estado: null, revisao: null, lista: [] };
    renderizarFontes(r.mensagem);
    return r;
  }
  fontes = { servicoId, versaoId: r.versaoId, estado: r.estado, revisao: r.revisao, lista: r.fontes };
  renderizarFontes('');
  return r;
}

/** Os botões de envio só ficam ativos com sessão e catálogo disponíveis e sem gravação em andamento. */
function atualizarPermissoes() {
  const pronto = cliente.sessaoPronta() && catalogo !== null && !cliente.gravando();
  for (const tipo of Object.keys(BOTOES)) $(BOTOES[tipo]).disabled = !pronto;
  // O cadastro de fonte também exige um serviço escolhido, com versão em rascunho e a revisão das fontes lida.
  if (!fontesPodeGravar()) $(BOTOES.fonte).disabled = true;
}

async function carregar() {
  const r = await cliente.carregarCatalogo();
  if (!r.ok) {
    catalogo = null;
    estados = {};
    renderizarCatalogo();
    preencherAssuntos();
    preencherServicosDasFontes();
    atualizarPermissoes();
    return r;
  }
  catalogo = r.catalogo;
  estados = r.estados;
  renderizarCatalogo();
  preencherAssuntos();
  preencherServicosDasFontes();
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
  for (const [nome, campoId] of Object.entries(CAMPOS[tipo])) {
    const campo = $(campoId);
    valores[nome] = campo.type === 'checkbox' ? campo.checked : campo.value;
  }
  return valores;
}

function validarFormulario(tipo, valores) {
  if (tipo === 'assunto') return validarFormAssunto(valores);
  if (tipo === 'servico') return validarFormServico(valores, catalogo.assuntos);
  return validarFormFonte(valores);
}

function aoEnviar(tipo, evento) {
  evento.preventDefault();
  if (!(cliente.sessaoPronta() && catalogo !== null) || cliente.gravando()) return;
  if (tipo === 'fonte' && !fontesPodeGravar()) {
    mostrarStatus('Escolha um serviço cuja versão atual esteja em rascunho antes de cadastrar uma fonte.', 'erro');
    $('fontes-servico').focus();
    return;
  }
  const valores = lerValores(tipo);
  const r = validarFormulario(tipo, valores);
  if (!r.ok) {
    mostrarErros(tipo, r.erros);
    return;
  }
  limparErros(tipo);
  mostrarStatus('', 'info');
  abrirConfirmacao(tipo, r.dados, $(BOTOES[tipo]));
}

// ---------- Confirmação ----------

function linhasDoResumo(tipo, dados) {
  if (tipo === 'assunto') return resumoDoAssunto(dados);
  if (tipo === 'servico') return resumoDoServico(dados, catalogo.assuntos);
  const servico = catalogo.servicos.find((s) => s.id === fontes.servicoId);
  return resumoDaFonte(dados, servico ? { id: servico.id, nome: servico.nome ?? servico.id } : null);
}

function abrirConfirmacao(tipo, dados, gatilho) {
  pendente = { tipo, dados, gatilho, servicoId: tipo === 'fonte' ? fontes.servicoId : null };
  destinoDoFoco = 'gatilho';
  $('confirmacao-titulo').textContent = TITULOS_DA_CONFIRMACAO[tipo];
  const resumo = $('confirmacao-resumo');
  resumo.replaceChildren();
  for (const { rotulo, valor } of linhasDoResumo(tipo, dados)) {
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

function mensagemDeSucesso(tipo, nome) {
  if (tipo === 'assunto') return `Assunto “${nome}” cadastrado. Ele já aparece no catálogo, sem conteúdo e não publicado.`;
  if (tipo === 'servico') return `Serviço “${nome}” cadastrado. Ele já aparece no catálogo, sem conteúdo e não publicado.`;
  return `Fonte “${nome}” cadastrada. Ela já aparece na lista, em rascunho e não publicada.`;
}

async function confirmar() {
  if (pendente === null || cliente.gravando()) return;
  const { tipo, dados, servicoId } = pendente;
  botaoVoltar.disabled = true;
  botaoConfirmar.disabled = true;
  dialogo.setAttribute('aria-busy', 'true');
  atualizarPermissoes();
  let corpo;
  if (tipo === 'assunto') corpo = corpoDoAssunto(dados);
  else if (tipo === 'servico') corpo = corpoDoServico(dados);
  else corpo = corpoDaFonte(dados, fontes.revisao);
  const promessa = cliente.cadastrar(tipo, corpo, { servicoId });
  atualizarPermissoes(); // a gravação começou: os envios ficam bloqueados até o fim
  const r = await promessa;
  destinoDoFoco = 'status';
  if (r.ok) {
    $(FORMULARIOS[tipo]).reset();
    limparErros(tipo);
    pendente = null;
    fecharConfirmacao();
    const atualizado = tipo === 'fonte' ? await carregarFontesDoServico(servicoId) : await carregar();
    const complemento = atualizado.ok ? '' : ' A lista não pôde ser atualizada; recarregue a página.';
    mostrarStatus(`${mensagemDeSucesso(tipo, r.item.nome)}${complemento}`, 'info', true);
    return;
  }
  pendente = null;
  fecharConfirmacao();
  // Revisão antiga ou versão que saiu do rascunho: a lista é recarregada para refletir o estado atual.
  if (r.recarregar) await carregarFontesDoServico(servicoId);
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
for (const tipo of Object.keys(FORMULARIOS)) $(FORMULARIOS[tipo]).addEventListener('submit', (e) => aoEnviar(tipo, e));
$('fontes-servico').addEventListener('change', (evento) => carregarFontesDoServico(evento.target.value));

// ---------- Início ----------

async function iniciar() {
  atualizarPermissoes();
  mostrarStatus('Preparando a sessão administrativa…');
  const sessao = await cliente.iniciarSessao();
  if (!sessao.ok) {
    renderizarCatalogo();
    preencherAssuntos();
    preencherServicosDasFontes();
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
