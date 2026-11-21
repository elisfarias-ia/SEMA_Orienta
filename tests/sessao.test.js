// Sessão do login simulado (Sprint 8, Passo 8B): módulo puro services/admin/sessao.js, sem HTTP.
// Usuários fictícios (atores.js); nada é gravado em disco.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { criarGerenciadorSessao } from '../services/admin/sessao.js';
import { USUARIOS_SELECIONAVEIS } from '../services/admin/atores.js';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CODIGO = fs.readFileSync(path.join(RAIZ, 'services', 'admin', 'sessao.js'), 'utf8');
const [MARIA, CARLOS] = USUARIOS_SELECIONAVEIS;
const exibicao = (u) => ({ usuarioId: u.usuarioId, nome: u.nome, perfil: u.perfil, setor: u.setor });

/** Gerador previsível: cada chamada devolve um token diferente, de 64 hex. */
function geradorSequencial() {
  let n = 0;
  return () => { n += 1; return n.toString(16).padStart(64, '0'); };
}

test('SE1. gerenciador novo começa sem sessão (como num reinício): atual() sem usuário, com a lista dos selecionáveis; nenhum token vale', () => {
  const g = criarGerenciadorSessao({ gerarToken: geradorSequencial() });
  const a = g.atual();
  assert.deepEqual(Object.keys(a), ['usuario', 'usuarios']);
  assert.equal(a.usuario, null);
  assert.deepEqual(a.usuarios, USUARIOS_SELECIONAVEIS.map(exibicao));
  assert.equal(g.token(), null);
  assert.equal(g.tokenValido('0'.repeat(63) + '1'), false);
  assert.equal(g.tokenValido(undefined), false);
});

test('SE2. entrar com Maria e com Carlos: token de 64 hex e usuário com nome, perfil e setor', () => {
  const g = criarGerenciadorSessao();
  const m = g.entrar(MARIA.usuarioId);
  assert.equal(m.ok, true);
  assert.match(m.token, /^[0-9a-f]{64}$/);
  assert.deepEqual(m.usuario, exibicao(MARIA));
  assert.deepEqual(g.atual().usuario, exibicao(MARIA));
  assert.equal(g.tokenValido(m.token), true);
  const c = g.entrar(CARLOS.usuarioId);
  assert.equal(c.ok, true);
  assert.deepEqual(c.usuario, { usuarioId: 'carlos-silva', nome: 'Carlos Silva', perfil: 'revisor', setor: 'CLABI' });
  assert.deepEqual(g.atual().usuario, exibicao(CARLOS));
});

test('SE3. trocar de usuário gera token novo e invalida o anterior; entrar de novo com o mesmo usuário também troca o token', () => {
  const g = criarGerenciadorSessao({ gerarToken: geradorSequencial() });
  const t1 = g.entrar('maria-silva').token;
  const t2 = g.entrar('carlos-silva').token;
  assert.notEqual(t1, t2);
  assert.equal(g.tokenValido(t1), false);
  assert.equal(g.tokenValido(t2), true);
  const t3 = g.entrar('carlos-silva').token;
  assert.notEqual(t3, t2);
  assert.equal(g.tokenValido(t2), false);
  assert.equal(g.tokenValido(t3), true);
  assert.equal(g.token(), t3);
});

test('SE4. recusas (desconhecido, demonstração, número, vazio, não texto) não mudam a sessão e não repetem o valor recebido', () => {
  const g = criarGerenciadorSessao({ gerarToken: geradorSequencial() });
  const t = g.entrar('maria-silva').token;
  for (const ruim of ['usuario-ficticio-x', 'servidor-demonstracao', 42, '', ' maria-silva', 'MARIA-SILVA', null, undefined, {}, ['maria-silva'], '__proto__']) {
    const r = g.entrar(ruim);
    assert.deepEqual(r, { ok: false, erro: 'usuario_invalido' }, String(ruim));
    assert.equal(g.token(), t);
    assert.equal(g.tokenValido(t), true);
    assert.deepEqual(g.atual().usuario, exibicao(MARIA));
  }
  // Sem sessão, a recusa também não cria nenhuma.
  const vazio = criarGerenciadorSessao();
  assert.equal(vazio.entrar('servidor-demonstracao').ok, false);
  assert.equal(vazio.atual().usuario, null);
  assert.equal(vazio.token(), null);
});

test('SE5. sair só com o token atual; token errado falha e a sessão continua', () => {
  const g = criarGerenciadorSessao({ gerarToken: () => 'ab'.repeat(32) });
  const t = g.entrar('carlos-silva').token;
  for (const ruim of [undefined, '', 'x', 'f'.repeat(64), t.toUpperCase(), `${t} `]) {
    assert.deepEqual(g.sair(ruim), { ok: false, erro: 'nao_autorizado' });
    assert.equal(g.tokenValido(t), true);
  }
  assert.deepEqual(g.sair(t), { ok: true });
  assert.equal(g.atual().usuario, null);
  assert.equal(g.token(), null);
  assert.equal(g.tokenValido(t), false);
  assert.deepEqual(g.sair(t), { ok: false, erro: 'nao_autorizado' }, 'sem sessão, sair falha');
});

test('SE6. gerador inválido (fora de 64 hex, não texto ou com erro) → indisponivel, sem criar sessão nem trocar a atual', () => {
  for (const gerar of [() => 'curto', () => 'A'.repeat(64), () => 123, () => null, () => { throw new Error('falha'); }]) {
    const g = criarGerenciadorSessao({ gerarToken: gerar });
    assert.deepEqual(g.entrar('maria-silva'), { ok: false, erro: 'indisponivel' });
    assert.equal(g.atual().usuario, null);
    assert.equal(g.token(), null);
  }
  let bom = true;
  const g = criarGerenciadorSessao({ gerarToken: () => (bom ? 'ab'.repeat(32) : 'ruim') });
  const t = g.entrar('maria-silva').token;
  bom = false;
  assert.deepEqual(g.entrar('carlos-silva'), { ok: false, erro: 'indisponivel' });
  assert.equal(g.tokenValido(t), true, 'a sessão anterior continua');
  assert.deepEqual(g.atual().usuario, exibicao(MARIA));
});

test('SE7. atual() não devolve token e a sessão não guarda o nome (o nome vem de USUARIOS_SELECIONAVEIS)', () => {
  const g = criarGerenciadorSessao({ gerarToken: geradorSequencial() });
  const { token } = g.entrar('maria-silva');
  const a = g.atual();
  assert.equal(JSON.stringify(a).includes(token), false);
  assert.doesNotMatch(CODIGO, /sessao = \{[^}]*nome/, 'a sessão guarda só token, usuarioId e ator');
  assert.match(CODIGO, /sessao = \{ token: novo, usuarioId: r\.ator\.usuarioId, ator: r\.ator \}/);
  // Cópias: alterar o que foi devolvido não muda a sessão.
  a.usuario.nome = 'Outro';
  a.usuarios[0].perfil = 'revisor';
  assert.deepEqual(g.atual().usuario, exibicao(MARIA));
  assert.deepEqual(g.atual().usuarios, USUARIOS_SELECIONAVEIS.map(exibicao));
});

test('SE8. dois gerenciadores são independentes (reinício do servidor): o token de um não vale no outro', () => {
  const a = criarGerenciadorSessao();
  const b = criarGerenciadorSessao();
  const t = a.entrar('maria-silva').token;
  assert.equal(b.tokenValido(t), false);
  assert.equal(b.atual().usuario, null);
});

test('SE9. o módulo é puro: só importa node:crypto e atores.js; sem HTTP, Vite, requisição, resposta, arquivos nem log', () => {
  const imports = [...CODIGO.matchAll(/^import [^;]*? from '([^']+)';/gms)].map((m) => m[1]).sort();
  assert.deepEqual(imports, ['./atores.js', 'node:crypto']);
  assert.doesNotMatch(CODIGO, /node:http|node:net|node:fs|\bvite\b|\breq\b|\bres\b|setHeader|statusCode|console\.|process\.|localStorage|document/);
  assert.match(CODIGO, /crypto\.createHash\('sha256'\)/);
  assert.match(CODIGO, /crypto\.timingSafeEqual/);
});
