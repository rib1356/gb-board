import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import Sheet from './Sheet';
import PainSlider from './PainSlider';
import { checkinOn, newCheckinDraft, draftFromCheckin, planCheckinSave } from '../lib/checkins';
import { loadDraft, saveDraft, clearDraft } from '../lib/checkinDrafts';
import { injuryTitle, sheetDateLabel, shortDate, painValue, ACTIVITIES } from '../lib/injuries';
import { inputStyle, primaryButton, linkButton, sectionHeading } from '../ui';

const SAVE_ERROR = "Couldn't save — check your connection and try again.";
const ACCENT = '#D9552B';
const MIN_NOTE_ROWS = 4;

const heading = { ...sectionHeading, display: 'block', margin: '18px 0 6px' };
const quietButton = { background: 'none', border: 'none', color: '#8b8d91', fontSize: 13.5, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer', padding: '6px 0' };
const chip = (on) => ({
  background: on ? '#D9552B22' : 'transparent', border: `1px solid ${on ? ACCENT : '#3a3b3e'}`,
  color: on ? '#EDEAE3' : '#b8babd', borderRadius: 999, padding: '7px 12px',
  fontSize: 13, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer',
});
// Invisible, laid over the date text, so a tap opens the phone's own picker.
// 16px stops iOS zooming in on focus.
const dateInput = {
  position: 'absolute', inset: 0, width: '100%', height: '100%', boxSizing: 'border-box', margin: 0, padding: 0,
  border: 0, opacity: 0, fontSize: 16, cursor: 'pointer', WebkitAppearance: 'none', appearance: 'none',
};

// A draft left on this phone wins, then the check-in being edited, then
// today's if there is one (ready to add to), then a new one for today.
// openedAsEdit marks a check-in Rob chose to edit (or a draft of one); only
// that kind moves when the date changes.
function startingState({ injury, checkins, boardDays, today, editing }) {
  const stored = loadDraft(injury.id);
  if (stored) {
    const editingId = stored.editingId ?? null;
    return { draft: stored.draft, editingId, restored: true, openedAsEdit: Boolean(editingId) };
  }
  if (editing) return { draft: draftFromCheckin(editing), editingId: editing.id, restored: false, openedAsEdit: true };
  const sameDay = checkinOn(checkins, injury.id, today);
  if (sameDay) return { draft: draftFromCheckin(sameDay), editingId: sameDay.id, restored: false, openedAsEdit: false };
  return { draft: newCheckinDraft({ injuryId: injury.id, checkins, date: today, boardDays }), editingId: null, restored: false, openedAsEdit: false };
}

// "1 – 2", "1" when both ends match, with " / 7" for a spike.
function painReadout({ pain_low, pain_high, pain_peak }) {
  const low = painValue(pain_low);
  const high = painValue(pain_high);
  const range = low === high ? low : `${low} – ${high}`;
  return pain_peak == null ? range : `${range} / ${painValue(pain_peak)}`;
}

// Desktop browsers only open the calendar from its icon, which is hidden here.
// Left to the native tap on phones.
function openPicker(e) {
  if (e.nativeEvent.pointerType === 'mouse') e.currentTarget.showPicker?.();
}

export default function CheckinSheet({ injury, checkins, boardDays, today, editing, onSave, onDelete, onClose }) {
  const [start] = useState(() => startingState({ injury, checkins, boardDays, today, editing }));
  const [draft, setDraft] = useState(start.draft);
  const [editingId, setEditingId] = useState(start.editingId);
  // A restored draft was touched before it was stored, so it counts as touched:
  // picking a date can then never swap what was typed for another check-in.
  const [touched, setTouched] = useState(start.restored);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const notesRef = useRef(null);
  const notesId = useId();
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    if (touched) saveDraft(injury.id, { draft, editingId });
  }, [injury.id, touched, draft, editingId]);

  // rows grows with each line typed; a long line that wraps is caught here.
  useLayoutEffect(() => {
    const notes = notesRef.current;
    notes.style.height = '';
    if (notes.scrollHeight > notes.clientHeight) {
      notes.style.height = `${notes.scrollHeight + notes.offsetHeight - notes.clientHeight}px`;
    }
  }, [draft.notes]);

  const touch = (update) => {
    setDraft(update);
    setTouched(true);
  };

  const setPain = (low, high) => touch((d) => ({
    ...d,
    pain_low: low,
    pain_high: high,
    needsTouch: false,
    // The spike can't sit below the highest pain, so it rides up with it.
    pain_peak: d.pain_peak != null && high > d.pain_peak ? high : d.pain_peak,
  }));

  const toggleActivity = (value) => touch((d) => ({
    ...d,
    activities: d.activities.includes(value)
      ? d.activities.filter((a) => a !== value)
      : ACTIVITIES.map(([v]) => v).filter((v) => v === value || d.activities.includes(v)),
  }));

  const changeNotes = (e) => {
    const notes = e.target.value;
    touch((d) => ({ ...d, notes }));
  };

  const changeDate = (e) => {
    const date = e.target.value;
    if (!date) return;
    // Opened to edit, or once something's changed, only the date changes: a
    // check-in being edited moves with it, and a new one adds to any check-in
    // already on that date.
    if (touched || start.openedAsEdit) {
      setDraft((d) => ({ ...d, checked_on: date }));
      return;
    }
    // Untouched, and nothing Rob chose to edit: open the check-in already on
    // that day, or start afresh for it so Board follows that day's sends.
    const existing = checkinOn(checkins, injury.id, date);
    setConfirmingDelete(false);
    if (existing) {
      setDraft(draftFromCheckin(existing));
      setEditingId(existing.id);
    } else {
      setDraft(newCheckinDraft({ injuryId: injury.id, checkins, date, boardDays }));
      setEditingId(null);
    }
  };

  const existingOnDate = editingId ? null : checkinOn(checkins, injury.id, draft.checked_on);

  // Clears the draft and closes once the write lands; on a failure everything
  // stays as it was, draft included. Closed while the write was on its way and
  // opened again, the newer sheet stays open and keeps anything typed since:
  // only the draft that was sent is cleared.
  const finish = async (write) => {
    const sent = JSON.stringify({ draft, editingId });
    setBusy(true);
    setError('');
    try {
      await write();
    } catch {
      setError(SAVE_ERROR);
      setBusy(false);
      return;
    }
    if (JSON.stringify(loadDraft(injury.id)) === sent) clearDraft(injury.id);
    setBusy(false);
    if (mounted.current) onClose();
  };

  const save = () => finish(() => onSave(planCheckinSave({ draft, editingId, existingOnDate })));
  const remove = () => finish(() => onDelete(editingId));
  const discard = () => {
    clearDraft(injury.id);
    onClose();
  };

  const canSave = !draft.needsTouch && !busy;
  const lines = draft.notes.split('\n').length;

  return (
    <Sheet label={injuryTitle(injury)} onClose={onClose}>
      <div style={{ maxHeight: 'calc(90dvh - 32px)', overflowY: 'auto', overscrollBehavior: 'contain' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
          <h2 style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 24, letterSpacing: 1, margin: 0, color: '#EDEAE3' }}>{injuryTitle(injury)}</h2>
          <span style={{ position: 'relative', flexShrink: 0, padding: '12px 0 12px 12px', margin: '-6px 0', color: '#C08552', fontWeight: 600, fontSize: 13.5, whiteSpace: 'nowrap' }}>
            <span>{sheetDateLabel(draft.checked_on, today)}</span>
            <span aria-hidden="true"> ▾</span>
            <input type="date" aria-label="Check-in date" value={draft.checked_on} onChange={changeDate} onClick={openPicker} style={dateInput} />
          </span>
        </div>
        {existingOnDate && (
          <p role="status" style={{ background: '#232427', border: '1px solid #2A2B2E', borderRadius: 8, padding: '8px 10px', margin: '10px 0 0', fontSize: 13, color: '#EDEAE3' }}>
            {`There's already a check-in on ${shortDate(draft.checked_on, today)} — saving adds to it.`}
          </p>
        )}

        <h3 style={heading}>Pain</h3>
        <div data-testid="pain-readout" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 30, fontWeight: 700, color: ACCENT, lineHeight: 1.1, marginBottom: 4 }}>
          {painReadout(draft)}
        </div>
        <PainSlider low={draft.pain_low} high={draft.pain_high} onChange={setPain} />
        {draft.pain_peak == null ? (
          <button type="button" onClick={() => touch((d) => ({ ...d, pain_peak: d.pain_high }))} style={{ ...linkButton, fontSize: 13.5, marginTop: 8 }}>
            + Add a spike
          </button>
        ) : (
          <div style={{ marginTop: 8 }}>
            <PainSlider single low={draft.pain_peak} high={draft.pain_peak} min={draft.pain_high} label="Spike" onChange={(_, peak) => touch((d) => ({ ...d, pain_peak: peak }))} />
            <button type="button" onClick={() => touch((d) => ({ ...d, pain_peak: null }))} style={{ ...linkButton, fontSize: 13.5, marginTop: 4 }}>
              Remove spike
            </button>
          </div>
        )}

        <h3 style={heading}>What you did <span style={{ textTransform: 'none', fontWeight: 400 }}>(optional)</span></h3>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {ACTIVITIES.map(([value, label]) => {
            const on = draft.activities.includes(value);
            return <button key={value} type="button" aria-pressed={on} onClick={() => toggleActivity(value)} style={chip(on)}>{label}</button>;
          })}
        </div>

        <label htmlFor={notesId} style={heading}>How's it feeling?</label>
        <textarea
          id={notesId}
          ref={notesRef}
          value={draft.notes}
          onChange={changeNotes}
          rows={Math.max(MIN_NOTE_ROWS, lines + 1)}
          style={{ ...inputStyle, marginTop: 0, display: 'block', fontSize: 16, lineHeight: 1.45, whiteSpace: 'pre-wrap', resize: 'none' }}
        />

        {error && <p role="alert" style={{ color: ACCENT, fontSize: 13, margin: '10px 0 0' }}>{error}</p>}
        <button type="button" onClick={save} disabled={!canSave} style={{ ...primaryButton(canSave), width: '100%', marginTop: 14 }}>Save check-in</button>

        {(touched || editingId) && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 8 }}>
            {touched && !confirmingDelete ? <button type="button" onClick={discard} style={quietButton}>Discard</button> : <span />}
            {editingId && (confirmingDelete ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 13.5, color: '#EDEAE3' }}>Delete this check-in?</span>
                <button type="button" onClick={remove} disabled={busy} style={{ ...primaryButton(!busy), padding: '7px 12px', fontSize: 13.5 }}>Delete</button>
                <button type="button" onClick={() => setConfirmingDelete(false)} style={quietButton}>Keep</button>
              </div>
            ) : (
              <button type="button" onClick={() => setConfirmingDelete(true)} style={quietButton}>Delete</button>
            ))}
          </div>
        )}
      </div>
    </Sheet>
  );
}
