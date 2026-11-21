// Passo 5A: leitura confinada, congelamento da versão revisada e conferência do hash (versao-arquivos.js, congelamento.js,
// tabela de ações em fluxo.js). SEMPRE em cópias temporárias fora do repositório; a LAC real é conferida (retrato antes/depois).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { congelarVersao, congelarVersaoDoServico } from '../services/admin/congelamento.js';
import { conferirHashDaVersaoEmDisco, lerArquivosDaVersao } from '../services/admin/versao-arquivos.js';
import { criarGravadorEntradas } from '../services/admin/entradas-gravacao.js';
import { ACOES_DA_VERSAO, acoesPermitidas, conteudoEditavel, verificarAcao } from '../services/admin/fluxo.js';
import { validarServicos } from '../scripts/validate-services.js';
import { MARIA } from './admin-auxiliar.js';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const AGORA = () => new Date(2026, 10, 16, 12, 0, 0);
const PASTA = ['services', 'lac', 'versoes', 'v1'];

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

function comCopia(fn) {
  const pai = fs.mkdtempSync(path.join(os.tmpdir(), 'sema-orienta-congelar-'));
  const raiz = path.join(pai, 'raiz');
  fs.mkdirSync(raiz);
  fs.cpSync(path.join(RAIZ, 'services'), path.join(raiz, 'services'), { recursive: true });
  const resultado = Promise.resolve(fn({ raiz, pai }));
  return resultado.finally(() => fs.rmSync(pai, { recursive: true, force: true }));
}
const lerJ = (raiz, ...p) => JSON.parse(fs.readFileSync(path.join(raiz, ...p), 'utf8'));
const gravarJ = (raiz, p, dados) => fs.writeFileSync(path.join(raiz, ...p), `${JSON.stringify(dados, null, 2)}\n`);
const lerManifesto = (raiz) => lerJ(raiz, ...PASTA, 'versao.json');

test('C1. leitura confinada da versão atual da LAC: manifesto, seis arquivos e nenhuma entrada', () => {
  const r = lerArquivosDaVersao({ raiz: RAIZ, servicoId: 'lac', versaoId: 'lac-v1' });
  assert.equal(r.ok, true);
  assert.deepEqual(Object.keys(r.arquivos).sort(), ['conteudoAssistente', 'documentos', 'fontes', 'perguntasFrequentes', 'roteiro', 'service']);
  assert.equal(r.manifesto.estado, 'rascunho');
  assert.equal(r.pasta, 'services/lac/versoes/v1');
});

test('C2. arquivo ausente, caminho fora da versão, id incoerente e ids inválidos são recusados com código', async () => {
  await comCopia(({ raiz }) => {
    const ler = (versaoId = 'lac-v1', servicoId = 'lac') => lerArquivosDaVersao({ raiz, servicoId, versaoId });
    assert.equal(ler('lac-v2').erro, 'manifesto_indisponivel');
    assert.equal(ler('../x').erro, 'versao_invalida');
    assert.equal(ler('lac-v1', 'LAC').erro, 'versao_invalida');
    assert.equal(lerArquivosDaVersao({ raiz: 'relativo', servicoId: 'lac', versaoId: 'lac-v1' }).erro, 'raiz_invalida');
    // caminho do manifesto fora da pasta da versão
    const m = lerManifesto(raiz);
    for (const [chave, valor] of [['fontes', '../../../outro/fontes.json'], ['roteiro', 'services/lac/versoes/v2/roteiro.md'], ['entradas', 'services/outro/entradas.json']]) {
      gravarJ(raiz, [...PASTA, 'versao.json'], { ...m, arquivos: { ...m.arquivos, [chave]: valor } });
      assert.equal(ler().erro, 'caminho_fora_da_versao', chave);
    }
    gravarJ(raiz, [...PASTA, 'versao.json'], { ...m, arquivos: { ...m.arquivos, extra: 'services/lac/versoes/v1/extra.json' } });
    assert.equal(ler().erro, 'caminho_fora_da_versao');
    gravarJ(raiz, [...PASTA, 'versao.json'], { ...m, id: 'lac-v9' });
    assert.equal(ler().erro, 'manifesto_incoerente');
    gravarJ(raiz, [...PASTA, 'versao.json'], m);
    assert.equal(ler().ok, true);
    // arquivo ausente
    fs.rmSync(path.join(raiz, ...PASTA, 'fontes.json'));
    assert.equal(ler().erro, 'arquivo_ausente');
  });
});

test('C3. congelar: rascunho vai a em_validacao com hash conferível; a versão deixa de ser editável', async () => {
  await comCopia(({ raiz }) => {
    const r = congelarVersaoDoServico({ raiz, servicoId: 'lac', agora: AGORA });
    assert.deepEqual([r.ok, r.versaoId], [true, 'lac-v1']);
    assert.match(r.hash, /^[0-9a-f]{64}$/);
    const m = lerManifesto(raiz);
    assert.equal(m.estado, 'em_validacao');
    assert.equal(m.hashConteudo, r.hash);
    assert.equal(m.enviadaEm, '2026-11-16');
    assert.equal(conteudoEditavel(m.estado), false);
    const c = conferirHashDaVersaoEmDisco({ raiz, servicoId: 'lac', versaoId: 'lac-v1' });
    assert.deepEqual([c.ok, c.confere, c.hashGravado === c.hashAtual], [true, true, true]);
    assert.deepEqual(validarServicos(raiz).erros, []);
    // congelar de novo não é permitido
    assert.equal(congelarVersaoDoServico({ raiz, servicoId: 'lac', agora: AGORA }).erro, 'versao_ja_congelada');
  });
});

test('C4. o hash inclui entradas.json: com e sem entrada o hash congelado é diferente', async () => {
  let semEntradas;
  await comCopia(({ raiz }) => { semEntradas = congelarVersaoDoServico({ raiz, servicoId: 'lac', agora: AGORA }).hash; });
  await comCopia(async ({ raiz }) => {
    const g = await criarGravadorEntradas({ raiz, agora: AGORA }).gravarEntradaTexto('lac', { titulo: 'Orientação fictícia', texto: 'Texto fictício do 5A.' }, { ator: MARIA });
    assert.equal(g.ok, true);
    const r = congelarVersaoDoServico({ raiz, servicoId: 'lac', agora: AGORA });
    assert.equal(r.ok, true);
    assert.notEqual(r.hash, semEntradas);
    assert.ok('entradas' in lerArquivosDaVersao({ raiz, servicoId: 'lac', versaoId: 'lac-v1' }).arquivos);
    // alterar o texto da entrada depois de congelar é detectado
    const arq = [...PASTA, 'entradas.json'];
    const e = lerJ(raiz, ...arq);
    e.entradas[0].texto = 'Texto alterado depois de congelar.';
    gravarJ(raiz, arq, e);
    const c = conferirHashDaVersaoEmDisco({ raiz, servicoId: 'lac', versaoId: 'lac-v1' });
    assert.deepEqual([c.ok, c.confere], [true, false]);
    assert.ok(validarServicos(raiz).erros.some((m) => m.includes('não confere')));
  });
});

test('C5. depois de congelar: alteração material é detectada; só `publicado` não invalida o hash; o validador acusa a divergência', async () => {
  await comCopia(({ raiz }) => {
    assert.equal(congelarVersaoDoServico({ raiz, servicoId: 'lac', agora: AGORA }).ok, true);
    const confere = () => conferirHashDaVersaoEmDisco({ raiz, servicoId: 'lac', versaoId: 'lac-v1' }).confere;
    // só publicação
    const sv = [...PASTA, 'service.json'];
    const s = lerJ(raiz, ...sv);
    gravarJ(raiz, sv, { ...s, publicado: true });
    assert.equal(confere(), true);
    gravarJ(raiz, sv, s);
    // material: roteiro, fonte e bloco
    const rot = path.join(raiz, ...PASTA, 'roteiro.md');
    const original = fs.readFileSync(rot, 'utf8');
    fs.writeFileSync(rot, `${original}\nLinha nova.`);
    assert.equal(confere(), false);
    assert.ok(validarServicos(raiz).erros.some((m) => m.includes('hashConteudo') && m.includes('não confere')));
    fs.writeFileSync(rot, original);
    assert.equal(confere(), true);
    // CRLF no roteiro (apenas fim de linha) não invalida
    fs.writeFileSync(rot, original.split('\r\n').join('\n').split('\n').join('\r\n'));
    assert.equal(confere(), true);
    const fo = [...PASTA, 'fontes.json'];
    const f = lerJ(raiz, ...fo);
    f.fontes[0].titulo = 'Alterada';
    gravarJ(raiz, fo, f);
    assert.equal(confere(), false);
  });
});

test('C6. congelar recusa serviço inexistente e data inválida; a função pura não modifica nada', async () => {
  await comCopia(({ raiz }) => {
    assert.equal(congelarVersaoDoServico({ raiz, servicoId: 'nao-existe', agora: AGORA }).erro, 'servico_nao_encontrado');
    const lida = lerArquivosDaVersao({ raiz, servicoId: 'lac', versaoId: 'lac-v1' });
    const antes = JSON.stringify(lida.manifesto);
    assert.equal(congelarVersao(lida.manifesto, lida.arquivos, '2026-02-30').erro, 'data_invalida');
    assert.equal(congelarVersao({ ...lida.manifesto, estado: 'publicado' }, lida.arquivos, '2026-11-16').erro, 'versao_ja_congelada');
    assert.equal(congelarVersao(null, lida.arquivos, '2026-11-16').erro, 'versao_invalida');
    assert.equal(congelarVersao(lida.manifesto, { ...lida.arquivos, fontes: undefined }, '2026-11-16').ok, false);
    const ok = congelarVersao(lida.manifesto, lida.arquivos, '2026-11-16');
    assert.equal(ok.ok, true);
    assert.equal(JSON.stringify(lida.manifesto), antes);
    assert.equal(ok.versao.estado, 'em_validacao');
  });
});

test('C7. rollback: falha ao gravar o manifesto ou recusa da conferência final restauram tudo byte a byte', async () => {
  await comCopia(({ raiz }) => {
    const antes = retrato(raiz);
    const sistema = {
      ...fs,
      renameSync(origem, destino) {
        if (String(destino).endsWith('versao.json')) throw new Error('falha injetada');
        return fs.renameSync(origem, destino);
      },
    };
    const r = congelarVersaoDoServico({ raiz, sistema, servicoId: 'lac', agora: AGORA });
    assert.deepEqual([r.ok, r.erro, r.revertido], [false, 'falha_de_escrita', true]);
    assert.deepEqual(retrato(raiz), antes);
    const recusa = congelarVersaoDoServico({ raiz, servicoId: 'lac', agora: AGORA, verificarFinal: () => ['recusado'] });
    assert.deepEqual([recusa.ok, recusa.erro, recusa.revertido], [false, 'verificacao_recusada', true]);
    assert.deepEqual(retrato(raiz), antes);
    assert.equal(lerManifesto(raiz).estado, 'rascunho');
    assert.equal(lerManifesto(raiz).hashConteudo, null);
  });
});

test('C8. tabela pura de ações: revisão, autorização e publicação são ações separadas, nos estados certos', () => {
  assert.deepEqual(acoesPermitidas('rascunho'), ['concluir_revisao']);
  assert.deepEqual(acoesPermitidas('em_validacao'), ['solicitar_ajustes', 'validar_materialmente']);
  assert.deepEqual(acoesPermitidas('validado_materialmente'), ['autorizar_publicacao', 'nova_versao']);
  assert.deepEqual(acoesPermitidas('autorizado_publicacao'), ['publicar', 'nova_versao']);
  assert.deepEqual(acoesPermitidas('publicado'), ['revogar', 'nova_versao']);
  assert.deepEqual(acoesPermitidas('revogado'), ['nova_versao']);
  assert.deepEqual(acoesPermitidas('ajustes_solicitados'), ['nova_versao']);
  assert.deepEqual(acoesPermitidas('inventado'), []);
  assert.deepEqual(verificarAcao('publicar', 'rascunho'), { permitida: false, para: null, motivo: 'acao_nao_permitida_no_estado' });
  assert.deepEqual(verificarAcao('autorizar_publicacao', 'em_validacao'), { permitida: false, para: null, motivo: 'acao_nao_permitida_no_estado' });
  assert.deepEqual(verificarAcao('concluir_revisao', 'rascunho'), { permitida: true, para: 'em_validacao', motivo: null });
  assert.equal(verificarAcao('voar', 'rascunho').motivo, 'acao_desconhecida');
  assert.equal(verificarAcao('publicar', 'x').motivo, 'estado_de_origem_desconhecido');
  assert.ok(Object.isFrozen(ACOES_DA_VERSAO) && Object.isFrozen(ACOES_DA_VERSAO.publicar.de));
  // Nenhuma ação de revisão leva direto a publicado.
  for (const a of ['concluir_revisao', 'solicitar_ajustes', 'validar_materialmente', 'autorizar_publicacao']) assert.notEqual(ACOES_DA_VERSAO[a].para, 'publicado');
});

test('C9. a LAC real não foi alterada por nenhum teste deste arquivo', () => {
  assert.deepEqual(retrato(RAIZ), RETRATO_REAL_ANTES);
});
