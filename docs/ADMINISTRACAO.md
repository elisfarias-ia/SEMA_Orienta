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

Nenhuma versão, decisão, validação material ou autorização de publicação real foi registrada. O conteúdo da LAC está na versão 1 (`services/lac/versoes/v1/`, em rascunho), migrada de forma estrutural, sem alteração material, sem hash, sem envio e sem decisões.

## Endpoint administrativo local

Existe apenas no servidor de desenvolvimento (`npm run dev`): o plugin usa `apply: 'serve'` e não há gancho de preview, então **o build e o preview não o têm**. Não há interface administrativa ainda.

| Rota | Exige token | O que faz |
|---|---|---|
| `GET /__admin/sessao` | não | O token da sessão, criado na primeira chamada. |
| `GET /__admin/catalogo` | sim | Assuntos e serviços, com versão atual e versão publicada. |
| `GET /__admin/servicos/<id>/versao-atual` | sim | Manifesto e arquivos modulares da versão atual (id de serviço cadastrado). |
| `POST /__admin/assuntos` | sim | Cadastra um assunto (corpo: `id`, `nome`, `descricao`). |
| `POST /__admin/servicos` | sim | Cadastra um serviço (corpo: `id`, `assuntoId`, `nome`, `termosEquivalentes` e `sigla` opcional). |

- **Token:** gerado com `node:crypto` (32 bytes aleatórios), mantido só em memória do servidor de desenvolvimento, enviado no cabeçalho `X-Admin-Token` e comparado de forma segura. Não é gravado, não vai para cookie, `localStorage` nem variável de ambiente, e nunca é registrado em log. Reiniciar o servidor invalida o token.
- **Origem:** só conexão local (`127.0.0.1` ou `::1`), `Host` local na porta do servidor, `Origin` (se enviada) igual ao host da requisição e requisição não cruzada entre sites. Sem CORS.
- **Requisição:** as rotas de leitura aceitam só `GET`, sem corpo; as de cadastro, só `POST`. Query string, rotas desconhecidas, travessia de caminho e ids inválidos ou não cadastrados são recusados. Os erros são códigos genéricos, sem caminho, token ou conteúdo.
- **Leitura:** não altera nada e **não lê `data/admin-private/`**. A resposta tem limite de 2 MB, e os arquivos lidos têm os limites do armazenamento.
- **Escrita:** só as duas rotas de cadastro gravam, e somente dentro de `services/`. Não há edição, exclusão, decisão nem publicação.
- **O token não é autenticação de pessoas.** Ele só impede que outro site aberto no navegador use o endpoint; quem tem acesso à máquina continua tendo acesso.

### Cadastro de assunto e serviço (Passo 7E1)

As duas rotas de cadastro exigem token, origem local, `Content-Type: application/json`, corpo de até 32 KB, JSON válido e somente os campos permitidos (qualquer outro, como `publicado`, `estado` ou `hashConteudo`, é recusado com 422).

- **Assunto:** `id` no padrão do projeto, `nome` e `descricao` obrigatórios; id ou nome (sem distinguir acento e caixa) já existentes recebem 409. Nasce com `ativo: true`, e as datas são geradas pelo servidor.
- **Serviço:** exige assunto existente e ativo, id e nome inéditos e nenhuma pasta com o mesmo nome. Nasce sempre como **versão 1, em rascunho, `publicado: false`**, com `versaoAtualId: <id>-v1` e `versaoPublicadaId: null`, sem hash, decisão, responsável ou autorização. A estrutura modular é criada em `services/<id>/versoes/v1/` (manifesto, `service.json`, roteiro, documentos, perguntas, fontes e conteúdo do assistente), com listas vazias e `PENDENTE`; o roteiro tem só as seções obrigatórias, todas `PENDENTE`. **Nenhum conteúdo ambiental é inventado.** Sem sigla informada, o campo fica `PENDENTE`.
- **Tudo ou nada:** a alteração é ensaiada numa cópia temporária e conferida pelo validador da base; depois é gravada com escrita atômica (o registro por último) e conferida de novo. Se qualquer gravação ou a conferência falhar, tudo é desfeito: arquivos novos e pastas criadas são removidos e o que já existia volta byte a byte. Nunca sobrescreve assunto, serviço ou pasta existente.
- **Concorrência:** uma gravação por vez; se outra estiver em andamento, a nova recebe 409 (`operacao_em_andamento`), sem perder dados.
- **Sem registro de dados:** o corpo, o token e os dados enviados não vão para log, e os erros não repetem o que foi enviado.

## Tela "Gestão de conteúdo" (Passo 7E2)

- **Acesso:** somente no `npm run dev`, em `http://localhost:5173/admin/` (`/admin` redireciona para `/admin/`). A pasta `admin/` não entra no build nem no preview, e não há link para ela na interface do cidadão. A tela mostra o aviso "Ambiente administrativo local — sem autenticação".
- **O que mostra:** o catálogo (assuntos e, em cada um, os serviços com versão atual, estado e se há versão publicada ou "não publicada") e dois formulários, "Novo assunto" e "Novo serviço".
- **Como cadastra:** o formulário valida os dados e abre uma confirmação com o resumo e os botões "Voltar" e "Confirmar cadastro". Só depois de confirmar é feita a gravação. Com sucesso, o formulário é limpo, o catálogo é atualizado e o foco vai para a mensagem de confirmação.
- **Sessão e token:** o token é obtido em `/__admin/sessao`, fica só numa variável em memória e é enviado em `X-Admin-Token`; nunca aparece na tela. Enquanto a sessão ou o catálogo não estiverem disponíveis, e durante uma gravação, os botões de envio ficam desabilitados (sem envio duplicado).
- **Segurança do código:** só `textContent` e APIs seguras do DOM; sem `innerHTML`, `localStorage`, `sessionStorage`, cookies ou log. Os erros do endpoint viram mensagens curtas em português, sem mostrar a resposta bruta.
- **O que não faz:** não edita nem exclui, não valida, não registra decisão e não publica. Não altera a LAC.
- **Atenção em testes manuais:** confirmar um cadastro grava arquivos reais em `services/`. Use dados fictícios e desfaça depois (restaure `services/assuntos.json` e `services/registry.json` com o Git e remova a pasta do serviço criada).

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
