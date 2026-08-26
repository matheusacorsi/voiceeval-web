// Pipeline de pos-transcricao: junta as transcricoes dos trechos de audio e produz a tabela por
// parcela. normalize -> resolve termos (alias->canonico) -> parse por parcela.
import { normalizeTranscript } from './normalize.js';
import { getAliasIndex, resolveKnownTerms } from './rules.js';
import { parseTranscript } from './parser.js';

// Junta os transcripts dos trechos (na ordem) num unico texto, separados por espaco. O parser
// delimita blocos pelo marcador "parcela" (nao por pontuacao), entao nao e preciso inserir ".".
export function joinTranscripts(audios) {
  return (audios || [])
    .map((a) => String((a && a.transcript) || '').trim())
    .filter(Boolean)
    .join(' ');
}

// Executa o pipeline sobre um texto bruto. Devolve tabela_final + columns + textos intermediarios.
// options: { subsamples?:number, defaultItem?:string } — repassados ao parser (modo subamostra).
export async function runPipeline(rawText, options = {}) {
  const text = String(rawText || '').trim();
  if (!text) return { tabela_final: [], columns: ['Parcela'], perdidas: [], resolvedText: '', normalizedText: '' };

  const normalizedText = normalizeTranscript(text);
  const aliasIndex = await getAliasIndex();
  const { resolvedText } = resolveKnownTerms(normalizedText, aliasIndex);
  const { tabela_final, columns, perdidas } = parseTranscript(resolvedText, options);
  return { tabela_final, columns, perdidas: perdidas || [], resolvedText, normalizedText };
}

// Conveniencia: roda direto a partir dos audios da sessao.
export async function runPipelineFromAudios(audios, options = {}) {
  return runPipeline(joinTranscripts(audios), options);
}

// Deriva as opcoes de subamostra a partir da configuracao da avaliacao (usada pela revisao e pela
// geracao automatica do Excel na transmissao).
export function subsampleOptionsFromSession(session) {
  const n = parseInt(session && session.numeroSubamostras, 10);
  const subsamples = session && session.usarSubamostras && n > 0 ? n : 0;
  const src = String((session && (session.pestsAvaliadasTexto || session.itemAvaliado)) || '').trim();
  const firstToken = src.split(/[,;/]/)[0].trim().split(/\s+/)[0];
  const defaultItem = (firstToken || 'NOTA').toUpperCase();
  return { subsamples, defaultItem };
}

// Gabarito da avaliacao (o "resumo.md" como guia): parcelas e pragas esperadas.
// Parcelas: do mapa do ensaio; senao derivadas de tratamentos x repeticoes (r*100 + tratamento).
// Pragas: primeiro token de cada pest configurada, em MAIUSCULA.
export function guideFromSession(session) {
  let expectedParcelas = null;
  const tm = session && session.trialMap;
  if (tm && tm.parcelaToTreatment) {
    const ks = Object.keys(tm.parcelaToTreatment).map(Number).filter(Number.isFinite);
    if (ks.length) expectedParcelas = ks.sort((a, b) => a - b);
  }
  if (!expectedParcelas) {
    const T = parseInt(session && session.numeroTratamentos, 10);
    const R = parseInt(session && session.numeroRepeticoes, 10);
    if (T > 0 && R > 0 && T <= 999 && R <= 20) {
      expectedParcelas = [];
      for (let r = 1; r <= R; r++) for (let t = 1; t <= T; t++) expectedParcelas.push(r * 100 + t);
    }
  }
  let expectedPests = null;
  const src = String((session && session.pestsAvaliadasTexto) || '').trim();
  if (src) {
    const set = src.split(/[,;/]/).map((s) => s.trim().split(/\s+/)[0].toUpperCase()).filter(Boolean);
    if (set.length) expectedPests = [...new Set(set)];
  }
  return { expectedParcelas, expectedPests };
}

// Aplica o gabarito: remove colunas-lixo (sem valor e nao esperadas) e parcelas fora do esperado;
// quando ha universo esperado, gera uma linha por parcela esperada (guia para preencher/corrigir).
export function applyGuide(tabelaFinal, columns, guide) {
  guide = guide || {};
  const dataCols = (columns || []).filter((c) => c !== 'Parcela');
  const subBase = (c) => { const m = /^(.+)_S\d{2,}$/.exec(c); return m ? m[1] : c; };
  const hasVal = (v) => typeof v === 'number' && Number.isFinite(v);
  const expectedPests = guide.expectedPests;

  const colHasValue = new Map();
  for (const c of dataCols) colHasValue.set(c, (tabelaFinal || []).some((r) => hasVal(r[c])));

  const keptCols = dataCols.filter((c) => {
    if (colHasValue.get(c)) return true;         // tem dado -> mantem
    if (!expectedPests) return true;             // sem guia de pragas -> nao arrisca dropar
    return expectedPests.includes(subBase(c));   // com guia: vazia so se for praga esperada
  });
  if (expectedPests) {
    for (const p of expectedPests) if (!keptCols.some((c) => subBase(c) === p)) keptCols.push(p);
  }

  const byParcela = new Map();
  for (const r of (tabelaFinal || [])) byParcela.set(Number(r.Parcela), r);
  const parcelaList = (guide.expectedParcelas && guide.expectedParcelas.length)
    ? guide.expectedParcelas.slice()
    : [...byParcela.keys()].filter(Number.isFinite).sort((a, b) => a - b);

  const cleaned = parcelaList.map((p) => {
    const src = byParcela.get(p) || {};
    const row = { Parcela: p };
    for (const c of keptCols) row[c] = Object.prototype.hasOwnProperty.call(src, c) ? src[c] : '.';
    return row;
  });

  return { tabela_final: cleaned, columns: ['Parcela', ...keptCols] };
}
