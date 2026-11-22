// Sprint 7, Passo 7D: a revogação no pre-commit e na verificação da PR (regras B1R e B2R).
// As regras são testadas com dados em memória; o hook de verdade e a verificação da PR rodam em repositórios Git temporários
// fora do projeto, com dados fictícios.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  MENSAGENS, arquivoPublicoDoHash, caminhoDoManifesto, verificarManifesto, verificarRegistroContraRevogadas, verificarRemocaoPublica, verificarRevogacaoDoManifesto,
} from '../scripts/hooks/regras.js';
import { analisarAlteracoes, criarGit } from '../scripts/hooks/pre-commit.js';
import { analisarPr } from '../scripts/hooks/verificar-pr.js';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HASH = 'c3d4e5f607182930'.padEnd(64, '5');
const PUBLICO = `services/lac/publico/${arquivoPublicoDoHash(HASH)}`;
const MANIFESTO = 'services/lac/versoes/v1/versao.json';
const AUTORIZACAO = { servicoId: 'lac', versaoId: 'lac-v1', hashConteudo: HASH, arquivoPublico: arquivoPublicoDoHash(HASH), referencia: 'Issue #999 (fictícia)', data: '2026-11-20' };

const publicado = { id: 'lac-v1', servicoId: 'lac', estado: 'publicado', hashConteudo: HASH, publicadoEm: '2026-11-20' };
const revogado = { ...publicado, estado: 'revogado', revogadoEm: '2026-11-21' };
const registro = (servico) => JSON.stringify({ servicos: [{ id: 'lac', publicado: true, statusValidacao: 'validado', versaoAtualId: 'lac-v1', versaoPublicadaId: 'lac-v1', ...servico }], versaoEstrutura: 1 });
const registroSemPublicacao = registro({ publicado: false, statusValidacao: 'em_validacao', versaoPublicadaId: null });
const J = (o) => JSON.stringify(o);

test('RV1. coerência da revogação num manifesto', () => {
  assert.equal(verificarRevogacaoDoManifesto(publicado, revogado), null);
  assert.equal(verificarRevogacaoDoManifesto(revogado, revogado), null);
  assert.equal(verificarRevogacaoDoManifesto(publicado, publicado), null);
  assert.equal(verificarRevogacaoDoManifesto(revogado, publicado), 'versão revogada não volta a ser usada');
  assert.equal(verificarRevogacaoDoManifesto(revogado, { ...publicado, estado: 'autorizado_publicacao' }), 'versão revogada não volta a ser usada');
  assert.equal(verificarRevogacaoDoManifesto({ ...publicado, estado: 'autorizado_publicacao' }, revogado), 'só se revoga versão publicada');
  assert.equal(verificarRevogacaoDoManifesto(null, revogado), 'só se revoga versão publicada');
  const semRevogadoEm = { ...revogado };
  delete semRevogadoEm.revogadoEm;
  assert.equal(verificarRevogacaoDoManifesto(publicado, semRevogadoEm), 'versão revogada sem revogadoEm válido');
  assert.equal(verificarRevogacaoDoManifesto(publicado, { ...revogado, revogadoEm: '21/11/2026' }), 'versão revogada sem revogadoEm válido');
  assert.equal(verificarRevogacaoDoManifesto(publicado, { ...revogado, publicadoEm: null }), 'versão revogada sem publicadoEm válido');
  assert.equal(verificarRevogacaoDoManifesto(publicado, { ...revogado, revogadoEm: '2026-11-19' }), 'revogadoEm anterior a publicadoEm');
  assert.equal(verificarRevogacaoDoManifesto(publicado, { ...publicado, revogadoEm: '2026-11-21' }), 'revogadoEm fora de versão revogada');
});

test('RV2. B2 no manifesto: revogação coerente passa SEM autorização; incoerente e volta a publicado barradas mesmo COM autorização', () => {
  assert.equal(verificarManifesto(MANIFESTO, J(publicado), J(revogado), []), null);
  assert.deepEqual(verificarManifesto(MANIFESTO, J(publicado), J({ ...revogado, revogadoEm: '2026-11-19' }), []), { regra: 'B2R', arquivo: MANIFESTO, detalhe: 'revogadoEm anterior a publicadoEm' });
  // revogado -> publicado é sempre barrado, mesmo com a autorização da mesma versão e do mesmo hash
  assert.deepEqual(verificarManifesto(MANIFESTO, J(revogado), J(publicado), [AUTORIZACAO]), { regra: 'B2R', arquivo: MANIFESTO, detalhe: 'versão revogada não volta a ser usada' });
  // as regras de publicação continuam: publicar sem autorização é B2
  assert.equal(verificarManifesto(MANIFESTO, J({ ...publicado, estado: 'autorizado_publicacao', publicadoEm: undefined }), J(publicado), [])?.regra, 'B2');
  assert.match(MENSAGENS.B2R, /^Commit bloqueado \(B2\): revogação incoerente/);
  assert.match(MENSAGENS.B1R, /^Commit bloqueado \(B1\): conteúdo público só pode ser removido/);
});

test('RV3. registro: não pode apontar para versão revogada', () => {
  assert.equal(caminhoDoManifesto('lac', 'lac-v1'), MANIFESTO);
  assert.equal(caminhoDoManifesto('lac', 'outro-v1'), null);
  assert.equal(caminhoDoManifesto('lac', null), null);
  const ler = (estado) => (c) => (c === MANIFESTO ? J(estado) : null);
  assert.deepEqual(verificarRegistroContraRevogadas(registro({}), ler(publicado)), []);
  assert.deepEqual(verificarRegistroContraRevogadas(registro({}), ler(revogado)), [{ regra: 'B2R', arquivo: 'services/registry.json', detalhe: 'serviço lac aponta para versão revogada' }]);
  assert.deepEqual(verificarRegistroContraRevogadas(registroSemPublicacao, ler(revogado)), []);
  assert.equal(verificarRegistroContraRevogadas('{ inválido', ler(revogado))[0].regra, 'B0');
  assert.equal(verificarRegistroContraRevogadas(registro({}), () => '{ inválido')[0].regra, 'B0');
  assert.deepEqual(verificarRegistroContraRevogadas(null, ler(revogado)), []);
});

test('RV4. remoção de arquivo público: só com a versão correspondente revogada', () => {
  assert.equal(verificarRemocaoPublica(PUBLICO, [J(revogado)]), null);
  assert.deepEqual(verificarRemocaoPublica(PUBLICO, [J(publicado)]), { regra: 'B1R', arquivo: PUBLICO });
  assert.deepEqual(verificarRemocaoPublica(PUBLICO, [J({ ...revogado, hashConteudo: 'f'.repeat(64) })]), { regra: 'B1R', arquivo: PUBLICO });
  assert.deepEqual(verificarRemocaoPublica(PUBLICO, []), { regra: 'B1R', arquivo: PUBLICO });
  assert.deepEqual(verificarRemocaoPublica('services/lac/publico/outro.json', [J(revogado)]), { regra: 'B1R', arquivo: 'services/lac/publico/outro.json' });
  assert.equal(verificarRemocaoPublica('docs/a.md', []), null);
});

// Substituição (Sprint 7): a versão publicada anterior vira "substituido" quando outra é publicada (regra B2S, junto da B2R).
test('RV10. B2S no registro: nenhum serviço pode apontar para versão substituída, como acontece com a revogada (B2R)', () => {
  const substituido = { ...publicado, estado: 'substituido', substituidoEm: '2026-11-21' };
  const ler = (c) => (c === MANIFESTO ? J(substituido) : null);
  assert.deepEqual(verificarRegistroContraRevogadas(registro({}), ler), [{ regra: 'B2S', arquivo: 'services/registry.json', detalhe: 'serviço lac aponta para versão substituída' }]);
  // a versão atual substituída também é recusada, mesmo sem versaoPublicadaId
  assert.deepEqual(verificarRegistroContraRevogadas(registroSemPublicacao, ler), [{ regra: 'B2S', arquivo: 'services/registry.json', detalhe: 'serviço lac aponta para versão substituída' }]);
  assert.match(MENSAGENS.B2S, /^Commit bloqueado \(B2\): substituição incoerente/);
});

test('RV11. B2S no manifesto: publicado -> substituido passa SEM autorização, com substituidoEm válido; substituido -> publicado é barrado mesmo COM autorização', () => {
  const substituido = { ...publicado, estado: 'substituido', substituidoEm: '2026-11-21' };
  assert.equal(verificarManifesto(MANIFESTO, J(publicado), J(substituido), []), null);
  assert.deepEqual(verificarManifesto(MANIFESTO, J(substituido), J(publicado), [AUTORIZACAO]), { regra: 'B2S', arquivo: MANIFESTO, detalhe: 'versão substituída não volta a ser usada' });
  assert.deepEqual(verificarManifesto(MANIFESTO, J(publicado), J({ ...substituido, substituidoEm: '2026-11-19' }), []), { regra: 'B2S', arquivo: MANIFESTO, detalhe: 'substituidoEm anterior a publicadoEm' });
  assert.deepEqual(verificarManifesto(MANIFESTO, J(publicado), J({ ...substituido, substituidoEm: undefined }), []), { regra: 'B2S', arquivo: MANIFESTO, detalhe: 'versão substituída sem substituidoEm válido' });
  assert.deepEqual(verificarManifesto(MANIFESTO, J({ ...publicado, estado: 'validado_materialmente' }), J(substituido), []), { regra: 'B2S', arquivo: MANIFESTO, detalhe: 'só se substitui versão publicada' });
  assert.deepEqual(verificarManifesto(MANIFESTO, J(publicado), J({ ...substituido, substituidaPor: 'lac-v1' }), []), { regra: 'B2S', arquivo: MANIFESTO, detalhe: 'substituidaPor deve ser o id de outra versão' });
  assert.equal(verificarManifesto(MANIFESTO, J(publicado), J({ ...substituido, substituidaPor: 'lac-v2' }), []), null);
});

test('RV12. B2S: a publicação nova passa, a substituída não volta e a remoção do público da substituída segue barrada (B1R)', () => {
  assert.match(MENSAGENS.B2S, /^Commit bloqueado \(B2\): substituição incoerente/);
  const substituido = { ...publicado, estado: 'substituido', substituidoEm: '2026-11-21' };
  assert.deepEqual(verificarRemocaoPublica(PUBLICO, [J(substituido)]), { regra: 'B1R', arquivo: PUBLICO });
  const novaPublicada = { ...publicado, id: 'lac-v2', hashConteudo: 'e'.repeat(64), publicadoEm: '2026-11-21' };
  const ler = (c) => (c === 'services/lac/versoes/v2/versao.json' ? J(novaPublicada) : c === MANIFESTO ? J(substituido) : null);
  assert.deepEqual(verificarRegistroContraRevogadas(registro({ versaoAtualId: 'lac-v2', versaoPublicadaId: 'lac-v2' }), ler), []);
});

/** Conjunto de alterações falso, para analisarAlteracoes. */
function alteracoes({ arquivos, depois = {}, antes = {}, listar }) {
  return {
    arquivos: arquivos.map(([status, caminho]) => ({ status, caminho })),
    lerAntes: (c) => antes[c] ?? null,
    lerDepois: (c) => depois[c] ?? null,
    diffDoArquivo: () => '',
    ...(listar ? { listarDepois: listar } : {}),
  };
}

test('RV5. analisarAlteracoes: revogação completa passa; registro ainda apontando ou remoção indevida são barrados', () => {
  const listar = (prefixo) => (prefixo === 'services/lac/versoes/' ? [MANIFESTO] : []);
  const revogacao = alteracoes({
    arquivos: [['M', MANIFESTO], ['M', 'services/registry.json']],
    antes: { [MANIFESTO]: J(publicado), 'services/registry.json': registro({}) },
    depois: { [MANIFESTO]: J(revogado), 'services/registry.json': registroSemPublicacao },
    listar,
  });
  assert.deepEqual(analisarAlteracoes(revogacao), []);
  const soManifesto = alteracoes({
    arquivos: [['M', MANIFESTO]],
    antes: { [MANIFESTO]: J(publicado) },
    depois: { [MANIFESTO]: J(revogado), 'services/registry.json': registro({}) },
    listar,
  });
  assert.deepEqual(analisarAlteracoes(soManifesto), [{ regra: 'B2R', arquivo: 'services/registry.json', detalhe: 'serviço lac aponta para versão revogada' }]);
  const removeRevogado = alteracoes({ arquivos: [['D', PUBLICO]], depois: { [MANIFESTO]: J(revogado) }, listar });
  assert.deepEqual(analisarAlteracoes(removeRevogado), []);
  const removePublicado = alteracoes({ arquivos: [['D', PUBLICO]], depois: { [MANIFESTO]: J(publicado) }, listar });
  assert.deepEqual(analisarAlteracoes(removePublicado), [{ regra: 'B1R', arquivo: PUBLICO }]);
  // sem como listar os manifestos, a remoção é recusada; se a listagem falhar, B0
  assert.deepEqual(analisarAlteracoes(alteracoes({ arquivos: [['D', PUBLICO]], depois: { [MANIFESTO]: J(revogado) } })), [{ regra: 'B1R', arquivo: PUBLICO }]);
  assert.equal(analisarAlteracoes(alteracoes({ arquivos: [['D', PUBLICO]], listar: () => { throw new Error('falha'); } }))[0].regra, 'B0');
  // remoção de outros arquivos continua livre
  assert.deepEqual(analisarAlteracoes(alteracoes({ arquivos: [['D', 'docs/velho.md']], listar })), []);
});

// ---------- repositório Git temporário, com o hook e a verificação da PR de verdade ----------

function git(cwd, args) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' });
  return { status: r.status, saida: `${r.stdout}${r.stderr}`, texto: r.stdout.trim() };
}
const gravar = (raiz, rel, conteudo) => {
  fs.mkdirSync(path.dirname(path.join(raiz, rel)), { recursive: true });
  fs.writeFileSync(path.join(raiz, rel), conteudo);
};

/** Repositório com a LAC fictícia publicada (manifesto, registro, arquivo público e autorização) e o hook ativo. */
function comRepositorioPublicado(fn) {
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'sema-hook-revogacao-'));
  try {
    for (const rel of ['scripts/hooks/regras.js', 'scripts/hooks/pre-commit.js', 'scripts/hooks/verificar-pr.js', '.githooks/pre-commit']) {
      fs.mkdirSync(path.dirname(path.join(raiz, rel)), { recursive: true });
      fs.copyFileSync(path.join(RAIZ, rel), path.join(raiz, rel));
    }
    fs.chmodSync(path.join(raiz, '.githooks', 'pre-commit'), 0o755);
    gravar(raiz, 'package.json', '{ "type": "module", "scripts": { "build": "node scripts/check-dist.js" } }\n');
    gravar(raiz, 'scripts/check-dist.js', 'process.exit(0);\n');
    gravar(raiz, '.githooks/publicacoes-autorizadas.json', `${JSON.stringify({ publicacoes: [AUTORIZACAO] }, null, 2)}\n`);
    gravar(raiz, MANIFESTO, J(publicado));
    gravar(raiz, 'services/registry.json', registro({}));
    gravar(raiz, PUBLICO, '{}\n');
    for (const args of [['init', '-q'], ['config', 'user.name', 'Teste'], ['config', 'user.email', 'teste' + '@' + 'example.org'],
      ['config', 'commit.gpgsign', 'false'], ['config', 'core.autocrlf', 'false'], ['add', '-A'], ['commit', '-q', '-m', 'base publicada'],
      ['config', 'core.hooksPath', '.githooks']]) {
      const r = git(raiz, args);
      assert.equal(r.status, 0, `${args.join(' ')}: ${r.saida}`);
    }
    fn(raiz);
  } finally {
    fs.rmSync(raiz, { recursive: true, force: true });
  }
}

/** Aplica as mudanças, prepara e tenta o commit. `remover`: caminhos a apagar. */
function tentar(raiz, { gravacoes = {}, remover = [] }) {
  for (const [rel, conteudo] of Object.entries(gravacoes)) {
    gravar(raiz, rel, conteudo);
    git(raiz, ['add', '--', rel]);
  }
  for (const rel of remover) git(raiz, ['rm', '-q', '--', rel]);
  const antes = git(raiz, ['rev-parse', 'HEAD']).texto;
  const r = git(raiz, ['commit', '-q', '-m', 'teste']);
  const depois = git(raiz, ['rev-parse', 'HEAD']).texto;
  if (antes === depois) git(raiz, ['reset', '-q', '--hard', 'HEAD']);
  return { commitou: antes !== depois, saida: r.saida };
}

test('RV6. hook real: revogação coerente passa sem autorização; registro apontando para a revogada é barrado', () => {
  comRepositorioPublicado((raiz) => {
    const incoerente = tentar(raiz, { gravacoes: { [MANIFESTO]: J(revogado) } });
    assert.equal(incoerente.commitou, false);
    assert.match(incoerente.saida, /Commit bloqueado \(B2\): revogação incoerente/);
    assert.match(incoerente.saida, /serviço lac aponta para versão revogada/);
    const coerente = tentar(raiz, { gravacoes: { [MANIFESTO]: J(revogado), 'services/registry.json': registroSemPublicacao } });
    assert.equal(coerente.commitou, true, coerente.saida);
  });
});

test('RV7. hook real: sem revogadoEm é barrado; revogada não volta a publicada, mesmo com autorização registrada', () => {
  comRepositorioPublicado((raiz) => {
    const semData = { ...revogado };
    delete semData.revogadoEm;
    const r1 = tentar(raiz, { gravacoes: { [MANIFESTO]: J(semData), 'services/registry.json': registroSemPublicacao } });
    assert.equal(r1.commitou, false);
    assert.match(r1.saida, /versão revogada sem revogadoEm válido/);
    assert.equal(tentar(raiz, { gravacoes: { [MANIFESTO]: J(revogado), 'services/registry.json': registroSemPublicacao } }).commitou, true);
    const volta = tentar(raiz, { gravacoes: { [MANIFESTO]: J(publicado), 'services/registry.json': registro({}) } });
    assert.equal(volta.commitou, false);
    assert.match(volta.saida, /versão revogada não volta a ser usada/);
  });
});

test('RV8. hook real: remover arquivo público de versão publicada é barrado; de versão revogada é aceito', () => {
  comRepositorioPublicado((raiz) => {
    const indevida = tentar(raiz, { remover: [PUBLICO] });
    assert.equal(indevida.commitou, false);
    assert.match(indevida.saida, /Commit bloqueado \(B1\): conteúdo público só pode ser removido/);
    assert.equal(fs.existsSync(path.join(raiz, PUBLICO)), true);
    assert.equal(tentar(raiz, { gravacoes: { [MANIFESTO]: J(revogado), 'services/registry.json': registroSemPublicacao } }).commitou, true);
    const devida = tentar(raiz, { remover: [PUBLICO] });
    assert.equal(devida.commitou, true, devida.saida);
  });
});

test('RV9. verificação da PR usa as mesmas regras: revogação coerente passa; remoção indevida é barrada', () => {
  comRepositorioPublicado((raiz) => {
    git(raiz, ['config', '--unset', 'core.hooksPath']);
    const base = git(raiz, ['rev-parse', 'HEAD']).texto;
    tentar(raiz, { gravacoes: { [MANIFESTO]: J(revogado), 'services/registry.json': registroSemPublicacao } });
    const revogacao = git(raiz, ['rev-parse', 'HEAD']).texto;
    git(raiz, ['checkout', '-q', base]);
    tentar(raiz, { remover: [PUBLICO] });
    const remocao = git(raiz, ['rev-parse', 'HEAD']).texto;
    const g = criarGit(raiz);
    assert.notEqual(revogacao, base);
    assert.notEqual(remocao, base);
    assert.deepEqual(analisarPr({ git: g, base, alvo: revogacao }), []);
    assert.deepEqual(analisarPr({ git: g, base, alvo: remocao }), [{ regra: 'B1R', arquivo: PUBLICO }]);
  });
});
