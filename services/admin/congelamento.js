// Congelamento da versão revisada (Sprint 5, Passo 5A): "concluir a revisão" calcula o hash do conteúdo canônico (incluindo
// entradas.json), grava-o no manifesto e leva a versão de rascunho para em_validacao. Depois disso a versão não é editável
// (fluxo.js) e qualquer alteração exige NOVA versão. Não há rota, interface nem histórico neste passo.
//
// Duas camadas: `congelarVersao` (pura) e `congelarVersaoDoServico` (lê a versão atual, grava só o manifesto, tudo ou nada,
// e confere a base inteira depois). Erros são códigos, nunca caminhos nem conteúdo.

import fs from 'node:fs';
import { criarArmazenamento } from './armazenamento.js';
import { calcularHashDaVersao } from './conteudo-versao.js';
import { executarTransacao } from './transacao.js';
import { dataIsoValida, enviarParaValidacao, validarVersao } from './versao.js';
import { lerArquivosDaVersao } from './versao-arquivos.js';
import { NOME_DO_MANIFESTO } from '../versao-atual.js';
import { validarServicos } from '../../scripts/validate-services.js';

const ehObjeto = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const dataLocal = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const falha = (erro) => ({ ok: false, erro });

/**
 * PURA. Congela o manifesto de uma versão em rascunho: devolve uma cópia em em_validacao com o hash do conteúdo canônico.
 * `arquivos` são os conteúdos lidos (ver montarConteudoCanonico). Retorna { ok: true, versao, hash } ou { ok: false, erro }.
 */
export function congelarVersao(manifesto, arquivos, data) {
  if (!ehObjeto(manifesto)) return falha('versao_invalida');
  if (manifesto.estado !== 'rascunho') return falha('versao_ja_congelada');
  if (!dataIsoValida(data)) return falha('data_invalida');
  const h = calcularHashDaVersao(arquivos);
  if (!h.ok) return falha(h.erro);
  const r = enviarParaValidacao(manifesto, h.conteudo, data);
  if (!r.ok) return falha(r.erro);
  return { ok: true, versao: r.versao, hash: h.hash };
}

/**
 * Congela a versão ATUAL do serviço. Só a versão atual em rascunho pode ser congelada. Grava somente o versao.json, numa
 * transação com conferência final da base inteira (e desfazer). Retorna { ok: true, versaoId, hash } ou
 * { ok: false, erro, revertido? }, com erros: servico_nao_encontrado, versao_invalida, manifesto_*, arquivo_ausente,
 * versao_ja_congelada, data_invalida, dados_invalidos, falha_de_escrita, verificacao_recusada, desfazer_incompleto.
 */
export function congelarVersaoDoServico({ raiz, sistema = fs, servicoId, agora = () => new Date(), verificarFinal = (r) => validarServicos(r).erros } = {}) {
  const arm = criarArmazenamento({ raiz, sistema });
  if (arm.ok === false) return falha('raiz_invalida');
  const registro = arm.lerJson('services/registry.json');
  if (!registro.ok || !ehObjeto(registro.dados) || !Array.isArray(registro.dados.servicos)) return falha('registro_indisponivel');
  const entrada = registro.dados.servicos.find((s) => ehObjeto(s) && s.id === servicoId);
  if (!entrada) return falha('servico_nao_encontrado');

  const lida = lerArquivosDaVersao({ raiz, servicoId, versaoId: entrada.versaoAtualId, sistema });
  if (!lida.ok) return lida;
  const c = congelarVersao(lida.manifesto, lida.arquivos, dataLocal(agora()));
  if (!c.ok) return c;

  const r = executarTransacao({
    raiz,
    sistema,
    passos: [{ caminho: `${lida.pasta}/${NOME_DO_MANIFESTO}`, tipo: 'json', conteudo: c.versao, novo: false, validar: (d) => validarVersao(d) }],
    verificar: () => verificarFinal(raiz),
  });
  if (!r.ok) {
    if (r.revertido === false) return { ok: false, erro: 'desfazer_incompleto', revertido: false };
    return { ok: false, erro: r.erro === 'dados_invalidos' || r.erro === 'verificacao_recusada' ? r.erro : 'falha_de_escrita', revertido: true };
  }
  return { ok: true, versaoId: entrada.versaoAtualId, hash: c.hash };
}
