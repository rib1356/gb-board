import { Trash2 } from 'lucide-react';
import { GRIPS } from '../lib/volumes';
import { primaryButton } from '../ui';

const TYPE_NAMES = { start: 'Start hold', hold: 'Hold', foot: 'Foothold', finish: 'Finish hold' };
const HANDS = [{ value: 'L', name: 'Left hand' }, { value: 'R', name: 'Right hand' }];

function Row({ label, children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
      <span style={{ width: 44, fontSize: 12, color: '#8b8d91', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4 }}>{label}</span>
      {children}
    </div>
  );
}

export default function HoldMenu({ hold, label, color, onChange, onRemove, onDone }) {
  const title = hold.face ? `${label} · ${hold.type}` : TYPE_NAMES[hold.type];
  // One hand and one grip at most; tapping the selected one clears it.
  const toggle = (field, value) => onChange({ [field]: hold[field] === value ? undefined : value });
  const chip = (selected) => ({
    padding: '6px 11px', borderRadius: 999, fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
    border: `1px solid ${selected ? color : '#3a3b3e'}`, background: selected ? color : 'transparent',
    color: selected ? '#17181A' : '#c7c8cb',
  });
  return (
    <div role="group" aria-label="Hold menu" style={{ background: '#232427', border: `1px solid ${color}`, borderRadius: 12, padding: 12, marginBottom: 14 }}>
      <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color, marginBottom: 10 }}>{title}</div>
      <Row label="Hand">
        {HANDS.map((h) => (
          <button key={h.value} aria-label={h.name} aria-pressed={hold.hand === h.value} onClick={() => toggle('hand', h.value)} style={chip(hold.hand === h.value)}>{h.value}</button>
        ))}
      </Row>
      <Row label="Grip">
        {GRIPS.map((g) => (
          <button key={g.value} aria-pressed={hold.grip === g.value} onClick={() => toggle('grip', g.value)} style={chip(hold.grip === g.value)}>{g.label}</button>
        ))}
      </Row>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
        <button onClick={onRemove} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', color: '#D9552B', fontWeight: 600, fontSize: 13.5, cursor: 'pointer', padding: 0 }}>
          <Trash2 size={14} /> Remove
        </button>
        <button onClick={onDone} style={primaryButton(true)}>Done</button>
      </div>
    </div>
  );
}
