import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  client: {
    auth: { getSession: vi.fn(), signInWithPassword: vi.fn(), signOut: vi.fn() },
    from: vi.fn(),
  },
}));
vi.mock('./supabaseClient', () => ({ tweaksSupabase: mocks.client }));

import {
  getTweaksSession,
  signInToTweaks,
  signOutOfTweaks,
  listInjuries,
  listCheckins,
  createInjury,
  updateInjury,
  createCheckin,
  updateCheckin,
  deleteInjury,
  deleteCheckin,
  isSignedOutError,
} from './tweaks';

function chain(result) {
  const builder = {
    select: vi.fn(() => builder),
    insert: vi.fn(() => builder),
    update: vi.fn(() => builder),
    delete: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    order: vi.fn(() => builder),
    single: vi.fn(() => Promise.resolve(result)),
    then: (resolve) => resolve(result),
  };
  return builder;
}

beforeEach(() => {
  mocks.client.auth.getSession.mockReset();
  mocks.client.auth.signInWithPassword.mockReset();
  mocks.client.auth.signOut.mockReset();
  mocks.client.from.mockReset();
});

describe('signInToTweaks', () => {
  it('signs in as the Tweaks account', async () => {
    mocks.client.auth.signInWithPassword.mockResolvedValue({ data: { session: {} }, error: null });
    await expect(signInToTweaks('hunter22')).resolves.toBe(true);
    expect(mocks.client.auth.signInWithPassword).toHaveBeenCalledWith({
      email: 'tweaks@example.com',
      password: 'hunter22',
    });
  });

  it('reports a wrong password as false', async () => {
    mocks.client.auth.signInWithPassword.mockResolvedValue({
      data: {},
      error: { status: 400, code: 'invalid_credentials' },
    });
    await expect(signInToTweaks('nope')).resolves.toBe(false);
  });

  it("throws when the server can't be reached", async () => {
    mocks.client.auth.signInWithPassword.mockResolvedValue({
      data: {},
      error: { status: 0, name: 'AuthRetryableFetchError' },
    });
    await expect(signInToTweaks('hunter22')).rejects.toBeDefined();
  });
});

describe('getTweaksSession', () => {
  it('reads the stored session', async () => {
    const session = { access_token: 'abc' };
    mocks.client.auth.getSession.mockResolvedValue({ data: { session } });
    await expect(getTweaksSession()).resolves.toBe(session);
    mocks.client.auth.getSession.mockResolvedValue({ data: { session: null } });
    await expect(getTweaksSession()).resolves.toBeNull();
  });
});

describe('signOutOfTweaks', () => {
  it('signs out this device only, and never throws', async () => {
    mocks.client.auth.signOut.mockResolvedValue({ error: null });
    await signOutOfTweaks();
    expect(mocks.client.auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
    mocks.client.auth.signOut.mockRejectedValue(new Error('offline'));
    await expect(signOutOfTweaks()).resolves.toBeUndefined();
  });

  describe('forgets the login on this phone', () => {
    const LOGIN_KEYS = ['board-app:tweaks-auth', 'board-app:tweaks-auth-user', 'board-app:tweaks-auth-code-verifier'];

    beforeEach(() => {
      localStorage.clear();
      LOGIN_KEYS.forEach((key) => localStorage.setItem(key, '{"made":"up"}'));
      localStorage.setItem('board-app:currentClimberId', 'c1');
    });

    it('even when the sign-out call fails with no signal', async () => {
      mocks.client.auth.signOut.mockResolvedValue({ error: { name: 'AuthRetryableFetchError', status: 0 } });
      await signOutOfTweaks();
      LOGIN_KEYS.forEach((key) => expect(localStorage.getItem(key)).toBeNull());
      expect(localStorage.getItem('board-app:currentClimberId')).toBe('c1');
    });

    it('even when the sign-out call throws', async () => {
      mocks.client.auth.signOut.mockRejectedValue(new Error('offline'));
      await expect(signOutOfTweaks()).resolves.toBeUndefined();
      LOGIN_KEYS.forEach((key) => expect(localStorage.getItem(key)).toBeNull());
    });
  });
});

describe('injuries and check-ins', () => {
  const boom = { code: '42501', message: 'denied' };

  it('lists injuries oldest first', async () => {
    const rows = [{ id: 'i1' }];
    const c = chain({ data: rows, error: null });
    mocks.client.from.mockReturnValue(c);
    await expect(listInjuries()).resolves.toEqual(rows);
    expect(mocks.client.from).toHaveBeenCalledWith('injuries');
    expect(c.select).toHaveBeenCalledWith('*');
    expect(c.order).toHaveBeenCalledWith('created_at');
    mocks.client.from.mockReturnValue(chain({ data: null, error: boom }));
    await expect(listInjuries()).rejects.toBe(boom);
  });

  it('lists check-ins by day, then creation', async () => {
    const rows = [{ id: 'c1' }];
    const c = chain({ data: rows, error: null });
    mocks.client.from.mockReturnValue(c);
    await expect(listCheckins()).resolves.toEqual(rows);
    expect(mocks.client.from).toHaveBeenCalledWith('injury_checkins');
    expect(c.select).toHaveBeenCalledWith('*');
    expect(c.order).toHaveBeenNthCalledWith(1, 'checked_on');
    expect(c.order).toHaveBeenNthCalledWith(2, 'created_at');
    mocks.client.from.mockReturnValue(chain({ data: null, error: boom }));
    await expect(listCheckins()).rejects.toBe(boom);
  });

  it.each([
    ['createInjury', createInjury, 'injuries'],
    ['createCheckin', createCheckin, 'injury_checkins'],
  ])('%s inserts and returns the row', async (_name, fn, table) => {
    const row = { id: 'x1', note: 'sore' };
    const c = chain({ data: row, error: null });
    mocks.client.from.mockReturnValue(c);
    await expect(fn({ note: 'sore' })).resolves.toEqual(row);
    expect(mocks.client.from).toHaveBeenCalledWith(table);
    expect(c.insert).toHaveBeenCalledWith({ note: 'sore' });
    expect(c.select).toHaveBeenCalled();
    expect(c.single).toHaveBeenCalled();
    mocks.client.from.mockReturnValue(chain({ data: null, error: boom }));
    await expect(fn({ note: 'sore' })).rejects.toBe(boom);
  });

  it.each([
    ['updateInjury', updateInjury, 'injuries'],
    ['updateCheckin', updateCheckin, 'injury_checkins'],
  ])('%s updates by id and returns the row', async (_name, fn, table) => {
    const row = { id: 'x1', note: 'better' };
    const c = chain({ data: row, error: null });
    mocks.client.from.mockReturnValue(c);
    await expect(fn('x1', { note: 'better' })).resolves.toEqual(row);
    expect(mocks.client.from).toHaveBeenCalledWith(table);
    expect(c.update).toHaveBeenCalledWith({ note: 'better' });
    expect(c.eq).toHaveBeenCalledWith('id', 'x1');
    expect(c.select).toHaveBeenCalled();
    expect(c.single).toHaveBeenCalled();
    mocks.client.from.mockReturnValue(chain({ data: null, error: boom }));
    await expect(fn('x1', {})).rejects.toBe(boom);
  });

  it.each([
    ['deleteInjury', deleteInjury, 'injuries'],
    ['deleteCheckin', deleteCheckin, 'injury_checkins'],
  ])('%s deletes by id and resolves to nothing', async (_name, fn, table) => {
    const c = chain({ data: null, error: null });
    mocks.client.from.mockReturnValue(c);
    await expect(fn('x1')).resolves.toBeUndefined();
    expect(mocks.client.from).toHaveBeenCalledWith(table);
    expect(c.delete).toHaveBeenCalled();
    expect(c.eq).toHaveBeenCalledWith('id', 'x1');
    mocks.client.from.mockReturnValue(chain({ data: null, error: boom }));
    await expect(fn('x1')).rejects.toBe(boom);
  });
});

describe('isSignedOutError', () => {
  it('spots the errors a lapsed login produces', () => {
    expect(isSignedOutError({ code: '42501' })).toBe(true);
    expect(isSignedOutError({ code: 'PGRST301' })).toBe(true);
    expect(isSignedOutError({ code: 'PGRST303', message: 'JWT expired' })).toBe(true);
    expect(isSignedOutError({ status: 401 })).toBe(true);
    expect(isSignedOutError({ message: 'Failed to fetch' })).toBe(false);
    expect(isSignedOutError(null)).toBe(false);
  });
});
