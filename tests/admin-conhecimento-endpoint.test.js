// Sprint 3, Passo 3B1: endpoints dos blocos de conhecimento (POST, PATCH e DELETE em /__admin/servicos/<id>/conhecimentos).
// Requisições simuladas, SEMPRE contra cópias temporárias fora do repositório e com dados fictícios. A base real não é tocada.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { criarManipuladorAdmin, CABECALHO_TOKEN, ROTA_SESSAO } from '../services/admin/admin-endpoint.js';
import { montarBlocoConhecimento } from '../services/admin/conhecimento.js';
import { selecionarBlocosAssistente } from '../services/assistant-content.js';
import { validarServicos } from '../scripts/validate-services.js';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const V1 = ['services', 'lac', 'versoes', 'v1'];
const ARQUIVO_CONTEUDO = path.join(...V1, 'conteudo-assistente.json');
const ROTA = '/__admin/servicos/lac/conhecimentos';
const AGORA = () => new Date(2026, 10, 10, 12, 0, 0);
const FONTE_OK = 'sema-orientacoes-lac';
const FONTE_REVOGADA = 'decreto-695-2020';
const EMAIL = ['segredo', 'exemplo.test'].join('@'); // montado em execução: o repositório não guarda e-mail
const BLOCO = { titulo: 'Como iniciar o pedido', texto: 'Texto orientativo fictício.', fonteIds: [FONTE_OK], referencias: [{ fonteId: FONTE_OK, localizacao: 'Seção fictícia' }] };
const lerReal = (...p) => fs.readFileSync(path.join(RAIZ, ...p), 'utf8');
const hashReal = () => crypto.createHash('sha256').update(lerReal(...V1, 'conteudo-assistente.json')).digest('hex');
const HASH_REAL_INICIAL = hashReal();
const BLOCOS_TESTE_REAIS = JSON.parse(lerReal(...V1, 'conteudo-assistente.json')).blocos;

async function enviar(manipulador, { url, method = 'POST', corpo, texto, headers = {}, token, remoteAddress = '127.0.0.1', localPort = 5173, tipo = 'application/json', comTamanho = true } = {}) {
  const buffer = texto !== undefined ? Buffer.from(texto) : Buffer.from(JSON.stringify(corpo ?? {}));
  const h = { host: 'localhost:5173', ...headers };
  if (tipo !== null) h['content-type'] = tipo;
  if (comTamanho && h['content-length'] === undefined) h['content-length'] = String(buffer.length);
  if (token !== undefined) h[CABECALHO_TOKEN] = token;
  const req = Object.assign(Readable.from([buffer]), { url, method, headers: h, socket: { remoteAddress, localPort } });
  const cabecalhos = {};
  let resposta = null;
  const res = { statusCode: 0, setHeader: (n, v) => { cabecalhos[n.toLowerCase()] = v; }, end: (t) => { resposta = t === undefined ? null : t; } };
  await manipulador(req, res, () => {});
  return { status: res.statusCode, corpo: resposta === null ? null : JSON.parse(resposta), textoBruto: resposta ?? '', cabecalhos };
}
const get = (m, url, token) => enviar(m, { url, method: 'GET', token, tipo: null, texto: '', comTamanho: false });
const apagar = (m, token, id) => enviar(m, { url: `${ROTA}/${id}`, method: 'DELETE', token, tipo: null, texto: '', comTamanho: false });
const criar = (m, token, extra = {}, opcoes = {}) => enviar(m, { url: ROTA, corpo: { ...BLOCO, ...extra }, token, ...opcoes });
const alterar = (m, token, id, extra = {}, opcoes = {}) => enviar(m, { url: `${ROTA}/${id}`, method: 'PATCH', corpo: { ...BLOCO, ...extra }, token, ...opcoes });

async function comCopia(fn, opcoes = {}) {
  const pai = fs.mkdtempSync(path.join(os.tmpdir(), 'sema-orienta-conhecimento-endpoint-'));
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
const conteudoDe = (raiz) => JSON.parse(fs.readFileSync(path.join(raiz, ARQUIVO_CONTEUDO), 'utf8'));
const textoConteudo = (raiz) => fs.readFileSync(path.join(raiz, ARQUIVO_CONTEUDO), 'utf8');
function retrato(raiz) {
  const itens = [];
  const andar = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { itens.push(`D ${path.relative(raiz, p)}`); andar(p); } else itens.push(`F ${path.relative(raiz, p)} ${crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')}`);
    }
  };
  andar(raiz);
  return itens.sort().join('\n');
}
/** Caminhos de arquivos que mudaram (ou apareceram/sumiram) entre dois retratos. */
function mudados(antes, depois) {
  const a = new Set(antes.split('\n'));
  const b = new Set(depois.split('\n'));
  const dif = [...a].filter((l) => !b.has(l)).concat([...b].filter((l) => !a.has(l)));
  return [...new Set(dif.map((l) => l.split(' ')[1]))].sort();
}
const sobras = (dir) => fs.readdirSync(dir).filter((n) => n.startsWith('sema-orienta-ensaio-') || n.endsWith('.tmp'));
const alterarManifesto = (raiz, estado) => {
  const p = path.join(raiz, ...V1, 'versao.json');
  const v = JSON.parse(fs.readFileSync(p, 'utf8'));
  v.estado = estado;
  if (estado !== 'rascunho') { v.hashConteudo = 'a'.repeat(64); v.enviadaEm = '2026-11-10'; }
  fs.writeFileSync(p, JSON.stringify(v, null, 2));
};
/** Insere um bloco de conhecimento diretamente na cópia (sem passar pelo endpoint), para testar PATCH, DELETE e falhas. */
function semear(raiz, id = 'bc-semeado', entrada = BLOCO, data = '2026-11-09') {
  const manifesto = JSON.parse(fs.readFileSync(path.join(raiz, ...V1, 'versao.json'), 'utf8'));
  const fontes = JSON.parse(fs.readFileSync(path.join(raiz, ...V1, 'fontes.json'), 'utf8')).fontes;
  const r = montarBlocoConhecimento(manifesto, conteudoDe(raiz), fontes, entrada, { id, data });
  assert.equal(r.ok, true);
  fs.writeFileSync(path.join(raiz, ARQUIVO_CONTEUDO), `${JSON.stringify(r.conteudo, null, 2)}\n`);
  return r.bloco;
}
const editarBloco = (raiz, id, mudanca) => {
  const c = conteudoDe(raiz);
  Object.assign(c.blocos.find((b) => b.id === id), mudanca);
  fs.writeFileSync(path.join(raiz, ARQUIVO_CONTEUDO), `${JSON.stringify(c, null, 2)}\n`);
};

// ---------- Criação, alteração e remoção ----------

test('CE1. criação: 201, id e datas automáticos, bloco em rascunho, só conteudo-assistente.json muda e os 5 blocos teste_local ficam intactos', async () => {
  await comCopia(async ({ m, token, raiz, pai }) => {
    const antes = retrato(raiz);
    const r = await criar(m, token, { alertas: ['Pode estar desatualizado.'] });
    assert.equal(r.status, 201);
    assert.match(r.corpo.bloco.id, /^bc-[0-9a-f]{12}$/);
    assert.equal(r.corpo.bloco.id.includes('como'), false, 'o id não vem do título');
    assert.deepEqual(r.corpo.bloco, {
      id: r.corpo.bloco.id, titulo: BLOCO.titulo, texto: BLOCO.texto, fonteIds: [FONTE_OK], referencias: BLOCO.referencias, alertas: ['Pode estar desatualizado.'],
      statusValidacao: 'rascunho', publicado: false, revisaoAtualidade: 'pendente', criadoEm: '2026-11-10', atualizadoEm: '2026-11-10',
    });
    for (const proibido of ['tipo', 'origem', 'ambiente']) assert.equal(Object.hasOwn(r.corpo.bloco, proibido), false);
    const c = conteudoDe(raiz);
    assert.equal(c.blocos.length, 6);
    assert.deepEqual(c.blocos.slice(0, 5), BLOCOS_TESTE_REAIS, 'os cinco blocos teste_local ficam intactos');
    assert.deepEqual(c.blocos[5], { ...r.corpo.bloco, tipo: 'conhecimento', origem: 'fonte', ambiente: 'publico' });
    assert.deepEqual(mudados(antes, retrato(raiz)), [ARQUIVO_CONTEUDO], 'nenhuma escrita fora de conteudo-assistente.json');
    assert.deepEqual(validarServicos(raiz), { erros: [], servicos: ['lac'] });
    assert.equal(r.textoBruto.includes(pai), false);
    assert.equal(r.textoBruto.includes(token), false);
    assert.deepEqual(sobras(pai), []);
    // o chat não recebe o bloco (rascunho, não publicado)
    const fontes = JSON.parse(fs.readFileSync(path.join(raiz, ...V1, 'fontes.json'), 'utf8')).fontes;
    assert.equal(selecionarBlocosAssistente({ conteudo: c, fontes }, 'publico').length, 0);
    assert.deepEqual(selecionarBlocosAssistente({ conteudo: c, fontes }, 'teste_local').map((b) => b.id), BLOCOS_TESTE_REAIS.map((b) => b.id));
  });
});

test('CE2. ids gerados são diferentes, não reaproveitam id existente e não dependem do título', async () => {
  const sequencia = ['lac-descricao', 'lac-descricao', 'bc-aaaaaaaaaaaa', 'bc-bbbbbbbbbbbb'];
  await comCopia(async ({ m, token, raiz }) => {
    const r1 = await criar(m, token, { titulo: 'Primeiro' });
    const r2 = await criar(m, token, { titulo: 'Segundo' });
    assert.deepEqual([r1.status, r2.status], [201, 201]);
    assert.deepEqual([r1.corpo.bloco.id, r2.corpo.bloco.id], ['bc-aaaaaaaaaaaa', 'bc-bbbbbbbbbbbb'], 'a colisão com lac-descricao foi descartada');
    assert.equal(new Set(conteudoDe(raiz).blocos.map((b) => b.id)).size, 7);
  }, { gerarIdBloco: () => sequencia.shift() });
  await comCopia(async ({ m, token }) => {
    const r = await criar(m, token);
    assert.deepEqual([r.status, r.corpo], [500, { erro: 'indisponivel' }], 'sem id livre, falha genérica');
  }, { gerarIdBloco: () => 'lac-descricao' });
});

test('CE3. alteração: 200, preserva id e criadoEm, atualiza atualizadoEm e substitui os campos; alertas omitidos são removidos', async () => {
  let dia = new Date(2026, 10, 10, 12);
  await comCopia(async ({ m, token, raiz }) => {
    const criado = (await criar(m, token, { alertas: ['A.'] })).corpo.bloco;
    dia = new Date(2026, 10, 15, 12);
    const antes = retrato(raiz);
    const r = await enviar(m, { url: `${ROTA}/${criado.id}`, method: 'PATCH', token, corpo: { titulo: 'Novo título', texto: 'Novo texto.', fonteIds: [FONTE_OK], referencias: [{ fonteId: FONTE_OK, localizacao: 'item 3' }] } });
    assert.equal(r.status, 200);
    assert.equal(r.corpo.bloco.id, criado.id);
    assert.equal(r.corpo.bloco.criadoEm, '2026-11-10');
    assert.equal(r.corpo.bloco.atualizadoEm, '2026-11-15');
    assert.equal(r.corpo.bloco.titulo, 'Novo título');
    assert.equal(Object.hasOwn(r.corpo.bloco, 'alertas'), false);
    assert.equal(conteudoDe(raiz).blocos.length, 6);
    assert.deepEqual(conteudoDe(raiz).blocos.slice(0, 5), BLOCOS_TESTE_REAIS);
    assert.deepEqual(mudados(antes, retrato(raiz)), [ARQUIVO_CONTEUDO]);
  }, { agora: () => dia });
});

test('CE4. remoção: 204 sem corpo e só o bloco de conhecimento sai', async () => {
  await comCopia(async ({ m, token, raiz }) => {
    const id = (await criar(m, token)).corpo.bloco.id;
    const antes = retrato(raiz);
    const r = await apagar(m, token, id);
    assert.equal(r.status, 204);
    assert.equal(r.corpo, null);
    assert.equal(r.textoBruto, '');
    assert.deepEqual(conteudoDe(raiz).blocos, BLOCOS_TESTE_REAIS);
    assert.deepEqual(mudados(antes, retrato(raiz)), [ARQUIVO_CONTEUDO]);
    assert.equal((await apagar(m, token, id)).status, 404, 'já removido');
  });
});

// ---------- Entradas inválidas ----------

test('CE5. campos que o cliente não pode enviar e campos extras: 422, nada muda', async () => {
  await comCopia(async ({ m, token, raiz }) => {
    const id = semear(raiz).id;
    const antes = retrato(raiz);
    const proibidos = {
      id: 'bc-x', criadoEm: '2026-01-01', atualizadoEm: '2026-01-01', statusValidacao: 'validado', revisaoAtualidade: 'concluida', ambiente: 'teste_local',
      publicado: true, origem: 'regra_institucional', tipo: 'limitacao', aviso: 'x', url: 'https://exemplo.test', extra: 1,
    };
    for (const [campo, valor] of Object.entries(proibidos)) {
      const c = await criar(m, token, { [campo]: valor });
      assert.deepEqual([c.status, c.corpo.erro, c.corpo.campos.includes('extras')], [422, 'dados_invalidos', true], `POST ${campo}`);
      const a = await alterar(m, token, id, { [campo]: valor });
      assert.deepEqual([a.status, a.corpo.erro, a.corpo.campos.includes('extras')], [422, 'dados_invalidos', true], `PATCH ${campo}`);
    }
    assert.equal(retrato(raiz), antes);
  });
});

test('CE6. campos inválidos: título, texto, alertas, e-mail e corpo que não é objeto recebem 422 sem repetir o conteúdo enviado', async () => {
  await comCopia(async ({ m, token, raiz }) => {
    const id = semear(raiz).id;
    const antes = retrato(raiz);
    const casos = [['titulo', { titulo: '' }], ['titulo', { titulo: 'a'.repeat(201) }], ['texto', { texto: '  ' }], ['texto', { texto: `fale com ${EMAIL}` }],
      ['alertas', { alertas: [''] }], ['alertas', { alertas: 'x' }]];
    for (const [campo, extra] of casos) {
      for (const r of [await criar(m, token, extra), await alterar(m, token, id, extra)]) {
        assert.equal(r.status, 422);
        assert.ok(r.corpo.campos.includes(campo), campo);
        assert.equal(r.textoBruto.includes('segredo@'), false);
      }
    }
    for (const texto of ['[]', 'null', '"x"', '5']) assert.deepEqual((await enviar(m, { url: ROTA, texto, token })).corpo, { erro: 'dados_invalidos', campos: ['corpo'] });
    assert.equal(retrato(raiz), antes);
  });
});

test('CE7. fonte e referência inválidas: inexistente, revogada, repetida, sem referência ou divergente recebem 422', async () => {
  await comCopia(async ({ m, token, raiz }) => {
    const id = semear(raiz).id;
    const antes = retrato(raiz);
    const ref = (fonteId, localizacao = 'p. 1') => ({ fonteId, localizacao });
    const casos = [
      [{ fonteIds: ['nao-existe'], referencias: [ref('nao-existe')] }, 'fonteIds'],
      [{ fonteIds: [FONTE_REVOGADA], referencias: [ref(FONTE_REVOGADA)] }, 'fonteIds'],
      [{ fonteIds: [] }, 'fonteIds'],
      [{ fonteIds: [FONTE_OK, FONTE_OK], referencias: [ref(FONTE_OK), ref(FONTE_OK)] }, 'fonteIds'],
      [{ referencias: [] }, 'referencias'],
      [{ referencias: undefined }, 'referencias'],
      [{ referencias: [ref('tr-176-lac')] }, 'referencias'],
      [{ fonteIds: [FONTE_OK, 'tr-176-lac'], referencias: [ref(FONTE_OK)] }, 'referencias'],
      [{ referencias: [{ fonteId: FONTE_OK, localizacao: '' }] }, 'referencias'],
    ];
    for (const [extra, campo] of casos) {
      for (const r of [await criar(m, token, extra), await alterar(m, token, id, extra)]) {
        assert.equal(r.status, 422, JSON.stringify(extra));
        assert.ok(r.corpo.campos.includes(campo), `${campo}: ${JSON.stringify(r.corpo)}`);
      }
    }
    assert.equal(retrato(raiz), antes);
  });
});

test('CE8. as fontes vêm só da versão atual: fonte de outro serviço não vale', async () => {
  await comCopia(async ({ m, token, raiz }) => {
    // um segundo serviço fictício com fonte própria não é lido ao gravar no serviço lac
    const antes = retrato(raiz);
    const r = await criar(m, token, { fonteIds: ['fonte-de-outro-servico'], referencias: [{ fonteId: 'fonte-de-outro-servico', localizacao: 'p. 1' }] });
    assert.equal(r.status, 422);
    assert.equal(retrato(raiz), antes);
  });
});

test('CE9. título repetido é permitido quando o conteúdo é diferente (decisão revista); a duplicidade por conteúdo não é tratada nesta etapa', async () => {
  await comCopia(async ({ m, token, raiz }) => {
    const a = (await criar(m, token, { titulo: 'Título Único', texto: 'Primeiro conteúdo.' })).corpo.bloco;
    const b = await criar(m, token, { titulo: '  título   único ', texto: 'Segundo conteúdo.' });
    assert.equal(b.status, 201);
    assert.notEqual(b.corpo.bloco.id, a.id);
    const c = (await criar(m, token, { titulo: 'Outro título' })).corpo.bloco;
    const alterado = await alterar(m, token, c.id, { titulo: 'TÍTULO ÚNICO', texto: 'Terceiro conteúdo.' });
    assert.equal(alterado.status, 200);
    assert.equal(alterado.corpo.bloco.titulo, 'TÍTULO ÚNICO');
    assert.equal(conteudoDe(raiz).blocos.filter((x) => x.tipo === 'conhecimento').length, 3);
    assert.deepEqual(validarServicos(raiz), { erros: [], servicos: ['lac'] });
  });
});

// ---------- Estado da versão e do bloco ----------

test('CE10. versão que não está em rascunho: POST, PATCH e DELETE recebem 409 e nada muda', async () => {
  for (const estado of ['em_validacao', 'ajustes_solicitados', 'validado_materialmente', 'autorizado_publicacao', 'publicado']) {
    await comCopia(async ({ m, token, raiz }) => {
      const id = semear(raiz).id;
      alterarManifesto(raiz, estado);
      const antes = retrato(raiz);
      for (const r of [await criar(m, token), await alterar(m, token, id), await apagar(m, token, id)]) {
        assert.deepEqual([r.status, r.corpo], [409, { erro: 'versao_nao_editavel' }], estado);
      }
      assert.equal(retrato(raiz), antes);
    });
  }
});

test('CE11. bloco inexistente: 404; bloco teste_local, validado ou publicado: 409; nada muda', async () => {
  await comCopia(async ({ m, token, raiz }) => {
    const id = semear(raiz).id;
    const antes = retrato(raiz);
    assert.deepEqual((await alterar(m, token, 'bc-nao-existe')).corpo, { erro: 'nao_encontrado' });
    assert.equal((await alterar(m, token, 'bc-nao-existe')).status, 404);
    assert.equal((await apagar(m, token, 'bc-nao-existe')).status, 404);
    for (const teste of BLOCOS_TESTE_REAIS.map((b) => b.id)) {
      const a = await alterar(m, token, teste);
      const d = await apagar(m, token, teste);
      assert.deepEqual([a.status, a.corpo], [409, { erro: 'bloco_nao_editavel' }], teste);
      assert.deepEqual([d.status, d.corpo], [409, { erro: 'bloco_nao_removivel' }], teste);
    }
    assert.equal(retrato(raiz), antes);
    for (const mudanca of [{ statusValidacao: 'em_validacao' }, { statusValidacao: 'em_validacao', revisaoAtualidade: 'em_revisao' }]) {
      editarBloco(raiz, id, mudanca);
      const congelado = retrato(raiz);
      assert.deepEqual([(await alterar(m, token, id)).status, (await alterar(m, token, id)).corpo.erro], [409, 'bloco_nao_editavel']);
      assert.deepEqual([(await apagar(m, token, id)).status, (await apagar(m, token, id)).corpo.erro], [409, 'bloco_nao_removivel']);
      assert.equal(retrato(raiz), congelado);
      editarBloco(raiz, id, { statusValidacao: 'rascunho', revisaoAtualidade: 'pendente' });
    }
  });
});

// ---------- Atomicidade, rollback e concorrência ----------

test('CE12. falha na gravação desfaz tudo em POST, PATCH e DELETE: arquivo byte a byte, sem sobras e sem vazar detalhes', async () => {
  const falhas = {
    'renomeação': { sistema: { ...fs, renameSync: () => { throw new Error('/caminho/secreto/falha'); } } },
    'escrita': { sistema: { ...fs, writeSync: () => { throw new Error('/caminho/secreto/escrita'); } } },
    'abertura': { sistema: { ...fs, openSync: () => { throw new Error('/caminho/secreto/abrir'); } } },
    'conferência final': { verificarFinal: () => ['recusado de propósito'] },
  };
  for (const [nome, opcoes] of Object.entries(falhas)) {
    await comCopia(async ({ m, token, raiz, pai }) => {
      // semeia pelo disco (sem passar pelo endpoint com falha) e só então tenta cada operação
      const id = semear(raiz).id;
      const original = textoConteudo(raiz);
      const antes = retrato(raiz);
      for (const r of [await criar(m, token, { titulo: 'Título diferente' }), await alterar(m, token, id, { titulo: 'Outro' }), await apagar(m, token, id)]) {
        assert.deepEqual([r.status, r.corpo], [500, { erro: 'indisponivel' }], nome);
        assert.equal(r.textoBruto.includes('secreto'), false);
        assert.equal(r.textoBruto.includes(pai), false);
      }
      assert.equal(textoConteudo(raiz), original, `${nome}: restaurado byte a byte`);
      assert.equal(retrato(raiz), antes);
      assert.deepEqual(sobras(pai), []);
    }, opcoes);
  }
});

test('CE13. base inválida antes da gravação: 500 genérico e nenhuma escrita', async () => {
  let chamadas = 0;
  await comCopia(async ({ m, token, raiz, pai }) => {
    const antes = retrato(raiz);
    const r = await criar(m, token);
    assert.deepEqual([r.status, r.corpo], [500, { erro: 'indisponivel' }]);
    assert.equal(chamadas, 1);
    assert.equal(retrato(raiz), antes);
    assert.deepEqual(sobras(pai), []);
  }, { verificarInicial: () => { chamadas += 1; return ['base inválida']; } });
});

test('CE14. gravação concorrente: a segunda chamada (POST, PATCH ou DELETE) recebe 409 sem ser enfileirada', async () => {
  let liberar;
  const portao = new Promise((r) => { liberar = r; });
  let entrou;
  const aviso = new Promise((r) => { entrou = r; });
  let primeira = true;
  const antesDeGravar = async () => { if (primeira) { primeira = false; entrou(); await portao; } };
  await comCopia(async ({ m, token, raiz }) => {
    const p1 = criar(m, token, { titulo: 'Primeiro' });
    await aviso;
    const outros = [await criar(m, token, { titulo: 'Segundo' }), await alterar(m, token, 'bc-qualquer'), await apagar(m, token, 'bc-qualquer')];
    for (const r of outros) assert.deepEqual([r.status, r.corpo], [409, { erro: 'operacao_em_andamento' }]);
    liberar();
    assert.equal((await p1).status, 201);
    assert.deepEqual(conteudoDe(raiz).blocos.slice(5).map((b) => b.titulo), ['Primeiro'], 'só a primeira gravou; nada foi enfileirado');
    assert.equal((await criar(m, token, { titulo: 'Terceiro' })).status, 201, 'a trava é liberada ao fim');
    assert.deepEqual(validarServicos(raiz), { erros: [], servicos: ['lac'] });
  }, { antesDeGravar });
});

// ---------- Proteções do endpoint ----------

test('CE15. token, origem, método, tipo, corpo, JSON e rotas: mesmas proteções do endpoint administrativo', async () => {
  await comCopia(async ({ m, token, raiz }) => {
    const id = semear(raiz).id;
    const antes = retrato(raiz);
    const URL_BLOCO = `${ROTA}/${id}`;
    // token
    for (const t of [undefined, 'x', '0'.repeat(64)]) {
      assert.equal((await criar(m, t)).status, 401);
      assert.equal((await alterar(m, t, id)).status, 401);
      assert.equal((await apagar(m, t, id)).status, 401);
    }
    // origem
    assert.equal((await criar(m, token, {}, { remoteAddress: '10.0.0.5' })).status, 403);
    assert.equal((await criar(m, token, {}, { headers: { host: 'exemplo.com' } })).status, 403);
    assert.equal((await criar(m, token, {}, { headers: { origin: 'http://exemplo.com' } })).status, 403);
    assert.equal((await criar(m, token, {}, { headers: { 'sec-fetch-site': 'cross-site' } })).status, 403);
    // método
    const get405 = await get(m, ROTA, token);
    assert.deepEqual([get405.status, get405.cabecalhos.allow], [405, 'POST']);
    for (const method of ['PUT', 'POST', 'GET']) {
      const r = await enviar(m, { url: URL_BLOCO, method, corpo: BLOCO, token });
      assert.deepEqual([r.status, r.cabecalhos.allow], [405, 'PATCH, DELETE'], method);
    }
    // tipo, tamanho, JSON
    assert.equal((await criar(m, token, {}, { tipo: 'text/plain' })).status, 415);
    assert.equal((await criar(m, token, {}, { tipo: null })).status, 415);
    assert.equal((await alterar(m, token, id, {}, { tipo: 'text/plain' })).status, 415);
    assert.equal((await enviar(m, { url: ROTA, texto: JSON.stringify({ ...BLOCO, texto: 'a'.repeat(40 * 1024) }), token })).status, 413);
    assert.equal((await enviar(m, { url: URL_BLOCO, method: 'PATCH', texto: JSON.stringify({ ...BLOCO, texto: 'a'.repeat(40 * 1024) }), token })).status, 413);
    assert.equal((await enviar(m, { url: ROTA, texto: '{ inválido', token })).status, 400);
    assert.equal((await enviar(m, { url: URL_BLOCO, method: 'PATCH', texto: '{ inválido', token })).status, 400);
    // DELETE com corpo, query e rotas inválidas
    assert.equal((await enviar(m, { url: URL_BLOCO, method: 'DELETE', corpo: { x: 1 }, token })).status, 400);
    assert.equal((await enviar(m, { url: `${ROTA}?x=1`, corpo: BLOCO, token })).status, 400);
    assert.equal((await enviar(m, { url: '/__admin/servicos/nao-existe/conhecimentos', corpo: BLOCO, token })).status, 404);
    assert.equal((await enviar(m, { url: `/__admin/servicos/nao-existe/conhecimentos/${id}`, method: 'DELETE', token, tipo: null, texto: '', comTamanho: false })).status, 404);
    for (const url of ['/__admin/servicos/LAC/conhecimentos', '/__admin/servicos/lac/conhecimentos/', '/__admin/servicos/lac/conhecimentos/BC-1', '/__admin/servicos/lac/conhecimentos/a/b',
      '/__admin/servicos/lac/conhecimentos/..', '/__admin/servicos//conhecimentos', `/__admin/servicos/lac/conhecimentos/${'a'.repeat(61)}`]) {
      const r = await enviar(m, { url, method: 'PATCH', corpo: BLOCO, token });
      assert.ok([404, 405].includes(r.status), url);
    }
    assert.equal(retrato(raiz), antes, 'nenhuma requisição recusada gravou algo');
  });
});

test('CE16. cabeçalhos das respostas e nenhum dado real da LAC alterado', async () => {
  await comCopia(async ({ m, token }) => {
    const r = await criar(m, token);
    assert.equal(r.cabecalhos['cache-control'], 'no-store');
    assert.equal(r.cabecalhos['x-content-type-options'], 'nosniff');
    const d = await apagar(m, token, r.corpo.bloco.id);
    assert.deepEqual([d.status, d.cabecalhos['cache-control']], [204, 'no-store']);
  });
  assert.equal(hashReal(), HASH_REAL_INICIAL, 'o arquivo real da LAC não foi alterado');
  assert.deepEqual(JSON.parse(lerReal(...V1, 'conteudo-assistente.json')).blocos, BLOCOS_TESTE_REAIS);
});
