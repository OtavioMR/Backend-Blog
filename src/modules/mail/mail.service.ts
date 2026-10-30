import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: Transporter | null = null;

  constructor(private readonly configService: ConfigService) {
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

  async sendPasswordResetEmail(
    email: string,
    resetLink: string,
    userName?: string,
  ): Promise<void> {
    const from = this.configService.get<string>(
      'SMTP_FROM',
      'noreply@blog.com',
    );
    const subject = 'Recuperação de Senha';
    const text = `Olá${userName ? ` ${userName}` : ''},\n\nRecebemos uma solicitação para redefinir a sua senha.\nClique no link abaixo (ou cole no navegador) para redefinir sua senha. O link é válido por 30 minutos:\n\n${resetLink}\n\nSe você não solicitou a redefinição de senha, por favor desconsidere este e-mail.`;
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2>Recuperação de Senha</h2>
        <p>Olá${userName ? ` <strong>${userName}</strong>` : ''},</p>
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

    if (this.transporter) {
      try {
        await this.transporter.sendMail({
          from,
          to: email,
          subject,
          text,
          html,
        });
        this.logger.log(
          `E-mail de recuperação de senha enviado com sucesso para ${email}`,
        );
      } catch (error) {
        this.logger.error(
          `Falha ao enviar e-mail via SMTP para ${email}: ${(error as Error).message}`,
          (error as Error).stack,
        );
      }
    } else {
      this.logger.warn(
        `[SIMULAÇÃO DE EMAIL] SMTP não configurado. Link de recuperação para ${email}: ${resetLink}`,
      );
    }
  }
}
