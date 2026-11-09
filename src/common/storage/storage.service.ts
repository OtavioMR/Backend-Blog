import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { StorageProvider } from './storage-provider.interface.js';
import { LocalStorageProvider } from './local-storage.provider.js';
import { VercelBlobStorageProvider } from './vercel-blob.provider.js';

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly provider: StorageProvider;

  constructor(private readonly config: ConfigService) {
    const driver = this.config.get<string>('STORAGE_DRIVER', 'local');
    const token = this.config.get<string>('BLOB_READ_WRITE_TOKEN');

    if (driver === 'vercel-blob' && token) {
      this.provider = new VercelBlobStorageProvider(token);
      this.logger.log('StorageProvider: Vercel Blob ativo');
    } else {
      this.provider = new LocalStorageProvider();
      this.logger.log('StorageProvider: Armazenamento local ativo');
    }
  }

  async processAndStoreProfilePhoto(buffer: Buffer): Promise<string> {
    let image: Buffer;
    try {
      const input = sharp(buffer, { limitInputPixels: 40_000_000, failOn: 'error' });
      const metadata = await input.metadata();
      if (!['jpeg', 'png', 'webp'].includes(metadata.format ?? '') || (metadata.pages ?? 1) > 1) {
        throw new Error('Invalid image');
      }
      image = await input.rotate().resize(512, 512, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 80 }).toBuffer();
    } catch {
      throw new BadRequestException('A imagem deve ser JPEG, PNG ou WebP válida.');
    }
    const filename = `${randomUUID()}.webp`;
    return this.provider.upload('profile-photos', filename, image, 'image/webp');
  }

  async processAndStorePostCover(buffer: Buffer): Promise<string> {
    let image: Buffer;
    try {
      const input = sharp(buffer, { limitInputPixels: 40_000_000, failOn: 'error' });
      const metadata = await input.metadata();
      if (!['jpeg', 'png', 'webp'].includes(metadata.format ?? '') || (metadata.pages ?? 1) > 1) {
        throw new Error('Invalid image');
      }
      image = await input.rotate().resize(1920, 1080, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 80 }).toBuffer();
    } catch {
      throw new BadRequestException('A imagem deve ser JPEG, PNG ou WebP válida.');
    }
    const filename = `${randomUUID()}.webp`;
    return this.provider.upload('post-covers', filename, image, 'image/webp');
  }

  async delete(urlOrPath: string | null | undefined): Promise<void> {
    if (!urlOrPath) return;
    try {
      await this.provider.delete(urlOrPath);
    } catch (error) {
      this.logger.warn(`Falha ao remover arquivo ${urlOrPath}: ${(error as Error).message}`);
    }
  }
}
