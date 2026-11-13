---
name: revisar-interface-sema
description: Revisa a interface do SEMA Orienta (chat público em index.html e src/, e a administração local em admin/ e admin/saude/) quanto a acessibilidade, contraste, responsividade em 390 px, teclado, foco visível e regressões. Use quando o usuário pedir revisão de tela, de layout, de acessibilidade ou conferência visual. Só relata; não altera arquivos sem pedido.
allowed-tools: Read, Grep, Glob, Bash(git diff:*), Bash(git status:*)
---

# Revisar a interface do SEMA Orienta

Revisão somente de leitura. Não edita arquivos, não instala nada e não grava dados. Só altera o que o usuário pedir depois, em passo separado.

## Escopo

- Chat público: `index.html`, `src/main.js`, `src/chat.js`, `src/assistant.js`, `src/styles.css`.
- Administração local: `admin/index.html`, `admin/admin.js`, `admin/admin-logic.js`, `admin/styles.css`, `admin/saude/`.
- Limite para a mudança em análise: começar por `git diff` quando houver alterações pendentes.

## Checklist

1. **Linguagem e rótulos:** português claro e cidadão; todo campo com `label`; botões com nome acessível; ícones decorativos com `aria-hidden`.
2. **Teclado:** ordem de foco coerente, nada que prenda o foco, atalhos descritos (Enter envia, Shift+Enter muda de linha), foco devolvido a um lugar lógico depois de ações (por exemplo, ao reiniciar).
3. **Foco visível:** `:focus-visible` com contorno claro em todos os elementos interativos, inclusive o link para pular ao conteúdo.
4. **Contraste:** texto normal com razão mínima de 4,5:1 e texto grande ou componentes com 3:1, incluindo estados (desabilitado, erro, foco, faixa de teste, avisos).
5. **Responsividade:** conferir em 390 px de largura e em computador; sem rolagem horizontal da página; textos longos quebram; alvos de toque com tamanho confortável.
6. **Regiões vivas e estados:** `role="status"`, `aria-live`, `aria-busy` e mensagens de erro ligadas aos campos por `aria-describedby`.
7. **Segurança da interface:** sem `innerHTML`, `localStorage`, `sessionStorage` nem cookies; texto montado com `textContent`; links externos só `https` com `rel="noopener noreferrer"`.
8. **Isolamento:** a interface pública não conhece a administração; ids técnicos, caminhos, tokens e erros internos não aparecem na tela.
9. **Regressões:** comparar com o comportamento esperado em `docs/TESTES_MANUAIS.md` e com os testes em `e2e/` e `tests/`.

## Como verificar

Preferir leitura do código e dos estilos. Conferência no navegador só com o servidor já iniciado pelo usuário ou quando ele pedir; nesse caso, sem `--host`, sem enviar formulários e sem gravar dados.

## Relatório

Lista curta por gravidade (bloqueia / deve corrigir / sugestão), cada item com arquivo e linha, o que foi observado e a correção proposta. Dizer explicitamente o que não foi conferido (por exemplo, contraste medido só por leitura de cores, sem ferramenta). Não aplicar correções.
