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

function isNumberNorm(norm) {
  return /^-?\d+(?:[.,]\d+)?$/.test(norm);
}

function numValue(norm) {
  return parseFloat(norm.replace(',', '.'));
}

const EMPTY_PLACEHOLDER = '.';

export function parseTranscript(text) {
  const rawTokens = String(text == null ? '' : text).split(/\s+/).filter(Boolean);
  const tokens = rawTokens.map((raw) => ({ raw, norm: normalizeToken(raw.replace(/\.+$/, '')) }));

  const rows = new Map(); // parcela(int) -> { ITEM: valor }
  const columns = []; // itens na ordem de primeira aparicao
  const ensureCol = (item) => { if (!columns.includes(item)) columns.push(item); };
  const ensureRow = (p) => { if (!rows.has(p)) rows.set(p, {}); return rows.get(p); };

  let currentParcela = null;
  let currentItem = null;

  let i = 0;
  while (i < tokens.length) {
    const t = tokens[i];

    // Marcador de parcela -> abre novo bloco.
    if (PARCEL_KEYWORDS.has(t.norm)) {
      let j = i + 1;
      while (j < tokens.length && (BRIDGE_WORDS.has(tokens[j].norm) || PARCEL_KEYWORDS.has(tokens[j].norm))) j++;
      if (j < tokens.length && /^\d+$/.test(tokens[j].norm)) {
        currentParcela = parseInt(tokens[j].norm, 10);
        ensureRow(currentParcela);
        currentItem = null;
        i = j + 1;
        continue;
      }
      i++;
      continue;
    }

    if (currentParcela == null) { i++; continue; }

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
      if (currentItem != null) {
        ensureRow(currentParcela)[currentItem] = value;
      }
      i++;
      continue;
    }

    // Filler / negacao de ausencia -> ignora.
    if (FILLER_WORDS.has(t.norm)) { i++; continue; }

    // Caso contrario: cabeca de item (codigo canonico). Cria a coluna; valor virá a seguir
    // (ou fica vazio '.' no caso de ausencia declarada).
    currentItem = t.raw.replace(/\.+$/, '');
    ensureCol(currentItem);
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
