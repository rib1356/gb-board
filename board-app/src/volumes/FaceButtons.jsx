// A face in a problem matches its button by id -- or by name, when the face
// was deleted and marked again (a new id for the same face on the wall), so it
// can never be added to a problem twice.
function matchesButton(hold, volume, face) {
  return Boolean(hold.face) && (hold.face.faceId === face.id || hold.face.label === `${volume.name} ${face.name}`);
}

function chipStyle(color) {
  return {
    padding: '6px 11px', borderRadius: 8, fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
    border: `1.5px solid ${color || '#3a3b3e'}`, background: color || 'transparent',
    color: color ? '#17181A' : '#c7c8cb',
  };
}

const rowStyle = { display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 6 };
const rowLabel = { width: 52, fontSize: 12.5, fontWeight: 700, color: '#8b8d91' };

// One row per volume with faces on the photo being edited. A placed face's
// button fills in its hold type's colour; tapping it again opens its menu.
export default function FaceButtons({ rows, holds, colors, onTap }) {
  // Faces in this problem that no longer have a button (cleared, their volume
  // deleted, or marked again on a newer photo) -- photo taps skip faces, so
  // without these they could never be tagged or removed.
  const orphans = holds.filter((h) => h.face && !rows.some(({ volume, faces }) => faces.some((f) => matchesButton(h, volume, f))));
  if (rows.length === 0 && orphans.length === 0) return null;
  return (
    <div style={{ marginBottom: 14 }}>
      {rows.map(({ volume, faces }) => (
        <div key={volume.id} style={rowStyle}>
          <span style={rowLabel}>{volume.name}</span>
          {faces.map((face) => {
            const placed = holds.find((h) => matchesButton(h, volume, face));
            return (
              <button
                key={face.id}
                aria-label={`${volume.name} ${face.name}`}
                aria-pressed={Boolean(placed)}
                onClick={() => onTap(volume, face, placed)}
                style={chipStyle(placed ? colors[placed.type] : null)}
              >{face.name}</button>
            );
          })}
        </div>
      ))}
      {orphans.length > 0 && (
        <div style={rowStyle}>
          <span style={{ fontSize: 12.5, color: '#8b8d91' }}>No longer marked:</span>
          {orphans.map((hold) => (
            <button
              key={hold._key}
              aria-label={hold.face.label}
              aria-pressed
              onClick={() => onTap(null, null, hold)}
              style={chipStyle(colors[hold.type])}
            >{hold.face.label}</button>
          ))}
        </div>
      )}
    </div>
  );
}
