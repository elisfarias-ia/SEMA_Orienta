// Testes de origem oficial, validação e vigência das fontes.
// Dados de teste ficam em memória ou em cópias temporárias; os arquivos reais nunca são alterados.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validarServicos, validarFontes, analisarUrl, dataValida } from '../scripts/validate-services.js';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lerJson = (...partes) => JSON.parse(fs.readFileSync(path.join(RAIZ, ...partes), 'utf8'));
const fonteReal = (id) => lerJson('services', 'lac', 'fontes.json').fontes.find((f) => f.id === id);

function comCopia(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sema-orienta-vig-'));
  fs.cpSync(path.join(RAIZ, 'services'), path.join(dir, 'services'), { recursive: true });
  const editarJson = (rel, editar) => {
    const arquivo = path.join(dir, rel);
    const dados = JSON.parse(fs.readFileSync(arquivo, 'utf8'));
    editar(dados);
    fs.writeFileSync(arquivo, JSON.stringify(dados, null, 2));
  };
  try {
    return fn({ dir, editarJson });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

const vigencia = (situacao, normasRelacionadas = []) => ({ situacao, normasRelacionadas, observacao: null });

/** Fonte não legislativa criada somente em memória. */
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
  vigencia: vigencia('nao_se_aplica'),
  ...extra,
});
/** Norma criada somente em memória. */
const normaValida = (extra = {}) =>
  fonteValida({
    id: 'norma-teste-1',
    titulo: 'Norma de teste',
    tipo: 'legislacao',
    url: 'https://exemplo.test/norma',
    vigencia: vigencia('vigente'),
    ...extra,
  });
const arquivoFontes = (fontes, extra = {}) => ({
  serviceId: 'lac',
  statusValidacao: 'validado',
  fontes,
  pendencia: 'PENDENTE: nada',
  ...extra,
});

test('V1. aceita fonte de origem oficial ainda em validação (origem não é validação)', () => {
  const erros = validarFontes(
    arquivoFontes([fonteValida({ statusValidacao: 'em_validacao', origemOficial: true, publicado: false })], {
      statusValidacao: 'em_validacao',
    }),
  );
  assert.deepEqual(erros, []);
});

test('V2. origemOficial deve ser booleano e o campo antigo "oficial" é rejeitado', () => {
  const texto = validarFontes(arquivoFontes([fonteValida({ origemOficial: 'sim' })]));
  assert.ok(texto.some((e) => /origemOficial deve ser booleano/.test(e)), texto.join('\n'));
  const antigo = validarFontes(arquivoFontes([fonteValida({ oficial: true })]));
  assert.ok(antigo.some((e) => /"oficial" foi substituído por "origemOficial"/.test(e)), antigo.join('\n'));
});

test('V3. aceita legislação com situação de vigência válida', () => {
  for (const situacao of ['vigente', 'alterada', 'a_confirmar']) {
    assert.deepEqual(validarFontes(arquivoFontes([normaValida({ vigencia: vigencia(situacao) })])), [], situacao);
  }
  const comRevogada = [
    normaValida({ id: 'a', vigencia: vigencia('revogada', ['b']) }),
    normaValida({ id: 'b', url: 'https://exemplo.test/outra' }),
  ];
  assert.deepEqual(validarFontes(arquivoFontes(comRevogada)), []);
});

test('V4. rejeita situação de vigência inválida', () => {
  const erros = validarFontes(arquivoFontes([normaValida({ vigencia: vigencia('em_vigor') })]));
  assert.ok(erros.some((e) => /vigencia\.situacao inválida/.test(e)), erros.join('\n'));
});

test('V5. rejeita legislação com nao_se_aplica', () => {
  const erros = validarFontes(arquivoFontes([normaValida({ vigencia: vigencia('nao_se_aplica') })]));
  assert.ok(erros.some((e) => /legislacao não pode usar vigencia nao_se_aplica/.test(e)), erros.join('\n'));
});

test('V6. rejeita fonte não legislativa marcada como vigente', () => {
  const erros = validarFontes(arquivoFontes([fonteValida({ vigencia: vigencia('vigente') })]));
  assert.ok(erros.some((e) => /não é legislação deve usar vigencia nao_se_aplica/.test(e)), erros.join('\n'));
});

test('V7. rejeita norma revogada sem norma relacionada', () => {
  const erros = validarFontes(arquivoFontes([normaValida({ vigencia: vigencia('revogada', []) })]));
  assert.ok(erros.some((e) => /revogada deve citar ao menos uma norma/.test(e)), erros.join('\n'));
});

test('V8. rejeita norma relacionada inexistente ou que cita a si mesma', () => {
  const inexistente = validarFontes(arquivoFontes([normaValida({ vigencia: vigencia('alterada', ['nao-existe']) })]));
  assert.ok(inexistente.some((e) => /cita fonte inexistente "nao-existe"/.test(e)), inexistente.join('\n'));
  const propria = validarFontes(arquivoFontes([normaValida({ vigencia: vigencia('alterada', ['norma-teste-1']) })]));
  assert.ok(propria.some((e) => /não pode citar a própria fonte/.test(e)), propria.join('\n'));
});

test('V8b. norma revogada ou a_confirmar nunca pode ser publicada', () => {
  const revogada = validarFontes(
    arquivoFontes([
      normaValida({ id: 'a', publicado: true, vigencia: vigencia('revogada', ['b']) }),
      normaValida({ id: 'b', url: 'https://exemplo.test/outra' }),
    ]),
  );
  assert.ok(revogada.some((e) => /revogada não pode estar publicada/.test(e)), revogada.join('\n'));
  const aConfirmar = validarFontes(arquivoFontes([normaValida({ publicado: true, vigencia: vigencia('a_confirmar') })]));
  assert.ok(aConfirmar.some((e) => /a_confirmar não pode estar publicada/.test(e)), aConfirmar.join('\n'));
});

test('V8c. datas devem ser null ou AAAA-MM-DD existentes', () => {
  assert.equal(dataValida('2026-11-05'), true);
  assert.equal(dataValida('2026-02-31'), false);
  assert.equal(dataValida('05/11/2026'), false);
  const erros = validarFontes(arquivoFontes([fonteValida({ dataPublicacao: '2026-13-01', dataConsulta: 'ontem' })]));
  assert.ok(erros.some((e) => /dataPublicacao deve ser null/.test(e)), erros.join('\n'));
  assert.ok(erros.some((e) => /dataConsulta deve ser null/.test(e)), erros.join('\n'));
});

test('V9. o Decreto nº 695/2020 está registrado como revogado e não publicado', () => {
  const decreto = fonteReal('decreto-695-2020');
  assert.equal(decreto.vigencia.situacao, 'revogada');
  assert.deepEqual(decreto.vigencia.normasRelacionadas, ['decreto-1268-2022']);
  assert.equal(decreto.publicado, false);
  assert.equal(decreto.statusValidacao, 'validado');
  assert.equal(decreto.origemOficial, true);
});

test('V9b. a validação rejeita publicar o Decreto nº 695/2020 (cópia temporária)', () => {
  comCopia(({ dir, editarJson }) => {
    editarJson('services/lac/fontes.json', (f) => {
      const decreto = f.fontes.find((x) => x.id === 'decreto-695-2020');
      decreto.publicado = true;
      decreto.statusValidacao = 'validado';
    });
    const { erros } = validarServicos(dir);
    assert.ok(erros.some((e) => /revogada não pode estar publicada/.test(e)), erros.join('\n'));
  });
});

test('V10. service.json referencia as fontes por id', () => {
  const servico = lerJson('services', 'lac', 'service.json');
  assert.deepEqual(servico.links, ['sema-orientacoes-lac', 'tr-176-lac', 'manual-lac-siga-2020', 'faq-lac-2022']);
  assert.deepEqual(servico.legislacao, [
    'lei-complementar-668-2020',
    'decreto-695-2020',
    'decreto-1268-2022',
    'decreto-1585-2022',
  ]);
  for (const id of servico.legislacao) assert.equal(fonteReal(id).tipo, 'legislacao');
  assert.equal(fonteReal('sema-orientacoes-lac').tipo, 'pagina_oficial');
});

test('V10b. falha quando service.json cita fonte inexistente ou legislação de outro tipo', () => {
  comCopia(({ dir, editarJson }) => {
    editarJson('services/lac/service.json', (s) => {
      s.links = ['nao-existe'];
      s.legislacao = ['sema-orientacoes-lac'];
    });
    const { erros } = validarServicos(dir);
    assert.ok(erros.some((e) => /links cita fonte inexistente "nao-existe"/.test(e)), erros.join('\n'));
    assert.ok(erros.some((e) => /não é do tipo legislacao/.test(e)), erros.join('\n'));
  });
});

test('V10c. serviço publicado não pode referenciar fonte não validada (cópia temporária)', () => {
  comCopia(({ dir, editarJson }) => {
    editarJson('services/registry.json', (r) => {
      r.servicos[0].publicado = true;
      r.servicos[0].statusValidacao = 'validado';
    });
    editarJson('services/lac/service.json', (s) => {
      s.publicado = true;
      s.statusValidacao = 'validado';
    });
    const { erros } = validarServicos(dir);
    assert.ok(erros.some((e) => /serviço publicado não pode referenciar a fonte/.test(e)), erros.join('\n'));
  });
});

test('V11. nada da LAC está publicado e o serviço segue sem responsável e sem data de revisão', () => {
  const fontes = lerJson('services', 'lac', 'fontes.json');
  assert.equal(fontes.statusValidacao, 'em_validacao');
  assert.ok(fontes.fontes.every((f) => f.publicado === false));
  assert.ok(fontes.fontes.every((f) => f.statusValidacao === 'validado'));
  const servico = lerJson('services', 'lac', 'service.json');
  assert.equal(servico.statusValidacao, 'em_validacao');
  assert.equal(servico.publicado, false);
  assert.equal(servico.responsavelValidacao, null);
  assert.equal(servico.dataRevisao, null);
  assert.equal(servico.unidadeResponsavel, 'PENDENTE');
});

test('V11b. documentos e perguntas ainda não receberam conteúdo', () => {
  assert.deepEqual(lerJson('services', 'lac', 'documentos.json').documentos, []);
  assert.deepEqual(lerJson('services', 'lac', 'perguntas-frequentes.json').perguntas, []);
});

test('V12. todos os links reais usam HTTPS e não se repetem', () => {
  const { fontes } = lerJson('services', 'lac', 'fontes.json');
  for (const fonte of fontes) assert.ok(fonte.url.startsWith('https://'), fonte.url);
  assert.ok(fontes.every((f) => analisarUrl(f.url).ok));
  assert.equal(new Set(fontes.map((f) => analisarUrl(f.url).normalizada)).size, fontes.length);
});

test('V13. o campo antigo "oficial" não existe nos arquivos reais nem no esquema', () => {
  for (const fonte of lerJson('services', 'lac', 'fontes.json').fontes) {
    assert.equal('oficial' in fonte, false, fonte.id);
    assert.equal(typeof fonte.origemOficial, 'boolean');
  }
  const schema = lerJson('services', 'schemas', 'service.schema.json');
  assert.equal('oficial' in schema.$defs.fonte.properties, false);
  assert.ok('origemOficial' in schema.$defs.fonte.properties);
});
