import { Check } from 'lucide-react';

// One tap logs today as a session on the problem; a second tap undoes it.
export default function WorkedButton({ worked, onClick }) {
  return (
    <button type="button" aria-pressed={worked} onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: 6, borderRadius: 8, padding: '8px 12px', fontSize: 13, cursor: 'pointer',
      border: '1px solid #C08552',
      background: worked ? '#C08552' : 'none',
      color: worked ? '#17181A' : '#C08552',
      fontWeight: worked ? 700 : 600,
    }}>
      {worked ? <>Worked today <Check size={14} aria-hidden="true" /></> : 'Worked it today'}
    </button>
  );
}
