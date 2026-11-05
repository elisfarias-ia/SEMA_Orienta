import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  criarConversa,
  normalizarMensagem,
  MENSAGEM_INICIAL,
  RESPOSTA_TEMPORARIA,
} from '../src/chat.js';

test('a conversa começa com a mensagem inicial do assistente', () => {
  const conversa = criarConversa();
  assert.deepEqual(conversa.listar(), [{ autor: 'assistente', texto: MENSAGEM_INICIAL }]);
});

test('enviar adiciona a mensagem do usuário e a resposta temporária', () => {
  const conversa = criarConversa();
  const par = conversa.enviar('  Como funciona?  ');
  assert.equal(par.usuario.texto, 'Como funciona?');
  assert.equal(par.assistente.texto, RESPOSTA_TEMPORARIA);
  assert.equal(conversa.listar().length, 3);
});

test('mensagem vazia ou só com espaços é ignorada', () => {
  const conversa = criarConversa();
  assert.equal(conversa.enviar('   \n '), null);
  assert.equal(conversa.enviar(''), null);
  assert.equal(conversa.enviar(undefined), null);
  assert.equal(conversa.listar().length, 1);
});

test('reiniciar volta ao estado inicial', () => {
  const conversa = criarConversa();
  conversa.enviar('Olá');
  conversa.reiniciar();
  assert.deepEqual(conversa.listar(), [{ autor: 'assistente', texto: MENSAGEM_INICIAL }]);
});

test('normalizarMensagem preserva quebras de linha internas', () => {
  assert.equal(normalizarMensagem(' a\nb '), 'a\nb');
});

test('a resposta temporária não contém links, prazos nem orientação', () => {
  assert.doesNotMatch(RESPOSTA_TEMPORARIA, /https?:\/\/|www\.|\bdias?\b|\bprazo/i);
});

test('os textos da interface não usam expressões de atividade acadêmica', () => {
  const proibidas = /protótipo|acadêmic|marco 1|\bMVP\b|simulad|demonstração|curso|formação/i;
  assert.doesNotMatch(MENSAGEM_INICIAL, proibidas);
  assert.doesNotMatch(RESPOSTA_TEMPORARIA, proibidas);
});
