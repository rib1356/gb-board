import { describe, it, expect } from 'vitest';
import { computeScaledSize } from './image';

describe('computeScaledSize', () => {
  it('leaves an image smaller than maxWidth unchanged', () => {
    expect(computeScaledSize(800, 600, 1400)).toEqual({ width: 800, height: 600 });
  });

  it('scales an image wider than maxWidth down, preserving aspect ratio', () => {
    expect(computeScaledSize(2800, 2100, 1400)).toEqual({ width: 1400, height: 1050 });
  });
});
