import { uuid } from './utils.js';

// Controla gravacao de audio via MediaRecorder (equivalente ao controle Microphone do Power Apps).
export class AudioRecorderController {
  constructor({ onStatusChange } = {}) {
    this.onStatusChange = onStatusChange || (() => {});
    this.stream = null;
    this.recorder = null;
    this.chunks = [];
    this.tsInicio = null;
    this.state = 'idle'; // idle | recording | paused
  }

  async start() {
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mime = this._pickMimeType();
    this.recorder = new MediaRecorder(this.stream, mime ? { mimeType: mime } : undefined);
    this.chunks = [];
    this.tsInicio = new Date().toISOString();

    this.recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) this.chunks.push(e.data);
    };

    this.recorder.start();
    this.state = 'recording';
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

  stopAndGetClip() {
    return new Promise((resolve, reject) => {
      if (!this.recorder) return reject(new Error('Recorder nao iniciado'));
      this.recorder.onstop = () => {
        const mime = this.recorder.mimeType || 'audio/webm';
        const blob = new Blob(this.chunks, { type: mime });
        const tsFim = new Date().toISOString();
        const duracaoS = (new Date(tsFim) - new Date(this.tsInicio)) / 1000;
        this._releaseStream();
        this.state = 'idle';
        this.onStatusChange(this.state);
        resolve({ id: uuid(), blob, mime, tsInicio: this.tsInicio, tsFim, duracaoS, bytes: blob.size });
      };
      this.recorder.stop();
    });
  }

  cancel() {
    if (this.recorder && this.recorder.state !== 'inactive') {
      try { this.recorder.stop(); } catch { /* noop */ }
    }
    this._releaseStream();
    this.state = 'idle';
    this.onStatusChange(this.state);
  }

  _releaseStream() {
    if (this.stream) this.stream.getTracks().forEach((track) => track.stop());
    this.stream = null;
  }

  _pickMimeType() {
    const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'];
    return candidates.find((c) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(c));
  }
}
