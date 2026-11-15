// Passo 4B1: isolamento das entradas de texto. entradas.json não pode ser lido pelo chat/assistente nem pelo servidor MCP,
// e nem o arquivo nem o texto cadastrado podem aparecer no build (dist/). Tudo em cópias temporárias, com texto fictício.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { selecionarBlocosAssistente } from '../services/assistant-content.js';
import { lerDadosDaBase } from '../services/assistant-endpoint.js';
import { criarFerramentas } from '../scripts/mcp/ferramentas.js';
import { conferirDist, termosProibidos } from '../scripts/check-dist.js';
import { hashTexto } from '../services/admin/entradas.js';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CANARIO = 'CANARIO-ENTRADA-FICTICIO-7391: orientação fictícia que jamais deve sair da administração.';
const PASTA = ['services', 'lac', 'versoes', 'v1'];

function listarArquivos(dir, filtro) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === 'node_modules' ? [] : listarArquivos(p, filtro);
    return filtro(p) ? [p] : [];
  });
}

/** Cópia temporária de services/ com um entradas.json contendo o texto-canário (solto: só para provar que ninguém o lê). */
function comCopiaComCanario(fn) {
  const pai = fs.mkdtempSync(path.join(os.tmpdir(), 'sema-orienta-entradas-iso-'));
  const raiz = path.join(pai, 'raiz');
  fs.mkdirSync(raiz);
  fs.cpSync(path.join(RAIZ, 'services'), path.join(raiz, 'services'), { recursive: true });
  const doc = { servicoId: 'lac', entradas: [{ id: 'canario', fonteId: 'canario-fonte', texto: CANARIO, hash: hashTexto(CANARIO), criadoEm: '2026-11-10', atualizadoEm: '2026-11-10' }] };
  fs.writeFileSync(path.join(raiz, ...PASTA, 'entradas.json'), `${JSON.stringify(doc, null, 2)}\n`);
  try {
    return fn(raiz);
  } finally {
    fs.rmSync(pai, { recursive: true, force: true });
  }
}

test('I1. o código do chat, do assistente e do MCP não menciona entradas de texto', () => {
  const arquivos = [
    ...listarArquivos(path.join(RAIZ, 'services'), (p) => /[\\/]assistant-[^\\/]*\.js$/.test(p) && path.dirname(p) === path.join(RAIZ, 'services')),
    ...listarArquivos(path.join(RAIZ, 'scripts', 'mcp'), (p) => p.endsWith('.js')),
    ...listarArquivos(path.join(RAIZ, 'src'), (p) => /\.(js|css|html)$/.test(p)),
    path.join(RAIZ, 'index.html'),
  ];
  assert.ok(arquivos.length >= 8);
  const mcp = path.join(RAIZ, 'scripts', 'mcp');
  for (const a of arquivos) {
    const codigo = fs.readFileSync(a, 'utf8');
    if (path.dirname(a) === mcp) {
      // O MCP só confere o caminho declarado no manifesto (disponibilidade); nunca lê o arquivo nem importa o módulo de entradas.
      assert.doesNotMatch(codigo, /lerJson\([^)]*entradas|lerTexto\([^)]*entradas|entradas-gravacao|admin\/entradas|NOME_ARQUIVO_ENTRADAS|CHAVE_ENTRADAS/, path.relative(RAIZ, a));
    } else {
      assert.doesNotMatch(codigo, /entradas\.json|entradas-gravacao|admin\/entradas|schemas\/entradas|arquivos\.entradas|NOME_ARQUIVO_ENTRADAS|CHAVE_ENTRADAS/, path.relative(RAIZ, a));
    }
  }
});

test('I2. o assistente não lê entradas.json: nenhuma saída de leitura ou seleção contém o texto cadastrado', () => {
  comCopiaComCanario((raiz) => {
    const dados = lerDadosDaBase(raiz);
    assert.ok(!JSON.stringify(dados).includes('CANARIO'));
    for (const modo of ['publico', 'teste_local']) {
      assert.ok(!JSON.stringify(selecionarBlocosAssistente(dados, modo)).includes('CANARIO'), modo);
    }
  });
});

test('I3. exclusão defensiva: bloco que cita fonte textual nunca é liberado ao modo público; a mesma estrutura com link é', () => {
  const bloco = (fonteId) => ({
    id: 'b1', tipo: 'conhecimento', texto: 'Texto de teste.', origem: 'fonte', fonteIds: [fonteId],
    referencias: [{ fonteId, localizacao: 'item 1' }], ambiente: 'publico', publicado: true, statusValidacao: 'validado', revisaoAtualidade: 'concluida',
  });
  const base = { id: 'f1', publicado: true, vigencia: { situacao: 'nao_se_aplica' } };
  const comLink = selecionarBlocosAssistente({ conteudo: { blocos: [bloco('f1')] }, fontes: [{ ...base, tipo: 'pagina_oficial' }] }, 'publico');
  assert.equal(comLink.length, 1);
  const comTexto = selecionarBlocosAssistente({ conteudo: { blocos: [bloco('f1')] }, fontes: [{ ...base, tipo: 'texto_cadastrado', formaEntrada: 'texto' }] }, 'publico');
  assert.deepEqual(comTexto, []);
  const soForma = selecionarBlocosAssistente({ conteudo: { blocos: [bloco('f1')] }, fontes: [{ ...base, tipo: 'pagina_oficial', formaEntrada: 'texto' }] }, 'publico');
  assert.deepEqual(soForma, []);
});

test('I4. o servidor MCP não expõe entradas.json: nenhuma ferramenta devolve o texto cadastrado', () => {
  comCopiaComCanario((raiz) => {
    const ferramentas = criarFerramentas({ raiz });
    const chamadas = [['listar_assuntos', {}], ['listar_servicos', {}], ['consultar_fontes', { servicoId: 'lac' }], ['resumir_base', {}]];
    for (const [nome, args] of chamadas) {
      const r = ferramentas.chamar(nome, args);
      const texto = JSON.stringify(r);
      assert.ok(texto.length > 20, nome);
      assert.ok(!texto.includes('CANARIO'), nome);
      assert.ok(!texto.includes('entradas.json'), nome);
    }
  });
});

test('I5. check-dist: o texto de entradas.json e os nomes do módulo viram termos proibidos', () => {
  comCopiaComCanario((raiz) => {
    const termos = termosProibidos(raiz).map((t) => t.texto);
    assert.ok(termos.includes(CANARIO));
    assert.ok(termos.some((t) => t.startsWith('CANARIO-ENTRADA-FICTICIO-7391')));
    for (const nome of ['entradas.json', 'entradas-gravacao', 'services/admin/entradas', 'validarCorpoEntradaTexto', 'gravarEntradaTexto', 'formaEntrada', 'texto_cadastrado']) {
      assert.ok(termos.includes(nome), nome);
    }
  });
});

test('I6. check-dist: build limpo passa; build com o texto, com entradas.json ou com nomes do módulo é reprovado', () => {
  comCopiaComCanario((raiz) => {
    const dist = path.join(raiz, 'dist');
    fs.mkdirSync(path.join(dist, 'assets'), { recursive: true });
    fs.writeFileSync(path.join(dist, 'index.html'), '<!doctype html><html><body><p>Página pública fictícia.</p></body></html>');
    assert.deepEqual(conferirDist(raiz), []);

    fs.writeFileSync(path.join(dist, 'assets', 'app.js'), `const t = ${JSON.stringify(CANARIO)};`);
    assert.ok(conferirDist(raiz).some((o) => o.origem === 'texto de entrada'));

    fs.writeFileSync(path.join(dist, 'assets', 'app.js'), `const trecho = ${JSON.stringify(CANARIO.split(': ')[1])};`);
    assert.ok(conferirDist(raiz).some((o) => o.origem === 'trecho de texto de entrada' || o.origem === 'texto de entrada'));

    fs.writeFileSync(path.join(dist, 'assets', 'app.js'), 'fetch("services/lac/versoes/v1/entradas.json");');
    assert.ok(conferirDist(raiz).some((o) => o.origem === 'entradas de texto (administração)'));

    fs.writeFileSync(path.join(dist, 'assets', 'app.js'), 'const forma = fonte.formaEntrada;');
    assert.ok(conferirDist(raiz).length > 0);
  });
});

test('I7. check-dist continua funcionando com assunto sem descrição (não procura a palavra "undefined")', () => {
  comCopiaComCanario((raiz) => {
    const arq = path.join(raiz, 'services', 'assuntos.json');
    const doc = JSON.parse(fs.readFileSync(arq, 'utf8'));
    doc.assuntos.push({ id: 'sem-descricao', nome: 'Assunto sem descrição fictício', ativo: true, criadoEm: '2026-11-10', atualizadoEm: '2026-11-10' });
    fs.writeFileSync(arq, JSON.stringify(doc));
    const termos = termosProibidos(raiz);
    assert.ok(termos.every((t) => typeof t.texto === 'string' && t.texto !== 'undefined'));
    const dist = path.join(raiz, 'dist');
    fs.mkdirSync(dist);
    fs.writeFileSync(path.join(dist, 'index.html'), '<html><body>valor undefined em texto público fictício</body></html>');
    assert.deepEqual(conferirDist(raiz), []);
  });
});

test('I8. o entradas.json real não existe no repositório e o build não depende dele (vite.config.js não o cita)', () => {
  assert.equal(fs.existsSync(path.join(RAIZ, ...PASTA, 'entradas.json')), false);
  assert.doesNotMatch(fs.readFileSync(path.join(RAIZ, 'vite.config.js'), 'utf8'), /entradas\.json/);
});

test('I9. com arquivos.entradas no manifesto (gravação real em cópia): assistente e MCP seguem funcionando e não mostram o texto', async () => {
  const { criarGravadorEntradas } = await import('../services/admin/entradas-gravacao.js');
  const { localizarVersaoAtual } = await import('../services/versao-atual.js');
  const pai = fs.mkdtempSync(path.join(os.tmpdir(), 'sema-orienta-entradas-iso2-'));
  const raiz = path.join(pai, 'raiz');
  fs.mkdirSync(raiz);
  fs.cpSync(path.join(RAIZ, 'services'), path.join(raiz, 'services'), { recursive: true });
  try {
    const r = await criarGravadorEntradas({ raiz, agora: () => new Date(2026, 10, 10) }).gravarEntradaTexto('lac', { titulo: 'Texto de isolamento', texto: CANARIO });
    assert.equal(r.ok, true);
    assert.equal(JSON.parse(fs.readFileSync(path.join(raiz, ...PASTA, 'versao.json'), 'utf8')).arquivos.entradas, 'services/lac/versoes/v1/entradas.json');
    const v = localizarVersaoAtual(raiz, 'lac');
    assert.equal(v.ok, true);
    assert.equal(Object.hasOwn(v.arquivos, 'entradas'), false);
    const dados = lerDadosDaBase(raiz);
    assert.ok(!JSON.stringify(dados).includes('CANARIO'));
    for (const modo of ['publico', 'teste_local']) assert.ok(!JSON.stringify(selecionarBlocosAssistente(dados, modo)).includes('CANARIO'));
    const ferramentas = criarFerramentas({ raiz });
    for (const [nome, args] of [['listar_assuntos', {}], ['listar_servicos', {}], ['consultar_fontes', { servicoId: 'lac' }], ['resumir_base', {}]]) {
      const texto = JSON.stringify(ferramentas.chamar(nome, args));
      assert.ok(texto.length > 20, nome);
      assert.ok(!texto.includes('CANARIO'), nome);
      assert.ok(!texto.includes('entradas.json'), nome);
    }
    // Disponibilidade: o MCP continua listando as fontes da LAC e omite por completo a fonte textual em rascunho.
    const fontes = JSON.stringify(ferramentas.chamar('consultar_fontes', { servicoId: 'lac' }));
    assert.ok(fontes.includes('sema-orientacoes-lac'));
    assert.ok(!fontes.includes('texto_cadastrado'));
    assert.ok(!fontes.includes('Texto de isolamento'));
    // Caminho errado de entradas no manifesto continua sendo recusado.
    const m = path.join(raiz, ...PASTA, 'versao.json');
    const man = JSON.parse(fs.readFileSync(m, 'utf8'));
    man.arquivos.entradas = '../fora.json';
    fs.writeFileSync(m, JSON.stringify(man));
    assert.equal(localizarVersaoAtual(raiz, 'lac').erro, 'manifesto_incoerente');
    man.arquivos.entradas = 'services/lac/versoes/v1/entradas.json';
    man.arquivos.outra = 'x';
    fs.writeFileSync(m, JSON.stringify(man));
    assert.equal(localizarVersaoAtual(raiz, 'lac').erro, 'manifesto_incoerente');
  } finally {
    fs.rmSync(pai, { recursive: true, force: true });
  }
});

test('I10. check-dist: texto de entrada curto demais (< 30 caracteres) não vira termo proibido; o longo continua', () => {
  comCopiaComCanario((raiz) => {
    const arq = path.join(raiz, ...PASTA, 'entradas.json');
    const doc = JSON.parse(fs.readFileSync(arq, 'utf8'));
    doc.entradas.push({ ...doc.entradas[0], id: 'curto', fonteId: 'curto-fonte', texto: 'Licença', hash: hashTexto('Licença') });
    fs.writeFileSync(arq, JSON.stringify(doc));
    const termos = termosProibidos(raiz).filter((t) => t.origem === 'texto de entrada').map((t) => t.texto);
    assert.ok(termos.includes(CANARIO));
    assert.ok(!termos.includes('Licença'));
    const dist = path.join(raiz, 'dist');
    fs.mkdirSync(dist);
    fs.writeFileSync(path.join(dist, 'index.html'), '<html><body>Licença ambiental pública.</body></html>');
    assert.deepEqual(conferirDist(raiz), []);
  });
});
