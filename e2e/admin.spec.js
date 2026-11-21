import { test, expect, semRolagemHorizontal, focoVisivel } from './base.js';

const IDS_TECNICOS = /\blac-v1\b|licenciamento-ambiental|\bv1\b|hashConteudo|[0-9a-f]{64}|X-Admin-Token/i;
const SESSAO = '/__admin/sessao';
const ORIGEM_LOCAL = `http://localhost:${process.env.E2E_PORTA ?? '5173'}`;
const ENTRAR = 'Acessar administração';
const MARIA = 'Maria Silva — Cadastrante, CLABI';
const CARLOS = 'Carlos Silva — Revisor, CLABI';

// Login simulado (Passo 8B): entrar (POST) e sair (DELETE) de /__admin/sessao só mudam a sessão em memória do servidor; nada é
// gravado em disco. Só essa rota é liberada aqui; qualquer outra requisição que não seja GET continua bloqueada por base.js.
async function liberarSessao(page) {
  await page.route(`${ORIGEM_LOCAL}${SESSAO}`, (rota) => (['GET', 'POST', 'DELETE'].includes(rota.request().method()) ? rota.continue() : rota.abort()));
}

/** A sessão é única no servidor: cada teste começa sem usuário escolhido. */
async function encerrarSessao(request) {
  const corpo = await (await request.get(SESSAO)).json();
  if (typeof corpo.token === 'string') await request.delete(SESSAO, { headers: { 'X-Admin-Token': corpo.token } });
}

async function entrarComo(page, rotulo) {
  await page.getByRole('radio', { name: rotulo }).check();
  await page.getByRole('button', { name: ENTRAR }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'Serviços' })).toBeVisible();
}

test.describe('Administração local (login simulado, sem gravação em disco)', () => {
  test.beforeEach(async ({ page, request }) => {
    await encerrarSessao(request);
    await liberarSessao(page);
  });
  test.afterEach(async ({ request }) => {
    await encerrarSessao(request);
  });

  test('/admin/ abre na escolha de usuário, com o aviso, sem ids técnicos nem rolagem horizontal', async ({ page }) => {
    await page.goto('/admin/');
    await expect(page.getByRole('heading', { level: 2, name: 'Área administrativa' })).toBeVisible();
    const grupo = page.getByRole('group', { name: 'Escolha com qual usuário entrar' });
    await expect(grupo).toBeVisible();
    await expect(grupo.getByRole('radio')).toHaveCount(2);
    await expect(page.getByRole('radio', { name: MARIA })).not.toBeChecked();
    await expect(page.getByRole('radio', { name: CARLOS })).not.toBeChecked();
    await expect(page.getByText('Usuários fictícios de demonstração, sem senha.')).toBeVisible();
    await expect(page.getByRole('button', { name: ENTRAR })).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Sair' })).toBeHidden();
    await expect(page.getByRole('heading', { name: 'Serviços' })).toBeHidden();
    expect(await page.locator('body').innerText()).not.toMatch(IDS_TECNICOS);
    expect(await semRolagemHorizontal(page)).toBe(true);
  });

  test('sem escolha, "Acessar administração" mostra o erro e leva o foco ao grupo', async ({ page }) => {
    await page.goto('/admin/');
    await expect(page.getByRole('radio', { name: MARIA })).toBeVisible();
    await page.getByRole('button', { name: ENTRAR }).click();
    await expect(page.locator('#escolha-erro')).toHaveText('Escolha com qual usuário entrar.');
    await expect(page.locator('#escolha-usuario')).toBeFocused();
    await expect(page.getByRole('heading', { level: 2, name: 'Serviços' })).toBeHidden();
  });

  test('entrar como Maria mostra o nome no topo; trocar e cancelar não muda; trocar para Carlos muda', async ({ page }) => {
    await page.goto('/admin/');
    await entrarComo(page, MARIA);
    await expect(page.locator('#sessao-usuario')).toHaveText('Maria Silva — Cadastrante');
    expect(await page.locator('body').innerText()).not.toMatch(/demonstra|sem autenticação/i);
    await expect(page.getByRole('link', { name: 'Saúde do sistema' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Novo serviço' })).toBeVisible();
    expect(await page.locator('body').innerText()).not.toMatch(IDS_TECNICOS);
    expect(await semRolagemHorizontal(page)).toBe(true);
    // Trocar e cancelar: volta sem mudar.
    await page.getByRole('button', { name: 'Trocar usuário' }).click();
    await expect(page.getByRole('radio', { name: MARIA })).toBeChecked();
    await page.getByRole('button', { name: 'Cancelar' }).click();
    await expect(page.getByRole('heading', { level: 2, name: 'Serviços' })).toBeVisible();
    await expect(page.locator('#sessao-usuario')).toHaveText('Maria Silva — Cadastrante');
    await expect(page.getByRole('button', { name: 'Trocar usuário' })).toBeFocused();
    // Trocar para Carlos.
    await page.getByRole('button', { name: 'Trocar usuário' }).click();
    await entrarComo(page, CARLOS);
    await expect(page.locator('#sessao-usuario')).toHaveText('Carlos Silva — Revisor');
  });

  test('recarregar mantém a sessão e o nome no topo', async ({ page }) => {
    await page.goto('/admin/');
    await entrarComo(page, MARIA);
    await page.reload();
    await expect(page.getByRole('heading', { level: 2, name: 'Serviços' })).toBeVisible();
    await expect(page.locator('#sessao-usuario')).toHaveText('Maria Silva — Cadastrante');
    await expect(page.getByRole('button', { name: ENTRAR })).toBeHidden();
  });

  test('a saúde do sistema mantém o nome e oferece "Trocar usuário" como link para a gestão', async ({ page }) => {
    await page.goto('/admin/');
    await entrarComo(page, CARLOS);
    await page.getByRole('navigation', { name: 'Seções da administração' }).getByRole('link', { name: 'Saúde do sistema' }).click();
    await expect(page).toHaveURL(/\/admin\/saude\/$/);
    await expect(page.locator('#sessao-usuario')).toHaveText('Carlos Silva — Revisor');
    await expect(page.getByRole('link', { name: 'Trocar usuário' })).toHaveAttribute('href', '../');
    await expect(page.locator('#saude-lista li')).toHaveCount(9);
    expect(await page.locator('body').innerText()).not.toMatch(/demonstra/i);
  });

  test('Sair volta à escolha, com o foco no botão de entrada; recarregar continua sem usuário', async ({ page }) => {
    await page.goto('/admin/');
    await entrarComo(page, MARIA);
    await page.getByRole('button', { name: 'Sair' }).click();
    await expect(page.getByRole('button', { name: ENTRAR })).toBeFocused();
    await expect(page.getByRole('heading', { level: 2, name: 'Serviços' })).toBeHidden();
    await expect(page.getByRole('radio', { name: MARIA })).not.toBeChecked();
    await page.reload();
    await expect(page.getByRole('group', { name: 'Escolha com qual usuário entrar' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'Serviços' })).toBeHidden();
  });

  test('teclado: Tab chega à escolha, Espaço marca, Tab chega ao botão e Enter entra, com foco visível', async ({ page }) => {
    await page.goto('/admin/');
    await expect(page.getByRole('radio', { name: MARIA })).toBeVisible();
    await page.keyboard.press('Tab'); // link de pular
    await page.keyboard.press('Tab');
    await expect(page.getByRole('radio', { name: MARIA })).toBeFocused();
    expect(await focoVisivel(page)).toBe(true);
    await page.keyboard.press('Space');
    await expect(page.getByRole('radio', { name: MARIA })).toBeChecked();
    await page.keyboard.press('ArrowDown');
    await expect(page.getByRole('radio', { name: CARLOS })).toBeChecked();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: ENTRAR })).toBeFocused();
    expect(await focoVisivel(page)).toBe(true);
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { level: 2, name: 'Serviços' })).toBeFocused();
    await expect(page.locator('#sessao-usuario')).toHaveText('Carlos Silva — Revisor');
  });

  test('/admin/saude/ sem usuário orienta a escolher na gestão e o link volta', async ({ page }) => {
    await page.goto('/admin/saude/');
    await expect(page.getByRole('heading', { level: 1, name: /Saúde do sistema/ })).toBeVisible();
    await expect(page.locator('#status')).toHaveText('Escolha o usuário na Gestão de conteúdo.');
    await page.getByRole('link', { name: 'Ir para a Gestão de conteúdo' }).click();
    await expect(page).toHaveURL(/\/admin\/$/);
  });

  test('/admin e /admin/saude redirecionam para a barra final', async ({ page }) => {
    await page.goto('/admin');
    await expect(page).toHaveURL(/\/admin\/$/);
    await page.goto('/admin/saude');
    await expect(page).toHaveURL(/\/admin\/saude\/$/);
  });
});
