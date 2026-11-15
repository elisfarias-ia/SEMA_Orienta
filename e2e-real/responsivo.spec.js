// Responsividade das páginas administrativas contra o servidor real (porta 5183, base temporária). Somente leitura da tela:
// nada é gravado aqui (os formulários são preenchidos, mas nunca enviados). Cobre desktop e 390 × 844 px, inclusive com texto
// ampliado (150%), que foi o que fez a página ficar mais larga do que a tela (grade com coluna "auto").
import { test, expect } from '@playwright/test';

const ENTRAR = 'Entrar como servidor de demonstração';
const LONGO = 'ParagrafoSemEspacosMuitoLongoParaTestarQuebraDeLinhaEmTelasPequenasXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX';
const TELAS = [
  { nome: 'desktop 1280', largura: 1280, altura: 800, escala: '100%' },
  { nome: '390 × 844', largura: 390, altura: 844, escala: '100%' },
  { nome: '390 × 844 com texto a 150%', largura: 390, altura: 844, escala: '150%' },
  { nome: '390 × 844 com texto a 200%', largura: 390, altura: 844, escala: '200%' },
];

/** Sem rolagem horizontal e nada cortado: campos, cartões, títulos e botões dentro da tela e sem texto escondido. */
async function conferirSemCortes(page, onde) {
  const r = await page.evaluate(() => {
    const d = document.documentElement;
    const largura = d.clientWidth;
    const visivel = (e) => {
      const b = e.getBoundingClientRect();
      const cs = getComputedStyle(e);
      return b.width > 0 && b.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none';
    };
    const fora = [];
    const cortados = [];
    for (const e of document.querySelectorAll('body *')) {
      if (!visivel(e)) continue;
      const b = e.getBoundingClientRect();
      if (b.right > largura + 0.5 || b.left < -0.5) fora.push(`${e.tagName.toLowerCase()}#${e.id}.${typeof e.className === 'string' ? e.className : ''}`);
    }
    for (const e of document.querySelectorAll('.cartao, h1, h2, h3, button, a.botao, label, legend, fieldset, p')) {
      if (visivel(e) && e.scrollWidth > e.clientWidth + 1) cortados.push(`${e.tagName.toLowerCase()}#${e.id}.${typeof e.className === 'string' ? e.className : ''}`);
    }
    return { sw: d.scrollWidth, cw: largura, fora: fora.slice(0, 6), cortados: cortados.slice(0, 6) };
  });
  expect(r.sw, `${onde}: rolagem horizontal`).toBeLessThanOrEqual(r.cw);
  expect(r.fora, `${onde}: elementos fora da tela`).toEqual([]);
  expect(r.cortados, `${onde}: texto cortado`).toEqual([]);
}

async function focoVisivelNoAtivo(page) {
  return page.evaluate(() => {
    const e = document.activeElement;
    if (!e || e === document.body) return false;
    const c = getComputedStyle(e);
    return (c.outlineStyle !== 'none' && parseFloat(c.outlineWidth) > 0) || (c.boxShadow && c.boxShadow !== 'none');
  });
}

/** Percorre o teclado e confere que cada parada tem foco visível e que a rolagem horizontal não aparece. */
async function conferirTeclado(page, onde, paradas = 8) {
  await page.evaluate(() => document.activeElement?.blur());
  // Não passa do último elemento focável (o próximo Tab sairia da página).
  const focaveis = await page.evaluate(() => [...document.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]):not([type=hidden]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]')].filter((e) => { const b = e.getBoundingClientRect(); return b.width > 0 && b.height > 0 && getComputedStyle(e).visibility !== 'hidden'; }).length);
  for (let i = 0; i < Math.min(paradas, focaveis); i += 1) {
    await page.keyboard.press('Tab');
    const nome = await page.evaluate(() => `${document.activeElement?.tagName}#${document.activeElement?.id}`);
    if (['BODY', 'HTML'].includes(nome.split('#')[0])) {
      expect(i, `${onde}: o foco saiu da página cedo demais`).toBeGreaterThanOrEqual(3); // fim do ciclo: o próximo Tab sai da página
      break;
    }
    await expect.poll(() => focoVisivelNoAtivo(page), { message: `${onde}: foco visível em ${nome}` }).toBeTruthy();
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), `${onde}: teclado sem rolagem horizontal`).toBe(true);
}

async function prepararTela(page, tela) {
  await page.setViewportSize({ width: tela.largura, height: tela.altura });
}
async function ampliar(page, tela) {
  if (tela.escala !== '100%') await page.addStyleTag({ content: `html{font-size:${tela.escala} !important}` });
}
async function preencherVisiveis(page) {
  const campos = page.locator('.painel:not([hidden]) input[type=text], .painel:not([hidden]) input:not([type]), .painel:not([hidden]) input[type=url], .painel:not([hidden]) textarea');
  for (let i = 0; i < await campos.count(); i += 1) await campos.nth(i).fill(LONGO);
}

for (const tela of TELAS) {
  test.describe(`responsivo — ${tela.nome}`, () => {
    // Em celular de verdade a janela visual se amplia quando algo é mais largo que a tela; sem isso o excesso fica escondido.
    test.use({ isMobile: tela.largura < 600, hasTouch: tela.largura < 600 });
    test('/admin/: entrada, lista, novo serviço e painéis de informação', async ({ page }) => {
      await prepararTela(page, tela);
      await page.goto('/admin/');
      await ampliar(page, tela);
      await conferirSemCortes(page, 'entrada');
      await conferirTeclado(page, 'entrada', 4);
      await page.getByRole('button', { name: ENTRAR }).click();
      await expect(page.getByRole('heading', { level: 2, name: 'Serviços' })).toBeVisible();
      await conferirSemCortes(page, 'lista');
      await conferirTeclado(page, 'lista', 8);
      await page.getByRole('button', { name: 'Novo serviço', exact: true }).click();
      await page.locator('#novo-nome').fill(LONGO);
      await page.locator('#novo-tema').fill(LONGO);
      await conferirSemCortes(page, 'novo serviço com textos longos');
      await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
      await page.locator('#busca-servico').fill('Licen');
      await page.getByRole('button', { name: /Licen/ }).first().click();
      await expect(page.getByRole('button', { name: 'Texto', exact: true })).toBeVisible();
      await conferirSemCortes(page, 'serviço aberto');
      for (const maneira of ['Texto', 'Link novo', 'Usar link já cadastrado']) {
        await page.getByRole('button', { name: maneira, exact: true }).click();
        await preencherVisiveis(page);
        await conferirSemCortes(page, maneira);
        await conferirTeclado(page, maneira, 10);
      }
    });

    test('/admin/conteudo/: serviço, formulário longo, fontes e confirmação', async ({ page }) => {
      await prepararTela(page, tela);
      await page.goto('/admin/conteudo/');
      await ampliar(page, tela);
      await conferirSemCortes(page, 'conteúdo inicial');
      await page.selectOption('#assunto', { index: 1 });
      await page.selectOption('#servico', { index: 1 });
      await expect(page.locator('#bloco-titulo')).toBeVisible();
      await expect(page.locator('.fonte-opcao').first()).toBeVisible();
      await conferirSemCortes(page, 'conteúdo com serviço');
      await page.fill('#bloco-titulo', LONGO);
      await page.fill('#bloco-texto', `${LONGO} ${LONGO}`);
      await page.fill('#bloco-alertas', LONGO);
      await page.locator('.fonte-opcao input[type=checkbox]:not([disabled])').first().check();
      await page.locator('.fonte-opcao__local input:visible').first().fill(LONGO);
      await conferirSemCortes(page, 'conteúdo com textos longos');
      await conferirTeclado(page, 'conteúdo', 12);
      await page.click('#bloco-enviar');
      await expect(page.locator('#confirmacao-confirmar')).toBeVisible();
      await conferirSemCortes(page, 'confirmação');
      await page.click('#confirmacao-voltar'); // nunca confirma: nada é gravado
    });

    test('/admin/saude/: estados e botão', async ({ page }) => {
      await prepararTela(page, tela);
      await page.goto('/admin/saude/');
      await ampliar(page, tela);
      await expect(page.locator('#saude-lista li').first()).toBeVisible();
      await conferirSemCortes(page, 'saúde');
      await conferirTeclado(page, 'saúde', 6);
    });
  });
}
