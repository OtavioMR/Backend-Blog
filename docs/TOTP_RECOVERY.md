# Recuperação do autenticador

O fluxo substitui o fator após comprovar a senha atual, a posse do endereço verificado autorizado e um código do novo autenticador. O uso do principal exige aprovação assistida após verificação independente de identidade. A senha e o cargo são preservados. O e-mail principal sozinho não permite recuperar 2FA. Recuperar a senha não autoriza recuperar o MFA. SUPER_ADMIN continua exigindo autorização pelo servidor.

## Configurações independentes e requisitos administrativos

Em **Minha conta → Segurança → E-mail de recuperação**, o titular informa outro endereço e sua senha. Se já tem 2FA ativo, também precisa de um TOTP atual; um código de recuperação não autoriza trocar esse endereço. A confirmação é enviada somente ao novo endereço, expira em 30 minutos e é de uso único. Principal e endereço anterior recebem avisos com cancelamento da solicitação pendente.

Até confirmar, o endereço anterior é mantido. Após confirmar, o endereço novo já pode ser usado para recuperar o autenticador. READER/AUTHOR podem usar nenhum dos mecanismos, somente 2FA, somente secundário ou ambos. Podem remover o secundário sem desativar 2FA e desativar 2FA sem remover o secundário. ADMIN/SUPER_ADMIN devem manter principal verificado, secundário verificado e 2FA ativo. O backend exige o secundário confirmado no setup/ativação somente para esses perfis e proíbe sua remoção na solicitação e novamente na confirmação sob lock. A troca mantém o anterior até confirmar o novo. Promoção a ADMIN e bootstrap a SUPER_ADMIN exigem as três proteções antes de conceder privilégios. O guard administrativo usa o estado atual consultado pelo JWT; contas legadas incompletas conservam acesso à própria conta para regularização. Endereços e tokens de recuperação não aparecem nos perfis públicos. O secundário deve ser diferente do principal; aliases não comprovam caixas independentes.

Contas com 2FA anterior à migration continuam com o fator ativo. Contas administrativas devem cadastrar o secundário usando senha e TOTP atuais. Não há preenchimento automático nem fallback automático para o principal. O principal pode receber uma autorização após aprovação assistida, inclusive sem secundário. Os códigos reserva existentes continuam disponíveis para login.

Na validação JWT, contas administrativas incompletas recebem apenas permissões efetivas de READER até regularização. Isso também protege rotas com autenticação opcional e exceções administrativas em verificações de propriedade. A função armazenada não é alterada: o perfil do titular mostra o cargo real, e os serviços de conta continuam impedindo remoção de secundário/desativação de 2FA e protegendo o SUPER_ADMIN.

Trocar o endereço confirmado invalida as autorizações de recuperação anteriores. Trocar senha, papel ou e-mail principal também invalida autorizações vinculadas à versão de autenticação. Falhas de senha/TOTP na troca do endereço são persistidas e bloqueiam a conta por 15 minutos após cinco falhas, além do limite por IP.

## Atendimento e autorização

1. O titular abre `/recuperar-autenticador`, informa seu e-mail principal de entrada e a senha atual. Credenciais inválidas, conta inexistente/não verificada ou bloqueada recebem a mesma resposta 401, com tempo mínimo e tentativas persistidas. Somente após senha válida a API informa `sent`, `cooldown`, `assisted_required` ou `not_enabled`. Sem secundário confirmado (inclusive após remoção), nenhum link é enviado e a tela orienta usar código reserva ou análise assistida. SUPER_ADMIN continua sem autorização online. Repetições elegíveis em menos de 30 minutos não emitem outro link e informam `retryAt`, inclusive se a autorização anterior já foi usada.
2. Alternativamente, um SUPER_ADMIN com as proteções obrigatórias pode autorizar outra conta após verificar evidências confiáveis por canal independente, com TOTP atual e registro do atendimento. No endpoint existente `POST /admin/users/:id/totp-recovery`, `destination` aceita somente `primary` (preferencial e padrão quando omitido) ou `secondary` (somente cadastrado e verificado). O principal deve estar verificado e pode ser usado sem secundário. A consulta existente `GET /admin/users/:id` entrega `recoveryDestinations` somente a SUPER_ADMIN, com os endereços já verificados; ADMIN recebe apenas `recoveryEmailVerified`. O serviço revalida a seleção sob lock. Não aceita endereços arbitrários. A API impede autoaprovação e alvos SUPER_ADMIN pelo painel.
3. No autoatendimento, o link vai **somente ao secundário confirmado**, e o principal recebe apenas aviso e cancelamento. Na recuperação assistida, o link vai somente ao endereço verificado selecionado. Os demais endereços verificados recebem aviso e cancelamento, sem token de acesso. O fator atual permanece ativo. Autoatendimento nunca permite escolher o principal.
4. A autorização pode ser usada imediatamente e é válida por 24 horas. O aviso é enviado imediatamente; uma recuperação não reconhecida deve ser cancelada e investigada.
5. O titular abre o link, informa a senha atual, escaneia o novo QR Code e confirma seu código em até dez minutos. A autorização permite no máximo dez tentativas (incluindo configuração e confirmação), com limites adicionais por IP.
6. A conclusão troca o fator atomicamente, invalida todas as sessões e autorizações de recuperação, apaga os códigos antigos e emite oito novos códigos mostrados uma vez. Também invalida links pendentes de senha e troca de e-mail. Principal e recuperação recebem avisos; o titular precisa fazer login novamente.

O código usado para confirmar a troca não pode ser reutilizado no login: aguarde o próximo código do aplicativo.

Tokens de 256 bits ficam como hashes no banco. O provisionamento TOTP e os e-mails da outbox são cifrados. Os links usam fragmentos, que não são enviados ao servidor da página, e a tela os remove da barra de endereço após a leitura. Nada é salvo em localStorage. Alterar senha, e-mail, papel ou versão de autenticação invalida a autorização vinculada à conta. Não há redução do cargo nem intervalo com o MFA desativado.

## SUPER_ADMIN ou ausência de outro autorizador

Use o procedimento abaixo **no servidor da aplicação**, com acesso individual à infraestrutura protegido por MFA. Restrinja o acesso ao banco e ao container; registre quem executou e a referência do incidente. Para superusuários, adote revisão por duas pessoas quando houver equipe. Essa validação humana e a segurança do acesso ao servidor são responsabilidades operacionais; o aplicativo não as comprova automaticamente.

Antes de começar, valide o destinatário já cadastrado, o atendimento, o backup operacional e o funcionamento do SMTP/worker. Não mude o e-mail da conta como atalho. O comando não altera a conta nem abre sessão; somente emite autorização. O principal verificado é o destino padrão; `--destination secondary` seleciona o secundário previamente confirmado. `--email` continua apenas identificando o principal para conferência do operador. Contas administrativas legadas sem secundário podem recuperar o autenticador pelo principal mediante este procedimento reforçado, mas precisam regularizar as proteções obrigatórias antes de acessar rotas administrativas.

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
- Operações administrativas exigem TOTP ativo e ambos os e-mails verificados no backend. Contas incompletas conservam acesso à própria conta para regularização. Não há rebaixamento automático nem exceção à proteção do último SUPER_ADMIN.
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

A remoção do secundário é solicitada por contas comuns em **Minha conta → Segurança → E-mail de recuperação → Remover endereço**, em página própria com senha e TOTP atual quando ativo. O link de uso único, válido por 30 minutos, é enviado ao **principal verificado**, permitindo remover um secundário inacessível. O secundário recebe somente aviso/cancelamento. Ele permanece válido até confirmar; a interface mostra explicitamente "Remoção aguardando confirmação", o destino e o prazo. Confirmar mantém o autenticador e invalida autorizações de recuperação anteriores. A recuperação automática fica indisponível; a análise assistida pelo principal verificado continua possível. Contas administrativas devem substituir o secundário, ou primeiro perder privilégios pelo fluxo autorizado existente.

O resumo em `/conta/email-recuperacao` não mistura formulários: cadastro, troca e remoção usam respectivamente `/adicionar`, `/alterar` e `/remover`. `GET /auth/recovery-email` mantém os campos anteriores e acrescenta `pending: null | { action: add|replace|remove, email, expiresAt, confirmationDestination: primary|secondary }`. Solicitações expiradas ou vinculadas a credenciais anteriores não aparecem como pendentes. `POST /auth/recovery-email/cancel-pending` exige a sessão atual do titular, invalida todos os links da solicitação e preserva o endereço confirmado e o TOTP. A página consulta o estado ao voltar à aba e no vencimento, sem desabilitar ações durante a atualização em segundo plano.

Redefinição de senha continua pelo principal e não remove o TOTP. A ausência de secundário não cria um fallback automático para substituir o autenticador pelo principal. Validação manual em navegador e regressões: [RECOVERY_FLOW_VALIDATION.md](RECOVERY_FLOW_VALIDATION.md).


## Evidências e atendimento excepcional

Reutilize o atendimento e a autorização assistida existentes; não há um novo sistema de chamados. Registre a referência do incidente e evidências confiáveis de titularidade obtidas por canal independente, conforme a política operacional. Nome, endereço de e-mail, perfil público e simples declarações não bastam. Sem comprovação suficiente, recuse sem emitir autorização. Novas evidências podem ser analisadas no mesmo atendimento. O aplicativo registra a autorização; a qualidade da verificação humana é responsabilidade operacional.

Sem acesso a qualquer endereço previamente verificado, não há destino seguro para este fluxo. Interrompa e siga a política operacional de recuperação de identidade; não aceite e-mail arbitrário, não exponha o TOTP e não desative o fator via SQL. SUPER_ADMIN mantém o procedimento no servidor e revisão reforçada. Nenhuma migration nova é necessária: os campos e snapshots existentes são suficientes.
