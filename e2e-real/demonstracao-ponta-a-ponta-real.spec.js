// Sprint 8, Passo 8E (Issue #30): cenário de demonstração ponta a ponta, sem page.route e sem mocks, no Vite de verdade com a
// base copiada para uma pasta temporária (preparar.js). Tudo sobre a LAC, com dados FICTÍCIOS: Maria Silva (Cadastrante) cadastra
// e envia; tenta validar e publicar pela tela e por pedido direto (recusado pelo servidor e registrado em negadas/); Carlos Silva
// (Revisor) pede ajustes, valida, autoriza, publica e revoga. Maria Silva e Carlos Silva são usuários fictícios de demonstração.
// A pasta services/ da cópia é restaurada antes e depois; data/ da cópia acumula entre specs, por isso só as linhas NOVAS contam.
// A base real nunca é tocada (zz-base-real.spec.js confere services/ e data/ reais por hash).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';
import { hashDaPasta } from './preparar.js';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const NOME_LAC = 'Licença por Adesão e Compromisso';
const TERMO = 'quorvalina';
const TITULO_FONTE = 'Texto Quorvalina';
const TITULO_INFO = 'Informação quorvalina';
const TEXTO = 'Informação fictícia de demonstração sobre quorvalina, usada só no cenário ponta a ponta.';
const PERGUNTA = 'O que diz a informação fictícia de demonstração sobre quorvalina?';
const MOTIVO_AJUSTES = 'Ajustar a orientação conforme o roteiro fictício da demonstração.';
const MOTIVO_REVOGACAO = 'Conteúdo fictício revogado ao fim da demonstração automatizada.';
const MARCADOR = 'zzcorpo-demo';
// Texto real da faixa do chat sem conteúdo publicado (services/assistant-messages.js, FAIXA_TESTE_LOCAL; só no servidor de desenvolvimento).
const FAIXA_SEM_PUBLICACAO = 'Modo de teste local — conteúdo em validação, não oficial.';
// Texto real do bloqueio por perfil (admin/admin-logic.js, descricaoDoBloqueio).
const BLOQUEIO_CADASTRANTE = 'Esta ação é feita pelo perfil Revisor. Você entrou como Cadastrante.';
const MARIA = { usuarioId: 'maria-silva', perfil: 'cadastrante', setor: 'CLABI' };
const CARLOS = { usuarioId: 'carlos-silva', perfil: 'revisor', setor: 'CLABI' };
const PROIBIDOS_NO_HISTORICO = ['Maria', 'Carlos', 'Silva', TITULO_FONTE, TITULO_INFO, 'http', MARCADOR];

const copia = () => process.env.SEMA_REAL_COPIA;
const naCopia = (...partes) => path.join(copia(), ...partes);
const PRIVADO = (...partes) => naCopia('data', 'admin-private', ...partes);
/** Linhas (já interpretadas) de um .jsonl da cópia; arquivo ausente = nenhuma linha. */
function linhas(arquivo) {
  if (!fs.existsSync(arquivo)) return [];
  return fs.readFileSync(arquivo, 'utf8').split('\n').filter((l) => l.trim() !== '').map((l) => JSON.parse(l));
}
const lerJson = (arquivo) => JSON.parse(fs.readFileSync(arquivo, 'utf8'));
const entradaLac = () => lerJson(naCopia('services', 'registry.json')).servicos.find((s) => s.id === 'lac');
const arquivosPublicos = () => {
  const pasta = naCopia('services', 'lac', 'publico');
  return fs.existsSync(pasta) ? fs.readdirSync(pasta).filter((n) => /^conteudo-[0-9a-f]{16}\.json$/.test(n)) : [];
};
/** Todos os valores de `id` (texto) dos JSON das versões da LAC na cópia: fontes, blocos, entradas e demais itens gravados. */
function idsDaBaseDaCopia() {
  const ids = new Set();
  const coletar = (v) => {
    if (Array.isArray(v)) v.forEach(coletar);
    else if (v !== null && typeof v === 'object') {
      if (typeof v.id === 'string') ids.add(v.id);
      Object.values(v).forEach(coletar);
    }
  };
  const visitar = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const caminho = path.join(dir, e.name);
      if (e.isDirectory()) visitar(caminho);
      else if (e.name.endsWith('.json')) coletar(lerJson(caminho));
    }
  };
  visitar(naCopia('services', 'lac', 'versoes'));
  return ids;
}
const manifestoDa = (versaoId) => naCopia('services', 'lac', 'versoes', `v${/-v(\d+)$/.exec(versaoId)[1]}`, 'versao.json');

function restaurarServicosDaCopia() {
  const destino = naCopia('services');
  fs.rmSync(destino, { recursive: true, force: true });
  fs.cpSync(path.join(RAIZ, 'services'), destino, { recursive: true });
}
test.beforeAll(restaurarServicosDaCopia);
test.afterAll(restaurarServicosDaCopia);

// Sessão (Passo 8B): única no servidor e só em memória. A troca de usuário usa a rota da sessão e recarrega a página de revisão.
async function encerrarSessao(page) {
  const corpo = await (await page.request.get('/__admin/sessao')).json();
  if (typeof corpo.token === 'string') await page.request.delete('/__admin/sessao', { headers: { 'X-Admin-Token': corpo.token } });
}
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

const botao = (page, nome) => page.getByRole('button', { name: nome, exact: true });
const status = (page) => page.locator('#status');

async function revisarEAceitar(page) {
  await page.locator('#aba-fontes').click();
  const revisar = botao(page, `Marcar como revisado: ${TITULO_FONTE}`);
  if (await revisar.count()) { await revisar.click(); await expect(status(page)).toContainText('marcado como revisado'); }
  await page.locator('#aba-informacoes').click();
  await botao(page, `Aceitar informação: ${TITULO_INFO}`).click();
  await expect(status(page)).toContainText('Informação aceita.');
}
async function enviarComoMaria(page) {
  await botao(page, 'Enviar para revisão').click();
  await expect(page.getByRole('dialog')).toContainText('aguardará a análise do Revisor');
  await botao(page, 'Confirmar envio').click();
  await expect(status(page)).toContainText('Versão enviada para revisão.');
  await expect(page.locator('#servico-situacao')).toContainText('Em análise');
}

/**
 * Controle fora do perfil (Passo 8C): visível, focável (sem o atributo disabled), com aria-disabled="true" e aria-describedby
 * apontando para a ajuda com a frase do bloqueio. O clique é forçado porque o Playwright trata aria-disabled como desabilitado;
 * a tela bloqueia o clique e só mostra a mensagem em #status.
 */
async function conferirBloqueio(page, nome, idAjuda) {
  const b = botao(page, nome);
  await expect(b).toBeVisible();
  await expect(b).toHaveAttribute('aria-disabled', 'true');
  expect(await b.evaluate((el) => el.disabled)).toBe(false);
  expect((await b.getAttribute('aria-describedby')).split(' ')).toContain(idAjuda);
  await expect(page.locator(`#${idAjuda}`)).toHaveText(BLOQUEIO_CADASTRANTE);
  await b.focus();
  await expect(b).toBeFocused();
  await b.click({ force: true });
  await expect(status(page)).toHaveText(BLOQUEIO_CADASTRANTE);
}

async function perguntar(page) {
  await page.goto('/');
  const campo = page.getByLabel('Escreva sua dúvida');
  await campo.fill(PERGUNTA);
  await campo.press('Enter');
  await expect(page.locator('#mensagens article')).toHaveCount(3);
  return page.locator('.message--assistente').last();
}

test('demonstração ponta a ponta na LAC: cadastro, recusa por perfil (tela e pedido direto), ajustes, validação, publicação e revogação', async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const capturar = async (nome) => testInfo.attach(nome, { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
  const antes = {
    revisao: linhas(PRIVADO('revisao', 'lac.jsonl')).length,
    decisoes: linhas(PRIVADO('decisoes', 'lac.jsonl')).length,
    negadas: linhas(PRIVADO('negadas', 'historico.jsonl')).length,
  };
  const novas = (arquivo, chave) => linhas(arquivo).slice(antes[chave]);
  const negadasNovas = () => novas(PRIVADO('negadas', 'historico.jsonl'), 'negadas');
  const enviados = [];
  page.on('request', (r) => { if (r.method() === 'POST' && r.url().includes('/__admin/servicos/')) enviados.push(new URL(r.url()).pathname); });
  const postsPara = (final) => enviados.filter((c) => c.endsWith(final)).length;

  // 0. Preparo: sem conteúdo publicado na cópia; o chat mostra a faixa de teste local e não traz o texto.
  expect(arquivosPublicos()).toHaveLength(0);
  expect(entradaLac()).toMatchObject({ publicado: false, versaoPublicadaId: null });
  const inicial = await perguntar(page);
  await expect(page.locator('meta[name="conteudo-publico"]')).toHaveCount(0);
  await expect(page.locator('#faixa-teste')).toBeVisible();
  await expect(page.locator('#faixa-teste')).toHaveText(FAIXA_SEM_PUBLICACAO);
  await expect(inicial).not.toContainText(TEXTO);

  // 1. Maria cadastra o texto e a informação, revisa, aceita e envia para revisão.
  await encerrarSessao(page);
  await page.goto('/admin/');
  await page.getByRole('radio', { name: /^Maria Silva — / }).check();
  await page.getByRole('button', { name: 'Acessar administração' }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'Serviços' })).toBeVisible();
  await page.locator('#busca-servico').fill(NOME_LAC);
  await page.getByRole('button', { name: new RegExp(NOME_LAC) }).first().click();
  await expect(page.getByRole('heading', { level: 2, name: NOME_LAC })).toBeVisible();
  await botao(page, 'Texto').click();
  await page.locator('#texto-titulo').fill(TITULO_FONTE);
  await page.locator('#texto-texto').fill(`Texto interno fictício sobre ${TERMO}, que não deve aparecer no chat.`);
  await botao(page, 'Incluir texto').click();
  await expect(status(page)).toContainText('Texto adicionado');
  await page.getByRole('link', { name: 'Revisar informações' }).click();
  await expect(page).toHaveURL(/\/admin\/conteudo\/\?servico=/);
  await expect(page.locator('#blocos')).toHaveAttribute('aria-busy', 'false');
  await page.locator('#aba-informacoes').click();
  await botao(page, 'Incluir informação').click();
  await page.getByLabel('Tema da informação', { exact: true }).fill(TITULO_INFO);
  await page.getByLabel('O que o chatbot deve informar ao cidadão?').fill(TEXTO);
  await page.getByRole('checkbox', { name: new RegExp(`^${TITULO_FONTE}`) }).check();
  await page.getByLabel(new RegExp(`Onde esta informação aparece na fonte\\? \\(${TITULO_FONTE}\\)`)).fill('Seção 1');
  await page.locator('#bloco-enviar').click();
  await botao(page, 'Confirmar e salvar').click();
  await expect(status(page)).toContainText('Informação salva.');
  await revisarEAceitar(page);
  await enviarComoMaria(page);
  const urlDaRevisao = page.url();

  // 2. Maria tenta validar pela tela: bloqueado na tela, nenhum pedido enviado e nada registrado em negadas/.
  await conferirBloqueio(page, 'Validar materialmente', 'ajuda-perfil-validar-materialmente');
  await capturar('1-aviso-de-bloqueio-da-cadastrante');
  expect(postsPara('/revisao/validar')).toBe(0);
  expect(negadasNovas()).toHaveLength(0);

  // 3. Carlos pede ajustes com motivo; Maria vê o motivo, cria nova versão, corrige e reenvia; Carlos valida e autoriza.
  await comoCarlos(page);
  await botao(page, 'Solicitar ajustes').click();
  await page.getByLabel('Motivo dos ajustes').fill(MOTIVO_AJUSTES);
  await botao(page, 'Confirmar pedido de ajustes').click();
  await expect(status(page)).toContainText('Ajustes solicitados.');
  await expect(page.locator('#servico-situacao')).toContainText('Ajustes solicitados');
  await comoMaria(page);
  await expect(page.locator('#ajustes-motivo')).toHaveText(`Motivo dos ajustes: ${MOTIVO_AJUSTES}`);
  await botao(page, 'Criar nova versão para editar').click();
  await expect(status(page)).toContainText('Nova versão criada.');
  await expect(page.locator('#servico-situacao')).toContainText('Em elaboração');
  await revisarEAceitar(page);
  await enviarComoMaria(page);
  await comoCarlos(page);
  await botao(page, 'Validar materialmente').click();
  await expect(page.getByRole('dialog')).toContainText('não equivale à validação material da CLABI');
  await botao(page, 'Confirmar validação').click();
  await expect(status(page)).toContainText('Validação material registrada');
  await expect(page.locator('#servico-situacao')).toContainText('Pronto para publicar');
  // A contagem de pedidos funciona: a validação do Revisor gerou exatamente um POST (o clique bloqueado da Maria, nenhum).
  expect(postsPara('/revisao/validar')).toBe(1);
  await botao(page, 'Autorizar publicação').click();
  await botao(page, 'Confirmar autorização').click();
  await expect(status(page)).toContainText('Publicação autorizada.');

  // 4. Maria tenta publicar: pela tela (só a mensagem, nenhum pedido) e por pedido direto (403 e uma linha em negadas/).
  await comoMaria(page);
  await conferirBloqueio(page, 'Publicar', 'ajuda-perfil-publicar');
  expect(postsPara('/publicacao')).toBe(0);
  expect(negadasNovas()).toHaveLength(0);
  const sessaoMaria = await (await page.request.get('/__admin/sessao')).json();
  expect(sessaoMaria.usuario?.perfil).toBe('cadastrante');
  expect(sessaoMaria.usuario?.usuarioId).toBe('maria-silva');
  const hashServicosAntes = hashDaPasta(naCopia('services'));
  const direto = await page.request.post('/__admin/servicos/lac/publicacao', {
    headers: { 'X-Admin-Token': sessaoMaria.token, 'Content-Type': 'application/json' },
    data: JSON.stringify({ marcador: MARCADOR }),
  });
  expect(direto.status()).toBe(403);
  expect(await direto.text()).toBe('{"erro":"perfil_sem_permissao"}');
  expect(hashDaPasta(naCopia('services'))).toBe(hashServicosAntes);
  const negadas = negadasNovas();
  expect(negadas).toHaveLength(1);
  const negada = negadas[0];
  expect(Object.keys(negada).sort()).toEqual(['acao', 'ator', 'dataHora', 'id', 'motivo', 'resultado', 'servicoId', 'tipo']);
  expect(negada).toMatchObject({ tipo: 'acao_negada', acao: 'publicar', resultado: 'negado', motivo: 'perfil_sem_permissao', servicoId: 'lac' });
  expect(negada.ator).toEqual(MARIA);
  const textoNegada = JSON.stringify(negada);
  for (const proibido of ['Maria', 'Silva', TITULO_FONTE, TITULO_INFO, 'http', '/__admin', MARCADOR]) expect(textoNegada).not.toContain(proibido);
  expect(textoNegada.toLowerCase()).not.toContain(TERMO);

  // 5. Carlos publica: registro aponta a versão nova, o arquivo público existe e o chat traz o texto.
  await comoCarlos(page);
  await botao(page, 'Publicar').click();
  await botao(page, 'Confirmar publicação').click();
  await expect(status(page)).toContainText('Versão publicada.');
  // Só a publicação do Revisor gerou POST /publicacao pela tela (o pedido direto da Maria foi feito por page.request, fora da página).
  expect(postsPara('/publicacao')).toBe(1);
  await capturar('2-versao-publicada');
  const publicada = entradaLac();
  expect(publicada.publicado).toBe(true);
  expect(publicada.versaoPublicadaId).toBe(publicada.versaoAtualId);
  const versaoNovaId = publicada.versaoPublicadaId;
  expect(versaoNovaId).not.toBe('lac-v1');
  const publicos = arquivosPublicos();
  expect(publicos).toHaveLength(1);
  const nomePublico = publicos[0];
  const comTexto = await perguntar(page);
  await expect(comTexto).toContainText(TEXTO);
  await expect(page.locator('meta[name="conteudo-publico"]')).toHaveAttribute('content', `/conteudo-publico/${nomePublico}`);
  await expect(page.locator('#faixa-teste')).toBeHidden();
  await capturar('3-chat-com-o-texto-publicado');

  // 6. Carlos revoga com motivo: o chat deixa de usar o conteúdo; o arquivo de publico/ fica no disco e não é servido.
  await page.goto(urlDaRevisao);
  await expect(page.locator('#blocos')).toHaveAttribute('aria-busy', 'false');
  await botao(page, 'Revogar publicação').click();
  const dialogo = page.getByRole('dialog', { name: 'Revogar a publicação?' });
  await expect(dialogo).toBeVisible();
  await dialogo.getByLabel('Motivo da revogação').fill(MOTIVO_REVOGACAO);
  await botao(page, 'Confirmar revogação').click();
  await expect(dialogo).toBeHidden();
  await expect(status(page)).toContainText('Publicação revogada.');
  await capturar('4-publicacao-revogada');
  expect(entradaLac()).toMatchObject({ publicado: false, versaoPublicadaId: null });
  const semTexto = await perguntar(page);
  await expect(semTexto).not.toContainText(TEXTO);
  await expect(page.locator('meta[name="conteudo-publico"]')).toHaveCount(0);
  await expect(page.locator('#faixa-teste')).toHaveText(FAIXA_SEM_PUBLICACAO);
  await capturar('5-chat-sem-o-texto-revogado');
  expect(arquivosPublicos()).toEqual([nomePublico]);
  const servido = await page.request.get(`/conteudo-publico/${nomePublico}`);
  expect(servido.status()).toBe(404);

  // 7. Conferência final da cópia.
  const manifestoNovoTexto = fs.readFileSync(manifestoDa(versaoNovaId), 'utf8');
  const manifestoNovo = JSON.parse(manifestoNovoTexto);
  expect(manifestoNovo.estado).toBe('revogado');
  const PUBLICO_MARIA = { perfil: 'cadastrante', setor: 'CLABI' };
  const PUBLICO_CARLOS = { perfil: 'revisor', setor: 'CLABI' };
  expect(Object.keys(manifestoNovo.responsaveis).sort()).toEqual(['autorizacao', 'envio', 'publicacao', 'revogacao', 'validacao']);
  for (const [etapa, esperado] of [['envio', PUBLICO_MARIA], ['validacao', PUBLICO_CARLOS], ['autorizacao', PUBLICO_CARLOS], ['publicacao', PUBLICO_CARLOS], ['revogacao', PUBLICO_CARLOS]]) {
    expect(Object.keys(manifestoNovo.responsaveis[etapa])).toHaveLength(2);
    expect(manifestoNovo.responsaveis[etapa]).toEqual(esperado);
  }
  for (const proibido of ['usuarioId', 'maria-silva', 'carlos-silva', 'Silva']) expect(manifestoNovoTexto).not.toContain(proibido);

  expect(typeof manifestoNovo.baseadaEm).toBe('string');
  const manifestoAnteriorTexto = fs.readFileSync(manifestoDa(manifestoNovo.baseadaEm), 'utf8');
  const manifestoAnterior = JSON.parse(manifestoAnteriorTexto);
  expect(manifestoAnterior.estado).toBe('ajustes_solicitados');
  expect(manifestoAnterior.responsaveis.ajustes).toEqual(PUBLICO_CARLOS);
  expect(manifestoAnterior.responsaveis.envio).toEqual(PUBLICO_MARIA);
  for (const proibido of [MOTIVO_AJUSTES, '"motivo"', 'usuarioId', 'maria-silva', 'carlos-silva', 'Silva']) expect(manifestoAnteriorTexto).not.toContain(proibido);

  const registroTexto = fs.readFileSync(naCopia('services', 'registry.json'), 'utf8');
  const publicoTexto = fs.readFileSync(naCopia('services', 'lac', 'publico', nomePublico), 'utf8');
  expect(Object.keys(JSON.parse(publicoTexto)).sort()).toEqual(['formato', 'informacoes', 'integridade', 'servico', 'tema']);
  for (const texto of [registroTexto, publicoTexto]) {
    for (const proibido of ['Maria', 'Carlos', 'Silva', 'usuarioId', 'maria-silva', 'carlos-silva', 'responsaveis']) expect(texto).not.toContain(proibido);
  }

  // Histórico privado (fora do Git): ações de cada usuário, decisões com os motivos e só a recusa do passo 4 em negadas/.
  const acoesNovas = novas(PRIVADO('revisao', 'lac.jsonl'), 'revisao');
  const contar = (usuarioId, acao) => acoesNovas.filter((a) => a.ator?.usuarioId === usuarioId && a.acao === acao).length;
  expect(acoesNovas.every((a) => a.servicoId === 'lac' && a.resultado === 'ok')).toBe(true);
  expect(contar('maria-silva', 'enviar_para_revisao')).toBe(2);
  expect(contar('maria-silva', 'nova_versao')).toBe(1);
  expect(contar('maria-silva', 'aceitar_bloco')).toBe(2);
  for (const acao of ['solicitar_ajustes', 'validar_materialmente', 'autorizar_publicacao', 'publicar', 'revogar']) expect(contar('carlos-silva', acao)).toBe(1);
  for (const a of acoesNovas) expect([MARIA, CARLOS]).toContainEqual(a.ator);

  const decisoesNovas = novas(PRIVADO('decisoes', 'lac.jsonl'), 'decisoes');
  expect(decisoesNovas.map((d) => [d.tipo, d.tipo === 'decisao_material' ? d.decisao : null])).toEqual([
    ['decisao_material', 'ajustes_solicitados'],
    ['decisao_material', 'validado_materialmente'],
    ['autorizacao_publicacao', null],
    ['revogacao', null],
  ]);
  for (const d of decisoesNovas) expect(d.ator).toEqual(CARLOS);
  expect(decisoesNovas[0].observacao).toBe(MOTIVO_AJUSTES);
  expect(decisoesNovas[3].motivo).toBe(MOTIVO_REVOGACAO);
  expect(negadasNovas()).toEqual([negada]);

  // Comportamento real: o histórico guarda o id do item gravado (itemId), que o servidor deriva do título (ex.: "texto-quorvalina")
  // e que também existe na base versionada. Por isso o termo só pode aparecer no itemId, e só se ele for exatamente o id de um item
  // gravado em services/ da cópia; em qualquer outro campo, nunca. Nome, título por extenso, URL e marcador seguem proibidos em todos.
  const idsDaBase = idsDaBaseDaCopia();
  let itensComTermo = 0;
  for (const registro of [...acoesNovas, ...decisoesNovas, negada]) {
    const texto = JSON.stringify(registro);
    for (const proibido of PROIBIDOS_NO_HISTORICO) expect(texto).not.toContain(proibido);
    const { itemId, ...semItemId } = registro;
    expect(JSON.stringify(semItemId).toLowerCase()).not.toContain(TERMO);
    if (typeof itemId === 'string' && itemId.toLowerCase().includes(TERMO)) {
      itensComTermo += 1;
      expect(idsDaBase.has(itemId)).toBe(true);
    }
  }
  expect(itensComTermo).toBeGreaterThan(0);

  // Evidência: só os campos do registro de recusa e os responsáveis (perfil e setor) do manifesto publicado.
  const evidencia = JSON.stringify({ acaoNegada: negada, responsaveisDoManifesto: manifestoNovo.responsaveis }, null, 2);
  for (const proibido of ['Maria', 'Carlos', 'Silva', TITULO_FONTE, TITULO_INFO, TEXTO, MARCADOR, 'http']) expect(evidencia).not.toContain(proibido);
  expect(evidencia.toLowerCase()).not.toContain(TERMO);
  await testInfo.attach('registro-acao-negada-e-responsaveis.json', { body: evidencia, contentType: 'application/json' });
});
