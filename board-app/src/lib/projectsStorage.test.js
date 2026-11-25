import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getProjectsCollapsed, setProjectsCollapsed } from './projectsStorage';

beforeEach(() => {
  localStorage.clear();
});

describe('getProjectsCollapsed', () => {
  it('is open (false) when nothing has been stored', () => {
    expect(getProjectsCollapsed()).toBe(false);
  });

  it('reads back a stored collapse', () => {
    setProjectsCollapsed(true);
    expect(getProjectsCollapsed()).toBe(true);
    setProjectsCollapsed(false);
    expect(getProjectsCollapsed()).toBe(false);
  });

  it('is open instead of throwing when localStorage is unavailable', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('unavailable');
    });
    expect(getProjectsCollapsed()).toBe(false);
    spy.mockRestore();
  });
});

describe('setProjectsCollapsed', () => {
  it('does not throw when localStorage is unavailable', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('unavailable');
    });
    expect(() => setProjectsCollapsed(true)).not.toThrow();
    spy.mockRestore();
  });
});
