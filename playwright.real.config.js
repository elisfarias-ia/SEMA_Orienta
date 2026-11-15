// Teste real da área administrativa: servidor do Vite de verdade (porta 5183, só localhost), sem simular rotas.
// A base de serviços é uma CÓPIA temporária fora do repositório; a pasta services/ real não pode mudar (conferida por hash).
// Não interfere em `npm run test:e2e` (que usa ./e2e) nem na porta 5173 do servidor de desenvolvimento.
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e-real',
  testMatch: '**/*.spec.js',
  globalSetup: './e2e-real/preparar.js',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  reporter: [['list']],
  outputDir: 'test-results/real',
  use: {
    baseURL: 'http://localhost:5183',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
