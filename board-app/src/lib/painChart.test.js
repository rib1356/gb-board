import { describe, it, expect } from 'vitest';
import { painChartGeometry } from './painChart';

const c = (checked_on, pain_low, pain_high, pain_peak = null) => ({ checked_on, pain_low, pain_high, pain_peak });

describe('painChartGeometry', () => {
  it('places check-ins across the days up to the end date', () => {
    const g = painChartGeometry([c('2026-10-01', 1, 2), c('2026-10-03', 1, 3, 6)], { endDate: '2026-10-05', boardDays: new Set() });
    expect(g.yMax).toBe(6);
    expect(g.points.map((p) => p.x)).toEqual([22, 158]);
    expect(g.points[1].yPeak).toBeCloseTo(6);
    expect(g.points[0].yPeak).toBeNull();
    expect(g.points[0].yLow).toBeCloseTo(82 - 76 / 6);
  });
  it('never scales below 5', () => {
    expect(painChartGeometry([c('2026-10-01', 1, 1), c('2026-10-02', 1, 2)], { endDate: '2026-10-02', boardDays: new Set() }).yMax).toBe(5);
  });
  it('rounds the top up', () => {
    expect(painChartGeometry([c('2026-10-01', 1, 1), c('2026-10-02', 1, 5.5)], { endDate: '2026-10-02', boardDays: new Set() }).yMax).toBe(6);
  });
  it('draws one point for two check-ins on the same day', () => {
    const g = painChartGeometry([c('2026-10-01', 2, 2), c('2026-10-01', 4, 4, 7), c('2026-10-02', 1, 1)], { endDate: '2026-10-02', boardDays: new Set() });
    expect(g.points).toHaveLength(2);
    expect(g.points[0]).toMatchObject({ date: '2026-10-01' });
    expect(g.points[0].yLow).toBeCloseTo(82 - 2 / 7 * 76);
    expect(g.points[0].yHigh).toBeCloseTo(82 - 4 / 7 * 76);
  });
  it('has nothing to draw for one check-in', () => {
    expect(painChartGeometry([c('2026-10-01', 1, 2)], { endDate: '2026-10-21', boardDays: new Set() })).toBeNull();
    expect(painChartGeometry([], { endDate: '2026-10-21', boardDays: new Set() })).toBeNull();
  });
  it('marks board days inside the range only', () => {
    const g = painChartGeometry([c('2026-10-01', 1, 1), c('2026-10-05', 1, 1)], { endDate: '2026-10-05', boardDays: new Set(['2026-09-30', '2026-10-03']) });
    expect(g.dots).toEqual([{ date: '2026-10-03', x: 158 }]);
  });
  it('accepts pain values that arrive as numeric strings', () => {
    const g = painChartGeometry([c('2026-10-01', '1.5', '2.5'), c('2026-10-02', '1', '3.5', '6.5')], { endDate: '2026-10-02', boardDays: new Set() });
    expect(g.yMax).toBe(7);
    expect(g.points[1].yPeak).toBeCloseTo(82 - 6.5 / 7 * 76);
  });
});
