import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  supabase: { from: vi.fn(), storage: { from: vi.fn() } },
}));
vi.mock('./supabaseClient', () => ({ supabase: mocks.supabase }));

import {
  getOrCreateBoard,
  listProblems,
  uploadBoardPhoto,
  uploadProblemMask,
  createProblem,
  deleteProblem,
  rateProblem,
  updateProblem,
  restoreProblem,
  listTicks,
  createTick,
  deleteTick,
  listClimbers,
  createClimber,
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

  it('persists an updated hold list and clears the now-stale composited mask', async () => {
    const holds = [{ x: 0.4, y: 0.4, type: 'foot' }];
    const updated = { id: 'p1', name: 'Gaston Traverse', grade: 'V6', setter: 'Rob', notes: 'beta', holds, mask_url: null };
    const c = chain({ data: updated, error: null });
    mocks.supabase.from.mockReturnValue(c);
    const result = await updateProblem('p1', {
      name: 'Gaston Traverse', grade: 'V6', setter: 'Rob', notes: 'beta', holds,
    });
    expect(result).toEqual(updated);
    expect(c.update).toHaveBeenCalledWith({
      name: 'Gaston Traverse', grade: 'V6', setter: 'Rob', notes: 'beta', holds, mask_url: null,
    });
  });
});

describe('listClimbers', () => {
  it('lists climbers alphabetically by name', async () => {
    const rows = [{ id: 'c1', name: 'Alice' }, { id: 'c2', name: 'Bob' }];
    const c = chain({ data: rows, error: null });
    mocks.supabase.from.mockReturnValue(c);
    const result = await listClimbers();
    expect(result).toEqual(rows);
    expect(mocks.supabase.from).toHaveBeenCalledWith('climbers');
    expect(c.order).toHaveBeenCalledWith('name', { ascending: true });
  });
});

describe('createClimber', () => {
  it('inserts a trimmed climber name', async () => {
    const created = { id: 'c1', name: 'Rob' };
    const c = chain({ data: created, error: null });
    mocks.supabase.from.mockReturnValue(c);
    const result = await createClimber('  Rob  ');
    expect(result).toEqual(created);
    expect(mocks.supabase.from).toHaveBeenCalledWith('climbers');
    expect(c.insert).toHaveBeenCalledWith({ name: 'Rob' });
  });
});

describe('listTicks', () => {
  it('lists ticks for a problem, most recent send first', async () => {
    const rows = [{ id: 't2', sent_on: '2026-08-20' }, { id: 't1', sent_on: '2026-08-01' }];
    const c = chain({ data: rows, error: null });
    mocks.supabase.from.mockReturnValue(c);
    const result = await listTicks('p1');
    expect(result).toEqual(rows);
    expect(mocks.supabase.from).toHaveBeenCalledWith('ticks');
    expect(c.eq).toHaveBeenCalledWith('problem_id', 'p1');
    expect(c.order).toHaveBeenCalledWith('sent_on', { ascending: false });
  });
});

describe('createTick', () => {
  it('inserts a tick with the given date and trimmed notes', async () => {
    const created = { id: 't1', problem_id: 'p1', sent_on: '2026-08-22', notes: 'felt easy' };
    const c = chain({ data: created, error: null });
    mocks.supabase.from.mockReturnValue(c);
    const result = await createTick('p1', { sentOn: '2026-08-22', notes: ' felt easy ' });
    expect(result).toEqual(created);
    expect(c.insert).toHaveBeenCalledWith({ problem_id: 'p1', sent_on: '2026-08-22', notes: 'felt easy' });
  });

  it('stores the climber name that logged the send', async () => {
    const created = { id: 't1', problem_id: 'p1', sent_on: '2026-08-22', notes: '', sent_by: 'Rob' };
    const c = chain({ data: created, error: null });
    mocks.supabase.from.mockReturnValue(c);
    const result = await createTick('p1', { sentOn: '2026-08-22', notes: '', sentBy: 'Rob' });
    expect(result).toEqual(created);
    expect(c.insert).toHaveBeenCalledWith({ problem_id: 'p1', sent_on: '2026-08-22', notes: '', sent_by: 'Rob' });
  });
});

describe('deleteTick', () => {
  it('deletes a tick by id', async () => {
    const c = chain({ data: null, error: null });
    mocks.supabase.from.mockReturnValue(c);
    await deleteTick('t1');
    expect(mocks.supabase.from).toHaveBeenCalledWith('ticks');
    expect(c.delete).toHaveBeenCalled();
    expect(c.eq).toHaveBeenCalledWith('id', 't1');
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

    expect(storageBuilder.upload).toHaveBeenCalledWith(
      expect.stringMatching(/^b1\/\d+-[0-9a-f-]{36}\.jpg$/),
      blob,
      { contentType: 'image/jpeg' }
    );
    expect(updateChain.update).toHaveBeenCalledWith(
      expect.objectContaining({
        photo_url: 'https://cdn.example/board-photos/b1.jpg',
      })
    );
    expect(result).toEqual({ id: 'b1', photo_url: 'stored-url' });
  });

  // Re-shooting the board must not overwrite the photo earlier problems were
  // set on -- their holds are x/y fractions that only line up with the exact
  // frame they were placed against.
  it('writes a new object each time instead of overwriting the previous photo', async () => {
    const paths = [];
    const storageBuilder = {
      upload: vi.fn((path) => {
        paths.push(path);
        return Promise.resolve({ error: null });
      }),
      getPublicUrl: vi.fn((path) => ({
        data: { publicUrl: `https://cdn.example/board-photos/${path}` },
      })),
    };
    mocks.supabase.storage.from.mockReturnValue(storageBuilder);
    mocks.supabase.from.mockReturnValue(chain({ data: { id: 'b1' }, error: null }));

    await uploadBoardPhoto('b1', new Blob(['first'], { type: 'image/jpeg' }));
    await uploadBoardPhoto('b1', new Blob(['second'], { type: 'image/jpeg' }));

    expect(paths).toHaveLength(2);
    expect(paths[0]).not.toEqual(paths[1]);
  });

  // crypto.randomUUID only exists in a secure context, so it's missing when the
  // dev server is opened over a plain-http LAN address on a phone. Uploading a
  // board photo has to keep working there.
  it('still writes a unique path when crypto.randomUUID is unavailable', async () => {
    // randomUUID lives on Crypto.prototype, so shadow it with an own property
    // rather than deleting (which would be a silent no-op).
    Object.defineProperty(globalThis.crypto, 'randomUUID', {
      value: undefined,
      configurable: true,
    });
    try {
      const paths = [];
      const storageBuilder = {
        upload: vi.fn((path) => {
          paths.push(path);
          return Promise.resolve({ error: null });
        }),
        getPublicUrl: vi.fn((path) => ({
          data: { publicUrl: `https://cdn.example/board-photos/${path}` },
        })),
      };
      mocks.supabase.storage.from.mockReturnValue(storageBuilder);
      mocks.supabase.from.mockReturnValue(chain({ data: { id: 'b1' }, error: null }));

      await uploadBoardPhoto('b1', new Blob(['first'], { type: 'image/jpeg' }));
      await uploadBoardPhoto('b1', new Blob(['second'], { type: 'image/jpeg' }));

      expect(paths).toHaveLength(2);
      expect(paths[0]).not.toEqual(paths[1]);
    } finally {
      delete globalThis.crypto.randomUUID;
    }
  });

  it('stores a url that resolves to the exact object it just wrote', async () => {
    let writtenPath;
    const storageBuilder = {
      upload: vi.fn((path) => {
        writtenPath = path;
        return Promise.resolve({ error: null });
      }),
      getPublicUrl: vi.fn((path) => ({
        data: { publicUrl: `https://cdn.example/board-photos/${path}` },
      })),
    };
    mocks.supabase.storage.from.mockReturnValue(storageBuilder);
    const updateChain = chain({ data: { id: 'b1' }, error: null });
    mocks.supabase.from.mockReturnValue(updateChain);

    await uploadBoardPhoto('b1', new Blob(['fake'], { type: 'image/jpeg' }));

    // No `?t=` cache-buster: the path is already unique per upload, so the
    // bytes behind the stored url can never change under an old problem.
    expect(updateChain.update).toHaveBeenCalledWith({
      photo_url: `https://cdn.example/board-photos/${writtenPath}`,
    });
  });
});

describe('uploadProblemMask', () => {
  it('uploads the mask blob then stores the public url on the problem', async () => {
    const storageBuilder = {
      upload: vi.fn(() => Promise.resolve({ error: null })),
      getPublicUrl: vi.fn(() => ({
        data: { publicUrl: 'https://cdn.example/board-photos/masks/p1.png' },
      })),
    };
    mocks.supabase.storage.from.mockReturnValue(storageBuilder);
    const updateChain = chain({ data: { id: 'p1', mask_url: 'stored-url' }, error: null });
    mocks.supabase.from.mockReturnValue(updateChain);

    const blob = new Blob(['fake'], { type: 'image/png' });
    const result = await uploadProblemMask('p1', blob);

    expect(mocks.supabase.storage.from).toHaveBeenCalledWith('board-photos');
    expect(storageBuilder.upload).toHaveBeenCalledWith('masks/p1.png', blob, {
      upsert: true,
      contentType: 'image/png',
    });
    expect(updateChain.update).toHaveBeenCalledWith(
      expect.objectContaining({
        mask_url: expect.stringMatching(/^https:\/\/cdn\.example\/board-photos\/masks\/p1\.png\?t=\d+$/),
      })
    );
    expect(result).toEqual({ id: 'p1', mask_url: 'stored-url' });
  });
});
