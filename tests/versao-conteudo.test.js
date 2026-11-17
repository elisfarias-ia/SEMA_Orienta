// Passo 5A: representação canônica e hash da versão (services/admin/conteudo-versao.js). Funções puras; os conteúdos de exemplo
// vêm da leitura (somente leitura) da LAC real ou são fictícios. Nada é gravado.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { calcularHashDaVersao, hashConfere, montarConteudoCanonico, normalizarFimDeLinha, removerCamposDePublicacao } from '../services/admin/conteudo-versao.js';
import { lerArquivosDaVersao } from '../services/admin/versao-arquivos.js';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function congelar(valor) {
  if (valor && typeof valor === 'object' && !Object.isFrozen(valor)) {
    Object.freeze(valor);
    for (const v of Object.values(valor)) congelar(v);
  }
  return valor;
}
const lac = () => {
  const r = lerArquivosDaVersao({ raiz: RAIZ, servicoId: 'lac', versaoId: 'lac-v1' });
  assert.equal(r.ok, true);
  return structuredClone(r.arquivos);
};
const ENTRADAS = { servicoId: 'lac', entradas: [{ id: 'e1', fonteId: 'f1', texto: 'Texto fictício.', hash: 'a'.repeat(64), criadoEm: '2026-11-10', atualizadoEm: '2026-11-10' }] };
const hash = (a) => {
  const r = calcularHashDaVersao(a);
  assert.equal(r.ok, true, JSON.stringify(r));
  return r.hash;
};

test('H1. hash determinístico, SHA-256 hexadecimal, sem modificar a entrada', () => {
  const a = congelar(lac());
  assert.match(hash(a), /^[0-9a-f]{64}$/);
  assert.equal(hash(a), hash(a));
  assert.equal(hash(a), hash(structuredClone(a)));
});

test('H2. ordem diferente das chaves JSON não muda o hash; ordem das listas muda', () => {
  const a = lac();
  const invertido = structuredClone(a);
  const inverter = (o) => (Array.isArray(o) ? o.map(inverter) : o && typeof o === 'object' ? Object.fromEntries(Object.entries(o).reverse().map(([k, v]) => [k, inverter(v)])) : o);
  for (const k of ['service', 'documentos', 'perguntasFrequentes', 'fontes', 'conteudoAssistente']) invertido[k] = inverter(invertido[k]);
  assert.equal(hash(invertido), hash(a));
  const listaTrocada = structuredClone(a);
  listaTrocada.fontes.fontes.reverse();
  assert.notEqual(hash(listaTrocada), hash(a));
});

test('H3. CRLF, CR e LF no roteiro dão o mesmo hash; o texto não é aparado nem reescrito', () => {
  const a = lac();
  const lf = { ...a, roteiro: 'Linha um.\nLinha dois.\n' };
  assert.equal(hash({ ...a, roteiro: 'Linha um.\r\nLinha dois.\r\n' }), hash(lf));
  assert.equal(hash({ ...a, roteiro: 'Linha um.\rLinha dois.\r' }), hash(lf));
  assert.equal(normalizarFimDeLinha('a\r\nb\rc\nd'), 'a\nb\nc\nd');
  // Sem aparar: espaço no fim, linha em branco extra e espaço no começo mudam o hash.
  assert.notEqual(hash({ ...a, roteiro: 'Linha um.\nLinha dois.\n ' }), hash(lf));
  assert.notEqual(hash({ ...a, roteiro: 'Linha um.\nLinha dois.\n\n' }), hash(lf));
  assert.notEqual(hash({ ...a, roteiro: ' Linha um.\nLinha dois.\n' }), hash(lf));
  assert.notEqual(hash({ ...a, roteiro: 'Linha um.\nLinha dois.' }), hash(lf));
});

test('H4. entradas.json entra no hash quando referenciado, e qualquer mudança nele muda o hash', () => {
  const a = lac();
  const sem = hash(a);
  const com = hash({ ...a, entradas: ENTRADAS });
  assert.notEqual(com, sem);
  const outroTexto = structuredClone(ENTRADAS);
  outroTexto.entradas[0].texto = 'Texto fictício alterado.';
  assert.notEqual(hash({ ...a, entradas: outroTexto }), com);
  const vazio = hash({ ...a, entradas: { servicoId: 'lac', entradas: [] } });
  assert.notEqual(vazio, sem);
  assert.ok('entradas' in calcularHashDaVersao({ ...a, entradas: ENTRADAS }).conteudo);
  assert.equal('entradas' in calcularHashDaVersao(a).conteudo, false);
});

test('H5. alteração material muda o hash (service, documentos, perguntas, fontes, blocos, status de validação)', () => {
  const a = lac();
  const base = hash(a);
  const mudar = (fn) => {
    const c = structuredClone(a);
    fn(c);
    return hash(c);
  };
  assert.notEqual(mudar((c) => { c.service.nome = `${c.service.nome} alterado`; }), base);
  assert.notEqual(mudar((c) => { c.documentos.documentos[0].titulo = 'Outro título'; }), base);
  assert.notEqual(mudar((c) => { c.perguntasFrequentes.perguntas[0].pergunta = 'Outra pergunta?'; }), base);
  assert.notEqual(mudar((c) => { c.fontes.fontes[0].titulo = 'Outra fonte'; }), base);
  assert.notEqual(mudar((c) => { c.conteudoAssistente.blocos[0].texto = 'Outro texto'; }), base);
  assert.notEqual(mudar((c) => { c.fontes.fontes[0].statusValidacao = 'rascunho'; }), base);
  assert.notEqual(mudar((c) => { c.conteudoAssistente.blocos[0].revisaoAtualidade = 'concluida'; }), base);
});

test('H6. mudar apenas o campo `publicado` (em qualquer arquivo e nível) não muda o hash', () => {
  const a = lac();
  const base = hash(a);
  const c = structuredClone(a);
  c.service.publicado = true;
  c.documentos.documentos.forEach((d) => { d.publicado = true; });
  c.perguntasFrequentes.perguntas.forEach((p) => { p.publicado = true; });
  c.fontes.fontes.forEach((f) => { f.publicado = true; });
  c.conteudoAssistente.blocos.forEach((b) => { b.publicado = true; });
  assert.equal(hash(c), base);
  const d = removerCamposDePublicacao({ publicado: true, a: [{ publicado: false, b: 1 }], c: { publicado: 1, d: 'x' } });
  assert.deepEqual(d, { a: [{ b: 1 }], c: { d: 'x' } });
});

test('H7. entradas inválidas: arquivo ausente, chave desconhecida (manifesto e hash não são conteúdo), tipos errados e valores não JSON', () => {
  const a = lac();
  const { fontes, ...semFontes } = a;
  assert.deepEqual([calcularHashDaVersao(semFontes).ok, calcularHashDaVersao(semFontes).erro, calcularHashDaVersao(semFontes).chave], [false, 'arquivo_ausente', 'fontes']);
  assert.equal(calcularHashDaVersao({ ...a, versao: { id: 'lac-v1' } }).erro, 'chave_desconhecida');
  assert.equal(calcularHashDaVersao({ ...a, hashConteudo: 'x' }).erro, 'chave_desconhecida');
  assert.equal(calcularHashDaVersao({ ...a, roteiro: { texto: 'x' } }).erro, 'conteudo_invalido');
  assert.equal(calcularHashDaVersao({ ...a, fontes: [] }).erro, 'conteudo_invalido');
  assert.equal(calcularHashDaVersao({ ...a, entradas: 'texto' }).erro, 'conteudo_invalido');
  assert.equal(calcularHashDaVersao({ ...a, service: { ...a.service, x: undefined, y: () => 1 } }).erro, 'conteudo_invalido');
  assert.equal(calcularHashDaVersao({ ...a, service: { ...a.service, n: Number.NaN } }).erro, 'conteudo_invalido');
  assert.equal(calcularHashDaVersao(null).erro, 'conteudo_invalido');
  assert.equal(calcularHashDaVersao([]).erro, 'conteudo_invalido');
});

test('H8. hashConfere: confere o conteúdo atual com o hash gravado e nunca lança exceção', () => {
  const a = lac();
  const h = hash(a);
  assert.equal(hashConfere(h, a), true);
  assert.equal(hashConfere(h, { ...a, roteiro: `${a.roteiro}x` }), false);
  assert.equal(hashConfere(null, a), false);
  assert.equal(hashConfere('curto', a), false);
  assert.equal(hashConfere(h, null), false);
  assert.equal(hashConfere(h, { ...a, service: undefined }), false);
});

test('H9. montarConteudoCanonico não modifica a entrada e devolve cópia independente', () => {
  const a = congelar(lac());
  const r = montarConteudoCanonico(a);
  assert.equal(r.ok, true);
  assert.deepEqual(Object.keys(r.conteudo).sort(), ['conteudoAssistente', 'documentos', 'fontes', 'perguntasFrequentes', 'roteiro', 'service']);
  r.conteudo.service.nome = 'mudou';
  assert.notEqual(a.service.nome, 'mudou');
});
