// Página "Gestão de conteúdo > Conteúdo para respostas" (/admin/conteudo/) no navegador. TODAS as chamadas /__admin/* são simuladas aqui (page.route):
// nenhuma gravação real acontece e a base de serviços não é lida nem alterada. Qualquer outra requisição que não seja GET local
// ou que vá para a rede externa é bloqueada e faz o teste falhar.
import { test as base, expect } from '@playwright/test';
import { focoVisivel, semRolagemHorizontal } from './base.js';

const ORIGEM_LOCAL = `http://localhost:${process.env.E2E_PORTA ?? '5173'}`;
const TOKEN = 'ab'.repeat(32);
const IDS_TECNICOS = /\bbc-[0-9a-f]{6,}|\bservico-ficticio\b|assunto-ficticio|\bf-um\b|\bf-dois\b|\bf-velha\b|hashConteudo|[0-9a-f]{64}|X-Admin-Token|teste_local|\brev-\d+\b|revisao_divergente|validado_materialmente/i;
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

// Simulador da revisão: estado mínimo (fontes revisadas, informações aceitas, versão congelada) e revisão otimista em "rev-N".
function revisaoSimulada(estado) {
  const editavel = estado.versao === 'rascunho';
  const fontes = FONTES.map((f) => {
    const revogada = f.vigencia.situacao === 'revogada';
    const revisada = estado.revisadas.includes(f.id);
    const usadaPorBloco = estado.blocos.some((b) => b.fonteIds.includes(f.id));
    return { id: f.id, titulo: f.titulo, forma: f.id === 'f-dois' ? 'texto' : 'link', revisada, revogada, usadaPorBloco, podeRevisar: editavel && !revisada && !revogada, podeEditar: editavel && !revogada, podeExcluir: editavel, texto: 'TEXTO-ORIGINAL-SECRETO' };
  });
  const blocos = estado.blocos.map((b) => {
    const aceito = estado.aceitos.includes(b.id);
    const fontesPendentes = b.fonteIds.filter((id) => !estado.revisadas.includes(id));
    return { id: b.id, titulo: b.titulo, aceito, fontesPendentes, podeAceitar: editavel && !aceito && fontesPendentes.length === 0, podeReabrir: editavel && aceito, podeRejeitar: editavel && !aceito };
  });
  const pendencias = [];
  if (!blocos.some((b) => b.aceito)) pendencias.push({ codigo: 'sem_bloco_aceito' });
  for (const b of blocos) if (!b.aceito) pendencias.push({ codigo: 'bloco_pendente', id: b.id, titulo: b.titulo });
  for (const f of fontes) if (f.usadaPorBloco && !f.revisada && !f.revogada) pendencias.push({ codigo: 'fonte_pendente', id: f.id, titulo: f.titulo });
  return {
    servicoId: 'servico-ficticio', versaoId: 'servico-ficticio-v1', estadoVersao: estado.versao, rotulo: editavel ? 'Em elaboração' : 'Pronto para publicar', revisaoPendente: pendencias.length > 0,
    editavel, revisao: `rev-${estado.rev}`, resumo: { fontesPendentes: fontes.filter((f) => !f.revisada && !f.revogada).length, informacoesPendentes: blocos.filter((b) => !b.aceito).length, informacoesAceitas: blocos.filter((b) => b.aceito).length },
    fontes, blocos, pendencias, podeConcluir: editavel && pendencias.length === 0,
  };
}

const test = base.extend({
  violacoes: async ({}, usar) => { await usar([]); },
  servidor: async ({ page, violacoes }, usar) => {
    const estado = { versao: 'rascunho', blocos: [], atraso: 0, erro: null, revisadas: [], aceitos: [], rev: 1, numero: 1 };
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
          servicoId: 'servico-ficticio', versaoId: 'servico-ficticio-v1', manifesto: { estado: estado.versao, numero: estado.numero }, service: { nome: 'Serviço Fictício', sigla: 'SF' },
          fontes: { fontes: FONTES }, conteudoAssistente: { blocos: [BLOCO_TESTE, ...estado.blocos] }, revisaoFontes: 'cd'.repeat(32),
        });
      }
      if (p === `${base}/revisao` && m === 'GET') return json(200, revisaoSimulada(estado));
      if ((p.startsWith(`${base}/revisao/`) || p === `${base}/nova-versao`) && m === 'POST') {
        const corpo = r.postDataJSON();
        gravacoes.push({ metodo: m, caminho: p, corpo, tipo: r.headers()['content-type'], texto: r.postData() });
        if (estado.atraso) await new Promise((fim) => setTimeout(fim, estado.atraso));
        if (estado.erro) return json(estado.erro.status, estado.erro.corpo);
        if (p.endsWith('/nova-versao')) { estado.versao = 'rascunho'; estado.numero += 1; estado.revisadas = []; estado.aceitos = []; estado.rev += 1; return json(201, { numero: estado.numero }); }
        if (corpo.revisao !== `rev-${estado.rev}`) return json(409, { erro: 'revisao_divergente' });
        if (estado.versao !== 'rascunho') return json(409, { erro: 'versao_congelada' });
        estado.rev += 1;
        if (p.endsWith('/revisao/fontes')) estado.revisadas.push(corpo.fonteId);
        else if (p.endsWith('/blocos/aceitar')) estado.aceitos.push(corpo.blocoId);
        else if (p.endsWith('/blocos/reabrir')) estado.aceitos = estado.aceitos.filter((id) => id !== corpo.blocoId);
        else if (p.endsWith('/blocos/rejeitar')) estado.blocos = estado.blocos.filter((b) => b.id !== corpo.blocoId);
        else if (p.endsWith('/revisao/concluir')) estado.versao = 'validado_materialmente';
        return json(200, { revisao: `rev-${estado.rev}` });
      }
      if (p.startsWith(`${base}/conhecimentos`)) {
        estado.rev += 1;
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

async function abrir(page, servidor, { blocos = [], versao = 'rascunho', escolher = true, consulta = '' } = {}) {
  servidor.estado.blocos = structuredClone(blocos);
  servidor.estado.versao = versao;
  await page.goto(`/admin/conteudo/${consulta}`);
  await expect(page.locator('#assunto')).toBeEnabled();
  if (escolher) {
    await page.selectOption('#assunto', { label: 'Assunto Fictício' });
    await page.selectOption('#servico', { label: 'Serviço Fictício' });
    await expect(page.locator('#servico-situacao')).toBeVisible();
    await expect(page.locator('#blocos')).toHaveAttribute('aria-busy', 'false');
  }
}
const abrirForm = async (page) => {
  if (await page.locator('#cartao-form').isHidden()) await page.getByRole('button', { name: 'Incluir informação', exact: true }).click();
};
const preencherValido = async (page) => {
  await abrirForm(page);
  await page.getByLabel('Tema da informação', { exact: true }).fill('Título novo');
  await page.getByLabel('O que o chatbot deve informar ao cidadão?').fill('Texto orientativo fictício.');
  await page.getByLabel('Fonte Um (Página oficial)').check();
  await page.getByLabel(/Onde esta informação aparece na fonte\? \(Fonte Um\)/).fill('Seção 5');
};

test.describe('Blocos de conhecimento (simulado, sem gravação real)', () => {
  test('carrega sessão e catálogo, mostra a navegação e não grava nada ao abrir', async ({ page, servidor }) => {
    await abrir(page, servidor, { escolher: false });
    await expect(page.getByRole('heading', { level: 1, name: /Conteúdo para respostas/ })).toBeVisible();
    expect(await page.locator('body').innerText()).not.toMatch(/demonstra|sem autenticação/i);
    const nav = page.getByRole('navigation', { name: 'Seções da administração' });
    await expect(nav.getByRole('link')).toHaveText(['Gestão de conteúdo', 'Conteúdo para respostas', 'Saúde do sistema']);
    await expect(nav.getByRole('link', { name: 'Conteúdo para respostas' })).toHaveAttribute('aria-current', 'page');
    await expect(page.getByText('Cadastre uma informação completa e comprovada. O chatbot poderá usá-la para responder diferentes perguntas dos cidadãos.')).toBeVisible();
    await expect(page.getByRole('listitem').filter({ hasText: 'Indique a fonte que comprova a informação.' })).toBeVisible();
    await expect(page.locator('#cartao-form')).toBeHidden();
    await expect(page.getByRole('button', { name: 'Incluir informação', exact: true })).toBeHidden();
    await expect(page.locator('#selecao-completa')).toBeVisible();
    await expect(page.locator('#servico-compacto')).toBeHidden();
    await expect(page.locator('svg[aria-hidden="true"]')).toHaveCount(7);
    for (const tamanho of await page.locator('.icone svg').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().width)).filter((w) => w > 0))) expect([20, 28]).toContain(tamanho);
    expect(await page.locator('.icone svg').first().evaluate((e) => getComputedStyle(e).stroke)).toBe(await page.locator('.icone').first().evaluate((e) => getComputedStyle(e).color));
    expect(await page.locator('main').innerText()).not.toMatch(/\p{Extended_Pictographic}/u);
    await expect(page.locator('#bloco-enviar')).toBeDisabled();
    await expect(page.locator('#blocos')).toContainText('Escolha um serviço para ver as informações.');
    expect(servidor.gravacoes).toEqual([]);
    expect(await page.locator('body').innerText()).not.toMatch(IDS_TECNICOS);
  });

  test('selecionar assunto e serviço mostra nome, versão, situação em linguagem comum e "Não publicada"; estado vazio; sem ids', async ({ page, servidor }) => {
    await abrir(page, servidor);
    await abrirForm(page);
    const situacao = page.locator('#servico-situacao');
    await expect(situacao).toContainText('Serviço Fictício');
    await expect(situacao).toContainText('Versão 1');
    await expect(situacao).toContainText('Em elaboração');
    await expect(situacao).toContainText('Revisão pendente');
    await expect(situacao).toContainText('Não publicada');
    expect(await situacao.innerText()).not.toMatch(/rascunho/i);
    await expect(page.locator('#blocos')).toContainText('Nenhuma orientação foi cadastrada para este serviço.');
    await expect(page.getByLabel('Fonte Um (Página oficial)')).toBeVisible();
    await expect(page.getByLabel('Fonte Dois (Manual)')).toBeVisible();
    await expect(page.getByLabel(/Norma Antiga \(Legislação\)/)).toBeDisabled();
    await expect(page.locator('#bloco-enviar')).toBeEnabled();
    expect(await page.locator('body').innerText()).not.toMatch(IDS_TECNICOS);
    expect(await page.locator('body').innerText()).not.toContain('Apenas orienta.');
  });

  test('a lista vem antes do formulário, que fica recolhido até a pessoa pedir; o placeholder orienta a localização', async ({ page, servidor }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await abrir(page, servidor, { blocos: [BLOCO] });
    await expect(page.locator('#cartao-form')).toBeHidden();
    await page.getByRole('button', { name: 'Incluir informação', exact: true }).click();
    await expect(page.locator('#titulo-form')).toBeFocused();
    await expect(page.getByRole('button', { name: 'Incluir informação', exact: true })).toHaveAttribute('aria-expanded', 'true');
    const lista = await page.locator('#blocos').boundingBox();
    const form = await page.locator('#form-bloco').boundingBox();
    expect(form.y).toBeGreaterThan(lista.y + lista.height - 1);
    await page.getByLabel('Fonte Um (Página oficial)').check();
    await expect(page.getByLabel(/Onde esta informação aparece na fonte\? \(Fonte Um\)/)).toHaveAttribute('placeholder', 'Ex.: página 3');
    expect(await semRolagemHorizontal(page)).toBe(true);
  });
  test('lista só blocos de conhecimento, com fontes por título e datas DD-MM-AAAA', async ({ page, servidor }) => {
    await abrir(page, servidor, { blocos: [BLOCO] });
    const lista = page.locator('#blocos');
    await expect(lista).toContainText('Bloco existente');
    await expect(lista).toContainText('Fonte Um — Seção 2');
    await expect(lista).toContainText('Documentos ou links usados');
    await expect(lista).toContainText('Avisos ou limitações');
    await expect(lista).toContainText('Pode estar desatualizado.');
    await expect(lista).toContainText('Situação: Em elaboração');
    await expect(lista).toContainText('Ainda não disponível no chatbot.');
    await expect(lista).toContainText('Criado em 09-11-2026 · Atualizado em 10-11-2026');
    expect(await page.locator('body').innerText()).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    expect(await page.locator('body').innerText()).not.toMatch(IDS_TECNICOS);
  });

  test('a localização é obrigatória para cada fonte marcada e nada é enviado', async ({ page, servidor }) => {
    await abrir(page, servidor);
    await abrirForm(page);
    await page.getByLabel('Tema da informação', { exact: true }).fill('Título novo');
    await page.getByLabel('O que o chatbot deve informar ao cidadão?').fill('Texto orientativo fictício.');
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
    await expect(dialogo).toContainText('ainda não disponível no chatbot');
    expect(await dialogo.innerText()).not.toMatch(IDS_TECNICOS);
    await page.getByRole('button', { name: 'Voltar e corrigir' }).click();
    await expect(dialogo).toBeHidden();
    await expect(page.locator('#bloco-enviar')).toBeFocused();
    expect(servidor.gravacoes).toEqual([]);
    await page.locator('#bloco-enviar').click();
    await page.getByRole('button', { name: 'Confirmar e salvar' }).click();
    await expect(page.locator('#status')).toContainText('Informação salva. Ela está em elaboração e ainda não está disponível no chatbot.');
    await expect(page.locator('#blocos li.bloco').filter({ hasText: 'Título novo' })).toBeFocused();
    await expect(page.locator('#cartao-form')).toBeHidden();
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
    await expect(page.locator('#titulo-form')).toHaveText('Incluir informação');
    await expect(page.getByLabel('Tema da informação', { exact: true })).toHaveValue('');
    expect(servidor.gravacoes).toEqual([]);
    await page.getByRole('button', { name: 'Editar a informação Bloco existente' }).click();
    await page.getByLabel('Tema da informação', { exact: true }).fill('Bloco editado');
    await page.locator('#bloco-enviar').click();
    await expect(page.getByRole('dialog')).toContainText('Confirmar alteração da informação');
    await page.getByRole('button', { name: 'Confirmar e salvar' }).click();
    await expect(page.locator('#status')).toContainText('Informação alterada.');
    await expect(page.locator('#blocos li.bloco').filter({ hasText: 'Bloco editado' })).toBeFocused();
    await expect(page.locator('#blocos')).toContainText('Bloco editado');
    await expect(page.locator('#blocos')).toContainText('Atualizado em 12-11-2026');
    expect(servidor.gravacoes.map((g) => g.metodo)).toEqual(['PATCH']);
    for (const proibido of ['id', 'criadoEm', 'atualizadoEm', 'statusValidacao', 'revisaoAtualidade', 'ambiente', 'publicado', 'origem', 'tipo']) expect(servidor.gravacoes[0].corpo).not.toHaveProperty(proibido);
  });

  test('descartar: confirmação própria; Voltar não descarta; Confirmar envia a rota de rejeição com a revisão atual e mostra o estado vazio', async ({ page, servidor }) => {
    await abrir(page, servidor, { blocos: [BLOCO] });
    const gatilho = page.getByRole('button', { name: 'Excluir informação: Bloco existente' });
    await gatilho.click();
    const dialogo = page.getByRole('dialog');
    await expect(dialogo).toContainText('Excluir esta informação?');
    await expect(dialogo).toContainText('Bloco existente');
    await expect(page.getByRole('button', { name: 'Voltar', exact: true })).toBeFocused();
    await page.getByRole('button', { name: 'Voltar', exact: true }).click();
    await expect(gatilho).toBeFocused();
    expect(servidor.gravacoes).toEqual([]);
    await gatilho.click();
    await page.getByRole('button', { name: 'Confirmar exclusão' }).click();
    await expect(page.locator('#status')).toContainText('Informação excluída.');
    await expect(page.locator('#status')).toBeFocused();
    await expect(page.locator('#blocos')).toContainText('Nenhuma orientação foi cadastrada para este serviço.');
    expect(servidor.gravacoes).toHaveLength(1);
    expect(servidor.gravacoes[0].caminho).toMatch(/\/revisao\/blocos\/rejeitar$/);
    expect(servidor.gravacoes[0].corpo).toEqual({ blocoId: BLOCO.id, revisao: 'rev-1' });
  });

  test('versão congelada: situação "Pronto para publicar", nenhuma ação de edição ou revisão e nenhum botão de publicação', async ({ page, servidor }) => {
    await abrir(page, servidor, { blocos: [BLOCO], versao: 'em_validacao' });
    await expect(page.locator('#servico-situacao')).toContainText('Pronto para publicar');
    await expect(page.locator('#situacao-edicao')).toContainText('bloqueados');
    await expect(page.locator('#bloco-enviar')).toBeDisabled();
    await expect(page.locator('#cartao-form')).toBeHidden();
    for (const nome of [/^Editar/, /^Aceitar/, /^Excluir/, /^Reabrir/, /^Marcar como revisado/, /^Concluir revisão$/]) await expect(page.getByRole('button', { name: nome })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /publicar/i })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Criar nova versão para editar' })).toBeVisible();
    expect(servidor.gravacoes).toEqual([]);
  });

  test('documentos e links: tipo e situação em linguagem comum, aviso fixo, texto original nunca exibido e Marcar como revisado envia a revisão atual', async ({ page, servidor }) => {
    await abrir(page, servidor, { blocos: [BLOCO] });
    const fontes = page.locator('#fontes-revisao');
    await expect(page.locator('#cartao-fontes')).not.toContainText('demonstração');
    await expect(fontes.locator('li').filter({ hasText: 'Fonte Um' })).toContainText('Tipo: Link');
    await expect(fontes.locator('li').filter({ hasText: 'Fonte Dois' })).toContainText('Tipo: Texto informado');
    await expect(page.locator('#fontes-excluidas')).toHaveCount(0);
    const velha = fontes.locator('li').filter({ hasText: 'Norma Antiga' });
    await expect(velha).toContainText('Situação: Revogada');
    await expect(velha.getByRole('button', { name: /^Marcar como revisado/ })).toHaveCount(0);
    await expect(velha.getByRole('button', { name: 'Excluir fonte: Norma Antiga' })).toBeVisible();
    await expect(velha.getByRole('button', { name: /^Editar fonte/ })).toHaveCount(0);
    await expect(fontes.getByRole('button', { name: 'Marcar como revisado: Norma Antiga' })).toHaveCount(0);
    expect(await page.locator('body').innerText()).not.toContain('TEXTO-ORIGINAL-SECRETO');
    await fontes.getByRole('button', { name: 'Marcar como revisado: Fonte Um' }).click();
    await expect(page.locator('#status')).toContainText('Documento ou link marcado como revisado.');
    await expect(fontes.locator('li').filter({ hasText: 'Fonte Um' })).toBeFocused();
    await expect(fontes.locator('li').filter({ hasText: 'Fonte Um' })).toContainText('Situação: Revisado');
    expect(servidor.gravacoes[0].corpo).toEqual({ fonteId: 'f-um', revisao: 'rev-1' });
    expect(await page.locator('body').innerText()).not.toMatch(IDS_TECNICOS);
  });

  test('informações: aceitar só depois de revisar a fonte (com explicação em linguagem comum), reabrir para correção e aceitar de novo', async ({ page, servidor }) => {
    await abrir(page, servidor, { blocos: [BLOCO] });
    const aceitar = page.getByRole('button', { name: 'Aceitar informação: Bloco existente' });
    await expect(aceitar).toBeDisabled();
    await expect(page.locator('#blocos')).toContainText('Para aceitar esta informação, marque antes como revisado: "Fonte Um".');
    await page.getByRole('button', { name: 'Marcar como revisado: Fonte Um' }).click();
    await expect(page.locator('#status')).toContainText('marcado como revisado');
    await expect(aceitar).toBeEnabled();
    await aceitar.click();
    await expect(page.locator('#status')).toContainText('Informação aceita.');
    await expect(page.locator('#blocos')).toContainText('Situação: Aceita');
    await expect(page.getByRole('button', { name: /^Editar a informação/ })).toHaveCount(0);
    await page.getByRole('button', { name: 'Reabrir para correção: Bloco existente' }).click();
    await expect(page.locator('#status')).toContainText('Informação reaberta para correção');
    await expect(page.locator('#blocos')).toContainText('Situação: Em elaboração');
    await page.getByRole('button', { name: 'Aceitar informação: Bloco existente' }).click();
    await expect(page.locator('#status')).toContainText('Informação aceita.');
    expect(servidor.gravacoes.map((g) => g.caminho.split('/').slice(-2).join('/'))).toEqual(['revisao/fontes', 'blocos/aceitar', 'blocos/reabrir', 'blocos/aceitar']);
    expect(servidor.gravacoes.every((g) => typeof g.corpo.revisao === 'string' && g.corpo.revisao.startsWith('rev-'))).toBe(true);
  });

  test('concluir: pendências em frases comuns, botão só com tudo pronto, confirmação própria, congelamento e nova versão com {}', async ({ page, servidor }) => {
    await abrir(page, servidor, { blocos: [BLOCO] });
    await expect(page.locator('#pendencias')).toContainText('Inclua e aceite pelo menos uma informação para concluir a revisão.');
    await expect(page.locator('#pendencias')).toContainText('A informação "Bloco existente" ainda não foi aceita nem excluída.');
    expect(await page.locator('#cartao-conclusao').innerText()).not.toMatch(/sem_bloco_aceito|bloco_pendente/);
    await expect(page.getByRole('button', { name: 'Concluir revisão', exact: true })).toBeHidden();
    await page.getByRole('button', { name: 'Marcar como revisado: Fonte Um' }).click();
    await expect(page.locator('#status')).toContainText('marcado como revisado');
    await page.getByRole('button', { name: 'Aceitar informação: Bloco existente' }).click();
    await expect(page.locator('#status')).toContainText('Informação aceita.');
    await expect(page.locator('#pendencias')).toBeEmpty();
    const concluir = page.getByRole('button', { name: 'Concluir revisão', exact: true });
    await expect(concluir).toBeVisible();
    await concluir.click();
    const dialogo = page.getByRole('dialog');
    await expect(dialogo).toContainText('Depois de concluir, esta versão não poderá mais ser editada. Para fazer novas alterações, será necessário criar uma nova versão.');
    await page.getByRole('button', { name: 'Voltar', exact: true }).click();
    await expect(concluir).toBeFocused();
    expect(servidor.gravacoes.some((g) => g.caminho.endsWith('/concluir'))).toBe(false);
    await concluir.click();
    await page.getByRole('button', { name: 'Confirmar conclusão' }).dblclick();
    await expect(page.locator('#status')).toContainText('Revisão concluída.');
    await expect(page.locator('#status')).toBeFocused();
    expect(servidor.gravacoes.filter((g) => g.caminho.endsWith('/concluir'))).toHaveLength(1);
    await expect(page.locator('#servico-situacao')).toContainText('Pronto para publicar');
    for (const nome of [/^Editar/, /^Aceitar/, /^Excluir/, /^Reabrir/, /^Marcar como revisado/, /^Concluir revisão$/, /publicar/i]) await expect(page.getByRole('button', { name: nome })).toHaveCount(0);
    await page.getByRole('button', { name: 'Criar nova versão para editar' }).click();
    await expect(page.locator('#status')).toContainText('Nova versão criada.');
    await expect(page.locator('#servico-situacao')).toContainText('Versão 2');
    await expect(page.locator('#servico-situacao')).toContainText('Em elaboração');
    const nova = servidor.gravacoes.at(-1);
    expect(nova.caminho).toMatch(/\/nova-versao$/);
    expect(nova.texto).toBe('{}');
    expect(nova.tipo).toContain('application/json');
  });

  test('conflito de revisão: mensagem comum, dados recarregados e nada de hash na tela', async ({ page, servidor }) => {
    await abrir(page, servidor, { blocos: [BLOCO] });
    servidor.estado.rev += 5; // outro lugar mudou o conteúdo depois que a página foi aberta
    await page.getByRole('button', { name: 'Marcar como revisado: Fonte Um' }).click();
    await expect(page.locator('#status')).toContainText('O conteúdo mudou. Os dados foram atualizados; confira e tente de novo.');
    await expect(page.locator('#status')).toHaveAttribute('data-tipo', 'erro');
    await expect(page.locator('#status')).toBeFocused();
    await page.getByRole('button', { name: 'Marcar como revisado: Fonte Um' }).click();
    await expect(page.locator('#status')).toContainText('marcado como revisado');
    expect(servidor.gravacoes.map((g) => g.corpo.revisao)).toEqual(['rev-1', 'rev-6']);
    expect(await page.locator('body').innerText()).not.toMatch(IDS_TECNICOS);
  });

  test('?servico= seleciona assunto e serviço sem mostrar o id; valores inválidos ou desconhecidos são ignorados', async ({ page, servidor }) => {
    await abrir(page, servidor, { escolher: false, consulta: '?servico=servico-ficticio' });
    await expect(page.locator('#servico-situacao')).toBeVisible();
    await expect(page.locator('#assunto')).toHaveValue('assunto-ficticio');
    await expect(page.locator('#servico')).toHaveValue('servico-ficticio');
    await expect(page.locator('#status')).toContainText('Serviço aberto para revisão.');
    await expect(page.locator('#servico-compacto')).toBeVisible();
    await expect(page.locator('#selecao-completa')).toBeHidden();
    await expect(page.locator('#voltar-gestao')).toHaveAttribute('href', '../?servico=servico-ficticio');
    await expect(page.getByRole('navigation', { name: 'Seções da administração' }).getByRole('link').first()).toHaveAttribute('href', '../?servico=servico-ficticio');
    expect(await page.locator('body').innerText()).not.toMatch(IDS_TECNICOS);
    await page.getByRole('button', { name: 'Trocar de serviço', exact: true }).click();
    await expect(page.locator('#selecao-completa')).toBeVisible();
    await expect(page.locator('#assunto')).toBeFocused();
    for (const ruim of ['?servico=../x', '?servico=nao-existe', '?servico=A%20B']) {
      await abrir(page, servidor, { escolher: false, consulta: ruim });
      await expect(page.locator('#status')).toContainText('Sessão iniciada. Escolha o assunto e o serviço.');
      await expect(page.locator('#servico-situacao')).toBeHidden();
    }
    expect(servidor.gravacoes).toEqual([]);
  });

  test('erros do servidor viram mensagens curtas, sem texto bruto, e a lista é recarregada quando o estado mudou', async ({ page, servidor }) => {
    await abrir(page, servidor, { blocos: [BLOCO] });
    servidor.estado.erro = { status: 409, corpo: { erro: 'versao_congelada', detalhe: 'SEGREDO-BRUTO' } };
    await page.getByRole('button', { name: 'Excluir informação: Bloco existente' }).click();
    await page.getByRole('button', { name: 'Confirmar exclusão' }).click();
    await expect(page.locator('#status')).toContainText('já foi concluída e não pode mais ser editada');
    await expect(page.locator('#status')).toHaveAttribute('data-tipo', 'erro');
    await expect(page.locator('#status')).toBeFocused();
    await expect(page.getByRole('dialog')).toBeHidden();
    expect(await page.locator('body').innerText()).not.toContain('SEGREDO-BRUTO');
    servidor.estado.erro = { status: 500, corpo: { erro: 'indisponivel', detalhe: 'SEGREDO-BRUTO' } };
    await preencherValido(page);
    await page.locator('#bloco-enviar').click();
    await page.getByRole('button', { name: 'Confirmar e salvar' }).click();
    await expect(page.locator('#status')).toContainText('Nada foi alterado');
    expect(await page.locator('body').innerText()).not.toContain('SEGREDO-BRUTO');
  });

  test('clique duplo em Confirmar envia uma única gravação', async ({ page, servidor }) => {
    servidor.estado.atraso = 400;
    await abrir(page, servidor);
    await preencherValido(page);
    await page.locator('#bloco-enviar').click();
    await page.getByRole('button', { name: 'Confirmar e salvar' }).dblclick();
    await expect(page.locator('#status')).toContainText('Informação salva. Ela está em elaboração e ainda não está disponível no chatbot.');
    expect(servidor.gravacoes.filter((g) => g.metodo === 'POST')).toHaveLength(1);
  });

  test('teclado: ordem de foco, foco visível, Esc fecha a confirmação devolvendo o foco', async ({ page, servidor }) => {
    await abrir(page, servidor, { blocos: [BLOCO] });
    await abrirForm(page);
    await page.getByLabel('Tema da informação', { exact: true }).focus();
    expect(await focoVisivel(page)).toBe(true);
    await page.keyboard.press('Tab');
    await expect(page.getByLabel('O que o chatbot deve informar ao cidadão?')).toBeFocused();
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
    await page.getByRole('navigation', { name: 'Seções da administração' }).getByRole('link', { name: 'Gestão de conteúdo' }).click();
    await expect(page).toHaveURL(/\/admin\/$/);
    await page.goto('/admin/conteudo');
    await expect(page).toHaveURL(/\/admin\/conteudo\/$/);
    await page.getByRole('navigation', { name: 'Seções da administração' }).getByRole('link', { name: 'Saúde do sistema' }).click();
    await expect(page).toHaveURL(/\/admin\/saude\/$/);
    await page.goto('/');
    expect(await page.locator('body').innerText()).not.toMatch(/Conteúdo para respostas|administrativo|Assuntos, serviços e fontes/i);
    expect(await page.content()).not.toMatch(/admin\/conteudo|conteudo\.js/);
  });
});
