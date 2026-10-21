import { describe, it, expect } from 'vitest';
import {
  injuryTitle, normaliseInjury, formatPain, shortDate, dayLabel, sheetDateLabel, monthYear,
  startLine, injuryStart, lastCheckinLine, hubLists, sameSpot, boardDays,
} from './injuries';

const today = '2026-10-21';

it.each([
  [{ side: 'right', area: 'finger', finger: 'middle' }, 'RH middle finger'],
  [{ side: 'left', area: 'finger', finger: 'thumb' }, 'LH thumb'],
  [{ side: 'none', area: 'finger', finger: 'ring' }, 'Ring finger'],
  [{ side: 'left', area: 'wrist' }, 'L wrist'],
  [{ side: 'right', area: 'shoulder' }, 'R shoulder'],
  [{ side: 'none', area: 'back' }, 'Back'],
  [{ side: 'right', area: 'other', area_other: 'hip' }, 'R hip'],
  [{ side: 'none', area: 'other', area_other: 'neck' }, 'Neck'],
])('titles %o as %s', (injury, title) => expect(injuryTitle(injury)).toBe(title));

it('formats pain the way Rob writes it', () => {
  expect(formatPain({ pain_low: 1, pain_high: 1, pain_peak: null })).toBe('1');
  expect(formatPain({ pain_low: 1, pain_high: 2, pain_peak: null })).toBe('1–2');
  expect(formatPain({ pain_low: 3, pain_high: 4, pain_peak: 7 })).toBe('3–4 / 7');
  expect(formatPain({ pain_low: 2, pain_high: 2, pain_peak: 6 })).toBe('2 / 6');
  expect(formatPain({ pain_low: '0', pain_high: '0.5', pain_peak: null })).toBe('0–0.5');
  expect(formatPain({ pain_low: 1.5, pain_high: 1.5, pain_peak: null })).toBe('1.5');
});

it('says how long since the last check-in', () => {
  const on = (...dates) => dates.map((checked_on) => ({ checked_on }));
  expect(lastCheckinLine([], today)).toBe('No check-ins yet');
  expect(lastCheckinLine(on('2026-10-02', '2026-10-21'), today)).toBe('Checked in today');
  expect(lastCheckinLine(on('2026-10-20'), today)).toBe('Last check-in 20 Oct, yesterday');
  expect(lastCheckinLine(on('2026-10-16', '2026-10-01'), today)).toBe('Last check-in 16 Oct, 5 days ago');
  expect(lastCheckinLine(on('2026-10-23'), today)).toBe('Checked in today'); // dated ahead
});

it('labels dates', () => {
  expect(dayLabel('2026-10-13', today)).toBe('Tue 13 Oct');
  expect(dayLabel('2025-04-02', today)).toBe('Wed 2 Apr 2025');
  expect(sheetDateLabel('2026-10-21', today)).toBe('Today, Wed 21 Oct');
  expect(sheetDateLabel('2026-10-20', today)).toBe('Yesterday, Tue 20 Oct');
  expect(sheetDateLabel('2026-10-13', today)).toBe('Tue 13 Oct');
  expect(monthYear('2025-03-30')).toBe('Mar 25');
  expect(shortDate('2026-10-03', today)).toBe('3 Oct');
  expect(shortDate('2025-10-03', today)).toBe('3 Oct 2025');
});

it('writes the start line', () => {
  expect(startLine({ started_on: '2026-03-04', started_roughly: false })).toBe('Started 4 Mar 2026');
  expect(startLine({ started_on: '2026-03-04', started_roughly: true })).toBe('Started around 4 Mar 2026');
  expect(startLine({ started_on: null, started_roughly: false })).toBe('Started: not sure');
});

describe('injuryStart', () => {
  const injury = { id: 'a', started_on: null, created_at: '2026-09-01T10:00:00Z' };
  it('prefers started_on', () => {
    expect(injuryStart({ ...injury, started_on: '2026-08-01' }, [{ injury_id: 'a', checked_on: '2026-08-20' }])).toBe('2026-08-01');
  });
  it('falls back to the earliest check-in of this injury only', () => {
    const checkins = [
      { injury_id: 'a', checked_on: '2026-09-10' },
      { injury_id: 'a', checked_on: '2026-09-05' },
      { injury_id: 'b', checked_on: '2026-08-01' },
    ];
    expect(injuryStart(injury, checkins)).toBe('2026-09-05');
  });
  it('falls back to the created date', () => {
    expect(injuryStart(injury, [])).toBe('2026-09-01');
  });
});

it('splits the hub into open and closed, newest first', () => {
  const injuries = [
    { id: 'o1', started_on: '2026-05-01', closed_on: null, created_at: '2026-05-02T00:00:00Z' },
    { id: 'c1', started_on: '2026-01-01', closed_on: '2026-02-01', created_at: '2026-01-02T00:00:00Z' },
    { id: 'o2', started_on: null, closed_on: null, created_at: '2026-09-02T00:00:00Z' },
    { id: 'c2', started_on: '2026-03-01', closed_on: '2026-04-01', created_at: '2026-03-02T00:00:00Z' },
  ];
  const { open, closed } = hubLists(injuries, []);
  expect(open.map((i) => i.id)).toEqual(['o2', 'o1']);
  expect(closed.map((i) => i.id)).toEqual(['c2', 'c1']);
});

describe('sameSpot', () => {
  const row = (id, fields, started_on = '2026-01-01') => ({ id, started_on, created_at: '2026-01-01T00:00:00Z', finger: null, area_other: null, ...fields });
  const injuries = [
    row('a', { side: 'right', area: 'finger', finger: 'middle' }, '2026-02-01'),
    row('b', { side: 'right', area: 'finger', finger: 'ring' }),
    row('c', { side: 'left', area: 'finger', finger: 'middle' }),
    row('d', { side: 'right', area: 'finger', finger: 'middle' }, '2026-06-01'),
    row('e', { side: 'none', area: 'other', area_other: 'hip' }),
  ];
  it('matches the same finger only, newest first', () => {
    const found = sameSpot({ side: 'right', area: 'finger', finger: 'middle' }, injuries);
    expect(found.map((i) => i.id)).toEqual(['d', 'a']);
  });
  it('ignores case and outer spaces for other', () => {
    expect(sameSpot({ side: 'none', area: 'other', area_other: 'Hip ' }, injuries).map((i) => i.id)).toEqual(['e']);
  });
  it('excludes excludeId', () => {
    const found = sameSpot({ side: 'right', area: 'finger', finger: 'middle' }, injuries, 'd');
    expect(found.map((i) => i.id)).toEqual(['a']);
  });
  it('orders a match with no started_on by its created date', () => {
    const list = [
      row('x', { side: 'left', area: 'wrist' }, '2026-03-01'),
      { ...row('y', { side: 'left', area: 'wrist' }, null), created_at: '2026-05-10T09:00:00Z' },
      row('z', { side: 'left', area: 'wrist' }, '2026-01-01'),
    ];
    expect(sameSpot({ side: 'left', area: 'wrist' }, list).map((i) => i.id)).toEqual(['y', 'x', 'z']);
  });
});

describe('normaliseInjury', () => {
  const base = {
    side: 'left', area: 'wrist', finger: 'index', area_other: 'x', what: ' tweak ', symptoms: '  ',
    started_on: '', started_roughly: true, how_it_happened: null,
    id: 'keep-out', closed_on: null, created_at: 'x',
  };
  it('drops finger for a wrist, blanks to null, no rough start without a date', () => {
    expect(normaliseInjury(base)).toEqual({
      side: 'left', area: 'wrist', finger: null, area_other: null, what: 'tweak', symptoms: null,
      started_on: null, started_roughly: false, how_it_happened: null,
    });
  });
  it('keeps finger for fingers, area_other for other, and a dated rough start', () => {
    const finger = normaliseInjury({ ...base, area: 'finger', started_on: '2026-03-04' });
    expect(finger).toMatchObject({ finger: 'index', area_other: null, started_on: '2026-03-04', started_roughly: true });
    expect(normaliseInjury({ ...base, area: 'other', area_other: ' hip ' })).toMatchObject({ finger: null, area_other: 'hip' });
  });
});

it('collects only this climber\'s board days', () => {
  const ticks = [
    { sent_by: 'Rob', sent_on: '2026-10-01' },
    { sent_by: 'Sam', sent_on: '2026-10-02' },
    { sent_by: 'Rob', sent_on: '2026-10-01' },
    { sent_by: 'Rob', sent_on: '2026-10-05' },
  ];
  expect([...boardDays(ticks, 'Rob')].sort()).toEqual(['2026-10-01', '2026-10-05']);
});
