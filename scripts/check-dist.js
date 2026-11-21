// Confere que o build de produção (dist/) NÃO contém nenhum conteúdo de teste local.
// Uso: npm run build && node scripts/check-dist.js   (sai com código 1 se algo for encontrado)
// Procura: os textos dos blocos, a frase de escopo, a faixa de teste e os nomes internos do endpoint/conteúdo.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { selecionarBlocosAssistente } from '../services/assistant-content.js';
import { FRASE_ESCOPO, FAIXA_TESTE_LOCAL } from '../services/assistant-messages.js';
import { lerDadosDaBase } from '../services/assistant-endpoint.js';
import { localizarVersaoAtual } from '../services/versao-atual.js';
import { isDeepStrictEqual } from 'node:util';
import { PADRAO_ARQUIVO_PUBLICO, validarConteudoPublico } from '../services/publicacao-publica.js';
import { listarArquivosPublicados, PASTA_NO_DIST } from '../services/conteudo-publico-build.js';

export const NOMES_INTERNOS = ['/__assistente', '__assistente', 'teste_local', 'conteudo-assistente', 'assistant-content'];

// Nomes do módulo administrativo local (endpoint, token, versões e armazenamento): nada disso pode estar no build.
export const NOMES_ADMINISTRATIVOS = [
  '/__admin', '__admin/', 'x-admin-token', 'admin-endpoint', 'criarManipuladorAdmin', 'criarPluginAdminDev', 'services/admin',
  'admin-private', 'armazenamento.js', 'versao-atual', 'versoes/v1', 'hashConteudo',
  '/__admin/assuntos', 'executarTransacao', 'montarEsqueletoServico', 'montarAssunto', 'validarCorpoAssunto', 'validarCorpoServico',
  'cadastrarAssunto', 'cadastrarServico', 'sema-orienta-ensaio',
  // Tela "Gestão de conteúdo" (pasta admin/): textos, formulários e código.
  'Gestão de conteúdo', 'Ambiente administrativo local', 'admin-logic', 'criarClienteAdmin', 'Confirmar cadastro', 'Revisar cadastro',
  'form-assunto', 'form-servico', 'servico-termos', 'assunto-enviar', 'confirmacao-resumo',
  // Seção "Fontes do serviço" e o cadastro de fontes (rota, revisão, funções e textos).
  'form-fonte', 'fonte-enviar', 'fontes-servico', 'Fontes do serviço', 'Nova fonte', 'Origem oficial identifica', 'revisaoFontes', 'validarCorpoFonte', 'montarFonte',
  'urlNormalizada', 'cadastrarFonte', 'validarFormFonte', 'corpoDaFonte', 'resumoDaFonte', 'carregarFontes',
  // Saúde do sistema: rota, verificações e textos.
  '/__admin/saude', 'verificarSaude', 'carregarSaude', 'normalizarSaude', 'formatarDataHoraBr', 'saude-verificar', 'Saúde do sistema', 'Verificar novamente',
  // Usuários fictícios, matriz de permissões e login simulado (Sprint 8, Passos 8A e 8B): nomes, ids, módulos e textos da tela.
  'Maria Silva', 'Carlos Silva', 'maria-silva', 'carlos-silva', 'USUARIOS_SELECIONAVEIS', 'atores.js', 'permissoes.js', 'sessao.js',
  'Trocar usuário', 'normalizarSessao',
  // Permissões aplicadas (Sprint 8, Passo 8C): módulo das ações por rota, códigos dos registros e da recusa, e a ajuda da tela.
  'acoes-das-rotas', 'perfil_sem_permissao', 'acao_negada', 'ajuda-perfil', 'aplicarPermissoesDoPerfil',
];

// Servidor MCP local (scripts/mcp/): caminho, nome do servidor, ferramentas e pontos de entrada nunca podem estar no build.
export const NOMES_MCP = [
  'scripts/mcp', 'sema-orienta-base', 'listar_assuntos', 'listar_servicos', 'consultar_fontes', 'resumir_base', 'criarServidorMcp',
  'mcp/iniciar.js', 'mcp/servidor.js',
];

// Página "Informações do chatbot" e blocos de conhecimento (Sprint 3): rotas, textos da tela e módulos administrativos.
// Só termos específicos: nada que possa existir legitimamente no chat público (por isso não há "conhecimento" nem "informação" soltos).
export const NOMES_CONHECIMENTO = [
  '/admin/conteudo', 'admin/conteudo', '/conhecimentos', 'conteudo/conteudo.js',
  'Informações do chatbot', 'Tema da informação', 'Informação que o chatbot pode usar', 'Documentos ou links usados', 'Fontes que comprovam a informação',
  'Onde esta informação aparece na fonte', 'Conferir antes de salvar', 'Excluir informação',
  'form-bloco', 'bloco-titulo', 'bloco-texto', 'bloco-alertas', 'bloco-fontes', 'bloco-enviar',
  'services/admin/conhecimento', 'conhecimento.js', 'montarBlocoConhecimento', 'alterarBlocoConhecimento', 'removerBlocoConhecimento',
  'prepararBlocosParaNovaVersao', 'validarEntradaConhecimento', 'validarBlocoConhecimento', 'LIMITES_CONHECIMENTO',
  'gravarConhecimento', 'carregarConhecimento', 'resumirConhecimento', 'validarFormConhecimento', 'corpoDoConhecimento', 'resumoDoConhecimento',
  'criarConhecimento', 'alterarConhecimento', 'removerConhecimento', 'estruturaDeConhecimentoValida',
];

// Entradas de texto (Sprint 4, Passo 4B1): arquivo, módulos e funções administrativas. O texto de cada entrada também é termo proibido.
export const NOMES_ENTRADAS = [
  'entradas.json', 'entradas-gravacao', 'services/admin/entradas', 'services/schemas/entradas', 'validarCorpoEntradaTexto', 'prepararEntradaTexto',
  'validarArquivoEntradas', 'copiarEntradasParaNovaVersao', 'acrescentarEntradasAoEsqueleto', 'gravarEntradaTexto', 'hashTexto',
  'texto_cadastrado', 'formaEntrada', 'entradaId',
];

/** Textos de todos os entradas.json de services/ (qualquer serviço e versão), inteiros e em trechos de frase. */
function termosDeEntradas(raiz) {
  const termos = [];
  const servicos = path.join(raiz, 'services');
  if (!fs.existsSync(servicos)) return termos;
  for (const arquivo of listar(servicos)) {
    if (path.basename(arquivo) !== 'entradas.json') continue;
    let doc;
    try { doc = JSON.parse(fs.readFileSync(arquivo, 'utf8')); } catch { continue; }
    for (const e of Array.isArray(doc?.entradas) ? doc.entradas : []) {
      if (typeof e?.texto !== 'string' || e.texto.trim() === '') continue;
      // Texto muito curto daria falso positivo permanente (ocorreria em qualquer arquivo): só entra a partir de 30 caracteres.
      if (e.texto.trim().length >= 30) termos.push({ origem: 'texto de entrada', texto: e.texto });
      for (const frase of e.texto.split(/(?<=[.:;!?])\s+|\n+/)) if (frase.trim().length > 30) termos.push({ origem: 'trecho de texto de entrada', texto: frase.trim() });
    }
  }
  return termos;
}

/** Lista os arquivos de um diretório, recursivamente. */
function listar(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const completo = path.join(dir, e.name);
    return e.isDirectory() ? listar(completo) : [completo];
  });
}

/** Conteúdo do catálogo e da versão atual (servido só pelo endpoint administrativo): assunto, id da versão e descrição do serviço. */
function termosAdministrativos(raiz) {
  const lerJson = (...p) => JSON.parse(fs.readFileSync(path.join(raiz, ...p), 'utf8'));
  const termos = [];
  for (const a of lerJson('services', 'assuntos.json').assuntos) {
    termos.push({ origem: 'assunto (id)', texto: a.id }, { origem: 'assunto (nome)', texto: a.nome }, ...(typeof a.descricao === 'string' && a.descricao !== '' ? [{ origem: 'assunto (descrição)', texto: a.descricao }] : []));
  }
  for (const s of lerJson('services', 'registry.json').servicos) {
    termos.push({ origem: 'versão atual (id)', texto: s.versaoAtualId });
    const versao = localizarVersaoAtual(raiz, s.id);
    if (versao.ok) {
      const servico = lerJson(...versao.arquivos.service.split('/'));
      if (typeof servico.descricao === 'string') termos.push({ origem: `descrição de ${s.id}`, texto: servico.descricao });
    }
  }
  return termos;
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
  for (const nome of NOMES_ADMINISTRATIVOS) termos.push({ origem: 'nome administrativo', texto: nome });
  for (const nome of NOMES_MCP) termos.push({ origem: 'nome do servidor MCP', texto: nome });
  for (const nome of NOMES_CONHECIMENTO) termos.push({ origem: 'informações do chatbot (administração)', texto: nome });
  for (const nome of NOMES_ENTRADAS) termos.push({ origem: 'entradas de texto (administração)', texto: nome });
  termos.push(...termosAdministrativos(raiz), ...termosDeEntradas(raiz));
  return termos;
}

/** Retorna a lista de ocorrências encontradas em `dist` (vazia quando o build está limpo). */
// Origens de termos que são NOMES (não textos de conteúdo): valem também para o arquivo de conteúdo público autorizado.
const ORIGENS_DE_NOMES = new Set(['nome interno', 'nome administrativo', 'nome do servidor MCP', 'informações do chatbot (administração)', 'entradas de texto (administração)']);

/**
 * Arquivos públicos autorizados: os apontados por versaoPublicadaId de cada serviço, validados pela leitura segura.
 * Retorna { permitidos: Map(nome -> conteudo), erro } (erro = true se algum serviço publicado tiver conteúdo inválido).
 */
function arquivosPublicosAutorizados(raiz) {
  try {
    return { permitidos: new Map(listarArquivosPublicados(raiz).map((a) => [a.nome, a.conteudo])), erro: false };
  } catch {
    return { permitidos: new Map(), erro: true };
  }
}

/** Confere um arquivo de conteúdo público dentro do dist/: nome pelo hash, esquema fechado, integridade e igualdade com o autorizado. */
function arquivoPublicoValido(arquivo, relativo, permitidos) {
  if (relativo.length !== 2 || relativo[0] !== PASTA_NO_DIST || !PADRAO_ARQUIVO_PUBLICO.test(relativo[1]) || !permitidos.has(relativo[1])) return false;
  try {
    const obj = JSON.parse(fs.readFileSync(arquivo, 'utf8'));
    return validarConteudoPublico(obj).length === 0 && isDeepStrictEqual(obj, permitidos.get(relativo[1]));
  } catch {
    return false;
  }
}

export function conferirDist(raiz) {
  const dist = path.join(raiz, 'dist');
  if (!fs.existsSync(dist)) throw new Error('dist/ não encontrado: rode "npm run build" antes.');
  const termos = termosProibidos(raiz);
  const encontrados = [];
  const { permitidos, erro } = arquivosPublicosAutorizados(raiz);
  if (erro) encontrados.push({ arquivo: 'services/', origem: 'conteúdo público inválido', texto: 'serviço publicado sem arquivo público válido' });
  for (const arquivo of listar(dist)) {
    // A pasta admin/ e seus arquivos nunca podem estar no build.
    const relativo = path.relative(dist, arquivo).split(path.sep);
    if (relativo.includes('admin') || relativo.some((parte) => /^admin[-.]/.test(parte))) {
      encontrados.push({ arquivo: path.relative(raiz, arquivo), origem: 'arquivo administrativo', texto: relativo.join('/') });
    }
    // Nenhum arquivo dentro de uma pasta "mcp" pode estar no build.
    if (relativo.slice(0, -1).includes('mcp')) {
      encontrados.push({ arquivo: path.relative(raiz, arquivo), origem: 'arquivo do servidor MCP', texto: relativo.join('/') });
    }
    // Conteúdo público: só o arquivo autorizado, identificado pelo hash, válido e idêntico ao publicado; qualquer outro é recusado.
    const ehPublicoAutorizado = arquivoPublicoValido(arquivo, relativo, permitidos);
    if (!ehPublicoAutorizado && (relativo[0] === PASTA_NO_DIST || PADRAO_ARQUIVO_PUBLICO.test(relativo[relativo.length - 1]))) {
      encontrados.push({ arquivo: path.relative(raiz, arquivo), origem: 'conteúdo público não autorizado ou inválido', texto: relativo.join('/') });
      continue;
    }
    const conteudo = fs.readFileSync(arquivo, 'utf8');
    for (const { origem, texto } of termos) {
      if (ehPublicoAutorizado && !ORIGENS_DE_NOMES.has(origem)) continue; // o texto publicado é legítimo neste arquivo
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
