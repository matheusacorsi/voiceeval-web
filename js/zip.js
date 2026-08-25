// Escritor de ZIP minimo (sem dependencias), usando apenas o metodo "stored" (sem compressao),
// pois audios/fotos ja vem comprimidos (webm/opus, jpg) — recomprimir nao traria ganho real.
// Referencia do formato: PKZIP APPNOTE (assinaturas 0x04034b50 / 0x02014b50 / 0x06054b50).

function crc32(bytes) {
  if (!crc32.table) {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? (0xedb88320 ^ (c >>> 1)) : c >>> 1;
      table[n] = c >>> 0;
    }
    crc32.table = table;
  }
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = (crc >>> 8) ^ crc32.table[(crc ^ bytes[i]) & 0xff];
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function u16(n) {
  return [n & 0xff, (n >>> 8) & 0xff];
}

function u32(n) {
  return [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff];
}

function dosDateTime(date) {
  const d = date || new Date();
  const dosTime = ((d.getHours() & 0x1f) << 11) | ((d.getMinutes() & 0x3f) << 5) | (Math.floor(d.getSeconds() / 2) & 0x1f);
  const dosDate = (((d.getFullYear() - 1980) & 0x7f) << 9) | (((d.getMonth() + 1) & 0xf) << 5) | (d.getDate() & 0x1f);
  return { dosTime, dosDate };
}

/**
 * @param {{name:string, blob:Blob}[]} files nomes podem incluir "/" para representar pastas
 * @returns {Promise<Blob>} arquivo .zip pronto para download/compartilhamento
 */
export async function createZipBlob(files) {
  const encoder = new TextEncoder();
  const { dosTime, dosDate } = dosDateTime();
  const localChunks = [];
  const centralChunks = [];
  let offset = 0;

  for (const file of files) {
    const nameBytes = encoder.encode(file.name.replace(/\\/g, '/'));
    const data = new Uint8Array(await file.blob.arrayBuffer());
    const crc = crc32(data);

    const localHeader = new Uint8Array([
      ...u32(0x04034b50),
      ...u16(20), ...u16(0), ...u16(0),
      ...u16(dosTime), ...u16(dosDate),
      ...u32(crc), ...u32(data.length), ...u32(data.length),
      ...u16(nameBytes.length), ...u16(0)
    ]);
    localChunks.push(localHeader, nameBytes, data);

    const centralHeader = new Uint8Array([
      ...u32(0x02014b50),
      ...u16(20), ...u16(20), ...u16(0), ...u16(0),
      ...u16(dosTime), ...u16(dosDate),
      ...u32(crc), ...u32(data.length), ...u32(data.length),
      ...u16(nameBytes.length), ...u16(0), ...u16(0),
      ...u16(0), ...u16(0), ...u32(0),
      ...u32(offset)
    ]);
    centralChunks.push(centralHeader, nameBytes);

    offset += localHeader.length + nameBytes.length + data.length;
  }

  const centralOffset = offset;
  const centralSize = centralChunks.reduce((sum, chunk) => sum + chunk.length, 0);

  const endRecord = new Uint8Array([
    ...u32(0x06054b50),
    ...u16(0), ...u16(0),
    ...u16(files.length), ...u16(files.length),
    ...u32(centralSize), ...u32(centralOffset),
    ...u16(0)
  ]);

  return new Blob([...localChunks, ...centralChunks, endRecord], { type: 'application/zip' });
}
