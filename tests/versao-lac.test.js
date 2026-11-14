// Migração estrutural da LAC para a versão 1 (Marco 7, Passo 7C2): conteúdo em services/lac/versoes/v1/,
// registro com versão atual e publicada, manifesto versao.json e localização da versão pelo registro e pelo manifesto.
// Falhas são provocadas em cópias temporárias; os arquivos reais nunca são alterados.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validarServicos } from '../scripts/validate-services.js';
import { validarVersao } from '../services/admin/versao.js';
import { localizarVersaoAtual, pastaDaVersao, caminhosDaVersao, ARQUIVOS_DA_VERSAO } from '../services/versao-atual.js';
import { lerDadosDaBase } from '../services/assistant-endpoint.js';
import { selecionarBlocosAssistente } from '../services/assistant-content.js';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const V1 = ['services', 'lac', 'versoes', 'v1'];
const lerJson = (...p) => JSON.parse(fs.readFileSync(path.join(RAIZ, ...p), 'utf8'));
const lerTexto = (...p) => fs.readFileSync(path.join(RAIZ, ...p), 'utf8');
const SEIS = ['service.json', 'roteiro.md', 'documentos.json', 'perguntas-frequentes.json', 'fontes.json', 'conteudo-assistente.json'];

function comCopia(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sema-orienta-versao-'));
  fs.cpSync(path.join(RAIZ, 'services'), path.join(dir, 'services'), { recursive: true });
  const editarJson = (rel, f) => {
    const arquivo = path.join(dir, rel);
    const dados = JSON.parse(fs.readFileSync(arquivo, 'utf8'));
    f(dados);
    fs.writeFileSync(arquivo, JSON.stringify(dados, null, 2));
  };
  try {
    return fn({ dir, editarJson });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
const temErro = (erros, padrao) => assert.ok(erros.some((e) => padrao.test(e)), erros.join('\n') || '(sem erros)');
const REG = 'services/registry.json';
const MAN = 'services/lac/versoes/v1/versao.json';

// ---------- Estrutura ----------

test('L1. a LAC tem uma única versão, v1, com os seis arquivos e o manifesto; nada solto na raiz de services/lac', () => {
  assert.deepEqual(fs.readdirSync(path.join(RAIZ, 'services', 'lac')), ['versoes']);
  assert.deepEqual(fs.readdirSync(path.join(RAIZ, 'services', 'lac', 'versoes')), ['v1']);
  assert.deepEqual(fs.readdirSync(path.join(RAIZ, ...V1)).sort(), [...SEIS, 'versao.json'].sort());
});

test('L2. os seis arquivos antigos não existem mais na raiz de services/lac e não há cópia duplicada em outro lugar', () => {
  for (const nome of SEIS) assert.equal(fs.existsSync(path.join(RAIZ, 'services', 'lac', nome)), false, nome);
  const todos = [];
  const percorrer = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) percorrer(p);
      else todos.push(p);
    }
  };
  percorrer(path.join(RAIZ, 'services'));
  for (const nome of SEIS) {
    const copias = todos.filter((p) => path.basename(p) === nome && !p.includes(`${path.sep}schemas${path.sep}`));
    assert.equal(copias.length, 1, `${nome}: ${copias.join(', ')}`);
  }
});

test('L3. o manifesto versao.json segue o esquema: rascunho, sem hash, sem envio, sem decisão ou autorização', () => {
  const v = lerJson(...V1, 'versao.json');
  assert.deepEqual(v, {
    id: 'lac-v1', servicoId: 'lac', numero: 1, baseadaEm: null, estado: 'rascunho',
    arquivos: {
      service: 'services/lac/versoes/v1/service.json',
      roteiro: 'services/lac/versoes/v1/roteiro.md',
      documentos: 'services/lac/versoes/v1/documentos.json',
      perguntasFrequentes: 'services/lac/versoes/v1/perguntas-frequentes.json',
      fontes: 'services/lac/versoes/v1/fontes.json',
      conteudoAssistente: 'services/lac/versoes/v1/conteudo-assistente.json',
    },
    hashConteudo: null, criadoEm: '2026-11-09', enviadaEm: null,
  });
  assert.deepEqual(validarVersao(v), []);
  assert.deepEqual(Object.keys(v).sort(), [...lerJson('services', 'schemas', 'versao.schema.json').required].sort());
  const texto = lerTexto(...V1, 'versao.json');
  assert.doesNotMatch(texto, /responsavel|unidade|decisao|autorizacao|validado_materialmente|autorizado_publicacao/);
  for (const arquivo of fs.readdirSync(path.join(RAIZ, 'services', 'lac', 'versoes', 'v1'))) {
    assert.equal(/hashConteudo": "[0-9a-f]{64}"/.test(lerTexto(...V1, arquivo)), false, arquivo);
  }
});

test('L4. o registro aponta para a versão atual e não tem versão publicada; os status atuais não mudaram', () => {
  const s = lerJson('services', 'registry.json').servicos[0];
  assert.equal(s.versaoAtualId, 'lac-v1');
  assert.equal(s.versaoPublicadaId, null);
  assert.equal(s.arquivo, 'services/lac/versoes/v1/service.json');
  assert.equal(s.statusValidacao, 'em_validacao');
  assert.equal(s.publicado, false);
  const servico = lerJson(...V1, 'service.json');
  assert.equal(servico.statusValidacao, 'em_validacao');
  assert.equal(servico.publicado, false);
});

test('L5. service.json: os caminhos internos apontam para a pasta da versão e nada além disso aponta para fora', () => {
  const servico = lerJson(...V1, 'service.json');
  const esperados = caminhosDaVersao('services/lac/versoes/v1');
  for (const chave of ['roteiro', 'documentos', 'perguntasFrequentes', 'fontes', 'conteudoAssistente']) {
    assert.equal(servico.arquivos[chave], esperados[chave], chave);
  }
  assert.deepEqual(Object.keys(servico.arquivos).sort(), ['conteudoAssistente', 'documentos', 'fontes', 'perguntasFrequentes', 'roteiro']);
  assert.doesNotMatch(lerTexto(...V1, 'service.json'), /services\/lac\/(roteiro|documentos|perguntas|fontes|conteudo)/);
});

test('L6. nenhuma ocorrência de "publicado": true nem de decisões, dados pessoais ou credenciais nos dados da base', () => {
  const todos = [];
  const percorrer = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) percorrer(p);
      else todos.push(p);
    }
  };
  percorrer(path.join(RAIZ, 'services', 'lac'));
  percorrer(path.join(RAIZ, 'services', 'schemas'));
  for (const arquivo of [...todos, path.join(RAIZ, 'services', 'registry.json'), path.join(RAIZ, 'services', 'assuntos.json')]) {
    const texto = fs.readFileSync(arquivo, 'utf8');
    assert.doesNotMatch(texto, /"publicado":\s*true/, arquivo);
    // Os esquemas apenas descrevem o modelo das decisões; nos dados da LAC não pode haver decisão registrada.
    if (!arquivo.includes(`${path.sep}schemas${path.sep}`)) assert.doesNotMatch(texto, /decisao_material|autorizacao_publicacao/, arquivo);
    assert.doesNotMatch(texto, /[A-Za-z0-9._-]+@[A-Za-z0-9-]+\.[A-Za-z]{2,}/, arquivo);
    assert.doesNotMatch(texto, /\b(api[_-]?key|secret|password|token)\b|AIza|sk-[A-Za-z0-9]{10}/i, arquivo);
  }
});

// ---------- Localização pelo registro e pelo manifesto ----------

test('L7. pastaDaVersao e caminhosDaVersao derivam o caminho do id da versão', () => {
  assert.equal(pastaDaVersao('lac', 'lac-v1'), 'services/lac/versoes/v1');
  assert.equal(pastaDaVersao('lac', 'lac-v12'), 'services/lac/versoes/v12');
  for (const id of ['lac-v0', 'lac-v01', 'lac-v', 'outra-v1', 'lac-v1/../x', 'LAC-v1', 'lac-vx', undefined, null, 1]) {
    assert.equal(pastaDaVersao('lac', id), null, String(id));
  }
  assert.equal(pastaDaVersao('Lac', 'lac-v1'), null);
  assert.deepEqual(Object.values(caminhosDaVersao('p')).sort(), Object.values(ARQUIVOS_DA_VERSAO).map((n) => `p/${n}`).sort());
});

test('L8. a versão atual é localizada pelo registro e pelo manifesto', () => {
  const r = localizarVersaoAtual(RAIZ, 'lac');
  assert.equal(r.ok, true);
  assert.equal(r.versaoId, 'lac-v1');
  assert.equal(r.pasta, 'services/lac/versoes/v1');
  assert.equal(r.arquivos.conteudoAssistente, 'services/lac/versoes/v1/conteudo-assistente.json');
  assert.equal(localizarVersaoAtual(RAIZ, 'inexistente').erro, 'servico_nao_registrado');
});

test('L9. o localizador recusa registro ou manifesto incoerentes', () => {
  comCopia(({ dir, editarJson }) => {
    editarJson(MAN, (m) => { m.id = 'lac-v9'; });
    assert.equal(localizarVersaoAtual(dir, 'lac').erro, 'manifesto_incoerente');
  });
  comCopia(({ dir, editarJson }) => {
    editarJson(MAN, (m) => { m.arquivos.fontes = '../../fontes.json'; });
    assert.equal(localizarVersaoAtual(dir, 'lac').erro, 'manifesto_incoerente');
  });
  comCopia(({ dir, editarJson }) => {
    editarJson(REG, (r) => { r.servicos[0].versaoAtualId = 'lac-v7'; });
    assert.equal(localizarVersaoAtual(dir, 'lac').erro, 'versao_indisponivel');
  });
  comCopia(({ dir, editarJson }) => {
    editarJson(REG, (r) => { r.servicos[0].versaoAtualId = '../x'; });
    assert.equal(localizarVersaoAtual(dir, 'lac').erro, 'versao_atual_invalida');
  });
});

test('L10. o endpoint lê o conteúdo da versão atual indicada pelo registro, sem caminho fixo da LAC', () => {
  const codigo = lerTexto('services', 'assistant-endpoint.js');
  assert.doesNotMatch(codigo, /services\/lac|'services', 'lac'|conteudo-assistente\.json|fontes\.json/);
  assert.match(codigo, /localizarVersaoAtual/);
  // Troca a versão atual para v2 (cópia temporária) e confirma que o endpoint passa a ler a v2.
  comCopia(({ dir, editarJson }) => {
    fs.renameSync(path.join(dir, 'services', 'lac', 'versoes', 'v1'), path.join(dir, 'services', 'lac', 'versoes', 'v2'));
    const pasta = 'services/lac/versoes/v2';
    editarJson(`${pasta}/versao.json`, (m) => {
      m.id = 'lac-v2'; m.numero = 2; m.baseadaEm = 'lac-v1';
      for (const [chave, nome] of Object.entries(ARQUIVOS_DA_VERSAO)) m.arquivos[chave] = `${pasta}/${nome}`;
    });
    editarJson(REG, (r) => { r.servicos[0].versaoAtualId = 'lac-v2'; r.servicos[0].arquivo = `${pasta}/service.json`; });
    editarJson(`${pasta}/conteudo-assistente.json`, (c) => { c.marcadorDeTeste = 'versao-2'; });
    const dados = lerDadosDaBase(dir);
    assert.equal(dados.conteudo.marcadorDeTeste, 'versao-2');
    assert.ok(Array.isArray(dados.fontes) && dados.fontes.length > 0);
  });
});

test('L11. o endpoint falha de forma segura quando a versão atual não pode ser localizada', () => {
  comCopia(({ dir, editarJson }) => {
    editarJson(MAN, (m) => { m.servicoId = 'outro'; });
    assert.throws(() => lerDadosDaBase(dir), /manifesto_incoerente/);
  });
});

test('L12. modo público continua com zero blocos e o teste local continua com os cinco blocos', () => {
  const dados = lerDadosDaBase(RAIZ);
  assert.deepEqual(selecionarBlocosAssistente(dados), []);
  assert.deepEqual(selecionarBlocosAssistente(dados, 'publico'), []);
  assert.equal(selecionarBlocosAssistente(dados, 'teste_local').length, 5);
});

// ---------- Validador ----------

test('L13. o validador aceita a base real e confere versão atual, manifesto e arquivos', () => {
  assert.deepEqual(validarServicos(RAIZ), { erros: [], servicos: ['lac'] });
});

test('L14. falha quando a versão atual não existe ou o id é inválido', () => {
  comCopia(({ dir, editarJson }) => {
    editarJson(REG, (r) => { r.servicos[0].versaoAtualId = 'lac-v2'; });
    const { erros } = validarServicos(dir);
    temErro(erros, /arquivo não encontrado|versao/);
    temErro(erros, /"arquivo" deve ser services\/lac\/versoes\/v2\/service\.json/);
  });
  for (const id of ['lac', 'lac-v0', 'outro-v1', '../lac-v1', undefined, 5]) {
    comCopia(({ dir, editarJson }) => {
      editarJson(REG, (r) => { r.servicos[0].versaoAtualId = id; });
      temErro(validarServicos(dir).erros, /versaoAtualId inválido/);
    });
  }
});

test('L15. falha com manifesto ausente, de outro serviço, com id ou número incoerentes', () => {
  comCopia(({ dir }) => {
    fs.rmSync(path.join(dir, MAN));
    temErro(validarServicos(dir).erros, /arquivo não encontrado: services\/lac\/versoes\/v1\/versao\.json/);
  });
  comCopia(({ dir, editarJson }) => {
    editarJson(MAN, (m) => { m.servicoId = 'outro'; });
    temErro(validarServicos(dir).erros, /servicoId do manifesto/);
  });
  comCopia(({ dir, editarJson }) => {
    editarJson(MAN, (m) => { m.id = 'lac-v2'; });
    temErro(validarServicos(dir).erros, /id do manifesto \("lac-v2"\) difere de versaoAtualId/);
  });
  comCopia(({ dir, editarJson }) => {
    editarJson(MAN, (m) => { m.numero = 2; m.baseadaEm = 'lac-v0'; });
    temErro(validarServicos(dir).erros, /numero do manifesto \(2\) difere da pasta/);
  });
  comCopia(({ dir, editarJson }) => {
    editarJson(MAN, (m) => { m.estado = 'estado-invalido'; });
    temErro(validarServicos(dir).erros, /estado inválido/);
  });
  comCopia(({ dir, editarJson }) => {
    editarJson(MAN, (m) => { m.hashConteudo = 'a'.repeat(64); });
    temErro(validarServicos(dir).erros, /rascunho não pode ter hashConteudo/);
  });
});

test('L16. falha quando os caminhos do manifesto saem da pasta da versão, faltam ou sobram', () => {
  comCopia(({ dir, editarJson }) => {
    editarJson(MAN, (m) => { m.arquivos.fontes = 'services/lac/fontes.json'; });
    temErro(validarServicos(dir).erros, /arquivos\.fontes deve ser services\/lac\/versoes\/v1\/fontes\.json/);
  });
  comCopia(({ dir, editarJson }) => {
    editarJson(MAN, (m) => { m.arquivos.roteiro = '../v2/roteiro.md'; });
    assert.ok(validarServicos(dir).erros.length > 0);
  });
  comCopia(({ dir, editarJson }) => {
    editarJson(MAN, (m) => { m.arquivos.extra = 'services/lac/versoes/v1/extra.json'; });
    temErro(validarServicos(dir).erros, /arquivos\.extra não faz parte da versão/);
  });
  comCopia(({ dir, editarJson }) => {
    editarJson(MAN, (m) => { delete m.arquivos.documentos; });
    temErro(validarServicos(dir).erros, /arquivos\.documentos deve ser/);
  });
});

test('L17. falha quando um arquivo da versão não existe', () => {
  for (const nome of ['roteiro.md', 'perguntas-frequentes.json', 'conteudo-assistente.json']) {
    comCopia(({ dir }) => {
      fs.rmSync(path.join(dir, 'services', 'lac', 'versoes', 'v1', nome));
      temErro(validarServicos(dir).erros, new RegExp(`arquivo não encontrado: services/lac/versoes/v1/${nome.replace('.', '\\.')}`));
    });
  }
});

test('L18. falha quando o service.json aponta para fora da pasta da versão ou diverge do manifesto', () => {
  comCopia(({ dir, editarJson }) => {
    editarJson('services/lac/versoes/v1/service.json', (s) => { s.arquivos.documentos = 'services/lac/documentos.json'; });
    temErro(validarServicos(dir).erros, /arquivos\.documentos deve estar em services\/lac\/versoes\/v1\//);
  });
  comCopia(({ dir, editarJson }) => {
    editarJson('services/lac/versoes/v1/service.json', (s) => { s.arquivos.conteudoAssistente = 'services/lac/conteudo-assistente.json'; });
    temErro(validarServicos(dir).erros, /arquivos\.conteudoAssistente deve estar em services\/lac\/versoes\/v1\//);
  });
});

test('L19. falha com arquivo antigo na raiz do serviço ou pasta de versão não registrada (sem duplicação)', () => {
  comCopia(({ dir }) => {
    fs.copyFileSync(path.join(dir, 'services', 'lac', 'versoes', 'v1', 'fontes.json'), path.join(dir, 'services', 'lac', 'fontes.json'));
    temErro(validarServicos(dir).erros, /arquivo fora da pasta da versão: services\/lac\/fontes\.json/);
  });
  comCopia(({ dir }) => {
    fs.cpSync(path.join(dir, 'services', 'lac', 'versoes', 'v1'), path.join(dir, 'services', 'lac', 'versoes', 'v2'), { recursive: true });
    temErro(validarServicos(dir).erros, /pasta de versão não registrada: services\/lac\/versoes\/v2/);
  });
});

test('L20. versão publicada: versaoPublicadaId deve ser nulo enquanto não houver publicação', () => {
  comCopia(({ dir, editarJson }) => {
    editarJson(REG, (r) => { r.servicos[0].versaoPublicadaId = 'lac-v1'; });
    temErro(validarServicos(dir).erros, /versaoPublicadaId só pode apontar para uma versão em estado publicado/);
    temErro(validarServicos(dir).erros, /"publicado" deve coincidir com a existência de versaoPublicadaId/);
  });
  comCopia(({ dir, editarJson }) => {
    editarJson(REG, (r) => { r.servicos[0].versaoPublicadaId = 'lac-v9'; });
    temErro(validarServicos(dir).erros, /versaoPublicadaId só pode apontar/);
  });
  comCopia(({ dir, editarJson }) => {
    editarJson(REG, (r) => { r.servicos[0].versaoPublicadaId = ''; });
    temErro(validarServicos(dir).erros, /versaoPublicadaId deve ser null/);
  });
  comCopia(({ dir, editarJson }) => {
    editarJson(REG, (r) => { delete r.servicos[0].versaoPublicadaId; });
    temErro(validarServicos(dir).erros, /versaoPublicadaId deve ser null/);
  });
});

test('L21. versão em estado publicado exige versaoPublicadaId e vice-versa; publicado do registro acompanha a publicação', () => {
  comCopia(({ dir, editarJson }) => {
    editarJson(MAN, (m) => { m.estado = 'publicado'; m.hashConteudo = 'a'.repeat(64); m.enviadaEm = '2026-11-09'; });
    temErro(validarServicos(dir).erros, /exige versaoPublicadaId igual a versaoAtualId/);
  });
  comCopia(({ dir, editarJson }) => {
    editarJson(REG, (r) => { r.servicos[0].publicado = true; });
    const { erros } = validarServicos(dir);
    temErro(erros, /"publicado" deve coincidir/);
    temErro(erros, /não pode estar publicado/);
  });
});

test('L22. os esquemas do registro documentam a versão atual e a publicada, com os mesmos campos exigidos pelo validador', () => {
  const item = lerJson('services', 'schemas', 'registry.schema.json').properties.servicos.items;
  assert.ok(item.required.includes('versaoAtualId') && item.required.includes('versaoPublicadaId'));
  assert.match('lac-v1', new RegExp(item.properties.versaoAtualId.pattern));
  assert.doesNotMatch('lac-v0', new RegExp(item.properties.versaoAtualId.pattern));
  assert.deepEqual(item.properties.versaoPublicadaId.type, ['string', 'null']);
  assert.match(item.properties.arquivo.description, /versoes\/v<número>\/service\.json/);
});

test('L23. nenhuma decisão, endpoint ou interface administrativa foi criada e o armazenamento privado não existe', () => {
  assert.equal(fs.existsSync(path.join(RAIZ, 'data')), false);
  assert.deepEqual(fs.readdirSync(path.join(RAIZ, 'admin')).sort(), ['admin-logic.js', 'admin.js', 'conteudo', 'index.html', 'saude', 'styles.css']);
  for (const arquivo of ['src/main.js', 'src/chat.js', 'src/assistant.js']) {
    assert.doesNotMatch(lerTexto(arquivo), /services\/admin|armazenamento|versao-atual|admin\//, arquivo);
  }
});
