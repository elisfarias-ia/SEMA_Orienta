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
| Revogação de conteúdo publicado | Implementado (Sprint 7, Passos 7A a 7E): administração local, pre-commit e verificação da PR (regras B1R e B2R); botão e diálogo conferidos no navegador por teste de ponta a ponta com cópia temporária (7E); prova do ciclo completo com perfis na Sprint 9 | `services/admin/fluxo.js`, `services/admin/decisoes.js` (`revogarVersao`), `services/admin/versao.js`, `services/admin/publicacao.js` (`revogar`), `services/admin/admin-endpoint.js`, `admin/conteudo/`, `scripts/validate-services.js`, `scripts/hooks/regras.js`, `scripts/hooks/pre-commit.js`, `scripts/hooks/verificar-pr.js`; `tests/revogacao.test.js`, `tests/revogacao-rota.test.js`, `tests/hook-revogacao.test.js`, `e2e-real/revogacao-real.spec.js`; `docs/TESTES_MANUAIS.md` |
| Registro do responsável pela ação | Implementado no ambiente local, sem identidade real: as gravações registram o ator real da sessão `{ usuarioId, perfil, setor }` (Maria Silva ou Carlos Silva, fictícios, da CLABI); não há mais ator padrão; o de demonstração vale só na leitura de registros antigos (Sprint 7, Passo 7C; Sprint 8, Passos 8A a 8C) | `services/admin/atores.js`, `services/admin/sessao.js`, `services/admin/historico-revisao.js`, `services/admin/decisoes.js`, `services/admin/revisao-servico.js`, `services/admin/publicacao.js`; `tests/atores.test.js`, `tests/permissoes-aplicadas-endpoint.test.js` |
| Histórico das ações (fora do Git) | Implementado no ambiente local (Sprint 8, Passo 8C): ações de revisão e cadastros com versão (`acao_revisao`), cadastros de tema e serviço (`acao_cadastro`) e tentativas negadas por perfil (`acao_negada`), sempre com o ator real e sem nome, título, URL ou texto. Limitação conhecida: um registro pode sobrar se a gravação falhar depois da conferência | `services/admin/historico-revisao.js`, `services/admin/admin-endpoint.js`; `tests/permissoes-aplicadas-endpoint.test.js`, `tests/atores.test.js` |
| Responsáveis públicos no manifesto | Implementado (Sprint 7, Passo 7C): só perfil e setor de quem validou, autorizou, publicou ou revogou; nunca `usuarioId`, nome ou e-mail | `services/admin/versao.js` (`responsaveis`), `services/schemas/versao.schema.json`; `tests/atores.test.js` |
| Login simulado com perfis Cadastrante e Revisor (RBAC) | Parcial: escolha entre Maria Silva e Carlos Silva (fictícios, sem senha), sessão única em memória com token novo a cada entrada, topo com "Nome — Perfil", "Trocar usuário" e "Sair" (Sprint 8, Passo 8B); matriz de permissões aplicada nas 25 rotas que gravam (403 antes de ler o corpo) e nos serviços, com controles da tela em `aria-disabled` (Passo 8C). Falta a separação de "concluir revisão" em enviar para revisão e validar (8D). Não é autenticação | `services/admin/sessao.js`, `services/admin/admin-endpoint.js`, `services/admin/atores.js`, `services/admin/permissoes.js`, `admin/`; `tests/sessao.test.js`, `tests/admin-sessao-endpoint.test.js`, `tests/admin-sessao-interface.test.js`, `tests/atores.test.js`, `tests/permissoes.test.js` |
| Auditoria com usuário, perfil, setor, ação, resultado, horário e tentativas negadas | Implementado no ambiente local (Sprint 8, Passo 8C), em `data/admin-private/`, fora do Git; auditoria persistente institucional fica para a preparação institucional | `services/admin/historico-revisao.js`, `services/admin/acoes-das-rotas.js`; `tests/permissoes-aplicadas-endpoint.test.js`, `tests/acoes-das-rotas.test.js` |
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
| Hook de proteção do Claude Code (regras A0 a A7) | Implementado (Sprint 6, Passo 6A); A1, A3 e A5 conferidas ao vivo (Passo 6C) | `.claude/settings.json`, `scripts/hooks/protecao-claude.js`; `tests/hook-claude.test.js`; `docs/TESTES_MANUAIS.md` |
| Pre-commit do Git (regras B0 a B5) | Implementado (Sprint 6, Passo 6B); vale em cada cópia depois de `npm run hooks:instalar`; B1 conferida ao vivo pela usuária (Passo 6C) | `.githooks/pre-commit`, `.githooks/publicacoes-autorizadas.json`, `scripts/hooks/pre-commit.js`, `scripts/hooks/regras.js`; `tests/hook-pre-commit.test.js`; `docs/TESTES_MANUAIS.md` |
| Verificação no GitHub em toda PR (regras B0 a B5 e verificação completa) | Implementado (Sprint 6, Passo 6D) | `.github/workflows/protecao-pr.yml`, `scripts/hooks/verificar-pr.js`, `scripts/hooks/pre-commit.js` (`analisarAlteracoes`); `tests/hook-verificar-pr.test.js` |
| Publicação na Vercel | Planejado (Sprint 12) | — |

## Fora do plano atual

| Funcionalidade | Situação | Comprovação |
|---|---|---|
| IA externa (preparação de conteúdo e chat híbrido) | Planejado para depois do ciclo editorial; provedor a definir | — |
| Login real com conta Google institucional, banco de dados e auditoria persistente | Planejado para a preparação institucional | — |
| SEMA Check (checklist declarativo com marcação e progresso) | Cancelado | `docs/REQUISITOS.md`, `docs/BACKLOG.md` |
