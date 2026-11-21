// Passo 4B1: gravação atômica de entradas de texto (services/admin/entradas-gravacao.js). SEMPRE em cópias temporárias fora do
// repositório, com dados fictícios; a base real da LAC é conferida (retrato antes/depois) para provar que nada foi gravado nela.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { criarGravadorEntradas } from '../services/admin/entradas-gravacao.js';
import { hashTexto } from '../services/admin/entradas.js';
import { validarServicos } from '../scripts/validate-services.js';
import { MARIA } from './admin-auxiliar.js';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const AGORA = () => new Date(2026, 10, 10, 12, 0, 0);
const PASTA = 'services/lac/versoes/v1';
const CORPO = { titulo: 'Orientação fictícia de teste', texto: 'Texto fictício de teste.\nSegunda linha.' };

/** Retrato byte a byte de uma pasta (arquivos e diretórios). */
function retrato(raiz, sub = 'services') {
  const itens = [];
  const andar = (d) => {
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

async function comCopia(fn) {
  const pai = fs.mkdtempSync(path.join(os.tmpdir(), 'sema-orienta-entradas-'));
  const raiz = path.join(pai, 'raiz');
  fs.mkdirSync(raiz);
  fs.cpSync(path.join(RAIZ, 'services'), path.join(raiz, 'services'), { recursive: true });
  try {
    return await fn({ raiz, pai });
  } finally {
    fs.rmSync(pai, { recursive: true, force: true });
  }
}
const lerJson = (raiz, ...p) => JSON.parse(fs.readFileSync(path.join(raiz, ...p), 'utf8'));
const lerBruto = (raiz, ...p) => fs.readFileSync(path.join(raiz, ...p));
const caminho = (...p) => [...PASTA.split('/'), ...p];

test('G1. primeira entrada: cria entradas.json, acrescenta a fonte textual e registra arquivos.entradas, tudo válido', async () => {
  await comCopia(async ({ raiz }) => {
    const antesFontes = lerJson(raiz, ...caminho('fontes.json'));
    const g = criarGravadorEntradas({ raiz, agora: AGORA });
    const r = await g.gravarEntradaTexto('lac', CORPO, { ator: MARIA });
    assert.equal(r.ok, true);
    assert.equal(r.status, 201);
    assert.equal(r.criouArquivo, true);
    assert.equal(r.hash, hashTexto(CORPO.texto));
    assert.ok(!JSON.stringify(r).includes('Segunda linha'));

    const entradas = lerJson(raiz, ...caminho('entradas.json'));
    assert.equal(entradas.servicoId, 'lac');
    assert.equal(entradas.entradas.length, 1);
    assert.equal(entradas.entradas[0].texto, CORPO.texto);
    assert.equal(entradas.entradas[0].hash, hashTexto(CORPO.texto));
    assert.equal(entradas.entradas[0].criadoEm, '2026-11-10');

    const fontes = lerJson(raiz, ...caminho('fontes.json'));
    assert.equal(fontes.fontes.length, antesFontes.fontes.length + 1);
    assert.deepEqual(fontes.fontes.slice(0, antesFontes.fontes.length), antesFontes.fontes);
    const nova = fontes.fontes.at(-1);
    assert.equal(nova.formaEntrada, 'texto');
    assert.equal(nova.entradaId, r.entradaId);
    assert.equal(nova.id, r.fonteId);
    assert.equal(nova.url, null);
    assert.equal('hash' in nova, false);
    assert.ok(!JSON.stringify(fontes).includes('Segunda linha'));

    const versao = lerJson(raiz, ...caminho('versao.json'));
    assert.equal(versao.arquivos.entradas, `${PASTA}/entradas.json`);
    assert.equal(versao.hashConteudo, null);
    assert.equal(versao.estado, 'rascunho');
    assert.deepEqual(validarServicos(raiz).erros, []);
    assert.deepEqual(fs.readdirSync(path.join(raiz, ...caminho())).filter((n) => n.endsWith('.tmp')), []);
  });
});

test('G2. segunda entrada: acrescenta sem recriar o arquivo, sem mexer em versao.json e preservando a primeira', async () => {
  await comCopia(async ({ raiz }) => {
    const g = criarGravadorEntradas({ raiz, agora: AGORA });
    const a = await g.gravarEntradaTexto('lac', CORPO, { ator: MARIA });
    const versaoAntes = lerBruto(raiz, ...caminho('versao.json'));
    const primeira = lerJson(raiz, ...caminho('entradas.json')).entradas[0];
    const b = await g.gravarEntradaTexto('lac', { titulo: CORPO.titulo, texto: '  outro texto com espaços  ' }, { ator: MARIA });
    assert.equal(b.ok, true);
    assert.equal(b.criouArquivo, false);
    assert.notEqual(b.entradaId, a.entradaId);
    assert.notEqual(b.fonteId, a.fonteId);
    assert.deepEqual(lerBruto(raiz, ...caminho('versao.json')), versaoAntes);
    const entradas = lerJson(raiz, ...caminho('entradas.json')).entradas;
    assert.equal(entradas.length, 2);
    assert.deepEqual(entradas[0], primeira);
    assert.equal(entradas[1].texto, '  outro texto com espaços  ');
    assert.equal(entradas[1].hash, hashTexto('  outro texto com espaços  '));
    assert.deepEqual(validarServicos(raiz).erros, []);
  });
});

test('G3. rollback ao falhar a escrita de versao.json: remove entradas.json recém-criado e restaura tudo byte a byte', async () => {
  await comCopia(async ({ raiz }) => {
    const antes = retrato(raiz);
    const versaoBytes = lerBruto(raiz, ...caminho('versao.json'));
    const fontesBytes = lerBruto(raiz, ...caminho('fontes.json'));
    const sistema = {
      ...fs,
      renameSync(origem, destino) {
        if (String(destino).endsWith('versao.json')) throw new Error('falha injetada');
        return fs.renameSync(origem, destino);
      },
    };
    const g = criarGravadorEntradas({ raiz, sistema, agora: AGORA });
    const r = await g.gravarEntradaTexto('lac', CORPO, { ator: MARIA });
    assert.deepEqual([r.ok, r.status, r.erro], [false, 500, 'indisponivel']);
    assert.ok(!JSON.stringify(r).includes('Segunda linha'));
    assert.equal(fs.existsSync(path.join(raiz, ...caminho('entradas.json'))), false);
    assert.deepEqual(lerBruto(raiz, ...caminho('versao.json')), versaoBytes);
    assert.deepEqual(lerBruto(raiz, ...caminho('fontes.json')), fontesBytes);
    assert.deepEqual(retrato(raiz), antes);
  });
});

test('G4. rollback total quando a verificação final recusa o resultado (entradas.json e fontes.json voltam ao que eram)', async () => {
  await comCopia(async ({ raiz }) => {
    const antes = retrato(raiz);
    const g = criarGravadorEntradas({ raiz, agora: AGORA, verificarFinal: () => ['recusado'] });
    const r = await g.gravarEntradaTexto('lac', CORPO, { ator: MARIA });
    assert.deepEqual([r.ok, r.status, r.erro], [false, 422, 'dados_invalidos']);
    assert.deepEqual(retrato(raiz), antes);
  });
});

test('G5. rollback da segunda entrada preserva a primeira byte a byte', async () => {
  await comCopia(async ({ raiz }) => {
    await criarGravadorEntradas({ raiz, agora: AGORA }).gravarEntradaTexto('lac', CORPO, { ator: MARIA });
    const antes = retrato(raiz);
    const r = await criarGravadorEntradas({ raiz, agora: AGORA, verificarFinal: () => ['recusado'] }).gravarEntradaTexto('lac', { titulo: 'Outra', texto: 'outro' }, { ator: MARIA });
    assert.equal(r.ok, false);
    assert.deepEqual(retrato(raiz), antes);
  });
});

test('G6. versão congelada ou publicada: recusada com 409 e nada muda', async () => {
  for (const estado of ['em_validacao', 'publicado']) {
    await comCopia(async ({ raiz }) => {
      const versao = lerJson(raiz, ...caminho('versao.json'));
      versao.estado = estado;
      versao.hashConteudo = 'a'.repeat(64);
      versao.enviadaEm = '2026-11-10';
      fs.writeFileSync(path.join(raiz, ...caminho('versao.json')), `${JSON.stringify(versao, null, 2)}\n`);
      const antes = retrato(raiz);
      const r = await criarGravadorEntradas({ raiz, agora: AGORA }).gravarEntradaTexto('lac', CORPO, { ator: MARIA });
      assert.deepEqual([r.ok, r.status, r.erro], [false, 409, 'versao_nao_editavel'], estado);
      assert.deepEqual(retrato(raiz), antes);
    });
  }
});

test('G7. corpo inválido (PII, extras, vazio, limite) e serviço inexistente: recusados sem gravar e sem repetir o texto', async () => {
  await comCopia(async ({ raiz }) => {
    const antes = retrato(raiz);
    const g = criarGravadorEntradas({ raiz, agora: AGORA });
    const casos = [
      { titulo: 'T', texto: 'contato fulano' + '@' + 'exemplo.com.br' },
      { titulo: 'T', texto: 'ligue (92) 98888' + '-7777' },
      { titulo: 'T', texto: 'senha: 12345' },
      { titulo: 'T', texto: '   ' },
      { titulo: 'T', texto: 'a'.repeat(20001) },
      { titulo: 'T', texto: 'a\u0000b' },
      { ...CORPO, hash: 'x' },
      { ...CORPO, url: 'https://exemplo.gov.br' },
    ];
    for (const c of casos) {
      const r = await g.gravarEntradaTexto('lac', c, { ator: MARIA });
      assert.deepEqual([r.ok, r.status, r.erro], [false, 422, 'dados_invalidos']);
      assert.ok(Array.isArray(r.campos));
      assert.ok(!JSON.stringify(r).includes('fulano'));
      assert.ok(!JSON.stringify(r).includes('12345'));
    }
    const r404 = await g.gravarEntradaTexto('inexistente', CORPO, { ator: MARIA });
    assert.deepEqual([r404.ok, r404.status, r404.erro], [false, 404, 'nao_encontrado']);
    assert.deepEqual(retrato(raiz), antes);
  });
});

test('G8. limite por versão na gravação: recusa sem alterar nada', async () => {
  await comCopia(async ({ raiz }) => {
    const g = criarGravadorEntradas({ raiz, agora: AGORA });
    for (let i = 0; i < 5; i += 1) {
      const r = await g.gravarEntradaTexto('lac', { titulo: `Texto grande ${i}`, texto: `${'a'.repeat(19990)} ${i}`.padEnd(20000, 'b') }, { ator: MARIA });
      assert.equal(r.ok, true, `entrada ${i}`);
    }
    const antes = retrato(raiz);
    const r = await g.gravarEntradaTexto('lac', { titulo: 'Excedente', texto: 'x' }, { ator: MARIA });
    assert.deepEqual([r.ok, r.status, r.erro], [false, 422, 'limite_versao']);
    assert.deepEqual(retrato(raiz), antes);
    assert.deepEqual(validarServicos(raiz).erros, []);
  });
});

test('G9. entradas.json solto (sem arquivos.entradas no manifesto): a base é inválida e a gravação recusa sem alterar', async () => {
  await comCopia(async ({ raiz }) => {
    fs.writeFileSync(path.join(raiz, ...caminho('entradas.json')), `${JSON.stringify({ servicoId: 'lac', entradas: [] })}\n`);
    assert.ok(validarServicos(raiz).erros.some((e) => /sem arquivos.entradas no manifesto/.test(e)));
    const antes = retrato(raiz);
    const r = await criarGravadorEntradas({ raiz, agora: AGORA }).gravarEntradaTexto('lac', CORPO, { ator: MARIA });
    assert.deepEqual([r.ok, r.status, r.erro], [false, 409, 'ja_existe']);
    assert.deepEqual(retrato(raiz), antes);
  });
});

test('G10. validador: arquivos.entradas com caminho errado, arquivo ausente e adulteração depois de gravar', async () => {
  await comCopia(async ({ raiz }) => {
    await criarGravadorEntradas({ raiz, agora: AGORA }).gravarEntradaTexto('lac', CORPO, { ator: MARIA });
    assert.deepEqual(validarServicos(raiz).erros, []);
    const arquivo = path.join(raiz, ...caminho('entradas.json'));
    const original = fs.readFileSync(arquivo, 'utf8');
    // texto adulterado (hash deixa de conferir)
    const adulterado = JSON.parse(original);
    adulterado.entradas[0].texto += ' alterado';
    fs.writeFileSync(arquivo, JSON.stringify(adulterado));
    assert.ok(validarServicos(raiz).erros.some((e) => /hash não confere/.test(e)));
    assert.ok(!validarServicos(raiz).erros.join('|').includes('alterado'));
    // entrada órfã (fonte removida)
    fs.writeFileSync(arquivo, original);
    const fontesArquivo = path.join(raiz, ...caminho('fontes.json'));
    const fontesOriginal = fs.readFileSync(fontesArquivo, 'utf8');
    const fontes = JSON.parse(fontesOriginal);
    fontes.fontes.pop();
    fs.writeFileSync(fontesArquivo, JSON.stringify(fontes));
    assert.ok(validarServicos(raiz).erros.some((e) => /não existe em fontes.json/.test(e)));
    // fonte textual sem entrada
    fs.writeFileSync(fontesArquivo, fontesOriginal);
    fs.writeFileSync(arquivo, JSON.stringify({ servicoId: 'lac', entradas: [] }));
    assert.ok(validarServicos(raiz).erros.some((e) => /sem entrada correspondente/.test(e)));
    // arquivo ausente com a chave no manifesto
    fs.rmSync(arquivo);
    assert.ok(validarServicos(raiz).erros.some((e) => /arquivo não encontrado: .*entradas.json/.test(e)));
    // caminho errado no manifesto
    fs.writeFileSync(arquivo, original);
    const manifesto = path.join(raiz, ...caminho('versao.json'));
    const m = JSON.parse(fs.readFileSync(manifesto, 'utf8'));
    m.arquivos.entradas = 'services/lac/versoes/v1/outro.json';
    fs.writeFileSync(manifesto, JSON.stringify(m));
    assert.ok(validarServicos(raiz).erros.some((e) => /arquivos.entradas deve ser/.test(e)));
  });
});

test('G11. uma gravação por vez: a segunda, durante a primeira, é recusada com operacao_em_andamento', async () => {
  await comCopia(async ({ raiz }) => {
    let liberar;
    const espera = new Promise((res) => { liberar = res; });
    const g = criarGravadorEntradas({ raiz, agora: AGORA, antesDeGravar: () => espera });
    const primeira = g.gravarEntradaTexto('lac', CORPO, { ator: MARIA });
    const segunda = await g.gravarEntradaTexto('lac', { titulo: 'Outra', texto: 'outra' }, { ator: MARIA });
    assert.deepEqual([segunda.ok, segunda.status, segunda.erro], [false, 409, 'operacao_em_andamento']);
    liberar();
    assert.equal((await primeira).ok, true);
    assert.equal(lerJson(raiz, ...caminho('entradas.json')).entradas.length, 1);
  });
});

test('G12. a base real da LAC não foi alterada por nenhum teste deste arquivo', () => {
  assert.deepEqual(retrato(RAIZ), RETRATO_REAL_ANTES);
  assert.equal(fs.existsSync(path.join(RAIZ, ...caminho('entradas.json'))), false);
  assert.equal('entradas' in lerJson(RAIZ, ...caminho('versao.json')).arquivos, false);
});

test('G13. desfazer incompleto: erro distinto (desfazer_incompleto), sem texto nem caminho na resposta', async () => {
  await comCopia(async ({ raiz }) => {
    let falhou = false;
    const sistema = {
      ...fs,
      renameSync(origem, destino) {
        const d = String(destino);
        if (d.endsWith('versao.json')) { falhou = true; throw new Error('falha injetada'); }
        if (falhou && d.endsWith('fontes.json')) throw new Error('falha injetada no desfazer');
        return fs.renameSync(origem, destino);
      },
    };
    const r = await criarGravadorEntradas({ raiz, sistema, agora: AGORA }).gravarEntradaTexto('lac', CORPO, { ator: MARIA });
    assert.deepEqual(r, { ok: false, status: 500, erro: 'desfazer_incompleto' });
    assert.ok(!JSON.stringify(r).includes('Segunda linha'));
    assert.equal(fs.existsSync(path.join(raiz, ...caminho('entradas.json'))), false);
  });
});

test('G14. duas instâncias do gravador têm travas independentes (por isso a rota deve usar a trava comum das escritas)', async () => {
  await comCopia(async ({ raiz }) => {
    let liberar;
    const espera = new Promise((res) => { liberar = res; });
    const a = criarGravadorEntradas({ raiz, agora: AGORA, antesDeGravar: () => espera });
    const b = criarGravadorEntradas({ raiz, agora: AGORA });
    const primeira = a.gravarEntradaTexto('lac', CORPO, { ator: MARIA });
    const segunda = await b.gravarEntradaTexto('lac', { titulo: 'Outra', texto: 'outra' }, { ator: MARIA });
    assert.equal(segunda.ok, true, 'a trava é por instância: a segunda instância não é bloqueada');
    liberar();
    const r = await primeira;
    // A primeira lê o estado só depois da espera, então enxerga a segunda gravação e não corrompe a base.
    assert.equal(r.ok, true);
    assert.equal(lerJson(raiz, ...caminho('entradas.json')).entradas.length, 2);
    assert.deepEqual(validarServicos(raiz).erros, []);
  });
});
