import { createReadStream, type ReadStream } from 'node:fs';
import { access, mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomToken } from './crypto';

export const STORAGE_DIRS = {
  reports: 'reports',
  logos: 'logos',
  branding: 'branding',
  tmp: 'tmp',
} as const;

/**
 * Almacenamiento persistente en disco (volumen Docker). Todas las rutas son relativas a la raíz
 * y se validan para impedir path traversal.
 */
export class StorageService {
  readonly root: string;

  constructor(root: string) {
    this.root = path.resolve(root);
  }

  async init(): Promise<void> {
    await Promise.all(Object.values(STORAGE_DIRS).map((dir) => mkdir(path.join(this.root, dir), { recursive: true })));
  }

  /** Resuelve una ruta relativa garantizando que queda dentro de la raíz. */
  resolve(relativePath: string): string {
    if (!relativePath || path.isAbsolute(relativePath) || relativePath.includes('\0')) {
      throw new Error('Invalid storage path');
    }
    const resolved = path.resolve(this.root, relativePath);
    if (!resolved.startsWith(this.root + path.sep)) {
      throw new Error('Storage path escapes the storage root');
    }
    return resolved;
  }

  /** Escritura atómica: archivo temporal + rename. */
  async write(relativePath: string, data: Buffer | Uint8Array): Promise<void> {
    const target = this.resolve(relativePath);
    await mkdir(path.dirname(target), { recursive: true });
    const tmp = this.resolve(path.join(STORAGE_DIRS.tmp, `${randomToken(12)}.part`));
    await writeFile(tmp, data);
    await rename(tmp, target);
  }

  async read(relativePath: string): Promise<Buffer> {
    return readFile(this.resolve(relativePath));
  }

  stream(relativePath: string): ReadStream {
    return createReadStream(this.resolve(relativePath));
  }

  async exists(relativePath: string): Promise<boolean> {
    try {
      await access(this.resolve(relativePath));
      return true;
    } catch {
      return false;
    }
  }

  async size(relativePath: string): Promise<number> {
    return (await stat(this.resolve(relativePath))).size;
  }

  async remove(relativePath: string | null | undefined): Promise<void> {
    if (!relativePath) return;
    await rm(this.resolve(relativePath), { force: true });
  }

  async removeDir(relativePath: string): Promise<void> {
    await rm(this.resolve(relativePath), { recursive: true, force: true });
  }

  async isWritable(): Promise<boolean> {
    const probe = path.join(STORAGE_DIRS.tmp, `probe-${randomToken(6)}`);
    try {
      await this.write(probe, Buffer.from('ok'));
      await this.remove(probe);
      return true;
    } catch {
      return false;
    }
  }
}

/** Nombre de archivo seguro para cabeceras Content-Disposition. */
export function safeFileName(value: string, fallback = 'file'): string {
  const cleaned = value
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    .slice(0, 120);
  return cleaned || fallback;
}
