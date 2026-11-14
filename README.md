# SEMA Orienta

Assistente conversacional de serviços ambientais que ajuda o cidadão a identificar o serviço da SEMA adequado à sua necessidade, conhecer o roteiro, conferir os documentos exigidos e acessar as fontes oficiais.

## Objetivo do MVP

Demonstrar o atendimento conversacional completo para um único serviço: **Licença por Adesão e Compromisso (LAC)**. A arquitetura ficará preparada para receber outros serviços sem alterar o núcleo da aplicação.

## Público

- cidadãos;
- responsáveis técnicos;
- equipe de atendimento da SEMA.

## Fluxo principal

1. O usuário escreve sua dúvida com palavras próprias.
2. O sistema identifica a intenção e o serviço relacionado.
3. Se faltar contexto, o assistente faz uma pergunta curta de esclarecimento.
4. Para LAC, consulta somente a base oficial cadastrada.
5. Responde com roteiro, documentos, orientações e fontes.
6. Quando solicitado, apresenta o checklist de pré-conferência do SEMA Check.

## Escopo do MVP

- conversa livre em português;
- identificação da LAC por nome, sigla e termos equivalentes cadastrados;
- respostas fundamentadas exclusivamente na base local validada;
- indicação das fontes oficiais utilizadas;
- checklist declarativo de documentos;
- mensagem segura quando a base não contiver a resposta;
- interface responsiva para computador e celular;
- integração com IA por uma função executada no servidor;
- conversas não persistidas.

## Fora do escopo

- abrir, protocolar ou acompanhar processos;
- autenticar usuários;
- integrar-se a sistemas institucionais;
- analisar arquivos enviados pelo usuário;
- decidir se um empreendimento está apto à LAC;
- aprovar licença ou substituir análise técnica;
- responder por todos os serviços da SEMA no MVP.

## Conteúdo oficial da LAC

Os procedimentos, documentos, legislação, links, canais e unidade responsável serão fornecidos e validados pela área competente. Até essa validação, esses campos devem permanecer marcados como `PENDENTE`; não podem ser completados por suposição.

## Solução técnica inicial

- interface web simples e responsiva;
- API serverless na Vercel;
- Gemini API no nível gratuito durante o protótipo;
- chave da API somente em variável de ambiente do servidor;
- camada adaptadora para permitir troca futura do provedor de IA;
- base de conhecimento versionada em arquivos JSON e Markdown;
- Git e GitHub para controle de versões.

## Estrutura planejada

```text
sema-orienta/
├── README.md
├── CLAUDE.md
├── docs/
│   ├── REQUISITOS.md
│   ├── REGRAS_ASSISTENTE.md
│   ├── ARQUITETURA.md
│   ├── TESTES_MANUAIS.md
│   └── BACKLOG.md
└── services/
    ├── registry.json
    ├── schemas/
    │   ├── registry.schema.json
    │   └── service.schema.json
    └── lac/
        └── versoes/
            └── v1/
                ├── versao.json
                ├── service.json
                ├── roteiro.md
                ├── documentos.json
                ├── perguntas-frequentes.json
                ├── fontes.json
                └── conteudo-assistente.json
```

## Tecnologias utilizadas

Vite, HTML, CSS e JavaScript (sem framework, sem banco de dados e sem backend nesta etapa).

## Como executar

Pré-requisito: Node.js e npm instalados.

Instalar as dependências e iniciar a aplicação em modo de desenvolvimento:

```bash
npm install
npm run dev
```

O Vite mostra o endereço local, normalmente `http://localhost:5173/`.

Executar os testes automatizados:

```bash
npm test
```

Executar os testes de ponta a ponta (Playwright, só Chromium). Na primeira vez, instale o navegador com `npx playwright install chromium`. O comando inicia e encerra sozinho o servidor local na porta 5173 (não deixe outro servidor nela) e os testes são somente leitura:

```bash
npm run test:e2e
```

`npm run test:e2e:headed` faz o mesmo com o navegador visível, para conferência manual.

Gerar a versão de produção (pasta `dist/`, ignorada pelo Git):

```bash
npm run build
```

## Administração local

Só existe no servidor de desenvolvimento (`npm run dev`), sem autenticação, e não entra no build:

- `http://localhost:5173/admin/`: **Cadastro da base** (catálogo, cadastro de assunto, serviço e fonte; nome provisório, o cadastro guiado fica para a Sprint 4);
- `http://localhost:5173/admin/conteudo/`: **Informações do chatbot** (cadastro, edição e exclusão de informações em rascunho, com fontes que as comprovam; nada chega ao chat público);
- `http://localhost:5173/admin/saude/`: **Saúde do sistema**, com verificações reais da aplicação, da base, do armazenamento e do conteúdo publicado. Banco de dados, IA externa e processamento de fontes aparecem como "Não implementados", em contagem separada: isso não é falha.

Detalhes em [docs/ADMINISTRACAO.md](docs/ADMINISTRACAO.md) e evidências da Sprint 1 em [docs/EVIDENCIAS_SPRINT_1.md](docs/EVIDENCIAS_SPRINT_1.md).

## Base de serviços

A pasta `services/` reúne o cadastro dos serviços ambientais:

- `services/registry.json`: registro central. Lista cada serviço com identificador, caminho do `service.json`, status de validação e indicação de publicação. Novos serviços entram aqui.
- `services/schemas/`: esquemas que documentam a estrutura do registro e dos serviços.
- `services/lac/`: pasta do serviço LAC. O conteúdo fica na versão atual, `services/lac/versoes/v1/`, com `versao.json` (manifesto da versão), `service.json` (dados do serviço), `roteiro.md`, `documentos.json`, `perguntas-frequentes.json`, `fontes.json` (fontes e links oficiais) e `conteudo-assistente.json`. Nada fica solto na raiz de `services/lac/`.

Para conferir a estrutura da base:

```bash
npm run validate:services
```

A estrutura da base da LAC está pronta. A LAC está em `em_validacao` e **não publicada**: descrição, público, condições e o roteiro de solicitação no SIGA estão cadastrados, com fontes por `fonteId`, e aguardam validação da área competente. Documentos, perguntas frequentes, unidade responsável, canal de atendimento, responsável pela validação e data de revisão seguem `PENDENTE`. Somente conteúdo com status `validado` poderá ser publicado ou utilizado futuramente pelo assistente.

Há oito fontes oficiais da LAC cadastradas em `services/lac/versoes/v1/fontes.json` (página da SEMA, quatro normas, Termo de Referência, manual e perguntas e respostas). Elas tiveram identidade, procedência e metadados validados para fins de teste (`statusValidacao: validado`), mas **nenhuma está publicada** (`publicado: false`). Validar a fonte não significa confirmar a vigência da norma nem a atualização integral do conteúdo, que ainda dependem da área competente. Somente conteúdo expressamente publicado poderá ser utilizado pelo assistente.

O checklist de documentos (`services/lac/versoes/v1/documentos.json`) reúne 28 itens transcritos do Termo de Referência nº 176 (2020). Todos permanecem em validação e não publicados, a obrigatoriedade atual ainda não foi confirmada (`obrigatorio: null`) e o conteúdo não está disponível para respostas do assistente. O TR contém inconsistências e possíveis sinais de desatualização, registrados em cada item; a área competente deverá revisar os itens antes de qualquer publicação.

As perguntas frequentes (`services/lac/versoes/v1/perguntas-frequentes.json`) reúnem 21 perguntas transcritas do FAQ de 2022, em resumo fiel e linguagem de fonte histórica. Todas permanecem em validação, não publicadas e sem resposta publicável (`respostaPublicavel: null`); cada uma traz os bloqueios que impedem a publicação. Informações variáveis (prazos, validade, taxas), procedimentos do sistema, normas a confirmar e contatos estão bloqueados. Contatos citados no FAQ não são armazenados. As observações a até h do FAQ serão analisadas na revisão geral, e nenhum conteúdo do FAQ está disponível para respostas do assistente.

Para a demonstração local, `services/lac/versoes/v1/conteudo-assistente.json` reúne 5 blocos curtos (limitações, descrição geral, sequência geral, link oficial e mensagem sem conteúdo), todos com `ambiente: teste_local`, em validação e **não publicados**. A função `selecionarBlocosAssistente`, em `services/assistant-content.js`, escolhe o conteúdo por modo: `publico` (padrão) retorna zero blocos hoje; `teste_local` retorna somente esses 5 blocos; qualquer outro modo é rejeitado. Documentos e perguntas continuam indisponíveis. A ligação com a interface e a escolha do modo ficam para o Passo 6, e o build de produção não contém esses textos.

**Assistente em teste local.** No `npm run dev`, o servidor de desenvolvimento do Vite oferece o endpoint `GET /__assistente/blocos`, que entrega somente os 5 blocos de teste local. A interface os busca apenas em desenvolvimento, reconhece a pergunta livre **no próprio navegador** (por intenção e palavras equivalentes, sem IA externa, API ou chave) e responde só com o texto desses blocos, mostrando a faixa de teste local, o aviso e as fontes oficiais com links `https`. Sem o endpoint, e no build de produção, o chat mostra apenas a mensagem segura de indisponibilidade. A conversa fica só em memória. Para conferir que o build não contém nenhum desses textos: `npm run build` e depois `node scripts/check-dist.js`.

**Assuntos e serviços.** Assunto (área ampla da SEMA, em `services/assuntos.json`) e serviço (atendimento específico, em `services/registry.json`) são conceitos distintos; cada serviço aponta para um assunto ativo por `assuntoId`. A LAC está vinculada ao assunto "Licenciamento Ambiental". Há também o modelo do fluxo de versões (`services/admin/fluxo.js`) e o cálculo de hash do conteúdo (`services/admin/hash.js`), **ainda não aplicados à LAC**: não há validação material nem publicação autorizada, e não existe interface administrativa.

A revisão técnica consolidada da base está em [docs/REVISAO_CONTEUDO_LAC.md](docs/REVISAO_CONTEUDO_LAC.md).

## Estado atual

- Marco 0 — pacote de contexto concluído.
- Marco 1 — interface inicial do chat concluída: conversa livre, envio por botão e Enter, reinício, layout responsivo (incluindo 390 px) e navegação por teclado. As respostas são temporárias e não trazem conteúdo da LAC.
- Marco 2A — estrutura da base de conhecimento da LAC concluída (registro, esquemas, arquivos e validação automatizada). O conteúdo oficial segue pendente.
- Sprint 1 — saúde do sistema (`/admin/saude/`) e testes de ponta a ponta com Playwright (13 testes) concluídos tecnicamente e em revisão na PR #4; a Issue #3 segue aberta até o merge.
- Sprint 2 — engenharia assistida: skills, subagentes e MCP local de consulta da base, com evidências em [docs/EVIDENCIAS_SPRINT_2.md](docs/EVIDENCIAS_SPRINT_2.md). O hook de proteção (2D) foi cancelado e não foi implementado.
- Sprint 3 — informações do chatbot: blocos de conhecimento em rascunho (modelo, endpoints locais e a página `/admin/conteudo/`), sem publicação e sem alterar o chat público, com evidências em [docs/EVIDENCIAS_SPRINT_3.md](docs/EVIDENCIAS_SPRINT_3.md). O cadastro guiado de assunto, serviço e fontes ficou para a Sprint 4 (Issue #8).
- Próximas etapas: a integração com IA e a base oficial da LAC pertencem aos marcos seguintes e ainda não existem.
