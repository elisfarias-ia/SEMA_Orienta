// Página "Saúde do sistema" (ambiente administrativo local, sem autenticação). Reaproveita a sessão, o token em memória e as
// funções de formatação de admin-logic.js; as regras e os estados vêm do endpoint GET /__admin/saude, sem duplicação aqui.
// Só textContent e APIs seguras do DOM (nada de HTML montado como texto), sem armazenamento do navegador, sem cookies e sem log.

import {
  CAPACIDADES_SAUDE, ESTADOS_SAUDE, criarClienteAdmin, formatarDataHoraBr, MENSAGEM_SEM_USUARIO, MENSAGEM_USUARIO_MUDOU, MENSAGENS, NOTA_NAO_IMPLEMENTADO, resumoDaSaude,
  rotuloDoUsuario,
} from '../admin-logic.js';

// Se o servidor recusar o token (o usuário da sessão mudou), a página volta ao estado sem usuário.
const cliente = criarClienteAdmin({ fetchImpl: (...argumentos) => fetch(...argumentos), aoPerderSessao: () => setTimeout(perderSessao, 0) });
const $ = (id) => document.getElementById(id);
const criarData = (texto) => new Date(texto);
let verificando = false;

function criar(tag, classe, texto) {
  const elemento = document.createElement(tag);
  if (classe) elemento.className = classe;
  if (texto !== undefined) elemento.textContent = texto;
  return elemento;
}

function mostrarStatus(texto, tipo = 'info') {
  $('status').textContent = texto;
  $('status').dataset.tipo = tipo;
}

function renderizar(saude) {
  const raiz = $('saude-lista');
  raiz.replaceChildren();
  const lista = criar('ul', 'saude');
  for (const c of saude.componentes) {
    const item = criar('li', 'saude__item');
    item.dataset.estado = c.estado;
    item.append(criar('p', 'saude__nome', c.nome));
    item.append(criar('p', 'saude__linha saude__estado', `Estado: ${ESTADOS_SAUDE[c.estado]}`));
    item.append(criar('p', 'saude__linha', c.mensagem));
    if (c.capacidade === 'nao_implementado') item.append(criar('p', 'saude__linha saude__nota', NOTA_NAO_IMPLEMENTADO));
    // Detalhes técnicos por expansão progressiva: só aparecem quando a pessoa pede.
    const detalhes = criar('details', 'saude__detalhes');
    detalhes.append(criar('summary', '', 'Ver detalhes'));
    detalhes.append(criar('p', 'saude__linha', `Capacidade: ${CAPACIDADES_SAUDE[c.capacidade]}`));
    detalhes.append(criar('p', 'saude__linha saude__hora', `Verificado em ${formatarDataHoraBr(c.verificadoEm, criarData)}`));
    item.append(detalhes);
    lista.append(item);
  }
  raiz.append(lista);
  $('saude-resumo').textContent = resumoDaSaude(saude.componentes);
  $('saude-quando').textContent = `Última verificação: ${formatarDataHoraBr(saude.geradoEm, criarData)}.`;
}

async function verificar() {
  if (verificando || !cliente.sessaoPronta()) return;
  verificando = true;
  $('saude-verificar').disabled = true;
  $('saude-lista').setAttribute('aria-busy', 'true');
  $('saude-quando').textContent = 'Verificando…';
  const r = await cliente.carregarSaude();
  verificando = false;
  $('saude-lista').setAttribute('aria-busy', 'false');
  $('saude-verificar').disabled = !cliente.sessaoPronta();
  if (!r.ok) {
    $('saude-lista').replaceChildren();
    $('saude-resumo').textContent = 'Não há resultado de verificação.';
    $('saude-quando').textContent = r.mensagem;
    return;
  }
  renderizar(r.saude);
}

$('saude-verificar').addEventListener('click', verificar);


// ---------- Usuário da sessão (login simulado, Passo 8B) ----------
// O usuário é escolhido na Gestão de conteúdo; aqui só aparece "Nome — Perfil" e o link "Trocar usuário" para lá.
function mostrarUsuario(usuario) {
  const quem = $('sessao-usuario');
  quem.textContent = usuario === null ? '' : rotuloDoUsuario(usuario);
  quem.hidden = usuario === null;
  $('sessao-trocar').hidden = usuario === null;
  $('sem-usuario').hidden = usuario !== null;
}

/** O servidor recusou o token em uso (outro usuário entrou em outra aba ou o servidor reiniciou). */
function perderSessao() {
  mostrarUsuario(null);
  mostrarStatus(MENSAGEM_USUARIO_MUDOU, 'erro');
  $('saude-verificar').disabled = true;
  $('saude-quando').textContent = 'Sem sessão: a verificação não está disponível.';
}

async function iniciar() {
  mostrarStatus('Preparando a sessão administrativa…');
  const sessao = await cliente.recuperarSessao();
  if (!sessao.ok) {
    mostrarStatus(sessao.mensagem ?? MENSAGENS.sessao, 'erro');
    $('saude-quando').textContent = 'Sem sessão: a verificação não está disponível.';
    return;
  }
  mostrarUsuario(sessao.usuario);
  if (sessao.usuario === null) {
    mostrarStatus(MENSAGEM_SEM_USUARIO, 'erro');
    $('saude-quando').textContent = 'Sem sessão: a verificação não está disponível.';
    return;
  }
  mostrarStatus('');
  await verificar();
}

iniciar();
