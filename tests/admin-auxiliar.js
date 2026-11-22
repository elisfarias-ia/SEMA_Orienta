// Auxiliares dos testes do fluxo administrativo (não é um arquivo de teste). Só dados fictícios.

import { criarVersao, enviarParaValidacao } from '../services/admin/versao.js';
import { registrarDecisaoMaterial, autorizarPublicacao, publicarVersao, revogarVersao } from '../services/admin/decisoes.js';

// Sprint 8, Passo 8C: as gravações exigem o ator real. Maria Silva (Cadastrante) e Carlos Silva (Revisor) são usuários FICTÍCIOS
// do login simulado (atores.js), sem nome aqui: Maria nas ações de cadastro e revisão de conteúdo; Carlos nas de validação,
// autorização, publicação e revogação.
export const MARIA = Object.freeze({ usuarioId: 'maria-silva', perfil: 'cadastrante', setor: 'CLABI' });
export const CARLOS = Object.freeze({ usuarioId: 'carlos-silva', perfil: 'revisor', setor: 'CLABI' });

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
  if (estado !== 'revogado') return { v: congelar(r.versao), h: congelar(r.historico) };
  // Revogada (Sprint 7): a publicação real grava publicadoEm no manifesto; a revogação exige essa data.
  v = { ...r.versao, publicadoEm: '2026-01-14' };
  h = r.historico;
  r = revogarVersao(v, h, base(v, { id: 'revogacao-1', data: '2026-01-15', motivo: 'Motivo fictício de revogação.' }));
  return { v: congelar(r.versao), h: congelar(r.historico) };
}

// Sprint 8, Passo 8D (fase 1, ajuste mecânico): auxiliares que encapsulam a validação material usada como PREPARAÇÃO
// (para publicar, autorizar, revogar, nova versão, edição bloqueada etc.). Por enquanto executam o fluxo antigo, num passo
// só (concluir revisão como o Revisor); na fase 2 passarão a enviar para revisão (Cadastrante) e validar (Revisor).

/** Pelo serviço de revisão: conclui a revisão como o Revisor. Retorna o mesmo resultado de concluirRevisao. */
export function enviarEValidar(rev, servicoId, revisao, { revisor = CARLOS } = {}) {
  return rev.concluirRevisao(servicoId, { ator: revisor, revisao });
}

/**
 * Pela rota: recebe a função `post(rota, corpo)` do próprio arquivo de teste (que já troca a sessão para Carlos nas rotas
 * do Revisor) e o prefixo da rota, se ela usar o caminho completo. Retorna a mesma resposta do POST revisao/concluir.
 */
export function enviarEValidarPelaRota(post, revisao, { prefixo = '' } = {}) {
  return post(`${prefixo}revisao/concluir`, { revisao });
}
