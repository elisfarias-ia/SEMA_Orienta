// Leitura confinada dos arquivos de UMA versão (Sprint 5, Passo 5A): manifesto + conteúdo modular, para calcular e conferir o
// hash. Só leitura. Usa o armazenamento seguro (caminhos relativos validados, sem links simbólicos, sem sair da raiz). Os
// caminhos declarados no manifesto precisam ser exatamente os da pasta da própria versão; qualquer outro caminho é recusado.
// Erros são códigos, nunca caminhos nem conteúdo.

import fs from 'node:fs';
import { criarArmazenamento } from './armazenamento.js';
import { calcularHashDaVersao, hashConfere } from './conteudo-versao.js';
import { caminhosDaVersao, NOME_DO_MANIFESTO, pastaDaVersao } from '../versao-atual.js';

const NOME_ENTRADAS = 'entradas.json';
const ehObjeto = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

const falha = (erro) => ({ ok: false, erro });

/**
 * Lê o manifesto e os arquivos da versão `versaoId` do serviço `servicoId`. Retorna
 * { ok: true, pasta, manifesto, arquivos: { service, roteiro, documentos, perguntasFrequentes, fontes, conteudoAssistente, entradas? } }
 * ou { ok: false, erro } com: versao_invalida, raiz_invalida, manifesto_indisponivel, manifesto_incoerente,
 * caminho_fora_da_versao, arquivo_ausente.
 */
export function lerArquivosDaVersao({ raiz, servicoId, versaoId, sistema = fs } = {}) {
  const pasta = pastaDaVersao(servicoId, versaoId);
  if (pasta === null) return falha('versao_invalida');
  const arm = criarArmazenamento({ raiz, sistema });
  if (arm.ok === false) return falha('raiz_invalida');

  const m = arm.lerJson(`${pasta}/${NOME_DO_MANIFESTO}`);
  if (!m.ok || !ehObjeto(m.dados)) return falha('manifesto_indisponivel');
  const manifesto = m.dados;
  if (manifesto.id !== versaoId || manifesto.servicoId !== servicoId || !ehObjeto(manifesto.arquivos)) return falha('manifesto_incoerente');

  const esperados = caminhosDaVersao(pasta);
  const declarados = manifesto.arquivos;
  const temEntradas = Object.hasOwn(declarados, 'entradas');
  const chaves = Object.keys(declarados);
  if (chaves.length !== Object.keys(esperados).length + (temEntradas ? 1 : 0)) return falha('caminho_fora_da_versao');
  for (const [chave, caminho] of Object.entries(esperados)) {
    if (declarados[chave] !== caminho) return falha('caminho_fora_da_versao');
  }
  const caminhoEntradas = `${pasta}/${NOME_ENTRADAS}`;
  if (temEntradas && declarados.entradas !== caminhoEntradas) return falha('caminho_fora_da_versao');

  const arquivos = {};
  for (const chave of ['service', 'documentos', 'perguntasFrequentes', 'fontes', 'conteudoAssistente']) {
    const r = arm.lerJson(esperados[chave]);
    if (!r.ok) return falha('arquivo_ausente');
    arquivos[chave] = r.dados;
  }
  const roteiro = arm.lerTexto(esperados.roteiro);
  if (!roteiro.ok) return falha('arquivo_ausente');
  arquivos.roteiro = roteiro.texto;
  if (temEntradas) {
    const e = arm.lerJson(caminhoEntradas);
    if (!e.ok) return falha('arquivo_ausente');
    arquivos.entradas = e.dados;
  }
  return { ok: true, pasta, manifesto, arquivos };
}

/** Calcula o hash da versão a partir dos arquivos em disco. Retorna { ok: true, hash, manifesto, arquivos } ou { ok: false, erro }. */
export function calcularHashDaVersaoEmDisco(parametros) {
  const lida = lerArquivosDaVersao(parametros);
  if (!lida.ok) return lida;
  const h = calcularHashDaVersao(lida.arquivos);
  if (!h.ok) return falha(h.erro === 'arquivo_ausente' ? 'arquivo_ausente' : 'conteudo_invalido');
  return { ok: true, hash: h.hash, manifesto: lida.manifesto, arquivos: lida.arquivos, pasta: lida.pasta };
}

/**
 * Confere o `hashConteudo` gravado no manifesto com o conteúdo em disco. Retorna { ok: true, confere: boolean, hashGravado,
 * hashAtual } ou { ok: false, erro }. Versão sem hash (rascunho) retorna `erro: 'sem_hash'`.
 */
export function conferirHashDaVersaoEmDisco(parametros) {
  const lida = lerArquivosDaVersao(parametros);
  if (!lida.ok) return lida;
  const gravado = lida.manifesto.hashConteudo;
  if (typeof gravado !== 'string') return falha('sem_hash');
  const atual = calcularHashDaVersao(lida.arquivos);
  if (!atual.ok) return falha('conteudo_invalido');
  return { ok: true, confere: hashConfere(gravado, lida.arquivos), hashGravado: gravado, hashAtual: atual.hash };
}
