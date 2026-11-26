import { existsSync } from 'node:fs';
import path from 'node:path';

// Carga el .env del monorepo (si existe) para conocer la base de datos local de desarrollo.
const envFile = path.resolve(import.meta.dirname, '../../../../.env');
if (existsSync(envFile) && typeof process.loadEnvFile === 'function') {
  try {
    process.loadEnvFile(envFile);
  } catch {
    // sin .env: los tests de integración se omitirán
  }
}
process.env.NODE_ENV = 'test';
