// Ações exigidas por cada rota administrativa que grava (Sprint 8, Passo 8C). Módulo PURO: sem HTTP, sem arquivos e sem log.
//
// acoesDaRequisicao({ caminho, metodo }) devolve a lista de ações (permissoes.js) que o perfil da sessão precisa ter para a
// gravação, ou null quando a requisição não grava: GET em geral, a própria sessão (POST e DELETE /__admin/sessao) e a busca de
// links (POST .../links-existentes/busca, somente leitura). O endpoint confere estas ações ANTES de ler o corpo.
//
// Pseudônimo até o Passo 8D: "concluir a revisão" exige validar_materialmente (só o Revisor). O histórico continua registrando
// a ação como concluir_revisao. Ações da matriz sem rota própria (ainda): enviar_para_revisao e solicitar_ajustes.

import { ACOES } from './permissoes.js';

const SERVICO = '[a-z][a-z0-9-]*';
const ITEM = '[a-z][a-z0-9-]{0,59}';
const rota = (metodo, padrao, acoes, exemplo) => Object.freeze({ metodo, padrao: new RegExp(`^${padrao}$`), acoes: Object.freeze([...acoes]), exemplo });

/** As rotas que gravam, com o método, as ações exigidas e um caminho de exemplo (usado nos testes). */
export const ROTAS_GRAVADORAS = Object.freeze([
  rota('POST', '/__admin/assuntos', ['cadastrar_tema'], '/__admin/assuntos'),
  rota('POST', '/__admin/servicos', ['cadastrar_servico'], '/__admin/servicos'),
  rota('POST', '/__admin/servico-com-tema', ['cadastrar_servico', 'cadastrar_tema'], '/__admin/servico-com-tema'),
  rota('POST', '/__admin/cadastro-guiado', ['cadastrar_tema', 'cadastrar_servico', 'cadastrar_fonte'], '/__admin/cadastro-guiado'),
  rota('POST', `/__admin/servicos/${SERVICO}/fontes`, ['cadastrar_fonte'], '/__admin/servicos/lac/fontes'),
  rota('POST', `/__admin/servicos/${SERVICO}/links`, ['cadastrar_link'], '/__admin/servicos/lac/links'),
  rota('POST', `/__admin/servicos/${SERVICO}/links-existentes`, ['cadastrar_link'], '/__admin/servicos/lac/links-existentes'),
  rota('POST', `/__admin/servicos/${SERVICO}/entradas-texto`, ['cadastrar_texto'], '/__admin/servicos/lac/entradas-texto'),
  rota('POST', `/__admin/servicos/${SERVICO}/conhecimentos`, ['cadastrar_informacao'], '/__admin/servicos/lac/conhecimentos'),
  rota('PATCH', `/__admin/servicos/${SERVICO}/conhecimentos/${ITEM}`, ['editar_informacao'], '/__admin/servicos/lac/conhecimentos/bc-exemplo'),
  rota('DELETE', `/__admin/servicos/${SERVICO}/conhecimentos/${ITEM}`, ['excluir_informacao'], '/__admin/servicos/lac/conhecimentos/bc-exemplo'),
  rota('PATCH', `/__admin/servicos/${SERVICO}/fontes/${ITEM}`, ['editar_fonte'], '/__admin/servicos/lac/fontes/fonte-exemplo'),
  rota('DELETE', `/__admin/servicos/${SERVICO}/fontes/${ITEM}`, ['excluir_fonte'], '/__admin/servicos/lac/fontes/fonte-exemplo'),
  rota('PATCH', `/__admin/servicos/${SERVICO}/edicao`, ['editar_servico'], '/__admin/servicos/lac/edicao'),
  rota('PATCH', `/__admin/temas/${SERVICO}/edicao`, ['editar_tema'], '/__admin/temas/licenciamento-ambiental/edicao'),
  rota('POST', `/__admin/servicos/${SERVICO}/importacao`, ['importar_conteudo'], '/__admin/servicos/lac/importacao'),
  rota('POST', `/__admin/servicos/${SERVICO}/revisao/fontes`, ['revisar_fonte'], '/__admin/servicos/lac/revisao/fontes'),
  rota('POST', `/__admin/servicos/${SERVICO}/revisao/blocos/aceitar`, ['aceitar_bloco'], '/__admin/servicos/lac/revisao/blocos/aceitar'),
  rota('POST', `/__admin/servicos/${SERVICO}/revisao/blocos/rejeitar`, ['rejeitar_bloco'], '/__admin/servicos/lac/revisao/blocos/rejeitar'),
  rota('POST', `/__admin/servicos/${SERVICO}/revisao/blocos/reabrir`, ['reabrir_bloco'], '/__admin/servicos/lac/revisao/blocos/reabrir'),
  rota('POST', `/__admin/servicos/${SERVICO}/nova-versao`, ['nova_versao'], '/__admin/servicos/lac/nova-versao'),
  // Pseudônimo até o 8D: concluir a revisão = validar materialmente (Revisor).
  rota('POST', `/__admin/servicos/${SERVICO}/revisao/concluir`, ['validar_materialmente'], '/__admin/servicos/lac/revisao/concluir'),
  rota('POST', `/__admin/servicos/${SERVICO}/autorizacao`, ['autorizar_publicacao'], '/__admin/servicos/lac/autorizacao'),
  rota('POST', `/__admin/servicos/${SERVICO}/publicacao`, ['publicar'], '/__admin/servicos/lac/publicacao'),
  rota('POST', `/__admin/servicos/${SERVICO}/revogacao`, ['revogar'], '/__admin/servicos/lac/revogacao'),
]);

/** Ações exigidas pela requisição (cópia) ou null se ela não grava. Entradas que não sejam texto também dão null. */
export function acoesDaRequisicao({ caminho, metodo } = {}) {
  if (typeof caminho !== 'string' || typeof metodo !== 'string') return null;
  const r = ROTAS_GRAVADORAS.find((x) => x.metodo === metodo && x.padrao.test(caminho));
  return r === undefined ? null : [...r.acoes];
}

/** Ações da matriz que ainda não têm rota (em ordem da matriz). */
export function acoesSemRota() {
  const comRota = new Set(ROTAS_GRAVADORAS.flatMap((r) => r.acoes));
  return ACOES.filter((a) => !comRota.has(a));
}
