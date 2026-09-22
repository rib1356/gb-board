import { describe, it, expect } from 'vitest';
import { photoStatus } from './photoStatus';

describe('photoStatus', () => {
  it('reports current when the problem was set on the board photo still in use', () => {
    const board = { photo_url: 'https://cdn.example/b1/100-aaa.jpg' };
    const problem = { photo_url: 'https://cdn.example/b1/100-aaa.jpg' };
    expect(photoStatus(problem, board)).toBe('current');
  });

  it('reports stale when the board has been re-shot since the problem was set', () => {
    const board = { photo_url: 'https://cdn.example/b1/200-bbb.jpg' };
    const problem = { photo_url: 'https://cdn.example/b1/100-aaa.jpg' };
    expect(photoStatus(problem, board)).toBe('stale');
  });

  // Problems created before photo snapshots existed have no photo of their own,
  // so the detail view falls back to the CURRENT board photo -- their holds are
  // drawn over a photo they were never placed on.
  it('reports unknown when the problem never recorded a photo of its own', () => {
    const board = { photo_url: 'https://cdn.example/b1/200-bbb.jpg' };
    expect(photoStatus({ photo_url: null }, board)).toBe('unknown');
    expect(photoStatus({}, board)).toBe('unknown');
  });

  // Nothing newer exists to be stale against, and the problem still renders its
  // own photo correctly -- so there's nothing to warn about.
  it('reports current when the board has no photo to compare against', () => {
    const problem = { photo_url: 'https://cdn.example/b1/100-aaa.jpg' };
    expect(photoStatus(problem, { photo_url: null })).toBe('current');
    expect(photoStatus(problem, null)).toBe('current');
  });

  it('treats an empty string photo url as missing rather than as a real photo', () => {
    expect(photoStatus({ photo_url: '' }, { photo_url: 'https://cdn.example/b1/200-bbb.jpg' })).toBe('unknown');
  });

  it('does not throw when handed no problem at all', () => {
    expect(photoStatus(null, { photo_url: 'https://cdn.example/b1/200-bbb.jpg' })).toBe('unknown');
  });
});
