# Backlog incremental

## M0 — Contexto e regras

- [x] definir problema, público e objetivo;
- [x] fixar escopo da LAC;
- [x] registrar limites, requisitos, arquitetura e testes;
- [ ] receber e validar as fontes oficiais da LAC.

**Saída:** pacote de contexto aprovado.

## M1 — Interface do chat

- [x] iniciar repositório e estrutura do projeto;
- [x] criar cabeçalho e identificação do sistema;
- [x] criar lista de mensagens, campo de texto, enviar e reiniciar;
- [x] adaptar para 390 px e navegação por teclado;
- [x] usar resposta temporária, sem conteúdo ambiental fictício.

**Saída:** conversa navegável sem integração com IA.

## M2 — Base da LAC

Concluído (Marco 2A — estrutura):

- [x] criar o registro central de serviços;
- [x] criar os esquemas dos arquivos;
- [x] criar a estrutura dos arquivos da LAC;
- [x] criar a estrutura para fontes e links oficiais;
- [x] criar a validação automatizada;
- [x] bloquear a publicação de conteúdo não validado.

Marco 2B — conteúdo oficial (em andamento; não concluído):

Concluído:

- [x] estruturar o controle de origem oficial das fontes;
- [x] estruturar o controle de validação e publicação das fontes;
- [x] estruturar o controle de vigência das legislações;
- [x] cadastrar as cinco fontes preliminares da LAC (página da SEMA e quatro normas);
- [x] registrar o Decreto nº 695/2020 como norma revogada;
- [x] validar automaticamente referências entre fontes e serviço;
- [x] cadastrar o TR nº 176, o Manual da LAC e o FAQ da LAC como fontes oficiais;
- [x] validar a identidade, a procedência e os metadados das oito fontes para fins de teste;
- [x] relacionar as fontes documentais ao serviço LAC;
- [x] validar referências de fontes documentais para legislações;
- [x] impedir a publicação automática de fontes apenas por estarem validadas;
- [x] cadastrar descrição, público, condições e roteiro de solicitação no SIGA (15 etapas) como conteúdo em validação, com fontes por `fonteId`, sem publicação;
- [x] transcrever os 28 itens do checklist de documentos do TR nº 176 (em validação, não publicados, `obrigatorio: null`, `revisaoAtualidade: pendente`, com alertas específicos);
- [x] transcrever 21 perguntas do FAQ de 2022 (18 numeradas e as perguntas i, j e k das observações) em linguagem de fonte histórica, em validação, não publicadas, com `respostaPublicavel: null`, bloqueios controlados e sem contatos armazenados;
- [x] realizar a revisão técnica consolidada da base da LAC (`docs/REVISAO_CONTEUDO_LAC.md`), sem alterar status, sem publicar e sem validar o conteúdo materialmente;
- [x] preparar o conteúdo controlado para teste local (5 blocos em `conteudo-assistente.json`, `ambiente: teste_local`, não publicados) e a regra de seleção por modo (`services/assistant-content.js`), sem ligar à interface;
- [x] integrar o assistente em teste local à interface, com endpoint exclusivo do Vite em desenvolvimento, reconhecimento local de intenção e conferência do `dist/` (implementado; conferência manual aprovada pela usuária; M6-12 aprovado; M6-13 não executado).

> Nota: a validação realizada nesta etapa é experimental e abrange identidade, procedência e metadados das fontes. Não representa aprovação jurídica, confirmação de atualização integral ou autorização de publicação.

Pendente:

- [ ] confirmar a vigência consolidada das normas;
- [ ] confirmar a atualização material do TR, manual, FAQ e página da SEMA;
- [ ] conferir o texto integral do manual do SIGA, da LC nº 668/2020 e dos Decretos nº 1.268/2022 e nº 1.585/2022 (não acessíveis na auditoria automática; só a página da SEMA foi lida);
- [ ] decidir quais fontes poderão ser publicadas;
- [ ] cadastrar o conteúdo oficial da LAC;
- [ ] revisar o checklist de documentos (28 itens do TR nº 176, de 2020) e confirmar a obrigatoriedade e a atualidade de cada item;
- [ ] analisar as observações a até h do FAQ de 2022 (Passo 4) e revisar as 21 perguntas, aprovando ou não uma `respostaPublicavel` para cada uma;
- [ ] definir unidade responsável e canal de atendimento;
- [ ] registrar responsável pela validação e data de revisão;
- [ ] integrar a base ao assistente.

**Saída:** base LAC estruturada e rastreável.

## M7 — Gestão de conteúdo e validação material (em andamento)

Concluído (Passo 7A — modelo básico, sem interface):

- [x] catálogo de assuntos (`services/assuntos.json`) com "Licenciamento Ambiental", e vínculo da LAC por `assuntoId`;
- [x] validação de assuntos (ids únicos, campos, assunto existente e ativo, `assuntoId` igual no registro e no `service.json`);
- [x] estados e transições da versão do serviço (`services/admin/fluxo.js`) e hash determinístico do conteúdo (`services/admin/hash.js`).

Concluído (Passo 7B — fluxo de versões e decisões, funções puras e testadas, com dados fictícios):

- [x] criar versão, enviar para validação com hash, registrar decisão material, autorizar publicação e publicar, com histórico apenas de acréscimos e nova versão preservando a anterior (`services/admin/versao.js`, `decisoes.js` e esquemas).

Concluído (Passo 7C1 — armazenamento local seguro, sem uso ainda):

- [x] ler e gravar JSON de forma atômica, acrescentar e listar JSONL, com proteção de caminhos e links simbólicos (`services/admin/armazenamento.js`), e documentar os limites em `docs/ADMINISTRACAO.md`; `data/admin-private/` no `.gitignore`.

Concluído (Passo 7C2 — migração estrutural da LAC para a versão 1):

- [x] mover os seis arquivos da LAC para `services/lac/versoes/v1/`, criar o manifesto `versao.json` (`lac-v1`, rascunho, sem hash, envio ou decisão), registrar `versaoAtualId` e `versaoPublicadaId: null`, validar a versão atual e fazer o endpoint do assistente localizar a versão pelo registro e pelo manifesto. Conteúdo preservado (conferido por hash); sem alteração material.

Concluído (Passo 7D — endpoint administrativo local de leitura):

- [x] rotas `GET /__admin/sessao`, `/__admin/catalogo` e `/__admin/servicos/<id>/versao-atual`, só no `npm run dev`, com token em memória, validação de origem, erros genéricos e sem escrita (`services/admin/admin-endpoint.js`); `check-dist` ampliado; isolamento testado.

Concluído (Passo 7E1 — cadastro administrativo de assunto e serviço):

- [x] `POST /__admin/assuntos` e `POST /__admin/servicos` (somente no `npm run dev`), com validação do corpo, versão 1 em rascunho com estrutura modular e tudo `PENDENTE`, gravação tudo ou nada com desfazer, uma gravação por vez e testes só em cópias temporárias. Nenhum assunto ou serviço real foi cadastrado.

Concluído (Passo 7E2 — tela "Gestão de conteúdo"):

- [x] tela administrativa local (`admin/`) para ver o catálogo e cadastrar assunto e serviço, com confirmação antes de gravar, token só em memória, bloqueio de envio duplicado, acessibilidade e responsividade; fora do build e sem link no público. Validação manual parcial pela usuária em 10/11/2026 (carregamento, aviso, catálogo, validação dos campos, painel de confirmação e "Voltar", teclado e Esc, 390 × 844 px, token não visível e ausência de editar, excluir, validar e publicar). O cadastro real de um assunto e de um serviço pela tela também foi testado pela usuária em 10/11/2026: o catálogo foi atualizado, a versão 1 foi criada em rascunho e não publicada, e os dados do teste foram removidos depois da conferência. Duplicidade, clique duplo e os demais testes pendentes (MA-02, MA-08, MA-09, MA-12, MA-13 e MA-14) continuam não executados (`docs/TESTES_MANUAIS.md`).

Concluído (Passo 7E3A — cadastro de fontes por serviço):

- [x] `POST /__admin/servicos/<id>/fontes` (só no `npm run dev`) com revisão otimista, versão em rascunho obrigatória, fonte sempre em rascunho e não publicada, vigência definida pelo servidor, gravação tudo ou nada, e a seção "Fontes do serviço" na tela administrativa. Validação manual parcial pela usuária em 11/11/2026 (listagem, formulário, validações, confirmação, teclado, responsividade e data DD-MM-AAAA). **O cadastro real de uma fonte (`POST`) não foi testado manualmente** e nenhuma fonte real foi criada (`docs/TESTES_MANUAIS.md`, MF-05 a MF-09 e MF-12 não executados).

Concluído (Passo 7E3B — simplificação inicial da administração):

- [x] id de assunto e de serviço gerado pelo servidor a partir do nome (sem acentos, com colisão por sufixo), formulários sem o campo "Identificador", catálogo e confirmação sem ids nem versões, situação em linguagem amigável e "Publicado" ou "Não publicado". Estrutura técnica interna e registros existentes preservados. Validação manual visual pela usuária; a criação real pela tela não foi testada manualmente (`docs/TESTES_MANUAIS.md`, geração, normalização e colisão do id cobertas por testes automatizados).

Pendente (ainda não iniciado): edição do conteúdo geral, documentos e perguntas, envio para validação, decisões e publicação. **Nenhuma decisão real nem validação material foi registrada, e não há publicação autorizada.** Decisões com identificação pessoal continuarão fora do Git.

## Sprint 1 — Engenharia assistida e saúde do sistema (concluída; integrada pela PR #4)

Ver `docs/SPRINTS.md`.

- [x] 8A: `CLAUDE.md`, metodologia e templates Git (integrado pela PR #2);
- [x] 8B: saúde do sistema, com `GET /__admin/saude` e a página `/admin/saude/`, capacidade e estado separados, verificações reais e componentes inexistentes como não implementados, em contagem separada (MCP fora da saúde, por ser ferramenta de desenvolvimento). Conferência manual aprovada pela usuária em 13/11/2026 (`docs/TESTES_MANUAIS.md`, MH-01 a MH-12); falhas simuladas cobertas por testes automatizados;
- [x] 8C: Playwright dos fluxos críticos, 13 testes somente leitura passando (`npm run test:e2e`);
- [x] 8D: documentação, evidências (`docs/EVIDENCIAS_SPRINT_1.md`) e fechamento da Sprint, integrados pela PR #4 (13/11/2026, merge `0e4b33b`); Issue #3 fechada.

## M3 — Conversa fundamentada (replanejado após a avaliação do professor)

O chat já responde com um motor determinístico, só com conteúdo publicado (`src/assistant.js`). A IA externa saiu deste marco: é evolução proposta, para depois do ciclo editorial, sem provedor definido (Gemini e Ollama local serão avaliados). Não há função serverless nem chave de provedor.

- [x] identificar o serviço e montar a resposta só com o conteúdo publicado (motor determinístico);
- [x] mensagem segura quando não houver conteúdo;
- [ ] mostrar as fontes que sustentam a resposta e o motivo da recusa (Sprint 10);
- [ ] comprovar que um bloco revogado deixa de ser usado (Sprints 7 e 9);
- [ ] depois do ciclo editorial: avaliar a IA na preparação do conteúdo e o chat híbrido, com chave só no servidor, adaptador e saída validada.

**Saída:** resposta fundamentada somente no conteúdo publicado, com fontes e motivo da recusa.

## M4 — SEMA Check (cancelado)

Cancelado por decisão da usuária: o SEMA Check foi retirado do projeto e não será desenvolvido. A lista de documentos da LAC continua na base como conteúdo informativo, sem marcação nem progresso.

## M5 — Qualidade e publicação

- [ ] executar testes manuais e corrigir falhas;
- [ ] verificar acessibilidade e responsividade;
- [ ] revisar textos com a área competente (envio para revisão pela autora, com conferência técnica das fontes; validação material pelo Revisor com autoridade da CLABI, dentro do sistema, Sprint 11);
- [ ] publicar protótipo na Vercel como build estático, só com conteúdo validado, sem administração e com aviso de protótipo acadêmico (Sprint 12);
- [ ] organizar README, evidências e apresentação final.

**Saída:** MVP demonstrável com evidências reais.

## M6 — Prova de extensibilidade

- [ ] cadastrar um serviço fictício, claramente marcado como demonstração;
- [ ] comprovar que o núcleo não precisou ser alterado;
- [ ] manter esse conteúdo fora da orientação institucional pública.

**Saída:** evidência de que a arquitetura comporta novos serviços.

## Ordem de prioridade

1. ciclo editorial completo de um serviço com conteúdo materialmente validado (publicação, resposta e revogação);
2. conteúdo oficial e rastreabilidade;
3. conversa segura e útil;
4. acabamento visual e expansão;
5. IA externa, depois do ciclo editorial.

## Sprint 2 — Engenharia assistida (tecnicamente concluída; hook cancelado)

Ver `docs/SPRINTS.md` e `docs/EVIDENCIAS_SPRINT_2.md`.

- [x] 2A: skills do projeto (`.claude/skills/`).
- [x] 2B: subagentes do projeto (`.claude/agents/`).
- [x] 2C: MCP local somente leitura (`.mcp.json`, `scripts/mcp/`) e demonstração real (`docs/EVIDENCIAS_MCP.md`).
- [ ] 2D: hook de proteção — não implementado nesta Sprint; voltou ao plano como Sprint 6.
- [x] Fechamento: evidências e verificação final (`docs/EVIDENCIAS_SPRINT_2.md`).

## Sprint 3 — Informações do chatbot (tecnicamente concluída)

- [x] 3A: modelo, validador e regras dos blocos de conhecimento (`658edc1`).
- [x] 3B1: endpoints locais de blocos de conhecimento (`81ef0c3`).
- [x] 3B2: página `/admin/conteudo/` e conferência manual aprovada pela usuária em 13/11/2026 (`0f071d1`; `docs/TESTES_MANUAIS.md`, MC-01 a MC-09).
- [x] 3C: `check-dist` ampliado, evidências e documentação (`docs/EVIDENCIAS_SPRINT_3.md`).
- [ ] Melhorias futuras (Issue #7): revisão otimista no PATCH e no DELETE, proteção contra alterações externas entre ensaio e gravação, concorrência para uso multiusuário e detecção de duplicidade por conteúdo.
- [ ] Criação automática de nova versão quando a versão atual está congelada (não implementada).

## Sprint 4 — Gestão simples de conteúdo por serviço (concluída, Issue #8)

- [x] 4A: cadastro guiado atômico (`e370b28`).
- [x] 4B1: `entradas.json`, texto com hash, reutilização de link e proteção do MCP.
- [x] 4B2: `/admin/` por serviço com entrada de demonstração, tema único, texto, link novo e link já cadastrado; teste Playwright real; conferência manual aprovada em 15/11/2026 (`docs/EVIDENCIAS_SPRINT_4.md`).
- [ ] Melhorias futuras: achados menores da auditoria (regras de credencial, nome antigo "Cadastro da base" na navegação, validador de `reutilizadaDe`, teste de fonte textual publicada no MCP).
- [x] Sprint 5: revisão e publicação (PR #12).
- [ ] Sprints 6 a 12: plano refeito após a avaliação do professor, centrado no ciclo editorial (`docs/SPRINTS.md`).

## Sprint 8 — Login simulado com perfis e auditoria (concluída, Issue #30 fechada em 21/11/2026; PRs #33, #36, #37, #38 e #39)

Ver `docs/SPRINTS.md`.

- [x] 8A: usuários fictícios e matriz de permissões (PR #33).
- [x] 8B: login simulado com sessão única em memória (PR #36).
- [x] 8C: permissões aplicadas nas rotas que gravam e nos serviços, ator real no histórico, tentativas negadas e cadastros auditados, controles da tela em `aria-disabled` (PR #37; `e2e-real` local de 21/11/2026: 75 de 75; roteiro manual não executado).
- [ ] Alinhar os registros `acao_revisao` dos cadastros com versão (fonte, link, texto, informação; editar e excluir informação), hoje com `hashConteudo: null`, ao padrão das ações em rascunho feitas por `gravar`, que guardam o hash da versão depois da mudança: calcular o hash da versão em disco dentro da conferência final da transação real. Nada consome esse hash hoje (achado da auditoria do 8C; não bloqueante).
- [x] 8D: separar "concluir revisão" em enviar para revisão (Cadastrante) e validar materialmente (Revisor), com `solicitar_ajustes` (PR #38; `e2e-real` local antes do commit: 76 de 76; o pseudônimo concluir → validar acabou; roteiro manual não executado).
- [x] 8E: cenário de demonstração ponta a ponta num único teste real (`e2e-real/demonstracao-ponta-a-ponta-real.spec.js`), com recusa de publicação pela tela e por pedido direto, ajustes, validação, publicação e revogação; `zz-base-real` passa a conferir também `data/` real (concluído, PR #39, integrada em 21/11/2026; roteiro manual não executado).
- [ ] **Não bloqueante (achado no 8E): ids derivados do título no histórico privado.** O servidor gera o id de fontes, textos e informações a partir do título (por exemplo, `itemId: "texto-quorvalina"` em `data/admin-private/revisao/`), e o mesmo id está na base versionada (`services/`). Assim, o histórico guarda o título de forma indireta. Avaliar ids opacos (sufixo aleatório ou hash) nos cadastros novos ou, ao menos, recusar dado pessoal no título antes de gerar o id, reaproveitando a detecção de dados sensíveis já usada nos motivos.
- [ ] Atualizar os roteiros de vídeo de `e2e-demo/` (fora do Git), que ainda clicam em "Concluir revisão" e quebram depois do 8D (passo próprio).
- [ ] **Não bloqueante, anterior ao 8D (achado durante a validação dele): fim de linha do roteiro.** Numa cópia nova do repositório no Windows, `services/lac/versoes/v1/roteiro.md` chega com CRLF, e o leitor do roteiro só entende LF: as etapas zeram e os testes P1-3 e P1-16 (`tests/roteiro-lac.test.js`) falham. Acontece também numa cópia limpa do `main` sem nenhuma mudança; na pasta de trabalho atual (LF) e no GitHub (Linux) não aparece. Correção proposta: regra de fim de linha `eol=lf` no `.gitattributes` para os `roteiro.md` (ou para `services/**/*.md`), com renormalização; ou o leitor do roteiro aceitar CRLF (normalizar `\r\n` para `\n` antes de ler). As duas podem ser combinadas; escolher em passo próprio.
- [ ] Melhoria futura: aparência própria para controles bloqueados por perfil (`admin/styles.css`).
- [ ] Melhoria futura: registro de auditoria órfão quando a gravação falha depois da conferência (mesmo padrão das ações de revisão; no cadastro guiado, o primeiro registro pode sobrar).

## Revisão retrospectiva das Sprints 6 e 7 (20/11/2026)

Revisão feita depois da adoção do fluxo com subagentes, só de leitura, sobre a `main` em `6a762a3` (PRs #20 a #29): arquitetura pelo `arquiteto-sema` e segurança pelo `auditor-sema`. Nenhum achado bloqueante. Os quatro achados graves (verificação da PR rodando o próprio código da PR, conteúdo substituído podendo voltar ao ar, motivo de revogação aceitando dados pessoais e evidência do B5 registrada como fato) estão na **Issue #31**. Os demais ficam aqui, com a gravidade que cada revisor deu. Nada foi corrigido ainda.

**Arquitetura (`arquiteto-sema`)**

- [ ] **Alto — duas fontes de verdade para "autorizado"** (achado 2). O domínio exige a decisão no histórico privado (`data/admin-private/`, fora do Git; `services/admin/decisoes.js`, `services/admin/publicacao.js`); o pre-commit exige a entrada versionada em `.githooks/publicacoes-autorizadas.json` (`scripts/hooks/regras.js`). As duas não se cruzam e podem divergir sem alerta. Direção: definir qual é a autoridade e documentar o histórico privado como auditoria local.
- [ ] **Médio — o hook do Claude Code não cobre `.github/`** (achado 7; também no I2 do auditor). A regra A5 protege `.claude/settings*`, a liberação, `scripts/hooks/` e `.githooks/`, mas não `.github/workflows/`, o `package.json` (script `hooks:instalar`) nem o `CLAUDE.md`; o matcher não cobre ferramentas MCP. Direção: incluir ao menos `.github/workflows/` na A5.
- [ ] **Médio — tela e rota divergem sobre o que pode ser revogado** (achado 6). `podeRevogar` exige que a versão atual seja a publicada; a rota revoga `versaoPublicadaId` mesmo quando a atual é outra. Com uma v2 em rascunho, a v1 publicada não pode ser revogada pela tela. Direção: basear o resumo na versão publicada ou restringir a rota de propósito.
- [ ] **Médio — a regra da PR olha só o início e o fim da diferença** (achado 5). Publicar e revogar na mesma PR é barrado ("só se revoga versão publicada"), mesmo com cada commit aprovado pelo pre-commit. Direção: avaliar commit a commit na PR ou documentar que publicação e revogação vão em PRs separadas.
- [ ] **Médio — "Concluir revisão" chega a `validado_materialmente` e o hook trata isso como publicação** (achado 3). A regra B2 exige uma entrada de publicação já na validação. Tratado em parte pela separação do Passo 8D (Issue #30): o envio para revisão leva só a `em_validacao` e o pedido de ajustes a `ajustes_solicitados`, estados que o hook não barra, de forma coerente, porque não há validação nem publicação neles; a validação material (`validado_materialmente`) continua protegida pela B2 e segue exigindo a entrada de publicação, que é o que resta do achado.
- [ ] **Baixo — regras duplicadas** (achado 8): conversão de id da versão em pasta escrita três vezes; nome do arquivo público em dois lugares (com um `.` não escapado em `regras.js`); listas de arquivos proibidos diferentes entre A4 e B3; datas do hook conferidas só pelo formato; três critérios para "pasta de serviço".
- [ ] **Baixo — acoplamentos** (achado 9): a análise comum mora em `pre-commit.js` e é importada por `verificar-pr.js`; `pre-commit.js` repete expressões de `regras.js`; a regra B1 aceita **modificar** um arquivo público já autorizado; as mensagens dizem "(B1)" e "(B2)" para os códigos B1R e B2R.
- [ ] **Baixo — atores e histórico** (achado 10): ator padrão silencioso (fechado no 8C: não há mais ator padrão); perfil `demonstracao` aceito em manifestos (no 8C, só nos manifestos antigos; as gravações novas exigem Revisor); datas locais nas decisões e UTC nas ações; o motivo da revogação só fora do Git.

**Segurança (`auditor-sema`)**

- [ ] **Importante (I1) — formas de contornar o hook do Claude Code não documentadas** (hipóteses da leitura do código, não testadas): abreviação de opções longas do Git (`--no-verif`, `--forc`, `--al`); variáveis `GIT_CONFIG_*`; gravação por interpretador (`node -e`); no Windows, ponto final no nome e nomes curtos. Direção: aceitar prefixos nas regras A3, A4 e A7, barrar `GIT_CONFIG_*`, normalizar o nome e documentar os limites.
- [ ] **Menor (M1)** — `orgaoexemplo.gov.br`, na lista de domínios permitidos do pre-commit, não é um domínio reservado; a liberação de todo `sema.mt.gov.br` deixa passar e-mails nominais de servidores.
- [ ] **Menor (M2)** — o padrão de arquivo público da regra B1 só pega um nível; `services/<serviço>/publico/sub/arquivo.json` escapa.
- [ ] **Menor (M3)** — na revogação, o hook não impede trocar o `hashConteudo` no mesmo commit, o que deixaria a B1R aceitar remover o arquivo público de outra versão (o validador barraria a incoerência).
- [ ] **Menor (M4)** — na rota de revogação, a revisão do corpo prevalece sobre a do cabeçalho `X-Revisao` sem conferir se coincidem.
- [ ] **Menor (M5)** — as ações do workflow estão fixadas por versão (`@v4`), não por SHA; o cache do npm é compartilhado entre PRs (risco baixo, sem segredos).
- [x] **Issue #31, item 2 — substituição de versão publicada** (PR #44, integrada em 22/11/2026): estado `substituido` e transação de publicação que marca a v1 como substituída; validador e hook recusam registro apontando para ela (regra B2S em `scripts/hooks/regras.js`, coberta pelos testes RV10 a RV12). A descrição exata do item 2 da Issue #31 não está nos documentos do repositório.
- [ ] **Não bloqueante (achado na revisão do item 2 da Issue #31): o hook aceita identificador de versão mais frouxo que o validador.** O hook (`PADRAO_ID_VERSAO` em `scripts/hooks/regras.js`) aceita qualquer id no formato `^[a-z][a-z0-9-]*$`, enquanto o validador exige o formato `<serviço>-v<n>`. Além disso, `substituidaPor` é validado só quanto ao formato e a não ser o próprio id: o hook não confere se a versão existe, e um registro substituído pode ter o `substituidaPor` trocado depois sem o hook barrar. Direção: alinhar o formato do hook ao do validador e conferir a existência e a ordem de `substituidaPor` no validador.
- [ ] **Não bloqueante (Issue #31, item 2): substituidaPor não tem existência conferida.** Nem o validador (`scripts/validate-services.js`) nem o hook (`scripts/hooks/regras.js`) conferem se `substituidaPor` aponta para uma versão que existe e é posterior à substituída: só o formato e a diferença do próprio id são validados. Não abre caminho para servir conteúdo revogado (a substituída não volta a ser publicada, e o registro não pode apontar para ela), mas deixa o registro de substituição inconsistente. Direção: no validador, conferir a existência e a ordem de `substituidaPor` na pasta da base; depois, no hook, se for necessário (qualquer mudança em `scripts/hooks/` é preparada fora do projeto e copiada pela usuária, pela regra A5).
- [ ] **Opcional — formatos de dado pessoal que ainda passam no motivo da revogação (Issue #31, item 3)**: CPF com espaços ou pontuação parcial; telefone sem DDD e telefone com +55 todo junto; e-mail escrito por extenso ("arroba") ou com @ de largura total; dígitos de largura total ou caracteres invisíveis no meio; RG; token, password, secret ou chave sem ":" ou "="; "senha" seguida de valor sem dígito. Direção, se um dia for preciso: normalizar o texto (NFKC, retirar caracteres invisíveis) e ampliar os padrões, com um teste para cada caso.
- [ ] **Menor (M6, não testado, anterior às Sprints 6 e 7)** — o servidor de desenvolvimento do Vite talvez sirva `/services/<serviço>/publico/conteudo-*.json` diretamente, inclusive o arquivo revogado (só local; o chat não o usa). Conferir e, se for o caso, bloquear `/services/` no `npm run dev`.

**Verificação do ambiente do assistente de código (não é achado de segurança do sistema)**

- [ ] **Restrição de Bash por subagente:** confirmar se o Claude Code aplica a lista `tools:` com padrões de comando (por exemplo, `Bash(git diff:*)`) a cada subagente ou só as permissões da sessão. Na revisão retrospectiva, o `auditor-sema` usou `gh` mesmo com a definição restringindo o Bash. Se a restrição valer só por sessão, mover o controle para as regras de permissão do `.claude/settings.json`, em passo próprio, quando houver liberação do hook para isso (a regra A5 protege esse arquivo).
