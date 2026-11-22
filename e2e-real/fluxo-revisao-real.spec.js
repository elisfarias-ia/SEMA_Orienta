// Sprint 8, Passo 8D: fluxo de revisão real (sem page.route e sem mocks), no Vite de verdade com a base copiada para uma pasta
// temporária (preparar.js). Maria Silva (Cadastrante, fictícia) envia para revisão; Carlos Silva (Revisor, fictício) pede ajustes
// com motivo; Maria vê o motivo e cria uma nova versão; Maria envia de novo; Carlos valida materialmente. Nada é publicado.
import { test, expect } from '@playwright/test';

async function encerrarSessao(page) {
  const corpo = await (await page.request.get('/__admin/sessao')).json();
  if (typeof corpo.token === 'string') await page.request.delete('/__admin/sessao', { headers: { 'X-Admin-Token': corpo.token } });
}
const escolherMaria = (page) => page.getByRole('radio', { name: /^Maria Silva — / }).check();

// A troca usa a rota da sessão (só a memória do servidor; nada é gravado) e recarrega a página de revisão, que relê o usuário e
// reabre o serviço pela URL.
async function trocarUsuarioNaRevisao(page, usuarioId, rotulo) {
  const r = await page.request.post('/__admin/sessao', { data: { usuarioId } });
  expect(r.status()).toBe(200);
  await page.reload();
  await expect(page.locator('#sessao-usuario')).toHaveText(rotulo);
  await expect(page.locator('#servico-situacao')).toBeVisible();
  await expect(page.locator('#status')).toContainText('Serviço aberto para revisão.');
  await expect(page.locator('#blocos')).toHaveAttribute('aria-busy', 'false');
}
const comoCarlos = (page) => trocarUsuarioNaRevisao(page, 'carlos-silva', 'Carlos Silva — Revisor');
const comoMaria = (page) => trocarUsuarioNaRevisao(page, 'maria-silva', 'Maria Silva — Cadastrante');

const ENTRAR = 'Acessar administração';
const TEMA = 'Tema Fluxo Revisão Real';
const TECNICO = /rascunho|em_validacao|ajustes_solicitados|validado_materialmente|autorizado|revisao_divergente|versao_congelada|estado_invalido|motivo_invalido|[0-9a-f]{64}|X-Admin-Token/i;
const MOTIVO = 'Ajustar a etapa 2 conforme o manual fictício.';
const botao = (page, nome) => page.getByRole('button', { name: nome, exact: true });
const status = (page) => page.locator('#status');
const fonteDa = (page, titulo) => page.locator('#fontes-revisao li').filter({ hasText: titulo });
const blocoDa = (page, titulo) => page.locator('#blocos li.bloco').filter({ hasText: titulo });

async function criarServicoComLink(page, nome) {
  const slug = nome.toLowerCase().replace(/[^a-z]+/g, '-');
  const link = `Portal ${nome}`;
  await encerrarSessao(page);
  await page.goto('/admin/');
  await escolherMaria(page);
  await page.getByRole('button', { name: ENTRAR }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'Serviços' })).toBeVisible();
  await botao(page, 'Novo serviço').click();
  await page.locator('#novo-nome').fill(nome);
  await page.locator('#novo-tema').fill(TEMA);
  await botao(page, 'Criar serviço').click();
  await expect(page.getByRole('heading', { level: 2, name: nome })).toBeVisible();
  await botao(page, 'Link').click();
  await page.locator('#link-titulo').fill(link);
  await page.locator('#link-url').fill(`https://exemplo.test/${slug}`);
  await page.locator('#link-orgao').fill('Órgão de Teste');
  await page.locator('#link-descricao').fill('Página com as orientações.');
  await botao(page, 'Incluir link').click();
  await expect(status(page)).toContainText('Link adicionado');
  await page.getByRole('link', { name: 'Revisar informações' }).click();
  await expect(page).toHaveURL(/\/admin\/conteudo\/\?servico=/);
  await expect(page.locator('#blocos')).toHaveAttribute('aria-busy', 'false');
  return link;
}

async function criarBloco(page, titulo, fonte) {
  await page.locator('#aba-informacoes').click();
  await page.getByRole('button', { name: 'Incluir informação', exact: true }).click();
  await page.getByLabel('Tema da informação', { exact: true }).fill(titulo);
  await page.getByLabel('O que o chatbot deve informar ao cidadão?').fill(`Orientação de teste: ${titulo}.`);
  await page.getByRole('checkbox', { name: new RegExp(`^${fonte}`) }).check();
  await page.getByLabel(new RegExp(`Onde esta informação aparece na fonte\\? \\(${fonte}\\)`)).fill('Seção 1');
  await page.locator('#bloco-enviar').click();
  await page.getByRole('button', { name: 'Confirmar e salvar', exact: true }).click();
  await expect(status(page)).toContainText('Informação salva.');
}
async function revisarEAceitar(page, fonte, titulo) {
  await page.locator('#aba-fontes').click();
  await page.getByRole('button', { name: `Marcar como revisado: ${fonte}`, exact: true }).click();
  await expect(status(page)).toContainText('Documento ou link marcado como revisado.');
  await expect(fonteDa(page, fonte)).toContainText('Situação: Revisado');
  await page.locator('#aba-informacoes').click();
  await page.getByRole('button', { name: `Aceitar informação: ${titulo}`, exact: true }).click();
  await expect(status(page)).toContainText('Informação aceita.');
  await expect(blocoDa(page, titulo)).toContainText('Situação: Aceita');
}
async function enviarComoMaria(page) {
  await botao(page, 'Enviar para revisão').click();
  await expect(page.getByRole('dialog')).toContainText('aguardará a análise do Revisor');
  await botao(page, 'Confirmar envio').click();
  await expect(status(page)).toContainText('Versão enviada para revisão.');
  await expect(page.locator('#servico-situacao')).toContainText('Em análise');
}

test('1. (8D) Maria envia; Carlos pede ajustes com motivo; Maria vê o motivo e cria nova versão; Maria envia de novo; Carlos valida', async ({ page }) => {
  const enviados = [];
  const respostas = [];
  page.on('request', (r) => { if (r.method() === 'POST' && r.url().includes('/__admin/servicos/')) enviados.push({ caminho: new URL(r.url()).pathname, texto: r.postData() }); });
  page.on('response', async (r) => { if (r.request().method() === 'POST' && r.url().includes('/__admin/servicos/')) respostas.push(await r.text().catch(() => '')); });

  const link = await criarServicoComLink(page, 'Serviço Fluxo Omega');
  await criarBloco(page, 'Prazos do pedido', link);
  await revisarEAceitar(page, link, 'Prazos do pedido');
  await expect(page.locator('#titulo-conclusao')).toHaveText('Revisão e validação');

  // Maria envia para revisão: a versão fica em análise e bloqueada, sem nova versão; validar e ajustes são do Revisor.
  await enviarComoMaria(page);
  await expect(page.locator('#conclusao-pronta')).toContainText('aguarda a análise do Revisor');
  await expect(botao(page, 'Criar nova versão para editar')).toBeHidden();
  await expect(botao(page, 'Validar materialmente')).toHaveAttribute('aria-disabled', 'true');
  await expect(botao(page, 'Solicitar ajustes')).toHaveAttribute('aria-disabled', 'true');
  expect(enviados.filter((e) => e.caminho.endsWith('/revisao/validar') || e.caminho.endsWith('/revisao/ajustes'))).toHaveLength(0);

  // Carlos pede ajustes: motivo obrigatório; o motivo vai no corpo, mas nunca volta numa resposta de gravação.
  await comoCarlos(page);
  await expect(botao(page, 'Enviar para revisão')).toBeHidden();
  await botao(page, 'Solicitar ajustes').click();
  await botao(page, 'Confirmar pedido de ajustes').click();
  await expect(page.locator('#ajustes-motivo-erro')).toHaveText('Informe o motivo dos ajustes.');
  expect(enviados.filter((e) => e.caminho.endsWith('/revisao/ajustes'))).toHaveLength(0);
  await page.getByLabel('Motivo dos ajustes').fill(MOTIVO);
  await botao(page, 'Confirmar pedido de ajustes').click();
  await expect(status(page)).toContainText('Ajustes solicitados.');
  await expect(page.locator('#servico-situacao')).toContainText('Ajustes solicitados');
  const pedido = enviados.filter((e) => e.caminho.endsWith('/revisao/ajustes'));
  expect(pedido).toHaveLength(1);
  expect(JSON.parse(pedido[0].texto)).toEqual({ motivo: MOTIVO, revisao: expect.any(String) });
  expect(respostas.some((t) => t.includes('etapa 2'))).toBe(false);
  for (const nome of [/^Validar materialmente$/, /^Solicitar ajustes$/, /publicar/i]) await expect(page.getByRole('button', { name: nome })).toHaveCount(0);

  // Maria vê o motivo (texto) e cria a nova versão.
  await comoMaria(page);
  await expect(page.locator('#ajustes-motivo')).toHaveText(`Motivo dos ajustes: ${MOTIVO}`);
  await expect(page.locator('#conclusao-pronta')).toContainText('crie uma nova versão');
  expect(await page.locator('body').innerText()).not.toMatch(TECNICO);
  await botao(page, 'Criar nova versão para editar').click();
  await expect(status(page)).toContainText('Nova versão criada.');
  await expect(page.locator('#servico-situacao')).toContainText('Versão 2');
  await expect(page.locator('#servico-situacao')).toContainText('Em elaboração');
  await expect(page.locator('#ajustes-motivo')).toBeHidden();

  // Maria corrige (revisa e aceita de novo) e envia a versão 2.
  await revisarEAceitar(page, link, 'Prazos do pedido');
  await enviarComoMaria(page);

  // Carlos valida materialmente: "Pronto para publicar", sem publicar nada.
  await comoCarlos(page);
  await botao(page, 'Validar materialmente').click();
  await expect(page.getByRole('dialog')).toContainText('não equivale à validação material da CLABI');
  await botao(page, 'Confirmar validação').click();
  await expect(status(page)).toContainText('Validação material registrada');
  await expect(page.locator('#servico-situacao')).toContainText('Pronto para publicar');
  await expect(botao(page, 'Autorizar publicação')).toBeVisible();
  expect(enviados.some((e) => e.caminho.endsWith('/autorizacao') || e.caminho.endsWith('/publicacao') || e.caminho.endsWith('/revisao/concluir'))).toBe(false);
  expect(enviados.filter((e) => e.caminho.endsWith('/revisao/enviar'))).toHaveLength(2);
  expect(enviados.filter((e) => e.caminho.endsWith('/revisao/validar'))).toHaveLength(1);
  expect(await page.locator('body').innerText()).not.toMatch(TECNICO);
});
