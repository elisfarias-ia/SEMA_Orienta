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

Pendente (ainda não iniciado): escrita administrativa (versões e decisões) e interface administrativa. **Nenhuma decisão real nem validação material foi registrada, e não há publicação autorizada.** Decisões com identificação pessoal continuarão fora do Git.

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
