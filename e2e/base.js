// Base dos testes E2E: todos são somente leitura. A rede é restrita ao servidor local e qualquer requisição que não
// seja GET (por exemplo um POST administrativo) é bloqueada e faz o teste falhar.
import { test as base, expect } from '@playwright/test';

const ORIGEM_LOCAL = 'http://localhost:5173';

export const test = base.extend({
  violacoes: async ({}, usar) => {
    await usar([]);
  },
  page: async ({ page, violacoes }, usar) => {
    await page.route('**/*', (rota) => {
      const requisicao = rota.request();
      const url = requisicao.url();
      const local = url.startsWith(`${ORIGEM_LOCAL}/`) || url.startsWith('data:');
      if (!local) {
        violacoes.push(`rede externa: ${new URL(url).origin}`);
        return rota.abort();
      }
      if (requisicao.method() !== 'GET') {
        violacoes.push(`${requisicao.method()} ${new URL(url).pathname}`);
        return rota.abort();
      }
      return rota.continue();
    });
    await usar(page);
    expect(violacoes, 'requisições bloqueadas durante o teste').toEqual([]);
  },
});

export { expect };

/** Verdadeiro se a página não tem rolagem horizontal. */
export const semRolagemHorizontal = (page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);

/** Foco visível: o elemento focado tem contorno ou sombra de foco. */
export const focoVisivel = (page) =>
  page.evaluate(() => {
    const e = document.activeElement;
    if (!e || e === document.body) return false;
    const c = getComputedStyle(e);
    const contorno = c.outlineStyle !== 'none' && parseFloat(c.outlineWidth) > 0;
    return contorno || (c.boxShadow && c.boxShadow !== 'none');
  });
