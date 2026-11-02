# Regras do Projeto

## Backlog e sprints
- O [BACKLOG.md](BACKLOG.md) local é a fonte de referência para as tarefas. Consulte apenas o trecho relevante quando precisar de contexto; acesse o GitHub somente quando solicitado ou quando a informação necessária não estiver disponível localmente.
- As seis sprints da versão 1.0.0 foram implementadas e validadas. Consulte o backlog e [docs/RELEASE_AUDIT.md](docs/RELEASE_AUDIT.md) para o escopo entregue, evidências e dependências externas de operação.

## Desenvolvimento
- Documente no Swagger toda rota nova ou alterada, incluindo autenticação, parâmetros, exemplos e respostas; atualize e valide a documentação junto com a mudança.
- Ao alterar o esquema do banco, crie e aplique as migrations necessárias no banco configurado e informe o resultado; se não for possível aplicá-las, informe a limitação.
- Respeite a arquitetura modular NestJS (controllers, services e DTOs com `class-validator`) e limite as alterações ao necessário para a tarefa.
- Para mudanças de código, crie ou atualize testes unitários quando forem úteis para verificar o comportamento alterado. Execute testes direcionados e validações proporcionais ao risco e ao escopo.
- Execute `npm.cmd run test` e `npm.cmd run lint` completos quando a mudança justificar, antes de uma entrega que exija essa validação ou quando solicitado. Informe o que foi executado e eventuais limitações.
- Para economizar contexto, procure arquivos e trechos específicos e evite ler o backlog inteiro ou repetir verificações sem necessidade.

## Git e restrições
- **Sem commits ou envios ao GitHub:** Mantenha todas as alterações locais. O agente não deve criar commits, fazer push ou abrir Pull Requests; o usuário fará os commits e envios ao final da sprint.
- **Zero requisições de API ao GitHub:** Não faça chamadas de API (REST/GraphQL) ao GitHub para gerenciar issues, labels, comentários ou projetos. O controle de status é 100% local no [BACKLOG.md](BACKLOG.md).
- Use finais de linha Unix (LF) e nunca commite `.env`.
- Não altere arquivos em `dist/`, `node_modules/`, `.git/` ou migrations antigas.
