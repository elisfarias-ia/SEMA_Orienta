// Importação de conteúdo existente (Sprint 5, Passo 5B3c). Funções PURAS: só LEEM o conteúdo antigo da versão (service.json,
// documentos, perguntas e blocos antigos, fontes) e montam candidatos a "informação" em elaboração. Nada é gravado aqui e nada recebido
// é modificado. O conteúdo antigo nunca é alterado: a importação só acrescenta um bloco de conhecimento em elaboração.
//
// Candidato = item antigo com conteúdo suficiente e fonte ativa (não excluída, não revogada). Não são candidatos: bloco de teste ou
// regra institucional sem fonte, conteúdo vazio, pergunta sem resposta, conteúdo já importado, fonte excluída ou revogada e texto marcado
// como teste local. A importação é de UM item por vez: o candidato apenas preenche o formulário; a gravação passa pelas mesmas regras
// do cadastro de informação (fonte ativa obrigatória, em elaboração, sem aceitar, revisar nem publicar).
//
// A origem fica no próprio bloco (`origemImportacao: { tipo, referencia }`), só para evitar duplicação; a referência é estável
// (id do item de origem) e nunca é exibida.

import { montarBlocoConhecimento, validarEntradaConhecimento } from './conhecimento.js';
import { fonteIndisponivel } from './edicao-fonte.js';

export const TIPOS_CANDIDATO = Object.freeze(['descricao', 'etapas', 'link', 'norma', 'bloco', 'documento', 'pergunta']);
export const CAMPOS_CORPO_IMPORTACAO = Object.freeze(['revisao', 'ref', 'titulo', 'texto', 'fonteIds', 'referencias', 'alertas']);

const PADRAO_REVISAO = /^[0-9a-f]{64}$/;
const PADRAO_REF = /^[a-z]+(:[a-z][a-z0-9-]*)?$/;
const MARCA_DE_TESTE = /teste[ _-]?local/i;
const LIMITE_LOCALIZACAO = 200;
const LIMITE_ALERTA = 300;
const LIMITE_ALERTAS = 10;

const ehObjeto = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const lista = (v) => (Array.isArray(v) ? v : []);
const preenchido = (v) => typeof v === 'string' && v.trim() !== '';
const falha = (erro, extra = {}) => ({ ok: false, erro, ...extra });

/** Confere o corpo do POST. Retorna { ok: true, dados: { revisao, ref, entrada } } ou { ok: false, campos } (só nomes de campos). */
export function validarCorpoImportacao(corpo) {
  if (!ehObjeto(corpo)) return { ok: false, campos: ['corpo'] };
  const campos = [];
  if (Object.keys(corpo).some((k) => !CAMPOS_CORPO_IMPORTACAO.includes(k))) campos.push('extras');
  if (typeof corpo.revisao !== 'string' || !PADRAO_REVISAO.test(corpo.revisao)) campos.push('revisao');
  if (typeof corpo.ref !== 'string' || corpo.ref.length > 130 || !PADRAO_REF.test(corpo.ref)) campos.push('ref');
  if (campos.length) return { ok: false, campos };
  const { revisao, ref, ...entrada } = corpo;
  return { ok: true, dados: { revisao, ref, entrada } };
}

const ativa = (f) => ehObjeto(f) && !fonteIndisponivel(f);

/** Referências já importadas (qualquer informação com origemImportacao), qualquer que seja a situação dela. */
function referenciasImportadas(conteudoAssistente) {
  const usadas = new Set();
  for (const b of lista(conteudoAssistente?.blocos)) {
    if (ehObjeto(b) && b.tipo === 'conhecimento' && ehObjeto(b.origemImportacao) && typeof b.origemImportacao.referencia === 'string') usadas.add(b.origemImportacao.referencia);
  }
  return usadas;
}

/**
 * Candidatos da versão (ordem fixa: descrição, etapas, normas, links, blocos antigos, documentos, perguntas).
 * `arquivos`: { service, documentos, perguntasFrequentes, fontes, conteudoAssistente }. Cada candidato:
 * { ref, tipo, titulo, texto, fonteIds, referencias: [{ fonteId, localizacao }], alertas }. Fontes sugeridas só se ativas.
 */
export function listarCandidatos(arquivos) {
  const fontes = lista(arquivos?.fontes?.fontes).filter(ehObjeto);
  const porId = new Map(fontes.map((f) => [f.id, f]));
  const principal = fontes.find(ativa);
  if (principal === undefined) return [];
  const importadas = referenciasImportadas(arquivos.conteudoAssistente);
  const service = ehObjeto(arquivos.service) ? arquivos.service : {};
  const saida = [];

  const aceitavel = (c) => {
    if (importadas.has(c.ref) || MARCA_DE_TESTE.test(c.titulo) || MARCA_DE_TESTE.test(c.texto)) return false;
    const modelo = { titulo: c.titulo, texto: c.texto, fonteIds: [principal.id], referencias: [{ fonteId: principal.id, localizacao: 'x' }] };
    return validarEntradaConhecimento(modelo, fontes).ok;
  };
  const alertasValidos = (itens) => {
    const t = lista(itens).filter(preenchido).map((a) => a.trim());
    return t.length <= LIMITE_ALERTAS && t.every((a) => a.length <= LIMITE_ALERTA) ? t : [];
  };
  const acrescentar = (ref, tipo, titulo, texto, sugestoes, alertas = [], exigeFonte = true) => {
    if (!preenchido(titulo) || !preenchido(texto)) return;
    const referencias = [];
    for (const s of sugestoes) {
      if (ativa(porId.get(s.fonteId)) && !referencias.some((r) => r.fonteId === s.fonteId)) {
        referencias.push({ fonteId: s.fonteId, localizacao: preenchido(s.localizacao) && s.localizacao.trim().length <= LIMITE_LOCALIZACAO ? s.localizacao.trim() : '' });
      }
    }
    // Documento, pergunta, bloco antigo, link e norma só valem com fonte ativa; descrição e etapas deixam a escolha da fonte para a pessoa.
    if (exigeFonte && referencias.length === 0) return;
    const candidato = { ref, tipo, titulo: titulo.trim(), texto: texto.trim(), fonteIds: referencias.map((r) => r.fonteId), referencias, alertas: alertasValidos(alertas) };
    if (aceitavel(candidato)) saida.push(candidato);
  };
  const sugeridasDe = (campo) => lista(service.referencias?.[campo]).filter((i) => typeof i === 'string').map((fonteId) => ({ fonteId, localizacao: '' }));
  const idsDeLista = (v) => lista(v).map((i) => (typeof i === 'string' ? i : ehObjeto(i) ? (i.fonteId ?? i.id) : null)).filter((i) => typeof i === 'string');

  // 1. Descrição e 2. etapas do serviço (service.json).
  if (preenchido(service.descricao)) acrescentar('descricao', 'descricao', 'Descrição do serviço', service.descricao, sugeridasDe('descricao'), [], false);
  const etapas = lista(service.etapas).filter(preenchido).map((e) => e.trim());
  if (etapas.length > 0) acrescentar('etapas', 'etapas', 'Etapas do serviço', etapas.map((e, i) => `${i + 1}. ${e}`).join('\n'), sugeridasDe('etapas'), [], false);

  // 3. Normas (legislação) e 4. links: a fonte é o próprio item; formas textuais (texto cadastrado) não entram aqui.
  const vistas = new Set();
  const daFonte = (f, ref, tipo) => {
    if (f.formaEntrada === 'texto' || vistas.has(f.id)) return;
    const base = preenchido(f.descricao) ? f.descricao.trim() : '';
    if (base === '') return;
    const partes = [base];
    if (tipo === 'norma' && preenchido(f.dispositivoRelevante)) partes.push(`Dispositivo relevante: ${f.dispositivoRelevante.trim()}`);
    if (tipo === 'link' && preenchido(f.url)) partes.push(`Endereço: ${f.url.trim()}`);
    const obs = ehObjeto(f.vigencia) && preenchido(f.vigencia.observacao) ? [f.vigencia.observacao] : [];
    vistas.add(f.id);
    acrescentar(ref, tipo, f.titulo, partes.join('\n'), [{ fonteId: f.id, localizacao: tipo === 'norma' ? f.dispositivoRelevante : '' }], obs);
  };
  const idsNormas = new Set([...idsDeLista(service.legislacao), ...fontes.filter((f) => f.tipo === 'legislacao').map((f) => f.id)]);
  for (const id of idsNormas) { const f = porId.get(id); if (ativa(f)) daFonte(f, `norma:${f.id}`, 'norma'); }
  for (const id of idsDeLista(service.links)) { const f = porId.get(id); if (ativa(f)) daFonte(f, `link:${f.id}`, 'link'); }

  // 5. Blocos antigos que possuem fonte (nunca regra institucional, "sem conteúdo" nem bloco sem fonte).
  for (const b of lista(arquivos.conteudoAssistente?.blocos)) {
    if (!ehObjeto(b) || !['descricao', 'sequencia', 'link'].includes(b.tipo) || b.origem !== 'fonte' || !preenchido(b.id)) continue;
    const titulo = b.tipo === 'descricao' ? 'Descrição do serviço (conteúdo anterior)' : b.tipo === 'sequencia' ? 'Etapas do serviço (conteúdo anterior)' : 'Link do serviço (conteúdo anterior)';
    acrescentar(`bloco:${b.id}`, 'bloco', titulo, b.texto, lista(b.fonteIds).filter((i) => typeof i === 'string').map((fonteId) => ({ fonteId, localizacao: '' })), preenchido(b.aviso) ? [b.aviso] : []);
  }

  // 6. Documentos e 7. perguntas com conteúdo e fonte suficientes.
  for (const d of lista(arquivos.documentos?.documentos)) {
    if (!ehObjeto(d) || !preenchido(d.id) || !preenchido(d.nome) || !preenchido(d.descricao) || !preenchido(d.fonteId)) continue;
    const texto = preenchido(d.aplicabilidade) ? `${d.descricao.trim()}\nAplicabilidade: ${d.aplicabilidade.trim()}` : d.descricao;
    acrescentar(`documento:${d.id}`, 'documento', d.nome, texto, [{ fonteId: d.fonteId, localizacao: d.localizacaoFonte }], d.alertas);
  }
  for (const p of lista(arquivos.perguntasFrequentes?.perguntas)) {
    if (!ehObjeto(p) || !preenchido(p.id) || !preenchido(p.pergunta) || !preenchido(p.fonteId)) continue;
    const resposta = preenchido(p.respostaPublicavel) ? p.respostaPublicavel : p.conteudoFonte;
    acrescentar(`pergunta:${p.id}`, 'pergunta', p.pergunta, resposta, [{ fonteId: p.fonteId, localizacao: p.localizacaoFonte }], p.alertas);
  }
  return saida;
}

/**
 * Cria a informação em elaboração a partir do candidato escolhido, com o que a pessoa conferiu (`entrada`). Só acrescenta o bloco
 * ao conteudo-assistente.json; o resto da versão fica intacto. Retorna { ok: true, conteudoAssistente, bloco, candidato } ou
 * { ok: false, erro, campos? } (erros: candidato_nao_encontrado, ja_importado, dados_invalidos, versao_nao_editavel).
 */
export function importarCandidato({ manifesto, arquivos, ref, entrada, id, data }) {
  const importadas = referenciasImportadas(arquivos.conteudoAssistente);
  if (importadas.has(ref)) return falha('ja_importado');
  const candidato = listarCandidatos(arquivos).find((c) => c.ref === ref);
  if (candidato === undefined) return falha('candidato_nao_encontrado');
  const fontes = lista(arquivos.fontes?.fontes);
  const r = montarBlocoConhecimento(manifesto, arquivos.conteudoAssistente, fontes, entrada, { id, data, origemImportacao: { tipo: candidato.tipo, referencia: ref } });
  if (r.ok) return { ok: true, conteudoAssistente: r.conteudo, bloco: r.bloco, candidato };
  if (r.erro === 'versao_nao_editavel') return falha('versao_congelada');
  if (r.erro === 'dados_invalidos') return falha('dados_invalidos', { campos: lista(r.detalhes).filter((c) => typeof c === 'string') });
  return falha('dados_invalidos', { campos: ['corpo'] });
}
