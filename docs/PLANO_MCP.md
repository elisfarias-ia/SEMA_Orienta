# Plano do servidor MCP local (Passo 2B)

Status: **plano aprovado para implementação no Passo 2C, com condições**. Nada foi implementado. Todos os requisitos estão como **NÃO TESTADO**.

Origem: consolidação de duas revisões independentes, ambas somente leitura, executadas em paralelo nesta sessão (13/11/2026):

- `arquiteto-sema`: desenho, reaproveitamento e plano de testes;
- `auditor-sema`: segurança de parâmetros, caminhos, exposição de dados e publicação indevida. Veredito: **aprovável com condições** (itens Bloqueantes abaixo e achados A1 e A2).

Onde os dois divergiram, este plano adota a opção mais restritiva e registra a decisão na seção 10.

## 1. Objetivo e escopo

Um processo Node local que expõe a base de `services/` a um assistente de código por MCP:

- transporte **stdio**;
- **somente leitura**;
- quatro ferramentas: `listar_assuntos`, `listar_servicos`, `consultar_fontes` e `resumir_base`.

Fora do escopo:

- escrita, decisão, validação ou publicação;
- `resources/*` e `prompts/*`;
- rede de qualquer tipo;
- uso pelo chat público ou pelo cidadão;
- inclusão na saúde operacional (`docs/ADMINISTRACAO.md`, `docs/ARQUITETURA.md`).

## 2. Localização e camadas

O código fica em `scripts/mcp/`, fora de `src/`, `services/` e `index.html`. O build parte só de `index.html` e `src/` (`vite.config.js`), então essa pasta não é alcançável pelo `dist/`.

| Arquivo | Papel |
|---|---|
| `scripts/mcp/protocolo.js` | Puro: leitura por linha, envelope JSON-RPC 2.0, respostas e erros, `initialize`. Não conhece a base. |
| `scripts/mcp/leitura-segura.js` | Camada própria **só de leitura** (seção 5.2): confinamento, recusa de links e limite de tamanho. Não exporta nenhuma função de gravação. |
| `scripts/mcp/ferramentas.js` | Definição das 4 ferramentas (nome, descrição, `inputSchema`), validação de argumentos, lista de campos permitidos e montagem da saída. |
| `scripts/mcp/servidor.js` | `criarServidorMcp({ raiz, entrada, saida, erro })` exportado para testes. Executado diretamente, liga `process.stdin` e `process.stdout` e fixa a raiz por `import.meta.url`. |

Haverá o script `npm run mcp` (`node scripts/mcp/servidor.js`) no `package.json`, com atualização do teste I4 de `tests/admin-isolamento.test.js` no mesmo passo. Não haverá dependência nova (seção 10).

A configuração do cliente (`.mcp.json` na raiz) será versionada no Passo 2C, com caminhos relativos, sem `env`, segredos, caminhos absolutos ou dados pessoais. Isso exige ajustar a regra de versionamento do `CLAUDE.md` no mesmo passo.

## 3. Módulos existentes

### 3.1 Reaproveitar (importação permitida, lista fechada)

- `services/versao-atual.js`: `PADRAO_ID`, `ARQUIVOS_DA_VERSAO`, `NOME_DO_MANIFESTO`, `pastaDaVersao` e `caminhosDaVersao`. Serve para **montar** os caminhos esperados a partir do registro. A leitura do conteúdo passa pela camada da seção 5.2, porque `lerJsonRelativo` usa `readFileSync` sem checar link nem tamanho (achado A2).
  - `localizarVersaoAtual` só pode ser usada se a leitura interna for trocada pela camada segura. Caso contrário, o MCP replica a mesma conferência (caminho do manifesto igual ao esperado) usando a sua própria leitura.
- `scripts/validate-services.js`: constantes `STATUS_VALIDOS`, `TIPOS_FONTE`, `SITUACOES_VIGENCIA` e `PENDENTE`, além de `validarAssuntos`, `validarFontes` e `validarServicos(raiz)`, **só para contar erros**. As mensagens desses validadores nunca são repassadas (achado A1). Importar é seguro: a CLI só roda quando o arquivo é executado diretamente.
- `services/admin/fluxo.js`: `ESTADOS_VERSAO`, para as chaves de `resumir_base`.
- Padrões copiados, **sem importar**:
  - verificações de `services/admin/armazenamento.js` (recusa de `..`, `\`, `:`, byte nulo, link simbólico; limite de 5 MB);
  - formato do catálogo de `montarCatalogo` (`services/admin/admin-endpoint.js`);
  - contagem de publicados de `services/admin/saude.js`.

### 3.2 Proibido importar

- `services/admin/armazenamento.js`: `criarArmazenamento` devolve um objeto que também expõe `gravarJson`, `gravarTexto` e `acrescentarJsonl`.
- `services/admin/transacao.js`, `cadastro.js`, `decisoes.js`, `admin-endpoint.js` e `saude.js` (este grava em diretório temporário).
- Funções de escrita de `services/admin/versao.js` (`criarVersao`, `alterarArquivos`, `enviarParaValidacao`, `criarNovaVersao`).
- `services/assistant-*.js` e `scripts/check-dist.js`.

## 4. Ferramentas

### 4.1 Regras comuns

- `arguments` deve ser objeto simples (ou ausente). Chaves extras, inclusive `__proto__`, são recusadas no servidor com `parametro_invalido`, conferidas por `Object.keys`, além de `additionalProperties: false` no `inputSchema`.
- **Nenhum parâmetro aceita caminho**, nome de arquivo, URI ou glob. Só ids e enums.
- Id: string ASCII, regex `^[a-z][a-z0-9-]*$`, de 1 a **60** caracteres. Não normalizar Unicode antes de validar.
- O id só é aceito se existir no registro (ou em `assuntos.json`) por **igualdade estrita** (`find` com `===` ou `Map`), nunca por `obj[id]`. Essa verificação acontece **antes de qualquer acesso a disco** e cobre `constructor`, `__proto__`, `con`, `nul` etc.
- Saída: `content: [{ type: "text", text: <JSON> }]` e `structuredContent` com o mesmo objeto. Só campos de uma **lista de campos permitidos**, nunca o objeto lido inteiro.
- Toda resposta traz `aviso` com texto fixo:
  > Conteúdo em validação e não publicado. `statusValidacao: validado` em fonte significa conferência de metadados, não autorização de uso. `PENDENTE` significa ausente. Não usar para orientar o cidadão.
- Limites de saída:
  - resposta serializada de até **256 KB**; acima disso, erro `resposta_grande_demais` (nunca corte silencioso);
  - listas com até **200 itens**; acima disso, `truncado: true` e `total` real;
  - textos livres (`descricao`, `observacao`) com até **2.000 caracteres**, com marcação explícita de corte.
- Erros de execução voltam como `result` com `isError: true` e `{ erro: "<codigo>" }`, com códigos de uma lista fechada:

  `parametro_invalido`, `assunto_nao_encontrado`, `servico_nao_encontrado`, `fonte_nao_encontrada`, `versao_indisponivel`, `base_indisponivel`, `resposta_grande_demais`.

  Sem caminho (os absolutos desta máquina contêm o nome da usuária), pilha de execução, `e.message` nem o valor recebido.

### 4.2 `listar_assuntos`

- Finalidade: catálogo de `services/assuntos.json`.
- Parâmetros: `ativo` (boolean, opcional).
- Saída: `assuntos[]` com `{ id, nome, descricao, ativo, criadoEm, atualizadoEm, totalServicos }`, mais `total`, `truncado`, `consistente` (sem erros em `validarAssuntos`) e `totalErros`.
- Erros: `parametro_invalido`, `base_indisponivel`, `resposta_grande_demais`.

### 4.3 `listar_servicos`

- Finalidade: serviços do registro com metadados de versão e situação, **sem conteúdo material** (sem roteiro, documentos, FAQ ou blocos do assistente).
- Parâmetros: `assuntoId` (opcional; precisa existir em `assuntos.json`).
- Saída: `servicos[]` com:
  - `id`, `assuntoId`, `nome`, `sigla`, `categoria`;
  - `registro.statusValidacao`, `registro.publicado`, `registro.versaoPublicadaId` (`null` explícito);
  - `versao: { id, numero, estado, baseadaEm, criadoEm, enviadaEm, temHash }` (sem `hashConteudo`);
  - `pendencias` e `camposPendentes` (campos com valor literal `PENDENTE`);
  - `coerente`: status e `publicado` iguais entre registro e `service.json`.

  Um item ilegível vem como `{ id, erro: "versao_indisponivel" }`, sem derrubar a lista.
- Erros: `parametro_invalido`, `assunto_nao_encontrado`, `base_indisponivel`, `resposta_grande_demais`.

### 4.4 `consultar_fontes`

- Finalidade: fontes da **versão atual** de um serviço.
- Parâmetros:
  - `servicoId` (obrigatório);
  - `fonteId` (opcional, regex de id);
  - `tipo` (opcional, enum `TIPOS_FONTE`);
  - `statusValidacao` (opcional, enum `STATUS_VALIDOS`);
  - `situacaoVigencia` (opcional, enum `SITUACOES_VIGENCIA`).

  Não haverá `versaoId` na primeira entrega: hoje `versaoPublicadaId` é `null`. Se for incluído depois, o formato é `^<servicoId>-v[1-9][0-9]{0,3}$` e o valor precisa ser igual a `versaoAtualId` ou `versaoPublicadaId` do registro.
- Saída: `{ servicoId, versaoId, versao.estado, statusValidacaoArquivo, pendencia, total, truncado, consistente }` e `fontes[]` com a lista permitida:

  `id`, `titulo`, `tipo`, `orgaoResponsavel`, `url` (só `https://`, devolvida como texto e **nunca acessada**), `origemOficial`, `statusValidacao`, `publicado`, `dataPublicacao`, `dataConsulta`, `vigencia.situacao`, `vigencia.normasRelacionadas` e `citadaEm` (ids dos campos de `service.json` que citam a fonte).

  Não calcula "pode orientar resposta": não há função exportada para isso, e duplicar a regra criaria divergência.
- Erros: `parametro_invalido`, `servico_nao_encontrado`, `fonte_nao_encontrada`, `versao_indisponivel`, `resposta_grande_demais`.

### 4.5 `resumir_base`

- Finalidade: visão quantitativa da base.
- Parâmetros: nenhum. Qualquer argumento gera `parametro_invalido`.
- Saída:
  - `assuntos { total, ativos, inativos }`;
  - `servicos { total, porStatusValidacao, publicados }`;
  - `versoes { porEstado }`, com todas as chaves de `ESTADOS_VERSAO` (inclusive as zeradas), e `versoesPublicadas`;
  - `fontes { total, porStatusValidacao, publicadas, naoPublicadas, porSituacaoVigencia }` (inclusive `revogada` e `a_confirmar`);
  - `documentos`, `perguntas` e `blocosAssistente`, cada um `{ total, publicados }`;
  - `camposPendentes` (total);
  - `validacao { ok, totalErros }` e, quando houver, códigos sanitizados de uma lista fechada. **Nunca** mensagens internas, entradas, caminhos ou erros brutos. Para ver os detalhes, rodar `npm run validate:services`.
- Erros: `parametro_invalido`, `base_indisponivel`.

## 5. Proibições

### 5.1 Escrita

Nenhuma API de escrita do `fs`: `writeFile*`, `appendFile*`, `open*` com flag de escrita, `createWriteStream`, `mkdir*`, `mkdtemp*`, `rm*`, `unlink*`, `rename*`, `copyFile*`, `cp*`, `symlink*`, `chmod*`, `truncate*`. Nenhuma função `gravar*` nem `acrescentarJsonl`. Nenhum módulo da seção 3.2.

### 5.2 Caminhos e leitura

- Raiz do projeto obtida por `import.meta.url`. Não vem de `process.cwd()`, argumentos de linha de comando nem variáveis de ambiente.
- Caminhos montados só por `pastaDaVersao` e `ARQUIVOS_DA_VERSAO`. O caminho declarado no manifesto ou no `service.json` só é aceito se for **igual ao esperado**, e nunca é usado diretamente para abrir arquivo.
- Leituras permitidas: `services/registry.json`, `services/assuntos.json` e os arquivos da versão resolvida pelo registro.
- Toda leitura passa por:
  - recusa de byte nulo, `\`, `:` e segmentos `..`;
  - `lstat` em cada segmento a partir de `services/`, recusando link simbólico e junção do Windows;
  - `realpath` do arquivo dentro de `realpath(<raiz>/services)` mais separador, com `path.relative` sem `..` e não absoluto;
  - tamanho de até **5 MB**, conferido antes da leitura;
  - erro de `JSON.parse` convertido em `base_indisponivel`, **sem** `e.message` (achado A1).
- Risco residual aceito para uso local por uma pessoa: condição de corrida entre verificação e leitura, e hard links não detectáveis.

### 5.3 Exposição de dados

- O código do MCP não referencia `data/`, `admin-private`, `.env`, `.claude`, `node_modules`, `dist`, `.git`, `e2e` nem `tests`.
- Nunca entram na saída: `responsavelValidacao`, `responsavel`/`unidade` de decisões, `hashConteudo`, `conteudoFonte`, conteúdo de `conteudo-assistente.json`, roteiro, documentos e FAQ.
- O conteúdo da base é dado, não instrução: a resposta é JSON estruturado e não concatena textos da base com instruções.

### 5.4 Rede

Nenhum `node:http`, `https`, `http2`, `net`, `tls`, `dgram`, `dns`, `child_process` nem `worker_threads`, e nenhum `fetch` ou `WebSocket`. Nenhuma chamada a `/__admin` ou `/__assistente`. URLs das fontes nunca são acessadas.

### 5.5 Segredos

- Sem `process.env` no código do MCP.
- Sem leitura do token administrativo, que existe só na memória do Vite.
- A configuração do cliente não leva `env`, segredo, caminho absoluto nem dado pessoal.

### 5.6 Publicação indevida

- Status repassados com o **valor literal e o campo de origem**: `registro.statusValidacao`, `registro.publicado`, `registro.versaoPublicadaId`, `versao.estado`, `fonte.statusValidacao`, `fonte.publicado`, `vigencia.situacao`.
- Hoje o registro diz `em_validacao` e a versão diz `rascunho`. As duas informações aparecem lado a lado, sem conciliar.
- Proibidos rótulos como "Conteúdo validado", "Pronto para publicação" ou "Publicado", e campos derivados como `publicavel`, `aprovado` ou `pronto`.
- `PENDENTE` e `null` são repassados como estão. Nunca preencher, resumir nem omitir.
- Fora do `dist/`: `scripts/check-dist.js` passa a recusar os termos `scripts/mcp`, `listar_assuntos`, `listar_servicos`, `consultar_fontes`, `resumir_base` e `criarServidorMcp`, e qualquer arquivo cujo caminho contenha a pasta do MCP.

## 6. Transporte stdio

Implementação mínima própria, **sem SDK** e sem dependência nova.

- Mensagens JSON-RPC 2.0 delimitadas por nova linha, lidas com `node:readline`, aceitando `\r\n`. Processamento em série, uma requisição por vez.
- Métodos: `initialize`, `notifications/initialized` (sem resposta), `ping`, `tools/list` e `tools/call`. A capacidade anunciada é só `tools`. `resources/*` e `prompts/*` respondem `-32601`.
- Versões de protocolo aceitas no `initialize`: lista fixa, **a confirmar na especificação MCP durante o 2C**. Versão desconhecida recebe a versão suportada ou erro.
- Mensagem de até **64 KB**, com teto no buffer inclusive para entrada sem quebra de linha. Acima disso, descarta até a próxima quebra de linha e responde `-32600`.
- Códigos de erro:
  - `-32700`: JSON inválido (`id: null`);
  - `-32600`: requisição inválida (`jsonrpc` diferente de `"2.0"`, método que não é string, lote em array);
  - `-32601`: método desconhecido;
  - `-32602`: ferramenta desconhecida ou parâmetros inválidos;
  - `-32603`: erro interno, com mensagem fixa e sem `data`.
- O **stdout** recebe só mensagens JSON-RPC, uma por linha. `console.log`, `console.info` e `process.stdout.write` ficam proibidos fora do transporte.
- O **stderr** recebe só códigos fixos, sem parâmetros, conteúdo, caminhos ou pilha.
- `uncaughtException` e `unhandledRejection` escrevem um código fixo no stderr e encerram com código diferente de zero. Fim do stdin encerra com código 0.

## 7. Achados no código existente

| Id | Achado | Situação | Tratamento no MCP |
|---|---|---|---|
| A1 | `scripts/validate-services.js` monta mensagens com caminho relativo e `e.message`. No Node 22, `JSON.parse` repete trecho do texto de entrada (`Unexpected token 'A', "API_KEY=…" is not valid JSON`). | Confirmado por execução pelo auditor (Node v22.10.0) | Nunca repassar mensagens; só contagens e códigos fixos. |
| A2 | `resolverDentro` (`validate-services.js`) e `lerJsonRelativo` (`versao-atual.js`) usam só `path.resolve`/`startsWith`/`readFileSync`, sem `lstat`, `realpath` nem limite de tamanho. | Confirmado por leitura, sem teste executado | Camada própria de leitura (5.2). |
| A3 | `PADRAO_ID` não tem limite de tamanho e aceita nomes reservados. | Confirmado por leitura | Limite de 60 e igualdade estrita no registro antes do disco. |
| A4 | Status em camadas com sentidos diferentes: registro `em_validacao`, versão `rascunho`, fontes `validado` com `publicado: false`, algumas `revogada`. | Confirmado por leitura | Repasse literal com campo de origem e aviso fixo (5.6). |

Fora do escopo do MCP (registrados pelo auditor, sem correção neste passo):

- `docs/ADMINISTRACAO.md` ainda diz, no início, que "não há interface, endpoint";
- o mesmo documento cita só `.json` e `.jsonl` como extensões, mas `armazenamento.js` também aceita `.md`.

## 8. Testes do Passo 2C

Regras: `node --test` sem bibliotecas; testes que gravam usam cópia temporária de `services/` fora do repositório; teste pulado conta como **NÃO TESTADO**.

| Arquivo | Cobertura |
|---|---|
| `tests/mcp-protocolo.test.js` | `initialize` (versão suportada e desconhecida); notificação sem resposta; `-32700`, `-32600` (envelope e lote), `-32601` (método e `resources/list`), `-32602`; linha acima de 64 KB e entrada sem quebra de linha não derrubam o processo; `\r\n`; `id` devolvido igual. |
| `tests/mcp-ferramentas.test.js` | `tools/list` com exatamente os 4 nomes e schemas; caso feliz de cada ferramenta com valores reais da LAC (`versao.estado: rascunho`, `registro.statusValidacao: em_validacao`, `versaoPublicadaId: null`, `PENDENTE` preservado, fontes `validado` com `publicado: false`, fonte `revogada`); filtros e enums; mais de 200 itens geram `truncado`; registro corrompido gera `base_indisponivel`; manifesto incoerente gera `versao_indisponivel` no item; `resumir_base` com argumento gera erro; snapshot das chaves igual à lista permitida. |
| `tests/mcp-seguranca.test.js` | Ids recusados: `""`, 61 caracteres, `LAC`, `lác`, largura total, byte nulo, `../lac`, `lac/..`, `C:\x`, `/etc`, `\\srv\x`, `%2e%2e`, `constructor`, `__proto__`, `con`, `nul`, número, null, array; versões não registradas; chave extra e `{"__proto__":{}}`; `arguments` como string ou array. Em todos, prova de que nenhuma leitura de disco aconteceu (`fs` espionado). Junção do Windows e link simbólico apontando para `data/admin-private/x.json` e para um `.env` fictício com `SEGREDO_FICTICIO`; manifesto com `arquivos.fontes` adulterado para `../../../.env`; arquivo maior que 5 MB. Nenhuma saída contém a raiz temporária, o nome de usuário, `node:`, `at `, `Error` nem o valor enviado. Análise estática: nenhuma API de escrita, módulo de rede, `process.env` ou importação proibida em `scripts/mcp/`. Hash SHA-256 da cópia idêntico antes e depois de chamar as 4 ferramentas. |
| `tests/mcp-processo.test.js` | Inicia `node scripts/mcp/servidor.js` como processo filho (o `spawn` existe só no teste), contra a base real e só lendo. Envia `initialize`, `tools/list` e as 4 chamadas. Confere que toda linha do stdout é JSON-RPC válido, que o stderr não traz conteúdo, que o processo termina com 0 ao fechar o stdin e que o hash de `services/` é igual antes e depois. |
| Isolamento e build | `tests/admin-isolamento.test.js`: `src/` não importa `scripts/mcp`. Teste de `check-dist` com `dist/` fictício contendo um nome de ferramenta deve falhar. |

## 9. Evidências do Passo 2C

Guardar a saída real de:

- `npm test` (com a contagem);
- `npm run validate:services`;
- `npm run build` seguido de `node scripts/check-dist.js`;
- `git status` mostrando `services/` sem alteração;
- `git diff --check`;
- transcrição sanitizada de uma sessão stdio, sem caminhos nem dados pessoais.

Registrar **à parte** o que for conferido manualmente pela usuária, em especial a chamada real pelo cliente Claude Code. É essa chamada que demonstra a técnica em `docs/METODOLOGIA_DESENVOLVIMENTO.md`. Sem ela, a técnica continua "não demonstrada".

## 10. Decisões

Tomadas neste plano, adotando a opção mais restritiva:

| Tema | Arquiteto | Auditor | Adotado |
|---|---|---|---|
| Uso de `armazenamento.js` | Fachada só com `lerJson`/`lerTexto` | Proibido importar (o objeto expõe gravação) | Não importar; copiar as verificações numa camada própria de leitura. |
| Tamanho do id | 64 | 60 (igual ao cadastro) | 60 |
| Itens por lista | 200 (fontes 100) | 200 | 200 |
| Texto longo | Recusar acima de 4 KB | Cortar em 2.000 caracteres com marcação | Cortar com marcação explícita. |
| Pasta | `scripts/mcp/` | Fora de `src/`, `services/` e `index.html` (exemplo `tools/mcp/`) | `scripts/mcp/` |
| `versaoId` em `consultar_fontes` | Não previsto | Opcional, só versão registrada | Fora da primeira entrega. |
| SDK MCP | Não usar (dependência nova; quebra o teste I4) | Exige autorização expressa | Implementação própria, sem dependência. |
| Script npm | Não criar (I4 fixa os scripts) | Sem posição | Criar `npm run mcp` e atualizar o I4 (decisão da usuária). |

Decididas pela usuária (13/11/2026):

1. `.mcp.json` será versionado no Passo 2C, sem segredos e com caminhos relativos.
2. Haverá `npm run mcp`, com atualização do teste I4.
3. `resumir_base` devolverá apenas contagens e códigos sanitizados, nunca mensagens internas, entradas, caminhos ou erros brutos.

## 11. Não verificado neste passo

- A especificação MCP atual: versões aceitas no `initialize`, obrigatoriedade de `outputSchema`/`structuredContent` e o formato de configuração do cliente.
- Se o Windows desta máquina permite criar links simbólicos de arquivo sem privilégio. Junções não exigem.
- O conteúdo completo de `documentos.json`, `perguntas-frequentes.json` e `conteudo-assistente.json`, de `transacao.js` e `decisoes.js`, e o restante de `tests/`.
- Nenhum teste, build ou `check-dist` foi executado neste passo.
