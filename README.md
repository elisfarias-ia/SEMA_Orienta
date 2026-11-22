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

## Escopo do MVP

- conversa livre em português;
- identificação da LAC por nome, sigla e termos equivalentes cadastrados;
- respostas fundamentadas exclusivamente na base local validada;
- indicação das fontes oficiais utilizadas;
- mensagem segura quando a base não contiver a resposta;
- interface responsiva para computador e celular;
- respostas montadas por um motor determinístico, sem IA externa;
- conversas não persistidas.

O SEMA Check (checklist declarativo de documentos) foi retirado do projeto por decisão da usuária e não será desenvolvido. A lista de documentos da LAC continua na base como conteúdo informativo.

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

## Solução técnica atual

- interface web simples e responsiva (Vite, JavaScript puro);
- motor de respostas determinístico, que roda no navegador e usa somente o conteúdo publicado (`src/assistant.js`); não há IA externa, API, chave nem backend de produção;
- base de conhecimento versionada em arquivos JSON e Markdown;
- administração local, só no servidor de desenvolvimento;
- Git e GitHub para controle de versões.

**IA externa: evolução proposta, sem provedor definido.** Uma IA para apoiar a preparação de conteúdos e um chat híbrido poderão ser estudados depois do ciclo editorial (Gemini e um modelo local via Ollama serão avaliados). Qualquer integração futura deverá rodar no servidor, com a chave só no servidor, por uma camada adaptadora, recebendo apenas conteúdo publicado e com a saída validada.

**Publicação do protótipo (planejada):** build estático na Vercel, só com conteúdo validado, sem administração e com aviso de protótipo acadêmico. Ainda não foi feita.

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

Só existe no servidor de desenvolvimento (`npm run dev`) e não entra no build. O acesso é um **login simulado**, **sem autenticação real**: a pessoa escolhe entre dois usuários fictícios da CLABI, **Maria Silva (Cadastrante)** e **Carlos Silva (Revisor)**, sem senha. A sessão fica só na memória do servidor local, e escolher um usuário não comprova identidade. O servidor confere o perfil em cada ação que grava: o que está fora do perfil é recusado (403) e a tentativa é registrada só em `data/admin-private/`, fora do Git, sem nomes (só o identificador fictício do usuário, o perfil e o setor).

- `http://localhost:5173/admin/`: **Gestão de conteúdo por serviço**, com a escolha de usuário. O Cadastrante cria ou escolhe um serviço; adiciona, edita e exclui (de forma lógica) textos e links; edita temas e serviços; importa conteúdo existente; revisa; e **envia a versão para revisão**. O Revisor **valida materialmente** a versão ou **solicita ajustes** (com motivo obrigatório; a correção é feita numa nova versão), e **autoriza**, **publica** e **revoga a publicação** (com motivo obrigatório; o conteúdo revogado deixa de ser usado pelo chat). A validação feita aqui é local e não equivale à validação material da CLABI. Só a publicação, feita por ação separada, leva conteúdo ao chat público;
- `http://localhost:5173/admin/conteudo/`: **Informações do chatbot** (cadastro, edição e exclusão de informações em rascunho, com fontes que as comprovam; nada chega ao chat público);
- `http://localhost:5173/admin/saude/`: **Saúde do sistema**, com verificações reais da aplicação, da base, do armazenamento e do conteúdo publicado. Banco de dados, IA externa e processamento de fontes aparecem como "Não implementados", em contagem separada: isso não é falha.

Detalhes em [docs/ADMINISTRACAO.md](docs/ADMINISTRACAO.md), evidências das Sprints 1 e 4 em [docs/EVIDENCIAS_SPRINT_1.md](docs/EVIDENCIAS_SPRINT_1.md) e [docs/EVIDENCIAS_SPRINT_4.md](docs/EVIDENCIAS_SPRINT_4.md), e o cenário de demonstração de ponta a ponta (Maria e Carlos) em [docs/TESTES_MANUAIS.md](docs/TESTES_MANUAIS.md).

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

**Assuntos e serviços.** Assunto (área ampla da SEMA, em `services/assuntos.json`) e serviço (atendimento específico, em `services/registry.json`) são conceitos distintos; cada serviço aponta para um assunto ativo por `assuntoId`. A LAC está vinculada ao assunto "Licenciamento Ambiental". O fluxo de versões (`services/admin/fluxo.js`) e o hash do conteúdo (`services/admin/conteudo-versao.js`) já se aplicam à LAC: ela está na versão 1 (`lac-v1`), em rascunho, sem hash congelado, sem validação material e sem publicação autorizada. A administração local existe (`admin/` e `services/admin/`) e só roda no `npm run dev`; ela não entra no build.

A revisão técnica consolidada da base está em [docs/REVISAO_CONTEUDO_LAC.md](docs/REVISAO_CONTEUDO_LAC.md).

## Estado atual

- Marco 0 — pacote de contexto concluído.
- Marco 1 — interface inicial do chat concluída: conversa livre, envio por botão e Enter, reinício, layout responsivo (incluindo 390 px) e navegação por teclado. As respostas são temporárias e não trazem conteúdo da LAC.
- Marco 2A — estrutura da base de conhecimento da LAC concluída (registro, esquemas, arquivos e validação automatizada). O conteúdo oficial segue pendente.
- Sprint 1 — saúde do sistema (`/admin/saude/`) e testes de ponta a ponta com Playwright (13 testes): concluída e integrada à `main` pela PR #4 (13/11/2026); Issue #3 fechada.
- Sprint 2 — engenharia assistida: skills, subagentes e MCP local de consulta da base, com evidências em [docs/EVIDENCIAS_SPRINT_2.md](docs/EVIDENCIAS_SPRINT_2.md). O hook de proteção (2D) não foi implementado naquela Sprint e voltou ao plano como Sprint 6.
- Sprint 3 — informações do chatbot: blocos de conhecimento em rascunho (modelo, endpoints locais e a página `/admin/conteudo/`), sem publicação e sem alterar o chat público, com evidências em [docs/EVIDENCIAS_SPRINT_3.md](docs/EVIDENCIAS_SPRINT_3.md). O cadastro guiado de assunto, serviço e fontes ficou para a Sprint 4 (Issue #8).
- Sprint 4 — cadastro guiado de assunto, serviço e fontes e gestão simples por serviço, com evidências em [docs/EVIDENCIAS_SPRINT_4.md](docs/EVIDENCIAS_SPRINT_4.md).
- Sprint 5 — revisão e publicação: concluída e integrada à `main` pela PR #12. Revisão humana, edição e exclusão lógica de fontes, edição de temas e serviços, importação de conteúdo existente e publicação segura em arquivo público imutável, usado pelo chatbot e pelo build. A LAC continua em validação e **não publicada**; não há IA externa nem autenticação real. As evidências e as conferências manuais registradas estão em [docs/TESTES_MANUAIS.md](docs/TESTES_MANUAIS.md).
- Sprint 6 — hook de proteção: concluída (Issue #19; PRs #20 e #21 para os hooks, mais a conferência manual e a verificação no GitHub). Objetivo: proteger o repositório durante o desenvolvimento assistido. Entregue: hook do Claude Code (regras A1 a A7, com liberação por prazo curto); pre-commit do Git (regras B0 a B5, ativado com `npm run hooks:instalar`); e o workflow `.github/workflows/protecao-pr.yml`, que roda em toda PR as regras B0 a B5, o build, os testes, a validação da base e a conferência do `dist/`. Evidências em [docs/TESTES_MANUAIS.md](docs/TESTES_MANUAIS.md).
- Sprint 7 — revogação e registro do responsável: concluída (Issue #24; PRs #25 a #28, mais a conferência de ponta a ponta). Objetivo: permitir tirar de uso um conteúdo publicado e registrar o responsável por cada ação, só com perfil e setor no manifesto. Entregue: estado `revogado` e revogação com motivo obrigatório, em transação única e com botão "Revogar publicação"; ator `{ usuarioId, perfil, setor }` como parâmetro das gravações; regras do pre-commit e da verificação da PR para a revogação (B1R e B2R); e a conferência do botão e do diálogo por `e2e-real/revogacao-real.spec.js`.
- Sprint 8 — login simulado com perfis Cadastrante e Revisor: concluída, Passos 8A a 8E (Issue #30, fechada; PRs #33, #36, #37, #38 e #39). Objetivo: substituir o "Servidor de demonstração" por um login simulado com dois perfis e auditoria. Entregue: usuários fictícios Maria Silva (Cadastrante) e Carlos Silva (Revisor) e matriz de permissões (8A); sessão simulada em memória, sem senha (8B); permissões aplicadas nas rotas que gravam e nos serviços, com usuário real nos registros e tentativas negadas registradas só em `data/admin-private/` (8C); "concluir revisão" separado em enviar para revisão, validar materialmente e solicitar ajustes (8D); e um cenário de ponta a ponta, `e2e-real/demonstracao-ponta-a-ponta-real.spec.js`, com dados fictícios (8E). Limites: o login simulado não é autenticação real, e nada foi publicado de verdade.
- Sprint 9 — prova técnica do ciclo editorial: **planejada, ainda não iniciada** (publicação → resposta → revogação com dados sintéticos, usando os perfis). Pendências registradas antes dela: Issue #31, itens 1 e 2 (a verificação da PR roda o código da própria PR; e um conteúdo substituído pode voltar ao ar sem nova autorização). Pendência registrada antes da Sprint 11: Issue #34 (política de contato institucional, telefone e e-mail, na base de serviços).
- Roadmap replanejado a partir da avaliação do professor (planejado em 19/11/2026; as Sprints 6 a 8 já foram concluídas, acima, e as Sprints 9 a 12 estão planejadas e não iniciadas): a prioridade é concluir o ciclo editorial de um serviço com conteúdo materialmente validado, mostrando um bloco autorizado chegando à resposta e um bloco revogado deixando de ser usado. Sprints 6 a 12: hook de proteção; diagnóstico de revogação e do registro do responsável; login simulado com perfis Cadastrante e Revisor e auditoria; prova técnica do ciclo com dados sintéticos; chat com fontes e motivo da recusa; validação real com a CLABI e publicação autorizada; publicação na Vercel. IA e preparação institucional ficam para depois. Detalhes em [docs/SPRINTS.md](docs/SPRINTS.md) e o que existe hoje em [docs/ESTADO_FUNCIONALIDADES.md](docs/ESTADO_FUNCIONALIDADES.md).
- Validação em duas etapas: (1) conferência técnica da autora contra as fontes oficiais, registrada como tal; (2) confirmação material pela CLABI (Coordenadoria de Licenciamento Ambiental de Baixo Impacto), começando por um recorte pequeno da LAC. Só o conteúdo confirmado pela CLABI poderá ser publicado de verdade; nenhuma publicação real foi autorizada até agora.
