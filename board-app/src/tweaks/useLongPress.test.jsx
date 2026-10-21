import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useState } from 'react';
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

  // Like the app's header: the hold swaps the title for a back button in the
  // same spot, which is where iOS sends its click once the finger lifts.
  describe('the click iOS sends after a hold', () => {
    function Header({ onBack }) {
      const [inside, setInside] = useState(false);
      const press = useLongPress(() => setInside(true));
      return inside
        ? <button onClick={onBack}>‹ Board</button>
        : <h1 {...press}>THE BOARD</h1>;
    }

    const hold = () => {
      const onBack = vi.fn();
      const view = render(<Header onBack={onBack} />);
      press();
      advance(LONG_PRESS_MS);
      const back = screen.getByRole('button', { name: '‹ Board' });
      fireEvent.pointerUp(back, { pointerId: 1 });
      return { onBack, back, ...view };
    };
    const tap = (el) => {
      fireEvent.pointerDown(el, { pointerId: 2 });
      fireEvent.pointerUp(el, { pointerId: 2 });
      return fireEvent.click(el);
    };

    it('is swallowed', () => {
      const { onBack, back } = hold();
      expect(fireEvent.click(back)).toBe(false);
      expect(onBack).not.toHaveBeenCalled();
    });

    it('is only one click', () => {
      const { onBack, back } = hold();
      fireEvent.click(back);
      fireEvent.click(back);
      expect(onBack).toHaveBeenCalledTimes(1);
    });

    it('leaves a real tap after it alone', () => {
      const { onBack, back } = hold();
      expect(tap(back)).toBe(true);
      expect(onBack).toHaveBeenCalledTimes(1);
    });

    it('is still caught just under 600ms after the finger lifts', () => {
      const { onBack, back } = hold();
      advance(599);
      fireEvent.click(back);
      expect(onBack).not.toHaveBeenCalled();
    });

    it('stops waiting for it 600ms after the finger lifts', () => {
      const { onBack, back } = hold();
      advance(600);
      fireEvent.click(back);
      expect(onBack).toHaveBeenCalledTimes(1);
    });

    it('stops waiting for it once unmounted', () => {
      const { unmount } = hold();
      unmount();
      const onClick = vi.fn();
      render(<button onClick={onClick}>Elsewhere</button>);
      fireEvent.click(screen.getByRole('button', { name: 'Elsewhere' }));
      expect(onClick).toHaveBeenCalledTimes(1);
    });

    it('lets clicks through when no hold fired', () => {
      const onClick = vi.fn();
      render(<><Title onLongPress={vi.fn()} /><button onClick={onClick}>Elsewhere</button></>);
      const h1 = press();
      advance(LONG_PRESS_MS - 1);
      fireEvent.pointerUp(h1, { pointerId: 1 });
      fireEvent.click(screen.getByRole('button', { name: 'Elsewhere' }));
      expect(onClick).toHaveBeenCalledTimes(1);
    });
  });
});
