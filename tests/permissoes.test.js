// Sprint 8, Passo 8A: matriz de permissões por perfil (funções puras, sem gravação).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PERFIS } from '../services/admin/atores.js';
import { ACOES, PERMISSOES, acoesDoPerfil, podeExecutar } from '../services/admin/permissoes.js';
import { ACOES_REGISTRADAS } from '../services/admin/historico-revisao.js';
import { ACOES_DA_VERSAO } from '../services/admin/fluxo.js';

const DO_CADASTRANTE = ['cadastrar_tema', 'cadastrar_servico', 'cadastrar_fonte', 'cadastrar_link', 'cadastrar_texto', 'cadastrar_informacao',
  'editar_informacao', 'excluir_informacao', 'editar_fonte', 'excluir_fonte', 'editar_servico', 'editar_tema', 'importar_conteudo', 'revisar_fonte',
  'aceitar_bloco', 'rejeitar_bloco', 'reabrir_bloco', 'nova_versao', 'enviar_para_revisao'];
const DO_REVISOR = ['validar_materialmente', 'solicitar_ajustes', 'autorizar_publicacao', 'publicar', 'revogar'];

test('PM1. tabela e listas congeladas; cada ação com exatamente um perfil previsto; demonstração sem ações; nenhum perfil com todas', () => {
  assert.ok(Object.isFrozen(PERMISSOES) && Object.isFrozen(ACOES));
  for (const acao of ACOES) {
    assert.ok(Object.isFrozen(PERMISSOES[acao]), acao);
    assert.equal(PERMISSOES[acao].length, 1, acao);
    assert.ok(PERFIS.includes(PERMISSOES[acao][0]), acao);
  }
  assert.deepEqual(acoesDoPerfil('demonstracao'), []);
  for (const perfil of PERFIS) assert.ok(acoesDoPerfil(perfil).length < ACOES.length, perfil);
});

test('PM2. tabela conferida linha a linha (24 ações)', () => {
  assert.equal(ACOES.length, 24);
  const esperado = Object.fromEntries([...DO_CADASTRANTE.map((a) => [a, ['cadastrante']]), ...DO_REVISOR.map((a) => [a, ['revisor']])]);
  assert.deepEqual(Object.fromEntries(ACOES.map((a) => [a, [...PERMISSOES[a]]])), esperado);
  assert.deepEqual(acoesDoPerfil('cadastrante'), DO_CADASTRANTE);
  assert.deepEqual(acoesDoPerfil('revisor'), DO_REVISOR);
  for (const a of ['enviar_para_revisao', 'validar_materialmente', 'solicitar_ajustes']) assert.ok(ACOES.includes(a), a);
  assert.equal(ACOES.includes('concluir_revisao'), false);
  for (const a of DO_CADASTRANTE) assert.equal(podeExecutar('cadastrante', a) && !podeExecutar('revisor', a) && !podeExecutar('demonstracao', a), true, a);
  for (const a of DO_REVISOR) assert.equal(podeExecutar('revisor', a) && !podeExecutar('cadastrante', a) && !podeExecutar('demonstracao', a), true, a);
});

test('PM3. podeExecutar: false para entradas inválidas, desconhecidas e chaves de protótipo', () => {
  const invalidos = [undefined, null, 1, true, {}, [], ['cadastrante'], ''];
  for (const v of invalidos) {
    assert.equal(podeExecutar(v, 'publicar'), false, String(v));
    assert.equal(podeExecutar('revisor', v), false, String(v));
  }
  assert.equal(podeExecutar('Revisor', 'publicar'), false);
  assert.equal(podeExecutar('revisor', 'PUBLICAR'), false);
  assert.equal(podeExecutar('desconhecido', 'publicar'), false);
  assert.equal(podeExecutar('revisor', 'concluir_revisao'), false);
  for (const chave of ['__proto__', 'constructor', 'toString', 'hasOwnProperty', 'valueOf']) {
    for (const perfil of [...PERFIS, chave]) assert.equal(podeExecutar(perfil, chave), false, `${perfil} ${chave}`);
    assert.deepEqual(acoesDoPerfil(chave), [], chave);
  }
  for (const v of invalidos) assert.deepEqual(acoesDoPerfil(v), []);
});

test('PM4. consistência: ações registradas no histórico e ações da versão (exceto concluir_revisao) existem na matriz', () => {
  const nomes = new Set([...ACOES_REGISTRADAS, ...Object.keys(ACOES_DA_VERSAO)]);
  nomes.delete('concluir_revisao');
  for (const a of nomes) assert.ok(Object.hasOwn(PERMISSOES, a), a);
});

test('PM5. acoesDoPerfil devolve cópia: mudar o retorno não muda a tabela', () => {
  const lista = acoesDoPerfil('revisor');
  lista.push('cadastrar_tema');
  lista.length = 0;
  assert.deepEqual(acoesDoPerfil('revisor'), DO_REVISOR);
  assert.equal(podeExecutar('revisor', 'cadastrar_tema'), false);
  assert.notEqual(acoesDoPerfil('cadastrante'), acoesDoPerfil('cadastrante'));
});

test('PM6. tabela resiste a mutação em tempo de execução: alterar, acrescentar e apagar ação lançam TypeError', () => {
  assert.throws(() => { PERMISSOES.publicar = 'cadastrante'; }, TypeError);
  assert.throws(() => { PERMISSOES.acao_nova = ['cadastrante']; }, TypeError);
  assert.throws(() => { delete PERMISSOES.revogar; }, TypeError);
  assert.throws(() => { PERMISSOES.publicar.push('cadastrante'); }, TypeError);
  assert.equal(podeExecutar('cadastrante', 'publicar'), false);
  assert.equal(podeExecutar('revisor', 'publicar'), true);
  assert.equal(Object.hasOwn(PERMISSOES, 'acao_nova'), false);
  assert.equal(podeExecutar('cadastrante', 'acao_nova'), false);
  assert.ok(Object.hasOwn(PERMISSOES, 'revogar'));
  assert.equal(podeExecutar('revisor', 'revogar'), true);
  assert.equal(ACOES.length, 24);
});
