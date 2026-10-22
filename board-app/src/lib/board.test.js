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
  updateProblem,
  restoreProblem,
  listTicks,
  listBoardTicks,
  listBoardVotes,
  saveVote,
  createTick,
  deleteTick,
  listClimbers,
  createClimber,
  saveWarmup,
  saveVolumes,
  listWarmupSessions,
  createWarmupSession,
  deleteWarmupSession,
} from './board';

function chain(result) {
  const builder = {
    select: vi.fn(() => builder),
    insert: vi.fn(() => builder),
    upsert: vi.fn(() => builder),
    update: vi.fn(() => builder),
    delete: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    is: vi.fn(() => builder),
    order: vi.fn(() => builder),
    limit: vi.fn(() => builder),
    range: vi.fn(() => builder),
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

describe('listBoardTicks', () => {
  const tick = (n) => ({ id: `t${n}`, problem_id: 'p1', sent_by: 'Rob', sent_on: '2026-09-01', created_at: '2026-09-01T10:00:00Z' });

  it("lists every send on the board's problems, through the problem each one is on", async () => {
    const rows = [tick(1)];
    const first = chain({ data: rows, error: null });
    mocks.supabase.from.mockReturnValueOnce(first).mockReturnValueOnce(chain({ data: [], error: null }));
    const result = await listBoardTicks('b1');
    expect(result).toEqual(rows);
    expect(mocks.supabase.from).toHaveBeenCalledWith('ticks');
    expect(first.select).toHaveBeenCalledWith('id, problem_id, sent_by, sent_on, created_at, flash, problems!inner(board_id)');
    expect(first.eq).toHaveBeenCalledWith('problems.board_id', 'b1');
    expect(first.order).toHaveBeenCalledWith('created_at', { ascending: true });
    expect(first.order).toHaveBeenCalledWith('id', { ascending: true });
    expect(first.range).toHaveBeenCalledWith(0, 999);
  });

  it('keeps reading pages until one comes back empty, so nothing past 1,000 sends is lost', async () => {
    const page1 = Array.from({ length: 1000 }, (_, i) => tick(i));
    const page2 = [tick(1000), tick(1001), tick(1002)];
    const second = chain({ data: page2, error: null });
    const third = chain({ data: [], error: null });
    mocks.supabase.from
      .mockReturnValueOnce(chain({ data: page1, error: null }))
      .mockReturnValueOnce(second)
      .mockReturnValueOnce(third);
    const result = await listBoardTicks('b1');
    expect(result).toHaveLength(1003);
    expect(second.range).toHaveBeenCalledWith(1000, 1999);
    expect(third.range).toHaveBeenCalledWith(1003, 2002);
  });

  it('throws when the query fails', async () => {
    mocks.supabase.from.mockReturnValue(chain({ data: null, error: new Error('nope') }));
    await expect(listBoardTicks('b1')).rejects.toThrow('nope');
  });
});

describe('createTick', () => {
  it('inserts a tick with the given date and trimmed notes', async () => {
    const created = { id: 't1', problem_id: 'p1', sent_on: '2026-08-22', notes: 'felt easy' };
    const c = chain({ data: created, error: null });
    mocks.supabase.from.mockReturnValue(c);
    const result = await createTick('p1', { sentOn: '2026-08-22', notes: ' felt easy ' });
    expect(result).toEqual(created);
    expect(c.insert).toHaveBeenCalledWith({ problem_id: 'p1', sent_on: '2026-08-22', notes: 'felt easy', flash: false });
  });

  it('stores the climber name that logged the send', async () => {
    const created = { id: 't1', problem_id: 'p1', sent_on: '2026-08-22', notes: '', sent_by: 'Rob' };
    const c = chain({ data: created, error: null });
    mocks.supabase.from.mockReturnValue(c);
    const result = await createTick('p1', { sentOn: '2026-08-22', notes: '', sentBy: 'Rob' });
    expect(result).toEqual(created);
    expect(c.insert).toHaveBeenCalledWith({ problem_id: 'p1', sent_on: '2026-08-22', notes: '', sent_by: 'Rob', flash: false });
  });
});

describe('createTick flash', () => {
  it('records a send as a flash', async () => {
    const created = { id: 't1', problem_id: 'p1', sent_on: '2026-08-22', notes: '', sent_by: 'Rob', flash: true };
    const c = chain({ data: created, error: null });
    mocks.supabase.from.mockReturnValue(c);
    await createTick('p1', { sentOn: '2026-08-22', notes: '', sentBy: 'Rob', flash: true });
    expect(c.insert).toHaveBeenCalledWith({ problem_id: 'p1', sent_on: '2026-08-22', notes: '', sent_by: 'Rob', flash: true });
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

describe('saveWarmup', () => {
  it('writes the whole ladder to the board and returns the updated board', async () => {
    const rungs = [{ grade: 'V1', problemId: 'p1' }, { grade: 'V2', problemId: null }];
    const updated = { id: 'b1', warmup: rungs };
    const c = chain({ data: updated, error: null });
    mocks.supabase.from.mockReturnValue(c);
    expect(await saveWarmup('b1', rungs)).toEqual(updated);
    expect(mocks.supabase.from).toHaveBeenCalledWith('boards');
    expect(c.update).toHaveBeenCalledWith({ warmup: rungs });
    expect(c.eq).toHaveBeenCalledWith('id', 'b1');
  });

  it('throws when the update fails', async () => {
    mocks.supabase.from.mockReturnValue(chain({ data: null, error: new Error('nope') }));
    await expect(saveWarmup('b1', [])).rejects.toThrow('nope');
  });
});

describe('saveVolumes', () => {
  it('writes every volume to the board and returns the updated board', async () => {
    const volumes = [{ id: 'v1', name: 'Vol1', faces: [] }];
    const updated = { id: 'b1', volumes };
    const c = chain({ data: updated, error: null });
    mocks.supabase.from.mockReturnValue(c);
    expect(await saveVolumes('b1', volumes)).toEqual(updated);
    expect(mocks.supabase.from).toHaveBeenCalledWith('boards');
    expect(c.update).toHaveBeenCalledWith({ volumes });
    expect(c.eq).toHaveBeenCalledWith('id', 'b1');
  });

  it('throws when the update fails', async () => {
    mocks.supabase.from.mockReturnValue(chain({ data: null, error: new Error('nope') }));
    await expect(saveVolumes('b1', [])).rejects.toThrow('nope');
  });
});

describe('listWarmupSessions', () => {
  it('lists the latest 10 sessions for the board, newest first', async () => {
    const sessions = [{ id: 's1' }];
    const c = chain({ data: sessions, error: null });
    mocks.supabase.from.mockReturnValue(c);
    expect(await listWarmupSessions('b1')).toEqual(sessions);
    expect(mocks.supabase.from).toHaveBeenCalledWith('warmup_sessions');
    expect(c.eq).toHaveBeenCalledWith('board_id', 'b1');
    expect(c.order).toHaveBeenCalledWith('created_at', { ascending: false });
    expect(c.limit).toHaveBeenCalledWith(10);
  });
});

describe('createWarmupSession', () => {
  it('inserts a session row with snake_case columns', async () => {
    const created = { id: 's1' };
    const c = chain({ data: created, error: null });
    mocks.supabase.from.mockReturnValue(c);
    const result = await createWarmupSession('b1', {
      doneOn: '2026-09-29', climbedBy: 'Rob', feel: 'strong', problemIds: ['a', 'b'], sentIds: ['a'],
    });
    expect(result).toEqual(created);
    expect(mocks.supabase.from).toHaveBeenCalledWith('warmup_sessions');
    expect(c.insert).toHaveBeenCalledWith({
      board_id: 'b1', done_on: '2026-09-29', climbed_by: 'Rob', feel: 'strong', problem_ids: ['a', 'b'], sent_ids: ['a'],
    });
  });
});

describe('deleteWarmupSession', () => {
  it('deletes a session by id', async () => {
    const c = chain({ error: null });
    mocks.supabase.from.mockReturnValue(c);
    await deleteWarmupSession('s1');
    expect(mocks.supabase.from).toHaveBeenCalledWith('warmup_sessions');
    expect(c.delete).toHaveBeenCalled();
    expect(c.eq).toHaveBeenCalledWith('id', 's1');
  });

  it('throws when the delete fails', async () => {
    mocks.supabase.from.mockReturnValue(chain({ error: new Error('nope') }));
    await expect(deleteWarmupSession('s1')).rejects.toThrow('nope');
  });
});

describe('listBoardVotes', () => {
  const vote = (n) => ({ id: `v${n}`, problem_id: 'p1', climber: 'Rob', grade: 'V5', feel: null, stars: 4, created_at: '2026-10-22T10:00:00Z' });

  it("lists every vote on the board's problems, through the problem each one is on", async () => {
    const first = chain({ data: [vote(1)], error: null });
    mocks.supabase.from.mockReturnValueOnce(first).mockReturnValueOnce(chain({ data: [], error: null }));
    expect(await listBoardVotes('b1')).toEqual([vote(1)]);
    expect(mocks.supabase.from).toHaveBeenCalledWith('votes');
    expect(first.select).toHaveBeenCalledWith('id, problem_id, climber, grade, feel, stars, created_at, problems!inner(board_id)');
    expect(first.eq).toHaveBeenCalledWith('problems.board_id', 'b1');
    expect(first.order).toHaveBeenCalledWith('created_at', { ascending: true });
    expect(first.order).toHaveBeenCalledWith('id', { ascending: true });
    expect(first.range).toHaveBeenCalledWith(0, 999);
  });

  it('keeps reading pages until one comes back empty', async () => {
    const second = chain({ data: [vote(1000)], error: null });
    const third = chain({ data: [], error: null });
    mocks.supabase.from
      .mockReturnValueOnce(chain({ data: Array.from({ length: 1000 }, (_, i) => vote(i)), error: null }))
      .mockReturnValueOnce(second)
      .mockReturnValueOnce(third);
    expect(await listBoardVotes('b1')).toHaveLength(1001);
    expect(second.range).toHaveBeenCalledWith(1000, 1999);
    expect(third.range).toHaveBeenCalledWith(1001, 2000);
  });

  it('throws when the query fails', async () => {
    mocks.supabase.from.mockReturnValue(chain({ data: null, error: new Error('nope') }));
    await expect(listBoardVotes('b1')).rejects.toThrow('nope');
  });
});

describe('saveVote', () => {
  it("upserts the climber's vote on the problem and returns the row", async () => {
    const row = { id: 'v1', problem_id: 'p1', climber: 'Rob', grade: 'V5', feel: 'hard', stars: null };
    const c = chain({ data: row, error: null });
    mocks.supabase.from.mockReturnValue(c);
    expect(await saveVote('p1', 'Rob', { grade: 'V5', feel: 'hard', stars: null })).toEqual(row);
    expect(mocks.supabase.from).toHaveBeenCalledWith('votes');
    expect(c.upsert).toHaveBeenCalledWith({ problem_id: 'p1', climber: 'Rob', grade: 'V5', feel: 'hard', stars: null }, { onConflict: 'problem_id,climber' });
  });

  it('saves a missing feel as null, and never keeps a feel without a grade', async () => {
    const c = chain({ data: {}, error: null });
    mocks.supabase.from.mockReturnValue(c);
    await saveVote('p1', 'Rob', { grade: 'V5', stars: 2 });
    expect(c.upsert).toHaveBeenLastCalledWith({ problem_id: 'p1', climber: 'Rob', grade: 'V5', feel: null, stars: 2 }, { onConflict: 'problem_id,climber' });
    await saveVote('p1', 'Rob', { grade: null, feel: 'hard', stars: 3 });
    expect(c.upsert).toHaveBeenLastCalledWith({ problem_id: 'p1', climber: 'Rob', grade: null, feel: null, stars: 3 }, { onConflict: 'problem_id,climber' });
  });

  it('deletes the row when both the grade and the stars are cleared', async () => {
    const c = chain({ data: null, error: null });
    mocks.supabase.from.mockReturnValue(c);
    expect(await saveVote('p1', 'Rob', { grade: null, stars: null })).toBeNull();
    expect(c.delete).toHaveBeenCalled();
    expect(c.eq).toHaveBeenCalledWith('problem_id', 'p1');
    expect(c.eq).toHaveBeenCalledWith('climber', 'Rob');
    expect(c.upsert).not.toHaveBeenCalled();
  });

  it('throws when the save fails', async () => {
    mocks.supabase.from.mockReturnValue(chain({ data: null, error: new Error('nope') }));
    await expect(saveVote('p1', 'Rob', { grade: 'V5', stars: null })).rejects.toThrow('nope');
  });
});
