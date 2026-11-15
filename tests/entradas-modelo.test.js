// Passo 4B1: modelo de dados e funções puras de entradas de texto (services/admin/entradas.js), validação de fontes com
// formaEntrada e catálogo de assuntos com descrição opcional. Nada aqui grava arquivos; dados fictícios.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  LIMITES_ENTRADA, acrescentarEntradasAoEsqueleto, copiarEntradasParaNovaVersao, hashTexto, montarFonteTexto, prepararEntradaTexto,
  problemasDoTexto, validarArquivoEntradas, validarCorpoEntradaTexto,
} from '../services/admin/entradas.js';
import { montarAssunto, montarEsqueletoServico, validarCorpoAssunto, validarCorpoFonte } from '../services/admin/cadastro.js';
import { validarAssuntos, validarFontes } from '../scripts/validate-services.js';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lerReal = (...p) => JSON.parse(fs.readFileSync(path.join(RAIZ, ...p), 'utf8'));
const sha = (t) => crypto.createHash('sha256').update(Buffer.from(t, 'utf8')).digest('hex');
const CORPO = { titulo: 'Orientação fictícia', texto: 'Texto simples fictício.\nSegunda linha com\ttabulação.' };
const DATA = '2026-11-10';

function preparar(corpo = CORPO, { fontes = { statusValidacao: 'rascunho', fontes: [] }, entradas = null, estado = 'rascunho' } = {}) {
  const v = validarCorpoEntradaTexto(corpo);
  assert.equal(v.ok, true);
  return prepararEntradaTexto(v.dados, { data: DATA, servicoId: 'lac', estadoVersao: estado, documentoFontes: fontes, documentoEntradas: entradas });
}

test('E1. fontes antigas (sem formaEntrada) continuam válidas: as 8 fontes da LAC', () => {
  const doc = lerReal('services', 'lac', 'versoes', 'v1', 'fontes.json');
  assert.equal(doc.fontes.length, 8);
  assert.ok(doc.fontes.every((f) => !('formaEntrada' in f)));
  assert.deepEqual(validarFontes(doc, 'lac fontes'), []);
});

test('E2. texto válido gera entrada e fonte textual coerentes (hash só na entrada)', () => {
  const r = preparar();
  assert.equal(r.ok, true);
  assert.equal(r.entrada.texto, CORPO.texto);
  assert.equal(r.entrada.hash, sha(CORPO.texto));
  assert.equal(r.entrada.criadoEm, DATA);
  assert.equal(r.entrada.atualizadoEm, DATA);
  assert.match(r.entrada.id, /^[a-z][a-z0-9-]*$/);
  assert.equal(r.fonte.formaEntrada, 'texto');
  assert.equal(r.fonte.tipo, 'texto_cadastrado');
  assert.equal(r.fonte.entradaId, r.entrada.id);
  assert.equal(r.entrada.fonteId, r.fonte.id);
  assert.equal(r.fonte.url, null);
  assert.equal(r.fonte.origemOficial, false);
  assert.equal(r.fonte.statusValidacao, 'rascunho');
  assert.equal(r.fonte.publicado, false);
  assert.equal(r.fonte.dataConsulta, null);
  assert.equal(r.fonte.orgaoResponsavel, null);
  assert.equal('verificacaoOrigem' in r.fonte, false);
  assert.equal('hash' in r.fonte, false);
  assert.equal(r.criaArquivo, true);
  assert.deepEqual(r.documentoEntradas, { servicoId: 'lac', entradas: [r.entrada] });
  assert.deepEqual(validarFontes(r.documentoFontes, 'f'), []);
  assert.deepEqual(validarArquivoEntradas(r.documentoEntradas, { servicoId: 'lac', fontes: r.documentoFontes.fontes }), []);
});

test('E3. o hash usa os bytes UTF-8 exatamente como enviados (sem trim nem normalização)', () => {
  assert.equal(hashTexto('  espaço  \n'), sha('  espaço  \n'));
  assert.notEqual(hashTexto('a'), hashTexto('a '));
  assert.notEqual(hashTexto('é'), hashTexto('é'));
  const r = preparar({ titulo: 'T', texto: '  com espaços  \n' });
  assert.equal(r.entrada.texto, '  com espaços  \n');
  assert.equal(r.entrada.hash, sha('  com espaços  \n'));
});

test('E4. limites por entrada (caracteres e bytes UTF-8)', () => {
  assert.deepEqual(problemasDoTexto('a'.repeat(LIMITES_ENTRADA.caracteres)), []);
  assert.deepEqual(problemasDoTexto('a'.repeat(LIMITES_ENTRADA.caracteres + 1)), ['limite_caracteres']);
  // 20.000 caracteres de 4 bytes = 80.000 bytes (exatamente no limite de bytes).
  assert.deepEqual(problemasDoTexto('😀'.repeat(20000)), []);
  const bytes = problemasDoTexto('😀'.repeat(20000) + 'a');
  assert.ok(bytes.includes('limite_bytes') && bytes.includes('limite_caracteres'));
  // Com no máximo 4 bytes por caractere, o limite de bytes nunca falha sozinho: ele reforça o de caracteres.
  assert.equal(validarCorpoEntradaTexto({ titulo: 'T', texto: 'a'.repeat(20001) }).ok, false);
});

test('E5. limites por versão (100.000 caracteres e 400.000 bytes)', () => {
  const cheia = { servicoId: 'lac', entradas: [] };
  for (let i = 0; i < 4; i += 1) cheia.entradas.push({ id: `e${i}`, fonteId: `f${i}`, texto: 'a'.repeat(20000), hash: sha('a'.repeat(20000)), criadoEm: DATA, atualizadoEm: DATA });
  const r = preparar({ titulo: 'Nova', texto: 'a'.repeat(20000) }, { entradas: cheia, fontes: { statusValidacao: 'rascunho', fontes: cheia.entradas.map((e) => montarFonteTexto({ id: e.fonteId, titulo: 'x', orgaoResponsavel: null, descricao: '' }, e.id)) } });
  assert.equal(r.ok, true); // 5 x 20.000 = 100.000 exatamente
  const cheia2 = { servicoId: 'lac', entradas: [...cheia.entradas, r.entrada] };
  const fontes2 = r.documentoFontes;
  const estouro = preparar({ titulo: 'Estouro', texto: 'a' }, { entradas: cheia2, fontes: fontes2 });
  assert.deepEqual([estouro.ok, estouro.erro], [false, 'limite_versao']);
  // Por bytes: 5 x 80.000 = 400.000; mais 1 byte estoura (caracteres 5 x 20.000 = 100.000 também).
  const emoji = '😀'.repeat(20000);
  const porBytes = { servicoId: 'lac', entradas: [] };
  for (let i = 0; i < 5; i += 1) porBytes.entradas.push({ id: `e${i}`, fonteId: `f${i}`, texto: emoji, hash: sha(emoji), criadoEm: DATA, atualizadoEm: DATA });
  const fontesB = { statusValidacao: 'rascunho', fontes: porBytes.entradas.map((e) => montarFonteTexto({ id: e.fonteId, titulo: 'x', orgaoResponsavel: null, descricao: '' }, e.id)) };
  assert.deepEqual(validarArquivoEntradas(porBytes, { servicoId: 'lac', fontes: fontesB.fontes }), []);
  assert.equal(preparar({ titulo: 'Mais', texto: 'a' }, { entradas: porBytes, fontes: fontesB }).erro, 'limite_versao');
  // O validador do arquivo também recusa versão acima do limite.
  porBytes.entradas.push({ id: 'e9', fonteId: 'f9', texto: 'a', hash: sha('a'), criadoEm: DATA, atualizadoEm: DATA });
  fontesB.fontes.push(montarFonteTexto({ id: 'f9', titulo: 'x', orgaoResponsavel: null, descricao: '' }, 'e9'));
  assert.ok(validarArquivoEntradas(porBytes, { servicoId: 'lac', fontes: fontesB.fontes }).some((e) => /por versão/.test(e)));
});

test('E6. texto recusado: vazio, só espaços, nulo, controles C0 (exceto tab, LF, CR), e-mail, telefone, credencial', () => {
  for (const t of ['', '   \n\t ', 'a\u0000b', 'a\u0001b', 'a\u001bb', 'a\u007fb', 'a\u000bb', 'a\u000cb', 'a\ud800b']) assert.ok(problemasDoTexto(t).length > 0, JSON.stringify(t));
  for (const t of ['linha\r\nnova\tcom tab', 'Texto com acentuação e emoji 😀']) assert.deepEqual(problemasDoTexto(t), []);
  assert.ok(problemasDoTexto('fale com fulano' + '@' + 'exemplo.com.br').includes('dado_pessoal'));
  assert.ok(problemasDoTexto('ligue (92) 98888' + '-7777 hoje').includes('dado_pessoal'));
  assert.ok(problemasDoTexto('senha: abc123').includes('dado_pessoal'));
  assert.ok(problemasDoTexto('use token=xyz').includes('dado_pessoal'));
  assert.equal(problemasDoTexto(42)[0], 'nao_texto');
});

test('E7. erros e resultados nunca repetem o texto enviado', () => {
  const segredo = 'SEGREDO-FICTICIO-123 contato' + '@' + 'exemplo.com';
  const r = validarCorpoEntradaTexto({ titulo: 'T', texto: segredo });
  assert.deepEqual(r, { ok: false, campos: ['texto'] });
  assert.ok(!JSON.stringify(r).includes('SEGREDO'));
  const doc = { servicoId: 'lac', entradas: [{ id: 'e1', fonteId: 'f1', texto: segredo, hash: 'x', criadoEm: DATA, atualizadoEm: DATA }] };
  assert.ok(!validarArquivoEntradas(doc, { servicoId: 'lac', fontes: [] }).join('|').includes('SEGREDO'));
});

test('E8. campos extras recusados em toda estrutura', () => {
  assert.deepEqual(validarCorpoEntradaTexto({ ...CORPO, hash: 'x' }), { ok: false, campos: ['extras'] });
  assert.equal(validarCorpoEntradaTexto({ ...CORPO, url: 'https://exemplo.gov.br' }).ok, false);
  assert.equal(validarCorpoEntradaTexto({ ...CORPO, id: 'x' }).ok, false);
  assert.equal(validarCorpoEntradaTexto(null).ok, false);
  assert.equal(validarCorpoEntradaTexto([]).ok, false);
  const r = preparar();
  const ctx = { servicoId: 'lac', fontes: r.documentoFontes.fontes };
  assert.ok(validarArquivoEntradas({ ...r.documentoEntradas, extra: 1 }, ctx).length > 0);
  assert.ok(validarArquivoEntradas({ ...r.documentoEntradas, entradas: [{ ...r.entrada, extra: 1 }] }, ctx).length > 0);
  const fonteExtra = { ...r.fonte, verificacaoOrigem: 'x' };
  assert.ok(validarFontes({ statusValidacao: 'rascunho', fontes: [fonteExtra] }, 'f').some((e) => /campo não previsto/.test(e)));
});

test('E9. hash adulterado ou malformado é recusado', () => {
  const r = preparar();
  const ctx = { servicoId: 'lac', fontes: r.documentoFontes.fontes };
  const adulterado = { ...r.documentoEntradas, entradas: [{ ...r.entrada, hash: sha('outro texto') }] };
  assert.ok(validarArquivoEntradas(adulterado, ctx).some((e) => /hash não confere/.test(e)));
  const texto = { ...r.documentoEntradas, entradas: [{ ...r.entrada, texto: `${r.entrada.texto} ` }] };
  assert.ok(validarArquivoEntradas(texto, ctx).some((e) => /hash não confere/.test(e)));
  const curto = { ...r.documentoEntradas, entradas: [{ ...r.entrada, hash: 'abc' }] };
  assert.ok(validarArquivoEntradas(curto, ctx).some((e) => /SHA-256/.test(e)));
});

test('E10. fonte textual sem entrada e entrada órfã são recusadas (1:1)', () => {
  const r = preparar();
  const vazio = { servicoId: 'lac', entradas: [] };
  assert.ok(validarArquivoEntradas(vazio, { servicoId: 'lac', fontes: r.documentoFontes.fontes }).some((e) => /sem entrada correspondente/.test(e)));
  assert.ok(validarArquivoEntradas(r.documentoEntradas, { servicoId: 'lac', fontes: [] }).some((e) => /não existe em fontes.json/.test(e)));
  // fonte existente que não é textual
  const link = lerReal('services', 'lac', 'versoes', 'v1', 'fontes.json').fontes[0];
  const orfa = { ...r.documentoEntradas, entradas: [{ ...r.entrada, fonteId: link.id }] };
  assert.ok(validarArquivoEntradas(orfa, { servicoId: 'lac', fontes: [link] }).some((e) => /não é uma fonte textual/.test(e)));
  // entradaId aponta para outra entrada
  const trocada = { ...r.fonte, entradaId: 'outra' };
  assert.ok(validarArquivoEntradas(r.documentoEntradas, { servicoId: 'lac', fontes: [trocada] }).some((e) => /não aponta para esta entrada/.test(e)));
  // duas entradas para a mesma fonte; servicoId errado
  const dupla = { ...r.documentoEntradas, entradas: [r.entrada, { ...r.entrada, id: 'outra' }] };
  assert.ok(validarArquivoEntradas(dupla, { servicoId: 'lac', fontes: r.documentoFontes.fontes }).some((e) => /mais de uma entrada/.test(e)));
  assert.ok(validarArquivoEntradas({ ...r.documentoEntradas, servicoId: 'x' }, { servicoId: 'lac', fontes: r.documentoFontes.fontes }).length > 0);
});

test('E11. regras da fonte textual e do link no validarFontes', () => {
  const { fonte } = preparar();
  const ok = (f) => validarFontes({ statusValidacao: 'em_validacao', fontes: [f] }, 'f');
  assert.deepEqual(ok(fonte), []);
  assert.ok(ok({ ...fonte, url: 'https://exemplo.gov.br' }).some((e) => /url/.test(e)));
  assert.ok(ok({ ...fonte, tipo: 'manual' }).some((e) => /texto_cadastrado/.test(e)));
  assert.ok(ok({ ...fonte, origemOficial: true }).some((e) => /origemOficial false/.test(e)));
  assert.ok(ok({ ...fonte, publicado: true }).length > 0);
  assert.ok(ok({ ...fonte, entradaId: undefined }).length > 0);
  assert.ok(ok({ ...fonte, formaEntrada: 'outra' }).some((e) => /formaEntrada/.test(e)));
  assert.ok(ok({ ...fonte, vigencia: { situacao: 'vigente', normasRelacionadas: [], observacao: null } }).some((e) => /nao_se_aplica/.test(e)));
  const link = lerReal('services', 'lac', 'versoes', 'v1', 'fontes.json').fontes[0];
  assert.deepEqual(ok({ ...link, formaEntrada: 'link' }), []);
  assert.ok(ok({ ...link, entradaId: 'x' }).some((e) => /link não tem entradaId/.test(e)));
  assert.ok(ok({ ...link, tipo: 'texto_cadastrado' }).length > 0);
  assert.ok(ok({ ...link, orgaoResponsavel: null }).some((e) => /orgaoResponsavel obrigatório/.test(e)));
});

test('E12. unicidade de URL vale só entre links (fontes textuais, com url null, não colidem)', () => {
  const a = preparar({ titulo: 'Primeiro texto', texto: 'um' });
  const b = preparar({ titulo: 'Segundo texto', texto: 'dois' }, { fontes: a.documentoFontes, entradas: a.documentoEntradas });
  const link = lerReal('services', 'lac', 'versoes', 'v1', 'fontes.json').fontes[0];
  const doc = { statusValidacao: 'em_validacao', fontes: [link, ...b.documentoFontes.fontes] };
  assert.deepEqual(validarFontes(doc, 'f'), []);
  assert.ok(validarFontes({ ...doc, fontes: [...doc.fontes, { ...link, id: 'copia' }] }, 'f').some((e) => /URL duplicada/.test(e)));
});

test('E13. versão congelada ou publicada recusa nova entrada', () => {
  for (const estado of ['em_validacao', 'ajustes_solicitados', 'validado_materialmente', 'autorizado_publicacao', 'publicado']) {
    const r = preparar(CORPO, { estado });
    assert.deepEqual([r.ok, r.erro], [false, 'versao_nao_editavel'], estado);
  }
});

test('E14. ids gerados sem colidir; segunda entrada acrescenta sem alterar a primeira', () => {
  const a = preparar({ titulo: 'Mesmo título', texto: 'um' });
  const b = preparar({ titulo: 'Mesmo título', texto: 'dois' }, { fontes: a.documentoFontes, entradas: a.documentoEntradas });
  assert.equal(b.criaArquivo, false);
  assert.notEqual(b.entrada.id, a.entrada.id);
  assert.notEqual(b.fonte.id, a.fonte.id);
  assert.deepEqual(b.documentoEntradas.entradas[0], a.entrada);
  assert.deepEqual(b.documentoFontes.fontes[0], a.fonte);
  assert.deepEqual(validarArquivoEntradas(b.documentoEntradas, { servicoId: 'lac', fontes: b.documentoFontes.fontes }), []);
});

test('E15. entradas anteriores não são alteradas pela preparação (funções puras)', () => {
  const a = preparar();
  const antes = JSON.stringify([a.documentoEntradas, a.documentoFontes]);
  preparar({ titulo: 'Outro', texto: 'x' }, { fontes: a.documentoFontes, entradas: a.documentoEntradas });
  assert.equal(JSON.stringify([a.documentoEntradas, a.documentoFontes]), antes);
});

test('E16. nova versão: cópia profunda das entradas, a anterior preservada', () => {
  const a = preparar();
  const original = JSON.stringify(a.documentoEntradas);
  const c = copiarEntradasParaNovaVersao(a.documentoEntradas, 'lac');
  assert.equal(c.ok, true);
  assert.deepEqual(c.documento, a.documentoEntradas);
  assert.notEqual(c.documento, a.documentoEntradas);
  c.documento.entradas[0].texto = 'alterado na cópia';
  assert.equal(JSON.stringify(a.documentoEntradas), original);
  assert.deepEqual(copiarEntradasParaNovaVersao(null, 'lac').documento, { servicoId: 'lac', entradas: [] });
  assert.equal(copiarEntradasParaNovaVersao({ servicoId: 'outro', entradas: [] }, 'lac').ok, false);
});

test('E17. serviço novo nasce com entradas.json vazio e arquivos.entradas no manifesto (helper puro)', () => {
  const assunto = { id: 'ass', nome: 'Assunto' };
  const base = montarEsqueletoServico({ id: 'novo', assuntoId: 'ass', nome: 'Novo', sigla: 'N', termosEquivalentes: ['novo'] }, assunto, DATA);
  const copia = JSON.stringify(base);
  const e = acrescentarEntradasAoEsqueleto(base, 'novo');
  assert.equal(JSON.stringify(base), copia);
  assert.equal(e.versao.arquivos.entradas, 'services/novo/versoes/v1/entradas.json');
  assert.equal(e.versao.hashConteudo, null);
  const arqEntradas = e.arquivos.find((a) => a.caminho.endsWith('/entradas.json'));
  assert.deepEqual(arqEntradas.conteudo, { servicoId: 'novo', entradas: [] });
  assert.equal(e.arquivos.find((a) => a.caminho.endsWith('/versao.json')).conteudo.arquivos.entradas, e.versao.arquivos.entradas);
  // service.json não ganha a chave
  assert.equal('entradas' in e.arquivos.find((a) => a.caminho.endsWith('/service.json')).conteudo.arquivos, false);
});

test('E18. assunto: descrição opcional (omitida, nunca PENDENTE); nome obrigatório', () => {
  const sem = validarCorpoAssunto({ nome: 'Assunto Novo' });
  assert.deepEqual(sem, { ok: true, dados: { nome: 'Assunto Novo' } });
  for (const d of [null, '']) assert.deepEqual(validarCorpoAssunto({ nome: 'A B', descricao: d }), { ok: true, dados: { nome: 'A B' } });
  const com = validarCorpoAssunto({ nome: 'Assunto', descricao: 'Descrição fictícia.' });
  assert.deepEqual(com.dados, { nome: 'Assunto', descricao: 'Descrição fictícia.' });
  assert.deepEqual(validarCorpoAssunto({ descricao: 'x' }).campos, ['nome']);
  assert.deepEqual(validarCorpoAssunto({ nome: 'A', descricao: 'fulano' + '@' + 'exemplo.com' }).campos, ['descricao']);
  assert.deepEqual(validarCorpoAssunto({ nome: 'A', descricao: 5 }).campos, ['descricao']);
  const a = montarAssunto({ id: 'a', nome: 'A' }, DATA);
  assert.equal('descricao' in a, false);
  assert.deepEqual(a, { id: 'a', nome: 'A', ativo: true, criadoEm: DATA, atualizadoEm: DATA });
  assert.equal(montarAssunto({ id: 'a', nome: 'A', descricao: 'D' }, DATA).descricao, 'D');
});

test('E19. validarAssuntos aceita assunto sem descrição e mantém os existentes válidos', () => {
  const real = lerReal('services', 'assuntos.json');
  assert.deepEqual(validarAssuntos(real).erros, []);
  const semDescricao = { ...real, assuntos: [...real.assuntos, { id: 'sem-descricao', nome: 'Sem descrição', ativo: true, criadoEm: DATA, atualizadoEm: DATA }] };
  assert.deepEqual(validarAssuntos(semDescricao).erros, []);
  const vazia = { ...real, assuntos: [{ ...real.assuntos[0], descricao: '' }] };
  assert.ok(validarAssuntos(vazia).erros.some((e) => /descricao/.test(e)));
  const semNome = { ...real, assuntos: [{ id: 'x', ativo: true, criadoEm: DATA, atualizadoEm: DATA }] };
  assert.ok(validarAssuntos(semNome).erros.some((e) => /"nome" obrigatório/.test(e)));
});

test('E20. esquema de entradas documenta o formato e o esquema de assuntos torna descricao opcional', () => {
  const s = lerReal('services', 'schemas', 'entradas.schema.json');
  assert.deepEqual(s.required, ['servicoId', 'entradas']);
  assert.equal(s.additionalProperties, false);
  assert.deepEqual(s.properties.entradas.items.required, ['id', 'fonteId', 'texto', 'hash', 'criadoEm', 'atualizadoEm']);
  const a = lerReal('services', 'schemas', 'assuntos.schema.json').properties.assuntos.items;
  assert.ok(!a.required.includes('descricao'));
  assert.ok('descricao' in a.properties);
});

test('E21. credencial: recusa atribuições e tokens de alta confiança; aceita frases comuns com as mesmas palavras', () => {
  const recusar = ['senha: x', 'token=abc', 'api_key: z', 'Use a SENHA = 123', 'refresh_token=abc', 'id_token: x', 'client_secret=zzz', 'db_password: x',
    'my_senha=1', 'apikey=abc', 'chave_api: k', 'chave-api=k', 'secret: s', 'Bearer eyJhbGciOiJIUzI1NiJ9.abc', 'authorization: Bearer abcdefghijkl1234', 'senha 1234', 'senha abc123'];
  for (const t of recusar) assert.ok(problemasDoTexto(t).includes('dado_pessoal'), t);
  const aceitar = ['a senha deve ser trocada', 'A senha deve ser trocada.', 'Informe login e senha para acessar o sistema.', 'A sessão expira após o período informado.',
    'A chave do processo está no documento.', 'Sessão: 3 etapas', 'monkey', 'key', 'autorização do órgão', 'Licença ambiental', 'o token não é pedido',
    'chave de acesso ao sistema', 'O token é uma explicação, sem valor', 'senhas devem ser fortes', 'senha deve ter 12 caracteres', 'Bearer'];
  for (const t of aceitar) assert.deepEqual(problemasDoTexto(t), [], t);
  const corpo = { titulo: 'Orientação', texto: 'Texto simples.' };
  for (const [campo, valor] of [['titulo', 'senha: 123456'], ['descricao', 'token=abcdef']]) {
    const r = validarCorpoEntradaTexto({ ...corpo, [campo]: valor });
    assert.deepEqual([r.ok, r.campos], [false, [campo]]);
    assert.ok(!JSON.stringify(r).includes('abcdef') && !JSON.stringify(r).includes('123456'));
  }
  assert.equal(validarCorpoEntradaTexto({ ...corpo, titulo: 'Informe login e senha', descricao: 'A senha deve ser trocada.' }).ok, true);
});

test('E22. desempenho: entrada hostil não tem custo quadrático (20.000 "a", "a." repetido, "a@" sem domínio)', () => {
  const medir = (texto, vezes = 3) => {
    const t0 = process.hrtime.bigint();
    for (let i = 0; i < vezes; i += 1) problemasDoTexto(texto);
    return Number(process.hrtime.bigint() - t0) / 1e6 / vezes;
  };
  const referencia = medir('texto comum fictício. '.repeat(900));
  for (const hostil of ['a'.repeat(20000), 'a.'.repeat(10000), `${'a'.repeat(19990)}@`, 'a@'.repeat(10000), '1'.repeat(20000)]) {
    const ms = medir(hostil);
    assert.ok(ms < 100 + referencia * 10, `${hostil.slice(0, 6)}...: ${ms.toFixed(1)} ms (referência ${referencia.toFixed(1)} ms)`);
  }
});

test('E23. fonte textual exige statusValidacao rascunho e vigencia nao_se_aplica', () => {
  const { fonte } = preparar();
  const ok = (f) => validarFontes({ statusValidacao: 'em_validacao', fontes: [f] }, 'f');
  assert.deepEqual(ok(fonte), []);
  assert.ok(ok({ ...fonte, statusValidacao: 'em_validacao' }).some((e) => /deve estar em rascunho/.test(e)));
  assert.ok(ok({ ...fonte, statusValidacao: 'validado', dataConsulta: '2026-11-10' }).some((e) => /deve estar em rascunho/.test(e)));
  assert.ok(ok({ ...fonte, vigencia: { situacao: 'a_confirmar', normasRelacionadas: [], observacao: null } }).some((e) => /vigencia nao_se_aplica/.test(e)));
  assert.ok(ok({ ...fonte, vigencia: undefined }).some((e) => /vigencia/.test(e)));
});

test('E24. a rota de fonte-link (validarCorpoFonte) recusa o tipo texto_cadastrado e mantém os demais', () => {
  const corpo = { revisao: 'a'.repeat(64), id: 'f-1', titulo: 'T', tipo: 'manual', orgaoResponsavel: 'Órgão', url: 'https://exemplo.gov.br/x', descricao: 'd', origemOficial: false };
  assert.equal(validarCorpoFonte(corpo).ok, true);
  assert.deepEqual(validarCorpoFonte({ ...corpo, tipo: 'texto_cadastrado' }), { ok: false, campos: ['tipo'] });
});
