import { describe, it, expect, beforeEach, vi } from 'vitest';
import { loadCheckAgain, saveCheckAgain } from './checkAgain';

const OLD = 'https://cdn.example/old.jpg';
const NEW = 'https://cdn.example/new.jpg';

describe('checkAgain storage', () => {
  beforeEach(() => localStorage.clear());

  it('remembers which problems have been checked again between these two photos', () => {
    saveCheckAgain(OLD, NEW, new Set(['p1', 'p2']));
    expect(loadCheckAgain(OLD, NEW)).toEqual(new Set(['p1', 'p2']));
  });

  it('has no check going for other photos, or once it is cleared', () => {
    saveCheckAgain(OLD, NEW, new Set(['p1']));
    expect(loadCheckAgain('https://cdn.example/other.jpg', NEW)).toBeNull();
    saveCheckAgain(OLD, NEW, null);
    expect(loadCheckAgain(OLD, NEW)).toBeNull();
  });

  it('copes with storage being unavailable or holding junk', () => {
    localStorage.setItem('board-app:checkAgain', '{not json');
    expect(loadCheckAgain(OLD, NEW)).toBeNull();
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
    expect(() => saveCheckAgain(OLD, NEW, new Set(['p1']))).not.toThrow();
    spy.mockRestore();
  });
});
