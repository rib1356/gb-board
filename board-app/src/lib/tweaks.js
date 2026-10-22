import { tweaksSupabase } from './supabaseClient';

export const TWEAKS_EMAIL = 'tweaks@example.com';

export async function getTweaksSession() {
  const { data } = await tweaksSupabase.auth.getSession();
  return data?.session ?? null;
}

// true when signed in, false for a wrong password; anything else (offline, server error) throws.
export async function signInToTweaks(password) {
  const { error } = await tweaksSupabase.auth.signInWithPassword({ email: TWEAKS_EMAIL, password });
  if (!error) return true;
  if (error.code === 'invalid_credentials' || error.status === 400) return false;
  throw error;
}

// Signs out this device only; a failed sign-out shouldn't stop the caller leaving.
export async function signOutOfTweaks() {
  try {
    await tweaksSupabase.auth.signOut({ scope: 'local' });
  } catch {
    // ignore
  }
}
