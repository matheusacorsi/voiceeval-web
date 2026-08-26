// Parser por parcela (porte enxuto de parser_avaliacao.py: parse_transcript).
// Entrada: texto ja normalizado e com termos resolvidos (itens como codigos canonicos).
// Saida: { tabela_final: [{Parcela, <ITEM>: valor|'.'}], columns }.
import { normalizeToken } from './normalize.js';
import { spokenToNumber } from './spoken_numbers.js';

const PARCEL_KEYWORDS = new Set([
  'parcela', 'parcelas', 'parc', 'parcola', 'parcala', 'parsela', 'parcella',
  'parcelle', 'parcele', 'parcera', 'parrocela', 'parcelo', 'parcel', 'parcelar',
  'lote', 'plot', 'clot'
]);

// Pontes entre o marcador e o numero da parcela (ex.: "parcela de 105", "parcela numero 105").
const BRIDGE_WORDS = new Set(['num', 'numero', 'no', 'de', 'nro', 'n']);

// Palavras ignoradas no fluxo (porte do FILLER_WORDS). Inclui negacoes de ausencia
// ("nao tem X"/"no hay") para que o item apareca como coluna vazia ('.'), sem valor.
const FILLER_WORDS = new Set([
  'nota', 'valor', 'avaliacao', 'evaluation', 'evaluacion', 'evaluacao',
  'por', 'ciento', 'cento', 'da', 'do', 'del', 'la', 'el', 'em', 'en',
  'com', 'con', 'with', 'e', 'y', 'and', 'foto', 'photo', 'picture', 'imagen',
  'planta', 'plantas', 'plant', 'plants', 'iniciar', 'inicial', 'start',
  'encerrar', 'finalizar', 'end', 'proxima', 'siguiente', 'next',
  'bloco', 'bloque', 'block', 'tratamento', 'tratamiento', 'treatment',
  'repeticao', 'repeticion', 'replication', 'subsample', 'subsamples',
  'escore', 'score', 'rating', 'puntuacion', 'calificacion',
  'tudo', 'todo', 'todos', 'todas', 'all',
  'nao', 'no', 'tem', 'hay', 'sem', 'sin', 'ausente', 'presente', 'not', 'para', 'for'
]);

const ALL_TARGET_WORDS = new Set(['tudo', 'todo', 'todos', 'todas', 'all']);

// Marcadores de subamostra (usados apenas em modo subamostra): "planta 1", "subamostra 3"...
const SUBSAMPLE_MARKERS = new Set([
  'planta', 'plantas', 'plant', 'plants',
  'subamostra', 'subamostras', 'submuestra', 'submuestras', 'subsample', 'subsamples'
]);

function isNumberNorm(norm) {
  return /^-?\d+(?:[.,]\d+)?$/.test(norm);
}

function numValue(norm) {
  return parseFloat(norm.replace(',', '.'));
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

const EMPTY_PLACEHOLDER = '.';

// Extrai o numero da parcela mencionado por ULTIMO no texto (usado para rotular a foto seguinte).
export function extractParcelaFromText(text) {
  const tokens = String(text == null ? '' : text).split(/\s+/).filter(Boolean)
    .map((raw) => normalizeToken(raw.replace(/\.+$/, '')));
  let last = null;
  for (let i = 0; i < tokens.length; i++) {
    if (!PARCEL_KEYWORDS.has(tokens[i])) continue;
    let j = i + 1;
    while (j < tokens.length && (BRIDGE_WORDS.has(tokens[j]) || PARCEL_KEYWORDS.has(tokens[j]))) j++;
    if (j < tokens.length && /^\d+$/.test(tokens[j])) { last = parseInt(tokens[j], 10); i = j; }
  }
  return last;
}

/**
 * @param {string} text texto normalizado + com termos resolvidos
 * @param {{subsamples?:number, defaultItem?:string}} [options] subsamples>0 ativa o modo subamostra
 */
export function parseTranscript(text, options = {}) {
  const N = Number(options.subsamples) > 0 ? Number(options.subsamples) : 0;
  const subsampleMode = N > 0;
  const defaultItem = String(options.defaultItem || 'NOTA').trim().toUpperCase() || 'NOTA';

  const rawTokens = String(text == null ? '' : text).split(/\s+/).filter(Boolean);
  const tokens = rawTokens.map((raw) => ({ raw, norm: normalizeToken(raw.replace(/\.+$/, '')) }));

  const rows = new Map(); // parcela(int) -> { <coluna>: valor }
  const columns = []; // colunas na ordem de primeira aparicao
  const ensureCol = (item) => { if (!columns.includes(item)) columns.push(item); };
  const ensureRow = (p) => { if (!rows.has(p)) rows.set(p, {}); return rows.get(p); };

  let currentParcela = null;
  let currentItem = null;
  let slotCounter = 0; // ultimo slot de subamostra preenchido para o item atual
  let pendingSlot = null; // slot explicito ("planta 3") a usar no proximo valor

  let i = 0;
  while (i < tokens.length) {
    const t = tokens[i];

    // Pontuacao solta / token vazio (ex.: "." separando trechos) — nunca vira item nem valor.
    if (t.norm === '') { i++; continue; }

    // Marcador de parcela -> abre novo bloco.
    if (PARCEL_KEYWORDS.has(t.norm)) {
      let j = i + 1;
      while (j < tokens.length && (BRIDGE_WORDS.has(tokens[j].norm) || PARCEL_KEYWORDS.has(tokens[j].norm))) j++;
      if (j < tokens.length && /^\d+$/.test(tokens[j].norm)) {
        currentParcela = parseInt(tokens[j].norm, 10);
        ensureRow(currentParcela);
        currentItem = null;
        slotCounter = 0;
        pendingSlot = null;
        i = j + 1;
        continue;
      }
      i++;
      continue;
    }

    if (currentParcela == null) { i++; continue; }

    // Modo subamostra: "planta 3" / "subamostra 2" define o slot explicito do proximo valor.
    if (subsampleMode && SUBSAMPLE_MARKERS.has(t.norm)) {
      const nx = tokens[i + 1];
      if (nx && /^\d+$/.test(nx.norm)) { pendingSlot = parseInt(nx.norm, 10); i += 2; continue; }
      i++;
      continue;
    }

    // Valor (digito ou por extenso).
    let value = null;
    if (isNumberNorm(t.norm)) value = numValue(t.norm);
    else {
      const sp = spokenToNumber(t.norm);
      if (sp != null) value = sp;
    }

    if (value != null) {
      // "<valor> para tudo" -> aplica a todas as colunas conhecidas.
      const n1 = tokens[i + 1] && tokens[i + 1].norm;
      const n2 = tokens[i + 2] && tokens[i + 2].norm;
      if (n1 === 'para' && ALL_TARGET_WORDS.has(n2)) {
        const row = ensureRow(currentParcela);
        for (const col of columns) row[col] = value;
        i += 3;
        continue;
      }

      if (subsampleMode) {
        const item = currentItem || defaultItem;
        const slot = pendingSlot != null ? pendingSlot : slotCounter + 1;
        pendingSlot = null;
        if (slot >= 1 && slot <= N) {
          slotCounter = slot;
          const col = `${item}_S${pad2(slot)}`;
          ensureCol(col);
          ensureRow(currentParcela)[col] = value;
        }
        i++;
        continue;
      }

      if (currentItem != null) {
        ensureRow(currentParcela)[currentItem] = value;
      }
      i++;
      continue;
    }

    // Filler / negacao de ausencia -> ignora.
    if (FILLER_WORDS.has(t.norm)) { i++; continue; }

    // Caso contrario: cabeca de item (codigo canonico). Uppercase para nome de coluna consistente
    // (termos ja resolvidos vem canonicos; itens nao reconhecidos ficam em maiuscula tambem).
    const item = t.raw.replace(/\.+$/, '').toUpperCase();
    currentItem = item;
    if (subsampleMode) {
      slotCounter = 0;
      pendingSlot = null;
    } else {
      ensureCol(item); // cria a coluna; valor virá a seguir (ou fica '.' se ausencia declarada).
    }
    i++;
  }

  const tabela_final = [...rows.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([parcela, vals]) => {
      const row = { Parcela: parcela };
      for (const col of columns) row[col] = Object.prototype.hasOwnProperty.call(vals, col) ? vals[col] : EMPTY_PLACEHOLDER;
      return row;
    });

  return { tabela_final, columns: ['Parcela', ...columns] };
}

