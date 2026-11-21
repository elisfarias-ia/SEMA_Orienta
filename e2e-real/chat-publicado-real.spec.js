// Teste real do chat com conteúdo publicado: dados FICTÍCIOS criados pelas rotas/telas reais na CÓPIA da base (a LAC é o serviço que o
// chat atende), publicados na cópia e perguntados no chat. A cópia volta a ser idêntica à base real ao final; a base real nunca é tocada.
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
const URL_LINK = 'https://exemplo.test/portal-tobiluz';
const TEXTO_1 = 'Informação fictícia da orientação de demonstração sobre flurbo.';
const TEXTO_2 = 'Informação fictícia do link de demonstração sobre tobiluz.';
const NOME_LAC = 'Licença por Adesão e Compromisso';
const botao = (page, nome) => page.getByRole('button', { name: nome, exact: true });
const status = (page) => page.locator('#status');

test.afterAll(() => {
  const copia = path.join(process.env.SEMA_REAL_COPIA, 'services');
  fs.rmSync(copia, { recursive: true, force: true });
  fs.cpSync(path.join(RAIZ, 'services'), copia, { recursive: true });
});

async function incluirInformacao(page, tema, texto, fonte) {
  await botao(page, 'Incluir informação').click();
  await page.getByLabel('Tema da informação', { exact: true }).fill(tema);
  await page.getByLabel('O que o chatbot deve informar ao cidadão?').fill(texto);
  await page.getByRole('checkbox', { name: new RegExp(`^${fonte}`) }).check();
  await page.getByLabel(new RegExp(`Onde esta informação aparece na fonte\\? \\(${fonte}\\)`)).fill('Seção 1');
  await page.locator('#bloco-enviar').click();
  await botao(page, 'Confirmar e salvar').click();
  await expect(status(page)).toContainText('Informação salva.');
}

async function perguntar(page, pergunta, esperadas) {
  await page.goto('/');
  const campo = page.getByLabel('Escreva sua dúvida');
  await campo.fill(pergunta);
  await campo.press('Enter');
  await expect(page.locator('#mensagens article')).toHaveCount(3);
  return page.locator('.message--assistente').last();
}

test('o chat responde só com a informação publicada pertinente; texto sem fonte e link só com a própria URL', async ({ page }) => {
  await encerrarSessao(page);
  await page.goto('/admin/');
  await escolherMaria(page);
  await page.getByRole('button', { name: 'Acessar administração' }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'Serviços' })).toBeVisible();
  await page.locator('#busca-servico').fill(NOME_LAC);
  await page.getByRole('button', { name: new RegExp(NOME_LAC) }).first().click();
  await expect(page.getByRole('heading', { level: 2, name: NOME_LAC })).toBeVisible();
  await botao(page, 'Link').click();
  await page.locator('#link-titulo').fill('Portal Tobiluz');
  await page.locator('#link-url').fill(URL_LINK);
  await page.locator('#link-orgao').fill('Órgão de Teste');
  await page.locator('#link-descricao').fill('Página fictícia.');
  await botao(page, 'Incluir link').click();
  await expect(status(page)).toContainText('Link adicionado');
  await botao(page, 'Texto').click();
  await page.locator('#texto-titulo').fill('Texto Flurbo');
  await page.locator('#texto-texto').fill('Texto interno fictício sobre flurbo, que não deve aparecer no chat.');
  await botao(page, 'Incluir texto').click();
  await expect(status(page)).toContainText('Texto adicionado');
  await page.getByRole('link', { name: 'Revisar informações' }).click();
  await expect(page.locator('#blocos')).toHaveAttribute('aria-busy', 'false');
  await incluirInformacao(page, 'Informação da orientação', TEXTO_1, 'Texto Flurbo');
  await incluirInformacao(page, 'Informação do link', TEXTO_2, 'Portal Tobiluz');
  await page.locator('#aba-fontes').click();
  for (const fonte of ['Texto Flurbo', 'Portal Tobiluz']) {
    const revisar = botao(page, `Marcar como revisado: ${fonte}`);
    if (await revisar.count()) { await revisar.click(); await expect(status(page)).toContainText('marcado como revisado'); }
  }
  await page.locator('#aba-informacoes').click();
  for (const tema of ['Informação da orientação', 'Informação do link']) {
    await botao(page, `Aceitar informação: ${tema}`).click();
    await expect(status(page)).toContainText('Informação aceita.');
  }
  await botao(page, 'Concluir revisão').click();
  await botao(page, 'Confirmar conclusão').click();
  await expect(status(page)).toContainText('Revisão concluída.');
  await botao(page, 'Autorizar publicação').click();
  await botao(page, 'Confirmar autorização').click();
  await expect(status(page)).toContainText('Publicação autorizada.');
  await botao(page, 'Publicar').click();
  await botao(page, 'Confirmar publicação').click();
  await expect(status(page)).toContainText('Versão publicada.');

  // pergunta com termo distintivo do texto cadastrado: só ele, sem fonte
  const r1 = await perguntar(page, 'O que diz a orientação fictícia de demonstração sobre flurbo?');
  await expect(r1).toContainText(TEXTO_1);
  await expect(r1).not.toContainText(TEXTO_2);
  await expect(r1).not.toContainText('Texto interno fictício');
  await expect(r1.locator('a')).toHaveCount(0);
  // pergunta com termo distintivo do link: só ele, com a própria URL
  const r2 = await perguntar(page, 'O que diz o link fictício de demonstração sobre tobiluz?');
  await expect(r2).toContainText(TEXTO_2);
  await expect(r2).not.toContainText(TEXTO_1);
  await expect(r2.locator('a')).toHaveCount(1);
  await expect(r2.locator('a')).toHaveAttribute('href', URL_LINK);
  // só palavras genéricas compartilhadas: nenhuma das duas
  const r3 = await perguntar(page, 'O que diz a informação fictícia de demonstração sobre isso?');
  await expect(r3).not.toContainText(TEXTO_1);
  await expect(r3).not.toContainText(TEXTO_2);
  await expect(r3.locator('a')).toHaveCount(0);
});
