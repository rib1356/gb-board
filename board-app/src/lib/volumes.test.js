import { describe, it, expect } from 'vitest';
import {
  FACE_PRESETS, GRIPS, isPinned, faceCenter, facesOnPhoto, faceHold, tagLabel, faceListLines,
  faceNames, faceStatus, addVolume, removeVolume, setFace, clearFace,
} from './volumes';

const PHOTO = 'https://cdn.example/b1.jpg';
const OLD = 'https://cdn.example/old.jpg';
const TRI = [{ x: 0.25, y: 0.125 }, { x: 0.75, y: 0.125 }, { x: 0.5, y: 0.5 }];

describe('presets', () => {
  it('offers the four standard faces and four grips', () => {
    expect(FACE_PRESETS).toEqual(['Top', 'Left', 'Right', 'Under']);
    expect(GRIPS.map((g) => g.value)).toEqual(['undercut', 'pinch', 'gaston', 'sidepull']);
  });
});

describe('isPinned', () => {
  it('treats a single point as a pin and 3+ as an outline', () => {
    expect(isPinned({ points: [{ x: 0.5, y: 0.5 }] })).toBe(true);
    expect(isPinned({ points: TRI })).toBe(false);
  });
});

describe('faceCenter', () => {
  it('averages the points', () => {
    expect(faceCenter(TRI)).toEqual({ x: 0.5, y: 0.25 });
  });

  it('is the pin itself for a single point', () => {
    expect(faceCenter([{ x: 0.3, y: 0.7 }])).toEqual({ x: 0.3, y: 0.7 });
  });
});

describe('facesOnPhoto', () => {
  const volumes = [
    { id: 'v1', name: 'Vol1', faces: [
      { id: 'f1', name: 'Top', points: TRI, photoUrl: PHOTO },
      { id: 'f2', name: 'Left', points: TRI, photoUrl: OLD },
    ] },
    { id: 'v2', name: 'Vol2', faces: [{ id: 'f3', name: 'Top', points: TRI, photoUrl: OLD }] },
  ];

  it('keeps only faces marked on that photo and drops volumes left with none', () => {
    expect(facesOnPhoto(volumes, PHOTO)).toEqual([{ volume: volumes[0], faces: [volumes[0].faces[0]] }]);
  });

  it('treats a missing volumes value as no volumes', () => {
    expect(facesOnPhoto(null, PHOTO)).toEqual([]);
    expect(facesOnPhoto(undefined, PHOTO)).toEqual([]);
  });
});

describe('faceHold', () => {
  it('snapshots the label and points, centred on the face', () => {
    const volume = { id: 'v1', name: 'Vol1', faces: [] };
    const face = { id: 'f1', name: 'Top', points: TRI, photoUrl: PHOTO };
    expect(faceHold(volume, face, 'start')).toEqual({
      x: 0.5, y: 0.25, type: 'start',
      face: { volumeId: 'v1', faceId: 'f1', label: 'Vol1 Top', points: TRI },
    });
  });
});

describe('tagLabel', () => {
  it('joins hand then the short grip', () => {
    expect(tagLabel({ hand: 'R', grip: 'undercut' })).toBe('R UC');
    expect(tagLabel({ hand: 'L', grip: 'pinch' })).toBe('L Pinch');
  });

  it('shows whichever half is set', () => {
    expect(tagLabel({ hand: 'L' })).toBe('L');
    expect(tagLabel({ grip: 'gaston' })).toBe('Gaston');
  });

  it('is empty for an untagged hold', () => {
    expect(tagLabel({ x: 0.1, y: 0.1, type: 'hold' })).toBe('');
  });
});

describe('faceListLines', () => {
  it('lists faces only, in placement order, with hand and grip spelled out', () => {
    const face = (label) => ({ volumeId: 'v', faceId: label, label, points: TRI });
    const holds = [
      { x: 0.5, y: 0.25, type: 'start', face: face('Vol1 Top') },
      { x: 0.1, y: 0.1, type: 'hold', hand: 'L', grip: 'pinch' },
      { x: 0.5, y: 0.25, type: 'hold', hand: 'L', face: face('Vol2 Right') },
      { x: 0.5, y: 0.25, type: 'hold', hand: 'R', grip: 'undercut', face: face('Vol2 Top') },
    ];
    expect(faceListLines(holds)).toEqual([
      'Vol1 Top — start',
      'Vol2 Right — hold · left hand',
      'Vol2 Top — hold · right hand · undercut',
    ]);
  });

  it('is empty for a problem without faces', () => {
    expect(faceListLines([{ x: 0.1, y: 0.1, type: 'hold' }])).toEqual([]);
  });
});

describe('faceNames', () => {
  it('lists presets, then stored custom faces, then unsaved custom names, without repeats', () => {
    const volume = { id: 'v1', name: 'Vol1', faces: [
      { id: 'f1', name: 'Top', points: TRI, photoUrl: PHOTO },
      { id: 'f2', name: 'Front', points: TRI, photoUrl: PHOTO },
    ] };
    expect(faceNames(volume, ['Back', 'Front'])).toEqual(['Top', 'Left', 'Right', 'Under', 'Front', 'Back']);
  });
});

describe('faceStatus', () => {
  it('reports unmarked, old photo, pinned and outlined', () => {
    expect(faceStatus(undefined, PHOTO)).toBe('unmarked');
    expect(faceStatus({ points: TRI, photoUrl: OLD }, PHOTO)).toBe('old-photo');
    expect(faceStatus({ points: [{ x: 0.5, y: 0.5 }], photoUrl: PHOTO }, PHOTO)).toBe('pinned');
    expect(faceStatus({ points: TRI, photoUrl: PHOTO }, PHOTO)).toBe('outlined');
  });
});

describe('volume updaters', () => {
  const start = [{ id: 'v1', name: 'Vol1', faces: [{ id: 'f1', name: 'Top', points: TRI, photoUrl: OLD }] }];
  const snapshot = JSON.stringify(start);

  it('addVolume appends a trimmed, empty volume with a new id', () => {
    const next = addVolume(start, '  Vol2 ');
    expect(next[1]).toEqual({ id: expect.stringMatching(/^v-/), name: 'Vol2', faces: [] });
    expect(JSON.stringify(start)).toBe(snapshot);
  });

  it('removeVolume drops it', () => {
    expect(removeVolume(start, 'v1')).toEqual([]);
    expect(JSON.stringify(start)).toBe(snapshot);
  });

  it('setFace re-marks an existing face in place, keeping its id', () => {
    const pin = [{ x: 0.4, y: 0.6 }];
    const next = setFace(start, 'v1', 'Top', pin, PHOTO);
    expect(next[0].faces).toEqual([{ id: 'f1', name: 'Top', points: pin, photoUrl: PHOTO }]);
    expect(JSON.stringify(start)).toBe(snapshot);
  });

  it('setFace adds a face that was never marked', () => {
    const next = setFace(start, 'v1', 'Under', [{ x: 0.4, y: 0.6 }], PHOTO);
    expect(next[0].faces[1]).toEqual({ id: expect.stringMatching(/^f-/), name: 'Under', points: [{ x: 0.4, y: 0.6 }], photoUrl: PHOTO });
  });

  it('clearFace removes it', () => {
    expect(clearFace(start, 'v1', 'Top')[0].faces).toEqual([]);
    expect(JSON.stringify(start)).toBe(snapshot);
  });
});
