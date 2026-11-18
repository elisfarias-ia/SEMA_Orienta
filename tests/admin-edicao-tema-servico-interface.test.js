// Passo 5B3b: interface de edição de tema e de serviço (lógica pura em admin-logic.js, cliente com fetch falso e conferência estática
// de admin/index.html e admin/admin.js). Este arquivo não grava nada em disco.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  AVISO_SERVICO_CONCLUIDO_PARA_EDITAR, CABECALHO_TOKEN, MENSAGEM_NOME_SERVICO_REPETIDO, MENSAGEM_NOME_TEMA_REPETIDO, MENSAGEM_REVISAO_DIVERGENTE, MENSAGEM_VERSAO_CONCLUIDA_PARA_EDITAR,
  criarClienteGestao, impactoDaEdicaoDoServico, impactoDaEdicaoDoTema, mensagemDaEdicao, resumirEdicaoDoServico, resumirEdicaoDoTema, todosOsTemas, validarEdicaoDeServico, validarEdicaoDeTema,
} from '../admin/admin-logic.js';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lerTexto = (...p) => fs.readFileSync(path.join(RAIZ, ...p), 'utf8');
const HTML = lerTexto('admin', 'index.html');
const JS = lerTexto('admin', 'admin.js');
const LOGICA = lerTexto('admin', 'admin-logic.js');
const TOKEN = 'b'.repeat(64);
const REVISAO = 'c'.repeat(64);

const TEMAS = [{ id: 'tema-um', nome: 'Licenciamento' }, { id: 'tema-dois', nome: 'Água e Solo' }];
const SERVICOS = [{ id: 'servico-a', nome: 'Licença Simples' }, { id: 'servico-b', nome: 'Outorga de água' }];

function servidorFalso(respostas) {
  const chamadas = [];
  const fetchImpl = async (url, opcoes) => {
    chamadas.push({ url, metodo: opcoes.method, corpo: opcoes.body === undefined ? undefined : JSON.parse(opcoes.body), cabecalhos: opcoes.headers });
    if (url === '/__admin/sessao') return { status: 200, json: async () => ({ token: TOKEN }) };
    const r = respostas[`${opcoes.method} ${url}`];
    if (r === undefined) return { status: 404, json: async () => ({ erro: 'nao_encontrado' }) };
    return { status: r.status, json: async () => r.corpo };
  };
  return { fetchImpl, chamadas };
}
async function clienteCom(respostas) {
  const s = servidorFalso(respostas);
  const cliente = criarClienteGestao({ fetchImpl: s.fetchImpl });
  assert.deepEqual(await cliente.entrar(), { ok: true });
  return { cliente, chamadas: s.chamadas };
}

test('EI1. tema: nome vazio, longo, sem letras, com dado pessoal e repetido (sem acento nem caixa) são recusados junto ao campo; id nunca é editável', () => {
  const original = { id: 'tema-um', nome: 'Licenciamento' };
  const erro = (nome) => validarEdicaoDeTema({ nome }, original, TEMAS);
  assert.equal(erro('   ').erros.nome, 'Escreva o nome do tema.');
  assert.match(erro('x'.repeat(121)).erros.nome, /até 120/);
  assert.equal(erro('!!!').erros.nome, 'O nome precisa ter letras ou números.');
  assert.match(erro('Meu tema senha: abc123').erros.nome, /dados pessoais/);
  assert.equal(erro('  agua  E SOLO ').erros.nome, MENSAGEM_NOME_TEMA_REPETIDO);
  assert.deepEqual(validarEdicaoDeTema({ nome: ' Licenciamento ' }, original, TEMAS), { ok: true, erros: {}, mudou: false, nome: 'Licenciamento' });
  assert.deepEqual(validarEdicaoDeTema({ nome: 'Licenciamento  Ambiental' }, original, TEMAS), { ok: true, erros: {}, mudou: true, nome: 'Licenciamento Ambiental' });
  assert.deepEqual(validarEdicaoDeTema({ nome: 'LICENCIAMENTO', id: 'outro' }, original, TEMAS).ok, true, 'o próprio tema pode mudar só a grafia, e o id do formulário é ignorado');
  assert.equal(validarEdicaoDeTema(null, null, null).ok, false);
  assert.deepEqual(todosOsTemas({ assuntos: [{ id: 'b', nome: 'Beta', ativo: false }, { id: 'a', nome: 'Alfa' }, { id: 'Ruim Id', nome: 'X' }, { id: 'c', nome: '' }] }), [{ id: 'a', nome: 'Alfa' }, { id: 'b', nome: 'Beta' }]);
});

test('EI2. serviço: o corpo traz só o que mudou; nome repetido e tema fora da lista são recusados; nada de sigla, id ou campos avançados', () => {
  const original = { id: 'servico-a', nome: 'Licença Simples', temaId: 'tema-um' };
  const v = (valores) => validarEdicaoDeServico(valores, original, TEMAS, SERVICOS);
  assert.deepEqual(v({ nome: 'Licença Simples', temaId: 'tema-um' }), { ok: true, erros: {}, mudou: false, temaMudou: false, corpo: {} });
  assert.deepEqual(v({ nome: ' Licença   Simplificada ', temaId: 'tema-um' }).corpo, { nome: 'Licença Simplificada' });
  assert.deepEqual(v({ nome: 'Licença Simples', temaId: 'tema-dois' }), { ok: true, erros: {}, mudou: true, temaMudou: true, corpo: { temaId: 'tema-dois' } });
  assert.deepEqual(v({ nome: 'Novo', temaId: 'tema-dois', sigla: 'X', id: 'y' }).corpo, { nome: 'Novo', temaId: 'tema-dois' });
  assert.equal(v({ nome: 'OUTORGA DE AGUA', temaId: 'tema-um' }).erros.nome, MENSAGEM_NOME_SERVICO_REPETIDO);
  assert.equal(v({ nome: '', temaId: 'tema-um' }).erros.nome, 'Escreva o nome do serviço.');
  assert.equal(v({ nome: 'Novo', temaId: 'tema-que-nao-existe' }).erros.tema, 'Escolha um tema da lista.');
  assert.equal(v({ nome: 'Novo' }).erros.tema, 'Escolha um tema da lista.');
  assert.equal(validarEdicaoDeServico(undefined, undefined, undefined, undefined).ok, false);
});

test('EI3. impacto em linguagem comum: tema lista os serviços; serviço informa o que muda e exige confirmação com tema novo ou informação aceita; sem ids nem hashes', () => {
  const t = impactoDaEdicaoDoTema('Licenciamento', 'Licenciamento Ambiental', ['Licença Simples', 'Outorga']);
  assert.deepEqual(t.lista, ['Licença Simples', 'Outorga']);
  assert.equal(t.frases[0], 'O tema "Licenciamento" passará a se chamar "Licenciamento Ambiental".');
  assert.match(t.frases[1], /Estes serviços usam o tema/);
  assert.match(impactoDaEdicaoDoTema('A', 'B', []).frases[1], /Nenhum serviço usa este tema/);
  assert.match(impactoDaEdicaoDoTema('A', 'B', ['Um']).frases[1], /Este serviço usa o tema/);
  const base = { nomeAtual: 'Licença Simples', nomeNovo: 'Licença Simples', temaAtualNome: 'Licenciamento', temaNovoNome: 'Licenciamento', informacoesAceitas: [] };
  assert.deepEqual(impactoDaEdicaoDoServico({ ...base, nomeNovo: 'Outro nome' }), { frases: ['O serviço "Licença Simples" passará a se chamar "Outro nome".'], lista: [], exigeConfirmacao: false });
  const mover = impactoDaEdicaoDoServico({ ...base, temaNovoNome: 'Água e Solo' });
  assert.equal(mover.exigeConfirmacao, true);
  assert.equal(mover.frases[0], 'O serviço sairá do tema "Licenciamento" e passará para o tema "Água e Solo".');
  const aceitas = impactoDaEdicaoDoServico({ ...base, nomeNovo: 'Outro', informacoesAceitas: ['Prazo de análise', 'Taxa'] });
  assert.deepEqual([aceitas.exigeConfirmacao, aceitas.lista], [true, ['Prazo de análise', 'Taxa']]);
  assert.match(aceitas.frases[1], /voltarão para "Em elaboração"/);
  assert.match(impactoDaEdicaoDoServico({ ...base, nomeNovo: 'Outro', informacoesAceitas: ['Uma'] }).frases[1], /voltará para "Em elaboração"/);
  assert.doesNotMatch(JSON.stringify([t, mover, aceitas]), /[0-9a-f]{64}|tema-um|servico-a|hash|revisao/i);
});

test('EI4. mensagens por código: divergência, versão concluída, repetido, confirmação, nada a alterar; nunca o texto bruto da resposta', () => {
  assert.deepEqual(mensagemDaEdicao(409, { erro: 'revisao_divergente' }), { mensagem: MENSAGEM_REVISAO_DIVERGENTE, recarregar: true });
  assert.deepEqual(mensagemDaEdicao(409, { erro: 'versao_congelada' }), { mensagem: MENSAGEM_VERSAO_CONCLUIDA_PARA_EDITAR, recarregar: true });
  assert.match(MENSAGEM_VERSAO_CONCLUIDA_PARA_EDITAR, /Criar nova versão para editar/);
  assert.match(AVISO_SERVICO_CONCLUIDO_PARA_EDITAR, /Criar nova versão para editar/);
  assert.deepEqual(mensagemDaEdicao(409, { erro: 'ja_existe', campo: 'nome' }, 'tema'), { mensagem: MENSAGEM_NOME_TEMA_REPETIDO, erros: { nome: MENSAGEM_NOME_TEMA_REPETIDO } });
  assert.deepEqual(mensagemDaEdicao(409, { erro: 'ja_existe', campo: 'nome' }), { mensagem: MENSAGEM_NOME_SERVICO_REPETIDO, erros: { nome: MENSAGEM_NOME_SERVICO_REPETIDO } });
  assert.match(mensagemDaEdicao(409, { erro: 'operacao_em_andamento' }).mensagem, /em andamento/);
  assert.equal(mensagemDaEdicao(404, {}).recarregar, true);
  assert.equal(mensagemDaEdicao(422, { campos: ['confirmacao'] }).mensagem, 'Confirme a alteração para continuar.');
  assert.equal(mensagemDaEdicao(422, { campos: ['nada_a_alterar'] }).mensagem, 'Nenhuma alteração para salvar.');
  assert.deepEqual(Object.keys(mensagemDaEdicao(422, { campos: ['nome', 'tema', 'caminho/secreto'] }).erros).sort(), ['nome', 'tema']);
  assert.match(mensagemDaEdicao(500, { erro: 'indisponivel', detalhe: 'C:\\segredo' }).mensagem, /Nada foi alterado/);
  assert.doesNotMatch(JSON.stringify([mensagemDaEdicao(500, { detalhe: 'C:\\segredo' }), mensagemDaEdicao(409, { erro: 'x', detalhe: 'segredo' })]), /segredo/);
  assert.equal(mensagemDaEdicao(401, {}).mensagem.length > 0, true);
});

test('EI5. resumos das leituras: formato inválido vira null; títulos e nomes saem como texto simples', () => {
  assert.equal(resumirEdicaoDoTema(null), null);
  assert.equal(resumirEdicaoDoTema({ nome: 'A', servicos: 'x', revisao: REVISAO }), null);
  assert.deepEqual(resumirEdicaoDoTema({ nome: 'A', servicos: ['S1', 5, ''], revisao: REVISAO, extra: 1 }), { nome: 'A', servicos: ['S1'], revisao: REVISAO });
  assert.equal(resumirEdicaoDoServico({ nome: 'A', temaId: 'x', revisao: REVISAO }), null);
  assert.deepEqual(resumirEdicaoDoServico({ nome: 'A', temaId: 'tema-um', informacoesAceitas: ['I1', 7], revisao: REVISAO }), { nome: 'A', temaId: 'tema-um', revisao: REVISAO, informacoesAceitas: ['I1'] });
});

test('EI6. cliente: leituras sem corpo; PATCH com a revisão, o corpo mínimo e a confirmação só quando dada; uma gravação por vez; nada antes de entrar', async () => {
  const { cliente, chamadas } = await clienteCom({
    'GET /__admin/temas/tema-um/edicao': { status: 200, corpo: { nome: 'Licenciamento', servicos: ['Licença Simples'], revisao: REVISAO } },
    'GET /__admin/servicos/servico-a/edicao': { status: 200, corpo: { nome: 'Licença Simples', temaId: 'tema-um', informacoesAceitas: ['Prazo'], revisao: REVISAO } },
    'PATCH /__admin/temas/tema-um/edicao': { status: 200, corpo: { revisao: 'd'.repeat(64) } },
    'PATCH /__admin/servicos/servico-a/edicao': { status: 200, corpo: { revisao: 'd'.repeat(64), blocosReabertos: 2 } },
  });
  assert.deepEqual(await cliente.carregarEdicaoDoTema('tema-um'), { ok: true, nome: 'Licenciamento', servicos: ['Licença Simples'], revisao: REVISAO });
  assert.deepEqual(await cliente.carregarEdicaoDoServico('servico-a'), { ok: true, nome: 'Licença Simples', temaId: 'tema-um', revisao: REVISAO, informacoesAceitas: ['Prazo'] });
  assert.deepEqual(chamadas.filter((c) => c.metodo === 'GET' && c.url.includes('edicao')).map((c) => c.corpo), [undefined, undefined]);
  assert.deepEqual(await cliente.editarTema('tema-um', 'Novo nome', REVISAO), { ok: true });
  assert.deepEqual(await cliente.editarServico('servico-a', { nome: 'Novo' }, REVISAO, false), { ok: true, blocosReabertos: 2 });
  assert.deepEqual(await cliente.editarServico('servico-a', { temaId: 'tema-dois' }, REVISAO, true), { ok: true, blocosReabertos: 2 });
  const patches = chamadas.filter((c) => c.metodo === 'PATCH');
  assert.deepEqual(patches.map((c) => c.url), ['/__admin/temas/tema-um/edicao', '/__admin/servicos/servico-a/edicao', '/__admin/servicos/servico-a/edicao']);
  assert.deepEqual(patches[0].corpo, { revisao: REVISAO, nome: 'Novo nome', confirmado: true });
  assert.deepEqual(patches[1].corpo, { nome: 'Novo', revisao: REVISAO });
  assert.deepEqual(patches[2].corpo, { temaId: 'tema-dois', revisao: REVISAO, confirmado: true });
  for (const c of chamadas.filter((x) => x.url !== '/__admin/sessao')) assert.equal(c.cabecalhos[CABECALHO_TOKEN], TOKEN);
  for (const c of patches) assert.doesNotMatch(JSON.stringify(c.corpo), /"id"|sigla|publicado|statusValidacao/);
  // sem entrar: nada é enviado
  const s = servidorFalso({});
  const sem = criarClienteGestao({ fetchImpl: s.fetchImpl });
  assert.equal((await sem.editarTema('tema-um', 'X', REVISAO)).ok, false);
  assert.equal((await sem.carregarEdicaoDoServico('servico-a')).ok, false);
  assert.deepEqual(s.chamadas, []);
  // ids inválidos nunca viram rota
  assert.equal((await cliente.editarTema('../x', 'Y', REVISAO)).ok, false);
  assert.equal((await cliente.editarServico('servico-a', null, REVISAO, true)).ok, false);
  assert.equal(chamadas.some((c) => c.url.includes('..')), false);
});

test('EI7. cliente: erros do servidor viram mensagens fixas; segunda gravação em andamento é recusada sem envio', async () => {
  const { cliente } = await clienteCom({
    'GET /__admin/servicos/servico-a/edicao': { status: 409, corpo: { erro: 'versao_congelada' } },
    'PATCH /__admin/temas/tema-um/edicao': { status: 409, corpo: { erro: 'ja_existe', campo: 'nome', detalhe: 'segredo' } },
    'PATCH /__admin/servicos/servico-a/edicao': { status: 409, corpo: { erro: 'revisao_divergente' } },
  });
  assert.deepEqual(await cliente.carregarEdicaoDoServico('servico-a'), { ok: false, mensagem: MENSAGEM_VERSAO_CONCLUIDA_PARA_EDITAR, recarregar: true });
  assert.deepEqual(await cliente.editarTema('tema-um', 'Água e Solo', REVISAO), { ok: false, mensagem: MENSAGEM_NOME_TEMA_REPETIDO, erros: { nome: MENSAGEM_NOME_TEMA_REPETIDO } });
  assert.deepEqual(await cliente.editarServico('servico-a', { nome: 'X' }, REVISAO, false), { ok: false, mensagem: MENSAGEM_REVISAO_DIVERGENTE, recarregar: true });
  let liberar;
  const portao = new Promise((r) => { liberar = r; });
  const lento = criarClienteGestao({ fetchImpl: async (url) => (url === '/__admin/sessao' ? { status: 200, json: async () => ({ token: TOKEN }) } : (await portao, { status: 200, json: async () => ({}) })) });
  await lento.entrar();
  const primeira = lento.editarTema('tema-um', 'Novo nome', REVISAO);
  const segunda = await lento.editarTema('tema-um', 'Outro nome', REVISAO);
  assert.deepEqual([segunda.ok, segunda.emAndamento], [false, true]);
  liberar();
  assert.equal((await primeira).ok, true);
});

test('EI8. HTML: botões Editar, Salvar, Cancelar, diálogos acessíveis, rótulos, erros junto ao campo, sem ids, hash nem campos avançados', () => {
  assert.match(HTML, /id="botao-editar-servico"[^>]*>(?:<svg[^>]*><use[^>]*><\/use><\/svg>)?Editar nome e tema</);
  assert.match(HTML, /id="ed-salvar">Salvar</);
  assert.match(HTML, /id="ed-cancelar">Cancelar</);
  assert.match(HTML, /id="im-confirmar">Confirmar alteração</);
  assert.match(HTML, /id="im-voltar">Voltar</);
  assert.match(HTML, /<dialog id="dialogo-edicao" class="dialogo" aria-labelledby="ed-titulo">/);
  assert.match(HTML, /<dialog id="dialogo-impacto" class="dialogo" aria-labelledby="im-titulo" aria-describedby="im-resumo">/);
  for (const campo of ['ed-nome', 'ed-tema']) {
    assert.match(HTML, new RegExp(`<label for="${campo}">`));
    assert.match(HTML, new RegExp(`id="${campo}-erro" class="erro" hidden`));
  }
  assert.match(HTML, /id="ed-mensagem" class="erro" role="alert" tabindex="-1" hidden/);
  assert.match(HTML, /id="im-mensagem" class="erro" role="alert" tabindex="-1" hidden/);
  const dialogos = HTML.slice(HTML.indexOf('<dialog id="dialogo-edicao"'));
  assert.equal((dialogos.match(/<(input|select|textarea)\b/g) ?? []).length, 2, 'só nome e tema (sem sigla, termos, descrição técnica nem identificadores)');
  assert.doesNotMatch(dialogos, /sigla|Identificador|termos|hash|descricao|name="/i);
  assert.equal((HTML.match(/Editar nome e tema/g) ?? []).length, 1);
});

test('EI9. admin.js: nada é enviado ao abrir; cada gravação passa pelo cliente uma vez; foco devolvido; sem innerHTML, armazenamento do navegador ou ids na tela', () => {
  assert.equal((JS.match(/cliente\.editarTema\(/g) ?? []).length, 1);
  assert.equal((JS.match(/cliente\.editarServico\(/g) ?? []).length, 1);
  assert.equal((JS.match(/cliente\.carregarEdicaoDoTema\(/g) ?? []).length, 1);
  assert.equal((JS.match(/cliente\.carregarEdicaoDoServico\(/g) ?? []).length, 1);
  // as leituras só acontecem nos cliques de "Editar", nunca no carregamento do módulo
  assert.deepEqual(JS.split('\n').filter((l) => /^(await |cliente\.|entrar\(|carregar|abrirEdicao)/.test(l)), []);
  assert.match(JS, /\$\('botao-editar-servico'\)\.addEventListener\('click'/);
  assert.match(JS, /devolverFoco\(e\.tipo === 'tema' \? botaoDoTema\(e\.id\) : \$\('botao-editar-servico'\)\)/);
  assert.doesNotMatch(JS, /innerHTML|outerHTML|insertAdjacentHTML|localStorage|sessionStorage|document\.cookie|console\.|window\.scroll|scrollTo\(/);
  // o id só entra em variáveis e rotas, nunca em textContent
  assert.doesNotMatch(JS, /textContent\s*=\s*[^;]*\.(id|temaId)\b/);
  assert.doesNotMatch(JS, /setAttribute\('aria-label',[^)]*\.id/);
  // o servidor decide: o cliente só envia o que mudou
  assert.doesNotMatch(LOGICA.slice(LOGICA.indexOf('async editarServico'), LOGICA.indexOf('// ---------- Revisão do conteúdo')), /sigla|statusValidacao|publicado/);
});

test('EI10. este arquivo não grava nada em disco e os arquivos de admin/ continuam os mesmos', () => {
  const corpo = lerTexto('tests', 'admin-edicao-tema-servico-interface.test.js').split('\n').filter((l) => !/assert\./.test(l)).join('\n');
  assert.doesNotMatch(corpo, /writeFileSync|appendFileSync|mkdirSync|rmSync|renameSync|unlinkSync|copyFileSync|cpSync/);
  assert.deepEqual(fs.readdirSync(path.join(RAIZ, 'admin')).sort(), ['admin-logic.js', 'admin.js', 'conteudo', 'index.html', 'saude', 'styles.css']);
});
