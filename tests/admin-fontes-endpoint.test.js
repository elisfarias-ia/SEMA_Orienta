// Cadastro de fontes por serviço (Marco 7, Passo 7E3A): POST /__admin/servicos/<id>/fontes.
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
import { hashConteudo } from '../services/admin/hash.js';
import { validarServicos } from '../scripts/validate-services.js';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lerJsonReal = (...p) => JSON.parse(fs.readFileSync(path.join(RAIZ, ...p), 'utf8'));
const V1 = ['services', 'lac', 'versoes', 'v1'];
const ROTA_FONTES = '/__admin/servicos/lac/fontes';
const ROTA_VERSAO = '/__admin/servicos/lac/versao-atual';
const AGORA = () => new Date(2026, 10, 10, 12, 0, 0);
const TIPOS = ['legislacao', 'pagina_oficial', 'manual', 'formulario', 'sistema', 'canal_atendimento', 'outro'];
const FONTE = { id: 'fonte-ficticia', titulo: 'Fonte fictícia', tipo: 'pagina_oficial', orgaoResponsavel: 'Órgão fictício', url: 'https://exemplo.test/pagina', descricao: 'Descrição fictícia.', origemOficial: true };

async function enviar(manipulador, { url, method = 'POST', corpo, texto, headers = {}, token, remoteAddress = '127.0.0.1', localPort = 5173, tipo = 'application/json', comTamanho = true } = {}) {
  const buffer = texto !== undefined ? Buffer.from(texto) : Buffer.from(JSON.stringify(corpo ?? {}));
  const h = { host: 'localhost:5173', ...headers };
  if (tipo !== null) h['content-type'] = tipo;
  if (comTamanho && h['content-length'] === undefined) h['content-length'] = String(buffer.length);
  if (token !== undefined) h[CABECALHO_TOKEN] = token;
  const req = Object.assign(Readable.from([buffer]), { url, method, headers: h, socket: { remoteAddress, localPort } });
  const cabecalhos = {};
  let resposta = null;
  const res = { statusCode: 0, setHeader: (n, v) => { cabecalhos[n.toLowerCase()] = v; }, end: (t) => { resposta = t; } };
  await manipulador(req, res, () => {});
  return { status: res.statusCode, corpo: resposta === null ? null : JSON.parse(resposta), textoBruto: resposta ?? '', cabecalhos };
}
const get = (m, url, token) => enviar(m, { url, method: 'GET', token, tipo: null, texto: '', comTamanho: false });

async function comCopia(fn, opcoes = {}) {
  const pai = fs.mkdtempSync(path.join(os.tmpdir(), 'sema-orienta-fontes-endpoint-'));
  const raiz = path.join(pai, 'raiz');
  fs.mkdirSync(raiz);
  fs.cpSync(path.join(RAIZ, 'services'), path.join(raiz, 'services'), { recursive: true });
  try {
    const m = criarManipuladorAdmin({ raiz, agora: AGORA, diretorioTemporario: pai, ...opcoes });
    const token = (await get(m, ROTA_SESSAO)).corpo.token;
    const revisao = async () => (await get(m, ROTA_VERSAO, token)).corpo.revisaoFontes;
    return await fn({ m, token, raiz, pai, revisao });
  } finally {
    fs.rmSync(pai, { recursive: true, force: true });
  }
}
const postar = (m, token, revisao, extra = {}, opcoes = {}) => enviar(m, { url: ROTA_FONTES, corpo: { ...FONTE, revisao, ...extra }, token, ...opcoes });
const fontesDe = (raiz) => JSON.parse(fs.readFileSync(path.join(raiz, ...V1, 'fontes.json'), 'utf8'));
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
const sobras = (dir) => fs.readdirSync(dir).filter((n) => n.startsWith('sema-orienta-ensaio-') || n.endsWith('.tmp'));
const alterarManifesto = (raiz, estado) => {
  const p = path.join(raiz, ...V1, 'versao.json');
  const v = JSON.parse(fs.readFileSync(p, 'utf8'));
  v.estado = estado;
  if (estado !== 'rascunho') { v.hashConteudo = 'a'.repeat(64); v.enviadaEm = '2026-11-10'; }
  fs.writeFileSync(p, JSON.stringify(v, null, 2));
};

// ---------- Leitura: revisão ----------

test('FE1. GET versao-atual devolve a revisão (SHA-256) do arquivo de fontes, sem caminhos nem token', async () => {
  await comCopia(async ({ m, token, raiz, pai }) => {
    const r = await get(m, ROTA_VERSAO, token);
    assert.equal(r.status, 200);
    assert.equal(r.corpo.revisaoFontes, hashConteudo(fontesDe(raiz)));
    assert.match(r.corpo.revisaoFontes, /^[0-9a-f]{64}$/);
    assert.equal(r.textoBruto.includes(pai), false);
    assert.equal(r.textoBruto.includes(token), false);
    // A revisão muda quando o conteúdo muda e independe da ordem das chaves.
    const antes = r.corpo.revisaoFontes;
    assert.equal((await postar(m, token, antes)).status, 201);
    assert.notEqual(await (async () => (await get(m, ROTA_VERSAO, token)).corpo.revisaoFontes)(), antes);
  });
});

// ---------- Cadastro válido ----------

test('FE2. cadastro válido: 201, fonte em rascunho e não publicada, definida pelo servidor, e as oito fontes existentes intactas', async () => {
  await comCopia(async ({ m, token, raiz, pai, revisao }) => {
    const originais = lerJsonReal(...V1, 'fontes.json').fontes;
    assert.equal(originais.length, 8);
    const r = await postar(m, token, await revisao(), { dataPublicacao: '2020-07-27', dispositivoRelevante: 'Art. 1º' });
    assert.equal(r.status, 201);
    const esperada = {
      id: 'fonte-ficticia', titulo: 'Fonte fictícia', tipo: 'pagina_oficial', orgaoResponsavel: 'Órgão fictício', url: 'https://exemplo.test/pagina', descricao: 'Descrição fictícia.',
      origemOficial: true, statusValidacao: 'rascunho', publicado: false, dataPublicacao: '2020-07-27', dataConsulta: '2026-11-10', dispositivoRelevante: 'Art. 1º',
      vigencia: { situacao: 'nao_se_aplica', normasRelacionadas: [], observacao: null },
    };
    assert.deepEqual(r.corpo.fonte, esperada);
    assert.equal(r.corpo.revisao, hashConteudo(fontesDe(raiz)), 'a nova revisão é a do arquivo gravado');
    const doc = fontesDe(raiz);
    assert.equal(doc.fontes.length, 9);
    assert.deepEqual(doc.fontes.slice(0, 8), originais, 'as fontes existentes não mudaram');
    assert.deepEqual(doc.fontes[8], esperada);
    assert.deepEqual({ serviceId: doc.serviceId, statusValidacao: doc.statusValidacao, pendencia: doc.pendencia }, (({ serviceId, statusValidacao, pendencia }) => ({ serviceId, statusValidacao, pendencia }))(lerJsonReal(...V1, 'fontes.json')));
    assert.deepEqual(validarServicos(raiz), { erros: [], servicos: ['lac'] });
    assert.deepEqual(sobras(pai), []);
    assert.equal(r.cabecalhos['cache-control'], 'no-store');
    // Campos opcionais ausentes viram null.
    const r2 = await postar(m, token, r.corpo.revisao, { id: 'outra-fonte', url: 'https://exemplo.test/outra' });
    assert.equal(r2.status, 201);
    assert.equal(r2.corpo.fonte.dataPublicacao, null);
    assert.equal(r2.corpo.fonte.dispositivoRelevante, null);
  });
});

test('FE3. a fonte nunca nasce validada ou publicada, e origem oficial não significa validação', async () => {
  await comCopia(async ({ m, token, raiz, revisao }) => {
    for (const origemOficial of [true, false]) {
      const r = await postar(m, token, await revisao(), { id: `fonte-${origemOficial}`, url: `https://exemplo.test/${origemOficial}`, origemOficial });
      assert.equal(r.status, 201);
      assert.equal(r.corpo.fonte.origemOficial, origemOficial);
      assert.equal(r.corpo.fonte.statusValidacao, 'rascunho');
      assert.equal(r.corpo.fonte.publicado, false);
    }
    const novas = fontesDe(raiz).fontes.slice(8);
    assert.ok(novas.every((f) => f.statusValidacao === 'rascunho' && f.publicado === false));
    assert.deepEqual(validarServicos(raiz), { erros: [], servicos: ['lac'] });
  });
});

test('FE4. tipos permitidos: legislação nasce com vigência "a_confirmar" e os demais com "nao_se_aplica"; tipo inválido é recusado', async () => {
  await comCopia(async ({ m, token, raiz, revisao }) => {
    for (const tipo of TIPOS) {
      const r = await postar(m, token, await revisao(), { id: `fonte-${tipo.replace('_', '-')}`, url: `https://exemplo.test/${tipo}`, tipo });
      assert.equal(r.status, 201, tipo);
      assert.deepEqual(r.corpo.fonte.vigencia, { situacao: tipo === 'legislacao' ? 'a_confirmar' : 'nao_se_aplica', normasRelacionadas: [], observacao: null }, tipo);
    }
    assert.deepEqual(validarServicos(raiz), { erros: [], servicos: ['lac'] });
    const antes = retrato(raiz);
    for (const tipo of ['Legislacao', 'lei', '', undefined, 5, null, ['outro']]) {
      const r = await postar(m, token, await revisao(), { id: 'x-ficticia', url: 'https://exemplo.test/x', tipo });
      assert.equal(r.status, 422, String(tipo));
      assert.deepEqual(r.corpo, { erro: 'dados_invalidos', campos: ['tipo'] });
    }
    assert.equal(retrato(raiz), antes);
  });
});

// ---------- Campos ----------

test('FE5. campos extras (status, publicação, vigência, data de consulta) vindos do cliente são recusados', async () => {
  await comCopia(async ({ m, token, raiz, revisao }) => {
    const antes = retrato(raiz);
    const rev = await revisao();
    for (const extra of [{ statusValidacao: 'validado' }, { publicado: true }, { vigencia: { situacao: 'vigente' } }, { dataConsulta: '2020-01-01' }, { normasRelacionadas: [] }, { observacao: 'x' }, { estado: 'publicado' }, { hashConteudo: 'a'.repeat(64) }, { decisao: 'validado_materialmente' }, { oficial: true }]) {
      const r = await postar(m, token, rev, extra);
      assert.equal(r.status, 422, JSON.stringify(extra));
      assert.deepEqual(r.corpo, { erro: 'dados_invalidos', campos: ['extras'] });
    }
    assert.equal(retrato(raiz), antes);
  });
});

test('FE6. dados inválidos: obrigatórios, limites, datas, booleano e texto com e-mail, telefone ou caracteres de controle', async () => {
  await comCopia(async ({ m, token, raiz, revisao }) => {
    const antes = retrato(raiz);
    const rev = await revisao();
    const email = ['pessoa', 'exemplo.test'].join('@');
    const telefone = ['(65)', ['99999', '0000'].join('-')].join(' ');
    const casos = [
      [{ id: 'Id Ruim' }, 'id'], [{ id: '' }, 'id'], [{ id: 'a'.repeat(61) }, 'id'], [{ titulo: '' }, 'titulo'], [{ titulo: 'x'.repeat(201) }, 'titulo'],
      [{ orgaoResponsavel: '  ' }, 'orgaoResponsavel'], [{ orgaoResponsavel: 5 }, 'orgaoResponsavel'], [{ descricao: '' }, 'descricao'], [{ descricao: 'x'.repeat(1001) }, 'descricao'],
      [{ origemOficial: 'sim' }, 'origemOficial'], [{ origemOficial: undefined }, 'origemOficial'], [{ dataPublicacao: '27/07/2020' }, 'dataPublicacao'], [{ dataPublicacao: '2020-02-31' }, 'dataPublicacao'],
      [{ dispositivoRelevante: 'x'.repeat(201) }, 'dispositivoRelevante'], [{ titulo: `Contato ${email}` }, 'titulo'], [{ descricao: `Fale ${telefone}` }, 'descricao'],
      [{ titulo: 'linha\ninvalida' }, 'titulo'], [{ dispositivoRelevante: `Ver ${email}` }, 'dispositivoRelevante'],
    ];
    for (const [extra, campo] of casos) {
      const r = await postar(m, token, rev, extra);
      assert.equal(r.status, 422, JSON.stringify(extra).slice(0, 50));
      assert.deepEqual(r.corpo, { erro: 'dados_invalidos', campos: [campo] });
      assert.equal(r.textoBruto.includes('pessoa'), false, 'não repete o que foi enviado');
    }
    for (const corpo of [{}, [], null, 'texto', 5]) assert.equal((await enviar(m, { url: ROTA_FONTES, corpo, token })).status, 422);
    assert.equal(retrato(raiz), antes);
  });
});

test('FE7. a URL deve ser HTTPS, sem usuário e senha nem parâmetro de credencial', async () => {
  await comCopia(async ({ m, token, raiz, revisao }) => {
    const antes = retrato(raiz);
    const rev = await revisao();
    const ruins = ['http://exemplo.test/p', 'ftp://exemplo.test/p', 'javascript:alert(1)', 'data:text/html,x', 'exemplo.test/p', '//exemplo.test/p', 'https://', '',
      ['https://usuario:senha', 'exemplo.test/p'].join('@'), ['https://usuario', 'exemplo.test/p'].join('@'), 'https://exemplo.test/p?token=abc', 'https://exemplo.test/p?api_key=abc', 'https://exemplo.test/p?senha=abc',
      'https://exemplo.test/p com espaço', `https://exemplo.test/${'a'.repeat(500)}`, 'https://exemplo.test/p\n', 5, null, undefined];
    for (const url of ruins) {
      const r = await postar(m, token, rev, { url });
      assert.equal(r.status, 422, String(url).slice(0, 40));
      assert.deepEqual(r.corpo, { erro: 'dados_invalidos', campos: ['url'] });
    }
    assert.equal(retrato(raiz), antes);
    assert.equal((await postar(m, token, rev, { url: 'https://exemplo.test/p?pagina=2#trecho' })).status, 201);
  });
});

// ---------- Duplicidade ----------

test('FE8. id repetido e URL repetida (já normalizada, ignorando caixa, barra final e trecho) viram 409 e nada muda', async () => {
  await comCopia(async ({ m, token, raiz, revisao }) => {
    assert.equal((await postar(m, token, await revisao())).status, 201);
    const antes = retrato(raiz);
    const outraUrl = { url: 'https://exemplo.test/outra' };
    const r1 = await postar(m, token, await revisao(), outraUrl);
    assert.deepEqual([r1.status, r1.corpo], [409, { erro: 'ja_existe', campo: 'id' }]);
    for (const url of ['https://EXEMPLO.test/Pagina/', 'https://exemplo.test/pagina#outro-trecho', 'https://exemplo.test/pagina//']) {
      const r = await postar(m, token, await revisao(), { id: 'id-novo', url });
      assert.deepEqual([r.status, r.corpo], [409, { erro: 'ja_existe', campo: 'url' }], url);
    }
    // Repetir um id ou uma URL de fonte já existente da LAC também é recusado.
    const existente = lerJsonReal(...V1, 'fontes.json').fontes[0];
    assert.deepEqual((await postar(m, token, await revisao(), { id: existente.id, url: 'https://exemplo.test/nova' })).corpo, { erro: 'ja_existe', campo: 'id' });
    assert.deepEqual((await postar(m, token, await revisao(), { id: 'id-novo', url: existente.url })).corpo, { erro: 'ja_existe', campo: 'url' });
    assert.equal(retrato(raiz), antes);
  });
});

// ---------- Estado da versão e revisão ----------

test('FE9. só se cadastra fonte em versão em rascunho: qualquer outro estado devolve 409 sem alterar arquivos', async () => {
  for (const estado of ['em_validacao', 'ajustes_solicitados', 'validado_materialmente', 'autorizado_publicacao', 'publicado']) {
    await comCopia(async ({ m, token, raiz }) => {
      const rev = (await get(m, ROTA_VERSAO, token)).corpo.revisaoFontes;
      alterarManifesto(raiz, estado);
      const antes = retrato(raiz);
      const r = await postar(m, token, rev);
      assert.deepEqual([r.status, r.corpo], [409, { erro: 'versao_nao_editavel' }], estado);
      assert.equal(retrato(raiz), antes, estado);
    });
  }
  await comCopia(async ({ m, token, raiz, revisao }) => {
    assert.equal((await postar(m, token, await revisao())).status, 201, 'rascunho aceita');
  });
});

test('FE10. revisão ausente, malformada ou divergente: 422 ou 409, sem alterar arquivos; revisão antiga não vale mais', async () => {
  await comCopia(async ({ m, token, raiz, revisao }) => {
    const antes = retrato(raiz);
    const { revisao: _sem, ...semRevisao } = { ...FONTE, revisao: 'x' };
    const ausente = await enviar(m, { url: ROTA_FONTES, corpo: semRevisao, token });
    assert.deepEqual([ausente.status, ausente.corpo], [422, { erro: 'dados_invalidos', campos: ['revisao'] }]);
    for (const rev of ['', 'abc', 'A'.repeat(64), 5, null, ['a'.repeat(64)]]) {
      const r = await postar(m, token, rev);
      assert.deepEqual([r.status, r.corpo], [422, { erro: 'dados_invalidos', campos: ['revisao'] }], String(rev).slice(0, 10));
    }
    const divergente = await postar(m, token, 'a'.repeat(64));
    assert.deepEqual([divergente.status, divergente.corpo], [409, { erro: 'revisao_divergente' }]);
    assert.equal(retrato(raiz), antes);
    // Fluxo de dois editores: o segundo, com a revisão antiga, é recusado; com a nova, é aceito.
    const rev0 = await revisao();
    const a = await postar(m, token, rev0, { id: 'fonte-a', url: 'https://exemplo.test/a' });
    assert.equal(a.status, 201);
    const b = await postar(m, token, rev0, { id: 'fonte-b', url: 'https://exemplo.test/b' });
    assert.deepEqual([b.status, b.corpo], [409, { erro: 'revisao_divergente' }]);
    assert.equal(fontesDe(raiz).fontes.length, 9, 'a segunda gravação não perdeu nem sobrescreveu a primeira');
    assert.equal((await postar(m, token, a.corpo.revisao, { id: 'fonte-b', url: 'https://exemplo.test/b' })).status, 201);
    assert.deepEqual(fontesDe(raiz).fontes.slice(8).map((f) => f.id), ['fonte-a', 'fonte-b']);
  });
});

// ---------- Concorrência e rollback ----------

test('FE11. duas gravações concorrentes com a mesma revisão: uma vence, a outra recebe 409, e nada se perde', async () => {
  await comCopia(async ({ m, token, raiz, revisao }) => {
    const rev = await revisao();
    const rs = await Promise.all([
      postar(m, token, rev, { id: 'fonte-a', url: 'https://exemplo.test/a' }),
      postar(m, token, rev, { id: 'fonte-b', url: 'https://exemplo.test/b' }),
      postar(m, token, rev, { id: 'fonte-c', url: 'https://exemplo.test/c' }),
    ]);
    assert.deepEqual(rs.map((r) => r.status).sort(), [201, 409, 409]);
    assert.ok(rs.filter((r) => r.status === 409).every((r) => r.corpo.erro === 'revisao_divergente' || r.corpo.erro === 'operacao_em_andamento'));
    assert.equal(fontesDe(raiz).fontes.length, 9, 'exatamente uma fonte foi acrescentada');
    assert.deepEqual(validarServicos(raiz), { erros: [], servicos: ['lac'] });
  });
});

test('FE12. a trava de escrita já existente é reutilizada: gravação em andamento faz a outra receber 409', async () => {
  let liberar;
  const portao = new Promise((r) => { liberar = r; });
  let entrou;
  const aviso = new Promise((r) => { entrou = r; });
  let primeira = true;
  const antesDeGravar = async () => { if (primeira) { primeira = false; entrou(); await portao; } };
  await comCopia(async ({ m, token, raiz, revisao }) => {
    const rev = await revisao();
    const p1 = postar(m, token, rev, { id: 'fonte-a', url: 'https://exemplo.test/a' });
    await aviso;
    const r2 = await postar(m, token, rev, { id: 'fonte-b', url: 'https://exemplo.test/b' });
    assert.deepEqual([r2.status, r2.corpo], [409, { erro: 'operacao_em_andamento' }]);
    liberar();
    assert.equal((await p1).status, 201);
    assert.deepEqual(fontesDe(raiz).fontes.slice(8).map((f) => f.id), ['fonte-a']);
  }, { antesDeGravar });
});

test('FE13. falha na gravação ou na conferência final desfaz tudo: o arquivo de fontes volta byte a byte', async () => {
  const sistema = { ...fs, renameSync: () => { throw new Error('/caminho/secreto/falha'); } };
  await comCopia(async ({ m, token, raiz, pai, revisao }) => {
    const antes = retrato(raiz);
    const r = await postar(m, token, await revisao());
    assert.deepEqual([r.status, r.corpo], [500, { erro: 'indisponivel' }]);
    assert.equal(r.textoBruto.includes('secreto'), false);
    assert.equal(r.textoBruto.includes(pai), false);
    assert.equal(retrato(raiz), antes);
    assert.deepEqual(sobras(pai), []);
  }, { sistema });
  await comCopia(async ({ m, token, raiz, pai, revisao }) => {
    const original = fs.readFileSync(path.join(raiz, ...V1, 'fontes.json'), 'utf8');
    const antes = retrato(raiz);
    const r = await postar(m, token, await revisao());
    assert.deepEqual([r.status, r.corpo], [500, { erro: 'indisponivel' }]);
    assert.equal(fs.readFileSync(path.join(raiz, ...V1, 'fontes.json'), 'utf8'), original, 'restaurado byte a byte');
    assert.equal(retrato(raiz), antes);
    assert.deepEqual(sobras(pai), []);
  }, { verificarFinal: () => ['recusado de propósito'] });
});

// ---------- Segurança da requisição ----------

test('FE14. serviço inexistente ou id inválido: 404; token, origem, método, tipo, tamanho e query são exigidos', async () => {
  await comCopia(async ({ m, token, raiz, revisao }) => {
    const rev = await revisao();
    const antes = retrato(raiz);
    const naoExiste = await enviar(m, { url: '/__admin/servicos/nao-existe/fontes', corpo: { ...FONTE, revisao: rev }, token });
    assert.deepEqual([naoExiste.status, naoExiste.corpo], [404, { erro: 'nao_encontrado' }], 'serviço não cadastrado');
    for (const url of ['/__admin/servicos/LAC/fontes', '/__admin/servicos/lac%2f..%2fx/fontes', '/__admin/servicos/../fontes', '/__admin/servicos/lac/fontes/', '/__admin/servicos/lac/fontes/x', '/__admin/servicos//fontes']) {
      const lido = await get(m, url, token);
      assert.deepEqual([lido.status, lido.corpo], [404, { erro: 'nao_encontrado' }], `GET ${url}`);
      const gravado = await enviar(m, { url, corpo: { ...FONTE, revisao: rev }, token });
      assert.equal(gravado.status, 405, `POST ${url}`);
      assert.equal(gravado.cabecalhos.allow, 'GET', 'não é rota de cadastro');
    }
    const pedir = (extra) => enviar(m, { url: ROTA_FONTES, corpo: { ...FONTE, revisao: rev }, token, ...extra });
    assert.equal((await enviar(m, { url: ROTA_FONTES, corpo: { ...FONTE, revisao: rev } })).status, 401, 'sem token');
    assert.equal((await pedir({ token: 'a'.repeat(64) })).status, 401);
    for (const remoteAddress of ['192.168.0.9', null, '']) assert.equal((await pedir({ remoteAddress })).status, 403);
    for (const host of ['evil.example', 'localhost:9999']) assert.equal((await pedir({ headers: { host } })).status, 403);
    assert.equal((await pedir({ headers: { origin: 'http://evil.example' } })).status, 403);
    assert.equal((await pedir({ headers: { 'sec-fetch-site': 'cross-site' } })).status, 403);
    for (const method of ['GET', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']) {
      const r = await pedir({ method });
      assert.equal(r.status, 405, method);
      assert.equal(r.cabecalhos.allow, 'POST');
    }
    for (const tipo of [null, 'text/plain', 'application/x-www-form-urlencoded', 'application/jsonx']) assert.equal((await pedir({ tipo })).status, 415, String(tipo));
    assert.equal((await enviar(m, { url: `${ROTA_FONTES}?x=1`, corpo: { ...FONTE, revisao: rev }, token })).status, 400);
    assert.equal((await enviar(m, { url: ROTA_FONTES, texto: ' '.repeat(32 * 1024 + 1), token })).status, 413);
    assert.equal((await enviar(m, { url: ROTA_FONTES, texto: ' '.repeat(32 * 1024 + 1), token, comTamanho: false })).status, 413);
    assert.equal((await enviar(m, { url: ROTA_FONTES, texto: '{"id": ', token })).status, 400);
    assert.equal(retrato(raiz), antes, 'nada foi gravado em nenhuma recusa');
  });
});

test('FE15. não registra corpo nem token em log, e as respostas de erro não repetem o que foi enviado nem expõem caminhos', async () => {
  const saidas = [];
  const originais = {};
  for (const nivel of ['log', 'info', 'warn', 'error', 'debug']) {
    originais[nivel] = console[nivel];
    console[nivel] = (...a) => saidas.push(a.join(' '));
  }
  const respostas = [];
  let token;
  try {
    await comCopia(async ({ m, token: t, pai, revisao }) => {
      token = t;
      const rev = await revisao();
      respostas.push(await postar(m, t, rev, { descricao: 'CORPO-SECRETO-FICTICIO' }));
      respostas.push(await postar(m, t, rev, { descricao: 'CORPO-SECRETO-FICTICIO' }));
      respostas.push(await postar(m, t, 'a'.repeat(64), { id: 'outro-id', url: 'https://exemplo.test/x', descricao: 'CORPO-SECRETO-FICTICIO' }));
      respostas.push(await postar(m, t, rev, { id: 'ID RUIM CORPO-SECRETO-FICTICIO' }));
      respostas.push(await enviar(m, { url: ROTA_FONTES, texto: '{CORPO-SECRETO-FICTICIO', token: t }));
      for (const r of respostas) assert.equal(r.textoBruto.includes(pai), false);
    });
  } finally {
    Object.assign(console, originais);
  }
  assert.deepEqual(respostas.map((r) => r.status), [201, 409, 409, 422, 400]);
  for (const [i, r] of respostas.entries()) {
    if (r.status !== 201) assert.equal(r.textoBruto.includes('CORPO-SECRETO'), false, `resposta ${i}`);
    assert.equal(r.textoBruto.includes(token), false);
    assert.doesNotMatch(r.textoBruto, /services\/|\.json|\\\\/);
  }
  assert.deepEqual(saidas, []);
});

// ---------- A base real ----------

test('FE16. a base real permanece inalterada: oito fontes da LAC, catálogo e registro sem mudanças e nenhum POST real', () => {
  const doc = lerJsonReal(...V1, 'fontes.json');
  assert.equal(doc.fontes.length, 8);
  assert.ok(doc.fontes.every((f) => f.publicado === false));
  assert.ok(doc.fontes.every((f) => f.statusValidacao === 'validado'), 'as oito fontes continuam como estavam (validadas quanto à procedência, não publicadas)');
  assert.deepEqual(doc.fontes.map((f) => f.id), ['sema-orientacoes-lac', 'lei-complementar-668-2020', 'decreto-695-2020', 'decreto-1268-2022', 'decreto-1585-2022', 'tr-176-lac', 'manual-lac-siga-2020', 'faq-lac-2022']);
  assert.deepEqual(lerJsonReal('services', 'assuntos.json').assuntos.map((a) => a.nome), ['Licenciamento Ambiental']);
  assert.deepEqual(lerJsonReal('services', 'registry.json').servicos.map((s) => s.id), ['lac']);
  assert.deepEqual(validarServicos(RAIZ), { erros: [], servicos: ['lac'] });
  assert.deepEqual(fs.readdirSync(os.tmpdir()).filter((n) => n.startsWith('sema-orienta-fontes') || n.startsWith('sema-orienta-ensaio-')), []);
});
