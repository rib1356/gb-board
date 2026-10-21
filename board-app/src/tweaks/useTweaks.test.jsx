import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import useTweaks from './useTweaks';
import {
  getTweaksSession, signInToTweaks, signOutOfTweaks, isSignedOutError,
  listInjuries, listCheckins, createInjury, updateInjury, deleteInjury,
  createCheckin, updateCheckin, deleteCheckin,
} from '../lib/tweaks';
import { clearAllDrafts } from '../lib/checkinDrafts';

vi.mock('../lib/tweaks');
vi.mock('../lib/checkinDrafts');

const LOAD_ERROR = "Couldn't load your tweaks — check your connection and try again.";

describe('useTweaks', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    signOutOfTweaks.mockResolvedValue();
    isSignedOutError.mockImplementation((e) => e?.code === '42501' || e?.status === 401);
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

  describe('injuries and check-ins', () => {
    const I1 = { id: 'i1', title: 'Left A2 pulley' };
    const I2 = { id: 'i2', title: 'Right elbow' };
    const C1 = { id: 'c1', injury_id: 'i1', pain: 3 };
    const C2 = { id: 'c2', injury_id: 'i2', pain: 1 };

    async function signedInHook() {
      getTweaksSession.mockResolvedValue({ user: { id: 'u1' } });
      listInjuries.mockResolvedValue([I1, I2]);
      listCheckins.mockResolvedValue([C1, C2]);
      const hook = renderHook(() => useTweaks());
      await waitFor(() => expect(hook.result.current.status).toBe('signed-in'));
      await act(async () => { await hook.result.current.refresh(); });
      return hook;
    }

    it('refresh loads both lists', async () => {
      const { result } = await signedInHook();
      expect(result.current.injuries).toEqual([I1, I2]);
      expect(result.current.checkins).toEqual([C1, C2]);
      expect(result.current.loading).toBe(false);
      expect(result.current.loadError).toBe('');
    });

    it('refresh signs out on a signed-out error', async () => {
      const { result } = await signedInHook();
      listInjuries.mockRejectedValue({ code: '42501' });
      await act(async () => { await result.current.refresh(); });
      expect(result.current.status).toBe('signed-out');
    });

    it('refresh reports a network error and stays signed in', async () => {
      const { result } = await signedInHook();
      listInjuries.mockRejectedValue(new Error('Failed to fetch'));
      await act(async () => { await result.current.refresh(); });
      expect(result.current.loadError).toBe(LOAD_ERROR);
      expect(result.current.status).toBe('signed-in');
      expect(result.current.loading).toBe(false);
    });

    it('saveCheckin adds a created row', async () => {
      const { result } = await signedInHook();
      const row = { id: 'c3', injury_id: 'i1', pain: 2 };
      createCheckin.mockResolvedValue(row);
      let saved;
      await act(async () => {
        saved = await result.current.saveCheckin({ action: 'create', fields: { injury_id: 'i1', pain: 2 } });
      });
      expect(createCheckin).toHaveBeenCalledWith({ injury_id: 'i1', pain: 2 });
      expect(saved).toEqual(row);
      expect(result.current.checkins).toEqual([C1, C2, row]);
    });

    it('saveCheckin replaces the row with the same id on update', async () => {
      const { result } = await signedInHook();
      const row = { ...C1, pain: 5 };
      updateCheckin.mockResolvedValue(row);
      await act(async () => {
        await result.current.saveCheckin({ action: 'update', id: 'c1', fields: { pain: 5 } });
      });
      expect(updateCheckin).toHaveBeenCalledWith('c1', { pain: 5 });
      expect(result.current.checkins).toEqual([row, C2]);
    });

    it('saveInjury creates without an id and updates with one', async () => {
      const { result } = await signedInHook();
      const made = { id: 'i3', title: 'Finger' };
      createInjury.mockResolvedValue(made);
      await act(async () => { await result.current.saveInjury({ title: 'Finger' }); });
      expect(createInjury).toHaveBeenCalledWith({ title: 'Finger' });
      expect(result.current.injuries).toEqual([I1, I2, made]);

      const edited = { ...I1, title: 'Left A2 (healing)' };
      updateInjury.mockResolvedValue(edited);
      await act(async () => { await result.current.saveInjury({ title: edited.title }, 'i1'); });
      expect(updateInjury).toHaveBeenCalledWith('i1', { title: edited.title });
      expect(result.current.injuries).toEqual([edited, I2, made]);
    });

    it('deleteInjury removes the injury and its check-ins', async () => {
      const { result } = await signedInHook();
      deleteInjury.mockResolvedValue();
      await act(async () => { await result.current.deleteInjury('i1'); });
      expect(deleteInjury).toHaveBeenCalledWith('i1');
      expect(result.current.injuries).toEqual([I2]);
      expect(result.current.checkins).toEqual([C2]);
    });

    it('deleteCheckin removes the check-in', async () => {
      const { result } = await signedInHook();
      deleteCheckin.mockResolvedValue();
      await act(async () => { await result.current.deleteCheckin('c1'); });
      expect(deleteCheckin).toHaveBeenCalledWith('c1');
      expect(result.current.checkins).toEqual([C2]);
    });

    it('setInjuryClosed updates closed_on', async () => {
      const { result } = await signedInHook();
      updateInjury.mockResolvedValue({ ...I1, closed_on: '2026-10-21' });
      await act(async () => { await result.current.setInjuryClosed('i1', '2026-10-21'); });
      expect(updateInjury).toHaveBeenCalledWith('i1', { closed_on: '2026-10-21' });
      expect(result.current.injuries[0].closed_on).toBe('2026-10-21');
    });

    it('a mutation rejected as signed out rethrows and signs out', async () => {
      const { result } = await signedInHook();
      const err = { status: 401 };
      createCheckin.mockRejectedValue(err);
      await act(async () => {
        await expect(
          result.current.saveCheckin({ action: 'create', fields: {} }),
        ).rejects.toBe(err);
      });
      expect(result.current.status).toBe('signed-out');
    });

    it('signOut clears drafts and empties the lists', async () => {
      const { result } = await signedInHook();
      await act(async () => { await result.current.signOut(); });
      expect(clearAllDrafts).toHaveBeenCalledTimes(1);
      expect(result.current.injuries).toEqual([]);
      expect(result.current.checkins).toEqual([]);
    });

    it('signOut empties everything straight away, without waiting on the server', async () => {
      const { result } = await signedInHook();
      signOutOfTweaks.mockReturnValue(new Promise(() => {}));
      act(() => { result.current.signOut(); });
      expect(result.current.status).toBe('signed-out');
      expect(result.current.injuries).toEqual([]);
      expect(result.current.checkins).toEqual([]);
      expect(clearAllDrafts).toHaveBeenCalledTimes(1);
      expect(signOutOfTweaks).toHaveBeenCalledTimes(1);
    });

    it('drops a refresh that resolves after sign-out', async () => {
      const { result } = await signedInHook();
      let release;
      listInjuries.mockReturnValue(new Promise((r) => { release = r; }));
      listCheckins.mockResolvedValue([C1]);
      let pending;
      act(() => { pending = result.current.refresh(); });
      await act(async () => { await result.current.signOut(); });
      await act(async () => { release([I1]); await pending; });
      expect(result.current.injuries).toEqual([]);
      expect(result.current.checkins).toEqual([]);
      expect(result.current.loading).toBe(false);
    });

    it('keeps a row saved while a refresh was pending', async () => {
      const { result } = await signedInHook();
      let release;
      listInjuries.mockReturnValue(new Promise((r) => { release = r; }));
      listCheckins.mockResolvedValue([C1, C2]);
      let pending;
      act(() => { pending = result.current.refresh(); });
      const row = { id: 'c3', injury_id: 'i1', pain: 2 };
      createCheckin.mockResolvedValue(row);
      await act(async () => {
        await result.current.saveCheckin({ action: 'create', fields: {} });
      });
      await act(async () => { release([I1, I2]); await pending; });
      expect(result.current.checkins).toContainEqual(row);
    });
  });
});
