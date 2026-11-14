// Ferramentas do servidor MCP local (Passo 2C1): definições, casos felizes com os valores reais da LAC, filtros, limites
// e lista de campos permitidos. A base real só é lida; alterações são feitas em cópias temporárias fora do repositório.

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { criarFerramentas, AVISO, LIMITE_TEXTO, LIMITE_RESPOSTA, MARCA_DE_CORTE, CODIGOS_DE_ERRO } from '../scripts/mcp/ferramentas.js';
import { criarProcessador } from '../scripts/mcp/protocolo.js';
import { ESTADOS_VERSAO } from '../services/admin/fluxo.js';
import { STATUS_VALIDOS, TIPOS_FONTE, SITUACOES_VIGENCIA } from '../scripts/validate-services.js';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const V1 = ['services', 'lac', 'versoes', 'v1'];
const real = criarFerramentas({ raiz: RAIZ });
const chamar = (nome, args, f = real) => f.chamar(nome, args);
const temporarios = [];
after(() => {
  for (const t of temporarios) fs.rmSync(t, { recursive: true, force: true });
});

/** Cópia temporária de services/ fora do repositório. */
function copia() {
  const pai = fs.mkdtempSync(path.join(os.tmpdir(), 'sema-orienta-mcp-ferramentas-'));
  temporarios.push(pai);
  fs.cpSync(path.join(RAIZ, 'services'), path.join(pai, 'services'), { recursive: true });
  return pai;
}
const lerJson = (raiz, ...p) => JSON.parse(fs.readFileSync(path.join(raiz, ...p), 'utf8'));
const gravarJson = (raiz, p, dados) => fs.writeFileSync(path.join(raiz, ...p), `${JSON.stringify(dados, null, 2)}\n`, 'utf8');

function sucesso(r) {
  assert.equal(r.isError, false, JSON.stringify(r.dados));
  assert.equal(r.dados.aviso, AVISO);
  return r.dados;
}
function falha(r, codigo) {
  assert.equal(r.isError, true);
  assert.deepEqual(r.dados, { aviso: AVISO, erro: codigo });
  assert.ok(CODIGOS_DE_ERRO.includes(codigo));
}

test('F1. tools/list traz exatamente as 4 ferramentas, com schemas fechados e enums das constantes do validador', () => {
  const p = criarProcessador({ ferramentas: real });
  const r = JSON.parse(p(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' })));
  const tools = r.result.tools;
  assert.deepEqual(tools.map((t) => t.name), ['listar_assuntos', 'listar_servicos', 'consultar_fontes', 'resumir_base']);
  for (const t of tools) {
    assert.deepEqual(Object.keys(t).sort(), ['description', 'inputSchema', 'name']);
    assert.equal(t.inputSchema.type, 'object');
    assert.equal(t.inputSchema.additionalProperties, false);
  }
  const [assuntos, servicos, fontes, resumo] = tools;
  assert.deepEqual(Object.keys(assuntos.inputSchema.properties), ['ativo']);
  assert.equal(assuntos.inputSchema.properties.ativo.type, 'boolean');
  assert.deepEqual(Object.keys(servicos.inputSchema.properties), ['assuntoId']);
  assert.deepEqual(Object.keys(fontes.inputSchema.properties), ['servicoId', 'fonteId', 'tipo', 'statusValidacao', 'situacaoVigencia']);
  assert.deepEqual(fontes.inputSchema.required, ['servicoId']);
  assert.deepEqual(fontes.inputSchema.properties.tipo.enum, TIPOS_FONTE);
  assert.deepEqual(fontes.inputSchema.properties.statusValidacao.enum, STATUS_VALIDOS);
  assert.deepEqual(fontes.inputSchema.properties.situacaoVigencia.enum, SITUACOES_VIGENCIA);
  for (const id of [servicos.inputSchema.properties.assuntoId, fontes.inputSchema.properties.servicoId, fontes.inputSchema.properties.fonteId]) {
    assert.equal(id.pattern, '^[a-z][a-z0-9-]*$');
    assert.equal(id.maxLength, 60);
    assert.equal(id.minLength, 1);
  }
  assert.deepEqual(resumo.inputSchema.properties, {});
  // Nenhum parâmetro aceita caminho, arquivo, URI ou versão.
  assert.doesNotMatch(JSON.stringify(tools.map((t) => Object.keys(t.inputSchema.properties))), /caminho|arquivo|path|uri|url|glob|versao/i);
});

test('F2. tools/call devolve content em texto JSON e structuredContent com o mesmo objeto', () => {
  const p = criarProcessador({ ferramentas: real });
  const r = JSON.parse(p(JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'listar_assuntos', arguments: {} } })));
  assert.equal(r.result.content.length, 1);
  assert.equal(r.result.content[0].type, 'text');
  assert.deepEqual(JSON.parse(r.result.content[0].text), r.result.structuredContent);
  assert.equal(r.result.isError, undefined);
  const e = JSON.parse(p(JSON.stringify({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'consultar_fontes', arguments: {} } })));
  assert.equal(e.result.isError, true);
  assert.deepEqual(e.result.structuredContent, { aviso: AVISO, erro: 'parametro_invalido' });
});

test('F3. listar_assuntos: catálogo real, contagem de serviços, filtro ativo e chaves permitidas', () => {
  const d = sucesso(chamar('listar_assuntos'));
  assert.deepEqual(Object.keys(d), ['aviso', 'total', 'truncado', 'consistente', 'totalErros', 'assuntos']);
  assert.equal(d.total, 1);
  assert.equal(d.truncado, false);
  assert.equal(d.consistente, true);
  assert.equal(d.totalErros, 0);
  const original = lerJson(RAIZ, 'services', 'assuntos.json').assuntos[0];
  assert.deepEqual(d.assuntos, [{
    id: 'licenciamento-ambiental', nome: original.nome, descricao: original.descricao, ativo: true,
    criadoEm: original.criadoEm, atualizadoEm: original.atualizadoEm, totalServicos: 1,
  }]);
  assert.equal(sucesso(chamar('listar_assuntos', { ativo: true })).total, 1);
  const inativos = sucesso(chamar('listar_assuntos', { ativo: false }));
  assert.equal(inativos.total, 0);
  assert.deepEqual(inativos.assuntos, []);
});

test('F4. listar_servicos: LAC com status literais por origem, PENDENTE preservado, sem conteúdo material', () => {
  const d = sucesso(chamar('listar_servicos'));
  assert.deepEqual(Object.keys(d), ['aviso', 'total', 'truncado', 'servicos']);
  assert.equal(d.total, 1);
  const [lac] = d.servicos;
  assert.deepEqual(Object.keys(lac), ['id', 'assuntoId', 'nome', 'sigla', 'categoria', 'registro', 'versao', 'pendencias', 'camposPendentes', 'coerente']);
  assert.equal(lac.id, 'lac');
  assert.equal(lac.sigla, 'LAC');
  assert.equal(lac.assuntoId, 'licenciamento-ambiental');
  assert.deepEqual(lac.registro, { statusValidacao: 'em_validacao', publicado: false, versaoPublicadaId: null });
  assert.deepEqual(lac.versao, { id: 'lac-v1', numero: 1, estado: 'rascunho', baseadaEm: null, criadoEm: '2026-11-09', enviadaEm: null, temHash: false });
  assert.deepEqual(lac.camposPendentes, { total: 2, truncado: false, itens: ['unidadeResponsavel', 'canalAtendimento.nome'] });
  const servico = lerJson(RAIZ, ...V1, 'service.json');
  assert.deepEqual(lac.pendencias, { total: servico.pendencias.length, truncado: false, itens: servico.pendencias });
  assert.equal(lac.coerente, true);
  const texto = JSON.stringify(d);
  for (const proibido of ['"responsavelValidacao":', 'hashConteudo', 'conteudoFonte', 'etapas', 'condicoes', 'roteiro', 'publicavel', 'aprovado', 'pronto', 'Conteúdo validado', servico.descricao, servico.etapas[0]]) {
    assert.ok(!texto.includes(proibido), proibido);
  }
  // Filtro por assunto existente.
  assert.equal(sucesso(chamar('listar_servicos', { assuntoId: 'licenciamento-ambiental' })).total, 1);
  falha(chamar('listar_servicos', { assuntoId: 'assunto-inexistente' }), 'assunto_nao_encontrado');
});

test('F5. consultar_fontes: fontes validado com publicado false, fonte revogada, citações e chaves permitidas', () => {
  const d = sucesso(chamar('consultar_fontes', { servicoId: 'lac' }));
  assert.deepEqual(Object.keys(d), ['aviso', 'servicoId', 'versaoId', 'versao', 'statusValidacaoArquivo', 'pendencia', 'total', 'truncado', 'consistente', 'fontes']);
  const original = lerJson(RAIZ, ...V1, 'fontes.json');
  assert.equal(d.servicoId, 'lac');
  assert.equal(d.versaoId, 'lac-v1');
  assert.deepEqual(d.versao, { estado: 'rascunho' });
  assert.equal(d.statusValidacaoArquivo, original.statusValidacao);
  assert.equal(d.pendencia, original.pendencia);
  assert.ok(d.pendencia.startsWith('PENDENTE'));
  assert.equal(d.total, original.fontes.length);
  assert.equal(d.consistente, true);
  for (const f of d.fontes) {
    assert.deepEqual(Object.keys(f), ['id', 'titulo', 'tipo', 'orgaoResponsavel', 'url', 'origemOficial', 'statusValidacao', 'publicado', 'dataPublicacao', 'dataConsulta', 'vigencia', 'citadaEm']);
    assert.deepEqual(Object.keys(f.vigencia), ['situacao', 'normasRelacionadas']);
    assert.equal(f.statusValidacao, 'validado');
    assert.equal(f.publicado, false);
    assert.ok(f.url.startsWith('https://'));
    const o = original.fontes.find((x) => x.id === f.id);
    assert.equal(f.url, o.url);
    assert.equal(f.vigencia.situacao, o.vigencia.situacao);
  }
  const revogada = d.fontes.find((f) => f.id === 'decreto-695-2020');
  assert.equal(revogada.vigencia.situacao, 'revogada');
  assert.deepEqual(revogada.citadaEm, ['legislacao']);
  assert.deepEqual(d.fontes.find((f) => f.id === 'sema-orientacoes-lac').citadaEm,
    ['links', 'referencias.descricao', 'referencias.publico', 'referencias.condicoes', 'referencias.etapas', 'referencias.sistemaInicio']);
  const texto = JSON.stringify(d);
  for (const proibido of ['"descricao"', 'dispositivoRelevante', 'observacao', 'responsavelValidacao', 'hashConteudo', 'publicavel', 'aprovado', 'pronto']) {
    assert.ok(!texto.includes(proibido), proibido);
  }
});

test('F6. consultar_fontes: filtros por fonteId, tipo, statusValidacao e situacaoVigencia', () => {
  const um = sucesso(chamar('consultar_fontes', { servicoId: 'lac', fonteId: 'tr-176-lac' }));
  assert.deepEqual(um.fontes.map((f) => f.id), ['tr-176-lac']);
  falha(chamar('consultar_fontes', { servicoId: 'lac', fonteId: 'fonte-inexistente' }), 'fonte_nao_encontrada');
  falha(chamar('consultar_fontes', { servicoId: 'servico-inexistente' }), 'servico_nao_encontrado');
  const leg = sucesso(chamar('consultar_fontes', { servicoId: 'lac', tipo: 'legislacao' }));
  assert.equal(leg.total, 4);
  assert.ok(leg.fontes.every((f) => f.tipo === 'legislacao'));
  assert.equal(sucesso(chamar('consultar_fontes', { servicoId: 'lac', statusValidacao: 'validado' })).total, 8);
  assert.equal(sucesso(chamar('consultar_fontes', { servicoId: 'lac', statusValidacao: 'rascunho' })).total, 0);
  assert.deepEqual(sucesso(chamar('consultar_fontes', { servicoId: 'lac', situacaoVigencia: 'revogada' })).fontes.map((f) => f.id), ['decreto-695-2020']);
  assert.equal(sucesso(chamar('consultar_fontes', { servicoId: 'lac', situacaoVigencia: 'a_confirmar' })).total, 2);
  assert.equal(sucesso(chamar('consultar_fontes', { servicoId: 'lac', tipo: 'legislacao', situacaoVigencia: 'nao_se_aplica' })).total, 0);
  for (const args of [{ servicoId: 'lac', tipo: 'lei' }, { servicoId: 'lac', statusValidacao: 'publicado' }, { servicoId: 'lac', situacaoVigencia: 'vigente ' }, { servicoId: 'lac', versaoId: 'lac-v1' }]) {
    falha(chamar('consultar_fontes', args), 'parametro_invalido');
  }
});

test('F7. resumir_base: só contagens, todas as chaves de estado e validação sem mensagens', () => {
  const d = sucesso(chamar('resumir_base'));
  assert.deepEqual(Object.keys(d), ['aviso', 'assuntos', 'servicos', 'versoes', 'fontes', 'documentos', 'perguntas', 'blocosAssistente', 'camposPendentes', 'validacao']);
  assert.deepEqual(d.assuntos, { total: 1, ativos: 1, inativos: 0 });
  assert.deepEqual(d.servicos, { total: 1, porStatusValidacao: { rascunho: 0, em_validacao: 1, validado: 0, outros: 0 }, publicados: 0 });
  assert.deepEqual(Object.keys(d.versoes.porEstado), [...ESTADOS_VERSAO, 'outros']);
  assert.equal(d.versoes.porEstado.rascunho, 1);
  assert.equal(d.versoes.versoesPublicadas, 0);
  assert.deepEqual(Object.keys(d.fontes.porSituacaoVigencia), [...SITUACOES_VIGENCIA, 'outros']);
  assert.deepEqual(d.fontes, {
    total: 8, porStatusValidacao: { rascunho: 0, em_validacao: 0, validado: 8, outros: 0 }, publicadas: 0, naoPublicadas: 8,
    porSituacaoVigencia: { vigente: 0, alterada: 1, revogada: 1, a_confirmar: 2, nao_se_aplica: 4, outros: 0 },
  });
  const v1 = (n) => lerJson(RAIZ, ...V1, n);
  assert.deepEqual(d.documentos, { total: v1('documentos.json').documentos.length, publicados: 0 });
  assert.deepEqual(d.perguntas, { total: v1('perguntas-frequentes.json').perguntas.length, publicados: 0 });
  assert.deepEqual(d.blocosAssistente, { total: v1('conteudo-assistente.json').blocos.length, publicados: 0 });
  assert.equal(d.camposPendentes, 2);
  assert.deepEqual(d.validacao, { ok: true, totalErros: 0, codigos: [] });
  for (const args of [{ x: 1 }, { servicoId: 'lac' }, [], 'texto', null, 1]) falha(chamar('resumir_base', args), 'parametro_invalido');
  assert.equal(chamar('resumir_base', {}).isError, false);
});

test('F8. mais de 200 itens: truncado true, total real e no máximo 200 itens', () => {
  const raiz = copia();
  const assuntos = lerJson(raiz, 'services', 'assuntos.json');
  const modelo = assuntos.assuntos[0];
  for (let i = 0; i < 250; i += 1) assuntos.assuntos.push({ ...modelo, id: `assunto-ficticio-${i}`, nome: `Assunto fictício ${i}` });
  gravarJson(raiz, ['services', 'assuntos.json'], assuntos);
  const fontes = lerJson(raiz, ...V1, 'fontes.json');
  const base = fontes.fontes[5];
  for (let i = 0; i < 250; i += 1) fontes.fontes.push({ ...base, id: `fonte-ficticia-${i}`, url: `https://exemplo.invalid/ficticia-${i}` });
  gravarJson(raiz, [...V1, 'fontes.json'], fontes);
  const f = criarFerramentas({ raiz });
  const a = sucesso(chamar('listar_assuntos', undefined, f));
  assert.equal(a.total, 251);
  assert.equal(a.truncado, true);
  assert.equal(a.assuntos.length, 200);
  const fo = sucesso(chamar('consultar_fontes', { servicoId: 'lac' }, f));
  assert.equal(fo.total, 258);
  assert.equal(fo.truncado, true);
  assert.equal(fo.fontes.length, 200);
  assert.equal(sucesso(chamar('resumir_base', undefined, f)).fontes.total, 258);
});

test('F9. textos longos cortados com marcação explícita; resposta acima de 256 KB vira erro', () => {
  const raiz = copia();
  const assuntos = lerJson(raiz, 'services', 'assuntos.json');
  assuntos.assuntos[0].descricao = 'd'.repeat(5000);
  gravarJson(raiz, ['services', 'assuntos.json'], assuntos);
  const f = criarFerramentas({ raiz });
  const descricao = sucesso(chamar('listar_assuntos', undefined, f)).assuntos[0].descricao;
  assert.equal(descricao, `${'d'.repeat(LIMITE_TEXTO)}${MARCA_DE_CORTE}`);

  const fontes = lerJson(raiz, ...V1, 'fontes.json');
  fontes.fontes = Array.from({ length: 200 }, (_, i) => ({ ...fontes.fontes[5], id: `fonte-longa-${i}`, titulo: 't'.repeat(1900), url: `https://exemplo.invalid/${i}` }));
  gravarJson(raiz, [...V1, 'fontes.json'], fontes);
  falha(chamar('consultar_fontes', { servicoId: 'lac' }, f), 'resposta_grande_demais');
});

test('F10. registro corrompido gera base_indisponivel; manifesto incoerente gera versao_indisponivel no item', () => {
  const raiz = copia();
  fs.writeFileSync(path.join(raiz, 'services', 'registry.json'), '{ isto não é JSON', 'utf8');
  const f = criarFerramentas({ raiz });
  falha(chamar('listar_servicos', undefined, f), 'base_indisponivel');
  falha(chamar('consultar_fontes', { servicoId: 'lac' }, f), 'base_indisponivel');
  falha(chamar('resumir_base', undefined, f), 'base_indisponivel');
  falha(chamar('listar_assuntos', undefined, f), 'base_indisponivel');

  const raiz2 = copia();
  const manifesto = lerJson(raiz2, ...V1, 'versao.json');
  manifesto.id = 'lac-v2';
  gravarJson(raiz2, [...V1, 'versao.json'], manifesto);
  const g = criarFerramentas({ raiz: raiz2 });
  assert.deepEqual(sucesso(chamar('listar_servicos', undefined, g)).servicos, [{ id: 'lac', erro: 'versao_indisponivel' }]);
  falha(chamar('consultar_fontes', { servicoId: 'lac' }, g), 'versao_indisponivel');
  const resumo = sucesso(chamar('resumir_base', undefined, g));
  assert.deepEqual(resumo.validacao, { ok: null, totalErros: null, codigos: ['validacao_indisponivel'] });

  // Erro de conteúdo lido com sucesso: contado pelos validadores puros, sem mensagens.
  const raiz3 = copia();
  const fontes = lerJson(raiz3, ...V1, 'fontes.json');
  fontes.fontes[0].tipo = 'tipo-inexistente';
  gravarJson(raiz3, [...V1, 'fontes.json'], fontes);
  const r3 = sucesso(chamar('resumir_base', undefined, criarFerramentas({ raiz: raiz3 })));
  assert.equal(r3.validacao.ok, false);
  assert.ok(r3.validacao.totalErros > 0);
  assert.deepEqual(r3.validacao.codigos, ['base_com_erros_de_validacao']);
  assert.doesNotMatch(JSON.stringify(r3), /tipo-inexistente|desconhecido/);
});

test('F12. limite central: dados abaixo de 256 KB, mas result completo (texto escapado + structuredContent) acima, vira erro', () => {
  const raiz = copia();
  const fontes = lerJson(raiz, ...V1, 'fontes.json');
  fontes.fontes = Array.from({ length: 150 }, (_, i) => ({ ...fontes.fontes[5], id: `fonte-media-${i}`, titulo: `"${'t'.repeat(700)}"`, url: `https://exemplo.invalid/${i}` }));
  gravarJson(raiz, [...V1, 'fontes.json'], fontes);
  const semLimite = criarFerramentas({ raiz, limiteResposta: Infinity }).chamar('consultar_fontes', { servicoId: 'lac' });
  assert.equal(semLimite.isError, false);
  const bytesDados = Buffer.byteLength(JSON.stringify(semLimite.dados), 'utf8');
  const bytesResultado = Buffer.byteLength(JSON.stringify(semLimite.resultado), 'utf8');
  assert.ok(bytesDados < LIMITE_RESPOSTA, `dados com ${bytesDados} bytes`);
  assert.ok(bytesResultado > LIMITE_RESPOSTA, `resultado com ${bytesResultado} bytes`);
  const comLimite = criarFerramentas({ raiz }).chamar('consultar_fontes', { servicoId: 'lac' });
  falha(comLimite, 'resposta_grande_demais');
  assert.deepEqual(comLimite.resultado, {
    content: [{ type: 'text', text: JSON.stringify({ aviso: AVISO, erro: 'resposta_grande_demais' }) }],
    structuredContent: { aviso: AVISO, erro: 'resposta_grande_demais' },
    isError: true,
  });
  // Pelo protocolo, o result enviado é o do erro.
  const p = criarProcessador({ ferramentas: criarFerramentas({ raiz }) });
  const r = JSON.parse(p(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'consultar_fontes', arguments: { servicoId: 'lac' } } })));
  assert.equal(r.result.isError, true);
  assert.equal(r.result.structuredContent.erro, 'resposta_grande_demais');
});

test('F11. URL que não é https é devolvida como null, nunca acessada', () => {
  const raiz = copia();
  const fontes = lerJson(raiz, ...V1, 'fontes.json');
  fontes.fontes[0].url = 'http://exemplo.invalid/inseguro';
  fontes.fontes[1].url = 'file:///etc/passwd';
  gravarJson(raiz, [...V1, 'fontes.json'], fontes);
  const d = sucesso(chamar('consultar_fontes', { servicoId: 'lac' }, criarFerramentas({ raiz })));
  assert.equal(d.fontes[0].url, null);
  assert.equal(d.fontes[1].url, null);
  assert.equal(d.consistente, false);
});
