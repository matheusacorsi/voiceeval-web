// Motor de transcricao de fala com dois modos alternaveis:
// - Nuvem: Web Speech API nativa (SpeechRecognition). Ao vivo, em paralelo a gravacao.
//   Funciona em Android Chrome e iOS Safari 14.5+; envia audio para servidor (Google/Apple).
// - Local: Whisper via transformers.js (WebAssembly), pos-processando o blob ja gravado.
//   100% no dispositivo, mas depende de baixar a lib/modelo de um CDN (best-effort — pode ser
//   bloqueado pela TI corporativa).
// Regra de ouro: NUNCA lancar excecao que trave a avaliacao. Sempre resolver com {transcript, status}.

const SpeechRecognitionImpl = window.SpeechRecognition || window.webkitSpeechRecognition;

// Idiomas de fala selecionaveis (alinhados aos idiomas de UI do app).
export const SPEECH_LANGS = ['pt-BR', 'en-US', 'es-ES'];

export function mapUiLangToSpeech(uiLang) {
  switch ((uiLang || '').slice(0, 2)) {
    case 'pt': return 'pt-BR';
    case 'es': return 'es-ES';
    default: return 'en-US';
  }
}

export function getTranscriptionCapabilities() {
  return {
    cloud: !!SpeechRecognitionImpl,
    local: true // resolvido em tempo de uso; pode falhar se o CDN/modelo estiver bloqueado
  };
}

// --- Modo Nuvem: reconhecimento ao vivo via Web Speech API ---
export class CloudTranscriber {
  constructor({ lang } = {}) {
    this.lang = lang || 'en-US';
    this.recognition = null;
    this.finalTranscript = '';
    this.active = false;
    this.stopping = false;
    this.hadError = null;
    this._resolveStop = null;
  }

  isSupported() {
    return !!SpeechRecognitionImpl;
  }

  start() {
    if (!SpeechRecognitionImpl) {
      this.hadError = 'unsupported';
      return false;
    }
    this.active = true;
    this.stopping = false;
    this.finalTranscript = '';
    this.hadError = null;
    this._spawn();
    return true;
  }

  _spawn() {
    const r = new SpeechRecognitionImpl();
    r.lang = this.lang;
    r.continuous = true;
    r.interimResults = false;
    r.maxAlternatives = 1;

    r.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) this.finalTranscript += e.results[i][0].transcript + ' ';
      }
    };

    r.onerror = (e) => {
      // Sem permissao/servico: nao adianta reiniciar. Demais erros (network, no-speech): tolerar.
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        this.hadError = e.error;
        this.active = false;
      } else if (e.error !== 'no-speech' && e.error !== 'aborted') {
        this.hadError = e.error;
      }
    };

    r.onend = () => {
      // Android costuma encerrar sozinho a sessao; reiniciar enquanto ainda estamos gravando.
      if (this.active && !this.stopping) {
        try { r.start(); } catch { /* pode falhar se reiniciar rapido demais; ignorar */ }
        return;
      }
      if (this._resolveStop) {
        const done = this._resolveStop;
        this._resolveStop = null;
        done();
      }
    };

    this.recognition = r;
    try { r.start(); } catch { /* ja iniciado */ }
  }

  stopAndGetResult() {
    return new Promise((resolve) => {
      const finish = () => {
        const transcript = this.finalTranscript.trim();
        resolve({ transcript, status: transcript ? 'ok' : 'indisponivel' });
      };
      if (!this.recognition || !this.active) {
        finish();
        return;
      }
      this.stopping = true;
      this.active = false;
      this._resolveStop = finish;
      try { this.recognition.stop(); } catch { finish(); }
      // Rede de seguranca caso o evento 'end' nao dispare.
      setTimeout(() => {
        if (this._resolveStop) {
          this._resolveStop = null;
          finish();
        }
      }, 2000);
    });
  }

  cancel() {
    this.active = false;
    this.stopping = true;
    if (this.recognition) {
      try { this.recognition.abort(); } catch { /* noop */ }
    }
  }
}

// --- Modo Local: Whisper via transformers.js, pos-processando o blob ---
const TRANSFORMERS_CDN = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.5';
const WHISPER_MODEL = 'Xenova/whisper-tiny';

export class LocalTranscriber {
  constructor({ onProgress } = {}) {
    this.onProgress = onProgress || (() => {});
  }

  async _ensurePipeline() {
    if (LocalTranscriber._pipe) return LocalTranscriber._pipe;
    if (!LocalTranscriber._loading) {
      LocalTranscriber._loading = (async () => {
        const mod = await import(TRANSFORMERS_CDN);
        const { pipeline, env } = mod;
        if (env) env.allowLocalModels = false;
        const pipe = await pipeline('automatic-speech-recognition', WHISPER_MODEL, {
          progress_callback: (p) => {
            if (p && p.status === 'progress' && p.progress != null) this.onProgress(Math.round(p.progress));
          }
        });
        LocalTranscriber._pipe = pipe;
        return pipe;
      })();
    }
    return LocalTranscriber._loading;
  }

  async transcribeBlob(blob, lang) {
    try {
      const pipe = await this._ensurePipeline();
      const pcm = await blobToPcm16k(blob);
      const langBase = (lang || '').slice(0, 2) || undefined;
      const out = await pipe(pcm, { language: langBase, task: 'transcribe', chunk_length_s: 30, stride_length_s: 5 });
      const text = out && (out.text || (Array.isArray(out) ? out.map((o) => o.text).join(' ') : ''));
      const transcript = (text || '').trim();
      return { transcript, status: transcript ? 'ok' : 'indisponivel' };
    } catch {
      return { transcript: '', status: 'indisponivel' };
    }
  }
}

async function blobToPcm16k(blob) {
  const arrayBuf = await blob.arrayBuffer();
  const Ctx = window.AudioContext || window.webkitAudioContext;
  const ctx = new Ctx({ sampleRate: 16000 });
  try {
    const decoded = await ctx.decodeAudioData(arrayBuf);
    const ch0 = decoded.getChannelData(0);
    return decoded.sampleRate === 16000 ? new Float32Array(ch0) : resampleTo16k(ch0, decoded.sampleRate);
  } finally {
    if (ctx.close) ctx.close();
  }
}

function resampleTo16k(input, inRate) {
  const ratio = inRate / 16000;
  const outLen = Math.round(input.length / ratio);
  const out = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const idx = i * ratio;
    const i0 = Math.floor(idx);
    const i1 = Math.min(i0 + 1, input.length - 1);
    const frac = idx - i0;
    out[i] = input[i0] * (1 - frac) + input[i1] * frac;
  }
  return out;
}
