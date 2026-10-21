import { describe, it, expect } from 'vitest';
import { localDate, addDays, daysBetween, weekStartOf, monthOf, previousMonth, nextMonth, monthName } from './dates';

describe('localDate', () => {
  it("uses the phone's calendar date, not UTC's", () => {
    expect(localDate(new Date(2026, 9, 21, 0, 30))).toBe('2026-10-21');
    expect(localDate(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
  });
});

describe('addDays and daysBetween', () => {
  it('count calendar days across a month end, a year end and the clocks going back', () => {
    expect(addDays('2026-10-30', 3)).toBe('2026-11-02');
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02');
    expect(addDays('2026-10-21', -28)).toBe('2026-09-23');
    expect(daysBetween('2026-10-24', '2026-10-26')).toBe(2);
    expect(daysBetween('2026-12-25', '2027-01-01')).toBe(7);
  });
});

describe('weekStartOf', () => {
  it('finds the Monday of the week, the Monday itself included', () => {
    expect(weekStartOf('2026-10-21')).toBe('2026-10-19'); // Wednesday
    expect(weekStartOf('2026-10-19')).toBe('2026-10-19'); // Monday
    expect(weekStartOf('2026-10-25')).toBe('2026-10-19'); // Sunday
    expect(weekStartOf('2027-01-01')).toBe('2026-12-28'); // across the year end
  });
});

describe('months', () => {
  it('steps back and forward, across a year end too', () => {
    expect(monthOf('2026-10-21')).toBe('2026-10');
    expect(previousMonth('2026-11')).toBe('2026-10');
    expect(previousMonth('2026-01')).toBe('2025-12');
    expect(nextMonth('2026-12')).toBe('2027-01');
  });

  it('names a month', () => {
    expect(monthName('2026-11')).toBe('November');
  });
});
