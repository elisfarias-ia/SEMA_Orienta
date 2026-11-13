# Evidências do MCP local de consulta da base (Passo 2C2)

- **Data da demonstração:** 2026-11-13
- **Branch / commit de partida:** `feature/sprint-2-engenharia-assistida` / `d7fbc97`
- **Servidor reconhecido:** `sema-orienta-base` (configurado em `.mcp.json`), com as quatro ferramentas carregadas pela sessão do assistente de código. As chamadas foram feitas pelo MCP, sem comandos Node para simulá-las.

## Aviso sobre o alcance desta evidência

- "Validação ok, 0 erros" é o resultado da **verificação parcial** feita pelo MCP (coerência estrutural da base). **Não** representa validação material, validação jurídica, revisão de atualidade das normas nem autorização de publicação.
- A versão `lac-v1` continua em **rascunho**, o serviço `lac` segue `em_validacao` e nada está publicado.

## Ferramentas realmente invocadas

| # | Ferramenta | Parâmetros | Resultado | Observação |
|---|---|---|---|---|
| 1 | `listar_assuntos` | nenhum | PASSOU | 1 assunto (`licenciamento-ambiental`, ativo), `consistente: true` |
| 2 | `listar_servicos` | nenhum | PASSOU | 1 serviço (`lac`), versão atual `lac-v1`, estado `rascunho`, não publicado |
| 3 | `consultar_fontes` | `servicoId: lac` | PASSOU | 8 fontes cadastradas/localizadas, 0 publicadas |
| 4 | `resumir_base` | nenhum | PASSOU | contagens abaixo; verificação parcial `ok: true`, 0 erros |
| 5 | `consultar_fontes` (inválida) | `servicoId: servico-inexistente` | PASSOU | erro `servico_nao_encontrado`, sanitizado |

Nenhuma chamada resultou em FALHOU.

## Comparação com a base

A comparação usou leitura dos JSON da base **depois** das chamadas MCP.

| Item | MCP | Base (JSON) | Resultado |
|---|---|---|---|
| Assuntos | 1 (`licenciamento-ambiental`) | `assuntos.json`: 1 | PASSOU |
| Serviços | 1 (`lac`) | `registry.json`: 1 | PASSOU |
| Versão atual | `lac-v1`, nº 1, `rascunho` | `versao.json`: `lac-v1`, 1, `rascunho` | PASSOU |
| Fontes cadastradas/localizadas | 8 | `fontes.json`: 8 | PASSOU |
| Ids das fontes | `sema-orientacoes-lac`, `lei-complementar-668-2020`, `decreto-695-2020`, `decreto-1268-2022`, `decreto-1585-2022`, `tr-176-lac`, `manual-lac-siga-2020`, `faq-lac-2022` | mesmos 8 ids, mesma ordem | PASSOU |
| Fontes publicadas | 0 | 0 com `publicado: true` | PASSOU |
| Fontes com campo `statusValidacao` = `validado` | 8 | 8 | PASSOU (ver nota) |
| Documentos | 28 cadastrados, 0 publicados | `documentos.json`: 28 | PASSOU |
| Perguntas frequentes | 21 cadastradas, 0 publicadas | `perguntas-frequentes.json`: 21 | PASSOU |
| Blocos do assistente | 5 cadastrados, 0 publicados | `conteudo-assistente.json`: 5 | PASSOU |
| Publicação | 0 serviços e 0 versões publicadas | `registry.json`: `publicado: false`, `versaoPublicadaId: null` | PASSOU |

**Nota sobre o campo `statusValidacao` das fontes:** a contagem de 8 refere-se exclusivamente ao valor técnico do campo `statusValidacao` de cada fonte. O próprio arquivo registra que isso é conferência de identidade e procedência dos metadados, para fins de teste. **Não** significa que as fontes foram validadas materialmente, que a vigência das normas foi confirmada (há normas `a_confirmar`, `alterada` e `revogada`) nem que há autorização de uso ou publicação.

Nenhuma divergência encontrada entre o MCP e a base.

## Erro sanitizado

A chamada com identificador inexistente devolveu apenas o aviso padrão e o código `servico_nao_encontrado`. Não houve caminho interno, pilha de erro, trecho de arquivo nem conteúdo da base. PASSOU.

## Situação do conteúdo

- Serviço `lac`: `em_validacao`, não publicado.
- Versão `lac-v1`: `rascunho`, 11 pendências e 2 campos pendentes.
- Nenhum documento, pergunta frequente ou bloco do assistente está publicado.
- O conteúdo não serve para orientar o cidadão.

## Não testado

| Item | Resultado |
|---|---|
| Três testes de links simbólicos no Windows | NÃO TESTADO |
| Filtros opcionais (`ativo`, `assuntoId`, `fonteId`, `situacaoVigencia`, `statusValidacao`, `tipo`) | NÃO TESTADO |
| Outros formatos de entrada inválida | NÃO TESTADO |
| Testes automatizados, build e Playwright | NÃO TESTADO (fora do escopo deste passo) |
