// Teste real da área administrativa: sem page.route e sem mocks. O servidor é o Vite de verdade (veja preparar.js), com a base
// de serviços copiada para uma pasta temporária. Os testes seguem em ordem e compartilham o estado dessa cópia.
import fs from 'node:fs';
import path from 'node:path';
import { test, expect } from '@playwright/test';

const TERMO_UNICO = 'zumbalafrutaunica';
const ENTRAR = 'Acessar administração';
const URL_A = 'https://exemplo.test/pagina-alfa';

test.describe.configure({ mode: 'serial' });

async function entrar(page) {
  await page.goto('/admin/');
  await page.getByRole('button', { name: ENTRAR }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'Serviços' })).toBeVisible();
}
const botao = (page, nome) => page.getByRole('button', { name: nome, exact: true });
const semRolagem = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
const status = (page) => page.locator('#status');

async function criarServico(page, nome, tema) {
  await botao(page, 'Novo serviço').click();
  await page.locator('#novo-nome').fill(nome);
  await page.locator('#novo-tema').fill(tema);
  await botao(page, 'Criar serviço').click();
  await expect(page.getByRole('heading', { level: 2, name: nome })).toBeVisible();
}
async function abrirServicoPelaLista(page, nome) {
  await page.locator('#busca-servico').fill(nome);
  await page.getByRole('button', { name: new RegExp(nome) }).first().click();
  await expect(page.getByRole('heading', { level: 2, name: nome })).toBeVisible();
}
async function preencherLink(page, { titulo, url, descricao = 'Página com as orientações.' }) {
  await botao(page, 'Link').click();
  await page.locator('#link-titulo').fill(titulo);
  await page.locator('#link-url').fill(url);
  await page.locator('#link-orgao').fill('Órgão de Teste');
  await page.locator('#link-descricao').fill(descricao);
}

test('1. entrar e sair da demonstração: abrir não envia nada além de leitura e sair exige nova entrada', async ({ page }) => {
  const metodos = [];
  page.on('request', (r) => { if (r.url().includes('/__admin/')) metodos.push(`${r.method()} ${new URL(r.url()).pathname}`); });
  await page.goto('/admin/');
  await expect(page.getByRole('heading', { level: 2, name: 'Área administrativa' })).toBeVisible();
  expect(metodos, 'nada é pedido ao abrir').toEqual([]);
  await page.getByRole('button', { name: ENTRAR }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'Serviços' })).toBeVisible();
  await expect(page.getByText('Administração', { exact: true })).toBeVisible();
  expect(await page.locator('body').innerText()).not.toMatch(/demonstra|sem autenticação/i);
  await expect(page.getByRole('link', { name: 'Saúde do sistema' })).toHaveAttribute('href', './saude/');
  expect(metodos).toEqual(['GET /__admin/sessao', 'GET /__admin/catalogo']);
  await botao(page, 'Sair').click();
  await expect(page.getByRole('button', { name: ENTRAR })).toBeFocused();
  await expect(page.getByRole('heading', { level: 2, name: 'Serviços' })).toBeHidden();
  await expect(status(page)).toContainText('saiu');
});

test('2. serviço novo com tema novo e um texto', async ({ page }) => {
  await entrar(page);
  await criarServico(page, 'Serviço de Teste Alfa', 'Tema Inédito');
  await expect(status(page)).toContainText('criado');
  await expect(page.locator('#titulo-servico')).toBeFocused();
  await expect(page.locator('#servico-tema')).toHaveText('Tema: Tema Inédito');
  await expect(page.locator('#informacoes-resumo')).toContainText('Nenhuma informação ainda');
  await botao(page, 'Texto').click();
  await expect(page.getByRole('note').filter({ hasText: 'Não escreva dados pessoais' })).toBeVisible();
  await page.locator('#texto-titulo').fill('Prazos de análise');
  await page.locator('#texto-texto').fill(`Informação de teste com o termo ${TERMO_UNICO} para conferência.`);
  await botao(page, 'Adicionar texto').click();
  await expect(status(page)).toContainText('Texto adicionado');
  await expect(page.locator('#informacoes-lista')).toContainText('Prazos de análise');
  await expect(page.locator('#informacoes-lista')).toContainText(TERMO_UNICO);
  await expect(page.locator('#titulo-informacoes')).toBeFocused();
  // A gravação foi feita na cópia temporária.
  const copia = process.env.SEMA_REAL_COPIA;
  const achou = (dir) => fs.readdirSync(dir, { withFileTypes: true }).some((e) => (e.isDirectory() ? achou(path.join(dir, e.name)) : fs.readFileSync(path.join(dir, e.name), 'utf8').includes(TERMO_UNICO)));
  expect(achou(path.join(copia, 'services'))).toBe(true);
});

test('3. serviço novo reaproveitando o tema existente (sem diferença de maiúscula) e um link novo', async ({ page }) => {
  await entrar(page);
  await botao(page, 'Novo serviço').click();
  await expect(page.locator('#temas-lista option[value="Tema Inédito"]')).toHaveCount(1);
  await page.locator('#novo-nome').fill('Serviço de Teste Beta');
  await page.locator('#novo-tema').fill('tema inedito');
  await botao(page, 'Criar serviço').click();
  await expect(page.getByRole('heading', { level: 2, name: 'Serviço de Teste Beta' })).toBeVisible();
  await expect(page.locator('#servico-tema')).toHaveText('Tema: Tema Inédito');
  await preencherLink(page, { titulo: 'Portal Beta', url: 'https://exemplo.test/pagina-beta' });
  await page.locator('#link-oficial').check();
  await botao(page, 'Adicionar link').click();
  await expect(status(page)).toContainText('Link adicionado');
  await expect(page.locator('#informacoes-lista')).toContainText('Portal Beta');
  await expect(page.locator('#informacoes-lista a')).toHaveAttribute('href', 'https://exemplo.test/pagina-beta');
});

test('4. serviço existente (achado pela pesquisa) com um link novo', async ({ page }) => {
  await entrar(page);
  await page.locator('#busca-servico').fill('alfa');
  await expect(page.locator('#lista-resumo')).toHaveText('1 serviço.');
  await abrirServicoPelaLista(page, 'Serviço de Teste Alfa');
  await expect(page.locator('#informacoes-lista')).toContainText('Prazos de análise');
  await preencherLink(page, { titulo: 'Portal Alfa', url: URL_A });
  await botao(page, 'Adicionar link').click();
  await expect(status(page)).toContainText('Link adicionado');
  await expect(page.locator('#informacoes-lista li')).toHaveCount(2);
  // pesquisa sem resultado
  await botao(page, 'Voltar para os serviços').click();
  await page.locator('#busca-servico').fill('nada-parecido-xyz');
  await expect(page.locator('#lista-resumo')).toContainText('Nenhum serviço encontrado');
});

test('5. serviço existente usando um link já cadastrado em outro serviço', async ({ page }) => {
  await entrar(page);
  await abrirServicoPelaLista(page, 'Serviço de Teste Beta');
  await botao(page, 'Link').click();
  await expect(page.locator('#existente-lista li').first()).toBeVisible();
  await page.locator('#existente-consulta').fill('manual');
  await botao(page, 'Pesquisar').click();
  await expect(page.locator('#existente-resumo')).toContainText(/encontrados?\./);
  await expect(page.locator('#existente-lista li').first()).toContainText(/manual/i);
  const usar = page.locator('#existente-lista').getByRole('button', { name: /^Usar este link/ }).first();
  await expect(usar).toBeEnabled();
  const nome = (await usar.getAttribute('aria-label')).replace(/^Usar este link: /, '');
  await usar.click();
  await expect(status(page)).toContainText('nova revisão');
  await expect(page.locator('#informacoes-lista')).toContainText(nome);
  await expect(page.locator('#informacoes-lista')).toContainText('Link copiado de outro serviço');
  // Repetir: o mesmo link já aparece como "já neste serviço" e desabilitado.
  await botao(page, 'Link').click();
  await page.locator('#existente-consulta').fill(nome);
  await botao(page, 'Pesquisar').click();
  await expect(page.locator('#existente-lista li').first()).toContainText(nome);
  await expect(page.locator('#existente-lista').getByRole('button', { name: /^Já neste serviço/ }).first()).toBeDisabled();
  // Nada de identificadores na tela.
  expect(await page.locator('body').innerText()).not.toMatch(/[0-9a-f]{64}|\bv1\b|X-Admin-Token/i);
});

test('6. validação junto ao campo e erro devolvido pelo servidor', async ({ page }) => {
  const posts = [];
  page.on('request', (r) => { if (r.method() === 'POST') posts.push(new URL(r.url()).pathname); });
  await entrar(page);
  await abrirServicoPelaLista(page, 'Serviço de Teste Beta');
  // Campos vazios: erros ao lado dos campos e nenhum envio.
  await botao(page, 'Texto').click();
  await botao(page, 'Adicionar texto').click();
  await expect(page.locator('#texto-titulo-erro')).toBeVisible();
  await expect(page.locator('#texto-texto-erro')).toContainText('Escreva o texto');
  await expect(page.locator('#texto-titulo')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('#texto-titulo')).toBeFocused();
  // Texto com senha: recusado antes do envio, junto do campo.
  await page.locator('#texto-titulo').fill('Acesso');
  await page.locator('#texto-texto').fill('Use a senha: 12345 para entrar.');
  await botao(page, 'Adicionar texto').click();
  await expect(page.locator('#texto-texto-erro')).toContainText('senha');
  await expect(page.locator('#texto-texto')).toBeFocused();
  expect(posts.filter((p) => p.includes('entradas-texto'))).toEqual([]);
  await page.locator('#texto-texto').fill('Texto sem problemas.');
  await expect(page.locator('#texto-texto-erro')).toBeHidden();
  await botao(page, 'Cancelar').click();
  await expect(botao(page, 'Texto')).toBeFocused();
  // URL repetida: o servidor recusa (409) e o erro aparece no campo.
  await botao(page, 'Voltar para os serviços').click();
  await abrirServicoPelaLista(page, 'Serviço de Teste Alfa');
  await preencherLink(page, { titulo: 'Portal Alfa de novo', url: URL_A });
  await botao(page, 'Adicionar link').click();
  await expect(page.locator('#link-url-erro')).toContainText('já está cadastrado');
  await expect(page.locator('#link-url')).toBeFocused();
  await expect(status(page)).toContainText(/Já existe|já está|Revise/);
  expect(posts.filter((p) => p.endsWith('/links')).length).toBe(1);
  await page.locator('#link-url').fill('http://inseguro.test');
  await botao(page, 'Adicionar link').click();
  await expect(page.locator('#link-url-erro')).toContainText('https://');
  expect(posts.filter((p) => p.endsWith('/links')).length).toBe(1);
  // Nome de serviço repetido.
  await botao(page, 'Voltar para os serviços').click();
  await botao(page, 'Novo serviço').click();
  await page.locator('#novo-nome').fill('Serviço de Teste Alfa');
  await page.locator('#novo-tema').fill('Tema Inédito');
  await botao(page, 'Criar serviço').click();
  await expect(page.locator('#novo-nome-erro')).toContainText('Já existe um serviço com este nome');
  await expect(page.locator('#novo-nome')).toBeFocused();
});

test('7. clique duplo grava uma única vez', async ({ page }) => {
  const posts = [];
  page.on('request', (r) => { if (r.method() === 'POST' && r.url().endsWith('/entradas-texto')) posts.push(r.url()); });
  await entrar(page);
  await abrirServicoPelaLista(page, 'Serviço de Teste Beta');
  await botao(page, 'Texto').click();
  await page.locator('#texto-titulo').fill('Orientação com clique duplo');
  await page.locator('#texto-texto').fill('Texto de uma única gravação.');
  await botao(page, 'Adicionar texto').dblclick();
  await expect(status(page)).toContainText('Texto adicionado');
  await expect(page.locator('#informacoes-lista li').filter({ hasText: 'Orientação com clique duplo' })).toHaveCount(1);
  expect(posts).toHaveLength(1);
});

test('8. teclado: Tab, Enter e Espaço, foco visível e sem armadilha', async ({ page }) => {
  await page.goto('/admin/');
  const focoVisivel = () => page.evaluate(() => {
    const e = document.activeElement;
    if (!e || e === document.body) return false;
    const c = getComputedStyle(e);
    return (c.outlineStyle !== 'none' && parseFloat(c.outlineWidth) > 0) || (c.boxShadow && c.boxShadow !== 'none');
  });
  const nomeDoFoco = () => page.evaluate(() => document.activeElement?.textContent?.trim() || document.activeElement?.id || '');
  // Primeiro Tab: link de pular; segundo: o botão de entrar.
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  expect(await nomeDoFoco()).toBe(ENTRAR);
  expect(await focoVisivel()).toBe(true);
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { level: 2, name: 'Serviços' })).toBeFocused();
  // Ordem para frente até "Novo serviço" e abrir pelo Enter.
  const vistos = [];
  for (let i = 0; i < 4 && !vistos.includes('Novo serviço'); i += 1) {
    await page.keyboard.press('Tab');
    vistos.push(await nomeDoFoco());
    expect(await focoVisivel()).toBe(true);
  }
  expect(vistos).toContain('Novo serviço');
  await page.keyboard.press('Enter');
  await expect(page.locator('#novo-nome')).toBeFocused();
  await page.keyboard.type('Serviço de Teste Gama');
  await page.keyboard.press('Tab');
  await expect(page.locator('#novo-tema')).toBeFocused();
  await page.keyboard.type('Tema Inédito');
  await page.keyboard.press('Enter'); // envia o formulário
  await expect(page.getByRole('heading', { level: 2, name: 'Serviço de Teste Gama' })).toBeFocused();
  // Espaço abre e fecha o painel de texto.
  await botao(page, 'Texto').focus();
  await page.keyboard.press('Space');
  await expect(page.locator('#texto-titulo')).toBeFocused();
  await expect(botao(page, 'Texto')).toHaveAttribute('aria-expanded', 'true');
  await page.getByRole('button', { name: 'Cancelar' }).first().focus();
  await page.keyboard.press('Enter');
  await expect(botao(page, 'Texto')).toBeFocused();
  await expect(botao(page, 'Texto')).toHaveAttribute('aria-expanded', 'false');
  // Sem armadilha: Shift+Tab chega ao botão "Sair" e o foco circula sem ficar preso.
  const alcancados = new Set();
  for (let i = 0; i < 40; i += 1) {
    await page.keyboard.press('Shift+Tab');
    alcancados.add(await nomeDoFoco());
  }
  expect(alcancados.has('Sair')).toBe(true);
  expect(alcancados.has('Saúde do sistema')).toBe(true);
});

test('9. 390 px: sem rolagem horizontal e alvos de toque de pelo menos 44 px', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const alvosPequenos = () => page.evaluate(() => {
    const pequenos = [];
    const visivel = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden'; };
    for (const e of document.querySelectorAll('button, a.navegacao__link, select, input:not([type=checkbox]), textarea')) {
      if (visivel(e) && e.getBoundingClientRect().height < 43.5) pequenos.push(`${e.tagName}#${e.id}:${Math.round(e.getBoundingClientRect().height)}`);
    }
    for (const l of document.querySelectorAll('label[for="link-oficial"]')) if (visivel(l) && l.getBoundingClientRect().height < 43.5) pequenos.push('label-oficial');
    return pequenos;
  });
  await page.goto('/admin/');
  expect(await semRolagem(page)).toBe(true);
  expect(await alvosPequenos()).toEqual([]);
  await page.getByRole('button', { name: ENTRAR }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'Serviços' })).toBeVisible();
  expect(await semRolagem(page)).toBe(true);
  expect(await alvosPequenos()).toEqual([]);
  await botao(page, 'Novo serviço').click();
  expect(await semRolagem(page)).toBe(true);
  expect(await alvosPequenos()).toEqual([]);
  await botao(page, 'Cancelar').click();
  await abrirServicoPelaLista(page, 'Serviço de Teste Beta');
  for (const maneira of ['Texto', 'Link']) {
    await botao(page, maneira).click();
    await expect(page.locator('.painel:not([hidden])')).toHaveCount(1);
    expect(await semRolagem(page), maneira).toBe(true);
    expect(await alvosPequenos(), maneira).toEqual([]);
  }
  await expect(page.locator('#informacoes-lista li').first()).toBeVisible();
});

test('10. recarregar exige nova entrada', async ({ page }) => {
  await entrar(page);
  await page.reload();
  await expect(page.getByRole('button', { name: ENTRAR })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: 'Serviços' })).toBeHidden();
});

test('11. o chat público não devolve o conteúdo cadastrado na administração', async ({ page }) => {
  await page.goto('/');
  const campo = page.getByLabel('Escreva sua dúvida');
  await campo.fill(`Fale sobre ${TERMO_UNICO} e os prazos de análise.`);
  await campo.press('Enter');
  await expect(page.locator('#mensagens article')).toHaveCount(3);
  const resposta = page.locator('.message--assistente').last();
  await expect(resposta).not.toContainText(TERMO_UNICO);
  await expect(resposta).not.toContainText('Texto de uma única gravação');
  expect((await resposta.textContent()).length).toBeGreaterThan(20);
  const html = await page.content();
  expect(html).not.toContain('__admin');
});
