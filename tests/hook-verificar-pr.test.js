// Testes da verificação de proteção da PR no GitHub (Sprint 6, Passo 6D).
// A diferença da PR e as regras são testadas com um Git falso e em repositórios Git temporários fora do projeto.
// Segredos falsos são montados por concatenação, para que este arquivo não contenha nenhum.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { analisarPr, anotacao, arquivosAlterados, mensagemDaPr } from '../scripts/hooks/verificar-pr.js';
import { analisarAlteracoes, criarGit } from '../scripts/hooks/pre-commit.js';
import { MENSAGENS, arquivoPublicoDoHash } from '../scripts/hooks/regras.js';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HASH = 'b2c3d4e5f6071829'.padEnd(64, '7');
const PUBLICO = `services/lac/publico/${arquivoPublicoDoHash(HASH)}`;
const AUTORIZACAO = { servicoId: 'lac', versaoId: 'lac-v1', hashConteudo: HASH, arquivoPublico: arquivoPublicoDoHash(HASH), referencia: 'Issue #999 (fictícia)', data: '2026-11-20' };
const BASE = 'a'.repeat(40);
const SEGREDO = 'AIza' + 'C'.repeat(35);

// Git falso: merge-base, lista de arquivos, conteúdo antes/depois e diff por arquivo.
function gitFalso({ arquivos = [], depois = {}, antes = {}, diffs = {}, falharMergeBase = false }) {
  const chamadas = [];
  const git = (args, { permitirFalha = false } = {}) => {
    chamadas.push(args);
    const [cmd, ...resto] = args;
    if (cmd === 'merge-base') {
      if (falharMergeBase) throw new Error('sem base comum');
      return `${BASE}\n`;
    }
    if (cmd === 'diff' && resto.includes('--name-status')) return arquivos.map(([s, c]) => `${s}\0${c}\0`).join('');
    if (cmd === 'diff') return diffs[resto[resto.length - 1]] || '';
    if (cmd === 'show') {
      const [ref, ...caminho] = resto[0].split(':');
      const valor = (ref === BASE ? antes : depois)[caminho.join(':')];
      if (valor === undefined) {
        if (permitirFalha) return null;
        throw new Error('não existe');
      }
      return valor;
    }
    throw new Error(`comando inesperado: ${args.join(' ')}`);
  };
  return { git, chamadas };
}

test('V1. arquivos alterados: lista sem renomeações, com a base calculada pelo merge-base', () => {
  const { git, chamadas } = gitFalso({ arquivos: [['M', 'docs/a.md'], ['A', PUBLICO], ['D', 'docs/velho.md']] });
  assert.deepEqual(arquivosAlterados(git, BASE, 'pr'), [
    { status: 'M', caminho: 'docs/a.md' }, { status: 'A', caminho: PUBLICO }, { status: 'D', caminho: 'docs/velho.md' },
  ]);
  assert.deepEqual(chamadas[0], ['diff', '--name-status', '--no-renames', '-z', BASE, 'pr']);
});

test('V2. analisarPr aplica as mesmas regras do pre-commit às alterações da PR', () => {
  const docs = gitFalso({ arquivos: [['M', 'docs/a.md']], diffs: { 'docs/a.md': '@@ -1 +1 @@\n+texto' } });
  assert.deepEqual(analisarPr({ git: docs.git, base: 'main', alvo: 'pr' }), []);
  assert.deepEqual(docs.chamadas[0], ['merge-base', 'main', 'pr']);

  const publico = gitFalso({ arquivos: [['A', PUBLICO]] });
  assert.deepEqual(analisarPr({ git: publico.git, base: 'main', alvo: 'pr' }), [{ regra: 'B1', arquivo: PUBLICO }]);

  const autorizada = gitFalso({ arquivos: [['A', PUBLICO], ['M', '.githooks/publicacoes-autorizadas.json']],
    depois: { '.githooks/publicacoes-autorizadas.json': JSON.stringify({ publicacoes: [AUTORIZACAO] }) } });
  assert.deepEqual(analisarPr({ git: autorizada.git, base: 'main', alvo: 'pr', executarBuild: () => true }), []);

  const registro = (publicado) => JSON.stringify({ servicos: [{ id: 'lac', publicado, statusValidacao: 'em_validacao', versaoPublicadaId: null }] });
  const publicacao = gitFalso({ arquivos: [['M', 'services/registry.json']], antes: { 'services/registry.json': registro(false) }, depois: { 'services/registry.json': registro(true) } });
  assert.equal(analisarPr({ git: publicacao.git, base: 'main', alvo: 'pr' })[0].regra, 'B2');

  const dados = gitFalso({ arquivos: [['A', 'data/admin-private/x.jsonl'], ['D', 'dist/index.html']] });
  assert.deepEqual(analisarPr({ git: dados.git, base: 'main', alvo: 'pr' }), [{ regra: 'B3', arquivo: 'data/admin-private/x.jsonl' }]);

  const segredo = gitFalso({ arquivos: [['M', 'src/a.js']], diffs: { 'src/a.js': `@@ -1,0 +7 @@\n+const k = '${SEGREDO}';` } });
  assert.deepEqual(analisarPr({ git: segredo.git, base: 'main', alvo: 'pr' }), [{ regra: 'B4', arquivo: 'src/a.js', linha: 7, detalhe: 'chave de API do Google' }]);
});

test('V3. B5 roda o build só quando a PR afeta o build; o que não pode ser lido bloqueia (B0)', () => {
  let builds = 0;
  const build = (ok) => () => { builds += 1; return ok; };
  const src = gitFalso({ arquivos: [['M', 'src/main.js']], diffs: { 'src/main.js': '@@ -1 +1 @@\n+const x = 1;' } });
  assert.equal(analisarPr({ git: src.git, base: 'main', alvo: 'pr', executarBuild: build(false) })[0].regra, 'B5');
  builds = 0;
  const docs = gitFalso({ arquivos: [['M', 'docs/a.md']] });
  assert.deepEqual(analisarPr({ git: docs.git, base: 'main', alvo: 'pr', executarBuild: build(false) }), []);
  assert.equal(builds, 0);
  for (const [base, alvo] of [['', 'pr'], ['main', ''], ['--upload-pack=x', 'pr'], ['main', '-n'], ['main', 'a b'], [undefined, 'pr']]) {
    assert.equal(analisarPr({ git: docs.git, base, alvo })[0].regra, 'B0', `${base} ${alvo}`);
  }
  assert.equal(analisarPr({ git: gitFalso({ falharMergeBase: true }).git, base: 'main', alvo: 'pr' })[0].regra, 'B0');
  const quebrada = gitFalso({ arquivos: [['M', 'docs/a.md']], depois: { '.githooks/publicacoes-autorizadas.json': '{' } });
  assert.equal(analisarPr({ git: quebrada.git, base: 'main', alvo: 'pr' })[0].regra, 'B0');
});

test('V4. analisarAlteracoes é a mesma lógica para o pre-commit e para a PR', () => {
  const achados = analisarAlteracoes({
    arquivos: [{ status: 'A', caminho: PUBLICO }, { status: 'M', caminho: 'docs/a.md' }],
    lerAntes: () => null,
    lerDepois: () => null,
    diffDoArquivo: () => '',
  });
  assert.deepEqual(achados, [{ regra: 'B1', arquivo: PUBLICO }]);
});

test('V5. anotação do GitHub: arquivo e linha, sem o valor encontrado e sem quebra de linha injetada', () => {
  const texto = anotacao({ regra: 'B4', arquivo: 'src/a.js', linha: 7, detalhe: 'chave de API do Google' });
  assert.match(texto, /^::error file=src\/a\.js,line=7::Verificação da PR reprovada \(B4\): possível segredo ou dado pessoal\./);
  assert.equal(texto.includes('AIza'), false);
  assert.equal(texto.includes('Commit bloqueado'), false);
  assert.equal(anotacao({ regra: 'B1', arquivo: 'x\n::error::falso', detalhe: 'a\nb' }).includes('\n'), false);
  assert.match(anotacao({ regra: 'B0', arquivo: '(diferença da PR)' }), /^::error::Verificação da PR reprovada: não foi possível validar/);
});

test('V5b. prefixo da PR: troca só "Commit bloqueado" no início de cada linha; o pre-commit não muda', () => {
  assert.equal(mensagemDaPr(MENSAGENS.B1), MENSAGENS.B1.replace('Commit bloqueado', 'Verificação da PR reprovada'));
  assert.equal(mensagemDaPr('Commit bloqueado (B3): x\n  -> a\nCommit bloqueado (B4): y'), 'Verificação da PR reprovada (B3): x\n  -> a\nVerificação da PR reprovada (B4): y');
  assert.equal(mensagemDaPr('texto sem prefixo; Commit bloqueado no meio'), 'texto sem prefixo; Commit bloqueado no meio');
  for (const regra of ['B0', 'B1', 'B2', 'B3', 'B4', 'B5']) assert.match(MENSAGENS[regra], /^Commit bloqueado/, regra);
});

// ---------- repositório Git temporário ----------

function git(cwd, args) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' });
  assert.equal(r.status, 0, `${args.join(' ')}: ${r.stderr}`);
  return r.stdout.trim();
}

function commitar(raiz, arquivos, mensagem) {
  for (const [rel, conteudo] of Object.entries(arquivos)) {
    fs.mkdirSync(path.dirname(path.join(raiz, rel)), { recursive: true });
    fs.writeFileSync(path.join(raiz, rel), conteudo);
    git(raiz, ['add', '--', rel]);
  }
  git(raiz, ['commit', '-q', '-m', mensagem]);
  return git(raiz, ['rev-parse', 'HEAD']);
}

test('V6. repositório real: PR com conteúdo público é barrada; PR comum passa; o script sai com 1 e anota o arquivo', () => {
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'sema-verificar-pr-'));
  try {
    for (const rel of ['scripts/hooks/regras.js', 'scripts/hooks/pre-commit.js', 'scripts/hooks/verificar-pr.js']) {
      fs.mkdirSync(path.dirname(path.join(raiz, rel)), { recursive: true });
      fs.copyFileSync(path.join(RAIZ, rel), path.join(raiz, rel));
    }
    fs.writeFileSync(path.join(raiz, 'package.json'), '{ "type": "module" }\n');
    for (const args of [['init', '-q'], ['config', 'user.name', 'Teste'], ['config', 'user.email', 'teste' + '@' + 'example.org'],
      ['config', 'commit.gpgsign', 'false'], ['config', 'core.autocrlf', 'false']]) git(raiz, args);
    const base = commitar(raiz, { 'docs/a.md': 'inicio\n', 'package.json': '{ "type": "module" }\n' }, 'base');
    const prComum = commitar(raiz, { 'docs/a.md': 'inicio\nmais\n' }, 'pr comum');
    git(raiz, ['checkout', '-q', base]);
    const prPublico = commitar(raiz, { [PUBLICO]: '{}\n' }, 'pr com publico');

    const gitReal = criarGit(raiz);
    assert.deepEqual(analisarPr({ git: gitReal, base, alvo: prComum }), []);
    assert.deepEqual(analisarPr({ git: gitReal, base, alvo: prPublico }), [{ regra: 'B1', arquivo: PUBLICO }]);
    // a base do main pode ter avançado: só conta o que a PR mudou desde o ponto em que saiu do main
    assert.deepEqual(analisarPr({ git: gitReal, base: prComum, alvo: prPublico }), [{ regra: 'B1', arquivo: PUBLICO }]);

    const script = path.join(raiz, 'scripts', 'hooks', 'verificar-pr.js');
    const barrada = spawnSync(process.execPath, [script, base, prPublico], { cwd: raiz, encoding: 'utf8' });
    assert.equal(barrada.status, 1);
    assert.match(barrada.stdout, new RegExp(`::error file=${PUBLICO.replace(/[.]/g, '\\.')}::Verificação da PR reprovada \\(B1\\)`));
    assert.match(barrada.stdout, /^Verificação da PR reprovada \(B1\): conteúdo público/m);
    assert.equal(barrada.stdout.includes('Commit bloqueado'), false);
    assert.match(barrada.stdout, /Verificação de proteção da PR falhou/);
    const liberada = spawnSync(process.execPath, [script, base, prComum], { cwd: raiz, encoding: 'utf8' });
    assert.equal(liberada.status, 0, liberada.stdout);
    assert.match(liberada.stdout, /nenhuma regra violada/);
  } finally {
    fs.rmSync(raiz, { recursive: true, force: true });
  }
});

test('V7. workflow: dispara em pull_request, só leitura, histórico completo, regras e verificação completa', () => {
  const yml = fs.readFileSync(path.join(RAIZ, '.github', 'workflows', 'protecao-pr.yml'), 'utf8');
  assert.match(yml, /^on:\s*\n\s+pull_request:/m);
  assert.doesNotMatch(yml, /pull_request_target/);
  assert.match(yml, /permissions:\s*\n\s+contents: read/);
  assert.match(yml, /fetch-depth: 0/);
  assert.match(yml, /persist-credentials: false/);
  assert.doesNotMatch(yml, /secrets\./);
  const ordem = ['npm ci', 'node scripts/hooks/verificar-pr.js "$BASE_SHA" "$HEAD_SHA"', 'npm test', 'npm run validate:services', 'npm run build', 'node scripts/check-dist.js'];
  let posicao = -1;
  for (const passo of ordem) {
    const atual = yml.indexOf(`run: ${passo}`);
    assert.ok(atual > posicao, passo);
    posicao = atual;
  }
  assert.match(yml, /BASE_SHA: \$\{\{ github\.event\.pull_request\.base\.sha \}\}/);
  assert.match(yml, /HEAD_SHA: \$\{\{ github\.event\.pull_request\.head\.sha \}\}/);
});
