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
import { analisarPr, anotacao, arquivosAlterados, executar, mensagemDaPr } from '../scripts/hooks/verificar-pr.js';
import { analisarAlteracoes, criarGit } from '../scripts/hooks/pre-commit.js';
// Namespace: se uma função nova ainda não existir (hooks não copiados), só o teste que a usa falha.
import * as regras from '../scripts/hooks/regras.js';

const { MENSAGENS, arquivoPublicoDoHash } = regras;

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
      // a base (o merge-base ou o main) lê o estado "antes"; o último commit da PR lê o estado "depois"
      const valor = (ref === BASE || ref === 'main' ? antes : depois)[caminho.join(':')];
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

  // a autorização vem do commit base (Issue #31, item 1): aqui já estava registrada antes da PR
  const autorizada = gitFalso({ arquivos: [['A', PUBLICO]],
    antes: { '.githooks/publicacoes-autorizadas.json': JSON.stringify({ publicacoes: [AUTORIZACAO] }) } });
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
  const quebrada = gitFalso({ arquivos: [['M', 'docs/a.md']], antes: { '.githooks/publicacoes-autorizadas.json': '{' } });
  assert.equal(analisarPr({ git: quebrada.git, base: 'main', alvo: 'pr' })[0].regra, 'B0');
  // um arquivo de autorização quebrado só na PR não conta: o que vale é o do base (a PR que o corrompe não passa a ser autorizada)
  const quebradaNaPr = gitFalso({ arquivos: [['A', PUBLICO]], depois: { '.githooks/publicacoes-autorizadas.json': '{' } });
  assert.deepEqual(analisarPr({ git: quebradaNaPr.git, base: 'main', alvo: 'pr' }), [{ regra: 'B1', arquivo: PUBLICO }]);
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

// ---------- Issue #31, item 1: workflows (leitura do texto) ----------

const semComentarios = (yml) => yml.split(/\r?\n/).filter((linha) => !/^\s*#/.test(linha)).join('\n');
const lerWorkflow = (nome) => semComentarios(fs.readFileSync(path.join(RAIZ, '.github', 'workflows', nome), 'utf8'));

// Cada passo (a partir de "      - ...") com as suas linhas.
function blocosDosPassos(yml) {
  const blocos = [];
  for (const linha of yml.split('\n')) {
    if (/^\s{6}- /.test(linha)) blocos.push([]);
    if (blocos.length > 0) blocos[blocos.length - 1].push(linha);
  }
  return blocos;
}

// Texto de cada "run:" (em uma linha ou em bloco "|").
function comandosRun(yml) {
  const linhas = yml.split('\n');
  const comandos = [];
  linhas.forEach((linha, i) => {
    const m = /^(\s*)(?:- )?run:\s*(.*)$/.exec(linha);
    if (!m) return;
    if (!/^[|>][+-]?$/.test(m[2])) {
      comandos.push(m[2]);
      return;
    }
    let texto = '';
    for (let j = i + 1; j < linhas.length && (linhas[j].trim() === '' || /^\s*/.exec(linhas[j])[0].length > m[1].length); j += 1) texto += `${linhas[j]}\n`;
    comandos.push(texto.trim());
  });
  return comandos;
}

test('V7. protecao-base.yml: pull_request_target, só leitura, sem segredos, sem checkout do head e sem executar código da PR', () => {
  const yml = lerWorkflow('protecao-base.yml');
  assert.match(yml, /^on:\s*\n\s+pull_request_target:\s*\n\s+types: \[opened, synchronize, reopened, ready_for_review\]\s*$/m);
  assert.doesNotMatch(yml, /^\s+pull_request:/m);
  assert.doesNotMatch(yml, /workflow_run|workflow_dispatch|push:/);
  // permissões: um único bloco, só leitura
  assert.equal((yml.match(/^\s*permissions:/gm) || []).length, 1);
  assert.match(yml, /^permissions:\n  contents: read\n(?! )/m);
  assert.match(yml, /name: Regras de proteção do commit base/);
  // sem segredos, sem instalar dependências, sem Node configurado e sem cache
  assert.doesNotMatch(yml, /secrets\./);
  assert.doesNotMatch(yml, /\bnpm\s+(ci|install|i|run|test|exec)\b|\bnpx\b|\byarn\b|\bpnpm\b/);
  assert.doesNotMatch(yml, /setup-node|actions\/cache|^\s*cache:/m);
  // única ação usada: o checkout, do commit BASE
  const acoes = yml.split('\n').filter((linha) => /^\s*(- )?uses:/.test(linha));
  assert.equal(acoes.length, 1);
  assert.match(acoes[0], /uses: actions\/checkout@v4$/);
  const checkouts = blocosDosPassos(yml).filter((bloco) => bloco.some((linha) => /uses:\s*actions\/checkout/.test(linha)));
  assert.equal(checkouts.length, 1);
  const checkout = checkouts[0];
  assert.ok(checkout.some((linha) => /^\s+ref: \$\{\{ github\.event\.pull_request\.base\.sha \}\}$/.test(linha)));
  assert.ok(checkout.some((linha) => /^\s+fetch-depth: 0$/.test(linha)));
  assert.ok(checkout.some((linha) => /^\s+persist-credentials: false$/.test(linha)));
  assert.equal(checkout.some((linha) => /^\s*(repository|token|submodules|path):/.test(linha)), false);
  for (const linha of checkout.filter((l) => /^\s*ref:/.test(l))) assert.doesNotMatch(linha, /head/);
  // nada do head da PR além do SHA em HEAD_SHA (variável de ambiente)
  assert.doesNotMatch(yml, /head_ref|pull_request\.head\.(ref|repo|label|user)|github\.event\.pull_request\.title|github\.event\.pull_request\.body/);
  for (const linha of yml.split('\n').filter((l) => /head/.test(l) && /\$\{\{/.test(l))) {
    assert.match(linha, /^\s+HEAD_SHA: \$\{\{ github\.event\.pull_request\.head\.sha \}\}$/);
  }
  // toda expressão ${{ }} é um valor do evento ligado a "ref:" do checkout ou a uma variável de ambiente
  for (const linha of yml.split('\n').filter((l) => l.includes('${{'))) {
    assert.match(linha, /^\s+(ref|NUMERO_DA_PR|BASE_SHA|HEAD_SHA): \$\{\{ github\.event\.pull_request\.(base\.sha|head\.sha|number) \}\}$/, linha);
  }
  // nenhum "run:" recebe valor do evento: só variáveis de ambiente do shell
  const comandos = comandosRun(yml);
  for (const comando of comandos) {
    assert.equal(comando.includes('${{'), false, comando);
    assert.equal(comando.includes('github.event'), false, comando);
  }
  // e os únicos comandos são: buscar o head como dado e rodar o verificador DO BASE, sem o build (--sem-build)
  assert.deepEqual(comandos, [
    'git fetch --no-tags origin "+refs/pull/${NUMERO_DA_PR}/head:refs/remotes/pr/head"',
    'node scripts/hooks/verificar-pr.js --sem-build "$BASE_SHA" "$HEAD_SHA"',
  ]);
  assert.match(yml, /^\s+NUMERO_DA_PR: \$\{\{ github\.event\.pull_request\.number \}\}$/m);
  assert.match(yml, /^\s+BASE_SHA: \$\{\{ github\.event\.pull_request\.base\.sha \}\}$/m);
});

// Bloco "run" do passo das regras em protecao-pr.yml (sem a indentação): roda o verificador do BASE com --sem-build se o base o
// reconhece; se não reconhece (a PR que o introduz), emite um aviso fixo e segue sem falhar.
const BLOCO_DAS_REGRAS = [
  "if grep -qF -- '--sem-build' base-regras/scripts/hooks/verificar-pr.js; then",
  'node base-regras/scripts/hooks/verificar-pr.js --sem-build "$BASE_SHA" "$HEAD_SHA"',
  'else',
  'echo "::warning::O verificador do commit base ainda não reconhece --sem-build: as regras B0 a B4 não rodaram nesta PR. Elas passam a valer depois do merge que traz o verificador novo."',
  'fi',
].join('\n');
/** Bloco do passo das regras como está no YAML, sem a indentação de cada linha. */
const blocoDasRegrasNoYaml = (yml) => comandosRun(yml)[0].split('\n').map((l) => l.trim()).join('\n');

test('V7b. protecao-pr.yml: as regras rodam a partir do commit BASE (segundo checkout em base-regras), sem segredos, mesmo nome de job', () => {
  const yml = lerWorkflow('protecao-pr.yml');
  assert.match(yml, /^on:\s*\n\s+pull_request:/m);
  assert.doesNotMatch(yml, /pull_request_target/);
  assert.doesNotMatch(yml, /secrets\./);
  assert.match(yml, /^permissions:\n  contents: read\n(?! )/m);
  assert.match(yml, /^    name: Regras de proteção e verificação completa$/m);
  // dois checkouts: o da PR (histórico completo, para o git diff) e o do commit BASE, só com as regras, em outra pasta
  const checkouts = blocosDosPassos(yml).filter((bloco) => bloco.some((linha) => /uses:\s*actions\/checkout/.test(linha)));
  assert.equal(checkouts.length, 2);
  const [daPr, doBase] = checkouts;
  assert.ok(daPr.some((linha) => /^\s+fetch-depth: 0$/.test(linha)));
  assert.ok(daPr.some((linha) => /^\s+persist-credentials: false$/.test(linha)));
  assert.equal(daPr.some((linha) => /^\s*(ref|path|repository|token):/.test(linha)), false);
  assert.ok(doBase.some((linha) => /^\s+ref: \$\{\{ github\.event\.pull_request\.base\.sha \}\}$/.test(linha)));
  assert.ok(doBase.some((linha) => /^\s+path: base-regras$/.test(linha)));
  assert.ok(doBase.some((linha) => /^\s+persist-credentials: false$/.test(linha)));
  assert.equal(doBase.some((linha) => /^\s*(repository|token|submodules):/.test(linha)), false);
  for (const linha of doBase.filter((l) => /^\s*ref:/.test(l))) assert.doesNotMatch(linha, /head/);
  // toda expressão ${{ }} é o SHA do base (ref do checkout ou BASE_SHA) ou o SHA do head só em HEAD_SHA (variável de ambiente)
  for (const linha of yml.split('\n').filter((l) => l.includes('${{'))) {
    assert.match(linha, /^\s+(ref|BASE_SHA|HEAD_SHA): \$\{\{ github\.event\.pull_request\.(base\.sha|head\.sha) \}\}$/, linha);
  }
  assert.doesNotMatch(yml, /head_ref|pull_request\.head\.(ref|repo|label|user)|github\.event\.pull_request\.(title|body)/);
  // nenhum "run:" recebe valor do evento
  for (const comando of comandosRun(yml)) {
    assert.equal(comando.includes('${{'), false, comando);
    assert.equal(comando.includes('github.event'), false, comando);
  }
  // o verificador é o do BASE (base-regras), sem o build, e roda ANTES de qualquer instalação ou teste (o primeiro comando);
  // nunca o scripts/hooks/verificar-pr.js da PR. Só roda se o verificador do base reconhece --sem-build; senão, avisa e segue.
  assert.deepEqual([blocoDasRegrasNoYaml(yml), ...comandosRun(yml).slice(1)], [
    BLOCO_DAS_REGRAS,
    'npm ci',
    // O build vem antes dos testes, para que os testes que conferem o dist/ também rodem no GitHub.
    'npm run build',
    'npm test',
    'npm run validate:services',
    'node scripts/check-dist.js',
  ]);
  assert.doesNotMatch(yml, /node scripts\/hooks\/verificar-pr\.js/);
  // o aviso é um texto FIXO: sem variáveis, sem caminho e sem valores do head
  const aviso = BLOCO_DAS_REGRAS.split('\n').find((l) => l.includes('::warning::'));
  assert.equal(/[$`]/.test(aviso), false, aviso);
  assert.equal(/\/|head|HEAD|arquivo/.test(aviso.replace('::warning::', '')), false, aviso);
  // o comentário explica a origem das regras e os limites (o texto original, com comentários)
  const bruto = fs.readFileSync(path.join(RAIZ, '.github', 'workflows', 'protecao-pr.yml'), 'utf8');
  assert.match(bruto, /protecao-base\.yml/);
  assert.match(bruto, /A PARTIR DO COMMIT BASE/);
  assert.match(bruto, /o workflow vem da própria PR/);
  assert.match(bruto, /AINDA executa código da PR/);
  assert.match(bruto, /TRANSITÓRIO/);
});

// Executa de verdade o bloco "run" do passo das regras (o texto lido do YAML) num diretório temporário, com um "node" de mentira
// que só registra a chamada: prova os DOIS casos (o verificador do base reconhece --sem-build, ou não) sem depender do GitHub.
// Precisa do bash (Git Bash no Windows, shell do runner no GitHub); sem ele o teste é pulado como NÃO TESTADO.
function bashUsavel() {
  const sonda = spawnSync('bash', ['-c', 'echo "$SONDA_V7C"'], { encoding: 'utf8', env: { ...process.env, SONDA_V7C: 'ok' } });
  return sonda.status === 0 && sonda.stdout.trim() === 'ok';
}
function executarPassoDasRegras({ verificadorDoBase, codigoDoNode = 0 }) {
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'sema-passo-regras-'));
  try {
    fs.mkdirSync(path.join(pasta, 'base-regras', 'scripts', 'hooks'), { recursive: true });
    if (verificadorDoBase !== null) fs.writeFileSync(path.join(pasta, 'base-regras', 'scripts', 'hooks', 'verificar-pr.js'), verificadorDoBase);
    const bloco = blocoDasRegrasNoYaml(lerWorkflow('protecao-pr.yml'));
    // nunca executa outra coisa: só o bloco exatamente igual ao esperado (o que o V7b também confere)
    assert.equal(bloco, BLOCO_DAS_REGRAS, 'o primeiro passo "run" de protecao-pr.yml não é o das regras; V7b e V7c precisam acompanhar');
    const script = `node() { echo "$*" >> chamadas.txt; return ${codigoDoNode}; }\n${bloco}\n`;
    const BASE = 'a'.repeat(40);
    const HEAD = 'b'.repeat(40);
    const r = spawnSync('bash', ['-e', '-c', script], { cwd: pasta, encoding: 'utf8', env: { ...process.env, BASE_SHA: BASE, HEAD_SHA: HEAD } });
    const chamadasArquivo = path.join(pasta, 'chamadas.txt');
    const chamadas = fs.existsSync(chamadasArquivo) ? fs.readFileSync(chamadasArquivo, 'utf8').trim().split('\n') : [];
    return { status: r.status, saida: `${r.stdout}${r.stderr}`, chamadas, BASE, HEAD };
  } finally {
    fs.rmSync(pasta, { recursive: true, force: true });
  }
}

test('V7c. protecao-pr.yml, passo das regras: roda com --sem-build se o verificador do base o reconhece; senão avisa e segue, sem falhar', (t) => {
  if (!bashUsavel()) { t.skip('NÃO TESTADO: bash indisponível (ou sem repasse de variáveis de ambiente) neste sistema'); return; }
  // caso 1: o base reconhece --sem-build -> o verificador do BASE roda com a opção e com os SHAs; o código de saída é o dele
  const reconhece = "const sem = process.argv.includes('--sem-build');\n";
  const ok = executarPassoDasRegras({ verificadorDoBase: reconhece, codigoDoNode: 0 });
  assert.equal(ok.status, 0, ok.saida);
  assert.deepEqual(ok.chamadas, [`base-regras/scripts/hooks/verificar-pr.js --sem-build ${ok.BASE} ${ok.HEAD}`]);
  assert.equal(ok.saida.includes('::warning::'), false);
  const falha = executarPassoDasRegras({ verificadorDoBase: reconhece, codigoDoNode: 1 });
  assert.equal(falha.status, 1, 'regra violada no verificador do base reprova o passo');
  assert.equal(falha.chamadas.length, 1);
  // caso 2: o base NÃO reconhece --sem-build (verificador antigo) -> não chama o verificador, avisa (texto fixo) e sai com 0
  const antigo = executarPassoDasRegras({ verificadorDoBase: "console.log('verificador antigo, sem a opção');\n" });
  assert.equal(antigo.status, 0, antigo.saida);
  assert.deepEqual(antigo.chamadas, []);
  assert.match(antigo.saida, /^::warning::O verificador do commit base ainda não reconhece --sem-build/m);
  // o aviso não repete valores do head nem caminhos de arquivo
  assert.equal(antigo.saida.includes(antigo.BASE), false);
  assert.equal(antigo.saida.includes(antigo.HEAD), false);
  assert.equal(antigo.saida.includes('base-regras'), false);
  assert.equal(antigo.saida.includes('verificar-pr.js'), false);
  // o base sem o arquivo do verificador também avisa e segue (não falha)
  const ausente = executarPassoDasRegras({ verificadorDoBase: null });
  assert.equal(ausente.status, 0, ausente.saida);
  assert.deepEqual(ausente.chamadas, []);
  assert.match(ausente.saida, /::warning::/);
});

// ---------- Issue #31, item 1: regras novas (dependem dos hooks atualizados) ----------

// Repositório Git temporário, fora do projeto, com os hooks da versão em teste.
function repositorioDeHooks() {
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'sema-verificar-pr-'));
  for (const rel of ['scripts/hooks/regras.js', 'scripts/hooks/pre-commit.js', 'scripts/hooks/verificar-pr.js']) {
    fs.mkdirSync(path.dirname(path.join(raiz, rel)), { recursive: true });
    fs.copyFileSync(path.join(RAIZ, rel), path.join(raiz, rel));
  }
  fs.writeFileSync(path.join(raiz, 'package.json'), '{ "type": "module" }\n');
  for (const args of [['init', '-q'], ['config', 'user.name', 'Teste'], ['config', 'user.email', 'teste' + '@' + 'example.org'],
    ['config', 'commit.gpgsign', 'false'], ['config', 'core.autocrlf', 'false']]) git(raiz, args);
  return raiz;
}

const ARQUIVO_AUTORIZACAO = '.githooks/publicacoes-autorizadas.json';
const TEXTO_AUTORIZACAO = `${JSON.stringify({ publicacoes: [AUTORIZACAO] }, null, 2)}\n`;

test('V8. a autorização vem do commit BASE: a PR não se autoriza; autorização já mergeada libera a PR de publicação', () => {
  const raiz = repositorioDeHooks();
  const dadosDoGithub = fs.mkdtempSync(path.join(os.tmpdir(), 'sema-verificar-pr-saida-'));
  try {
    const base = commitar(raiz, { 'docs/a.md': 'inicio\n' }, 'base');
    const gitReal = criarGit(raiz);
    // uma única PR que registra a própria autorização e publica: barrada (a autorização do base não existe)
    const prSeAutoriza = commitar(raiz, { [ARQUIVO_AUTORIZACAO]: TEXTO_AUTORIZACAO, [PUBLICO]: '{}\n' }, 'pr que se autoriza');
    assert.deepEqual(analisarPr({ git: gitReal, base, alvo: prSeAutoriza }), [{ regra: 'B1', arquivo: PUBLICO }]);
    const saida = { texto: '', write(t) { this.texto += t; } };
    assert.equal(executar({ argv: ['--sem-build', base, prSeAutoriza], raiz, saida, ambiente: {} }), 1);
    assert.match(saida.texto, /Verificação da PR reprovada \(B1\)/);
    // PR (a): só a entrada de autorização: passa
    git(raiz, ['checkout', '-q', base]);
    const prAutorizacao = commitar(raiz, { [ARQUIVO_AUTORIZACAO]: TEXTO_AUTORIZACAO }, 'pr so da autorizacao');
    assert.deepEqual(analisarPr({ git: gitReal, base, alvo: prAutorizacao }), []);
    // PR (b), depois que a (a) foi mergeada (agora ela é o base): a publicação passa
    const prPublicacao = commitar(raiz, { [PUBLICO]: '{}\n' }, 'pr de publicacao');
    assert.deepEqual(analisarPr({ git: gitReal, base: prAutorizacao, alvo: prPublicacao, executarBuild: () => true }), []);
    const saidaOk = { texto: '', write(t) { this.texto += t; } };
    assert.equal(executar({ argv: ['--sem-build', prAutorizacao, prPublicacao], raiz, saida: saidaOk, ambiente: { GITHUB_OUTPUT: path.join(dadosDoGithub, 'saida') } }), 0, saidaOk.texto);
  } finally {
    fs.rmSync(raiz, { recursive: true, force: true });
    fs.rmSync(dadosDoGithub, { recursive: true, force: true });
  }
});

test('V8b. a autorização do base vale também para registro e manifesto; a da PR não', () => {
  const registro = (publicado) => JSON.stringify({ servicos: [{ id: 'lac', publicado, statusValidacao: 'em_validacao', versaoPublicadaId: publicado ? 'lac-v1' : null }] });
  const aut = JSON.stringify({ publicacoes: [AUTORIZACAO] });
  // a PR traz a própria autorização junto com a publicação no registro: B2
  const propria = gitFalso({ arquivos: [['M', 'services/registry.json'], ['M', '.githooks/publicacoes-autorizadas.json']],
    antes: { 'services/registry.json': registro(false) }, depois: { 'services/registry.json': registro(true), '.githooks/publicacoes-autorizadas.json': aut } });
  assert.deepEqual(analisarPr({ git: propria.git, base: 'main', alvo: 'pr' }).map((a) => a.regra), ['B2']);
  // a autorização já estava no base: passa
  const doBase = gitFalso({ arquivos: [['M', 'services/registry.json']],
    antes: { 'services/registry.json': registro(false), '.githooks/publicacoes-autorizadas.json': aut }, depois: { 'services/registry.json': registro(true) } });
  assert.deepEqual(analisarPr({ git: doBase.git, base: 'main', alvo: 'pr' }), []);
  // o base é lido com "git show <base>:caminho" (a referência da PR, não o merge-base)
  assert.ok(doBase.chamadas.some((c) => c[0] === 'show' && c[1] === 'main:.githooks/publicacoes-autorizadas.json'));
  // se o base não tem o arquivo de autorizações, o comportamento é o de sempre: nenhuma publicação autorizada (sem B0)
  const semArquivo = gitFalso({ arquivos: [['A', PUBLICO]] });
  assert.deepEqual(analisarPr({ git: semArquivo.git, base: 'main', alvo: 'pr' }), [{ regra: 'B1', arquivo: PUBLICO }]);
});

const CAMINHOS_PROTEGIDOS = ['scripts/hooks/', '.githooks/', '.github/', 'package.json', '.mcp.json', '.claude/settings.json', 'scripts/check-dist.js', 'scripts/validate-services.js'];

test('V9. B6 informativa: PR que altera caminho protegido sai com 0, avisa e escreve protegidos=true; PR comum não avisa', () => {
  const raiz = repositorioDeHooks();
  const dadosDoGithub = fs.mkdtempSync(path.join(os.tmpdir(), 'sema-verificar-pr-saida-'));
  const nova = () => ({ texto: '', write(t) { this.texto += t; } });
  const build = () => true;
  try {
    const base = commitar(raiz, { 'docs/a.md': 'inicio\n' }, 'base');
    const prProtegida = commitar(raiz, { '.github/workflows/x.yml': 'name: x\n', 'docs/a.md': 'inicio\nmais\n' }, 'pr protegida');
    git(raiz, ['checkout', '-q', base]);
    const prComum = commitar(raiz, { 'docs/a.md': 'inicio\noutra\n' }, 'pr comum');
    git(raiz, ['checkout', '-q', base]);
    const prProtegidaComErro = commitar(raiz, { '.githooks/x.txt': 'a\n', [PUBLICO]: '{}\n' }, 'pr protegida com erro');

    // altera caminho protegido: exit 0, aviso com só o caminho, protegidos=true
    const saidaArquivo = path.join(dadosDoGithub, 'saida-protegida');
    const saida = nova();
    assert.equal(executar({ argv: [base, prProtegida], raiz, saida, build, ambiente: { GITHUB_OUTPUT: saidaArquivo } }), 0, saida.texto);
    assert.match(saida.texto, /^::warning::Aviso \(B6\): esta PR altera arquivos de proteção do projeto \(hooks, \.github, configurações\)\. Exige a revisão explícita da dona do repositório; a obrigatoriedade está no ruleset\.$/m);
    assert.match(saida.texto, /^ {2}-> \.github\/workflows\/x\.yml$/m);
    assert.equal(saida.texto.includes('docs/a.md'), false);
    assert.equal(saida.texto.includes('::error'), false);
    assert.match(saida.texto, /nenhuma regra violada/);
    assert.equal(fs.readFileSync(saidaArquivo, 'utf8'), 'protegidos=true\n');
    assert.equal(MENSAGENS.B6, 'Aviso (B6): esta PR altera arquivos de proteção do projeto (hooks, .github, configurações). Exige a revisão explícita da dona do repositório; a obrigatoriedade está no ruleset.');

    // sem GITHUB_OUTPUT definido: continua avisando e saindo com 0
    const semVariavel = nova();
    assert.equal(executar({ argv: [base, prProtegida], raiz, saida: semVariavel, build, ambiente: {} }), 0);
    assert.match(semVariavel.texto, /^::warning::Aviso \(B6\)/m);

    // PR comum: sem aviso e sem escrever a saída
    const arquivoComum = path.join(dadosDoGithub, 'saida-comum');
    const comum = nova();
    assert.equal(executar({ argv: [base, prComum], raiz, saida: comum, build, ambiente: { GITHUB_OUTPUT: arquivoComum } }), 0);
    assert.equal(comum.texto.includes('B6'), false);
    assert.equal(comum.texto.includes('::warning'), false);
    assert.equal(fs.existsSync(arquivoComum), false);

    // as regras B0 a B5 continuam falhando: protegida + violação = aviso e erro, exit 1
    const comErro = nova();
    assert.equal(executar({ argv: [base, prProtegidaComErro], raiz, saida: comErro, build, ambiente: {} }), 1);
    assert.match(comErro.texto, /^::warning::Aviso \(B6\)/m);
    assert.match(comErro.texto, /^::error file=services\/lac\/publico\/.*Verificação da PR reprovada \(B1\)/m);
  } finally {
    fs.rmSync(raiz, { recursive: true, force: true });
    fs.rmSync(dadosDoGithub, { recursive: true, force: true });
  }
});

test('V9b. B6 não existe no pre-commit local: analisarAlteracoes não a produz, nem para os caminhos protegidos', () => {
  const arquivos = [...CAMINHOS_PROTEGIDOS.map((c) => (c.endsWith('/') ? `${c}x.js` : c)), '.github/CODEOWNERS'].map((caminho) => ({ status: 'M', caminho }));
  const achados = analisarAlteracoes({ arquivos, lerAntes: () => null, lerDepois: () => null, diffDoArquivo: () => '', executarBuild: () => true });
  assert.deepEqual(achados, []);
  assert.equal(JSON.stringify(achados).includes('B6'), false);
});

test('V10. --sem-build: o build (que executaria código da PR) não é chamado; sem a opção, é', () => {
  const raiz = repositorioDeHooks();
  const nova = () => ({ texto: '', write(t) { this.texto += t; } });
  try {
    const base = commitar(raiz, { 'docs/a.md': 'inicio\n' }, 'base');
    const prSrc = commitar(raiz, { 'src/main.js': 'export const x = 1;\n' }, 'pr que afeta o build');
    let chamadas = 0;
    const build = (resultado) => () => { chamadas += 1; return resultado; };

    const com = nova();
    assert.equal(executar({ argv: ['--sem-build', base, prSrc], raiz, saida: com, build: build(true), ambiente: {} }), 0, com.texto);
    assert.equal(chamadas, 0);
    assert.match(com.texto, /nenhuma regra violada \(B0 a B4; o B5 é coberto pelo passo de build do protecao-pr\.yml\)/);
    // a opção em qualquer posição; um build que falharia não é executado
    assert.equal(executar({ argv: [base, prSrc, '--sem-build'], raiz, saida: nova(), build: build(false), ambiente: {} }), 0);
    assert.equal(chamadas, 0);

    const sem = nova();
    assert.equal(executar({ argv: [base, prSrc], raiz, saida: sem, build: build(true), ambiente: {} }), 0, sem.texto);
    assert.equal(chamadas, 1);
    assert.match(sem.texto, /nenhuma regra violada \(B0 a B5\)/);
    assert.equal(executar({ argv: [base, prSrc], raiz, saida: nova(), build: build(false), ambiente: {} }), 1);
    assert.equal(chamadas, 2);
    // as demais regras continuam valendo com a opção
    git(raiz, ['checkout', '-q', base]);
    const prSegredo = commitar(raiz, { 'src/a.js': `const k = '${SEGREDO}';\n` }, 'pr com segredo');
    const falha = nova();
    assert.equal(executar({ argv: ['--sem-build', base, prSegredo], raiz, saida: falha, build: build(true), ambiente: {} }), 1);
    assert.match(falha.texto, /\(B4\)/);
  } finally {
    fs.rmSync(raiz, { recursive: true, force: true });
  }
});

test('V11. ehCaminhoProtegido: os 8 caminhos protegidos (pastas e arquivos exatos); caminhos parecidos não casam', () => {
  const protegidos = ['scripts/hooks/regras.js', 'scripts/hooks/verificar-pr.js', '.githooks/pre-commit', '.githooks/publicacoes-autorizadas.json',
    '.github/workflows/protecao-base.yml', '.github/CODEOWNERS', '.github/ISSUE_TEMPLATE/tarefa.md', 'package.json', '.mcp.json', '.claude/settings.json',
    'scripts/check-dist.js', 'scripts/validate-services.js', 'scripts\\hooks\\regras.js', '.\\.github\\CODEOWNERS', './package.json'];
  for (const caminho of protegidos) assert.equal(regras.ehCaminhoProtegido(caminho), true, caminho);
  const livres = ['scripts/hooks', 'scripts/hooks-extra/x.js', 'scripts/hooksx.js', 'scripts/outro.js', 'package-lock.json', 'sub/package.json', 'docs/package.json',
    '.githooksx/a', '.githook/a', '.githubx/a', '.github-copia/a', 'docs/.github/a.md', 'src/.mcp.json', '.mcp.json.bak', '.claude/settings.local.json',
    '.claude/agents/x.md', '.claude/skills/x/SKILL.md', 'scripts/check-dist.jsx', 'scripts/validate-services.js.bak', 'scripts/validate.js',
    'services/lac/publico/x.json', 'docs/ADMINISTRACAO.md', 'tests/hook-verificar-pr.test.js', '', 'github/CODEOWNERS'];
  for (const caminho of livres) assert.equal(regras.ehCaminhoProtegido(caminho), false, caminho);
  assert.equal(regras.ehCaminhoProtegido(undefined), false);
});

test('V12. .github/CODEOWNERS lista exatamente os caminhos protegidos, todos com a dona do repositório', () => {
  const linhas = fs.readFileSync(path.join(RAIZ, '.github', 'CODEOWNERS'), 'utf8').split(/\r?\n/).filter((l) => l.trim() !== '' && !l.trim().startsWith('#'));
  const regrasDoArquivo = linhas.map((l) => l.trim().split(/\s+/));
  assert.deepEqual(regrasDoArquivo.map(([caminho]) => caminho.replace(/^\//, '')).sort(), [...CAMINHOS_PROTEGIDOS].sort());
  for (const donos of regrasDoArquivo.map((r) => r.slice(1))) assert.deepEqual(donos, ['@elisfarias-ia']);
  // a lista do CODEOWNERS e a função ehCaminhoProtegido concordam (a função só é conferida aqui quando existir)
  if (typeof regras.ehCaminhoProtegido === 'function') {
    for (const [caminho] of regrasDoArquivo) assert.equal(regras.ehCaminhoProtegido(caminho.replace(/^\//, '').replace(/\/$/, '/x')), true, caminho);
  }
});

test('V13. a autorização é lida da PONTA do base (que avançou depois que a PR saiu), não do merge-base', () => {
  const raiz = repositorioDeHooks();
  try {
    const ponto = commitar(raiz, { 'docs/a.md': 'inicio\n' }, 'ponto em que a PR saiu do main');
    const pr = commitar(raiz, { [PUBLICO]: '{}\n' }, 'pr de publicacao');
    git(raiz, ['checkout', '-q', ponto]);
    const pontaDoMain = commitar(raiz, { [ARQUIVO_AUTORIZACAO]: TEXTO_AUTORIZACAO }, 'main avancou com a autorizacao');
    const gitReal = criarGit(raiz);
    // a autorização entrou só na ponta do base: a PR passa
    assert.deepEqual(analisarPr({ git: gitReal, base: pontaDoMain, alvo: pr, executarBuild: () => true }), []);
    // contra o ponto antigo (sem a autorização), a mesma PR é barrada
    assert.deepEqual(analisarPr({ git: gitReal, base: ponto, alvo: pr }), [{ regra: 'B1', arquivo: PUBLICO }]);
  } finally {
    fs.rmSync(raiz, { recursive: true, force: true });
  }
});

// Cria, só no Git (sem arquivo no disco e sem o índice, que no Windows recusa nomes com quebra de linha), um commit filho de "pai"
// com arquivos cujo nome pode ter quebra de linha: objetos com git hash-object, árvores com git mktree -z e commit com git commit-tree.
// arquivos: { 'pasta': ['nome com\nquebra', ...] }.
function commitarSemDisco(raiz, pai, arquivos, mensagem) {
  const executar = (args, input) => {
    const r = spawnSync('git', args, { cwd: raiz, encoding: 'utf8', input });
    assert.equal(r.status, 0, `${args.join(' ')}: ${r.stderr}`);
    return r.stdout.trim();
  };
  const blob = executar(['hash-object', '-w', '--stdin'], 'x\n');
  const entradas = [];
  for (const linha of executar(['ls-tree', '-z', pai]).split('\0').filter(Boolean)) entradas.push(linha.split('\t'));
  const raizDaArvore = new Map(entradas.map(([meta, nome]) => [nome, meta]));
  for (const [pasta, nomes] of Object.entries(arquivos)) {
    const arvore = executar(['mktree', '-z'], nomes.map((nome) => `100644 blob ${blob}\t${nome}\0`).join(''));
    raizDaArvore.set(pasta, `040000 tree ${arvore}`);
  }
  const raizFinal = executar(['mktree', '-z'], [...raizDaArvore].map(([nome, meta]) => `${meta}\t${nome}\0`).join(''));
  return executar(['commit-tree', raizFinal, '-p', pai, '-m', mensagem]);
}

test('V14. nome de arquivo com quebra de linha e "::" não forja comando de workflow na saída (falha, aviso B6 e anotações)', () => {
  const raiz = repositorioDeHooks();
  const nova = () => ({ texto: '', write(t) { this.texto += t; } });
  try {
    const base = commitar(raiz, { 'docs/a.md': 'inicio\n' }, 'base');
    // abordagem: objetos do Git criados com hash-object, mktree e commit-tree (sem arquivo no disco)
    const pr = commitarSemDisco(raiz, base, { data: ['a\n::error::forjado', 'b\n::add-mask::segredo', 'c::stop-commands::x'], '.github': ['d\n::add-mask::y'] }, 'pr com nomes forjados');
    const saida = nova();
    assert.equal(executar({ argv: ['--sem-build', base, pr], raiz, saida, ambiente: {} }), 1);
    const linhas = saida.texto.split('\n');
    // nenhuma linha começa com "::" além das anotações legítimas do próprio verificador
    for (const linha of linhas.filter((l) => l.startsWith('::'))) {
      assert.match(linha, /^::(error file=[^:\n]*|warning)::(Verificação da PR reprovada \(B3\)|Aviso \(B6\))/, linha);
    }
    assert.equal(linhas.some((l) => /^\s*::/.test(l) && !/^::(error|warning)/.test(l)), false);
    assert.equal(linhas.some((l) => l.startsWith('::error::forjado') || l.includes('\r')), false);
    // o nome aparece sem a quebra de linha e sem a sequência "::"
    assert.match(saida.texto, /^ {2}-> data\/a : :error: :forjado$/m);
    assert.match(saida.texto, /^ {2}-> \.github\/d : :add-mask: :y$/m);
    assert.equal(saida.texto.includes('::add-mask::'), false);
    assert.equal(saida.texto.includes('::stop-commands::'), false);
  } finally {
    fs.rmSync(raiz, { recursive: true, force: true });
  }
});

test('V14b. sanitizarParaLog e formatarAchado: sem quebra de linha, sem % e sem "::" (o pre-commit local usa a mesma função)', () => {
  assert.equal(regras.sanitizarParaLog('a\r\nb%c'), 'a  b c');
  assert.equal(regras.sanitizarParaLog('::error::x'), ': :error: :x');
  assert.equal(regras.sanitizarParaLog(':::x'), ': : :x');
  assert.equal(regras.sanitizarParaLog('src/ok.js'), 'src/ok.js');
  const texto = regras.formatarAchado({ regra: 'B3', arquivo: 'data/a\n::add-mask::z', detalhe: 'x\n::error::y' });
  assert.equal(texto.split('\n').length, 2);
  assert.equal(texto.includes('::'), false);
  assert.equal(regras.formatarAchado({ regra: 'B4', arquivo: 'src/a.js', linha: 7, detalhe: 'CPF' }), `${MENSAGENS.B4}\n  -> src/a.js:7 (CPF)`);
});
