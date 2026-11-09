// Passo 3: perguntas frequentes da LAC, transcritas (em resumo fiel e linguagem de fonte histórica) do FAQ de 2022.
// Todas em validação, não publicadas, sem resposta publicável. Contatos NÃO são armazenados em nenhum arquivo.
// Falhas são provocadas em cópias temporárias; os arquivos reais nunca são alterados.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  validarServicos,
  validarPerguntas,
  perguntasDisponiveisParaAssistente,
  TEMAS_PERGUNTA,
  BLOQUEIOS_PERGUNTA,
} from '../scripts/validate-services.js';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lerTexto = (...partes) => fs.readFileSync(path.join(RAIZ, ...partes), 'utf8');
const lerJson = (...partes) => JSON.parse(lerTexto(...partes));
const arquivoPerguntas = () => lerJson('services', 'lac', 'perguntas-frequentes.json');
const perguntas = () => arquivoPerguntas().perguntas;
const fontes = () => lerJson('services', 'lac', 'fontes.json').fontes;
const fontesPorId = () => new Map(fontes().map((f) => [f.id, f]));
const porNumero = (n) => {
  const q = perguntas().find((x) => x.numeroFonte === n);
  assert.ok(q, `pergunta ${n} não encontrada`);
  return q;
};

function comCopia(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sema-orienta-faq-'));
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
const erros = (dir) => validarServicos(dir).erros;
const temErro = (lista, regex) => assert.ok(lista.some((e) => regex.test(e)), lista.join('\n'));

const NUMEROS = [...Array.from({ length: 18 }, (_, i) => String(i + 1)), 'i', 'j', 'k'];
const PENDENTE_CONFIRMACAO = 'Informação pendente de confirmação pela área competente antes da publicação.';
const CONTATO = 'O FAQ de 2022 indica um contato institucional que precisa ser atualizado antes da publicação.';

// Bloqueios mínimos exigidos por pergunta (o cadastro pode acrescentar, nunca reduzir).
const BLOQUEIOS_MINIMOS = {
  1: ['desatualizacao', 'fonte_complementar'],
  2: [],
  3: ['desatualizacao', 'fonte_complementar', 'conflito_com_base'],
  4: ['vigencia', 'fonte_complementar', 'contato_desatualizado', 'enquadramento_dependente_de_analise'],
  5: ['desatualizacao', 'procedimento_do_sistema'],
  6: ['vigencia', 'fonte_complementar'],
  7: ['informacao_variavel'],
  8: ['informacao_variavel', 'fonte_complementar'],
  9: ['desatualizacao', 'procedimento_do_sistema'],
  10: ['desatualizacao', 'procedimento_do_sistema', 'contato_desatualizado'],
  11: ['desatualizacao', 'procedimento_do_sistema'],
  12: ['desatualizacao', 'procedimento_do_sistema'],
  13: ['desatualizacao', 'procedimento_do_sistema'],
  14: ['informacao_variavel'],
  15: ['desatualizacao', 'informacao_variavel', 'procedimento_do_sistema'],
  16: ['desatualizacao', 'enquadramento_dependente_de_analise'],
  17: ['desatualizacao', 'fonte_complementar'],
  18: ['vigencia', 'fonte_complementar'],
  i: ['fonte_complementar', 'desatualizacao', 'contato_desatualizado', 'enquadramento_dependente_de_analise'],
  j: ['fonte_complementar', 'vigencia', 'enquadramento_dependente_de_analise'],
  k: ['informacao_variavel', 'fonte_complementar', 'contato_desatualizado'],
};

// ---------- Fonte ----------

test('F1. a fonte faq-lac-2022 usa a URL oficial com www, data de consulta e descrição corretas', () => {
  const fonte = fontesPorId().get('faq-lac-2022');
  assert.ok(fonte);
  assert.equal(fonte.url, 'https://www.sema.mt.gov.br/site/phocadownload/FAQ%20da%20LAC_revisado%202%201.pdf');
  assert.equal(fonte.dataConsulta, '2026-11-09');
  assert.equal(fonte.origemOficial, true);
  assert.equal(fonte.statusValidacao, 'validado');
  assert.equal(fonte.publicado, false);
  assert.match(fonte.descricao, /domínio oficial da SEMA-MT/);
  assert.match(fonte.descricao, /"FAQ Perguntas e Respostas"/);
  assert.match(fonte.descricao, /"PERGUNTAS FREQUENTES – LAC"/);
  assert.match(fonte.descricao, /produzido em 2022/);
  assert.match(fonte.descricao, /validação de atualidade/);
});

test('F2. a vigência da fonte foi mantida e não há evento técnico registrado', () => {
  const fonte = fontesPorId().get('faq-lac-2022');
  assert.deepEqual(fonte.vigencia, {
    situacao: 'nao_se_aplica',
    normasRelacionadas: ['decreto-1268-2022'],
    observacao: 'A vigência jurídica não se aplica a esta fonte documental.',
  });
  assert.doesNotMatch(JSON.stringify(fonte), /timeout|não respondeu|falha de acesso|sem ["“]?www/i);
});

// ---------- Estrutura e conteúdo ----------

test('P1. existem exatamente 21 perguntas: as 18 numeradas e as perguntas i, j e k', () => {
  assert.equal(perguntas().length, 21);
  assert.deepEqual(perguntas().map((q) => q.numeroFonte), NUMEROS);
});

test('P2. os ids são únicos e as observações a até h não viraram perguntas', () => {
  const ids = perguntas().map((q) => q.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const letra of ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']) {
    assert.equal(perguntas().some((q) => q.numeroFonte === letra), false, letra);
  }
});

test('P3. a pendência do arquivo explica as observações a até h (Passo 4, sem publicação)', () => {
  const { pendencia } = arquivoPerguntas();
  assert.match(pendencia, /^PENDENTE/);
  assert.match(pendencia, /observações a até h/);
  assert.match(pendencia, /orientações adicionais/);
  assert.match(pendencia, /Passo 4/);
  assert.match(pendencia, /não estão publicadas nem disponíveis ao assistente/);
  assert.equal(arquivoPerguntas().statusValidacao, 'em_validacao');
});

test('P4. todas citam faq-lac-2022, estão em validação, não publicadas, com revisão pendente e sem resposta publicável', () => {
  for (const q of perguntas()) {
    assert.equal(q.fonteId, 'faq-lac-2022', q.id);
    assert.equal(q.statusValidacao, 'em_validacao', q.id);
    assert.equal(q.publicado, false, q.id);
    assert.equal(q.revisaoAtualidade, 'pendente', q.id);
    assert.equal(q.respostaPublicavel, null, q.id);
  }
});

test('P5. todas têm localização na fonte com a numeração do FAQ', () => {
  for (const q of perguntas()) {
    assert.match(q.localizacaoFonte, /^FAQ 2022, (pergunta \d+|Observações, item [ijk]), p\. \d/, q.id);
    assert.ok(q.localizacaoFonte.includes(q.numeroFonte), q.id);
  }
});

test('P6. os temas são controlados e não há tema duplicado', () => {
  for (const q of perguntas()) {
    assert.ok(TEMAS_PERGUNTA.includes(q.tema), q.id);
    const secundarios = q.temasSecundarios ?? [];
    assert.ok(secundarios.every((t) => TEMAS_PERGUNTA.includes(t)), q.id);
    assert.equal(new Set(secundarios).size, secundarios.length, q.id);
    assert.equal(secundarios.includes(q.tema), false, q.id);
  }
  assert.equal(new Set(TEMAS_PERGUNTA).size, TEMAS_PERGUNTA.length);
});

test('P7. os bloqueios mínimos de cada pergunta foram cadastrados (sem reduzir)', () => {
  for (const [numero, minimos] of Object.entries(BLOQUEIOS_MINIMOS)) {
    const q = porNumero(numero);
    for (const bloqueio of minimos) assert.ok(q.bloqueios.includes(bloqueio), `${numero}: falta ${bloqueio}`);
    assert.ok(q.bloqueios.every((b) => BLOQUEIOS_PERGUNTA.includes(b)), numero);
    assert.equal(new Set(q.bloqueios).size, q.bloqueios.length, numero);
  }
  assert.deepEqual(porNumero('2').bloqueios, []);
  assert.equal(porNumero('2').statusValidacao, 'em_validacao');
  assert.equal(porNumero('2').respostaPublicavel, null);
});

test('P8. conteudoFonte usa linguagem de fonte histórica e sinaliza a confirmação pendente', () => {
  for (const q of perguntas()) {
    assert.match(q.conteudoFonte, /^O FAQ de 2022 /, q.id);
    assert.doesNotMatch(q.conteudoFonte, /\bO (prazo|valor|custo) é\b|\bA LAC (tem|custa|dura)\b/, q.id);
    if (q.bloqueios.length > 0) assert.ok(q.conteudoFonte.includes(PENDENTE_CONFIRMACAO), q.id);
  }
});

test('P9. informações variáveis (prazo, validade, UPFs) estão marcadas como histórico pendente', () => {
  const prazo = porNumero('7');
  assert.match(prazo.conteudoFonte, /prazo médio de dois dias/);
  assert.ok(prazo.bloqueios.includes('informacao_variavel'));
  assert.match(prazo.alertas.join(' '), /não deve ser apresentado como prazo garantido/);
  const validade = porNumero('8');
  assert.match(validade.conteudoFonte, /seis anos/);
  assert.ok(validade.bloqueios.includes('informacao_variavel'));
  const custo = porNumero('14');
  assert.match(custo.conteudoFonte, /3 UPFs/);
  assert.ok(custo.bloqueios.includes('informacao_variavel'));
  assert.match(custo.alertas.join(' '), /não apresentar como valor atual/);
  // Valores variáveis só aparecem nas perguntas correspondentes.
  for (const q of perguntas().filter((x) => !['7', '8', '14'].includes(x.numeroFonte))) {
    assert.doesNotMatch(q.conteudoFonte, /dois dias|seis anos|UPFs/, q.id);
  }
});

test('P10. menus e botões do SIGA estão marcados como procedimento do sistema a conferir', () => {
  for (const n of ['11', '12', '13', '15']) {
    const q = porNumero(n);
    assert.ok(q.bloqueios.includes('procedimento_do_sistema'), n);
    assert.match(q.alertas.join(' '), /interface|SIGA|caminho/i, n);
  }
});

// ---------- Contatos, normas e promessas ----------

test('C1. nenhum e-mail ou telefone é armazenado nos dados, na documentação nem nos testes', () => {
  const email = /[A-Za-z0-9._-]+@[A-Za-z0-9-]+\.[A-Za-z]{2,}/;
  const telefone = /(\(\d{2}\)|\b\d{2})\s?\d{4,5}[-\s]?\d{4}\b/;
  const arquivos = [
    ...fs.readdirSync(path.join(RAIZ, 'services', 'lac')).map((n) => path.join('services', 'lac', n)),
    'README.md',
    ...fs.readdirSync(path.join(RAIZ, 'docs')).map((n) => path.join('docs', n)),
    ...fs.readdirSync(path.join(RAIZ, 'tests')).map((n) => path.join('tests', n)),
  ];
  for (const arquivo of arquivos) {
    const texto = lerTexto(arquivo);
    assert.doesNotMatch(texto, email, arquivo);
    assert.doesNotMatch(texto, telefone, arquivo);
  }
});

test('C2. perguntas com contato citado no FAQ registram apenas a frase genérica', () => {
  for (const n of ['4', 'i', 'k']) {
    const q = porNumero(n);
    assert.ok(q.conteudoFonte.includes(CONTATO), n);
    assert.ok(q.bloqueios.includes('contato_desatualizado'), n);
  }
  assert.ok(porNumero('10').bloqueios.includes('contato_desatualizado'));
  for (const q of perguntas()) {
    assert.doesNotMatch(JSON.stringify(q), /@|whatsapp|e-?sac/i, q.id);
  }
});

test('C3. o Decreto nº 695/2020 não aparece e o Decreto nº 1.268/2022 não é apresentado como vigente atual', () => {
  const texto = lerTexto('services', 'lac', 'perguntas-frequentes.json');
  assert.doesNotMatch(texto, /695/);
  for (const n of ['4', '6']) {
    assert.match(porNumero(n).alertas.join(' '), /1\.585\/2022/, n);
    assert.ok(porNumero(n).bloqueios.includes('vigencia'), n);
  }
  assert.match(porNumero('6').conteudoFonte, /como o decreto vigente à época/);
  assert.match(porNumero('18').alertas.join(' '), /Decreto nº 697\/2020 não está cadastrado/);
});

test('C4. nenhuma pergunta garante emissão ou aprovação e o enquadramento depende de análise', () => {
  for (const q of perguntas()) {
    assert.doesNotMatch(q.conteudoFonte, /garant|certamente|aprovação automática|será emitid/i, q.id);
  }
  for (const n of ['4', '16', 'i', 'j']) assert.ok(porNumero(n).bloqueios.includes('enquadramento_dependente_de_analise'), n);
  assert.match(porNumero('4').alertas.join(' '), /este sistema orienta, mas não decide/);
});

test('C5. conflitos com a base atual estão sinalizados (perguntas 3 e 15)', () => {
  assert.ok(porNumero('3').bloqueios.includes('conflito_com_base'));
  assert.match(porNumero('3').alertas.join(' '), /item 4\.3 do TR 176/);
  assert.ok(porNumero('15').bloqueios.includes('conflito_com_base'));
  assert.match(porNumero('15').alertas.join(' '), /roteiro cadastrado/);
});

// ---------- Validador (cópias temporárias) ----------

test('V0. a base real passa na validação, inclusive as perguntas', () => {
  assert.deepEqual(validarServicos(RAIZ).erros, []);
  assert.deepEqual(validarPerguntas(arquivoPerguntas(), { idServico: 'lac', fontesPorId: fontesPorId() }), []);
});

test('V1. rejeita pergunta sem fonte, com fonte inexistente ou revogada', () => {
  comCopia(({ dir, editarJson }) => {
    editarJson('services/lac/perguntas-frequentes.json', (d) => {
      delete d.perguntas[0].fonteId;
      d.perguntas[1].fonteId = 'fonte-inexistente';
      d.perguntas[2].fonteId = 'decreto-695-2020';
    });
    const lista = erros(dir);
    temErro(lista, /pergunta sem fonteId/);
    temErro(lista, /fonteId "fonte-inexistente" não existe/);
    temErro(lista, /usa fonte revogada "decreto-695-2020"/);
  });
});

test('V2. rejeita id duplicado, tema inválido, bloqueio inválido e localização vazia', () => {
  comCopia(({ dir, editarJson }) => {
    editarJson('services/lac/perguntas-frequentes.json', (d) => {
      d.perguntas[1].id = d.perguntas[0].id;
      d.perguntas[2].tema = 'tema_inventado';
      d.perguntas[3].bloqueios = ['bloqueio_inventado'];
      d.perguntas[4].localizacaoFonte = '  ';
    });
    const lista = erros(dir);
    temErro(lista, /id duplicado/);
    temErro(lista, /tema inválido/);
    temErro(lista, /bloqueios deve ser uma lista de motivos válidos/);
    temErro(lista, /localizacaoFonte obrigatória/);
  });
});

test('V3. rejeita pergunta em validação publicada e resposta publicável antes da aprovação', () => {
  comCopia(({ dir, editarJson }) => {
    editarJson('services/lac/perguntas-frequentes.json', (d) => {
      d.perguntas[0].publicado = true;
      d.perguntas[1].respostaPublicavel = 'Resposta de teste.';
    });
    const lista = erros(dir);
    temErro(lista, /pergunta em_validacao não pode estar publicada/);
    temErro(lista, /pergunta publicada exige respostaPublicavel/);
    temErro(lista, /respostaPublicavel só pode ser preenchida após revisão de atualidade concluída e validação/);
  });
});

test('V4. rejeita pergunta publicada com bloqueios, revisão pendente ou fonte não publicada', () => {
  comCopia(({ dir, editarJson }) => {
    editarJson('services/lac/perguntas-frequentes.json', (d) => {
      Object.assign(d.perguntas[0], { publicado: true, statusValidacao: 'validado', revisaoAtualidade: 'concluida', respostaPublicavel: 'Resposta de teste.' });
      Object.assign(d.perguntas[1], { publicado: true, statusValidacao: 'validado', respostaPublicavel: null });
    });
    const lista = erros(dir);
    temErro(lista, /pergunta publicada não pode ter bloqueios/);
    temErro(lista, /pergunta publicada não pode usar fonte não publicada "faq-lac-2022"/);
    temErro(lista, /pergunta publicada não pode ter revisão de atualidade pendente/);
  });
});

test('V5. rejeita e-mail ou telefone em qualquer campo (dados sintéticos de teste)', () => {
  const emailSintetico = ['usuario', 'exemplo.test'].join('@');
  const telefoneSintetico = ['(00)', '0000-0000'].join(' ');
  comCopia(({ dir, editarJson }) => {
    editarJson('services/lac/perguntas-frequentes.json', (d) => {
      d.perguntas[0].conteudoFonte += ` ${emailSintetico}`;
      d.perguntas[1].alertas = [`Ligar para ${telefoneSintetico}`];
      d.pendencia += ` ${emailSintetico}`;
    });
    const lista = erros(dir);
    assert.ok(lista.filter((e) => /contém e-mail ou telefone/.test(e)).length >= 3, lista.join('\n'));
  });
});

test('V6. rejeita alertas inválidos, lista de perguntas inválida e serviceId divergente', () => {
  comCopia(({ dir, editarJson }) => {
    editarJson('services/lac/perguntas-frequentes.json', (d) => {
      d.perguntas[0].alertas = ['   '];
      d.serviceId = 'outro';
    });
    const lista = erros(dir);
    temErro(lista, /alertas deve ser uma lista de textos não vazios/);
    temErro(lista, /serviceId "outro" difere/);
  });
  comCopia(({ dir, editarJson }) => {
    editarJson('services/lac/perguntas-frequentes.json', (d) => { d.perguntas = {}; });
    temErro(erros(dir), /"perguntas" deve ser uma lista/);
  });
});

// ---------- Assistente e interface ----------

test('A1. nenhuma pergunta está disponível para resposta do chat; conteudoFonte nunca é exposto', () => {
  assert.deepEqual(perguntasDisponiveisParaAssistente(arquivoPerguntas(), fontesPorId()), []);
  const base = {
    id: 'x', pergunta: 'P?', conteudoFonte: 'texto histórico', respostaPublicavel: 'Resposta aprovada.', fonteId: 'f1',
    publicado: true, statusValidacao: 'validado', revisaoAtualidade: 'concluida', bloqueios: [],
  };
  const fonte = (extra) => new Map([['f1', { id: 'f1', publicado: true, vigencia: { situacao: 'vigente' }, ...extra }]]);
  const liberadas = perguntasDisponiveisParaAssistente({ perguntas: [base] }, fonte({}));
  assert.deepEqual(liberadas, [{ id: 'x', pergunta: 'P?', respostaPublicavel: 'Resposta aprovada.', fonteId: 'f1' }]);
  assert.equal('conteudoFonte' in liberadas[0], false);
  for (const variante of [
    { publicado: false }, { revisaoAtualidade: 'pendente' }, { statusValidacao: 'em_validacao' },
    { respostaPublicavel: null }, { bloqueios: ['desatualizacao'] },
  ]) {
    assert.equal(perguntasDisponiveisParaAssistente({ perguntas: [{ ...base, ...variante }] }, fonte({})).length, 0, JSON.stringify(variante));
  }
  assert.equal(perguntasDisponiveisParaAssistente({ perguntas: [base] }, fonte({ publicado: false })).length, 0);
  assert.equal(perguntasDisponiveisParaAssistente({ perguntas: [base] }, fonte({ vigencia: { situacao: 'revogada' } })).length, 0);
});

test('A2. a interface não foi alterada e não contém o conteúdo do FAQ', () => {
  const arquivos = fs.readdirSync(path.join(RAIZ, 'src')).sort();
  // Passo 6 acrescentou src/assistant.js (reconhecimento local de intenção); nenhum arquivo importa o JSON do conteúdo.
  assert.deepEqual(arquivos, ['assistant.js', 'chat.js', 'main.js', 'styles.css']);
  const proibido = /FAQ|UPF|perguntas-frequentes|shapefile|decreto|CONSEMA|services\//i;
  for (const arquivo of ['index.html', ...arquivos.map((n) => path.join('src', n))]) {
    assert.doesNotMatch(lerTexto(arquivo), proibido, arquivo);
  }
});

// ---------- Auditoria de completude ----------

test('N1. normas do FAQ: Decreto nº 1.268/2022 bloqueado por vigência e nunca confirmado pelo FAQ', () => {
  const mencionam = perguntas().filter((q) => /1\.268/.test(`${q.pergunta} ${q.conteudoFonte} ${q.alertas.join(' ')}`));
  assert.deepEqual(mencionam.map((q) => q.numeroFonte), ['4', '6']);
  for (const q of mencionam) {
    assert.ok(q.bloqueios.includes('vigencia'), q.id);
    assert.match(q.alertas.join(' '), /1\.585\/2022/, q.id);
  }
  assert.doesNotMatch(perguntas().map((q) => q.conteudoFonte).join(' '), /continua vigente|está vigente|permanece vigente/i);
  assert.equal(fontesPorId().get('decreto-1268-2022').vigencia.situacao, 'alterada');
});

test('N2. "Lei complementar 688/2021": numeração do FAQ preservada, sem equiparar à LC nº 668/2020', () => {
  const q = porNumero('4');
  assert.match(q.conteudoFonte, /lei complementar citada como 688\/2021/);
  const alertas = q.alertas.join(' ');
  assert.match(alertas, /numeração encontrada no FAQ/);
  assert.match(alertas, /Lei Complementar nº 668\/2020/);
  assert.match(alertas, /Não se pode afirmar que sejam a mesma norma/);
  assert.match(alertas, /fonte complementar e de confirmação/);
  assert.ok(q.bloqueios.includes('fonte_complementar'));
  assert.doesNotMatch(q.conteudoFonte, /668/);
});

test('N3. Decreto nº 697/2020, Resolução CONSEMA, TR nº 177 e normas de isenção não foram cadastrados como fontes', () => {
  const textoFontes = JSON.stringify(fontes());
  assert.doesNotMatch(textoFontes, /697|CONSEMA|\b177\b|isen[çc][ãa]o|11\.179|10\.905/i);
  assert.match(porNumero('18').conteudoFonte, /Decreto nº 697\/2020/);
  assert.match(porNumero('18').alertas.join(' '), /Decreto nº 697\/2020 não está cadastrado na base e a resposta depende da confirmação de sua vigência e aplicabilidade/);
  assert.ok(porNumero('18').bloqueios.includes('vigencia'));
  assert.match(porNumero('6').alertas.join(' '), /Resolução CONSEMA 41\/2021 não está cadastrada na base/);
  assert.ok(porNumero('6').bloqueios.includes('fonte_complementar'));
  assert.match(porNumero('j').alertas.join(' '), /CONSEMA citada não está cadastrada/);
});

test('N4. conflitos e dependências das perguntas 3, 4, 10, 11, 15, 16, 17 e 18 estão registrados', () => {
  const alertas = (n) => porNumero(n).alertas.join(' | ');
  assert.match(alertas('3'), /item 4\.3 do TR 176.*conflito/);
  assert.match(alertas('4'), /não pode ser usada pelo assistente para decidir enquadramento/);
  assert.match(alertas('10'), /redação da resposta no FAQ é confusa/);
  assert.match(alertas('15'), /difere do descrito no roteiro cadastrado/);
  assert.ok(porNumero('15').bloqueios.includes('conflito_com_base'));
  assert.match(alertas('16'), /dependem de análise e de confirmação/);
  assert.match(alertas('17'), /depende da revisão do item 2\.2 do TR 176/);
  assert.match(alertas('18'), /depende da confirmação de sua vigência/);
  for (const n of ['10', '11']) {
    assert.match(alertas(n), /ideia de emissão automática da licença após a assinatura/, n);
    assert.match(alertas(n), /não promete aprovação, prazo nem emissão/, n);
  }
});

test('N5. observações a até h: apenas temas na pendência, sem copiar contatos, valores, prazos ou regras', () => {
  const { pendencia } = arquivoPerguntas();
  for (const tema of ['representação legal', 'vínculo com o imóvel', 'áreas protegidas', 'Terras Indígenas', 'isenção', 'cadastro de pessoa jurídica', 'publicação', 'nome que aparece na licença']) {
    assert.ok(pendencia.includes(tema), tema);
  }
  assert.match(pendencia, /TR nº 177 e as normas de isenção citados nessas observações também precisam ser analisados no Passo 4/);
  assert.doesNotMatch(pendencia, /@|UPF|\b\d+ (dias|anos)\b|dois dias|seis anos|e-?sac|exige|deverá apresentar/i);
  assert.ok(pendencia.length < 1000, 'a pendência não deve reproduzir o texto das observações');
});

test('N6. o conteúdo das observações a até h não foi copiado para as 21 perguntas', () => {
  const conteudo = perguntas().map((q) => `${q.pergunta} ${q.conteudoFonte} ${q.alertas.join(' ')}`).join(' ');
  assert.doesNotMatch(conteudo, /Terras Ind[ií]genas|amortecimento|\bAPAs?\b|isen[çc][ãa]o|e-?sac|TR nº 177|11\.179|10\.905/i);
});

test('PUB. a validação rejeita cada condição que impede a publicação (dados sintéticos)', () => {
  const fonte = (extra) => new Map([['f1', { id: 'f1', publicado: true, vigencia: { situacao: 'vigente' }, ...extra }]]);
  const publicada = {
    id: 'x', numeroFonte: '1', pergunta: 'P?', tema: 'conceito', conteudoFonte: 'O FAQ de 2022 informa algo.',
    respostaPublicavel: 'Resposta aprovada.', fonteId: 'f1', localizacaoFonte: 'FAQ, pergunta 1',
    statusValidacao: 'validado', publicado: true, revisaoAtualidade: 'concluida', bloqueios: [], alertas: [],
  };
  const validar = (item, fontes = fonte({})) =>
    validarPerguntas({ serviceId: 'lac', statusValidacao: 'validado', perguntas: [item], pendencia: 'PENDENTE: teste' }, { idServico: 'lac', fontesPorId: fontes });
  assert.deepEqual(validar(publicada), []);
  const casos = [
    [{ statusValidacao: 'em_validacao' }, /não pode estar publicada/],
    [{ revisaoAtualidade: 'pendente' }, /revisão de atualidade pendente/],
    [{ respostaPublicavel: null }, /exige respostaPublicavel/],
    [{ respostaPublicavel: '' }, /respostaPublicavel deve ser null ou um texto não vazio/],
    [{ respostaPublicavel: '   ' }, /respostaPublicavel deve ser null ou um texto não vazio/],
    [{ bloqueios: ['desatualizacao'] }, /não pode ter bloqueios/],
    [{ publicado: 'sim' }, /publicado deve ser booleano/],
  ];
  for (const [extra, regex] of casos) temErro(validar({ ...publicada, ...extra }), regex);
  temErro(validar(publicada, fonte({ publicado: false })), /não pode usar fonte não publicada/);
  temErro(validar(publicada, new Map()), /não existe em fontes\.json/);
  temErro(validar(publicada, fonte({ vigencia: { situacao: 'revogada' } })), /usa fonte revogada/);
});

test('PUB2. a pergunta 2 segue indisponível ao assistente mesmo sem bloqueio específico', () => {
  const q = porNumero('2');
  assert.deepEqual(q.bloqueios, []);
  assert.equal(q.statusValidacao, 'em_validacao');
  assert.equal(q.revisaoAtualidade, 'pendente');
  assert.equal(q.publicado, false);
  assert.equal(q.respostaPublicavel, null);
  const disponiveis = perguntasDisponiveisParaAssistente(arquivoPerguntas(), fontesPorId());
  assert.equal(disponiveis.some((d) => d.id === q.id), false);
  assert.equal(disponiveis.length, 0);
});

test('CAMPOS. numeroFonte único, temas sem repetição, bloqueios sem duplicata e alertas vazios permitidos', () => {
  const numeros = perguntas().map((q) => q.numeroFonte);
  assert.equal(new Set(numeros).size, 21);
  comCopia(({ dir, editarJson }) => {
    editarJson('services/lac/perguntas-frequentes.json', (d) => {
      d.perguntas[1].numeroFonte = d.perguntas[0].numeroFonte;
      d.perguntas[2].temasSecundarios = ['documentos', 'documentos'];
      d.perguntas[3].temasSecundarios = [d.perguntas[3].tema];
      d.perguntas[4].bloqueios = ['desatualizacao', 'desatualizacao'];
      d.perguntas[5].temasSecundarios = ['tema_inventado'];
    });
    const lista = erros(dir);
    temErro(lista, /numeroFonte duplicado/);
    temErro(lista, /temasSecundarios com tema repetido/);
    temErro(lista, /temasSecundarios repete o tema principal/);
    temErro(lista, /bloqueios com motivo repetido/);
    temErro(lista, /temasSecundarios deve ser uma lista de temas válidos/);
  });
  comCopia(({ dir, editarJson }) => {
    editarJson('services/lac/perguntas-frequentes.json', (d) => { d.perguntas[3].alertas = []; });
    assert.deepEqual(erros(dir), []);
  });
});

test('CONTATOS. a mensagem de erro não repete o valor do contato encontrado', () => {
  const emailSintetico = ['usuario', 'exemplo.test'].join('@');
  comCopia(({ dir, editarJson }) => {
    editarJson('services/lac/perguntas-frequentes.json', (d) => { d.perguntas[0].conteudoFonte += ` ${emailSintetico}`; });
    const lista = erros(dir);
    temErro(lista, /contém e-mail ou telefone/);
    assert.equal(lista.some((e) => e.includes(emailSintetico) || e.includes('exemplo.test')), false);
  });
});

test('DOC. README, arquitetura e backlog descrevem o estado das perguntas e o bloqueio ao assistente', () => {
  const readme = lerTexto('README.md');
  assert.match(readme, /21 perguntas transcritas do FAQ de 2022/);
  assert.match(readme, /não publicadas e sem resposta publicável/);
  assert.match(readme, /Informações variáveis.*procedimentos do sistema, normas a confirmar e contatos estão bloqueados/);
  assert.match(readme, /observações a até h do FAQ serão analisadas.*nenhum conteúdo do FAQ está disponível para respostas do assistente/);
  const arquitetura = lerTexto('docs', 'ARQUITETURA.md');
  assert.match(arquitetura, /as 21 perguntas de `perguntas-frequentes\.json`/);
  assert.match(arquitetura, /`conteudoFonte` é só registro da fonte e \*\*nunca\*\* é usado pelo assistente/);
  assert.match(arquitetura, /observações a até h do FAQ não foram cadastradas e ficam para a revisão do Passo 4/);
  const backlog = lerTexto('docs', 'BACKLOG.md');
  assert.match(backlog, /transcrever 21 perguntas do FAQ de 2022/);
  assert.match(backlog, /analisar as observações a até h do FAQ de 2022 \(Passo 4\)/);
  assert.match(backlog, /em andamento; não concluído/);
});

test('A3. documentos e roteiro do Passo 1 e 2 seguem como estavam (28 itens, 15 etapas)', () => {
  assert.equal(lerJson('services', 'lac', 'documentos.json').documentos.length, 28);
  assert.equal(lerJson('services', 'lac', 'service.json').etapas.length, 15);
});
