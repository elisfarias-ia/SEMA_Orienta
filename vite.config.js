import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { criarPluginAssistenteDev } from './services/assistant-endpoint.js';

// O endpoint do assistente (conteúdo de teste local) existe somente no servidor de desenvolvimento
// (`npm run dev`). O build de produção e o preview não o incluem.
export default defineConfig({
  plugins: [criarPluginAssistenteDev({ raiz: fileURLToPath(new URL('.', import.meta.url)) })],
});
