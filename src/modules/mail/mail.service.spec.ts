import { ConfigService } from '@nestjs/config';
import nodemailer from 'nodemailer';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MailService } from './mail.service.js';

describe('MailService', () => {
  afterEach(() => vi.restoreAllMocks());

  it('envia o token e as instruções de confirmação pela API', async () => {
    const sendMail = vi.fn().mockResolvedValue({});
    vi.spyOn(nodemailer, 'createTransport').mockReturnValue({ sendMail } as never);
    const config = { get: (key: string) => ({ SMTP_HOST: 'localhost', SMTP_PORT: 25 }[key]) };
    const enqueue = vi.fn().mockResolvedValue(undefined);
    const service = new MailService(config as ConfigService, { enqueue } as never);
    const token = 'a'.repeat(64);
    await service.sendEmailChangeConfirmation('novo@example.com', token);
    const message = enqueue.mock.calls[0][0] as { to: string; text: string; html: string };
    expect(message.to).toBe('novo@example.com');
    expect(message.text).toContain(token);
    expect(message.text).toContain('POST /api/v1/users/confirm-email-change');
    expect(message.html).toContain(token);
  });

  it('escapes markup in the user name in the HTML email', async () => {
    const sendMail = vi.fn().mockResolvedValue({});
    vi.spyOn(nodemailer, 'createTransport').mockReturnValue({ sendMail } as never);
    const config = { get: (key: string) => ({ SMTP_HOST: 'localhost', SMTP_PORT: 25 }[key]) };
    const enqueue = vi.fn().mockResolvedValue(undefined);
    const service = new MailService(config as ConfigService, { enqueue } as never);
    const name = `<a href="https://evil.example">Click & 'go'</a>`;

    await service.sendPasswordResetEmail('user@example.com', 'https://example.com/reset', name);

    expect(enqueue).toHaveBeenCalledOnce();
    const message = enqueue.mock.calls[0][0] as { html: string; text: string };
    expect(message.html).toContain(
      '<strong>&lt;a href=&quot;https://evil.example&quot;&gt;Click &amp; &#39;go&#39;&lt;/a&gt;</strong>',
    );
    expect(message.html).not.toContain(name);
    expect(message.text).toContain(name);
  });

  it('includes working confirmation and unsubscribe URLs using the public API origin', async () => {
    const sendMail = vi.fn().mockResolvedValue({});
    vi.spyOn(nodemailer, 'createTransport').mockReturnValue({ sendMail } as never);
    const values: Record<string, unknown> = { SMTP_HOST: 'localhost', SMTP_PORT: 25, PUBLIC_API_URL: 'https://api.example.test/', FRONTEND_URL: 'https://blog.example.test' };
    const enqueue = vi.fn().mockResolvedValue(undefined);
    const service = new MailService({ get: (key: string) => values[key], getOrThrow: (key: string) => values[key] } as ConfigService, { enqueue } as never);
    await service.sendNewsletterConfirmation('reader@example.test', 'token');
    expect(enqueue.mock.calls[0][0].text).toContain('https://api.example.test/api/v1/newsletter/confirm?token=token');
    await service.sendNewsletterPost('reader@example.test', 'Title', 'article', 'unsubscribe-token');
    expect(sendMail.mock.calls[0][0].text).toContain('https://api.example.test/api/v1/newsletter/unsubscribe?token=unsubscribe-token');
  });
});
