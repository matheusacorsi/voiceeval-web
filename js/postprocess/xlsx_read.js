// Leitor .xlsx no proprio navegador, sem dependencias. Um .xlsx e um ZIP de partes XML (OPC):
// faz o parse do diretorio central do ZIP e infla cada parte com DecompressionStream('deflate-raw'),
// depois le sharedStrings + worksheets. Best-effort: navegadores sem DecompressionStream lancam erro
// (a importacao do mapa e opcional, entao o chamador trata a falha).

async function inflateRaw(bytes) {
  if (!bytes || bytes.length === 0) return new Uint8Array(0);
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

// Desempacota o ZIP -> { 'nome/da/parte.xml': textoUtf8 }.
async function unzip(arrayBuffer) {
  const buf = new Uint8Array(arrayBuffer);
  const dv = new DataView(arrayBuffer);
  const u16 = (o) => dv.getUint16(o, true);
  const u32 = (o) => dv.getUint32(o, true);

  let eocd = -1;
  for (let i = buf.length - 22; i >= 0; i--) { if (u32(i) === 0x06054b50) { eocd = i; break; } }
  if (eocd < 0) throw new Error('xlsx: EOCD nao encontrado');

  const count = u16(eocd + 10);
  let p = u32(eocd + 16);
  const decoder = new TextDecoder();
  const files = {};
  for (let n = 0; n < count && p + 46 <= buf.length; n++) {
    if (u32(p) !== 0x02014b50) break;
    const method = u16(p + 10);
    const compSize = u32(p + 20);
    const nameLen = u16(p + 28);
    const extraLen = u16(p + 30);
    const commentLen = u16(p + 32);
    const lho = u32(p + 42);
    const name = decoder.decode(buf.subarray(p + 46, p + 46 + nameLen));
    const dataStart = lho + 30 + u16(lho + 26) + u16(lho + 28);
    const comp = buf.subarray(dataStart, dataStart + compSize);
    const content = method === 0 ? comp : await inflateRaw(comp);
    files[name] = decoder.decode(content);
    p += 46 + nameLen + extraLen + commentLen;
  }
  return files;
}

// Decodifica escapes OOXML (_xXXXX_) e entidades XML. &amp; por ultimo para nao duplicar.
function decodeXml(s) {
  return String(s == null ? '' : s)
    .replace(/_x([0-9A-Fa-f]{4})_/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#x([0-9A-Fa-f]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function parseSharedStrings(xml) {
  const out = [];
  for (const si of String(xml || '').matchAll(/<si>([\s\S]*?)<\/si>/g)) {
    let text = '';
    for (const tm of si[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)) text += tm[1];
    out.push(decodeXml(text));
  }
  return out;
}

function colToIdx(letters) {
  let n = 0;
  for (let i = 0; i < letters.length; i++) n = n * 26 + (letters.charCodeAt(i) - 64);
  return n;
}

// Converte a XML de uma planilha numa matriz (linhas 0-based; colunas alinhadas por letra).
function parseSheet(xml, shared) {
  const rowsMap = new Map();
  const re = /<c\s+([^>]*?)\/>|<c\s+([^>]*?)>([\s\S]*?)<\/c>/g;
  let m;
  while ((m = re.exec(xml)) !== null) {
    const attrs = m[1] || m[2];
    const inner = m[1] ? '' : m[3];
    const rMatch = /r="([A-Z]+)(\d+)"/.exec(attrs);
    if (!rMatch) continue;
    const col = colToIdx(rMatch[1]);
    const row = parseInt(rMatch[2], 10);
    const tMatch = /t="([^"]+)"/.exec(attrs);
    const type = tMatch ? tMatch[1] : 'n';

    let val = null;
    if (inner) {
      if (type === 'inlineStr') {
        let text = '';
        for (const tm of inner.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)) text += tm[1];
        val = decodeXml(text);
      } else {
        const vMatch = /<v>([\s\S]*?)<\/v>/.exec(inner);
        if (vMatch) {
          if (type === 's') val = shared[parseInt(vMatch[1], 10)] ?? '';
          else if (type === 'str' || type === 'e') val = decodeXml(vMatch[1]);
          else { const num = Number(vMatch[1]); val = Number.isNaN(num) ? decodeXml(vMatch[1]) : num; }
        }
      }
    }
    if (!rowsMap.has(row)) rowsMap.set(row, new Map());
    rowsMap.get(row).set(col, val);
  }

  const maxRow = rowsMap.size ? Math.max(...rowsMap.keys()) : 0;
  const grid = [];
  for (let r = 1; r <= maxRow; r++) {
    const rowMap = rowsMap.get(r) || new Map();
    const maxCol = rowMap.size ? Math.max(...rowMap.keys()) : 0;
    const arr = [];
    for (let c = 1; c <= maxCol; c++) arr.push(rowMap.has(c) ? rowMap.get(c) : null);
    grid.push(arr);
  }
  return grid;
}

// Mapeia nome da aba -> arquivo da planilha (workbook.xml + rels). Fallback: sheetN por ordem.
function sheetFileMap(files) {
  const wb = files['xl/workbook.xml'] || '';
  const rels = files['xl/_rels/workbook.xml.rels'] || '';
  const relMap = {};
  for (const rm of rels.matchAll(/<Relationship\b([^>]*?)\/?>/g)) {
    const id = (/Id="([^"]+)"/.exec(rm[1]) || [])[1];
    const target = (/Target="([^"]+)"/.exec(rm[1]) || [])[1];
    if (id && target) relMap[id] = target.replace(/^\//, '').replace(/^\.\//, '');
  }
  const ordered = [];
  for (const sm of wb.matchAll(/<sheet\b([^>]*?)\/?>/g)) {
    const name = decodeXml((/name="([^"]+)"/.exec(sm[1]) || [])[1] || '');
    const rid = (/r:id="([^"]+)"/.exec(sm[1]) || [])[1];
    let target = rid && relMap[rid];
    if (target && !target.startsWith('xl/')) target = 'xl/' + target;
    if (name && target && files[target] != null) ordered.push({ name, file: target });
  }
  if (ordered.length) return ordered;
  return Object.keys(files)
    .filter((f) => /^xl\/worksheets\/sheet\d+\.xml$/.test(f))
    .sort()
    .map((file, i) => ({ name: `Sheet${i + 1}`, file }));
}

// Ponto de entrada: ArrayBuffer -> { sheetNames, sheets: { nome: matriz } }.
export async function readXlsx(arrayBuffer) {
  const files = await unzip(arrayBuffer);
  const shared = parseSharedStrings(files['xl/sharedStrings.xml']);
  const map = sheetFileMap(files);
  const sheets = {};
  const sheetNames = [];
  for (const { name, file } of map) {
    sheets[name] = parseSheet(files[file] || '', shared);
    sheetNames.push(name);
  }
  return { sheetNames, sheets };
}
