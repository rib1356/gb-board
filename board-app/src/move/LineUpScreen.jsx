import { useState } from 'react';
import { applyHomography, cssMatrix3d, solveHomography } from '../lib/homography';
import { sidesOnPhoto } from '../lib/movePhoto';
import { FaceShape, ChalkRing } from '../HoldOverlays';
import { primaryButton, linkButton } from '../ui';
import PinPhoto from './PinPhoto';

const MIN_PINS = 4;
const SIDE_COLOR = '#C9A227';

const heading = { fontFamily: "'Bebas Neue', sans-serif", fontSize: 26, letterSpacing: 1, margin: '0 0 4px', color: '#EDEAE3' };
const help = { fontSize: 13, color: '#8b8d91', margin: '0 0 12px', lineHeight: 1.45 };
const row = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginTop: 14 };

// Rob taps the same spots on the old and new board photo; from those pairs the
// app works out how one photo maps onto the other, and he checks the fit by
// fading the old photo over the new one.
export default function LineUpScreen({ oldPhotoUrl, newPhotoUrl, volumes, initialPairs = null, saving = false, error = null, onSave }) {
  const [step, setStep] = useState('old');
  const [oldPins, setOldPins] = useState(() => initialPairs?.map((p) => p.from) ?? []);
  const [newPins, setNewPins] = useState(() => initialPairs?.map((p) => p.to) ?? []);
  const [fade, setFade] = useState(50);
  const [size, setSize] = useState({ width: 0, height: 0 });

  const pairs = oldPins.map((from, i) => ({ from, to: newPins[i] }));
  const matched = oldPins.length >= MIN_PINS && newPins.length === oldPins.length;
  const H = matched ? solveHomography(pairs) : null;

  // Too few old spots for the new ones (after removing some): trim the extra.
  const setOld = (pins) => {
    setOldPins(pins);
    if (newPins.length > pins.length) setNewPins(newPins.slice(0, pins.length));
  };

  if (step === 'old') {
    return (
      <div>
        <h1 style={heading}>LINE UP · OLD PHOTO</h1>
        <p style={help}>
          Tap 4 spots that haven&apos;t moved: bolt heads, panel corners, the edge of an unchanged hold.
          Spread them out near the corners. Avoid volume tips.
        </p>
        <PinPhoto src={oldPhotoUrl} alt="Old board photo" pins={oldPins} onChange={setOld} />
        <div style={row}>
          <button onClick={() => setOld(oldPins.slice(0, -1))} disabled={oldPins.length === 0} style={linkButton}>Undo pin</button>
          <span style={{ fontSize: 13, color: '#8b8d91' }}>{oldPins.length} of {MIN_PINS}+ spots</span>
          <button onClick={() => setStep('new')} disabled={oldPins.length < MIN_PINS} style={primaryButton(oldPins.length >= MIN_PINS)}>Next</button>
        </div>
      </div>
    );
  }

  if (step === 'new') {
    return (
      <div>
        <h1 style={heading}>LINE UP · NEW PHOTO</h1>
        <p style={help}>Tap the same {oldPins.length} spots, in the same order. The zoomed-in old photo shows which spot is next.</p>
        <PinPhoto
          src={newPhotoUrl}
          alt="New board photo"
          pins={newPins}
          onChange={setNewPins}
          lockedCount={oldPins.length}
          finder={(i) => ({ src: oldPhotoUrl, at: oldPins[i] })}
        />
        {matched && !H && (
          <p role="alert" style={{ color: '#D9552B', fontSize: 13, margin: '10px 0 0' }}>
            Those points don&apos;t give a fit — spread them out more.
          </p>
        )}
        <div style={row}>
          <button onClick={() => setStep('old')} style={linkButton}>‹ Old photo</button>
          <button onClick={() => setNewPins(newPins.slice(0, -1))} disabled={newPins.length === 0} style={linkButton}>Undo pin</button>
          <button onClick={() => setStep('check')} disabled={!H} style={primaryButton(!!H)}>Check fit</button>
        </div>
      </div>
    );
  }

  const sides = sidesOnPhoto(volumes, oldPhotoUrl).map((s) => s.points.map((p) => applyHomography(H, p)));
  const measure = (e) => setSize({ width: e.currentTarget.clientWidth, height: e.currentTarget.clientHeight });
  return (
    <div>
      <h1 style={heading}>LINE UP · CHECK</h1>
      <p style={help}>Fade between the photos. Holds that haven&apos;t moved should sit still, and the volume sides should land on their volumes.</p>
      <div style={{ position: 'relative', borderRadius: 14, overflow: 'hidden', border: '1px solid #2A2B2E' }}>
        <img src={newPhotoUrl} alt="New board photo" onLoad={measure} style={{ width: '100%', display: 'block' }} />
        {size.width > 0 && (
          <img
            src={oldPhotoUrl}
            alt=""
            aria-hidden="true"
            style={{
              position: 'absolute', left: 0, top: 0, width: size.width, height: size.height,
              transformOrigin: '0 0', transform: cssMatrix3d(H, size.width, size.height),
              opacity: fade / 100, pointerEvents: 'none',
            }}
          />
        )}
        {sides.map((points, i) => (
          points.length === 1
            ? <ChalkRing key={i} x={points[0].x} y={points[0].y} color={SIDE_COLOR} />
            : <FaceShape key={i} points={points} color={SIDE_COLOR} fillOpacity={0.25} />
        ))}
      </div>
      <label style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12, fontSize: 13, color: '#8b8d91' }}>
        New
        <input type="range" aria-label="Fade" min={0} max={100} value={fade} onChange={(e) => setFade(Number(e.target.value))} style={{ flex: 1 }} />
        Old
      </label>
      {error && <p role="alert" style={{ color: '#D9552B', fontSize: 13, margin: '10px 0 0' }}>{error}</p>}
      <div style={row}>
        <button onClick={() => setStep('old')} style={linkButton}>Adjust points</button>
        <button onClick={() => onSave(pairs)} disabled={saving} style={primaryButton(!saving)}>{saving ? 'Saving…' : 'Looks right'}</button>
      </div>
    </div>
  );
}
