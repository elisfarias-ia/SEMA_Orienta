// Passo 5C (interface): lógica pura de autorizar e publicar, cliente com fetch simulado e estrutura das páginas. Dados fictícios;
// nada é gravado e a rede não é usada.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  AVISO_AUTORIZACAO, MENSAGENS_PUBLICACAO, TEXTO_CONFIRMAR_AUTORIZACAO, TEXTO_CONFIRMAR_PUBLICACAO, TEXTO_DIFERENCA_ETAPAS,
  botoesDePublicacao, criarClienteAdmin, criarClienteGestao, corpoDaPublicacao, dataDaRevisaoBr, frasePublicacao,
  linhasDoResumoDePublicacao, mensagemDaPublicacao, resumirPublicacao,
} from '../admin/admin-logic.js';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lerTexto = (...p) => fs.readFileSync(path.join(RAIZ, ...p), 'utf8');
const TOKEN = 'ab'.repeat(32);
const REVISAO = 'cd'.repeat(32);
const TECNICO = /validado_materialmente|autorizado_publicacao|estado_invalido|revisao_divergente|hash_divergente|historico_incompativel|conteudo_excluido_citado|sem_informacao_aceita|operacao_em_andamento|revisao_incompleta|[0-9a-f]{64}/;
const RESUMO_API = (extra = {}) => ({ versao: 2, rotulo: 'Pronto para publicar', dataRevisao: '2026-03-15T10:00:00.000Z', informacoesAceitas: 3, links: 2, textos: 1, podeAutorizar: true, podePublicar: false, publicado: false, ...extra });

function servidorFalso(respostas = {}) {
  const chamadas = [];
  const r = (status, corpo) => ({ status, json: async () => corpo });
  const fetchImpl = async (url, opcoes = {}) => {
    chamadas.push({ url, metodo: opcoes.method, corpoTexto: opcoes.body, corpo: opcoes.body === undefined ? undefined : JSON.parse(opcoes.body) });
    const chave = `${opcoes.method} ${url}`;
    if (respostas[chave]) return respostas[chave](opcoes);
    if (url === '/__admin/sessao') return r(200, { token: TOKEN });
    if (chave === 'GET /__admin/servicos/servico-ficticio/publicacao/resumo') return r(200, RESUMO_API());
    if (chave === 'POST /__admin/servicos/servico-ficticio/autorizacao' || chave === 'POST /__admin/servicos/servico-ficticio/publicacao') return r(200, { estado: 'x', revisao: REVISAO });
    return r(404, { erro: 'nao_encontrado' });
  };
  return { fetchImpl, chamadas };
}

test('PU1. resumirPublicacao: números, data em dd/mm/aaaa e etapa; formato inválido vira null', () => {
  const r = resumirPublicacao(RESUMO_API());
  assert.deepEqual([r.versao, r.dataRevisao, r.informacoesAceitas, r.links, r.textos, r.etapa], [2, '15/03/2026', 3, 2, 1, 'autorizar']);
  assert.equal(resumirPublicacao(RESUMO_API({ podeAutorizar: false, podePublicar: true })).etapa, 'publicar');
  assert.equal(resumirPublicacao(RESUMO_API({ podeAutorizar: false, podePublicar: false, publicado: true })).etapa, 'publicado');
  assert.equal(resumirPublicacao(RESUMO_API({ podeAutorizar: false })).etapa, 'indisponivel');
  // publicado vence qualquer "pode": nunca oferece ação sobre versão congelada
  const pub = resumirPublicacao(RESUMO_API({ publicado: true, podeAutorizar: true, podePublicar: true }));
  assert.deepEqual([pub.podeAutorizar, pub.podePublicar, pub.etapa], [false, false, 'publicado']);
  assert.equal(resumirPublicacao(RESUMO_API({ dataRevisao: null })).dataRevisao, null);
  assert.equal(resumirPublicacao(RESUMO_API({ dataRevisao: 'ontem' })).dataRevisao, null);
  assert.equal(resumirPublicacao(RESUMO_API({ links: -1, textos: 'x' })).links, 0);
  for (const ruim of [null, [], 'x', {}, RESUMO_API({ versao: 0 }), RESUMO_API({ versao: '2' })]) assert.equal(resumirPublicacao(ruim), null);
  assert.equal(dataDaRevisaoBr('2026-12-01'), '01/12/2026');
  assert.equal(dataDaRevisaoBr('2026-12-01T23:59:59-03:00'), '01/12/2026');
});

test('PU2. estados dos botões: só o da etapa aparece e tudo é desabilitado durante o envio', () => {
  const por = (extra) => botoesDePublicacao(resumirPublicacao(RESUMO_API(extra)));
  assert.deepEqual(por({}), { autorizar: { visivel: true, habilitado: true }, publicar: { visivel: false, habilitado: false }, novaVersao: { visivel: false, habilitado: false } });
  assert.deepEqual(por({ podeAutorizar: false, podePublicar: true }), { autorizar: { visivel: false, habilitado: false }, publicar: { visivel: true, habilitado: true }, novaVersao: { visivel: false, habilitado: false } });
  assert.deepEqual(por({ podeAutorizar: false, publicado: true }), { autorizar: { visivel: false, habilitado: false }, publicar: { visivel: false, habilitado: false }, novaVersao: { visivel: true, habilitado: true } });
  assert.deepEqual(botoesDePublicacao(null).autorizar, { visivel: false, habilitado: false });
  assert.deepEqual(botoesDePublicacao(resumirPublicacao(RESUMO_API()), true).autorizar, { visivel: true, habilitado: false });
});

test('PU3. diálogo e painel: versão, data, quantidades, avisos e a diferença entre revisar, autorizar e publicar', () => {
  const r = resumirPublicacao(RESUMO_API());
  assert.deepEqual(linhasDoResumoDePublicacao(r), [
    { rotulo: 'Versão', valor: '2' }, { rotulo: 'Data da revisão', valor: '15/03/2026' }, { rotulo: 'Informações aceitas', valor: '3' }, { rotulo: 'Links', valor: '2' }, { rotulo: 'Textos', valor: '1' },
  ]);
  assert.equal(linhasDoResumoDePublicacao(resumirPublicacao(RESUMO_API({ dataRevisao: null })))[1].valor, 'Não informada');
  assert.equal(AVISO_AUTORIZACAO, 'A próxima ação disponibilizará conteúdo ao cidadão.');
  assert.match(TEXTO_DIFERENCA_ETAPAS, /Revisar é.*Autorizar é.*Publicar é/);
  assert.notEqual(TEXTO_CONFIRMAR_AUTORIZACAO, TEXTO_CONFIRMAR_PUBLICACAO);
  assert.match(TEXTO_CONFIRMAR_AUTORIZACAO, /Ainda não publica/);
  assert.match(frasePublicacao(r), /a publicação ainda não foi autorizada.*15\/03\/2026.*3 informações aceitas, 2 links e 1 texto\./);
  assert.match(frasePublicacao(resumirPublicacao(RESUMO_API({ podeAutorizar: false, podePublicar: true }))), /Publicação autorizada, mas ainda não publicada/);
  assert.match(frasePublicacao(resumirPublicacao(RESUMO_API({ podeAutorizar: false, publicado: true, informacoesAceitas: 1, links: 1, textos: 0 }))), /^Publicado\. Esta versão \(2\) já está disponível ao cidadão.*Revisão concluída em 15\/03\/2026.*1 informação aceita, 1 link e 0 textos\./);
  const comData = frasePublicacao(resumirPublicacao(RESUMO_API({ podeAutorizar: false, publicado: true, dataPublicacao: '2026-04-02' })));
  assert.match(comData, /Publicado em 02\/04\/2026\./);
  assert.doesNotMatch(comData, /Revisão concluída em/);
  assert.equal(resumirPublicacao(RESUMO_API({ dataPublicacao: 'ontem' })).dataPublicacao, null);
  assert.match(frasePublicacao(resumirPublicacao(RESUMO_API({ podeAutorizar: false }))), /não está disponível agora/);
  for (const t of [frasePublicacao(r), TEXTO_DIFERENCA_ETAPAS, TEXTO_CONFIRMAR_AUTORIZACAO, TEXTO_CONFIRMAR_PUBLICACAO, ...Object.values(MENSAGENS_PUBLICACAO)]) assert.doesNotMatch(t, TECNICO);
});

test('PU4. corpo: apenas a revisão', () => {
  assert.deepEqual(corpoDaPublicacao(REVISAO), { revisao: REVISAO });
});

test('PU5. mensagens de erro: linguagem comum, recarga quando os dados mudaram e nunca o código técnico', () => {
  const casos = [
    [409, 'revisao_divergente', /O conteúdo mudou\. Os dados foram atualizados/, true],
    [409, 'estado_invalido', /não está mais na etapa de autorizar/, true],
    [409, 'operacao_em_andamento', /Outra gravação está em andamento/, undefined],
    [422, 'revisao_incompleta', /pendências na revisão/, true],
    [422, 'hash_divergente', /conferência do conteúdo não permitiu autorizar/, true],
    [422, 'historico_incompativel', /conferência do conteúdo não permitiu autorizar/, true],
    [422, 'conteudo_excluido_citado', /cita um documento ou link excluído/, true],
    [422, 'sem_informacao_aceita', /nenhuma informação aceita/, true],
    [500, 'falha_de_escrita', /não conseguiu autorizar\. Nada foi alterado/, undefined],
    [500, 'desfazer_incompleto', /não terminou por completo/, true],
    [401, null, /sessão administrativa/, undefined],
    [418, 'x', /Não foi possível autorizar\. Nada foi alterado/, undefined],
  ];
  for (const [status, erro, esperado, recarregar] of casos) {
    const m = mensagemDaPublicacao(status, erro === null ? null : { erro }, 'autorizar');
    assert.match(m.mensagem, esperado, `${status} ${erro}`);
    assert.equal(m.recarregar, recarregar, `${status} ${erro}`);
    assert.doesNotMatch(m.mensagem, TECNICO);
  }
  assert.match(mensagemDaPublicacao(409, { erro: 'estado_invalido' }, 'publicar').mensagem, /etapa de publicar/);
  assert.match(mensagemDaPublicacao(500, {}, 'publicar').mensagem, /não conseguiu publicar/);
  assert.equal(mensagemDaPublicacao(500, { erro: 'x', detalhe: 'C:\\segredo' }, 'publicar').mensagem.includes('segredo'), false);
});

for (const [nome, criar] of [['cliente do conteúdo', criarClienteAdmin], ['cliente da gestão', criarClienteGestao]]) {
  test(`PU6. ${nome}: lê o resumo (GET sem corpo) e devolve só o que a tela usa`, async () => {
    const s = servidorFalso();
    const c = criar({ fetchImpl: s.fetchImpl });
    assert.equal((await c.carregarResumoPublicacao('servico-ficticio')).ok, false, 'sem sessão não chama');
    assert.equal(s.chamadas.length, 0);
    await (c.iniciarSessao ?? c.entrar)();
    const r = await c.carregarResumoPublicacao('servico-ficticio');
    assert.deepEqual([r.ok, r.etapa, r.versao], [true, 'autorizar', 2]);
    const get = s.chamadas.at(-1);
    assert.deepEqual([get.metodo, get.url, get.corpoTexto], ['GET', '/__admin/servicos/servico-ficticio/publicacao/resumo', undefined]);
    assert.equal((await c.carregarResumoPublicacao('../x')).ok, false);
    assert.equal(s.chamadas.at(-1), get, 'id inválido não chama a rede');
  });
}

test('PU7. cliente: autorizar e publicar enviam só a revisão, uma por vez, e traduzem o erro', async () => {
  const portao = {};
  portao.promessa = new Promise((resolver) => { portao.liberar = resolver; });
  const s = servidorFalso({
    'POST /__admin/servicos/servico-ficticio/autorizacao': async () => { await portao.promessa; return { status: 200, json: async () => ({ revisao: REVISAO }) }; },
    'POST /__admin/servicos/servico-ficticio/publicacao': () => ({ status: 422, json: async () => ({ erro: 'sem_informacao_aceita' }) }),
  });
  const c = criarClienteAdmin({ fetchImpl: s.fetchImpl });
  await c.iniciarSessao();
  const primeira = c.gravarRevisao('autorizar', 'servico-ficticio', corpoDaPublicacao(REVISAO));
  const segunda = await c.gravarRevisao('autorizar', 'servico-ficticio', corpoDaPublicacao(REVISAO));
  assert.equal(segunda.ok, false);
  assert.equal(segunda.emAndamento, true);
  portao.liberar();
  assert.deepEqual(await primeira, { ok: true });
  const posts = s.chamadas.filter((x) => x.metodo === 'POST');
  assert.equal(posts.length, 1, 'clique duplo = uma única requisição');
  assert.deepEqual(posts[0].corpo, { revisao: REVISAO });
  const falha = await c.gravarRevisao('publicar', 'servico-ficticio', corpoDaPublicacao(REVISAO));
  assert.equal(falha.ok, false);
  assert.match(falha.mensagem, /nenhuma informação aceita/);
  assert.equal(falha.recarregar, true);
  assert.equal(s.chamadas.at(-1).url, '/__admin/servicos/servico-ficticio/publicacao');
  assert.deepEqual(s.chamadas.at(-1).corpo, { revisao: REVISAO });
});

test('PU8. páginas: diálogos distintos, rótulos acessíveis, sem armazenamento do navegador e sem innerHTML', () => {
  const html = lerTexto('admin', 'conteudo', 'index.html');
  const js = lerTexto('admin', 'conteudo', 'conteudo.js');
  for (const id of ['cartao-publicacao', 'titulo-publicacao', 'botao-autorizar', 'botao-publicar', 'dialogo-autorizacao', 'dialogo-publicacao', 'autorizacao-confirmar', 'publicacao-confirmar']) assert.match(html, new RegExp(`id="${id}"`), id);
  assert.match(html, /<h2 id="titulo-publicacao" tabindex="-1">/);
  assert.match(html, /aria-labelledby="autorizacao-titulo"/);
  assert.match(html, /aria-labelledby="publicacao-titulo-dialogo"/);
  assert.match(html, /Autorizar publicação/);
  assert.match(html, /Concluir a revisão não publica nada/);
  for (const trecho of [js, lerTexto('admin', 'admin.js'), lerTexto('admin', 'admin-logic.js')]) assert.doesNotMatch(trecho, /innerHTML|localStorage|sessionStorage|document\.cookie/);
  // nada é enviado ao carregar: as ações só ficam em ouvintes de clique
  assert.doesNotMatch(js, /^(await\s+)?cliente\.gravarRevisao/m);
});
