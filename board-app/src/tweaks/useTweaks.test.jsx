import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import useTweaks from './useTweaks';
import { getTweaksSession, signInToTweaks, signOutOfTweaks } from '../lib/tweaks';

vi.mock('../lib/tweaks');

describe('useTweaks', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    signOutOfTweaks.mockResolvedValue();
  });

  it('starts checking, then signed in when a session is stored', async () => {
    getTweaksSession.mockResolvedValue({ user: { id: 'u1' } });
    const { result } = renderHook(() => useTweaks());
    expect(result.current.status).toBe('checking');
    await waitFor(() => expect(result.current.status).toBe('signed-in'));
  });

  it('is signed out with no session', async () => {
    getTweaksSession.mockResolvedValue(null);
    const { result } = renderHook(() => useTweaks());
    await waitFor(() => expect(result.current.status).toBe('signed-out'));
  });

  it('is signed out when reading the session fails', async () => {
    getTweaksSession.mockRejectedValue(new Error('offline'));
    const { result } = renderHook(() => useTweaks());
    await waitFor(() => expect(result.current.status).toBe('signed-out'));
  });

  describe('signing in', () => {
    beforeEach(() => getTweaksSession.mockResolvedValue(null));

    it('is signed in after the right password', async () => {
      signInToTweaks.mockResolvedValue(true);
      const { result } = renderHook(() => useTweaks());
      await waitFor(() => expect(result.current.status).toBe('signed-out'));
      let ok;
      await act(async () => { ok = await result.current.signIn('pw'); });
      expect(ok).toBe(true);
      expect(signInToTweaks).toHaveBeenCalledWith('pw');
      expect(result.current.status).toBe('signed-in');
    });

    it('stays signed out after a wrong password', async () => {
      signInToTweaks.mockResolvedValue(false);
      const { result } = renderHook(() => useTweaks());
      await waitFor(() => expect(result.current.status).toBe('signed-out'));
      let ok;
      await act(async () => { ok = await result.current.signIn('nope'); });
      expect(ok).toBe(false);
      expect(result.current.status).toBe('signed-out');
    });

    it('passes an offline error on and leaves the status alone', async () => {
      signInToTweaks.mockRejectedValue(new Error('offline'));
      const { result } = renderHook(() => useTweaks());
      await waitFor(() => expect(result.current.status).toBe('signed-out'));
      await act(async () => {
        await expect(result.current.signIn('pw')).rejects.toThrow('offline');
      });
      expect(result.current.status).toBe('signed-out');
    });
  });

  it('signs out', async () => {
    getTweaksSession.mockResolvedValue({ user: { id: 'u1' } });
    const { result } = renderHook(() => useTweaks());
    await waitFor(() => expect(result.current.status).toBe('signed-in'));
    await act(async () => { await result.current.signOut(); });
    expect(signOutOfTweaks).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe('signed-out');
  });
});
