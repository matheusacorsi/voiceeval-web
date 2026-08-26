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

// Marcador de parcela tolerante a variacoes do ASR (parcela/parcelsa/parcellas/parceras/parcels...).
function isParcelaMarker(norm) {
  return PARCEL_KEYWORDS.has(norm) || norm.startsWith('parc');
}

// Pontes entre o marcador e o numero da parcela (ex.: "parcela de 105", "parcela numero 105").
const BRIDGE_WORDS = new Set(['num', 'numero', 'no', 'de', 'nro', 'n']);

// Palavras ignoradas no fluxo (porte do FILLER_WORDS + ITEM_CONNECTOR_WORDS + WITNESS_WORDS do
// parser_avaliacao.py). Inclui negacoes de ausencia ("nao tem X"/"no hay") para que o item apareca
// como coluna vazia ('.'), sem valor; conectores entre itens ("depois/tambem/ai") e rotulos de
// testemunha/parcela-controle, para que nenhum deles vire uma coluna de item por engano.
const FILLER_WORDS = new Set([
  'nota', 'valor', 'avaliacao', 'evaluation', 'evaluacion', 'evaluacao', 'evaluaci',
  'por', 'ciento', 'cento', 'porcentaje', 'percentual', 'percentagem', 'percentage',
  'da', 'do', 'del', 'de', 'la', 'el', 'em', 'en', 'com', 'con', 'with', 'e', 'y', 'and',
  'foto', 'photo', 'picture', 'imagen',
  'planta', 'plantas', 'plant', 'plants', 'iniciar', 'inicial', 'start',
  'encerrar', 'finalizar', 'end', 'proxima', 'siguiente', 'next',
  'bloco', 'bloque', 'block', 'tratamento', 'tratamiento', 'treatment',
  'repeticao', 'repeticion', 'replication', 'subsample', 'subsamples',
  'escore', 'score', 'rating', 'puntuacion', 'calificacion', 'pontuacao',
  'tudo', 'todo', 'todos', 'todas', 'all',
  'nao', 'no', 'tem', 'hay', 'sem', 'sin', 'ausente', 'presente', 'not', 'para', 'for',
  // Introducao/setup do ensaio (evita virar item se a fala incluir o cabecalho do ensaio).
  'fecha', 'data', 'ensayo', 'ensaio', 'experiment', 'experimento', 'trial', 'grp', 'fin', 'fim', 'n',
  // Delineamento declarado (tempo futuro): "tratamento X recebe/sera ...".
  'recebe', 'recebera', 'recebeu', 'receber', 'atribuir', 'atribuido', 'sera',
  'recibe', 'recibira', 'recibio', 'will', 'receive', 'receives', 'era', 'onde', 'falei',
  // Conectores entre itens ("buva 10 depois amargoso 20", "tambem", "ai").
  'ai', 'depois', 'tambem', 'mais', 'entao', 'na', 'sequencia', 'seguido', 'seguida',
  'despues', 'tambien', 'mas', 'entonces', 'luego', 'secuencia', 'then',
  // Rotulos de testemunha/parcela-controle (nao sao itens medidos).
  'testemunha', 'absoluta', 'absoluto', 'capina', 'capinada', 'testigo', 'deshierbe', 'limpio'
]);

const ALL_TARGET_WORDS = new Set(['tudo', 'todo', 'todos', 'todas', 'all']);

// Comando "parcela perdida": marca a parcela inteira como perdida (nao e dado faltando; sai '.').
const PERDIDA_WORDS = new Set(['perdida', 'perdido', 'perdidas', 'perdidos', 'perda', 'lost']);

// Marcadores de subamostra (usados apenas em modo subamostra): "planta 1", "subamostra 3"...
const SUBSAMPLE_MARKERS = new Set([
  'planta', 'plantas', 'plant', 'plants',
  'subamostra', 'subamostras', 'submuestra', 'submuestras', 'subsample', 'subsamples'
]);

// Verbos de correcao por voz (PT/ES/EN). Uma correcao sobrescreve um valor ja dito.
const CORRECTION_VERBS = new Set([
  'corrigir', 'corrige', 'corrija', 'corrigido', 'correcao', 'correccion',
  'substituir', 'trocar', 'mudar', 'alterar', 'ajustar', 'atualizar', 'refazer', 'revisar',
  'corregir', 'sustituir', 'cambiar', 'modificar', 'actualizar', 'rehacer',
  'correct', 'fix', 'change', 'replace', 'update', 'redo', 'review',
  // Apagar e recolocar (borrar/erase) — reconhecidos como cue de correcao.
  'apagar', 'remover', 'cancelar', 'desconsiderar', 'excluir',
  'borrar', 'eliminar', 'delete', 'remove', 'cancel', 'disregard', 'exclude'
]);

// Palavras de ligacao/resultado ignoradas dentro da clausula de correcao
// ("<item> fica/deve ser/passa a ser/is/becomes/should be <valor>").
const CORRECTION_SKIP = new Set([
  'fica', 'deve', 'ser', 'passa', 'queda', 'pasa', 'debe', 'is', 'becomes', 'should', 'be',
  'considerar', 'como', 'colocar', 'poner', 'put', 'a', 'to', 'pra', 'em', 'al'
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
    if (!isParcelaMarker(tokens[i])) continue;
    let j = i + 1;
    while (j < tokens.length && (BRIDGE_WORDS.has(tokens[j]) || isParcelaMarker(tokens[j]))) j++;
    if (j < tokens.length && /^\d+$/.test(tokens[j])) { last = parseInt(tokens[j], 10); i = j; }
  }
  return last;
}

// Interpreta uma clausula de correcao a partir do verbo (tokens[i]):
// "<verbo> [parcela P] <ITEM|tudo> [para/a/to/fica...] <valor>". Para no 1o par (alvo, valor).
function parseCorrectionClause(tokens, i, currentParcela) {
  let j = i + 1;
  const maxJ = Math.min(tokens.length, i + 12);
  let targetParcela = currentParcela;
  let targetItem = null; // codigo do item ou '__ALL__'
  let value = null;

  while (j < maxJ) {
    const nt = tokens[j].norm;
    if (nt === '') { j++; continue; }
    if (CORRECTION_VERBS.has(nt)) break; // novo comando de correcao (nao consome)

    if (isParcelaMarker(nt)) {
      let k = j + 1;
      while (k < tokens.length && (BRIDGE_WORDS.has(tokens[k].norm) || isParcelaMarker(tokens[k].norm))) k++;
      if (targetItem == null && value == null && k < tokens.length && /^\d+$/.test(tokens[k].norm)) {
        targetParcela = parseInt(tokens[k].norm, 10);
        j = k + 1;
        continue;
      }
      break; // proxima parcela inicia novo bloco (nao consome)
    }

    if (ALL_TARGET_WORDS.has(nt)) { targetItem = '__ALL__'; j++; if (value != null) break; continue; }

    let v = null;
    if (isNumberNorm(nt)) v = numValue(nt);
    else { const sp = spokenToNumber(nt); if (sp != null) v = sp; }
    if (v != null) { value = v; j++; if (targetItem != null) break; continue; }

    if (FILLER_WORDS.has(nt) || BRIDGE_WORDS.has(nt) || CORRECTION_SKIP.has(nt)) { j++; continue; }

    if (targetItem == null) targetItem = tokens[j].raw.replace(/\.+$/, '').toUpperCase();
    j++;
    if (targetItem != null && value != null) break;
  }
  return { targetParcela, targetItem, value, endIndex: j };
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
  const perdidas = new Set(); // parcelas marcadas como perdidas por voz
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
    if (isParcelaMarker(t.norm)) {
      let j = i + 1;
      while (j < tokens.length && (BRIDGE_WORDS.has(tokens[j].norm) || isParcelaMarker(tokens[j].norm))) j++;
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

    // Correcao por voz: "corrigir <ITEM|tudo> para <valor>" — sobrescreve valor(es) ja ditos.
    if (CORRECTION_VERBS.has(t.norm)) {
      const c = parseCorrectionClause(tokens, i, currentParcela);
      if (c.value != null && c.targetParcela != null && c.targetItem != null && rows.has(c.targetParcela)) {
        const row = rows.get(c.targetParcela);
        if (c.targetItem === '__ALL__') {
          for (const col of columns) row[col] = c.value;
        } else if (columns.includes(c.targetItem)) {
          row[c.targetItem] = c.value;
        }
        i = c.endIndex;
        continue;
      }
      i++;
      continue;
    }

    if (currentParcela == null) { i++; continue; }

    // "parcela 305 perdida" / "... perdida" -> marca a parcela atual inteira (sobrepoe valores ditos).
    if (PERDIDA_WORDS.has(t.norm)) {
      perdidas.add(currentParcela);
      const row = ensureRow(currentParcela);
      for (const k of Object.keys(row)) delete row[k];
      currentItem = null;
      i++;
      continue;
    }

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
      } else if (defaultItem) {
        // Praga unica nao dita ("Parcela 105 78" -> 78 vai para o item configurado, ex.: AMARGOSO).
        ensureCol(defaultItem);
        ensureRow(currentParcela)[defaultItem] = value;
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

  return { tabela_final, columns: ['Parcela', ...columns], perdidas: [...perdidas].sort((a, b) => a - b) };
}

