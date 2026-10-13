import { buildPyramid } from '../lib/sends';

const mono = "'JetBrains Mono', monospace";

function Block({ problem }) {
  const color = problem.sent ? '#5C8A66' : '#3a3b3e';
  return (
    <span
      role="img"
      aria-label={`${problem.name}, ${problem.sent ? 'sent' : 'not sent'}`}
      title={problem.name}
      style={{
        width: 16, height: 16, borderRadius: 3, boxSizing: 'border-box',
        border: `1.5px solid ${color}`, background: problem.sent ? color : 'transparent',
      }}
    />
  );
}

export default function PyramidScreen({ problems, ticks, climber, onPickClimber }) {
  if (!climber) {
    return (
      <div style={{ marginTop: 22, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, color: '#8b8d91' }}>
        <span style={{ fontSize: 13.5 }}>Select who you are to see your pyramid</span>
        <button onClick={onPickClimber} style={{
          background: 'none', border: '1px solid #3a3b3e', color: '#8b8d91',
          borderRadius: 8, padding: '8px 12px', fontSize: 13, cursor: 'pointer',
        }}>Pick a climber</button>
      </div>
    );
  }

  const rows = buildPyramid(problems, ticks, climber.name);
  const sentCounts = rows.map((row) => row.problems.filter((p) => p.sent).length);
  const sent = sentCounts.reduce((sum, n) => sum + n, 0);
  const top = rows.find((_, i) => sentCounts[i] > 0)?.grade;

  return (
    <div style={{ marginTop: 18 }}>
      <h2 style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 26, letterSpacing: 0.5, margin: 0 }}>{climber.name}'s pyramid</h2>
      <p style={{ margin: '2px 0 0', fontSize: 13, color: '#8b8d91' }}>
        {sent > 0 ? `${sent} sent · top grade ${top}` : 'Nothing sent yet'}
      </p>
      {rows.length === 0 ? (
        <p style={{ marginTop: 22, textAlign: 'center', fontSize: 14, color: '#6d6f73' }}>No graded problems on the board yet</p>
      ) : (
        <ul style={{ listStyle: 'none', margin: '16px 0 0', padding: 0 }}>
          {rows.map((row, i) => (
            <li key={row.grade} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '5px 0' }}>
              <span style={{ width: 34, fontFamily: mono, fontSize: 13, fontWeight: 700, color: '#D9552B' }}>{row.grade}</span>
              <div style={{ flex: 1, display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 4 }}>
                {row.problems.map((p) => <Block key={p.id} problem={p} />)}
              </div>
              <span style={{ width: 34, textAlign: 'right', fontFamily: mono, fontSize: 12, color: '#8b8d91' }}>
                {sentCounts[i]}/{row.problems.length}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
