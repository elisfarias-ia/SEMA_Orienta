// Representação canônica do conteúdo de uma versão e o seu hash (Sprint 5, Passo 5A). Funções PURAS: não leem arquivos,
// relógio nem variáveis de ambiente e nunca modificam o que recebem.
//
// O hash da versão cobre o CONTEÚDO MATERIAL, com chaves lógicas (não caminhos):
//   service, roteiro, documentos, perguntasFrequentes, fontes, conteudoAssistente e, quando a versão o referencia, entradas.
// Regras:
//   - JSON com ordenação canônica das chaves (hash.js); a ordem das listas é mantida;
//   - o roteiro tem CRLF e CR normalizados para LF, sem aparar nem reescrever o texto;
//   - ficam FORA: versao.json, hashConteudo e metadados do manifesto;
//   - fica fora só o que muda exclusivamente pela publicação: o campo `publicado` (em qualquer nível dos arquivos JSON);
//   - status de validação e de revisão ficam DENTRO (fazem parte da decisão material);
//   - alteração material muda o hash; mudar apenas `publicado` não muda.

import { hashConteudo } from './hash.js';

export const CHAVES_JSON_OBRIGATORIAS = Object.freeze(['service', 'documentos', 'perguntasFrequentes', 'fontes', 'conteudoAssistente']);
export const CHAVE_ROTEIRO = 'roteiro';
export const CHAVE_ENTRADAS = 'entradas';
export const CHAVES_DO_CONTEUDO = Object.freeze([...CHAVES_JSON_OBRIGATORIAS, CHAVE_ROTEIRO, CHAVE_ENTRADAS]);
/** Único campo que muda exclusivamente pela publicação e por isso não entra no hash. */
export const CAMPO_SO_DE_PUBLICACAO = 'publicado';

const ehObjetoSimples = (v) => {
  if (v === null || typeof v !== 'object') return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
};

/** CRLF e CR viram LF. Não apara, não remove linhas e não reescreve o texto. */
export const normalizarFimDeLinha = (texto) => texto.split('\r\n').join('\n').split('\r').join('\n');

/** Cópia profunda sem o campo `publicado` (qualquer nível). Lança TypeError para valor que não é JSON simples. */
export function removerCamposDePublicacao(valor) {
  if (Array.isArray(valor)) return valor.map(removerCamposDePublicacao);
  if (ehObjetoSimples(valor)) {
    const saida = {};
    for (const chave of Object.keys(valor)) {
      if (chave !== CAMPO_SO_DE_PUBLICACAO) saida[chave] = removerCamposDePublicacao(valor[chave]);
    }
    return saida;
  }
  if (valor === null || ['string', 'number', 'boolean'].includes(typeof valor)) return valor;
  throw new TypeError('valor que não é JSON simples');
}

/**
 * Monta o objeto canônico a partir dos conteúdos já lidos: { service, roteiro, documentos, perguntasFrequentes, fontes,
 * conteudoAssistente, entradas? } (os JSON como objetos, o roteiro como texto). `entradas` só entra se a versão o referencia.
 * Retorna { ok: true, conteudo } ou { ok: false, erro, chave? }.
 */
export function montarConteudoCanonico(arquivos) {
  if (!ehObjetoSimples(arquivos)) return { ok: false, erro: 'conteudo_invalido' };
  for (const chave of Object.keys(arquivos)) {
    if (!CHAVES_DO_CONTEUDO.includes(chave)) return { ok: false, erro: 'chave_desconhecida', chave };
  }
  for (const chave of [...CHAVES_JSON_OBRIGATORIAS, CHAVE_ROTEIRO]) {
    if (!(chave in arquivos)) return { ok: false, erro: 'arquivo_ausente', chave };
  }
  if (typeof arquivos[CHAVE_ROTEIRO] !== 'string') return { ok: false, erro: 'conteudo_invalido', chave: CHAVE_ROTEIRO };
  const conteudo = { [CHAVE_ROTEIRO]: normalizarFimDeLinha(arquivos[CHAVE_ROTEIRO]) };
  for (const chave of [...CHAVES_JSON_OBRIGATORIAS, CHAVE_ENTRADAS]) {
    if (!(chave in arquivos)) continue;
    if (!ehObjetoSimples(arquivos[chave])) return { ok: false, erro: 'conteudo_invalido', chave };
    try {
      conteudo[chave] = removerCamposDePublicacao(arquivos[chave]);
    } catch {
      return { ok: false, erro: 'conteudo_invalido', chave };
    }
  }
  return { ok: true, conteudo };
}

/** Hash SHA-256 (64 hexadecimais) da versão. Retorna { ok: true, hash, conteudo } ou { ok: false, erro, chave? }. */
export function calcularHashDaVersao(arquivos) {
  const m = montarConteudoCanonico(arquivos);
  if (!m.ok) return m;
  try {
    return { ok: true, hash: hashConteudo(m.conteudo), conteudo: m.conteudo };
  } catch {
    return { ok: false, erro: 'conteudo_invalido' };
  }
}

/** Confere o hash gravado com o conteúdo atual. Nunca lança exceção. */
export function hashConfere(hashGravado, arquivos) {
  if (typeof hashGravado !== 'string' || !/^[0-9a-f]{64}$/.test(hashGravado)) return false;
  const r = calcularHashDaVersao(arquivos);
  return r.ok && r.hash === hashGravado;
}
