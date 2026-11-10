// Endpoint administrativo LOCAL, SOMENTE DE LEITURA (Marco 7, Passo 7D). Existe apenas no servidor de desenvolvimento
// do Vite (`npm run dev`): o plugin usa apply: 'serve' e não há gancho de preview, então o build e o preview não o têm.
//
// Rotas (todas GET, sem query e sem corpo):
//   /__admin/sessao                       -> entrega o token da sessão (criado na primeira chamada, só em memória)
//   /__admin/catalogo                     -> assuntos e serviços, com versão atual e publicada (exige token)
//   /__admin/servicos/<id>/versao-atual   -> manifesto e arquivos modulares da versão atual (exige token)
//
// Este módulo NÃO tem autenticação de pessoas: o token só impede que outro site aberto no navegador use o endpoint.
// Não grava, edita, exclui nem registra decisões; não lê dados privados (data/admin-private/); não usa cookies,
// armazenamento do navegador, variáveis de ambiente nem registro em log. Erros são códigos genéricos, sem caminho, token ou conteúdo.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { criarArmazenamento } from './armazenamento.js';
import { localizarVersaoAtual, NOME_DO_MANIFESTO } from '../versao-atual.js';

export const PREFIXO_ADMIN = '/__admin';
export const ROTA_SESSAO = '/__admin/sessao';
export const ROTA_CATALOGO = '/__admin/catalogo';
export const CABECALHO_TOKEN = 'x-admin-token';
export const LIMITE_RESPOSTA = 2 * 1024 * 1024;
export const LIMITE_TEXTO = 1024 * 1024;

const ORIGENS_LOCAIS = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
const PADRAO_HOST = /^(localhost|127\.0\.0\.1|\[::1\])(?::(\d{1,5}))?$/i;
const PADRAO_ROTA_VERSAO = /^\/__admin\/servicos\/([a-z][a-z0-9-]*)\/versao-atual$/;
const PADRAO_TOKEN = /^[0-9a-f]{64}$/;
const PADRAO_ROTEIRO = /^services\/[a-z][a-z0-9-]*\/versoes\/v[1-9][0-9]*\/roteiro\.md$/;
const SEC_FETCH_PERMITIDOS = new Set(['same-origin', 'none']);

const geradorPadrao = () => crypto.randomBytes(32).toString('hex');
const sobPrefixo = (caminho) => caminho === PREFIXO_ADMIN || caminho.startsWith(`${PREFIXO_ADMIN}/`);

/** Host da requisição, se for local e na porta em que o servidor escuta; senão null. */
function hostLocal(req) {
  const host = req.headers?.host;
  if (typeof host !== 'string') return null;
  const m = PADRAO_HOST.exec(host);
  if (!m) return null;
  const porta = m[2] === undefined ? 80 : Number(m[2]);
  const portaLocal = req.socket?.localPort;
  if (Number.isInteger(portaLocal) && portaLocal !== porta) return null;
  return host.toLowerCase();
}

/** Conexão local, Host local, Origin (se enviada) igual ao host da requisição e requisição não cruzada entre sites. */
function origemPermitida(req) {
  if (!ORIGENS_LOCAIS.has(req.socket?.remoteAddress)) return false;
  const host = hostLocal(req);
  if (host === null) return false;
  const origem = req.headers.origin;
  if (origem !== undefined && origem !== `http://${host}` && origem !== `https://${host}`) return false;
  const site = req.headers['sec-fetch-site'];
  if (site !== undefined && !SEC_FETCH_PERMITIDOS.has(site)) return false;
  return true;
}

/** Leitura de texto limitada ao roteiro da versão, recusando links simbólicos em qualquer parte do caminho. */
function lerRoteiro(raiz, relativo) {
  if (!PADRAO_ROTEIRO.test(relativo)) throw new Error('caminho');
  let atual = fs.realpathSync(raiz);
  const partes = relativo.split('/');
  for (const parte of partes) {
    atual = path.join(atual, parte);
    if (fs.lstatSync(atual).isSymbolicLink()) throw new Error('link');
  }
  const st = fs.lstatSync(atual);
  if (!st.isFile() || st.size > LIMITE_TEXTO) throw new Error('arquivo');
  return fs.readFileSync(atual, 'utf8');
}

/**
 * Cria o manipulador (middleware). O token vive apenas nesta closure (memória do servidor de desenvolvimento).
 * `gerarToken` e `limiteResposta` existem para os testes; o padrão usa node:crypto e 2 MB.
 */
export function criarManipuladorAdmin({ raiz, gerarToken = geradorPadrao, limiteResposta = LIMITE_RESPOSTA } = {}) {
  let token = null;
  const armazenamento = criarArmazenamento({ raiz });

  const tokenValido = (recebido) => {
    if (token === null || typeof recebido !== 'string' || !PADRAO_TOKEN.test(recebido)) return false;
    const a = crypto.createHash('sha256').update(recebido).digest();
    const b = crypto.createHash('sha256').update(token).digest();
    return crypto.timingSafeEqual(a, b);
  };

  const lerJson = (relativo) => {
    const r = armazenamento.lerJson(relativo);
    if (!r.ok) throw new Error('leitura');
    return r.dados;
  };

  function montarCatalogo() {
    const assuntos = lerJson('services/assuntos.json').assuntos;
    const registro = lerJson('services/registry.json').servicos;
    const servicos = registro.map((s) => {
      let nome = null;
      let sigla = null;
      const versao = localizarVersaoAtual(raiz, s.id);
      if (versao.ok) {
        try {
          const dados = lerJson(versao.arquivos.service);
          nome = typeof dados.nome === 'string' ? dados.nome : null;
          sigla = typeof dados.sigla === 'string' ? dados.sigla : null;
        } catch { /* nome e sigla ficam nulos */ }
      }
      return {
        id: s.id, assuntoId: s.assuntoId, nome, sigla, versaoAtualId: s.versaoAtualId, versaoPublicadaId: s.versaoPublicadaId,
        statusValidacao: s.statusValidacao, publicado: s.publicado,
      };
    });
    return { assuntos, servicos };
  }

  /** Devolve null se o id não está cadastrado; lança erro se a versão não puder ser lida com segurança. */
  function montarVersaoAtual(id) {
    const cadastrados = lerJson('services/registry.json').servicos.map((s) => s.id);
    if (!cadastrados.includes(id)) return null;
    const versao = localizarVersaoAtual(raiz, id);
    if (!versao.ok) throw new Error('versao');
    return {
      servicoId: id,
      versaoId: versao.versaoId,
      manifesto: lerJson(`${versao.pasta}/${NOME_DO_MANIFESTO}`),
      service: lerJson(versao.arquivos.service),
      roteiro: lerRoteiro(raiz, versao.arquivos.roteiro),
      documentos: lerJson(versao.arquivos.documentos),
      perguntasFrequentes: lerJson(versao.arquivos.perguntasFrequentes),
      fontes: lerJson(versao.arquivos.fontes),
      conteudoAssistente: lerJson(versao.arquivos.conteudoAssistente),
    };
  }

  return async function manipuladorAdmin(req, res, next) {
    const url = typeof req.url === 'string' ? req.url : '';
    const indice = url.indexOf('?');
    const caminho = indice === -1 ? url : url.slice(0, indice);
    if (!sobPrefixo(caminho)) return next();

    const responder = (status, corpo, cabecalhos = {}) => {
      res.statusCode = status;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
      for (const [nome, valor] of Object.entries(cabecalhos)) res.setHeader(nome, valor);
      res.end(JSON.stringify(corpo));
    };
    const responderJson = (corpo) => {
      const texto = JSON.stringify(corpo);
      if (Buffer.byteLength(texto, 'utf8') > limiteResposta) return responder(500, { erro: 'indisponivel' });
      return responder(200, corpo);
    };

    if (!origemPermitida(req)) return responder(403, { erro: 'acesso_somente_local' });
    if (req.method !== 'GET') return responder(405, { erro: 'metodo_nao_permitido' }, { Allow: 'GET' });
    const tamanho = req.headers['content-length'];
    if (indice !== -1 || (tamanho !== undefined && tamanho !== '0') || req.headers['transfer-encoding'] !== undefined) {
      return responder(400, { erro: 'requisicao_invalida' });
    }

    try {
      if (caminho === ROTA_SESSAO) {
        if (token === null) {
          const novo = gerarToken();
          if (typeof novo !== 'string' || !PADRAO_TOKEN.test(novo)) throw new Error('token');
          token = novo;
        }
        return responderJson({ token });
      }
      if (!tokenValido(req.headers[CABECALHO_TOKEN])) return responder(401, { erro: 'nao_autorizado' });
      if (caminho === ROTA_CATALOGO) return responderJson(montarCatalogo());
      const m = PADRAO_ROTA_VERSAO.exec(caminho);
      if (m) {
        const versao = montarVersaoAtual(m[1]);
        if (versao === null) return responder(404, { erro: 'nao_encontrado' });
        return responderJson(versao);
      }
      return responder(404, { erro: 'nao_encontrado' });
    } catch {
      return responder(500, { erro: 'indisponivel' });
    }
  };
}

/** Plugin do Vite: registra o endpoint administrativo somente no servidor de desenvolvimento (sem preview, sem build). */
export function criarPluginAdminDev({ raiz }) {
  return {
    name: 'sema-orienta-admin-dev',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(criarManipuladorAdmin({ raiz }));
    },
  };
}
