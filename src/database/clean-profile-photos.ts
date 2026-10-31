import { readdir, lstat, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import dataSource from './data-source.js';

// A grace period protects uploads whose database transaction is still in progress.
const directory = join(process.cwd(), 'uploads', 'profile-photos');
const cutoff = Date.now() - 24 * 60 * 60 * 1000;
const apply = process.argv.includes('--apply');
await dataSource.initialize();
try {
  const names = await readdir(directory).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return [];
    throw error;
  });
  for (const name of names) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(?:jpg|png|webp)$/i.test(name)) continue;
    const path = join(directory, name);
    const file = await lstat(path).catch(() => null);
    if (!file?.isFile() || file.mtimeMs >= cutoff) continue;
    const references: unknown[] = await dataSource.query('SELECT 1 FROM users WHERE profile_photo = $1 LIMIT 1', [`/uploads/profile-photos/${name}`]);
    if (!references.length) {
      console.log(`${apply ? 'Removing' : 'Would remove'} ${name}`);
      if (apply) await unlink(path).catch((error: NodeJS.ErrnoException) => { if (error.code !== 'ENOENT') throw error; });
    }
  }
} finally {
  await dataSource.destroy();
}
