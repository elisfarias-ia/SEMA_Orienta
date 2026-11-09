// Fluxo de estados da versão e hash determinístico (Marco 7, Passo 7A). Funções puras, sem arquivos nem rede.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ESTADOS_VERSAO, TRANSICOES, estadoVersaoValido, proximosEstados, verificarTransicao, transicaoPermitida,
  conteudoEditavel, exigeNovaVersaoParaAlterar,
} from '../services/admin/fluxo.js';
import { hashConteudo, serializarCanonico } from '../services/admin/hash.js';
import { STATUS_VALIDOS } from '../scripts/validate-services.js';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lerTexto = (...p) => fs.readFileSync(path.join(RAIZ, ...p), 'utf8');

// ---------- Fluxo ----------

test('F1. há exatamente os seis estados, na ordem do fluxo', () => {
  assert.deepEqual([...ESTADOS_VERSAO], ['rascunho', 'em_validacao', 'ajustes_solicitados', 'validado_materialmente', 'autorizado_publicacao', 'publicado']);
  assert.ok(Object.isFrozen(ESTADOS_VERSAO));
  assert.ok(Object.isFrozen(TRANSICOES));
  assert.deepEqual(Object.keys(TRANSICOES), [...ESTADOS_VERSAO]);
});

test('F2. transições permitidas são somente as do fluxo', () => {
  const permitidas = [
    ['rascunho', 'em_validacao'],
    ['em_validacao', 'ajustes_solicitados'],
    ['em_validacao', 'validado_materialmente'],
    ['validado_materialmente', 'autorizado_publicacao'],
    ['autorizado_publicacao', 'publicado'],
  ];
  for (const [de, para] of permitidas) {
    assert.deepEqual(verificarTransicao(de, para), { permitida: true, motivo: null }, `${de} -> ${para}`);
    assert.equal(transicaoPermitida(de, para), true);
  }
  // Todas as demais combinações são recusadas.
  for (const de of ESTADOS_VERSAO) {
    for (const para of ESTADOS_VERSAO) {
      const esperado = permitidas.some(([a, b]) => a === de && b === para);
      assert.equal(transicaoPermitida(de, para), esperado, `${de} -> ${para}`);
    }
  }
});

test('F3. não se pula etapa: sem validação material não há autorização, e sem autorização não há publicação', () => {
  assert.equal(transicaoPermitida('rascunho', 'publicado'), false);
  assert.equal(transicaoPermitida('rascunho', 'validado_materialmente'), false);
  assert.equal(transicaoPermitida('em_validacao', 'autorizado_publicacao'), false);
  assert.equal(transicaoPermitida('em_validacao', 'publicado'), false);
  assert.equal(transicaoPermitida('validado_materialmente', 'publicado'), false);
  assert.equal(transicaoPermitida('ajustes_solicitados', 'validado_materialmente'), false);
});

test('F4. não se volta atrás nem se repete o estado; ajustes e publicado não têm saída', () => {
  assert.equal(transicaoPermitida('em_validacao', 'rascunho'), false);
  assert.equal(transicaoPermitida('publicado', 'autorizado_publicacao'), false);
  assert.equal(transicaoPermitida('autorizado_publicacao', 'validado_materialmente'), false);
  assert.equal(verificarTransicao('rascunho', 'rascunho').motivo, 'mesmo_estado');
  assert.deepEqual(proximosEstados('ajustes_solicitados'), []);
  assert.deepEqual(proximosEstados('publicado'), []);
  assert.equal(verificarTransicao('ajustes_solicitados', 'rascunho').motivo, 'transicao_nao_permitida');
});

test('F5. estados desconhecidos e entradas estranhas são recusados sem exceção', () => {
  assert.equal(verificarTransicao('validado', 'publicado').motivo, 'estado_de_origem_desconhecido');
  assert.equal(verificarTransicao('rascunho', 'aprovado').motivo, 'estado_de_destino_desconhecido');
  for (const valor of [undefined, null, 1, {}, [], '']) {
    assert.equal(transicaoPermitida(valor, 'em_validacao'), false);
    assert.equal(transicaoPermitida('rascunho', valor), false);
    assert.equal(estadoVersaoValido(valor), false);
    assert.deepEqual(proximosEstados(valor), []);
  }
  assert.equal(transicaoPermitida('__proto__', 'rascunho'), false);
  assert.equal(transicaoPermitida('constructor', 'rascunho'), false);
});

test('F6. só o rascunho é editável; os demais estados exigem nova versão para alterar o conteúdo', () => {
  assert.equal(conteudoEditavel('rascunho'), true);
  for (const e of ESTADOS_VERSAO.filter((x) => x !== 'rascunho')) {
    assert.equal(conteudoEditavel(e), false, e);
    assert.equal(exigeNovaVersaoParaAlterar(e), true, e);
  }
  assert.equal(exigeNovaVersaoParaAlterar('rascunho'), false);
  assert.equal(exigeNovaVersaoParaAlterar('desconhecido'), false);
});

test('F7. proximosEstados devolve cópia: alterá-la não muda as transições', () => {
  const lista = proximosEstados('em_validacao');
  lista.push('publicado');
  assert.deepEqual(proximosEstados('em_validacao'), ['ajustes_solicitados', 'validado_materialmente']);
});

test('F8. os estados de versão não substituem os status atuais de serviço, fontes, documentos e perguntas', () => {
  assert.deepEqual(STATUS_VALIDOS, ['rascunho', 'em_validacao', 'validado']);
  assert.equal(ESTADOS_VERSAO.includes('validado'), false);
  for (const arquivo of ['service.json', 'fontes.json', 'documentos.json', 'perguntas-frequentes.json', 'conteudo-assistente.json']) {
    assert.doesNotMatch(lerTexto('services', 'lac', 'versoes', 'v1', arquivo), /validado_materialmente|autorizado_publicacao|ajustes_solicitados/, arquivo);
  }
});

test('F9. fluxo.js e hash.js não leem arquivos nem variáveis de ambiente e não usam rede', () => {
  for (const arquivo of ['fluxo.js', 'hash.js']) {
    const texto = lerTexto('services', 'admin', arquivo);
    assert.doesNotMatch(texto, /process\.env|node:fs|from 'fs'|readFile|writeFile|fetch\(|node:http|node:net|localStorage/, arquivo);
  }
  assert.match(lerTexto('services', 'admin', 'hash.js'), /from 'node:crypto'/);
});

// ---------- Hash ----------

test('H1. mesmo conteúdo, mesmo hash: SHA-256 hexadecimal de 64 caracteres', () => {
  const h = hashConteudo({ a: 1, b: 'texto' });
  assert.match(h, /^[0-9a-f]{64}$/);
  assert.equal(hashConteudo({ a: 1, b: 'texto' }), h);
});

test('H2. a ordem das chaves não altera o hash, em qualquer nível', () => {
  const x = { nome: 'LAC', itens: [{ b: 2, a: 1 }, { d: [3, 2, 1], c: null }], z: { y: 1, x: 2 } };
  const y = { z: { x: 2, y: 1 }, itens: [{ a: 1, b: 2 }, { c: null, d: [3, 2, 1] }], nome: 'LAC' };
  assert.equal(hashConteudo(x), hashConteudo(y));
  assert.equal(serializarCanonico(x), serializarCanonico(y));
});

test('H3. a ordem dos itens de uma lista altera o hash (ela faz parte do conteúdo)', () => {
  assert.notEqual(hashConteudo({ etapas: ['a', 'b'] }), hashConteudo({ etapas: ['b', 'a'] }));
});

test('H4. qualquer mudança de conteúdo muda o hash', () => {
  const base = { texto: 'A LAC é uma modalidade.', ativo: true, n: 1, lista: [] };
  const h = hashConteudo(base);
  for (const alterado of [
    { ...base, texto: 'A LAC é uma modalidade. ' },
    { ...base, ativo: false },
    { ...base, n: 2 },
    { ...base, lista: [null] },
    { ...base, extra: false },
  ]) assert.notEqual(hashConteudo(alterado), h);
  // Tipos diferentes com aparência parecida não colidem.
  assert.notEqual(hashConteudo({ v: 1 }), hashConteudo({ v: '1' }));
  assert.notEqual(hashConteudo({ v: null }), hashConteudo({ v: 'null' }));
  assert.notEqual(hashConteudo({ 'a,b': 1 }), hashConteudo({ a: { b: 1 } }));
});

test('H5. vetor conhecido: o hash é o SHA-256 da serialização canônica', () => {
  assert.equal(serializarCanonico({ b: [1, 'x', null, true], a: {} }), '{"a":{},"b":[1,"x",null,true]}');
  assert.equal(hashConteudo({}), '44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a');
});

test('H6. aceita acentos e Unicode de forma estável', () => {
  assert.equal(hashConteudo({ t: 'Licença por Adesão e Compromisso' }), hashConteudo({ t: 'Licença por Adesão e Compromisso' }));
  assert.notEqual(hashConteudo({ t: 'Licença' }), hashConteudo({ t: 'Licenca' }));
});

test('H7. rejeita valores que não são JSON, em vez de produzir hash instável', () => {
  for (const invalido of [undefined, () => 1, Symbol('x'), 10n, NaN, Infinity, new Date(0), new Map(), { a: undefined }, { f() {} }]) {
    assert.throws(() => hashConteudo(invalido), TypeError);
  }
});

test('H8. não altera o conteúdo recebido e funciona com o conteúdo real da LAC', () => {
  const doc = JSON.parse(lerTexto('services', 'lac', 'versoes', 'v1', 'documentos.json'));
  const antes = JSON.stringify(doc);
  const h = hashConteudo(doc);
  assert.equal(JSON.stringify(doc), antes);
  assert.match(h, /^[0-9a-f]{64}$/);
  // Reordenar as chaves do documento não muda o hash.
  const invertido = Object.fromEntries(Object.entries(doc).reverse());
  assert.equal(hashConteudo(invertido), h);
});
