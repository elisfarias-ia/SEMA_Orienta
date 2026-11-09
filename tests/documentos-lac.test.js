// Passo 2: checklist de documentos da LAC, transcrito do TR nº 176/SUIMIS/SEMA/MT (2020).
// Todos os itens estão em validação, não publicados, com obrigatoriedade atual NÃO confirmada (obrigatorio: null).
// Falhas são provocadas em cópias temporárias; os arquivos reais nunca são alterados.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  validarServicos,
  validarDocumentos,
  documentosDisponiveisParaAssistente,
  GRUPOS_DOCUMENTO,
  ESTADOS_REVISAO_ATUALIDADE,
} from '../scripts/validate-services.js';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lerTexto = (...partes) => fs.readFileSync(path.join(RAIZ, ...partes), 'utf8');
const lerJson = (...partes) => JSON.parse(lerTexto(...partes));
const arquivoDocumentos = () => lerJson('services', 'lac', 'versoes', 'v1', 'documentos.json');
const documentos = () => arquivoDocumentos().documentos;
const fontes = () => lerJson('services', 'lac', 'versoes', 'v1', 'fontes.json').fontes;
const fontesPorId = () => new Map(fontes().map((f) => [f.id, f]));
const porNumero = (n) => {
  const item = documentos().find((d) => new RegExp(`^TR 176, item ${n.replace(/\./g, '\\.')}( |$)`).test(d.localizacaoFonte));
  assert.ok(item, `item ${n} não encontrado`);
  return item;
};
const alertasTexto = (n) => porNumero(n).alertas.join(' | ');

function comCopia(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sema-orienta-docs-'));
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

const NUMEROS_ESPERADOS = [
  '1.1.1', '1.1.2', '1.1.3', '1.2.1', '1.2.2', '1.2.3', '1.2.4', '1.2.5', '1.3.1', '1.3.2', '1.3.3',
  '1.4.1', '1.4.2', '1.4.3', '2.1', '2.2', '2.3', '2.4', '3', '4.1', '4.2', '4.3', '4.4', '4.5', '4.6',
  '4.7', '5.1', '5.2',
];

// ---------- Estrutura e conteúdo transcrito ----------

test('D1. existem exatamente 28 documentos', () => {
  assert.equal(documentos().length, 28);
});

test('D2. há cinco grupos, com 14, 4, 1, 7 e 2 itens', () => {
  const contagem = {};
  for (const d of documentos()) contagem[d.grupo] = (contagem[d.grupo] ?? 0) + 1;
  assert.deepEqual(contagem, {
    empreendedor_empreendimento: 14,
    responsavel_tecnico: 4,
    imovel: 1,
    documentos_especificos: 7,
    estudos_planos_projetos: 2,
  });
  assert.deepEqual(Object.keys(contagem).sort(), [...GRUPOS_DOCUMENTO].sort());
});

test('D3. os ids são únicos', () => {
  const ids = documentos().map((d) => d.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('D4. todos os documentos citam a fonte tr-176-lac', () => {
  assert.ok(documentos().every((d) => d.fonteId === 'tr-176-lac'));
});

test('D5. a fonte existe, é de origem oficial e não é revogada', () => {
  const fonte = fontesPorId().get('tr-176-lac');
  assert.ok(fonte);
  assert.equal(fonte.origemOficial, true);
  assert.equal(fonte.statusValidacao, 'validado');
  assert.equal(fonte.publicado, false);
  assert.equal(fonte.vigencia.situacao, 'nao_se_aplica');
});

test('D6. a URL do TR 176 usa o domínio oficial com www e a descrição registra a consulta', () => {
  const fonte = fontesPorId().get('tr-176-lac');
  assert.equal(
    fonte.url,
    'https://www.sema.mt.gov.br/site/phocadownload/Termo_de_ref/TERMO%20DE%20REFERENCIA%20-%20TR%20N%20176_SUIMIS_SEMA_MT%20LAC.docx',
  );
  assert.equal(fonte.dataConsulta, '2026-11-09');
  assert.match(fonte.descricao, /domínio oficial da SEMA-MT/);
  assert.match(fonte.descricao, /TERMO DE REFERÊNCIA PADRÃO Nº 176\/SUIMIS\/SEMA\/MT/);
  assert.match(fonte.descricao, /Licença por Adesão e Compromisso – LAC/);
  assert.match(fonte.descricao, /é de 2020/);
  assert.match(fonte.descricao, /sujeito à validação de atualidade/);
});

test('D7. todos os itens têm localização na fonte, com a numeração do TR (28 numerações distintas)', () => {
  assert.ok(documentos().every((d) => /^TR 176, item \S+/.test(d.localizacaoFonte)));
  const numeros = documentos().map((d) => /^TR 176, item (\S+)/.exec(d.localizacaoFonte)[1]);
  assert.deepEqual(numeros, NUMEROS_ESPERADOS);
});

test('D8. todos os documentos estão em em_validacao', () => {
  assert.ok(documentos().every((d) => d.statusValidacao === 'em_validacao'));
  assert.equal(arquivoDocumentos().statusValidacao, 'em_validacao');
});

test('D9. nenhum documento está publicado', () => {
  assert.ok(documentos().every((d) => d.publicado === false));
  assert.doesNotMatch(lerTexto('services', 'lac', 'versoes', 'v1', 'documentos.json'), /"publicado"\s*:\s*true/);
});

test('D10. todos têm revisaoAtualidade pendente', () => {
  assert.ok(documentos().every((d) => d.revisaoAtualidade === 'pendente'));
  assert.ok(ESTADOS_REVISAO_ATUALIDADE.includes('pendente'));
});

test('D11. todos têm obrigatorio null (obrigatoriedade atual não confirmada)', () => {
  assert.ok(documentos().every((d) => d.obrigatorio === null));
  assert.doesNotMatch(lerTexto('services', 'lac', 'versoes', 'v1', 'documentos.json'), /"obrigatorio"\s*:\s*(true|false)/);
});

test('D12. condição e aplicabilidade são coerentes com o TR', () => {
  for (const d of documentos()) {
    assert.equal(typeof d.condicional, 'boolean', d.id);
    assert.ok(d.aplicabilidade.trim().length > 0, `sem aplicabilidade: ${d.id}`);
  }
  const condicionais = documentos().filter((d) => d.condicional).map((d) => d.localizacaoFonte.split(' ')[3]);
  assert.deepEqual(condicionais, [
    '1.1.1', '1.1.2', '1.1.3', '1.2.1', '1.2.2', '1.2.3', '1.2.4', '1.2.5', '1.3.1', '1.3.2', '1.3.3',
    '1.4.1', '1.4.2', '1.4.3', '2.1', '3', '4.3', '4.6', '4.7', '5.1', '5.2',
  ]);
  assert.match(porNumero('1.1.1').aplicabilidade, /pessoa física/i);
  assert.match(porNumero('1.2.1').aplicabilidade, /pessoa jurídica/i);
  assert.match(porNumero('1.3.1').aplicabilidade, /espólio/i);
  assert.match(porNumero('1.4.2').aplicabilidade, /advogado/i);
  assert.match(porNumero('2.1').aplicabilidade, /substituir o proprietário/i);
  assert.match(porNumero('4.3').aplicabilidade, /Se houver uso de água/);
  assert.match(porNumero('4.6').aplicabilidade, /urbano/i);
  assert.match(porNumero('4.7').aplicabilidade, /rural/i);
});

// ---------- Alertas específicos ----------

test('D13. cópia autenticada: alertas nos itens 1.1.1 e 1.1.2', () => {
  for (const n of ['1.1.1', '1.1.2']) assert.match(alertasTexto(n), /cópia autenticada.*confirmação atual/i, n);
});

test('D14. firma reconhecida: alertas nos itens 1.4.1 e 2.1', () => {
  for (const n of ['1.4.1', '2.1']) assert.match(alertasTexto(n), /firma reconhecida.*confirmação atual/i, n);
});

test('D15. item 1.2.5: alerta do "RH" no lugar de "RG", sem corrigir silenciosamente', () => {
  const item = porNumero('1.2.5');
  assert.match(item.alertas.join(' '), /"RH".*"RG"/);
  assert.match(item.observacao, /cópia do RH, CPF e comprovante de endereço/);
  assert.match(item.nome, /RG/);
});

test('D16. item 1.3.2: alerta do nome de arquivo aparentemente de outro assunto', () => {
  assert.match(alertasTexto('1.3.2'), /ATO_NOMEACAO_TITULAR_JURIDICO/);
  assert.match(alertasTexto('1.3.2'), /outro assunto/);
});

test('D17. item 2.2: alertas de LAS, RLAS, RLAC, sigla LAC, autenticação, critérios e reaproveitamento', () => {
  const texto = alertasTexto('2.2');
  assert.match(texto, /LAS, RLAS e RLAC/);
  assert.match(texto, /LAC.*significado diferente/);
  assert.match(texto, /cópia autenticada/);
  assert.match(texto, /critérios atuais da ART/);
  assert.match(texto, /reaproveitado de outro modelo/);
  assert.ok(porNumero('2.2').alertas.length >= 5);
});

test('D18. item 3: alerta do Decreto nº 697/2020, que não está cadastrado na base', () => {
  const texto = alertasTexto('3');
  assert.match(texto, /Decreto nº 697, de 03 de novembro de 2020/);
  assert.match(texto, /ainda não está cadastrada na base/);
  assert.match(texto, /vigência e a aplicabilidade.*confirmadas/);
  assert.equal(fontes().some((f) => /697/.test(`${f.id} ${f.titulo}`)), false);
  assert.equal(lerJson('services', 'lac', 'versoes', 'v1', 'service.json').legislacao.some((id) => /697/.test(id)), false);
});

test('D18b. item 4.1: alerta de e-mails e WhatsApp; nenhum dado pessoal é registrado', () => {
  assert.match(alertasTexto('4.1'), /e-mails ativos e WhatsApp/);
  assert.match(alertasTexto('4.1'), /formato do requerimento/);
  assert.match(porNumero('4.1').observacao, /não solicita nem armazena/);
  assert.doesNotMatch(lerTexto('services', 'lac', 'versoes', 'v1', 'documentos.json'), /[\w.-]+@[\w-]+\.[a-z]{2,}|\(\d{2}\)\s?\d{4,5}-?\d{4}/i);
});

test('D19. item 4.2: alerta da publicação em periódico e Diário Oficial', () => {
  assert.match(alertasTexto('4.2'), /periódico e no Diário Oficial.*confirmação atual/);
});

test('D20. item 4.7: alerta de Licença Ambiental Única e SIMCAR', () => {
  assert.match(alertasTexto('4.7'), /Licença Ambiental Única e ao SIMCAR.*validação atual/);
});

test('D21. itens 5.1 e 5.2: aplicação condicional conforme as expressões do TR; 5.2 é um único item composto', () => {
  const a = porNumero('5.1');
  const b = porNumero('5.2');
  assert.equal(a.condicional, true);
  assert.equal(b.condicional, true);
  assert.match(a.aplicabilidade + a.alertas.join(' '), /caso houver/);
  assert.match(a.aplicabilidade + a.alertas.join(' '), /para os casos que for pertinente/);
  assert.match(b.aplicabilidade + b.alertas.join(' '), /se for pertinente/);
  assert.match(b.aplicabilidade + b.alertas.join(' '), /caso haja/);
  assert.match(b.nome, /item composto/);
  assert.equal(documentos().filter((d) => /^tr176-5-2/.test(d.id)).length, 1);
});

test('D21b. todo item tem uma lista de alertas (vazia ou de textos não vazios)', () => {
  for (const d of documentos()) {
    assert.ok(Array.isArray(d.alertas), d.id);
    assert.ok(d.alertas.every((a) => typeof a === 'string' && a.trim() !== ''), d.id);
  }
});

// ---------- Validador: base real e rejeições (cópias temporárias) ----------

test('D-V0. a base real passa na validação, inclusive o checklist', () => {
  assert.deepEqual(validarServicos(RAIZ).erros, []);
  assert.deepEqual(validarDocumentos(arquivoDocumentos(), { idServico: 'lac', fontesPorId: fontesPorId() }), []);
});

test('D22. rejeita documento sem fonte', () => {
  comCopia(({ dir, editarJson }) => {
    editarJson('services/lac/versoes/v1/documentos.json', (d) => { delete d.documentos[0].fonteId; });
    temErro(erros(dir), /documento sem fonteId/);
  });
});

test('D23. rejeita fonte inexistente ou revogada', () => {
  comCopia(({ dir, editarJson }) => {
    editarJson('services/lac/versoes/v1/documentos.json', (d) => {
      d.documentos[0].fonteId = 'fonte-inexistente';
      d.documentos[1].fonteId = 'decreto-695-2020';
    });
    const lista = erros(dir);
    temErro(lista, /fonteId "fonte-inexistente" não existe/);
    temErro(lista, /usa fonte revogada "decreto-695-2020"/);
  });
});

test('D24. rejeita localização da fonte vazia', () => {
  comCopia(({ dir, editarJson }) => {
    editarJson('services/lac/versoes/v1/documentos.json', (d) => { d.documentos[3].localizacaoFonte = '  '; });
    temErro(erros(dir), /localizacaoFonte obrigatória/);
  });
});

test('D25. rejeita documento em validação marcado como publicado', () => {
  comCopia(({ dir, editarJson }) => {
    editarJson('services/lac/versoes/v1/documentos.json', (d) => { d.documentos[0].publicado = true; });
    temErro(erros(dir), /documento em_validacao não pode estar publicado/);
  });
});

test('D26. rejeita documento publicado com revisão de atualidade pendente ou fonte não publicada', () => {
  comCopia(({ dir, editarJson }) => {
    editarJson('services/lac/versoes/v1/documentos.json', (d) => {
      d.documentos[0].publicado = true;
      d.documentos[0].statusValidacao = 'validado';
    });
    const lista = erros(dir);
    temErro(lista, /documento publicado não pode ter revisão de atualidade pendente/);
    temErro(lista, /documento publicado não pode usar fonte não publicada "tr-176-lac"/);
  });
});

test('D27. rejeita documento sem aplicabilidade (inclusive os condicionais)', () => {
  comCopia(({ dir, editarJson }) => {
    editarJson('services/lac/versoes/v1/documentos.json', (d) => {
      d.documentos[0].condicional = true;
      d.documentos[0].aplicabilidade = '';
    });
    temErro(erros(dir), /"aplicabilidade" obrigatório/);
  });
});

test('D28. rejeita id de documento duplicado', () => {
  comCopia(({ dir, editarJson }) => {
    editarJson('services/lac/versoes/v1/documentos.json', (d) => { d.documentos[1].id = d.documentos[0].id; });
    temErro(erros(dir), /id duplicado/);
  });
});

test('D-V1. rejeita obrigatorio true ou false enquanto a revisão de atualidade está pendente', () => {
  comCopia(({ dir, editarJson }) => {
    editarJson('services/lac/versoes/v1/documentos.json', (d) => {
      d.documentos[0].obrigatorio = true;
      d.documentos[1].obrigatorio = false;
      d.documentos[2].obrigatorio = 'sim';
    });
    const lista = erros(dir);
    assert.equal(lista.filter((e) => /obrigatoriedade só pode ser definida/.test(e)).length, 2, lista.join('\n'));
    temErro(lista, /obrigatorio deve ser true, false ou null/);
  });
});

test('D-V2. rejeita grupo inválido, estado de revisão inválido e alertas inválidos', () => {
  comCopia(({ dir, editarJson }) => {
    editarJson('services/lac/versoes/v1/documentos.json', (d) => {
      d.documentos[0].grupo = 'outro_grupo';
      d.documentos[1].revisaoAtualidade = 'ok';
      d.documentos[2].alertas = ['', 3];
      d.documentos[3].publicado = 'nao';
    });
    const lista = erros(dir);
    temErro(lista, /grupo inválido/);
    temErro(lista, /revisaoAtualidade inválida/);
    temErro(lista, /alertas deve ser uma lista de textos não vazios/);
    temErro(lista, /publicado deve ser booleano/);
  });
});

// ---------- Escopo do passo ----------

test('D29. as perguntas frequentes foram cadastradas no Passo 3 (21) e nenhuma está publicada', () => {
  const { perguntas } = lerJson('services', 'lac', 'versoes', 'v1', 'perguntas-frequentes.json');
  assert.equal(perguntas.length, 21);
  assert.ok(perguntas.every((q) => q.publicado === false));
});

test('D30. a interface não foi alterada e não contém o checklist', () => {
  const arquivos = fs.readdirSync(path.join(RAIZ, 'src')).sort();
  // Passo 6 acrescentou src/assistant.js (reconhecimento local de intenção); nenhum arquivo importa o JSON do conteúdo.
  assert.deepEqual(arquivos, ['assistant.js', 'chat.js', 'main.js', 'styles.css']);
  const proibido = /tr176|decreto|certid[ãa]o|procura[çc][ãa]o|simcar|documentos\.json|services\/|TR 176|\bART\b/i;
  for (const arquivo of ['index.html', ...arquivos.map((n) => path.join('src', n))]) {
    // "ART" é conferida como palavra inteira (\bART\b), para não acusar "start" do CSS.
    assert.doesNotMatch(lerTexto(arquivo), proibido, arquivo);
  }
});

test('D31. nenhum documento está disponível para resposta do chat', () => {
  assert.deepEqual(documentosDisponiveisParaAssistente(arquivoDocumentos(), fontesPorId()), []);
  // A regra libera apenas item publicado, validado, com revisão concluída e fonte publicada e não revogada.
  const base = { id: 'x', publicado: true, statusValidacao: 'validado', revisaoAtualidade: 'concluida', fonteId: 'f1' };
  const fonte = (extra) => new Map([['f1', { id: 'f1', publicado: true, vigencia: { situacao: 'vigente' }, ...extra }]]);
  assert.equal(documentosDisponiveisParaAssistente({ documentos: [base] }, fonte({})).length, 1);
  assert.equal(documentosDisponiveisParaAssistente({ documentos: [{ ...base, publicado: false }] }, fonte({})).length, 0);
  assert.equal(documentosDisponiveisParaAssistente({ documentos: [{ ...base, revisaoAtualidade: 'pendente' }] }, fonte({})).length, 0);
  assert.equal(documentosDisponiveisParaAssistente({ documentos: [base] }, fonte({ publicado: false })).length, 0);
  assert.equal(documentosDisponiveisParaAssistente({ documentos: [base] }, fonte({ vigencia: { situacao: 'revogada' } })).length, 0);
});

// ---------- Ajustes semânticos: alertas, observação da fonte e significado de "condicional" ----------

test('A1. alertas está presente em todos os documentos e é sempre uma lista', () => {
  assert.equal(documentos().length, 28);
  for (const d of documentos()) assert.ok(Array.isArray(d.alertas), d.id);
});

test('A2. lista vazia de alertas é aceita (15 itens sem inconsistência específica)', () => {
  const vazios = documentos().filter((d) => d.alertas.length === 0);
  assert.equal(vazios.length, 15);
  assert.deepEqual(vazios.map((d) => d.localizacaoFonte.split(' ')[3]), [
    '1.1.3', '1.2.1', '1.2.2', '1.2.3', '1.2.4', '1.3.1', '1.3.3', '1.4.2', '1.4.3', '2.3', '2.4', '4.3', '4.4', '4.5', '4.6',
  ]);
  comCopia(({ dir, editarJson }) => {
    editarJson('services/lac/versoes/v1/documentos.json', (d) => { d.documentos[0].alertas = []; });
    assert.deepEqual(erros(dir), []);
  });
});

test('A3. texto vazio ou só com espaços dentro de alertas é rejeitado; alertas fora de lista também', () => {
  for (const alertas of [[''], ['   '], ['ok', '\t\n'], 'texto solto', null]) {
    comCopia(({ dir, editarJson }) => {
      editarJson('services/lac/versoes/v1/documentos.json', (d) => { d.documentos[0].alertas = alertas; });
      temErro(erros(dir), /alertas deve ser uma lista de textos não vazios/);
    });
  }
  comCopia(({ dir, editarJson }) => {
    editarJson('services/lac/versoes/v1/documentos.json', (d) => { delete d.documentos[0].alertas; });
    temErro(erros(dir), /alertas deve ser uma lista de textos não vazios/);
  });
});

test('A4. os 13 itens com inconsistência específica mantêm seus alertas (e só eles têm alertas)', () => {
  const comAlertas = documentos().filter((d) => d.alertas.length > 0);
  assert.deepEqual(comAlertas.map((d) => d.localizacaoFonte.split(' ')[3]), [
    '1.1.1', '1.1.2', '1.2.5', '1.3.2', '1.4.1', '2.1', '2.2', '3', '4.1', '4.2', '4.7', '5.1', '5.2',
  ]);
  for (const d of comAlertas) assert.ok(d.alertas.every((a) => a.trim().length > 0), d.id);
  assert.match(alertasTexto('1.1.1'), /autenticad/);
  assert.match(alertasTexto('1.2.5'), /"RH".*"RG"/);
  assert.match(alertasTexto('1.3.2'), /ATO_NOMEACAO_TITULAR_JURIDICO/);
  assert.match(alertasTexto('1.4.1'), /firma reconhecida/);
  assert.match(alertasTexto('2.2'), /LAS, RLAS e RLAC/);
  assert.match(alertasTexto('3'), /Decreto nº 697/);
  assert.match(alertasTexto('4.7'), /Licença Ambiental Única e ao SIMCAR/);
});

test('A5. os 28 documentos seguem com revisaoAtualidade pendente, obrigatorio null e sem publicação', () => {
  assert.equal(documentos().length, 28);
  assert.ok(documentos().every((d) => d.revisaoAtualidade === 'pendente'));
  assert.ok(documentos().every((d) => d.obrigatorio === null));
  assert.ok(documentos().every((d) => d.publicado === false));
});

test('A6. a fonte mantém a URL com www e a observação de vigência não traz ocorrência técnica de acesso', () => {
  const fonte = fontesPorId().get('tr-176-lac');
  assert.match(fonte.url, /^https:\/\/www\.sema\.mt\.gov\.br\//);
  assert.equal(fonte.dataConsulta, '2026-11-09');
  assert.equal(fonte.vigencia.situacao, 'nao_se_aplica');
  assert.equal(fonte.vigencia.observacao, 'A vigência jurídica não se aplica a esta fonte documental.');
  const tecnico = /timeout|time-out|falha de acesso|não respondeu|nao respondeu|sem ["“]?www|endereço anteriormente|URL anterior/i;
  assert.doesNotMatch(fonte.vigencia.observacao, tecnico);
  assert.doesNotMatch(fonte.descricao, tecnico);
  assert.match(fonte.descricao, /domínio oficial da SEMA-MT/);
  assert.match(fonte.descricao, /sujeito à validação de atualidade/);
});

test('A7. a estrutura e a documentação esclarecem que "condicional" não confirma obrigatoriedade atual', () => {
  const schema = lerJson('services', 'schemas', 'service.schema.json');
  const descricao = schema.$defs.documento.properties.condicional.description;
  assert.match(descricao, /condição descrita na fonte/);
  assert.match(descricao, /não significa que o documento esteja atualmente confirmado como obrigatório/);
  const arquitetura = lerTexto('docs', 'ARQUITETURA.md');
  assert.match(arquitetura, /`condicional: false` significa apenas que o TR não apresentou condição expressa/);
  assert.match(arquitetura, /sem confirmar que o documento seja hoje obrigatório/);
  assert.ok(documentos().every((d) => d.obrigatorio === null));
});

test('D-X. nenhum dado do FAQ, taxa, prazo ou contato de atendimento foi cadastrado no checklist', () => {
  const texto = lerTexto('services', 'lac', 'versoes', 'v1', 'documentos.json');
  assert.doesNotMatch(texto, /\bUPFs?\b|dois dias|dez dias|e-?SAC|R\$\s?\d|\b1 ?MB\b/i);
});
