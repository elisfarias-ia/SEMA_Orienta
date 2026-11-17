// Passo 5B3c: interface de "Importar conteúdo existente": lógica pura de admin-logic.js, cliente com fetch simulado e estrutura da
// página. Dados fictícios; nada é gravado e a rede não é usada.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CABECALHO_TOKEN, ROTAS, ROTULOS_CANDIDATO, FRASE_SEM_CANDIDATOS, MENSAGEM_IMPORTADA, TEXTO_IMPORTACAO, corpoDaImportacao, criarClienteAdmin,
  mensagemDaRevisao, previaDoTexto, resumirCandidatos, validarFormConhecimento,
} from '../admin/admin-logic.js';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lerTexto = (...p) => fs.readFileSync(path.join(RAIZ, ...p), 'utf8');
const HTML = lerTexto('admin', 'conteudo', 'index.html');
const JS = lerTexto('admin', 'conteudo', 'conteudo.js');
const LOGICA = lerTexto('admin', 'admin-logic.js');
const TOKEN = 'cd'.repeat(32);
const REV = 'ab'.repeat(32);

const candidato = (extra = {}) => ({ ref: 'descricao', tipo: 'descricao', titulo: 'Descrição do serviço', texto: 'Texto fictício da descrição.', fonteIds: ['f-um'], referencias: [{ fonteId: 'f-um', localizacao: '' }], alertas: ['Aviso fictício.'], ...extra });

function servidorFalso(respostas = {}) {
  const chamadas = [];
  const r = (status, corpo) => ({ status, json: async () => corpo });
  const fetchImpl = async (url, opcoes = {}) => {
    chamadas.push({ url, ...opcoes, corpo: opcoes.body === undefined ? undefined : JSON.parse(opcoes.body) });
    if (url === ROTAS.sessao) return r(200, { token: TOKEN });
    const chave = `${opcoes.method} ${url}`;
    if (respostas[chave]) return respostas[chave](opcoes);
    return r(404, { erro: 'nao_encontrado' });
  };
  return { fetchImpl, chamadas };
}

test('II1. resumirCandidatos: só o que a tela usa; rótulos em linguagem comum; formato inesperado vira null', () => {
  const r = resumirCandidatos({ revisao: REV, candidatos: [candidato(), candidato({ ref: 'link:f-um', tipo: 'link', titulo: 'Link' }), { ref: 'x', tipo: 'desconhecido', titulo: 't', texto: 'x' }, candidato({ ref: 'Maiúscula!' }), null] });
  assert.equal(r.revisao, REV);
  assert.equal(r.candidatos.length, 2);
  assert.deepEqual(r.candidatos.map((c) => c.rotulo), [ROTULOS_CANDIDATO.descricao, ROTULOS_CANDIDATO.link]);
  assert.deepEqual(Object.keys(r.candidatos[0]).sort(), ['alertas', 'previa', 'ref', 'referencias', 'rotulo', 'texto', 'tipo', 'titulo']);
  for (const ruim of [null, [], {}, { revisao: 'abc', candidatos: [] }, { revisao: REV }, { revisao: REV, candidatos: 'x' }]) assert.equal(resumirCandidatos(ruim), null);
  for (const rotulo of Object.values(ROTULOS_CANDIDATO)) assert.doesNotMatch(rotulo, /[a-z]+-[a-z0-9]+|\bid\b|json|bloco/i);
  assert.equal(resumirCandidatos({ revisao: REV, candidatos: [] }).candidatos.length, 0);
  assert.match(FRASE_SEM_CANDIDATOS, /Nenhuma orientação encontrada/);
});

test('II2. prévia do texto: sem quebras, limitada e com reticências', () => {
  assert.equal(previaDoTexto('a\n\nb   c'), 'a b c');
  const longa = previaDoTexto('palavra '.repeat(200));
  assert.ok(longa.length <= 301 && longa.endsWith('…'));
  assert.equal(previaDoTexto(undefined), '');
});

test('II3. corpoDaImportacao: só o que a pessoa conferiu, mais a referência do item e a revisão; nunca ids novos, estados nem datas', () => {
  const v = validarFormConhecimento({ titulo: 'Título', texto: 'Texto.', alertas: 'Um aviso', selecionadas: [{ fonteId: 'f-um', localizacao: 'página 2' }] }, [{ id: 'f-um', titulo: 'Fonte', revogada: false }]);
  assert.equal(v.ok, true);
  const corpo = corpoDaImportacao('link:f-um', v.dados, REV);
  assert.deepEqual(Object.keys(corpo).sort(), ['alertas', 'fonteIds', 'ref', 'referencias', 'revisao', 'texto', 'titulo']);
  assert.deepEqual([corpo.ref, corpo.revisao], ['link:f-um', REV]);
  for (const proibido of ['id', 'statusValidacao', 'publicado', 'origem', 'origemImportacao', 'ambiente', 'criadoEm', 'revisaoAtualidade']) assert.equal(Object.hasOwn(corpo, proibido), false, proibido);
  // fonte revogada continua recusada no formulário (a importação reaproveita as mesmas regras do cadastro)
  const rev = validarFormConhecimento({ titulo: 'T', texto: 'X.', alertas: '', selecionadas: [{ fonteId: 'f-um', localizacao: 'p. 1' }] }, [{ id: 'f-um', titulo: 'F', revogada: true }]);
  assert.equal(rev.ok, false);
  assert.ok(rev.erros.fontes);
});

test('II4. cliente: GET dos candidatos só lê; POST envia o corpo e o 201 é sucesso; uma gravação por vez; sem sessão não chama a rede', async () => {
  const { fetchImpl, chamadas } = servidorFalso({
    'GET /__admin/servicos/lac/importacao': () => ({ status: 200, json: async () => ({ revisao: REV, candidatos: [candidato()] }) }),
    'POST /__admin/servicos/lac/importacao': () => ({ status: 201, json: async () => ({ revisao: REV }) }),
  });
  const cliente = criarClienteAdmin({ fetchImpl });
  assert.equal((await cliente.carregarCandidatosDeImportacao('lac')).ok, false);
  assert.equal(chamadas.length, 0);
  assert.equal((await cliente.iniciarSessao()).ok, true);
  const l = await cliente.carregarCandidatosDeImportacao('lac');
  assert.deepEqual([l.ok, l.candidatos.length, l.revisao], [true, 1, REV]);
  const get = chamadas.at(-1);
  assert.deepEqual([get.method, get.headers[CABECALHO_TOKEN], get.corpo, get.credentials], ['GET', TOKEN, undefined, 'omit']);
  assert.equal(chamadas.filter((c) => c.method !== 'GET').length, 0, 'só a sessão e a leitura; nada de POST ao abrir');
  const corpo = { titulo: 'T', texto: 'X', fonteIds: ['f-um'], referencias: [{ fonteId: 'f-um', localizacao: 'p. 1' }], ref: 'descricao', revisao: REV };
  const g = await cliente.importarConteudo('lac', corpo);
  assert.equal(g.ok, true);
  const post = chamadas.at(-1);
  assert.deepEqual([post.method, post.url, post.corpo], ['POST', '/__admin/servicos/lac/importacao', corpo]);
  assert.equal((await cliente.importarConteudo('../x', corpo)).ok, false);
  assert.equal((await cliente.carregarCandidatosDeImportacao('Inválido!')).ok, false);
});

test('II5. mensagens: já importado, revisão divergente e versão congelada pedem recarregar; erros genéricos sem eco', async () => {
  assert.equal(mensagemDaRevisao(409, { erro: 'ja_importado' }).recarregar, true);
  assert.match(mensagemDaRevisao(409, { erro: 'ja_importado' }).mensagem, /já foi importado/);
  assert.equal(mensagemDaRevisao(409, { erro: 'revisao_divergente' }).recarregar, true);
  assert.equal(mensagemDaRevisao(409, { erro: 'versao_congelada' }).recarregar, true);
  assert.doesNotMatch(mensagemDaRevisao(422, { erro: 'dados_invalidos', campos: ['texto'], texto: 'segredo' }).mensagem, /segredo|texto/);
  const { fetchImpl } = servidorFalso({
    'POST /__admin/servicos/lac/importacao': () => ({ status: 409, json: async () => ({ erro: 'versao_congelada' }) }),
    'GET /__admin/servicos/lac/importacao': () => ({ status: 409, json: async () => ({ erro: 'versao_congelada' }) }),
  });
  const cliente = criarClienteAdmin({ fetchImpl });
  await cliente.iniciarSessao();
  const g = await cliente.importarConteudo('lac', { revisao: REV });
  assert.deepEqual([g.ok, g.recarregar], [false, true]);
  assert.equal((await cliente.carregarCandidatosDeImportacao('lac')).ok, false);
  assert.match(MENSAGEM_IMPORTADA, /em elaboração.*não está disponível no chatbot/);
  assert.equal(TEXTO_IMPORTACAO, 'Escolha somente as orientações que ainda são úteis. Os documentos e normas continuam disponíveis como fontes.');
  assert.match(HTML, /<h2 id="titulo-importacao" tabindex="-1">Orientações encontradas no conteúdo antigo<\/h2>/);
  assert.ok(JS.includes("'1 orientação encontrada.' : `${n} orientações encontradas.`"));
  assert.equal(ROTULOS_CANDIDATO.requisitos, 'Condições e requisitos');
});

test('II6. a página: botão, lista com "Importar" por item, foco/teclado, sem innerHTML nem armazenamento; nada é gravado ao abrir', () => {
  assert.match(HTML, /id="botao-importar"[^>]*aria-controls="cartao-importacao"[^>]*aria-expanded="false"[^>]*hidden>Importar conteúdo existente</);
  assert.match(HTML, /<section id="cartao-importacao"[^>]*aria-labelledby="titulo-importacao"[^>]*hidden>/);
  assert.match(HTML, /<h2 id="titulo-importacao" tabindex="-1">/);
  assert.match(HTML, /id="importacao-estado"[^>]*role="status"[^>]*aria-live="polite"/);
  assert.match(HTML, /id="importacao-lista"[^>]*aria-busy="false"/);
  assert.match(JS, /criarBotao\('Importar', `Importar: \$\{c\.titulo\}`/);
  assert.doesNotMatch(JS, /innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\(|localStorage|sessionStorage|document\.cookie|console\./);
  assert.doesNotMatch(LOGICA, /innerHTML|localStorage|sessionStorage|document\.cookie|console\./);
  // abrir só lê: a abertura chama a leitura e não a gravação; a gravação só ocorre na confirmação
  const abrir = JS.slice(JS.indexOf('async function abrirImportacao'), JS.indexOf('function fecharImportacao'));
  assert.match(abrir, /carregarCandidatos/);
  assert.doesNotMatch(abrir, /importarConteudo|gravarConhecimento/);
  const escolher = JS.slice(JS.indexOf('function escolherCandidato'), JS.indexOf("$('botao-importar').addEventListener"));
  assert.doesNotMatch(escolher, /importarConteudo|gravarConhecimento|cliente\./);
  // ids e referências internas nunca vão para o texto da tela
  const lista = JS.slice(JS.indexOf('function renderizarImportacao'), JS.indexOf('/** Lê os candidatos'));
  assert.doesNotMatch(lista, /textContent[^;]*\.(ref|fonteId|fonteIds)\b|criar\([^)]*c\.ref/);
  // o botão só aparece para versão editável; congelada exige "Criar nova versão para editar" (já existente)
  assert.match(JS, /\$\('botao-importar'\)\.hidden = !permitido/);
  assert.match(HTML, /Criar nova versão para editar/);
});

test('II7. aviso "Conteúdo antigo": fora do campo de texto, acessível, só no formulário importado e nunca enviado', () => {
  assert.match(HTML, /<p id="aviso-importacao"[^>]*role="note"[^>]*hidden>Conteúdo antigo: confira e atualize esta orientação antes de salvar\.<\/p>/);
  assert.match(HTML, /<form id="form-bloco"[^>]*aria-describedby="aviso-importacao"/);
  const escolher = JS.slice(JS.indexOf('function escolherCandidato'), JS.indexOf("$('botao-importar').addEventListener"));
  assert.match(escolher, /\$\('aviso-importacao'\)\.hidden = false/);
  assert.doesNotMatch(escolher, /bloco-texto'\)\.value = .*aviso/i);
  assert.match(JS, /\$\('aviso-importacao'\)\.hidden = true/);
  assert.doesNotMatch(LOGICA, /Conteúdo antigo: confira/);
  const v = validarFormConhecimento({ titulo: 'T', texto: 'Texto.', alertas: '', selecionadas: [{ fonteId: 'f-um', localizacao: 'p. 1' }] }, [{ id: 'f-um', titulo: 'F', revogada: false }]);
  assert.doesNotMatch(JSON.stringify(corpoDaImportacao('descricao', v.dados, REV)), /Conteúdo antigo/);
});
