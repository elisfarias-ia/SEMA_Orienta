// Passo 6: reconhecimento local de intenção e montagem da resposta (sem IA externa, sem rede, só no navegador).
// O conteúdo vem dos 5 blocos de teste local entregues pelo endpoint (aqui, o manipulador real com requisição simulada).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  normalizar,
  reconhecerIntencao,
  responderPergunta,
  respostaIndisponivel,
  validarPayload,
  PERGUNTA_ESCLARECIMENTO,
} from '../src/assistant.js';
import { criarConversa, RESPOSTA_TEMPORARIA, MENSAGEM_INICIAL } from '../src/chat.js';
import { criarManipuladorBlocos, lerDadosDaBase } from '../services/assistant-endpoint.js';
import { FRASE_ESCOPO } from '../services/assistant-messages.js';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lerTexto = (...partes) => fs.readFileSync(path.join(RAIZ, ...partes), 'utf8');

/** Obtém o payload exatamente como o endpoint o entrega (manipulador real, requisição simulada). */
async function payloadReal() {
  const manipulador = criarManipuladorBlocos({ lerDados: () => lerDadosDaBase(RAIZ) });
  let corpo = null;
  const res = { statusCode: 0, setHeader() {}, end(texto) { corpo = texto; } };
  await manipulador({ url: '/__assistente/blocos', method: 'GET', socket: { remoteAddress: '127.0.0.1' } }, res, () => assert.fail('next'));
  assert.equal(res.statusCode, 200);
  return JSON.parse(corpo);
}
const conteudoReal = async () => validarPayload(await payloadReal());
const bloco = (conteudo, tipo) => conteudo.blocos.find((b) => b.tipo === tipo);
const intencoes = (pergunta) => reconhecerIntencao(pergunta).intencoes;

// ---------- Reconhecimento ----------

test('R1. normaliza acentos, maiúsculas e pontuação', () => {
  assert.equal(normalizar('  Como SOLICITAR a LAC???  '), 'como solicitar a lac');
  assert.equal(normalizar('Licença por Adesão e Compromisso'), 'licenca por adesao e compromisso');
  assert.equal(normalizar(undefined), '');
});

test('R2. reconhece perguntas livres sobre conceito, solicitação, etapas e link (inclusive sinônimos)', () => {
  const casos = [
    ['O que é a LAC?', 'conceito'],
    ['O que significa licença por adesão e compromisso?', 'conceito'],
    ['Explique a LAC para mim', 'conceito'],
    ['Como solicitar a LAC?', 'solicitar'],
    ['COMO PEDIR UMA LAC???', 'solicitar'],
    ['como posso tirar a LAC', 'solicitar'],
    ['Como faço para obter a licença por adesão e compromisso?', 'solicitar'],
    ['Quais são as etapas da LAC?', 'etapas'],
    ['Me explique o passo a passo', 'etapas'],
    ['Qual é o fluxo do procedimento?', 'etapas'],
    ['Qual o link oficial da LAC?', 'link'],
    ['Onde encontro a página da SEMA sobre a LAC?', 'link'],
    ['Qual o endereço eletrônico?', 'link'],
  ];
  for (const [pergunta, esperada] of casos) assert.ok(intencoes(pergunta).includes(esperada), `${pergunta} -> ${intencoes(pergunta)}`);
});

test('R3. "como posso solicitar" é procedimento e não enquadramento; "endereço eletrônico" não é contato', () => {
  assert.equal(intencoes('Como posso solicitar a LAC?').includes('enquadramento'), false);
  assert.equal(intencoes('Qual o endereço eletrônico da página?').includes('contato'), false);
});

test('R4. reconhece enquadramento e os assuntos que a base ainda não cobre', () => {
  const casos = [
    ['Minha atividade pode ter LAC?', 'enquadramento'],
    ['Posso obter a LAC para minha fazenda?', 'enquadramento'],
    ['Preciso de LAC para minha empresa?', 'enquadramento'],
    ['Meu empreendimento se enquadra na LAC?', 'enquadramento'],
    ['Quais documentos preciso apresentar?', 'documentos'],
    ['Qual a documentação exigida?', 'documentos'],
    ['Quanto custa a LAC?', 'taxa'],
    ['Qual o valor da taxa?', 'taxa'],
    ['Qual o prazo para sair a LAC?', 'prazo'],
    ['Quantos dias demora?', 'prazo'],
    ['Qual a validade da licença?', 'validade'],
    ['Preciso renovar a LAC?', 'validade'],
    ['Qual o telefone de atendimento?', 'contato'],
    ['Qual o e-mail para falar com a SEMA?', 'contato'],
  ];
  for (const [pergunta, esperada] of casos) assert.ok(intencoes(pergunta).includes(esperada), `${pergunta} -> ${intencoes(pergunta)}`);
});

test('R5. distingue licenciamento genérico, menção só à LAC e assunto desconhecido', () => {
  assert.equal(reconhecerIntencao('Como funciona o licenciamento ambiental?').licenciamentoGeral, true);
  assert.equal(reconhecerIntencao('Como tirar uma licença?').licenciamentoGeral, true);
  assert.equal(reconhecerIntencao('Como solicitar a licença por adesão e compromisso?').licenciamentoGeral, false);
  assert.equal(reconhecerIntencao('LAC').mencionaLac, true);
  assert.deepEqual(reconhecerIntencao('LAC').intencoes, []);
  const desconhecido = reconhecerIntencao('Encontrei um animal silvestre ferido');
  assert.deepEqual(desconhecido.intencoes, []);
  assert.equal(desconhecido.mencionaLac, false);
  assert.equal(desconhecido.licenciamentoGeral, false);
});

test('R6. regressão: temas bloqueados têm prioridade sobre o "o que é" genérico; a descrição exige citar a LAC', () => {
  for (const p of ['O que é enquadramento?', 'Minha atividade se enquadra na LAC?', 'O que são os documentos da LAC?', 'O que é o prazo da LAC?', 'O que é a taxa?', 'O que é validade?']) {
    assert.equal(intencoes(p).includes('conceito'), false, p);
  }
  assert.ok(intencoes('O que é enquadramento?').includes('enquadramento'));
  assert.ok(intencoes('O que são os documentos da LAC?').includes('documentos'));
  assert.ok(intencoes('O que é o prazo da LAC?').includes('prazo'));
  assert.equal(intencoes('O que é licenciamento ambiental?').includes('conceito'), false);
  for (const p of ['O que é LAC?', 'O que é Licença por Adesão e Compromisso?', 'O que é a LAC e quanto custa?']) {
    assert.ok(intencoes(p).includes('conceito'), p);
  }
});

// ---------- Respostas: somente blocos ----------

test('S1. conceito: responde com o bloco de descrição, o aviso do bloco e a fonte oficial', async () => {
  const c = await conteudoReal();
  const r = responderPergunta('O que é a LAC?', c);
  assert.deepEqual(r.partes, [bloco(c, 'descricao').texto, bloco(c, 'limitacao').texto]);
  assert.equal(r.fontes.length, 1);
  assert.equal(r.fontes[0].url, c.fontes[0].url);
  assert.ok(r.fontes.every((f) => f.url.startsWith('https://')));
  assert.deepEqual(r.avisos, [bloco(c, 'descricao').aviso]);
});

test('S2. solicitar e etapas: usam o bloco de sequência (sem inventar telas) e as limitações', async () => {
  const c = await conteudoReal();
  for (const pergunta of ['Como solicitar a LAC?', 'Quais as etapas da LAC?']) {
    const r = responderPergunta(pergunta, c);
    assert.deepEqual(r.partes, [bloco(c, 'sequencia').texto, bloco(c, 'limitacao').texto], pergunta);
    assert.match(r.partes[0], /as telas e as etapas atuais podem ter mudado, confirme com a SEMA/);
    assert.equal(r.fontes.length, 1);
  }
});

test('S3. link: usa o bloco de link; a fonte é https e vem do endpoint', async () => {
  const c = await conteudoReal();
  const r = responderPergunta('Qual o link oficial da LAC?', c);
  assert.equal(r.partes[0], bloco(c, 'link').texto);
  assert.ok(r.partes[0].includes(bloco(c, 'link').url));
  assert.ok(r.fontes.every((f) => f.url.startsWith('https://') && c.fontes.some((x) => x.url === f.url)));
});

test('S4. enquadramento: nunca decide; responde com as limitações e a mensagem sem conteúdo validado', async () => {
  const c = await conteudoReal();
  for (const pergunta of ['Minha atividade pode ter LAC?', 'Posso obter a LAC para minha fazenda?', 'Meu empreendimento se enquadra?']) {
    const r = responderPergunta(pergunta, c);
    assert.deepEqual(r.partes, [bloco(c, 'sem_conteudo').texto, bloco(c, 'limitacao').texto], pergunta);
    assert.match(r.partes.join(' '), /não decide se uma atividade pode obter a LAC/);
    assert.doesNotMatch(r.partes.join(' '), /sim, voc[êe] pode|est[áa] enquadrad|tem direito/i);
  }
});

test('S5. documentos, taxa, prazo, validade e contato: só a mensagem sem conteúdo validado (e as limitações)', async () => {
  const c = await conteudoReal();
  for (const pergunta of ['Quais documentos preciso?', 'Quanto custa a LAC?', 'Qual o prazo?', 'Qual a validade?', 'Qual o telefone de atendimento?']) {
    const r = responderPergunta(pergunta, c);
    assert.deepEqual(r.partes, [bloco(c, 'sem_conteudo').texto, bloco(c, 'limitacao').texto], pergunta);
    assert.equal(r.fontes.length, 0, pergunta);
  }
});

test('S6. pergunta composta combina os blocos correspondentes, sem repetir bloco', async () => {
  const c = await conteudoReal();
  const r = responderPergunta('O que é a LAC e quanto custa?', c);
  assert.deepEqual(r.partes, [bloco(c, 'descricao').texto, bloco(c, 'sem_conteudo').texto, bloco(c, 'limitacao').texto]);
});

test('S6b. regressão: "o que é" sobre tema bloqueado nunca devolve a descrição da LAC', async () => {
  const c = await conteudoReal();
  const semDescricao = [bloco(c, 'sem_conteudo').texto, bloco(c, 'limitacao').texto];
  for (const p of ['O que é enquadramento?', 'Minha atividade se enquadra na LAC?', 'O que são os documentos da LAC?', 'O que é o prazo da LAC?']) {
    const r = responderPergunta(p, c);
    assert.deepEqual(r.partes, semDescricao, p);
    assert.equal(r.partes.includes(bloco(c, 'descricao').texto), false, p);
    assert.equal(r.fontes.length, 0, p);
  }
  for (const p of ['O que é LAC?', 'O que é Licença por Adesão e Compromisso?']) {
    assert.deepEqual(responderPergunta(p, c).partes, [bloco(c, 'descricao').texto, bloco(c, 'limitacao').texto], p);
  }
  // Sem citar a LAC, "o que é licenciamento" é pergunta genérica: só a frase de escopo.
  const geral = responderPergunta('O que é licenciamento ambiental?', c);
  assert.equal(geral.tipo, 'escopo');
  assert.equal(geral.partes.includes(bloco(c, 'descricao').texto), false);
});

test('S7. licenciamento genérico: informa o escopo (frase aprovada) sem afirmar adequação ao caso', async () => {
  const c = await conteudoReal();
  const r = responderPergunta('Como funciona o licenciamento ambiental?', c);
  assert.equal(r.tipo, 'escopo');
  assert.equal(r.partes[0], FRASE_ESCOPO);
  assert.equal(r.partes[0], 'Neste momento, a base possui conteúdo apenas sobre a LAC. Isso não significa que essa modalidade seja adequada ao seu caso.');
  assert.equal(r.partes[1], PERGUNTA_ESCLARECIMENTO);
  assert.equal(r.partes.some((p) => p === bloco(c, 'sequencia').texto), false, 'não entrega o passo a passo da LAC para pergunta genérica');
  const comTaxa = responderPergunta('Quanto custa uma licença ambiental?', c);
  assert.deepEqual(comTaxa.partes, [FRASE_ESCOPO, bloco(c, 'sem_conteudo').texto, bloco(c, 'limitacao').texto]);
});

test('S8. menção só à LAC pede esclarecimento; assunto desconhecido responde "sem conteúdo validado"', async () => {
  const c = await conteudoReal();
  const so = responderPergunta('LAC', c);
  assert.equal(so.tipo, 'esclarecimento');
  assert.deepEqual(so.partes, [PERGUNTA_ESCLARECIMENTO]);
  const desconhecido = responderPergunta('Encontrei um animal silvestre ferido', c);
  assert.equal(desconhecido.tipo, 'sem_conteudo');
  assert.deepEqual(desconhecido.partes, [bloco(c, 'sem_conteudo').texto]);
  assert.deepEqual(responderPergunta('', c).partes, [bloco(c, 'sem_conteudo').texto]);
});

test('S9. todo texto ambiental da resposta é palavra por palavra de um bloco (ou conectores fixos)', async () => {
  const c = await conteudoReal();
  const permitidos = new Set([...c.blocos.map((b) => b.texto), FRASE_ESCOPO, PERGUNTA_ESCLARECIMENTO, RESPOSTA_TEMPORARIA]);
  const perguntas = [
    'O que é a LAC?', 'Como solicitar?', 'Etapas da LAC', 'Link oficial', 'Posso ter LAC?', 'Documentos?', 'Quanto custa?',
    'Prazo?', 'Validade?', 'Contato?', 'Licenciamento ambiental', 'LAC', 'animal silvestre', '', 'xyz', 'Quero abrir um requerimento',
  ];
  for (const pergunta of perguntas) {
    for (const parte of responderPergunta(pergunta, c).partes) assert.ok(permitidos.has(parte), `${pergunta} -> ${parte}`);
  }
});

test('S10. sem conteúdo (endpoint ausente, falha ou formato inválido) a resposta é só a mensagem segura de indisponibilidade', async () => {
  for (const conteudo of [null, undefined, {}, { blocos: [] }]) {
    const r = responderPergunta('O que é a LAC?', conteudo);
    assert.equal(r.tipo, 'indisponivel');
    assert.deepEqual(r.partes, [RESPOSTA_TEMPORARIA]);
    assert.deepEqual(r.fontes, []);
  }
  assert.deepEqual(respostaIndisponivel().partes, [RESPOSTA_TEMPORARIA]);
  assert.match(RESPOSTA_TEMPORARIA, /em configuração/);
});

test('S11. a resposta nunca usa blocos que faltam: sem o bloco necessário, responde indisponibilidade', async () => {
  const c = await conteudoReal();
  const semDescricao = { ...c, blocos: c.blocos.filter((b) => b.tipo !== 'descricao' && b.tipo !== 'limitacao') };
  assert.equal(responderPergunta('O que é a LAC?', semDescricao).tipo, 'indisponivel');
});

// ---------- Validação do payload ----------

test('P1. validarPayload aceita o formato do endpoint e rejeita formatos inválidos ou sem a faixa de teste', async () => {
  const bruto = await payloadReal();
  const ok = validarPayload(bruto);
  assert.ok(ok);
  assert.equal(ok.blocos.length, 5);
  assert.equal(ok.mensagens.escopo, FRASE_ESCOPO);
  for (const invalido of [null, [], 'x', {}, { blocos: [] }, { ...bruto, blocos: [] }, { ...bruto, mensagens: {} }, { ...bruto, mensagens: { faixa: '  ' } }]) {
    assert.equal(validarPayload(invalido), null, JSON.stringify(invalido)?.slice(0, 60));
  }
  const semUrlSegura = validarPayload({ ...bruto, fontes: [{ id: 'x', titulo: 'Fonte', url: 'http://exemplo.test' }, { id: 'y', titulo: 'Fonte', url: 'javascript:alert(1)' }] });
  assert.deepEqual(semUrlSegura.fontes, []);
  const blocoComUrlInsegura = validarPayload({ ...bruto, blocos: bruto.blocos.map((b) => ({ ...b, url: 'javascript:alert(1)' })) });
  assert.ok(blocoComUrlInsegura.blocos.every((b) => b.url === null));
  const tipoInventado = validarPayload({ ...bruto, blocos: [...bruto.blocos, { id: 'z', tipo: 'inventado', texto: 'x', fonteIds: [] }] });
  assert.equal(tipoInventado.blocos.length, 5);
});

// ---------- Conversa em memória e segurança do código da interface ----------

test('C1. a conversa aceita um responsável, guarda partes, fontes e avisos apenas em memória e reinicia', async () => {
  const c = await conteudoReal();
  const conversa = criarConversa();
  const par = conversa.enviar('  O que é a LAC? ', (texto) => responderPergunta(texto, c));
  assert.equal(par.usuario.texto, 'O que é a LAC?');
  assert.equal(par.assistente.partes.length, 2);
  assert.equal(par.assistente.texto, par.assistente.partes.join('\n\n'));
  assert.equal(par.assistente.fontes.length, 1);
  assert.equal(conversa.listar().length, 3);
  assert.equal(conversa.enviar('   ', () => assert.fail('não deve responder')), null);
  conversa.reiniciar();
  assert.deepEqual(conversa.listar(), [{ autor: 'assistente', texto: MENSAGEM_INICIAL }]);
});

test('C2. sem responsável, a conversa usa a mensagem segura (comportamento anterior preservado)', () => {
  const par = criarConversa().enviar('Qualquer pergunta');
  assert.deepEqual(par.assistente.partes, [RESPOSTA_TEMPORARIA]);
  assert.equal(par.assistente.texto, RESPOSTA_TEMPORARIA);
});

test('C3. o código da interface usa DOM seguro, não grava dados e só busca o endpoint em desenvolvimento', () => {
  const arquivos = ['src/main.js', 'src/chat.js', 'src/assistant.js'];
  for (const arquivo of arquivos) {
    const texto = lerTexto(arquivo);
    assert.doesNotMatch(texto, /innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\(|new Function/, arquivo);
    assert.doesNotMatch(texto, /localStorage|sessionStorage|indexedDB|document\.cookie|navigator\.sendBeacon|XMLHttpRequest|WebSocket/, arquivo);
  }
  const main = lerTexto('src', 'main.js');
  assert.equal((main.match(/fetch\(/g) ?? []).length, 1, 'uma única chamada de rede');
  const ate = main.indexOf('fetch(');
  assert.ok(main.lastIndexOf('import.meta.env.DEV', ate) !== -1, 'a chamada fica atrás de import.meta.env.DEV');
  assert.match(main, /method: 'GET'/);
  assert.doesNotMatch(main, /body:|JSON\.stringify|\?pergunta|campo\.value\s*\+/, 'a pergunta não é enviada');
  assert.match(main, /faixa\.textContent = payload\.mensagens\.faixa/);
  assert.match(main, /destino\.protocol !== 'https:'/);
});

test('C4. acessibilidade: faixa com role status, log com aria-live, rótulos e foco devolvido ao campo', () => {
  const html = lerTexto('index.html');
  assert.match(html, /id="faixa-teste"[^>]*role="status"[^>]*hidden/);
  assert.match(html, /role="log"/);
  assert.match(html, /aria-live="polite"/);
  assert.match(html, /<label for="campo-mensagem"/);
  const main = lerTexto('src', 'main.js');
  assert.ok((main.match(/campo\.focus\(\)/g) ?? []).length >= 2, 'foco volta ao campo ao enviar e ao reiniciar');
  assert.match(main, /evento\.key === 'Enter' && !evento\.shiftKey/);
  assert.match(lerTexto('src', 'styles.css'), /\.message__fontes a \{[^}]*overflow-wrap: anywhere/);
});

test('C5. nenhum texto de teste local, frase de escopo ou nome interno está no código da interface', async () => {
  const c = await conteudoReal();
  const proibidos = [...c.blocos.map((b) => b.texto), FRASE_ESCOPO, c.mensagens.faixa, 'teste_local', 'conteudo-assistente', 'assistant-content', 'services/'];
  for (const arquivo of ['index.html', 'src/main.js', 'src/chat.js', 'src/assistant.js', 'src/styles.css']) {
    const texto = lerTexto(arquivo);
    for (const p of proibidos) assert.equal(texto.includes(p), false, `${arquivo}: ${p.slice(0, 50)}`);
  }
});
