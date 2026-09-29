import { useState, useEffect } from 'react';
import { Pencil, RefreshCw } from 'lucide-react';
import { FEELS } from '../lib/warmup';
import { formatShortDate, gradeBadgeStyle, sectionHeading, linkButton, primaryButton, rungRow } from '../ui';

const FEEL_LABELS = Object.fromEntries(FEELS.map((f) => [f.value, f.label]));

export default function WarmupScreen({ rungs, problems, sessions, climber, onFocus, onEdit, onStart }) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const byId = new Map(problems.map((p) => [p.id, p]));
  const focusedId = rungs[selectedIndex]?.problemId;
  const focusedProblemId = focusedId && byId.has(focusedId) ? focusedId : null;

  useEffect(() => { onFocus(focusedProblemId); }, [focusedProblemId, onFocus]);

  if (rungs.length === 0) {
    return (
      <div style={{ marginTop: 22, textAlign: 'center', padding: '20px 10px', color: '#8b8d91' }}>
        <p style={{ fontSize: 15, fontWeight: 600, color: '#EDEAE3', margin: '0 0 6px' }}>No warm-up yet</p>
        <p style={{ fontSize: 13.5, margin: '0 0 14px' }}>Pick the problems you like to warm up on, and add random slots for variety.</p>
        <button onClick={onEdit} style={primaryButton(true)}>Build your ladder</button>
      </div>
    );
  }

  const canStart = Boolean(climber);
  return (
    <div style={{ marginTop: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <h2 style={sectionHeading}>Warm-up ladder · {rungs.length} rungs</h2>
        <button onClick={onEdit} style={linkButton}><Pencil size={14} /> Edit</button>
      </div>
      {rungs.map((rung, i) => {
        const problem = rung.problemId ? byId.get(rung.problemId) : null;
        const removed = rung.problemId && !problem;
        return (
          <button key={i} onClick={() => setSelectedIndex(i)} style={rungRow(i === selectedIndex, removed)}>
            <span style={{ color: '#8b8d91', width: 18 }}>{i + 1}</span>
            <span style={gradeBadgeStyle}>{rung.grade}</span>
            <span style={{ flex: 1, textAlign: 'left', display: 'flex', alignItems: 'center', gap: 6 }}>
              {!rung.problemId && <><RefreshCw size={13} /><span>random {rung.grade}</span></>}
              {problem && problem.name}
              {removed && 'Problem removed'}
            </span>
          </button>
        );
      })}
      <button onClick={onStart} disabled={!canStart} style={{ ...primaryButton(canStart), width: '100%', marginTop: 8 }}>
        {canStart ? 'Start warm-up' : 'Select who you are first'}
      </button>

      {sessions.length > 0 && (
        <div style={{ marginTop: 22 }}>
          <h2 style={sectionHeading}>Last sessions</h2>
          {sessions.map((s) => (
            <div key={s.id} style={{ fontSize: 13.5, color: '#c7c8cb', padding: '6px 0', borderBottom: '1px solid #2A2B2E' }}>
              {[formatShortDate(s.done_on), s.climbed_by, FEEL_LABELS[s.feel], `${s.sent_ids.length}/${s.problem_ids.length}`].filter(Boolean).join(' · ')}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

