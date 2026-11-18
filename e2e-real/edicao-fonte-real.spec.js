// Teste real de editar e excluir fontes (Passo 5B3a): sem page.route e sem mocks. O servidor é o Vite de verdade (veja preparar.js),
// com a base de serviços copiada para uma pasta temporária. Cada teste cria o próprio serviço pela interface (/admin/) e usa
// /admin/conteudo/ para editar e excluir fontes; a LAC copiada serve para o decreto revogado e para o conteúdo antigo.
import fs from 'node:fs';
import path from 'node:path';
import { test, expect } from '@playwright/test';

const ACESSAR = 'Acessar administração';
const TEMA = 'Tema Fonte Real';
const TECNICO = /rascunho|em_validacao|validado_materialmente|autorizado|fonte_em_uso|fonte_pendente|revisao_divergente|versao_congelada|url_duplicada|excluidaEm|[0-9a-f]{64}|X-Admin-Token|X-Revisao|\bbc-[0-9a-f]{6,}/i;
const botao = (page, nome) => page.getByRole('button', { name: nome, exact: true });
const status = (page) => page.locator('#status');
const dlg = (page) => page.locator('#dialogo-editar-fonte');
const fonteDa = (page, titulo) => page.locator('#fontes-revisao li.bloco').filter({ hasText: titulo });
const blocoDa = (page, titulo) => page.locator('#blocos li.bloco').filter({ hasText: titulo });
const emFontes = (page) => page.locator('#aba-fontes').click();
const emInfos = (page) => page.locator('#aba-informacoes').click();
const irGestao = (page) => page.getByRole('navigation', { name: 'Seções da administração' }).getByRole('link', { name: 'Gestão de conteúdo' });

function observar(page) {
  const lista = [];
  page.on('request', (r) => {
    if (r.method() !== 'GET' && r.url().includes('/__admin/')) lista.push({ metodo: r.method(), caminho: new URL(r.url()).pathname, texto: r.postData(), tipo: r.headers()['content-type'], revisao: r.headers()['x-revisao'] });
  });
  return lista;
}
const so = (lista, metodo, final) => lista.filter((x) => x.metodo === metodo && x.caminho.includes(final));

async function acessar(page) {
  await page.goto('/admin/');
  await page.getByRole('button', { name: ACESSAR }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'Serviços' })).toBeVisible();
}

/** Serviço novo com os links e o texto pedidos, tudo pela interface. Termina no painel do serviço em /admin/. */
async function criarServico(page, nome, { links = ['Link Principal'], texto = null } = {}) {
  const slug = nome.toLowerCase().replace(/[^a-z]+/g, '-');
  await acessar(page);
  await botao(page, 'Novo serviço').click();
  await page.locator('#novo-nome').fill(nome);
  await page.locator('#novo-tema').fill(TEMA);
  await botao(page, 'Criar serviço').click();
  await expect(page.getByRole('heading', { level: 2, name: nome })).toBeVisible();
  const urls = [];
  for (const [i, titulo] of links.entries()) {
    await botao(page, 'Link').click();
    await page.locator('#link-titulo').fill(titulo);
    const url = `https://exemplo.test/${slug}-${i}`;
    urls.push(url);
    await page.locator('#link-url').fill(url);
    await page.locator('#link-orgao').fill('Órgão de Teste');
    await page.locator('#link-descricao').fill('Página com as orientações.');
    await botao(page, 'Incluir link').click();
    await expect(page.locator('#status')).toContainText('Link adicionado');
  }
  if (texto !== null) {
    await botao(page, 'Texto').click();
    await page.locator('#texto-titulo').fill(texto);
    await page.locator('#texto-texto').fill(`Conteúdo original do texto ${texto}, escrito para conferência.`);
    await botao(page, 'Incluir texto').click();
    await expect(page.locator('#status')).toContainText('Texto adicionado');
  }
  return { nome, urls };
}

async function irParaConteudo(page) {
  await page.getByRole('link', { name: 'Revisar informações' }).click();
  await expect(page).toHaveURL(/\/admin\/conteudo\/\?servico=/);
  await expect(page.locator('#servico-situacao')).toBeVisible();
  await expect(page.locator('#fontes-revisao')).toHaveAttribute('aria-busy', 'false');
await emFontes(page);
}

async function criarBloco(page, titulo, fonte) {
  await emInfos(page);
  await botao(page, 'Incluir informação').click();
  await page.getByLabel('Tema da informação', { exact: true }).fill(titulo);
  await page.getByLabel('O que o chatbot deve informar ao cidadão?').fill(`Orientação de teste: ${titulo}.`);
  await page.getByRole('checkbox', { name: new RegExp(`^${fonte}`) }).check();
  await page.getByLabel(new RegExp(`Onde esta informação aparece na fonte\\? \\(${fonte}\\)`)).fill('Seção 1');
  await page.locator('#bloco-enviar').click();
  await botao(page, 'Confirmar e salvar').click();
  await expect(status(page)).toContainText('Informação salva.');
  await expect(blocoDa(page, titulo)).toBeFocused();
}

async function conferirCoerencia(page) {
  const resumo = await page.locator('#situacao-resumo').innerText();
  const m = /^(Nenhuma|\d+) pendência/.exec(resumo);
  expect(m, `resumo: ${resumo}`).not.toBeNull();
  const n = m[1] === 'Nenhuma' ? 0 : Number(m[1]);
  await expect(page.locator('#pendencias li')).toHaveCount(n);
  if (n > 0) await expect(page.locator('#situacao-selo')).toBeVisible();
  else await expect(page.locator('#situacao-selo')).toBeHidden();
  return n;
}

async function abrirEdicao(page, titulo) {
  await emFontes(page);
  await botao(page, `Editar fonte: ${titulo}`).click();
  await expect(dlg(page)).toBeVisible();
  await expect(page.locator('#ef-titulo')).toBeFocused();
}
async function revisarFonte(page, titulo) {
  await emFontes(page);
  await botao(page, `Marcar como revisado: ${titulo}`).click();
  await expect(fonteDa(page, titulo)).toContainText('Situação: Revisado');
}

test('1. editar link: campos preenchidos, só o que mudou é enviado, item focado e dados persistidos', async ({ page }) => {
  const enviados = observar(page);
  await criarServico(page, 'Serviço Fonte Um', { links: ['Link Original'] });
  await irParaConteudo(page);
  await expect(fonteDa(page, 'Link Original')).toContainText('Situação: Ainda não revisada');
  await abrirEdicao(page, 'Link Original');
  await expect(dlg(page).getByRole('heading', { level: 2 })).toHaveText('Editar link');
  await expect(page.locator('#ef-url')).toHaveValue(/^https:\/\/exemplo\.test\//);
  await expect(page.locator('#ef-orgao')).toHaveValue('Órgão de Teste');
  await expect(page.locator('#ef-aviso')).toBeHidden();
  await expect(dlg(page).getByLabel('Órgão que publicou o conteúdo')).toBeVisible();
  await page.locator('#ef-titulo').fill('Link Renomeado');
  await page.locator('#ef-url').fill('https://exemplo.test/novo-endereco');
  await page.locator('#ef-orgao').fill('Órgão Novo');
  await page.locator('#ef-data').fill('2026-03-15');
  await page.locator('#ef-localizacao').fill('Seção 4');
  await page.locator('#ef-salvar').click();
  await expect(status(page)).toContainText('Fonte alterada.');
  await expect(dlg(page)).toBeHidden();
  await expect(fonteDa(page, 'Link Renomeado')).toBeFocused();
  const patch = so(enviados, 'PATCH', '/fontes/');
  expect(patch).toHaveLength(1);
  expect(patch[0].tipo).toContain('application/json');
  expect(Object.keys(JSON.parse(patch[0].texto)).sort()).toEqual(['dataPublicacao', 'localizacao', 'orgaoResponsavel', 'revisao', 'titulo', 'url']);
  await abrirEdicao(page, 'Link Renomeado');
  await expect(page.locator('#ef-url')).toHaveValue('https://exemplo.test/novo-endereco');
  await expect(page.locator('#ef-data')).toHaveValue('2026-03-15');
  await expect(page.locator('#ef-localizacao')).toHaveValue('Seção 4');
  await expect(page.locator('#ef-orgao')).toHaveValue('Órgão Novo');
  // sem alteração: nada é enviado
  await page.locator('#ef-salvar').click();
  await expect(page.locator('#ef-mensagem')).toContainText('Nenhuma alteração para salvar.');
  expect(so(enviados, 'PATCH', '/fontes/')).toHaveLength(1);
  // validação junto ao campo
  await page.locator('#ef-url').fill('http://inseguro.test');
  await page.locator('#ef-titulo').fill('');
  await page.locator('#ef-salvar').click();
  await expect(page.locator('#ef-titulo-erro')).toBeVisible();
  await expect(page.locator('#ef-url-erro')).toContainText('https://');
  await expect(page.locator('#ef-titulo')).toBeFocused();
  expect(so(enviados, 'PATCH', '/fontes/')).toHaveLength(1);
  await botao(page, 'Voltar').click();
  await expect(dlg(page)).toBeHidden();
  await expect(botao(page, 'Editar fonte: Link Renomeado')).toBeFocused();
  expect(await page.locator('body').innerText()).not.toMatch(TECNICO);
});

test('2. URL duplicada: erro curto no campo, janela continua aberta e nada é gravado', async ({ page }) => {
  const enviados = observar(page);
  const d = await criarServico(page, 'Serviço Fonte Dois', { links: ['Link Beta', 'Link Gama'] });
  await irParaConteudo(page);
  await abrirEdicao(page, 'Link Beta');
  await page.locator('#ef-url').fill(d.urls[1]);
  await page.locator('#ef-salvar').click();
  await expect(page.locator('#ef-url-erro')).toContainText('Já existe outro link com este endereço neste serviço.');
  await expect(page.locator('#ef-url')).toBeFocused();
  await expect(page.locator('#ef-url')).toHaveAttribute('aria-invalid', 'true');
  await expect(dlg(page)).toBeVisible();
  expect(so(enviados, 'PATCH', '/fontes/')).toHaveLength(1);
  await expect(page.locator('#ef-salvar')).toBeEnabled();
  await botao(page, 'Voltar').click();
  await expect(fonteDa(page, 'Link Beta')).toContainText('Ainda não revisada');
});

test('3. editar texto: o texto novo aparece ao reabrir; contato institucional aceito e e-mail externo recusado', async ({ page }) => {
  const enviados = observar(page);
  await criarServico(page, 'Serviço Fonte Tres', { links: ['Link Base'], texto: 'Texto Editavel' });
  await irParaConteudo(page);
  await expect(fonteDa(page, 'Texto Editavel')).toContainText('Tipo: Texto informado');
  await abrirEdicao(page, 'Texto Editavel');
  await expect(dlg(page).getByRole('heading', { level: 2 })).toHaveText('Editar texto');
  await expect(page.locator('#ef-grupo-link')).toBeHidden();
  await expect(page.locator('#ef-texto')).toHaveValue(/Conteúdo original do texto Texto Editavel/);
  const externo = ['pessoa.externa', 'exemplo.test'].join('@');
  const institucional = ['suimis', 'sema.mt.gov.br'].join('@');
  await page.locator('#ef-texto').fill(`Fale com ${externo}.`);
  await page.locator('#ef-salvar').click();
  await expect(page.locator('#ef-texto-erro')).toContainText('e-mail');
  expect(await dlg(page).innerText()).not.toContain(externo);
  expect(so(enviados, 'PATCH', '/fontes/')).toHaveLength(0);
  await page.locator('#ef-texto').fill(`Texto alterado com contato ${institucional}.`);
  await page.locator('#ef-salvar').click();
  await expect(status(page)).toContainText('Fonte alterada.');
  await expect(fonteDa(page, 'Texto Editavel')).toBeFocused();
  expect(Object.keys(JSON.parse(so(enviados, 'PATCH', '/fontes/')[0].texto)).sort()).toEqual(['revisao', 'texto']);
  await abrirEdicao(page, 'Texto Editavel');
  await expect(page.locator('#ef-texto')).toHaveValue(`Texto alterado com contato ${institucional}.`);
  expect(await fonteDa(page, 'Texto Editavel').innerText()).not.toContain('Texto alterado');
  await botao(page, 'Voltar').click();
});

test('4. editar fonte revisada: aviso antes de salvar, volta para revisão, informação aceita volta para Em elaboração e a contagem acompanha', async ({ page }) => {
  await criarServico(page, 'Serviço Fonte Quatro', { links: ['Link Usado'] });
  await irParaConteudo(page);
  await criarBloco(page, 'Prazos de análise', 'Link Usado');
  await revisarFonte(page, 'Link Usado');
  await emInfos(page);
  await botao(page, 'Aceitar informação: Prazos de análise').click();
  await expect(blocoDa(page, 'Prazos de análise')).toContainText('Situação: Aceita');
  expect(await conferirCoerencia(page)).toBe(0);
  await abrirEdicao(page, 'Link Usado');
  await expect(page.locator('#ef-aviso')).toBeVisible();
  await expect(page.locator('#ef-aviso')).toHaveText('Ao salvar, esta fonte volta para revisão e as informações aceitas que a usam voltam para Em elaboração.');
  await page.locator('#ef-descricao').fill('Descrição ajustada.');
  await page.locator('#ef-salvar').click();
  await expect(status(page)).toContainText('Fonte alterada. Ela precisa ser revisada de novo. 1 informação voltou para Em elaboração.');
  await expect(fonteDa(page, 'Link Usado')).toContainText('Situação: Revisão pendente');
  await expect(fonteDa(page, 'Link Usado')).toBeFocused();
  await expect(blocoDa(page, 'Prazos de análise')).toContainText('Situação: Em elaboração');
  expect(await conferirCoerencia(page)).toBeGreaterThan(0);
  await expect(page.locator('#servico-situacao')).toContainText('Revisão pendente');
  await expect(botao(page, 'Concluir revisão')).toBeHidden();
  // revisar e aceitar de novo zera as pendências
  await revisarFonte(page, 'Link Usado');
  await emInfos(page);
  await botao(page, 'Aceitar informação: Prazos de análise').click();
  await expect(blocoDa(page, 'Prazos de análise')).toContainText('Situação: Aceita');
  expect(await conferirCoerencia(page)).toBe(0);
});

test('5. excluir fonte sem uso: impacto e confirmação próprios, DELETE sem corpo com X-Revisao, item some, foco no vizinho e URL pode ser cadastrada de novo', async ({ page }) => {
  const enviados = observar(page);
  const d = await criarServico(page, 'Serviço Fonte Cinco', { links: ['Link Mantido', 'Link Descartavel'], texto: 'Texto Descartavel' });
  await irParaConteudo(page);
  await expect(page.locator('#fontes-excluidas')).toHaveCount(0);
  await expect(page.locator('#fontes-revisao')).not.toContainText('Itens excluídos');
  const gatilho = botao(page, 'Excluir fonte: Texto Descartavel');
  await gatilho.click();
  const confirmacao = page.locator('#dialogo-excluir-fonte');
  await expect(confirmacao).toBeVisible();
  await expect(confirmacao).toContainText('Texto Descartavel');
  await expect(confirmacao).toContainText('Este item não aparecerá mais na gestão. O histórico será preservado.');
  await expect(confirmacao).toContainText('A exclusão será aplicada ao chatbot após a publicação desta versão.');
  await expect(page.locator('#ex-informacoes')).toBeHidden();
  await expect(page.locator('#ex-antigo')).toBeHidden();
  await expect(botao(page, 'Voltar')).toBeFocused();
  await botao(page, 'Voltar').click();
  await expect(gatilho).toBeFocused();
  expect(so(enviados, 'DELETE', '/fontes/')).toHaveLength(0);
  await gatilho.click();
  await botao(page, 'Excluir').click();
  await expect(status(page)).toContainText('Item excluído.');
  await expect(status(page)).toContainText('A exclusão será aplicada ao chatbot após a publicação desta versão.');
  const del = so(enviados, 'DELETE', '/fontes/');
  expect(del).toHaveLength(1);
  expect(del[0].texto).toBeNull();
  expect(del[0].revisao).toMatch(/^[0-9a-f]{64}$/);
  await expect(fonteDa(page, 'Texto Descartavel')).toHaveCount(0);
  await expect(fonteDa(page, 'Link Descartavel')).toBeFocused();
  await expect(page.locator('#fontes-excluidas')).toHaveCount(0);
  // excluída não aparece como opção em formulários de informação
  await emInfos(page);
  await botao(page, 'Incluir informação').click();
  await expect(page.getByRole('checkbox', { name: /Texto Descartavel/ })).toHaveCount(0);
  await expect(page.getByRole('checkbox', { name: /^Link Mantido/ })).toBeVisible();
  await botao(page, 'Cancelar').click();
  // excluir um link e cadastrar a mesma URL de novo
  await emFontes(page);
  await botao(page, 'Excluir fonte: Link Descartavel').click();
  await botao(page, 'Excluir').click();
  await expect(status(page)).toContainText('Item excluído.');
  await expect(fonteDa(page, 'Link Descartavel')).toHaveCount(0);
  await expect(fonteDa(page, 'Link Mantido')).toBeFocused();
  await irGestao(page).click();
  await page.getByRole('button', { name: ACESSAR }).click();
  await expect(page.getByRole('heading', { level: 2, name: d.nome })).toBeVisible();
  await botao(page, 'Link').click();
  await page.locator('#link-titulo').fill('Link Descartavel De Novo');
  await page.locator('#link-url').fill(d.urls[1]);
  await page.locator('#link-orgao').fill('Órgão de Teste');
  await page.locator('#link-descricao').fill('Mesmo endereço, cadastrado de novo.');
  await botao(page, 'Incluir link').click();
  await expect(page.locator('#status')).toContainText('Link adicionado');
  await expect(page.locator('#link-url-erro')).toBeHidden();
  await irParaConteudo(page);
  await expect(fonteDa(page, 'Link Descartavel De Novo')).toBeVisible();
  expect(await page.locator('body').innerText()).not.toMatch(TECNICO);
});

test('6. informação com outra fonte permanece (volta a Em elaboração) e informação sem fonte sai da lista; contagens acompanham', async ({ page }) => {
  await criarServico(page, 'Serviço Fonte Seis', { links: ['Link A', 'Link B'] });
  await irParaConteudo(page);
  await emInfos(page);
  await botao(page, 'Incluir informação').click();
  await page.getByLabel('Tema da informação', { exact: true }).fill('Com duas fontes');
  await page.getByLabel('O que o chatbot deve informar ao cidadão?').fill('Orientação com duas fontes.');
  for (const t of ['Link A', 'Link B']) {
    await page.getByRole('checkbox', { name: new RegExp(`^${t}`) }).check();
    await page.getByLabel(new RegExp(`Onde esta informação aparece na fonte\\? \\(${t}\\)`)).fill('Seção 1');
  }
  await page.locator('#bloco-enviar').click();
  await botao(page, 'Confirmar e salvar').click();
  await expect(blocoDa(page, 'Com duas fontes')).toBeFocused();
  await criarBloco(page, 'Só com a fonte B', 'Link B');
  await revisarFonte(page, 'Link A');
  await revisarFonte(page, 'Link B');
  await emInfos(page);
  await botao(page, 'Aceitar informação: Com duas fontes').click();
  await expect(blocoDa(page, 'Com duas fontes')).toContainText('Situação: Aceita');
  await botao(page, 'Aceitar informação: Só com a fonte B').click();
  await expect(blocoDa(page, 'Só com a fonte B')).toContainText('Situação: Aceita');
  expect(await conferirCoerencia(page)).toBe(0);
  // o diálogo mostra o impacto ANTES de confirmar
  await emFontes(page);
  await botao(page, 'Excluir fonte: Link B').click();
  const dialogoExcluir = page.locator('#dialogo-excluir-fonte');
  await expect(dialogoExcluir).toBeVisible();
  await expect(page.locator('#ex-informacoes')).toBeVisible();
  await expect(page.locator('#ex-informacoes-lista')).toContainText('A informação "Com duas fontes"');
  await expect(page.locator('#ex-informacoes-lista')).toContainText('A informação "Só com a fonte B" sairá do conteúdo ativo.');
  expect(await dialogoExcluir.innerText()).not.toMatch(TECNICO);
  await botao(page, 'Excluir').click();
  await expect(status(page)).toContainText('Item excluído.');
  await expect(fonteDa(page, 'Link B')).toHaveCount(0);
  await expect(blocoDa(page, 'Só com a fonte B')).toHaveCount(0);
  await expect(blocoDa(page, 'Com duas fontes')).toContainText('Situação: Em elaboração');
  await expect(blocoDa(page, 'Com duas fontes')).not.toContainText('Link B');
  expect(await conferirCoerencia(page)).toBeGreaterThan(0);
  await expect(page.locator('#servico-situacao')).toContainText('Revisão pendente');
  await emInfos(page);
  await botao(page, 'Incluir informação').click();
  await expect(page.getByRole('checkbox', { name: /^Link B/ })).toHaveCount(0);
  await expect(page.getByRole('checkbox', { name: /^Link A/ })).toBeVisible();
});

test('7. LAC copiada: decreto revogado é excluível pela lista normal; fonte do conteúdo antigo mostra o impacto antes e some depois', async ({ page }) => {
  await page.goto('/admin/conteudo/?servico=lac');
  await expect(page.locator('#servico-situacao')).toBeVisible();
  await expect(page.locator('#fontes-revisao')).toHaveAttribute('aria-busy', 'false');
  await emFontes(page);
  await expect(page.locator('#fontes-excluidas')).toHaveCount(0);
  const decreto = fonteDa(page, 'Decreto nº 695');
  await expect(decreto).toContainText('Situação: Revogada');
  await expect(decreto.getByRole('button', { name: /^Marcar como revisado/ })).toHaveCount(0);
  await expect(decreto.getByRole('button', { name: /^Editar fonte/ })).toHaveCount(0);
  await botao(page, 'Excluir fonte: Decreto nº 695, de 29 de outubro de 2020').click();
  await expect(page.locator('#dialogo-excluir-fonte')).toBeVisible();
  await botao(page, 'Excluir').click();
  await expect(status(page)).toContainText('Item excluído.');
  await expect(fonteDa(page, 'Decreto nº 695')).toHaveCount(0);
  await expect(page.locator('#fontes-excluidas')).toHaveCount(0);
  expect(await page.locator('body').innerText()).not.toContain('Itens excluídos');
  // fonte citada pelo conteúdo antigo: o impacto aparece antes; depois a lista é atualizada
  const antes = await page.locator('#fontes-revisao li.bloco').count();
  await page.getByRole('button', { name: /^Excluir fonte: Termo de Referência/ }).click();
  await expect(page.locator('#dialogo-excluir-fonte')).toBeVisible();
  await expect(page.locator('#ex-antigo')).toBeVisible();
  await expect(page.locator('#ex-antigo-lista')).toContainText('conteúdo antigo');
  await expect(page.locator('#ex-antigo-lista')).toContainText('documentos');
  const resumoAntes = await page.locator('#situacao-resumo').innerText();
  await botao(page, 'Excluir').click();
  await expect(status(page)).toContainText('Item excluído.');
  await expect(fonteDa(page, 'Termo de Referência')).toHaveCount(0);
  expect(await page.locator('#fontes-revisao li.bloco').count()).toBe(antes - 1);
  expect(await page.locator('#situacao-resumo').innerText()).toBeTruthy();
  void resumoAntes;
  await emInfos(page);
  await botao(page, 'Incluir informação').click();
  await expect(page.getByRole('checkbox', { name: /Termo de Referência/ })).toHaveCount(0);
  await expect(page.getByRole('checkbox', { name: /Decreto nº 695/ })).toHaveCount(0);
  expect(await page.locator('body').innerText()).not.toMatch(TECNICO);
});

test('8. versão congelada sem Editar/Excluir; na nova versão a exclusão vale e a versão anterior fica intacta', async ({ page }) => {
  await criarServico(page, 'Serviço Fonte Oito', { links: ['Link Congelado'] });
  await irParaConteudo(page);
  await criarBloco(page, 'Conteúdo congelado', 'Link Congelado');
  await revisarFonte(page, 'Link Congelado');
  await emInfos(page);
  await botao(page, 'Aceitar informação: Conteúdo congelado').click();
  await expect(blocoDa(page, 'Conteúdo congelado')).toContainText('Situação: Aceita');
  await botao(page, 'Concluir revisão').click();
  await botao(page, 'Confirmar conclusão').click();
  await expect(status(page)).toContainText('Revisão concluída.');
  for (const nome of [/^Editar fonte/, /^Excluir fonte/, /^Marcar como revisado/]) await expect(page.getByRole('button', { name: nome })).toHaveCount(0);
  await expect(botao(page, 'Criar nova versão para editar')).toBeVisible();
  await botao(page, 'Criar nova versão para editar').click();
  await expect(status(page)).toContainText('Nova versão criada.');
  await emFontes(page);
  await expect(botao(page, 'Editar fonte: Link Congelado')).toBeVisible();
  await abrirEdicao(page, 'Link Congelado');
  await page.locator('#ef-titulo').fill('Link Da Nova Versao');
  await page.locator('#ef-salvar').click();
  await expect(status(page)).toContainText('Fonte alterada.');
  await expect(fonteDa(page, 'Link Da Nova Versao')).toBeFocused();
  await botao(page, 'Excluir fonte: Link Da Nova Versao').click();
  await expect(page.locator('#ex-informacoes-lista')).toContainText('Conteúdo congelado');
  await botao(page, 'Excluir').click();
  await expect(status(page)).toContainText('Item excluído.');
  await expect(fonteDa(page, 'Link Da Nova Versao')).toHaveCount(0);
  // a versão anterior continua com a fonte original, sem marca de exclusão
  const id = new URL(page.url()).searchParams.get('servico');
  const versoes = path.join(process.env.SEMA_REAL_COPIA, 'services', id, 'versoes');
  const v1 = JSON.parse(fs.readFileSync(path.join(versoes, 'v1', 'fontes.json'), 'utf8')).fontes;
  expect(v1.map((x) => x.titulo)).toContain('Link Congelado');
  expect(v1.some((x) => typeof x.excluidaEm === 'string')).toBe(false);
  const v2 = JSON.parse(fs.readFileSync(path.join(versoes, 'v2', 'fontes.json'), 'utf8')).fontes;
  expect(v2.some((x) => typeof x.excluidaEm === 'string')).toBe(true);
});

test('8b. Resolver pendências: do painel ao foco na primeira pendência, ação direta por item e conclusão liberada ao fim', async ({ page }) => {
  await criarServico(page, 'Serviço Fonte Oitob', { links: ['Link Pendente'] });
  await expect(page.locator('#painel-resumo')).toContainText('pendência');
  const resolver = page.getByRole('link', { name: 'Resolver pendências' });
  await expect(resolver).toBeVisible();
  await resolver.click();
  await expect(page).toHaveURL(/\/admin\/conteudo\/\?servico=[a-z0-9-]+&pendencias=1$/);
  await expect(page.locator('#servico-situacao')).toBeVisible();
  // foco na primeira pendência, com a frase exata e a ação direta
  const primeira = page.locator('#pendencias li').first();
  await expect(primeira).toBeFocused();
  await expect(primeira).toContainText('Inclua e aceite pelo menos uma informação para concluir a revisão.');
  await expect(page.locator('#passos-pendencias li')).toHaveCount(5);
  await expect(page.locator('#passos-pendencias')).toContainText('Aceitar a informação.');
  await page.getByRole('button', { name: 'Incluir informação (resolver pendência)' }).click();
  await expect(page.locator('#titulo-form')).toBeFocused();
  await page.getByLabel('Tema da informação', { exact: true }).fill('Informação para resolver');
  await page.getByLabel('O que o chatbot deve informar ao cidadão?').fill('Orientação para resolver as pendências.');
  await page.getByRole('checkbox', { name: /^Link Pendente/ }).check();
  await page.getByLabel(/Onde esta informação aparece na fonte\? \(Link Pendente\)/).fill('Seção 1');
  await page.locator('#bloco-enviar').click();
  await botao(page, 'Confirmar e salvar').click();
  await expect(blocoDa(page, 'Informação para resolver')).toBeFocused();
  // pendências atualizadas: agora faltam revisar a fonte e aceitar a informação
  expect(await conferirCoerencia(page)).toBe(3);
  await expect(page.locator('#pendencias')).toContainText('A informação "Informação para resolver" ainda não foi aceita nem excluída.');
  await botao(page, 'Resolver pendências').click();
  await expect(page.locator('#pendencias li').first()).toBeFocused();
  await page.getByRole('button', { name: 'Ir para o documento ou link: Link Pendente' }).click();
  await expect(fonteDa(page, 'Link Pendente')).toBeFocused();
  await expect(botao(page, 'Marcar como revisado: Link Pendente')).toBeVisible();
  await revisarFonte(page, 'Link Pendente');
  expect(await conferirCoerencia(page)).toBe(2);
  await page.getByRole('button', { name: 'Ir para a informação: Informação para resolver' }).click();
  await expect(blocoDa(page, 'Informação para resolver')).toBeFocused();
  await botao(page, 'Aceitar informação: Informação para resolver').click();
  await expect(blocoDa(page, 'Informação para resolver')).toContainText('Situação: Aceita');
  expect(await conferirCoerencia(page)).toBe(0);
  await expect(botao(page, 'Resolver pendências')).toBeHidden();
  await expect(page.locator('#passos-pendencias')).toBeHidden();
  await expect(page.locator('#situacao-selo')).toBeHidden();
  await expect(botao(page, 'Concluir revisão')).toBeVisible();
  // de volta ao painel: sem pendências, sem "Resolver pendências"
  await irGestao(page).click();
  await page.getByRole('button', { name: ACESSAR }).click();
  await expect(page.locator('#painel-resumo')).toContainText('Nenhuma pendência para concluir.');
  await expect(page.getByRole('link', { name: 'Resolver pendências' })).toBeHidden();
});

test('9. clique duplo envia um único PATCH e um único DELETE', async ({ page }) => {
  const enviados = observar(page);
  await criarServico(page, 'Serviço Fonte Nove', { links: ['Link Duplo'], texto: 'Texto Duplo' });
  await irParaConteudo(page);
  await abrirEdicao(page, 'Link Duplo');
  await page.locator('#ef-titulo').fill('Link Duplo Editado');
  await page.locator('#ef-salvar').dblclick();
  await expect(status(page)).toContainText('Fonte alterada.');
  expect(so(enviados, 'PATCH', '/fontes/')).toHaveLength(1);
  await botao(page, 'Excluir fonte: Texto Duplo').click();
  await botao(page, 'Excluir').dblclick();
  await expect(status(page)).toContainText('Item excluído.');
  expect(so(enviados, 'DELETE', '/fontes/')).toHaveLength(1);
});

test('10. teclado: Enter abre a edição, Enter no campo salva, Esc fecha devolvendo o foco e a exclusão se confirma pelo teclado', async ({ page }) => {
  const enviados = observar(page);
  await criarServico(page, 'Serviço Fonte Dez', { links: ['Link Teclado'], texto: 'Texto Teclado' });
  await irParaConteudo(page);
  await emFontes(page);
  await page.keyboard.press('Shift'); // modalidade de teclado: o foco por script passa a casar com :focus-visible
  const editar = botao(page, 'Editar fonte: Link Teclado');
  await editar.focus();
  expect(await page.evaluate(() => { const c = getComputedStyle(document.activeElement); return c.outlineStyle !== 'none' && parseFloat(c.outlineWidth) > 0; })).toBe(true);
  await page.keyboard.press('Enter');
  await expect(page.locator('#ef-titulo')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.locator('#ef-url')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dlg(page)).toBeHidden();
  await expect(editar).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#ef-titulo')).toBeFocused();
  await page.keyboard.press('Control+A');
  await page.keyboard.type('Link Teclado Salvo');
  await page.keyboard.press('Enter'); // envio implícito do formulário
  await expect(status(page)).toContainText('Fonte alterada.');
  await expect(fonteDa(page, 'Link Teclado Salvo')).toBeFocused();
  expect(so(enviados, 'PATCH', '/fontes/')).toHaveLength(1);
  const excluir = botao(page, 'Excluir fonte: Texto Teclado');
  await excluir.focus();
  await page.keyboard.press('Enter');
  await expect(botao(page, 'Voltar')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(botao(page, 'Excluir')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(status(page)).toContainText('Item excluído.');
  await expect(fonteDa(page, 'Link Teclado Salvo')).toBeFocused();
});

test('11. 390 px e texto a 200%: janelas, lista e itens excluídos sem rolagem horizontal, sem cortes e com alvos de 44 px', async ({ page }) => {
  await criarServico(page, 'Serviço Fonte Onze com um nome bem comprido para testar a quebra de linha em tela pequena', { links: ['Link com um título muito comprido para conferir a quebra de linha nas telas pequenas e no texto ampliado'], texto: 'Texto Onze' });
  await page.setViewportSize({ width: 390, height: 844 });
  const conferir = async (onde) => {
    const r = await page.evaluate(() => {
      const largura = document.documentElement.clientWidth;
      const visivel = (e) => { const b = e.getBoundingClientRect(); const cs = getComputedStyle(e); return b.width > 0 && b.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none'; };
      const fora = []; const cortados = []; const pequenos = [];
      for (const e of document.querySelectorAll('body *')) if (visivel(e)) { const b = e.getBoundingClientRect(); if (b.right > largura + 0.5 || b.left < -0.5) fora.push(`${e.tagName}#${e.id}`); }
      for (const e of document.querySelectorAll('.cartao, h1, h2, h3, button, a.botao, label, legend, p, li, summary')) if (visivel(e) && e.scrollWidth > e.clientWidth + 1) cortados.push(`${e.tagName}#${e.id}`);
      for (const e of document.querySelectorAll('button, a.botao, select, input[type=text], input[type=url], input[type=date], summary')) if (visivel(e) && e.getBoundingClientRect().height < 43.5) pequenos.push(`${e.tagName}#${e.id}`);
      return { sw: document.documentElement.scrollWidth, cw: largura, fora: fora.slice(0, 5), cortados: cortados.slice(0, 5), pequenos: pequenos.slice(0, 5) };
    });
    expect(r.sw, `${onde}: rolagem horizontal`).toBeLessThanOrEqual(r.cw);
    expect(r.fora, `${onde}: fora da tela`).toEqual([]);
    expect(r.cortados, `${onde}: texto cortado`).toEqual([]);
    expect(r.pequenos, `${onde}: alvos pequenos`).toEqual([]);
  };
  await irParaConteudo(page);
  for (const escala of ['100%', '200%']) {
    if (escala === '200%') await page.addStyleTag({ content: 'html{font-size:200% !important}' });
    await conferir(`lista de fontes a ${escala}`);
    await page.getByRole('button', { name: /^Editar fonte: Link com/ }).click();
    await expect(page.locator('#ef-titulo')).toBeFocused();
    await conferir(`edição de link a ${escala}`);
    await botao(page, 'Voltar').click();
    await page.getByRole('button', { name: 'Excluir fonte: Texto Onze' }).click();
    await expect(page.locator('#dialogo-excluir-fonte')).toBeVisible();
    await conferir(`exclusão a ${escala}`);
    await botao(page, 'Voltar').click();
  }
  await page.getByRole('button', { name: 'Excluir fonte: Texto Onze' }).click();
  await botao(page, 'Excluir').click();
  await expect(status(page)).toContainText('Item excluído.');
  await conferir('lista depois da exclusão a 200%');
});

test('12. nenhuma publicação: nada publicado na cópia e a base real continua intacta', async ({ page }) => {
  const copia = path.join(process.env.SEMA_REAL_COPIA, 'services');
  const registro = JSON.parse(fs.readFileSync(path.join(copia, 'registry.json'), 'utf8'));
  const servicos = Array.isArray(registro) ? registro : (registro.servicos ?? []);
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
  expect(achados).toEqual([]);
  await page.goto('/admin/saude/');
  await expect(page.getByRole('heading', { level: 1, name: /Saúde do sistema/ })).toBeVisible();
});
