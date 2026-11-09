import { join } from 'node:path';
import { mkdir, writeFile, unlink } from 'node:fs/promises';
import { StorageProvider } from './storage-provider.interface.js';

export class LocalStorageProvider implements StorageProvider {
  private readonly root = join(process.cwd(), 'uploads');

  async upload(folder: string, filename: string, buffer: Buffer): Promise<string> {
    const dir = join(this.root, folder);
    await mkdir(dir, { recursive: true });
    const fullPath = join(dir, filename);
    await writeFile(fullPath, buffer, { flag: 'wx' });
    return `/uploads/${folder}/${filename}`;
  }

  async delete(fileUrlOrPath: string): Promise<void> {
    const match = fileUrlOrPath.match(/^\/uploads\/([^/]+)\/([0-9a-f-]+\.[a-z0-9]+)$/i);
    if (!match) return;
    const fullPath = join(this.root, match[1], match[2]);
    await unlink(fullPath).catch(() => undefined);
  }
}
