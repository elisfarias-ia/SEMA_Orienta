# Evidências da Sprint 3 — informações do chatbot (blocos de conhecimento em rascunho)

- **Data do fechamento:** 13/11/2026
- **Issue:** #7 (Sprint 3 — blocos de conhecimento em rascunho)
- **Branch:** `feature/sprint-3-edicao-rascunho` (a partir de `main` em `f24330a`)
- **Repositório:** público, por decisão autorizada para avaliação.

## Aviso sobre o alcance

Esta Sprint cria o **cadastro de informações em rascunho** que, no futuro, poderão ser usadas pelo chatbot. **Nada foi validado materialmente, autorizado ou publicado** e **o chat público não foi alterado**. Os dados reais da LAC não receberam nenhum bloco de conhecimento.

## Commits

| Passo | Commit | Conteúdo |
|---|---|---|
| 3A | `658edc1` | Modelo, validador e regras dos blocos de conhecimento (esquema, `services/admin/conhecimento.js`, filtro do assistente para o tipo `conhecimento`). |
| 3B1 | `81ef0c3` | Endpoints locais de criação, alteração e exclusão (`/__admin/servicos/<id>/conhecimentos`). |
| 3B2 | `0f071d1` | Página `/admin/conteudo/` ("Informações do chatbot"), navegação, ícones SVG e conferência manual. |
| 3C | este commit | `check-dist` ampliado e documentos de fechamento. |

## Modelo dos blocos de conhecimento

Fonte única de verdade: `conteudo-assistente.json` de cada versão do serviço, com o tipo `conhecimento` no vetor `blocos` (sem arquivo novo e sem duplicar `perguntas-frequentes.json`).

- **Campos:** `id` (gerado pelo servidor, invisível), `tipo`, `titulo` (na tela, "Tema da informação"), `texto` ("Informação que o chatbot pode usar"), `origem` (`fonte`), `fonteIds` (uma ou mais, existentes e não revogadas), `referencias` (`{ fonteId, localizacao }`, uma por fonte), `alertas` (opcional, "Avisos ou limitações"), `ambiente`, `statusValidacao`, `publicado`, `revisaoAtualidade`, `criadoEm` e `atualizadoEm` (AAAA-MM-DD; na tela, DD-MM-AAAA).
- **Nascimento:** rascunho, `publicado: false`, revisão `pendente` e `ambiente: publico`. `ambiente: publico` **não** significa publicado.
- **Evolução futura:** o esquema e o validador aceitam só combinações coerentes (rascunho/pendente/não publicado; em validação/pendente ou em revisão/não publicado; validado/concluída/publicado ou não).
- **Limites:** título 200 caracteres, texto 2000, aviso 300 (até 10), até 10 fontes, localização 200. Não aceita e-mail nem telefone.
- **Identidade auditável:** `versaoId + blocoId`. O `blocoId` pode permanecer entre versões para representar a linhagem.
- **Nova versão (função pura):** `prepararBlocosParaNovaVersao` copia os blocos de conhecimento mantendo o id e reinicia status, revisão e publicação; a versão anterior e os 5 blocos `teste_local` ficam intactos. **A criação automática da nova versão pelo sistema não foi implementada** (ver limitações).
- **Seletor do assistente:** `selecionarBlocosAssistente` só entrega conhecimento publicado, validado, com revisão concluída, fontes publicadas e não revogadas, origem `fonte`, `fonteIds` não vazio e referências correspondentes. Rascunho, revisão pendente, fonte não publicada, `publicado: false`, `regra_institucional` e referências ausentes ou divergentes não são entregues (testes com dados fictícios).

## Endpoints (somente no `npm run dev`)

| Rota | Efeito | Resposta |
|---|---|---|
| `POST /__admin/servicos/<id>/conhecimentos` | Cria o bloco (id e datas gerados pelo servidor). | 201 |
| `PATCH /__admin/servicos/<id>/conhecimentos/<blocoId>` | Substitui título, texto, fontes, referências e avisos; preserva `id` e `criadoEm`. | 200 |
| `DELETE /__admin/servicos/<id>/conhecimentos/<blocoId>` | Remove bloco de conhecimento em rascunho, não publicado e pendente. | 204 |

- **Regras:** token, Host e Origin locais; corpo JSON até 32 KB; só os cinco campos permitidos (id, datas, estado, revisão, ambiente, publicação e extras são recusados com 422); só com a versão atual em rascunho (409 caso contrário); leitura das fontes só da versão atual.
- **Gravação:** só o arquivo de conteúdo do assistente da versão atual; base validada antes e depois, ensaio em cópia temporária, escrita atômica e desfazer integral em falha; uma gravação por vez (409 para a concorrente, sem fila). Registro, manifesto, fontes, documentos, perguntas e blocos `teste_local` nunca são alterados.
- **Decisão revista:** o bloqueio por título repetido foi removido (títulos iguais com conteúdos diferentes são permitidos); a duplicidade por conteúdo não foi implementada.
- **Respostas:** códigos genéricos, sem caminho, pilha, corpo bruto ou mensagens do validador; o bloco devolvido omite `tipo`, `origem` e `ambiente`.

## Interface e conferência manual

- **Página:** `/admin/conteudo/` ("Informações do chatbot"), separada da página principal, com navegação provisória "Cadastro da base", "Informações do chatbot" e "Saúde do sistema". Escolha de assunto e serviço sem ids, situação do serviço, lista de informações cadastradas, formulário com fontes e localização obrigatória, avisos opcionais, confirmação antes de salvar e de excluir, ações bloqueadas fora de rascunho, mensagens curtas em português e foco levado à mensagem. Sem `innerHTML`, `localStorage`, `sessionStorage` nem cookies; ícones SVG simples, sem biblioteca.
- **Conferência manual (13/11/2026, MC-01 a MC-09 em `docs/TESTES_MANUAIS.md`):** cadastro, edição e exclusão aprovados pela usuária; linguagem aprovada com ressalva de usabilidade e depois corrigida; visual aprovado em desktop e em 390 px; página separada, ícones SVG, ids ocultos e chat público inalterado. O dado fictício foi excluído e a base restaurada pelo Git (LAC com os 5 blocos originais).

## Resultados reais dos testes (executados no fechamento)

| Verificação | Comando | Resultado |
|---|---|---|
| Validação da base | `npm run validate:services` | **PASSOU**: sem erros, 1 serviço (lac) |
| Testes automatizados | `npm test` | **PASSOU**: 623 testes, 619 passaram, 0 falharam, 4 ignorados |
| Testes de ponta a ponta | `npm run test:e2e` | **PASSOU**: 27 testes (Chromium) |
| Build de produção | `npm run build` | **PASSOU**: `dist/` com 3 arquivos (`index.html`, um `.css` e um `.js`) |
| Conteúdo de teste e administrativo no build | `node scripts/check-dist.js` | **PASSOU**: 136 termos verificados, nenhuma ocorrência |
| Testes que dependem do `dist/` | `npm test` com o `dist/` presente | **PASSOU**: executados, não ignorados |
| Formato do diff | `git diff --check` | **PASSOU** |

### PASSOU / FALHOU / NÃO TESTADO

| Item | Situação |
|---|---|
| Modelo, validador e regras dos blocos de conhecimento | PASSOU (testes automatizados e 2 auditorias do `auditor-sema`, sem bloqueantes) |
| Endpoints POST, PATCH e DELETE, com rollback e concorrência | PASSOU (testes em cópias temporárias; auditoria sem bloqueantes) |
| Interface `/admin/conteudo/` (lógica, estrutura e navegador com requisições simuladas) | PASSOU |
| Conferência manual MC-01 a MC-09 | PASSOU (aprovada pela usuária, com ressalva de linguagem corrigida) |
| Nenhum bloco `conhecimento` nem `publicado: true` nos dados reais | PASSOU (conferido nos JSON de `services/`) |
| `dist/` sem administração, sem endpoints `/conhecimentos` e sem os textos da página | PASSOU (`check-dist` ampliado) |
| Recusa de links simbólicos de arquivo (4 testes) | NÃO TESTADO: o sistema operacional negou a criação do link (EPERM); teste ignorado, sem relação com esta Sprint |
| Criação automática de nova versão pelo sistema | NÃO TESTADO: não implementada (só a função pura de preparação dos blocos) |
| Falhas de gravação em disco real | NÃO TESTADO manualmente: cobertas por falhas simuladas em testes |
| FALHOU | nenhum item |

## Conteúdo não publicado e chat público inalterado

- Os dados reais não contêm bloco do tipo `conhecimento`, e não existe `"publicado": true` em `services/`.
- A interface do cidadão (`index.html` e `src/`) não referencia a administração; nenhum dos 36 termos novos do `check-dist` existe nela.
- `services/` não teve dados alterados na Sprint.
- Documentos, perguntas frequentes e fontes continuam indisponíveis ao assistente.

## Limitações

Sem IA externa, sem busca semântica ou RAG, sem upload de arquivos, sem validação material nem publicação, e **sem criação automática de nova versão** quando a versão atual está congelada (a edição fica bloqueada). Administração local e sem autenticação. Revisão otimista no PATCH e no DELETE, proteção contra alterações externas entre ensaio e gravação e reavaliação da concorrência para uso multiusuário ficam como melhorias futuras (Issue #7).

## Cadastro guiado da base

O cadastro guiado de assunto, serviço e fontes em um único fluxo foi transferido para a **Issue #8 (Sprint 4 — cadastro guiado da base)**.
