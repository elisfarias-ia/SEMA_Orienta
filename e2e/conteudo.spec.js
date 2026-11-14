// Página "Blocos de conhecimento" (/admin/conteudo/) no navegador. TODAS as chamadas /__admin/* são simuladas aqui (page.route):
// nenhuma gravação real acontece e a base de serviços não é lida nem alterada. Qualquer outra requisição que não seja GET local
// ou que vá para a rede externa é bloqueada e faz o teste falhar.
import { test as base, expect } from '@playwright/test';
import { focoVisivel, semRolagemHorizontal } from './base.js';

const ORIGEM_LOCAL = 'http://localhost:5173';
const TOKEN = 'ab'.repeat(32);
const IDS_TECNICOS = /\bbc-[0-9a-f]{6,}|\bservico-ficticio\b|assunto-ficticio|\bf-um\b|\bf-dois\b|\bf-velha\b|hashConteudo|[0-9a-f]{64}|X-Admin-Token|teste_local/i;
const FONTES = [
  { id: 'f-um', titulo: 'Fonte Um', tipo: 'pagina_oficial', vigencia: { situacao: 'nao_se_aplica' } },
  { id: 'f-dois', titulo: 'Fonte Dois', tipo: 'manual', vigencia: { situacao: 'nao_se_aplica' } },
  { id: 'f-velha', titulo: 'Norma Antiga', tipo: 'legislacao', vigencia: { situacao: 'revogada' } },
];
const BLOCO = {
  id: 'bc-aaaaaaaaaaaa', tipo: 'conhecimento', titulo: 'Bloco existente', texto: 'Conteúdo fictício.', origem: 'fonte', fonteIds: ['f-um'],
  referencias: [{ fonteId: 'f-um', localizacao: 'Seção 2' }], alertas: ['Pode estar desatualizado.'], ambiente: 'publico', statusValidacao: 'rascunho',
  publicado: false, revisaoAtualidade: 'pendente', criadoEm: '2026-11-09', atualizadoEm: '2026-11-10',
};
const BLOCO_TESTE = { id: 'x-limites', tipo: 'limitacao', texto: 'Apenas orienta.', origem: 'regra_institucional', fonteIds: [], ambiente: 'teste_local', statusValidacao: 'em_validacao', publicado: false, revisaoAtualidade: 'pendente' };

const test = base.extend({
  violacoes: async ({}, usar) => { await usar([]); },
  servidor: async ({ page, violacoes }, usar) => {
    const estado = { versao: 'rascunho', blocos: [], atraso: 0, erro: null };
    const gravacoes = [];
    await page.route('**/*', (rota) => {
      const r = rota.request();
      const url = r.url();
      if (!(url.startsWith(`${ORIGEM_LOCAL}/`) || url.startsWith('data:'))) { violacoes.push(`rede externa: ${new URL(url).origin}`); return rota.abort(); }
      if (r.method() !== 'GET') { violacoes.push(`${r.method()} ${new URL(url).pathname} (fora do simulador)`); return rota.abort(); }
      return rota.continue();
    });
    await page.route('**/__admin/**', async (rota) => {
      const r = rota.request();
      const p = new URL(r.url()).pathname;
      const m = r.method();
      const json = (status, corpo) => rota.fulfill({ status, contentType: 'application/json', body: corpo === null ? '' : JSON.stringify(corpo) });
      const base = '/__admin/servicos/servico-ficticio';
      if (p === '/__admin/sessao') return json(200, { token: TOKEN });
      if (p === '/__admin/catalogo') {
        return json(200, {
          assuntos: [{ id: 'assunto-ficticio', nome: 'Assunto Fictício', descricao: 'Descrição.', ativo: true }],
          servicos: [{ id: 'servico-ficticio', assuntoId: 'assunto-ficticio', nome: 'Serviço Fictício', sigla: 'SF', versaoAtualId: 'servico-ficticio-v1', versaoPublicadaId: null, statusValidacao: 'rascunho', publicado: false }],
        });
      }
      if (p === `${base}/versao-atual` && m === 'GET') {
        return json(200, {
          servicoId: 'servico-ficticio', versaoId: 'servico-ficticio-v1', manifesto: { estado: estado.versao, numero: 1 }, service: { nome: 'Serviço Fictício', sigla: 'SF' },
          fontes: { fontes: FONTES }, conteudoAssistente: { blocos: [BLOCO_TESTE, ...estado.blocos] }, revisaoFontes: 'cd'.repeat(32),
        });
      }
      if (p.startsWith(`${base}/conhecimentos`)) {
        gravacoes.push({ metodo: m, caminho: p, corpo: m === 'DELETE' ? null : r.postDataJSON() });
        if (estado.atraso) await new Promise((fim) => setTimeout(fim, estado.atraso));
        if (estado.erro) return json(estado.erro.status, estado.erro.corpo);
        if (m === 'POST') {
          const c = r.postDataJSON();
          const novo = { id: `bc-${String(estado.blocos.length + 1).padStart(12, '0')}`, tipo: 'conhecimento', origem: 'fonte', ambiente: 'publico', statusValidacao: 'rascunho', publicado: false, revisaoAtualidade: 'pendente', criadoEm: '2026-11-10', atualizadoEm: '2026-11-10', ...c };
          estado.blocos.push(novo);
          return json(201, { bloco: { id: novo.id } });
        }
        const id = p.split('/').pop();
        const i = estado.blocos.findIndex((b) => b.id === id);
        if (i === -1) return json(404, { erro: 'nao_encontrado' });
        if (m === 'PATCH') {
          estado.blocos[i] = { ...estado.blocos[i], ...r.postDataJSON(), atualizadoEm: '2026-11-12' };
          return json(200, { bloco: { id } });
        }
        if (m === 'DELETE') { estado.blocos.splice(i, 1); return rota.fulfill({ status: 204 }); }
      }
      return json(404, { erro: 'nao_encontrado' });
    });
    await usar({ estado, gravacoes });
    expect(violacoes, 'requisições bloqueadas durante o teste').toEqual([]);
  },
});

async function abrir(page, servidor, { blocos = [], versao = 'rascunho', escolher = true } = {}) {
  servidor.estado.blocos = structuredClone(blocos);
  servidor.estado.versao = versao;
  await page.goto('/admin/conteudo/');
  await expect(page.locator('#assunto')).toBeEnabled();
  if (escolher) {
    await page.selectOption('#assunto', { label: 'Assunto Fictício' });
    await page.selectOption('#servico', { label: 'Serviço Fictício' });
    await expect(page.locator('#servico-situacao')).toBeVisible();
    await expect(page.locator('#blocos')).toHaveAttribute('aria-busy', 'false');
  }
}
const preencherValido = async (page) => {
  await page.getByLabel('Tema da informação', { exact: true }).fill('Título novo');
  await page.getByLabel('Informação que o chatbot pode usar').fill('Texto orientativo fictício.');
  await page.getByLabel('Fonte Um (Página oficial)').check();
  await page.getByLabel(/Onde esta informação aparece na fonte\? \(Fonte Um\)/).fill('Seção 5');
};

test.describe('Blocos de conhecimento (simulado, sem gravação real)', () => {
  test('carrega sessão e catálogo, mostra a navegação e não grava nada ao abrir', async ({ page, servidor }) => {
    await abrir(page, servidor, { escolher: false });
    await expect(page.getByRole('heading', { level: 1, name: /Informações do chatbot/ })).toBeVisible();
    await expect(page.getByRole('note')).toContainText('sem autenticação');
    const nav = page.getByRole('navigation', { name: 'Seções da administração' });
    await expect(nav.getByRole('link')).toHaveText(['Cadastro da base', 'Informações do chatbot', 'Saúde do sistema']);
    await expect(nav.getByRole('link', { name: 'Informações do chatbot' })).toHaveAttribute('aria-current', 'page');
    await expect(page.getByText('Cadastre uma informação completa e comprovada. O chatbot poderá usá-la para responder diferentes perguntas dos cidadãos.')).toBeVisible();
    await expect(page.getByRole('listitem').filter({ hasText: 'Indique a fonte que comprova a informação.' })).toBeVisible();
    await expect(page.getByLabel('Tema da informação', { exact: true })).toBeVisible();
    await expect(page.getByLabel('Informação que o chatbot pode usar')).toBeVisible();
    await expect(page.getByText('Selecione um documento ou link já cadastrado.')).toBeVisible();
    await expect(page.getByText('Opcional. Escreva um aviso por linha.')).toBeVisible();
    await expect(page.locator('svg[aria-hidden="true"]')).toHaveCount(5);
    for (const tamanho of await page.locator('.icone svg').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().width)))) expect([20, 28]).toContain(tamanho);
    expect(await page.locator('.icone svg').first().evaluate((e) => getComputedStyle(e).stroke)).toBe(await page.locator('.icone').first().evaluate((e) => getComputedStyle(e).color));
    expect(await page.locator('main').innerText()).not.toMatch(/\p{Extended_Pictographic}/u);
    await expect(page.locator('#bloco-enviar')).toBeDisabled();
    await expect(page.locator('#blocos')).toContainText('Escolha um serviço para ver as informações.');
    expect(servidor.gravacoes).toEqual([]);
    expect(await page.locator('body').innerText()).not.toMatch(IDS_TECNICOS);
  });

  test('selecionar assunto e serviço mostra nome, versão, estado e "Não publicada"; estado vazio; sem ids', async ({ page, servidor }) => {
    await abrir(page, servidor);
    const situacao = page.locator('#servico-situacao');
    await expect(situacao).toContainText('Serviço Fictício');
    await expect(situacao).toContainText('Versão 1');
    await expect(situacao).toContainText('Em elaboração (rascunho)');
    await expect(situacao).toContainText('Não publicada');
    await expect(page.locator('#blocos')).toContainText('Nenhuma orientação foi cadastrada para este serviço.');
    await expect(page.getByLabel('Fonte Um (Página oficial)')).toBeVisible();
    await expect(page.getByLabel('Fonte Dois (Manual)')).toBeVisible();
    await expect(page.getByLabel(/Norma Antiga \(Legislação\)/)).toBeDisabled();
    await expect(page.locator('#bloco-enviar')).toBeEnabled();
    expect(await page.locator('body').innerText()).not.toMatch(IDS_TECNICOS);
    expect(await page.locator('body').innerText()).not.toContain('Apenas orienta.');
  });

  test('em tela larga o formulário e a lista ficam lado a lado; o placeholder orienta a localização', async ({ page, servidor }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await abrir(page, servidor, { blocos: [BLOCO] });
    const form = await page.locator('#form-bloco').boundingBox();
    const lista = await page.locator('#blocos').boundingBox();
    expect(lista.x).toBeGreaterThan(form.x + form.width - 1);
    await page.getByLabel('Fonte Um (Página oficial)').check();
    await expect(page.getByLabel(/Onde esta informação aparece na fonte\? \(Fonte Um\)/)).toHaveAttribute('placeholder', 'Ex.: página 3, item 2.1 ou seção Como solicitar.');
    expect(await semRolagemHorizontal(page)).toBe(true);
  });

  test('lista só blocos de conhecimento, com fontes por título e datas DD-MM-AAAA', async ({ page, servidor }) => {
    await abrir(page, servidor, { blocos: [BLOCO] });
    const lista = page.locator('#blocos');
    await expect(lista).toContainText('Bloco existente');
    await expect(lista).toContainText('Fonte Um — Seção 2');
    await expect(lista).toContainText('Fontes que comprovam a informação');
    await expect(lista).toContainText('Avisos ou limitações');
    await expect(lista).toContainText('Pode estar desatualizado.');
    await expect(lista).toContainText('Situação: Em elaboração (rascunho)');
    await expect(lista).toContainText('Ainda não disponível no chatbot.');
    await expect(lista).toContainText('Criado em 09-11-2026 · Atualizado em 10-11-2026');
    expect(await page.locator('body').innerText()).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    expect(await page.locator('body').innerText()).not.toMatch(IDS_TECNICOS);
  });

  test('a localização é obrigatória para cada fonte marcada e nada é enviado', async ({ page, servidor }) => {
    await abrir(page, servidor);
    await page.getByLabel('Tema da informação', { exact: true }).fill('Título novo');
    await page.getByLabel('Informação que o chatbot pode usar').fill('Texto orientativo fictício.');
    await page.locator('#bloco-enviar').click();
    await expect(page.locator('#bloco-fontes-erro')).toContainText('Escolha ao menos uma fonte que comprove a informação');
    await page.getByLabel('Fonte Um (Página oficial)').check();
    await page.locator('#bloco-enviar').click();
    const erro = page.locator('#fonte-local-0-erro');
    await expect(erro).toContainText('Informe onde esta informação aparece na fonte');
    await expect(page.locator('#fonte-local-0')).toBeFocused();
    await expect(page.locator('#fonte-local-0')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByRole('dialog')).toBeHidden();
    expect(servidor.gravacoes).toEqual([]);
  });

  test('criar: confirmação, Voltar não grava, Confirmar grava uma vez, recarrega a lista e leva o foco à mensagem', async ({ page, servidor }) => {
    await abrir(page, servidor);
    await preencherValido(page);
    await page.getByLabel('Avisos ou limitações').fill('Aviso um\nAviso dois');
    await page.locator('#bloco-enviar').click();
    const dialogo = page.getByRole('dialog');
    await expect(dialogo).toBeVisible();
    await expect(dialogo).toContainText('Confirmar cadastro da informação');
    await expect(dialogo).toContainText('Fonte Um — Seção 5');
    await expect(dialogo).toContainText('Em elaboração (rascunho); ainda não disponível no chatbot');
    expect(await dialogo.innerText()).not.toMatch(IDS_TECNICOS);
    await page.getByRole('button', { name: 'Voltar e corrigir' }).click();
    await expect(dialogo).toBeHidden();
    await expect(page.locator('#bloco-enviar')).toBeFocused();
    expect(servidor.gravacoes).toEqual([]);
    await page.locator('#bloco-enviar').click();
    await page.getByRole('button', { name: 'Salvar informação' }).click();
    await expect(page.locator('#status')).toContainText('Informação salva. Ela está em elaboração (rascunho) e ainda não está disponível no chatbot.');
    await expect(page.locator('#status')).toBeFocused();
    await expect(page.locator('#blocos')).toContainText('Título novo');
    await expect(page.locator('#blocos')).toContainText('Fonte Um — Seção 5');
    expect(servidor.gravacoes).toHaveLength(1);
    expect(servidor.gravacoes[0].metodo).toBe('POST');
    expect(Object.keys(servidor.gravacoes[0].corpo).sort()).toEqual(['alertas', 'fonteIds', 'referencias', 'texto', 'titulo']);
    expect(servidor.gravacoes[0].corpo.alertas).toEqual(['Aviso um', 'Aviso dois']);
    await expect(page.getByLabel('Tema da informação', { exact: true })).toHaveValue('');
  });

  test('editar: preenche o formulário, confirma, envia PATCH sem campos internos e recarrega; Cancelar volta ao cadastro sem gravar', async ({ page, servidor }) => {
    await abrir(page, servidor, { blocos: [BLOCO] });
    await page.getByRole('button', { name: 'Editar a informação Bloco existente' }).click();
    await expect(page.locator('#titulo-form')).toHaveText('Editar informação');
    await expect(page.locator('#titulo-form')).toBeFocused();
    await expect(page.getByLabel('Tema da informação', { exact: true })).toHaveValue('Bloco existente');
    await expect(page.getByLabel('Fonte Um (Página oficial)')).toBeChecked();
    await expect(page.getByLabel(/Onde esta informação aparece na fonte\? \(Fonte Um\)/)).toHaveValue('Seção 2');
    await expect(page.getByLabel('Avisos ou limitações')).toHaveValue('Pode estar desatualizado.');
    await page.locator('#bloco-cancelar').click();
    await expect(page.locator('#titulo-form')).toHaveText('Nova informação');
    await expect(page.getByLabel('Tema da informação', { exact: true })).toHaveValue('');
    expect(servidor.gravacoes).toEqual([]);
    await page.getByRole('button', { name: 'Editar a informação Bloco existente' }).click();
    await page.getByLabel('Tema da informação', { exact: true }).fill('Bloco editado');
    await page.locator('#bloco-enviar').click();
    await expect(page.getByRole('dialog')).toContainText('Confirmar alteração da informação');
    await page.getByRole('button', { name: 'Salvar informação' }).click();
    await expect(page.locator('#status')).toContainText('Informação alterada.');
    await expect(page.locator('#status')).toBeFocused();
    await expect(page.locator('#blocos')).toContainText('Bloco editado');
    await expect(page.locator('#blocos')).toContainText('Atualizado em 12-11-2026');
    expect(servidor.gravacoes.map((g) => g.metodo)).toEqual(['PATCH']);
    for (const proibido of ['id', 'criadoEm', 'atualizadoEm', 'statusValidacao', 'revisaoAtualidade', 'ambiente', 'publicado', 'origem', 'tipo']) expect(servidor.gravacoes[0].corpo).not.toHaveProperty(proibido);
  });

  test('excluir: pede confirmação; Voltar não exclui; Excluir bloco envia DELETE e mostra o estado vazio', async ({ page, servidor }) => {
    await abrir(page, servidor, { blocos: [BLOCO] });
    await page.getByRole('button', { name: 'Excluir a informação Bloco existente' }).click();
    const dialogo = page.getByRole('dialog');
    await expect(dialogo).toContainText('Confirmar exclusão da informação');
    await expect(dialogo).toContainText('Bloco existente');
    await page.getByRole('button', { name: 'Voltar e corrigir' }).click();
    await expect(page.getByRole('button', { name: 'Excluir a informação Bloco existente' })).toBeFocused();
    expect(servidor.gravacoes).toEqual([]);
    await page.getByRole('button', { name: 'Excluir a informação Bloco existente' }).click();
    await page.getByRole('button', { name: 'Excluir informação' }).click();
    await expect(page.locator('#status')).toContainText('Informação excluída.');
    await expect(page.locator('#status')).toBeFocused();
    await expect(page.locator('#blocos')).toContainText('Nenhuma orientação foi cadastrada para este serviço.');
    expect(servidor.gravacoes.map((g) => g.metodo)).toEqual(['DELETE']);
  });

  test('versão que não está em rascunho: criar, editar e excluir ficam desabilitados', async ({ page, servidor }) => {
    await abrir(page, servidor, { blocos: [BLOCO], versao: 'em_validacao' });
    await expect(page.locator('#servico-situacao')).toContainText('Em análise');
    await expect(page.locator('#situacao-edicao')).toContainText('bloqueados');
    await expect(page.locator('#bloco-enviar')).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Editar a informação Bloco existente' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Excluir a informação Bloco existente' })).toBeDisabled();
    expect(servidor.gravacoes).toEqual([]);
  });

  test('erros do servidor viram mensagens curtas, sem texto bruto, e a lista é recarregada quando o estado mudou', async ({ page, servidor }) => {
    await abrir(page, servidor, { blocos: [BLOCO] });
    servidor.estado.erro = { status: 409, corpo: { erro: 'bloco_nao_removivel', detalhe: 'SEGREDO-BRUTO' } };
    await page.getByRole('button', { name: 'Excluir a informação Bloco existente' }).click();
    await page.getByRole('button', { name: 'Excluir informação' }).click();
    await expect(page.locator('#status')).toContainText('não está mais em elaboração (rascunho) e não pode ser excluída');
    await expect(page.locator('#status')).toHaveAttribute('data-tipo', 'erro');
    await expect(page.locator('#status')).toBeFocused();
    expect(await page.locator('body').innerText()).not.toContain('SEGREDO-BRUTO');
    servidor.estado.erro = { status: 500, corpo: { erro: 'indisponivel', detalhe: 'SEGREDO-BRUTO' } };
    await page.locator('#bloco-cancelar').click();
    await preencherValido(page);
    await page.locator('#bloco-enviar').click();
    await page.getByRole('button', { name: 'Salvar informação' }).click();
    await expect(page.locator('#status')).toContainText('Nada foi alterado');
    expect(await page.locator('body').innerText()).not.toContain('SEGREDO-BRUTO');
  });

  test('clique duplo em Confirmar envia uma única gravação', async ({ page, servidor }) => {
    servidor.estado.atraso = 400;
    await abrir(page, servidor);
    await preencherValido(page);
    await page.locator('#bloco-enviar').click();
    await page.getByRole('button', { name: 'Salvar informação' }).dblclick();
    await expect(page.locator('#status')).toContainText('Informação salva. Ela está em elaboração (rascunho) e ainda não está disponível no chatbot.');
    expect(servidor.gravacoes.filter((g) => g.metodo === 'POST')).toHaveLength(1);
  });

  test('teclado: ordem de foco, foco visível, Esc fecha a confirmação devolvendo o foco', async ({ page, servidor }) => {
    await abrir(page, servidor, { blocos: [BLOCO] });
    await page.getByLabel('Tema da informação', { exact: true }).focus();
    expect(await focoVisivel(page)).toBe(true);
    await page.keyboard.press('Tab');
    await expect(page.getByLabel('Informação que o chatbot pode usar')).toBeFocused();
    await preencherValido(page);
    await page.getByLabel('Fonte Um (Página oficial)').focus();
    await page.keyboard.press('Space');
    await page.keyboard.press('Space');
    await page.getByLabel(/Onde esta informação aparece na fonte\? \(Fonte Um\)/).fill('Seção 5');
    await page.locator('#bloco-enviar').focus();
    expect(await focoVisivel(page)).toBe(true);
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Voltar e corrigir' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toBeHidden();
    await expect(page.locator('#bloco-enviar')).toBeFocused();
    expect(servidor.gravacoes).toEqual([]);
  });

  test('390 px sem rolagem horizontal, com bloco longo e diálogo aberto', async ({ page, servidor }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const longo = { ...BLOCO, titulo: 'Título muito longo '.repeat(8), texto: 'palavra'.repeat(60) };
    await abrir(page, servidor, { blocos: [longo] });
    expect(await semRolagemHorizontal(page)).toBe(true);
    await preencherValido(page);
    await page.locator('#bloco-enviar').click();
    await expect(page.getByRole('dialog')).toBeVisible();
    expect(await semRolagemHorizontal(page)).toBe(true);
    await page.keyboard.press('Escape');
    expect(servidor.gravacoes).toEqual([]);
  });

  test('a navegação leva às outras páginas e o chat público não mostra nada da administração', async ({ page, servidor }) => {
    await abrir(page, servidor, { escolher: false });
    await page.getByRole('navigation', { name: 'Seções da administração' }).getByRole('link', { name: 'Cadastro da base' }).click();
    await expect(page).toHaveURL(/\/admin\/$/);
    await page.goto('/admin/conteudo');
    await expect(page).toHaveURL(/\/admin\/conteudo\/$/);
    await page.getByRole('navigation', { name: 'Seções da administração' }).getByRole('link', { name: 'Saúde do sistema' }).click();
    await expect(page).toHaveURL(/\/admin\/saude\/$/);
    await page.goto('/');
    expect(await page.locator('body').innerText()).not.toMatch(/Informações do chatbot|administrativo|Assuntos, serviços e fontes/i);
    expect(await page.content()).not.toMatch(/admin\/conteudo|conteudo\.js/);
  });
});
