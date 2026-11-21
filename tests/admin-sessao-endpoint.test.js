// Rotas da sessão do login simulado (Sprint 8, Passo 8B): GET, POST e DELETE /__admin/sessao, com requisições simuladas
// (sem abrir porta). Usuários fictícios; gravações só em cópias temporárias fora do repositório.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { criarManipuladorAdmin, CABECALHO_TOKEN, ROTA_SESSAO, ROTA_CATALOGO } from '../services/admin/admin-endpoint.js';
import { USUARIOS_SELECIONAVEIS } from '../services/admin/atores.js';
import { acoesDoPerfil } from '../services/admin/permissoes.js';
import { criarServicoRevisao } from '../services/admin/revisao-servico.js';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const AGORA = () => new Date(2026, 10, 21, 12, 0, 0);
const [MARIA, CARLOS] = USUARIOS_SELECIONAVEIS;
const exibicao = (u) => ({ usuarioId: u.usuarioId, nome: u.nome, perfil: u.perfil, setor: u.setor });
const USUARIOS = USUARIOS_SELECIONAVEIS.map(exibicao);
// Passo 8C: com sessão, GET e POST devolvem também as ações do perfil.
const ACOES_MARIA = acoesDoPerfil('cadastrante');
const semNome = (u) => ({ usuarioId: u.usuarioId, perfil: u.perfil, setor: u.setor });

/** Executa o manipulador com uma requisição simulada. `texto` é o corpo bruto; `corpo` vira JSON. */
async function chamar(m, { url = ROTA_SESSAO, method = 'GET', corpo, texto, token, headers = {}, tipo, remoteAddress = '127.0.0.1', comTamanho = true } = {}) {
  const bruto = texto !== undefined ? texto : corpo !== undefined ? JSON.stringify(corpo) : '';
  const buffer = Buffer.from(bruto);
  const h = { host: 'localhost:5173', ...headers };
  const tipoFinal = tipo === undefined ? (bruto === '' ? null : 'application/json') : tipo;
  if (tipoFinal !== null) h['content-type'] = tipoFinal;
  if (comTamanho && buffer.length > 0 && h['content-length'] === undefined) h['content-length'] = String(buffer.length);
  if (token !== undefined) h[CABECALHO_TOKEN] = token;
  const req = Object.assign(Readable.from(buffer.length ? [buffer] : []), { url, method, headers: h, socket: { remoteAddress, localPort: 5173 } });
  const cab = {};
  let resposta = null;
  const res = { statusCode: 0, setHeader: (n, v) => { cab[n.toLowerCase()] = v; }, end: (t) => { resposta = t ?? null; } };
  await m(req, res, () => {});
  return { status: res.statusCode, corpo: resposta === null || resposta === '' ? null : JSON.parse(resposta), bruto: resposta ?? '', cab };
}
const entrar = (m, usuarioId) => chamar(m, { method: 'POST', corpo: { usuarioId } });
const novo = (extra = {}) => criarManipuladorAdmin({ raiz: RAIZ, ...extra });

test('S1. GET sem sessão: 200 com usuario null e a lista dos selecionáveis, sem token; GET não cria sessão', async () => {
  const m = novo();
  const r = await chamar(m);
  assert.equal(r.status, 200);
  assert.deepEqual(r.corpo, { usuario: null, usuarios: USUARIOS });
  assert.equal(r.cab['cache-control'], 'no-store');
  assert.equal((await chamar(m, { url: ROTA_CATALOGO, token: 'a'.repeat(64) })).status, 401);
  assert.deepEqual((await chamar(m)).corpo, { usuario: null, usuarios: USUARIOS });
});

test('S2. POST com Maria: 200 { token, usuario, acoes }; o GET passa a devolver Maria, o mesmo token e as ações; o token abre as outras rotas', async () => {
  const m = novo();
  const r = await entrar(m, 'maria-silva');
  assert.equal(r.status, 200);
  assert.deepEqual(Object.keys(r.corpo).sort(), ['acoes', 'token', 'usuario']);
  assert.match(r.corpo.token, /^[0-9a-f]{64}$/);
  assert.deepEqual(r.corpo.usuario, exibicao(MARIA));
  assert.deepEqual(r.corpo.acoes, ACOES_MARIA);
  const g = await chamar(m);
  assert.deepEqual(g.corpo, { usuario: exibicao(MARIA), usuarios: USUARIOS, token: r.corpo.token, acoes: ACOES_MARIA });
  assert.equal((await chamar(m, { url: ROTA_CATALOGO, token: r.corpo.token })).status, 200);
  const c = await entrar(m, 'carlos-silva');
  assert.deepEqual(c.corpo.acoes, acoesDoPerfil('revisor'));
  assert.deepEqual((await chamar(m)).corpo.acoes, acoesDoPerfil('revisor'));
});

test('S3. troca de usuário: o token antigo recebe 401 nas outras rotas e o novo recebe 200; o mesmo usuário também troca o token', async () => {
  const m = novo();
  const t1 = (await entrar(m, 'maria-silva')).corpo.token;
  const r2 = await entrar(m, 'carlos-silva');
  const t2 = r2.corpo.token;
  assert.deepEqual(r2.corpo.usuario, exibicao(CARLOS));
  assert.notEqual(t1, t2);
  assert.deepEqual(await chamar(m, { url: ROTA_CATALOGO, token: t1 }).then((x) => [x.status, x.corpo]), [401, { erro: 'nao_autorizado' }]);
  assert.equal((await chamar(m, { url: ROTA_CATALOGO, token: t2 })).status, 200);
  const t3 = (await entrar(m, 'carlos-silva')).corpo.token;
  assert.notEqual(t3, t2);
  assert.equal((await chamar(m, { url: ROTA_CATALOGO, token: t2 })).status, 401);
  assert.equal((await chamar(m, { url: ROTA_CATALOGO, token: t3 })).status, 200);
});

test('S4. recusas 422 (extras, tipo errado, desconhecido, demonstração, não objeto) sem eco e sem mudar a sessão', async () => {
  const m = novo();
  const t = (await entrar(m, 'maria-silva')).corpo.token;
  const casos = [
    { usuarioId: 'usuario-desconhecido-xyz' }, { usuarioId: 'servidor-demonstracao' }, { usuarioId: 42 }, { usuarioId: '' }, { usuarioId: null },
    { usuarioId: 'carlos-silva', extra: 'campo-extra-xyz' }, { usuarioid: 'carlos-silva' }, {}, [], 'carlos-silva', 7, null, { usuarioId: ['carlos-silva'] },
  ];
  for (const corpo of casos) {
    const r = await chamar(m, { method: 'POST', corpo });
    assert.equal(r.status, 422, JSON.stringify(corpo));
    assert.deepEqual(r.corpo, { erro: 'dados_invalidos', campos: ['usuarioId'] });
    assert.doesNotMatch(r.bruto, /desconhecido-xyz|servidor-demonstracao|campo-extra-xyz|carlos/);
  }
  assert.deepEqual((await chamar(m)).corpo, { usuario: exibicao(MARIA), usuarios: USUARIOS, token: t, acoes: ACOES_MARIA });
});

test('S5. POST: só application/json (415), corpo até 1 KB (413), JSON ilegível ou tamanho inválido (400); a sessão não muda', async () => {
  const m = novo();
  const t = (await entrar(m, 'maria-silva')).corpo.token;
  const corpo = JSON.stringify({ usuarioId: 'carlos-silva' });
  for (const tipo of [null, 'text/plain', 'application/x-www-form-urlencoded', 'application/json; charset=latin1']) {
    assert.equal((await chamar(m, { method: 'POST', texto: corpo, tipo })).status, 415, String(tipo));
  }
  const grande = JSON.stringify({ usuarioId: 'carlos-silva', x: 'a'.repeat(1100) });
  const r413 = await chamar(m, { method: 'POST', texto: grande });
  assert.equal(r413.status, 413);
  assert.deepEqual(r413.corpo, { erro: 'corpo_grande_demais' });
  assert.equal((await chamar(m, { method: 'POST', texto: grande, comTamanho: false })).status, 413, 'sem Content-Length, o limite vale na leitura');
  assert.equal((await chamar(m, { method: 'POST', texto: '{ "usuarioId": ' })).status, 400);
  assert.equal((await chamar(m, { method: 'POST', texto: corpo, headers: { 'content-length': 'abc' } })).status, 400);
  assert.equal((await chamar(m, { method: 'POST', texto: corpo, tipo: 'application/json; charset=utf-8' })).status, 200, 'charset utf-8 é aceito');
  // A última entrada válida (Carlos) é a sessão; nenhuma das recusas alterou nada antes dela.
  assert.deepEqual((await chamar(m)).corpo.usuario, exibicao(CARLOS));
  assert.equal((await chamar(m, { url: ROTA_CATALOGO, token: t })).status, 401);
  const m2 = novo();
  const t2 = (await entrar(m2, 'maria-silva')).corpo.token;
  for (const r of [
    await chamar(m2, { method: 'POST', texto: corpo, tipo: 'text/plain' }),
    await chamar(m2, { method: 'POST', texto: grande }),
    await chamar(m2, { method: 'POST', texto: '{' }),
  ]) assert.ok([400, 413, 415].includes(r.status));
  assert.deepEqual((await chamar(m2)).corpo, { usuario: exibicao(MARIA), usuarios: USUARIOS, token: t2, acoes: ACOES_MARIA });
});

test('S6. DELETE exige o token atual: 204 e a sessão acaba; sem token ou com token errado → 401 e a sessão continua', async () => {
  const m = novo();
  const t = (await entrar(m, 'carlos-silva')).corpo.token;
  for (const token of [undefined, '', 'a'.repeat(64), t.slice(1)]) {
    const r = await chamar(m, { method: 'DELETE', token });
    assert.equal(r.status, 401);
    assert.deepEqual(r.corpo, { erro: 'nao_autorizado' });
    assert.equal((await chamar(m)).corpo.usuario.usuarioId, 'carlos-silva');
  }
  const r = await chamar(m, { method: 'DELETE', token: t });
  assert.equal(r.status, 204);
  assert.equal(r.bruto, '');
  assert.equal(r.cab['cache-control'], 'no-store');
  assert.deepEqual((await chamar(m)).corpo, { usuario: null, usuarios: USUARIOS });
  assert.equal((await chamar(m, { url: ROTA_CATALOGO, token: t })).status, 401);
  assert.equal((await chamar(m, { method: 'DELETE', token: t })).status, 401, 'depois de sair, o token não vale mais');
});

test('S7. origem não local recebe 403 nos três métodos, antes de qualquer outra verificação, e nada muda', async () => {
  const m = novo();
  const t = (await entrar(m, 'maria-silva')).corpo.token;
  const variantes = [{ remoteAddress: '192.168.0.10' }, { headers: { host: 'evil.example' } }, { headers: { origin: 'http://evil.example' } }, { headers: { 'sec-fetch-site': 'cross-site' } }];
  for (const v of variantes) {
    for (const pedido of [{ method: 'GET' }, { method: 'POST', corpo: { usuarioId: 'carlos-silva' } }, { method: 'DELETE', token: t }, { method: 'PUT' }, { method: 'POST', texto: 'x'.repeat(5000) }]) {
      const r = await chamar(m, { ...pedido, ...v });
      assert.equal(r.status, 403, `${pedido.method} ${JSON.stringify(v)}`);
      assert.deepEqual(r.corpo, { erro: 'acesso_somente_local' });
    }
  }
  assert.deepEqual((await chamar(m)).corpo.usuario, exibicao(MARIA));
  assert.equal((await chamar(m, { url: ROTA_CATALOGO, token: t })).status, 200);
});

test('S8. outros métodos recebem 405 com Allow: GET, POST, DELETE; GET e DELETE com corpo e qualquer query → 400', async () => {
  const m = novo();
  const t = (await entrar(m, 'maria-silva')).corpo.token;
  for (const method of ['PUT', 'PATCH', 'HEAD', 'OPTIONS', 'TRACE', 'get']) {
    const r = await chamar(m, { method, token: t });
    assert.equal(r.status, 405, method);
    assert.equal(r.cab.allow, 'GET, POST, DELETE');
    assert.deepEqual(r.corpo, { erro: 'metodo_nao_permitido' });
  }
  for (const method of ['GET', 'DELETE']) {
    for (const headers of [{ 'content-length': '5' }, { 'transfer-encoding': 'chunked' }]) {
      assert.equal((await chamar(m, { method, token: t, headers })).status, 400, `${method} ${JSON.stringify(headers)}`);
    }
  }
  for (const pedido of [{ method: 'GET' }, { method: 'POST', corpo: { usuarioId: 'carlos-silva' } }, { method: 'DELETE', token: t }]) {
    const r = await chamar(m, { ...pedido, url: `${ROTA_SESSAO}?usuarioId=carlos-silva` });
    assert.equal(r.status, 400, pedido.method);
    assert.deepEqual(r.corpo, { erro: 'requisicao_invalida' });
  }
  assert.deepEqual((await chamar(m)).corpo, { usuario: exibicao(MARIA), usuarios: USUARIOS, token: t, acoes: ACOES_MARIA }, 'nenhuma recusa mudou a sessão');
});

test('S9. um manipulador novo (servidor reiniciado) começa sem sessão e não aceita o token do anterior', async () => {
  const a = novo();
  const t = (await entrar(a, 'maria-silva')).corpo.token;
  const b = novo();
  assert.deepEqual((await chamar(b)).corpo, { usuario: null, usuarios: USUARIOS });
  assert.equal((await chamar(b, { url: ROTA_CATALOGO, token: t })).status, 401);
  assert.equal((await chamar(b, { method: 'DELETE', token: t })).status, 401);
});

test('S10. gerador de token inválido: POST → 500 indisponivel, sem eco e sem criar sessão', async () => {
  for (const gerarToken of [() => 'curto-secreto', () => 'Z'.repeat(64), () => 7]) {
    const m = novo({ gerarToken });
    const r = await entrar(m, 'maria-silva');
    assert.equal(r.status, 500);
    assert.deepEqual(r.corpo, { erro: 'indisponivel' });
    assert.equal(r.bruto.includes('curto-secreto'), false);
    assert.deepEqual((await chamar(m)).corpo, { usuario: null, usuarios: USUARIOS });
  }
});

test('S11. nada vai para o console (nome, usuarioId, token) e as respostas de erro não repetem o que foi enviado', async () => {
  const saidas = [];
  const originais = {};
  for (const nivel of ['log', 'info', 'warn', 'error', 'debug']) {
    originais[nivel] = console[nivel];
    console[nivel] = (...a) => saidas.push(a.join(' '));
  }
  let token;
  const erros = [];
  try {
    const m = novo();
    await chamar(m);
    token = (await entrar(m, 'maria-silva')).corpo.token;
    await entrar(m, 'carlos-silva');
    erros.push(await entrar(m, 'eco-proibido-xyz'));
    erros.push(await chamar(m, { method: 'POST', texto: '{"usuarioId":"eco-proibido-xyz"', tipo: 'application/json' }));
    erros.push(await chamar(m, { method: 'POST', texto: 'eco-proibido-xyz', tipo: 'text/plain' }));
    erros.push(await chamar(m, { method: 'DELETE', token }));
    erros.push(await chamar(m, { url: ROTA_CATALOGO, token }));
  } finally {
    Object.assign(console, originais);
  }
  assert.deepEqual(saidas, []);
  for (const r of erros) {
    assert.ok(r.status >= 400);
    assert.doesNotMatch(r.bruto, /eco-proibido|maria|carlos|Maria|Carlos/);
    assert.equal(r.bruto.includes(token), false);
  }
  const codigo = fs.readFileSync(path.join(RAIZ, 'services', 'admin', 'admin-endpoint.js'), 'utf8') + fs.readFileSync(path.join(RAIZ, 'services', 'admin', 'sessao.js'), 'utf8');
  assert.doesNotMatch(codigo, /console\.|process\.stdout|process\.stderr/);
});

test('S12. POSTs simultâneos: todos respondem, só o token do último processado vale e o GET mostra esse usuário', async () => {
  const m = novo();
  const ids = Array.from({ length: 20 }, (_, i) => (i % 2 ? 'carlos-silva' : 'maria-silva'));
  const rs = await Promise.all(ids.map((id) => entrar(m, id)));
  assert.ok(rs.every((r) => r.status === 200));
  const tokens = rs.map((r) => r.corpo.token);
  assert.equal(new Set(tokens).size, tokens.length, 'cada entrada recebe um token próprio');
  const validos = [];
  for (const [i, t] of tokens.entries()) if ((await chamar(m, { url: ROTA_CATALOGO, token: t })).status === 200) validos.push(i);
  assert.equal(validos.length, 1, 'exatamente um token continua valendo');
  const atual = (await chamar(m)).corpo;
  assert.equal(atual.token, tokens[validos[0]]);
  assert.equal(atual.usuario.usuarioId, ids[validos[0]]);
});

test('S13. Passo 8C: com Maria na sessão, a gravação registra o ator real (sem nome); com Carlos, a mesma rota é negada (403) e só a recusa é registrada', async () => {
  const pai = fs.mkdtempSync(path.join(os.tmpdir(), 'sema-orienta-sessao-ep-'));
  const raiz = path.join(pai, 'raiz');
  fs.mkdirSync(raiz);
  fs.cpSync(path.join(RAIZ, 'services'), path.join(raiz, 'services'), { recursive: true });
  try {
    const m = criarManipuladorAdmin({ raiz, agora: AGORA, diretorioTemporario: pai });
    const token = (await entrar(m, 'maria-silva')).corpo.token;
    const temaId = 'licenciamento-ambiental';
    const lido = await chamar(m, { url: `/__admin/temas/${temaId}/edicao`, token });
    assert.equal(lido.status, 200, lido.bruto);
    const r = await chamar(m, { url: `/__admin/temas/${temaId}/edicao`, method: 'PATCH', token, corpo: { revisao: lido.corpo.revisao, nome: 'Tema fictício renomeado', confirmado: true } });
    assert.equal(r.status, 200, r.bruto);
    const historico = fs.readFileSync(path.join(raiz, 'data', 'admin-private', 'temas', 'historico.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
    assert.equal(historico.length, 1);
    assert.deepEqual(historico[0].ator, semNome(MARIA), 'o ator da sessão é o gravado');
    assert.doesNotMatch(JSON.stringify(historico), /Maria Silva|nome/);
    // Caso negado: Carlos (Revisor) não edita tema.
    const tokenCarlos = (await entrar(m, 'carlos-silva')).corpo.token;
    const assuntosAntes = fs.readFileSync(path.join(raiz, 'services', 'assuntos.json'));
    const lido2 = await chamar(m, { url: `/__admin/temas/${temaId}/edicao`, token: tokenCarlos });
    const negado = await chamar(m, { url: `/__admin/temas/${temaId}/edicao`, method: 'PATCH', token: tokenCarlos, corpo: { revisao: lido2.corpo.revisao, nome: 'Outro nome fictício', confirmado: true } });
    assert.deepEqual([negado.status, negado.corpo, negado.cab.connection], [403, { erro: 'perfil_sem_permissao' }, 'close']);
    assert.equal(Buffer.compare(fs.readFileSync(path.join(raiz, 'services', 'assuntos.json')), assuntosAntes), 0);
    const negadas = fs.readFileSync(path.join(raiz, 'data', 'admin-private', 'negadas', 'historico.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
    assert.equal(negadas.length, 1);
    assert.deepEqual({ ...negadas[0], dataHora: 'x' }, { id: 'negada-000001', tipo: 'acao_negada', acao: 'editar_tema', dataHora: 'x', resultado: 'negado', motivo: 'perfil_sem_permissao', ator: semNome(CARLOS), servicoId: null });
    assert.equal(fs.readFileSync(path.join(raiz, 'data', 'admin-private', 'temas', 'historico.jsonl'), 'utf8').split('\n').filter(Boolean).length, 1, 'a recusa não entra no histórico do tema');
  } finally {
    fs.rmSync(pai, { recursive: true, force: true });
  }
});

test('S13b. Passo 8C: revisão de fonte (com Maria) e autorização (com Carlos) registram o ator real; Maria não autoriza (403)', async () => {
  const pai = fs.mkdtempSync(path.join(os.tmpdir(), 'sema-orienta-sessao-ep-'));
  const raiz = path.join(pai, 'raiz');
  fs.mkdirSync(raiz);
  fs.cpSync(path.join(RAIZ, 'services'), path.join(raiz, 'services'), { recursive: true });
  const v1 = (nome) => path.join(raiz, 'services', 'lac', 'versoes', 'v1', nome);
  const lerJsonl = (...p) => fs.readFileSync(path.join(raiz, 'data', 'admin-private', ...p), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  try {
    const m = criarManipuladorAdmin({ raiz, agora: AGORA, diretorioTemporario: pai });
    // Com Maria (Cadastrante) na sessão: um texto novo cria uma fonte ainda não revisada, e uma informação fictícia passa a usá-la.
    let token = (await entrar(m, 'maria-silva')).corpo.token;
    const texto = await chamar(m, { url: '/__admin/servicos/lac/entradas-texto', method: 'POST', token, corpo: { titulo: 'Texto fictício da sessão', texto: 'Orientação fictícia cadastrada para o teste da sessão.' } });
    assert.equal(texto.status, 201, texto.bruto);
    const idTexto = JSON.parse(fs.readFileSync(v1('fontes.json'), 'utf8')).fontes.find((f) => f.formaEntrada === 'texto').id;
    const conteudo = JSON.parse(fs.readFileSync(v1('conteudo-assistente.json'), 'utf8'));
    conteudo.blocos.push({
      id: 'bc-sessao', tipo: 'conhecimento', titulo: 'Informação fictícia da sessão', texto: 'Orientação fictícia.', fonteIds: [idTexto],
      referencias: [{ fonteId: idTexto, localizacao: 'página 1' }], origem: 'fonte', ambiente: 'publico', statusValidacao: 'rascunho', publicado: false,
      revisaoAtualidade: 'pendente', criadoEm: '2026-11-10', atualizadoEm: '2026-11-10',
    });
    fs.writeFileSync(v1('conteudo-assistente.json'), `${JSON.stringify(conteudo, null, 2)}\n`);
    // Revisão de fonte pela rota.
    const situacao = await chamar(m, { url: '/__admin/servicos/lac/revisao', token });
    assert.equal(situacao.status, 200, situacao.bruto);
    const r1 = await chamar(m, { url: '/__admin/servicos/lac/revisao/fontes', method: 'POST', token, corpo: { fonteId: idTexto, revisao: situacao.corpo.revisao } });
    assert.equal(r1.status, 200, r1.bruto);
    const revisada = lerJsonl('revisao', 'lac.jsonl').filter((a) => a.acao === 'revisar_fonte');
    assert.equal(revisada.length, 1);
    assert.deepEqual(revisada[0].ator, semNome(MARIA));
    assert.deepEqual(lerJsonl('revisao', 'lac.jsonl').filter((a) => a.acao === 'cadastrar_texto').map((a) => a.ator), [semNome(MARIA)]);
    // Aceitar e concluir pelas funções existentes (só preparação, com os atores certos).
    const rev = criarServicoRevisao({ raiz, agora: AGORA });
    const sit = () => rev.consultar('lac').situacao;
    for (const id of sit().fontes.filter((f) => f.usadaPorBloco && !f.revisada).map((f) => f.id)) assert.equal(rev.revisarFonte('lac', { fonteId: id, revisao: sit().revisao, ator: semNome(MARIA) }).ok, true);
    for (const id of sit().blocos.filter((b) => !b.aceito).map((b) => b.id)) assert.equal(rev.aceitarBloco('lac', { blocoId: id, revisao: sit().revisao, ator: semNome(MARIA) }).ok, true);
    const concluida = rev.concluirRevisao('lac', { revisao: sit().revisao, ator: semNome(CARLOS) });
    assert.equal(concluida.ok, true);
    // Maria (Cadastrante) não autoriza: 403 antes de ler o corpo, nada muda e a recusa é registrada.
    const manifestoAntes = fs.readFileSync(v1('versao.json'));
    const negado = await chamar(m, { url: '/__admin/servicos/lac/autorizacao', method: 'POST', token, corpo: { revisao: concluida.hash } });
    assert.deepEqual([negado.status, negado.corpo], [403, { erro: 'perfil_sem_permissao' }]);
    assert.equal(Buffer.compare(fs.readFileSync(v1('versao.json')), manifestoAntes), 0);
    assert.deepEqual(lerJsonl('negadas', 'historico.jsonl').map((n) => [n.acao, n.ator.usuarioId, n.servicoId]), [['autorizar_publicacao', 'maria-silva', 'lac']]);
    // Carlos (Revisor) autoriza pela rota.
    token = (await entrar(m, 'carlos-silva')).corpo.token;
    const r2 = await chamar(m, { url: '/__admin/servicos/lac/autorizacao', method: 'POST', token, corpo: { revisao: concluida.hash } });
    assert.equal(r2.status, 200, r2.bruto);
    const autorizacoes = lerJsonl('decisoes', 'lac.jsonl').filter((d) => d.tipo === 'autorizacao_publicacao');
    assert.equal(autorizacoes.length, 1);
    assert.deepEqual(autorizacoes[0].ator, semNome(CARLOS));
    const acao = lerJsonl('revisao', 'lac.jsonl').filter((a) => a.acao === 'autorizar_publicacao');
    assert.equal(acao.length, 1);
    assert.deepEqual(acao[0].ator, semNome(CARLOS));
    // O manifesto (vai para o Git) guarda só perfil e setor; nome nunca aparece em lugar nenhum.
    assert.deepEqual(JSON.parse(fs.readFileSync(v1('versao.json'), 'utf8')).responsaveis.autorizacao, { perfil: 'revisor', setor: 'CLABI' });
    const bruto = ['revisao/lac.jsonl', 'decisoes/lac.jsonl', 'negadas/historico.jsonl'].map((p) => fs.readFileSync(path.join(raiz, 'data', 'admin-private', ...p.split('/')), 'utf8')).join('') + fs.readFileSync(v1('versao.json'), 'utf8');
    assert.doesNotMatch(bruto, /Maria Silva|Carlos Silva|"nome"/);
    assert.doesNotMatch(fs.readFileSync(v1('versao.json'), 'utf8'), /maria-silva|carlos-silva/);
  } finally {
    fs.rmSync(pai, { recursive: true, force: true });
  }
});
