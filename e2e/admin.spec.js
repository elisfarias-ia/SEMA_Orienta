import { test, expect, semRolagemHorizontal } from './base.js';

const IDS_TECNICOS = /\blac-v1\b|licenciamento-ambiental|\bv1\b|hashConteudo|[0-9a-f]{64}|X-Admin-Token/i;

test.describe('Administração local (somente leitura)', () => {
  test('/admin/ abre no estado de demonstração, sem ids técnicos nem rolagem horizontal', async ({ page }) => {
    await page.goto('/admin/');
    await expect(page.getByRole('heading', { level: 2, name: 'Área administrativa — ambiente local de demonstração' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Entrar como servidor de demonstração' })).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Sair' })).toBeHidden();
    await expect(page.getByRole('heading', { name: 'Serviços' })).toBeHidden();
    expect(await page.locator('body').innerText()).not.toMatch(IDS_TECNICOS);
    expect(await semRolagemHorizontal(page)).toBe(true);
  });

  test('entrar mostra a gestão (só leitura), o aviso e o link de saúde; sair volta ao início', async ({ page }) => {
    await page.goto('/admin/');
    await page.getByRole('button', { name: 'Entrar como servidor de demonstração' }).click();
    await expect(page.getByRole('heading', { level: 2, name: 'Serviços' })).toBeVisible();
    await expect(page.getByText('Servidor de demonstração', { exact: true })).toBeVisible();
    await expect(page.getByRole('note').first()).toContainText('não é autenticação real');
    await expect(page.getByRole('link', { name: 'Saúde do sistema' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Novo serviço' })).toBeVisible();
    expect(await page.locator('body').innerText()).not.toMatch(IDS_TECNICOS);
    expect(await semRolagemHorizontal(page)).toBe(true);
    await page.getByRole('button', { name: 'Sair' }).click();
    await expect(page.getByRole('button', { name: 'Entrar como servidor de demonstração' })).toBeFocused();
    await expect(page.getByRole('heading', { level: 2, name: 'Serviços' })).toBeHidden();
  });

  test('recarregar exige uma nova entrada', async ({ page }) => {
    await page.goto('/admin/');
    await page.getByRole('button', { name: 'Entrar como servidor de demonstração' }).click();
    await expect(page.getByRole('heading', { level: 2, name: 'Serviços' })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('button', { name: 'Entrar como servidor de demonstração' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'Serviços' })).toBeHidden();
  });

  test('/admin/saude/ abre pelo link e volta', async ({ page }) => {
    await page.goto('/admin/saude/');
    await expect(page.getByRole('heading', { level: 1, name: /Saúde do sistema/ })).toBeVisible();
    await page.getByRole('link', { name: 'Voltar para Gestão de conteúdo' }).click();
    await expect(page).toHaveURL(/\/admin\/$/);
  });

  test('/admin e /admin/saude redirecionam para a barra final', async ({ page }) => {
    await page.goto('/admin');
    await expect(page).toHaveURL(/\/admin\/$/);
    await page.goto('/admin/saude');
    await expect(page).toHaveURL(/\/admin\/saude\/$/);
  });
});
