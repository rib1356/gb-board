import { useState } from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import { faceNames, faceStatus, addVolume, removeVolume, clearFace } from '../lib/volumes';
import { inputStyle, sectionHeading, linkButton, primaryButton } from '../ui';

const STATUS_TEXT = {
  outlined: 'Outlined',
  pinned: 'Pinned',
  unmarked: 'Not marked',
  'old-photo': 'Old photo — re-mark',
};

const smallButton = {
  background: 'none', border: '1px solid #3a3b3e', color: '#c7c8cb', borderRadius: 8,
  padding: '5px 10px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
};

const card = { background: '#232427', border: '1px solid #2A2B2E', borderRadius: 12, padding: 12, marginBottom: 10 };

export default function VolumesScreen({ volumes, photoUrl, marking, saving, onSave, onStartMarking, onUndoPoint, onFinishOutline, onCancelMarking }) {
  const [newVolumeName, setNewVolumeName] = useState('');
  // Custom face names typed in but not marked yet -- a face is only stored
  // once it has an outline or a pin.
  const [customNames, setCustomNames] = useState({});
  const [customFor, setCustomFor] = useState(null);
  const [customName, setCustomName] = useState('');
  const [confirmingDeleteId, setConfirmingDeleteId] = useState(null);

  if (marking) {
    const volumeName = volumes.find((v) => v.id === marking.volumeId)?.name ?? '';
    const label = `${volumeName} ${marking.name}`;
    const count = marking.points.length;
    return (
      <div style={{ ...card, marginTop: 16, padding: 14 }}>
        <p style={{ margin: '0 0 4px', fontSize: 14.5, fontWeight: 600 }}>
          {marking.mode === 'pin' ? `Tap where ${label} is` : `Tap the corners of ${label}`}
        </p>
        <p style={{ margin: '0 0 12px', fontSize: 12.5, color: '#8b8d91' }}>
          {marking.mode === 'pin'
            ? 'For a face the photo can’t show — tap the hold coming off it, or its nearest edge.'
            : `${count} corner${count === 1 ? '' : 's'} — at least 3`}
        </p>
        <div style={{ display: 'flex', gap: 8 }}>
          {marking.mode === 'outline' && (
            <>
              <button onClick={onUndoPoint} disabled={count === 0 || saving} style={smallButton}>Undo point</button>
              <button onClick={onFinishOutline} disabled={count < 3 || saving} style={primaryButton(count >= 3 && !saving)}>Done</button>
            </>
          )}
          <button onClick={onCancelMarking} disabled={saving} style={smallButton}>Cancel</button>
        </div>
      </div>
    );
  }

  const handleAddVolume = async () => {
    if (await onSave(addVolume(volumes, newVolumeName))) setNewVolumeName('');
  };

  const handleAddCustom = (volumeId) => {
    setCustomNames((prev) => ({ ...prev, [volumeId]: [...(prev[volumeId] || []), customName.trim()] }));
    setCustomFor(null);
    setCustomName('');
  };

  return (
    <div style={{ marginTop: 18 }}>
      <h2 style={sectionHeading}>Volumes</h2>
      <p style={{ fontSize: 13, color: '#8b8d91', margin: '0 0 14px' }}>
        Outline a face you can see by tapping its corners. Pin one the photo can’t show with a single tap.
      </p>

      {volumes.length === 0 && (
        <p style={{ fontSize: 14, color: '#6d6f73', margin: '0 0 14px' }}>No volumes yet. Add one for each volume on the board.</p>
      )}

      {volumes.map((volume) => {
        const names = faceNames(volume, customNames[volume.id]);
        const customTaken = names.some((n) => n.toLowerCase() === customName.trim().toLowerCase());
        return (
          <div key={volume.id} style={card}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontWeight: 700, fontSize: 15 }}>{volume.name}</span>
              {confirmingDeleteId === volume.id ? (
                <span style={{ display: 'flex', gap: 6 }}>
                  <button onClick={() => onSave(removeVolume(volumes, volume.id))} disabled={saving} style={{ ...smallButton, background: '#D9552B', borderColor: '#D9552B', color: '#17181A' }}>Yes, delete</button>
                  <button onClick={() => setConfirmingDeleteId(null)} style={smallButton}>Cancel</button>
                </span>
              ) : (
                <button aria-label={`Delete ${volume.name}`} onClick={() => setConfirmingDeleteId(volume.id)} style={{ ...linkButton, color: '#8b8d91' }}>
                  <Trash2 size={14} />
                </button>
              )}
            </div>
            {names.map((name) => {
              const face = volume.faces.find((f) => f.name === name);
              const status = faceStatus(face, photoUrl);
              const label = `${volume.name} ${name}`;
              return (
                <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderTop: '1px solid #2A2B2E' }}>
                  <span style={{ width: 56, fontSize: 14, fontWeight: 600 }}>{name}</span>
                  <span style={{ flex: 1, fontSize: 12.5, color: status === 'old-photo' ? '#D9552B' : '#8b8d91' }}>{STATUS_TEXT[status]}</span>
                  <button aria-label={`Outline ${label}`} onClick={() => onStartMarking({ volumeId: volume.id, name, mode: 'outline' })} style={smallButton}>Outline</button>
                  <button aria-label={`Pin ${label}`} onClick={() => onStartMarking({ volumeId: volume.id, name, mode: 'pin' })} style={smallButton}>Pin</button>
                  {face && (
                    <button aria-label={`Clear ${label}`} onClick={() => onSave(clearFace(volumes, volume.id, name))} disabled={saving} style={{ ...linkButton, color: '#8b8d91' }}>
                      <X size={15} />
                    </button>
                  )}
                </div>
              );
            })}
            {customFor === volume.id ? (
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <input value={customName} onChange={(e) => setCustomName(e.target.value)} placeholder="Face name" style={{ ...inputStyle, marginTop: 0, flex: 1 }} />
                <button onClick={() => handleAddCustom(volume.id)} disabled={!customName.trim() || customTaken} style={smallButton}>Add face</button>
              </div>
            ) : (
              <button onClick={() => { setCustomFor(volume.id); setCustomName(''); }} style={{ ...linkButton, fontSize: 13, marginTop: 8 }}>+ Custom face</button>
            )}
          </div>
        );
      })}

      <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
        <input value={newVolumeName} onChange={(e) => setNewVolumeName(e.target.value)} placeholder="e.g. Vol1" style={{ ...inputStyle, marginTop: 0, flex: 1 }} />
        <button onClick={handleAddVolume} disabled={!newVolumeName.trim() || saving} style={{ ...primaryButton(Boolean(newVolumeName.trim()) && !saving), display: 'flex', alignItems: 'center', gap: 6 }}>
          <Plus size={15} /> Add volume
        </button>
      </div>
    </div>
  );
}
