// Ator das ações administrativas (Sprint 7, Passo 7C; Sprint 8, Passo 8A). Funções puras, sem dependências.
//
// O ator é { usuarioId, perfil, setor } e precisa ser EXATAMENTE um dos atores aceitos abaixo. O ator NÃO comprova identidade
// nem representa validação jurídica.
//
// Duas listas (Sprint 8):
//   - USUARIOS_SELECIONAVEIS: os usuários fictícios de demonstração do login simulado (Maria Silva, Cadastrante, e Carlos Silva,
//     Revisor, ambos da CLABI), com nome de exibição para a futura tela de login (8B). Não são pessoas reais.
//   - ATORES_ACEITOS: o ator de demonstração e os selecionáveis SEM nome, no formato { usuarioId, perfil, setor }. Vale na leitura
//     de registros e, até o 8C, também na gravação.
// Transição: até o 8C, quando nada é informado, vale o ator de demonstração (ATOR_PADRAO). No 8C o padrão deixa de existir e
// as gravações passam a exigir um usuário selecionável; o ator de demonstração continua aceito só na leitura de registros antigos.
//
// Onde cada informação fica:
//   - auditoria completa (usuarioId, perfil, setor, ação, resultado, horário): só em data/admin-private/, fora do Git;
//   - manifesto da versão (vai para o Git): só { perfil, setor } de quem validou, autorizou, publicou ou revogou, nunca usuarioId,
//     nome ou e-mail (`responsavelPublico`).

// Perfis previstos.
export const PERFIS = Object.freeze(['demonstracao', 'cadastrante', 'revisor']);

export const SETOR_CLABI = 'CLABI';

export const ATOR_DEMONSTRACAO = Object.freeze({ usuarioId: 'servidor-demonstracao', perfil: 'demonstracao', setor: 'Ambiente local de demonstração' });

// Apelido transitório: o ator padrão (sem ator informado) deixa de existir no 8C.
export const ATOR_PADRAO = ATOR_DEMONSTRACAO;

/** Usuários fictícios do login simulado (cada um com um único perfil e um único setor), com nome de exibição. */
export const USUARIOS_SELECIONAVEIS = Object.freeze([
  Object.freeze({ usuarioId: 'maria-silva', nome: 'Maria Silva', perfil: 'cadastrante', setor: SETOR_CLABI }),
  Object.freeze({ usuarioId: 'carlos-silva', nome: 'Carlos Silva', perfil: 'revisor', setor: SETOR_CLABI }),
]);

const semNome = (u) => Object.freeze({ usuarioId: u.usuarioId, perfil: u.perfil, setor: u.setor });
const SELECIONAVEIS_SEM_NOME = Object.freeze(USUARIOS_SELECIONAVEIS.map(semNome));

/** Atores aceitos, sem nome: o de demonstração e os selecionáveis. */
export const ATORES_ACEITOS = Object.freeze([ATOR_DEMONSTRACAO, ...SELECIONAVEIS_SEM_NOME]);

// Formato anterior (Sprints 5 e 6), aceito só na LEITURA de registros antigos: ator como texto nas ações e
// responsavel/unidade nas decisões. Novas gravações sempre usam o formato { usuarioId, perfil, setor }.
export const ATOR_LEGADO = Object.freeze({ responsavel: 'Servidor de demonstração', unidade: 'Ambiente local de demonstração' });

const CAMPOS_DO_ATOR = Object.freeze(['perfil', 'setor', 'usuarioId']);
const CAMPOS_DO_RESPONSAVEL_PUBLICO = Object.freeze(['perfil', 'setor']);
const ehObjeto = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const chavesExatas = (v, campos) => ehObjeto(v) && Object.keys(v).sort().join(',') === campos.join(',');
const mesmoAtor = (a, b) => a.usuarioId === b.usuarioId && a.perfil === b.perfil && a.setor === b.setor;

/** Confere o ator contra os atores aceitos. Lista de erros (vazia = válido); nunca repete valores. */
export function validarAtor(ator) {
  if (!chavesExatas(ator, CAMPOS_DO_ATOR)) return ['ator deve ter exatamente usuarioId, perfil e setor'];
  return ATORES_ACEITOS.some((u) => mesmoAtor(u, ator)) ? [] : ['ator fora da lista de atores aceitos'];
}

/** Confere o ator contra os usuários selecionáveis (sem nome). Lista de erros (vazia = válido). */
export function validarAtorSelecionavel(ator) {
  if (!chavesExatas(ator, CAMPOS_DO_ATOR)) return ['ator deve ter exatamente usuarioId, perfil e setor'];
  return SELECIONAVEIS_SEM_NOME.some((u) => mesmoAtor(u, ator)) ? [] : ['ator fora da lista de usuários selecionáveis'];
}

/** Ator de um usuário selecionável, sem nome. { ok: true, ator } (cópia) ou { ok: false, erro: 'usuario_invalido' }. */
export function atorDoUsuario(usuarioId) {
  const u = typeof usuarioId === 'string' ? SELECIONAVEIS_SEM_NOME.find((s) => s.usuarioId === usuarioId) : undefined;
  if (!u) return { ok: false, erro: 'usuario_invalido' };
  return { ok: true, ator: { usuarioId: u.usuarioId, perfil: u.perfil, setor: u.setor } };
}

/** Ator informado ou, sem nenhum, o de demonstração. Devolve { ok: true, ator } (cópia) ou { ok: false, erro: 'ator_invalido' }. */
export function resolverAtor(ator) {
  const escolhido = ator === undefined ? ATOR_PADRAO : ator;
  if (validarAtor(escolhido).length > 0) return { ok: false, erro: 'ator_invalido' };
  return { ok: true, ator: { usuarioId: escolhido.usuarioId, perfil: escolhido.perfil, setor: escolhido.setor } };
}

/** O que pode ir para o Git: só perfil e setor (nunca usuarioId, nome ou e-mail). */
export const responsavelPublico = (ator) => ({ perfil: ator.perfil, setor: ator.setor });

/** Confere um responsável público do manifesto: exatamente { perfil, setor } de algum ator aceito. */
export function validarResponsavelPublico(r) {
  if (!chavesExatas(r, CAMPOS_DO_RESPONSAVEL_PUBLICO)) return ['responsável deve ter exatamente perfil e setor'];
  return ATORES_ACEITOS.some((u) => u.perfil === r.perfil && u.setor === r.setor) ? [] : ['responsável fora da lista de atores aceitos'];
}

/** Mesmo ator? Compara o formato novo e aceita o legado só para o ator de demonstração (registros de tentativas antigas). */
export function registroDoAtor(registro, ator) {
  if (!ehObjeto(registro)) return false;
  if (ehObjeto(registro.ator)) return mesmoAtor(registro.ator, ator);
  return ator.usuarioId === ATOR_PADRAO.usuarioId && registro.responsavel === ATOR_LEGADO.responsavel && registro.unidade === ATOR_LEGADO.unidade;
}
