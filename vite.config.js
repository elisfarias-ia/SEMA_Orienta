import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { criarPluginAssistenteDev } from './services/assistant-endpoint.js';
import { criarPluginAdminDev } from './services/admin/admin-endpoint.js';

const raiz = fileURLToPath(new URL('.', import.meta.url));

// A tela de gestão de conteúdo (pasta admin/) só existe no servidor de desenvolvimento: `/admin` leva a `/admin/`.
// O build usa apenas o index.html da raiz, então admin/ não entra no dist/, e o preview serve só o dist/.
const redirecionarAdmin = {
  name: 'sema-orienta-admin-redirecionamento',
  apply: 'serve',
  configureServer(servidor) {
    servidor.middlewares.use((req, res, proximo) => {
      if (req.url === '/admin') {
        res.statusCode = 302;
        res.setHeader('Location', '/admin/');
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
