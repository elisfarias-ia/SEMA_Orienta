// Versões de serviço (Marco 7, Passo 7B). Só dados fictícios; ids e datas são passados às funções.
// As entradas são congeladas em profundidade: qualquer tentativa de modificá-las lança erro.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  criarVersao, alterarArquivos, enviarParaValidacao, conteudoConfere, criarNovaVersao, validarVersao,
  ESTADOS_QUE_PERMITEM_NOVA_VERSAO,
} from '../services/admin/versao.js';
import { ESTADOS_VERSAO } from '../services/admin/fluxo.js';
import { hashConteudo } from '../services/admin/hash.js';
import { congelar, ARQUIVOS, CONTEUDO, novaVersao, rascunho, emValidacao, ate } from './admin-auxiliar.js';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lerJson = (...p) => JSON.parse(fs.readFileSync(path.join(RAIZ, ...p), 'utf8'));
const lerTexto = (...p) => fs.readFileSync(path.join(RAIZ, ...p), 'utf8');

// ---------- Criação e envio ----------

test('V1. cria a primeira versão em rascunho, com referências aos arquivos modulares e sem hash nem envio', () => {
  const r = novaVersao();
  assert.equal(r.ok, true);
  assert.deepEqual(r.versao, {
    id: 'versao-1', servicoId: 'servico-ficticio', numero: 1, baseadaEm: null, estado: 'rascunho',
    arquivos: ARQUIVOS, hashConteudo: null, criadoEm: '2026-01-10', enviadaEm: null,
  });
  assert.deepEqual(validarVersao(r.versao), []);
});

test('V2. dados inválidos na criação são recusados', () => {
  for (const extra of [
    { id: 'Versao 1' }, { id: undefined }, { servicoId: '' }, { criadoEm: '10/01/2026' }, { criadoEm: '2026-02-31' },
    { arquivos: {} }, { arquivos: null }, { arquivos: { roteiro: { texto: 'conteúdo embutido' } } },
    { arquivos: { roteiro: '/etc/arquivo' } }, { arquivos: { roteiro: '../fora/arquivo.json' } }, { arquivos: { roteiro: 'C:\\arquivo.json' } },
  ]) {
    assert.equal(novaVersao(extra).ok, false, JSON.stringify(extra));
  }
  assert.equal(criarVersao().ok, false);
});

test('V3. a versão guarda só referências: conteúdo embutido é recusado e o modelo não tem campo de conteúdo', () => {
  assert.equal(novaVersao({ arquivos: { roteiro: 'texto' .repeat(100) } }).ok, false);
  assert.deepEqual(Object.keys(rascunho()).sort(), ['arquivos', 'baseadaEm', 'criadoEm', 'enviadaEm', 'estado', 'hashConteudo', 'id', 'numero', 'servicoId']);
  assert.ok(Object.values(rascunho().arquivos).every((c) => typeof c === 'string'));
});

test('V4. enviar para validação calcula o hash do conteúdo e registra a data; o conteúdo não é guardado', () => {
  const r = enviarParaValidacao(rascunho(), CONTEUDO, '2026-01-11');
  assert.equal(r.ok, true);
  assert.equal(r.versao.estado, 'em_validacao');
  assert.equal(r.versao.hashConteudo, hashConteudo(CONTEUDO));
  assert.equal(r.versao.enviadaEm, '2026-01-11');
  assert.equal(JSON.stringify(r.versao).includes('Texto fictício'), false);
  assert.deepEqual(validarVersao(r.versao), []);
  assert.equal(conteudoConfere(r.versao, CONTEUDO), true);
  assert.equal(conteudoConfere(r.versao, { ...CONTEUDO, roteiro: 'alterado' }), false);
});

test('V5. o hash independe da ordem das chaves do conteúdo e muda com qualquer alteração', () => {
  const a = enviarParaValidacao(rascunho(), { b: 1, a: [1, 2] }, '2026-01-11').versao.hashConteudo;
  const b = enviarParaValidacao(rascunho(), { a: [1, 2], b: 1 }, '2026-01-11').versao.hashConteudo;
  const c = enviarParaValidacao(rascunho(), { a: [2, 1], b: 1 }, '2026-01-11').versao.hashConteudo;
  assert.equal(a, b);
  assert.notEqual(a, c);
});

test('V6. envio recusa data inválida, data anterior à criação e conteúdo inválido ou vazio', () => {
  assert.equal(enviarParaValidacao(rascunho(), CONTEUDO, '2026-13-01').erro, 'data_invalida');
  assert.equal(enviarParaValidacao(rascunho(), CONTEUDO, undefined).erro, 'data_invalida');
  assert.equal(enviarParaValidacao(rascunho(), CONTEUDO, '2026-01-09').erro, 'data_anterior_a_criacao');
  for (const conteudo of [null, undefined, {}, [], 'texto', { a: undefined }, { a: NaN }]) {
    assert.equal(enviarParaValidacao(rascunho(), conteudo, '2026-01-11').erro, 'conteudo_invalido', String(conteudo));
  }
});

// ---------- Congelamento e estados ----------

test('V7. só o rascunho aceita alteração das referências; a partir de em_validacao a versão fica congelada', () => {
  const novo = { roteiro: 'servicos-ficticios/exemplo/outro.md' };
  const ok = alterarArquivos(rascunho(), novo);
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.versao.arquivos, novo);
  assert.equal(ok.versao.estado, 'rascunho');
  for (const estado of ESTADOS_VERSAO.filter((e) => e !== 'rascunho')) {
    assert.equal(alterarArquivos(ate(estado).v, novo).erro, 'versao_congelada', estado);
  }
  assert.equal(alterarArquivos(rascunho(), {}).ok, false);
});

test('V8. não é possível enviar para validação uma versão que já saiu do rascunho', () => {
  for (const estado of ESTADOS_VERSAO.filter((e) => e !== 'rascunho')) {
    assert.equal(enviarParaValidacao(ate(estado).v, CONTEUDO, '2026-02-01').erro, 'versao_congelada', estado);
  }
});

// ---------- Nova versão ----------

test('V9. nova versão: permitida a partir de ajustes, validado, autorizado e publicado; nasce em rascunho, numero+1, baseadaEm', () => {
  assert.deepEqual([...ESTADOS_QUE_PERMITEM_NOVA_VERSAO], ['ajustes_solicitados', 'validado_materialmente', 'autorizado_publicacao', 'publicado']);
  for (const estado of ESTADOS_QUE_PERMITEM_NOVA_VERSAO) {
    const { v } = ate(estado);
    const r = criarNovaVersao(v, { id: 'versao-2', criadoEm: '2026-02-01' });
    assert.equal(r.ok, true, estado);
    assert.equal(r.versao.estado, 'rascunho');
    assert.equal(r.versao.numero, 2);
    assert.equal(r.versao.baseadaEm, 'versao-1');
    assert.equal(r.versao.servicoId, v.servicoId);
    assert.equal(r.versao.hashConteudo, null);
    assert.equal(r.versao.enviadaEm, null);
    assert.deepEqual(r.versao.arquivos, v.arquivos);
    assert.deepEqual(validarVersao(r.versao), []);
    assert.equal(v.estado, estado, 'a versão anterior é preservada');
  }
});

test('V10. nova versão é recusada a partir de rascunho e de em_validacao (sem decisão)', () => {
  assert.equal(criarNovaVersao(rascunho(), { id: 'versao-2', criadoEm: '2026-02-01' }).erro, 'estado_nao_permite_nova_versao');
  assert.equal(criarNovaVersao(emValidacao(), { id: 'versao-2', criadoEm: '2026-02-01' }).erro, 'validacao_em_andamento');
});

test('V11. numeração segue a maior versão existente; id repetido, outro serviço e data anterior são recusados', () => {
  const v1 = ate('publicado').v;
  const v2 = criarNovaVersao(v1, { id: 'versao-2', criadoEm: '2026-02-01' }, [v1]).versao;
  const v3 = criarNovaVersao(v1, { id: 'versao-3', criadoEm: '2026-02-02' }, [v1, v2]);
  assert.equal(v3.ok, true);
  assert.equal(v3.versao.numero, 3);
  assert.equal(v3.versao.baseadaEm, 'versao-1');
  assert.equal(criarNovaVersao(v1, { id: 'versao-2', criadoEm: '2026-02-02' }, [v1, v2]).erro, 'id_duplicado');
  const outra = congelar({ ...v2, servicoId: 'outro-servico-ficticio' });
  assert.equal(criarNovaVersao(v1, { id: 'versao-9', criadoEm: '2026-02-02' }, [v1, outra]).erro, 'existentes_invalidas');
  assert.equal(criarNovaVersao(v1, { id: 'versao-9', criadoEm: '2026-02-02' }, []).erro, 'existentes_invalidas');
  assert.equal(criarNovaVersao(v1, { id: 'versao-9', criadoEm: '2026-01-01' }).erro, 'data_anterior_a_versao_base');
  assert.equal(criarNovaVersao(v1, { id: 'Versao 9', criadoEm: '2026-02-02' }).ok, false);
  assert.equal(criarNovaVersao(v1, undefined).ok, false);
});

test('V12. a nova versão pode trocar as referências; alterá-las não afeta a versão anterior', () => {
  const v1 = ate('validado_materialmente').v;
  const novas = { roteiro: 'servicos-ficticios/exemplo/roteiro-v2.md' };
  const r = criarNovaVersao(v1, { id: 'versao-2', criadoEm: '2026-02-01', arquivos: novas });
  assert.deepEqual(r.versao.arquivos, novas);
  assert.deepEqual(v1.arquivos, ARQUIVOS);
  assert.notEqual(r.versao.arquivos, novas, 'cópia, não a mesma referência');
});

test('V13. validarVersao recusa estados incoerentes e campos fora do modelo', () => {
  const base = rascunho();
  const casos = [
    [{ ...base, estado: 'publicado' }, /hashConteudo/],
    [{ ...base, hashConteudo: 'a'.repeat(64) }, /rascunho não pode ter hashConteudo/],
    [{ ...base, enviadaEm: '2026-01-11' }, /rascunho não pode ter enviadaEm/],
    [{ ...base, estado: 'validado' }, /estado inválido/],
    [{ ...base, numero: 0 }, /numero/],
    [{ ...base, numero: 2 }, /baseadaEm deve indicar/],
    [{ ...base, baseadaEm: 'versao-0' }, /primeira versão/],
    [{ ...base, conteudo: 'embutido' }, /campo não previsto: conteudo/],
    [{ ...emValidacao(), hashConteudo: 'XYZ' }, /hashConteudo/],
    [{ ...emValidacao(), enviadaEm: '2026-01-01' }, /enviadaEm não pode ser anterior/],
    [{ ...emValidacao(), enviadaEm: null }, /enviadaEm/],
  ];
  for (const [v, padrao] of casos) assert.ok(validarVersao(v).some((e) => padrao.test(e)), `${padrao}: ${validarVersao(v).join('|')}`);
  assert.ok(validarVersao(null).length > 0);
  assert.ok(validarVersao([]).length > 0);
  const { id, ...semId } = base;
  assert.ok(validarVersao(semId).some((e) => /ausente: id/.test(e)));
});

test('V14. funções recusam versão inválida recebida de fora, sem lançar exceção', () => {
  const quebrada = { ...rascunho(), estado: 'xyz' };
  assert.equal(enviarParaValidacao(quebrada, CONTEUDO, '2026-01-11').erro, 'versao_invalida');
  assert.equal(alterarArquivos(quebrada, ARQUIVOS).erro, 'versao_invalida');
  assert.equal(criarNovaVersao(quebrada, { id: 'versao-2', criadoEm: '2026-02-01' }).erro, 'versao_invalida');
  assert.equal(enviarParaValidacao(null, CONTEUDO, '2026-01-11').erro, 'versao_invalida');
});

// ---------- Pureza e esquema ----------

test('V15. nenhuma função modifica o objeto recebido (entradas congeladas) e os resultados são cópias novas', () => {
  const v = rascunho();
  const r = enviarParaValidacao(v, CONTEUDO, '2026-01-11');
  assert.equal(v.estado, 'rascunho');
  assert.notEqual(r.versao, v);
  assert.equal(Object.isFrozen(r.versao), false);
  const cp = alterarArquivos(v, { roteiro: 'servicos-ficticios/exemplo/novo.md' });
  assert.deepEqual(v.arquivos, ARQUIVOS);
  assert.notEqual(cp.versao.arquivos, v.arquivos);
});

test('V16. determinístico: mesmas entradas, mesmas saídas, sem relógio, aleatoriedade ou ambiente', () => {
  assert.deepEqual(enviarParaValidacao(rascunho(), CONTEUDO, '2026-01-11'), enviarParaValidacao(rascunho(), CONTEUDO, '2026-01-11'));
  for (const arquivo of ['versao.js', 'decisoes.js']) {
    const texto = lerTexto('services', 'admin', arquivo);
    assert.doesNotMatch(texto, /Date\.now|new Date\(\)|Math\.random|randomUUID|randomBytes|process\.env|node:fs|from 'fs'|readFile|writeFile|fetch\(|localStorage|node:http/, arquivo);
  }
});

test('V17. o esquema da versão corresponde ao modelo e aos estados do fluxo', () => {
  const schema = lerJson('services', 'schemas', 'versao.schema.json');
  assert.deepEqual(schema.properties.estado.enum, [...ESTADOS_VERSAO]);
  assert.deepEqual([...schema.required].sort(), Object.keys(rascunho()).sort());
  assert.equal(schema.additionalProperties, false);
});

test('V18. nada foi migrado nem registrado: não há versão real, nem módulo de interface, endpoint ou armazenamento', () => {
  assert.deepEqual(fs.readdirSync(path.join(RAIZ, 'services', 'admin')).sort(), ['decisoes.js', 'fluxo.js', 'hash.js', 'versao.js']);
  assert.equal(fs.existsSync(path.join(RAIZ, 'data')), false);
  assert.equal(fs.existsSync(path.join(RAIZ, 'admin')), false);
  for (const arquivo of ['src/main.js', 'src/chat.js', 'src/assistant.js', 'vite.config.js']) {
    assert.doesNotMatch(lerTexto(arquivo), /services\/admin|admin\//, arquivo);
  }
});
