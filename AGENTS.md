# Regras do Projeto (Agent Rules)

## 🎯 Roteiro de Execução e Backlog
- O backlog completo de desenvolvimento está documentado em [BACKLOG.md](BACKLOG.md).
- O desenvolvimento é dividido em 6 Sprints sequenciais. Não avance para a sprint seguinte sem concluir as tarefas da sprint atual:
  - **Sprint 1 (Foco Atual):** Segurança crítica e correções lógicas fundamentais.
    - Status: **#1** (Concluído), **#2** (Concluído), **#3 (Próxima)**, **#4**, **#5**, **#7**, **#16**, **#17**.
  - **Sprint 2:** Robustez, qualidade e observabilidade (#6, #8, #9, #10, #11, #12, #13, #18 a #20, #22, #24 a #28, #45).
  - **Sprint 3:** SEO, Conteúdo e Autoria (#30, #31, #33, #34, #38, #39, #32).
  - **Sprint 4:** Engajamento e Comunidade (#15, #23, #37, #40, #41, #42, #43, #44).
  - **Sprint 5:** Moderação, Governança e Autenticação Avançada (#14, #46 a #53).
  - **Sprint 6:** Performance e Escala (#21, #29, #35, #36, #54, #55).

---

## 🛠️ Ciclo de Desenvolvimento por Tarefa
1. **Identificar a Tarefa:** Leia o contexto da issue atual no [BACKLOG.md](BACKLOG.md) ou diretamente no GitHub.
2. **Implementar:** Escreva o código respeitando a arquitetura modular NestJS (Controllers, Services, DTOs com `class-validator`).
3. **Testar e Validar:**
   - Crie ou atualize os testes unitários (`.spec.ts`).
   - Execute: `npm.cmd run test` (todos os testes devem passar 100% verde).
   - Execute: `npm.cmd run lint`.
4. **Finalizar:**
   - Commit com mensagem semântica referenciando a issue:
     ```bash
     git commit -m "fix(security): sanitize html in email template (closes #3)"
     ```
   - Envie as alterações:
     ```bash
     git push origin main
     ```
   *(Ao utilizar a palavra-chave `closes #N`, o GitHub fecha a issue e atualiza o Kanban automaticamente).*

---

## 📐 Boas Práticas e Restrições
- **Final de Linha:** Padrão Unix LF (`\n`).
- **Escopo Estrito:** Modifique apenas os arquivos estritamente necessários para a issue atual.
- **Proteção de Segredos:** Nunca commite o arquivo `.env`.
- **Ignore Pastas:** Não altere arquivos em `dist/`, `node_modules/`, `.git/` ou migrations antigas.
