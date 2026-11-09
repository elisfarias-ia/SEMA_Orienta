// Armazenamento local seguro (Marco 7, Passo 7C1). Todos os testes usam diretórios temporários FORA do repositório
// e dados fictícios. Nada é criado dentro do repositório.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { criarArmazenamento, formatarJson, formatarLinhaJsonl, TAMANHO_MAXIMO } from '../services/admin/armazenamento.js';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lerTexto = (...p) => fs.readFileSync(path.join(RAIZ, ...p), 'utf8');
const aceita = () => [];
const rejeita = () => ['dado fictício recusado'];

/** Cria uma raiz temporária e outra "de fora" (vizinha), e remove tudo ao final. */
function comRaiz(fn, opcoes = {}) {
  const pai = fs.mkdtempSync(path.join(os.tmpdir(), 'sema-orienta-armazenamento-'));
  const raiz = path.join(pai, 'raiz');
  const fora = path.join(pai, 'fora');
  fs.mkdirSync(raiz);
  fs.mkdirSync(fora);
  try {
    const arm = criarArmazenamento({ raiz, ...opcoes });
    return fn({ arm, raiz, fora, pai });
  } finally {
    fs.rmSync(pai, { recursive: true, force: true });
  }
}
const arquivos = (dir) => fs.readdirSync(dir).sort();
const sistemaCom = (substituicoes) => ({ ...fs, ...substituicoes });

// ---------- Raiz ----------

test('S1. a raiz é obrigatória, explícita, absoluta e existente (diretório)', () => {
  assert.equal(criarArmazenamento().erro, 'raiz_invalida');
  assert.equal(criarArmazenamento({}).erro, 'raiz_invalida');
  for (const raiz of ['', 'relativo/dir', '.', '..', null, 42, 'C:\0x', path.join(os.tmpdir(), 'sema-orienta-nao-existe-xyz')]) {
    assert.equal(criarArmazenamento({ raiz }).erro, 'raiz_invalida', String(raiz));
  }
  comRaiz(({ raiz }) => {
    const arquivo = path.join(raiz, 'arquivo.json');
    fs.writeFileSync(arquivo, '{}');
    assert.equal(criarArmazenamento({ raiz: arquivo }).erro, 'raiz_invalida');
    assert.equal(typeof criarArmazenamento({ raiz }).lerJson, 'function');
  });
});

test('S2. os testes usam diretório temporário fora do repositório', () => {
  comRaiz(({ pai }) => {
    const rel = path.relative(RAIZ, pai);
    assert.ok(rel.startsWith('..') || path.isAbsolute(rel), pai);
  });
  assert.equal(fs.existsSync(path.join(RAIZ, 'data')), false);
});

// ---------- Formato ----------

test('S3. gravar e ler JSON: UTF-8, chaves ordenadas, 2 espaços e quebra de linha final, de forma determinística', () => {
  comRaiz(({ arm, raiz }) => {
    const dados = { z: 1, a: { y: 'Licença fictícia', x: [3, 2, 1] } };
    assert.deepEqual(arm.gravarJson('exemplo.json', dados, aceita), { ok: true, bytes: Buffer.byteLength(formatarJson(dados)) });
    const texto = fs.readFileSync(path.join(raiz, 'exemplo.json'), 'utf8');
    assert.equal(texto, '{\n  "a": {\n    "x": [\n      3,\n      2,\n      1\n    ],\n    "y": "Licença fictícia"\n  },\n  "z": 1\n}\n');
    assert.ok(texto.endsWith('\n') && !texto.endsWith('\n\n'));
    assert.ok(fs.readFileSync(path.join(raiz, 'exemplo.json')).includes(Buffer.from('Licença', 'utf8')));
    assert.deepEqual(arm.lerJson('exemplo.json'), { ok: true, dados });
    // Mesmo conteúdo, ordem de chaves diferente: bytes idênticos.
    const antes = fs.readFileSync(path.join(raiz, 'exemplo.json'));
    arm.gravarJson('exemplo.json', { a: { x: [3, 2, 1], y: 'Licença fictícia' }, z: 1 }, aceita);
    assert.ok(antes.equals(fs.readFileSync(path.join(raiz, 'exemplo.json'))));
  });
});

test('S4. formatos auxiliares são determinísticos e rejeitam valores que não são JSON', () => {
  assert.equal(formatarLinhaJsonl({ b: 1, a: 'x' }), '{"a":"x","b":1}\n');
  assert.equal(formatarLinhaJsonl({ a: 'linha1\nlinha2' }).split('\n').length, 2, 'quebras dentro de texto são escapadas');
  assert.throws(() => formatarJson({ a: undefined }), TypeError);
  assert.throws(() => formatarLinhaJsonl(NaN), TypeError);
});

// ---------- Caminhos ----------

test('S5. caminhos perigosos são recusados em todas as operações e nada é criado fora da raiz', () => {
  comRaiz(({ arm, raiz, fora, pai }) => {
    const perigosos = [
      '/etc/dado.json', 'C:/dado.json', 'C:\\dado.json', '\\\\servidor\\dado.json', '../fora/dado.json', 'a/../../fora/dado.json',
      '..', '.', 'a/./b.json', 'a//b.json', 'a\\b.json', 'dado\0.json', '', ' ', '.oculto.json', 'a/.oculto.json', 'dado.json:fluxo.json',
      'a'.repeat(300) + '.json', 'nome com espaço.json', 'dado..json', 'dado.json.', '/', '../', 'fora/../../dado.json',
    ];
    for (const rel of perigosos) {
      assert.equal(arm.lerJson(rel).erro, 'caminho_invalido', `lerJson ${JSON.stringify(rel)}`);
      assert.equal(arm.gravarJson(rel, { a: 1 }, aceita).erro, 'caminho_invalido', `gravarJson ${JSON.stringify(rel)}`);
      assert.equal(arm.listarJsonl(rel.replace(/\.json/, '.jsonl')).erro === undefined, false, `listar ${JSON.stringify(rel)}`);
      assert.equal(arm.acrescentarJsonl(rel.replace(/\.json/, '.jsonl'), { id: 'a-1' }, aceita).ok, false);
    }
    for (const rel of [undefined, null, 1, {}, [], true]) {
      assert.equal(arm.lerJson(rel).erro, 'caminho_invalido');
      assert.equal(arm.gravarJson(rel, { a: 1 }, aceita).erro, 'caminho_invalido');
    }
    assert.deepEqual(arquivos(raiz), []);
    assert.deepEqual(arquivos(fora), []);
    assert.deepEqual(arquivos(pai), ['fora', 'raiz']);
  });
});

test('S6. só são aceitas as extensões .json (JSON) e .jsonl (histórico)', () => {
  comRaiz(({ arm, raiz }) => {
    for (const rel of ['a.txt', 'a.js', 'a.json.txt', 'a.JSON', 'a.jsonl', 'a', 'a.json5', 'a.exe']) {
      assert.equal(arm.gravarJson(rel, { a: 1 }, aceita).erro, 'extensao_nao_permitida', rel);
      assert.equal(arm.lerJson(rel).erro, 'extensao_nao_permitida', rel);
    }
    for (const rel of ['a.json', 'a.txt', 'a.JSONL', 'a']) {
      assert.equal(arm.acrescentarJsonl(rel, { id: 'a-1' }, aceita).erro, 'extensao_nao_permitida', rel);
      assert.equal(arm.listarJsonl(rel).erro, 'extensao_nao_permitida', rel);
    }
    assert.deepEqual(arquivos(raiz), []);
  });
});

test('S7. subdiretórios dentro da raiz são criados somente depois da validação dos dados', () => {
  comRaiz(({ arm, raiz }) => {
    assert.equal(arm.gravarJson('a/b/c.json', { a: 1 }, rejeita).erro, 'dados_invalidos');
    assert.deepEqual(arquivos(raiz), [], 'dado inválido não cria diretórios');
    assert.equal(arm.gravarJson('a/b/c.json', { a: 1 }, aceita).ok, true);
    assert.deepEqual(arm.lerJson('a/b/c.json'), { ok: true, dados: { a: 1 } });
    assert.equal(arm.acrescentarJsonl('h/i/historico.jsonl', { id: 'x-1' }, aceita).ok, true);
  });
});

// ---------- Links simbólicos ----------

test('S8. diretório que é link simbólico (ou junção) é recusado e o destino fora da raiz não é tocado', () => {
  comRaiz(({ arm, raiz, fora }) => {
    fs.writeFileSync(path.join(fora, 'segredo.json'), '{"segredo":"fictício"}\n');
    fs.symlinkSync(fora, path.join(raiz, 'atalho'), 'junction');
    assert.equal(arm.lerJson('atalho/segredo.json').erro, 'link_simbolico');
    assert.equal(arm.gravarJson('atalho/novo.json', { a: 1 }, aceita).erro, 'link_simbolico');
    assert.equal(arm.gravarJson('atalho/segredo.json', { a: 1 }, aceita).erro, 'link_simbolico');
    assert.equal(arm.acrescentarJsonl('atalho/h.jsonl', { id: 'x-1' }, aceita).erro, 'link_simbolico');
    assert.equal(arm.listarJsonl('atalho/h.jsonl').erro, 'link_simbolico');
    assert.deepEqual(arquivos(fora), ['segredo.json']);
    assert.equal(fs.readFileSync(path.join(fora, 'segredo.json'), 'utf8'), '{"segredo":"fictício"}\n');
  });
});

test('S9. arquivo que é link simbólico é recusado (ignorado quando o sistema não permite criar o link)', (t) => {
  comRaiz(({ arm, raiz, fora }) => {
    fs.writeFileSync(path.join(fora, 'alvo.json'), '{"alvo":1}\n');
    try {
      fs.symlinkSync(path.join(fora, 'alvo.json'), path.join(raiz, 'link.json'), 'file');
    } catch {
      t.skip('sem permissão para criar link simbólico de arquivo neste sistema');
      return;
    }
    assert.equal(arm.lerJson('link.json').erro, 'link_simbolico');
    assert.equal(arm.gravarJson('link.json', { a: 1 }, aceita).erro, 'link_simbolico');
    assert.equal(fs.readFileSync(path.join(fora, 'alvo.json'), 'utf8'), '{"alvo":1}\n');
  });
});

test('S9b. arquivo que o sistema informa como link simbólico é recusado (simulado, sem precisar de permissão para criar links)', () => {
  const sistema = sistemaCom({
    lstatSync: (p, ...r) => (path.basename(p) === 'link.json'
      ? { isSymbolicLink: () => true, isDirectory: () => false, isFile: () => false, size: 0 }
      : fs.lstatSync(p, ...r)),
  });
  comRaiz(({ arm, raiz }) => {
    assert.equal(arm.lerJson('link.json').erro, 'link_simbolico');
    assert.equal(arm.gravarJson('link.json', { a: 1 }, aceita).erro, 'link_simbolico');
    assert.deepEqual(arquivos(raiz), []);
  }, { sistema });
});

test('S10. se o caminho do arquivo for um diretório, a operação é recusada', () => {
  comRaiz(({ arm, raiz }) => {
    fs.mkdirSync(path.join(raiz, 'pasta.json'));
    assert.equal(arm.lerJson('pasta.json').erro, 'caminho_invalido');
    assert.equal(arm.gravarJson('pasta.json', { a: 1 }, aceita).erro, 'caminho_invalido');
    fs.writeFileSync(path.join(raiz, 'arquivo'), 'x');
    assert.equal(arm.gravarJson('arquivo/dado.json', { a: 1 }, aceita).erro, 'caminho_invalido');
  });
});

// ---------- Validação antes de gravar ----------

test('S11. os dados são validados pela função do chamador antes de gravar; sem função, não grava', () => {
  comRaiz(({ arm, raiz }) => {
    let recebido = null;
    assert.equal(arm.gravarJson('a.json', { a: 1 }, (d) => { recebido = d; return []; }).ok, true);
    assert.deepEqual(recebido, { a: 1 });
    const r = arm.gravarJson('b.json', { a: 1 }, rejeita);
    assert.equal(r.erro, 'dados_invalidos');
    assert.deepEqual(r.detalhes, ['dado fictício recusado']);
    for (const validar of [undefined, null, 'x', {}, 1]) {
      assert.equal(arm.gravarJson('c.json', { a: 1 }, validar).erro, 'validador_obrigatorio');
      assert.equal(arm.acrescentarJsonl('c.jsonl', { id: 'a-1' }, validar).erro, 'validador_obrigatorio');
    }
    assert.equal(arm.gravarJson('d.json', { a: 1 }, () => { throw new Error('/caminho/secreto'); }).erro, 'dados_invalidos');
    assert.equal(arm.gravarJson('e.json', { a: 1 }, () => 'ok').erro, 'dados_invalidos', 'o validador deve devolver uma lista');
    assert.equal(arm.gravarJson('f.json', { a: 1 }, () => undefined).erro, 'dados_invalidos');
    assert.deepEqual(arquivos(raiz), ['a.json']);
  });
});

test('S12. valores que não são JSON e arquivos grandes demais são recusados antes de gravar', () => {
  comRaiz(({ arm, raiz }) => {
    for (const dados of [undefined, NaN, () => 1, { a: undefined }, new Date(0), new Map()]) {
      assert.equal(arm.gravarJson('a.json', dados, aceita).erro, 'dados_invalidos');
    }
    assert.equal(arm.gravarJson('grande.json', { t: 'a'.repeat(TAMANHO_MAXIMO) }, aceita).erro, 'arquivo_grande_demais');
    assert.deepEqual(arquivos(raiz), []);
  });
});

// ---------- Escrita atômica ----------

test('S13. a escrita usa temporário no mesmo diretório e só renomeia depois de gravar, sincronizar e fechar', () => {
  const eventos = [];
  const sistema = sistemaCom({
    openSync: (p, ...r) => { eventos.push(['open', p]); return fs.openSync(p, ...r); },
    writeSync: (...a) => { eventos.push(['write']); return fs.writeSync(...a); },
    fsyncSync: (...a) => { eventos.push(['fsync']); return fs.fsyncSync(...a); },
    closeSync: (...a) => { eventos.push(['close']); return fs.closeSync(...a); },
    renameSync: (de, para) => { eventos.push(['rename', de, para]); return fs.renameSync(de, para); },
  });
  comRaiz(({ arm, raiz }) => {
    assert.equal(arm.gravarJson('sub-a.json', { a: 1 }, aceita).ok, true);
    const abriu = eventos.find((e) => e[0] === 'open');
    const renomeou = eventos.find((e) => e[0] === 'rename');
    assert.equal(path.dirname(abriu[1]), path.dirname(renomeou[2]), 'temporário no mesmo diretório do destino');
    assert.equal(renomeou[1], abriu[1]);
    assert.deepEqual(eventos.map((e) => e[0]), ['open', 'write', 'fsync', 'close', 'rename']);
    assert.deepEqual(arquivos(raiz), ['sub-a.json'], 'nenhum temporário sobra');
  }, { sistema });
});

test('S14. se a renomeação falhar, o arquivo anterior é preservado e o temporário é removido', () => {
  const sistema = sistemaCom({ renameSync: () => { throw new Error('/caminho/secreto/falha'); } });
  comRaiz(({ arm, raiz }) => {
    const antes = 'conteúdo anterior fictício\n';
    fs.writeFileSync(path.join(raiz, 'a.json'), antes);
    const r = arm.gravarJson('a.json', { novo: 1 }, aceita);
    assert.deepEqual(r, { ok: false, erro: 'falha_de_escrita' });
    assert.equal(JSON.stringify(r).includes('secreto'), false);
    assert.equal(fs.readFileSync(path.join(raiz, 'a.json'), 'utf8'), antes);
    assert.deepEqual(arquivos(raiz), ['a.json']);
  }, { sistema });
});

test('S15. se a gravação falhar no meio, o arquivo anterior é preservado e nenhum temporário sobra', () => {
  for (const etapa of ['writeSync', 'fsyncSync', 'openSync']) {
    const sistema = sistemaCom({ [etapa]: (...a) => { if (etapa === 'openSync') throw new Error('falha'); fs.closeSync(a[0]); throw new Error('falha'); } });
    comRaiz(({ arm, raiz }) => {
      fs.writeFileSync(path.join(raiz, 'a.json'), '{"anterior":true}\n');
      assert.equal(arm.gravarJson('a.json', { novo: 1 }, aceita).erro, 'falha_de_escrita', etapa);
      assert.equal(fs.readFileSync(path.join(raiz, 'a.json'), 'utf8'), '{"anterior":true}\n', etapa);
      assert.deepEqual(arquivos(raiz), ['a.json'], etapa);
    }, { sistema });
  }
});

test('S16. falha ao acrescentar no JSONL também preserva o histórico anterior', () => {
  const sistema = sistemaCom({ renameSync: () => { throw new Error('falha'); } });
  comRaiz(({ arm, raiz }) => {
    const antes = formatarLinhaJsonl({ id: 'reg-1', t: 'a' });
    fs.writeFileSync(path.join(raiz, 'h.jsonl'), antes);
    assert.equal(arm.acrescentarJsonl('h.jsonl', { id: 'reg-2' }, aceita).erro, 'falha_de_escrita');
    assert.equal(fs.readFileSync(path.join(raiz, 'h.jsonl'), 'utf8'), antes);
    assert.deepEqual(arquivos(raiz), ['h.jsonl']);
  }, { sistema });
});

test('S17. regravar um arquivo existente o substitui por inteiro e não deixa temporários', () => {
  comRaiz(({ arm, raiz }) => {
    arm.gravarJson('a.json', { v: 1, longo: 'x'.repeat(500) }, aceita);
    arm.gravarJson('a.json', { v: 2 }, aceita);
    assert.deepEqual(arm.lerJson('a.json'), { ok: true, dados: { v: 2 } });
    assert.deepEqual(arquivos(raiz), ['a.json']);
  });
});

// ---------- JSONL ----------

test('S18. acrescentar JSONL: uma linha canônica por registro, ordem de inclusão, conteúdo anterior preservado byte a byte', () => {
  comRaiz(({ arm, raiz }) => {
    assert.deepEqual(arm.listarJsonl('historico.jsonl'), { ok: true, registros: [] });
    assert.equal(arm.acrescentarJsonl('historico.jsonl', { id: 'reg-1', z: 1, a: 'Ação fictícia' }, aceita).ok, true);
    const apos1 = fs.readFileSync(path.join(raiz, 'historico.jsonl'));
    assert.equal(apos1.toString('utf8'), '{"a":"Ação fictícia","id":"reg-1","z":1}\n');
    assert.equal(arm.acrescentarJsonl('historico.jsonl', { id: 'reg-2' }, aceita).ok, true);
    assert.equal(arm.acrescentarJsonl('historico.jsonl', { id: 'reg-3', n: 3 }, aceita).ok, true);
    const final = fs.readFileSync(path.join(raiz, 'historico.jsonl'));
    assert.ok(final.subarray(0, apos1.length).equals(apos1), 'o começo do arquivo não mudou');
    assert.deepEqual(arm.listarJsonl('historico.jsonl').registros.map((r) => r.id), ['reg-1', 'reg-2', 'reg-3']);
    assert.equal(final.toString('utf8').split('\n').length, 4);
    assert.deepEqual(arquivos(raiz), ['historico.jsonl']);
  });
});

test('S19. id duplicado no JSONL é recusado e o arquivo não muda', () => {
  comRaiz(({ arm, raiz }) => {
    arm.acrescentarJsonl('h.jsonl', { id: 'reg-1', t: 'original' }, aceita);
    const antes = fs.readFileSync(path.join(raiz, 'h.jsonl'));
    assert.equal(arm.acrescentarJsonl('h.jsonl', { id: 'reg-1', t: 'outro' }, aceita).erro, 'id_duplicado');
    assert.ok(antes.equals(fs.readFileSync(path.join(raiz, 'h.jsonl'))));
  });
});

test('S20. registro sem id válido, não objeto ou recusado pelo validador não é gravado', () => {
  comRaiz(({ arm, raiz }) => {
    for (const registro of [undefined, null, 'texto', [], { t: 1 }, { id: 5 }, { id: 'Reg 1' }, { id: '' }, { id: 'reg-1', f: () => 1 }]) {
      assert.equal(arm.acrescentarJsonl('h.jsonl', registro, aceita).ok, false, JSON.stringify(registro));
    }
    assert.equal(arm.acrescentarJsonl('h.jsonl', { id: 'reg-1' }, rejeita).erro, 'dados_invalidos');
    assert.deepEqual(arquivos(raiz), []);
  });
});

test('S21. JSONL corrompido é recusado na leitura e no acréscimo, sem alterar o arquivo', () => {
  const ruins = {
    'json-invalido': '{"id":"a-1"}\nnão é json\n',
    'sem-quebra-final': '{"id":"a-1"}',
    'linha-vazia': '{"id":"a-1"}\n\n{"id":"a-2"}\n',
    'id-duplicado': '{"id":"a-1"}\n{"id":"a-1"}\n',
    'lista': '[1,2]\n',
    'sem-id': '{"t":1}\n',
    'crlf': '{"id":"a-1"}\r\n',
  };
  for (const [nome, conteudo] of Object.entries(ruins)) {
    comRaiz(({ arm, raiz }) => {
      fs.writeFileSync(path.join(raiz, 'h.jsonl'), conteudo);
      assert.equal(arm.listarJsonl('h.jsonl').erro, 'jsonl_invalido', nome);
      assert.equal(arm.acrescentarJsonl('h.jsonl', { id: 'novo-1' }, aceita).erro, 'jsonl_invalido', nome);
      assert.equal(fs.readFileSync(path.join(raiz, 'h.jsonl'), 'utf8'), conteudo, nome);
    });
  }
});

// ---------- Leitura e erros ----------

test('S22. leitura: arquivo ausente, JSON inválido e arquivo grande; erros não vazam caminho nem conteúdo', () => {
  comRaiz(({ arm, raiz }) => {
    assert.equal(arm.lerJson('nao-existe.json').erro, 'nao_encontrado');
    assert.equal(arm.lerJson('a/nao-existe.json').erro, 'nao_encontrado');
    fs.writeFileSync(path.join(raiz, 'ruim.json'), '{ conteúdo-secreto-fictício');
    const r = arm.lerJson('ruim.json');
    assert.deepEqual(r, { ok: false, erro: 'json_invalido' });
    assert.equal(JSON.stringify(r).includes('secreto'), false);
    assert.equal(JSON.stringify(r).includes(raiz), false);
    fs.writeFileSync(path.join(raiz, 'grande.json'), 'x'.repeat(TAMANHO_MAXIMO + 1));
    assert.equal(arm.lerJson('grande.json').erro, 'arquivo_grande_demais');
  });
});

// ---------- Somente acréscimos, higiene, repositório ----------

test('S23. a interface oferece só ler, gravar JSON, listar e acrescentar: sem edição nem exclusão de histórico', () => {
  comRaiz(({ arm }) => {
    assert.deepEqual(Object.keys(arm).sort(), ['acrescentarJsonl', 'gravarJson', 'lerJson', 'listarJsonl', 'raiz']);
  });
  const codigo = lerTexto('services', 'admin', 'armazenamento.js');
  assert.doesNotMatch(codigo, /appendFile|writeFileSync|rmSync|rmdir|truncate|copyFile|chmod/);
  assert.equal((codigo.match(/unlinkSync/g) ?? []).length, 1, 'unlinkSync só para limpar o temporário');
});

test('S24. sem localStorage, rede, ambiente, relógio ou aleatoriedade; só node:fs, node:path e hash.js', () => {
  const codigo = lerTexto('services', 'admin', 'armazenamento.js');
  assert.doesNotMatch(codigo, /localStorage|sessionStorage|indexedDB|fetch\(|node:http|node:net|process\.env|Date\.now|new Date\(|Math\.random|randomUUID/);
  const imports = [...codigo.matchAll(/^import .* from '([^']+)'/gm)].map((m) => m[1]).sort();
  assert.deepEqual(imports, ['./hash.js', 'node:fs', 'node:path']);
});

test('S25. data/admin-private/ está no .gitignore e não existe nada criado nem versionado ali', () => {
  const linhas = lerTexto('.gitignore').split(/\r?\n/).map((l) => l.trim());
  assert.ok(linhas.includes('data/admin-private/'));
  assert.equal(fs.existsSync(path.join(RAIZ, 'data')), false);
});

test('S26. armazenamento e textos administrativos não aparecem no dist/ (quando dist/ existir)', { skip: !fs.existsSync(path.join(RAIZ, 'dist')) }, () => {
  const lista = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? lista(path.join(dir, e.name)) : [path.join(dir, e.name)]));
  for (const arquivo of lista(path.join(RAIZ, 'dist'))) {
    const texto = fs.readFileSync(arquivo, 'utf8');
    assert.doesNotMatch(texto, /armazenamento|admin-private|criarArmazenamento|acrescentarJsonl|gravarJson|services\/admin|hashConteudo/, arquivo);
  }
});
