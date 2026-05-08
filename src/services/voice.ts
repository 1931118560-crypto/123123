import { IatRecorder } from './iflytek';

export type VoiceMode = 'iflytek' | 'web_speech' | 'unavailable';

type RecorderLike = {
  start: () => Promise<void>;
  stop: () => void;
  onResult: (text: string, isLast: boolean, resultObj?: any) => void;
  onError: (msg: string) => void;
  onClose: () => void;
  onVolume: (level: number) => void;
};

function getSpeechRecognitionCtor(): any | null {
  const w = window as any;
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function hasWebSpeechRecognitionSupport() {
  return Boolean(getSpeechRecognitionCtor());
}

class WebSpeechRecorder implements RecorderLike {
  private recognition: any | null = null;
  private finalText = '';

  onResult: (text: string, isLast: boolean, resultObj?: any) => void = () => {};
  onError: (msg: string) => void = () => {};
  onClose: () => void = () => {};
  onVolume: (level: number) => void = () => {};

  async start() {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      this.onError('SpeechRecognition not supported');
      throw new Error('SpeechRecognition not supported');
    }

    this.finalText = '';
    const recognition = new Ctor();
    this.recognition = recognition;
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onresult = (event: any) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const res = event.results[i];
        const t = String(res?.[0]?.transcript ?? '');
        if (res.isFinal) this.finalText += t;
        else interim += t;
      }
      const full = (this.finalText + interim).trim();
      this.onResult(full, false, event);
    };

    recognition.onerror = (event: any) => {
      this.onError(String(event?.error ?? 'SpeechRecognition error'));
    };

    recognition.onend = () => {
      this.onClose();
    };

    recognition.start();
  }

  stop() {
    try {
      this.recognition?.stop?.();
    } catch {}
    this.recognition = null;
    this.onVolume(0);
  }
}

export function getVoiceMode(): VoiceMode {
  if (navigator.mediaDevices?.getUserMedia) return 'iflytek';
  if (getSpeechRecognitionCtor()) return 'web_speech';
  return 'unavailable';
}

export function createVoiceRecorder(preferredMode?: VoiceMode): { mode: VoiceMode; recorder: RecorderLike | null } {
  const detectedMode = getVoiceMode();
  const mode = preferredMode && preferredMode !== 'unavailable' ? preferredMode : detectedMode;
  if (mode === 'iflytek') return { mode, recorder: new IatRecorder() };
  if (mode === 'web_speech') return { mode, recorder: new WebSpeechRecorder() };
  return { mode, recorder: null };
}
