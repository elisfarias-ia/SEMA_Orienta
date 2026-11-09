// Endpoint EXCLUSIVO do servidor de desenvolvimento do Vite (GET /__assistente/blocos).
// - só existe em `vite` (apply: 'serve'); não existe em `vite build` nem em `vite preview`;
// - só aceita GET, só de origem local, e NÃO recebe nem repete pergunta ou qualquer parâmetro;
// - entrega apenas blocos selecionados em modo teste_local por selecionarBlocosAssistente;
// - nenhum código da interface importa este arquivo nem o JSON do conteúdo.

import fs from 'node:fs';
import path from 'node:path';
import { selecionarBlocosAssistente } from './assistant-content.js';
import { FRASE_ESCOPO, FAIXA_TESTE_LOCAL } from './assistant-messages.js';

export const ROTA_BLOCOS = '/__assistente/blocos';
const MODO_DO_ENDPOINT = 'teste_local';
const ORIGENS_LOCAIS = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

/** Lê os dados da base da LAC (conteúdo do assistente e fontes) a partir da raiz do projeto. */
export function lerDadosDaBase(raiz) {
  const ler = (...partes) => JSON.parse(fs.readFileSync(path.join(raiz, ...partes), 'utf8'));
  return {
    conteudo: ler('services', 'lac', 'conteudo-assistente.json'),
    fontes: ler('services', 'lac', 'fontes.json').fontes,
  };
}

/** Resumo público das fontes citadas pelos blocos (somente id, título e URL https). */
function resumoDasFontes(blocos, fontes) {
  const ids = new Set(blocos.flatMap((b) => b.fonteIds));
  return (Array.isArray(fontes) ? fontes : [])
    .filter((f) => f && ids.has(f.id) && typeof f.url === 'string' && f.url.startsWith('https://'))
    .map((f) => ({ id: f.id, titulo: f.titulo, url: f.url }));
}

/**
 * Cria o manipulador (middleware) do endpoint. `lerDados` devolve { conteudo, fontes }.
 * Função independente do Vite, para poder ser testada com requisição e resposta simuladas.
 */
export function criarManipuladorBlocos({ lerDados }) {
  return async function manipuladorBlocos(req, res, next) {
    const url = typeof req.url === 'string' ? req.url : '';
    const indice = url.indexOf('?');
    const caminho = indice === -1 ? url : url.slice(0, indice);
    if (caminho !== ROTA_BLOCOS) return next();

    const responder = (status, corpo, cabecalhos = {}) => {
      res.statusCode = status;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      for (const [nome, valor] of Object.entries(cabecalhos)) res.setHeader(nome, valor);
      res.end(JSON.stringify(corpo));
    };

    if (req.method !== 'GET') return responder(405, { erro: 'metodo_nao_permitido' }, { Allow: 'GET' });
    if (!ORIGENS_LOCAIS.has(req.socket?.remoteAddress)) return responder(403, { erro: 'acesso_somente_local' });
    // Nenhum parâmetro é aceito: a pergunta do usuário nunca chega ao servidor.
    if (indice !== -1 && url.slice(indice + 1) !== '') return responder(400, { erro: 'parametros_nao_aceitos' });

    try {
      const dados = await lerDados();
      const blocos = selecionarBlocosAssistente(dados, MODO_DO_ENDPOINT);
      return responder(200, {
        modo: MODO_DO_ENDPOINT,
        mensagens: { faixa: FAIXA_TESTE_LOCAL, escopo: FRASE_ESCOPO },
        blocos,
        fontes: resumoDasFontes(blocos, dados.fontes),
      });
    } catch {
      return responder(500, { erro: 'indisponivel' });
    }
  };
}

/** Plugin do Vite: registra o endpoint somente no servidor de desenvolvimento. */
export function criarPluginAssistenteDev({ raiz }) {
  return {
    name: 'sema-orienta-assistente-dev',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(criarManipuladorBlocos({ lerDados: () => lerDadosDaBase(raiz) }));
    },
  };
}
