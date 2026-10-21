import { ChevronDown, Zap } from 'lucide-react';
import { buildLogbook } from '../lib/sends';
import { monthOf } from '../lib/dates';
import { sectionHeading, visuallyHidden } from '../ui';

const mono = "'JetBrains Mono', monospace";

const count = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

// No year -- that's in the month headings, so a row fits on one line on a phone.
function formatDay(dateStr) {
  const d = new Date(`${dateStr}T00:00:00`);
  const weekday = d.toLocaleDateString('en-GB', { weekday: 'short' });
  return `${weekday} ${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`;
}

function formatMonth(month) {
  return new Date(`${month}-01T00:00:00`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
}

const badge = { borderRadius: 999, padding: '2px 8px', fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4 };

function Day({ day, open, onToggle, onOpenProblem }) {
  const fresh = day.problems.filter((p) => p.firstSend).length;
  const flashed = day.problems.filter((p) => p.flashed).length;
  const summary = [count(day.problems.length, 'problem'), fresh > 0 && `${fresh} new`].filter(Boolean).join(' · ');

  return (
    <section style={{ background: '#232427', border: '1px solid #2A2B2E', borderRadius: 12, marginBottom: 8, overflow: 'hidden' }}>
      <button aria-expanded={open} onClick={onToggle} style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: 10, background: 'none', border: 'none',
        color: '#EDEAE3', padding: '12px 14px', cursor: 'pointer', textAlign: 'left',
      }}>
        {/* Always one line: on a very narrow phone the counts give way with an
            ellipsis rather than dropping under the date. */}
        <span style={{ flex: 1, minWidth: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
          <span style={{ fontWeight: 600, fontSize: 14.5, whiteSpace: 'nowrap' }}>{formatDay(day.date)}</span>
          <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12.5, color: '#8b8d91' }}>
            {summary}
            {flashed > 0 && (
              <>
                {' · '}
                <Zap size={12} color="#C9A227" aria-hidden="true" style={{ verticalAlign: -1, marginRight: 2 }} />
                {flashed}{' '}
                <span style={visuallyHidden}>{flashed === 1 ? 'flash' : 'flashes'}</span>
              </>
            )}
          </span>
        </span>
        <ChevronDown size={16} color="#8b8d91" aria-hidden="true" style={{ flexShrink: 0, transform: open ? 'rotate(180deg)' : 'none' }} />
      </button>
      {open && (
        <ul style={{ listStyle: 'none', margin: 0, padding: '0 6px 6px' }}>
          {day.problems.map((p) => (
            <li key={p.id}>
              <button onClick={() => onOpenProblem(p.id)} style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 10, background: 'none', border: 'none',
                borderTop: '1px solid #2A2B2E', color: '#EDEAE3', padding: '10px 8px', cursor: 'pointer', textAlign: 'left',
              }}>
                <span style={{ width: 34, flexShrink: 0, fontFamily: mono, fontSize: 13, fontWeight: 700, color: '#D9552B' }}>{p.grade}</span>
                <span style={{ flex: 1, fontSize: 14 }}>{p.name}</span>
                {p.firstSend && <span style={{ ...badge, background: '#5C8A66', color: '#17181A' }}>New</span>}
                {p.flashed && (
                  <span style={{ ...badge, display: 'flex', alignItems: 'center', gap: 3, background: '#C9A227', color: '#17181A' }}>
                    <Zap size={11} />Flash
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// A heading above the first session of each month -- a label, not a row.
function Sessions({ days, openDays, onToggleDay, onOpenProblem }) {
  let month = null;
  return days.map((d) => {
    const first = month === null;
    const heading = monthOf(d.date) !== month;
    month = monthOf(d.date);
    return (
      <div key={d.date}>
        {heading && <h3 style={{ ...sectionHeading, margin: first ? '0 0 8px' : '16px 0 8px' }}>{formatMonth(month)}</h3>}
        <Day day={d} open={openDays.has(d.date)} onToggle={() => onToggleDay(d.date)} onOpenProblem={onOpenProblem} />
      </div>
    );
  });
}

export default function LogbookScreen({ problems, ticks, climber, openDays, onToggleDay, onOpenProblem, onPickClimber }) {
  if (!climber) {
    return (
      <div style={{ marginTop: 22, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, color: '#8b8d91' }}>
        <span style={{ fontSize: 13.5 }}>Select who you are to see your logbook</span>
        <button onClick={onPickClimber} style={{
          background: 'none', border: '1px solid #3a3b3e', color: '#8b8d91',
          borderRadius: 8, padding: '8px 12px', fontSize: 13, cursor: 'pointer',
        }}>Pick a climber</button>
      </div>
    );
  }

  const days = buildLogbook(problems, ticks, climber.name);
  const sends = days.reduce((sum, d) => sum + d.problems.length, 0);

  return (
    <div style={{ marginTop: 18 }}>
      <h2 style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 26, letterSpacing: 0.5, margin: 0 }}>{climber.name}'s logbook</h2>
      <p style={{ margin: '2px 0 16px', fontSize: 13, color: '#8b8d91' }}>
        {days.length > 0 ? `${count(days.length, 'session')} · ${count(sends, 'send')}` : 'Nothing logged yet'}
      </p>
      <Sessions days={days} openDays={openDays} onToggleDay={onToggleDay} onOpenProblem={onOpenProblem} />
    </div>
  );
}
