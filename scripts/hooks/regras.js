// Regras puras do pre-commit (Sprint 6, Passo 6B). Também serão usadas pela verificação no GitHub (Passo 6D).
//
// Nenhuma função aqui lê arquivos, executa o Git ou acessa a rede: tudo é recebido por parâmetro.
// As mensagens nunca repetem o valor encontrado (segredo, e-mail, telefone ou CPF).
//
//   B1  arquivo novo ou alterado em services/<serviço>/publico/ sem publicação autorizada registrada;
//   B2  mudança para publicação ou validação no registry.json e nos versao.json sem autorização registrada;
//   B3  arquivo que nunca pode ser versionado (data/, dist/, node_modules/, test-results/, .env, .webm, configurações locais);
//   B4  possível segredo ou dado pessoal nas linhas adicionadas;
//   B5  build com conteúdo administrativo ou de teste (a execução do build fica em pre-commit.js).

export const ARQUIVO_AUTORIZACOES = '.githooks/publicacoes-autorizadas.json';

// Domínios de e-mail que podem aparecer em arquivos versionados (lista documentada em docs/ADMINISTRACAO.md).
export const DOMINIOS_EMAIL_PERMITIDOS = Object.freeze([
  'sema.mt.gov.br', // domínio institucional
  'orgaoexemplo.gov.br', // domínio fictício dos usuários de demonstração (Maria Silva e Carlos Silva)
  'example.com', // domínios reservados para documentação (RFC 2606)
  'example.org',
  'example.net',
]);

// Pastas de testes: podem ter e-mails e telefones fictícios de propósito; segredos continuam proibidos nelas.
const PASTAS_DE_TESTE = ['tests/', 'e2e/', 'e2e-real/', 'e2e-demo/'];

export const MENSAGENS = Object.freeze({
  B0: 'Commit bloqueado: não foi possível validar o commit. Tente novamente; se persistir, revise o que está sendo commitado.',
  B1: 'Commit bloqueado (B1): conteúdo público (services/<serviço>/publico/) só entra com publicação autorizada registrada em .githooks/publicacoes-autorizadas.json.',
  B2: 'Commit bloqueado (B2): mudança de validação ou publicação sem autorização registrada (registry.json ou versao.json).',
  B3: 'Commit bloqueado (B3): este arquivo não pode ser versionado.',
  B4: 'Commit bloqueado (B4): possível segredo ou dado pessoal. O valor não é mostrado; revise a linha indicada.',
  B5: 'Commit bloqueado (B5): o build conteria conteúdo administrativo ou de teste, ou não pôde ser gerado. Rode "npm run build" e "node scripts/check-dist.js" para ver o detalhe.',
});

const normalizar = (caminho) => String(caminho).replace(/\\/g, '/').replace(/^\.\//, '');

// ---------- B3 ----------

export function ehArquivoProibido(caminho) {
  const c = normalizar(caminho);
  const partes = c.split('/');
  if (['data', 'dist', 'node_modules', 'test-results', 'playwright-report'].includes(partes[0])) return true;
  if (['.claude/settings.local.json', '.claude/launch.json', '.claude/liberacao-protecao.json'].includes(c)) return true;
  const nome = partes[partes.length - 1].toLowerCase();
  return nome === '.env' || nome.startsWith('.env.') || nome.endsWith('.webm');
}

// ---------- B1 e B2 ----------

const PADRAO_PUBLICO = /^services\/([^/]+)\/publico\/([^/]+)$/;
const PADRAO_MANIFESTO = /^services\/([^/]+)\/versoes\/([^/]+)\/versao\.json$/;
const ESTADOS_PROTEGIDOS = new Set(['validado_materialmente', 'autorizado_publicacao', 'publicado']);
const HASH_COMPLETO = /^[0-9a-f]{64}$/;
const DATA = /^\d{4}-\d{2}-\d{2}$/;

export function arquivoPublicoDoHash(hashConteudo) {
  return `conteudo-${String(hashConteudo).slice(0, 16)}.json`;
}

// Valida o arquivo de autorizações. Devolve { ok, publicacoes } ou { ok: false }.
// Entrada: { servicoId, versaoId, hashConteudo (64 hex), arquivoPublico, referencia, data (AAAA-MM-DD) }.
export function validarAutorizacoes(texto) {
  if (texto === null || texto === undefined) return { ok: true, publicacoes: [] };
  let dados;
  try {
    dados = JSON.parse(texto);
  } catch {
    return { ok: false };
  }
  if (!dados || typeof dados !== 'object' || !Array.isArray(dados.publicacoes)) return { ok: false };
  const campos = ['arquivoPublico', 'data', 'hashConteudo', 'referencia', 'servicoId', 'versaoId'];
  for (const p of dados.publicacoes) {
    if (!p || typeof p !== 'object' || Array.isArray(p)) return { ok: false };
    if (Object.keys(p).sort().join(',') !== campos.join(',')) return { ok: false };
    if (!campos.every((c) => typeof p[c] === 'string' && p[c].trim() !== '')) return { ok: false };
    if (!HASH_COMPLETO.test(p.hashConteudo) || !DATA.test(p.data)) return { ok: false };
    if (p.arquivoPublico !== arquivoPublicoDoHash(p.hashConteudo)) return { ok: false };
  }
  return { ok: true, publicacoes: dados.publicacoes };
}

function lerJson(texto) {
  if (texto === null || texto === undefined) return { ok: true, dados: null };
  try {
    return { ok: true, dados: JSON.parse(texto) };
  } catch {
    return { ok: false };
  }
}

// B1: arquivo em publico/ só passa se houver autorização para aquele serviço e aquele arquivo.
export function verificarPublico(caminho, publicacoes) {
  const m = PADRAO_PUBLICO.exec(normalizar(caminho));
  if (!m) return null;
  const [, servicoId, nome] = m;
  const autorizado = publicacoes.some((p) => p.servicoId === servicoId && p.arquivoPublico === nome);
  return autorizado ? null : { regra: 'B1', arquivo: normalizar(caminho) };
}

// B2 no registro: publicado passando a true, versaoPublicadaId alterado para um valor, statusValidacao passando a "validado".
export function verificarRegistro(textoAntes, textoDepois, publicacoes) {
  const antes = lerJson(textoAntes);
  const depois = lerJson(textoDepois);
  if (!antes.ok || !depois.ok) return [{ regra: 'B0', arquivo: 'services/registry.json' }];
  if (depois.dados === null) return [];
  const servicosDepois = Array.isArray(depois.dados.servicos) ? depois.dados.servicos : null;
  if (!servicosDepois) return [{ regra: 'B0', arquivo: 'services/registry.json' }];
  const servicosAntes = new Map((antes.dados && Array.isArray(antes.dados.servicos) ? antes.dados.servicos : []).map((s) => [s && s.id, s || {}]));
  const achados = [];
  for (const s of servicosDepois) {
    if (!s || typeof s !== 'object') return [{ regra: 'B0', arquivo: 'services/registry.json' }];
    const a = servicosAntes.get(s.id) || {};
    const mudou = (s.publicado === true && a.publicado !== true)
      || (s.versaoPublicadaId !== null && s.versaoPublicadaId !== undefined && s.versaoPublicadaId !== a.versaoPublicadaId)
      || (s.statusValidacao === 'validado' && a.statusValidacao !== 'validado');
    if (!mudou) continue;
    const autorizado = typeof s.versaoPublicadaId === 'string'
      && publicacoes.some((p) => p.servicoId === s.id && p.versaoId === s.versaoPublicadaId);
    if (!autorizado) achados.push({ regra: 'B2', arquivo: 'services/registry.json', detalhe: `serviço ${s.id}` });
  }
  return achados;
}

// B2 no manifesto da versão: estado passando a validado_materialmente, autorizado_publicacao ou publicado, ou publicadoEm preenchido.
export function verificarManifesto(caminho, textoAntes, textoDepois, publicacoes) {
  const m = PADRAO_MANIFESTO.exec(normalizar(caminho));
  if (!m) return null;
  const antes = lerJson(textoAntes);
  const depois = lerJson(textoDepois);
  if (!antes.ok || !depois.ok) return { regra: 'B0', arquivo: normalizar(caminho) };
  if (depois.dados === null) return null;
  const a = antes.dados || {};
  const d = depois.dados;
  if (!d || typeof d !== 'object') return { regra: 'B0', arquivo: normalizar(caminho) };
  const mudou = (ESTADOS_PROTEGIDOS.has(d.estado) && d.estado !== a.estado)
    || (d.publicadoEm !== null && d.publicadoEm !== undefined && d.publicadoEm !== a.publicadoEm);
  if (!mudou) return null;
  const autorizado = publicacoes.some((p) => p.servicoId === m[1] && p.versaoId === d.id && p.hashConteudo === d.hashConteudo);
  return autorizado ? null : { regra: 'B2', arquivo: normalizar(caminho) };
}

// ---------- B4 ----------

// Segredos com formato de alta confiança (valem em qualquer arquivo, inclusive testes).
const PADROES_SEGREDO = Object.freeze([
  ['chave de API do Google', /AIza[0-9A-Za-z_-]{35}/],
  ['chave de API', /(?<![A-Za-z0-9])sk-(?:ant-|proj-)?[A-Za-z0-9_-]{20,}/],
  ['token do GitHub', /(?<![A-Za-z0-9])(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}/],
  ['chave da AWS', /(?<![A-Z0-9])AKIA[0-9A-Z]{16}(?![A-Z0-9])/],
  ['token do Slack', /xox[abprs]-[A-Za-z0-9-]{10,}/],
  ['chave privada', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ['credencial atribuída', /(?<![A-Za-z0-9])(?:api[_-]?key|secret|client[_-]?secret|password|passwd|senha|token)["']?\s*[:=]\s*["'][^"'\s]{12,}["']/i],
]);

const PADRAO_EMAIL = /[\w.+-]{1,64}@([\w-]+(?:\.[\w-]+)+)/g;
const PADRAO_CPF = /(?<!\d)\d{3}\.\d{3}\.\d{3}-\d{2}(?!\d)/;
const PADRAO_TELEFONE = /\(\d{2}\)\s?9?\d{4}-?\d{4}(?!\d)|(?<![\d.-])9\d{4}-\d{4}(?![\d-])/;

export function ehArquivoDeTeste(caminho) {
  const c = normalizar(caminho);
  return PASTAS_DE_TESTE.some((p) => c.startsWith(p));
}

// Devolve o tipo encontrado na linha (sem o valor) ou null.
export function procurarDadoSensivel(linha, caminho) {
  for (const [tipo, padrao] of PADROES_SEGREDO) if (padrao.test(linha)) return tipo;
  if (ehArquivoDeTeste(caminho)) return null;
  for (const m of linha.matchAll(PADRAO_EMAIL)) {
    if (!DOMINIOS_EMAIL_PERMITIDOS.includes(m[1].toLowerCase())) return 'e-mail fora dos domínios permitidos';
  }
  if (PADRAO_CPF.test(linha)) return 'CPF';
  if (PADRAO_TELEFONE.test(linha)) return 'telefone';
  return null;
}

// linhas: [{ numero, texto }] adicionadas em um arquivo.
export function verificarLinhas(caminho, linhas) {
  const achados = [];
  for (const { numero, texto } of linhas) {
    const tipo = procurarDadoSensivel(texto, caminho);
    if (tipo) achados.push({ regra: 'B4', arquivo: normalizar(caminho), linha: numero, detalhe: tipo });
  }
  return achados;
}

// Lê a saída de "git diff --cached -U0" de um arquivo e devolve as linhas adicionadas com o número no arquivo novo.
export function linhasAdicionadas(diff) {
  const linhas = [];
  let numero = 0;
  for (const linha of String(diff).split('\n')) {
    const cabecalho = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(linha);
    if (cabecalho) {
      numero = Number(cabecalho[1]);
      continue;
    }
    if (linha.startsWith('+++') || linha.startsWith('---')) continue;
    if (linha.startsWith('+')) {
      linhas.push({ numero, texto: linha.slice(1).replace(/\r$/, '') });
      numero += 1;
    }
  }
  return linhas;
}

// ---------- B5 ----------

const PREFIXOS_DO_BUILD = ['src/', 'admin/', 'scripts/check-dist.js', 'index.html', 'vite.config.js', 'package.json', 'package-lock.json'];

export function afetaBuild(caminho) {
  const c = normalizar(caminho);
  if (PREFIXOS_DO_BUILD.some((p) => c === p || c.startsWith(p))) return true;
  if (/^services\/[^/]+\.js$/.test(c)) return true; // geradores do conteúdo público e do assistente
  return PADRAO_PUBLICO.test(c);
}

// ---------- mensagens ----------

export function formatarAchado(achado) {
  const onde = achado.linha ? `${achado.arquivo}:${achado.linha}` : achado.arquivo;
  const extra = achado.detalhe ? ` (${achado.detalhe})` : '';
  return `${MENSAGENS[achado.regra]}\n  -> ${onde}${extra}`;
}
