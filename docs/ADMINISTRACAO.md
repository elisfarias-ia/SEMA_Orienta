# Módulo administrativo local — gestão de conteúdo

Este documento descreve os limites do módulo de gestão de conteúdo e validação material (Marco 7). Ele é **local, para desenvolvimento**, e **separado do chat do cidadão**. Até este passo existem apenas funções e armazenamento: não há interface, endpoint nem dados reais.

## O que existe hoje

| Peça | Arquivo | Situação |
|---|---|---|
| Catálogo de assuntos | `services/assuntos.json` | Um assunto: "Licenciamento Ambiental". |
| Fluxo de estados e hash | `services/admin/fluxo.js`, `hash.js` | Funções puras. |
| Versões e decisões | `services/admin/versao.js`, `decisoes.js` | Funções puras, sem dados reais. |
| Armazenamento local | `services/admin/armazenamento.js` | Leitura e gravação seguras; só a leitura é usada pelo endpoint. |
| Endpoint administrativo de leitura | `services/admin/admin-endpoint.js` | Somente no `npm run dev`; sem escrita, sem interface. |

Nenhuma versão, decisão, validação material ou autorização de publicação real foi registrada. O conteúdo da LAC está na versão 1 (`services/lac/versoes/v1/`, em rascunho), migrada de forma estrutural, sem alteração material, sem hash, sem envio e sem decisões.

## Endpoint administrativo local (somente leitura)

Existe apenas no servidor de desenvolvimento (`npm run dev`): o plugin usa `apply: 'serve'` e não há gancho de preview, então **o build e o preview não o têm**. Não há interface administrativa ainda.

| Rota (todas `GET`, sem query e sem corpo) | Exige token | O que devolve |
|---|---|---|
| `/__admin/sessao` | não | O token da sessão, criado na primeira chamada. |
| `/__admin/catalogo` | sim | Assuntos e serviços, com versão atual e versão publicada. |
| `/__admin/servicos/<id>/versao-atual` | sim | Manifesto e arquivos modulares da versão atual (id de serviço cadastrado). |

- **Token:** gerado com `node:crypto` (32 bytes aleatórios), mantido só em memória do servidor de desenvolvimento, enviado no cabeçalho `X-Admin-Token` e comparado de forma segura. Não é gravado, não vai para cookie, `localStorage` nem variável de ambiente, e nunca é registrado em log. Reiniciar o servidor invalida o token.
- **Origem:** só conexão local (`127.0.0.1` ou `::1`), `Host` local na porta do servidor, `Origin` (se enviada) igual ao host da requisição e requisição não cruzada entre sites. Sem CORS.
- **Requisição:** só `GET`; query string, corpo, rotas desconhecidas, travessia de caminho e ids inválidos ou não cadastrados são recusados. Os erros são códigos genéricos, sem caminho, token ou conteúdo.
- **Somente leitura:** não grava, edita, exclui nem registra decisões, e **não lê `data/admin-private/`**. Requisições simultâneas não alteram nada persistente. A resposta tem limite de 2 MB, e os arquivos lidos têm os limites do armazenamento.
- **O token não é autenticação de pessoas.** Ele só impede que outro site aberto no navegador use o endpoint; quem tem acesso à máquina continua tendo acesso.

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
