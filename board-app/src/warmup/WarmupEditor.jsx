import { useState } from 'react';
import { ChevronUp, ChevronDown, X, RefreshCw } from 'lucide-react';
import { GRADES } from '../lib/grades';
import { sortAndFilterProblems } from '../lib/problemList';
import { inputStyle, gradeBadgeStyle, sectionHeading, linkButton, primaryButton, rungRow } from '../ui';

// picker: null | { mode: 'problem', index: number|null } | { mode: 'grade' }
// index null = append a new rung; a number = replace that rung.
export default function WarmupEditor({ initialRungs, problems, saving, onSave, onCancel }) {
  const [rungs, setRungs] = useState(initialRungs);
  const [picker, setPicker] = useState(null);
  const [search, setSearch] = useState('');
  const byId = new Map(problems.map((p) => [p.id, p]));

  const move = (i, delta) => setRungs((prev) => {
    const next = [...prev];
    [next[i], next[i + delta]] = [next[i + delta], next[i]];
    return next;
  });
  const remove = (i) => setRungs((prev) => prev.filter((_, j) => j !== i));
  const place = (index, rung) => {
    setRungs((prev) => (index === null ? [...prev, rung] : prev.map((r, j) => (j === index ? rung : r))));
    setPicker(null);
    setSearch('');
  };

  // A problem can only sit on one rung -- ticks are tracked per problem, so a
  // duplicate would mark both rungs sent at once. The rung being changed keeps
  // its own problem pickable.
  const inLadder = new Set(rungs.filter((r, j) => r.problemId && j !== picker?.index).map((r) => r.problemId));
  const pickable = sortAndFilterProblems(problems, { sort: 'grade-asc' })
    .filter((p) => !inLadder.has(p.id))
    .filter((p) => p.name.toLowerCase().includes(search.trim().toLowerCase()));

  return (
    <div style={{ marginTop: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <h2 style={sectionHeading}>Edit ladder</h2>
        <button onClick={() => onSave(rungs)} disabled={saving} style={primaryButton(!saving)}>Done</button>
      </div>

      {rungs.map((rung, i) => {
        const problem = rung.problemId ? byId.get(rung.problemId) : null;
        const n = i + 1;
        return (
          <div key={i} style={{ ...rungRow(false, rung.problemId && !problem), cursor: 'default' }}>
            <span style={{ display: 'flex', flexDirection: 'column' }}>
              <button aria-label={`Move rung ${n} up`} disabled={i === 0} onClick={() => move(i, -1)} style={iconButton}><ChevronUp size={14} /></button>
              <button aria-label={`Move rung ${n} down`} disabled={i === rungs.length - 1} onClick={() => move(i, 1)} style={iconButton}><ChevronDown size={14} /></button>
            </span>
            <span style={gradeBadgeStyle}>{rung.grade}</span>
            <span style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6 }}>
              {!rung.problemId && <><RefreshCw size={13} /> random</>}
              {problem && problem.name}
              {rung.problemId && !problem && 'Problem removed'}
            </span>
            <button aria-label={`Change rung ${n}`} onClick={() => setPicker({ mode: 'problem', index: i })} style={linkButton}>Change</button>
            <button aria-label={`Remove rung ${n}`} onClick={() => remove(i)} style={iconButton}><X size={16} /></button>
          </div>
        );
      })}

      {!picker && (
        <div style={{ display: 'flex', gap: 14, marginTop: 6 }}>
          <button onClick={() => setPicker({ mode: 'problem', index: null })} style={linkButton}>+ Add a problem</button>
          <button onClick={() => setPicker({ mode: 'grade' })} style={linkButton}>+ Add random slot</button>
        </div>
      )}

      {picker?.mode === 'grade' && (
        <div style={{ marginTop: 10 }}>
          <h2 style={sectionHeading}>Random slot grade</h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {GRADES.map((g) => (
              <button key={g} onClick={() => place(null, { grade: g, problemId: null })} style={{ ...gradeBadgeStyle, cursor: 'pointer' }}>{g}</button>
            ))}
          </div>
          <button onClick={() => setPicker(null)} style={{ ...linkButton, marginTop: 10 }}>Cancel</button>
        </div>
      )}

      {picker?.mode === 'problem' && (
        <div style={{ marginTop: 10 }}>
          <input aria-label="Search problems" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search problems" style={inputStyle} />
          {picker.index !== null && (
            <button
              onClick={() => place(picker.index, { grade: rungs[picker.index].grade, problemId: null })}
              style={{ ...linkButton, margin: '10px 0' }}
            >{`Make this a random ${rungs[picker.index].grade}`}</button>
          )}
          <div style={{ maxHeight: 280, overflowY: 'auto', marginTop: 8 }}>
            {pickable.map((p) => (
              <button key={p.id} disabled={!p.grade} onClick={() => place(picker.index, { grade: p.grade, problemId: p.id })} style={rungRow(false, !p.grade)}>
                <span style={gradeBadgeStyle}>{p.grade || '—'}</span>
                <span style={{ flex: 1, textAlign: 'left' }}>{p.name}</span>
              </button>
            ))}
          </div>
          <button onClick={() => { setPicker(null); setSearch(''); }} style={{ ...linkButton, marginTop: 10 }}>Cancel</button>
        </div>
      )}

      <button onClick={onCancel} style={{ ...linkButton, marginTop: 18, color: '#8b8d91' }}>Discard changes</button>
    </div>
  );
}

const iconButton = { background: 'none', border: 'none', color: '#8b8d91', cursor: 'pointer', padding: 2, display: 'flex' };
