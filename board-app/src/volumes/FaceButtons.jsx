// One row per volume with faces on the photo being edited. A placed face's
// button fills in its hold type's colour; tapping it again opens its menu.
export default function FaceButtons({ rows, holds, colors, onTap }) {
  if (rows.length === 0) return null;
  return (
    <div style={{ marginBottom: 14 }}>
      {rows.map(({ volume, faces }) => (
        <div key={volume.id} style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
          <span style={{ width: 52, fontSize: 12.5, fontWeight: 700, color: '#8b8d91' }}>{volume.name}</span>
          {faces.map((face) => {
            const placed = holds.find((h) => h.face?.faceId === face.id);
            const color = placed ? colors[placed.type] : null;
            return (
              <button
                key={face.id}
                aria-label={`${volume.name} ${face.name}`}
                aria-pressed={Boolean(placed)}
                onClick={() => onTap(volume, face, placed)}
                style={{
                  padding: '6px 11px', borderRadius: 8, fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
                  border: `1.5px solid ${color || '#3a3b3e'}`, background: color || 'transparent',
                  color: color ? '#17181A' : '#c7c8cb',
                }}
              >{face.name}</button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
