// Entrega do conteúdo PÚBLICO publicado ao chat, no desenvolvimento e no build (Sprint 5, Passo 5C, parte B).
// Só lê o que `lerConteudoPublicado` (services/publicacao-publica.js) confirma: registro, manifesto publicado, arquivo
// `conteudo-<hash16>.json` íntegro e regenerável. Nunca lê entradas.json, histórico, rascunhos nem arquivos administrativos.
//
// - dev (`vite`): a página recebe um <meta name="conteudo-publico"> com o caminho `/conteudo-publico/conteudo-<hash16>.json`,
//   servido pelo middleware abaixo a partir da leitura validada (sempre atual, sem cache);
// - build (`vite build`): o mesmo arquivo validado é emitido em `dist/conteudo-publico/conteudo-<hash16>.json` e o <meta> aponta para ele;
//   se algum serviço publicado tiver conteúdo público inválido, o build FALHA;
// - sem publicação: nenhum arquivo, nenhum <meta>; o chat segue sem conteúdo.

import fs from 'node:fs';
import path from 'node:path';
import { lerConteudoPublicado, nomeDoArquivoPublico, PADRAO_ARQUIVO_PUBLICO } from './publicacao-publica.js';
import { SERVICO_DO_ASSISTENTE } from './assistant-endpoint.js';

export const PASTA_NO_DIST = 'conteudo-publico';
export const NOME_DO_META = 'conteudo-publico';
const ORIGENS_LOCAIS = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
const ehObjeto = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/** Caminho público (a partir da raiz do site) de um arquivo de conteúdo público. */
export const caminhoPublico = (nome) => `/${PASTA_NO_DIST}/${nome}`;

function lerJson(raiz, relativo) {
  return JSON.parse(fs.readFileSync(path.join(raiz, ...relativo.split('/')), 'utf8'));
}

/** Registro do serviço marcado como publicado (versaoPublicadaId preenchida ou publicado true). */
function entradasPublicadas(raiz) {
  const registro = lerJson(raiz, 'services/registry.json');
  const servicos = Array.isArray(registro.servicos) ? registro.servicos : [];
  return servicos.filter((s) => ehObjeto(s) && typeof s.id === 'string' && (s.publicado === true || (s.versaoPublicadaId ?? null) !== null));
}

/** Conteúdo público atual do serviço e o nome do arquivo (pelo hash do manifesto publicado), ou null (falha segura). */
export function arquivoPublicadoDoServico(raiz, servicoId) {
  try {
    const conteudo = lerConteudoPublicado(raiz, servicoId);
    if (conteudo === null) return null;
    const entrada = lerJson(raiz, 'services/registry.json').servicos.find((s) => s.id === servicoId);
    const numero = /-v([1-9][0-9]*)$/.exec(entrada.versaoPublicadaId)[1];
    const manifesto = lerJson(raiz, `services/${servicoId}/versoes/v${numero}/versao.json`);
    const nome = nomeDoArquivoPublico(manifesto.hashConteudo);
    return nome === null ? null : { servicoId, nome, conteudo };
  } catch {
    return null;
  }
}

/** Todos os arquivos públicos a entregar. Lança erro se um serviço publicado tiver conteúdo público inválido. */
export function listarArquivosPublicados(raiz) {
  const arquivos = [];
  for (const entrada of entradasPublicadas(raiz)) {
    const arquivo = arquivoPublicadoDoServico(raiz, entrada.id);
    if (arquivo === null) throw new Error('Conteúdo público inválido ou ausente para um serviço marcado como publicado; o build foi interrompido.');
    arquivos.push(arquivo);
  }
  return arquivos;
}

/** Plugin do Vite: serve (dev) e emite (build) somente o conteúdo público validado. */
export function criarPluginConteudoPublico({ raiz, servicoId = SERVICO_DO_ASSISTENTE }) {
  let comando = 'serve';
  return {
    name: 'sema-orienta-conteudo-publico',
    config(_, ambiente) {
      comando = ambiente.command;
    },
    buildStart() {
      if (comando === 'build') listarArquivosPublicados(raiz); // falha o build se houver conteúdo público inválido
    },
    configureServer(servidor) {
      servidor.middlewares.use((req, res, proximo) => {
        const url = typeof req.url === 'string' ? req.url : '';
        if (!url.startsWith(`/${PASTA_NO_DIST}/`)) return proximo();
        const responder = (status, corpo) => {
          res.statusCode = status;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.setHeader('Cache-Control', 'no-store');
          res.setHeader('X-Content-Type-Options', 'nosniff');
          res.end(JSON.stringify(corpo));
        };
        if (req.method !== 'GET') return responder(405, { erro: 'metodo_nao_permitido' });
        if (!ORIGENS_LOCAIS.has(req.socket?.remoteAddress)) return responder(403, { erro: 'acesso_somente_local' });
        const nome = url.slice(PASTA_NO_DIST.length + 2);
        const atual = PADRAO_ARQUIVO_PUBLICO.test(nome) ? arquivoPublicadoDoServico(raiz, servicoId) : null;
        if (atual === null || atual.nome !== nome) return responder(404, { erro: 'nao_encontrado' });
        return responder(200, atual.conteudo);
      });
    },
    transformIndexHtml() {
      let atual = null;
      if (comando === 'build') atual = listarArquivosPublicados(raiz).find((a) => a.servicoId === servicoId) ?? null;
      else atual = arquivoPublicadoDoServico(raiz, servicoId);
      if (atual === null) return [];
      return [{ tag: 'meta', attrs: { name: NOME_DO_META, content: caminhoPublico(atual.nome) }, injectTo: 'head' }];
    },
    generateBundle() {
      if (comando !== 'build') return;
      for (const a of listarArquivosPublicados(raiz)) {
        this.emitFile({ type: 'asset', fileName: `${PASTA_NO_DIST}/${a.nome}`, source: JSON.stringify(a.conteudo) });
      }
    },
  };
}
