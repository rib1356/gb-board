import { useState, useEffect, useRef } from 'react';
import { Camera, Plus, ChevronLeft, Undo2, Check, Trash2, CircleDot, Loader2 } from 'lucide-react';
import { getOrCreateBoard, listProblems, uploadBoardPhoto, createProblem, deleteProblem } from './lib/board';
import { resizeFileToBlob } from './lib/image';
import { pointFromClientCoords, validateDraft } from './lib/holds';

const HOLD_COLORS = {
  start: '#5C8A66',
  hold: '#EDEAE3',
  finish: '#D9552B',
};

function ChalkRing({ x, y, color, label, size = 34 }) {
  return (
    <div
      style={{
        position: 'absolute',
        left: `${x * 100}%`,
        top: `${y * 100}%`,
        transform: 'translate(-50%, -50%)',
        width: size,
        height: size,
        pointerEvents: 'none',
      }}
    >
      <svg width={size} height={size} viewBox="0 0 40 40">
        <circle
          cx="20" cy="20" r="15"
          fill="none"
          stroke={color}
          strokeWidth="2.5"
          strokeDasharray="4 3"
          strokeLinecap="round"
          transform="rotate(-12 20 20)"
        />
      </svg>
      {label ? (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: "'JetBrains Mono', monospace", fontSize: 11, fontWeight: 700, color,
        }}>{label}</div>
      ) : null}
    </div>
  );
}

const fontImport = `
  @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@500;700&display=swap');
`;

const inputStyle = {
  width: '100%', boxSizing: 'border-box', background: '#232427', border: '1px solid #3a3b3e',
  borderRadius: 8, padding: '10px 12px', color: '#EDEAE3', fontSize: 14.5, fontFamily: "'Inter'", marginTop: 4,
};

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={{ fontSize: 12, color: '#8b8d91', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4 }}>{label}</label>
      {children}
    </div>
  );
}

export default function App() {
  const [board, setBoard] = useState(null);
  const [problems, setProblems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('list'); // list | new | detail
  const [selectedId, setSelectedId] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  const [draftHolds, setDraftHolds] = useState([]);
  const [placeType, setPlaceType] = useState('hold');
  const [name, setName] = useState('');
  const [grade, setGrade] = useState('');
  const [setter, setSetter] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const imgWrapRef = useRef(null);

  useEffect(() => {
    (async () => {
      try {
        const b = await getOrCreateBoard();
        setBoard(b);
        const p = await listProblems(b.id);
        setProblems(p);
      } catch (e) {
        setError('Could not load the board — check your connection and try again.');
      }
      setLoading(false);
    })();
  }, []);

  const handlePhotoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !board) return;
    setUploading(true);
    setError('');
    try {
      const blob = await resizeFileToBlob(file);
      const updated = await uploadBoardPhoto(board.id, blob);
      setBoard(updated);
    } catch (err) {
      setError('Could not upload that photo — try a different one.');
    }
    setUploading(false);
  };

  const handleImageClick = (e) => {
    if (view !== 'new') return;
    const rect = imgWrapRef.current.getBoundingClientRect();
    const point = pointFromClientCoords(rect, e.clientX, e.clientY);
    setDraftHolds((prev) => [...prev, { ...point, type: placeType }]);
  };

  const startNewProblem = () => {
    setDraftHolds([]); setName(''); setGrade(''); setSetter(''); setNotes(''); setPlaceType('hold');
    setError('');
    setView('new');
  };

  const saveProblem = async () => {
    const validationError = validateDraft({ name, holds: draftHolds });
    if (validationError) { setError(validationError); return; }
    setSaving(true);
    setError('');
    try {
      const problem = await createProblem(board.id, { name, grade, setter, notes, holds: draftHolds });
      setProblems((prev) => [problem, ...prev]);
      setView('list');
    } catch (err) {
      setError('Could not save that problem — check your connection and try again.');
    }
    setSaving(false);
  };

  const handleDelete = async (id) => {
    try {
      await deleteProblem(id);
      setProblems((prev) => prev.filter((p) => p.id !== id));
      setView('list');
    } catch (err) {
      setError('Could not delete that problem — check your connection and try again.');
    }
  };

  const selected = problems.find((p) => p.id === selectedId);
  const displayHolds = view === 'new' ? draftHolds : (selected ? selected.holds : []);

  if (loading) {
    return (
      <div style={{ background: '#17181A', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <style>{fontImport}</style>
        <Loader2 className="animate-spin" color="#EDEAE3" size={28} />
      </div>
    );
  }

  return (
    <div style={{ background: '#17181A', minHeight: '100vh', fontFamily: "'Inter', sans-serif", color: '#EDEAE3' }}>
      <style>{fontImport}</style>

      <div style={{ padding: '20px 20px 14px', borderBottom: '1px solid #2A2B2E', position: 'sticky', top: 0, background: '#17181Aee', backdropFilter: 'blur(6px)', zIndex: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          {view === 'list' ? (
            <h1 style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 32, letterSpacing: 1.5, margin: 0, color: '#EDEAE3' }}>THE BOARD</h1>
          ) : (
            <button onClick={() => setView('list')} style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', color: '#C08552', fontFamily: "'Inter'", fontWeight: 600, fontSize: 15, cursor: 'pointer', padding: 0 }}>
              <ChevronLeft size={18} /> Board
            </button>
          )}
          {view === 'list' && (
            <button onClick={startNewProblem} disabled={!board?.photo_url} style={{
              display: 'flex', alignItems: 'center', gap: 6, background: board?.photo_url ? '#D9552B' : '#3a3b3e', color: '#17181A',
              border: 'none', borderRadius: 8, padding: '9px 14px', fontWeight: 700, fontSize: 14, cursor: board?.photo_url ? 'pointer' : 'not-allowed',
            }}>
              <Plus size={16} /> New problem
            </button>
          )}
        </div>
        {view === 'list' && (
          <p style={{ margin: '4px 0 0', fontSize: 12.5, color: '#8b8d91' }}>Shared with anyone who has this link.</p>
        )}
      </div>

      <div style={{ padding: 20, maxWidth: 640, margin: '0 auto' }}>
        <div
          ref={imgWrapRef}
          onClick={handleImageClick}
          style={{
            position: 'relative', width: '100%', borderRadius: 14, overflow: 'hidden',
            background: '#232427', border: '1px solid #2A2B2E',
            cursor: view === 'new' ? 'crosshair' : 'default', minHeight: board?.photo_url ? undefined : 220,
          }}
        >
          {board?.photo_url ? (
            <img src={board.photo_url} alt="Climbing board" style={{ width: '100%', display: 'block' }} draggable={false} />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 220, gap: 10, color: '#6d6f73' }}>
              <Camera size={30} />
              <span style={{ fontSize: 13.5 }}>No board photo yet</span>
            </div>
          )}
          {displayHolds.map((h, i) => (
            <ChalkRing key={i} x={h.x} y={h.y} color={HOLD_COLORS[h.type]} label={h.type === 'hold' ? String(i + 1) : ''} />
          ))}
        </div>

        {view === 'list' && (
          <div style={{ marginTop: 12 }}>
            <label style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              border: '1px dashed #3a3b3e', borderRadius: 10, padding: '10px 14px', fontSize: 13.5,
              color: '#a9abaf', cursor: 'pointer',
            }}>
              {uploading ? <Loader2 size={15} className="animate-spin" /> : <Camera size={15} />}
              {board?.photo_url ? 'Replace board photo' : 'Upload a photo of your board'}
              <input type="file" accept="image/*" capture="environment" onChange={handlePhotoUpload} style={{ display: 'none' }} />
            </label>
          </div>
        )}

        {error && <p style={{ color: '#D9552B', fontSize: 13, marginTop: 10 }}>{error}</p>}

        {view === 'new' && (
          <div style={{ marginTop: 16 }}>
            <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
              {['start', 'hold', 'finish'].map((t) => (
                <button key={t} onClick={() => setPlaceType(t)} style={{
                  flex: 1, padding: '9px 0', borderRadius: 8, fontSize: 12.5, fontWeight: 700, textTransform: 'uppercase',
                  letterSpacing: 0.5, border: `1.5px solid ${HOLD_COLORS[t]}`,
                  background: placeType === t ? HOLD_COLORS[t] : 'transparent',
                  color: placeType === t ? '#17181A' : HOLD_COLORS[t], cursor: 'pointer',
                }}>{t}</button>
              ))}
              <button onClick={() => setDraftHolds((d) => d.slice(0, -1))} disabled={!draftHolds.length} style={{
                width: 42, borderRadius: 8, border: '1.5px solid #3a3b3e', background: 'transparent',
                color: draftHolds.length ? '#EDEAE3' : '#4a4b4e', cursor: draftHolds.length ? 'pointer' : 'default',
              }}><Undo2 size={16} style={{ margin: '0 auto' }} /></button>
            </div>
            <p style={{ fontSize: 12.5, color: '#8b8d91', marginTop: -6, marginBottom: 16 }}>Pick a hold type, then tap the board photo above to place it.</p>

            <Field label="Problem name"><input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Gaston Traverse" style={inputStyle} /></Field>
            <div style={{ display: 'flex', gap: 10 }}>
              <div style={{ flex: 1 }}><Field label="Grade"><input value={grade} onChange={(e) => setGrade(e.target.value)} placeholder="V5 / 6a+" style={inputStyle} /></Field></div>
              <div style={{ flex: 1 }}><Field label="Set by"><input value={setter} onChange={(e) => setSetter(e.target.value)} placeholder="Your name" style={inputStyle} /></Field></div>
            </div>
            <Field label="Notes"><textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Beta, sequence, anything worth knowing" rows={3} style={{ ...inputStyle, resize: 'vertical' }} /></Field>

            <button onClick={saveProblem} disabled={saving} style={{
              width: '100%', marginTop: 14, background: '#5C8A66', color: '#17181A', border: 'none',
              borderRadius: 10, padding: '13px 0', fontWeight: 700, fontSize: 15, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}>
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />} Save problem
            </button>
          </div>
        )}

        {view === 'list' && (
          <div style={{ marginTop: 22 }}>
            {problems.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '30px 10px', color: '#6d6f73' }}>
                <CircleDot size={26} style={{ marginBottom: 8, opacity: 0.5 }} />
                <p style={{ fontSize: 14, margin: 0 }}>No problems set yet. Upload a photo and add your first one.</p>
              </div>
            ) : problems.map((p) => (
              <button key={p.id} onClick={() => { setSelectedId(p.id); setView('detail'); }} style={{
                width: '100%', textAlign: 'left', background: '#232427', border: '1px solid #2A2B2E',
                borderRadius: 12, padding: '14px 16px', marginBottom: 10, cursor: 'pointer', color: '#EDEAE3',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 15.5 }}>{p.name}</div>
                  <div style={{ fontSize: 12, color: '#8b8d91', marginTop: 2 }}>{p.setter ? `Set by ${p.setter}` : 'Unknown setter'}</div>
                </div>
                {p.grade && (
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", background: '#17181A', border: '1px solid #3a3b3e', color: '#D9552B', fontSize: 13, fontWeight: 700, padding: '4px 10px', borderRadius: 6 }}>{p.grade}</span>
                )}
              </button>
            ))}
          </div>
        )}

        {view === 'detail' && selected && (
          <div style={{ marginTop: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <h2 style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 26, letterSpacing: 0.5, margin: 0 }}>{selected.name}</h2>
                <p style={{ margin: '2px 0 0', fontSize: 13, color: '#8b8d91' }}>{selected.setter ? `Set by ${selected.setter}` : ''}</p>
              </div>
              {selected.grade && (
                <span style={{ fontFamily: "'JetBrains Mono', monospace", background: '#232427', border: '1px solid #3a3b3e', color: '#D9552B', fontSize: 14, fontWeight: 700, padding: '5px 12px', borderRadius: 6 }}>{selected.grade}</span>
              )}
            </div>
            {selected.notes && <p style={{ marginTop: 12, fontSize: 14, color: '#c7c8cb', lineHeight: 1.5 }}>{selected.notes}</p>}
            <button onClick={() => handleDelete(selected.id)} style={{
              marginTop: 18, display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: '1px solid #3a3b3e',
              color: '#8b8d91', borderRadius: 8, padding: '8px 12px', fontSize: 13, cursor: 'pointer',
            }}><Trash2 size={14} /> Delete problem</button>
          </div>
        )}
      </div>
    </div>
  );
}
