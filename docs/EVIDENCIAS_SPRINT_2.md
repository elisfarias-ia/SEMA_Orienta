# Evidências da Sprint 2 — engenharia assistida

Fechamento técnico em 2026-11-13, na branch `feature/sprint-2-engenharia-assistida`, a partir do commit `d230773`. Nenhuma alteração de aplicação, dados ou dependências foi feita no fechamento.

## Skills do projeto

As três skills foram criadas e versionadas no commit `7459a28` e invocadas de fato no fechamento. Os relatórios abaixo são resumos curtos; nenhum achado foi corrigido.

| Skill | Invocação real | Resultado resumido |
|---|---|---|
| `validar-sema-orienta` | sim, modo completo | PASSOU: ver "Verificação final" |
| `revisar-base-servicos` | sim, somente leitura | Sem achado bloqueante. Serviço `lac` aponta para assunto ativo e para `service.json` existente; versão atual `lac-v1` coerente; `versaoPublicadaId` nula; 0 documentos, 0 perguntas e 0 blocos publicados; autorização do assistente limitada a `teste_local`, sem aprovação material nem pública; sem e-mail ou telefone no conteúdo; 2 campos `PENDENTE` mantidos (`unidadeResponsavel`, `canalAtendimento.nome`); `npm run validate:services` sem erros. NÃO CONFERIDO: fluxo de estados e hashes (`fluxo.js`, `hash.js`), pois não há conteúdo validado. |
| `revisar-interface-sema` | sim, somente leitura (conferência parcial) | Sem achado bloqueante nas verificações feitas por busca no código: nenhuma ocorrência de `innerHTML`, `localStorage`, `sessionStorage` ou `cookie` em `index.html`, `src/`, `admin/` e `admin/saude/`; `:focus-visible` presente nos dois estilos; regiões `role="status"`/`aria-live` presentes; link externo com `rel="noopener noreferrer"`; `viewport` definido. NÃO CONFERIDO: contraste medido, 390 px no navegador, ordem de foco e rótulos da página de saúde (sem campo de formulário contado). Os testes e2e do fechamento cobriram 390 px e foco na página de saúde. |

## Subagentes

- Reconhecidos pela sessão como agentes do projeto: `arquiteto-sema`, `auditor-sema` e `implementador-sema` (`.claude/agents/`, commit `2875966`).
- **Execução real em paralelo:** `arquiteto-sema` e `auditor-sema` foram invocados na mesma mensagem, em modo somente leitura, sem alterar arquivos; `implementador-sema` não foi invocado. A conclusão deles chegou separadamente, com 38 s (arquiteto) e 48 s (auditor) de duração informada.
  - **Arquiteto (MCP x `docs/PLANO_MCP.md`):** sem divergência bloqueante. Cinco módulos em `scripts/mcp/`, quatro ferramentas, camadas, transporte e fora de escopo conferem com o plano. Divergências só de redação do plano (tabela da seção 2 e `npm run mcp` ainda citam `servidor.js` em vez de `iniciar.js`; lista de importações da seção 3.1 e termos da seção 5.6 desatualizados), parte delas já registrada na seção 12 do próprio plano; as demais ficam como pendência de redação do plano, sem correção neste passo.
  - **Auditor (leitura, rede, erros e publicação):** nenhum achado que bloqueie ou deva ser corrigido, por leitura do código. Cinco sugestões de baixo risco: janela entre checagem e leitura de arquivo (TOCTOU), leitura integral antes do corte de tamanho, dependência transitiva de `validate-services.js` (risco já aceito no código), confirmar expansão de `${CLAUDE_PROJECT_DIR:-.}` no cliente e ampliar termos do `check-dist`. O auditor **não executou** testes, build nem `check-dist`; a aprovação dele depende da execução registrada neste documento.
- **Sequencial antigo (implementador e auditor na construção do MCP, commit `d7fbc97`):** **NÃO VERIFICADO neste fechamento**. Não há transcrição reexaminada nem relatório guardado, e isso não é apresentado como prova.

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

## Teste complementar com `dist/` existente

`node --test tests/admin-isolamento.test.js`, executado depois do build de fechamento: 11 testes, 11 passaram, 0 ignorados (os testes que dependiam do `dist/` rodaram). A bateria completa não foi repetida.

## Hook de proteção (Passo 2D)

**Cancelado por decisão da usuária e não implementado.** Uma versão experimental chegou a existir apenas na árvore de trabalho, nunca foi commitada e foi removida integralmente; não há `.claude/settings.json` nem hook de projeto no repositório. As proteções contra ações fora das regras continuam dependendo das instruções escritas e da revisão.

## Limitações e itens NÃO TESTADOS

- Validação da LAC parcial: o conteúdo segue em validação e não publicado; as verificações do MCP e do validador não equivalem a validação material, jurídica ou autorização de publicação.
- Três testes de links simbólicos do MCP: NÃO TESTADO no Windows.
- Filtros opcionais das ferramentas do MCP e outros formatos de entrada inválida: NÃO TESTADO.
- Execução sequencial antiga de implementador e auditor: NÃO VERIFICADA neste fechamento.
- Hooks: cancelados e NÃO IMPLEMENTADOS; técnica não demonstrada.
- Os relatórios das skills de revisão e dos subagentes são conferências por leitura, sem execução de testes por eles.
