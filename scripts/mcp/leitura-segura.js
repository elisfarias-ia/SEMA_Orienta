// Camada própria de leitura do servidor MCP local (Passo 2C1). SOMENTE LEITURA: este módulo não exporta nem usa nenhuma
// função de gravação. Confinamento em <raiz>/services, recusa de links simbólicos e junções, limite de tamanho e erros
// genéricos (nunca devolve caminho, conteúdo nem a mensagem original do erro).
//
// Leituras permitidas: services/registry.json, services/assuntos.json e os arquivos .json de uma pasta de versão
// (services/<servicoId>/versoes/v<N>/<arquivo>.json). Qualquer outro caminho é recusado antes de tocar o disco.

import fs from 'node:fs';
import path from 'node:path';

export const TAMANHO_MAXIMO = 5 * 1024 * 1024;
export const ERRO_LEITURA = 'base_indisponivel';

const PADRAO_SEGMENTO = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const CATALOGOS = Object.freeze(['services/registry.json', 'services/assuntos.json']);
const PADRAO_ARQUIVO_DE_VERSAO =
  /^services\/[a-z][a-z0-9-]{0,59}\/versoes\/v[1-9][0-9]{0,3}\/(versao|service|fontes|documentos|perguntas-frequentes|conteudo-assistente)\.json$/;

const falha = () => ({ ok: false, erro: ERRO_LEITURA });

/** Confere o formato do caminho relativo, sem acessar o disco. */
export function caminhoPermitido(relativo) {
  if (typeof relativo !== 'string' || relativo === '' || relativo.length > 200) return false;
  if (relativo.includes('\0') || relativo.includes('\\') || relativo.includes(':') || relativo.startsWith('/')) return false;
  const segmentos = relativo.split('/');
  if (!segmentos.every((s) => s !== '.' && s !== '..' && !s.includes('..') && PADRAO_SEGMENTO.test(s))) return false;
  return CATALOGOS.includes(relativo) || PADRAO_ARQUIVO_DE_VERSAO.test(relativo);
}

/**
 * Cria a leitura confinada a <raiz>/services. `raiz` é o caminho absoluto do projeto (definido pelo servidor, nunca pela
 * entrada). `sistema` permite trocar o módulo de arquivos para espionar as leituras.
 */
export function criarLeituraSegura({ raiz, sistema = fs } = {}) {
  if (typeof raiz !== 'string' || raiz === '' || raiz.includes('\0') || !path.isAbsolute(raiz)) {
    throw new TypeError('raiz_invalida');
  }
  const pastaServices = path.join(raiz, 'services');

  /** Lê um arquivo JSON permitido. Retorna { ok: true, dados } ou { ok: false, erro: 'base_indisponivel' }. */
  function lerJson(relativo) {
    if (!caminhoPermitido(relativo)) return falha();
    const segmentos = relativo.split('/').slice(1);
    try {
      // lstat em cada segmento a partir de services/, inclusive: nenhum link simbólico ou junção no caminho.
      const raizServices = sistema.lstatSync(pastaServices);
      if (raizServices.isSymbolicLink() || !raizServices.isDirectory()) return falha();
      let atual = pastaServices;
      let info = null;
      for (let i = 0; i < segmentos.length; i += 1) {
        atual = path.join(atual, segmentos[i]);
        info = sistema.lstatSync(atual);
        if (info.isSymbolicLink()) return falha();
        const ultimo = i === segmentos.length - 1;
        if (ultimo ? !info.isFile() : !info.isDirectory()) return falha();
      }
      if (info.size > TAMANHO_MAXIMO) return falha();

      // realpath confinado a realpath(<raiz>/services) mais o separador.
      const base = sistema.realpathSync(pastaServices);
      const real = sistema.realpathSync(atual);
      const relativoReal = path.relative(base, real);
      if (!real.startsWith(base + path.sep) || relativoReal === '' || relativoReal.startsWith('..') || path.isAbsolute(relativoReal)) {
        return falha();
      }
      const texto = sistema.readFileSync(atual, 'utf8');
      if (typeof texto !== 'string' || Buffer.byteLength(texto, 'utf8') > TAMANHO_MAXIMO) return falha();
      try {
        return { ok: true, dados: JSON.parse(texto) };
      } catch {
        return falha();
      }
    } catch {
      return falha();
    }
  }

  return Object.freeze({ lerJson });
}
