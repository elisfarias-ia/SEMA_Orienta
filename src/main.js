import './styles.css';
import { criarConversa } from './chat.js';
import { responderPergunta, respostaIndisponivel, validarPayload, validarConteudoPublicado, responderComConteudoPublicado } from './assistant.js';

const conversa = criarConversa();

const lista = document.getElementById('mensagens');
const formulario = document.getElementById('formulario');
const campo = document.getElementById('campo-mensagem');
const botaoReiniciar = document.getElementById('botao-reiniciar');
const faixa = document.getElementById('faixa-teste');

const ROTULOS = { usuario: 'Você', assistente: 'Assistente' };

// Conteúdo de teste local: só existe quando o servidor de desenvolvimento entrega os blocos.
// Em produção (build) este valor permanece nulo e o assistente responde apenas com a mensagem segura de indisponibilidade.
let conteudo = null;

async function carregarConteudoDeTeste() {
  if (import.meta.env.DEV) {
    try {
      const resposta = await fetch('/__assistente/blocos', { method: 'GET', cache: 'no-store' });
      if (!resposta.ok) return;
      const payload = validarPayload(await resposta.json());
      if (!payload) return;
      conteudo = payload;
      faixa.textContent = payload.mensagens.faixa; // textContent: nunca interpreta HTML
      faixa.hidden = false;
    } catch {
      // Sem endpoint ou sem rede: o assistente usa somente a mensagem segura de indisponibilidade.
    }
  }
}

// Conteúdo público publicado: o site indica o arquivo (meta "conteudo-publico"). Quando existe e é válido, é a ÚNICA fonte das respostas.
let publicado = null;

async function carregarConteudoPublicado() {
  const caminho = document.querySelector('meta[name="conteudo-publico"]')?.getAttribute('content') ?? '';
  if (!/^\/conteudo-publico\/conteudo-[0-9a-f]{16}\.json$/.test(caminho)) return;
  try {
    const resposta = await fetch(caminho, { method: 'GET', cache: 'no-store' });
    if (!resposta.ok) return;
    publicado = validarConteudoPublicado(await resposta.json());
  } catch {
    // Sem o arquivo ou sem rede: o assistente usa somente a mensagem segura de indisponibilidade.
  }
}

async function iniciarConteudo() {
  await carregarConteudoPublicado();
  if (publicado === null) await carregarConteudoDeTeste();
}

function responder(texto) {
  try {
    if (publicado !== null) return responderComConteudoPublicado(texto, publicado);
    return responderPergunta(texto, conteudo);
  } catch {
    return respostaIndisponivel();
  }
}

function paragrafo(classe, texto) {
  const p = document.createElement('p');
  p.className = classe;
  p.textContent = texto; // textContent: nunca interpreta HTML
  return p;
}

function linkSeguro(url, titulo) {
  let destino;
  try {
    destino = new URL(url);
  } catch {
    return null;
  }
  if (destino.protocol !== 'https:') return null; // somente links https
  const a = document.createElement('a');
  a.href = destino.href;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  a.textContent = titulo;
  return a;
}

const SVG_NS = 'http://www.w3.org/2000/svg';
const HORARIOS = new WeakMap(); // horário local de cada mensagem, só em memória

function horario(mensagem) {
  if (!HORARIOS.has(mensagem)) {
    HORARIOS.set(mensagem, new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }));
  }
  return HORARIOS.get(mensagem);
}

function criarAvatar(autor) {
  const avatar = document.createElement('div');
  avatar.className = 'avatar';
  if (autor !== 'usuario') {
    // Assistente: imagem circular original (modelo oculto no index.html, para o Vite incluí-la no build).
    const modelo = document.getElementById('avatar-assistente-modelo');
    if (modelo instanceof HTMLImageElement && modelo.getAttribute('src')) {
      avatar.classList.add('avatar--imagem');
      const imagem = document.createElement('img');
      imagem.src = modelo.getAttribute('src');
      imagem.alt = 'SEMA Orienta';
      imagem.width = 44;
      imagem.height = 42;
      avatar.append(imagem);
      return avatar;
    }
  }
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const uso = document.createElementNS(SVG_NS, 'use');
  uso.setAttribute('href', autor === 'usuario' ? '#av-pessoa' : '#av-assistente');
  svg.append(uso);
  avatar.append(svg);
  return avatar;
}

function criarMensagem(mensagem) {
  const { autor, texto, partes, fontes, avisos } = mensagem;
  const item = document.createElement('article');
  item.className = `message message--${autor}`;
  const balao = document.createElement('div');
  balao.className = 'bubble';
  item.append(criarAvatar(autor), balao);

  balao.append(paragrafo('message__author', ROTULOS[autor]));
  const blocos = Array.isArray(partes) && partes.length > 0 ? partes : [texto];
  for (const parte of blocos) balao.append(paragrafo('message__text', parte));

  for (const aviso of avisos ?? []) balao.append(paragrafo('message__aviso', aviso));

  const links = (fontes ?? []).map((f) => ({ f, a: linkSeguro(f.url, f.titulo) })).filter(({ a }) => a);
  if (links.length > 0) {
    balao.append(paragrafo('message__fontes-titulo', 'Fontes oficiais:'));
    const ul = document.createElement('ul');
    ul.className = 'message__fontes';
    for (const { a } of links) {
      const li = document.createElement('li');
      li.append(a);
      ul.append(li);
    }
    balao.append(ul);
  }
  const hora = document.createElement('time');
  hora.className = 'message__hora';
  hora.textContent = horario(mensagem);
  balao.append(hora);
  return item;
}

function rolarParaOFim() {
  lista.scrollTop = lista.scrollHeight;
}

function desenharTudo() {
  lista.replaceChildren(...conversa.listar().map(criarMensagem));
  rolarParaOFim();
}

function enviar() {
  const par = conversa.enviar(campo.value, responder);
  if (par) {
    lista.append(criarMensagem(par.usuario), criarMensagem(par.assistente));
    rolarParaOFim();
    campo.value = '';
  }
  campo.focus();
}

formulario.addEventListener('submit', (evento) => {
  evento.preventDefault();
  enviar();
});

campo.addEventListener('keydown', (evento) => {
  if (evento.key === 'Enter' && !evento.shiftKey && !evento.isComposing) {
    evento.preventDefault();
    enviar();
  }
});

botaoReiniciar.addEventListener('click', () => {
  conversa.reiniciar();
  campo.value = '';
  desenharTudo();
  campo.focus();
});

desenharTudo();
iniciarConteudo();
