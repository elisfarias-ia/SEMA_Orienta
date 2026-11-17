// Conteúdo PÚBLICO de um serviço publicado (Sprint 5, Passo 5C). Módulo puro e autocontido: não importa nada de services/admin
// (o build e o assistente podem importá-lo). Só `node:fs` e `node:crypto`; sem variáveis de ambiente, rede nem relógio.
//
// ARQUIVO PÚBLICO (imutável, criado só pela publicação):
//
//   services/<serviço>/publico/conteudo-<hash16>.json
//
//   <hash16> = os 16 primeiros caracteres do hash canônico (SHA-256) da VERSÃO publicada (o `hashConteudo` do manifesto).
//   O nome liga o arquivo à versão publicada; o campo `integridade` (SHA-256 do corpo, sem ele mesmo) detecta adulteração.
//   Arquivos de versões publicadas anteriores continuam no disco; só o da versão apontada por `versaoPublicadaId` é servido.
//
// FORMATO (esquema fechado; qualquer outro campo é recusado):
//
//   {
//     "formato": 1,
//     "servico": { "nome": "..." },
//     "tema": { "nome": "..." },
//     "informacoes": [ { "titulo": "...", "texto": "...", "tipo": "texto" | "link", "links": [ { "url": "https://..." } ], "alertas": [ "..." ] } ],
//     "integridade": "<sha-256 do corpo>"
//   }
//
// REGRA DE RESPOSTA: informação derivada de TEXTO cadastrado não mostra fonte (tipo "texto", links vazio); informação derivada de
// LINK mostra só o link (tipo "link", apenas a URL). Nunca título técnico da fonte, ids, texto original, rascunhos, rejeitadas,
// fontes excluídas ou não usadas, histórico, decisões internas, token nem caminhos.
//
// `lerConteudoPublicado` falha de forma SEGURA: devolve `null` se qualquer conferência divergir.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const FORMATO_PUBLICO = 1;
export const PASTA_PUBLICA = 'publico';
export const PADRAO_ARQUIVO_PUBLICO = /^conteudo-([0-9a-f]{16})\.json$/;
export const LIMITES_PUBLICOS = Object.freeze({ nome: 200, titulo: 200, texto: 2000, alerta: 300, alertas: 10, links: 10, url: 2000, informacoes: 500 });

const PADRAO_ID = /^[a-z][a-z0-9-]*$/;
const PADRAO_HASH = /^[0-9a-f]{64}$/;
const CONTROLE = /[\u0000-\u0008\u000b-\u001f\u007f]/;
const TAMANHO_MAXIMO_ARQUIVO = 5 * 1024 * 1024;
const ehObjeto = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const chavesIguais = (obj, esperadas) => ehObjeto(obj) && Object.keys(obj).length === esperadas.length && esperadas.every((k) => Object.hasOwn(obj, k));

function canonico(v) {
  if (v === null || typeof v === 'string' || typeof v === 'boolean') return JSON.stringify(v);
  if (typeof v === 'number') return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(canonico).join(',')}]`;
  if (ehObjeto(v)) return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonico(v[k])}`).join(',')}}`;
  throw new TypeError('valor que não é JSON');
}
const sha256 = (texto) => crypto.createHash('sha256').update(texto, 'utf8').digest('hex');

/** Nome do arquivo público de uma versão, a partir do hash canônico dela (64 hexadecimais). Retorna null se o hash for inválido. */
export function nomeDoArquivoPublico(hashDaVersao) {
  return typeof hashDaVersao === 'string' && PADRAO_HASH.test(hashDaVersao) ? `conteudo-${hashDaVersao.slice(0, 16)}.json` : null;
}

/** Caminho relativo do arquivo público (null se serviço ou hash forem inválidos). */
export function caminhoDoConteudoPublico(servicoId, hashDaVersao) {
  const nome = nomeDoArquivoPublico(hashDaVersao);
  return nome !== null && typeof servicoId === 'string' && PADRAO_ID.test(servicoId) ? `services/${servicoId}/${PASTA_PUBLICA}/${nome}` : null;
}

const fonteIndisponivel = (f) => !ehObjeto(f) || f.excluidaEm != null || (ehObjeto(f.vigencia) && f.vigencia.situacao === 'revogada');
const fonteAtiva = (f) => !fonteIndisponivel(f) && f.statusValidacao === 'validado';

function urlOficial(valor) {
  if (typeof valor !== 'string' || valor.length === 0 || valor.length > LIMITES_PUBLICOS.url || CONTROLE.test(valor) || /\s/.test(valor)) return null;
  try {
    const u = new URL(valor);
    return u.protocol === 'https:' && u.hostname !== '' && u.username === '' && u.password === '' ? valor : null;
  } catch {
    return null;
  }
}

/** Hash de integridade do corpo (o objeto sem o campo `integridade`). */
export const integridadeDoCorpo = (corpo) => sha256(canonico(corpo));

/**
 * PURA. Gera o conteúdo público a partir dos arquivos da versão ({ service, fontes, conteudoAssistente }) e do nome do tema.
 * Só entram informações ACEITAS (bloco de conhecimento validado, revisão concluída) cujas fontes estão todas ativas (não excluídas,
 * validadas e não revogadas). Retorna { ok: true, conteudo } ou { ok: false, erro } (sem_informacao_aceita, dados_invalidos).
 */
export function gerarConteudoPublico(arquivos, { temaNome } = {}) {
  if (!ehObjeto(arquivos) || !ehObjeto(arquivos.service) || !ehObjeto(arquivos.fontes) || !ehObjeto(arquivos.conteudoAssistente)) return { ok: false, erro: 'dados_invalidos' };
  const nome = arquivos.service.nome;
  if (typeof nome !== 'string' || nome.trim() === '' || typeof temaNome !== 'string' || temaNome.trim() === '') return { ok: false, erro: 'dados_invalidos' };
  const fontes = new Map((Array.isArray(arquivos.fontes.fontes) ? arquivos.fontes.fontes : []).filter(ehObjeto).map((f) => [f.id, f]));
  const blocos = Array.isArray(arquivos.conteudoAssistente.blocos) ? arquivos.conteudoAssistente.blocos : [];
  const informacoes = [];
  for (const b of blocos) {
    if (!ehObjeto(b) || b.tipo !== 'conhecimento' || b.statusValidacao !== 'validado' || b.revisaoAtualidade !== 'concluida') continue;
    const ids = Array.isArray(b.fonteIds) ? b.fonteIds : [];
    if (ids.length === 0) continue;
    const usadas = ids.map((id) => fontes.get(id));
    if (!usadas.every(fonteAtiva)) continue;
    const links = [];
    let linkInvalido = false;
    for (const f of usadas) {
      if (f.formaEntrada === 'texto') continue; // texto cadastrado: não mostra fonte
      const url = urlOficial(f.url);
      if (url === null) linkInvalido = true;
      else if (!links.some((l) => l.url === url)) links.push({ url });
    }
    if (linkInvalido) continue;
    informacoes.push({
      titulo: b.titulo,
      texto: b.texto,
      tipo: links.length > 0 ? 'link' : 'texto',
      links,
      alertas: Array.isArray(b.alertas) ? [...b.alertas] : [],
    });
  }
  if (informacoes.length === 0) return { ok: false, erro: 'sem_informacao_aceita' };
  const corpo = { formato: FORMATO_PUBLICO, servico: { nome }, tema: { nome: temaNome }, informacoes };
  const conteudo = { ...corpo, integridade: integridadeDoCorpo(corpo) };
  return validarConteudoPublico(conteudo).length === 0 ? { ok: true, conteudo } : { ok: false, erro: 'dados_invalidos' };
}

const texto = (v, limite) => typeof v === 'string' && v.trim() !== '' && v.length <= limite && !CONTROLE.test(v.replace(/[\n\t]/g, ''));

/** Esquema FECHADO do conteúdo público. Lista de erros (vazia = válido); nunca repete valores nas mensagens. */
export function validarConteudoPublico(obj) {
  if (!ehObjeto(obj)) return ['conteúdo público deve ser um objeto'];
  const erros = [];
  for (const k of Object.keys(obj)) if (!['formato', 'servico', 'tema', 'informacoes', 'integridade'].includes(k)) erros.push(`campo não previsto: ${k}`);
  for (const k of ['formato', 'servico', 'tema', 'informacoes', 'integridade']) if (!(k in obj)) erros.push(`campo obrigatório ausente: ${k}`);
  if (erros.length) return erros;
  if (obj.formato !== FORMATO_PUBLICO) erros.push('formato inválido');
  for (const k of ['servico', 'tema']) {
    if (!chavesIguais(obj[k], ['nome'])) erros.push(`${k}: deve ter somente "nome"`);
    else if (!texto(obj[k].nome, LIMITES_PUBLICOS.nome)) erros.push(`${k}.nome inválido`);
  }
  if (!Array.isArray(obj.informacoes) || obj.informacoes.length < 1 || obj.informacoes.length > LIMITES_PUBLICOS.informacoes) {
    erros.push('informacoes deve ser uma lista não vazia');
  } else {
    obj.informacoes.forEach((i, n) => {
      const ref = `informacoes[${n}]`;
      if (!chavesIguais(i, ['titulo', 'texto', 'tipo', 'links', 'alertas'])) {
        erros.push(`${ref}: campos devem ser exatamente titulo, texto, tipo, links e alertas`);
        return;
      }
      if (!texto(i.titulo, LIMITES_PUBLICOS.titulo)) erros.push(`${ref}.titulo inválido`);
      if (!texto(i.texto, LIMITES_PUBLICOS.texto)) erros.push(`${ref}.texto inválido`);
      if (!Array.isArray(i.links) || i.links.length > LIMITES_PUBLICOS.links) {
        erros.push(`${ref}.links inválido`);
      } else {
        i.links.forEach((l, m) => {
          if (!chavesIguais(l, ['url']) || urlOficial(l.url) === null) erros.push(`${ref}.links[${m}] inválido`);
        });
        if (i.tipo !== (i.links.length > 0 ? 'link' : 'texto')) erros.push(`${ref}.tipo incoerente com os links`);
      }
      if (i.tipo !== 'texto' && i.tipo !== 'link') erros.push(`${ref}.tipo inválido`);
      if (!Array.isArray(i.alertas) || i.alertas.length > LIMITES_PUBLICOS.alertas || !i.alertas.every((a) => texto(a, LIMITES_PUBLICOS.alerta))) erros.push(`${ref}.alertas inválido`);
    });
  }
  if (typeof obj.integridade !== 'string' || !PADRAO_HASH.test(obj.integridade)) erros.push('integridade inválida');
  if (erros.length === 0) {
    const { integridade, ...corpo } = obj;
    if (integridadeDoCorpo(corpo) !== integridade) erros.push('integridade não confere com o conteúdo');
  }
  return erros;
}

function lerJsonSeguro(sistema, raiz, relativo) {
  const absoluto = path.join(raiz, ...relativo.split('/'));
  const st = sistema.lstatSync(absoluto);
  if (!st.isFile() || st.size > TAMANHO_MAXIMO_ARQUIVO) throw new Error('arquivo');
  return JSON.parse(sistema.readFileSync(absoluto, 'utf8'));
}

/** Pasta da versão (`services/<id>/versoes/v<N>`) a partir do id da versão; null se inválido. */
function pastaDaVersaoPublicada(servicoId, versaoId) {
  if (typeof versaoId !== 'string' || !PADRAO_ID.test(versaoId)) return null;
  const m = new RegExp(`^${servicoId}-v([1-9][0-9]*)$`).exec(versaoId);
  return m ? `services/${servicoId}/versoes/v${m[1]}` : null;
}

/**
 * Lê o conteúdo público ATUALMENTE publicado do serviço: registro (`versaoPublicadaId`) -> manifesto em estado `publicado` ->
 * arquivo `conteudo-<hash16>.json` cujo nome vem do hash do manifesto -> esquema fechado e integridade -> o mesmo conteúdo é
 * regenerado a partir dos arquivos da versão e precisa ser idêntico. Retorna o conteúdo (objeto) ou `null` se QUALQUER
 * conferência falhar (falha segura: nada é inventado nem parcialmente entregue).
 */
export function lerConteudoPublicado(raiz, servicoId, { sistema = fs } = {}) {
  try {
    if (typeof raiz !== 'string' || typeof servicoId !== 'string' || !PADRAO_ID.test(servicoId)) return null;
    const registro = lerJsonSeguro(sistema, raiz, 'services/registry.json');
    const entrada = Array.isArray(registro.servicos) ? registro.servicos.find((s) => ehObjeto(s) && s.id === servicoId) : null;
    if (!entrada || entrada.publicado !== true || typeof entrada.versaoPublicadaId !== 'string') return null;
    const pasta = pastaDaVersaoPublicada(servicoId, entrada.versaoPublicadaId);
    if (pasta === null) return null;
    const manifesto = lerJsonSeguro(sistema, raiz, `${pasta}/versao.json`);
    if (manifesto.id !== entrada.versaoPublicadaId || manifesto.servicoId !== servicoId || manifesto.estado !== 'publicado') return null;
    const caminho = caminhoDoConteudoPublico(servicoId, manifesto.hashConteudo);
    if (caminho === null) return null;
    const obj = lerJsonSeguro(sistema, raiz, caminho);
    if (validarConteudoPublico(obj).length > 0) return null;
    const gerado = gerarConteudoPublico({
      service: lerJsonSeguro(sistema, raiz, `${pasta}/service.json`),
      fontes: lerJsonSeguro(sistema, raiz, `${pasta}/fontes.json`),
      conteudoAssistente: lerJsonSeguro(sistema, raiz, `${pasta}/conteudo-assistente.json`),
    }, { temaNome: obj.tema.nome });
    if (!gerado.ok || canonico(gerado.conteudo) !== canonico(obj)) return null;
    return obj;
  } catch {
    return null;
  }
}
