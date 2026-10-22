import { Camera, Loader2, Triangle } from 'lucide-react';
import { sectionHeading } from '../ui';

const setupButton = {
  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
  border: '1px dashed #3a3b3e', borderRadius: 10, padding: '10px 14px', fontSize: 13.5,
  color: '#a9abaf', cursor: 'pointer', background: 'none',
};

export default function TweaksHub({ hasPhoto, uploading, onPhotoUpload, onVolumes, onSignOut }) {
  return (
    <div>
      <h1 style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 28, letterSpacing: 1.5, margin: '0 0 16px', color: '#EDEAE3' }}>TWEAKS</h1>

      <h2 style={sectionHeading}>Board setup</h2>
      <div style={{ display: 'flex', gap: 8 }}>
        <label style={{ ...setupButton, flex: 1 }}>
          {uploading ? <Loader2 size={15} className="animate-spin" /> : <Camera size={15} />}
          New photo
          <input type="file" accept="image/*" onChange={onPhotoUpload} style={{ display: 'none' }} />
        </label>
        {hasPhoto && (
          <button onClick={onVolumes} style={setupButton}>
            <Triangle size={15} /> Volumes
          </button>
        )}
      </div>

      <button
        onClick={onSignOut}
        style={{ marginTop: 32, background: 'none', border: 'none', color: '#8b8d91', fontSize: 13.5, cursor: 'pointer', padding: 0 }}
      >
        Sign out
      </button>
    </div>
  );
}
