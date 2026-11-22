// Sprint 7, Passo 7B: rota e transação da revogação, e o efeito no que o chat público recebe.
// Tudo em cópias temporárias fora do repositório, com dados fictícios; a base real e o armazenamento privado real não são
// tocados (retrato por hash antes e depois).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { criarManipuladorAdmin, CABECALHO_TOKEN, ROTA_SESSAO } from '../services/admin/admin-endpoint.js';
import { criarServicoPublicacao, validarCorpoDeRevogacao } from '../services/admin/publicacao.js';
import { criarServicoRevisao } from '../services/admin/revisao-servico.js';
import { criarPluginConteudoPublico, PASTA_NO_DIST } from '../services/conteudo-publico-build.js';
import { lerConteudoPublicado } from '../services/publicacao-publica.js';
import { validarServicos } from '../scripts/validate-services.js';
import { conferirDist } from '../scripts/check-dist.js';
import { botoesDePublicacao, frasePublicacao, mensagemDaPublicacao, resumirPublicacao } from '../admin/admin-logic.js';
import { CARLOS, MARIA, enviarEValidar } from './admin-auxiliar.js';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const AGORA = () => new Date(2026, 10, 17, 12, 0, 0);
const MOTIVO = 'Conteúdo desatualizado (motivo fictício de teste).';

function retrato(raiz, pastas = ['services', 'data']) {
  const itens = [];
  const andar = (d) => {
    if (!fs.existsSync(d)) return;
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) andar(p);
      else itens.push(`${path.relative(raiz, p)} ${crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')}`);
    }
  };
  for (const p of pastas) andar(path.join(raiz, p));
  return itens.sort();
}
const RETRATO_REAL_ANTES = retrato(RAIZ);

const lerJ = (raiz, ...p) => JSON.parse(fs.readFileSync(path.join(raiz, ...p), 'utf8'));
const gravarJ = (raiz, p, d) => fs.writeFileSync(path.join(raiz, ...p), `${JSON.stringify(d, null, 2)}\n`);
const manifesto = (raiz) => lerJ(raiz, 'services', 'lac', 'versoes', 'v1', 'versao.json');
const registro = (raiz) => lerJ(raiz, 'services', 'registry.json').servicos[0];
const pastaPublica = (raiz) => path.join(raiz, 'services', 'lac', 'publico');
const jsonl = (raiz, pasta) => {
  const arquivo = path.join(raiz, 'data', 'admin-private', pasta, 'lac.jsonl');
  return fs.existsSync(arquivo) ? fs.readFileSync(arquivo, 'utf8').trim().split('\n').map((l) => JSON.parse(l)) : [];
};
const bloco = {
  id: 'bc-revogacao-rota', tipo: 'conhecimento', titulo: 'Informação fictícia', texto: 'Orientação fictícia aprovada para teste da rota de revogação.',
  fonteIds: ['manual-lac-siga-2020'], referencias: [{ fonteId: 'manual-lac-siga-2020', localizacao: 'página 1' }], origem: 'fonte', ambiente: 'publico',
  statusValidacao: 'rascunho', publicado: false, revisaoAtualidade: 'pendente', criadoEm: '2026-11-10', atualizadoEm: '2026-11-10',
};

async function enviarBruto(m, { url, method = 'POST', corpo, token } = {}) {
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

// Passo 8C (ajuste mecânico, só troca de usuário): concluir, autorizar, publicar e revogar são do Revisor. Nestes testes o token
// é fixo (TOKEN_FIXO) e, antes dessas rotas, a sessão passa a Carlos Silva; depois volta a Maria Silva. As verificações não mudam.
const TOKEN_FIXO = 'c'.repeat(64);
const ROTA_DO_REVISOR = /\/(revisao\/concluir|autorizacao|publicacao|revogacao)$/;
const entrarComo = (m, usuarioId) => enviarBruto(m, { url: ROTA_SESSAO, corpo: { usuarioId } });
async function enviar(m, opcoes = {}) {
  const { method = 'POST' } = opcoes;
  if (method !== 'POST' || opcoes.token === undefined || !ROTA_DO_REVISOR.test(opcoes.url ?? '')) return enviarBruto(m, opcoes);
  await entrarComo(m, 'carlos-silva');
  try {
    return await enviarBruto(m, opcoes);
  } finally {
    await entrarComo(m, 'maria-silva');
  }
}

// Passo 8B: o token só existe depois de escolher um usuário selecionável (POST /__admin/sessao).
const obterToken = async (m) => (await enviar(m, { url: ROTA_SESSAO, corpo: { usuarioId: 'maria-silva' } })).corpo.token;

/** Cópia temporária com a LAC publicada pelo caminho real (revisão, autorização e publicação) e o endpoint administrativo. */
async function comLacPublicada(fn, { publicar = true } = {}) {
  const pai = fs.mkdtempSync(path.join(os.tmpdir(), 'sema-orienta-revogacao-rota-'));
  const raiz = path.join(pai, 'raiz');
  fs.mkdirSync(raiz);
  fs.cpSync(path.join(RAIZ, 'services'), path.join(raiz, 'services'), { recursive: true });
  try {
    const conteudo = lerJ(raiz, 'services', 'lac', 'versoes', 'v1', 'conteudo-assistente.json');
    conteudo.blocos.push(bloco);
    gravarJ(raiz, ['services', 'lac', 'versoes', 'v1', 'conteudo-assistente.json'], conteudo);
    let hash = null;
    if (publicar) {
      const rev = criarServicoRevisao({ raiz, agora: AGORA });
      const sit = () => rev.consultar('lac').situacao;
      for (const id of sit().fontes.filter((f) => f.usadaPorBloco && !f.revisada).map((f) => f.id)) assert.equal(rev.revisarFonte('lac', { ator: MARIA, fonteId: id, revisao: sit().revisao }).ok, true);
      for (const id of sit().blocos.filter((b) => !b.aceito).map((b) => b.id)) assert.equal(rev.aceitarBloco('lac', { ator: MARIA, blocoId: id, revisao: sit().revisao }).ok, true);
      const concluida = enviarEValidar(rev, 'lac', sit().revisao);
      assert.equal(concluida.ok, true);
      hash = concluida.hash;
      const pub = criarServicoPublicacao({ raiz, agora: AGORA });
      assert.equal(pub.autorizar('lac', { ator: CARLOS, revisao: hash }).ok, true);
      assert.equal(pub.publicar('lac', { ator: CARLOS, revisao: hash }).ok, true);
    }
    const m = criarManipuladorAdmin({ raiz, agora: AGORA, diretorioTemporario: pai, gerarToken: () => TOKEN_FIXO });
    const token = await obterToken(m);
    const revogar = (corpo) => enviar(m, { url: '/__admin/servicos/lac/revogacao', corpo, token });
    const resumo = async () => (await enviar(m, { url: '/__admin/servicos/lac/publicacao/resumo', method: 'GET', token })).corpo;
    await fn({ raiz, pai, hash, revogar, resumo });
  } finally {
    fs.rmSync(pai, { recursive: true, force: true });
  }
}

const arquivoPublico = (hash) => `conteudo-${hash.slice(0, 16)}.json`;

test('RR1. revogar pela rota: 200, manifesto revogado, registro sem publicação, decisão com motivo e ação no histórico; base válida', async () => {
  await comLacPublicada(async ({ raiz, hash, revogar, resumo }) => {
    const antes = await resumo();
    assert.equal(antes.podeRevogar, true);
    const r = await revogar({ revisao: hash, motivo: `  ${MOTIVO}  ` });
    assert.deepEqual([r.status, r.corpo], [200, { estado: 'revogado' }]);
    const m = manifesto(raiz);
    assert.deepEqual([m.estado, m.hashConteudo, m.publicadoEm, m.revogadoEm], ['revogado', hash, '2026-11-17', '2026-11-17']);
    const e = registro(raiz);
    assert.deepEqual([e.publicado, e.versaoPublicadaId], [false, null]);
    assert.deepEqual(validarServicos(raiz).erros, []);
    const decisao = jsonl(raiz, 'decisoes').at(-1);
    assert.deepEqual([decisao.tipo, decisao.versaoId, decisao.hashConteudo, decisao.ator, 'responsavel' in decisao], ['revogacao', 'lac-v1', hash, { ...CARLOS }, false]);
    // o motivo é aparado na entrada da rota, como a tela já faz
    assert.equal(decisao.motivo, MOTIVO);
    assert.equal(jsonl(raiz, 'revisao').at(-1).acao, 'revogar');
    const depois = await resumo();
    assert.deepEqual([depois.publicado, depois.revogado, depois.podeRevogar, depois.dataRevogacao, depois.rotulo], [false, true, false, '2026-11-17', 'Publicação revogada']);
    // revogar de novo: não há mais publicação em uso
    assert.deepEqual([(await revogar({ revisao: hash, motivo: MOTIVO })).status, (await revogar({ revisao: hash, motivo: MOTIVO })).corpo], [409, { erro: 'nada_publicado' }]);
  });
});

test('RR2. motivo validado só pela função do domínio: ausente, vazio, longo ou com e-mail vira 422 e nada muda', async () => {
  await comLacPublicada(async ({ raiz, hash, revogar }) => {
    const antes = retrato(raiz);
    const arroba = '@';
    for (const corpo of [{ revisao: hash }, { revisao: hash, motivo: '' }, { revisao: hash, motivo: '   ' }, { revisao: hash, motivo: 7 },
      { revisao: hash, motivo: 'x'.repeat(501) }, { revisao: hash, motivo: `pedido de fulano${arroba}exemplo.com` }]) {
      const r = await revogar(corpo);
      assert.deepEqual([r.status, r.corpo], [422, { erro: 'motivo_invalido' }], JSON.stringify(corpo.motivo));
    }
    assert.deepEqual((await revogar({ revisao: hash, motivo: MOTIVO, extra: 1 })).corpo, { erro: 'dados_invalidos', campos: ['extras'] });
    assert.deepEqual((await revogar({ revisao: 'abc', motivo: MOTIVO })).corpo, { erro: 'dados_invalidos', campos: ['revisao'] });
    assert.deepEqual((await revogar({ revisao: 'f'.repeat(64), motivo: MOTIVO })).corpo, { erro: 'revisao_divergente' });
    assert.deepEqual(retrato(raiz), antes);
    // a validação do corpo confere só a forma e apara o motivo; o que não é texto segue como veio para o domínio recusar
    assert.deepEqual(validarCorpoDeRevogacao({ revisao: hash, motivo: 42 }), { ok: true, dados: { revisao: hash, motivo: 42 } });
    assert.deepEqual(validarCorpoDeRevogacao({ revisao: hash, motivo: `\t ${MOTIVO} \n` }), { ok: true, dados: { revisao: hash, motivo: MOTIVO } });
    assert.deepEqual(validarCorpoDeRevogacao({ revisao: hash, motivo: ' \t\n ' }), { ok: true, dados: { revisao: hash, motivo: '' } });
    // motivo só com espaços (inclusive tabulação e quebra de linha) é recusado como motivo_invalido, e nada muda
    for (const motivo of ['     ', ' \t\n ']) assert.deepEqual((await revogar({ revisao: hash, motivo })).corpo, { erro: 'motivo_invalido' });
    assert.deepEqual(retrato(raiz), antes);
  });
});

test('RR2b. motivo com CPF, telefone ou credencial pela rota vira 422 motivo_invalido e nada muda', async () => {
  await comLacPublicada(async ({ raiz, hash, revogar }) => {
    const antes = retrato(raiz);
    // montados por concatenação, para que nenhum literal fique no arquivo de teste
    const motivos = [
      `Pedido do titular ${['123', '456', '789'].join('.')}-${'09'}`,
      `Ligar para ${['(65)', '9' + '8765'].join(' ')}-${'4321'}`,
      `Acesso ${'sen' + 'ha'}: ${'abc' + '123'}`,
    ];
    for (const motivo of motivos) {
      const r = await revogar({ revisao: hash, motivo });
      assert.deepEqual([r.status, r.corpo], [422, { erro: 'motivo_invalido' }]);
    }
    assert.deepEqual(retrato(raiz), antes);
  });
});

test('RR3. sem publicação em uso, a revogação é recusada (409) e nada muda', async () => {
  await comLacPublicada(async ({ raiz, revogar }) => {
    const antes = retrato(raiz);
    const r = await revogar({ revisao: 'a'.repeat(64), motivo: MOTIVO });
    assert.deepEqual([r.status, r.corpo], [409, { erro: 'nada_publicado' }]);
    assert.deepEqual(retrato(raiz), antes);
  }, { publicar: false });
});

/** Servidor de desenvolvimento falso: guarda o middleware registrado pelo plugin. */
function pluginEmModo(raiz, command) {
  const plugin = criarPluginConteudoPublico({ raiz, servicoId: 'lac' });
  plugin.config({}, { command });
  let middleware = null;
  if (command === 'serve') plugin.configureServer({ middlewares: { use: (fn) => { middleware = fn; } } });
  const pedir = (nome) => {
    let status = null;
    let proximo = false;
    const res = { statusCode: 0, setHeader: () => {}, end: () => { status = res.statusCode; } };
    middleware({ url: `/${PASTA_NO_DIST}/${nome}`, method: 'GET', socket: { remoteAddress: '127.0.0.1' } }, res, () => { proximo = true; });
    return proximo ? 'proximo' : status;
  };
  const emitidos = () => {
    const lista = [];
    plugin.generateBundle.call({ emitFile: (f) => lista.push(f.fileName) });
    return lista;
  };
  return { plugin, pedir, emitidos };
}

test('RR4. (a) no npm run dev, depois de revogar, o conteúdo revogado deixa de ser servido e a página não o indica mais', async () => {
  await comLacPublicada(async ({ raiz, hash, revogar }) => {
    const dev = pluginEmModo(raiz, 'serve');
    const nome = arquivoPublico(hash);
    assert.equal(dev.pedir(nome), 200);
    assert.equal(dev.plugin.transformIndexHtml()[0].attrs.content, `/${PASTA_NO_DIST}/${nome}`);
    assert.notEqual(lerConteudoPublicado(raiz, 'lac'), null);
    assert.equal((await revogar({ revisao: hash, motivo: MOTIVO })).status, 200);
    assert.equal(dev.pedir(nome), 404);
    assert.deepEqual(dev.plugin.transformIndexHtml(), []);
    assert.equal(lerConteudoPublicado(raiz, 'lac'), null);
  });
});

test('RR5. (b) o build depois da revogação não emite o arquivo revogado, e o check-dist recusa o arquivo se ele aparecer no dist/', async () => {
  await comLacPublicada(async ({ raiz, hash, revogar }) => {
    const nome = arquivoPublico(hash);
    const dist = path.join(raiz, 'dist');
    fs.mkdirSync(path.join(dist, PASTA_NO_DIST), { recursive: true });
    fs.writeFileSync(path.join(dist, 'index.html'), '<!doctype html><title>SEMA Orienta</title>\n');
    fs.copyFileSync(path.join(pastaPublica(raiz), nome), path.join(dist, PASTA_NO_DIST, nome));
    const recusasDoPublico = () => conferirDist(raiz).filter((e) => e.origem === 'conteúdo público não autorizado ou inválido');

    // publicado: o build emite o arquivo e o check-dist o aceita
    assert.deepEqual(pluginEmModo(raiz, 'build').emitidos(), [`${PASTA_NO_DIST}/${nome}`]);
    assert.deepEqual(recusasDoPublico(), []);

    assert.equal((await revogar({ revisao: hash, motivo: MOTIVO })).status, 200);
    const build = pluginEmModo(raiz, 'build');
    assert.deepEqual(build.emitidos(), []);
    assert.deepEqual(build.plugin.transformIndexHtml(), []);
    // o mesmo arquivo no dist/ agora é recusado pelo check-dist
    assert.equal(recusasDoPublico().length, 1);
    fs.rmSync(path.join(dist, PASTA_NO_DIST), { recursive: true });
    assert.deepEqual(recusasDoPublico(), []);
  });
});

test('RR6. (c) o arquivo público revogado continua no disco, intacto, como histórico', async () => {
  await comLacPublicada(async ({ raiz, hash, revogar }) => {
    const nome = arquivoPublico(hash);
    const conteudoAntes = fs.readFileSync(path.join(pastaPublica(raiz), nome));
    assert.equal((await revogar({ revisao: hash, motivo: MOTIVO })).status, 200);
    assert.deepEqual(fs.readdirSync(pastaPublica(raiz)), [nome]);
    assert.deepEqual(fs.readFileSync(path.join(pastaPublica(raiz), nome)), conteudoAntes);
  });
});

test('RR7. interface: botão de revogar só com a versão publicada; frases e mensagens sem termos internos', () => {
  const base = { versao: 1, rotulo: 'Publicado', informacoesAceitas: 1, links: 1, textos: 0 };
  const publicada = resumirPublicacao({ ...base, publicado: true, podeRevogar: true, dataPublicacao: '2026-11-17' });
  assert.equal(publicada.etapa, 'publicado');
  assert.deepEqual(botoesDePublicacao(publicada).revogar, { visivel: true, habilitado: true });
  assert.deepEqual(botoesDePublicacao(publicada, true).revogar, { visivel: true, habilitado: false });
  assert.equal(botoesDePublicacao(resumirPublicacao({ ...base, publicado: true, podeRevogar: false })).revogar.visivel, false);
  for (const outro of [{ podeAutorizar: true }, { podePublicar: true }, { revogado: true, podeRevogar: true }, {}]) {
    assert.equal(botoesDePublicacao(resumirPublicacao({ ...base, ...outro })).revogar.visivel, false, JSON.stringify(outro));
  }
  assert.equal(botoesDePublicacao(null).revogar.visivel, false);
  const revogada = resumirPublicacao({ ...base, revogado: true, dataRevogacao: '2026-11-18' });
  assert.equal(revogada.etapa, 'revogado');
  assert.match(frasePublicacao(revogada), /^Publicação revogada\. .*Revogada em 18\/11\/2026\./);
  assert.equal(botoesDePublicacao(revogada).novaVersao.visivel, true);
  assert.match(mensagemDaPublicacao(422, { erro: 'motivo_invalido' }, 'revogar').mensagem, /motivo/);
  assert.match(mensagemDaPublicacao(409, { erro: 'nada_publicado' }, 'revogar').mensagem, /Não há publicação em uso/);
  assert.match(mensagemDaPublicacao(500, {}, 'revogar').mensagem, /revogar/);
});

test('RR8. a base real e o armazenamento privado real não foram alterados', () => {
  assert.deepEqual(retrato(RAIZ), RETRATO_REAL_ANTES);
  assert.equal(fs.existsSync(path.join(RAIZ, 'data')), false);
});
