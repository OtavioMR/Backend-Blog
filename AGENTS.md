# Regras do Projeto

## Backlog e sprints
- O [BACKLOG.md](BACKLOG.md) local é a fonte de referência para as tarefas. Consulte apenas o trecho relevante quando precisar de contexto; acesse o GitHub somente quando solicitado ou quando a informação necessária não estiver disponível localmente.
- As seis sprints são sequenciais: não avance para a próxima sem concluir a atual. A Sprint 3 é o próximo foco; consulte o backlog para tarefas e status atualizados.

## Desenvolvimento
- Respeite a arquitetura modular NestJS (controllers, services e DTOs com `class-validator`) e limite as alterações ao necessário para a tarefa.
- Para mudanças de código, crie ou atualize testes unitários quando forem úteis para verificar o comportamento alterado. Execute testes direcionados e validações proporcionais ao risco e ao escopo.
- Execute `npm.cmd run test` e `npm.cmd run lint` completos quando a mudança justificar, antes de uma entrega que exija essa validação ou quando solicitado. Informe o que foi executado e eventuais limitações.
- Para economizar contexto, procure arquivos e trechos específicos e evite ler o backlog inteiro ou repetir verificações sem necessidade.

## Git e restrições
- **Push direto para a `main`:** Ao concluir uma atividade e validar os testes, faça o commit semântico diretamente na `main` referenciando a issue (ex.: `fix: ... (closes #N)`) e faça `git push origin main`. Não abra Pull Requests.
- **Zero requisições de API ao GitHub:** Não faça chamadas de API (REST/GraphQL) ao GitHub para gerenciar issues, labels, comentários ou projetos. O controle de status é 100% local no [BACKLOG.md](BACKLOG.md). O fechamento no GitHub ocorre de forma nativa e automática pelo `closes #N` no push.
- Use finais de linha Unix (LF) e nunca commite `.env`.
- Não altere arquivos em `dist/`, `node_modules/`, `.git/` ou migrations antigas.
