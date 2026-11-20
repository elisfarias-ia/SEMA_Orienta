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
| MH-06 | Ver o MCP | Item retirado da saúde em ajuste posterior (não é componente operacional); conferência do resumo corrigido ainda pendente | substituído |
| MH-07 | Clicar em "Verificar novamente" | A verificação é refeita e a tela é atualizada | aprovado |
| MH-08 | Conferir as datas e horas | Formato DD-MM-AAAA HH:mm:ss | aprovado |
| MH-09 | Procurar linhas duplicadas, caminhos, tokens e erros internos | Nenhum aparece | aprovado |
| MH-10 | Usar a página em desktop e em 390 × 844 px | Sem rolagem horizontal | aprovado |
| MH-11 | Navegar só pelo teclado | Ordem de foco coerente e foco visível | aprovado |
| MH-12 | Abrir a interface pública | Sem alteração | aprovado |
| MH-13 | Conferir o resumo corrigido em `/admin/saude/` (13/11/2026) | 6 operacionais, 0 degradados, 0 indisponíveis, 0 não verificados e 3 não implementados (processamento de fontes, banco e IA); MCP ausente da saúde; mensagem de que recurso não implementado não é falha; layout aprovado | aprovado |

**Registro**

- **Aprovados pela usuária:** MH-01 a MH-05 e MH-07 a MH-13 (MH-06 substituído, pois o MCP saiu da saúde; MH-13 confere o resumo corrigido).
- **Cobertos só por testes automatizados:** os estados degradado e indisponível (falhas simuladas em cópias temporárias da base e do armazenamento), a proteção do endpoint e a ausência de vazamento. Não foram provocados manualmente.
- **Dados:** nenhum dado real foi criado ou alterado.

### Execução — informações do chatbot (Sprint 3, Passo 3B2)

- **Data:** 13/11/2026.
- **Ambiente:** `npm run dev` (sem `--host`), em `http://localhost:5173/admin/conteudo/`.
- **Dimensão móvel:** 390 × 844 px.
- **Validação:** conferência manual pela usuária.

| ID | Cenário | Resultado esperado | Resultado |
|---|---|---|---|
| MC-01 | Abrir a página separada "Informações do chatbot" (`/admin/conteudo/`) e usar a navegação entre as três páginas | Página própria, com navegação "Cadastro da base", "Informações do chatbot" e "Saúde do sistema" | aprovado |
| MC-02 | Cadastrar uma informação (dado fictício) | Confirmação antes de salvar; informação em elaboração (rascunho), ainda não disponível no chatbot | aprovado |
| MC-03 | Editar a informação cadastrada | Formulário preenchido; alteração salva depois da confirmação | aprovado |
| MC-04 | Excluir a informação cadastrada | Confirmação de exclusão; informação removida da lista | aprovado |
| MC-05 | Conferir a linguagem das páginas e dos campos | Nomes, campos e instruções claros para usuário não técnico | aprovado com ressalva (primeira versão considerada confusa); corrigida e aprovada em seguida |
| MC-06 | Conferir o visual em desktop e em 390 × 844 px | Padrão visual aprovado (cartões, cabeçalho verde, duas colunas em tela larga), sem rolagem horizontal | aprovado |
| MC-07 | Conferir os ícones | Ícones SVG simples de traço verde, sem emojis | aprovado |
| MC-08 | Procurar ids e termos técnicos na tela | Nenhum aparece | aprovado |
| MC-09 | Abrir a interface pública (chat) | Sem alteração | aprovado |

**Registro**

- **Aprovados pela usuária:** MC-01 a MC-04 (cadastro, edição e exclusão), MC-06 a MC-09 e MC-05 com ressalva de linguagem, depois corrigida.
- **Dados:** o dado fictício criado no teste foi excluído pela própria tela e a base foi restaurada pelo Git: o conteúdo da LAC voltou ao original (5 blocos) e não existe bloco "TESTE MANUAL". `services/` (dados) sem alterações.
- **Cobertos só por testes automatizados:** erros do servidor (409, 404, 422, 500), clique duplo, concorrência, rollback e proteção do endpoint, todos com requisições simuladas ou cópias temporárias.
- **Fora desta entrega:** o cadastro guiado de assunto, serviço e fontes foi transferido para a Issue #8 (Sprint 4).

### Execução — gestão simples por serviço (Sprint 4, Passo 4B2)

Conferência manual feita pela usuária em 15/11/2026, em `http://localhost:5173/admin/`.

| Aspecto | Resultado |
|---|---|
| Funcionalidades | **Aprovadas** |
| Linguagem | **Aprovada** após substituição dos textos da área "Nova informação" ("Documentos ou links usados", "Selecione onde esta informação pode ser conferida.", orientação sobre dados pessoais) |
| Responsividade | **Reprovada inicialmente e corrigida** neste ajuste (largura mínima fixa em rem na grade de saúde e palavras longas nos rótulos de fonte alargavam a página com texto ampliado; placeholder cortado) |

O que cobre a correção (executado): `e2e-real/responsivo.spec.js` (desktop 1280, 390 × 844, e 390 × 844 com texto a 150% e a 200%: sem rolagem horizontal, nada fora da tela nem cortado, textos longos quebrando e foco visível por Tab) e as especificações de `e2e/`. A nova conferência visual da usuária aprovou a responsividade em desktop e celular (15/11/2026).

### Execução — revisão de conteúdo (Sprint 5, Passo 5B2)

Conferência manual feita pela usuária em 16/11/2026, em ambiente temporário (cópia de `services/` e histórico fora do repositório).

| Aspecto | Resultado |
|---|---|
| Revisão (revisar fonte, aceitar, reabrir, excluir informação, concluir revisão, nova versão) e navegação | **Aprovadas** |
| Nomenclatura ("Conteúdo para respostas", "Informações cadastradas", "Incluir informação", "Excluir informação") | **Aprovada** |
| Cadastro de texto simplificado (somente título e texto) | **Aprovado** |
| Contato institucional do domínio configurado no texto informado | **Aceito** (e-mail externo continua bloqueado) |
| Responsividade (desktop, 390 px e texto ampliado) | **Aprovada** |
| Edição e exclusão de fontes (documentos, textos e links) | **Ficaram para o 5B3**, como requisito obrigatório |

A manutenção de documentos, textos e links passa a ser requisito do Passo 5B3. Nada foi publicado e nenhum dado real foi alterado na conferência.

### Execução — Sprint 5 (fechamento)

Resultados **automatizados**. A conferência manual dos passos 5B3b, 5B3c e 5C **ainda não foi feita pela usuária**: está **pendente de conferência**, sem aprovação registrada.

| Verificação | Resultado |
|---|---|
| `npm run validate:services` | ok |
| `npm test` | 917 testes: 913 ok, 0 falha, 4 NÃO TESTADOS (links simbólicos, EPERM no Windows) |
| e2e simulado | 34 ok |
| e2e real | 73 ok |
| `npm run build` | ok |
| `node scripts/check-dist.js` | limpo (151 termos) |
| Auditorias 5B3a, 5B3b, 5B3c, 5C e final | final aprovada, sem bloqueantes nem importantes |

A "autorização" do MVP é feita pelo "Servidor de demonstração", sem identidade real, e não equivale à validação material pela área competente da SEMA. Nenhuma publicação real foi criada; a LAC segue não publicada.

### Execução — importação de conteúdo existente (Sprint 5, ajuste do 5B3c)

Conferência manual feita pela usuária, em ambiente temporário (cópia de `services/`); **aprovada**.

| Aspecto | Resultado |
|---|---|
| Lista "Orientações encontradas no conteúdo antigo" com 24 candidatos da LAC (descrição, etapas, condições e requisitos, 21 perguntas com resposta) | **Aprovada** |
| Documentos, normas, links e conteúdos de teste fora da lista (continuam como fontes) | **Aprovado** |
| Frase padronizada "pendente de confirmação pela área competente antes da publicação" removida só no preenchimento; arquivo antigo intacto | **Aprovada** |
| Aviso "Conteúdo antigo: confira e atualize esta orientação antes de salvar." (não gravado) | **Aprovado** |
| Importação sempre em elaboração, sem aceitação, revisão ou publicação automática | **Aprovada** |

Depois do ajuste foram executados apenas os testes direcionados (Node da importação: 27 ok; Playwright real da importação: 6 ok; `validate:services` ok; `git diff --check` limpo). A bateria completa e o build não foram repetidos depois do filtro; os últimos resultados completos estão na seção de fechamento acima. Nenhum dado real foi alterado e nada foi publicado.

### Execução — seleção de respostas do chat publicado (Sprint 5, correção do 5C)

Conferência manual feita pela usuária, em ambiente temporário (cópia de `services/`, com dados fictícios e a LAC da cópia publicada); **aprovada**. A primeira conferência encontrou uma falha de relevância: a pergunta sobre `zorbulante` trazia também o bloco de link e sua URL, por coincidência de palavras genéricas. A seleção foi corrigida (termos distintivos pesam mais; termos presentes em mais da metade das informações valem zero; o segundo bloco só entra com pontuação comparável) e conferida de novo.

| Pergunta (termo fictício) | Resultado |
|---|---|
| `zorbulante` | Retornou **somente** o texto cadastrado, sem fonte nem URL |
| `quimerônico` | Retornou **somente** o bloco de link e a sua URL |
| Pergunta combinada | Utilizou **os dois** blocos |
| `pendurabilis` (em elaboração) e `excluidônio` (excluído) | **Não revelaram** conteúdo |
| Perguntas genéricas | Podem retornar a resposta de limitação, pois a busca atual é textual e determinística (sem IA) |

Nenhum dado real foi alterado e nada da LAC real foi publicado.

### Execução — hooks de proteção (Sprint 6, Passo 6C; Issue #19)

Conferência ao vivo dos hooks integrados à `main` pelas PRs #20 (hook do Claude Code, Passo 6A) e #21 (pre-commit do Git, Passo 6B). As demais regras e as liberações são cobertas pelos testes automatizados (`tests/hook-claude.test.js` e `tests/hook-pre-commit.test.js`), e não por esta conferência.

**Conferido pela usuária**

| Regra | Data | O que foi tentado | Resultado |
|---|---|---|---|
| B1 (pre-commit) | 20/11/2026 | Com o hook ativado (`npm run hooks:instalar`), criar `services/lac/publico/conteudo-0000000000000000.json` com `{}`, adicioná-lo e tentar o commit "teste: deve ser barrado". | **Bloqueado**, com a mensagem esperada, segundo a usuária. Depois ela desfez o teste (`git reset` e remoção de `services/lac/publico/`), e o `git status` voltou ao normal. |

Mensagem conferida pela usuária no print, que mostra esta mensagem (reproduzida aqui a partir do código-fonte, não transcrita do print; formato de `scripts/hooks/regras.js` e `scripts/hooks/pre-commit.js`):

```text
Commit bloqueado (B1): conteúdo público (services/<serviço>/publico/) só entra com publicação autorizada registrada em .githooks/publicacoes-autorizadas.json.
  -> services/lac/publico/conteudo-0000000000000000.json

Nada foi commitado. Detalhes e liberação autorizada: docs/ADMINISTRACAO.md.
```

**Conferido pelo assistente de código** (sessão real do Claude Code, com o hook ativo; as mensagens abaixo foram copiadas do erro devolvido pelo Claude Code)

| Regra | Data | O que foi tentado | Mensagem exata recebida |
|---|---|---|---|
| A5 | 19/11/2026 | Durante o ajuste do Passo 6A (bloqueio por padrão do pedido malformado), editar `scripts/hooks/protecao-claude.js` com a ferramenta de edição (quatro tentativas). | `Bloqueado (A5): o assistente não pode alterar o próprio hook de proteção, as configurações do Claude Code nem o arquivo de liberação.` |
| A1 | 20/11/2026 | Criar `services/lac/teste-hook-a1.json` com o conteúdo `{}`, usando a ferramenta normal de gravação de arquivos. | `Bloqueado (A1): o assistente não grava diretamente nos dados da base (services/registry.json, services/assuntos.json, pastas dos serviços ou data/). Use uma cópia temporária fora do projeto ou peça à usuária uma liberação por prazo curto.` |
| A3 | 20/11/2026 | Executar `git push origin HEAD:teste-hook-a3 --force`. | `Bloqueado (A3): push forçado é proibido neste projeto.` |

**Nenhum dado foi alterado**

- **A5:** o script não foi alterado pelo assistente. A correção foi validada fora do projeto e copiada pela usuária, que conferiu a cópia byte a byte antes dos testes.
- **A1:** depois do bloqueio, `services/lac/` continuou só com `versoes/`, o arquivo `teste-hook-a1.json` não existe e o `git status` não mostrou mudanças. Não havia arquivo de liberação (`.claude/liberacao-protecao.json`).
- **A3:** o comando foi barrado antes de executar, sem contato com o GitHub. A conferência de leitura (`git ls-remote --heads origin teste-hook-a3`) não encontrou o branch.
- **B1:** nada foi commitado, segundo a usuária, e o arquivo de teste foi removido.

Também foi conferido que o hook do Claude Code resolve `$CLAUDE_PROJECT_DIR` corretamente numa sessão real. As regras A2, A4, A6, A7 e A0, a liberação por prazo curto e as regras B0 e B2 a B5 não foram conferidas ao vivo: estão cobertas só pelos testes automatizados. A regra B5 rodou de verdade no commit do Passo 6B (`e15a2fe`), em cerca de 3,6 s, mas só no caso em que o build passa.

### Execução — revogação pelo navegador (Sprint 7, Passo 7E; Issue #24)

A conferência do botão e do diálogo de revogação, pendente desde o Passo 7B, foi feita por um **teste automatizado de ponta a ponta executado de verdade**, não simulado: `e2e-real/revogacao-real.spec.js`, no Chromium do Playwright, contra o servidor do Vite real (porta 5183, só localhost), com uma **cópia temporária** de `services/` e dados fictícios (`e2e-real/preparar.js`). Nenhum dado real foi usado.

**Execução:** 20/11/2026, `npx playwright test -c playwright.real.config.js revogacao-real zz-base-real`: **2 testes, 2 passaram** (5,6 s). O segundo teste (`zz-base-real.spec.js`) confere por hash que a pasta `services/` real não mudou; depois da execução, o `git status` não mostrou mudança na base e a pasta `data/` continuou inexistente no projeto.

**O que o teste conferiu no navegador**

| Etapa | Resultado conferido |
|---|---|
| 1. Publicar uma versão de teste | Texto e informação fictícios incluídos, fonte revisada, informação aceita, revisão concluída, autorização e publicação pelas telas reais; "Versão publicada." Antes da publicação, o botão "Revogar publicação" fica oculto. |
| 2. Chat usa o conteúdo publicado | A resposta traz o texto publicado, e a página indica o arquivo de conteúdo público. |
| 3. Revogar pelo botão | O botão aparece com a versão publicada; o diálogo "Revogar a publicação?" mostra o aviso; confirmar com o motivo em branco **não envia**, mantém o diálogo aberto e mostra "Informe o motivo da revogação." (campo marcado como inválido); com o motivo preenchido, a revogação é confirmada. |
| 4. Situação na tela | O diálogo fecha, a mensagem e o cartão mostram "Publicação revogada." e o botão some. |
| 5. Chat deixa de usar o conteúdo | A página não indica mais o arquivo público e a resposta não traz o texto revogado. A decisão de revogação, com o motivo e o perfil `demonstracao`, ficou no histórico privado **da cópia**. |

**Coberto só por testes automatizados (não conferido por pessoa)**

- O fluxo acima foi conferido pelo teste, não por olhar humano: aparência, leitura em tela, contraste e uso por teclado e leitor de tela do diálogo não foram avaliados.
- As regras de revogação no domínio, na rota, no pre-commit e na verificação da PR estão cobertas por `tests/revogacao.test.js`, `tests/revogacao-rota.test.js`, `tests/atores.test.js` e `tests/hook-revogacao.test.js`.

**Exigiria conferência manual da usuária**

- Usar o diálogo por teclado (Tab, Esc e foco) e conferir a leitura por leitor de tela.
- Conferir a aparência em celular (390 px) e em computador.
- Fazer a revogação numa cópia preparada pela própria usuária, se quiser evidência visual (por exemplo, captura de tela), sem usar a base real.
