# Instruções permanentes do projeto

## Propósito

Construir o **SEMA Orienta**, assistente conversacional fundamentado em informações oficiais cadastradas. O MVP cobre somente a LAC, mas o código deve aceitar novos serviços por configuração.

## Regras de escopo

1. O usuário deve poder escrever perguntas livres; não iniciar com formulário ou questionário obrigatório.
2. Perguntas de esclarecimento são permitidas apenas quando necessárias para identificar a intenção ou evitar resposta imprecisa.
3. A IA só pode usar a base cadastrada para orientar sobre serviços ambientais.
4. Toda orientação material deve indicar a fonte oficial correspondente.
5. Conteúdo ausente ou não validado deve permanecer `PENDENTE` e nunca ser inventado.
6. O SEMA Check é um checklist declarativo; não recebe nem valida documentos no MVP.
7. O sistema não decide elegibilidade, não aprova licença e não substitui a análise da SEMA.
8. O sistema não deve solicitar dados pessoais para prestar a orientação do MVP.
9. Não persistir conversas, perguntas ou dados do usuário.

## Regras técnicas

- manter a chave da IA exclusivamente no servidor;
- nunca inserir segredos no código, no navegador, no Git ou em evidências;
- acessar o provedor de IA por uma interface adaptadora;
- separar conteúdo, regras de negócio, integração com IA e interface;
- cadastrar cada serviço em pasta própria e em um registro central;
- validar a saída do modelo antes de enviá-la ao navegador;
- usar português claro e linguagem cidadã;
- criar interface responsiva, navegável por teclado e com rótulos acessíveis;
- implementar em pequenos marcos testáveis;
- registrar commits com escopo objetivo;
- não afirmar que um teste passou sem executá-lo e guardar evidência compatível.

## Segurança da resposta

Se a base não sustentar a resposta, informar a limitação e direcionar para o canal oficial cadastrado. Nunca preencher lacunas com conhecimento geral do modelo.

## Aprovação de conteúdo

Procedimentos, legislação, documentos, links e contatos só entram como conteúdo público após validação da área competente. A data de revisão e o status de validação devem acompanhar cada serviço.

## Arquitetura (resumo)

Vite com JavaScript puro, sem framework, sem banco de dados e sem backend de produção. Detalhes em `docs/ARQUITETURA.md` e `docs/ADMINISTRACAO.md`.

- `index.html` e `src/`: interface pública do chat (cidadão). Não conhece a administração.
- `services/`: base de conteúdo. `registry.json` (catálogo de serviços), `assuntos.json`, `schemas/` (documentação dos formatos) e `<serviço>/versoes/v<N>/` (um manifesto `versao.json` e arquivos modulares: `service.json`, `roteiro.md`, `documentos.json`, `perguntas-frequentes.json`, `fontes.json`, `conteudo-assistente.json`).
- `services/assistant-*.js` e `src/assistant.js`: assistente em teste local, sem IA externa; o modo público segue sem conteúdo.
- `services/admin/` e `admin/`: módulo administrativo **local**, só no servidor de desenvolvimento. Cadastro de assunto, serviço e fonte, com ids gerados pelo servidor, versões, hashes, escrita atômica e desfazer.
- `scripts/validate-services.js` valida a base; `scripts/check-dist.js` garante que o build público não contém conteúdo de teste nem administrativo.
- `tests/`: testes automatizados (`node --test`, sem bibliotecas externas), sempre em cópias temporárias fora do repositório quando gravam arquivos.

## Comandos

- `npm run dev`: servidor de desenvolvimento (use sem `--host`); a administração fica em `http://localhost:5173/admin/`.
- `npm test`: bateria completa de testes.
- `npm run validate:services`: valida a base de serviços.
- `npm run build` e depois `node scripts/check-dist.js`: build de produção e conferência do `dist/`.
- `npm run preview`: serve o `dist/`; nele não existe endpoint, administração nem conteúdo de teste.
- `git diff --check`: antes de todo commit.

## Limites atuais

- Só a LAC tem conteúdo; ele está **em validação e não publicado**. Nenhuma validação material ou publicação foi autorizada.
- Não há IA externa, API de produção, autenticação, banco de dados nem persistência de conversas.
- A administração é local e **sem autenticação**: o token só impede uso por outro site aberto no navegador; não comprova identidade.
- Decisões com identificação pessoal ficam fora do Git (`data/admin-private/` está no `.gitignore`; nada é criado ali por enquanto).
- Não há edição, exclusão, validação, decisão ou publicação pela interface administrativa.

## Segurança (permanente)

- Nenhum segredo, token ou dado pessoal no código, nos testes, na documentação, no `dist/` ou no Git.
- O token administrativo vive só em memória; endpoints administrativos existem apenas com `apply: 'serve'`, aceitam só conexão local e não registram corpo, token ou dados em log.
- Entradas externas são validadas no servidor; erros são genéricos, sem caminhos nem conteúdo.
- Gravações administrativas são tudo ou nada (ensaio, escrita atômica, conferência, desfazer), uma por vez.
- Interface sem `innerHTML`, `localStorage`, `sessionStorage` nem cookies; textos montados com `textContent`.
- Nunca usar `git push --force`.

## Regras de trabalho com o assistente de código

1. Um passo por vez, com escopo declarado; não misturar passos nem implementar o seguinte sem pedido.
2. Antes de começar, conferir `git status`, branch e sincronização; se houver alterações pendentes de outro passo, parar e informar.
3. Ler só o que o passo exige; não varrer o repositório sem necessidade.
4. Não executar testes ou build além do pedido e nunca afirmar resultado sem executar. Relatar falhas com a saída real.
5. Não fazer `git add`, commit ou push sem pedido expresso. Ao publicar, preparar só os arquivos do passo, rodar `git diff --cached --check`, conferir ausência de segredos e dados pessoais e arquivos indevidos (`dist/`, `node_modules/`, `.env`, `data/`, e em `.claude/` tudo o que não seja skill, agente ou `settings.json` revisado) e confirmar `main = origin/main`.
6. Commits com mensagem objetiva em português (`feat:`, `docs:`, `fix:`) e o trailer de coautoria exigido pela ferramenta.
7. Dados reais da base só mudam com autorização; testes nunca gravam na base real. Se um teste manual criar dados, restaurar pelo Git antes de seguir.
8. Não registrar teste manual como aprovado sem evidência da execução. Separar o que foi conferido pela usuária do que só os testes automatizados cobrem.
9. Servidor local: iniciar só se pedido, sem `--host`, e encerrar apenas o processo do Vite deste repositório.
10. Mudança no que o chat público mostra, em dependências ou em dados exige pedido explícito.

## Recursos do assistente de código no repositório

- Skills (`.claude/skills/`), agentes (`.claude/agents/`) e `.claude/settings.json` revisados podem ser versionados, como qualquer arquivo do projeto, em passo próprio e com revisão.
- Configurações locais (`.claude/launch.json`, `.claude/settings.local.json`), caches, tokens, segredos e arquivos pessoais continuam proibidos no Git.
- Não usar `git add -f` como fluxo normal: se algo que deveria ser versionado aparecer como ignorado, corrigir o `.gitignore`.

## Documentação

`README.md` (visão geral), `docs/REQUISITOS.md`, `docs/REGRAS_ASSISTENTE.md`, `docs/ARQUITETURA.md`, `docs/ADMINISTRACAO.md`, `docs/BACKLOG.md`, `docs/TESTES_MANUAIS.md`, `docs/METODOLOGIA_DESENVOLVIMENTO.md` e `docs/SPRINTS.md`. Atualizar a documentação do passo no mesmo ciclo em que ele é concluído.
