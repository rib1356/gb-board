import { CHART, painChartGeometry } from '../lib/painChart';

const ACCENT = '#D9552B';
const BAND = '#D9552B33';
const BOARD = '#C08552';
const GRID = '#34353a';
const MUTED = '#8b8d91';
const MONO = "'JetBrains Mono', monospace";

// An injury's pain over time: the low-high band with a midline through it,
// spikes as dots, and a row of dots along the bottom for days on the board.
export default function PainChart({ checkins, endDate, boardDays }) {
  const g = painChartGeometry(checkins, { endDate, boardDays });
  if (!g) return null;
  const { W, H, LEFT, TOP, BASE, DOTS } = CHART;
  const yAt = (v) => BASE - (v / g.yMax) * (BASE - TOP);
  const grid = [g.yMax, g.yMax / 2, 0];
  const band = [
    ...g.points.map((p) => `${p.x},${p.yHigh}`),
    ...[...g.points].reverse().map((p) => `${p.x},${p.yLow}`),
  ].join(' ');

  return (
    <div>
      <svg
        viewBox={`0 0 ${W} ${H}`} width="100%" aria-hidden="true" data-chart="pain"
        fontFamily="'Inter', sans-serif" style={{ display: 'block', overflow: 'visible' }}
      >
        {grid.map((v) => (
          <g key={v}>
            <line x1={LEFT} x2={W} y1={yAt(v)} y2={yAt(v)} stroke={GRID} strokeWidth={1} />
            <text x={LEFT - 6} y={yAt(v) + 3} textAnchor="end" fontFamily={MONO} fontSize={8.5} fill={MUTED}>{v}</text>
          </g>
        ))}
        <polygon points={band} fill={BAND} />
        <polyline points={g.points.map((p) => `${p.x},${p.yMid}`).join(' ')} fill="none" stroke={ACCENT} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {g.points.filter((p) => p.yPeak != null).map((p) => (
          <circle key={p.date} cx={p.x} cy={p.yPeak} r={3} fill={ACCENT} />
        ))}
        {g.dots.map((d) => (
          <circle key={d.date} cx={d.x} cy={DOTS} r={3} fill={BOARD} />
        ))}
      </svg>
      {g.dots.length > 0 && (
        <div style={{ fontSize: 11, color: MUTED, marginTop: 4 }}>
          <span style={{ color: BOARD }}>●</span> days on the board
        </div>
      )}
    </div>
  );
}
