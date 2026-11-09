# Revisão técnica da base da LAC — conteúdo em validação

**Data:** 09/11/2026
**Escopo:** `services/lac/` (serviço, roteiro, documentos, perguntas frequentes e fontes), esquema e validador.

> Esta é uma revisão técnica e documental. Ela **não confirma a vigência de nenhuma norma**, **não representa aprovação jurídica ou validação da área competente** e **não aprova nenhum conteúdo para atendimento ao cidadão**. Nenhum status foi alterado e nada foi publicado.

## 1. Objetivo

Verificar, antes de qualquer decisão de publicação:

- a organização da base;
- a rastreabilidade de cada conteúdo até a fonte cadastrada;
- a coerência entre roteiro, documentos, perguntas e fontes;
- os riscos de desatualização;
- as condições de publicação;
- as pendências de validação.

Nesta documentação, "validado" em uma fonte significa somente que sua **identidade, procedência e metadados** foram conferidos para fins de teste (`fontes.json`, campo `statusValidacao`). Não significa que o conteúdo esteja atualizado nem que a norma esteja vigente.

## 2. Estado atual

Números confirmados nos arquivos em 09/11/2026:

| Item | Valor | Arquivo |
|---|---:|---|
| Serviço LAC | `em_validacao`, `publicado: false` | `registry.json`, `service.json` |
| Fontes | 8 | `fontes.json` |
| Etapas do fluxo | 15 | `service.json` (`etapas`), `roteiro.md` (seção "Etapas") |
| Documentos do checklist | 28 | `documentos.json` |
| Perguntas frequentes | 21 | `perguntas-frequentes.json` |
| Documentos disponíveis ao assistente | 0 | função `documentosDisponiveisParaAssistente` |
| Perguntas disponíveis ao assistente | 0 | função `perguntasDisponiveisParaAssistente` |

Responsável pela validação e data de revisão do serviço continuam vazios (`service.json`: `responsavelValidacao: null`, `dataRevisao: null`), o que confirma que não há validação material pela área competente registrada.

## 3. Fontes

"Validação" = identidade, procedência e metadados. Nenhuma fonte está publicada (`publicado: false` nas oito).

| Fonte (`fonteId`) | Tipo | Origem oficial | Validação | Publicada | Situação / atualidade | Uso atual |
|---|---|---|---|---|---|---|
| `sema-orientacoes-lac` | página oficial | sim | identidade e procedência | não | documento de 24/11/2020; atualidade pendente; cita norma registrada como revogada | única fonte lida que sustenta campos do `service.json` e seções do `roteiro.md` |
| `lei-complementar-668-2020` | legislação | sim | identidade e procedência | não | vigência `a_confirmar`; texto não conferido | registro histórico em `legislacao`; não sustenta conteúdo |
| `decreto-695-2020` | legislação | sim | identidade e procedência | não | **revogada** (registrada; revogação vinculada ao `decreto-1268-2022`, texto não conferido) | somente histórico; bloqueada; fora de `referencias` |
| `decreto-1268-2022` | legislação | sim | identidade e procedência | não | `alterada` (pelo `decreto-1585-2022`); consolidação a confirmar; texto não conferido | fonte registrada da revogação do Decreto 695; bloqueada |
| `decreto-1585-2022` | legislação | sim | identidade e procedência | não | vigência `a_confirmar`; texto não conferido | registro; não sustenta conteúdo |
| `tr-176-lac` | documento (outro) | sim | identidade e procedência | não | documento de 2020; atualidade material pendente; lido integralmente | base dos 28 itens do checklist |
| `manual-lac-siga-2020` | manual | sim | identidade e procedência | não | documento de 2020; **não foi possível abri-lo** na auditoria; atualidade pendente | registro; não sustenta nenhum campo |
| `faq-lac-2022` | documento (outro) | sim | identidade e procedência | não | documento de 2022; atualidade material pendente; lido integralmente | base das 21 perguntas |

Distinções importantes:

- **Identidade e procedência validadas:** as oito fontes.
- **Conteúdo material ainda não validado:** todas.
- **Vigência jurídica pendente:** `lei-complementar-668-2020`, `decreto-1268-2022` (alterada) e `decreto-1585-2022`.
- **Norma revogada:** `decreto-695-2020`. Não é apresentado como vigente em nenhum conteúdo cadastrado (busca em `roteiro.md`, `service.json`, `documentos.json` e `perguntas-frequentes.json`; a única menção é o alerta de revogação em `roteiro.md`, seção "Observações").
- **Fontes documentais com atualidade pendente:** `sema-orientacoes-lac`, `tr-176-lac`, `manual-lac-siga-2020` e `faq-lac-2022`.
- **Texto das normas:** os textos dos Decretos 1.268 e 1.585 e da Lei Complementar 668 não puderam ser lidos na auditoria automática (páginas sem o texto).

## 4. Descrição e roteiro

**Origem:** `service.json` (`descricao`, `publico`, `condicoes`, `etapas`) e `roteiro.md` (sete seções). Todo o conteúdo se apoia apenas em `sema-orientacoes-lac` (`service.json`, campo `referencias`), uma página publicada em 24/11/2020.

**Síntese:**

- A LAC é descrita como modalidade de licenciamento ambiental, com solicitação digital pelo SIGA (`service.json`, `descricao`), com a ressalva de que a legislação aplicável e sua vigência precisam de confirmação.
- O público é descrito de forma prudente ("empreendedores"), e o texto registra que a página não define quem pode solicitar (`service.json`, `publico`).
- O roteiro descreve um **fluxo de referência de 15 etapas** (`roteiro.md`, seção "Etapas").
- O sistema **não decide enquadramento** e **não promete aprovação, prazo ou emissão** (`service.json`, `condicoes` 1 e 3; `roteiro.md`, seções "Condições" e "Observações").

**Situação das 15 etapas** (conferência feita contra a página de 2020, na revisão do Passo 1):

| Resultado | Etapas |
|---|---|
| confirmadas | 1, 2, 3, 5, 6, 7 e 11 |
| confirmadas parcialmente (texto ajustado à fonte) | 4, 8, 9, 10 e 14 |
| possivelmente desatualizadas | 12, 13 e 15 |

Riscos: as telas, os nomes de opções e o fluxo do SIGA são de 2020; o manual não pôde ser conferido; a página cita uma norma de enquadramento registrada como revogada. O fluxo atual do SIGA e a norma atual de enquadramento precisam de confirmação da área competente (`service.json`, `pendencias`: `fluxoAtualDoSIGA`, `normaDeEnquadramentoAtual`).

## 5. Checklist documental

**Origem:** `documentos.json`, a partir do TR nº 176 (`tr-176-lac`), documento de 2020.

- 28 itens em cinco grupos: empreendedor e empreendimento (14), responsável técnico (4), imóvel (1), documentos específicos (7) e estudos, planos, projetos e programas (2).
- Todos `em_validacao`, `publicado: false`, `revisaoAtualidade: pendente` e `obrigatorio: null` (obrigatoriedade atual **não confirmada**, o que não significa dispensa).
- 21 itens são condicionais, conforme o próprio TR; `condicional` descreve a condição do TR de 2020 e não confirma a obrigatoriedade atual.
- 13 itens têm alertas específicos; 15 itens não têm alerta (lista vazia).

**Principais pontos de atenção** (todos como alertas, nenhum como exigência atual):

| Ponto | Itens do TR | Observação |
|---|---|---|
| cópia autenticada | 1.1.1, 1.1.2 e critérios da ART (2.2) | exigência de autenticação a confirmar |
| firma reconhecida | 1.4.1 e 2.1 | exigência a confirmar |
| "RH" em vez de "RG" | 1.2.5 | erro material aparente; redação da fonte não corrigida |
| nome de arquivo incoerente | 1.3.2 | nome parece ser de outro assunto |
| mistura de LAS, RLAS, RLAC e LAC | 2.2 | possível reaproveitamento de outro modelo de TR |
| Decreto nº 697/2020 não cadastrado | 3 | vigência e aplicabilidade a confirmar |
| publicação em periódico e Diário Oficial | 4.2 | exigência a confirmar |
| Licença Ambiental Única e SIMCAR | 4.7 | validação atual necessária |
| e-mails e WhatsApp do requerente | 4.1 | meios de contato e formato do requerimento a confirmar |
| aplicação condicional dos estudos e projetos | 5.1 e 5.2 | "caso houver", "se for pertinente", "em caso de", "caso haja" |

## 6. Perguntas frequentes

**Origem:** `perguntas-frequentes.json`, a partir do FAQ de 2022 (`faq-lac-2022`).

- 21 perguntas: as 18 numeradas e as perguntas i, j e k das observações.
- Todas `em_validacao`, `publicado: false`, `revisaoAtualidade: pendente` e `respostaPublicavel: null`; todas indisponíveis ao assistente.
- `conteudoFonte` é registro histórico ("O FAQ de 2022 informa que…") e nunca é usado pelo assistente.
- Contatos não são armazenados; os contatos do FAQ aparecem apenas como "contato institucional que precisa ser atualizado".
- Bloqueios: desatualização (12 perguntas), fonte complementar (10), procedimento do sistema (7), informação variável (5), vigência (4), contato desatualizado (4), enquadramento dependente de análise (4) e conflito com a base (2). Só a pergunta 2 não tem bloqueio específico, mas continua indisponível.

**Itens que aparecem somente como risco ou pendência, nunca como informação atual:**

- prazo médio citado (pergunta 7) e validade citada (pergunta 8);
- quantidade de UPFs (pergunta 14);
- menus e botões do SIGA (perguntas 11, 12, 13 e 15);
- enquadramento (perguntas 4, 16, i e j);
- contatos (perguntas 4, 10, i e k);
- Decreto nº 697/2020 (pergunta 18);
- Resolução CONSEMA nº 41/2021 (perguntas 6 e j);
- numeração "Lei complementar 688/2021", encontrada no FAQ e ainda não confirmada (pergunta 4).

**Conflitos com o roteiro e o TR:** pergunta 3 × item 4.3 do TR; pergunta 15 × roteiro (cobrança); perguntas 10 e 11 (possível ideia de emissão automática); pergunta 4 (decisão de enquadramento). Detalhes na seção 8.

## 7. Observações a até h do FAQ

**Origem:** FAQ de 2022 (`faq-lac-2022`), seção "Observações". Foram relidas no PDF oficial, baixado para pasta temporária fora do repositório. **Não foram cadastradas** como perguntas nem como regras, e não estão em `conteudoFonte` das 21 perguntas.

**Critério de risco:**

- **alto:** pode alterar se a LAC é a modalidade cabível ou envolve efeito financeiro, com norma ou canal não cadastrado;
- **médio:** exigência documental ou procedimento que depende de TR ou fonte de 2020, ou de norma não cadastrada, sem alterar a possibilidade de usar a LAC;
- **baixo:** orientação de cadastro, sem efeito sobre enquadramento, valor ou prazo, e coerente com a base.

| Observação | Tema | Relação com a base | Risco | Ação recomendada |
|---|---|---|---|---|
| a | representação legal | complementa os itens 1.4 e 2.0 do TR (itens 1.4.1 a 1.4.3 e 2.1 a 2.4 de `documentos.json`) | médio | confrontar com o checklist na revisão da área; não criar exigência nova |
| b | vínculo com o imóvel | complementa o item 3 do TR, que depende de norma não cadastrada | médio | aguardar a confirmação da norma do imóvel antes de qualquer uso |
| c | áreas protegidas | conteúdo novo, sem equivalente na base | médio | submeter à área competente; manter bloqueada |
| d | Terras Indígenas | conteúdo novo; indica caso em que a LAC não seria cabível e outro canal de protocolo, com um TR (nº 177) não cadastrado; diverge do roteiro, que descreve a solicitação pelo SIGA sem essa exceção | alto | decisão da área competente sobre a exceção; não cadastrar o TR nº 177 sem autorização |
| e | isenção | conteúdo novo sobre taxa; cita duas normas não cadastradas | alto | analisar as normas de isenção na fase seguinte; manter bloqueada |
| f | cadastro de pessoa jurídica | coerente com o item 1.2.1 do checklist (contrato social) | baixo | conferir com o checklist; candidata a revisão simples |
| g | publicação | detalha o item 4.2 do TR, que já tem alerta | médio | confirmar a exigência atual de publicação |
| h | nome na licença | complementa a pergunta 9 (correção após a emissão); informa que a licença não admite correção | médio | confirmar o procedimento atual; manter bloqueada |

Resumo: 2 observações de risco alto, 5 de risco médio e 1 de risco baixo.

## 8. Conflitos e inconsistências

Nenhum conflito foi resolvido por inferência. O "risco" segue a escala: alto = pode levar a orientação errada sobre enquadramento ou norma; médio = exigência ou procedimento; baixo = redação ou erro material.

| Id | Origem | Conflito ou inconsistência | Impacto (risco) | Tratamento atual | Decisão necessária |
|---|---|---|---|---|---|
| C01 | `sema-orientacoes-lac`; `roteiro.md` ("Condições", "Observações") | página de 2020 cita norma de enquadramento registrada como revogada | alto | não usada como fundamento; alerta no roteiro; revogação vinculada ao `decreto-1268-2022` (texto não conferido) | confirmar a revogação e a norma atual de enquadramento |
| C02 | `service.json` (`etapas`); `roteiro.md` ("Etapas") | fluxo do SIGA descrito é de 2020; manual não conferido | médio | marcado como referência; etapas 12, 13 e 15 "possivelmente desatualizadas" | confirmar telas e fluxo atuais |
| C03 | pergunta 3; item 4.3 do TR | o FAQ diz que o protocolo de outorga não basta; o TR admite o protocolo | médio | bloqueio `conflito_com_base` | área competente decidir a exigência atual |
| C04 | pergunta 4 | o FAQ afirma que atividade fora do decreto "não é passível de licenciamento", o que é decisão de enquadramento | alto | bloqueio de enquadramento; alerta de que o assistente não pode usar a afirmação | definir como orientar sobre atividades não enquadradas |
| C05 | pergunta 15; `roteiro.md` (etapas 10 e 12) | caminho de emissão da taxa difere do descrito no roteiro | médio | bloqueio `conflito_com_base` | confirmar o caminho atual da cobrança |
| C06 | perguntas 10 e 11 | a redação pode sugerir emissão automática após a assinatura | médio | alerta de que o sistema não promete emissão | validar redação sem promessa de resultado |
| C07 | `documentos.json` item 2.2 (TR) | mistura de LAS, RLAS, RLAC e LAC no item | médio | cinco alertas; sem interpretação jurídica | área competente revisar o item |
| C08 | `documentos.json` item 1.2.5 (TR) | "RH" no lugar de "RG" | baixo | alerta; texto da fonte não corrigido | confirmar a redação correta |
| C09 | `documentos.json` item 1.3.2 (TR) | nome de arquivo parece de outro assunto | baixo | alerta | confirmar o nome correto |
| C10 | pergunta 4 | numeração "Lei complementar 688/2021" difere da Lei Complementar nº 668/2020 cadastrada | alto | numeração preservada; alerta de que não se pode afirmar que sejam a mesma norma | identificar a norma e a numeração corretas |
| C11 | `documentos.json` item 3; pergunta 18 | depende do Decreto nº 697/2020, não cadastrado | médio | alertas; norma não cadastrada | decidir se a norma será cadastrada e confirmar sua vigência |
| C12 | perguntas 6 e j | cita a Resolução CONSEMA nº 41/2021, não cadastrada | médio | bloqueios de fonte complementar e vigência | decidir sobre o cadastro e confirmar a norma |
| C13 | observação d | TR nº 177 citado e não cadastrado | médio | somente na pendência; não cadastrado | decidir sobre o cadastro da fonte |
| C14 | observação e | duas normas de isenção citadas e não cadastradas | médio | somente na pendência | analisar as normas e decidir sobre o cadastro |

Resumo: 3 conflitos de risco alto, 9 de risco médio e 2 de risco baixo.

## 9. Matriz de conteúdo

"Validado materialmente" = validação do conteúdo pela área competente. Não há evidência dessa validação em nenhum conjunto.

| Conjunto | Quantidade | Validado materialmente | Publicado | Disponível ao assistente | Principal pendência |
|---|---:|---:|---:|---:|---|
| Roteiro (etapas) | 15 | 0 | 0 | 0 | confirmar fluxo atual do SIGA e norma de enquadramento |
| Documentos | 28 | 0 | 0 | 0 | confirmar obrigatoriedade e atualidade; resolver inconsistências do TR |
| Perguntas | 21 | 0 | 0 | 0 | aprovar ou não uma `respostaPublicavel` para cada pergunta |
| Fontes | 8 | 0 | 0 | 0 | confirmar vigência das normas e atualidade dos documentos |

## 10. Conteúdo candidato para teste

Nenhum status foi alterado. Esta separação apenas orienta a decisão do Passo 5.

### Candidato após validação (menor risco)

Somente depois de decisão expressa e de validação pela área competente:

- avisos institucionais de limite do sistema: orienta, não decide enquadramento, não concede licença e não promete aprovação, prazo ou emissão (`service.json`, `condicoes` 2 e 3; `roteiro.md`, "Condições" e "Observações");
- descrição geral da LAC como modalidade de licenciamento ambiental com solicitação digital pelo SIGA, com a ressalva de atualidade (`service.json`, `descricao`);
- sequência geral das etapas, sem nomes de botões e menus, depois da confirmação do fluxo atual (`service.json`, `etapas`);
- pergunta 2, sobre o conceito de representante legal, com resposta a ser redigida e aprovada;
- itens do checklist sem alerta específico (1.1.3, 1.2.1 a 1.2.4, 1.3.1, 1.3.3, 1.4.2, 1.4.3, 2.3, 2.4 e 4.3 a 4.6), somente depois de confirmadas a obrigatoriedade e a atualidade.

### Deve permanecer bloqueado

- normas revogadas ou com vigência a confirmar;
- valores, taxas, prazos e validade (perguntas 7, 8, 14, 15 e k);
- contatos e canais de atendimento;
- qualquer afirmação de enquadramento (perguntas 4, 16, i e j; observações c, d e e);
- exigências documentais não confirmadas (28 itens, `obrigatorio: null`);
- procedimentos, menus e telas do SIGA não confirmados (perguntas 5, 9, 10, 11, 12, 13 e 15; etapas 12, 13 e 15);
- informações com conflito (perguntas 3 e 15) e as observações a até h.

### Não deve ser utilizado

- o Decreto nº 695/2020 como fundamento ou como orientação de enquadramento;
- a afirmação "não é passível de licenciamento" (pergunta 4) como decisão do assistente;
- o texto do item 2.2 do TR com a mistura de LAS, RLAS, RLAC e LAC, sem revisão;
- a redação confusa da pergunta 10 e a numeração "Lei complementar 688/2021" enquanto não identificadas;
- qualquer conteúdo que não possa ser atribuído a uma fonte adequada ou lida.

## 11. Pendências da área competente

- vigência e alterações das normas, inclusive a situação do Decreto nº 1.268/2022 após o Decreto nº 1.585/2022;
- norma atual de enquadramento;
- unidade responsável pelo serviço;
- canal de atendimento;
- responsável pela validação e data de revisão;
- fluxo e telas atuais do SIGA;
- obrigatoriedade e atualidade dos documentos;
- inconsistências do TR nº 176;
- respostas publicáveis das perguntas;
- taxas, prazos e validade;
- normas ainda não cadastradas: Decreto nº 697/2020, Resolução CONSEMA nº 41/2021, TR nº 177, normas de isenção e a norma citada como "Lei complementar 688/2021";
- conferência do texto integral do manual do SIGA, da Lei Complementar nº 668/2020 e dos Decretos nº 1.268/2022 e nº 1.585/2022;
- observações a até h do FAQ;
- autorização de publicação.

## 12. Recomendação

- **Conteúdo pronto para publicação pública:** não há. Nenhum conjunto foi validado materialmente pela área competente, há normas com vigência pendente, o fluxo do SIGA é de 2020 e `responsavelValidacao` e `dataRevisao` estão vazios. Não se recomenda publicação pública.
- **Candidato a teste controlado:** existe um conjunto pequeno de menor risco (seção 10, "Candidato após validação"), que só poderá ser considerado depois de decisão expressa e das condições abaixo.
- **Condições antes do Passo 5:**
  1. validação material do conteúdo candidato pela área competente, com responsável e data de revisão registrados;
  2. confirmação da norma atual de enquadramento e da vigência das normas que sustentam o conteúdo;
  3. confirmação do fluxo atual do SIGA;
  4. revisão de atualidade concluída, item a item, para o que for candidato;
  5. redação e aprovação de uma `respostaPublicavel` para cada pergunta candidata;
  6. decisão expressa sobre quais fontes poderão ser publicadas;
  7. definição de unidade responsável e canal de atendimento, necessários para as respostas fora da base.

Qualquer publicação, mesmo para teste, exigirá nova autorização expressa.
