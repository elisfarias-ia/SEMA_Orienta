// Catálogo de assuntos e vínculo dos serviços (Marco 7, Passo 7A). Assunto ≠ serviço.
// Falhas são provocadas em cópias temporárias; os arquivos reais nunca são alterados.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validarAssuntos, validarServicos } from '../scripts/validate-services.js';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lerJson = (...partes) => JSON.parse(fs.readFileSync(path.join(RAIZ, ...partes), 'utf8'));

function comCopia(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sema-orienta-assuntos-'));
  fs.cpSync(path.join(RAIZ, 'services'), path.join(dir, 'services'), { recursive: true });
  const editarJson = (rel, f) => {
    const arquivo = path.join(dir, rel);
    const dados = JSON.parse(fs.readFileSync(arquivo, 'utf8'));
    f(dados);
    fs.writeFileSync(arquivo, JSON.stringify(dados, null, 2));
  };
  try {
    return fn({ dir, editarJson });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
const temErro = (erros, padrao) => assert.ok(erros.some((e) => padrao.test(e)), erros.join('\n') || '(sem erros)');
const catalogo = (...assuntos) => ({ versaoEstrutura: 1, assuntos });
const assuntoOk = (extra = {}) => ({
  id: 'licenciamento-ambiental', nome: 'Licenciamento Ambiental', descricao: 'Área de teste.', ativo: true,
  criadoEm: '2026-11-09', atualizadoEm: '2026-11-09', ...extra,
});

test('A1. o catálogo real tem só "Licenciamento Ambiental", ativo, e passa na validação', () => {
  const doc = lerJson('services', 'assuntos.json');
  assert.equal(doc.assuntos.length, 1);
  const [a] = doc.assuntos;
  assert.equal(a.id, 'licenciamento-ambiental');
  assert.equal(a.nome, 'Licenciamento Ambiental');
  assert.equal(a.ativo, true);
  assert.match(a.criadoEm, /^\d{4}-\d{2}-\d{2}$/);
  assert.deepEqual(validarAssuntos(doc).erros, []);
});

test('A2. a LAC aponta para o assunto no registro e no service.json (mesmo id), sem mudar seus status', () => {
  const registro = lerJson('services', 'registry.json').servicos[0];
  const servico = lerJson('services', 'lac', 'service.json');
  assert.equal(registro.assuntoId, 'licenciamento-ambiental');
  assert.equal(servico.assuntoId, 'licenciamento-ambiental');
  assert.equal(registro.statusValidacao, 'em_validacao');
  assert.equal(registro.publicado, false);
  assert.equal(servico.statusValidacao, 'em_validacao');
  assert.equal(servico.publicado, false);
  const { erros, servicos } = validarServicos(RAIZ);
  assert.deepEqual(erros, []);
  assert.deepEqual(servicos, ['lac']);
});

test('A3. o catálogo não carrega estados do fluxo de versões nem validação material', () => {
  const texto = fs.readFileSync(path.join(RAIZ, 'services', 'assuntos.json'), 'utf8');
  assert.doesNotMatch(texto, /validado_materialmente|autorizado_publicacao|ajustes_solicitados|publicado/);
});

test('A4. falha com ids de assunto duplicados', () => {
  const { erros } = validarAssuntos(catalogo(assuntoOk(), assuntoOk({ nome: 'Outro' })));
  temErro(erros, /identificador duplicado/);
});

test('A5. falha com campos obrigatórios ausentes ou inválidos', () => {
  temErro(validarAssuntos(catalogo(assuntoOk({ nome: '' }))).erros, /"nome" obrigatório/);
  temErro(validarAssuntos(catalogo(assuntoOk({ descricao: '   ' }))).erros, /"descricao" obrigatório/);
  temErro(validarAssuntos(catalogo(assuntoOk({ ativo: 'sim' }))).erros, /"ativo" deve ser booleano/);
  temErro(validarAssuntos(catalogo(assuntoOk({ id: 'Licenciamento Ambiental' }))).erros, /id inválido/);
  temErro(validarAssuntos(catalogo(assuntoOk({ criadoEm: '09/11/2026' }))).erros, /criadoEm deve ser uma data válida/);
  temErro(validarAssuntos(catalogo(assuntoOk({ atualizadoEm: '2026-02-31' }))).erros, /atualizadoEm deve ser uma data válida/);
  temErro(validarAssuntos(catalogo(assuntoOk({ criadoEm: '2026-11-09', atualizadoEm: '2026-11-01' }))).erros, /atualizadoEm não pode ser anterior/);
  temErro(validarAssuntos({ versaoEstrutura: 0, assuntos: [assuntoOk()] }).erros, /versaoEstrutura/);
  temErro(validarAssuntos({ versaoEstrutura: 1, assuntos: [] }).erros, /lista não vazia/);
  temErro(validarAssuntos([]).erros, /deve ser um objeto/);
  temErro(validarAssuntos(catalogo('texto')).erros, /deve ser um objeto/);
});

test('A6. falha quando o assuntoId do serviço não existe no catálogo', () => {
  comCopia(({ dir, editarJson }) => {
    editarJson('services/registry.json', (r) => { r.servicos[0].assuntoId = 'fauna'; });
    editarJson('services/lac/service.json', (s) => { s.assuntoId = 'fauna'; });
    temErro(validarServicos(dir).erros, /assuntoId "fauna" não existe/);
  });
});

test('A7. falha quando o assunto está inativo', () => {
  comCopia(({ dir, editarJson }) => {
    editarJson('services/assuntos.json', (d) => { d.assuntos[0].ativo = false; });
    temErro(validarServicos(dir).erros, /assunto "licenciamento-ambiental" está inativo/);
  });
});

test('A8. falha quando o assuntoId difere entre registro e service.json', () => {
  comCopia(({ dir, editarJson }) => {
    editarJson('services/assuntos.json', (d) => { d.assuntos.push({ ...d.assuntos[0], id: 'fauna', nome: 'Fauna' }); });
    editarJson('services/lac/service.json', (s) => { s.assuntoId = 'fauna'; });
    temErro(validarServicos(dir).erros, /assuntoId difere entre registro e service\.json/);
  });
});

test('A9. falha quando o assuntoId falta no registro ou no service.json', () => {
  comCopia(({ dir, editarJson }) => {
    editarJson('services/registry.json', (r) => { delete r.servicos[0].assuntoId; });
    temErro(validarServicos(dir).erros, /assuntoId obrigatório e válido no registro/);
  });
  comCopia(({ dir, editarJson }) => {
    editarJson('services/lac/service.json', (s) => { delete s.assuntoId; });
    temErro(validarServicos(dir).erros, /assuntoId obrigatório e válido no service\.json/);
  });
});

test('A10. falha quando o catálogo de assuntos não existe', () => {
  comCopia(({ dir }) => {
    fs.rmSync(path.join(dir, 'services', 'assuntos.json'));
    temErro(validarServicos(dir).erros, /assuntos/);
  });
});

test('A11. os esquemas documentam assuntoId e o catálogo, com os mesmos campos obrigatórios do validador', () => {
  const registro = lerJson('services', 'schemas', 'registry.schema.json');
  assert.ok(registro.properties.servicos.items.required.includes('assuntoId'));
  const servico = lerJson('services', 'schemas', 'service.schema.json');
  assert.ok(servico.required.includes('assuntoId'));
  assert.ok(servico.properties.assuntoId);
  const schema = lerJson('services', 'schemas', 'assuntos.schema.json');
  assert.deepEqual(schema.properties.assuntos.items.required, ['id', 'nome', 'descricao', 'ativo', 'criadoEm', 'atualizadoEm']);
});

test('A12. assunto e serviço são conceitos distintos: o registro de serviços não guarda dados do assunto', () => {
  const registro = lerJson('services', 'registry.json');
  for (const s of registro.servicos) {
    assert.deepEqual(Object.keys(s).sort(), ['arquivo', 'assuntoId', 'id', 'publicado', 'statusValidacao']);
  }
});
