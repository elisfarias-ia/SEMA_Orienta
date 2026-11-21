// Cadastro guiado (Sprint 4, Passo 4A2): POST /__admin/cadastro-guiado. Requisições simuladas, SEMPRE contra cópias temporárias
// fora do repositório e com dados fictícios. A base real não é tocada.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { criarManipuladorAdmin, CABECALHO_TOKEN, ROTA_SESSAO, ROTA_CADASTRO_GUIADO } from '../services/admin/admin-endpoint.js';
import { validarServicos } from '../scripts/validate-services.js';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LAC = ['services', 'lac', 'versoes', 'v1'];
const AGORA = () => new Date(2026, 10, 15, 12, 0, 0);
const FONTE = { titulo: 'Fonte guiada fictícia', tipo: 'pagina_oficial', orgaoResponsavel: 'Órgão fictício', url: 'https://exemplo.test/guiada', descricao: 'Descrição fictícia.', origemOficial: true };
const fonteN = (n) => ({ ...FONTE, titulo: `Fonte guiada fictícia ${n}`, url: `https://exemplo.test/guiada-${n}` });
const SERVICO = { nome: 'Serviço Guiado Fictício', sigla: 'SGF', termosEquivalentes: ['serviço guiado fictício'] };
const ASSUNTO_NOVO = { nome: 'Assunto Guiado Fictício', descricao: 'Descrição fictícia do assunto guiado.' };

async function enviar(manipulador, { url, method = 'POST', corpo, texto, headers = {}, token, remoteAddress = '127.0.0.1', tipo = 'application/json', comTamanho = true } = {}) {
  const buffer = texto !== undefined ? Buffer.from(texto) : Buffer.from(JSON.stringify(corpo ?? {}));
  const h = { host: 'localhost:5173', ...headers };
  if (tipo !== null) h['content-type'] = tipo;
  if (comTamanho && h['content-length'] === undefined) h['content-length'] = String(buffer.length);
  if (token !== undefined) h[CABECALHO_TOKEN] = token;
  const req = Object.assign(Readable.from([buffer]), { url, method, headers: h, socket: { remoteAddress, localPort: 5173 } });
  let resposta = null;
  const res = { statusCode: 0, setHeader: () => {}, end: (t) => { resposta = t; } };
  await manipulador(req, res, () => {});
  return { status: res.statusCode, corpo: resposta === null ? null : JSON.parse(resposta), textoBruto: resposta ?? '' };
}
const get = (m, url, token) => enviar(m, { url, method: 'GET', token, tipo: null, texto: '', comTamanho: false });

// Passo 8B: o token só existe depois de escolher um usuário selecionável (POST /__admin/sessao).
const obterToken = async (m) => (await enviar(m, { url: ROTA_SESSAO, corpo: { usuarioId: 'maria-silva' } })).corpo.token;

async function comCopia(fn, opcoes = {}) {
  const pai = fs.mkdtempSync(path.join(os.tmpdir(), 'sema-orienta-guiado-endpoint-'));
  const raiz = path.join(pai, 'raiz');
  fs.mkdirSync(raiz);
  fs.cpSync(path.join(RAIZ, 'services'), path.join(raiz, 'services'), { recursive: true });
  try {
    const m = criarManipuladorAdmin({ raiz, agora: AGORA, diretorioTemporario: pai, ...opcoes });
    const token = await obterToken(m);
    const catalogo = async () => (await get(m, '/__admin/catalogo', token)).corpo;
    const assuntoDaLac = (await catalogo()).servicos.find((s) => s.id === 'lac').assuntoId;
    const postar = (corpo, extra = {}) => enviar(m, { url: ROTA_CADASTRO_GUIADO, corpo, token, ...extra });
    // Revisão (SHA-256) do fontes.json da LAC, lida como a tela a leria.
    const revisao = async () => (await get(m, '/__admin/servicos/lac/versao-atual', token)).corpo.revisaoFontes;
    return await fn({ m, token, raiz, pai, postar, catalogo, assuntoDaLac, revisao });
  } finally {
    fs.rmSync(pai, { recursive: true, force: true });
  }
}
function retrato(raiz) {
  const itens = [];
  const andar = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { itens.push(`D ${path.relative(raiz, p).split(path.sep).join("/")}`); andar(p); } else itens.push(`F ${path.relative(raiz, p).split(path.sep).join("/")} ${crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')}`);
    }
  };
  andar(raiz);
  return itens.sort().join('\n');
}
const lerJson = (raiz, ...p) => JSON.parse(fs.readFileSync(path.join(raiz, ...p), 'utf8'));
const sobras = (dir) => fs.readdirSync(dir).filter((n) => n.startsWith('sema-orienta-ensaio-') || n.endsWith('.tmp'));
const diferencas = (antes, depois) => {
  const a = new Set(antes.split('\n'));
  return depois.split('\n').filter((l) => !a.has(l));
};

// ---------- Três combinações válidas ----------

test('GE1. assunto existente + serviço existente: 201, só o fontes.json da LAC muda, as oito fontes originais ficam intactas e os ids são do servidor', async () => {
  await comCopia(async ({ postar, raiz, assuntoDaLac, revisao }) => {
    const antes = retrato(raiz);
    const originais = lerJson(raiz, ...LAC, 'fontes.json').fontes;
    const r = await postar({ assunto: { id: assuntoDaLac }, servico: { id: 'lac' }, revisao: await revisao(), fontes: [FONTE, fonteN(2)] });
    assert.equal(r.status, 201);
    assert.equal(r.corpo.revisao, await revisao());
    assert.deepEqual(r.corpo.assunto, { id: assuntoDaLac, nome: r.corpo.assunto.nome, criado: false });
    assert.equal(r.corpo.servico.criado, false);
    assert.equal(r.corpo.servico.id, 'lac');
    assert.ok(typeof r.corpo.servico.nome === 'string' && r.corpo.servico.nome.trim() !== '');
    assert.deepEqual(r.corpo.fontes.map((f) => f.id), ['fonte-guiada-ficticia', 'fonte-guiada-ficticia-2']);
    assert.deepEqual(r.corpo.proximo, { servicoId: 'lac' });
    const depois = lerJson(raiz, ...LAC, 'fontes.json').fontes;
    assert.equal(depois.length, originais.length + 2);
    assert.deepEqual(depois.slice(0, originais.length), originais);
    for (const f of depois.slice(originais.length)) {
      assert.equal(f.statusValidacao, 'rascunho');
      assert.equal(f.publicado, false);
      assert.equal(f.dataConsulta, '2026-11-15');
    }
    // Passo 8C: a auditoria privada (data/admin-private/, fora do Git) é conferida à parte.
    const mudou = diferencas(antes, retrato(raiz)).filter((l) => !/^[DF] data(\/| |$)/.test(l));
    assert.equal(mudou.length, 1);
    assert.match(mudou[0], /^F services\/lac\/versoes\/v1\/fontes\.json /);
    const auditadas = fs.readFileSync(path.join(raiz, 'data', 'admin-private', 'revisao', 'lac.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
    assert.deepEqual(auditadas.map((x) => [x.acao, x.itemId, x.ator.usuarioId]), [['cadastrar_fonte', 'fonte-guiada-ficticia', 'maria-silva'], ['cadastrar_fonte', 'fonte-guiada-ficticia-2', 'maria-silva']]);
    assert.equal(fs.existsSync(path.join(raiz, 'data', 'admin-private', 'cadastros')), false, 'tema e serviço já existiam: sem acao_cadastro');
    assert.deepEqual(validarServicos(raiz).erros, []);
  });
});

test('GE2. assunto existente + serviço novo: 201, oito arquivos novos (com entradas.json vazio) mais o registro, com as fontes, em rascunho e não publicado', async () => {
  await comCopia(async ({ postar, raiz, assuntoDaLac, catalogo }) => {
    const antes = retrato(raiz);
    const r = await postar({ assunto: { id: assuntoDaLac }, servico: SERVICO, fontes: [FONTE] });
    assert.equal(r.status, 201);
    assert.equal(r.corpo.servico.criado, true);
    assert.equal(r.corpo.servico.id, 'servico-guiado-ficticio');
    assert.equal(r.corpo.servico.versaoAtualId, 'servico-guiado-ficticio-v1');
    assert.equal(r.corpo.assunto.criado, false);
    const pasta = ['services', 'servico-guiado-ficticio', 'versoes', 'v1'];
    assert.equal(lerJson(raiz, ...pasta, 'fontes.json').fontes.length, 1);
    assert.equal(lerJson(raiz, ...pasta, 'versao.json').estado, 'rascunho');
    const cat = await catalogo();
    const novo = cat.servicos.find((s) => s.id === 'servico-guiado-ficticio');
    assert.equal(novo.assuntoId, assuntoDaLac);
    assert.equal(novo.publicado, false);
    assert.equal(novo.versaoPublicadaId, null);
    const mudou = diferencas(antes, retrato(raiz));
    assert.equal(mudou.filter((l) => l.startsWith('F services/servico-guiado-ficticio/')).length, 8);
    assert.equal(mudou.filter((l) => l.startsWith('F services/registry.json')).length, 1);
    assert.equal(mudou.filter((l) => l.startsWith('F services/lac/')).length, 0);
    assert.deepEqual(validarServicos(raiz).erros, []);
  });
});

test('GE3. assunto novo + serviço novo: 201, assunto ativo criado e serviço vinculado a ele; resposta indica para onde seguir', async () => {
  await comCopia(async ({ postar, raiz, catalogo }) => {
    const r = await postar({ assunto: ASSUNTO_NOVO, servico: SERVICO, fontes: [FONTE, fonteN(2)] });
    assert.equal(r.status, 201);
    assert.deepEqual(r.corpo.assunto, { id: 'assunto-guiado-ficticio', nome: 'Assunto Guiado Fictício', criado: true });
    assert.equal(r.corpo.servico.criado, true);
    assert.deepEqual(r.corpo.proximo, { servicoId: 'servico-guiado-ficticio' });
    const cat = await catalogo();
    const assunto = cat.assuntos.find((a) => a.id === 'assunto-guiado-ficticio');
    assert.equal(assunto.ativo, true);
    assert.equal(assunto.criadoEm, '2026-11-15');
    assert.equal(cat.servicos.find((s) => s.id === 'servico-guiado-ficticio').assuntoId, 'assunto-guiado-ficticio');
    assert.deepEqual(validarServicos(raiz).erros, []);
  });
});

// ---------- Recusas (nada muda) ----------

test('GE4. recusas de estrutura: combinação inválida, extras, ids do cliente, fontes ausentes ou demais; nada muda e nada é ecoado', async () => {
  await comCopia(async ({ postar, raiz, assuntoDaLac, pai }) => {
    const antes = retrato(raiz);
    const casos = [
      [{ assunto: ASSUNTO_NOVO, servico: { id: 'lac' }, fontes: [FONTE] }, 'combinacao_invalida', ['servico']],
      [{ assunto: { id: assuntoDaLac }, servico: SERVICO, fontes: [FONTE], publicado: true }, 'dados_invalidos', ['extras']],
      [{ assunto: { id: assuntoDaLac }, servico: SERVICO, fontes: [{ ...FONTE, id: 'segredo-xyz' }] }, 'dados_invalidos', ['fontes[0]']],
      [{ assunto: { id: assuntoDaLac }, servico: SERVICO, fontes: [{ ...FONTE, revisao: 'a'.repeat(64) }] }, 'dados_invalidos', ['fontes[0]']],
      [{ assunto: { id: assuntoDaLac }, servico: { ...SERVICO, id: 'x' }, fontes: [FONTE] }, 'dados_invalidos', ['servico']],
      [{ assunto: { id: assuntoDaLac }, servico: SERVICO, fontes: [] }, 'dados_invalidos', ['fontes']],
      [{ assunto: { id: assuntoDaLac }, servico: SERVICO, fontes: Array.from({ length: 11 }, (_, i) => fonteN(i)) }, 'dados_invalidos', ['fontes']],
      [{ assunto: { id: assuntoDaLac }, servico: SERVICO, fontes: [{ ...FONTE, url: 'http://exemplo.test/x' }] }, 'dados_invalidos', ['fontes[0].url']],
    ];
    for (const [corpo, erro, campos] of casos) {
      const r = await postar(corpo);
      assert.equal(r.status, 422, erro + campos.join());
      assert.deepEqual(r.corpo, { erro, campos });
      assert.ok(!r.textoBruto.includes('segredo-xyz'));
    }
    assert.equal(retrato(raiz), antes);
    assert.deepEqual(sobras(pai), []);
  });
});

test('GE5. inexistentes, incompatíveis, repetidos e versão congelada: 404, 422 e 409, sem alterar arquivos', async () => {
  await comCopia(async ({ postar, raiz, assuntoDaLac, pai, revisao }) => {
    // Segundo assunto fictício para provar a incompatibilidade com a LAC.
    const criado = await postar({ assunto: ASSUNTO_NOVO, servico: SERVICO, fontes: [FONTE] });
    assert.equal(criado.status, 201);
    const antes = retrato(raiz);
    const lac = { assunto: { id: assuntoDaLac }, servico: { id: 'lac' }, revisao: await revisao(), fontes: [fonteN(5)] };
    assert.deepEqual((await postar({ ...lac, assunto: { id: 'nao-existe' } })).corpo, { erro: 'nao_encontrado', campo: 'assunto' });
    assert.deepEqual((await postar({ ...lac, servico: { id: 'nao-existe' } })).corpo, { erro: 'nao_encontrado', campo: 'servico' });
    const incompativel = await postar({ ...lac, assunto: { id: 'assunto-guiado-ficticio' } });
    assert.equal(incompativel.status, 422);
    assert.deepEqual(incompativel.corpo, { erro: 'combinacao_invalida', campos: ['servico'] });
    assert.deepEqual((await postar({ assunto: ASSUNTO_NOVO, servico: { ...SERVICO, nome: 'Outro Nome' }, fontes: [fonteN(6)] })).corpo, { erro: 'ja_existe', campo: 'assunto.nome' });
    assert.deepEqual((await postar({ assunto: { id: assuntoDaLac }, servico: SERVICO, fontes: [fonteN(7)] })).corpo, { erro: 'ja_existe', campo: 'servico.nome' });
    const existente = lerJson(raiz, ...LAC, 'fontes.json').fontes[0].url;
    const urlRepetida = await postar({ ...lac, fontes: [{ ...fonteN(8), url: existente }] });
    assert.equal(urlRepetida.status, 409);
    assert.deepEqual(urlRepetida.corpo, { erro: 'ja_existe', campo: 'fontes[0].url' });
    assert.deepEqual((await postar({ ...lac, fontes: [fonteN(9), { ...fonteN(10), url: fonteN(9).url }] })).corpo, { erro: 'ja_existe', campo: 'fontes[1].url' });
    assert.equal(retrato(raiz), antes);
    const p = path.join(raiz, ...LAC, 'versao.json');
    const v = JSON.parse(fs.readFileSync(p, 'utf8'));
    fs.writeFileSync(p, JSON.stringify({ ...v, estado: 'em_validacao', hashConteudo: 'a'.repeat(64), enviadaEm: '2026-11-10' }, null, 2));
    const congelado = retrato(raiz);
    const r = await postar(lac);
    assert.equal(r.status, 409);
    assert.deepEqual(r.corpo, { erro: 'versao_nao_editavel' });
    assert.equal(retrato(raiz), congelado);
    assert.deepEqual(sobras(pai), []);
  });
});

// ---------- Rollback, trava, acesso ----------

test('GE6. falha na conferência final desfaz tudo: assunto, pasta do serviço e registro voltam byte a byte (500 genérico)', async () => {
  await comCopia(async ({ postar, raiz, pai }) => {
    const antes = retrato(raiz);
    const r = await postar({ assunto: ASSUNTO_NOVO, servico: SERVICO, fontes: [FONTE] });
    assert.equal(r.status, 500);
    assert.deepEqual(r.corpo, { erro: 'indisponivel' });
    assert.equal(retrato(raiz), antes);
    assert.ok(!fs.existsSync(path.join(raiz, 'services', 'servico-guiado-ficticio')));
    assert.deepEqual(sobras(pai), []);
  }, { verificarFinal: () => ['falha simulada'] });
});

test('GE7. a trava de escrita é a mesma: gravação em andamento faz a outra receber 409 e só uma é gravada', async () => {
  let liberar;
  const porta = new Promise((resolve) => { liberar = resolve; });
  let entrou;
  const aguardaEntrada = new Promise((resolve) => { entrou = resolve; });
  let chamadas = 0;
  await comCopia(async ({ postar, raiz, assuntoDaLac, catalogo }) => {
    const corpo = { assunto: { id: assuntoDaLac }, servico: SERVICO, fontes: [FONTE] };
    const primeira = postar(corpo);
    await aguardaEntrada;
    const segunda = await postar({ ...corpo, servico: { ...SERVICO, nome: 'Outro Serviço Guiado' } });
    assert.equal(segunda.status, 409);
    assert.deepEqual(segunda.corpo, { erro: 'operacao_em_andamento' });
    liberar();
    assert.equal((await primeira).status, 201);
    const cat = await catalogo();
    assert.ok(cat.servicos.some((s) => s.id === 'servico-guiado-ficticio'));
    assert.ok(!cat.servicos.some((s) => s.id === 'outro-servico-guiado'));
    assert.deepEqual(validarServicos(raiz).erros, []);
  }, { antesDeGravar: async () => { chamadas += 1; if (chamadas === 1) { entrou(); await porta; } } });
});

test('GE8. token, origem, método, tipo, tamanho, JSON e query são exigidos; erros genéricos', async () => {
  await comCopia(async ({ m, token, postar, raiz, assuntoDaLac }) => {
    const antes = retrato(raiz);
    const corpo = { assunto: { id: assuntoDaLac }, servico: SERVICO, fontes: [FONTE] };
    assert.equal((await enviar(m, { url: ROTA_CADASTRO_GUIADO, corpo })).status, 401);
    assert.equal((await enviar(m, { url: ROTA_CADASTRO_GUIADO, corpo, token: 'a'.repeat(64) })).status, 401);
    assert.equal((await enviar(m, { url: ROTA_CADASTRO_GUIADO, corpo, token, headers: { host: 'exemplo.test' } })).status, 403);
    assert.equal((await enviar(m, { url: ROTA_CADASTRO_GUIADO, corpo, token, headers: { origin: 'https://exemplo.test' } })).status, 403);
    assert.equal((await get(m, ROTA_CADASTRO_GUIADO, token)).status, 405);
    for (const metodo of ['PUT', 'PATCH', 'DELETE']) assert.equal((await enviar(m, { url: ROTA_CADASTRO_GUIADO, method: metodo, corpo, token })).status, 405, metodo);
    assert.equal((await postar(corpo, { tipo: 'text/plain' })).status, 415);
    assert.equal((await postar(corpo, { tipo: null })).status, 415);
    assert.equal((await postar(undefined, { texto: '{nao e json' })).status, 400);
    assert.equal((await postar(undefined, { texto: 'x'.repeat(40 * 1024) })).status, 413);
    assert.equal((await enviar(m, { url: `${ROTA_CADASTRO_GUIADO}?a=1`, corpo, token })).status, 400);
    assert.equal(retrato(raiz), antes);
  });
});

test('GE9. respostas não repetem o que foi enviado nem expõem caminhos; sem registro em log', async () => {
  const mensagens = [];
  const originais = { log: console.log, error: console.error, warn: console.warn, info: console.info };
  for (const n of Object.keys(originais)) console[n] = (...a) => mensagens.push(a.join(' '));
  try {
    await comCopia(async ({ postar, assuntoDaLac, token }) => {
      const ok = await postar({ assunto: { id: assuntoDaLac }, servico: SERVICO, fontes: [FONTE] });
      const ruim = await postar({ assunto: ASSUNTO_NOVO, servico: { ...SERVICO, nome: 'Texto sigiloso 12345' }, fontes: [{ ...FONTE, titulo: '123' }] });
      const repetido = await postar({ assunto: { id: assuntoDaLac }, servico: SERVICO, fontes: [fonteN(3)] });
      for (const r of [ok, ruim, repetido]) {
        assert.ok(!r.textoBruto.includes('sigiloso'));
        assert.ok(!/[A-Za-z]:\\|services\/|node_modules|\.json/.test(r.textoBruto.replace(/"id":"[^"]*"/g, '')));
        assert.ok(!r.textoBruto.includes(token));
      }
    });
  } finally {
    Object.assign(console, originais);
  }
  assert.deepEqual(mensagens, []);
});

// ---------- Auditoria do 4A: pastas existentes, ids, falhas de gravação e rollback ----------

/** Sistema de arquivos cuja gravação real falha UMA vez, ao renomear um temporário para um destino que termina em `sufixo`. */
const comRenameFalho = (sufixo) => {
  let falhou = false;
  return {
    ...fs,
    renameSync: (de, para) => {
      if (!falhou && String(para).split(path.sep).join('/').endsWith(sufixo)) {
        falhou = true;
        throw new Error('/caminho/secreto/falha');
      }
      return fs.renameSync(de, para);
    },
  };
};
const SEM_RASTRO = '{"erro":"indisponivel"}';

test('GE11. pasta ou arquivo já existente em services/ (inclusive com outra caixa) nunca vira id: o serviço recebe sufixo e a pasta alheia fica intacta', async () => {
  await comCopia(async ({ postar, raiz, assuntoDaLac }) => {
    fs.mkdirSync(path.join(raiz, 'services', 'xyz-orfa'));
    fs.writeFileSync(path.join(raiz, 'services', 'xyz-orfa', 'alheio.txt'), 'conteudo alheio');
    fs.mkdirSync(path.join(raiz, 'services', 'Caixa-Mista'));
    fs.writeFileSync(path.join(raiz, 'services', 'arquivo-solto.json'), '{}');
    const antes = retrato(raiz);
    const ids = [];
    for (const nome of ['Xyz Orfa', 'Caixa Mista', 'Arquivo Solto']) {
      const r = await postar({ assunto: { id: assuntoDaLac }, servico: { ...SERVICO, nome }, fontes: [FONTE] });
      assert.equal(r.status, 201, nome);
      ids.push(r.corpo.servico.id);
    }
    assert.deepEqual(ids, ['xyz-orfa-2', 'caixa-mista-2', 'arquivo-solto-2']);
    assert.equal(fs.readFileSync(path.join(raiz, 'services', 'xyz-orfa', 'alheio.txt'), 'utf8'), 'conteudo alheio');
    assert.deepEqual(fs.readdirSync(path.join(raiz, 'services', 'xyz-orfa')), ['alheio.txt']);
    assert.ok(diferencas(antes, retrato(raiz)).every((l) => !l.includes('services/xyz-orfa/')));
  });
});

test('GE12. falha na gravação em qualquer ponto desfaz tudo: estado anterior byte a byte, sem pasta nem temporário residual e resposta genérica', async () => {
  const NN = () => ({ assunto: ASSUNTO_NOVO, servico: SERVICO, fontes: [FONTE] });
  const casos = [
    ['assuntos.json (primeira gravação)', 'services/assuntos.json', NN],
    ['arquivo do serviço no meio da criação', 'versoes/v1/roteiro.md', NN],
    ['conteúdo do assistente do serviço', 'versoes/v1/conteudo-assistente.json', NN],
    ['registry.json (última gravação, assunto novo)', 'services/registry.json', NN],
    ['registry.json (última gravação, assunto existente)', 'services/registry.json', (a) => ({ assunto: { id: a }, servico: SERVICO, fontes: [FONTE] })],
    ['fontes.json de serviço existente', 'lac/versoes/v1/fontes.json', (a, rev) => ({ assunto: { id: a }, servico: { id: 'lac' }, revisao: rev, fontes: [FONTE, fonteN(2)] })],
  ];
  for (const [nome, sufixo, pedido] of casos) {
    // O ensaio roda numa cópia com o sistema real; só a gravação real usa o sistema com falha (uma vez).
    await comCopia(async ({ postar, raiz, pai, assuntoDaLac, revisao }) => {
      const antes = retrato(raiz);
      const r = await postar(pedido(assuntoDaLac, await revisao()));
      assert.equal(r.status, 500, nome);
      assert.equal(r.textoBruto, SEM_RASTRO, nome);
      assert.equal(retrato(raiz), antes, nome);
      assert.ok(!fs.existsSync(path.join(raiz, 'services', 'servico-guiado-ficticio')), nome);
      assert.deepEqual(sobras(pai), [], nome);
      assert.deepEqual(validarServicos(raiz).erros, [], nome);
    }, { sistema: comRenameFalho(sufixo) });
  }
});

test('GE13. fonte de serviço existente: falha na conferência final restaura o fontes.json byte a byte', async () => {
  await comCopia(async ({ postar, raiz, pai, assuntoDaLac, revisao }) => {
    const antes = retrato(raiz);
    const r = await postar({ assunto: { id: assuntoDaLac }, servico: { id: 'lac' }, revisao: await revisao(), fontes: [FONTE] });
    assert.equal(r.status, 500);
    assert.equal(r.textoBruto, SEM_RASTRO);
    assert.equal(retrato(raiz), antes);
    assert.deepEqual(sobras(pai), []);
  }, { verificarFinal: () => ['falha simulada'] });
});

test('GE14. títulos que geram o mesmo id não se sobrescrevem: ganham sufixo, no pedido e frente a fontes existentes', async () => {
  await comCopia(async ({ postar, raiz, assuntoDaLac, revisao }) => {
    const r = await postar({ assunto: ASSUNTO_NOVO, servico: SERVICO, fontes: [{ ...fonteN(1), titulo: 'Fonte Y!' }, { ...fonteN(2), titulo: 'Fonte Y?' }, { ...fonteN(3), titulo: 'fonte   y' }] });
    assert.equal(r.status, 201);
    assert.deepEqual(r.corpo.fontes, [{ id: 'fonte-y', titulo: 'Fonte Y!' }, { id: 'fonte-y-2', titulo: 'Fonte Y?' }, { id: 'fonte-y-3', titulo: 'fonte y' }]);
    const gravadas = lerJson(raiz, 'services', 'servico-guiado-ficticio', 'versoes', 'v1', 'fontes.json').fontes;
    assert.deepEqual(gravadas.map((f) => f.titulo), ['Fonte Y!', 'Fonte Y?', 'fonte y']);
    assert.equal(new Set(gravadas.map((f) => f.id)).size, 3);

    const originais = lerJson(raiz, ...LAC, 'fontes.json').fontes;
    const idExistente = originais[0].id;
    const r2 = await postar({ assunto: { id: assuntoDaLac }, servico: { id: 'lac' }, revisao: await revisao(), fontes: [{ ...fonteN(4), titulo: idExistente.replace(/-/g, ' ') }] });
    assert.equal(r2.status, 201);
    assert.equal(r2.corpo.fontes[0].id, `${idExistente}-2`);
    const depois = lerJson(raiz, ...LAC, 'fontes.json').fontes;
    assert.deepEqual(depois.slice(0, originais.length), originais);
    assert.equal(new Set(depois.map((f) => f.id)).size, depois.length);
  });
});

test('GE15. ids de assunto ou serviço existentes com formato inválido ou tentativa de caminho são recusados (422) e nada muda', async () => {
  await comCopia(async ({ postar, raiz, pai, assuntoDaLac }) => {
    const antes = retrato(raiz);
    const invalidos = ['../x', '..', 'a/b', 'a\\b', 'lac/../x', '%2e%2e', 'A', 'Lac', ' lac', 'lac ', '', 'a'.repeat(61), '1lac', 'lac\u0000', '..\\..\\x'];
    for (const id of invalidos) {
      const a = await postar({ assunto: { id }, servico: { id: 'lac' }, revisao: 'a'.repeat(64), fontes: [FONTE] });
      assert.deepEqual(a.corpo, { erro: 'dados_invalidos', campos: ['assunto'] }, JSON.stringify(id));
      const s = await postar({ assunto: { id: assuntoDaLac }, servico: { id }, fontes: [FONTE] });
      assert.deepEqual(s.corpo, { erro: 'dados_invalidos', campos: ['servico'] }, JSON.stringify(id));
      assert.equal(a.status, 422);
      assert.ok(!a.textoBruto.includes('..') && !s.textoBruto.includes('..'));
    }
    assert.equal(retrato(raiz), antes);
    assert.deepEqual(sobras(pai), []);
  });
});

test('GE16. revisão otimista (serviço existente): correta grava e devolve a nova; ausente, malformada, divergente ou de serviço novo recusam sem alterar nada', async () => {
  await comCopia(async ({ postar, raiz, pai, assuntoDaLac, revisao }) => {
    const base = { assunto: { id: assuntoDaLac }, servico: { id: 'lac' }, fontes: [FONTE] };
    const antes = retrato(raiz);
    const semRevisao = await postar(base);
    assert.deepEqual([semRevisao.status, semRevisao.corpo], [422, { erro: 'dados_invalidos', campos: ['revisao'] }]);
    for (const ruim of ['', 'a'.repeat(63), 'a'.repeat(65), 'A'.repeat(64), 'g'.repeat(64), 5, null]) {
      const r = await postar({ ...base, revisao: ruim });
      assert.deepEqual([r.status, r.corpo], [422, { erro: 'dados_invalidos', campos: ['revisao'] }], String(ruim));
    }
    const divergente = await postar({ ...base, revisao: 'a'.repeat(64) });
    assert.deepEqual([divergente.status, divergente.corpo], [409, { erro: 'revisao_divergente' }]);
    // Serviço novo: revisão enviada pelo cliente é recusada.
    const comRevisaoNovo = await postar({ assunto: { id: assuntoDaLac }, servico: SERVICO, revisao: await revisao(), fontes: [FONTE] });
    assert.deepEqual([comRevisaoNovo.status, comRevisaoNovo.corpo], [422, { erro: 'dados_invalidos', campos: ['revisao'] }]);
    assert.equal(retrato(raiz), antes);
    assert.deepEqual(sobras(pai), []);

    const atual = await revisao();
    const ok = await postar({ ...base, revisao: atual });
    assert.equal(ok.status, 201);
    assert.notEqual(ok.corpo.revisao, atual);
    assert.equal(ok.corpo.revisao, await revisao());
    assert.ok(!('revisao' in (await postar({ assunto: { id: assuntoDaLac }, servico: SERVICO, fontes: [fonteN(7)] })).corpo.servico));
  });
});

test('GE17. duas abas: a primeira grava; a segunda, com a revisão antiga, recebe 409 e nada é gravado; com a revisão nova, grava', async () => {
  await comCopia(async ({ postar, raiz, assuntoDaLac, revisao }) => {
    const abaA = await revisao();
    const abaB = await revisao();
    assert.equal(abaA, abaB);
    const pedido = (rev, fonte) => ({ assunto: { id: assuntoDaLac }, servico: { id: 'lac' }, revisao: rev, fontes: [fonte] });
    const primeira = await postar(pedido(abaA, fonteN(1)));
    assert.equal(primeira.status, 201);
    const depoisDaPrimeira = retrato(raiz);
    const segunda = await postar(pedido(abaB, fonteN(2)));
    assert.deepEqual([segunda.status, segunda.corpo], [409, { erro: 'revisao_divergente' }]);
    assert.equal(retrato(raiz), depoisDaPrimeira);
    assert.ok(!lerJson(raiz, ...LAC, 'fontes.json').fontes.some((f) => f.titulo === fonteN(2).titulo));
    const nova = await postar(pedido(primeira.corpo.revisao, fonteN(2)));
    assert.equal(nova.status, 201);
    assert.ok(lerJson(raiz, ...LAC, 'fontes.json').fontes.some((f) => f.titulo === fonteN(2).titulo));
    assert.deepEqual(validarServicos(raiz).erros, []);
  });
});

test('GE18. nome do serviço existente ilegível: 500 genérico, sem gravar e sem nome null; respostas de sucesso sempre trazem nome', async () => {
  await comCopia(async ({ postar, raiz, pai, assuntoDaLac, revisao }) => {
    const rev = await revisao();
    const caminho = path.join(raiz, ...LAC, 'service.json');
    const original = fs.readFileSync(caminho, 'utf8');
    const semNome = JSON.parse(original);
    delete semNome.nome;
    fs.writeFileSync(caminho, JSON.stringify(semNome, null, 2));
    const antes = retrato(raiz);
    const r = await postar({ assunto: { id: assuntoDaLac }, servico: { id: 'lac' }, revisao: rev, fontes: [FONTE] });
    assert.equal(r.status, 500);
    assert.equal(r.textoBruto, SEM_RASTRO);
    assert.ok(!r.textoBruto.includes('null'));
    assert.equal(retrato(raiz), antes);
    assert.deepEqual(sobras(pai), []);
    fs.writeFileSync(caminho, original);
    const ok = await postar({ assunto: { id: assuntoDaLac }, servico: { id: 'lac' }, revisao: rev, fontes: [FONTE] });
    assert.equal(ok.status, 201);
    assert.ok(typeof ok.corpo.servico.nome === 'string' && ok.corpo.servico.nome !== '');
    const novo = await postar({ assunto: { id: assuntoDaLac }, servico: SERVICO, fontes: [fonteN(9)] });
    assert.equal(novo.corpo.servico.nome, 'Serviço Guiado Fictício');
  });
});

// ---------- Rota antiga /__admin/servicos: helper compartilhado de nomes de pasta ----------

const ROTA_SERVICOS = '/__admin/servicos';
const servicoAntigo = (assuntoId, nome) => ({ assuntoId, nome, sigla: 'SA', termosEquivalentes: ['serviço antigo'] });

test('GE19. rota antiga /servicos: pasta órfã, outra caixa e arquivo solto nunca são reaproveitados; o caso válido continua igual', async () => {
  await comCopia(async ({ m, token, raiz, assuntoDaLac }) => {
    const postarAntigo = (nome) => enviar(m, { url: ROTA_SERVICOS, corpo: servicoAntigo(assuntoDaLac, nome), token });
    fs.mkdirSync(path.join(raiz, 'services', 'orfa-antiga'));
    fs.writeFileSync(path.join(raiz, 'services', 'orfa-antiga', 'alheio.txt'), 'conteudo alheio');
    fs.mkdirSync(path.join(raiz, 'services', 'Caixa-Antiga'));
    fs.writeFileSync(path.join(raiz, 'services', 'Caixa-Antiga', 'alheio.txt'), 'outro conteudo alheio');
    fs.writeFileSync(path.join(raiz, 'services', 'solto-antigo.json'), '{"solto":true}');
    const antes = retrato(raiz);
    const ids = [];
    for (const nome of ['Orfa Antiga', 'Caixa Antiga', 'Solto Antigo']) {
      const r = await postarAntigo(nome);
      assert.equal(r.status, 201, nome);
      ids.push(r.corpo.servico.id);
    }
    assert.deepEqual(ids, ['orfa-antiga-2', 'caixa-antiga-2', 'solto-antigo-2']);
    assert.deepEqual(fs.readdirSync(path.join(raiz, 'services', 'orfa-antiga')), ['alheio.txt']);
    assert.equal(fs.readFileSync(path.join(raiz, 'services', 'orfa-antiga', 'alheio.txt'), 'utf8'), 'conteudo alheio');
    assert.deepEqual(fs.readdirSync(path.join(raiz, 'services', 'Caixa-Antiga')), ['alheio.txt']);
    assert.equal(fs.readFileSync(path.join(raiz, 'services', 'solto-antigo.json'), 'utf8'), '{"solto":true}');
    assert.ok(diferencas(antes, retrato(raiz)).every((l) => !l.includes('services/orfa-antiga/') && !l.includes('Caixa-Antiga/') && !l.includes('solto-antigo.json')));
    // Comportamento válido anterior: nome livre vira id simples e a base continua válida.
    const normal = await postarAntigo('Serviço Antigo Fictício');
    assert.equal(normal.status, 201);
    assert.equal(normal.corpo.servico.id, 'servico-antigo-ficticio');
    assert.equal(normal.corpo.servico.estado, 'rascunho');
    assert.equal(normal.corpo.servico.publicado, false);
    assert.deepEqual(validarServicos(raiz).erros, []);
  });
});

test('GE20. nome do assunto existente ilegível: 500 genérico sem gravar; revisão malformada é 422 antes de consultar a existência; sucesso sempre traz assunto.nome', async () => {
  await comCopia(async ({ postar, raiz, pai, assuntoDaLac, revisao }) => {
    const rev = await revisao();
    // Decisão: a estrutura (inclusive o formato da revisão) é validada antes de qualquer consulta à base, sem enumerar ids.
    const semConsulta = await postar({ assunto: { id: assuntoDaLac }, servico: { id: 'nao-existe' }, revisao: 'curta', fontes: [FONTE] });
    assert.deepEqual([semConsulta.status, semConsulta.corpo], [422, { erro: 'dados_invalidos', campos: ['revisao'] }]);
    const existenteSemRevisaoValida = await postar({ assunto: { id: 'assunto-que-nao-existe' }, servico: { id: 'lac' }, revisao: 'curta', fontes: [FONTE] });
    assert.deepEqual([existenteSemRevisaoValida.status, existenteSemRevisaoValida.corpo], [422, { erro: 'dados_invalidos', campos: ['revisao'] }]);

    const caminho = path.join(raiz, 'services', 'assuntos.json');
    const original = fs.readFileSync(caminho, 'utf8');
    for (const nome of [undefined, '', '   ', 5, null]) {
      const doc = JSON.parse(original);
      for (const a of doc.assuntos) if (a.id === assuntoDaLac) { if (nome === undefined) delete a.nome; else a.nome = nome; }
      fs.writeFileSync(caminho, JSON.stringify(doc, null, 2));
      const antes = retrato(raiz);
      for (const pedido of [
        { assunto: { id: assuntoDaLac }, servico: { id: 'lac' }, revisao: rev, fontes: [FONTE] },
        { assunto: { id: assuntoDaLac }, servico: SERVICO, fontes: [FONTE] },
      ]) {
        const r = await postar(pedido);
        assert.equal(r.status, 500, String(nome));
        assert.equal(r.textoBruto, SEM_RASTRO);
        assert.equal(retrato(raiz), antes);
      }
      assert.deepEqual(sobras(pai), []);
    }
    fs.writeFileSync(caminho, original);
    const ok = await postar({ assunto: { id: assuntoDaLac }, servico: { id: 'lac' }, revisao: rev, fontes: [FONTE] });
    assert.equal(ok.status, 201);
    assert.ok(typeof ok.corpo.assunto.nome === 'string' && ok.corpo.assunto.nome.trim() !== '');
    const novo = await postar({ assunto: ASSUNTO_NOVO, servico: SERVICO, fontes: [fonteN(5)] });
    assert.equal(novo.corpo.assunto.nome, 'Assunto Guiado Fictício');
  });
});

test('GE10. a base real permanece inalterada pelos testes: LAC com oito fontes e nenhum serviço ou assunto guiado', () => {
  assert.equal(lerJson(RAIZ, ...LAC, 'fontes.json').fontes.length, 8);
  assert.ok(!fs.existsSync(path.join(RAIZ, 'services', 'servico-guiado-ficticio')));
  assert.ok(!lerJson(RAIZ, 'services', 'assuntos.json').assuntos.some((a) => a.id === 'assunto-guiado-ficticio'));
  assert.ok(!lerJson(RAIZ, 'services', 'registry.json').servicos.some((s) => s.id === 'servico-guiado-ficticio'));
});
