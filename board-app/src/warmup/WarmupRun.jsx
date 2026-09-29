import { useState, useEffect } from 'react';
import { CheckCircle2, Circle, Play, RefreshCw } from 'lucide-react';
import { FEELS, rollLadder, rerollRung, canReroll, nextUnsentIndex, sessionPayload } from '../lib/warmup';
import { gradeBadgeStyle, sectionHeading, linkButton, primaryButton, rungRow } from '../ui';

const SKIP_LABELS = { removed: 'Problem removed' };

export default function WarmupRun({ rungs, problems, climberName, onFocus, onSend, onFinish, onDiscard }) {
  const [rolled, setRolled] = useState(() => rollLadder(rungs, problems));
  const [sentIds, setSentIds] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(() => nextUnsentIndex(rolled, [], -1));
  const [sending, setSending] = useState(false);
  const [finishing, setFinishing] = useState(currentIndex === -1);
  const [savingSession, setSavingSession] = useState(false);

  const climbable = rolled.filter((e) => e.problem).length;
  const current = rolled[currentIndex];
  const currentProblemId = current?.problem?.id ?? null;

  useEffect(() => { onFocus(currentProblemId); }, [currentProblemId, onFocus]);

  const handleSend = async () => {
    if (!current?.problem) return;
    setSending(true);
    const ok = await onSend(current.problem.id);
    setSending(false);
    if (!ok) return;
    const nextSent = [...sentIds, current.problem.id];
    setSentIds(nextSent);
    const next = nextUnsentIndex(rolled, nextSent, currentIndex);
    if (next === -1) setFinishing(true);
    else setCurrentIndex(next);
  };

  const handleFeel = async (feel) => {
    setSavingSession(true);
    const ok = await onFinish({ feel, ...sessionPayload(rolled, sentIds) });
    if (!ok) setSavingSession(false);
  };

  const hasUnsent = nextUnsentIndex(rolled, sentIds, -1) !== -1;

  return (
    <div style={{ marginTop: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <span style={{ fontSize: 14, fontWeight: 600 }}>{`${climberName} · ${sentIds.length}/${climbable}`}</span>
        {!finishing && <button onClick={() => setFinishing(true)} style={linkButton}>End</button>}
      </div>

      {finishing && (
        <div style={{ background: '#232427', border: '1px solid #3a3b3e', borderRadius: 12, padding: 16, marginBottom: 14 }}>
          <p style={{ margin: '0 0 4px', fontWeight: 700 }}>{`Warm-up done · ${sentIds.length} / ${climbable}`}</p>
          <p style={{ margin: '0 0 12px', fontSize: 13.5, color: '#8b8d91' }}>How did it feel?</p>
          <div style={{ display: 'flex', gap: 8 }}>
            {FEELS.map((f) => (
              <button key={f.value} disabled={savingSession} onClick={() => handleFeel(f.value)} style={{ ...primaryButton(!savingSession), flex: 1 }}>{f.label}</button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 16, marginTop: 12 }}>
            {hasUnsent && <button onClick={() => setFinishing(false)} style={linkButton}>Keep going</button>}
            <button onClick={onDiscard} style={{ ...linkButton, color: '#8b8d91' }}>Discard</button>
          </div>
        </div>
      )}

      <h2 style={sectionHeading}>Ladder</h2>
      {rolled.map((entry, i) => {
        const n = i + 1;
        const sent = entry.problem && sentIds.includes(entry.problem.id);
        const isCurrent = i === currentIndex && !finishing;
        const skipped = !entry.problem;
        const label = entry.problem
          ? entry.problem.name
          : SKIP_LABELS[entry.status] || `No ${entry.grade}s on the board`;
        return (
          <div key={i} style={{ ...rungRow(isCurrent, skipped), cursor: skipped ? 'default' : 'pointer' }}
            onClick={() => { if (!skipped && !finishing) setCurrentIndex(i); }}>
            {sent ? <CheckCircle2 size={16} color="#5C8A66" /> : isCurrent ? <Play size={16} color="#D9552B" /> : <Circle size={16} color="#6d6f73" />}
            <span style={gradeBadgeStyle}>{entry.grade}</span>
            <span style={{ flex: 1 }}>
              {label}
              {entry.status === 'unsent-fallback' && <span style={{ fontSize: 11, color: '#8b8d91', marginLeft: 6 }}>not sent yet</span>}
            </span>
            {entry.random && !sent && !finishing && (
              <button
                aria-label={`Re-roll rung ${n}`}
                title={canReroll(rolled, i, problems) ? 'Re-roll' : `only one ${entry.grade}`}
                disabled={!canReroll(rolled, i, problems)}
                onClick={(e) => { e.stopPropagation(); setRolled((prev) => rerollRung(prev, i, problems)); }}
                style={{ background: 'none', border: 'none', color: '#C08552', cursor: 'pointer', padding: 4, display: 'flex' }}
              ><RefreshCw size={15} /></button>
            )}
            {isCurrent && !sent && (
              <button
                aria-label={`Sent ${entry.problem.name}`}
                disabled={sending}
                onClick={(e) => { e.stopPropagation(); handleSend(); }}
                style={{ ...primaryButton(!sending), padding: '7px 12px', fontSize: 13 }}
              >Sent ✓</button>
            )}
          </div>
        );
      })}
    </div>
  );
}
