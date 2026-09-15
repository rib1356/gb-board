import { useState, useEffect, useRef } from 'react';
import { Camera, Plus, ChevronLeft, Check, Trash2, CircleDot, Loader2, Star, Pencil, CheckCircle2 } from 'lucide-react';
import { getOrCreateBoard, listProblems, uploadBoardPhoto, uploadProblemMask, createProblem, deleteProblem, rateProblem, updateProblem, restoreProblem, listTicks, createTick, deleteTick } from './lib/board';
import { resizeFileToBlob } from './lib/image';
import { pointFromClientCoords, validateDraft, holdAtPoint } from './lib/holds';
import { GRADES } from './lib/grades';

// Dynamically imported so the segmentation library (and its model weights)
// only load once someone actually opens "New problem" -- most visits are
// just browsing existing problems, and this is the biggest chunk in the
// bundle by far.
const loadSegmentModule = () => import('./lib/segment');

const HOLD_COLORS = {
  start: '#5C8A66',
  hold: '#22C7C0',
  foot: '#9B5DE5',
  finish: '#D9552B',
};

// Tap-to-remove hit radius (as a fraction of the photo's displayed size) for
// a hold that's still showing as a circle marker rather than a real mask.
const HOLD_HIT_RADIUS_PX = 22;

function ChalkRing({ x, y, color, label, size = 34 }) {
  return (
    <div
      data-testid="hold-marker"
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

function HoldHighlight({ src }) {
  return (
    <img
      data-testid="hold-highlight"
      src={src}
      alt=""
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
    />
  );
}

const fontImport = `
  @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@500;700&display=swap');
`;

const inputStyle = {
  width: '100%', boxSizing: 'border-box', background: '#232427', border: '1px solid #3a3b3e',
  borderRadius: 8, padding: '10px 12px', color: '#EDEAE3', fontSize: 14.5, fontFamily: "'Inter'", marginTop: 4,
};

function StarRating({ rating, onRate, readOnly = false }) {
  if (readOnly) {
    if (rating == null) return null;
    return (
      <div aria-label={`Rating: ${rating} out of 5`} style={{ display: 'flex', gap: 2 }}>
        {[1, 2, 3, 4, 5].map((n) => (
          <Star key={n} size={14} fill={n <= rating ? '#D9552B' : 'none'} color={n <= rating ? '#D9552B' : '#3a3b3e'} />
        ))}
      </div>
    );
  }
  return (
    <div style={{ display: 'flex', gap: 2 }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          aria-label={`Rate ${n} star${n > 1 ? 's' : ''}`}
          onClick={() => onRate(n === rating ? null : n)}
          style={{ background: 'none', border: 'none', padding: 2, cursor: 'pointer' }}
        >
          <Star size={22} fill={rating != null && n <= rating ? '#D9552B' : 'none'} color={rating != null && n <= rating ? '#D9552B' : '#8b8d91'} />
        </button>
      ))}
    </div>
  );
}

function formatSendDate(dateStr) {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}

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
  const [placeType, setPlaceType] = useState('start');
  const [name, setName] = useState('');
  const [grade, setGrade] = useState('');
  const [setter, setSetter] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [deletedProblem, setDeletedProblem] = useState(null);
  const [gradeFilter, setGradeFilter] = useState('');

  const [ticks, setTicks] = useState([]);
  const [showLogForm, setShowLogForm] = useState(false);
  const [tickDate, setTickDate] = useState('');
  const [tickNotes, setTickNotes] = useState('');
  const [loggingTick, setLoggingTick] = useState(false);

  const imgWrapRef = useRef(null);
  const [segmentModule, setSegmentModule] = useState(null);
  const [segmentUnavailable, setSegmentUnavailable] = useState(false);
  const segmenterRef = useRef(null);
  const embeddingRef = useRef(null);

  // Editing must target the problem's own saved photo, not the board's
  // current one -- the board photo may have been replaced since this
  // problem was set, and the holds' x/y fractions only line up with the
  // photo they were originally placed on.
  const editingProblem = editingId ? problems.find((p) => p.id === editingId) : null;
  const activePhotoUrl = editingProblem?.photo_url || board?.photo_url;

  useEffect(() => {
    if (view !== 'new' || !activePhotoUrl) return;
    let cancelled = false;
    let mod;
    segmenterRef.current = null;
    embeddingRef.current = null;
    loadSegmentModule()
      .then((loaded) => {
        if (cancelled) return undefined;
        mod = loaded;
        return mod.loadSegmenter();
      })
      .then((seg) => {
        if (cancelled || !seg) return undefined;
        segmenterRef.current = seg;
        return mod.computeEmbedding(seg, activePhotoUrl);
      })
      .then((emb) => {
        if (cancelled || !emb) return;
        embeddingRef.current = emb;
        setSegmentModule(mod);
        // Editing seeds draftHolds from the saved problem, without masks --
        // decode each one now so they become tap-removable/highlighted just
        // like a freshly-placed hold. Matched by object identity (not index)
        // so an in-flight decode can't land on the wrong hold if the user
        // removes another one before it resolves.
        const seg = segmenterRef.current;
        setDraftHolds((prev) => {
          prev.forEach((h) => {
            if (h._mask) return;
            mod.maskAtPoint(seg, emb, h.x, h.y)
              .then((mask) => {
                if (cancelled) return;
                setDraftHolds((cur) => cur.map((hh) => (hh === h ? { ...hh, _mask: mask } : hh)));
              })
              .catch((err) => console.error('Highlight decode failed for this hold:', err));
          });
          return prev;
        });
      })
      .catch((err) => {
        // No highlight support this session -- taps fall back to circle markers.
        // (loadSegmenter's result is cached, so this stays true for the rest
        // of the page session rather than needing to be reset on retry.)
        if (cancelled) return;
        setSegmentUnavailable(true);
        console.error('Highlight setup failed:', err);
      });
    return () => {
      cancelled = true;
    };
  }, [view, activePhotoUrl]);

  useEffect(() => {
    (async () => {
      try {
        const b = await getOrCreateBoard();
        setBoard(b);
        const p = await listProblems(b.id);
        setProblems(p);
      } catch (e) {
        console.error(e);
        setError('Could not load the board — check your connection and try again.');
      }
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    if (!deletedProblem) return;
    const timer = setTimeout(() => setDeletedProblem(null), 6000);
    return () => clearTimeout(timer);
  }, [deletedProblem]);

  useEffect(() => {
    if (view !== 'detail' || !selectedId) return;
    (async () => {
      try {
        const t = await listTicks(selectedId);
        setTicks(t);
      } catch (err) {
        console.error(err);
        setError('Could not load the send log — check your connection and try again.');
      }
    })();
  }, [view, selectedId]);

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
      console.error(err);
      setError('Could not upload that photo — try a different one.');
    }
    setUploading(false);
  };

  const handleImageClick = (e) => {
    if (view !== 'new') return;
    // Wait for highlight mode to finish loading (or fail) before placing a
    // hold -- otherwise an early tap gets stuck as a plain circle forever,
    // since a hold's mask is only ever attempted at tap time.
    if (!segmentModule && !segmentUnavailable) return;
    const rect = imgWrapRef.current.getBoundingClientRect();
    const point = pointFromClientCoords(rect, e.clientX, e.clientY);

    const radiusXFrac = HOLD_HIT_RADIUS_PX / rect.width;
    const radiusYFrac = HOLD_HIT_RADIUS_PX / rect.height;
    const hitIndex = holdAtPoint(draftHolds, point.x, point.y, radiusXFrac, radiusYFrac);
    if (hitIndex !== -1) {
      setDraftHolds((prev) => prev.filter((_, i) => i !== hitIndex));
      return;
    }

    const newHold = { ...point, type: placeType };
    setDraftHolds((prev) => [...prev, newHold]);

    const segmenter = segmenterRef.current;
    const embedding = embeddingRef.current;
    if (segmenter && embedding && segmentModule) {
      segmentModule.maskAtPoint(segmenter, embedding, point.x, point.y)
        .then((mask) => {
          setDraftHolds((prev) => prev.map((h) => (h === newHold ? { ...h, _mask: mask } : h)));
        })
        .catch((err) => {
          // This hold just keeps its circle marker.
          console.error('Highlight decode failed for this hold:', err);
        });
    }
  };

  const startNewProblem = () => {
    setDraftHolds([]); setName(''); setGrade(''); setSetter(''); setNotes(''); setPlaceType('start');
    setEditingId(null);
    setError('');
    setView('new');
  };

  const startEditProblem = (problem) => {
    setEditingId(problem.id);
    setDraftHolds(problem.holds);
    setName(problem.name); setGrade(problem.grade || ''); setSetter(problem.setter || ''); setNotes(problem.notes || '');
    setError('');
    setView('new');
  };

  const saveProblem = async () => {
    const validationError = validateDraft({ name, holds: draftHolds });
    if (validationError) { setError(validationError); return; }
    setSaving(true);
    setError('');
    try {
      const cleanHolds = draftHolds.map(({ x, y, type }) => ({ x, y, type }));
      const allMasked = draftHolds.length > 0 && draftHolds.every((h) => h._mask);

      if (editingId) {
        let updated = await updateProblem(editingId, { name, grade, setter, notes, holds: cleanHolds });
        if (allMasked) {
          try {
            const blob = await segmentModule.compositeMaskBlob(
              draftHolds.map((h) => ({ mask: h._mask, color: HOLD_COLORS[h.type] })),
              embeddingRef.current.width,
              embeddingRef.current.height
            );
            updated = await uploadProblemMask(editingId, blob);
          } catch (maskErr) {
            console.error(maskErr);
            // Problem is already saved -- it just falls back to circle markers.
          }
        }
        setProblems((prev) => prev.map((p) => (p.id === editingId ? updated : p)));
      } else {
        let problem = await createProblem(board.id, { name, grade, setter, notes, holds: cleanHolds, photoUrl: board.photo_url });

        if (allMasked) {
          try {
            const blob = await segmentModule.compositeMaskBlob(
              draftHolds.map((h) => ({ mask: h._mask, color: HOLD_COLORS[h.type] })),
              embeddingRef.current.width,
              embeddingRef.current.height
            );
            problem = await uploadProblemMask(problem.id, blob);
          } catch (maskErr) {
            console.error(maskErr);
            // Problem is already saved -- it just falls back to circle markers.
          }
        }

        setProblems((prev) => [problem, ...prev]);
      }
      setView('list');
    } catch (err) {
      console.error(err);
      setError(`Could not ${editingId ? 'update' : 'save'} that problem — check your connection and try again.`);
    }
    setSaving(false);
  };

  const handleRate = async (id, rating) => {
    try {
      const updated = await rateProblem(id, rating);
      setProblems((prev) => prev.map((p) => (p.id === id ? updated : p)));
    } catch (err) {
      console.error(err);
      setError('Could not save that rating — check your connection and try again.');
    }
  };

  const startLogTick = () => {
    setTickDate(new Date().toISOString().slice(0, 10));
    setTickNotes('');
    setShowLogForm(true);
  };

  const handleAddTick = async (problemId) => {
    if (!tickDate) return;
    setLoggingTick(true);
    setError('');
    try {
      const created = await createTick(problemId, { sentOn: tickDate, notes: tickNotes });
      setTicks((prev) => [created, ...prev]);
      setProblems((prev) => prev.map((p) => (p.id === problemId ? {
        ...p,
        send_count: (p.send_count || 0) + 1,
        last_sent_on: p.last_sent_on && p.last_sent_on > created.sent_on ? p.last_sent_on : created.sent_on,
      } : p)));
      setShowLogForm(false);
    } catch (err) {
      console.error(err);
      setError('Could not log that send — check your connection and try again.');
    }
    setLoggingTick(false);
  };

  const handleDeleteTick = async (problemId, tickId) => {
    try {
      await deleteTick(tickId);
      const remaining = ticks.filter((t) => t.id !== tickId);
      setTicks(remaining);
      setProblems((prev) => prev.map((p) => (p.id === problemId ? {
        ...p,
        send_count: remaining.length,
        last_sent_on: remaining.length ? remaining.reduce((max, t) => (t.sent_on > max ? t.sent_on : max), remaining[0].sent_on) : null,
      } : p)));
    } catch (err) {
      console.error(err);
      setError('Could not delete that log entry — check your connection and try again.');
    }
  };

  const handleDelete = async (id) => {
    try {
      const problem = problems.find((p) => p.id === id);
      await deleteProblem(id);
      setProblems((prev) => prev.filter((p) => p.id !== id));
      setConfirmingDelete(false);
      setView('list');
      setDeletedProblem(problem || null);
    } catch (err) {
      console.error(err);
      setError('Could not delete that problem — check your connection and try again.');
    }
  };

  const handleUndoDelete = async () => {
    if (!deletedProblem) return;
    try {
      const restored = await restoreProblem(deletedProblem.id);
      setProblems((prev) => [restored, ...prev]);
      setDeletedProblem(null);
    } catch (err) {
      console.error(err);
      setError('Could not undo that delete — check your connection and try again.');
    }
  };

  const selected = problems.find((p) => p.id === selectedId);
  const visibleProblems = gradeFilter ? problems.filter((p) => p.grade === gradeFilter) : problems;
  const displayHolds = view === 'new' ? draftHolds : (selected ? selected.holds : []);
  const lockedProblem = view === 'detail' ? selected : null;
  const displayPhotoUrl = lockedProblem?.photo_url || activePhotoUrl;
  const lockedMaskUrl = lockedProblem?.mask_url;

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
            <button onClick={() => { setSelectedId(null); setView('list'); }} style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', color: '#C08552', fontFamily: "'Inter'", fontWeight: 600, fontSize: 15, cursor: 'pointer', padding: 0 }}>
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
      </div>

      <div style={{ padding: 20, maxWidth: 640, margin: '0 auto' }}>
        <div
          ref={imgWrapRef}
          onClick={handleImageClick}
          style={{
            position: 'relative', width: '100%', borderRadius: 14, overflow: 'hidden',
            background: '#232427', border: '1px solid #2A2B2E',
            cursor: view === 'new' ? 'crosshair' : 'default', minHeight: displayPhotoUrl ? undefined : 220,
          }}
        >
          {displayPhotoUrl ? (
            <img src={displayPhotoUrl} alt="Climbing board" style={{ width: '100%', display: 'block' }} draggable={false} />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 220, gap: 10, color: '#6d6f73' }}>
              <Camera size={30} />
              <span style={{ fontSize: 13.5 }}>No board photo yet</span>
            </div>
          )}
          {lockedMaskUrl ? (
            <HoldHighlight src={lockedMaskUrl} />
          ) : (
            displayHolds.map((h, i) => (
              h._mask ? (
                <HoldHighlight key={i} src={segmentModule.maskToDataUrl(h._mask, HOLD_COLORS[h.type])} />
              ) : (
                <ChalkRing key={i} x={h.x} y={h.y} color={HOLD_COLORS[h.type]} label={h.type === 'hold' ? String(i + 1) : ''} />
              )
            ))
          )}
          {view === 'new' && !segmentModule && !segmentUnavailable && (
            <div style={{
              position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
              display: 'flex', alignItems: 'center', gap: 8, background: '#17181Ae6', color: '#EDEAE3',
              padding: '10px 16px', borderRadius: 10, border: '1px solid #3a3b3e', fontSize: 13.5,
              fontWeight: 600, pointerEvents: 'none', textAlign: 'center',
            }}>
              <Loader2 size={15} className="animate-spin" /> Preparing highlight mode…
            </div>
          )}
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

        {view === 'list' && deletedProblem && (
          <div style={{
            marginTop: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            background: '#232427', border: '1px solid #3a3b3e', borderRadius: 10, padding: '10px 14px',
          }}>
            <span style={{ fontSize: 13.5, color: '#c7c8cb' }}>Problem deleted</span>
            <button onClick={handleUndoDelete} style={{
              background: 'none', border: 'none', color: '#C08552', fontWeight: 700, fontSize: 13.5, cursor: 'pointer',
            }}>Undo</button>
          </div>
        )}

        {error && <p style={{ color: '#D9552B', fontSize: 13, marginTop: 10 }}>{error}</p>}

        {view === 'new' && (
          <div style={{ marginTop: 16 }}>
            <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
              {['start', 'hold', 'foot', 'finish'].map((t) => (
                <button key={t} onClick={() => setPlaceType(t)} style={{
                  flex: 1, padding: '9px 0', borderRadius: 8, fontSize: 12.5, fontWeight: 700, textTransform: 'uppercase',
                  letterSpacing: 0.5, border: `1.5px solid ${HOLD_COLORS[t]}`,
                  background: placeType === t ? HOLD_COLORS[t] : 'transparent',
                  color: placeType === t ? '#17181A' : HOLD_COLORS[t], cursor: 'pointer',
                }}>{t}</button>
              ))}
            </div>
            <p style={{ fontSize: 12.5, color: '#8b8d91', marginTop: -6, marginBottom: 16 }}>
              Pick a hold type, then tap the board photo above to place one — tap an existing hold to remove it.
            </p>
            {segmentUnavailable && (
              <p style={{ fontSize: 12.5, color: '#8b8d91', marginTop: -10, marginBottom: 16 }}>
                Highlight mode unavailable on this device — holds will show as markers instead.
              </p>
            )}

            <Field label="Problem name"><input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Gaston Traverse" style={inputStyle} /></Field>
            <div style={{ display: 'flex', gap: 10 }}>
              <div style={{ flex: 1 }}><Field label="Grade">
                <select aria-label="Grade" value={grade} onChange={(e) => setGrade(e.target.value)} style={inputStyle}>
                  <option value="">No grade</option>
                  {GRADES.map((g) => <option key={g} value={g}>{g}</option>)}
                </select>
              </Field></div>
              <div style={{ flex: 1 }}><Field label="Set by"><input value={setter} onChange={(e) => setSetter(e.target.value)} placeholder="Your name" style={inputStyle} /></Field></div>
            </div>
            <Field label="Notes"><textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Beta, sequence, anything worth knowing" rows={3} style={{ ...inputStyle, resize: 'vertical' }} /></Field>

            <button onClick={saveProblem} disabled={saving} style={{
              width: '100%', marginTop: 14, background: '#5C8A66', color: '#17181A', border: 'none',
              borderRadius: 10, padding: '13px 0', fontWeight: 700, fontSize: 15, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}>
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />} {editingId ? 'Save changes' : 'Save problem'}
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
            ) : (
              <select aria-label="Filter by grade" value={gradeFilter} onChange={(e) => setGradeFilter(e.target.value)} style={{ ...inputStyle, marginTop: 0, marginBottom: 12, width: 'auto' }}>
                <option value="">All grades</option>
                {GRADES.map((g) => <option key={g} value={g}>{g}</option>)}
              </select>
            )}
            {problems.length > 0 && visibleProblems.length === 0 && (
              <div style={{ textAlign: 'center', padding: '30px 10px', color: '#6d6f73' }}>
                <p style={{ fontSize: 14, margin: 0 }}>No problems at that grade.</p>
              </div>
            )}
            {visibleProblems.map((p) => (
              <button key={p.id} onClick={() => { setSelectedId(p.id); setConfirmingDelete(false); setShowLogForm(false); setTicks([]); setView('detail'); }} style={{
                width: '100%', textAlign: 'left', background: '#232427', border: '1px solid #2A2B2E',
                borderRadius: 12, padding: '14px 16px', marginBottom: 10, cursor: 'pointer', color: '#EDEAE3',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 15.5 }}>{p.name}</div>
                  <div style={{ fontSize: 12, color: '#8b8d91', marginTop: 2 }}>{p.setter ? `Set by ${p.setter}` : 'Unknown setter'}</div>
                  <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <StarRating rating={p.rating} readOnly />
                    {p.send_count > 0 && (
                      <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 11, fontWeight: 700, color: '#5C8A66', textTransform: 'uppercase' }}>
                        <CheckCircle2 size={12} /> Sent ×{p.send_count}
                      </span>
                    )}
                  </div>
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
            <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 14 }}>
              <StarRating rating={selected.rating} onRate={(r) => handleRate(selected.id, r)} />
              <span style={{
                display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700,
                color: selected.send_count > 0 ? '#5C8A66' : '#8b8d91',
              }}>
                {selected.send_count > 0 ? <CheckCircle2 size={16} /> : null}
                {selected.send_count > 0 ? `Sent ×${selected.send_count}` : 'Not sent yet'}
              </span>
            </div>
            {selected.notes && <p style={{ marginTop: 12, fontSize: 14, color: '#c7c8cb', lineHeight: 1.5 }}>{selected.notes}</p>}

            <div style={{ marginTop: 16 }}>
              {!showLogForm ? (
                <button onClick={startLogTick} style={{
                  display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: '1px solid #3a3b3e',
                  color: '#8b8d91', borderRadius: 8, padding: '8px 12px', fontSize: 13, cursor: 'pointer',
                }}><Plus size={14} /> Log a send</button>
              ) : (
                <div style={{ background: '#232427', border: '1px solid #2A2B2E', borderRadius: 10, padding: 12 }}>
                  <Field label="Date">
                    <input aria-label="Send date" type="date" value={tickDate} onChange={(e) => setTickDate(e.target.value)} style={{ ...inputStyle, minWidth: 0 }} />
                  </Field>
                  <Field label="Notes">
                    <textarea aria-label="Send notes" value={tickNotes} onChange={(e) => setTickNotes(e.target.value)} placeholder="Anything worth remembering" rows={2} style={{ ...inputStyle, resize: 'vertical' }} />
                  </Field>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => handleAddTick(selected.id)} disabled={loggingTick || !tickDate} style={{
                      display: 'flex', alignItems: 'center', gap: 6, background: '#5C8A66', border: 'none',
                      color: '#17181A', borderRadius: 8, padding: '8px 12px', fontSize: 13, fontWeight: 700, cursor: 'pointer',
                    }}>
                      {loggingTick ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Save entry
                    </button>
                    <button onClick={() => setShowLogForm(false)} style={{
                      background: 'none', border: '1px solid #3a3b3e', color: '#8b8d91',
                      borderRadius: 8, padding: '8px 12px', fontSize: 13, cursor: 'pointer',
                    }}>Cancel</button>
                  </div>
                </div>
              )}

              {ticks.length > 0 && (() => {
                const firstSendId = ticks.reduce((earliest, t) => (
                  !earliest || t.sent_on < earliest.sent_on ? t : earliest
                ), null)?.id;
                return (
                  <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {ticks.map((t) => (
                      <div key={t.id} style={{
                        display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8,
                        background: '#1d1e20', border: '1px solid #2A2B2E', borderRadius: 8, padding: '8px 10px',
                      }}>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: 13, fontWeight: 600 }}>{formatSendDate(t.sent_on)}</span>
                            <span style={{
                              fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4,
                              color: t.id === firstSendId ? '#5C8A66' : '#8b8d91',
                            }}>{t.id === firstSendId ? 'First send' : 'Repeat'}</span>
                          </div>
                          {t.notes && <p style={{ margin: '4px 0 0', fontSize: 12.5, color: '#c7c8cb' }}>{t.notes}</p>}
                        </div>
                        <button aria-label="Delete entry" onClick={() => handleDeleteTick(selected.id, t.id)} style={{
                          background: 'none', border: 'none', color: '#8b8d91', cursor: 'pointer', padding: 2,
                        }}><Trash2 size={13} /></button>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>
            <div style={{ marginTop: 18, display: 'flex', gap: 8 }}>
              {confirmingDelete ? (
                <>
                  <button onClick={() => handleDelete(selected.id)} style={{
                    display: 'flex', alignItems: 'center', gap: 6, background: '#D9552B', border: 'none',
                    color: '#17181A', borderRadius: 8, padding: '8px 12px', fontSize: 13, fontWeight: 700, cursor: 'pointer',
                  }}><Trash2 size={14} /> Yes, delete</button>
                  <button onClick={() => setConfirmingDelete(false)} style={{
                    background: 'none', border: '1px solid #3a3b3e', color: '#8b8d91',
                    borderRadius: 8, padding: '8px 12px', fontSize: 13, cursor: 'pointer',
                  }}>Cancel</button>
                </>
              ) : (
                <>
                  <button onClick={() => startEditProblem(selected)} style={{
                    display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: '1px solid #3a3b3e',
                    color: '#8b8d91', borderRadius: 8, padding: '8px 12px', fontSize: 13, cursor: 'pointer',
                  }}><Pencil size={14} /> Edit problem</button>
                  <button onClick={() => setConfirmingDelete(true)} style={{
                    display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: '1px solid #3a3b3e',
                    color: '#8b8d91', borderRadius: 8, padding: '8px 12px', fontSize: 13, cursor: 'pointer',
                  }}><Trash2 size={14} /> Delete problem</button>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
