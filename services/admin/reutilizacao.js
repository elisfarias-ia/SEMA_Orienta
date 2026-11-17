// Reutilização de links entre serviços (Sprint 4, Passo 4B1): busca SOMENTE LEITURA e criação PURA da cópia em rascunho.
// Só links são reutilizáveis (fonte textual nunca). A cópia é uma fonte NOVA no serviço de destino: id novo, URL preservada,
// só metadados estáveis, sem validação, publicação, consulta ou vigência herdadas, com a linhagem em `reutilizadaDe`.
// Nada aqui grava arquivo nem altera o serviço de origem ou os objetos recebidos.

import fs from 'node:fs';
import path from 'node:path';
import { gerarId, normalizarNome, urlNormalizada } from './cadastro.js';
import { conteudoEditavel } from './fluxo.js';
import { localizarVersaoAtual } from '../versao-atual.js';
import { validarFontes } from '../../scripts/validate-services.js';

export const CAMPOS_REUTILIZADA_DE = Object.freeze(['servicoId', 'versaoId', 'fonteId']);
const LIMITE_RESULTADOS = 50;

const ehObjeto = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/** Link (formaEntrada "link" ou ausente), validado, não revogado e com URL válida: o que pode ser reutilizado. Não exige publicação. */
export function fonteReutilizavel(fonte) {
  if (!ehObjeto(fonte)) return false;
  const forma = 'formaEntrada' in fonte ? fonte.formaEntrada : 'link';
  if (forma !== 'link' || fonte.tipo === 'texto_cadastrado' || 'entradaId' in fonte) return false;
  if (fonte.statusValidacao !== 'validado') return false;
  if (ehObjeto(fonte.vigencia) && fonte.vigencia.situacao === 'revogada') return false;
  if (fonte.excluidaEm != null) return false; // fonte excluída logicamente não é reutilizável
  return urlNormalizada(fonte.url) !== null;
}

/**
 * Busca links reutilizáveis nas VERSÕES ATUAIS dos outros serviços (registro -> versão atual -> fontes.json). Somente leitura.
 *   raiz              raiz do projeto (ou cópia temporária);
 *   servicoDestinoId  serviço que receberá o link (nunca aparece como origem);
 *   consulta          texto opcional, comparado sem acento e sem maiúsculas com título, descrição, órgão e URL.
 * Retorna { ok: true, itens, truncado } ou { ok: false, erro }. Cada item traz só metadados estáveis e a origem
 * (servicoId, versaoId, fonteId); `jaNoServico` indica que o destino já tem a mesma URL.
 */
export function buscarLinksReutilizaveis(raiz, servicoDestinoId, consulta = '') {
  const destino = localizarVersaoAtual(raiz, servicoDestinoId);
  if (!destino.ok) return { ok: false, erro: 'servico_destino_indisponivel' };
  let registro;
  let fontesDestino;
  try {
    registro = JSON.parse(fs.readFileSync(path.join(raiz, 'services', 'registry.json'), 'utf8'));
    fontesDestino = JSON.parse(fs.readFileSync(path.join(raiz, ...destino.arquivos.fontes.split('/')), 'utf8'));
  } catch {
    return { ok: false, erro: 'base_indisponivel' };
  }
  if (!Array.isArray(registro.servicos) || !Array.isArray(fontesDestino.fontes)) return { ok: false, erro: 'base_indisponivel' };
  const urlsDestino = new Set(fontesDestino.fontes.map((f) => (ehObjeto(f) ? urlNormalizada(f.url) : null)).filter(Boolean));
  const termo = normalizarNome(consulta);

  const itens = [];
  for (const entrada of registro.servicos) {
    if (!ehObjeto(entrada) || entrada.id === servicoDestinoId) continue;
    const v = localizarVersaoAtual(raiz, entrada.id);
    if (!v.ok) continue;
    let doc;
    try {
      doc = JSON.parse(fs.readFileSync(path.join(raiz, ...v.arquivos.fontes.split('/')), 'utf8'));
    } catch {
      continue;
    }
    if (!ehObjeto(doc) || !Array.isArray(doc.fontes)) continue;
    for (const f of doc.fontes) {
      if (!fonteReutilizavel(f)) continue;
      const item = {
        servicoId: v.servicoId,
        versaoId: v.versaoId,
        fonteId: f.id,
        titulo: f.titulo,
        tipo: f.tipo,
        orgaoResponsavel: f.orgaoResponsavel,
        url: f.url,
        descricao: f.descricao,
        origemOficial: f.origemOficial,
        jaNoServico: urlsDestino.has(urlNormalizada(f.url)),
      };
      if (termo !== '' && !normalizarNome([item.titulo, item.descricao, item.orgaoResponsavel, item.url].join(' ')).includes(termo)) continue;
      itens.push(item);
    }
  }
  return { ok: true, itens: itens.slice(0, LIMITE_RESULTADOS), truncado: itens.length > LIMITE_RESULTADOS };
}

/**
 * Cria, em memória, a cópia em rascunho de um link de outro serviço.
 *   origem    { servicoId, versaoId, fonte } com a fonte EFETIVAMENTE selecionada (se ela já for uma cópia, ela é a origem;
 *             nenhuma fonte anterior é consultada nem alterada);
 *   contexto  { servicoId, estadoVersao, documentoFontes } do serviço de destino.
 * A cópia leva só titulo, tipo, orgaoResponsavel, url, descricao, origemOficial (procedência, não validação),
 * dataPublicacao e dispositivoRelevante. Reinicia: id (novo), statusValidacao "rascunho", publicado false, dataConsulta null e
 * vigência (nasce "nao_se_aplica", ou "a_confirmar" em legislação, sem normas nem observação).
 * Retorna { ok: true, fonte, documentoFontes } ou { ok: false, erro }; nada recebido é modificado.
 */
export function criarCopiaDeLink(origem, contexto) {
  if (!ehObjeto(origem) || !ehObjeto(origem.fonte) || !ehObjeto(contexto) || typeof contexto.servicoId !== 'string'
    || !ehObjeto(contexto.documentoFontes) || !Array.isArray(contexto.documentoFontes.fontes)) throw new Error('contexto_invalido');
  if (!conteudoEditavel(contexto.estadoVersao)) return { ok: false, erro: 'versao_nao_editavel' };
  if (origem.servicoId === contexto.servicoId) return { ok: false, erro: 'mesmo_servico' };
  const f = origem.fonte;
  if (!fonteReutilizavel(f)) return { ok: false, erro: 'fonte_nao_reutilizavel' };
  const lin = { servicoId: origem.servicoId, versaoId: origem.versaoId, fonteId: f.id };
  const fontesAtuais = contexto.documentoFontes.fontes;
  const url = urlNormalizada(f.url);
  if (fontesAtuais.some((x) => ehObjeto(x) && x.excluidaEm == null && urlNormalizada(x.url) === url)) return { ok: false, erro: 'url_duplicada' };
  const id = gerarId(f.titulo, new Set(fontesAtuais.map((x) => x.id)));
  if (id === null) return { ok: false, erro: 'dados_invalidos' };

  const fonte = {
    id,
    titulo: f.titulo,
    tipo: f.tipo,
    formaEntrada: 'link',
    orgaoResponsavel: f.orgaoResponsavel,
    url: f.url,
    descricao: f.descricao,
    origemOficial: f.origemOficial,
    statusValidacao: 'rascunho',
    publicado: false,
    dataPublicacao: f.dataPublicacao ?? null,
    dataConsulta: null,
    dispositivoRelevante: f.dispositivoRelevante ?? null,
    vigencia: { situacao: f.tipo === 'legislacao' ? 'a_confirmar' : 'nao_se_aplica', normasRelacionadas: [], observacao: null },
    reutilizadaDe: lin,
  };
  const documentoFontes = {
    ...contexto.documentoFontes,
    fontes: [...fontesAtuais, fonte],
    ...(fontesAtuais.length === 0 ? { pendencia: 'PENDENTE: fontes em rascunho, ainda não validadas.' } : {}),
  };
  if (validarFontes({ statusValidacao: 'rascunho', fontes: [fonte] }).length > 0) return { ok: false, erro: 'dados_invalidos' };
  return { ok: true, fonte, documentoFontes: structuredClone(documentoFontes) };
}
