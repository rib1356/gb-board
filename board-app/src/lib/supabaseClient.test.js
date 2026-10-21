import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('supabaseClient', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  it('throws a clear error when env vars are missing', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', '');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', '');
    await expect(import('./supabaseClient')).rejects.toThrow(/Missing VITE_SUPABASE_URL/);
  });

  it('creates a client when env vars are present', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'test-anon-key');
    const { supabase } = await import('./supabaseClient');
    expect(supabase.from).toBeInstanceOf(Function);
  });

  it('gives Tweaks its own client, so signing in never touches the board client', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'test-anon-key');
    const { supabase, tweaksSupabase } = await import('./supabaseClient');
    expect(tweaksSupabase).not.toBe(supabase);
    expect(tweaksSupabase.auth.storageKey).toBe('board-app:tweaks-auth');
    expect(supabase.auth.storageKey).not.toBe('board-app:tweaks-auth');
  });
});
