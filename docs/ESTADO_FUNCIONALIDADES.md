# Estado das funcionalidades

Situação em 19/11/2026, conferida nos arquivos do repositório (`main` em `89819eb`). Cada linha cita os arquivos que comprovam a situação.

- **Implementado:** existe no código e tem testes automatizados.
- **Parcial:** existe, mas com limitação que o plano ainda precisa resolver.
- **Planejado:** ainda não existe no código; está em `docs/SPRINTS.md`.
- **Cancelado:** retirado do projeto por decisão da usuária.

## Chat público

| Funcionalidade | Situação | Comprovação |
|---|---|---|
| Pergunta livre, envio, reinício, 390 px e teclado | Implementado | `index.html`, `src/main.js`, `src/chat.js`, `src/styles.css`; `tests/chat.test.js`, `e2e/chat.spec.js` |
| Motor de respostas determinístico (sem IA externa) | Implementado | `src/assistant.js`; `tests/assistant.test.js` |
| Resposta só com conteúdo publicado | Implementado | `src/assistant.js`, `src/main.js`, `services/publicacao-publica.js`, `services/conteudo-publico-build.js`; `tests/chat-publicado.test.js`, `e2e-real/chat-publicado-real.spec.js` |
| Conteúdo de teste local (só no `npm run dev`, com faixa) | Implementado | `services/assistant-endpoint.js`, `services/assistant-content.js`, `services/assistant-messages.js`; `tests/assistente-endpoint.test.js`, `tests/conteudo-assistente-lac.test.js` |
| Mensagem segura sem conteúdo | Implementado | `src/assistant.js`; `tests/assistant.test.js` |
| Pergunta de esclarecimento | Parcial: texto fixo que cita a LAC | `src/assistant.js` (`PERGUNTA_ESCLARECIMENTO`) |
| Exibição de fontes | Parcial: o título "Fontes oficiais:" aparece mesmo para fonte não oficial; texto cadastrado não mostra fonte | `src/main.js` |
| Motivo da recusa na resposta | Planejado (Sprint 10) | — |
| Conversa sem persistência | Implementado | `src/main.js`, `src/chat.js` (estado só em memória) |

## Base de conteúdo

| Funcionalidade | Situação | Comprovação |
|---|---|---|
| Registro central, assuntos e serviços por pasta | Implementado | `services/registry.json`, `services/assuntos.json`, `services/schemas/`; `tests/services.test.js`, `tests/assuntos.test.js` |
| Versões, hash canônico, congelamento e nova versão | Implementado | `services/admin/versao.js`, `conteudo-versao.js`, `versao-arquivos.js`, `congelamento.js`, `nova-versao.js`; `tests/admin-versao.test.js`, `tests/versao-*.test.js`, `tests/nova-versao.test.js` |
| Validação automatizada da base | Implementado | `scripts/validate-services.js`; `tests/services.test.js` |
| Vigência de normas (norma revogada nunca publicada) | Implementado | `scripts/validate-services.js`, `services/admin/revisao.js`; `tests/vigencia.test.js` |
| Conteúdo da LAC | Parcial: cadastrado em validação, **não publicado** e sem validação material | `services/lac/versoes/v1/`; `tests/fontes-lac.test.js`, `tests/documentos-lac.test.js`, `tests/perguntas-lac.test.js`, `tests/roteiro-lac.test.js` |
| Lista de documentos da LAC (conteúdo informativo) | Parcial: em validação, `obrigatorio: null` | `services/lac/versoes/v1/documentos.json`; `tests/documentos-lac.test.js` |

## Administração local (só `npm run dev`)

| Funcionalidade | Situação | Comprovação |
|---|---|---|
| Endpoint local com token em memória e origem local | Implementado | `services/admin/admin-endpoint.js`, `vite.config.js`; `tests/admin-endpoint.test.js`, `tests/admin-isolamento.test.js` |
| Cadastro de tema, serviço, texto e link | Implementado | `services/admin/cadastro.js`, `cadastro-guiado.js`, `gestao-simples.js`, `entradas.js`, `entradas-gravacao.js`; `tests/admin-cadastro*.test.js`, `tests/entradas-*.test.js` |
| Gravação tudo ou nada com desfazer | Implementado | `services/admin/transacao.js`, `armazenamento.js`; `tests/admin-armazenamento.test.js` |
| Edição e exclusão lógica de fontes | Implementado | `services/admin/edicao-fonte.js`; `tests/edicao-fonte.test.js`, `e2e-real/edicao-fonte-real.spec.js` |
| Edição de tema e serviço | Implementado | `services/admin/edicao-tema-servico.js`; `tests/edicao-tema-servico.test.js` |
| Importação do conteúdo existente | Implementado | `services/admin/importacao-conteudo.js`; `tests/importacao-conteudo.test.js` |
| Revisão de fontes, aceitação de informações e conclusão | Implementado | `services/admin/revisao.js`, `revisao-servico.js`; `tests/revisao.test.js`, `tests/admin-revisao-*.test.js` |
| Autorização e publicação em ações separadas | Implementado | `services/admin/publicacao.js`, `services/publicacao-publica.js`; `tests/publicacao.test.js`, `e2e-real/publicacao-real.spec.js` |
| Revogação de conteúdo publicado | Planejado (diagnóstico na Sprint 7, prova na Sprint 9) | — |
| Registro do responsável pela ação | Parcial: ator fixo "Servidor de demonstração", sem identidade | `services/admin/historico-revisao.js` (`ATOR_DEMONSTRACAO`), `services/admin/decisoes.js` |
| Histórico das ações (fora do Git) | Parcial: só ações concluídas, sem tentativas negadas nem perfil | `services/admin/historico-revisao.js` |
| Login simulado com perfis Cadastrante e Revisor (RBAC) | Planejado (Sprint 8) | — |
| Auditoria com usuário, perfil, setor, ação, resultado, horário e tentativas negadas | Planejado (Sprint 8) | — |
| Saúde do sistema | Implementado | `services/admin/saude.js`, `admin/saude/`; `tests/admin-saude*.test.js`, `e2e/saude.spec.js` |
| Validação material real (autora e CLABI) | Planejado (Sprint 11) | — |

## Build, testes e engenharia assistida

| Funcionalidade | Situação | Comprovação |
|---|---|---|
| Build sem administração nem conteúdo de teste | Implementado | `scripts/check-dist.js`, `vite.config.js` |
| Testes automatizados (`node --test`) | Implementado | `tests/*.test.js` |
| Testes de ponta a ponta (somente leitura e com cópia da base) | Implementado | `e2e/`, `playwright.config.js`, `e2e-real/`, `playwright.real.config.js` |
| Skills e subagentes do projeto | Implementado | `.claude/skills/`, `.claude/agents/` |
| MCP local de consulta da base | Implementado | `.mcp.json`, `scripts/mcp/`; `tests/mcp-*.test.js` |
| Hook de proteção do Claude Code (regras A1 a A7) | Implementado (Sprint 6, Passo 6A) | `.claude/settings.json`, `scripts/hooks/protecao-claude.js`; `tests/hook-claude.test.js` |
| Pre-commit do Git e verificação no GitHub | Planejado (Sprint 6, Passos 6B e 6D) | — |
| Publicação na Vercel | Planejado (Sprint 12) | — |

## Fora do plano atual

| Funcionalidade | Situação | Comprovação |
|---|---|---|
| IA externa (preparação de conteúdo e chat híbrido) | Planejado para depois do ciclo editorial; provedor a definir | — |
| Login real com conta Google institucional, banco de dados e auditoria persistente | Planejado para a preparação institucional | — |
| SEMA Check (checklist declarativo com marcação e progresso) | Cancelado | `docs/REQUISITOS.md`, `docs/BACKLOG.md` |
