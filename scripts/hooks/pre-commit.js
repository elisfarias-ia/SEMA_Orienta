// Pre-commit do Git (Sprint 6, Passo 6B). Chamado por .githooks/pre-commit em todo commit, para qualquer pessoa,
// depois de ativado uma vez por clone com "npm run hooks:instalar" (git config core.hooksPath .githooks).
//
// Analisa só o que está sendo commitado (a área de preparação do Git) e aplica as regras B1 a B5 de regras.js.
// Se algo não puder ser lido ou interpretado, o commit é bloqueado por padrão (B0).
// Limites: "git commit --no-verify" pula este hook (o assistente é impedido pela regra A7 do hook do Claude Code
// e a verificação no GitHub, Passo 6D, cobre o restante); o build da regra B5 usa os arquivos da pasta de trabalho.

import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  ARQUIVO_AUTORIZACOES,
  MENSAGENS,
  afetaBuild,
  ehArquivoProibido,
  formatarAchado,
  linhasAdicionadas,
  validarAutorizacoes,
  verificarLinhas,
  verificarManifesto,
  verificarPublico,
  verificarRegistro,
  verificarRegistroContraRevogadas,
  verificarRemocaoPublica,
} from './regras.js';

const TAMANHO_MAXIMO = 64 * 1024 * 1024;

export function criarGit(raiz) {
  return (args, { permitirFalha = false } = {}) => {
    try {
      return execFileSync('git', args, { cwd: raiz, encoding: 'utf8', maxBuffer: TAMANHO_MAXIMO, stdio: ['ignore', 'pipe', 'ignore'] });
    } catch (erro) {
      if (permitirFalha) return null;
      throw erro;
    }
  };
}

// Executa o build e o check-dist na raiz. Devolve true se os dois passarem.
export function executarBuild(raiz) {
  const build = spawnSync('npm', ['run', 'build'], { cwd: raiz, shell: process.platform === 'win32', stdio: 'ignore' });
  if (build.status !== 0) return false;
  const conferencia = spawnSync(process.execPath, [path.join(raiz, 'scripts', 'check-dist.js')], { cwd: raiz, stdio: 'ignore' });
  return conferencia.status === 0;
}

// Lê a saída de "git diff --name-status --no-renames -z": [{ status, caminho }].
export function lerListaDeArquivos(saida) {
  const partes = String(saida).split('\0').filter((p) => p !== '');
  const arquivos = [];
  for (let i = 0; i + 1 < partes.length; i += 2) arquivos.push({ status: partes[i].charAt(0), caminho: partes[i + 1] });
  return arquivos;
}

// Arquivos preparados para o commit: [{ status, caminho }] (sem renomeações: viram exclusão + inclusão).
export function arquivosPreparados(git) {
  return lerListaDeArquivos(git(['diff', '--cached', '--name-status', '--no-renames', '-z']));
}

// Aplica as regras B0 a B5 a um conjunto de alterações. Usada pelo pre-commit (área de preparação) e pela
// verificação da PR no GitHub (diferença entre o main e a PR), para que as duas sigam exatamente a mesma lógica.
//   arquivos: [{ status, caminho }]; lerAntes/lerDepois(caminho): texto ou null; diffDoArquivo(caminho): saída do git diff -U0;
//   listarDepois(prefixo): caminhos que existem depois da mudança sob o prefixo (Sprint 7, Passo 7D; sem ela, remoção de arquivo
//   público é recusada).
export function analisarAlteracoes({ arquivos, lerAntes, lerDepois, diffDoArquivo, listarDepois = () => [], executarBuild: build = () => true }) {
  const autorizacoes = validarAutorizacoes(lerDepois(ARQUIVO_AUTORIZACOES));
  if (!autorizacoes.ok) return [{ regra: 'B0', arquivo: ARQUIVO_AUTORIZACOES }];
  const { publicacoes } = autorizacoes;

  const achados = [];
  let precisaBuild = false;
  let conferirRegistro = false;
  for (const { status, caminho } of arquivos) {
    if (caminho === 'services/registry.json' || /^services\/[^/]+\/versoes\/[^/]+\/versao\.json$/.test(caminho)) conferirRegistro = true;
    if (status === 'D') {
      // Remoção de arquivo público (B1R): só com a versão correspondente revogada. Demais remoções seguem livres.
      const publico = /^services\/([^/]+)\/publico\/[^/]+$/.exec(caminho);
      if (publico) {
        let manifestos;
        try {
          manifestos = listarDepois(`services/${publico[1]}/versoes/`).filter((c) => c.endsWith('/versao.json')).map((c) => lerDepois(c));
        } catch {
          achados.push({ regra: 'B0', arquivo: caminho });
          continue;
        }
        const remocao = verificarRemocaoPublica(caminho, manifestos);
        if (remocao) achados.push(remocao);
      }
      continue;
    }
    if (ehArquivoProibido(caminho)) {
      achados.push({ regra: 'B3', arquivo: caminho });
      continue;
    }
    const publico = verificarPublico(caminho, publicacoes);
    if (publico) achados.push(publico);
    if (caminho === 'services/registry.json') achados.push(...verificarRegistro(lerAntes(caminho), lerDepois(caminho), publicacoes));
    const manifesto = verificarManifesto(caminho, lerAntes(caminho), lerDepois(caminho), publicacoes);
    if (manifesto) achados.push(manifesto);
    let diff;
    try {
      diff = diffDoArquivo(caminho);
    } catch {
      achados.push({ regra: 'B0', arquivo: caminho });
      continue;
    }
    achados.push(...verificarLinhas(caminho, linhasAdicionadas(diff)));
    if (afetaBuild(caminho)) precisaBuild = true;
  }
  // Coerência da revogação (B2R): o registro, como fica depois da mudança, não aponta para versão revogada.
  if (conferirRegistro) achados.push(...verificarRegistroContraRevogadas(lerDepois('services/registry.json'), lerDepois));
  if (precisaBuild && achados.length === 0 && !build()) achados.push({ regra: 'B5', arquivo: 'dist/' });
  return achados;
}

// Analisa o commit. Devolve a lista de achados (vazia = commit liberado).
export function analisarCommit({ git, executarBuild: build = () => true }) {
  let arquivos;
  try {
    arquivos = arquivosPreparados(git);
  } catch {
    return [{ regra: 'B0', arquivo: '(área de preparação)' }];
  }
  const temHead = git(['rev-parse', '--verify', '--quiet', 'HEAD'], { permitirFalha: true }) !== null;
  return analisarAlteracoes({
    arquivos,
    lerAntes: (caminho) => (temHead ? git(['show', `HEAD:${caminho}`], { permitirFalha: true }) : null),
    lerDepois: (caminho) => git(['show', `:${caminho}`], { permitirFalha: true }),
    diffDoArquivo: (caminho) => git(['diff', '--cached', '-U0', '--no-color', '--no-ext-diff', '--text', '--', caminho]),
    listarDepois: (prefixo) => git(['ls-files', '-z', '--', prefixo]).split('\0').filter((c) => c !== ''),
    executarBuild: build,
  });
}

export function executar({ raiz = process.cwd(), saida = process.stderr } = {}) {
  const git = criarGit(raiz);
  let achados;
  try {
    achados = analisarCommit({ git, executarBuild: () => executarBuild(raiz) });
  } catch {
    achados = [{ regra: 'B0', arquivo: '(commit)' }];
  }
  if (achados.length === 0) return 0;
  saida.write(`${achados.map(formatarAchado).join('\n')}\n\nNada foi commitado. Detalhes e liberação autorizada: docs/ADMINISTRACAO.md.\n`);
  return 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let raiz = process.cwd();
  try {
    raiz = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    process.stderr.write(`${MENSAGENS.B0}\n`);
    process.exit(1);
  }
  process.exitCode = executar({ raiz });
}
