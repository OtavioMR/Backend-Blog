# Regras do Projeto (Agent Rules)

## 🎯 Guia Mestre de Execução (Backlog & Sprints)
- Todo o planejamento de desenvolvimento segue estritamente a **Issue Mestre [#56](https://github.com/OtavioMR/Backend-Blog/issues/56)**.
- O desenvolvimento é dividido em 6 Sprints sequenciais. Não avance para a sprint seguinte sem concluir as tarefas da sprint atual:
  - **Sprint 1 (Foco Atual):** Segurança crítica e correções lógicas fundamentais (#1, #2, #3, #4, #5, #7, #16, #17).
  - **Sprint 2:** Robustez, qualidade e observabilidade (#6, #8, #9, #10, #11, #12, #13, #18 a #20, #22, #24 a #28, #45).
  - **Sprint 3:** SEO, Conteúdo e Autoria (#30, #31, #33, #34, #38, #39, #32).
  - **Sprint 4:** Engajamento e Comunidade (#15, #23, #37, #40, #41, #42, #43, #44).
  - **Sprint 5:** Moderação, Governança e Autenticação Avançada (#14, #46 a #53).
  - **Sprint 6:** Performance e Escala (#21, #29, #35, #36, #54, #55).

---

## 📋 Automação Obrigatória do GitHub Projects (Kanban)
Qualquer agente (Antigravity, Codex, Copilot, Claude) trabalhando neste projeto **DEVE** manter o quadro Kanban sincronizado em tempo real. O usuário acompanha a movimentação das colunas visualmente no GitHub Projects.

### Identificadores do Projeto no GitHub:
- **Project URL:** `https://github.com/users/OtavioMR/projects/1`
- **Project ID:** `PVT_kwHOB61zZs4BphvW`
- **Status Field ID:** `PVTSSF_lAHOB61zZs4BphvWzhn8_so`
- **Opções de Status (Colunas):**
  - `Backlog`: `f75ad846` (label: `status: backlog`)
  - `Ready`: `61e4505c` (label: `status: pronto para iniciar`)
  - `In progress`: `47fc9ee4` (label: `status: em andamento`)
  - `In review`: `df73e18b` (label: `status: em revisão`)
  - `Done`: `98236657` (label: `status: concluído`)

### Ciclo de Vida Obrigatório por Tarefa:
1. **Ao Iniciar a Tarefa:**
   - Mover imediatamente o card para **`In progress`** no GitHub Projects.
   - Atualizar a label da issue para `status: em andamento`.
   - Adicionar comentário na issue avisando que o desenvolvimento começou.
2. **Durante os Testes:**
   - Mover o card para **`In review`**.
   - Atualizar a label para `status: em revisão`.
   - Executar obrigatoriamente `npm run lint` e `npm run test` (Vitest). Todos os testes devem passar (100% verde).
3. **Ao Concluir a Tarefa:**
   - Mover o card para **`Done`**.
   - Atualizar a label para `status: concluído`.
   - Fechar a issue com `state: closed` e `state_reason: completed`.
   - Fazer o commit com mensagem padronizada referenciando o fechamento (ex: `fix(security): ... (closes #N)`).
   - Fazer `git push origin main`.

### Script Auxiliar de Movimentação do Card:
Existe um helper em Node.js configurado na raiz/scratch que pode ser executado para mover o card via CLI:
```bash
node scratch/move_card.js <NUMERO_DA_ISSUE> <STATUS> "<COMENTARIO_OPCIONAL>"
# Exemplo ao iniciar: node scratch/move_card.js 3 in_progress "Iniciando codificação..."
# Exemplo ao testar: node scratch/move_card.js 3 in_review "Executando testes..."
# Exemplo ao fechar: node scratch/move_card.js 3 done "Concluído com sucesso!"
```
*Status aceitos:* `backlog`, `ready`, `in_progress`, `in_review`, `done`.

---

## 🔒 Credenciais e Tokens
- As chamadas GraphQL com permissão de `project` e `repo` utilizam a variável `GITHUB_TOKEN` configurada no arquivo `.env` da raiz do projeto.
- O helper `scratch/move_card.js` lê automaticamente a chave `GITHUB_TOKEN` do `.env` local.
- Nunca commite o token em arquivos de código ou git público. O `.env` e a pasta `scratch/` estão estritamente protegidos no `.gitignore`.

---

## 🛠️ Boas Práticas de Código e Engenharia
- **Final de Linha:** Utilize sempre padrão Unix LF (`\n`).
- **Arquitetura NestJS:** Respeite a estrutura modular de Controllers, Services, Entities e DTOs existentes.
- **Validação:** Valide inputs usando `class-validator` e `class-transformer`.
- **Testes:** Para cada alteração de regra de negócio ou endpoint, crie/atualize o arquivo `.spec.ts` correspondente.
- **Escopo Estrito:** Edite apenas os arquivos necessários para a issue atual. Evite refatorações desnecessárias fora do escopo.
- **Ignore Pastas:** Não escaneie nem altere `dist/`, `node_modules/`, `.git/` e arquivos de migrations antigas.
