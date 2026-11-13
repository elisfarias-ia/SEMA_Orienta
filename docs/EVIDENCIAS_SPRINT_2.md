# Evidências da Sprint 2 — engenharia assistida

Fechamento técnico em 2026-11-13, na branch `feature/sprint-2-engenharia-assistida`, a partir do commit `d230773`. Nenhuma alteração de aplicação, dados ou dependências foi feita no fechamento.

## Skills do projeto

| Skill | Commit | Situação |
|---|---|---|
| `revisar-base-servicos` | `7459a28` | criada e versionada; invocação real **NÃO REGISTRADA** neste fechamento |
| `revisar-interface-sema` | `7459a28` | criada e versionada; invocação real **NÃO REGISTRADA** neste fechamento |
| `validar-sema-orienta` | `7459a28` | criada e versionada; **invocada de fato no fechamento**, em modo completo (resultados abaixo) |

## Subagentes

- Reconhecidos pela sessão como agentes do projeto: `arquiteto-sema`, `auditor-sema` e `implementador-sema` (arquivos em `.claude/agents/`, commit `2875966`).
- Execução em paralelo de arquiteto e auditor, e execução em sequência de implementador e auditor na construção do MCP (commit `d7fbc97`): feitas durante os passos 2B e 2C, conforme a condução da usuária. Este fechamento **não reexaminou as transcrições** desses passos; os relatórios completos não estão guardados no repositório. Registro por declaração do processo, não por evidência independente: **NÃO VERIFICADO neste fechamento**.

## MCP local

- Servidor `sema-orienta-base`, configurado em `.mcp.json`, com quatro ferramentas somente leitura: `listar_assuntos`, `listar_servicos`, `consultar_fontes` e `resumir_base` (código em `scripts/mcp/`, testes `tests/mcp-*.test.js`).
- Demonstração real, com as cinco chamadas feitas pelo MCP e comparadas com os JSON da base: ver `docs/EVIDENCIAS_MCP.md` (todas PASSOU, nenhuma divergência, erro `servico_nao_encontrado` sanitizado).
- O MCP não faz parte da saúde do sistema e não existe no `dist/`.

## Verificação final (modo completo da skill `validar-sema-orienta`)

| Verificação | Resultado | Evidência |
|---|---|---|
| `git status -sb` | PASSOU | branch sincronizada com `origin`, sem alterações pendentes, commit `d230773` |
| `npm run validate:services` | PASSOU | "Validação dos serviços concluída sem erros. Serviços verificados: lac." |
| `npm test` | PASSOU | 570 testes: 566 passaram, 0 falharam, 4 ignorados (dependem de `dist/` antes do build) |
| `npm run test:e2e` | PASSOU | Playwright: 13 passaram |
| `npm run build` | PASSOU | build concluído |
| `node scripts/check-dist.js` | PASSOU | "dist/ limpo: 100 termos verificados, nenhuma ocorrência." |
| `git diff --check` | PASSOU | sem problemas |

## Hook de proteção (Passo 2D)

**Cancelado por decisão da usuária e não implementado.** Uma versão experimental chegou a existir apenas na árvore de trabalho, nunca foi commitada e foi removida integralmente; não há `.claude/settings.json` nem hook de projeto no repositório. As proteções contra ações fora das regras continuam dependendo das instruções escritas e da revisão.

## Limitações e itens NÃO TESTADOS

- Validação da LAC parcial: o conteúdo segue em validação e não publicado; as verificações do MCP e do validador não equivalem a validação material, jurídica ou autorização de publicação.
- Três testes de links simbólicos do MCP: NÃO TESTADO no Windows.
- Filtros opcionais das ferramentas do MCP e outros formatos de entrada inválida: NÃO TESTADO.
- Invocação real das skills `revisar-base-servicos` e `revisar-interface-sema`: NÃO REGISTRADA.
- Execução paralela e sequencial dos subagentes: NÃO VERIFICADA neste fechamento (ver acima).
- Hooks: NÃO IMPLEMENTADOS.
