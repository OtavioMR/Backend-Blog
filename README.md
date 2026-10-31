<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

[circleci-image]: https://img.shields.io/circleci/build/github/nestjs/nest/master?token=abc123def456
[circleci-url]: https://circleci.com/gh/nestjs/nest

  <p align="center">A progressive <a href="http://nodejs.org" target="_blank">Node.js</a> framework for building efficient and scalable server-side applications.</p>
    <p align="center">
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/v/@nestjs/core.svg" alt="NPM Version" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/l/@nestjs/core.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/dm/@nestjs/common.svg" alt="NPM Downloads" /></a>
<a href="https://circleci.com/gh/nestjs/nest" target="_blank"><img src="https://img.shields.io/circleci/build/github/nestjs/nest/master" alt="CircleCI" /></a>
<a href="https://discord.gg/G7Qnnhy" target="_blank"><img src="https://img.shields.io/badge/discord-online-brightgreen.svg" alt="Discord"/></a>
<a href="https://opencollective.com/nest#backer" target="_blank"><img src="https://opencollective.com/nest/backers/badge.svg" alt="Backers on Open Collective" /></a>
<a href="https://opencollective.com/nest#sponsor" target="_blank"><img src="https://opencollective.com/nest/sponsors/badge.svg" alt="Sponsors on Open Collective" /></a>
  <a href="https://paypal.me/kamilmysliwiec" target="_blank"><img src="https://img.shields.io/badge/Donate-PayPal-ff3f59.svg" alt="Donate us"/></a>
    <a href="https://opencollective.com/nest#sponsor"  target="_blank"><img src="https://img.shields.io/badge/Support%20us-Open%20Collective-41B883.svg" alt="Support us"></a>
  <a href="https://twitter.com/nestframework" target="_blank"><img src="https://img.shields.io/twitter/follow/nestframework.svg?style=social&label=Follow" alt="Follow us on Twitter"></a>
</p>
  <!--[![Backers on Open Collective](https://opencollective.com/nest/backers/badge.svg)](https://opencollective.com/nest#backer)
  [![Sponsors on Open Collective](https://opencollective.com/nest/sponsors/badge.svg)](https://opencollective.com/nest#sponsor)-->

## Description

[Nest](https://github.com/nestjs/nest) framework TypeScript starter repository.

## Project setup

```bash
$ npm install
```

## Compile and run the project

```bash
# development
$ npm run start

# watch mode
$ npm run start:dev

# production mode
$ npm run start:prod
```

## Run tests

```bash
# unit tests
$ npm run test

# e2e tests
$ npm run test:e2e

# test coverage
$ npm run test:cov
```

## Deployment

### Alteração de e-mail

Execute as migrations antes de iniciar a versão atual. Os tokens de acesso emitidos antes desta atualização deixarão de funcionar e exigirão novo login ou renovação. A solicitação de alteração em `PATCH /api/v1/users/:id` exige `currentPassword` e envia um token ao novo endereço usando o SMTP configurado. O e-mail anterior permanece ativo até a confirmação. Para confirmar sem frontend, envie `{"token":"TOKEN_RECEBIDO"}` para `POST /api/v1/users/confirm-email-change`, por exemplo usando o Swagger em `/api/docs`. O token expira em 30 minutos e é de uso único; após confirmar, o usuário deve autenticar novamente. Se o envio falhar, solicite um novo token.

### Limitação de requisições

As rotas dos controllers aceitam até 100 requisições por minuto, por IP e por rota. Login aceita 20, recuperação de senha 5 e redefinição de senha 10 por minuto; ao exceder o limite, a API responde com HTTP 429 e o cabeçalho `Retry-After`. Os contadores ficam na memória de cada processo e são reiniciados quando ele reinicia. Em múltiplas instâncias, é necessário um armazenamento compartilhado para aplicar um limite consistente.

O IP usado é o da conexão. Atrás de um proxy reverso, configure `trust proxy` no Express somente para proxies confiáveis da infraestrutura; sem isso, clientes podem compartilhar o mesmo limite, e confiar indiscriminadamente em cabeçalhos permite falsificar o IP. Arquivos estáticos não passam pelo guard dos controllers e precisam de proteção no proxy ou na infraestrutura. O Swagger fica desativado em produção.

When you're ready to deploy your NestJS application to production, there are some key steps you can take to ensure it runs as efficiently as possible. Check out the [deployment documentation](https://docs.nestjs.com/deployment) for more information.

If you are looking for a cloud-based platform to deploy your NestJS application, check out [Mau](https://mau.nestjs.com), our official platform for deploying NestJS applications on AWS. Mau makes deployment straightforward and fast, requiring just a few simple steps:

```bash
$ npm install -g @nestjs/mau
$ mau deploy
```

With Mau, you can deploy your application in just a few clicks, allowing you to focus on building features rather than managing infrastructure.

## Observability

In production applications, observability is essential for understanding how your system behaves, detecting issues early, and maintaining reliable performance.

[NestJS Observe](https://observe.nestjs.com) automatically instruments your NestJS application, giving you deep visibility into your system with minimal setup:

- **Distributed tracing:** Follow requests across services and understand how they flow through your system.
- **Waterfall analysis:** Visualize request execution and identify slow operations, bottlenecks, and unexpected delays.
- **Performance analysis:** Analyze application performance in real time and quickly pinpoint areas that need optimization.
- **Metrics:** Track key application and infrastructure metrics to understand system health and performance trends.
- **Logging:** Centralize and correlate logs with traces and other telemetry to make debugging easier.
- **Error tracking:** Detect errors quickly and investigate their root causes with the surrounding context.
- **SLA monitoring:** Track service-level objectives and identify when your application is approaching or exceeding defined thresholds.
- **Alarms and alerts:** Set up alerts for critical errors, performance degradation, SLA violations, and other anomalies so your team can react quickly.

This project is already instrumented. To connect it, run this and approve the code it prints at [observe.nestjs.com/link](https://observe.nestjs.com/link) - signing up for free if you have no account:

```bash
$ npx @nestjs/observe link
```

It writes the app key and secret into `.env` and makes every `nest start` script (`start`, `start:dev`, `start:debug`) load it. In production, set `OBSERVE_APP_KEY` and `OBSERVE_APP_SECRET` in the environment instead.

Or do it by hand: create an application and an API key at [observe.nestjs.com](https://observe.nestjs.com), and set the pair as `OBSERVE_APP_KEY` and `OBSERVE_APP_SECRET` in the environment the app runs in.

The free plan needs no payment details and covers 300,000 events a month. You can also browse the [live demo](https://www.observe-demo.nestjs.com/dashboard) first - the whole dashboard over a busy service's data, with nothing to install.

## Resources

Check out a few resources that may come in handy when working with NestJS:

- Visit the [NestJS Documentation](https://docs.nestjs.com) to learn more about the framework.
- For questions and support, please visit our [Discord channel](https://discord.gg/G7Qnnhy).
- To dive deeper and get more hands-on experience, check out our official video [courses](https://courses.nestjs.com/).
- Deploy your application to AWS with the help of [NestJS Mau](https://mau.nestjs.com) in just a few clicks.
- Auto-instrument your application with [NestJS Observe](https://observe.nestjs.com). Distributed tracing, metrics, and logging made easy. Error tracking and performance monitoring for your NestJS applications.
- Visualize your application graph and interact with the NestJS application in real-time using [NestJS Devtools](https://devtools.nestjs.com).
- Need help with your project (part-time to full-time)? Check out our official [enterprise support](https://enterprise.nestjs.com).
- To stay in the loop and get updates, follow us on [X](https://x.com/nestframework) and [LinkedIn](https://linkedin.com/company/nestjs).
- Looking for a job, or have a job to offer? Check out our official [Jobs board](https://jobs.nestjs.com).

## Support

Nest is an MIT-licensed open source project. It can grow thanks to the sponsors and support by the amazing backers. If you'd like to join them, please [read more here](https://docs.nestjs.com/support).

## Stay in touch

- Author - [Kamil Myśliwiec](https://twitter.com/kammysliwiec)
- Website - [https://nestjs.com](https://nestjs.com/)
- Twitter - [@nestframework](https://twitter.com/nestframework)

## License

Nest is [MIT licensed](https://github.com/nestjs/nest/blob/master/LICENSE).


### Sprint 2: operacao e compatibilidade

Execute `npm.cmd run migration:run` antes de iniciar a nova versao. Contas existentes permanecem verificadas; novos cadastros recebem um token valido por 24 horas por SMTP. Confirme com `POST /api/v1/users/confirm-email` e `{ "token": "..." }`. Se necessario, solicite outro token com `POST /api/v1/users/resend-verification` e `{ "email": "..." }`; a resposta nao revela se a conta existe. O login exige a confirmacao. Falhas no envio sao registradas e permitem uma nova solicitacao.

Apos cinco senhas incorretas, a conta fica temporariamente bloqueada; novas falhas apos o vencimento aumentam o prazo ate uma hora. A resposta de autenticacao continua generica.

As listagens de posts, rascunhos proprios e salvos retornam `excerpt` em vez de `content`; o conteudo completo permanece no detalhe. `publishedAt` indica a ultima publicacao e e nulo em rascunhos; posts publicados existentes usam `createdAt` como aproximacao. HTML de artigos e limitado a uma lista segura, e comentarios sao tratados como texto. Os metadados de paginacao de comentarios agora incluem `totalPages` e `hasPreviousPage`.

Fotos sao convertidas para WebP e limitadas a 512 pixels. Para limpar arquivos sem referencia com mais de 24 horas, execute `npm.cmd run photos:clean` para inspecionar os candidatos e `npm.cmd run photos:clean -- --apply` para remove-los, com acesso ao banco correto e ao diretorio de uploads. O comando pode ser agendado na infraestrutura. O endpoint `GET /api/v1/health` verifica o banco. Para exportar traces, configure `OTEL_EXPORTER_OTLP_ENDPOINT` (ou `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT`) e `OTEL_SERVICE_NAME`; o SDK fica desativado sem endpoint. O Swagger fica desativado em producao.
