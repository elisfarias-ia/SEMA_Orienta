// Auxiliares dos testes do fluxo administrativo (não é um arquivo de teste). Só dados fictícios.

import { criarVersao, enviarParaValidacao } from '../services/admin/versao.js';
import { registrarDecisaoMaterial, autorizarPublicacao, publicarVersao } from '../services/admin/decisoes.js';

/** Congela o valor em profundidade: qualquer tentativa de modificá-lo lança erro. */
export function congelar(valor) {
  if (valor && typeof valor === 'object' && !Object.isFrozen(valor)) {
    Object.freeze(valor);
    for (const v of Object.values(valor)) congelar(v);
  }
  return valor;
}

export const ARQUIVOS = { roteiro: 'servicos-ficticios/exemplo/roteiro.md', fontes: 'servicos-ficticios/exemplo/fontes.json' };
export const CONTEUDO = { roteiro: 'Texto fictício do roteiro.', fontes: [{ id: 'fonte-ficticia-1' }] };

export const novaVersao = (extra = {}) =>
  criarVersao({ id: 'versao-1', servicoId: 'servico-ficticio', arquivos: ARQUIVOS, criadoEm: '2026-01-10', ...extra });
export const rascunho = () => congelar(novaVersao().versao);
export const emValidacao = () => congelar(enviarParaValidacao(rascunho(), CONTEUDO, '2026-01-11').versao);

/** Dados comuns de uma decisão fictícia para a versão dada. */
export const base = (v, extra = {}) => ({
  versaoId: v.id, hashConteudo: v.hashConteudo, responsavel: 'responsavel-ficticio-1', unidade: 'unidade-ficticia-1', data: '2026-01-12', ...extra,
});

/** Leva uma versão fictícia até o estado pedido, usando só as funções do módulo. Retorna { v, h } congelados. */
export function ate(estado) {
  let v = emValidacao();
  let h = [];
  if (estado === 'em_validacao') return { v, h };
  if (estado === 'ajustes_solicitados') {
    const r = registrarDecisaoMaterial(v, h, base(v, { id: 'decisao-1', decisao: 'ajustes_solicitados', observacao: 'Ajuste fictício.' }));
    return { v: congelar(r.versao), h: congelar(r.historico) };
  }
  let r = registrarDecisaoMaterial(v, h, base(v, { id: 'decisao-1', decisao: 'validado_materialmente' }));
  v = congelar(r.versao);
  h = congelar(r.historico);
  if (estado === 'validado_materialmente') return { v, h };
  r = autorizarPublicacao(v, h, base(v, { id: 'autorizacao-1', data: '2026-01-13' }));
  v = congelar(r.versao);
  h = congelar(r.historico);
  if (estado === 'autorizado_publicacao') return { v, h };
  r = publicarVersao(v, h);
  return { v: congelar(r.versao), h: congelar(r.historico) };
}
