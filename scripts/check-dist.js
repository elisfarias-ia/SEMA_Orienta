// Confere que o build de produção (dist/) NÃO contém nenhum conteúdo de teste local.
// Uso: npm run build && node scripts/check-dist.js   (sai com código 1 se algo for encontrado)
// Procura: os textos dos blocos, a frase de escopo, a faixa de teste e os nomes internos do endpoint/conteúdo.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { selecionarBlocosAssistente } from '../services/assistant-content.js';
import { FRASE_ESCOPO, FAIXA_TESTE_LOCAL } from '../services/assistant-messages.js';
import { lerDadosDaBase } from '../services/assistant-endpoint.js';

export const NOMES_INTERNOS = ['/__assistente', '__assistente', 'teste_local', 'conteudo-assistente', 'assistant-content'];

/** Lista os arquivos de um diretório, recursivamente. */
function listar(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const completo = path.join(dir, e.name);
    return e.isDirectory() ? listar(completo) : [completo];
  });
}

/** Textos que nunca podem estar no build: blocos (inteiros e trechos), frase de escopo, faixa e nomes internos. */
export function termosProibidos(raiz) {
  const blocos = selecionarBlocosAssistente(lerDadosDaBase(raiz), 'teste_local');
  const termos = [];
  for (const b of blocos) {
    termos.push({ origem: `bloco ${b.id}`, texto: b.texto });
    // Trecho de cada frase com mais de 30 caracteres, para pegar texto reaproveitado em pedaços.
    for (const frase of b.texto.split(/(?<=[.:;])\s+/)) if (frase.length > 30) termos.push({ origem: `trecho de ${b.id}`, texto: frase });
    if (b.url) termos.push({ origem: `url de ${b.id}`, texto: b.url });
  }
  termos.push({ origem: 'frase de escopo', texto: FRASE_ESCOPO });
  termos.push({ origem: 'faixa de teste', texto: FAIXA_TESTE_LOCAL });
  for (const nome of NOMES_INTERNOS) termos.push({ origem: 'nome interno', texto: nome });
  return termos;
}

/** Retorna a lista de ocorrências encontradas em `dist` (vazia quando o build está limpo). */
export function conferirDist(raiz) {
  const dist = path.join(raiz, 'dist');
  if (!fs.existsSync(dist)) throw new Error('dist/ não encontrado: rode "npm run build" antes.');
  const termos = termosProibidos(raiz);
  const encontrados = [];
  for (const arquivo of listar(dist)) {
    const conteudo = fs.readFileSync(arquivo, 'utf8');
    for (const { origem, texto } of termos) {
      if (conteudo.includes(texto)) encontrados.push({ arquivo: path.relative(raiz, arquivo), origem, texto: texto.slice(0, 60) });
    }
  }
  return encontrados;
}

const executadoDiretamente = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (executadoDiretamente) {
  const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  try {
    const encontrados = conferirDist(raiz);
    if (encontrados.length > 0) {
      console.error(`dist/ CONTÉM conteúdo de teste (${encontrados.length} ocorrência(s)):`);
      for (const e of encontrados) console.error(` - ${e.arquivo}: ${e.origem}: "${e.texto}"`);
      process.exit(1);
    }
    console.log(`dist/ limpo: ${termosProibidos(raiz).length} termos verificados, nenhuma ocorrência.`);
  } catch (erro) {
    console.error(erro.message);
    process.exit(1);
  }
}
