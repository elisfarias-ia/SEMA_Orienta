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
- [x] cadastrar descrição, público, condições e roteiro de solicitação no SIGA (15 etapas) como conteúdo em validação, com fontes por `fonteId`, sem publicação.

> Nota: a validação realizada nesta etapa é experimental e abrange identidade, procedência e metadados das fontes. Não representa aprovação jurídica, confirmação de atualização integral ou autorização de publicação.

Pendente:

- [ ] confirmar a vigência consolidada das normas;
- [ ] confirmar a atualização material do TR, manual, FAQ e página da SEMA;
- [ ] conferir o texto integral do manual do SIGA, da LC nº 668/2020 e dos Decretos nº 1.268/2022 e nº 1.585/2022 (não acessíveis na auditoria automática; só a página da SEMA foi lida);
- [ ] decidir quais fontes poderão ser publicadas;
- [ ] cadastrar o conteúdo oficial da LAC;
- [ ] cadastrar documentos e checklist;
- [ ] cadastrar perguntas frequentes;
- [ ] definir unidade responsável e canal de atendimento;
- [ ] registrar responsável pela validação e data de revisão;
- [ ] integrar a base ao assistente.

**Saída:** base LAC estruturada e rastreável.

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
