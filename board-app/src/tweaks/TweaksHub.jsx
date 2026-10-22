import { Camera, Loader2, Triangle } from 'lucide-react';
import { checkinsFor } from '../lib/checkins';
import { hubLists, injuryStart, injuryTitle, lastCheckinLine, monthYear, shortDate } from '../lib/injuries';
import { linkButton, primaryButton, sectionHeading } from '../ui';

const setupButton = {
  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
  border: '1px dashed #3a3b3e', borderRadius: 10, padding: '10px 14px', fontSize: 13.5,
  color: '#a9abaf', cursor: 'pointer', background: 'none',
};
const card = { background: '#232427', border: '1px solid #2A2B2E', borderRadius: 12, padding: '11px 12px', marginBottom: 8 };
const cardOpener = {
  display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none', padding: '0 0 10px',
  color: '#EDEAE3', fontFamily: 'inherit', cursor: 'pointer',
};
const logRow = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, width: '100%', textAlign: 'left',
  background: 'none', border: 'none', borderBottom: '1px solid #232427', padding: '9px 0',
  color: '#EDEAE3', fontSize: 13.5, fontFamily: 'inherit', cursor: 'pointer',
};

// "RH ring finger · Pulley strain", or just the title when there's no what.
const titleAndWhat = (injury) => [injuryTitle(injury), injury.what].filter(Boolean).join(' · ');

export default function TweaksHub({
  injuries, checkins, today, loading, loadError, onOpenInjury, onCheckIn, onNewInjury,
  hasPhoto, uploading, onPhotoUpload, onVolumes, onSignOut,
}) {
  const { open, closed } = hubLists(injuries, checkins);
  // Not while the first load is still on its way, when there's nothing to go on yet.
  const showEmpty = open.length === 0 && !loadError && !(loading && injuries.length === 0);

  return (
    <div>
      <h1 style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 28, letterSpacing: 1.5, margin: '0 0 16px', color: '#EDEAE3' }}>TWEAKS</h1>

      {loadError && <p role="alert" style={{ color: '#D9552B', fontSize: 13, margin: '0 0 12px' }}>{loadError}</p>}

      {open.map((injury) => (
        <div key={injury.id} style={card}>
          <button onClick={() => onOpenInjury(injury.id)} style={cardOpener}>
            <span style={{ display: 'block', fontWeight: 600, fontSize: 14.5 }}>{injuryTitle(injury)}</span>
            <span style={{ display: 'block', color: '#8b8d91', fontSize: 12.5, margin: '2px 0 8px' }}>
              {[injury.what, `open since ${shortDate(injuryStart(injury, checkins), today)}`].filter(Boolean).join(' · ')}
            </span>
            <span style={{ display: 'block', fontSize: 12.5 }}>{lastCheckinLine(checkinsFor(checkins, injury.id), today)}</span>
          </button>
          <button onClick={() => onCheckIn(injury.id)} style={{ ...primaryButton(true), width: '100%' }}>Check in</button>
        </div>
      ))}
      {showEmpty && (
        <p style={{ fontSize: 13.5, color: '#8b8d91', margin: 0 }}>Nothing tweaky. Long may it last.</p>
      )}

      <h2 style={{ ...sectionHeading, marginTop: 20 }}>Injury log</h2>
      {closed.map((injury) => (
        <button key={injury.id} onClick={() => onOpenInjury(injury.id)} style={logRow}>
          <span>{titleAndWhat(injury)}</span>
          <span style={{ color: '#8b8d91', flexShrink: 0 }}>{monthYear(injuryStart(injury, checkins))}</span>
        </button>
      ))}
      <button onClick={onNewInjury} style={{ ...linkButton, fontSize: 13.5, margin: '10px 0 0' }}>+ New injury</button>

      <h2 style={{ ...sectionHeading, marginTop: 24 }}>Board setup</h2>
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
