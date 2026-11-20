// Revisão humana de um serviço (Sprint 5, Passo 5B1): orquestra leitura, regras puras (revisao.js), transação com desfazer e
// histórico privado. Sem rotas e sem interface aqui (as rotas chamam este módulo, sob a trava comum das gravações). Nada é
// autorizado nem publicado. Erros são códigos, nunca caminhos nem conteúdo.
//
// Revisão otimista: toda ação recebe `revisao`, o hash canônico do conteúdo que a pessoa viu (devolvido pela consulta); se o
// conteúdo mudou desde então, a ação é recusada (revisao_divergente). Cada gravação é uma transação (tudo ou nada) e o
// histórico privado é acrescentado DENTRO da conferência final: se o histórico não puder ser gravado, a base volta ao que era.

import crypto from 'node:crypto';
import fs from 'node:fs';
import { criarArmazenamento } from './armazenamento.js';
import { calcularHashDaVersao } from './conteudo-versao.js';
import { congelarVersao } from './congelamento.js';
import { registrarDecisaoMaterial } from './decisoes.js';
import { registroDoAtor, resolverAtor, responsavelPublico } from './atores.js';
import { criarHistoricoRevisao } from './historico-revisao.js';
import { criarNovaVersaoDoServico } from './nova-versao.js';
import { dadosParaEdicao, editarFonte, excluirFonte, impactoDaExclusao } from './edicao-fonte.js';
import { importarCandidato, listarCandidatos } from './importacao-conteudo.js';
import { edicaoDoServicoExigeConfirmacao, editarServicoPuro, informacoesAceitas, nomeDoServicoNoDisco } from './edicao-tema-servico.js';
import { aceitarBloco, avaliarPendencias, reabrirBloco, rejeitarBloco, revisarFonte, situacaoDaRevisao } from './revisao.js';
import { executarTransacao } from './transacao.js';
import { validarVersao } from './versao.js';
import { lerArquivosDaVersao } from './versao-arquivos.js';
import { caminhosDaVersao, NOME_DO_MANIFESTO } from '../versao-atual.js';
import { validarServicos } from '../../scripts/validate-services.js';

const ehObjeto = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const dataLocal = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const falha = (erro, extra = {}) => ({ ok: false, erro, ...extra });
const livre = () => [];

export function criarServicoRevisao({ raiz, sistema = fs, agora = () => new Date(), verificarFinal = (r) => validarServicos(r).erros, gerarIdBloco = () => `bc-${crypto.randomBytes(6).toString('hex')}` } = {}) {
  const arm = criarArmazenamento({ raiz, sistema });
  const historico = criarHistoricoRevisao({ raiz, sistema, agora });

  /** Versão atual do serviço (manifesto + arquivos) e o hash canônico do conteúdo. */
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
    return { ok: true, entrada, atual, hash: h.hash };
  }

  const hashEmDisco = (servicoId, versaoId) => {
    const l = lerArquivosDaVersao({ raiz, servicoId, versaoId, sistema });
    if (!l.ok) return null;
    const h = calcularHashDaVersao(l.arquivos);
    return h.ok ? h.hash : null;
  };

  function mapearFalha(r, motivo) {
    if (r.revertido === false) return falha('desfazer_incompleto', { revertido: false });
    if (motivo) return falha(motivo, { revertido: true });
    return falha(r.erro === 'dados_invalidos' || r.erro === 'verificacao_recusada' ? 'dados_invalidos' : 'falha_de_escrita', { revertido: true });
  }

  /** Consulta a situação e as pendências da revisão (somente leitura). */
  function consultar(servicoId) {
    try {
      const c = carregar(servicoId);
      if (!c.ok) return c;
      return { ok: true, situacao: situacaoDaRevisao({ servicoId, manifesto: c.atual.manifesto, arquivos: c.atual.arquivos, revisao: c.hash }) };
    } catch {
      return falha('indisponivel');
    }
  }

  /** Gravação comum das ações de revisão (fonte, aceitar e rejeitar bloco): só a versão atual em rascunho, com revisão otimista. */
  function gravar({ servicoId, revisao, acao, preparar, ator }) {
    // preparar pode devolver `item: { itemId, itemTipo }` para o histórico (só metadados mínimos).
    // `ator`: da lista fixa de atores.js; sem ator, vale o de demonstração (Sprint 7, Passo 7C).
    try {
      const quem = resolverAtor(ator);
      if (!quem.ok) return falha('ator_invalido');
      const c = carregar(servicoId);
      if (!c.ok) return c;
      if (c.atual.manifesto.estado !== 'rascunho') return falha('versao_congelada');
      if (c.hash !== revisao) return falha('revisao_divergente');
      const p = preparar(c.atual, dataLocal(agora()));
      if (!p.ok) return p;
      let motivo = null;
      let hashDepois = null;
      const versaoId = c.atual.manifesto.id;
      const r = executarTransacao({
        raiz,
        sistema,
        passos: p.passos,
        verificar: () => {
          const erros = verificarFinal(raiz);
          if (erros.length > 0) return erros;
          hashDepois = hashEmDisco(servicoId, versaoId);
          if (hashDepois === null) return ['leitura'];
          if (!historico.registrarAcao(servicoId, { versaoId, hashConteudo: hashDepois, acao, ...(p.item ?? {}), ator: quem.ator }).ok) {
            motivo = 'historico_indisponivel';
            return ['historico'];
          }
          return [];
        },
      });
      return r.ok ? { ok: true, revisao: hashDepois, ...(p.extra ?? {}) } : mapearFalha(r, motivo);
    } catch {
      return falha('indisponivel');
    }
  }

  const caminho = (atual, chave) => caminhosDaVersao(atual.pasta)[chave];

  function revisarFonteDoServico(servicoId, { fonteId, revisao, ator }) {
    return gravar({
      servicoId, revisao, ator, acao: 'revisar_fonte',
      preparar: (atual, data) => {
        const r = revisarFonte(atual.arquivos, fonteId, data, servicoId);
        return r.ok ? { ok: true, passos: [{ caminho: caminho(atual, 'fontes'), tipo: 'json', conteudo: r.fontes, novo: false, validar: livre }] } : r;
      },
    });
  }

  function aceitarBlocoDoServico(servicoId, { blocoId, revisao, ator }) {
    return gravar({
      servicoId, revisao, ator, acao: 'aceitar_bloco',
      preparar: (atual, data) => {
        const r = aceitarBloco(atual.arquivos, blocoId, data);
        return r.ok ? { ok: true, passos: [{ caminho: caminho(atual, 'conteudoAssistente'), tipo: 'json', conteudo: r.conteudoAssistente, novo: false, validar: livre }] } : r;
      },
    });
  }

  const caminhoEntradas = (atual) => `${atual.pasta}/entradas.json`;

  /** Campos editáveis atuais de uma fonte (somente leitura; o texto original só sai aqui, sob demanda, para a edição). */
  function lerFonteParaEdicao(servicoId, fonteId) {
    try {
      const c = carregar(servicoId);
      if (!c.ok) return c;
      if (c.atual.manifesto.estado !== 'rascunho') return falha('versao_congelada');
      const d = dadosParaEdicao(c.atual.arquivos, fonteId);
      return d.ok ? { ok: true, edicao: d.edicao, revisao: c.hash } : d;
    } catch {
      return falha('indisponivel');
    }
  }

  /** Edita uma fonte (link ou texto): reinicia a revisão da fonte e reabre as informações aceitas que a usam. */
  function editarFonteDoServico(servicoId, { fonteId, revisao, campos, ator }) {
    return gravar({
      servicoId, revisao, ator, acao: 'editar_fonte',
      preparar: (atual, data) => {
        const r = editarFonte(atual.arquivos, fonteId, campos, data, servicoId);
        if (!r.ok) return r;
        const passos = [{ caminho: caminho(atual, 'fontes'), tipo: 'json', conteudo: r.fontes, novo: false, validar: livre }];
        if (r.blocosReabertos.length > 0) passos.push({ caminho: caminho(atual, 'conteudoAssistente'), tipo: 'json', conteudo: r.conteudoAssistente, novo: false, validar: livre });
        if (r.entradas) passos.push({ caminho: caminhoEntradas(atual), tipo: 'json', conteudo: r.entradas, novo: false, validar: livre });
        return { ok: true, passos, extra: { blocosReabertos: r.blocosReabertos.length }, item: itemDaFonte(atual, fonteId) };
      },
    });
  }

  /** Tipo do item para o histórico: link, texto ou fonte genérica. Só metadados (nunca título, URL nem texto). */
  const itemDaFonte = (atual, fonteId) => {
    const f = (Array.isArray(atual.arquivos.fontes?.fontes) ? atual.arquivos.fontes.fontes : []).find((x) => x && x.id === fonteId);
    return { itemId: fonteId, itemTipo: f && f.formaEntrada === 'texto' ? 'texto' : f ? 'link' : 'fonte' };
  };

  /** O que a exclusão vai afetar, em linguagem para a tela (somente leitura): informações e conteúdo antigo. */
  function impactoDaFonte(servicoId, fonteId) {
    try {
      const c = carregar(servicoId);
      if (!c.ok) return c;
      if (c.atual.manifesto.estado !== 'rascunho') return falha('versao_congelada');
      const r = impactoDaExclusao(c.atual.arquivos, fonteId);
      return r.ok ? { ok: true, impacto: r.impacto, revisao: c.hash } : r;
    } catch {
      return falha('indisponivel');
    }
  }

  /**
   * Exclusão lógica em cascata, numa única transação: marca a fonte, retira as referências ativas da versão atual (informações,
   * campos do serviço, documentos e perguntas antigos) e reabre as informações aceitas que mudarem. Não é recusada por referências.
   */
  function excluirFonteDoServico(servicoId, { fonteId, revisao, ator }) {
    return gravar({
      servicoId, revisao, ator, acao: 'excluir_fonte',
      preparar: (atual, data) => {
        const r = excluirFonte(atual.arquivos, fonteId, data);
        if (!r.ok) return r;
        const passos = [{ caminho: caminho(atual, 'fontes'), tipo: 'json', conteudo: r.fontes, novo: false, validar: livre }];
        passos.push({ caminho: caminho(atual, 'conteudoAssistente'), tipo: 'json', conteudo: r.conteudoAssistente, novo: false, validar: livre });
        if (r.service) passos.push({ caminho: caminho(atual, 'service'), tipo: 'json', conteudo: r.service, novo: false, validar: livre });
        if (r.documentos) passos.push({ caminho: caminho(atual, 'documentos'), tipo: 'json', conteudo: r.documentos, novo: false, validar: livre });
        if (typeof r.roteiro === 'string') passos.push({ caminho: caminho(atual, 'roteiro'), tipo: 'texto_exato', conteudo: r.roteiro, novo: false, validar: livre });
        if (r.perguntasFrequentes) passos.push({ caminho: caminho(atual, 'perguntasFrequentes'), tipo: 'json', conteudo: r.perguntasFrequentes, novo: false, validar: livre });
        return { ok: true, passos, extra: { blocosReabertos: r.blocosReabertos }, item: itemDaFonte(atual, fonteId) };
      },
    });
  }

  /** Nome, tema e informações aceitas do serviço (somente leitura), para a edição. Só a versão atual em elaboração. */
  function lerServicoParaEdicao(servicoId) {
    try {
      const c = carregar(servicoId);
      if (!c.ok) return c;
      if (c.atual.manifesto.estado !== 'rascunho') return falha('versao_congelada');
      const s = c.atual.arquivos.service;
      return { ok: true, edicao: { nome: s.nome, temaId: c.entrada.assuntoId, informacoesAceitas: informacoesAceitas(c.atual.arquivos.conteudoAssistente) }, revisao: c.hash };
    } catch {
      return falha('indisponivel');
    }
  }

  /**
   * Altera o nome e/ou o tema do serviço (versão atual em elaboração): service.json, registro (se o tema mudar) e, de forma conservadora,
   * as informações aceitas voltam a "Em elaboração". Exige `confirmado` quando o tema muda ou há informações aceitas.
   */
  function editarServicoDoServico(servicoId, { revisao, nome, temaId, confirmado = false, ator }) {
    return gravar({
      servicoId, revisao, ator, acao: 'editar_servico',
      preparar: (atual, data) => {
        const assuntos = arm.lerJson('services/assuntos.json');
        const registro = arm.lerJson('services/registry.json');
        if (!assuntos.ok || !registro.ok) return falha('registro_indisponivel');
        const entradaRegistro = registro.dados.servicos.find((x) => ehObjeto(x) && x.id === servicoId);
        const nomesOutros = registro.dados.servicos.filter((x) => ehObjeto(x) && x.id !== servicoId).map((x) => nomeDoServicoNoDisco(arm, raiz, x.id)).filter((n) => typeof n === 'string');
        const r = editarServicoPuro({ service: atual.arquivos.service, conteudoAssistente: atual.arquivos.conteudoAssistente, entradaRegistro, assuntos: assuntos.dados, nomesOutros }, { nome, temaId }, data);
        if (!r.ok) return r;
        if (!confirmado && edicaoDoServicoExigeConfirmacao(r.temaMudou, r.blocosReabertos.length)) return falha('confirmacao_necessaria');
        const passos = [{ caminho: caminho(atual, 'service'), tipo: 'json', conteudo: r.service, novo: false, validar: livre }];
        if (r.blocosReabertos.length > 0) passos.push({ caminho: caminho(atual, 'conteudoAssistente'), tipo: 'json', conteudo: r.conteudoAssistente, novo: false, validar: livre });
        // O registro vai por último: o validador exige o mesmo assuntoId nele e no service.json.
        if (r.entradaRegistro) {
          passos.push({ caminho: 'services/registry.json', tipo: 'json', conteudo: { ...registro.dados, servicos: registro.dados.servicos.map((x) => (ehObjeto(x) && x.id === servicoId ? r.entradaRegistro : x)) }, novo: false, validar: livre });
        }
        return { ok: true, passos, extra: { blocosReabertos: r.blocosReabertos.length }, item: { itemId: servicoId, itemTipo: 'servico' } };
      },
    });
  }

  /** Candidatos à importação de conteúdo existente (somente leitura; nada é gravado). Só a versão atual em elaboração. */
  function listarCandidatosDeImportacao(servicoId) {
    try {
      const c = carregar(servicoId);
      if (!c.ok) return c;
      if (c.atual.manifesto.estado !== 'rascunho') return falha('versao_congelada');
      return { ok: true, candidatos: listarCandidatos(c.atual.arquivos), revisao: c.hash };
    } catch {
      return falha('indisponivel');
    }
  }

  /**
   * Importa UM item do conteúdo existente como informação em elaboração (nunca aceita, revisa nem publica). Grava só o conteúdo do
   * assistente da versão atual, em transação única, com revisão otimista, trava comum (feita pela rota) e histórico só com metadados.
   */
  function importarConteudoDoServico(servicoId, { revisao, ref, entrada, ator }) {
    return gravar({
      servicoId, revisao, ator, acao: 'importar_conteudo',
      preparar: (atual, data) => {
        const existentes = new Set(atual.arquivos.conteudoAssistente.blocos.map((b) => b && b.id));
        let id = null;
        for (let i = 0; i < 20 && id === null; i += 1) {
          const candidato = gerarIdBloco();
          if (!existentes.has(candidato)) id = candidato;
        }
        if (id === null) return falha('indisponivel');
        const r = importarCandidato({ manifesto: atual.manifesto, arquivos: atual.arquivos, ref, entrada, id, data });
        if (!r.ok) return r;
        return {
          ok: true,
          passos: [{ caminho: caminho(atual, 'conteudoAssistente'), tipo: 'json', conteudo: r.conteudoAssistente, novo: false, validar: livre }],
          item: { itemId: id, itemTipo: r.candidato.tipo },
        };
      },
    });
  }

  function reabrirBlocoDoServico(servicoId, { blocoId, revisao, ator }) {
    return gravar({
      servicoId, revisao, ator, acao: 'reabrir_bloco',
      preparar: (atual, data) => {
        const r = reabrirBloco(atual.arquivos, blocoId, data);
        return r.ok ? { ok: true, passos: [{ caminho: caminho(atual, 'conteudoAssistente'), tipo: 'json', conteudo: r.conteudoAssistente, novo: false, validar: livre }] } : r;
      },
    });
  }

  function rejeitarBlocoDoServico(servicoId, { blocoId, revisao, ator }) {
    return gravar({
      servicoId, revisao, ator, acao: 'rejeitar_bloco',
      preparar: (atual) => {
        const r = rejeitarBloco(atual.manifesto, atual.arquivos, blocoId);
        return r.ok ? { ok: true, passos: [{ caminho: caminho(atual, 'conteudoAssistente'), tipo: 'json', conteudo: r.conteudoAssistente, novo: false, validar: livre }] } : r;
      },
    });
  }

  /**
   * Conclui a revisão numa única transação: confere a base, monta o conteúdo canônico, calcula o hash, registra a decisão
   * material, congela a versão (hash gravado) e leva-a a validado_materialmente ("Pronto para publicar"). Não autoriza nem publica.
   */
  function concluirRevisao(servicoId, { revisao, ator }) {
    try {
      const quem = resolverAtor(ator);
      if (!quem.ok) return falha('ator_invalido');
      const c = carregar(servicoId);
      if (!c.ok) return c;
      const { manifesto, arquivos, pasta } = c.atual;
      if (manifesto.estado !== 'rascunho') return falha('versao_congelada');
      if (c.hash !== revisao) return falha('revisao_divergente');
      const pendencias = avaliarPendencias(arquivos, servicoId);
      if (pendencias.length > 0) return falha('revisao_incompleta', { pendencias });
      if (verificarFinal(raiz).length > 0) return falha('base_invalida');

      const data = dataLocal(agora());
      const congelada = congelarVersao(manifesto, arquivos, data);
      if (!congelada.ok) return falha(congelada.erro);
      if (congelada.hash !== c.hash) return falha('hash_divergente');
      const decisoes = historico.listarDecisoes(servicoId);
      if (!decisoes.ok) return decisoes;
      // Se uma tentativa anterior foi desfeita depois de gravar a decisão (mesma versão e mesmo hash), ela é reaproveitada.
      const idDecisao = `decisao-${manifesto.id}-${c.hash.slice(0, 16)}`;
      const existente = decisoes.registros.find((x) => x.id === idDecisao);
      if (existente && !(existente.tipo === 'decisao_material' && existente.versaoId === manifesto.id && existente.hashConteudo === c.hash
        && existente.decisao === 'validado_materialmente' && registroDoAtor(existente, quem.ator))) {
        return falha('historico_invalido');
      }
      const jaRegistrada = existente !== undefined;
      const decisao = registrarDecisaoMaterial(congelada.versao, decisoes.registros.filter((x) => x.id !== idDecisao), {
        id: idDecisao,
        versaoId: manifesto.id,
        hashConteudo: c.hash,
        ator: quem.ator,
        data,
        decisao: 'validado_materialmente',
        observacao: null,
      });
      if (!decisao.ok) return falha('decisao_recusada');
      // O manifesto (que vai para o Git) guarda só perfil e setor de quem validou; a auditoria completa fica em data/admin-private/.
      const manifestoValidado = { ...decisao.versao, responsaveis: { ...(decisao.versao.responsaveis ?? {}), validacao: responsavelPublico(quem.ator) } };

      let motivo = null;
      const r = executarTransacao({
        raiz,
        sistema,
        passos: [{ caminho: `${pasta}/${NOME_DO_MANIFESTO}`, tipo: 'json', conteudo: manifestoValidado, novo: false, validar: (d) => validarVersao(d) }],
        verificar: () => {
          const erros = verificarFinal(raiz);
          if (erros.length > 0) return erros;
          if (hashEmDisco(servicoId, manifesto.id) !== c.hash) return ['hash_divergente'];
          if ((!jaRegistrada && !historico.registrarDecisao(servicoId, decisao.registro).ok)
            || !historico.registrarAcao(servicoId, { versaoId: manifesto.id, hashConteudo: c.hash, acao: 'concluir_revisao', ator: quem.ator }).ok) {
            motivo = 'historico_indisponivel';
            return ['historico'];
          }
          return [];
        },
      });
      return r.ok ? { ok: true, versaoId: manifesto.id, hash: c.hash, estado: decisao.versao.estado } : mapearFalha(r, motivo);
    } catch {
      return falha('indisponivel');
    }
  }

  /** Nova versão a partir da atual congelada (5A). A versão publicada anterior e a atual ficam intactas. */
  function criarNovaVersao(servicoId, { ator } = {}) {
    try {
      const quem = resolverAtor(ator);
      if (!quem.ok) return falha('ator_invalido');
      const c = carregar(servicoId);
      if (!c.ok) return c;
      const origem = c.atual.manifesto;
      let motivo = null;
      const r = criarNovaVersaoDoServico({
        raiz,
        sistema,
        servicoId,
        agora,
        verificarFinal: (r2) => {
          const erros = verificarFinal(r2);
          if (erros.length > 0) return erros;
          if (!historico.registrarAcao(servicoId, { versaoId: origem.id, hashConteudo: origem.hashConteudo ?? null, acao: 'nova_versao', ator: quem.ator }).ok) {
            motivo = 'historico_indisponivel';
            return ['historico'];
          }
          return [];
        },
      });
      if (r.ok) return r;
      if (motivo && r.erro === 'verificacao_recusada') return falha(motivo, { revertido: true });
      return r;
    } catch {
      return falha('indisponivel');
    }
  }

  return {
    consultar,
    revisarFonte: revisarFonteDoServico,
    aceitarBloco: aceitarBlocoDoServico,
    rejeitarBloco: rejeitarBlocoDoServico,
    reabrirBloco: reabrirBlocoDoServico,
    lerFonteParaEdicao,
    impactoDaFonte,
    editarFonte: editarFonteDoServico,
    excluirFonte: excluirFonteDoServico,
    lerServicoParaEdicao,
    listarCandidatosDeImportacao,
    importarConteudo: importarConteudoDoServico,
    editarServico: editarServicoDoServico,
    concluirRevisao,
    criarNovaVersao,
  };
}
