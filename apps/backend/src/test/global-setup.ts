import { PrismaClient } from '@prisma/client';
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import type { TestProject } from 'vitest/node';

declare module 'vitest' {
  export interface ProvidedContext {
    testDatabaseUrl: string | null;
  }
}

/**
 * Prepara una base de datos de pruebas aislada (<db>_test) en el PostgreSQL local y aplica las migraciones.
 * Si no hay PostgreSQL disponible, los tests de integración se omiten.
 */
export default async function setup(project: TestProject): Promise<void> {
  const envFile = path.resolve(import.meta.dirname, '../../../../.env');
  if (existsSync(envFile)) process.loadEnvFile(envFile);
  const baseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!baseUrl) {
    project.provide('testDatabaseUrl', null);
    return;
  }
  const url = new URL(baseUrl);
  const dbName = url.pathname.replace(/^\//, '') || 'postgres';
  const testDb = process.env.TEST_DATABASE_URL ? dbName : `${dbName}_test`;
  url.pathname = `/${testDb}`;
  const testUrl = url.toString();

  const admin = new PrismaClient({ datasources: { db: { url: baseUrl } } });
  try {
    await admin.$connect();
    const exists = await admin.$queryRawUnsafe<Array<{ exists: boolean }>>(
      `SELECT EXISTS (SELECT 1 FROM pg_database WHERE datname = '${testDb.replace(/'/g, "''")}') AS "exists"`,
    );
    if (!exists[0]?.exists) await admin.$executeRawUnsafe(`CREATE DATABASE "${testDb.replace(/"/g, '')}"`);
  } catch (error) {
    console.warn(`[tests] PostgreSQL not reachable (${(error as Error).message}). Integration tests will be skipped.`);
    project.provide('testDatabaseUrl', null);
    return;
  } finally {
    await admin.$disconnect().catch(() => undefined);
  }

  execSync('npx prisma migrate deploy', {
    cwd: path.resolve(import.meta.dirname, '../..'),
    env: { ...process.env, DATABASE_URL: testUrl },
    stdio: 'pipe',
  });
  project.provide('testDatabaseUrl', testUrl);
}
