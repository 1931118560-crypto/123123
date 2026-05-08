import { ensureAnonymousSession } from './auth';
import { supabase } from './supabase';

const NEXT_QUESTION_TIMEOUT_MS = 20000;

export type QuestionGuidance = {
  missingDimensions?: string[];
  collectedDimensions?: string[];
  userWantsToStop?: boolean;
  shortAnswerStreak?: number;
};

export type NextQuestionResult = {
  question: string;
  shouldStartMeditation: boolean;
  stopReason?: string;
  readinessScore: number;
  readiness?: {
    coverage: number;
    depth: number;
    actionability: number;
    consistency: number;
    fatiguePenalty: number;
  };
  coveredDimensions?: string[];
  missingDimensions?: string[];
};

export type MeditationScriptResult = {
  script: string;
  wordCount: number;
};

function countEnglishWords(text: string) {
  return (text.match(/[A-Za-z]+(?:'[A-Za-z]+)*/g) ?? []).length;
}

export async function generateNextQuestion(
  conversationContext: string[],
  roundNumber: number,
  guidance?: QuestionGuidance
): Promise<NextQuestionResult> {
  if (!supabase) throw new Error('supabase not configured');
  await ensureAnonymousSession();
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error('deepseek_timeout')), NEXT_QUESTION_TIMEOUT_MS);
  });
  const invokePromise = supabase.functions.invoke('deepseek', {
    body: { mode: 'next_question', conversationContext, roundNumber, strategy: 'trust_based_profile', guidance }
  });
  let result: any;
  try {
    result = await Promise.race([invokePromise, timeoutPromise]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
  const { data, error } = result as any;
  if (error) throw error;
  const question = String((data as any)?.question ?? '').trim();
  const shouldStartMeditation = Boolean((data as any)?.shouldStartMeditation);
  if (!question && !shouldStartMeditation) throw new Error('empty question');
  return {
    question,
    shouldStartMeditation,
    stopReason: String((data as any)?.stopReason ?? ''),
    readinessScore: Number((data as any)?.readinessScore ?? 0),
    readiness: (data as any)?.readiness,
    coveredDimensions: Array.isArray((data as any)?.coveredDimensions) ? (data as any).coveredDimensions.map(String) : [],
    missingDimensions: Array.isArray((data as any)?.missingDimensions) ? (data as any).missingDimensions.map(String) : []
  };
}

export async function generateMeditationScript(
  conversationContext: string[],
  durationSeconds: number
): Promise<MeditationScriptResult> {
  if (!supabase) throw new Error('supabase_not_configured');
  await ensureAnonymousSession();
  const { data, error } = await supabase.functions.invoke('deepseek', {
    body: { mode: 'meditation_script', conversationContext, durationSeconds }
  });
  if (error) throw error;
  const script = String((data as any)?.script ?? '').trim();
  if (!script) throw new Error('empty_script');
  const upstreamWordCount = Number((data as any)?.meta?.actualWordCount ?? 0);
  return {
    script,
    wordCount: Number.isFinite(upstreamWordCount) && upstreamWordCount > 0 ? upstreamWordCount : countEnglishWords(script)
  };
}
