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

### Execução — tela "Gestão de conteúdo" (Passo 7E2)

**Status: validação manual parcial realizada pela usuária em 10/11/2026** (ver "Registro" abaixo). Aprovados: MA-01, MA-03, MA-04, MA-05, MA-10, MA-11, MA-15 e MA-16 (sem gravação) e MA-06 e MA-07 (cadastro de teste confirmado pela interface, comprovado pelos fatos do segundo registro). Permanecem **não executados**: MA-02, MA-08, MA-09, MA-12, MA-13 e MA-14.

- **Ambiente:** `npm run dev` (sem `--host`), em `http://localhost:5173/admin/`.
- **Dimensão móvel:** 390 × 844 px.
- **Atenção:** confirmar um cadastro grava arquivos reais em `services/`. Use somente dados fictícios e, ao terminar, desfaça: restaure `services/assuntos.json` e `services/registry.json` com o Git e remova a pasta do serviço criado.

| ID | Cenário | Resultado esperado | Resultado |
|---|---|---|---|
| MA-01 | Abrir `http://localhost:5173/admin/` | Título "SEMA Orienta — Gestão de conteúdo", aviso "Ambiente administrativo local — sem autenticação" e catálogo com "Licenciamento Ambiental" e a LAC (versão atual, estado e "Não publicada") | aprovado |
| MA-02 | Abrir `/admin` (sem barra final) | Redireciona para `/admin/` | não executado |
| MA-03 | Abrir a página do cidadão | Nenhum link ou menção à administração | aprovado |
| MA-04 | Enviar os formulários vazios ou com dados inválidos | Mensagens curtas junto de cada campo, foco no primeiro campo com erro, nada é gravado | aprovado |
| MA-05 | "Novo assunto" com dados fictícios, "Revisar cadastro", depois "Voltar" (e também Esc) | Painel de confirmação com o resumo; nada é gravado; o foco volta ao botão de origem | aprovado |
| MA-06 | Repetir e usar "Confirmar cadastro" | Mensagem de sucesso com foco, formulário limpo, assunto no catálogo (desfazer depois) | aprovado |
| MA-07 | "Novo serviço": escolher o assunto, preencher, termos um por linha, revisar e confirmar | Resumo correto; serviço aparece em "Rascunho" e "Não publicada", sem conteúdo (desfazer depois) | aprovado |
| MA-08 | Repetir um identificador ou nome já existente | Mensagem curta de duplicidade; nada é alterado | não executado |
| MA-09 | Clicar duas vezes seguidas em "Confirmar cadastro" | Um único cadastro; botões desabilitados durante a gravação | não executado |
| MA-10 | Navegar só pelo teclado (Tab, Shift+Tab, Enter, Esc) | Ordem de foco coerente, foco visível, diálogo sem escape do foco, leitor de tela anuncia o status | aprovado |
| MA-11 | Largura de 390 × 844 px | Sem rolagem horizontal; campos, botões e diálogo utilizáveis | aprovado |
| MA-12 | Ativar "reduzir movimento" no sistema | Sem transições ou animações | não executado |
| MA-13 | `npm run build` e `npm run preview` | `/admin/` não existe no preview e o `dist/` não contém a tela | não executado |
| MA-14 | Parar o servidor e recarregar a tela já aberta (ou abrir com o servidor parado) | Mensagem de falha de comunicação; botões de envio desabilitados | não executado |
| MA-15 | Procurar o token de sessão na tela (textos, painel de confirmação, mensagens) | O token não aparece em nenhum lugar visível | aprovado |
| MA-16 | Procurar ações de editar, excluir, validar ou publicar | Não existem; a tela só cadastra assunto e serviço | aprovado |

**Registro da validação manual (Passo 7E2)**

- **Data:** 10/11/2026.
- **Executado por:** usuária do projeto.
- **Evidência:** captura de tela fornecida pela usuária.
- **Aprovados:** carregamento da interface administrativa; aviso "Ambiente administrativo local — sem autenticação"; catálogo com "Licenciamento Ambiental" e a LAC (MA-01); interface do cidadão sem referência à administração (MA-03); validação dos campos com foco no primeiro erro (MA-04); abertura do painel de confirmação, botão "Voltar" com retorno correto do foco (MA-05); navegação por teclado e Esc (MA-10); layout em 390 × 844 px sem rolagem horizontal (MA-11); token não visível (MA-15); ausência de editar, excluir, validar e publicar (MA-16).
- **Não executados nesse primeiro registro:** MA-02 (redirecionamento de `/admin`), MA-06 a MA-09 (confirmar cadastro e `POST`), MA-12 (reduzir movimento), MA-13 (`build` e `preview`) e MA-14 (servidor parado). MA-06 e MA-07 foram comprovados depois, pelo segundo registro; MA-02, MA-08, MA-09, MA-12, MA-13 e MA-14 continuam não executados.

**Registro do cadastro de teste pela interface (Passo 7E2)**

- **Data:** 10/11/2026.
- **Executado por:** usuária do projeto, na tela "Gestão de conteúdo" (`npm run dev`).
- **Fatos comprovados:**
  - a usuária confirmou pela interface o cadastro de um assunto de teste e de um serviço de teste;
  - os `POST` foram executados com sucesso (assunto e serviço criados);
  - o catálogo foi atualizado com os dois novos itens;
  - a versão 1 completa do serviço foi criada, em rascunho e não publicada: manifesto com `estado: rascunho`, sem hash, sem envio e sem decisão; registro com `versaoPublicadaId: null` e `publicado: false`; os sete arquivos da versão com conteúdo vazio ou `PENDENTE`;
  - a base permaneceu válida (`npm run validate:services` sem erros, com o serviço de teste incluído);
  - os dados de teste foram removidos depois da verificação (restauração de `services/assuntos.json` e `services/registry.json` pelo Git e remoção da pasta do serviço de teste), e o catálogo voltou a ter somente "Licenciamento Ambiental" e a LAC.
- **Aprovados por esses fatos:** MA-06 (assunto cadastrado e presente no catálogo) e MA-07 (serviço cadastrado em rascunho, não publicado e sem conteúdo). Não houve registro separado do foco na mensagem de sucesso, da limpeza do formulário e do texto do resumo do painel de confirmação.
- **Continuam não executados:** MA-08 (duplicidade de identificador ou nome) e MA-09 (clique duplo em "Confirmar cadastro"), pois nada nos fatos acima os comprova.
