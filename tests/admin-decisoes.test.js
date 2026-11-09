// Decisões de validação material, autorização e publicação (Marco 7, Passo 7B). Só dados fictícios.
// As entradas são congeladas em profundidade: qualquer tentativa de modificá-las lança erro.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  registrarDecisaoMaterial, autorizarPublicacao, publicarVersao, validarRegistro, validarHistorico,
  DECISOES_MATERIAIS,
} from '../services/admin/decisoes.js';
import { criarNovaVersao, validarVersao } from '../services/admin/versao.js';
import { ESTADOS_VERSAO } from '../services/admin/fluxo.js';
import { congelar, ate, base, emValidacao, rascunho } from './admin-auxiliar.js';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lerJson = (...p) => JSON.parse(fs.readFileSync(path.join(RAIZ, ...p), 'utf8'));

const validar = (v, h, extra) => registrarDecisaoMaterial(v, h, base(v, { id: 'decisao-1', decisao: 'validado_materialmente', ...extra }));
const ajustar = (v, h, extra) => registrarDecisaoMaterial(v, h, base(v, { id: 'decisao-1', decisao: 'ajustes_solicitados', observacao: 'Ajuste fictício.', ...extra }));
const autorizar = (v, h, extra) => autorizarPublicacao(v, h, base(v, { id: 'autorizacao-1', data: '2026-01-13', ...extra }));

// ---------- Decisão material ----------

test('D1. validação material: a versão em validação passa a validado_materialmente e o histórico ganha o registro', () => {
  const { v, h } = ate('em_validacao');
  const r = validar(v, h);
  assert.equal(r.ok, true);
  assert.equal(r.versao.estado, 'validado_materialmente');
  assert.equal(r.historico.length, 1);
  assert.deepEqual(r.historico[0], {
    tipo: 'decisao_material', id: 'decisao-1', versaoId: 'versao-1', decisao: 'validado_materialmente', hashConteudo: v.hashConteudo,
    responsavel: 'responsavel-ficticio-1', unidade: 'unidade-ficticia-1', data: '2026-01-12', observacao: null,
  });
  assert.deepEqual(validarRegistro(r.historico[0]), []);
  assert.deepEqual(validarVersao(r.versao), []);
  assert.equal(r.versao.hashConteudo, v.hashConteudo, 'o hash enviado é preservado');
});

test('D2. ajustes solicitados: exigem observação e a versão passa a ajustes_solicitados', () => {
  const { v, h } = ate('em_validacao');
  const r = ajustar(v, h);
  assert.equal(r.ok, true);
  assert.equal(r.versao.estado, 'ajustes_solicitados');
  assert.equal(r.historico[0].observacao, 'Ajuste fictício.');
  for (const observacao of [undefined, null, '', '   ']) {
    const sem = ajustar(v, h, { observacao });
    assert.equal(sem.ok, false, String(observacao));
    assert.equal(sem.erro, 'decisao_invalida');
    assert.ok(sem.detalhes.some((e) => /observacao obrigatória/.test(e)));
  }
});

test('D3. na validação material a observação é opcional', () => {
  const { v, h } = ate('em_validacao');
  assert.equal(validar(v, h, { observacao: 'Conferido pela unidade fictícia.' }).ok, true);
  assert.equal(validar(v, h, { observacao: null }).ok, true);
});

test('D4. decisão com versaoId ou hash divergente é recusada, e o histórico e a versão não mudam', () => {
  const { v, h } = ate('em_validacao');
  assert.equal(validar(v, h, { versaoId: 'versao-2' }).erro, 'versao_divergente');
  assert.equal(validar(v, h, { hashConteudo: 'a'.repeat(64) }).erro, 'hash_divergente');
  assert.equal(ajustar(v, h, { hashConteudo: 'b'.repeat(64) }).erro, 'hash_divergente');
  assert.equal(v.estado, 'em_validacao');
  assert.equal(h.length, 0);
});

test('D5. a decisão só vale para versão em validação', () => {
  for (const estado of ESTADOS_VERSAO.filter((e) => e !== 'em_validacao' && e !== 'rascunho')) {
    const { v, h } = ate(estado);
    assert.equal(registrarDecisaoMaterial(v, h, base(v, { id: 'decisao-9', decisao: 'validado_materialmente' })).erro, 'versao_nao_esta_em_validacao', estado);
  }
  const r = rascunho();
  assert.equal(registrarDecisaoMaterial(r, [], { ...base(emValidacao()), id: 'decisao-1', decisao: 'validado_materialmente' }).erro, 'versao_nao_esta_em_validacao');
});

test('D6. campos obrigatórios e formatos: responsável, unidade, data, decisão, ids e hash', () => {
  const { v, h } = ate('em_validacao');
  const casos = [
    [{ responsavel: '' }, /responsavel obrigatório/],
    [{ unidade: '  ' }, /unidade obrigatório/],
    [{ responsavel: ['nome', 'exemplo.test'].join('@') }, /sem e-mail/],
    [{ responsavel: 'x'.repeat(81) }, /identificador curto/],
    [{ data: '12/01/2026' }, /data deve ser/],
    [{ data: '2026-02-30' }, /data deve ser/],
    [{ decisao: 'aprovado' }, /decisao deve ser/],
    [{ id: 'Decisão 1' }, /id inválido/],
    [{ hashConteudo: 'abc' }, /hashConteudo/],
    [{ observacao: 123 }, /observacao deve ser texto/],
    [{ tipo: 'outro' }, null],
  ];
  for (const [extra, padrao] of casos) {
    const r = validar(v, h, extra);
    if (padrao === null) {
      // O tipo é definido pela função; um tipo enviado pelo chamador é ignorado.
      assert.equal(r.ok, true);
      assert.equal(r.historico[0].tipo, 'decisao_material');
    } else {
      assert.equal(r.ok, false, JSON.stringify(extra));
      assert.ok(r.detalhes.some((e) => padrao.test(e)), `${padrao}: ${(r.detalhes ?? []).join('|')}`);
    }
  }
  assert.equal(registrarDecisaoMaterial(v, h, undefined).ok, false);
  assert.equal(registrarDecisaoMaterial(v, h, 'texto').ok, false);
  assert.equal(registrarDecisaoMaterial(v, h, { ...base(v), id: 'decisao-1', decisao: 'validado_materialmente', extra: 1 }).ok, false);
});

test('D7. só existem as duas decisões materiais, e não há como pular direto para autorização ou publicação por esta função', () => {
  assert.deepEqual([...DECISOES_MATERIAIS], ['ajustes_solicitados', 'validado_materialmente']);
  const { v, h } = ate('em_validacao');
  for (const decisao of ['autorizado_publicacao', 'publicado', 'rascunho', 'em_validacao', 'validado']) {
    assert.equal(validar(v, h, { decisao }).ok, false, decisao);
  }
});

// ---------- Histórico ----------

test('D8. o histórico só cresce: registros anteriores não são editados, apagados nem reordenados', () => {
  const { v, h } = ate('validado_materialmente');
  const antes = JSON.stringify(h);
  const r = autorizar(v, h);
  assert.equal(r.ok, true);
  assert.equal(r.historico.length, 2);
  assert.deepEqual(r.historico[0], h[0]);
  assert.equal(r.historico[1].tipo, 'autorizacao_publicacao');
  assert.equal(JSON.stringify(h), antes, 'o histórico recebido não foi alterado');
  assert.notEqual(r.historico, h);
  assert.notEqual(r.historico[0], h[0], 'cópia, não a mesma referência');
});

test('D9. id de decisão duplicado é recusado, inclusive entre decisão e autorização', () => {
  const { v, h } = ate('validado_materialmente');
  assert.equal(autorizar(v, h, { id: 'decisao-1' }).erro, 'id_duplicado');
  const em = ate('em_validacao').v;
  const duplicado = congelar([{ ...ate('validado_materialmente').h[0] }]);
  assert.equal(validar(em, duplicado).erro, 'id_duplicado');
  assert.ok(validarHistorico([duplicado[0], duplicado[0]]).some((e) => /id duplicado/.test(e)));
});

test('D10. datas não retrocedem: nem antes do envio da versão, nem antes do registro anterior', () => {
  const { v, h } = ate('em_validacao');
  assert.equal(validar(v, h, { data: '2026-01-10' }).erro, 'data_anterior_ao_envio');
  const val = ate('validado_materialmente');
  assert.equal(autorizar(val.v, val.h, { data: '2026-01-10' }).erro, 'data_anterior_ao_envio');
  assert.equal(autorizar(val.v, val.h, { data: '2026-01-12' }).ok, true, 'mesmo dia é permitido');
  const meio = { ...val.h[0], data: '2026-01-20' };
  assert.equal(autorizar(val.v, congelar([meio]), { data: '2026-01-15' }).erro, 'data_anterior_ao_historico');
});

test('D11. histórico inválido recebido de fora é recusado sem lançar exceção', () => {
  const { v } = ate('em_validacao');
  for (const h of [null, undefined, {}, 'texto', [null], [{}], [{ tipo: 'decisao_material' }]]) {
    assert.equal(validar(v, h).erro, 'historico_invalido', JSON.stringify(h));
  }
  assert.ok(validarHistorico('x').length > 0);
});

// ---------- Autorização de publicação ----------

test('D12. autorização: só depois da validação material do mesmo hash; a versão passa a autorizado_publicacao', () => {
  const { v, h } = ate('validado_materialmente');
  const r = autorizar(v, h, { observacao: 'Autorização fictícia.' });
  assert.equal(r.ok, true);
  assert.equal(r.versao.estado, 'autorizado_publicacao');
  assert.deepEqual(r.registro, {
    tipo: 'autorizacao_publicacao', id: 'autorizacao-1', versaoId: 'versao-1', hashConteudo: v.hashConteudo,
    responsavel: 'responsavel-ficticio-1', unidade: 'unidade-ficticia-1', data: '2026-01-13', observacao: 'Autorização fictícia.',
  });
  assert.deepEqual(validarRegistro(r.registro), []);
});

test('D13. autorização é recusada em qualquer estado diferente de validado_materialmente', () => {
  for (const estado of ESTADOS_VERSAO.filter((e) => e !== 'validado_materialmente' && e !== 'rascunho')) {
    const { v, h } = ate(estado);
    assert.equal(autorizar(v, h, { id: 'autorizacao-9' }).erro, 'versao_nao_validada_materialmente', estado);
  }
  const { v, h } = ate('em_validacao');
  assert.equal(autorizar(v, h).erro, 'versao_nao_validada_materialmente');
});

test('D14. autorização exige a decisão de validação material no histórico, com o mesmo versaoId e hash', () => {
  const { v } = ate('validado_materialmente');
  assert.equal(autorizar(v, []).erro, 'sem_validacao_material_do_mesmo_hash');
  const ajustes = congelar([{ ...ate('ajustes_solicitados').h[0] }]);
  assert.equal(autorizar(v, ajustes).erro, 'sem_validacao_material_do_mesmo_hash');
  const outroHash = congelar([{ ...ate('validado_materialmente').h[0], hashConteudo: 'c'.repeat(64) }]);
  assert.equal(autorizar(v, outroHash).erro, 'sem_validacao_material_do_mesmo_hash');
  const outraVersao = congelar([{ ...ate('validado_materialmente').h[0], versaoId: 'versao-7' }]);
  assert.equal(autorizar(v, outraVersao).erro, 'sem_validacao_material_do_mesmo_hash');
});

test('D15. autorização com versaoId ou hash divergente é recusada', () => {
  const { v, h } = ate('validado_materialmente');
  assert.equal(autorizar(v, h, { versaoId: 'versao-2' }).erro, 'versao_divergente');
  assert.equal(autorizar(v, h, { hashConteudo: 'd'.repeat(64) }).erro, 'hash_divergente');
  assert.equal(autorizar(v, h, { responsavel: '' }).erro, 'autorizacao_invalida');
  assert.equal(autorizar(v, h, { tipo: 'decisao_material' }).historico[1].tipo, 'autorizacao_publicacao');
});

// ---------- Publicação ----------

test('D16. publicação: somente depois da autorização do mesmo hash; a versão passa a publicado e o histórico é mantido', () => {
  const { v, h } = ate('autorizado_publicacao');
  const r = publicarVersao(v, h);
  assert.equal(r.ok, true);
  assert.equal(r.versao.estado, 'publicado');
  assert.deepEqual(r.historico, h);
  assert.notEqual(r.historico, h);
  assert.deepEqual(validarVersao(r.versao), []);
});

test('D17. publicação é recusada sem validação material e autorização; não há atalho a partir dos demais estados', () => {
  for (const estado of ESTADOS_VERSAO.filter((e) => e !== 'autorizado_publicacao' && e !== 'rascunho')) {
    const { v, h } = ate(estado);
    assert.equal(publicarVersao(v, h).erro, 'versao_nao_autorizada', estado);
  }
  assert.equal(publicarVersao(rascunho(), []).erro, 'versao_nao_autorizada');
});

test('D18. publicação exige no histórico a validação material e a autorização do mesmo hash', () => {
  const { v, h } = ate('autorizado_publicacao');
  assert.equal(publicarVersao(v, []).erro, 'sem_validacao_material_do_mesmo_hash');
  assert.equal(publicarVersao(v, congelar([h[0]])).erro, 'sem_autorizacao_do_mesmo_hash');
  assert.equal(publicarVersao(v, congelar([h[1]])).erro, 'sem_validacao_material_do_mesmo_hash');
  const autorizacaoOutroHash = congelar([h[0], { ...h[1], hashConteudo: 'e'.repeat(64) }]);
  assert.equal(publicarVersao(v, autorizacaoOutroHash).erro, 'sem_autorizacao_do_mesmo_hash');
});

test('D19. versão publicada não pode ser publicada de novo nem voltar atrás', () => {
  const { v, h } = ate('publicado');
  assert.equal(publicarVersao(v, h).erro, 'versao_nao_autorizada');
  assert.equal(autorizar(v, h, { id: 'autorizacao-9' }).erro, 'versao_nao_validada_materialmente');
  assert.equal(validar(v, h, { id: 'decisao-9' }).erro, 'versao_nao_esta_em_validacao');
});

// ---------- Fluxo completo, nova versão e pureza ----------

test('D20. fluxo completo e nova versão: a anterior e seu histórico são preservados', () => {
  const { v: publicada, h } = ate('publicado');
  const r = criarNovaVersao(publicada, { id: 'versao-2', criadoEm: '2026-02-01' });
  assert.equal(r.ok, true);
  assert.equal(r.versao.estado, 'rascunho');
  assert.equal(publicada.estado, 'publicado');
  assert.equal(h.length, 2);
  assert.deepEqual(h.map((x) => x.tipo), ['decisao_material', 'autorizacao_publicacao']);
});

test('D21. depois de ajustes solicitados não se segue em frente: pede-se nova versão', () => {
  const { v, h } = ate('ajustes_solicitados');
  assert.equal(autorizar(v, h, { id: 'autorizacao-9' }).erro, 'versao_nao_validada_materialmente');
  assert.equal(publicarVersao(v, h).erro, 'versao_nao_autorizada');
  assert.equal(criarNovaVersao(v, { id: 'versao-2', criadoEm: '2026-02-01' }).ok, true);
});

test('D22. nova versão recomeça sem decisões: as do histórico anterior não valem para outro hash nem outra versão', () => {
  const { v: v1, h } = ate('validado_materialmente');
  const v2r = criarNovaVersao(v1, { id: 'versao-2', criadoEm: '2026-02-01' }).versao;
  const v2 = congelar({ ...v2r, estado: 'em_validacao', hashConteudo: 'f'.repeat(64), enviadaEm: '2026-02-02' });
  assert.equal(registrarDecisaoMaterial(v2, h, base(v1, { id: 'decisao-2', decisao: 'validado_materialmente', data: '2026-02-03' })).erro, 'versao_divergente');
  const r = registrarDecisaoMaterial(v2, h, base(v2, { id: 'decisao-2', decisao: 'validado_materialmente', data: '2026-02-03' }));
  assert.equal(r.ok, true);
  assert.equal(r.historico.length, 2);
});

test('D23. as funções não modificam os objetos recebidos (entradas congeladas) nem usam estado oculto', () => {
  const { v, h } = ate('em_validacao');
  const entrada = congelar(base(v, { id: 'decisao-1', decisao: 'validado_materialmente' }));
  const a = registrarDecisaoMaterial(v, h, entrada);
  const b = registrarDecisaoMaterial(v, h, entrada);
  assert.deepEqual(a, b);
  assert.equal(v.estado, 'em_validacao');
  assert.equal(h.length, 0);
  assert.equal(Object.isFrozen(a.historico), false);
});

test('D24. os esquemas da decisão material e da autorização correspondem ao modelo', () => {
  const material = lerJson('services', 'schemas', 'decisao-material.schema.json');
  const autorizacao = lerJson('services', 'schemas', 'autorizacao-publicacao.schema.json');
  assert.deepEqual(material.properties.decisao.enum, [...DECISOES_MATERIAIS]);
  assert.equal(material.properties.tipo.const, 'decisao_material');
  assert.equal(autorizacao.properties.tipo.const, 'autorizacao_publicacao');
  const { v } = ate('em_validacao');
  const r = validar(v, []);
  assert.deepEqual([...material.required].sort(), Object.keys(r.registro).sort());
  const au = autorizar(ate('validado_materialmente').v, ate('validado_materialmente').h);
  assert.deepEqual([...autorizacao.required].sort(), Object.keys(au.registro).sort());
  assert.equal(material.additionalProperties, false);
  assert.equal(autorizacao.additionalProperties, false);
  assert.match(material.description, /fora do Git/);
});

test('D25. nenhuma decisão real existe no repositório: não há registros de decisão nos dados da LAC nem arquivo de histórico', () => {
  for (const arquivo of ['service.json', 'fontes.json', 'documentos.json', 'perguntas-frequentes.json', 'conteudo-assistente.json']) {
    const texto = fs.readFileSync(path.join(RAIZ, 'services', 'lac', arquivo), 'utf8');
    assert.doesNotMatch(texto, /decisao_material|autorizacao_publicacao|hashConteudo/, arquivo);
  }
  assert.equal(fs.existsSync(path.join(RAIZ, 'data')), false);
});
