import { useCallback, useEffect, useRef, useState } from 'react';
import {
  getTweaksSession, signInToTweaks, signOutOfTweaks, isSignedOutError,
  listInjuries, listCheckins, createInjury, updateInjury, deleteInjury as removeInjury,
  createCheckin, updateCheckin, deleteCheckin as removeCheckin,
} from '../lib/tweaks';
import { clearAllDrafts } from '../lib/checkinDrafts';

const LOAD_ERROR = "Couldn't load your tweaks — check your connection and try again.";

// Add a row to a list, or replace the one with the same id.
function upsert(list, row) {
  return list.some((r) => r.id === row.id)
    ? list.map((r) => (r.id === row.id ? row : r))
    : [...list, row];
}

// Whether the private Tweaks area is signed in ('checking' until the stored
// session has been read, then 'signed-in' or 'signed-out'), plus its injuries
// and check-ins with the actions that change them.
export function useTweaks() {
  const [status, setStatus] = useState('checking');
  const [injuries, setInjuries] = useState([]);
  const [checkins, setCheckins] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  // Bumped by sign-out, every refresh and every landed write, so an older
  // refresh that resolves late is dropped instead of overwriting newer state.
  const generation = useRef(0);

  const supersedeRefreshes = useCallback(() => {
    generation.current += 1;
    setLoading(false);
  }, []);

  useEffect(() => {
    let cancelled = false;
    getTweaksSession()
      .then((session) => (session ? 'signed-in' : 'signed-out'), () => 'signed-out')
      .then((next) => { if (!cancelled) setStatus(next); });
    return () => { cancelled = true; };
  }, []);

  // true when signed in, false for a wrong password; an offline error is passed on.
  const signIn = useCallback(async (password) => {
    const ok = await signInToTweaks(password);
    if (ok) setStatus('signed-in');
    return ok;
  }, []);

  const signOut = useCallback(async () => {
    await signOutOfTweaks();
    supersedeRefreshes();
    clearAllDrafts();
    setInjuries([]);
    setCheckins([]);
    setStatus('signed-out');
  }, [supersedeRefreshes]);

  // Run a write; a signed-out failure drops the status first, then every failure is passed on.
  const run = useCallback(async (action) => {
    try {
      const result = await action();
      supersedeRefreshes();
      return result;
    } catch (err) {
      if (isSignedOutError(err)) setStatus('signed-out');
      throw err;
    }
  }, [supersedeRefreshes]);

  const refresh = useCallback(async () => {
    generation.current += 1;
    const mine = generation.current;
    setLoading(true);
    setLoadError('');
    try {
      const [nextInjuries, nextCheckins] = await Promise.all([listInjuries(), listCheckins()]);
      if (generation.current !== mine) return;
      setInjuries(nextInjuries);
      setCheckins(nextCheckins);
    } catch (err) {
      if (generation.current !== mine) return;
      if (isSignedOutError(err)) setStatus('signed-out');
      else setLoadError(LOAD_ERROR);
    } finally {
      if (generation.current === mine) setLoading(false);
    }
  }, []);

  const saveInjury = useCallback((fields, id) => run(async () => {
    const row = id ? await updateInjury(id, fields) : await createInjury(fields);
    setInjuries((list) => upsert(list, row));
    return row;
  }), [run]);

  const deleteInjury = useCallback((id) => run(async () => {
    await removeInjury(id);
    setInjuries((list) => list.filter((r) => r.id !== id));
    setCheckins((list) => list.filter((c) => c.injury_id !== id));
  }), [run]);

  const setInjuryClosed = useCallback(
    (id, closedOn) => saveInjury({ closed_on: closedOn }, id).then(() => {}),
    [saveInjury],
  );

  const saveCheckin = useCallback((plan) => run(async () => {
    const row = plan.action === 'update'
      ? await updateCheckin(plan.id, plan.fields)
      : await createCheckin(plan.fields);
    setCheckins((list) => upsert(list, row));
    return row;
  }), [run]);

  const deleteCheckin = useCallback((id) => run(async () => {
    await removeCheckin(id);
    setCheckins((list) => list.filter((c) => c.id !== id));
  }), [run]);

  return {
    status, signIn, signOut,
    injuries, checkins, loading, loadError, refresh,
    saveInjury, deleteInjury, setInjuryClosed, saveCheckin, deleteCheckin,
  };
}

export default useTweaks;
