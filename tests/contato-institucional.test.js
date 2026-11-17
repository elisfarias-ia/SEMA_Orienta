// Contato institucional permitido: o domínio configurado (services/admin/contatos-permitidos.js) pode aparecer no texto informado;
// e-mails externos ou pessoais, telefones e credenciais continuam bloqueados. Os endereços são montados em tempo de execução
// (o repositório não guarda e-mail nem telefone, ver C1). Trecho representativo e curto: não copia perguntas da LAC.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DOMINIOS_EMAIL_PERMITIDOS, contemEmailNaoPermitido } from '../services/admin/contatos-permitidos.js';
import { problemasDoTexto, validarCorpoEntradaTexto } from '../services/admin/entradas.js';
import { validarEntradaConhecimento } from '../services/admin/conhecimento.js';
import { contemDadoSensivel } from '../services/admin/cadastro.js';
import { pareceDadoPessoal } from '../admin/admin-logic.js';

const DOMINIO = DOMINIOS_EMAIL_PERMITIDOS[0];
const arroba = (local, dominio) => [local, dominio].join('@');
const INSTITUCIONAL = arroba('suimis', DOMINIO);
const TRECHO = (contato) => `O responsável técnico pelo processo deve orientar a pessoa física que solicitar o serviço. Em caso de dúvida, o contato institucional da SEMA é ${contato}.`;

test('CI1. configuração única: só o domínio institucional está permitido', () => {
  assert.deepEqual([...DOMINIOS_EMAIL_PERMITIDOS], ['sema.mt.gov.br']);
  assert.ok(Object.isFrozen(DOMINIOS_EMAIL_PERMITIDOS));
});

test('CI2. o trecho com responsável técnico, pessoa física e contato institucional é aceito, sem diferença de maiúsculas', () => {
  for (const contato of [INSTITUCIONAL, INSTITUCIONAL.toUpperCase(), arroba('Suimis', 'SEMA.MT.GOV.BR'), arroba('atendimento.lac', DOMINIO)]) {
    assert.equal(contemEmailNaoPermitido(TRECHO(contato)), false, contato);
    assert.deepEqual(problemasDoTexto(TRECHO(contato)), [], contato);
    assert.equal(contemDadoSensivel(TRECHO(contato)), false);
    assert.equal(pareceDadoPessoal(TRECHO(contato)), false, contato);
    const corpo = validarCorpoEntradaTexto({ titulo: 'Contato do serviço', texto: TRECHO(contato) });
    assert.equal(corpo.ok, true, contato);
    assert.equal(corpo.dados.texto, TRECHO(contato), 'o texto é preservado exatamente');
  }
});

test('CI3. e-mail externo, pessoal ou de domínio parecido continua bloqueado, mesmo ao lado do institucional', () => {
  const bloqueados = [
    arroba('maria.silva', 'gmail.com'), arroba('fulano', 'exemplo.com.br'), arroba('suimis', `${DOMINIO}.exemplo.com`), arroba('suimis', `falso${DOMINIO}`),
    arroba('suimis', `sub.${DOMINIO}`), arroba('suimis', 'outro.mt.gov.br'),
  ];
  for (const email of bloqueados) {
    assert.equal(contemEmailNaoPermitido(email), true, email);
    assert.ok(problemasDoTexto(TRECHO(email)).includes('dado_pessoal'), email);
    assert.ok(problemasDoTexto(`${TRECHO(INSTITUCIONAL)} Fale também com ${email}.`).includes('dado_pessoal'), email);
    assert.equal(pareceDadoPessoal(TRECHO(email)), true, email);
    assert.deepEqual(validarCorpoEntradaTexto({ titulo: 'Contato', texto: TRECHO(email) }).campos, ['texto']);
  }
});

test('CI4. telefone, senha, token e credenciais continuam bloqueados junto com o contato institucional', () => {
  const comInstitucional = (extra) => `${TRECHO(INSTITUCIONAL)} ${extra}`;
  for (const extra of ['Ligue (65) 99999' + '-1234.', 'senha: abc12345', 'token=abcdef123456', 'Bearer abcdefghijkl1234', 'api_key: chave123']) {
    assert.ok(problemasDoTexto(comInstitucional(extra)).includes('dado_pessoal'), extra);
    if (!extra.startsWith('Bearer')) assert.equal(pareceDadoPessoal(comInstitucional(extra)), true, extra); // a prévia da tela não conhece Bearer; o servidor recusa
  }
});

test('CI5. título, descrição e alertas de bloco aceitam o contato institucional; o erro não repete o endereço', () => {
  const r = validarEntradaConhecimento({ titulo: 'Contato', texto: TRECHO(INSTITUCIONAL), fonteIds: ['f1'], referencias: [{ fonteId: 'f1', localizacao: 'página 1' }], alertas: [`Escreva para ${INSTITUCIONAL}.`] }, [{ id: 'f1', vigencia: { situacao: 'nao_se_aplica' } }]);
  assert.equal(r.ok, true, JSON.stringify(r));
  const externo = arroba('pessoa', 'exemplo.com');
  const ruim = validarEntradaConhecimento({ titulo: 'Contato', texto: TRECHO(externo), fonteIds: ['f1'], referencias: [{ fonteId: 'f1', localizacao: 'página 1' }] }, [{ id: 'f1', vigencia: { situacao: 'nao_se_aplica' } }]);
  assert.deepEqual([ruim.ok, ruim.campos], [false, ['texto']]);
  assert.ok(!JSON.stringify(ruim).includes(externo) && !JSON.stringify(ruim).includes('exemplo.com'));
});

test('CI6. desempenho: texto no limite com muitos arrobas não tem custo quadrático', () => {
  for (const hostil of ['a@'.repeat(10000), `${'a'.repeat(19990)}@`, `${'a.'.repeat(9000)}@`, `${INSTITUCIONAL} `.repeat(500)]) {
    const t0 = process.hrtime.bigint();
    contemEmailNaoPermitido(hostil);
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    assert.ok(ms < 200, `${ms.toFixed(1)} ms`);
  }
});
