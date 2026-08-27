import { uuid } from './utils.js';

// Controla gravacao de audio via MediaRecorder, com deteccao de interrupcao (ligacao / mic tomado
// por outro app): quando a faixa do microfone termina/muta, o trecho parcial gravado ate ali e
// materializado e entregue via onInterrupt, para nao se perder o audio.
export class AudioRecorderController {
  constructor({ onStatusChange, onInterrupt } = {}) {
    this.onStatusChange = onStatusChange || (() => {});
    this.onInterrupt = onInterrupt || (() => {});
    this.stream = null;
    this.recorder = null;
    this.chunks = [];
    this.tsInicio = null;
    this.state = 'idle'; // idle | recording | paused
    this._track = null;
    this._pendingStop = null; // resolve() de stopAndGetClip aguardando
    this._finalized = false;
    this._interrupted = false;
    this._wakeLock = null;
    this._onVisibility = () => this._maybeReacquireWakeLock();
  }

  async start() {
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mime = this._pickMimeType();
    this.recorder = new MediaRecorder(this.stream, mime ? { mimeType: mime } : undefined);
    this.chunks = [];
    this.tsInicio = new Date().toISOString();
    this._finalized = false;
    this._interrupted = false;
    this._pendingStop = null;

    this.recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) this.chunks.push(e.data);
    };
    this.recorder.onstop = () => this._finalizeClip();
    this.recorder.onerror = () => this._onLost();

    // Interrupcao externa: o SO tomou o microfone (ligacao, outro app).
    this._track = this.stream.getAudioTracks()[0] || null;
    if (this._track) {
      this._track.onended = () => this._onLost();
      this._track.onmute = () => this._onLost();
    }

    this.recorder.start();
    this.state = 'recording';
    // Mantem a tela ligada durante a gravacao: sem isso o SO auto-bloqueia, suspende a pagina e o
    // microfone para (o audio morre com o celular no bolso). Best-effort (feature-detect).
    this._acquireWakeLock();
    document.addEventListener('visibilitychange', this._onVisibility);
    this.onStatusChange(this.state);
  }

  pause() {
    if (this.recorder && this.state === 'recording') {
      this.recorder.pause();
      this.state = 'paused';
      this.onStatusChange(this.state);
    }
  }

  resume() {
    if (this.recorder && this.state === 'paused') {
      this.recorder.resume();
      this.state = 'recording';
      this.onStatusChange(this.state);
    }
  }

  // Conclui o trecho a pedido do app (concluir/tirar foto/finalizar) e resolve com o clip.
  stopAndGetClip() {
    return new Promise((resolve, reject) => {
      if (!this.recorder || this.state === 'idle') return reject(new Error('Recorder nao iniciado'));
      this._pendingStop = resolve;
      this._safeStop();
    });
  }

  // Faixa do microfone perdida (ligacao/mic tomado): materializa o parcial e emite via onInterrupt.
  _onLost() {
    if (this.state === 'idle' || this._finalized) return;
    this._interrupted = true;
    this._safeStop();
  }

  _safeStop() {
    try {
      if (this.recorder && this.recorder.state !== 'inactive') this.recorder.stop();
      else this._finalizeClip();
    } catch {
      this._finalizeClip();
    }
  }

  _finalizeClip() {
    if (this._finalized) return; // evita finalizacao dupla (onstop + _onLost)
    this._finalized = true;
    const mime = (this.recorder && this.recorder.mimeType) || 'audio/webm';
    const blob = new Blob(this.chunks, { type: mime });
    const tsFim = new Date().toISOString();
    const duracaoS = (new Date(tsFim) - new Date(this.tsInicio)) / 1000;
    const clip = { id: uuid(), blob, mime, tsInicio: this.tsInicio, tsFim, duracaoS, bytes: blob.size };

    this._releaseStream();
    this._releaseWakeLock();
    this.state = 'idle';
    this.onStatusChange(this.state);

    const pending = this._pendingStop;
    const interrupted = this._interrupted;
    this._pendingStop = null;
    this._interrupted = false;
    if (pending) pending(clip);                     // conclusao a pedido do app
    else if (interrupted) this.onInterrupt(clip);   // interrupcao externa
  }

  cancel() {
    this._finalized = true; // impede emissao de clip
    if (this.recorder && this.recorder.state !== 'inactive') {
      try { this.recorder.stop(); } catch { /* noop */ }
    }
    this._releaseStream();
    this._releaseWakeLock();
    this._pendingStop = null;
    this._interrupted = false;
    this.state = 'idle';
    this.onStatusChange(this.state);
  }

  _releaseStream() {
    if (this._track) { this._track.onended = null; this._track.onmute = null; this._track = null; }
    if (this.stream) this.stream.getTracks().forEach((track) => track.stop());
    this.stream = null;
  }

  async _acquireWakeLock() {
    try {
      if ('wakeLock' in navigator && document.visibilityState === 'visible') {
        this._wakeLock = await navigator.wakeLock.request('screen');
        this._wakeLock.addEventListener('release', () => { this._wakeLock = null; });
      }
    } catch { this._wakeLock = null; }
  }

  // O wake lock e liberado pelo SO quando a pagina fica oculta; ao voltar visivel, re-adquire se
  // ainda estiver gravando.
  _maybeReacquireWakeLock() {
    if (document.visibilityState === 'visible' && this.state !== 'idle' && !this._wakeLock) {
      this._acquireWakeLock();
    }
  }

  _releaseWakeLock() {
    document.removeEventListener('visibilitychange', this._onVisibility);
    const wl = this._wakeLock;
    this._wakeLock = null;
    if (wl) { try { wl.release(); } catch { /* noop */ } }
  }

  _pickMimeType() {
    const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'];
    return candidates.find((c) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(c));
  }
}
