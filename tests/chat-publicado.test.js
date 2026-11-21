// Passo 5C (parte B): o chat lê SOMENTE o conteúdo público publicado (dev e build); o build entrega só o arquivo público autorizado
// e o check-dist recusa qualquer outro. Sempre em cópias temporárias fora do repositório, com dados fictícios.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import { criarManipuladorAdmin, CABECALHO_TOKEN, ROTA_SESSAO } from '../services/admin/admin-endpoint.js';
import { criarServicoPublicacao } from '../services/admin/publicacao.js';
import { criarServicoRevisao } from '../services/admin/revisao-servico.js';
import { gerarConteudoPublico, lerConteudoPublicado } from '../services/publicacao-publica.js';
import { arquivoPublicadoDoServico, criarPluginConteudoPublico, listarArquivosPublicados, PASTA_NO_DIST } from '../services/conteudo-publico-build.js';
import { RESPOSTA_SEM_INFORMACAO_PUBLICADA, respostaIndisponivel, responderComConteudoPublicado, responderPergunta, validarConteudoPublicado } from '../src/assistant.js';
import { conferirDist } from '../scripts/check-dist.js';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const AGORA = () => new Date(2026, 10, 17, 12, 0, 0);
const MANUAL = 'manual-lac-siga-2020';
const URL_MANUAL = 'https://sema.mt.gov.br/site/phocadownload/SEMAMT%20-%20LAC%20-%20MANUAL.pdf';
const TEXTO_ORIGINAL = 'Texto original interno fictício que nunca deve ir ao público.';
const TEXTO_LINK = 'Orientação fictícia aprovada sobre o manual de procedimentos da licença.';
const TEXTO_TEXTO = 'Orientação fictícia aprovada sobre vistoria de campo.';

const lerJ = (raiz, ...p) => JSON.parse(fs.readFileSync(path.join(raiz, ...p), 'utf8'));
const gravarJ = (raiz, p, d) => fs.writeFileSync(path.join(raiz, ...p), `${JSON.stringify(d, null, 2)}\n`);
const arq = (nome) => ['services', 'lac', 'versoes', 'v1', nome];
const listar = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? listar(path.join(dir, e.name)) : [path.join(dir, e.name)])) : []);
const bloco = (id, titulo, texto, fonteIds, extra = {}) => ({
  id, tipo: 'conhecimento', titulo, texto, fonteIds, referencias: fonteIds.map((f) => ({ fonteId: f, localizacao: 'página 1' })), origem: 'fonte',
  ambiente: 'publico', statusValidacao: 'rascunho', publicado: false, revisaoAtualidade: 'pendente', criadoEm: '2026-11-10', atualizadoEm: '2026-11-10', ...extra,
});

async function enviar(m, { url, method = 'POST', corpo, token }) {
  const buffer = method === 'GET' ? Buffer.alloc(0) : Buffer.from(JSON.stringify(corpo ?? {}));
  const headers = { host: 'localhost:5173' };
  if (method !== 'GET') { headers['content-type'] = 'application/json'; headers['content-length'] = String(buffer.length); }
  if (token !== undefined) headers[CABECALHO_TOKEN] = token;
  const req = Object.assign(Readable.from([buffer]), { url, method, headers, socket: { remoteAddress: '127.0.0.1', localPort: 5173 } });
  let resposta = null;
  const res = { statusCode: 0, setHeader: () => {}, end: (t) => { resposta = t; } };
  await m(req, res, () => {});
  return { status: res.statusCode, corpo: resposta === null ? null : JSON.parse(resposta) };
}

// Passo 8B: o token só existe depois de escolher um usuário selecionável (POST /__admin/sessao).
const obterToken = async (m) => (await enviar(m, { url: ROTA_SESSAO, corpo: { usuarioId: 'maria-silva' } })).corpo.token;

/** Cópia temporária de services/ com duas informações (link e texto cadastrado) em elaboração. */
async function comCopia(fn) {
  const pai = fs.mkdtempSync(path.join(os.tmpdir(), 'sema-orienta-chat-publicado-'));
  const raiz = path.join(pai, 'raiz');
  fs.mkdirSync(raiz);
  fs.cpSync(path.join(RAIZ, 'services'), path.join(raiz, 'services'), { recursive: true });
  try {
    const m = criarManipuladorAdmin({ raiz, agora: AGORA, diretorioTemporario: pai });
    const token = await obterToken(m);
    assert.equal((await enviar(m, { url: '/__admin/servicos/lac/entradas-texto', corpo: { titulo: 'Texto interno fictício', texto: TEXTO_ORIGINAL }, token })).status, 201);
    const idTexto = lerJ(raiz, ...arq('fontes.json')).fontes.find((f) => f.formaEntrada === 'texto').id;
    const c = lerJ(raiz, ...arq('conteudo-assistente.json'));
    c.blocos.push(bloco('bc-link', 'Manual de procedimentos', TEXTO_LINK, [MANUAL]), bloco('bc-texto', 'Vistoria de campo', TEXTO_TEXTO, [idTexto]));
    gravarJ(raiz, arq('conteudo-assistente.json'), c);
    await fn({ raiz, pai, idTexto });
  } finally {
    fs.rmSync(pai, { recursive: true, force: true });
  }
}

function revisarEConcluir(raiz) {
  const rev = criarServicoRevisao({ raiz, agora: AGORA });
  const sit = () => rev.consultar('lac').situacao;
  for (const id of sit().fontes.filter((f) => f.usadaPorBloco && !f.revisada).map((f) => f.id)) assert.equal(rev.revisarFonte('lac', { fonteId: id, revisao: sit().revisao }).ok, true);
  for (const id of sit().blocos.filter((b) => !b.aceito).map((b) => b.id)) assert.equal(rev.aceitarBloco('lac', { blocoId: id, revisao: sit().revisao }).ok, true);
  const r = rev.concluirRevisao('lac', { revisao: sit().revisao });
  assert.equal(r.ok, true);
  return r.hash;
}
const publicador = (raiz) => criarServicoPublicacao({ raiz, agora: AGORA });
/** Publica a versão fictícia da cópia pelo serviço da parte A. */
function publicar(raiz) {
  const revisao = revisarEConcluir(raiz);
  const pub = publicador(raiz);
  assert.equal(pub.autorizar('lac', { revisao }).ok, true);
  assert.equal(pub.publicar('lac', { revisao }).ok, true);
}
const dePublicado = (raiz) => validarConteudoPublicado(lerConteudoPublicado(raiz, 'lac'));
const arquivoPublico = (raiz) => listar(path.join(raiz, 'services', 'lac', 'publico')).find((f) => /conteudo-[0-9a-f]{16}\.json$/.test(f));
const adulterar = (arquivo) => fs.writeFileSync(arquivo, fs.readFileSync(arquivo, 'utf8').replace(TEXTO_TEXTO, 'Texto adulterado.'), 'utf8');

test('CP1. sem publicação (caso real): nenhum arquivo público, sem meta, resposta de ausência de conteúdo', () => {
  assert.equal(lerConteudoPublicado(RAIZ, 'lac'), null);
  assert.equal(arquivoPublicadoDoServico(RAIZ, 'lac'), null);
  assert.deepEqual(listarArquivosPublicados(RAIZ), []);
  assert.deepEqual(criarPluginConteudoPublico({ raiz: RAIZ }).transformIndexHtml(), []);
  assert.deepEqual(responderComConteudoPublicado('Como pedir a licença?', null), respostaIndisponivel());
  assert.deepEqual(responderPergunta('Como pedir a licença?', null), respostaIndisponivel());
  assert.equal(fs.existsSync(path.join(RAIZ, 'services', 'lac', 'publico')), false);
});

test('CP2. versão em elaboração, validada ou autorizada nunca alimenta o chat; rascunho não entra no conteúdo público', async () => {
  await comCopia(async ({ raiz }) => {
    assert.equal(dePublicado(raiz), null);
    assert.deepEqual(listarArquivosPublicados(raiz), []);
    // o bloco em rascunho (nunca aceito) não vira informação pública
    const gerado = gerarConteudoPublico({ service: lerJ(raiz, ...arq('service.json')), fontes: lerJ(raiz, ...arq('fontes.json')), conteudoAssistente: lerJ(raiz, ...arq('conteudo-assistente.json')) }, { temaNome: 'Tema' });
    assert.equal(gerado.ok, false);
    const revisao = revisarEConcluir(raiz);
    assert.equal(dePublicado(raiz), null, 'validada');
    assert.equal(publicador(raiz).autorizar('lac', { revisao }).ok, true);
    assert.equal(dePublicado(raiz), null, 'autorizada');
    assert.deepEqual(listarArquivosPublicados(raiz), []);
    assert.deepEqual(criarPluginConteudoPublico({ raiz }).transformIndexHtml(), []);
  });
});

test('CP3. publicada: responde com a informação publicada; texto sem fonte, link só com a URL, sem dados internos nem conteúdo de teste', async () => {
  await comCopia(async ({ raiz, idTexto }) => {
    publicar(raiz);
    const publicado = dePublicado(raiz);
    assert.ok(publicado);
    const rLink = responderComConteudoPublicado('Quais os procedimentos do manual?', publicado);
    assert.equal(rLink.tipo, 'publicado');
    assert.deepEqual(rLink.partes, [TEXTO_LINK]);
    assert.deepEqual(rLink.fontes, [{ titulo: URL_MANUAL, url: URL_MANUAL }]);
    const rTexto = responderComConteudoPublicado('Como é a vistoria de campo?', publicado);
    assert.deepEqual(rTexto.partes, [TEXTO_TEXTO]);
    assert.deepEqual(rTexto.fontes, [], 'texto não mostra fonte');
    for (const r of [rLink, rTexto]) {
      const bruto = JSON.stringify(r);
      for (const proibido of [TEXTO_ORIGINAL, idTexto, MANUAL, 'Texto interno fictício', 'bc-link', 'bc-texto', 'rascunho', 'teste_local', 'lac-v1']) assert.ok(!bruto.includes(proibido), proibido);
    }
    // conteúdo antigo de teste (blocos teste_local da base) não é resposta oficial
    const testes = lerJ(raiz, ...arq('conteudo-assistente.json')).blocos.filter((b) => b.ambiente === 'teste_local');
    assert.ok(testes.length > 0);
    for (const pergunta of ['O que é a LAC?', 'Como solicitar a LAC?', 'Qual o link oficial da LAC?', 'Quais os procedimentos do manual?', 'Como é a vistoria de campo?']) {
      const partes = responderComConteudoPublicado(pergunta, publicado).partes.join(' ');
      for (const b of testes) assert.ok(!partes.includes(b.texto), `${pergunta}: ${b.id}`);
    }
  });
});

test('CP4. pergunta fora do conteúdo publicado recebe a limitação; enquadramento ganha aviso de análise da SEMA', async () => {
  await comCopia(async ({ raiz }) => {
    publicar(raiz);
    const publicado = dePublicado(raiz);
    const r = responderComConteudoPublicado('Qual o valor da taxa de emissão?', publicado);
    assert.deepEqual([r.tipo, r.partes, r.fontes], ['sem_informacao', [RESPOSTA_SEM_INFORMACAO_PUBLICADA], []]);
    const e = responderComConteudoPublicado('Minha fazenda se enquadra na vistoria de campo?', publicado);
    assert.equal(e.avisos.length, 1);
    assert.match(e.avisos[0], /análise da SEMA/);
  });
});

test('CP5. validarConteudoPublicado recusa campo extra, tipo incoerente, URL não https e formato errado', async () => {
  await comCopia(async ({ raiz }) => {
    publicar(raiz);
    const bom = lerConteudoPublicado(raiz, 'lac');
    assert.ok(validarConteudoPublicado(bom));
    const casos = [
      (o) => { o.extra = 1; }, (o) => { o.formato = 2; }, (o) => { o.informacoes[0].fonteId = 'x'; },
      (o) => { o.informacoes.find((i) => i.tipo === 'link').tipo = 'texto'; },
      (o) => { o.informacoes.find((i) => i.tipo === 'link').links[0].url = 'http://x.gov.br'; },
      (o) => { o.informacoes = []; }, (o) => { delete o.integridade; },
    ];
    for (const alterar of casos) { const o = structuredClone(bom); alterar(o); assert.equal(validarConteudoPublicado(o), null); }
  });
});

test('CP6. arquivo público adulterado ou removido: sem conteúdo para o chat', async () => {
  await comCopia(async ({ raiz }) => {
    publicar(raiz);
    assert.ok(arquivoPublicadoDoServico(raiz, 'lac'));
    adulterar(arquivoPublico(raiz));
    assert.equal(arquivoPublicadoDoServico(raiz, 'lac'), null);
    assert.equal(dePublicado(raiz), null);
    assert.throws(() => listarArquivosPublicados(raiz));
    assert.deepEqual(criarPluginConteudoPublico({ raiz }).transformIndexHtml(), [], 'no dev: sem meta, o chat fica sem conteúdo');
  });
  await comCopia(async ({ raiz }) => {
    publicar(raiz);
    fs.rmSync(arquivoPublico(raiz));
    assert.equal(arquivoPublicadoDoServico(raiz, 'lac'), null);
    assert.throws(() => listarArquivosPublicados(raiz));
  });
});

test('CP7. plugin: meta e middleware (dev) entregam só o arquivo publicado, por GET local e pelo nome exato', async () => {
  await comCopia(async ({ raiz }) => {
    publicar(raiz);
    const plugin = criarPluginConteudoPublico({ raiz });
    plugin.config({}, { command: 'serve' });
    const [meta] = plugin.transformIndexHtml();
    assert.equal(meta.tag, 'meta');
    assert.match(meta.attrs.content, /^\/conteudo-publico\/conteudo-[0-9a-f]{16}\.json$/);
    const registrados = [];
    plugin.configureServer({ middlewares: { use: (fn) => registrados.push(fn) } });
    const chamar = (url, { method = 'GET', ip = '127.0.0.1' } = {}) => {
      const r = { statusCode: 0, corpo: null, setHeader() {}, end(t) { this.corpo = t; } };
      let proximo = false;
      registrados[0]({ url, method, socket: { remoteAddress: ip } }, r, () => { proximo = true; });
      return { r, proximo };
    };
    const ok = chamar(meta.attrs.content);
    assert.equal(ok.r.statusCode, 200);
    assert.deepEqual(JSON.parse(ok.r.corpo), lerConteudoPublicado(raiz, 'lac'));
    assert.equal(chamar(meta.attrs.content, { method: 'POST' }).r.statusCode, 405);
    assert.equal(chamar(meta.attrs.content, { ip: '10.0.0.5' }).r.statusCode, 403);
    for (const url of ['/conteudo-publico/conteudo-0000000000000000.json', '/conteudo-publico/entradas.json', '/conteudo-publico/../registry.json', '/conteudo-publico/']) assert.equal(chamar(url).r.statusCode, 404, url);
    assert.equal(chamar('/outra-coisa').proximo, true);
  });
});

/** `vite build` programático sobre uma cópia mínima do site em pasta temporária (o dist/ real não é tocado). */
async function construir(raiz, pai) {
  const site = path.join(fs.realpathSync.native(pai), 'site');
  fs.rmSync(site, { recursive: true, force: true });
  fs.mkdirSync(site);
  fs.cpSync(path.join(RAIZ, 'index.html'), path.join(site, 'index.html'));
  fs.cpSync(path.join(RAIZ, 'src'), path.join(site, 'src'), { recursive: true });
  fs.cpSync(path.join(raiz, 'services'), path.join(site, 'services'), { recursive: true });
  const dist = path.join(site, 'dist');
  await build({ root: site, configFile: false, logLevel: 'silent', plugins: [criarPluginConteudoPublico({ raiz: site })], build: { outDir: dist, emptyOutDir: true } });
  return { site, dist };
}

test('CP8. build: sem publicação o dist não tem conteúdo; com publicação gera só o arquivo público autorizado; check-dist confere', async () => {
  await comCopia(async ({ raiz, pai }) => {
    const antes = await construir(raiz, pai);
    assert.deepEqual(listar(path.join(antes.dist, PASTA_NO_DIST)), []);
    assert.doesNotMatch(fs.readFileSync(path.join(antes.dist, 'index.html'), 'utf8'), /conteudo-publico/);
    assert.deepEqual(conferirDist(antes.site), []);

    publicar(raiz);
    const { site, dist } = await construir(raiz, pai);
    const publicos = listar(path.join(dist, PASTA_NO_DIST));
    assert.equal(publicos.length, 1);
    const nome = path.basename(publicos[0]);
    assert.match(nome, /^conteudo-[0-9a-f]{16}\.json$/);
    assert.deepEqual(JSON.parse(fs.readFileSync(publicos[0], 'utf8')), lerConteudoPublicado(raiz, 'lac'));
    assert.match(fs.readFileSync(path.join(dist, 'index.html'), 'utf8'), new RegExp(`name="conteudo-publico" content="/conteudo-publico/${nome}"`));
    for (const f of listar(dist).filter((x) => x !== publicos[0])) {
      const texto = fs.readFileSync(f, 'utf8');
      for (const p of [TEXTO_ORIGINAL, 'entradas.json', 'conteudo-assistente', 'teste_local', 'versao.json']) assert.ok(!texto.includes(p), `${path.relative(dist, f)}: ${p}`);
    }
    assert.deepEqual(conferirDist(site), []);

    // adulterado
    const original = fs.readFileSync(publicos[0], 'utf8');
    adulterar(publicos[0]);
    assert.ok(conferirDist(site).some((e) => e.origem === 'conteúdo público não autorizado ou inválido'));
    // campo proibido dentro do arquivo
    const comExtra = JSON.parse(original);
    comExtra.informacoes[0].fonteId = MANUAL;
    fs.writeFileSync(publicos[0], JSON.stringify(comExtra), 'utf8');
    assert.ok(conferirDist(site).length > 0);
    fs.writeFileSync(publicos[0], original, 'utf8');
    assert.deepEqual(conferirDist(site), []);

    // arquivos extras, com nome de hash não autorizado ou fora da pasta, e proibidos
    const extras = [[PASTA_NO_DIST, 'entradas.json'], [PASTA_NO_DIST, 'conteudo-0123456789abcdef.json'], ['conteudo-0123456789abcdef.json']];
    for (const partes of extras) {
      const alvo = path.join(dist, ...partes);
      fs.writeFileSync(alvo, original, 'utf8');
      assert.ok(conferirDist(site).some((e) => e.texto === partes.join('/')), partes.join('/'));
      fs.rmSync(alvo);
    }
    // o próprio nome autorizado fora da pasta também é recusado
    fs.writeFileSync(path.join(dist, nome), original, 'utf8');
    assert.ok(conferirDist(site).some((e) => e.texto === nome));
    fs.rmSync(path.join(dist, nome));
    // termo proibido em outro arquivo continua sendo achado
    fs.writeFileSync(path.join(dist, 'assets', 'extra.js'), `const x = "entradas.json"; const y = ${JSON.stringify(TEXTO_ORIGINAL)};`, 'utf8');
    const achados = conferirDist(site).map((e) => e.texto);
    assert.ok(achados.includes('entradas.json'));
    assert.deepEqual(conferirDist(site).filter((e) => e.arquivo.endsWith(nome)), []);
  });
});

test('CP9. o build FALHA quando o conteúdo público de um serviço publicado é inválido', async () => {
  await comCopia(async ({ raiz, pai }) => {
    publicar(raiz);
    adulterar(arquivoPublico(raiz));
    await assert.rejects(() => construir(raiz, pai), /inválido/);
  });
});

test('CP10. a interface pública não usa innerHTML, storage nem cookies; a base real segue sem publicação', () => {
  for (const f of ['src/main.js', 'src/assistant.js']) assert.doesNotMatch(fs.readFileSync(path.join(RAIZ, f), 'utf8'), /innerHTML|localStorage|sessionStorage|document\.cookie/);
  assert.equal(lerConteudoPublicado(RAIZ, 'lac'), null);
  assert.equal(fs.existsSync(path.join(RAIZ, 'services', 'lac', 'publico')), false);
});

// ---- Relevância da seleção (termos fictícios, sem regra específica para eles) ----

const fonteLink = (id, url) => ({ id, formaEntrada: 'link', url, statusValidacao: 'validado', publicado: false });
const fonteTexto = (id) => ({ id, formaEntrada: 'texto', url: null, statusValidacao: 'validado', publicado: false });
const blocoPronto = (id, titulo, texto, fonteIds, extra = {}) => ({ id, tipo: 'conhecimento', titulo, texto, fonteIds, statusValidacao: 'validado', revisaoAtualidade: 'concluida', alertas: [], ...extra });
const URL_A = 'https://exemplo.mt.gov.br/documento-a';

/** Gera o conteúdo público com o gerador existente (só entra o que está aceito, com fonte ativa) e valida como o chat faz. */
function publicadoDe(blocos, fontes) {
  const g = gerarConteudoPublico({ service: { nome: 'Serviço fictício' }, fontes: { fontes }, conteudoAssistente: { blocos } }, { temaNome: 'Tema fictício' });
  assert.equal(g.ok, true);
  const v = validarConteudoPublicado(g.conteudo);
  assert.ok(v);
  return v;
}

test('CR1. termo distintivo seleciona só o bloco correspondente; palavras genéricas compartilhadas não trazem o outro (cenário da conferência)', () => {
  const p = publicadoDe([
    blocoPronto('b1', 'Informação fictícia da orientação de demonstração', 'Esta orientação fictícia de demonstração trata do flurbo cadastrado.', ['t1']),
    blocoPronto('b2', 'Informação fictícia do link de demonstração', 'Este link fictício de demonstração trata do xandrilhão oficial.', ['l1']),
  ], [fonteTexto('t1'), fonteLink('l1', URL_A)]);
  const texto = responderComConteudoPublicado('O que diz a orientação fictícia de demonstração sobre flurbo?', p);
  assert.deepEqual(texto.partes, ['Esta orientação fictícia de demonstração trata do flurbo cadastrado.']);
  assert.deepEqual(texto.fontes, [], 'texto cadastrado não mostra fonte nem URL');
  const link = responderComConteudoPublicado('O que é xandrilhão?', p);
  assert.deepEqual(link.partes, ['Este link fictício de demonstração trata do xandrilhão oficial.']);
  assert.deepEqual(link.fontes, [{ titulo: URL_A, url: URL_A }]);
  // só palavras genéricas compartilhadas: nada é selecionado
  const generica = responderComConteudoPublicado('O que diz a informação fictícia de demonstração sobre isso?', p);
  assert.equal(generica.tipo, 'sem_informacao');
  assert.deepEqual(generica.fontes, []);
});

test('CR2. pergunta realmente relacionada a dois blocos usa ambos; a URL é só a dos blocos selecionados', () => {
  const p = publicadoDe([
    blocoPronto('b1', 'Informação fictícia sobre flurbo', 'Detalhe do flurbo fictício.', ['t1']),
    blocoPronto('b2', 'Informação fictícia sobre xandrilhão', 'Detalhe do xandrilhão fictício.', ['l1']),
    blocoPronto('b3', 'Informação fictícia sobre tobiluz', 'Detalhe do tobiluz fictício.', ['l2']),
  ], [fonteTexto('t1'), fonteLink('l1', URL_A), fonteLink('l2', 'https://exemplo.mt.gov.br/documento-b')]);
  const dois = responderComConteudoPublicado('Explique flurbo e xandrilhão.', p);
  assert.deepEqual(dois.partes, ['Detalhe do flurbo fictício.', 'Detalhe do xandrilhão fictício.']);
  assert.deepEqual(dois.fontes.map((f) => f.url), [URL_A]);
  const um = responderComConteudoPublicado('Explique tobiluz.', p);
  assert.deepEqual(um.fontes.map((f) => f.url), ['https://exemplo.mt.gov.br/documento-b']);
});

test('CR3. excluído, em elaboração ou não aceito não participa da resposta', () => {
  const g = gerarConteudoPublico({
    service: { nome: 'Serviço fictício' },
    fontes: { fontes: [fonteTexto('t1'), fonteLink('l1', URL_A), { ...fonteLink('l2', 'https://exemplo.mt.gov.br/excluida'), excluidaEm: '2026-11-01' }] },
    conteudoAssistente: { blocos: [
      blocoPronto('b1', 'Informação sobre flurbo', 'Texto do flurbo aceito.', ['t1']),
      blocoPronto('b2', 'Informação sobre tobiluz', 'Texto do tobiluz em elaboração.', ['l1'], { statusValidacao: 'rascunho', revisaoAtualidade: 'pendente' }),
      blocoPronto('b3', 'Informação sobre xandrilhão', 'Texto do xandrilhão com fonte excluída.', ['l2']),
    ] },
  }, { temaNome: 'Tema fictício' });
  const p = validarConteudoPublicado(g.conteudo);
  for (const termo of ['tobiluz', 'xandrilhão']) assert.equal(responderComConteudoPublicado(`Fale sobre ${termo}.`, p).tipo, 'sem_informacao', termo);
  assert.deepEqual(responderComConteudoPublicado('Fale sobre flurbo.', p).partes, ['Texto do flurbo aceito.']);
});
