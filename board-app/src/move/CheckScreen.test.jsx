import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { solveHomography } from '../lib/homography';
import CheckScreen from './CheckScreen';

const OLD = 'https://cdn.example/old.jpg';
const NEW = 'https://cdn.example/new.jpg';
const CORNERS = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }];
const H = solveHomography(CORNERS.map((p) => ({ from: p, to: p })));
const ALIGNMENT = { from: OLD, to: NEW, pairs: CORNERS.map((p) => ({ from: p, to: p })) };
const COLORS = { start: '#5C8A66', hold: '#4FB3BF', foot: '#EDEAE3', finish: '#D9552B' };

const waiting = (id, name, extra = {}) => ({
  id, name, grade: 'V4', setter: 'Rob', photo_url: OLD, mask_url: `${id}-mask.png`,
  holds: [{ x: 0.2, y: 0.3, type: 'start' }], moved_from: null, ...extra,
});
const moved = (id, name) => ({
  ...waiting(id, name), photo_url: NEW, mask_url: `${id}-new.png`,
  moved_from: [{ photo_url: OLD, holds: [], mask_url: `${id}-mask.png`, moved_at: 't' }],
});

function setup(props = {}) {
  const handlers = { onIndexChange: vi.fn(), onAccept: vi.fn(), onFix: vi.fn(), onPutBack: vi.fn(), onRedoLineUp: vi.fn() };
  render(
    <CheckScreen
      list={[waiting('p1', 'Big bump'), waiting('p2', 'Pinchin'), waiting('p3', 'Worship')]}
      index={0} alignment={ALIGNMENT} H={H} colors={COLORS} volumes={[]} busyId={null} error={null}
      {...handlers} {...props}
    />,
  );
  return handlers;
}

afterEach(() => vi.useRealTimers());

describe('CheckScreen', () => {
  it('shows where you are and accepts the problem', () => {
    const { onAccept } = setup();
    expect(screen.getByText('1 of 3 · 0 moved')).toBeInTheDocument();
    expect(screen.getByText('Big bump')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Accept' }));
    expect(onAccept).toHaveBeenCalledWith(expect.objectContaining({ id: 'p1' }));
  });

  it('fixes, skips, and has no going back from the first problem', () => {
    const { onFix, onIndexChange } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Fix holds' }));
    expect(onFix).toHaveBeenCalledWith(expect.objectContaining({ id: 'p1' }));
    fireEvent.click(screen.getByRole('button', { name: 'Skip ›' }));
    expect(onIndexChange).toHaveBeenCalledWith(1);
    expect(screen.getByRole('button', { name: '‹ Back' })).toBeDisabled();
  });

  it('skips past problems already moved', () => {
    const { onIndexChange } = setup({ list: [waiting('p1', 'A'), moved('p2', 'B'), waiting('p3', 'C')] });
    fireEvent.click(screen.getByRole('button', { name: 'Skip ›' }));
    expect(onIndexChange).toHaveBeenCalledWith(2);
  });

  it('offers to put back a moved problem instead of accepting it', () => {
    const { onPutBack } = setup({ list: [waiting('p1', 'A'), moved('p2', 'B')], index: 1 });
    expect(screen.getByText('Moved ✓')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Accept' })).not.toBeInTheDocument();
    expect(screen.getByText("Undoes anything changed since the move.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Put back' }));
    expect(onPutBack).toHaveBeenCalledWith(expect.objectContaining({ id: 'p2' }));
  });

  it("can't accept while that problem is saving", () => {
    setup({ busyId: 'p1' });
    expect(screen.getByRole('button', { name: 'Moving…' })).toBeDisabled();
  });

  it('locks every button while any problem is saving, so two saves never overlap', () => {
    setup({ list: [waiting('p1', 'A'), moved('p2', 'B'), waiting('p3', 'C')], index: 1, busyId: 'p3' });
    expect(screen.getByRole('button', { name: 'Put back' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '‹ Back' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Skip ›' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Redo line-up' })).toBeDisabled();
  });

  it('locks Accept and Fix on a waiting problem while another is saving', () => {
    setup({ busyId: 'p2' });
    expect(screen.getByRole('button', { name: 'Accept' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Fix holds' })).toBeDisabled();
  });

  it('says when everything has moved', () => {
    const { onIndexChange } = setup({ list: [moved('p1', 'A'), moved('p2', 'B')] });
    expect(screen.getByText("All moved. The old photo isn't used any more.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Back to Tweaks' }));
    expect(onIndexChange).toHaveBeenCalledWith(-1);
  });

  it('shows the error under the buttons', () => {
    setup({ error: 'Could not move that problem — check your connection and try again.' });
    expect(screen.getByRole('alert')).toHaveTextContent('Could not move that problem');
  });

  it('shows the old photo while the photo is held', () => {
    vi.useFakeTimers();
    setup();
    const wrap = screen.getByAltText('New board photo').parentElement;
    fireEvent.pointerDown(wrap, { pointerId: 1 });
    act(() => { vi.advanceTimersByTime(300); });
    expect(screen.getByAltText('Old photo')).toBeInTheDocument();
    fireEvent.pointerUp(wrap, { pointerId: 1 });
    expect(screen.queryByAltText('Old photo')).not.toBeInTheDocument();
  });

  it("draws a waiting problem's old highlight through the line-up", () => {
    setup();
    const img = screen.getByAltText('New board photo');
    Object.defineProperty(img, 'clientWidth', { value: 200 });
    Object.defineProperty(img, 'clientHeight', { value: 100 });
    fireEvent.load(img);
    const highlight = screen.getByTestId('moved-highlight');
    expect(highlight).toHaveAttribute('src', 'p1-mask.png');
    expect(highlight.style.transform).toMatch(/^matrix3d\(/);
  });

  it('asks to redo the line-up', () => {
    const { onRedoLineUp } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Redo line-up' }));
    expect(onRedoLineUp).toHaveBeenCalled();
  });
});
