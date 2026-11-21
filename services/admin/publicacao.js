// Autorização e publicação de uma versão (Sprint 5, Passo 5C). São DUAS ações distintas, ambas posteriores a "concluir a revisão"
// (que leva a validado_materialmente e NUNCA publica):
//
//   autorizar -> validado_materialmente  => autorizado_publicacao   (nada vira público ainda)
//   publicar  -> autorizado_publicacao   => publicado               (gera o conteúdo público imutável e atualiza o registro)
//
// Regras comuns: nunca se decide só pelo histórico; sempre se confere manifesto, estado e hash canônico recalculado do conteúdo.
// Revisão otimista (`revisao` = hash canônico que a pessoa viu). Cada gravação é UMA transação (tudo ou nada) com conferência final da
// base e histórico privado só com metadados (dentro da conferência: se não puder ser gravado, a base volta ao que era).
// A publicação NÃO altera o conteúdo congelado da versão (o hash o cobre): muda só o manifesto (estado), o registro
// (`versaoPublicadaId`, `publicado`, `statusValidacao`) e cria o arquivo público (services/<serviço>/publico/conteudo-<hash16>.json).
// Erros são códigos, nunca caminhos nem conteúdo.

import fs from 'node:fs';
import { criarArmazenamento } from './armazenamento.js';
import { calcularHashDaVersao } from './conteudo-versao.js';
import { autorizarPublicacao, publicarVersao, revogarVersao, TIPO_AUTORIZACAO, TIPO_DECISAO_MATERIAL, TIPO_REVOGACAO } from './decisoes.js';
import { fonteExcluida } from './edicao-fonte.js';
import { registroDoAtor, resolverAtorDeGravacao, responsavelPublico } from './atores.js';
import { criarHistoricoRevisao } from './historico-revisao.js';
import { avaliarPendencias, rotuloDaSituacao } from './revisao.js';
import { executarTransacao } from './transacao.js';
import { validarVersao } from './versao.js';
import { lerArquivosDaVersao } from './versao-arquivos.js';
import { NOME_DO_MANIFESTO } from '../versao-atual.js';
import { caminhoDoConteudoPublico, gerarConteudoPublico, lerConteudoPublicado, validarConteudoPublico } from '../publicacao-publica.js';
import { validarServicos } from '../../scripts/validate-services.js';

const ehObjeto = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const dataLocal = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const falha = (erro, extra = {}) => ({ ok: false, erro, ...extra });
const PADRAO_REVISAO = /^[0-9a-f]{64}$/;

/** Corpo das ações: objeto só com `revisao` (opcional no corpo); a revisão também pode vir no cabeçalho X-Revisao. */
export function validarCorpoDePublicacao(corpo, revisaoDoCabecalho) {
  if (!ehObjeto(corpo)) return { ok: false, campos: ['corpo'] };
  const campos = [];
  if (Object.keys(corpo).some((k) => k !== 'revisao')) campos.push('extras');
  const revisao = corpo.revisao ?? revisaoDoCabecalho;
  if (typeof revisao !== 'string' || !PADRAO_REVISAO.test(revisao)) campos.push('revisao');
  return campos.length ? { ok: false, campos } : { ok: true, dados: { revisao } };
}

/**
 * Corpo da revogação (Sprint 7, Passo 7B): só `revisao` (ou X-Revisao) e `motivo`. Aqui se confere apenas a FORMA do corpo e se
 * apara o motivo (como a tela já faz); o conteúdo do motivo (obrigatório, tamanho, sem e-mail, telefone, CPF ou credencial) é validado uma única vez, por
 * revogarVersao (decisoes.js). Motivo que não é texto segue como veio, para ser recusado lá.
 */
export function validarCorpoDeRevogacao(corpo, revisaoDoCabecalho) {
  if (!ehObjeto(corpo)) return { ok: false, campos: ['corpo'] };
  const campos = [];
  if (Object.keys(corpo).some((k) => k !== 'revisao' && k !== 'motivo')) campos.push('extras');
  const revisao = corpo.revisao ?? revisaoDoCabecalho;
  if (typeof revisao !== 'string' || !PADRAO_REVISAO.test(revisao)) campos.push('revisao');
  const motivo = typeof corpo.motivo === 'string' ? corpo.motivo.trim() : corpo.motivo;
  return campos.length ? { ok: false, campos } : { ok: true, dados: { revisao, motivo } };
}

/** Percorre os textos de um JSON procurando algum dos ids (para achar citação de fonte excluída). */
function citaAlgum(valor, ids) {
  if (typeof valor === 'string') return ids.has(valor);
  if (Array.isArray(valor)) return valor.some((v) => citaAlgum(v, ids));
  if (ehObjeto(valor)) return Object.values(valor).some((v) => citaAlgum(v, ids));
  return false;
}

export function criarServicoPublicacao({ raiz, sistema = fs, agora = () => new Date(), verificarFinal = (r) => validarServicos(r).erros } = {}) {
  const arm = criarArmazenamento({ raiz, sistema });
  const historico = criarHistoricoRevisao({ raiz, sistema, agora });

  function carregar(servicoId) {
    if (arm.ok === false) return falha('raiz_invalida');
    const registro = arm.lerJson('services/registry.json');
    if (!registro.ok || !ehObjeto(registro.dados) || !Array.isArray(registro.dados.servicos)) return falha('registro_indisponivel');
    const entrada = registro.dados.servicos.find((s) => ehObjeto(s) && s.id === servicoId);
    if (!entrada) return falha('servico_nao_encontrado');
    const atual = lerArquivosDaVersao({ raiz, servicoId, versaoId: entrada.versaoAtualId, sistema });
    if (!atual.ok) return atual;
    const h = calcularHashDaVersao(atual.arquivos);
    if (!h.ok) return falha('conteudo_invalido');
    return { ok: true, registro: registro.dados, entrada, atual, hash: h.hash };
  }

  const hashEmDisco = (servicoId, versaoId) => {
    const l = lerArquivosDaVersao({ raiz, servicoId, versaoId, sistema });
    if (!l.ok) return null;
    const h = calcularHashDaVersao(l.arquivos);
    return h.ok ? h.hash : null;
  };

  function nomeDoTema(assuntoId) {
    const a = arm.lerJson('services/assuntos.json');
    if (!a.ok || !ehObjeto(a.dados) || !Array.isArray(a.dados.assuntos)) return null;
    const t = a.dados.assuntos.find((x) => ehObjeto(x) && x.id === assuntoId);
    return t && typeof t.nome === 'string' && t.nome.trim() !== '' ? t.nome : null;
  }

  /** Conteúdo apto: nenhuma fonte excluída citada e nenhuma pendência de revisão. Retorna null ou { ok: false, erro }. */
  function conferirConteudo(arquivos, servicoId) {
    const fontes = Array.isArray(arquivos.fontes?.fontes) ? arquivos.fontes.fontes : [];
    const excluidas = new Set(fontes.filter((f) => ehObjeto(f) && fonteExcluida(f)).map((f) => f.id));
    if (excluidas.size > 0 && [arquivos.service, arquivos.documentos, arquivos.perguntasFrequentes, arquivos.conteudoAssistente].some((d) => citaAlgum(d, excluidas))) {
      return falha('conteudo_excluido_citado');
    }
    const pendencias = avaliarPendencias(arquivos, servicoId);
    return pendencias.length > 0 ? falha('revisao_incompleta', { pendencias }) : null;
  }

  const arquivosPublicaveis = (arquivos) => ({ service: arquivos.service, fontes: arquivos.fontes, conteudoAssistente: arquivos.conteudoAssistente });

  function mapearFalha(r, motivo) {
    if (r.revertido === false) return falha('desfazer_incompleto', { revertido: false });
    if (motivo) return falha(motivo, { revertido: true });
    return falha(r.erro === 'dados_invalidos' || r.erro === 'verificacao_recusada' ? 'dados_invalidos' : 'falha_de_escrita', { revertido: true });
  }

  /** Resumo para a tela (somente leitura): sem hash e sem ids. */
  function resumo(servicoId) {
    try {
      const c = carregar(servicoId);
      if (!c.ok) return c;
      const { manifesto, arquivos } = c.atual;
      const tema = nomeDoTema(c.entrada.assuntoId);
      const gerado = tema === null ? { ok: false } : gerarConteudoPublico(arquivosPublicaveis(arquivos), { temaNome: tema });
      const informacoes = gerado.ok ? gerado.conteudo.informacoes : [];
      const integro = typeof manifesto.hashConteudo === 'string' && manifesto.hashConteudo === c.hash && conferirConteudo(arquivos, servicoId) === null && gerado.ok;
      return {
        ok: true,
        resumo: {
          versao: manifesto.numero,
          rotulo: rotuloDaSituacao(manifesto.estado),
          dataRevisao: typeof manifesto.enviadaEm === 'string' ? manifesto.enviadaEm : null,
          informacoesAceitas: informacoes.length,
          links: informacoes.filter((i) => i.tipo === 'link').length,
          textos: informacoes.filter((i) => i.tipo === 'texto').length,
          podeAutorizar: manifesto.estado === 'validado_materialmente' && integro,
          podePublicar: manifesto.estado === 'autorizado_publicacao' && integro,
          publicado: manifesto.estado === 'publicado',
          dataPublicacao: (manifesto.estado === 'publicado' || manifesto.estado === 'revogado') && typeof manifesto.publicadoEm === 'string' ? manifesto.publicadoEm : null,
          // Revogação (Sprint 7): só a versão atual que é a publicada pode ser revogada pela tela.
          podeRevogar: manifesto.estado === 'publicado' && c.entrada.versaoPublicadaId === manifesto.id && manifesto.hashConteudo === c.hash,
          revogado: manifesto.estado === 'revogado',
          dataRevogacao: manifesto.estado === 'revogado' && typeof manifesto.revogadoEm === 'string' ? manifesto.revogadoEm : null,
        },
      };
    } catch {
      return falha('indisponivel');
    }
  }

  const decisaoDe = (registros, tipo, versaoId, hash) => registros.find((x) => x.tipo === tipo && x.versaoId === versaoId && x.hashConteudo === hash
    && (tipo !== TIPO_DECISAO_MATERIAL || x.decisao === 'validado_materialmente'));

  /** validado_materialmente -> autorizado_publicacao. Não publica nem cria conteúdo público. */
  function autorizar(servicoId, { revisao, ator } = {}) {
    try {
      // Segunda barreira (Passo 8C): só o ator real com perfil que pode autorizar (Revisor).
      const quem = resolverAtorDeGravacao(ator, 'autorizar_publicacao');
      if (!quem.ok) return falha(quem.erro);
      const c = carregar(servicoId);
      if (!c.ok) return c;
      const { manifesto, arquivos, pasta } = c.atual;
      if (manifesto.estado !== 'validado_materialmente') return falha('estado_invalido');
      if (c.hash !== revisao) return falha('revisao_divergente');
      if (manifesto.hashConteudo !== c.hash) return falha('hash_divergente');
      const apto = conferirConteudo(arquivos, servicoId);
      if (apto) return apto;
      const decisoes = historico.listarDecisoes(servicoId);
      if (!decisoes.ok) return decisoes;
      if (!decisaoDe(decisoes.registros, TIPO_DECISAO_MATERIAL, manifesto.id, c.hash)) return falha('historico_incompativel');
      if (verificarFinal(raiz).length > 0) return falha('base_invalida');

      const data = dataLocal(agora());
      const idAutorizacao = `autorizacao-${manifesto.id}-${c.hash.slice(0, 16)}`;
      const existente = decisoes.registros.find((x) => x.id === idAutorizacao);
      // Se uma tentativa anterior foi desfeita depois de gravar a autorização (mesma versão e hash), ela é reaproveitada.
      if (existente && !(existente.tipo === TIPO_AUTORIZACAO && existente.versaoId === manifesto.id && existente.hashConteudo === c.hash
        && registroDoAtor(existente, quem.ator))) {
        return falha('historico_invalido');
      }
      const jaRegistrada = existente !== undefined;
      const aut = autorizarPublicacao(manifesto, decisoes.registros.filter((x) => x.id !== idAutorizacao), {
        id: idAutorizacao, versaoId: manifesto.id, hashConteudo: c.hash, ator: quem.ator, data, observacao: null,
      });
      if (!aut.ok) return falha('decisao_recusada');
      const manifestoAutorizado = { ...aut.versao, responsaveis: { ...(aut.versao.responsaveis ?? {}), autorizacao: responsavelPublico(quem.ator) } };

      let motivo = null;
      const r = executarTransacao({
        raiz,
        sistema,
        passos: [{ caminho: `${pasta}/${NOME_DO_MANIFESTO}`, tipo: 'json', conteudo: manifestoAutorizado, novo: false, validar: (d) => validarVersao(d) }],
        verificar: () => {
          const erros = verificarFinal(raiz);
          if (erros.length > 0) return erros;
          if (hashEmDisco(servicoId, manifesto.id) !== c.hash) return ['hash_divergente'];
          if ((!jaRegistrada && !historico.registrarDecisao(servicoId, aut.registro).ok)
            || !historico.registrarAcao(servicoId, { versaoId: manifesto.id, hashConteudo: c.hash, acao: 'autorizar_publicacao', ator: quem.ator }).ok) {
            motivo = 'historico_indisponivel';
            return ['historico'];
          }
          return [];
        },
      });
      return r.ok ? { ok: true, estado: aut.versao.estado, revisao: c.hash } : mapearFalha(r, motivo);
    } catch {
      return falha('indisponivel');
    }
  }

  /**
   * autorizado_publicacao -> publicado, numa única transação: arquivo público (novo), manifesto e registro. Se qualquer etapa falhar
   * (inclusive a conferência final da base e o histórico), tudo é desfeito.
   */
  function publicar(servicoId, { revisao, ator } = {}) {
    try {
      const quem = resolverAtorDeGravacao(ator, 'publicar');
      if (!quem.ok) return falha(quem.erro);
      const c = carregar(servicoId);
      if (!c.ok) return c;
      const { manifesto, arquivos, pasta } = c.atual;
      if (manifesto.estado !== 'autorizado_publicacao') return falha('estado_invalido');
      if (c.hash !== revisao) return falha('revisao_divergente');
      if (manifesto.hashConteudo !== c.hash) return falha('hash_divergente');
      const apto = conferirConteudo(arquivos, servicoId);
      if (apto) return apto;
      const decisoes = historico.listarDecisoes(servicoId);
      if (!decisoes.ok) return decisoes;
      const publicada = publicarVersao(manifesto, decisoes.registros);
      if (!publicada.ok) return falha('historico_incompativel');
      const tema = nomeDoTema(c.entrada.assuntoId);
      if (tema === null) return falha('tema_indisponivel');
      const gerado = gerarConteudoPublico(arquivosPublicaveis(arquivos), { temaNome: tema });
      if (!gerado.ok) return falha(gerado.erro === 'sem_informacao_aceita' ? 'sem_informacao_aceita' : 'conteudo_publico_invalido');
      const caminhoPublico = caminhoDoConteudoPublico(servicoId, c.hash);
      if (caminhoPublico === null) return falha('conteudo_invalido');
      if (verificarFinal(raiz).length > 0) return falha('base_invalida');

      // Data da publicação (mesmo relógio injetável das outras ações); o manifesto não entra no hash canônico.
      const manifestoPublicado = {
        ...publicada.versao,
        publicadoEm: dataLocal(agora()),
        responsaveis: { ...(publicada.versao.responsaveis ?? {}), publicacao: responsavelPublico(quem.ator) },
      };
      const entradaNova = { ...c.entrada, statusValidacao: 'validado', publicado: true, versaoPublicadaId: manifesto.id };
      const passos = [
        { caminho: caminhoPublico, tipo: 'json', conteudo: gerado.conteudo, novo: true, validar: (d) => validarConteudoPublico(d) },
        { caminho: `${pasta}/${NOME_DO_MANIFESTO}`, tipo: 'json', conteudo: manifestoPublicado, novo: false, validar: (d) => validarVersao(d) },
        // O registro vai por último: é ele que passa a apontar para a versão publicada.
        { caminho: 'services/registry.json', tipo: 'json', conteudo: { ...c.registro, servicos: c.registro.servicos.map((s) => (s === c.entrada ? entradaNova : s)) }, novo: false, validar: () => [] },
      ];
      let motivo = null;
      const r = executarTransacao({
        raiz,
        sistema,
        passos,
        verificar: () => {
          const erros = verificarFinal(raiz);
          if (erros.length > 0) return erros;
          if (hashEmDisco(servicoId, manifesto.id) !== c.hash) return ['hash_divergente'];
          const lido = lerConteudoPublicado(raiz, servicoId, { sistema });
          if (lido === null || lido.integridade !== gerado.conteudo.integridade) return ['conteudo_publico'];
          if (!historico.registrarAcao(servicoId, { versaoId: manifesto.id, hashConteudo: c.hash, acao: 'publicar', ator: quem.ator }).ok) {
            motivo = 'historico_indisponivel';
            return ['historico'];
          }
          return [];
        },
      });
      return r.ok ? { ok: true, estado: publicada.versao.estado, revisao: c.hash } : mapearFalha(r, motivo);
    } catch {
      return falha('indisponivel');
    }
  }

  /**
   * publicado -> revogado (Sprint 7, Passo 7B), numa única transação: manifesto (estado e revogadoEm), registro (publicado: false,
   * versaoPublicadaId: null) e, na conferência final, a decisão de revogação e a ação no histórico privado. Se qualquer etapa falhar,
   * tudo é desfeito. O arquivo público continua no disco como histórico imutável, mas deixa de ser servido e de entrar no build.
   * O motivo (sem e-mail, telefone, CPF ou credencial) é validado só por revogarVersao (decisoes.js). O ator é obrigatório: um usuário selecionável com perfil que pode revogar (Passo 8C).
   */
  function revogar(servicoId, { revisao, motivo, ator } = {}) {
    try {
      const quem = resolverAtorDeGravacao(ator, 'revogar');
      if (!quem.ok) return falha(quem.erro);
      if (arm.ok === false) return falha('raiz_invalida');
      const registro = arm.lerJson('services/registry.json');
      if (!registro.ok || !ehObjeto(registro.dados) || !Array.isArray(registro.dados.servicos)) return falha('registro_indisponivel');
      const entrada = registro.dados.servicos.find((s) => ehObjeto(s) && s.id === servicoId);
      if (!entrada) return falha('servico_nao_encontrado');
      if (typeof entrada.versaoPublicadaId !== 'string' || entrada.versaoPublicadaId === '') return falha('nada_publicado');
      const publicadaEmDisco = lerArquivosDaVersao({ raiz, servicoId, versaoId: entrada.versaoPublicadaId, sistema });
      if (!publicadaEmDisco.ok) return publicadaEmDisco;
      const { manifesto, pasta } = publicadaEmDisco;
      if (manifesto.estado !== 'publicado') return falha('estado_invalido');
      const h = calcularHashDaVersao(publicadaEmDisco.arquivos);
      if (!h.ok) return falha('conteudo_invalido');
      if (h.hash !== revisao) return falha('revisao_divergente');
      if (manifesto.hashConteudo !== h.hash) return falha('hash_divergente');
      // Sem nada publicado, o registro volta a acompanhar o service.json da versão atual (regra do validador da base).
      const atual = entrada.versaoAtualId === entrada.versaoPublicadaId ? publicadaEmDisco : lerArquivosDaVersao({ raiz, servicoId, versaoId: entrada.versaoAtualId, sistema });
      if (!atual.ok) return atual;
      const caminhoPublico = caminhoDoConteudoPublico(servicoId, h.hash);
      if (caminhoPublico === null) return falha('conteudo_invalido');
      const decisoes = historico.listarDecisoes(servicoId);
      if (!decisoes.ok) return decisoes;
      if (verificarFinal(raiz).length > 0) return falha('base_invalida');

      const data = dataLocal(agora());
      const idRevogacao = `revogacao-${manifesto.id}-${h.hash.slice(0, 16)}`;
      const existente = decisoes.registros.find((x) => x.id === idRevogacao);
      // Se uma tentativa anterior foi desfeita depois de gravar a revogação (mesma versão e hash), ela é reaproveitada.
      if (existente && !(existente.tipo === TIPO_REVOGACAO && existente.versaoId === manifesto.id && existente.hashConteudo === h.hash
        && registroDoAtor(existente, quem.ator))) {
        return falha('historico_invalido');
      }
      const jaRegistrada = existente !== undefined;
      const rev = revogarVersao(manifesto, decisoes.registros.filter((x) => x.id !== idRevogacao), {
        id: idRevogacao, versaoId: manifesto.id, hashConteudo: h.hash, ator: quem.ator, data, observacao: null, motivo,
      });
      if (!rev.ok) return falha(rev.erro === 'revogacao_invalida' ? 'motivo_invalido' : 'decisao_recusada');
      const manifestoRevogado = { ...rev.versao, responsaveis: { ...(rev.versao.responsaveis ?? {}), revogacao: responsavelPublico(quem.ator) } };

      const servicoAtual = atual.arquivos.service;
      const entradaNova = {
        ...entrada,
        publicado: false,
        versaoPublicadaId: null,
        statusValidacao: ehObjeto(servicoAtual) && typeof servicoAtual.statusValidacao === 'string' ? servicoAtual.statusValidacao : entrada.statusValidacao,
      };
      const passos = [
        { caminho: `${pasta}/${NOME_DO_MANIFESTO}`, tipo: 'json', conteudo: manifestoRevogado, novo: false, validar: (d) => validarVersao(d) },
        // O registro vai por último: é ele que deixa de apontar para a versão revogada.
        { caminho: 'services/registry.json', tipo: 'json', conteudo: { ...registro.dados, servicos: registro.dados.servicos.map((s) => (s === entrada ? entradaNova : s)) }, novo: false, validar: () => [] },
      ];
      let motivoFalha = null;
      const r = executarTransacao({
        raiz,
        sistema,
        passos,
        verificar: () => {
          const erros = verificarFinal(raiz);
          if (erros.length > 0) return erros;
          if (hashEmDisco(servicoId, manifesto.id) !== h.hash) return ['hash_divergente'];
          if (lerConteudoPublicado(raiz, servicoId, { sistema }) !== null) return ['conteudo_ainda_servido'];
          if (!sistema.existsSync(`${raiz}/${caminhoPublico}`)) return ['arquivo_publico_ausente'];
          if ((!jaRegistrada && !historico.registrarDecisao(servicoId, rev.registro).ok)
            || !historico.registrarAcao(servicoId, { versaoId: manifesto.id, hashConteudo: h.hash, acao: 'revogar', ator: quem.ator }).ok) {
            motivoFalha = 'historico_indisponivel';
            return ['historico'];
          }
          return [];
        },
      });
      return r.ok ? { ok: true, estado: rev.versao.estado } : mapearFalha(r, motivoFalha);
    } catch {
      return falha('indisponivel');
    }
  }

  return { resumo, autorizar, publicar, revogar };
}
