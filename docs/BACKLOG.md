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

## Sprint 1 — Engenharia assistida e saúde do sistema (tecnicamente concluída; em revisão na PR #4)

Ver `docs/SPRINTS.md`.

- [x] 8A: `CLAUDE.md`, metodologia e templates Git (integrado pela PR #2);
- [x] 8B: saúde do sistema, com `GET /__admin/saude` e a página `/admin/saude/`, capacidade e estado separados, verificações reais e componentes inexistentes como não implementados, em contagem separada (MCP fora da saúde, por ser ferramenta de desenvolvimento). Conferência manual aprovada pela usuária em 13/11/2026 (`docs/TESTES_MANUAIS.md`, MH-01 a MH-12); falhas simuladas cobertas por testes automatizados;
- [x] 8C: Playwright dos fluxos críticos, 13 testes somente leitura passando (`npm run test:e2e`);
- [ ] 8D: documentação, evidências (`docs/EVIDENCIAS_SPRINT_1.md`) e fechamento da Sprint, em revisão na PR #4 (Issue #3 aberta até o merge).

## M3 — Conversa com IA

- [ ] criar função serverless `/api/chat`;
- [ ] configurar `GEMINI_API_KEY` no ambiente;
- [ ] implementar adaptador do provedor;
- [ ] identificar serviço e recuperar trechos;
- [ ] validar resposta e fontes;
- [ ] tratar ambiguidade, ausência de conteúdo e falha do provedor.

**Saída:** resposta conversacional fundamentada na base.

## M4 — SEMA Check

- [ ] exibir checklist da LAC;
- [ ] permitir marcação local e progresso;
- [ ] mostrar condição e fonte de cada item;
- [ ] deixar claro que marcação não valida o documento.

**Saída:** pré-conferência declarativa integrada ao chat.

## M5 — Qualidade e publicação

- [ ] executar testes manuais e corrigir falhas;
- [ ] verificar acessibilidade, responsividade e proteção da chave;
- [ ] revisar textos com a área competente;
- [ ] publicar protótipo na Vercel;
- [ ] organizar README, evidências e apresentação final.

**Saída:** MVP demonstrável com evidências reais.

## M6 — Prova de extensibilidade

- [ ] cadastrar um serviço fictício, claramente marcado como demonstração;
- [ ] comprovar que o núcleo não precisou ser alterado;
- [ ] manter esse conteúdo fora da orientação institucional pública.

**Saída:** evidência de que a arquitetura comporta novos serviços.

## Ordem de prioridade

1. conteúdo oficial e rastreabilidade;
2. conversa segura e útil;
3. proteção da chave e tratamento de falhas;
4. checklist;
5. acabamento visual e expansão.

## Sprint 2 — Engenharia assistida (tecnicamente concluída; hook cancelado)

Ver `docs/SPRINTS.md` e `docs/EVIDENCIAS_SPRINT_2.md`.

- [x] 2A: skills do projeto (`.claude/skills/`).
- [x] 2B: subagentes do projeto (`.claude/agents/`).
- [x] 2C: MCP local somente leitura (`.mcp.json`, `scripts/mcp/`) e demonstração real (`docs/EVIDENCIAS_MCP.md`).
- [ ] 2D: hook de proteção — cancelado por decisão da usuária; não implementado.
- [x] Fechamento: evidências e verificação final (`docs/EVIDENCIAS_SPRINT_2.md`).
