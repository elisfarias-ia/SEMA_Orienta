// Teste real de autorizar e publicar (Passo 5C, interface): sem mocks de rota, exceto onde o comentário diz o contrário (erros que a
// base não consegue produzir sozinha). O servidor é o Vite de verdade (veja preparar.js), com a base de serviços copiada para uma
// pasta temporária. Cada teste cria o próprio serviço FICTÍCIO pela interface (serviço, link e texto novos, informação, revisão da
// fonte, aceite e conclusão) e nunca publica a LAC real. Como aqui se publica de verdade na CÓPIA, ao final a cópia volta a ser
// idêntica à base real (revisao-real.spec.js confere que nada foi publicado e roda depois deste arquivo). A base real é conferida
// por hash em zz-base-real.spec.js.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';

// Passo 8B (login simulado): a sessão é única no servidor e só existe em memória (nada é gravado em disco). Antes de abrir
// /admin/, a sessão é encerrada para a escolha de usuário aparecer; depois, a usuária fictícia Maria Silva é marcada.
async function encerrarSessao(page) {
  const corpo = await (await page.request.get('/__admin/sessao')).json();
  if (typeof corpo.token === 'string') await page.request.delete('/__admin/sessao', { headers: { 'X-Admin-Token': corpo.token } });
}
const escolherMaria = (page) => page.getByRole('radio', { name: /^Maria Silva — / }).check();

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ENTRAR = 'Acessar administração';
const TEMA = 'Tema Publicação Real';
// Ids, hashes, estados internos e códigos de erro nunca aparecem na tela ("Publicado" e "Publicação autorizada" são rótulos comuns).
const TECNICO = /rascunho|em_validacao|validado_materialmente|autorizado_publicacao|estado_invalido|revisao_divergente|hash_divergente|historico_incompativel|conteudo_excluido_citado|sem_informacao_aceita|versao_congelada|[0-9a-f]{64}|X-Admin-Token|X-Revisao|\bbc-[0-9a-f]{6,}/i;
const botao = (page, nome) => page.getByRole('button', { name: nome, exact: true });
const status = (page) => page.locator('#status');
const dlgAutorizar = (page) => page.locator('#dialogo-autorizacao');
const dlgPublicar = (page) => page.locator('#dialogo-publicacao');

test.afterAll(() => {
  const copia = path.join(process.env.SEMA_REAL_COPIA, 'services');
  const real = path.join(RAIZ, 'services');
  fs.rmSync(copia, { recursive: true, force: true });
  fs.cpSync(real, copia, { recursive: true });
});

function observarPosts(page) {
  const posts = [];
  page.on('request', (r) => {
    if (r.method() === 'POST' && r.url().includes('/__admin/')) posts.push({ caminho: new URL(r.url()).pathname, texto: r.postData(), tipo: r.headers()['content-type'] });
  });
  return posts;
}
const posts = (lista, final) => lista.filter((p) => p.caminho.endsWith(final));

async function entrar(page) {
  await encerrarSessao(page);
  await page.goto('/admin/');
  await escolherMaria(page);
  await page.getByRole('button', { name: ENTRAR }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'Serviços' })).toBeVisible();
}

/** Serviço fictício com um link e um texto, tudo pela interface. Termina com o painel do serviço aberto em /admin/. */
async function criarServicoComFontes(page, nome) {
  const slug = nome.toLowerCase().replace(/[^a-z]+/g, '-');
  const dados = { nome, link: `Portal ${nome}`, texto: `Texto ${nome}` };
  await entrar(page);
  await botao(page, 'Novo serviço').click();
  await page.locator('#novo-nome').fill(nome);
  await page.locator('#novo-tema').fill(TEMA);
  await botao(page, 'Criar serviço').click();
  await expect(page.getByRole('heading', { level: 2, name: nome })).toBeVisible();
  await botao(page, 'Link').click();
  await page.locator('#link-titulo').fill(dados.link);
  await page.locator('#link-url').fill(`https://exemplo.test/${slug}`);
  await page.locator('#link-orgao').fill('Órgão de Teste');
  await page.locator('#link-descricao').fill('Página com as orientações.');
  await botao(page, 'Incluir link').click();
  await expect(status(page)).toContainText('Link adicionado');
  await botao(page, 'Texto').click();
  await page.locator('#texto-titulo').fill(dados.texto);
  await page.locator('#texto-texto').fill(`Informação de teste do serviço ${nome}, escrita para conferência.`);
  await botao(page, 'Incluir texto').click();
  await expect(status(page)).toContainText('Texto adicionado');
  return dados;
}

/** Serviço fictício com a revisão concluída (versão bloqueada), aberto em /admin/conteudo/. */
async function prepararConcluido(page, nome) {
  const d = await criarServicoComFontes(page, nome);
  await page.getByRole('link', { name: 'Revisar informações' }).click();
  await expect(page).toHaveURL(/\/admin\/conteudo\/\?servico=/);
  await expect(page.locator('#blocos')).toHaveAttribute('aria-busy', 'false');
  await botao(page, 'Incluir informação').click();
  await page.getByLabel('Tema da informação', { exact: true }).fill('Documentos exigidos');
  await page.getByLabel('O que o chatbot deve informar ao cidadão?').fill('Orientação de teste: documentos exigidos.');
  await page.getByRole('checkbox', { name: new RegExp(`^${d.link}`) }).check();
  await page.getByLabel(new RegExp(`Onde esta informação aparece na fonte\\? \\(${d.link}\\)`)).fill('Seção 1');
  await page.locator('#bloco-enviar').click();
  await botao(page, 'Confirmar e salvar').click();
  await expect(status(page)).toContainText('Informação salva.');
  await page.locator('#aba-fontes').click();
  await botao(page, `Marcar como revisado: ${d.link}`).click();
  await expect(status(page)).toContainText('Documento ou link marcado como revisado.');
  await page.locator('#aba-informacoes').click();
  await botao(page, 'Aceitar informação: Documentos exigidos').click();
  await expect(status(page)).toContainText('Informação aceita.');
  await botao(page, 'Concluir revisão').click();
  await botao(page, 'Confirmar conclusão').click();
  await expect(status(page)).toContainText('Revisão concluída.');
  await expect(page.locator('#cartao-publicacao')).toBeVisible();
  return d;
}

test('1. fluxo completo: autorizar e publicar, com diálogos diferentes, foco e estado novo, sem termos técnicos', async ({ page }) => {
  const enviados = observarPosts(page);
  const d = await prepararConcluido(page, 'Serviço Pub Alfa');
  // etapa 1: revisão concluída não publica; só "Autorizar publicação"
  await expect(page.locator('#cartao-publicacao')).toContainText('Revisar é conferir');
  await expect(page.locator('#cartao-publicacao')).toContainText('Autorizar é registrar');
  await expect(page.locator('#cartao-publicacao')).toContainText('Publicar é disponibilizar');
  await expect(page.locator('#conclusao-explicacao')).toBeHidden();
  await expect(botao(page, 'Autorizar publicação')).toBeVisible();
  await expect(botao(page, 'Publicar')).toHaveCount(0);
  await expect(page.locator('#publicacao-estado')).toContainText('a publicação ainda não foi autorizada');
  expect(await page.locator('body').innerText()).not.toMatch(TECNICO);
  // diálogo de autorização: versão, data, quantidades e aviso; Voltar devolve o foco e nada é enviado
  await botao(page, 'Autorizar publicação').click();
  await expect(dlgAutorizar(page)).toBeVisible();
  await expect(dlgAutorizar(page).getByRole('heading', { level: 2 })).toHaveText('Autorizar a publicação?');
  const texto = await dlgAutorizar(page).innerText();
  expect(texto).toMatch(/Versão\s*1/);
  expect(texto).toMatch(/Data da revisão\s*\d{2}\/\d{2}\/\d{4}/);
  expect(texto).toMatch(/Informações aceitas\s*1/);
  expect(texto).toMatch(/Links\s*\d+/);
  expect(texto).toMatch(/Textos\s*\d+/);
  expect(texto).toContain('A próxima ação disponibilizará conteúdo ao cidadão.');
  expect(texto).not.toMatch(TECNICO);
  await expect(botao(page, 'Voltar')).toBeFocused();
  await botao(page, 'Voltar').click();
  await expect(dlgAutorizar(page)).toBeHidden();
  await expect(botao(page, 'Autorizar publicação')).toBeFocused();
  expect(posts(enviados, '/autorizacao')).toHaveLength(0);
  // confirmar: um único pedido com só a revisão; foco vai ao título do cartão; "Publicar" aparece
  await botao(page, 'Autorizar publicação').click();
  await botao(page, 'Confirmar autorização').click();
  await expect(status(page)).toContainText('Publicação autorizada.');
  await expect(page.locator('#titulo-publicacao')).toBeFocused();
  expect(posts(enviados, '/autorizacao')).toHaveLength(1);
  expect(posts(enviados, '/autorizacao')[0].tipo).toContain('application/json');
  expect(JSON.parse(posts(enviados, '/autorizacao')[0].texto)).toEqual({ revisao: expect.any(String) });
  expect(posts(enviados, '/publicacao')).toHaveLength(0);
  await expect(botao(page, 'Autorizar publicação')).toHaveCount(0);
  await expect(botao(page, 'Publicar')).toBeVisible();
  await expect(page.locator('#publicacao-estado')).toContainText('Publicação autorizada, mas ainda não publicada');
  expect(await page.locator('body').innerText()).not.toMatch(TECNICO);
  // diálogo de publicação é outro
  await botao(page, 'Publicar').click();
  await expect(dlgPublicar(page)).toBeVisible();
  await expect(dlgAutorizar(page)).toBeHidden();
  await expect(dlgPublicar(page).getByRole('heading', { level: 2 })).toHaveText('Publicar para o cidadão?');
  await expect(dlgPublicar(page)).toContainText('passam a ser usadas pelo chatbot');
  await botao(page, 'Voltar').click();
  await expect(botao(page, 'Publicar')).toBeFocused();
  expect(posts(enviados, '/publicacao')).toHaveLength(0);
  await botao(page, 'Publicar').click();
  await botao(page, 'Confirmar publicação').click();
  await expect(status(page)).toContainText('Versão publicada.');
  await expect(page.locator('#titulo-publicacao')).toBeFocused();
  expect(posts(enviados, '/publicacao')).toHaveLength(1);
  expect(JSON.parse(posts(enviados, '/publicacao')[0].texto)).toEqual({ revisao: expect.any(String) });
  // publicado: estado e data, só "Criar nova versão para editar"; nenhuma ação incompatível
  await expect(page.locator('#publicacao-estado')).toContainText(/Publicado\. Esta versão \(1\) já está disponível ao cidadão/);
  await expect(page.locator('#publicacao-estado')).toContainText(/Publicado em \d{2}\/\d{2}\/\d{4}/);
  await expect(page.locator('#situacao-publicacao')).toHaveText('Publicado');
  await expect(botao(page, 'Criar nova versão para editar')).toBeVisible();
  for (const nome of [/^Editar/, /^Aceitar/, /^Excluir/, /^Reabrir/, /^Marcar como revisado/, /^Concluir revisão$/, /^Autorizar publicação$/, /^Publicar$/, /^Incluir informação$/, /^Importar/]) await expect(page.getByRole('button', { name: nome })).toHaveCount(0);
  expect(await page.locator('body').innerText()).not.toMatch(TECNICO);
  // o painel de /admin/ também mostra o estado
  await encerrarSessao(page);
  await page.goto('/admin/');
  await escolherMaria(page);
  await page.getByRole('button', { name: ENTRAR }).click();
  await page.locator('#busca-servico').fill(d.nome);
  await page.getByRole('button', { name: new RegExp(d.nome) }).first().click();
  await expect(page.locator('#painel-resumo')).toContainText('Publicado.');
  await expect(page.locator('#painel-resumo')).toContainText('já está disponível ao cidadão');
  await expect(page.getByRole('button', { name: 'Criar nova versão para editar' })).toBeVisible();
  await expect(page.locator('#grupo-adicionar')).toBeHidden();
  expect(await page.locator('body').innerText()).not.toMatch(TECNICO);
  // nova versão a partir da publicada
  await page.getByRole('button', { name: 'Criar nova versão para editar' }).click();
  await expect(status(page)).toContainText('Nova versão criada.');
});

test('2. clique duplo: botão desabilitado e aria-busy durante o envio e uma única requisição', async ({ page }) => {
  const enviados = observarPosts(page);
  await prepararConcluido(page, 'Serviço Pub Beta');
  // só atrasa a resposta real (continue); não altera pedido nem resposta
  await page.route('**/__admin/servicos/*/autorizacao', async (rota) => {
    await new Promise((resolver) => setTimeout(resolver, 700));
    await rota.continue();
  });
  await botao(page, 'Autorizar publicação').click();
  const confirmar = botao(page, 'Confirmar autorização');
  await confirmar.dblclick();
  await expect(confirmar).toBeDisabled();
  await expect(confirmar).toHaveAttribute('aria-busy', 'true');
  await expect(dlgAutorizar(page)).toHaveAttribute('aria-busy', 'true');
  await expect(status(page)).toContainText('Publicação autorizada.');
  expect(posts(enviados, '/autorizacao')).toHaveLength(1);
  await page.unroute('**/__admin/servicos/*/autorizacao');
  await botao(page, 'Publicar').click();
  await botao(page, 'Confirmar publicação').dblclick();
  await expect(status(page)).toContainText('Versão publicada.');
  expect(posts(enviados, '/publicacao')).toHaveLength(1);
});

test('3. outra aba muda a etapa: mensagem em linguagem comum, dados recarregados e nada é repetido', async ({ page, context }) => {
  const enviados = observarPosts(page);
  await prepararConcluido(page, 'Serviço Pub Gama');
  const outra = await context.newPage();
  await outra.goto(page.url());
  await expect(outra.locator('#cartao-publicacao')).toBeVisible();
  await outra.getByRole('button', { name: 'Autorizar publicação', exact: true }).click();
  await outra.getByRole('button', { name: 'Confirmar autorização', exact: true }).click();
  await expect(outra.locator('#status')).toContainText('Publicação autorizada.');
  await outra.close();
  // a primeira aba ainda mostra "Autorizar publicação"
  await botao(page, 'Autorizar publicação').click();
  await botao(page, 'Confirmar autorização').click();
  await expect(status(page)).toContainText('Esta versão não está mais na etapa de autorizar. Os dados foram atualizados.');
  await expect(status(page)).toHaveAttribute('data-tipo', 'erro');
  await expect(status(page)).toBeFocused();
  await expect(dlgAutorizar(page)).toBeHidden();
  await expect(botao(page, 'Publicar')).toBeVisible();
  await expect(botao(page, 'Autorizar publicação')).toHaveCount(0);
  expect(posts(enviados, '/autorizacao')).toHaveLength(1);
  expect(await page.locator('body').innerText()).not.toMatch(TECNICO);
});

test('4. revisão divergente e erro do servidor (respostas simuladas só aqui): mensagem comum e dados recarregados', async ({ page }) => {
  await prepararConcluido(page, 'Serviço Pub Delta');
  // Simulação: a base não produz esta divergência sozinha com a versão congelada.
  await page.route('**/__admin/servicos/*/autorizacao', (rota) => rota.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ erro: 'revisao_divergente' }) }));
  await botao(page, 'Autorizar publicação').click();
  await botao(page, 'Confirmar autorização').click();
  await expect(status(page)).toContainText('O conteúdo mudou. Os dados foram atualizados; confira e tente de novo.');
  await expect(status(page)).toBeFocused();
  await expect(botao(page, 'Autorizar publicação')).toBeVisible();
  await page.unroute('**/__admin/servicos/*/autorizacao');
  await page.route('**/__admin/servicos/*/autorizacao', (rota) => rota.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ erro: 'falha' }) }));
  await botao(page, 'Autorizar publicação').click();
  await botao(page, 'Confirmar autorização').click();
  await expect(status(page)).toContainText('O servidor local não conseguiu autorizar. Nada foi alterado; tente de novo.');
  await expect(botao(page, 'Autorizar publicação')).toBeEnabled();
  expect(await page.locator('body').innerText()).not.toMatch(TECNICO);
});

test('5. teclado: Enter abre, Esc fecha e devolve o foco, Tab percorre o diálogo e Enter confirma', async ({ page }) => {
  await prepararConcluido(page, 'Serviço Pub Epsilon');
  const autorizar = botao(page, 'Autorizar publicação');
  await autorizar.focus();
  await page.keyboard.press('Enter');
  await expect(dlgAutorizar(page)).toBeVisible();
  await expect(botao(page, 'Voltar')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dlgAutorizar(page)).toBeHidden();
  await expect(autorizar).toBeFocused();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Tab');
  await expect(botao(page, 'Confirmar autorização')).toBeFocused();
  expect(await page.evaluate(() => { const c = getComputedStyle(document.activeElement); return c.outlineStyle !== 'none' && parseFloat(c.outlineWidth) > 0; })).toBe(true);
  await page.keyboard.press('Enter');
  await expect(status(page)).toContainText('Publicação autorizada.');
  await expect(page.locator('#titulo-publicacao')).toBeFocused();
  await botao(page, 'Publicar').focus();
  await page.keyboard.press('Enter');
  await expect(dlgPublicar(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(botao(page, 'Publicar')).toBeFocused();
});

test('6. a tela não rola ao topo depois de autorizar e nada acontece ao abrir a página', async ({ page }) => {
  const enviados = observarPosts(page);
  await prepararConcluido(page, 'Serviço Pub Zeta');
  const antes = await page.evaluate(() => window.scrollY);
  await botao(page, 'Autorizar publicação').click();
  await botao(page, 'Confirmar autorização').click();
  await expect(status(page)).toContainText('Publicação autorizada.');
  const depois = await page.evaluate(() => window.scrollY);
  expect(depois).toBeGreaterThanOrEqual(Math.min(antes, 1));
  // recarregar a página não grava nada
  const total = enviados.length;
  await page.reload();
  await expect(page.locator('#cartao-publicacao')).toBeVisible();
  await expect(botao(page, 'Publicar')).toBeVisible();
  expect(enviados.length).toBe(total);
});

test('7. 390 px e texto a 200%: sem rolagem horizontal, nada cortado e alvos de 44 px, inclusive nos diálogos', async ({ page }) => {
  await prepararConcluido(page, 'Serviço Pub Eta com um nome bem comprido para testar a quebra de linha em tela pequena');
  await page.setViewportSize({ width: 390, height: 844 });
  const conferir = async (onde) => {
    const r = await page.evaluate(() => {
      const largura = document.documentElement.clientWidth;
      const visivel = (e) => { const b = e.getBoundingClientRect(); const cs = getComputedStyle(e); return b.width > 0 && b.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none'; };
      const fora = []; const cortados = []; const pequenos = [];
      for (const e of document.querySelectorAll('body *')) if (visivel(e)) { const b = e.getBoundingClientRect(); if (b.right > largura + 0.5 || b.left < -0.5) fora.push(`${e.tagName}#${e.id}`); }
      for (const e of document.querySelectorAll('.cartao, h1, h2, h3, button, a.botao, label, legend, p, li, dd, dt')) if (visivel(e) && e.scrollWidth > e.clientWidth + 1) cortados.push(`${e.tagName}#${e.id}.${e.className}`);
      for (const e of document.querySelectorAll('button, a.botao')) if (visivel(e) && e.getBoundingClientRect().height < 43.5) pequenos.push(`${e.tagName}#${e.id}`);
      return { sw: document.documentElement.scrollWidth, cw: largura, fora: fora.slice(0, 5), cortados: cortados.slice(0, 5), pequenos: pequenos.slice(0, 5) };
    });
    expect(r.sw, `${onde}: rolagem horizontal`).toBeLessThanOrEqual(r.cw);
    expect(r.fora, `${onde}: fora da tela`).toEqual([]);
    expect(r.cortados, `${onde}: texto cortado`).toEqual([]);
    expect(r.pequenos, `${onde}: alvos pequenos`).toEqual([]);
  };
  for (const escala of ['100%', '200%']) {
    if (escala !== '100%') await page.addStyleTag({ content: `html{font-size:${escala} !important}` });
    await conferir(`cartão a ${escala}`);
    await botao(page, 'Autorizar publicação').click();
    await expect(dlgAutorizar(page)).toBeVisible();
    await conferir(`diálogo de autorização a ${escala}`);
    await page.keyboard.press('Escape');
    await expect(dlgAutorizar(page)).toBeHidden();
  }
  await botao(page, 'Autorizar publicação').click();
  await botao(page, 'Confirmar autorização').click();
  await expect(status(page)).toContainText('Publicação autorizada.');
  await botao(page, 'Publicar').click();
  await expect(dlgPublicar(page)).toBeVisible();
  await conferir('diálogo de publicação a 200%');
});
