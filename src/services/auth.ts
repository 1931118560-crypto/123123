import { supabase } from './supabase';

function resolveAppleRedirectTo() {
  const explicitRedirect = (import.meta.env.VITE_SUPABASE_AUTH_REDIRECT_TO as string | undefined)?.trim();
  if (explicitRedirect) return explicitRedirect;
  if (typeof window === 'undefined') return '';
  return `${window.location.origin}${window.location.pathname}`;
}

export async function getExistingSession() {
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session ?? null;
}

export async function ensureAnonymousSession() {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  if (data.session) return data.session;
  const { data: signedIn, error } = await supabase.auth.signInAnonymously();
  if (error) throw error;
  return signedIn.session;
}

export async function signInAsGuest() {
  if (!supabase) throw new Error('supabase not configured');
  const { data } = await supabase.auth.getSession();
  if (data.session) return data.session;
  const { data: signedIn, error } = await supabase.auth.signInAnonymously();
  if (error) throw error;
  return signedIn.session;
}

export async function beginAppleSignIn() {
  if (!supabase) throw new Error('supabase not configured');
  if (typeof window === 'undefined') throw new Error('browser_required');
  const redirectTo = resolveAppleRedirectTo();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'apple',
    options: {
      redirectTo,
      skipBrowserRedirect: true
    }
  });
  if (error) throw error;
  if (data?.url) {
    window.location.assign(data.url);
    return;
  }
  throw new Error('apple_sign_in_unavailable');
}

export function onAuthStateChanged(cb: (sessionUserId: string | null) => void) {
  if (!supabase) return () => {};
  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    cb(session?.user?.id ?? null);
  });
  return () => data.subscription.unsubscribe();
}

export async function signOutSession() {
  if (!supabase) return;
  await supabase.auth.signOut();
}
