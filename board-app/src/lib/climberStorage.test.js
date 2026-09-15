import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getStoredClimberId, setStoredClimberId } from './climberStorage';

beforeEach(() => {
  localStorage.clear();
});

describe('getStoredClimberId', () => {
  it('returns null when nothing has been stored', () => {
    expect(getStoredClimberId()).toBeNull();
  });

  it('returns a previously stored id', () => {
    localStorage.setItem('board-app:currentClimberId', 'c1');
    expect(getStoredClimberId()).toBe('c1');
  });

  it('returns null instead of throwing when localStorage is unavailable', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('unavailable');
    });
    expect(getStoredClimberId()).toBeNull();
    spy.mockRestore();
  });
});

describe('setStoredClimberId', () => {
  it('persists the id under the storage key', () => {
    setStoredClimberId('c1');
    expect(localStorage.getItem('board-app:currentClimberId')).toBe('c1');
  });

  it('does not throw when localStorage is unavailable', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('unavailable');
    });
    expect(() => setStoredClimberId('c1')).not.toThrow();
    spy.mockRestore();
  });
});
