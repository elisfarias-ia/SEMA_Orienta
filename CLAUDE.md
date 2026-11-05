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
