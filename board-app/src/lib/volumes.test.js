import { describe, it, expect } from 'vitest';
import {
  DEFAULT_SIDES, GRIPS, isPinned, faceCenter, facesOnPhoto, faceHold, tagLabel, faceLabel, faceListLines,
  faceStatus, nameTaken, upgradeVolumes, addVolume, renameVolume, removeVolume,
  addSide, renameSide, removeSide, setFace,
} from './volumes';

const PHOTO = 'https://cdn.example/b1.jpg';
const OLD = 'https://cdn.example/old.jpg';
const TRI = [{ x: 0.25, y: 0.125 }, { x: 0.75, y: 0.125 }, { x: 0.5, y: 0.5 }];

describe('presets', () => {
  it('starts a volume with three sides, and offers four grips', () => {
    expect(DEFAULT_SIDES).toEqual(['Top', 'Left', 'Right']);
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
      { id: 'f4', name: 'Right', points: [], photoUrl: null },
    ] },
    { id: 'v2', name: 'Vol2', faces: [{ id: 'f3', name: 'Top', points: TRI, photoUrl: OLD }] },
  ];

  it('keeps only sides marked on that photo and drops volumes left with none', () => {
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

  it("uses a side's current name when it has been renamed", () => {
    const volumes = [{ id: 'v1', name: 'Green', sidesListed: true, faces: [{ id: 'f1', name: 'Pinch side', points: TRI, photoUrl: PHOTO }] }];
    const holds = [{ x: 0.5, y: 0.25, type: 'start', face: { volumeId: 'v1', faceId: 'f1', label: 'Vol1 Top', points: TRI } }];
    expect(faceListLines(holds, volumes)).toEqual(['Green Pinch side — start']);
  });
});

describe('faceLabel', () => {
  const hold = { x: 0.5, y: 0.25, type: 'start', face: { volumeId: 'v1', faceId: 'f1', label: 'Vol1 Top', points: TRI } };

  it('is the current volume and side name', () => {
    const volumes = [{ id: 'v1', name: 'Green', sidesListed: true, faces: [{ id: 'f1', name: 'Pinch side', points: TRI, photoUrl: PHOTO }] }];
    expect(faceLabel(hold, volumes)).toBe('Green Pinch side');
  });

  it("falls back to the problem's own copy once the side is gone", () => {
    expect(faceLabel(hold, [])).toBe('Vol1 Top');
    expect(faceLabel(hold, undefined)).toBe('Vol1 Top');
  });
});

describe('nameTaken', () => {
  it('matches ignoring case and spacing', () => {
    expect(nameTaken(['Top', 'Left'], ' top ')).toBe(true);
    expect(nameTaken(['Top', 'Left'], 'Right')).toBe(false);
  });
});

describe('upgradeVolumes', () => {
  it('spells out the implied Top / Left / Right on a volume saved before sides were listed, keeping marked ones', () => {
    const legacy = [{ id: 'v1', name: 'Vol1', faces: [
      { id: 'f1', name: 'Left', points: TRI, photoUrl: PHOTO },
      { id: 'f2', name: 'Under', points: [{ x: 0.5, y: 0.5 }], photoUrl: PHOTO },
    ] }];
    expect(upgradeVolumes(legacy)).toEqual([{ id: 'v1', name: 'Vol1', sidesListed: true, faces: [
      { id: 'v1-top', name: 'Top', points: [], photoUrl: null },
      { id: 'f1', name: 'Left', points: TRI, photoUrl: PHOTO },
      { id: 'v1-right', name: 'Right', points: [], photoUrl: null },
      { id: 'f2', name: 'Under', points: [{ x: 0.5, y: 0.5 }], photoUrl: PHOTO },
    ] }]);
  });

  it('gives the same ids every time, so a side can be marked before the upgrade is saved', () => {
    const legacy = [{ id: 'v1', name: 'Vol1', faces: [] }];
    expect(upgradeVolumes(legacy)).toEqual(upgradeVolumes(legacy));
  });

  it('leaves a volume that already lists its sides alone', () => {
    const current = [{ id: 'v1', name: 'Vol1', sidesListed: true, faces: [] }];
    expect(upgradeVolumes(current)).toEqual(current);
  });

  it('treats a missing volumes value as no volumes', () => {
    expect(upgradeVolumes(null)).toEqual([]);
  });
});

describe('faceStatus', () => {
  it('reports unmarked, old photo, pinned and outlined', () => {
    expect(faceStatus({ points: [], photoUrl: null }, PHOTO)).toBe('unmarked');
    expect(faceStatus({ points: TRI, photoUrl: OLD }, PHOTO)).toBe('old-photo');
    expect(faceStatus({ points: [{ x: 0.5, y: 0.5 }], photoUrl: PHOTO }, PHOTO)).toBe('pinned');
    expect(faceStatus({ points: TRI, photoUrl: PHOTO }, PHOTO)).toBe('outlined');
  });
});

describe('volume updaters', () => {
  const start = [{ id: 'v1', name: 'Vol1', sidesListed: true, faces: [
    { id: 'f1', name: 'Top', points: TRI, photoUrl: OLD },
    { id: 'f2', name: 'Left', points: [], photoUrl: null },
  ] }];
  const snapshot = JSON.stringify(start);

  it('addVolume appends a trimmed volume with unmarked Top / Left / Right', () => {
    const next = addVolume(start, '  Vol2 ');
    expect(next[1]).toEqual({ id: expect.stringMatching(/^v-/), name: 'Vol2', sidesListed: true, faces: [
      { id: expect.stringMatching(/^f-/), name: 'Top', points: [], photoUrl: null },
      { id: expect.stringMatching(/^f-/), name: 'Left', points: [], photoUrl: null },
      { id: expect.stringMatching(/^f-/), name: 'Right', points: [], photoUrl: null },
    ] });
    expect(JSON.stringify(start)).toBe(snapshot);
  });

  it('renameVolume trims the new name', () => {
    expect(renameVolume(start, 'v1', ' Green ')[0].name).toBe('Green');
    expect(JSON.stringify(start)).toBe(snapshot);
  });

  it('removeVolume drops it', () => {
    expect(removeVolume(start, 'v1')).toEqual([]);
    expect(JSON.stringify(start)).toBe(snapshot);
  });

  it('addSide appends an unmarked side', () => {
    const next = addSide(start, 'v1', ' Under ');
    expect(next[0].faces[2]).toEqual({ id: expect.stringMatching(/^f-/), name: 'Under', points: [], photoUrl: null });
    expect(JSON.stringify(start)).toBe(snapshot);
  });

  it('renameSide keeps its id and marking', () => {
    expect(renameSide(start, 'v1', 'f1', ' Pinch side ')[0].faces[0]).toEqual({ id: 'f1', name: 'Pinch side', points: TRI, photoUrl: OLD });
    expect(JSON.stringify(start)).toBe(snapshot);
  });

  it('removeSide drops it', () => {
    expect(removeSide(start, 'v1', 'f1')[0].faces.map((f) => f.id)).toEqual(['f2']);
    expect(JSON.stringify(start)).toBe(snapshot);
  });

  it('setFace marks a side by id, keeping its id and name', () => {
    const pin = [{ x: 0.4, y: 0.6 }];
    expect(setFace(start, 'v1', 'f2', pin, PHOTO)[0].faces[1]).toEqual({ id: 'f2', name: 'Left', points: pin, photoUrl: PHOTO });
    expect(JSON.stringify(start)).toBe(snapshot);
  });
});
