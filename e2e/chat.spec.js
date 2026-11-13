import { test, expect } from './base.js';

test.describe('Chat público', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('a página e o campo de mensagem carregam', async ({ page }) => {
    await expect(page.getByRole('heading', { level: 1, name: 'SEMA Orienta' })).toBeVisible();
    await expect(page.getByLabel('Escreva sua dúvida')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Enviar' })).toBeVisible();
    await expect(page.locator('#mensagens article')).toHaveCount(1);
  });

  test('Enter envia e Shift+Enter não envia', async ({ page }) => {
    const campo = page.getByLabel('Escreva sua dúvida');
    await campo.fill('primeira linha');
    await campo.press('Shift+Enter');
    await expect(page.locator('#mensagens article')).toHaveCount(1);
    await expect(campo).toHaveValue('primeira linha\n');
    await campo.press('Enter');
    await expect(page.locator('#mensagens article')).toHaveCount(3);
    await expect(page.locator('.message--usuario')).toContainText('primeira linha');
    await expect(campo).toHaveValue('');
    await expect(campo).toBeFocused();
  });

  test('Reiniciar limpa a conversa e devolve o foco', async ({ page }) => {
    const campo = page.getByLabel('Escreva sua dúvida');
    await campo.fill('Olá');
    await campo.press('Enter');
    await expect(page.locator('#mensagens article')).toHaveCount(3);
    await campo.fill('texto não enviado');
    await page.getByRole('button', { name: 'Reiniciar conversa' }).click();
    await expect(page.locator('#mensagens article')).toHaveCount(1);
    await expect(campo).toHaveValue('');
    await expect(campo).toBeFocused();
  });

  test('pergunta sem conteúdo validado recebe resposta segura, sem valores nem links', async ({ page }) => {
    const campo = page.getByLabel('Escreva sua dúvida');
    await campo.fill('Qual o valor da taxa da LAC?');
    await campo.press('Enter');
    await expect(page.locator('#mensagens article')).toHaveCount(3);
    const resposta = page.locator('.message--assistente').last();
    await expect(resposta).not.toContainText(/R\$|\d+ dias/);
    await expect(resposta.locator('a')).toHaveCount(0);
    expect((await resposta.textContent()).length).toBeGreaterThan(20);
  });

  test('a faixa de teste local aparece no desenvolvimento', async ({ page }) => {
    // Neste ambiente (servidor de desenvolvimento) a faixa existe; a ausência no build é coberta por check-dist.
    await expect(page.locator('#faixa-teste')).toBeVisible();
    await expect(page.locator('#faixa-teste')).not.toBeEmpty();
  });
});
