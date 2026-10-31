# Regras do Projeto (Agent Rules)

## 🎯 Guia Mestre de Execução (Backlog & Sprints)
- Todo o planejamento de desenvolvimento segue estritamente a **Issue Mestre #{MASTER_ISSUE_NUMBER}**.
- O desenvolvimento é dividido em Sprints sequenciais. Não avance para a sprint seguinte sem concluir as tarefas da sprint atual.

---

## 📋 Automação Obrigatória do GitHub Projects (Kanban)
Qualquer agente (Antigravity, Codex, Copilot, Claude) trabalhando neste projeto **DEVE** manter o quadro Kanban sincronizado em tempo real. O usuário acompanha a movimentação das colunas visualmente no GitHub Projects.

### Identificadores do Projeto no GitHub:
- **Project URL:** `{PROJECT_URL}`
- **Project ID:** `{PROJECT_ID}`
- **Status Field ID:** `{STATUS_FIELD_ID}`
- **Opções de Status (Colunas):**
  - `Backlog`: `{BACKLOG_OPTION_ID}` (label: `status: backlog`)
  - `Ready`: `{READY_OPTION_ID}` (label: `status: pronto para iniciar`)
  - `In progress`: `{IN_PROGRESS_OPTION_ID}` (label: `status: em andamento`)
  - `In review`: `{IN_REVIEW_OPTION_ID}` (label: `status: em revisão`)
  - `Done`: `{DONE_OPTION_ID}` (label: `status: concluído`)

### Ciclo de Vida Obrigatório por Tarefa:
1. **Ao Iniciar a Tarefa:**
   - Mover imediatamente o card para **`In progress`** no GitHub Projects.
   - Atualizar a label da issue para `status: em andamento`.
   - Adicionar comentário na issue avisando que o desenvolvimento começou.
2. **Durante os Testes:**
   - Mover o card para **`In review`**.
   - Atualizar a label para `status: em revisão`.
   - Executar testes automatizados da aplicação. Todos os testes devem passar (100% verde).
3. **Ao Concluir a Tarefa:**
   - Mover o card para **`Done`**.
   - Atualizar a label para `status: concluído`.
   - Fechar a issue com `state: closed` e `state_reason: completed`.
   - Fazer o commit com mensagem padronizada referenciando o fechamento (ex: `feat/fix: ... (closes #N)`).
   - Fazer `git push origin main`.

### Script Auxiliar de Movimentação do Card:
Existe um helper em Node.js configurado na raiz/scratch que pode ser executado para mover o card via CLI:
```bash
node scratch/move_card.js <NUMERO_DA_ISSUE> <STATUS> "<COMENTARIO_OPCIONAL>"
```
*Status aceitos:* `backlog`, `ready`, `in_progress`, `in_review`, `done`.

---

## 🔒 Credenciais e Tokens
- As chamadas GraphQL com permissão de `project` e `repo` utilizam a variável `GITHUB_TOKEN` configurada no arquivo `.env` da raiz do projeto.
- O helper `scratch/move_card.js` lê automaticamente a chave `GITHUB_TOKEN` do `.env` local.
- Nunca commite o token em arquivos de código ou git público. O `.env` e a pasta `scratch/` estão estritamente protegidos no `.gitignore`.
