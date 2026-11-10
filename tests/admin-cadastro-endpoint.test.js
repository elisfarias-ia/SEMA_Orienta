// Rotas de cadastro do endpoint administrativo (Marco 7, Passo 7E1): POST /__admin/assuntos e POST /__admin/servicos.
// Requisições simuladas (sem abrir porta), SEMPRE contra cópias temporárias fora do repositório e com dados fictícios.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import {
  criarManipuladorAdmin, CABECALHO_TOKEN, ROTA_SESSAO, ROTA_CATALOGO, ROTA_ASSUNTOS, ROTA_SERVICOS,
} from '../services/admin/admin-endpoint.js';
import { validarServicos } from '../scripts/validate-services.js';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lerJsonReal = (...p) => JSON.parse(fs.readFileSync(path.join(RAIZ, ...p), 'utf8'));
const HEADERS_OK = { host: 'localhost:5173' };
const AGORA = () => new Date(2026, 10, 10, 12, 0, 0);
const ASSUNTO = { id: 'assunto-ficticio', nome: 'Assunto Fictício', descricao: 'Descrição fictícia de teste.' };
const SERVICO = { id: 'servico-ficticio', assuntoId: 'licenciamento-ambiental', nome: 'Serviço Fictício', sigla: 'SF', termosEquivalentes: ['serviço fictício', 'SF'] };
const ARQUIVOS_V1 = ['conteudo-assistente.json', 'documentos.json', 'fontes.json', 'perguntas-frequentes.json', 'roteiro.md', 'service.json', 'versao.json'];

/** Requisição simulada com corpo (fluxo de leitura igual ao do servidor real). */
async function enviar(manipulador, { url, method = 'POST', corpo, texto, headers = {}, token, remoteAddress = '127.0.0.1', localPort = 5173, tipo = 'application/json', comTamanho = true } = {}) {
  const buffer = texto !== undefined ? Buffer.from(texto) : Buffer.from(JSON.stringify(corpo ?? {}));
  const h = { ...HEADERS_OK, ...headers };
  if (tipo !== null) h['content-type'] = tipo;
  if (comTamanho && h['content-length'] === undefined) h['content-length'] = String(buffer.length);
  if (token !== undefined) h[CABECALHO_TOKEN] = token;
  const req = Object.assign(Readable.from([buffer]), { url, method, headers: h, socket: { remoteAddress, localPort } });
  const cabecalhos = {};
  let resposta = null;
  const res = { statusCode: 0, setHeader: (n, v) => { cabecalhos[n.toLowerCase()] = v; }, end: (t) => { resposta = t; } };
  let proximo = false;
  await manipulador(req, res, () => { proximo = true; });
  return { status: res.statusCode, corpo: resposta === null ? null : JSON.parse(resposta), textoBruto: resposta ?? '', cabecalhos, proximo };
}
const get = (m, url, token) => enviar(m, { url, method: 'GET', token, tipo: null, texto: '', comTamanho: false });

/** Copia temporária de services/ (fora do repositório) com manipulador e token prontos. */
async function comCopia(fn, opcoes = {}) {
  const pai = fs.mkdtempSync(path.join(os.tmpdir(), 'sema-orienta-cadastro-endpoint-'));
  const raiz = path.join(pai, 'raiz');
  fs.mkdirSync(raiz);
  fs.cpSync(path.join(RAIZ, 'services'), path.join(raiz, 'services'), { recursive: true });
  try {
    const m = criarManipuladorAdmin({ raiz, agora: AGORA, diretorioTemporario: pai, ...opcoes });
    const token = (await get(m, ROTA_SESSAO)).corpo.token;
    return await fn({ m, token, raiz, pai });
  } finally {
    fs.rmSync(pai, { recursive: true, force: true });
  }
}
const assunto = (m, token, corpo = ASSUNTO, extra = {}) => enviar(m, { url: ROTA_ASSUNTOS, corpo, token, ...extra });
const servico = (m, token, corpo = SERVICO, extra = {}) => enviar(m, { url: ROTA_SERVICOS, corpo, token, ...extra });
const lerJson = (raiz, ...p) => JSON.parse(fs.readFileSync(path.join(raiz, ...p), 'utf8'));
/** Retrato byte a byte da pasta services/ da cópia (e das pastas), para provar que nada mudou. */
function retrato(raiz) {
  const itens = [];
  const andar = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) {
        itens.push(`D ${path.relative(raiz, p)}`);
        andar(p);
      } else {
        itens.push(`F ${path.relative(raiz, p)} ${crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')}`);
      }
    }
  };
  andar(raiz);
  return itens.sort().join('\n');
}
const sobrasTemporarias = (dir) => fs.readdirSync(dir).filter((n) => n.startsWith('sema-orienta-ensaio-') || n.endsWith('.tmp'));

// ---------- Assunto ----------

test('CE1. cadastro válido de assunto: 201, ativo, datas do servidor (relógio injetável), base continua válida', async () => {
  await comCopia(async ({ m, token, raiz }) => {
    const antes = lerJson(raiz, 'services', 'registry.json');
    const r = await assunto(m, token);
    assert.equal(r.status, 201);
    assert.deepEqual(r.corpo, { assunto: { id: 'assunto-ficticio', nome: 'Assunto Fictício', descricao: 'Descrição fictícia de teste.', ativo: true, criadoEm: '2026-11-10', atualizadoEm: '2026-11-10' } });
    const doc = lerJson(raiz, 'services', 'assuntos.json');
    assert.deepEqual(doc.assuntos.map((a) => a.id), ['licenciamento-ambiental', 'assunto-ficticio']);
    assert.deepEqual(doc.assuntos[0], lerJsonReal('services', 'assuntos.json').assuntos[0], 'o assunto existente não mudou');
    assert.deepEqual(lerJson(raiz, 'services', 'registry.json'), antes, 'nenhum serviço foi criado');
    assert.deepEqual(validarServicos(raiz), { erros: [], servicos: ['lac'] });
    assert.deepEqual((await get(m, ROTA_CATALOGO, token)).corpo.assuntos.map((a) => a.id), ['licenciamento-ambiental', 'assunto-ficticio']);
    assert.equal(r.cabecalhos['cache-control'], 'no-store');
    assert.deepEqual(sobrasTemporarias(path.dirname(raiz)), []);
  });
});

test('CE2. assunto duplicado por id ou por nome (sem distinguir acento e caixa) é recusado com 409 e nada muda', async () => {
  await comCopia(async ({ m, token, raiz }) => {
    assert.equal((await assunto(m, token)).status, 201);
    const antes = retrato(raiz);
    for (const [corpo, campo] of [
      [{ ...ASSUNTO, nome: 'Outro Nome' }, 'id'],
      [{ ...ASSUNTO, id: 'outro-id' }, 'nome'],
      [{ ...ASSUNTO, id: 'outro-id', nome: '  ASSUNTO   FICTICIO ' }, 'nome'],
      [{ ...ASSUNTO, id: 'licenciamento-ambiental', nome: 'Novo' }, 'id'],
      [{ ...ASSUNTO, id: 'outro-id', nome: 'licenciamento  ambiental' }, 'nome'],
    ]) {
      const r = await assunto(m, token, corpo);
      assert.equal(r.status, 409, JSON.stringify(corpo));
      assert.deepEqual(r.corpo, { erro: 'ja_existe', campo });
    }
    assert.equal(retrato(raiz), antes);
  });
});

test('CE3. campos extras e dados inválidos no assunto: 422 sem repetir o que foi enviado, e nada muda', async () => {
  await comCopia(async ({ m, token, raiz }) => {
    const antes = retrato(raiz);
    for (const extra of [{ publicado: true }, { ativo: false }, { statusValidacao: 'validado' }, { estado: 'publicado' }, { hashConteudo: 'a'.repeat(64) }, { decisao: 'validado_materialmente' }, { responsavel: 'x' }]) {
      const r = await assunto(m, token, { ...ASSUNTO, ...extra });
      assert.equal(r.status, 422, JSON.stringify(extra));
      assert.deepEqual(r.corpo, { erro: 'dados_invalidos', campos: ['extras'] });
    }
    for (const corpo of [{ ...ASSUNTO, id: 'Id Inválido SEGREDO123' }, { ...ASSUNTO, nome: '' }, { ...ASSUNTO, descricao: 'x'.repeat(1001) }, {}, [], null, 'texto', 5]) {
      const r = await assunto(m, token, corpo);
      assert.equal(r.status, 422, JSON.stringify(corpo)?.slice(0, 40));
      assert.equal(r.corpo.erro, 'dados_invalidos');
      assert.equal(r.textoBruto.includes('SEGREDO123'), false);
    }
    assert.equal(retrato(raiz), antes);
  });
});

test('CE4. JSON inválido ou vazio: 400 e nada muda', async () => {
  await comCopia(async ({ m, token, raiz }) => {
    const antes = retrato(raiz);
    for (const texto of ['', '{', '{"id": }', 'não é json', '\u0000', '{"id":"a"}}']) {
      const r = await enviar(m, { url: ROTA_ASSUNTOS, texto, token });
      assert.equal(r.status, 400, JSON.stringify(texto));
      assert.deepEqual(r.corpo, { erro: 'requisicao_invalida' });
    }
    assert.equal(retrato(raiz), antes);
  });
});

// ---------- Serviço ----------

test('CE5. cadastro válido de serviço em assunto ativo: 201 e estrutura completa da versão 1', async () => {
  await comCopia(async ({ m, token, raiz }) => {
    const r = await servico(m, token);
    assert.equal(r.status, 201);
    assert.deepEqual(r.corpo, { servico: { id: 'servico-ficticio', assuntoId: 'licenciamento-ambiental', nome: 'Serviço Fictício', sigla: 'SF', versaoAtualId: 'servico-ficticio-v1', versaoPublicadaId: null, estado: 'rascunho', publicado: false } });
    const pasta = path.join(raiz, 'services', 'servico-ficticio');
    assert.deepEqual(fs.readdirSync(pasta), ['versoes']);
    assert.deepEqual(fs.readdirSync(path.join(pasta, 'versoes')), ['v1']);
    assert.deepEqual(fs.readdirSync(path.join(pasta, 'versoes', 'v1')).sort(), ARQUIVOS_V1);
    const registro = lerJson(raiz, 'services', 'registry.json');
    assert.deepEqual(registro.servicos.map((s) => s.id), ['lac', 'servico-ficticio']);
    assert.deepEqual(registro.servicos[1], {
      id: 'servico-ficticio', assuntoId: 'licenciamento-ambiental', versaoAtualId: 'servico-ficticio-v1', versaoPublicadaId: null,
      arquivo: 'services/servico-ficticio/versoes/v1/service.json', statusValidacao: 'rascunho', publicado: false,
    });
    assert.deepEqual(registro.servicos[0], lerJsonReal('services', 'registry.json').servicos[0], 'a LAC não foi tocada no registro');
    assert.deepEqual(validarServicos(raiz), { erros: [], servicos: ['lac', 'servico-ficticio'] });
    const catalogo = (await get(m, ROTA_CATALOGO, token)).corpo;
    assert.deepEqual(catalogo.servicos.map((s) => [s.id, s.nome, s.sigla, s.versaoAtualId, s.versaoPublicadaId, s.publicado]),
      [['lac', lerJsonReal('services', 'lac', 'versoes', 'v1', 'service.json').nome, 'LAC', 'lac-v1', null, false], ['servico-ficticio', 'Serviço Fictício', 'SF', 'servico-ficticio-v1', null, false]]);
    const versao = await get(m, '/__admin/servicos/servico-ficticio/versao-atual', token);
    assert.equal(versao.status, 200);
    assert.equal(versao.corpo.manifesto.estado, 'rascunho');
    assert.deepEqual(sobrasTemporarias(path.dirname(raiz)), []);
  });
});

test('CE6. nenhum conteúdo inventado, publicação, decisão, hash ou responsável: tudo PENDENTE ou vazio', async () => {
  await comCopia(async ({ m, token, raiz }) => {
    const { sigla, ...semSigla } = SERVICO;
    assert.equal((await servico(m, token, semSigla)).status, 201);
    const v1 = path.join(raiz, 'services', 'servico-ficticio', 'versoes', 'v1');
    const service = lerJson(v1, 'service.json');
    assert.equal(service.sigla, 'PENDENTE', 'sem sigla informada, PENDENTE');
    assert.deepEqual([service.statusValidacao, service.publicado, service.assuntoId, service.categoria], ['rascunho', false, 'licenciamento-ambiental', 'licenciamento ambiental']);
    for (const campo of ['descricao', 'publico', 'unidadeResponsavel']) assert.equal(service[campo], 'PENDENTE');
    assert.deepEqual([service.condicoes, service.etapas, service.links, service.legislacao], [[], [], [], []]);
    assert.deepEqual([service.responsavelValidacao, service.dataRevisao], [null, null]);
    const manifesto = lerJson(v1, 'versao.json');
    assert.deepEqual(manifesto, {
      id: 'servico-ficticio-v1', servicoId: 'servico-ficticio', numero: 1, baseadaEm: null, estado: 'rascunho',
      arquivos: Object.fromEntries(['service', 'roteiro', 'documentos', 'perguntasFrequentes', 'fontes', 'conteudoAssistente'].map((k) => [k, `services/servico-ficticio/versoes/v1/${{ service: 'service.json', roteiro: 'roteiro.md', documentos: 'documentos.json', perguntasFrequentes: 'perguntas-frequentes.json', fontes: 'fontes.json', conteudoAssistente: 'conteudo-assistente.json' }[k]}`])),
      hashConteudo: null, criadoEm: '2026-11-10', enviadaEm: null,
    });
    for (const [arquivo, chave] of [['documentos.json', 'documentos'], ['perguntas-frequentes.json', 'perguntas'], ['fontes.json', 'fontes'], ['conteudo-assistente.json', 'blocos']]) {
      const doc = lerJson(v1, arquivo);
      assert.deepEqual(doc[chave], [], arquivo);
      assert.equal(doc.statusValidacao, 'rascunho');
    }
    const roteiro = fs.readFileSync(path.join(v1, 'roteiro.md'), 'utf8');
    assert.deepEqual(roteiro.split('\n').filter((l) => l.trim() !== '').filter((l) => !l.startsWith('#') && l !== 'PENDENTE'), []);
    assert.equal((roteiro.match(/^## /gm) ?? []).length, 7);
    const tudo = fs.readdirSync(v1).map((n) => fs.readFileSync(path.join(v1, n), 'utf8')).join('\n');
    assert.doesNotMatch(tudo, /decisao|autorizacao|"publicado": true|"hashConteudo": "[0-9a-f]{64}"|"estado": "(publicado|validado)/);
    assert.doesNotMatch(tudo, /https?:\/\//);
  });
});

test('CE7. assunto inexistente ou inativo: 422 e nada é criado', async () => {
  await comCopia(async ({ m, token, raiz }) => {
    const antes = retrato(raiz);
    const r = await servico(m, token, { ...SERVICO, assuntoId: 'assunto-que-nao-existe' });
    assert.equal(r.status, 422);
    assert.deepEqual(r.corpo, { erro: 'dados_invalidos', campos: ['assuntoId'] });
    assert.equal(retrato(raiz), antes);
  });
  await comCopia(async ({ m, token, raiz }) => {
    const arquivo = path.join(raiz, 'services', 'assuntos.json');
    const doc = JSON.parse(fs.readFileSync(arquivo, 'utf8'));
    doc.assuntos[0].ativo = false;
    fs.writeFileSync(arquivo, JSON.stringify(doc, null, 2));
    const antes = retrato(raiz);
    const r = await servico(m, token);
    assert.equal(r.status, 422);
    assert.deepEqual(r.corpo, { erro: 'dados_invalidos', campos: ['assuntoId'] });
    assert.equal(retrato(raiz), antes);
  });
});

test('CE8. serviço duplicado por id, pasta existente ou nome: 409; nada é sobrescrito, nem a LAC', async () => {
  await comCopia(async ({ m, token, raiz }) => {
    assert.equal((await servico(m, token)).status, 201);
    const antes = retrato(raiz);
    const nomeLac = lerJsonReal('services', 'lac', 'versoes', 'v1', 'service.json').nome;
    for (const [corpo, campo] of [
      [{ ...SERVICO, nome: 'Outro Serviço' }, 'id'],
      [{ ...SERVICO, id: 'lac', nome: 'Outro Serviço' }, 'id'],
      [{ ...SERVICO, id: 'schemas', nome: 'Outro Serviço' }, 'id'],
      [{ ...SERVICO, id: 'admin', nome: 'Outro Serviço' }, 'id'],
      [{ ...SERVICO, id: 'outro-servico' }, 'nome'],
      [{ ...SERVICO, id: 'outro-servico', nome: '  SERVICO   FICTICIO ' }, 'nome'],
      [{ ...SERVICO, id: 'outro-servico', nome: nomeLac.toUpperCase() }, 'nome'],
    ]) {
      const r = await servico(m, token, corpo);
      assert.equal(r.status, 409, JSON.stringify(corpo));
      assert.deepEqual(r.corpo, { erro: 'ja_existe', campo });
    }
    assert.equal(retrato(raiz), antes);
  });
});

test('CE9. campos extras e dados inválidos no serviço: 422 e nada muda', async () => {
  await comCopia(async ({ m, token, raiz }) => {
    const antes = retrato(raiz);
    for (const extra of [{ publicado: true }, { versaoAtualId: 'x-v9' }, { versaoPublicadaId: 'x-v1' }, { estado: 'publicado' }, { statusValidacao: 'validado' }, { arquivo: 'services/x.json' }, { hashConteudo: 'a'.repeat(64) }]) {
      const r = await servico(m, token, { ...SERVICO, ...extra });
      assert.equal(r.status, 422, JSON.stringify(extra));
      assert.deepEqual(r.corpo, { erro: 'dados_invalidos', campos: ['extras'] });
    }
    for (const corpo of [{ ...SERVICO, id: 'LAC' }, { ...SERVICO, id: '../x' }, { ...SERVICO, nome: '' }, { ...SERVICO, sigla: 'x'.repeat(30) }, { ...SERVICO, termosEquivalentes: [] }, { ...SERVICO, termosEquivalentes: ['a', 'A'] }, {}, [], null]) {
      assert.equal((await servico(m, token, corpo)).status, 422, JSON.stringify(corpo)?.slice(0, 50));
    }
    assert.equal(retrato(raiz), antes);
  });
});

// ---------- Transação e desfazer ----------

test('CE10. falha intermediária em qualquer gravação do serviço desfaz tudo: estado integral e idêntico ao anterior', async () => {
  for (let n = 1; n <= 8; n += 1) {
    let renomeacoes = 0;
    const sistema = { ...fs, renameSync: (a, b) => { renomeacoes += 1; if (renomeacoes === n) throw new Error('/caminho/secreto/falha'); return fs.renameSync(a, b); } };
    await comCopia(async ({ m, token, raiz, pai }) => {
      const antes = retrato(raiz);
      renomeacoes = 0;
      const r = await servico(m, token);
      assert.equal(r.status, 500, `falha na gravação ${n}`);
      assert.deepEqual(r.corpo, { erro: 'indisponivel' });
      assert.equal(r.textoBruto.includes('secreto'), false);
      assert.equal(r.textoBruto.includes(pai), false);
      assert.equal(retrato(raiz), antes, `retrato após falha ${n}`);
      assert.equal(fs.existsSync(path.join(raiz, 'services', 'servico-ficticio')), false);
      assert.deepEqual(sobrasTemporarias(pai), []);
      // Depois da falha o sistema continua utilizável: sem a falha, o mesmo cadastro funciona.
      renomeacoes = -1000;
      assert.equal((await servico(m, token)).status, 201);
      assert.deepEqual(validarServicos(raiz), { erros: [], servicos: ['lac', 'servico-ficticio'] });
    }, { sistema });
  }
});

test('CE11. verificação final recusada: o serviço é desfeito e o registro volta byte a byte; idem para o assunto', async () => {
  await comCopia(async ({ m, token, raiz, pai }) => {
    const registroOriginal = fs.readFileSync(path.join(raiz, 'services', 'registry.json'), 'utf8');
    const assuntosOriginal = fs.readFileSync(path.join(raiz, 'services', 'assuntos.json'), 'utf8');
    const antes = retrato(raiz);
    for (const chamada of [() => servico(m, token), () => assunto(m, token)]) {
      const r = await chamada();
      assert.equal(r.status, 500);
      assert.deepEqual(r.corpo, { erro: 'indisponivel' });
      assert.equal(retrato(raiz), antes);
    }
    assert.equal(fs.readFileSync(path.join(raiz, 'services', 'registry.json'), 'utf8'), registroOriginal);
    assert.equal(fs.readFileSync(path.join(raiz, 'services', 'assuntos.json'), 'utf8'), assuntosOriginal);
    assert.deepEqual(sobrasTemporarias(pai), []);
  }, { verificarFinal: () => ['recusado de propósito'] });
});

test('CE12. falha na gravação do assunto preserva o arquivo anterior', async () => {
  const sistema = { ...fs, renameSync: () => { throw new Error('falha'); } };
  await comCopia(async ({ m, token, raiz }) => {
    const antes = retrato(raiz);
    const r = await assunto(m, token);
    assert.equal(r.status, 500);
    assert.equal(retrato(raiz), antes);
  }, { sistema });
});

test('CE13. gravações simultâneas diferentes não perdem dados: todas chegam ao disco', async () => {
  await comCopia(async ({ m, token, raiz }) => {
    const [a, b, c] = await Promise.all([
      assunto(m, token, { id: 'assunto-a', nome: 'Assunto A', descricao: 'Fictício A.' }),
      assunto(m, token, { id: 'assunto-b', nome: 'Assunto B', descricao: 'Fictício B.' }),
      servico(m, token),
    ]);
    assert.deepEqual([a.status, b.status, c.status], [201, 201, 201]);
    assert.deepEqual(lerJson(raiz, 'services', 'assuntos.json').assuntos.map((x) => x.id).sort(), ['assunto-a', 'assunto-b', 'licenciamento-ambiental']);
    assert.deepEqual(lerJson(raiz, 'services', 'registry.json').servicos.map((x) => x.id), ['lac', 'servico-ficticio']);
    assert.deepEqual(validarServicos(raiz), { erros: [], servicos: ['lac', 'servico-ficticio'] });
  });
  await comCopia(async ({ m, token, raiz }) => {
    const rs = await Promise.all([assunto(m, token), assunto(m, token), assunto(m, token)]);
    assert.deepEqual(rs.map((r) => r.status).sort(), [201, 409, 409]);
    assert.equal(lerJson(raiz, 'services', 'assuntos.json').assuntos.filter((x) => x.id === 'assunto-ficticio').length, 1);
  });
});

test('CE14. trava de escrita: uma gravação em andamento faz a outra receber 409 sem perder nada; a trava é liberada no fim e também após erro', async () => {
  let liberar;
  const portao = new Promise((r) => { liberar = r; });
  let entrou;
  const aviso = new Promise((r) => { entrou = r; });
  let primeira = true;
  const antesDeGravar = async () => { if (primeira) { primeira = false; entrou(); await portao; } };
  await comCopia(async ({ m, token, raiz }) => {
    const p1 = assunto(m, token);
    await aviso; // a primeira gravação já está dentro da trava
    const r2 = await assunto(m, token, { id: 'assunto-b', nome: 'Assunto B', descricao: 'Fictício B.' });
    assert.equal(r2.status, 409);
    assert.deepEqual(r2.corpo, { erro: 'operacao_em_andamento' });
    liberar();
    const r1 = await p1;
    assert.equal(r1.status, 201);
    assert.deepEqual(lerJson(raiz, 'services', 'assuntos.json').assuntos.map((x) => x.id), ['licenciamento-ambiental', 'assunto-ficticio']);
    assert.equal((await assunto(m, token, { id: 'assunto-b', nome: 'Assunto B', descricao: 'Fictício B.' })).status, 201, 'trava liberada');
  }, { antesDeGravar });
  let lancar = true;
  await comCopia(async ({ m, token }) => {
    assert.equal((await assunto(m, token)).status, 500, 'erro dentro da trava vira erro genérico');
    assert.equal((await assunto(m, token)).status, 201, 'a trava foi liberada mesmo após o erro');
  }, { antesDeGravar: async () => { if (lancar) { lancar = false; throw new Error('falha'); } } });
});

// ---------- Segurança da requisição ----------

test('CE15. exige token e origem local, em ambas as rotas: nada é gravado quando recusado', async () => {
  await comCopia(async ({ m, token, raiz }) => {
    const antes = retrato(raiz);
    for (const [rota, corpo] of [[ROTA_ASSUNTOS, ASSUNTO], [ROTA_SERVICOS, SERVICO]]) {
      const pedir = (extra) => enviar(m, { url: rota, corpo, token, ...extra });
      assert.equal((await enviar(m, { url: rota, corpo })).status, 401, 'sem token');
      for (const ruim of ['', 'a'.repeat(64), token.slice(1), token.toUpperCase().replace(/[0-9a-f]/g, (c) => (c === c.toLowerCase() ? c : c))]) {
        if (ruim === token) continue;
        assert.equal((await pedir({ token: ruim })).status, 401, `token ${ruim.slice(0, 6)}`);
      }
      for (const remoteAddress of ['192.168.0.9', '10.0.0.1', null, '']) assert.equal((await pedir({ remoteAddress })).status, 403, String(remoteAddress));
      for (const host of ['evil.example', 'localhost:9999', '127.0.0.1.nip.io:5173']) assert.equal((await pedir({ headers: { host } })).status, 403, host);
      for (const origin of ['http://evil.example', 'null', 'http://localhost:5174']) assert.equal((await pedir({ headers: { origin } })).status, 403, origin);
      assert.equal((await pedir({ headers: { 'sec-fetch-site': 'cross-site' } })).status, 403);
    }
    assert.equal(retrato(raiz), antes);
  });
});

test('CE16. só POST nas rotas de cadastro (Allow: POST); query recusada; as rotas de leitura continuam só GET', async () => {
  await comCopia(async ({ m, token, raiz }) => {
    const antes = retrato(raiz);
    for (const rota of [ROTA_ASSUNTOS, ROTA_SERVICOS]) {
      for (const method of ['GET', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']) {
        const r = await enviar(m, { url: rota, method, corpo: ASSUNTO, token });
        assert.equal(r.status, 405, `${method} ${rota}`);
        assert.equal(r.cabecalhos.allow, 'POST');
        assert.deepEqual(r.corpo, { erro: 'metodo_nao_permitido' });
        assert.deepEqual(Object.keys(r.cabecalhos).filter((k) => k.startsWith('access-control-')), []);
      }
      for (const url of [`${rota}?a=1`, `${rota}?`, `${rota}?token=${token}`]) assert.equal((await enviar(m, { url, corpo: ASSUNTO, token })).status, 400, url);
    }
    for (const rota of [ROTA_SESSAO, ROTA_CATALOGO]) {
      const r = await enviar(m, { url: rota, method: 'POST', corpo: {}, token });
      assert.equal(r.status, 405);
      assert.equal(r.cabecalhos.allow, 'GET');
    }
    assert.equal(retrato(raiz), antes);
  });
});

test('CE17. Content-Type deve ser application/json; o tamanho máximo do corpo é 32 KB', async () => {
  await comCopia(async ({ m, token, raiz }) => {
    const antes = retrato(raiz);
    for (const tipo of [null, '', 'text/plain', 'application/x-www-form-urlencoded', 'multipart/form-data', 'application/jsonx', 'application/json; charset=latin1', 'text/json', 'application/xml']) {
      const r = await enviar(m, { url: ROTA_ASSUNTOS, corpo: ASSUNTO, token, tipo });
      assert.equal(r.status, 415, String(tipo));
      assert.deepEqual(r.corpo, { erro: 'tipo_nao_suportado' });
    }
    assert.equal(retrato(raiz), antes);
    for (const tipo of ['application/json', 'APPLICATION/JSON', 'application/json; charset=utf-8', 'application/json;charset=UTF-8']) {
      const id = `a-${crypto.randomBytes(3).toString('hex')}`.replace(/^a-\d/, 'a-x');
      const r = await enviar(m, { url: ROTA_ASSUNTOS, corpo: { id, nome: `Nome ${id}`, descricao: 'Fictício.' }, token, tipo });
      assert.equal(r.status, 201, tipo);
    }
  });
  await comCopia(async ({ m, token, raiz }) => {
    const antes = retrato(raiz);
    const valido = JSON.stringify({ id: 'assunto-limite', nome: 'Assunto Limite', descricao: 'Fictício.' });
    const exato = valido + ' '.repeat(32 * 1024 - Buffer.byteLength(valido));
    const grande = exato + ' ';
    assert.equal(Buffer.byteLength(exato), 32 * 1024);
    // Acima do limite: recusado pelo cabeçalho e também sem cabeçalho (corpo em partes), e nada é gravado.
    const porCabecalho = await enviar(m, { url: ROTA_ASSUNTOS, texto: grande, token });
    assert.equal(porCabecalho.status, 413);
    assert.deepEqual(porCabecalho.corpo, { erro: 'corpo_grande_demais' });
    assert.equal(porCabecalho.cabecalhos.connection, 'close');
    const semCabecalho = await enviar(m, { url: ROTA_ASSUNTOS, texto: grande, token, comTamanho: false });
    assert.equal(semCabecalho.status, 413);
    assert.equal((await enviar(m, { url: ROTA_ASSUNTOS, texto: 'x'.repeat(10 * 1024 * 1024), token, comTamanho: false })).status, 413);
    assert.equal(retrato(raiz), antes);
    // Exatamente no limite é aceito.
    assert.equal((await enviar(m, { url: ROTA_ASSUNTOS, texto: exato, token })).status, 201);
    assert.equal((await enviar(m, { url: ROTA_ASSUNTOS, texto: exato, token, comTamanho: false })).status, 409, 'o mesmo corpo, sem cabeçalho de tamanho, também é lido (e já existe)');
    // Cabeçalho de tamanho inválido.
    assert.equal((await enviar(m, { url: ROTA_ASSUNTOS, corpo: ASSUNTO, token, headers: { 'content-length': 'abc' } })).status, 400);
  });
});

test('CE18. não registra corpo, token nem dados em log, e nenhuma resposta expõe caminhos ou o corpo enviado', async () => {
  const saidas = [];
  const originais = {};
  for (const nivel of ['log', 'info', 'warn', 'error', 'debug']) {
    originais[nivel] = console[nivel];
    console[nivel] = (...a) => saidas.push(a.join(' '));
  }
  let respostas = [];
  let token;
  try {
    await comCopia(async ({ m, token: t, pai }) => {
      token = t;
      respostas = [
        await assunto(m, t, { ...ASSUNTO, descricao: 'CORPO-SECRETO-FICTICIO' }),
        await assunto(m, t, { ...ASSUNTO, descricao: 'CORPO-SECRETO-FICTICIO' }),
        await assunto(m, t, { ...ASSUNTO, id: 'ID INVALIDO CORPO-SECRETO-FICTICIO' }),
        await servico(m, t),
        await servico(m, t),
        await enviar(m, { url: ROTA_ASSUNTOS, texto: '{CORPO-SECRETO-FICTICIO', token: t }),
        await servico(m, t, { ...SERVICO, assuntoId: 'nao-existe' }),
      ];
      for (const r of respostas) assert.equal(r.textoBruto.includes(pai), false);
    });
  } finally {
    Object.assign(console, originais);
  }
  assert.deepEqual(respostas.map((r) => r.status), [201, 409, 422, 201, 409, 400, 422]);
  for (const r of respostas.slice(1)) {
    assert.equal(r.textoBruto.includes('CORPO-SECRETO'), false);
    assert.equal(r.textoBruto.includes(token), false);
    assert.doesNotMatch(r.textoBruto, /services\/|\\\\|\.json|\.md/);
  }
  assert.deepEqual(saidas, []);
});

// ---------- O repositório real ----------

test('CE19. o repositório real continua só com "Licenciamento Ambiental" e a LAC; nada foi criado fora de cópias temporárias', () => {
  const assuntos = lerJsonReal('services', 'assuntos.json').assuntos;
  assert.deepEqual(assuntos.map((a) => [a.id, a.nome, a.ativo]), [['licenciamento-ambiental', 'Licenciamento Ambiental', true]]);
  const registro = lerJsonReal('services', 'registry.json').servicos;
  assert.deepEqual(registro.map((s) => s.id), ['lac']);
  assert.deepEqual(fs.readdirSync(path.join(RAIZ, 'services'), { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).sort(), ['admin', 'lac', 'schemas']);
  assert.deepEqual(fs.readdirSync(path.join(RAIZ, 'services', 'lac')), ['versoes']);
  assert.equal(fs.existsSync(path.join(RAIZ, 'data')), false);
  assert.deepEqual(validarServicos(RAIZ), { erros: [], servicos: ['lac'] });
  // Nenhuma cópia temporária ficou para trás.
  assert.deepEqual(fs.readdirSync(os.tmpdir()).filter((n) => n.startsWith('sema-orienta-cadastro') || n.startsWith('sema-orienta-ensaio-')), []);
});
