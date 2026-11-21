// Sessão do login simulado (Sprint 8, Passo 8B). Módulo puro: sem HTTP, sem requisição nem resposta, sem arquivos e sem log.
//
// Uma única sessão atual, só em memória do servidor de desenvolvimento: { token, usuarioId, ator } ou nenhuma.
//   - entrar(usuarioId): só usuários selecionáveis (atores.js). Sempre gera um token novo; o anterior deixa de valer.
//     Em recusa, a sessão atual não muda.
//   - sair(token): só com o token atual; senão falha e a sessão continua.
//   - tokenValido(token): SHA-256 dos dois lados e comparação em tempo constante; falso sem sessão.
//   - atorDoToken(token) (Passo 8C): numa única conferência (a mesma de tokenValido), o ator da sessão (cópia, sem nome) ou falha.
//     O endpoint chama esta função uma vez por pedido e fixa o ator: trocar a sessão depois não muda quem grava aquele pedido.
//   - atual(): usuário da sessão (com o nome vindo de USUARIOS_SELECIONAVEIS) e a lista de usuários selecionáveis.
// A sessão NÃO guarda nome. Falhas no formato { ok: false, erro }, sem repetir o valor recebido.
// O login é simulado: não há senha e nada comprova identidade. Maria Silva e Carlos Silva são usuários fictícios.

import crypto from 'node:crypto';
import { atorDoUsuario, USUARIOS_SELECIONAVEIS } from './atores.js';

const PADRAO_TOKEN = /^[0-9a-f]{64}$/;

const geradorPadrao = () => crypto.randomBytes(32).toString('hex');

/** Usuário de exibição (sem token): { usuarioId, nome, perfil, setor }. */
const exibicao = (u) => ({ usuarioId: u.usuarioId, nome: u.nome, perfil: u.perfil, setor: u.setor });

/** Cria o gerenciador da sessão. `gerarToken` é injetável nos testes. */
export function criarGerenciadorSessao({ gerarToken = geradorPadrao } = {}) {
  let sessao = null; // { token, usuarioId, ator }

  function tokenValido(recebido) {
    if (sessao === null || typeof recebido !== 'string' || !PADRAO_TOKEN.test(recebido)) return false;
    const a = crypto.createHash('sha256').update(recebido).digest();
    const b = crypto.createHash('sha256').update(sessao.token).digest();
    return crypto.timingSafeEqual(a, b);
  }

  /** Ator da sessão para o token recebido: { ok: true, ator } (cópia) ou { ok: false }. Uma só conferência em tempo constante. */
  function atorDoToken(recebido) {
    const atual = sessao;
    if (!tokenValido(recebido) || atual === null || sessao !== atual) return { ok: false };
    return { ok: true, ator: { usuarioId: atual.ator.usuarioId, perfil: atual.ator.perfil, setor: atual.ator.setor } };
  }

  return {
    /** Usuário da sessão (ou null) e os usuários selecionáveis. Nunca devolve o token. */
    atual() {
      const usuarios = USUARIOS_SELECIONAVEIS.map(exibicao);
      if (sessao === null) return { usuario: null, usuarios };
      const u = USUARIOS_SELECIONAVEIS.find((s) => s.usuarioId === sessao.usuarioId);
      return { usuario: u === undefined ? null : exibicao(u), usuarios };
    },

    /** Token da sessão atual (ou null), para o endpoint devolver ao navegador local. */
    token: () => (sessao === null ? null : sessao.token),

    /** Entra com um usuário selecionável. { ok: true, token, usuario } ou { ok: false, erro }. */
    entrar(usuarioId) {
      const r = atorDoUsuario(usuarioId);
      if (!r.ok) return { ok: false, erro: 'usuario_invalido' };
      let novo;
      try {
        novo = gerarToken();
      } catch {
        return { ok: false, erro: 'indisponivel' };
      }
      if (typeof novo !== 'string' || !PADRAO_TOKEN.test(novo)) return { ok: false, erro: 'indisponivel' };
      const u = USUARIOS_SELECIONAVEIS.find((s) => s.usuarioId === r.ator.usuarioId);
      sessao = { token: novo, usuarioId: r.ator.usuarioId, ator: r.ator };
      return { ok: true, token: novo, usuario: exibicao(u) };
    },

    /** Encerra a sessão, só com o token atual. { ok: true } ou { ok: false, erro: 'nao_autorizado' }. */
    sair(tokenRecebido) {
      if (!tokenValido(tokenRecebido)) return { ok: false, erro: 'nao_autorizado' };
      sessao = null;
      return { ok: true };
    },

    tokenValido,
    atorDoToken,
  };
}
