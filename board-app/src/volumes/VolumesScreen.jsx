import { useState } from 'react';
import { Pencil, Plus, Trash2, X } from 'lucide-react';
import { faceStatus, nameTaken, addVolume, renameVolume, removeVolume, addSide, renameSide, removeSide } from '../lib/volumes';
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

const nameButton = {
  display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', padding: 0,
  color: '#EDEAE3', cursor: 'pointer', fontFamily: "'Inter'", textAlign: 'left',
};

const card = { background: '#232427', border: '1px solid #2A2B2E', borderRadius: 12, padding: 12, marginBottom: 10 };

function NameEditor({ value, onChange, taken, saving, saveLabel = 'Save', placeholder, onSave, onCancel }) {
  const valid = Boolean(value.trim()) && !taken;
  return (
    <div style={{ display: 'flex', gap: 6, flex: 1, minWidth: 0 }}>
      <input
        aria-label="New name"
        autoFocus
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{ ...inputStyle, marginTop: 0, flex: 1, minWidth: 0, padding: '6px 10px' }}
      />
      <button onClick={onSave} disabled={!valid || saving} style={smallButton}>{saveLabel}</button>
      <button onClick={onCancel} style={smallButton}>Cancel</button>
    </div>
  );
}

export default function VolumesScreen({ volumes, photoUrl, marking, saving, onSave, onStartMarking, onUndoPoint, onFinishOutline, onCancelMarking }) {
  const [newVolumeName, setNewVolumeName] = useState('');
  // The one name being edited at a time: a volume's, a side's, or a new side's.
  const [editing, setEditing] = useState(null);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState(null);

  if (marking) {
    const volume = volumes.find((v) => v.id === marking.volumeId);
    const face = volume?.faces.find((f) => f.id === marking.faceId);
    const label = `${volume?.name ?? ''} ${face?.name ?? ''}`;
    const count = marking.points.length;
    return (
      <div style={{ ...card, marginTop: 16, padding: 14 }}>
        <p style={{ margin: '0 0 4px', fontSize: 14.5, fontWeight: 600 }}>
          {marking.mode === 'pin' ? `Tap where ${label} is` : `Tap the corners of ${label}`}
        </p>
        <p style={{ margin: '0 0 12px', fontSize: 12.5, color: '#8b8d91' }}>
          {marking.mode === 'pin'
            ? 'For a side the photo can’t show — tap the hold coming off it, or its nearest edge.'
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

  const saveEdit = async (next) => {
    if (await onSave(next)) setEditing(null);
  };

  const editorFor = (taken, save, extra = {}) => (
    <NameEditor
      value={editing.value}
      onChange={(value) => setEditing((prev) => ({ ...prev, value }))}
      taken={taken}
      saving={saving}
      onSave={() => saveEdit(save(editing.value))}
      onCancel={() => setEditing(null)}
      {...extra}
    />
  );

  const handleAddVolume = async () => {
    if (await onSave(addVolume(volumes, newVolumeName))) setNewVolumeName('');
  };
  const volumeNameTaken = nameTaken(volumes.map((v) => v.name), newVolumeName);
  const canAddVolume = Boolean(newVolumeName.trim()) && !volumeNameTaken && !saving;

  return (
    <div style={{ marginTop: 18 }}>
      <h2 style={sectionHeading}>Volumes</h2>
      <p style={{ fontSize: 13, color: '#8b8d91', margin: '0 0 14px' }}>
        Add a volume, then press Outline or Pin next to one of its sides to mark it on the photo. Outline a side you
        can see by tapping its corners; pin one the photo can’t show with a single tap. Tap a name to rename it.
      </p>

      {volumes.length === 0 && (
        <p style={{ fontSize: 14, color: '#6d6f73', margin: '0 0 14px' }}>No volumes yet. Add one for each volume on the board.</p>
      )}

      {volumes.map((volume) => {
        const isEditing = (kind, faceId) => editing?.kind === kind && editing.volumeId === volume.id && editing.faceId === faceId;
        const otherVolumeNames = volumes.filter((v) => v.id !== volume.id).map((v) => v.name);
        return (
          <div key={volume.id} style={card}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
              {isEditing('volume') ? (
                editorFor(nameTaken(otherVolumeNames, editing.value), (name) => renameVolume(volumes, volume.id, name))
              ) : (
                <button
                  aria-label={`Rename ${volume.name}`}
                  onClick={() => setEditing({ kind: 'volume', volumeId: volume.id, value: volume.name })}
                  style={{ ...nameButton, fontWeight: 700, fontSize: 15 }}
                >{volume.name} <Pencil size={12} color="#8b8d91" /></button>
              )}
              {confirmingDeleteId === volume.id ? (
                <span style={{ display: 'flex', gap: 6 }}>
                  <button onClick={() => onSave(removeVolume(volumes, volume.id))} disabled={saving} style={{ ...smallButton, background: '#D9552B', borderColor: '#D9552B', color: '#17181A' }}>Yes, delete</button>
                  <button onClick={() => setConfirmingDeleteId(null)} style={smallButton}>Cancel</button>
                </span>
              ) : !isEditing('volume') && (
                <button aria-label={`Delete ${volume.name}`} onClick={() => setConfirmingDeleteId(volume.id)} style={{ ...linkButton, color: '#8b8d91' }}>
                  <Trash2 size={14} />
                </button>
              )}
            </div>
            {volume.faces.map((face) => {
              const status = faceStatus(face, photoUrl);
              const label = `${volume.name} ${face.name}`;
              const otherSideNames = volume.faces.filter((f) => f.id !== face.id).map((f) => f.name);
              return (
                <div key={face.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderTop: '1px solid #2A2B2E' }}>
                  {isEditing('side', face.id) ? (
                    editorFor(nameTaken(otherSideNames, editing.value), (name) => renameSide(volumes, volume.id, face.id, name))
                  ) : (
                    <>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <button
                          aria-label={`Rename ${label}`}
                          onClick={() => setEditing({ kind: 'side', volumeId: volume.id, faceId: face.id, value: face.name })}
                          style={{ ...nameButton, fontSize: 14, fontWeight: 600 }}
                        >{face.name}</button>
                        <div style={{ fontSize: 12, color: status === 'old-photo' ? '#D9552B' : '#8b8d91' }}>{STATUS_TEXT[status]}</div>
                      </div>
                      <button aria-label={`Outline ${label}`} onClick={() => onStartMarking({ volumeId: volume.id, faceId: face.id, mode: 'outline' })} style={smallButton}>Outline</button>
                      <button aria-label={`Pin ${label}`} onClick={() => onStartMarking({ volumeId: volume.id, faceId: face.id, mode: 'pin' })} style={smallButton}>Pin</button>
                      <button aria-label={`Remove ${label}`} onClick={() => onSave(removeSide(volumes, volume.id, face.id))} disabled={saving} style={{ ...linkButton, color: '#8b8d91' }}>
                        <X size={15} />
                      </button>
                    </>
                  )}
                </div>
              );
            })}
            <div style={{ marginTop: 8 }}>
              {isEditing('new-side') ? (
                editorFor(
                  nameTaken(volume.faces.map((f) => f.name), editing.value),
                  (name) => addSide(volumes, volume.id, name),
                  { saveLabel: 'Add side', placeholder: 'Side name' },
                )
              ) : (
                <button onClick={() => setEditing({ kind: 'new-side', volumeId: volume.id, value: '' })} style={{ ...linkButton, fontSize: 13 }}>+ Add side</button>
              )}
            </div>
          </div>
        );
      })}

      <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
        <input value={newVolumeName} onChange={(e) => setNewVolumeName(e.target.value)} placeholder="e.g. Vol1" style={{ ...inputStyle, marginTop: 0, flex: 1 }} />
        <button onClick={handleAddVolume} disabled={!canAddVolume} style={{ ...primaryButton(canAddVolume), display: 'flex', alignItems: 'center', gap: 6 }}>
          <Plus size={15} /> Add volume
        </button>
      </div>
    </div>
  );
}
