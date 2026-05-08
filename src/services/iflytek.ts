import { ensureAnonymousSession } from './auth';
import { supabase } from './supabase';

type IatAuth = {
  url: string;
  appId: string;
};

async function fetchIatAuth(): Promise<IatAuth> {
  if (!supabase) throw new Error('supabase not configured');
  await ensureAnonymousSession();
  const { data, error } = await supabase.functions.invoke('iflytek-auth', { body: {} });
  if (error) throw error;
  const url = String((data as any)?.url ?? '');
  const appId = String((data as any)?.appId ?? '');
  if (!url || !appId) throw new Error('invalid auth response');
  return { url, appId };
}

export class IatRecorder {
  private ws: WebSocket | null = null;
  private stream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private processor: ScriptProcessorNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private auth: IatAuth | null = null;

  private transcriptSegments = new Map<number, string>();
  private hasSentFirstFrame = false;
  private stopInitiated = false;
  private cleanedUp = false;
  private finalStatusReceived = false;
  private finalizeTimer: number | null = null;

  onResult: (text: string, isLast: boolean, resultObj?: any) => void = () => {};
  onError: (msg: string) => void = () => {};
  onClose: () => void = () => {};
  onVolume: (level: number) => void = () => {};

  async start() {
    this.transcriptSegments.clear();
    this.hasSentFirstFrame = false;
    this.stopInitiated = false;
    this.cleanedUp = false;
    this.finalStatusReceived = false;
    if (this.finalizeTimer !== null) {
      window.clearTimeout(this.finalizeTimer);
      this.finalizeTimer = null;
    }
    this.auth = await fetchIatAuth();

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error("getUserMedia not supported in this browser/webview");
      }
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      this.source = this.audioContext.createMediaStreamSource(this.stream);
      this.processor = this.audioContext.createScriptProcessor(4096, 1, 1);

      this.connectWebSocket();
    } catch (err: any) {
      console.error("Microphone access denied or error:", err);
      this.onError(err.message || "Microphone access denied");
      throw err;
    }
  }

  private connectWebSocket() {
    if (!this.auth) {
      this.onError("iFlytek auth missing");
      return;
    }
    this.ws = new WebSocket(this.auth.url);

    this.ws.onopen = () => {
      this.sendAudioData();
    };

    this.ws.onmessage = (e) => {
      const data = JSON.parse(e.data);
      if (data.code !== 0) {
        this.onError(`Error ${data.code}: ${data.message}`);
        this.stop();
        return;
      }

      if (data.data && data.data.result) {
        const ws = data.data.result.ws;
        let str = "";
        ws.forEach((w: any) => {
          w.cw.forEach((c: any) => {
            str += c.w;
          });
        });

        const pgs = data.data.result.pgs;
        const sn = Number(data.data.result.sn);
        if (!Number.isNaN(sn)) {
          if (pgs === 'rpl' && Array.isArray(data.data.result.rg) && data.data.result.rg.length === 2) {
            const rgStart = Number(data.data.result.rg[0]);
            const rgEnd = Number(data.data.result.rg[1]);
            if (!Number.isNaN(rgStart) && !Number.isNaN(rgEnd)) {
              for (let i = rgStart; i <= rgEnd; i += 1) {
                this.transcriptSegments.delete(i);
              }
            }
          }
          this.transcriptSegments.set(sn, str);
        } else if (str) {
          // Fallback if sn is missing: append as a new segment.
          const nextIndex = this.transcriptSegments.size;
          this.transcriptSegments.set(nextIndex, str);
        }

        const fullTextSoFar = this.mergeTranscriptSegments();

        this.onResult(fullTextSoFar, data.data.status === 2, data.data.result);

        if (data.data.status === 2) {
          this.finalStatusReceived = true;
          if (this.stopInitiated) {
            this.clearFinalizeTimer();
            this.cleanupResources();
          }
        }
      }
    };

    this.ws.onerror = () => {
      this.onError("WebSocket error");
    };

    this.ws.onclose = () => {
      this.onClose();
    };
  }

  private sendAudioData() {
    let isFirst = true;

    this.processor!.onaudioprocess = (e) => {
      if (this.stopInitiated) return;
      const inputData = e.inputBuffer.getChannelData(0);
      let sum = 0;
      for (let i = 0; i < inputData.length; i++) {
        const v = inputData[i];
        sum += v * v;
      }
      const rms = Math.sqrt(sum / inputData.length);
      const level = Math.min(1, rms * 4);
      this.onVolume(level);

      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

      const audioData = this.floatTo16BitPCM(inputData);
      const base64Data = this.arrayBufferToBase64(audioData);

      const params = {
        common: isFirst ? { app_id: this.auth?.appId } : undefined,
        business: isFirst ? {
          language: "en_us",
          domain: "iat",
          dwa: "wpgs"
        } : undefined,
        data: {
          status: isFirst ? 0 : 1,
          format: "audio/L16;rate=16000",
          encoding: "raw",
          audio: base64Data
        }
      };

      this.ws.send(JSON.stringify(params));
      if (isFirst) this.hasSentFirstFrame = true;
      isFirst = false;
    };

    this.source!.connect(this.processor!);
    this.processor!.connect(this.audioContext!.destination);
  }

  stop() {
    if (this.stopInitiated) return;
    this.stopInitiated = true;

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      if (this.hasSentFirstFrame) {
        this.ws.send(JSON.stringify({
          data: {
            status: 2,
            format: "audio/L16;rate=16000",
            encoding: "raw",
            audio: ""
          }
        }));
      }
      if (!this.finalStatusReceived) {
        this.finalizeTimer = window.setTimeout(() => {
          this.cleanupResources();
        }, 1200);
      } else {
        this.cleanupResources();
      }
      return;
    }

    this.cleanupResources();
  }

  private mergeTranscriptSegments() {
    return Array.from(this.transcriptSegments.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([, value]) => value)
      .join('');
  }

  private clearFinalizeTimer() {
    if (this.finalizeTimer !== null) {
      window.clearTimeout(this.finalizeTimer);
      this.finalizeTimer = null;
    }
  }

  private cleanupResources() {
    if (this.cleanedUp) return;
    this.cleanedUp = true;
    this.clearFinalizeTimer();

    if (this.ws && this.ws.readyState !== WebSocket.CLOSED && this.ws.readyState !== WebSocket.CLOSING) {
      try {
        this.ws.close();
      } catch {}
    }
    if (this.stream) {
      this.stream.getTracks().forEach(t => t.stop());
      this.stream = null;
    }
    if (this.processor) {
      this.processor.onaudioprocess = null;
      this.processor.disconnect();
      this.processor = null;
    }
    if (this.source) {
      this.source.disconnect();
      this.source = null;
    }
    if (this.audioContext) {
      try {
        if (this.audioContext.state !== 'closed') this.audioContext.close();
      } catch {}
      this.audioContext = null;
    }
    this.ws = null;
  }

  private floatTo16BitPCM(float32Array: Float32Array): Int16Array {
    const int16Array = new Int16Array(float32Array.length);
    for (let i = 0; i < float32Array.length; i++) {
      let s = Math.max(-1, Math.min(1, float32Array[i]));
      int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    return int16Array;
  }

  private arrayBufferToBase64(buffer: Int16Array): string {
    let binary = '';
    const bytes = new Uint8Array(buffer.buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }
}
