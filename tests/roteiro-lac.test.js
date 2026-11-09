// Passo 1 do conteúdo da LAC: descrição, público, condições e roteiro de solicitação no SIGA.
// O conteúdo está em validação e NÃO publicado. Falhas são provocadas em cópias temporárias.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validarServicos } from '../scripts/validate-services.js';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lerTexto = (...partes) => fs.readFileSync(path.join(RAIZ, ...partes), 'utf8');
const lerJson = (...partes) => JSON.parse(lerTexto(...partes));
const servico = () => lerJson('services', 'lac', 'versoes', 'v1', 'service.json');
const fontes = () => lerJson('services', 'lac', 'versoes', 'v1', 'fontes.json').fontes;
const roteiro = () => lerTexto('services', 'lac', 'versoes', 'v1', 'roteiro.md');

function secoesDoRoteiro() {
  const mapa = new Map();
  for (const bloco of roteiro().split(/^## /m).slice(1)) {
    const [titulo, ...resto] = bloco.split('\n');
    mapa.set(titulo.trim(), resto.join('\n').trim());
  }
  return mapa;
}

function comCopia(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sema-orienta-roteiro-'));
  fs.cpSync(path.join(RAIZ, 'services'), path.join(dir, 'services'), { recursive: true });
  const editarJson = (rel, editar) => {
    const arquivo = path.join(dir, rel);
    const dados = JSON.parse(fs.readFileSync(arquivo, 'utf8'));
    editar(dados);
    fs.writeFileSync(arquivo, JSON.stringify(dados, null, 2));
  };
  const editarTexto = (rel, editar) => {
    const arquivo = path.join(dir, rel);
    fs.writeFileSync(arquivo, editar(fs.readFileSync(arquivo, 'utf8')));
  };
  try {
    return fn({ dir, editarJson, editarTexto });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test('P1-1. registro e serviço têm o mesmo status: em_validacao', () => {
  const registro = lerJson('services', 'registry.json').servicos[0];
  assert.equal(registro.statusValidacao, servico().statusValidacao);
  assert.equal(servico().statusValidacao, 'em_validacao');
});

test('P1-2. o serviço não está publicado (registro e service.json)', () => {
  assert.equal(lerJson('services', 'registry.json').servicos[0].publicado, false);
  assert.equal(servico().publicado, false);
});

test('P1-3. o roteiro e o service.json trazem as 15 etapas, na mesma ordem', () => {
  const etapas = servico().etapas;
  assert.equal(etapas.length, 15);
  const numeradas = secoesDoRoteiro()
    .get('Etapas')
    .split('\n')
    .map((linha) => /^(\d+)\.\s+(.+)$/.exec(linha))
    .filter(Boolean);
  assert.equal(numeradas.length, 15);
  numeradas.forEach((m, i) => {
    assert.equal(Number(m[1]), i + 1);
    assert.equal(m[2], etapas[i]);
  });
  assert.match(etapas[0], /SIGA/);
  assert.match(etapas[1], /Novo Requerimento/);
  assert.match(etapas[13], /Termo por Adesão e Compromisso/);
  assert.match(etapas[14], /assinatura do responsável/);
});

test('P1-4. as referências por fonteId existem e não citam fonte revogada', () => {
  const porId = new Map(fontes().map((f) => [f.id, f]));
  const { referencias } = servico();
  for (const campo of ['descricao', 'publico', 'condicoes', 'etapas', 'sistemaInicio']) {
    assert.ok(Array.isArray(referencias[campo]) && referencias[campo].length > 0, `sem referência: ${campo}`);
  }
  for (const [campo, ids] of Object.entries(referencias)) {
    for (const id of ids) {
      assert.ok(porId.has(id), `${campo}: fonte inexistente ${id}`);
      assert.notEqual(porId.get(id).vigencia.situacao, 'revogada', `${campo}: fonte revogada ${id}`);
    }
  }
});

test('P1-5. todas as seções do roteiro com conteúdo indicam fontes existentes', () => {
  const ids = new Set(fontes().map((f) => f.id));
  for (const [titulo, corpo] of secoesDoRoteiro()) {
    if (titulo === 'Fontes') continue;
    const linha = corpo.split('\n').find((l) => /^Fontes?:/.test(l));
    assert.ok(linha, `seção sem "Fontes:": ${titulo}`);
    for (const m of linha.matchAll(/`([^`]+)`/g)) assert.ok(ids.has(m[1]), `${titulo}: ${m[1]}`);
  }
});

test('P1-6. o Decreto nº 695/2020 só aparece como revogado e com a fonte da revogação (decreto-1268-2022)', () => {
  const textos = [roteiro(), JSON.stringify(servico().condicoes), servico().descricao, servico().publico, JSON.stringify(servico().etapas)];
  let mencoes = 0;
  for (const texto of textos) {
    for (const linha of texto.split('\n').filter((l) => /695/.test(l))) {
      mencoes += 1;
      assert.match(linha, /revog/i, `menção sem revogação: ${linha}`);
      assert.match(linha, /decreto-1268-2022/, `revogação sem a fonte: ${linha}`);
    }
  }
  assert.equal(mencoes, 2, 'o Decreto nº 695/2020 só pode ser mencionado como alerta de revogação (Observações e lista de Fontes)');
  assert.doesNotMatch(JSON.stringify(servico().referencias), /decreto-695-2020/);
  assert.doesNotMatch(roteiro().split('## Fontes')[1], /decreto-695-2020/);
  assert.equal(fontes().find((f) => f.id === 'decreto-695-2020').vigencia.situacao, 'revogada');
});

test('P1-7. as perguntas frequentes (Passo 3) seguem sem publicação', () => {
  const { perguntas } = lerJson('services', 'lac', 'versoes', 'v1', 'perguntas-frequentes.json');
  assert.ok(perguntas.every((q) => q.publicado === false && q.respostaPublicavel === null));
});

test('P1-8. a interface não recebeu conteúdo da LAC (index.html e src/)', () => {
  const arquivos = ['index.html', ...fs.readdirSync(path.join(RAIZ, 'src')).map((n) => path.join('src', n))];
  const proibido = /Novo Requerimento|SIGA|Termo de Adesão|geográficos|termo de responsabilidade|Decreto|Lei Complementar/i;
  for (const arquivo of arquivos) assert.doesNotMatch(lerTexto(arquivo), proibido, arquivo);
  assert.match(lerTexto('src', 'chat.js'), /RESPOSTA_TEMPORARIA/);
});

test('P1-9. o conteúdo não promete aprovação, prazo ou emissão e não decide enquadramento', () => {
  const texto = [servico().descricao, servico().publico, ...servico().condicoes, roteiro()].join('\n');
  assert.match(texto, /não decide se uma atividade pode obter a LAC/);
  assert.match(texto, /não promete aprovação, prazo ou emissão/);
  assert.match(texto, /não substitui a análise da SEMA/);
  assert.match(texto, /depende da atividade, do seu porte e potencial poluidor e das regras de enquadramento aplicáveis/);
  assert.doesNotMatch(texto, /\b\d+\s*(dias?|horas?|UPFs?)\b|R\$\s?\d|garant(e|imos) (a )?(aprovação|licença)/i);
});

test('P1-10. unidade, canal, responsável e data seguem pendentes; SIGA sem endereço cadastrado', () => {
  const s = servico();
  assert.equal(s.unidadeResponsavel, 'PENDENTE');
  assert.equal(s.responsavelValidacao, null);
  assert.equal(s.dataRevisao, null);
  assert.deepEqual(s.canalAtendimento, { nome: 'PENDENTE', url: null });
  assert.deepEqual(s.sistemaInicio, { nome: 'SIGA', url: null });
});

test('P1-11. a base real passa na validação', () => {
  assert.deepEqual(validarServicos(RAIZ).erros, []);
});

test('P1-12. falha quando registro e serviço têm status diferentes (cópia temporária)', () => {
  comCopia(({ dir, editarJson }) => {
    editarJson('services/registry.json', (r) => { r.servicos[0].statusValidacao = 'rascunho'; });
    const { erros } = validarServicos(dir);
    assert.ok(erros.some((e) => /statusValidacao difere entre registro e service\.json/.test(e)), erros.join('\n'));
  });
});

test('P1-13. falha quando o serviço em validação é marcado como publicado (cópia temporária)', () => {
  comCopia(({ dir, editarJson }) => {
    editarJson('services/registry.json', (r) => { r.servicos[0].publicado = true; });
    editarJson('services/lac/versoes/v1/service.json', (s) => { s.publicado = true; });
    const { erros } = validarServicos(dir);
    assert.ok(erros.some((e) => /em_validacao não pode estar publicado/.test(e)), erros.join('\n'));
  });
});

test('P1-14. falha quando referencias cita fonte inexistente ou revogada (cópia temporária)', () => {
  comCopia(({ dir, editarJson }) => {
    editarJson('services/lac/versoes/v1/service.json', (s) => {
      s.referencias.descricao = ['nao-existe'];
      s.referencias.etapas = ['decreto-695-2020'];
    });
    const { erros } = validarServicos(dir);
    assert.ok(erros.some((e) => /referencias\.descricao cita fonte inexistente "nao-existe"/.test(e)), erros.join('\n'));
    assert.ok(erros.some((e) => /referencias\.etapas cita fonte revogada "decreto-695-2020"/.test(e)), erros.join('\n'));
  });
});

test('P1-15. falha quando um campo preenchido não indica fonte (cópia temporária)', () => {
  comCopia(({ dir, editarJson }) => {
    editarJson('services/lac/versoes/v1/service.json', (s) => { delete s.referencias.etapas; });
    const { erros } = validarServicos(dir);
    assert.ok(erros.some((e) => /"etapas" tem conteúdo mas não indica fonte/.test(e)), erros.join('\n'));
  });
});

test('P1-16. falha quando seção do roteiro cita fonte inexistente, revogada ou nenhuma (cópia temporária)', () => {
  comCopia(({ dir, editarTexto }) => {
    editarTexto('services/lac/versoes/v1/roteiro.md', (t) =>
      t
        .replace('Fontes: `sema-orientacoes-lac`.\n\n## Quem pode solicitar', 'Fontes: `fonte-inventada`.\n\n## Quem pode solicitar')
        .replace('Fontes: `sema-orientacoes-lac`.\n\n## Condições', '\n## Condições')
        .replace('Fontes: `sema-orientacoes-lac`.\n\n## Observações', 'Fontes: `decreto-695-2020`.\n\n## Observações'),
    );
    const { erros } = validarServicos(dir);
    assert.ok(erros.some((e) => /cita fonte inexistente "fonte-inventada"/.test(e)), erros.join('\n'));
    assert.ok(erros.some((e) => /seção "Quem pode solicitar" tem conteúdo mas não indica "Fontes:"/.test(e)), erros.join('\n'));
    assert.ok(erros.some((e) => /cita fonte revogada "decreto-695-2020"/.test(e)), erros.join('\n'));
  });
});

test('P1-17. as etapas usam somente fontes existentes e não revogadas', () => {
  const porId = new Map(fontes().map((f) => [f.id, f]));
  const ids = servico().referencias.etapas;
  assert.ok(ids.length > 0);
  for (const id of ids) {
    assert.ok(porId.has(id), id);
    assert.notEqual(porId.get(id).vigencia.situacao, 'revogada', id);
  }
  const secao = secoesDoRoteiro().get('Etapas');
  for (const m of secao.matchAll(/`([^`]+)`/g)) assert.ok(porId.has(m[1]), m[1]);
});

test('P1-18. o conteúdo identifica que as fontes são antigas e sujeitas a validação', () => {
  const texto = roteiro();
  assert.match(texto, /24\/11\/2020/);
  assert.match(texto, /precisam ser confirmadas pela área competente/);
  assert.match(texto, /devem ser conferidos com a SEMA antes da publicação/);
  assert.match(servico().descricao, /2020/);
  for (const chave of ['normaDeEnquadramentoAtual', 'fluxoAtualDoSIGA', 'conferenciaManualEnormas']) {
    assert.ok(servico().pendencias.includes(chave), chave);
  }
});

test('P1-19. fontes não conferidas na auditoria não sustentam campos do serviço', () => {
  // Manual, LC 668/2020, Decretos 1.268 e 1.585/2022 não puderam ser abertos; só a página da SEMA foi lida.
  const referenciadas = new Set(Object.values(servico().referencias).flat());
  assert.deepEqual([...referenciadas], ['sema-orientacoes-lac']);
});
