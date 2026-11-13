// Endpoint administrativo LOCAL (Marco 7, Passos 7D e 7E1). Existe apenas no servidor de desenvolvimento do Vite
// (`npm run dev`): o plugin usa apply: 'serve' e não há gancho de preview, então o build e o preview não o têm.
//
// Rotas de leitura (GET, sem query e sem corpo):
//   /__admin/sessao                       -> entrega o token da sessão (criado na primeira chamada, só em memória)
//   /__admin/catalogo                     -> assuntos e serviços, com versão atual e publicada (exige token)
//   /__admin/servicos/<id>/versao-atual   -> manifesto e arquivos modulares da versão atual (exige token)
// Rotas de cadastro (POST, JSON de até 32 KB, exigem token):
//   /__admin/assuntos                     -> cadastra um assunto (sempre ativo)
//   /__admin/servicos                     -> cadastra um serviço (versão 1 em rascunho, tudo PENDENTE)
//   /__admin/servicos/<id>/fontes         -> cadastra uma fonte (só em versão em rascunho; revisão otimista do arquivo de fontes)
//
// Este módulo NÃO tem autenticação de pessoas: o token só impede que outro site aberto no navegador use o endpoint.
// Não decide, não valida conteúdo, não publica e não exclui nada. Não lê dados privados (data/admin-private/); não usa
// cookies, armazenamento do navegador, variáveis de ambiente nem registro em log. Erros são códigos genéricos, sem
// caminho, token ou conteúdo. Toda gravação passa por transacao.js (tudo ou nada, com desfazer) e por uma trava que
// recusa gravações simultâneas com 409.

import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { criarArmazenamento } from './armazenamento.js';
import { ARQUIVOS_DA_VERSAO, localizarVersaoAtual, NOME_DO_MANIFESTO } from '../versao-atual.js';
import { executarTransacao } from './transacao.js';
import {
  LIMITE_CORPO, montarAssunto, montarEsqueletoServico, montarFonte, normalizarNome, urlNormalizada, validarCorpoAssunto, validarCorpoFonte,
  validarCorpoServico,
} from './cadastro.js';
import { hashConteudo } from './hash.js';
import { validarVersao } from './versao.js';
import {
  validarAssuntos, validarConteudoAssistente, validarDocumentos, validarFontes, validarPerguntas, validarServicos,
} from '../../scripts/validate-services.js';

export const PREFIXO_ADMIN = '/__admin';
export const ROTA_SESSAO = '/__admin/sessao';
export const ROTA_CATALOGO = '/__admin/catalogo';
export const ROTA_ASSUNTOS = '/__admin/assuntos';
export const ROTA_SERVICOS = '/__admin/servicos';
export const CABECALHO_TOKEN = 'x-admin-token';
export const LIMITE_RESPOSTA = 2 * 1024 * 1024;
export const LIMITE_TEXTO = 1024 * 1024;

const ORIGENS_LOCAIS = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
const PADRAO_HOST = /^(localhost|127\.0\.0\.1|\[::1\])(?::(\d{1,5}))?$/i;
const PADRAO_ROTA_VERSAO = /^\/__admin\/servicos\/([a-z][a-z0-9-]*)\/versao-atual$/;
const PADRAO_ROTA_FONTES = /^\/__admin\/servicos\/([a-z][a-z0-9-]*)\/fontes$/;
const PADRAO_TOKEN = /^[0-9a-f]{64}$/;
const PADRAO_ROTEIRO = /^services\/[a-z][a-z0-9-]*\/versoes\/v[1-9][0-9]*\/roteiro\.md$/;
const PADRAO_TIPO_JSON = /^application\/json(\s*;\s*charset=utf-8)?$/i;
const SEC_FETCH_PERMITIDOS = new Set(['same-origin', 'none']);

const geradorPadrao = () => crypto.randomBytes(32).toString('hex');
const sobPrefixo = (caminho) => caminho === PREFIXO_ADMIN || caminho.startsWith(`${PREFIXO_ADMIN}/`);

/** Data local AAAA-MM-DD a partir de um Date (o relógio é injetável nos testes). */
function dataLocal(d) {
  const dois = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${dois(d.getMonth() + 1)}-${dois(d.getDate())}`;
}

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

/** Lê o corpo da requisição. Acima do limite, o excedente é descartado (não guardado) e o resultado indica `excedeu`. */
async function lerCorpo(req, limite) {
  const partes = [];
  let total = 0;
  let excedeu = false;
  for await (const pedaco of req) {
    const bytes = Buffer.isBuffer(pedaco) ? pedaco : Buffer.from(pedaco);
    total += bytes.length;
    if (total > limite) excedeu = true;
    else partes.push(bytes);
  }
  return excedeu ? { excedeu: true } : { excedeu: false, texto: Buffer.concat(partes).toString('utf8') };
}

/** Validador do conteúdo de cada arquivo novo do serviço (a árvore inteira ainda é conferida pelo validador da base). */
function validadorDoArquivo(caminho, idServico) {
  const nome = caminho.slice(caminho.lastIndexOf('/') + 1);
  if (nome === NOME_DO_MANIFESTO) return (d) => validarVersao(d);
  if (nome === ARQUIVOS_DA_VERSAO.documentos) return (d) => validarDocumentos(d, { idServico });
  if (nome === ARQUIVOS_DA_VERSAO.perguntasFrequentes) return (d) => validarPerguntas(d, { idServico });
  if (nome === ARQUIVOS_DA_VERSAO.fontes) return (d) => validarFontes(d);
  if (nome === ARQUIVOS_DA_VERSAO.conteudoAssistente) return (d) => validarConteudoAssistente(d, { idServico });
  return () => [];
}

/**
 * Cria o manipulador (middleware). O token vive apenas nesta closure (memória do servidor de desenvolvimento).
 * Opções para os testes: `gerarToken`, `limiteResposta`, `agora` (relógio), `sistema` (módulo de arquivos usado nas gravações
 * reais), `diretorioTemporario`, `antesDeGravar` (gancho assíncrono dentro da trava) e `verificarFinal`.
 */
export function criarManipuladorAdmin({
  raiz,
  gerarToken = geradorPadrao,
  limiteResposta = LIMITE_RESPOSTA,
  agora = () => new Date(),
  sistema = fs,
  diretorioTemporario = os.tmpdir(),
  antesDeGravar,
  verificarFinal = (r) => validarServicos(r).erros,
} = {}) {
  let token = null;
  let escrevendo = false;
  const armazenamento = criarArmazenamento({ raiz, sistema });

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

  /** Nome do serviço, lido do service.json da versão atual (ou null). */
  function nomeDoServico(id) {
    const versao = localizarVersaoAtual(raiz, id);
    if (!versao.ok) return null;
    try {
      const dados = lerJson(versao.arquivos.service);
      return typeof dados.nome === 'string' ? dados.nome : null;
    } catch {
      return null;
    }
  }

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
    const fontes = lerJson(versao.arquivos.fontes);
    return {
      servicoId: id,
      versaoId: versao.versaoId,
      manifesto: lerJson(`${versao.pasta}/${NOME_DO_MANIFESTO}`),
      service: lerJson(versao.arquivos.service),
      roteiro: lerRoteiro(raiz, versao.arquivos.roteiro),
      documentos: lerJson(versao.arquivos.documentos),
      perguntasFrequentes: lerJson(versao.arquivos.perguntasFrequentes),
      fontes,
      // Revisão (SHA-256 do conteúdo) do arquivo de fontes: o cadastro de fontes exige que o cliente a devolva.
      revisaoFontes: hashConteudo(fontes),
      conteudoAssistente: lerJson(versao.arquivos.conteudoAssistente),
    };
  }

  /**
   * Aplica a alteração em duas etapas: 1) ensaio completo numa cópia temporária de services/, conferido pelo validador da
   * base; 2) gravação real, tudo ou nada, conferida de novo pelo validador. Falha em qualquer ponto desfaz tudo.
   */
  function aplicar(passos) {
    const tmp = fs.mkdtempSync(path.join(diretorioTemporario, 'sema-orienta-ensaio-'));
    try {
      fs.cpSync(path.join(raiz, 'services'), path.join(tmp, 'services'), { recursive: true });
      const ensaio = executarTransacao({ raiz: tmp, passos, verificar: () => validarServicos(tmp).erros });
      if (!ensaio.ok) return { ok: false, erro: 'dados_invalidos' };
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
    return executarTransacao({ raiz, sistema, passos, verificar: () => verificarFinal(raiz) });
  }

  const resultadoDaTransacao = (r) => {
    if (r.ok) return null;
    if (r.erro === 'dados_invalidos') return { status: 422, corpo: { erro: 'dados_invalidos' } };
    if (r.erro === 'ja_existe') return { status: 409, corpo: { erro: 'ja_existe' } };
    return { status: 500, corpo: { erro: 'indisponivel' } };
  };

  function cadastrarAssunto(dados) {
    const doc = lerJson('services/assuntos.json');
    if (doc.assuntos.some((a) => a.id === dados.id)) return { status: 409, corpo: { erro: 'ja_existe', campo: 'id' } };
    const nome = normalizarNome(dados.nome);
    if (doc.assuntos.some((a) => normalizarNome(a.nome) === nome)) return { status: 409, corpo: { erro: 'ja_existe', campo: 'nome' } };
    const assunto = montarAssunto(dados, dataLocal(agora()));
    const novo = { ...doc, assuntos: [...doc.assuntos, assunto] };
    const r = aplicar([{ caminho: 'services/assuntos.json', tipo: 'json', conteudo: novo, validar: (d) => validarAssuntos(d).erros }]);
    return resultadoDaTransacao(r) ?? { status: 201, corpo: { assunto } };
  }

  function cadastrarServico(dados) {
    const assunto = lerJson('services/assuntos.json').assuntos.find((a) => a.id === dados.assuntoId);
    if (!assunto || assunto.ativo !== true) return { status: 422, corpo: { erro: 'dados_invalidos', campos: ['assuntoId'] } };
    const registro = lerJson('services/registry.json');
    if (registro.servicos.some((s) => s.id === dados.id)) return { status: 409, corpo: { erro: 'ja_existe', campo: 'id' } };
    let pastaExiste = true;
    try {
      sistema.lstatSync(path.join(raiz, 'services', dados.id));
    } catch (e) {
      pastaExiste = !(e && e.code === 'ENOENT');
    }
    if (pastaExiste) return { status: 409, corpo: { erro: 'ja_existe', campo: 'id' } };
    const nome = normalizarNome(dados.nome);
    if (registro.servicos.some((s) => normalizarNome(nomeDoServico(s.id)) === nome)) return { status: 409, corpo: { erro: 'ja_existe', campo: 'nome' } };

    const esqueleto = montarEsqueletoServico(dados, assunto, dataLocal(agora()));
    const passos = [
      ...esqueleto.arquivos.map((a) => ({ caminho: a.caminho, tipo: a.tipo, conteudo: a.conteudo, novo: true, validar: validadorDoArquivo(a.caminho, dados.id) })),
      // O registro é gravado por último: é ele que torna o serviço visível.
      { caminho: 'services/registry.json', tipo: 'json', conteudo: { ...registro, servicos: [...registro.servicos, esqueleto.entradaRegistro] }, validar: () => [] },
    ];
    const r = aplicar(passos);
    const falha = resultadoDaTransacao(r);
    if (falha) return falha;
    const e = esqueleto.entradaRegistro;
    return {
      status: 201,
      corpo: { servico: { id: e.id, assuntoId: e.assuntoId, nome: dados.nome, sigla: dados.sigla, versaoAtualId: e.versaoAtualId, versaoPublicadaId: null, estado: 'rascunho', publicado: false } },
    };
  }

  /**
   * Cadastra uma fonte no arquivo de fontes da versão atual do serviço. Só em versão em rascunho e com a revisão informada
   * igual à atual (revisão otimista). A fonte nasce em rascunho, não publicada, e as existentes não são alteradas.
   */
  function cadastrarFonte(servicoId, dados) {
    const versao = localizarVersaoAtual(raiz, servicoId);
    if (!versao.ok) throw new Error('versao');
    if (lerJson(`${versao.pasta}/${NOME_DO_MANIFESTO}`).estado !== 'rascunho') return { status: 409, corpo: { erro: 'versao_nao_editavel' } };
    const doc = lerJson(versao.arquivos.fontes);
    if (hashConteudo(doc) !== dados.revisao) return { status: 409, corpo: { erro: 'revisao_divergente' } };
    if (doc.fontes.some((f) => f.id === dados.id)) return { status: 409, corpo: { erro: 'ja_existe', campo: 'id' } };
    const normalizada = urlNormalizada(dados.url);
    if (doc.fontes.some((f) => urlNormalizada(f.url) === normalizada)) return { status: 409, corpo: { erro: 'ja_existe', campo: 'url' } };
    const fonte = montarFonte(dados, dataLocal(agora()));
    const novo = { ...doc, fontes: [...doc.fontes, fonte] };
    const r = aplicar([{ caminho: versao.arquivos.fontes, tipo: 'json', conteudo: novo, validar: (d) => validarFontes(d) }]);
    return resultadoDaTransacao(r) ?? { status: 201, corpo: { fonte, revisao: hashConteudo(novo) } };
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
    const rotaDeFontes = PADRAO_ROTA_FONTES.exec(caminho);
    const rotaDeCadastro = caminho === ROTA_ASSUNTOS || caminho === ROTA_SERVICOS || rotaDeFontes !== null;
    const metodoEsperado = rotaDeCadastro ? 'POST' : 'GET';
    if (req.method !== metodoEsperado) return responder(405, { erro: 'metodo_nao_permitido' }, { Allow: metodoEsperado });
    const tamanho = req.headers['content-length'];
    if (indice !== -1) return responder(400, { erro: 'requisicao_invalida' });
    if (!rotaDeCadastro && ((tamanho !== undefined && tamanho !== '0') || req.headers['transfer-encoding'] !== undefined)) {
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

      if (rotaDeCadastro) {
        if (rotaDeFontes !== null && !lerJson('services/registry.json').servicos.some((s) => s.id === rotaDeFontes[1])) {
          return responder(404, { erro: 'nao_encontrado' });
        }
        if (typeof req.headers['content-type'] !== 'string' || !PADRAO_TIPO_JSON.test(req.headers['content-type'])) {
          return responder(415, { erro: 'tipo_nao_suportado' });
        }
        if (tamanho !== undefined && !/^\d{1,10}$/.test(tamanho)) return responder(400, { erro: 'requisicao_invalida' });
        if (tamanho !== undefined && Number(tamanho) > LIMITE_CORPO) return responder(413, { erro: 'corpo_grande_demais' }, { Connection: 'close' });
        const lido = await lerCorpo(req, LIMITE_CORPO);
        if (lido.excedeu) return responder(413, { erro: 'corpo_grande_demais' }, { Connection: 'close' });
        let corpo;
        try {
          corpo = JSON.parse(lido.texto);
        } catch {
          return responder(400, { erro: 'requisicao_invalida' });
        }
        const validacao = rotaDeFontes !== null ? validarCorpoFonte(corpo) : caminho === ROTA_ASSUNTOS ? validarCorpoAssunto(corpo) : validarCorpoServico(corpo);
        if (!validacao.ok) return responder(422, { erro: 'dados_invalidos', campos: validacao.campos });

        // Uma gravação por vez: se outra estiver em andamento, esta é recusada (nada é enfileirado nem perdido).
        if (escrevendo) return responder(409, { erro: 'operacao_em_andamento' });
        escrevendo = true;
        let resultado;
        try {
          if (antesDeGravar) await antesDeGravar();
          resultado = rotaDeFontes !== null
            ? cadastrarFonte(rotaDeFontes[1], validacao.dados)
            : caminho === ROTA_ASSUNTOS ? cadastrarAssunto(validacao.dados) : cadastrarServico(validacao.dados);
        } finally {
          escrevendo = false;
        }
        return responder(resultado.status, resultado.corpo);
      }

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
