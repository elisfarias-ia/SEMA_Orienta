import { test, expect, semRolagemHorizontal } from './base.js';

const IDS_TECNICOS = /\blac-v1\b|licenciamento-ambiental|\bv1\b|hashConteudo|[0-9a-f]{64}|X-Admin-Token/i;

test.describe('Administração local (somente leitura)', () => {
  test('/admin/ carrega catálogo e sessão, sem ids técnicos', async ({ page }) => {
    await page.goto('/admin/');
    await expect(page.getByRole('heading', { level: 1, name: /Assuntos, serviços e fontes/ })).toBeVisible();
    await expect(page.getByRole('note')).toContainText('sem autenticação');
    await expect(page.locator('#catalogo')).toHaveAttribute('aria-busy', 'false');
    await expect(page.locator('#catalogo')).toContainText('LAC');
    await expect(page.locator('#assunto-enviar')).toBeEnabled();
    const texto = await page.locator('body').innerText();
    expect(texto).not.toMatch(IDS_TECNICOS);
    expect(await semRolagemHorizontal(page)).toBe(true);
  });

  test('a navegação abre /admin/saude/ e volta', async ({ page }) => {
    await page.goto('/admin/');
    await page.getByRole('navigation', { name: 'Seções da administração' }).getByRole('link', { name: 'Saúde do sistema' }).click();
    await expect(page).toHaveURL(/\/admin\/saude\/$/);
    await expect(page.getByRole('heading', { level: 1, name: /Saúde do sistema/ })).toBeVisible();
    await page.getByRole('link', { name: 'Voltar para Cadastro da base' }).click();
    await expect(page).toHaveURL(/\/admin\/$/);
  });

  test('/admin e /admin/saude redirecionam para a barra final', async ({ page }) => {
    await page.goto('/admin');
    await expect(page).toHaveURL(/\/admin\/$/);
    await page.goto('/admin/saude');
    await expect(page).toHaveURL(/\/admin\/saude\/$/);
  });
});
