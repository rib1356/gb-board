import { useState } from 'react';
import { checkinsFor } from '../lib/checkins';
import {
  ACTIVITIES, dayLabel, formatPain, injuryStart, injuryTitle, monthYear, sameSpot, startLine,
} from '../lib/injuries';
import { linkButton, primaryButton, sectionHeading } from '../ui';
import PainChart from './PainChart';

const bebas = "'Bebas Neue', sans-serif";
const mono = "'JetBrains Mono', monospace";
const activityLabel = Object.fromEntries(ACTIVITIES);

const card = {
  width: '100%', display: 'block', textAlign: 'left', background: '#232427', border: '1px solid #2A2B2E',
  borderRadius: 12, padding: '11px 12px', marginBottom: 8, color: '#EDEAE3', fontSize: 14, cursor: 'pointer', fontFamily: "'Inter'",
};
const tag = { fontSize: 11, border: '1px solid #3a3b3e', borderRadius: 999, padding: '2px 8px', color: '#b9bbbf' };

function Detail({ heading, text }) {
  if (!text) return null;
  return (
    <div style={{ marginTop: 10 }}>
      <h3 style={{ ...sectionHeading, margin: '0 0 4px' }}>{heading}</h3>
      <div style={{ fontSize: 14, whiteSpace: 'pre-wrap' }}>{text}</div>
    </div>
  );
}

export default function InjuryPage({
  injury, injuries, checkins, boardDays, today,
  onCheckIn, onEditCheckin, onEdit, onClose, onReopen, onOpenInjury,
}) {
  const [more, setMore] = useState(false);
  const mine = checkinsFor(checkins, injury.id);
  const closed = Boolean(injury.closed_on);
  const last = mine[0]?.checked_on;
  const endDate = closed ? last : (last && last > today ? last : today);
  const before = sameSpot(injury, injuries, injury.id);
  const hasMore = Boolean(injury.symptoms || injury.how_it_happened);

  return (
    <div style={{ paddingBottom: closed ? 24 : 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{
          borderRadius: 999, padding: '2px 8px', fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4,
          background: closed ? '#3a3b3e' : '#D9552B', color: closed ? '#EDEAE3' : '#17181A',
        }}>{closed ? 'Closed' : 'Open'}</span>
        <button onClick={onEdit} style={linkButton}>Edit</button>
      </div>

      <h1 style={{ fontFamily: bebas, fontSize: 28, letterSpacing: 1.5, margin: '8px 0 6px', color: '#EDEAE3' }}>
        {injuryTitle(injury).toUpperCase()}
      </h1>
      {injury.what && <div style={{ fontSize: 14.5 }}>{injury.what}</div>}
      <div style={{ fontSize: 13, color: '#8b8d91', marginTop: 2 }}>{startLine(injury)}</div>
      {hasMore && (
        <>
          <button onClick={() => setMore(!more)} style={{ ...linkButton, marginTop: 8, fontSize: 13.5 }}>{more ? 'less' : 'more'}</button>
          {more && (
            <>
              <Detail heading="Symptoms" text={injury.symptoms} />
              <Detail heading="How it happened" text={injury.how_it_happened} />
            </>
          )}
        </>
      )}

      <div style={{ margin: '16px 0' }}>
        <PainChart checkins={mine} endDate={endDate} boardDays={boardDays} />
      </div>

      {before.length > 0 && (
        <>
          <h2 style={sectionHeading}>Same spot before</h2>
          {before.map((other) => (
            <button key={other.id} onClick={() => onOpenInjury(other.id)} style={{ ...card, color: '#C08552', fontWeight: 600 }}>
              {`${injuryTitle(other)} · ${other.what ?? ''} · ${monthYear(injuryStart(other, checkins))}`}
            </button>
          ))}
        </>
      )}

      <h2 style={{ ...sectionHeading, marginTop: before.length > 0 ? 16 : 0 }}>Check-ins</h2>
      {mine.length === 0 && <div style={{ fontSize: 13.5, color: '#8b8d91' }}>No check-ins yet.</div>}
      {mine.map((c) => (
        <button key={c.id} onClick={() => onEditCheckin(c)} style={card}>
          <span style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
            <span style={{ fontWeight: 600 }}>{dayLabel(c.checked_on, today)}</span>
            <span style={{ fontFamily: mono, fontWeight: 700, fontSize: 13, color: '#D9552B' }}>{formatPain(c)}</span>
          </span>
          {c.activities.length > 0 && (
            <span style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
              {c.activities.map((a) => <span key={a} style={tag}>{activityLabel[a] ?? a}</span>)}
            </span>
          )}
          {c.notes && <span style={{ display: 'block', marginTop: 6, fontSize: 13.5, color: '#b9bbbf', whiteSpace: 'pre-wrap' }}>{c.notes}</span>}
        </button>
      ))}

      {closed ? (
        <button onClick={onReopen} style={{ ...primaryButton(true), width: '100%', marginTop: 12 }}>Reopen</button>
      ) : (
        <>
          <div style={{ position: 'sticky', bottom: 0, padding: '12px 0', background: '#17181A' }}>
            <button onClick={onCheckIn} style={{ ...primaryButton(true), width: '100%' }}>Check in</button>
          </div>
          <button onClick={onClose} style={{ ...linkButton, color: '#8b8d91', margin: '4px auto 24px' }}>Close this log</button>
        </>
      )}
    </div>
  );
}
