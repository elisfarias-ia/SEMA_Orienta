# Sprints

Planejamento em ciclos curtos, com objetivo, backlog, critérios de aceite e Definition of Done. As datas e a duração são definidas pela equipe; este documento não as inventa.

## Sprint 1 — Engenharia assistida e saúde do sistema

- **Período:** a definir.
- **Objetivo:** tornar a metodologia, o estado operacional e os principais fluxos do SEMA Orienta verificáveis, sem alterar a base da LAC ou publicar a administração.
- **Ponto de partida:** a administração local cadastra assunto, serviço e fonte; a LAC está estruturada, em validação e não publicada; a bateria tem 499 testes sem falhas.
- **Fora da Sprint:** validação material da LAC (revisão de vigência, decisões e publicação), IA externa (`/api/chat`), SEMA Check, autenticação institucional, novos serviços e qualquer alteração nos dados da LAC.

### Backlog da Sprint

| ID | Passo | Entrega | Situação |
|---|---|---|---|
| 8A | `CLAUDE.md`, metodologia e templates Git | Regras permanentes, técnicas com situação e evidências, modelos de issue e de pull request | **Concluído** (PR #2) |
| 8B | Endpoint e tela de saúde | Estado operacional do sistema, visível só no ambiente local de desenvolvimento | **Concluído** (13/11/2026) |
| 8C | Playwright dos fluxos críticos | Testes de ponta a ponta do chat público, da administração local e da ausência da administração no build | **Concluído** (13 testes) |
| 8D | Documentação, evidências e fechamento | Documentos atualizados, evidências reunidas e retrospectiva da Sprint | Em revisão (PR #4) |

**Situação da Sprint:** tecnicamente concluída e em revisão na PR #4; a Issue #3 permanece aberta até o merge. Verificações do fechamento (validação da base, `npm test`, `npm run test:e2e`, build, `check-dist` e `git diff --check`) e evidências em `docs/EVIDENCIAS_SPRINT_1.md`. Os testes E2E são somente leitura e não cobrem o `preview` nem o build; a ausência da administração e da faixa de teste no `dist/` é verificada pelo `check-dist` e por testes Node.

### Critérios de aceite

- **8A:**
  - `CLAUDE.md` traz arquitetura, comandos, limites, segurança e regras permanentes.
  - `docs/METODOLOGIA_DESENVOLVIMENTO.md` classifica cada técnica como comprovada, parcialmente comprovada ou não demonstrada, só com evidência existente, e lista os próximos passos.
  - Há modelos mínimos de issue e de pull request em `.github/`.
  - Nenhum arquivo de aplicação, dependência ou dado foi alterado.
- **8B (concluído):**
  - O endpoint de saúde é somente leitura, existe só no servidor de desenvolvimento e aceita só conexão local, com as mesmas proteções dos demais endpoints administrativos.
  - Informa o estado operacional (por exemplo, a base válida e as contagens de serviços, versões e fontes) sem expor caminhos, token, conteúdo da base ou dados pessoais, e com erros genéricos.
  - A tela de saúde mostra o estado em linguagem clara, é acessível por teclado, responsiva e não aparece no `dist/`.
  - Testes automatizados cobrem sucesso, falha, origem, método e isolamento do build.
- **8C:**
  - O Playwright é adicionado como dependência de desenvolvimento somente neste passo, com aprovação expressa, e não entra no build.
  - Os fluxos críticos cobertos são: pergunta no chat público com resposta segura; catálogo e validação dos formulários da administração com abertura e "Voltar" da confirmação; `/admin/` e a rota administrativa ausentes no `preview`.
  - Os testes não gravam na base real (usam cópia temporária ou não confirmam gravação) e não dependem de rede externa.
  - A execução é reproduzível por um único comando documentado.
- **8D:**
  - README, arquitetura, administração, backlog e testes manuais refletem o estado real, com testes não executados marcados como tais.
  - As evidências (saída das verificações, contagem de testes e hashes dos commits) estão reunidas.
  - A retrospectiva registra o que foi concluído, o que ficou pendente e os ajustes de processo.

### Definition of Done

**Comum aos quatro passos:**

1. Escopo do passo cumprido e nada além dele.
2. Nenhuma alteração nos dados da LAC nem no que o chat público mostra, salvo o que o passo declara.
3. Nenhum segredo, token ou dado pessoal no código, nos testes, na documentação ou no Git.
4. `git diff --check` sem problemas e documentação do passo atualizada.
5. Revisão e aprovação da pessoa responsável antes do commit; commit de escopo objetivo, push sem `--force`, `main = origin/main` e `git status` limpo.

**Específica:**

- **8A:** Markdown conferido (títulos, links e blocos), sem referências externas, sem testes ou build exigidos.
- **8B:** `npm run validate:services`, `npm test`, `npm run build` e `node scripts/check-dist.js` executados e sem falhas, com `dist/` sem rota, tela ou conteúdo de saúde.
- **8C:** a suíte do Playwright passa em execução real, com a saída guardada como evidência; os demais testes e o build continuam passando; a dependência nova está justificada e registrada.
- **8D:** nenhuma afirmação sem evidência; pendências e riscos listados; Sprint encerrada com a retrospectiva.

### Riscos

- Administração local sem autenticação: não pode ser usada fora do ambiente de desenvolvimento.
- O Playwright baixa navegadores e exige ambiente preparado; falhas de ambiente não devem ser confundidas com falhas do sistema.
- O endpoint de saúde não pode vazar informação interna.

### Revisão e retrospectiva

Ao final da Sprint, registrar o que foi concluído, o que ficou pendente e o motivo, os riscos que mudaram e os ajustes de processo em `docs/METODOLOGIA_DESENVOLVIMENTO.md`.

## Sprint 2 — Engenharia assistida (skills, subagentes e MCP)

- **Objetivo:** apoiar o desenvolvimento com skills, subagentes e um servidor MCP local de consulta da base, sem alterar a aplicação, os dados da LAC nem o que o chat público mostra.
- **Entregas:** skills do projeto (`7459a28`), subagentes (`2875966`), MCP local somente leitura com quatro ferramentas (`d7fbc97`) e demonstração real (`d230773`).
- **Cancelado:** o Passo 2D (hook de proteção) foi cancelado por decisão da usuária e não foi implementado.
- **Verificação de fechamento:** validação da base, 570 testes (566 passaram, 4 ignorados), 13 testes e2e, build e `check-dist` sem falhas.
- **Evidências:** `docs/EVIDENCIAS_SPRINT_2.md` e `docs/EVIDENCIAS_MCP.md`.

## Sprint 3 — Informações do chatbot (blocos de conhecimento em rascunho)

- **Objetivo:** permitir cadastrar, editar e excluir, na administração local, informações em rascunho sustentadas por fontes oficiais, sem publicar nada e sem alterar o chat público.
- **Entregas:** modelo, validador e regras (`658edc1`), endpoints locais (`81ef0c3`), página `/admin/conteudo/` com conferência manual aprovada em 13/11/2026 (`0f071d1`) e fechamento com `check-dist` ampliado e evidências.
- **Verificação de fechamento:** validação da base, 623 testes (619 passaram, 4 ignorados por falta de permissão para links simbólicos), 27 testes e2e, build e `check-dist` sem falhas.
- **Fora do escopo:** IA, busca semântica, upload, publicação e criação automática de nova versão.
- **Transferido:** o cadastro guiado de assunto, serviço e fontes foi para a Sprint 4 (Issue #8).
- **Evidências:** `docs/EVIDENCIAS_SPRINT_3.md`.

## Sprint 4 — Gestão simples de conteúdo por serviço (concluída em 15/11/2026, Issue #8)

- **Objetivo:** cadastrar informação por serviço em um único caminho: escolher ou criar o serviço e adicionar texto, link novo ou fonte existente.
- **Fechamento (15/11/2026):** conferência manual aprovada e verificações finais executadas; evidências em `docs/EVIDENCIAS_SPRINT_4.md`. Nada foi publicado e o chat público não mudou.
- **Situação durante o replanejamento (15/11/2026):** o núcleo transacional do 4A (`e370b28`) é mantido. O 4B (interface do cadastro guiado) foi **reprovado na avaliação manual**; suas alterações não commitadas estão preservadas até decidir o que será reaproveitado ou substituído.
- **Escopo:** reproduzir as falhas contra o servidor real e registrar a causa; teste de integração real sem simular todas as rotas; entrada de demonstração ("Entrar como servidor de demonstração", token só em memória, aviso de que não é autenticação real); lista de serviços; serviço existente reutiliza o assunto relacionado; serviço novo tem o campo único "Tema" (selecionar ou digitar, sem identificador e sem etapa separada); sigla e termos equivalentes não são pedidos; tarefa "Adicionar informação" com texto original preservado, versionado e com hash; remoção do modo avançado, dos formulários paralelos, dos radios grandes e dos identificadores visíveis.
- **Fora do escopo:** revisão e publicação, links seguros, agente, busca, JSON público, "Mais opções", provedor de IA, upload, autenticação real, refatoração obrigatória das rotas.
- **Regras:** o texto ou link submetido não chega ao chatbot antes da revisão, autorização e publicação; o texto original é preservado internamente, versionado e com hash, e origina só sugestões de blocos; a interface orienta a não inserir dados pessoais nem conteúdo restrito; a forma de entrada é `formaEntrada: "texto" | "link"`.
- **A aprovar antes de implementar:** contrato de armazenamento do texto original (mudança de esquema, manifesto ou dados) e aproveitamento final das peças do 4B.
- **Passo 4B1 (modelo de dados e gravação de entradas de texto; sem interface, rotas ou reutilização de fonte):** `entradas.json` por versão, `formaEntrada` nas fontes (`texto_cadastrado`), módulos `services/admin/entradas.js` e `entradas-gravacao.js`, validador e testes `tests/entradas-*.test.js`; `descricao` do assunto opcional. Também: `arquivos.entradas` opcional em `versao-atual.js` e no MCP, `service.schema.json` atualizado e serviço novo nasce com `entradas.json` vazio. Registrado em docs/ARQUITETURA.md.
- **4B1, correção:** reutilização de links entre serviços (busca somente leitura, cópia em rascunho com `reutilizadaDe`, só link validado e não revogado; texto nunca) e proteção do MCP contra fonte textual não publicada. Reauditoria obrigatória antes de aprovar o 4B1. **Pendência impeditiva de commit:** o teste L23 (lista exata de `admin/`) depende da interface do 4B2.
- **Passo 4B2 (gestão simples por serviço):** `/admin/` com entrada de demonstração (não é autenticação real; token só em memória), serviços, tema único, Adicionar informação (texto, link novo, link já cadastrado), rotas novas com a trava comum, detecção de credenciais de alta confiança, interface do 4B reprovado removida e teste Playwright real (`npm run test:e2e:real`, Vite na porta 5183 com cópia temporária de `services/`). Conferência manual: funcionalidades e linguagem aprovadas; responsividade reprovada e corrigida (texto ampliado: grade da saúde com largura mínima em rem, rótulos de fonte sem quebra); conferência visual aprovada e Sprint fechada com a bateria completa, o build e o `check-dist`.
- **Aceite, testes e DoD:** na Issue #8.

## Sprint 5 — Revisão, aprovação humana e publicação (em andamento, Issue #11)

- **Objetivo:** revisar blocos, concluir a revisão (versão e hash congelados) e publicar em ação humana separada.
- **Regras:** só a versão expressamente aprovada, com os blocos aceitos e suas fontes, é publicada; a versão publicada anterior permanece ativa até a troca atômica; alteração posterior muda o hash e invalida análise e aprovação; "Servidor de demonstração" não comprova identidade.
- **Texto cadastrado:** o bloqueio atual das fontes textuais no assistente é provisório; blocos revisados e publicados derivados de texto poderão fundamentar respostas, sempre pelos blocos publicados (nunca `entradas.json`); o texto original continua isolado; resposta baseada só em texto não mostra fonte; resposta baseada em link mostra somente os links usados.
- **Passo 5A (domínio e hash, sem rotas nem interface):** hash canônico com `entradas.json`, congelamento da versão revisada, nova versão real com cópia independente, `versaoPublicadaId` podendo apontar para versão anterior e tabela pura de ações (`conteudo-versao.js`, `versao-arquivos.js`, `congelamento.js`, `nova-versao.js`, `fluxo.js`). Detalhes em `docs/ARQUITETURA.md`.
() => '- **Passo 5B1 (domínio, rotas e histórico da revisão, sem interface):** revisar fonte, aceitar e rejeitar bloco de conhecimento, pendências, concluir revisão (congela e grava o hash, sem autorizar nem publicar), nova versão e histórico privado (`revisao.js`, `revisao-servico.js`, `historico-revisao.js`, rotas em `admin-endpoint.js`). O 5B2 traz a interface dentro de `/admin/`. Detalhes em `docs/ARQUITETURA.md`.\n- **Exige:** atualizar' `CLAUDE.md`, a documentação e os testes de isolamento (hoje não há publicação pela interface) e promover blocos, fontes e registro na mesma transação.

## Sprint 6 — Links seguros e agente integrado (planejada)

- **Objetivo:** verificar links de forma determinística (https, sem rede privada, localhost ou metadados, inclusive após redirecionamentos; limites de tempo, tamanho e tentativas) e analisar texto e links por agente que só sugere.
- **Antes:** estudo técnico curto do provedor de IA (custo, privacidade, limites, infraestrutura). Sem adaptador falso apresentado como agente real. Análise assíncrona em duas fases, sem fila ou banco, se justificada.

## Sprint 7 — Busca e respostas inteligentes (planejada)

- **Objetivo:** o chat localiza blocos publicados e formula respostas, informando quando a base não basta.
- **Origem:** só os links efetivamente usados; texto cadastrado sem fonte pública; rastreabilidade interna (versão, hash, origem, blocos) obrigatória.
- **Entrega:** JSON público gerado somente com a versão publicada; cada nova publicação exige nova geração do build.

## Sprint 8 — Endurecimento e evidências (planejada)

- **Objetivo:** saúde com estado "não aplicável", acessibilidade, evidências e demonstração confiável do MVP.
