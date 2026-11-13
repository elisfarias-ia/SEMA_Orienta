// Seção "Fontes do serviço" da tela "Gestão de conteúdo" (Marco 7, Passo 7E3A): lógica pura, cliente com fetch simulado,
// estrutura de acessibilidade e isolamento do build. Dados fictícios; nada é gravado e a rede não é usada.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ROTAS, CABECALHO_TOKEN, TIPOS_FONTE, ROTULOS_TIPO_FONTE, AJUDA_ORIGEM_OFICIAL, validarFormFonte, corpoDaFonte, resumoDaFonte, rotuloTipoFonte, rotuloSituacaoFonte,
  resumirFontes, mensagemDeErro, MENSAGENS, criarClienteAdmin,
} from '../admin/admin-logic.js';
import { conferirDist, NOMES_ADMINISTRATIVOS } from '../scripts/check-dist.js';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lerTexto = (...p) => fs.readFileSync(path.join(RAIZ, ...p), 'utf8');
const lerJson = (...p) => JSON.parse(lerTexto(...p));
const HTML = lerTexto('admin', 'index.html');
const JS = lerTexto('admin', 'admin.js');
const LOGICA = lerTexto('admin', 'admin-logic.js');
const TOKEN = 'cd'.repeat(32);
const REVISAO = 'ef'.repeat(32);
const FORM = { id: 'fonte-ficticia', titulo: 'Fonte fictícia', tipo: 'pagina_oficial', orgaoResponsavel: 'Órgão fictício', url: 'https://exemplo.test/pagina', descricao: 'Descrição fictícia.', origemOficial: true, dataPublicacao: '', dispositivoRelevante: '' };

function servidorFalso({ estado = 'rascunho', fontes, respostas = {}, portao = null } = {}) {
  const dados = { estado, revisao: REVISAO, fontes: fontes ?? [{ id: 'f-um', titulo: 'Fonte Um', tipo: 'legislacao', orgaoResponsavel: 'Órgão Um', url: 'https://exemplo.test/um', descricao: 'Texto interno.', statusValidacao: 'validado', publicado: false }] };
  const chamadas = [];
  const r = (status, corpo) => ({ status, json: async () => corpo });
  const fetchImpl = async (url, opcoes = {}) => {
    chamadas.push({ url, ...opcoes, corpo: opcoes.body === undefined ? undefined : JSON.parse(opcoes.body) });
    if (respostas[url]) return respostas[url](opcoes);
    if (url === ROTAS.sessao) return r(200, { token: TOKEN });
    if (opcoes.headers?.[CABECALHO_TOKEN] !== TOKEN) return r(401, { erro: 'nao_autorizado' });
    if (url === '/__admin/servicos/servico-ficticio/versao-atual' && opcoes.method === 'GET') {
      return r(200, { servicoId: 'servico-ficticio', versaoId: 'servico-ficticio-v1', manifesto: { estado: dados.estado }, revisaoFontes: dados.revisao, fontes: { fontes: dados.fontes }, roteiro: 'texto interno' });
    }
    if (url === '/__admin/servicos/servico-ficticio/fontes' && opcoes.method === 'POST') {
      if (portao) await portao;
      const c = JSON.parse(opcoes.body);
      if (c.revisao !== dados.revisao) return r(409, { erro: 'revisao_divergente' });
      const nova = { id: c.id, titulo: c.titulo, tipo: c.tipo, orgaoResponsavel: c.orgaoResponsavel, url: c.url, descricao: c.descricao, statusValidacao: 'rascunho', publicado: false };
      dados.fontes.push(nova);
      dados.revisao = 'ab'.repeat(32);
      return r(201, { fonte: nova, revisao: dados.revisao });
    }
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

// ---------- Validação e corpo ----------

test('FI1. formulário de fonte válido: dados aparados, opcionais nulos e origem oficial como booleano', () => {
  const r = validarFormFonte({ ...FORM, id: ' fonte-nova ', titulo: '  Título   da   fonte ', url: ' https://exemplo.test/p?pagina=2#trecho ', dataPublicacao: ' 29-02-2020 ', dispositivoRelevante: ' Art. 1º ' });
  assert.deepEqual(r, { ok: true, dados: { id: 'fonte-nova', titulo: 'Título da fonte', tipo: 'pagina_oficial', orgaoResponsavel: 'Órgão fictício', url: 'https://exemplo.test/p?pagina=2#trecho', descricao: 'Descrição fictícia.', origemOficial: true, dataPublicacao: '2020-02-29', dispositivoRelevante: 'Art. 1º' } });
  const simples = validarFormFonte({ ...FORM, origemOficial: false });
  assert.equal(simples.ok, true);
  assert.deepEqual([simples.dados.origemOficial, simples.dados.dataPublicacao, simples.dados.dispositivoRelevante], [false, null, null]);
  assert.equal(validarFormFonte({ ...FORM, origemOficial: 'on' }).dados.origemOficial, false, 'só o booleano verdadeiro vale');
  for (const tipo of TIPOS_FONTE) assert.equal(validarFormFonte({ ...FORM, tipo }).ok, true, tipo);
});

test('FI2. formulário de fonte: obrigatórios, tipo, limites, datas e dados pessoais', () => {
  const erros = (extra) => validarFormFonte({ ...FORM, ...extra }).erros;
  assert.deepEqual(Object.keys(validarFormFonte({}).erros).sort(), ['descricao', 'id', 'orgaoResponsavel', 'tipo', 'titulo', 'url']);
  assert.deepEqual(Object.keys(validarFormFonte(null).erros).sort(), ['descricao', 'id', 'orgaoResponsavel', 'tipo', 'titulo', 'url']);
  assert.match(erros({ id: 'ID Ruim' }).id, /minúsculas/);
  assert.match(erros({ titulo: '  ' }).titulo, /Preencha o título/);
  assert.match(erros({ titulo: 'x'.repeat(201) }).titulo, /máximo 200/);
  assert.match(erros({ tipo: '' }).tipo, /Escolha o tipo/);
  assert.match(erros({ tipo: 'lei' }).tipo, /Escolha o tipo/);
  assert.match(erros({ orgaoResponsavel: '' }).orgaoResponsavel, /órgão responsável/);
  assert.match(erros({ descricao: '' }).descricao, /Preencha a descrição/);
  assert.match(erros({ descricao: 'd'.repeat(1001) }).descricao, /máximo 1000/);
  for (const data of ['27/07/2020', '2020-07-27', '13-13-2020', '29-02-2021', '31-02-2026', '00-10-2020', '32-01-2020', '1-1-2020', '27-07-20']) assert.match(erros({ dataPublicacao: data }).dataPublicacao, /DD-MM-AAAA/, data);
  assert.equal(validarFormFonte({ ...FORM, dataPublicacao: '' }).ok, true, 'data vazia é permitida');
  assert.equal(validarFormFonte({ ...FORM, dataPublicacao: '   ' }).dados.dataPublicacao, null);
  assert.match(erros({ dispositivoRelevante: 'x'.repeat(201) }).dispositivoRelevante, /máximo 200/);
  const email = ['pessoa', 'exemplo.test'].join('@');
  assert.match(erros({ titulo: `Contato ${email}` }).titulo, /e-mail/);
  assert.match(erros({ descricao: `Ligue ${['(65)', '99999-0000'].join(' ')}` }).descricao, /telefone/);
  assert.match(erros({ dispositivoRelevante: `Ver ${email}` }).dispositivoRelevante, /e-mail/);
});

test('FI3. a URL deve ser https, sem usuário e senha nem parâmetro de credencial, sem espaços nem dados pessoais', () => {
  const url = (u) => validarFormFonte({ ...FORM, url: u });
  for (const ruim of ['', '   ', 'exemplo.test/p', 'http://exemplo.test/p', 'ftp://exemplo.test/p', 'javascript:alert(1)', 'data:text/html,x', 'https://', ['https://usuario:senha', 'exemplo.test/p'].join('@'),
    ['https://usuario', 'exemplo.test/p'].join('@'), 'https://exemplo.test/p?token=abc', 'https://exemplo.test/p?API_KEY=abc', 'https://exemplo.test/p?senha=1', 'https://exemplo.test/p com espaço', `https://exemplo.test/${'a'.repeat(500)}`, undefined, 5]) {
    const r = url(ruim);
    assert.equal(r.ok, false, String(ruim).slice(0, 40));
    assert.ok(r.erros.url, String(ruim).slice(0, 40));
  }
  assert.match(url('http://exemplo.test/p').erros.url, /https:\/\//);
  assert.match(url(['https://u:s', 'exemplo.test/p'].join('@')).erros.url, /usuário e senha/);
  assert.match(url('https://exemplo.test/p?token=1').erros.url, /credencial/);
  assert.equal(url('https://exemplo.test/p?pagina=2#trecho').ok, true);
  assert.equal(url('https://exemplo.test/p?chave-publica=1').ok, true, 'só os nomes de credencial conhecidos são recusados');
});

test('FI4. corpo enviado: revisão e somente os campos permitidos (opcionais só quando informados); resumo com a explicação da origem oficial', () => {
  const dados = validarFormFonte({ ...FORM, dataPublicacao: '27-07-2020', dispositivoRelevante: 'Art. 1º', status: 'validado' }).dados;
  const corpo = corpoDaFonte({ ...dados, publicado: true, statusValidacao: 'validado', vigencia: 'x' }, REVISAO);
  assert.deepEqual(corpo, { revisao: REVISAO, id: 'fonte-ficticia', titulo: 'Fonte fictícia', tipo: 'pagina_oficial', orgaoResponsavel: 'Órgão fictício', url: 'https://exemplo.test/pagina', descricao: 'Descrição fictícia.', origemOficial: true, dataPublicacao: '2020-07-27', dispositivoRelevante: 'Art. 1º' });
  const minimo = corpoDaFonte(validarFormFonte(FORM).dados, REVISAO);
  assert.deepEqual(Object.keys(minimo).sort(), ['descricao', 'id', 'orgaoResponsavel', 'origemOficial', 'revisao', 'tipo', 'titulo', 'url']);
  assert.equal(dados.dataPublicacao, '2020-07-27', 'a conversão para AAAA-MM-DD acontece antes do envio');
  const resumo = resumoDaFonte(dados, { id: 'servico-ficticio', nome: 'Serviço Fictício' });
  assert.equal(resumo[8].valor, '27-07-2020', 'o resumo exibe DD-MM-AAAA');
  assert.deepEqual(resumo.map((l) => l.rotulo), ['Serviço', 'Identificador', 'Título', 'Tipo', 'Órgão responsável', 'URL', 'Descrição', 'Origem oficial', 'Data de publicação', 'Dispositivo relevante', 'Situação inicial']);
  assert.equal(resumo[0].valor, 'Serviço Fictício', 'o resumo mostra só o nome do serviço, sem id');
  assert.equal(resumo[3].valor, 'Página oficial');
  assert.ok(resumo[7].valor.includes(AJUDA_ORIGEM_OFICIAL));
  assert.match(resumo[10].valor, /Rascunho e não publicada/);
  assert.doesNotMatch(resumo[10].valor, /a confirmar/);
  assert.match(resumoDaFonte({ ...dados, tipo: 'legislacao' }, null)[10].valor, /vigência a confirmar/);
  assert.equal(resumoDaFonte({ ...dados, origemOficial: false }, null)[7].valor, 'Não');
  assert.equal(JSON.stringify([corpo, resumo]).includes(TOKEN), false);
  assert.equal(AJUDA_ORIGEM_OFICIAL, 'Origem oficial identifica a procedência, mas não significa que o conteúdo foi validado.');
});

test('FI5. rótulos e lista de exibição: título, tipo, órgão, validação e "não publicada"; sem URL, descrição nem dados internos', () => {
  assert.deepEqual(TIPOS_FONTE.map(rotuloTipoFonte), ['Legislação', 'Página oficial', 'Manual', 'Formulário', 'Sistema', 'Canal de atendimento', 'Outro']);
  assert.equal(Object.keys(ROTULOS_TIPO_FONTE).length, 7);
  assert.equal(rotuloTipoFonte('__proto__'), 'Tipo desconhecido');
  assert.deepEqual(['rascunho', 'em_validacao', 'validado', 'x'].map(rotuloSituacaoFonte), ['Rascunho', 'Em validação', 'Procedência validada', 'Situação indisponível']);
  const lista = resumirFontes({ fontes: [
    { id: 'a', titulo: 'Fonte A', tipo: 'manual', orgaoResponsavel: 'Órgão A', url: 'https://exemplo.test/a', descricao: 'Interno', statusValidacao: 'rascunho', publicado: false },
    { id: 'b', tipo: 'xyz', statusValidacao: 'validado', publicado: true }, { semId: true }, null,
  ] });
  assert.deepEqual(lista, [
    { id: 'a', titulo: 'Fonte A', tipo: 'Manual', orgao: 'Órgão A', situacao: 'Rascunho', publicacao: 'Não publicada' },
    { id: 'b', titulo: 'b', tipo: 'Tipo desconhecido', orgao: '—', situacao: 'Procedência validada', publicacao: 'Publicada' },
  ]);
  assert.deepEqual(resumirFontes(null), []);
  assert.doesNotMatch(JSON.stringify(lista), /exemplo\.test|Interno/);
});

// ---------- Cliente ----------

test('FI6. carregar as fontes de um serviço: estado, revisão e lista, com o token no cabeçalho e sem resposta bruta', async () => {
  const { c, chamadas } = await cliente();
  const r = await c.carregarFontes('servico-ficticio');
  assert.deepEqual(r, { ok: true, versaoId: 'servico-ficticio-v1', estado: 'rascunho', revisao: REVISAO, fontes: [{ id: 'f-um', titulo: 'Fonte Um', tipo: 'Legislação', orgao: 'Órgão Um', situacao: 'Procedência validada', publicacao: 'Não publicada' }] });
  const chamada = chamadas.at(-1);
  assert.equal(chamada.url, '/__admin/servicos/servico-ficticio/versao-atual');
  assert.equal(chamada.method, 'GET');
  assert.equal(chamada.headers[CABECALHO_TOKEN], TOKEN);
  assert.equal(JSON.stringify(r).includes(TOKEN), false);
  assert.doesNotMatch(JSON.stringify(r), /texto interno|exemplo\.test|Texto interno/);
});

test('FI7. carregar as fontes: sem sessão ou com id inválido não há chamada; falhas viram mensagem curta', async () => {
  const s = servidorFalso();
  const semSessao = criarClienteAdmin({ fetchImpl: s.fetchImpl });
  assert.deepEqual(await semSessao.carregarFontes('servico-ficticio'), { ok: false, mensagem: MENSAGENS.sessao });
  assert.deepEqual(s.chamadas, []);
  const { c, chamadas } = await cliente();
  const antes = chamadas.length;
  for (const id of ['', 'Id Ruim', '../x', undefined, 5, 'a/b']) assert.deepEqual(await c.carregarFontes(id), { ok: false, mensagem: MENSAGENS.generica });
  assert.equal(chamadas.length, antes);
  const casos = [
    [async () => ({ status: 500, json: async () => ({ erro: 'indisponivel' }) }), MENSAGENS.fontes],
    [async () => ({ status: 401, json: async () => ({ erro: 'nao_autorizado' }) }), mensagemDeErro(401, {})],
    [async () => ({ status: 200, json: async () => ({ manifesto: { estado: 'rascunho' }, versaoId: 'x-v1', revisaoFontes: 'curta', fontes: { fontes: [] } }) }), MENSAGENS.fontes],
    [async () => ({ status: 200, json: async () => ({ manifesto: {}, versaoId: 'x-v1', revisaoFontes: REVISAO, fontes: { fontes: [] } }) }), MENSAGENS.fontes],
    [async () => ({ status: 200, json: async () => ({ manifesto: { estado: 'rascunho' }, versaoId: 'x-v1', revisaoFontes: REVISAO, fontes: {} }) }), MENSAGENS.fontes],
    [async () => { throw new Error('rede'); }, MENSAGENS.rede],
  ];
  for (const [fn, mensagem] of casos) {
    const x = servidorFalso({ respostas: { '/__admin/servicos/servico-ficticio/versao-atual': fn } });
    const cl = criarClienteAdmin({ fetchImpl: x.fetchImpl });
    await cl.iniciarSessao();
    assert.deepEqual(await cl.carregarFontes('servico-ficticio'), { ok: false, mensagem });
  }
});

test('FI8. cadastrar fonte: POST JSON na rota do serviço, com o token, só o corpo do formulário; depois a lista e a revisão são atualizadas', async () => {
  const { c, chamadas } = await cliente();
  const corpo = corpoDaFonte(validarFormFonte(FORM).dados, REVISAO);
  const r = await c.cadastrar('fonte', corpo, { servicoId: 'servico-ficticio' });
  assert.deepEqual(r, { ok: true, item: { id: 'fonte-ficticia', nome: 'Fonte fictícia' } });
  const post = chamadas.filter((x) => x.method === 'POST');
  assert.equal(post.length, 1);
  assert.equal(post[0].url, '/__admin/servicos/servico-ficticio/fontes');
  assert.equal(post[0].headers['Content-Type'], 'application/json');
  assert.equal(post[0].headers[CABECALHO_TOKEN], TOKEN);
  assert.equal(post[0].body.includes(TOKEN), false);
  assert.deepEqual(post[0].corpo, corpo);
  const depois = await c.carregarFontes('servico-ficticio');
  assert.deepEqual(depois.fontes.map((f) => f.id), ['f-um', 'fonte-ficticia']);
  assert.equal(depois.fontes[1].publicacao, 'Não publicada');
  assert.equal(depois.fontes[1].situacao, 'Rascunho');
  assert.equal(depois.revisao, 'ab'.repeat(32), 'a revisão mudou');
  // Sem serviço ou com serviço inválido, nada é enviado.
  const n = chamadas.length;
  for (const contexto of [undefined, {}, { servicoId: '' }, { servicoId: '../x' }, { servicoId: 'Id Ruim' }]) {
    assert.deepEqual(await c.cadastrar('fonte', corpo, contexto), { ok: false, mensagem: MENSAGENS.generica });
  }
  assert.equal(chamadas.length, n);
});

test('FI9. erros do cadastro de fonte viram mensagens curtas; revisão antiga ou versão fora de rascunho pedem recarregar a lista', async () => {
  const casos = [
    [409, { erro: 'revisao_divergente' }, /mudaram desde que a lista foi aberta/, true],
    [409, { erro: 'versao_nao_editavel' }, /não está em rascunho/, true],
    [409, { erro: 'ja_existe', campo: 'url' }, /Já existe uma fonte com esta URL/, false],
    [409, { erro: 'ja_existe', campo: 'id' }, /identificador/, false],
    [409, { erro: 'operacao_em_andamento' }, /em andamento/, false],
    [422, { erro: 'dados_invalidos', campos: ['revisao'] }, /revisão das fontes/, false],
    [422, { erro: 'dados_invalidos', campos: ['url', 'tipo', 'origemOficial'] }, /URL, tipo, origem oficial/, false],
    [422, { erro: 'dados_invalidos', campos: ['extras'] }, /não são permitidos/, false],
    [404, { erro: 'nao_encontrado' }, /não foi encontrado/, false],
    [401, { erro: 'nao_autorizado' }, /sessão administrativa/, false],
    [403, { erro: 'acesso_somente_local' }, /neste computador/, false],
    [413, { erro: 'corpo_grande_demais' }, /grandes demais/, false],
    [415, { erro: 'tipo_nao_suportado' }, /formato/, false],
    [500, { erro: 'indisponivel' }, /Nada foi alterado/, false],
  ];
  for (const [status, corpo, padrao, recarregar] of casos) {
    const s = servidorFalso({ respostas: { '/__admin/servicos/servico-ficticio/fontes': async () => ({ status, json: async () => corpo }) } });
    const c = criarClienteAdmin({ fetchImpl: s.fetchImpl });
    await c.iniciarSessao();
    const r = await c.cadastrar('fonte', corpoDaFonte(validarFormFonte(FORM).dados, REVISAO), { servicoId: 'servico-ficticio' });
    assert.equal(r.ok, false);
    assert.match(r.mensagem, padrao, `${status} ${JSON.stringify(corpo)}`);
    assert.doesNotMatch(r.mensagem, /revisao_divergente|versao_nao_editavel|ja_existe|dados_invalidos|extras\b|indisponivel/);
    assert.equal(r.recarregar === true, recarregar, `${status} recarregar`);
    assert.equal(c.gravando(), false);
  }
  const hostil = { erro: 'revisao_divergente <script>SEGREDO</script>', campo: '<b>x</b>', campos: ['<i>SEGREDO</i>'] };
  assert.doesNotMatch(mensagemDeErro(409, hostil), /SEGREDO|<|script/);
  assert.doesNotMatch(mensagemDeErro(422, hostil), /SEGREDO|<|script/);
});

test('FI10. envio duplicado de fonte é bloqueado enquanto há gravação em andamento', async () => {
  let abrir;
  const portao = new Promise((r) => { abrir = r; });
  const { c, chamadas } = await cliente({ portao });
  const corpo = corpoDaFonte(validarFormFonte(FORM).dados, REVISAO);
  const primeira = c.cadastrar('fonte', corpo, { servicoId: 'servico-ficticio' });
  await Promise.resolve();
  assert.equal(c.gravando(), true);
  const segunda = await c.cadastrar('fonte', { ...corpo, id: 'outra-fonte' }, { servicoId: 'servico-ficticio' });
  assert.deepEqual(segunda, { ok: false, emAndamento: true, mensagem: MENSAGENS.emAndamento });
  assert.equal(chamadas.filter((x) => x.method === 'POST').length, 1);
  abrir();
  assert.equal((await primeira).ok, true);
  assert.equal(c.gravando(), false);
});

// ---------- HTML, código e isolamento ----------

test('FI11. a seção "Fontes do serviço": serviço da lista, formulário com rótulos, explicação da origem oficial e confirmação', () => {
  assert.match(HTML, /<h2 id="titulo-fontes">Fontes do serviço<\/h2>/);
  assert.match(HTML, /<h3 class="subtitulo">Nova fonte<\/h3>/);
  assert.match(HTML, /<label for="fontes-servico">Serviço<\/label>/);
  assert.match(HTML, /<p id="fontes-situacao" class="ajuda" aria-live="polite">/);
  assert.match(HTML, /<div id="fontes-lista" aria-busy="false"><\/div>/);
  for (const id of ['fonte-id', 'fonte-titulo', 'fonte-tipo', 'fonte-orgao', 'fonte-url', 'fonte-descricao', 'fonte-oficial', 'fonte-data', 'fonte-dispositivo']) {
    assert.match(HTML, new RegExp(`<label for="${id}">`), `label de ${id}`);
    assert.match(HTML, new RegExp(`id="${id}-erro" class="erro" hidden`), `erro de ${id}`);
  }
  // Explicação ao lado de "origem oficial", ligada ao campo por aria-describedby.
  assert.match(HTML, /<input id="fonte-oficial" name="origemOficial" type="checkbox" aria-describedby="fonte-oficial-ajuda fonte-oficial-erro" \/>/);
  assert.match(HTML, /<p id="fonte-data-ajuda" class="ajuda">Formato DD-MM-AAAA\.<\/p>/);
  assert.doesNotMatch(HTML, /AAAA-MM-DD/);
  assert.match(HTML, /<p id="fonte-oficial-ajuda" class="ajuda">Origem oficial identifica a procedência, mas não significa que o conteúdo foi validado\.<\/p>/);
  const opcoes = [...HTML.slice(HTML.indexOf('id="fonte-tipo"'), HTML.indexOf('id="fonte-tipo-erro"')).matchAll(/<option value="([^"]*)">([^<]+)<\/option>/g)].map((m) => [m[1], m[2]]);
  assert.deepEqual(opcoes.slice(1), TIPOS_FONTE.map((t) => [t, ROTULOS_TIPO_FONTE[t]]));
  assert.match(HTML, /<button type="submit" class="botao" id="fonte-enviar" disabled>Revisar cadastro<\/button>/);
  assert.match(HTML, /não valida nem publica fontes/);
  // Os campos que o servidor define não existem no formulário.
  assert.doesNotMatch(HTML, /name="(statusValidacao|publicado|dataConsulta|vigencia|normasRelacionadas|observacao|revisao)"/);
});

test('FI12. o código da tela usa a revisão lida, só cadastra com versão em rascunho e não oferece editar, excluir, validar nem publicar fontes', () => {
  assert.match(JS, /const fontesPodeGravar = \(\) => fontes\.servicoId !== null && fontes\.estado === 'rascunho' && fontes\.revisao !== null;/);
  assert.match(JS, /corpoDaFonte\(dados, fontes\.revisao\)/);
  assert.match(JS, /cliente\.carregarFontes\(servicoId\)/);
  assert.match(JS, /if \(!fontesPodeGravar\(\)\) \$\(BOTOES\.fonte\)\.disabled = true;/);
  assert.match(JS, /sequenciaDeFontes/);
  assert.match(JS, /r\.recarregar/);
  assert.equal((JS.match(/cliente\.cadastrar\(/g) ?? []).length, 1);
  const textos = `${HTML}\n${JS}\n${LOGICA}`;
  assert.doesNotMatch(textos, /\b(Editar|Excluir|Apagar|Remover)\b|Publicar|Autorizar|Validar conteúdo|Enviar para validação|decis[ãa]o/i);
  assert.equal((LOGICA.match(/'POST'/g) ?? []).length, 1);
  assert.doesNotMatch(LOGICA, /['"`](PUT|PATCH|DELETE)['"`]/);
  assert.match(LOGICA, /`\$\{ROTAS\.servicos\}\/\$\{encodeURIComponent\(contexto\.servicoId\)\}\/fontes`/);
  assert.doesNotMatch(`${JS}\n${LOGICA}`, /innerHTML|outerHTML|insertAdjacentHTML|localStorage|sessionStorage|document\.cookie|console\./);
  assert.doesNotMatch(LOGICA, /new Date\(|Date\.now|\bdocument\b|\bwindow\b/);
});

test('FI13. isolamento: dist/ não contém a seção, o formulário, a rota nem a revisão; a conferência do build procura esses nomes', { skip: !fs.existsSync(path.join(RAIZ, 'dist')) }, () => {
  assert.deepEqual(conferirDist(RAIZ), []);
  const lista = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? lista(path.join(d, e.name)) : [path.join(d, e.name)]));
  for (const f of lista(path.join(RAIZ, 'dist'))) {
    assert.doesNotMatch(fs.readFileSync(f, 'utf8'), /Fontes do serviço|Nova fonte|form-fonte|fonte-enviar|fontes-servico|revisaoFontes|\/fontes|validarFormFonte|corpoDaFonte|resumoDaFonte|carregarFontes|cadastrarFonte|Origem oficial identifica/, f);
  }
});

test('FI14. a conferência do build procura os nomes e textos da seção de fontes', () => {
  for (const nome of ['form-fonte', 'fonte-enviar', 'Fontes do serviço', 'Nova fonte', 'revisaoFontes', 'validarCorpoFonte', 'montarFonte', 'validarFormFonte', 'carregarFontes']) {
    assert.ok(NOMES_ADMINISTRATIVOS.includes(nome), nome);
  }
  for (const arquivo of ['index.html', 'src/main.js', 'src/chat.js', 'src/assistant.js', 'src/styles.css']) {
    assert.doesNotMatch(lerTexto(arquivo), /Fontes do serviço|Nova fonte|\/fontes|revisaoFontes|admin/i, arquivo);
  }
});

test('FI15. a base real não foi alterada: as oito fontes da LAC e o catálogo continuam como estavam; este arquivo não grava nada', () => {
  const doc = lerJson('services', 'lac', 'versoes', 'v1', 'fontes.json');
  assert.deepEqual(doc.fontes.map((f) => f.id), ['sema-orientacoes-lac', 'lei-complementar-668-2020', 'decreto-695-2020', 'decreto-1268-2022', 'decreto-1585-2022', 'tr-176-lac', 'manual-lac-siga-2020', 'faq-lac-2022']);
  assert.ok(doc.fontes.every((f) => f.publicado === false));
  assert.deepEqual(lerJson('services', 'assuntos.json').assuntos.map((a) => a.nome), ['Licenciamento Ambiental']);
  assert.deepEqual(lerJson('services', 'registry.json').servicos.map((s) => s.id), ['lac']);
  const corpoDoTeste = lerTexto('tests', 'admin-fontes-interface.test.js').split('\n').filter((l) => !/assert\.(doesNotMatch|match)/.test(l)).join('\n');
  assert.doesNotMatch(corpoDoTeste, /writeFileSync|appendFileSync|mkdirSync|rmSync|renameSync|unlinkSync|copyFileSync|cpSync/);
});
