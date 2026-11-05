import './styles.css';
import { criarConversa } from './chat.js';

const conversa = criarConversa();

const lista = document.getElementById('mensagens');
const formulario = document.getElementById('formulario');
const campo = document.getElementById('campo-mensagem');
const botaoReiniciar = document.getElementById('botao-reiniciar');

const ROTULOS = { usuario: 'Você', assistente: 'Assistente' };

function criarMensagem({ autor, texto }) {
  const item = document.createElement('article');
  item.className = `message message--${autor}`;

  const quem = document.createElement('p');
  quem.className = 'message__author';
  quem.textContent = ROTULOS[autor];

  const corpo = document.createElement('p');
  corpo.className = 'message__text';
  corpo.textContent = texto; // textContent: nunca interpreta HTML digitado

  item.append(quem, corpo);
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
  const par = conversa.enviar(campo.value);
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
