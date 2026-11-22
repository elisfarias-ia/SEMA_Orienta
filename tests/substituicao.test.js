// Substituição (Sprint 7, substituição): quando uma versão é publicada, a publicada anterior vira "substituido" na MESMA transação.
// Os testes gravam só em cópias temporárias fora do repositório (helpers copiados de tests/publicacao.test.js, que roda os próprios
// testes ao ser importado). Nenhum dado real é alterado.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { criarManipuladorAdmin, CABECALHO_TOKEN, ROTA_SESSAO } from '../services/admin/admin-endpoint.js';
import { criarServicoPublicacao } from '../services/admin/publicacao.js';
import { criarServicoRevisao } from '../services/admin/revisao-servico.js';
import { ACOES_DA_VERSAO, acoesPermitidas, proximosEstados, transicaoPermitida, verificarAcao, ESTADOS_VERSAO } from '../services/admin/fluxo.js';
import { criarNovaVersao, ESTADOS_QUE_PERMITEM_NOVA_VERSAO, ETAPAS_COM_RESPONSAVEL, validarVersao } from '../services/admin/versao.js';
import { lerConteudoPublicado } from '../services/publicacao-publica.js';
import { validarServicos } from '../scripts/validate-services.js';
import { CARLOS, MARIA, enviarEValidar } from './admin-auxiliar.js';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const AGORA = () => new Date(2026, 10, 17, 12, 0, 0);
const MANUAL = 'manual-lac-siga-2020';
const TEXTO_ORIGINAL = 'Texto original interno fictício que nunca deve ir ao público.';

function retrato(raiz, pastas = ['services', 'data']) {
  const itens = [];
  const andar = (d) => {
    if (!fs.existsSync(d)) return;
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) {
        itens.push(`D ${path.relative(raiz, p)}`);
        andar(p);
      } else {
        itens.push(`F ${path.relative(raiz, p)} ${fs.readFileSync(p).toString('base64')}`);
      }
    }
  };
  for (const p of pastas) andar(path.join(raiz, p));
  return itens.sort();
}

const lerJ = (raiz, ...p) => JSON.parse(fs.readFileSync(path.join(raiz, ...p), 'utf8'));
const gravarJ = (raiz, p, d) => fs.writeFileSync(path.join(raiz, ...p), `${JSON.stringify(d, null, 2)}\n`);
const arq = (nome, n = 1) => ['services', 'lac', 'versoes', `v${n}`, nome];
const manifesto = (raiz, n = 1) => lerJ(raiz, ...arq('versao.json', n));
const registro = (raiz) => lerJ(raiz, 'services', 'registry.json').servicos[0];
const pastaPublica = (raiz) => path.join(raiz, 'services', 'lac', 'publico');
const arquivosPublicos = (raiz) => (fs.existsSync(pastaPublica(raiz)) ? fs.readdirSync(pastaPublica(raiz)).sort() : []);
const bloco = (id, titulo, fonteIds, extra = {}) => ({
  id, tipo: 'conhecimento', titulo, texto: `Orientação fictícia aprovada: ${titulo}.`, fonteIds,
  referencias: fonteIds.map((f) => ({ fonteId: f, localizacao: 'página 1' })), origem: 'fonte', ambiente: 'publico',
  statusValidacao: 'rascunho', publicado: false, revisaoAtualidade: 'pendente', criadoEm: '2026-11-10', atualizadoEm: '2026-11-10', ...extra,
});

async function enviarBruto(m, { url, method = 'POST', corpo, token, cabecalhos = {} } = {}) {
  const buffer = method === 'GET' ? Buffer.alloc(0) : Buffer.from(JSON.stringify(corpo ?? {}));
  const headers = { host: 'localhost:5173', ...cabecalhos };
  if (method !== 'GET') { headers['content-type'] = 'application/json'; headers['content-length'] = String(buffer.length); }
  if (token !== undefined) headers[CABECALHO_TOKEN] = token;
  const req = Object.assign(Readable.from([buffer]), { url, method, headers, socket: { remoteAddress: '127.0.0.1', localPort: 5173 } });
  let resposta = null;
  const res = { statusCode: 0, setHeader: () => {}, end: (t) => { resposta = t; } };
  await m(req, res, () => {});
  return { status: res.statusCode, corpo: resposta === null ? null : JSON.parse(resposta), bruto: resposta ?? '' };
}

const TOKEN_FIXO = 'c'.repeat(64);
const ROTA_DO_REVISOR = /\/(revisao\/validar|revisao\/ajustes|autorizacao|publicacao|revogacao)$/;
const entrarComo = (m, usuarioId) => enviarBruto(m, { url: ROTA_SESSAO, corpo: { usuarioId } });
async function enviar(m, opcoes = {}) {
  const { method = 'POST' } = opcoes;
  if (method !== 'POST' || opcoes.token === undefined || !ROTA_DO_REVISOR.test(opcoes.url ?? '')) return enviarBruto(m, opcoes);
  await entrarComo(m, 'carlos-silva');
  try {
    return await enviarBruto(m, opcoes);
  } finally {
    await entrarComo(m, 'maria-silva');
  }
}
const obterToken = async (m) => (await enviar(m, { url: ROTA_SESSAO, corpo: { usuarioId: 'maria-silva' } })).corpo.token;

/** Cópia temporária com duas informações em elaboração (uma de link e uma de texto cadastrado), como em publicacao.test.js. */
async function comCopia(fn) {
  const pai = fs.mkdtempSync(path.join(os.tmpdir(), 'sema-orienta-substituicao-'));
  const raiz = path.join(pai, 'raiz');
  fs.mkdirSync(raiz);
  fs.cpSync(path.join(RAIZ, 'services'), path.join(raiz, 'services'), { recursive: true });
  try {
    const m = criarManipuladorAdmin({ raiz, agora: AGORA, diretorioTemporario: pai, gerarToken: () => TOKEN_FIXO });
    const token = await obterToken(m);
    const post = (rota, corpo, cabecalhos) => enviar(m, { url: `/__admin/servicos/lac/${rota}`, corpo, token, cabecalhos });
    const ctx = { m, token, raiz, post, pai };
    ctx.preparar = async () => {
      assert.equal((await post('entradas-texto', { titulo: 'Texto interno fictício', texto: TEXTO_ORIGINAL })).status, 201);
      const idTexto = lerJ(raiz, ...arq('fontes.json')).fontes.find((f) => f.formaEntrada === 'texto').id;
      const c = lerJ(raiz, ...arq('conteudo-assistente.json'));
      c.blocos.push(bloco('bc-link', 'Informação de link', [MANUAL]), bloco('bc-texto', 'Informação de texto', [idTexto]));
      gravarJ(raiz, arq('conteudo-assistente.json'), c);
    };
    await fn(ctx);
  } finally {
    fs.rmSync(pai, { recursive: true, force: true });
  }
}

/** Revisa as fontes usadas, aceita as informações e envia a versão atual para validação (como em publicacao.test.js). */
function revisarEConcluir(raiz) {
  const rev = criarServicoRevisao({ raiz, agora: AGORA });
  const sit = () => rev.consultar('lac').situacao;
  for (const id of sit().fontes.filter((f) => f.usadaPorBloco && !f.revisada).map((f) => f.id)) {
    assert.equal(rev.revisarFonte('lac', { ator: MARIA, fonteId: id, revisao: sit().revisao }).ok, true);
  }
  for (const id of sit().blocos.filter((b) => !b.aceito).map((b) => b.id)) {
    assert.equal(rev.aceitarBloco('lac', { ator: MARIA, blocoId: id, revisao: sit().revisao }).ok, true);
  }
  const r = enviarEValidar(rev, 'lac', sit().revisao);
  assert.equal(r.ok, true);
  return { rev, revisao: r.hash };
}

const publicador = (raiz, extra = {}) => criarServicoPublicacao({ raiz, agora: AGORA, ...extra });

/** v1: preparada, revisada, autorizada e publicada. */
async function publicarPrimeira(ctx) {
  await ctx.preparar();
  const { revisao } = revisarEConcluir(ctx.raiz);
  const pub = publicador(ctx.raiz);
  assert.equal(pub.autorizar('lac', { ator: CARLOS, revisao }).ok, true);
  assert.equal(pub.publicar('lac', { ator: CARLOS, revisao }).ok, true);
  return { revisao };
}

/** Nova versão a partir da atual, com `alterar` aplicado ao rascunho; revisada e autorizada, mas NÃO publicada. */
function novaVersaoAutorizada(raiz, alterar = () => {}) {
  const rev = criarServicoRevisao({ raiz, agora: AGORA });
  assert.equal(rev.criarNovaVersao('lac', { ator: MARIA }).ok, true);
  alterar();
  const { revisao } = revisarEConcluir(raiz);
  assert.equal(publicador(raiz).autorizar('lac', { ator: CARLOS, revisao }).ok, true);
  return { revisao };
}

/** Acrescenta uma frase a um bloco do rascunho, para a nova versão ter conteúdo diferente (hash diferente). */
const alterarRascunho = (raiz, n) => () => {
  const c = lerJ(raiz, ...arq('conteudo-assistente.json', n));
  const alvo = c.blocos.find((b) => b.id === 'bc-texto');
  alvo.texto = `${alvo.texto} Atualização fictícia da versão ${n}.`;
  gravarJ(raiz, arq('conteudo-assistente.json', n), c);
};

// Versão substituída válida, para os testes de esquema e de responsáveis.
const substituida = (extra = {}) => ({
  id: 'lac-v1', servicoId: 'lac', numero: 1, baseadaEm: null, estado: 'substituido', arquivos: { roteiro: 'services/lac/versoes/v1/roteiro.md' },
  hashConteudo: 'a'.repeat(64), criadoEm: '2026-11-10', enviadaEm: '2026-11-11', publicadoEm: '2026-11-17', substituidoEm: '2026-11-18',
  substituidaPor: 'lac-v2', ...extra,
});
const semCampo = (v, campo) => { const copia = { ...v }; delete copia[campo]; return copia; };

test('T1. publicar a v2 substitui a v1: v1 fica "substituido" com substituidoEm, o arquivo dela permanece, o público é a v2 e a base é válida', async () => {
  await comCopia(async (ctx) => {
    const { raiz } = ctx;
    await publicarPrimeira(ctx);
    const publicadoV1 = lerConteudoPublicado(raiz, 'lac');
    assert.equal(arquivosPublicos(raiz).length, 1);
    const { revisao } = novaVersaoAutorizada(raiz, alterarRascunho(raiz, 2));
    assert.equal(publicador(raiz).publicar('lac', { ator: CARLOS, revisao }).ok, true);

    const m1 = manifesto(raiz, 1);
    assert.equal(m1.estado, 'substituido');
    assert.equal(m1.substituidoEm, '2026-11-17');
    assert.equal(m1.substituidaPor, 'lac-v2');
    assert.equal(m1.publicadoEm, '2026-11-17');
    assert.deepEqual(m1.responsaveis, manifesto(raiz, 1).responsaveis);
    assert.equal(manifesto(raiz, 2).estado, 'publicado');
    assert.equal(registro(raiz).versaoPublicadaId, 'lac-v2');
    assert.equal(fs.existsSync(path.join(raiz, 'services', 'lac', 'versoes', 'v1', 'versao.json')), true);
    assert.equal(arquivosPublicos(raiz).length, 2, 'o arquivo público da v1 fica no disco');
    const servido = lerConteudoPublicado(raiz, 'lac');
    assert.notEqual(servido, null);
    assert.notDeepEqual(servido, publicadoV1, 'o público servido passa a ser o da v2');
    assert.deepEqual(validarServicos(raiz).erros, []);
    const historico = fs.readFileSync(path.join(raiz, 'data', 'admin-private', 'revisao', 'lac.jsonl'), 'utf8');
    assert.equal(historico.split('\n').filter((l) => l.includes('"publicar"')).length, 2, 'histórico com as duas publicações');
  });
});

test('T2. se gravar o manifesto da v1 falhar, a publicação da v2 é desfeita: v1 segue publicada e o registro segue na v1', async () => {
  await comCopia(async (ctx) => {
    const { raiz } = ctx;
    await publicarPrimeira(ctx);
    const v2 = novaVersaoAutorizada(raiz, alterarRascunho(raiz, 2));
    const antes = retrato(raiz);
    const sistema = {
      ...fs,
      renameSync: (a, b) => {
        if (String(b).replace(/\\/g, '/').endsWith('/services/lac/versoes/v1/versao.json')) throw new Error('falha injetada');
        return fs.renameSync(a, b);
      },
    };
    const r = publicador(raiz, { sistema }).publicar('lac', { ator: CARLOS, revisao: v2.revisao });
    assert.equal(r.ok, false);
    assert.equal(r.revertido, true);
    assert.deepEqual(retrato(raiz), antes, 'nada muda na base, nem o arquivo público da v2');
    assert.equal(manifesto(raiz, 1).estado, 'publicado');
    assert.equal(registro(raiz).versaoPublicadaId, 'lac-v1');
    assert.equal(manifesto(raiz, 2).estado, 'autorizado_publicacao');
    assert.equal(publicador(raiz).publicar('lac', { ator: CARLOS, revisao: v2.revisao }).ok, true, 'a nova tentativa funciona');
    assert.equal(manifesto(raiz, 1).estado, 'substituido');
  });
});

test('T3. revogar a v2 deixa o registro sem publicação; a v1 continua substituída e não volta a ser servida', async () => {
  await comCopia(async (ctx) => {
    const { raiz } = ctx;
    await publicarPrimeira(ctx);
    const v2 = novaVersaoAutorizada(raiz, alterarRascunho(raiz, 2));
    assert.equal(publicador(raiz).publicar('lac', { ator: CARLOS, revisao: v2.revisao }).ok, true);
    const r = publicador(raiz).revogar('lac', { ator: CARLOS, revisao: v2.revisao, motivo: 'Motivo fictício de revogação.' });
    assert.equal(r.ok, true);
    assert.equal(manifesto(raiz, 2).estado, 'revogado');
    assert.equal(registro(raiz).versaoPublicadaId, null);
    assert.equal(registro(raiz).publicado, false);
    assert.equal(manifesto(raiz, 1).estado, 'substituido');
    assert.equal(lerConteudoPublicado(raiz, 'lac'), null, 'nada é servido');
    assert.deepEqual(validarServicos(raiz).erros, []);
  });
});

test('T4. repontar o registro manualmente para a v1 substituída é recusado pelo validador', async () => {
  await comCopia(async (ctx) => {
    const { raiz } = ctx;
    await publicarPrimeira(ctx);
    const { revisao: v2Revisao } = novaVersaoAutorizada(raiz, alterarRascunho(raiz, 2));
    assert.equal(publicador(raiz).publicar('lac', { ator: CARLOS, revisao: v2Revisao }).ok, true);
    assert.equal(manifesto(raiz, 1).estado, 'substituido');
    const reg = lerJ(raiz, 'services', 'registry.json');
    reg.servicos[0].versaoPublicadaId = 'lac-v1';
    gravarJ(raiz, ['services', 'registry.json'], reg);
    const erros = validarServicos(raiz).erros;
    assert.ok(erros.some((e) => e.includes('não pode apontar para uma versão substituída')), erros.join(' | '));
  });
});

test('T4b. registro com versaoAtualId apontando para versão substituída é recusado, mesmo com versaoPublicadaId nulo', async () => {
  await comCopia(async (ctx) => {
    const { raiz } = ctx;
    await publicarPrimeira(ctx);
    novaVersaoAutorizada(raiz, alterarRascunho(raiz, 2));
    assert.equal(publicador(raiz).publicar('lac', { ator: CARLOS, revisao: manifesto(raiz, 2).hashConteudo }).ok, true);
    assert.equal(manifesto(raiz, 1).estado, 'substituido');
    const reg = lerJ(raiz, 'services', 'registry.json');
    reg.servicos[0].versaoAtualId = 'lac-v1';
    reg.servicos[0].versaoPublicadaId = null;
    reg.servicos[0].publicado = false;
    gravarJ(raiz, ['services', 'registry.json'], reg);
    const erros = validarServicos(raiz).erros;
    assert.ok(erros.some((e) => e.includes('versaoAtualId não pode apontar para uma versão substituída')), erros.join(' | '));
  });
});

test('T5. nova entrada de autorização da v1 (no arquivo de autorizações do hook) não basta: o validador continua recusando o registro', async () => {
  await comCopia(async (ctx) => {
    const { raiz } = ctx;
    await publicarPrimeira(ctx);
    const { revisao: v2Revisao } = novaVersaoAutorizada(raiz, alterarRascunho(raiz, 2));
    assert.equal(publicador(raiz).publicar('lac', { ator: CARLOS, revisao: v2Revisao }).ok, true);
    const reg = lerJ(raiz, 'services', 'registry.json');
    reg.servicos[0].versaoPublicadaId = 'lac-v1';
    gravarJ(raiz, ['services', 'registry.json'], reg);
    const hash16 = manifesto(raiz, 1).hashConteudo.slice(0, 16);
    fs.mkdirSync(path.join(raiz, '.githooks'), { recursive: true });
    fs.writeFileSync(path.join(raiz, '.githooks', 'publicacoes-autorizadas.json'), `${JSON.stringify({ publicacoes: [{
      servicoId: 'lac', versaoId: 'lac-v1', hashConteudo: manifesto(raiz, 1).hashConteudo, arquivoPublico: `conteudo-${hash16}.json`,
      referencia: 'Issue fictícia', data: '2026-11-17',
    }] })}\n`);
    const erros = validarServicos(raiz).erros;
    assert.ok(erros.some((e) => e.includes('não pode apontar para uma versão substituída')), erros.join(' | '));
  });
});

test('T6. caminho correto: a v3 nasce da v2 revogada, é autorizada e publicada; o registro aponta para a v3 e nem a v1 nem a v2 são servidas', async () => {
  await comCopia(async (ctx) => {
    const { raiz } = ctx;
    await publicarPrimeira(ctx);
    const servidaV1 = lerConteudoPublicado(raiz, 'lac');
    const v2 = novaVersaoAutorizada(raiz, alterarRascunho(raiz, 2));
    assert.equal(publicador(raiz).publicar('lac', { ator: CARLOS, revisao: v2.revisao }).ok, true);
    const servidaV2 = lerConteudoPublicado(raiz, 'lac');
    assert.equal(publicador(raiz).revogar('lac', { ator: CARLOS, revisao: v2.revisao, motivo: 'Motivo fictício de revogação.' }).ok, true);
    const v3 = novaVersaoAutorizada(raiz, alterarRascunho(raiz, 3));
    assert.equal(publicador(raiz).publicar('lac', { ator: CARLOS, revisao: v3.revisao }).ok, true);
    assert.equal(registro(raiz).versaoPublicadaId, 'lac-v3');
    assert.equal(manifesto(raiz, 1).estado, 'substituido');
    assert.equal(manifesto(raiz, 2).estado, 'revogado');
    assert.equal(manifesto(raiz, 3).estado, 'publicado');
    const servida = lerConteudoPublicado(raiz, 'lac');
    assert.notEqual(servida, null);
    assert.notDeepEqual(servida, servidaV1);
    assert.notDeepEqual(servida, servidaV2);
    assert.deepEqual(validarServicos(raiz).erros, []);
  });
});

test('T7. transições: substituido é terminal (nada sai dele), só se chega a ele a partir de publicado, e nenhuma ação do usuário leva a ele', () => {
  assert.deepEqual(proximosEstados('substituido'), []);
  for (const para of ESTADOS_VERSAO) assert.equal(transicaoPermitida('substituido', para), false, `substituido -> ${para}`);
  for (const de of ESTADOS_VERSAO) assert.equal(transicaoPermitida(de, 'substituido'), de === 'publicado', `${de} -> substituido`);
  assert.equal(transicaoPermitida('substituido', 'publicado'), false);
  for (const [acao, definicao] of Object.entries(ACOES_DA_VERSAO)) assert.notEqual(definicao.para, 'substituido', acao);
  for (const estado of ESTADOS_VERSAO) {
    for (const acao of Object.keys(ACOES_DA_VERSAO)) assert.notEqual(verificarAcao(acao, estado).para, 'substituido', `${acao} em ${estado}`);
  }
  assert.deepEqual(acoesPermitidas('substituido'), []);
  assert.equal(ESTADOS_QUE_PERMITEM_NOVA_VERSAO.includes('substituido'), false);
  const nova = criarNovaVersao(substituida(), { id: 'lac-v3', criadoEm: '2026-11-20' });
  assert.deepEqual(nova, { ok: false, erro: 'estado_nao_permite_nova_versao' });
});

test('T8. responsáveis: a versão substituída aceita os responsáveis de envio, validação, autorização e publicação (da própria v1); revogação é recusada', () => {
  const responsaveis = {
    envio: { perfil: 'cadastrante', setor: 'CLABI' },
    validacao: { perfil: 'revisor', setor: 'CLABI' },
    autorizacao: { perfil: 'revisor', setor: 'CLABI' },
    publicacao: { perfil: 'revisor', setor: 'CLABI' },
  };
  assert.deepEqual(validarVersao(substituida({ responsaveis })), []);
  assert.deepEqual(validarVersao(substituida()), [], 'substituida() sem responsáveis também é válida');
  for (const etapa of ['envio', 'validacao', 'autorizacao', 'publicacao']) {
    assert.ok(ETAPAS_COM_RESPONSAVEL[etapa].includes('substituido'), etapa);
  }
  assert.equal(ETAPAS_COM_RESPONSAVEL.revogacao.includes('substituido'), false);
  const comRevogacao = validarVersao(substituida({ responsaveis: { ...responsaveis, revogacao: { perfil: 'revisor', setor: 'CLABI' } } }));
  assert.ok(comRevogacao.some((e) => e.includes('responsaveis.revogacao não é permitido neste estado')), comRevogacao.join(' | '));
  const ajustes = validarVersao(substituida({ responsaveis: { ajustes: { perfil: 'revisor', setor: 'CLABI' } } }));
  assert.ok(ajustes.some((e) => e.includes('responsaveis.ajustes não é permitido neste estado')), ajustes.join(' | '));
});

test('T9. esquema e validação dos campos da substituição: enum do schema igual a ESTADOS_VERSAO; substituidoEm e substituidaPor conferidos', () => {
  const schema = JSON.parse(fs.readFileSync(path.join(RAIZ, 'services', 'schemas', 'versao.schema.json'), 'utf8'));
  assert.deepEqual(schema.properties.estado.enum, [...ESTADOS_VERSAO]);
  assert.ok(schema.properties.substituidoEm && schema.properties.substituidaPor, 'propriedades no esquema');
  assert.deepEqual(validarVersao(substituida()), []);
  assert.deepEqual(validarVersao(semCampo(substituida(), 'substituidoEm')), ['versão substituída exige substituidoEm']);
  assert.ok(validarVersao(substituida({ substituidoEm: '2026-11-16' })).some((e) => e.includes('substituidoEm não pode ser anterior a publicadoEm')));
  assert.ok(validarVersao(substituida({ substituidoEm: '18/11/2026' })).some((e) => e.includes('substituidoEm deve ser uma data válida')));
  assert.ok(validarVersao(substituida({ substituidaPor: 'lac-v1' })).some((e) => e.includes('substituidaPor deve ser o id de outra versão')));
  assert.deepEqual(validarVersao(semCampo(substituida(), 'substituidaPor')), [], 'substituidaPor é opcional');
  assert.ok(validarVersao(semCampo(substituida(), 'publicadoEm')).some((e) => e.includes('exige publicadoEm')));
  const publicada = { ...substituida(), estado: 'publicado' };
  delete publicada.substituidoEm;
  delete publicada.substituidaPor;
  assert.deepEqual(validarVersao(publicada), []);
  assert.ok(validarVersao({ ...publicada, substituidoEm: '2026-11-18' }).some((e) => e.includes('substituidoEm só é permitido em versão substituída')));
  assert.ok(validarVersao({ ...publicada, substituidaPor: 'lac-v2' }).some((e) => e.includes('substituidaPor só é permitido em versão substituída')));
});
