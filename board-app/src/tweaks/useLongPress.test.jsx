import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import useLongPress, { LONG_PRESS_MS } from './useLongPress';

function Title({ onLongPress }) {
  return <h1 {...useLongPress(onLongPress)}>THE BOARD</h1>;
}

const press = () => {
  const h1 = screen.getByText('THE BOARD');
  fireEvent.pointerDown(h1, { clientX: 50, clientY: 20, pointerId: 1 });
  return h1;
};
const advance = (ms) => act(() => { vi.advanceTimersByTime(ms); });

describe('useLongPress', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('fires once after holding for 600ms', () => {
    const spy = vi.fn();
    render(<Title onLongPress={spy} />);
    press();
    advance(LONG_PRESS_MS);
    expect(spy).toHaveBeenCalledTimes(1);
    advance(1000);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('does nothing on a quick tap', () => {
    const spy = vi.fn();
    render(<Title onLongPress={spy} />);
    const h1 = press();
    advance(599);
    fireEvent.pointerUp(h1, { pointerId: 1 });
    advance(100);
    expect(spy).not.toHaveBeenCalled();
  });

  it('lets a scroll through', () => {
    const spy = vi.fn();
    render(<Title onLongPress={spy} />);
    const h1 = press();
    fireEvent.pointerMove(h1, { clientX: 50, clientY: 31, pointerId: 1 });
    advance(LONG_PRESS_MS);
    expect(spy).not.toHaveBeenCalled();

    press();
    fireEvent.pointerMove(h1, { clientX: 50, clientY: 25, pointerId: 1 });
    advance(LONG_PRESS_MS);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('cancels when the browser takes the touch', () => {
    const spy = vi.fn();
    render(<Title onLongPress={spy} />);
    const h1 = press();
    fireEvent.pointerCancel(h1, { pointerId: 1 });
    advance(LONG_PRESS_MS);
    expect(spy).not.toHaveBeenCalled();
  });

  it('stops the long-press menu', () => {
    render(<Title onLongPress={vi.fn()} />);
    expect(fireEvent.contextMenu(screen.getByText('THE BOARD'))).toBe(false);
  });
});
