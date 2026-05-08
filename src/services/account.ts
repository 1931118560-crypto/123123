import { ensureAnonymousSession, signOutSession } from './auth';
import { getDeviceKey, clearDeviceKey } from './device';
import { clearLocalMemory } from './localMemory';
import { supabase } from './supabase';

const SETTINGS_KEY = 'mindplan_settings';

export async function deleteMyAccountAndData(): Promise<void> {
  if (!supabase) throw new Error('supabase not configured');
  await ensureAnonymousSession();
  const deviceKey = getDeviceKey();
  const functionCandidates = [
    'account-delete',
    'bright-responderaccount-delete',
    'rapid-responder-account-delete',
    'rapid-responderaccount-delete'
  ];
  let invokeError: any = null;
  let invoked = false;
  for (const functionName of functionCandidates) {
    const { error } = await supabase.functions.invoke(functionName, {
      body: { deviceKey }
    });
    if (!error) {
      invoked = true;
      break;
    }
    invokeError = error;
  }
  if (!invoked) throw invokeError ?? new Error('delete_account_failed');

  try {
    await clearLocalMemory();
  } catch {
    // ignore local indexedDB cleanup errors
  }
  localStorage.removeItem(SETTINGS_KEY);
  clearDeviceKey();
  await signOutSession();
}
