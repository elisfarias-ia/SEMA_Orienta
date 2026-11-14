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
| Tela "Gestão de conteúdo" | `admin/` (`index.html`, `styles.css`, `admin.js`, `admin-logic.js`) | Somente no `npm run dev`, em `http://localhost:5173/admin/`; só cadastra assunto e serviço. |
| Informações do chatbot (blocos de conhecimento) | `services/admin/conhecimento.js`, `admin/conteudo/` | Funções puras, endpoints `/__admin/servicos/<id>/conhecimentos` e a página `/admin/conteudo/`; só no `npm run dev` (Sprint 3). |
| Saúde do sistema | `services/admin/saude.js` e `admin/saude/` | Verificações reais por `GET /__admin/saude` e a página `/admin/saude/`; só no `npm run dev`. |

Nenhuma versão, decisão, validação material ou autorização de publicação real foi registrada. O conteúdo da LAC está na versão 1 (`services/lac/versoes/v1/`, em rascunho), migrada de forma estrutural, sem alteração material, sem hash, sem envio e sem decisões.

## Endpoint administrativo local

Existe apenas no servidor de desenvolvimento (`npm run dev`): o plugin usa `apply: 'serve'` e não há gancho de preview, então **o build e o preview não o têm**. Não há interface administrativa ainda.

| Rota | Exige token | O que faz |
|---|---|---|
| `GET /__admin/sessao` | não | O token da sessão, criado na primeira chamada. |
| `GET /__admin/catalogo` | sim | Assuntos e serviços, com versão atual e versão publicada. |
| `GET /__admin/servicos/<id>/versao-atual` | sim | Manifesto e arquivos modulares da versão atual (id de serviço cadastrado). |
| `POST /__admin/assuntos` | sim | Cadastra um assunto (corpo: `nome` e `descricao`; o id é gerado pelo servidor). |
| `POST /__admin/servicos` | sim | Cadastra um serviço (corpo: `assuntoId`, `nome`, `termosEquivalentes` e `sigla` opcional; o id é gerado pelo servidor). |
| `POST /__admin/servicos/<id>/fontes` | sim | Cadastra uma fonte na versão atual do serviço, só se estiver em rascunho (corpo: `revisao` e os campos da fonte). |

- **Token:** gerado com `node:crypto` (32 bytes aleatórios), mantido só em memória do servidor de desenvolvimento, enviado no cabeçalho `X-Admin-Token` e comparado de forma segura. Não é gravado, não vai para cookie, `localStorage` nem variável de ambiente, e nunca é registrado em log. Reiniciar o servidor invalida o token.
- **Origem:** só conexão local (`127.0.0.1` ou `::1`), `Host` local na porta do servidor, `Origin` (se enviada) igual ao host da requisição e requisição não cruzada entre sites. Sem CORS.
- **Requisição:** as rotas de leitura aceitam só `GET`, sem corpo; as de cadastro, só `POST`. Query string, rotas desconhecidas, travessia de caminho e ids inválidos ou não cadastrados são recusados. Os erros são códigos genéricos, sem caminho, token ou conteúdo.
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

Página `http://localhost:5173/admin/conteudo/`, só no `npm run dev`. O nome "Cadastro da base" na navegação é provisório (a Sprint 4 traz o cadastro guiado, Issue #8).

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
