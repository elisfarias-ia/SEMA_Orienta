---
name: validar-sema-orienta
description: Valida o SEMA Orienta de forma proporcional ao escopo da mudança e entrega um relatório PASSOU / FALHOU / NÃO TESTADO. Use quando o usuário pedir para validar, conferir, rodar as verificações do projeto, fechar um passo ou preparar commit, ou citar "modo rápido" ou "modo completo".
allowed-tools: Bash(git status:*), Bash(git diff:*), Bash(git branch:*), Bash(git log:*), Bash(npm run validate:services), Bash(npm test), Bash(npm run test:e2e), Bash(npm run build), Bash(node scripts/check-dist.js)
---

# Validar o SEMA Orienta

Executa as verificações do projeto na ordem certa, sem alterar arquivos, e relata só o que foi de fato executado.

## Escolha do modo

- **Rápido** (padrão): mudança pequena, só documentação ou conferência antes de continuar.
- **Completo**: fechamento de passo ou de Sprint, mudança em código, dependências, interface ou base de serviços, ou pedido expresso.

Se o usuário não disser o modo, escolha o mais barato que cubra o escopo e diga qual escolheu.

## Modo rápido

Executar nesta ordem, um comando por vez:

1. `git status -sb` (branch, sincronização e alterações pendentes; mostrar o resultado);
2. `npm run validate:services`;
3. `git diff --check`.

## Modo completo

Executar nesta ordem e parar na primeira falha:

1. `git status -sb`;
2. `npm run validate:services`;
3. `npm test`;
4. `npm run test:e2e` (o Playwright inicia e encerra o Vite na porta 5173; a porta precisa estar livre);
5. `npm run build`;
6. `node scripts/check-dist.js`;
7. `git diff --check`.

## Regras

- Não alterar arquivos, dados, dependências nem a base real. Não fazer `git add`, commit nem push.
- Não iniciar servidor por conta própria nem deixar processo do Vite ativo.
- Se um comando falhar, parar, mostrar a saída real da falha e marcar os seguintes como NÃO TESTADO. Não corrigir sem pedido.
- Nunca afirmar que algo passou sem ter executado: o que não rodou é NÃO TESTADO, com o motivo.
- Testes que dependem de `dist/` (por exemplo `I8`) ficam ignorados antes do build; registrar o número de ignorados.
- Sem segredos, tokens ou dados pessoais no relatório.

## Relatório

Tabela curta, uma linha por verificação:

| Verificação | Resultado | Evidência |
|---|---|---|
| comando | PASSOU / FALHOU / NÃO TESTADO | contagem real (testes, ignorados) ou trecho da falha |

Fechar com o modo usado, a branch, o commit e o estado do `git status`.
