// Hook de proteção do Claude Code (Sprint 6, Passo 6A).
//
// Chamado pelo Claude Code (configuração em .claude/settings.json):
//   - antes de cada gravação, edição ou comando do assistente (PreToolUse): decide se a ação é bloqueada;
//   - ao fim de cada resposta (Stop, opção --aviso-fim): só avisa se houver mudança nos dados da base.
//
// Vale só para as ações do assistente. Os testes automatizados, o `npm run dev` e os comandos da
// usuária não passam por aqui. A análise de comandos é aproximada e não substitui a revisão humana.
//
// Regras:
//   A1  gravar/editar arquivo de dados da base (registry.json, assuntos.json, services/<serviço>/, data/);
//   A2  comando que apague, mova, sobrescreva ou crie arquivo nesses mesmos caminhos;
//   A3  git push forçado;
//   A4  git add de caminho proibido, git add -f, git add . / -A / --all;
//   A5  alterar o próprio hook, as configurações do Claude Code ou o arquivo de liberação;
//   A6  aviso ao fim da resposta (não bloqueia);
//   A7  git commit --no-verify / -n e desativação de hooks com git -c core.hooksPath.
//   A0  pedido que não pode ser interpretado (JSON inválido, sem ferramenta, caminho ou comando): bloqueado por padrão.
// A1 e A2 podem ser liberadas por prazo curto pelo arquivo .claude/liberacao-protecao.json,
// criado só pela usuária (modelo em docs/ADMINISTRACAO.md). As demais regras nunca são liberadas.

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const RAIZ_PROJETO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const ARQUIVO_LIBERACAO = '.claude/liberacao-protecao.json';
export const PRAZO_MAXIMO_MS = 2 * 60 * 60 * 1000;

const PASTAS_DE_CODIGO_EM_SERVICES = new Set(['admin', 'schemas']);
const DADOS_NA_RAIZ_DE_SERVICES = new Set(['registry.json', 'assuntos.json']);
const CAMINHOS_DO_HOOK = ['.claude/settings.json', '.claude/settings.local.json', ARQUIVO_LIBERACAO];
const PASTAS_DO_HOOK = ['scripts/hooks', '.githooks'];

export const MENSAGENS = Object.freeze({
  A0: 'Bloqueado: não foi possível validar esta ação. Tente novamente ou peça liberação.',
  A1: 'Bloqueado (A1): o assistente não grava diretamente nos dados da base (services/registry.json, services/assuntos.json, pastas dos serviços ou data/). Use uma cópia temporária fora do projeto ou peça à usuária uma liberação por prazo curto.',
  A2: 'Bloqueado (A2): este comando altera os dados da base. Para desfazer mudanças, use git restore. Se a alteração for necessária, peça à usuária uma liberação por prazo curto.',
  A3: 'Bloqueado (A3): push forçado é proibido neste projeto.',
  A4: 'Bloqueado (A4): adicione só os arquivos do passo, um a um. data/, dist/, node_modules/, .env, vídeos (.webm), "git add -f", "git add .", "-A" e "--all" não são permitidos.',
  A5: 'Bloqueado (A5): o assistente não pode alterar o próprio hook de proteção, as configurações do Claude Code nem o arquivo de liberação.',
  A6: 'Atenção: há mudanças não commitadas nos dados da base (services/) ou a pasta data/ existe. Pela regra 11 do CLAUDE.md, restaure pelo Git ou peça autorização à usuária para manter.',
  A7: 'Bloqueado (A7): o assistente não pode pular nem desativar os hooks do Git (--no-verify, -n ou core.hooksPath).',
});

// ---------- caminhos ----------

function normalizar(texto) {
  return String(texto).replace(/\\/g, '/');
}

// Caminho relativo à raiz do projeto, com "/" e em minúsculas; null se estiver fora do projeto.
export function relativoAoProjeto(alvo, { raiz, cwd }) {
  if (typeof alvo !== 'string' || alvo.trim() === '') return null;
  const base = cwd || raiz;
  const absoluto = path.resolve(base, normalizar(alvo.trim()));
  const relativo = normalizar(path.relative(raiz, absoluto));
  if (relativo === '') return '';
  if (relativo.startsWith('..') || path.isAbsolute(relativo)) return null;
  return relativo.replace(/\/+$/, '').toLowerCase();
}

// Dados da base: registry.json, assuntos.json, a pasta de cada serviço, a própria pasta services/ e data/.
export function ehCaminhoDeDados(relativo) {
  if (relativo === null) return false;
  const partes = relativo.split('/').filter(Boolean);
  if (partes.length === 0) return false;
  if (partes[0] === 'data') return true;
  if (partes[0] !== 'services') return false;
  if (partes.length === 1) return true;
  if (partes.length === 2 && !PASTAS_DE_CODIGO_EM_SERVICES.has(partes[1])) {
    // services/<arquivo>: só registry.json e assuntos.json são dados; services/<pasta>: pasta de serviço.
    return DADOS_NA_RAIZ_DE_SERVICES.has(partes[1]) || !partes[1].includes('.');
  }
  return !PASTAS_DE_CODIGO_EM_SERVICES.has(partes[1]);
}

export function ehCaminhoDoHook(relativo) {
  if (relativo === null) return false;
  if (CAMINHOS_DO_HOOK.includes(relativo)) return true;
  return PASTAS_DO_HOOK.some((pasta) => relativo === pasta || relativo.startsWith(`${pasta}/`));
}

// ---------- liberação ----------

// Lê e valida .claude/liberacao-protecao.json. Devolve { escopo: [...] } ou null (sem liberação válida).
export function lerLiberacao({ raiz, agora = new Date(), sistema = fs } = {}) {
  let bruto;
  try {
    bruto = sistema.readFileSync(path.join(raiz, ARQUIVO_LIBERACAO), 'utf8');
  } catch {
    return null;
  }
  let dados;
  try {
    dados = JSON.parse(bruto);
  } catch {
    return null;
  }
  return validarLiberacao(dados, { raiz, agora });
}

export function validarLiberacao(dados, { raiz, agora = new Date() } = {}) {
  if (!dados || typeof dados !== 'object' || Array.isArray(dados)) return null;
  if (typeof dados.motivo !== 'string' || dados.motivo.trim() === '') return null;
  const limite = Date.parse(dados.validoAte);
  if (!Number.isFinite(limite)) return null;
  const agoraMs = agora.getTime();
  if (limite <= agoraMs || limite - agoraMs > PRAZO_MAXIMO_MS) return null;
  if (!Array.isArray(dados.escopo) || dados.escopo.length === 0) return null;
  const escopo = [];
  for (const item of dados.escopo) {
    const relativo = relativoAoProjeto(item, { raiz, cwd: raiz });
    // Cada item precisa ser um caminho de dados específico: nunca a pasta services/ inteira nem data/ inteira por engano.
    if (!relativo || relativo === 'services' || !ehCaminhoDeDados(relativo)) return null;
    escopo.push(relativo);
  }
  return { escopo };
}

function liberado(relativo, liberacao) {
  if (!liberacao) return false;
  return liberacao.escopo.some((item) => relativo === item || relativo.startsWith(`${item}/`));
}

// ---------- comandos ----------

// Divide a linha de comando em trechos (;, &&, ||, | e quebras de linha) e cada trecho em palavras,
// respeitando aspas simples e duplas. Redirecionamentos (> e >>) viram palavras próprias.
export function dividirComando(comando) {
  const trechos = [];
  let palavras = [];
  let atual = '';
  let temAtual = false;
  let aspas = null;
  const fecharPalavra = () => {
    if (temAtual) palavras.push(atual);
    atual = '';
    temAtual = false;
  };
  const fecharTrecho = () => {
    fecharPalavra();
    if (palavras.length) trechos.push(palavras);
    palavras = [];
  };
  const texto = String(comando);
  for (let i = 0; i < texto.length; i += 1) {
    const c = texto[i];
    if (aspas) {
      if (c === aspas) aspas = null;
      else atual += c;
      continue;
    }
    if (c === '"' || c === "'") {
      aspas = c;
      temAtual = true;
      continue;
    }
    if (c === ';' || c === '\n' || c === '\r' || c === '|' || c === '&') {
      fecharTrecho();
      continue;
    }
    if (c === '>') {
      fecharPalavra();
      if (texto[i + 1] === '>') i += 1;
      palavras.push('>');
      continue;
    }
    if (/\s/.test(c)) {
      fecharPalavra();
      continue;
    }
    atual += c;
    temAtual = true;
  }
  fecharTrecho();
  return trechos;
}

// Comandos que alteram arquivos. "destino": só o último caminho é gravado (cópia); "todos": todos os caminhos.
const COMANDOS_QUE_ALTERAM = new Map([
  ...['rm', 'rmdir', 'del', 'erase', 'rd', 'ri', 'remove-item', 'unlink', 'touch', 'mkdir', 'md', 'ni', 'new-item',
    'truncate', 'tee', 'set-content', 'sc', 'add-content', 'ac', 'out-file', 'clear-content', 'clc', 'rename-item',
    'ren', 'rni', 'mv', 'move', 'mi', 'move-item', 'chmod', 'chown', 'ln'].map((nome) => [nome, 'todos']),
  ...['cp', 'copy', 'cpi', 'copy-item', 'xcopy', 'robocopy', 'rsync', 'install'].map((nome) => [nome, 'destino']),
]);

function nomeDoComando(palavra) {
  return path.basename(normalizar(palavra)).toLowerCase().replace(/\.exe$/, '');
}

function argumentosDeCaminho(palavras) {
  const resultado = [];
  for (let i = 1; i < palavras.length; i += 1) {
    const p = palavras[i];
    if (p === '>') continue;
    if (/^-(destination|path|literalpath|filepath)$/i.test(p)) continue;
    if (p.startsWith('-')) continue;
    resultado.push(p);
  }
  return resultado;
}

// Caminhos que um trecho de comando grava (aproximado).
export function caminhosGravadosPeloTrecho(palavras) {
  const gravados = [];
  palavras.forEach((p, i) => {
    if (p === '>' && palavras[i + 1]) gravados.push(palavras[i + 1]);
  });
  let inicio = 0;
  while (inicio < palavras.length && /^(sudo|command|env)$/i.test(palavras[inicio])) inicio += 1;
  const nome = nomeDoComando(palavras[inicio] || '');
  const resto = palavras.slice(inicio);
  if (nome === 'sed' && resto.some((p) => /^-i/.test(p) || p === '--in-place')) {
    gravados.push(...argumentosDeCaminho(resto).slice(1));
  }
  const modo = COMANDOS_QUE_ALTERAM.get(nome);
  if (modo) {
    const destinoExplicito = resto.findIndex((p) => /^-destination$/i.test(p));
    if (destinoExplicito >= 0 && resto[destinoExplicito + 1]) {
      gravados.push(resto[destinoExplicito + 1]);
      if (modo === 'todos') gravados.push(...argumentosDeCaminho(resto.slice(0, destinoExplicito)));
    } else {
      const caminhos = argumentosDeCaminho(resto);
      if (modo === 'todos') gravados.push(...caminhos);
      else if (caminhos.length) gravados.push(caminhos[caminhos.length - 1]);
    }
  }
  return gravados;
}

// Separa "git [opções globais] <subcomando> <argumentos>".
export function analisarGit(palavras) {
  if (!palavras.length || nomeDoComando(palavras[0]) !== 'git') return null;
  const configuracoes = [];
  let i = 1;
  while (i < palavras.length && palavras[i].startsWith('-')) {
    const opcao = palavras[i];
    if (opcao === '-c' || opcao === '-C' || opcao === '--git-dir' || opcao === '--work-tree' || opcao === '--namespace') {
      if (opcao === '-c') configuracoes.push(palavras[i + 1] || '');
      i += 2;
      continue;
    }
    if (opcao.startsWith('--config-env')) configuracoes.push(opcao);
    i += 1;
  }
  return { configuracoes, subcomando: (palavras[i] || '').toLowerCase(), argumentos: palavras.slice(i + 1) };
}

function caminhoProibidoNoAdd(relativo) {
  if (relativo === null) return false;
  const partes = relativo.split('/');
  if (['data', 'dist', 'node_modules'].includes(partes[0])) return true;
  const nome = partes[partes.length - 1];
  return nome === '.env' || nome.startsWith('.env.') || nome.endsWith('.webm');
}

function avaliarGit(git, contexto, liberacao) {
  if (git.configuracoes.some((c) => /hookspath/i.test(c))) return 'A7';
  const { subcomando, argumentos } = git;
  if (subcomando === 'push') {
    if (argumentos.some((a) => a === '-f' || /^--force(-with-lease|-if-includes)?(=|$)/.test(a) || (/^-[a-z]+$/i.test(a) && !a.startsWith('--') && a.includes('f')))) return 'A3';
    if (argumentos.some((a) => a.startsWith('+') && a.length > 1)) return 'A3';
  }
  if (subcomando === 'commit') {
    if (argumentos.includes('--no-verify')) return 'A7';
    for (const a of argumentos) {
      if (!/^-[a-z]+$/i.test(a)) continue;
      // Em um grupo como "-anm", as letras que vêm antes de uma opção com valor (m, F, c, C, t) são opções.
      const letras = a.slice(1).split('');
      for (const letra of letras) {
        if (letra === 'n') return 'A7';
        if ('mFcCt'.includes(letra)) break;
      }
    }
  }
  if (subcomando === 'add') {
    for (const a of argumentos) {
      if (a === '--') continue;
      if (['-f', '--force', '-A', '--all', '.', './', ':/', '*'].includes(a)) return 'A4';
      if (/^-[a-z]+$/i.test(a) && a.includes('f')) return 'A4';
      if (a.startsWith('-')) continue;
      if (caminhoProibidoNoAdd(relativoAoProjeto(a, contexto))) return 'A4';
    }
  }
  if (subcomando === 'config' && argumentos.some((a) => /hookspath/i.test(a))) return 'A7';
  if (subcomando === 'rm' || subcomando === 'mv') {
    for (const a of argumentos) {
      if (a.startsWith('-')) continue;
      const relativo = relativoAoProjeto(a, contexto);
      if (ehCaminhoDoHook(relativo)) return 'A5';
      if (ehCaminhoDeDados(relativo) && !liberado(relativo, liberacao)) return 'A2';
    }
  }
  return null;
}

function avaliarComando(comando, contexto, liberacao) {
  for (const palavras of dividirComando(comando)) {
    const git = analisarGit(palavras);
    if (git) {
      const regra = avaliarGit(git, contexto, liberacao);
      if (regra) return regra;
      continue;
    }
    for (const caminho of caminhosGravadosPeloTrecho(palavras)) {
      const relativo = relativoAoProjeto(caminho, contexto);
      if (ehCaminhoDoHook(relativo)) return 'A5';
      if (ehCaminhoDeDados(relativo) && !liberado(relativo, liberacao)) return 'A2';
    }
  }
  return null;
}

// ---------- decisão ----------

const FERRAMENTAS_DE_ARQUIVO = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit']);
const FERRAMENTAS_DE_COMANDO = new Set(['Bash', 'PowerShell']);

const textoPreenchido = (valor) => typeof valor === 'string' && valor.trim() !== '';

// Recebe o pedido do Claude Code (PreToolUse) e devolve { bloquear, regra, mensagem }.
// Pedido que não pode ser interpretado (sem ferramenta, sem caminho ou sem comando) é bloqueado por padrão (A0).
export function avaliarAcao(entrada, { raiz = RAIZ_PROJETO, liberacao = null } = {}) {
  const permitir = { bloquear: false, regra: null, mensagem: '' };
  const bloquear = (regra) => ({ bloquear: true, regra, mensagem: MENSAGENS[regra] });
  if (!entrada || typeof entrada !== 'object' || Array.isArray(entrada) || !textoPreenchido(entrada.tool_name)) return bloquear('A0');
  const ferramenta = entrada.tool_name;
  const ehArquivo = FERRAMENTAS_DE_ARQUIVO.has(ferramenta);
  const ehComando = FERRAMENTAS_DE_COMANDO.has(ferramenta);
  if (!ehArquivo && !ehComando) return permitir;
  const dados = entrada.tool_input;
  if (!dados || typeof dados !== 'object' || Array.isArray(dados)) return bloquear('A0');
  const contexto = { raiz, cwd: textoPreenchido(entrada.cwd) ? entrada.cwd : raiz };
  let regra = null;
  if (ehArquivo) {
    const alvo = ferramenta === 'NotebookEdit' ? dados.notebook_path || dados.file_path : dados.file_path;
    if (!textoPreenchido(alvo)) return bloquear('A0');
    const relativo = relativoAoProjeto(alvo, contexto);
    if (ehCaminhoDoHook(relativo)) regra = 'A5';
    else if (ehCaminhoDeDados(relativo) && !liberado(relativo, liberacao)) regra = 'A1';
  } else {
    if (!textoPreenchido(dados.command)) return bloquear('A0');
    regra = avaliarComando(dados.command, contexto, liberacao);
  }
  return regra ? bloquear(regra) : permitir;
}

// A6: há mudança não commitada nos dados da base ou a pasta data/ existe?
export function verificarFimDaResposta({ raiz = RAIZ_PROJETO, executarGit, sistema = fs } = {}) {
  const git = executarGit || ((args) => execFileSync('git', args, { cwd: raiz, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }));
  let saida = '';
  try {
    saida = git(['status', '--porcelain', '--untracked-files=all', '--', 'services', 'data']);
  } catch {
    saida = '';
  }
  const mudouDados = saida.split(/\r?\n/).some((linha) => {
    const caminho = linha.slice(3).replace(/^"|"$/g, '').split(' -> ').pop();
    return linha.trim() !== '' && ehCaminhoDeDados(relativoAoProjeto(caminho, { raiz, cwd: raiz }));
  });
  const existeData = sistema.existsSync(path.join(raiz, 'data'));
  return mudouDados || existeData ? { avisar: true, mensagem: MENSAGENS.A6 } : { avisar: false, mensagem: '' };
}

// ---------- execução pelo Claude Code ----------

function lerEntradaPadrao() {
  try {
    return fs.readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

export function executar(argv = process.argv.slice(2)) {
  if (argv.includes('--aviso-fim')) {
    const { avisar, mensagem } = verificarFimDaResposta();
    if (avisar) process.stdout.write(`${JSON.stringify({ systemMessage: mensagem })}\n`);
    return 0;
  }
  let entrada;
  try {
    entrada = JSON.parse(lerEntradaPadrao());
  } catch {
    process.stderr.write(`${MENSAGENS.A0}\n`);
    return 2;
  }
  const liberacao = lerLiberacao({ raiz: RAIZ_PROJETO });
  const { bloquear, mensagem } = avaliarAcao(entrada, { raiz: RAIZ_PROJETO, liberacao });
  if (bloquear) {
    process.stderr.write(`${mensagem}\n`);
    return 2;
  }
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = executar();
}
