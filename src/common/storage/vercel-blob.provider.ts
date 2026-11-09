import { StorageProvider } from './storage-provider.interface.js';

export class VercelBlobStorageProvider implements StorageProvider {
  constructor(private readonly token: string) {}

  async upload(folder: string, filename: string, buffer: Buffer, contentType: string): Promise<string> {
    const pathname = `${folder}/${filename}`;
    const response = await fetch(`https://blob.vercel-storage.com/${pathname}`, {
      method: 'PUT',
      headers: {
        authorization: `Bearer ${this.token}`,
        'x-add-random-suffix': 'false',
        'content-type': contentType,
      },
      body: new Uint8Array(buffer),
    });
    if (!response.ok) {
      throw new Error(`Falha no armazenamento Vercel Blob: ${response.statusText}`);
    }
    const data = (await response.json()) as { url: string };
    return data.url;
  }

  async delete(fileUrlOrPath: string): Promise<void> {
    if (!fileUrlOrPath.startsWith('http')) return;
    await fetch('https://blob.vercel-storage.com/delete', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ urls: [fileUrlOrPath] }),
    }).catch(() => undefined);
  }
}
