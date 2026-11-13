// Saúde do sistema (Marco 8, Passo 8B): verificações REAIS do ambiente administrativo local, sem fingir funcionamento.
//
// Cada componente informa duas coisas separadas:
//   - capacidade: o que o sistema oferece de fato (implementado, nao_implementado, nao_se_aplica);
//   - estado: o resultado da verificação agora (operacional, degradado, indisponivel, nao_verificado).
// Componente que não existe fica nao_implementado e nao_verificado: nunca "operacional". Mensagens são textos públicos
// fixos e curtos; nunca carregam caminhos, erros internos, tokens, dados ou conteúdo da base.
//
// O teste de armazenamento usa uma pasta temporária FORA dos dados reais e a remove ao final. Nada da base é gravado.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { criarArmazenamento } from './armazenamento.js';
import { validarVersao } from './versao.js';
import { localizarVersaoAtual, NOME_DO_MANIFESTO } from '../versao-atual.js';
import { validarAssuntos, validarServicos } from '../../scripts/validate-services.js';

export const CAPACIDADES = Object.freeze(['implementado', 'nao_implementado', 'nao_se_aplica']);
export const ESTADOS = Object.freeze(['operacional', 'degradado', 'indisponivel', 'nao_verificado']);
export const COMPONENTES = Object.freeze([
  'aplicacao_administrativa', 'base_assuntos', 'base_servicos_versoes', 'base_referencias', 'armazenamento', 'conteudo_publicado',
  'processamento_fontes', 'banco_de_dados', 'ia_externa', 'mcp',
]);

const plural = (n, singular, pluralTexto) => `${n} ${n === 1 ? singular : pluralTexto}`;

/**
 * Executa as verificações e devolve { geradoEm, componentes }. Cada componente:
 * { componente, capacidade, estado, verificadoEm (ISO), mensagem }. Opções: `agora` (relógio injetável), `sistema`
 * (módulo de arquivos usado pelo teste de armazenamento) e `diretorioTemporario`.
 */
export function verificarSaude({ raiz, sistema = fs, agora = () => new Date(), diretorioTemporario = os.tmpdir() } = {}) {
  const item = (componente, capacidade, estado, mensagem) => ({ componente, capacidade, estado, verificadoEm: agora().toISOString(), mensagem });
  const executar = (componente, funcao) => {
    try {
      return funcao();
    } catch {
      return item(componente, 'implementado', 'indisponivel', 'A verificação falhou e o componente não pôde ser confirmado.');
    }
  };

  const armazenamento = criarArmazenamento({ raiz, sistema });
  const raizValida = armazenamento.ok !== false;
  const lerBase = (relativo) => {
    if (!raizValida) throw new Error('raiz');
    const r = armazenamento.lerJson(relativo);
    if (!r.ok) throw new Error('leitura');
    return r.dados;
  };

  const componentes = [];

  componentes.push(executar('aplicacao_administrativa', () => (raizValida
    ? item('aplicacao_administrativa', 'implementado', 'operacional', 'A aplicação administrativa local está respondendo.')
    : item('aplicacao_administrativa', 'implementado', 'indisponivel', 'A pasta do projeto não está acessível.'))));

  componentes.push(executar('base_assuntos', () => {
    let dados;
    try {
      dados = lerBase('services/assuntos.json');
    } catch {
      return item('base_assuntos', 'implementado', 'indisponivel', 'Não foi possível ler os assuntos.');
    }
    const r = validarAssuntos(dados);
    if (r.erros.length > 0) return item('base_assuntos', 'implementado', 'degradado', 'Há inconsistências no cadastro de assuntos.');
    return item('base_assuntos', 'implementado', 'operacional', `${plural(r.assuntos.size, 'assunto válido', 'assuntos válidos')}.`);
  }));

  componentes.push(executar('base_servicos_versoes', () => {
    let servicos;
    try {
      servicos = lerBase('services/registry.json').servicos;
      if (!Array.isArray(servicos)) throw new Error('formato');
    } catch {
      return item('base_servicos_versoes', 'implementado', 'indisponivel', 'Não foi possível ler os serviços cadastrados.');
    }
    let comProblema = 0;
    for (const s of servicos) {
      const versao = typeof s?.id === 'string' ? localizarVersaoAtual(raiz, s.id) : { ok: false };
      let valida = versao.ok;
      if (valida) {
        const manifesto = armazenamento.lerJson(`${versao.pasta}/${NOME_DO_MANIFESTO}`);
        valida = manifesto.ok && validarVersao(manifesto.dados).length === 0;
      }
      if (!valida) comProblema += 1;
    }
    if (comProblema > 0) return item('base_servicos_versoes', 'implementado', 'degradado', `${plural(comProblema, 'serviço com problema', 'serviços com problema')} na versão atual, de ${servicos.length}.`);
    return item('base_servicos_versoes', 'implementado', 'operacional', `${plural(servicos.length, 'serviço com versão atual válida', 'serviços com versão atual válida')}.`);
  }));

  componentes.push(executar('base_referencias', () => {
    const r = validarServicos(raiz);
    if (r.erros.length > 0) return item('base_referencias', 'implementado', 'degradado', 'Há referências inconsistentes entre assuntos, serviços, versões e fontes.');
    return item('base_referencias', 'implementado', 'operacional', 'As referências entre assuntos, serviços, versões e fontes estão consistentes.');
  }));

  componentes.push(executar('armazenamento', () => {
    const rotulo = 'armazenamento';
    let temporaria = null;
    try {
      temporaria = fs.mkdtempSync(path.join(diretorioTemporario, 'sema-orienta-saude-'));
      const dentroDaRaiz = path.relative(path.resolve(raiz), temporaria);
      if (!dentroDaRaiz.startsWith('..') && !path.isAbsolute(dentroDaRaiz)) throw new Error('local');
      const teste = criarArmazenamento({ raiz: temporaria, sistema });
      if (teste.ok === false) throw new Error('raiz');
      const vazio = () => [];
      if (!teste.gravarJson('teste.json', { verificacao: true }, vazio).ok) throw new Error('gravar');
      const lido = teste.lerJson('teste.json');
      if (!lido.ok || lido.dados.verificacao !== true) throw new Error('ler');
      if (!teste.acrescentarJsonl('historico.jsonl', { id: 'registro-um' }, vazio).ok) throw new Error('acrescentar');
      const lista = teste.listarJsonl('historico.jsonl');
      if (!lista.ok || lista.registros.length !== 1) throw new Error('listar');
      return item(rotulo, 'implementado', 'operacional', 'Gravação e leitura num teste temporário funcionaram, sem tocar nos dados reais.');
    } catch {
      return item(rotulo, 'implementado', 'indisponivel', 'O teste temporário de gravação e leitura falhou.');
    } finally {
      if (temporaria !== null) {
        try { fs.rmSync(temporaria, { recursive: true, force: true }); } catch { /* a pasta temporária é só do teste */ }
      }
    }
  }));

  componentes.push(executar('conteudo_publicado', () => {
    let versoesPublicadas = 0;
    let itensPublicados = 0;
    try {
      const servicos = lerBase('services/registry.json').servicos;
      for (const s of servicos) {
        if (typeof s.versaoPublicadaId === 'string' && s.versaoPublicadaId !== '') versoesPublicadas += 1;
        const versao = localizarVersaoAtual(raiz, s.id);
        if (!versao.ok) throw new Error('versao');
        for (const [chave, campo] of [['fontes', 'fontes'], ['documentos', 'documentos'], ['perguntasFrequentes', 'perguntas'], ['conteudoAssistente', 'blocos']]) {
          const doc = lerBase(versao.arquivos[chave]);
          if (!Array.isArray(doc[campo])) throw new Error('formato');
          itensPublicados += doc[campo].filter((x) => x && x.publicado === true).length;
        }
      }
    } catch {
      return item('conteudo_publicado', 'implementado', 'indisponivel', 'Não foi possível contar o conteúdo publicado.');
    }
    if (versoesPublicadas === 0 && itensPublicados === 0) return item('conteudo_publicado', 'implementado', 'operacional', 'Nenhum conteúdo está publicado.');
    return item('conteudo_publicado', 'implementado', 'operacional', `${plural(versoesPublicadas, 'versão publicada', 'versões publicadas')} e ${plural(itensPublicados, 'item marcado como publicado', 'itens marcados como publicados')}.`);
  }));

  // Componentes que não existem: nunca aparecem como operacionais.
  componentes.push(item('processamento_fontes', 'nao_implementado', 'nao_verificado', 'O processamento de fontes ainda não existe.'));
  componentes.push(item('banco_de_dados', 'nao_implementado', 'nao_verificado', 'Não há banco de dados: o conteúdo fica em arquivos do projeto.'));
  componentes.push(item('ia_externa', 'nao_implementado', 'nao_verificado', 'A integração com IA externa ainda não existe.'));
  componentes.push(item('mcp', 'nao_se_aplica', 'nao_verificado', 'MCP não faz parte da operação do produto.'));

  return { geradoEm: agora().toISOString(), componentes };
}
