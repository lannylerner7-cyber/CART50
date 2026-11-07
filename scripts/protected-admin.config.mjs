import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';

export default defineConfig({
  testDir: './protected-admin',
  testMatch: '*.spec.mjs',
  workers: 1,
  retries: 0,
  timeout: 120_000,
  expect: { timeout: 10_000 },
  reporter: 'list',
  outputDir: '../generated-artifacts/protected-admin',
  use: {
    baseURL: 'https://localhost:4443',
    ignoreHTTPSErrors: true,
    serviceWorkers: 'block',
    // Never retain credential-bearing traces, videos, or storage state.
    trace: 'off',
    screenshot: 'off',
    video: 'off',
    launchOptions: {
      ...(existsSync('/repl/tools/bin/chromium') ? { executablePath: '/repl/tools/bin/chromium' } : {}),
      args: ['--no-sandbox', '--disable-background-networking'],
    },
  },
});
