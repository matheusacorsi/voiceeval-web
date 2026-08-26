// Carga do dicionario de regras (program_rules_dictionary.json) e resolucao de termos
// (alias -> codigo canonico), porte enxuto de term_resolver.py + rules_dictionary.py.
import { normalizeToken } from './normalize.js';

let _rulesCache = null;
let _indexCache = null;

export async function loadRules(url = './js/postprocess/program_rules_dictionary.json') {
  if (_rulesCache) return _rulesCache;
  const res = await fetch(url, { cache: 'no-store' });
  _rulesCache = await res.json();
  return _rulesCache;
}

// Indice de aliases -> canonico (frases normalizadas, multi-palavra), excluindo o marcador
// PARCELA (tratado pelo parser). Ordena por numero de palavras desc (casa a frase mais longa).
export function buildAliasIndex(rules) {
  const index = new Map();
  const add = (phrase, canonical) => {
    const norm = normalizeToken(phrase).replace(/\s+/g, ' ').trim();
    if (!norm) return;
    if (!index.has(norm)) index.set(norm, canonical);
  };

  for (const [canonical, list] of Object.entries((rules && rules.term_aliases) || {})) {
    if (canonical === 'PARCELA') continue;
    add(canonical, canonical);
    for (const a of list || []) add(a, canonical);
  }
  for (const term of (rules && rules.multilingual_terms) || []) {
    const canonical = term.canonical;
    if (!canonical || canonical === 'PARCELA') continue;
    add(canonical, canonical);
    for (const key of ['nome_pt', 'nome_es', 'nome_en']) if (term[key]) add(term[key], canonical);
    for (const a of term.aliases || []) add(a, canonical);
  }
  const extra = (rules && rules.parser && rules.parser.item_canonical_aliases_extra) || {};
  for (const [canonical, list] of Object.entries(extra)) {
    add(canonical, canonical);
    for (const a of list || []) add(a, canonical);
  }

  return [...index.entries()]
    .map(([phrase, canonical]) => ({ phrase, canonical, tokens: phrase.split(' ') }))
    .sort((a, b) => b.tokens.length - a.tokens.length);
}

// Substitui frases de alias pelo codigo canonico (case/acento-insensitive, por token).
export function resolveKnownTerms(text, aliasIndex) {
  const rawTokens = String(text || '').split(/\s+/).filter(Boolean);
  const normTokens = rawTokens.map((t) => normalizeToken(t.replace(/\.+$/, '')));
  const out = [];
  const substitutions = [];

  let i = 0;
  while (i < rawTokens.length) {
    let matched = null;
    for (const entry of aliasIndex) {
      const n = entry.tokens.length;
      if (i + n > rawTokens.length) continue;
      let ok = true;
      for (let k = 0; k < n; k++) {
        if (normTokens[i + k] !== entry.tokens[k]) { ok = false; break; }
      }
      if (ok) { matched = entry; break; }
    }
    if (matched) {
      // Preserva um eventual ponto final de bloco anexado ao ultimo token do alias.
      const lastRaw = rawTokens[i + matched.tokens.length - 1];
      const trailingDot = /\.\s*$/.test(lastRaw) ? '.' : '';
      out.push(matched.canonical + trailingDot);
      substitutions.push({ from: rawTokens.slice(i, i + matched.tokens.length).join(' '), to: matched.canonical });
      i += matched.tokens.length;
    } else {
      out.push(rawTokens[i]);
      i += 1;
    }
  }
  return { resolvedText: out.join(' '), substitutions };
}

export async function getAliasIndex() {
  if (_indexCache) return _indexCache;
  const rules = await loadRules();
  _indexCache = buildAliasIndex(rules);
  return _indexCache;
}
