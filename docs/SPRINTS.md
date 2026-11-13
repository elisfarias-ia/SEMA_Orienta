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
| 8A | `CLAUDE.md`, metodologia e templates Git | Regras permanentes, técnicas com situação e evidências, modelos de issue e de pull request | — |
| 8B | Endpoint e tela de saúde | Estado operacional do sistema, visível só no ambiente local de desenvolvimento | **Concluído** (13/11/2026) |
| 8C | Playwright dos fluxos críticos | Testes de ponta a ponta do chat público, da administração local e da ausência da administração no build | Pendente |
| 8D | Documentação, evidências e fechamento | Documentos atualizados, evidências reunidas e retrospectiva da Sprint | Pendente |

**Situação da Sprint:** aberta. O 8B foi concluído; a bateria completa, o build e o `check-dist` ficam para o fechamento da Sprint, depois do Playwright (8C).

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
