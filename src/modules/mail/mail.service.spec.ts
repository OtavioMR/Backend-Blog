import { ConfigService } from '@nestjs/config';
import nodemailer from 'nodemailer';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MailService } from './mail.service.js';

describe('MailService', () => {
  afterEach(() => vi.restoreAllMocks());

  it('escapes markup in the user name in the HTML email', async () => {
    const sendMail = vi.fn().mockResolvedValue({});
    vi.spyOn(nodemailer, 'createTransport').mockReturnValue({ sendMail } as never);
    const config = { get: (key: string) => ({ SMTP_HOST: 'localhost', SMTP_PORT: 25 }[key]) };
    const service = new MailService(config as ConfigService);
    const name = `<a href="https://evil.example">Click & 'go'</a>`;

    await service.sendPasswordResetEmail('user@example.com', 'https://example.com/reset', name);

    expect(sendMail).toHaveBeenCalledOnce();
    const message = sendMail.mock.calls[0][0] as { html: string; text: string };
    expect(message.html).toContain(
      '<strong>&lt;a href=&quot;https://evil.example&quot;&gt;Click &amp; &#39;go&#39;&lt;/a&gt;</strong>',
    );
    expect(message.html).not.toContain(name);
    expect(message.text).toContain(name);
  });
});
