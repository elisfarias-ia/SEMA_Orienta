// Segurança do servidor MCP local (Passo 2C1): ids recusados antes do disco, travessia, links simbólicos e junções,
// manifesto adulterado, arquivo grande, JSON corrompido, análise estática e integridade da base.
// Tudo que altera arquivos usa cópias temporárias fora do repositório; a base real só é lida.

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { criarFerramentas, AVISO } from '../scripts/mcp/ferramentas.js';
import { criarLeituraSegura, caminhoPermitido, TAMANHO_MAXIMO } from '../scripts/mcp/leitura-segura.js';
import { criarProcessador } from '../scripts/mcp/protocolo.js';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const V1 = ['services', 'lac', 'versoes', 'v1'];
const SEGREDO = 'SEGREDO_FICTICIO';
const temporarios = [];
after(() => {
  for (const t of temporarios) fs.rmSync(t, { recursive: true, force: true });
});

function copia() {
  const pai = fs.mkdtempSync(path.join(os.tmpdir(), 'sema-orienta-mcp-seguranca-'));
  temporarios.push(pai);
  fs.cpSync(path.join(RAIZ, 'services'), path.join(pai, 'services'), { recursive: true });
  return pai;
}

/** Módulo de arquivos espionado: registra cada acesso (lstat, realpath, leitura) antes de repassar ao fs real. */
function espiao() {
  const acessos = [];
  const registrar = (tipo, fn) => (...a) => {
    acessos.push({ tipo, caminho: String(a[0]) });
    return fn(...a);
  };
  const realpathSync = registrar('realpath', (p) => fs.realpathSync(p));
  return {
    acessos,
    sistema: { lstatSync: registrar('lstat', fs.lstatSync), realpathSync, readFileSync: registrar('leitura', fs.readFileSync) },
  };
}

/** Hash SHA-256 de uma pasta (caminhos relativos e conteúdo, em ordem). */
function hashDaPasta(pasta) {
  const h = crypto.createHash('sha256');
  const visitar = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const p = path.join(dir, e.name);
      h.update(path.relative(pasta, p).split(path.sep).join('/'));
      if (e.isDirectory()) visitar(p);
      else h.update(fs.readFileSync(p));
    }
  };
  visitar(pasta);
  return h.digest('hex');
}

/** Nenhuma saída pode conter a raiz temporária, o nome de usuário, pilha, mensagens internas nem o valor enviado. */
function semVazamento(texto, raiz, extras = []) {
  // A chave isError do envelope não conta como vazamento; o que se confere é o conteúdo devolvido.
  texto = texto.split('"isError"').join('');
  const usuario = os.userInfo().username;
  const proibidos = [SEGREDO, 'API_KEY', raiz, raiz.split(path.sep).join('/'), os.tmpdir(), 'at ', 'Error', 'node:', ...extras];
  if (usuario.length >= 3) proibidos.push(usuario);
  for (const p of proibidos) assert.ok(!texto.includes(p), `vazou: ${p === raiz ? '<raiz>' : p}`);
}

function falha(r, codigo) {
  assert.equal(r.isError, true);
  assert.deepEqual(r.dados, { aviso: AVISO, erro: codigo });
}

const IDS_INVALIDOS = [
  '', 'a'.repeat(61), 'LAC', 'lác', 'ｌａｃ', 'lac\u0000', '../lac', 'lac/..', 'C:\\x', '/etc', '\\\\srv\\x', '%2e%2e', '__proto__',
  'lac ', ' lac', '1lac', 'lac.json', 'lac\u200b', 42, null, true, [], ['lac'], {}, { id: 'lac' },
];
const IDS_INEXISTENTES = ['constructor', 'con', 'nul', 'prototype', 'hasownproperty', 'tostring', 'a'.repeat(60)];

test('S1. ids inválidos são recusados com parametro_invalido sem nenhum acesso a disco', () => {
  for (const valor of IDS_INVALIDOS) {
    for (const [nome, chave, extra] of [['consultar_fontes', 'servicoId', {}], ['consultar_fontes', 'fonteId', { servicoId: 'lac' }], ['listar_servicos', 'assuntoId', {}]]) {
      const { acessos, sistema } = espiao();
      const r = criarFerramentas({ raiz: RAIZ, sistema }).chamar(nome, { ...extra, [chave]: valor });
      falha(r, 'parametro_invalido');
      assert.deepEqual(acessos, [], `${nome}.${chave} = ${JSON.stringify(valor)}`);
      if (typeof valor === 'string' && valor.length > 2) assert.ok(!JSON.stringify(r).includes(valor));
    }
  }
});

test('S2. ids com formato válido mas inexistentes (constructor, con, nul...) só tocam o catálogo e são recusados', () => {
  for (const valor of IDS_INEXISTENTES) {
    const a = espiao();
    falha(criarFerramentas({ raiz: RAIZ, sistema: a.sistema }).chamar('consultar_fontes', { servicoId: valor }), 'servico_nao_encontrado');
    const relativos = new Set(a.acessos.map((x) => path.relative(RAIZ, x.caminho).split(path.sep).join('/')));
    assert.deepEqual([...relativos].sort(), ['services', 'services/registry.json'], valor);

    const b = espiao();
    falha(criarFerramentas({ raiz: RAIZ, sistema: b.sistema }).chamar('listar_servicos', { assuntoId: valor }), 'assunto_nao_encontrado');
    const relativosB = new Set(b.acessos.map((x) => path.relative(RAIZ, x.caminho).split(path.sep).join('/')));
    assert.deepEqual([...relativosB].sort(), ['services', 'services/assuntos.json'], valor);
  }
});

test('S3. argumentos: chave extra, __proto__, constructor, versão não registrada e tipos errados são recusados sem disco', () => {
  const casos = [
    ['consultar_fontes', { servicoId: 'lac', extra: 1 }],
    ['consultar_fontes', { servicoId: 'lac', versaoId: 'lac-v1' }],
    ['consultar_fontes', { servicoId: 'lac', versaoId: 'lac-v2' }],
    ['consultar_fontes', { servicoId: 'lac', caminho: 'services/registry.json' }],
    ['consultar_fontes', JSON.parse('{"servicoId":"lac","__proto__":{}}')],
    ['consultar_fontes', JSON.parse('{"__proto__":{"servicoId":"lac"}}')],
    ['consultar_fontes', { servicoId: 'lac', constructor: 'x' }],
    ['listar_assuntos', JSON.parse('{"__proto__":{}}')],
    ['listar_assuntos', { ativo: 'true' }],
    ['listar_assuntos', { ativo: 1 }],
    ['listar_assuntos', { ativo: null }],
    ['listar_servicos', { assuntoId: 'licenciamento-ambiental', servicoId: 'lac' }],
    ['resumir_base', { a: 1 }],
    ['consultar_fontes', 'servicoId=lac'],
    ['consultar_fontes', ['lac']],
    ['consultar_fontes', null],
    ['listar_assuntos', 42],
    ['listar_assuntos', Object.create({ ativo: true })],
    ['consultar_fontes', {}],
  ];
  for (const [nome, args] of casos) {
    const { acessos, sistema } = espiao();
    falha(criarFerramentas({ raiz: RAIZ, sistema }).chamar(nome, args), 'parametro_invalido');
    assert.deepEqual(acessos, [], `${nome} ${JSON.stringify(args)}`);
  }
  // Pelo protocolo: arguments como texto ou lista também vira erro de ferramenta, sem ecoar a entrada.
  const p = criarProcessador({ ferramentas: criarFerramentas({ raiz: RAIZ }) });
  for (const args of ['"../../.env"', '["lac"]', '{"servicoId":"lac","__proto__":{"x":1}}']) {
    const texto = p(`{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"consultar_fontes","arguments":${args}}}`);
    assert.equal(JSON.parse(texto).result.isError, true);
    assert.ok(!texto.includes('.env') && !texto.includes('"x"'));
  }
  assert.equal(Object.prototype.servicoId, undefined);
});

test('S4. leitura segura: travessia e caminhos fora da lista são recusados antes de tocar o disco', () => {
  const recusados = [
    'services/../.env', '../.env', '/etc/passwd', 'C:/Windows/win.ini', 'services\\registry.json', 'services/registry.json\u0000',
    'services/lac/versoes/v1/../../../../.env', 'services/lac/versoes/v1/roteiro.md', 'services/admin/admin-endpoint.js',
    'data/admin-private/x.json', '.claude/settings.json', 'services/lac/service.json', 'services/lac/versoes/v1/outro.json',
    'services/lac/versoes/v0/fontes.json', 'services/LAC/versoes/v1/fontes.json', 'services/./registry.json', '', null, 42,
  ];
  for (const caminho of recusados) {
    assert.equal(caminhoPermitido(caminho), false, String(caminho));
    const { acessos, sistema } = espiao();
    assert.deepEqual(criarLeituraSegura({ raiz: RAIZ, sistema }).lerJson(caminho), { ok: false, erro: 'base_indisponivel' });
    assert.deepEqual(acessos, []);
  }
  for (const ok of ['services/registry.json', 'services/assuntos.json', 'services/lac/versoes/v1/fontes.json', 'services/lac/versoes/v1/versao.json']) {
    assert.equal(caminhoPermitido(ok), true, ok);
  }
  assert.throws(() => criarLeituraSegura({ raiz: 'relativo' }));
});

/** Prepara uma raiz temporária com .env fictício e dado privado fictício fora de services/. */
function raizComAlvos() {
  const raiz = copia();
  fs.writeFileSync(path.join(raiz, '.env'), `API_KEY=${SEGREDO}\n`, 'utf8');
  fs.mkdirSync(path.join(raiz, 'data', 'admin-private'), { recursive: true });
  fs.writeFileSync(path.join(raiz, 'data', 'admin-private', 'x.json'), JSON.stringify({ segredo: SEGREDO, responsavel: 'pessoa-ficticia' }), 'utf8');
  return raiz;
}

function chamarTodas(raiz) {
  const f = criarFerramentas({ raiz });
  return {
    servicos: f.chamar('listar_servicos'),
    fontes: f.chamar('consultar_fontes', { servicoId: 'lac' }),
    assuntos: f.chamar('listar_assuntos'),
    resumo: f.chamar('resumir_base'),
  };
}

test('S5. junção do Windows na pasta da versão apontando para fora de services/ é recusada', (t) => {
  const raiz = raizComAlvos();
  const fora = path.join(raiz, 'fora-da-base');
  fs.cpSync(path.join(raiz, ...V1), fora, { recursive: true });
  fs.writeFileSync(path.join(fora, 'fontes.json'), JSON.stringify({ serviceId: 'lac', statusValidacao: 'em_validacao', fontes: [{ id: SEGREDO, titulo: SEGREDO }] }), 'utf8');
  fs.rmSync(path.join(raiz, ...V1), { recursive: true });
  try {
    fs.symlinkSync(fora, path.join(raiz, ...V1), 'junction');
  } catch {
    t.skip('NÃO TESTADO: o sistema operacional negou a criação de junção');
    return;
  }
  const r = chamarTodas(raiz);
  assert.deepEqual(r.servicos.dados.servicos, [{ id: 'lac', erro: 'versao_indisponivel' }]);
  falha(r.fontes, 'versao_indisponivel');
  assert.equal(r.resumo.isError, false);
  assert.deepEqual(r.resumo.dados.validacao, { ok: null, totalErros: null, codigos: ['validacao_indisponivel'] });
  assert.equal(r.resumo.dados.fontes.total, 0);
  semVazamento(JSON.stringify(r), raiz);
});

test('S6. junção na própria pasta services/ é recusada', (t) => {
  const raiz = raizComAlvos();
  const real = path.join(raiz, 'services-real');
  fs.renameSync(path.join(raiz, 'services'), real);
  try {
    fs.symlinkSync(real, path.join(raiz, 'services'), 'junction');
  } catch {
    t.skip('NÃO TESTADO: o sistema operacional negou a criação de junção');
    return;
  }
  const f = criarFerramentas({ raiz });
  falha(f.chamar('listar_servicos'), 'base_indisponivel');
  falha(f.chamar('consultar_fontes', { servicoId: 'lac' }), 'base_indisponivel');
});

for (const [rotulo, alvo] of [['.env fictício', ['.env']], ['data/admin-private/x.json', ['data', 'admin-private', 'x.json']]]) {
  test(`S7. link simbólico de arquivo (fontes.json -> ${rotulo}) é recusado`, (t) => {
    const raiz = raizComAlvos();
    const destino = path.join(raiz, ...V1, 'fontes.json');
    fs.rmSync(destino);
    try {
      fs.symlinkSync(path.join(raiz, ...alvo), destino, 'file');
    } catch (e) {
      t.skip(`NÃO TESTADO: o sistema operacional negou link simbólico de arquivo (${e && e.code ? e.code : 'sem código'})`);
      return;
    }
    const r = chamarTodas(raiz);
    falha(r.fontes, 'versao_indisponivel');
    assert.equal(r.servicos.isError, false);
    semVazamento(JSON.stringify(r), raiz, ['pessoa-ficticia']);
  });
}

test('S8. link simbólico de arquivo em registry.json é recusado', (t) => {
  const raiz = raizComAlvos();
  const destino = path.join(raiz, 'services', 'registry.json');
  fs.renameSync(destino, path.join(raiz, 'registry-fora.json'));
  try {
    fs.symlinkSync(path.join(raiz, 'registry-fora.json'), destino, 'file');
  } catch (e) {
    t.skip(`NÃO TESTADO: o sistema operacional negou link simbólico de arquivo (${e && e.code ? e.code : 'sem código'})`);
    return;
  }
  falha(criarFerramentas({ raiz }).chamar('listar_servicos'), 'base_indisponivel');
});

// O espião cobre todos os acessos da leitura segura (lstat, realpath e leitura), que é o único ponto do MCP que importa
// node:fs (ver S12). Não cobre o processo inteiro: o nome do teste afirma só o que o espião observa.
test('S9. manifesto, service.json e registro adulterados geram versao_indisponivel; a leitura segura espionada não toca .env nem fontes.json', () => {
  const raiz = raizComAlvos();
  const caminho = path.join(raiz, ...V1, 'versao.json');
  const manifesto = JSON.parse(fs.readFileSync(caminho, 'utf8'));
  manifesto.arquivos.fontes = '../../../.env';
  fs.writeFileSync(caminho, JSON.stringify(manifesto), 'utf8');
  const { acessos, sistema } = espiao();
  const f = criarFerramentas({ raiz, sistema });
  const r = { fontes: f.chamar('consultar_fontes', { servicoId: 'lac' }), servicos: f.chamar('listar_servicos'), resumo: f.chamar('resumir_base') };
  falha(r.fontes, 'versao_indisponivel');
  assert.deepEqual(r.servicos.dados.servicos, [{ id: 'lac', erro: 'versao_indisponivel' }]);
  assert.deepEqual(r.resumo.dados.validacao, { ok: null, totalErros: null, codigos: ['validacao_indisponivel'] });
  assert.ok(acessos.length > 0);
  assert.ok(acessos.every((a) => !a.caminho.includes('.env') && !a.caminho.endsWith('fontes.json')));
  semVazamento(JSON.stringify(r), raiz);

  // service.json com caminho adulterado também é recusado.
  const raiz2 = raizComAlvos();
  const caminhoServico = path.join(raiz2, ...V1, 'service.json');
  const servico = JSON.parse(fs.readFileSync(caminhoServico, 'utf8'));
  servico.arquivos.fontes = 'services/lac/versoes/v1/../../../../.env';
  fs.writeFileSync(caminhoServico, JSON.stringify(servico), 'utf8');
  falha(criarFerramentas({ raiz: raiz2 }).chamar('consultar_fontes', { servicoId: 'lac' }), 'versao_indisponivel');

  // Registro com versaoAtualId apontando para versão não registrada.
  const raiz3 = raizComAlvos();
  const caminhoRegistro = path.join(raiz3, 'services', 'registry.json');
  const registro = JSON.parse(fs.readFileSync(caminhoRegistro, 'utf8'));
  registro.servicos[0].versaoAtualId = '../../.env';
  fs.writeFileSync(caminhoRegistro, JSON.stringify(registro), 'utf8');
  falha(criarFerramentas({ raiz: raiz3 }).chamar('consultar_fontes', { servicoId: 'lac' }), 'versao_indisponivel');
});

test('S10. arquivo maior que 5 MB é recusado antes da leitura', () => {
  const raiz = copia();
  const caminho = path.join(raiz, ...V1, 'fontes.json');
  const texto = fs.readFileSync(caminho, 'utf8');
  fs.writeFileSync(caminho, texto + ' '.repeat(TAMANHO_MAXIMO + 1 - Buffer.byteLength(texto)), 'utf8');
  assert.ok(fs.statSync(caminho).size > TAMANHO_MAXIMO);
  const { acessos, sistema } = espiao();
  falha(criarFerramentas({ raiz, sistema }).chamar('consultar_fontes', { servicoId: 'lac' }), 'versao_indisponivel');
  assert.ok(!acessos.some((a) => a.tipo === 'leitura' && a.caminho.endsWith('fontes.json')));
});

test('S11. JSON corrompido gera base_indisponivel/versao_indisponivel sem trecho do arquivo, raiz, pilha nem mensagem interna', () => {
  const raiz = copia();
  fs.writeFileSync(path.join(raiz, 'services', 'registry.json'), `API_KEY=${SEGREDO}\n`, 'utf8');
  fs.writeFileSync(path.join(raiz, ...V1, 'fontes.json'), `API_KEY=${SEGREDO}\n`, 'utf8');
  const r = chamarTodas(raiz);
  falha(r.servicos, 'base_indisponivel');
  falha(r.fontes, 'base_indisponivel');
  falha(r.resumo, 'base_indisponivel');
  semVazamento(JSON.stringify(r), raiz, ['Unexpected', 'is not valid JSON']);

  const raiz2 = copia();
  fs.writeFileSync(path.join(raiz2, ...V1, 'fontes.json'), `API_KEY=${SEGREDO}\n`, 'utf8');
  const r2 = chamarTodas(raiz2);
  falha(r2.fontes, 'versao_indisponivel');
  assert.equal(r2.resumo.isError, false);
  assert.deepEqual(r2.resumo.dados.validacao, { ok: null, totalErros: null, codigos: ['validacao_indisponivel'] });
  semVazamento(JSON.stringify(r2), raiz2, ['Unexpected', 'is not valid JSON']);

  // Pelo protocolo, a resposta também não traz o conteúdo.
  const p = criarProcessador({ ferramentas: criarFerramentas({ raiz: raiz2 }) });
  semVazamento(p('{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"consultar_fontes","arguments":{"servicoId":"lac"}}}'), raiz2);
});

test('S12. análise estática de scripts/mcp/: sem escrita, rede, process.env/cwd/argv nem importações proibidas; processo só em iniciar.js', () => {
  const pasta = path.join(RAIZ, 'scripts', 'mcp');
  const arquivos = fs.readdirSync(pasta).sort();
  assert.deepEqual(arquivos, ['ferramentas.js', 'iniciar.js', 'leitura-segura.js', 'protocolo.js', 'servidor.js']);
  // stdin, stdout, stderr, exit e tratadores globais do processo: permitidos só no ponto de entrada.
  for (const nome of arquivos.filter((n) => n !== 'iniciar.js')) {
    const texto = fs.readFileSync(path.join(pasta, nome), 'utf8');
    assert.doesNotMatch(texto, /process\.(stdin|stdout|stderr|exit|exitCode|on|once)\b/, nome);
    assert.doesNotMatch(texto, /Symbol\.for|globalThis/, nome);
  }
  const iniciar = fs.readFileSync(path.join(pasta, 'iniciar.js'), 'utf8');
  for (const esperado of [/process\.stdin/, /process\.stdout/, /process\.on\('uncaughtException'/, /process\.on\('unhandledRejection'/, /process\.exit\(1\)/, /process\.exitCode = 0/]) {
    assert.match(iniciar, esperado);
  }
  assert.doesNotMatch(iniciar, /Symbol\.for|globalThis/);
  // A leitura segura só usa node:fs como valor padrão do módulo injetável: com o espião, todo acesso passa por ele.
  const leituraTexto = fs.readFileSync(path.join(pasta, 'leitura-segura.js'), 'utf8');
  assert.equal([...leituraTexto.matchAll(/\bfs\b/g)].length, 3, "fs só em import fs from 'node:fs' e no padrão sistema = fs");
  assert.match(leituraTexto, /sistema = fs\b/);
  assert.doesNotMatch(leituraTexto, /\bfs\./);
  const proibidos = [
    /process\.env/, /process\.cwd/, /process\.argv/, /process\.stdout\.write/, /console\.(log|info|warn|error|debug)/,
    /\bwriteFile/, /\bappendFile/, /createWriteStream/, /\bmkdir/, /\bmkdtemp/, /\b(rm|rmSync|rmdir|rmdirSync)\s*\(/, /\bunlink/, /\brename/,
    /\bcopyFile/, /\bcpSync\b|\bfs\.cp\b/, /\bsymlink/, /\bchmod/, /\btruncate/, /\bopenSync\b|\bfs\.open\b|\bpromises\.open\b/, /\bfsync/,
    /\bgravar/i, /acrescentarJsonl/,
    /['"](node:)?(http|https|http2|net|tls|dgram|dns|child_process|worker_threads|cluster|inspector)['"]/, /\bfetch\s*\(/, /WebSocket/, /XMLHttpRequest/,
    /\bspawn|\bexec(File|Sync)?\s*\(|\bfork\s*\(/,
    /armazenamento|transacao|cadastro|decisoes|admin-endpoint|saude|assistant-|check-dist|services\/admin\/versao/,
    /__admin|__assistente|admin-private|\bdata\/|\.env\b|\.claude|node_modules|['"/]dist['"/]|\.git\b|\be2e\b|['"/]tests['"/]/,
    /\beval\s*\(|new Function/,
  ];
  for (const nome of arquivos) {
    const texto = fs.readFileSync(path.join(pasta, nome), 'utf8');
    for (const p of proibidos) assert.doesNotMatch(texto, p, `${nome}: ${p}`);
    const importacoes = [...texto.matchAll(/from\s+'([^']+)'/g)].map((m) => m[1]);
    for (const i of importacoes) {
      assert.ok(
        ['node:fs', 'node:path', 'node:url', 'node:readline', 'node:stream', './protocolo.js', './ferramentas.js', './leitura-segura.js', './servidor.js',
          '../../services/versao-atual.js', '../../services/admin/fluxo.js', '../validate-services.js'].includes(i),
        `${nome}: importação não permitida ${i}`,
      );
    }
    assert.doesNotMatch(texto, /\bimport\s*\(/, `${nome}: importação dinâmica`);
  }
  // Só a camada de leitura importa node:fs.
  for (const nome of ['protocolo.js', 'ferramentas.js', 'servidor.js', 'iniciar.js']) {
    assert.doesNotMatch(fs.readFileSync(path.join(pasta, nome), 'utf8'), /node:fs/, nome);
  }
  // resumir_base não usa mais o validador que lê disco por conta própria.
  assert.doesNotMatch(fs.readFileSync(path.join(pasta, 'ferramentas.js'), 'utf8'), /validarServicos/);
  // A camada de leitura não exporta nada além de leitura.
  const exportados = [...fs.readFileSync(path.join(pasta, 'leitura-segura.js'), 'utf8').matchAll(/export\s+(?:const|function)\s+(\w+)/g)].map((m) => m[1]).sort();
  assert.deepEqual(exportados, ['ERRO_LEITURA', 'TAMANHO_MAXIMO', 'caminhoPermitido', 'criarLeituraSegura']);
  assert.deepEqual(Object.keys(criarLeituraSegura({ raiz: RAIZ })), ['lerJson']);
});

test('S13. hash SHA-256 de services/ (real e cópia) idêntico antes e depois de chamar as 4 ferramentas', () => {
  const raiz = copia();
  const antesReal = hashDaPasta(path.join(RAIZ, 'services'));
  const antesCopia = hashDaPasta(path.join(raiz, 'services'));
  assert.equal(antesReal, antesCopia);
  for (const r of [RAIZ, raiz]) {
    const f = criarFerramentas({ raiz: r });
    f.chamar('listar_assuntos');
    f.chamar('listar_assuntos', { ativo: false });
    f.chamar('listar_servicos');
    f.chamar('listar_servicos', { assuntoId: 'licenciamento-ambiental' });
    f.chamar('consultar_fontes', { servicoId: 'lac' });
    f.chamar('consultar_fontes', { servicoId: 'lac', situacaoVigencia: 'revogada' });
    f.chamar('resumir_base');
  }
  assert.equal(hashDaPasta(path.join(RAIZ, 'services')), antesReal);
  assert.equal(hashDaPasta(path.join(raiz, 'services')), antesCopia);
});

test('S14. link simbólico de arquivo SIMULADO (lstat falso): recusado sem leitura; não substitui o S7 real quando pulado', () => {
  for (const alvo of ['fontes.json', 'registry.json']) {
    const { acessos, sistema } = espiao();
    const lstatReal = sistema.lstatSync;
    sistema.lstatSync = (p) => {
      const info = lstatReal(p);
      if (!String(p).endsWith(alvo)) return info;
      return { isSymbolicLink: () => true, isFile: () => true, isDirectory: () => false, size: info.size };
    };
    const f = criarFerramentas({ raiz: RAIZ, sistema });
    const r = f.chamar('consultar_fontes', { servicoId: 'lac' });
    falha(r, alvo === 'fontes.json' ? 'versao_indisponivel' : 'base_indisponivel');
    assert.ok(!acessos.some((a) => a.tipo === 'leitura' && a.caminho.endsWith(alvo)));
  }
});

test('S15. resumir_base: toda leitura passa pela leitura segura espionada, só em arquivos esperados, e falhas diferentes dão a mesma resposta', () => {
  // Base íntegra: todos os acessos espionados ficam dentro de services/ e só em arquivos esperados pelo registro.
  const { acessos, sistema } = espiao();
  const ok = criarFerramentas({ raiz: RAIZ, sistema }).chamar('resumir_base');
  assert.equal(ok.isError, false);
  const lidos = new Set(acessos.filter((a) => a.tipo === 'leitura').map((a) => path.relative(RAIZ, a.caminho).split(path.sep).join('/')));
  assert.deepEqual([...lidos].sort(), [
    'services/assuntos.json', 'services/lac/versoes/v1/conteudo-assistente.json', 'services/lac/versoes/v1/documentos.json',
    'services/lac/versoes/v1/fontes.json', 'services/lac/versoes/v1/perguntas-frequentes.json', 'services/lac/versoes/v1/service.json',
    'services/lac/versoes/v1/versao.json', 'services/registry.json',
  ]);
  assert.ok(acessos.every((a) => !path.relative(RAIZ, a.caminho).startsWith('..')));

  // Falhas diferentes em documentos.json: ausente, grande demais, JSON inválido. A resposta inteira é idêntica.
  const preparar = (alterar) => {
    const raiz = raizComAlvos();
    alterar(path.join(raiz, ...V1, 'documentos.json'));
    return criarFerramentas({ raiz }).chamar('resumir_base');
  };
  const respostas = [
    preparar((p) => fs.rmSync(p)),
    preparar((p) => fs.writeFileSync(p, `{"documentos":[]}${' '.repeat(TAMANHO_MAXIMO + 1)}`, 'utf8')),
    preparar((p) => fs.writeFileSync(p, `API_KEY=${SEGREDO}\n`, 'utf8')),
  ];
  for (const r of respostas) {
    assert.equal(r.isError, false);
    assert.deepEqual(r.dados.validacao, { ok: null, totalErros: null, codigos: ['validacao_indisponivel'] });
    assert.deepEqual(r.dados, respostas[0].dados);
  }
  // Pasta da versão fora de services/ (junção) e manifesto apontando para fora: mesma validação indisponível.
  const fora = raizComAlvos();
  const manifesto = path.join(fora, ...V1, 'versao.json');
  const m = JSON.parse(fs.readFileSync(manifesto, 'utf8'));
  m.arquivos.documentos = '../../../.env';
  fs.writeFileSync(manifesto, JSON.stringify(m), 'utf8');
  assert.deepEqual(criarFerramentas({ raiz: fora }).chamar('resumir_base').dados.validacao, { ok: null, totalErros: null, codigos: ['validacao_indisponivel'] });
});
