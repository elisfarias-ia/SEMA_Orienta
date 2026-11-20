// Ator das ações administrativas (Sprint 7, Passo 7C). Funções puras, sem dependências.
//
// O ator é { usuarioId, perfil, setor } e precisa ser EXATAMENTE um dos usuários da lista fixa abaixo. Não há login nesta Sprint:
// quando nada é informado, vale o ator de demonstração. A Sprint 8 acrescenta à lista os usuários fictícios de demonstração do
// login simulado (Cadastrante e Revisor). O ator NÃO comprova identidade nem representa validação jurídica.
//
// Onde cada informação fica:
//   - auditoria completa (usuarioId, perfil, setor, ação, resultado, horário): só em data/admin-private/, fora do Git;
//   - manifesto da versão (vai para o Git): só { perfil, setor } de quem validou, autorizou, publicou ou revogou, nunca usuarioId,
//     nome ou e-mail (`responsavelPublico`).

// Perfis previstos. Nesta Sprint só o de demonstração tem usuário; cadastrante e revisor entram com o login simulado (Sprint 8).
export const PERFIS = Object.freeze(['demonstracao', 'cadastrante', 'revisor']);

export const ATOR_PADRAO = Object.freeze({ usuarioId: 'servidor-demonstracao', perfil: 'demonstracao', setor: 'Ambiente local de demonstração' });

/** Lista fixa de usuários autorizados (cada um com um único perfil e um único setor). */
export const USUARIOS_AUTORIZADOS = Object.freeze([ATOR_PADRAO]);

// Formato anterior (Sprints 5 e 6), aceito só na LEITURA de registros antigos: ator como texto nas ações e
// responsavel/unidade nas decisões. Novas gravações sempre usam o formato { usuarioId, perfil, setor }.
export const ATOR_LEGADO = Object.freeze({ responsavel: 'Servidor de demonstração', unidade: 'Ambiente local de demonstração' });

const CAMPOS_DO_ATOR = Object.freeze(['perfil', 'setor', 'usuarioId']);
const CAMPOS_DO_RESPONSAVEL_PUBLICO = Object.freeze(['perfil', 'setor']);
const ehObjeto = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const chavesExatas = (v, campos) => ehObjeto(v) && Object.keys(v).sort().join(',') === campos.join(',');

/** Confere o ator contra a lista fixa. Lista de erros (vazia = válido); nunca repete valores. */
export function validarAtor(ator) {
  if (!chavesExatas(ator, CAMPOS_DO_ATOR)) return ['ator deve ter exatamente usuarioId, perfil e setor'];
  const autorizado = USUARIOS_AUTORIZADOS.some((u) => u.usuarioId === ator.usuarioId && u.perfil === ator.perfil && u.setor === ator.setor);
  return autorizado ? [] : ['ator fora da lista de usuários autorizados'];
}

/** Ator informado ou, sem nenhum, o de demonstração. Devolve { ok: true, ator } (cópia) ou { ok: false, erro: 'ator_invalido' }. */
export function resolverAtor(ator) {
  const escolhido = ator === undefined ? ATOR_PADRAO : ator;
  if (validarAtor(escolhido).length > 0) return { ok: false, erro: 'ator_invalido' };
  return { ok: true, ator: { usuarioId: escolhido.usuarioId, perfil: escolhido.perfil, setor: escolhido.setor } };
}

/** O que pode ir para o Git: só perfil e setor (nunca usuarioId, nome ou e-mail). */
export const responsavelPublico = (ator) => ({ perfil: ator.perfil, setor: ator.setor });

/** Confere um responsável público do manifesto: exatamente { perfil, setor } de algum usuário autorizado. */
export function validarResponsavelPublico(r) {
  if (!chavesExatas(r, CAMPOS_DO_RESPONSAVEL_PUBLICO)) return ['responsável deve ter exatamente perfil e setor'];
  const autorizado = USUARIOS_AUTORIZADOS.some((u) => u.perfil === r.perfil && u.setor === r.setor);
  return autorizado ? [] : ['responsável fora da lista de usuários autorizados'];
}

/** Mesmo ator? Compara o formato novo e aceita o legado só para o ator de demonstração (registros de tentativas antigas). */
export function registroDoAtor(registro, ator) {
  if (!ehObjeto(registro)) return false;
  if (ehObjeto(registro.ator)) return registro.ator.usuarioId === ator.usuarioId && registro.ator.perfil === ator.perfil && registro.ator.setor === ator.setor;
  return ator.usuarioId === ATOR_PADRAO.usuarioId && registro.responsavel === ATOR_LEGADO.responsavel && registro.unidade === ATOR_LEGADO.unidade;
}
