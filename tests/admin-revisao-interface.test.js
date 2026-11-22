// Passo 5B2: interface da revisão ("Gestão de conteúdo"): lógica pura, cliente com fetch simulado, estrutura de acessibilidade e
// regras de linguagem e segurança do código das duas páginas. Dados fictícios; nada é gravado e a rede não é usada.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CABECALHO_TOKEN, MENSAGEM_REVISAO_DIVERGENTE, TEXTO_CONFIRMAR_ENVIO, criarClienteAdmin, criarClienteGestao,
  ACAO_DO_CONTROLE, AVISO_AJUSTES_SOLICITADOS, AVISO_EM_ANALISE, AVISO_MOTIVO_AJUSTES, AVISO_VALIDACAO_LOCAL, MENSAGENS_REVISAO, TEXTO_CONFIRMAR_AJUSTES, TEXTO_CONFIRMAR_VALIDACAO, fraseDaEtapaDeRevisao,
  AVISO_EDITAR_FONTE, PASSOS_PARA_RESOLVER, TEXTO_CONFIRMAR_EXCLUSAO_FONTE, TEXTO_EXCLUSAO_APLICADA_NA_PUBLICACAO, fraseBlocosReabertos, frasesConteudoAntigo, mensagemDaFonte,
  pendenciasDaUrl, resumirImpacto, validarEdicaoDeFonte,
  explicarFontesPendentes, frasePendenciasParaConcluir, mensagemDaRevisao, resumirRevisao, servicoDaUrl, traduzirPendencia,
} from '../admin/admin-logic.js';
import { USUARIOS_SELECIONAVEIS } from '../services/admin/atores.js';

// Passo 8B: a sessão responde no formato novo (usuário escolhido, usuários selecionáveis e token).
const sessaoCom = (token) => ({ usuario: { ...USUARIOS_SELECIONAVEIS[0] }, usuarios: USUARIOS_SELECIONAVEIS.map((u) => ({ ...u })), token });

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lerTexto = (...p) => fs.readFileSync(path.join(RAIZ, ...p), 'utf8');
const HTML_CONTEUDO = lerTexto('admin', 'conteudo', 'index.html');
const JS_CONTEUDO = lerTexto('admin', 'conteudo', 'conteudo.js');
const HTML_ADMIN = lerTexto('admin', 'index.html');
const JS_ADMIN = lerTexto('admin', 'admin.js');
const LOGICA = lerTexto('admin', 'admin-logic.js');
const CSS = lerTexto('admin', 'styles.css');
const TOKEN = 'ab'.repeat(32);
const TECNICO = /rascunho|em_validacao|validado_materialmente|autorizado|\bpublicado\b|sem_bloco_aceito|bloco_pendente|fonte_pendente|fonte_revogada|fonte_inexistente|entrada_invalida|revisao_divergente|versao_congelada|[0-9a-f]{64}/;

const REVISAO_API = (extra = {}) => ({
  servicoId: 'servico-ficticio', versaoId: 'servico-ficticio-v1', estadoVersao: 'rascunho', rotulo: 'Em elaboração', revisaoPendente: true, editavel: true,
  revisao: 'cd'.repeat(32), resumo: { fontesPendentes: 1, informacoesPendentes: 1, informacoesAceitas: 0, fontesNaoUsadas: 0, pendenciasParaConcluir: 2 },
  fontes: [
    { id: 'f-um', titulo: 'Portal Um', forma: 'link', revisada: false, revogada: false, usadaPorBloco: true, podeRevisar: true },
    { id: 'f-dois', titulo: 'Texto Dois', forma: 'texto', revisada: true, revogada: false, usadaPorBloco: false, podeRevisar: false, texto: 'TEXTO-ORIGINAL-SECRETO' },
  ],
  blocos: [{ id: 'bc-aaaaaaaaaaaa', titulo: 'Como iniciar', aceito: false, fontesPendentes: ['f-um'], podeAceitar: false, podeReabrir: false, podeRejeitar: true }],
  pendencias: [{ codigo: 'bloco_pendente', id: 'bc-aaaaaaaaaaaa', titulo: 'Como iniciar' }, { codigo: 'fonte_pendente', id: 'f-um', titulo: 'Portal Um' }],
  podeEnviar: false, ...extra,
});

function servidorFalso(respostas = {}, portao = null) {
  const chamadas = [];
  const r = (status, corpo) => ({ status, json: async () => corpo });
  const base = '/__admin/servicos/servico-ficticio';
  const fetchImpl = async (url, opcoes = {}) => {
    chamadas.push({ url, metodo: opcoes.method, cabecalhos: opcoes.headers, corpoTexto: opcoes.body, corpo: opcoes.body === undefined ? undefined : JSON.parse(opcoes.body) });
    const chave = `${opcoes.method} ${url}`;
    if (respostas[chave]) return respostas[chave](opcoes);
    if (url === '/__admin/sessao') return r(200, sessaoCom(TOKEN));
    if (chave === `GET ${base}/revisao`) return r(200, REVISAO_API());
    if (opcoes.method === 'POST' && url.startsWith(base)) {
      if (portao) await portao;
      return url.endsWith('nova-versao') ? r(201, { numero: 2 }) : r(200, { revisao: 'ef'.repeat(32) });
    }
    return r(404, { erro: 'nao_encontrado' });
  };
  return { fetchImpl, chamadas };
}

// ---------- Lógica pura ----------

test('RV1. resumirRevisao: linguagem comum, sem ids de estado, sem texto original e com formato inválido devolvendo null', () => {
  const r = resumirRevisao(REVISAO_API());
  assert.equal(r.rotulo, 'Em elaboração');
  assert.equal(r.revisaoPendente, true);
  assert.deepEqual(r.fontes.map((f) => [f.rotuloForma, f.situacao]), [['Link', 'Revisão pendente'], ['Texto informado', 'Revisado']]);
  assert.equal(r.blocos[0].situacao, 'Em elaboração');
  // Fonte que nenhum bloco usa: "Ainda não revisada" (não é pendência para enviar); usada e pendente: "Revisão pendente".
  const naoUsada = resumirRevisao(REVISAO_API({ fontes: [{ id: 'f-nu', titulo: 'Sem uso', forma: 'link', revisada: false, revogada: false, usadaPorBloco: false, podeRevisar: true }, { id: 'f-u', titulo: 'Em uso', forma: 'link', revisada: false, revogada: false, usadaPorBloco: true, podeRevisar: true }] }));
  assert.deepEqual(naoUsada.fontes.map((f) => f.situacao), ['Ainda não revisada', 'Revisão pendente']);
  // O resumo usa só pendenciasParaConcluir (= tamanho da lista de impedimentos), nunca soma outros números.
  assert.equal(r.resumo.pendenciasParaConcluir, r.pendencias.length);
  assert.equal(frasePendenciasParaConcluir(r.resumo), '2 pendências para enviar à revisão. Informações aceitas: 0.');
  assert.match(frasePendenciasParaConcluir({ pendenciasParaConcluir: 3, informacoesAceitas: 1, fontesNaoUsadas: 2 }), /3 pendências para enviar à revisão\. Informações aceitas: 1\. 2 documentos ou links ainda não são usados.*não impede o envio/);
  assert.doesNotMatch(frasePendenciasParaConcluir({ pendenciasParaConcluir: 0, informacoesAceitas: 1, fontesNaoUsadas: 0 }), /usados|impede/);
  assert.equal(resumirRevisao(REVISAO_API({ revisaoPendente: false })).revisaoPendente, true, 'o selo segue a lista de pendências, não um campo isolado');
  assert.equal(resumirRevisao(REVISAO_API({ pendencias: [], revisaoPendente: true })).revisaoPendente, false);
  assert.equal(resumirRevisao(REVISAO_API({ fontes: [{ id: 'f-x', titulo: 'Velha', forma: 'link', revisada: true, revogada: true }] })).fontes[0].situacao, 'Revogada');
  assert.equal(resumirRevisao(REVISAO_API({ blocos: [{ id: 'bc-bbbbbbbbbbbb', titulo: 'Pronta', aceito: true, fontesPendentes: [], podeReabrir: true }] })).blocos[0].situacao, 'Aceita');
  assert.doesNotMatch(JSON.stringify(r), /TEXTO-ORIGINAL-SECRETO/);
  assert.equal(r.podeEnviar, false);
  assert.equal(r.podeConcluir, undefined, 'Passo 8D: podeConcluir não existe mais');
  assert.equal(resumirRevisao(REVISAO_API({ podeEnviar: true })).podeEnviar, true);
  assert.equal(r.etapa, 'elaboracao');
  const pronta = resumirRevisao(REVISAO_API({ estadoVersao: 'validado_materialmente', rotulo: 'Pronto para publicar', revisaoPendente: false, editavel: false, podeEnviar: true, podeValidar: true }));
  assert.equal(pronta.congelada, true);
  assert.deepEqual([pronta.etapa, pronta.podeEnviar, pronta.podeValidar, pronta.podeNovaVersao], ['concluida', false, false, true], 'versão congelada nunca oferece enviar');
  for (const ruim of [null, [], {}, REVISAO_API({ revisao: '' }), REVISAO_API({ fontes: 'x' }), REVISAO_API({ resumo: null })]) assert.equal(resumirRevisao(ruim), null);
});

test('RV2. traduzirPendencia: cada código vira frase comum, sem o código técnico', () => {
  const codigos = ['sem_bloco_aceito', 'bloco_pendente', 'fonte_pendente', 'fonte_revogada', 'fonte_inexistente', 'entrada_invalida', 'codigo_novo'];
  const frases = codigos.map((codigo) => traduzirPendencia({ codigo, titulo: 'Item X' }));
  assert.equal(new Set(frases).size, codigos.length, 'frases distintas');
  for (const f of frases) assert.doesNotMatch(f, TECNICO);
  assert.match(frases[1], /"Item X"/);
  assert.equal(traduzirPendencia({ codigo: 'sem_bloco_aceito' }), 'Inclua e aceite pelo menos uma informação para enviar para revisão.');
  assert.match(traduzirPendencia(null), /pendência/);
});

test('RV3. explicarFontesPendentes cita os títulos que faltam revisar', () => {
  const r = resumirRevisao(REVISAO_API());
  assert.equal(explicarFontesPendentes(r.blocos[0], r.fontes), 'Para aceitar esta informação, marque antes como revisado: "Portal Um".');
  assert.equal(explicarFontesPendentes({ fontesPendentes: [] }, r.fontes), '');
});

test('RV4. mensagemDaRevisao: textos curtos por código, divergência recarrega e nada do corpo bruto aparece', () => {
  const m = mensagemDaRevisao(409, { erro: 'revisao_divergente', detalhe: 'SEGREDO-BRUTO' });
  assert.equal(m.mensagem, 'O conteúdo mudou. Os dados foram atualizados; confira e tente de novo.');
  assert.equal(m.mensagem, MENSAGEM_REVISAO_DIVERGENTE);
  assert.equal(m.recarregar, true);
  const codigos = [[409, 'versao_congelada'], [409, 'fonte_ja_revisada'], [409, 'bloco_ja_aceito'], [409, 'operacao_em_andamento'], [409, 'estado_nao_permite_nova_versao'],
    [409, 'estado_invalido'], [422, 'motivo_invalido'], [422, 'hash_divergente'],
    [422, 'revisao_incompleta'], [422, 'fonte_pendente'], [422, 'fonte_revogada'], [422, 'bloco_nao_aceitavel'], [422, 'bloco_nao_aceito'], [422, 'bloco_sem_fonte'],
    [422, 'entrada_invalida'], [422, 'dados_invalidos'], [422, 'base_invalida'], [404, 'nao_encontrado'], [500, 'indisponivel'], [500, 'historico_indisponivel'], [500, 'desfazer_incompleto']];
  for (const [status, erro] of codigos) {
    const x = mensagemDaRevisao(status, { erro, detalhe: 'SEGREDO-BRUTO', caminho: 'C:\\dados' });
    assert.ok(x.mensagem.length > 10 && x.mensagem.length < 160, `${erro}: mensagem curta`);
    assert.doesNotMatch(x.mensagem, TECNICO);
    assert.doesNotMatch(x.mensagem, /SEGREDO|C:\\|stack/);
  }
  assert.equal(mensagemDaRevisao(409, { erro: 'operacao_em_andamento' }).recarregar, undefined);
});

test('RV5. servicoDaUrl aceita só um id válido e ignora o resto', () => {
  assert.equal(servicoDaUrl('?servico=servico-ficticio'), 'servico-ficticio');
  for (const ruim of ['', '?servico=', '?servico=../x', '?servico=A B', '?servico=Servico', '?servico=1abc', `?servico=${'a'.repeat(61)}`, '?outro=x', null, undefined, 42]) assert.equal(servicoDaUrl(ruim), null, String(ruim));
});

// ---------- Cliente ----------

test('RV6. carregarRevisao só lê (GET com token) e devolve o resumo; sem sessão não chama a rede', async () => {
  const s = servidorFalso();
  const c = criarClienteAdmin({ fetchImpl: s.fetchImpl });
  assert.equal((await c.carregarRevisao('servico-ficticio')).ok, false);
  assert.equal(s.chamadas.length, 0);
  await c.iniciarSessao();
  const r = await c.carregarRevisao('servico-ficticio');
  assert.equal(r.ok, true);
  assert.equal(r.revisao, 'cd'.repeat(32));
  const leitura = s.chamadas.at(-1);
  assert.equal(leitura.metodo, 'GET');
  assert.equal(leitura.url, '/__admin/servicos/servico-ficticio/revisao');
  assert.equal(leitura.cabecalhos[CABECALHO_TOKEN], TOKEN);
  assert.equal(leitura.corpoTexto, undefined);
  assert.equal((await c.carregarRevisao('../x')).ok, false);
});

test('RV7. gravarRevisao: rota certa para cada ação, JSON, revisão enviada e nova versão com exatamente {}', async () => {
  const s = servidorFalso();
  const c = criarClienteAdmin({ fetchImpl: s.fetchImpl });
  await c.iniciarSessao();
  const base = '/__admin/servicos/servico-ficticio';
  const casos = [
    ['fonte', { fonteId: 'f-um', revisao: 'r1' }, `${base}/revisao/fontes`],
    ['bloco-aceitar', { blocoId: 'bc-aaaaaaaaaaaa', revisao: 'r1' }, `${base}/revisao/blocos/aceitar`],
    ['bloco-rejeitar', { blocoId: 'bc-aaaaaaaaaaaa', revisao: 'r1' }, `${base}/revisao/blocos/rejeitar`],
    ['bloco-reabrir', { blocoId: 'bc-aaaaaaaaaaaa', revisao: 'r1' }, `${base}/revisao/blocos/reabrir`],
    ['enviar', { revisao: 'r1' }, `${base}/revisao/enviar`],
    ['validar', { revisao: 'r1' }, `${base}/revisao/validar`],
    ['ajustes', { revisao: 'r1', motivo: 'Motivo fictício.' }, `${base}/revisao/ajustes`],
  ];
  for (const [acao, corpo, rota] of casos) {
    const r = await c.gravarRevisao(acao, 'servico-ficticio', corpo);
    assert.equal(r.ok, true, acao);
    const ultima = s.chamadas.at(-1);
    assert.equal(ultima.metodo, 'POST');
    assert.equal(ultima.url, rota);
    assert.equal(ultima.cabecalhos['Content-Type'], 'application/json');
    assert.equal(ultima.cabecalhos[CABECALHO_TOKEN], TOKEN);
    assert.equal(ultima.corpo.revisao, 'r1', 'a revisão atual vai em toda ação');
  }
  const nova = await c.gravarRevisao('nova-versao', 'servico-ficticio', { revisao: 'não deve ir' });
  assert.equal(nova.ok, true);
  const ultima = s.chamadas.at(-1);
  assert.equal(ultima.url, `${base}/nova-versao`);
  assert.equal(ultima.corpoTexto, '{}', 'corpo exatamente {}');
  assert.equal(ultima.cabecalhos['Content-Type'], 'application/json');
  assert.equal((await c.gravarRevisao('publicar-tudo', 'servico-ficticio', {})).ok, false, 'só existem as ações fixas');
  assert.equal((await c.gravarRevisao('concluir', 'servico-ficticio', { revisao: 'r1' })).ok, false, 'Passo 8D: a ação concluir não existe mais');
  assert.equal(s.chamadas.some((x) => x.url.endsWith('/revisao/concluir')), false);
  // 5C: autorizar e publicar são as únicas ações de publicação, cada uma com a revisão atual e rota própria
  for (const [acao, rota] of [['autorizar', 'autorizacao'], ['publicar', 'publicacao']]) {
    assert.equal((await c.gravarRevisao(acao, 'servico-ficticio', { revisao: 'r1' })).ok, true, acao);
    assert.equal(s.chamadas.at(-1).url, `${base}/${rota}`);
    assert.deepEqual(s.chamadas.at(-1).corpo, { revisao: 'r1' });
  }
  assert.equal((await c.gravarRevisao('fonte', '../x', {})).ok, false);
});

test('RV8. clique duplo: com uma ação em andamento a segunda nem é enviada', async () => {
  let liberar;
  const portao = new Promise((fim) => { liberar = fim; });
  const s = servidorFalso({}, portao);
  const c = criarClienteAdmin({ fetchImpl: s.fetchImpl });
  await c.iniciarSessao();
  const primeira = c.gravarRevisao('fonte', 'servico-ficticio', { fonteId: 'f-um', revisao: 'r1' });
  assert.equal(c.gravando(), true);
  const segunda = await c.gravarRevisao('fonte', 'servico-ficticio', { fonteId: 'f-um', revisao: 'r1' });
  assert.equal(segunda.ok, false);
  assert.equal(segunda.emAndamento, true);
  liberar();
  assert.equal((await primeira).ok, true);
  assert.equal(s.chamadas.filter((x) => x.metodo === 'POST').length, 1);
  assert.equal(c.gravando(), false);
});

test('RV9. erros 409 de divergência pedem recarregar; falha de rede e 500 viram mensagens fixas', async () => {
  const base = '/__admin/servicos/servico-ficticio';
  const falha = (status, corpo) => async () => ({ status, json: async () => corpo });
  let s = servidorFalso({ [`POST ${base}/revisao/fontes`]: falha(409, { erro: 'revisao_divergente', detalhe: 'SEGREDO-BRUTO' }) });
  let c = criarClienteAdmin({ fetchImpl: s.fetchImpl });
  await c.iniciarSessao();
  let r = await c.gravarRevisao('fonte', 'servico-ficticio', { fonteId: 'f-um', revisao: 'velha' });
  assert.deepEqual([r.ok, r.recarregar, r.mensagem], [false, true, MENSAGEM_REVISAO_DIVERGENTE]);
  s = servidorFalso({ [`POST ${base}/revisao/validar`]: async () => { throw new Error('rede C:\\segredo'); } });
  c = criarClienteAdmin({ fetchImpl: s.fetchImpl });
  await c.iniciarSessao();
  r = await c.gravarRevisao('validar', 'servico-ficticio', { revisao: 'r' });
  assert.equal(r.ok, false);
  assert.doesNotMatch(r.mensagem, /segredo|C:\\/);
});

test('RV10. cliente da gestão: carrega a revisão e cria nova versão enviando {}', async () => {
  const s = servidorFalso();
  const c = criarClienteGestao({ fetchImpl: s.fetchImpl });
  assert.equal((await c.criarNovaVersao('servico-ficticio')).ok, false, 'sem entrada não grava');
  await c.entrar();
  assert.equal((await c.carregarRevisao('servico-ficticio')).rotulo, 'Em elaboração');
  const r = await c.criarNovaVersao('servico-ficticio');
  assert.equal(r.ok, true);
  const ultima = s.chamadas.at(-1);
  assert.equal(ultima.url, '/__admin/servicos/servico-ficticio/nova-versao');
  assert.equal(ultima.corpoTexto, '{}');
  assert.equal(ultima.cabecalhos['Content-Type'], 'application/json');
});

// ---------- Estrutura e código das páginas ----------

test('RV11. /admin/conteudo/: seções, diálogos próprios, texto de confirmação e nenhum botão de publicação', () => {
  assert.match(HTML_CONTEUDO, /<h2 id="titulo-fontes-revisao">Documentos e links<\/h2>/);
  assert.match(HTML_CONTEUDO, /<h2 id="titulo-blocos">Informações cadastradas<\/h2>/);
  assert.match(HTML_CONTEUDO, /<h2 id="titulo-conclusao" tabindex="-1">Revisão e validação<\/h2>/);
  assert.match(HTML_CONTEUDO, /<dialog id="dialogo-descarte" class="dialogo" aria-labelledby="descarte-titulo" aria-describedby="descarte-descricao">/);
  assert.match(HTML_CONTEUDO, /<dialog id="dialogo-conclusao" class="dialogo" aria-labelledby="conclusao-titulo-dialogo" aria-describedby="conclusao-descricao-dialogo">/);
  assert.ok(HTML_CONTEUDO.includes(TEXTO_CONFIRMAR_ENVIO), 'texto exato da confirmação do envio no diálogo');
  assert.equal(TEXTO_CONFIRMAR_ENVIO, 'Depois de enviar, esta versão não poderá mais ser editada e aguardará a análise do Revisor. Para fazer novas alterações, será necessário criar uma nova versão.');
  assert.ok(HTML_CONTEUDO.includes(TEXTO_CONFIRMAR_VALIDACAO), 'texto exato da confirmação da validação');
  assert.ok(HTML_CONTEUDO.includes(TEXTO_CONFIRMAR_AJUSTES), 'texto exato da confirmação dos ajustes');
  assert.doesNotMatch(HTML_CONTEUDO + LOGICA, /revisão para demonstração|AVISO_REVISAO_DEMONSTRACAO/, 'sem o aviso de demonstração');
  assert.match(HTML_CONTEUDO, /id="botao-nova-versao"[^>]*hidden>(?:<svg[^>]*><use[^>]*><\/use><\/svg>)?Criar nova versão para editar</);
  assert.match(HTML_CONTEUDO, /id="botao-enviar"[^>]*hidden>(?:<svg[^>]*><use[^>]*><\/use><\/svg>)?Enviar para revisão</);
  assert.match(HTML_CONTEUDO, /id="botao-validar"[^>]*hidden>(?:<svg[^>]*><use[^>]*><\/use><\/svg>)?Validar materialmente</);
  assert.match(HTML_CONTEUDO, /id="botao-ajustes"[^>]*hidden>Solicitar ajustes</);
  assert.doesNotMatch(HTML_CONTEUDO, /botao-concluir|Concluir revisão|Confirmar conclusão/, 'Passo 8D: sem o antigo concluir');
  const botoes = [...(HTML_CONTEUDO + HTML_ADMIN).matchAll(/<button[^>]*>([^<]*)<\/button>/g)].map((m) => m[1]);
  assert.ok(botoes.length > 10);
  // 5C: o único botão com o verbo "Publicar" é o da etapa de publicação (a autorização tem rótulo próprio).
  assert.deepEqual(botoes.filter((b) => /publicar/i.test(b)), ['Publicar']);
  assert.doesNotMatch(JS_CONTEUDO + JS_ADMIN, /(criar|criarBotao)\([^)]*'Publicar/i);
  assert.doesNotMatch(HTML_CONTEUDO + HTML_ADMIN, /type="radio"|wizard|checkpoint|avançad/i);
  assert.doesNotMatch(HTML_ADMIN, /<details/i);
  assert.equal((HTML_CONTEUDO.match(/<details/g) ?? []).length, 0, 'sem seção recolhida de itens excluídos');
  assert.doesNotMatch(HTML_CONTEUDO, /\bbc-[0-9a-f]{12}\b|[0-9a-f]{64}|hashConteudo|statusValidacao/);
  assert.match(HTML_CONTEUDO, /href="\.\.\/">(?:<svg[^>]*><use[^>]*><\/use><\/svg>)?Gestão de conteúdo<\/a>/);
  assert.doesNotMatch(HTML_CONTEUDO + HTML_ADMIN + lerTexto('admin', 'saude', 'index.html'), /Cadastro da base/);
});

test('RV12. conteudo.js: revisão enviada em toda ação, divergência recarrega, trava, foco na mensagem e rótulos comuns', () => {
  assert.equal((JS_CONTEUDO.match(/cliente\.gravarRevisao\(/g) ?? []).length, 1, 'uma única porta para as ações de revisão');
  const executar = /async function executarRevisao\([\s\S]*?\r?\n\}\r?\n/.exec(JS_CONTEUDO)[0];
  assert.match(executar, /acao === 'nova-versao' \? \{\} : \{ \.\.\.extra, revisao: revisao\.revisao \}/);
  assert.match(executar, /if \(cliente\.gravando\(\) \|\| ocupado \|\| contexto === null \|\| revisao === null\) return;/);
  assert.match(executar, /r\.recarregar\) await carregarServico/);
  assert.match(executar, /mostrarStatus\(r\.mensagem, 'erro', true\)/);
  assert.match(executar, /'info', !focou\)/);
  assert.match(executar, /foco\.bloco !== undefined/);
  for (const acao of ['fonte', 'bloco-aceitar', 'bloco-rejeitar', 'bloco-reabrir', 'enviar', 'validar', 'ajustes', 'nova-versao']) assert.match(JS_CONTEUDO, new RegExp(`executarRevisao\\('${acao}'`), acao);
  assert.doesNotMatch(JS_CONTEUDO, /executarRevisao\('concluir'|botao-concluir|podeConcluir/);
  for (const texto of ['Marcar como revisado', 'Aceitar informação', 'Excluir informação', 'Reabrir para correção', 'Editar']) assert.ok(JS_CONTEUDO.includes(`'${texto}'`), texto);
  assert.match(JS_CONTEUDO, /Para alterar, crie uma nova versão\./);
  assert.match(JS_CONTEUDO, /selo selo--pendente/);
  assert.match(JS_CONTEUDO, /ligarDialogo\(\$\('dialogo-descarte'\)/);
  assert.match(JS_CONTEUDO, /ligarDialogo\(\$\('dialogo-conclusao'\)/);
  assert.match(JS_CONTEUDO, /servicoDaUrl\(window\.location\.search\)/);
  assert.doesNotMatch(JS_CONTEUDO, /innerHTML|outerHTML|insertAdjacentHTML|localStorage|sessionStorage|document\.cookie|console\.|\bfetch\(\s*['"`]/);
  assert.doesNotMatch(JS_CONTEUDO, /textContent = [^;\n]*(\.id\b|revisao\.revisao|estadoVersao)/);
  assert.doesNotMatch(JS_CONTEUDO, /\.estadoVersao|'rascunho'|'validado_materialmente'|'autorizado'/, 'estados crus nunca chegam à tela');
});

test('RV13. admin.js: painel do serviço com situação, resumo, link com parâmetro simples e nova versão', () => {
  assert.match(HTML_ADMIN, /id="painel-revisar"[^>]*href="\.\/conteudo\/">Revisar informações<\/a>/);
  assert.match(HTML_ADMIN, /id="painel-nova-versao"[^>]*hidden>Criar nova versão para editar<\/button>/);
  assert.match(JS_ADMIN, /\.\/conteudo\/\?servico=\$\{encodeURIComponent\(servico\.id\)\}/);
  assert.match(JS_ADMIN, /cliente\.carregarRevisao\(servicoAtual\.id\)/);
  assert.match(JS_ADMIN, /cliente\.criarNovaVersao\(servicoAtual\.id\)/);
  assert.match(JS_ADMIN, /\$\('titulo-adicionar'\)\.hidden = !r\.editavel;/);
  assert.doesNotMatch(JS_ADMIN, /innerHTML|localStorage|sessionStorage|document\.cookie|console\./);
  assert.doesNotMatch(HTML_ADMIN, /revisao/i);
  assert.doesNotMatch(lerTexto('index.html') + lerTexto('src', 'main.js'), /admin|__admin|conteudo\.js/);
});

test('RV14. CSS: estado pendente com forma além da cor, quebra de texto e sem overflow-x como remendo novo', () => {
  assert.match(CSS, /\.selo--pendente \{[^}]*border-style: dashed;/);
  assert.match(CSS, /\.painel-estado \{[^}]*min-width: 0;/);
  assert.match(CSS, /\.pendencias \{[^}]*overflow-wrap: anywhere;/);
  assert.equal((CSS.match(/overflow-x: hidden/g) ?? []).length, 1, 'continua só o que já existia');
});

test('RV15. o código de lógica nunca chama publicação nem a rota de rejeição fora da lista fixa', () => {
  assert.doesNotMatch(LOGICA, /\/publicar\b/);
  assert.match(LOGICA, /autorizar: 'autorizacao',\s+publicar: 'publicacao',/);
  assert.match(LOGICA, /'revisao\/blocos\/rejeitar'/);
});

// ---------- Editar e excluir fontes (Passo 5B3a) ----------

const FONTE_LINK = { id: 'f-um', titulo: 'Portal Um', forma: 'link', revisada: true, revogada: false, excluida: false, usadaPorBloco: true, podeRevisar: false, podeEditar: true, podeExcluir: true };

test('EF1. resumirRevisao: fonte revogada na lista normal (só Excluir), pendências com ação e sem seção de excluídos', () => {
  const r = resumirRevisao(REVISAO_API({
    fontes: [FONTE_LINK, { ...FONTE_LINK, id: 'f-y', titulo: 'Decreto', revogada: true, revisada: false, podeEditar: false, podeRevisar: false }],
    pendencias: [{ codigo: 'sem_bloco_aceito' }, { codigo: 'bloco_pendente', id: 'bc-aaaaaaaaaaaa', titulo: 'Prazos' }, { codigo: 'fonte_pendente', id: 'f-um', titulo: 'Portal Um' }, { codigo: 'fonte_revogada', id: 'f-y', titulo: 'Decreto' }],
  }));
  assert.deepEqual(r.fontes.map((f) => [f.situacao, f.podeEditar, f.podeExcluir]), [['Revisado', true, true], ['Revogada', false, true]]);
  assert.deepEqual(r.pendenciasDetalhe.map((p) => [p.codigo, p.id, p.titulo]), [['sem_bloco_aceito', null, ''], ['bloco_pendente', 'bc-aaaaaaaaaaaa', 'Prazos'], ['fonte_pendente', 'f-um', 'Portal Um'], ['fonte_revogada', 'f-y', 'Decreto']]);
  assert.equal(r.pendencias[0], 'Inclua e aceite pelo menos uma informação para enviar para revisão.');
  assert.equal(r.resumo.pendenciasParaConcluir, 4);
  assert.equal(fraseBlocosReabertos(0), '');
  assert.equal(fraseBlocosReabertos(1), '1 informação voltou para Em elaboração.');
  assert.equal(fraseBlocosReabertos(3), '3 informações voltaram para Em elaboração.');
  assert.equal(PASSOS_PARA_RESOLVER.length, 5);
  assert.equal(pendenciasDaUrl('?servico=x&pendencias=1'), true);
  assert.equal(pendenciasDaUrl('?pendencias=2'), false);
  assert.equal(pendenciasDaUrl(null), false);
});

test('EF2. validarEdicaoDeFonte: envia só o que mudou, valida junto ao campo e aceita contato institucional', () => {
  const original = { titulo: 'Portal', url: 'https://exemplo.test/a', orgaoResponsavel: 'Órgão', descricao: 'Desc', dataPublicacao: '', localizacao: '' };
  const igual = validarEdicaoDeFonte('link', original, original);
  assert.deepEqual([igual.ok, igual.corpo], [true, {}], 'nada mudou');
  assert.deepEqual(validarEdicaoDeFonte('link', { ...original, url: 'https://exemplo.test/b', dataPublicacao: '2026-01-31' }, original).corpo, { url: 'https://exemplo.test/b', dataPublicacao: '2026-01-31' });
  const ruim = validarEdicaoDeFonte('link', { ...original, titulo: '', url: 'http://x.test', orgaoResponsavel: '', dataPublicacao: '2026-02-31', localizacao: 'a'.repeat(201) }, original);
  assert.deepEqual(Object.keys(ruim.erros).sort(), ['dataPublicacao', 'localizacao', 'orgaoResponsavel', 'titulo', 'url']);
  assert.equal(validarEdicaoDeFonte('link', { ...original, descricao: '' }, original).ok, true, 'descrição é opcional na edição');
  const texto = { titulo: 'T', texto: 'Texto original.' };
  assert.deepEqual(validarEdicaoDeFonte('texto', { titulo: 'T', texto: '  Novo texto.  ' }, texto).corpo, { texto: 'Novo texto.' });
  assert.equal(validarEdicaoDeFonte('texto', { titulo: 'T', texto: ' ' }, texto).erros.texto, 'Escreva o texto.');
  const externo = ['pessoa', 'exemplo.test'].join('@');
  const institucional = ['setor', 'sema.mt.gov.br'].join('@');
  assert.match(validarEdicaoDeFonte('texto', { titulo: 'T', texto: `Escreva para ${externo}` }, texto).erros.texto, /e-mail/);
  assert.equal(validarEdicaoDeFonte('texto', { titulo: 'T', texto: `Escreva para ${institucional}` }, texto).ok, true);
  assert.equal(Object.hasOwn(validarEdicaoDeFonte('texto', { titulo: 'T2', texto: 'Texto original.', url: 'https://x.test' }, texto).corpo, 'url'), false, 'campo de link nunca vai em texto');
});

test('EF3. mensagemDaFonte: textos curtos por código, sem recusa por referências e nada do corpo bruto', () => {
  assert.equal(mensagemDaFonte(409, { erro: 'url_duplicada' }).erros.url, 'Já existe outro link com este endereço neste serviço.');
  assert.deepEqual([mensagemDaFonte(409, { erro: 'revisao_divergente' }).mensagem, mensagemDaFonte(409, { erro: 'revisao_divergente' }).recarregar], [MENSAGEM_REVISAO_DIVERGENTE, true]);
  assert.equal(mensagemDaFonte(404, {}).recarregar, true, 'fonte já excluída: recarrega');
  assert.doesNotMatch(LOGICA, /fonte_em_uso|fonte_em_conteudo_antigo|emUso/, 'a exclusão nunca é recusada por referências');
  assert.deepEqual(Object.keys(mensagemDaFonte(422, { erro: 'dados_invalidos', campos: ['url', 'inexistente'] }).erros), ['url']);
  for (const [status, erro] of [[404, 'x'], [409, 'versao_congelada'], [409, 'fonte_excluida'], [409, 'operacao_em_andamento'], [422, 'dados_invalidos'], [500, 'indisponivel']]) {
    const m = mensagemDaFonte(status, { erro, detalhe: 'SEGREDO-BRUTO' }).mensagem;
    assert.ok(m.length > 10 && m.length < 160);
    assert.doesNotMatch(m, /SEGREDO|fonte_|versao_|[0-9a-f]{64}/);
  }
});

test('EF4. impacto da exclusão: desfechos e conteúdo antigo em frases comuns, sem ids', () => {
  const r = resumirImpacto({
    informacoes: [{ titulo: 'Prazos', desfecho: 'continua' }, { titulo: 'Etapas', desfecho: 'volta_para_elaboracao' }, { titulo: 'Sozinha', desfecho: 'sai_do_conteudo_ativo' }, { titulo: 'X', desfecho: 'inesperado', id: 'bc-aaaaaaaaaaaa' }],
    conteudoAntigo: { blocosDeTeste: 1, documentos: 2, perguntas: 1, camposDoServico: ['Documentos exigidos', 'Prazo'] },
    revisao: 'r',
  });
  assert.deepEqual(r.informacoes.map((i) => i.frase), ['continuará com outras fontes', 'voltará para Em elaboração', 'sairá do conteúdo ativo', 'voltará para Em elaboração']);
  assert.doesNotMatch(JSON.stringify(r), /bc-aaaa|desfecho":"inesperado/);
  const frases = frasesConteudoAntigo(r.conteudoAntigo);
  assert.equal(frases.length, 4);
  assert.match(frases.join(' '), /2 documentos .* sairão do conteúdo ativo/);
  assert.match(frases.join(' '), /1 pergunta frequente .* sairá do conteúdo ativo/);
  assert.match(frases.join(' '), /campos do serviço que dependem só desta fonte será apagado e eles ficarão pendentes: Documentos exigidos, Prazo\./);
  assert.deepEqual(frasesConteudoAntigo({ blocosDeTeste: 0, documentos: 0, perguntas: 0, camposDoServico: [] }), [], 'sem conteúdo antigo afetado, nada é mostrado');
  assert.equal(resumirImpacto({}), null);
  assert.equal(resumirImpacto(null), null);
});

test('EF5. cliente: GET do impacto, PATCH com a revisão atual, DELETE sem corpo com X-Revisao e uma gravação por vez', async () => {
  const chamadas = [];
  const base = '/__admin/servicos/servico-ficticio/fontes/f-um';
  let liberar;
  const portao = new Promise((fim) => { liberar = fim; });
  const r = (status, corpo) => ({ status, json: async () => corpo });
  const fetchImpl = async (url, opcoes = {}) => {
    chamadas.push({ url, metodo: opcoes.method, cabecalhos: opcoes.headers, corpoTexto: opcoes.body });
    if (url === '/__admin/sessao') return r(200, sessaoCom(TOKEN));
    if (url === base && opcoes.method === 'GET') return r(200, { forma: 'link', titulo: 'P', url: 'https://e.test/a', orgaoResponsavel: 'O', descricao: '', dataPublicacao: '', localizacao: '', revisao: 'r1', extra: 'ignorado' });
    if (url === `${base}/impacto`) return r(200, { informacoes: [{ titulo: 'Prazos', desfecho: 'continua' }], conteudoAntigo: { blocosDeTeste: 0, documentos: 1, perguntas: 0, camposDoServico: [] }, revisao: 'r1' });
    if (url === base && opcoes.method === 'PATCH') { await portao; return r(200, { revisao: 'r2', blocosReabertos: 2 }); }
    if (url === base && opcoes.method === 'DELETE') return r(200, { revisao: 'r3', blocosReabertos: 1 });
    return r(404, {});
  };
  const c = criarClienteAdmin({ fetchImpl });
  assert.equal((await c.carregarFonteParaEdicao('servico-ficticio', 'f-um')).ok, false, 'sem sessão não chama a rede');
  assert.equal((await c.carregarImpactoDaFonte('servico-ficticio', 'f-um')).ok, false);
  await c.iniciarSessao();
  const lida = await c.carregarFonteParaEdicao('servico-ficticio', 'f-um');
  assert.deepEqual([lida.ok, lida.forma, Object.keys(lida.campos).sort()], [true, 'link', ['dataPublicacao', 'descricao', 'localizacao', 'orgaoResponsavel', 'titulo', 'url']]);
  const impacto = await c.carregarImpactoDaFonte('servico-ficticio', 'f-um');
  assert.deepEqual([impacto.ok, impacto.informacoes[0].frase, impacto.conteudoAntigo.documentos], [true, 'continuará com outras fontes', 1]);
  const leitura = chamadas.find((x) => x.url === `${base}/impacto`);
  assert.equal(leitura.metodo, 'GET');
  assert.equal(leitura.corpoTexto, undefined);
  const primeira = c.editarFonte('servico-ficticio', 'f-um', { titulo: 'Novo' }, 'rev-atual');
  assert.equal((await c.editarFonte('servico-ficticio', 'f-um', { titulo: 'Outro' }, 'rev-atual')).emAndamento, true);
  assert.equal((await c.excluirFonte('servico-ficticio', 'f-um', 'rev-atual')).emAndamento, true);
  liberar();
  const feita = await primeira;
  assert.deepEqual([feita.ok, feita.blocosReabertos], [true, 2]);
  const patch = chamadas.find((x) => x.metodo === 'PATCH');
  assert.deepEqual(JSON.parse(patch.corpoTexto), { titulo: 'Novo', revisao: 'rev-atual' });
  assert.equal(patch.cabecalhos['Content-Type'], 'application/json');
  assert.equal((await c.excluirFonte('servico-ficticio', 'f-um', 'rev-atual')).ok, true);
  const del = chamadas.find((x) => x.metodo === 'DELETE');
  assert.equal(del.corpoTexto, undefined, 'DELETE sem corpo');
  assert.equal(del.cabecalhos['X-Revisao'], 'rev-atual');
  assert.equal(del.cabecalhos[CABECALHO_TOKEN], TOKEN);
  assert.equal(del.cabecalhos['Content-Type'], undefined);
  assert.equal((await c.excluirFonte('../x', 'f-um', 'r')).ok, false);
});

test('EF6. página: Editar e Excluir por fonte, diálogos próprios, impacto antes de excluir, sem "Itens excluídos" e Resolver pendências', () => {
  assert.ok(HTML_CONTEUDO.includes(TEXTO_EXCLUSAO_APLICADA_NA_PUBLICACAO));
  assert.ok(HTML_CONTEUDO.includes(TEXTO_CONFIRMAR_EXCLUSAO_FONTE));
  assert.ok(HTML_CONTEUDO.includes(AVISO_EDITAR_FONTE));
  assert.match(HTML_CONTEUDO, /<dialog id="dialogo-editar-fonte" class="dialogo" aria-labelledby="ef-titulo-dialogo">/);
  assert.match(HTML_CONTEUDO, /<dialog id="dialogo-excluir-fonte" class="dialogo" aria-labelledby="ex-titulo-dialogo" aria-describedby="ex-descricao">/);
  assert.match(HTML_CONTEUDO, /id="ex-confirmar">Excluir<\/button>/);
  assert.match(HTML_CONTEUDO, /<label for="ef-orgao">Órgão que publicou o conteúdo<\/label>/);
  assert.match(HTML_CONTEUDO, /id="botao-resolver" hidden>(?:<svg[^>]*><use[^>]*><\/use><\/svg>)?Resolver pendências<\/button>/);
  assert.match(HTML_ADMIN, /id="painel-resolver" href="\.\/conteudo\/" hidden>Resolver pendências<\/a>/);
  assert.doesNotMatch(HTML_CONTEUDO + JS_CONTEUDO + CSS, /Itens excluídos|fontes-excluidas|lixeira|restaurar|usada por conteúdo antigo|Usada por informação/i);
  assert.doesNotMatch(HTML_CONTEUDO, /<details/);
  assert.match(JS_CONTEUDO, /cliente\.carregarImpactoDaFonte\(contexto\.servicoId, fonte\.id\)/);
  assert.match(JS_CONTEUDO, /cliente\.editarFonte\(servicoId, fonteId, v\.corpo, revisao\.revisao\)/);
  assert.match(JS_CONTEUDO, /cliente\.excluirFonte\(servicoId, fonte\.id, revisao\.revisao\)/);
  assert.match(JS_CONTEUDO, /Math\.min\(indice, itens\.length - 1\)/);
  assert.match(JS_CONTEUDO, /focarItem\(primeira\)/, 'o foco vai para a primeira pendência');
  assert.match(JS_ADMIN, /\?servico=\$\{encodeURIComponent\(servicoAtual\.id\)\}&pendencias=1/);
  assert.doesNotMatch(JS_CONTEUDO, /innerHTML|localStorage|sessionStorage|document\.cookie|console\./);
  const botoes = [...(HTML_CONTEUDO + HTML_ADMIN).matchAll(/<button[^>]*>([^<]*)<\/button>/g)].map((m) => m[1]);
  assert.equal(botoes.filter((b) => /^Adicionar/.test(b)).length, 0, 'rótulos padronizados: Incluir, Editar, Excluir, Salvar');
});

// ---------- Sprint 8, Passo 8D: enviar para revisão, validar e solicitar ajustes ----------

test('RV16. (8D) etapas na tela: em análise oferece validar e ajustes (sem nova versão); ajustes mostram o motivo e a nova versão', () => {
  const analise = resumirRevisao(REVISAO_API({ estadoVersao: 'em_validacao', rotulo: 'Em análise', editavel: false, pendencias: [], podeEnviar: true, podeValidar: true, podeSolicitarAjustes: true, motivoAjustes: 'Não deve aparecer.' }));
  assert.deepEqual([analise.etapa, analise.congelada, analise.podeEnviar, analise.podeValidar, analise.podeSolicitarAjustes, analise.podeNovaVersao, analise.motivoAjustes],
    ['analise', true, false, true, true, false, null]);
  const ajustes = resumirRevisao(REVISAO_API({ estadoVersao: 'ajustes_solicitados', rotulo: 'Ajustes solicitados', editavel: false, pendencias: [], podeValidar: true, motivoAjustes: 'Corrigir o prazo fictício.' }));
  assert.deepEqual([ajustes.etapa, ajustes.podeValidar, ajustes.podeSolicitarAjustes, ajustes.podeNovaVersao, ajustes.motivoAjustes],
    ['ajustes', false, false, true, 'Corrigir o prazo fictício.']);
  assert.equal(resumirRevisao(REVISAO_API({ estadoVersao: 'ajustes_solicitados', editavel: false, motivoAjustes: 'x'.repeat(900) })).motivoAjustes.length, 500);
  // Em elaboração, validar e ajustes nunca aparecem, mesmo que o corpo diga o contrário.
  const elaboracao = resumirRevisao(REVISAO_API({ podeValidar: true, podeSolicitarAjustes: true }));
  assert.deepEqual([elaboracao.podeValidar, elaboracao.podeSolicitarAjustes, elaboracao.podeNovaVersao], [false, false, false]);
  assert.equal(fraseDaEtapaDeRevisao(analise), AVISO_EM_ANALISE);
  assert.equal(fraseDaEtapaDeRevisao(ajustes), AVISO_AJUSTES_SOLICITADOS);
  assert.equal(fraseDaEtapaDeRevisao(elaboracao), null);
  assert.doesNotMatch(fraseDaEtapaDeRevisao(ajustes), /Corrigir/, 'o painel não mostra o motivo');
  for (const t of [AVISO_EM_ANALISE, AVISO_AJUSTES_SOLICITADOS, AVISO_VALIDACAO_LOCAL, AVISO_MOTIVO_AJUSTES, TEXTO_CONFIRMAR_VALIDACAO, TEXTO_CONFIRMAR_AJUSTES, ...Object.values(MENSAGENS_REVISAO)]) {
    assert.doesNotMatch(t, TECNICO);
  }
  assert.match(AVISO_VALIDACAO_LOCAL, /não equivale à validação material da CLABI/);
  assert.match(TEXTO_CONFIRMAR_VALIDACAO, /Não publica nada/);
});

test('RV17. (8D) controles e diálogos: Enviar (Cadastrante), Validar e Solicitar ajustes (Revisor), motivo obrigatório com textContent', () => {
  assert.equal(ACAO_DO_CONTROLE.enviar, 'enviar_para_revisao');
  assert.equal(ACAO_DO_CONTROLE.validar, 'validar_materialmente');
  assert.equal(ACAO_DO_CONTROLE.ajustes, 'solicitar_ajustes');
  assert.equal(Object.hasOwn(ACAO_DO_CONTROLE, 'concluir'), false);
  assert.match(HTML_CONTEUDO, /<dialog id="dialogo-validacao" class="dialogo" aria-labelledby="validacao-titulo" aria-describedby="validacao-descricao validacao-aviso">/);
  assert.match(HTML_CONTEUDO, /<dialog id="dialogo-ajustes" class="dialogo" aria-labelledby="ajustes-titulo" aria-describedby="ajustes-descricao">/);
  assert.match(HTML_CONTEUDO, /<label for="ajustes-motivo-campo">Motivo dos ajustes<\/label>/);
  assert.match(HTML_CONTEUDO, /<textarea id="ajustes-motivo-campo" rows="3" maxlength="500" required aria-required="true" aria-describedby="ajustes-motivo-ajuda ajustes-motivo-erro"><\/textarea>/);
  assert.match(HTML_CONTEUDO, /id="conclusao-confirmar">Confirmar envio</);
  assert.match(HTML_CONTEUDO, /id="validacao-confirmar">Confirmar validação</);
  assert.match(HTML_CONTEUDO, /id="ajustes-confirmar">Confirmar pedido de ajustes</);
  assert.match(JS_CONTEUDO, /motivo\.textContent = ajustes && revisao\.motivoAjustes !== null \? `Motivo dos ajustes: \$\{revisao\.motivoAjustes\}` : '';/);
  assert.match(JS_CONTEUDO, /\$\('validacao-aviso'\)\.textContent = AVISO_VALIDACAO_LOCAL;/);
  assert.match(JS_CONTEUDO, /mostrarErroDoMotivoAjustes\(MENSAGEM_MOTIVO_AJUSTES_OBRIGATORIO\)/);
  // Motivo recusado pelo servidor: o diálogo fica aberto, com o erro junto ao campo e o foco nele (o texto digitado não é apagado).
  assert.equal(mensagemDaRevisao(422, { erro: 'motivo_invalido' }).campo, 'motivo');
  assert.match(JS_CONTEUDO, /const motivoRecusado = \(r\) => r !== undefined && r !== null && r\.ok === false && r\.campo === 'motivo';/);
  assert.match(JS_CONTEUDO, /if \(motivoRecusado\(res\)\) return;\s+fechar\(\);\s+campoMotivoAjustes\.value = '';/);
  assert.match(JS_CONTEUDO, /if \(motivoRecusado\(r\) && \$\('dialogo-ajustes'\)\.open\) \{\s+mostrarErroDoMotivoAjustes\(r\.mensagem\);\s+campoMotivoAjustes\.focus\(\);/);
  assert.match(JS_CONTEUDO, /aoTerminarEnvio\(r\);/);
  // Depois da confirmação, o foco que ficou num campo do diálogo não é levado para "Voltar".
  assert.match(JS_CONTEUDO, /if \(!noCampo\) voltar\.focus\(\);/);
  assert.match(JS_CONTEUDO, /for \(const id of \['botao-enviar', 'botao-validar', 'botao-ajustes', 'botao-nova-versao'/);
  // O cartão de publicação só aparece depois da validação (não em análise nem com ajustes).
  assert.match(JS_CONTEUDO, /cartao\.hidden = contexto === null \|\| revisao === null \|\| revisao\.etapa !== 'concluida';/);
  assert.doesNotMatch(JS_CONTEUDO + HTML_CONTEUDO, /innerHTML|localStorage|sessionStorage|document\.cookie/);
});
