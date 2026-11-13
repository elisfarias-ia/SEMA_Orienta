// Interface "Gestão de conteúdo" (Marco 7, Passo 7E2): lógica pura e cliente com fetch simulado, estrutura de
// acessibilidade, ausência de APIs inseguras e isolamento do build. Dados fictícios; nada é gravado e a rede não é usada.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  LIMITES, ROTAS, CABECALHO_TOKEN, normalizar, parseTermos, validarFormAssunto, validarFormServico, corpoDoAssunto, corpoDoServico,
  resumoDoAssunto, resumoDoServico, agruparCatalogo, catalogoValido, rotuloEstado, rotuloPublicacao, mensagemDeErro, MENSAGENS, criarClienteAdmin,
} from '../admin/admin-logic.js';
import config from '../vite.config.js';
import { conferirDist, NOMES_ADMINISTRATIVOS } from '../scripts/check-dist.js';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lerTexto = (...p) => fs.readFileSync(path.join(RAIZ, ...p), 'utf8');
const lerJson = (...p) => JSON.parse(lerTexto(...p));
const HTML = lerTexto('admin', 'index.html');
const CSS = lerTexto('admin', 'styles.css');
const JS = lerTexto('admin', 'admin.js');
const LOGICA = lerTexto('admin', 'admin-logic.js');
const TOKEN = 'ab'.repeat(32);

// ---------- Servidor simulado (nenhuma rede) ----------

const identificador = (nome) => nome.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
function servidorFalso({ assuntos, servicos, estados = {}, token = TOKEN, portao = null, respostas = {} } = {}) {
  const estado = {
    assuntos: assuntos ?? [{ id: 'assunto-ficticio', nome: 'Assunto Fictício', descricao: 'Descrição fictícia.', ativo: true, criadoEm: '2026-11-10', atualizadoEm: '2026-11-10' }],
    servicos: servicos ?? [{ id: 'servico-ficticio', assuntoId: 'assunto-ficticio', nome: 'Serviço Fictício', sigla: 'SF', versaoAtualId: 'servico-ficticio-v1', versaoPublicadaId: null, statusValidacao: 'rascunho', publicado: false }],
  };
  const chamadas = [];
  const resposta = (status, corpo) => ({ status, json: async () => corpo });
  const fetchImpl = async (url, opcoes = {}) => {
    chamadas.push({ url, ...opcoes, corpo: opcoes.body === undefined ? undefined : JSON.parse(opcoes.body) });
    if (respostas[url]) return respostas[url](opcoes);
    if (url === ROTAS.sessao) return resposta(200, { token });
    if (opcoes.headers?.[CABECALHO_TOKEN] !== token) return resposta(401, { erro: 'nao_autorizado' });
    if (url === ROTAS.catalogo && opcoes.method === 'GET') return resposta(200, { assuntos: estado.assuntos, servicos: estado.servicos });
    const m = /^\/__admin\/servicos\/([^/]+)\/versao-atual$/.exec(url);
    if (m && opcoes.method === 'GET') return resposta(200, { manifesto: { estado: estados[decodeURIComponent(m[1])] ?? 'rascunho' } });
    if (portao) await portao;
    if (url === ROTAS.assuntos && opcoes.method === 'POST') {
      const c = JSON.parse(opcoes.body);
      const a = { id: identificador(c.nome), ...c, ativo: true, criadoEm: '2026-11-10', atualizadoEm: '2026-11-10' };
      estado.assuntos.push(a);
      return resposta(201, { assunto: a });
    }
    if (url === ROTAS.servicos && opcoes.method === 'POST') {
      const c = JSON.parse(opcoes.body);
      const novoId = identificador(c.nome);
      const s = { id: novoId, assuntoId: c.assuntoId, nome: c.nome, sigla: c.sigla ?? 'PENDENTE', versaoAtualId: `${novoId}-v1`, versaoPublicadaId: null, statusValidacao: 'rascunho', publicado: false };
      estado.servicos.push(s);
      return resposta(201, { servico: { ...s, estado: 'rascunho' } });
    }
    return resposta(404, { erro: 'nao_encontrado' });
  };
  return { fetchImpl, chamadas, estado };
}
async function clienteComSessao(opcoes) {
  const s = servidorFalso(opcoes);
  const cliente = criarClienteAdmin({ fetchImpl: s.fetchImpl });
  assert.deepEqual(await cliente.iniciarSessao(), { ok: true });
  return { cliente, ...s };
}
const assuntosAtivos = [{ id: 'assunto-ficticio', nome: 'Assunto Fictício', ativo: true }, { id: 'inativo-ficticio', nome: 'Inativo', ativo: false }];

// ---------- Token e sessão ----------

test('AI1. o token vem de /__admin/sessao, é enviado em X-Admin-Token e nunca é exposto', async () => {
  const { cliente, chamadas } = await clienteComSessao();
  assert.equal(cliente.sessaoPronta(), true);
  assert.equal(chamadas[0].url, ROTAS.sessao);
  assert.equal(chamadas[0].headers[CABECALHO_TOKEN], undefined, 'a chamada de sessão não leva token');
  const catalogo = await cliente.carregarCatalogo();
  const cadastro = await cliente.cadastrar('assunto', { nome: 'Novo Fictício', descricao: 'Descrição.' });
  assert.equal(catalogo.ok && cadastro.ok, true);
  for (const c of chamadas.slice(1)) {
    assert.equal(c.headers[CABECALHO_TOKEN], TOKEN, c.url);
    assert.equal(c.cache, 'no-store');
    assert.equal(c.credentials, 'omit');
    assert.equal(c.headers.Accept, 'application/json');
  }
  // O token não aparece em nada que o cliente devolve ou expõe.
  assert.equal(JSON.stringify(cliente).includes(TOKEN), false);
  assert.equal(Object.keys(cliente).some((k) => /token/i.test(k)), false);
  assert.equal(JSON.stringify([catalogo, cadastro]).includes(TOKEN), false);
});

test('AI2. sem sessão não há chamadas protegidas nem gravação; falhas da sessão geram mensagem curta', async () => {
  const s = servidorFalso();
  const cliente = criarClienteAdmin({ fetchImpl: s.fetchImpl });
  assert.equal(cliente.sessaoPronta(), false);
  assert.deepEqual(await cliente.carregarCatalogo(), { ok: false, mensagem: MENSAGENS.sessao });
  assert.deepEqual(await cliente.cadastrar('assunto', {}), { ok: false, mensagem: MENSAGENS.sessao });
  assert.deepEqual(s.chamadas, [], 'nenhuma requisição foi feita');
  const casos = [
    [async () => ({ status: 403, json: async () => ({ erro: 'acesso_somente_local' }) }), mensagemDeErro(403, {})],
    [async () => ({ status: 500, json: async () => ({ erro: 'indisponivel' }) }), MENSAGENS.sessao],
    [async () => ({ status: 200, json: async () => ({ token: 'curto' }) }), MENSAGENS.sessao],
    [async () => ({ status: 200, json: async () => ({}) }), MENSAGENS.sessao],
    [async () => ({ status: 200, json: async () => { throw new Error('json'); } }), MENSAGENS.sessao],
    [async () => { throw new Error('rede'); }, MENSAGENS.rede],
  ];
  for (const [fetchImpl, mensagem] of casos) {
    const c = criarClienteAdmin({ fetchImpl });
    assert.deepEqual(await c.iniciarSessao(), { ok: false, mensagem });
    assert.equal(c.sessaoPronta(), false);
    assert.deepEqual(await c.cadastrar('assunto', {}), { ok: false, mensagem: MENSAGENS.sessao });
  }
});

// ---------- Catálogo ----------

test('AI3. o catálogo é carregado e agrupado por assunto, só com nome, descrição, sigla, situação e publicação (sem ids nem versões)', async () => {
  const { cliente, chamadas } = await clienteComSessao({
    assuntos: [{ id: 'a-um', nome: 'Assunto Um', descricao: 'D1', ativo: true }, { id: 'a-dois', nome: 'Assunto Dois', descricao: 'D2', ativo: false }],
    servicos: [
      { id: 's-1', assuntoId: 'a-um', nome: 'Serviço 1', sigla: 'S1', versaoAtualId: 's-1-v1', versaoPublicadaId: null },
      { id: 's-2', assuntoId: 'a-um', nome: 'Serviço 2', sigla: 'PENDENTE', versaoAtualId: 's-2-v3', versaoPublicadaId: 's-2-v2' },
      { id: 's-3', assuntoId: 'sem-assunto', nome: 'Serviço 3', sigla: null, versaoAtualId: 's-3-v1', versaoPublicadaId: null },
    ],
    estados: { 's-1': 'rascunho', 's-2': 'em_validacao' },
  });
  const r = await cliente.carregarCatalogo();
  assert.equal(r.ok, true);
  assert.deepEqual(r.estados, { 's-1': 'rascunho', 's-2': 'em_validacao', 's-3': 'rascunho' });
  const grupos = agruparCatalogo(r.catalogo, r.estados);
  assert.deepEqual(grupos.map((g) => g.assunto && g.assunto.nome), ['Assunto Um', 'Assunto Dois', null]);
  assert.deepEqual(grupos[0].servicos, [
    { nome: 'Serviço 1', sigla: 'S1', situacao: 'Rascunho', publicacao: 'Não publicado' },
    { nome: 'Serviço 2', sigla: null, situacao: 'Em análise', publicacao: 'Publicado' },
  ]);
  assert.deepEqual(grupos[0].assunto, { nome: 'Assunto Um', descricao: 'D1', ativo: true });
  assert.deepEqual(grupos[1].servicos, []);
  assert.equal(grupos[1].assunto.ativo, false);
  assert.deepEqual(grupos[2].servicos.map((s) => s.nome), ['Serviço 3']);
  assert.doesNotMatch(JSON.stringify(grupos), /s-1|s-2|s-3|a-um|a-dois|-v1|-v2|-v3|sem-assunto/, 'nenhum id nem versão sai do catálogo de exibição');
  assert.equal(chamadas.filter((c) => /versao-atual$/.test(c.url)).length, 3, 'uma consulta de estado por serviço');
  assert.ok(chamadas.every((c) => c.method === 'GET' || c.method === undefined || c.method === 'POST'));
});

test('AI4. estado indisponível, catálogo inválido e falhas do catálogo viram mensagens, sem detalhes internos', async () => {
  const { cliente } = await clienteComSessao({ respostas: { '/__admin/servicos/servico-ficticio/versao-atual': async () => ({ status: 500, json: async () => ({ erro: 'indisponivel' }) }) } });
  const r = await cliente.carregarCatalogo();
  assert.equal(r.ok, true);
  assert.equal(r.estados['servico-ficticio'], null);
  assert.equal(agruparCatalogo(r.catalogo, r.estados)[0].servicos[0].situacao, 'Estado indisponível');
  for (const [fetchImpl, mensagem] of [
    [async () => ({ status: 200, json: async () => ({ assuntos: 'x', servicos: [] }) }), MENSAGENS.catalogo],
    [async () => ({ status: 500, json: async () => ({ erro: 'indisponivel' }) }), MENSAGENS.catalogo],
    [async () => ({ status: 401, json: async () => ({ erro: 'nao_autorizado' }) }), mensagemDeErro(401, {})],
    [async () => { throw new Error('rede'); }, MENSAGENS.rede],
  ]) {
    const s = servidorFalso({ respostas: { [ROTAS.catalogo]: fetchImpl } });
    const c = criarClienteAdmin({ fetchImpl: s.fetchImpl });
    await c.iniciarSessao();
    assert.deepEqual(await c.carregarCatalogo(), { ok: false, mensagem });
  }
  assert.equal(catalogoValido({ assuntos: [], servicos: [] }), true);
  assert.equal(catalogoValido(null), false);
  assert.equal(catalogoValido({ assuntos: [{}], servicos: [] }), false);
  assert.equal(rotuloEstado('inexistente'), 'Estado indisponível');
  assert.equal(rotuloEstado('__proto__'), 'Estado indisponível');
  assert.equal(rotuloPublicacao(null), 'Não publicado');
  assert.equal(rotuloPublicacao('x-v2'), 'Publicado');
  assert.deepEqual(agruparCatalogo(null), []);
});

// ---------- Formulários ----------

test('AI5. termos equivalentes: um por linha, sem espaços extras nem linhas vazias', () => {
  assert.deepEqual(parseTermos('um\ndois\r\n  três   termos  \n\n   \nquatro'), ['um', 'dois', 'três termos', 'quatro']);
  assert.deepEqual(parseTermos(''), []);
  assert.deepEqual(parseTermos(undefined), []);
  assert.deepEqual(parseTermos(5), []);
  assert.equal(normalizar('  Ação   Ambiental '), 'acao ambiental');
});

test('AI6. validação do formulário de assunto: só nome e descrição, formato, limites e dados pessoais', () => {
  const ok = validarFormAssunto({ nome: '  Nome   Fictício ', descricao: ' Descrição fictícia. ' });
  assert.deepEqual(ok, { ok: true, dados: { nome: 'Nome Fictício', descricao: 'Descrição fictícia.' } });
  const erros = (v) => validarFormAssunto(v).erros;
  assert.deepEqual(Object.keys(erros({})).sort(), ['descricao', 'nome']);
  assert.match(erros({ nome: '   ', descricao: 'D' }).nome, /Preencha o nome/);
  assert.match(erros({ nome: '123', descricao: 'D' }).nome, /ao menos uma letra/);
  assert.match(erros({ nome: '!!! ---', descricao: 'D' }).nome, /ao menos uma letra/);
  assert.equal(validarFormAssunto({ nome: '2ª Via', descricao: 'D' }).ok, true);
  assert.match(erros({ nome: 'x'.repeat(LIMITES.nome + 1), descricao: 'D' }).nome, /máximo 120/);
  assert.match(erros({ nome: 'N', descricao: 'd'.repeat(LIMITES.descricao + 1) }).descricao, /máximo 1000/);
  assert.match(erros({ nome: 'N', descricao: 'linha\ninvalida' }).descricao, /não permitidos/);
  assert.match(erros({ nome: 'N', descricao: `Contato ${['pessoa', 'exemplo.test'].join('@')}` }).descricao, /e-mail/);
  assert.match(erros({ nome: 'N', descricao: `Ligue ${['(65)', '99999-0000'].join(' ')}` }).descricao, /telefone/);
  assert.deepEqual(Object.keys(validarFormAssunto(null).erros).sort(), ['descricao', 'nome']);
  // Um id digitado (ou colado) é ignorado: o formulário não tem esse campo e os dados não o carregam.
  assert.equal('id' in validarFormAssunto({ id: 'meu-id', nome: 'N', descricao: 'D' }).dados, false);
});

test('AI7. validação do formulário de serviço: assunto ativo, nome, sigla opcional e termos', () => {
  const base = { assuntoId: 'assunto-ficticio', nome: 'Serviço Novo', sigla: '', termosEquivalentes: 'primeiro termo\nSegundo Termo' };
  const ok = validarFormServico(base, assuntosAtivos);
  assert.deepEqual(ok, { ok: true, dados: { assuntoId: 'assunto-ficticio', nome: 'Serviço Novo', sigla: null, termosEquivalentes: ['primeiro termo', 'Segundo Termo'] } });
  assert.equal(validarFormServico({ ...base, sigla: ' SN ' }, assuntosAtivos).dados.sigla, 'SN');
  const erros = (v) => validarFormServico({ ...base, ...v }, assuntosAtivos).erros;
  assert.match(erros({ assuntoId: '' }).assuntoId, /Escolha o assunto/);
  assert.match(erros({ assuntoId: 'inexistente' }).assuntoId, /existente e ativo/);
  assert.match(erros({ assuntoId: 'inativo-ficticio' }).assuntoId, /existente e ativo/);
  assert.match(erros({ nome: '' }).nome, /Preencha o nome/);
  assert.match(erros({ nome: '123' }).nome, /ao menos uma letra/);
  assert.equal('id' in validarFormServico({ ...base, id: 'meu-id' }, assuntosAtivos).dados, false);
  assert.match(erros({ sigla: 'x'.repeat(21) }).sigla, /sigla/);
  assert.match(erros({ sigla: ['a', 'b.cc'].join('@') }).sigla, /sigla/);
  assert.match(erros({ termosEquivalentes: '  \n \n' }).termosEquivalentes, /ao menos um/);
  assert.match(erros({ termosEquivalentes: 'Ação\nacao' }).termosEquivalentes, /repetidos/);
  assert.match(erros({ termosEquivalentes: Array.from({ length: LIMITES.termos + 1 }, (_, i) => `termo ${i}`).join('\n') }).termosEquivalentes, /no máximo 20/);
  assert.match(erros({ termosEquivalentes: 'x'.repeat(LIMITES.termo + 1) }).termosEquivalentes, /no máximo 120/);
  assert.match(erros({ termosEquivalentes: `contato ${['pessoa', 'exemplo.test'].join('@')}` }).termosEquivalentes, /e-mail/);
  assert.equal(validarFormServico(base, null).ok, false);
  assert.equal(validarFormServico(null, assuntosAtivos).ok, false);
});

test('AI8. o corpo enviado tem somente os campos permitidos, nunca o id (sigla só quando informada), e o resumo não traz id nem token', () => {
  assert.deepEqual(corpoDoAssunto({ id: 'a', nome: 'N', descricao: 'D', ativo: false, publicado: true }), { nome: 'N', descricao: 'D' });
  const dados = { assuntoId: 'x', id: 'y', nome: 'Z', sigla: null, termosEquivalentes: ['t'], publicado: true, estado: 'publicado' };
  assert.deepEqual(corpoDoServico(dados), { assuntoId: 'x', nome: 'Z', termosEquivalentes: ['t'] });
  assert.deepEqual(corpoDoServico({ ...dados, sigla: 'S' }), { assuntoId: 'x', nome: 'Z', termosEquivalentes: ['t'], sigla: 'S' });
  const resumoA = resumoDoAssunto({ id: 'a', nome: 'N', descricao: 'D' });
  assert.deepEqual(resumoA, [{ rotulo: 'Nome', valor: 'N' }, { rotulo: 'Descrição', valor: 'D' }]);
  const resumoS = resumoDoServico({ ...dados, sigla: null, termosEquivalentes: ['um', 'dois'] }, [{ id: 'x', nome: 'Assunto X' }]);
  assert.deepEqual(resumoS.map((l) => l.rotulo), ['Assunto', 'Nome', 'Sigla', 'Termos equivalentes', 'Situação inicial']);
  assert.equal(resumoS[0].valor, 'Assunto X');
  assert.match(resumoS[2].valor, /PENDENTE/);
  assert.equal(resumoS[3].valor, 'um; dois');
  assert.match(resumoS[4].valor, /Rascunho.*não publicado/);
  const texto = JSON.stringify([resumoA, resumoS]);
  assert.equal(texto.includes(TOKEN), false);
  assert.doesNotMatch(texto, /Identificador|"y"|\(x\)/, 'nenhum id técnico no painel de confirmação');
});

// ---------- Confirmação, duplicidade, sucesso e erros ----------

test('AI9. nada é gravado sem confirmação: validar e resumir não chamam o endpoint, e Voltar descarta os dados', async () => {
  const { cliente, chamadas } = await clienteComSessao();
  const antes = chamadas.length;
  const r = validarFormAssunto({ nome: 'Novo Fictício', descricao: 'Descrição.' });
  resumoDoAssunto(r.dados);
  assert.equal(chamadas.length, antes, 'validar e resumir não fazem requisição');
  assert.equal(chamadas.some((c) => c.method === 'POST'), false, '"Voltar" não grava');
  // O código da tela só grava dentro da confirmação, acionada pelo botão "Confirmar cadastro".
  assert.equal((JS.match(/cliente\.cadastrar\(/g) ?? []).length, 1);
  assert.match(JS, /async function confirmar\(\)[\s\S]*?cliente\.cadastrar\([\s\S]*?\n\}/);
  assert.match(JS, /botaoConfirmar\.addEventListener\('click', confirmar\)/);
  assert.match(JS, /botaoVoltar\.addEventListener\('click', fecharConfirmacao\)/);
  assert.equal((JS.match(/function confirmar\(/g) ?? []).length, 1, 'confirmar é definida uma única vez');
  // Depois de confirmar, grava uma vez.
  const g = await cliente.cadastrar('assunto', corpoDoAssunto(r.dados));
  assert.equal(g.ok, true);
  assert.equal(chamadas.filter((c) => c.method === 'POST').length, 1);
});

test('AI10. envio duplicado é bloqueado enquanto há gravação em andamento e liberado ao fim, com sucesso ou falha', async () => {
  let abrir;
  const portao = new Promise((r) => { abrir = r; });
  const { cliente, chamadas } = await clienteComSessao({ portao });
  const corpo = { nome: 'Novo Fictício', descricao: 'Descrição.' };
  const primeira = cliente.cadastrar('assunto', corpo);
  await Promise.resolve();
  assert.equal(cliente.gravando(), true);
  const segunda = await cliente.cadastrar('assunto', { ...corpo, nome: 'Outro' });
  assert.deepEqual(segunda, { ok: false, emAndamento: true, mensagem: MENSAGENS.emAndamento });
  assert.equal(chamadas.filter((c) => c.method === 'POST').length, 1, 'só um POST foi enviado');
  abrir();
  assert.equal((await primeira).ok, true);
  assert.equal(cliente.gravando(), false);
  assert.equal((await cliente.cadastrar('assunto', { ...corpo, nome: 'Terceiro' })).ok, true);
  // Liberação também após falha de rede e após erro do servidor.
  const falha = criarClienteAdmin({ fetchImpl: async (url, o) => { if (url === ROTAS.sessao) return { status: 200, json: async () => ({ token: TOKEN }) }; throw new Error('rede'); } });
  await falha.iniciarSessao();
  assert.deepEqual(await falha.cadastrar('assunto', corpo), { ok: false, mensagem: MENSAGENS.rede });
  assert.equal(falha.gravando(), false);
});

test('AI11. a requisição de cadastro é um POST JSON para a rota certa, com o token e somente os dados do formulário', async () => {
  const { cliente, chamadas } = await clienteComSessao();
  await cliente.cadastrar('servico', corpoDoServico({ assuntoId: 'assunto-ficticio', nome: 'Novo', sigla: null, termosEquivalentes: ['um'] }));
  await cliente.cadastrar('assunto', corpoDoAssunto({ nome: 'Outro', descricao: 'D' }));
  const posts = chamadas.filter((c) => c.method === 'POST');
  assert.deepEqual(posts.map((p) => p.url), [ROTAS.servicos, ROTAS.assuntos]);
  for (const p of posts) {
    assert.equal(p.headers['Content-Type'], 'application/json');
    assert.equal(p.headers[CABECALHO_TOKEN], TOKEN);
    assert.equal(p.body.includes(TOKEN), false, 'o token não vai no corpo');
  }
  assert.deepEqual(posts[0].corpo, { assuntoId: 'assunto-ficticio', nome: 'Novo', termosEquivalentes: ['um'] });
  for (const p of posts) assert.equal('id' in p.corpo, false, 'o cliente nunca envia id');
  assert.deepEqual((await cliente.cadastrar('tipo-invalido', {})), { ok: false, mensagem: MENSAGENS.generica });
  assert.equal(chamadas.filter((c) => c.method === 'POST').length, 2);
});

test('AI12. códigos do endpoint viram mensagens curtas em português, sem repetir texto bruto da resposta', async () => {
  const casos = [
    [401, { erro: 'nao_autorizado' }, /sessão administrativa/],
    [403, { erro: 'acesso_somente_local' }, /neste computador/],
    [409, { erro: 'ja_existe', campo: 'id' }, /identificador/],
    [409, { erro: 'ja_existe', campo: 'nome' }, /Já existe um item com este nome/],
    [409, { erro: 'operacao_em_andamento' }, /em andamento/],
    [413, { erro: 'corpo_grande_demais' }, /grandes demais/],
    [415, { erro: 'tipo_nao_suportado' }, /formato/],
    [422, { erro: 'dados_invalidos', campos: ['assuntoId'] }, /assunto escolhido/],
    [422, { erro: 'dados_invalidos', campos: ['extras'] }, /não são permitidos/],
    [422, { erro: 'dados_invalidos', campos: ['id', 'termosEquivalentes'] }, /identificador, termos equivalentes/],
    [422, { erro: 'dados_invalidos' }, /Revise os dados/],
    [400, { erro: 'requisicao_invalida' }, /não puderam ser lidos/],
    [500, { erro: 'indisponivel' }, /Nada foi alterado/],
  ];
  for (const [status, corpo, padrao] of casos) {
    const mensagem = mensagemDeErro(status, corpo);
    assert.match(mensagem, padrao, `${status}`);
    assert.doesNotMatch(mensagem, /ja_existe|dados_invalidos|requisicao_invalida|nao_autorizado|indisponivel|extras\b/);
    const s = servidorFalso({ respostas: { [ROTAS.assuntos]: async () => ({ status, json: async () => corpo }) } });
    const c = criarClienteAdmin({ fetchImpl: s.fetchImpl });
    await c.iniciarSessao();
    assert.deepEqual(await c.cadastrar('assunto', { nome: 'A', descricao: 'D' }), { ok: false, mensagem });
  }
  // Texto hostil na resposta nunca chega à mensagem; status desconhecido é genérico.
  const hostil = { erro: '<img src=x onerror=alert(1)> SEGREDO-INTERNO /caminho/secreto', campo: '<script>x</script>', campos: ['<b>SEGREDO-INTERNO</b>', 'id'] };
  for (const status of [400, 409, 422, 500, 418, 502]) {
    const m = mensagemDeErro(status, hostil);
    assert.doesNotMatch(m, /SEGREDO|<|caminho|script/);
  }
  assert.equal(mensagemDeErro(418, {}), MENSAGENS.generica);
  assert.equal(mensagemDeErro(500, null), mensagemDeErro(500, undefined));
});

test('AI13. sucesso: devolve só id e nome do item e o catálogo recarregado passa a mostrar o novo item', async () => {
  const { cliente, estado } = await clienteComSessao();
  const a = await cliente.cadastrar('assunto', { nome: 'Novo Assunto', descricao: 'Descrição.' });
  assert.deepEqual(a, { ok: true, item: { id: 'novo-assunto', nome: 'Novo Assunto' } });
  const s = await cliente.cadastrar('servico', { assuntoId: 'novo-assunto', nome: 'Novo Serviço', termosEquivalentes: ['novo'] });
  assert.deepEqual(s, { ok: true, item: { id: 'novo-servico', nome: 'Novo Serviço' } });
  const r = await cliente.carregarCatalogo();
  const grupos = agruparCatalogo(r.catalogo, r.estados);
  assert.deepEqual(grupos.map((g) => g.assunto.nome), ['Assunto Fictício', 'Novo Assunto']);
  assert.deepEqual(grupos[1].servicos, [{ nome: 'Novo Serviço', sigla: null, situacao: 'Rascunho', publicacao: 'Não publicado' }]);
  assert.equal(estado.servicos.length, 2);
  // Resposta 201 sem o item esperado é tratada como falha genérica, não como sucesso.
  const sem = servidorFalso({ respostas: { [ROTAS.assuntos]: async () => ({ status: 201, json: async () => ({}) }) } });
  const c = criarClienteAdmin({ fetchImpl: sem.fetchImpl });
  await c.iniciarSessao();
  assert.equal((await c.cadastrar('assunto', {})).ok, false);
});

// ---------- Código seguro ----------

test('AI14. os arquivos da interface não usam innerHTML, armazenamento do navegador, cookies, log, eval nem outros métodos além de GET e POST', () => {
  for (const [nome, texto] of [['admin.js', JS], ['admin-logic.js', LOGICA]]) {
    assert.doesNotMatch(texto, /innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\(|new Function|setTimeout\(\s*['"`]/, nome);
    assert.doesNotMatch(texto, /localStorage|sessionStorage|indexedDB|document\.cookie|caches\.|navigator\.serviceWorker/, nome);
    assert.doesNotMatch(texto, /console\.|debugger/, nome);
    assert.doesNotMatch(texto, /['"`](PUT|PATCH|DELETE)['"`]/, nome);
    assert.doesNotMatch(texto, /XMLHttpRequest|WebSocket|sendBeacon|EventSource/, nome);
  }
  assert.match(JS, /textContent/);
  assert.match(JS, /document\.createElement/);
  assert.match(JS, /replaceChildren/);
  assert.deepEqual([...JS.matchAll(/^import [^;]*? from '([^']+)';/gms)].map((m) => m[1]), ['./admin-logic.js']);
  assert.deepEqual([...LOGICA.matchAll(/^import /gm)], []);
  assert.doesNotMatch(LOGICA, /\bdocument\b|\bwindow\b|\blocation\b|Date\.now|new Date\(|Math\.random/);
  // Só as quatro rotas administrativas são usadas.
  const rotas = new Set([...LOGICA.matchAll(/['"`](\/__admin\/[^'"`]*)['"`]/g)].map((m) => m[1]));
  assert.deepEqual([...rotas].sort(), ['/__admin/assuntos', '/__admin/catalogo', '/__admin/saude', '/__admin/servicos', '/__admin/sessao']);
  assert.match(LOGICA, /`\$\{ROTAS\.servicos\}\/\$\{encodeURIComponent\(s\.id\)\}\/versao-atual`/);
});

test('AI15. a tela só cadastra: sem edição, exclusão, validação, decisão ou publicação', () => {
  const todos = `${HTML}\n${JS}\n${LOGICA}`;
  assert.doesNotMatch(todos, /\b(Editar|Excluir|Apagar|Remover)\b/);
  assert.doesNotMatch(todos, /Publicar|Autorizar|Validar conteúdo|Enviar para validação|decis[ãa]o/i);
  assert.doesNotMatch(LOGICA, /versao-atual['"`]\s*,\s*['"`](POST|PUT)/);
  assert.equal((LOGICA.match(/'POST'/g) ?? []).length, 1, 'um único ponto de envio POST');
});

// ---------- HTML e acessibilidade estrutural ----------

test('AI16. título, identidade e aviso exigidos, sem vocabulário proibido', () => {
  assert.match(HTML, /<title>SEMA Orienta — Gestão de conteúdo<\/title>/);
  assert.match(HTML, /<h1>SEMA Orienta — Gestão de conteúdo<\/h1>/);
  assert.match(HTML, /<p class="aviso-admin" role="note">Ambiente administrativo local — sem autenticação<\/p>/);
  assert.match(HTML, /<html lang="pt-BR">/);
  assert.match(HTML, /<meta name="viewport" content="width=device-width, initial-scale=1" \/>/);
  assert.match(HTML, /<meta name="robots" content="noindex, nofollow" \/>/);
  for (const [nome, texto] of [['index.html', HTML], ['styles.css', CSS], ['admin.js', JS], ['admin-logic.js', LOGICA]]) {
    assert.doesNotMatch(texto, /MVP|acad[êe]mic|\bcurso\b|prot[óo]tipo|prototipo|\bMarco\b/i, nome);
  }
  assert.match(CSS, /--verde-800: #166534/);
});

test('AI17. rótulos associados, ids únicos, descrições existentes, status ao vivo e diálogo acessível', () => {
  const ids = [...HTML.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
  assert.equal(new Set(ids).size, ids.length, 'ids únicos');
  const controles = [...HTML.matchAll(/<(input|select|textarea)\b[^>]*\sid="([^"]+)"[^>]*>/g)].map((m) => m[2]);
  assert.deepEqual(controles.sort(), ['assunto-descricao', 'assunto-nome', 'fonte-data', 'fonte-descricao', 'fonte-dispositivo', 'fonte-id', 'fonte-oficial', 'fonte-orgao', 'fonte-tipo', 'fonte-titulo', 'fonte-url', 'fontes-servico', 'servico-assunto', 'servico-nome', 'servico-sigla', 'servico-termos']);
  for (const id of controles) assert.match(HTML, new RegExp(`<label for="${id}">`), `label de ${id}`);
  for (const m of HTML.matchAll(/aria-(?:describedby|labelledby)="([^"]+)"/g)) {
    for (const ref of m[1].split(' ')) assert.ok(ids.includes(ref), `aria referencia ${ref}`);
  }
  assert.match(HTML, /<p id="status" class="status" role="status" aria-live="polite" tabindex="-1"><\/p>/);
  for (const id of controles.filter((c) => c !== 'fontes-servico')) assert.match(HTML, new RegExp(`id="${id}-erro"[^>]*hidden`), `erro de ${id}`);
  assert.match(HTML, /<dialog id="confirmacao" class="dialogo" aria-labelledby="confirmacao-titulo" aria-describedby="confirmacao-descricao">/);
  assert.match(HTML, />Voltar<\/button>/);
  assert.match(HTML, />Confirmar cadastro<\/button>/);
  assert.equal((HTML.match(/<button\b/g) ?? []).length, 5);
  for (const m of HTML.matchAll(/<button\b([^>]*)>/g)) assert.match(m[1], /type="(submit|button)"/);
  assert.equal((HTML.match(/<form\b[^>]*novalidate/g) ?? []).length, 3);
  assert.match(HTML, /id="fonte-enviar" disabled/);
  assert.match(HTML, /id="assunto-enviar" disabled/);
  assert.match(HTML, /id="servico-enviar" disabled/);
  assert.match(HTML, /<main id="principal"/);
  assert.match(HTML, /<a class="pular" href="#principal">/);
  assert.equal((HTML.match(/<h1>/g) ?? []).length, 1);
  assert.doesNotMatch(HTML, /\son[a-z]+=|<script(?![^>]*\ssrc=)|javascript:|<iframe|<object|<embed|style="/i);
  assert.match(HTML, /<script type="module" src="\.\/admin\.js"><\/script>/);
  assert.match(HTML, /aria-busy="true"/);
});

test('AI18. foco e foco visível, teclado, rolagem horizontal, tela estreita e movimento reduzido', () => {
  assert.match(CSS, /:focus-visible\s*\{[^}]*outline: 3px solid/);
  assert.match(CSS, /@media \(prefers-reduced-motion: reduce\)[\s\S]*transition: none !important[\s\S]*animation: none !important/);
  assert.match(CSS, /@media \(max-width: 30rem\)/);
  assert.match(CSS, /@media \(min-width: 48rem\)/);
  assert.match(CSS, /overflow-x: hidden/);
  assert.match(CSS, /overflow-wrap: anywhere/);
  assert.match(CSS, /max-width: 100%/);
  assert.match(CSS, /min-height: 2\.75rem/, 'alvos de toque confortáveis');
  assert.match(CSS, /width: min\(32rem, calc\(100vw - 2rem\)\)/, 'o diálogo cabe em 390 px');
  assert.match(CSS, /\.erro\[hidden\]\s*\{\s*display: none/);
  assert.doesNotMatch(CSS, /outline:\s*none(?!;?\s*\}\s*\.status:focus)/.source ? /outline:\s*0\b/ : /x^/);
  for (const chamada of [/status\.focus\(\)/, /primeiro\.focus\(\)/, /botaoVoltar\.focus\(\)/, /pendente\.gatilho\.focus\(\)/]) assert.match(JS, chamada);
  assert.match(JS, /showModal/);
  assert.match(JS, /addEventListener\('cancel'/);
  assert.match(JS, /aria-invalid/);
  assert.match(JS, /aria-busy/);
});

test('AI19. a tela bloqueia o envio sem sessão ou catálogo e durante a gravação (botões desabilitados)', () => {
  assert.match(JS, /const pronto = cliente\.sessaoPronta\(\) && catalogo !== null && !cliente\.gravando\(\)/);
  assert.match(JS, /\.disabled = !pronto/);
  assert.match(JS, /if \(!\(cliente\.sessaoPronta\(\) && catalogo !== null\) \|\| cliente\.gravando\(\)\) return;/);
  assert.match(JS, /botaoConfirmar\.disabled = true/);
  assert.match(JS, /if \(pendente === null \|\| cliente\.gravando\(\)\) return;/);
  assert.match(JS, /if \(cliente\.gravando\(\)\) evento\.preventDefault\(\)/);
});

// ---------- Isolamento do build ----------

test('AI20. /admin só existe no servidor de desenvolvimento: redirecionamento no serve, nenhum link no público e dist/ sem a tela', () => {
  const plugin = config.plugins.find((p) => p.name === 'sema-orienta-admin-redirecionamento');
  assert.ok(plugin);
  assert.equal(plugin.apply, 'serve');
  assert.equal('configurePreviewServer' in plugin, false);
  const registrados = [];
  plugin.configureServer({ middlewares: { use: (fn) => registrados.push(fn) } });
  const chamar = (url) => {
    const r = { statusCode: 0, cab: {}, setHeader(n, v) { this.cab[n] = v; }, end() { this.fim = true; } };
    let proximo = false;
    registrados[0]({ url }, r, () => { proximo = true; });
    return { r, proximo };
  };
  const redirecionado = chamar('/admin');
  assert.equal(redirecionado.r.statusCode, 302);
  assert.equal(redirecionado.r.cab.Location, '/admin/');
  assert.equal(redirecionado.proximo, false);
  const saude = chamar('/admin/saude');
  assert.deepEqual([saude.r.statusCode, saude.r.cab.Location, saude.proximo], [302, '/admin/saude/', false]);
  for (const url of ['/admin/', '/admin/saude/', '/administracao', '/', '/admin/admin.js', '/admin?x=1', '/admin/saude?x=1', '/admin/saude/saude.js']) assert.equal(chamar(url).proximo, true, url);
  const texto = lerTexto('vite.config.js');
  assert.doesNotMatch(texto, /rollupOptions|input\s*:|build\s*:|publicDir|copyPublicDir/, 'o build continua usando só o index.html da raiz');
  assert.equal(lerJson('package.json').scripts.build, 'vite build');
  // A interface do cidadão e o chat não mencionam a administração.
  for (const arquivo of ['index.html', 'src/main.js', 'src/chat.js', 'src/assistant.js', 'src/styles.css']) {
    assert.doesNotMatch(lerTexto(arquivo), /\/admin|admin\.js|admin-logic|Gestão de conteúdo|Ambiente administrativo|__admin/i, arquivo);
  }
  assert.ok(NOMES_ADMINISTRATIVOS.includes('Gestão de conteúdo') && NOMES_ADMINISTRATIVOS.includes('admin-logic'));
});

test('AI21. dist/ não contém a pasta admin, a tela, formulários administrativos, rotas nem token (quando dist/ existir)', { skip: !fs.existsSync(path.join(RAIZ, 'dist')) }, () => {
  assert.deepEqual(conferirDist(RAIZ), []);
  const lista = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? lista(path.join(d, e.name)) : [path.join(d, e.name)]));
  const arquivos = lista(path.join(RAIZ, 'dist'));
  assert.deepEqual(arquivos.map((f) => path.extname(f)).sort(), ['.css', '.html', '.js']);
  assert.equal(arquivos.some((f) => /admin/i.test(path.relative(path.join(RAIZ, 'dist'), f))), false);
  for (const f of arquivos) {
    assert.doesNotMatch(fs.readFileSync(f, 'utf8'), /Gestão de conteúdo|Ambiente administrativo|__admin|X-Admin-Token|admin-logic|form-assunto|form-servico|Confirmar cadastro|Novo assunto|Novo serviço/i, f);
  }
});

test('AI22. a pasta admin/ tem só os arquivos das duas páginas (cadastro e saúde); nenhum dado real, pessoal ou credencial', () => {
  assert.deepEqual(fs.readdirSync(path.join(RAIZ, 'admin')).sort(), ['admin-logic.js', 'admin.js', 'index.html', 'saude', 'styles.css']);
  assert.deepEqual(fs.readdirSync(path.join(RAIZ, 'admin', 'saude')).sort(), ['index.html', 'saude.js']);
  for (const [nome, texto] of [['index.html', HTML], ['styles.css', CSS], ['admin.js', JS], ['admin-logic.js', LOGICA], ['saude/index.html', lerTexto('admin', 'saude', 'index.html')], ['saude/saude.js', lerTexto('admin', 'saude', 'saude.js')]]) {
    assert.doesNotMatch(texto, /[A-Za-z0-9._-]+@[A-Za-z0-9-]+\.[A-Za-z]{2,}/, nome);
    assert.doesNotMatch(texto, /\b[0-9a-f]{64}\b|AIza|sk-[A-Za-z0-9]{10}/, nome);
    assert.doesNotMatch(texto, /licenciamento-ambiental|\blac\b|Licença por Adesão/i, nome);
  }
  // O catálogo real continua só com Licenciamento Ambiental e a LAC; este arquivo de teste não grava nada.
  assert.deepEqual(lerJson('services', 'assuntos.json').assuntos.map((a) => a.nome), ['Licenciamento Ambiental']);
  assert.deepEqual(lerJson('services', 'registry.json').servicos.map((s) => s.id), ['lac']);
  assert.doesNotMatch(lerTexto('tests', 'admin-interface.test.js').replace(/assert\.doesNotMatch[^\n]*\n/g, ''), /writeFileSync|appendFileSync|mkdirSync|rmSync|renameSync|unlinkSync|copyFileSync|cpSync/);
});

// ---------- Interface simplificada (Passo 7E3B) ----------

test('AI23. ids técnicos ausentes na tela: sem campo Identificador em assunto e serviço, sem ids e versões no catálogo nem no painel de confirmação', () => {
  const formAssunto = HTML.slice(HTML.indexOf('id="form-assunto"'), HTML.indexOf('</form>', HTML.indexOf('id="form-assunto"')));
  const formServico = HTML.slice(HTML.indexOf('id="form-servico"'), HTML.indexOf('</form>', HTML.indexOf('id="form-servico"')));
  assert.deepEqual([...formAssunto.matchAll(/<label for="([^"]+)"/g)].map((m) => m[1]), ['assunto-nome', 'assunto-descricao']);
  assert.deepEqual([...formServico.matchAll(/<label for="([^"]+)"/g)].map((m) => m[1]), ['servico-assunto', 'servico-nome', 'servico-sigla', 'servico-termos']);
  assert.doesNotMatch(formAssunto + formServico, /Identificador|name="id"|-id"|maxlength="60"/);
  assert.doesNotMatch(HTML, /id="assunto-id|id="servico-id/);
  assert.match(JS, /assunto: \{ nome: 'assunto-nome', descricao: 'assunto-descricao' \}/);
  assert.match(JS, /servico: \{ assuntoId: 'servico-assunto', nome: 'servico-nome', sigla: 'servico-sigla', termosEquivalentes: 'servico-termos' \}/);
  // O desenho do catálogo mostra só nome, descrição, situação e publicação.
  const catalogo = JS.slice(JS.indexOf('function renderizarCatalogo'), JS.indexOf('function preencherAssuntos'));
  assert.doesNotMatch(catalogo, /\.id\b|versaoAtualId|Identificador|Versão atual|criar\('code'/);
  assert.match(catalogo, /Situação: \$\{s\.situacao\}/);
  assert.match(catalogo, /grupo\.assunto\.descricao/);
  // O texto das fontes e das listas de serviços também não mostra ids nem versões.
  const fontes = JS.slice(JS.indexOf('function preencherServicosDasFontes'), JS.indexOf('/** Os botões de envio'));
  assert.doesNotMatch(fontes, /Versão atual|\$\{fontes\.versaoId\}|\(\$\{s\.id\}\)/, 'o id de versão não é mostrado (só fica no estado interno)');
});

test('AI24. estados técnicos viram textos amigáveis; ids, versões e hashes continuam só nos dados internos e na API', async () => {
  assert.deepEqual(['rascunho', 'em_validacao', 'ajustes_solicitados', 'validado_materialmente', 'autorizado_publicacao', 'publicado'].map(rotuloEstado),
    ['Rascunho', 'Em análise', 'Precisa de ajustes', 'Conteúdo validado', 'Pronto para publicação', 'Publicado']);
  assert.equal(rotuloEstado('qualquer'), 'Estado indisponível');
  assert.deepEqual([rotuloPublicacao(null), rotuloPublicacao(''), rotuloPublicacao('x-v1')], ['Não publicado', 'Não publicado', 'Publicado']);
  // A API de consulta continua entregando ids e versões ao cliente (para uso interno), mas o resultado de exibição não os repete.
  const { cliente } = await clienteComSessao();
  const r = await cliente.carregarCatalogo();
  assert.ok(r.catalogo.servicos[0].id && r.catalogo.servicos[0].versaoAtualId && r.catalogo.assuntos[0].id, 'dados internos preservados');
  assert.deepEqual(Object.keys(agruparCatalogo(r.catalogo, r.estados)[0].servicos[0]).sort(), ['nome', 'publicacao', 'sigla', 'situacao']);
  assert.deepEqual(Object.keys(agruparCatalogo(r.catalogo, r.estados)[0].assunto).sort(), ['ativo', 'descricao', 'nome']);
  assert.doesNotMatch(JSON.stringify(agruparCatalogo(r.catalogo, r.estados)), /servico-ficticio|assunto-ficticio|-v1/);
});

// ---------- Páginas separadas e navegação (Passo 8B, ajuste) ----------

test('AI25. /admin/ voltou a ter só catálogo, assuntos, serviços e fontes; a saúde fica em /admin/saude/; ambas têm a mesma navegação', () => {
  const saudeHtml = lerTexto('admin', 'saude', 'index.html');
  assert.doesNotMatch(HTML, /titulo-saude|saude-verificar|saude-lista|Verificar novamente|Saúde do sistema<\/h2>/);
  assert.doesNotMatch(JS, /saude|Saúde|CAPACIDADES_SAUDE|ESTADOS_SAUDE|formatarDataHoraBr|resumoDaSaude|new Date\(/i);
  assert.deepEqual([...HTML.matchAll(/<h2 id="(titulo-[a-z]+)"/g)].map((m) => m[1]), ['titulo-catalogo', 'titulo-assunto', 'titulo-servico', 'titulo-fontes']);
  assert.match(HTML, /<nav class="navegacao" aria-label="Seções da administração">\s*<a class="navegacao__link navegacao__link--atual" href=".\/" aria-current="page">Gestão de conteúdo<\/a>\s*<a class="navegacao__link" href=".\/saude\/">Saúde do sistema<\/a>\s*<\/nav>/);
  assert.match(saudeHtml, /<nav class="navegacao" aria-label="Seções da administração">\s*<a class="navegacao__link" href="..\/">Gestão de conteúdo<\/a>\s*<a class="navegacao__link navegacao__link--atual" href=".\/" aria-current="page">Saúde do sistema<\/a>\s*<\/nav>/);
  for (const pagina of [HTML, saudeHtml]) assert.equal((pagina.match(/aria-current="page"/g) ?? []).length, 1, 'uma única página atual');
  assert.match(CSS, /\.navegacao__link--atual \{[^}]*text-decoration: underline/, 'a página atual não depende só da cor');
  assert.match(CSS, /\.navegacao__link:focus-visible|:focus-visible \{[^}]*outline: 3px solid/);
  assert.match(saudeHtml, /<title>SEMA Orienta — Saúde do sistema<\/title>/);
  assert.match(saudeHtml, /<h1>SEMA Orienta — Saúde do sistema<\/h1>/);
  assert.match(saudeHtml, /<p class="aviso-admin" role="note">Ambiente administrativo local — sem autenticação<\/p>/);
  assert.match(saudeHtml, /<link rel="stylesheet" href="..\/styles.css" \/>/);
  assert.match(saudeHtml, /<script type="module" src=".\/saude.js"><\/script>/);
  assert.match(saudeHtml, /<a class="botao botao--secundario" href="..\/">Voltar para Gestão de conteúdo<\/a>/);
  assert.equal((saudeHtml.match(/<h1>/g) ?? []).length, 1);
  assert.doesNotMatch(saudeHtml, /<form|<input|<textarea|<select|<dialog|admin\.js"/i, 'a página de saúde não tem cadastro');
  assert.doesNotMatch(saudeHtml, /MVP|acad[êe]mic|\bcurso\b|prot[óo]tipo|\bMarco\b/i);
  const ids = [...saudeHtml.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
  assert.equal(new Set(ids).size, ids.length);
});
