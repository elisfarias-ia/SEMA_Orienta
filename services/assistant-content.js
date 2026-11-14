// Seleção do conteúdo que o assistente pode usar, por modo. Função pura e reutilizável:
// recebe os dados e o modo explicitamente; não lê arquivos, não lê variáveis de ambiente, não usa rede.
//
// Modos:
//   "publico"     (padrão) -> só bloco publicado, validado, com revisão de atualidade concluída e fontes publicadas
//                              e não revogadas. Enquanto nada for publicado, retorna zero blocos.
//   "teste_local"           -> só blocos marcados com ambiente "teste_local", e somente se houver autorização
//                              de teste estruturada (escopo teste_local, sem aprovação material nem pública).
// Qualquer outro modo é rejeitado com ModoDesconhecidoError.
//
// Somente BLOCOS de conteúdo passam por aqui: documentos e perguntas frequentes nunca são entregues.
// A escolha do modo pela interface (por exemplo, por variável de ambiente) fica para o Passo 6.

export const MODOS = Object.freeze(['publico', 'teste_local']);
export const MODO_PADRAO = 'publico';

export class ModoDesconhecidoError extends Error {
  constructor(modo) {
    super(`Modo desconhecido: ${JSON.stringify(modo)}. Modos aceitos: ${MODOS.join(', ')}.`);
    this.name = 'ModoDesconhecidoError';
  }
}

const PADRAO_DATA = /^\d{4}-\d{2}-\d{2}$/;
const ehObjeto = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/** A autorização de teste só vale com escopo teste_local e sem qualquer aprovação material ou pública. */
export function autorizacaoDeTesteValida(autorizacao) {
  return (
    ehObjeto(autorizacao) &&
    autorizacao.escopo === 'teste_local' &&
    typeof autorizacao.data === 'string' &&
    PADRAO_DATA.test(autorizacao.data) &&
    autorizacao.aprovacaoMaterial === false &&
    autorizacao.aprovacaoPublica === false
  );
}

function fonteLiberada(fonte) {
  if (!ehObjeto(fonte) || fonte.publicado !== true) return false;
  return !(ehObjeto(fonte.vigencia) && fonte.vigencia.situacao === 'revogada');
}

function fontesDoBlocoLiberadas(bloco, fontesPorId) {
  if (bloco.origem === 'regra_institucional') return true;
  if (bloco.origem !== 'fonte' || !Array.isArray(bloco.fonteIds) || bloco.fonteIds.length === 0) return false;
  return bloco.fonteIds.every((id) => fonteLiberada(fontesPorId.get(id)));
}

/**
 * Somente para o tipo "conhecimento": origem "fonte", fonteIds não vazio e sem repetição, e referências válidas que
 * correspondam, uma a uma, aos fonteIds. Os demais tipos não são afetados (retornam true).
 */
function estruturaDeConhecimentoValida(bloco) {
  if (bloco.tipo !== 'conhecimento') return true;
  if (bloco.origem !== 'fonte') return false;
  const ids = bloco.fonteIds;
  if (!Array.isArray(ids) || ids.length === 0 || !ids.every((i) => typeof i === 'string' && i.trim() !== '') || new Set(ids).size !== ids.length) return false;
  const refs = bloco.referencias;
  if (!Array.isArray(refs) || refs.length !== ids.length) return false;
  const citadas = new Set();
  for (const r of refs) {
    if (!ehObjeto(r) || typeof r.fonteId !== 'string' || !ids.includes(r.fonteId)) return false;
    if (typeof r.localizacao !== 'string' || r.localizacao.trim() === '') return false;
    citadas.add(r.fonteId);
  }
  return citadas.size === ids.length;
}

/** Cópia mínima do bloco: só o que o assistente pode usar. */
function copiaDoBloco(bloco) {
  const copia = {
    id: bloco.id,
    tipo: bloco.tipo,
    texto: bloco.texto,
    fonteIds: [...bloco.fonteIds],
    ambiente: bloco.ambiente,
  };
  if (typeof bloco.url === 'string') copia.url = bloco.url;
  if (typeof bloco.aviso === 'string') copia.aviso = bloco.aviso;
  return copia;
}

/**
 * @param {{ conteudo?: object, fontes?: object[] }} dados  conteudo = conteudo-assistente.json; fontes = fontes.json (lista)
 * @param {string} [modo='publico']
 * @returns {object[]} blocos liberados para o modo
 * @throws {ModoDesconhecidoError} quando o modo não é um dos aceitos
 */
export function selecionarBlocosAssistente(dados, modo = MODO_PADRAO) {
  if (typeof modo !== 'string' || !MODOS.includes(modo)) throw new ModoDesconhecidoError(modo);

  const conteudo = ehObjeto(dados) && ehObjeto(dados.conteudo) ? dados.conteudo : null;
  if (!conteudo || !Array.isArray(conteudo.blocos)) return [];
  const blocos = conteudo.blocos.filter(
    (b) => ehObjeto(b) && typeof b.texto === 'string' && Array.isArray(b.fonteIds) && typeof b.id === 'string',
  );

  if (modo === 'teste_local') {
    if (!autorizacaoDeTesteValida(conteudo.autorizacao)) return [];
    // Bloco de teste nunca é publicado: se estiver inconsistente (publicado true), não é entregue.
    return blocos.filter((b) => b.ambiente === 'teste_local' && b.publicado === false).map(copiaDoBloco);
  }

  const fontes = Array.isArray(dados.fontes) ? dados.fontes : [];
  const fontesPorId = new Map(fontes.filter(ehObjeto).map((f) => [f.id, f]));
  return blocos
    .filter(
      (b) =>
        b.ambiente === 'publico' &&
        b.publicado === true &&
        b.statusValidacao === 'validado' &&
        b.revisaoAtualidade === 'concluida' &&
        estruturaDeConhecimentoValida(b) &&
        fontesDoBlocoLiberadas(b, fontesPorId),
    )
    .map(copiaDoBloco);
}
