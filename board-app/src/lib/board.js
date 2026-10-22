import { supabase } from './supabaseClient';

export async function getOrCreateBoard() {
  const { data: existing, error: selectError } = await supabase
    .from('boards')
    .select('*')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (selectError) throw selectError;
  if (existing) return existing;

  const { data: created, error: insertError } = await supabase
    .from('boards')
    .insert({ name: 'Home Board' })
    .select()
    .single();
  if (insertError) throw insertError;
  return created;
}

export async function listProblems(boardId) {
  const { data, error } = await supabase
    .from('problems')
    .select('*')
    .eq('board_id', boardId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function uploadBoardPhoto(boardId, blob) {
  // Every upload gets its own object, and no upsert -- problems store the url
  // of the photo their holds were placed against, so re-shooting the board
  // must never change the bytes behind an older problem's url. The timestamp
  // keeps the bucket readable in upload order; the uuid makes two shots in the
  // same millisecond still distinct.
  // randomUUID needs a secure context, so it's absent when the dev server is
  // opened over a plain-http LAN address on a phone -- fall back there.
  const unique = crypto.randomUUID?.() ?? Math.random().toString(36).slice(2, 10);
  const path = `${boardId}/${Date.now()}-${unique}.jpg`;
  const { error: uploadError } = await supabase.storage
    .from('board-photos')
    .upload(path, blob, { contentType: 'image/jpeg' });
  if (uploadError) throw uploadError;

  // No `?t=` cache-buster needed: the path is unique per upload, so the url is
  // already immutable and can be cached hard.
  const { data: publicUrlData } = supabase.storage.from('board-photos').getPublicUrl(path);
  const photoUrl = publicUrlData.publicUrl;

  const { data: updated, error: updateError } = await supabase
    .from('boards')
    .update({ photo_url: photoUrl })
    .eq('id', boardId)
    .select()
    .single();
  if (updateError) throw updateError;
  return updated;
}

export async function uploadProblemMask(problemId, blob) {
  const path = `masks/${problemId}.png`;
  const { error: uploadError } = await supabase.storage
    .from('board-photos')
    .upload(path, blob, { upsert: true, contentType: 'image/png' });
  if (uploadError) throw uploadError;

  const { data: publicUrlData } = supabase.storage.from('board-photos').getPublicUrl(path);
  const maskUrl = `${publicUrlData.publicUrl}?t=${Date.now()}`;

  const { data: updated, error: updateError } = await supabase
    .from('problems')
    .update({ mask_url: maskUrl })
    .eq('id', problemId)
    .select()
    .single();
  if (updateError) throw updateError;
  return updated;
}

export async function createProblem(boardId, { name, grade, setter, notes, holds, photoUrl }) {
  const { data, error } = await supabase
    .from('problems')
    .insert({
      board_id: boardId,
      name: name.trim(),
      grade: grade.trim(),
      setter: setter.trim(),
      notes: notes.trim(),
      holds,
      photo_url: photoUrl,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateProblem(id, { name, grade, setter, notes, holds }) {
  const payload = {
    name: name.trim(),
    grade: grade.trim(),
    setter: setter.trim(),
    notes: notes.trim(),
  };
  // A hold-list change invalidates any previously composited highlight image
  // -- callers that recompute one call uploadProblemMask right after this.
  if (holds !== undefined) {
    payload.holds = holds;
    payload.mask_url = null;
  }
  const { data, error } = await supabase
    .from('problems')
    .update(payload)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function listClimbers() {
  const { data, error } = await supabase
    .from('climbers')
    .select('*')
    .order('name', { ascending: true });
  if (error) throw error;
  return data;
}

export async function createClimber(name) {
  const { data, error } = await supabase
    .from('climbers')
    .insert({ name: name.trim() })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function listTicks(problemId) {
  const { data, error } = await supabase
    .from('ticks')
    .select('*')
    .eq('problem_id', problemId)
    .order('sent_on', { ascending: false });
  if (error) throw error;
  return data;
}

// Just enough of every send on the board to know who has sent what, without
// fetching each problem's log. Supabase hands back at most 1,000 rows a
// request (or whatever the project's cap is), so this reads a page at a time
// until one comes back empty -- ordered, so a send can't slip between pages.
const TICK_PAGE = 1000;

export async function listBoardTicks(boardId) {
  const all = [];
  for (;;) {
    const { data, error } = await supabase
      .from('ticks')
      .select('id, problem_id, sent_by, sent_on, created_at, flash, problems!inner(board_id)')
      .eq('problems.board_id', boardId)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .range(all.length, all.length + TICK_PAGE - 1);
    if (error) throw error;
    if (data.length === 0) return all;
    all.push(...data);
  }
}

export async function listBoardVotes(boardId) {
  const all = [];
  for (;;) {
    const { data, error } = await supabase
      .from('votes')
      .select('id, problem_id, climber, grade, feel, stars, created_at, problems!inner(board_id)')
      .eq('problems.board_id', boardId)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .range(all.length, all.length + TICK_PAGE - 1);
    if (error) throw error;
    if (data.length === 0) return all;
    all.push(...data);
  }
}

// A climber's one vote on a problem: a grade, stars, or both. Clearing both removes the row.
export async function saveVote(problemId, climber, { grade, feel, stars }) {
  if (grade == null && stars == null) {
    const { error } = await supabase.from('votes').delete().eq('problem_id', problemId).eq('climber', climber);
    if (error) throw error;
    return null;
  }
  const { data, error } = await supabase
    .from('votes')
    .upsert({ problem_id: problemId, climber, grade, feel: grade == null ? null : (feel ?? null), stars }, { onConflict: 'problem_id,climber' })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function createTick(problemId, { sentOn, notes, sentBy, flash = false }) {
  const { data, error } = await supabase
    .from('ticks')
    .insert({ problem_id: problemId, sent_on: sentOn, notes: notes.trim(), sent_by: sentBy, flash })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteTick(id) {
  const { error } = await supabase.from('ticks').delete().eq('id', id);
  if (error) throw error;
}

export async function deleteProblem(id) {
  const { error } = await supabase
    .from('problems')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

export async function restoreProblem(id) {
  const { data, error } = await supabase
    .from('problems')
    .update({ deleted_at: null })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function saveWarmup(boardId, rungs) {
  const { data, error } = await supabase
    .from('boards')
    .update({ warmup: rungs })
    .eq('id', boardId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function saveVolumes(boardId, volumes) {
  const { data, error } = await supabase
    .from('boards')
    .update({ volumes })
    .eq('id', boardId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function listWarmupSessions(boardId) {
  const { data, error } = await supabase
    .from('warmup_sessions')
    .select('*')
    .eq('board_id', boardId)
    .order('created_at', { ascending: false })
    .limit(10);
  if (error) throw error;
  return data;
}

export async function createWarmupSession(boardId, { doneOn, climbedBy, feel, problemIds, sentIds }) {
  const { data, error } = await supabase
    .from('warmup_sessions')
    .insert({ board_id: boardId, done_on: doneOn, climbed_by: climbedBy, feel, problem_ids: problemIds, sent_ids: sentIds })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteWarmupSession(id) {
  const { error } = await supabase.from('warmup_sessions').delete().eq('id', id);
  if (error) throw error;
}
