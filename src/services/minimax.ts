import { ensureAnonymousSession } from './auth';
import { supabase } from './supabase';

export interface PlaybackSegment {
  type: 'audio' | 'pause';
  url?: string;
  duration?: number;
  text?: string;
}

type GenerationProgress = {
  completedUnits: number;
  totalUnits: number;
  ratio: number;
};

type ScriptUnit =
  | { type: 'audio'; text: string }
  | { type: 'pause'; duration: number };

function buildScriptUnits(script: string): ScriptUnit[] {
  const tokens = script.split(/(\[p:\d+\])/).map((part) => part.trim()).filter(Boolean);
  const units: ScriptUnit[] = [];
  let buffer = '';
  // Bigger chunks reduce the number of TTS requests and speed up generation.
  const maxChunkChars = 220;

  const flushBuffer = () => {
    const text = buffer.replace(/\s+/g, ' ').trim();
    if (!text) return;
    units.push({ type: 'audio', text });
    buffer = '';
  };

  for (const token of tokens) {
    const pauseMatch = token.match(/^\[p:(\d+)\]$/);
    if (pauseMatch) {
      const seconds = parseInt(pauseMatch[1], 10);
      flushBuffer();
      const duration = Math.max(1000, seconds * 1000);
      const lastUnit = units[units.length - 1];
      if (lastUnit?.type === 'pause') {
        lastUnit.duration += duration;
      } else {
        units.push({ type: 'pause', duration });
      }
      continue;
    }

    const normalized = token.replace(/\s+/g, ' ').trim();
    if (!normalized) continue;
    const nextBuffer = buffer ? `${buffer} ${normalized}` : normalized;
    if (buffer && nextBuffer.length > maxChunkChars) {
      flushBuffer();
      buffer = normalized;
    } else {
      buffer = nextBuffer;
    }
  }

  flushBuffer();
  return units;
}

async function invokeTts(text: string, voiceId: string) {
  const timeoutMs = 25000;
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error('minimax_tts_timeout')), timeoutMs);
  });

  return Promise.race([
    supabase.functions.invoke('minimax-tts', {
      body: { text, voiceId }
    }),
    timeoutPromise
  ]);
}

async function invokeBatchTts(texts: string[], voiceId: string) {
  const timeoutMs = Math.max(35000, Math.min(150000, texts.length * 9000));
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error('minimax_tts_batch_timeout')), timeoutMs);
  });

  return Promise.race([
    supabase.functions.invoke('minimax-tts', {
      body: { texts, voiceId }
    }),
    timeoutPromise
  ]);
}

export async function generateMeditationAudio(
  script: string,
  voiceStyle: string = "warm",
  onProgress?: (progress: GenerationProgress) => void
): Promise<PlaybackSegment[]> {
  const voiceId = voiceStyle === 'warm' ? "male-qn-qingse" : "female-shaonv";
  const units = buildScriptUnits(script);
  const segments: PlaybackSegment[] = [];
  let audioSegmentCount = 0;
  const totalUnits = Math.max(1, units.length);
  let completedUnits = 0;

  const emitProgress = () => {
    onProgress?.({
      completedUnits,
      totalUnits,
      ratio: Math.min(1, Math.max(0, completedUnits / totalUnits))
    });
  };

  if (!supabase) {
    throw new Error('supabase_not_configured');
  }
  await ensureAnonymousSession();
  emitProgress();

  const audioUnitTexts = units.filter((u): u is { type: 'audio'; text: string } => u.type === 'audio').map((u) => u.text);
  let batchHexList: string[] | null = null;
  try {
    const { data, error } = (await invokeBatchTts(audioUnitTexts, voiceId)) as any;
    if (error) throw error;
    const list = Array.isArray((data as any)?.audioHexList) ? (data as any).audioHexList.map((x: any) => String(x ?? '')) : [];
    if (list.length === audioUnitTexts.length) {
      batchHexList = list;
    }
  } catch (error) {
    console.warn('Batch TTS failed, fallback to per-chunk mode:', error);
  }

  let audioCursor = 0;
  for (const unit of units) {
    if (unit.type === 'pause') {
      segments.push(unit);
      completedUnits += 1;
      emitProgress();
      continue;
    }

    const text = unit.text;
    let hexAudio = '';

    if (batchHexList) {
      hexAudio = String(batchHexList[audioCursor] ?? '');
      audioCursor += 1;
    }

    if (!hexAudio) {
      try {
        let retries = 3;
        while (retries > 0) {
          try {
            const { data, error } = await invokeTts(text, voiceId) as any;
            if (error) throw error;
            hexAudio = String((data as any)?.audioHex ?? '');
            if (!hexAudio) throw new Error('empty_audio');
            break;
          } catch (error) {
            retries -= 1;
            if (retries === 0) break;
            await new Promise((resolve) => setTimeout(resolve, 900));
          }
        }
      } catch (error) {
        console.error("MiniMax TTS API Error for chunk:", text, error);
      }
    }

    const bytes = hexAudio.match(/[\da-f]{2}/gi);
    if (bytes?.length) {
      const typedArray = new Uint8Array(bytes.map((h: string) => parseInt(h, 16)));
      const blob = new Blob([typedArray], { type: 'audio/mp3' });
      segments.push({
        type: 'audio',
        url: URL.createObjectURL(blob),
        text
      });
      audioSegmentCount += 1;
    } else {
      // Keep timeline continuity when a chunk fails.
      segments.push({ type: 'pause', duration: 2200 });
    }
    completedUnits += 1;
    emitProgress();
  }

  if (audioSegmentCount === 0) {
    throw new Error('empty_playlist');
  }

  return segments;
}
