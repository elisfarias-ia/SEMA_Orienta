// SHA-256 determinístico de conteúdo JSON (Marco 7). Serve para provar qual conteúdo foi validado.
// Função pura: não lê arquivos nem variáveis de ambiente. A ordem das chaves dos objetos é normalizada;
// a ordem dos itens de uma lista é mantida (ela faz parte do conteúdo).

import { createHash } from 'node:crypto';

const ehObjetoSimples = (v) => {
  if (v === null || typeof v !== 'object') return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
};

/** Serialização canônica: JSON com chaves em ordem alfabética, sem espaços. Lança TypeError para valor não JSON. */
export function serializarCanonico(valor) {
  if (valor === null) return 'null';
  switch (typeof valor) {
    case 'string':
    case 'boolean':
      return JSON.stringify(valor);
    case 'number':
      if (!Number.isFinite(valor)) throw new TypeError('Número não finito não é conteúdo JSON válido');
      return JSON.stringify(valor);
    case 'object':
      if (Array.isArray(valor)) return `[${valor.map(serializarCanonico).join(',')}]`;
      if (ehObjetoSimples(valor)) {
        const chaves = Object.keys(valor).sort();
        return `{${chaves.map((k) => `${JSON.stringify(k)}:${serializarCanonico(valor[k])}`).join(',')}}`;
      }
      throw new TypeError('Objeto que não é simples não é conteúdo JSON válido');
    default:
      throw new TypeError(`Valor do tipo ${typeof valor} não é conteúdo JSON válido`);
  }
}

/** SHA-256 (hexadecimal, 64 caracteres) do conteúdo canônico. */
export function hashConteudo(conteudo) {
  return createHash('sha256').update(serializarCanonico(conteudo), 'utf8').digest('hex');
}
