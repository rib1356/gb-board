import { useCallback, useEffect, useState } from 'react';
import { getTweaksSession, signInToTweaks, signOutOfTweaks } from '../lib/tweaks';

// Whether the private Tweaks area is signed in: 'checking' until the stored
// session has been read, then 'signed-in' or 'signed-out'.
export function useTweaks() {
  const [status, setStatus] = useState('checking');

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
    setStatus('signed-out');
  }, []);

  return { status, signIn, signOut };
}

export default useTweaks;
