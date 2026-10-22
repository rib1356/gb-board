import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import Heatmap from './Heatmap';

const P = (id, holds, photo_url = 'photo-1') => ({ id, created_at: `2026-10-0${id}T00:00:00Z`, photo_url, holds });
const H = (x, y, type = 'hold') => ({ x, y, type });

const loadPhoto = (width = 1000, height = 1000) => {
  const img = screen.getByRole('img', { name: 'Board heatmap' });
  Object.defineProperty(img, 'naturalWidth', { value: width, configurable: true });
  Object.defineProperty(img, 'naturalHeight', { value: height, configurable: true });
  fireEvent.load(img);
};

describe('Heatmap', () => {
  it('draws a glow for each spot once the photo has loaded', () => {
    const problems = [
      P('1', [H(0.2, 0.2), H(0.8, 0.8)]),
      P('2', [H(0.2, 0.2), H(0.5, 0.5)]),
    ];
    render(<Heatmap problems={problems} photoUrl="photo-1" />);
    expect(screen.queryAllByTestId('heat-spot')).toHaveLength(0);
    loadPhoto();
    expect(screen.queryAllByTestId('heat-spot')).toHaveLength(3);
    expect(screen.getByText('1 problem')).toBeInTheDocument();
    expect(screen.getByText('2 problems')).toBeInTheDocument();
    expect(screen.getByText('No glow: never used as a handhold')).toBeInTheDocument();
  });

  it('shows just "1 problem" when no hold is used twice', () => {
    render(<Heatmap problems={[P('1', [H(0.1, 0.1), H(0.9, 0.9)])]} photoUrl="photo-1" />);
    loadPhoto();
    expect(screen.getAllByTestId('heat-spot')).toHaveLength(2);
    expect(screen.getByText('1 problem')).toBeInTheDocument();
    expect(screen.queryByText(/problems$/)).toBeNull();
  });

  it('shows the bare photo when every hold is a foot', () => {
    render(<Heatmap problems={[P('1', [H(0.1, 0.1, 'foot'), H(0.9, 0.9, 'foot')])]} photoUrl="photo-1" />);
    loadPhoto();
    expect(screen.getByRole('img', { name: 'Board heatmap' })).toBeInTheDocument();
    expect(screen.queryAllByTestId('heat-spot')).toHaveLength(0);
    expect(screen.queryByText(/^1 problem/)).toBeNull();
    expect(screen.getByText('No glow: never used as a handhold')).toBeInTheDocument();
  });

  it('keeps glows round on a portrait photo', () => {
    render(<Heatmap problems={[P('1', [H(0.5, 0.5)])]} photoUrl="photo-1" />);
    loadPhoto(500, 1000);
    expect(screen.getByTestId('heat-spot').closest('svg')).toHaveAttribute('viewBox', '0 0 1000 2000');
  });

  it('ignores problems set on an older photo', () => {
    render(<Heatmap problems={[P('1', [H(0.5, 0.5)], 'photo-old')]} photoUrl="photo-1" />);
    loadPhoto();
    expect(screen.queryAllByTestId('heat-spot')).toHaveLength(0);
  });
});
