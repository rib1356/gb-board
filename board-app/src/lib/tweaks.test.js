import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  client: {
    auth: { getSession: vi.fn(), signInWithPassword: vi.fn(), signOut: vi.fn() },
    from: vi.fn(),
  },
}));
vi.mock('./supabaseClient', () => ({ tweaksSupabase: mocks.client }));

import { getTweaksSession, signInToTweaks, signOutOfTweaks } from './tweaks';

beforeEach(() => {
  mocks.client.auth.getSession.mockReset();
  mocks.client.auth.signInWithPassword.mockReset();
  mocks.client.auth.signOut.mockReset();
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
});
