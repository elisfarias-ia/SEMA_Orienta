# Evidências — Sprint 1

Registro do fechamento técnico da Sprint 1 (Engenharia assistida e saúde do sistema). Só consta aqui o que foi executado ou conferido; o que não foi feito aparece como NÃO TESTADO ou como limitação.

- **Issue:** #3 (permanece aberta até o merge).
- **Pull Request:** #4, da branch `feature/sprint-1-saude-sistema` para `main` (em revisão).
- **Data da execução:** 13/11/2026.
- **Ambiente:** Windows 11, Node.js v22.10.0, npm 10.9.0, Chromium instalado pelo Playwright.

## Commits da Sprint (passos 8B e 8C)

| Commit | Mensagem | Passo |
|---|---|---|
| `82aaba5` | feat: adiciona saúde administrativa | 8B |
| `35a292d` | fix: corrige resumo da saúde administrativa | 8B (correção) |
| `db01fdc` | test: adiciona testes e2e com Playwright | 8C |

O passo 8A (contexto e metodologia) foi integrado antes, pela PR #2 (merge `17ca990`).

## Verificações do fechamento (8D)

Executadas nesta ordem, sobre a branch no commit `db01fdc`, com a árvore de trabalho limpa:

| Comando | Resultado real |
|---|---|
| `npm run validate:services` | Validação concluída sem erros. Serviços verificados: lac. |
| `npm test` | 526 testes: 525 passaram, 0 falharam, 1 ignorado (`I8`, que só roda com `dist/` existente e ainda não havia build nesse momento). |
| `npm run test:e2e` | 13 testes passaram, 0 falharam (Chromium). |
| `npm run build` | Build concluído; `dist/` com `index.html`, um CSS e um JS. |
| `node scripts/check-dist.js` | `dist/` limpo: 91 termos verificados, nenhuma ocorrência. |
| `git diff --check` | Sem problemas. |

Depois do build, `tests/admin-isolamento.test.js` foi executado de novo, com o `dist/` presente: 9 de 9 passaram, nenhum ignorado (inclui o `I8`). A bateria completa não foi repetida depois do build.

## Saúde do sistema — conferência manual

Aprovada pela usuária em 13/11/2026 e registrada em `docs/TESTES_MANUAIS.md`:

- MH-01 a MH-05 e MH-07 a MH-12 (páginas separadas, navegação, componentes, data e hora em DD-MM-AAAA HH:mm:ss, ausência de vazamento, 390 px, teclado, interface pública sem alteração);
- MH-06 substituído, porque o MCP saiu da saúde;
- MH-13: resumo com 6 operacionais, 0 degradados, 0 indisponíveis, 0 não verificados e 3 não implementados; MCP ausente; mensagem de que recurso não implementado não é falha; layout aprovado em `/admin/saude/`.

Os estados degradado e indisponível foram cobertos só por testes automatizados (falhas simuladas em cópias temporárias).

## Playwright — 13 de 13

Os testes ficam em `e2e/` e são somente leitura: bloqueiam qualquer requisição que não seja GET e qualquer rede fora do `localhost`, e falham se isso ocorrer. Não gravam serviços, assuntos nem fontes. Não substituem nem transformam os testes manuais.

| Arquivo | Testes | Cobertura |
|---|---|---|
| `e2e/chat.spec.js` | 5 | página e campo; Enter envia e Shift+Enter não envia; Reiniciar limpa e devolve o foco; pergunta sem conteúdo validado recebe resposta segura; faixa de teste local no desenvolvimento |
| `e2e/admin.spec.js` | 3 | catálogo e sessão sem ids técnicos; navegação para `/admin/saude/` e volta; redirecionamentos de `/admin` e `/admin/saude` |
| `e2e/saude.spec.js` | 5 | estados e contagem "Não implementados" à parte; ausência de MCP, caminhos, tokens e erros internos; "Verificar novamente" sem duplicar componentes; 390 px sem rolagem horizontal; Tab com foco visível |

## Resumo: PASSOU / FALHOU / NÃO TESTADO

| Item | Situação | Base |
|---|---|---|
| Validação da base de serviços | PASSOU | `npm run validate:services` |
| Testes Node (526) | PASSOU | 525 passaram, 1 ignorado explicado acima, 0 falhas |
| Testes E2E (13) | PASSOU | `npm run test:e2e` |
| Build de produção | PASSOU | `npm run build` |
| `dist/` sem conteúdo administrativo ou de teste | PASSOU | `node scripts/check-dist.js` e `I8` |
| `git diff --check` | PASSOU | sem problemas |
| Saúde do sistema no navegador (desktop, 390 px, teclado) | PASSOU | conferência manual da usuária |
| Estados degradado e indisponível da saúde | PASSOU (só automatizado) | testes Node com falhas simuladas; não provocados manualmente |
| Falhas do sistema | FALHOU: nenhum | nenhuma verificação falhou |
| Ausência da administração no `preview` | NÃO TESTADO no Playwright | coberta só pelo `check-dist` e por testes Node |
| Ausência da faixa de teste no build | NÃO TESTADO no Playwright | coberta só pelo `check-dist` |
| Cadastro com confirmação de gravação (assunto, serviço, fonte) pelo Playwright | NÃO TESTADO | os testes E2E são somente leitura; a gravação é coberta por testes Node em cópias temporárias |
| Outros navegadores, Firefox e WebKit | NÃO TESTADO | só Chromium |
| Operação fora do ambiente local | NÃO TESTADO | a administração é só local |

## Técnica demonstrada: role prompting

O passo 8B foi conduzido com a instrução "Atue como engenheiro de confiabilidade de software". Evidência de efeito: a saúde separa capacidade de estado, executa verificações reais (aplicação, base, armazenamento em pasta temporária, conteúdo publicado), declara como não implementado o que não existe em vez de fingir funcionamento, usa mensagens públicas fixas sem vazamento e foi coberta por testes de falha simulada. A evidência está nos commits `82aaba5` e `35a292d`.

## Limitações

Ainda não implementados ou não demonstrados:

- MTLogin e qualquer autenticação institucional;
- banco de dados;
- IA externa;
- processamento de fontes;
- MCP (não faz parte da saúde operacional; será documentado como ferramenta de desenvolvimento);
- skills, subagentes e hook.

Outras limitações: a administração é local e sem autenticação; o conteúdo da LAC segue em validação e não publicado; os testes E2E são somente leitura e só em Chromium.
