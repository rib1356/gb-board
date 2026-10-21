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

const LOGIN_KEYS = ['board-app:tweaks-auth', 'board-app:tweaks-auth-user', 'board-app:tweaks-auth-code-verifier'];

// Signs out this device only; a failed sign-out shouldn't stop the caller leaving.
// With no signal, auth-js can give up before forgetting the stored login, so
// it's removed here too, or the next long press would walk straight back in.
export async function signOutOfTweaks() {
  try {
    await tweaksSupabase.auth.signOut({ scope: 'local' });
  } catch {
    // ignore
  }
  LOGIN_KEYS.forEach((key) => {
    try {
      localStorage.removeItem(key);
    } catch {
      // Nothing to forget if storage is unavailable.
    }
  });
}

export async function listInjuries() {
  const { data, error } = await tweaksSupabase.from('injuries').select('*').order('created_at');
  if (error) throw error;
  return data;
}

export async function listCheckins() {
  const { data, error } = await tweaksSupabase
    .from('injury_checkins')
    .select('*')
    .order('checked_on')
    .order('created_at');
  if (error) throw error;
  return data;
}

async function insertRow(table, fields) {
  const { data, error } = await tweaksSupabase.from(table).insert(fields).select().single();
  if (error) throw error;
  return data;
}

async function updateRow(table, id, fields) {
  const { data, error } = await tweaksSupabase
    .from(table)
    .update(fields)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function deleteRow(table, id) {
  const { error } = await tweaksSupabase.from(table).delete().eq('id', id);
  if (error) throw error;
}

export const createInjury = (fields) => insertRow('injuries', fields);
export const updateInjury = (id, fields) => updateRow('injuries', id, fields);
export const createCheckin = (fields) => insertRow('injury_checkins', fields);
export const updateCheckin = (id, fields) => updateRow('injury_checkins', id, fields);
export const deleteInjury = (id) => deleteRow('injuries', id);
export const deleteCheckin = (id) => deleteRow('injury_checkins', id);

// A lapsed or missing login: RLS denial, an expired JWT, or a plain 401.
export function isSignedOutError(err) {
  return err?.code === '42501' || err?.code === 'PGRST301' || err?.status === 401;
}
