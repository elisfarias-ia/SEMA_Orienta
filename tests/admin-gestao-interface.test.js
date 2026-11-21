// Área administrativa por serviço (Passo 4B2): lógica pura, cliente com fetch simulado, estrutura de acessibilidade e
// isolamento. Dados fictícios; nenhuma rede e nenhuma gravação em disco.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CABECALHO_TOKEN, MENSAGENS_GESTAO, ROTAS_GESTAO, TIPOS_LINK, corpoDoLinkExistente, criarClienteGestao, mensagemDaGestao, pareceDadoPessoal,
  resolverTema, resumirInformacoes, resumirLinksExistentes, servicosDaLista, temasAtivos, validarEntradaTexto, validarLinkNovo, validarNovoServico,
} from '../admin/admin-logic.js';
import { USUARIOS_SELECIONAVEIS } from '../services/admin/atores.js';

// Passo 8B: a sessão responde no formato novo (usuário escolhido, usuários selecionáveis e token).
const sessaoCom = (token) => ({ usuario: { ...USUARIOS_SELECIONAVEIS[0] }, usuarios: USUARIOS_SELECIONAVEIS.map((u) => ({ ...u })), token });

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lerTexto = (...p) => fs.readFileSync(path.join(RAIZ, ...p), 'utf8');
const HTML = lerTexto('admin', 'index.html');
const JS = lerTexto('admin', 'admin.js');
const CSS = lerTexto('admin', 'styles.css');
const LOGICA = lerTexto('admin', 'admin-logic.js');
const TOKEN = 'ab'.repeat(32);

const CATALOGO = {
  assuntos: [
    { id: 'tema-um', nome: 'Licenciamento', ativo: true },
    { id: 'tema-dois', nome: 'Água e Solo', ativo: true },
    { id: 'tema-off', nome: 'Antigo', ativo: false },
  ],
  servicos: [
    { id: 'servico-a', assuntoId: 'tema-um', nome: 'Licença Simples', sigla: 'LS' },
    { id: 'servico-b', assuntoId: 'tema-dois', nome: 'Outorga de água' },
  ],
};
const TEMAS = temasAtivos(CATALOGO);

function servidorFalso({ respostas = {}, portao = null } = {}) {
  const chamadas = [];
  const resposta = (status, corpo) => ({ status, json: async () => corpo });
  const fetchImpl = async (url, opcoes = {}) => {
    chamadas.push({ url, ...opcoes, corpo: opcoes.body === undefined ? undefined : JSON.parse(opcoes.body) });
    if (respostas[url]) return respostas[url](opcoes);
    if (url === ROTAS_GESTAO.sessao) return resposta(200, sessaoCom(TOKEN));
    if (opcoes.headers?.[CABECALHO_TOKEN] !== TOKEN) return resposta(401, { erro: 'nao_autorizado' });
    if (portao) await portao;
    if (url === ROTAS_GESTAO.catalogo) return resposta(200, CATALOGO);
    if (url === ROTAS_GESTAO.servicoComTema) return resposta(201, { servico: { id: 'novo-servico', nome: 'Novo Serviço', assuntoId: 'tema-um', temaNome: 'Licenciamento' }, temaCriado: false });
    if (/\/entradas-texto$/.test(url)) return resposta(201, { criado: true });
    if (/\/links$/.test(url)) return resposta(201, { fonte: { id: 'x' } });
    if (/\/links-existentes$/.test(url)) return resposta(201, { fonte: { id: 'y' } });
    return resposta(404, { erro: 'nao_encontrado' });
  };
  return { fetchImpl, chamadas };
}
async function clienteEntrou(opcoes) {
  const s = servidorFalso(opcoes);
  const cliente = criarClienteGestao({ fetchImpl: s.fetchImpl });
  assert.deepEqual(await cliente.entrar(), { ok: true });
  return { cliente, ...s };
}

// ---------- Lógica pura ----------

test('G1. temas ativos e lista de serviços com busca sem acento nem maiúscula, sem ids na exibição', () => {
  assert.deepEqual(TEMAS.map((t) => t.nome), ['Água e Solo', 'Licenciamento']);
  assert.deepEqual(servicosDaLista(CATALOGO).map((s) => s.nome), ['Licença Simples', 'Outorga de água']);
  assert.deepEqual(servicosDaLista(CATALOGO, 'AGUA').map((s) => s.nome), ['Outorga de água']);
  assert.deepEqual(servicosDaLista(CATALOGO, 'licenciamento').map((s) => s.nome), ['Licença Simples']);
  assert.deepEqual(servicosDaLista(CATALOGO, 'inexistente'), []);
  assert.deepEqual(servicosDaLista(null), []);
});

test('G2. tema: o existente é reutilizado (sem acento nem maiúscula) e o novo vai por nome', () => {
  assert.deepEqual(resolverTema('  agua  E solo ', TEMAS), { id: 'tema-dois' });
  assert.deepEqual(resolverTema('Fauna  Silvestre', TEMAS), { nome: 'Fauna Silvestre' });
});

test('G3. novo serviço: só nome e tema; erros junto de cada campo; corpo sem id, sigla nem descrição', () => {
  assert.deepEqual(Object.keys(validarNovoServico({ nome: '', tema: '' }, TEMAS).erros).sort(), ['nome', 'tema']);
  assert.ok(validarNovoServico({ nome: 'x'.repeat(121), tema: 'Tema' }, TEMAS).erros.nome);
  assert.ok(validarNovoServico({ nome: '!!!', tema: 'Tema' }, TEMAS).erros.nome);
  const ok = validarNovoServico({ nome: '  Serviço   Novo ', tema: 'Licenciamento', sigla: 'ZZ' }, TEMAS);
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.corpo, { nome: 'Serviço Novo', tema: { id: 'tema-um' } });
});

test('G4. dados pessoais e credenciais são reconhecidos', () => {
  for (const t of ['senha: 1234', 'fale com ana' + '@' + 'exemplo.test', 'ligue (65) 99999' + '-1234', 'CPF 123.456.789-09', 'token=abc', 'api_key: x']) assert.equal(pareceDadoPessoal(t), true, t);
  for (const t of ['Prazo de 30 dias para a análise.', 'Lei 9.605 de 1998']) assert.equal(pareceDadoPessoal(t), false, t);
});

test('G5. informação em texto: obrigatórios, limite de 20.000 caracteres, recusa de dado pessoal, opcionais só se preenchidos', () => {
  assert.deepEqual(Object.keys(validarEntradaTexto({}).erros).sort(), ['texto', 'titulo']);
  assert.ok(validarEntradaTexto({ titulo: 'T', texto: 'a'.repeat(20001) }).erros.texto);
  assert.ok(validarEntradaTexto({ titulo: 'T', texto: 'Minha senha: abc' }).erros.texto);
  assert.ok(validarEntradaTexto({ titulo: 'T', texto: 'ok', descricao: 'fale: a' + '@' + 'b.test' }).erros.descricao);
  assert.deepEqual(validarEntradaTexto({ titulo: ' Prazos ', texto: ' Texto livre. ' }).corpo, { titulo: 'Prazos', texto: 'Texto livre.' });
  assert.deepEqual(validarEntradaTexto({ titulo: 'T', texto: 'x', descricao: 'D', orgaoResponsavel: 'Órgão' }).corpo, { titulo: 'T', texto: 'x', descricao: 'D', orgaoResponsavel: 'Órgão' });
});

test('G6. link novo: https obrigatório, tipo em linguagem comum, origem oficial booleana, corpo só com os campos permitidos', () => {
  assert.deepEqual(TIPOS_LINK.map(([v]) => v).sort(), ['legislacao', 'manual', 'outro', 'pagina_oficial']);
  const base = { titulo: 'Portal', tipo: 'pagina_oficial', orgaoResponsavel: 'Órgão', url: 'https://exemplo.test/pagina', descricao: 'Página do serviço.' };
  assert.deepEqual(validarLinkNovo({ ...base, origemOficial: true }).corpo, { ...base, origemOficial: true });
  assert.equal(validarLinkNovo(base).corpo.origemOficial, false);
  for (const url of ['http://exemplo.test', 'exemplo', 'https://u:p' + '@' + 'exemplo.test', 'https://exemplo.test/?senha=1', 'https://localhost']) assert.ok(validarLinkNovo({ ...base, url }).erros.url, url);
  assert.ok(validarLinkNovo({ ...base, tipo: 'formulario' }).erros.tipo);
  assert.deepEqual(Object.keys(validarLinkNovo({}).erros).sort(), ['descricao', 'orgaoResponsavel', 'tipo', 'titulo', 'url']);
});

test('G7. listas de exibição: sem identificadores; link existente leva só a identidade; https apenas', () => {
  const info = resumirInformacoes({
    servicoId: 'servico-a', estadoVersao: 'rascunho',
    itens: [
      { tipo: 'texto', titulo: 'Prazos', descricao: 'D', texto: 'Corpo', textoCortado: true, criadoEm: '2026-11-10T10:00:00Z', situacao: 'rascunho' },
      { tipo: 'link', titulo: 'Portal', url: 'https://exemplo.test', orgaoResponsavel: 'Órgão', situacao: 'rascunho', reutilizadoDe: { servicoId: 's', fonteId: 'f' } },
      { tipo: 'link', titulo: 'Ruim', url: 'javascript:alert(1)', situacao: 'estranha' },
      { tipo: 'outro', titulo: 'Ignorado' },
    ],
  });
  assert.equal(info.itens.length, 3);
  assert.equal(info.itens[0].data, '10-11-2026');
  assert.equal(info.itens[1].reutilizado, true);
  assert.equal(info.itens[2].url, null);
  assert.equal(info.itens[2].situacao, 'Em elaboração');
  assert.equal(info.editavel, true);
  assert.equal(resumirInformacoes({ estadoVersao: 'em_validacao', itens: [] }).editavel, false);
  assert.equal(resumirInformacoes(null), null);
  const busca = resumirLinksExistentes({ itens: [{ servicoId: 'servico-b', fonteId: 'fonte-b', titulo: 'Manual', url: 'https://exemplo.test/m', jaNoServico: false, extra: 'x' }, { servicoId: 'Inválido!', fonteId: 'f', titulo: 'x' }], truncado: true });
  assert.equal(busca.itens.length, 1);
  assert.equal(busca.truncado, true);
  assert.deepEqual(corpoDoLinkExistente(busca.itens[0]), { servicoId: 'servico-b', fonteId: 'fonte-b' });
  assert.doesNotMatch(JSON.stringify(info.itens), /servico-a|"s"|"f"/);
});

test('G8. mensagens por código, sem usar texto da resposta; 422 mapeia só campos conhecidos', () => {
  assert.equal(mensagemDaGestao(409, { erro: 'operacao_em_andamento' }).mensagem, 'Há outra gravação em andamento, tente de novo.');
  assert.equal(mensagemDaGestao(409, { erro: 'operacao_em_andamento' }).emAndamento, true);
  assert.equal(mensagemDaGestao(409, { erro: 'ja_existe', campo: 'url' }).erros.url, MENSAGENS_GESTAO.urlRepetida);
  assert.equal(mensagemDaGestao(409, { erro: 'ja_existe', campo: 'nome' }).erros.nome, MENSAGENS_GESTAO.nomeRepetido);
  assert.equal(mensagemDaGestao(409, { erro: 'versao_nao_editavel' }).recarregar, true);
  assert.deepEqual(Object.keys(mensagemDaGestao(422, { erro: 'dados_invalidos', campos: ['texto', 'titulo', 'caminho/secreto'] }).erros).sort(), ['texto', 'titulo']);
  assert.equal(mensagemDaGestao(401, {}).mensagem, MENSAGENS_GESTAO.expirada);
  assert.equal(mensagemDaGestao(500, { erro: 'C:\\segredo\\arquivo.json' }).mensagem.includes('segredo'), false);
  for (const [status, corpo] of [[409, { erro: 'x' }], [422, {}], [404, {}], [403, {}], [413, {}], [418, {}]]) assert.ok(mensagemDaGestao(status, corpo).mensagem.length > 10);
});

// ---------- Cliente ----------

test('G9. entrar lê só a sessão (sem token), depois o token vai em X-Admin-Token e nunca é exposto', async () => {
  const { cliente, chamadas } = await clienteEntrou();
  assert.equal(chamadas.length, 1);
  assert.equal(chamadas[0].url, ROTAS_GESTAO.sessao);
  assert.equal(chamadas[0].method, 'GET');
  assert.equal(chamadas[0].headers[CABECALHO_TOKEN], undefined);
  assert.equal(cliente.entrou(), true);
  assert.equal((await cliente.carregarCatalogo()).ok, true);
  assert.equal(chamadas[1].headers[CABECALHO_TOKEN], TOKEN);
  assert.equal(chamadas[1].credentials, 'omit');
  assert.equal(JSON.stringify(cliente).includes(TOKEN), false);
  // 8B: sair envia DELETE /__admin/sessao com o token e só depois zera o token local.
  await cliente.sair();
  assert.equal(chamadas[2].url, ROTAS_GESTAO.sessao);
  assert.equal(chamadas[2].method, 'DELETE');
  assert.equal(chamadas[2].headers[CABECALHO_TOKEN], TOKEN);
  assert.equal(cliente.entrou(), false);
  assert.deepEqual(await cliente.carregarCatalogo(), { ok: false, mensagem: MENSAGENS_GESTAO.semEntrada });
  assert.equal(chamadas.length, 3, 'depois de sair nada é enviado');
});

test('G10. falhas ao entrar viram mensagem curta e nenhuma gravação acontece sem entrada', async () => {
  for (const [fetchImpl, mensagem] of [
    [async () => ({ status: 403, json: async () => ({}) }), MENSAGENS_GESTAO.acessoLocal],
    [async () => ({ status: 200, json: async () => ({ token: 'curto' }) }), MENSAGENS_GESTAO.entrada],
    [async () => { throw new Error('rede'); }, MENSAGENS_GESTAO.rede],
  ]) {
    const c = criarClienteGestao({ fetchImpl });
    assert.deepEqual(await c.entrar(), { ok: false, mensagem });
    assert.equal(c.entrou(), false);
  }
  const s = servidorFalso();
  const c = criarClienteGestao({ fetchImpl: s.fetchImpl });
  for (const r of [await c.criarServico({}), await c.adicionarTexto('servico-a', {}), await c.adicionarLink('servico-a', {}), await c.usarLinkExistente('servico-a', { identidade: {} })]) assert.equal(r.ok, false);
  assert.deepEqual(s.chamadas, []);
});

test('G11. rotas e corpos: servico-com-tema, entradas-texto, links, busca e links-existentes (só a identidade)', async () => {
  const { cliente, chamadas } = await clienteEntrou();
  const novo = await cliente.criarServico({ nome: 'Novo Serviço', tema: { id: 'tema-um' } });
  assert.deepEqual(novo, { ok: true, servico: { id: 'novo-servico', nome: 'Novo Serviço', temaNome: 'Licenciamento' }, temaCriado: false });
  assert.equal((await cliente.adicionarTexto('servico-a', { titulo: 'T', texto: 'x' })).ok, true);
  assert.equal((await cliente.adicionarLink('servico-a', { titulo: 'L' })).ok, true);
  await cliente.buscarLinks('servico-a', '  manual ');
  const item = { identidade: { servicoId: 'servico-b', fonteId: 'fonte-b' }, titulo: 'T', url: 'https://exemplo.test', descricao: 'objeto da fonte', jaNoServico: false };
  assert.equal((await cliente.usarLinkExistente('servico-a', item)).ok, true);
  const posts = chamadas.filter((c) => c.method === 'POST');
  assert.deepEqual(posts.map((c) => c.url), ['/__admin/servico-com-tema', '/__admin/servicos/servico-a/entradas-texto', '/__admin/servicos/servico-a/links', '/__admin/servicos/servico-a/links-existentes/busca', '/__admin/servicos/servico-a/links-existentes']);
  assert.deepEqual(posts[3].corpo, { consulta: 'manual' });
  assert.deepEqual(posts[4].corpo, { servicoId: 'servico-b', fonteId: 'fonte-b' });
  assert.equal((await cliente.adicionarTexto('../x', {})).ok, false);
});

test('G12. clique duplo: com uma gravação em andamento a segunda não é enviada', async () => {
  let abrir;
  const portao = new Promise((r) => { abrir = r; });
  const { cliente, chamadas } = await clienteEntrou({ portao });
  const primeira = cliente.adicionarTexto('servico-a', { titulo: 'T', texto: 'x' });
  await Promise.resolve();
  assert.equal(cliente.gravando(), true);
  const segunda = await cliente.adicionarTexto('servico-a', { titulo: 'T', texto: 'x' });
  assert.deepEqual(segunda, { ok: false, emAndamento: true, mensagem: 'Há outra gravação em andamento, tente de novo.' });
  abrir();
  assert.equal((await primeira).ok, true);
  assert.equal(cliente.gravando(), false);
  assert.equal(chamadas.filter((c) => c.method === 'POST').length, 1);
});

test('G13. erros do servidor viram mensagens e campos; resposta inválida de sucesso não vira sucesso', async () => {
  const url = '/__admin/servicos/servico-a/links';
  const falha = (status, corpo) => ({ [url]: async () => ({ status, json: async () => corpo }) });
  let { cliente } = await clienteEntrou({ respostas: falha(409, { erro: 'ja_existe', campo: 'url' }) });
  let r = await cliente.adicionarLink('servico-a', {});
  assert.equal(r.ok, false);
  assert.equal(r.erros.url, MENSAGENS_GESTAO.urlRepetida);
  ({ cliente } = await clienteEntrou({ respostas: falha(409, { erro: 'operacao_em_andamento' }) }));
  r = await cliente.adicionarLink('servico-a', {});
  assert.equal(r.mensagem, 'Há outra gravação em andamento, tente de novo.');
  ({ cliente } = await clienteEntrou({ respostas: falha(201, { qualquer: 1 }) }));
  assert.equal((await cliente.adicionarLink('servico-a', {})).ok, false);
  ({ cliente } = await clienteEntrou({ respostas: falha(500, {}) }));
  assert.equal(cliente.gravando(), false);
  assert.equal((await cliente.adicionarLink('servico-a', {})).ok, false);
  assert.equal(cliente.gravando(), false, 'a trava é liberada após erro');
});

// ---------- Estrutura, acessibilidade e segurança do código ----------

test('G14. a tela abre com a escolha de usuário (fictício, sem senha) e o botão Acessar administração, sem avisos de demonstração no HTML e com os controles pedidos', () => {
  assert.match(HTML, /<h2 id="titulo-entrada">Área administrativa<\/h2>/);
  assert.match(HTML, />Acessar administração<\/button>/);
  assert.match(HTML, />Sair<\/button>/);
  assert.match(HTML, /class="barra-sessao__quem">Administração<\/p>/);
  assert.doesNotMatch(`${HTML}\n${JS}`, /demonstra|sem autenticação|autenticação real|aviso-demo/i, 'sem textos de demonstração na tela');
  assert.match(HTML, /href="\.\/saude\/">(?:<svg[^>]*><use[^>]*><\/use><\/svg>)?Saúde do sistema<\/a>/);
  assert.match(HTML, /href="\.\/conteudo\/">(?:<svg[^>]*><use[^>]*><\/use><\/svg>)?Conteúdo para respostas<\/a>/);
  assert.doesNotMatch(HTML, /type="password"|name="(usuario|senha|login)"|autocomplete="(username|current-password)"/i);
  assert.match(HTML, /Novo serviço/);
  assert.match(HTML, />Texto<\/button>/);
  assert.match(HTML, />Link<\/button>/);
  assert.doesNotMatch(HTML, /Usar link já cadastrado<\/button>|maneira-existente|Link novo<\/button>/, 'só duas escolhas principais: Texto e Link');
  assert.match(HTML, /Você pode informar um novo endereço ou reutilizar um link já cadastrado\./);
  assert.doesNotMatch(HTML, /id="texto-descricao"|id="texto-orgao"/, 'o cadastro de texto não pede descrição nem órgão');
  assert.match(HTML, /<label for="link-orgao">Órgão que publicou o conteúdo<\/label>/);
  assert.match(HTML, /Informações em elaboração/);
  assert.match(HTML, /list="temas-lista"/);
  assert.equal((HTML.match(/Não escreva dados pessoais/g) ?? []).length >= 2, true, 'aviso nas telas de texto e de link');
});

test('G15. sem radios, assistente, modo avançado, identificadores técnicos nem campos que o servidor define (8B: só a escolha de usuário é um grupo)', () => {
  // 8B: a única exceção é o grupo da escolha de usuário (fieldset com legend; os rádios são montados pelo admin.js).
  const inicioEscolha = HTML.indexOf('<form id="form-entrada"');
  const semEscolha = HTML.slice(0, inicioEscolha) + HTML.slice(HTML.indexOf('</form>', inicioEscolha));
  assert.equal((HTML.match(/<fieldset/g) ?? []).length, 1);
  assert.doesNotMatch(semEscolha, /type="radio"|<fieldset|checkpoint|wizard|avançad|Mais opções|<details/i);
  assert.doesNotMatch(`${HTML}\n${JS}`, /\bv1\b|hashConteudo|statusValidacao|sigla|Identificador|termosEquivalentes/i);
  assert.doesNotMatch(HTML, /revisao/i, 'a revisão aparece só em linguagem comum, sem identificadores técnicos no HTML');
  assert.doesNotMatch(HTML, /name="(id|sigla|descricaoTema|termos[A-Za-z]*|revisao|status[A-Za-z]*|publicado)"/);
  // o formulário de novo serviço tem só dois campos
  const novo = HTML.slice(HTML.indexOf('id="form-novo"'), HTML.indexOf('</form>', HTML.indexOf('id="form-novo"')));
  assert.equal((novo.match(/<(input|select|textarea)\b/g) ?? []).length, 2);
});

test('G16. rótulos, ids únicos, descrições existentes, regiões vivas e erros ligados aos campos', () => {
  const ids = [...HTML.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
  assert.equal(new Set(ids).size, ids.length, 'ids únicos');
  for (const m of HTML.matchAll(/<(input|select|textarea)\b[^>]*\sid="([^"]+)"[^>]*>/g)) {
    assert.match(HTML, new RegExp(`<label for="${m[2]}">`), `label de ${m[2]}`);
    const dependes = /aria-describedby="([^"]+)"/.exec(m[0]);
    if (dependes) for (const ref of dependes[1].split(' ')) assert.ok(ids.includes(ref), `${m[2]} descreve ${ref}`);
  }
  for (const campo of ['novo-nome', 'novo-tema', 'texto-titulo', 'texto-texto', 'link-url', 'link-titulo']) assert.match(HTML, new RegExp(`id="${campo}-erro" class="erro" hidden`));
  assert.match(HTML, /<p id="status" class="status" role="status" aria-live="polite" tabindex="-1"><\/p>/);
  assert.equal((HTML.match(/aria-live="polite"/g) ?? []).length >= 4, true);
  for (const m of HTML.matchAll(/<button\b([^>]*)>/g)) assert.match(m[1], /type="(submit|button)"/);
  for (const id of ['maneira-texto', 'maneira-link']) assert.match(HTML, new RegExp(`id="${id}" aria-expanded="false" aria-controls="painel-`));
  assert.equal((HTML.match(/<h1>/g) ?? []).length, 1);
  assert.match(HTML, /<html lang="pt-BR">/);
  assert.match(HTML, /<a class="pular" href="#principal">/);
  assert.doesNotMatch(HTML, /\son[a-z]+=|<script(?![^>]*\ssrc=)|javascript:|<iframe|style="/i);
});

test('G17. o código não usa innerHTML, armazenamento, cookies, log, eval nem rede própria; nada é gravado ao abrir', () => {
  for (const [nome, texto] of [['admin.js', JS], ['admin-logic.js', LOGICA]]) {
    assert.doesNotMatch(texto, /innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\(|new Function|localStorage|sessionStorage|indexedDB|document\.cookie|console\.|debugger|XMLHttpRequest|WebSocket|sendBeacon/, nome);
  }
  assert.doesNotMatch(JS, /\bfetch\(\s*['"`]/);
  assert.match(JS, /textContent/);
  assert.match(JS, /createElement/);
  assert.deepEqual([...JS.matchAll(/^import [^;]*? from '([^']+)';/gms)].map((m) => m[1]), ['./admin-logic.js']);
  // O token só existe dentro do cliente.
  assert.doesNotMatch(JS, /token/i);
  // Ao abrir, nenhuma chamada: as ações só ficam ligadas a botões e formulários.
  const aoAbrir = JS.split('\n').filter((l) => /^(await |cliente\.|entrar\(|carregar)/.test(l));
  assert.deepEqual(aoAbrir, []);
  // Todas as gravações passam pelo cliente, depois de validar e com o botão desabilitado.
  for (const chamada of ['criarServico', 'adicionarTexto', 'adicionarLink', 'usarLinkExistente']) assert.equal((JS.match(new RegExp(`cliente\\.${chamada}\\(`, 'g')) ?? []).length, 1, chamada);
  assert.equal((JS.match(/marcarOcupado\(/g) ?? []).length >= 6, true);
  assert.equal((JS.match(/if \(ocupado/g) ?? []).length >= 8, true, 'cada ação confere a trava de clique duplo');
  assert.doesNotMatch(LOGICA, /new Date\(|Date\.now|\bwindow\b/);
});

test('G18. foco visível, tela estreita, alvos de toque e hidden tratado só onde o display é definido', () => {
  assert.match(CSS, /:focus-visible\s*\{[^}]*outline: 3px solid/);
  assert.match(CSS, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(CSS, /@media \(max-width: 30rem\)/);
  assert.match(CSS, /overflow-x: hidden/);
  assert.match(CSS, /overflow-wrap: anywhere/);
  assert.match(CSS, /min-height: 2\.75rem/);
  assert.match(CSS, /\.introducao\[hidden\]/);
  assert.match(CSS, /\.painel\[hidden\]/);
  assert.doesNotMatch(CSS, /\[hidden\]\s*\{\s*display:\s*none\s*!important/);
});

test('G19. a pasta admin/ tem a estrutura final, o chat não conhece a administração e o build não a inclui', () => {
  assert.deepEqual(fs.readdirSync(path.join(RAIZ, 'admin')).sort(), ['admin-logic.js', 'admin.js', 'conteudo', 'index.html', 'saude', 'styles.css']);
  for (const arquivo of ['index.html', 'src/main.js', 'src/chat.js', 'src/assistant.js', 'src/styles.css']) {
    assert.doesNotMatch(lerTexto(arquivo), /__admin|admin-logic|X-Admin-Token|servico-com-tema|entradas-texto|links-existentes/, arquivo);
  }
  assert.doesNotMatch(lerTexto('vite.config.js'), /admin\/cadastro/);
  if (fs.existsSync(path.join(RAIZ, 'dist'))) {
    const lista = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? lista(path.join(d, e.name)) : [path.join(d, e.name)]));
    for (const f of lista(path.join(RAIZ, 'dist'))) {
      assert.doesNotMatch(fs.readFileSync(f, 'utf8'), /Entrar como servidor de demonstração|servico-com-tema|criarClienteGestao|links-existentes/, f);
    }
  }
});

test('G20. este arquivo não grava nada em disco', () => {
  const corpo = lerTexto('tests', 'admin-gestao-interface.test.js').split('\n').filter((l) => !/assert\./.test(l)).join('\n');
  assert.doesNotMatch(corpo, /writeFileSync|appendFileSync|mkdirSync|rmSync|renameSync|unlinkSync|copyFileSync|cpSync/);
});
