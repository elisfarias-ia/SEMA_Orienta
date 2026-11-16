// Revisão humana de um serviço (Sprint 5, Passo 5B1): orquestra leitura, regras puras (revisao.js), transação com desfazer e
// histórico privado. Sem rotas e sem interface aqui (as rotas chamam este módulo, sob a trava comum das gravações). Nada é
// autorizado nem publicado. Erros são códigos, nunca caminhos nem conteúdo.
//
// Revisão otimista: toda ação recebe `revisao`, o hash canônico do conteúdo que a pessoa viu (devolvido pela consulta); se o
// conteúdo mudou desde então, a ação é recusada (revisao_divergente). Cada gravação é uma transação (tudo ou nada) e o
// histórico privado é acrescentado DENTRO da conferência final: se o histórico não puder ser gravado, a base volta ao que era.

import fs from 'node:fs';
import { criarArmazenamento } from './armazenamento.js';
import { calcularHashDaVersao } from './conteudo-versao.js';
import { congelarVersao } from './congelamento.js';
import { registrarDecisaoMaterial } from './decisoes.js';
import { ATOR_DEMONSTRACAO, criarHistoricoRevisao } from './historico-revisao.js';
import { criarNovaVersaoDoServico } from './nova-versao.js';
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

export function criarServicoRevisao({ raiz, sistema = fs, agora = () => new Date(), verificarFinal = (r) => validarServicos(r).erros } = {}) {
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
  function gravar({ servicoId, revisao, acao, preparar }) {
    try {
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
          if (!historico.registrarAcao(servicoId, { versaoId, hashConteudo: hashDepois, acao }).ok) {
            motivo = 'historico_indisponivel';
            return ['historico'];
          }
          return [];
        },
      });
      return r.ok ? { ok: true, revisao: hashDepois } : mapearFalha(r, motivo);
    } catch {
      return falha('indisponivel');
    }
  }

  const caminho = (atual, chave) => caminhosDaVersao(atual.pasta)[chave];

  function revisarFonteDoServico(servicoId, { fonteId, revisao }) {
    return gravar({
      servicoId, revisao, acao: 'revisar_fonte',
      preparar: (atual, data) => {
        const r = revisarFonte(atual.arquivos, fonteId, data, servicoId);
        return r.ok ? { ok: true, passos: [{ caminho: caminho(atual, 'fontes'), tipo: 'json', conteudo: r.fontes, novo: false, validar: livre }] } : r;
      },
    });
  }

  function aceitarBlocoDoServico(servicoId, { blocoId, revisao }) {
    return gravar({
      servicoId, revisao, acao: 'aceitar_bloco',
      preparar: (atual, data) => {
        const r = aceitarBloco(atual.arquivos, blocoId, data);
        return r.ok ? { ok: true, passos: [{ caminho: caminho(atual, 'conteudoAssistente'), tipo: 'json', conteudo: r.conteudoAssistente, novo: false, validar: livre }] } : r;
      },
    });
  }

  function reabrirBlocoDoServico(servicoId, { blocoId, revisao }) {
    return gravar({
      servicoId, revisao, acao: 'reabrir_bloco',
      preparar: (atual, data) => {
        const r = reabrirBloco(atual.arquivos, blocoId, data);
        return r.ok ? { ok: true, passos: [{ caminho: caminho(atual, 'conteudoAssistente'), tipo: 'json', conteudo: r.conteudoAssistente, novo: false, validar: livre }] } : r;
      },
    });
  }

  function rejeitarBlocoDoServico(servicoId, { blocoId, revisao }) {
    return gravar({
      servicoId, revisao, acao: 'rejeitar_bloco',
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
  function concluirRevisao(servicoId, { revisao }) {
    try {
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
        && existente.decisao === 'validado_materialmente' && existente.responsavel === ATOR_DEMONSTRACAO.responsavel
        && existente.unidade === ATOR_DEMONSTRACAO.unidade)) {
        return falha('historico_invalido');
      }
      const jaRegistrada = existente !== undefined;
      const decisao = registrarDecisaoMaterial(congelada.versao, decisoes.registros.filter((x) => x.id !== idDecisao), {
        id: idDecisao,
        versaoId: manifesto.id,
        hashConteudo: c.hash,
        responsavel: ATOR_DEMONSTRACAO.responsavel,
        unidade: ATOR_DEMONSTRACAO.unidade,
        data,
        decisao: 'validado_materialmente',
        observacao: null,
      });
      if (!decisao.ok) return falha('decisao_recusada');

      let motivo = null;
      const r = executarTransacao({
        raiz,
        sistema,
        passos: [{ caminho: `${pasta}/${NOME_DO_MANIFESTO}`, tipo: 'json', conteudo: decisao.versao, novo: false, validar: (d) => validarVersao(d) }],
        verificar: () => {
          const erros = verificarFinal(raiz);
          if (erros.length > 0) return erros;
          if (hashEmDisco(servicoId, manifesto.id) !== c.hash) return ['hash_divergente'];
          if ((!jaRegistrada && !historico.registrarDecisao(servicoId, decisao.registro).ok)
            || !historico.registrarAcao(servicoId, { versaoId: manifesto.id, hashConteudo: c.hash, acao: 'concluir_revisao' }).ok) {
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
  function criarNovaVersao(servicoId) {
    try {
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
          if (!historico.registrarAcao(servicoId, { versaoId: origem.id, hashConteudo: origem.hashConteudo ?? null, acao: 'nova_versao' }).ok) {
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
    concluirRevisao,
    criarNovaVersao,
  };
}
