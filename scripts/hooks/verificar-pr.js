// Verificação da PR no GitHub (Sprint 6, Passo 6D; Issue #31, item 1). Chamada pelo workflow
// .github/workflows/protecao-base.yml (pull_request_target, que executa ESTE script como está no commit BASE, nunca o da PR).
//
// Aplica as mesmas regras B0 a B5 do pre-commit (regras.js, por meio de analisarAlteracoes em pre-commit.js) às
// alterações entre a base da PR (o ponto em que ela saiu do main) e o último commit da PR. Fecha a brecha de quem
// pula o hook local ("git commit --no-verify") ou não o ativou.
//
// Diferenças em relação ao pre-commit local:
//   - as autorizações de publicação (.githooks/publicacoes-autorizadas.json) são lidas do commit BASE, não da PR: uma PR não se
//     autoriza. Publicar exige duas PRs: primeiro a que só registra a autorização, depois, já mergeada, a que traz o conteúdo público;
//   - B6 é informativa: se a PR altera caminho protegido (ehCaminhoProtegido), emite um aviso e escreve protegidos=true em
//     $GITHUB_OUTPUT, sem mudar o código de saída. A obrigatoriedade da revisão da dona está no ruleset e no CODEOWNERS (fora do Git).
//
// Uso: node scripts/hooks/verificar-pr.js [--sem-build] <commit-base> <commit-da-pr>
//   --sem-build: não executa o build (que rodaria código da PR). O B5 passa a ser coberto pelo passo de build + check-dist
//   do workflow protecao-pr.yml, que roda sem segredos.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import { MENSAGENS, ehCaminhoProtegido, formatarAchado, sanitizarParaLog } from './regras.js';
import { analisarAlteracoes, criarGit, executarBuild, lerListaDeArquivos } from './pre-commit.js';

// Referência aceitável: hash de commit ou nome de branch simples (nunca algo que o Git leia como opção).
const REFERENCIA = /^(?!-)[A-Za-z0-9._/-]{1,200}$/;

export function arquivosAlterados(git, base, alvo) {
  return lerListaDeArquivos(git(['diff', '--name-status', '--no-renames', '-z', base, alvo]));
}

const referenciaValida = (ref) => typeof ref === 'string' && REFERENCIA.test(ref);

// Calcula a diferença da PR. Devolve { pontoDePartida, arquivos } ou null se não puder ser lida (B0).
function diferencaDaPr(git, base, alvo) {
  try {
    const pontoDePartida = git(['merge-base', base, alvo]).trim();
    if (!/^[0-9a-f]{40,64}$/.test(pontoDePartida)) return null;
    return { pontoDePartida, arquivos: arquivosAlterados(git, pontoDePartida, alvo) };
  } catch {
    return null;
  }
}

// B6 (informativa): caminhos protegidos que a PR altera (qualquer status, inclusive exclusão). Vazia se a diferença não pôde ser lida
// (o B0 de analisarPr já cobre esse caso).
export function caminhosProtegidosAlterados({ git, base, alvo }) {
  if (!referenciaValida(base) || !referenciaValida(alvo)) return [];
  const diferenca = diferencaDaPr(git, base, alvo);
  return diferenca ? diferenca.arquivos.map((a) => a.caminho).filter(ehCaminhoProtegido) : [];
}

// Devolve a lista de achados (vazia = PR liberada). As autorizações de publicação vêm do commit `base`, não da PR.
export function analisarPr({ git, base, alvo, executarBuild: build = () => true }) {
  if (!referenciaValida(base) || !referenciaValida(alvo)) return [{ regra: 'B0', arquivo: '(referências da PR)' }];
  const diferenca = diferencaDaPr(git, base, alvo);
  if (diferenca === null) return [{ regra: 'B0', arquivo: '(diferença da PR)' }];
  const { pontoDePartida, arquivos } = diferenca;
  return analisarAlteracoes({
    arquivos,
    lerAntes: (caminho) => git(['show', `${pontoDePartida}:${caminho}`], { permitirFalha: true }),
    lerDepois: (caminho) => git(['show', `${alvo}:${caminho}`], { permitirFalha: true }),
    // Issue #31, item 1: a autorização é a que já está no commit base (se o base não tem o arquivo, não há autorização nenhuma).
    lerAutorizacoes: (caminho) => git(['show', `${base}:${caminho}`], { permitirFalha: true }),
    diffDoArquivo: (caminho) => git(['diff', '-U0', '--no-color', '--no-ext-diff', '--text', pontoDePartida, alvo, '--', caminho]),
    // Sprint 7, Passo 7D: arquivos que existem no último commit da PR (para conferir a remoção de conteúdo público).
    listarDepois: (prefixo) => git(['ls-tree', '-r', '-z', '--name-only', alvo, '--', prefixo]).split('\0').filter((c) => c !== ''),
    executarBuild: build,
  });
}

// Na PR, as mensagens das regras começam por "Verificação da PR reprovada" em vez de "Commit bloqueado"
// (o código da regra e o resto do texto são os mesmos do pre-commit).
export function mensagemDaPr(texto) {
  return String(texto).replace(/^Commit bloqueado/gm, 'Verificação da PR reprovada');
}

// Linha de anotação do GitHub Actions (aparece no arquivo da PR). Nunca inclui o valor encontrado.
export function anotacao(achado) {
  const limpar = sanitizarParaLog;
  const linha = achado.linha ? `,line=${achado.linha}` : '';
  const parametros = /^[^(]/.test(achado.arquivo) ? ` file=${limpar(achado.arquivo).replace(/[,:]/g, '_')}${linha}` : '';
  const detalhe = achado.detalhe ? ` (${achado.detalhe})` : '';
  return `::error${parametros}::${limpar(mensagemDaPr(MENSAGENS[achado.regra]))}${limpar(detalhe)}`;
}

// B6: aviso informativo (anotação + lista dos caminhos) e protegidos=true em $GITHUB_OUTPUT, se definido. Não muda o código de saída.
function avisarProtegidos(caminhos, saida, ambiente) {
  if (caminhos.length === 0) return;
  const limpar = sanitizarParaLog;
  saida.write(`::warning::${limpar(MENSAGENS.B6)}\n${caminhos.map((c) => `  -> ${limpar(c)}`).join('\n')}\n`);
  if (ambiente.GITHUB_OUTPUT) {
    try {
      fs.appendFileSync(ambiente.GITHUB_OUTPUT, 'protegidos=true\n');
    } catch {
      // o aviso já foi emitido; a saída do passo é só um complemento
    }
  }
}

export function executar({ argv = process.argv.slice(2), raiz = process.cwd(), saida = process.stdout, build = () => executarBuild(raiz), ambiente = process.env } = {}) {
  const semBuild = argv.includes('--sem-build');
  const [base, alvo] = argv.filter((a) => a !== '--sem-build');
  const git = criarGit(raiz);
  let achados;
  try {
    achados = analisarPr({ git, base, alvo, executarBuild: semBuild ? () => true : build });
  } catch {
    achados = [{ regra: 'B0', arquivo: '(PR)' }];
  }
  let protegidos = [];
  try {
    protegidos = caminhosProtegidosAlterados({ git, base, alvo });
  } catch {
    protegidos = [];
  }
  avisarProtegidos(protegidos, saida, ambiente);
  if (achados.length === 0) {
    saida.write(`Verificação de proteção da PR: nenhuma regra violada (${semBuild ? 'B0 a B4; o B5 é coberto pelo passo de build do protecao-pr.yml' : 'B0 a B5'}).\n`);
    return 0;
  }
  saida.write(`${achados.map(anotacao).join('\n')}\n`);
  saida.write(`${achados.map((achado) => mensagemDaPr(formatarAchado(achado))).join('\n')}\n\nVerificação de proteção da PR falhou. Corrija os itens acima; liberação autorizada em docs/ADMINISTRACAO.md.\n`);
  return 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = executar();
}
