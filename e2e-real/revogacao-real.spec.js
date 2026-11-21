// Teste real da revogação (Sprint 7, Passo 7E): navegador de verdade, servidor do Vite de verdade e dados FICTÍCIOS criados pelas
// telas reais na CÓPIA temporária da base (e2e-real/preparar.js). Publica uma versão, confere o chat, revoga pelo botão
// "Revogar publicação" com motivo e confere que o chat deixa de usar o conteúdo. A cópia volta a ser idêntica à base real ao final;
// a base real nunca é tocada (zz-base-real.spec.js confere por hash).
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
const NOME_LAC = 'Licença por Adesão e Compromisso';
const TEXTO = 'Informação fictícia de demonstração sobre zelmorante, usada só no teste de revogação.';
const PERGUNTA = 'O que diz a informação fictícia de demonstração sobre zelmorante?';
const MOTIVO = 'Conteúdo fictício revogado no teste automatizado.';
const botao = (page, nome) => page.getByRole('button', { name: nome, exact: true });
const status = (page) => page.locator('#status');

test.afterAll(() => {
  const copia = path.join(process.env.SEMA_REAL_COPIA, 'services');
  fs.rmSync(copia, { recursive: true, force: true });
  fs.cpSync(path.join(RAIZ, 'services'), copia, { recursive: true });
});

async function perguntar(page) {
  await page.goto('/');
  const campo = page.getByLabel('Escreva sua dúvida');
  await campo.fill(PERGUNTA);
  await campo.press('Enter');
  await expect(page.locator('#mensagens article')).toHaveCount(3);
  return page.locator('.message--assistente').last();
}

test('revogar pelo botão: confirmação com motivo obrigatório, situação "Publicação revogada" e o chat deixa de usar o conteúdo', async ({ page }) => {
  // 1. Publicar uma versão de teste (texto fictício, revisado, aceito, revisão concluída, autorizado e publicado pelas telas reais).
  await encerrarSessao(page);
  await page.goto('/admin/');
  await escolherMaria(page);
  await page.getByRole('button', { name: 'Acessar administração' }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'Serviços' })).toBeVisible();
  await page.locator('#busca-servico').fill(NOME_LAC);
  await page.getByRole('button', { name: new RegExp(NOME_LAC) }).first().click();
  await expect(page.getByRole('heading', { level: 2, name: NOME_LAC })).toBeVisible();
  await botao(page, 'Texto').click();
  await page.locator('#texto-titulo').fill('Texto Zelmorante');
  await page.locator('#texto-texto').fill('Texto interno fictício sobre zelmorante, que não deve aparecer no chat.');
  await botao(page, 'Incluir texto').click();
  await expect(status(page)).toContainText('Texto adicionado');
  await page.getByRole('link', { name: 'Revisar informações' }).click();
  await expect(page.locator('#blocos')).toHaveAttribute('aria-busy', 'false');
  await botao(page, 'Incluir informação').click();
  await page.getByLabel('Tema da informação', { exact: true }).fill('Informação zelmorante');
  await page.getByLabel('O que o chatbot deve informar ao cidadão?').fill(TEXTO);
  await page.getByRole('checkbox', { name: /^Texto Zelmorante/ }).check();
  await page.getByLabel(/Onde esta informação aparece na fonte\? \(Texto Zelmorante\)/).fill('Seção 1');
  await page.locator('#bloco-enviar').click();
  await botao(page, 'Confirmar e salvar').click();
  await expect(status(page)).toContainText('Informação salva.');
  await page.locator('#aba-fontes').click();
  const revisar = botao(page, 'Marcar como revisado: Texto Zelmorante');
  if (await revisar.count()) { await revisar.click(); await expect(status(page)).toContainText('marcado como revisado'); }
  await page.locator('#aba-informacoes').click();
  await botao(page, 'Aceitar informação: Informação zelmorante').click();
  await expect(status(page)).toContainText('Informação aceita.');
  await botao(page, 'Concluir revisão').click();
  await botao(page, 'Confirmar conclusão').click();
  await expect(status(page)).toContainText('Revisão concluída.');
  await botao(page, 'Autorizar publicação').click();
  await botao(page, 'Confirmar autorização').click();
  await expect(status(page)).toContainText('Publicação autorizada.');
  await expect(botao(page, 'Revogar publicação')).toBeHidden();
  await botao(page, 'Publicar').click();
  await botao(page, 'Confirmar publicação').click();
  await expect(status(page)).toContainText('Versão publicada.');
  const urlDaRevisao = page.url();

  // 2. O chat usa o conteúdo publicado.
  const antes = await perguntar(page);
  await expect(antes).toContainText(TEXTO);
  await expect(page.locator('meta[name="conteudo-publico"]')).toHaveCount(1);

  // 3. "Revogar publicação": aparece com a versão publicada; o diálogo pede o motivo e não envia em branco.
  await page.goto(urlDaRevisao);
  await expect(page.locator('#blocos')).toHaveAttribute('aria-busy', 'false');
  await expect(botao(page, 'Revogar publicação')).toBeVisible();
  await botao(page, 'Revogar publicação').click();
  const dialogo = page.getByRole('dialog', { name: 'Revogar a publicação?' });
  await expect(dialogo).toBeVisible();
  await expect(dialogo).toContainText('Ao revogar, o chatbot deixa de usar o conteúdo desta versão.');
  const motivo = dialogo.getByLabel('Motivo da revogação');
  await expect(motivo).toHaveValue('');
  await botao(page, 'Confirmar revogação').click();
  await expect(dialogo).toBeVisible();
  await expect(page.locator('#revogacao-motivo-erro')).toHaveText('Informe o motivo da revogação.');
  await expect(motivo).toHaveAttribute('aria-invalid', 'true');
  await motivo.fill(MOTIVO);
  await botao(page, 'Confirmar revogação').click();

  // 4. A situação muda para "Publicação revogada" e o botão some.
  await expect(dialogo).toBeHidden();
  await expect(status(page)).toContainText('Publicação revogada.');
  await expect(page.locator('#publicacao-estado')).toContainText('Publicação revogada.');
  await expect(botao(page, 'Revogar publicação')).toBeHidden();

  // 5. O chat deixa de usar o conteúdo revogado: a página não indica mais o arquivo público e a resposta não traz o texto.
  const depois = await perguntar(page);
  await expect(depois).not.toContainText(TEXTO);
  await expect(page.locator('meta[name="conteudo-publico"]')).toHaveCount(0);

  // A revogação ficou no histórico privado da CÓPIA (fora do Git), com o motivo e o ator de demonstração.
  const decisoes = fs.readFileSync(path.join(process.env.SEMA_REAL_COPIA, 'data', 'admin-private', 'decisoes', 'lac.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  const revogacao = decisoes.at(-1);
  expect([revogacao.tipo, revogacao.motivo, revogacao.ator.perfil]).toEqual(['revogacao', MOTIVO, 'demonstracao']);
});
