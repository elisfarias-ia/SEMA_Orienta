// Verificação da PR no GitHub (Sprint 6, Passo 6D). Chamada pelo workflow .github/workflows/protecao-pr.yml.
//
// Aplica as mesmas regras B0 a B5 do pre-commit (regras.js, por meio de analisarAlteracoes em pre-commit.js) às
// alterações entre a base da PR (o ponto em que ela saiu do main) e o último commit da PR. Fecha a brecha de quem
// pula o hook local ("git commit --no-verify") ou não o ativou.
//
// Uso: node scripts/hooks/verificar-pr.js <commit-base> <commit-da-pr>

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MENSAGENS, formatarAchado } from './regras.js';
import { analisarAlteracoes, criarGit, executarBuild, lerListaDeArquivos } from './pre-commit.js';

// Referência aceitável: hash de commit ou nome de branch simples (nunca algo que o Git leia como opção).
const REFERENCIA = /^(?!-)[A-Za-z0-9._/-]{1,200}$/;

export function arquivosAlterados(git, base, alvo) {
  return lerListaDeArquivos(git(['diff', '--name-status', '--no-renames', '-z', base, alvo]));
}

// Devolve a lista de achados (vazia = PR liberada).
export function analisarPr({ git, base, alvo, executarBuild: build = () => true }) {
  const valida = (ref) => typeof ref === 'string' && REFERENCIA.test(ref);
  if (!valida(base) || !valida(alvo)) return [{ regra: 'B0', arquivo: '(referências da PR)' }];
  let pontoDePartida;
  let arquivos;
  try {
    pontoDePartida = git(['merge-base', base, alvo]).trim();
    if (!/^[0-9a-f]{40,64}$/.test(pontoDePartida)) throw new Error('merge-base inválido');
    arquivos = arquivosAlterados(git, pontoDePartida, alvo);
  } catch {
    return [{ regra: 'B0', arquivo: '(diferença da PR)' }];
  }
  return analisarAlteracoes({
    arquivos,
    lerAntes: (caminho) => git(['show', `${pontoDePartida}:${caminho}`], { permitirFalha: true }),
    lerDepois: (caminho) => git(['show', `${alvo}:${caminho}`], { permitirFalha: true }),
    diffDoArquivo: (caminho) => git(['diff', '-U0', '--no-color', '--no-ext-diff', '--text', pontoDePartida, alvo, '--', caminho]),
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
  const limpar = (texto) => String(texto).replace(/[\r\n%]/g, ' ');
  const linha = achado.linha ? `,line=${achado.linha}` : '';
  const parametros = /^[^(]/.test(achado.arquivo) ? ` file=${limpar(achado.arquivo).replace(/[,:]/g, '_')}${linha}` : '';
  const detalhe = achado.detalhe ? ` (${achado.detalhe})` : '';
  return `::error${parametros}::${limpar(mensagemDaPr(MENSAGENS[achado.regra]))}${limpar(detalhe)}`;
}

export function executar({ argv = process.argv.slice(2), raiz = process.cwd(), saida = process.stdout, build = () => executarBuild(raiz) } = {}) {
  const [base, alvo] = argv;
  let achados;
  try {
    achados = analisarPr({ git: criarGit(raiz), base, alvo, executarBuild: build });
  } catch {
    achados = [{ regra: 'B0', arquivo: '(PR)' }];
  }
  if (achados.length === 0) {
    saida.write('Verificação de proteção da PR: nenhuma regra violada (B0 a B5).\n');
    return 0;
  }
  saida.write(`${achados.map(anotacao).join('\n')}\n`);
  saida.write(`${achados.map((achado) => mensagemDaPr(formatarAchado(achado))).join('\n')}\n\nVerificação de proteção da PR falhou. Corrija os itens acima; liberação autorizada em docs/ADMINISTRACAO.md.\n`);
  return 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = executar();
}
