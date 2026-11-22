// Infraestrutura do teste real: copia services/ para uma pasta temporária, sobe o Vite programático em localhost:5183
// com os plugins administrativo e do assistente apontando para a cópia, e confere por hash que services/ e data/ reais não mudaram
// (Sprint 8, Passo 8E: data/ real também é conferida; se não existia, tem de continuar sem existir).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { criarPluginAdminDev } from '../services/admin/admin-endpoint.js';
import { criarPluginAssistenteDev } from '../services/assistant-endpoint.js';
import { criarPluginConteudoPublico } from '../services/conteudo-publico-build.js';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORTA = 5183;

/** Hash de caminho relativo + bytes de todos os arquivos da pasta, em ordem fixa. */
export function hashDaPasta(pasta) {
  const hash = crypto.createHash('sha256');
  const visitar = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      const caminho = path.join(dir, e.name);
      if (e.isDirectory()) visitar(caminho);
      else {
        hash.update(path.relative(pasta, caminho).split(path.sep).join('/'));
        hash.update('\0');
        hash.update(fs.readFileSync(caminho));
        hash.update('\0');
      }
    }
  };
  visitar(pasta);
  return hash.digest('hex');
}

/** Estado de uma pasta para a conferência final: o hash (hashDaPasta) ou 'ausente', se ela não existir. */
export function estadoDaPasta(pasta) {
  return fs.existsSync(pasta) ? hashDaPasta(pasta) : 'ausente';
}

const redirecionarAdmin = {
  name: 'teste-real-redirecionamento-admin',
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

export default async function preparar() {
  const servicosReais = path.join(RAIZ, 'services');
  const antes = hashDaPasta(servicosReais);
  const dadosReais = path.join(RAIZ, 'data');
  const dadosAntes = estadoDaPasta(dadosReais);
  const copia = fs.mkdtempSync(path.join(os.tmpdir(), 'sema-real-'));
  fs.cpSync(servicosReais, path.join(copia, 'services'), { recursive: true });
  process.env.SEMA_REAL_COPIA = copia;
  process.env.SEMA_REAL_HASH_ANTES = antes;
  process.env.SEMA_REAL_DATA_ANTES = dadosAntes;

  const servidor = await createServer({
    configFile: false,
    root: RAIZ,
    logLevel: 'error',
    server: { port: PORTA, strictPort: true, host: 'localhost' },
    plugins: [criarPluginAdminDev({ raiz: copia }), criarPluginAssistenteDev({ raiz: copia }), criarPluginConteudoPublico({ raiz: copia }), redirecionarAdmin],
  });
  await servidor.listen();

  return async () => {
    await servidor.close();
    fs.rmSync(copia, { recursive: true, force: true });
    const depois = hashDaPasta(servicosReais);
    if (depois !== antes) throw new Error('A pasta services/ real mudou durante o teste real.');
    if (estadoDaPasta(dadosReais) !== dadosAntes) throw new Error('A pasta data/ real mudou durante o teste real.');
  };
}
