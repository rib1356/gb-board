import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import PainSlider from './PainSlider';

// With the track stubbed at 200px wide, every 20px is one point of pain.
const stubTrack = () => vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect')
  .mockReturnValue({ left: 0, top: 0, width: 200, height: 4, right: 200, bottom: 4, x: 0, y: 0 });
const track = () => screen.getByTestId('pain-track');
const press = (x) => fireEvent.pointerDown(track(), { clientX: x, pointerId: 1 });
const move = (x) => fireEvent.pointerMove(track(), { clientX: x, pointerId: 1 });

afterEach(() => vi.restoreAllMocks());

describe('PainSlider', () => {
  it('exposes two labelled sliders with their range and value', () => {
    render(<PainSlider low={1} high={2.5} onChange={() => {}} />);
    const low = screen.getByRole('slider', { name: 'Lowest pain' });
    const high = screen.getByRole('slider', { name: 'Highest pain' });
    expect(low).toHaveAttribute('aria-valuenow', '1');
    expect(high).toHaveAttribute('aria-valuenow', '2.5');
    expect(high).toHaveAttribute('aria-valuemax', '10');
    expect(low).toHaveAttribute('aria-valuemin', '0');
  });

  describe('keyboard', () => {
    it('nudges the high thumb up half a point', () => {
      const onChange = vi.fn();
      render(<PainSlider low={1} high={2} onChange={onChange} />);
      fireEvent.keyDown(screen.getByRole('slider', { name: 'Highest pain' }), { key: 'ArrowRight' });
      expect(onChange).toHaveBeenCalledWith(1, 2.5);
    });

    it("won't push the low thumb past the high one", () => {
      const onChange = vi.fn();
      render(<PainSlider low={2} high={2} onChange={onChange} />);
      fireEvent.keyDown(screen.getByRole('slider', { name: 'Lowest pain' }), { key: 'ArrowRight' });
      expect(onChange).not.toHaveBeenCalled();
    });

    it('jumps the high thumb to 10 on End', () => {
      const onChange = vi.fn();
      render(<PainSlider low={1} high={2} onChange={onChange} />);
      fireEvent.keyDown(screen.getByRole('slider', { name: 'Highest pain' }), { key: 'End' });
      expect(onChange).toHaveBeenCalledWith(1, 10);
    });

    it('steps down with ArrowLeft and goes to the low end on Home', () => {
      const onChange = vi.fn();
      render(<PainSlider low={1} high={2} onChange={onChange} />);
      const low = screen.getByRole('slider', { name: 'Lowest pain' });
      fireEvent.keyDown(low, { key: 'ArrowLeft' });
      expect(onChange).toHaveBeenLastCalledWith(0.5, 2);
      fireEvent.keyDown(screen.getByRole('slider', { name: 'Highest pain' }), { key: 'Home' });
      expect(onChange).toHaveBeenLastCalledWith(1, 1);
    });
  });

  describe('pointer', () => {
    it('moves the nearest thumb to the press point', () => {
      stubTrack();
      const onChange = vi.fn();
      render(<PainSlider low={1} high={2} onChange={onChange} />);
      press(100);
      expect(onChange).toHaveBeenCalledWith(1, 5);
    });

    it('rounds the press to the nearest half point', () => {
      stubTrack();
      const onChange = vi.fn();
      render(<PainSlider low={1} high={2} onChange={onChange} />);
      press(113);
      expect(onChange).toHaveBeenCalledWith(1, 5.5);
    });

    it('picks the high thumb when a drag from a shared value goes right', () => {
      stubTrack();
      const onChange = vi.fn();
      render(<PainSlider low={2} high={2} onChange={onChange} />);
      press(40);
      expect(onChange).not.toHaveBeenCalled();
      move(60);
      expect(onChange).toHaveBeenLastCalledWith(2, 3);
    });

    it('picks the low thumb when a drag from a shared value goes left', () => {
      stubTrack();
      const onChange = vi.fn();
      render(<PainSlider low={2} high={2} onChange={onChange} />);
      press(40);
      move(20);
      expect(onChange).toHaveBeenLastCalledWith(1, 2);
    });

    it('stops following the pointer once it is released', () => {
      stubTrack();
      const onChange = vi.fn();
      render(<PainSlider low={1} high={2} onChange={onChange} />);
      press(100);
      fireEvent.pointerUp(track(), { pointerId: 1 });
      onChange.mockClear();
      move(160);
      expect(onChange).not.toHaveBeenCalled();
    });

    it('keeps the track from scrolling the sheet under a finger', () => {
      render(<PainSlider low={1} high={2} onChange={() => {}} />);
      expect(track().style.touchAction).toBe('none');
    });
  });

  describe('single', () => {
    it('shows one thumb with the given label', () => {
      render(<PainSlider single low={4} high={5} min={4} label="Spike" onChange={() => {}} />);
      expect(screen.getAllByRole('slider')).toHaveLength(1);
      const spike = screen.getByRole('slider', { name: 'Spike' });
      expect(spike).toHaveAttribute('aria-valuemin', '4');
      expect(spike).toHaveAttribute('aria-valuenow', '5');
    });

    it("can't be pressed below the minimum", () => {
      stubTrack();
      const onChange = vi.fn();
      render(<PainSlider single low={4} high={6} min={4} label="Spike" onChange={onChange} />);
      press(20);
      expect(onChange).toHaveBeenCalledWith(4, 4);
    });

    it("can't be nudged below the minimum by keyboard", () => {
      const onChange = vi.fn();
      render(<PainSlider single low={4} high={4} min={4} label="Spike" onChange={onChange} />);
      fireEvent.keyDown(screen.getByRole('slider', { name: 'Spike' }), { key: 'ArrowLeft' });
      expect(onChange).not.toHaveBeenCalled();
    });
  });
});
