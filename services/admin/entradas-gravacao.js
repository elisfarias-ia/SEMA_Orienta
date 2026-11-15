// Gravação de entradas de texto (Sprint 4, Passo 4B1). Cria ou atualiza, em UMA transação (transacao.js), o entradas.json, o
// fontes.json e, quando o arquivo de entradas ainda não existe na versão, o manifesto versao.json (acrescentando
// `arquivos.entradas`). A verificação final roda o validador da base inteira; qualquer falha desfaz tudo (arquivo novo removido,
// existentes restaurados byte a byte). Uma gravação por vez, como nas demais rotas administrativas (trava).
//
// Sem rota HTTP neste passo. O texto da entrada nunca entra em erros, resposta de falha ou log: só códigos e nomes de campos.
// A data vem de fora (`agora`), sem relógio próprio.
//
// ATENÇÃO (4B2): a trava deste gravador é por instância. Ao ligar a rota, ela deve ser a MESMA trava das demais escritas
// administrativas (comTrava do admin-endpoint), senão duas rotas poderiam gravar ao mesmo tempo.

import fs from 'node:fs';
import { criarArmazenamento } from './armazenamento.js';
import { CHAVE_ENTRADAS, NOME_ARQUIVO_ENTRADAS, prepararEntradaTexto, validarArquivoEntradas, validarCorpoEntradaTexto } from './entradas.js';
import { executarTransacao } from './transacao.js';
import { validarVersao } from './versao.js';
import { NOME_DO_MANIFESTO, caminhosDaVersao, pastaDaVersao } from '../versao-atual.js';
import { validarFontes, validarServicos } from '../../scripts/validate-services.js';

const ehObjeto = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const dataLocal = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const indisponivel = { ok: false, status: 500, erro: 'indisponivel' };

/**
 * Cria o gravador. `agora` devolve a data atual (injetável); `sistema` troca o módulo de arquivos (testes simulam falhas);
 * `verificarFinal(raiz)` devolve a lista de erros da base (padrão: validarServicos); `antesDeGravar` é gancho assíncrono dentro da trava.
 * `gravarEntradaTexto(servicoId, corpo)` retorna { ok: true, status: 201, entradaId, fonteId, hash, criouArquivo }
 * ou { ok: false, status, erro, campos? | campo? }.
 */
export function criarGravadorEntradas({ raiz, sistema = fs, agora = () => new Date(), verificarFinal = (r) => validarServicos(r).erros, antesDeGravar } = {}) {
  let escrevendo = false;

  /** Lê o estado da versão atual: registro, manifesto, fontes e entradas (ou null se ainda não existe). */
  function lerEstado(servicoId) {
    const arm = criarArmazenamento({ raiz, sistema });
    if (arm.ok === false) return null;
    const ler = (caminho) => {
      const r = arm.lerJson(caminho);
      return r.ok ? r.dados : null;
    };
    const registro = ler('services/registry.json');
    const entradaRegistro = registro && Array.isArray(registro.servicos) ? registro.servicos.find((s) => ehObjeto(s) && s.id === servicoId) : null;
    if (!entradaRegistro) return { naoEncontrado: true };
    const pasta = pastaDaVersao(servicoId, entradaRegistro.versaoAtualId);
    if (!pasta) return null;
    const manifesto = ler(`${pasta}/${NOME_DO_MANIFESTO}`);
    if (!ehObjeto(manifesto) || manifesto.id !== entradaRegistro.versaoAtualId || manifesto.servicoId !== servicoId || !ehObjeto(manifesto.arquivos)) return null;
    const caminhos = caminhosDaVersao(pasta);
    const caminhoEntradas = `${pasta}/${NOME_ARQUIVO_ENTRADAS}`;
    const declarado = manifesto.arquivos[CHAVE_ENTRADAS];
    if (declarado !== undefined && declarado !== caminhoEntradas) return null;
    const documentoFontes = ler(caminhos.fontes);
    if (!ehObjeto(documentoFontes) || !Array.isArray(documentoFontes.fontes)) return null;
    let documentoEntradas = null;
    if (declarado !== undefined) {
      documentoEntradas = ler(caminhoEntradas);
      if (documentoEntradas === null) return null;
    }
    return { pasta, manifesto, caminhoManifesto: `${pasta}/${NOME_DO_MANIFESTO}`, caminhoFontes: caminhos.fontes, caminhoEntradas, documentoFontes, documentoEntradas };
  }

  function gravar(servicoId, corpo) {
    const validado = validarCorpoEntradaTexto(corpo);
    if (!validado.ok) return { ok: false, status: 422, erro: 'dados_invalidos', campos: validado.campos };
    let estado;
    try {
      estado = lerEstado(servicoId);
    } catch {
      return indisponivel;
    }
    if (estado === null) return indisponivel;
    if (estado.naoEncontrado) return { ok: false, status: 404, erro: 'nao_encontrado', campo: 'servico' };

    const preparado = prepararEntradaTexto(validado.dados, {
      data: dataLocal(agora()),
      servicoId,
      estadoVersao: estado.manifesto.estado,
      documentoFontes: estado.documentoFontes,
      documentoEntradas: estado.documentoEntradas,
    });
    if (!preparado.ok) {
      const status = preparado.erro === 'versao_nao_editavel' ? 409 : 422;
      return { ok: false, status, erro: preparado.erro, ...(preparado.campo ? { campo: preparado.campo } : {}) };
    }

    const fontesDaVersao = preparado.documentoFontes.fontes;
    const passos = [
      {
        caminho: estado.caminhoEntradas, tipo: 'json', conteudo: preparado.documentoEntradas, novo: preparado.criaArquivo,
        validar: (d) => validarArquivoEntradas(d, { servicoId, fontes: fontesDaVersao }),
      },
      { caminho: estado.caminhoFontes, tipo: 'json', conteudo: preparado.documentoFontes, novo: false, validar: (d) => validarFontes(d) },
    ];
    if (preparado.criaArquivo) {
      const manifestoNovo = { ...estado.manifesto, arquivos: { ...estado.manifesto.arquivos, [CHAVE_ENTRADAS]: estado.caminhoEntradas } };
      passos.push({ caminho: estado.caminhoManifesto, tipo: 'json', conteudo: manifestoNovo, novo: false, validar: (d) => validarVersao(d) });
    }

    const r = executarTransacao({ raiz, sistema, passos, verificar: () => verificarFinal(raiz) });
    if (!r.ok) {
      // Desfazer incompleto: erro distinto, sem texto nem caminho; a base pode ter ficado parcialmente alterada.
      if (r.revertido === false) return { ok: false, status: 500, erro: 'desfazer_incompleto' };
      if (r.erro === 'dados_invalidos' || r.erro === 'verificacao_recusada') return { ok: false, status: 422, erro: 'dados_invalidos' };
      if (r.erro === 'ja_existe') return { ok: false, status: 409, erro: 'ja_existe' };
      return indisponivel;
    }
    return { ok: true, status: 201, entradaId: preparado.entrada.id, fonteId: preparado.fonte.id, hash: preparado.entrada.hash, criouArquivo: preparado.criaArquivo };
  }

  /** Uma gravação por vez: se outra estiver em andamento, esta é recusada (nada é enfileirado). */
  async function gravarEntradaTexto(servicoId, corpo) {
    if (escrevendo) return { ok: false, status: 409, erro: 'operacao_em_andamento' };
    escrevendo = true;
    try {
      if (antesDeGravar) await antesDeGravar();
      return gravar(servicoId, corpo);
    } catch {
      return indisponivel;
    } finally {
      escrevendo = false;
    }
  }

  // `gravar` (síncrono, sem trava própria) é para quem já tem a trava comum das gravações administrativas (rota do endpoint).
  return { gravarEntradaTexto, gravar };
}
