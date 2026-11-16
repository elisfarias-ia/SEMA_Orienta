// Nova versão de um serviço (Sprint 5, Passo 5A): cria a próxima versão como cópia INDEPENDENTE da atual, reinicia revisão,
// autorização e publicação e só então passa a ser a versão atual (`versaoAtualId`), numa única transação com desfazer.
// A versão anterior (inclusive a publicada) fica intacta, e `versaoPublicadaId` continua apontando para ela.
// Não há rota, interface nem histórico neste passo. Erros são códigos, nunca caminhos nem conteúdo.
//
// Cópia independente: nova pasta (services/<id>/versoes/v<N>/), arquivos novos com caminhos da PRÓPRIA pasta (inclusive os
// caminhos internos do service.json), entradas copiadas (copiarEntradasParaNovaVersao) e roteiro copiado BYTE A BYTE (gravarTextoExato: sem aparar, sem mexer em
// quebras de linha; a normalização de CRLF/LF existe só na representação canônica do hash).
// Reinício: manifesto em rascunho sem hash; o que estava VALIDADO volta a em_validacao (o status "rascunho" do serviço e dos
// arquivos é o esqueleto vazio e exige conteúdo PENDENTE, então não é usado para conteúdo copiado); `publicado` false;
// revisão de atualidade pendente; blocos de conhecimento reiniciados em rascunho (prepararBlocosParaNovaVersao).

import fs from 'node:fs';
import path from 'node:path';
import { criarArmazenamento } from './armazenamento.js';
import { prepararBlocosParaNovaVersao } from './conhecimento.js';
import { copiarEntradasParaNovaVersao } from './entradas.js';
import { executarTransacao } from './transacao.js';
import { criarNovaVersao, dataIsoValida, validarVersao } from './versao.js';
import { lerArquivosDaVersao } from './versao-arquivos.js';
import { caminhosDaVersao, NOME_DO_MANIFESTO, pastaDaVersao } from '../versao-atual.js';
import { validarServicos } from '../../scripts/validate-services.js';

const ehObjeto = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const dataLocal = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const falha = (erro) => ({ ok: false, erro });
const PADRAO_PASTA_VERSAO = /^v([1-9][0-9]*)$/;

/** Validado volta a em_validacao; rascunho e em_validacao ficam como estão. */
const reiniciarStatus = (status) => (status === 'validado' ? 'em_validacao' : status);

/** Reinicia status de validação, publicação e revisão de um item (cópia nova). */
function reiniciarItem(item) {
  if (!ehObjeto(item)) return item;
  const novo = { ...item };
  if ('statusValidacao' in novo) novo.statusValidacao = reiniciarStatus(novo.statusValidacao);
  if ('publicado' in novo) novo.publicado = false;
  if ('revisaoAtualidade' in novo) novo.revisaoAtualidade = 'pendente';
  return novo;
}

/** Reinício de um arquivo de lista (documentos, perguntas, fontes): nada validado nem publicado. */
function reiniciarLista(doc, chaveLista) {
  const copia = structuredClone(doc);
  if ('statusValidacao' in copia) copia.statusValidacao = reiniciarStatus(copia.statusValidacao);
  if (Array.isArray(copia[chaveLista])) copia[chaveLista] = copia[chaveLista].map(reiniciarItem);
  return copia;
}

/**
 * PURA. Monta o conteúdo da nova versão a partir da anterior. `arquivos` são os conteúdos lidos da versão anterior;
 * `pastaNova` é a pasta da nova versão. Retorna { ok: true, arquivos } (mesmas chaves de lerArquivosDaVersao) ou { ok: false, erro }.
 */
export function prepararConteudoDaNovaVersao(arquivos, { servicoId, pastaNova, data } = {}) {
  if (!ehObjeto(arquivos) || typeof pastaNova !== 'string' || !dataIsoValida(data)) return falha('conteudo_invalido');
  const caminhos = caminhosDaVersao(pastaNova);

  const service = structuredClone(arquivos.service);
  if (!ehObjeto(service)) return falha('conteudo_invalido');
  service.statusValidacao = reiniciarStatus(service.statusValidacao);
  service.publicado = false;
  if ('responsavelValidacao' in service) service.responsavelValidacao = null;
  if ('dataRevisao' in service) service.dataRevisao = null;
  if (ehObjeto(service.arquivos)) {
    for (const chave of Object.keys(service.arquivos)) {
      if (!(chave in caminhos)) return falha('conteudo_invalido');
      service.arquivos[chave] = caminhos[chave];
    }
  }

  const blocos = prepararBlocosParaNovaVersao(arquivos.conteudoAssistente, { data });
  if (!blocos.ok) return falha(blocos.erro);
  const conteudoAssistente = blocos.conteudo;
  conteudoAssistente.statusValidacao = reiniciarStatus(conteudoAssistente.statusValidacao);

  const novo = {
    service,
    roteiro: arquivos.roteiro,
    documentos: reiniciarLista(arquivos.documentos, 'documentos'),
    perguntasFrequentes: reiniciarLista(arquivos.perguntasFrequentes, 'perguntas'),
    fontes: reiniciarLista(arquivos.fontes, 'fontes'),
    conteudoAssistente,
  };
  if ('entradas' in arquivos) {
    const e = copiarEntradasParaNovaVersao(arquivos.entradas, servicoId);
    if (!e.ok) return falha(e.erro);
    novo.entradas = e.documento;
  }
  return { ok: true, arquivos: novo };
}

/** Manifestos de todas as versões existentes do serviço (pastas v<N>). Retorna a lista ou null se algo estiver ilegível. */
function lerManifestos(arm, sistema, raiz, servicoId) {
  let nomes;
  try {
    nomes = sistema.readdirSync(`${arm.raiz}/services/${servicoId}/versoes`);
  } catch {
    return null;
  }
  const manifestos = [];
  for (const nome of nomes) {
    const m = PADRAO_PASTA_VERSAO.exec(nome);
    if (!m) return null;
    const r = arm.lerJson(`services/${servicoId}/versoes/${nome}/${NOME_DO_MANIFESTO}`);
    if (!r.ok || validarVersao(r.dados).length > 0 || r.dados.servicoId !== servicoId || r.dados.numero !== Number(m[1])) return null;
    manifestos.push(r.dados);
  }
  return manifestos;
}

/**
 * Cria a nova versão do serviço e a torna a versão atual. Só a partir de uma versão que já recebeu decisão ou foi publicada
 * (nunca de rascunho nem de em_validacao). Retorna { ok: true, versaoId, numero, baseadaEm } ou { ok: false, erro, revertido? }.
 */
export function criarNovaVersaoDoServico({ raiz, sistema = fs, servicoId, agora = () => new Date(), verificarFinal = (r) => validarServicos(r).erros } = {}) {
  const arm = criarArmazenamento({ raiz, sistema });
  if (arm.ok === false) return falha('raiz_invalida');
  const registro = arm.lerJson('services/registry.json');
  if (!registro.ok || !ehObjeto(registro.dados) || !Array.isArray(registro.dados.servicos)) return falha('registro_indisponivel');
  const entrada = registro.dados.servicos.find((s) => ehObjeto(s) && s.id === servicoId);
  if (!entrada) return falha('servico_nao_encontrado');

  const atual = lerArquivosDaVersao({ raiz, servicoId, versaoId: entrada.versaoAtualId, sistema });
  if (!atual.ok) return atual;
  const existentes = lerManifestos(arm, sistema, raiz, servicoId);
  if (existentes === null) return falha('versoes_invalidas');

  const data = dataLocal(agora());
  const numero = Math.max(...existentes.map((v) => v.numero)) + 1;
  const versaoId = `${servicoId}-v${numero}`;
  const pastaNova = pastaDaVersao(servicoId, versaoId);
  if (pastaNova === null) return falha('versao_invalida');
  const caminhosNovos = { ...caminhosDaVersao(pastaNova), ...('entradas' in atual.arquivos ? { entradas: `${pastaNova}/entradas.json` } : {}) };

  const nova = criarNovaVersao(atual.manifesto, { id: versaoId, criadoEm: data, arquivos: caminhosNovos }, existentes);
  if (!nova.ok) return falha(nova.erro);
  const conteudo = prepararConteudoDaNovaVersao(atual.arquivos, { servicoId, pastaNova, data });
  if (!conteudo.ok) return conteudo;

  const novos = conteudo.arquivos;
  const livre = () => [];
  const passos = [
    { caminho: caminhosNovos.service, tipo: 'json', conteudo: novos.service, novo: true, validar: livre },
    { caminho: caminhosNovos.roteiro, tipo: 'texto_exato', conteudo: novos.roteiro, novo: true, validar: livre },
    { caminho: caminhosNovos.documentos, tipo: 'json', conteudo: novos.documentos, novo: true, validar: livre },
    { caminho: caminhosNovos.perguntasFrequentes, tipo: 'json', conteudo: novos.perguntasFrequentes, novo: true, validar: livre },
    { caminho: caminhosNovos.fontes, tipo: 'json', conteudo: novos.fontes, novo: true, validar: livre },
    { caminho: caminhosNovos.conteudoAssistente, tipo: 'json', conteudo: novos.conteudoAssistente, novo: true, validar: livre },
    ...('entradas' in novos ? [{ caminho: caminhosNovos.entradas, tipo: 'json', conteudo: novos.entradas, novo: true, validar: livre }] : []),
    { caminho: `${pastaNova}/${NOME_DO_MANIFESTO}`, tipo: 'json', conteudo: nova.versao, novo: true, validar: (d) => validarVersao(d) },
  ];

  // O registro é o último passo: é ele que torna a nova versão a atual. Sem versão publicada, o registro acompanha o service.json
  // reiniciado; com versão publicada, status e publicação do registro continuam descrevendo a versão publicada.
  const entradaNova = { ...entrada, versaoAtualId: versaoId, arquivo: caminhosNovos.service };
  if (entrada.versaoPublicadaId === null) {
    entradaNova.statusValidacao = novos.service.statusValidacao;
    entradaNova.publicado = false;
  }
  passos.push({
    caminho: 'services/registry.json',
    tipo: 'json',
    conteudo: { ...registro.dados, servicos: registro.dados.servicos.map((s) => (s === entrada ? entradaNova : s)) },
    novo: false,
    validar: livre,
  });

  // Conferência de exatidão: o roteiro novo precisa ser idêntico, byte a byte, ao da versão de origem (senão, tudo é desfeito).
  const roteiroIgual = () => {
    try {
      const origem = sistema.readFileSync(path.join(arm.raiz, ...caminhosDaVersao(atual.pasta).roteiro.split('/')));
      const destino = sistema.readFileSync(path.join(arm.raiz, ...caminhosNovos.roteiro.split('/')));
      return Buffer.compare(origem, destino) === 0;
    } catch {
      return false;
    }
  };
  // Ordem importa: o verificarFinal recebido pode gravar o histórico privado, então ele roda por último, depois de tudo conferido.
  const verificar = () => (roteiroIgual() ? verificarFinal(raiz) : ['roteiro copiado difere do original']);
  const r = executarTransacao({ raiz, sistema, passos, verificar });
  if (!r.ok) {
    if (r.revertido === false) return { ok: false, erro: 'desfazer_incompleto', revertido: false };
    const erro = r.erro === 'dados_invalidos' || r.erro === 'verificacao_recusada' || r.erro === 'ja_existe' ? r.erro : 'falha_de_escrita';
    return { ok: false, erro, revertido: true };
  }
  return { ok: true, versaoId, numero, baseadaEm: atual.manifesto.id };
}
