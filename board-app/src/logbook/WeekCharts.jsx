import { useRef } from 'react';
import { sectionHeading } from '../ui';

// Four charts on one set of week columns, so a week lines up all the way down
// the panel. Each is drawn in a W-wide viewBox and stretched to the panel.
const W = 326;
const LX = 24; // room for the y-axis labels
const ACCENT = '#D9552B';
const REPEAT = '#76787d';
const GRID = '#34353a';
const BAND = '#2d2e32';
const MUTED = '#8b8d91';
const SURFACE = '#232427';
const MONO = "'JetBrains Mono', monospace";
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
// Past this many weeks a dot on every week turns the line into a string of beads.
const DOTS_UP_TO = 20;
// How far a finger has to move sideways before it counts as a drag.
const DRAG_START = 6;

const eyebrow = { ...sectionHeading, fontSize: 10.5, margin: '0 0 6px' };
const legendKey = (color) => ({ display: 'inline-block', width: 9, height: 9, borderRadius: 2, background: color, marginRight: 5, verticalAlign: -1 });

// A bar with a rounded top and a square foot on the baseline.
function bar(x, y, w, h, r = 4) {
  const rr = Math.min(r, h, w / 2);
  return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`;
}

const roundUp = (value, step) => Math.max(step, Math.ceil(value / step) * step);
const unique = (values) => [...new Set(values)];

export default function WeekCharts({ weeks, total, selected, onSelect }) {
  const plotRef = useRef(null);
  // Where the current touch started, and whether it's become a sideways drag.
  const gesture = useRef(null);
  const n = weeks.length;
  const pitch = (W - LX) / n;
  const cx = (i) => LX + i * pitch + pitch / 2;
  const bw = Math.min(16, Math.max(2, pitch - 2));
  const showDot = (i) => n <= DOTS_UP_TO || i === selected || i === n - 1;

  // A tap picks the nearest week, so a 6px column is still easy to hit, and
  // a sideways drag keeps picking as you go. Nothing happens on touch-down:
  // on a phone most touches here are the start of a scroll, which the
  // browser takes over with a pointercancel.
  const pick = (clientX) => {
    const rect = plotRef.current?.getBoundingClientRect();
    if (!rect?.width) return;
    const x = ((clientX - rect.left) / rect.width) * W;
    onSelect(Math.min(n - 1, Math.max(0, Math.floor((x - LX) / pitch))));
  };
  const onKeyDown = (e) => {
    const step = { ArrowLeft: -1, ArrowRight: 1 }[e.key];
    if (!step) return;
    e.preventDefault();
    onSelect(Math.min(n - 1, Math.max(0, selected + step)));
  };

  const band = (h) => <rect x={LX + selected * pitch + 1} y={0} width={Math.max(2, pitch - 2)} height={h} rx={4} fill={BAND} />;
  const grid = (values, y, label) => values.map((v) => (
    <g key={v}>
      <line x1={LX} x2={W} y1={y(v)} y2={y(v)} stroke={GRID} strokeWidth={1} />
      <text x={LX - 6} y={y(v) + 3} textAnchor="end" fontFamily={MONO} fontSize={8.5} fill={MUTED}>{label(v)}</text>
    </g>
  ));
  // Under the first week of each month, skipping any that would collide.
  const monthLabels = (h) => {
    let lastX = -Infinity;
    return weeks.map((w, i) => {
      const x = LX + i * pitch + 2;
      if ((i > 0 && Number(w.weekStart.slice(8)) > 7) || x - lastX < 24) return null;
      lastX = x;
      return <text key={w.weekStart} x={x} y={h - 1} fontSize={9} fill={MUTED}>{MONTHS[Number(w.weekStart.slice(5, 7)) - 1]}</text>;
    });
  };
  const svg = (h, chart) => ({
    viewBox: `0 0 ${W} ${h}`, width: '100%', 'aria-hidden': true, 'data-chart': chart,
    fontFamily: "'Inter', sans-serif", style: { display: 'block', overflow: 'visible' },
  });

  // Hardest send: gridlines every two grades, at least up to V6.
  const gradeMax = roundUp(Math.max(6, ...weeks.map((w) => w.top ?? 0)), 2);
  const GH = 92;
  const gy = (g) => 7 + ((gradeMax - g) / gradeMax) * (GH - 14);
  const points = weeks.flatMap((w, i) => (w.top === null ? [] : [{ i, x: cx(i), y: gy(w.top) }]));

  // Sessions: 0-2, growing only if a week has more.
  const sessionMax = Math.max(2, ...weeks.map((w) => w.sessions));
  const SH = 56;
  const sy = (v) => 4 + (1 - v / sessionMax) * (SH - 17);
  const sessionTicks = sessionMax <= 4
    ? Array.from({ length: sessionMax + 1 }, (_, k) => k)
    : unique([0, Math.round(sessionMax / 2), sessionMax]);

  const volumeMax = roundUp(Math.max(...weeks.map((w) => w.newTicks + w.repeats)), 10);
  const VH = 84;
  const vy = (v) => 4 + (1 - v / volumeMax) * (VH - 17);

  const tickedMax = Math.max(1, total, ...weeks.map((w) => w.ticked));
  const CH = 84;
  const ty = (v) => 6 + (1 - v / tickedMax) * (CH - 19);
  const runningLine = weeks.map((w, i) => `${cx(i)},${ty(w.ticked)}`).join(' ');

  return (
    <div
      role="group"
      tabIndex={0}
      aria-label="Weekly charts. Use the left and right arrow keys to pick a week."
      onKeyDown={onKeyDown}
      onPointerDown={(e) => { gesture.current = { x: e.clientX, dragging: false }; }}
      onPointerMove={(e) => {
        const g = gesture.current;
        if (!g) return;
        if (!g.dragging && Math.abs(e.clientX - g.x) > DRAG_START) {
          g.dragging = true;
          e.currentTarget.setPointerCapture?.(e.pointerId);
        }
        if (g.dragging) pick(e.clientX);
      }}
      onPointerUp={(e) => {
        if (gesture.current && !gesture.current.dragging) pick(e.clientX);
        gesture.current = null;
      }}
      onPointerCancel={() => { gesture.current = null; }}
      style={{
        background: SURFACE, border: '1px solid #2A2B2E', borderRadius: 10, padding: 11, marginBottom: 10,
        touchAction: 'pan-y', userSelect: 'none', WebkitUserSelect: 'none', cursor: 'pointer',
      }}
    >
      <div ref={plotRef}>
        <h3 style={eyebrow}>Hardest send each week</h3>
        <svg {...svg(GH, 'grade')}>
          {band(GH)}
          {grid(Array.from({ length: gradeMax / 2 + 1 }, (_, k) => k * 2), gy, (v) => `V${v}`)}
          {points.length > 1 && (
            <polyline points={points.map((p) => `${p.x},${p.y}`).join(' ')} fill="none" stroke={ACCENT} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          )}
          {points.filter((p) => showDot(p.i)).map((p) => (
            <circle key={p.i} cx={p.x} cy={p.y} r={p.i === selected ? 5 : 4} fill={ACCENT} stroke={SURFACE} strokeWidth={2} />
          ))}
        </svg>

        <h3 style={{ ...eyebrow, marginTop: 14 }}>Sessions each week</h3>
        <svg {...svg(SH, 'sessions')}>
          {band(SH)}
          {grid(sessionTicks, sy, String)}
          {weeks.map((w, i) => (w.sessions > 0
            ? <path key={w.weekStart} d={bar(cx(i) - bw / 2, sy(w.sessions), bw, sy(0) - sy(w.sessions))} fill={ACCENT} />
            : null))}
          {monthLabels(SH)}
        </svg>

        <h3 style={{ ...eyebrow, marginTop: 14 }}>Problems each week</h3>
        <div style={{ display: 'flex', gap: 12, fontSize: 10.5, color: '#c7c8cb', margin: '-2px 0 6px' }}>
          <span><i style={legendKey(ACCENT)} />New ticks</span>
          <span><i style={legendKey(REPEAT)} />Repeats</span>
        </div>
        <svg {...svg(VH, 'volume')}>
          {band(VH)}
          {grid(unique([0, volumeMax / 2, volumeMax]), vy, String)}
          {weeks.map((w, i) => {
            const x = cx(i) - bw / 2;
            const newTop = vy(w.newTicks);
            const repeatTop = vy(w.newTicks + w.repeats);
            // A 2px gap of card colour between the two parts of a bar.
            const repeatBottom = w.newTicks ? newTop - 2 : vy(0);
            return (
              <g key={w.weekStart}>
                {w.newTicks > 0 && (w.repeats > 0
                  ? <rect data-part="new" x={x} y={newTop} width={bw} height={vy(0) - newTop} fill={ACCENT} />
                  : <path data-part="new" d={bar(x, newTop, bw, vy(0) - newTop)} fill={ACCENT} />)}
                {w.repeats > 0 && repeatBottom > repeatTop && (
                  <path data-part="repeats" d={bar(x, repeatTop, bw, repeatBottom - repeatTop)} fill={REPEAT} />
                )}
              </g>
            );
          })}
          {monthLabels(VH)}
        </svg>

        <h3 style={{ ...eyebrow, marginTop: 14 }}>Problems ticked so far</h3>
        <svg {...svg(CH, 'ticked')}>
          {band(CH)}
          {grid(unique([0, Math.round(tickedMax / 2), tickedMax]), ty, String)}
          <text x={LX + 4} y={ty(tickedMax) + 11} fontSize={9} fill={MUTED}>{`of ${total} on the board`}</text>
          {n > 1 && <polygon points={`${cx(0)},${ty(0)} ${runningLine} ${cx(n - 1)},${ty(0)}`} fill={ACCENT} opacity={0.1} />}
          {n > 1 && <polyline points={runningLine} fill="none" stroke={ACCENT} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />}
          {weeks.map((w, i) => (i === selected || i === n - 1
            ? <circle key={w.weekStart} cx={cx(i)} cy={ty(w.ticked)} r={4} fill={ACCENT} stroke={SURFACE} strokeWidth={2} />
            : null))}
          {monthLabels(CH)}
        </svg>
      </div>
    </div>
  );
}
