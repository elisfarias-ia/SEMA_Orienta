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

### Execução — fontes do serviço (Passo 7E3A)

**Status: validação manual parcial realizada pela usuária em 11/11/2026** (ver "Registro" abaixo). Aprovados: MF-01, MF-02, MF-03, MF-04, MF-10, MF-11 e MF-13. Permanecem **não executados** os testes que dependem de confirmar o cadastro (`POST`) ou de cenários não verificados: MF-05 a MF-09 e MF-12. **Nenhuma fonte real foi criada.**

- **Ambiente:** `npm run dev` (sem `--host`), em `http://localhost:5173/admin/`, seção "Fontes do serviço".
- **Dimensão móvel:** 390 × 844 px.
- **Atenção:** confirmar o cadastro de uma fonte altera o arquivo de fontes real do serviço escolhido (por exemplo, o da LAC). Use dados fictícios e, ao terminar, restaure o arquivo com o Git: `git restore services/lac/versoes/v1/fontes.json`.

| ID | Cenário | Resultado esperado | Resultado |
|---|---|---|---|
| MF-01 | Abrir a tela e escolher a LAC em "Serviço" | Lista as oito fontes (título, tipo, órgão, validação e "Não publicada") e mostra "Versão atual: lac-v1. Estado: Rascunho. É possível cadastrar fontes." | aprovado |
| MF-02 | Conferir o campo "Origem oficial" | Mostra ao lado: "Origem oficial identifica a procedência, mas não significa que o conteúdo foi validado." | aprovado |
| MF-03 | Enviar o formulário vazio ou com URL `http://`, com usuário e senha ou com data inválida | Mensagens junto de cada campo, foco no primeiro erro, nada é gravado | aprovado |
| MF-04 | Preencher uma fonte fictícia válida e "Revisar cadastro", depois "Voltar" (e Esc) | Painel com o resumo (inclusive a explicação da origem oficial); nada é gravado; o foco volta ao botão | aprovado |
| MF-05 | Repetir e usar "Confirmar cadastro" (altera o arquivo real; desfazer depois) | Mensagem de sucesso com foco, formulário limpo e a nova fonte na lista como "Rascunho" e "Não publicada" | não executado |
| MF-06 | Repetir o mesmo identificador ou a mesma URL | Mensagem curta de duplicidade; nada é alterado | não executado |
| MF-07 | Abrir a tela em duas abas, cadastrar uma fonte numa e tentar outra na segunda, sem recarregar | A segunda recebe "As fontes deste serviço mudaram…", a lista é recarregada e nada é sobrescrito | não executado |
| MF-08 | Clicar duas vezes seguidas em "Confirmar cadastro" | Um único cadastro | não executado |
| MF-09 | Escolher um serviço cuja versão atual não esteja em rascunho | Lista visível, aviso de cadastro bloqueado e botão desabilitado | não executado |
| MF-10 | Navegar só pelo teclado na seção | Ordem de foco coerente, foco visível, painel de confirmação acessível | aprovado |
| MF-11 | Largura de 390 × 844 px | Sem rolagem horizontal; campos, lista e painel utilizáveis | aprovado |
| MF-12 | `npm run build` e `npm run preview` | A seção, a rota e a tela não existem no preview nem no `dist/` | não executado |
| MF-13 | Digitar a data de publicação em DD-MM-AAAA (e uma data inexistente, como 31-02-2026) | A ajuda e os erros mencionam DD-MM-AAAA; a data válida é aceita e exibida nesse formato no resumo; a inexistente é rejeitada | aprovado |

**Registro da validação manual (Passo 7E3A)**

- **Data:** 11/11/2026.
- **Executado por:** usuária do projeto, na seção "Fontes do serviço" da tela "Gestão de conteúdo" (`npm run dev`).
- **Aprovados:** listagem das fontes da LAC (MF-01); formulário e a explicação da origem oficial (MF-02); validações dos campos (MF-03); painel de confirmação e botão "Voltar" (MF-04); navegação por teclado (MF-10); responsividade em 390 × 844 px (MF-11); data de publicação em DD-MM-AAAA (MF-13).
- **Não executados:** MF-05 (confirmar o cadastro e `POST`), MF-06 (duplicidade), MF-07 (duas abas e revisão), MF-08 (clique duplo), MF-09 (serviço fora de rascunho) e MF-12 (`build` e `preview`). Nenhum cadastro foi confirmado, então a criação real de fonte, a atualização da lista após gravar e a revisão otimista em uso real **não foram testadas manualmente** (estão cobertas só pelos testes automatizados, com dados fictícios em cópias temporárias).
- **Dados:** nenhuma fonte real foi criada; as oito fontes da LAC permaneceram inalteradas.

### Execução — administração simplificada (Passo 7E3B)

- **Data:** 13/11/2026.
- **Ambiente:** `npm run dev` (sem `--host`), em `http://localhost:5173/admin/`.
- **Validação:** conferência visual pela usuária; nenhum cadastro foi confirmado.

| ID | Cenário | Resultado esperado | Resultado |
|---|---|---|---|
| MS-01 | Abrir o formulário "Novo assunto" | Somente "Nome" e "Descrição" (sem "Identificador") | aprovado |
| MS-02 | Abrir o formulário "Novo serviço" | "Assunto", "Nome", "Sigla (opcional)" e "Termos equivalentes" (sem "Identificador") | aprovado |
| MS-03 | Ver o catálogo | Nome e descrição do assunto; nome e sigla do serviço; "Situação: Rascunho"; "Não publicado"; sem ids nem versões como "lac-v1" | aprovado |
| MS-04 | Revisar um cadastro e abrir o painel de confirmação, depois "Voltar" | O resumo mostra só os dados informados (sem id), e "Voltar" fecha sem gravar | aprovado |
| MS-05 | Escolher o serviço na seção de fontes | A lista mostra só o nome do serviço e a situação (sem id nem versão) | aprovado |
| MS-06 | Confirmar um cadastro real e conferir o id gerado | O servidor gera o id do nome e o catálogo é atualizado | não executado |
| MS-07 | Nomes com acentos, símbolos ou repetidos (colisão de id) | Normalização e sufixo determinístico | não executado |

**Registro**

- **Aprovados (conferência visual):** MS-01 a MS-05.
- **Não executados manualmente:** MS-06 e MS-07, porque nenhum cadastro foi confirmado e nenhum assunto ou serviço real foi criado. A geração do id, a remoção de acentos, a colisão, o nome inválido e o bloqueio de id enviado pelo cliente estão **cobertos por testes automatizados** (`tests/admin-cadastro.test.js`, `tests/admin-cadastro-endpoint.test.js` e `tests/admin-interface.test.js`).
- **Dados:** o catálogo real continua só com "Licenciamento Ambiental" e a LAC, sem alteração.

### Execução — saúde do sistema (Passo 8B)

- **Data:** 13/11/2026.
- **Ambiente:** `npm run dev` (sem `--host`), em `http://localhost:5173/admin/` e `http://localhost:5173/admin/saude/`.
- **Dimensão móvel:** 390 × 844 px.
- **Validação:** conferência manual pela usuária.

| ID | Cenário | Resultado esperado | Resultado |
|---|---|---|---|
| MH-01 | Abrir `/admin/` e `/admin/saude/` | Gestão de conteúdo e Saúde do sistema em páginas separadas | aprovado |
| MH-02 | Usar a navegação do cabeçalho entre as páginas | Leva de uma página à outra e destaca a página atual | aprovado |
| MH-03 | Ver a tela de cadastro | Sem a seção de saúde e com rolagem reduzida | aprovado |
| MH-04 | Ver a lista de componentes | Aplicação, base, armazenamento e publicação apresentados | aprovado |
| MH-05 | Ver banco de dados, IA externa e processamento de fontes | Aparecem como não implementados | aprovado |
| MH-06 | Ver o MCP | Aparece como não aplicável à operação do produto | aprovado |
| MH-07 | Clicar em "Verificar novamente" | A verificação é refeita e a tela é atualizada | aprovado |
| MH-08 | Conferir as datas e horas | Formato DD-MM-AAAA HH:mm:ss | aprovado |
| MH-09 | Procurar linhas duplicadas, caminhos, tokens e erros internos | Nenhum aparece | aprovado |
| MH-10 | Usar a página em desktop e em 390 × 844 px | Sem rolagem horizontal | aprovado |
| MH-11 | Navegar só pelo teclado | Ordem de foco coerente e foco visível | aprovado |
| MH-12 | Abrir a interface pública | Sem alteração | aprovado |

**Registro**

- **Aprovados pela usuária:** MH-01 a MH-12.
- **Cobertos só por testes automatizados:** os estados degradado e indisponível (falhas simuladas em cópias temporárias da base e do armazenamento), a proteção do endpoint e a ausência de vazamento. Não foram provocados manualmente.
- **Dados:** nenhum dado real foi criado ou alterado.
