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
