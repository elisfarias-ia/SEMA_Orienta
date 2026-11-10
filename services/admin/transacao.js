// Transação de escrita do módulo administrativo (Marco 7, Passo 7E1): aplica um conjunto de gravações como uma só
// alteração. Se qualquer passo falhar, ou se a verificação final recusar o resultado, TUDO é desfeito:
//   - arquivos novos são removidos e as pastas criadas pela transação são removidas (sem apagar nada que já existia);
//   - arquivos que já existiam são restaurados byte a byte (escrita atômica do texto original).
// Nunca sobrescreve o que foi marcado como "novo". Reutiliza o armazenamento seguro (caminhos, links simbólicos,
// escrita atômica, limites). Não usa relógio, rede, variáveis de ambiente nem registro em log.

import fs from 'node:fs';
import path from 'node:path';
import { criarArmazenamento } from './armazenamento.js';

let sequencia = 0;

/** Restaura um arquivo com o texto original, de forma atômica (temporário no mesmo diretório + renomeação). */
function restaurar(sistema, destino, textoOriginal) {
  sequencia += 1;
  const temporario = path.join(path.dirname(destino), `.${path.basename(destino)}.restaurar.${process.pid}.${sequencia}.tmp`);
  let fd = null;
  try {
    fd = sistema.openSync(temporario, 'wx');
    sistema.writeSync(fd, textoOriginal, null, 'utf8');
    sistema.fsyncSync(fd);
    sistema.closeSync(fd);
    fd = null;
    sistema.renameSync(temporario, destino);
    return true;
  } catch {
    if (fd !== null) {
      try { sistema.closeSync(fd); } catch { /* sem ação */ }
    }
    try { sistema.unlinkSync(temporario); } catch { /* o temporário pode não existir */ }
    return false;
  }
}

const existe = (sistema, p) => {
  try {
    sistema.lstatSync(p);
    return true;
  } catch (e) {
    if (e && e.code === 'ENOENT') return false;
    throw e;
  }
};

/**
 * Executa os passos em ordem. Cada passo: { caminho, tipo: 'json' | 'texto', conteudo, validar, novo }.
 * `verificar()` roda depois da última gravação e deve devolver a lista de erros (vazia = aceito).
 * Retorna { ok: true } ou { ok: false, erro, revertido }, onde `revertido` diz se o desfazer terminou por completo.
 */
export function executarTransacao({ raiz, sistema = fs, passos, verificar }) {
  const arm = criarArmazenamento({ raiz, sistema });
  if (arm.ok === false) return { ok: false, erro: 'raiz_invalida', revertido: true };
  const base = arm.raiz;
  const absoluto = (rel) => path.join(base, ...rel.split('/'));

  // Antes de tocar em qualquer coisa: o que já existe, o texto original e as pastas que a transação vai criar.
  const originais = new Map();
  const pastasNovas = new Set();
  try {
    for (const passo of passos) {
      const destino = absoluto(passo.caminho);
      const jaExiste = existe(sistema, destino);
      if (passo.novo && jaExiste) return { ok: false, erro: 'ja_existe', revertido: true };
      originais.set(passo.caminho, jaExiste ? sistema.readFileSync(destino, 'utf8') : null);
      let dir = path.dirname(destino);
      const faltando = [];
      while (dir !== base && dir.startsWith(base) && !existe(sistema, dir)) {
        faltando.push(dir);
        dir = path.dirname(dir);
      }
      for (const d of faltando) pastasNovas.add(d);
    }
  } catch {
    return { ok: false, erro: 'falha_de_leitura', revertido: true };
  }

  const gravados = [];
  const desfazer = () => {
    let completo = true;
    for (const caminho of [...gravados].reverse()) {
      const destino = absoluto(caminho);
      const original = originais.get(caminho);
      if (original === null) {
        try { sistema.unlinkSync(destino); } catch (e) { if (!e || e.code !== 'ENOENT') completo = false; }
      } else if (!restaurar(sistema, destino, original)) {
        completo = false;
      }
    }
    // Pastas criadas pela transação: da mais profunda para a mais rasa, só se estiverem vazias.
    for (const dir of [...pastasNovas].sort((a, b) => b.length - a.length)) {
      try { sistema.rmdirSync(dir); } catch (e) { if (!e || e.code !== 'ENOENT') completo = false; }
    }
    return completo;
  };

  for (const passo of passos) {
    const r = passo.tipo === 'texto'
      ? arm.gravarTexto(passo.caminho, passo.conteudo, passo.validar)
      : arm.gravarJson(passo.caminho, passo.conteudo, passo.validar);
    // Mesmo quando a gravação falha, o desfazer cobre o que ela possa ter criado (pastas) e os passos anteriores.
    if (r.ok) gravados.push(passo.caminho);
    if (!r.ok) return { ok: false, erro: r.erro === 'dados_invalidos' ? 'dados_invalidos' : 'falha_de_escrita', revertido: desfazer() };
  }

  if (typeof verificar === 'function') {
    let erros;
    try {
      erros = verificar();
    } catch {
      erros = ['falha'];
    }
    if (!Array.isArray(erros) || erros.length > 0) return { ok: false, erro: 'verificacao_recusada', revertido: desfazer() };
  }
  return { ok: true };
}
