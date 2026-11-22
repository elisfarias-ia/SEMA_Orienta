// Última verificação do teste real: as pastas services/ e data/ REAIS têm de estar idênticas (caminho + bytes) ao que eram antes
// de tudo. data/ real (Sprint 8, Passo 8E): se não existia no início, tem de continuar sem existir.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';
import { hashDaPasta, estadoDaPasta } from './preparar.js';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('a pasta services/ real não foi alterada pelo teste real', () => {
  expect(process.env.SEMA_REAL_HASH_ANTES).toMatch(/^[0-9a-f]{64}$/);
  expect(hashDaPasta(path.join(RAIZ, 'services'))).toBe(process.env.SEMA_REAL_HASH_ANTES);
});

test('a pasta data/ real não foi alterada pelo teste real', () => {
  expect(process.env.SEMA_REAL_DATA_ANTES).toMatch(/^([0-9a-f]{64}|ausente)$/);
  expect(estadoDaPasta(path.join(RAIZ, 'data'))).toBe(process.env.SEMA_REAL_DATA_ANTES);
});
