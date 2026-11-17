// Teste real da revisão ("Gestão de conteúdo"): sem page.route e sem mocks. O servidor é o Vite de verdade (veja preparar.js), com a
// base de serviços copiada para uma pasta temporária. Cada teste cria o próprio serviço pela interface (/admin/: serviço, link novo
// e texto) e usa /admin/conteudo/ para criar informações e revisar. A publicação não existe: nada é publicado em nenhum teste.
import fs from 'node:fs';
import path from 'node:path';
import { test, expect } from '@playwright/test';

const ENTRAR = 'Acessar administração';
const TEMA = 'Tema Revisão Real';
const TECNICO = /rascunho|em_validacao|validado_materialmente|autorizado|sem_bloco_aceito|bloco_pendente|fonte_pendente|fonte_revogada|fonte_inexistente|entrada_invalida|revisao_divergente|versao_congelada|[0-9a-f]{64}|X-Admin-Token|\bbc-[0-9a-f]{6,}|\bv\d+\b/i;
const botao = (page, nome) => page.getByRole('button', { name: nome, exact: true });
const status = (page) => page.locator('#status');
const semRolagem = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);

async function entrar(page) {
  await page.goto('/admin/');
  await page.getByRole('button', { name: ENTRAR }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'Serviços' })).toBeVisible();
}

/** Serviço novo (com tema) + um link novo + um texto, tudo pela interface. Termina com o painel do serviço aberto em /admin/. */
async function criarServicoComFontes(page, nome) {
  const slug = nome.toLowerCase().replace(/[^a-z]+/g, '-');
  const dados = { nome, link: `Portal ${nome}`, texto: `Texto ${nome}` };
  await entrar(page);
  await botao(page, 'Novo serviço').click();
  await page.locator('#novo-nome').fill(nome);
  await page.locator('#novo-tema').fill(TEMA);
  await botao(page, 'Criar serviço').click();
  await expect(page.getByRole('heading', { level: 2, name: nome })).toBeVisible();
  await botao(page, 'Link').click();
  await page.locator('#link-titulo').fill(dados.link);
  await page.locator('#link-url').fill(`https://exemplo.test/${slug}`);
  await page.locator('#link-orgao').fill('Órgão de Teste');
  await page.locator('#link-descricao').fill('Página com as orientações.');
  await botao(page, 'Incluir link').click();
  await expect(status(page)).toContainText('Link adicionado');
  await botao(page, 'Texto').click();
  await page.locator('#texto-titulo').fill(dados.texto);
  await page.locator('#texto-texto').fill(`Informação de teste do serviço ${nome}, escrita para conferência.`);
  await botao(page, 'Incluir texto').click();
  await expect(status(page)).toContainText('Texto adicionado');
  await expect(page.locator('#painel-situacao-texto')).toContainText('Situação: Em elaboração');
  return dados;
}

async function irParaRevisao(page) {
  await page.getByRole('link', { name: 'Revisar informações' }).click();
  await expect(page).toHaveURL(/\/admin\/conteudo\/\?servico=/);
  await expect(page.locator('#servico-situacao')).toBeVisible();
  await expect(page.locator('#blocos')).toHaveAttribute('aria-busy', 'false');
}

/** Cria uma informação do chatbot usando a fonte escolhida (por título). */
async function criarBloco(page, titulo, fonte) {
  await page.getByRole('button', { name: 'Incluir informação', exact: true }).click();
  await expect(page.locator('#titulo-form')).toBeFocused();
  await page.getByLabel('Tema da informação', { exact: true }).fill(titulo);
  await page.getByLabel('O que o chatbot deve informar ao cidadão?').fill(`Orientação de teste: ${titulo}.`);
  await page.getByRole('checkbox', { name: new RegExp(`^${fonte}`) }).check();
  await page.getByLabel(new RegExp(`Onde esta informação aparece na fonte\\? \\(${fonte}\\)`)).fill('Seção 1');
  await page.locator('#bloco-enviar').click();
  await page.getByRole('button', { name: 'Confirmar e salvar', exact: true }).click();
  await expect(status(page)).toContainText('Informação salva.');
  await expect(page.locator('#blocos')).toContainText(titulo);
  await expect(page.locator('#blocos li.bloco').filter({ hasText: titulo })).toBeFocused();
  await expect(page.locator('#cartao-form')).toBeHidden();
  await conferirCoerencia(page);
}

/** Um só número em todo lugar: resumo, selo, lista de pendências e botão de concluir dizem a mesma coisa. */
async function conferirCoerencia(page) {
  const resumo = await page.locator('#situacao-resumo').innerText();
  const m = /^(Nenhuma|\d+) pendência/.exec(resumo);
  expect(m, `resumo: ${resumo}`).not.toBeNull();
  const n = m[1] === 'Nenhuma' ? 0 : Number(m[1]);
  await expect(page.locator('#pendencias li')).toHaveCount(n);
  if (n > 0) await expect(page.locator('#situacao-selo')).toBeVisible();
  else await expect(page.locator('#situacao-selo')).toBeHidden();
  await expect(page.locator('#botao-concluir')).toBeVisible({ visible: n === 0 });
  return { n, resumo };
}
const fonteDa = (page, titulo) => page.locator('#fontes-revisao li').filter({ hasText: titulo });
const blocoDa = (page, titulo) => page.locator('#blocos li.bloco').filter({ hasText: titulo });
async function revisarFonte(page, titulo) {
  await page.getByRole('button', { name: `Marcar como revisado: ${titulo}`, exact: true }).click();
  await expect(status(page)).toContainText('Documento ou link marcado como revisado.');
  await expect(fonteDa(page, titulo)).toContainText('Situação: Revisado');
  await expect(fonteDa(page, titulo)).toBeFocused();
  await conferirCoerencia(page);
}
const aceitar = async (page, titulo) => {
  await page.getByRole('button', { name: `Aceitar informação: ${titulo}`, exact: true }).click();
  await expect(status(page)).toContainText('Informação aceita.');
  await expect(blocoDa(page, titulo)).toContainText('Situação: Aceita');
  await expect(blocoDa(page, titulo)).toBeFocused();
  await conferirCoerencia(page);
};

function observarPosts(page) {
  const posts = [];
  page.on('request', (r) => {
    if (r.method() === 'POST' && r.url().includes('/__admin/')) posts.push({ caminho: new URL(r.url()).pathname, texto: r.postData(), tipo: r.headers()['content-type'] });
  });
  return posts;
}
const posts = (lista, final) => lista.filter((p) => p.caminho.endsWith(final));

test('1. serviço com fontes e informação pendentes: painel, situação, pendências e nada técnico na tela', async ({ page }) => {
  const d = await criarServicoComFontes(page, 'Serviço Rev Zeta');
  await expect(page.locator('#painel-situacao')).toContainText('Revisão pendente');
  await expect(page.locator('#painel-resumo')).toHaveText('1 pendência para concluir. Informações aceitas: 0. 2 documentos ou links ainda não são usados por nenhuma informação; isso não impede a conclusão.');
  await expect(page.getByRole('button', { name: /publicar/i })).toHaveCount(0);
  expect(await page.locator('body').innerText()).not.toMatch(TECNICO);
  await irParaRevisao(page);
  const url = page.url();
  expect(await page.locator('body').innerText()).not.toContain(url.split('servico=')[1]);
  await expect(page.locator('#servico')).toHaveValue(url.split('servico=')[1]);
  await expect(page.locator('#servico-situacao')).toContainText('Em elaboração');
  await expect(page.locator('#servico-situacao')).toContainText('Revisão pendente');
  await expect(fonteDa(page, d.link)).toContainText('Tipo: Link');
  await expect(fonteDa(page, d.link)).toContainText('Situação: Ainda não revisada');
  await expect(page.locator('#situacao-resumo')).toHaveText('1 pendência para concluir. Informações aceitas: 0. 2 documentos ou links ainda não são usados por nenhuma informação; isso não impede a conclusão.');
  await expect(page.locator('#cartao-form')).toBeHidden();
  await expect(page.locator('#servico-compacto')).toBeVisible();
  await expect(page.locator('#selecao-completa')).toBeHidden();
  await expect(fonteDa(page, d.texto)).toContainText('Tipo: Texto informado');
  expect(await page.locator('#fontes-revisao').innerText()).not.toContain('escrita para conferência');
  await expect(page.locator('#cartao-fontes')).not.toContainText('demonstração');
  await criarBloco(page, 'Como solicitar', d.link);
  const bloco = blocoDa(page, 'Como solicitar');
  await expect(bloco).toContainText('Situação: Em elaboração');
  await expect(fonteDa(page, d.link)).toContainText('Situação: Revisão pendente');
  await expect(page.locator('#situacao-resumo')).toHaveText('3 pendências para concluir. Informações aceitas: 0. 1 documento ou link ainda não é usado por nenhuma informação; isso não impede a conclusão.');
  await expect(page.getByRole('button', { name: 'Aceitar informação: Como solicitar', exact: true })).toBeDisabled();
  await expect(bloco).toContainText(`Para aceitar esta informação, marque antes como revisado: "${d.link}".`);
  await expect(page.locator('#pendencias')).toContainText('Inclua e aceite pelo menos uma informação para concluir a revisão.');
  await expect(page.locator('#pendencias')).toContainText('A informação "Como solicitar" ainda não foi aceita nem excluída.');
  await expect(page.locator('#pendencias')).toContainText(`O documento ou link "${d.link}" ainda não foi revisado.`);
  await expect(botao(page, 'Concluir revisão')).toBeHidden();
  await expect(page.getByRole('button', { name: /publicar/i })).toHaveCount(0);
  expect(await page.locator('body').innerText()).not.toMatch(TECNICO);
});

test('2. revisar fonte, editar antes de aceitar, aceitar, reabrir para correção e aceitar de novo', async ({ page }) => {
  const enviados = observarPosts(page);
  const d = await criarServicoComFontes(page, 'Serviço Rev Eta');
  await irParaRevisao(page);
  await criarBloco(page, 'Prazos', d.link);
  await revisarFonte(page, d.link);
  await expect(page.getByRole('button', { name: 'Aceitar informação: Prazos', exact: true })).toBeEnabled();
  // editar antes de aceitar
  await page.getByRole('button', { name: 'Editar a informação Prazos', exact: true }).click();
  await expect(page.locator('#titulo-form')).toHaveText('Editar informação');
  await page.getByLabel('Tema da informação', { exact: true }).fill('Prazos revisados');
  await page.locator('#bloco-enviar').click();
  await page.getByRole('button', { name: 'Confirmar e salvar', exact: true }).click();
  await expect(status(page)).toContainText('Informação alterada.');
  await expect(blocoDa(page, 'Prazos revisados')).toBeVisible();
  await aceitar(page, 'Prazos revisados');
  await expect(page.getByRole('button', { name: /^Editar a informação/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^Excluir informação/ })).toHaveCount(0);
  await expect(page.locator('#painel-situacao, #servico-situacao').first()).toBeVisible();
  // reabrir para correção
  await page.getByRole('button', { name: 'Reabrir para correção: Prazos revisados', exact: true }).click();
  await expect(status(page)).toContainText('Informação reaberta para correção');
  await expect(blocoDa(page, 'Prazos revisados')).toContainText('Situação: Em elaboração');
  await expect(page.getByRole('button', { name: 'Editar a informação Prazos revisados', exact: true })).toBeEnabled();
  await aceitar(page, 'Prazos revisados');
  for (const final of ['/revisao/fontes', '/blocos/aceitar', '/blocos/reabrir']) {
    for (const p of posts(enviados, final)) {
      expect(p.tipo).toContain('application/json');
      expect(typeof JSON.parse(p.texto).revisao, `${final} leva a revisão atual`).toBe('string');
    }
  }
  expect(posts(enviados, '/blocos/aceitar')).toHaveLength(2);
  expect(await page.locator('body').innerText()).not.toMatch(TECNICO);
});

test('3. descartar informação em elaboração exige confirmação própria', async ({ page }) => {
  const enviados = observarPosts(page);
  const d = await criarServicoComFontes(page, 'Serviço Rev Teta');
  await irParaRevisao(page);
  await criarBloco(page, 'Informação para manter', d.link);
  await criarBloco(page, 'Informação para descartar', d.link);
  const gatilho = page.getByRole('button', { name: 'Excluir informação: Informação para descartar', exact: true });
  await gatilho.click();
  const dialogo = page.getByRole('dialog');
  await expect(dialogo).toContainText('Excluir esta informação?');
  await expect(dialogo).toContainText('Informação para descartar');
  await page.getByRole('button', { name: 'Voltar', exact: true }).click();
  await expect(gatilho).toBeFocused();
  await expect(blocoDa(page, 'Informação para descartar')).toBeVisible();
  expect(posts(enviados, '/blocos/rejeitar')).toHaveLength(0);
  await gatilho.click();
  await page.getByRole('button', { name: 'Confirmar exclusão', exact: true }).click();
  await expect(status(page)).toContainText('Informação excluída.');
  await expect(blocoDa(page, 'Informação para manter')).toBeFocused();
  await expect(blocoDa(page, 'Informação para descartar')).toHaveCount(0);
  await expect(blocoDa(page, 'Informação para manter')).toBeVisible();
  expect(posts(enviados, '/blocos/rejeitar')).toHaveLength(1);
});

test('4. pendências impedem a conclusão e nada é concluído', async ({ page }) => {
  const enviados = observarPosts(page);
  const d = await criarServicoComFontes(page, 'Serviço Rev Iota');
  await irParaRevisao(page);
  await criarBloco(page, 'Etapas do pedido', d.link);
  // informação em elaboração e fonte usada sem revisão: a conclusão fica indisponível
  await expect(page.locator('#pendencias')).toContainText(`O documento ou link "${d.link}" ainda não foi revisado.`);
  await expect(page.locator('#pendencias')).toContainText('A informação "Etapas do pedido" ainda não foi aceita nem excluída.');
  await expect(botao(page, 'Concluir revisão')).toBeHidden();
  await revisarFonte(page, d.link);
  await expect(page.locator('#pendencias-resumo')).toContainText('Faltam resolver 2 pendências');
  await expect(botao(page, 'Concluir revisão')).toBeHidden();
  expect(posts(enviados, '/concluir')).toHaveLength(0);
  await aceitar(page, 'Etapas do pedido');
  await expect(page.locator('#pendencias')).toBeEmpty();
  await expect(page.locator('#pendencias-resumo')).toContainText('Nenhuma pendência');
  await expect(botao(page, 'Concluir revisão')).toBeVisible();
  await expect(page.locator('#conclusao-explicacao')).toContainText('fica bloqueado para edição');
});

test('5. conclusão válida, versão congelada sem ações nem publicação e nova versão enviando {}', async ({ page }) => {
  const enviados = observarPosts(page);
  const d = await criarServicoComFontes(page, 'Serviço Rev Kapa');
  await irParaRevisao(page);
  await criarBloco(page, 'Documentos exigidos', d.link);
  await revisarFonte(page, d.link);
  await revisarFonte(page, d.texto);
  await aceitar(page, 'Documentos exigidos');
  const concluir = botao(page, 'Concluir revisão');
  await concluir.click();
  const dialogo = page.getByRole('dialog');
  await expect(dialogo).toContainText('Depois de concluir, esta versão não poderá mais ser editada. Para fazer novas alterações, será necessário criar uma nova versão.');
  await page.getByRole('button', { name: 'Voltar', exact: true }).click();
  await expect(concluir).toBeFocused();
  expect(posts(enviados, '/concluir')).toHaveLength(0);
  await concluir.click();
  await page.getByRole('button', { name: 'Confirmar conclusão', exact: true }).click();
  await expect(status(page)).toContainText('Revisão concluída.');
  await expect(status(page)).toBeFocused();
  expect(posts(enviados, '/concluir')).toHaveLength(1);
  expect(JSON.parse(posts(enviados, '/concluir')[0].texto)).toEqual({ revisao: expect.any(String) });
  // congelada: sem ações de edição, revisão, aceite, descarte, reabertura, cadastro nem publicação
  await expect(page.locator('#servico-situacao')).toContainText('Pronto para publicar');
  await expect(page.locator('#situacao-edicao')).toContainText('bloqueados');
  await expect(page.locator('#cartao-form')).toBeHidden();
  for (const nome of [/^Editar/, /^Aceitar/, /^Excluir/, /^Reabrir/, /^Marcar como revisado/, /^Concluir revisão$/, /^Conferir antes/, /publicar/i]) await expect(page.getByRole('button', { name: nome })).toHaveCount(0);
  await expect(page.locator('#blocos')).toContainText('Situação: Aceita');
  expect(await page.locator('body').innerText()).not.toMatch(TECNICO);
  // o painel do serviço também mostra "Pronto para publicar" e esconde o cadastro
  await page.goto('/admin/');
  await page.getByRole('button', { name: ENTRAR }).click();
  await page.locator('#busca-servico').fill(d.nome);
  await page.getByRole('button', { name: new RegExp(d.nome) }).first().click();
  await expect(page.locator('#painel-situacao-texto')).toContainText('Pronto para publicar');
  await expect(page.locator('#painel-situacao')).not.toContainText('Revisão pendente');
  await expect(page.locator('#grupo-adicionar')).toBeHidden();
  await expect(botao(page, 'Texto')).toBeHidden();
  await expect(page.getByRole('button', { name: /publicar/i })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Criar nova versão para editar' })).toBeVisible();
  // nova versão: corpo exatamente {} e Content-Type JSON; a nova versão é a atual, em elaboração, e nada é publicado
  const pedido = page.waitForRequest((r) => r.method() === 'POST' && r.url().endsWith('/nova-versao'));
  await page.getByRole('button', { name: 'Criar nova versão para editar' }).click();
  const req = await pedido;
  expect(req.postData()).toBe('{}');
  expect(req.headers()['content-type']).toContain('application/json');
  await expect(status(page)).toContainText('Nova versão criada. Ela está em elaboração e nada foi publicado.');
  await expect(page.locator('#painel-situacao-texto')).toContainText('Situação: Em elaboração');
  await expect(page.locator('#painel-situacao')).toContainText('Revisão pendente');
  await expect(botao(page, 'Texto')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Criar nova versão para editar' })).toBeHidden();
  await irParaRevisao(page);
  await expect(page.locator('#servico-situacao')).toContainText('Versão 2');
  await expect(page.locator('#servico-situacao')).toContainText('Em elaboração');
  await expect(page.locator('#servico-situacao')).toContainText('Não publicada');
  await expect(page.getByRole('button', { name: 'Incluir informação', exact: true })).toBeVisible();
});

test('6. conflito de revisão: outra aba muda o conteúdo, a mensagem aparece e os dados são recarregados', async ({ page, context }) => {
  const d = await criarServicoComFontes(page, 'Serviço Rev Lambda');
  await irParaRevisao(page);
  const outra = await context.newPage();
  await outra.goto(page.url());
  await expect(outra.locator('#servico-situacao')).toBeVisible();
  await outra.getByRole('button', { name: `Marcar como revisado: ${d.link}`, exact: true }).click();
  await expect(outra.locator('#status')).toContainText('Documento ou link marcado como revisado.');
  await outra.close();
  // a primeira aba ainda tem a revisão antiga
  await page.getByRole('button', { name: `Marcar como revisado: ${d.texto}`, exact: true }).click();
  await expect(status(page)).toContainText('O conteúdo mudou. Os dados foram atualizados; confira e tente de novo.');
  await expect(status(page)).toHaveAttribute('data-tipo', 'erro');
  await expect(status(page)).toBeFocused();
  await expect(fonteDa(page, d.link)).toContainText('Situação: Revisado');
  await expect(fonteDa(page, d.texto)).toContainText('Situação: Ainda não revisada');
  expect(await page.locator('body').innerText()).not.toMatch(TECNICO);
  await revisarFonte(page, d.texto);
});

test('7. clique duplo envia uma única ação de revisão', async ({ page }) => {
  const enviados = observarPosts(page);
  const d = await criarServicoComFontes(page, 'Serviço Rev Mi');
  await irParaRevisao(page);
  await page.getByRole('button', { name: `Marcar como revisado: ${d.link}`, exact: true }).dblclick();
  await expect(status(page)).toContainText('Documento ou link marcado como revisado.');
  expect(posts(enviados, '/revisao/fontes')).toHaveLength(1);
  await criarBloco(page, 'Clique duplo', d.link);
  await page.getByRole('button', { name: 'Aceitar informação: Clique duplo', exact: true }).dblclick();
  await expect(status(page)).toContainText('Informação aceita.');
  expect(posts(enviados, '/blocos/aceitar')).toHaveLength(1);
});

test('8. teclado: ações por Enter, foco na mensagem, diálogo com Esc e foco devolvido', async ({ page }) => {
  const d = await criarServicoComFontes(page, 'Serviço Rev Ni');
  await irParaRevisao(page);
  await criarBloco(page, 'Via teclado', d.link);
  const marcar = page.getByRole('button', { name: `Marcar como revisado: ${d.link}`, exact: true });
  await marcar.focus();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: `Editar fonte: ${d.link}`, exact: true })).toBeFocused();
  expect(await page.evaluate(() => { const c = getComputedStyle(document.activeElement); return c.outlineStyle !== 'none' && parseFloat(c.outlineWidth) > 0; })).toBe(true);
  await marcar.focus();
  await page.keyboard.press('Enter');
  await expect(status(page)).toContainText('Documento ou link marcado como revisado.');
  await expect(fonteDa(page, d.link)).toBeFocused();
  const descartar = page.getByRole('button', { name: 'Excluir informação: Via teclado', exact: true });
  await descartar.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Voltar', exact: true })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Confirmar exclusão', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(blocoDa(page, 'Via teclado')).toBeVisible();
  await expect(descartar).toBeFocused();
});

test('9. 390 px e texto a 150% e 200%: sem rolagem horizontal, nada cortado e alvos de 44 px', async ({ page }) => {
  const d = await criarServicoComFontes(page, 'Serviço Rev Xi com um nome bem comprido para testar a quebra de linha em tela pequena');
  await page.setViewportSize({ width: 390, height: 844 });
  const conferir = async (onde) => {
    const r = await page.evaluate(() => {
      const largura = document.documentElement.clientWidth;
      const visivel = (e) => { const b = e.getBoundingClientRect(); const cs = getComputedStyle(e); return b.width > 0 && b.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none'; };
      const fora = []; const cortados = []; const pequenos = [];
      for (const e of document.querySelectorAll('body *')) if (visivel(e)) { const b = e.getBoundingClientRect(); if (b.right > largura + 0.5 || b.left < -0.5) fora.push(`${e.tagName}#${e.id}`); }
      for (const e of document.querySelectorAll('.cartao, h1, h2, h3, button, a.botao, label, legend, p, li')) if (visivel(e) && e.scrollWidth > e.clientWidth + 1) cortados.push(`${e.tagName}#${e.id}.${e.className}`);
      for (const e of document.querySelectorAll('button, a.botao, select, input[type=text], input[type=search]')) if (visivel(e) && e.getBoundingClientRect().height < 43.5) pequenos.push(`${e.tagName}#${e.id}`);
      return { sw: document.documentElement.scrollWidth, cw: largura, fora: fora.slice(0, 5), cortados: cortados.slice(0, 5), pequenos: pequenos.slice(0, 5) };
    });
    expect(r.sw, `${onde}: rolagem horizontal`).toBeLessThanOrEqual(r.cw);
    expect(r.fora, `${onde}: fora da tela`).toEqual([]);
    expect(r.cortados, `${onde}: texto cortado`).toEqual([]);
    expect(r.pequenos, `${onde}: alvos pequenos`).toEqual([]);
  };
  await conferir('painel do serviço');
  await irParaRevisao(page);
  await criarBloco(page, 'Título muito longo '.repeat(6), d.link);
  for (const escala of ['100%', '150%', '200%']) {
    if (escala !== '100%') await page.addStyleTag({ content: `html{font-size:${escala} !important}` });
    await conferir(`conteúdo a ${escala}`);
  }
  await page.getByRole('button', { name: 'Incluir informação', exact: true }).click();
  await page.getByRole('checkbox', { name: new RegExp(`^${d.link}`) }).check();
  await conferir('formulário aberto a 200%');
  await page.getByRole('button', { name: 'Cancelar', exact: true }).first().click();
  await page.getByRole('button', { name: /^Excluir informação/ }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await conferir('diálogo de descarte a 200%');
  expect(await semRolagem(page)).toBe(true);
  await page.keyboard.press('Escape');
  await page.goto(page.url());
  await expect(page.locator('#servico-situacao')).toBeVisible();
  await expect(page.locator('#botao-concluir')).toBeHidden();
});

test('11. cadastro de texto sem descrição nem órgão: a requisição real leva só título e texto', async ({ page }) => {
  const enviados = observarPosts(page);
  await entrar(page);
  await botao(page, 'Novo serviço').click();
  await page.locator('#novo-nome').fill('Serviço Rev Omicron');
  await page.locator('#novo-tema').fill(TEMA);
  await botao(page, 'Criar serviço').click();
  await expect(page.getByRole('heading', { level: 2, name: 'Serviço Rev Omicron' })).toBeVisible();
  await botao(page, 'Texto').click();
  const painel = page.locator('#painel-texto');
  await expect(painel.getByLabel(/Descrição/)).toHaveCount(0);
  await expect(painel.getByLabel(/Órgão/)).toHaveCount(0);
  await expect(painel.locator('input, textarea')).toHaveCount(2);
  await painel.locator('#texto-titulo').fill('Somente título e texto');
  await painel.locator('#texto-texto').fill('Orientação de teste escrita só com título e texto.');
  await botao(page, 'Incluir texto').click();
  await expect(status(page)).toContainText('Texto adicionado');
  const envio = posts(enviados, '/entradas-texto');
  expect(envio).toHaveLength(1);
  expect(Object.keys(JSON.parse(envio[0].texto)).sort()).toEqual(['texto', 'titulo']);
  await botao(page, 'Link').click();
  await expect(page.locator('#painel-link').getByLabel('Órgão que publicou o conteúdo')).toBeVisible();
  await expect(page.locator('#painel-link').getByLabel('Órgão responsável')).toHaveCount(0);
});

test('12. adicionar informação tem só Texto e Link; dentro de Link: endereço novo ou link já cadastrado', async ({ page }) => {
  const enviados = observarPosts(page);
  await entrar(page);
  await botao(page, 'Novo serviço').click();
  await page.locator('#novo-nome').fill('Serviço Rev Rô');
  await page.locator('#novo-tema').fill(TEMA);
  await botao(page, 'Criar serviço').click();
  await expect(page.getByRole('heading', { level: 2, name: 'Serviço Rev Rô' })).toBeVisible();
  await expect(page.locator('#grupo-adicionar').getByRole('button')).toHaveText(['Texto', 'Link']);
  await expect(page.getByRole('button', { name: /Usar link já cadastrado$/ })).toHaveCount(0);
  await botao(page, 'Link').click();
  await expect(page.locator('#painel-link')).toContainText('Você pode informar um novo endereço ou reutilizar um link já cadastrado.');
  // reutilizar um link já cadastrado em outro serviço, na mesma opção
  await page.locator('#existente-consulta').fill('manual');
  await botao(page, 'Pesquisar').click();
  await expect(page.locator('#existente-resumo')).toContainText(/encontrados?./);
  await expect(page.locator('#existente-lista li').first()).toContainText(/manual/i);
  const usar = page.locator('#existente-lista').getByRole('button', { name: /^Usar este link/ }).first();
  await expect(usar).toBeEnabled();
  const nomeDoLink = (await usar.getAttribute('aria-label')).replace(/^Usar este link: /, '');
  await usar.click();
  await expect(status(page)).toContainText('Link copiado para este serviço');
  const reuso = posts(enviados, '/links-existentes');
  expect(reuso).toHaveLength(1);
  expect(Object.keys(JSON.parse(reuso[0].texto)).sort()).toEqual(['fonteId', 'servicoId']);
  await expect(page.locator('#informacoes-lista')).toContainText(nomeDoLink);
  await expect(page.locator('#painel-resumo')).toContainText('pendência');
  // endereço novo, também dentro de Link
  await botao(page, 'Link').click();
  await page.locator('#link-titulo').fill('Endereço novo de Rô');
  await page.locator('#link-url').fill('https://exemplo.test/servico-rev-ro-novo');
  await page.locator('#link-orgao').fill('Órgão de Teste');
  await page.locator('#link-descricao').fill('Página nova.');
  await botao(page, 'Incluir link').click();
  await expect(status(page)).toContainText('Link adicionado');
  await expect(page.locator('#informacoes-lista')).toContainText('Endereço novo de Rô');
  await expect(page.locator('#informacoes-lista li')).toHaveCount(2);
});

test('13. a revisão abre compacta, o painel e a página dizem o mesmo e Voltar reabre o mesmo serviço', async ({ page }) => {
  const d = await criarServicoComFontes(page, 'Serviço Rev Sigma');
  await irParaRevisao(page);
  await expect(page.locator('#servico-compacto')).toBeVisible();
  await expect(page.locator('#selecao-completa')).toBeHidden();
  await expect(page.locator('#assunto')).toBeHidden();
  await criarBloco(page, 'Informação do retorno', d.link);
  await revisarFonte(page, d.link);
  await aceitar(page, 'Informação do retorno');
  const { resumo } = await conferirCoerencia(page);
  const idDoServico = new URL(page.url()).searchParams.get('servico');
  await expect(page.getByRole('link', { name: 'Voltar para Gestão de conteúdo' })).toHaveAttribute('href', `../?servico=${idDoServico}`);
  await page.getByRole('link', { name: 'Voltar para Gestão de conteúdo' }).click();
  await expect(page).toHaveURL(new RegExp(`/admin/\\?servico=${idDoServico}$`));
  await page.getByRole('button', { name: ENTRAR }).click();
  await expect(page.getByRole('heading', { level: 2, name: d.nome })).toBeVisible();
  await expect(page.locator('#painel-resumo')).toHaveText(resumo);
  await expect(page.locator('#painel-situacao-texto')).toContainText('Situação: Em elaboração');
  expect(await page.locator('body').innerText()).not.toContain(idDoServico);
  await botao(page, 'Voltar para os serviços').click();
  await expect(page).not.toHaveURL(/servico=/);
  // trocar de serviço só quando a pessoa pede
  await page.goBack();
  await page.goto(`/admin/conteudo/?servico=${idDoServico}`);
  await expect(page.locator('#servico-compacto')).toBeVisible();
  await page.getByRole('button', { name: 'Trocar de serviço', exact: true }).click();
  await expect(page.locator('#assunto')).toBeVisible();
  await expect(page.locator('#assunto')).toBeFocused();
});

test('14. depois de cada ação a lista, a situação e as contagens são atualizadas na hora', async ({ page }) => {
  const d = await criarServicoComFontes(page, 'Serviço Rev Tau');
  await irParaRevisao(page);
  const antes = await page.locator('#situacao-resumo').innerText();
  await criarBloco(page, 'Primeira orientação', d.link);
  const depoisDeCriar = await page.locator('#situacao-resumo').innerText();
  expect(depoisDeCriar).not.toBe(antes);
  await revisarFonte(page, d.link);
  await aceitar(page, 'Primeira orientação');
  await expect(page.locator('#situacao-resumo')).toContainText('Nenhuma pendência para concluir. Informações aceitas: 1.');
  await expect(page.locator('#pendencias-resumo')).toContainText('Nenhuma pendência');
  await expect(page.locator('#situacao-selo')).toBeHidden();
  await page.getByRole('button', { name: 'Reabrir para correção: Primeira orientação', exact: true }).click();
  await expect(status(page)).toContainText('reaberta');
  await expect(blocoDa(page, 'Primeira orientação')).toBeFocused();
  const aposReabrir = await conferirCoerencia(page);
  expect(aposReabrir.n).toBeGreaterThan(0);
  await expect(page.locator('#servico-situacao')).toContainText('Revisão pendente');
  await page.getByRole('button', { name: 'Excluir informação: Primeira orientação', exact: true }).click();
  await page.getByRole('button', { name: 'Confirmar exclusão', exact: true }).click();
  await expect(status(page)).toContainText('Informação excluída.');
  await conferirCoerencia(page);
  await expect(page.locator('#blocos')).toContainText('Nenhuma orientação foi cadastrada');
});

test('15. texto com contato institucional é aceito e salvo; e-mail externo é recusado sem repetir o endereço', async ({ page }) => {
  const enviados = observarPosts(page);
  const institucional = ['suimis', 'sema.mt.gov.br'].join('@'); // montado em execução: o repositório não guarda e-mail
  const externo = ['pessoa.externa', 'exemplo.test'].join('@');
  await entrar(page);
  await botao(page, 'Novo serviço').click();
  await page.locator('#novo-nome').fill('Serviço Rev Upsilon');
  await page.locator('#novo-tema').fill(TEMA);
  await botao(page, 'Criar serviço').click();
  await expect(page.getByRole('heading', { level: 2, name: 'Serviço Rev Upsilon' })).toBeVisible();
  await botao(page, 'Texto').click();
  // e-mail externo: recusado antes do envio, mensagem curta, sem o endereço
  await page.locator('#texto-titulo').fill('Contato externo');
  await page.locator('#texto-texto').fill(`Para dúvidas escreva para ${externo}.`);
  await botao(page, 'Incluir texto').click();
  const erro = page.locator('#texto-texto-erro');
  await expect(erro).toBeVisible();
  await expect(erro).toContainText('e-mail');
  expect(await erro.innerText()).not.toContain(externo);
  expect(await erro.innerText()).not.toContain('@');
  expect(await page.locator('#status').innerText()).not.toContain(externo);
  expect(posts(enviados, '/entradas-texto')).toHaveLength(0);
  // contato institucional: aceito e salvo
  await page.locator('#texto-titulo').fill('Contato institucional');
  await page.locator('#texto-texto').fill(`Para dúvidas escreva para ${institucional}.`);
  await botao(page, 'Incluir texto').click();
  await expect(status(page)).toContainText('Texto adicionado');
  expect(posts(enviados, '/entradas-texto')).toHaveLength(1);
  await expect(page.locator('#informacoes-lista')).toContainText('Contato institucional');
  await expect(page.locator('#informacoes-lista')).toContainText(institucional);
});

test('10. nenhuma publicação: nada publicado na cópia e a base real continua intacta', async ({ page }) => {
  const copia = path.join(process.env.SEMA_REAL_COPIA, 'services');
  const registro = JSON.parse(fs.readFileSync(path.join(copia, 'registry.json'), 'utf8'));
  const servicos = Array.isArray(registro) ? registro : (registro.servicos ?? []);
  expect(servicos.length).toBeGreaterThan(0);
  for (const s of servicos) expect(s.versaoPublicadaId ?? null, `serviço ${s.id} sem versão publicada`).toBeNull();
  const achados = [];
  const varrer = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const caminho = path.join(dir, e.name);
      if (e.isDirectory()) varrer(caminho);
      else if (e.name.endsWith('.json') && /"publicado"\s*:\s*true/.test(fs.readFileSync(caminho, 'utf8'))) achados.push(path.relative(copia, caminho));
    }
  };
  varrer(copia);
  expect(achados, 'nenhum arquivo com "publicado": true').toEqual([]);
  await page.goto('/admin/saude/');
  await expect(page.getByRole('heading', { level: 1, name: /Saúde do sistema/ })).toBeVisible();
});
