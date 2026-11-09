// Localiza a versão atual de um serviço pelo registro (services/registry.json) e pelo manifesto da versão (versao.json).
// Nenhum código deve montar o caminho de um serviço "na mão": a pasta vem de `versaoAtualId` e os arquivos, do manifesto.
// Só lê arquivos do projeto; não usa variáveis de ambiente, rede nem relógio.

import fs from 'node:fs';
import path from 'node:path';

const PADRAO_ID = /^[a-z][a-z0-9-]*$/;

/** Arquivos modulares de uma versão (chave do manifesto -> nome do arquivo dentro da pasta da versão). */
export const ARQUIVOS_DA_VERSAO = Object.freeze({
  service: 'service.json',
  roteiro: 'roteiro.md',
  documentos: 'documentos.json',
  perguntasFrequentes: 'perguntas-frequentes.json',
  fontes: 'fontes.json',
  conteudoAssistente: 'conteudo-assistente.json',
});
export const NOME_DO_MANIFESTO = 'versao.json';

/** Pasta da versão (caminho relativo à raiz do projeto). O id da versão deve ser "<servicoId>-v<número>". */
export function pastaDaVersao(servicoId, versaoId) {
  if (typeof servicoId !== 'string' || typeof versaoId !== 'string' || !PADRAO_ID.test(servicoId) || !PADRAO_ID.test(versaoId)) return null;
  const prefixo = `${servicoId}-v`;
  if (!versaoId.startsWith(prefixo)) return null;
  const numero = versaoId.slice(prefixo.length);
  return /^[1-9][0-9]*$/.test(numero) ? `services/${servicoId}/versoes/v${numero}` : null;
}

/** Caminhos esperados dos arquivos de uma versão, a partir da pasta. */
export function caminhosDaVersao(pasta) {
  return Object.fromEntries(Object.entries(ARQUIVOS_DA_VERSAO).map(([chave, nome]) => [chave, `${pasta}/${nome}`]));
}

const lerJsonRelativo = (raiz, relativo) => JSON.parse(fs.readFileSync(path.join(raiz, ...relativo.split('/')), 'utf8'));

/**
 * Localiza a versão atual do serviço: registro -> pasta -> manifesto. Confere id, serviço e caminhos do manifesto.
 * Retorna { ok: true, servicoId, versaoId, pasta, manifesto, arquivos } ou { ok: false, erro }.
 */
export function localizarVersaoAtual(raiz, servicoId) {
  try {
    const registro = lerJsonRelativo(raiz, 'services/registry.json');
    const entrada = Array.isArray(registro.servicos) ? registro.servicos.find((s) => s && s.id === servicoId) : null;
    if (!entrada) return { ok: false, erro: 'servico_nao_registrado' };
    const pasta = pastaDaVersao(servicoId, entrada.versaoAtualId);
    if (!pasta) return { ok: false, erro: 'versao_atual_invalida' };
    const manifesto = lerJsonRelativo(raiz, `${pasta}/${NOME_DO_MANIFESTO}`);
    if (manifesto.id !== entrada.versaoAtualId || manifesto.servicoId !== servicoId) return { ok: false, erro: 'manifesto_incoerente' };
    const esperados = caminhosDaVersao(pasta);
    const declarados = manifesto.arquivos;
    const chaves = declarados && typeof declarados === 'object' && !Array.isArray(declarados) ? Object.keys(declarados) : [];
    const coerente = chaves.length === Object.keys(esperados).length && Object.entries(esperados).every(([chave, caminho]) => declarados[chave] === caminho);
    if (!coerente) return { ok: false, erro: 'manifesto_incoerente' };
    return { ok: true, servicoId, versaoId: entrada.versaoAtualId, pasta, manifesto, arquivos: esperados };
  } catch {
    return { ok: false, erro: 'versao_indisponivel' };
  }
}
