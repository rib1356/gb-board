import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  supabase: { from: vi.fn(), storage: { from: vi.fn() } },
}));
vi.mock('./supabaseClient', () => ({ supabase: mocks.supabase }));

import {
  getOrCreateBoard,
  listProblems,
  uploadBoardPhoto,
  createProblem,
  deleteProblem,
  rateProblem,
  updateProblem,
  tickProblem,
  restoreProblem,
} from './board';

function chain(result) {
  const builder = {
    select: vi.fn(() => builder),
    insert: vi.fn(() => builder),
    update: vi.fn(() => builder),
    delete: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    is: vi.fn(() => builder),
    order: vi.fn(() => builder),
    limit: vi.fn(() => builder),
    single: vi.fn(() => Promise.resolve(result)),
    maybeSingle: vi.fn(() => Promise.resolve(result)),
    then: (resolve) => resolve(result),
  };
  return builder;
}

beforeEach(() => {
  mocks.supabase.from.mockReset();
  mocks.supabase.storage.from.mockReset();
});

describe('getOrCreateBoard', () => {
  it('returns the existing board when one is found', async () => {
    const board = { id: 'b1', name: 'Home Board' };
    const selectChain = chain({ data: board, error: null });
    mocks.supabase.from.mockReturnValue(selectChain);
    const result = await getOrCreateBoard();
    expect(result).toEqual(board);
    expect(mocks.supabase.from).toHaveBeenCalledWith('boards');
    expect(selectChain.order).toHaveBeenCalledWith('created_at', { ascending: true });
  });

  it('creates a board named "Home Board" when none exists', async () => {
    const created = { id: 'b2', name: 'Home Board' };
    const selectChain = chain({ data: null, error: null });
    const insertChain = chain({ data: created, error: null });
    mocks.supabase.from.mockReturnValueOnce(selectChain).mockReturnValueOnce(insertChain);
    const result = await getOrCreateBoard();
    expect(result).toEqual(created);
    expect(insertChain.insert).toHaveBeenCalledWith({ name: 'Home Board' });
  });
});

describe('listProblems', () => {
  it('lists problems for a board, newest first', async () => {
    const rows = [{ id: 'p1' }, { id: 'p2' }];
    const c = chain({ data: rows, error: null });
    mocks.supabase.from.mockReturnValue(c);
    const result = await listProblems('b1');
    expect(result).toEqual(rows);
    expect(c.eq).toHaveBeenCalledWith('board_id', 'b1');
    expect(c.is).toHaveBeenCalledWith('deleted_at', null);
    expect(c.order).toHaveBeenCalledWith('created_at', { ascending: false });
  });
});

describe('createProblem', () => {
  it('inserts a trimmed problem row scoped to the board', async () => {
    const saved = { id: 'p1', name: 'Gaston Traverse' };
    const c = chain({ data: saved, error: null });
    mocks.supabase.from.mockReturnValue(c);
    const result = await createProblem('b1', {
      name: '  Gaston Traverse  ',
      grade: ' V5 ',
      setter: ' Rob ',
      notes: ' beta ',
      holds: [{ x: 0.1, y: 0.2, type: 'start' }],
      photoUrl: 'https://cdn.example/b1.jpg',
    });
    expect(result).toEqual(saved);
    expect(c.insert).toHaveBeenCalledWith({
      board_id: 'b1',
      name: 'Gaston Traverse',
      grade: 'V5',
      setter: 'Rob',
      notes: 'beta',
      holds: [{ x: 0.1, y: 0.2, type: 'start' }],
      photo_url: 'https://cdn.example/b1.jpg',
    });
  });
});

describe('deleteProblem', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-22T12:00:00.000Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('soft-deletes a problem by setting deleted_at', async () => {
    const c = chain({ data: null, error: null });
    mocks.supabase.from.mockReturnValue(c);
    await deleteProblem('p1');
    expect(c.delete).not.toHaveBeenCalled();
    expect(c.update).toHaveBeenCalledWith({ deleted_at: '2026-08-22T12:00:00.000Z' });
    expect(c.eq).toHaveBeenCalledWith('id', 'p1');
  });
});

describe('restoreProblem', () => {
  it('clears deleted_at to restore a problem', async () => {
    const restored = { id: 'p1', name: 'Gaston Traverse', deleted_at: null };
    const c = chain({ data: restored, error: null });
    mocks.supabase.from.mockReturnValue(c);
    const result = await restoreProblem('p1');
    expect(result).toEqual(restored);
    expect(c.update).toHaveBeenCalledWith({ deleted_at: null });
    expect(c.eq).toHaveBeenCalledWith('id', 'p1');
  });
});

describe('updateProblem', () => {
  it('updates the trimmed fields of a problem, leaving holds untouched', async () => {
    const updated = { id: 'p1', name: 'Gaston Traverse', grade: 'V6', setter: 'Rob', notes: 'beta' };
    const c = chain({ data: updated, error: null });
    mocks.supabase.from.mockReturnValue(c);
    const result = await updateProblem('p1', {
      name: '  Gaston Traverse  ', grade: ' V6 ', setter: ' Rob ', notes: ' beta ',
    });
    expect(result).toEqual(updated);
    expect(c.update).toHaveBeenCalledWith({
      name: 'Gaston Traverse', grade: 'V6', setter: 'Rob', notes: 'beta',
    });
    expect(c.eq).toHaveBeenCalledWith('id', 'p1');
  });
});

describe('tickProblem', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-22T12:00:00.000Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('sets ticked_at to now when marking a problem as sent', async () => {
    const updated = { id: 'p1', ticked_at: '2026-08-22T12:00:00.000Z' };
    const c = chain({ data: updated, error: null });
    mocks.supabase.from.mockReturnValue(c);
    const result = await tickProblem('p1', true);
    expect(result).toEqual(updated);
    expect(c.update).toHaveBeenCalledWith({ ticked_at: '2026-08-22T12:00:00.000Z' });
    expect(c.eq).toHaveBeenCalledWith('id', 'p1');
  });

  it('clears ticked_at when un-ticking a problem', async () => {
    const updated = { id: 'p1', ticked_at: null };
    const c = chain({ data: updated, error: null });
    mocks.supabase.from.mockReturnValue(c);
    const result = await tickProblem('p1', false);
    expect(result).toEqual(updated);
    expect(c.update).toHaveBeenCalledWith({ ticked_at: null });
  });
});

describe('rateProblem', () => {
  it('updates the rating for a problem', async () => {
    const updated = { id: 'p1', rating: 3 };
    const c = chain({ data: updated, error: null });
    mocks.supabase.from.mockReturnValue(c);
    const result = await rateProblem('p1', 3);
    expect(result).toEqual(updated);
    expect(c.update).toHaveBeenCalledWith({ rating: 3 });
    expect(c.eq).toHaveBeenCalledWith('id', 'p1');
  });

  it('clears the rating when passed null', async () => {
    const updated = { id: 'p1', rating: null };
    const c = chain({ data: updated, error: null });
    mocks.supabase.from.mockReturnValue(c);
    const result = await rateProblem('p1', null);
    expect(result).toEqual(updated);
    expect(c.update).toHaveBeenCalledWith({ rating: null });
  });
});

describe('uploadBoardPhoto', () => {
  it('uploads the blob then stores the public url on the board', async () => {
    const storageBuilder = {
      upload: vi.fn(() => Promise.resolve({ error: null })),
      getPublicUrl: vi.fn(() => ({
        data: { publicUrl: 'https://cdn.example/board-photos/b1.jpg' },
      })),
    };
    mocks.supabase.storage.from.mockReturnValue(storageBuilder);
    const updateChain = chain({ data: { id: 'b1', photo_url: 'stored-url' }, error: null });
    mocks.supabase.from.mockReturnValue(updateChain);

    const blob = new Blob(['fake'], { type: 'image/jpeg' });
    const result = await uploadBoardPhoto('b1', blob);

    expect(storageBuilder.upload).toHaveBeenCalledWith('b1.jpg', blob, {
      upsert: true,
      contentType: 'image/jpeg',
    });
    expect(updateChain.update).toHaveBeenCalledWith(
      expect.objectContaining({
        photo_url: expect.stringMatching(/^https:\/\/cdn\.example\/board-photos\/b1\.jpg\?t=\d+$/),
      })
    );
    expect(result).toEqual({ id: 'b1', photo_url: 'stored-url' });
  });
});
