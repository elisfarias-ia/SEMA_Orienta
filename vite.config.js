import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { criarPluginAssistenteDev } from './services/assistant-endpoint.js';
import { criarPluginAdminDev } from './services/admin/admin-endpoint.js';

const raiz = fileURLToPath(new URL('.', import.meta.url));

// A administração (pasta admin/: gestão de conteúdo e saúde do sistema) só existe no servidor de desenvolvimento:
// `/admin` leva a `/admin/` e `/admin/saude` leva a `/admin/saude/`.
// O build usa apenas o index.html da raiz, então admin/ não entra no dist/, e o preview serve só o dist/.
const REDIRECIONAMENTOS = { '/admin': '/admin/', '/admin/saude': '/admin/saude/' };
const redirecionarAdmin = {
  name: 'sema-orienta-admin-redirecionamento',
  apply: 'serve',
  configureServer(servidor) {
    servidor.middlewares.use((req, res, proximo) => {
      const destino = REDIRECIONAMENTOS[req.url];
      if (destino !== undefined) {
        res.statusCode = 302;
        res.setHeader('Location', destino);
        res.end();
        return;
      }
      proximo();
    });
  },
};

// Os endpoints do assistente (conteúdo de teste local) e do módulo administrativo (leitura e cadastro local) existem
// somente no servidor de desenvolvimento (`npm run dev`). O build de produção e o preview não os incluem.
export default defineConfig({
  plugins: [criarPluginAssistenteDev({ raiz }), criarPluginAdminDev({ raiz }), redirecionarAdmin],
});
