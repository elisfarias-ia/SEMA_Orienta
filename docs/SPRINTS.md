# Sprints

Planejamento em ciclos curtos, com objetivo, backlog, critérios de aceite e Definition of Done. As datas e a duração são definidas pela equipe; este documento não as inventa.

## Sprint 1 — Engenharia assistida e saúde do sistema

- **Período:** a definir.
- **Objetivo:** tornar a metodologia, o estado operacional e os principais fluxos do SEMA Orienta verificáveis, sem alterar a base da LAC ou publicar a administração.
- **Ponto de partida:** a administração local cadastra assunto, serviço e fonte; a LAC está estruturada, em validação e não publicada; a bateria tem 499 testes sem falhas.
- **Fora da Sprint:** validação material da LAC (revisão de vigência, decisões e publicação), IA externa (`/api/chat`), SEMA Check, autenticação institucional, novos serviços e qualquer alteração nos dados da LAC.

### Backlog da Sprint

| ID | Passo | Entrega | Situação |
|---|---|---|---|
| 8A | `CLAUDE.md`, metodologia e templates Git | Regras permanentes, técnicas com situação e evidências, modelos de issue e de pull request | **Concluído** (PR #2) |
| 8B | Endpoint e tela de saúde | Estado operacional do sistema, visível só no ambiente local de desenvolvimento | **Concluído** (13/11/2026) |
| 8C | Playwright dos fluxos críticos | Testes de ponta a ponta do chat público, da administração local e da ausência da administração no build | **Concluído** (13 testes) |
| 8D | Documentação, evidências e fechamento | Documentos atualizados, evidências reunidas e retrospectiva da Sprint | **Concluído** (PR #4) |

**Situação da Sprint:** concluída e integrada à `main` pela PR #4 (13/11/2026, merge `0e4b33b`); Issue #3 fechada. Verificações do fechamento (validação da base, `npm test`, `npm run test:e2e`, build, `check-dist` e `git diff --check`) e evidências em `docs/EVIDENCIAS_SPRINT_1.md`. Os testes E2E são somente leitura e não cobrem o `preview` nem o build; a ausência da administração e da faixa de teste no `dist/` é verificada pelo `check-dist` e por testes Node.

### Critérios de aceite

- **8A:**
  - `CLAUDE.md` traz arquitetura, comandos, limites, segurança e regras permanentes.
  - `docs/METODOLOGIA_DESENVOLVIMENTO.md` classifica cada técnica como comprovada, parcialmente comprovada ou não demonstrada, só com evidência existente, e lista os próximos passos.
  - Há modelos mínimos de issue e de pull request em `.github/`.
  - Nenhum arquivo de aplicação, dependência ou dado foi alterado.
- **8B (concluído):**
  - O endpoint de saúde é somente leitura, existe só no servidor de desenvolvimento e aceita só conexão local, com as mesmas proteções dos demais endpoints administrativos.
  - Informa o estado operacional (por exemplo, a base válida e as contagens de serviços, versões e fontes) sem expor caminhos, token, conteúdo da base ou dados pessoais, e com erros genéricos.
  - A tela de saúde mostra o estado em linguagem clara, é acessível por teclado, responsiva e não aparece no `dist/`.
  - Testes automatizados cobrem sucesso, falha, origem, método e isolamento do build.
- **8C:**
  - O Playwright é adicionado como dependência de desenvolvimento somente neste passo, com aprovação expressa, e não entra no build.
  - Os fluxos críticos cobertos são: pergunta no chat público com resposta segura; catálogo e validação dos formulários da administração com abertura e "Voltar" da confirmação; `/admin/` e a rota administrativa ausentes no `preview`.
  - Os testes não gravam na base real (usam cópia temporária ou não confirmam gravação) e não dependem de rede externa.
  - A execução é reproduzível por um único comando documentado.
- **8D:**
  - README, arquitetura, administração, backlog e testes manuais refletem o estado real, com testes não executados marcados como tais.
  - As evidências (saída das verificações, contagem de testes e hashes dos commits) estão reunidas.
  - A retrospectiva registra o que foi concluído, o que ficou pendente e os ajustes de processo.

### Definition of Done

**Comum aos quatro passos:**

1. Escopo do passo cumprido e nada além dele.
2. Nenhuma alteração nos dados da LAC nem no que o chat público mostra, salvo o que o passo declara.
3. Nenhum segredo, token ou dado pessoal no código, nos testes, na documentação ou no Git.
4. `git diff --check` sem problemas e documentação do passo atualizada.
5. Revisão e aprovação da pessoa responsável antes do commit; commit de escopo objetivo, push sem `--force`, `main = origin/main` e `git status` limpo.

**Específica:**

- **8A:** Markdown conferido (títulos, links e blocos), sem referências externas, sem testes ou build exigidos.
- **8B:** `npm run validate:services`, `npm test`, `npm run build` e `node scripts/check-dist.js` executados e sem falhas, com `dist/` sem rota, tela ou conteúdo de saúde.
- **8C:** a suíte do Playwright passa em execução real, com a saída guardada como evidência; os demais testes e o build continuam passando; a dependência nova está justificada e registrada.
- **8D:** nenhuma afirmação sem evidência; pendências e riscos listados; Sprint encerrada com a retrospectiva.

### Riscos

- Administração local sem autenticação: não pode ser usada fora do ambiente de desenvolvimento.
- O Playwright baixa navegadores e exige ambiente preparado; falhas de ambiente não devem ser confundidas com falhas do sistema.
- O endpoint de saúde não pode vazar informação interna.

### Revisão e retrospectiva

Ao final da Sprint, registrar o que foi concluído, o que ficou pendente e o motivo, os riscos que mudaram e os ajustes de processo em `docs/METODOLOGIA_DESENVOLVIMENTO.md`.

## Sprint 2 — Engenharia assistida (skills, subagentes e MCP)

- **Objetivo:** apoiar o desenvolvimento com skills, subagentes e um servidor MCP local de consulta da base, sem alterar a aplicação, os dados da LAC nem o que o chat público mostra.
- **Entregas:** skills do projeto (`7459a28`), subagentes (`2875966`), MCP local somente leitura com quatro ferramentas (`d7fbc97`) e demonstração real (`d230773`).
- **Não implementado:** o Passo 2D (hook de proteção) foi cancelado nesta Sprint por decisão da usuária; voltou ao plano como Sprint 6.
- **Verificação de fechamento:** validação da base, 570 testes (566 passaram, 4 ignorados), 13 testes e2e, build e `check-dist` sem falhas.
- **Evidências:** `docs/EVIDENCIAS_SPRINT_2.md` e `docs/EVIDENCIAS_MCP.md`.

## Sprint 3 — Informações do chatbot (blocos de conhecimento em rascunho)

- **Objetivo:** permitir cadastrar, editar e excluir, na administração local, informações em rascunho sustentadas por fontes oficiais, sem publicar nada e sem alterar o chat público.
- **Entregas:** modelo, validador e regras (`658edc1`), endpoints locais (`81ef0c3`), página `/admin/conteudo/` com conferência manual aprovada em 13/11/2026 (`0f071d1`) e fechamento com `check-dist` ampliado e evidências.
- **Verificação de fechamento:** validação da base, 623 testes (619 passaram, 4 ignorados por falta de permissão para links simbólicos), 27 testes e2e, build e `check-dist` sem falhas.
- **Fora do escopo:** IA, busca semântica, upload, publicação e criação automática de nova versão.
- **Transferido:** o cadastro guiado de assunto, serviço e fontes foi para a Sprint 4 (Issue #8).
- **Evidências:** `docs/EVIDENCIAS_SPRINT_3.md`.

## Sprint 4 — Gestão simples de conteúdo por serviço (concluída em 15/11/2026, Issue #8)

- **Objetivo:** cadastrar informação por serviço em um único caminho: escolher ou criar o serviço e adicionar texto, link novo ou fonte existente.
- **Fechamento (15/11/2026):** conferência manual aprovada e verificações finais executadas; evidências em `docs/EVIDENCIAS_SPRINT_4.md`. Nada foi publicado e o chat público não mudou.
- **Situação durante o replanejamento (15/11/2026):** o núcleo transacional do 4A (`e370b28`) é mantido. O 4B (interface do cadastro guiado) foi **reprovado na avaliação manual**; suas alterações não commitadas estão preservadas até decidir o que será reaproveitado ou substituído.
- **Escopo:** reproduzir as falhas contra o servidor real e registrar a causa; teste de integração real sem simular todas as rotas; entrada de demonstração ("Entrar como servidor de demonstração", token só em memória, aviso de que não é autenticação real); lista de serviços; serviço existente reutiliza o assunto relacionado; serviço novo tem o campo único "Tema" (selecionar ou digitar, sem identificador e sem etapa separada); sigla e termos equivalentes não são pedidos; tarefa "Adicionar informação" com texto original preservado, versionado e com hash; remoção do modo avançado, dos formulários paralelos, dos radios grandes e dos identificadores visíveis.
- **Fora do escopo:** revisão e publicação, links seguros, agente, busca, JSON público, "Mais opções", provedor de IA, upload, autenticação real, refatoração obrigatória das rotas.
- **Regras:** o texto ou link submetido não chega ao chatbot antes da revisão, autorização e publicação; o texto original é preservado internamente, versionado e com hash, e origina só sugestões de blocos; a interface orienta a não inserir dados pessoais nem conteúdo restrito; a forma de entrada é `formaEntrada: "texto" | "link"`.
- **A aprovar antes de implementar:** contrato de armazenamento do texto original (mudança de esquema, manifesto ou dados) e aproveitamento final das peças do 4B.
- **Passo 4B1 (modelo de dados e gravação de entradas de texto; sem interface, rotas ou reutilização de fonte):** `entradas.json` por versão, `formaEntrada` nas fontes (`texto_cadastrado`), módulos `services/admin/entradas.js` e `entradas-gravacao.js`, validador e testes `tests/entradas-*.test.js`; `descricao` do assunto opcional. Também: `arquivos.entradas` opcional em `versao-atual.js` e no MCP, `service.schema.json` atualizado e serviço novo nasce com `entradas.json` vazio. Registrado em docs/ARQUITETURA.md.
- **4B1, correção:** reutilização de links entre serviços (busca somente leitura, cópia em rascunho com `reutilizadaDe`, só link validado e não revogado; texto nunca) e proteção do MCP contra fonte textual não publicada. Reauditoria obrigatória antes de aprovar o 4B1. **Pendência impeditiva de commit:** o teste L23 (lista exata de `admin/`) depende da interface do 4B2.
- **Passo 4B2 (gestão simples por serviço):** `/admin/` com entrada de demonstração (não é autenticação real; token só em memória), serviços, tema único, Adicionar informação (texto, link novo, link já cadastrado), rotas novas com a trava comum, detecção de credenciais de alta confiança, interface do 4B reprovado removida e teste Playwright real (`npm run test:e2e:real`, Vite na porta 5183 com cópia temporária de `services/`). Conferência manual: funcionalidades e linguagem aprovadas; responsividade reprovada e corrigida (texto ampliado: grade da saúde com largura mínima em rem, rótulos de fonte sem quebra); conferência visual aprovada e Sprint fechada com a bateria completa, o build e o `check-dist`.
- **Aceite, testes e DoD:** na Issue #8.

## Sprint 5 — Revisão, aprovação humana e publicação (concluída e integrada pela PR #12; Issue #11 fechada)

- **Objetivo:** revisar conteúdo, concluir a revisão (versão e hash congelados), autorizar e publicar em ações humanas separadas.
- **Regras:** só a versão expressamente autorizada, com as informações aceitas e suas fontes ativas, é publicada; a versão publicada anterior permanece ativa; alteração posterior exige nova versão; "Servidor de demonstração" não comprova identidade; texto cadastrado nunca mostra fonte e link mostra só a URL.
- **Passo 5A (domínio e hash):** hash canônico com `entradas.json`, congelamento, nova versão com cópia independente, `versaoPublicadaId` podendo apontar para versão anterior (commit `7a3cf4e`).
- **Passo 5B1 (domínio, rotas e histórico da revisão):** revisar fonte, aceitar/rejeitar informação, pendências, concluir revisão sem autorizar nem publicar, histórico privado (`78c398a`).
- **Passo 5B2 (interface da revisão):** dentro de `/admin/` e `/admin/conteudo/` (`0cd1170`).
- **Passo 5B3a (editar e excluir fontes):** edição de links e textos; exclusão lógica invisível, sem lixeira, com remoção das referências ativas em transação única; excluídos fora de chatbot, MCP e novas versões; "Resolver pendências" (`f506688`).
- **Passo 5B3b (editar tema e serviço):** nome do tema com impacto e confirmação; nome e tema do serviço na versão em elaboração; id imutável (`495d646`).
- **Passo 5B3c (importar conteúdo existente):** candidatos lidos do conteúdo antigo, um item por vez, em elaboração, com fonte ativa obrigatória e origem interna contra duplicação; a LAC real não foi convertida (`0f31170`); ajuste: lista reduzida a 24 orientações (sem documentos, normas, links nem conteúdo de teste), frase padronizada de pendência removida só no preenchimento e aviso de conteúdo antigo; conferência manual aprovada.
- **Passo 5C (autorizar e publicar):** três ações separadas; publicação em transação única com rollback; conteúdo público imutável em `services/<serviço>/publico/conteudo-<hash16>.json` (esquema fechado); chatbot, build e `check-dist` usam só o publicado (`eabe3c8`).
- **Fora do MVP / limitações:** sem autenticação real (entrada de demonstração); sem publicação real da LAC (continua em validação e não publicada); sem IA externa; edição de documentos e perguntas frequentes antigos não implementada; 4 testes de link simbólico NÃO TESTADOS no Windows (EPERM).
- **Evidências:** `docs/TESTES_MANUAIS.md` e Issue #11. Integrada à `main` pela PR #12 (merge `9a06b97`).

## Replanejamento após a avaliação do professor (19/11/2026)

A avaliação do professor motivou este replanejamento. As Sprints 6 a 8 antes previstas (IA na preparação do conteúdo, chat híbrido com IA e preparação institucional) foram substituídas pela sequência abaixo.

- **Prioridade:** concluir o ciclo editorial de um serviço com conteúdo materialmente validado. Demonstrar um bloco autorizado chegando à resposta e um bloco revogado deixando de ser usado. A IA fica para depois.
- **Motor atual:** determinístico, sem IA externa. A IA externa é evolução proposta, sem provedor definido (Gemini e Ollama local serão avaliados no futuro).
- **SEMA Check:** retirado do projeto por decisão da usuária; não será desenvolvido.
- **Validação material no sistema:** a conferência técnica da autora contra as fontes oficiais corresponde ao envio para revisão (Cadastrante); a validação material é a ação "validar materialmente", feita dentro do sistema por quem estiver logado com o perfil Revisor, que deve ser ocupado por alguém com autoridade da CLABI (Coordenadoria de Licenciamento Ambiental de Baixo Impacto) quando a validação for real, começando por um recorte pequeno da LAC. Hoje só existem os usuários fictícios de demonstração, o login simulado não comprova quem validou e não há confirmação externa separada. Só o conteúdo validado materialmente no sistema por Revisor com autoridade da CLABI pode ser publicado de verdade.
- **Perfis da administração local:** login simulado com dois perfis (RBAC), substituindo o "Servidor de demonstração". **Cadastrante** cadastra fontes e informações e envia para revisão. **Revisor** revisa, registra a validação material, autoriza, publica e revoga. Usuários fictícios de demonstração: Maria Silva (Cadastrante, CLABI) e Carlos Silva (Revisor, CLABI). Não há perfil Administrador; a lista de usuários é fixa. Cada ação relevante fica registrada em auditoria (usuário, perfil, setor, ação, resultado e horário), incluindo tentativas negadas.

> **Apenas planejamento.** Salvo as Sprints 6 e 7, concluídas, nenhuma destas Sprints foi iniciada, e os escopos poderão ser refinados no planejamento de cada uma. Cada Sprint terá Issue, branch, diagnóstico e aprovação próprios.

## Sprint 6 — Hook de proteção (concluída, Issue #19)

- **Objetivo:** proteger o repositório durante o desenvolvimento assistido (retoma o Passo 2D, não implementado na Sprint 2), conforme a recomendação do professor: impedir publicação sem validação e detectar inclusão indevida de conteúdo administrativo no build.
- **Passo 6A (hook do Claude Code):** concluído e integrado pela PR #20. `.claude/settings.json` e `scripts/hooks/protecao-claude.js`, com as regras A1 a A7 e a liberação por prazo curto (`docs/ADMINISTRACAO.md`); testes em `tests/hook-claude.test.js`.
- **Passo 6B (pre-commit do Git):** concluído e integrado pela PR #21. `.githooks/pre-commit`, `scripts/hooks/pre-commit.js` e `scripts/hooks/regras.js`, com as regras B0 a B5, liberação por `.githooks/publicacoes-autorizadas.json`, lista documentada de domínios de e-mail permitidos (com o domínio fictício `orgaoexemplo.gov.br`) e `npm run hooks:instalar` (`docs/ADMINISTRACAO.md`); testes em `tests/hook-pre-commit.test.js`, inclusive em repositórios Git temporários.
- **Passo 6C (conferência manual, evidências e documentação):** concluído. Evidências ao vivo em `docs/TESTES_MANUAIS.md`: B1 conferida pela usuária; A1, A3 e A5 conferidas pelo assistente numa sessão real do Claude Code. As demais regras estão cobertas só pelos testes automatizados.
- **Passo 6D (verificação no GitHub):** concluído. O workflow `.github/workflows/protecao-pr.yml` roda em toda PR, só com permissão de leitura e sem segredos: aplica as regras B0 a B5 à diferença entre o main e a PR (`scripts/hooks/verificar-pr.js`, com a mesma função de análise do pre-commit, `analisarAlteracoes`) e depois `npm run build`, `npm test`, `npm run validate:services` e `node scripts/check-dist.js` (o build vem antes dos testes para que os testes que conferem o `dist/` também rodem no GitHub). Sem dependência nova; testes em `tests/hook-verificar-pr.test.js`. A primeira execução real no GitHub é a da própria PR do 6D.
- **Critérios de aceite e Definition of Done:** na Issue #19.

## Sprint 7 — Revogação e registro do responsável (concluída, Issue #24)

- **Objetivo:** permitir tirar de uso um conteúdo já publicado e preparar o registro do responsável por cada ação (perfil e setor), abrindo caminho para o login simulado (Sprint 8) e a prova do ciclo com revogação (Sprint 9).
- **Decisões da usuária:** duas formas de retirada (revogação da versão inteira e retirada de bloco por nova versão); depois de revogar, nada volta a publicado sem nova autorização; o comportamento do `npm run dev` não muda nesta Sprint; revogação sem autorização registrada no pre-commit, mas com motivo obrigatório e checagem de coerência; histórico público com perfil e setor, nunca nome (nomes só em `data/admin-private/`).
- **Passo 7A (domínio da revogação, funções puras):** concluído e integrado pela PR #25. Estado `revogado` e ação `revogar` (só a partir de `publicado`) em `services/admin/fluxo.js`; `revogarVersao` e a decisão `revogacao` com motivo obrigatório em `services/admin/decisoes.js` (esquema `services/schemas/revogacao.schema.json`); `revogadoEm` em `services/admin/versao.js`; três checagens no validador da base (`scripts/validate-services.js`). Testes em `tests/revogacao.test.js`.
- **Passo 7B (rota, transação e botão):** concluído e integrado pela PR #26. `POST .../revogacao` em transação única com rollback (`services/admin/publicacao.js`, `services/admin/admin-endpoint.js`), botão "Revogar publicação" com confirmação e motivo obrigatório (`admin/conteudo/`, `admin/admin-logic.js`); com autorização expressa da usuária para a mudança no que o chat público mostra (regra 10). Testes em `tests/revogacao-rota.test.js`.
- **Passo 7C (ator como parâmetro):** concluído e integrado pela PR #27. Ator `{ usuarioId, perfil, setor }` conferido contra a lista fixa de `services/admin/atores.js` (nesta Sprint, só o ator de demonstração, com o perfil `demonstracao`); histórico com resultado `ok` ou `negado`; decisões no formato novo, com o antigo (`responsavel` e `unidade`) aceito na leitura; manifesto com `responsaveis` (só perfil e setor, por etapa). Testes em `tests/atores.test.js`.
- **Passo 7D (pre-commit e GitHub tratando a revogação):** concluído e integrado pela PR #28. Em `scripts/hooks/regras.js`, a regra B2 aceita a revogação sem autorização, mas exige coerência e barra a volta de uma versão revogada a publicado (B2R); a regra B1 passa a barrar a remoção de arquivo público, salvo quando a versão correspondente está revogada (B1R). A análise comum (`analisarAlteracoes`, em `scripts/hooks/pre-commit.js`) confere as remoções e o registro; a verificação da PR (`scripts/hooks/verificar-pr.js`) reaproveita tudo, só informando como listar os arquivos do último commit da PR. Testes em `tests/hook-revogacao.test.js`.
- **Passo 7E (documentação, evidências e conferência):** concluído. A conferência do botão e do diálogo de revogação, pendente desde o 7B, foi feita pelo teste de ponta a ponta `e2e-real/revogacao-real.spec.js`, executado de verdade no navegador, com cópia temporária da base e dados fictícios; evidência e o que ainda exigiria conferência manual em `docs/TESTES_MANUAIS.md`.
- **Fechamento:** os Passos 7A a 7E estão concluídos. Critérios de aceite e Definition of Done na Issue #24. Ficam para a Sprint 8: login simulado com os perfis Cadastrante e Revisor, registro das tentativas negadas pelas rotas e a separação de "concluir revisão" em enviar para revisão e validar materialmente.

## Sprint 8 — Login simulado com perfis e auditoria (concluída, Issue #30 fechada em 21/11/2026; PRs #33, #36, #37, #38 e #39)

- **Objetivo:** substituir o "Servidor de demonstração" por login simulado com os perfis Cadastrante e Revisor, com lista fixa de usuários fictícios (Maria Silva e Carlos Silva, CLABI), sem perfil Administrador.
- **Auditoria:** usuário, perfil, setor, ação, resultado e horário de cada ação relevante, incluindo tentativas negadas.
- **Limite:** o login simulado não é autenticação real; o login com a conta Google institucional fica para a preparação institucional.
- **Passo 8A (usuários e matriz de permissões, funções puras):** concluído (PR #33). Em `services/admin/atores.js`, os usuários selecionáveis (`USUARIOS_SELECIONAVEIS`: Maria Silva, Cadastrante, e Carlos Silva, Revisor, ambos fictícios, da CLABI) e os atores aceitos (`ATORES_ACEITOS`: o de demonstração, Maria e Carlos, sem nome), com `validarAtorSelecionavel` e `atorDoUsuario`; o ator de demonstração continua o padrão até o 8C. Em `services/admin/permissoes.js`, a matriz `PERMISSOES` (cada ação com exatamente um perfil; o de demonstração sem nenhuma), `podeExecutar` e `acoesDoPerfil`, ainda não usadas pelas rotas. Nenhuma rota, tela ou dado da base muda. Testes em `tests/permissoes.test.js` e `tests/atores.test.js`.
- **Passo 8B (login simulado):** concluído (PR #36). Módulo puro `services/admin/sessao.js` (sessão única em memória, token novo a cada entrada, só usuários selecionáveis, saída só com o token atual); rotas `GET`, `POST` e `DELETE /__admin/sessao` em `admin-endpoint.js`; escolha de usuário em `/admin/` (fieldset com rádios, aviso de usuários fictícios sem senha), topo com "Nome — Perfil", "Trocar usuário" e "Sair", e o nome também nas páginas de conteúdo e de saúde; `check-dist` procura os nomes e módulos novos. **Efeito colateral até o 8C:** o topo das páginas mostra o nome de quem entrou (por exemplo, "Maria Silva — Cadastrante"), mas os registros (histórico privado, decisões e manifesto da versão) **continuam com o ator de demonstração**: o ator da sessão ainda não é repassado às gravações, e nenhuma permissão por perfil é aplicada. Isso muda no 8C. Testes novos em `tests/sessao.test.js`, `tests/admin-sessao-endpoint.test.js` e `tests/admin-sessao-interface.test.js`; os testes existentes que pegavam o token com GET passaram a entrar com POST. Roteiro manual em `docs/TESTES_MANUAIS.md` (não executado).
- **Passo 8C (permissões aplicadas nas gravações):** concluído (PR #37). O ator da sessão é conferido uma vez por pedido (`sessao.atorDoToken`) e repassado a todas as gravações, que agora registram o ator real (fim do efeito colateral do 8B). Antes de ler o corpo e antes da trava, o endpoint confere as ações de cada uma das 25 rotas que gravam (`services/admin/acoes-das-rotas.js`) na matriz; fora do perfil, 403 `perfil_sem_permissao` e registro `acao_negada` em `data/admin-private/negadas/`. Segunda barreira nos serviços (`resolverAtorDeGravacao`); `ATOR_PADRAO` removido; decisões novas e responsáveis do manifesto recusam Cadastrante; `acao_cadastro` para tema e serviço e `acao_revisao` também para os cadastros com versão. "Concluir revisão" exige `validar_materialmente` (pseudônimo até o 8D; o histórico segue com `concluir_revisao`). Tela: a sessão devolve `acoes`; os controles fora do perfil ficam `aria-disabled` com descrição, e o 403 por perfil tem mensagem própria. Limitação conhecida: um registro de auditoria pode sobrar se a gravação falhar depois da conferência (no cadastro guiado, o primeiro pode ficar órfão). Testes novos em `tests/acoes-das-rotas.test.js` e `tests/permissoes-aplicadas-endpoint.test.js`; os existentes passaram a informar Maria (cadastro e revisão de conteúdo) ou Carlos (conclusão, autorização, publicação e revogação). Os testes de ponta a ponta reais (`e2e-real/`) passaram a trocar para Carlos antes de concluir, autorizar, publicar e revogar; na execução local de 21/11/2026, antes do commit, o `e2e-real` passou com 75 de 75 (e o `e2e`, 38 de 38); uma execução anterior, antes das correções da auditoria, teve 9 falhas (descrição do bloqueio fora da tela, expectativa antiga do ator na revogação e espera do auxiliar de troca de usuário). Roteiro manual em `docs/TESTES_MANUAIS.md` (não executado).
- **Passo 8D (fluxo de revisão em três ações):** concluído (PR #38). Em dois commits: (1) ajuste mecânico dos testes, com auxiliares (`enviarEValidar`, `enviarEValidarPelaRota` em `tests/admin-auxiliar.js` e `concluirComoRevisor` nos `e2e-real/`) que ainda executavam o fluxo antigo; (2) a mudança. "Concluir revisão" deixou de existir: a Cadastrante **envia para revisão** (`POST .../revisao/enviar`, rascunho → "Em análise", congela a versão sem decisão); o Revisor **valida materialmente** (`POST .../revisao/validar`, → "Pronto para publicar", com decisão) ou **pede ajustes** com motivo obrigatório (`POST .../revisao/ajustes`, → "Ajustes solicitados"; a correção é feita numa nova versão). A rota `.../revisao/concluir` foi removida (404) e a função `concluirRevisao` saiu; `concluir_revisao` só é aceito na leitura de registros antigos. O motivo dos ajustes fica só na decisão privada (`data/admin-private/decisoes/`), nunca no manifesto, no histórico de ações, em resposta de gravação nem em log; só o `GET .../revisao` o devolve, em ajustes solicitados. Manifesto com `responsaveis.envio` (Cadastrante) e `responsaveis.ajustes` (Revisor). Tela: cartão "Revisão e validação" com "Enviar para revisão", "Validar materialmente" (com o aviso, na tela, de que a validação local "não equivale à validação material da CLABI"; na prática, não é validação real: é local, feita por usuário fictício e sem autenticação) e "Solicitar ajustes". Comportamento coerente (não é falha): versões "Em análise" ou com ajustes solicitados podem ir ao Git sem o hook barrar, porque não há validação nem publicação nesses estados; `validado_materialmente` continua protegido (hook não alterado). Os roteiros de `e2e-demo/` (fora do Git) quebram e ficam para passo próprio. Testes novos em `tests/fluxo-revisao.test.js` e `tests/fluxo-revisao-endpoint.test.js`, casos novos em `tests/acoes-das-rotas.test.js`, `tests/admin-revisao-interface.test.js` e `e2e/conteudo.spec.js`, e `e2e-real/fluxo-revisao-real.spec.js` (o `e2e-real` desta fase foi executado localmente antes do commit: 76 de 76). Roteiro manual em `docs/TESTES_MANUAIS.md` (não executado).
- **Passo 8E (cenário de demonstração):** concluído (PR #39, integrada em 21/11/2026; fechou a Issue #30). Um único teste de ponta a ponta real, `e2e-real/demonstracao-ponta-a-ponta-real.spec.js`, encadeia o cenário na LAC com dados fictícios: Maria (Cadastrante) cadastra e envia; tenta validar e publicar pela tela (botões visíveis, focáveis e com `aria-disabled`, só a mensagem) e publicar por pedido direto (403 `perfil_sem_permissao`, `services/` inalterado e uma linha `acao_negada` em `negadas/`); Carlos (Revisor) pede ajustes, Maria corrige numa nova versão, Carlos valida, autoriza, publica (o chat traz o texto) e revoga (o chat deixa de trazer; o arquivo de `publico/` fica no disco sem ser servido). Ao final, o teste confere os `responsaveis` do manifesto (só perfil e setor) e o histórico privado da cópia, e anexa cinco capturas e um JSON sem dados sensíveis. O cadastro de serviço fictício ficou fora. O `e2e-real/zz-base-real.spec.js` e o `preparar.js` passam a conferir também a pasta `data/` real (hash ou ausência). **Divergência com a Issue #30:** o botão fora do perfil fica visível, focável e desabilitado com explicação, não oculto (decisão do 8C). Registro em `docs/TESTES_MANUAIS.md` (roteiro manual não executado).
- **Fechamento da Sprint 8:** passos 8A a 8E concluídos (PRs #33, #36, #37, #38 e #39); a PR #39 foi integrada em 21/11/2026 e a Issue #30 foi fechada logo em seguida, com diferença de um segundo. A recusa de acesso (Cadastrante tentando publicar) é coberta pelo teste do 8E. Limites mantidos: o login simulado não é autenticação real, os usuários são fictícios e nada foi publicado de verdade.

## Correção após a Sprint 8 — Issue #31, item 2 (substituição de versão publicada; concluída, PR #44, integrada em 22/11/2026)

- **Escopo implementado** (PR #44, integrada em 22/11/2026): estado `substituido` (terminal); publicar uma nova versão marca a publicada anterior como substituída na mesma transação; validador recusa registro apontando para versão substituída; rótulo "Substituída por versão posterior"; esquema e testes (`tests/substituicao.test.js`, ajustes em `tests/admin-fluxo.test.js` e `tests/hook-revogacao.test.js`).
- **Hook e pendência:** a regra B2S está implementada no pre-commit e na verificação da PR (`scripts/hooks/regras.js`) e coberta pelos testes RV10 a RV12 (`tests/hook-revogacao.test.js`); o validador da base (`scripts/validate-services.js`) confere a base como ela está gravada. Pendência não bloqueante: nem o validador nem o hook conferem a existência de `substituidaPor` (ver `docs/BACKLOG.md`).
- **Sem conferência manual:** não há roteiro executado nem registro de teste manual para esta correção (`docs/TESTES_MANUAIS.md` não foi alterado).

## Sprint 9 — Prova técnica do ciclo editorial (planejada, não iniciada)

- **Objetivo:** demonstrar publicação → resposta → revogação com dados sintéticos em ambiente isolado, usando os perfis.
- **Cenários:** bloco autorizado chegando à resposta; bloco revogado deixando de ser usado; um cenário de falha. A recusa de acesso (Cadastrante tentando publicar) é coberta pelo teste do Passo 8E.

## Sprint 10 — Chat com fontes e motivo da recusa (planejada, não iniciada)

- **Objetivo:** o chat mostra as fontes que sustentam a resposta e, quando não responde, informa o motivo da recusa.

## Sprint 11 — Validação material real no sistema e publicação autorizada (planejada, não iniciada)

- **Objetivo:** um usuário com perfil Revisor e autoridade da CLABI valida materialmente um recorte pequeno da LAC dentro do sistema, e a versão é publicada de verdade.

## Sprint 12 — Publicação na Vercel (planejada, não iniciada)

- **Objetivo:** publicar o protótipo como build estático, só com conteúdo validado, sem administração e com aviso de protótipo acadêmico.

## Depois do ciclo editorial

- **IA na preparação do conteúdo:** sugestões a partir de documentos oficiais, sempre com revisão humana e o fluxo existente de versionamento, autorização e publicação.
- **Chat híbrido:** IA redigindo respostas sustentadas somente pelas informações publicadas, com retorno à resposta determinística se a IA estiver indisponível.
- Provedor, custo, privacidade e limites serão avaliados antes de qualquer implementação.

## Preparação institucional

- login real com a conta Google institucional;
- banco de dados;
- auditoria persistente;
- demais itens antes previstos para a antiga Sprint 8: migração controlada dos dados, monitoramento e logs técnicos, backup e recuperação, gestão de segredos, proteção de dados (LGPD), implantação em ambiente institucional e plano de operação e suporte, sem tecnologia definitivamente aprovada.

## Evoluções posteriores (roadmap, sem Sprint atribuída)

- integração com sistemas da SEMA;
- consulta pública ao andamento de processos;
- integração com bases oficiais de legislação;
- alertas de conteúdo possivelmente desatualizado;
- expansão para novos serviços;
- métricas das dúvidas dos cidadãos;
- OCR;
- processamento de documentos em lote.
