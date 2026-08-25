const DB_NAME = 'voiceEvalDB';
const DB_VERSION = 1;

let dbPromise = null;

function openDatabase() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('trialHistory')) {
        db.createObjectStore('trialHistory', { keyPath: 'nomeEnsaio' });
      }
      if (!db.objectStoreNames.contains('pendingEvaluations')) {
        db.createObjectStore('pendingEvaluations', { keyPath: 'sessionId' });
      }
      if (!db.objectStoreNames.contains('mediaFiles')) {
        const store = db.createObjectStore('mediaFiles', { keyPath: 'id' });
        store.createIndex('sessionId', 'sessionId', { unique: false });
      }
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(storeName, mode) {
  return openDatabase().then((db) => db.transaction(storeName, mode).objectStore(storeName));
}

function wrap(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// --- Trial history (autofill de configuracoes de ensaios ja usados) ---
export async function saveTrialHistory(entry) {
  const store = await tx('trialHistory', 'readwrite');
  return wrap(store.put({ ...entry, atualizadoEm: new Date().toISOString() }));
}

export async function getTrialHistory(nomeEnsaio) {
  const store = await tx('trialHistory', 'readonly');
  return wrap(store.get(nomeEnsaio));
}

export async function getAllTrialHistory() {
  const store = await tx('trialHistory', 'readonly');
  const all = await wrap(store.getAll());
  return all.sort((a, b) => (b.atualizadoEm || '').localeCompare(a.atualizadoEm || ''));
}

export async function clearTrialHistory() {
  const store = await tx('trialHistory', 'readwrite');
  return wrap(store.clear());
}

// --- Pending evaluations (fila offline equivalente a colPendencias) ---
export async function savePendingEvaluation(evaluation) {
  const store = await tx('pendingEvaluations', 'readwrite');
  return wrap(store.put({ ...evaluation, atualizadoEm: new Date().toISOString() }));
}

export async function getPendingEvaluation(sessionId) {
  const store = await tx('pendingEvaluations', 'readonly');
  return wrap(store.get(sessionId));
}

export async function getAllPendingEvaluations() {
  const store = await tx('pendingEvaluations', 'readonly');
  const all = await wrap(store.getAll());
  return all.sort((a, b) => (a.criadoEm || '').localeCompare(b.criadoEm || ''));
}

export async function deletePendingEvaluation(sessionId) {
  const store = await tx('pendingEvaluations', 'readwrite');
  return wrap(store.delete(sessionId));
}

// --- Media files (audios e fotos, um registro por arquivo) ---
export async function saveMediaFile(file) {
  const store = await tx('mediaFiles', 'readwrite');
  return wrap(store.put(file));
}

export async function getMediaFilesBySession(sessionId) {
  const store = await tx('mediaFiles', 'readonly');
  const index = store.index('sessionId');
  const all = await wrap(index.getAll(sessionId));
  return all.sort((a, b) => (a.indice || 0) - (b.indice || 0));
}

export async function deleteMediaFile(id) {
  const store = await tx('mediaFiles', 'readwrite');
  return wrap(store.delete(id));
}

export async function deleteMediaFilesBySession(sessionId) {
  const files = await getMediaFilesBySession(sessionId);
  const store = await tx('mediaFiles', 'readwrite');
  await Promise.all(files.map((f) => wrap(store.delete(f.id))));
}

// --- Settings (idioma manual, pasta de sincronizacao escolhida via File System Access) ---
export async function getSetting(key) {
  const store = await tx('settings', 'readonly');
  const row = await wrap(store.get(key));
  return row ? row.value : undefined;
}

export async function setSetting(key, value) {
  const store = await tx('settings', 'readwrite');
  return wrap(store.put({ key, value }));
}
