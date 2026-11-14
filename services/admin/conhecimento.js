// Blocos de conhecimento (Sprint 3, Passo 3A). Funções PURAS: não leem arquivos, não usam relógio nem aleatoriedade e
// nunca modificam o que recebem (devolvem cópias novas). O id e as datas (AAAA-MM-DD) vêm de fora.
//
// O bloco de conhecimento vive no vetor `blocos` de conteudo-assistente.json (fonte única de verdade, versionada com a
// versão do serviço). Nasce em rascunho, não publicado, com revisão pendente e ambiente "publico" — que NÃO significa
// publicado: o assistente só recebe bloco publicado, validado e com revisão concluída (selecionarBlocosAssistente).
// Só se cria, altera ou remove com a versão em rascunho. Nenhuma função aqui publica, valida ou grava.
//
// Identidade auditável de um bloco: versaoId + blocoId. O blocoId (`id`) pode permanecer entre versões para representar a
// linhagem do bloco; sozinho ele não identifica um conteúdo, porque cada versão guarda o seu próprio estado do bloco.
//
// Resultado: { ok: true, ... } ou { ok: false, erro: '<codigo>', detalhes?: [...] } (detalhes nomeiam campos, sem repetir conteúdo).

import { conteudoEditavel } from './fluxo.js';
import { dataIsoValida, falha, idValido, structuredCloneSeguro, validarVersao } from './versao.js';
import { CAMPOS_BLOCO_CONHECIMENTO, LIMITES_CONHECIMENTO, validarConteudoAssistente } from '../../scripts/validate-services.js';

export const TIPO_CONHECIMENTO = 'conhecimento';
/** Campos que a pessoa informa. Todo o resto (id, status, publicação, ambiente, origem, datas) é definido pelo servidor. */
export const CAMPOS_ENTRADA = Object.freeze(['titulo', 'texto', 'fonteIds', 'referencias', 'alertas']);
// Mesmos limites do validador da base (fonte única, em validate-services.js).
export const LIMITES = LIMITES_CONHECIMENTO;

const CONTROLE = /[\u0000-\u0008\u000b-\u001f\u007f]/; // permite quebra de linha (\n) e tabulação
const PADRAO_EMAIL = /[\w.+-]+@[\w-]+(\.[\w-]+)+/;
const PADRAO_TELEFONE = /(\(\d{2}\)|\b\d{2})\s?\d{4,5}[-\s]?\d{4}\b/;
const ehObjeto = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const ehConhecimento = (b) => ehObjeto(b) && b.tipo === TIPO_CONHECIMENTO;

/** Texto aceitável: string sem controle, aparada, dentro do limite, sem e-mail nem telefone. Retorna o texto ou null. */
function texto(valor, limite) {
  if (typeof valor !== 'string' || CONTROLE.test(valor)) return null;
  const t = valor.trim();
  if (t === '' || t.length > limite || PADRAO_EMAIL.test(t) || PADRAO_TELEFONE.test(t)) return null;
  return t;
}

const fontesPorId = (fontes) => new Map((Array.isArray(fontes) ? fontes : []).filter(ehObjeto).map((f) => [f.id, f]));
const fonteRevogada = (f) => ehObjeto(f.vigencia) && f.vigencia.situacao === 'revogada';

/**
 * Confere a entrada da pessoa. Retorna { ok: true, dados } (texto aparado) ou { ok: false, campos } com os NOMES dos campos
 * inválidos. Exige ao menos uma fonte existente e não revogada e uma referência para cada fonte (sem repetição).
 */
export function validarEntradaConhecimento(entrada, fontes) {
  if (!ehObjeto(entrada)) return { ok: false, campos: ['entrada'] };
  const campos = [];
  if (Object.keys(entrada).some((k) => !CAMPOS_ENTRADA.includes(k))) campos.push('extras');
  const titulo = texto(entrada.titulo, LIMITES.titulo);
  if (titulo === null) campos.push('titulo');
  const corpo = texto(entrada.texto, LIMITES.texto);
  if (corpo === null) campos.push('texto');

  const porId = fontesPorId(fontes);
  const ids = entrada.fonteIds;
  let fonteIdsOk = Array.isArray(ids) && ids.length >= 1 && ids.length <= LIMITES.fontes && ids.every((i) => typeof i === 'string' && i.trim() !== '');
  if (fonteIdsOk && new Set(ids).size !== ids.length) fonteIdsOk = false;
  if (fonteIdsOk && !ids.every((i) => porId.has(i) && !fonteRevogada(porId.get(i)))) fonteIdsOk = false;
  if (!fonteIdsOk) campos.push('fonteIds');

  const referencias = [];
  let referenciasOk = Array.isArray(entrada.referencias) && entrada.referencias.length >= 1;
  if (referenciasOk) {
    for (const r of entrada.referencias) {
      const localizacao = ehObjeto(r) && Object.keys(r).every((k) => k === 'fonteId' || k === 'localizacao') ? texto(r.localizacao, LIMITES.localizacao) : null;
      if (localizacao === null || typeof r.fonteId !== 'string') {
        referenciasOk = false;
        break;
      }
      referencias.push({ fonteId: r.fonteId, localizacao });
    }
  }
  if (referenciasOk) {
    const citadas = referencias.map((r) => r.fonteId);
    if (new Set(citadas).size !== citadas.length) referenciasOk = false;
    else if (!fonteIdsOk || citadas.length !== ids.length || !citadas.every((c) => ids.includes(c))) referenciasOk = false;
  }
  if (!referenciasOk) campos.push('referencias');

  let alertas;
  if (entrada.alertas !== undefined) {
    const lista = entrada.alertas;
    const aparados = Array.isArray(lista) && lista.length <= LIMITES.alertas ? lista.map((a) => texto(a, LIMITES.alerta)) : null;
    if (aparados === null || aparados.includes(null)) campos.push('alertas');
    else alertas = aparados;
  }
  if (campos.length) return { ok: false, campos };
  const dados = { titulo, texto: corpo, fonteIds: [...ids], referencias };
  if (alertas !== undefined && alertas.length > 0) dados.alertas = alertas;
  return { ok: true, dados };
}

/** Confere versão (válida e em rascunho) e conteúdo (objeto com lista de blocos). Retorna a falha ou null. */
function conferirEntrada(versao, conteudo) {
  const erros = validarVersao(versao);
  if (erros.length) return falha('versao_invalida', erros);
  if (!conteudoEditavel(versao.estado)) return falha('versao_nao_editavel');
  if (!ehObjeto(conteudo) || !Array.isArray(conteudo.blocos)) return falha('conteudo_invalido');
  return null;
}

/** O arquivo inteiro resultante tem de passar pelo validador da base; senão a operação é recusada. */
function conferirResultado(novo, fontes) {
  const erros = validarConteudoAssistente(novo, { idServico: novo.serviceId, fontesPorId: fontesPorId(fontes) });
  return erros.length ? falha('conteudo_invalido', erros) : null;
}

/** Cria um bloco de conhecimento no fim da lista: rascunho, não publicado, revisão pendente, ambiente publico. */
export function montarBlocoConhecimento(versao, conteudo, fontes, entrada, { id, data } = {}) {
  const problema = conferirEntrada(versao, conteudo);
  if (problema) return problema;
  if (!idValido(id) || id.length > 60) return falha('id_invalido');
  if (!dataIsoValida(data)) return falha('data_invalida');
  if (conteudo.blocos.some((b) => ehObjeto(b) && b.id === id)) return falha('id_duplicado');
  const v = validarEntradaConhecimento(entrada, fontes);
  if (!v.ok) return falha('dados_invalidos', v.campos);
  const bloco = {
    id, tipo: TIPO_CONHECIMENTO, ...v.dados, origem: 'fonte', ambiente: 'publico', statusValidacao: 'rascunho', publicado: false,
    revisaoAtualidade: 'pendente', criadoEm: data, atualizadoEm: data,
  };
  // criadoEm e atualizadoEm saem de `data`, já conferida acima como AAAA-MM-DD válida (código fechado: data_invalida).
  if (!dataIsoValida(bloco.criadoEm) || !dataIsoValida(bloco.atualizadoEm)) return falha('data_invalida');
  const novo = { ...structuredCloneSeguro(conteudo), blocos: [...structuredCloneSeguro(conteudo.blocos), bloco] };
  return conferirResultado(novo, fontes) ?? { ok: true, conteudo: novo, bloco };
}

/** Altera um bloco de conhecimento em rascunho e não publicado. Mantém id, criadoEm e as marcas de status. */
export function alterarBlocoConhecimento(versao, conteudo, fontes, id, entrada, { data } = {}) {
  const problema = conferirEntrada(versao, conteudo);
  if (problema) return problema;
  if (!dataIsoValida(data)) return falha('data_invalida');
  const indice = conteudo.blocos.findIndex((b) => ehObjeto(b) && b.id === id);
  if (indice === -1) return falha('bloco_nao_encontrado');
  const atual = conteudo.blocos[indice];
  if (!ehConhecimento(atual)) return falha('bloco_nao_editavel');
  // Só edita bloco ainda em rascunho (a versão já foi conferida em rascunho por conferirEntrada).
  if (atual.statusValidacao !== 'rascunho' || atual.publicado !== false || atual.revisaoAtualidade !== 'pendente') return falha('bloco_nao_editavel');
  // criadoEm do bloco atual precisa ser uma data válida: sem isso a comparação abaixo não tem sentido (código fechado).
  if (!dataIsoValida(atual.criadoEm)) return falha('data_invalida');
  if (data < atual.criadoEm) return falha('data_anterior_a_criacao');
  const v = validarEntradaConhecimento(entrada, fontes);
  if (!v.ok) return falha('dados_invalidos', v.campos);
  const bloco = {
    id: atual.id, tipo: TIPO_CONHECIMENTO, ...v.dados, origem: 'fonte', ambiente: 'publico', statusValidacao: 'rascunho', publicado: false,
    revisaoAtualidade: 'pendente', criadoEm: atual.criadoEm, atualizadoEm: data,
  };
  const blocos = structuredCloneSeguro(conteudo.blocos);
  blocos[indice] = bloco;
  const novo = { ...structuredCloneSeguro(conteudo), blocos };
  return conferirResultado(novo, fontes) ?? { ok: true, conteudo: novo, bloco };
}

/**
 * Remove somente bloco do tipo conhecimento, em versão em rascunho, com statusValidacao "rascunho", publicado false e
 * revisaoAtualidade "pendente". Qualquer outra condição recusa a remoção. Os demais blocos ficam intactos.
 */
export function removerBlocoConhecimento(versao, conteudo, id) {
  const problema = conferirEntrada(versao, conteudo);
  if (problema) return problema;
  const indice = conteudo.blocos.findIndex((b) => ehObjeto(b) && b.id === id);
  if (indice === -1) return falha('bloco_nao_encontrado');
  const alvo = conteudo.blocos[indice];
  if (!ehConhecimento(alvo)) return falha('bloco_nao_removivel');
  if (alvo.statusValidacao !== 'rascunho' || alvo.publicado !== false || alvo.revisaoAtualidade !== 'pendente') return falha('bloco_nao_removivel');
  const blocos = structuredCloneSeguro(conteudo.blocos).filter((_, i) => i !== indice);
  return { ok: true, conteudo: { ...structuredCloneSeguro(conteudo), blocos }, removido: structuredCloneSeguro(alvo) };
}

/**
 * Prepara o conteúdo para uma NOVA versão: os blocos de conhecimento são copiados com o MESMO id (único dentro do arquivo
 * da nova versão, sem aleatoriedade e rastreável entre versões) e reiniciados — rascunho, publicado false e revisão
 * pendente, com atualizadoEm = data. Os demais blocos (como os de teste_local) e o restante do arquivo são copiados sem
 * alteração. O conteúdo recebido não é modificado (a versão anterior é preservada).
 */
export function prepararBlocosParaNovaVersao(conteudo, { data } = {}) {
  if (!ehObjeto(conteudo) || !Array.isArray(conteudo.blocos)) return falha('conteudo_invalido');
  if (!dataIsoValida(data)) return falha('data_invalida');
  // Antes de copiar: todo bloco de conhecimento precisa ter criadoEm válido (código fechado, sem depender da validação final).
  if (conteudo.blocos.some((b) => ehConhecimento(b) && !dataIsoValida(b.criadoEm))) return falha('data_invalida');
  const copia = structuredCloneSeguro(conteudo);
  let reiniciados = 0;
  copia.blocos = copia.blocos.map((b) => {
    if (!ehConhecimento(b)) return b;
    reiniciados += 1;
    const atualizadoEm = data < b.criadoEm ? b.criadoEm : data;
    return { ...b, statusValidacao: 'rascunho', publicado: false, revisaoAtualidade: 'pendente', atualizadoEm };
  });
  return { ok: true, conteudo: copia, reiniciados };
}

export { CAMPOS_BLOCO_CONHECIMENTO };
