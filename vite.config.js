import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { criarPluginAssistenteDev } from './services/assistant-endpoint.js';
import { criarPluginAdminDev } from './services/admin/admin-endpoint.js';

const raiz = fileURLToPath(new URL('.', import.meta.url));

// Os endpoints do assistente (conteúdo de teste local) e do módulo administrativo (leitura local) existem somente
// no servidor de desenvolvimento (`npm run dev`). O build de produção e o preview não os incluem.
export default defineConfig({
  plugins: [criarPluginAssistenteDev({ raiz }), criarPluginAdminDev({ raiz })],
});
