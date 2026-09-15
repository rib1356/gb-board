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
  const path = `${boardId}.jpg`;
  const { error: uploadError } = await supabase.storage
    .from('board-photos')
    .upload(path, blob, { upsert: true, contentType: 'image/jpeg' });
  if (uploadError) throw uploadError;

  const { data: publicUrlData } = supabase.storage.from('board-photos').getPublicUrl(path);
  const photoUrl = `${publicUrlData.publicUrl}?t=${Date.now()}`;

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

export async function createTick(problemId, { sentOn, notes, sentBy }) {
  const { data, error } = await supabase
    .from('ticks')
    .insert({ problem_id: problemId, sent_on: sentOn, notes: notes.trim(), sent_by: sentBy })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteTick(id) {
  const { error } = await supabase.from('ticks').delete().eq('id', id);
  if (error) throw error;
}

export async function rateProblem(id, rating) {
  const { data, error } = await supabase
    .from('problems')
    .update({ rating })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
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
