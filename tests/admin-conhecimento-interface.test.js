// Sprint 3, Passo 3B2: página "Blocos de conhecimento" (/admin/conteudo/): lógica pura, cliente com fetch simulado, estrutura
// de acessibilidade, segurança do código e isolamento. Dados fictícios; nada é gravado e a rede não é usada.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ROTAS, CABECALHO_TOKEN, LIMITES_CONHECIMENTO, MENSAGENS, corpoDoConhecimento, criarClienteAdmin, mensagemDeErro, resumirConhecimento,
  resumoDoConhecimento, rotuloRevisao, validarFormConhecimento,
} from '../admin/admin-logic.js';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lerTexto = (...p) => fs.readFileSync(path.join(RAIZ, ...p), 'utf8');
const HTML = lerTexto('admin', 'conteudo', 'index.html');
const JS = lerTexto('admin', 'conteudo', 'conteudo.js');
const LOGICA = lerTexto('admin', 'admin-logic.js');
const CSS = lerTexto('admin', 'styles.css');
const TOKEN = 'ab'.repeat(32);
const EMAIL = ['pessoa', 'exemplo.test'].join('@'); // montado em execução: o repositório não guarda e-mail nem telefone
const TELEFONE = ['(65)', '99999', '1234'].join(' ');

const FONTES = [
  { id: 'f-um', titulo: 'Fonte Um', tipo: 'pagina_oficial', vigencia: { situacao: 'nao_se_aplica' } },
  { id: 'f-dois', titulo: 'Fonte Dois', tipo: 'manual', vigencia: { situacao: 'nao_se_aplica' } },
  { id: 'f-velha', titulo: 'Norma Antiga', tipo: 'legislacao', vigencia: { situacao: 'revogada' } },
];
const bloco = (extra = {}) => ({
  id: 'bc-aaaaaaaaaaaa', tipo: 'conhecimento', titulo: 'Como iniciar', texto: 'Conteúdo fictício.\nSegunda linha.', origem: 'fonte', fonteIds: ['f-um'],
  referencias: [{ fonteId: 'f-um', localizacao: 'Seção 2' }], ambiente: 'publico', statusValidacao: 'rascunho', publicado: false, revisaoAtualidade: 'pendente',
  criadoEm: '2026-11-09', atualizadoEm: '2026-11-10', ...extra,
});
const BLOCO_TESTE = { id: 'x-limites', tipo: 'limitacao', texto: 'Apenas orienta.', origem: 'regra_institucional', fonteIds: [], ambiente: 'teste_local', statusValidacao: 'em_validacao', publicado: false, revisaoAtualidade: 'pendente' };
const VERSAO = (estado = 'rascunho', blocos = [BLOCO_TESTE, bloco()]) => ({
  servicoId: 'servico-ficticio', versaoId: 'servico-ficticio-v1', manifesto: { estado, numero: 1 }, service: { nome: 'Serviço Fictício', sigla: 'SF' },
  fontes: { fontes: FONTES }, conteudoAssistente: { blocos }, roteiro: 'texto interno', revisaoFontes: 'cd'.repeat(32),
});
const VALORES = (extra = {}) => ({ titulo: 'Título', texto: 'Texto orientativo.', alertas: '', selecionadas: [{ fonteId: 'f-um', localizacao: 'p. 3' }], ...extra });

function servidorFalso({ estado = 'rascunho', blocos, respostas = {}, portao = null } = {}) {
  const dados = { estado, blocos: blocos ?? [BLOCO_TESTE, bloco()] };
  const chamadas = [];
  const r = (status, corpo) => ({ status, json: async () => { if (corpo === null) throw new Error('sem corpo'); return corpo; } });
  const base = '/__admin/servicos/servico-ficticio';
  const fetchImpl = async (url, opcoes = {}) => {
    chamadas.push({ url, ...opcoes, corpo: opcoes.body === undefined ? undefined : JSON.parse(opcoes.body) });
    const chave = `${opcoes.method} ${url}`;
    if (respostas[chave]) return respostas[chave](opcoes);
    if (url === ROTAS.sessao) return r(200, { token: TOKEN });
    if (opcoes.headers?.[CABECALHO_TOKEN] !== TOKEN) return r(401, { erro: 'nao_autorizado' });
    if (chave === `GET ${base}/versao-atual`) return r(200, VERSAO(dados.estado, dados.blocos));
    if (chave === `POST ${base}/conhecimentos`) { if (portao) await portao; return r(201, { bloco: { id: 'bc-novo' } }); }
    if (chave === `PATCH ${base}/conhecimentos/bc-aaaaaaaaaaaa`) return r(200, { bloco: { id: 'bc-aaaaaaaaaaaa' } });
    if (chave === `DELETE ${base}/conhecimentos/bc-aaaaaaaaaaaa`) return r(204, null);
    return r(404, { erro: 'nao_encontrado' });
  };
  return { fetchImpl, chamadas, dados };
}
async function cliente(opcoes) {
  const s = servidorFalso(opcoes);
  const c = criarClienteAdmin({ fetchImpl: s.fetchImpl });
  await c.iniciarSessao();
  return { c, ...s };
}

// ---------- Lógica pura ----------

test('IC1. resumirConhecimento: só blocos de conhecimento, datas DD-MM-AAAA, fontes por título, sem origem, ambiente nem hashes', () => {
  const r = resumirConhecimento(VERSAO('rascunho', [BLOCO_TESTE, bloco({ alertas: ['Pode estar desatualizado.'] })]));
  assert.equal(r.nomeServico, 'Serviço Fictício');
  assert.equal(r.numero, 1);
  assert.equal(r.estado, 'rascunho');
  assert.equal(r.editavel, true);
  assert.deepEqual(r.fontes.map((f) => [f.titulo, f.tipo, f.revogada]), [['Fonte Um', 'Página oficial', false], ['Fonte Dois', 'Manual', false], ['Norma Antiga', 'Legislação', true]]);
  assert.equal(r.blocos.length, 1, 'os blocos teste_local não aparecem');
  const [b] = r.blocos;
  assert.equal(b.criadoEm, '09-11-2026');
  assert.equal(b.atualizadoEm, '10-11-2026');
  assert.deepEqual([b.situacao, b.revisao, b.publicacao, b.editavel], ['Em elaboração (rascunho)', 'Revisão pendente', 'Ainda não disponível no chatbot.', true]);
  assert.deepEqual(b.referencias, [{ fonteId: 'f-um', fonteTitulo: 'Fonte Um', localizacao: 'Seção 2' }]);
  assert.deepEqual(b.alertas, ['Pode estar desatualizado.']);
  const texto = JSON.stringify(r);
  for (const proibido of ['origem', 'ambiente', 'teste_local', 'roteiro', 'revisaoFontes', 'texto interno']) assert.equal(texto.includes(proibido), false, proibido);
});

test('IC2. resumirConhecimento: versão que não está em rascunho bloqueia; bloco fora de rascunho não é editável; formato inválido devolve null', () => {
  for (const estado of ['em_validacao', 'ajustes_solicitados', 'validado_materialmente', 'autorizado_publicacao', 'publicado']) assert.equal(resumirConhecimento(VERSAO(estado)).editavel, false, estado);
  const r = resumirConhecimento(VERSAO('rascunho', [bloco({ statusValidacao: 'em_validacao' }), bloco({ id: 'bc-b', publicado: true, statusValidacao: 'validado', revisaoAtualidade: 'concluida' }), bloco({ id: 'bc-c', revisaoAtualidade: 'em_revisao' })]));
  assert.deepEqual(r.blocos.map((b) => b.editavel), [false, false, false]);
  assert.equal(r.blocos[1].publicacao, 'Disponível no chatbot.');
  for (const ruim of [null, {}, { manifesto: {} }, { ...VERSAO(), conteudoAssistente: {} }, { ...VERSAO(), fontes: {} }, { ...VERSAO(), service: null }]) assert.equal(resumirConhecimento(ruim), null);
  assert.equal(resumirConhecimento(VERSAO('rascunho', [])).blocos.length, 0, 'estado vazio');
  assert.equal(rotuloRevisao('qualquer'), 'Revisão indisponível');
});

test('IC3. formulário válido: dados aparados, uma referência por fonte e alertas por linha', () => {
  const r = validarFormConhecimento(VALORES({
    titulo: '  Título   com  espaços ', texto: '  Texto.\nOutra linha.  ', alertas: ' Alerta 1 \n\n  Alerta 2\n',
    selecionadas: [{ fonteId: 'f-um', localizacao: ' p. 3 ' }, { fonteId: 'f-dois', localizacao: 'art. 5º' }],
  }), resumirConhecimento(VERSAO()).fontes);
  assert.equal(r.ok, true);
  assert.deepEqual(r.dados, {
    titulo: 'Título com espaços', texto: 'Texto.\nOutra linha.', fonteIds: ['f-um', 'f-dois'],
    referencias: [{ fonteId: 'f-um', localizacao: 'p. 3' }, { fonteId: 'f-dois', localizacao: 'art. 5º' }], alertas: ['Alerta 1', 'Alerta 2'],
  });
});

test('IC4. a localização é obrigatória para cada fonte marcada e as demais regras do formulário', () => {
  const fontes = resumirConhecimento(VERSAO()).fontes;
  const erros = (v) => validarFormConhecimento(v, fontes).erros;
  assert.equal(erros(VALORES({ selecionadas: [{ fonteId: 'f-um', localizacao: '' }] })).localizacoes['f-um'], 'Informe onde esta informação aparece na fonte. Exemplo: página 3, item 2.1 ou seção Como solicitar.');
  assert.deepEqual(Object.keys(erros(VALORES({ selecionadas: [{ fonteId: 'f-um', localizacao: 'p. 1' }, { fonteId: 'f-dois', localizacao: '   ' }] })).localizacoes), ['f-dois']);
  assert.ok(erros(VALORES({ selecionadas: [{ fonteId: 'f-um', localizacao: 'a'.repeat(201) }] })).localizacoes['f-um'].includes('200'));
  assert.ok(erros(VALORES({ selecionadas: [{ fonteId: 'f-um', localizacao: EMAIL }] })).localizacoes['f-um'].includes('e-mail'));
  assert.equal(erros(VALORES({ selecionadas: [] })).fontes, 'Escolha ao menos uma fonte que comprove a informação.');
  assert.ok(erros(VALORES({ selecionadas: [{ fonteId: 'f-velha', localizacao: 'p. 1' }] })).fontes.includes('revogadas'));
  assert.ok(erros(VALORES({ selecionadas: [{ fonteId: 'inexistente', localizacao: 'p. 1' }] })).fontes.includes('disponíveis'));
  assert.ok(erros(VALORES({ selecionadas: [{ fonteId: 'f-um', localizacao: 'a' }, { fonteId: 'f-um', localizacao: 'b' }] })).fontes.includes('uma só vez'));
  assert.ok(erros(VALORES({ titulo: '' })).titulo.includes('tema da informação'));
  assert.ok(erros(VALORES({ titulo: 'a'.repeat(LIMITES_CONHECIMENTO.titulo + 1) })).titulo.includes('200'));
  assert.ok(erros(VALORES({ texto: '  ' })).texto.includes('informação que o chatbot pode usar'));
  assert.ok(erros(VALORES({ texto: 'a'.repeat(LIMITES_CONHECIMENTO.texto + 1) })).texto.includes('2000'));
  assert.ok(erros(VALORES({ texto: `fale com ${EMAIL}` })).texto.includes('e-mail'));
  assert.ok(erros(VALORES({ texto: `ligue ${TELEFONE}` })).texto.includes('telefone'));
  assert.ok(erros(VALORES({ alertas: Array.from({ length: 11 }, () => 'a').join('\n') })).alertas.includes('10'));
  assert.ok(erros(VALORES({ alertas: 'a'.repeat(301) })).alertas.includes('300'));
  assert.ok(erros(VALORES({ alertas: EMAIL })).alertas.includes('e-mail'));
  assert.equal(validarFormConhecimento(null, fontes).ok, false);
});

test('IC5. corpo enviado: só os cinco campos permitidos; nada de id, datas, estado, revisão, ambiente ou publicação; resumo sem ids', () => {
  const fontes = resumirConhecimento(VERSAO()).fontes;
  const { dados } = validarFormConhecimento(VALORES({ alertas: 'Aviso.' }), fontes);
  assert.deepEqual(Object.keys(corpoDoConhecimento(dados)).sort(), ['alertas', 'fonteIds', 'referencias', 'texto', 'titulo']);
  assert.deepEqual(Object.keys(corpoDoConhecimento({ ...dados, alertas: [] })).sort(), ['fonteIds', 'referencias', 'texto', 'titulo'], 'alertas só quando houver');
  const linhas = resumoDoConhecimento(dados, fontes, 'Serviço Fictício');
  assert.deepEqual(linhas.map((l) => l.rotulo), ['Serviço', 'Tema da informação', 'Informação que o chatbot pode usar', 'Fontes que comprovam', 'Avisos ou limitações', 'Situação inicial']);
  const texto = linhas.map((l) => l.valor).join('|');
  assert.ok(texto.includes('Fonte Um — p. 3'));
  assert.equal(texto.includes('f-um'), false, 'a fonte aparece pelo título, não pelo id');
});

// ---------- Mensagens ----------

test('IC6. mensagens curtas por código, sem usar a resposta bruta', () => {
  const m = (status, corpo) => mensagemDeErro(status, corpo, 'conhecimento');
  assert.ok(m(409, { erro: 'versao_nao_editavel' }).includes('não está em rascunho'));
  assert.ok(m(409, { erro: 'bloco_nao_editavel' }).includes('editada'));
  assert.ok(m(409, { erro: 'bloco_nao_removivel' }).includes('excluída'));
  assert.ok(m(409, { erro: 'operacao_em_andamento' }).includes('em andamento'));
  assert.equal(m(409, { erro: 'qualquer' }), MENSAGENS.generica);
  assert.ok(m(404, { erro: 'nao_encontrado' }).includes('não foi encontrado'));
  assert.ok(m(422, { erro: 'dados_invalidos', campos: ['texto', 'referencias'] }).includes('informação que o chatbot pode usar, onde a informação aparece na fonte'));
  assert.ok(m(422, { erro: 'dados_invalidos', campos: ['extras'] }).includes('não são permitidos'));
  assert.ok(m(413, null).includes('grandes'));
  assert.ok(m(415, null).includes('formato'));
  assert.ok(m(400, null).includes('não puderam ser lidos'));
  assert.ok(m(500, { erro: 'indisponivel' }).includes('Nada foi alterado'));
  assert.ok(m(401, null).includes('sessão'));
  assert.ok(m(403, null).includes('Acesso recusado'));
  for (const status of [400, 401, 403, 404, 405, 409, 413, 415, 422, 500, 503]) {
    assert.equal(m(status, { erro: 'x', detalhe: 'SEGREDO-BRUTO', stack: 'SEGREDO-BRUTO' }).includes('SEGREDO-BRUTO'), false, String(status));
  }
});

// ---------- Cliente ----------

test('IC7. carregarConhecimento: resumo da versão atual, sem gravar nada e sem token nem texto bruto na resposta', async () => {
  const { c, chamadas } = await cliente();
  const r = await c.carregarConhecimento('servico-ficticio');
  assert.equal(r.ok, true);
  assert.equal(r.nomeServico, 'Serviço Fictício');
  assert.equal(r.blocos.length, 1);
  assert.equal(JSON.stringify(r).includes(TOKEN), false);
  assert.deepEqual(chamadas.filter((x) => x.method !== 'GET'), [], 'abrir e carregar nunca gravam');
  assert.equal((await c.carregarConhecimento('Inválido!')).ok, false);
  const falha = await (await cliente({ respostas: { 'GET /__admin/servicos/servico-ficticio/versao-atual': async () => ({ status: 500, json: async () => ({ erro: 'SEGREDO-BRUTO' }) }) } })).c.carregarConhecimento('servico-ficticio');
  assert.deepEqual([falha.ok, falha.mensagem], [false, MENSAGENS.conhecimento]);
  const semSessao = criarClienteAdmin({ fetchImpl: async () => ({ status: 200, json: async () => ({}) }) });
  assert.equal((await semSessao.carregarConhecimento('servico-ficticio')).mensagem, MENSAGENS.sessao);
});

test('IC8. criação, edição e exclusão simuladas: métodos, rotas, cabeçalho de token e corpo permitidos', async () => {
  const { c, chamadas } = await cliente();
  const fontes = resumirConhecimento(VERSAO()).fontes;
  const corpo = corpoDoConhecimento(validarFormConhecimento(VALORES(), fontes).dados);
  assert.deepEqual(await c.gravarConhecimento('criar', 'servico-ficticio', null, corpo), { ok: true });
  assert.deepEqual(await c.gravarConhecimento('alterar', 'servico-ficticio', 'bc-aaaaaaaaaaaa', corpo), { ok: true });
  assert.deepEqual(await c.gravarConhecimento('excluir', 'servico-ficticio', 'bc-aaaaaaaaaaaa'), { ok: true });
  const gravacoes = chamadas.filter((x) => x.method !== 'GET');
  assert.deepEqual(gravacoes.map((x) => `${x.method} ${x.url}`), [
    'POST /__admin/servicos/servico-ficticio/conhecimentos',
    'PATCH /__admin/servicos/servico-ficticio/conhecimentos/bc-aaaaaaaaaaaa',
    'DELETE /__admin/servicos/servico-ficticio/conhecimentos/bc-aaaaaaaaaaaa',
  ]);
  assert.ok(gravacoes.every((x) => x.headers[CABECALHO_TOKEN] === TOKEN && x.credentials === 'omit' && x.cache === 'no-store'));
  assert.deepEqual(gravacoes[0].corpo, corpo);
  assert.equal(gravacoes[2].body, undefined, 'DELETE sem corpo');
  assert.equal(gravacoes[2].headers['Content-Type'], undefined);
  for (const g of gravacoes.slice(0, 2)) for (const proibido of ['id', 'criadoEm', 'atualizadoEm', 'statusValidacao', 'revisaoAtualidade', 'ambiente', 'publicado', 'origem', 'tipo']) assert.equal(Object.hasOwn(g.corpo, proibido), false, proibido);
  assert.deepEqual((await c.gravarConhecimento('apagar', 'servico-ficticio', 'bc-aaaaaaaaaaaa')).ok, false);
  assert.equal((await c.gravarConhecimento('excluir', 'servico-ficticio', 'Inválido!')).ok, false);
  assert.equal(chamadas.filter((x) => x.method !== 'GET').length, 3, 'entradas inválidas não geram chamadas');
});

test('IC9. clique duplo: com uma gravação em andamento a segunda não é enviada', async () => {
  let liberar;
  const portao = new Promise((r) => { liberar = r; });
  const { c, chamadas } = await cliente({ portao });
  const corpo = corpoDoConhecimento(validarFormConhecimento(VALORES(), resumirConhecimento(VERSAO()).fontes).dados);
  const primeira = c.gravarConhecimento('criar', 'servico-ficticio', null, corpo);
  assert.equal(c.gravando(), true);
  const segunda = await c.gravarConhecimento('criar', 'servico-ficticio', null, corpo);
  assert.deepEqual([segunda.ok, segunda.emAndamento, segunda.mensagem], [false, true, MENSAGENS.emAndamento]);
  liberar();
  assert.equal((await primeira).ok, true);
  assert.equal(c.gravando(), false);
  assert.equal(chamadas.filter((x) => x.method === 'POST').length, 1);
});

test('IC10. erros do servidor viram mensagens curtas e pedem recarregar quando o estado mudou', async () => {
  const rota = (m, u) => `${m} /__admin/servicos/servico-ficticio/conhecimentos${u}`;
  const resp = (status, corpo) => async () => ({ status, json: async () => corpo });
  const casos = [
    ['criar', 409, { erro: 'versao_nao_editavel' }, true, 'não está em rascunho'],
    ['alterar', 409, { erro: 'bloco_nao_editavel' }, true, 'editada'],
    ['excluir', 409, { erro: 'bloco_nao_removivel' }, true, 'excluída'],
    ['alterar', 404, { erro: 'nao_encontrado' }, true, 'não foi encontrado'],
    ['criar', 409, { erro: 'operacao_em_andamento' }, undefined, 'em andamento'],
    ['criar', 422, { erro: 'dados_invalidos', campos: ['titulo'] }, undefined, 'tema da informação'],
    ['criar', 500, { erro: 'indisponivel', detalhe: 'SEGREDO-BRUTO' }, undefined, 'Nada foi alterado'],
    ['criar', 401, { erro: 'nao_autorizado' }, undefined, 'sessão'],
  ];
  for (const [operacao, status, corpoErro, recarregar, trecho] of casos) {
    const chave = operacao === 'criar' ? rota('POST', '') : operacao === 'alterar' ? rota('PATCH', '/bc-aaaaaaaaaaaa') : rota('DELETE', '/bc-aaaaaaaaaaaa');
    const { c } = await cliente({ respostas: { [chave]: resp(status, corpoErro) } });
    const r = await c.gravarConhecimento(operacao, 'servico-ficticio', 'bc-aaaaaaaaaaaa', { titulo: 'x' });
    assert.equal(r.ok, false);
    assert.equal(r.recarregar, recarregar, `${operacao} ${status}`);
    assert.ok(r.mensagem.includes(trecho), `${operacao} ${status}: ${r.mensagem}`);
    assert.equal(r.mensagem.includes('SEGREDO-BRUTO'), false);
  }
  const { c } = await cliente({ respostas: { [rota('POST', '')]: async () => { throw new Error('rede'); } } });
  assert.deepEqual((await c.gravarConhecimento('criar', 'servico-ficticio', null, {})).mensagem, MENSAGENS.rede);
  assert.equal(c.gravando(), false, 'a trava do cliente é liberada após falha');
});

// ---------- HTML, acessibilidade e código da página ----------

test('IC11. estrutura: título, aviso, navegação com três links, rótulos, regiões vivas, diálogo e formulário só nesta página', () => {
  assert.match(HTML, /<html lang="pt-BR">/);
  assert.match(HTML, /<title>SEMA Orienta — Informações do chatbot<\/title>/);
  assert.match(HTML, /<h1>SEMA Orienta — Informações do chatbot<\/h1>/);
  assert.match(HTML, /<p class="aviso-admin" role="note">Ambiente administrativo local — sem autenticação<\/p>/);
  assert.match(HTML, /<nav class="navegacao" aria-label="Seções da administração">\s*<a class="navegacao__link" href="..\/">Cadastro da base<\/a>\s*<a class="navegacao__link navegacao__link--atual" href=".\/" aria-current="page">Informações do chatbot<\/a>\s*<a class="navegacao__link" href="..\/saude\/">Saúde do sistema<\/a>\s*<\/nav>/);
  assert.match(HTML, /<a class="pular" href="#principal">/);
  assert.match(HTML, /<p id="status" class="status" role="status" aria-live="polite" tabindex="-1">/);
  assert.match(HTML, /<dialog id="confirmacao" class="dialogo" aria-labelledby="confirmacao-titulo" aria-describedby="confirmacao-descricao">/);
  for (const id of ['assunto', 'servico', 'bloco-titulo', 'bloco-texto', 'bloco-alertas']) assert.match(HTML, new RegExp(`<label for="${id}">`), id);
  assert.match(HTML, /<fieldset[^>]*>\s*<legend>Fontes que comprovam a informação<\/legend>/);
  for (const id of ['bloco-titulo', 'bloco-texto', 'bloco-alertas']) assert.match(HTML, new RegExp(`<p id="${id}-erro" class="erro" hidden>`), id);
  assert.match(HTML, /<h2 id="titulo-form" tabindex="-1">Nova informação<\/h2>/);
  // Linguagem e apresentação aprovadas: introdução, rótulos, ajudas e ícones decorativos
  assert.match(HTML, /Cadastre uma informação completa e comprovada. O chatbot poderá usá-la para responder diferentes perguntas dos cidadãos./);
  assert.match(HTML, /<label for="bloco-titulo">Tema da informação<\/label>/);
  assert.match(HTML, /<label for="bloco-texto">Informação que o chatbot pode usar<\/label>/);
  assert.match(HTML, /<label for="bloco-alertas">Avisos ou limitações <span class="opcional">\(opcional\)<\/span><\/label>/);
  assert.match(HTML, /Selecione um documento ou link já cadastrado./);
  assert.match(HTML, /Opcional. Escreva um aviso por linha./);
  assert.ok((HTML.match(/class="icone[^"]*" aria-hidden="true"/g) ?? []).length >= 4, 'ícones só decorativos, ocultos para leitores de tela');
  assert.match(HTML, /<div class="duas-colunas">/);
  // Ícones SVG simples de traço (sem emojis nem biblioteca): currentColor, decorativos e do mesmo tamanho
  assert.doesNotMatch(HTML, /\p{Extended_Pictographic}/u, 'nenhum emoji na página');
  const svgs = HTML.match(/<svg [^>]*>/g) ?? [];
  assert.equal(svgs.length, 5, 'folha, balão, documento, mais e lista');
  for (const s of svgs) assert.match(s, /viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"/);
  assert.doesNotMatch(HTML, /<svg[^>]*(<script|onload|href=)|<img|<use|xlink/);
  assert.match(CSS, /\.icone svg \{[^}]*width: 1\.25rem;[^}]*height: 1\.25rem;/);
  assert.match(CSS, /\.icone \{[^}]*color: var\(--verde-800\);/);
  assert.match(JS, /Onde esta informação aparece na fonte\?/);
  assert.match(JS, /placeholder = 'Ex\.: página 3, item 2\.1 ou seção Como solicitar\.'/);
  assert.match(CSS, /@media \(min-width: 62rem\)[\s\S]*\.duas-colunas/);
  assert.doesNotMatch(HTML, /Título da informação|Orientação ao cidadão|Conteúdo orientativo|Localização/);
  assert.match(HTML, /id="bloco-enviar" disabled/);
  assert.match(HTML, /id="bloco-cancelar"/);
  assert.match(HTML, /Não publicada|Nenhuma fica disponível no chatbot/);
  assert.doesNotMatch(HTML, /style=|onclick=|<script(?![^>]*type="module")/);
  assert.doesNotMatch(HTML, /\bbc-[0-9a-f]{12}\b|hashConteudo|[0-9a-f]{64}|teste_local/i, 'sem ids nem campos internos');
  assert.match(CSS, /\.bloco__acoes, ?\n?\.acoes-form|\.bloco__texto \{[^}]*white-space: pre-wrap/);
  assert.match(CSS, /@media \(max-width: 30rem\)[\s\S]*\.acoes-form \.botao/);
  // O formulário não está na página administrativa principal nem na de saúde.
  for (const outra of [lerTexto('admin', 'index.html'), lerTexto('admin', 'saude', 'index.html')]) {
    assert.doesNotMatch(outra, /form-bloco|bloco-titulo|Nova informação|conteudo\.js/);
    assert.match(outra, /href="(\.\/|\.\.\/)conteudo\/">Informações do chatbot<\/a>/);
  }
});

test('IC12. o código da página: sem innerHTML, armazenamento do navegador, cookies, log nem rede própria; ids e datas ISO nunca exibidos', () => {
  assert.doesNotMatch(JS, /innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\(|new Function|localStorage|sessionStorage|indexedDB|document\.cookie|console\.|debugger|XMLHttpRequest|WebSocket|sendBeacon|EventSource|\bfetch\(\s*['"`]/);
  assert.match(JS, /textContent/);
  assert.match(JS, /replaceChildren/);
  assert.deepEqual([...JS.matchAll(/^import [^;]*? from '([^']+)';/gms)].map((m) => m[1]), ['../admin-logic.js']);
  assert.doesNotMatch(JS, /\.id\b[^\n]*textContent|textContent[^\n]*\.id\b|fonteId\)?\s*\)?;?\s*$/m);
  // Datas já chegam em DD-MM-AAAA do resumo; a página não formata nem mostra datas ISO.
  assert.doesNotMatch(JS, /criadoEm\b[^\n]*ISO|new Date\(|Date\.now/);
  assert.doesNotMatch(LOGICA, /innerHTML|localStorage|sessionStorage|document\.cookie|console\./);
});

test('IC13. nenhuma gravação ao abrir: gravarConhecimento só é chamado depois da confirmação, com trava e foco na mensagem', () => {
  assert.equal((JS.match(/cliente\.gravarConhecimento\(/g) ?? []).length, 1);
  const confirmar = /async function confirmar\(\) \{[\s\S]*?\n\}\n/.exec(JS)[0];
  assert.match(confirmar, /cliente\.gravarConhecimento\(operacao, servicoId, blocoId, corpo\)/);
  assert.match(confirmar, /if \(pendente === null \|\| cliente\.gravando\(\)\) return;/);
  assert.match(confirmar, /botaoConfirmar\.disabled = true;/);
  assert.match(confirmar, /mostrarStatus\(.*'info', true\)/, 'sucesso: foco na mensagem');
  assert.match(confirmar, /mostrarStatus\(r\.mensagem, 'erro', true\)/, 'erro: foco na mensagem');
  assert.match(confirmar, /await carregarServico\(servicoId\)/, 'recarrega a lista depois do sucesso');
  assert.match(confirmar, /r\.recarregar/);
  const iniciar = /async function iniciar\(\) \{[\s\S]*?\n\}\n/.exec(JS)[0];
  assert.doesNotMatch(iniciar, /gravarConhecimento|cadastrar|confirmar\(/);
  assert.doesNotMatch(/async function carregarServico\([\s\S]*?\n\}\n/.exec(JS)[0], /gravarConhecimento/);
  // confirmação antes de criar, alterar e excluir; Voltar e Cancelar não gravam; Esc não fecha durante a gravação
  assert.match(JS, /abrirConfirmacao\(\{[\s\S]*?operacao: criando \? 'criar' : 'alterar'/);
  assert.match(JS, /operacao: 'excluir'/);
  assert.match(JS, /botaoVoltar\.addEventListener\('click', fecharConfirmacao\)/);
  assert.match(JS, /\$\('bloco-cancelar'\)\.addEventListener\('click', cancelar\)/);
  assert.match(JS, /dialogo\.addEventListener\('cancel', \(evento\) => \{\s*if \(cliente\.gravando\(\)\) evento\.preventDefault\(\);/);
  assert.match(JS, /showModal/);
  // ações desabilitadas fora de rascunho; foco devolvido ao gatilho ao fechar; foco no formulário ao editar
  assert.match(JS, /const podeEditar = \(\) => cliente\.sessaoPronta\(\) && contexto !== null && contexto\.editavel && !cliente\.gravando\(\);/);
  assert.match(JS, /botao\.disabled = !livre \|\| !\(item && item\.__bloco && item\.__bloco\.editavel\);/);
  assert.match(JS, /pendente\.gatilho\.focus\(\)/);
  assert.match(JS, /\$\('titulo-form'\)\.focus\(\)/);
  assert.match(JS, /primeiro\.focus\(\)/, 'foco no primeiro campo com erro');
  assert.match(JS, /aria-label', `Editar a informação \$\{b\.titulo\}`/);
});

test('IC14. isolamento: o chat público não referencia a página, o build não a inclui e este arquivo não grava nada', () => {
  const publicos = ['index.html', ...fs.readdirSync(path.join(RAIZ, 'src')).filter((f) => f.endsWith('.js')).map((f) => path.join('src', f))];
  for (const arquivo of publicos) assert.doesNotMatch(lerTexto(arquivo), /admin\/conteudo|conteudo\.js|Informações do chatbot|gravarConhecimento|__admin/, arquivo);
  assert.match(lerTexto('vite.config.js'), /'\/admin\/conteudo': '\/admin\/conteudo\/'/);
  assert.match(lerTexto('vite.config.js'), /apply: 'serve'/);
  assert.doesNotMatch(lerTexto('index.html'), /admin/i);
  assert.doesNotMatch(lerTexto('tests', 'admin-conhecimento-interface.test.js').replace(/assert\.doesNotMatch[^\n]*\n/g, ''), /writeFileSync|appendFileSync|mkdirSync|rmSync|renameSync|unlinkSync|copyFileSync|cpSync/);
});
