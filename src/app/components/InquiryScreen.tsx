import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { generateNextQuestion, generateMeditationScript } from '../../services/deepseek';
import { createVoiceRecorder, getVoiceMode, hasWebSpeechRecognitionSupport } from '../../services/voice';
import { generateMeditationAudio, PlaybackSegment } from '../../services/minimax';
import { logEvent, logInteraction } from '../../services/telemetry';
import { compressMemory, getMemoryByTheme, saveMemoryNode, MemoryTheme } from '../../services/localMemory';
import { PixelLandscapeBackdrop } from './PixelLandscapeBackdrop';

interface InquiryScreenProps {
  onNavigateToSettings: () => void;
  onStartMeditation: (answers: string[], script: string, playlist: PlaybackSegment[], scriptWordCount: number) => void;
  defaultDuration: number;
  settings: any;
}

type MascotStyle = 'neo' | 'peach' | 'mint' | 'violet' | 'sunny';
const MASCOT_STYLE_IDS: MascotStyle[] = ['neo', 'peach', 'mint', 'violet', 'sunny'];

type MeditationThemeId = 'sleep' | 'stress' | 'emotion' | 'relationship' | 'confidence' | 'focus' | 'gratitude' | 'reset';
const MEDITATION_THEMES: Array<{ id: MeditationThemeId; label: string; hint: string }> = [
  { id: 'sleep', label: 'Sleep Calm', hint: 'Relax your nerves and ease into sleep' },
  { id: 'stress', label: 'Stress Release', hint: 'Soften work and life pressure' },
  { id: 'emotion', label: 'Emotional Clarity', hint: 'Settle complex emotions with care' },
  { id: 'relationship', label: 'Relationship Healing', hint: 'Untangle relationship tension' },
  { id: 'confidence', label: 'Self-Trust', hint: 'Rebuild confidence and self-worth' },
  { id: 'focus', label: 'Focus Reset', hint: 'Return to the present and take action' },
  { id: 'gratitude', label: 'Gratitude Boost', hint: 'Strengthen positive and grounded states' },
  { id: 'reset', label: 'Mind Reset', hint: 'Quickly reset your inner state' }
];

const THEME_TO_MEMORY: Record<MeditationThemeId, MemoryTheme> = {
  sleep: 'sleep',
  stress: 'stress',
  emotion: 'emotion',
  relationship: 'relationship',
  confidence: 'confidence',
  focus: 'focus',
  gratitude: 'gratitude',
  reset: 'emotion'
};

const COMPANION_SYSTEM_PROMPT =
  'System: You are a gentle, reliable emotional support companion. In each response, first offer one sentence of empathy and reassurance, then ask one soft guidance question. Prioritize daily life context and real situations (events, relationships, work/study, family, expectations, pressure). Do not repeatedly focus on physical sensations unless the user explicitly brings up physical discomfort. Avoid preaching, judging, or command-like tone. Make the user feel safe, understood, and emotionally held.';
const MEDITATION_UNLOCK_ROUND = 15;
type AlienVoiceEngine = 'robot' | 'bubble' | 'fm' | 'whisper' | 'chime';
type AlienVoiceProfile = {
  masterGain: number;
  intervalMs: number;
  engine: AlienVoiceEngine;
  baseHzRange: [number, number];
  phraseUnits: [number, number];
};
const ALIEN_VOICE_PROFILES: Record<MascotStyle, AlienVoiceProfile> = {
  neo: {
    masterGain: 860,
    intervalMs: 76,
    engine: 'robot',
    baseHzRange: [220, 300],
    phraseUnits: [3, 6]
  },
  peach: {
    masterGain: 820,
    intervalMs: 102,
    engine: 'bubble',
    baseHzRange: [280, 380],
    phraseUnits: [2, 5]
  },
  mint: {
    masterGain: 900,
    intervalMs: 84,
    engine: 'fm',
    baseHzRange: [240, 340],
    phraseUnits: [3, 6]
  },
  violet: {
    masterGain: 760,
    intervalMs: 88,
    engine: 'whisper',
    baseHzRange: [230, 320],
    phraseUnits: [4, 7]
  },
  sunny: {
    masterGain: 840,
    intervalMs: 108,
    engine: 'chime',
    baseHzRange: [320, 430],
    phraseUnits: [2, 4]
  }
};

function randomInRange([min, max]: [number, number]) {
  return min + Math.random() * (max - min);
}

function hasDistressSignals(text: string) {
  return /(overwhelmed|breakdown|exhausted|can't cope|pain|anxious|afraid|sad|want to cry|insomnia|panic|hopeless|down|depressed|irritable|lonely)/i.test(text);
}

function buildCompanionContext(context: string[], latestAnswer: string) {
  const extra = hasDistressSignals(latestAnswer)
    ? 'System: The user is showing clear distress. First comfort and emotionally hold them, then gently lighten the mood with warm encouragement or mild humor, and finally ask one low-pressure life-oriented question. Avoid rapid follow-up questioning.'
    : 'System: Keep a warm companion tone. Reassure first, then ask a question focused on life context, not repeated body-focused prompts.';
  return [COMPANION_SYSTEM_PROMPT, extra, ...context];
}

function PixelMascot({ styleId, isQuestionStreaming }: { styleId: MascotStyle; isQuestionStreaming: boolean }) {
  if (styleId === 'peach') {
    return (
      <g transform="translate(22 18) scale(3.5)" shapeRendering="crispEdges">
        <rect x="3" y="14" width="10" height="1" fill="rgba(43,49,57,0.14)" />
        <rect x="5" y="0" width="2" height="3" fill="#d783a9" />
        <rect x="9" y="0" width="2" height="3" fill="#d783a9" />
        <rect x="4" y="2" width="8" height="8" fill="#f7a8c2" />
        <rect x="5" y="3" width="6" height="6" fill="#ffd1dc" />
        <rect x="5" y="3" width="6" height="1" fill="#ffe2ea" />
        <rect x="5" y="8" width="6" height="1" fill="#f3bdd0" />
        <rect x="2" y="5" width="1" height="2" fill="#f7a8c2" />
        <rect x="13" y="5" width="1" height="2" fill="#f7a8c2" />
        <rect x="5" y="10" width="6" height="4" fill="#ffb36b" />
        <rect x="5" y="10" width="6" height="1" fill="#ffd09c" />
        <rect x="6" y="14" width="1" height="1" fill="#c7864f" />
        <rect x="9" y="14" width="1" height="1" fill="#c7864f" />
        <motion.rect x="6" y="5" width="1" fill="#4f2d3f" animate={{ height: [1, 1, 0.15, 1, 1] }} transition={{ duration: 5.4, repeat: Infinity, times: [0, 0.87, 0.9, 0.94, 1] }} />
        <motion.rect x="9" y="5" width="1" fill="#4f2d3f" animate={{ height: [1, 1, 0.15, 1, 1] }} transition={{ duration: 5.4, repeat: Infinity, times: [0, 0.87, 0.9, 0.94, 1] }} />
        <rect x="7" y="6" width="1" height="1" fill="#f07aa8" />
        <rect x="8" y="6" width="1" height="1" fill="#f07aa8" />
        <motion.rect
          x="7"
          y="7"
          width="2"
          fill="#4f2d3f"
          animate={isQuestionStreaming ? { height: [1, 2, 1] } : { height: 1 }}
          transition={isQuestionStreaming ? { duration: 0.35, repeat: Infinity, ease: 'easeInOut' } : { duration: 0.15, ease: 'easeOut' }}
        />
      </g>
    );
  }

  if (styleId === 'mint') {
    return (
      <g transform="translate(22 18) scale(3.5)" shapeRendering="crispEdges">
        <rect x="3" y="14" width="10" height="1" fill="rgba(43,49,57,0.14)" />
        <rect x="7" y="0" width="2" height="1" fill="#4ca98f" />
        <rect x="6" y="1" width="4" height="1" fill="#67c7ab" />
        <rect x="3" y="2" width="10" height="8" fill="#73d8be" />
        <rect x="4" y="3" width="8" height="6" fill="#b8f3d8" />
        <rect x="4" y="3" width="8" height="1" fill="#dffbea" />
        <rect x="4" y="8" width="8" height="1" fill="#93e8cb" />
        <rect x="5" y="10" width="6" height="4" fill="#7dd9ff" />
        <rect x="5" y="10" width="6" height="1" fill="#b9ebff" />
        <rect x="6" y="14" width="1" height="1" fill="#5fa6c5" />
        <rect x="9" y="14" width="1" height="1" fill="#5fa6c5" />
        <rect x="4" y="11" width="1" height="2" fill="#7dd9ff" />
        <rect x="11" y="11" width="1" height="2" fill="#7dd9ff" />
        <motion.rect x="6" y="5" width="1" fill="#2b6356" animate={{ height: [1, 1, 0.15, 1, 1] }} transition={{ duration: 5.1, repeat: Infinity, times: [0, 0.88, 0.91, 0.94, 1] }} />
        <motion.rect x="9" y="5" width="1" fill="#2b6356" animate={{ height: [1, 1, 0.15, 1, 1] }} transition={{ duration: 5.1, repeat: Infinity, times: [0, 0.88, 0.91, 0.94, 1] }} />
        <motion.rect
          x="7"
          y="7"
          width="2"
          fill="#2b6356"
          animate={isQuestionStreaming ? { height: [1, 2, 1] } : { height: 1 }}
          transition={isQuestionStreaming ? { duration: 0.35, repeat: Infinity, ease: 'easeInOut' } : { duration: 0.15, ease: 'easeOut' }}
        />
      </g>
    );
  }

  if (styleId === 'violet') {
    return (
      <g transform="translate(22 18) scale(3.5)" shapeRendering="crispEdges">
        <rect x="3" y="14" width="10" height="1" fill="rgba(43,49,57,0.16)" />
        <rect x="4" y="1" width="2" height="2" fill="#6c56c9" />
        <rect x="10" y="1" width="2" height="2" fill="#6c56c9" />
        <rect x="3" y="2" width="10" height="8" fill="#7f67dc" />
        <rect x="4" y="3" width="8" height="6" fill="#cbb7ff" />
        <rect x="4" y="3" width="8" height="1" fill="#e7ddff" />
        <rect x="4" y="8" width="8" height="1" fill="#b49cf8" />
        <rect x="5" y="10" width="6" height="4" fill="#8eb8ff" />
        <rect x="5" y="10" width="6" height="1" fill="#bdd5ff" />
        <rect x="6" y="14" width="1" height="1" fill="#6487c2" />
        <rect x="9" y="14" width="1" height="1" fill="#6487c2" />
        <rect x="2" y="6" width="1" height="1" fill="#8f78ea" />
        <rect x="13" y="6" width="1" height="1" fill="#8f78ea" />
        <motion.rect x="6" y="5" width="1" fill="#3a2b71" animate={{ height: [1, 1, 0.15, 1, 1] }} transition={{ duration: 5, repeat: Infinity, times: [0, 0.88, 0.91, 0.94, 1] }} />
        <motion.rect x="9" y="5" width="1" fill="#3a2b71" animate={{ height: [1, 1, 0.15, 1, 1] }} transition={{ duration: 5, repeat: Infinity, times: [0, 0.88, 0.91, 0.94, 1] }} />
        <rect x="5" y="6" width="1" height="1" fill="#f39ac5" />
        <rect x="10" y="6" width="1" height="1" fill="#f39ac5" />
        <motion.rect
          x="7"
          y="7"
          width="2"
          fill="#3a2b71"
          animate={isQuestionStreaming ? { height: [1, 2, 1] } : { height: 1 }}
          transition={isQuestionStreaming ? { duration: 0.35, repeat: Infinity, ease: 'easeInOut' } : { duration: 0.15, ease: 'easeOut' }}
        />
      </g>
    );
  }

  if (styleId === 'sunny') {
    return (
      <g transform="translate(22 18) scale(3.5)" shapeRendering="crispEdges">
        <rect x="3" y="14" width="10" height="1" fill="rgba(43,49,57,0.14)" />
        <rect x="4" y="1" width="2" height="2" fill="#c18b41" />
        <rect x="10" y="1" width="2" height="2" fill="#c18b41" />
        <rect x="3" y="2" width="10" height="8" fill="#f2b963" />
        <rect x="4" y="3" width="8" height="6" fill="#ffe39f" />
        <rect x="4" y="3" width="8" height="1" fill="#fff0c8" />
        <rect x="4" y="8" width="8" height="1" fill="#f8d07a" />
        <rect x="6" y="6" width="2" height="1" fill="#ffeecf" />
        <rect x="8" y="6" width="2" height="1" fill="#ffeecf" />
        <rect x="5" y="10" width="6" height="4" fill="#ffc27a" />
        <rect x="5" y="10" width="6" height="1" fill="#ffd7a8" />
        <rect x="6" y="14" width="1" height="1" fill="#c59255" />
        <rect x="9" y="14" width="1" height="1" fill="#c59255" />
        <motion.rect x="6" y="5" width="1" fill="#5f4520" animate={{ height: [1, 1, 0.15, 1, 1] }} transition={{ duration: 5.3, repeat: Infinity, times: [0, 0.88, 0.91, 0.94, 1] }} />
        <motion.rect x="9" y="5" width="1" fill="#5f4520" animate={{ height: [1, 1, 0.15, 1, 1] }} transition={{ duration: 5.3, repeat: Infinity, times: [0, 0.88, 0.91, 0.94, 1] }} />
        <motion.rect
          x="7"
          y="7"
          width="2"
          fill="#5f4520"
          animate={isQuestionStreaming ? { height: [1, 2, 1] } : { height: 1 }}
          transition={isQuestionStreaming ? { duration: 0.35, repeat: Infinity, ease: 'easeInOut' } : { duration: 0.15, ease: 'easeOut' }}
        />
      </g>
    );
  }

  return (
    <g transform="translate(22 18) scale(3.5)" shapeRendering="crispEdges">
      <rect x="3" y="14" width="10" height="1" fill="rgba(43,49,57,0.16)" />
      <rect x="7" y="0" width="2" height="1" fill="#7a5cff" />
      <rect x="7" y="1" width="2" height="1" fill="#9f8bff" />
      <rect x="3" y="2" width="10" height="8" fill="#4d3ecf" />
      <rect x="4" y="3" width="8" height="6" fill="#8fd3ff" />
      <rect x="4" y="3" width="8" height="1" fill="#c8ecff" />
      <rect x="4" y="8" width="8" height="1" fill="#64b9ff" />
      <rect x="5" y="4" width="1" height="1" fill="#e9f8ff" />
      <rect x="6" y="4" width="1" height="1" fill="#e9f8ff" />
      <rect x="2" y="5" width="1" height="2" fill="#6e5cff" />
      <rect x="13" y="5" width="1" height="2" fill="#6e5cff" />
      <rect x="5" y="10" width="6" height="4" fill="#ff9f6e" />
      <rect x="5" y="10" width="6" height="1" fill="#ffc08e" />
      <rect x="6" y="14" width="1" height="1" fill="#d07a48" />
      <rect x="9" y="14" width="1" height="1" fill="#d07a48" />
      <rect x="7" y="11" width="2" height="1" fill="#ffe3bf" opacity="0.9" />
      <rect x="4" y="11" width="1" height="2" fill="#ff9f6e" />
      <rect x="11" y="11" width="1" height="2" fill="#ff9f6e" />
      <rect x="6" y="15" width="1" height="1" fill="#6f7f93" />
      <rect x="9" y="15" width="1" height="1" fill="#6f7f93" />
      <motion.rect x="6" y="5" width="1" fill="#1f2a3a" animate={{ height: [1, 1, 0.15, 1, 1] }} transition={{ duration: 5.2, repeat: Infinity, times: [0, 0.88, 0.91, 0.94, 1] }} />
      <motion.rect x="9" y="5" width="1" fill="#1f2a3a" animate={{ height: [1, 1, 0.15, 1, 1] }} transition={{ duration: 5.2, repeat: Infinity, times: [0, 0.88, 0.91, 0.94, 1] }} />
      <rect x="6" y="4" width="1" height="1" fill="rgba(255,255,255,0.85)" />
      <rect x="9" y="4" width="1" height="1" fill="rgba(255,255,255,0.85)" />
      <motion.rect
        x="7"
        y="7"
        width="2"
        fill="#1f2a3a"
        animate={isQuestionStreaming ? { height: [1, 2, 1] } : { height: 1 }}
        transition={isQuestionStreaming ? { duration: 0.35, repeat: Infinity, ease: 'easeInOut' } : { duration: 0.15, ease: 'easeOut' }}
      />
      <rect x="7" y="12" width="2" height="1" fill="#7a5cff" />
    </g>
  );
}

export function InquiryScreen({ onNavigateToSettings, onStartMeditation, defaultDuration, settings }: InquiryScreenProps) {
  const preferredInputMode = settings?.inputPreference === 'type' ? 'text' : 'voice';
  const [currentQuestion, setCurrentQuestion] = useState("How has your day been so far?");
  const [displayedQuestion, setDisplayedQuestion] = useState("How has your day been so far?");
  const [roundNumber, setRoundNumber] = useState(1);
  const [inputText, setInputText] = useState('');
  const [answers, setAnswers] = useState<string[]>([]);
  const [context, setContext] = useState<string[]>([]);
  const [showUndo, setShowUndo] = useState(false);
  const [lastAnswer, setLastAnswer] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [voiceLevel, setVoiceLevel] = useState(0);
  const [inputMode, setInputMode] = useState<'voice' | 'text'>(preferredInputMode);
  const [stepCounter, setStepCounter] = useState(true);
  const [isLoadingQuestion, setIsLoadingQuestion] = useState(false);
  const [isGeneratingMeditation, setIsGeneratingMeditation] = useState(false);
  const [showThemePicker, setShowThemePicker] = useState(false);
  const [activeThemeLabel, setActiveThemeLabel] = useState<string>('');
  const [meditationGenerationProgress, setMeditationGenerationProgress] = useState(0);
  const [micTip, setMicTip] = useState<string | null>(null);
  const [energyTip, setEnergyTip] = useState<string | null>(null);
  const [serverMeditationReady, setServerMeditationReady] = useState(false);
  const [latestReadinessScore, setLatestReadinessScore] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const recorderRef = useRef<any | null>(null);
  const voiceAutoSubmitRef = useRef(false);
  const latestTranscriptRef = useRef('');
  const voicePressStartYRef = useRef<number | null>(null);
  const voiceDiscardCurrentRef = useRef(false);
  const voicePressingRef = useRef(false);
  const voiceSlideCancelArmedRef = useRef(false);
  const alienCtxRef = useRef<AudioContext | null>(null);
  const alienMasterGainRef = useRef<GainNode | null>(null);
  const alienLoopRef = useRef<number | null>(null);
  const alienAudioUnlockedRef = useRef(false);
  const energyTipTimerRef = useRef<number | null>(null);
  const [voiceMode, setVoiceMode] = useState(() => getVoiceMode());
  const [voiceSlideCancelArmed, setVoiceSlideCancelArmed] = useState(false);
  const voiceAvailable = voiceMode !== 'unavailable';
  const canStartMeditation = serverMeditationReady || roundNumber >= MEDITATION_UNLOCK_ROUND;
  const VOICE_CANCEL_SWIPE_DISTANCE = 56;
  const isQuestionStreaming =
    !isLoadingQuestion &&
    displayedQuestion.length > 0 &&
    displayedQuestion.length < currentQuestion.length;
  const mascotStyle: MascotStyle = MASCOT_STYLE_IDS.includes(settings?.mascotStyle)
    ? settings.mascotStyle
    : 'neo';
  const roundsNeeded = canStartMeditation ? 0 : Math.max(0, MEDITATION_UNLOCK_ROUND - roundNumber);
  const chatEnergyRatio = Math.min(
    1,
    Math.max(0, (roundNumber - 1) / Math.max(1, MEDITATION_UNLOCK_ROUND - 1))
  );
  const [orbEnergyRatio, setOrbEnergyRatio] = useState(chatEnergyRatio);
  const displayEnergyRatio = isGeneratingMeditation ? orbEnergyRatio : chatEnergyRatio;
  const displayEnergyPercent = Math.round(displayEnergyRatio * 100);

  const voiceUnavailableTip = () => {
    if (!navigator.mediaDevices?.getUserMedia) return 'This device does not support microphone input';
    return 'Voice input is temporarily unavailable';
  };

  const getClientY = (e: any): number | null => {
    if (typeof e?.clientY === 'number') return e.clientY;
    if (typeof e?.touches?.[0]?.clientY === 'number') return e.touches[0].clientY;
    if (typeof e?.changedTouches?.[0]?.clientY === 'number') return e.changedTouches[0].clientY;
    return null;
  };

  const setSlideCancelArmed = (next: boolean) => {
    voiceSlideCancelArmedRef.current = next;
    setVoiceSlideCancelArmed(next);
  };

  const startAlienMurmur = async () => {
    if (alienLoopRef.current !== null) return;
    const AudioContextCtor = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextCtor) return;
    const profile = ALIEN_VOICE_PROFILES[mascotStyle] ?? ALIEN_VOICE_PROFILES.neo;

    if (!alienCtxRef.current) {
      alienCtxRef.current = new AudioContextCtor();
    }
    const ctx = alienCtxRef.current;
    if (!ctx) return;

    if (ctx.state === 'suspended') {
      try {
        await ctx.resume();
      } catch {
        return;
      }
    }

    if (!alienMasterGainRef.current) {
      const master = ctx.createGain();
      master.gain.value = profile.masterGain;
      master.connect(ctx.destination);
      alienMasterGainRef.current = master;
    }
    const master = alienMasterGainRef.current;
    if (!master) return;
    master.gain.setTargetAtTime(profile.masterGain, ctx.currentTime, 0.04);

    let phraseRemain = 0;
    let phraseCenterHz = randomInRange(profile.baseHzRange);
    const schedulePulse = () => {
      if (!alienCtxRef.current || !alienMasterGainRef.current) return;
      const now = alienCtxRef.current.currentTime;
      const mainGain = alienCtxRef.current.createGain();
      mainGain.gain.setValueAtTime(0.0001, now);
      mainGain.connect(alienMasterGainRef.current);

      if (phraseRemain <= 0) {
        phraseRemain = Math.round(randomInRange(profile.phraseUnits));
        phraseCenterHz = randomInRange(profile.baseHzRange);
      }
      phraseRemain -= 1;

      const syllableAccent = phraseRemain <= 1 ? 1.1 : phraseRemain === 2 ? 1.05 : 1;

      if (profile.engine === 'robot') {
        const duration = randomInRange([0.12, 0.2]);
        const osc = alienCtxRef.current.createOscillator();
        const vibrato = alienCtxRef.current.createOscillator();
        const vibratoGain = alienCtxRef.current.createGain();
        const formant = alienCtxRef.current.createBiquadFilter();
        const softener = alienCtxRef.current.createBiquadFilter();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(phraseCenterHz * randomInRange([0.92, 1.06]), now);
        vibrato.type = 'sine';
        vibrato.frequency.setValueAtTime(randomInRange([4.5, 6.8]), now);
        vibratoGain.gain.value = randomInRange([5, 12]);
        vibrato.connect(vibratoGain);
        vibratoGain.connect(osc.frequency);

        formant.type = 'bandpass';
        formant.frequency.setValueAtTime(randomInRange([900, 1400]), now);
        formant.Q.value = randomInRange([3.2, 5.2]);
        softener.type = 'lowpass';
        softener.frequency.setValueAtTime(randomInRange([1700, 2200]), now);
        softener.Q.value = 0.7;

        mainGain.gain.exponentialRampToValueAtTime(randomInRange([0.011, 0.02]) * syllableAccent, now + 0.03);
        mainGain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

        osc.connect(formant);
        formant.connect(softener);
        softener.connect(mainGain);
        osc.start(now);
        vibrato.start(now);
        osc.stop(now + duration + 0.02);
        vibrato.stop(now + duration + 0.02);
      } else if (profile.engine === 'bubble') {
        const duration = randomInRange([0.13, 0.24]);
        const osc = alienCtxRef.current.createOscillator();
        const formant = alienCtxRef.current.createBiquadFilter();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(phraseCenterHz * randomInRange([1.7, 2.35]), now);
        osc.frequency.exponentialRampToValueAtTime(phraseCenterHz * randomInRange([0.95, 1.2]), now + duration);

        formant.type = 'bandpass';
        formant.frequency.setValueAtTime(randomInRange([1200, 1900]), now);
        formant.Q.value = randomInRange([2.2, 4.2]);

        mainGain.gain.exponentialRampToValueAtTime(randomInRange([0.01, 0.019]) * syllableAccent, now + 0.028);
        mainGain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
        osc.connect(formant);
        formant.connect(mainGain);
        osc.start(now);
        osc.stop(now + duration + 0.02);
      } else if (profile.engine === 'fm') {
        const duration = randomInRange([0.11, 0.19]);
        const carrier = alienCtxRef.current.createOscillator();
        const mod = alienCtxRef.current.createOscillator();
        const modGain = alienCtxRef.current.createGain();
        const low = alienCtxRef.current.createBiquadFilter();

        carrier.type = 'sine';
        carrier.frequency.setValueAtTime(phraseCenterHz * randomInRange([1.02, 1.46]), now);
        mod.type = 'sine';
        mod.frequency.setValueAtTime(randomInRange([18, 52]), now);
        modGain.gain.setValueAtTime(randomInRange([20, 56]), now);
        mod.connect(modGain);
        modGain.connect(carrier.frequency);

        low.type = 'lowpass';
        low.frequency.setValueAtTime(randomInRange([1300, 1900]), now);
        low.Q.value = randomInRange([0.7, 2.4]);

        mainGain.gain.exponentialRampToValueAtTime(randomInRange([0.011, 0.02]) * syllableAccent, now + 0.022);
        mainGain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
        carrier.connect(low);
        low.connect(mainGain);
        carrier.start(now);
        mod.start(now);
        carrier.stop(now + duration + 0.02);
        mod.stop(now + duration + 0.02);
      } else if (profile.engine === 'whisper') {
        const duration = randomInRange([0.1, 0.16]);
        const noiseLike = alienCtxRef.current.createOscillator();
        const band = alienCtxRef.current.createBiquadFilter();
        const low = alienCtxRef.current.createBiquadFilter();

        noiseLike.type = 'sine';
        noiseLike.frequency.setValueAtTime(randomInRange([560, 980]), now);
        noiseLike.frequency.exponentialRampToValueAtTime(randomInRange([660, 1260]), now + duration * 0.7);

        band.type = 'bandpass';
        band.frequency.setValueAtTime(randomInRange([1400, 2100]), now);
        band.Q.value = randomInRange([1.1, 2.4]);
        low.type = 'lowpass';
        low.frequency.setValueAtTime(randomInRange([2200, 3000]), now);
        low.Q.value = 0.6;

        mainGain.gain.exponentialRampToValueAtTime(randomInRange([0.008, 0.014]) * syllableAccent, now + 0.02);
        mainGain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
        noiseLike.connect(band);
        band.connect(low);
        low.connect(mainGain);
        noiseLike.start(now);
        noiseLike.stop(now + duration + 0.02);
      } else {
        const duration = randomInRange([0.12, 0.2]);
        const oscA = alienCtxRef.current.createOscillator();
        const oscB = alienCtxRef.current.createOscillator();
        const mixGain = alienCtxRef.current.createGain();
        const shimmer = alienCtxRef.current.createBiquadFilter();

        oscA.type = 'sine';
        oscB.type = 'sine';
        oscA.frequency.setValueAtTime(phraseCenterHz * randomInRange([1.3, 1.9]), now);
        oscB.frequency.setValueAtTime(phraseCenterHz * randomInRange([2.0, 2.8]), now);
        mixGain.gain.value = 0.56;
        shimmer.type = 'highshelf';
        shimmer.frequency.setValueAtTime(1400, now);
        shimmer.gain.setValueAtTime(randomInRange([0.8, 2.1]), now);

        mainGain.gain.exponentialRampToValueAtTime(randomInRange([0.009, 0.017]) * syllableAccent, now + 0.024);
        mainGain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
        oscA.connect(mixGain);
        oscB.connect(mixGain);
        mixGain.connect(shimmer);
        shimmer.connect(mainGain);
        oscA.start(now);
        oscB.start(now);
        oscA.stop(now + duration + 0.02);
        oscB.stop(now + duration + 0.02);
      }

      const phraseGap = phraseRemain <= 0 ? randomInRange([1.2, 1.7]) : randomInRange([0.78, 1.24]);
      const nextDelay = Math.max(42, Math.round(profile.intervalMs * phraseGap));
      alienLoopRef.current = window.setTimeout(schedulePulse, nextDelay);
    };

    schedulePulse();
  };

  const stopAlienMurmur = () => {
    if (alienLoopRef.current !== null) {
      clearTimeout(alienLoopRef.current);
      alienLoopRef.current = null;
    }
  };

  const charCount = answers.reduce((acc, ans) => acc + ans.length, 0) + inputText.length;
  const filledDots = Math.floor(charCount / 20);

  useEffect(() => {
    if (stepCounter) {
      const timer = setTimeout(() => setStepCounter(false), 2000);
      return () => clearTimeout(timer);
    }
  }, [stepCounter, roundNumber]);

  useEffect(() => {
    return () => {
      if (recorderRef.current) {
        recorderRef.current.stop();
      }
      if (energyTipTimerRef.current !== null) {
        clearTimeout(energyTipTimerRef.current);
        energyTipTimerRef.current = null;
      }
      stopAlienMurmur();
      if (alienCtxRef.current) {
        const ctx = alienCtxRef.current;
        if (ctx.state !== 'closed') {
          void ctx.close().catch(() => {});
        }
        alienCtxRef.current = null;
        alienMasterGainRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (isQuestionStreaming) {
      stopAlienMurmur();
      void startAlienMurmur();
    } else {
      stopAlienMurmur();
    }
  }, [isQuestionStreaming, mascotStyle]);

  useEffect(() => {
    const unlockAlienAudio = async () => {
      if (alienAudioUnlockedRef.current) return;
      const AudioContextCtor = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextCtor) return;
      if (!alienCtxRef.current) {
        alienCtxRef.current = new AudioContextCtor();
      }
      if (alienCtxRef.current.state === 'suspended') {
        try {
          await alienCtxRef.current.resume();
        } catch {
          return;
        }
      }
      alienAudioUnlockedRef.current = true;
    };

    window.addEventListener('pointerdown', unlockAlienAudio, { passive: true });
    window.addEventListener('keydown', unlockAlienAudio);
    window.addEventListener('touchstart', unlockAlienAudio, { passive: true });

    return () => {
      window.removeEventListener('pointerdown', unlockAlienAudio);
      window.removeEventListener('keydown', unlockAlienAudio);
      window.removeEventListener('touchstart', unlockAlienAudio);
    };
  }, []);

  useEffect(() => {
    const mode = getVoiceMode();
    setVoiceMode(mode);
    if (mode === 'unavailable') setInputMode('text');
  }, []);

  useEffect(() => {
    if (isGeneratingMeditation) return;
    setOrbEnergyRatio(chatEnergyRatio);
  }, [chatEnergyRatio, isGeneratingMeditation]);

  useEffect(() => {
    const nextMode = settings?.inputPreference === 'type' ? 'text' : 'voice';
    if (nextMode === 'voice' && voiceMode === 'unavailable') {
      setInputMode('text');
      return;
    }
    setInputMode(nextMode);
  }, [settings?.inputPreference, voiceMode]);

  useEffect(() => {
    if (!isLoadingQuestion && inputMode === 'text' && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isLoadingQuestion, inputMode, roundNumber]);

  useEffect(() => {
    if (!isRecording) return;

    const handleGlobalMove = (e: any) => {
      const startY = voicePressStartYRef.current;
      if (startY === null) return;
      const currentY = getClientY(e);
      if (currentY === null) return;
      const nextArmed = startY - currentY >= VOICE_CANCEL_SWIPE_DISTANCE;
      setSlideCancelArmed(nextArmed);
    };

    window.addEventListener('pointermove', handleGlobalMove, { passive: true });
    window.addEventListener('mousemove', handleGlobalMove, { passive: true });
    window.addEventListener('touchmove', handleGlobalMove, { passive: true });
    return () => {
      window.removeEventListener('pointermove', handleGlobalMove);
      window.removeEventListener('mousemove', handleGlobalMove);
      window.removeEventListener('touchmove', handleGlobalMove);
    };
  }, [isRecording]);

  useEffect(() => {
    if (!isRecording) return;

    const handleReleaseSubmit = () => handlePressEnd(true);
    const handleReleaseCancel = () => handlePressEnd(false);

    window.addEventListener('mouseup', handleReleaseSubmit);
    window.addEventListener('touchend', handleReleaseSubmit);
    window.addEventListener('pointerup', handleReleaseSubmit);
    window.addEventListener('touchcancel', handleReleaseCancel);
    window.addEventListener('pointercancel', handleReleaseCancel);
    return () => {
      window.removeEventListener('mouseup', handleReleaseSubmit);
      window.removeEventListener('touchend', handleReleaseSubmit);
      window.removeEventListener('pointerup', handleReleaseSubmit);
      window.removeEventListener('touchcancel', handleReleaseCancel);
      window.removeEventListener('pointercancel', handleReleaseCancel);
    };
  }, [isRecording]);

  useEffect(() => {
    if (isLoadingQuestion) return;
    if (!currentQuestion) {
      setDisplayedQuestion('');
      return;
    }

    let index = 0;
    setDisplayedQuestion('');
    const timer = setInterval(() => {
      index += 1;
      setDisplayedQuestion(currentQuestion.slice(0, index));
      if (index >= currentQuestion.length) {
        clearInterval(timer);
      }
    }, 45);

    return () => clearInterval(timer);
  }, [currentQuestion, isLoadingQuestion]);

  const submitAnswer = async (answerRaw: string) => {
    const answer = answerRaw.trim();
    if (!answer || isLoadingQuestion) return;
    const submitRound = roundNumber;
    const submitQuestion = currentQuestion;

    setLastAnswer(answer);
    const newAnswers = [...answers, answer];
    setAnswers(newAnswers);
    setInputText('');
    latestTranscriptRef.current = '';
    setShowUndo(true);
    setStepCounter(true);
    setIsLoadingQuestion(true);

    const newContext = [...context, `Assistant: ${currentQuestion}`, `User: ${answer}`];
    setContext(newContext);

    setTimeout(() => setShowUndo(false), 3000);

    try {
      const nextRound = roundNumber + 1;
      const guidedContext = buildCompanionContext(newContext, answer);
      const nextTurn = await generateNextQuestion(guidedContext, nextRound);
      const shouldStartMeditation = Boolean(nextTurn?.shouldStartMeditation);
      const readinessScore =
        Number.isFinite(Number(nextTurn?.readinessScore)) ? Number(nextTurn?.readinessScore) : null;
      const stopReason = String(nextTurn?.stopReason ?? '');
      if (readinessScore !== null) setLatestReadinessScore(readinessScore);
      if (shouldStartMeditation) setServerMeditationReady(true);
      const nextQ = (nextTurn?.question || '').trim() || (shouldStartMeditation
        ? 'You are ready. You can start a meditation now, or keep sharing if you want.'
        : "I'm here with you and listening. Would you like to keep talking?");
      setRoundNumber(nextRound);
      setCurrentQuestion(nextQ);
      const memory = compressMemory(submitQuestion, answer);
      await saveMemoryNode({
        createdAt: Date.now(),
        summary: memory.summary,
        tags: memory.tags,
        sourceQuestion: submitQuestion,
        sourceAnswer: answer
      });
      logInteraction({
        roundNumber: submitRound,
        question: submitQuestion,
        userAnswer: answer,
        resultType: 'next_question',
        nextQuestion: nextQ,
        meta: {
          charCount,
          readinessScore,
          stopReason,
          shouldStartMeditation,
          coveredDimensions: Array.isArray(nextTurn?.coveredDimensions) ? nextTurn.coveredDimensions : [],
          missingDimensions: Array.isArray(nextTurn?.missingDimensions) ? nextTurn.missingDimensions : []
        }
      });
      setIsLoadingQuestion(false);
    } catch (error) {
      console.error("Error generating question:", error);
      setIsLoadingQuestion(false);
      const errorMsg = String((error as any)?.message ?? error).toLowerCase();
      if (errorMsg.includes('timeout') || errorMsg.includes('aborted')) {
        setMicTip('AI response timed out. Please send again.');
      } else {
        setMicTip('AI response failed. Please try again.');
      }
      setTimeout(() => setMicTip(null), 2600);
      logInteraction({
        roundNumber: submitRound,
        question: submitQuestion,
        userAnswer: answer,
        resultType: 'error',
        error: String((error as any)?.message ?? error),
        meta: { stage: 'next_question' }
      });
    }
  };

  const handleGenerateMeditationByTheme = async (themeId: MeditationThemeId) => {
    if (isGeneratingMeditation) return;
    setShowThemePicker(false);
    setIsGeneratingMeditation(true);
    setMeditationGenerationProgress(0);
    const startEnergyRatio = Math.max(0.06, chatEnergyRatio);
    setOrbEnergyRatio(startEnergyRatio);
    const theme = MEDITATION_THEMES.find((t) => t.id === themeId);
    setActiveThemeLabel(theme?.label ?? '');

    try {
      const memoryTheme = THEME_TO_MEMORY[themeId];
      const memories = await getMemoryByTheme(memoryTheme, 18);
      const memorySlice = memories.slice(0, 4).map((m) => `Memory: ${m.summary}`);
      const currentSlice = [...context].slice(-16);

      const mixedContext = [
        COMPANION_SYSTEM_PROMPT,
        `System: You are now generating a mindfulness meditation script. Theme: "${theme?.label ?? themeId}".`,
        'System: Strict weighting rule: historical memory 20%, current conversation 80%.',
        'System: Historical memory (20%):',
        ...memorySlice,
        'System: Current conversation (80%):',
        ...currentSlice
      ];

      const generationDuration = defaultDuration;
      const { script, wordCount } = await generateMeditationScript(mixedContext, generationDuration);
      const generatedPlaylist = await generateMeditationAudio(
        script,
        settings.voiceStyle || 'warm',
        (progress) => {
          setMeditationGenerationProgress(progress.ratio);
          const next = Math.max(0, startEnergyRatio * (1 - progress.ratio));
          setOrbEnergyRatio(next);
        }
      );
      const audioCount = generatedPlaylist.filter((seg) => seg.type === 'audio' && Boolean(seg.url)).length;
      if (audioCount === 0) {
        throw new Error('empty_playlist');
      }
      setMeditationGenerationProgress(1);
      onStartMeditation(mixedContext, script, generatedPlaylist, wordCount);
    } catch (err) {
      console.error('Failed to generate meditation by theme', err);
      const msg = String((err as any)?.message ?? err).toLowerCase();
      if (msg.includes('supabase_not_configured')) {
        setCurrentQuestion('Audio service is not configured. Please check app environment settings.');
      } else if (msg.includes('insufficient_word_count')) {
        setCurrentQuestion('Meditation script was too short. Please try again to generate a full-length script.');
      } else if (msg.includes('empty_playlist')) {
        setCurrentQuestion('Audio generation failed this time. Please try again.');
      } else {
        setCurrentQuestion('Meditation generation failed. Please try again shortly.');
      }
      setIsGeneratingMeditation(false);
      setMeditationGenerationProgress(0);
      setActiveThemeLabel('');
    }
  };

  const showEnergyLockedTip = () => {
    const scoreHint = latestReadinessScore !== null ? ` Readiness ${latestReadinessScore}%.` : '';
    const tip = roundsNeeded > 0
      ? `${roundsNeeded} more rounds to fully charge your meditation energy.`
      : 'Complete 1 more round to start your mindfulness meditation.';
    setEnergyTip(`${tip}${scoreHint}`);
    if (energyTipTimerRef.current !== null) {
      clearTimeout(energyTipTimerRef.current);
    }
    energyTipTimerRef.current = window.setTimeout(() => {
      setEnergyTip(null);
      energyTipTimerRef.current = null;
    }, 2200);
  };

  const handleMeditationButtonClick = () => {
    if (!canStartMeditation) {
      showEnergyLockedTip();
      return;
    }
    setShowThemePicker(true);
  };

  const handleStartRecording = async () => {
    if (inputMode !== 'voice') return;
    setIsRecording(true);
    
    // Always create a new recorder instance to capture the new context
    if (recorderRef.current) {
      recorderRef.current.stop();
    }
    const created = createVoiceRecorder();
    setVoiceMode(created.mode);
    if (!created.recorder) {
      setIsRecording(false);
      setMicTip(voiceUnavailableTip());
      setTimeout(() => setMicTip(null), 3000);
      return;
    }
    recorderRef.current = created.recorder;
    voiceDiscardCurrentRef.current = false;
    setSlideCancelArmed(false);
    
    const textBeforeRecording = '';
    latestTranscriptRef.current = '';

    recorderRef.current.onResult = (text, isLast, resultObj) => {
      if (voiceDiscardCurrentRef.current) return;
      if (text) {
        const merged = textBeforeRecording + text;
        latestTranscriptRef.current = merged;
        setInputText(merged);
      }
    };
    recorderRef.current.onVolume = (level) => {
      setVoiceLevel(level);
    };
    recorderRef.current.onError = async (err) => {
      console.error("iFlytek Error:", err);
      if (created.mode === 'iflytek' && hasWebSpeechRecognitionSupport()) {
        const fallback = createVoiceRecorder('web_speech');
        if (fallback.recorder) {
          recorderRef.current = fallback.recorder;
          setVoiceMode(fallback.mode);
          fallback.recorder.onResult = (text) => {
            if (voiceDiscardCurrentRef.current) return;
            if (text) {
              latestTranscriptRef.current = text;
              setInputText(text);
            }
          };
          fallback.recorder.onVolume = (level) => setVoiceLevel(level);
          fallback.recorder.onError = () => {
            setIsRecording(false);
            setVoiceLevel(0);
            setMicTip('Voice input failed. Please try text input.');
            setTimeout(() => setMicTip(null), 3000);
          };
          fallback.recorder.onClose = () => {
            setIsRecording(false);
            setVoiceLevel(0);
          };
          try {
            await fallback.recorder.start();
            setMicTip('Switched to web speech recognition.');
            setTimeout(() => setMicTip(null), 1800);
            return;
          } catch {}
        }
      }
      setIsRecording(false);
      voiceAutoSubmitRef.current = false;
      voiceDiscardCurrentRef.current = false;
      voicePressStartYRef.current = null;
      setSlideCancelArmed(false);
      setVoiceLevel(0);
    };
    recorderRef.current.onClose = () => {
      setIsRecording(false);
      setVoiceLevel(0);
      voicePressStartYRef.current = null;
      const canceledBySlide = voiceDiscardCurrentRef.current;
      voiceDiscardCurrentRef.current = false;
      setSlideCancelArmed(false);
      if (voiceAutoSubmitRef.current) {
        voiceAutoSubmitRef.current = false;
        const finalText = latestTranscriptRef.current.trim();
        if (finalText && !canceledBySlide) {
          submitAnswer(finalText);
        }
      }
    };
    
    // IMPORTANT for Android Webview / HBuilder: Ensure permission request works properly
    try {
      await recorderRef.current.start();
    } catch (e) {
      console.error("Failed to start recorder:", e);
      if (created.mode === 'iflytek' && hasWebSpeechRecognitionSupport()) {
        const fallback = createVoiceRecorder('web_speech');
        if (fallback.recorder) {
          recorderRef.current = fallback.recorder;
          setVoiceMode(fallback.mode);
          fallback.recorder.onResult = (text) => {
            if (voiceDiscardCurrentRef.current) return;
            if (text) {
              latestTranscriptRef.current = text;
              setInputText(text);
            }
          };
          fallback.recorder.onVolume = (level) => setVoiceLevel(level);
          fallback.recorder.onError = () => {
            setIsRecording(false);
            setVoiceLevel(0);
            setMicTip('Voice input failed. Please try text input.');
            setTimeout(() => setMicTip(null), 3000);
          };
          fallback.recorder.onClose = () => {
            setIsRecording(false);
            setVoiceLevel(0);
          };
          try {
            await fallback.recorder.start();
            setMicTip('Switched to web speech recognition.');
            setTimeout(() => setMicTip(null), 1800);
            return;
          } catch {}
        }
      }
      setIsRecording(false);
      setMicTip('Failed to start voice input. Please check microphone permission or voice settings.');
      setTimeout(() => setMicTip(null), 3000);
    }
  };

  const handleStopRecording = (shouldAutoSubmit: boolean) => {
    setIsRecording(false);
    setVoiceLevel(0);
    const canceledBySlide = voiceSlideCancelArmedRef.current;
    if (canceledBySlide) {
      voiceDiscardCurrentRef.current = true;
      latestTranscriptRef.current = '';
      setInputText('');
      setMicTip('Canceled');
      setTimeout(() => setMicTip(null), 1400);
    }
    if (recorderRef.current) {
      voiceAutoSubmitRef.current = voiceAutoSubmitRef.current || (shouldAutoSubmit && !canceledBySlide);
      recorderRef.current.stop();
    }
  };

  const handlePressStart = (e: any) => {
    e?.preventDefault?.();
    if (voicePressingRef.current) return;
    if (isLoadingQuestion) return;
    if (!voiceAvailable) {
      setMicTip(voiceUnavailableTip());
      setTimeout(() => setMicTip(null), 3000);
      return;
    }
    voicePressingRef.current = true;
    voicePressStartYRef.current = getClientY(e);
    setSlideCancelArmed(false);
    handleStartRecording();
  };

  const handlePressEnd = (shouldAutoSubmit: boolean) => {
    if (!voicePressingRef.current) return;
    voicePressingRef.current = false;
    if (isLoadingQuestion) return;
    handleStopRecording(shouldAutoSubmit);
  };

  const handleSubmit = async () => {
    submitAnswer(inputText);
  };

  const handleToggleInputMode = () => {
    if (isRecording) {
      handleStopRecording(false);
    }
    setInputText('');
    latestTranscriptRef.current = '';
    voicePressStartYRef.current = null;
    voiceDiscardCurrentRef.current = false;
    voicePressingRef.current = false;
    setSlideCancelArmed(false);
    setVoiceLevel(0);
    setInputMode((prev) => {
      const next = prev === 'voice' ? 'text' : 'voice';
      if (next === 'voice' && !voiceAvailable) {
        setMicTip(voiceUnavailableTip());
        setTimeout(() => setMicTip(null), 3000);
      }
      return next;
    });
  };

  const handleUndo = () => {
    if (lastAnswer && answers.length > 0) {
      setInputText(lastAnswer);
      setAnswers(answers.slice(0, -1));
      setRoundNumber(Math.max(1, roundNumber - 1));
      
      // Also restore the previous question from context if available
      if (context.length >= 2) {
        const prevQuestion = context[context.length - 2].replace("Assistant: ", "");
        setCurrentQuestion(prevQuestion);
      } else {
        setCurrentQuestion("How has your day been so far?");
      }
      
      setContext(context.slice(0, -2));
      setShowUndo(false);
      setLastAnswer('');
      if (answers.length <= 1) {
        setServerMeditationReady(false);
        setLatestReadinessScore(null);
      }
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && inputText.trim()) {
      handleSubmit();
    }
  };

  return (
    <div className="relative w-full h-screen overflow-hidden" style={{
      background: 'linear-gradient(135deg, var(--paper-1) 0%, var(--paper-2) 100%)',
      fontFamily: 'var(--font-sans)',
      transition: 'background 700ms ease, color 700ms ease'
    }}>
      <PixelLandscapeBackdrop theme={settings?.theme ?? 'warm'} hideDust={isQuestionStreaming} />

      {/* Settings access button */}
      <button
        onClick={onNavigateToSettings}
        className="absolute top-6 right-6 flex gap-1 p-2 z-10 opacity-40 hover:opacity-60 transition-opacity"
        aria-label="Settings"
        style={{
          background: 'var(--menu-pill-bg)',
          border: '1px solid var(--menu-pill-border)',
          borderRadius: 999
        }}
      >
        <div className="w-1 h-1 rounded-full bg-[var(--warm-grey)]" />
        <div className="w-1 h-1 rounded-full bg-[var(--warm-grey)]" />
        <div className="w-1 h-1 rounded-full bg-[var(--warm-grey)]" />
      </button>
      <div
        className="absolute top-4 left-2 w-16 h-16 rounded-full z-20 overflow-hidden"
        aria-label="chat energy orb"
        title={`Chat Energy ${displayEnergyPercent}%`}
        style={{
          background: 'linear-gradient(135deg, rgba(248, 242, 236, 0.42) 0%, rgba(214, 198, 186, 0.28) 100%)',
          border: '1px solid rgba(255, 209, 92, 0.44)',
          boxShadow: '0 8px 20px rgba(60,56,53,0.12), 0 0 18px rgba(255, 210, 95, 0.4), 0 0 36px rgba(255, 196, 64, 0.28), inset 0 1px 2px rgba(255,255,255,0.62)'
        }}
      >
        <div
          className="absolute -inset-[1px] rounded-full pointer-events-none"
          style={{
            border: '1px solid rgba(255, 214, 110, 0.58)',
            boxShadow: '0 0 10px rgba(255, 200, 70, 0.34)'
          }}
        />
        <motion.div
          className="absolute -inset-[2px] rounded-full pointer-events-none"
          style={{ border: '1px solid rgba(255, 224, 138, 0.42)' }}
          animate={{ opacity: [0.45, 0.78, 0.45], scale: [1, 1.045, 1] }}
          transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
        />
        {isGeneratingMeditation ? (
          <motion.div
            className="absolute -inset-[3px] rounded-full pointer-events-none"
            style={{
              border: '2px solid transparent',
              borderTopColor: 'rgba(255, 233, 168, 0.95)',
              borderRightColor: 'rgba(255, 216, 119, 0.7)',
              filter: 'drop-shadow(0 0 6px rgba(255, 208, 86, 0.62))'
            }}
            animate={{ rotate: 360 }}
            transition={{ duration: 0.9, repeat: Infinity, ease: 'linear' }}
          />
        ) : null}
        <div
          className="absolute inset-x-0 bottom-0"
          style={{
            height: `${displayEnergyPercent}%`,
            background: 'linear-gradient(180deg, rgba(255, 247, 199, 0.3) 0%, rgba(255, 219, 122, 0.38) 48%, rgba(255, 184, 54, 0.62) 100%)',
            transition: isGeneratingMeditation ? 'height 140ms linear' : 'height 500ms ease'
          }}
        />
        <motion.div
          className="absolute left-1/2 -translate-x-1/2 w-[82%] h-3 rounded-full"
          style={{ top: `${Math.max(4, 50 - Math.round(displayEnergyRatio * 40))}px`, background: 'rgba(255,255,255,0.28)' }}
          animate={{ x: ['-8%', '8%', '-8%'] }}
          transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut' }}
        />
        <div
          className="absolute inset-0 flex items-center justify-center text-[15px]"
          style={{ color: 'var(--charcoal)', fontWeight: 800, textShadow: '0 1px 1px rgba(255,255,255,0.45)' }}
        >
          {displayEnergyPercent}%
        </div>
      </div>
      <button
        onClick={handleMeditationButtonClick}
        className="absolute top-26 right-4 h-21 w-21 rounded-2xl flex flex-col items-center justify-center z-20 px-2 gap-1"
        aria-label="Start meditation"
        title="Start meditation"
        style={{
          color: 'var(--menu-pill-active-bg)',
          background: 'linear-gradient(145deg, var(--menu-surface-strong) 0%, var(--menu-surface) 100%)',
          border: '1px solid var(--menu-border-soft)',
          backdropFilter: 'blur(12px)',
          boxShadow: 'var(--menu-card-shadow)'
        }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ opacity: 0.85 }}>
          <path d="M12 6c1.6 0 2.9-1.3 2.9-2.9C13.3 3.6 12 4.7 12 6Z" fill="currentColor" />
          <path d="M8 10.5c0-2.3 1.9-4.2 4.2-4.2S16.5 8.2 16.5 10.5c0 2.5-2 4.4-4.4 4.4S8 13 8 10.5Z" stroke="currentColor" strokeWidth="1.5" />
          <path d="M4 17.5c2.2-1.4 4.8-2.1 8-2.1s5.8.7 8 2.1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        <span className="text-[10px] leading-[1.05] text-center" style={{ fontWeight: 700, opacity: 0.9, letterSpacing: '0.06em' }}>
          MEDITA
          <br />
          TION
        </span>
      </button>
      <AnimatePresence>
        {energyTip ? (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            className="absolute left-1/2 top-[15.8vh] -translate-x-1/2 z-30 px-3 py-1.5 rounded-full text-[11px] whitespace-nowrap"
            style={{
              color: 'var(--terracotta)',
              background: 'rgba(255,255,255,0.3)',
              border: '1px solid rgba(194,123,108,0.22)',
              backdropFilter: 'blur(8px)',
              boxShadow: '0 10px 18px rgba(60,56,53,0.12)'
            }}
          >
            {energyTip}
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* Clean Standard Interaction Unit */}
      <div className="absolute inset-0 pointer-events-none">
        {/* Mascot block */}
        <div className="absolute left-1/2 top-[14vh] -translate-x-1/2 flex flex-col items-center">
          <motion.div
            className="w-[440px] h-[440px] flex items-center justify-center relative"
            animate={{ y: [0, -1.5, 0], scale: [1, 1.02, 1] }}
            transition={{ duration: 4.8, repeat: Infinity, ease: 'easeInOut' }}
          >
            <svg width="440" height="440" viewBox="0 0 100 100" fill="none">
              <PixelMascot styleId={mascotStyle} isQuestionStreaming={isQuestionStreaming} />
            </svg>
          </motion.div>

          <div className="mt-1 h-4">
            <AnimatePresence>
              {stepCounter && !isLoadingQuestion && !isGeneratingMeditation && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 0.4 }}
                  exit={{ opacity: 0 }}
                  className="text-[12px]"
                  style={{ color: 'var(--warm-grey)' }}
                >
                  Round {roundNumber}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Question block: hard-anchored under mascot to avoid jump */}
        <div className="absolute left-1/2 top-[60vh] -translate-x-1/2 w-[340px] max-w-[calc(100%-3rem)]">
          <div className="relative w-full min-h-[88px]">
            <AnimatePresence mode="wait" initial={false}>
              {isLoadingQuestion ? (
                <motion.div
                  key="loading"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="w-full h-full flex items-start justify-center"
                >
                  <p className="text-[15px] opacity-30 italic tracking-wider" style={{ color: 'var(--charcoal)' }}>I'm listening...</p>
                </motion.div>
              ) : (
                <motion.div
                  key={currentQuestion}
                  initial={false}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.22 }}
                  className="w-full h-full flex items-start justify-center px-2"
                >
                  <p
                    className="max-w-[92%] text-[17px] leading-[1.55] tracking-[0.12em] text-center"
                    style={{
                      color: 'var(--charcoal)',
                      opacity: 0.84,
                      fontFamily: 'var(--font-sans)',
                      fontWeight: 600,
                      textShadow: '0 2px 8px rgba(0,0,0,0.14)'
                    }}
                  >
                    {displayedQuestion}
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {isGeneratingMeditation ? (
        <div
          className="absolute top-20 left-1/2 -translate-x-1/2 z-20 w-[110px] px-2 py-2 rounded-2xl"
          style={{
            background: 'rgba(255,255,255,0.38)',
            border: '1px solid rgba(194,123,108,0.32)',
            backdropFilter: 'blur(8px)',
            boxShadow: '0 10px 18px rgba(60,56,53,0.1)'
          }}
        >
          <div
            className="text-center text-[10px] tracking-[0.08em]"
            style={{ color: 'var(--terracotta)', fontWeight: 700 }}
          >
            Generating
          </div>
          <div
            className="mt-1 h-[6px] w-full rounded-full overflow-hidden"
            style={{ background: 'rgba(194,123,108,0.2)' }}
          >
            <motion.div
              className="h-full rounded-full"
              style={{
                background: 'linear-gradient(90deg, rgba(255,196,124,0.95) 0%, rgba(194,123,108,0.92) 100%)'
              }}
              animate={{ width: `${Math.max(4, Math.round(meditationGenerationProgress * 100))}%` }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
            />
          </div>
        </div>
      ) : null}

      <AnimatePresence>
        {showThemePicker ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-40 bg-black/25 backdrop-blur-[2px] flex items-end justify-center p-4"
            onClick={() => setShowThemePicker(false)}
          >
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 20, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="w-full max-w-[360px] rounded-2xl p-4"
              style={{ background: 'rgba(255,255,255,0.52)', border: '1px solid rgba(194,123,108,0.2)', backdropFilter: 'blur(12px)' }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="text-[15px]" style={{ color: 'var(--charcoal)', fontWeight: 700 }}>Choose a meditation theme</div>
              <div className="text-[11px] mb-3 mt-1" style={{ color: 'var(--warm-grey)' }}>We will generate a personalized meditation based on your current conversation</div>
              <div className="grid grid-cols-2 gap-2">
                {MEDITATION_THEMES.map((theme) => (
                  <button
                    key={theme.id}
                    onClick={() => void handleGenerateMeditationByTheme(theme.id)}
                    className="text-left rounded-xl px-3 py-2.5"
                    style={{ background: 'rgba(248,242,236,0.48)', border: '1px solid rgba(194,123,108,0.22)', backdropFilter: 'blur(8px)' }}
                  >
                    <div className="text-[14px]" style={{ color: 'var(--charcoal)', fontWeight: 650 }}>{theme.label}</div>
                    <div className="text-[12px] mt-0.5" style={{ color: 'var(--warm-grey)' }}>{theme.hint}</div>
                  </button>
                ))}
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* Input Area */}
      <div className="absolute left-1/2 top-[80.5%] -translate-x-1/2 w-[304px]">
        <AnimatePresence mode="wait">
          <motion.div
            key="input"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            transition={{ duration: 0.5 }}
            className="relative"
          >
              {inputMode === 'voice' && isRecording ? (
                <div
                  className="absolute left-1/2 -translate-x-1/2 -top-14 w-[260px] px-3 py-2 rounded-2xl text-center pointer-events-none"
                  style={{
                    color: 'var(--ink-90)',
                    background: 'rgba(255, 255, 255, 0.22)',
                    border: '1px solid rgba(194, 123, 108, 0.24)',
                    backdropFilter: 'blur(10px)',
                    boxShadow: '0 6px 18px rgba(60, 56, 53, 0.1)'
                  }}
                >
                  <div
                    className="text-[13px] leading-[1.35] min-h-[18px]"
                    style={{ fontFamily: 'var(--font-handwriting)', opacity: 0.9 }}
                  >
                    {voiceSlideCancelArmed ? 'Release to cancel' : (inputText.trim() || 'Listening...')}
                  </div>
                  <div className="text-[11px] mt-1" style={{ opacity: 0.68 }}>
                    {voiceSlideCancelArmed ? 'This voice message will not be sent' : 'Slide up to cancel'}
                  </div>
                </div>
              ) : null}

              <div
                className="relative h-[52px] w-full rounded-full flex items-center overflow-hidden"
                style={{
                  background: 'linear-gradient(135deg, rgba(255, 250, 246, 0.62) 0%, rgba(246, 238, 232, 0.48) 100%)',
                  backdropFilter: 'blur(20px)',
                  border: '1px solid rgba(194, 123, 108, 0.18)',
                  boxShadow: '0 6px 18px rgba(60, 56, 53, 0.09), inset 0 1px 2px rgba(255, 255, 255, 0.55)'
                }}
              >
                <button
                  onClick={handleToggleInputMode}
                  className="absolute left-1 top-1 w-10 h-10 rounded-full flex items-center justify-center z-10"
                  aria-label={inputMode === 'voice' ? 'Switch to keyboard input' : 'Switch to voice input'}
                  style={{
                    color: 'var(--warm-grey)',
                    background: 'rgba(255,255,255,0.34)',
                    border: '1px solid rgba(194,123,108,0.16)'
                  }}
                >
                  {inputMode === 'voice' ? (
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                      <path d="M4 5h16v14H4V5z" stroke="currentColor" strokeWidth="1.6" />
                      <path d="M7 9h10M7 12h10M7 15h6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                    </svg>
                  ) : (
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                      <path d="M12 14a3 3 0 0 0 3-3V7a3 3 0 0 0-6 0v4a3 3 0 0 0 3 3Z" stroke="currentColor" strokeWidth="1.6" />
                      <path d="M19 11a7 7 0 0 1-14 0" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                      <path d="M12 18v3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                    </svg>
                  )}
                </button>

                {inputMode === 'voice' ? (
                  <button
                    onPointerDown={handlePressStart}
                    onPointerUp={() => handlePressEnd(true)}
                    onPointerCancel={() => handlePressEnd(false)}
                    onTouchStart={handlePressStart}
                    onTouchEnd={() => handlePressEnd(true)}
                    onTouchCancel={() => handlePressEnd(false)}
                    onMouseDown={handlePressStart}
                    onMouseUp={() => handlePressEnd(true)}
                    className="relative h-[52px] w-full flex items-center justify-center select-none touch-none"
                    aria-label="Hold to talk"
                    style={{ color: 'var(--charcoal)', opacity: voiceAvailable ? 1 : 0.5 }}
                    disabled={!voiceAvailable}
                  >
                    {isRecording ? (
                      <div className="absolute left-1/2 top-0 -translate-x-1/2 w-1/2 h-full flex items-center justify-center pointer-events-none">
                        <div
                          className="w-full h-full py-2 flex items-center justify-between"
                          style={{
                            filter: 'drop-shadow(0 10px 18px rgba(194, 123, 108, 0.28)) drop-shadow(0 2px 6px rgba(212, 175, 106, 0.18))'
                          }}
                        >
                          {([0.65, 1.05, 0.8, 1.2, 0.7, 1.0, 0.78, 1.15, 0.85, 1.1, 0.74, 1.25, 0.9, 1.05] as const).map((m, i) => {
                            const level = Math.pow(Math.min(1, voiceLevel), 0.6);
                            const v = Math.min(2.8, Math.max(0.22, 0.22 + level * m * 2.1));
                            const opacity = 0.75 + Math.min(0.25, level * 0.35);
                            return (
                              <motion.div
                                key={i}
                                className="h-full rounded-full"
                                style={{
                                  width: '7px',
                                  background: 'linear-gradient(180deg, rgba(212, 175, 106, 0.95) 0%, var(--terracotta) 55%, rgba(194, 123, 108, 0.9) 100%)',
                                  opacity,
                                  transformOrigin: '50% 50%',
                                  boxShadow: '0 0 0.5px rgba(0,0,0,0.08), inset 0 0 0.5px rgba(255,255,255,0.55)'
                                }}
                                animate={{
                                  scaleY: v,
                                  scaleX: 0.92 + Math.min(0.18, level * 0.22)
                                }}
                                transition={{ duration: 0.1, ease: 'linear' }}
                              />
                            );
                          })}
                        </div>
                      </div>
                    ) : (
                      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none">
                        <span className="text-[17px]" style={{ fontFamily: 'var(--font-sans)', fontWeight: 560, letterSpacing: '0.01em' }}>
                          {voiceAvailable ? 'Hold to talk' : 'Voice unavailable'}
                        </span>
                      </div>
                    )}
                  </button>
                ) : (
                  <div className="w-full h-[52px] flex items-center">
                    <div className="flex-1 pl-14 pr-16">
                      <input
                        ref={inputRef}
                        type="text"
                        value={inputText}
                        onChange={(e) => setInputText(e.target.value)}
                        onKeyPress={handleKeyPress}
                        placeholder="Type your message..."
                        className="w-full bg-transparent outline-none border-none text-[15px]"
                        style={{
                          fontFamily: 'var(--font-handwriting)',
                          color: 'var(--ink-90)'
                        }}
                      />
                    </div>
                    <button
                      onClick={handleSubmit}
                      className="absolute right-1 top-1 w-10 h-10 rounded-full flex items-center justify-center disabled:opacity-40"
                      aria-label="Send"
                      disabled={!inputText.trim()}
                      style={{
                        color: 'var(--terracotta)',
                        background: 'rgba(255,255,255,0.36)',
                        border: '1px solid rgba(194,123,108,0.16)'
                      }}
                    >
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                        <path d="M4 12l16-8-6 16-2.5-6L4 12Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
                      </svg>
                    </button>
                  </div>
                )}
              </div>

              {micTip ? (
                <div className="mt-3 text-center" style={{ color: 'var(--warm-grey)', fontSize: 12 }}>
                  {micTip}
                </div>
              ) : null}

              {/* Character counter dots */}
              <div className="flex gap-2 justify-end mt-4 pr-2">
                {[0, 1, 2, 3, 4].map((index) => (
                  <div
                    key={index}
                    className="w-1.5 h-1.5 rounded-full transition-all duration-300"
                    style={{
                      background: filledDots > index ? 'var(--terracotta)' : 'var(--warm-grey-30)',
                      opacity: filledDots > index ? 0.8 : 0.4
                    }}
                  />
                ))}
              </div>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Undo button */}
      <AnimatePresence>
        {showUndo && !isGeneratingMeditation && (
          <motion.button
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            onClick={handleUndo}
            className="absolute left-1/2 -translate-x-1/2 bottom-16 text-[13px]"
            style={{
              fontFamily: 'var(--font-serif)',
              fontStyle: 'italic',
              color: 'var(--warm-grey)'
            }}
          >
            Undo
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}
