# Requisitos do MVP

## Requisitos funcionais

| ID | Requisito | Critério de aceite resumido |
|---|---|---|
| RF01 | Receber pergunta livre | O usuário envia texto sem preencher questionário prévio. |
| RF02 | Identificar intenção | O sistema relaciona a pergunta à LAC ou informa que o serviço ainda não está disponível. |
| RF03 | Esclarecer ambiguidade | Quando necessário, faz uma pergunta curta antes de responder. |
| RF04 | Consultar base oficial | A resposta usa somente trechos e campos cadastrados e validados. |
| RF05 | Orientar sobre a LAC | Pode apresentar descrição, condições, etapas, documentos, canal e dúvidas frequentes, conforme a base. |
| RF06 | Exibir fontes | A resposta apresenta links ou referências oficiais cadastradas. |
| RF07 | Tratar ausência de informação | Não inventa resposta e indica o canal oficial registrado. |
| RF08 | Apresentar checklist | Exibe os documentos exigidos e permite marcação local pelo usuário. |
| RF09 | Mostrar progresso | Informa quantos itens do checklist foram marcados, sem declarar validade documental. |
| RF10 | Reiniciar conversa | O usuário pode limpar o histórico exibido na sessão. |
| RF11 | Cadastrar novos serviços | Um serviço novo é adicionado por pasta/configuração, sem reescrever o fluxo principal. |
| RF12 | Controlar validação | Conteúdo não validado não pode fundamentar resposta pública. |

## Requisitos não funcionais

| ID | Requisito |
|---|---|
| RNF01 | Interface utilizável em telas a partir de 390 px. |
| RNF02 | Navegação por teclado, foco visível, rótulos e contraste adequados. |
| RNF03 | Chave e chamadas do provedor protegidas no servidor. |
| RNF04 | Conversas não armazenadas no MVP. |
| RNF05 | Respostas rastreáveis às fontes cadastradas. |
| RNF06 | Falhas do provedor tratadas sem expor detalhes técnicos ou segredos. |
| RNF07 | Estrutura modular e versionada com Git. |
| RNF08 | Linguagem simples, objetiva e institucionalmente neutra. |

## Dados mínimos por serviço

- identificador, nome, sigla, categoria e termos equivalentes;
- descrição e público;
- condições e limites da orientação;
- etapas do procedimento;
- documentos e observações do checklist;
- sistema, canal ou local de início;
- perguntas frequentes;
- legislação e fontes oficiais;
- unidade responsável;
- data da última revisão;
- responsável pela validação e status: `rascunho`, `em_validacao` ou `validado`.

## Conteúdo pendente

Todos os dados materiais da LAC dependem do conteúdo oficial que será fornecido pela usuária e validado pela área competente.
