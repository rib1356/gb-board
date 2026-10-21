import { useMemo, useState } from 'react';
import { weeklyProgress, progressTiles, ticklist, mostClimbed } from '../lib/progress';
import { formatShortDate, sectionHeading } from '../ui';
import WeekCharts from './WeekCharts';

const mono = "'JetBrains Mono', monospace";
const count = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const panel = { background: '#232427', border: '1px solid #2A2B2E', borderRadius: 10, padding: 11, marginBottom: 10 };
const eyebrow = { ...sectionHeading, fontSize: 10.5, margin: '0 0 6px' };

// The picked week in one line: "Week of 12 Oct · 2 sessions · top V5 · 34 problems".
function readout(week) {
  const heading = `Week of ${formatShortDate(week.weekStart)}`;
  if (week.sessions === 0) return [heading, 'no sessions'];
  return [
    heading,
    count(week.sessions, 'session'),
    ...(week.top === null ? [] : [`top V${week.top}`]),
    count(week.newTicks + week.repeats, 'problem'),
  ];
}

function Tile({ value, label }) {
  return (
    <div style={{ flex: 1, minWidth: 0, background: '#232427', border: '1px solid #2A2B2E', borderRadius: 10, padding: '9px 10px' }}>
      <div style={{ fontSize: 20, fontWeight: 700 }}>{value}</div>
      <div style={{ fontSize: 10.5, color: '#8b8d91', lineHeight: 1.3 }}>{label}</div>
    </div>
  );
}

export default function ProgressTab({ problems, ticks, climber, today, onOpenProblem }) {
  const weeks = useMemo(() => weeklyProgress(problems, ticks, climber, today), [problems, ticks, climber, today]);
  const tiles = useMemo(() => progressTiles(problems, ticks, climber, today), [problems, ticks, climber, today]);
  const grades = useMemo(() => ticklist(problems, ticks, climber), [problems, ticks, climber]);
  const favourites = useMemo(() => mostClimbed(problems, ticks, climber), [problems, ticks, climber]);
  // null means "the latest week", so a new week becomes the default once it starts.
  const [picked, setPicked] = useState(null);

  if (weeks.length === 0) {
    return <p style={{ margin: '24px 0 0', textAlign: 'center', fontSize: 13.5, color: '#8b8d91' }}>Log a send to start your progress</p>;
  }

  const selected = picked !== null && picked < weeks.length ? picked : weeks.length - 1;
  const [heading, ...details] = readout(weeks[selected]);
  const widest = Math.max(1, ...grades.map((g) => g.total));

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
        <Tile value={tiles.hardest === null ? '–' : `V${tiles.hardest}`} label="Hardest send" />
        <Tile value={tiles.sessionsPerWeek.toFixed(1)} label="Sessions a week, last 4 weeks" />
        <Tile
          value={<>{tiles.ticked}<span style={{ fontSize: 13, color: '#8b8d91', fontWeight: 600 }}>/{tiles.total}</span></>}
          label="Problems ticked"
        />
      </div>

      <p aria-live="polite" style={{
        margin: '0 0 10px', background: '#17181A', border: '1px solid #3a3b3e', borderRadius: 8,
        padding: '7px 10px', fontSize: 12, color: '#c7c8cb',
      }}>
        <b style={{ color: '#EDEAE3' }}>{heading}</b>{details.map((part) => ` · ${part}`).join('')}
      </p>

      <WeekCharts weeks={weeks} total={tiles.total} selected={selected} onSelect={setPicked} />

      {grades.length > 0 && (
        <section style={panel}>
          <h3 style={eyebrow}>Board ticklist</h3>
          {grades.map((g) => (
            <div key={g.grade} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0' }}>
              <span style={{ width: 24, fontFamily: mono, fontSize: 11, fontWeight: 700, color: '#c7c8cb' }}>V{g.grade}</span>
              <span style={{ flex: 1 }}>
                <span style={{ display: 'block', width: `${(g.total / widest) * 100}%`, height: 10, borderRadius: 3, background: '#34353a', overflow: 'hidden' }}>
                  <span style={{ display: 'block', width: `${(g.ticked / g.total) * 100}%`, height: '100%', background: '#D9552B' }} />
                </span>
              </span>
              <span style={{ width: 40, textAlign: 'right', fontFamily: mono, fontSize: 11, color: '#8b8d91' }}>{g.ticked}/{g.total}</span>
            </div>
          ))}
        </section>
      )}

      {favourites.length > 0 && (
        <section style={panel}>
          <h3 style={eyebrow}>Your most-climbed</h3>
          {favourites.map((p, i) => (
            <button key={p.id} onClick={() => onOpenProblem(p.id)} style={{
              width: '100%', display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none',
              borderTop: i ? '1px solid #2A2B2E' : 'none', color: '#EDEAE3', padding: '8px 2px', fontSize: 13,
              cursor: 'pointer', textAlign: 'left', fontFamily: "'Inter'",
            }}>
              <span style={{ width: 24, flexShrink: 0, fontFamily: mono, fontSize: 12, fontWeight: 700, color: '#D9552B' }}>{p.grade || '–'}</span>
              <span style={{ flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</span>
              <span style={{ fontSize: 12, color: '#8b8d91' }}>×{p.sessions}</span>
            </button>
          ))}
        </section>
      )}
    </div>
  );
}
