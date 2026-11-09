// Passo 5B: conteúdo controlado da LAC para teste local (5 blocos) e regra de seleção por modo.
// Os blocos continuam em validação, NÃO publicados; a autorização de teste não é aprovação material nem pública.
// Falhas são provocadas em cópias temporárias ou dados sintéticos; os arquivos reais nunca são alterados.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  validarServicos,
  validarConteudoAssistente,
  documentosDisponiveisParaAssistente,
  perguntasDisponiveisParaAssistente,
  TIPOS_BLOCO_ASSISTENTE,
  AMBIENTES_ASSISTENTE,
} from '../scripts/validate-services.js';
import {
  selecionarBlocosAssistente,
  autorizacaoDeTesteValida,
  ModoDesconhecidoError,
  MODOS,
  MODO_PADRAO,
} from '../services/assistant-content.js';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lerTexto = (...partes) => fs.readFileSync(path.join(RAIZ, ...partes), 'utf8');
const lerJson = (...partes) => JSON.parse(lerTexto(...partes));
const conteudo = () => lerJson('services', 'lac', 'conteudo-assistente.json');
const fontes = () => lerJson('services', 'lac', 'fontes.json').fontes;
const fontesPorId = () => new Map(fontes().map((f) => [f.id, f]));
const dados = () => ({ conteudo: conteudo(), fontes: fontes() });
const bloco = (id) => conteudo().blocos.find((b) => b.id === id);

function comCopia(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sema-orienta-assist-'));
  fs.cpSync(path.join(RAIZ, 'services'), path.join(dir, 'services'), { recursive: true });
  const editarJson = (rel, editar) => {
    const arquivo = path.join(dir, rel);
    const dadosJson = JSON.parse(fs.readFileSync(arquivo, 'utf8'));
    editar(dadosJson);
    fs.writeFileSync(arquivo, JSON.stringify(dadosJson, null, 2));
  };
  try {
    return fn({ dir, editarJson });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
const erros = (dir) => validarServicos(dir).erros;
const temErro = (lista, regex) => assert.ok(lista.some((e) => regex.test(e)), lista.join('\n'));
const editarConteudo = (editar) => ({ dir, editarJson }) => {
  editarJson('services/lac/conteudo-assistente.json', editar);
  return erros(dir);
};

const IDS = ['lac-limitacoes', 'lac-descricao', 'lac-sequencia-geral', 'lac-link-oficial', 'lac-sem-conteudo'];
// Trechos exclusivos dos blocos, usados para procurar no build de produção.
const TRECHOS_EXCLUSIVOS = [
  'não concede licença, não decide se uma atividade pode obter a LAC',
  'é uma modalidade de licenciamento ambiental, e a solicitação é feita de forma digital pelo SIGA',
  'Fluxo de referência descrito em uma página oficial da SEMA-MT de 2020',
  'Iniciar um novo requerimento e selecionar a LAC',
  'Página oficial da SEMA-MT sobre a LAC',
  '5299-saiba-mais-sobre-a-licen',
  'Não encontrei informação validada na base do SEMA Orienta',
];

// ---------- Conteúdo ----------

test('B1. existem exatamente os cinco blocos aprovados, com os tipos esperados', () => {
  assert.deepEqual(conteudo().blocos.map((b) => b.id), IDS);
  assert.deepEqual(conteudo().blocos.map((b) => b.tipo), ['limitacao', 'descricao', 'sequencia', 'link', 'sem_conteudo']);
});

test('B2. todos os blocos são teste_local, não publicados, em validação e com revisão pendente', () => {
  for (const b of conteudo().blocos) {
    assert.equal(b.ambiente, 'teste_local', b.id);
    assert.equal(b.publicado, false, b.id);
    assert.equal(b.statusValidacao, 'em_validacao', b.id);
    assert.equal(b.revisaoAtualidade, 'pendente', b.id);
  }
  assert.equal(conteudo().statusValidacao, 'em_validacao');
  assert.doesNotMatch(lerTexto('services', 'lac', 'conteudo-assistente.json'), /"publicado"\s*:\s*true/);
});

test('B3. a autorização é estruturada (teste_local, 2026-11-09) e não indica aprovação material nem pública', () => {
  const a = conteudo().autorizacao;
  assert.equal(a.escopo, 'teste_local');
  assert.equal(a.data, '2026-11-09');
  assert.equal(a.aprovacaoMaterial, false);
  assert.equal(a.aprovacaoPublica, false);
  assert.match(a.observacao, /Não representa aprovação material.*nem publicação/);
  assert.equal(autorizacaoDeTesteValida(a), true);
});

test('B4. os textos são os aprovados: limitações, descrição, sequência com 6 passos, link com aviso e mensagem sem conteúdo', () => {
  assert.match(bloco('lac-limitacoes').texto, /não concede licença, não decide se uma atividade pode obter a LAC, não promete aprovação, prazo ou emissão e não substitui a análise da SEMA/);
  assert.match(bloco('lac-descricao').texto, /^Segundo a página oficial da SEMA-MT, a Licença por Adesão e Compromisso \(LAC\) é uma modalidade de licenciamento ambiental/);
  const sequencia = bloco('lac-sequencia-geral').texto;
  assert.match(sequencia, /as telas e as etapas atuais podem ter mudado, confirme com a SEMA/);
  for (let n = 1; n <= 6; n += 1) assert.ok(sequencia.includes(` ${n}. `), `passo ${n}`);
  assert.equal(sequencia.includes(' 7. '), false);
  assert.match(sequencia, /O que acontece depois do envio não está disponível neste teste\.$/);
  assert.match(bloco('lac-link-oficial').texto, /conteúdo de 2020; pode estar desatualizado/);
  assert.match(bloco('lac-link-oficial').texto, /não a use para decidir enquadramento\.$/);
  assert.equal(
    bloco('lac-sem-conteudo').texto,
    'Não encontrei informação validada na base do SEMA Orienta para responder a essa pergunta. Consulte os canais oficiais da SEMA ou reformule sua dúvida.',
  );
});

test('B5. origens e fontes: só a página da SEMA sustenta os blocos; as regras institucionais não citam fonte', () => {
  for (const id of ['lac-descricao', 'lac-sequencia-geral', 'lac-link-oficial']) {
    assert.equal(bloco(id).origem, 'fonte', id);
    assert.deepEqual(bloco(id).fonteIds, ['sema-orientacoes-lac'], id);
  }
  for (const id of ['lac-limitacoes', 'lac-sem-conteudo']) {
    assert.equal(bloco(id).origem, 'regra_institucional', id);
    assert.deepEqual(bloco(id).fonteIds, [], id);
  }
});

test('B6. o link usa a URL oficial da fonte e a sequência não traz botões, taxa, prazo, normas nem contatos', () => {
  const fonte = fontesPorId().get('sema-orientacoes-lac');
  const link = bloco('lac-link-oficial');
  assert.equal(link.url, fonte.url);
  assert.ok(link.texto.includes(fonte.url));
  assert.ok(link.url.startsWith('https://'));
  const todos = conteudo().blocos.map((b) => b.texto).join(' ');
  // O nome do botão ("Novo Requerimento") não aparece; a expressão genérica "novo requerimento" é permitida.
  assert.equal(todos.includes('Novo Requerimento'), false);
  assert.doesNotMatch(todos, /Formul[áa]rio|UPF|R\$|e-?sac|Decreto|\bLei\b|Resolu[çc][ãa]o|obrigat[óo]ri|@/i);
  assert.doesNotMatch(bloco('lac-sequencia-geral').texto, /taxa|pagamento|pagar|guia|termo por adesão|assinatura/i);
});

// ---------- Seleção por modo ----------

test('M1. o modo padrão é publico e retorna zero blocos hoje', () => {
  assert.equal(MODO_PADRAO, 'publico');
  assert.deepEqual(MODOS, ['publico', 'teste_local']);
  assert.deepEqual(selecionarBlocosAssistente(dados()), []);
  assert.deepEqual(selecionarBlocosAssistente(dados(), 'publico'), []);
  assert.deepEqual(selecionarBlocosAssistente(dados(), undefined), []);
});

test('M2. o modo teste_local retorna somente os cinco blocos, sem campos internos', () => {
  const blocos = selecionarBlocosAssistente(dados(), 'teste_local');
  assert.deepEqual(blocos.map((b) => b.id), IDS);
  assert.ok(blocos.every((b) => b.ambiente === 'teste_local'));
  for (const b of blocos) {
    assert.deepEqual(Object.keys(b).filter((k) => !['id', 'tipo', 'texto', 'fonteIds', 'ambiente', 'url', 'aviso'].includes(k)), [], b.id);
  }
  assert.equal(blocos.find((b) => b.id === 'lac-link-oficial').url, fontesPorId().get('sema-orientacoes-lac').url);
});

test('M3. modo desconhecido é rejeitado (inclusive variações de grafia e tipos inválidos)', () => {
  for (const modo of ['dev', '', 'TESTE_LOCAL', 'teste-local', 'Publico', null, 0, true, {}, []]) {
    assert.throws(() => selecionarBlocosAssistente(dados(), modo), ModoDesconhecidoError, JSON.stringify(modo));
  }
  assert.throws(() => selecionarBlocosAssistente(dados(), 'qualquer'), /Modo desconhecido/);
});

test('M4. sem autorização válida, o modo teste_local não libera nada', () => {
  const base = dados();
  const semAutorizacao = { ...base, conteudo: { ...base.conteudo, autorizacao: undefined } };
  assert.deepEqual(selecionarBlocosAssistente(semAutorizacao, 'teste_local'), []);
  for (const alteracao of [{ escopo: 'publico' }, { aprovacaoMaterial: true }, { aprovacaoPublica: true }, { data: 'hoje' }]) {
    const invalida = { ...base, conteudo: { ...base.conteudo, autorizacao: { ...base.conteudo.autorizacao, ...alteracao } } };
    assert.deepEqual(selecionarBlocosAssistente(invalida, 'teste_local'), [], JSON.stringify(alteracao));
  }
});

test('M5. dados ausentes ou malformados retornam lista vazia, nunca conteúdo', () => {
  for (const entrada of [undefined, null, {}, { conteudo: null }, { conteudo: { blocos: 'x' } }, 'texto']) {
    assert.deepEqual(selecionarBlocosAssistente(entrada, 'publico'), []);
    assert.deepEqual(selecionarBlocosAssistente(entrada, 'teste_local'), []);
  }
});

test('M6. bloco teste_local inconsistente (publicado) não é entregue, e bloco publico não vaza para o teste', () => {
  const base = dados();
  const publicado = { ...base, conteudo: { ...base.conteudo, blocos: base.conteudo.blocos.map((b, i) => (i === 0 ? { ...b, publicado: true } : b)) } };
  assert.equal(selecionarBlocosAssistente(publicado, 'teste_local').length, 4);
  const comPublico = { ...base, conteudo: { ...base.conteudo, blocos: [...base.conteudo.blocos, { ...base.conteudo.blocos[0], id: 'x', ambiente: 'publico' }] } };
  assert.equal(selecionarBlocosAssistente(comPublico, 'teste_local').some((b) => b.id === 'x'), false);
  assert.equal(selecionarBlocosAssistente(comPublico, 'publico').length, 0);
});

test('M7. o modo publico exige todas as condições de publicação (dados sintéticos)', () => {
  const fonte = (extra) => [{ id: 'f1', publicado: true, vigencia: { situacao: 'vigente' }, ...extra }];
  const publicado = {
    id: 'p1', tipo: 'descricao', texto: 'Texto aprovado.', origem: 'fonte', fonteIds: ['f1'], ambiente: 'publico',
    statusValidacao: 'validado', publicado: true, revisaoAtualidade: 'concluida',
  };
  const selecionar = (bloco, fontesLista = fonte({})) =>
    selecionarBlocosAssistente({ conteudo: { blocos: [bloco] }, fontes: fontesLista }, 'publico');
  assert.equal(selecionar(publicado).length, 1);
  for (const variante of [
    { publicado: false }, { statusValidacao: 'em_validacao' }, { revisaoAtualidade: 'pendente' }, { ambiente: 'teste_local' },
    { origem: 'desconhecida' }, { fonteIds: [] },
  ]) {
    assert.equal(selecionar({ ...publicado, ...variante }).length, 0, JSON.stringify(variante));
  }
  assert.equal(selecionar(publicado, fonte({ publicado: false })).length, 0);
  assert.equal(selecionar(publicado, fonte({ vigencia: { situacao: 'revogada' } })).length, 0);
  assert.equal(selecionar(publicado, []).length, 0);
  assert.equal(selecionar({ ...publicado, origem: 'regra_institucional', fonteIds: [] }, []).length, 1);
});

test('M8. a seleção não usa variável de ambiente, rede nem leitura de arquivos', () => {
  const codigo = lerTexto('services', 'assistant-content.js');
  assert.doesNotMatch(codigo, /process\.env|import\.meta\.env|fetch\(|node:fs|readFileSync|XMLHttpRequest|localStorage/);
});

test('M9. documentos e perguntas continuam indisponíveis ao assistente e fora dos blocos', () => {
  const mapa = fontesPorId();
  assert.deepEqual(documentosDisponiveisParaAssistente(lerJson('services', 'lac', 'documentos.json'), mapa), []);
  assert.deepEqual(perguntasDisponiveisParaAssistente(lerJson('services', 'lac', 'perguntas-frequentes.json'), mapa), []);
  const textos = selecionarBlocosAssistente(dados(), 'teste_local').map((b) => b.texto).join(' ');
  const documentos = lerJson('services', 'lac', 'documentos.json').documentos;
  for (const d of documentos) assert.equal(textos.includes(d.nome), false, d.id);
  for (const q of lerJson('services', 'lac', 'perguntas-frequentes.json').perguntas) assert.equal(textos.includes(q.conteudoFonte), false, q.id);
  assert.ok(lerJson('services', 'lac', 'documentos.json').documentos.every((d) => d.publicado === false));
  assert.ok(lerJson('services', 'lac', 'perguntas-frequentes.json').perguntas.every((q) => q.publicado === false && q.respostaPublicavel === null));
});

// ---------- Validador (cópias temporárias) ----------

test('V0. a base real passa na validação, inclusive o conteúdo do assistente', () => {
  assert.deepEqual(validarServicos(RAIZ).erros, []);
  assert.deepEqual(validarConteudoAssistente(conteudo(), { idServico: 'lac', fontesPorId: fontesPorId() }), []);
  assert.equal(lerJson('services', 'lac', 'service.json').arquivos.conteudoAssistente, 'services/lac/conteudo-assistente.json');
  assert.ok(fs.existsSync(path.join(RAIZ, 'services', 'lac', 'conteudo-assistente.json')));
});

test('V1. rejeita bloco teste_local publicado ou validado', () => {
  comCopia((ctx) => {
    const lista = editarConteudo((d) => {
      d.blocos[0].publicado = true;
      d.blocos[1].statusValidacao = 'validado';
    })(ctx);
    temErro(lista, /bloco teste_local não pode estar publicado/);
    temErro(lista, /bloco teste_local não pode estar validado/);
  });
});

test('V2. rejeita autorização ausente, com escopo errado ou com aprovação material ou pública', () => {
  comCopia((ctx) => temErro(editarConteudo((d) => { delete d.autorizacao; })(ctx), /exige autorizacao estruturada/));
  comCopia((ctx) => {
    const lista = editarConteudo((d) => {
      d.autorizacao.escopo = 'publico';
      d.autorizacao.aprovacaoMaterial = true;
      d.autorizacao.aprovacaoPublica = true;
      d.autorizacao.data = 'ontem';
    })(ctx);
    temErro(lista, /autorizacao\.escopo deve ser "teste_local"/);
    temErro(lista, /aprovacaoMaterial deve ser false/);
    temErro(lista, /aprovacaoPublica deve ser false/);
    temErro(lista, /autorizacao\.data deve ser uma data válida/);
  });
});

test('V3. rejeita fonte inexistente, revogada ou ausente em bloco com origem "fonte"', () => {
  comCopia((ctx) => {
    const lista = editarConteudo((d) => {
      d.blocos[1].fonteIds = ['fonte-inexistente'];
      d.blocos[2].fonteIds = ['decreto-695-2020'];
      d.blocos[3].fonteIds = [];
    })(ctx);
    temErro(lista, /fonteId "fonte-inexistente" não existe/);
    temErro(lista, /usa fonte revogada "decreto-695-2020"/);
    temErro(lista, /origem "fonte" exige fonteIds/);
  });
});

test('V4. rejeita, em bloco de teste, valor, prazo, validade, norma, obrigatoriedade, canal e contato', () => {
  const emailSintetico = ['usuario', 'exemplo.test'].join('@');
  comCopia((ctx) => {
    const lista = editarConteudo((d) => {
      d.blocos[0].texto = 'A LAC custa 3 UPFs.';
      d.blocos[1].texto = 'O prazo é de 2 dias e a validade é de seis anos.';
      d.blocos[2].texto = 'Conforme o Decreto vigente, o documento é obrigatório.';
      d.blocos[4].texto = `Protocole pelo e-SAC ou escreva para ${emailSintetico}.`;
    })(ctx);
    temErro(lista, /contém valor ou taxa/);
    temErro(lista, /contém prazo ou validade/);
    temErro(lista, /contém norma/);
    temErro(lista, /contém obrigatoriedade documental/);
    temErro(lista, /contém canal de protocolo/);
    temErro(lista, /contém e-mail ou telefone/);
    assert.equal(lista.some((e) => e.includes(emailSintetico)), false, 'a mensagem não repete o contato');
  });
});

test('V4b. o validador permite avisos de cautela e rejeita afirmações de prazo ou de norma vigente (dados sintéticos)', () => {
  const real = conteudo();
  const comTexto = (texto) => ({ ...real, blocos: [{ ...real.blocos[0], texto }] });
  const validar = (texto) => validarConteudoAssistente(comTexto(texto), { idServico: 'lac', fontesPorId: fontesPorId() });
  // Permitidos: avisos que negam promessa e pedem confirmação.
  for (const aviso of [
    'O assistente não promete prazo, aprovação ou emissão.',
    'A norma de enquadramento está pendente de confirmação pela área competente.',
    'A situação de vigência da norma ainda precisa ser confirmada.',
    'A página cita uma norma de enquadramento cuja situação precisa ser confirmada.',
  ]) {
    assert.deepEqual(validar(aviso), [], aviso);
  }
  // Rejeitadas: prazo concreto e norma apresentada como vigente.
  for (const [afirmacao, regex] of [
    ['O prazo de dois dias é garantido.', /prazo ou validade/],
    ['A análise leva 2 dias.', /prazo ou validade/],
    ['A licença vale por seis anos.', /prazo ou validade/],
    ['A norma de enquadramento está vigente.', /norma apresentada como vigente/],
    ['Esta é a norma vigente para a LAC.', /norma apresentada como vigente/],
    ['A legislação continua em vigor.', /norma apresentada como vigente/],
    ['O Decreto nº 1.268/2022 é a norma em vigor.', /contém norma/],
  ]) {
    temErro(validar(afirmacao), regex);
  }
});

test('V5. rejeita link com URL diferente da fonte, sem a URL no texto ou com url em outro tipo', () => {
  comCopia((ctx) => {
    const lista = editarConteudo((d) => {
      d.blocos[3].url = 'https://exemplo.test/outra';
      d.blocos[3].texto = 'Texto sem o endereço.';
      d.blocos[1].url = 'https://exemplo.test/x';
    })(ctx);
    temErro(lista, /a url do link deve ser a da fonte citada/);
    temErro(lista, /o texto do link deve conter a url/);
    temErro(lista, /url só é permitida em bloco do tipo link/);
  });
  comCopia((ctx) => temErro(editarConteudo((d) => { d.blocos[3].url = 'http://www.sema.mt.gov.br/x'; })(ctx), /https:\/\//));
});

test('V6. rejeita id duplicado, tipo e ambiente inválidos, origem inválida e regra institucional com fonte', () => {
  comCopia((ctx) => {
    const lista = editarConteudo((d) => {
      d.blocos[1].id = d.blocos[0].id;
      d.blocos[2].tipo = 'tipo_inventado';
      d.blocos[3].ambiente = 'producao';
      d.blocos[4].origem = 'inventada';
      d.blocos[0].fonteIds = ['sema-orientacoes-lac'];
    })(ctx);
    temErro(lista, /id duplicado/);
    temErro(lista, /tipo inválido/);
    temErro(lista, /ambiente inválido/);
    temErro(lista, /origem inválida/);
    temErro(lista, /não cita fontes/);
  });
});

test('V7. bloco publico publicado exige validação, revisão concluída e fonte publicada', () => {
  comCopia((ctx) => {
    const lista = editarConteudo((d) => {
      Object.assign(d.blocos[1], { ambiente: 'publico', publicado: true });
    })(ctx);
    temErro(lista, /bloco em_validacao não pode estar publicado/);
    temErro(lista, /bloco publicado não pode ter revisão de atualidade pendente/);
    temErro(lista, /bloco publicado não pode usar fonte não publicada "sema-orientacoes-lac"/);
  });
});

test('V8. esquema e validador usam os mesmos tipos e ambientes', () => {
  const schema = lerJson('services', 'schemas', 'service.schema.json');
  assert.deepEqual(schema.$defs.tipoBlocoAssistente.enum, TIPOS_BLOCO_ASSISTENTE);
  assert.deepEqual(schema.$defs.ambienteAssistente.enum, AMBIENTES_ASSISTENTE);
  assert.deepEqual(AMBIENTES_ASSISTENTE, MODOS.slice().reverse());
});

// ---------- Escopo ----------

test('E1. a interface não foi alterada e não usa o conteúdo nem a seleção do assistente (isso é do Passo 6)', () => {
  const arquivos = fs.readdirSync(path.join(RAIZ, 'src')).sort();
  // Passo 6 acrescentou src/assistant.js (reconhecimento local de intenção); nenhum arquivo importa o JSON do conteúdo.
  assert.deepEqual(arquivos, ['assistant.js', 'chat.js', 'main.js', 'styles.css']);
  for (const arquivo of ['index.html', ...arquivos.map((n) => path.join('src', n))]) {
    const texto = lerTexto(arquivo);
    assert.doesNotMatch(texto, /assistant-content|conteudo-assistente|selecionarBlocosAssistente|teste_local|services\//, arquivo);
    for (const trecho of TRECHOS_EXCLUSIVOS) assert.equal(texto.includes(trecho), false, `${arquivo}: ${trecho}`);
  }
});

test('E2. o build de produção (dist/), quando existir, não contém os textos dos cinco blocos', { skip: !fs.existsSync(path.join(RAIZ, 'dist')) }, () => {
  const encontrados = [];
  const percorrer = (dir) => {
    for (const nome of fs.readdirSync(dir)) {
      const completo = path.join(dir, nome);
      if (fs.statSync(completo).isDirectory()) percorrer(completo);
      else if (/\.(js|css|html|json|map|txt)$/i.test(nome)) {
        const texto = fs.readFileSync(completo, 'utf8');
        for (const trecho of [...TRECHOS_EXCLUSIVOS, 'conteudo-assistente', 'teste_local']) {
          if (texto.includes(trecho)) encontrados.push(`${nome}: ${trecho}`);
        }
      }
    }
  };
  percorrer(path.join(RAIZ, 'dist'));
  assert.deepEqual(encontrados, []);
});
