export interface StorageProvider {
  upload(folder: string, filename: string, buffer: Buffer, contentType: string): Promise<string>;
  delete(fileUrlOrPath: string): Promise<void>;
}
