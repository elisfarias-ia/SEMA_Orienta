// Testes do cadastro das oito fontes da LAC.
// "Validado" = identidade, procedência e metadados conferidos. Não significa vigência confirmada nem publicação.
// Dados de teste ficam em memória ou em cópias temporárias; os arquivos reais nunca são alterados.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validarServicos, validarFontes, analisarUrl } from '../scripts/validate-services.js';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lerJson = (...partes) => JSON.parse(fs.readFileSync(path.join(RAIZ, ...partes), 'utf8'));
const lerTexto = (...partes) => fs.readFileSync(path.join(RAIZ, ...partes), 'utf8');
const arquivoReal = () => lerJson('services', 'lac', 'fontes.json');
const fonteReal = (id) => arquivoReal().fontes.find((f) => f.id === id);

const IDS_ESPERADOS = [
  'sema-orientacoes-lac',
  'lei-complementar-668-2020',
  'decreto-695-2020',
  'decreto-1268-2022',
  'decreto-1585-2022',
  'tr-176-lac',
  'manual-lac-siga-2020',
  'faq-lac-2022',
];
const IDS_DOCUMENTAIS = ['tr-176-lac', 'manual-lac-siga-2020', 'faq-lac-2022'];

function comCopia(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sema-orienta-fontes-'));
  fs.cpSync(path.join(RAIZ, 'services'), path.join(dir, 'services'), { recursive: true });
  const editarJson = (rel, editar) => {
    const arquivo = path.join(dir, rel);
    const dados = JSON.parse(fs.readFileSync(arquivo, 'utf8'));
    editar(dados);
    fs.writeFileSync(arquivo, JSON.stringify(dados, null, 2));
  };
  try {
    return fn({ dir, editarJson });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

const vig = (situacao, normasRelacionadas = []) => ({ situacao, normasRelacionadas, observacao: null });
const base = (extra) => ({
  titulo: 'Fonte de teste',
  orgaoResponsavel: 'Órgão de teste',
  descricao: 'Dado temporário de teste.',
  origemOficial: true,
  statusValidacao: 'validado',
  publicado: false,
  dataPublicacao: null,
  dataConsulta: '2026-01-01',
  dispositivoRelevante: null,
  ...extra,
});
const documento = (id, url, vigencia = vig('nao_se_aplica')) =>
  base({ id, tipo: 'manual', url: `https://exemplo.test/${url}`, vigencia });
const lei = (id, url) => base({ id, tipo: 'legislacao', url: `https://exemplo.test/${url}`, vigencia: vig('vigente') });
const arquivo = (fontes) => ({ serviceId: 'lac', statusValidacao: 'em_validacao', fontes, pendencia: 'PENDENTE: teste' });

test('1. há oito fontes cadastradas, com os ids esperados', () => {
  const { fontes } = arquivoReal();
  assert.equal(fontes.length, 8);
  assert.deepEqual(fontes.map((f) => f.id), IDS_ESPERADOS);
});

test('2. os ids das fontes são únicos', () => {
  const ids = arquivoReal().fontes.map((f) => f.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('3. todas as oito fontes têm statusValidacao validado', () => {
  assert.ok(arquivoReal().fontes.every((f) => f.statusValidacao === 'validado'));
});

test('4. todas as fontes têm origemOficial true', () => {
  assert.ok(arquivoReal().fontes.every((f) => f.origemOficial === true));
});

test('5. nenhuma fonte está publicada', () => {
  assert.ok(arquivoReal().fontes.every((f) => f.publicado === false));
});

test('6. todas as URLs usam HTTPS e são válidas', () => {
  for (const fonte of arquivoReal().fontes) {
    assert.ok(fonte.url.startsWith('https://'), fonte.url);
    assert.equal(analisarUrl(fonte.url).ok, true, fonte.url);
  }
});

test('7. as três novas fontes documentais existem, com tipo e órgão corretos', () => {
  const tr = fonteReal('tr-176-lac');
  const manual = fonteReal('manual-lac-siga-2020');
  const faq = fonteReal('faq-lac-2022');
  assert.equal(tr.tipo, 'outro');
  assert.equal(manual.tipo, 'manual');
  assert.equal(faq.tipo, 'outro');
  for (const fonte of [tr, manual, faq]) {
    assert.equal(fonte.orgaoResponsavel, 'Secretaria de Estado de Meio Ambiente de Mato Grosso - SEMA-MT');
    assert.equal(fonte.vigencia.situacao, 'nao_se_aplica');
    assert.equal(fonte.dataConsulta, fonte.id === 'tr-176-lac' ? '2026-11-09' : '2026-11-05');
  }
});

test('8. as datas de publicação estão corretas', () => {
  const esperadas = {
    'sema-orientacoes-lac': '2020-11-24',
    'lei-complementar-668-2020': '2020-07-27',
    'decreto-695-2020': '2020-10-29',
    'decreto-1268-2022': '2022-01-25',
    'decreto-1585-2022': '2022-12-22',
    'tr-176-lac': '2020-12-07',
    'manual-lac-siga-2020': '2020-11-30',
    'faq-lac-2022': '2022-05-31',
  };
  for (const [id, data] of Object.entries(esperadas)) assert.equal(fonteReal(id).dataPublicacao, data, id);
});

test('9. service.json referencia as oito fontes por id (links e legislacao)', () => {
  const servico = lerJson('services', 'lac', 'service.json');
  assert.deepEqual(servico.links, ['sema-orientacoes-lac', ...IDS_DOCUMENTAIS]);
  assert.deepEqual(servico.legislacao, [
    'lei-complementar-668-2020',
    'decreto-695-2020',
    'decreto-1268-2022',
    'decreto-1585-2022',
  ]);
  const referenciadas = new Set([...servico.links, ...servico.legislacao]);
  assert.deepEqual([...referenciadas].sort(), [...IDS_ESPERADOS].sort());
});

test('10. as fontes documentais não aparecem em legislacao', () => {
  const { legislacao } = lerJson('services', 'lac', 'service.json');
  for (const id of IDS_DOCUMENTAIS) assert.equal(legislacao.includes(id), false, id);
  assert.equal(legislacao.includes('sema-orientacoes-lac'), false);
});

test('11. o Decreto nº 695/2020 continua revogado, relacionado ao Decreto nº 1.268/2022', () => {
  const decreto = fonteReal('decreto-695-2020');
  assert.equal(decreto.vigencia.situacao, 'revogada');
  assert.deepEqual(decreto.vigencia.normasRelacionadas, ['decreto-1268-2022']);
});

test('11b. as demais situações de vigência foram preservadas', () => {
  assert.equal(fonteReal('lei-complementar-668-2020').vigencia.situacao, 'a_confirmar');
  assert.equal(fonteReal('decreto-1268-2022').vigencia.situacao, 'alterada');
  assert.equal(fonteReal('decreto-1585-2022').vigencia.situacao, 'a_confirmar');
  assert.equal(fonteReal('sema-orientacoes-lac').vigencia.situacao, 'nao_se_aplica');
});

test('12. o Decreto nº 695/2020 não pode ser publicado (cópia temporária)', () => {
  comCopia(({ dir, editarJson }) => {
    editarJson('services/lac/fontes.json', (f) => {
      f.fontes.find((x) => x.id === 'decreto-695-2020').publicado = true;
    });
    const { erros } = validarServicos(dir);
    assert.ok(erros.some((e) => /revogada não pode estar publicada/.test(e)), erros.join('\n'));
  });
});

test('13. fonte validada não é publicada automaticamente', () => {
  assert.deepEqual(validarFontes(arquivo([documento('a', 'a')])), []);
  assert.ok(arquivoReal().fontes.every((f) => f.statusValidacao === 'validado' && f.publicado === false));
});

test('14. fonte com vigência a_confirmar não pode ser publicada', () => {
  const erros = validarFontes(arquivo([{ ...lei('n', 'n'), vigencia: vig('a_confirmar'), publicado: true }]));
  assert.ok(erros.some((e) => /a_confirmar não pode estar publicada/.test(e)), erros.join('\n'));
  for (const id of ['lei-complementar-668-2020', 'decreto-1585-2022']) {
    assert.equal(fonteReal(id).publicado, false, id);
  }
});

test('15. fonte não legislativa pode relacionar uma legislação existente', () => {
  const erros = validarFontes(arquivo([lei('lei-1', 'lei'), documento('doc-1', 'doc', vig('nao_se_aplica', ['lei-1']))]));
  assert.deepEqual(erros, []);
  assert.deepEqual(fonteReal('faq-lac-2022').vigencia.normasRelacionadas, ['decreto-1268-2022']);
  assert.equal(fonteReal('faq-lac-2022').vigencia.situacao, 'nao_se_aplica');
});

test('16. fonte não legislativa não pode relacionar outra fonte não legislativa', () => {
  const erros = validarFontes(arquivo([documento('doc-1', 'um'), documento('doc-2', 'dois', vig('nao_se_aplica', ['doc-1']))]));
  assert.ok(erros.some((e) => /só pode relacionar fontes do tipo legislacao/.test(e)), erros.join('\n'));
});

test('16b. fonte não legislativa não pode relacionar a si mesma nem fonte inexistente', () => {
  const propria = validarFontes(arquivo([documento('doc-1', 'um', vig('nao_se_aplica', ['doc-1']))]));
  assert.ok(propria.some((e) => /não pode citar a própria fonte/.test(e)), propria.join('\n'));
  const inexistente = validarFontes(arquivo([documento('doc-1', 'um', vig('nao_se_aplica', ['nao-existe']))]));
  assert.ok(inexistente.some((e) => /cita fonte inexistente "nao-existe"/.test(e)), inexistente.join('\n'));
});

test('16c. fonte não legislativa continua exigindo nao_se_aplica mesmo ao relacionar legislação', () => {
  const erros = validarFontes(arquivo([lei('lei-1', 'lei'), documento('doc-1', 'doc', vig('vigente', ['lei-1']))]));
  assert.ok(erros.some((e) => /não é legislação deve usar vigencia nao_se_aplica/.test(e)), erros.join('\n'));
});

test('16d. a base real rejeita relacionar o FAQ a outra fonte documental (cópia temporária)', () => {
  comCopia(({ dir, editarJson }) => {
    editarJson('services/lac/fontes.json', (f) => {
      f.fontes.find((x) => x.id === 'faq-lac-2022').vigencia.normasRelacionadas = ['manual-lac-siga-2020'];
    });
    const { erros } = validarServicos(dir);
    assert.ok(erros.some((e) => /só pode relacionar fontes do tipo legislacao/.test(e)), erros.join('\n'));
  });
});

test('17. perguntas frequentes continuam sem conteúdo (roteiro e documentos foram cadastrados nos Passos 1 e 2)', () => {
  assert.deepEqual(lerJson('services', 'lac', 'perguntas-frequentes.json').perguntas, []);
});

test('18. o serviço está em validação e não publicado, sem responsável nem data de revisão', () => {
  const servico = lerJson('services', 'lac', 'service.json');
  assert.equal(servico.statusValidacao, 'em_validacao');
  assert.equal(servico.publicado, false);
  assert.equal(servico.unidadeResponsavel, 'PENDENTE');
  assert.equal(servico.responsavelValidacao, null);
  assert.equal(servico.dataRevisao, null);
  const registro = lerJson('services', 'registry.json').servicos[0];
  assert.equal(registro.statusValidacao, 'em_validacao');
  assert.equal(registro.publicado, false);
});

test('conjunto de fontes está em validação e a pendência não diz que não há fontes', () => {
  const doc = arquivoReal();
  assert.equal(doc.statusValidacao, 'em_validacao');
  assert.match(doc.pendencia, /^PENDENTE/);
  assert.doesNotMatch(doc.pendencia, /cadastrar e validar as fontes/);
});

test('a base real, com as oito fontes, passa na validação', () => {
  assert.deepEqual(validarServicos(RAIZ).erros, []);
});

test('o validador rejeita publicar o serviço com fontes não publicadas (cópia temporária)', () => {
  comCopia(({ dir, editarJson }) => {
    editarJson('services/registry.json', (r) => {
      r.servicos[0].publicado = true;
      r.servicos[0].statusValidacao = 'validado';
    });
    editarJson('services/lac/service.json', (s) => {
      s.publicado = true;
      s.statusValidacao = 'validado';
    });
    const { erros } = validarServicos(dir);
    assert.ok(erros.some((e) => /serviço publicado não pode referenciar a fonte/.test(e)), erros.join('\n'));
  });
});

test('os dados reais não contêm conteúdo do TR, do manual ou do FAQ (taxa, prazos, limites, contatos)', () => {
  const texto = ['fontes.json', 'service.json', 'documentos.json', 'perguntas-frequentes.json', 'roteiro.md']
    .map((nome) => lerTexto('services', 'lac', nome))
    .join('\n');
  assert.doesNotMatch(texto, /\bUPFs?\b|\b1 ?MB\b|dois dias|dez dias|e-?SAC|@[a-z0-9.-]+\.[a-z]{2,}|\(\d{2}\)\s?\d{4,5}-?\d{4}/i);
});
