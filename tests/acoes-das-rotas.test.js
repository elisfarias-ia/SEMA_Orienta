// Sprint 8, Passo 8C: ações exigidas por rota (services/admin/acoes-das-rotas.js). Módulo puro; nada é lido nem gravado.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ROTAS_GRAVADORAS, acoesDaRequisicao, acoesSemRota } from '../services/admin/acoes-das-rotas.js';
import { ACOES } from '../services/admin/permissoes.js';

test('AR1. toda rota gravadora exige ação conhecida; sessão, busca de links e leituras não exigem nada', () => {
  assert.equal(ROTAS_GRAVADORAS.length, 25);
  const chaves = new Set();
  for (const r of ROTAS_GRAVADORAS) {
    const acoes = acoesDaRequisicao({ caminho: r.exemplo, metodo: r.metodo });
    assert.ok(Array.isArray(acoes) && acoes.length > 0, `${r.metodo} ${r.exemplo}`);
    for (const a of acoes) assert.ok(ACOES.includes(a), a);
    chaves.add(`${r.metodo} ${r.exemplo}`);
    // Devolve cópia: alterar o resultado não muda a tabela.
    acoes.push('publicar');
    assert.notDeepEqual(acoesDaRequisicao({ caminho: r.exemplo, metodo: r.metodo }), acoes);
  }
  assert.equal(chaves.size, 25, 'cada rota tem exemplo próprio');
  // Mapa aprovado (amostra completa por grupo).
  const tabela = [
    ['POST', '/__admin/assuntos', ['cadastrar_tema']],
    ['POST', '/__admin/servicos', ['cadastrar_servico']],
    ['POST', '/__admin/servico-com-tema', ['cadastrar_servico', 'cadastrar_tema']],
    ['POST', '/__admin/cadastro-guiado', ['cadastrar_tema', 'cadastrar_servico', 'cadastrar_fonte']],
    ['POST', '/__admin/servicos/outro-servico/fontes', ['cadastrar_fonte']],
    ['POST', '/__admin/servicos/lac/links', ['cadastrar_link']],
    ['POST', '/__admin/servicos/lac/links-existentes', ['cadastrar_link']],
    ['POST', '/__admin/servicos/lac/entradas-texto', ['cadastrar_texto']],
    ['POST', '/__admin/servicos/lac/conhecimentos', ['cadastrar_informacao']],
    ['PATCH', '/__admin/servicos/lac/conhecimentos/bc-1', ['editar_informacao']],
    ['DELETE', '/__admin/servicos/lac/conhecimentos/bc-1', ['excluir_informacao']],
    ['PATCH', '/__admin/servicos/lac/fontes/f-1', ['editar_fonte']],
    ['DELETE', '/__admin/servicos/lac/fontes/f-1', ['excluir_fonte']],
    ['PATCH', '/__admin/servicos/lac/edicao', ['editar_servico']],
    ['PATCH', '/__admin/temas/um-tema/edicao', ['editar_tema']],
    ['POST', '/__admin/servicos/lac/importacao', ['importar_conteudo']],
    ['POST', '/__admin/servicos/lac/revisao/fontes', ['revisar_fonte']],
    ['POST', '/__admin/servicos/lac/revisao/blocos/aceitar', ['aceitar_bloco']],
    ['POST', '/__admin/servicos/lac/revisao/blocos/rejeitar', ['rejeitar_bloco']],
    ['POST', '/__admin/servicos/lac/revisao/blocos/reabrir', ['reabrir_bloco']],
    ['POST', '/__admin/servicos/lac/nova-versao', ['nova_versao']],
    ['POST', '/__admin/servicos/lac/revisao/concluir', ['validar_materialmente']],
    ['POST', '/__admin/servicos/lac/autorizacao', ['autorizar_publicacao']],
    ['POST', '/__admin/servicos/lac/publicacao', ['publicar']],
    ['POST', '/__admin/servicos/lac/revogacao', ['revogar']],
  ];
  for (const [metodo, caminho, esperadas] of tabela) assert.deepEqual(acoesDaRequisicao({ caminho, metodo }), esperadas, `${metodo} ${caminho}`);
  // Não gravam: sessão, busca de links e leituras.
  for (const [metodo, caminho] of [
    ['POST', '/__admin/sessao'], ['DELETE', '/__admin/sessao'], ['GET', '/__admin/sessao'],
    ['POST', '/__admin/servicos/lac/links-existentes/busca'],
    ['GET', '/__admin/catalogo'], ['GET', '/__admin/saude'], ['GET', '/__admin/servicos/lac/versao-atual'], ['GET', '/__admin/servicos/lac/revisao'],
    ['GET', '/__admin/servicos/lac/publicacao/resumo'], ['GET', '/__admin/servicos/lac/importacao'], ['GET', '/__admin/servicos/lac/edicao'],
    ['GET', '/__admin/temas/um-tema/edicao'], ['GET', '/__admin/servicos/lac/fontes/f-1'], ['GET', '/__admin/servicos/lac/fontes/f-1/impacto'],
    ['GET', '/__admin/servicos/lac/informacoes'],
    // Método que a rota não aceita (o endpoint responde 405 antes) e caminhos estranhos.
    ['PUT', '/__admin/assuntos'], ['GET', '/__admin/assuntos'], ['POST', '/__admin/servicos/lac/revisao/concluir/extra'], ['POST', '/__admin/servicos/LAC/fontes'],
  ]) {
    assert.equal(acoesDaRequisicao({ caminho, metodo }), null, `${metodo} ${caminho}`);
  }
  for (const ruim of [undefined, null, {}, { caminho: 1, metodo: 'POST' }, { caminho: '/__admin/assuntos' }, { caminho: '/__admin/assuntos', metodo: 'post' }]) {
    assert.equal(acoesDaRequisicao(ruim ?? undefined), null, JSON.stringify(ruim));
  }
});

test('AR2. ações da matriz sem rota: só enviar_para_revisao e solicitar_ajustes (validar_materialmente é o concluir, pseudônimo até o 8D)', () => {
  assert.deepEqual(acoesSemRota(), ['enviar_para_revisao', 'solicitar_ajustes']);
  const comRota = new Set(ROTAS_GRAVADORAS.flatMap((r) => r.acoes));
  assert.ok(comRota.has('validar_materialmente'));
  assert.equal(comRota.has('concluir_revisao'), false, 'concluir_revisao é nome do histórico, não da matriz');
});
