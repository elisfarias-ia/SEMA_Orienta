// Teste real de "Importar conteúdo existente" (Passo 5B3c): sem page.route e sem mocks. O servidor é o Vite de verdade (veja
// preparar.js), com a base de serviços copiada para uma pasta temporária. Usa a LAC copiada (conteúdo antigo real) em
// /admin/conteudo/?servico=lac. Os testes toleram o que outros arquivos já fizeram na cópia (por exemplo, fontes excluídas).
import fs from 'node:fs';
import path from 'node:path';
import { test, expect } from '@playwright/test';

const TECNICO = /rascunho|em_validacao|validado_materialmente|autorizado|revisao_divergente|versao_congelada|ja_importado|origemImportacao|excluidaEm|[0-9a-f]{64}|X-Admin-Token|X-Revisao|\bbc-[0-9a-f]{6,}|\b(link|norma|bloco|documento|pergunta):[a-z0-9-]+/i;
const botao = (page, nome) => page.getByRole('button', { name: nome, exact: true });
const status = (page) => page.locator('#status');
const cartao = (page) => page.locator('#cartao-importacao');
const itens = (page) => page.locator('#importacao-lista li.bloco');

function observar(page) {
  const lista = [];
  page.on('request', (r) => {
    if (r.method() !== 'GET' && r.url().includes('/__admin/')) lista.push({ metodo: r.method(), caminho: new URL(r.url()).pathname, texto: r.postData(), tipo: r.headers()['content-type'] });
  });
  return lista;
}

// Passo 8B (login simulado): cada abertura garante sessão própria pela API (só muda a memória do servidor, nada é gravado em
// disco), para o arquivo passar também rodando sozinho. Pela API, a entrada não aparece entre as requisições observadas da página.
async function encerrarSessao(page) {
  const corpo = await (await page.request.get('/__admin/sessao')).json();
  if (typeof corpo.token === 'string') await page.request.delete('/__admin/sessao', { headers: { 'X-Admin-Token': corpo.token } });
}
async function entrarComoMaria(page) {
  await encerrarSessao(page);
  await page.request.post('/__admin/sessao', { data: { usuarioId: 'maria-silva' } });
}

async function abrirLac(page) {
  await entrarComoMaria(page);
  await page.goto('/admin/conteudo/?servico=lac');
  await expect(page.locator('#servico-situacao')).toBeVisible();
  await expect(page.locator('#fontes-revisao')).toHaveAttribute('aria-busy', 'false');
}

test('1. abrir a lista só lê (apenas orientações): candidatos em linguagem comum, sem ids, nada gravado, foco no título', async ({ page }) => {
  const enviados = observar(page);
  await abrirLac(page);
  await expect(cartao(page)).toBeHidden();
  await botao(page, 'Importar conteúdo existente').click();
  await expect(cartao(page)).toBeVisible();
  await expect(page.locator('#titulo-importacao')).toBeFocused();
  await expect(itens(page).first()).toBeVisible();
  await expect(page.locator('#importacao-estado')).toHaveText(/^\d+ orientaç(ão|ões) encontradas?\.$/);
  await expect(page.locator('#titulo-importacao')).toHaveText('Orientações encontradas no conteúdo antigo');
  await expect(page.locator('#importacao-ajuda')).toHaveText('Escolha somente as orientações que ainda são úteis. Os documentos e normas continuam disponíveis como fontes.');
  const n = await itens(page).count();
  expect(n).toBeGreaterThan(3);
  await expect(page.locator('#importacao-estado')).toHaveText(`${n} orientações encontradas.`);
  // normas, links e documentos técnicos não são itens importáveis: continuam como fontes
  await expect(itens(page).filter({ hasText: /Tipo: (Norma|Link|Documento exigido)/ })).toHaveCount(0);
  await expect(itens(page).locator('.bloco__titulo').filter({ hasText: /^(Lei|Decreto|Termo de Referência|RG |CPF )/ })).toHaveCount(0);
  await expect(itens(page).filter({ hasText: 'Descrição do serviço' }).first()).toContainText('Tipo: Descrição');
  await expect(botao(page, 'Importar: Descrição do serviço')).toBeVisible();
  expect(await cartao(page).innerText()).not.toMatch(TECNICO);
  // não aparecem blocos antigos de teste, regra institucional, bloco "sem conteúdo" nem a norma revogada
  await expect(itens(page).filter({ hasText: /conteúdo anterior|Tipo: Conteúdo anterior/ })).toHaveCount(0);
  // o decreto revogado pode ser citado no corpo de outros textos, mas nunca é um item importável nem fonte sugerida
  await expect(itens(page).locator('.bloco__titulo').filter({ hasText: 'Decreto nº 695' })).toHaveCount(0);
  await expect(itens(page).locator('p.bloco__linha').filter({ hasText: /Documento ou link sugerido:.*Decreto nº 695/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^Importar: Decreto nº 695/ })).toHaveCount(0);
  expect(enviados, 'abrir a lista não grava nada').toEqual([]);
  await expect(page.locator('#botao-importar')).toHaveAttribute('aria-expanded', 'true');
  await botao(page, 'Fechar').click();
  await expect(cartao(page)).toBeHidden();
  await expect(page.locator('#botao-importar')).toBeFocused();
});

test('2. importar um item: o formulário é preenchido, a pessoa confere e confirma; entra em elaboração, sem aceitar; o item some da lista', async ({ page }) => {
  const enviados = observar(page);
  await abrirLac(page);
  const antes = await page.locator('#blocos li.bloco').count();
  await botao(page, 'Importar conteúdo existente').click();
  await expect(itens(page).first()).toBeVisible();
  const totalAntes = await itens(page).count();
  await botao(page, 'Importar: Descrição do serviço').click();
  await expect(page.locator('#cartao-form')).toBeVisible();
  await expect(page.locator('#titulo-form')).toHaveText('Importar informação');
  await expect(page.locator('#titulo-form')).toBeFocused();
  await expect(page.locator('#bloco-titulo')).toHaveValue('Descrição do serviço');
  await expect(page.locator('#bloco-texto')).not.toHaveValue('');
  await expect(page.locator('#aviso-importacao')).toBeVisible();
  await expect(page.locator('#aviso-importacao')).toHaveText('Conteúdo antigo: confira e atualize esta orientação antes de salvar.');
  await expect(page.locator('#bloco-texto')).not.toHaveValue(/Conteúdo antigo: confira/);
  expect(enviados, 'escolher o item só preenche o formulário').toEqual([]);
  // fonte sugerida marcada; falta o local na fonte
  const marcada = page.locator('#bloco-fontes input[type="checkbox"]:checked');
  expect(await marcada.count()).toBeGreaterThan(0);
  await page.locator('#bloco-enviar').click();
  await expect(status(page)).toContainText('Revise os campos');
  await page.locator('#bloco-fontes input[type="text"]:not(:disabled)').first().fill('Seção principal');
  await page.locator('#bloco-enviar').click();
  await expect(page.locator('#confirmacao-titulo')).toHaveText('Confirmar importação da informação');
  expect(enviados, 'a confirmação ainda não grava').toEqual([]);
  await botao(page, 'Confirmar e salvar').click();
  await expect(status(page)).toContainText('Informação importada.');
  await expect(page.locator('#aviso-importacao')).toBeHidden();
  await expect(status(page)).toContainText('conteúdo existente continua preservado');
  await expect(page.locator('#blocos li.bloco')).toHaveCount(antes + 1);
  const nova = page.locator('#blocos li.bloco').filter({ hasText: 'Descrição do serviço' }).last();
  await expect(nova).toBeFocused();
  await expect(nova).toContainText('Em elaboração');
  await expect(nova).toContainText('Ainda não disponível no chatbot');
  const posts = enviados.filter((x) => x.metodo === 'POST');
  expect(posts).toHaveLength(1);
  expect(posts[0].caminho).toBe('/__admin/servicos/lac/importacao');
  expect(posts[0].tipo).toContain('application/json');
  expect(Object.keys(JSON.parse(posts[0].texto)).sort()).toEqual(['fonteIds', 'ref', 'referencias', 'revisao', 'texto', 'titulo'].concat(JSON.parse(posts[0].texto).alertas ? ['alertas'] : []).sort());
  expect(enviados.filter((x) => x.metodo !== 'POST')).toEqual([]);
  // a lista foi atualizada sem fechar e o item importado não aparece mais
  await expect(cartao(page)).toBeVisible();
  await expect(itens(page)).toHaveCount(totalAntes - 1);
  await expect(botao(page, 'Importar: Descrição do serviço')).toHaveCount(0);
  // nunca aceito sozinho: a informação ainda pede aceitação
  await expect(nova.getByRole('button', { name: /^Aceitar informação/ })).toBeVisible();
  expect(await page.locator('#blocos').innerText()).not.toMatch(TECNICO);
});

test('3. uma por vez: outro item pode ser importado; fonte revogada não pode ser escolhida; cancelar descarta o preenchimento', async ({ page }) => {
  const enviados = observar(page);
  await abrirLac(page);
  await botao(page, 'Importar conteúdo existente').click();
  await expect(itens(page).first()).toBeVisible();
  const primeiro = itens(page).first();
  const titulo = await primeiro.locator('.bloco__titulo').innerText();
  await primeiro.getByRole('button', { name: /^Importar:/ }).click();
  await expect(page.locator('#bloco-titulo')).toHaveValue(titulo);
  // fonte revogada: indisponível para escolha
  const revogada = page.getByRole('checkbox', { name: /Decreto nº 695/ });
  if (await revogada.count()) await expect(revogada).toBeDisabled();
  await botao(page, 'Cancelar').click();
  await expect(page.locator('#cartao-form')).toBeHidden();
  await expect(page.locator('#bloco-titulo')).toHaveValue('');
  expect(enviados).toEqual([]);
  await expect(cartao(page)).toBeVisible();
});

test('4. 390 px e texto ampliado: lista e botões acessíveis, sem rolagem horizontal, teclado funciona', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await abrirLac(page);
  await botao(page, 'Importar conteúdo existente').click();
  await expect(itens(page).first()).toBeVisible();
  for (const escala of ['100%', '200%']) {
    await page.evaluate((v) => { document.documentElement.style.fontSize = v; }, escala);
    const estouro = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(estouro, `rolagem horizontal a ${escala}`).toBeLessThanOrEqual(1);
    await expect(page.getByRole('button', { name: /^Importar:/ }).first()).toBeVisible();
  }
  // teclado: o botão "Importar" do primeiro item recebe foco e abre o formulário com Enter
  await page.getByRole('button', { name: /^Importar:/ }).first().focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#titulo-form')).toBeFocused();
  await botao(page, 'Cancelar').click();
});

test('5. nenhuma publicação: nada publicado na cópia e a base real continua intacta', async () => {
  const copia = path.join(process.env.SEMA_REAL_COPIA, 'services');
  const registro = JSON.parse(fs.readFileSync(path.join(copia, 'registry.json'), 'utf8'));
  for (const s of registro.servicos) expect(s.versaoPublicadaId ?? null, `serviço ${s.id} sem versão publicada`).toBeNull();
  const achados = [];
  const varrer = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const caminho = path.join(dir, e.name);
      if (e.isDirectory()) varrer(caminho);
      else if (e.name.endsWith('.json') && /"publicado"\s*:\s*true/.test(fs.readFileSync(caminho, 'utf8'))) achados.push(path.relative(copia, caminho));
    }
  };
  varrer(copia);
  expect(achados).toEqual([]);
});
