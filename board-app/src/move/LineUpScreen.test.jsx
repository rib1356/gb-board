import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import LineUpScreen from './LineUpScreen';

const OLD = 'https://cdn.example/old.jpg';
const NEW = 'https://cdn.example/new.jpg';
const SPOTS = [{ x: 20, y: 10 }, { x: 180, y: 10 }, { x: 180, y: 90 }, { x: 20, y: 90 }];

// The photo's wrapper is what's tapped; give it a 200x100 size.
function photo(alt) {
  const wrap = screen.getByAltText(alt).parentElement;
  vi.spyOn(wrap, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 200, height: 100, right: 200, bottom: 100 });
  return wrap;
}
function tap(el, { x, y }) {
  fireEvent.pointerDown(el, { clientX: x, clientY: y, pointerId: 1 });
  fireEvent.pointerUp(el, { clientX: x, clientY: y, pointerId: 1 });
}
const setup = (props = {}) => render(
  <LineUpScreen oldPhotoUrl={OLD} newPhotoUrl={NEW} volumes={[]} onSave={vi.fn()} {...props} />,
);

describe('LineUpScreen', () => {
  it('needs four spots on the old photo before moving on', () => {
    setup();
    expect(screen.getByText(/Tap 4 spots that haven't moved/)).toBeInTheDocument();
    const old = photo('Old board photo');
    SPOTS.slice(0, 3).forEach((s) => tap(old, s));
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
    tap(old, SPOTS[3]);
    expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled();
    expect(screen.getAllByTestId('pin').map((p) => p.textContent)).toEqual(['1', '2', '3', '4']);
  });

  it('allows only as many spots on the new photo as on the old one', () => {
    setup();
    const old = photo('Old board photo');
    SPOTS.forEach((s) => tap(old, s));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    const fresh = photo('New board photo');
    [...SPOTS, { x: 100, y: 50 }].forEach((s) => tap(fresh, s));
    expect(screen.getAllByTestId('pin')).toHaveLength(4);
  });

  it("says when the spots don't give a fit", () => {
    setup();
    const old = photo('Old board photo');
    SPOTS.forEach((s) => tap(old, s));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    const fresh = photo('New board photo');
    [{ x: 10, y: 10 }, { x: 40, y: 20 }, { x: 70, y: 30 }, { x: 100, y: 40 }].forEach((s) => tap(fresh, s));
    expect(screen.getByText("Those points don't give a fit — spread them out more.")).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Check fit' })).toBeDisabled();
  });

  it('checks the fit and saves the tapped spots as fractions', () => {
    const onSave = vi.fn();
    setup({ onSave });
    const old = photo('Old board photo');
    SPOTS.forEach((s) => tap(old, s));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    const fresh = photo('New board photo');
    SPOTS.forEach((s) => tap(fresh, { x: s.x + 10, y: s.y }));
    fireEvent.click(screen.getByRole('button', { name: 'Check fit' }));

    expect(screen.getByRole('slider', { name: 'Fade' })).toHaveValue('50');
    fireEvent.click(screen.getByRole('button', { name: 'Looks right' }));
    const pairs = onSave.mock.calls[0][0];
    expect(pairs).toHaveLength(4);
    expect(pairs[0]).toEqual({ from: { x: 0.1, y: 0.1 }, to: { x: 0.15, y: 0.1 } });
    expect(pairs[2]).toEqual({ from: { x: 0.9, y: 0.9 }, to: { x: 0.95, y: 0.9 } });
  });

  it('drags a pin instead of adding one when you press on it', () => {
    setup();
    const old = photo('Old board photo');
    SPOTS.slice(0, 2).forEach((s) => tap(old, s));
    fireEvent.pointerDown(old, { clientX: 181, clientY: 11, pointerId: 1 });
    fireEvent.pointerMove(old, { clientX: 150, clientY: 40, pointerId: 1 });
    fireEvent.pointerUp(old, { clientX: 150, clientY: 40, pointerId: 1 });
    const pins = screen.getAllByTestId('pin');
    expect(pins).toHaveLength(2);
    expect(pins[1].style.left).toBe('75%');
    expect(pins[1].style.top).toBe('40%');
  });

  it('starts from a saved line-up', () => {
    const initialPairs = SPOTS.map((s) => ({ from: { x: s.x / 200, y: s.y / 100 }, to: { x: s.x / 200, y: s.y / 100 } }));
    setup({ initialPairs });
    expect(screen.getAllByTestId('pin')).toHaveLength(4);
    expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled();
  });
});

describe('LineUpScreen finder', () => {
  it("keeps the zoomed old photo away from the spot you're looking for", () => {
    setup();
    const old = photo('Old board photo');
    SPOTS.forEach((s) => tap(old, s));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    const fresh = photo('New board photo');
    SPOTS.slice(0, 2).forEach((s) => tap(fresh, s));
    // Spot 3 is bottom right, so the zoom goes top left.
    const label = screen.getByText('Find spot 3');
    expect(label.parentElement.style.left).toBe('8px');
    expect(label.parentElement.style.top).toBe('8px');
  });
});
