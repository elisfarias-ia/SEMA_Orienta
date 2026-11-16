// Passo 5B2: interface da revisão ("Gestão de conteúdo"): lógica pura, cliente com fetch simulado, estrutura de acessibilidade e
// regras de linguagem e segurança do código das duas páginas. Dados fictícios; nada é gravado e a rede não é usada.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CABECALHO_TOKEN, MENSAGEM_REVISAO_DIVERGENTE, TEXTO_CONFIRMAR_CONCLUSAO, criarClienteAdmin, criarClienteGestao,
  explicarFontesPendentes, frasePendenciasParaConcluir, mensagemDaRevisao, resumirRevisao, servicoDaUrl, traduzirPendencia,
} from '../admin/admin-logic.js';

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
  podeConcluir: false, ...extra,
});

function servidorFalso(respostas = {}, portao = null) {
  const chamadas = [];
  const r = (status, corpo) => ({ status, json: async () => corpo });
  const base = '/__admin/servicos/servico-ficticio';
  const fetchImpl = async (url, opcoes = {}) => {
    chamadas.push({ url, metodo: opcoes.method, cabecalhos: opcoes.headers, corpoTexto: opcoes.body, corpo: opcoes.body === undefined ? undefined : JSON.parse(opcoes.body) });
    const chave = `${opcoes.method} ${url}`;
    if (respostas[chave]) return respostas[chave](opcoes);
    if (url === '/__admin/sessao') return r(200, { token: TOKEN });
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
  // Fonte que nenhum bloco usa: "Ainda não revisada" (não é pendência para concluir); usada e pendente: "Revisão pendente".
  const naoUsada = resumirRevisao(REVISAO_API({ fontes: [{ id: 'f-nu', titulo: 'Sem uso', forma: 'link', revisada: false, revogada: false, usadaPorBloco: false, podeRevisar: true }, { id: 'f-u', titulo: 'Em uso', forma: 'link', revisada: false, revogada: false, usadaPorBloco: true, podeRevisar: true }] }));
  assert.deepEqual(naoUsada.fontes.map((f) => f.situacao), ['Ainda não revisada', 'Revisão pendente']);
  // O resumo usa só pendenciasParaConcluir (= tamanho da lista de impedimentos), nunca soma outros números.
  assert.equal(r.resumo.pendenciasParaConcluir, r.pendencias.length);
  assert.equal(frasePendenciasParaConcluir(r.resumo), '2 pendências para concluir. Informações aceitas: 0.');
  assert.match(frasePendenciasParaConcluir({ pendenciasParaConcluir: 3, informacoesAceitas: 1, fontesNaoUsadas: 2 }), /3 pendências para concluir\. Informações aceitas: 1\. 2 documentos ou links ainda não são usados.*não impede a conclusão/);
  assert.doesNotMatch(frasePendenciasParaConcluir({ pendenciasParaConcluir: 0, informacoesAceitas: 1, fontesNaoUsadas: 0 }), /usados|impede/);
  assert.equal(resumirRevisao(REVISAO_API({ revisaoPendente: false })).revisaoPendente, true, 'o selo segue a lista de pendências, não um campo isolado');
  assert.equal(resumirRevisao(REVISAO_API({ pendencias: [], revisaoPendente: true })).revisaoPendente, false);
  assert.equal(resumirRevisao(REVISAO_API({ fontes: [{ id: 'f-x', titulo: 'Velha', forma: 'link', revisada: true, revogada: true }] })).fontes[0].situacao, 'Revogada');
  assert.equal(resumirRevisao(REVISAO_API({ blocos: [{ id: 'bc-bbbbbbbbbbbb', titulo: 'Pronta', aceito: true, fontesPendentes: [], podeReabrir: true }] })).blocos[0].situacao, 'Aceita');
  assert.doesNotMatch(JSON.stringify(r), /TEXTO-ORIGINAL-SECRETO/);
  assert.equal(r.podeConcluir, false);
  assert.equal(resumirRevisao(REVISAO_API({ podeConcluir: true })).podeConcluir, true);
  const pronta = resumirRevisao(REVISAO_API({ rotulo: 'Pronto para publicar', revisaoPendente: false, editavel: false, podeConcluir: true }));
  assert.equal(pronta.congelada, true);
  assert.equal(pronta.podeConcluir, false, 'versão congelada nunca oferece concluir');
  for (const ruim of [null, [], {}, REVISAO_API({ revisao: '' }), REVISAO_API({ fontes: 'x' }), REVISAO_API({ resumo: null })]) assert.equal(resumirRevisao(ruim), null);
});

test('RV2. traduzirPendencia: cada código vira frase comum, sem o código técnico', () => {
  const codigos = ['sem_bloco_aceito', 'bloco_pendente', 'fonte_pendente', 'fonte_revogada', 'fonte_inexistente', 'entrada_invalida', 'codigo_novo'];
  const frases = codigos.map((codigo) => traduzirPendencia({ codigo, titulo: 'Item X' }));
  assert.equal(new Set(frases).size, codigos.length, 'frases distintas');
  for (const f of frases) assert.doesNotMatch(f, TECNICO);
  assert.match(frases[1], /"Item X"/);
  assert.equal(traduzirPendencia({ codigo: 'sem_bloco_aceito' }), 'Aceite pelo menos uma informação do chatbot.');
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
    ['concluir', { revisao: 'r1' }, `${base}/revisao/concluir`],
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
  assert.equal((await c.gravarRevisao('publicar', 'servico-ficticio', {})).ok, false, 'não existe ação de publicação');
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
  s = servidorFalso({ [`POST ${base}/revisao/concluir`]: async () => { throw new Error('rede C:\\segredo'); } });
  c = criarClienteAdmin({ fetchImpl: s.fetchImpl });
  await c.iniciarSessao();
  r = await c.gravarRevisao('concluir', 'servico-ficticio', { revisao: 'r' });
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
  assert.match(HTML_CONTEUDO, /<h2 id="titulo-conclusao">Concluir revisão<\/h2>/);
  assert.match(HTML_CONTEUDO, /<dialog id="dialogo-descarte" class="dialogo" aria-labelledby="descarte-titulo" aria-describedby="descarte-descricao">/);
  assert.match(HTML_CONTEUDO, /<dialog id="dialogo-conclusao" class="dialogo" aria-labelledby="conclusao-titulo-dialogo" aria-describedby="conclusao-descricao-dialogo">/);
  assert.ok(HTML_CONTEUDO.includes(TEXTO_CONFIRMAR_CONCLUSAO), 'texto exato da confirmação no diálogo');
  assert.equal(TEXTO_CONFIRMAR_CONCLUSAO, 'Depois de concluir, esta versão não poderá mais ser editada. Para fazer novas alterações, será necessário criar uma nova versão.');
  assert.doesNotMatch(HTML_CONTEUDO + LOGICA, /revisão para demonstração|AVISO_REVISAO_DEMONSTRACAO/, 'sem o aviso de demonstração');
  assert.match(HTML_CONTEUDO, /id="botao-nova-versao"[^>]*hidden>Criar nova versão para editar</);
  assert.match(HTML_CONTEUDO, /id="botao-concluir"[^>]*hidden>Concluir revisão</);
  const botoes = [...(HTML_CONTEUDO + HTML_ADMIN).matchAll(/<button[^>]*>([^<]*)<\/button>/g)].map((m) => m[1]);
  assert.ok(botoes.length > 10);
  for (const b of botoes) assert.doesNotMatch(b, /publicar/i, `botão "${b}"`);
  assert.doesNotMatch(JS_CONTEUDO + JS_ADMIN, /(criar|criarBotao)\([^)]*'Publicar/i);
  assert.doesNotMatch(HTML_CONTEUDO + HTML_ADMIN, /type="radio"|wizard|checkpoint|avançad|<details/i);
  assert.doesNotMatch(HTML_CONTEUDO, /\bbc-[0-9a-f]{12}\b|[0-9a-f]{64}|hashConteudo|statusValidacao/);
  assert.match(HTML_CONTEUDO, /href="\.\.\/">Gestão de conteúdo<\/a>/);
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
  for (const acao of ['fonte', 'bloco-aceitar', 'bloco-rejeitar', 'bloco-reabrir', 'concluir', 'nova-versao']) assert.match(JS_CONTEUDO, new RegExp(`executarRevisao\\('${acao}'`), acao);
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
  assert.doesNotMatch(LOGICA, /\/publicar|publicacao\/|'publicar'/);
  assert.match(LOGICA, /'revisao\/blocos\/rejeitar'/);
});
