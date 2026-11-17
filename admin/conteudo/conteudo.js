// Página "Gestão de conteúdo > Conteúdo para respostas" (ambiente administrativo local, sem autenticação). Só liga a lógica
// (admin-logic.js) ao DOM. Regras: somente textContent e APIs seguras do DOM, sem armazenamento do navegador, sem cookies e sem log;
// o token fica dentro do cliente (memória); ids, hashes, origem, ambiente, estados internos e datas ISO nunca aparecem; nada é
// gravado ao abrir a página: toda gravação exige ação explícita (e confirmação quando é irreversível), uma por vez.
// A publicação não existe nesta tela.

import {
  corpoDoConhecimento, criarClienteAdmin, explicarFontesPendentes, frasesConteudoAntigo, fraseBlocosReabertos, pendenciasDaUrl, PASSOS_PARA_RESOLVER, validarEdicaoDeFonte, frasePendenciasParaConcluir, MENSAGENS, resumoDoConhecimento,
  rotuloEstado, servicoDaUrl, validarFormConhecimento,
} from '../admin-logic.js';

const cliente = criarClienteAdmin({ fetchImpl: (...argumentos) => fetch(...argumentos) });
const $ = (id) => document.getElementById(id);

let catalogo = null;
let contexto = null; // { servicoId, nomeServico, numero, estado, editavel, fontes, blocos }
let revisao = null; // resumo da revisão (admin-logic.js) ou null quando não pôde ser lida
let editando = null; // id do bloco em edição (só em memória, nunca exibido)
let pendente = null; // { operacao, servicoId, blocoId, corpo, dados, gatilho }
let destinoDoFoco = 'gatilho';
let sequencia = 0;
let ocupado = false; // uma ação de revisão por vez, até a tela terminar de atualizar
let formAberto = false; // o formulário de nova orientação fica recolhido até a pessoa pedir

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

function criarBotao(texto, rotuloAcessivel, acao, aoClicar, { secundario = true, indisponivel = false } = {}) {
  const botao = criar('button', secundario ? 'botao botao--secundario' : 'botao', texto);
  botao.type = 'button';
  botao.dataset.acao = acao;
  botao.dataset.indisponivel = indisponivel ? 'true' : 'false';
  if (rotuloAcessivel) botao.setAttribute('aria-label', rotuloAcessivel);
  botao.addEventListener('click', () => aoClicar(botao));
  return botao;
}

function selo(texto, pendenteOuNao) {
  return criar('span', pendenteOuNao ? 'selo selo--pendente' : 'selo', texto);
}

const servicoDoCatalogo = (id) => (catalogo ? catalogo.servicos.find((s) => s.id === id) : undefined);
const congelada = () => (revisao !== null ? revisao.congelada : contexto !== null && !contexto.editavel);

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

// ---------- Situação, fontes, lista, conclusão e formulário ----------

function limparContexto(mensagem = 'Escolha um serviço para ver as informações.') {
  contexto = null;
  revisao = null;
  editando = null;
  $('servico-situacao').hidden = true;
  $('blocos').replaceChildren(criar('p', 'vazio', mensagem));
  $('blocos').setAttribute('aria-busy', 'false');
  renderizarFontesRevisao();
  renderizarConclusao();
  renderizarFontes();
  limparFormulario();
  formAberto = false;
  atualizarFormulario();
  atualizarVoltar();
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
  $('situacao-estado').textContent = revisao !== null ? revisao.rotulo : rotuloEstado(contexto.estado);
  const pendenteSelo = $('situacao-selo');
  pendenteSelo.hidden = !(revisao !== null && revisao.revisaoPendente);
  pendenteSelo.textContent = 'Revisão pendente';
  $('botao-resolver').hidden = !(revisao !== null && !revisao.congelada && revisao.pendencias.length > 0);
  $('situacao-resumo').textContent = revisao === null
    ? 'A situação da revisão não está disponível agora.'
    : frasePendenciasParaConcluir(revisao.resumo);
  const s = servicoDoCatalogo($('servico').value);
  $('situacao-publicacao').textContent = s && s.versaoPublicadaId ? 'Existe versão publicada; a versão atual não está publicada' : 'Não publicada';
  $('situacao-edicao').textContent = contexto.editavel
    ? 'Esta versão está em elaboração: você pode cadastrar, editar, aceitar ou excluir informações.'
    : 'Esta versão está bloqueada: cadastro, edição, aceite e exclusão estão bloqueados. Para alterar, crie uma nova versão.';
  atualizarFormulario();
}

/** O formulário de nova orientação só aparece se pedido (botão ou edição) e enquanto a versão pode ser editada. */
function atualizarFormulario() {
  const permitido = contexto !== null && contexto.editavel;
  $('cartao-form').hidden = !(permitido && formAberto);
  $('botao-nova-orientacao').hidden = !permitido;
  $('botao-nova-orientacao').setAttribute('aria-expanded', permitido && formAberto ? 'true' : 'false');
}

function abrirFormulario() {
  if (!podeEditar()) return;
  formAberto = true;
  atualizarFormulario();
  atualizarPermissoes();
  $('titulo-form').scrollIntoView({ block: 'nearest' });
  $('titulo-form').focus();
}

/** Link de volta e navegação reabrem o MESMO serviço em /admin/ (o id vai só na URL, nunca na tela). */
function atualizarVoltar() {
  const destino = contexto === null ? '../' : `../?servico=${encodeURIComponent(contexto.servicoId)}`;
  $('voltar-gestao').setAttribute('href', destino);
  document.querySelector('nav .navegacao__link').setAttribute('href', destino);
}

function focarItem(elemento) {
  if (elemento === null || elemento === undefined) return false;
  elemento.scrollIntoView({ block: 'nearest' });
  elemento.focus();
  return true;
}
const itemDoBloco = (id) => [...document.querySelectorAll('#blocos li.bloco')].find((li) => li.__bloco && li.__bloco.id === id) ?? null;
const itemDaFonte = (id) => [...document.querySelectorAll('#fontes-revisao li.bloco')].find((li) => li.__fonteId === id) ?? null;

function renderizarFontesRevisao() {
  const raiz = $('fontes-revisao');
  raiz.replaceChildren();
  raiz.setAttribute('aria-busy', 'false');
  if (contexto === null) {
    raiz.append(criar('p', 'vazio', 'Escolha um serviço para ver os documentos e links.'));
    return;
  }
  if (revisao === null) {
    raiz.append(criar('p', 'vazio', 'A revisão dos documentos e links não está disponível agora.'));
    return;
  }
  const ativas = revisao.fontes; // fontes excluídas nunca chegam aqui; a revogada aparece com o rótulo próprio
  if (ativas.length === 0) {
    raiz.append(criar('p', 'vazio', 'Este serviço ainda não tem documentos ou links ativos. Adicione um texto ou link na página do serviço.'));
    return;
  }
  const lista = criar('ul', 'blocos');
  ativas.forEach((f, indice) => {
    const item = criar('li', 'bloco');
    item.tabIndex = -1;
    item.__fonteId = f.id;
    item.append(criar('p', 'bloco__titulo', f.titulo));
    const tipo = criar('p', 'bloco__linha');
    tipo.append('Tipo: ', criar('span', 'selo selo--neutro', f.rotuloForma));
    item.append(tipo);
    const situacao = criar('p', 'bloco__linha');
    situacao.append('Situação: ', selo(f.situacao, !f.revisada || f.revogada));
    item.append(situacao);
    if (f.podeRevisar && !revisao.congelada) {
      const acoes = criar('div', 'bloco__acoes');
      acoes.append(criarBotao('Marcar como revisado', `Marcar como revisado: ${f.titulo}`, 'revisar-fonte', () => executarRevisao('fonte', { fonteId: f.id }, 'Documento ou link marcado como revisado.', undefined, { fonte: f.id })));
      item.append(acoes);
    }
    if (!revisao.congelada) {
      const acoesFonte = criar('div', 'bloco__acoes');
      if (f.podeEditar) acoesFonte.append(criarBotao('Editar', `Editar fonte: ${f.titulo}`, 'editar-fonte', (gatilho) => abrirEdicaoFonte(f, gatilho)));
      if (f.podeExcluir) acoesFonte.append(criarBotao('Excluir', `Excluir fonte: ${f.titulo}`, 'excluir-fonte', (gatilho) => abrirExclusaoFonte(f, gatilho, indice)));
      if (acoesFonte.childElementCount > 0) item.append(acoesFonte);
    }
    lista.append(item);
  });
  raiz.append(lista);
}


function descreverFonte(r) {
  return `${r.fonteTitulo} — ${r.localizacao}`;
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
  const bloqueada = congelada();
  const lista = criar('ul', 'blocos');
  contexto.blocos.forEach((b, i) => {
    const rb = revisao !== null ? revisao.blocos.find((x) => x.id === b.id) : undefined;
    const aceito = rb !== undefined && rb.aceito;
    const item = criar('li', 'bloco');
    item.tabIndex = -1;
    item.append(criar('p', 'bloco__titulo', b.titulo));
    item.append(criar('p', 'bloco__texto', b.texto));
    const fontes = criar('ul', 'bloco__fontes');
    for (const r of b.referencias) fontes.append(criar('li', '', descreverFonte(r)));
    item.append(criar('p', 'bloco__rotulo', 'Documentos ou links usados'));
    item.append(fontes);
    if (b.alertas.length > 0) {
      item.append(criar('p', 'bloco__rotulo', 'Avisos ou limitações'));
      const alertas = criar('ul', 'bloco__alertas');
      for (const a of b.alertas) alertas.append(criar('li', '', a));
      item.append(alertas);
    }
    const situacao = criar('p', 'bloco__linha');
    situacao.append('Situação: ', selo(rb !== undefined ? rb.situacao : b.situacao, !aceito));
    item.append(situacao);
    item.append(criar('p', 'bloco__linha bloco__disponibilidade', b.publicacao));
    item.append(criar('p', 'bloco__linha', `Criado em ${b.criadoEm} · Atualizado em ${b.atualizadoEm}`));
    if (!bloqueada) {
      const acoes = criar('div', 'bloco__acoes');
      if (b.editavel && !aceito) acoes.append(criarBotao('Editar', `Editar a informação ${b.titulo}`, 'editar', () => iniciarEdicao(b)));
      if (rb !== undefined && !aceito) {
        const ajudaId = `bloco-ajuda-${i}`;
        const faltam = explicarFontesPendentes(rb, revisao.fontes);
        const aceitar = criarBotao('Aceitar informação', `Aceitar informação: ${b.titulo}`, 'aceitar', () => executarRevisao('bloco-aceitar', { blocoId: b.id }, 'Informação aceita.', undefined, { bloco: b.id }), { indisponivel: !rb.podeAceitar });
        acoes.append(aceitar);
        if (!rb.podeAceitar) {
          const ajuda = criar('p', 'bloco__ajuda', faltam !== '' ? faltam : 'Esta informação ainda não pode ser aceita. Confira se ela tem documento ou link usável.');
          ajuda.id = ajudaId;
          aceitar.setAttribute('aria-describedby', ajudaId);
          item.append(ajuda);
        }
        if (rb.podeRejeitar) acoes.append(criarBotao('Excluir informação', `Excluir informação: ${b.titulo}`, 'descartar', (gatilho) => pedirDescarte(b, gatilho)));
      }
      if (rb !== undefined && rb.podeReabrir) {
        acoes.append(criarBotao('Reabrir para correção', `Reabrir para correção: ${b.titulo}`, 'reabrir', () => executarRevisao('bloco-reabrir', { blocoId: b.id }, 'Informação reaberta para correção. Ela voltou para elaboração.', undefined, { bloco: b.id })));
      }
      if (acoes.childElementCount > 0) item.append(acoes);
    }
    lista.append(item);
    item.__bloco = b;
  });
  raiz.append(lista);
}

function renderizarConclusao() {
  const cartao = $('cartao-conclusao');
  const lista = $('pendencias');
  lista.replaceChildren();
  cartao.hidden = contexto === null || revisao === null;
  if (cartao.hidden) return;
  const bloqueada = revisao.congelada;
  $('conclusao-pendencias-bloco').hidden = bloqueada;
  $('conclusao-pronta').hidden = !bloqueada;
  $('botao-concluir').hidden = bloqueada || !revisao.podeConcluir;
  $('botao-nova-versao').hidden = !bloqueada;
  $('conclusao-explicacao').hidden = bloqueada;
  $('nova-versao-explicacao').hidden = !bloqueada;
  if (bloqueada) {
    $('conclusao-pronta').textContent = `Situação: ${revisao.rotulo}. Esta versão está bloqueada para edição.`;
    return;
  }
  if (revisao.pendencias.length === 0) {
    $('pendencias-resumo').textContent = 'Nenhuma pendência. Você já pode concluir a revisão.';
  } else {
    $('pendencias-resumo').textContent = revisao.pendencias.length === 1 ? 'Falta resolver 1 pendência para concluir a revisão:' : `Faltam resolver ${revisao.pendencias.length} pendências para concluir a revisão:`;
    for (const p of revisao.pendenciasDetalhe) {
      const li = criar('li', 'pendencia', p.frase);
      li.tabIndex = -1;
      const acao = acaoDaPendencia(p);
      if (acao !== null) li.append(' ', criarBotao(acao.texto, acao.rotulo, 'ir-pendencia', () => irParaPendencia(p)));
      lista.append(li);
    }
  }
  const passos = $('passos-pendencias');
  passos.replaceChildren();
  passos.hidden = revisao.pendencias.length === 0;
  for (const passo of PASSOS_PARA_RESOLVER) passos.append(criar('li', '', passo));
}

/** Ação direta de cada pendência (linguagem comum). Pendência sem ação própria fica só com o texto. */
function acaoDaPendencia(p) {
  if (p.codigo === 'sem_bloco_aceito') return { texto: 'Incluir informação', rotulo: 'Incluir informação (resolver pendência)' };
  if (p.codigo === 'bloco_pendente' || p.codigo === 'fonte_inexistente' || p.codigo === 'fonte_revogada') return { texto: 'Ir para a informação', rotulo: `Ir para a informação: ${p.titulo}` };
  if (p.codigo === 'fonte_pendente') return { texto: 'Ir para o documento ou link', rotulo: `Ir para o documento ou link: ${p.titulo}` };
  return null;
}

function irParaPendencia(p) {
  if (contexto === null || revisao === null) return;
  if (p.codigo === 'sem_bloco_aceito') {
    abrirFormulario();
    return;
  }
  if (p.codigo === 'fonte_pendente') {
    focarItem(itemDaFonte(p.id));
    return;
  }
  if (p.codigo === 'fonte_revogada') {
    const usa = contexto.blocos.find((b) => b.referencias.some((r) => r.fonteId === p.id));
    focarItem(usa !== undefined ? itemDoBloco(usa.id) : itemDaFonte(p.id));
    return;
  }
  focarItem(itemDoBloco(p.id));
}

/** "Resolver pendências": mostra o que falta e leva o foco à primeira pendência. */
function resolverPendencias() {
  if (revisao === null || revisao.pendencias.length === 0) return;
  const primeira = document.querySelector('#pendencias li');
  focarItem(primeira);
}
$('botao-resolver').addEventListener('click', resolverPendencias);

function renderizarFontes(selecionadas = []) {
  const raiz = $('bloco-fontes');
  raiz.replaceChildren();
  if (contexto === null || contexto.fontes.length === 0) {
    raiz.append(criar('p', 'vazio', contexto === null ? 'Escolha um serviço para ver as fontes.' : 'Esta versão não tem fontes cadastradas. Adicione um texto ou link na página do serviço antes de cadastrar informações.'));
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
    local.placeholder = 'Ex.: página 3';
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
  $('titulo-form').textContent = 'Incluir informação';
  $('bloco-enviar').textContent = 'Salvar informação';
  limparErros();
  renderizarFontes();
}

function iniciarEdicao(bloco) {
  if (!podeEditar() || !bloco.editavel) return;
  limparErros();
  editando = bloco.id;
  formAberto = true;
  atualizarFormulario();
  $('titulo-form').textContent = 'Editar informação';
  $('bloco-enviar').textContent = 'Salvar informação';
  $('bloco-titulo').value = bloco.titulo;
  $('bloco-texto').value = bloco.texto;
  $('bloco-alertas').value = bloco.alertas.join('\n');
  renderizarFontes(bloco.referencias.map((r) => ({ fonteId: r.fonteId, localizacao: r.localizacao })));
  mostrarStatus('');
  $('titulo-form').scrollIntoView({ block: 'nearest' });
  $('titulo-form').focus();
}

function cancelar() {
  if (cliente.gravando() || ocupado) return;
  limparFormulario();
  formAberto = false;
  atualizarFormulario();
  mostrarStatus('');
  atualizarPermissoes();
  $('botao-nova-orientacao').focus();
}

// ---------- Permissões ----------

const podeEditar = () => cliente.sessaoPronta() && contexto !== null && contexto.editavel && !cliente.gravando() && !ocupado;

function atualizarPermissoes() {
  const livre = podeEditar();
  $('bloco-enviar').disabled = !livre || contexto.fontes.length === 0;
  $('bloco-cancelar').disabled = cliente.gravando() || ocupado;
  $('botao-nova-orientacao').disabled = !livre;
  const parada = !cliente.sessaoPronta() || cliente.gravando() || ocupado;
  for (const botao of document.querySelectorAll('#blocos button[data-acao], #fontes-revisao button[data-acao], #cartao-conclusao button[data-acao]')) {
    botao.disabled = parada || botao.dataset.indisponivel === 'true';
  }
}

// ---------- Confirmação do cadastro e da edição (diálogo com resumo) ----------

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
    titulo: criando ? 'Confirmar cadastro da informação' : 'Confirmar alteração da informação', rotuloConfirmar: 'Confirmar e salvar',
    linhas: resumoDoConhecimento(r.dados, contexto.fontes, contexto.nomeServico),
  });
}

const MENSAGEM_SUCESSO = { criar: 'Informação salva. Ela está em elaboração e ainda não está disponível no chatbot.', alterar: 'Informação alterada. Ela continua em elaboração e ainda não está disponível no chatbot.' };

async function confirmar() {
  if (pendente === null || cliente.gravando() || ocupado) return;
  const { operacao, servicoId, blocoId, corpo } = pendente;
  const idsAntes = new Set(contexto.blocos.map((b) => b.id));
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
    formAberto = false;
    atualizarFormulario();
    fecharConfirmacao();
    const atualizado = await carregarServico(servicoId);
    const salvo = operacao === 'alterar' ? blocoId : (contexto?.blocos.find((b) => !idsAntes.has(b.id))?.id ?? null);
    const focou = focarItem(salvo === null ? null : itemDoBloco(salvo));
    mostrarStatus(`${MENSAGEM_SUCESSO[operacao]}${atualizado.ok ? '' : ' A lista não pôde ser atualizada; recarregue a página.'}`, 'info', !focou);
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

// ---------- Ações da revisão ----------

/**
 * Envia uma ação da revisão com a `revisao` atual (exceto a nova versão, que envia `{}`). Bloqueia cliques repetidos, recarrega os
 * dados em caso de divergência e leva o foco à mensagem do resultado. `aoTerminarEnvio` fecha o diálogo que originou a ação.
 */
async function executarRevisao(acao, extra, mensagemDeSucesso, aoTerminarEnvio = () => {}, foco = null) {
  if (cliente.gravando() || ocupado || contexto === null || revisao === null) return;
  const servicoId = contexto.servicoId;
  const corpo = acao === 'nova-versao' ? {} : { ...extra, revisao: revisao.revisao };
  const posicaoDoBloco = foco !== null && foco.vizinho !== undefined ? contexto.blocos.findIndex((b) => b.id === foco.vizinho) : -1;
  ocupado = true;
  mostrarStatus('Registrando…');
  const promessa = cliente.gravarRevisao(acao, servicoId, corpo);
  atualizarPermissoes();
  let r;
  try {
    r = await promessa.catch(() => ({ ok: false, mensagem: 'Não foi possível concluir a ação agora. Tente de novo.' }));
    aoTerminarEnvio();
    if (r.ok) {
      const atualizado = await carregarServico(servicoId);
      ocupado = false;
      atualizarPermissoes();
      let alvo = null;
      if (foco !== null && atualizado.ok) {
        if (foco.bloco !== undefined) alvo = itemDoBloco(foco.bloco);
        else if (foco.fonte !== undefined) alvo = itemDaFonte(foco.fonte);
        else if (posicaoDoBloco >= 0 && contexto !== null) {
          const restantes = [...document.querySelectorAll('#blocos li.bloco')];
          alvo = restantes[Math.min(posicaoDoBloco, restantes.length - 1)] ?? null;
        }
      }
      const focou = focarItem(alvo);
      mostrarStatus(`${mensagemDeSucesso}${atualizado.ok ? '' : ' Os dados não puderam ser atualizados; recarregue a página.'}`, 'info', !focou);
      return;
    }
    if (r.recarregar) await carregarServico(servicoId);
  } finally {
    ocupado = false;
    atualizarPermissoes();
  }
  mostrarStatus(r.mensagem, 'erro', true);
}

/** Diálogo simples de confirmação (Voltar / Confirmar). Mantém-se aberto durante o envio, para evitar clique duplo. */
function ligarDialogo(dlg, voltar, confirmarBtn, aoConfirmar) {
  let gatilho = null;
  const devolverFoco = () => {
    if (gatilho !== null && gatilho.isConnected && !gatilho.disabled) gatilho.focus();
    else status.focus();
  };
  const fechar = () => { if (dlg.open) dlg.close(); };
  dlg.addEventListener('close', () => { atualizarPermissoes(); });
  dlg.addEventListener('cancel', (evento) => { if (cliente.gravando() || ocupado) evento.preventDefault(); });
  voltar.addEventListener('click', () => {
    if (cliente.gravando() || ocupado) return;
    fechar();
    devolverFoco();
  });
  confirmarBtn.addEventListener('click', async () => {
    if (cliente.gravando() || ocupado) return;
    voltar.disabled = true;
    confirmarBtn.disabled = true;
    dlg.setAttribute('aria-busy', 'true');
    await aoConfirmar(fechar);
    dlg.removeAttribute('aria-busy');
    // Se nada foi enviado (por exemplo, outra gravação em andamento), o diálogo não pode ficar preso: reabilita e devolve o foco.
    if (dlg.open) {
      voltar.disabled = false;
      confirmarBtn.disabled = false;
      voltar.focus();
    }
  });
  return (origem) => {
    gatilho = origem;
    voltar.disabled = false;
    confirmarBtn.disabled = false;
    dlg.removeAttribute('aria-busy');
    if (typeof dlg.showModal === 'function') dlg.showModal();
    else dlg.setAttribute('open', '');
    voltar.focus();
  };
}

let blocoADescartar = null;
const abrirDescarte = ligarDialogo($('dialogo-descarte'), $('descarte-voltar'), $('descarte-confirmar'), async (fechar) => {
  const bloco = blocoADescartar;
  if (bloco === null) { fechar(); return; }
  await executarRevisao('bloco-rejeitar', { blocoId: bloco.id }, 'Informação excluída.', () => { fechar(); blocoADescartar = null; }, { vizinho: bloco.id });
});

function pedirDescarte(bloco, gatilho) {
  if (ocupado || cliente.gravando() || revisao === null) return;
  blocoADescartar = bloco;
  $('descarte-descricao').textContent = `A informação "${bloco.titulo}" será removida da lista. Esta ação não pode ser desfeita por esta tela.`;
  abrirDescarte(gatilho);
}

const abrirConclusao = ligarDialogo($('dialogo-conclusao'), $('conclusao-voltar'), $('conclusao-confirmar'), async (fechar) => {
  await executarRevisao('concluir', {}, 'Revisão concluída. A versão está pronta para publicar e não pode mais ser editada.', fechar);
});

$('botao-concluir').addEventListener('click', (evento) => {
  if (ocupado || cliente.gravando() || revisao === null || !revisao.podeConcluir) return;
  abrirConclusao(evento.currentTarget);
});
$('botao-nova-versao').addEventListener('click', () => executarRevisao('nova-versao', {}, 'Nova versão criada. Ela está em elaboração e nada foi publicado.'));

// ---------- Editar e excluir fontes ----------

const dlgEditar = $('dialogo-editar-fonte');
const dlgExcluir = $('dialogo-excluir-fonte');
const CAMPOS_EDICAO = { titulo: 'ef-titulo', url: 'ef-url', orgaoResponsavel: 'ef-orgao', descricao: 'ef-descricao', dataPublicacao: 'ef-data', localizacao: 'ef-localizacao', texto: 'ef-texto' };
let edicaoFonte = null; // { fonteId, forma, original, gatilho } (só em memória, nunca exibido)
let exclusaoFonte = null; // { fonte, gatilho, indice }

function devolverFoco(gatilho) {
  if (gatilho && gatilho.isConnected && !gatilho.disabled) gatilho.focus();
  else status.focus();
}

function limparErrosEdicao() {
  for (const id of Object.values(CAMPOS_EDICAO)) {
    $(id).removeAttribute('aria-invalid');
    $(`${id}-erro`).hidden = true;
    $(`${id}-erro`).textContent = '';
  }
  $('ef-mensagem').hidden = true;
  $('ef-mensagem').textContent = '';
}

function mostrarErrosEdicao(erros, mensagem) {
  limparErrosEdicao();
  let primeiro = null;
  for (const [campo, texto] of Object.entries(erros ?? {})) {
    const id = CAMPOS_EDICAO[campo];
    if (id === undefined) continue;
    $(id).setAttribute('aria-invalid', 'true');
    $(`${id}-erro`).textContent = texto;
    $(`${id}-erro`).hidden = false;
    if (primeiro === null) primeiro = $(id);
  }
  if (mensagem) {
    $('ef-mensagem').textContent = mensagem;
    $('ef-mensagem').hidden = false;
  }
  (primeiro ?? $('ef-mensagem')).focus();
}

function bloquearEdicao(sim) {
  for (const id of [...Object.values(CAMPOS_EDICAO), 'ef-salvar']) $(id).disabled = sim;
  $('ef-voltar').disabled = false;
  $('form-editar-fonte').setAttribute('aria-busy', sim ? 'true' : 'false');
}

async function abrirEdicaoFonte(fonte, gatilho) {
  if (ocupado || cliente.gravando() || contexto === null || revisao === null) return;
  edicaoFonte = { fonteId: fonte.id, forma: fonte.forma, original: null, gatilho };
  $('form-editar-fonte').reset();
  limparErrosEdicao();
  $('ef-titulo-dialogo').textContent = fonte.forma === 'link' ? 'Editar link' : 'Editar texto';
  $('ef-grupo-link').hidden = fonte.forma !== 'link';
  $('ef-grupo-texto').hidden = fonte.forma !== 'texto';
  $('ef-aviso').hidden = !(fonte.revisada || fonte.usadaPorBloco);
  $('ef-salvar').textContent = fonte.forma === 'link' ? 'Salvar link' : 'Salvar texto';
  $('ef-carregando').hidden = false;
  bloquearEdicao(true);
  if (typeof dlgEditar.showModal === 'function') dlgEditar.showModal();
  else dlgEditar.setAttribute('open', '');
  $('ef-voltar').focus();
  const r = await cliente.carregarFonteParaEdicao(contexto.servicoId, fonte.id);
  if (edicaoFonte === null || edicaoFonte.fonteId !== fonte.id || !dlgEditar.open) return;
  $('ef-carregando').hidden = true;
  if (!r.ok) {
    mostrarErrosEdicao({}, r.mensagem);
    return;
  }
  for (const [campo, valor] of Object.entries(r.campos)) $(CAMPOS_EDICAO[campo]).value = valor;
  edicaoFonte.original = r.campos;
  bloquearEdicao(false);
  $('ef-titulo').focus();
}

function lerEdicao() {
  const valores = {};
  for (const [campo, id] of Object.entries(CAMPOS_EDICAO)) valores[campo] = $(id).value;
  return valores;
}

function fecharEdicao() {
  if (dlgEditar.open) dlgEditar.close();
}

async function salvarEdicaoFonte(evento) {
  evento.preventDefault();
  if (edicaoFonte === null || edicaoFonte.original === null || ocupado || cliente.gravando() || contexto === null || revisao === null) return;
  const v = validarEdicaoDeFonte(edicaoFonte.forma, lerEdicao(), edicaoFonte.original);
  if (!v.ok) {
    mostrarErrosEdicao(v.erros, 'Revise os campos indicados e tente novamente.');
    return;
  }
  if (Object.keys(v.corpo).length === 0) {
    mostrarErrosEdicao({}, 'Nenhuma alteração para salvar.');
    return;
  }
  limparErrosEdicao();
  const { fonteId } = edicaoFonte;
  const servicoId = contexto.servicoId;
  ocupado = true;
  bloquearEdicao(true);
  $('ef-voltar').disabled = true;
  const promessa = cliente.editarFonte(servicoId, fonteId, v.corpo, revisao.revisao);
  atualizarPermissoes();
  const r = await promessa;
  if (r.ok || r.recarregar) {
    edicaoFonte = null;
    fecharEdicao();
    const atualizado = await carregarServico(servicoId);
    ocupado = false;
    atualizarPermissoes();
    if (r.ok) {
      const focou = focarItem(atualizado.ok ? itemDaFonte(fonteId) : null);
      const reabertas = fraseBlocosReabertos(r.blocosReabertos);
      mostrarStatus(`Fonte alterada. Ela precisa ser revisada de novo.${reabertas === '' ? '' : ` ${reabertas}`}`, 'info', !focou);
    } else mostrarStatus(r.mensagem, 'erro', true);
    return;
  }
  ocupado = false;
  bloquearEdicao(false);
  atualizarPermissoes();
  mostrarErrosEdicao(r.erros, r.mensagem);
}

dlgEditar.addEventListener('cancel', (evento) => { if (ocupado || cliente.gravando()) evento.preventDefault(); });
dlgEditar.addEventListener('close', () => {
  if (edicaoFonte !== null) devolverFoco(edicaoFonte.gatilho);
  edicaoFonte = null;
  atualizarPermissoes();
});
$('ef-voltar').addEventListener('click', () => { if (!ocupado && !cliente.gravando()) fecharEdicao(); });
$('form-editar-fonte').addEventListener('submit', salvarEdicaoFonte);

async function abrirExclusaoFonte(fonte, gatilho, indice) {
  if (ocupado || cliente.gravando() || contexto === null || revisao === null) return;
  mostrarStatus('Verificando o que a exclusão afeta…');
  const r = await cliente.carregarImpactoDaFonte(contexto.servicoId, fonte.id);
  if (!r.ok) {
    if (r.recarregar) await carregarServico(contexto.servicoId);
    mostrarStatus(r.mensagem, 'erro', true);
    return;
  }
  mostrarStatus('');
  exclusaoFonte = { fonte, gatilho, indice };
  $('ex-nome').textContent = `Item que será retirado: "${fonte.titulo}"`;
  const lista = $('ex-informacoes-lista');
  lista.replaceChildren();
  for (const i of r.informacoes) lista.append(criar('li', '', `A informação "${i.titulo}" ${i.frase}.`));
  $('ex-informacoes').hidden = r.informacoes.length === 0;
  const antigo = $('ex-antigo-lista');
  antigo.replaceChildren();
  for (const frase of frasesConteudoAntigo(r.conteudoAntigo)) antigo.append(criar('li', '', frase));
  $('ex-antigo').hidden = antigo.childElementCount === 0;
  $('ex-mensagem').hidden = true;
  $('ex-confirmar').hidden = false;
  $('ex-confirmar').disabled = false;
  $('ex-voltar').disabled = false;
  if (typeof dlgExcluir.showModal === 'function') dlgExcluir.showModal();
  else dlgExcluir.setAttribute('open', '');
  $('ex-voltar').focus();
}

async function confirmarExclusaoFonte() {
  if (exclusaoFonte === null || ocupado || cliente.gravando() || contexto === null || revisao === null) return;
  const { fonte, indice } = exclusaoFonte;
  const servicoId = contexto.servicoId;
  ocupado = true;
  $('ex-confirmar').disabled = true;
  $('ex-voltar').disabled = true;
  dlgExcluir.setAttribute('aria-busy', 'true');
  const promessa = cliente.excluirFonte(servicoId, fonte.id, revisao.revisao);
  atualizarPermissoes();
  const r = await promessa;
  dlgExcluir.removeAttribute('aria-busy');
  if (r.ok || r.recarregar) {
    exclusaoFonte = null;
    dlgExcluir.close();
    const atualizado = await carregarServico(servicoId);
    ocupado = false;
    atualizarPermissoes();
    if (r.ok) {
      const itens = [...document.querySelectorAll('#fontes-revisao li.bloco')];
      const focou = focarItem(atualizado.ok ? (itens[Math.min(indice, itens.length - 1)] ?? null) : null);
      mostrarStatus('Item excluído. A exclusão será aplicada ao chatbot após a publicação desta versão.', 'info', !focou);
    } else mostrarStatus(r.mensagem, 'erro', true);
    return;
  }
  ocupado = false;
  atualizarPermissoes();
  $('ex-voltar').disabled = false;
  $('ex-confirmar').disabled = false;
  $('ex-mensagem').textContent = r.mensagem;
  $('ex-mensagem').hidden = false;
  $('ex-mensagem').focus();
}

dlgExcluir.addEventListener('cancel', (evento) => { if (ocupado || cliente.gravando()) evento.preventDefault(); });
dlgExcluir.addEventListener('close', () => {
  if (exclusaoFonte !== null) devolverFoco(exclusaoFonte.gatilho);
  exclusaoFonte = null;
  atualizarPermissoes();
});
$('ex-voltar').addEventListener('click', () => { if (!ocupado && !cliente.gravando()) dlgExcluir.close(); });
$('ex-confirmar').addEventListener('click', confirmarExclusaoFonte);

// ---------- Carregamento ----------

/** Lê a versão atual e a revisão do serviço e redesenha tudo. Resultados atrasados (outra escolha feita) são ignorados. */
async function carregarServico(servicoId) {
  const minha = ++sequencia;
  if (!servicoId) {
    limparContexto();
    return { ok: true };
  }
  $('blocos').setAttribute('aria-busy', 'true');
  $('fontes-revisao').setAttribute('aria-busy', 'true');
  const [r, rev] = await Promise.all([cliente.carregarConhecimento(servicoId), cliente.carregarRevisao(servicoId)]);
  if (minha !== sequencia) return r;
  if (!r.ok) {
    limparContexto('Não foi possível mostrar as informações deste serviço.');
    mostrarStatus(r.mensagem, 'erro');
    return r;
  }
  revisao = rev.ok ? rev : null;
  const editavel = r.editavel && (revisao === null || revisao.editavel);
  const mantidaEdicao = editando !== null && editavel && r.blocos.some((b) => b.id === editando && b.editavel);
  const outroServico = contexto === null || contexto.servicoId !== servicoId;
  const selecaoAtual = outroServico ? [] : lerFormularioAtualParaManter();
  contexto = { servicoId, nomeServico: r.nomeServico, numero: r.numero, estado: r.estado, editavel, fontes: r.fontes, blocos: r.blocos };
  if (outroServico || (editando !== null && !mantidaEdicao)) {
    limparFormulario();
    formAberto = false;
  } else renderizarFontes(selecaoAtual);
  atualizarVoltar();
  renderizarSituacao();
  renderizarFontesRevisao();
  renderizarBlocos();
  renderizarConclusao();
  atualizarPermissoes();
  if (!rev.ok) mostrarStatus(rev.mensagem, 'erro');
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

/** Seleciona assunto e serviço a partir de `?servico=` (id nunca exibido); valores inválidos ou desconhecidos são ignorados. */
async function selecionarServicoDaUrl() {
  const id = servicoDaUrl(window.location.search);
  const alvo = id === null ? undefined : servicoDoCatalogo(id);
  if (alvo === undefined) return false;
  $('assunto').value = alvo.assuntoId;
  if ($('assunto').value !== alvo.assuntoId) return false;
  preencherServicos();
  $('servico').value = alvo.id;
  if ($('servico').value !== alvo.id) return false;
  $('servico-compacto').hidden = false;
  $('selecao-completa').hidden = true;
  const r = await carregarServico(alvo.id);
  return r.ok;
}

$('botao-trocar-servico').addEventListener('click', () => {
  $('selecao-completa').hidden = false;
  $('servico-compacto').hidden = true;
  $('botao-trocar-servico').setAttribute('aria-expanded', 'true');
  $('assunto').focus();
});
$('botao-nova-orientacao').addEventListener('click', abrirFormulario);

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
  if (await selecionarServicoDaUrl()) {
    if (pendenciasDaUrl(window.location.search)) resolverPendencias();
    if (status.dataset.tipo !== 'erro') mostrarStatus('Serviço aberto para revisão.');
  } else {
    mostrarStatus('Sessão iniciada. Escolha o assunto e o serviço.');
  }
  atualizarPermissoes();
}

iniciar();
