import { getSetting, setSetting } from './db.js';
import { downloadBlob, sleep } from './utils.js';

// Estrategia de exportacao sem depender de Azure AD / Microsoft Graph (bloqueados pela TI corporativa):
// 1) Web Share API com arquivos -> abre o seletor nativo do SO (OneDrive, Teams, E-mail, WhatsApp, etc.)
// 2) File System Access API -> grava direto numa pasta local escolhida uma vez (ideal: pasta sincronizada do OneDrive no computador)
// 3) Download simples -> o usuario move manualmente os arquivos para o OneDrive/SharePoint depois.

export function getCapabilities() {
  return {
    webShareFiles: typeof navigator.canShare === 'function',
    fileSystemAccess: typeof window.showDirectoryPicker === 'function'
  };
}

export async function pickSyncFolder() {
  if (typeof window.showDirectoryPicker !== 'function') throw new Error('File System Access API indisponivel neste navegador');
  const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
  await setSetting('syncFolderHandle', handle);
  return handle;
}

export async function getSyncFolderHandle() {
  const handle = await getSetting('syncFolderHandle');
  if (!handle) return null;
  try {
    const perm = await handle.queryPermission({ mode: 'readwrite' });
    if (perm === 'granted') return handle;
    const req = await handle.requestPermission({ mode: 'readwrite' });
    return req === 'granted' ? handle : null;
  } catch {
    return null;
  }
}

async function tryWebShare(files) {
  if (typeof navigator.canShare !== 'function' || typeof navigator.share !== 'function') return false;
  const shareFiles = files.map((f) => new File([f.blob], f.name, { type: f.blob.type || 'application/octet-stream' }));
  if (!navigator.canShare({ files: shareFiles })) return false;
  await navigator.share({ files: shareFiles, title: 'VoiceEval', text: 'Avaliacao de campo VoiceEval' });
  return true;
}

async function tryFolderWrite(files) {
  const dir = await getSyncFolderHandle();
  if (!dir) return false;
  for (const f of files) {
    const fileHandle = await dir.getFileHandle(f.name, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(f.blob);
    await writable.close();
  }
  return true;
}

async function fallbackDownload(files) {
  for (const f of files) {
    downloadBlob(f.blob, f.name);
    await sleep(400); // evita que o navegador bloqueie downloads multiplos simultaneos
  }
  return true;
}

/**
 * @param {{name:string, blob:Blob}[]} files
 * @returns {Promise<{method:'share'|'folder'|'download'}>}
 */
export async function exportFiles(files) {
  try {
    if (await tryWebShare(files)) return { method: 'share' };
  } catch (err) {
    if (err && err.name === 'AbortError') throw err; // usuario cancelou o compartilhamento
    // outros erros: cai para as proximas estrategias
  }

  if (await tryFolderWrite(files)) return { method: 'folder' };

  await fallbackDownload(files);
  return { method: 'download' };
}
