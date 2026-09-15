import { describe, it, expect, beforeEach, vi } from 'vitest';
import { recordSegmentStep, readLastSegmentStep, clearSegmentStep } from './segmentDebug';

beforeEach(() => {
  localStorage.clear();
});

describe('recordSegmentStep / readLastSegmentStep', () => {
  it('returns null when nothing has been recorded', () => {
    expect(readLastSegmentStep()).toBeNull();
  });

  it('records a step and reads it back with a timestamp', () => {
    const before = Date.now();
    recordSegmentStep('loadModel:wasm:start');
    const result = readLastSegmentStep();
    expect(result.step).toBe('loadModel:wasm:start');
    expect(result.ts).toBeGreaterThanOrEqual(before);
  });

  it('overwrites the previous step when a new one is recorded', () => {
    recordSegmentStep('first');
    recordSegmentStep('second');
    expect(readLastSegmentStep().step).toBe('second');
  });

  it('does not throw when localStorage is unavailable', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('unavailable');
    });
    expect(() => recordSegmentStep('x')).not.toThrow();
    spy.mockRestore();
  });

  it('returns null instead of throwing when localStorage is unavailable', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('unavailable');
    });
    expect(readLastSegmentStep()).toBeNull();
    spy.mockRestore();
  });
});

describe('clearSegmentStep', () => {
  it('removes a previously recorded step', () => {
    recordSegmentStep('some-step');
    clearSegmentStep();
    expect(readLastSegmentStep()).toBeNull();
  });

  it('does not throw when localStorage is unavailable', () => {
    const spy = vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('unavailable');
    });
    expect(() => clearSegmentStep()).not.toThrow();
    spy.mockRestore();
  });
});
