// Sprint 3, Passo 3A: blocos de conhecimento (funções puras e regras do validador).
// Dados fictícios em memória. O arquivo real da LAC é só LIDO (cópia profunda) e conferido byte a byte ao final.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  alterarBlocoConhecimento, LIMITES, montarBlocoConhecimento, prepararBlocosParaNovaVersao, removerBlocoConhecimento, validarEntradaConhecimento,
} from '../services/admin/conhecimento.js';
import { criarNovaVersao } from '../services/admin/versao.js';
import { selecionarBlocosAssistente } from '../services/assistant-content.js';
import { LIMITES_CONHECIMENTO, validarConteudoAssistente } from '../scripts/validate-services.js';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ARQUIVO_LAC = path.join(RAIZ, 'services', 'lac', 'versoes', 'v1', 'conteudo-assistente.json');
const hashDoArquivo = () => crypto.createHash('sha256').update(fs.readFileSync(ARQUIVO_LAC)).digest('hex');
const HASH_INICIAL = hashDoArquivo();

const ARQUIVOS = { service: 'services/x/versoes/v1/service.json', fontes: 'services/x/versoes/v1/fontes.json' };
const versao = (estado = 'rascunho') => (estado === 'rascunho'
  ? { id: 'x-v1', servicoId: 'x', numero: 1, baseadaEm: null, estado, arquivos: ARQUIVOS, hashConteudo: null, criadoEm: '2026-11-01', enviadaEm: null }
  : { id: 'x-v1', servicoId: 'x', numero: 1, baseadaEm: null, estado, arquivos: ARQUIVOS, hashConteudo: 'a'.repeat(64), criadoEm: '2026-11-01', enviadaEm: '2026-11-02' });
const fontes = () => [
  { id: 'fonte-a', vigencia: { situacao: 'nao_se_aplica' }, publicado: false },
  { id: 'fonte-b', vigencia: { situacao: 'nao_se_aplica' }, publicado: false },
  { id: 'fonte-velha', vigencia: { situacao: 'revogada' }, publicado: false },
];
const BLOCO_TESTE = {
  id: 'x-limites', tipo: 'limitacao', texto: 'Apenas orienta.', origem: 'regra_institucional', fonteIds: [], ambiente: 'teste_local',
  statusValidacao: 'em_validacao', publicado: false, revisaoAtualidade: 'pendente',
};
const conteudoBase = () => ({
  serviceId: 'x', statusValidacao: 'em_validacao',
  autorizacao: { escopo: 'teste_local', data: '2026-11-01', aprovacaoMaterial: false, aprovacaoPublica: false, observacao: 'Teste local.' },
  blocos: [{ ...BLOCO_TESTE }], pendencia: 'PENDENTE: fictício.',
});
const entrada = (extra = {}) => ({
  titulo: 'Como iniciar', texto: 'Texto orientativo fictício.', fonteIds: ['fonte-a'], referencias: [{ fonteId: 'fonte-a', localizacao: 'Seção 2' }], ...extra,
});
const criar = (c = conteudoBase(), e = entrada(), id = 'bc-1', data = '2026-11-10') => montarBlocoConhecimento(versao(), c, fontes(), e, { id, data });
const EMAIL = ['pessoa', 'exemplo.org'].join('@'); // montado em tempo de execução: o repositório não guarda e-mail nem telefone
const TELEFONE = ['(65)', '99999', '1234'].join(' ');
const congelar = (o) => JSON.stringify(o);

test('criação válida: rascunho, não publicado, pendente, ambiente publico, datas e ordem', () => {
  const c = conteudoBase();
  const antes = congelar(c);
  const r = criar(c);
  assert.equal(r.ok, true);
  assert.equal(congelar(c), antes, 'entrada não é modificada');
  assert.deepEqual(r.bloco, {
    id: 'bc-1', tipo: 'conhecimento', titulo: 'Como iniciar', texto: 'Texto orientativo fictício.', fonteIds: ['fonte-a'],
    referencias: [{ fonteId: 'fonte-a', localizacao: 'Seção 2' }], origem: 'fonte', ambiente: 'publico', statusValidacao: 'rascunho', publicado: false,
    revisaoAtualidade: 'pendente', criadoEm: '2026-11-10', atualizadoEm: '2026-11-10',
  });
  assert.equal(r.conteudo.blocos.length, 2);
  assert.deepEqual(r.conteudo.blocos[0], BLOCO_TESTE);
  assert.deepEqual(validarConteudoAssistente(r.conteudo, { idServico: 'x', fontesPorId: new Map(fontes().map((f) => [f.id, f])) }), []);
});

test('criação com alertas, duas fontes e textos aparados', () => {
  const r = criar(conteudoBase(), entrada({
    titulo: '  Título  ', fonteIds: ['fonte-a', 'fonte-b'], alertas: ['  Pode estar desatualizado.  '],
    referencias: [{ fonteId: 'fonte-a', localizacao: ' p. 3 ' }, { fonteId: 'fonte-b', localizacao: 'art. 5º' }],
  }));
  assert.equal(r.ok, true);
  assert.equal(r.bloco.titulo, 'Título');
  assert.deepEqual(r.bloco.alertas, ['Pode estar desatualizado.']);
  assert.equal(r.bloco.referencias[0].localizacao, 'p. 3');
});

test('alterar: mantém id, criadoEm e status; atualiza só atualizadoEm; entrada intacta', () => {
  const c1 = criar().conteudo;
  const antes = congelar(c1);
  const r = alterarBlocoConhecimento(versao(), c1, fontes(), 'bc-1', entrada({ titulo: 'Novo título', fonteIds: ['fonte-b'], referencias: [{ fonteId: 'fonte-b', localizacao: 'item 4' }] }), { data: '2026-11-12' });
  assert.equal(r.ok, true);
  assert.equal(congelar(c1), antes);
  assert.equal(r.bloco.id, 'bc-1');
  assert.equal(r.bloco.criadoEm, '2026-11-10');
  assert.equal(r.bloco.atualizadoEm, '2026-11-12');
  assert.equal(r.bloco.titulo, 'Novo título');
  assert.deepEqual(r.bloco.fonteIds, ['fonte-b']);
  assert.equal(r.bloco.publicado, false);
  assert.equal(r.conteudo.blocos.length, 2);
});

test('alterar: bloco inexistente, bloco que não é conhecimento, data anterior e data inválida', () => {
  const c1 = criar().conteudo;
  assert.equal(alterarBlocoConhecimento(versao(), c1, fontes(), 'nao-existe', entrada(), { data: '2026-11-12' }).erro, 'bloco_nao_encontrado');
  assert.equal(alterarBlocoConhecimento(versao(), c1, fontes(), 'x-limites', entrada(), { data: '2026-11-12' }).erro, 'bloco_nao_editavel');
  assert.equal(alterarBlocoConhecimento(versao(), c1, fontes(), 'bc-1', entrada(), { data: '2026-11-09' }).erro, 'data_anterior_a_criacao');
  assert.equal(alterarBlocoConhecimento(versao(), c1, fontes(), 'bc-1', entrada(), { data: '12-11-2026' }).erro, 'data_invalida');
});

test('remoção válida só de conhecimento; teste_local e bloco publicado são recusados', () => {
  const c1 = criar().conteudo;
  const antes = congelar(c1);
  const r = removerBlocoConhecimento(versao(), c1, 'bc-1');
  assert.equal(r.ok, true);
  assert.equal(congelar(c1), antes);
  assert.deepEqual(r.conteudo.blocos, [BLOCO_TESTE]);
  assert.equal(r.removido.id, 'bc-1');
  assert.equal(removerBlocoConhecimento(versao(), c1, 'x-limites').erro, 'bloco_nao_removivel');
  assert.equal(removerBlocoConhecimento(versao(), c1, 'nao-existe').erro, 'bloco_nao_encontrado');
  const publicado = structuredClone(c1);
  publicado.blocos[1].publicado = true;
  assert.equal(removerBlocoConhecimento(versao(), publicado, 'bc-1').erro, 'bloco_nao_removivel');
});

test('remoção: cada condição fora de rascunho/não publicado/pendente é recusada, sem alterar a entrada', () => {
  const c1 = criar().conteudo;
  const recusas = [
    { statusValidacao: 'em_validacao' }, { statusValidacao: 'validado' }, { publicado: true },
    { revisaoAtualidade: 'em_revisao' }, { revisaoAtualidade: 'concluida' }, { revisaoAtualidade: undefined }, { publicado: undefined },
    { statusValidacao: undefined }, { ambiente: 'teste_local', tipo: 'limitacao' },
  ];
  for (const mudanca of recusas) {
    const c = structuredClone(c1);
    Object.assign(c.blocos[1], mudanca);
    const antes = congelar(c);
    assert.equal(removerBlocoConhecimento(versao(), c, 'bc-1').erro, 'bloco_nao_removivel', JSON.stringify(mudanca));
    assert.equal(congelar(c), antes);
  }
  for (const estado of ['em_validacao', 'publicado']) assert.equal(removerBlocoConhecimento(versao(estado), c1, 'bc-1').erro, 'versao_nao_editavel');
  assert.equal(removerBlocoConhecimento(versao(), c1, 'bc-1').ok, true);
});

test('identidade auditável: versaoId + blocoId; duas versões com o mesmo blocoId têm chaves diferentes', () => {
  const v1 = versao('publicado');
  const publicado = { ...criar().bloco, statusValidacao: 'validado', publicado: true, revisaoAtualidade: 'concluida' };
  const anterior = { ...conteudoBase(), blocos: [{ ...BLOCO_TESTE }, publicado] };
  const v2 = criarNovaVersao(v1, { id: 'x-v2', criadoEm: '2026-11-20' }, [v1]).versao;
  const nova = prepararBlocosParaNovaVersao(anterior, { data: '2026-11-20' }).conteudo;
  const chave = (v, b) => `${v.id}+${b.id}`;
  assert.notEqual(v1.id, v2.id);
  assert.equal(anterior.blocos[1].id, nova.blocos[1].id, 'linhagem: o mesmo blocoId nas duas versões');
  assert.equal(new Set([anterior.blocos[1].id, nova.blocos[1].id]).size, 1, 'só o blocoId não distingue as versões');
  assert.equal(new Set([chave(v1, anterior.blocos[1]), chave(v2, nova.blocos[1])]).size, 2, 'versaoId + blocoId distingue');
  assert.equal(chave(v1, anterior.blocos[1]), 'x-v1+bc-1');
  assert.equal(chave(v2, nova.blocos[1]), 'x-v2+bc-1');
  assert.equal(anterior.blocos[1].publicado, true, 'a versão anterior mantém o seu estado');
  assert.equal(nova.blocos[1].publicado, false, 'a nova versão reinicia o estado');
});

test('cópia profunda: alterar o resultado não muda a entrada, e alterar a entrada depois não muda o resultado', () => {
  const sujar = (conteudo) => {
    for (const b of conteudo.blocos) {
      b.texto = 'SUJO';
      b.fonteIds.push('sujo');
      if (b.referencias) { b.referencias[0].localizacao = 'SUJO'; b.referencias.push({ fonteId: 'sujo', localizacao: 'SUJO' }); }
      if (b.alertas) b.alertas.push('SUJO');
    }
    conteudo.autorizacao.observacao = 'SUJO';
  };
  const base = criar().conteudo; // teste_local + conhecimento (com alerta abaixo)
  const comAlerta = alterarBlocoConhecimento(versao(), base, fontes(), 'bc-1', entrada({ alertas: ['Aviso.'] }), { data: '2026-11-11' }).conteudo;
  const operacoes = {
    montar: (c, e, f) => montarBlocoConhecimento(versao(), c, f, e, { id: 'bc-2', data: '2026-11-12' }),
    alterar: (c, e, f) => alterarBlocoConhecimento(versao(), c, f, 'bc-1', e, { data: '2026-11-12' }),
    remover: (c) => removerBlocoConhecimento(versao(), c, 'bc-1'),
    preparar: (c) => prepararBlocosParaNovaVersao(c, { data: '2026-11-20' }),
  };
  for (const [nome, operacao] of Object.entries(operacoes)) {
    const c = structuredClone(comAlerta);
    const e = entrada({ alertas: ['Outro aviso.'] });
    const f = fontes();
    const antes = congelar({ c, e, f });
    const r = operacao(c, e, f);
    assert.equal(r.ok, true, nome);
    const resultado = congelar(r.conteudo);
    sujar(r.conteudo);
    if (r.bloco) { r.bloco.titulo = 'SUJO'; r.bloco.fonteIds.push('sujo'); }
    assert.equal(congelar({ c, e, f }), antes, `${nome}: entrada intacta depois de alterar o resultado`);
    // alterar a entrada depois não afeta um resultado já obtido
    const r2 = operacao(structuredClone(comAlerta), e, f);
    const foto = congelar(r2.conteudo);
    e.fonteIds.push('sujo'); e.referencias[0].localizacao = 'SUJO'; e.alertas.push('SUJO'); f[0].id = 'sujo';
    assert.equal(congelar(r2.conteudo), foto, `${nome}: resultado intacto depois de alterar a entrada`);
    assert.ok(resultado.length > 0);
  }
});

test('alterar bloco publicado ou validado é recusado', () => {
  const c1 = criar().conteudo;
  for (const mudanca of [{ publicado: true }, { statusValidacao: 'validado' }]) {
    const c = structuredClone(c1);
    Object.assign(c.blocos[1], mudanca);
    assert.equal(alterarBlocoConhecimento(versao(), c, fontes(), 'bc-1', entrada(), { data: '2026-11-12' }).erro, 'bloco_nao_editavel');
  }
});

test('congelamento: criar, alterar e remover só em rascunho', () => {
  const c1 = criar().conteudo;
  for (const estado of ['em_validacao', 'ajustes_solicitados', 'validado_materialmente', 'autorizado_publicacao', 'publicado']) {
    const v = versao(estado);
    assert.equal(montarBlocoConhecimento(v, conteudoBase(), fontes(), entrada(), { id: 'bc-2', data: '2026-11-10' }).erro, 'versao_nao_editavel', estado);
    assert.equal(alterarBlocoConhecimento(v, c1, fontes(), 'bc-1', entrada(), { data: '2026-11-12' }).erro, 'versao_nao_editavel', estado);
    assert.equal(removerBlocoConhecimento(v, c1, 'bc-1').erro, 'versao_nao_editavel', estado);
  }
  assert.equal(montarBlocoConhecimento({ id: 'x' }, conteudoBase(), fontes(), entrada(), { id: 'bc-2', data: '2026-11-10' }).erro, 'versao_invalida');
  assert.equal(criar({ serviceId: 'x' }).erro, 'conteudo_invalido');
});

test('id: duplicado, inválido e datas inválidas na criação', () => {
  const c1 = criar().conteudo;
  assert.equal(criar(c1, entrada(), 'bc-1').erro, 'id_duplicado');
  assert.equal(criar(c1, entrada(), 'x-limites').erro, 'id_duplicado');
  const direto = (id, data) => montarBlocoConhecimento(versao(), conteudoBase(), fontes(), entrada(), { id, data });
  for (const id of ['', 'Bc-1', '1bc', 'bc 1', undefined, 'a'.repeat(61)]) assert.equal(direto(id, '2026-11-10').erro, 'id_invalido', String(id));
  for (const data of ['2026-02-30', '10-11-2026', '2026-1-1', '', undefined, 20261110]) assert.equal(direto('bc-9', data).erro, 'data_invalida', String(data));
});

test('datas inválidas: recusadas com código fechado antes de montar o bloco', () => {
  const direto = (data) => montarBlocoConhecimento(versao(), conteudoBase(), fontes(), entrada(), { id: 'bc-9', data });
  for (const data of ['2026-02-30', '2026-13-01', '10-11-2026', '2026-1-1', '2026-11-10T00:00:00Z', '', ' ', null, undefined, 20261110, {}]) {
    const r = direto(data);
    assert.equal(r.ok, false, String(data));
    assert.equal(r.erro, 'data_invalida', String(data));
    assert.equal(r.conteudo, undefined);
  }
  const c1 = criar().conteudo;
  for (const data of ['2026-02-30', '10-11-2026', '', null, undefined]) {
    assert.equal(alterarBlocoConhecimento(versao(), c1, fontes(), 'bc-1', entrada(), { data }).erro, 'data_invalida', String(data));
    assert.equal(prepararBlocosParaNovaVersao(c1, { data }).erro, 'data_invalida', String(data));
  }
  // criadoEm inválido no bloco existente (JSON editado à mão): alteração e nova versão recusam com código fechado
  for (const criadoEm of ['2026-02-30', '10-11-2026', '', undefined, 5]) {
    const c = structuredClone(c1);
    c.blocos[1].criadoEm = criadoEm;
    assert.equal(alterarBlocoConhecimento(versao(), c, fontes(), 'bc-1', entrada(), { data: '2026-11-12' }).erro, 'data_invalida', String(criadoEm));
    assert.equal(prepararBlocosParaNovaVersao(c, { data: '2026-11-20' }).erro, 'data_invalida', String(criadoEm));
  }
});

test('campos inválidos da entrada, um a um', () => {
  const casos = [
    ['extras', entrada({ id: 'bc-x' })],
    ['extras', entrada({ publicado: true })],
    ['extras', entrada({ statusValidacao: 'validado' })],
    ['extras', entrada({ ambiente: 'teste_local' })],
    ['extras', entrada({ criadoEm: '2026-01-01' })],
    ['titulo', entrada({ titulo: '' })],
    ['titulo', entrada({ titulo: 42 })],
    ['titulo', entrada({ titulo: 'a'.repeat(201) })],
    ['titulo', entrada({ titulo: `Fale com ${EMAIL}` })],
    ['texto', entrada({ texto: '   ' })],
    ['texto', entrada({ texto: undefined })],
    ['texto', entrada({ texto: `Ligue ${TELEFONE}` })],
    ['texto', entrada({ texto: 'a'.repeat(2001) })],
    ['texto', entrada({ texto: 'linha\u0000nula' })],
    ['fonteIds', entrada({ fonteIds: [] })],
    ['fonteIds', entrada({ fonteIds: 'fonte-a' })],
    ['fonteIds', entrada({ fonteIds: ['fonte-inexistente'], referencias: [{ fonteId: 'fonte-inexistente', localizacao: 'p. 1' }] })],
    ['fonteIds', entrada({ fonteIds: ['fonte-velha'], referencias: [{ fonteId: 'fonte-velha', localizacao: 'p. 1' }] })],
    ['fonteIds', entrada({ fonteIds: ['fonte-a', 'fonte-a'], referencias: [{ fonteId: 'fonte-a', localizacao: 'p. 1' }, { fonteId: 'fonte-a', localizacao: 'p. 2' }] })],
    ['referencias', entrada({ referencias: [] })],
    ['referencias', entrada({ referencias: undefined })],
    ['referencias', entrada({ referencias: [{ fonteId: 'fonte-a' }] })],
    ['referencias', entrada({ referencias: [{ fonteId: 'fonte-a', localizacao: '' }] })],
    ['referencias', entrada({ referencias: [{ fonteId: 'fonte-a', localizacao: 'p. 1', extra: 1 }] })],
    ['referencias', entrada({ referencias: [{ fonteId: 'fonte-b', localizacao: 'p. 1' }] })],
    ['referencias', entrada({ referencias: [{ fonteId: 'fonte-a', localizacao: 'p. 1' }, { fonteId: 'fonte-b', localizacao: 'p. 2' }] })],
    ['referencias', entrada({ fonteIds: ['fonte-a', 'fonte-b'] })],
    ['referencias', entrada({ referencias: [{ fonteId: 'fonte-a', localizacao: EMAIL }] })],
    ['alertas', entrada({ alertas: 'aviso' })],
    ['alertas', entrada({ alertas: [''] })],
    ['alertas', entrada({ alertas: ['ok', 7] })],
    ['alertas', entrada({ alertas: Array.from({ length: 11 }, () => 'a') })],
    ['alertas', entrada({ alertas: ['a'.repeat(301)] })],
  ];
  for (const [campo, e] of casos) {
    const r = validarEntradaConhecimento(e, fontes());
    assert.equal(r.ok, false, JSON.stringify(Object.keys(e)) + campo);
    assert.ok(r.campos.includes(campo), `${campo}: ${r.campos}`);
    const c = criar(conteudoBase(), e);
    assert.equal(c.ok, false);
    assert.equal(c.erro, 'dados_invalidos');
    assert.ok(c.detalhes.includes(campo));
  }
  assert.deepEqual(validarEntradaConhecimento(null, fontes()), { ok: false, campos: ['entrada'] });
  assert.deepEqual(validarEntradaConhecimento([], fontes()), { ok: false, campos: ['entrada'] });
});

test('os detalhes de erro nomeiam campos e não repetem o conteúdo enviado', () => {
  const r = criar(conteudoBase(), entrada({ texto: `Ligue ${TELEFONE} segredo-xyz` }));
  assert.equal(r.ok, false);
  assert.equal(JSON.stringify(r).includes('segredo-xyz'), false);
});

test('rastreabilidade: cada fonte citada tem uma referência e vice-versa', () => {
  const r = criar(conteudoBase(), entrada({
    fonteIds: ['fonte-a', 'fonte-b'],
    referencias: [{ fonteId: 'fonte-b', localizacao: 'item 1' }, { fonteId: 'fonte-a', localizacao: 'item 2' }],
  }));
  assert.equal(r.ok, true);
  assert.deepEqual(r.bloco.referencias.map((x) => x.fonteId).sort(), [...r.bloco.fonteIds].sort());
});

test('validador da base: cada recusa tem o motivo esperado', () => {
  const mapa = new Map(fontes().map((f) => [f.id, f]));
  const valido = criar().bloco;
  const conteudoCom = (mudanca) => ({ ...conteudoBase(), blocos: [{ ...BLOCO_TESTE }, { ...structuredClone(valido), ...mudanca }] });
  const erros = (mudanca, m = mapa) => validarConteudoAssistente(conteudoCom(mudanca), { idServico: 'x', fontesPorId: m });
  assert.deepEqual(erros({}), []);
  const recusados = [
    [{ extra: 1 }, 'campo não previsto'],
    [{ origem: 'regra_institucional', fonteIds: [], referencias: undefined }, 'exige origem "fonte"'],
    [{ ambiente: 'teste_local' }, 'exige ambiente "publico"'],
    [{ titulo: '' }, 'titulo obrigatório'],
    [{ titulo: undefined }, 'campo obrigatório ausente em bloco de conhecimento: titulo'],
    [{ texto: undefined }, 'campo obrigatório ausente em bloco de conhecimento: texto'],
    [{ criadoEm: undefined }, 'campo obrigatório ausente em bloco de conhecimento: criadoEm'],
    [{ atualizadoEm: undefined }, 'campo obrigatório ausente em bloco de conhecimento: atualizadoEm'],
    [{ referencias: [] }, 'referencias obrigatórias'],
    [{ referencias: [{ fonteId: 'fonte-b', localizacao: 'p. 1' }] }, 'fonteId deve estar em fonteIds'],
    [{ referencias: [{ fonteId: 'fonte-a', localizacao: 'p. 1', extra: 1 }] }, 'somente fonteId e localizacao'],
    [{ referencias: [{ fonteId: 'fonte-a', localizacao: '' }] }, 'localizacao obrigatória'],
    [{ fonteIds: ['fonte-a', 'fonte-a'] }, 'fonteIds não pode repetir fonte'],
    [{ fonteIds: ['fonte-a', 'fonte-b'] }, 'toda fonte de fonteIds exige uma referência'],
    [{ fonteIds: ['fonte-velha'], referencias: [{ fonteId: 'fonte-velha', localizacao: 'p. 1' }] }, 'fonte revogada'],
    [{ fonteIds: ['inexistente'], referencias: [{ fonteId: 'inexistente', localizacao: 'p. 1' }] }, 'não existe em fontes.json'],
    [{ criadoEm: '2026-02-30' }, 'criadoEm deve ser uma data válida'],
    [{ atualizadoEm: '10-11-2026' }, 'atualizadoEm deve ser uma data válida'],
    [{ criadoEm: '2026-11-11', atualizadoEm: '2026-11-10' }, 'atualizadoEm não pode ser anterior a criadoEm'],
    [{ alertas: [''] }, 'alertas deve ser uma lista'],
    [{ texto: `fale com ${EMAIL}` }, 'texto contém e-mail ou telefone'],
    [{ titulo: `fale com ${EMAIL}` }, 'titulo contém e-mail ou telefone'],
    [{ referencias: [{ fonteId: 'fonte-a', localizacao: EMAIL }] }, 'localizacao contém e-mail ou telefone'],
    [{ aviso: 'não previsto' }, 'campo não previsto'],
    [{ url: 'https://exemplo.org' }, 'url só é permitida em bloco do tipo link'],
    // limites (os mesmos de conhecimento.js)
    [{ titulo: 'a'.repeat(201) }, 'titulo excede o limite'],
    [{ texto: 'a'.repeat(2001) }, 'texto excede o limite'],
    [{ alertas: Array.from({ length: 11 }, () => 'a') }, 'alertas excede o limite'],
    [{ alertas: ['a'.repeat(301)] }, 'alerta excede o limite'],
    [{ referencias: [{ fonteId: 'fonte-a', localizacao: 'a'.repeat(201) }] }, 'localizacao excede o limite'],
    [{ fonteIds: Array.from({ length: 11 }, (_, i) => `f${i}`) }, 'fonteIds excede o limite'],
    // combinações incoerentes de estado, revisão e publicação
    [{ publicado: true }, 'combinação incoerente de estado'],
    [{ statusValidacao: 'validado', publicado: true }, 'combinação incoerente de estado'],
    [{ statusValidacao: 'rascunho', revisaoAtualidade: 'em_revisao' }, 'combinação incoerente de estado'],
    [{ statusValidacao: 'rascunho', revisaoAtualidade: 'concluida' }, 'combinação incoerente de estado'],
    [{ statusValidacao: 'em_validacao', revisaoAtualidade: 'concluida' }, 'combinação incoerente de estado'],
    [{ statusValidacao: 'em_validacao', revisaoAtualidade: 'em_revisao', publicado: true }, 'combinação incoerente de estado'],
    [{ statusValidacao: 'validado', revisaoAtualidade: 'pendente' }, 'combinação incoerente de estado'],
    [{ statusValidacao: 'validado', revisaoAtualidade: 'em_revisao', publicado: false }, 'combinação incoerente de estado'],
  ];
  for (const [mudanca, motivo] of recusados) {
    const e = erros(mudanca);
    assert.ok(e.some((m) => m.includes(motivo)), `${JSON.stringify(mudanca).slice(0, 80)} -> esperado "${motivo}"; obtido ${JSON.stringify(e)}`);
  }
  // evolução coerente é aceita (o bloco não precisa ficar em rascunho para sempre)
  const publicas = new Map(fontes().map((f) => [f.id, { ...f, publicado: true }]));
  assert.deepEqual(erros({ statusValidacao: 'em_validacao', revisaoAtualidade: 'pendente' }), []);
  assert.deepEqual(erros({ statusValidacao: 'em_validacao', revisaoAtualidade: 'em_revisao' }), []);
  assert.deepEqual(erros({ statusValidacao: 'validado', revisaoAtualidade: 'concluida', publicado: false }), []);
  assert.deepEqual(erros({ statusValidacao: 'validado', revisaoAtualidade: 'concluida', publicado: true }, publicas), []);
  // publicado exige fonte publicada
  assert.ok(erros({ statusValidacao: 'validado', revisaoAtualidade: 'concluida', publicado: true }).some((m) => m.includes('fonte não publicada')));
  // campos exclusivos de conhecimento em outro tipo
  const outro = { ...conteudoBase(), blocos: [{ ...BLOCO_TESTE, titulo: 'indevido' }] };
  assert.ok(validarConteudoAssistente(outro, { idServico: 'x', fontesPorId: mapa }).some((e) => e.includes('só é permitido em bloco do tipo conhecimento')));
});

test('limites do validador e da criação são os mesmos (fonte única)', () => {
  assert.equal(LIMITES, LIMITES_CONHECIMENTO);
  assert.deepEqual(LIMITES, { titulo: 200, texto: 2000, alerta: 300, alertas: 10, fontes: 10, localizacao: 200 });
});

test('nova versão: reinicia conhecimento, preserva a anterior e não toca nos demais blocos', () => {
  const base = conteudoBase();
  const publicado = {
    ...criar(base).bloco, statusValidacao: 'validado', publicado: true, revisaoAtualidade: 'concluida', atualizadoEm: '2026-11-11',
  };
  const anterior = { ...base, blocos: [{ ...BLOCO_TESTE }, publicado, { ...publicado, id: 'bc-2', publicado: false, statusValidacao: 'em_validacao', revisaoAtualidade: 'em_revisao' }] };
  const antes = congelar(anterior);
  const r = prepararBlocosParaNovaVersao(anterior, { data: '2026-11-20' });
  assert.equal(r.ok, true);
  assert.equal(r.reiniciados, 2);
  assert.equal(congelar(anterior), antes, 'versão anterior preservada');
  assert.deepEqual(r.conteudo.blocos[0], BLOCO_TESTE);
  for (const b of r.conteudo.blocos.slice(1)) {
    assert.equal(b.statusValidacao, 'rascunho');
    assert.equal(b.publicado, false);
    assert.equal(b.revisaoAtualidade, 'pendente');
    assert.equal(b.atualizadoEm, '2026-11-20');
    assert.equal(b.criadoEm, '2026-11-10');
    assert.deepEqual(b.referencias, publicado.referencias);
  }
  assert.deepEqual(r.conteudo.blocos.map((b) => b.id), ['x-limites', 'bc-1', 'bc-2']);
  assert.deepEqual(r.conteudo.autorizacao, anterior.autorizacao);
  assert.deepEqual(validarConteudoAssistente(r.conteudo, { idServico: 'x', fontesPorId: new Map(fontes().map((f) => [f.id, f])) }), []);
  assert.equal(prepararBlocosParaNovaVersao(anterior, { data: '20-11-2026' }).erro, 'data_invalida');
  assert.equal(prepararBlocosParaNovaVersao({}, { data: '2026-11-20' }).erro, 'conteudo_invalido');
});

test('nova versão (fluxo existente) a partir de versão congelada permite editar de novo', () => {
  const v1 = versao('publicado');
  const nova = criarNovaVersao(v1, { id: 'x-v2', criadoEm: '2026-11-20' }, [v1]);
  assert.equal(nova.ok, true);
  const preparado = prepararBlocosParaNovaVersao({ ...conteudoBase(), blocos: [{ ...BLOCO_TESTE }, criar().bloco] }, { data: '2026-11-20' });
  const r = montarBlocoConhecimento(nova.versao, preparado.conteudo, fontes(), entrada(), { id: 'bc-2', data: '2026-11-21' });
  assert.equal(r.ok, true);
});

test('chat público: conhecimento é entregue somente quando cumpre todas as regras de publicação', () => {
  const publicas = fontes().map((f) => ({ ...f, publicado: true }));
  const publicavel = { ...criar().bloco, statusValidacao: 'validado', publicado: true, revisaoAtualidade: 'concluida' };
  const dados = (mudanca = {}, fontesUsadas = publicas) => ({
    conteudo: { ...conteudoBase(), blocos: [{ ...BLOCO_TESTE }, { ...structuredClone(publicavel), ...mudanca }] }, fontes: fontesUsadas,
  });
  // o caso publicável é coerente para o validador e é entregue, só ele, sem os campos internos
  const mapa = new Map(publicas.map((f) => [f.id, f]));
  assert.deepEqual(validarConteudoAssistente(dados().conteudo, { idServico: 'x', fontesPorId: mapa }), []);
  const entregues = selecionarBlocosAssistente(dados(), 'publico');
  assert.deepEqual(entregues.map((b) => [b.id, b.tipo]), [['bc-1', 'conhecimento']]);
  assert.deepEqual(Object.keys(entregues[0]).sort(), ['ambiente', 'fonteIds', 'id', 'texto', 'tipo']);
  // cada condição que falta impede a entrega
  const impedimentos = {
    'publicado false': dados({ publicado: false }),
    'rascunho': dados({ statusValidacao: 'rascunho' }),
    'em validação': dados({ statusValidacao: 'em_validacao' }),
    'revisão pendente': dados({ revisaoAtualidade: 'pendente' }),
    'revisão em andamento': dados({ revisaoAtualidade: 'em_revisao' }),
    'ambiente teste_local': dados({ ambiente: 'teste_local' }),
    'fonte não publicada': dados({}, publicas.map((f) => ({ ...f, publicado: false }))),
    'fonte inexistente': dados({}, []),
    'fonte revogada': dados({ fonteIds: ['fonte-velha'], referencias: [{ fonteId: 'fonte-velha', localizacao: 'p. 1' }] }),
    'sem fonteIds': dados({ fonteIds: [] }),
  };
  for (const [motivo, d] of Object.entries(impedimentos)) {
    assert.equal(selecionarBlocosAssistente(d, 'publico').length, 0, motivo);
  }
  // estrutura de conhecimento: o seletor também exige origem "fonte", fonteIds e referências correspondentes
  const REF = (fonteId, localizacao = 'p. 1') => ({ fonteId, localizacao });
  const estrutura = {
    'regra_institucional': dados({ origem: 'regra_institucional', fonteIds: [], referencias: [] }),
    'regra_institucional com fonteIds': dados({ origem: 'regra_institucional' }),
    'fonteIds vazio': dados({ fonteIds: [] }),
    'fonteIds ausente': dados({ fonteIds: undefined }),
    'fonteIds repetidos': dados({ fonteIds: ['fonte-a', 'fonte-a'], referencias: [REF('fonte-a'), REF('fonte-a')] }),
    'referências ausentes': dados({ referencias: undefined }),
    'referências vazias': dados({ referencias: [] }),
    'referência de outra fonte': dados({ referencias: [REF('fonte-b')] }),
    'referência faltando para uma fonte': dados({ fonteIds: ['fonte-a', 'fonte-b'], referencias: [REF('fonte-a')] }),
    'referência repetida': dados({ fonteIds: ['fonte-a', 'fonte-b'], referencias: [REF('fonte-a'), REF('fonte-a', 'p. 2')] }),
    'referência extra': dados({ referencias: [REF('fonte-a'), REF('fonte-b')] }),
    'localização vazia': dados({ referencias: [REF('fonte-a', '  ')] }),
    'localização ausente': dados({ referencias: [{ fonteId: 'fonte-a' }] }),
    'referência que não é objeto': dados({ referencias: ['fonte-a'] }),
  };
  for (const [motivo, d] of Object.entries(estrutura)) {
    assert.equal(selecionarBlocosAssistente(d, 'publico').length, 0, motivo);
  }
  assert.equal(selecionarBlocosAssistente(dados(), 'publico').length, 1, 'o válido e publicável continua selecionado');
  // outros tipos não são afetados pela exigência de referências
  const outroTipo = { id: 'x-desc', tipo: 'descricao', texto: 'Descrição fictícia.', origem: 'fonte', fonteIds: ['fonte-a'], ambiente: 'publico', statusValidacao: 'validado', publicado: true, revisaoAtualidade: 'concluida' };
  assert.deepEqual(selecionarBlocosAssistente({ conteudo: { ...conteudoBase(), blocos: [outroTipo] }, fontes: publicas }, 'publico').map((b) => b.id), ['x-desc']);
  // uma das duas fontes não publicada também impede
  const duas = dados({ fonteIds: ['fonte-a', 'fonte-b'], referencias: [{ fonteId: 'fonte-a', localizacao: 'p. 1' }, { fonteId: 'fonte-b', localizacao: 'p. 2' }] });
  assert.equal(selecionarBlocosAssistente(duas, 'publico').length, 1);
  duas.fontes = publicas.map((f) => (f.id === 'fonte-b' ? { ...f, publicado: false } : f));
  assert.equal(selecionarBlocosAssistente(duas, 'publico').length, 0);
  // no modo de teste local nunca sai conhecimento (nem publicável)
  assert.deepEqual(selecionarBlocosAssistente(dados(), 'teste_local').map((b) => b.id), ['x-limites']);
});

test('edição recusada para status, revisão e publicação incompatíveis, sem alterar a entrada', () => {
  const c1 = criar().conteudo;
  const incompatíveis = [
    { statusValidacao: 'em_validacao' }, { statusValidacao: 'validado' }, { publicado: true },
    { revisaoAtualidade: 'em_revisao' }, { revisaoAtualidade: 'concluida' }, { revisaoAtualidade: undefined },
    { statusValidacao: undefined }, { publicado: undefined },
    { statusValidacao: 'validado', revisaoAtualidade: 'concluida', publicado: true },
  ];
  for (const mudanca of incompatíveis) {
    const c = structuredClone(c1);
    Object.assign(c.blocos[1], mudanca);
    const antes = congelar(c);
    const r = alterarBlocoConhecimento(versao(), c, fontes(), 'bc-1', entrada(), { data: '2026-11-12' });
    assert.equal(r.erro, 'bloco_nao_editavel', JSON.stringify(mudanca));
    assert.equal(congelar(c), antes);
  }
  assert.equal(alterarBlocoConhecimento(versao(), c1, fontes(), 'bc-1', entrada(), { data: '2026-11-12' }).ok, true);
  assert.equal(alterarBlocoConhecimento(versao('em_validacao'), c1, fontes(), 'bc-1', entrada(), { data: '2026-11-12' }).erro, 'versao_nao_editavel');
});

test('chat: blocos de conhecimento em rascunho não são entregues em nenhum modo; os cinco de teste_local seguem intactos', () => {
  const real = JSON.parse(fs.readFileSync(ARQUIVO_LAC, 'utf8'));
  const idsReais = real.blocos.map((b) => b.id);
  assert.equal(idsReais.length, 5);
  const fontesReais = JSON.parse(fs.readFileSync(path.join(RAIZ, 'services', 'lac', 'versoes', 'v1', 'fontes.json'), 'utf8')).fontes;
  const copia = structuredClone(real);
  const r = montarBlocoConhecimento(versao(), copia, fontesReais, entrada({ fonteIds: ['sema-orientacoes-lac'], referencias: [{ fonteId: 'sema-orientacoes-lac', localizacao: 'Seção fictícia' }] }), { id: 'bc-ficticio', data: '2026-11-10' });
  assert.equal(r.ok, true, JSON.stringify(r));
  const dados = { conteudo: r.conteudo, fontes: fontesReais };
  assert.equal(selecionarBlocosAssistente(dados, 'publico').length, 0);
  const teste = selecionarBlocosAssistente(dados, 'teste_local');
  assert.deepEqual(teste.map((b) => b.id), idsReais);
  assert.equal(teste.some((b) => b.tipo === 'conhecimento'), false);
  assert.deepEqual(r.conteudo.blocos.slice(0, 5), real.blocos);
  assert.equal(selecionarBlocosAssistente({ conteudo: real, fontes: fontesReais }, 'publico').length, 0);
});

test('nenhum dado real da LAC foi alterado', () => {
  assert.equal(hashDoArquivo(), HASH_INICIAL);
});
