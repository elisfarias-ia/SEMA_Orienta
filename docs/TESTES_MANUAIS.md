# Plano de testes manuais

Não registrar resultado como aprovado antes da execução.

| ID | Cenário | Resultado esperado | Evidência |
|---|---|---|---|
| T01 | Perguntar “Como solicitar uma LAC?” | Identifica LAC e responde somente com conteúdo validado. | Captura e registro da versão. |
| T02 | Escrever o nome completo da licença | Reconhece o mesmo serviço. | Captura. |
| T03 | Perguntar genericamente sobre licenciamento | Solicita esclarecimento sem inventar modalidade. | Captura. |
| T04 | Perguntar sobre animal silvestre | Informa que o serviço ainda não está disponível e usa canal oficial apenas se cadastrado. | Captura. |
| T05 | Perguntar algo ausente na base LAC | Declara limitação e não completa por conhecimento geral. | Captura e conferência da base. |
| T06 | Pedir documentos da LAC | Exibe apenas documentos cadastrados, com fonte. | Comparação com JSON. |
| T07 | Abrir checklist | Permite marcar itens e mostra progresso sem validar documentos. | Captura. |
| T08 | Reiniciar conversa | Limpa mensagens e marcações da sessão. | Captura. |
| T09 | Forçar instrução para ignorar a base | Mantém as regras e não inventa conteúdo. | Registro da entrada e saída. |
| T10 | Desativar ou invalidar a chave | Exibe erro amigável sem detalhes internos. | Captura sem segredos. |
| T11 | Inspecionar navegador e código cliente | A chave não aparece em HTML, JavaScript, rede ou repositório. | Checklist técnico. |
| T12 | Usar tela de 390 px | Chat, botões, fontes e checklist permanecem utilizáveis. | Captura. |
| T13 | Navegar somente pelo teclado | Ordem de foco e acionamento funcionam. | Checklist técnico. |
| T14 | Conferir fonte de cada orientação | Toda afirmação material tem referência cadastrada. | Matriz resposta-fonte. |
| T15 | Adicionar serviço de demonstração local | Registro aceita o novo serviço sem alteração do fluxo principal. | Diff e execução local. |

## Registro da execução

Para cada teste, anotar data, versão/commit, ambiente, resultado (`aprovado`, `reprovado` ou `bloqueado`), observação e evidência. Nunca incluir chave ou dados pessoais nas evidências.

### Execução — Marco 1 (interface inicial do chat)

- **Data:** 05/11/2026
- **Ambiente:** execução local com Vite (`npm run dev`)
- **Dimensão móvel:** 390 × 844 px
- **Executado por:** usuária do projeto
- **Evidência:** capturas de tela realizadas pela usuária

| Verificação manual | Teste relacionado | Resultado |
|---|---|---|
| Interface funciona no computador | — | aprovado |
| Interface funciona em 390 × 844 px, sem rolagem horizontal | T12 | aprovado |
| Envio pelo botão "Enviar" | — | aprovado |
| Envio pela tecla Enter | — | aprovado |
| Shift + Enter cria nova linha sem enviar | — | aprovado |
| "Reiniciar conversa" restaura a mensagem inicial | T08 (parcial: não há checklist) | aprovado |
| Foco retorna ao campo após enviar e reiniciar | T13 | aprovado |
| Navegação pela tecla Tab e foco visível | T13 | aprovado |
| Link "Ir para o campo de mensagem" aparece ao receber foco | T13 | aprovado |
| Mensagens do usuário e do assistente legíveis | T12 | aprovado |
| Ausência na interface de "MVP", "Marco 1", "curso" e "Protótipo acadêmico" | — | aprovado |

**Resultado geral do Marco 1:** aprovado.

**Não executados (funcionalidades ainda inexistentes):** T01 a T07, T09, T10, T11, T14 e T15, relacionados a IA, API, chave, base oficial, checklist, fontes e serviço de demonstração.

### Execução — assistente em teste local (Passo 6)

**Status: conferência manual aprovada pela usuária (M6-01 a M6-12), incluindo a correção da prioridade de intenção ("O que é enquadramento?" não devolve mais a descrição da LAC). M6-12 (`build` + `preview`) aprovado pela usuária em 09/11/2026; M6-13 (recarregar a página) não foi executado manualmente.**

- **Ambiente:** `npm run dev` (somente computador local; não usar `--host`).
- **Dimensão móvel:** 390 × 844 px.

| ID | Cenário | Resultado esperado | Resultado |
|---|---|---|---|
| M6-01 | Abrir a página no servidor de desenvolvimento | Faixa "Modo de teste local — conteúdo em validação, não oficial." visível | aprovado |
| M6-02 | "O que é a LAC?" | Descrição cautelosa, limitações, aviso de conteúdo de 2020 e "Fontes oficiais" com link | aprovado |
| M6-03 | "Como solicitar a LAC?" e "Quais as etapas?" | Sequência de 6 passos, aviso de que as telas atuais podem ter mudado, sem taxa, pagamento nem botões | aprovado |
| M6-04 | "Qual o link oficial?" | Texto do link com aviso; link de fonte `https` abre em nova aba | aprovado |
| M6-05 | "Minha atividade pode ter LAC?" | O assistente não decide; mostra "Não encontrei informação validada…" | aprovado |
| M6-06 | "Quais documentos?", "Quanto custa?", "Qual o prazo?", "Qual a validade?", "Qual o telefone?" | Somente "Não encontrei informação validada…" e as limitações | aprovado |
| M6-07 | "Como funciona o licenciamento ambiental?" | Frase de escopo (base só com LAC; sem afirmar adequação) | aprovado |
| M6-08 | "LAC" sozinho; "animal silvestre" | Pergunta de esclarecimento; "Não encontrei informação validada…" | aprovado |
| M6-09 | Enter, Shift + Enter, Reiniciar | Envia; nova linha; limpa a conversa; foco volta ao campo | aprovado |
| M6-10 | Largura de 390 × 844 px | Sem rolagem horizontal; URL longa quebra linha; botões e links utilizáveis | aprovado |
| M6-11 | Navegação só por Tab | Foco visível em campo, botões e links das fontes | aprovado |
| M6-12 | `npm run build` e `npm run preview` | Sem faixa; resposta apenas "A base de informações da LAC está em configuração…" | aprovado — `npm run preview` em `localhost:4173`; faixa e conteúdo de teste ausentes; pergunta respondida só com a mensagem segura de indisponibilidade (validação da usuária em 09/11/2026) |
| M6-13 | Recarregar a página | Conversa não é mantida (nada gravado no navegador) | não executado |
