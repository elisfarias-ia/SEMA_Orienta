// Testes de ponta a ponta (Playwright, só Chromium) contra o servidor local do Vite, sem --host e com porta estrita.
// Os testes são somente leitura: veja e2e/base.js. Relatórios e artefatos de falha ficam fora do Git.
import { defineConfig, devices } from '@playwright/test';

// A porta pode ser trocada por E2E_PORTA (útil para não colidir com um servidor de desenvolvimento já aberto em 5173).
const PORTA = process.env.E2E_PORTA ?? '5173';

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.js',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  outputDir: 'test-results',
  use: {
    baseURL: `http://localhost:${PORTA}`,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `npx vite --port ${PORTA} --strictPort`,
    url: `http://localhost:${PORTA}/`,
    reuseExistingServer: false,
    timeout: 60_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
