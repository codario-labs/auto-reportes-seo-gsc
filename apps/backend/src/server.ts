import { createApp } from './app';
import { parseEnv } from './config/env';
import { createContainer } from './container';
import { createLogger } from './lib/logger';
import { createPrismaClient } from './lib/prisma';

async function main(): Promise<void> {
  const env = parseEnv();
  const logger = createLogger({ level: env.LOG_LEVEL, pretty: env.NODE_ENV === 'development' });
  const prisma = createPrismaClient(env.DATABASE_URL);
  await prisma.$connect();

  const container = createContainer(env, prisma, logger);
  await container.storage.init();
  await container.settings.get();

  const app = createApp(container);
  const server = app.listen(env.PORT, () => {
    logger.info(
      {
        port: env.PORT,
        google: container.google.isConfigured ? 'configured' : 'not configured',
        anthropic: container.anthropic.isConfigured ? `configured (${env.ANTHROPIC_MODEL})` : 'not configured',
        storage: container.storage.root,
      },
      'backend listening',
    );
  });
  // Generaciones largas (análisis IA + PDF) no deben cortarse por timeouts del servidor HTTP.
  server.requestTimeout = 0;
  server.headersTimeout = 65_000;

  await container.reports.recover();

  // Calienta Chromium en segundo plano y registra su disponibilidad.
  void container.renderer.isAvailable().then((available) => {
    container.pdfStatus.available = available;
    if (!available) logger.error('Chromium could not start: PDF generation is unavailable. Run "npx playwright install chromium".');
  });

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, 'shutting down');
    server.close();
    await container.queue.stop();
    await container.renderer.close();
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('unhandledRejection', (reason) => logger.error({ err: reason }, 'unhandled rejection'));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
