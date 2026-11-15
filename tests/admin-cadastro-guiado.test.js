// Cadastro guiado (Sprint 4, Passo 4A1): validação e preparação PURAS. Dados fictícios; o único acesso a arquivos é o teste
// de aplicação do plano numa CÓPIA temporária fora do repositório (a base real nunca é gravada).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  validarPedidoGuiado, prepararCadastroGuiado, COMBINACOES, MINIMO_FONTES, MAXIMO_FONTES, CAMPOS_FONTE_GUIADA, CAMPOS_PEDIDO,
} from '../services/admin/cadastro-guiado.js';
import { CAMPOS_FONTE, validarCorpoFonte, validarCorpoAssunto, validarCorpoServico } from '../services/admin/cadastro.js';
import { executarTransacao } from '../services/admin/transacao.js';
import { localizarVersaoAtual } from '../services/versao-atual.js';
import { hashConteudo } from '../services/admin/hash.js';
import { validarServicos, LIMITES_CONHECIMENTO } from '../scripts/validate-services.js';
import { congelar } from './admin-auxiliar.js';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = '2026-11-14';
const ASSUNTO = { id: 'licenciamento-ambiental', nome: 'Licenciamento Ambiental', descricao: 'Área fictícia.', ativo: true, criadoEm: '2026-11-09', atualizadoEm: '2026-11-09' };
const INATIVO = { ...ASSUNTO, id: 'assunto-inativo', nome: 'Assunto Inativo', ativo: false };
const OUTRO = { ...ASSUNTO, id: 'outro-assunto', nome: 'Outro Assunto' };
const FONTE = { titulo: 'Fonte fictícia', tipo: 'pagina_oficial', orgaoResponsavel: 'Órgão fictício', url: 'https://exemplo.test/pagina', descricao: 'Descrição fictícia.', origemOficial: true };
const fonteN = (n) => ({ ...FONTE, titulo: `Fonte fictícia ${n}`, url: `https://exemplo.test/pagina-${n}` });
const SERVICO_NOVO = { nome: 'Serviço Novo Fictício', sigla: 'SNF', termosEquivalentes: ['serviço novo fictício', 'SNF'] };
const FONTES_VAZIAS = { serviceId: 'servico-existente', statusValidacao: 'rascunho', pendencia: 'PENDENTE: nenhuma fonte cadastrada.', fontes: [] };
const CAMINHO_FONTES = 'services/servico-existente/versoes/v1/fontes.json';
const REV = hashConteudo(FONTES_VAZIAS);

const contextoBase = () => ({
  data: DATA,
  documentoAssuntos: { versaoEstrutura: 1, assuntos: [ASSUNTO, INATIVO, OUTRO] },
  assuntos: [ASSUNTO, INATIVO, OUTRO],
  servicos: [{ id: 'servico-existente', assuntoId: ASSUNTO.id, nome: 'Serviço Existente' }],
  idsOcupados: ['servico-existente', 'pasta-solta'],
  registro: { versaoEstrutura: 1, servicos: [{ id: 'servico-existente', assuntoId: ASSUNTO.id, versaoAtualId: 'servico-existente-v1', versaoPublicadaId: null, arquivo: 'services/servico-existente/versoes/v1/service.json', statusValidacao: 'rascunho', publicado: false }] },
  servico: { id: 'servico-existente', assuntoId: ASSUNTO.id, versaoAtualId: 'servico-existente-v1', estadoVersao: 'rascunho', caminhoFontes: CAMINHO_FONTES, documentoFontes: FONTES_VAZIAS },
});
const pedidoEE = (extra = {}) => ({ assunto: { id: ASSUNTO.id }, servico: { id: 'servico-existente' }, revisao: REV, fontes: [FONTE], ...extra });
const pedidoEN = (extra = {}) => ({ assunto: { id: ASSUNTO.id }, servico: SERVICO_NOVO, fontes: [FONTE], ...extra });
const pedidoNN = (extra = {}) => ({ assunto: { nome: 'Assunto Novo Fictício', descricao: 'Descrição fictícia do assunto.' }, servico: SERVICO_NOVO, fontes: [FONTE], ...extra });

/** Valida e prepara em um passo; falha o teste se a validação estrutural recusar. */
function preparar(pedido, contexto = contextoBase()) {
  const v = validarPedidoGuiado(pedido);
  assert.equal(v.ok, true, JSON.stringify(v));
  return prepararCadastroGuiado(v.dados, contexto);
}
const recusa = (pedido, contexto) => {
  const v = validarPedidoGuiado(pedido);
  return v.ok ? prepararCadastroGuiado(v.dados, contexto ?? contextoBase()) : v;
};

// ---------- Três combinações válidas ----------

test('CG1. assunto existente + serviço existente + fontes: só o fontes.json da versão atual, com ids e datas do servidor', () => {
  const r = preparar(pedidoEE({ fontes: [FONTE, fonteN(2)] }));
  assert.equal(r.ok, true);
  const { plano } = r;
  assert.equal(plano.combinacao, COMBINACOES.EXISTENTE_EXISTENTE);
  assert.equal(plano.passos.length, 1);
  const [passo] = plano.passos;
  assert.equal(passo.caminho, CAMINHO_FONTES);
  assert.equal(passo.novo, false);
  assert.deepEqual(passo.conteudo.fontes.map((f) => f.id), ['fonte-ficticia', 'fonte-ficticia-2']);
  for (const f of passo.conteudo.fontes) {
    assert.equal(f.statusValidacao, 'rascunho');
    assert.equal(f.publicado, false);
    assert.equal(f.dataConsulta, DATA);
    assert.deepEqual(f.vigencia, { situacao: 'nao_se_aplica', normasRelacionadas: [], observacao: null });
  }
  assert.equal(passo.conteudo.pendencia, FONTES_VAZIAS.pendencia);
  assert.deepEqual(plano.resposta, {
    assunto: { id: ASSUNTO.id, nome: ASSUNTO.nome, criado: false },
    servico: { id: 'servico-existente', nome: 'Serviço Existente', criado: false, versaoAtualId: 'servico-existente-v1' },
    fontes: [{ id: 'fonte-ficticia', titulo: 'Fonte fictícia' }, { id: 'fonte-ficticia-2', titulo: 'Fonte fictícia 2' }],
    revisao: hashConteudo(passo.conteudo),
    proximo: { servicoId: 'servico-existente' },
  });
});

test('CG2. assunto existente + serviço novo + fontes: oito arquivos novos (fontes já incluídas e entradas.json vazio) e o registro por último', () => {
  const r = preparar(pedidoEN());
  assert.equal(r.ok, true);
  const { plano } = r;
  assert.equal(plano.combinacao, COMBINACOES.EXISTENTE_NOVO);
  const caminhos = plano.passos.map((p) => p.caminho);
  assert.equal(caminhos.length, 9);
  assert.equal(caminhos.at(-1), 'services/registry.json');
  assert.equal(plano.passos.at(-1).novo, false);
  assert.ok(!caminhos.includes('services/assuntos.json'));
  for (const p of plano.passos.slice(0, 8)) {
    assert.equal(p.novo, true);
    assert.match(p.caminho, /^services\/servico-novo-ficticio\/versoes\/v1\//);
  }
  const fontes = plano.passos.find((p) => p.caminho.endsWith('/fontes.json')).conteudo;
  assert.equal(fontes.serviceId, 'servico-novo-ficticio');
  assert.deepEqual(fontes.fontes.map((f) => f.id), ['fonte-ficticia']);
  assert.ok(fontes.pendencia.startsWith('PENDENTE'));
  const registro = plano.passos.at(-1).conteudo;
  assert.equal(registro.servicos.length, 2);
  assert.deepEqual(registro.servicos[1], { id: 'servico-novo-ficticio', assuntoId: ASSUNTO.id, versaoAtualId: 'servico-novo-ficticio-v1', versaoPublicadaId: null, arquivo: 'services/servico-novo-ficticio/versoes/v1/service.json', statusValidacao: 'rascunho', publicado: false });
  assert.deepEqual(plano.resposta.servico, { id: 'servico-novo-ficticio', nome: 'Serviço Novo Fictício', criado: true, versaoAtualId: 'servico-novo-ficticio-v1' });
  assert.equal(plano.resposta.assunto.criado, false);
});

test('CG3. assunto novo + serviço novo + fontes: assuntos.json primeiro, depois o serviço, e o registro por último', () => {
  const r = preparar(pedidoNN());
  assert.equal(r.ok, true);
  const { plano } = r;
  assert.equal(plano.combinacao, COMBINACOES.NOVO_NOVO);
  const caminhos = plano.passos.map((p) => p.caminho);
  assert.equal(caminhos.length, 10);
  assert.equal(caminhos[0], 'services/assuntos.json');
  assert.equal(caminhos.at(-1), 'services/registry.json');
  const assuntos = plano.passos[0].conteudo.assuntos;
  assert.equal(assuntos.length, 4);
  assert.deepEqual(assuntos[3], { id: 'assunto-novo-ficticio', nome: 'Assunto Novo Fictício', descricao: 'Descrição fictícia do assunto.', ativo: true, criadoEm: DATA, atualizadoEm: DATA });
  const service = plano.passos.find((p) => p.caminho.endsWith('/service.json')).conteudo;
  assert.equal(service.assuntoId, 'assunto-novo-ficticio');
  assert.equal(service.categoria, 'assunto novo fictício');
  assert.equal(plano.passos.at(-1).conteudo.servicos[1].assuntoId, 'assunto-novo-ficticio');
  assert.deepEqual(plano.resposta.assunto, { id: 'assunto-novo-ficticio', nome: 'Assunto Novo Fictício', criado: true });
  assert.equal(plano.resposta.proximo.servicoId, 'servico-novo-ficticio');
});

// ---------- Combinação inválida, campos extras, incompatibilidades ----------

test('CG4. assunto novo + serviço existente é recusado (422 combinacao_invalida), antes de consultar a base', () => {
  const r = validarPedidoGuiado({ assunto: { nome: 'Assunto Novo', descricao: 'Texto.' }, servico: { id: 'servico-existente' }, fontes: [FONTE] });
  assert.deepEqual(r, { ok: false, status: 422, erro: 'combinacao_invalida', campos: ['servico'] });
});

test('CG5. campos extras e ids/revisão enviados pelo cliente são recusados, sem repetir valores', () => {
  const campos = (p) => recusa(p).campos;
  assert.deepEqual(campos(pedidoEN({ publicado: true })), ['extras']);
  for (const extra of ['id', 'revisao', 'estado', 'criadoEm', 'publicado', 'statusValidacao', 'dataConsulta', 'vigencia']) {
    assert.deepEqual(campos(pedidoEN({ fontes: [{ ...FONTE, [extra]: 'x' }] })), ['fontes[0]'], extra);
  }
  assert.deepEqual(campos(pedidoNN({ assunto: { nome: 'A B', descricao: 'D', id: 'x' } })), ['assunto']);
  assert.deepEqual(campos(pedidoNN({ assunto: { nome: 'A B', descricao: 'D', ativo: true } })), ['assunto']);
  assert.deepEqual(campos(pedidoEN({ servico: { ...SERVICO_NOVO, publicado: true } })), ['servico']);
  assert.deepEqual(campos(pedidoEN({ servico: { ...SERVICO_NOVO, assuntoId: 'outro-assunto' } })), ['servico']);
  assert.deepEqual(campos(pedidoEE({ servico: { id: 'servico-existente', nome: 'X' } })), ['servico']);
  assert.deepEqual(campos(pedidoEE({ assunto: { id: ASSUNTO.id, nome: 'X' } })), ['assunto']);
  for (const corpo of [null, undefined, [], 'texto', 5]) assert.deepEqual(campos(corpo), ['corpo']);
  assert.deepEqual(campos({}), ['assunto', 'servico', 'fontes']);
  const r = recusa(pedidoEN({ fontes: [{ ...FONTE, id: 'valor-secreto-xyz' }] }));
  assert.ok(!JSON.stringify(r).includes('valor-secreto-xyz'));
  assert.deepEqual([...CAMPOS_PEDIDO], ['assunto', 'servico', 'fontes', 'revisao']);
  assert.ok(!CAMPOS_FONTE_GUIADA.includes('id') && !CAMPOS_FONTE_GUIADA.includes('revisao'));
});

test('CG6. assunto e serviço incompatíveis, inexistentes, inativos ou em versão congelada', () => {
  assert.deepEqual(recusa(pedidoEE({ assunto: { id: OUTRO.id } })), { ok: false, status: 422, erro: 'combinacao_invalida', campos: ['servico'] });
  assert.deepEqual(recusa(pedidoEE({ assunto: { id: 'nao-existe' } })), { ok: false, status: 404, erro: 'nao_encontrado', campo: 'assunto' });
  assert.deepEqual(recusa(pedidoEN({ assunto: { id: INATIVO.id } })), { ok: false, status: 422, erro: 'dados_invalidos', campos: ['assunto'] });
  assert.deepEqual(recusa(pedidoEE({ servico: { id: 'nao-existe' } })), { ok: false, status: 404, erro: 'nao_encontrado', campo: 'servico' });
  const congelada = contextoBase();
  congelada.servico = { ...congelada.servico, estadoVersao: 'em_validacao' };
  assert.deepEqual(recusa(pedidoEE(), congelada), { ok: false, status: 409, erro: 'versao_nao_editavel' });
});

// ---------- Fontes: mínimo e máximo ----------

test('CG7. ao menos uma fonte; máximo igual ao teto confirmado (10); fonte que não é objeto', () => {
  assert.equal(MINIMO_FONTES, 1);
  assert.equal(MAXIMO_FONTES, 10);
  assert.equal(MAXIMO_FONTES, LIMITES_CONHECIMENTO.fontes);
  for (const fontes of [[], undefined, null, 'texto', {}]) assert.deepEqual(recusa(pedidoEN({ fontes })).campos, ['fontes'], JSON.stringify(fontes));
  const dez = Array.from({ length: 10 }, (_, i) => fonteN(i + 1));
  const ok = preparar(pedidoEN({ fontes: dez }));
  assert.equal(ok.ok, true);
  assert.equal(ok.plano.resposta.fontes.length, 10);
  assert.deepEqual(recusa(pedidoEN({ fontes: [...dez, fonteN(11)] })).campos, ['fontes']);
  assert.deepEqual(recusa(pedidoEN({ fontes: [FONTE, 'texto', null] })).campos, ['fontes[1]', 'fontes[2]']);
  assert.deepEqual(recusa(pedidoEN({ fontes: [[FONTE]] })).campos, ['fontes[0]']);
});

test('CG8. cada fonte passa pela validação existente: campos inválidos aparecem por posição e título sem letras é recusado', () => {
  const campos = (fontes) => recusa(pedidoEN({ fontes })).campos;
  assert.deepEqual(campos([FONTE, { ...fonteN(2), tipo: 'inexistente' }]), ['fontes[1].tipo']);
  assert.deepEqual(campos([{ ...FONTE, url: 'http://exemplo.test/x' }]), ['fontes[0].url']);
  assert.deepEqual(campos([{ ...FONTE, origemOficial: 'sim' }]), ['fontes[0].origemOficial']);
  assert.deepEqual(campos([{ ...FONTE, titulo: '123' }]), ['fontes[0].titulo']);
  assert.deepEqual(campos([{ ...FONTE, titulo: undefined }]), ['fontes[0].titulo']);
  assert.deepEqual(campos([{ ...FONTE, titulo: 5 }]), ['fontes[0].titulo']);
  assert.deepEqual(campos([{ ...FONTE, titulo: 'a'.repeat(201) }]), ['fontes[0].titulo']);
  assert.deepEqual(campos([{ ...FONTE, dataPublicacao: '2026-02-31' }]), ['fontes[0].dataPublicacao']);
  assert.deepEqual(campos([{}]), ['fontes[0].titulo']);
  const r = recusa(pedidoEN({ fontes: [{ ...FONTE, descricao: ['alguem', 'exemplo.test'].join('@') }] }));
  assert.deepEqual(r.campos, ['fontes[0].descricao']);
  // A validação do corpo guiado repete as regras do assunto e do serviço, com o campo prefixado.
  // A descrição do assunto é opcional (Passo 4B1): vazia vale como omitida; preenchida e inválida é recusada.
  assert.deepEqual(recusa(pedidoNN({ assunto: { nome: '123', descricao: '' } })).campos, ['assunto.nome']);
  assert.deepEqual(recusa(pedidoNN({ assunto: { nome: '123', descricao: 'com\ttab' } })).campos, ['assunto.nome', 'assunto.descricao']);
  assert.deepEqual(recusa(pedidoEN({ servico: { nome: '!!!', termosEquivalentes: [] } })).campos, ['servico.nome', 'servico.termosEquivalentes']);
});

// ---------- Ids e datas gerados pelo servidor ----------

test('CG9. ids vêm do nome/título (com sufixo na colisão) e as datas, só do contexto; nada do cliente entra', () => {
  const ctx = contextoBase();
  ctx.assuntos = [...ctx.assuntos, { ...ASSUNTO, id: 'assunto-novo-ficticio', nome: 'Outro Nome' }];
  ctx.documentoAssuntos = { ...ctx.documentoAssuntos, assuntos: ctx.assuntos };
  ctx.idsOcupados = [...ctx.idsOcupados, 'servico-novo-ficticio'];
  const r = preparar(pedidoNN({ fontes: [FONTE, { ...fonteN(2), titulo: 'Fonte fictícia' }] }), ctx);
  assert.equal(r.ok, true);
  assert.equal(r.plano.resposta.assunto.id, 'assunto-novo-ficticio-2');
  assert.equal(r.plano.resposta.servico.id, 'servico-novo-ficticio-2');
  assert.deepEqual(r.plano.resposta.fontes.map((f) => f.id), ['fonte-ficticia', 'fonte-ficticia-2']);
  const json = JSON.stringify(r.plano);
  assert.ok(!json.includes('2026-11-09T') && json.includes(DATA));
  // Reservados e pastas existentes nunca viram id de serviço.
  const reservado = preparar(pedidoEN({ servico: { ...SERVICO_NOVO, nome: 'Admin' } }));
  assert.equal(reservado.plano.resposta.servico.id, 'admin-2');
  const pasta = preparar(pedidoEN({ servico: { ...SERVICO_NOVO, nome: 'Pasta Solta' } }));
  assert.equal(pasta.plano.resposta.servico.id, 'pasta-solta-2');
  // Mesma entrada, mesmo plano (sem relógio nem aleatoriedade).
  assert.deepEqual(preparar(pedidoNN()), preparar(pedidoNN()));
  const outraData = preparar(pedidoNN(), { ...contextoBase(), data: '2027-01-02' });
  assert.ok(JSON.stringify(outraData.plano).includes('2027-01-02') && !JSON.stringify(outraData.plano).includes(DATA));
  assert.throws(() => prepararCadastroGuiado(validarPedidoGuiado(pedidoNN()).dados, { ...contextoBase(), data: '14/11/2026' }), /contexto_invalido/);
  assert.throws(() => prepararCadastroGuiado(validarPedidoGuiado(pedidoNN()).dados, { ...contextoBase(), data: undefined }), /contexto_invalido/);
});

// ---------- Duplicidade ----------

test('CG10. duplicidade: nome de assunto/serviço existente e URL repetida (no pedido e na base)', () => {
  assert.deepEqual(recusa(pedidoNN({ assunto: { nome: '  licenciamento   AMBIENTAL ', descricao: 'Texto.' } })), { ok: false, status: 409, erro: 'ja_existe', campo: 'assunto.nome' });
  assert.deepEqual(recusa(pedidoEN({ servico: { ...SERVICO_NOVO, nome: 'servico EXISTENTE' } })), { ok: false, status: 409, erro: 'ja_existe', campo: 'servico.nome' });
  assert.deepEqual(recusa(pedidoEN({ fontes: [FONTE, { ...fonteN(2), url: 'HTTPS://exemplo.test/pagina/#trecho' }] })), { ok: false, status: 409, erro: 'ja_existe', campo: 'fontes[1].url' });
  const comFonte = contextoBase();
  const existente = { id: 'fonte-antiga', titulo: 'Antiga', tipo: 'manual', orgaoResponsavel: 'Órgão', url: 'https://exemplo.test/pagina', descricao: 'D', origemOficial: true, statusValidacao: 'rascunho', publicado: false, dataPublicacao: null, dataConsulta: '2026-11-01', dispositivoRelevante: null, vigencia: { situacao: 'nao_se_aplica', normasRelacionadas: [], observacao: null } };
  comFonte.servico = { ...comFonte.servico, documentoFontes: { ...FONTES_VAZIAS, fontes: [existente] } };
  const revComFonte = hashConteudo(comFonte.servico.documentoFontes);
  assert.deepEqual(recusa(pedidoEE({ revisao: revComFonte }), comFonte), { ok: false, status: 409, erro: 'ja_existe', campo: 'fontes[0].url' });
  // Título igual ao de fonte existente gera outro id, sem alterar a fonte antiga.
  const ok = preparar(pedidoEE({ revisao: revComFonte, fontes: [{ ...fonteN(3), titulo: 'Antiga' }] }), comFonte);
  assert.deepEqual(ok.plano.passos[0].conteudo.fontes.map((f) => f.id), ['fonte-antiga', 'antiga']);
  assert.deepEqual(ok.plano.passos[0].conteudo.fontes[0], existente);
});

// ---------- Imutabilidade e pureza ----------

test('CG11. nada do que é recebido é modificado (pedido e contexto congelados em profundidade)', () => {
  for (const pedido of [pedidoEE(), pedidoEN(), pedidoNN()]) {
    const p = congelar(JSON.parse(JSON.stringify(pedido)));
    const ctx = congelar(contextoBase());
    const v = validarPedidoGuiado(p);
    assert.equal(v.ok, true);
    const r = prepararCadastroGuiado(v.dados, ctx);
    assert.equal(r.ok, true);
    assert.deepEqual(p, pedido);
    assert.deepEqual(JSON.parse(JSON.stringify(ctx)), JSON.parse(JSON.stringify(contextoBase())));
  }
});

test('CG12. o módulo é puro: sem arquivos, relógio, aleatoriedade, ambiente ou rede, e só importa módulos de regra existentes', () => {
  const fonte = fs.readFileSync(path.join(RAIZ, 'services', 'admin', 'cadastro-guiado.js'), 'utf8');
  const codigo = fonte.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
  for (const proibido of [/\bDate\b/, /Math\.random/, /process\./, /\bfetch\b/, /node:fs/, /node:crypto/, /node:path/, /node:os/, /readFileSync|writeFileSync|readdirSync/, /\brequire\(/]) {
    assert.doesNotMatch(codigo, proibido);
  }
  const imports = [...fonte.matchAll(/from '([^']+)'/g)].map((m) => m[1]).sort();
  assert.deepEqual(imports, ['../../scripts/validate-services.js', './cadastro.js', './hash.js']);
});

test('CG13. as validações existentes continuam iguais: id e revisão seguem obrigatórios na fonte', () => {
  assert.deepEqual([...CAMPOS_FONTE], ['revisao', 'id', 'titulo', 'tipo', 'orgaoResponsavel', 'url', 'descricao', 'origemOficial', 'dataPublicacao', 'dispositivoRelevante']);
  assert.deepEqual(validarCorpoFonte(FONTE).campos, ['revisao', 'id']);
  assert.deepEqual(validarCorpoFonte({ ...FONTE, id: 'fonte-1', revisao: 'a'.repeat(64) }).ok, true);
  assert.deepEqual(validarCorpoFonte({ ...FONTE, id: 'fonte-1', revisao: 'a'.repeat(64), publicado: true }).campos, ['extras']);
  assert.deepEqual(validarCorpoAssunto({ id: 'a-1', nome: 'N', descricao: 'D' }).campos, ['extras']);
  assert.deepEqual(validarCorpoServico({ nome: 'Serviço', termosEquivalentes: ['a'] }).campos, ['assuntoId']);
});

// ---------- O plano é aceito pelo validador da base (cópia temporária; a base real não é tocada) ----------

function retrato(dir) {
  const itens = [];
  const andar = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { itens.push(`D ${path.relative(dir, p)}`); andar(p); } else itens.push(`F ${path.relative(dir, p)} ${crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')}`);
    }
  };
  andar(dir);
  return itens.sort().join('\n');
}

/** Contexto lido de uma raiz (cópia): só para o teste; o módulo em si não lê arquivos. */
function contextoDaRaiz(raiz, servicoId) {
  const lerJson = (rel) => JSON.parse(fs.readFileSync(path.join(raiz, ...rel.split('/')), 'utf8'));
  const documentoAssuntos = lerJson('services/assuntos.json');
  const registro = lerJson('services/registry.json');
  const servicos = registro.servicos.map((s) => {
    const v = localizarVersaoAtual(raiz, s.id);
    return { id: s.id, assuntoId: s.assuntoId, nome: lerJson(v.arquivos.service).nome };
  });
  const contexto = {
    data: DATA, documentoAssuntos, assuntos: documentoAssuntos.assuntos, servicos, registro,
    idsOcupados: fs.readdirSync(path.join(raiz, 'services')).map((n) => n.replace(/\.[^.]*$/, '')),
  };
  if (servicoId) {
    const v = localizarVersaoAtual(raiz, servicoId);
    contexto.servico = {
      id: servicoId, assuntoId: registro.servicos.find((s) => s.id === servicoId).assuntoId, versaoAtualId: v.versaoId,
      estadoVersao: lerJson(`${v.pasta}/versao.json`).estado, caminhoFontes: v.arquivos.fontes, documentoFontes: lerJson(v.arquivos.fontes),
    };
  }
  return contexto;
}

test('CG15. id de registro existente precisa ter o formato de id do sistema (nunca caminho); formato válido mas inexistente é 404', () => {
  for (const id of ['../x', 'a/b', 'a\\b', '..', 'A', '', ' x', 'a'.repeat(61), '1a']) {
    assert.deepEqual(validarPedidoGuiado({ assunto: { id }, servico: SERVICO_NOVO, fontes: [FONTE] }), { ok: false, status: 422, erro: 'dados_invalidos', campos: ['assunto'] }, id);
    assert.deepEqual(validarPedidoGuiado({ assunto: { id: ASSUNTO.id }, servico: { id }, fontes: [FONTE] }), { ok: false, status: 422, erro: 'dados_invalidos', campos: ['servico'] }, id);
  }
  assert.deepEqual(recusa(pedidoEE({ servico: { id: 'nao-existe' } })), { ok: false, status: 404, erro: 'nao_encontrado', campo: 'servico' });
});

test('CG14. os planos das três combinações são aceitos pelo validador da base e o da LAC só ganha fontes novas', () => {
  const casos = [
    { nome: 'existente+existente', servico: 'lac', pedido: (a, ctx) => ({ assunto: { id: a }, servico: { id: 'lac' }, revisao: hashConteudo(ctx.servico.documentoFontes), fontes: [FONTE, fonteN(2)] }) },
    { nome: 'existente+novo', pedido: (a) => ({ assunto: { id: a }, servico: SERVICO_NOVO, fontes: [FONTE] }) },
    { nome: 'novo+novo', pedido: () => pedidoNN() },
  ];
  for (const caso of casos) {
    const pai = fs.mkdtempSync(path.join(os.tmpdir(), 'sema-orienta-guiado-'));
    try {
      const raiz = path.join(pai, 'raiz');
      fs.mkdirSync(raiz);
      fs.cpSync(path.join(RAIZ, 'services'), path.join(raiz, 'services'), { recursive: true });
      assert.deepEqual(validarServicos(raiz).erros, [], 'base inicial');
      const ctx = contextoDaRaiz(raiz, caso.servico);
      const lacAssunto = ctx.registro.servicos.find((s) => s.id === 'lac').assuntoId;
      const v = validarPedidoGuiado(caso.pedido(lacAssunto, ctx));
      assert.equal(v.ok, true, caso.nome);
      const r = prepararCadastroGuiado(v.dados, ctx);
      assert.equal(r.ok, true, `${caso.nome}: ${JSON.stringify(r)}`);
      const antes = retrato(raiz);
      // O plano não traz `validar` (o endpoint o acrescenta por caminho); aqui a conferência é a da base inteira.
      const t = executarTransacao({ raiz, passos: r.plano.passos.map((p) => ({ ...p, validar: () => [] })), verificar: () => validarServicos(raiz).erros });
      assert.deepEqual(t, { ok: true }, caso.nome);
      assert.deepEqual(validarServicos(raiz).erros, [], caso.nome);
      if (caso.nome === 'existente+existente') {
        const depois = JSON.parse(fs.readFileSync(path.join(raiz, ctx.servico.caminhoFontes), 'utf8'));
        assert.equal(depois.fontes.length, ctx.servico.documentoFontes.fontes.length + 2);
        assert.deepEqual(depois.fontes.slice(0, ctx.servico.documentoFontes.fontes.length), ctx.servico.documentoFontes.fontes);
        assert.notEqual(hashConteudo(depois), hashConteudo(ctx.servico.documentoFontes));
      }
      assert.notEqual(retrato(raiz), antes);
    } finally {
      fs.rmSync(pai, { recursive: true, force: true });
    }
  }
});

test('CG16. revisão: obrigatória e em formato de hash só com serviço existente; divergente é 409; correta grava e devolve a nova revisão', () => {
  const { revisao, ...semRevisao } = pedidoEE();
  assert.deepEqual(validarPedidoGuiado(semRevisao), { ok: false, status: 422, erro: 'dados_invalidos', campos: ['revisao'] });
  for (const ruim of ['', 'a'.repeat(63), 'a'.repeat(65), 'A'.repeat(64), 'g'.repeat(64), ' ' + 'a'.repeat(63), 5, null, [], {}]) {
    assert.deepEqual(validarPedidoGuiado(pedidoEE({ revisao: ruim })), { ok: false, status: 422, erro: 'dados_invalidos', campos: ['revisao'] }, String(ruim));
  }
  assert.deepEqual(recusa(pedidoEE({ revisao: 'a'.repeat(64) })), { ok: false, status: 409, erro: 'revisao_divergente' });
  const r = preparar(pedidoEE());
  assert.equal(r.ok, true);
  assert.equal(r.plano.resposta.revisao, hashConteudo(r.plano.passos[0].conteudo));
  assert.notEqual(r.plano.resposta.revisao, REV);
  // Com serviço novo a revisão é recusada (qualquer valor), em qualquer combinação.
  for (const pedido of [pedidoEN({ revisao: REV }), pedidoNN({ revisao: REV }), pedidoEN({ revisao: 5 })]) {
    assert.deepEqual(validarPedidoGuiado(pedido), { ok: false, status: 422, erro: 'dados_invalidos', campos: ['revisao'] });
  }
  assert.equal('revisao' in preparar(pedidoEN()).plano.resposta, false);
  // A versão congelada é verificada antes da revisão.
  const congelada = contextoBase();
  congelada.servico = { ...congelada.servico, estadoVersao: 'em_validacao' };
  assert.deepEqual(recusa(pedidoEE({ revisao: 'a'.repeat(64) }), congelada), { ok: false, status: 409, erro: 'versao_nao_editavel' });
});

test('CG17. nome do serviço: nunca null na resposta; sem nome obtido de base válida, falha genérica (500) sem plano; serviço novo usa o nome preparado', () => {
  for (const nome of [null, undefined, '', '   ', 5]) {
    const ctx = contextoBase();
    ctx.servicos = [{ id: 'servico-existente', assuntoId: ASSUNTO.id, nome }];
    assert.deepEqual(recusa(pedidoEE(), ctx), { ok: false, status: 500, erro: 'indisponivel' }, String(nome));
  }
  for (const pedido of [pedidoEE(), pedidoEN(), pedidoNN()]) {
    const r = preparar(pedido);
    assert.equal(typeof r.plano.resposta.servico.nome, 'string');
    assert.notEqual(r.plano.resposta.servico.nome.trim(), '');
    assert.ok(!JSON.stringify(r.plano.resposta).includes('"nome":null'));
  }
  // Serviço novo: o nome vem do pedido preparado, mesmo que o registro tenha outro serviço sem nome legível.
  const ctx = contextoBase();
  ctx.servicos = [...ctx.servicos, { id: 'servico-sem-nome', assuntoId: ASSUNTO.id, nome: null }];
  assert.equal(preparar(pedidoEN(), ctx).plano.resposta.servico.nome, 'Serviço Novo Fictício');
});

test('CG18. nome do assunto existente: ausente, vazio ou não textual é 500 genérico sem plano; nenhuma resposta traz assunto.nome null', () => {
  for (const nome of [null, undefined, '', '   ', 5, {}]) {
    const ctx = contextoBase();
    ctx.assuntos = ctx.assuntos.map((a) => (a.id === ASSUNTO.id ? { ...a, nome } : a));
    for (const pedido of [pedidoEE(), pedidoEN()]) {
      assert.deepEqual(recusa(pedido, ctx), { ok: false, status: 500, erro: 'indisponivel' }, String(nome));
    }
  }
  for (const pedido of [pedidoEE(), pedidoEN(), pedidoNN()]) {
    const r = preparar(pedido);
    assert.equal(typeof r.plano.resposta.assunto.nome, 'string');
    assert.notEqual(r.plano.resposta.assunto.nome.trim(), '');
  }
});
