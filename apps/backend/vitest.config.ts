import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    setupFiles: ['src/test/setup.ts'],
    globalSetup: ['src/test/global-setup.ts'],
    testTimeout: 90_000,
    hookTimeout: 120_000,
    // Los tests de integración comparten una base de datos de pruebas: ejecución secuencial por archivo.
    fileParallelism: false,
  },
});
