// Passo 5B1: revisão humana (services/admin/revisao.js, revisao-servico.js, historico-revisao.js). SEMPRE em cópias temporárias
// fora do repositório, com dados fictícios; a LAC real e o armazenamento privado real nunca são tocados (retrato antes/depois).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { criarServicoRevisao } from '../services/admin/revisao-servico.js';
import { criarHistoricoRevisao, validarAcaoRevisao } from '../services/admin/historico-revisao.js';
import { criarGravadorEntradas } from '../services/admin/entradas-gravacao.js';
import { conferirHashDaVersaoEmDisco, lerArquivosDaVersao } from '../services/admin/versao-arquivos.js';
import { aceitarBloco, validarCorpoDaAcao } from '../services/admin/revisao.js';
import { validarHistorico } from '../services/admin/decisoes.js';
import { validarServicos } from '../scripts/validate-services.js';
import { CARLOS, MARIA, enviarEValidar } from './admin-auxiliar.js';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const AGORA = () => new Date(2026, 10, 16, 12, 0, 0);
const AGORA_2 = () => new Date(2026, 10, 17, 12, 0, 0);
const CANARIO = 'CANARIO-REVISAO-ORIENTACAO-FICTICIA-3307 que não pode ir ao histórico.';

function retrato(raiz, sub = 'services') {
  const itens = [];
  const andar = (d) => {
    if (!fs.existsSync(d)) return;
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) {
        itens.push(`D ${path.relative(raiz, p)}`);
        andar(p);
      } else {
        itens.push(`F ${path.relative(raiz, p)} ${crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')}`);
      }
    }
  };
  andar(path.join(raiz, sub));
  return itens.sort();
}
const RETRATO_REAL_ANTES = retrato(RAIZ);
const EXISTIA_DATA = fs.existsSync(path.join(RAIZ, 'data'));

async function comCopia(fn) {
  const pai = fs.mkdtempSync(path.join(os.tmpdir(), 'sema-orienta-revisao-'));
  const raiz = path.join(pai, 'raiz');
  fs.mkdirSync(raiz);
  fs.cpSync(path.join(RAIZ, 'services'), path.join(raiz, 'services'), { recursive: true });
  try {
    return await fn({ raiz, pai });
  } finally {
    fs.rmSync(pai, { recursive: true, force: true });
  }
}
const arq = (nome, n = 1) => ['services', 'lac', 'versoes', `v${n}`, nome];
const lerJ = (raiz, ...p) => JSON.parse(fs.readFileSync(path.join(raiz, ...p), 'utf8'));
const gravarJ = (raiz, p, dados) => fs.writeFileSync(path.join(raiz, ...p), `${JSON.stringify(dados, null, 2)}\n`);

/** Bloco de conhecimento em elaboração (formato do servidor) ligado às fontes dadas. */
const bloco = (id, fonteIds, extra = {}) => ({
  id, tipo: 'conhecimento', titulo: `Informação ${id}`, texto: 'Texto fictício de orientação.', fonteIds,
  referencias: fonteIds.map((f) => ({ fonteId: f, localizacao: 'página 1' })), origem: 'fonte', ambiente: 'publico',
  statusValidacao: 'rascunho', publicado: false, revisaoAtualidade: 'pendente', criadoEm: '2026-11-10', atualizadoEm: '2026-11-10', ...extra,
});
/** LAC de teste: fontes "manual" e "faq" pendentes (em_validacao), restantes como estão; um bloco de conhecimento por fonte. */
function prepararLac(raiz, blocos = [bloco('bc-um', ['manual-lac-siga-2020'])], pendentes = ['manual-lac-siga-2020']) {
  const f = lerJ(raiz, ...arq('fontes.json'));
  f.fontes.forEach((x) => { if (pendentes.includes(x.id)) x.statusValidacao = 'em_validacao'; });
  gravarJ(raiz, arq('fontes.json'), f);
  const c = lerJ(raiz, ...arq('conteudo-assistente.json'));
  c.blocos.push(...blocos);
  gravarJ(raiz, arq('conteudo-assistente.json'), c);
  assert.deepEqual(validarServicos(raiz).erros, [], 'a LAC de teste precisa ser válida');
}
const revisaoAtual = (rev) => rev.consultar('lac').situacao.revisao;

test('R1. consulta: pendências em linguagem de código, itens só com título, sem texto original, versão "Em elaboração"', async () => {
  await comCopia(async ({ raiz }) => {
    prepararLac(raiz);
    const g = await criarGravadorEntradas({ raiz, agora: AGORA }).gravarEntradaTexto('lac', { titulo: 'Orientação interna', texto: CANARIO }, { ator: MARIA });
    assert.equal(g.ok, true);
    const rev = criarServicoRevisao({ raiz, agora: AGORA });
    const c = rev.consultar('lac');
    assert.equal(c.ok, true);
    const s = c.situacao;
    assert.deepEqual([s.estadoVersao, s.rotulo, s.editavel, s.podeEnviar, s.podeValidar, s.podeSolicitarAjustes, s.motivoAjustes], ['rascunho', 'Em elaboração', true, false, false, false, null]);
    assert.match(s.revisao, /^[0-9a-f]{64}$/);
    assert.deepEqual(s.pendencias.map((p) => p.codigo).sort(), ['bloco_pendente', 'fonte_pendente', 'sem_bloco_aceito']);
    const manual = s.fontes.find((f) => f.id === 'manual-lac-siga-2020');
    assert.deepEqual([manual.revisada, manual.podeRevisar, manual.usadaPorBloco], [false, true, true]);
    assert.ok(s.fontes.some((f) => f.forma === 'texto'));
    assert.ok(!JSON.stringify(s).includes('CANARIO'));
    assert.deepEqual(s.blocos.map((b) => [b.id, b.aceito, b.podeAceitar, b.podeRejeitar, b.fontesPendentes]), [['bc-um', false, false, true, ['manual-lac-siga-2020']]]);
    assert.equal(rev.consultar('nao-existe').erro, 'servico_nao_encontrado');
  });
});

test('R2. revisar fonte: marca validada com dataConsulta, não publica nem altera origemOficial, e registra no histórico', async () => {
  await comCopia(async ({ raiz }) => {
    prepararLac(raiz);
    const f0 = lerJ(raiz, ...arq('fontes.json')).fontes.find((f) => f.id === 'manual-lac-siga-2020');
    f0.dataConsulta = null; // pendente sem data de consulta
    const doc = lerJ(raiz, ...arq('fontes.json'));
    doc.fontes.find((f) => f.id === 'manual-lac-siga-2020').dataConsulta = null;
    gravarJ(raiz, arq('fontes.json'), doc);
    const rev = criarServicoRevisao({ raiz, agora: AGORA_2 });
    const r = rev.revisarFonte('lac', { ator: MARIA, fonteId: 'manual-lac-siga-2020', revisao: revisaoAtual(rev) });
    assert.equal(r.ok, true, JSON.stringify(r));
    const f = lerJ(raiz, ...arq('fontes.json')).fontes.find((x) => x.id === 'manual-lac-siga-2020');
    assert.deepEqual([f.statusValidacao, f.dataConsulta, f.publicado, f.origemOficial], ['validado', '2026-11-17', false, f0.origemOficial]);
    assert.deepEqual(validarServicos(raiz).erros, []);
    // a nova revisão devolvida é a do conteúdo atual
    assert.equal(r.revisao, revisaoAtual(rev));
    const h = criarHistoricoRevisao({ raiz }).listarAcoes('lac');
    assert.deepEqual(h.registros.map((x) => [x.acao, x.versaoId, x.resultado, x.ator]), [['revisar_fonte', 'lac-v1', 'ok', { ...MARIA }]]);
    assert.equal(h.registros[0].hashConteudo, r.revisao);
    // revisar de novo a mesma fonte é recusado
    assert.equal(rev.revisarFonte('lac', { ator: MARIA, fonteId: 'manual-lac-siga-2020', revisao: revisaoAtual(rev) }).erro, 'fonte_ja_revisada');
  });
});

test('R3. revisar fonte: inexistente, revogada, revisão divergente e versão congelada são recusadas sem alterar nada', async () => {
  await comCopia(async ({ raiz }) => {
    prepararLac(raiz, [bloco('bc-um', ['manual-lac-siga-2020'])], ['manual-lac-siga-2020', 'decreto-695-2020']);
    const rev = criarServicoRevisao({ raiz, agora: AGORA });
    const antes = retrato(raiz);
    const r = revisaoAtual(rev);
    assert.equal(rev.revisarFonte('lac', { ator: MARIA, fonteId: 'nao-existe', revisao: r }).erro, 'fonte_nao_encontrada');
    assert.equal(rev.revisarFonte('lac', { ator: MARIA, fonteId: 'decreto-695-2020', revisao: r }).erro, 'fonte_revogada');
    assert.equal(rev.revisarFonte('lac', { ator: MARIA, fonteId: 'manual-lac-siga-2020', revisao: 'a'.repeat(64) }).erro, 'revisao_divergente');
    assert.equal(rev.revisarFonte('outro', { ator: MARIA, fonteId: 'x', revisao: r }).erro, 'servico_nao_encontrado');
    assert.deepEqual(retrato(raiz), antes);
    assert.equal(retrato(raiz, 'data').length, 0, 'nada no histórico quando a ação é recusada');
  });
});

test('R4. aceitar bloco: exige fontes revisadas; aceita, mantém publicado false e não toca em entradas.json', async () => {
  await comCopia(async ({ raiz }) => {
    prepararLac(raiz);
    const rev = criarServicoRevisao({ raiz, agora: AGORA_2 });
    const entradasAntes = fs.existsSync(path.join(raiz, ...arq('entradas.json')));
    const pendente = rev.aceitarBloco('lac', { ator: MARIA, blocoId: 'bc-um', revisao: revisaoAtual(rev) });
    assert.deepEqual([pendente.ok, pendente.erro, pendente.fontes], [false, 'fonte_pendente', ['manual-lac-siga-2020']]);
    assert.equal(rev.revisarFonte('lac', { ator: MARIA, fonteId: 'manual-lac-siga-2020', revisao: revisaoAtual(rev) }).ok, true);
    const ok = rev.aceitarBloco('lac', { ator: MARIA, blocoId: 'bc-um', revisao: revisaoAtual(rev) });
    assert.equal(ok.ok, true, JSON.stringify(ok));
    const b = lerJ(raiz, ...arq('conteudo-assistente.json')).blocos.find((x) => x.id === 'bc-um');
    assert.deepEqual([b.statusValidacao, b.revisaoAtualidade, b.publicado, b.atualizadoEm], ['validado', 'concluida', false, '2026-11-17']);
    assert.equal(fs.existsSync(path.join(raiz, ...arq('entradas.json'))), entradasAntes);
    assert.deepEqual(validarServicos(raiz).erros, []);
    assert.equal(rev.aceitarBloco('lac', { ator: MARIA, blocoId: 'bc-um', revisao: revisaoAtual(rev) }).erro, 'bloco_ja_aceito');
    assert.deepEqual(criarHistoricoRevisao({ raiz }).listarAcoes('lac').registros.map((x) => x.acao), ['revisar_fonte', 'aceitar_bloco']);
  });
});

test('R5. aceitar bloco: inexistente, de teste, sem fonte e fonte revogada são recusados', async () => {
  await comCopia(async ({ raiz }) => {
    prepararLac(raiz, [bloco('bc-um', ['manual-lac-siga-2020'])], ['manual-lac-siga-2020']);
    const rev = criarServicoRevisao({ raiz, agora: AGORA });
    const teste = lerJ(raiz, ...arq('conteudo-assistente.json')).blocos.find((b) => b.ambiente === 'teste_local');
    const r = () => revisaoAtual(rev);
    assert.equal(rev.aceitarBloco('lac', { ator: MARIA, blocoId: 'bc-nao-existe', revisao: r() }).erro, 'bloco_nao_encontrado');
    assert.equal(rev.aceitarBloco('lac', { ator: MARIA, blocoId: teste.id, revisao: r() }).erro, 'bloco_nao_aceitavel');
    // Bloco ligado a fonte revogada nem chega a existir numa base válida; a regra é conferida pela função pura.
    const lida = lerArquivosDaVersao({ raiz, servicoId: 'lac', versaoId: 'lac-v1' });
    lida.arquivos.conteudoAssistente.blocos.push(bloco('bc-revog', ['decreto-695-2020']));
    assert.equal(aceitarBloco(lida.arquivos, 'bc-revog', '2026-11-17').erro, 'fonte_revogada');
    assert.equal(aceitarBloco(lida.arquivos, 'bc-um', '2026-11-17').erro, 'fonte_pendente');
    lida.arquivos.conteudoAssistente.blocos.push(bloco('bc-sem', []));
    assert.equal(aceitarBloco(lida.arquivos, 'bc-sem', '2026-11-17').erro, 'bloco_sem_fonte');
    // bloco de teste não pode ser rejeitado nem entra nas pendências
    assert.equal(rev.rejeitarBloco('lac', { ator: MARIA, blocoId: teste.id, revisao: r() }).erro, 'bloco_nao_removivel');
    assert.ok(!rev.consultar('lac').situacao.blocos.some((b) => b.id === teste.id));
  });
});

test('R6. rejeitar bloco: remove só o bloco em rascunho; a fonte e a entrada original ficam; registra no histórico', async () => {
  await comCopia(async ({ raiz }) => {
    prepararLac(raiz);
    const g = await criarGravadorEntradas({ raiz, agora: AGORA }).gravarEntradaTexto('lac', { titulo: 'Orientação interna', texto: CANARIO }, { ator: MARIA });
    assert.equal(g.ok, true);
    const fontesAntes = lerJ(raiz, ...arq('fontes.json')).fontes.map((f) => f.id);
    const entradasAntes = fs.readFileSync(path.join(raiz, ...arq('entradas.json')));
    const rev = criarServicoRevisao({ raiz, agora: AGORA_2 });
    const r = rev.rejeitarBloco('lac', { ator: MARIA, blocoId: 'bc-um', revisao: revisaoAtual(rev) });
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.ok(!lerJ(raiz, ...arq('conteudo-assistente.json')).blocos.some((b) => b.id === 'bc-um'));
    assert.deepEqual(lerJ(raiz, ...arq('fontes.json')).fontes.map((f) => f.id), fontesAntes);
    assert.equal(Buffer.compare(fs.readFileSync(path.join(raiz, ...arq('entradas.json'))), entradasAntes), 0);
    // Passo 8C: o cadastro do texto (feito no preparo do teste) também fica no histórico.
    assert.deepEqual(criarHistoricoRevisao({ raiz }).listarAcoes('lac').registros.map((x) => x.acao), ['cadastrar_texto', 'rejeitar_bloco']);
    assert.equal(rev.rejeitarBloco('lac', { ator: MARIA, blocoId: 'bc-um', revisao: revisaoAtual(rev) }).erro, 'bloco_nao_encontrado');
  });
});

/** Fluxo completo até poder enviar para revisão: revisar a fonte e aceitar o bloco. */
function prontoParaConcluir(raiz) {
  prepararLac(raiz);
  const rev = criarServicoRevisao({ raiz, agora: AGORA_2 });
  assert.equal(rev.revisarFonte('lac', { ator: MARIA, fonteId: 'manual-lac-siga-2020', revisao: revisaoAtual(rev) }).ok, true);
  assert.equal(rev.aceitarBloco('lac', { ator: MARIA, blocoId: 'bc-um', revisao: revisaoAtual(rev) }).ok, true);
  return rev;
}

test('R7. (8D) enviar congela (hash, enviadaEm, Em análise) sem decisão; validar registra a decisão e leva a "Pronto para publicar"; nada é autorizado nem publicado', async () => {
  await comCopia(async ({ raiz }) => {
    const rev = prontoParaConcluir(raiz);
    const s = rev.consultar('lac').situacao;
    assert.deepEqual([s.podeEnviar, s.podeValidar, s.podeSolicitarAjustes, s.pendencias], [true, false, false, []]);
    assert.equal('podeConcluir' in s, false, 'Passo 8D: podeConcluir não existe mais');
    const e = rev.enviarParaRevisao('lac', { ator: MARIA, revisao: s.revisao });
    assert.deepEqual([e.ok, e.versaoId, e.estado, e.hash], [true, 'lac-v1', 'em_validacao', s.revisao]);
    let m = lerJ(raiz, ...arq('versao.json'));
    assert.deepEqual([m.estado, m.hashConteudo, m.enviadaEm, m.responsaveis], ['em_validacao', s.revisao, '2026-11-17', { envio: { perfil: 'cadastrante', setor: 'CLABI' } }]);
    assert.equal(criarHistoricoRevisao({ raiz }).listarDecisoes('lac').registros.length, 0, 'o envio não grava decisão');
    assert.deepEqual(criarHistoricoRevisao({ raiz }).listarAcoes('lac').registros.map((x) => x.acao).slice(-1), ['enviar_para_revisao']);
    let sit = rev.consultar('lac').situacao;
    assert.deepEqual([sit.editavel, sit.podeEnviar, sit.podeValidar, sit.podeSolicitarAjustes, sit.rotulo], [false, false, true, true, 'Em análise']);
    // enviada: nada é editável nem revisável; enviar de novo é recusado
    assert.equal(rev.enviarParaRevisao('lac', { ator: MARIA, revisao: s.revisao }).erro, 'versao_congelada');
    assert.equal(rev.revisarFonte('lac', { ator: MARIA, fonteId: 'tr-176-lac', revisao: s.revisao }).erro, 'versao_congelada');
    assert.equal(rev.aceitarBloco('lac', { ator: MARIA, blocoId: 'bc-um', revisao: s.revisao }).erro, 'versao_congelada');
    assert.equal(rev.rejeitarBloco('lac', { ator: MARIA, blocoId: 'bc-um', revisao: s.revisao }).erro, 'versao_congelada');
    assert.equal(rev.criarNovaVersao('lac', { ator: MARIA }).erro, 'validacao_em_andamento', 'em análise não se cria nova versão');
    const r = rev.validarMaterialmente('lac', { ator: CARLOS, revisao: s.revisao });
    assert.deepEqual([r.ok, r.versaoId, r.estado, r.hash], [true, 'lac-v1', 'validado_materialmente', s.revisao]);
    m = lerJ(raiz, ...arq('versao.json'));
    assert.deepEqual([m.estado, m.hashConteudo, m.enviadaEm], ['validado_materialmente', s.revisao, '2026-11-17']);
    assert.deepEqual(m.responsaveis, { envio: { perfil: 'cadastrante', setor: 'CLABI' }, validacao: { perfil: 'revisor', setor: 'CLABI' } });
    const c = conferirHashDaVersaoEmDisco({ raiz, servicoId: 'lac', versaoId: 'lac-v1' });
    assert.deepEqual([c.ok, c.confere], [true, true]);
    assert.deepEqual(validarServicos(raiz).erros, []);
    const reg = lerJ(raiz, 'services', 'registry.json').servicos[0];
    assert.deepEqual([reg.versaoPublicadaId, reg.publicado], [null, false]);
    assert.ok(lerJ(raiz, ...arq('conteudo-assistente.json')).blocos.filter((b) => b.tipo === 'conhecimento').every((b) => b.publicado === false));
    // histórico: decisão material (decisoes.js) e ação, sem autorização
    const dec = criarHistoricoRevisao({ raiz }).listarDecisoes('lac').registros;
    assert.equal(dec.length, 1);
    // A decisão grava o ator (fora do Git); o manifesto guarda só perfil e setor de quem enviou e de quem validou.
    assert.deepEqual([dec[0].tipo, dec[0].decisao, dec[0].versaoId, dec[0].hashConteudo, dec[0].ator, dec[0].observacao, 'responsavel' in dec[0]],
      ['decisao_material', 'validado_materialmente', 'lac-v1', s.revisao, { ...CARLOS }, null, false]);
    assert.deepEqual(validarHistorico(dec), []);
    assert.deepEqual(criarHistoricoRevisao({ raiz }).listarAcoes('lac').registros.map((x) => x.acao).slice(-2), ['enviar_para_revisao', 'validar_materialmente']);
    // validada: validar ou pedir ajustes de novo é recusado
    assert.equal(rev.validarMaterialmente('lac', { ator: CARLOS, revisao: s.revisao }).erro, 'estado_invalido');
    assert.equal(rev.solicitarAjustes('lac', { ator: CARLOS, revisao: s.revisao, motivo: 'Motivo fictício.' }).erro, 'estado_invalido');
    sit = rev.consultar('lac').situacao;
    assert.deepEqual([sit.editavel, sit.podeEnviar, sit.podeValidar, sit.podeSolicitarAjustes, sit.rotulo], [false, false, false, false, 'Pronto para publicar']);
  });
});

test('R8. (8D) enviar é recusado com pendências: sem bloco aceito, bloco pendente, fonte pendente, entrada com hash divergente', async () => {
  await comCopia(async ({ raiz }) => {
    prepararLac(raiz, [bloco('bc-um', ['manual-lac-siga-2020']), bloco('bc-dois', ['faq-lac-2022'])], ['manual-lac-siga-2020']);
    const rev = criarServicoRevisao({ raiz, agora: AGORA });
    const antes = retrato(raiz);
    const tentar = () => rev.enviarParaRevisao('lac', { ator: MARIA, revisao: revisaoAtual(rev) });
    let r = tentar();
    assert.deepEqual([r.erro, r.pendencias.map((p) => p.codigo).sort()], ['revisao_incompleta', ['bloco_pendente', 'bloco_pendente', 'fonte_pendente', 'sem_bloco_aceito']]);
    assert.equal(rev.revisarFonte('lac', { ator: MARIA, fonteId: 'manual-lac-siga-2020', revisao: revisaoAtual(rev) }).ok, true);
    assert.equal(rev.aceitarBloco('lac', { ator: MARIA, blocoId: 'bc-um', revisao: revisaoAtual(rev) }).ok, true);
    r = tentar(); // bc-dois (faq já validada) ainda está pendente
    assert.deepEqual([r.erro, r.pendencias.map((p) => p.codigo)], ['revisao_incompleta', ['bloco_pendente']]);
    assert.equal(rev.aceitarBloco('lac', { ator: MARIA, blocoId: 'bc-dois', revisao: revisaoAtual(rev) }).ok, true);
    // entrada textual com hash divergente
    const g = await criarGravadorEntradas({ raiz, agora: AGORA }).gravarEntradaTexto('lac', { titulo: 'Orientação interna', texto: 'Texto fictício interno.' }, { ator: MARIA });
    assert.equal(g.ok, true);
    const e = lerJ(raiz, ...arq('entradas.json'));
    e.entradas[0].texto = 'Texto adulterado depois.';
    gravarJ(raiz, arq('entradas.json'), e);
    r = tentar();
    assert.equal(r.erro, 'revisao_incompleta');
    assert.ok(r.pendencias.some((p) => p.codigo === 'entrada_invalida'));
    assert.equal(lerJ(raiz, ...arq('versao.json')).estado, 'rascunho');
    assert.notDeepEqual(retrato(raiz), antes);
  });
});

test('R9. (8D) enviar com revisão divergente é recusado; conteúdo alterado entre a consulta e o envio não passa', async () => {
  await comCopia(async ({ raiz }) => {
    const rev = prontoParaConcluir(raiz);
    const vista = revisaoAtual(rev);
    // alguém altera o conteúdo depois da consulta
    const rot = path.join(raiz, ...arq('roteiro.md'));
    fs.appendFileSync(rot, '\nAlteração externa.\n');
    const antes = retrato(raiz);
    assert.equal(rev.enviarParaRevisao('lac', { ator: MARIA, revisao: vista }).erro, 'revisao_divergente');
    assert.deepEqual(retrato(raiz), antes);
    assert.equal(lerJ(raiz, ...arq('versao.json')).estado, 'rascunho');
  });
});

test('R10. (8D) rollback: falha em cada gravação desfaz tudo (fonte, bloco, envio, validação com histórico) e a base fica idêntica', async () => {
  await comCopia(async ({ raiz }) => {
    const rev = prontoParaConcluir(raiz);
    let base = retrato(raiz);
    const s0 = rev.consultar('lac').situacao;
    const falhaEm = (alvo) => ({ ...fs, renameSync(o, d) { if (String(d).endsWith(alvo)) throw new Error('falha injetada'); return fs.renameSync(o, d); }, writeSync(fd, t, ...r) { return fs.writeSync(fd, t, ...r); } });
    // 1) enviar: falha ao gravar o manifesto e ao gravar a ação no histórico
    for (const alvo of ['versao.json', 'lac.jsonl']) {
      const r = criarServicoRevisao({ raiz, sistema: falhaEm(alvo), agora: AGORA_2 }).enviarParaRevisao('lac', { ator: MARIA, revisao: s0.revisao });
      assert.deepEqual([r.ok, r.revertido], [false, true], alvo);
      assert.deepEqual(retrato(raiz), base, `base alterada (${alvo})`);
      assert.equal(lerJ(raiz, ...arq('versao.json')).estado, 'rascunho', alvo);
    }
    assert.equal(criarServicoRevisao({ raiz, agora: AGORA_2 }).enviarParaRevisao('lac', { ator: MARIA, revisao: s0.revisao }).ok, true);
    base = retrato(raiz);
    // 2) validar: falha ao gravar o manifesto, e falha ao gravar o histórico (decisão e ação)
    for (const alvo of ['versao.json', 'lac.jsonl']) {
      const r = criarServicoRevisao({ raiz, sistema: falhaEm(alvo), agora: AGORA_2 }).validarMaterialmente('lac', { ator: CARLOS, revisao: s0.revisao });
      assert.deepEqual([r.ok, r.revertido], [false, true], alvo);
      assert.deepEqual(retrato(raiz), base, `base alterada (${alvo})`);
      assert.equal(lerJ(raiz, ...arq('versao.json')).estado, 'em_validacao', alvo);
    }
    const dec = criarHistoricoRevisao({ raiz }).listarDecisoes('lac');
    assert.equal(dec.registros.length, 0, 'nenhuma decisão fica registrada quando a decisão não pôde ser gravada');
    // A decisão foi gravada mas a ação não: a base é desfeita; a decisão fica, e uma nova tentativa a reaproveita.
    const semAcao = { ...fs, renameSync(o, d) { if (String(d).includes(`${path.sep}revisao${path.sep}lac.jsonl`)) throw new Error('falha injetada'); return fs.renameSync(o, d); } };
    const parcial = criarServicoRevisao({ raiz, sistema: semAcao, agora: AGORA_2 }).validarMaterialmente('lac', { ator: CARLOS, revisao: s0.revisao });
    assert.deepEqual([parcial.ok, parcial.erro, parcial.revertido], [false, 'historico_indisponivel', true]);
    assert.deepEqual(retrato(raiz), base);
    assert.equal(lerJ(raiz, ...arq('versao.json')).estado, 'em_validacao');
    assert.equal(criarHistoricoRevisao({ raiz }).listarDecisoes('lac').registros.length, 1);
    const segunda = criarServicoRevisao({ raiz, agora: AGORA_2 }).validarMaterialmente('lac', { ator: CARLOS, revisao: s0.revisao });
    assert.equal(segunda.ok, true, JSON.stringify(segunda));
    assert.equal(criarHistoricoRevisao({ raiz }).listarDecisoes('lac').registros.length, 1, 'a decisão não é duplicada');
    assert.deepEqual(validarServicos(raiz).erros, []);
  });
  await comCopia(async ({ raiz }) => {
    prepararLac(raiz);
    const base = retrato(raiz);
    const rev0 = criarServicoRevisao({ raiz, agora: AGORA });
    const rv = revisaoAtual(rev0);
    // 3) revisar fonte: falha na gravação do fontes.json e na do histórico
    for (const alvo of ['fontes.json', 'lac.jsonl']) {
      const sistema = { ...fs, renameSync(o, d) { if (String(d).endsWith(alvo)) throw new Error('falha injetada'); return fs.renameSync(o, d); } };
      const r = criarServicoRevisao({ raiz, sistema, agora: AGORA }).revisarFonte('lac', { ator: MARIA, fonteId: 'manual-lac-siga-2020', revisao: rv });
      assert.deepEqual([r.ok, r.revertido], [false, true], alvo);
      assert.deepEqual(retrato(raiz), base, alvo);
    }
    // 4) rejeitar bloco: falha no conteudo-assistente.json
    const sistema = { ...fs, renameSync(o, d) { if (String(d).endsWith('conteudo-assistente.json')) throw new Error('falha injetada'); return fs.renameSync(o, d); } };
    const r = criarServicoRevisao({ raiz, sistema, agora: AGORA }).rejeitarBloco('lac', { ator: MARIA, blocoId: 'bc-um', revisao: rv });
    assert.deepEqual([r.ok, r.revertido], [false, true]);
    assert.deepEqual(retrato(raiz), base);
    // histórico indisponível desfaz a base
    fs.rmSync(path.join(raiz, 'data'), { recursive: true, force: true });
    fs.mkdirSync(path.join(raiz, 'data'), { recursive: true });
    fs.writeFileSync(path.join(raiz, 'data', 'admin-private'), 'arquivo no lugar da pasta');
    const semHistorico = criarServicoRevisao({ raiz, agora: AGORA }).revisarFonte('lac', { ator: MARIA, fonteId: 'manual-lac-siga-2020', revisao: rv });
    assert.deepEqual([semHistorico.ok, semHistorico.erro, semHistorico.revertido], [false, 'historico_indisponivel', true]);
    assert.deepEqual(retrato(raiz), base);
  });
});

test('R10b. (8D) decisão órfã da validação só é reaproveitada se for exatamente a esperada; registro divergente com o mesmo id é recusado', async () => {
  await comCopia(async ({ raiz }) => {
    const rev = prontoParaConcluir(raiz);
    const hash = revisaoAtual(rev);
    assert.equal(rev.enviarParaRevisao('lac', { ator: MARIA, revisao: hash }).ok, true);
    // tentativa desfeita depois de gravar a decisão
    const semAcao = { ...fs, renameSync(o, d) { if (String(d).includes(`${path.sep}revisao${path.sep}lac.jsonl`)) throw new Error('falha injetada'); return fs.renameSync(o, d); } };
    assert.equal(criarServicoRevisao({ raiz, sistema: semAcao, agora: AGORA_2 }).validarMaterialmente('lac', { ator: CARLOS, revisao: hash }).erro, 'historico_indisponivel');
    const arqDecisoes = path.join(raiz, 'data', 'admin-private', 'decisoes', 'lac.jsonl');
    const original = fs.readFileSync(arqDecisoes, 'utf8');
    // adulterado: outro ator com o mesmo id
    const adulterado = JSON.parse(original.trim());
    adulterado.responsavel = 'Outro ator';
    fs.writeFileSync(arqDecisoes, `${JSON.stringify(adulterado)}\n`);
    const antes = retrato(raiz);
    assert.equal(criarServicoRevisao({ raiz, agora: AGORA_2 }).validarMaterialmente('lac', { ator: CARLOS, revisao: hash }).erro, 'historico_invalido');
    assert.deepEqual(retrato(raiz), antes);
    assert.equal(lerJ(raiz, ...arq('versao.json')).estado, 'em_validacao');
    // íntegro: reaproveitado
    fs.writeFileSync(arqDecisoes, original);
    assert.equal(criarServicoRevisao({ raiz, agora: AGORA_2 }).validarMaterialmente('lac', { ator: CARLOS, revisao: hash }).ok, true);
  });
});

test('R11b. nova versão: se a cópia do roteiro divergir, nada é gravado no histórico', async () => {
  await comCopia(async ({ raiz }) => {
    const rev = prontoParaConcluir(raiz);
    assert.equal(enviarEValidar(rev, 'lac', revisaoAtual(rev)).ok, true);
    const acoesAntes = criarHistoricoRevisao({ raiz }).listarAcoes('lac').registros.length;
    const antes = retrato(raiz);
    const sistema = { ...fs, writeSync(fd, texto, ...r) { return fs.writeSync(fd, typeof texto === 'string' && texto.startsWith('# ') ? texto.replace(/\s+$/, '') : texto, ...r); } };
    const r = criarServicoRevisao({ raiz, sistema, agora: AGORA_2 }).criarNovaVersao('lac', { ator: MARIA });
    assert.equal(r.ok, false);
    assert.deepEqual(retrato(raiz), antes);
    assert.equal(criarHistoricoRevisao({ raiz }).listarAcoes('lac').registros.length, acoesAntes, 'ação não registrada quando a nova versão é desfeita');
  });
});

test('R11. nova versão a partir da concluída: cria a v2 em elaboração, preserva a v1 e a publicada, registra no histórico', async () => {
  await comCopia(async ({ raiz }) => {
    const rev = prontoParaConcluir(raiz);
    assert.equal(rev.criarNovaVersao('lac', { ator: MARIA }).erro, 'estado_nao_permite_nova_versao');
    assert.equal(enviarEValidar(rev, 'lac', revisaoAtual(rev)).ok, true);
    const v1 = retrato(raiz).filter((l) => l.includes(`v1${path.sep}`));
    const r = rev.criarNovaVersao('lac', { ator: MARIA });
    assert.deepEqual([r.ok, r.versaoId, r.baseadaEm], [true, 'lac-v2', 'lac-v1']);
    assert.deepEqual(retrato(raiz).filter((l) => l.includes(`v1${path.sep}`)), v1);
    assert.equal(lerJ(raiz, 'services', 'registry.json').servicos[0].versaoPublicadaId, null);
    const s = rev.consultar('lac').situacao;
    assert.deepEqual([s.versaoId, s.rotulo, s.editavel], ['lac-v2', 'Em elaboração', true]);
    assert.deepEqual(validarServicos(raiz).erros, []);
    const acoes = criarHistoricoRevisao({ raiz }).listarAcoes('lac').registros;
    assert.equal(acoes.at(-1).acao, 'nova_versao');
    assert.equal(acoes.at(-1).versaoId, 'lac-v1');
  });
});

test('R12. histórico: só os campos previstos, sem conteúdo, texto original, token, caminho nem dado pessoal; fora do build e do Git', async () => {
  await comCopia(async ({ raiz }) => {
    const g = await criarGravadorEntradas({ raiz, agora: AGORA }).gravarEntradaTexto('lac', { titulo: 'Orientação interna', texto: CANARIO }, { ator: MARIA });
    assert.equal(g.ok, true);
    prepararLac(raiz, [bloco('bc-um', ['manual-lac-siga-2020'])]);
    const rev = criarServicoRevisao({ raiz, agora: AGORA_2 });
    assert.equal(rev.revisarFonte('lac', { ator: MARIA, fonteId: 'manual-lac-siga-2020', revisao: revisaoAtual(rev) }).ok, true);
    assert.equal(rev.aceitarBloco('lac', { ator: MARIA, blocoId: 'bc-um', revisao: revisaoAtual(rev) }).ok, true);
    assert.equal(enviarEValidar(rev, 'lac', revisaoAtual(rev)).ok, true);
    const pasta = path.join(raiz, 'data', 'admin-private');
    const arquivos = [];
    const andar = (d) => fs.readdirSync(d, { withFileTypes: true }).forEach((e) => (e.isDirectory() ? andar(path.join(d, e.name)) : arquivos.push(path.join(d, e.name))));
    andar(pasta);
    assert.deepEqual(arquivos.map((a) => path.relative(pasta, a).split(path.sep).join('/')).sort(), ['decisoes/lac.jsonl', 'revisao/lac.jsonl']);
    for (const a of arquivos) {
      const t = fs.readFileSync(a, 'utf8');
      assert.ok(!t.includes('CANARIO') && !t.includes(raiz) && !/[A-Za-z]:\\/.test(t) && !/@/.test(t) && !/token|Token/.test(t), a);
    }
    const acoes = criarHistoricoRevisao({ raiz }).listarAcoes('lac').registros;
    // Passo 8C: o cadastro do texto também é auditado.
    assert.deepEqual(acoes.map((x) => x.acao), ['cadastrar_texto', 'revisar_fonte', 'aceitar_bloco', 'enviar_para_revisao', 'validar_materialmente']);
    for (const x of acoes) {
      assert.deepEqual(validarAcaoRevisao(x), []);
      assert.deepEqual(Object.keys(x).sort(), ['acao', 'ator', 'dataHora', 'hashConteudo', 'id', 'itemId', 'itemTipo', 'resultado', 'servicoId', 'tipo', 'versaoId']);
    }
    // o validador recusa campos extras e atores diferentes
    assert.ok(validarAcaoRevisao({ ...acoes[0], texto: 'x' }).length > 0);
    assert.ok(validarAcaoRevisao({ ...acoes[0], ator: 'Maria' }).length > 0);
    assert.ok(validarAcaoRevisao({ ...acoes[0], resultado: 'erro' }).length > 0);
    // o histórico fica fora do Git e a pasta nunca é lida por MCP, assistente nem build (conferido nos testes de isolamento)
    assert.match(fs.readFileSync(path.join(RAIZ, '.gitignore'), 'utf8'), /data\/admin-private\//);
  });
});

test('R13. corpos das ações: só os campos previstos, sem ids novos, status, hash, data nem texto', () => {
  const h = 'a'.repeat(64);
  assert.deepEqual(validarCorpoDaAcao('revisar_fonte', { fonteId: 'manual-lac', revisao: h }), { ok: true, dados: { fonteId: 'manual-lac', revisao: h } });
  assert.equal(validarCorpoDaAcao('aceitar_bloco', { blocoId: 'bc-1', revisao: h }).ok, true);
  assert.equal(validarCorpoDaAcao('enviar_para_revisao', { revisao: h }).ok, true);
  assert.equal(validarCorpoDaAcao('validar_materialmente', { revisao: h }).ok, true);
  // O motivo dos ajustes só é aparado aqui; o conteúdo é conferido pelo serviço (motivo_invalido).
  assert.deepEqual(validarCorpoDaAcao('solicitar_ajustes', { revisao: h, motivo: '  Corrigir o prazo.  ' }), { ok: true, dados: { revisao: h, motivo: 'Corrigir o prazo.' } });
  assert.deepEqual(validarCorpoDaAcao('concluir_revisao', { revisao: h }), { ok: false, campos: ['acao'] }, 'Passo 8D: concluir não existe mais');
  assert.equal(validarCorpoDaAcao('nova_versao', {}).ok, true);
  for (const [acao, corpo] of [
    ['revisar_fonte', { fonteId: 'x', revisao: h, statusValidacao: 'validado' }], ['revisar_fonte', { fonteId: 'X', revisao: h }], ['revisar_fonte', { revisao: h }],
    ['aceitar_bloco', { blocoId: 'bc-1', revisao: 'curto' }], ['enviar_para_revisao', { revisao: h, hash: h }], ['nova_versao', { x: 1 }], ['validar_materialmente', null], ['voar', {}],
    ['validar_materialmente', { revisao: h, motivo: 'x' }], ['solicitar_ajustes', { revisao: h, motivo: 'x', estado: 'ajustes_solicitados' }], ['solicitar_ajustes', { motivo: 'x' }],
  ]) assert.equal(validarCorpoDaAcao(acao, corpo).ok, false, JSON.stringify([acao, corpo]));
});

test('R15. isolamento: chat, assistente, MCP e build não conhecem o histórico privado nem os módulos da revisão', () => {
  const listar = (dir, filtro) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? listar(p, filtro) : filtro(p) ? [p] : [];
  });
  const arquivos = [
    ...listar(path.join(RAIZ, 'src'), (p) => /\.(js|css|html)$/.test(p)),
    ...listar(path.join(RAIZ, 'scripts', 'mcp'), (p) => p.endsWith('.js')),
    ...fs.readdirSync(path.join(RAIZ, 'services')).filter((n) => /^assistant-.*\.js$/.test(n)).map((n) => path.join(RAIZ, 'services', n)),
    path.join(RAIZ, 'index.html'),
  ];
  assert.ok(arquivos.length >= 8);
  for (const a of arquivos) {
    const t = fs.readFileSync(a, 'utf8');
    assert.doesNotMatch(t, /admin-private|historico-revisao|revisao-servico|acao_revisao|admin\/revisao/, path.relative(RAIZ, a));
  }
  assert.doesNotMatch(fs.readFileSync(path.join(RAIZ, 'vite.config.js'), 'utf8'), /admin-private|historico-revisao/);
});

test('R16. reabrir bloco aceito: volta a rascunho/pendente/não publicado, registra no histórico e só antes de enviar para revisão', async () => {
  await comCopia(async ({ raiz }) => {
    const rev = prontoParaConcluir(raiz);
    const teste = lerJ(raiz, ...arq('conteudo-assistente.json')).blocos.find((b) => b.ambiente === 'teste_local');
    // bloco de teste e bloco ainda em elaboração não são reabertos
    assert.equal(rev.reabrirBloco('lac', { ator: MARIA, blocoId: teste.id, revisao: revisaoAtual(rev) }).erro, 'bloco_nao_aceitavel');
    assert.equal(rev.reabrirBloco('lac', { ator: MARIA, blocoId: 'bc-nao-existe', revisao: revisaoAtual(rev) }).erro, 'bloco_nao_encontrado');
    assert.equal(rev.consultar('lac').situacao.blocos[0].podeReabrir, true);
    assert.equal(rev.reabrirBloco('lac', { ator: MARIA, blocoId: 'bc-um', revisao: 'a'.repeat(64) }).erro, 'revisao_divergente');
    const r = rev.reabrirBloco('lac', { ator: MARIA, blocoId: 'bc-um', revisao: revisaoAtual(rev) });
    assert.equal(r.ok, true, JSON.stringify(r));
    const b = lerJ(raiz, ...arq('conteudo-assistente.json')).blocos.find((x) => x.id === 'bc-um');
    assert.deepEqual([b.statusValidacao, b.revisaoAtualidade, b.publicado, b.atualizadoEm], ['rascunho', 'pendente', false, '2026-11-17']);
    assert.equal(r.revisao, revisaoAtual(rev));
    assert.deepEqual(validarServicos(raiz).erros, []);
    const sit = rev.consultar('lac').situacao;
    assert.deepEqual([sit.blocos[0].aceito, sit.blocos[0].podeAceitar, sit.blocos[0].podeReabrir, sit.podeEnviar], [false, true, false, false]);
    assert.equal(rev.reabrirBloco('lac', { ator: MARIA, blocoId: 'bc-um', revisao: revisaoAtual(rev) }).erro, 'bloco_nao_aceito');
    // pode ser aceito de novo e concluído
    assert.equal(rev.aceitarBloco('lac', { ator: MARIA, blocoId: 'bc-um', revisao: revisaoAtual(rev) }).ok, true);
    assert.deepEqual(criarHistoricoRevisao({ raiz }).listarAcoes('lac').registros.map((x) => x.acao), ['revisar_fonte', 'aceitar_bloco', 'reabrir_bloco', 'aceitar_bloco']);
    assert.equal(enviarEValidar(rev, 'lac', revisaoAtual(rev)).ok, true);
    // depois de enviar e validar não se reabre
    const antes = retrato(raiz);
    assert.equal(rev.reabrirBloco('lac', { ator: MARIA, blocoId: 'bc-um', revisao: revisaoAtual(rev) }).erro, 'versao_congelada');
    assert.deepEqual(retrato(raiz), antes);
    assert.equal(rev.consultar('lac').situacao.blocos[0].podeReabrir, false);
  });
});

test('R17. situação em linguagem comum: rótulo, revisão pendente e resumo de pendências, sem estados técnicos', async () => {
  await comCopia(async ({ raiz }) => {
    prepararLac(raiz);
    const rev = criarServicoRevisao({ raiz, agora: AGORA_2 });
    let s = rev.consultar('lac').situacao;
    assert.deepEqual([s.rotulo, s.revisaoPendente, s.resumo], ['Em elaboração', true, { fontesPendentes: 1, informacoesPendentes: 1, informacoesAceitas: 0, fontesNaoUsadas: 0, pendenciasParaConcluir: 3 }]);
    assert.equal(rev.revisarFonte('lac', { ator: MARIA, fonteId: 'manual-lac-siga-2020', revisao: s.revisao }).ok, true);
    s = rev.consultar('lac').situacao;
    assert.equal(rev.aceitarBloco('lac', { ator: MARIA, blocoId: 'bc-um', revisao: s.revisao }).ok, true);
    s = rev.consultar('lac').situacao;
    assert.deepEqual([s.rotulo, s.revisaoPendente, s.resumo], ['Em elaboração', false, { fontesPendentes: 0, informacoesPendentes: 0, informacoesAceitas: 1, fontesNaoUsadas: 0, pendenciasParaConcluir: 0 }]);
    assert.equal(enviarEValidar(rev, 'lac', s.revisao).ok, true);
    s = rev.consultar('lac').situacao;
    assert.deepEqual([s.rotulo, s.revisaoPendente], ['Pronto para publicar', false]);
    assert.ok(!/rascunho|validado|em_validacao|hash/i.test(s.rotulo));
  });
});

test('R18. fonte não usada por nenhum bloco: aparece como não revisada, fica fora da contagem e não impede o envio para revisão', async () => {
  await comCopia(async ({ raiz }) => {
    // manual: usada pelo bloco; faq e tr-176: não usadas e não revisadas
    prepararLac(raiz, [bloco('bc-um', ['manual-lac-siga-2020'])], ['manual-lac-siga-2020', 'faq-lac-2022', 'tr-176-lac']);
    const rev = criarServicoRevisao({ raiz, agora: AGORA_2 });
    let s = rev.consultar('lac').situacao;
    assert.deepEqual(s.resumo, { fontesPendentes: 1, informacoesPendentes: 1, informacoesAceitas: 0, fontesNaoUsadas: 2, pendenciasParaConcluir: 3 });
    assert.deepEqual(s.pendencias.map((p) => [p.codigo, p.id ?? null]).sort(), [['bloco_pendente', 'bc-um'], ['fonte_pendente', 'manual-lac-siga-2020'], ['sem_bloco_aceito', null]]);
    assert.ok(!s.pendencias.some((p) => ['faq-lac-2022', 'tr-176-lac'].includes(p.id)), 'fonte não usada não é pendência');
    const naoUsada = s.fontes.find((f) => f.id === 'faq-lac-2022');
    assert.deepEqual([naoUsada.usadaPorBloco, naoUsada.revisada, naoUsada.podeRevisar], [false, false, true]);
    assert.equal(rev.revisarFonte('lac', { ator: MARIA, fonteId: 'manual-lac-siga-2020', revisao: s.revisao }).ok, true);
    s = rev.consultar('lac').situacao;
    assert.equal(rev.aceitarBloco('lac', { ator: MARIA, blocoId: 'bc-um', revisao: s.revisao }).ok, true);
    s = rev.consultar('lac').situacao;
    assert.deepEqual([s.resumo.pendenciasParaConcluir, s.resumo.fontesNaoUsadas, s.pendencias, s.podeEnviar], [0, 2, [], true]);
    const r = rev.enviarParaRevisao('lac', { ator: MARIA, revisao: s.revisao });
    assert.equal(r.ok, true, JSON.stringify(r));
    // as fontes não usadas continuam não revisadas e nada foi publicado
    const f = lerJ(raiz, ...arq('fontes.json')).fontes;
    assert.deepEqual(['faq-lac-2022', 'tr-176-lac'].map((id) => f.find((x) => x.id === id).statusValidacao), ['em_validacao', 'em_validacao']);
    assert.ok(f.every((x) => x.publicado === false));
    assert.deepEqual(validarServicos(raiz).erros, []);
  });
});

test('R14. a LAC real e o armazenamento privado real não foram alterados por nenhum teste deste arquivo', () => {
  assert.deepEqual(retrato(RAIZ), RETRATO_REAL_ANTES);
  assert.equal(fs.existsSync(path.join(RAIZ, 'data')), EXISTIA_DATA);
  const lida = lerArquivosDaVersao({ raiz: RAIZ, servicoId: 'lac', versaoId: 'lac-v1' });
  assert.equal(lida.manifesto.estado, 'rascunho');
});
