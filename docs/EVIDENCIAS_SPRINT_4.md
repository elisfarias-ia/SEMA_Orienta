# Evidências da Sprint 4 — gestão simples de conteúdo por serviço

- **Data do fechamento:** 15/11/2026
- **Issue:** #8 (Sprint 4 — gestão simples de conteúdo por serviço)
- **Branch:** `feature/sprint-4-cadastro-guiado` (a partir de `main` em `ee0cffd`)
- **Commits:** 4A `e370b28` (cadastro guiado atômico) e o commit de fechamento "feat: simplifica gestão de conteúdo por serviço" (4B1 e 4B2).

## Aviso sobre o alcance

Esta Sprint cria a **gestão de conteúdo em elaboração por serviço** na administração local. **Nada foi publicado, validado materialmente ou autorizado**, e **o chat público não mudou**. O agente automático de análise, a publicação e o chat inteligente **ainda não existem** (Sprints 5 a 8). O conteúdo da LAC continua em validação e não publicado, e nenhum dado real da LAC foi alterado.

## O que foi entregue

- **Gestão simples por serviço** (`/admin/`, só no `npm run dev`): pesquisar ou criar serviço e adicionar informação como texto, link novo ou link já cadastrado, com a lista das informações em elaboração.
- **Entrada local de demonstração** ("Entrar como servidor de demonstração"): **não é autenticação real**; sem usuário, senha, cookie, `localStorage` nem `sessionStorage`. O token vive só em memória, e recarregar ou sair exige nova entrada.
- **Tema:** serviço novo pede só o nome e um único campo "Tema" (escolher existente ou digitar novo, reaproveitando o existente sem diferença de acento ou maiúscula). Serviço existente reutiliza o tema. Nenhum identificador aparece na interface; os ids são gerados pelo servidor.
- **Texto:** `entradas.json` por versão (4B1), com o hash SHA-256 do texto exato, limites de tamanho, recusa de e-mail, telefone e credenciais, e fonte textual correspondente (1:1). O texto original fica isolado: não vai para o chat, o MCP nem o `dist/`.
- **Link novo** (fonte atual) e **reutilização de link**: o cliente envia só `servicoId` e `fonteId`; o servidor relê a fonte do disco. Só link validado e não revogado de outro serviço é elegível; a cópia nasce em rascunho, com `reutilizadaDe`, e exige nova revisão. Fonte textual nunca é reutilizável. A origem não é alterada.
- **Gravação:** transação atômica com ensaio, rollback e `desfazer_incompleto`; todas as gravações passam pela mesma trava (uma por vez, 409 `operacao_em_andamento`).
- **MCP:** `consultar_fontes` omite por completo fonte textual não publicada.
- **Credenciais:** recusa de alta confiança (atribuições explícitas, `Bearer` com token, `senha` com valor), aplicada a título, descrição e texto; frases comuns são aceitas.
- **Reprovação do 4B:** a primeira interface do cadastro guiado foi reprovada na conferência manual e **substituída** pela nova experiência; `admin/cadastro/`, seu teste de interface e o e2e que simulava todas as rotas foram removidos. As regras úteis (token em memória, códigos de erro, clique duplo, foco, regiões vivas, nada gravado ao abrir, isolamento) foram mantidas em testes novos.
- **Teste Playwright real:** `npm run test:e2e:real`, com Vite em porta própria (5183) e cópia temporária de `services/`, sem simular rotas, comparando o hash da base real antes e depois.

## Conferência manual (15/11/2026)

Funcionalidades aprovadas; linguagem aprovada após a substituição dos textos; responsividade reprovada inicialmente (texto ampliado: largura mínima em `rem` na grade de saúde, palavras longas nos rótulos de fonte e título do diálogo) e **aprovada após a correção**; entrada e saída da demonstração aprovadas; demais fluxos sem nova ressalva. Registro em `docs/TESTES_MANUAIS.md`.

## Verificações finais (executadas)

| Verificação | Resultado | Evidência |
|---|---|---|
| `npm run validate:services` | PASSOU | sem erros (serviço lac) |
| `npm test` | PASSOU | 736 testes, 732 passaram, 0 falharam, 4 ignorados (link simbólico: o Windows negou `EPERM`; marcados "NÃO TESTADO" nos próprios testes) |
| `npm run test:e2e` | PASSOU | 29 de 29 |
| `npm run test:e2e:real` | PASSOU | 24 de 24 (fluxos reais e responsividade em desktop, 390 px e texto a 150% e 200%) |
| `npm run build` | PASSOU | `dist/` gerado |
| `node scripts/check-dist.js` | PASSOU | "dist/ limpo: 151 termos verificados, nenhuma ocorrência" |
| Testes de isolamento que dependem do `dist/` | PASSOU | 149 testes, 148 passaram, 1 ignorado (link simbólico) |
| `git diff --check` | PASSOU | sem problemas (só avisos de LF/CRLF) |

Falhas encontradas e corrigidas no fechamento (todas causadas pela Sprint 4): três testes com listas exatas ou varredura de dados pessoais (`AD21`, `V18`, `C1`) e uma quebra de linha do título do diálogo de confirmação a 200% de texto.

## Auditorias

O `auditor-sema` reauditou o 4B1 (aprovado com ressalvas, sem bloqueantes) e o 4B2 (aprovado com ressalvas, sem bloqueantes nem importantes).

## Limitações e melhorias futuras

- Entrada de demonstração sem autenticação real; administração só local.
- Textos e links ainda não são revisados, aprovados nem publicados (Sprint 5); o assistente não usa `entradas.json`.
- O hash da versão ainda não inclui `entradas.json` (Sprint 5); `copiarEntradasParaNovaVersao` não está ligada a nenhuma nova versão.
- Achados menores da auditoria: recusa de `senha: ...` em prosa; `pwd=`, `Authorization: Basic` e `access_key` não cobertos; "Bearer authentication" pode ser recusado; `orgaoResponsavel`, nome do serviço e nome do tema não passam pela checagem de credencial; a regra de credencial também vale ao validar a base; falta teste de fonte textual publicada no MCP; `reutilizadaDe.servicoId` igual ao próprio serviço não é conferido pelo validador.
- O link "Cadastro da base" na navegação de `admin/conteudo/` e `admin/saude/` ainda usa o nome antigo.
- Sprints 5 a 8 (revisão e publicação, links seguros e agente, busca e chat inteligente, endurecimento) seguem como backlog futuro (`docs/SPRINTS.md`).
