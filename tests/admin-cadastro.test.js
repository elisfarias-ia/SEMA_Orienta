// Cadastro administrativo (Marco 7, Passo 7E1): funções puras de montagem/validação, transação com desfazer e
// gravação de texto. Só dados fictícios e cópias temporárias fora do repositório.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  normalizarNome, validarCorpoAssunto, validarCorpoServico, montarAssunto, montarEsqueletoServico, montarRoteiroInicial,
  SECOES_ROTEIRO, LIMITE_CORPO,
} from '../services/admin/cadastro.js';
import { executarTransacao } from '../services/admin/transacao.js';
import { criarArmazenamento } from '../services/admin/armazenamento.js';
import { validarServicos } from '../scripts/validate-services.js';
import { validarVersao } from '../services/admin/versao.js';
import { congelar } from './admin-auxiliar.js';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lerTexto = (...p) => fs.readFileSync(path.join(RAIZ, ...p), 'utf8');
const ASSUNTO = { id: 'licenciamento-ambiental', nome: 'Licenciamento Ambiental', descricao: 'Área fictícia.', ativo: true, criadoEm: '2026-11-09', atualizadoEm: '2026-11-09' };
const CORPO_ASSUNTO = { id: 'assunto-ficticio', nome: 'Assunto Fictício', descricao: 'Descrição fictícia de teste.' };
const CORPO_SERVICO = { id: 'servico-ficticio', assuntoId: 'licenciamento-ambiental', nome: 'Serviço Fictício', sigla: 'SF', termosEquivalentes: ['serviço fictício', 'SF'] };

function comCopia(fn) {
  const pai = fs.mkdtempSync(path.join(os.tmpdir(), 'sema-orienta-cadastro-'));
  const raiz = path.join(pai, 'raiz');
  fs.mkdirSync(raiz);
  fs.cpSync(path.join(RAIZ, 'services'), path.join(raiz, 'services'), { recursive: true });
  try {
    return fn({ raiz, pai });
  } finally {
    fs.rmSync(pai, { recursive: true, force: true });
  }
}
/** Retrato byte a byte de uma árvore (caminho, hash do conteúdo e pastas), para provar que nada mudou. */
function retrato(dir) {
  const itens = [];
  const andar = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) {
        itens.push(`D ${path.relative(dir, p)}`);
        andar(p);
      } else {
        itens.push(`F ${path.relative(dir, p)} ${crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')}`);
      }
    }
  };
  andar(dir);
  return itens.sort().join('\n');
}

// ---------- Normalização e corpos ----------

test('K1. normalizarNome ignora acentos, maiúsculas e espaços repetidos', () => {
  assert.equal(normalizarNome('  Licença   Ambiental '), 'licenca ambiental');
  assert.equal(normalizarNome('AÇÃO'), 'acao');
  assert.equal(normalizarNome(undefined), '');
});

test('K2. corpo de assunto: aceita só id, nome e descricao; devolve dados aparados', () => {
  const r = validarCorpoAssunto({ id: 'a-1', nome: '  Nome   Fictício ', descricao: ' Texto fictício. ' });
  assert.deepEqual(r, { ok: true, dados: { id: 'a-1', nome: 'Nome Fictício', descricao: 'Texto fictício.' } });
  const campos = (c) => validarCorpoAssunto(c).campos;
  assert.deepEqual(campos({ ...CORPO_ASSUNTO, publicado: true }), ['extras']);
  for (const extra of ['ativo', 'statusValidacao', 'estado', 'hashConteudo', 'decisao', 'responsavel', 'criadoEm', 'atualizadoEm', '__proto__', 'constructor']) {
    const corpo = JSON.parse(`{"id":"a-1","nome":"N","descricao":"D","${extra}":true}`);
    assert.deepEqual(campos(corpo), ['extras'], extra);
  }
  for (const id of ['', 'A1', '1a', 'a b', 'a_b', 'a'.repeat(61), undefined, 5, null, '../x', 'a/b']) assert.deepEqual(campos({ ...CORPO_ASSUNTO, id }), ['id'], String(id));
  for (const nome of ['', '   ', undefined, 5, 'a'.repeat(121), 'linha\ninvalida', 'nul\u0000o']) assert.deepEqual(campos({ ...CORPO_ASSUNTO, nome }), ['nome'], String(nome));
  for (const descricao of ['', undefined, 'a'.repeat(1001), 'tab\tinvalida']) assert.deepEqual(campos({ ...CORPO_ASSUNTO, descricao }), ['descricao']);
  assert.deepEqual(campos({}), ['id', 'nome', 'descricao']);
  for (const corpo of [null, undefined, [], 'texto', 5]) assert.deepEqual(campos(corpo), ['corpo']);
});

test('K3. textos com e-mail ou telefone são recusados (sem dados pessoais)', () => {
  const email = ['alguem', 'exemplo.test'].join('@');
  assert.deepEqual(validarCorpoAssunto({ ...CORPO_ASSUNTO, descricao: `Contato ${email}` }).campos, ['descricao']);
  assert.deepEqual(validarCorpoAssunto({ ...CORPO_ASSUNTO, nome: `N ${email}` }).campos, ['nome']);
  assert.deepEqual(validarCorpoAssunto({ ...CORPO_ASSUNTO, descricao: `Fale pelo ${['(65)', ['99999', '0000'].join('-')].join(' ')}` }).campos, ['descricao']);
  assert.deepEqual(validarCorpoServico({ ...CORPO_SERVICO, termosEquivalentes: [email] }).campos, ['termosEquivalentes']);
});

test('K4. corpo de serviço: campos, sigla opcional (padrão PENDENTE) e termos equivalentes', () => {
  const ok = validarCorpoServico(CORPO_SERVICO);
  assert.deepEqual(ok, { ok: true, dados: { id: 'servico-ficticio', assuntoId: 'licenciamento-ambiental', nome: 'Serviço Fictício', sigla: 'SF', termosEquivalentes: ['serviço fictício', 'SF'] } });
  const { sigla, ...semSigla } = CORPO_SERVICO;
  assert.equal(validarCorpoServico(semSigla).dados.sigla, 'PENDENTE');
  const campos = (c) => validarCorpoServico(c).campos;
  for (const extra of ['publicado', 'versaoAtualId', 'versaoPublicadaId', 'estado', 'arquivo', 'statusValidacao', 'hashConteudo', 'categoria']) {
    assert.deepEqual(campos({ ...CORPO_SERVICO, [extra]: 'x' }), ['extras'], extra);
  }
  assert.deepEqual(campos({ ...CORPO_SERVICO, id: 'LAC' }), ['id']);
  assert.deepEqual(campos({ ...CORPO_SERVICO, assuntoId: 'Assunto 1' }), ['assuntoId']);
  assert.deepEqual(campos({ ...CORPO_SERVICO, sigla: '' }), ['sigla']);
  assert.deepEqual(campos({ ...CORPO_SERVICO, sigla: 'x'.repeat(21) }), ['sigla']);
  assert.deepEqual(campos({ ...CORPO_SERVICO, sigla: 5 }), ['sigla']);
  for (const termos of [[], undefined, 'texto', [''], [5], ['a', 'A'], ['Ação', 'acao'], Array.from({ length: 21 }, (_, i) => `termo ${i}`), ['x'.repeat(121)]]) {
    assert.deepEqual(campos({ ...CORPO_SERVICO, termosEquivalentes: termos }), ['termosEquivalentes'], JSON.stringify(termos)?.slice(0, 30));
  }
  assert.deepEqual(campos({}), ['id', 'assuntoId', 'nome', 'termosEquivalentes']);
  assert.equal(LIMITE_CORPO, 32 * 1024);
});

// ---------- Montagem pura ----------

test('K5. novo assunto: sempre ativo, com as datas informadas e nenhum campo de publicação ou validação', () => {
  const entrada = congelar({ ...CORPO_ASSUNTO });
  const a = montarAssunto(entrada, '2026-11-10');
  assert.deepEqual(a, { id: 'assunto-ficticio', nome: 'Assunto Fictício', descricao: 'Descrição fictícia de teste.', ativo: true, criadoEm: '2026-11-10', atualizadoEm: '2026-11-10' });
  assert.deepEqual(montarAssunto(entrada, '2026-11-10'), a);
});

test('K6. esqueleto do serviço: versão 1 em rascunho, não publicado, tudo PENDENTE, sem hash, decisão ou responsável', () => {
  const dados = congelar({ ...validarCorpoServico(CORPO_SERVICO).dados, termosEquivalentes: [...CORPO_SERVICO.termosEquivalentes] });
  const e = montarEsqueletoServico(dados, congelar({ ...ASSUNTO }), '2026-11-10');
  assert.equal(e.pasta, 'services/servico-ficticio/versoes/v1');
  assert.equal(e.versaoId, 'servico-ficticio-v1');
  assert.deepEqual(e.entradaRegistro, {
    id: 'servico-ficticio', assuntoId: 'licenciamento-ambiental', versaoAtualId: 'servico-ficticio-v1', versaoPublicadaId: null,
    arquivo: 'services/servico-ficticio/versoes/v1/service.json', statusValidacao: 'rascunho', publicado: false,
  });
  assert.equal(e.versao.estado, 'rascunho');
  assert.equal(e.versao.numero, 1);
  assert.equal(e.versao.baseadaEm, null);
  assert.equal(e.versao.hashConteudo, null);
  assert.equal(e.versao.enviadaEm, null);
  assert.equal(e.versao.criadoEm, '2026-11-10');
  assert.deepEqual(validarVersao(e.versao), []);
  assert.deepEqual(e.arquivos.map((a) => path.posix.basename(a.caminho)),
    ['versao.json', 'service.json', 'roteiro.md', 'documentos.json', 'perguntas-frequentes.json', 'fontes.json', 'conteudo-assistente.json']);
  assert.ok(e.arquivos.every((a) => a.caminho.startsWith(`${e.pasta}/`)));
  const service = e.arquivos.find((a) => a.caminho.endsWith('/service.json')).conteudo;
  assert.equal(service.statusValidacao, 'rascunho');
  assert.equal(service.publicado, false);
  for (const campo of ['descricao', 'publico', 'unidadeResponsavel']) assert.equal(service[campo], 'PENDENTE', campo);
  assert.deepEqual([service.condicoes, service.etapas, service.links, service.legislacao], [[], [], [], []]);
  assert.deepEqual([service.responsavelValidacao, service.dataRevisao], [null, null]);
  assert.deepEqual(service.canalAtendimento, { nome: 'PENDENTE', url: null });
  assert.deepEqual(service.sistemaInicio, { nome: 'PENDENTE', url: null });
  assert.equal(service.categoria, 'licenciamento ambiental');
  const texto = JSON.stringify(e.arquivos.map((a) => a.conteudo));
  assert.doesNotMatch(texto, /decisao|autorizacao|"hashConteudo":"[0-9a-f]{64}"|"publicado":true|"estado":"(publicado|validado)/);
  for (const nome of ['documentos', 'perguntas-frequentes', 'fontes', 'conteudo-assistente']) {
    const conteudo = e.arquivos.find((a) => a.caminho.endsWith(`/${nome}.json`)).conteudo;
    assert.equal(conteudo.statusValidacao, 'rascunho');
    assert.equal(conteudo.serviceId, 'servico-ficticio');
    assert.match(conteudo.pendencia, /^PENDENTE/);
    assert.deepEqual(Object.values(conteudo).filter(Array.isArray), [[]], `${nome}: lista vazia`);
  }
});

test('K7. o roteiro inicial tem só as seções obrigatórias, todas PENDENTE', () => {
  const texto = montarRoteiroInicial('Serviço Fictício');
  const linhas = texto.split('\n').filter((l) => l.trim() !== '');
  assert.equal(linhas[0], '# Serviço Fictício');
  assert.deepEqual(linhas.slice(1), SECOES_ROTEIRO.flatMap((s) => [`## ${s}`, 'PENDENTE']));
  assert.doesNotMatch(texto, /https?:|\d/);
});

test('K8. montagem determinística e sem modificar a entrada; o esqueleto gravado passa no validador da base', () => {
  const dados = congelar(validarCorpoServico(CORPO_SERVICO).dados);
  const a = montarEsqueletoServico(dados, congelar({ ...ASSUNTO }), '2026-11-10');
  assert.deepEqual(montarEsqueletoServico(dados, ASSUNTO, '2026-11-10'), a);
  comCopia(({ raiz }) => {
    const passos = [
      ...a.arquivos.map((x) => ({ caminho: x.caminho, tipo: x.tipo, conteudo: x.conteudo, novo: true, validar: () => [] })),
      { caminho: 'services/registry.json', tipo: 'json', conteudo: { ...JSON.parse(lerTexto('services', 'registry.json')), servicos: [...JSON.parse(lerTexto('services', 'registry.json')).servicos, a.entradaRegistro] }, validar: () => [] },
    ];
    assert.deepEqual(executarTransacao({ raiz, passos, verificar: () => validarServicos(raiz).erros }), { ok: true });
    assert.deepEqual(validarServicos(raiz), { erros: [], servicos: ['lac', 'servico-ficticio'] });
  });
});

test('K9. as funções de montagem são puras: sem arquivos, relógio, ambiente nem aleatoriedade', () => {
  const codigo = lerTexto('services', 'admin', 'cadastro.js');
  assert.doesNotMatch(codigo, /node:fs|readFile|writeFile|Date\.now|new Date\(|Math\.random|randomUUID|randomBytes|process\.env|fetch\(|localStorage/);
});

// ---------- Transação ----------

const passoJson = (caminho, conteudo, extra = {}) => ({ caminho, tipo: 'json', conteudo, validar: () => [], ...extra });

test('K10. a transação grava todos os passos em ordem e confere o resultado', () => {
  comCopia(({ raiz }) => {
    const r = executarTransacao({
      raiz,
      passos: [passoJson('novo/a.json', { a: 1 }, { novo: true }), { caminho: 'novo/b.md', tipo: 'texto', conteudo: '# B', validar: () => [], novo: true }],
      verificar: () => [],
    });
    assert.deepEqual(r, { ok: true });
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(raiz, 'novo', 'a.json'), 'utf8')), { a: 1 });
    assert.equal(fs.readFileSync(path.join(raiz, 'novo', 'b.md'), 'utf8'), '# B\n');
  });
});

test('K11. nunca sobrescreve o que é marcado como novo: nada é alterado', () => {
  comCopia(({ raiz }) => {
    fs.mkdirSync(path.join(raiz, 'x'));
    fs.writeFileSync(path.join(raiz, 'x', 'existente.json'), '{"original":true}\n');
    const antes = retrato(raiz);
    const r = executarTransacao({ raiz, passos: [passoJson('y/livre.json', { a: 1 }, { novo: true }), passoJson('x/existente.json', { a: 2 }, { novo: true })] });
    assert.deepEqual(r, { ok: false, erro: 'ja_existe', revertido: true });
    assert.equal(retrato(raiz), antes);
  });
});

test('K12. falha em qualquer passo desfaz tudo: arquivos novos e pastas criadas somem e o que existia fica byte a byte igual', () => {
  for (let n = 1; n <= 4; n += 1) {
    comCopia(({ raiz }) => {
      fs.writeFileSync(path.join(raiz, 'services', 'existente.json'), '{ "z": 1,\n  "a": 2 }\n'); // formatação própria, fora do padrão canônico
      const antes = retrato(raiz);
      let renomeacoes = 0;
      const sistema = { ...fs, renameSync: (a, b) => { renomeacoes += 1; if (renomeacoes === n) throw new Error('falha simulada'); return fs.renameSync(a, b); } };
      const r = executarTransacao({
        raiz, sistema,
        passos: [passoJson('a/b/um.json', { v: 1 }, { novo: true }), passoJson('a/dois.json', { v: 2 }, { novo: true }), passoJson('services/existente.json', { z: 9 }), passoJson('c/tres.json', { v: 3 }, { novo: true })],
      });
      assert.equal(r.ok, false, `falha no passo ${n}`);
      assert.equal(r.erro, 'falha_de_escrita');
      assert.equal(r.revertido, true);
      assert.equal(retrato(raiz), antes, `estado integral após falha no passo ${n}`);
    });
  }
});

test('K13. a verificação final pode recusar o resultado: tudo é desfeito, inclusive o arquivo que já existia', () => {
  comCopia(({ raiz }) => {
    const original = '{"b": 1,\n "a": 2}\n';
    fs.writeFileSync(path.join(raiz, 'services', 'registro.json'), original);
    const antes = retrato(raiz);
    const r = executarTransacao({
      raiz,
      passos: [passoJson('novo/dir/arquivo.json', { v: 1 }, { novo: true }), passoJson('services/registro.json', { b: 2 })],
      verificar: () => ['recusado'],
    });
    assert.deepEqual(r, { ok: false, erro: 'verificacao_recusada', revertido: true });
    assert.equal(fs.readFileSync(path.join(raiz, 'services', 'registro.json'), 'utf8'), original);
    assert.equal(fs.existsSync(path.join(raiz, 'novo')), false, 'pastas criadas pela transação foram removidas');
    assert.equal(retrato(raiz), antes);
    // Um verificador que lança erro também desfaz.
    assert.equal(executarTransacao({ raiz, passos: [passoJson('novo/x.json', { v: 1 }, { novo: true })], verificar: () => { throw new Error('x'); } }).erro, 'verificacao_recusada');
    assert.equal(retrato(raiz), antes);
  });
});

test('K14. o desfazer não apaga pastas que já existiam nem arquivos de fora da transação', () => {
  comCopia(({ raiz }) => {
    fs.mkdirSync(path.join(raiz, 'pasta-existente'));
    fs.writeFileSync(path.join(raiz, 'pasta-existente', 'outro.txt'), 'não mexer');
    const antes = retrato(raiz);
    const r = executarTransacao({ raiz, passos: [passoJson('pasta-existente/novo.json', { v: 1 }, { novo: true })], verificar: () => ['recusado'] });
    assert.equal(r.revertido, true);
    assert.equal(retrato(raiz), antes);
  });
});

test('K15. dados recusados pelo validador do passo, raiz inválida e caminho perigoso não deixam rastro', () => {
  comCopia(({ raiz }) => {
    const antes = retrato(raiz);
    assert.equal(executarTransacao({ raiz, passos: [passoJson('n/a.json', { v: 1 }, { novo: true }), passoJson('n/b.json', { v: 2 }, { novo: true, validar: () => ['recusado'] })] }).erro, 'dados_invalidos');
    assert.equal(retrato(raiz), antes);
    assert.equal(executarTransacao({ raiz, passos: [passoJson('../fora.json', { v: 1 }, { novo: true })] }).ok, false);
    assert.equal(retrato(raiz), antes);
  });
  assert.equal(executarTransacao({ raiz: 'relativa', passos: [] }).erro, 'raiz_invalida');
});

test('K16. a transação reutiliza o armazenamento e não usa relógio, rede, ambiente nem log', () => {
  const codigo = lerTexto('services', 'admin', 'transacao.js');
  assert.match(codigo, /criarArmazenamento/);
  assert.doesNotMatch(codigo, /Date\.now|new Date\(|Math\.random|process\.env|fetch\(|console\.|localStorage|rmSync|recursive/);
});

// ---------- Gravação de texto no armazenamento ----------

test('K17. armazenamento: gravarTexto e lerTexto (.md) com formato determinístico, validação e extensão restrita', () => {
  comCopia(({ raiz }) => {
    const arm = criarArmazenamento({ raiz });
    assert.deepEqual(arm.gravarTexto('docs/roteiro.md', '# Título  \n\ntexto   \n\n\n', () => []), { ok: true, bytes: Buffer.byteLength('# Título  \n\ntexto\n') });
    assert.equal(fs.readFileSync(path.join(raiz, 'docs', 'roteiro.md'), 'utf8'), '# Título  \n\ntexto\n');
    assert.deepEqual(arm.lerTexto('docs/roteiro.md'), { ok: true, texto: '# Título  \n\ntexto\n' });
    assert.equal(arm.lerTexto('docs/nao-existe.md').erro, 'nao_encontrado');
    assert.equal(arm.gravarTexto('docs/a.txt', 'x', () => []).erro, 'extensao_nao_permitida');
    assert.equal(arm.gravarTexto('docs/a.json', 'x', () => []).erro, 'extensao_nao_permitida');
    assert.equal(arm.lerTexto('docs/a.json').erro, 'extensao_nao_permitida');
    assert.equal(arm.gravarTexto('../fora.md', 'x', () => []).erro, 'caminho_invalido');
    assert.equal(arm.gravarTexto('docs/b.md', 'x', undefined).erro, 'validador_obrigatorio');
    assert.equal(arm.gravarTexto('docs/b.md', 'x', () => ['recusado']).erro, 'dados_invalidos');
    for (const texto of ['a\r\nb', 'a\u0000b', 5, undefined]) assert.equal(arm.gravarTexto('docs/c.md', texto, () => []).erro, 'dados_invalidos');
    assert.equal(arm.gravarTexto('docs/grande.md', 'a'.repeat(5 * 1024 * 1024 + 1), () => []).erro, 'arquivo_grande_demais');
    assert.deepEqual(fs.readdirSync(path.join(raiz, 'docs')), ['roteiro.md'], 'nada além do arquivo válido foi criado');
  });
});

test('K18. falha ao gravar texto preserva o arquivo anterior e não deixa temporário', () => {
  comCopia(({ raiz }) => {
    fs.mkdirSync(path.join(raiz, 'docs'));
    fs.writeFileSync(path.join(raiz, 'docs', 'r.md'), 'anterior\n');
    const sistema = { ...fs, renameSync: () => { throw new Error('falha'); } };
    const arm = criarArmazenamento({ raiz, sistema });
    assert.equal(arm.gravarTexto('docs/r.md', 'novo', () => []).erro, 'falha_de_escrita');
    assert.equal(fs.readFileSync(path.join(raiz, 'docs', 'r.md'), 'utf8'), 'anterior\n');
    assert.deepEqual(fs.readdirSync(path.join(raiz, 'docs')), ['r.md']);
  });
});
