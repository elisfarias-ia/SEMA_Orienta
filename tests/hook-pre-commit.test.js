// Testes do pre-commit do Git (Sprint 6, Passo 6B).
// As regras são testadas com dados em memória; o hook de verdade roda em repositórios Git temporários fora do projeto.
// Segredos e contatos falsos são montados por concatenação, para que este arquivo não contenha nenhum.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  DOMINIOS_EMAIL_PERMITIDOS,
  MENSAGENS,
  afetaBuild,
  arquivoPublicoDoHash,
  ehArquivoProibido,
  linhasAdicionadas,
  procurarDadoSensivel,
  validarAutorizacoes,
  verificarLinhas,
  verificarManifesto,
  verificarPublico,
  verificarRegistro,
} from '../scripts/hooks/regras.js';
import { analisarCommit } from '../scripts/hooks/pre-commit.js';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HASH = 'a1b2c3d4e5f60718'.padEnd(64, '9');
const PUBLICO = `services/lac/publico/${arquivoPublicoDoHash(HASH)}`;
const AUTORIZACAO = { servicoId: 'lac', versaoId: 'lac-v1', hashConteudo: HASH, arquivoPublico: arquivoPublicoDoHash(HASH), referencia: 'Issue #999 (fictícia)', data: '2026-11-20' };
const registro = (servico) => JSON.stringify({ servicos: [{ id: 'lac', publicado: false, statusValidacao: 'em_validacao', versaoAtualId: 'lac-v1', versaoPublicadaId: null, ...servico }], versaoEstrutura: 1 });
const manifesto = (campos) => JSON.stringify({ id: 'lac-v1', servicoId: 'lac', estado: 'rascunho', hashConteudo: null, ...campos });
const SEGREDO_GOOGLE = 'AIza' + 'B'.repeat(35);
const SEGREDO_ATRIBUIDO = 'senha' + ': "' + 'x'.repeat(14) + '"';
// Contatos fictícios também montados por partes: o teste C1 proíbe e-mail e telefone escritos nos arquivos de teste.
const ARROBA = '@';
const EMAIL_EXTERNO = `fulano${ARROBA}gmail.com`;
const CPF_FALSO = ['123', '456', '789'].join('.') + '-09';
const TELEFONE_COM_DDD = '(65) 9' + '9999-1234';
const CELULAR_SEM_DDD = '9876' + '5-4321';

test('P1. B3: arquivos que nunca podem ser versionados', () => {
  for (const c of ['data/admin-private/x.jsonl', 'dist/index.html', 'node_modules/x/y.js', 'test-results/a.txt', 'playwright-report/index.html',
    '.env', '.env.local', 'config/.env.producao', 'entregas/video.webm', 'videos/A.WEBM', '.claude/settings.local.json', '.claude/launch.json', '.claude/liberacao-protecao.json']) {
    assert.equal(ehArquivoProibido(c), true, c);
  }
  for (const c of ['docs/data.md', 'services/registry.json', '.claude/settings.json', '.claude/agents/x.md', 'src/env.js', 'datas/x', 'tests/dist.test.js']) {
    assert.equal(ehArquivoProibido(c), false, c);
  }
});

test('P2. arquivo de autorizações: vazio, válido e inválido', () => {
  assert.deepEqual(validarAutorizacoes(null), { ok: true, publicacoes: [] });
  assert.deepEqual(validarAutorizacoes('{ "publicacoes": [] }'), { ok: true, publicacoes: [] });
  assert.equal(validarAutorizacoes(JSON.stringify({ publicacoes: [AUTORIZACAO] })).ok, true);
  const invalidos = ['{', '[]', '{}', JSON.stringify({ publicacoes: [{}] }),
    JSON.stringify({ publicacoes: [{ ...AUTORIZACAO, hashConteudo: 'abc' }] }),
    JSON.stringify({ publicacoes: [{ ...AUTORIZACAO, arquivoPublico: 'conteudo-0000000000000000.json' }] }),
    JSON.stringify({ publicacoes: [{ ...AUTORIZACAO, data: '20/11/2026' }] }),
    JSON.stringify({ publicacoes: [{ ...AUTORIZACAO, referencia: ' ' }] }),
    JSON.stringify({ publicacoes: [{ ...AUTORIZACAO, nome: 'Fulano' }] })];
  for (const t of invalidos) assert.equal(validarAutorizacoes(t).ok, false, t);
});

test('P3. B1: arquivo público só com autorização para o mesmo serviço e o mesmo arquivo', () => {
  assert.deepEqual(verificarPublico(PUBLICO, []), { regra: 'B1', arquivo: PUBLICO });
  assert.equal(verificarPublico(PUBLICO, [AUTORIZACAO]), null);
  assert.equal(verificarPublico('services/lac/publico/conteudo-ffffffffffffffff.json', [AUTORIZACAO])?.regra, 'B1');
  assert.equal(verificarPublico(`services/outro/publico/${arquivoPublicoDoHash(HASH)}`, [AUTORIZACAO])?.regra, 'B1');
  assert.equal(verificarPublico('services/lac/versoes/v1/fontes.json', []), null);
  assert.equal(verificarPublico('services/admin/publicacao.js', []), null);
});

test('P4. B2 no registro: publicação ou validação só com autorização; demais mudanças livres', () => {
  const antes = registro({});
  assert.deepEqual(verificarRegistro(antes, registro({ versaoAtualId: 'lac-v2' }), []), []);
  assert.equal(verificarRegistro(antes, registro({ publicado: true }), [])[0].regra, 'B2');
  assert.equal(verificarRegistro(antes, registro({ statusValidacao: 'validado' }), [])[0].regra, 'B2');
  assert.equal(verificarRegistro(antes, registro({ versaoPublicadaId: 'lac-v1' }), [])[0].regra, 'B2');
  assert.deepEqual(verificarRegistro(antes, registro({ publicado: true, statusValidacao: 'validado', versaoPublicadaId: 'lac-v1' }), [AUTORIZACAO]), []);
  assert.equal(verificarRegistro(antes, registro({ publicado: true, versaoPublicadaId: 'lac-v2' }), [AUTORIZACAO])[0].regra, 'B2');
  // estado já publicado antes não é mudança
  const publicado = registro({ publicado: true, statusValidacao: 'validado', versaoPublicadaId: 'lac-v1' });
  assert.deepEqual(verificarRegistro(publicado, registro({ publicado: true, statusValidacao: 'validado', versaoPublicadaId: 'lac-v1', versaoAtualId: 'lac-v2' }), []), []);
  // registro novo (sem versão anterior) com publicação também precisa de autorização
  assert.equal(verificarRegistro(null, registro({ publicado: true }), [])[0].regra, 'B2');
  assert.equal(verificarRegistro(antes, '{ inválido', [])[0].regra, 'B0');
  assert.equal(verificarRegistro(antes, '{}', [])[0].regra, 'B0');
});

test('P5. B2 no manifesto: estados protegidos e publicadoEm só com autorização do mesmo hash', () => {
  const caminho = 'services/lac/versoes/v1/versao.json';
  const antes = manifesto({});
  assert.equal(verificarManifesto(caminho, antes, manifesto({ estado: 'em_validacao', hashConteudo: HASH }), []), null);
  for (const estado of ['validado_materialmente', 'autorizado_publicacao', 'publicado']) {
    assert.equal(verificarManifesto(caminho, antes, manifesto({ estado, hashConteudo: HASH }), [])?.regra, 'B2', estado);
    assert.equal(verificarManifesto(caminho, antes, manifesto({ estado, hashConteudo: HASH }), [AUTORIZACAO]), null, estado);
  }
  assert.equal(verificarManifesto(caminho, antes, manifesto({ estado: 'publicado', hashConteudo: 'f'.repeat(64) }), [AUTORIZACAO])?.regra, 'B2');
  assert.equal(verificarManifesto(caminho, antes, manifesto({ publicadoEm: '2026-11-20' }), [])?.regra, 'B2');
  assert.equal(verificarManifesto('services/lac/versoes/v1/service.json', antes, '{ inválido', []), null);
  assert.equal(verificarManifesto(caminho, antes, '{ inválido', [])?.regra, 'B0');
});

test('P6. B4: segredos em qualquer arquivo; e-mail, CPF e telefone fora dos testes; sem falso alarme comum', () => {
  assert.equal(procurarDadoSensivel(`const chave = '${SEGREDO_GOOGLE}';`, 'src/a.js'), 'chave de API do Google');
  assert.equal(procurarDadoSensivel(`const chave = '${SEGREDO_GOOGLE}';`, 'tests/a.test.js'), 'chave de API do Google');
  assert.equal(procurarDadoSensivel('sk-' + 'ant-' + 'Q'.repeat(24), 'docs/a.md'), 'chave de API');
  assert.equal(procurarDadoSensivel('ghp_' + 'Z'.repeat(36), 'docs/a.md'), 'token do GitHub');
  assert.equal(procurarDadoSensivel('-----BEGIN ' + 'RSA PRIVATE KEY-----', 'docs/a.md'), 'chave privada');
  assert.equal(procurarDadoSensivel(SEGREDO_ATRIBUIDO, 'src/config.js'), 'credencial atribuída');
  assert.equal(procurarDadoSensivel(`Contato: ${EMAIL_EXTERNO}`, 'docs/a.md'), 'e-mail fora dos domínios permitidos');
  assert.equal(procurarDadoSensivel(`CPF ${CPF_FALSO}`, 'docs/a.md'), 'CPF');
  assert.equal(procurarDadoSensivel(`Ligue ${TELEFONE_COM_DDD}`, 'docs/a.md'), 'telefone');
  assert.equal(procurarDadoSensivel(`Celular ${CELULAR_SEM_DDD}`, 'docs/a.md'), 'telefone');
  for (const dominio of DOMINIOS_EMAIL_PERMITIDOS) assert.equal(procurarDadoSensivel(`maria.silva${ARROBA}${dominio}`, 'docs/a.md'), null, dominio);
  assert.equal(procurarDadoSensivel(`Contato: ${EMAIL_EXTERNO} ${TELEFONE_COM_DDD}`, 'tests/x.test.js'), null);
  assert.equal(procurarDadoSensivel(`Contato: ${EMAIL_EXTERNO}`, 'e2e-real/x.spec.js'), null);
  for (const livre of ['Decretos de 2020-2022 e 2023-2024', 'versão 1.2.3-45', 'hash 0123456789abcdef', 'const token = lerToken();',
    "headers: { 'X-Admin-Token': token }", 'A senha deve ser trocada', 'data 2026-11-20', 'sema.mt.gov.br.exemplo.com sem arroba']) {
    assert.equal(procurarDadoSensivel(livre, 'src/a.js'), null, livre);
  }
  assert.equal(procurarDadoSensivel(`fulano${ARROBA}sema.mt.gov.br.exemplo.com`, 'docs/a.md'), 'e-mail fora dos domínios permitidos');
  assert.ok(DOMINIOS_EMAIL_PERMITIDOS.includes('orgaoexemplo.gov.br'));
  assert.ok(DOMINIOS_EMAIL_PERMITIDOS.includes('sema.mt.gov.br'));
});

test('P7. linhas adicionadas com o número no arquivo novo; mensagem B4 sem o valor', () => {
  const diff = ['diff --git a/x b/x', '--- a/x', '+++ b/x', '@@ -1,0 +3,2 @@', `+${SEGREDO_GOOGLE}`, '+ok', '@@ -9 +10 @@', '-antigo', '+novo\r'].join('\n');
  assert.deepEqual(linhasAdicionadas(diff), [{ numero: 3, texto: SEGREDO_GOOGLE }, { numero: 4, texto: 'ok' }, { numero: 10, texto: 'novo' }]);
  const achados = verificarLinhas('docs/a.md', linhasAdicionadas(diff));
  assert.deepEqual(achados, [{ regra: 'B4', arquivo: 'docs/a.md', linha: 3, detalhe: 'chave de API do Google' }]);
  assert.doesNotMatch(MENSAGENS.B4, /AIza/);
});

test('P8. B5: arquivos que afetam o build', () => {
  for (const c of ['src/main.js', 'admin/admin.js', 'index.html', 'vite.config.js', 'package.json', 'scripts/check-dist.js',
    'services/publicacao-publica.js', 'services/conteudo-publico-build.js', PUBLICO]) {
    assert.equal(afetaBuild(c), true, c);
  }
  for (const c of ['docs/a.md', 'tests/a.test.js', 'services/admin/revisao.js', 'services/lac/versoes/v1/fontes.json', 'scripts/hooks/regras.js']) {
    assert.equal(afetaBuild(c), false, c);
  }
});

// Git falso: devolve respostas fixas por comando.
function gitFalso({ arquivos, conteudo = {}, head = {}, diffs = {} }) {
  return (args, { permitirFalha = false } = {}) => {
    const [cmd, ...resto] = args;
    if (cmd === 'diff' && resto.includes('--name-status')) return arquivos.map(([s, c]) => `${s}\0${c}\0`).join('');
    if (cmd === 'rev-parse') return 'abc\n';
    if (cmd === 'show') {
      const alvo = resto[0];
      const valor = alvo.startsWith('HEAD:') ? head[alvo.slice(5)] : conteudo[alvo.slice(1)];
      if (valor === undefined) {
        if (permitirFalha) return null;
        throw new Error('não existe');
      }
      return valor;
    }
    if (cmd === 'diff') return diffs[resto[resto.length - 1]] || '';
    // Sprint 7, Passo 7D: arquivos na área de preparação (só os caminhos de `conteudo` sob o prefixo pedido).
    if (cmd === 'ls-files') return Object.keys(conteudo).filter((c) => c.startsWith(resto[resto.length - 1])).map((c) => `${c}\0`).join('');
    throw new Error(`comando inesperado: ${args.join(' ')}`);
  };
}

test('P9. analisarCommit: B5 só quando o commit afeta o build e o resto passou; autorizações inválidas bloqueiam (B0)', () => {
  let chamadas = 0;
  const build = (resultado) => () => { chamadas += 1; return resultado; };
  const src = gitFalso({ arquivos: [['M', 'src/main.js']], diffs: { 'src/main.js': '@@ -1 +1 @@\n+const x = 1;' } });
  assert.deepEqual(analisarCommit({ git: src, executarBuild: build(true) }), []);
  assert.equal(analisarCommit({ git: src, executarBuild: build(false) })[0].regra, 'B5');
  const docs = gitFalso({ arquivos: [['M', 'docs/a.md']], diffs: { 'docs/a.md': '@@ -1 +1 @@\n+texto' } });
  chamadas = 0;
  assert.deepEqual(analisarCommit({ git: docs, executarBuild: build(false) }), []);
  assert.equal(chamadas, 0);
  const autorizacaoQuebrada = gitFalso({ arquivos: [['M', 'docs/a.md']], conteudo: { '.githooks/publicacoes-autorizadas.json': '{' } });
  assert.equal(analisarCommit({ git: autorizacaoQuebrada })[0].regra, 'B0');
  // Remoções em geral continuam livres; a de arquivo público só com a versão revogada (Sprint 7, Passo 7D, regra B1R).
  assert.deepEqual(analisarCommit({ git: gitFalso({ arquivos: [['D', 'data/x.jsonl'], ['D', 'docs/velho.md']] }) }), []);
  assert.deepEqual(analisarCommit({ git: gitFalso({ arquivos: [['D', PUBLICO]] }) }), [{ regra: 'B1R', arquivo: PUBLICO }]);
  const revogada = JSON.stringify({ id: 'lac-v1', estado: 'revogado', hashConteudo: HASH, publicadoEm: '2026-11-20', revogadoEm: '2026-11-21' });
  assert.deepEqual(analisarCommit({ git: gitFalso({ arquivos: [['D', PUBLICO]], conteudo: { 'services/lac/versoes/v1/versao.json': revogada } }) }), []);
  const falha = () => { throw new Error('git indisponível'); };
  assert.equal(analisarCommit({ git: falha })[0].regra, 'B0');
});

// ---------- repositório Git temporário, com o hook de verdade ----------

function git(cwd, args) {
  return spawnSync('git', args, { cwd, encoding: 'utf8' });
}

function criarRepositorio() {
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'sema-precommit-'));
  const copiar = (rel) => {
    fs.mkdirSync(path.dirname(path.join(raiz, rel)), { recursive: true });
    fs.copyFileSync(path.join(RAIZ, rel), path.join(raiz, rel));
  };
  for (const rel of ['scripts/hooks/regras.js', 'scripts/hooks/pre-commit.js', '.githooks/pre-commit', '.githooks/publicacoes-autorizadas.json']) copiar(rel);
  fs.chmodSync(path.join(raiz, '.githooks', 'pre-commit'), 0o755);
  // Build e check-dist falsos (sempre passam): a regra B5 roda de verdade, mas sem o Vite.
  fs.writeFileSync(path.join(raiz, 'package.json'), `${JSON.stringify({ type: 'module', scripts: { build: 'node scripts/check-dist.js' } })}\n`);
  fs.writeFileSync(path.join(raiz, 'scripts', 'check-dist.js'), 'process.exit(0);\n');
  fs.mkdirSync(path.join(raiz, 'services', 'lac', 'versoes', 'v1'), { recursive: true });
  fs.writeFileSync(path.join(raiz, 'services', 'registry.json'), registro({}));
  fs.writeFileSync(path.join(raiz, 'services', 'lac', 'versoes', 'v1', 'versao.json'), manifesto({}));
  fs.mkdirSync(path.join(raiz, 'docs'));
  fs.writeFileSync(path.join(raiz, 'docs', 'a.md'), 'inicio\n');
  for (const args of [['init', '-q'], ['config', 'user.name', 'Teste'], ['config', 'user.email', `teste${ARROBA}example.org`], ['config', 'commit.gpgsign', 'false'],
    ['config', 'core.autocrlf', 'false'], ['add', '-A'], ['commit', '-q', '-m', 'base'], ['config', 'core.hooksPath', '.githooks']]) {
    const r = git(raiz, args);
    assert.equal(r.status, 0, `${args.join(' ')}: ${r.stderr}`);
  }
  return raiz;
}

function tentarCommit(raiz, arquivos) {
  for (const [rel, conteudo] of Object.entries(arquivos)) {
    fs.mkdirSync(path.dirname(path.join(raiz, rel)), { recursive: true });
    fs.writeFileSync(path.join(raiz, rel), conteudo);
    assert.equal(git(raiz, ['add', '--', rel]).status, 0);
  }
  const antes = git(raiz, ['rev-parse', 'HEAD']).stdout.trim();
  const r = git(raiz, ['commit', '-q', '-m', 'teste']);
  const depois = git(raiz, ['rev-parse', 'HEAD']).stdout.trim();
  return { status: r.status, saida: `${r.stdout}${r.stderr}`, commitou: antes !== depois };
}

function comRepositorio(fn) {
  const raiz = criarRepositorio();
  try {
    fn(raiz);
  } finally {
    fs.rmSync(raiz, { recursive: true, force: true });
  }
}

test('P10. hook real: commit comum passa; conteúdo público sem autorização é barrado e nada é commitado', () => {
  comRepositorio((raiz) => {
    const comum = tentarCommit(raiz, { 'docs/a.md': 'inicio\nnova linha\n' });
    assert.equal(comum.status, 0, comum.saida);
    assert.equal(comum.commitou, true);
    const publico = tentarCommit(raiz, { [PUBLICO]: '{}\n' });
    assert.notEqual(publico.status, 0);
    assert.equal(publico.commitou, false);
    assert.match(publico.saida, /Commit bloqueado \(B1\)/);
    assert.match(publico.saida, /services\/lac\/publico\/conteudo-a1b2c3d4e5f60718\.json/);
  });
});

test('P11. hook real: publicação no registro barrada (B2); com autorização registrada no mesmo commit, passa', () => {
  comRepositorio((raiz) => {
    const semAutorizacao = tentarCommit(raiz, { 'services/registry.json': registro({ publicado: true, statusValidacao: 'validado', versaoPublicadaId: 'lac-v1' }) });
    assert.equal(semAutorizacao.commitou, false);
    assert.match(semAutorizacao.saida, /Commit bloqueado \(B2\)/);
    const comAutorizacao = tentarCommit(raiz, {
      '.githooks/publicacoes-autorizadas.json': `${JSON.stringify({ publicacoes: [AUTORIZACAO] }, null, 2)}\n`,
      [PUBLICO]: '{}\n',
      'services/lac/versoes/v1/versao.json': manifesto({ estado: 'publicado', hashConteudo: HASH, publicadoEm: '2026-11-20' }),
    });
    assert.equal(comAutorizacao.status, 0, comAutorizacao.saida);
    assert.equal(comAutorizacao.commitou, true);
  });
});

test('P12. hook real: data/ (B3) e segredo (B4) barrados, sem repetir o segredo na mensagem', () => {
  comRepositorio((raiz) => {
    const dados = tentarCommit(raiz, { 'data/admin-private/x.jsonl': '{}\n' });
    assert.equal(dados.commitou, false);
    assert.match(dados.saida, /Commit bloqueado \(B3\)/);
    git(raiz, ['reset', '-q']);
    fs.rmSync(path.join(raiz, 'data'), { recursive: true, force: true });
    const segredo = tentarCommit(raiz, { 'docs/b.md': `linha\nchave ${SEGREDO_GOOGLE}\n` });
    assert.equal(segredo.commitou, false);
    assert.match(segredo.saida, /Commit bloqueado \(B4\)/);
    assert.match(segredo.saida, /docs\/b\.md:2/);
    assert.equal(segredo.saida.includes(SEGREDO_GOOGLE), false);
  });
});

test('P13. o script de instalação e o hook estão configurados no projeto', () => {
  const pacote = JSON.parse(fs.readFileSync(path.join(RAIZ, 'package.json'), 'utf8'));
  assert.equal(pacote.scripts['hooks:instalar'], 'git config core.hooksPath .githooks');
  const hook = fs.readFileSync(path.join(RAIZ, '.githooks', 'pre-commit'), 'utf8');
  assert.ok(hook.startsWith('#!/bin/sh\n'));
  assert.equal(hook.includes('\r'), false);
  assert.match(hook, /scripts\/hooks\/pre-commit\.js/);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(RAIZ, '.githooks', 'publicacoes-autorizadas.json'), 'utf8')), { publicacoes: [] });
});
