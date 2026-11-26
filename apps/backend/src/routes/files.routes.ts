import { Router } from 'express';
import path from 'node:path';
import type { Container } from '../container';
import { Errors } from '../lib/errors';
import { STORAGE_DIRS } from '../lib/storage';
import { mimeFromExtension } from '../lib/uploads';

const SAFE_FILE = /^[A-Za-z0-9_-]+\.(png|jpg|webp|svg)$/;

/** Cabeceras para servir imágenes subidas sin riesgo de ejecución de contenido activo. */
const imageHeaders = (mime: string) => ({
  'Content-Type': mime,
  'X-Content-Type-Options': 'nosniff',
  'Content-Security-Policy': "default-src 'none'; img-src data:; style-src 'unsafe-inline'; sandbox",
  'Cache-Control': 'private, max-age=3600',
  'Cross-Origin-Resource-Policy': 'same-origin',
});

export function filesRoutes(c: Container): Router {
  const router = Router();

  router.get('/logos/:fileName', async (req, res) => {
    const fileName = req.params.fileName ?? '';
    // Solo nombres generados por el servidor: impide path traversal.
    if (!SAFE_FILE.test(fileName)) throw Errors.notFound('File');
    const relative = path.posix.join(STORAGE_DIRS.logos, fileName);
    if (!(await c.storage.exists(relative))) throw Errors.notFound('File');
    res.set(imageHeaders(mimeFromExtension(fileName))).send(await c.storage.read(relative));
  });

  router.get('/branding/logo', async (_req, res) => {
    const logo = await c.settings.getGlobalLogo();
    if (!logo) throw Errors.notFound('Logo');
    res.set(imageHeaders(logo.mime)).send(logo.buffer);
  });

  return router;
}
