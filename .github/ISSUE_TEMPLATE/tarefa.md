---
name: Tarefa
about: Item de trabalho com escopo, critérios de aceite e Definition of Done
title: "[Tarefa] "
labels: []
---

## Contexto

<!-- Por que este item existe? Referencie o backlog (docs/BACKLOG.md) ou a Sprint (docs/SPRINTS.md). -->

## Objetivo

<!-- O que deve estar verdadeiro quando o item terminar. -->

## Escopo

- [ ] Dentro do escopo:
- [ ] Fora do escopo:

## Critérios de aceite

- [ ]
- [ ]

## Conteúdo ou dados envolvidos

- [ ] Não altera dados reais da base
- [ ] Altera dados reais (exige autorização expressa, descrita aqui):

## Segurança e privacidade

- [ ] Nenhum segredo, token ou dado pessoal
- [ ] Nada de administração ou conteúdo de teste no `dist/`

## Definition of Done

- [ ] Testes automatizados passando e sem regra anterior enfraquecida
- [ ] `npm run validate:services`, `npm test`, `npm run build`, `node scripts/check-dist.js` e `git diff --check`
- [ ] Documentação e testes manuais atualizados
- [ ] Revisão e aprovação antes do commit
