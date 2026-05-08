import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { generateMeditationScript } from '../../services/deepseek';
import { generateMeditationAudio, PlaybackSegment } from '../../services/minimax';
import { PixelLandscapeBackdrop } from './PixelLandscapeBackdrop';

interface MeditationScreenProps {
  onEnd: () => void;
  duration: number;
  title: string;
  context?: string[]; // to generate personalized script
  settings?: any; // { voiceStyle, backgroundSound }
  initialScript: string;
  scriptWordCount?: number;
  initialPlaylist: PlaybackSegment[];
}

function countEnglishWords(text: string) {
  return (text.match(/[A-Za-z]+(?:'[A-Za-z]+)*/g) ?? []).length;
}

function audioBufferToWavBlob(buffer: AudioBuffer): Blob {
  const numChannels = Math.min(2, buffer.numberOfChannels || 1);
  const sampleRate = buffer.sampleRate;
  const length = buffer.length;
  const bytesPerSample = 2;
  const blockAlign = numChannels * bytesPerSample;
  const dataSize = length * blockAlign;
  const wavBuffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(wavBuffer);

  const writeString = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i += 1) {
      view.setUint8(offset + i, text.charCodeAt(i));
    }
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true); // PCM fmt chunk size
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true); // 16-bit
  writeString(36, 'data');
  view.setUint32(40, dataSize, true);

  const channelData = Array.from({ length: numChannels }, (_, i) => buffer.getChannelData(i));
  let offset = 44;
  for (let i = 0; i < length; i += 1) {
    for (let c = 0; c < numChannels; c += 1) {
      const sample = Math.max(-1, Math.min(1, channelData[c][i] ?? 0));
      const pcm = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
      view.setInt16(offset, Math.round(pcm), true);
      offset += 2;
    }
  }

  return new Blob([wavBuffer], { type: 'audio/wav' });
}

async function exportPlaylistAsWav(playlist: PlaybackSegment[]): Promise<Blob> {
  const AudioContextCtor = window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioContextCtor) throw new Error('AudioContext_not_supported');

  const decodeCtx = new AudioContextCtor();
  try {
    const decodedUnits: Array<{ type: 'audio'; buffer: AudioBuffer } | { type: 'pause'; duration: number }> = [];
    let totalSeconds = 0;

    for (const segment of playlist) {
      if (segment.type === 'pause') {
        const durationMs = Math.max(0, Number(segment.duration ?? 0));
        const durationSeconds = durationMs / 1000;
        decodedUnits.push({ type: 'pause', duration: durationSeconds });
        totalSeconds += durationSeconds;
        continue;
      }

      if (!segment.url) continue;
      const response = await fetch(segment.url);
      if (!response.ok) throw new Error('audio_fetch_failed');
      const arrayBuffer = await response.arrayBuffer();
      const audioBuffer = await decodeCtx.decodeAudioData(arrayBuffer.slice(0));
      decodedUnits.push({ type: 'audio', buffer: audioBuffer });
      totalSeconds += audioBuffer.duration;
    }

    if (totalSeconds <= 0) throw new Error('empty_playlist');

    const sampleRate = decodeCtx.sampleRate || 44100;
    const frameCount = Math.max(1, Math.ceil(totalSeconds * sampleRate));
    const offline = new OfflineAudioContext(2, frameCount, sampleRate);
    let cursor = 0;

    for (const unit of decodedUnits) {
      if (unit.type === 'pause') {
        cursor += unit.duration;
        continue;
      }
      const source = offline.createBufferSource();
      source.buffer = unit.buffer;
      source.connect(offline.destination);
      source.start(cursor);
      cursor += unit.buffer.duration;
    }

    const rendered = await offline.startRendering();
    return audioBufferToWavBlob(rendered);
  } finally {
    await decodeCtx.close().catch(() => {});
  }
}

export function MeditationScreen({
  onEnd,
  duration,
  title,
  context = [],
  settings = {},
  initialScript,
  scriptWordCount = 0,
  initialPlaylist
}: MeditationScreenProps) {
  const [timeRemaining, setTimeRemaining] = useState(duration);
  const [isPlaying, setIsPlaying] = useState(true);
  const [showControls, setShowControls] = useState(false);
  const [isEnded, setIsEnded] = useState(false);
  const controlsTimerRef = useRef<NodeJS.Timeout>();

  const [playlist, setPlaylist] = useState<PlaybackSegment[]>(initialPlaylist);
  const [currentSegmentIndex, setCurrentSegmentIndex] = useState(0);
  const [scriptText, setScriptText] = useState(initialScript);
  const [hasStarted, setHasStarted] = useState(true);
  const [isExportingAudio, setIsExportingAudio] = useState(false);
  const [exportTip, setExportTip] = useState<string | null>(null);
  
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const bgAudioRef = useRef<HTMLAudioElement | null>(null);
  const exportTipTimerRef = useRef<NodeJS.Timeout>();
  const playlistRef = useRef<PlaybackSegment[]>(initialPlaylist);

  useEffect(() => {
    playlistRef.current = playlist;
  }, [playlist]);

  useEffect(() => {
    setPlaylist(initialPlaylist);
    setCurrentSegmentIndex(0);
    setIsEnded(false);
    setIsPlaying(initialPlaylist.length > 0);
    if (initialPlaylist.length === 0) {
      setShowControls(true);
      setExportTip('No playable audio was prepared. Please regenerate meditation.');
      if (exportTipTimerRef.current) clearTimeout(exportTipTimerRef.current);
      exportTipTimerRef.current = setTimeout(() => setExportTip(null), 2600);
    }
  }, [initialPlaylist]);

  useEffect(() => {
    return () => {
      // Cleanup all blob URLs when unmounting
      playlistRef.current.forEach((seg) => {
        if (seg.url) URL.revokeObjectURL(seg.url);
      });
    };
  }, []);

  // Playlist playback logic
  useEffect(() => {
    if (!isPlaying || isEnded) {
      if (audioRef.current) {
        audioRef.current.pause();
      }
      return;
    }

    if (currentSegmentIndex >= playlist.length) {
      // Finished all segments
      if (playlist.length > 0 && !isEnded) {
        setIsEnded(true);
        setIsPlaying(false);
      }
      return;
    }

    const segment = playlist[currentSegmentIndex];

    if (segment.type === 'pause') {
      const timer = setTimeout(() => {
        setCurrentSegmentIndex(prev => prev + 1);
      }, segment.duration);
      return () => clearTimeout(timer);
    } else if (segment.type === 'audio' && segment.url) {
      const audio = new Audio(segment.url);
      audio.volume = 1.0; // Ensure human voice is at 100%
      audioRef.current = audio;
      
      audio.onended = () => {
        setCurrentSegmentIndex(prev => prev + 1);
      };
      
      audio.play().catch((e) => {
        console.log('Audio play failed:', e);
        setIsPlaying(false);
        setShowControls(true);
        setExportTip('Audio was blocked. Tap play to resume sound.');
        if (exportTipTimerRef.current) clearTimeout(exportTipTimerRef.current);
        exportTipTimerRef.current = setTimeout(() => setExportTip(null), 2600);
      });
      
      return () => {
        audio.pause();
        audio.src = '';
        audioRef.current = null;
      };
    }
  }, [currentSegmentIndex, isPlaying, isEnded, playlist]);

  useEffect(() => {
    if (isPlaying && settings.backgroundSound && settings.backgroundSound !== 'none') {
      if (!bgAudioRef.current) {
        bgAudioRef.current = new Audio(`/sounds/${settings.backgroundSound}.mp3`);
        bgAudioRef.current.loop = true;
      } else if (!bgAudioRef.current.src.includes(`${settings.backgroundSound}.mp3`)) {
        bgAudioRef.current.src = `/sounds/${settings.backgroundSound}.mp3`;
      }
      
      // Set volume based on the specific sound type
      if (settings.backgroundSound === 'ocean') {
        bgAudioRef.current.volume = 0.15; // 15% for ocean
      } else if (settings.backgroundSound === 'forest') {
        bgAudioRef.current.volume = 0.45; // 45% for forest
      } else if (settings.backgroundSound === 'fire') {
        bgAudioRef.current.volume = 1.0; // 100% for fire
      } else {
        bgAudioRef.current.volume = 0.70; // 70% for rain
      }
      
      bgAudioRef.current.play().catch((e) => {
        console.log('BG Audio play failed:', e);
      });
    } else if ((!isPlaying || settings.backgroundSound === 'none') && bgAudioRef.current) {
      bgAudioRef.current.pause();
    }
    
    return () => {
      // Don't cleanup the audio on every render, only when unmounting the whole component
      // This allows pausing and resuming correctly
    };
  }, [isPlaying, settings.backgroundSound]);

  useEffect(() => {
    return () => {
      if (bgAudioRef.current) {
        bgAudioRef.current.pause();
        bgAudioRef.current = null;
      }
      if (exportTipTimerRef.current) clearTimeout(exportTipTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!isPlaying || isEnded) return;

    const interval = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev <= 1) {
          setIsEnded(true);
          setIsPlaying(false);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isPlaying, isEnded]);

  useEffect(() => {
    let returnTimer: NodeJS.Timeout;
    if (isEnded) {
      returnTimer = setTimeout(() => {
        onEnd();
      }, 5000);
    }
    return () => clearTimeout(returnTimer);
  }, [isEnded, onEnd]);

  const handleScreenTap = () => {
    if (isEnded) return;

    setShowControls(true);

    if (controlsTimerRef.current) {
      clearTimeout(controlsTimerRef.current);
    }

    controlsTimerRef.current = setTimeout(() => {
      setShowControls(false);
    }, 3000);
  };

  const togglePlayPause = () => {
    setIsPlaying(!isPlaying);
  };

  const handleExportAudio = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    if (isExportingAudio) return;
    const hasAudio = playlist.some((seg) => seg.type === 'audio' && seg.url);
    if (!hasAudio) {
      setExportTip('No audio available to export yet.');
      if (exportTipTimerRef.current) clearTimeout(exportTipTimerRef.current);
      exportTipTimerRef.current = setTimeout(() => setExportTip(null), 2200);
      return;
    }

    setIsExportingAudio(true);
    setExportTip('Exporting audio...');
    try {
      const blob = await exportPlaylistAsWav(playlist);
      const downloadUrl = URL.createObjectURL(blob);
      const minutes = Math.max(1, Math.round(duration / 60));
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = `mindplan-meditation-${minutes}min-${stamp}.wav`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(downloadUrl), 3000);
      setExportTip('Audio exported successfully.');
    } catch (error) {
      console.error('Failed to export meditation audio:', error);
      setExportTip('Export failed. Please try again.');
    } finally {
      setIsExportingAudio(false);
      if (exportTipTimerRef.current) clearTimeout(exportTipTimerRef.current);
      exportTipTimerRef.current = setTimeout(() => setExportTip(null), 2200);
    }
  };

  const handleEnd = () => {
    setIsEnded(true);
    setIsPlaying(false);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const progress = ((duration - timeRemaining) / duration) * 360;
  const displayedWordCount = scriptWordCount > 0 ? scriptWordCount : countEnglishWords(scriptText);
  const isLastMinute = timeRemaining <= 60 && !isEnded;

  return (
    <div
      onClick={handleScreenTap}
      className="relative w-full h-screen overflow-hidden cursor-pointer"
      style={{
        background: 'linear-gradient(135deg, var(--meditation-bg-1) 0%, var(--meditation-bg-2) 100%)',
        fontFamily: 'var(--font-sans)'
      }}
    >
      <PixelLandscapeBackdrop theme={settings?.theme ?? 'warm'} />

      {/* Breathing Halo */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
        <motion.svg
          width="320"
          height="320"
          viewBox="0 0 320 320"
          className="transform -rotate-90"
        >
          {/* Full halo ring */}
          <motion.circle
            cx="160"
            cy="160"
            r="140"
            fill="none"
            stroke="url(#haloGradient)"
            strokeWidth="3"
            animate={!isEnded && isPlaying ? {
              opacity: [0.6, 0.9, 0.6],
              filter: [
                'drop-shadow(0 0 20px var(--accent-40))',
                'drop-shadow(0 0 30px var(--accent-60))',
                'drop-shadow(0 0 20px var(--accent-40))'
              ]
            } : {}}
            transition={{
              duration: isLastMinute ? 3.5 : 4.5,
              repeat: Infinity,
              ease: "easeInOut"
            }}
          />

          {/* Timer progress (dimming arc) */}
          <motion.circle
            cx="160"
            cy="160"
            r="140"
            fill="none"
            stroke="var(--meditation-dim)"
            strokeWidth="3"
            strokeLinecap="round"
            initial={{ strokeDasharray: '0 880' }}
            animate={{ strokeDasharray: `${(progress / 360) * 880} 880` }}
            transition={{ duration: 1, ease: "linear" }}
          />

          <defs>
            <linearGradient id="haloGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="var(--matte-gold)" />
              <stop offset="50%" stopColor="var(--terracotta)" />
              <stop offset="100%" stopColor="var(--matte-gold)" />
            </linearGradient>
          </defs>
        </motion.svg>

        {/* Title and time */}
        {!isEnded ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <AnimatePresence mode="wait">
              <motion.div
                key="playing"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex -translate-y-8 flex-col items-center justify-center gap-6"
              >
                <p
                  className="text-[15px] px-8 text-center tracking-wide"
                  style={{
                    color: 'rgba(255,255,255,0.94)',
                    fontWeight: 500,
                    textShadow: '0 2px 8px rgba(0,0,0,0.45)'
                  }}
                >
                  {title}
                </p>
                <p
                  className="text-[12px] px-8 text-center"
                  style={{
                    color: 'rgba(255,255,255,0.78)',
                    fontWeight: 500,
                    letterSpacing: '0.02em',
                    textShadow: '0 2px 8px rgba(0,0,0,0.38)'
                  }}
                >
                  Script length: {displayedWordCount} words
                </p>
                <p
                  className="text-[32px] tabular-nums"
                  style={{
                    color: 'rgba(255,255,255,0.98)',
                    fontWeight: 600,
                    textShadow: '0 2px 10px rgba(0,0,0,0.5)'
                  }}
                >
                  {formatTime(timeRemaining)}
                </p>
              </motion.div>
            </AnimatePresence>
          </div>
        ) : (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.8 }}
            className="absolute inset-0 flex flex-col items-center justify-center"
          >
            <svg width="280" height="280" viewBox="0 0 280 280">
              <circle
                cx="140"
                cy="140"
                r="120"
                fill="none"
                stroke="var(--mote-30)"
                strokeWidth="2"
              />
            </svg>
            <p
              className="absolute text-[15px] px-12 text-center"
              style={{
                color: 'rgba(255,255,255,0.94)',
                fontWeight: 500,
                lineHeight: '1.6',
                textShadow: '0 2px 8px rgba(0,0,0,0.45)'
              }}
            >
              Whenever you're ready, we can build another.
            </p>
          </motion.div>
        )}

        {/* Breath cue rings */}
        <AnimatePresence>
          {!isEnded && isPlaying && (
            <motion.div
              className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              {[...Array(3)].map((_, i) => (
                <motion.div
                  key={i}
                  className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border"
                  style={{
                    width: '280px',
                    height: '280px',
                    borderColor: 'var(--meditation-border-15)',
                    borderWidth: '1px'
                  }}
                  animate={{
                    scale: [1, 1.4],
                    opacity: [0.4, 0]
                  }}
                  transition={{
                    duration: 4.5,
                    repeat: Infinity,
                    delay: i * 1.5,
                    ease: "easeOut"
                  }}
                />
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Controls */}
      <AnimatePresence>
        {hasStarted && !isEnded && (
          <div className="absolute left-1/2 bottom-28 -translate-x-1/2" style={{ zIndex: 10 }}>
            <motion.div
              initial={{ opacity: 1, y: 0 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="rounded-full px-4 py-3.5 flex items-center gap-3.5"
              style={{
                background: 'linear-gradient(135deg, rgba(255,255,255,0.2) 0%, rgba(248,242,236,0.15) 100%)',
                backdropFilter: 'blur(30px)',
                border: '1px solid rgba(194,123,108,0.16)',
                boxShadow: '0 7px 18px rgba(60,56,53,0.15)'
              }}
            >
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  togglePlayPause();
                }}
                className="w-14 h-14 rounded-full flex items-center justify-center"
                aria-label={isPlaying ? "Pause" : "Play"}
                style={{
                  background: 'linear-gradient(135deg, rgba(194,123,108,0.16) 0%, rgba(212,175,106,0.14) 100%)',
                  border: '1px solid rgba(194,123,108,0.22)',
                  boxShadow: 'inset 0 1px 2px rgba(255,255,255,0.46)',
                  color: 'rgba(95,69,32,0.96)'
                }}
              >
                {isPlaying ? (
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                    <rect x="5.9" y="4.8" width="2.8" height="10.4" rx="1.4" fill="currentColor" />
                    <rect x="11.3" y="4.8" width="2.8" height="10.4" rx="1.4" fill="currentColor" />
                  </svg>
                ) : (
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                    <path d="M7 5.4L14 10L7 14.6V5.4Z" fill="currentColor" />
                  </svg>
                )}
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleEnd();
                }}
                className="w-14 h-14 rounded-full flex items-center justify-center"
                aria-label="End meditation"
                style={{
                  background: 'linear-gradient(135deg, rgba(122,92,255,0.14) 0%, rgba(194,123,108,0.12) 100%)',
                  border: '1px solid rgba(122,92,255,0.2)',
                  boxShadow: 'inset 0 1px 2px rgba(255,255,255,0.44)',
                  color: 'rgba(62,48,112,0.95)'
                }}
              >
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                  <path d="M6 6L14 14M14 6L6 14" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
                </svg>
              </button>
              <button
                onClick={handleExportAudio}
                className="w-14 h-14 rounded-full flex items-center justify-center disabled:opacity-45"
                aria-label="Export audio"
                disabled={isExportingAudio || !playlist.some((seg) => seg.type === 'audio' && seg.url)}
                style={{
                  background: 'linear-gradient(135deg, rgba(212,175,106,0.16) 0%, rgba(248,242,236,0.2) 100%)',
                  border: '1px solid rgba(212,175,106,0.3)',
                  boxShadow: 'inset 0 1px 2px rgba(255,255,255,0.44)',
                  color: 'rgba(95,69,32,0.95)'
                }}
                title={isExportingAudio ? 'Exporting...' : 'Export audio'}
              >
                {isExportingAudio ? (
                  <motion.div
                    className="w-4 h-4 rounded-full border-2 border-current border-t-transparent"
                    animate={{ rotate: 360 }}
                    transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }}
                  />
                ) : (
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                    <path d="M10 3.8v7.2M10 11l-2.8-2.8M10 11l2.8-2.8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M4.8 13.5v1.1c0 .9.7 1.6 1.6 1.6h7.2c.9 0 1.6-.7 1.6-1.6v-1.1" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                  </svg>
                )}
              </button>
            </motion.div>
            <AnimatePresence>
              {exportTip ? (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 8 }}
                  className="mt-2 text-center text-[12px]"
                  style={{ color: 'rgba(255,255,255,0.92)', textShadow: '0 2px 8px rgba(0,0,0,0.4)' }}
                >
                  {exportTip}
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>
        )}
      </AnimatePresence>

      {/* Auto-return to inquiry */}
      {isEnded && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 5 }}
        />
      )}
    </div>
  );
}
