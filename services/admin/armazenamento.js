// Armazenamento local seguro do módulo administrativo (Marco 7, Passo 7C1).
//
// Arquivos JSON e histórico JSONL dentro de uma raiz recebida explicitamente. Este módulo NÃO tem autenticação e
// NÃO comprova identidade: é só persistência local, para desenvolvimento. Nenhum dado real é gravado neste passo, nenhum
// endpoint ou interface o usa, e o conteúdo da LAC não é lido nem alterado. Dados com identificação pessoal devem ficar em
// `data/admin-private/` (fora do Git).
//
// Resultado das operações: { ok: true, ... } ou { ok: false, erro: '<codigo>', detalhes?: [...] }. Nunca expõe caminhos
// internos nem conteúdo nas mensagens de erro.

import fs from 'node:fs';
import path from 'node:path';
import { serializarCanonico } from './hash.js';

export const EXTENSOES = Object.freeze({ json: '.json', jsonl: '.jsonl' });
export const TAMANHO_MAXIMO = 5 * 1024 * 1024;

const PADRAO_SEGMENTO = /^[A-Za-z0-9][A-Za-z0-9._-]*[A-Za-z0-9_-]$|^[A-Za-z0-9]$/;
const PADRAO_ID = /^[a-z][a-z0-9-]*$/;
const ehObjeto = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const falha = (erro, detalhes) => (detalhes && detalhes.length ? { ok: false, erro, detalhes } : { ok: false, erro });
let sequencia = 0;

/** Formato determinístico de arquivo .json: chaves em ordem alfabética, 2 espaços, UTF-8 e quebra de linha final. */
export function formatarJson(valor) {
  return `${JSON.stringify(JSON.parse(serializarCanonico(valor)), null, 2)}\n`;
}

/** Formato determinístico de uma linha JSONL: JSON canônico em uma única linha, terminada por quebra de linha. */
export function formatarLinhaJsonl(valor) {
  return `${serializarCanonico(valor)}\n`;
}

/**
 * Cria o armazenamento sobre uma raiz já existente, informada de forma explícita (caminho absoluto de um diretório).
 * `sistema` permite trocar o módulo de arquivos (usado nos testes para simular falhas).
 */
export function criarArmazenamento({ raiz, sistema = fs } = {}) {
  if (typeof raiz !== 'string' || raiz === '' || raiz.includes('\0') || !path.isAbsolute(raiz)) return falha('raiz_invalida');
  let base;
  try {
    if (!sistema.lstatSync(raiz).isDirectory()) return falha('raiz_invalida');
    base = sistema.realpathSync(raiz);
  } catch {
    return falha('raiz_invalida');
  }

  /** Valida o caminho relativo, a extensão, links simbólicos e a permanência dentro da raiz. */
  function resolver(relativo, extensao, { criarDiretorios }) {
    if (typeof relativo !== 'string' || relativo === '' || relativo.length > 200) return falha('caminho_invalido');
    if (relativo.includes('\0') || relativo.includes('\\') || relativo.includes(':') || path.isAbsolute(relativo) || relativo.startsWith('/')) {
      return falha('caminho_invalido');
    }
    const segmentos = relativo.split('/');
    if (!segmentos.every((s) => PADRAO_SEGMENTO.test(s) && !s.includes('..'))) return falha('caminho_invalido');
    const nome = segmentos[segmentos.length - 1];
    if (!nome.endsWith(extensao) || nome === extensao) return falha('extensao_nao_permitida');

    let atual = base;
    for (const seg of segmentos.slice(0, -1)) {
      const proximo = path.join(atual, seg);
      let st = null;
      try {
        st = sistema.lstatSync(proximo);
      } catch (e) {
        if (e && e.code !== 'ENOENT') return falha('falha_de_acesso');
      }
      if (st === null) {
        if (!criarDiretorios) return { ok: true, destino: path.join(base, ...segmentos), existe: false };
        try {
          sistema.mkdirSync(proximo);
          st = sistema.lstatSync(proximo);
        } catch {
          return falha('falha_de_acesso');
        }
      }
      if (st.isSymbolicLink()) return falha('link_simbolico');
      if (!st.isDirectory()) return falha('caminho_invalido');
      atual = proximo;
    }

    const destino = path.join(atual, nome);
    const relativoAoBase = path.relative(base, destino);
    if (relativoAoBase === '' || relativoAoBase.startsWith('..') || path.isAbsolute(relativoAoBase)) return falha('caminho_invalido');
    try {
      const st = sistema.lstatSync(destino);
      if (st.isSymbolicLink()) return falha('link_simbolico');
      if (!st.isFile()) return falha('caminho_invalido');
      return { ok: true, destino, existe: true, tamanho: st.size };
    } catch (e) {
      if (e && e.code === 'ENOENT') return { ok: true, destino, existe: false };
      return falha('falha_de_acesso');
    }
  }

  /** Escrita atômica: temporário no mesmo diretório, gravação completa, renomeação; limpa o temporário se algo falhar. */
  function gravarAtomico(destino, texto) {
    const dir = path.dirname(destino);
    sequencia += 1;
    const temporario = path.join(dir, `.${path.basename(destino)}.${process.pid}.${sequencia}.tmp`);
    let fd = null;
    try {
      fd = sistema.openSync(temporario, 'wx');
      sistema.writeSync(fd, texto, null, 'utf8');
      sistema.fsyncSync(fd);
      sistema.closeSync(fd);
      fd = null;
      sistema.renameSync(temporario, destino);
      return { ok: true, bytes: Buffer.byteLength(texto, 'utf8') };
    } catch {
      if (fd !== null) {
        try { sistema.closeSync(fd); } catch { /* sem ação */ }
      }
      try { sistema.unlinkSync(temporario); } catch { /* o temporário pode não existir */ }
      return falha('falha_de_escrita');
    }
  }

  function lerTexto(r) {
    if (r.tamanho > TAMANHO_MAXIMO) return falha('arquivo_grande_demais');
    try {
      return { ok: true, texto: sistema.readFileSync(r.destino, 'utf8') };
    } catch {
      return falha('falha_de_acesso');
    }
  }

  function exigirValidador(validar) {
    return typeof validar === 'function' ? null : falha('validador_obrigatorio');
  }

  /** Executa o validador do chamador (lista de erros; vazia = ok). Exceções do validador viram erro genérico. */
  function conferir(validar, dados) {
    let erros;
    try {
      erros = validar(dados);
    } catch {
      return falha('dados_invalidos');
    }
    if (!Array.isArray(erros)) return falha('dados_invalidos');
    return erros.length ? falha('dados_invalidos', erros.map(String)) : null;
  }

  /** Divide o texto JSONL em registros. Recusa linha vazia, JSON inválido, não objeto, sem id válido, id duplicado. */
  function analisarJsonl(texto) {
    if (texto === '') return { ok: true, registros: [] };
    if (!texto.endsWith('\n') || texto.includes('\r')) return falha('jsonl_invalido');
    const linhas = texto.slice(0, -1).split('\n');
    const registros = [];
    const ids = new Set();
    for (const linha of linhas) {
      let r;
      try {
        r = JSON.parse(linha);
      } catch {
        return falha('jsonl_invalido');
      }
      if (!ehObjeto(r) || typeof r.id !== 'string' || !PADRAO_ID.test(r.id)) return falha('jsonl_invalido');
      if (ids.has(r.id)) return falha('jsonl_invalido');
      ids.add(r.id);
      registros.push(r);
    }
    return { ok: true, registros };
  }

  return {
    raiz: base,

    /** Lê um arquivo .json. */
    lerJson(relativo) {
      const r = resolver(relativo, EXTENSOES.json, { criarDiretorios: false });
      if (!r.ok) return r;
      if (!r.existe) return falha('nao_encontrado');
      const t = lerTexto(r);
      if (!t.ok) return t;
      try {
        return { ok: true, dados: JSON.parse(t.texto) };
      } catch {
        return falha('json_invalido');
      }
    },

    /** Grava um arquivo .json de forma atômica, depois de validar os dados com a função do chamador. */
    gravarJson(relativo, dados, validar) {
      const semValidador = exigirValidador(validar);
      if (semValidador) return semValidador;
      const r = resolver(relativo, EXTENSOES.json, { criarDiretorios: false });
      if (!r.ok) return r;
      let texto;
      try {
        texto = formatarJson(dados);
      } catch {
        return falha('dados_invalidos');
      }
      if (Buffer.byteLength(texto, 'utf8') > TAMANHO_MAXIMO) return falha('arquivo_grande_demais');
      const invalido = conferir(validar, dados);
      if (invalido) return invalido;
      // Só agora os diretórios intermediários podem ser criados.
      const g = resolver(relativo, EXTENSOES.json, { criarDiretorios: true });
      if (!g.ok) return g;
      return gravarAtomico(g.destino, texto);
    },

    /** Lista os registros de um arquivo .jsonl (arquivo inexistente = lista vazia). */
    listarJsonl(relativo) {
      const r = resolver(relativo, EXTENSOES.jsonl, { criarDiretorios: false });
      if (!r.ok) return r;
      if (!r.existe) return { ok: true, registros: [] };
      const t = lerTexto(r);
      if (!t.ok) return t;
      return analisarJsonl(t.texto);
    },

    /**
     * Acrescenta um registro ao final de um .jsonl. Só acréscimo: o conteúdo anterior é mantido byte a byte.
     * Exige `id` válido e inédito no arquivo. Não existe edição nem exclusão.
     */
    acrescentarJsonl(relativo, registro, validar) {
      const semValidador = exigirValidador(validar);
      if (semValidador) return semValidador;
      if (!ehObjeto(registro) || typeof registro.id !== 'string' || !PADRAO_ID.test(registro.id)) return falha('registro_invalido');
      const r = resolver(relativo, EXTENSOES.jsonl, { criarDiretorios: false });
      if (!r.ok) return r;
      let linha;
      try {
        linha = formatarLinhaJsonl(registro);
      } catch {
        return falha('registro_invalido');
      }
      const invalido = conferir(validar, registro);
      if (invalido) return invalido;

      let anterior = '';
      if (r.existe) {
        const t = lerTexto(r);
        if (!t.ok) return t;
        const a = analisarJsonl(t.texto);
        if (!a.ok) return a;
        if (a.registros.some((x) => x.id === registro.id)) return falha('id_duplicado');
        anterior = t.texto;
      }
      const novo = `${anterior}${linha}`;
      if (Buffer.byteLength(novo, 'utf8') > TAMANHO_MAXIMO) return falha('arquivo_grande_demais');
      const g = resolver(relativo, EXTENSOES.jsonl, { criarDiretorios: true });
      if (!g.ok) return g;
      return gravarAtomico(g.destino, novo);
    },
  };
}
