// Testes do hook de proteção do Claude Code (Sprint 6, Passo 6A).
// As decisões são testadas com uma raiz fictícia; a liberação é lida de cópias temporárias fora do repositório.
// Nenhum arquivo real é gravado.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  avaliarAcao,
  ehCaminhoDeDados,
  relativoAoProjeto,
  dividirComando,
  lerLiberacao,
  validarLiberacao,
  verificarFimDaResposta,
  MENSAGENS,
  PRAZO_MAXIMO_MS,
} from '../scripts/hooks/protecao-claude.js';

const RAIZ_REAL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = path.join(RAIZ_REAL, 'scripts', 'hooks', 'protecao-claude.js');
const RAIZ = path.join(os.tmpdir(), 'sema-hook-raiz-ficticia');
const AGORA = new Date('2026-11-19T12:00:00Z');

const em = (...partes) => path.join(RAIZ, ...partes);
const gravar = (arquivo, liberacao = null) => avaliarAcao({ tool_name: 'Write', tool_input: { file_path: arquivo, content: 'x' }, cwd: RAIZ }, { raiz: RAIZ, liberacao });
const editar = (arquivo) => avaliarAcao({ tool_name: 'Edit', tool_input: { file_path: arquivo }, cwd: RAIZ }, { raiz: RAIZ });
const comando = (texto, { ferramenta = 'Bash', liberacao = null, cwd = RAIZ } = {}) => avaliarAcao({ tool_name: ferramenta, tool_input: { command: texto }, cwd }, { raiz: RAIZ, liberacao });

const regra = (resultado) => (resultado.bloquear ? resultado.regra : null);

test('H1. caminhos de dados: registry, assuntos, pastas de serviço e data/; código em services/ fica livre', () => {
  const dados = ['services/registry.json', 'services/assuntos.json', 'services/lac', 'services/lac/versoes/v1/fontes.json',
    'services/lac/publico/conteudo-1234567890abcdef.json', 'services/novo-servico/service.json', 'services', 'data', 'data/admin-private/revisao/lac.jsonl'];
  for (const c of dados) assert.equal(ehCaminhoDeDados(c), true, c);
  const codigo = ['services/admin/revisao.js', 'services/admin', 'services/schemas/service.schema.json', 'services/schemas',
    'services/publicacao-publica.js', 'services/assistant-content.js', 'src/main.js', 'admin/admin.js', 'tests/x.test.js', 'datas/x', ''];
  for (const c of codigo) assert.equal(ehCaminhoDeDados(c), false, c);
  assert.equal(ehCaminhoDeDados(null), false);
});

test('H2. relativoAoProjeto: absoluto, relativo, barras invertidas, maiúsculas e fora do projeto', () => {
  const ctx = { raiz: RAIZ, cwd: RAIZ };
  assert.equal(relativoAoProjeto(em('services', 'LAC', 'x.json'), ctx), 'services/lac/x.json');
  assert.equal(relativoAoProjeto('services\\registry.json', ctx), 'services/registry.json');
  assert.equal(relativoAoProjeto('./data/', ctx), 'data');
  assert.equal(relativoAoProjeto('x.json', { raiz: RAIZ, cwd: em('services', 'lac') }), 'services/lac/x.json');
  assert.equal(relativoAoProjeto(path.join(os.tmpdir(), 'outra-pasta', 'services', 'registry.json'), ctx), null);
  assert.equal(relativoAoProjeto('../fora/services/registry.json', ctx), null);
  assert.equal(relativoAoProjeto('', ctx), null);
});

test('H3. A1: gravar ou editar dados da base é bloqueado, com a mensagem em português', () => {
  for (const alvo of [em('services', 'registry.json'), em('services', 'assuntos.json'), em('services', 'lac', 'versoes', 'v1', 'service.json'),
    em('services', 'lac', 'publico', 'conteudo-abc.json'), em('data', 'admin-private', 'x.jsonl')]) {
    const r = gravar(alvo);
    assert.equal(regra(r), 'A1', alvo);
    assert.equal(r.mensagem, MENSAGENS.A1);
    assert.match(r.mensagem, /não grava diretamente nos dados da base/);
  }
  assert.equal(regra(editar(em('services', 'lac', 'roteiro.md'))), 'A1');
  assert.equal(regra(avaliarAcao({ tool_name: 'NotebookEdit', tool_input: { notebook_path: em('data', 'x.ipynb') }, cwd: RAIZ }, { raiz: RAIZ })), 'A1');
});

test('H4. sem falso bloqueio: código em services/, demais pastas e cópias temporárias fora do projeto', () => {
  for (const alvo of [em('services', 'admin', 'revisao.js'), em('services', 'schemas', 'service.schema.json'), em('services', 'publicacao-publica.js'),
    em('src', 'main.js'), em('tests', 'novo.test.js'), em('docs', 'SPRINTS.md'),
    path.join(os.tmpdir(), 'sema-copia-123', 'services', 'registry.json'), path.join(os.tmpdir(), 'sema-copia-123', 'data', 'x.jsonl')]) {
    assert.equal(gravar(alvo).bloquear, false, alvo);
  }
  assert.equal(avaliarAcao({ tool_name: 'Read', tool_input: { file_path: em('services', 'registry.json') } }, { raiz: RAIZ }).bloquear, false);
});

test('H4b. A0: pedido que não pode ser interpretado é bloqueado por padrão', () => {
  const a0 = (entrada) => avaliarAcao(entrada, { raiz: RAIZ });
  for (const entrada of [null, undefined, 'texto', [], {}, { tool_name: '' }, { tool_name: 42 },
    { tool_name: 'Write' }, { tool_name: 'Write', tool_input: null }, { tool_name: 'Write', tool_input: [] },
    { tool_name: 'Write', tool_input: { content: 'x' } }, { tool_name: 'Edit', tool_input: { file_path: '  ' } },
    { tool_name: 'NotebookEdit', tool_input: {} }, { tool_name: 'Bash', tool_input: {} },
    { tool_name: 'Bash', tool_input: { command: '' } }, { tool_name: 'PowerShell', tool_input: { command: 42 } }]) {
    const r = a0(entrada);
    assert.equal(r.regra, 'A0', JSON.stringify(entrada));
    assert.equal(r.bloquear, true);
    assert.equal(r.mensagem, 'Bloqueado: não foi possível validar esta ação. Tente novamente ou peça liberação.');
  }
  assert.equal(a0({ tool_name: 'Glob', tool_input: {} }).bloquear, false);
  assert.equal(MENSAGENS.A0, 'Bloqueado: não foi possível validar esta ação. Tente novamente ou peça liberação.');
});

test('H5. A2: comandos que alteram dados da base (Bash e PowerShell)', () => {
  const bloqueados = [
    'rm -rf services/lac/publico',
    'rm data/admin-private/revisao/lac.jsonl',
    'mv data ../backup/data',
    'echo {} > services/registry.json',
    'cat x >> services/lac/versoes/v1/fontes.json',
    'cp /tmp/x.json services/lac/versoes/v1/fontes.json',
    "sed -i 's/a/b/' services/registry.json",
    'touch services/lac/novo.json',
    'mkdir -p data/admin-private',
    'git rm services/lac/versoes/v1/roteiro.md',
    'npm test && rm -r services/novo',
  ];
  for (const c of bloqueados) assert.equal(regra(comando(c)), 'A2', c);
  const ps = ['Remove-Item -Recurse services\\lac\\publico', 'Set-Content -Path services\\registry.json -Value x',
    'Move-Item data C:\\backup\\data', 'Copy-Item x.json -Destination services\\lac\\x.json', '"{}" | Out-File services/assuntos.json'];
  for (const c of ps) assert.equal(regra(comando(c, { ferramenta: 'PowerShell' })), 'A2', c);
  assert.match(comando('rm services/registry.json').mensagem, /use git restore/);
});

test('H6. A2 sem falso bloqueio: leitura, restauração, cópia PARA fora do projeto e código', () => {
  const livres = [
    'cat services/registry.json', 'grep -rn publicado services/', 'git diff -- services/', 'git status --short',
    'git restore services/registry.json services/lac/versoes/v1/versao.json', 'git checkout -- services/lac',
    `cp -r services ${path.join(os.tmpdir(), 'sema-copia')}`, `Copy-Item services -Destination ${path.join(os.tmpdir(), 'sema-copia')} -Recurse`,
    'rm services/admin/antigo.js', 'echo x > /dev/null', 'npm test', 'npm run validate:services', 'node --test tests/hook-claude.test.js',
    'ls services 2>&1', `rm -rf ${path.join(os.tmpdir(), 'sema-copia', 'services')}`,
  ];
  for (const c of livres) assert.equal(comando(c).bloquear, false, c);
});

test('H7. A3: push forçado sempre bloqueado; push normal livre', () => {
  for (const c of ['git push --force', 'git push -f origin main', 'git push --force-with-lease', 'git push origin +main', 'git -C . push -uf origin x', 'git push --force-if-includes']) {
    assert.equal(regra(comando(c)), 'A3', c);
  }
  for (const c of ['git push', 'git push -u origin feat/x', 'git push origin feat/x']) assert.equal(comando(c).bloquear, false, c);
  assert.equal(regra(comando('git push --force', { liberacao: { escopo: ['services/lac'] } })), 'A3');
});

test('H8. A4: git add de caminho proibido ou em massa; add de arquivos do passo livre', () => {
  for (const c of ['git add data/admin-private/x.jsonl', 'git add dist', 'git add node_modules/x', 'git add .env', 'git add .env.local',
    'git add entregas/video.webm', 'git add -f e2e-demo/x.js', 'git add --force x', 'git add .', 'git add -A', 'git add --all', 'git add docs/a.md data']) {
    assert.equal(regra(comando(c)), 'A4', c);
  }
  for (const c of ['git add docs/SPRINTS.md scripts/hooks/protecao-claude.js', 'git add -- README.md', 'git add -u', 'git add services/registry.json']) {
    assert.equal(comando(c).bloquear, false, c);
  }
});

test('H9. A5: o assistente não altera o hook, as configurações nem a liberação', () => {
  for (const alvo of [em('.claude', 'settings.json'), em('.claude', 'settings.local.json'), em('.claude', 'liberacao-protecao.json'),
    em('scripts', 'hooks', 'protecao-claude.js'), em('.githooks', 'pre-commit')]) {
    assert.equal(regra(gravar(alvo)), 'A5', alvo);
  }
  assert.equal(regra(comando('echo {} > .claude/liberacao-protecao.json')), 'A5');
  assert.equal(regra(comando('rm scripts/hooks/protecao-claude.js')), 'A5');
  assert.equal(regra(comando('git rm .claude/settings.json')), 'A5');
  assert.equal(regra(gravar(em('.claude', 'liberacao-protecao.json'), { escopo: ['services/lac'] })), 'A5');
  assert.equal(gravar(em('.claude', 'agents', 'novo.md')).bloquear, false);
});

test('H10. A7: commit sem hooks e desativação de hooks', () => {
  for (const c of ['git commit --no-verify -m "x"', 'git commit -n -m x', 'git commit -nm "x"', 'git commit -anm x',
    'git -c core.hooksPath=/dev/null commit -m x', 'git config core.hooksPath /tmp', 'git -c core.hookspath= commit -m x']) {
    assert.equal(regra(comando(c)), 'A7', c);
  }
  for (const c of ['git commit -m "usa -n no texto"', 'git commit -am "x"', 'git commit -F msg.txt', 'git commit -m x --amend']) {
    assert.equal(comando(c).bloquear, false, c);
  }
  assert.match(MENSAGENS.A7, /não pode pular nem desativar os hooks/);
});

test('H11. dividirComando: aspas, separadores e redirecionamento', () => {
  assert.deepEqual(dividirComando('git commit -m "a; b" && rm x'), [['git', 'commit', '-m', 'a; b'], ['rm', 'x']]);
  assert.deepEqual(dividirComando("echo 'x' >> y | tee z"), [['echo', 'x', '>', 'y'], ['tee', 'z']]);
  assert.deepEqual(dividirComando('a\nb'), [['a'], ['b']]);
});

test('H12. liberação: só no escopo, dentro do prazo e nunca para A3, A4, A5 e A7', () => {
  const liberacao = validarLiberacao({ escopo: ['services/lac/', 'services/registry.json'], motivo: 'Publicação autorizada pela CLABI', validoAte: '2026-11-19T13:00:00Z' }, { raiz: RAIZ, agora: AGORA });
  assert.deepEqual(liberacao, { escopo: ['services/lac', 'services/registry.json'] });
  assert.equal(gravar(em('services', 'lac', 'versoes', 'v1', 'versao.json'), liberacao).bloquear, false);
  assert.equal(gravar(em('services', 'registry.json'), liberacao).bloquear, false);
  assert.equal(comando('rm -r services/lac/publico', { liberacao }).bloquear, false);
  assert.equal(regra(gravar(em('services', 'assuntos.json'), liberacao)), 'A1');
  assert.equal(regra(gravar(em('services', 'outro', 'service.json'), liberacao)), 'A1');
  assert.equal(regra(gravar(em('data', 'x.jsonl'), liberacao)), 'A1');
  assert.equal(regra(comando('git add data/x', { liberacao })), 'A4');
  assert.equal(regra(comando('git commit -n -m x', { liberacao })), 'A7');
});

test('H13. liberação inválida é ignorada: vencida, prazo longo, sem motivo, escopo amplo ou fora dos dados', () => {
  const base = { escopo: ['services/lac/'], motivo: 'teste', validoAte: '2026-11-19T13:00:00Z' };
  const v = (dados) => validarLiberacao(dados, { raiz: RAIZ, agora: AGORA });
  assert.ok(v(base));
  assert.equal(v({ ...base, validoAte: '2026-11-19T11:59:00Z' }), null);
  assert.equal(v({ ...base, validoAte: new Date(AGORA.getTime() + PRAZO_MAXIMO_MS + 60_000).toISOString() }), null);
  assert.equal(v({ ...base, validoAte: 'amanhã' }), null);
  assert.equal(v({ ...base, motivo: ' ' }), null);
  assert.equal(v({ ...base, escopo: [] }), null);
  assert.equal(v({ ...base, escopo: ['services/'] }), null);
  assert.equal(v({ ...base, escopo: ['services/admin/'] }), null);
  assert.equal(v({ ...base, escopo: ['src/'] }), null);
  assert.equal(v({ ...base, escopo: ['../fora'] }), null);
  assert.equal(v([]), null);
  assert.equal(v(null), null);
});

test('H14. lerLiberacao: lê de uma pasta temporária; arquivo ausente ou inválido não libera nada', () => {
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'sema-hook-'));
  try {
    assert.equal(lerLiberacao({ raiz, agora: AGORA }), null);
    fs.mkdirSync(path.join(raiz, '.claude'));
    const arquivo = path.join(raiz, '.claude', 'liberacao-protecao.json');
    fs.writeFileSync(arquivo, '{ inválido');
    assert.equal(lerLiberacao({ raiz, agora: AGORA }), null);
    fs.writeFileSync(arquivo, JSON.stringify({ escopo: ['services/lac/'], motivo: 'teste', validoAte: '2026-11-19T12:30:00Z' }));
    assert.deepEqual(lerLiberacao({ raiz, agora: AGORA }), { escopo: ['services/lac'] });
  } finally {
    fs.rmSync(raiz, { recursive: true, force: true });
  }
});

test('H15. A6: avisa só quando há mudança nos dados da base ou a pasta data/ existe', () => {
  const semData = { existsSync: () => false };
  const comData = { existsSync: () => true };
  const git = (saida) => () => saida;
  assert.deepEqual(verificarFimDaResposta({ raiz: RAIZ, executarGit: git(''), sistema: semData }), { avisar: false, mensagem: '' });
  assert.equal(verificarFimDaResposta({ raiz: RAIZ, executarGit: git(' M services/admin/revisao.js\n'), sistema: semData }).avisar, false);
  assert.equal(verificarFimDaResposta({ raiz: RAIZ, executarGit: git(' M services/registry.json\n'), sistema: semData }).avisar, true);
  assert.equal(verificarFimDaResposta({ raiz: RAIZ, executarGit: git('?? services/lac/publico/conteudo-abc.json\n'), sistema: semData }).avisar, true);
  const aviso = verificarFimDaResposta({ raiz: RAIZ, executarGit: git(''), sistema: comData });
  assert.equal(aviso.avisar, true);
  assert.match(aviso.mensagem, /regra 11 do CLAUDE\.md/);
  assert.equal(verificarFimDaResposta({ raiz: RAIZ, executarGit: () => { throw new Error('sem git'); }, sistema: semData }).avisar, false);
});

function executarScript(entrada, args = []) {
  return spawnSync(process.execPath, [SCRIPT, ...args], { input: entrada, encoding: 'utf8' });
}

test('H16. processo real: bloqueia com código 2 e mensagem no stderr; ação comum sai com 0; pedido ilegível é bloqueado', () => {
  const bloqueio = executarScript(JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'git push --force' }, cwd: RAIZ_REAL }));
  assert.equal(bloqueio.status, 2);
  assert.match(bloqueio.stderr, /Bloqueado \(A3\)/);
  const dados = executarScript(JSON.stringify({ tool_name: 'Write', tool_input: { file_path: path.join(RAIZ_REAL, 'data', 'x.jsonl'), content: '' }, cwd: RAIZ_REAL }));
  assert.equal(dados.status, 2);
  assert.match(dados.stderr, /Bloqueado \(A1\)/);
  const livre = executarScript(JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'npm test' }, cwd: RAIZ_REAL }));
  assert.equal(livre.status, 0);
  assert.equal(livre.stderr, '');
  for (const entrada of ['não é JSON', '', '{"tool_name":"Bash","tool_input":{}}']) {
    const ilegivel = executarScript(entrada);
    assert.equal(ilegivel.status, 2, entrada);
    assert.match(ilegivel.stderr, /Bloqueado: não foi possível validar esta ação\. Tente novamente ou peça liberação\./);
  }
});
