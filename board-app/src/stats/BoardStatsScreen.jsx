import { useMemo } from 'react';
import {
  crewBoard, latestFAs, faTally, classics, popularLately, openProjects, leastClimbedLately, daysAgoLabel, openLabel,
} from '../lib/boardStats';
import { monthOf, previousMonth, nextMonth, monthName } from '../lib/dates';
import { formatShortDate, sectionHeading } from '../ui';

const mono = "'JetBrains Mono', monospace";
const muted = '#8b8d91';
const count = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const cellStyle = { padding: '8px 0', borderTop: '1px solid #2A2B2E', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: '#c7c8cb' };

function Section({ title, note, children }) {
  return (
    <section style={{ marginTop: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, marginBottom: 8 }}>
        <h3 style={{ ...sectionHeading, margin: 0 }}>{title}</h3>
        {note && <span style={{ fontSize: 11.5, color: muted, whiteSpace: 'nowrap' }}>{note}</span>}
      </div>
      <div style={{ background: '#232427', border: '1px solid #2A2B2E', borderRadius: 12, padding: '2px 12px' }}>{children}</div>
    </section>
  );
}

// meta sits on the right; sub, when given, goes on a second line under the
// name so a long detail never squeezes the name out.
function ProblemRow({ problem, meta, sub, extra, first, onOpen }) {
  return (
    <button onClick={() => onOpen(problem.id)} style={{
      width: '100%', display: 'flex', alignItems: 'center', gap: 9, background: 'none', border: 'none',
      borderTop: first ? 'none' : '1px solid #2A2B2E', color: '#EDEAE3', padding: '10px 0', cursor: 'pointer',
      textAlign: 'left', fontFamily: "'Inter'", fontSize: 13.5,
    }}>
      <span style={{ width: 24, flexShrink: 0, fontFamily: mono, fontSize: 12, fontWeight: 700, color: '#D9552B' }}>{problem.grade || '–'}</span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{problem.name}</span>
        {sub && <span style={{ display: 'block', marginTop: 2, fontSize: 12, color: muted }}>{sub}</span>}
      </span>
      {extra}
      {meta && <span style={{ fontSize: 12, color: muted, whiteSpace: 'nowrap' }}>{meta}</span>}
    </button>
  );
}

// The leader in each column is in bold; ties are all bold.
function CrewBoard({ rows }) {
  const best = (key) => Math.max(...rows.map((r) => r[key] ?? -1));
  const leads = { problems: best('problems'), newTicks: best('newTicks'), flashes: best('flashes'), top: best('top') };
  const cell = (row, key, text) => {
    const lead = row[key] !== null && row[key] === leads[key] && (key === 'top' || leads[key] > 0);
    return <td style={{ ...cellStyle, ...(lead && { color: '#EDEAE3', fontWeight: 700 }) }}>{text}</td>;
  };
  const head = { fontSize: 10.5, color: muted, fontWeight: 600, textAlign: 'right', padding: '8px 0 6px' };
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
      <thead>
        <tr>
          <th style={{ ...head, textAlign: 'left' }}>Climber</th>
          <th style={head}>Problems</th>
          <th style={head}>New</th>
          <th style={head}>Flashes</th>
          <th style={head}>Top</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.name}>
            <td style={{ ...cellStyle, textAlign: 'left', color: '#EDEAE3', fontWeight: 600 }}>{row.name}</td>
            {cell(row, 'problems', row.problems)}
            {cell(row, 'newTicks', row.newTicks)}
            {cell(row, 'flashes', row.flashes)}
            {cell(row, 'top', row.top === null ? '–' : `V${row.top}`)}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function BoardStatsScreen({ problems, ticks, climberCount, today, votes, onOpenProblem }) {
  const month = monthOf(today);
  const stats = useMemo(() => ({
    crew: crewBoard(problems, ticks, month),
    lastMonthTop: crewBoard(problems, ticks, previousMonth(month)).find((r) => r.newTicks > 0) || null,
    fas: latestFAs(problems, ticks),
    tally: faTally(problems, ticks),
    classics: classics(problems, ticks, votes),
    popular: popularLately(problems, ticks, today),
    open: openProjects(problems, ticks, today),
    dusty: leastClimbedLately(problems, ticks, today),
  }), [problems, ticks, votes, month, today]);

  return (
    <div style={{ marginTop: 18 }}>
      <h2 style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 26, letterSpacing: 0.5, margin: 0 }}>Board stats</h2>
      <p style={{ margin: '2px 0 0', fontSize: 13, color: muted }}>
        {`${count(problems.length, 'problem')} · ${count(climberCount, 'climber')}`}
      </p>

      <Section title={`${monthName(month)} crew board`} note={`resets ${formatShortDate(`${nextMonth(month)}-01`)}`}>
        {stats.crew.length > 0 ? <CrewBoard rows={stats.crew} /> : (
          <div style={{ padding: '10px 0', fontSize: 13, color: muted }}>
            <p style={{ margin: 0 }}>{`No sends yet in ${monthName(month)}`}</p>
            {stats.lastMonthTop && (
              <p style={{ margin: '4px 0 0' }}>
                {`Last month: ${stats.lastMonthTop.name} ticked the most new problems (${stats.lastMonthTop.newTicks})`}
              </p>
            )}
          </div>
        )}
      </Section>

      {stats.fas.length > 0 && (
        <Section title="Latest FAs" note="first to send">
          {stats.fas.map((fa, i) => (
            <ProblemRow key={fa.id} problem={fa} first={i === 0} onOpen={onOpenProblem} meta={`${fa.climber} · ${formatShortDate(fa.date)}`} />
          ))}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 14px', fontSize: 12.5, color: '#c7c8cb', padding: '9px 0 8px', borderTop: '1px solid #2A2B2E' }}>
            <b style={{ color: '#EDEAE3' }}>Most FAs</b>
            {stats.tally.map((t) => <span key={t.name}>{t.name} <b style={{ color: '#EDEAE3' }}>{t.count}</b></span>)}
          </div>
        </Section>
      )}

      {stats.classics.length > 0 && (
        <Section title="Classics" note="best rated, then most ascents">
          {stats.classics.map((p, i) => (
            <ProblemRow
              key={p.id} problem={p} first={i === 0} onOpen={onOpenProblem} meta={count(p.ascents, 'ascent')}
              extra={<span aria-label={`${p.legacy ? p.rating : p.rating.toFixed(1)} stars`} style={{ color: '#C9A227', fontSize: 11, whiteSpace: 'nowrap' }}>{`★ ${p.legacy ? p.rating : p.rating.toFixed(1)}`}</span>}
            />
          ))}
        </Section>
      )}

      {stats.popular.length > 0 && (
        <Section title="Popular lately" note="last 30 days">
          {stats.popular.map((p, i) => (
            <ProblemRow key={p.id} problem={p} first={i === 0} onOpen={onOpenProblem} meta={count(p.climbers, 'climber')} />
          ))}
        </Section>
      )}

      {stats.open.length > 0 && (
        <Section title="No FA yet" note={count(stats.open.length, 'open project')}>
          {stats.open.map((p, i) => (
            <ProblemRow
              key={p.id} problem={p} first={i === 0} onOpen={onOpenProblem}
              sub={[p.setter && `set by ${p.setter}`, p.daysOpen !== null && openLabel(p.daysOpen)].filter(Boolean).join(' · ')}
            />
          ))}
        </Section>
      )}

      {stats.dusty.length > 0 && (
        <Section title="Least climbed lately" note="longest since a send">
          {stats.dusty.map((p, i) => (
            <ProblemRow key={p.id} problem={p} first={i === 0} onOpen={onOpenProblem} meta={daysAgoLabel(p.daysAgo)} />
          ))}
        </Section>
      )}
    </div>
  );
}
