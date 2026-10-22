import { Star } from 'lucide-react';
import { gradeVoteLabel } from '../lib/votes';

const labelStyle = { width: '100%', fontSize: 12.5, fontWeight: 700, color: '#8b8d91' };
const rowStyle = { display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 10 };

function chipStyle(picked) {
  return {
    padding: '6px 9px', borderRadius: 6, fontSize: 13, fontFamily: "'JetBrains Mono', monospace",
    fontWeight: 700, cursor: 'pointer', border: '1px solid #3a3b3e',
    background: picked ? '#D9552B' : 'transparent', color: picked ? '#17181A' : '#c7c8cb',
  };
}

// A climber's grade and star vote. Presentational: it reports both values on
// every change, and tapping the picked value again clears just that one.
export default function VotePicker({ choices, grade, feel, stars, onChange, disabled = false }) {
  return (
    <div>
      {choices.length > 0 && (
        <div role="group" aria-label="Grade vote" style={rowStyle}>
          <span style={labelStyle}>Grade</span>
          {choices.map((c) => {
            const picked = c.grade === grade && c.feel === (feel ?? null);
            const label = gradeVoteLabel(c);
            return (
              <button
                key={label}
                type="button"
                aria-pressed={picked}
                disabled={disabled}
                onClick={() => onChange(picked ? { grade: null, feel: null, stars } : { grade: c.grade, feel: c.feel, stars })}
                style={chipStyle(picked)}
              >
                {label}
              </button>
            );
          })}
        </div>
      )}
      <div role="group" aria-label="Star vote" style={rowStyle}>
        <span style={labelStyle}>Stars</span>
        {[1, 2, 3, 4, 5].map((n) => {
          const filled = stars != null && n <= stars;
          return (
            <button
              key={n}
              type="button"
              aria-label={`${n} star${n > 1 ? 's' : ''}`}
              aria-pressed={n === stars}
              disabled={disabled}
              onClick={() => onChange({ grade, feel: feel ?? null, stars: n === stars ? null : n })}
              style={{ background: 'none', border: 'none', padding: 2, cursor: 'pointer' }}
            >
              <Star size={22} fill={filled ? '#D9552B' : 'none'} color={filled ? '#D9552B' : '#8b8d91'} />
            </button>
          );
        })}
      </div>
    </div>
  );
}
