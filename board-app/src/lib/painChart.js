import { daysBetween } from './dates';

// The pain chart's drawing area, in viewBox units.
export const CHART = { W: 300, H: 100, LEFT: 22, RIGHT: 6, TOP: 6, BASE: 82, DOTS: 94 };

// Check-ins on one date become one point: the lowest low, the highest high and
// the highest peak. Returns null until there are two dates to draw between.
export function painChartGeometry(checkins, { endDate, boardDays }) {
  const byDate = new Map();
  for (const ci of checkins) {
    const low = Number(ci.pain_low);
    const high = Number(ci.pain_high);
    const peak = ci.pain_peak == null ? null : Number(ci.pain_peak);
    const day = byDate.get(ci.checked_on);
    if (!day) {
      byDate.set(ci.checked_on, { date: ci.checked_on, low, high, peak });
    } else {
      day.low = Math.min(day.low, low);
      day.high = Math.max(day.high, high);
      if (peak != null) day.peak = day.peak == null ? peak : Math.max(day.peak, peak);
    }
  }
  if (byDate.size < 2) return null;

  const days = [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
  const firstDate = days[0].date;
  const span = Math.max(1, daysBetween(firstDate, endDate));
  const x = (d) => CHART.LEFT + (daysBetween(firstDate, d) / span) * (CHART.W - CHART.LEFT - CHART.RIGHT);
  const yMax = Math.max(5, Math.ceil(Math.max(...days.map((d) => Math.max(d.high, d.peak ?? 0)))));
  const y = (v) => CHART.BASE - (v / yMax) * (CHART.BASE - CHART.TOP);

  return {
    yMax,
    points: days.map((d) => ({
      date: d.date,
      x: x(d.date),
      yLow: y(d.low),
      yHigh: y(d.high),
      yMid: y((d.low + d.high) / 2),
      yPeak: d.peak == null ? null : y(d.peak),
    })),
    dots: [...boardDays]
      .filter((d) => d >= firstDate && d <= endDate)
      .sort()
      .map((d) => ({ date: d, x: x(d) })),
  };
}
