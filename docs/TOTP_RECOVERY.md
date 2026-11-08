# Recuperação do autenticador

O fluxo substitui o fator após comprovar a senha atual, a posse do e-mail de recuperação previamente confirmado e um código do novo autenticador. A senha e o cargo são preservados. Não existe um endpoint público que desative o MFA apenas por e-mail. Recuperar a senha não autoriza recuperar o MFA. SUPER_ADMIN continua exigindo autorização pelo servidor.

## Cadastro obrigatório antes do 2FA

Em **Minha conta → Segurança → E-mail de recuperação**, o titular informa outro endereço e sua senha. Se já tem 2FA ativo, também precisa de um TOTP atual; um código de recuperação não autoriza trocar esse endereço. A confirmação é enviada somente ao novo endereço, expira em 30 minutos e é de uso único. Principal e endereço anterior recebem avisos com cancelamento da solicitação pendente.

Até confirmar, o endereço anterior é mantido. Após confirmar, o endereço novo já pode ser usado para recuperar o autenticador e ativar 2FA. O backend exige o e-mail confirmado tanto no setup quanto na ativação. Endereços e tokens de recuperação não aparecem nos perfis públicos. Não é permitido usar o mesmo endereço do principal; um alias não prova que as caixas sejam independentes, por isso o titular deve protegê-las separadamente.

Contas com 2FA anterior à migration continuam com o fator ativo. Elas devem cadastrar o e-mail de recuperação usando a senha e TOTP atuais. Não há preenchimento automático a partir do principal nem fallback para o principal nas contas READER/AUTHOR/ADMIN sem recuperação cadastrada. Se já perderam todos os fatores e nunca cadastraram esse endereço, os códigos salvos ou um procedimento de identificação separado continuam necessários.

Trocar o endereço confirmado invalida as autorizações de recuperação anteriores. Trocar senha, papel ou e-mail principal também invalida autorizações vinculadas à versão de autenticação. Falhas de senha/TOTP na troca do endereço são persistidas e bloqueiam a conta por 15 minutos após cinco falhas, além do limite por IP.

## Atendimento e autorização

1. O titular abre `/recuperar-autenticador`, informa seu e-mail principal de entrada e a senha atual. A resposta é genérica para credenciais inválidas ou conta inelegível. SUPER_ADMIN recebe essa resposta, mas nenhuma autorização online é emitida. Com credenciais válidas e conta elegível, repetições em menos de 30 minutos não emitem outro link e informam quando tentar novamente, inclusive se a autorização anterior já foi usada.
2. Alternativamente, um SUPER_ADMIN pode autorizar recuperação assistida de outra conta no painel, com TOTP atual e registro do atendimento. Isso também exige endereço de recuperação confirmado para alvos READER/AUTHOR/ADMIN; não é permitido substituir esse requisito pelo principal. A API impede autoaprovação e alvos SUPER_ADMIN pelo painel.
3. O titular recebe o link de acesso **somente no e-mail de recuperação confirmado**. O principal recebe apenas aviso e cancelamento, nunca o token de acesso. O fator atual permanece ativo.
4. A autorização pode ser usada imediatamente e é válida por 24 horas. O aviso é enviado imediatamente; uma recuperação não reconhecida deve ser cancelada e investigada.
5. O titular abre o link, informa a senha atual, escaneia o novo QR Code e confirma seu código em até dez minutos. A autorização permite no máximo dez tentativas (incluindo configuração e confirmação), com limites adicionais por IP.
6. A conclusão troca o fator atomicamente, invalida todas as sessões e autorizações de recuperação, apaga os códigos antigos e emite oito novos códigos mostrados uma vez. Também invalida links pendentes de senha e troca de e-mail. Principal e recuperação recebem avisos; o titular precisa fazer login novamente.

O código usado para confirmar a troca não pode ser reutilizado no login: aguarde o próximo código do aplicativo.

Tokens de 256 bits ficam como hashes no banco. O provisionamento TOTP e os e-mails da outbox são cifrados. Os links usam fragmentos, que não são enviados ao servidor da página, e a tela os remove da barra de endereço após a leitura. Nada é salvo em localStorage. Alterar senha, e-mail, papel ou versão de autenticação invalida a autorização vinculada à conta. Não há redução do cargo nem intervalo com o MFA desativado.

## SUPER_ADMIN ou ausência de outro autorizador

Use o procedimento abaixo **no servidor da aplicação**, com acesso individual à infraestrutura protegido por MFA. Restrinja o acesso ao banco e ao container; registre quem executou e a referência do incidente. Para superusuários, adote revisão por duas pessoas quando houver equipe. Essa validação humana e a segurança do acesso ao servidor são responsabilidades operacionais; o aplicativo não as comprova automaticamente.

Antes de começar, valide o destinatário já cadastrado, o atendimento, o backup operacional e o funcionamento do SMTP/worker. Não mude o e-mail da conta como atalho para a recuperação. O comando não altera a conta nem abre sessão; somente emite uma autorização disponível imediatamente. Em SUPER_ADMIN usa o endereço de recuperação confirmado quando existir; conserva o destinatário principal como emergência somente para SUPER_ADMIN legado sem endereço de recuperação, mediante o procedimento no servidor. ADMIN exige recuperação confirmada inclusive neste comando.

Com a versão contendo esta funcionalidade implantada, execute primeiro a simulação (substitua os exemplos por dados do atendimento):

```sh
node dist/database/recover-admin-totp.js \
  --user-id UUID_DA_CONTA \
  --email titular@example.com \
  --operator identificacao-do-operador \
  --reason "INC-123: identidade confirmada por canal independente"
```

O comando exige UUID e e-mail da mesma conta administrativa ativa, verificada e com TOTP habilitado. A simulação não escreve no banco. Depois de revisar, repita com `--confirm UUID_DA_CONTA`. Sem esse argumento não há autorização. Não coloque senhas, tokens ou segredos nos argumentos. No ambiente de desenvolvimento com dependências instaladas, o equivalente é `npm run admin:recover-totp -- ...`.

No Docker Compose do projeto, use `docker compose exec app node dist/database/recover-admin-totp.js ...`. O script usa as credenciais já configuradas no container. Exige `FRONTEND_URL` e `JWT_SECRET` do mesmo ambiente da API e HTTPS em produção. Mantenha o worker da API em execução para entregar a outbox. O script não imprime o token nem inicia um worker adicional.

Uma nova autorização invalida a anterior. Se o e-mail cadastrado também foi perdido, interrompa este procedimento e trate como recuperação de identidade por uma política separada; não altere o e-mail nem desative MFA via SQL como rotina.

## Implantação e monitoração

- Aplique as migrations `1797600000000-TotpRecoveryGrants.ts` e `1797700000000-RecoveryEmail.ts` antes de iniciar a nova API. A segunda adiciona o cadastro separado e invalida autorizações antigas que poderiam ter sido enviadas ao principal.
- Implante backend e frontend da mesma versão; a tela pública fica em `/recuperar-autenticador`.
- Monitore `auth.totp_recovery_authorized`, `auth.totp_recovery_cancelled` e `auth.totp_recovered` na auditoria e atrasos da outbox. O operador/motivo são registrados, sem tokens ou senhas.
- Monitore também `auth.recovery_email_requested`, `auth.recovery_email_verified` e `auth.recovery_email_cancelled`. Os eventos não incluem endereços privados nem tokens.
- Operações administrativas exigem TOTP ativo também no backend. Uma conta sem TOTP ainda pode entrar no espaço de conta para configurá-lo, mas não acessar as rotas administrativas.
- Autorizações expiradas ou consumidas não funcionam. Inclua a tabela na política de retenção de dados; o histórico permanente é a auditoria.

## Validação local

```sh
npm run migration:run
npm run build
npm run test
npm run lint
```

Com `RUN_DB_TESTS=1`, execute `npx vitest run src/modules/auth/totp-recovery.integration.spec.ts`. Os testes criam e removem contas sintéticas no banco configurado e simulam o envio de e-mail; não enviam mensagens externas. Cobrem senha incorreta com tentativas persistidas, cancelamento, invalidação de autorizações, concorrência, uso único, revogação de sessões/códigos, auditoria e permissões.

Execute também `src/modules/auth/recovery-email.integration.spec.ts` para cadastro, confirmação, troca, privacidade, bloqueio por tentativas e proibição de recuperação online de SUPER_ADMIN. No frontend, `BLOG_RECOVERY_E2E=1 npm run test:recovery-browser` valida o caminho no Chromium com a imagem Docker atual e SMTP local de captura. O teste para temporariamente a API, mantém banco/volumes, aceita somente destinatários sintéticos e restaura a API ao final. Não execute junto de outros testes que precisem da API na porta 3000.

HTTPS é obrigatório em produção; endereços estritamente loopback (`localhost`, `127.0.0.1`, `::1`) aceitam HTTP para a prova Docker local. Não configure um endereço loopback para uma implantação pública.

Referência: [OWASP — Multifactor Authentication](https://cheatsheetseries.owasp.org/cheatsheets/Multifactor_Authentication_Cheat_Sheet.html).

A remoção do e-mail de recuperação é solicitada em **Minha conta → Segurança → E-mail de recuperação**, com senha e TOTP atual quando ativo. Um link de uso único, válido por 30 minutos, é enviado ao endereço de recuperação; o endereço permanece válido até a confirmação. O e-mail principal recebe aviso com cancelamento. Após confirmar, o autenticador permanece ativo, mas a recuperação por e-mail fica indisponível até cadastrar outro endereço; solicitações de recuperação pendentes são invalidadas.
