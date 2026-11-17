// Edição e exclusão LÓGICA de fontes da versão atual (Sprint 5, Passo 5B3a): regras PURAS. Não leem arquivos, não usam relógio nem
// aleatoriedade e nunca modificam o que recebem (devolvem cópias novas). A data (AAAA-MM-DD) vem de fora.
//
// Editar link: título, URL, órgão que publicou, descrição, data de publicação e localização relevante.
// Editar texto: título e texto original (o hash do texto é recalculado em entradas.json).
// Toda edição material REINICIA a revisão da fonte (volta a "Ainda não revisada": validado -> em_validacao, sem dataConsulta,
// sempre `publicado` falso) e REABRE, na mesma operação, os blocos de conhecimento aceitos que a utilizam. A URL não pode repetir
// outra fonte ativa do mesmo serviço. Nunca altera uma versão congelada (quem chama só usa a versão atual em rascunho).
//
// Excluir é uma exclusão LÓGICA e INVISÍVEL na gestão: a fonte (e, se for texto, a sua entrada) continua só como registro interno da
// versão em que existia (`excluidaEm`); some de listas, buscas, seleções e reutilização, não conta como pendência, não é lida pelo
// chatbot nem pelo MCP e NÃO é copiada para novas versões. A exclusão NÃO é bloqueada por referências: na mesma operação as
// referências ativas da versão editável são retiradas (informação que ainda tiver outra fonte válida continua; sem fonte válida sai do
// conteúdo ativo; informação aceita que mudar volta a "Em elaboração"; campos do serviço que ficarem sem fonte voltam a pendentes;
// documentos e perguntas antigos que citem a fonte saem do conteúdo ativo).
//
// Resultado: { ok: true, ... } ou { ok: false, erro, ... } (códigos; nunca o conteúdo digitado).

import { urlNormalizada, validarCorpoFonte } from './cadastro.js';
import { hashTexto, totaisDasEntradas, validarArquivoEntradas, validarCorpoEntradaTexto, LIMITES_ENTRADA } from './entradas.js';
import { dataIsoValida, falha } from './versao.js';

const ehObjeto = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const PADRAO_ID = /^[a-z][a-z0-9-]*$/;
const PADRAO_REVISAO = /^[0-9a-f]{64}$/;
const LIMITE_ID = 60;
const idValido = (v) => typeof v === 'string' && v.length <= LIMITE_ID && PADRAO_ID.test(v);
const listaDe = (doc, chave) => (ehObjeto(doc) && Array.isArray(doc[chave]) ? doc[chave].filter(ehObjeto) : []);
const contarCaracteres = (t) => Array.from(t).length;
const contarBytes = (t) => Buffer.byteLength(t, 'utf8');

/** Fonte excluída logicamente pela administração. */
export const fonteExcluida = (f) => ehObjeto(f) && f.excluidaEm != null;
/** Fonte revogada (vigência). */
export const fonteRevogadaPorVigencia = (f) => ehObjeto(f) && ehObjeto(f.vigencia) && f.vigencia.situacao === 'revogada';
/** Fonte que não pode ser usada: excluída ou revogada. */
export const fonteIndisponivel = (f) => fonteExcluida(f) || fonteRevogadaPorVigencia(f);

export const CAMPOS_EDICAO_LINK = Object.freeze(['titulo', 'url', 'orgaoResponsavel', 'descricao', 'dataPublicacao', 'localizacao']);
export const CAMPOS_EDICAO_TEXTO = Object.freeze(['titulo', 'texto']);

/** Corpo do PATCH: `revisao` + campos de edição (o servidor decide, pelo tipo da fonte, quais valem). Retorna { ok, dados } ou { ok: false, campos }. */
export function validarCorpoEdicaoFonte(corpo) {
  if (!ehObjeto(corpo)) return { ok: false, campos: ['corpo'] };
  const permitidos = ['revisao', ...CAMPOS_EDICAO_LINK, ...CAMPOS_EDICAO_TEXTO];
  const campos = [];
  if (Object.keys(corpo).some((k) => !permitidos.includes(k))) campos.push('extras');
  if (typeof corpo.revisao !== 'string' || !PADRAO_REVISAO.test(corpo.revisao)) campos.push('revisao');
  const { revisao, ...resto } = corpo;
  if (Object.keys(resto).length === 0) campos.push('nada_a_alterar');
  for (const [k, v] of Object.entries(resto)) if (typeof v !== 'string') campos.push(k);
  return campos.length ? { ok: false, campos: [...new Set(campos)] } : { ok: true, dados: { revisao, campos: resto } };
}

/** Identidade na rota (nunca no corpo). */
export const fonteIdValido = idValido;

/** Campos editáveis atuais da fonte, para preencher o formulário (texto original só aqui, sob demanda). */
export function dadosParaEdicao(arquivos, fonteId) {
  if (!idValido(fonteId)) return falha('dados_invalidos');
  const f = listaDe(arquivos.fontes, 'fontes').find((x) => x.id === fonteId);
  if (!f) return falha('fonte_nao_encontrada');
  if (fonteExcluida(f)) return falha('fonte_nao_encontrada');
  if (fonteRevogadaPorVigencia(f)) return falha('fonte_excluida');
  if (f.formaEntrada === 'texto') {
    const e = listaDe(arquivos.entradas, 'entradas').find((x) => x.id === f.entradaId);
    if (!e) return falha('entrada_invalida');
    return { ok: true, edicao: { forma: 'texto', titulo: f.titulo, texto: e.texto } };
  }
  return {
    ok: true,
    edicao: {
      forma: 'link', titulo: f.titulo, url: f.url, orgaoResponsavel: f.orgaoResponsavel, descricao: f.descricao ?? '',
      dataPublicacao: f.dataPublicacao ?? '', localizacao: f.dispositivoRelevante ?? '',
    },
  };
}

/** Reabre (volta a rascunho, revisão pendente, não publicado) os blocos de conhecimento ACEITOS que citam a fonte. */
function reabrirBlocosDaFonte(conteudoAssistente, fonteId, data) {
  const doc = structuredClone(conteudoAssistente);
  const titulos = [];
  doc.blocos = (Array.isArray(doc.blocos) ? doc.blocos : []).map((b) => {
    if (!ehObjeto(b) || b.tipo !== 'conhecimento' || !Array.isArray(b.fonteIds) || !b.fonteIds.includes(fonteId) || b.statusValidacao !== 'validado') return b;
    titulos.push(b.titulo);
    const atualizadoEm = dataIsoValida(b.criadoEm) && data < b.criadoEm ? b.criadoEm : data;
    return { ...b, statusValidacao: 'rascunho', revisaoAtualidade: 'pendente', publicado: false, atualizadoEm };
  });
  return { doc, titulos };
}

/** Reinicia a revisão da fonte: validado volta a em_validacao; sem data de consulta; nunca publicado. */
const reiniciarFonte = (f) => ({ ...f, statusValidacao: f.statusValidacao === 'validado' ? 'em_validacao' : f.statusValidacao, dataConsulta: null, publicado: false });

/**
 * Edita uma fonte da versão atual. `arquivos`: { fontes, conteudoAssistente, entradas? }. `campos`: só os campos de edição (strings).
 * Retorna { ok: true, fontes, conteudoAssistente, entradas?, blocosReabertos: [títulos] } ou { ok: false, erro, campos? }.
 */
export function editarFonte(arquivos, fonteId, campos, data, servicoId) {
  if (!dataIsoValida(data) || !idValido(fonteId) || !ehObjeto(campos)) return falha('dados_invalidos');
  const doc = arquivos.fontes;
  const lista = listaDe(doc, 'fontes');
  const alvo = lista.find((f) => f.id === fonteId);
  if (!alvo) return falha('fonte_nao_encontrada');
  if (fonteExcluida(alvo)) return falha('fonte_nao_encontrada');
  if (fonteRevogadaPorVigencia(alvo)) return falha('fonte_excluida');
  const ehTexto = alvo.formaEntrada === 'texto';
  const permitidos = ehTexto ? CAMPOS_EDICAO_TEXTO : CAMPOS_EDICAO_LINK;
  const fora = Object.keys(campos).filter((k) => !permitidos.includes(k));
  if (fora.length > 0) return { ok: false, erro: 'dados_invalidos', campos: ['extras'] };

  let novaFonte;
  let entradasNovas;
  if (ehTexto) {
    const atual = listaDe(arquivos.entradas, 'entradas');
    const entrada = atual.find((e) => e.id === alvo.entradaId);
    if (!entrada) return falha('entrada_invalida');
    const v = validarCorpoEntradaTexto({ titulo: campos.titulo ?? alvo.titulo, texto: campos.texto ?? entrada.texto });
    if (!v.ok) return { ok: false, erro: 'dados_invalidos', campos: v.campos.filter((c) => c === 'titulo' || c === 'texto') };
    const totais = totaisDasEntradas(atual.filter((e) => e.id !== entrada.id));
    if (totais.caracteres + contarCaracteres(v.dados.texto) > LIMITES_ENTRADA.caracteresVersao || totais.bytes + contarBytes(v.dados.texto) > LIMITES_ENTRADA.bytesVersao) {
      return { ok: false, erro: 'dados_invalidos', campos: ['texto'] };
    }
    const atualizadoEm = dataIsoValida(entrada.criadoEm) && data < entrada.criadoEm ? entrada.criadoEm : data;
    entradasNovas = structuredClone(arquivos.entradas);
    entradasNovas.entradas = entradasNovas.entradas.map((e) => (e.id === entrada.id ? { ...e, texto: v.dados.texto, hash: hashTexto(v.dados.texto), atualizadoEm } : e));
    novaFonte = reiniciarFonte({ ...alvo, titulo: v.dados.titulo });
  } else {
    const descricaoInformada = campos.descricao !== undefined ? campos.descricao : (alvo.descricao ?? '');
    const dispositivo = campos.localizacao !== undefined ? campos.localizacao : (alvo.dispositivoRelevante ?? '');
    const dataPublicacao = campos.dataPublicacao !== undefined ? campos.dataPublicacao : (alvo.dataPublicacao ?? '');
    const v = validarCorpoFonte({
      revisao: 'a'.repeat(64),
      id: alvo.id,
      titulo: campos.titulo ?? alvo.titulo,
      tipo: alvo.tipo,
      orgaoResponsavel: campos.orgaoResponsavel ?? alvo.orgaoResponsavel,
      url: campos.url ?? alvo.url,
      descricao: descricaoInformada === '' ? 'x' : descricaoInformada, // descrição vazia é permitida na edição
      origemOficial: alvo.origemOficial,
      dataPublicacao,
      dispositivoRelevante: dispositivo,
    });
    if (!v.ok) return { ok: false, erro: 'dados_invalidos', campos: v.campos.filter((c) => !['id', 'revisao', 'tipo', 'origemOficial', 'extras'].includes(c)).map((c) => (c === 'dispositivoRelevante' ? 'localizacao' : c)) };
    const normalizada = urlNormalizada(v.dados.url);
    if (lista.some((x) => x.id !== alvo.id && !fonteExcluida(x) && urlNormalizada(x.url) === normalizada)) return { ok: false, erro: 'url_duplicada' };
    const mudouUrl = normalizada !== urlNormalizada(alvo.url);
    const { reutilizadaDe, ...semLinhagem } = alvo;
    novaFonte = reiniciarFonte({
      ...(mudouUrl ? semLinhagem : alvo),
      titulo: v.dados.titulo,
      url: v.dados.url,
      orgaoResponsavel: v.dados.orgaoResponsavel,
      descricao: descricaoInformada === '' ? '' : v.dados.descricao,
      dataPublicacao: v.dados.dataPublicacao,
      dispositivoRelevante: v.dados.dispositivoRelevante,
    });
  }
  const fontes = structuredClone(doc);
  fontes.fontes = fontes.fontes.map((f) => (ehObjeto(f) && f.id === fonteId ? novaFonte : f));
  const { doc: conteudoAssistente, titulos } = reabrirBlocosDaFonte(arquivos.conteudoAssistente, fonteId, data);
  if (entradasNovas && validarArquivoEntradas(entradasNovas, { servicoId, fontes: fontes.fontes }).length > 0) return falha('entrada_invalida');
  return { ok: true, fontes, conteudoAssistente, ...(entradasNovas ? { entradas: entradasNovas } : {}), blocosReabertos: titulos };
}

/** Campos do serviço que se apoiam em fontes (referencias.<campo>), com o rótulo em linguagem comum e o valor "pendente". */
const CAMPOS_DO_SERVICO = Object.freeze({
  descricao: { rotulo: 'Descrição do serviço', vazio: () => 'PENDENTE', tem: (v) => typeof v === 'string' && v.trim() !== '' && v !== 'PENDENTE' },
  publico: { rotulo: 'Quem pode solicitar', vazio: () => 'PENDENTE', tem: (v) => typeof v === 'string' && v.trim() !== '' && v !== 'PENDENTE' },
  condicoes: { rotulo: 'Condições', vazio: () => [], tem: (v) => Array.isArray(v) && v.length > 0 },
  etapas: { rotulo: 'Etapas', vazio: () => [], tem: (v) => Array.isArray(v) && v.length > 0 },
  sistemaInicio: { rotulo: 'Onde iniciar', vazio: () => ({ nome: 'PENDENTE', url: null }), tem: (v) => ehObjeto(v) && v.nome !== 'PENDENTE' },
  canalAtendimento: { rotulo: 'Canal de atendimento', vazio: () => ({ nome: 'PENDENTE', url: null }), tem: (v) => ehObjeto(v) && v.nome !== 'PENDENTE' },
});

const fonteValida = (fontesPorId, id, excluida) => {
  const f = fontesPorId.get(id);
  return ehObjeto(f) && id !== excluida && !fonteIndisponivel(f);
};

/**
 * Plano da exclusão (PURO, só leitura do que existe): quem é afetado e como. É a ÚNICA fonte do que a tela mostra antes de confirmar e
 * do que a exclusão faz. Retorna { ok: true, plano } com:
 *   informacoes: [{ titulo, desfecho: 'continua' | 'volta_para_elaboracao' | 'sai_do_conteudo_ativo' }] (blocos de conhecimento),
 *   conteudoAntigo: { blocosDeTeste, documentos, perguntas, camposDoServico: [rótulos] },
 * ou { ok: false, erro }.
 */
export function planoDaExclusao(arquivos, fonteId) {
  if (!idValido(fonteId)) return falha('dados_invalidos');
  const lista = listaDe(arquivos.fontes, 'fontes');
  const alvo = lista.find((f) => f.id === fonteId);
  if (!alvo || fonteExcluida(alvo)) return falha('fonte_nao_encontrada');
  const fontesPorId = new Map(lista.map((f) => [f.id, f]));
  const informacoes = [];
  let blocosDeTeste = 0;
  const blocos = listaDe(arquivos.conteudoAssistente, 'blocos');
  const novosBlocos = [];
  for (const b of blocos) {
    if (!Array.isArray(b.fonteIds) || !b.fonteIds.includes(fonteId)) { novosBlocos.push(b); continue; }
    const restantes = b.fonteIds.filter((id) => id !== fonteId);
    const temOutra = restantes.some((id) => fonteValida(fontesPorId, id, fonteId));
    const conhecimento = b.tipo === 'conhecimento';
    if (!temOutra) {
      if (conhecimento) informacoes.push({ titulo: b.titulo, desfecho: 'sai_do_conteudo_ativo' }); else blocosDeTeste += 1;
      continue; // o bloco sai do conteúdo ativo
    }
    const aceito = conhecimento && b.statusValidacao === 'validado';
    if (conhecimento) informacoes.push({ titulo: b.titulo, desfecho: aceito ? 'volta_para_elaboracao' : 'continua' });
    else blocosDeTeste += 1;
    const novo = { ...b, fonteIds: restantes };
    if (Array.isArray(b.referencias)) novo.referencias = b.referencias.filter((r) => !(ehObjeto(r) && r.fonteId === fonteId));
    novosBlocos.push({ bloco: novo, reabrir: aceito });
  }
  const s = ehObjeto(arquivos.service) ? arquivos.service : {};
  const refs = ehObjeto(s.referencias) ? s.referencias : {};
  const camposDoServico = [];
  if (s.statusValidacao !== 'rascunho') {
    for (const [campo, def] of Object.entries(CAMPOS_DO_SERVICO)) {
      const ids = Array.isArray(refs[campo]) ? refs[campo] : [];
      if (!ids.includes(fonteId)) continue;
      const sobram = ids.filter((id) => fonteValida(fontesPorId, id, fonteId));
      if (sobram.length === 0 && def.tem(s[campo])) camposDoServico.push(def.rotulo);
    }
  }
  const normas = limparNormasRelacionadas(lista, [fonteId]).alteradas;
  const roteiro = typeof arquivos.roteiro === 'string' ? retirarFonteDoRoteiro(arquivos.roteiro, fonteId) : { mudou: false, secoesPendentes: [] };
  const documentos = listaDe(arquivos.documentos, 'documentos').filter((d) => d.fonteId === fonteId).length;
  const perguntas = listaDe(arquivos.perguntasFrequentes, 'perguntas').filter((p) => p.fonteId === fonteId).length;
  return { ok: true, plano: { informacoes, conteudoAntigo: { blocosDeTeste, documentos, perguntas, camposDoServico, normasRelacionadas: normas, secoesDoRoteiro: roteiro.secoesPendentes } }, _novosBlocos: novosBlocos, _alvo: alvo };
}

/**
 * Retira o id das fontes excluídas de `vigencia.normasRelacionadas` das OUTRAS fontes (cópia nova). Uma norma revogada que ficar sem
 * nenhuma norma relacionada passa a "a_confirmar" (o validador exige ao menos uma norma para marcar revogada).
 */
export function limparNormasRelacionadas(fontes, idsExcluidos) {
  const ids = new Set(idsExcluidos);
  let alteradas = 0;
  const lista = fontes.map((f) => {
    if (!ehObjeto(f) || !ehObjeto(f.vigencia) || !Array.isArray(f.vigencia.normasRelacionadas)) return f;
    const restantes = f.vigencia.normasRelacionadas.filter((id) => !ids.has(id));
    if (restantes.length === f.vigencia.normasRelacionadas.length) return f;
    alteradas += 1;
    const vigencia = { ...f.vigencia, normasRelacionadas: restantes };
    if (vigencia.situacao === 'revogada' && restantes.length === 0) vigencia.situacao = 'a_confirmar';
    return { ...f, vigencia };
  });
  return { fontes: lista, alteradas };
}

const PADRAO_LINHA_FONTES = /^(Fontes?:)\s*(`[^`]+`(?:\s*,\s*`[^`]+`)*)\s*\.?\s*$/i;

/**
 * Retira a fonte do roteiro.md (cópia nova): tira o id das linhas "Fontes:"; seção com conteúdo que ficar sem nenhuma fonte volta a
 * PENDENTE (o validador exige fonte por id em toda seção preenchida). Preserva o tipo de quebra de linha. Retorna
 * { texto, mudou, secoesPendentes: [nomes] }.
 */
export function retirarFonteDoRoteiro(texto, fonteId) {
  const eol = texto.includes('\r\n') ? '\r\n' : '\n';
  const marca = `\`${fonteId}\``;
  if (typeof texto !== 'string' || !texto.includes(marca)) return { texto, mudou: false, secoesPendentes: [] };
  const linhas = texto.split(/\r?\n/);
  const saida = [];
  const secoesPendentes = [];
  let i = 0;
  while (i < linhas.length) {
    const cab = /^##\s+(.+?)\s*$/.exec(linhas[i]);
    if (!cab) { saida.push(linhas[i]); i += 1; continue; }
    const nome = cab[1];
    const corpo = [];
    let j = i + 1;
    while (j < linhas.length && !/^##\s+/.test(linhas[j])) { corpo.push(linhas[j]); j += 1; }
    const afeta = corpo.some((l) => l.includes(marca));
    if (!afeta) { saida.push(linhas[i], ...corpo); i = j; continue; }
    // reescreve só as linhas de fontes da seção
    const novoCorpo = [];
    for (const l of corpo) {
      if (!l.includes(marca)) { novoCorpo.push(l); continue; }
      const m = PADRAO_LINHA_FONTES.exec(l.trim());
      if (m) {
        const ids = [...m[2].matchAll(/`([^`]+)`/g)].map((x) => x[1]).filter((id) => id !== fonteId);
        if (ids.length > 0) novoCorpo.push(`${m[1]} ${ids.map((id) => `\`${id}\``).join(', ')}.`);
        continue; // sem outras fontes: a linha sai
      }
      const sem = l.split(marca).join('').replace(/\s*,\s*(?=[,.])/g, '').replace(/,\s*$/, '').trimEnd();
      if (/`[^`]+`/.test(sem)) novoCorpo.push(sem);
    }
    const conteudo = novoCorpo.filter((l) => l.trim() !== '');
    const temFonte = conteudo.some((l) => /^Fontes?:/i.test(l.trim()) && /`[^`]+`/.test(l));
    const ehListaDeFontes = nome === 'Fontes';
    if (conteudo.length === 0 || (!ehListaDeFontes && !temFonte)) {
      saida.push(linhas[i], '', 'PENDENTE', '');
      secoesPendentes.push(nome);
    } else {
      saida.push(linhas[i], ...novoCorpo);
    }
    i = j;
  }
  return { texto: saida.join(eol), mudou: true, secoesPendentes };
}

/** Versão para a tela (sem os campos internos). */
export function impactoDaExclusao(arquivos, fonteId) {
  const r = planoDaExclusao(arquivos, fonteId);
  return r.ok ? { ok: true, impacto: r.plano } : r;
}

/**
 * Exclusão lógica em cascata (PURA). Retorna { ok: true, fontes, conteudoAssistente, service?, documentos?, perguntasFrequentes?,
 * blocosReabertos } com SÓ os arquivos que mudaram, ou { ok: false, erro }. Nada é recusado por causa de referências.
 */
export function excluirFonte(arquivos, fonteId, data) {
  if (!dataIsoValida(data)) return falha('dados_invalidos');
  const p = planoDaExclusao(arquivos, fonteId);
  if (!p.ok) return p;
  const fontesPorIdAntes = new Map(listaDe(arquivos.fontes, 'fontes').map((f) => [f.id, f]));

  // 1) a própria fonte (e, se for texto, a entrada original, que NÃO é apagada: fica só como registro desta versão)
  const fontes = structuredClone(arquivos.fontes);
  fontes.fontes = limparNormasRelacionadas(fontes.fontes, [fonteId]).fontes
    .map((f) => (ehObjeto(f) && f.id === fonteId ? { ...f, excluidaEm: data, publicado: false } : f));

  // 2) informações (blocos)
  const conteudoAssistente = structuredClone(arquivos.conteudoAssistente);
  let blocosReabertos = 0;
  conteudoAssistente.blocos = p._novosBlocos.map((x) => {
    if (!x || !x.bloco) return x;
    if (!x.reabrir) return x.bloco;
    blocosReabertos += 1;
    const b = x.bloco;
    const atualizadoEm = dataIsoValida(b.criadoEm) && data < b.criadoEm ? b.criadoEm : data;
    return { ...b, statusValidacao: 'rascunho', revisaoAtualidade: 'pendente', publicado: false, atualizadoEm };
  });

  const resultado = { ok: true, fontes, conteudoAssistente, blocosReabertos };

  // 3) service.json: links, normas e referências; campos que ficarem sem fonte voltam a pendentes
  const sOriginal = ehObjeto(arquivos.service) ? arquivos.service : {};
  const service = structuredClone(sOriginal);
  let mudouServico = false;
  for (const chave of ['links', 'legislacao']) {
    if (Array.isArray(service[chave]) && service[chave].includes(fonteId)) { service[chave] = service[chave].filter((id) => id !== fonteId); mudouServico = true; }
  }
  if (ehObjeto(service.referencias)) {
    for (const campo of Object.keys(service.referencias)) {
      const ids = service.referencias[campo];
      if (!Array.isArray(ids) || !ids.includes(fonteId)) continue;
      mudouServico = true;
      const restantes = ids.filter((id) => id !== fonteId);
      const sobram = restantes.filter((id) => fonteValida(fontesPorIdAntes, id, fonteId));
      if (restantes.length === 0 || sobram.length === 0) delete service.referencias[campo]; else service.referencias[campo] = restantes;
      const def = CAMPOS_DO_SERVICO[campo];
      if (def && sobram.length === 0 && service.statusValidacao !== 'rascunho' && def.tem(service[campo])) service[campo] = def.vazio();
    }
  }
  if (mudouServico) resultado.service = service;

  // 4) documentos e perguntas antigos que citam a fonte saem do conteúdo ativo
  const doc = ehObjeto(arquivos.documentos) ? arquivos.documentos : null;
  if (doc && Array.isArray(doc.documentos) && doc.documentos.some((d) => ehObjeto(d) && d.fonteId === fonteId)) {
    resultado.documentos = { ...structuredClone(doc), documentos: doc.documentos.filter((d) => !(ehObjeto(d) && d.fonteId === fonteId)) };
  }
  const per = ehObjeto(arquivos.perguntasFrequentes) ? arquivos.perguntasFrequentes : null;
  if (per && Array.isArray(per.perguntas) && per.perguntas.some((q) => ehObjeto(q) && q.fonteId === fonteId)) {
    resultado.perguntasFrequentes = { ...structuredClone(per), perguntas: per.perguntas.filter((q) => !(ehObjeto(q) && q.fonteId === fonteId)) };
  }
  // 5) roteiro.md: retira a fonte das linhas "Fontes:" (seção que ficar sem fonte volta a PENDENTE)
  if (typeof arquivos.roteiro === 'string') {
    const r = retirarFonteDoRoteiro(arquivos.roteiro, fonteId);
    if (r.mudou) resultado.roteiro = r.texto;
  }
  return resultado;
}
