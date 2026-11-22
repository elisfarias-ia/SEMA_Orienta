# Módulo administrativo local — gestão de conteúdo

Este documento descreve os limites do módulo de gestão de conteúdo e validação material (Marco 7). Ele é **local, para desenvolvimento**, e **separado do chat do cidadão**. Até este passo existem apenas funções e armazenamento: não há interface, endpoint nem dados reais.

## O que existe hoje

| Peça | Arquivo | Situação |
|---|---|---|
| Catálogo de assuntos | `services/assuntos.json` | Um assunto: "Licenciamento Ambiental". |
| Fluxo de estados e hash | `services/admin/fluxo.js`, `hash.js` | Funções puras. |
| Versões e decisões | `services/admin/versao.js`, `decisoes.js` | Funções puras, sem dados reais. |
| Armazenamento local | `services/admin/armazenamento.js` | Leitura e gravação seguras; só a leitura é usada pelo endpoint. |
| Endpoint administrativo local | `services/admin/admin-endpoint.js` | Somente no `npm run dev`: leitura e cadastro de assunto e serviço; sem interface. |
| Cadastro e transação | `services/admin/cadastro.js`, `transacao.js` | Montagem pura do assunto e do esqueleto do serviço; gravação tudo ou nada. |
| Tela "Gestão de conteúdo" | `admin/` (`index.html`, `styles.css`, `admin.js`, `admin-logic.js`) | Somente no `npm run dev`, em `http://localhost:5173/admin/`; gestão simples por serviço (seção "Gestão simples por serviço", Sprint 4). As seções antigas abaixo descrevem as telas anteriores, já substituídas. |
| Informações do chatbot (blocos de conhecimento) | `services/admin/conhecimento.js`, `admin/conteudo/` | Funções puras, endpoints `/__admin/servicos/<id>/conhecimentos` e a página `/admin/conteudo/`; só no `npm run dev` (Sprint 3). |
| Saúde do sistema | `services/admin/saude.js` e `admin/saude/` | Verificações reais por `GET /__admin/saude` e a página `/admin/saude/`; só no `npm run dev`. |

Nenhuma versão, decisão, validação material ou autorização de publicação real foi registrada. O conteúdo da LAC está na versão 1 (`services/lac/versoes/v1/`, em rascunho), migrada de forma estrutural, sem alteração material, sem hash, sem envio e sem decisões.

## Endpoint administrativo local

Existe apenas no servidor de desenvolvimento (`npm run dev`): o plugin usa `apply: 'serve'` e não há gancho de preview, então **o build e o preview não o têm**. Não há interface administrativa ainda.

| Rota | Exige token | O que faz |
|---|---|---|
| `GET /__admin/sessao` | não | Usuário da sessão (ou `null`), usuários selecionáveis e, só com sessão, o token (Passo 8B). Não cria sessão. |
| `POST /__admin/sessao` | não | Entra com `{ "usuarioId": "<texto>" }` (login simulado, Passo 8B); devolve `{ token, usuario, acoes }` (as ações do perfil, Passo 8C). |
| `DELETE /__admin/sessao` | sim | Sai: encerra a sessão (204). |
| `GET /__admin/catalogo` | sim | Assuntos e serviços, com versão atual e versão publicada. |
| `GET /__admin/servicos/<id>/versao-atual` | sim | Manifesto e arquivos modulares da versão atual (id de serviço cadastrado). |
| `POST /__admin/assuntos` | sim | Cadastra um assunto (corpo: `nome` e `descricao`; o id é gerado pelo servidor). |
| `POST /__admin/servicos` | sim | Cadastra um serviço (corpo: `assuntoId`, `nome`, `termosEquivalentes` e `sigla` opcional; o id é gerado pelo servidor). |
| `POST /__admin/servicos/<id>/fontes` | sim | Cadastra uma fonte na versão atual do serviço, só se estiver em rascunho (corpo: `revisao` e os campos da fonte). |

- **Token:** gerado com `node:crypto` (32 bytes aleatórios) a cada entrada no login simulado (Passo 8B), mantido só em memória do servidor de desenvolvimento (`services/admin/sessao.js`), enviado no cabeçalho `X-Admin-Token` e comparado de forma segura. Não é gravado, não vai para cookie, `localStorage` nem variável de ambiente, e nunca é registrado em log. Reiniciar o servidor invalida o token.
- **Origem:** só conexão local (`127.0.0.1` ou `::1`), `Host` local na porta do servidor, `Origin` (se enviada) igual ao host da requisição e requisição não cruzada entre sites. Sem CORS.
- **Requisição:** as rotas de leitura aceitam só `GET`, sem corpo; as de cadastro, só `POST`. Exceção: a rota da sessão (`/__admin/sessao`, Passo 8B) aceita `GET`, `POST` (entrar, JSON de até 1 KB) e `DELETE` (sair). Query string, rotas desconhecidas, travessia de caminho e ids inválidos ou não cadastrados são recusados. Os erros são códigos genéricos, sem caminho, token ou conteúdo.
- **Leitura:** não altera nada e **não lê `data/admin-private/`**. A resposta tem limite de 2 MB, e os arquivos lidos têm os limites do armazenamento.
- **Escrita:** só as duas rotas de cadastro gravam, e somente dentro de `services/`. Não há edição, exclusão, decisão nem publicação.
- **O token não é autenticação de pessoas.** Ele só impede que outro site aberto no navegador use o endpoint; quem tem acesso à máquina continua tendo acesso.

### Cadastro de assunto e serviço (Passo 7E1)

As duas rotas de cadastro exigem token, origem local, `Content-Type: application/json`, corpo de até 32 KB, JSON válido e somente os campos permitidos (qualquer outro, como `publicado`, `estado` ou `hashConteudo`, é recusado com 422).

- **Assunto:** `nome` e `descricao` obrigatórios (o id é gerado pelo servidor, ver "Identificadores automáticos"); nome já existente (sem distinguir acento e caixa) recebe 409. Nasce com `ativo: true`, e as datas são geradas pelo servidor.
- **Serviço:** exige assunto existente e ativo e nome inédito (o id é gerado pelo servidor e nunca reaproveita uma pasta existente). Nasce sempre como **versão 1, em rascunho, `publicado: false`**, com `versaoAtualId: <id>-v1` e `versaoPublicadaId: null`, sem hash, decisão, responsável ou autorização. A estrutura modular é criada em `services/<id>/versoes/v1/` (manifesto, `service.json`, roteiro, documentos, perguntas, fontes e conteúdo do assistente), com listas vazias e `PENDENTE`; o roteiro tem só as seções obrigatórias, todas `PENDENTE`. **Nenhum conteúdo ambiental é inventado.** Sem sigla informada, o campo fica `PENDENTE`.
- **Tudo ou nada:** a alteração é ensaiada numa cópia temporária e conferida pelo validador da base; depois é gravada com escrita atômica (o registro por último) e conferida de novo. Se qualquer gravação ou a conferência falhar, tudo é desfeito: arquivos novos e pastas criadas são removidos e o que já existia volta byte a byte. Nunca sobrescreve assunto, serviço ou pasta existente.
- **Concorrência:** uma gravação por vez; se outra estiver em andamento, a nova recebe 409 (`operacao_em_andamento`), sem perder dados.
- **Sem registro de dados:** o corpo, o token e os dados enviados não vão para log, e os erros não repetem o que foi enviado.

## Tela "Gestão de conteúdo" (Passo 7E2)

- **Acesso:** somente no `npm run dev`, em `http://localhost:5173/admin/` (`/admin` redireciona para `/admin/`). A pasta `admin/` não entra no build nem no preview, e não há link para ela na interface do cidadão. A tela mostra o aviso "Ambiente administrativo local — sem autenticação".
- **O que mostra:** o catálogo (assuntos e, em cada um, os serviços com nome, sigla, situação amigável e "Publicado" ou "Não publicado", sem ids técnicos nem versões) e os formulários "Novo assunto" (nome e descrição) e "Novo serviço" (assunto, nome, sigla opcional e termos equivalentes).
- **Como cadastra:** o formulário valida os dados e abre uma confirmação com o resumo e os botões "Voltar" e "Confirmar cadastro". Só depois de confirmar é feita a gravação. Com sucesso, o formulário é limpo, o catálogo é atualizado e o foco vai para a mensagem de confirmação.
- **Sessão e token:** o token é obtido em `/__admin/sessao`, fica só numa variável em memória e é enviado em `X-Admin-Token`; nunca aparece na tela. Enquanto a sessão ou o catálogo não estiverem disponíveis, e durante uma gravação, os botões de envio ficam desabilitados (sem envio duplicado).
- **Segurança do código:** só `textContent` e APIs seguras do DOM; sem `innerHTML`, `localStorage`, `sessionStorage`, cookies ou log. Os erros do endpoint viram mensagens curtas em português, sem mostrar a resposta bruta.
- **O que não faz:** não edita nem exclui, não valida, não registra decisão e não publica. Não altera a LAC.
- **Atenção em testes manuais:** confirmar um cadastro grava arquivos reais em `services/`. Use dados fictícios e desfaça depois (restaure `services/assuntos.json` e `services/registry.json` com o Git e remova a pasta do serviço criada).

### Identificadores automáticos e tela simplificada (Passo 7E3B)

- **Identificadores gerados pelo servidor:** o id de assunto e de serviço sai do nome: minúsculas, sem acentos, espaços e símbolos viram hífen, só letras, números e hífen, começando por letra (nome que começa por número recebe o prefixo `item-`; nome sem nenhuma letra é recusado; o id é truncado em 52 caracteres). O id é criado uma única vez e é guardado nos arquivos internos; não depende de nome futuro.
- **Colisões:** se o id já existir (no catálogo, em pasta de `services/` ou nome reservado), o servidor usa o primeiro sufixo livre (`-2`, `-3`...), sem sobrescrever nada. Nome repetido continua recusado com 409.
- **O cliente não envia id:** qualquer campo `id` no corpo de assunto ou serviço é recusado com 422 como campo extra. (O cadastro de fontes mantém o campo "Identificador".)
- **Tela:** os formulários de assunto e serviço não têm mais o campo "Identificador". O catálogo e o painel de confirmação não mostram ids nem ids de versão (como `lac-v1`), e os caminhos, o JSON e os hashes nunca aparecem. Situações: rascunho = "Rascunho"; em_validacao = "Em análise"; ajustes_solicitados = "Precisa de ajustes"; validado_materialmente = "Conteúdo validado"; autorizado_publicacao = "Pronto para publicação"; publicado = "Publicado".
- **Estrutura interna preservada:** ids, versões, hashes e caminhos continuam nos arquivos internos e na API de consulta (`GET`). Os registros existentes (assunto e serviço da LAC) não foram alterados, e todo serviço novo continua como versão 1, rascunho e não publicado.

### Cadastro de fontes por serviço (Passo 7E3A)

- **Revisão otimista:** `GET /__admin/servicos/<id>/versao-atual` passou a devolver `revisaoFontes`, o SHA-256 do conteúdo das fontes da versão atual (sem caminhos internos). O `POST` exige essa revisão no campo `revisao`; se ela não for a atual, a resposta é 409 (`revisao_divergente`) e nenhum arquivo muda. Assim, uma segunda pessoa (ou aba) nunca sobrescreve a gravação da primeira.
- **Quando é aceito:** só para serviço cadastrado e com a versão atual em `rascunho` (qualquer outro estado devolve 409, `versao_nao_editavel`). Exige token, origem local, `Content-Type: application/json` e corpo de até 32 KB, e reaproveita a trava de escrita (409 se houver outra gravação em andamento).
- **Campos recebidos:** `id`, `titulo`, `tipo` (`legislacao`, `pagina_oficial`, `manual`, `formulario`, `sistema`, `canal_atendimento` ou `outro`), `orgaoResponsavel`, `url`, `descricao`, `origemOficial` (booleano) e, opcionais, `dataPublicacao` (AAAA-MM-DD) e `dispositivoRelevante`. Qualquer outro campo (status, publicação, vigência, data de consulta) é recusado com 422.
- **Definido pelo servidor:** `statusValidacao: rascunho`, `publicado: false`, `dataConsulta` (a data do servidor), `vigencia` (legislação: `a_confirmar`; demais tipos: `nao_se_aplica`), `normasRelacionadas: []` e `observacao: null`. **A fonte nunca nasce validada nem publicada.** Origem oficial identifica a procedência; não significa que o conteúdo foi validado.
- **Regras:** a URL deve ser `https`, sem usuário e senha nem parâmetro de credencial (como `token` ou `senha`), e não pode repetir a de outra fonte (comparação normalizada, a mesma do validador da base); o `id` também não pode se repetir. Título, órgão e descrição são obrigatórios. E-mail e telefone são recusados. As fontes existentes não são alteradas.
- **Gravação:** a mesma transação do cadastro (ensaio em cópia temporária, escrita atômica, conferência pelo validador e desfazer integral em caso de falha). Atenção: ao gravar, o arquivo de fontes é reescrito no formato determinístico (chaves em ordem alfabética), então o primeiro cadastro real numa base com arquivo formatado à mão gera um diff de formatação.
- **Tela:** a seção "Fontes do serviço" permite escolher um serviço, ver as fontes (título, tipo, órgão, situação de validação e "não publicada") e cadastrar uma nova, com resumo e confirmação antes de gravar. Depois do sucesso, a versão e a lista são recarregadas. Sem edição, exclusão, validação ou publicação de fontes.
- **Atenção em testes manuais:** confirmar o cadastro de uma fonte altera o arquivo de fontes real do serviço escolhido. Para desfazer, restaure esse arquivo com o Git.

## Saúde do sistema (Passo 8B)

- **Endpoint:** `GET /__admin/saude`, só no `npm run dev`. Reutiliza o token, o `Host` e a origem do endpoint administrativo; aceita só `GET`, sem query nem corpo; responde com `Cache-Control: no-store` e erros genéricos.
- **Capacidade e estado são coisas diferentes.** Capacidade: `implementado`, `nao_implementado` ou `nao_se_aplica`. Estado: `operacional`, `degradado`, `indisponivel` ou `nao_verificado`.
- **Resultado:** para cada componente, `componente`, `capacidade`, `estado`, `verificadoEm` (horário ISO) e uma mensagem pública curta, de uma lista fixa. Nunca traz caminhos, erros internos, pilhas de execução, tokens, dados ou conteúdo da base.
- **Verificações reais:**
  - **Aplicação administrativa:** responde e a pasta do projeto está acessível.
  - **Base:** assuntos, serviços e versões atuais válidos e referências consistentes (o mesmo validador da base).
  - **Armazenamento:** teste de gravação e leitura numa pasta temporária **fora dos dados reais**, removida ao final.
  - **Conteúdo publicado:** contagem real de versões publicadas e itens marcados como publicados (hoje, nenhum).
  Uma falha em um componente vira `degradado` ou `indisponivel` naquele componente, sem derrubar os demais nem esconder o problema.
- **Sem fingir funcionamento:** processamento de fontes, banco de dados e IA externa aparecem como `nao_implementado` e `nao_verificado`. O MCP não faz parte da saúde operacional: será documentado como ferramenta de desenvolvimento. O resumo conta Operacionais, Degradados, Indisponíveis e Não verificados só entre os componentes implementados e traz a contagem separada "Não implementados" (hoje 6 operacionais e 3 não implementados); "Não implementado" não é falha, e os cartões dizem isso. A contagem de `nao_se_aplica` só aparece se existir componente assim.
- **Páginas separadas:** a saúde fica em `/admin/saude/` (`/admin/saude` redireciona), e a tela de cadastro, em `/admin/`, não tem mais essa seção. O cabeçalho das duas páginas tem a navegação "Gestão de conteúdo" e "Saúde do sistema", com a página atual destacada.
- **Página de saúde:** resumo por estado, lista dos componentes (capacidade, estado, mensagem e hora), horário da última verificação, botão "Verificar novamente" e link para voltar à Gestão de conteúdo. Data e hora em DD-MM-AAAA HH:mm:ss (horário local); o horário ISO fica só na API. Usa o mesmo token em memória, `textContent` e nenhum armazenamento do navegador.
- **Limites:** a verificação é sob demanda e local; não mede serviços externos nem desempenho. O endpoint e a página não existem no build nem no preview.

## Testes de ponta a ponta (Passo 8C)

`npm run test:e2e` (Playwright, só Chromium, em `e2e/`) abre o servidor local na porta 5173 e confere o chat público, `/admin/` e `/admin/saude/` no navegador. Os testes são somente leitura: bloqueiam qualquer requisição que não seja GET e qualquer rede externa, e não gravam serviços, assuntos nem fontes. Na saúde conferem a contagem separada de "Não implementados" (que não são falhas), a ausência de MCP, caminhos, tokens e erros internos, o botão "Verificar novamente" sem componentes duplicados, 390 px sem rolagem horizontal e o foco visível por Tab. Não substituem a conferência manual em `docs/TESTES_MANUAIS.md`.

## Armazenamento local

- A **raiz** é informada de forma explícita por quem usa o módulo; o módulo não escolhe pasta sozinho.
- Operações: ler JSON, gravar JSON de forma atômica, acrescentar registro a um histórico JSONL e listar o histórico. **Não há edição nem exclusão de histórico.**
- Formato determinístico: UTF-8, chaves em ordem alfabética, quebra de linha final (JSON com 2 espaços; JSONL com uma linha compacta por registro).
- Antes de gravar, os dados passam por uma função de validação recebida do chamador. Sem essa função, nada é gravado.
- Proteções: recusa caminho absoluto, `..`, byte nulo, barra invertida, `:`, nomes ocultos, saída da raiz, links simbólicos (arquivo ou pasta) e extensões diferentes de `.json` e `.jsonl`. O histórico recusa id repetido e só aceita acréscimos, mantendo o conteúdo anterior byte a byte.
- Escrita atômica: arquivo temporário no mesmo diretório, renomeação somente após a gravação completa e a validação, remoção do temporário em caso de erro e preservação do arquivo anterior se algo falhar.
- Limites: arquivos de até 5 MB. As mensagens de erro são códigos genéricos, sem caminhos nem conteúdo.
- O armazenamento **não usa `localStorage`**, rede, variáveis de ambiente, relógio nem dependências externas.
- Uma verificação de links simbólicos antes da escrita não elimina todas as condições de corrida entre processos. Isso é aceitável para uso local por uma pessoa e **não** serve para ambiente compartilhado.

## Onde ficam os dados

- `data/admin-private/` é o local previsto para dados do módulo e está no `.gitignore`. **Nada ali é criado nem versionado neste passo.**
- Decisões com **identificação pessoal** (nome ou cargo de quem decidiu) **ficam fora do Git**.
- O que for versionado deve ser somente conteúdo já público, sem nomes de pessoas.

## Limites desta fase

- **Não há autenticação.** Quem tem acesso à máquina e ao servidor de desenvolvimento pode usar o módulo.
- O campo "responsável" é um texto digitado. **O armazenamento local não comprova identidade**: uma decisão registrada aqui é um registro de trabalho, não prova de quem decidiu.
- O módulo funciona somente em desenvolvimento local e **não pode ser incluído no build público**.
- **A publicação institucional exigirá autenticação e persistência apropriada** (controle de acesso, trilha de auditoria e armazenamento protegido), a serem definidos e aprovados antes de qualquer uso fora do ambiente local.
- Validação material é decisão humana da unidade competente. O módulo apenas registra; não decide.

## Informações do chatbot — blocos de conhecimento (Sprint 3)

Página `http://localhost:5173/admin/conteudo/`, só no `npm run dev`. O link "Cadastro da base" da navegação leva à gestão de conteúdo (`/admin/`, Sprint 4) e mantém o nome antigo, a renomear em melhoria futura.

- **O que é:** uma informação em linguagem simples, sustentada por uma ou mais fontes já cadastradas, com a indicação de onde ela aparece em cada fonte e avisos opcionais. É gravada como bloco do tipo `conhecimento` no arquivo de conteúdo do assistente da versão atual do serviço (fonte única de verdade, sem arquivo novo).
- **Nascimento:** em elaboração (rascunho), não publicada, revisão pendente. Ela **não chega ao chat público nem ao assistente** enquanto não for validada, autorizada e publicada pelo fluxo existente.
- **Rotas (exigem token, origem local e corpo JSON de até 32 KB):**
  - `POST /__admin/servicos/<id>/conhecimentos` cria (201);
  - `PATCH /__admin/servicos/<id>/conhecimentos/<blocoId>` altera título, texto, fontes, referências e avisos (200);
  - `DELETE /__admin/servicos/<id>/conhecimentos/<blocoId>` exclui (204).
- **Campos aceitos do cliente:** somente `titulo`, `texto`, `fonteIds`, `referencias` e `alertas`. Id, datas, estado, revisão, ambiente, publicação e campos extras são recusados (422). O id e as datas são gerados pelo servidor e o id nunca aparece na tela.
- **Quando é aceito:** só com a versão atual em rascunho (409 `versao_nao_editavel`); alterar e excluir só em bloco de conhecimento em rascunho, não publicado e com revisão pendente. Os blocos `teste_local` existentes nunca são alterados nem excluídos. As fontes são lidas só da versão atual, e cada fonte escolhida exige a indicação de onde a informação aparece nela.
- **Gravação:** só o arquivo de conteúdo do assistente; base validada antes e depois, ensaio em cópia temporária, escrita atômica e desfazer integral; uma gravação por vez (409 para a concorrente). Registro, manifesto, fontes, documentos e perguntas não são alterados. Ao gravar, o arquivo é reescrito no formato determinístico (chaves em ordem alfabética), o que gera diff de formatação no Git.
- **Títulos repetidos:** permitidos (decisão revista); a duplicidade por conteúdo não é detectada.
- **Tela:** escolha de assunto e serviço, situação do serviço, lista e formulário (duas colunas em tela larga), confirmação antes de salvar e de excluir, ações desabilitadas fora de rascunho, datas em DD-MM-AAAA, mensagens curtas e foco levado à mensagem. Ícones SVG, sem biblioteca; sem `innerHTML`, `localStorage`, `sessionStorage` ou cookies.
- **Limitações:** sem criação automática de nova versão (a edição fica bloqueada quando a versão está congelada), sem IA, sem busca semântica, sem upload e sem publicação. Revisão otimista no PATCH e no DELETE e proteção contra alterações externas entre ensaio e gravação ficam como melhorias futuras.
- **Atenção em testes manuais:** salvar ou excluir grava no arquivo real da LAC. Use dado fictício e restaure o arquivo pelo Git depois (a conferência de 13/11/2026 está em `docs/TESTES_MANUAIS.md`, MC-01 a MC-09).

## Gestão simples por serviço (Sprint 4, Passo 4B2)

A experiência principal de `/admin/` (só no `npm run dev`) é orientada por serviço: **entrada de demonstração** (não é autenticação real; o token vive só em memória, e recarregar ou sair exige nova entrada), pesquisar ou criar serviço (nome e um único campo "Tema") e **Adicionar informação** (texto, link novo ou "Usar link já cadastrado"), com a lista das informações em elaboração do serviço. Nada é publicado e nada fica disponível ao chat.

| Rota (exigem token) | O que faz |
|---|---|
| `POST /__admin/servico-com-tema` | Serviço novo e, se preciso, tema novo, numa única transação. Corpo: `nome` e `tema` (`{ id }` ou `{ nome }`). Tema digitado que já existe é reutilizado. Ids gerados pelo servidor. |
| `GET /__admin/servicos/<id>/informacoes` | Informações em elaboração do serviço (texto com prévia, links), sem hash, caminho nem ids de entrada. |
| `POST /__admin/servicos/<id>/entradas-texto` | Grava texto pelo contrato de `entradas.json` (4B1). Corpo: `titulo`, `texto` e opcionais `descricao`, `orgaoResponsavel`. |
| `POST /__admin/servicos/<id>/links` | Link novo (fonte). O servidor gera id e revisão; o cliente nunca os envia. |
| `POST /__admin/servicos/<id>/links-existentes/busca` | Pesquisa somente leitura de links elegíveis de **outros** serviços. |
| `POST /__admin/servicos/<id>/links-existentes` | Copia um link já cadastrado. O cliente envia só `servicoId` e `fonteId`; o servidor relê a fonte do disco. A cópia nasce em rascunho, com `reutilizadaDe`, e exige nova revisão. |

- **Trava:** todas as gravações novas usam a mesma trava das demais (uma por vez; a segunda recebe 409 `operacao_em_andamento`). A busca não grava e não usa a trava.
- **Credenciais:** a recusa só vale para atribuições explícitas (`senha:`, `token=`, `api_key`, `client_secret`...), `Bearer` com sequência de token e `senha` seguida de valor com dígito, e é aplicada a título, descrição e texto. Frases como "A senha deve ser trocada" são aceitas. Limitação conhecida: "senha: ..." escrito como explicação em frase corrida também é recusado; a interface avisa o motivo.
- **Fora do escopo:** edição, exclusão, revisão, publicação, links seguros e agente (Sprints 5 a 6).

### Revisão da versão (Sprint 5, Passo 5B1; só rotas, sem interface ainda)

| Rota (exigem token) | O que faz |
|---|---|
| `GET /__admin/servicos/<id>/revisao` | Situação da revisão da versão atual: estado, fontes e blocos de conhecimento revisáveis, pendências e a `revisao` (hash canônico) a devolver nas ações. |
| `POST /__admin/servicos/<id>/revisao/fontes` | Marca uma fonte como revisada (corpo: `fonteId`, `revisao`). Não publica nem acessa o link. |
| `POST /__admin/servicos/<id>/revisao/blocos/aceitar` | Aceita um bloco de conhecimento (corpo: `blocoId`, `revisao`). |
| `POST /__admin/servicos/<id>/revisao/blocos/rejeitar` | Remove um bloco de conhecimento em rascunho (corpo: `blocoId`, `revisao`). |
| `POST /__admin/servicos/<id>/revisao/blocos/reabrir` | Reabre para correção um bloco aceito, só antes de enviar para revisão (corpo: `blocoId`, `revisao`). |
| `POST /__admin/servicos/<id>/revisao/enviar` | Sprint 8, Passo 8D (Cadastrante): envia para revisão; congela a versão (hash e `enviadaEm`) e leva a "Em análise" (`em_validacao`); não grava decisão (corpo: `revisao`). |
| `POST /__admin/servicos/<id>/revisao/validar` | Passo 8D (Revisor): valida materialmente a versão enviada e leva a "Pronto para publicar"; grava a decisão material (corpo: `revisao`). Não autoriza nem publica. |
| `POST /__admin/servicos/<id>/revisao/ajustes` | Passo 8D (Revisor): pede ajustes (corpo: `revisao`, `motivo`) e leva a "Ajustes solicitados"; a correção é feita numa nova versão. O motivo fica só na decisão privada. |
| `POST /__admin/servicos/<id>/revisao/concluir` | Removida no Passo 8D: responde 404 genérico. |
| `POST /__admin/servicos/<id>/nova-versao` | Cria a nova versão a partir da atual congelada (corpo `{}`). A versão publicada anterior fica intacta. |

O ator registrado no histórico privado é o usuário real da sessão (Maria Silva ou Carlos Silva, fictícios, desde o Sprint 8, Passo 8C; antes, o "Servidor de demonstração"), e não comprova identidade nem validação jurídica. Todas as gravações passam pela trava comum.

### Edição e exclusão de fontes (Sprint 5, Passo 5B3a)

| Rota (exigem token) | O que faz |
|---|---|
| `GET /__admin/servicos/<id>/fontes/<fonteId>` | Campos editáveis da fonte (o texto original só sai aqui, para a edição). |
| `PATCH /__admin/servicos/<id>/fontes/<fonteId>` | Edita link ou texto (corpo: `revisao` e só os campos do tipo). Reinicia a revisão da fonte e reabre as informações aceitas que a usam. |
| `DELETE /__admin/servicos/<id>/fontes/<fonteId>` | Exclusão lógica (cabeçalho `X-Revisao`). Não é bloqueada por referências: retira da versão atual as referências à fonte. |

Só na versão atual em elaboração; versão congelada exige nova versão. A fonte excluída continua no arquivo (histórico preservado), mas não aparece mais: não há "Itens excluídos", lixeira nem restauração. Antes de confirmar, o diálogo explica o impacto em linguagem comum; a exclusão retira as referências da versão atual (campos sem fonte voltam a `PENDENTE`; documentos e perguntas que a citavam saem; informações sem outra fonte válida saem do conteúdo ativo; informações aceitas e alteradas voltam a "Em elaboração"), tudo em transação única com rollback. A nova versão não copia a fonte excluída nem as referências. O histórico privado guarda só metadados. Aviso: "A exclusão será aplicada ao chatbot após a publicação desta versão." O painel e "Conteúdo para respostas" têm "Resolver pendências". O contato institucional de `services/admin/contatos-permitidos.js` é permitido.

### Temas e serviços (Sprint 5, Passo 5B3b)

`GET` e `PATCH` em `/__admin/temas/<id>/edicao` (nome do tema, com impacto e confirmação; id imutável; nome duplicado recusado; histórico em `data/admin-private/temas`, só metadados) e em `/__admin/servicos/<id>/edicao` (nome e tema do serviço na versão em elaboração; reabre informações aceitas; versão congelada exige "Criar nova versão para editar").

### Importar conteúdo existente (Sprint 5, Passo 5B3c)

`GET` e `POST` em `/__admin/servicos/<id>/importacao`: lista candidatos do conteúdo antigo e importa um item por vez como informação em elaboração com fonte ativa. Nunca aceita, revisa nem publica; o conteúdo antigo fica intacto e a LAC real não foi convertida.

### Enviar, validar, autorizar e publicar (Sprint 5, Passo 5C; Sprint 8, Passo 8D)

| Rota (exigem token) | O que faz |
|---|---|
| `POST .../revisao/enviar` e `POST .../revisao/validar` | Enviam para revisão (Cadastrante) e validam materialmente (Revisor); substituem o antigo `.../revisao/concluir` (removido no 8D). |
| `POST /__admin/servicos/<id>/autorizacao` | Registra a autorização da publicação. |
| `GET /__admin/servicos/<id>/publicacao/resumo` | Resumo do que será publicado. |
| `POST /__admin/servicos/<id>/publicacao` | Publica em transação única com rollback. |
| `POST /__admin/servicos/<id>/revogacao` | Revoga a versão publicada (Sprint 7): corpo `{ revisao, motivo }`, motivo obrigatório; transação única com rollback. |

As três ações são separadas. A publicação grava `services/<serviço>/publico/conteudo-<hash16>.json` (imutável), `publicadoEm` no manifesto e `versaoPublicadaId` no registro. O chatbot e o build usam só o conteúdo publicado; `check-dist` é estrito.

**Revogar a publicação (Sprint 7, Passo 7B).** Em "Conteúdo para respostas", com a versão publicada, o botão "Revogar publicação" abre uma confirmação com o campo de motivo, obrigatório (até 500 caracteres; o servidor recusa os formatos comuns de e-mail, telefone, CPF e credencial; nomes e outros dados pessoais não são detectados automaticamente, então não devem ser incluídos; um número de processo ou protocolo com 10 ou 11 dígitos seguidos é recusado como telefone). Sem motivo, nada é enviado. Ao confirmar, numa única transação: o manifesto passa a "Publicação revogada" (`estado: revogado`, com `revogadoEm`), o registro deixa de apontar para a versão (`publicado: false`, `versaoPublicadaId: null`) e a decisão de revogação, com o motivo, e a ação ficam no histórico privado (`data/admin-private/`). O chatbot deixa de usar o conteúdo: no `npm run dev`, o arquivo deixa de ser servido; no build, deixa de ser emitido, e o `check-dist` recusa o arquivo se ele aparecer no `dist/`. O arquivo em `services/<serviço>/publico/` continua no disco, intacto, como histórico. A versão revogada não volta a ser publicada; para publicar de novo, crie uma nova versão e passe por revisão, autorização e publicação. Desde o Passo 8C, a revogação, como as demais ações, é registrada com o usuário real da sessão (o Revisor, Carlos Silva, fictício; no manifesto, só perfil e setor), sem identidade real; os registros anteriores ao 8C continuam com o ator de demonstração (ver "Quem fica registrado em cada ação", abaixo). Em produção (build estático), a revogação só vale depois de um novo build e de uma nova publicação do site; páginas já abertas mantêm o conteúdo até serem recarregadas.

Nota (Sprint 8, Passo 8E): o teste real do cenário de demonstração (`e2e-real/demonstracao-ponta-a-ponta-real.spec.js`) confere que, depois da revogação, o arquivo de `services/<serviço>/publico/` **continua no disco**, mas não é mais servido (o servidor de desenvolvimento responde 404 a ele) nem indicado pela página do chat.

**Atenção:** desde o Passo 8C, a "autorização" do MVP é feita pelo usuário da sessão com perfil Revisor (Carlos Silva, fictício; antes do 8C, pelo "Servidor de demonstração"), sem identidade real, e **não equivale à validação material pela área competente da SEMA**. Sem autenticação real. A LAC continua em validação e não publicada.

**Quem fica registrado em cada ação (Sprint 7, Passo 7C).** Cada gravação registra um ator `{ usuarioId, perfil, setor }`, conferido contra uma lista fixa de usuários autorizados (`services/admin/atores.js`). Ainda não há login: todas as ações usam o ator de demonstração (perfil `demonstracao`, setor "Ambiente local de demonstração"), e a tela não permite escolher outro. O registro fica em dois lugares:

- **Histórico privado** (`data/admin-private/`, fora do Git): a auditoria completa, com usuário, perfil, setor, ação, resultado (`ok` ou `negado`) e horário.
- **Manifesto da versão** (`versao.json`, que vai para o Git): só o perfil e o setor de quem validou, autorizou, publicou ou revogou, no campo `responsaveis`. Nunca o identificador do usuário, o nome ou o e-mail.

Registros gravados antes deste passo, com o ator como texto, continuam válidos.

**Usuários fictícios do login simulado (Sprint 8, Passo 8A).** A lista de atores aceitos passa a incluir, além do de demonstração, os usuários fictícios Maria Silva (Cadastrante, CLABI) e Carlos Silva (Revisor, CLABI), que não são pessoas reais nem comprovam identidade. Eles ainda não podem ser escolhidos pela tela (a tela de login simulado vem no 8B), e o ator de demonstração continua o padrão de todas as ações até o 8C. A matriz de permissões por perfil (`services/admin/permissoes.js`) já existe, mas ainda não restringe nenhuma rota.

Auditoria final da Sprint 5: aprovada, sem bloqueantes nem importantes.

## Proteção do assistente de código (Sprint 6, Passo 6A)

O Claude Code consulta o hook `scripts/hooks/protecao-claude.js` (configurado em `.claude/settings.json`) antes de cada gravação, edição ou comando do assistente. Ele não vale para as suas ações, para os testes nem para o `npm run dev`.

| Regra | O que bloqueia | Pode ser liberada? |
|---|---|---|
| A1 | Gravar ou editar dados da base: `services/registry.json`, `services/assuntos.json`, as pastas de cada serviço (como `services/lac/`) e `data/`. O código em `services/admin/`, `services/schemas/` e `services/*.js` continua livre. | Sim, por prazo curto |
| A2 | Comandos que apaguem, movam, sobrescrevam ou criem arquivos nesses mesmos caminhos (`git restore` continua livre). | Sim, por prazo curto |
| A3 | `git push` forçado. | Não |
| A4 | `git add` de `data/`, `dist/`, `node_modules/`, `.env`, vídeos `.webm`; `git add -f`, `git add .`, `-A` e `--all`. | Não |
| A5 | Alterar o próprio hook, `.claude/settings.json`, `.claude/settings.local.json` ou o arquivo de liberação. | Não |
| A6 | Só avisa, ao fim de cada resposta, se há mudança não commitada nos dados da base ou se `data/` existe. | Não bloqueia |
| A7 | `git commit --no-verify` ou `-n` e desativar hooks com `core.hooksPath`. | Não |
| A0 | Pedido que o hook não consegue interpretar (JSON inválido, sem ferramenta, caminho ou comando): bloqueado por padrão, com a mensagem "Bloqueado: não foi possível validar esta ação. Tente novamente ou peça liberação." | Não |

### Como liberar A1 e A2 por prazo curto

Quando uma gravação na base for realmente autorizada (por exemplo, na Sprint 11, com a CLABI), crie **você mesma** o arquivo `.claude/liberacao-protecao.json` na pasta do projeto. O Git ignora esse arquivo, e o assistente não consegue criá-lo nem alterá-lo. Modelo para copiar e preencher:

```json
{
  "escopo": ["services/lac/", "services/registry.json"],
  "motivo": "Descreva o que foi autorizado e por quem (por exemplo, a Issue ou o documento da CLABI)",
  "validoAte": "2026-11-19T18:00:00-04:00"
}
```

- **escopo:** só os caminhos de dados que podem ser alterados. Uma pasta termina com `/`. Não vale `services/` inteira nem caminhos de código.
- **motivo:** obrigatório.
- **validoAte:** data e hora no formato acima, com fuso. No máximo **2 horas** depois do momento em que o assistente agir; depois disso, a proteção volta sozinha.
- Se o arquivo estiver incompleto, vencido ou com prazo maior que 2 horas, ele é ignorado e tudo continua bloqueado.
- Ao terminar, apague o arquivo.

**Limites:** a leitura dos comandos é aproximada, e um comando escrito de forma incomum pode escapar. O hook não impede a gravação feita pela administração local no `npm run dev` (o aviso A6 sinaliza) nem as suas próprias ações.

## Proteção dos commits (Sprint 6, Passo 6B)

O pre-commit do Git (`.githooks/pre-commit`, que chama `scripts/hooks/pre-commit.js` e as regras de `scripts/hooks/regras.js`) confere tudo o que está sendo commitado, por qualquer pessoa. Se encontrar um problema, o commit não acontece e a mensagem diz a regra e o arquivo.

### Como ativar (uma vez em cada cópia do repositório)

1. Abra o terminal na pasta do projeto.
2. Rode `npm run hooks:instalar` (equivale a `git config core.hooksPath .githooks`).
3. Para conferir, rode `git config core.hooksPath`: a resposta deve ser `.githooks`.

Sem esse passo, o Git não usa o hook nesta cópia. Mesmo assim, a verificação no GitHub (Passo 6D, `.github/workflows/protecao-pr.yml`) repete as regras em toda PR: se alguma for violada, a verificação "Proteção da PR" falha e indica o arquivo, sem mostrar o valor encontrado.

### O que é barrado

| Regra | O que barra |
|---|---|
| B1 | Arquivo novo ou alterado em `services/<serviço>/publico/` sem publicação autorizada registrada. **Remoção** de arquivo público (Sprint 7, Passo 7D): só é aceita quando a versão correspondente (mesmo hash) está revogada; fora disso, é barrada. |
| B2 | No `services/registry.json`: `publicado` passando a `true`, `versaoPublicadaId` preenchido ou `statusValidacao` passando a `"validado"`. Nos `versao.json`: `estado` passando a `validado_materialmente`, `autorizado_publicacao` ou `publicado`, ou `publicadoEm` preenchido. Só conta a **mudança** em relação ao último commit. **Revogação** (Sprint 7, Passo 7D): não exige autorização registrada, mas precisa ser coerente: só se revoga versão publicada; a revogada tem `publicadoEm` e `revogadoEm` válidos, com `revogadoEm` não anterior a `publicadoEm`; o registro não pode apontar para versão revogada; `revogadoEm` não aparece em outro estado. Uma versão revogada **nunca** volta a publicada, nem com autorização registrada: é preciso criar uma nova versão. |
| B3 | `data/`, `dist/`, `node_modules/`, `test-results/`, `playwright-report/`, `.env*`, vídeos `.webm`, `.claude/settings.local.json`, `.claude/launch.json` e `.claude/liberacao-protecao.json`. |
| B4 | Nas linhas adicionadas: chaves e tokens com formato conhecido, chave privada e credencial atribuída a um texto (em qualquer arquivo); e-mail fora dos domínios permitidos, CPF e telefone (fora das pastas de testes `tests/`, `e2e/`, `e2e-real/` e `e2e-demo/`). A mensagem mostra o arquivo, a linha e o tipo, nunca o valor. |
| B5 | Se o commit mexe no que entra no build (`src/`, `admin/`, `index.html`, `vite.config.js`, `package.json`, `services/*.js`, `scripts/check-dist.js` ou conteúdo público), roda `npm run build` e `node scripts/check-dist.js`; se algum falhar, barra. |
| B0 | Se algo não puder ser lido ou interpretado (por exemplo, um JSON inválido no arquivo de autorizações), o commit é barrado por padrão. |

**Domínios de e-mail permitidos** (lista em `scripts/hooks/regras.js`):

- `sema.mt.gov.br`: domínio institucional;
- `orgaoexemplo.gov.br`: domínio **fictício** dos usuários de demonstração Maria Silva e Carlos Silva;
- `example.com`, `example.org` e `example.net`: domínios reservados para documentação.

Qualquer outro domínio é barrado. Para incluir um domínio, altere a lista e este documento no mesmo PR, com revisão.

### Como registrar uma publicação autorizada (B1 e B2)

Quando uma publicação for realmente autorizada (por exemplo, na Sprint 11, com a confirmação da CLABI), acrescente uma entrada em `.githooks/publicacoes-autorizadas.json`, no mesmo commit da publicação. O arquivo é versionado e passa por revisão no PR. Ele começa assim:

```json
{
  "publicacoes": []
}
```

Modelo de entrada para copiar e preencher:

```json
{
  "publicacoes": [
    {
      "servicoId": "lac",
      "versaoId": "lac-v1",
      "hashConteudo": "<os 64 caracteres do hashConteudo do versao.json>",
      "arquivoPublico": "conteudo-<os 16 primeiros caracteres do hash>.json",
      "referencia": "Issue #<número> ou documento da CLABI que autorizou",
      "data": "AAAA-MM-DD"
    }
  ]
}
```

- Todos os campos são obrigatórios, e nenhum outro é aceito. Não registre nome de pessoa.
- `arquivoPublico` precisa ser exatamente `conteudo-` mais os 16 primeiros caracteres do `hashConteudo`, mais `.json`.
- A entrada só libera aquele serviço, aquela versão e aquele hash: qualquer outra publicação continua barrada.
- A entrada registra uma decisão revisada no PR; ela **não prova** a validação material, que continua sendo da CLABI.

**Limites:** `git commit --no-verify` pula o hook local (o assistente é impedido pela regra A7, e a verificação no GitHub repete as regras em toda PR). A verificação no GitHub só impede o merge se a regra de proteção do branch `main` exigir que ela passe; isso é uma configuração do repositório no GitHub, feita pela pessoa responsável. O build da regra B5 usa os arquivos da pasta de trabalho, não só o que está sendo commitado. Linhas de teste com valores parecidos com credenciais precisam ser montadas de outra forma (por exemplo, por concatenação).

## Login simulado (Sprint 8, Passo 8B)

Escolha entre os usuários fictícios Maria Silva (Cadastrante, CLABI) e Carlos Silva (Revisor, CLABI), **sem senha**. Não é autenticação: escolher um usuário não comprova identidade, e quem usa o computador pode escolher qualquer um.

**Módulo `services/admin/sessao.js`** (puro, sem HTTP, no mesmo estilo de `atores.js` e `permissoes.js`): `criarGerenciadorSessao({ gerarToken })` devolve `atual()`, `token()`, `entrar(usuarioId)`, `sair(token)` e `tokenValido(token)`.

- **Uma sessão atual única**, só em memória do servidor de desenvolvimento: `{ token, usuarioId, ator }` ou nenhuma. A sessão não guarda o nome; `atual()` busca o nome em `USUARIOS_SELECIONAVEIS`.
- **Entrar** aceita só usuários selecionáveis (via `atorDoUsuario`): recusa o ator de demonstração, ids desconhecidos e valores que não sejam texto, sem mudar a sessão atual. Cada entrada gera um **token novo**, mesmo para o mesmo usuário; o anterior deixa de valer. Token do gerador fora de 64 hex → falha `indisponivel`, sem criar sessão.
- **Sair** só com o token atual; com outro token, falha e a sessão continua.
- **Conferência do token:** SHA-256 dos dois lados e `timingSafeEqual` (a lógica saiu de `admin-endpoint.js`).
- Falhas no formato `{ ok: false, erro }`, sem repetir o valor recebido.

**Contrato HTTP** (`admin-endpoint.js` só chama o módulo):

| Pedido | Resposta |
|---|---|
| `GET /__admin/sessao` | 200 `{ usuario, usuarios }` sem sessão; `{ usuario, usuarios, token }` com sessão. Não cria token. |
| `POST /__admin/sessao` | Só `Content-Type: application/json` (senão 415), corpo de até 1 KB (senão 413), exatamente `{ "usuarioId": "<texto>" }`. Campos extras, tipo errado, usuário desconhecido ou de demonstração → 422 `{ erro: 'dados_invalidos', campos: ['usuarioId'] }`, sem eco e sem mudar a sessão. JSON ilegível → 400. Sucesso → 200 `{ token, usuario }`. Não exige token. |
| `DELETE /__admin/sessao` | Exige o token atual: 204. Sem token ou com token errado → 401 `nao_autorizado`, e a sessão continua. |
| Outros métodos | 405 com `Allow: GET, POST, DELETE`. GET ou DELETE com corpo e qualquer query → 400. Origem não local → 403, antes de tudo. |

Nada de corpo, token, nome ou `usuarioId` vai para log. Todas as outras rotas conferem o token pelo módulo.

**Ciclo da sessão:** abrir `/admin/` lê a sessão (GET). Sem usuário, aparece a escolha ("Escolha com qual usuário entrar", com o aviso "Usuários fictícios de demonstração, sem senha."); "Acessar administração" sem escolha mostra o erro e leva o foco ao grupo. Com usuário, a página entra direto, e o topo mostra "Nome — Perfil" com os botões "Trocar usuário" (reabre a escolha; "Cancelar" volta sem mudar) e "Sair" (envia DELETE e só depois esquece o token). Recarregar mantém a sessão. "Conteúdo para respostas" e "Saúde do sistema" mostram o nome no topo e "Trocar usuário" como link para a gestão; sem usuário, orientam "Escolha o usuário na Gestão de conteúdo.". Como a sessão é única no servidor, entrar com outro usuário em outra aba invalida o token da primeira: na próxima chamada (401), a primeira aba mostra "O usuário da sessão mudou. Atualize a página." e volta ao estado de entrada. Reiniciar o servidor encerra a sessão.

**Efeito colateral do 8B (encerrado no 8C):** no 8B, o topo mostrava quem entrou, mas os registros continuavam com o ator de demonstração. Desde o 8C, o ator real da sessão é gravado (veja a seção seguinte).

## Permissões aplicadas nas gravações (Sprint 8, Passo 8C)

O perfil da sessão passa a decidir o que pode ser gravado, pela matriz de `services/admin/permissoes.js` (sem mudanças nela): **Cadastrante** (Maria Silva, fictícia) cadastra, edita, revisa fontes, aceita, rejeita e reabre informações, importa e cria nova versão; **Revisor** (Carlos Silva, fictício) conclui a revisão, autoriza, publica e revoga. Continua não sendo autenticação: qualquer pessoa no computador pode escolher qualquer usuário.

- **Ator fixado por pedido:** cada pedido confere o token uma única vez (`sessao.atorDoToken`, em tempo constante) e guarda o ator até o fim. Se a sessão trocar enquanto o corpo é lido ou enquanto o pedido espera a trava, quem grava continua sendo quem fez o pedido.
- **Permissão antes do corpo:** `services/admin/acoes-das-rotas.js` (puro) diz quais ações cada uma das 27 rotas que gravam exige (25 no 8C; no 8D, enviar, validar e ajustes substituíram concluir); a sessão (`POST`/`DELETE /__admin/sessao`), a busca de links e as leituras não exigem nenhuma. Logo depois do token e da conferência do serviço (404), e antes de ler o corpo e de entrar na trava, o endpoint confere cada ação na matriz. Fora do perfil: **403 `{ "erro": "perfil_sem_permissao" }`**, com `Connection: close`, sem ler o corpo (um corpo grande demais também recebe 403, não 413).
- **Serviço inexistente:** nas rotas com serviço no caminho, um serviço que não está no registro recebe 404 `nao_encontrado` **antes** da conferência de perfil, e nenhuma negação é registrada. Isso só revela, localmente e para quem já tem o token, se o serviço existe.
- **Fim do pseudônimo (8D):** "Concluir revisão" deixou de existir. O envio para revisão (`enviar_para_revisao`, Cadastrante), a validação material (`validar_materialmente`, Revisor) e o pedido de ajustes (`solicitar_ajustes`, Revisor) têm rotas próprias; toda ação da matriz tem rota (`acoesSemRota()` vazio). Ver a seção "Envio, validação e ajustes (Sprint 8, Passo 8D)".
- **Segunda barreira:** cada serviço que grava exige o ator e confere de novo o perfil (`resolverAtorDeGravacao` em `atores.js`): sem ator → `ator_ausente`; ator que não seja um usuário selecionável (inclusive o de demonstração) → `ator_invalido`; perfil sem a ação → `perfil_sem_permissao`. Não existe mais ator padrão (`ATOR_PADRAO` foi removido); o ator de demonstração vale só na leitura de registros antigos.
- **Decisões:** na gravação nova (`validarRegistro(r, { nova: true })`), decisão material, autorização e revogação recusam ator com perfil Cadastrante; a leitura do histórico continua aceitando os registros antigos.
- **Manifesto:** `validarResponsavelPublico(r, etapa)` aceita em validação, autorização, publicação e revogação só o perfil Revisor (CLABI) ou, nos manifestos antigos, o de demonstração; Cadastrante é recusado. O manifesto continua só com perfil e setor.

### Envio, validação e ajustes (Sprint 8, Passo 8D)

- **Enviar para revisão** (`enviarParaRevisao`, Cadastrante): só a versão atual em rascunho, sem pendências e com a `revisao` igual ao hash em disco; congela a versão (`hashConteudo` e `enviadaEm`), leva a `em_validacao` ("Em análise"), grava `responsaveis.envio` = { perfil, setor } e a ação `enviar_para_revisao` no histórico. Não grava decisão. Fora de rascunho: 409 `versao_congelada`.
- **Validar materialmente** (`validarMaterialmente`, Revisor): só em `em_validacao`, com a `revisao` igual ao hash em disco e ao `hashConteudo` do manifesto e sem pendências; grava a decisão material (id `decisao-<versão>-<hash16>`), `responsaveis.validacao` e a ação `validar_materialmente`; leva a "Pronto para publicar".
- **Solicitar ajustes** (`solicitarAjustes`, Revisor): só em `em_validacao`, com `{ revisao, motivo }`; o motivo segue a regra do motivo da revogação (obrigatório, até 500 caracteres, sem e-mail, telefone, CPF nem credencial; senão 422 `motivo_invalido`). Leva a `ajustes_solicitados` (sem saída: a Cadastrante cria nova versão), grava `responsaveis.ajustes` e a ação `solicitar_ajustes`. **O motivo fica só na decisão privada** (`observacao` em `data/admin-private/decisoes/`), nunca no manifesto, no histórico de ações, em resposta de gravação nem em log. A única leitura que o devolve é `GET .../revisao` (local, com token), em `motivoAjustes`, e só quando a versão está em ajustes solicitados; a página "Conteúdo para respostas" o mostra com `textContent`.
- **Respostas:** 200 `{ revisao, estado }`; 403 `perfil_sem_permissao` antes de ler o corpo; 409 `revisao_divergente`, `versao_congelada`, `estado_invalido` (validar ou ajustes fora de `em_validacao`) e `operacao_em_andamento`; 422 `dados_invalidos`, `revisao_incompleta`, `hash_divergente`, `base_invalida`, `motivo_invalido` e `decisao_recusada`; 500 genérico. Decisão órfã de tentativa desfeita só é reaproveitada se for do mesmo tipo e do mesmo ator; de outro tipo, `historico_invalido` (500 genérico). **Limitação conhecida (pedido de ajustes):** se a primeira tentativa foi desfeita depois de gravar a decisão (falha na ação do histórico), a nova tentativa a reaproveita mesmo com outro motivo; fica o motivo da primeira tentativa, que é o que a consulta e a tela mostram (coberto em `tests/fluxo-revisao.test.js`, FR8).
- **Manifesto:** `responsaveis.envio` (só Cadastrante, a única etapa desse perfil, a partir de `em_validacao`) e `responsaveis.ajustes` (só Revisor, só em `ajustes_solicitados`).
- **Tela:** o cartão passa a "Revisão e validação", com "Enviar para revisão" (Cadastrante), "Validar materialmente" e "Solicitar ajustes" (Revisor), no bloqueio `aria-disabled` do 8C. Em análise não há "Criar nova versão"; com ajustes solicitados, aparecem o motivo e "Criar nova versão para editar". A validação pede confirmação com o aviso de que esta validação local não equivale à validação material da CLABI.
- `concluir_revisao` só é aceito na LEITURA de registros antigos do histórico (`ACOES_SO_LEITURA`); nenhuma gravação nova pode usá-lo.
- Comportamento coerente (não é falha): uma versão "Em análise" (`em_validacao`) ou com ajustes solicitados (`ajustes_solicitados`) pode ir ao Git sem que o hook de commit a barre, porque nesses estados não há validação nem publicação; `validado_materialmente` continua protegido pelo hook (regra B2), que não foi alterado.
- Os roteiros de vídeo de `e2e-demo/` (fora do Git) ainda clicam em "Concluir revisão" e quebram com esta mudança; a atualização fica para um passo próprio.

**Registros em `data/admin-private/`** (fora do Git; acréscimo com escrita atômica; só metadados, nunca nome, título por extenso, URL, texto ou corpo; o `itemId` é o id do item, que o servidor pode derivar do título e que também está na base versionada; ver o `BACKLOG.md`):

| Arquivo | Tipo | Campos | Quando |
|---|---|---|---|
| `negadas/historico.jsonl` | `acao_negada` | `id`, `tipo`, `acao`, `dataHora`, `resultado: "negado"`, `motivo: "perfil_sem_permissao"`, `ator { usuarioId, perfil, setor }`, `servicoId` (ou `null`) | toda recusa por perfil numa rota; se o registro falhar, a resposta continua 403 e nada é gravado em `services/` |
| `cadastros/historico.jsonl` | `acao_cadastro` | `id`, `tipo`, `acao` (`cadastrar_tema` ou `cadastrar_servico`), `dataHora`, `resultado: "ok"`, `ator`, `itemId`, `itemTipo` (`tema` ou `servico`) | só na gravação real bem-sucedida (dentro da conferência final), nunca no ensaio |
| `revisao/<serviço>.jsonl` | `acao_revisao` | os de antes, agora também para `cadastrar_fonte`, `cadastrar_link`, `cadastrar_texto`, `cadastrar_informacao`, `editar_informacao` e `excluir_informacao` (nesses cadastros com versão, `hashConteudo` é gravado como `null`, formato já aceito pelo validador do histórico; as ações em rascunho feitas por `gravar` guardam o hash da versão depois da mudança, e o alinhamento está no `BACKLOG.md`) | dentro da conferência final; se o registro falhar, a gravação é desfeita (500 `historico_indisponivel`) |

Histórico, decisões e temas registram o ator real (usuarioId, perfil e setor, nunca o nome).

**Limitação conhecida:** os registros de auditoria (`acao_cadastro` e `acao_revisao`) são acrescentados dentro da conferência final da transação, depois do validador da base. Se a gravação falhar depois desse ponto (por exemplo, na conferência de outro registro ou num desfazer), o registro já acrescentado pode sobrar sem a gravação correspondente — o mesmo padrão já existente nas ações de revisão. No cadastro guiado, que grava vários registros em sequência, a falha no segundo pode deixar o primeiro órfão.

**Rota de entradas de texto:** só códigos públicos do gravador vão ao navegador; erros do ator (`ator_ausente`, `ator_invalido`) e qualquer código interno viram 500 `indisponivel` (como nas outras rotas), e `perfil_sem_permissao` continua 403 (`respostaDaEntradaDeTexto`).

**Tela:** `GET` e `POST /__admin/sessao` devolvem também `acoes` (as ações do perfil), conferidas por `normalizarSessao` contra a lista da matriz. Os controles que o perfil não pode usar (em `/admin/`: novo serviço, texto, link, usar link já cadastrado, editar serviço, editar tema e nova versão; em `/admin/conteudo/`: marcar como revisado, editar e excluir fonte, incluir, editar, aceitar, excluir e reabrir informação, importar, concluir, nova versão, autorizar, publicar e revogar) continuam focáveis, com `aria-disabled="true"`, clique bloqueado e uma descrição ligada por `aria-describedby`, montada com `textContent` num contêiner `#ajudas-perfil` dentro do conteúdo principal de cada página (id fixo por ação, por exemplo `ajuda-perfil-publicar`; o contêiner fica fora do fluxo e dentro da área visível, sem rolagem horizontal), por exemplo "Esta ação é feita pelo perfil Revisor. Você entrou como Cadastrante." (ao clicar, a mesma frase aparece na área de status). Um 403 com `perfil_sem_permissao` mostra "Esta ação não está disponível para o seu perfil.", diferente do 403 de acesso não local. Sem `acoes` na resposta (servidor anterior ao 8C ou simulação dos testes), a tela não restringe: o servidor continua sendo a barreira. A aparência dos controles bloqueados não foi alterada; `admin/styles.css` só ganhou a regra do contêiner das descrições. `scripts/check-dist.js` passou a proibir no build `acoes-das-rotas`, `perfil_sem_permissao`, `acao_negada`, `ajuda-perfil` e `aplicarPermissoesDoPerfil`.
