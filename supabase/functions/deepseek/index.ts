import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

function corsHeaders() {
  return {
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
    'access-control-allow-methods': 'POST, OPTIONS'
  };
}

async function requireUser(req: Request) {
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const auth = req.headers.get('authorization') ?? '';
  if (!supabaseUrl || !anonKey || !auth) return null;
  const supabase = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: auth } } });
  const { data } = await supabase.auth.getUser();
  return data.user ?? null;
}

const API_URL = 'https://api.deepseek.com/chat/completions';

const SYSTEM_PROMPT = `You are MindPlan, a warm and emotionally attuned mindfulness companion.

Your first priority is emotional safety, not data collection speed.

Response format for each turn:
- Prefer 1 short empathy sentence.
- Add a very short low-pressure invitation only if needed.
- Keep it compact: max 18 words and max 110 characters total.

Key rules:
1) Prioritize emotional resonance before exploration. Reflect feelings like sadness, exhaustion, fear, loneliness, or overwhelm when present.
2) Avoid interrogation style. Never ask multiple deep follow-up questions in one turn.
3) Keep prompts soft and optional, such as:
   - "If it feels okay, what feels heaviest right now?"
   - "We can go slowly. What part feels most present for you?"
   - Avoid long compound sentences.
4) Do not suggest starting meditation. Stay with supportive conversation and light exploration.
5) Ask only real-life grounded content; avoid mystical, spiritual, or abstract energy language.
6) Keep body-sensation prompts low-frequency and optional; only use when the user mentioned discomfort.
7) Avoid repeating the same opening line or rigid templates; vary wording naturally while staying calm and kind.`;

type QuestionGuidance = {
  missingDimensions?: string[];
  collectedDimensions?: string[];
  userWantsToStop?: boolean;
  shortAnswerStreak?: number;
};

function buildQuestionPlannerPrompt(guidance?: QuestionGuidance) {
  if (!guidance) return '';
  const dimLabel: Record<string, string> = {
    recent_event: 'recent concrete events',
    work_stress: 'work or study stress',
    relationship: 'relationship pressure',
    body_signal: 'body tension or discomfort',
    sleep_energy: 'sleep and energy',
    emotion_thought: 'emotion and recurring thoughts',
    expectation: 'desired relief and expectations'
  };
  const missing = Array.isArray(guidance.missingDimensions) ? guidance.missingDimensions : [];
  const collected = Array.isArray(guidance.collectedDimensions) ? guidance.collectedDimensions : [];
  const missingWithoutBody = missing.filter((x) => x !== 'body_signal');
  const missingCn = missing.map((x) => dimLabel[x] ?? x);
  const collectedCn = collected.map((x) => dimLabel[x] ?? x);
  return `Before writing the next reply, plan briefly:
- Covered dimensions: ${collectedCn.join(', ') || 'none'}
- Missing dimensions: ${missingCn.join(', ') || 'none'}
- Hard rule: the next turn should softly touch at least one missing dimension (prioritize life dimensions: ${missingWithoutBody.map((x) => dimLabel[x] ?? x).join(', ') || 'none'}), and avoid repeating already covered dimensions.
- Body rule: body_signal is optional and not a priority; do not ask body-location questions unless the user recently mentioned physical discomfort.
- Tone rule: first empathy, then gentle invitation; natural spoken style; one small focus only; no meditation suggestion; avoid interrogation pressure.`;
}

function hasRecentBodyComplaint(conversationContext: string[]) {
  const userMessages = extractUserMessages(conversationContext);
  const latest = userMessages.slice(-2).join(' ');
  return /(pain|ache|tight|tension|discomfort|dizzy|chest|stomach|headache|neck|shoulder|breath|breathing|hard to breathe|nausea|fatigue|sore|疼|痛|不适|紧绷|胸闷|头痛|胃痛|肩颈|心慌|呼吸困难|腰酸|身体|难受)/i.test(latest);
}

function buildMessages(conversationContext: string[], roundNumber: number, guidance?: QuestionGuidance) {
  const messages: Array<{ role: string; content: string }> = [{ role: 'system', content: SYSTEM_PROMPT }];
  const userMessages = extractUserMessages(conversationContext);
  const latestUser = userMessages[userMessages.length - 1] ?? '';
  const latestAssistant = [...conversationContext]
    .reverse()
    .find((msg) => msg.startsWith('Assistant: '))
    ?.replace('Assistant: ', '')
    .trim() ?? '';
  if (roundNumber <= 1 || userMessages.length === 0) {
    messages.push({
      role: 'system',
      content: 'This is the first question turn. Ask exactly: "How has your day been so far?"'
    });
  } else {
    messages.push({
      role: 'system',
      content: 'This is NOT the first turn. Never repeat "How has your day been so far?". Start with one empathic reflection, then one gentle invitation grounded in the latest user message.'
    });
    if (latestAssistant) {
      messages.push({
        role: 'system',
        content: `Do not repeat this previous assistant wording: "${latestAssistant}".`
      });
    }
    if (latestUser) {
      messages.push({
        role: 'system',
        content: `Latest user message to follow up on: "${latestUser}".`
      });
    }
  }
  if (!hasRecentBodyComplaint(conversationContext)) {
    messages.push({
      role: 'system',
      content: 'Additional constraint: the user did not recently mention physical discomfort. In this turn, stay with emotions/life context/relationships/stress/sleep/expectations; avoid body-sensation prompts.'
    });
  }
  const planner = buildQuestionPlannerPrompt(guidance);
  if (planner) messages.push({ role: 'system', content: planner });
  for (const msg of conversationContext) {
    if (msg.startsWith('Assistant: ')) messages.push({ role: 'assistant', content: msg.replace('Assistant: ', '') });
    else if (msg.startsWith('User: ')) messages.push({ role: 'user', content: msg.replace('User: ', '') });
  }
  return messages;
}

function normalizeAssistantTurn(raw: string) {
  const text = raw.replace(/\n+/g, ' ').trim().replace(/^["'“”]|["'“”]$/g, '');
  if (!text) return '';
  const wordCount = (s: string) => (s.match(/[A-Za-z0-9']+/g) ?? []).length;
  const segments = text
    .split(/(?<=[.!?。！？])\s+/)
    .map((x) => x.trim())
    .filter(Boolean);
  const first = segments[0] ?? '';
  if (!first) return '';
  let merged = first;
  const second = segments[1] ?? '';
  // Keep second sentence only when both are very short.
  if (second) {
    const combined = `${first} ${second}`.trim();
    if (wordCount(first) <= 11 && wordCount(second) <= 7 && wordCount(combined) <= 18 && combined.length <= 110) {
      merged = combined;
    }
  }
  if (wordCount(merged) > 18) {
    const words = (merged.match(/[A-Za-z0-9']+|[^A-Za-z0-9'\s]+/g) ?? []);
    let out = '';
    let wc = 0;
    for (const token of words) {
      const isWord = /[A-Za-z0-9']+/.test(token);
      if (isWord && wc >= 18) break;
      out += (out && /[A-Za-z0-9']+/.test(token) ? ' ' : '') + token;
      if (isWord) wc += 1;
    }
    merged = out.trim();
  }
  if (merged.length > 110) merged = `${merged.slice(0, 109).trimEnd()}…`;
  return merged;
}

async function rewriteToSupportiveTurn(raw: string, apiKey: string) {
  const messages = [
    {
      role: 'system',
      content: 'You rewrite text into a supportive English reply: one empathy sentence + one gentle open invitation. Keep it brief and natural.'
    },
    {
      role: 'user',
      content: `Rewrite the text below into 1-2 short English sentences. Sentence 1 acknowledges emotion. Sentence 2 is a low-pressure open invitation. No meditation suggestion:\n${raw}`
    }
  ];
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: 'deepseek-chat', messages, max_tokens: 80, temperature: 0.2 })
  });
  const data = await response.json().catch(() => null);
  const content = String(data?.choices?.[0]?.message?.content ?? '').trim();
  if (!response.ok || !content) return '';
  return normalizeAssistantTurn(content);
}

async function requestNextQuestion(messages: Array<{ role: string; content: string }>, apiKey: string) {
  const temps = [0.7, 0.4];
  let lastData: any = null;
  for (const temperature of temps) {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model: 'deepseek-chat', messages, max_tokens: 120, temperature })
    });
    const data = await response.json().catch(() => null);
    lastData = data;
    const content = data?.choices?.[0]?.message?.content;
    if (response.ok && content) {
      const normalized = normalizeAssistantTurn(String(content));
      if (normalized) return { question: normalized, data: lastData };
      const rewritten = await rewriteToSupportiveTurn(String(content), apiKey);
      if (rewritten) return { question: rewritten, data: lastData };
    }
  }
  return { question: '', data: lastData };
}

const DIMENSION_KEYWORDS: Record<string, string[]> = {
  recent_event: ['today', 'recently', 'just now', 'happened', 'event', 'deadline', 'project', 'overtime', '今天', '最近', '刚刚', '发生', '事情'],
  work_stress: ['boss', 'work', 'study', 'coworker', 'meeting', 'client', 'task', 'pressure', '老板', '工作', '同事', '开会', '客户', '任务', '压力'],
  relationship: ['family', 'partner', 'parents', 'child', 'friend', 'relationship', 'conflict', 'argument', '家人', '伴侣', '父母', '孩子', '朋友', '关系', '冲突', '争吵'],
  body_signal: ['shoulder', 'neck', 'chest', 'stomach', 'headache', 'tight', 'pain', 'dizzy', 'breath', '肩', '脖子', '胸口', '胃', '头痛', '紧', '痛', '呼吸'],
  sleep_energy: ['sleep', 'insomnia', 'awake', 'tired', 'fatigue', 'energy', 'late night', '睡', '失眠', '醒', '困', '疲惫', '没精神', '熬夜'],
  emotion_thought: ['anxious', 'anxiety', 'worried', 'irritated', 'sad', 'afraid', 'guilty', 'overthinking', '焦虑', '担心', '烦', '委屈', '害怕', '内疚', '停不下来'],
  expectation: ['hope', 'want', 'relief', 'relax', 'improve', 'better', 'expect', 'need', '希望', '想要', '缓解', '放松', '改善', '变好', '期待', '需要']
};

function inferCoveredDimensions(conversationContext: string[]) {
  const userText = extractUserMessages(conversationContext).join(' ').toLowerCase();
  return Object.keys(DIMENSION_KEYWORDS).filter((dim) =>
    DIMENSION_KEYWORDS[dim].some((k) => userText.includes(k))
  );
}

function computeDepthScore(conversationContext: string[]) {
  const userMessages = extractUserMessages(conversationContext);
  if (userMessages.length === 0) return 0;
  const joined = userMessages.join(' ');
  const avgLen = userMessages.reduce((s, x) => s + x.length, 0) / userMessages.length;
  const detailSignals = ['今天', '昨天', '早上', '下午', '晚上', '老板', '同事', '家人', '孩子', '肩', '胸', '胃', '睡', '失眠'];
  const hits = detailSignals.filter((x) => joined.includes(x)).length;
  return Math.min(100, Math.round((avgLen / 18) * 40 + hits * 6));
}

function computeConsistencyScore(conversationContext: string[]) {
  const joined = extractUserMessages(conversationContext).join(' ');
  let score = 90;
  if (joined.includes('睡得很好') && joined.includes('睡不好')) score -= 20;
  if (joined.includes('完全不焦虑') && joined.includes('很焦虑')) score -= 15;
  return Math.max(50, Math.min(100, score));
}

function evaluateReadiness(conversationContext: string[], guidance?: QuestionGuidance) {
  const covered = inferCoveredDimensions(conversationContext);
  // body_signal is optional; do not force asking body-related questions just for coverage.
  const allDimensions = Object.keys(DIMENSION_KEYWORDS).filter((d) => d !== 'body_signal');
  const missingDimensions = allDimensions.filter((d) => !covered.includes(d));
  const coveredRequired = covered.filter((d) => d !== 'body_signal');
  const coverage = Math.round((coveredRequired.length / allDimensions.length) * 100);
  const depth = computeDepthScore(conversationContext);
  const hasGoal = covered.includes('expectation');
  const hasEmotion = covered.includes('emotion_thought');
  const hasWork = covered.includes('work_stress') || covered.includes('recent_event');
  const actionability = Math.min(100, 40 + (hasGoal ? 25 : 0) + (hasEmotion ? 20 : 0) + (hasWork ? 15 : 0));
  const consistency = computeConsistencyScore(conversationContext);
  const shortStreak = Number(guidance?.shortAnswerStreak ?? 0);
  const fatiguePenalty = Math.min(20, shortStreak * 5 + (guidance?.userWantsToStop ? 8 : 0));
  const readinessScore = Math.max(
    0,
    Math.round(0.35 * coverage + 0.3 * depth + 0.2 * actionability + 0.15 * consistency - fatiguePenalty)
  );
  const passHardGate = coverage >= 85 && depth >= 65 && actionability >= 70;
  const shouldStartMeditation =
    Boolean(guidance?.userWantsToStop) ||
    (readinessScore >= 78 && passHardGate) ||
    (fatiguePenalty >= 16 && readinessScore >= 70);
  const stopReason = guidance?.userWantsToStop
    ? 'user_requested_stop'
    : readinessScore >= 78 && passHardGate
      ? 'readiness_threshold_reached'
      : fatiguePenalty >= 16 && readinessScore >= 70
        ? 'high_fatigue_with_enough_context'
        : 'need_more_context';
  return {
    shouldStartMeditation,
    stopReason,
    readinessScore,
    readiness: { coverage, depth, actionability, consistency, fatiguePenalty },
    coveredDimensions: covered,
    missingDimensions
  };
}

type PersonalizationProfile = {
  summary: string;
  coreEmotion: string;
  coreStress: string;
  bodySignal: string;
  sleepStatus: string;
  keyPeople: string;
  desiredRelief: string;
  directQuotes: string[];
};

function extractUserMessages(conversationContext: string[]) {
  return conversationContext
    .filter((msg) => msg.startsWith('User: '))
    .map((msg) => msg.replace('User: ', '').trim())
    .filter(Boolean);
}

function fallbackProfile(conversationContext: string[]): PersonalizationProfile {
  const userMessages = extractUserMessages(conversationContext);
  const joined = userMessages.join('；');
  const quotes = userMessages
    .slice(-4)
    .map((s) => s.slice(0, 28))
    .filter(Boolean);
  return {
    summary: joined || 'The user is under real-life pressure and wants emotional steadiness and relief.',
    coreEmotion: 'anxious and tired',
    coreStress: joined.slice(0, 60) || 'high real-life pressure',
    bodySignal: 'tightness in chest, shoulders, or abdomen',
    sleepStatus: 'sleep quality is unstable',
    keyPeople: 'stress involving work or family relationships',
    desiredRelief: 'to feel calmer and regain a small sense of control',
    directQuotes: quotes.length > 0 ? quotes : ['I have been under a lot of pressure lately', 'My mind will not slow down']
  };
}

function safeParseJsonObject(text: string): any | null {
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

async function buildPersonalizationProfile(conversationContext: string[], apiKey: string): Promise<PersonalizationProfile> {
  const fallback = fallbackProfile(conversationContext);
  const userMessages = extractUserMessages(conversationContext);
  if (userMessages.length === 0) return fallback;

  const prompt = `Extract a meditation personalization profile from the conversation below.
Output valid JSON only, no explanation.

JSON schema:
{
  "summary": "one-sentence summary of the current situation",
  "coreEmotion": "primary emotion",
  "coreStress": "most concrete real-life stressor",
  "bodySignal": "mentioned or inferred body tension signal",
  "sleepStatus": "sleep status",
  "keyPeople": "key people involved",
  "desiredRelief": "what relief the user most wants",
  "directQuotes": ["short user quote 1", "short user quote 2", "short user quote 3"]
}

Requirements:
1) Prefer user wording and do not fabricate concrete facts.
2) directQuotes must contain 2 to 4 items.
3) If something is missing, use "not explicitly mentioned".
4) Keep all fields in English.

Conversation:
${conversationContext.join('\n')}`;

  const response = await fetch(API_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: 'You extract psychotherapy-style intake signals and output valid JSON only in English.' },
        { role: 'user', content: prompt }
      ],
      max_tokens: 500,
      temperature: 0.2
    })
  });

  const data = await response.json().catch(() => null);
  const content = String(data?.choices?.[0]?.message?.content ?? '').trim();
  const parsed = safeParseJsonObject(content);
  if (!response.ok || !parsed) return fallback;

  const quotes = Array.isArray(parsed.directQuotes) ? parsed.directQuotes.map((x: any) => String(x).trim()).filter(Boolean).slice(0, 4) : [];
  return {
    summary: String(parsed.summary ?? fallback.summary),
    coreEmotion: String(parsed.coreEmotion ?? fallback.coreEmotion),
    coreStress: String(parsed.coreStress ?? fallback.coreStress),
    bodySignal: String(parsed.bodySignal ?? fallback.bodySignal),
    sleepStatus: String(parsed.sleepStatus ?? fallback.sleepStatus),
    keyPeople: String(parsed.keyPeople ?? fallback.keyPeople),
    desiredRelief: String(parsed.desiredRelief ?? fallback.desiredRelief),
    directQuotes: quotes.length > 0 ? quotes : fallback.directQuotes
  };
}

function buildMeditationPrompt(
  conversationContext: string[],
  durationSeconds: number,
  profile: PersonalizationProfile,
  lengthRuleText: string,
  minWordCount: number,
  maxWordCount: number
) {
  const minutes = Math.max(1, Math.round(durationSeconds / 60));
  const targetChars = Math.round((minutes / 5) * 800);
  const minChars = Math.round(targetChars * 0.95);
  const maxChars = Math.round(targetChars * 1.05);

  return `You are a senior MBCT/MBSR mindfulness guide writing a personalized guided meditation script.

Hard constraints:
1) Output English only. Never output Chinese.
2) Total session length target: about ${minutes} minutes (spoken text + pauses).
3) Pause ratio must be 25%~35% using [p:X].
4) Spoken text length (excluding [p:X]) must be ${minChars}~${maxChars} characters.
5) Spoken text must contain ${minWordCount}~${maxWordCount} English words.
6) Strong length command: ${lengthRuleText}.
7) Keep this highly personalized to the user's real situation; no generic template language.
8) Include at least 4 concrete references to the profile (stress, emotion, body, sleep, relationships).
9) Include at least 2 paraphrased echoes of user wording.
10) Do not add explanations or labels; output script text only.
11) Start exactly with: "Now, find a comfortable position... let's begin.[p:5]"
12) End exactly with: "Bring this awareness back to the present.[p:10] When you feel ready, gently open your eyes.[p:15]"

Style and flow:
- Warm, grounded, non-judgmental, practical.
- Each arc should follow: current life context -> body/breath anchor -> one actionable micro-step.
- Use short, natural spoken lines. Avoid mystical language.
- Prioritize breath, body scan, and open awareness in a smooth structure.

User profile:
- Summary: ${profile.summary}
- Core emotion: ${profile.coreEmotion}
- Core stress: ${profile.coreStress}
- Body signal: ${profile.bodySignal}
- Sleep status: ${profile.sleepStatus}
- Key people: ${profile.keyPeople}
- Desired relief: ${profile.desiredRelief}
- Direct quotes: ${profile.directQuotes.join('; ')}

Conversation context:
${conversationContext.join('\n')}

Now generate the final meditation script in English only.`;
}

function getLengthTargets(durationSeconds: number) {
  const minutes = Math.max(1, Math.round(durationSeconds / 60));
  const legacyTargetChars = Math.round((minutes / 5) * 800);
  // Strong length command:
  // 10-minute script must be 2x legacy length; 15-minute script must be 3x legacy length.
  const lengthMultiplier = minutes >= 15 ? 3 : minutes >= 10 ? 2 : 1;
  const minWordCount = 1000;
  const targetWordCount = 1125;
  const maxWordCount = 1250;
  const charsByWords = Math.round(targetWordCount * 4.6);
  const minCharsByWords = Math.round(minWordCount * 4.1);
  const maxCharsByWords = Math.round(maxWordCount * 4.9);
  const targetChars = Math.max(legacyTargetChars * lengthMultiplier, charsByWords);
  const minChars = Math.max(Math.round(targetChars * 0.95), minCharsByWords);
  const maxChars = Math.min(Math.max(Math.round(targetChars * 1.1), minChars + 650), maxCharsByWords);
  const lengthRuleText =
    minutes >= 15
      ? `15分钟稿件必须达到旧标准字数的3倍（旧标准约${legacyTargetChars}字，新标准目标约${targetChars}字）`
      : minutes >= 10
        ? `10分钟稿件必须达到旧标准字数的2倍（旧标准约${legacyTargetChars}字，新标准目标约${targetChars}字）`
        : `当前时长按基础标准执行（约${targetChars}字）`;
  const maxOutputTokens = Math.min(9000, Math.max(4200, Math.round(maxChars * 1.2)));
  return {
    minutes,
    targetChars,
    minChars,
    maxChars,
    minWordCount,
    targetWordCount,
    maxWordCount,
    legacyTargetChars,
    lengthMultiplier,
    lengthRuleText,
    maxOutputTokens
  };
}

function getScriptStats(script: string) {
  const pauseSeconds = Array.from(script.matchAll(/\[p:(\d+)\]/g)).reduce((sum, m) => sum + Number(m[1] ?? 0), 0);
  const spokenText = script.replace(/\[p:\d+\]/g, ' ').replace(/\s+/g, ' ').trim();
  const compactText = spokenText.replace(/\s+/g, '');
  const wordCount = (spokenText.match(/[A-Za-z]+(?:'[A-Za-z]+)*/g) ?? []).length;
  return { chars: compactText.length, pauseSeconds, wordCount };
}

function containsCJK(text: string) {
  return /[\u3400-\u9fff]/.test(text);
}

async function rewriteScriptToEnglish(rawScript: string, apiKey: string, maxTokens: number) {
  const messages = [
    {
      role: 'system',
      content:
        'Rewrite into natural English meditation guidance only. Preserve all [p:X] pause markers. Keep meaning and flow. Never output Chinese.'
    },
    {
      role: 'user',
      content: `Rewrite the following script to English only. Output script text only:\n${rawScript}`
    }
  ];
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: 'deepseek-chat', messages, max_tokens: maxTokens, temperature: 0.2 })
  });
  const data = await response.json().catch(() => null);
  const content = String(data?.choices?.[0]?.message?.content ?? '').trim();
  if (!response.ok || !content) return '';
  return content;
}

function normalizeStartEnd(script: string) {
  const start = "Now, find a comfortable position... let's begin.[p:5]";
  const end = 'Bring this awareness back to the present.[p:10] When you feel ready, gently open your eyes.[p:15]';
  let s = script.trim();
  if (!s.startsWith(start)) s = `${start}\n${s}`;
  if (!s.endsWith(end)) s = `${s}\n${end}`;
  return s;
}

function scalePauses(script: string, targetTotalSeconds: number) {
  const matches = Array.from(script.matchAll(/\[p:(\d+)\]/g));
  if (matches.length === 0) return script;
  const originals = matches.map((m) => Math.max(1, Number(m[1] ?? 1)));
  const originalTotal = originals.reduce((sum, value) => sum + value, 0);
  if (originalTotal <= 0) return script;

  const minPauseFor = (value: number) => {
    if (value >= 10) return 7;
    if (value >= 8) return 5;
    if (value >= 5) return 3;
    return 1;
  };

  const scale = targetTotalSeconds / originalTotal;
  const scaled = originals.map((value) => Math.max(minPauseFor(value), Math.round(value * scale)));
  const minimums = originals.map((value) => minPauseFor(value));

  let diff = targetTotalSeconds - scaled.reduce((sum, value) => sum + value, 0);
  const priority = originals
    .map((value, index) => ({ value, index }))
    .sort((a, b) => {
      if (b.value !== a.value) return b.value - a.value;
      return a.index - b.index;
    });

  while (diff > 0) {
    const target = priority[diff % priority.length] ?? priority[0];
    scaled[target.index] += 1;
    diff -= 1;
  }

  let guard = 0;
  while (diff < 0 && guard < 10000) {
    let adjusted = false;
    for (const target of priority) {
      const minAllowed = minimums[target.index] ?? 1;
      if (scaled[target.index] > minAllowed) {
        scaled[target.index] -= 1;
        diff += 1;
        adjusted = true;
        if (diff === 0) break;
      }
    }
    if (!adjusted) break;
    guard += 1;
  }

  let idx = 0;
  return script.replace(/\[p:(\d+)\]/g, () => `[p:${scaled[idx++] ?? 1}]`);
}

function padScriptToChars(
  script: string,
  targetChars: number,
  maxChars: number,
  minWordCount: number,
  targetWordCount: number,
  maxWordCount: number,
  profile: PersonalizationProfile
) {
  const end = 'Bring this awareness back to the present.[p:10] When you feel ready, gently open your eyes.[p:15]';
  let s = script.trim();
  if (!s.endsWith(end)) s = `${s}\n${end}`;
  const parts = s.split(end);
  let body = parts[0] ?? '';
  const suffix = end + (parts.slice(1).join(end) ? end + parts.slice(1).join(end) : '');

  const blocks = [
    `When thoughts return to "${profile.coreStress}", notice the pull and come back to your ${profile.bodySignal}. Let each exhale soften one small layer of tension.[p:8]`,
    `If "${profile.coreEmotion}" rises again, quietly name it and allow it. Then lengthen your exhale and let your body settle one step deeper.[p:8]`,
    `Around "${profile.sleepStatus}", there may be urgency and fatigue. For this moment, release solving and return to one steady breath at a time.[p:8]`,
    `When your mind moves toward "${profile.keyPeople}", place a hand where you feel the most tension and remind yourself: steady first, then respond.[p:10]`,
    `You are looking for "${profile.desiredRelief}". Stay with this pause and give your nervous system a real, gentle reset.[p:10]`
  ];

  let i = 0;
  while (true) {
    const { chars, wordCount } = getScriptStats(body + suffix);
    if ((chars >= targetChars && wordCount >= minWordCount) || wordCount >= targetWordCount) break;
    const block = blocks[i % blocks.length];
    const nextStats = getScriptStats(body + '\n' + block + suffix);
    if (nextStats.chars > maxChars || nextStats.wordCount > maxWordCount) break;
    body = (body.trimEnd() + '\n' + block + '\n').trimEnd();
    i += 1;
    if (i > 220) break;
  }

  const emergencyPad = `You are still carrying the weight of "${profile.coreStress}", and waves of "${profile.coreEmotion}" may come and go. Keep returning to breath and body contact points. Inhale for support, exhale to release pressure. Even when thoughts jump to work, family, or sleep worries, you do not need to force them away. Notice, allow, and gently return. This is not about performing well; it is about creating one stable, repeatable space in the middle of chaos.[p:10]`;
  let guard = 0;
  while (true) {
    const { chars, wordCount } = getScriptStats(body + suffix);
    if ((chars >= targetChars && wordCount >= minWordCount) || wordCount >= targetWordCount) break;
    const next = `${body.trimEnd()}\n${emergencyPad}\n`;
    const nextStats = getScriptStats(next + suffix);
    if (nextStats.chars > maxChars || nextStats.wordCount > maxWordCount) break;
    body = next.trimEnd();
    guard += 1;
    if (guard > 80) break;
  }

  s = (body.trimEnd() + '\n' + end).trim();
  return s;
}

function trimScriptToWordLimit(script: string, maxWordCount: number) {
  const stats = getScriptStats(script);
  if (stats.wordCount <= maxWordCount) return script;
  const end = 'Bring this awareness back to the present.[p:10] When you feel ready, gently open your eyes.[p:15]';
  let s = script.trim();
  if (!s.endsWith(end)) s = `${s}\n${end}`;
  const parts = s.split(end);
  let body = (parts[0] ?? '').trim();
  const lines = body.split('\n').map((x) => x.trim()).filter(Boolean);
  while (lines.length > 4) {
    lines.pop();
    const candidate = `${lines.join('\n')}\n${end}`.trim();
    if (getScriptStats(candidate).wordCount <= maxWordCount) return normalizeStartEnd(candidate);
  }
  return normalizeStartEnd(`${lines.join('\n')}\n${end}`.trim());
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { status: 200, headers: corsHeaders() });
  const headers = { ...corsHeaders(), 'content-type': 'application/json' };
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'method_not_allowed' }), { status: 405, headers });

  const user = await requireUser(req);
  if (!user) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers });

  const apiKey = Deno.env.get('DEEPSEEK_API_KEY') ?? '';
  if (!apiKey) return new Response(JSON.stringify({ error: 'server_misconfigured' }), { status: 500, headers });

  const body = await req.json().catch(() => null);
  const mode = String(body?.mode ?? '');

  if (mode === 'next_question') {
    const conversationContext = Array.isArray(body?.conversationContext) ? body.conversationContext.map(String) : [];
    const roundNumber = Math.max(1, Number(body?.roundNumber ?? 1));
    const guidance = (body?.guidance ?? null) as QuestionGuidance | null;
    const readinessResult = evaluateReadiness(conversationContext, guidance ?? undefined);
    if (readinessResult.shouldStartMeditation) {
      return new Response(
        JSON.stringify({
          question: '',
          shouldStartMeditation: true,
          stopReason: readinessResult.stopReason,
          readinessScore: readinessResult.readinessScore,
          readiness: readinessResult.readiness,
          coveredDimensions: readinessResult.coveredDimensions,
          missingDimensions: readinessResult.missingDimensions
        }),
        { status: 200, headers }
      );
    }
    const messages = buildMessages(conversationContext, roundNumber, guidance ?? undefined);
    let upstream = await requestNextQuestion(messages, apiKey);
    const openingQuestion = 'how has your day been so far?';
    if (roundNumber > 1 && upstream.question.trim().toLowerCase() === openingQuestion) {
      const antiRepeatMessages = [
        ...messages,
        {
          role: 'system',
          content: 'You repeated the opening line. Use a different empathic reflection and a different gentle invitation based on the latest user message.'
        }
      ];
      const retry = await requestNextQuestion(antiRepeatMessages, apiKey);
      if (retry.question && retry.question.trim().toLowerCase() !== openingQuestion) {
        upstream = retry;
      }
    }
    if (!upstream.question || (roundNumber > 1 && upstream.question.trim().toLowerCase() === openingQuestion)) {
      return new Response(JSON.stringify({ error: 'upstream_repeated_opening', data: upstream.data }), { status: 502, headers });
    }
    return new Response(
      JSON.stringify({
        question: upstream.question,
        shouldStartMeditation: false,
        stopReason: readinessResult.stopReason,
        readinessScore: readinessResult.readinessScore,
        readiness: readinessResult.readiness,
        coveredDimensions: readinessResult.coveredDimensions,
        missingDimensions: readinessResult.missingDimensions
      }),
      { status: 200, headers }
    );
  }

  if (mode === 'meditation_script') {
    const conversationContext = Array.isArray(body?.conversationContext) ? body.conversationContext.map(String) : [];
    const durationSeconds = Math.max(60, Number(body?.durationSeconds ?? 600));
    const {
      minutes,
      targetChars,
      minChars,
      maxChars,
      minWordCount,
      targetWordCount,
      maxWordCount,
      legacyTargetChars,
      lengthMultiplier,
      lengthRuleText,
      maxOutputTokens
    } = getLengthTargets(durationSeconds);
    const profile = await buildPersonalizationProfile(conversationContext, apiKey);

    let script = '';
    let lastData: any = null;

    for (let attempt = 0; attempt < 2; attempt++) {
      const prompt =
        attempt === 0
          ? buildMeditationPrompt(conversationContext, durationSeconds, profile, lengthRuleText, minWordCount, maxWordCount)
          : (() => {
              const { chars, pauseSeconds, wordCount } = getScriptStats(script);
              const ratio = Math.round((pauseSeconds / durationSeconds) * 100);
              return `Your previous script has about ${chars} compact characters, ${wordCount} words, and ${pauseSeconds} seconds of pauses (about ${ratio}%), which does not meet target. Rewrite while preserving tone and personalization.\nHard requirements:\n1) Total duration: about ${minutes} minutes (spoken + pauses).\n2) Spoken text target: about ${targetChars} chars, allowed range ${minChars}~${maxChars}.\n3) Word count must be between ${minWordCount} and ${maxWordCount} (target around ${targetWordCount}).\n4) Forced length rule: ${lengthRuleText}.\n5) Pause ratio: 25%~35%.\n6) Must include concrete references to: ${profile.coreStress}, ${profile.coreEmotion}, ${profile.bodySignal}, ${profile.sleepStatus}, ${profile.keyPeople}.\n7) Keep exact fixed opening and ending lines.\n8) Output English only. Never output Chinese.\n\nPrevious script:\n${script}`;
            })();

      const messages = [
        { role: 'system', content: 'You are a professional MBCT/MBSR meditation script writer. Follow constraints strictly. Output English script only with [p:X] markers.' },
        { role: 'user', content: prompt }
      ];

      const response = await fetch(API_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ model: 'deepseek-chat', messages, max_tokens: maxOutputTokens, temperature: 0.4 })
      });
      const data = await response.json().catch(() => null);
      lastData = data;
      const content = data?.choices?.[0]?.message?.content;
      if (!response.ok || !content) return new Response(JSON.stringify({ error: 'upstream_error', data }), { status: 502, headers });

      script = normalizeStartEnd(String(content));
      const { chars, pauseSeconds, wordCount } = getScriptStats(script);
      const pauseRatio = pauseSeconds / durationSeconds;
      const okChars = chars >= minChars && chars <= maxChars;
      const okWords = wordCount >= minWordCount && wordCount <= maxWordCount;
      const okPause = pauseRatio >= 0.25 && pauseRatio <= 0.35;
      const okLanguage = !containsCJK(script);
      if (okChars && okWords && okPause && okLanguage) break;
    }

    script = normalizeStartEnd(script);
    script = padScriptToChars(script, targetChars, maxChars, minWordCount, targetWordCount, maxWordCount, profile);
    script = trimScriptToWordLimit(script, maxWordCount);
    script = scalePauses(script, Math.round(durationSeconds * 0.3));
    if (containsCJK(script)) {
      const rewritten = await rewriteScriptToEnglish(script, apiKey, maxOutputTokens);
      if (rewritten) script = normalizeStartEnd(rewritten);
    }
    if (containsCJK(script)) {
      return new Response(JSON.stringify({ error: 'non_english_script' }), { status: 502, headers });
    }
    const finalStats = getScriptStats(script);
    if (finalStats.wordCount < minWordCount || finalStats.wordCount > maxWordCount) {
      return new Response(
        JSON.stringify({
          error: 'word_count_out_of_range',
          wordCount: finalStats.wordCount,
          minWordCount,
          maxWordCount
        }),
        { status: 502, headers }
      );
    }

    return new Response(JSON.stringify({
      script,
      meta: {
        minutes,
        minChars,
        maxChars,
        minWordCount,
        targetWordCount,
        maxWordCount,
        actualWordCount: finalStats.wordCount,
        lengthRule: {
          legacyTargetChars,
          lengthMultiplier,
          targetChars
        },
        upstream: Boolean(lastData),
        personalization: {
          summary: profile.summary,
          coreStress: profile.coreStress,
          coreEmotion: profile.coreEmotion
        }
      }
    }), { status: 200, headers });
  }

  return new Response(JSON.stringify({ error: 'bad_request' }), { status: 400, headers });
});
