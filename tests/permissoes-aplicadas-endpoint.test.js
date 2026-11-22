// Sprint 8, Passo 8C: permissões aplicadas nas gravações. Endpoint com requisições simuladas (sem abrir porta), serviços chamados
// direto, decisões, responsáveis do manifesto e a ajuda da tela. Usuários FICTÍCIOS (Maria Silva, Cadastrante; Carlos Silva,
// Revisor). Toda gravação acontece em cópias temporárias fora do repositório; a base real e data/ nunca são tocadas.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { criarManipuladorAdmin, CABECALHO_TOKEN, ROTA_SESSAO, respostaDaEntradaDeTexto } from '../services/admin/admin-endpoint.js';
import { ROTAS_GRAVADORAS } from '../services/admin/acoes-das-rotas.js';
import { ATOR_DEMONSTRACAO, validarResponsavelPublico } from '../services/admin/atores.js';
import { autorizarPublicacao, registrarDecisaoMaterial, revogarVersao, validarHistorico, validarRegistro } from '../services/admin/decisoes.js';
import { criarEdicaoTema } from '../services/admin/edicao-tema-servico.js';
import { criarGravadorEntradas } from '../services/admin/entradas-gravacao.js';
import { criarHistoricoRevisao, validarAcaoCadastro, validarAcaoNegada } from '../services/admin/historico-revisao.js';
import { PERMISSOES, acoesDoPerfil } from '../services/admin/permissoes.js';
import { criarServicoPublicacao } from '../services/admin/publicacao.js';
import { criarServicoRevisao } from '../services/admin/revisao-servico.js';
import { validarVersao } from '../services/admin/versao.js';
import {
  MENSAGEM_PERFIL_SEM_PERMISSAO, aplicarPermissoesDoPerfil, bloqueioDoControle, descricaoDoBloqueio, instalarBloqueioDePerfil, mensagemDaGestao,
  mensagemDaRevisao, mensagemDeErro, normalizarSessao,
} from '../admin/admin-logic.js';
import { ate, CARLOS, MARIA } from './admin-auxiliar.js';
import { NOMES_ADMINISTRATIVOS } from '../scripts/check-dist.js';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const AGORA = () => new Date(2026, 10, 21, 12, 0, 0);
const CANARIO = 'CANARIO-8C-NAO-PODE-SER-GRAVADO';
const URL_CANARIO = 'https://canario-8c.exemplo.gov.br/pagina';
const ler = (...p) => fs.readFileSync(path.join(RAIZ, ...p), 'utf8');

function retrato(raiz, sub = 'services') {
  const itens = [];
  const andar = (d) => {
    if (!fs.existsSync(d)) return;
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) andar(p);
      else itens.push(`${path.relative(raiz, p)} ${crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')}`);
    }
  };
  andar(path.join(raiz, sub));
  return itens.sort();
}
const RETRATO_REAL_ANTES = retrato(RAIZ);
const EXISTIA_DATA = fs.existsSync(path.join(RAIZ, 'data'));

/** Requisição simulada. `lido()` diz se o corpo chegou a ser consumido pelo manipulador. */
async function chamar(m, { url, method = 'GET', corpo, texto, token, headers = {} } = {}) {
  const bruto = texto !== undefined ? texto : corpo !== undefined ? JSON.stringify(corpo) : '';
  const buffer = Buffer.from(bruto);
  let consumido = false;
  let entregue = false;
  const stream = new Readable({
    read() {
      consumido = true;
      if (!entregue && buffer.length > 0) {
        entregue = true;
        this.push(buffer);
      }
      this.push(null);
    },
  });
  const h = { host: 'localhost:5173', ...headers };
  if (buffer.length > 0) {
    h['content-type'] = 'application/json';
    if (h['content-length'] === undefined) h['content-length'] = String(buffer.length);
  }
  if (token !== undefined) h[CABECALHO_TOKEN] = token;
  const cab = {};
  let resposta = null;
  const res = { statusCode: 0, setHeader: (n, v) => { cab[n.toLowerCase()] = v; }, end: (t) => { resposta = t ?? null; } };
  await m(Object.assign(stream, { url, method, headers: h, socket: { remoteAddress: '127.0.0.1', localPort: 5173 } }), res, () => {});
  return { status: res.statusCode, corpo: resposta === null || resposta === '' ? null : JSON.parse(resposta), bruto: resposta ?? '', cab, lido: consumido };
}
const entrar = async (m, usuarioId) => (await chamar(m, { url: ROTA_SESSAO, method: 'POST', corpo: { usuarioId } })).corpo.token;

async function comCopia(fn) {
  const pai = fs.mkdtempSync(path.join(os.tmpdir(), 'sema-orienta-permissoes-'));
  const raiz = path.join(pai, 'raiz');
  fs.mkdirSync(raiz);
  fs.cpSync(path.join(RAIZ, 'services'), path.join(raiz, 'services'), { recursive: true });
  try {
    return await fn({ raiz, pai });
  } finally {
    fs.rmSync(pai, { recursive: true, force: true });
  }
}
const jsonl = (raiz, ...p) => {
  const f = path.join(raiz, 'data', 'admin-private', ...p);
  return fs.existsSync(f) ? fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
};
const v1 = (raiz, nome) => path.join(raiz, 'services', 'lac', 'versoes', 'v1', nome);
const lerJ = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));

/** Usuário errado para a rota: Carlos nas ações do Cadastrante; Maria nas do Revisor. */
const usuarioErrado = (r) => (PERMISSOES[r.acoes[0]].includes('cadastrante') ? 'carlos-silva' : 'maria-silva');
const corpoCanario = { titulo: CANARIO, nome: CANARIO, url: URL_CANARIO, texto: CANARIO, revisao: 'a'.repeat(64) };

test('PA1. cada uma das 27 rotas com o perfil errado: 403 exato, sem ler o corpo, services/ intacto e uma recusa com campos fechados', async () => {
  assert.equal(ROTAS_GRAVADORAS.length, 27, 'Passo 8D: 27 rotas que gravam (enviar, validar e ajustes no lugar de concluir)');
  await comCopia(async ({ raiz, pai }) => {
    const m = criarManipuladorAdmin({ raiz, agora: AGORA, diretorioTemporario: pai });
    const antes = retrato(raiz);
    let n = 0;
    for (const r of ROTAS_GRAVADORAS) {
      const usuarioId = usuarioErrado(r);
      const token = await entrar(m, usuarioId);
      const resposta = await chamar(m, { url: r.exemplo, method: r.metodo, token, ...(r.metodo === 'DELETE' ? { headers: { 'x-revisao': 'a'.repeat(64) } } : { corpo: corpoCanario }) });
      const rotulo = `${r.metodo} ${r.exemplo}`;
      assert.equal(resposta.status, 403, rotulo);
      assert.deepEqual(resposta.corpo, { erro: 'perfil_sem_permissao' }, rotulo);
      assert.equal(resposta.cab.connection, 'close', rotulo);
      assert.equal(resposta.lido, false, `o corpo não foi lido: ${rotulo}`);
      assert.deepEqual(retrato(raiz), antes, `services/ intacto: ${rotulo}`);
      n += 1;
      const negadas = jsonl(raiz, 'negadas', 'historico.jsonl');
      assert.equal(negadas.length, n, rotulo);
      const ultima = negadas.at(-1);
      assert.deepEqual(Object.keys(ultima).sort(), ['acao', 'ator', 'dataHora', 'id', 'motivo', 'resultado', 'servicoId', 'tipo']);
      const servicoId = /^\/__admin\/servicos\/([a-z][a-z0-9-]*)\//.exec(r.exemplo)?.[1] ?? null;
      const ator = usuarioId === 'maria-silva' ? { ...MARIA } : { ...CARLOS };
      assert.deepEqual({ ...ultima, dataHora: 'x' }, {
        id: `negada-${String(n).padStart(6, '0')}`, tipo: 'acao_negada', acao: r.acoes[0], dataHora: 'x', resultado: 'negado', motivo: 'perfil_sem_permissao', ator, servicoId,
      }, rotulo);
      assert.match(ultima.dataHora, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
      assert.deepEqual(validarAcaoNegada(ultima), []);
    }
    const bruto = fs.readFileSync(path.join(raiz, 'data', 'admin-private', 'negadas', 'historico.jsonl'), 'utf8');
    assert.doesNotMatch(bruto, /CANARIO|canario|https:|Maria Silva|Carlos Silva|"nome"|"titulo"|"url"|"versaoId"|"hashConteudo"/);
    // Só a pasta das recusas foi criada em data/admin-private/.
    assert.deepEqual(fs.readdirSync(path.join(raiz, 'data', 'admin-private')), ['negadas']);
  });
});

test('PA2. perfil certo: a gravação acontece e o histórico guarda o ator real (sem nome); o manifesto guarda só perfil e setor', async () => {
  await comCopia(async ({ raiz, pai }) => {
    const m = criarManipuladorAdmin({ raiz, agora: AGORA, diretorioTemporario: pai });
    let token = await entrar(m, 'maria-silva');
    const tema = await chamar(m, { url: '/__admin/assuntos', method: 'POST', token, corpo: { nome: 'Tema fictício do passo 8C' } });
    assert.equal(tema.status, 201, tema.bruto);
    assert.equal(tema.lido, true, 'conferência do simulador: com o perfil certo o corpo é lido');
    assert.deepEqual(jsonl(raiz, 'cadastros', 'historico.jsonl').map((x) => [x.acao, x.itemTipo, x.itemId, x.ator]), [['cadastrar_tema', 'tema', tema.corpo.assunto.id, { ...MARIA }]]);
    const texto = await chamar(m, { url: '/__admin/servicos/lac/entradas-texto', method: 'POST', token, corpo: { titulo: 'Texto fictício 8C', texto: 'Orientação fictícia cadastrada no teste do passo 8C.' } });
    assert.equal(texto.status, 201, texto.bruto);
    assert.deepEqual(jsonl(raiz, 'revisao', 'lac.jsonl').map((x) => [x.acao, x.itemTipo, x.ator]), [['cadastrar_texto', 'texto', { ...MARIA }]]);
    // Preparação pelas funções (com os atores certos): uma informação que usa o texto, fonte revisada e informação aceita.
    const idTexto = lerJ(v1(raiz, 'fontes.json')).fontes.find((f) => f.formaEntrada === 'texto').id;
    const conteudo = lerJ(v1(raiz, 'conteudo-assistente.json'));
    conteudo.blocos.push({
      id: 'bc-permissoes', tipo: 'conhecimento', titulo: 'Informação fictícia 8C', texto: 'Orientação fictícia.', fonteIds: [idTexto],
      referencias: [{ fonteId: idTexto, localizacao: 'página 1' }], origem: 'fonte', ambiente: 'publico', statusValidacao: 'rascunho', publicado: false,
      revisaoAtualidade: 'pendente', criadoEm: '2026-11-10', atualizadoEm: '2026-11-10',
    });
    fs.writeFileSync(v1(raiz, 'conteudo-assistente.json'), `${JSON.stringify(conteudo, null, 2)}\n`);
    const rev = criarServicoRevisao({ raiz, agora: AGORA });
    const sit = () => rev.consultar('lac').situacao;
    for (const id of sit().fontes.filter((f) => f.usadaPorBloco && !f.revisada).map((f) => f.id)) assert.equal(rev.revisarFonte('lac', { fonteId: id, revisao: sit().revisao, ator: MARIA }).ok, true);
    for (const id of sit().blocos.filter((b) => !b.aceito).map((b) => b.id)) assert.equal(rev.aceitarBloco('lac', { blocoId: id, revisao: sit().revisao, ator: MARIA }).ok, true);
    // Passo 8D: Maria (Cadastrante) envia para revisão pela rota; Carlos (Revisor) valida materialmente pela rota.
    token = await entrar(m, 'maria-silva');
    const enviada = await chamar(m, { url: '/__admin/servicos/lac/revisao/enviar', method: 'POST', token, corpo: { revisao: sit().revisao } });
    assert.equal(enviada.status, 200, enviada.bruto);
    token = await entrar(m, 'carlos-silva');
    const validada = await chamar(m, { url: '/__admin/servicos/lac/revisao/validar', method: 'POST', token, corpo: { revisao: sit().revisao } });
    assert.equal(validada.status, 200, validada.bruto);
    const acoes = jsonl(raiz, 'revisao', 'lac.jsonl');
    assert.deepEqual(acoes.slice(-2).map((x) => [x.acao, x.ator]), [['enviar_para_revisao', { ...MARIA }], ['validar_materialmente', { ...CARLOS }]]);
    assert.equal(acoes.some((x) => x.acao === 'concluir_revisao'), false, 'concluir_revisao não é mais gravado');
    assert.deepEqual(jsonl(raiz, 'decisoes', 'lac.jsonl').map((d) => [d.tipo, d.decisao, d.ator]), [['decisao_material', 'validado_materialmente', { ...CARLOS }]]);
    const manifesto = lerJ(v1(raiz, 'versao.json'));
    assert.deepEqual(manifesto.responsaveis, { envio: { perfil: 'cadastrante', setor: 'CLABI' }, validacao: { perfil: 'revisor', setor: 'CLABI' } });
    assert.doesNotMatch(fs.readFileSync(v1(raiz, 'versao.json'), 'utf8'), /usuarioId|carlos-silva|Carlos Silva|maria-silva|Maria Silva/);
    assert.equal(fs.existsSync(path.join(raiz, 'data', 'admin-private', 'negadas')), false, 'nenhuma recusa');
  });
});

test('PA3. corpo acima do limite com o perfil errado: 403 (não 413), sem ler o corpo', async () => {
  await comCopia(async ({ raiz, pai }) => {
    const m = criarManipuladorAdmin({ raiz, agora: AGORA, diretorioTemporario: pai });
    const token = await entrar(m, 'carlos-silva');
    const grande = JSON.stringify({ nome: 'x'.repeat(200 * 1024) });
    for (const headers of [{}, { 'content-length': String(10 * 1024 * 1024) }]) {
      const r = await chamar(m, { url: '/__admin/assuntos', method: 'POST', token, texto: grande, headers });
      assert.deepEqual([r.status, r.corpo, r.lido], [403, { erro: 'perfil_sem_permissao' }, false]);
    }
    // Com o perfil certo, o mesmo corpo continua recebendo 413.
    const t2 = await entrar(m, 'maria-silva');
    assert.equal((await chamar(m, { url: '/__admin/assuntos', method: 'POST', token: t2, texto: grande })).status, 413);
  });
});

test('PA4. o ator fica fixado no início do pedido: trocar a sessão durante a espera da trava não muda quem grava', async () => {
  await comCopia(async ({ raiz, pai }) => {
    let m = null;
    let trocar = true;
    m = criarManipuladorAdmin({
      raiz, agora: AGORA, diretorioTemporario: pai,
      antesDeGravar: async () => {
        if (!trocar) return;
        trocar = false;
        await entrar(m, 'carlos-silva');
      },
    });
    const token = await entrar(m, 'maria-silva');
    const r = await chamar(m, { url: '/__admin/assuntos', method: 'POST', token, corpo: { nome: 'Tema fictício do ator fixado' } });
    assert.equal(r.status, 201, r.bruto);
    assert.deepEqual(jsonl(raiz, 'cadastros', 'historico.jsonl').map((x) => x.ator), [{ ...MARIA }]);
    const sessao = await chamar(m, { url: ROTA_SESSAO });
    assert.equal(sessao.corpo.usuario.usuarioId, 'carlos-silva', 'a sessão trocou, mas o pedido já estava com Maria');
    assert.equal((await chamar(m, { url: '/__admin/assuntos', method: 'POST', token, corpo: { nome: 'Outro tema fictício' } })).status, 401, 'o token antigo não vale mais');
    // O mesmo vale para o tema (PATCH), com a sessão trocada durante a espera.
    trocar = true;
    const tMaria = await entrar(m, 'maria-silva');
    const lido = await chamar(m, { url: '/__admin/temas/licenciamento-ambiental/edicao', token: tMaria });
    const e = await chamar(m, { url: '/__admin/temas/licenciamento-ambiental/edicao', method: 'PATCH', token: tMaria, corpo: { revisao: lido.corpo.revisao, nome: 'Tema fictício renomeado 8C', confirmado: true } });
    assert.equal(e.status, 200, e.bruto);
    assert.deepEqual(jsonl(raiz, 'temas', 'historico.jsonl').map((x) => x.ator), [{ ...MARIA }]);
  });
});

test('PA5. se a recusa não puder ser registrada, a resposta continua 403 e a base fica intacta', async () => {
  await comCopia(async ({ raiz, pai }) => {
    const falhar = (p) => String(p).includes('negadas');
    const sistema = {
      ...fs,
      mkdirSync(p, o) { if (falhar(p)) throw new Error('falha injetada'); return fs.mkdirSync(p, o); },
      openSync(p, ...a) { if (falhar(p)) throw new Error('falha injetada'); return fs.openSync(p, ...a); },
      renameSync(o, d) { if (falhar(d)) throw new Error('falha injetada'); return fs.renameSync(o, d); },
    };
    const m = criarManipuladorAdmin({ raiz, agora: AGORA, diretorioTemporario: pai, sistema });
    const antes = retrato(raiz);
    const token = await entrar(m, 'maria-silva');
    const r = await chamar(m, { url: '/__admin/servicos/lac/publicacao', method: 'POST', token, corpo: { revisao: 'a'.repeat(64) } });
    assert.deepEqual([r.status, r.corpo, r.lido], [403, { erro: 'perfil_sem_permissao' }, false]);
    assert.deepEqual(retrato(raiz), antes);
    assert.equal(fs.existsSync(path.join(raiz, 'data', 'admin-private', 'negadas', 'historico.jsonl')), false);
  });
});

test('PA6. serviços chamados direto (segunda barreira): sem permissão → perfil_sem_permissao; sem ator → ator_ausente; nada muda', async () => {
  await comCopia(async ({ raiz }) => {
    const antes = retrato(raiz);
    const rev = criarServicoRevisao({ raiz, agora: AGORA });
    const pub = criarServicoPublicacao({ raiz, agora: AGORA });
    const tema = criarEdicaoTema({ raiz, agora: AGORA });
    const gravador = criarGravadorEntradas({ raiz, agora: AGORA });
    const revisao = rev.consultar('lac').situacao.revisao;
    const semPermissao = [
      rev.revisarFonte('lac', { fonteId: 'manual-lac-siga-2020', revisao, ator: CARLOS }),
      rev.aceitarBloco('lac', { blocoId: 'bc-x', revisao, ator: CARLOS }),
      rev.rejeitarBloco('lac', { blocoId: 'bc-x', revisao, ator: CARLOS }),
      rev.reabrirBloco('lac', { blocoId: 'bc-x', revisao, ator: CARLOS }),
      rev.editarFonte('lac', { fonteId: 'manual-lac-siga-2020', revisao, campos: { titulo: CANARIO }, ator: CARLOS }),
      rev.excluirFonte('lac', { fonteId: 'manual-lac-siga-2020', revisao, ator: CARLOS }),
      rev.editarServico('lac', { revisao, nome: CANARIO, ator: CARLOS }),
      rev.importarConteudo('lac', { revisao, ref: 'x', entrada: {}, ator: CARLOS }),
      rev.criarNovaVersao('lac', { ator: CARLOS }),
      rev.enviarParaRevisao('lac', { revisao, ator: CARLOS }),
      rev.validarMaterialmente('lac', { revisao, ator: MARIA }),
      rev.solicitarAjustes('lac', { revisao, motivo: 'Motivo fictício.', ator: MARIA }),
      pub.autorizar('lac', { revisao, ator: MARIA }),
      pub.publicar('lac', { revisao, ator: MARIA }),
      pub.revogar('lac', { revisao, motivo: 'Motivo fictício.', ator: MARIA }),
      tema.editar('licenciamento-ambiental', { revisao, nome: CANARIO, ator: CARLOS }),
    ];
    for (const r of semPermissao) assert.deepEqual(r, { ok: false, erro: 'perfil_sem_permissao' });
    const semAtor = [
      rev.revisarFonte('lac', { fonteId: 'manual-lac-siga-2020', revisao }),
      rev.enviarParaRevisao('lac', { revisao }),
      rev.validarMaterialmente('lac', { revisao }),
      rev.solicitarAjustes('lac', { revisao, motivo: 'Motivo fictício.' }),
      rev.criarNovaVersao('lac'),
      pub.autorizar('lac', { revisao }),
      pub.publicar('lac', { revisao }),
      pub.revogar('lac', { revisao, motivo: 'Motivo fictício.' }),
      tema.editar('licenciamento-ambiental', { revisao, nome: CANARIO }),
    ];
    for (const r of semAtor) assert.deepEqual(r, { ok: false, erro: 'ator_ausente' });
    assert.deepEqual(gravador.gravar('lac', { titulo: CANARIO, texto: CANARIO }, { ator: CARLOS }), { ok: false, status: 403, erro: 'perfil_sem_permissao' });
    assert.deepEqual(gravador.gravar('lac', { titulo: CANARIO, texto: CANARIO }), { ok: false, status: 500, erro: 'ator_ausente' });
    assert.deepEqual(await gravador.gravarEntradaTexto('lac', { titulo: CANARIO, texto: CANARIO }, { ator: ATOR_DEMONSTRACAO }), { ok: false, status: 500, erro: 'ator_invalido' });
    // Histórico: sem ator ou com o de demonstração, nada é gravado.
    const h = criarHistoricoRevisao({ raiz, agora: AGORA });
    assert.deepEqual(h.registrarAcaoCadastro({ acao: 'cadastrar_tema', itemId: 'tema-x' }), { ok: false, erro: 'ator_ausente' });
    assert.deepEqual(h.registrarAcaoNegada({ acao: 'publicar', ator: ATOR_DEMONSTRACAO, servicoId: 'lac' }), { ok: false, erro: 'ator_invalido' });
    assert.deepEqual(h.registrarAcaoNegada({ acao: 'acao_inventada', ator: MARIA }), { ok: false, erro: 'registro_invalido' });
    assert.deepEqual(retrato(raiz), antes);
    assert.equal(fs.existsSync(path.join(raiz, 'data')), false);
  });
});

test('PA7. acao_cadastro: gravado no cadastro de tema e de serviço (só na gravação real); nada em falha, nem no ensaio', async () => {
  await comCopia(async ({ raiz, pai }) => {
    const m = criarManipuladorAdmin({ raiz, agora: AGORA, diretorioTemporario: pai });
    const token = await entrar(m, 'maria-silva');
    const r = await chamar(m, { url: '/__admin/servico-com-tema', method: 'POST', token, corpo: { nome: 'Serviço fictício 8C', tema: { nome: 'Tema novo fictício 8C' } } });
    assert.equal(r.status, 201, r.bruto);
    const cadastros = jsonl(raiz, 'cadastros', 'historico.jsonl');
    // Exatamente um registro por item: o ensaio (cópia temporária) não grava auditoria.
    assert.deepEqual(cadastros.map((x) => [x.id, x.acao, x.itemTipo, x.itemId, x.resultado, x.ator]), [
      ['cadastro-000001', 'cadastrar_tema', 'tema', r.corpo.servico.assuntoId, 'ok', { ...MARIA }],
      ['cadastro-000002', 'cadastrar_servico', 'servico', r.corpo.servico.id, 'ok', { ...MARIA }],
    ]);
    for (const c of cadastros) assert.deepEqual(validarAcaoCadastro(c), []);
    assert.doesNotMatch(JSON.stringify(cadastros), /Serviço fictício|Tema novo|Maria Silva|"nome"/);
    // Duplicado (409): nada é gravado.
    assert.equal((await chamar(m, { url: '/__admin/assuntos', method: 'POST', token, corpo: { nome: 'Tema novo fictício 8C' } })).status, 409);
    assert.equal(jsonl(raiz, 'cadastros', 'historico.jsonl').length, 2);
  });
  // Conferência final recusada: a gravação é desfeita e nenhum registro de cadastro é criado.
  await comCopia(async ({ raiz, pai }) => {
    const m = criarManipuladorAdmin({ raiz, agora: AGORA, diretorioTemporario: pai, verificarFinal: () => ['recusado'] });
    const antes = retrato(raiz);
    const token = await entrar(m, 'maria-silva');
    const r = await chamar(m, { url: '/__admin/assuntos', method: 'POST', token, corpo: { nome: 'Tema fictício recusado' } });
    assert.equal(r.status, 500);
    assert.deepEqual(retrato(raiz), antes);
    assert.equal(fs.existsSync(path.join(raiz, 'data', 'admin-private', 'cadastros')), false);
  });
  // Falha ao gravar a auditoria: a gravação é desfeita (500 historico_indisponivel) e services/ volta ao que era.
  await comCopia(async ({ raiz, pai }) => {
    const falhar = (p) => String(p).includes('cadastros');
    const sistema = {
      ...fs,
      mkdirSync(p, o) { if (falhar(p)) throw new Error('falha injetada'); return fs.mkdirSync(p, o); },
      openSync(p, ...a) { if (falhar(p)) throw new Error('falha injetada'); return fs.openSync(p, ...a); },
    };
    const m = criarManipuladorAdmin({ raiz, agora: AGORA, diretorioTemporario: pai, sistema });
    const antes = retrato(raiz);
    const token = await entrar(m, 'maria-silva');
    const r = await chamar(m, { url: '/__admin/assuntos', method: 'POST', token, corpo: { nome: 'Tema fictício sem auditoria' } });
    assert.deepEqual([r.status, r.corpo], [500, { erro: 'historico_indisponivel' }]);
    assert.deepEqual(retrato(raiz), antes);
  });
});

test('PA8. validarResponsavelPublico por etapa: Revisor (e demonstração, só nos manifestos antigos) sim; Cadastrante nunca', () => {
  const REVISOR = { perfil: 'revisor', setor: 'CLABI' };
  const CADASTRANTE = { perfil: 'cadastrante', setor: 'CLABI' };
  const DEMO = { perfil: ATOR_DEMONSTRACAO.perfil, setor: ATOR_DEMONSTRACAO.setor };
  for (const etapa of ['validacao', 'autorizacao', 'publicacao', 'revogacao']) {
    assert.deepEqual(validarResponsavelPublico(REVISOR, etapa), [], etapa);
    assert.deepEqual(validarResponsavelPublico(DEMO, etapa), [], etapa);
    assert.deepEqual(validarResponsavelPublico(CADASTRANTE, etapa), ['perfil do responsável não pode responder por esta etapa'], etapa);
  }
  assert.notDeepEqual(validarResponsavelPublico(REVISOR), []);
  assert.notDeepEqual(validarResponsavelPublico(REVISOR, 'constructor'), []);
  // Pelo manifesto: versão revogada com Cadastrante em qualquer etapa é inválida.
  const { v } = ate('revogado');
  const ok = { validacao: REVISOR, autorizacao: REVISOR, publicacao: REVISOR, revogacao: REVISOR };
  assert.deepEqual(validarVersao({ ...v, responsaveis: ok }), []);
  for (const etapa of Object.keys(ok)) assert.notDeepEqual(validarVersao({ ...v, responsaveis: { ...ok, [etapa]: CADASTRANTE } }), [], etapa);
});

test('PA9. tela: 403 por perfil tem mensagem própria (distinta do acesso local); controles bloqueados ficam aria-disabled com descrição', () => {
  // Mensagens.
  const perfil = { erro: 'perfil_sem_permissao' };
  const local = { erro: 'acesso_somente_local' };
  assert.equal(MENSAGEM_PERFIL_SEM_PERMISSAO, 'Esta ação não está disponível para o seu perfil.');
  assert.equal(mensagemDeErro(403, perfil), MENSAGEM_PERFIL_SEM_PERMISSAO);
  assert.equal(mensagemDeErro(403, perfil, 'conhecimento'), MENSAGEM_PERFIL_SEM_PERMISSAO);
  assert.notEqual(mensagemDeErro(403, local), MENSAGEM_PERFIL_SEM_PERMISSAO);
  assert.match(mensagemDeErro(403, local), /neste computador/);
  assert.deepEqual(mensagemDaGestao(403, perfil), { mensagem: MENSAGEM_PERFIL_SEM_PERMISSAO });
  assert.match(mensagemDaGestao(403, local).mensagem, /neste computador/);
  assert.deepEqual(mensagemDaRevisao(403, perfil), { mensagem: MENSAGEM_PERFIL_SEM_PERMISSAO });
  assert.match(mensagemDaRevisao(403, null).mensagem, /neste computador/);
  // Sessão com ações: formato fechado e ações conhecidas.
  const usuario = { usuarioId: 'maria-silva', nome: 'Maria Silva', perfil: 'cadastrante', setor: 'CLABI' };
  const token = 'ab'.repeat(32);
  const acoes = acoesDoPerfil('cadastrante');
  assert.deepEqual(normalizarSessao({ token, usuario, acoes }), { usuario, usuarios: null, token, acoes });
  assert.deepEqual(normalizarSessao({ token, usuario, usuarios: [usuario], acoes: [] }), { usuario, usuarios: [usuario], token, acoes: [] });
  for (const ruim of [['acao_inventada'], ['publicar', 'publicar'], 'publicar', [1], null, Array(30).fill('publicar')]) {
    assert.equal(normalizarSessao({ token, usuario, acoes: ruim }), null, JSON.stringify(ruim));
  }
  assert.equal(normalizarSessao({ usuario: null, usuarios: [usuario], acoes }), null, 'ações sem usuário');
  // Descrição do bloqueio, sem nome de pessoa.
  assert.equal(descricaoDoBloqueio('publicar', 'cadastrante'), 'Esta ação é feita pelo perfil Revisor. Você entrou como Cadastrante.');
  assert.equal(descricaoDoBloqueio('cadastrar_tema', 'revisor'), 'Esta ação é feita pelo perfil Cadastrante. Você entrou como Revisor.');
  assert.equal(bloqueioDoControle(acoes, 'cadastrante', 'cadastrar_tema'), null);
  assert.equal(bloqueioDoControle(null, 'cadastrante', 'publicar'), null, 'sem lista de ações a tela não restringe');

  // DOM simulado: aplicar e desfazer o bloqueio.
  const criarElemento = (dataset = {}, atributos = {}) => {
    const attrs = new Map(Object.entries(atributos));
    return {
      dataset: { ...dataset }, id: '', className: '', textContent: '', disabled: false,
      getAttribute: (n) => (attrs.has(n) ? attrs.get(n) : null), setAttribute: (n, v) => attrs.set(n, String(v)), removeAttribute: (n) => attrs.delete(n),
    };
  };
  const publicar = criarElemento({ permissao: 'publicar' });
  const aceitar = criarElemento({ permissao: 'aceitar_bloco' }, { 'aria-describedby': 'ajuda-existente' });
  // As descrições vão para o contêiner #ajudas-perfil (dentro do conteúdo principal), nunca para o body.
  const corpo = [];
  const noBody = [];
  const conteiner = { id: 'ajudas-perfil', append: (e) => corpo.push(e) };
  const documento = {
    body: { append: (e) => noBody.push(e) },
    createElement: () => criarElemento(),
    getElementById: (id) => (id === 'ajudas-perfil' ? conteiner : corpo.find((e) => e.id === id) ?? null),
    querySelectorAll: (sel) => (sel === '[data-permissao]' ? [publicar, aceitar] : []),
  };
  aplicarPermissoesDoPerfil(documento, { acoes: acoesDoPerfil('cadastrante'), perfil: 'cadastrante' });
  assert.equal(publicar.getAttribute('aria-disabled'), 'true');
  assert.equal(publicar.disabled, false, 'continua focável');
  const idAjuda = publicar.getAttribute('aria-describedby');
  assert.equal(idAjuda, 'ajuda-perfil-publicar', 'id fixo por ação');
  assert.equal(noBody.length, 0);
  assert.equal(corpo.length, 1);
  assert.equal(corpo[0].id, idAjuda);
  // Reaplicar não duplica a descrição.
  aplicarPermissoesDoPerfil(documento, { acoes: acoesDoPerfil('cadastrante'), perfil: 'cadastrante' });
  assert.equal(corpo.length, 1);
  assert.equal(publicar.getAttribute('aria-describedby'), 'ajuda-perfil-publicar');
  assert.equal(corpo[0].textContent, 'Esta ação é feita pelo perfil Revisor. Você entrou como Cadastrante.');
  assert.equal(corpo[0].className, 'oculto-visual');
  assert.equal(aceitar.getAttribute('aria-disabled'), null);
  assert.equal(aceitar.getAttribute('aria-describedby'), 'ajuda-existente');
  // Trocando para o Revisor: o inverso; a descrição anterior do "aceitar" é preservada.
  aplicarPermissoesDoPerfil(documento, { acoes: acoesDoPerfil('revisor'), perfil: 'revisor' });
  assert.equal(publicar.getAttribute('aria-disabled'), null);
  assert.equal(publicar.getAttribute('aria-describedby'), null);
  assert.equal(aceitar.getAttribute('aria-disabled'), 'true');
  const ids = aceitar.getAttribute('aria-describedby').split(' ');
  assert.deepEqual(ids, ['ajuda-existente', 'ajuda-perfil-aceitar-bloco']);
  assert.equal(documento.getElementById(ids[1]).textContent, 'Esta ação é feita pelo perfil Cadastrante. Você entrou como Revisor.');
  // Clique bloqueado na fase de captura, com a descrição na tela.
  let ouvinte = null;
  let captura = null;
  let mostrado = null;
  instalarBloqueioDePerfil({ addEventListener: (tipo, f, c) => { if (tipo === 'click') { ouvinte = f; captura = c; } } }, (d) => { mostrado = d; });
  assert.equal(captura, true);
  const evento = (alvo) => {
    const e = { target: { closest: () => alvo }, parado: false, cancelado: false };
    e.preventDefault = () => { e.cancelado = true; };
    e.stopImmediatePropagation = () => { e.parado = true; };
    return e;
  };
  const bloqueado = evento(aceitar);
  ouvinte(bloqueado);
  assert.deepEqual([bloqueado.cancelado, bloqueado.parado, mostrado], [true, true, 'Esta ação é feita pelo perfil Cadastrante. Você entrou como Revisor.']);
  const livre = evento(null);
  ouvinte(livre);
  assert.deepEqual([livre.cancelado, livre.parado], [false, false]);

  // Código das páginas: marcações das ações, bloqueio instalado e nada de innerHTML, armazenamento do navegador ou cookies.
  const conteudo = ler('admin', 'conteudo', 'conteudo.js');
  const gestao = ler('admin', 'admin.js');
  for (const id of ['botao-nova-orientacao', 'botao-importar', 'bloco-enviar']) assert.match(conteudo, new RegExp(`\\$\\('${id}'\\)\\.dataset\\.permissao`), id);
  assert.match(conteudo, /'botao-enviar', 'botao-validar', 'botao-ajustes', 'botao-nova-versao', 'botao-autorizar', 'botao-publicar', 'botao-revogar'/);
  for (const acao of ['cadastrar_servico', 'cadastrar_texto', 'cadastrar_link', 'nova_versao', 'editar_servico', 'editar_tema']) assert.match(gestao, new RegExp(`'${acao}'`), acao);
  for (const pagina of [['admin', 'index.html'], ['admin', 'conteudo', 'index.html']]) {
    assert.match(ler(...pagina), /<main id="principal"[\s\S]*<div id="ajudas-perfil" class="ajudas-perfil"><\/div>\s*<\/main>/, pagina.join('/'));
  }
  assert.match(ler('admin', 'styles.css'), /\.ajudas-perfil \{[^}]*position: absolute;[^}]*width: 1px;/);
  for (const codigo of [conteudo, gestao, ler('admin', 'admin-logic.js')]) {
    assert.match(codigo, /instalarBloqueioDePerfil/);
    assert.doesNotMatch(codigo, /innerHTML|outerHTML|insertAdjacentHTML|localStorage|sessionStorage|document\.cookie/);
  }
});

test('PA10. decisões: na gravação nova, Cadastrante é recusado em decisão material, autorização e revogação; a leitura aceita registros antigos', () => {
  const { v } = ate('em_validacao');
  const base = { versaoId: v.id, hashConteudo: v.hashConteudo, data: '2026-01-12', observacao: null };
  const material = { ...base, id: 'decisao-1', tipo: 'decisao_material', decisao: 'validado_materialmente' };
  const autorizacao = { ...base, id: 'autorizacao-1', tipo: 'autorizacao_publicacao' };
  const revogacao = { ...base, id: 'revogacao-1', tipo: 'revogacao', motivo: 'Motivo fictício.' };
  for (const r of [material, autorizacao, revogacao]) {
    assert.deepEqual(validarRegistro({ ...r, ator: { ...MARIA } }), [], `leitura: ${r.tipo}`);
    assert.deepEqual(validarRegistro({ ...r, ator: { ...MARIA } }, { nova: true }), ['ator com perfil cadastrante não pode registrar esta decisão'], r.tipo);
    assert.deepEqual(validarRegistro({ ...r, ator: { ...CARLOS } }, { nova: true }), [], r.tipo);
    assert.deepEqual(validarRegistro({ ...r, ator: { ...ATOR_DEMONSTRACAO } }), [], `registro antigo: ${r.tipo}`);
    assert.deepEqual(validarRegistro({ ...r, responsavel: 'Servidor de demonstração', unidade: 'Ambiente local de demonstração' }), [], `formato antigo: ${r.tipo}`);
  }
  // Histórico antigo com um registro de Cadastrante continua legível.
  assert.deepEqual(validarHistorico([{ ...material, ator: { ...MARIA } }]), []);
  // As funções de decisão (gravação nova) recusam Cadastrante.
  assert.equal(registrarDecisaoMaterial(v, [], { id: 'decisao-1', versaoId: v.id, hashConteudo: v.hashConteudo, data: '2026-01-12', decisao: 'validado_materialmente', ator: { ...MARIA } }).erro, 'decisao_invalida');
  assert.equal(registrarDecisaoMaterial(v, [], { id: 'decisao-1', versaoId: v.id, hashConteudo: v.hashConteudo, data: '2026-01-12', decisao: 'validado_materialmente', ator: { ...CARLOS } }).ok, true);
  const validada = ate('validado_materialmente');
  assert.equal(autorizarPublicacao(validada.v, validada.h, { id: 'autorizacao-9', versaoId: validada.v.id, hashConteudo: validada.v.hashConteudo, data: '2026-01-13', ator: { ...MARIA } }).erro, 'autorizacao_invalida');
  const publicada = ate('publicado');
  const vp = { ...publicada.v, publicadoEm: '2026-01-14' };
  assert.equal(revogarVersao(vp, publicada.h, { id: 'revogacao-9', versaoId: vp.id, hashConteudo: vp.hashConteudo, data: '2026-01-15', motivo: 'Motivo fictício.', ator: { ...MARIA } }).erro, 'revogacao_invalida');
  assert.equal(revogarVersao(vp, publicada.h, { id: 'revogacao-9', versaoId: vp.id, hashConteudo: vp.hashConteudo, data: '2026-01-15', motivo: 'Motivo fictício.', ator: { ...CARLOS } }).ok, true);
});

test('PA12. rota de entradas de texto: códigos internos e erros do ator nunca saem na resposta (500 genérico); perfil continua 403', async () => {
  await comCopia(async ({ raiz }) => {
    const gravador = criarGravadorEntradas({ raiz, agora: AGORA });
    const corpo = { titulo: 'Texto fictício PA12', texto: 'Orientação fictícia do teste PA12.' };
    const casos = [
      [gravador.gravar('lac', corpo), 500, { erro: 'indisponivel' }],
      [gravador.gravar('lac', corpo, { ator: ATOR_DEMONSTRACAO }), 500, { erro: 'indisponivel' }],
      [gravador.gravar('lac', corpo, { ator: { usuarioId: 'usuario-ficticio', perfil: 'revisor', setor: 'CLABI' } }), 500, { erro: 'indisponivel' }],
      [gravador.gravar('lac', corpo, { ator: CARLOS }), 403, { erro: 'perfil_sem_permissao' }],
    ];
    for (const [g, status, esperado] of casos) {
      const r = respostaDaEntradaDeTexto(g);
      assert.deepEqual([r.status, r.corpo], [status, esperado]);
      assert.doesNotMatch(JSON.stringify(r), /ator_|Texto fictício/);
    }
    assert.equal(fs.existsSync(path.join(raiz, 'data')), false);
  });
  // Códigos internos desconhecidos, status estranho ou formato errado: 500 genérico. Códigos públicos passam com campos só de texto.
  for (const g of [{ ok: false, status: 409, erro: 'codigo_interno_qualquer' }, { ok: false, status: 'x', erro: 'dados_invalidos' }, { ok: false, status: 200, erro: 'dados_invalidos' }, null, 'x']) {
    assert.deepEqual(respostaDaEntradaDeTexto(g), { status: 500, corpo: { erro: 'indisponivel' } }, JSON.stringify(g));
  }
  assert.deepEqual(respostaDaEntradaDeTexto({ ok: false, status: 422, erro: 'dados_invalidos', campos: ['texto', 7] }), { status: 422, corpo: { erro: 'dados_invalidos', campos: ['texto'] } });
  assert.deepEqual(respostaDaEntradaDeTexto({ ok: false, status: 404, erro: 'nao_encontrado', campo: 'servico' }), { status: 404, corpo: { erro: 'nao_encontrado', campo: 'servico' } });
  assert.deepEqual(respostaDaEntradaDeTexto({ ok: true, status: 201, entradaId: 'x', hash: 'y' }), { status: 201, corpo: { criado: true } });
  // Pela rota, com o perfil errado, a resposta é a de perfil (antes do corpo), sem código interno.
  await comCopia(async ({ raiz, pai }) => {
    const m = criarManipuladorAdmin({ raiz, agora: AGORA, diretorioTemporario: pai });
    const token = await entrar(m, 'carlos-silva');
    const r = await chamar(m, { url: '/__admin/servicos/lac/entradas-texto', method: 'POST', token, corpo: { titulo: 'T', texto: 'Texto.' } });
    assert.deepEqual([r.status, r.corpo], [403, { erro: 'perfil_sem_permissao' }]);
  });
});

test('PA13. check-dist proíbe os termos do 8C, e nenhum deles aparece no chat público (src/, index.html, public/, services/*/publico/)', () => {
  const termos = ['acoes-das-rotas', 'perfil_sem_permissao', 'acao_negada', 'ajuda-perfil', 'aplicarPermissoesDoPerfil'];
  for (const t of termos) assert.ok(NOMES_ADMINISTRATIVOS.includes(t), t);
  const arquivos = [];
  const andar = (d) => {
    if (!fs.existsSync(d)) return;
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) andar(p);
      else arquivos.push(p);
    }
  };
  andar(path.join(RAIZ, 'src'));
  andar(path.join(RAIZ, 'public'));
  arquivos.push(path.join(RAIZ, 'index.html'));
  for (const s of fs.readdirSync(path.join(RAIZ, 'services'), { withFileTypes: true })) if (s.isDirectory()) andar(path.join(RAIZ, 'services', s.name, 'publico'));
  assert.ok(arquivos.length > 0);
  for (const a of arquivos) {
    const texto = fs.readFileSync(a, 'utf8');
    for (const t of termos) assert.equal(texto.includes(t), false, `${t} em ${path.relative(RAIZ, a)}`);
  }
});

test('PA11. a base real não foi alterada por estes testes e data/ não foi criada no repositório', () => {
  assert.deepEqual(retrato(RAIZ), RETRATO_REAL_ANTES);
  assert.equal(fs.existsSync(path.join(RAIZ, 'data')), EXISTIA_DATA);
});
