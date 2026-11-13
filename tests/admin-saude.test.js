// Saúde do sistema (Marco 8, Passo 8B): verificações reais, falhas simuladas em cópias temporárias e proteção do endpoint
// GET /__admin/saude. Só dados fictícios; a base real é apenas lida, e nada é gravado fora de pastas temporárias.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { verificarSaude, COMPONENTES, CAPACIDADES, ESTADOS } from '../services/admin/saude.js';
import { criarManipuladorAdmin, CABECALHO_TOKEN, ROTA_SESSAO, ROTA_SAUDE } from '../services/admin/admin-endpoint.js';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lerTexto = (...p) => fs.readFileSync(path.join(RAIZ, ...p), 'utf8');
const INSTANTE = new Date('2026-11-13T15:30:45.123Z');
const agora = () => INSTANTE;
const V1 = ['services', 'lac', 'versoes', 'v1'];

const por = (r, id) => r.componentes.find((c) => c.componente === id);
const estados = (r) => Object.fromEntries(r.componentes.map((c) => [c.componente, c.estado]));

async function comCopia(fn) {
  const pai = fs.mkdtempSync(path.join(os.tmpdir(), 'sema-orienta-saude-teste-'));
  const raiz = path.join(pai, 'raiz');
  fs.mkdirSync(raiz);
  fs.cpSync(path.join(RAIZ, 'services'), path.join(raiz, 'services'), { recursive: true });
  try {
    return await fn({ raiz, pai });
  } finally {
    fs.rmSync(pai, { recursive: true, force: true });
  }
}
function retrato(dir) {
  const itens = [];
  const andar = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { itens.push(`D ${path.relative(dir, p)}`); andar(p); } else itens.push(`F ${path.relative(dir, p)} ${crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')}`);
    }
  };
  andar(dir);
  return itens.sort().join('\n');
}
const editar = (raiz, rel, fn) => {
  const arquivo = path.join(raiz, rel);
  const dados = JSON.parse(fs.readFileSync(arquivo, 'utf8'));
  fn(dados);
  fs.writeFileSync(arquivo, JSON.stringify(dados, null, 2));
};
const sobras = () => fs.readdirSync(os.tmpdir()).filter((n) => n.startsWith('sema-orienta-saude-') && !n.startsWith('sema-orienta-saude-teste-'));

// Textos públicos permitidos (nenhum caminho, erro interno, token, dado ou conteúdo).
const MENSAGENS_PERMITIDAS = [
  /^A aplicação administrativa local está respondendo\.$/, /^A pasta do projeto não está acessível\.$/,
  /^Não foi possível ler os assuntos\.$/, /^Há inconsistências no cadastro de assuntos\.$/, /^\d+ assuntos? válidos?\.$/,
  /^Não foi possível ler os serviços cadastrados\.$/, /^\d+ serviços? com problema na versão atual, de \d+\.$/, /^\d+ serviços? com versão atual válida\.$/,
  /^Há referências inconsistentes entre assuntos, serviços, versões e fontes\.$/, /^As referências entre assuntos, serviços, versões e fontes estão consistentes\.$/,
  /^Gravação e leitura num teste temporário funcionaram, sem tocar nos dados reais\.$/, /^O teste temporário de gravação e leitura falhou\.$/,
  /^Não foi possível contar o conteúdo publicado\.$/, /^Nenhum conteúdo está publicado\.$/, /^\d+ versões? publicadas? e \d+ itens? marcados? como publicados?\.$/,
  /^O processamento de fontes ainda não existe\.$/, /^Não há banco de dados: o conteúdo fica em arquivos do projeto\.$/, /^A integração com IA externa ainda não existe\.$/,
  /^MCP não faz parte da operação do produto\.$/, /^A verificação falhou e o componente não pôde ser confirmado\.$/,
];
function conferirSemVazamento(r, ...proibidos) {
  const texto = JSON.stringify(r);
  for (const c of r.componentes) {
    assert.ok(c.mensagem.length <= 120, c.mensagem);
    assert.ok(MENSAGENS_PERMITIDAS.some((re) => re.test(c.mensagem)), `mensagem fora da lista pública: ${c.mensagem}`);
  }
  assert.doesNotMatch(texto, /services\/|services\\|\.json|ENOENT|EACCES|Error|stack|\bat \w|node_modules|\b[0-9a-f]{64}\b/);
  for (const p of proibidos) assert.equal(texto.includes(p), false, p);
}

// ---------- Verificações reais ----------

test('SH1. a base real é verificada: dez componentes, horário ISO, capacidade e estado separados; nada é gravado nos dados reais', () => {
  const antes = retrato(path.join(RAIZ, 'services'));
  const r = verificarSaude({ raiz: RAIZ, agora });
  assert.equal(retrato(path.join(RAIZ, 'services')), antes, 'a base real não foi tocada');
  assert.deepEqual(sobras(), [], 'a pasta temporária do teste de armazenamento foi removida');
  assert.equal(r.geradoEm, '2026-11-13T15:30:45.123Z');
  assert.deepEqual(r.componentes.map((c) => c.componente), [...COMPONENTES]);
  assert.deepEqual(Object.keys(r.componentes[0]).sort(), ['capacidade', 'componente', 'estado', 'mensagem', 'verificadoEm']);
  for (const c of r.componentes) {
    assert.ok(CAPACIDADES.includes(c.capacidade) && ESTADOS.includes(c.estado), c.componente);
    assert.equal(c.verificadoEm, '2026-11-13T15:30:45.123Z');
    assert.match(c.verificadoEm, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  }
  assert.deepEqual(['aplicacao_administrativa', 'base_assuntos', 'base_servicos_versoes', 'base_referencias', 'armazenamento', 'conteudo_publicado'].map((id) => [por(r, id).capacidade, por(r, id).estado]),
    Array(6).fill(['implementado', 'operacional']));
  assert.equal(por(r, 'base_assuntos').mensagem, '1 assunto válido.');
  assert.equal(por(r, 'base_servicos_versoes').mensagem, '1 serviço com versão atual válida.');
  assert.equal(por(r, 'conteudo_publicado').mensagem, 'Nenhum conteúdo está publicado.');
  conferirSemVazamento(r, RAIZ, os.tmpdir());
});

test('SH2. componentes que não existem não fingem funcionamento: nao_implementado ou nao_se_aplica, sempre nao_verificado', () => {
  const r = verificarSaude({ raiz: RAIZ, agora });
  for (const id of ['processamento_fontes', 'banco_de_dados', 'ia_externa']) {
    assert.deepEqual([por(r, id).capacidade, por(r, id).estado], ['nao_implementado', 'nao_verificado'], id);
  }
  assert.deepEqual([por(r, 'mcp').capacidade, por(r, 'mcp').estado], ['nao_se_aplica', 'nao_verificado']);
  assert.match(por(r, 'mcp').mensagem, /não faz parte da operação do produto/);
  const naoExistem = r.componentes.filter((c) => c.capacidade !== 'implementado');
  assert.equal(naoExistem.length, 4);
  assert.ok(naoExistem.every((c) => c.estado !== 'operacional' && c.estado !== 'degradado'));
});

test('SH3. a verificação de armazenamento usa uma pasta temporária fora dos dados reais e a remove, também quando falha', async () => {
  await comCopia(async ({ raiz, pai }) => {
    const antes = retrato(raiz);
    const r = verificarSaude({ raiz, agora, diretorioTemporario: pai });
    assert.equal(por(r, 'armazenamento').estado, 'operacional');
    assert.equal(retrato(raiz), antes, 'nada foi criado ou alterado na raiz');
    assert.deepEqual(fs.readdirSync(pai), ['raiz'], 'a pasta temporária foi removida');
    const falha = verificarSaude({ raiz, agora, diretorioTemporario: pai, sistema: { ...fs, renameSync: () => { throw new Error('/caminho/secreto/falha'); } } });
    assert.deepEqual([por(falha, 'armazenamento').estado, por(falha, 'armazenamento').mensagem], ['indisponivel', 'O teste temporário de gravação e leitura falhou.']);
    assert.deepEqual(fs.readdirSync(pai), ['raiz'], 'removida mesmo com falha');
    assert.equal(retrato(raiz), antes);
    conferirSemVazamento(falha, pai, raiz, 'secreto');
  });
});

// ---------- Falhas simuladas ----------

test('SH4. falhas na base viram degradado ou indisponivel por componente, sem derrubar os demais nem vazar detalhes', async () => {
  await comCopia(async ({ raiz }) => {
    fs.writeFileSync(path.join(raiz, 'services', 'assuntos.json'), '{ conteúdo-secreto-fictício');
    const r = verificarSaude({ raiz, agora });
    assert.equal(por(r, 'base_assuntos').estado, 'indisponivel');
    assert.equal(por(r, 'base_referencias').estado, 'degradado');
    assert.equal(por(r, 'aplicacao_administrativa').estado, 'operacional');
    assert.equal(por(r, 'armazenamento').estado, 'operacional');
    conferirSemVazamento(r, 'secreto', raiz);
  });
  await comCopia(async ({ raiz }) => {
    editar(raiz, 'services/assuntos.json', (d) => { d.assuntos[0].nome = ''; });
    const r = verificarSaude({ raiz, agora });
    assert.deepEqual([por(r, 'base_assuntos').estado, por(r, 'base_assuntos').mensagem], ['degradado', 'Há inconsistências no cadastro de assuntos.']);
    assert.equal(por(r, 'base_referencias').estado, 'degradado');
  });
});

test('SH5. versão atual inválida ou registro ausente: serviços e versões degradado ou indisponivel; conteúdo publicado indisponivel', async () => {
  await comCopia(async ({ raiz }) => {
    fs.writeFileSync(path.join(raiz, ...V1, 'versao.json'), '{ conteúdo-secreto-fictício');
    const r = verificarSaude({ raiz, agora });
    assert.deepEqual([por(r, 'base_servicos_versoes').estado, por(r, 'base_servicos_versoes').mensagem], ['degradado', '1 serviço com problema na versão atual, de 1.']);
    assert.equal(por(r, 'conteudo_publicado').estado, 'indisponivel');
    assert.equal(por(r, 'base_referencias').estado, 'degradado');
    assert.equal(por(r, 'base_assuntos').estado, 'operacional');
    conferirSemVazamento(r, 'secreto');
  });
  await comCopia(async ({ raiz }) => {
    fs.rmSync(path.join(raiz, 'services', 'registry.json'));
    const r = verificarSaude({ raiz, agora });
    assert.equal(por(r, 'base_servicos_versoes').estado, 'indisponivel');
    assert.equal(por(r, 'conteudo_publicado').estado, 'indisponivel');
    assert.equal(por(r, 'base_referencias').estado, 'degradado');
    conferirSemVazamento(r, raiz);
  });
  await comCopia(async ({ raiz }) => {
    fs.rmSync(path.join(raiz, ...V1, 'fontes.json'));
    const r = verificarSaude({ raiz, agora });
    assert.equal(por(r, 'base_referencias').estado, 'degradado');
    assert.equal(por(r, 'conteudo_publicado').estado, 'indisponivel');
  });
});

test('SH6. raiz inválida: aplicação e base ficam indisponivel, sem erro nem vazamento, e os componentes inexistentes seguem como estão', () => {
  for (const raiz of ['relativa/invalida', '', undefined, '/caminho/que/nao/existe']) {
    const r = verificarSaude({ raiz, agora });
    assert.equal(r.componentes.length, 10);
    assert.deepEqual(['aplicacao_administrativa', 'base_assuntos', 'base_servicos_versoes', 'conteudo_publicado'].map((id) => por(r, id).estado), Array(4).fill('indisponivel'), String(raiz));
    assert.equal(por(r, 'mcp').estado, 'nao_verificado');
    conferirSemVazamento(r, 'caminho/que');
  }
});

test('SH7. pasta temporária inexistente ou dentro da raiz: armazenamento indisponivel e nada é criado na raiz', async () => {
  await comCopia(async ({ raiz, pai }) => {
    const antes = retrato(raiz);
    const inexistente = verificarSaude({ raiz, agora, diretorioTemporario: path.join(pai, 'nao-existe') });
    assert.equal(por(inexistente, 'armazenamento').estado, 'indisponivel');
    const dentro = verificarSaude({ raiz, agora, diretorioTemporario: path.join(raiz, 'services') });
    assert.equal(por(dentro, 'armazenamento').estado, 'indisponivel');
    assert.equal(retrato(raiz), antes, 'nenhuma pasta temporária ficou dentro da base');
  });
});

test('SH8. conteúdo publicado é contado de verdade a partir da base (e continua operacional, informando a quantidade)', async () => {
  await comCopia(async ({ raiz }) => {
    editar(raiz, `${V1.join('/')}/documentos.json`, (d) => { d.documentos[0].publicado = true; });
    editar(raiz, `${V1.join('/')}/fontes.json`, (d) => { d.fontes[0].publicado = true; d.fontes[1].publicado = true; });
    const r = verificarSaude({ raiz, agora });
    assert.deepEqual([por(r, 'conteudo_publicado').estado, por(r, 'conteudo_publicado').mensagem], ['operacional', '0 versões publicadas e 3 itens marcados como publicados.']);
    assert.equal(por(r, 'base_referencias').estado, 'degradado', 'o validador acusa o conteúdo publicado sem validação');
  });
  await comCopia(async ({ raiz }) => {
    editar(raiz, 'services/registry.json', (d) => { d.servicos[0].versaoPublicadaId = 'lac-v1'; });
    const r = verificarSaude({ raiz, agora });
    assert.equal(por(r, 'conteudo_publicado').mensagem, '1 versão publicada e 0 itens marcados como publicados.');
  });
});

test('SH9. o módulo de saúde não usa localStorage, rede, ambiente nem log, e só grava na pasta temporária pelo armazenamento', () => {
  const codigo = lerTexto('services', 'admin', 'saude.js');
  assert.doesNotMatch(codigo, /localStorage|fetch\(|node:http|process\.env|console\.|Date\.now|writeFileSync|appendFile|renameSync|unlinkSync|copyFile/);
  const imports = [...codigo.matchAll(/^import [^;]*? from '([^']+)';/gms)].map((m) => m[1]).sort();
  assert.deepEqual(imports, ['../../scripts/validate-services.js', '../versao-atual.js', './armazenamento.js', './versao.js', 'node:fs', 'node:os', 'node:path']);
});

// ---------- Endpoint ----------

async function chamar(m, { url = ROTA_SAUDE, method = 'GET', headers = { host: 'localhost:5173' }, remoteAddress = '127.0.0.1', token } = {}) {
  const cab = {};
  let corpo = null;
  const res = { statusCode: 0, setHeader: (n, v) => { cab[n.toLowerCase()] = v; }, end: (t) => { corpo = t; } };
  const h = { ...headers };
  if (token !== undefined) h[CABECALHO_TOKEN] = token;
  await m({ url, method, headers: h, socket: { remoteAddress, localPort: 5173 } }, res, () => {});
  return { status: res.statusCode, corpo: corpo === null ? null : JSON.parse(corpo), texto: corpo ?? '', cab };
}

test('SH10. GET /__admin/saude com token devolve a saúde com no-store e relógio injetável', async () => {
  const m = criarManipuladorAdmin({ raiz: RAIZ, agora });
  const token = (await chamar(m, { url: ROTA_SESSAO })).corpo.token;
  const r = await chamar(m, { token });
  assert.equal(r.status, 200);
  assert.equal(r.cab['cache-control'], 'no-store');
  assert.equal(r.cab['x-content-type-options'], 'nosniff');
  assert.deepEqual(Object.keys(r.corpo).sort(), ['componentes', 'geradoEm']);
  assert.equal(r.corpo.geradoEm, '2026-11-13T15:30:45.123Z');
  assert.deepEqual(r.corpo.componentes.map((c) => c.componente), [...COMPONENTES]);
  assert.equal(r.texto.includes(token), false);
  conferirSemVazamento(r.corpo, RAIZ);
});

test('SH11. o endpoint exige token, origem local, só GET, sem query nem corpo; outras rotas seguem 404', async () => {
  const m = criarManipuladorAdmin({ raiz: RAIZ, agora });
  const token = (await chamar(m, { url: ROTA_SESSAO })).corpo.token;
  assert.equal((await chamar(m)).status, 401);
  assert.equal((await chamar(m, { token: 'a'.repeat(64) })).status, 401);
  assert.deepEqual((await chamar(m, { token: token.slice(1) })).corpo, { erro: 'nao_autorizado' });
  for (const remoteAddress of ['192.168.0.9', null, '']) assert.equal((await chamar(m, { token, remoteAddress })).status, 403);
  for (const host of ['evil.example', 'localhost:9999']) assert.equal((await chamar(m, { token, headers: { host } })).status, 403);
  assert.equal((await chamar(m, { token, headers: { host: 'localhost:5173', origin: 'http://evil.example' } })).status, 403);
  assert.equal((await chamar(m, { token, headers: { host: 'localhost:5173', 'sec-fetch-site': 'cross-site' } })).status, 403);
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']) {
    const r = await chamar(m, { token, method });
    assert.equal(r.status, 405, method);
    assert.equal(r.cab.allow, 'GET');
  }
  assert.equal((await chamar(m, { token, url: `${ROTA_SAUDE}?a=1` })).status, 400);
  assert.equal((await chamar(m, { token, headers: { host: 'localhost:5173', 'content-length': '5' } })).status, 400);
  assert.equal((await chamar(m, { token, headers: { host: 'localhost:5173', 'transfer-encoding': 'chunked' } })).status, 400);
  for (const url of [`${ROTA_SAUDE}/`, `${ROTA_SAUDE}/x`, '/__admin/saude2']) assert.equal((await chamar(m, { token, url })).status, 404, url);
});

test('SH12. com a base quebrada o endpoint continua respondendo 200 com os estados reais (sem esconder a falha) e sem detalhes internos', async () => {
  await comCopia(async ({ raiz, pai }) => {
    fs.writeFileSync(path.join(raiz, 'services', 'registry.json'), '{ conteúdo-secreto-fictício');
    const m = criarManipuladorAdmin({ raiz, agora, diretorioTemporario: pai });
    const token = (await chamar(m, { url: ROTA_SESSAO })).corpo.token;
    const r = await chamar(m, { token });
    assert.equal(r.status, 200);
    assert.equal(por(r.corpo, 'base_servicos_versoes').estado, 'indisponivel');
    assert.equal(por(r.corpo, 'aplicacao_administrativa').estado, 'operacional');
    conferirSemVazamento(r.corpo, 'secreto', raiz, pai, token);
    assert.equal(r.texto.includes(pai), false);
  });
});

test('SH13. chamadas simultâneas não alteram a base, não deixam pasta temporária e não registram nada em log', async () => {
  const saidas = [];
  const originais = {};
  for (const nivel of ['log', 'info', 'warn', 'error', 'debug']) {
    originais[nivel] = console[nivel];
    console[nivel] = (...a) => saidas.push(a.join(' '));
  }
  try {
    await comCopia(async ({ raiz, pai }) => {
      const antes = retrato(raiz);
      const m = criarManipuladorAdmin({ raiz, agora, diretorioTemporario: pai });
      const token = (await chamar(m, { url: ROTA_SESSAO })).corpo.token;
      const rs = await Promise.all(Array.from({ length: 20 }, () => chamar(m, { token })));
      assert.ok(rs.every((r) => r.status === 200));
      assert.equal(new Set(rs.map((r) => r.texto)).size, 1);
      assert.equal(retrato(raiz), antes);
      assert.deepEqual(fs.readdirSync(pai), ['raiz']);
    });
  } finally {
    Object.assign(console, originais);
  }
  assert.deepEqual(saidas, []);
});

test('SH14. nenhum segredo: respostas e código de saúde sem token, e-mail, chave ou dado pessoal', () => {
  const r = verificarSaude({ raiz: RAIZ, agora });
  const texto = JSON.stringify(r) + lerTexto('services', 'admin', 'saude.js');
  assert.doesNotMatch(texto, /[A-Za-z0-9._-]+@[A-Za-z0-9-]+\.[A-Za-z]{2,}/);
  assert.doesNotMatch(texto, /AIza|sk-[A-Za-z0-9]{10}|ghp_|\bpassword\b|\bapi[_-]?key\b/i);
});
