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

Pendente (Marco 2B — conteúdo oficial):

- [ ] receber as fontes oficiais;
- [ ] cadastrar procedimentos;
- [ ] cadastrar documentos;
- [ ] cadastrar legislação;
- [ ] cadastrar links oficiais;
- [ ] revisão e validação pela área competente.

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
