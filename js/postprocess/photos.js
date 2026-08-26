// Renomeio de fotos por parcela. Cada foto ja guarda o vinculo com o trecho de audio imediatamente
// anterior (state.addFoto -> audioAnteriorId); a parcela sai da transcricao desse trecho
// (ex.: "...foto parcela 101"). Fotos sem parcela reconhecida mantem o nome sequencial global.
import { extractParcelaFromText } from './parser.js';

function extForPhoto(mime) {
  return (mime || '').includes('png') ? 'png' : 'jpg';
}

/**
 * @returns {{id:string, parcela:number|null, name:string, originalIndice:number}[]}
 * Nomes: "parcela_<P>_<NN>.<ext>" (NN = sequencia por parcela) ou "foto_<NN>.<ext>" (sem parcela).
 */
export function buildPhotoNames(audios, fotos) {
  const audioById = new Map((audios || []).map((a) => [a.id, a]));
  const perParcelaSeq = new Map();
  const result = [];

  for (const f of (fotos || [])) {
    const prev = f.audioAnteriorId ? audioById.get(f.audioAnteriorId) : null;
    const parcela = prev ? extractParcelaFromText(prev.transcript || '') : null;
    const ext = extForPhoto(f.mime);

    let name;
    if (parcela != null) {
      const seq = (perParcelaSeq.get(parcela) || 0) + 1;
      perParcelaSeq.set(parcela, seq);
      name = `parcela_${parcela}_${String(seq).padStart(2, '0')}.${ext}`;
    } else {
      name = `foto_${String(f.indice || result.length + 1).padStart(2, '0')}.${ext}`;
    }
    result.push({ id: f.id, parcela, name, originalIndice: f.indice });
  }
  return result;
}

// Mapa foto.id -> nome final (parcela-based), para reuso na exportacao/resumo.
export function buildPhotoNameMap(audios, fotos) {
  return new Map(buildPhotoNames(audios, fotos).map((p) => [p.id, p.name]));
}
