// Página "Saúde do sistema" (ambiente administrativo local, sem autenticação). Reaproveita a sessão, o token em memória e as
// funções de formatação de admin-logic.js; as regras e os estados vêm do endpoint GET /__admin/saude, sem duplicação aqui.
// Só textContent e APIs seguras do DOM (nada de HTML montado como texto), sem armazenamento do navegador, sem cookies e sem log.

import { CAPACIDADES_SAUDE, ESTADOS_SAUDE, criarClienteAdmin, formatarDataHoraBr, MENSAGENS, resumoDaSaude } from '../admin-logic.js';

const cliente = criarClienteAdmin({ fetchImpl: (...argumentos) => fetch(...argumentos) });
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
    item.append(criar('p', 'saude__linha', `Capacidade: ${CAPACIDADES_SAUDE[c.capacidade]}`));
    item.append(criar('p', 'saude__linha saude__estado', `Estado: ${ESTADOS_SAUDE[c.estado]}`));
    item.append(criar('p', 'saude__linha', c.mensagem));
    item.append(criar('p', 'saude__linha saude__hora', `Verificado em ${formatarDataHoraBr(c.verificadoEm, criarData)}`));
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

async function iniciar() {
  mostrarStatus('Preparando a sessão administrativa…');
  const sessao = await cliente.iniciarSessao();
  if (!sessao.ok) {
    mostrarStatus(sessao.mensagem ?? MENSAGENS.sessao, 'erro');
    $('saude-quando').textContent = 'Sem sessão: a verificação não está disponível.';
    return;
  }
  mostrarStatus('');
  await verificar();
}

iniciar();
