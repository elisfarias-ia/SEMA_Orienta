import { test, expect, semRolagemHorizontal, focoVisivel } from './base.js';

const VAZAMENTOS = /[A-Za-z]:\\|\/Users\/|SEMA_Orienta|node_modules|X-Admin-Token|\bat \S+ \(|stack|ENOENT|EACCES|TypeError|undefined|\[object/i;

test.describe('Saúde do sistema', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/admin/saude/');
    await expect(page.locator('#saude-lista li')).toHaveCount(9);
  });

  test('carrega os estados e conta os não implementados à parte', async ({ page }) => {
    await expect(page.locator('#saude-resumo')).toHaveText(
      'Operacionais: 6. Degradados: 0. Indisponíveis: 0. Não verificados: 0. Não implementados: 3.',
    );
    await expect(page.locator('#saude-lista li[data-estado="operacional"]')).toHaveCount(6);
    const naoImplementados = page.locator('#saude-lista li', { hasText: 'Capacidade: Não implementado' });
    await expect(naoImplementados).toHaveCount(3);
    for (const nome of ['Processamento de fontes', 'Banco de dados', 'IA externa']) {
      await expect(naoImplementados.filter({ hasText: nome })).toHaveCount(1);
    }
    await expect(naoImplementados.first()).toContainText('Isso não é uma falha');
    await expect(page.locator('#saude-quando')).toContainText(/Última verificação: \d{2}-\d{2}-\d{4} \d{2}:\d{2}:\d{2}\./);
  });

  test('não mostra MCP, caminhos, tokens nem erros internos', async ({ page }) => {
    const texto = await page.locator('body').innerText();
    expect(texto).not.toMatch(/\bMCP\b/i);
    expect(texto).not.toMatch(VAZAMENTOS);
  });

  test('"Verificar novamente" atualiza sem duplicar componentes', async ({ page }) => {
    const antes = await page.locator('#saude-quando').textContent();
    const nomes = await page.locator('#saude-lista .saude__nome').allTextContents();
    await page.waitForTimeout(1100);
    await page.getByRole('button', { name: 'Verificar novamente' }).click();
    await expect(page.locator('#saude-quando')).not.toHaveText(antes);
    await expect(page.locator('#saude-lista li')).toHaveCount(9);
    expect(await page.locator('#saude-lista .saude__nome').allTextContents()).toEqual(nomes);
    expect(new Set(nomes).size).toBe(nomes.length);
    await expect(page.getByRole('button', { name: 'Verificar novamente' })).toBeEnabled();
  });

  test('funciona em 390 px sem rolagem horizontal', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();
    await expect(page.locator('#saude-lista li')).toHaveCount(9);
    expect(await semRolagemHorizontal(page)).toBe(true);
  });

  test('a navegação por Tab tem foco visível', async ({ page }) => {
    const alvos = [];
    for (let i = 0; i < 5; i += 1) {
      await page.keyboard.press('Tab');
      const nome = await page.evaluate(() => document.activeElement?.textContent?.trim().slice(0, 40));
      alvos.push(nome);
      await expect.poll(() => focoVisivel(page), { message: `foco visível em "${nome}"` }).toBeTruthy();
    }
    // A página tem exatamente cinco elementos focáveis, nesta ordem; o sexto Tab sairia da página.
    expect(alvos).toEqual(['Ir para o conteúdo', 'Gestão de conteúdo', 'Saúde do sistema', 'Verificar novamente', 'Voltar para Gestão de conteúdo']);
  });
});
