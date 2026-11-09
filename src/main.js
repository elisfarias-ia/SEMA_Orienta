import './styles.css';
import { criarConversa } from './chat.js';
import { responderPergunta, respostaIndisponivel, validarPayload } from './assistant.js';

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

function responder(texto) {
  try {
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

function criarMensagem({ autor, texto, partes, fontes, avisos }) {
  const item = document.createElement('article');
  item.className = `message message--${autor}`;

  item.append(paragrafo('message__author', ROTULOS[autor]));
  const blocos = Array.isArray(partes) && partes.length > 0 ? partes : [texto];
  for (const parte of blocos) item.append(paragrafo('message__text', parte));

  for (const aviso of avisos ?? []) item.append(paragrafo('message__aviso', aviso));

  const links = (fontes ?? []).map((f) => ({ f, a: linkSeguro(f.url, f.titulo) })).filter(({ a }) => a);
  if (links.length > 0) {
    item.append(paragrafo('message__fontes-titulo', 'Fontes oficiais:'));
    const ul = document.createElement('ul');
    ul.className = 'message__fontes';
    for (const { a } of links) {
      const li = document.createElement('li');
      li.append(a);
      ul.append(li);
    }
    item.append(ul);
  }
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
carregarConteudoDeTeste();
