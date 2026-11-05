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
    └── lac/
        ├── service.json
        ├── roteiro.md
        ├── documentos.json
        ├── perguntas-frequentes.json
        └── fontes.json
```

## Estado atual

Marco 0 — pacote de contexto concluído. Próximo marco: criar a estrutura do projeto e a primeira interface de chat, ainda sem inventar conteúdo da LAC.
