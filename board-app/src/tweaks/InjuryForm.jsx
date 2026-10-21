import { useId, useState } from 'react';
import { AREAS, FINGERS, SIDES, injuryStart, injuryTitle, monthYear, normaliseInjury, sameSpot } from '../lib/injuries';
import { inputStyle, linkButton, primaryButton, sectionHeading } from '../ui';

const SAVE_ERROR = "Couldn't save — check your connection and try again.";
const ACCENT = '#D9552B';

const heading = { ...sectionHeading, display: 'block', margin: '16px 0 6px' };
const textInput = { ...inputStyle, marginTop: 0, display: 'block', fontSize: 16, lineHeight: 1.45 };
const quietButton = { background: 'none', border: 'none', color: '#8b8d91', fontSize: 13.5, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer', padding: '6px 0' };
const chip = (on) => ({
  background: on ? '#D9552B22' : 'transparent', border: `1px solid ${on ? ACCENT : '#3a3b3e'}`,
  color: on ? '#EDEAE3' : '#b8babd', borderRadius: 999, padding: '7px 12px',
  fontSize: 13, fontWeight: on ? 600 : 500, fontFamily: 'inherit', cursor: 'pointer',
});

const blank = {
  side: null, area: null, finger: null, area_other: '', what: '', symptoms: '',
  started_on: '', started_roughly: false, how_it_happened: '',
};

function fromInjury(injury) {
  if (!injury) return blank;
  return {
    side: injury.side, area: injury.area, finger: injury.finger, area_other: injury.area_other ?? '',
    what: injury.what ?? '', symptoms: injury.symptoms ?? '', started_on: injury.started_on ?? '',
    started_roughly: Boolean(injury.started_roughly), how_it_happened: injury.how_it_happened ?? '',
  };
}

function Chips({ label, options, value, onPick }) {
  return (
    <div role="group" aria-label={label}>
      <span style={heading} aria-hidden="true">{label}</span>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {options.map(([v, text]) => (
          <button key={v} type="button" aria-pressed={value === v} onClick={() => onPick(v)} style={chip(value === v)}>{text}</button>
        ))}
      </div>
    </div>
  );
}

function Field({ label, children }) {
  const id = useId();
  return (
    <>
      <label htmlFor={id} style={heading}>{label}</label>
      {children(id)}
    </>
  );
}

export default function InjuryForm({ injury, injuries, checkins, onSubmit, onReopenInstead, onCheckInInstead, onDelete }) {
  const [form, setForm] = useState(() => fromInjury(injury));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const whereId = useId();
  const roughlyId = useId();

  const set = (key) => (value) => setForm((f) => ({ ...f, [key]: value }));
  const onText = (key) => (e) => set(key)(e.target.value);

  const spotChosen = Boolean(form.side && form.area)
    && (form.area !== 'finger' || Boolean(form.finger))
    && (form.area !== 'other' || form.area_other.trim() !== '');
  const matches = !injury && spotChosen ? sameSpot(form, injuries) : [];
  // An open log is the one worth checking in on, otherwise the newest closed one.
  const target = matches.find((m) => !m.closed_on) ?? matches[0];

  const run = async (write) => {
    setBusy(true);
    setError('');
    try {
      await write();
    } catch {
      setError(SAVE_ERROR);
    }
    setBusy(false);
  };

  const submit = (e) => {
    e.preventDefault();
    if (spotChosen && !busy) run(() => onSubmit(normaliseInjury(form)));
  };

  const canSubmit = spotChosen && !busy;

  return (
    <form onSubmit={submit} noValidate>
      <Chips label="Side" options={SIDES} value={form.side} onPick={set('side')} />
      <Chips label="Where" options={AREAS} value={form.area} onPick={set('area')} />
      {form.area === 'finger' && <Chips label="Which finger" options={FINGERS} value={form.finger} onPick={set('finger')} />}
      {form.area === 'other' && (
        <>
          <label htmlFor={whereId} style={heading}>Where?</label>
          <input id={whereId} value={form.area_other} onChange={onText('area_other')} style={textInput} />
        </>
      )}

      {spotChosen && (
        <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 22, letterSpacing: 1.2, color: '#EDEAE3', marginTop: 14, textTransform: 'uppercase' }}>
          {injuryTitle(form)}
        </div>
      )}

      {target && (
        <div role="status" style={{ background: '#C0855214', border: '1px solid #C0855255', borderRadius: 10, padding: '9px 11px', fontSize: 13, lineHeight: 1.45, marginTop: 10 }}>
          <b>You've logged this before:</b>
          {matches.map((m) => (
            <div key={m.id}>{[m.what, monthYear(injuryStart(m, checkins))].filter(Boolean).join(' · ')}</div>
          ))}
          <button
            type="button"
            onClick={() => (target.closed_on ? onReopenInstead(target.id) : onCheckInInstead(target.id))}
            style={{ ...linkButton, fontSize: 13, marginTop: 4 }}
          >
            {target.closed_on ? 'Reopen that log instead?' : 'Check in on that one instead?'}
          </button>
        </div>
      )}

      <Field label="What is it">{(id) => <input id={id} value={form.what} onChange={onText('what')} style={textInput} />}</Field>
      <Field label="Symptoms">{(id) => <textarea id={id} rows={4} value={form.symptoms} onChange={onText('symptoms')} style={{ ...textInput, resize: 'vertical' }} />}</Field>
      <label htmlFor={`${roughlyId}-date`} style={heading}>When did it start</label>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <input
          id={`${roughlyId}-date`} type="date" value={form.started_on} onChange={onText('started_on')}
          style={{ ...textInput, flex: 1, width: 'auto', minWidth: 0 }}
        />
        <label htmlFor={roughlyId} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13.5, color: '#EDEAE3' }}>
          <input id={roughlyId} type="checkbox" checked={form.started_roughly} onChange={(e) => set('started_roughly')(e.target.checked)} />
          Roughly
        </label>
      </div>
      <Field label="How it happened">{(id) => <textarea id={id} rows={3} value={form.how_it_happened} onChange={onText('how_it_happened')} style={{ ...textInput, resize: 'vertical' }} />}</Field>

      {error && <p role="alert" style={{ color: ACCENT, fontSize: 13, margin: '12px 0 0' }}>{error}</p>}
      <button type="submit" disabled={!canSubmit} style={{ ...primaryButton(canSubmit), width: '100%', marginTop: 16 }}>
        {injury ? 'Save' : 'Start log'}
      </button>

      {injury && onDelete && (
        <div style={{ marginTop: 14 }}>
          {confirmingDelete ? (
            <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
              <span style={{ fontSize: 13.5, color: '#EDEAE3' }}>Delete this injury and all its check-ins?</span>
              <button type="button" onClick={() => run(onDelete)} disabled={busy} style={{ ...primaryButton(!busy), padding: '7px 12px', fontSize: 13.5 }}>Delete</button>
              <button type="button" onClick={() => setConfirmingDelete(false)} style={quietButton}>Keep</button>
            </div>
          ) : (
            <button type="button" onClick={() => setConfirmingDelete(true)} style={quietButton}>Delete this injury</button>
          )}
        </div>
      )}
    </form>
  );
}
