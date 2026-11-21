// Interface do login simulado (Sprint 8, Passo 8B): lógica pura e clientes com fetch falso, mais conferência estática do HTML
// e do código das páginas. Usuários fictícios; nada é gravado.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  AVISO_USUARIOS_FICTICIOS, CABECALHO_TOKEN, criarClienteAdmin, criarClienteGestao, MENSAGEM_SEM_USUARIO, MENSAGEM_USUARIO_MUDOU,
  normalizarSessao, rotuloDaEscolha, rotuloDoPerfil, rotuloDoUsuario,
} from '../admin/admin-logic.js';
import { USUARIOS_SELECIONAVEIS } from '../services/admin/atores.js';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ler = (...p) => fs.readFileSync(path.join(RAIZ, ...p), 'utf8');
const TOKEN = 'cd'.repeat(32);
const TOKEN2 = 'ef'.repeat(32);
const USUARIOS = USUARIOS_SELECIONAVEIS.map((u) => ({ usuarioId: u.usuarioId, nome: u.nome, perfil: u.perfil, setor: u.setor }));
const [MARIA, CARLOS] = USUARIOS;
const copia = (v) => JSON.parse(JSON.stringify(v));

/** Servidor falso da sessão: guarda o usuário e o token atuais; outras rotas exigem o token atual. */
function servidorFalso({ inicial = null, tokens = [TOKEN, TOKEN2] } = {}) {
  const chamadas = [];
  let sessao = inicial; // { usuario, token }
  let i = 0;
  const r = (status, corpo) => ({ status, json: async () => { if (corpo === undefined) throw new Error('sem corpo'); return copia(corpo); } });
  async function fetchImpl(url, opcoes) {
    chamadas.push({ url, method: opcoes.method, cabecalhos: { ...opcoes.headers }, corpo: opcoes.body === undefined ? undefined : JSON.parse(opcoes.body), opcoes });
    if (url === '/__admin/sessao') {
      if (opcoes.method === 'GET') return r(200, sessao === null ? { usuario: null, usuarios: USUARIOS } : { usuario: sessao.usuario, usuarios: USUARIOS, token: sessao.token });
      if (opcoes.method === 'POST') {
        const u = USUARIOS.find((x) => x.usuarioId === JSON.parse(opcoes.body).usuarioId);
        if (!u) return r(422, { erro: 'dados_invalidos', campos: ['usuarioId'] });
        sessao = { usuario: u, token: tokens[i++ % tokens.length] };
        return r(200, { token: sessao.token, usuario: u });
      }
      if (opcoes.method === 'DELETE') {
        if (sessao === null || opcoes.headers[CABECALHO_TOKEN] !== sessao.token) return r(401, { erro: 'nao_autorizado' });
        sessao = null;
        return r(204);
      }
    }
    if (sessao === null || opcoes.headers[CABECALHO_TOKEN] !== sessao.token) return r(401, { erro: 'nao_autorizado' });
    return r(200, { assuntos: [], servicos: [] });
  }
  return { fetchImpl, chamadas, trocarEmOutraAba: (usuario, token) => { sessao = { usuario, token }; } };
}

test('SI-1. normalizarSessao aceita só os formatos fechados de leitura (GET) e de entrada (POST)', () => {
  assert.deepEqual(normalizarSessao({ usuario: null, usuarios: USUARIOS }), { usuario: null, usuarios: USUARIOS, token: null });
  assert.deepEqual(normalizarSessao({ usuario: MARIA, usuarios: USUARIOS, token: TOKEN }), { usuario: MARIA, usuarios: USUARIOS, token: TOKEN });
  assert.deepEqual(normalizarSessao({ token: TOKEN, usuario: CARLOS }), { usuario: CARLOS, usuarios: null, token: TOKEN });
  const ruins = [
    null, [], 'x', {}, { token: TOKEN }, { usuario: null }, { usuarios: USUARIOS },
    { usuario: null, usuarios: USUARIOS, token: TOKEN }, // token sem usuário
    { usuario: MARIA, usuarios: USUARIOS }, // usuário sem token
    { usuario: MARIA, usuarios: USUARIOS, token: 'curto' },
    { usuario: MARIA, usuarios: USUARIOS, token: TOKEN.toUpperCase() },
    { usuario: MARIA, usuarios: USUARIOS, token: TOKEN, extra: 1 },
    { token: TOKEN, usuario: null },
    { token: TOKEN, usuario: { ...MARIA, email: 'x' } },
    { token: TOKEN, usuario: { ...MARIA, perfil: 'demonstracao' } },
    { token: TOKEN, usuario: { ...MARIA, usuarioId: 'Maria Silva' } },
    { token: TOKEN, usuario: { ...MARIA, nome: '' } },
    { token: TOKEN, usuario: { ...MARIA, nome: 'a\u0000b' } },
    { usuario: null, usuarios: [] },
    { usuario: null, usuarios: [MARIA, MARIA] },
    { usuario: null, usuarios: [MARIA, { ...CARLOS, setor: 5 }] },
    { usuario: { ...CARLOS, usuarioId: 'outro-usuario' }, usuarios: USUARIOS, token: TOKEN }, // usuário fora da lista
  ];
  for (const corpo of ruins) assert.equal(normalizarSessao(corpo), null, JSON.stringify(corpo));
});

test('SI-2. rótulos: perfil, "Nome — Perfil" no topo e "Nome — Perfil, Setor" na escolha', () => {
  assert.equal(rotuloDoPerfil('cadastrante'), 'Cadastrante');
  assert.equal(rotuloDoPerfil('revisor'), 'Revisor');
  for (const ruim of ['demonstracao', '__proto__', '', null, 3]) assert.equal(rotuloDoPerfil(ruim), 'Perfil indisponível');
  assert.equal(rotuloDoUsuario(MARIA), 'Maria Silva — Cadastrante');
  assert.equal(rotuloDoUsuario(CARLOS), 'Carlos Silva — Revisor');
  assert.equal(rotuloDaEscolha(MARIA), 'Maria Silva — Cadastrante, CLABI');
  assert.equal(rotuloDaEscolha(CARLOS), 'Carlos Silva — Revisor, CLABI');
  assert.equal(AVISO_USUARIOS_FICTICIOS, 'Usuários fictícios de demonstração, sem senha.');
  assert.equal(MENSAGEM_USUARIO_MUDOU, 'O usuário da sessão mudou. Atualize a página.');
});

for (const [nome, criar] of [['gestão', criarClienteGestao], ['conteúdo e saúde', criarClienteAdmin]]) {
  test(`SI-3 (${nome}). recuperarSessao: sem sessão devolve a lista e não guarda token; com sessão guarda o token só em memória`, async () => {
    const s = servidorFalso();
    const c = criar({ fetchImpl: s.fetchImpl });
    assert.deepEqual(await c.recuperarSessao(), { ok: true, usuario: null, usuarios: USUARIOS });
    assert.equal(s.chamadas[0].method, 'GET');
    assert.equal(s.chamadas[0].cabecalhos[CABECALHO_TOKEN], undefined);
    assert.equal(s.chamadas[0].corpo, undefined);
    const com = servidorFalso({ inicial: { usuario: MARIA, token: TOKEN } });
    const c2 = criar({ fetchImpl: com.fetchImpl });
    assert.deepEqual(await c2.recuperarSessao(), { ok: true, usuario: MARIA, usuarios: USUARIOS });
    assert.equal(JSON.stringify(c2).includes(TOKEN), false);
    await c2.carregarCatalogo();
    assert.equal(com.chamadas[1].cabecalhos[CABECALHO_TOKEN], TOKEN);
    // Retomar sem usuário escolhido falha com a orientação de escolher na Gestão de conteúdo.
    const c3 = criar({ fetchImpl: servidorFalso().fetchImpl });
    assert.deepEqual(await (c3.iniciarSessao ?? c3.entrar)(), { ok: false, semUsuario: true, mensagem: MENSAGEM_SEM_USUARIO });
  });

  test(`SI-4 (${nome}). entrarComo envia POST só com usuarioId, sem token; id inválido nem chega à rede`, async () => {
    const s = servidorFalso();
    const c = criar({ fetchImpl: s.fetchImpl });
    for (const ruim of ['', 'Maria Silva', 7, null, undefined, 'a'.repeat(61)]) {
      assert.equal((await c.entrarComo(ruim)).ok, false);
    }
    assert.equal(s.chamadas.length, 0);
    const r = await c.entrarComo('maria-silva');
    assert.deepEqual(r, { ok: true, usuario: MARIA });
    assert.equal(s.chamadas.length, 1);
    assert.equal(s.chamadas[0].method, 'POST');
    assert.deepEqual(s.chamadas[0].corpo, { usuarioId: 'maria-silva' });
    assert.equal(s.chamadas[0].cabecalhos['Content-Type'], 'application/json');
    assert.equal(s.chamadas[0].cabecalhos[CABECALHO_TOKEN], undefined);
    assert.equal(s.chamadas[0].opcoes.credentials, 'omit');
    const recusa = await c.entrarComo('servidor-demonstracao');
    assert.equal(recusa.ok, false);
    assert.equal(recusa.mensagem.includes('servidor-demonstracao'), false);
  });

  test(`SI-5 (${nome}). sair envia DELETE com o token atual e só depois zera o token local`, async () => {
    const s = servidorFalso();
    const c = criar({ fetchImpl: s.fetchImpl });
    await c.entrarComo('carlos-silva');
    const pronto = () => (c.sessaoPronta ?? c.entrou)();
    assert.equal(pronto(), true);
    const saida = c.sair();
    assert.equal(pronto(), true, 'o token só é zerado depois do DELETE');
    assert.deepEqual(await saida, { ok: true });
    assert.equal(pronto(), false);
    const ultimo = s.chamadas.at(-1);
    assert.equal(ultimo.method, 'DELETE');
    assert.equal(ultimo.url, '/__admin/sessao');
    assert.equal(ultimo.cabecalhos[CABECALHO_TOKEN], TOKEN);
    assert.equal(ultimo.corpo, undefined);
    assert.deepEqual(await c.sair(), { ok: true }, 'sem token, sair não chama a rede');
    assert.equal(s.chamadas.length, 2);
  });

  test(`SI-6 (${nome}). 401 depois de troca em outra aba: zera o token, avisa a tela uma vez e não envia mais nada`, async () => {
    const s = servidorFalso();
    let avisos = 0;
    const c = criar({ fetchImpl: s.fetchImpl, aoPerderSessao: () => { avisos += 1; } });
    await c.entrarComo('maria-silva');
    s.trocarEmOutraAba(CARLOS, TOKEN2);
    const r = await c.carregarCatalogo();
    assert.equal(r.ok, false);
    assert.equal(avisos, 1);
    assert.equal((c.sessaoPronta ?? c.entrou)(), false);
    const antes = s.chamadas.length;
    await c.carregarCatalogo();
    assert.equal(s.chamadas.length, antes, 'sem token, nada é enviado');
    assert.equal(avisos, 1);
  });
}

test('SI-7. HTML da gestão: fieldset com legend, rótulos acessíveis, botão de entrada, Trocar usuário e Sair; aviso só na escolha', () => {
  const html = ler('admin', 'index.html');
  const js = ler('admin', 'admin.js');
  assert.match(html, /<fieldset id="escolha-usuario"[^>]*tabindex="-1"[^>]*aria-describedby="escolha-aviso escolha-erro">\s*<legend>Escolha com qual usuário entrar<\/legend>/);
  assert.match(html, /<button type="submit" class="botao" id="botao-entrar">Acessar administração<\/button>/);
  assert.match(html, /<button type="button" class="botao botao--secundario" id="botao-cancelar-troca" hidden>Cancelar<\/button>/);
  assert.match(html, /<div id="barra-sessao" class="barra-sessao" hidden>/);
  assert.match(html, /<button type="button" class="botao botao--secundario" id="botao-trocar">Trocar usuário<\/button>/);
  assert.match(html, /<p id="escolha-erro" class="erro" hidden><\/p>/);
  // Os rádios são montados a partir da resposta do servidor, com rótulo ligado ao campo e texto por textContent.
  assert.match(js, /opcao\.type = 'radio'/);
  assert.match(js, /rotulo\.htmlFor = opcao\.id/);
  assert.match(js, /criar\('label', '', rotuloDaEscolha\(u\)\)/);
  assert.match(js, /\$\('escolha-aviso'\)\.textContent = AVISO_USUARIOS_FICTICIOS/);
  assert.match(js, /\$\('sessao-usuario'\)\.textContent = rotuloDoUsuario\(usuario\)/);
  assert.match(js, /\$\('escolha-usuario'\)\.focus\(\)/, 'sem escolha, o foco vai para o grupo');
  assert.match(js, /aoPerderSessao/);
  assert.match(js, /MENSAGEM_USUARIO_MUDOU/);
  // Nenhum nome fixo no HTML nem no código da página: tudo vem do servidor.
  assert.doesNotMatch(`${html}\n${js}`, /Maria|Carlos|maria-silva|carlos-silva/);
  // "demonstração" só no aviso da escolha (texto vindo de admin-logic.js), nunca no HTML visível depois da entrada.
  assert.doesNotMatch(html, /demonstra/i);
});

test('SI-8. conteúdo e saúde: "Nome — Perfil" no topo, Trocar usuário como link para a Gestão; sem usuário, orientação com link', () => {
  for (const pasta of ['conteudo', 'saude']) {
    const html = ler('admin', pasta, 'index.html');
    const js = ler('admin', pasta, `${pasta}.js`);
    assert.match(html, /<p class="barra-sessao__quem" id="sessao-usuario" hidden><\/p>/, pasta);
    assert.match(html, /<a class="botao botao--secundario" id="sessao-trocar" href="\.\.\/" hidden>Trocar usuário<\/a>/, pasta);
    assert.match(html, /<p id="sem-usuario" class="ajuda" hidden><a href="\.\.\/">Ir para a Gestão de conteúdo<\/a><\/p>/, pasta);
    assert.match(js, /cliente\.recuperarSessao\(\)/, pasta);
    assert.match(js, /quem\.textContent = usuario === null \? '' : rotuloDoUsuario\(usuario\)/, pasta);
    assert.match(js, /mostrarStatus\(MENSAGEM_SEM_USUARIO, 'erro'\)/, pasta);
    assert.match(js, /aoPerderSessao: \(\) => setTimeout\(perderSessao, 0\)/, pasta);
    assert.doesNotMatch(`${html}\n${js}`, /Maria|Carlos|maria-silva|carlos-silva|demonstra/i, pasta);
  }
  assert.equal(MENSAGEM_SEM_USUARIO, 'Escolha o usuário na Gestão de conteúdo.');
});

test('SI-9. nenhum innerHTML, armazenamento do navegador, cookie ou log nas páginas e na lógica', () => {
  for (const arquivo of [['admin', 'admin.js'], ['admin', 'admin-logic.js'], ['admin', 'conteudo', 'conteudo.js'], ['admin', 'saude', 'saude.js'], ['admin', 'index.html'], ['admin', 'conteudo', 'index.html'], ['admin', 'saude', 'index.html']]) {
    assert.doesNotMatch(ler(...arquivo), /innerHTML|outerHTML|insertAdjacentHTML|localStorage|sessionStorage|document\.cookie|console\./, arquivo.join('/'));
  }
});

// ---------- admin.js num DOM simulado: troca de usuário com catálogo falhando ----------

class Elemento {
  constructor(tag = 'div') {
    this.tag = tag; this.filhos = []; this.proprio = ''; this.className = ''; this.dataset = {}; this.atributos = new Map(); this.ouvintes = new Map();
    this.hidden = false; this.disabled = false; this.value = ''; this.checked = false; this.type = ''; this.name = ''; this.id = ''; this.open = false; this.focos = 0;
  }
  get textContent() { return this.proprio + this.filhos.map((f) => (typeof f === 'string' ? f : f.textContent)).join(''); }
  set textContent(v) { this.proprio = String(v); this.filhos = []; }
  append(...itens) { this.filhos.push(...itens); }
  replaceChildren(...itens) { this.proprio = ''; this.filhos = itens; }
  setAttribute(n, v) { this.atributos.set(n, String(v)); }
  getAttribute(n) { return this.atributos.has(n) ? this.atributos.get(n) : null; }
  removeAttribute(n) { this.atributos.delete(n); }
  addEventListener(tipo, fn) { this.ouvintes.set(tipo, fn); }
  querySelectorAll() { return []; }
  focus() { this.focos += 1; }
  close() { this.open = false; }
}

test('SI-10. troca com POST aceito e catálogo falhando: o topo já mostra o usuário novo e "Cancelar" some', async () => {
  const elementos = new Map();
  const radios = [];
  const antes = { document: globalThis.document, window: globalThis.window, fetch: globalThis.fetch };
  globalThis.document = {
    getElementById: (id) => { if (!elementos.has(id)) elementos.set(id, new Elemento()); return elementos.get(id); },
    createElement: (tag) => { const e = new Elemento(tag); if (tag === 'input') radios.push(e); return e; },
    createTextNode: (t) => String(t),
    querySelectorAll: (sel) => (sel === 'input[name="usuario"]' ? radios.filter((r) => r.name === 'usuario') : []),
    querySelector: (sel) => (sel === 'input[name="usuario"]:checked' ? radios.find((r) => r.name === 'usuario' && r.checked) ?? null : null),
  };
  globalThis.window = { location: { search: '', pathname: '/admin/' }, history: { replaceState: () => {} } };
  let sessao = { usuario: MARIA, token: TOKEN };
  const r = (status, corpo) => ({ status, json: async () => copia(corpo) });
  globalThis.fetch = async (url, o) => {
    if (url === '/__admin/sessao' && o.method === 'GET') return r(200, { usuario: sessao.usuario, usuarios: USUARIOS, token: sessao.token });
    if (url === '/__admin/sessao' && o.method === 'POST') {
      sessao = { usuario: USUARIOS.find((u) => u.usuarioId === JSON.parse(o.body).usuarioId), token: TOKEN2 };
      return r(200, { token: sessao.token, usuario: sessao.usuario });
    }
    if (url === '/__admin/catalogo') return sessao.token === TOKEN ? r(200, { assuntos: [], servicos: [] }) : r(500, { erro: 'indisponivel' });
    return r(404, { erro: 'nao_encontrado' });
  };
  const el = (id) => globalThis.document.getElementById(id);
  const esperar = async (condicao) => { for (let i = 0; i < 200 && !condicao(); i += 1) await new Promise((res) => setTimeout(res, 5)); };
  try {
    await import(`../admin/admin.js?teste=${Math.random()}`);
    await esperar(() => el('sessao-usuario').textContent !== '' && el('gestao').hidden === false);
    assert.equal(el('sessao-usuario').textContent, 'Maria Silva — Cadastrante');
    el('botao-trocar').ouvintes.get('click')();
    assert.equal(el('botao-cancelar-troca').hidden, false, 'na troca, "Cancelar" aparece');
    for (const x of radios) x.checked = x.value === 'carlos-silva'; // rádios do mesmo grupo: só um marcado
    await el('form-entrada').ouvintes.get('submit')({ preventDefault: () => {} });
    assert.equal(el('sessao-usuario').textContent, 'Carlos Silva — Revisor');
    assert.equal(el('botao-cancelar-troca').hidden, true);
    assert.equal(el('status').dataset.tipo, 'erro', 'a falha do catálogo aparece como erro');
    // Cancelar não volta mais para a gestão de Maria: a troca terminou.
    el('botao-cancelar-troca').ouvintes.get('click')();
    assert.equal(el('sessao-usuario').textContent, 'Carlos Silva — Revisor');
  } finally {
    Object.assign(globalThis, antes);
  }
});
