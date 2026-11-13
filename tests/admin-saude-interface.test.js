// Página "Saúde do sistema" (/admin/saude/) da administração (Marco 8, Passo 8B): lógica pura, cliente com fetch simulado, estrutura de
// acessibilidade e renderização real do admin.js num DOM simulado (sem navegador e sem rede). Dados fictícios; nada é gravado.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ROTAS, CABECALHO_TOKEN, CAPACIDADES_SAUDE, ESTADOS_SAUDE, NOMES_DOS_COMPONENTES, formatarDataHoraBr, normalizarSaude, resumoDaSaude, criarClienteAdmin,
  MENSAGENS, mensagemDeErro,
} from '../admin/admin-logic.js';
import { COMPONENTES, CAPACIDADES, ESTADOS } from '../services/admin/saude.js';
import { conferirDist, NOMES_ADMINISTRATIVOS } from '../scripts/check-dist.js';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lerTexto = (...p) => fs.readFileSync(path.join(RAIZ, ...p), 'utf8');
const HTML = lerTexto('admin', 'saude', 'index.html');
const JS = lerTexto('admin', 'saude', 'saude.js');
const JS_CADASTRO = lerTexto('admin', 'admin.js');
const LOGICA = lerTexto('admin', 'admin-logic.js');
const CSS = lerTexto('admin', 'styles.css');
const TOKEN = '1a'.repeat(32);
const ISO = '2026-11-13T15:30:45.123Z';
const criarData = (s) => new Date(s);

const componente = (id, capacidade, estado, mensagem = 'Mensagem pública curta.') => ({ componente: id, capacidade, estado, verificadoEm: ISO, mensagem });
const corpoDeSaude = () => ({
  geradoEm: ISO,
  componentes: [
    componente('aplicacao_administrativa', 'implementado', 'operacional', 'A aplicação administrativa local está respondendo.'),
    componente('base_assuntos', 'implementado', 'degradado', 'Há inconsistências no cadastro de assuntos.'),
    componente('armazenamento', 'implementado', 'indisponivel', 'O teste temporário de gravação e leitura falhou.'),
    componente('processamento_fontes', 'nao_implementado', 'nao_verificado', 'O processamento de fontes ainda não existe.'),
    componente('banco_de_dados', 'nao_implementado', 'nao_verificado', 'Não há banco de dados.'),
    componente('ia_externa', 'nao_implementado', 'nao_verificado', 'A integração com IA externa ainda não existe.'),
    componente('mcp', 'nao_se_aplica', 'nao_verificado', 'MCP não faz parte da operação do produto.'),
  ],
});

// ---------- Lógica ----------

test('SI1. data e hora em DD-MM-AAAA HH:mm:ss no horário local, com zeros à esquerda e entradas inválidas tratadas', () => {
  const local = new Date(2026, 10, 3, 9, 5, 7).toISOString();
  assert.equal(formatarDataHoraBr(local, criarData), '03-11-2026 09:05:07');
  assert.equal(formatarDataHoraBr(new Date(2026, 0, 1, 0, 0, 0).toISOString(), criarData), '01-01-2026 00:00:00');
  assert.equal(formatarDataHoraBr(new Date(2026, 11, 31, 23, 59, 59).toISOString(), criarData), '31-12-2026 23:59:59');
  assert.match(formatarDataHoraBr(ISO, criarData), /^\d{2}-\d{2}-\d{4} \d{2}:\d{2}:\d{2}$/);
  for (const ruim of ['', 'amanhã', '2026-11-13', '2026-11-13 15:30:45', '13-11-2026 15:30:45', undefined, null, 5, '2026-13-45T99:99:99Z'.replace('99:99:99', '25:61:61')]) {
    assert.equal(formatarDataHoraBr(ruim, criarData), 'data indisponível', String(ruim));
  }
  assert.equal(formatarDataHoraBr(ISO, undefined), 'data indisponível', 'sem relógio injetado não há conversão');
  assert.equal(formatarDataHoraBr(ISO, () => null), 'data indisponível');
});

test('SI2. rótulos de capacidade, estado e componente cobrem exatamente o que o servidor devolve', () => {
  assert.deepEqual(Object.keys(CAPACIDADES_SAUDE), [...CAPACIDADES]);
  assert.deepEqual(Object.keys(ESTADOS_SAUDE), [...ESTADOS]);
  assert.deepEqual(Object.keys(NOMES_DOS_COMPONENTES), [...COMPONENTES]);
  assert.deepEqual(Object.values(CAPACIDADES_SAUDE), ['Implementado', 'Não implementado', 'Não se aplica']);
  assert.deepEqual(Object.values(ESTADOS_SAUDE), ['Operacional', 'Degradado', 'Indisponível', 'Não verificado']);
});

test('SI3. a resposta é normalizada: só componentes, capacidades e estados conhecidos; campos extras e caminhos nunca chegam à tela', () => {
  const saude = normalizarSaude(corpoDeSaude());
  assert.equal(saude.geradoEm, ISO);
  assert.equal(saude.componentes.length, 7);
  assert.deepEqual(Object.keys(saude.componentes[0]).sort(), ['capacidade', 'estado', 'id', 'mensagem', 'nome', 'verificadoEm']);
  assert.equal(saude.componentes[0].nome, 'Aplicação administrativa');
  const suja = corpoDeSaude();
  suja.componentes.push({ ...componente('inventado', 'implementado', 'operacional'), caminho: '/segredo/interno' });
  suja.componentes.push(componente('mcp', 'talvez', 'operacional'));
  suja.componentes.push(componente('mcp', 'nao_se_aplica', 'ok'));
  suja.componentes.push({ ...componente('mcp', 'nao_se_aplica', 'nao_verificado'), verificadoEm: 'ontem' });
  suja.componentes.push(null);
  suja.componentes[0].caminho = '/segredo/interno';
  suja.componentes[0].mensagem = 'x'.repeat(500);
  const limpa = normalizarSaude(suja);
  assert.equal(limpa.componentes.length, 7, 'só os sete válidos');
  assert.equal(limpa.componentes[0].mensagem.length, 200);
  assert.doesNotMatch(JSON.stringify(limpa), /segredo|inventado/);
  for (const ruim of [null, undefined, [], 'x', {}, { geradoEm: ISO }, { geradoEm: 'ontem', componentes: [] }, { geradoEm: ISO, componentes: [] }, { geradoEm: ISO, componentes: [{}] }]) assert.equal(normalizarSaude(ruim), null);
});

test('SI4. resumo em uma frase: quantos componentes em cada estado', () => {
  assert.equal(resumoDaSaude(normalizarSaude(corpoDeSaude()).componentes), 'Operacionais: 1. Degradados: 1. Indisponíveis: 1. Não verificados: 4.');
  assert.equal(resumoDaSaude([]), 'Operacionais: 0. Degradados: 0. Indisponíveis: 0. Não verificados: 0.');
});

// ---------- Cliente ----------

function servidor({ saude = async () => ({ status: 200, json: async () => corpoDeSaude() }) } = {}) {
  const chamadas = [];
  const fetchImpl = async (url, opcoes = {}) => {
    chamadas.push({ url, ...opcoes });
    if (url === ROTAS.sessao) return { status: 200, json: async () => ({ token: TOKEN }) };
    if (opcoes.headers?.[CABECALHO_TOKEN] !== TOKEN) return { status: 401, json: async () => ({ erro: 'nao_autorizado' }) };
    if (url === ROTAS.saude) return saude(opcoes);
    return { status: 404, json: async () => ({ erro: 'nao_encontrado' }) };
  };
  return { fetchImpl, chamadas };
}

test('SI5. verificar a saúde: GET com o token em memória, resposta normalizada, sem expor o token', async () => {
  const s = servidor();
  const c = criarClienteAdmin({ fetchImpl: s.fetchImpl });
  assert.deepEqual(await c.carregarSaude(), { ok: false, mensagem: MENSAGENS.sessao });
  assert.deepEqual(s.chamadas, [], 'sem sessão não há chamada');
  await c.iniciarSessao();
  const r = await c.carregarSaude();
  assert.equal(r.ok, true);
  assert.equal(r.saude.componentes.length, 7);
  const chamada = s.chamadas.at(-1);
  assert.deepEqual([chamada.url, chamada.method, chamada.headers[CABECALHO_TOKEN], chamada.cache, chamada.credentials], ['/__admin/saude', 'GET', TOKEN, 'no-store', 'omit']);
  assert.equal(JSON.stringify(r).includes(TOKEN), false);
});

test('SI6. falhas ao verificar viram mensagens curtas: sessão inválida, erro do servidor, formato inválido e rede', async () => {
  const casos = [
    [async () => ({ status: 401, json: async () => ({ erro: 'nao_autorizado' }) }), mensagemDeErro(401, {})],
    [async () => ({ status: 500, json: async () => ({ erro: 'indisponivel' }) }), MENSAGENS.saude],
    [async () => ({ status: 200, json: async () => ({ geradoEm: 'x', componentes: [] }) }), MENSAGENS.saude],
    [async () => ({ status: 200, json: async () => { throw new Error('json'); } }), MENSAGENS.saude],
    [async () => { throw new Error('rede'); }, MENSAGENS.rede],
  ];
  for (const [saude, mensagem] of casos) {
    const s = servidor({ saude });
    const c = criarClienteAdmin({ fetchImpl: s.fetchImpl });
    await c.iniciarSessao();
    assert.deepEqual(await c.carregarSaude(), { ok: false, mensagem });
  }
});

// ---------- HTML, CSS e código ----------

test('SI7. a página é acessível e compacta: título, resumo, botão "Verificar novamente" desabilitado no início, regiões vivas, lista com aria-busy e link de volta', () => {
  assert.match(HTML, /<section class="cartao" aria-labelledby="titulo-saude">/);
  assert.match(HTML, /<h2 id="titulo-saude">Componentes<\/h2>/);
  assert.match(HTML, /<p id="saude-resumo" class="saude__resumo" aria-live="polite">Aguardando a primeira verificação\.<\/p>/);
  assert.match(HTML, /<button type="button" class="botao" id="saude-verificar" disabled>Verificar novamente<\/button>/);
  assert.match(HTML, /<p id="saude-quando" class="ajuda" aria-live="polite">Ainda não verificado\.<\/p>/);
  assert.match(HTML, /<div id="saude-lista" aria-busy="false"><\/div>/);
  assert.match(HTML, /<p id="status" class="status" role="status" aria-live="polite" tabindex="-1"><\/p>/);
  assert.match(HTML, /<a class="botao botao--secundario" href="..\/">Voltar para Gestão de conteúdo<\/a>/);
  assert.match(HTML, /sem fingir funcionamento/);
  // A página de saúde tem só os elementos de saúde: nada de formulário de cadastro.
  assert.doesNotMatch(HTML, /<form|<input|<textarea|<select|<dialog/);
  assert.equal((HTML.match(/<button\b/g) ?? []).length, 1);
  const ids = [...HTML.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
  assert.equal(new Set(ids).size, ids.length);
});

test('SI8. responsividade e estados visuais: lista em grade, quebra de texto, estado também em texto e movimento reduzido', () => {
  assert.match(CSS, /\.saude \{[^}]*display: grid/);
  assert.match(CSS, /\.saude__item \{[^}]*overflow-wrap: anywhere/);
  for (const estado of ['operacional', 'degradado', 'indisponivel', 'nao_verificado']) assert.match(CSS, new RegExp(`\\.saude__item\\[data-estado='${estado}'\\]`));
  assert.match(CSS, /\.saude__acoes \{[^}]*flex-wrap: wrap/);
  assert.match(CSS, /overflow-x: hidden/);
  assert.match(CSS, /prefers-reduced-motion: reduce/);
  assert.match(JS, /`Estado: \$\{ESTADOS_SAUDE\[c\.estado\]\}`/, 'o estado aparece como texto, não só como cor');
});

test('SI9. o código da página não usa innerHTML, armazenamento do navegador, cookies nem log; só um uso de Date, no DOM', () => {
  for (const [nome, texto] of [['saude.js', JS], ['admin.js', JS_CADASTRO], ['admin-logic.js', LOGICA]]) {
    assert.doesNotMatch(texto, /innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\(|localStorage|sessionStorage|indexedDB|document\.cookie|console\./, nome);
  }
  assert.equal((JS.match(/new Date\(/g) ?? []).length, 1);
  assert.match(JS, /const criarData = \(texto\) => new Date\(texto\);/);
  assert.doesNotMatch(LOGICA, /new Date\(|Date\.now/);
  assert.match(JS, /if \(verificando \|\| !cliente\.sessaoPronta\(\)\) return;/);
  assert.deepEqual([...JS.matchAll(/^import [^;]*? from '([^']+)';/gms)].map((m) => m[1]), ['../admin-logic.js'], 'reutiliza a lógica da administração');
  assert.doesNotMatch(JS_CADASTRO, /saude|Saúde|new Date\(/i, 'a tela de cadastro não tem mais nada de saúde');
  assert.equal((LOGICA.match(/'POST'/g) ?? []).length, 1, 'a saúde só faz GET');
});

test('SI10. isolamento: dist/ sem a seção, a rota ou as funções de saúde; a conferência do build procura esses nomes', { skip: !fs.existsSync(path.join(RAIZ, 'dist')) }, () => {
  assert.deepEqual(conferirDist(RAIZ), []);
  const lista = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? lista(path.join(d, e.name)) : [path.join(d, e.name)]));
  for (const f of lista(path.join(RAIZ, 'dist'))) assert.doesNotMatch(fs.readFileSync(f, 'utf8'), /Saúde do sistema|Verificar novamente|saude-verificar|__admin\/saude|verificarSaude|carregarSaude|normalizarSaude/, f);
  for (const nome of ['/__admin/saude', 'verificarSaude', 'carregarSaude', 'Saúde do sistema', 'Verificar novamente', 'saude-verificar']) assert.ok(NOMES_ADMINISTRATIVOS.includes(nome), nome);
  for (const arquivo of ['index.html', 'src/main.js', 'src/chat.js', 'src/assistant.js', 'src/styles.css']) assert.doesNotMatch(lerTexto(arquivo), /Saúde do sistema|__admin|verificarSaude|\/admin\/saude/, arquivo);
});

// ---------- Renderização real do admin.js num DOM simulado ----------

class Elemento {
  constructor(tag = 'div') {
    this.tag = tag; this.filhos = []; this.proprio = ''; this.className = ''; this.dataset = {}; this.atributos = new Map(); this.ouvintes = new Map();
    this.hidden = false; this.disabled = false; this.value = ''; this.checked = false; this.type = ''; this.focos = 0;
  }
  get textContent() { return this.proprio + this.filhos.map((f) => (typeof f === 'string' ? f : f.textContent)).join(''); }
  set textContent(v) { this.proprio = String(v); this.filhos = []; }
  append(...itens) { this.filhos.push(...itens); }
  replaceChildren(...itens) { this.proprio = ''; this.filhos = itens; }
  setAttribute(n, v) { this.atributos.set(n, String(v)); }
  getAttribute(n) { return this.atributos.has(n) ? this.atributos.get(n) : null; }
  removeAttribute(n) { this.atributos.delete(n); }
  addEventListener(tipo, fn) { this.ouvintes.set(tipo, fn); }
  focus() { this.focos += 1; }
  descendentes() { return this.filhos.flatMap((f) => (typeof f === 'string' ? [] : [f, ...f.descendentes()])); }
}

async function montarTela(opcoes = {}) {
  const elementos = new Map();
  const antesDocument = globalThis.document;
  const antesFetch = globalThis.fetch;
  globalThis.document = {
    getElementById: (id) => { if (!elementos.has(id)) elementos.set(id, new Elemento()); return elementos.get(id); },
    createElement: (tag) => new Elemento(tag),
  };
  const s = servidor(opcoes);
  const extra = async (url, o = {}) => {
    if (url === ROTAS.catalogo) return { status: 200, json: async () => ({ assuntos: [{ id: 'a', nome: 'Assunto', descricao: 'D', ativo: true }], servicos: [] }) };
    return s.fetchImpl(url, o);
  };
  globalThis.fetch = (url, o) => (url === ROTAS.catalogo && o?.headers?.[CABECALHO_TOKEN] === TOKEN ? extra(url, o) : s.fetchImpl(url, o));
  await import(`../admin/saude/saude.js?teste=${Math.random()}`);
  const esperar = async (condicao) => { for (let i = 0; i < 200 && !condicao(); i += 1) await new Promise((r) => setTimeout(r, 5)); };
  const restaurar = () => { globalThis.document = antesDocument; globalThis.fetch = antesFetch; };
  return { el: (id) => globalThis.document.getElementById(id), elementos, esperar, restaurar, chamadas: s.chamadas };
}

test('SI11. renderização real da página: mostra cada componente com capacidade, estado, mensagem e hora DD-MM-AAAA HH:mm:ss, e o botão verifica de novo', async () => {
  const tela = await montarTela();
  try {
    await tela.esperar(() => tela.el('saude-lista').filhos.length > 0);
    const itens = tela.el('saude-lista').filhos[0].filhos;
    assert.equal(itens.length, 7);
    const hora = formatarDataHoraBr(ISO, criarData);
    const primeiro = itens[0];
    assert.equal(primeiro.dataset.estado, 'operacional');
    assert.deepEqual(primeiro.filhos.map((f) => f.textContent), [
      'Aplicação administrativa', 'Capacidade: Implementado', 'Estado: Operacional', 'A aplicação administrativa local está respondendo.', `Verificado em ${hora}`,
    ]);
    assert.match(hora, /^\d{2}-\d{2}-\d{4} \d{2}:\d{2}:\d{2}$/);
    const mcp = itens[6];
    assert.deepEqual([mcp.dataset.estado, mcp.filhos[1].textContent, mcp.filhos[2].textContent], ['nao_verificado', 'Capacidade: Não se aplica', 'Estado: Não verificado']);
    assert.equal(itens[3].filhos[1].textContent, 'Capacidade: Não implementado');
    assert.equal(itens[1].dataset.estado, 'degradado');
    assert.equal(itens[2].dataset.estado, 'indisponivel');
    assert.equal(tela.el('saude-resumo').textContent, 'Operacionais: 1. Degradados: 1. Indisponíveis: 1. Não verificados: 4.');
    assert.equal(tela.el('saude-quando').textContent, `Última verificação: ${hora}.`);
    assert.equal(tela.el('saude-lista').getAttribute('aria-busy'), 'false');
    assert.equal(tela.el('saude-verificar').disabled, false);
    // "Verificar novamente" chama o endpoint de novo, sem envio duplicado.
    const antes = tela.chamadas.filter((c) => c.url === ROTAS.saude).length;
    assert.equal(antes, 1);
    const clique = tela.el('saude-verificar').ouvintes.get('click');
    const a = clique();
    const b = clique();
    assert.equal(tela.el('saude-verificar').disabled, true, 'desabilitado durante a verificação');
    assert.equal(tela.el('saude-lista').getAttribute('aria-busy'), 'true');
    await Promise.all([a, b]);
    assert.equal(tela.chamadas.filter((c) => c.url === ROTAS.saude).length, 2, 'o segundo clique simultâneo não gerou nova chamada');
    assert.equal(tela.el('saude-verificar').disabled, false);
    assert.equal(tela.el('saude-lista').filhos[0].filhos.length, 7);
    // O que aparece na tela não tem token nem ids técnicos.
    const tudo = [...tela.elementos.values()].map((e) => e.textContent).join('\n');
    assert.equal(tudo.includes(TOKEN), false);
    assert.doesNotMatch(tudo, /aplicacao_administrativa|nao_implementado|nao_verificado|base_assuntos|\/__admin/);
  } finally {
    tela.restaurar();
  }
});

test('SI12. renderização real: falha ao verificar mostra só a mensagem curta e limpa a lista, sem resposta bruta', async () => {
  const tela = await montarTela({ saude: async () => ({ status: 500, json: async () => ({ erro: 'indisponivel', detalhe: '/caminho/secreto' }) }) });
  try {
    await tela.esperar(() => tela.el('saude-quando').textContent === MENSAGENS.saude);
    assert.equal(tela.el('saude-quando').textContent, MENSAGENS.saude);
    assert.equal(tela.el('saude-lista').filhos.length, 0);
    assert.equal(tela.el('saude-resumo').textContent, 'Não há resultado de verificação.');
    assert.equal(tela.el('saude-verificar').disabled, false, 'permite tentar de novo');
    const tudo = [...tela.elementos.values()].map((e) => e.textContent).join('\n');
    assert.doesNotMatch(tudo, /secreto|detalhe/);
  } finally {
    tela.restaurar();
  }
});
