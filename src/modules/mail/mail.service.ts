import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { escapeHtml } from '../../common/utils/escape-html.js';
import { MailQueueService } from './mail-queue.service.js';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: Transporter | null = null;

  constructor(private readonly configService: ConfigService, private readonly queue: MailQueueService) {
    const host = this.configService.get<string>('SMTP_HOST');
    const port = this.configService.get<number>('SMTP_PORT');
    const user = this.configService.get<string>('SMTP_USER');
    const pass = this.configService.get<string>('SMTP_PASS');

    if (host && port) {
      this.transporter = nodemailer.createTransport({
        host,
        port: Number(port),
        secure: Number(port) === 465,
        auth: user && pass ? { user, pass } : undefined,
      });
      this.logger.log(`Transporter SMTP configurado para ${host}:${port}`);
    } else {
      this.logger.log(
        'Transporter SMTP não configurado. Ativando modo de fallback em log.',
      );
    }
  }

  async sendEmailVerification(email: string, token: string): Promise<void> {
    await this.queue.enqueue({
      expiresAt: Date.now() + 24 * 60 * 60 * 1000,
      to: email,
      subject: 'Confirme seu e-mail',
      text: `Para verificar sua conta, envie o token para POST /api/v1/users/confirm-email em até 24 horas: ${token}`,
    });
  }

  async sendNewsletterConfirmation(email: string, token: string): Promise<void> {
    const url = this.newsletterLink('confirm', token);
    await this.queue.enqueue({
      expiresAt: Date.now() + 24 * 60 * 60 * 1000, to: email,
      subject: 'Confirme sua inscrição na newsletter',
      text: `Confirme sua inscrição em até 24 horas: ${url}\nSe não solicitou a inscrição, ignore esta mensagem.`,
      html: `<p><a href="${escapeHtml(url)}">Confirmar inscrição</a></p><p>O link é válido por 24 horas. Se não solicitou, ignore esta mensagem.</p>`,
    });
  }

  async sendNewsletterPost(email: string, title: string, slug: string, unsubscribeToken: string): Promise<void> {
    if (!this.transporter) throw new Error('SMTP not configured');
    const base = this.configService.getOrThrow<string>('FRONTEND_URL').replace(/\/+$/, '');
    const url = `${base}/posts/${encodeURIComponent(slug)}`;
    await this.transporter.sendMail({
      from: this.configService.get<string>('SMTP_FROM', 'noreply@blog.com'), to: email,
      subject: `Novo artigo: ${title.replace(/[\r\n]/g, ' ')}`,
      text: `Novo artigo: ${title}\n${url}\n\nCancelar inscrição: ${this.newsletterLink('unsubscribe', unsubscribeToken)}`,
    });
  }

  private newsletterLink(action: 'confirm' | 'unsubscribe', token: string): string {
    const base = this.configService.get<string>('PUBLIC_API_URL') ?? `http://localhost:${this.configService.get<number>('PORT') ?? 3000}`;
    return `${base.replace(/\/+$/, '')}/api/v1/newsletter/${action}?token=${encodeURIComponent(token)}`;
  }

  async sendEmailChangeConfirmation(email: string, token: string): Promise<void> {
    await this.queue.enqueue({
      expiresAt: Date.now() + 30 * 60 * 1000,
      to: email,
      subject: 'Confirme seu novo e-mail',
      text: `Para confirmar seu novo e-mail, envie este token no campo token de POST /api/v1/users/confirm-email-change em até 30 minutos:\n\n${token}\n\nSe você não solicitou esta alteração, ignore esta mensagem.`,
      html: `<p>Para confirmar seu novo e-mail, envie este token no campo <code>token</code> de <code>POST /api/v1/users/confirm-email-change</code> em até 30 minutos:</p><p><code>${escapeHtml(token)}</code></p><p>Se você não solicitou esta alteração, ignore esta mensagem.</p>`,
    });
  }

  async sendPasswordResetEmail(
    email: string,
    resetLink: string,
    userName?: string,
  ): Promise<void> {
    const subject = 'Recuperação de Senha';
    const text = `Olá${userName ? ` ${userName}` : ''},\n\nRecebemos uma solicitação para redefinir a sua senha.\nClique no link abaixo (ou cole no navegador) para redefinir sua senha. O link é válido por 30 minutos:\n\n${resetLink}\n\nSe você não solicitou a redefinição de senha, por favor desconsidere este e-mail.`;
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2>Recuperação de Senha</h2>
        <p>Olá${userName ? ` <strong>${escapeHtml(userName)}</strong>` : ''},</p>
        <p>Recebemos uma solicitação para redefinir a sua senha no Blog.</p>
        <p>Clique no botão abaixo para redefinir sua senha. Este link é válido por <strong>30 minutos</strong>:</p>
        <p style="text-align: center; margin: 30px 0;">
          <a href="${resetLink}" style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Redefinir Minha Senha</a>
        </p>
        <p>Ou copie e cole o seguinte link no seu navegador:</p>
        <p><a href="${resetLink}">${resetLink}</a></p>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;" />
        <p style="color: #6b7280; font-size: 13px;">Se você não solicitou a alteração de sua senha, ignore este e-mail com segurança.</p>
      </div>
    `;

    await this.queue.enqueue({ to: email, subject, text, html, expiresAt: Date.now() + 30 * 60 * 1000 });
  }
}
