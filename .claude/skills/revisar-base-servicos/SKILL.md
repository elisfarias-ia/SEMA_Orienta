---
name: revisar-base-servicos
description: Revisa a base de serviços do SEMA Orienta (services/: registry.json, assuntos.json, versões, referências, fontes e estado de publicação) e confere o bloqueio de conteúdo não publicado ou não validado. Use quando o usuário pedir revisão da base, da LAC, das fontes, das versões ou de um novo serviço. Só relata; não altera dados e nunca inventa conteúdo ambiental.
allowed-tools: Read, Grep, Glob, Bash(git diff:*), Bash(git status:*), Bash(npm run validate:services)
---

# Revisar a base de serviços

Revisão somente de leitura. Dados reais da base só mudam com autorização expressa. Nunca completar lacunas com conhecimento geral: o que a base não traz continua `PENDENTE`.

## Escopo

`services/registry.json`, `services/assuntos.json`, `services/schemas/`, `services/<serviço>/versoes/v<N>/` (`versao.json`, `service.json`, `roteiro.md`, `documentos.json`, `perguntas-frequentes.json`, `fontes.json`, `conteudo-assistente.json`) e os módulos `services/assistant-*.js`.

## Checklist

1. **Registro e assuntos:** cada serviço do registro aponta para um assunto ativo (`assuntoId`) e para um `service.json` existente; ids únicos e sem colisão.
2. **Versões:** `versao.json` coerente com a pasta (`id`, `servicoId`, `numero`, `baseadaEm`), versão atual existente e `versaoPublicadaId` conforme o estado real (hoje, nulo).
3. **Referências:** todo `fonteId` citado em roteiro, documentos, perguntas e blocos existe em `fontes.json`; nenhum arquivo modular ausente do manifesto.
4. **Fontes:** cada fonte oficial tem identidade, procedência e metadados; validar a fonte não confirma a vigência da norma nem a atualização do conteúdo.
5. **Publicação:** só conteúdo com status `validado` e `publicado: true` pode chegar ao modo público; o modo `publico` do assistente retorna zero blocos enquanto nada estiver publicado; conteúdo `teste_local` não vai para o `dist/`.
6. **Bloqueio de não publicado:** itens em `rascunho`, `em_validacao` ou com `PENDENTE` não aparecem em respostas públicas; conferir `selecionarBlocosAssistente` e os testes que garantem isso.
7. **Conteúdo pendente:** documentos, prazos, taxas, validade, contatos e unidade responsável não podem ter valor inventado; marcar o que está ausente.
8. **Dados pessoais:** nenhum e-mail, telefone ou nome de pessoa em arquivos da base ou de teste.
9. **Hashes e fluxo de versão:** quando houver conteúdo validado, conferir o hash do conteúdo e o fluxo de estados (`services/admin/fluxo.js`, `hash.js`).

## Como verificar

Ler os arquivos e, se útil, executar `npm run validate:services` (somente leitura). Citar sempre arquivo e campo. Não rodar o servidor nem a administração para gravar nada.

## Relatório

Achados por gravidade (bloqueia / deve corrigir / sugestão), cada um com arquivo, campo e a regra violada. Listar o que ficou `PENDENTE` e depende da área competente, sem propor texto ambiental. Dizer o que não foi conferido. Não alterar nenhum arquivo.
