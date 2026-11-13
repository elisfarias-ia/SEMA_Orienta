// Isolamento do módulo administrativo (Marco 7, Passo 7D): separado do chat do cidadão e fora do build público.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import config from '../vite.config.js';
import { NOMES_ADMINISTRATIVOS, NOMES_INTERNOS, termosProibidos, conferirDist } from '../scripts/check-dist.js';
import { lerDadosDaBase } from '../services/assistant-endpoint.js';
import { selecionarBlocosAssistente } from '../services/assistant-content.js';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lerTexto = (...p) => fs.readFileSync(path.join(RAIZ, ...p), 'utf8');
const lerJson = (...p) => JSON.parse(lerTexto(...p));
const listar = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? listar(path.join(dir, e.name)) : [path.join(dir, e.name)]));
const ARQUIVOS_PUBLICOS = ['index.html', 'src/main.js', 'src/chat.js', 'src/assistant.js', 'src/styles.css'];
const TERMOS_ADMIN = /__admin|admin-endpoint|admin-private|x-admin-token|services\/admin|armazenamento|versao-atual|criarManipuladorAdmin|criarPluginAdminDev/;

test('I1. a interface pública não importa nem menciona módulos, rotas ou token administrativos', () => {
  assert.deepEqual(fs.readdirSync(path.join(RAIZ, 'src')).sort(), ['assistant.js', 'chat.js', 'main.js', 'styles.css']);
  for (const arquivo of ARQUIVOS_PUBLICOS) assert.doesNotMatch(lerTexto(arquivo), TERMOS_ADMIN, arquivo);
  for (const arquivo of ['src/main.js', 'src/chat.js', 'src/assistant.js']) {
    assert.doesNotMatch(lerTexto(arquivo), /from '\.\.\/services|import\(.*services|\/admin\b/, arquivo);
  }
});

test('I2. a interface pública não usa cookies, localStorage nem sessionStorage (nem para token)', () => {
  for (const arquivo of ARQUIVOS_PUBLICOS) assert.doesNotMatch(lerTexto(arquivo), /localStorage|sessionStorage|document\.cookie|indexedDB/, arquivo);
});

test('I3. todos os plugins do Vite valem só no servidor de desenvolvimento; não há gancho de preview nem de build', () => {
  const nomes = config.plugins.map((p) => p.name).sort();
  assert.deepEqual(nomes, ['sema-orienta-admin-dev', 'sema-orienta-admin-redirecionamento', 'sema-orienta-assistente-dev']);
  for (const p of config.plugins) {
    assert.equal(p.apply, 'serve', p.name);
    for (const gancho of ['configurePreviewServer', 'transform', 'load', 'resolveId', 'generateBundle', 'renderChunk', 'transformIndexHtml', 'buildStart']) {
      assert.equal(gancho in p, false, `${p.name}: ${gancho}`);
    }
  }
  const texto = lerTexto('vite.config.js');
  assert.doesNotMatch(texto, /\bdefine\b|envPrefix|VITE_|process\.env|loadEnv|server:\s*\{|host:|cors/);
});

test('I4. não há dependências nem scripts além de vite, Playwright e dos testes e2e, e a pasta administrativa pública e os dados privados não existem', () => {
  const pacote = lerJson('package.json');
  assert.deepEqual(Object.keys(pacote.devDependencies).sort(), ['@playwright/test', 'vite']);
  assert.equal(pacote.dependencies, undefined);
  assert.deepEqual(Object.keys(pacote.scripts).sort(), ['build', 'dev', 'preview', 'test', 'test:e2e', 'test:e2e:headed', 'validate:services']);
  assert.equal(pacote.scripts.dev, 'vite');
  assert.deepEqual(fs.readdirSync(path.join(RAIZ, 'admin')).sort(), ['admin-logic.js', 'admin.js', 'index.html', 'saude', 'styles.css']);
  assert.equal(fs.existsSync(path.join(RAIZ, 'data')), false);
  assert.ok(lerTexto('.gitignore').split(/\r?\n/).map((l) => l.trim()).includes('data/admin-private/'));
});

test('I5. o módulo administrativo não importa o chat nem o assistente, e o assistente não importa o módulo administrativo', () => {
  for (const arquivo of listar(path.join(RAIZ, 'services', 'admin')).filter((f) => f.endsWith('.js'))) {
    assert.doesNotMatch(fs.readFileSync(arquivo, 'utf8'), /assistant-endpoint|assistant-content|assistant-messages|\.\.\/src|from '\.\.\/\.\.\/src/, path.basename(arquivo));
  }
  for (const arquivo of ['assistant-endpoint.js', 'assistant-content.js', 'assistant-messages.js']) {
    assert.doesNotMatch(lerTexto('services', arquivo), /\.\/admin\/|__admin|admin-endpoint/, arquivo);
  }
});

test('I6. o modo público do assistente continua com zero blocos; o teste local continua com cinco', () => {
  const dados = lerDadosDaBase(RAIZ);
  assert.deepEqual(selecionarBlocosAssistente(dados), []);
  assert.deepEqual(selecionarBlocosAssistente(dados, 'publico'), []);
  assert.equal(selecionarBlocosAssistente(dados, 'teste_local').length, 5);
});

test('I7. a conferência do dist/ passou a procurar nomes administrativos, o catálogo e a versão atual', () => {
  for (const nome of ['/__admin', 'x-admin-token', 'admin-endpoint', 'criarManipuladorAdmin', 'admin-private', 'services/admin', 'versao-atual', '/__admin/assuntos', 'executarTransacao', 'montarEsqueletoServico', 'validarCorpoAssunto', 'validarCorpoServico', 'cadastrarServico']) {
    assert.ok(NOMES_ADMINISTRATIVOS.includes(nome), nome);
  }
  const textos = termosProibidos(RAIZ).map((t) => t.texto);
  const assunto = lerJson('services', 'assuntos.json').assuntos[0];
  for (const esperado of ['lac-v1', assunto.id, assunto.nome, assunto.descricao, ...NOMES_ADMINISTRATIVOS, ...NOMES_INTERNOS]) assert.ok(textos.includes(esperado), esperado);
  assert.ok(textos.includes(lerJson('services', 'lac', 'versoes', 'v1', 'service.json').descricao));
});

test('I8. dist/ não tem rotas, token, catálogo, versão nem conteúdo administrativo (quando dist/ existir)', { skip: !fs.existsSync(path.join(RAIZ, 'dist')) }, () => {
  assert.deepEqual(conferirDist(RAIZ), []);
  const assunto = lerJson('services', 'assuntos.json').assuntos[0];
  const proibidos = [/__admin/, /x-admin-token/i, /sessao/i, /catalogo/i, /versao-atual/, /admin-endpoint/, /admin-private/, /armazenamento/i, /lac-v1/, /versoes\/v1/, /hashConteudo/,
    /licenciamento-ambiental/, new RegExp(assunto.nome), /timingSafeEqual|randomBytes/, /Cross-Origin-Resource-Policy/, /\b[0-9a-f]{64}\b/,
    /executarTransacao|montarEsqueletoServico|montarAssunto|validarCorpo(Assunto|Servico)|cadastrar(Assunto|Servico)|termosEquivalentes|versaoAtualId|versaoPublicadaId|sema-orienta-ensaio/];
  for (const arquivo of listar(path.join(RAIZ, 'dist'))) {
    const texto = fs.readFileSync(arquivo, 'utf8');
    for (const p of proibidos) assert.doesNotMatch(texto, p, `${path.relative(RAIZ, arquivo)} ${p}`);
  }
  // O build contém apenas a página, um script e uma folha de estilos.
  assert.deepEqual(listar(path.join(RAIZ, 'dist')).map((f) => path.extname(f)).sort(), ['.css', '.html', '.js']);
});

test('I9. nenhum dado administrativo real: sem decisões, sem histórico e sem dados pessoais nos arquivos do passo', () => {
  for (const arquivo of ['services/admin/admin-endpoint.js', 'tests/admin-endpoint.test.js', 'tests/admin-isolamento.test.js']) {
    const texto = lerTexto(arquivo);
    assert.doesNotMatch(texto, /[A-Za-z0-9._-]+@[A-Za-z0-9-]+\.[A-Za-z]{2,}/, arquivo);
    assert.doesNotMatch(texto, /(\(\d{2}\)|\b\d{2})\s?\d{4,5}[-\s]?\d{4}\b/, arquivo);
  }
  assert.equal(listar(path.join(RAIZ, 'services')).some((f) => f.endsWith('.jsonl')), false);
});
