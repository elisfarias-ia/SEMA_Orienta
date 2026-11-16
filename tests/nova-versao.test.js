// Passo 5A: nova versão real (services/admin/nova-versao.js) e a regra "publicada pode ser anterior à atual" do validador.
// SEMPRE em cópias temporárias fora do repositório, com dados fictícios; a LAC real é conferida (retrato antes/depois).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { congelarVersaoDoServico } from '../services/admin/congelamento.js';
import { criarGravadorEntradas } from '../services/admin/entradas-gravacao.js';
import { criarNovaVersaoDoServico, prepararConteudoDaNovaVersao } from '../services/admin/nova-versao.js';
import { conferirHashDaVersaoEmDisco, lerArquivosDaVersao } from '../services/admin/versao-arquivos.js';
import { validarServicos } from '../scripts/validate-services.js';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const AGORA = () => new Date(2026, 10, 16, 12, 0, 0);
const AGORA_2 = () => new Date(2026, 10, 17, 12, 0, 0);

function retrato(raiz) {
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
  andar(path.join(raiz, 'services'));
  return itens.sort();
}
const RETRATO_REAL_ANTES = retrato(RAIZ);
const retratoDaVersao = (raiz, n) => retrato(raiz).filter((l) => l.includes(`lac${path.sep}versoes${path.sep}v${n}${path.sep}`) || l.endsWith(`v${n}`));

async function comCopia(fn) {
  const pai = fs.mkdtempSync(path.join(os.tmpdir(), 'sema-orienta-nova-versao-'));
  const raiz = path.join(pai, 'raiz');
  fs.mkdirSync(raiz);
  fs.cpSync(path.join(RAIZ, 'services'), path.join(raiz, 'services'), { recursive: true });
  try {
    return await fn({ raiz, pai });
  } finally {
    fs.rmSync(pai, { recursive: true, force: true });
  }
}
const arq = (n, nome) => ['services', 'lac', 'versoes', `v${n}`, nome];
const lerJ = (raiz, ...p) => JSON.parse(fs.readFileSync(path.join(raiz, ...p), 'utf8'));
const gravarJ = (raiz, p, dados) => fs.writeFileSync(path.join(raiz, ...p), `${JSON.stringify(dados, null, 2)}\n`);
const registro = (raiz) => lerJ(raiz, 'services', 'registry.json');
const entradaLac = (raiz) => registro(raiz).servicos.find((s) => s.id === 'lac');

/** Versão 1 congelada e já com decisão material (validado_materialmente): é de onde se pode abrir uma nova versão. */
function v1Validada(raiz) {
  assert.equal(congelarVersaoDoServico({ raiz, servicoId: 'lac', agora: AGORA }).ok, true);
  const m = lerJ(raiz, ...arq(1, 'versao.json'));
  gravarJ(raiz, arq(1, 'versao.json'), { ...m, estado: 'validado_materialmente' });
}
/** Versão 1 publicada: serviço validado e publicado, hash calculado depois e estado publicado no manifesto e no registro. */
function v1Publicada(raiz) {
  const sv = lerJ(raiz, ...arq(1, 'service.json'));
  gravarJ(raiz, arq(1, 'service.json'), {
    ...sv, statusValidacao: 'validado', publicado: true, unidadeResponsavel: 'Unidade fictícia', responsavelValidacao: 'Responsável fictício',
    dataRevisao: '2026-11-10', links: ['sema-orientacoes-lac'], legislacao: [],
  });
  const fo = lerJ(raiz, ...arq(1, 'fontes.json'));
  fo.fontes.find((x) => x.id === 'sema-orientacoes-lac').publicado = true;
  gravarJ(raiz, arq(1, 'fontes.json'), fo);
  assert.equal(congelarVersaoDoServico({ raiz, servicoId: 'lac', agora: AGORA, verificarFinal: () => [] }).ok, true);
  const m = lerJ(raiz, ...arq(1, 'versao.json'));
  gravarJ(raiz, arq(1, 'versao.json'), { ...m, estado: 'publicado' });
  const r = registro(raiz);
  r.servicos = r.servicos.map((s) => (s.id === 'lac' ? { ...s, statusValidacao: 'validado', publicado: true, versaoPublicadaId: 'lac-v1' } : s));
  gravarJ(raiz, ['services', 'registry.json'], r);
  assert.deepEqual(validarServicos(raiz).erros, [], 'a versão 1 publicada de teste precisa ser válida');
}

test('N1. não abre nova versão a partir de rascunho nem de em_validacao', async () => {
  await comCopia(({ raiz }) => {
    const antes = retrato(raiz);
    assert.equal(criarNovaVersaoDoServico({ raiz, servicoId: 'lac', agora: AGORA }).erro, 'estado_nao_permite_nova_versao');
    assert.equal(congelarVersaoDoServico({ raiz, servicoId: 'lac', agora: AGORA }).ok, true);
    const depoisDeCongelar = retrato(raiz);
    assert.equal(criarNovaVersaoDoServico({ raiz, servicoId: 'lac', agora: AGORA }).erro, 'validacao_em_andamento');
    assert.deepEqual(retrato(raiz), depoisDeCongelar);
    assert.notDeepEqual(depoisDeCongelar, antes);
    assert.equal(criarNovaVersaoDoServico({ raiz, servicoId: 'nao-existe', agora: AGORA }).erro, 'servico_nao_encontrado');
  });
});

test('N2. nova versão: pasta nova, arquivos independentes com caminhos da própria pasta, atual atualizada e anterior intacta', async () => {
  await comCopia(({ raiz }) => {
    v1Validada(raiz);
    const v1Antes = retratoDaVersao(raiz, 1);
    const r = criarNovaVersaoDoServico({ raiz, servicoId: 'lac', agora: AGORA_2 });
    assert.deepEqual([r.ok, r.versaoId, r.numero, r.baseadaEm], [true, 'lac-v2', 2, 'lac-v1']);
    assert.deepEqual(retratoDaVersao(raiz, 1), v1Antes, 'a versão anterior fica byte a byte intacta');
    const m2 = lerJ(raiz, ...arq(2, 'versao.json'));
    assert.deepEqual([m2.id, m2.numero, m2.baseadaEm, m2.estado, m2.hashConteudo, m2.enviadaEm, m2.criadoEm], ['lac-v2', 2, 'lac-v1', 'rascunho', null, null, '2026-11-17']);
    for (const caminho of Object.values(m2.arquivos)) {
      assert.ok(caminho.startsWith('services/lac/versoes/v2/'), caminho);
      assert.equal(fs.existsSync(path.join(raiz, ...caminho.split('/'))), true, caminho);
    }
    // os caminhos internos do service.json também apontam para a pasta nova
    const s2 = lerJ(raiz, ...arq(2, 'service.json'));
    for (const caminho of Object.values(s2.arquivos)) assert.ok(caminho.startsWith('services/lac/versoes/v2/'), caminho);
    const reg = entradaLac(raiz);
    assert.deepEqual([reg.versaoAtualId, reg.arquivo, reg.versaoPublicadaId], ['lac-v2', 'services/lac/versoes/v2/service.json', null]);
    assert.deepEqual([reg.statusValidacao, reg.publicado], ['em_validacao', false]);
    assert.deepEqual(validarServicos(raiz).erros, []);
    // conteúdo copiado: mesmos ids e títulos de fontes
    const f1 = lerJ(raiz, ...arq(1, 'fontes.json')).fontes.map((f) => [f.id, f.titulo, f.url]);
    const f2 = lerJ(raiz, ...arq(2, 'fontes.json')).fontes.map((f) => [f.id, f.titulo, f.url]);
    assert.deepEqual(f2, f1);
    // independência: alterar a v2 não toca a v1, e a v1 continua conferindo o hash
    const fo = arq(2, 'fontes.json');
    const f = lerJ(raiz, ...fo);
    f.fontes[0].titulo = 'Alterada só na versão 2';
    gravarJ(raiz, fo, f);
    fs.appendFileSync(path.join(raiz, ...arq(2, 'roteiro.md')), '\nLinha só da v2.\n');
    assert.deepEqual(retratoDaVersao(raiz, 1), v1Antes);
    assert.deepEqual(conferirHashDaVersaoEmDisco({ raiz, servicoId: 'lac', versaoId: 'lac-v1' }).confere, true);
    // e o inverso: não há link nem referência entre as pastas
    assert.equal(fs.lstatSync(path.join(raiz, ...arq(2, 'fontes.json'))).isSymbolicLink(), false);
  });
});

test('N3. entradas.json é copiado, o hash da v1 o inclui e a v2 volta a rascunho sem hash; v1 intacta', async () => {
  await comCopia(async ({ raiz }) => {
    const g = await criarGravadorEntradas({ raiz, agora: AGORA }).gravarEntradaTexto('lac', { titulo: 'Orientação fictícia', texto: 'Texto fictício da versão um.' });
    assert.equal(g.ok, true);
    v1Validada(raiz);
    const hashV1 = lerJ(raiz, ...arq(1, 'versao.json')).hashConteudo;
    const v1Antes = retratoDaVersao(raiz, 1);
    const r = criarNovaVersaoDoServico({ raiz, servicoId: 'lac', agora: AGORA_2 });
    assert.equal(r.ok, true);
    const e1 = lerJ(raiz, ...arq(1, 'entradas.json'));
    const e2 = lerJ(raiz, ...arq(2, 'entradas.json'));
    assert.deepEqual(e2, e1);
    assert.equal(lerJ(raiz, ...arq(2, 'versao.json')).arquivos.entradas, 'services/lac/versoes/v2/entradas.json');
    assert.notEqual(path.join(raiz, ...arq(2, 'entradas.json')), path.join(raiz, ...arq(1, 'entradas.json')));
    const fonteTexto = lerJ(raiz, ...arq(2, 'fontes.json')).fontes.find((f) => f.formaEntrada === 'texto');
    assert.deepEqual([fonteTexto.statusValidacao, fonteTexto.publicado], ['rascunho', false]);
    assert.deepEqual(retratoDaVersao(raiz, 1), v1Antes);
    assert.equal(conferirHashDaVersaoEmDisco({ raiz, servicoId: 'lac', versaoId: 'lac-v1' }).hashGravado, hashV1);
    // alterar a entrada na v2 não muda a v1
    e2.entradas[0].texto = 'Texto alterado só na versão 2.';
    gravarJ(raiz, arq(2, 'entradas.json'), e2);
    assert.deepEqual(lerJ(raiz, ...arq(1, 'entradas.json')), e1);
    assert.deepEqual(conferirHashDaVersaoEmDisco({ raiz, servicoId: 'lac', versaoId: 'lac-v1' }).confere, true);
  });
});

test('N4. com a v1 publicada: a v2 nasce em rascunho, versaoPublicadaId continua na v1 e a base é válida', async () => {
  await comCopia(({ raiz }) => {
    v1Publicada(raiz);
    const v1Antes = retratoDaVersao(raiz, 1);
    const r = criarNovaVersaoDoServico({ raiz, servicoId: 'lac', agora: AGORA_2 });
    assert.deepEqual([r.ok, r.versaoId], [true, 'lac-v2']);
    const reg = entradaLac(raiz);
    assert.deepEqual([reg.versaoAtualId, reg.versaoPublicadaId, reg.publicado, reg.statusValidacao], ['lac-v2', 'lac-v1', true, 'validado']);
    assert.deepEqual(retratoDaVersao(raiz, 1), v1Antes, 'a versão publicada fica intacta');
    const m1 = lerJ(raiz, ...arq(1, 'versao.json'));
    assert.deepEqual([m1.estado, conferirHashDaVersaoEmDisco({ raiz, servicoId: 'lac', versaoId: 'lac-v1' }).confere], ['publicado', true]);
    const m2 = lerJ(raiz, ...arq(2, 'versao.json'));
    assert.deepEqual([m2.estado, m2.hashConteudo, m2.enviadaEm], ['rascunho', null, null]);
    const s2 = lerJ(raiz, ...arq(2, 'service.json'));
    assert.deepEqual([s2.statusValidacao, s2.publicado], ['em_validacao', false]);
    assert.ok(lerJ(raiz, ...arq(2, 'fontes.json')).fontes.every((f) => f.statusValidacao !== 'validado' && f.publicado === false));
    assert.ok(lerJ(raiz, ...arq(2, 'documentos.json')).documentos.every((d) => d.statusValidacao !== 'validado' && d.publicado === false && d.revisaoAtualidade === 'pendente'));
    assert.ok(lerJ(raiz, ...arq(2, 'conteudo-assistente.json')).blocos.every((b) => b.publicado === false));
    assert.deepEqual(validarServicos(raiz).erros, []);
    // não se abre outra nova versão a partir de um rascunho
    assert.equal(criarNovaVersaoDoServico({ raiz, servicoId: 'lac', agora: AGORA_2 }).erro, 'estado_nao_permite_nova_versao');
  });
});

test('N5. a versão seguinte numera por max+1 e baseia-se na atual (v2 revisada gera a v3)', async () => {
  await comCopia(({ raiz }) => {
    v1Validada(raiz);
    assert.equal(criarNovaVersaoDoServico({ raiz, servicoId: 'lac', agora: AGORA }).ok, true);
    assert.equal(congelarVersaoDoServico({ raiz, servicoId: 'lac', agora: AGORA_2 }).ok, true);
    const m2 = lerJ(raiz, ...arq(2, 'versao.json'));
    gravarJ(raiz, arq(2, 'versao.json'), { ...m2, estado: 'validado_materialmente' });
    const r = criarNovaVersaoDoServico({ raiz, servicoId: 'lac', agora: AGORA_2 });
    assert.deepEqual([r.ok, r.versaoId, r.numero, r.baseadaEm], [true, 'lac-v3', 3, 'lac-v2']);
    assert.deepEqual(validarServicos(raiz).erros, []);
    assert.equal(entradaLac(raiz).versaoAtualId, 'lac-v3');
  });
});

test('N6. rollback em cada ponto de gravação: base idêntica à de antes e nenhuma pasta nova', async () => {
  await comCopia(({ raiz }) => {
    v1Validada(raiz);
    const antes = retrato(raiz);
    let total = 0;
    const contar = { ...fs, renameSync(o, d) { total += 1; return fs.renameSync(o, d); } };
    // ensaio de contagem com recusa final: conta quantas gravações atômicas a operação faz
    const ensaio = criarNovaVersaoDoServico({ raiz, sistema: contar, servicoId: 'lac', agora: AGORA_2, verificarFinal: () => ['recusado'] });
    assert.deepEqual([ensaio.ok, ensaio.erro, ensaio.revertido], [false, 'verificacao_recusada', true]);
    assert.deepEqual(retrato(raiz), antes);
    // 8 gravações (6 arquivos, manifesto e registro) mais a restauração do registro feita pelo próprio desfazer.
    assert.equal(total, 9, `gravações atômicas contadas: ${total}`);
    for (let k = 1; k <= total - 1; k += 1) {
      let n = 0;
      const sistema = {
        ...fs,
        renameSync(o, d) {
          n += 1;
          if (n === k) throw new Error('falha injetada');
          return fs.renameSync(o, d);
        },
      };
      const r = criarNovaVersaoDoServico({ raiz, sistema, servicoId: 'lac', agora: AGORA_2 });
      assert.deepEqual([r.ok, r.erro, r.revertido], [false, 'falha_de_escrita', true], `falha no ponto ${k}`);
      assert.deepEqual(retrato(raiz), antes, `base alterada após falha no ponto ${k}`);
      assert.equal(fs.existsSync(path.join(raiz, 'services', 'lac', 'versoes', 'v2')), false, `pasta v2 sobrou no ponto ${k}`);
      assert.equal(entradaLac(raiz).versaoAtualId, 'lac-v1');
    }
    // sem falhas, a operação funciona na mesma base
    assert.equal(criarNovaVersaoDoServico({ raiz, servicoId: 'lac', agora: AGORA_2 }).ok, true);
  });
});

test('N7. com a v1 publicada, falha na criação da v2 mantém a publicada ativa e a base igual', async () => {
  await comCopia(({ raiz }) => {
    v1Publicada(raiz);
    const antes = retrato(raiz);
    const sistema = { ...fs, renameSync(o, d) { if (String(d).endsWith('registry.json')) throw new Error('falha injetada'); return fs.renameSync(o, d); } };
    const r = criarNovaVersaoDoServico({ raiz, sistema, servicoId: 'lac', agora: AGORA_2 });
    assert.deepEqual([r.ok, r.revertido], [false, true]);
    assert.deepEqual(retrato(raiz), antes);
    const reg = entradaLac(raiz);
    assert.deepEqual([reg.versaoAtualId, reg.versaoPublicadaId], ['lac-v1', 'lac-v1']);
    assert.deepEqual(validarServicos(raiz).erros, []);
  });
});

test('N8. pasta de versão estranha ou manifesto anterior inválido impede a criação, sem alterar nada', async () => {
  await comCopia(({ raiz }) => {
    v1Validada(raiz);
    fs.mkdirSync(path.join(raiz, 'services', 'lac', 'versoes', 'rascunho-solto'));
    const antes = retrato(raiz);
    assert.equal(criarNovaVersaoDoServico({ raiz, servicoId: 'lac', agora: AGORA_2 }).erro, 'versoes_invalidas');
    assert.deepEqual(retrato(raiz), antes);
  });
  await comCopia(({ raiz }) => {
    v1Validada(raiz);
    const m = lerJ(raiz, ...arq(1, 'versao.json'));
    gravarJ(raiz, arq(1, 'versao.json'), { ...m, arquivos: { ...m.arquivos, fontes: '../fora/fontes.json' } });
    const antes = retrato(raiz);
    assert.ok(['caminho_fora_da_versao', 'manifesto_incoerente'].includes(criarNovaVersaoDoServico({ raiz, servicoId: 'lac', agora: AGORA_2 }).erro));
    assert.deepEqual(retrato(raiz), antes);
  });
});

test('N9. validador: publicada anterior precisa existir, estar publicada, ter hash coerente e ser anterior; pastas futuras são erro', async () => {
  await comCopia(({ raiz }) => {
    v1Publicada(raiz);
    assert.equal(criarNovaVersaoDoServico({ raiz, servicoId: 'lac', agora: AGORA_2 }).ok, true);
    const erros = () => validarServicos(raiz).erros;
    assert.deepEqual(erros(), []);
    // v1 deixa de ser "publicada" no manifesto
    const m1 = lerJ(raiz, ...arq(1, 'versao.json'));
    gravarJ(raiz, arq(1, 'versao.json'), { ...m1, estado: 'validado_materialmente' });
    assert.ok(erros().some((e) => e.includes('versaoPublicadaId só pode apontar para uma versão em estado publicado')));
    gravarJ(raiz, arq(1, 'versao.json'), m1);
    assert.deepEqual(erros(), []);
    // conteúdo da v1 alterado depois de publicada: hash não confere
    fs.appendFileSync(path.join(raiz, ...arq(1, 'roteiro.md')), '\nalterado\n');
    assert.ok(erros().some((e) => e.includes('lac-v1') && e.includes('não confere')));
    fs.rmSync(path.join(raiz, 'services', 'lac', 'versoes', 'v1'), { recursive: true });
    assert.ok(erros().length > 0, 'versaoPublicadaId apontando para pasta inexistente');
  });
  await comCopia(({ raiz }) => {
    fs.cpSync(path.join(raiz, 'services', 'lac', 'versoes', 'v1'), path.join(raiz, 'services', 'lac', 'versoes', 'v2'), { recursive: true });
    assert.ok(validarServicos(raiz).erros.some((e) => e.includes('pasta de versão não registrada')), 'pasta futura (maior que a atual) é erro');
  });
});

test('N10. função pura: conteúdo da nova versão sem modificar a entrada, com reinício e caminhos novos', async () => {
  const lida = lerArquivosDaVersao({ raiz: RAIZ, servicoId: 'lac', versaoId: 'lac-v1' });
  const entrada = structuredClone(lida.arquivos);
  const r = prepararConteudoDaNovaVersao(lida.arquivos, { servicoId: 'lac', pastaNova: 'services/lac/versoes/v2', data: '2026-11-17' });
  assert.equal(r.ok, true);
  assert.deepEqual(lida.arquivos, entrada);
  assert.equal(r.arquivos.service.arquivos.fontes, 'services/lac/versoes/v2/fontes.json');
  assert.equal(r.arquivos.service.publicado, false);
  assert.equal(r.arquivos.roteiro, lida.arquivos.roteiro, 'o roteiro não é normalizado nem reescrito na cópia');
  r.arquivos.fontes.fontes[0].titulo = 'mudou';
  assert.notEqual(lida.arquivos.fontes.fontes[0].titulo, 'mudou');
  assert.equal(prepararConteudoDaNovaVersao(lida.arquivos, { servicoId: 'lac', pastaNova: 'services/lac/versoes/v2', data: 'ontem' }).erro, 'conteudo_invalido');
  assert.equal(prepararConteudoDaNovaVersao(null, {}).erro, 'conteudo_invalido');
});

test('N12. o roteiro.md é copiado byte a byte: CRLF, LF, com e sem quebra final, espaços finais e linhas vazias', async () => {
  const base = fs.readFileSync(path.join(RAIZ, ...arq(1, 'roteiro.md')), 'utf8').split('\r\n').join('\n').replace(/\n+$/, '');
  const comCrlf = (t) => t.split('\n').join('\r\n');
  const variantes = {
    'LF com quebra final': `${base}\n`,
    'LF sem quebra final': base,
    'CRLF com quebra final': comCrlf(`${base}\n`),
    'CRLF sem quebra final': comCrlf(base),
    'espaços finais na última linha': `${base}   \n`,
    'espaços finais em todas as linhas': `${base}\n`.split('\n').map((l) => (l === '' ? l : `${l}  `)).join('\n'),
    'linhas vazias no fim': `${base}\n\n\n`,
    'linhas vazias no fim com CRLF': comCrlf(`${base}\n\n\n`),
    'mistura de CRLF, CR e LF': `${base}\n`.split('\n').map((l, i) => l + ['\r\n', '\r', '\n'][i % 3]).join(''),
    'espaço no começo e tabulação final': ` ${base}\t\n`,
  };
  for (const [nome, texto] of Object.entries(variantes)) {
    await comCopia(({ raiz }) => {
      const origem = Buffer.from(texto, 'utf8');
      fs.writeFileSync(path.join(raiz, ...arq(1, 'roteiro.md')), origem);
      v1Validada(raiz);
      const r = criarNovaVersaoDoServico({ raiz, servicoId: 'lac', agora: AGORA_2 });
      assert.equal(r.ok, true, `${nome}: ${JSON.stringify(r)}`);
      const v1 = fs.readFileSync(path.join(raiz, ...arq(1, 'roteiro.md')));
      const v2 = fs.readFileSync(path.join(raiz, ...arq(2, 'roteiro.md')));
      assert.equal(Buffer.compare(v2, v1), 0, `${nome}: bytes diferentes`);
      assert.equal(Buffer.compare(v2, origem), 0, `${nome}: difere do texto de origem`);
      const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
      assert.equal(sha(v2), sha(origem), nome);
      assert.deepEqual(validarServicos(raiz).erros, [], nome);
    });
  }
});

test('N13. a cópia do roteiro é conferida byte a byte: se divergir, tudo é desfeito', async () => {
  await comCopia(({ raiz }) => {
    v1Validada(raiz);
    const antes = retrato(raiz);
    // Simula uma gravação que muda o conteúdo do roteiro novo (apara o fim): a conferência exata recusa e desfaz.
    const sistema = {
      ...fs,
      writeSync(fd, texto, ...resto) {
        const t = typeof texto === 'string' && texto.startsWith('# ') ? texto.replace(/\s+$/, '') : texto;
        return fs.writeSync(fd, t, ...resto);
      },
    };
    const r = criarNovaVersaoDoServico({ raiz, sistema, servicoId: 'lac', agora: AGORA_2 });
    assert.deepEqual([r.ok, r.erro, r.revertido], [false, 'verificacao_recusada', true]);
    assert.deepEqual(retrato(raiz), antes);
  });
});

test('N11. a LAC real não foi alterada por nenhum teste deste arquivo', () => {
  assert.deepEqual(retrato(RAIZ), RETRATO_REAL_ANTES);
});
