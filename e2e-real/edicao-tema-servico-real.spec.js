// Teste real de editar tema e serviço (Passo 5B3b): sem page.route e sem mocks. O servidor é o Vite de verdade (veja preparar.js),
// com a base de serviços copiada para uma pasta temporária. Cada teste cria os próprios serviços e temas pela interface (/admin/);
// a revisão, a aceitação e a conclusão de informações usam /admin/conteudo/. Nada aqui publica nem toca na base real.
import fs from 'node:fs';
import path from 'node:path';
import { test, expect } from '@playwright/test';

const ACESSAR = 'Acessar administração';
const TECNICO = /rascunho|em_validacao|validado_materialmente|autorizado|revisao_divergente|versao_congelada|ja_existe|[0-9a-f]{64}|X-Admin-Token|\bbc-[0-9a-f]{6,}|assuntoId|statusValidacao/i;
const botao = (page, nome) => page.getByRole('button', { name: nome, exact: true });
const status = (page) => page.locator('#status');
const edicao = (page) => page.locator('#dialogo-edicao');
const impacto = (page) => page.locator('#dialogo-impacto');
const blocoDa = (page, titulo) => page.locator('#blocos li.bloco').filter({ hasText: titulo });
const fonteDa = (page, titulo) => page.locator('#fontes-revisao li.bloco').filter({ hasText: titulo });

function observar(page) {
  const lista = [];
  page.on('request', (r) => {
    if (r.method() !== 'GET' && r.url().includes('/__admin/')) lista.push({ metodo: r.method(), caminho: new URL(r.url()).pathname, texto: r.postData(), tipo: r.headers()['content-type'] });
  });
  return lista;
}
const so = (lista, metodo, final) => lista.filter((x) => x.metodo === metodo && x.caminho.includes(final));

async function acessar(page) {
  await page.goto('/admin/');
  await page.getByRole('button', { name: ACESSAR }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'Serviços' })).toBeVisible();
}

/** Serviço novo pela interface, no tema informado (criado se não existir). Termina no painel do serviço em /admin/. */
async function criarServico(page, nome, tema, { link = null } = {}) {
  await acessar(page);
  await botao(page, 'Novo serviço').click();
  await page.locator('#novo-nome').fill(nome);
  await page.locator('#novo-tema').fill(tema);
  await botao(page, 'Criar serviço').click();
  await expect(page.getByRole('heading', { level: 2, name: nome })).toBeVisible();
  if (link !== null) {
    await botao(page, 'Link').click();
    await page.locator('#link-titulo').fill(link);
    await page.locator('#link-url').fill(`https://exemplo.test/${nome.toLowerCase().replace(/[^a-z]+/g, '-')}`);
    await page.locator('#link-orgao').fill('Órgão de Teste');
    await page.locator('#link-descricao').fill('Página com as orientações.');
    await botao(page, 'Incluir link').click();
    await expect(page.locator('#status')).toContainText('Link adicionado');
  }
}

async function abrirEdicaoDoServico(page) {
  await botao(page, 'Editar nome e tema').click();
  await expect(edicao(page)).toBeVisible();
  await expect(page.locator('#ed-nome')).toBeFocused();
}

async function irParaConteudo(page) {
  await page.getByRole('link', { name: 'Revisar informações' }).click();
  await expect(page).toHaveURL(/\/admin\/conteudo\/\?servico=/);
  await expect(page.locator('#servico-situacao')).toBeVisible();
  await expect(page.locator('#fontes-revisao')).toHaveAttribute('aria-busy', 'false');
}

async function criarBlocoAceito(page, titulo, fonte) {
  await botao(page, 'Incluir informação').click();
  await page.getByLabel('Tema da informação', { exact: true }).fill(titulo);
  await page.getByLabel('O que o chatbot deve informar ao cidadão?').fill(`Orientação de teste: ${titulo}.`);
  await page.getByRole('checkbox', { name: new RegExp(`^${fonte}`) }).check();
  await page.getByLabel(new RegExp(`Onde esta informação aparece na fonte\\? \\(${fonte}\\)`)).fill('Seção 1');
  await page.locator('#bloco-enviar').click();
  await botao(page, 'Confirmar e salvar').click();
  await expect(status(page)).toContainText('Informação salva.');
  await page.locator('#aba-fontes').click();
  await botao(page, `Marcar como revisado: ${fonte}`).click();
  await expect(fonteDa(page, fonte)).toContainText('Situação: Revisado');
  await page.locator('#aba-informacoes').click();
  await botao(page, `Aceitar informação: ${titulo}`).click();
  await expect(blocoDa(page, titulo)).toContainText('Situação: Aceita');
}

async function voltarParaGestao(page) {
  await page.getByRole('navigation', { name: 'Seções da administração' }).getByRole('link', { name: 'Gestão de conteúdo' }).click();
  await page.getByRole('button', { name: ACESSAR }).click();
}

test('1. editar o nome do serviço: formulário só com nome e tema, só o que mudou é enviado, título atualizado e foco devolvido', async ({ page }) => {
  const enviados = observar(page);
  await criarServico(page, 'Serviço Edição Um', 'Tema Edição Um');
  await abrirEdicaoDoServico(page);
  await expect(edicao(page).getByRole('heading', { level: 2 })).toHaveText('Editar nome e tema');
  await expect(page.locator('#ed-nome')).toHaveValue('Serviço Edição Um');
  await expect(page.locator('#ed-tema')).toHaveValue(/.+/);
  await expect(edicao(page).locator('input, select, textarea')).toHaveCount(2);
  expect(await edicao(page).innerText()).not.toMatch(/sigla|identificador|termos|hash/i);
  await page.locator('#ed-nome').fill('Serviço Edição Um Renomeado');
  await botao(page, 'Salvar').click();
  await expect(status(page)).toContainText('Serviço alterado. Nada foi publicado.');
  await expect(edicao(page)).toBeHidden();
  await expect(impacto(page)).toBeHidden();
  await expect(page.getByRole('heading', { level: 2, name: 'Serviço Edição Um Renomeado' })).toBeVisible();
  await expect(botao(page, 'Editar nome e tema')).toBeFocused();
  const patch = so(enviados, 'PATCH', '/edicao');
  expect(patch).toHaveLength(1);
  expect(patch[0].tipo).toContain('application/json');
  expect(Object.keys(JSON.parse(patch[0].texto)).sort()).toEqual(['nome', 'revisao']);
  expect(await page.locator('body').innerText()).not.toMatch(TECNICO);
  // a lista também mostra o novo nome
  await botao(page, 'Voltar para os serviços').click();
  await expect(page.locator('#lista-servicos')).toContainText('Serviço Edição Um Renomeado');
});

test('2. validação junto ao campo: vazio, repetido e sem alteração não enviam nada; Cancelar devolve o foco', async ({ page }) => {
  const enviados = observar(page);
  await criarServico(page, 'Serviço Edição Dois A', 'Tema Edição Dois');
  await botao(page, 'Voltar para os serviços').click();
  await criarServico(page, 'Serviço Edição Dois B', 'Tema Edição Dois');
  await abrirEdicaoDoServico(page);
  await page.locator('#ed-nome').fill('');
  await botao(page, 'Salvar').click();
  await expect(page.locator('#ed-nome-erro')).toContainText('Escreva o nome do serviço.');
  await expect(page.locator('#ed-nome')).toBeFocused();
  await expect(page.locator('#ed-nome')).toHaveAttribute('aria-invalid', 'true');
  await page.locator('#ed-nome').fill('serviço edição dois a');
  await botao(page, 'Salvar').click();
  await expect(page.locator('#ed-nome-erro')).toContainText('Já existe um serviço com este nome.');
  await page.locator('#ed-nome').fill('Serviço Edição Dois B');
  await botao(page, 'Salvar').click();
  await expect(page.locator('#ed-mensagem')).toContainText('Nenhuma alteração para salvar.');
  expect(so(enviados, 'PATCH', '/edicao')).toHaveLength(0);
  await expect(edicao(page)).toBeVisible();
  await botao(page, 'Cancelar').click();
  await expect(edicao(page)).toBeHidden();
  await expect(botao(page, 'Editar nome e tema')).toBeFocused();
  expect(so(enviados, 'PATCH', '/edicao')).toHaveLength(0);
});

test('3. mudar o serviço de tema: o impacto aparece antes, Voltar não grava e Confirmar grava uma única vez', async ({ page }) => {
  const enviados = observar(page);
  await criarServico(page, 'Serviço Edição Três Destino', 'Tema Edição Três Destino');
  await botao(page, 'Voltar para os serviços').click();
  await criarServico(page, 'Serviço Edição Três', 'Tema Edição Três Origem');
  await abrirEdicaoDoServico(page);
  await page.locator('#ed-tema').selectOption({ label: 'Tema Edição Três Destino' });
  await botao(page, 'Salvar').click();
  await expect(impacto(page)).toBeVisible();
  await expect(impacto(page)).toContainText('O serviço sairá do tema "Tema Edição Três Origem" e passará para o tema "Tema Edição Três Destino".');
  await expect(botao(page, 'Voltar')).toBeFocused();
  expect(await impacto(page).innerText()).not.toMatch(TECNICO);
  expect(so(enviados, 'PATCH', '/edicao')).toHaveLength(0);
  await botao(page, 'Voltar').click();
  await expect(impacto(page)).toBeHidden();
  await expect(edicao(page)).toBeVisible();
  await expect(botao(page, 'Salvar')).toBeFocused();
  await botao(page, 'Salvar').click();
  await botao(page, 'Confirmar alteração').dblclick();
  await expect(status(page)).toContainText('Serviço alterado.');
  await expect(page.locator('#servico-tema')).toHaveText('Tema: Tema Edição Três Destino');
  await expect(botao(page, 'Editar nome e tema')).toBeFocused();
  const patch = so(enviados, 'PATCH', '/edicao');
  expect(patch).toHaveLength(1);
  const corpo = JSON.parse(patch[0].texto);
  expect(Object.keys(corpo).sort()).toEqual(['confirmado', 'revisao', 'temaId']);
  expect(corpo.confirmado).toBe(true);
  // reabrir mostra o tema novo já escolhido
  await abrirEdicaoDoServico(page);
  await expect(page.locator('#ed-tema option:checked')).toHaveText('Tema Edição Três Destino');
  await botao(page, 'Cancelar').click();
});

test('4. informação aceita: o impacto lista o título, a confirmação é exigida e a informação volta para Em elaboração', async ({ page }) => {
  await criarServico(page, 'Serviço Edição Quatro', 'Tema Edição Quatro', { link: 'Link Quatro' });
  await irParaConteudo(page);
  await criarBlocoAceito(page, 'Prazos de análise', 'Link Quatro');
  await voltarParaGestao(page);
  await expect(page.getByRole('heading', { level: 2, name: 'Serviço Edição Quatro' })).toBeVisible();
  await abrirEdicaoDoServico(page);
  await page.locator('#ed-nome').fill('Serviço Edição Quatro Revisado');
  await botao(page, 'Salvar').click();
  await expect(impacto(page)).toBeVisible();
  await expect(impacto(page)).toContainText('Esta informação aceita voltará para "Em elaboração"');
  await expect(page.locator('#im-lista')).toContainText('Prazos de análise');
  await botao(page, 'Confirmar alteração').click();
  await expect(status(page)).toContainText('1 informação voltou para Em elaboração.');
  await irParaConteudo(page);
  await expect(blocoDa(page, 'Prazos de análise')).toContainText('Situação: Em elaboração');
  await expect(botao(page, 'Concluir revisão')).toBeHidden();
});

test('5. versão concluída: Editar nome e tema fica indisponível com a orientação; na nova versão a edição vale', async ({ page }) => {
  const enviados = observar(page);
  await criarServico(page, 'Serviço Edição Cinco', 'Tema Edição Cinco', { link: 'Link Cinco' });
  await irParaConteudo(page);
  await criarBlocoAceito(page, 'Conteúdo congelado cinco', 'Link Cinco');
  await botao(page, 'Concluir revisão').click();
  await botao(page, 'Confirmar conclusão').click();
  await expect(status(page)).toContainText('Revisão concluída.');
  await voltarParaGestao(page);
  await expect(page.getByRole('heading', { level: 2, name: 'Serviço Edição Cinco' })).toBeVisible();
  await expect(botao(page, 'Editar nome e tema')).toBeDisabled();
  await expect(page.locator('#editar-servico-ajuda')).toContainText('Criar nova versão para editar');
  await botao(page, 'Criar nova versão para editar').click();
  await expect(status(page)).toContainText('Nova versão criada.');
  await expect(botao(page, 'Editar nome e tema')).toBeEnabled();
  await expect(page.locator('#editar-servico-ajuda')).toBeHidden();
  await abrirEdicaoDoServico(page);
  await page.locator('#ed-nome').fill('Serviço Edição Cinco Nova Versão');
  // Na nova versão nenhuma informação está aceita e o tema não muda: não há impacto a informar, então salva direto (sem confirmação).
  await botao(page, 'Salvar').click();
  await expect(status(page)).toContainText('Serviço alterado.');
  await expect(impacto(page)).toBeHidden();
  const patchNovaVersao = so(enviados, 'PATCH', '/edicao');
  expect(patchNovaVersao).toHaveLength(1);
  expect(Object.keys(JSON.parse(patchNovaVersao[0].texto)).sort()).toEqual(['nome', 'revisao']);
  await expect(page.getByRole('heading', { level: 2, name: 'Serviço Edição Cinco Nova Versão' })).toBeVisible();
});

test('6. editar tema: só o nome, impacto com os serviços, repetido recusado, foco no botão do tema e nada de identificadores', async ({ page }) => {
  const enviados = observar(page);
  await criarServico(page, 'Serviço Edição Seis', 'Tema Edição Seis');
  await botao(page, 'Voltar para os serviços').click();
  await criarServico(page, 'Serviço Edição Seis Outro', 'Tema Edição Seis Vizinho');
  await botao(page, 'Voltar para os serviços').click();
  const editar = botao(page, 'Editar o tema Tema Edição Seis');
  await editar.click();
  await expect(edicao(page)).toBeVisible();
  await expect(edicao(page).getByRole('heading', { level: 2 })).toHaveText('Editar tema');
  await expect(page.locator('#ed-grupo-tema')).toBeHidden();
  await expect(page.locator('#ed-nome')).toHaveValue('Tema Edição Seis');
  await expect(page.locator('#ed-nome')).toBeFocused();
  await expect(edicao(page).locator('input:visible, select:visible')).toHaveCount(1);
  await page.locator('#ed-nome').fill('tema edição seis vizinho');
  await botao(page, 'Salvar').click();
  await expect(page.locator('#ed-nome-erro')).toContainText('Já existe um tema com este nome.');
  expect(so(enviados, 'PATCH', '/temas/')).toHaveLength(0);
  await page.locator('#ed-nome').fill('Tema Edição Seis Renomeado');
  await botao(page, 'Salvar').click();
  await expect(impacto(page)).toBeVisible();
  await expect(impacto(page)).toContainText('O tema "Tema Edição Seis" passará a se chamar "Tema Edição Seis Renomeado".');
  await expect(page.locator('#im-lista')).toContainText('Serviço Edição Seis');
  expect(await impacto(page).innerText()).not.toMatch(TECNICO);
  expect(so(enviados, 'PATCH', '/temas/')).toHaveLength(0);
  await botao(page, 'Confirmar alteração').click();
  await expect(status(page)).toContainText('Tema alterado. O novo nome já aparece nos serviços que o usam.');
  await expect(botao(page, 'Editar o tema Tema Edição Seis Renomeado')).toBeFocused();
  await expect(page.locator('#lista-servicos')).toContainText('Tema: Tema Edição Seis Renomeado');
  const patch = so(enviados, 'PATCH', '/temas/');
  expect(patch).toHaveLength(1);
  expect(Object.keys(JSON.parse(patch[0].texto)).sort()).toEqual(['confirmado', 'nome', 'revisao']);
  expect(await page.locator('body').innerText()).not.toMatch(TECNICO);
});

test('7. teclado e clique duplo: Enter abre, Esc devolve o foco, Enter no campo salva, impacto pelo teclado e um único PATCH', async ({ page }) => {
  const enviados = observar(page);
  await criarServico(page, 'Serviço Edição Sete', 'Tema Edição Sete');
  await botao(page, 'Voltar para os serviços').click();
  const editar = botao(page, 'Editar o tema Tema Edição Sete');
  // Foco por script não ativa :focus-visible; um Shift+Tab e um Tab reais chegam ao mesmo botão pelo teclado.
  await editar.focus();
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Tab');
  await expect(editar).toBeFocused();
  expect(await page.evaluate(() => { const c = getComputedStyle(document.activeElement); return c.outlineStyle !== 'none' && parseFloat(c.outlineWidth) > 0; })).toBe(true);
  await page.keyboard.press('Enter');
  await expect(page.locator('#ed-nome')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(edicao(page)).toBeHidden();
  await expect(editar).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#ed-nome')).toBeFocused();
  await page.keyboard.press('Control+A');
  await page.keyboard.type('Tema Edição Sete Teclado');
  await page.keyboard.press('Enter'); // envio implícito do formulário
  await expect(impacto(page)).toBeVisible();
  await expect(botao(page, 'Voltar')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(impacto(page)).toBeHidden();
  await expect(botao(page, 'Salvar')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(botao(page, 'Voltar')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(botao(page, 'Confirmar alteração')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(status(page)).toContainText('Tema alterado.');
  await expect(botao(page, 'Editar o tema Tema Edição Sete Teclado')).toBeFocused();
  expect(so(enviados, 'PATCH', '/temas/')).toHaveLength(1);
});

test('8. 390 px e texto a 200%: janelas de edição e de impacto sem rolagem horizontal, sem cortes e com alvos de 44 px', async ({ page }) => {
  await criarServico(page, 'Serviço Edição Oito com um nome bem comprido para testar a quebra de linha em tela pequena', 'Tema Edição Oito com um nome comprido para conferir a quebra de linha nas telas pequenas');
  await page.setViewportSize({ width: 390, height: 844 });
  const conferir = async (onde) => {
    const r = await page.evaluate(() => {
      const largura = document.documentElement.clientWidth;
      const visivel = (e) => { const b = e.getBoundingClientRect(); const cs = getComputedStyle(e); return b.width > 0 && b.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none'; };
      const fora = []; const cortados = []; const pequenos = [];
      for (const e of document.querySelectorAll('body *')) if (visivel(e)) { const b = e.getBoundingClientRect(); if (b.right > largura + 0.5 || b.left < -0.5) fora.push(`${e.tagName}#${e.id}`); }
      for (const e of document.querySelectorAll('.cartao, h1, h2, h3, button, a.botao, label, legend, p, li, summary')) if (visivel(e) && e.scrollWidth > e.clientWidth + 1) cortados.push(`${e.tagName}#${e.id}`);
      for (const e of document.querySelectorAll('button, a.botao, select, input[type=text], summary')) if (visivel(e) && e.getBoundingClientRect().height < 43.5) pequenos.push(`${e.tagName}#${e.id}`);
      return { sw: document.documentElement.scrollWidth, cw: largura, fora: fora.slice(0, 5), cortados: cortados.slice(0, 5), pequenos: pequenos.slice(0, 5) };
    });
    expect(r.sw, `${onde}: rolagem horizontal`).toBeLessThanOrEqual(r.cw);
    expect(r.fora, `${onde}: fora da tela`).toEqual([]);
    expect(r.cortados, `${onde}: texto cortado`).toEqual([]);
    expect(r.pequenos, `${onde}: alvos pequenos`).toEqual([]);
  };
  for (const escala of ['100%', '200%']) {
    if (escala === '200%') await page.addStyleTag({ content: 'html{font-size:200% !important}' });
    await conferir(`painel do serviço a ${escala}`);
    await abrirEdicaoDoServico(page);
    await conferir(`edição do serviço a ${escala}`);
    await page.locator('#ed-nome').fill('Nome curto novo');
    await page.locator('#ed-tema').selectOption({ index: 0 });
    await botao(page, 'Salvar').click();
    if (await impacto(page).isVisible()) {
      await conferir(`impacto a ${escala}`);
      await botao(page, 'Voltar').click();
    }
    await botao(page, 'Cancelar').click();
    await expect(edicao(page)).toBeHidden();
  }
  await botao(page, 'Voltar para os serviços').click();
  await conferir('lista de temas a 200%');
  await page.getByRole('button', { name: /^Editar o tema Tema Edição Oito/ }).click();
  await conferir('edição do tema a 200%');
  await page.locator('#ed-nome').fill('Tema Oito Curto');
  await botao(page, 'Salvar').click();
  await expect(impacto(page)).toBeVisible();
  await conferir('impacto do tema a 200%');
  await botao(page, 'Voltar').click();
  await botao(page, 'Cancelar').click();
});

test('9. nenhuma publicação: nada publicado na cópia, o histórico privado de temas não guarda nomes e a base real continua intacta', async ({ page }) => {
  const copia = process.env.SEMA_REAL_COPIA;
  const servicos = path.join(copia, 'services');
  const registro = JSON.parse(fs.readFileSync(path.join(servicos, 'registry.json'), 'utf8'));
  for (const s of registro.servicos ?? []) expect(s.versaoPublicadaId ?? null, `serviço ${s.id} sem versão publicada`).toBeNull();
  const achados = [];
  const varrer = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const caminho = path.join(dir, e.name);
      if (e.isDirectory()) varrer(caminho);
      else if (e.name.endsWith('.json') && /"publicado"\s*:\s*true/.test(fs.readFileSync(caminho, 'utf8'))) achados.push(path.relative(servicos, caminho));
    }
  };
  varrer(servicos);
  expect(achados).toEqual([]);
  const historico = path.join(copia, 'data', 'admin-private', 'temas', 'historico.jsonl');
  if (fs.existsSync(historico)) {
    const texto = fs.readFileSync(historico, 'utf8');
    expect(texto).not.toMatch(/Renomeado|Teclado|Oito|Seis/);
    for (const linha of texto.split('\n').filter(Boolean)) expect(JSON.parse(linha)).toMatchObject({ acao: 'editar_tema', itemTipo: 'tema', resultado: 'ok' });
  }
  await page.goto('/admin/saude/');
  await expect(page.getByRole('heading', { level: 1, name: /Saúde do sistema/ })).toBeVisible();
});
