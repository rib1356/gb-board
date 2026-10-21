import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import WeekCharts from './WeekCharts';

const week = (weekStart, sessions, top, newTicks, repeats, ticked) => ({ weekStart, sessions, top, newTicks, repeats, ticked });
const WEEKS = [
  week('2026-08-31', 1, 0, 2, 0, 2),
  week('2026-09-07', 2, 5, 3, 4, 5),
  week('2026-09-14', 0, null, 0, 0, 5),
];
const charts = () => screen.getByRole('group', { name: /^Weekly charts/ });

describe('WeekCharts', () => {
  it('steps through the weeks with the arrow keys, stopping at either end', () => {
    const onSelect = vi.fn();
    const { rerender } = render(<WeekCharts weeks={WEEKS} total={10} selected={2} onSelect={onSelect} />);
    fireEvent.keyDown(charts(), { key: 'ArrowLeft' });
    expect(onSelect).toHaveBeenLastCalledWith(1);
    fireEvent.keyDown(charts(), { key: 'ArrowRight' });
    expect(onSelect).toHaveBeenLastCalledWith(2);
    rerender(<WeekCharts weeks={WEEKS} total={10} selected={0} onSelect={onSelect} />);
    fireEvent.keyDown(charts(), { key: 'ArrowLeft' });
    expect(onSelect).toHaveBeenLastCalledWith(0);
  });

  it('draws a sessions bar for each week climbed, leaving a gap for a week off', () => {
    const { container } = render(<WeekCharts weeks={WEEKS} total={10} selected={2} onSelect={() => {}} />);
    expect(container.querySelectorAll('[data-chart="sessions"] path')).toHaveLength(2);
  });

  it('plots the hardest send only for weeks with a graded send', () => {
    const { container } = render(<WeekCharts weeks={WEEKS} total={10} selected={2} onSelect={() => {}} />);
    expect(container.querySelectorAll('[data-chart="grade"] circle')).toHaveLength(2);
  });

  it('splits each week into new ticks and repeats', () => {
    const { container } = render(<WeekCharts weeks={WEEKS} total={10} selected={2} onSelect={() => {}} />);
    expect(container.querySelectorAll('[data-chart="volume"] [data-part="new"]')).toHaveLength(2);
    expect(container.querySelectorAll('[data-chart="volume"] [data-part="repeats"]')).toHaveLength(1);
  });

  it('drops the dots past 20 weeks, keeping the latest week and the picked one', () => {
    const many = Array.from({ length: 25 }, (_, i) => week(`2026-01-${String(i + 1).padStart(2, '0')}`, 1, 3, 1, 0, i + 1));
    const { container } = render(<WeekCharts weeks={many} total={30} selected={10} onSelect={() => {}} />);
    expect(container.querySelectorAll('[data-chart="grade"] circle')).toHaveLength(2);
  });

  it('draws a single week without breaking', () => {
    const { container } = render(<WeekCharts weeks={[WEEKS[0]]} total={10} selected={0} onSelect={() => {}} />);
    expect(container.querySelectorAll('[data-chart="sessions"] path')).toHaveLength(1);
    expect(container.querySelectorAll('[data-chart="grade"] circle')).toHaveLength(1);
    expect(container.innerHTML).not.toContain('NaN');
  });
  describe('picking a week by touch', () => {
    // The charts are drawn 326 wide with a 24px gutter, so with the panel
    // stubbed at 326px a pointer's x lands straight on the viewBox: three
    // weeks are ~100px apart, starting at x=24.
    const stubWidth = () => vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockReturnValue({ left: 0, top: 0, width: 326, height: 400, right: 326, bottom: 400, x: 0, y: 0 });
    afterEach(() => vi.restoreAllMocks());

    it('picks the week you tap', () => {
      stubWidth();
      const onSelect = vi.fn();
      render(<WeekCharts weeks={WEEKS} total={10} selected={2} onSelect={onSelect} />);
      fireEvent.pointerDown(charts(), { clientX: 60, pointerId: 1 });
      fireEvent.pointerUp(charts(), { clientX: 60, pointerId: 1 });
      expect(onSelect).toHaveBeenLastCalledWith(0);
    });

    it('leaves the picked week alone when a touch turns into a scroll', () => {
      stubWidth();
      const onSelect = vi.fn();
      render(<WeekCharts weeks={WEEKS} total={10} selected={2} onSelect={onSelect} />);
      fireEvent.pointerDown(charts(), { clientX: 60, pointerId: 1 });
      fireEvent.pointerCancel(charts(), { clientX: 60, pointerId: 1 });
      expect(onSelect).not.toHaveBeenCalled();
    });

    it('moves through the weeks as you drag sideways', () => {
      stubWidth();
      const onSelect = vi.fn();
      render(<WeekCharts weeks={WEEKS} total={10} selected={2} onSelect={onSelect} />);
      fireEvent.pointerDown(charts(), { clientX: 60, pointerId: 1, buttons: 1 });
      fireEvent.pointerMove(charts(), { clientX: 62, pointerId: 1, buttons: 1 });
      expect(onSelect).not.toHaveBeenCalled();
      fireEvent.pointerMove(charts(), { clientX: 200, pointerId: 1, buttons: 1 });
      expect(onSelect).toHaveBeenLastCalledWith(1);
      fireEvent.pointerMove(charts(), { clientX: 300, pointerId: 1, buttons: 1 });
      expect(onSelect).toHaveBeenLastCalledWith(2);
    });
  });
});
