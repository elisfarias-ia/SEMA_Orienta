// Passo 4B1 (correção): reutilização de links entre serviços e proteção do MCP contra fonte textual não publicada.
// Tudo em cópias temporárias com dados fictícios; a base real nunca é gravada.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buscarLinksReutilizaveis, criarCopiaDeLink, fonteReutilizavel } from '../services/admin/reutilizacao.js';
import { criarGravadorEntradas } from '../services/admin/entradas-gravacao.js';
import { criarFerramentas } from '../scripts/mcp/ferramentas.js';
import { validarFontes } from '../scripts/validate-services.js';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PASTA_LAC = ['services', 'lac', 'versoes', 'v1'];
const TEXTO = 'CANARIO-REUTILIZACAO-ORIENTACAO-FICTICIA-5521 que não pode sair da administração.';
const TITULO_TEXTO = 'Titulo fictício da fonte textual';
const DESCRICAO_TEXTO = 'Descricao fictícia da fonte textual rascunho';

const lerJson = (...p) => JSON.parse(fs.readFileSync(path.join(...p), 'utf8'));
const gravarJson = (arq, doc) => fs.writeFileSync(arq, `${JSON.stringify(doc, null, 2)}\n`);

/** Hash de todos os arquivos de uma pasta (caminho + bytes), para provar que nada foi alterado. */
function hashDaPasta(dir) {
  const h = crypto.createHash('sha256');
  const andar = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) andar(p);
      else h.update(path.relative(dir, p)).update(fs.readFileSync(p));
    }
  };
  andar(dir);
  return h.digest('hex');
}

/** Cópia temporária de services/ com o serviço "destino" (clone vazio da estrutura da LAC, sem fontes) registrado. */
function comBaseTemporaria(fn) {
  const pai = fs.mkdtempSync(path.join(os.tmpdir(), 'sema-orienta-reuso-'));
  const raiz = path.join(pai, 'raiz');
  fs.mkdirSync(raiz);
  fs.cpSync(path.join(RAIZ, 'services'), path.join(raiz, 'services'), { recursive: true });
  const pastaDestino = path.join(raiz, 'services', 'destino', 'versoes', 'v1');
  fs.cpSync(path.join(raiz, ...PASTA_LAC), pastaDestino, { recursive: true });
  const manifesto = lerJson(pastaDestino, 'versao.json');
  manifesto.id = 'destino-v1';
  manifesto.servicoId = 'destino';
  for (const k of Object.keys(manifesto.arquivos)) manifesto.arquivos[k] = manifesto.arquivos[k].replace('services/lac/', 'services/destino/');
  gravarJson(path.join(pastaDestino, 'versao.json'), manifesto);
  gravarJson(path.join(pastaDestino, 'fontes.json'), { statusValidacao: 'rascunho', fontes: [] });
  const registroArq = path.join(raiz, 'services', 'registry.json');
  const registro = lerJson(registroArq);
  registro.servicos.push({ ...registro.servicos[0], id: 'destino', arquivo: 'services/destino/versoes/v1/service.json', versaoAtualId: 'destino-v1' });
  gravarJson(registroArq, registro);
  try {
    return fn({ raiz, pastaDestino });
  } finally {
    fs.rmSync(pai, { recursive: true, force: true });
  }
}

const fonteLac = (id) => lerJson(RAIZ, ...PASTA_LAC, 'fontes.json').fontes.find((f) => f.id === id);
const origemDe = (id) => ({ servicoId: 'lac', versaoId: 'lac-v1', fonte: fonteLac(id) });
const contextoDestino = (fontes = [], estadoVersao = 'rascunho') => ({ servicoId: 'destino', estadoVersao, documentoFontes: { statusValidacao: 'rascunho', fontes } });

function congelar(o) {
  if (o && typeof o === 'object') {
    Object.freeze(o);
    for (const v of Object.values(o)) congelar(v);
  }
  return o;
}

test('R1. a busca lista só links validados e não revogados de OUTROS serviços, sem alterar a origem', () => {
  comBaseTemporaria(({ raiz }) => {
    const antes = hashDaPasta(path.join(raiz, 'services'));
    const r = buscarLinksReutilizaveis(raiz, 'destino');
    assert.equal(r.ok, true);
    const ids = r.itens.map((i) => i.fonteId).sort();
    // As 8 fontes da LAC são validadas e não publicadas; só a norma revogada fica de fora (publicação não é exigida).
    assert.equal(ids.length, 7);
    assert.ok(!ids.includes('decreto-695-2020'));
    assert.ok(ids.includes('sema-orientacoes-lac'));
    for (const i of r.itens) {
      assert.deepEqual([i.servicoId, i.versaoId], ['lac', 'lac-v1']);
      assert.equal(i.jaNoServico, false);
      assert.match(i.url, /^https:\/\//);
    }
    // Serviço de destino nunca aparece como origem.
    assert.equal(buscarLinksReutilizaveis(raiz, 'lac').itens.length, 0);
    assert.equal(hashDaPasta(path.join(raiz, 'services')), antes);
  });
});

test('R2. a busca filtra por texto e marca a URL já cadastrada no destino; destino inexistente é recusado', () => {
  comBaseTemporaria(({ raiz, pastaDestino }) => {
    const manual = buscarLinksReutilizaveis(raiz, 'destino', 'MANUAL');
    assert.deepEqual(manual.itens.map((i) => i.fonteId), ['manual-lac-siga-2020']);
    assert.equal(buscarLinksReutilizaveis(raiz, 'destino', 'inexistente-xyz').itens.length, 0);
    const copia = criarCopiaDeLink(origemDe('manual-lac-siga-2020'), contextoDestino());
    gravarJson(path.join(pastaDestino, 'fontes.json'), copia.documentoFontes);
    const depois = buscarLinksReutilizaveis(raiz, 'destino', 'manual');
    assert.equal(depois.itens[0].jaNoServico, true);
    assert.equal(buscarLinksReutilizaveis(raiz, 'nao-existe').ok, false);
  });
});

test('R3. fonte textual (inclusive validada à força), não validada e revogada não são reutilizáveis', async () => {
  const link = fonteLac('sema-orientacoes-lac');
  assert.equal(fonteReutilizavel(link), true);
  assert.equal(fonteReutilizavel({ ...link, formaEntrada: 'texto', tipo: 'texto_cadastrado', url: null }), false);
  assert.equal(fonteReutilizavel({ ...link, tipo: 'texto_cadastrado' }), false);
  assert.equal(fonteReutilizavel({ ...link, entradaId: 'x' }), false);
  assert.equal(fonteReutilizavel({ ...link, statusValidacao: 'rascunho' }), false);
  assert.equal(fonteReutilizavel({ ...link, statusValidacao: 'em_validacao' }), false);
  assert.equal(fonteReutilizavel({ ...link, vigencia: { ...link.vigencia, situacao: 'revogada' } }), false);
  assert.equal(fonteReutilizavel({ ...link, url: 'http://inseguro.example.org' }), false);
  assert.equal(fonteReutilizavel(null), false);
  // A fonte textual gravada de verdade em outro serviço não aparece na busca.
  const pai = fs.mkdtempSync(path.join(os.tmpdir(), 'sema-orienta-reuso-txt-'));
  const raiz = path.join(pai, 'raiz');
  fs.mkdirSync(raiz);
  fs.cpSync(path.join(RAIZ, 'services'), path.join(raiz, 'services'), { recursive: true });
  try {
    const g = await criarGravadorEntradas({ raiz, agora: () => new Date(2026, 10, 10) }).gravarEntradaTexto('lac', { titulo: TITULO_TEXTO, texto: TEXTO, descricao: DESCRICAO_TEXTO });
    assert.equal(g.ok, true);
    const fontes = lerJson(raiz, ...PASTA_LAC, 'fontes.json').fontes;
    assert.equal(fontes.length, 9);
    assert.ok(fontes.some((f) => f.formaEntrada === 'texto'));
  } finally {
    fs.rmSync(pai, { recursive: true, force: true });
  }
});

test('R4. a cópia nasce em rascunho, com id novo, URL preservada e todos os campos de revisão reiniciados', () => {
  const origem = congelar(origemDe('lei-complementar-668-2020'));
  const contexto = congelar(contextoDestino());
  const r = criarCopiaDeLink(origem, contexto);
  assert.equal(r.ok, true);
  const o = origem.fonte;
  const f = r.fonte;
  assert.equal(f.url, o.url);
  assert.equal(f.titulo, o.titulo);
  assert.equal(f.tipo, o.tipo);
  assert.equal(f.orgaoResponsavel, o.orgaoResponsavel);
  assert.equal(f.descricao, o.descricao);
  assert.equal(f.origemOficial, o.origemOficial); // procedência apenas, não validação
  assert.equal(f.dataPublicacao, o.dataPublicacao);
  assert.equal(f.dispositivoRelevante, o.dispositivoRelevante);
  assert.equal(f.formaEntrada, 'link');
  // Reiniciados:
  assert.equal(f.statusValidacao, 'rascunho');
  assert.equal(f.publicado, false);
  assert.equal(f.dataConsulta, null);
  assert.notEqual(o.dataConsulta, null);
  assert.deepEqual(f.vigencia, { situacao: 'a_confirmar', normasRelacionadas: [], observacao: null });
  assert.deepEqual(f.reutilizadaDe, { servicoId: 'lac', versaoId: 'lac-v1', fonteId: 'lei-complementar-668-2020' });
  assert.deepEqual(Object.keys(f.reutilizadaDe).sort(), ['fonteId', 'servicoId', 'versaoId']);
  assert.deepEqual(r.documentoFontes.fontes, [f]);
  assert.deepEqual(validarFontes(r.documentoFontes, 'destino'), []);
  // Link que não é legislação nasce "nao_se_aplica".
  const m = criarCopiaDeLink(origemDe('manual-lac-siga-2020'), contextoDestino());
  assert.equal(m.fonte.vigencia.situacao, 'nao_se_aplica');
});

test('R5. id novo sem colisão e cópia de cópia registra a fonte efetivamente selecionada', () => {
  const primeira = criarCopiaDeLink(origemDe('manual-lac-siga-2020'), contextoDestino());
  const idBase = primeira.fonte.id;
  assert.match(idBase, /^[a-z][a-z0-9-]*$/);
  // Outro serviço já tem uma fonte com o mesmo id, mas URL diferente: o id é gerado de novo.
  const existente = { ...fonteLac('faq-lac-2022'), id: idBase, url: 'https://exemplo.invalid/outra' };
  const segunda = criarCopiaDeLink(origemDe('manual-lac-siga-2020'), contextoDestino([existente]));
  assert.equal(segunda.ok, true);
  assert.equal(segunda.fonte.id, `${idBase}-2`);
  // A cópia, uma vez validada em "destino", vira origem de outro serviço: a linhagem aponta para ELA, sem modificar a anterior.
  const validada = { ...primeira.fonte, statusValidacao: 'validado', dataConsulta: '2026-11-10' };
  const congelada = congelar(structuredClone(validada));
  const terceira = criarCopiaDeLink({ servicoId: 'destino', versaoId: 'destino-v1', fonte: congelada }, { servicoId: 'outro', estadoVersao: 'rascunho', documentoFontes: { statusValidacao: 'rascunho', fontes: [] } });
  assert.equal(terceira.ok, true);
  assert.deepEqual(terceira.fonte.reutilizadaDe, { servicoId: 'destino', versaoId: 'destino-v1', fonteId: validada.id });
  assert.deepEqual(congelada, validada);
});

test('R6. a cópia é recusada: mesmo serviço, texto, não validada, revogada, URL duplicada e versão congelada', () => {
  const erro = (origem, contexto) => criarCopiaDeLink(origem, contexto).erro;
  assert.equal(erro({ ...origemDe('sema-orientacoes-lac'), servicoId: 'destino' }, contextoDestino()), 'mesmo_servico');
  const texto = { ...fonteLac('sema-orientacoes-lac'), formaEntrada: 'texto', tipo: 'texto_cadastrado', url: null };
  assert.equal(erro({ ...origemDe('sema-orientacoes-lac'), fonte: texto }, contextoDestino()), 'fonte_nao_reutilizavel');
  assert.equal(erro({ ...origemDe('sema-orientacoes-lac'), fonte: { ...fonteLac('sema-orientacoes-lac'), statusValidacao: 'rascunho' } }, contextoDestino()), 'fonte_nao_reutilizavel');
  assert.equal(erro(origemDe('decreto-695-2020'), contextoDestino()), 'fonte_nao_reutilizavel');
  const ja = criarCopiaDeLink(origemDe('manual-lac-siga-2020'), contextoDestino()).fonte;
  assert.equal(erro(origemDe('manual-lac-siga-2020'), contextoDestino([ja])), 'url_duplicada');
  for (const estado of ['em_validacao', 'publicado', 'autorizado_publicacao']) {
    assert.equal(erro(origemDe('manual-lac-siga-2020'), contextoDestino([], estado)), 'versao_nao_editavel', estado);
  }
  assert.throws(() => criarCopiaDeLink(null, contextoDestino()), /contexto_invalido/);
});

test('R7. o validador aceita reutilizadaDe só em link e só com os três ids', () => {
  const base = criarCopiaDeLink(origemDe('manual-lac-siga-2020'), contextoDestino()).fonte;
  const valida = (fonte) => validarFontes({ statusValidacao: 'rascunho', fontes: [fonte] }, 'f');
  assert.deepEqual(valida(base), []);
  const { reutilizadaDe, ...semLinhagem } = base;
  assert.ok(reutilizadaDe);
  assert.deepEqual(valida(semLinhagem), []);
  for (const ruim of [
    { servicoId: 'lac', versaoId: 'lac-v1' },
    { ...base.reutilizadaDe, extra: 'x' },
    { ...base.reutilizadaDe, fonteId: 'Inválido' },
    { ...base.reutilizadaDe, versaoId: 7 },
    'lac',
    null,
    [],
  ]) {
    assert.ok(valida({ ...base, reutilizadaDe: ruim }).some((e) => e.includes('reutilizadaDe')), JSON.stringify(ruim));
  }
  const textual = { ...criarTextual(), reutilizadaDe: base.reutilizadaDe };
  assert.ok(valida(textual).some((e) => e.includes('campo não previsto')));
});

function criarTextual() {
  return {
    id: 't1', titulo: 'T', tipo: 'texto_cadastrado', formaEntrada: 'texto', entradaId: 'e1', orgaoResponsavel: null, url: null, descricao: '',
    origemOficial: false, statusValidacao: 'rascunho', publicado: false, dataPublicacao: null, dataConsulta: null, dispositivoRelevante: null,
    vigencia: { situacao: 'nao_se_aplica', normasRelacionadas: [], observacao: null },
  };
}

test('R8. MCP: fonte textual em rascunho some por completo (título, descrição, texto, id e filtros); links seguem iguais', async () => {
  const pai = fs.mkdtempSync(path.join(os.tmpdir(), 'sema-orienta-reuso-mcp-'));
  const raiz = path.join(pai, 'raiz');
  fs.mkdirSync(raiz);
  fs.cpSync(path.join(RAIZ, 'services'), path.join(raiz, 'services'), { recursive: true });
  try {
    const semTexto = JSON.parse(JSON.stringify(criarFerramentas({ raiz }).chamar("consultar_fontes", { servicoId: "lac" })));
    const g = await criarGravadorEntradas({ raiz, agora: () => new Date(2026, 10, 10) }).gravarEntradaTexto('lac', { titulo: TITULO_TEXTO, texto: TEXTO, descricao: DESCRICAO_TEXTO });
    assert.equal(g.ok, true);
    const ferramentas = criarFerramentas({ raiz });
    const comTexto = ferramentas.chamar('consultar_fontes', { servicoId: 'lac' });
    const serial = JSON.stringify(comTexto);
    for (const proibido of ['CANARIO', TITULO_TEXTO, DESCRICAO_TEXTO, 'texto_cadastrado', g.fonteId ?? '__sem__']) assert.ok(!serial.includes(proibido), proibido);
    // Comportamento atual preservado para links: mesma lista e mesmo total.
    assert.equal(comTexto.dados.total, 8);
    assert.deepEqual(comTexto.dados.fontes, semTexto.dados.fontes);
    const idTexto = lerJson(raiz, ...PASTA_LAC, 'fontes.json').fontes.find((f) => f.formaEntrada === 'texto').id;
    assert.ok(!serial.includes(idTexto));
    const porId = ferramentas.chamar('consultar_fontes', { servicoId: 'lac', fonteId: idTexto });
    assert.equal(porId.isError, true);
    assert.equal(porId.dados.erro, 'fonte_nao_encontrada');
    for (const args of [{ servicoId: 'lac', tipo: 'texto_cadastrado' }, { servicoId: 'lac', statusValidacao: 'rascunho' }]) {
      const r = ferramentas.chamar('consultar_fontes', args);
      assert.equal(r.dados.total, 0, JSON.stringify(args));
      assert.ok(!JSON.stringify(r).includes(TITULO_TEXTO));
    }
    for (const [nome, args] of [['listar_assuntos', {}], ['listar_servicos', {}], ['resumir_base', {}]]) {
      const t = JSON.stringify(ferramentas.chamar(nome, args));
      for (const proibido of ['CANARIO', TITULO_TEXTO, DESCRICAO_TEXTO]) assert.ok(!t.includes(proibido), `${nome} ${proibido}`);
    }
  } finally {
    fs.rmSync(pai, { recursive: true, force: true });
  }
});
