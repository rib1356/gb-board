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

export async function createProblem(boardId, { name, grade, setter, notes, holds }) {
  const { data, error } = await supabase
    .from('problems')
    .insert({
      board_id: boardId,
      name: name.trim(),
      grade: grade.trim(),
      setter: setter.trim(),
      notes: notes.trim(),
      holds,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateProblem(id, { name, grade, setter, notes }) {
  const { data, error } = await supabase
    .from('problems')
    .update({
      name: name.trim(),
      grade: grade.trim(),
      setter: setter.trim(),
      notes: notes.trim(),
    })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
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
  const { error } = await supabase.from('problems').delete().eq('id', id);
  if (error) throw error;
}
