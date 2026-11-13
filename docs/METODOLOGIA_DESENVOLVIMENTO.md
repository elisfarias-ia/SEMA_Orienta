# Metodologia de desenvolvimento

Este documento descreve **como** o SEMA Orienta é construído e registra, para cada técnica, se ela foi **comprovada** no projeto e com que evidência. Não substitui `CLAUDE.md` (regras permanentes) nem `docs/SPRINTS.md` (planejamento).

## Visão geral do processo

1. **Passo pequeno e declarado:** cada entrega tem escopo, lista do que fica de fora e critério de pronto.
2. **Implementar e testar juntos:** o código nasce com testes automatizados no mesmo passo.
3. **Verificar:** validação da base, bateria de testes, build e conferência do `dist/`.
4. **Parar para aprovação:** a pessoa responsável revisa e aprova.
5. **Publicar:** commit só dos arquivos do passo, `git diff --cached --check`, push sem `--force`, confirmação de `main = origin/main`.
6. **Registrar:** documentação e testes manuais atualizados no mesmo ciclo, sem marcar como aprovado o que não foi executado.

## Técnicas de engenharia assistida: situação e evidências

Legenda: **COMPROVADA** (há evidência real e repetida), **PARCIALMENTE COMPROVADA** (há evidência de parte da técnica) e **NÃO DEMONSTRADA** (não há evidência no projeto). Nada abaixo foi presumido: quando falta evidência, está escrito.

| Técnica | Situação |
|---|---|
| Role prompting | NÃO DEMONSTRADA |
| Context engineering | COMPROVADA |
| Zero-shot | COMPROVADA |
| Decomposição / prompt chaining | COMPROVADA |
| Specification / contract prompting | COMPROVADA |
| Few-shot | PARCIALMENTE COMPROVADA |
| Plan–Act–Verify | COMPROVADA |
| Critique–Revise | COMPROVADA |
| Delegation prompting | NÃO DEMONSTRADA |
| Tool-grounded prompting | NÃO DEMONSTRADA |
| Guardrails | PARCIALMENTE COMPROVADA |

### Role prompting — NÃO DEMONSTRADA
- **O que seria:** atribuir um papel explícito ao assistente (por exemplo, revisor de segurança ou auditor de conteúdo) para orientar a resposta.
- **Evidência:** nenhuma. As auditorias e revisões do projeto foram pedidas como tarefas com escopo e regras, sem atribuição de papel.

### Context engineering — COMPROVADA
- **Como aplicamos:** o contexto é versionado e controlado: `CLAUDE.md` (regras permanentes), o pacote de contexto (`docs/REQUISITOS.md`, `docs/REGRAS_ASSISTENTE.md`, `docs/ARQUITETURA.md`, `docs/BACKLOG.md`, `docs/TESTES_MANUAIS.md`) e instruções por passo que limitam o que ler e exigem conferir o estado do repositório antes de começar.
- **Evidência:** `CLAUDE.md` (seções "Regras de trabalho com o assistente de código" e "Documentação"); passos que pararam por haver alterações pendentes de outro passo antes de começar; relatórios sempre ancorados em hashes de commit e contagens de testes.

### Zero-shot — COMPROVADA
- **Como aplicamos:** tarefas descritas por objetivo, regras e formato de entrega, sem exemplos de saída.
- **Evidência:** os passos 7A a 7E3B (commits `2d9ae5c`, `83f5852`, `0b604d3`, `e29ffe8`, `8013626`, `6a4fc10`, `d0f6001`, `be736eb` e `ec93a5e`) foram entregues a partir de instruções sem exemplos, com verificação ao final.

### Decomposição / prompt chaining — COMPROVADA
- **Como aplicamos:** o Marco 7 foi dividido em passos encadeados, cada um reutilizando a saída do anterior.
- **Evidência:** 7A (`services/admin/fluxo.js` e `hash.js`) → 7B (`versao.js` e `decisoes.js`) → 7C1 (`armazenamento.js`) → 7C2 (migração da LAC para a versão 1) → 7D (endpoint que reutiliza armazenamento e localização da versão) → 7E1 (cadastro e transação) → 7E2 (interface) → 7E3A (fontes) → 7E3B (cadastro simplificado), com a bateria passando de 275 para 499 testes.

### Specification / contract prompting — COMPROVADA
- **Como aplicamos:** pedidos com modelo de dados, regras numeradas, mensagem de commit e formato de relatório definidos de antemão; contratos formais nos esquemas da base.
- **Evidência:** `services/schemas/*.json` (registro, serviço, assuntos, versão, decisão e autorização), o contrato da API em `docs/ARQUITETURA.md` e testes que comparam esquema e validador (por exemplo V8, V17 e D24).

### Few-shot — PARCIALMENTE COMPROVADA
- **O que há:** pares de entrada e resultado esperado fornecidos num pedido: a correção do reconhecimento de intenção listou perguntas com a resposta esperada ("O que é enquadramento?", "O que é a LAC?" e outras), que viraram casos de teste.
- **Evidência:** `tests/assistant.test.js` (R6 e S6b).
- **O que falta:** demonstrar a técnica como exemplos de formato de saída dados ao modelo no próprio prompt.

### Plan–Act–Verify — COMPROVADA
- **Como aplicamos:** plano antes de executar (lista de tarefas e, no início, plano aprovado), implementação e verificação com evidência: `npm run validate:services`, `npm test`, `npm run build`, `node scripts/check-dist.js`, `git diff --check` e conferência no navegador.
- **Evidência:** relatórios de fechamento de cada passo; `docs/TESTES_MANUAIS.md` (MA, MF e MS) com a conferência visual registrada e o que não foi executado marcado como tal.

### Critique–Revise — COMPROVADA
- **Como aplicamos:** auditorias somente leitura e revisão da pessoa responsável, seguidas de correção objetiva.
- **Evidência:** a auditoria do passo 7C2 (comparação do validador com o `HEAD` anterior: 78 linhas acrescentadas e 6 trocadas por condições equivalentes e mais estritas, sem regra removida) levou à correção de uma descrição de esquema; a conferência do armazenamento no 7E1 levou à normalização dos catálogos; a revisão do reconhecimento de intenção gerou R6 e S6b; a data de publicação passou a DD-MM-AAAA no 7E3A.

### Delegation prompting — NÃO DEMONSTRADA
- **O que seria:** delegar partes do trabalho a subagentes com instruções próprias e conferir o resultado.
- **Evidência:** nenhuma execução real de subagentes registrada no projeto. Permanece não demonstrada até que isso seja executado e documentado.

### Tool-grounded prompting — NÃO DEMONSTRADA
- **O que seria:** fundamentar a resposta em dados obtidos por uma ferramenta externa (MCP) chamada durante a tarefa.
- **Evidência:** nenhuma chamada real de MCP registrada como técnica do projeto. Permanece não demonstrada até a chamada real.

### Guardrails — PARCIALMENTE COMPROVADA
- **O que há:**
  - restrições escritas nos pedidos e em `CLAUDE.md` (um passo por vez, sem commit ou push sem pedido, sem `--force`, sem dados reais, sem segredos);
  - guardrails em código e testes: validador da base, `scripts/check-dist.js`, endpoints administrativos só no servidor de desenvolvimento, token em memória, erros genéricos, testes só em cópias temporárias.
- **O que falta:** nenhum hook foi configurado ou demonstrado; hoje o cumprimento das restrições depende da instrução escrita e da revisão.

## Próximos passos (ainda não executados)

1. **Skills:** transformar fluxos repetidos (fechar passo, auditar diff, registrar teste manual) em skills versionadas.
2. **MCP:** escolher uma fonte de dados real e chamá-la por MCP numa tarefa, registrando a evidência (para demonstrar tool-grounded prompting).
3. **Hooks:** configurar um hook que bloqueie ações fora das regras (por exemplo, commit com arquivos proibidos) e demonstrá-lo com um caso real.
4. **Subagentes:** executar uma tarefa delegada (por exemplo, auditoria somente leitura) e registrar instruções, resultado e conferência (para demonstrar delegation prompting).

## Práticas de engenharia do projeto (evidências)

### Incrementos pequenos e testáveis
Cada passo entrega uma capacidade (commits `2d9ae5c`, `83f5852`, `0b604d3`, `e29ffe8`, `8013626`, `6a4fc10`, `d0f6001`, `be736eb` e `ec93a5e`).

### Portões de aprovação antes de publicar
Nenhum commit ou push sem pedido expresso; relatório curto a cada passo; os commits de ajuste documental (`1f7d554`, `1f4191f` e `36ab8f3`) só existem após aprovação.

### Testes automatizados e regressão
`node --test` sem bibliotecas externas. A bateria passou de 244 testes (assistente local, `ee88919`) para 275, 318, 345, 368, 398, 436, 458, 489 e 499 (`ec93a5e`), sempre sem falhas na verificação final.

### Validador como especificação executável
`scripts/validate-services.js` confere a base inteira e é ampliado sem remover regras anteriores; os testes de falha usam cópias temporárias da base.

### Separação entre estado, validação e publicação
Conteúdo nasce em rascunho; origem oficial não é validação; validar não é publicar. Fontes cadastradas pela interface nascem `rascunho` e `publicado: false`, e a LAC segue com `versaoPublicadaId: null`.

### Rastreabilidade conteúdo–fonte
Toda orientação aponta para uma fonte; o que não é sustentado fica `PENDENTE`. Ver `services/lac/versoes/v1/` e `docs/REVISAO_CONTEUDO_LAC.md`.

### Isolamento por configuração e conferência do build
Funcionalidades de desenvolvimento usam `apply: 'serve'` no Vite; `scripts/check-dist.js` procura no `dist/` textos de teste, rotas, token e código administrativo (de 31 para 83 termos conforme a administração cresceu).

### Segurança e gravação segura
Token em memória, validação de origem, erros genéricos; gravações administrativas tudo ou nada (ensaio, escrita atômica, conferência e desfazer), revisão otimista para fontes e uma gravação por vez. Ver `tests/admin-endpoint.test.js`, `tests/admin-cadastro-endpoint.test.js` e `tests/admin-fontes-endpoint.test.js`.

### Testes manuais registrados com honestidade
`docs/TESTES_MANUAIS.md` guarda data, ambiente, resultado e quem executou; o que depende de gravação real fica "não executado" até haver evidência.

### Documentação viva e controle de versão
Documentos atualizados no ciclo do passo; commits de escopo objetivo em português, push sem `--force` e `main = origin/main` ao final.

## Lições aprendidas

- Um teste manual criou assunto e serviço reais na base; a limpeza foi feita pelo Git e registrada, o que levou à regra de restaurar dados antes de seguir.
- Expectativas erradas em testes (não o código) foram corrigidas e relatadas, em vez de enfraquecer o código.
- Um comando de shell com aspas mal escapadas corrompeu um arquivo; o arquivo foi restaurado do Git e a alteração refeita com a ferramenta de edição.
- Um evento de interface (`close` do diálogo) chegou atrasado no navegador de teste; o foco passou a ser devolvido na hora, sem depender do evento.

## Como medir

- **Testes:** `npm test` (contagem e falhas).
- **Base:** `npm run validate:services`.
- **Build limpo:** `npm run build` e `node scripts/check-dist.js`.
- **Higiene:** `git diff --check` e `git status` limpos após o push.
