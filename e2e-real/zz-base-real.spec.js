// Última verificação do teste real: a pasta services/ REAL tem de estar idêntica (caminho + bytes) ao que era antes de tudo.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';
import { hashDaPasta } from './preparar.js';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('a pasta services/ real não foi alterada pelo teste real', () => {
  expect(process.env.SEMA_REAL_HASH_ANTES).toMatch(/^[0-9a-f]{64}$/);
  expect(hashDaPasta(path.join(RAIZ, 'services'))).toBe(process.env.SEMA_REAL_HASH_ANTES);
});
