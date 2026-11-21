// Passo 5C (parte A): autorização, publicação e conteúdo público. Sempre em cópias temporárias fora do repositório, com dados
// fictícios; a base real e o armazenamento privado real não são tocados (retrato por hash antes e depois).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { criarManipuladorAdmin, CABECALHO_TOKEN, ROTA_SESSAO } from '../services/admin/admin-endpoint.js';
import { calcularHashDaVersao } from '../services/admin/conteudo-versao.js';
import { criarServicoPublicacao } from '../services/admin/publicacao.js';
import { criarServicoRevisao } from '../services/admin/revisao-servico.js';
import { lerArquivosDaVersao } from '../services/admin/versao-arquivos.js';
import { gerarConteudoPublico, integridadeDoCorpo, lerConteudoPublicado, validarConteudoPublico } from '../services/publicacao-publica.js';
import { validarServicos } from '../scripts/validate-services.js';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const AGORA = () => new Date(2026, 10, 17, 12, 0, 0);
const MANUAL = 'manual-lac-siga-2020';
const URL_MANUAL = 'https://sema.mt.gov.br/site/phocadownload/SEMAMT%20-%20LAC%20-%20MANUAL.pdf';
const TEXTO_ORIGINAL = 'Texto original interno fictício que nunca deve ir ao público.';

function retrato(raiz, pastas = ['services', 'data']) {
  const itens = [];
  const andar = (d) => {
    if (!fs.existsSync(d)) return;
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
  for (const p of pastas) andar(path.join(raiz, p));
  return itens.sort();
}
const RETRATO_REAL_ANTES = retrato(RAIZ);
const EXISTIA_DATA = fs.existsSync(path.join(RAIZ, 'data'));

const lerJ = (raiz, ...p) => JSON.parse(fs.readFileSync(path.join(raiz, ...p), 'utf8'));
const gravarJ = (raiz, p, d) => fs.writeFileSync(path.join(raiz, ...p), `${JSON.stringify(d, null, 2)}\n`);
const arq = (nome, n = 1) => ['services', 'lac', 'versoes', `v${n}`, nome];
const manifesto = (raiz, n = 1) => lerJ(raiz, ...arq('versao.json', n));
const registro = (raiz) => lerJ(raiz, 'services', 'registry.json').servicos[0];
const pastaPublica = (raiz) => path.join(raiz, 'services', 'lac', 'publico');
const arquivosPublicos = (raiz) => (fs.existsSync(pastaPublica(raiz)) ? fs.readdirSync(pastaPublica(raiz)).sort() : []);
const bloco = (id, titulo, fonteIds, extra = {}) => ({
  id, tipo: 'conhecimento', titulo, texto: `Orientação fictícia aprovada: ${titulo}.`, fonteIds,
  referencias: fonteIds.map((f) => ({ fonteId: f, localizacao: 'página 1' })), origem: 'fonte', ambiente: 'publico',
  statusValidacao: 'rascunho', publicado: false, revisaoAtualidade: 'pendente', criadoEm: '2026-11-10', atualizadoEm: '2026-11-10', ...extra,
});

async function enviar(m, { url, method = 'POST', corpo, token, cabecalhos = {} } = {}) {
  const buffer = method === 'GET' ? Buffer.alloc(0) : Buffer.from(JSON.stringify(corpo ?? {}));
  const headers = { host: 'localhost:5173', ...cabecalhos };
  if (method !== 'GET') { headers['content-type'] = 'application/json'; headers['content-length'] = String(buffer.length); }
  if (token !== undefined) headers[CABECALHO_TOKEN] = token;
  const req = Object.assign(Readable.from([buffer]), { url, method, headers, socket: { remoteAddress: '127.0.0.1', localPort: 5173 } });
  let resposta = null;
  const res = { statusCode: 0, setHeader: () => {}, end: (t) => { resposta = t; } };
  await m(req, res, () => {});
  return { status: res.statusCode, corpo: resposta === null ? null : JSON.parse(resposta), bruto: resposta ?? '' };
}

// Passo 8B: o token só existe depois de escolher um usuário selecionável (POST /__admin/sessao).
const obterToken = async (m) => (await enviar(m, { url: ROTA_SESSAO, corpo: { usuarioId: 'maria-silva' } })).corpo.token;

/** Cópia temporária com duas informações em elaboração: uma de link (manual) e uma de texto cadastrado. */
async function comCopia(fn, opcoes = {}) {
  const pai = fs.mkdtempSync(path.join(os.tmpdir(), 'sema-orienta-publicacao-'));
  const raiz = path.join(pai, 'raiz');
  fs.mkdirSync(raiz);
  fs.cpSync(path.join(RAIZ, 'services'), path.join(raiz, 'services'), { recursive: true });
  try {
    const m = criarManipuladorAdmin({ raiz, agora: AGORA, diretorioTemporario: pai, ...opcoes });
    const token = await obterToken(m);
    const post = (rota, corpo, cabecalhos) => enviar(m, { url: `/__admin/servicos/lac/${rota}`, corpo, token, cabecalhos });
    const get = (rota) => enviar(m, { url: `/__admin/servicos/lac/${rota}`, method: 'GET', token });
    const ctx = { m, token, raiz, post, get, pai };
    ctx.preparar = async () => {
      assert.equal((await post('entradas-texto', { titulo: 'Texto interno fictício', texto: TEXTO_ORIGINAL })).status, 201);
      const idTexto = lerJ(raiz, ...arq('fontes.json')).fontes.find((f) => f.formaEntrada === 'texto').id;
      const c = lerJ(raiz, ...arq('conteudo-assistente.json'));
      c.blocos.push(bloco('bc-link', 'Informação de link', [MANUAL]), bloco('bc-texto', 'Informação de texto', [idTexto]));
      gravarJ(raiz, arq('conteudo-assistente.json'), c);
      ctx.idTexto = idTexto;
    };
    await fn(ctx);
  } finally {
    fs.rmSync(pai, { recursive: true, force: true });
  }
}

/** Revisa as fontes usadas, aceita as informações e conclui a revisão da versão atual (chama só funções existentes). */
function revisarEConcluir(raiz) {
  const rev = criarServicoRevisao({ raiz, agora: AGORA });
  const sit = () => rev.consultar('lac').situacao;
  for (const id of sit().fontes.filter((f) => f.usadaPorBloco && !f.revisada).map((f) => f.id)) {
    assert.equal(rev.revisarFonte('lac', { fonteId: id, revisao: sit().revisao }).ok, true);
  }
  for (const id of sit().blocos.filter((b) => !b.aceito).map((b) => b.id)) {
    assert.equal(rev.aceitarBloco('lac', { blocoId: id, revisao: sit().revisao }).ok, true);
  }
  const r = rev.concluirRevisao('lac', { revisao: sit().revisao });
  assert.equal(r.ok, true);
  return { rev, revisao: r.hash };
}
const publicador = (raiz, extra = {}) => criarServicoPublicacao({ raiz, agora: AGORA, ...extra });

/** Leva a versão até validado_materialmente (sem autorizar). */
async function ateValidada(ctx) {
  await ctx.preparar();
  return revisarEConcluir(ctx.raiz);
}
/** Leva a versão até autorizado_publicacao. */
async function ateAutorizada(ctx) {
  const v = await ateValidada(ctx);
  const pub = publicador(ctx.raiz);
  assert.equal(pub.autorizar('lac', { revisao: v.revisao }).ok, true);
  return { ...v, pub };
}

test('P1. concluir a revisão NÃO autoriza nem publica: registro, estado e pasta pública ficam como estavam', async () => {
  await comCopia(async (ctx) => {
    const { raiz } = ctx;
    await ateValidada(ctx);
    assert.equal(manifesto(raiz).estado, 'validado_materialmente');
    assert.deepEqual([registro(raiz).publicado, registro(raiz).versaoPublicadaId, registro(raiz).statusValidacao], [false, null, 'em_validacao']);
    assert.deepEqual(arquivosPublicos(raiz), []);
    assert.equal(lerConteudoPublicado(raiz, 'lac'), null);
    assert.deepEqual(validarServicos(raiz).erros, []);
  });
});

test('P2. autorizar: válido leva a autorizado_publicacao, sem publicar, e o histórico guarda só metadados', async () => {
  await comCopia(async (ctx) => {
    const { raiz } = ctx;
    const { revisao } = await ateValidada(ctx);
    const pub = publicador(raiz);
    const r = pub.autorizar('lac', { revisao });
    assert.deepEqual([r.ok, r.estado, r.revisao], [true, 'autorizado_publicacao', revisao]);
    const m = manifesto(raiz);
    assert.deepEqual([m.estado, m.hashConteudo], ['autorizado_publicacao', revisao]);
    assert.deepEqual([registro(raiz).publicado, registro(raiz).versaoPublicadaId], [false, null]);
    assert.deepEqual(arquivosPublicos(raiz), []);
    assert.deepEqual(validarServicos(raiz).erros, []);
    const acoes = fs.readFileSync(path.join(raiz, 'data', 'admin-private', 'revisao', 'lac.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    const ultima = acoes.at(-1);
    assert.deepEqual([ultima.acao, ultima.resultado, ultima.versaoId, ultima.hashConteudo], ['autorizar_publicacao', 'ok', 'lac-v1', revisao]);
    const bruto = fs.readFileSync(path.join(raiz, 'data', 'admin-private', 'revisao', 'lac.jsonl'), 'utf8') + fs.readFileSync(path.join(raiz, 'data', 'admin-private', 'decisoes', 'lac.jsonl'), 'utf8');
    assert.ok(!bruto.includes('Orientação fictícia') && !bruto.includes(TEXTO_ORIGINAL) && !bruto.includes('https://'));
    const decisoes = fs.readFileSync(path.join(raiz, 'data', 'admin-private', 'decisoes', 'lac.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    assert.deepEqual(decisoes.map((d) => d.tipo), ['decisao_material', 'autorizacao_publicacao']);
    // autorizar de novo: o estado já não é o esperado
    assert.equal(pub.autorizar('lac', { revisao }).erro, 'estado_invalido');
  });
});

test('P3. autorizar é recusado (e nada muda) com estado errado, revisão divergente, hash divergente, pendências, conteúdo excluído citado e histórico incompatível', async () => {
  // estado errado: ainda em elaboração
  await comCopia(async (ctx) => {
    await ctx.preparar();
    const antes = retrato(ctx.raiz);
    const rev = criarServicoRevisao({ raiz: ctx.raiz, agora: AGORA });
    assert.equal(publicador(ctx.raiz).autorizar('lac', { revisao: rev.consultar('lac').situacao.revisao }).erro, 'estado_invalido');
    assert.equal(publicador(ctx.raiz).publicar('lac', { revisao: rev.consultar('lac').situacao.revisao }).erro, 'estado_invalido');
    assert.deepEqual(retrato(ctx.raiz), antes);
  });
  // estado errado (publicar sem autorizar) e revisão divergente
  await comCopia(async (ctx) => {
    const { revisao } = await ateValidada(ctx);
    const antes = retrato(ctx.raiz);
    const pub = publicador(ctx.raiz);
    assert.equal(pub.publicar('lac', { revisao }).erro, 'estado_invalido');
    assert.equal(pub.autorizar('lac', { revisao: 'a'.repeat(64) }).erro, 'revisao_divergente');
    assert.equal(pub.autorizar('nao-existe', { revisao }).erro, 'servico_nao_encontrado');
    assert.deepEqual(retrato(ctx.raiz), antes);
  });
  // hash divergente: o conteúdo mudou depois de congelado
  await comCopia(async (ctx) => {
    await ateValidada(ctx);
    const c = lerJ(ctx.raiz, ...arq('conteudo-assistente.json'));
    c.blocos.find((b) => b.id === 'bc-link').texto = 'Texto alterado fora do fluxo.';
    gravarJ(ctx.raiz, arq('conteudo-assistente.json'), c);
    const novo = calcularHashDaVersao(lerArquivosDaVersao({ raiz: ctx.raiz, servicoId: 'lac', versaoId: 'lac-v1' }).arquivos).hash;
    const antes = retrato(ctx.raiz);
    assert.equal(publicador(ctx.raiz).autorizar('lac', { revisao: novo }).erro, 'hash_divergente');
    assert.deepEqual(retrato(ctx.raiz), antes);
  });
  // pendências: informação em elaboração com manifesto e hash coerentes
  await comCopia(async (ctx) => {
    await ateValidada(ctx);
    const c = lerJ(ctx.raiz, ...arq('conteudo-assistente.json'));
    c.blocos.push(bloco('bc-pendente', 'Pendente', [MANUAL]));
    gravarJ(ctx.raiz, arq('conteudo-assistente.json'), c);
    const novo = calcularHashDaVersao(lerArquivosDaVersao({ raiz: ctx.raiz, servicoId: 'lac', versaoId: 'lac-v1' }).arquivos).hash;
    gravarJ(ctx.raiz, arq('versao.json'), { ...manifesto(ctx.raiz), hashConteudo: novo });
    const r = publicador(ctx.raiz).autorizar('lac', { revisao: novo });
    assert.deepEqual([r.ok, r.erro, r.pendencias.map((p) => p.codigo)], [false, 'revisao_incompleta', ['bloco_pendente']]);
  });
  // conteúdo excluído citado
  await comCopia(async (ctx) => {
    await ateValidada(ctx);
    const f = lerJ(ctx.raiz, ...arq('fontes.json'));
    f.fontes.find((x) => x.id === MANUAL).excluidaEm = '2026-11-16';
    gravarJ(ctx.raiz, arq('fontes.json'), f);
    const novo = calcularHashDaVersao(lerArquivosDaVersao({ raiz: ctx.raiz, servicoId: 'lac', versaoId: 'lac-v1' }).arquivos).hash;
    gravarJ(ctx.raiz, arq('versao.json'), { ...manifesto(ctx.raiz), hashConteudo: novo });
    const antes = retrato(ctx.raiz);
    assert.equal(publicador(ctx.raiz).autorizar('lac', { revisao: novo }).erro, 'conteudo_excluido_citado');
    assert.deepEqual(retrato(ctx.raiz), antes);
  });
  // histórico incompatível: manifesto e hash corretos, mas sem a decisão material correspondente (nunca se decide só pelo manifesto)
  await comCopia(async (ctx) => {
    const { revisao } = await ateValidada(ctx);
    fs.rmSync(path.join(ctx.raiz, 'data', 'admin-private', 'decisoes', 'lac.jsonl'));
    assert.equal(publicador(ctx.raiz).autorizar('lac', { revisao }).erro, 'historico_incompativel');
    assert.equal(manifesto(ctx.raiz).estado, 'validado_materialmente');
  });
});

test('P4. publicar: estado publicado, registro atualizado, arquivo público com o hash da versão no nome e base válida', async () => {
  await comCopia(async (ctx) => {
    const { raiz } = ctx;
    const { pub, revisao } = await ateAutorizada(ctx);
    const r = pub.publicar('lac', { revisao });
    assert.deepEqual([r.ok, r.estado, r.revisao], [true, 'publicado', revisao]);
    const m = manifesto(raiz);
    assert.deepEqual([m.estado, m.hashConteudo, m.publicadoEm], ['publicado', revisao, '2026-11-17']);
    assert.equal(publicador(raiz).resumo('lac').resumo.dataPublicacao, '2026-11-17');
    assert.deepEqual(registro(raiz), {
      arquivo: 'services/lac/versoes/v1/service.json', assuntoId: 'licenciamento-ambiental', id: 'lac', publicado: true, statusValidacao: 'validado', versaoAtualId: 'lac-v1', versaoPublicadaId: 'lac-v1',
    });
    assert.deepEqual(arquivosPublicos(raiz), [`conteudo-${revisao.slice(0, 16)}.json`]);
    assert.deepEqual(validarServicos(raiz).erros, []);
    const lido = lerConteudoPublicado(raiz, 'lac');
    assert.notEqual(lido, null);
    assert.deepEqual(validarConteudoPublico(lido), []);
    assert.equal(lido.servico.nome, 'Licença por Adesão e Compromisso');
    assert.equal(lido.tema.nome, 'Licenciamento Ambiental');
    // a publicação não altera o conteúdo congelado: o hash continua o mesmo
    assert.equal(calcularHashDaVersao(lerArquivosDaVersao({ raiz, servicoId: 'lac', versaoId: 'lac-v1' }).arquivos).hash, revisao);
    const acoes = fs.readFileSync(path.join(raiz, 'data', 'admin-private', 'revisao', 'lac.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    assert.equal(acoes.at(-1).acao, 'publicar');
    // publicar de novo e autorizar depois de publicado: estado inválido
    assert.equal(pub.publicar('lac', { revisao }).erro, 'estado_invalido');
    assert.equal(pub.autorizar('lac', { revisao }).erro, 'estado_invalido');
  });
});

test('P5. conteúdo público: texto cadastrado sem fonte, link só com a URL, e nada de interno (campos, ids, caminhos, texto original, rascunhos)', async () => {
  await comCopia(async (ctx) => {
    const { raiz } = ctx;
    const { pub, revisao } = await ateAutorizada(ctx);
    assert.equal(pub.publicar('lac', { revisao }).ok, true);
    const arquivo = path.join(pastaPublica(raiz), `conteudo-${revisao.slice(0, 16)}.json`);
    const texto = fs.readFileSync(arquivo, 'utf8');
    const obj = JSON.parse(texto);
    assert.deepEqual(Object.keys(obj).sort(), ['formato', 'informacoes', 'integridade', 'servico', 'tema']);
    assert.deepEqual(obj.informacoes.map((i) => Object.keys(i).sort()), [['alertas', 'links', 'texto', 'tipo', 'titulo'], ['alertas', 'links', 'texto', 'tipo', 'titulo']]);
    const porTitulo = Object.fromEntries(obj.informacoes.map((i) => [i.titulo, i]));
    assert.deepEqual([porTitulo['Informação de texto'].tipo, porTitulo['Informação de texto'].links], ['texto', []]);
    assert.deepEqual([porTitulo['Informação de link'].tipo, porTitulo['Informação de link'].links], ['link', [{ url: URL_MANUAL }]]);
    // proibidos
    for (const proibido of [TEXTO_ORIGINAL, 'Texto interno fictício', ctx.idTexto, MANUAL, 'bc-link', 'bc-texto', 'fonteIds', 'entradas', 'rascunho', 'historico', 'decisao', 'token', 'services/', 'versoes', 'lac-v1', revisao,
      'faq-lac-2022', 'sema-orientacoes-lac', 'teste_local', 'limitacao', 'statusValidacao', 'publicado', 'admin', 'data/']) {
      assert.ok(!texto.includes(proibido), `não deve conter "${proibido}"`);
    }
    assert.doesNotMatch(texto, /[A-Za-z]:\\|\\\\|\/Users\//);
    // só a URL da fonte usada pela informação de link entra; as demais fontes (não usadas) ficam de fora
    assert.equal(texto.split('https://').length - 1, 1);
  });
});

test('P6. rollback total em CADA gravação da publicação (arquivo público, manifesto, registro, histórico, pasta, conferência final) e nova tentativa funciona', async () => {
  const casos = [
    ['arquivo público', (sis, ativo) => ({ ...sis, renameSync: (a, b) => { if (ativo.v && String(b).includes('conteudo-')) throw new Error('falha injetada'); return fs.renameSync(a, b); } })],
    ['manifesto', (sis, ativo) => ({ ...sis, renameSync: (a, b) => { if (ativo.v && String(b).endsWith('versao.json')) throw new Error('falha injetada'); return fs.renameSync(a, b); } })],
    ['registro', (sis, ativo) => ({ ...sis, renameSync: (a, b) => { if (ativo.v && String(b).endsWith('registry.json')) throw new Error('falha injetada'); return fs.renameSync(a, b); } })],
    ['histórico', (sis, ativo) => ({ ...sis, renameSync: (a, b) => { if (ativo.v && String(b).endsWith('lac.jsonl')) throw new Error('falha injetada'); return fs.renameSync(a, b); } })],
    ['pasta pública', (sis, ativo) => ({ ...sis, mkdirSync: (p, o) => { if (ativo.v && String(p).endsWith('publico')) throw new Error('falha injetada'); return fs.mkdirSync(p, o); } })],
  ];
  for (const [nome, montar] of casos) {
    await comCopia(async (ctx) => {
      const { raiz } = ctx;
      const { revisao } = await ateAutorizada(ctx);
      const antes = retrato(raiz);
      const ativo = { v: true };
      const r = publicador(raiz, { sistema: montar(fs, ativo) }).publicar('lac', { revisao });
      assert.equal(r.ok, false, nome);
      assert.equal(r.revertido, true, nome);
      assert.deepEqual(retrato(raiz), antes, `nada muda (${nome})`);
      assert.equal(manifesto(raiz).estado, 'autorizado_publicacao', nome);
      assert.deepEqual(arquivosPublicos(raiz), [], nome);
      assert.ok(!fs.existsSync(pastaPublica(raiz)), `a pasta pública criada também é desfeita (${nome})`);
      // sem a falha, a mesma publicação funciona
      assert.equal(publicador(raiz).publicar('lac', { revisao }).ok, true, nome);
    });
  }
  // falha na conferência final (depois de TODAS as gravações)
  await comCopia(async (ctx) => {
    const { raiz } = ctx;
    const { revisao } = await ateAutorizada(ctx);
    const antes = retrato(raiz);
    let chamadas = 0;
    const r = publicador(raiz, { verificarFinal: () => { chamadas += 1; return chamadas === 1 ? [] : ['recusado']; } }).publicar('lac', { revisao });
    assert.deepEqual([r.ok, r.erro, r.revertido], [false, 'dados_invalidos', true]);
    assert.deepEqual(retrato(raiz), antes);
  });
});

test('P7. autorizar: falha de escrita ou de histórico desfaz tudo', async () => {
  for (const alvo of ['versao.json', 'lac.jsonl']) {
    await comCopia(async (ctx) => {
      const { raiz } = ctx;
      const { revisao } = await ateValidada(ctx);
      const antes = retrato(raiz);
      const sistema = { ...fs, renameSync: (a, b) => { if (String(b).endsWith(alvo)) throw new Error('falha injetada'); return fs.renameSync(a, b); } };
      const r = publicador(raiz, { sistema }).autorizar('lac', { revisao });
      assert.equal(r.ok, false, alvo);
      assert.equal(manifesto(raiz).estado, 'validado_materialmente', alvo);
      assert.deepEqual(registro(raiz).versaoPublicadaId, null);
      if (alvo === 'versao.json') assert.deepEqual(retrato(raiz), antes);
      assert.equal(publicador(raiz).autorizar('lac', { revisao }).ok, true, 'a nova tentativa funciona');
    });
  }
});

test('P8. versão publicada + nova versão em elaboração: versaoAtualId segue a nova, a publicada fica byte a byte e continua sendo servida; depois a v2 publica e a v1 permanece', async () => {
  await comCopia(async (ctx) => {
    const { raiz } = ctx;
    const { pub, rev, revisao } = await ateAutorizada(ctx);
    assert.equal(pub.publicar('lac', { revisao }).ok, true);
    const v1 = retrato(raiz, ['services/lac/versoes/v1', 'services/lac/publico']);
    const publicadoV1 = lerConteudoPublicado(raiz, 'lac');
    assert.equal(rev.criarNovaVersao('lac').ok, true);
    const reg = registro(raiz);
    assert.deepEqual([reg.versaoAtualId, reg.versaoPublicadaId, reg.publicado], ['lac-v2', 'lac-v1', true]);
    assert.deepEqual(retrato(raiz, ['services/lac/versoes/v1', 'services/lac/publico']), v1, 'a versão publicada fica intacta');
    assert.deepEqual(validarServicos(raiz).erros, []);
    assert.deepEqual(lerConteudoPublicado(raiz, 'lac'), publicadoV1, 'o público continua sendo a v1');
    assert.equal(manifesto(raiz, 2).estado, 'rascunho');
    const resumo = publicador(raiz).resumo('lac').resumo;
    assert.deepEqual([resumo.versao, resumo.podeAutorizar, resumo.podePublicar, resumo.publicado], [2, false, false, false]);
    // a v2 é revisada, autorizada e publicada: a publicada passa a ser a v2; o arquivo da v1 permanece no disco
    const c2 = revisarEConcluir(raiz);
    const pub2 = publicador(raiz);
    assert.equal(pub2.autorizar('lac', { revisao: c2.revisao }).ok, true);
    assert.equal(pub2.publicar('lac', { revisao: c2.revisao }).ok, true);
    const reg2 = registro(raiz);
    assert.deepEqual([reg2.versaoAtualId, reg2.versaoPublicadaId], ['lac-v2', 'lac-v2']);
    assert.equal(arquivosPublicos(raiz).length, 2);
    assert.deepEqual(validarServicos(raiz).erros, []);
    assert.notEqual(lerConteudoPublicado(raiz, 'lac'), null);
  });
});

test('P9. gerador: só informações aceitas com fontes ativas; excluídas, rascunhos, rejeitadas, teste_local e fontes não usadas ficam de fora', () => {
  const service = { nome: 'Serviço Fictício' };
  const fonte = (id, extra = {}) => ({ id, titulo: `Título técnico ${id}`, tipo: 'pagina_oficial', url: `https://exemplo.test/${id}`, statusValidacao: 'validado', vigencia: { situacao: 'vigente' }, ...extra });
  const fontes = { fontes: [fonte('f-ok'), fonte('f-excluida', { excluidaEm: '2026-11-01' }), fonte('f-revogada', { vigencia: { situacao: 'revogada' } }), fonte('f-pendente', { statusValidacao: 'em_validacao' }),
    fonte('f-nao-usada'), fonte('f-texto', { formaEntrada: 'texto', url: null })] };
  const aceito = (id, fonteIds, extra = {}) => bloco(id, `Título ${id}`, fonteIds, { statusValidacao: 'validado', revisaoAtualidade: 'concluida', ...extra });
  const conteudoAssistente = { blocos: [
    aceito('a-ok', ['f-ok']), aceito('a-texto', ['f-texto'], { alertas: ['Alerta fictício.'] }), aceito('a-misto', ['f-texto', 'f-ok']),
    aceito('a-excluida', ['f-excluida']), aceito('a-parcial', ['f-ok', 'f-excluida']), aceito('a-revogada', ['f-revogada']), aceito('a-pendente', ['f-pendente']),
    bloco('r-rascunho', 'Rascunho', ['f-ok']), aceito('t-local', ['f-ok'], { tipo: 'limitacao', ambiente: 'teste_local' }), aceito('sem-fonte', []),
  ] };
  const r = gerarConteudoPublico({ service, fontes, conteudoAssistente }, { temaNome: 'Tema Fictício' });
  assert.equal(r.ok, true);
  assert.deepEqual(r.conteudo.informacoes.map((i) => i.titulo), ['Título a-ok', 'Título a-texto', 'Título a-misto']);
  assert.deepEqual(r.conteudo.informacoes.map((i) => [i.tipo, i.links]), [['link', [{ url: 'https://exemplo.test/f-ok' }]], ['texto', []], ['link', [{ url: 'https://exemplo.test/f-ok' }]]]);
  assert.deepEqual(r.conteudo.informacoes[1].alertas, ['Alerta fictício.']);
  const json = JSON.stringify(r.conteudo);
  for (const proibido of ['f-excluida', 'f-revogada', 'f-pendente', 'f-nao-usada', 'f-texto', 'Título técnico', 'Rascunho', 'teste_local']) assert.ok(!json.includes(proibido), proibido);
  assert.deepEqual(validarConteudoPublico(r.conteudo), []);
  // sem informação aceita publicável: não gera
  assert.deepEqual(gerarConteudoPublico({ service, fontes, conteudoAssistente: { blocos: [bloco('r', 'R', ['f-ok'])] } }, { temaNome: 'T' }), { ok: false, erro: 'sem_informacao_aceita' });
  assert.equal(gerarConteudoPublico({ service, fontes, conteudoAssistente }, {}).ok, false);
});

test('P10. validarConteudoPublico: esquema fechado (campos extras ou proibidos, integridade e URL insegura são recusados)', () => {
  const corpo = { formato: 1, servico: { nome: 'S' }, tema: { nome: 'T' }, informacoes: [{ titulo: 'I', texto: 'Texto.', tipo: 'link', links: [{ url: 'https://exemplo.test/x' }], alertas: [] }] };
  const bom = { ...corpo, integridade: integridadeDoCorpo(corpo) };
  assert.deepEqual(validarConteudoPublico(bom), []);
  const refaz = (c) => ({ ...c, integridade: integridadeDoCorpo(c) });
  const variantes = [
    { ...bom, entradas: [] },
    { ...bom, historico: [] },
    { ...bom, token: 'x' },
    { ...bom, servico: { nome: 'S', id: 'lac' } },
    { ...bom, tema: { nome: 'T', caminho: 'services/x' } },
    refaz({ ...corpo, informacoes: [{ ...corpo.informacoes[0], fonteIds: ['x'] }] }),
    refaz({ ...corpo, informacoes: [{ ...corpo.informacoes[0], rascunho: true }] }),
    refaz({ ...corpo, informacoes: [{ ...corpo.informacoes[0], links: [{ url: 'https://exemplo.test/x', titulo: 'Fonte técnica' }] }] }),
    refaz({ ...corpo, informacoes: [{ ...corpo.informacoes[0], links: [{ url: 'http://exemplo.test/x' }] }] }),
    refaz({ ...corpo, informacoes: [{ ...corpo.informacoes[0], links: [{ url: 'javascript:alert(1)' }] }] }),
    refaz({ ...corpo, informacoes: [{ ...corpo.informacoes[0], tipo: 'texto' }] }),
    refaz({ ...corpo, informacoes: [] }),
    { ...bom, informacoes: [{ ...corpo.informacoes[0], texto: 'Texto adulterado.' }] },
    { ...bom, integridade: 'x' },
    { ...bom, formato: 2 },
    null, [], 'texto',
  ];
  for (const v of variantes) assert.ok(validarConteudoPublico(v).length > 0, JSON.stringify(v)?.slice(0, 80));
});

test('P11. leitura falha de forma segura (null): arquivo adulterado, renomeado, removido, registro ou manifesto incoerentes', async () => {
  await comCopia(async (ctx) => {
    const { raiz } = ctx;
    const { pub, revisao } = await ateAutorizada(ctx);
    assert.equal(pub.publicar('lac', { revisao }).ok, true);
    const arquivo = path.join(pastaPublica(raiz), `conteudo-${revisao.slice(0, 16)}.json`);
    const original = fs.readFileSync(arquivo, 'utf8');
    const reg = fs.readFileSync(path.join(raiz, 'services', 'registry.json'), 'utf8');
    const man = fs.readFileSync(path.join(raiz, ...arq('versao.json')), 'utf8');
    assert.notEqual(lerConteudoPublicado(raiz, 'lac'), null);
    assert.equal(lerConteudoPublicado(raiz, 'outro-servico'), null);
    assert.equal(lerConteudoPublicado('/pasta/que/nao/existe', 'lac'), null);
    // texto adulterado sem refazer a integridade
    const obj = JSON.parse(original);
    fs.writeFileSync(arquivo, JSON.stringify({ ...obj, informacoes: [{ ...obj.informacoes[0], texto: 'Adulterado.' }, obj.informacoes[1]] }));
    assert.equal(lerConteudoPublicado(raiz, 'lac'), null);
    // texto adulterado COM a integridade refeita: não bate com o que a versão gera
    const { integridade, ...corpo } = { ...obj, informacoes: [{ ...obj.informacoes[0], texto: 'Adulterado.' }, obj.informacoes[1]] };
    fs.writeFileSync(arquivo, JSON.stringify({ ...corpo, integridade: integridadeDoCorpo(corpo) }));
    assert.equal(lerConteudoPublicado(raiz, 'lac'), null);
    assert.ok(validarServicos(raiz).erros.some((e) => /conteúdo público/.test(e)));
    // arquivo restaurado, mas com campo proibido
    fs.writeFileSync(arquivo, JSON.stringify({ ...obj, entradas: [] }));
    assert.equal(lerConteudoPublicado(raiz, 'lac'), null);
    assert.ok(validarServicos(raiz).erros.some((e) => /campo não previsto: entradas/.test(e)));
    // nome com outro hash
    fs.writeFileSync(arquivo, original);
    assert.notEqual(lerConteudoPublicado(raiz, 'lac'), null);
    fs.renameSync(arquivo, path.join(pastaPublica(raiz), `conteudo-${'0'.repeat(16)}.json`));
    assert.equal(lerConteudoPublicado(raiz, 'lac'), null);
    assert.ok(validarServicos(raiz).erros.length > 0);
    fs.renameSync(path.join(pastaPublica(raiz), `conteudo-${'0'.repeat(16)}.json`), arquivo);
    // arquivo estranho na pasta pública
    fs.writeFileSync(path.join(pastaPublica(raiz), 'rascunho.json'), '{}');
    assert.ok(validarServicos(raiz).erros.some((e) => /arquivo inesperado na pasta pública/.test(e)));
    fs.rmSync(path.join(pastaPublica(raiz), 'rascunho.json'));
    assert.deepEqual(validarServicos(raiz).erros, []);
    // registro sem versão publicada, manifesto fora de "publicado" e arquivo ausente
    const r0 = JSON.parse(reg);
    r0.servicos[0].versaoPublicadaId = null;
    gravarJ(raiz, ['services', 'registry.json'], r0);
    assert.equal(lerConteudoPublicado(raiz, 'lac'), null);
    fs.writeFileSync(path.join(raiz, 'services', 'registry.json'), reg);
    gravarJ(raiz, arq('versao.json'), { ...JSON.parse(man), estado: 'autorizado_publicacao' });
    assert.equal(lerConteudoPublicado(raiz, 'lac'), null);
    fs.writeFileSync(path.join(raiz, ...arq('versao.json')), man);
    fs.rmSync(arquivo);
    assert.equal(lerConteudoPublicado(raiz, 'lac'), null);
    assert.ok(validarServicos(raiz).erros.some((e) => /não tem conteúdo público válido/.test(e)));
    fs.writeFileSync(arquivo, original);
    assert.deepEqual(validarServicos(raiz).erros, []);
  });
});

test('P12. rotas: resumo (sem hash nem ids), autorização e publicação com revisão no corpo ou no cabeçalho, códigos 409 e token', async () => {
  await comCopia(async (ctx) => {
    const { m, token, raiz, post, get } = ctx;
    const { revisao } = await ateValidada(ctx);
    // resumo somente leitura
    const antes = retrato(raiz);
    let r = await get('publicacao/resumo');
    assert.equal(r.status, 200);
    assert.deepEqual(r.corpo, {
      versao: 1, rotulo: 'Pronto para publicar', dataRevisao: '2026-11-17', informacoesAceitas: 2, links: 1, textos: 1, podeAutorizar: true, podePublicar: false, publicado: false, dataPublicacao: null,
      // revogação (Sprint 7, Passo 7B)
      podeRevogar: false, revogado: false, dataRevogacao: null,
    });
    assert.doesNotMatch(r.bruto, /[0-9a-f]{64}|lac-v1|bc-|services\//);
    assert.deepEqual(retrato(raiz), antes);
    assert.equal((await enviar(m, { url: '/__admin/servicos/lac/publicacao/resumo', method: 'GET' })).status, 401);
    assert.equal((await enviar(m, { url: '/__admin/servicos/lac/publicacao/resumo', method: 'POST', token })).status, 405);
    assert.equal((await enviar(m, { url: '/__admin/servicos/lac/autorizacao', method: 'GET', token })).status, 405);
    assert.equal((await enviar(m, { url: '/__admin/servicos/nao-existe/publicacao/resumo', method: 'GET', token })).status, 404);
    // corpos inválidos
    for (const corpo of [{}, { revisao: 'x' }, { revisao, extra: 1 }, []]) assert.equal((await post('autorizacao', corpo)).status, 422);
    assert.equal((await enviar(m, { url: '/__admin/servicos/lac/autorizacao', corpo: { revisao }, token: undefined })).status, 401);
    // publicar antes de autorizar e revisão divergente
    r = await post('publicacao', { revisao });
    assert.deepEqual([r.status, r.corpo.erro], [409, 'estado_invalido']);
    r = await post('autorizacao', { revisao: 'b'.repeat(64) });
    assert.deepEqual([r.status, r.corpo.erro], [409, 'revisao_divergente']);
    // autorização (revisão no corpo)
    r = await post('autorizacao', { revisao });
    assert.deepEqual([r.status, r.corpo], [200, { revisao, estado: 'autorizado_publicacao' }]);
    assert.deepEqual((await get('publicacao/resumo')).corpo.podePublicar, true);
    assert.deepEqual([(await post('autorizacao', { revisao })).status, (await post('autorizacao', { revisao })).corpo.erro], [409, 'estado_invalido']);
    // publicação (revisão no cabeçalho X-Revisao)
    r = await post('publicacao', {}, { 'x-revisao': revisao });
    assert.deepEqual([r.status, r.corpo], [200, { revisao, estado: 'publicado' }]);
    assert.ok(!r.bruto.includes('services/') && !r.bruto.includes(raiz));
    assert.deepEqual([(await get('publicacao/resumo')).corpo.publicado, (await get('publicacao/resumo')).corpo.dataPublicacao], [true, '2026-11-17']);
    assert.deepEqual(validarServicos(raiz).erros, []);
    assert.notEqual(lerConteudoPublicado(raiz, 'lac'), null);
  });
});

test('P13. trava comum: uma gravação por vez; a segunda recebe 409 operacao_em_andamento sem alterar nada', async () => {
  let liberar;
  const portao = new Promise((r) => { liberar = r; });
  let entrou;
  const chegou = new Promise((r) => { entrou = r; });
  let primeira = false;
  await comCopia(async (ctx) => {
    const { raiz, post } = ctx;
    const { revisao } = await ateValidada(ctx);
    primeira = true;
    const p1 = post('autorizacao', { revisao });
    await chegou;
    const r2 = await post('autorizacao', { revisao });
    assert.deepEqual([r2.status, r2.corpo.erro], [409, 'operacao_em_andamento']);
    const r3 = await post('publicacao', { revisao });
    assert.deepEqual([r3.status, r3.corpo.erro], [409, 'operacao_em_andamento']);
    assert.equal(manifesto(raiz).estado, 'validado_materialmente');
    liberar();
    assert.equal((await p1).status, 200);
    assert.equal(manifesto(raiz).estado, 'autorizado_publicacao');
  }, {
    antesDeGravar: async () => {
      if (primeira) { primeira = false; entrou(); await portao; }
    },
  });
});

test('P14. a base real não foi alterada pelos testes (retrato por hash) e nenhum dado privado real foi criado', () => {
  assert.deepEqual(retrato(RAIZ), RETRATO_REAL_ANTES);
  assert.equal(fs.existsSync(path.join(RAIZ, 'data')), EXISTIA_DATA);
  assert.equal(fs.existsSync(path.join(RAIZ, 'services', 'lac', 'publico')), false);
  assert.equal(lerJ(RAIZ, 'services', 'registry.json').servicos[0].publicado, false);
});
