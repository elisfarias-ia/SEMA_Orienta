import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  validarServicos,
  validarFontes,
  analisarUrl,
  dataValida,
  STATUS_VALIDOS,
  TIPOS_FONTE,
  SITUACOES_VIGENCIA,
} from '../scripts/validate-services.js';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lerJson = (...partes) => JSON.parse(fs.readFileSync(path.join(RAIZ, ...partes), 'utf8'));

/** Copia a pasta services/ para um diretório temporário; os arquivos reais nunca são alterados. */
function copiaTemporaria() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sema-orienta-'));
  fs.cpSync(path.join(RAIZ, 'services'), path.join(dir, 'services'), { recursive: true });
  const editarJson = (rel, fn) => {
    const arquivo = path.join(dir, rel);
    const dados = JSON.parse(fs.readFileSync(arquivo, 'utf8'));
    fn(dados);
    fs.writeFileSync(arquivo, JSON.stringify(dados, null, 2));
  };
  return { dir, editarJson, limpar: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

function comCopia(fn) {
  const copia = copiaTemporaria();
  try {
    return fn(copia);
  } finally {
    copia.limpar();
  }
}

/** Fonte válida criada somente em memória (a URL é apenas dado de teste). */
const fonteValida = (extra = {}) => ({
  id: 'fonte-teste-1',
  titulo: 'Fonte de teste',
  tipo: 'pagina_oficial',
  orgaoResponsavel: 'Órgão de teste',
  url: 'https://exemplo.test/pagina',
  descricao: 'Dado temporário de teste.',
  origemOficial: true,
  statusValidacao: 'validado',
  publicado: false,
  dataPublicacao: null,
  dataConsulta: '2026-01-01',
  dispositivoRelevante: null,
  vigencia: { situacao: 'nao_se_aplica', normasRelacionadas: [], observacao: null },
  ...extra,
});
/** Norma criada somente em memória (dado de teste). */
const normaValida = (extra = {}) =>
  fonteValida({
    id: 'norma-teste-1',
    titulo: 'Norma de teste',
    tipo: 'legislacao',
    url: 'https://exemplo.test/norma',
    vigencia: { situacao: 'vigente', normasRelacionadas: [], observacao: null },
    ...extra,
  });
const vigencia = (situacao, normasRelacionadas = []) => ({ situacao, normasRelacionadas, observacao: null });
const fonteReal = (id) => lerJson('services', 'lac', 'versoes', 'v1', 'fontes.json').fontes.find((f) => f.id === id);
const arquivoFontes = (fontes, extra = {}) => ({
  serviceId: 'lac',
  statusValidacao: 'validado',
  fontes,
  pendencia: 'PENDENTE: nada',
  ...extra,
});

// ---------- Base real ----------

test('1. carrega o registro com versão e lista de serviços', () => {
  const registro = lerJson('services', 'registry.json');
  assert.equal(registro.versaoEstrutura, 1);
  assert.ok(Array.isArray(registro.servicos));
});

test('2. a LAC aparece uma única vez e é o único serviço', () => {
  const { servicos } = lerJson('services', 'registry.json');
  assert.equal(servicos.filter((s) => s.id === 'lac').length, 1);
  assert.equal(servicos.length, 1);
  assert.equal(servicos[0].arquivo, 'services/lac/versoes/v1/service.json');
});

test('3. todos os arquivos referenciados existem', () => {
  const servico = lerJson('services', 'lac', 'versoes', 'v1', 'service.json');
  assert.equal(servico.id, 'lac');
  for (const caminho of Object.values(servico.arquivos)) {
    assert.ok(fs.existsSync(path.join(RAIZ, caminho)), `faltando: ${caminho}`);
  }
  for (const arquivo of ['registry.json', 'schemas/registry.schema.json', 'schemas/service.schema.json']) {
    assert.ok(fs.existsSync(path.join(RAIZ, 'services', arquivo)), `faltando: ${arquivo}`);
  }
});

test('4. a LAC está em validação no registro e no serviço; documentos e perguntas também em validação', () => {
  const registro = lerJson('services', 'registry.json').servicos[0];
  assert.equal(registro.statusValidacao, 'em_validacao');
  assert.equal(lerJson('services', 'lac', 'versoes', 'v1', 'service.json').statusValidacao, 'em_validacao');
  assert.equal(lerJson('services', 'lac', 'versoes', 'v1', 'documentos.json').statusValidacao, 'em_validacao');
  assert.equal(lerJson('services', 'lac', 'versoes', 'v1', 'perguntas-frequentes.json').statusValidacao, 'em_validacao');
  // O conjunto de fontes está em validação: as fontes têm identidade e procedência validadas, mas nada foi publicado.
  assert.equal(lerJson('services', 'lac', 'versoes', 'v1', 'fontes.json').statusValidacao, 'em_validacao');
});

test('5. a LAC não está publicada', () => {
  assert.equal(lerJson('services', 'registry.json').servicos[0].publicado, false);
  assert.equal(lerJson('services', 'lac', 'versoes', 'v1', 'service.json').publicado, false);
});

test('6. há 21 perguntas, 28 documentos e 8 fontes cadastrados', () => {
  assert.equal(lerJson('services', 'lac', 'versoes', 'v1', 'documentos.json').documentos.length, 28);
  assert.equal(lerJson('services', 'lac', 'versoes', 'v1', 'perguntas-frequentes.json').perguntas.length, 21);
  assert.equal(lerJson('services', 'lac', 'versoes', 'v1', 'fontes.json').fontes.length, 8);
});

test('a base real passa na validação', () => {
  const { erros, servicos } = validarServicos(RAIZ);
  assert.deepEqual(erros, []);
  assert.deepEqual(servicos, ['lac']);
});

test('campos sem fonte ou validação suficiente continuam PENDENTE', () => {
  const servico = lerJson('services', 'lac', 'versoes', 'v1', 'service.json');
  assert.equal(servico.unidadeResponsavel, 'PENDENTE');
  assert.equal(servico.responsavelValidacao, null);
  assert.equal(servico.dataRevisao, null);
  assert.deepEqual(servico.canalAtendimento, { nome: 'PENDENTE', url: null });
  assert.equal(servico.sistemaInicio.url, null);
  for (const campo of ['unidadeResponsavel', 'responsavelValidacao', 'dataRevisao', 'canalAtendimento', 'sistemaInicio', 'documentos', 'perguntasFrequentes']) {
    assert.ok(servico.pendencias.includes(campo), campo);
  }
  assert.match(lerJson('services', 'lac', 'versoes', 'v1', 'fontes.json').pendencia, /^PENDENTE/);
  assert.doesNotMatch(fs.readFileSync(path.join(RAIZ, 'services', 'lac', 'versoes', 'v1', 'roteiro.md'), 'utf8'), /https?:\/\//);
});

test('os esquemas listam os mesmos status e tipos usados no validador', () => {
  const schema = lerJson('services', 'schemas', 'service.schema.json');
  assert.deepEqual(schema.$defs.statusValidacao.enum, STATUS_VALIDOS);
  assert.deepEqual(schema.$defs.tipoFonte.enum, TIPOS_FONTE);
  assert.deepEqual(schema.$defs.situacaoVigencia.enum, SITUACOES_VIGENCIA);
  const registro = lerJson('services', 'schemas', 'registry.schema.json');
  assert.deepEqual(registro.properties.servicos.items.properties.statusValidacao.enum, STATUS_VALIDOS);
});

// ---------- Falhas do registro (em cópias temporárias) ----------

test('7. falha quando serviço não validado é marcado como publicado', () => {
  comCopia(({ dir, editarJson }) => {
    editarJson('services/registry.json', (r) => { r.servicos[0].publicado = true; });
    editarJson('services/lac/versoes/v1/service.json', (s) => { s.publicado = true; });
    const { erros } = validarServicos(dir);
    assert.ok(erros.some((e) => /não pode estar publicado/.test(e)), erros.join('\n'));
  });
});

test('8. falha quando um arquivo referenciado não existe', () => {
  comCopia(({ dir }) => {
    fs.rmSync(path.join(dir, 'services', 'lac', 'versoes', 'v1', 'documentos.json'));
    const { erros } = validarServicos(dir);
    assert.ok(erros.some((e) => /arquivo não encontrado: services\/lac\/versoes\/v1\/documentos\.json/.test(e)), erros.join('\n'));
  });
});

test('9. falha quando há identificadores de serviço duplicados', () => {
  comCopia(({ dir, editarJson }) => {
    editarJson('services/registry.json', (r) => { r.servicos.push({ ...r.servicos[0] }); });
    const { erros } = validarServicos(dir);
    assert.ok(erros.some((e) => /identificador duplicado "lac"/.test(e)), erros.join('\n'));
  });
});

test('falha com status fora de rascunho, em_validacao e validado', () => {
  comCopia(({ dir, editarJson }) => {
    editarJson('services/registry.json', (r) => { r.servicos[0].statusValidacao = 'publicado'; });
    const { erros } = validarServicos(dir);
    assert.ok(erros.some((e) => /statusValidacao inválido/.test(e)), erros.join('\n'));
  });
});

test('falha com JSON inválido', () => {
  comCopia(({ dir }) => {
    fs.writeFileSync(path.join(dir, 'services', 'lac', 'versoes', 'v1', 'fontes.json'), '{ não é json');
    const { erros } = validarServicos(dir);
    assert.ok(erros.some((e) => /JSON inválido/.test(e)), erros.join('\n'));
  });
});

test('falha quando o id do arquivo difere do id do registro', () => {
  comCopia(({ dir, editarJson }) => {
    editarJson('services/lac/versoes/v1/documentos.json', (d) => { d.serviceId = 'outro'; });
    const { erros } = validarServicos(dir);
    assert.ok(erros.some((e) => /serviceId "outro" difere/.test(e)), erros.join('\n'));
  });
});

test('falha quando documentos não é uma lista', () => {
  comCopia(({ dir, editarJson }) => {
    editarJson('services/lac/versoes/v1/documentos.json', (d) => { d.documentos = {}; });
    const { erros } = validarServicos(dir);
    assert.ok(erros.some((e) => /"documentos" deve ser uma lista/.test(e)), erros.join('\n'));
  });
});

test('falha quando conteúdo oficial está preenchido em rascunho (suposição)', () => {
  comCopia(({ dir, editarJson }) => {
    editarJson('services/registry.json', (r) => { r.servicos[0].statusValidacao = 'rascunho'; });
    editarJson('services/lac/versoes/v1/service.json', (s) => {
      s.statusValidacao = 'rascunho';
      s.descricao = 'Texto inventado';
      s.etapas = ['Etapa inventada'];
      s.sistemaInicio = { nome: 'Sistema X', url: 'https://exemplo.test/' };
    });
    const { erros } = validarServicos(dir);
    assert.ok(erros.some((e) => /"descricao" deve ser PENDENTE/.test(e)), erros.join('\n'));
    assert.ok(erros.some((e) => /"etapas" deve ser lista vazia/.test(e)), erros.join('\n'));
    assert.ok(erros.some((e) => /"sistemaInicio" deve ser/.test(e)), erros.join('\n'));
  });
});

test('falha quando o roteiro de um serviço em rascunho tem seção preenchida', () => {
  comCopia(({ dir, editarJson }) => {
    editarJson('services/registry.json', (r) => { r.servicos[0].statusValidacao = 'rascunho'; });
    editarJson('services/lac/versoes/v1/service.json', (s) => { s.statusValidacao = 'rascunho'; });
    const { erros } = validarServicos(dir);
    assert.ok(erros.some((e) => /seção "Etapas" deve conter somente PENDENTE/.test(e)), erros.join('\n'));
  });
});

test('falha quando o caminho do arquivo complementar sai da pasta services', () => {
  comCopia(({ dir, editarJson }) => {
    editarJson('services/lac/versoes/v1/service.json', (s) => { s.arquivos.fontes = 'services/lac/../../fontes.json'; });
    const { erros } = validarServicos(dir);
    assert.ok(erros.length > 0);
  });
});

// ---------- Fontes e links (somente dados em memória) ----------

test('F1. aceita uma fonte oficial válida criada em memória', () => {
  assert.deepEqual(validarFontes(arquivoFontes([fonteValida()])), []);
});

test('F2. rejeita URL sem https://', () => {
  const erros = validarFontes(arquivoFontes([fonteValida({ url: 'http://exemplo.test/pagina' })]));
  assert.ok(erros.some((e) => /https:\/\//.test(e)), erros.join('\n'));
});

test('F3. rejeita URL inválida', () => {
  const erros = validarFontes(arquivoFontes([fonteValida({ url: 'isto não é uma url' })]));
  assert.ok(erros.some((e) => /URL inválida/.test(e)), erros.join('\n'));
});

test('F4. rejeita duas fontes com a mesma URL', () => {
  const erros = validarFontes(
    arquivoFontes([
      fonteValida({ id: 'a' }),
      fonteValida({ id: 'b', url: 'https://EXEMPLO.test/pagina/' }),
    ]),
  );
  assert.ok(erros.some((e) => /URL duplicada/.test(e)), erros.join('\n'));
});

test('F5. rejeita tipo de fonte desconhecido', () => {
  const erros = validarFontes(arquivoFontes([fonteValida({ tipo: 'blog' })]));
  assert.ok(erros.some((e) => /tipo desconhecido/.test(e)), erros.join('\n'));
});

test('F6. rejeita fonte sem título', () => {
  const erros = validarFontes(arquivoFontes([fonteValida({ titulo: '   ' })]));
  assert.ok(erros.some((e) => /título obrigatório/.test(e)), erros.join('\n'));
});

test('F7. rejeita fonte publicada sem status validado', () => {
  for (const status of ['rascunho', 'em_validacao']) {
    const erros = validarFontes(
      arquivoFontes([fonteValida({ statusValidacao: status, publicado: true })], { statusValidacao: 'em_validacao' }),
    );
    assert.ok(erros.some((e) => /não validada não pode estar publicada/.test(e)), erros.join('\n'));
  }
});

test('rejeita id de fonte duplicado, órgão vazio e status inválido', () => {
  const erros = validarFontes(
    arquivoFontes(
      [
        fonteValida({ id: 'x' }),
        fonteValida({ id: 'x', url: 'https://exemplo.test/outra', orgaoResponsavel: '', statusValidacao: 'aprovado' }),
      ],
      { statusValidacao: 'em_validacao' },
    ),
  );
  assert.ok(erros.some((e) => /id duplicado/.test(e)));
  assert.ok(erros.some((e) => /orgaoResponsavel obrigatório/.test(e)));
  assert.ok(erros.some((e) => /statusValidacao inválido/.test(e)));
});

test('arquivo de fontes em rascunho não aceita fonte validada', () => {
  const erros = validarFontes(arquivoFontes([fonteValida()], { statusValidacao: 'rascunho' }));
  assert.ok(erros.some((e) => /rascunho não pode conter fonte validada/.test(e)), erros.join('\n'));
});

test('analisarUrl normaliza e não acessa a rede', () => {
  assert.equal(analisarUrl('https://Exemplo.test/a/#x').normalizada, analisarUrl('https://exemplo.test/a').normalizada);
  assert.equal(analisarUrl('ftp://exemplo.test').ok, false);
  assert.equal(analisarUrl(null).ok, false);
});

test('fonte em arquivo temporário referenciada pelo serviço é aceita; referência inexistente falha', () => {
  comCopia(({ dir, editarJson }) => {
    editarJson('services/lac/versoes/v1/fontes.json', (f) => {
      f.fontes.push(fonteValida({ statusValidacao: 'rascunho', dataConsulta: null }));
    });
    editarJson('services/lac/versoes/v1/service.json', (s) => {
      s.links.push('fonte-teste-1');
    });
    assert.deepEqual(validarServicos(dir).erros, []);
    editarJson('services/lac/versoes/v1/documentos.json', (d) => {
      d.documentos = [{ id: 'd1', nome: 'x', fonteId: 'inexistente', statusValidacao: 'rascunho' }];
    });
    const { erros } = validarServicos(dir);
    assert.ok(erros.some((e) => /fonteId "inexistente"/.test(e)), erros.join('\n'));
  });
});
