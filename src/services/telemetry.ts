import { supabase } from './supabase';
import { getDeviceKey } from './device';

function telemetryEnabled() {
  if (typeof window === 'undefined') return true;
  try {
    const raw = localStorage.getItem('mindplan_settings');
    if (!raw) return true;
    const settings = JSON.parse(raw) as { telemetryEnabled?: boolean };
    return settings.telemetryEnabled !== false;
  } catch {
    return true;
  }
}

type DeviceUpsertInput = {
  theme?: string;
  appVersion?: string;
  platform?: string;
  userId?: string | null;
};

export async function upsertDevice(input: DeviceUpsertInput) {
  if (!supabase || !telemetryEnabled()) return;
  const deviceKey = getDeviceKey();
  const payload: Record<string, any> = {
    device_key: deviceKey,
    last_seen: new Date().toISOString(),
    theme: input.theme,
    app_version: input.appVersion,
    platform: input.platform
  };
  if (input.userId) payload.user_id = input.userId;
  const { error } = await supabase.from('devices').upsert(payload, { onConflict: 'device_key' });
  if (error && input.userId && String(error.message ?? '').toLowerCase().includes('user_id')) {
    // Backward compatibility for environments where schema has not added devices.user_id yet.
    const { user_id, ...fallbackPayload } = payload;
    await supabase.from('devices').upsert(fallbackPayload, { onConflict: 'device_key' });
  }
}

export async function logInteraction(input: {
  roundNumber?: number;
  question?: string;
  userAnswer?: string;
  resultType?: string;
  nextQuestion?: string;
  meditationScript?: string;
  error?: string;
  meta?: any;
}) {
  if (!supabase || !telemetryEnabled()) return;
  const deviceKey = getDeviceKey();
  const script = input.meditationScript ? input.meditationScript.slice(0, 20000) : undefined;
  await supabase.from('ai_interactions').insert({
    device_key: deviceKey,
    round_number: input.roundNumber,
    question: input.question,
    user_answer: input.userAnswer,
    result_type: input.resultType,
    next_question: input.nextQuestion,
    meditation_script: script,
    error: input.error,
    meta: input.meta ?? {}
  });
}

export async function logEvent(eventName: string, payload: any = {}) {
  if (!supabase || !telemetryEnabled()) return;
  const deviceKey = getDeviceKey();
  await supabase.from('app_events').insert({
    device_key: deviceKey,
    event_name: eventName,
    payload
  });
}
