import { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { Camera, Plus, ChevronLeft, Check, Trash2, CircleDot, Loader2, Star, Pencil, CheckCircle2, Flame, RefreshCw, Triangle, CalendarDays, Trophy, Zap } from 'lucide-react';
import { getOrCreateBoard, listProblems, uploadBoardPhoto, uploadProblemMask, createProblem, deleteProblem, rateProblem, updateProblem, restoreProblem, listTicks, listBoardTicks, createTick, deleteTick, listClimbers, createClimber, listWarmupSessions, saveWarmup, saveVolumes, createWarmupSession, deleteWarmupSession } from './lib/board';
import { getStoredClimberId, setStoredClimberId } from './lib/climberStorage';
import { resizeFileToBlob } from './lib/image';
import { pointFromClientCoords, validateDraft, holdAtPoint, cleanHold } from './lib/holds';
import { photoStatus } from './lib/photoStatus';
import { GRADES } from './lib/grades';
import { SORTS, sortAndFilterProblems, applySend } from './lib/problemList';
import { sentProblemIds, firstSendIds } from './lib/sends';
import { inputStyle, sectionHeading, formatShortDate } from './ui';
import { firstAscents, repeatsLabel } from './lib/boardStats';
import { ChalkRing, FaceShape, PinnedFace, VolumeMarks } from './HoldOverlays';
import { isPinned, faceListLines, setFace, facesOnPhoto, faceHold, upgradeVolumes } from './lib/volumes';
import { usePullToRefresh, PULL_THRESHOLD } from './usePullToRefresh';
import WarmupScreen from './warmup/WarmupScreen';
import WarmupEditor from './warmup/WarmupEditor';
import WarmupRun from './warmup/WarmupRun';
import VolumesScreen from './volumes/VolumesScreen';
import LogbookScreen from './logbook/LogbookScreen';
import BoardStatsScreen from './stats/BoardStatsScreen';
import FaceButtons from './volumes/FaceButtons';
import { todayISO } from './lib/warmup';
import { localDate } from './lib/dates';

// Dynamically imported so the segmentation library (and its model weights)
// only load once someone actually opens "New problem" -- most visits are
// just browsing existing problems, and this is the biggest chunk in the
// bundle by far.
const loadSegmentModule = () => import('./lib/segment');

const HOLD_COLORS = {
  start: '#2E6B3E',
  hold: '#22C7C0',
  foot: '#9B5DE5',
  finish: '#D9552B',
};

// Tap hit radius (as a fraction of the photo's displayed size) for
// a hold that's still showing as a circle marker rather than a real mask.
const HOLD_HIT_RADIUS_PX = 22;

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

const BOARD_OWNER = 'Rob';

// The logbook and board stats buttons beside the climber pill.
const iconButton = {
  display: 'flex', alignItems: 'center', background: 'none', border: '1px solid #3a3b3e',
  color: '#c7c8cb', borderRadius: 20, padding: '5px 8px', cursor: 'pointer',
};

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

// Opens under the whole toolbar rather than under the pill, so the row keeps
// its shape and stays centred while it's open.
function ClimberPanel({ climbers, newName, onNewNameChange, onAdd, onSelect, adding }) {
  return (
    <div style={{ marginBottom: 12, background: '#232427', border: '1px solid #2A2B2E', borderRadius: 10, padding: 10 }}>
      {climbers.map((c) => (
        <button key={c.id} onClick={() => onSelect(c.id)} style={{
          display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none',
          color: '#EDEAE3', padding: '6px 4px', fontSize: 13.5, cursor: 'pointer',
        }}>{c.name}</button>
      ))}
      <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
        <input
          aria-label="New climber name"
          value={newName}
          onChange={(e) => onNewNameChange(e.target.value)}
          placeholder="Add a climber"
          style={{ ...inputStyle, marginTop: 0, flex: 1 }}
        />
        <button onClick={onAdd} disabled={adding || !newName.trim()} style={{
          background: '#5C8A66', border: 'none', color: '#17181A', borderRadius: 8,
          padding: '0 14px', fontWeight: 700, fontSize: 13, cursor: 'pointer',
        }}>Add</button>
      </div>
    </div>
  );
}

export default function App() {
  const [board, setBoard] = useState(null);
  const [problems, setProblems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('list'); // list | new | edit-details | detail
  // Where Back on a problem goes -- the list, or the logbook it was opened from.
  const [backTo, setBackTo] = useState('list');
  // Logbook days stay open, and the tab stays picked, while you look at one
  // of their problems and come back.
  const [openLogbookDays, setOpenLogbookDays] = useState(() => new Set());
  const [logbookTab, setLogbookTab] = useState('sessions');
  const [selectedId, setSelectedId] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  const [draftHolds, setDraftHolds] = useState([]);
  const [placeType, setPlaceType] = useState('start');
  // Draft holds carry a draft-only _key, so an in-flight mask decode lands on
  // the right hold even after others are added or removed.
  const nextKeyRef = useRef(0);
  const [name, setName] = useState('');
  const [grade, setGrade] = useState('');
  const [setter, setSetter] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [deletedProblem, setDeletedProblem] = useState(null);
  const [sort, setSort] = useState('newest');
  const [unsentOnly, setUnsentOnly] = useState(false);
  const [warmupFocusId, setWarmupFocusId] = useState(null);
  const [warmupSessions, setWarmupSessions] = useState([]);
  const [savingWarmup, setSavingWarmup] = useState(false);
  // While marking a volume face in setup, photo taps add its corners (or its pin).
  const [marking, setMarking] = useState(null);
  const [savingVolumes, setSavingVolumes] = useState(false);

  const [ticks, setTicks] = useState([]);
  // Every send on the board, so the list knows who has sent what.
  const [boardTicks, setBoardTicks] = useState([]);
  const [showLogForm, setShowLogForm] = useState(false);
  const [tickDate, setTickDate] = useState('');
  const [tickNotes, setTickNotes] = useState('');
  const [tickIsFlash, setTickIsFlash] = useState(false);
  const [loggingTick, setLoggingTick] = useState(false);

  const [climbers, setClimbers] = useState([]);
  const [currentClimberId, setCurrentClimberId] = useState(null);
  const [showClimberPanel, setShowClimberPanel] = useState(false);
  const [newClimberName, setNewClimberName] = useState('');
  const [addingClimber, setAddingClimber] = useState(false);

  const imgWrapRef = useRef(null);
  // Where the list (or logbook) was scrolled to when a problem was opened, so
  // going back lands you on the same spot instead of wherever the detail view
  // left off.
  const returnScrollRef = useRef(null);
  const [segmentModule, setSegmentModule] = useState(null);
  // Whether THIS session's embedding (not just the session-wide model) is
  // ready -- the model only needs loading once per page session, but each
  // new/edit session needs its own embedding computed against its own photo.
  const [embeddingReady, setEmbeddingReady] = useState(false);
  const [segmentUnavailable, setSegmentUnavailable] = useState(false);
  const segmenterRef = useRef(null);
  const embeddingRef = useRef(null);
  const withKey = (hold) => ({ ...hold, _key: nextKeyRef.current++ });

  // Editing must target the problem's own saved photo, not the board's
  // current one -- the board photo may have been replaced since this
  // problem was set, and the holds' x/y fractions only line up with the
  // photo they were originally placed on.
  const editingProblem = editingId ? problems.find((p) => p.id === editingId) : null;
  const activePhotoUrl = editingProblem?.photo_url || board?.photo_url;
  const volumes = upgradeVolumes(board?.volumes);

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
        setEmbeddingReady(true);
        // Editing seeds draftHolds from the saved problem, without masks --
        // decode each one now so they become tappable/highlighted just like a
        // freshly-placed hold. Matched by _key (not index) so an in-flight
        // decode can't land on the wrong hold if the user removes another one
        // before it resolves. Faces are never segmented.
        const seg = segmenterRef.current;
        setDraftHolds((prev) => {
          prev.forEach((h) => {
            if (h._mask || h.face) return;
            mod.maskAtPoint(seg, emb, h.x, h.y)
              .then((mask) => {
                if (cancelled) return;
                const maskUrl = mod.maskToDataUrl(mask, HOLD_COLORS[h.type]);
                setDraftHolds((cur) => cur.map((hh) => (hh._key === h._key ? { ...hh, _mask: mask, _maskUrl: maskUrl } : hh)));
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
      // Runs before the next session's body (even a same-photo re-edit,
      // since `view` itself changed to get back here) -- so this is what
      // makes the loading banner reappear for a later session instead of
      // staying stuck "ready" from a previous one.
      setEmbeddingReady(false);
    };
  }, [view, activePhotoUrl]);

  useEffect(() => {
    (async () => {
      try {
        const b = await getOrCreateBoard();
        setBoard(b);
        const [p, bt] = await Promise.all([listProblems(b.id), listBoardTicks(b.id)]);
        setProblems(p);
        setBoardTicks(bt);
        const c = await listClimbers();
        setClimbers(c);
        const storedId = getStoredClimberId();
        if (storedId && c.some((climber) => climber.id === storedId)) {
          setCurrentClimberId(storedId);
        }
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

  useLayoutEffect(() => {
    if (view !== 'list' && view !== 'logbook' && view !== 'stats') return;
    // Landing on either one uses up the spot, so one left behind by leaving a
    // problem some other way (saving an edit, say) can't jump the page later.
    const saved = returnScrollRef.current;
    returnScrollRef.current = null;
    if (saved?.view === view) window.scrollTo(0, saved.y);
  }, [view]);

  useEffect(() => {
    if (view !== 'warmup' || !board) return;
    (async () => {
      try {
        setWarmupSessions(await listWarmupSessions(board.id));
      } catch (err) {
        console.error(err);
        setError('Could not load past warm-ups — check your connection and try again.');
      }
    })();
  }, [view, board]);

  // Added to the home screen, the app sits suspended in memory between visits,
  // so the list never sees problems someone else has set unless it re-reads.
  const refreshList = async ({ quiet = false } = {}) => {
    try {
      const b = await getOrCreateBoard();
      const [p, bt, c] = await Promise.all([listProblems(b.id), listBoardTicks(b.id), listClimbers()]);
      setBoard(b);
      setProblems(p);
      setBoardTicks(bt);
      setClimbers(c);
    } catch (err) {
      console.error(err);
      if (!quiet) setError('Could not refresh the board — check your connection and try again.');
    }
  };

  useEffect(() => {
    if (view !== 'list') return undefined;
    const onVisibilityChange = () => {
      // Quiet, since the network is often still waking up with the phone.
      if (document.visibilityState === 'visible') refreshList({ quiet: true });
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, [view]);

  const { pull, refreshing } = usePullToRefresh(view === 'list' && !loading, refreshList);

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

  const handleSelectClimber = (id) => {
    setCurrentClimberId(id);
    setStoredClimberId(id);
    setShowClimberPanel(false);
  };

  const handleAddClimber = async () => {
    if (!newClimberName.trim()) return;
    setAddingClimber(true);
    setError('');
    try {
      const created = await createClimber(newClimberName);
      setClimbers((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
      setCurrentClimberId(created.id);
      setStoredClimberId(created.id);
      setNewClimberName('');
      setShowClimberPanel(false);
    } catch (err) {
      console.error(err);
      setError('Could not add that climber — check your connection and try again.');
    }
    setAddingClimber(false);
  };

  const handleImageClick = (e) => {
    if (view === 'volumes') {
      if (!marking || savingVolumes) return;
      const rect = imgWrapRef.current.getBoundingClientRect();
      const point = pointFromClientCoords(rect, e.clientX, e.clientY);
      if (marking.mode === 'pin') finishMarking([point]);
      else setMarking((m) => ({ ...m, points: [...m.points, point] }));
      return;
    }
    if (view !== 'new') return;
    // Wait for highlight mode to finish loading (or fail) before placing a
    // hold -- otherwise an early tap gets stuck as a plain circle forever,
    // since a hold's mask is only ever attempted at tap time.
    if (!embeddingReady && !segmentUnavailable) return;
    const rect = imgWrapRef.current.getBoundingClientRect();
    const point = pointFromClientCoords(rect, e.clientX, e.clientY);

    const radiusXFrac = HOLD_HIT_RADIUS_PX / rect.width;
    const radiusYFrac = HOLD_HIT_RADIUS_PX / rect.height;
    const hitIndex = holdAtPoint(draftHolds, point.x, point.y, radiusXFrac, radiusYFrac);
    if (hitIndex !== -1) {
      const hitKey = draftHolds[hitIndex]._key;
      setDraftHolds((prev) => prev.filter((h) => h._key !== hitKey));
      return;
    }

    const newHold = withKey({ ...point, type: placeType });
    setDraftHolds((prev) => [...prev, newHold]);

    const segmenter = segmenterRef.current;
    const embedding = embeddingRef.current;
    if (segmenter && embedding && segmentModule) {
      segmentModule.maskAtPoint(segmenter, embedding, point.x, point.y)
        .then((mask) => {
          const maskUrl = segmentModule.maskToDataUrl(mask, HOLD_COLORS[newHold.type]);
          setDraftHolds((prev) => prev.map((h) => (h._key === newHold._key ? { ...h, _mask: mask, _maskUrl: maskUrl } : h)));
        })
        .catch((err) => {
          // This hold just keeps its circle marker.
          console.error('Highlight decode failed for this hold:', err);
        });
    }
  };

  const handleFaceTap = (volume, face, placed) => {
    if (placed) {
      setDraftHolds((prev) => prev.filter((h) => h._key !== placed._key));
      return;
    }
    const hold = withKey(faceHold(volume, face, placeType));
    setDraftHolds((prev) => [...prev, hold]);
  };

  const openProblem = (problemId, from) => {
    returnScrollRef.current = { view: from, y: window.scrollY };
    window.scrollTo(0, 0);
    setSelectedId(problemId); setConfirmingDelete(false); setShowLogForm(false); setTicks([]);
    setBackTo(from);
    setView('detail');
  };

  const toggleLogbookDay = (date) => {
    setOpenLogbookDays((prev) => {
      const next = new Set(prev);
      if (!next.delete(date)) next.add(date);
      return next;
    });
  };

  const startNewProblem = () => {
    setDraftHolds([]); setName(''); setGrade(''); setSetter(currentClimber?.name || ''); setNotes(''); setPlaceType('start');
    setEditingId(null);
    setError('');
    setView('new');
  };

  // Holds and details are edited separately -- 'new' with an editingId is the
  // hold editor (details carried through unchanged), 'edit-details' is just the
  // form, which skips loading highlight mode and keeps the saved highlight.
  const startEditProblem = (problem, part) => {
    setEditingId(problem.id);
    setDraftHolds(problem.holds.map(withKey));
    setName(problem.name); setGrade(problem.grade || ''); setSetter(problem.setter || ''); setNotes(problem.notes || '');
    setError('');
    setView(part === 'holds' ? 'new' : 'edit-details');
  };

  const saveProblem = async () => {
    const validationError = validateDraft({ name, holds: draftHolds });
    if (validationError) { setError(validationError); return; }
    setSaving(true);
    setError('');
    try {
      const cleanHolds = draftHolds.map(cleanHold);
      // Faces are drawn from their own outline and never segmented, so only the
      // other holds decide whether there's a complete highlight image to save.
      const segmented = draftHolds.filter((h) => !h.face);
      const allMasked = segmented.length > 0 && segmented.every((h) => h._mask);

      if (editingId) {
        let updated = await updateProblem(editingId, { name, grade, setter, notes, holds: cleanHolds });
        if (allMasked) {
          try {
            const blob = await segmentModule.compositeMaskBlob(
              segmented.map((h) => ({ mask: h._mask, color: HOLD_COLORS[h.type] })),
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
              segmented.map((h) => ({ mask: h._mask, color: HOLD_COLORS[h.type] })),
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
      // Otherwise the just-saved problem's holds keep overlaying the board
      // photo on the list view, since it's still the "selected"/"editing"
      // problem even though we've navigated away from it.
      setSelectedId(null);
      setEditingId(null);
      setView('list');
    } catch (err) {
      console.error(err);
      setError(`Could not ${editingId ? 'update' : 'save'} that problem — check your connection and try again.`);
    }
    setSaving(false);
  };

  const saveDetails = async () => {
    if (!name.trim()) { setError('Give the problem a name first.'); return; }
    setSaving(true);
    setError('');
    try {
      // No holds passed, so updateProblem leaves the holds and mask_url alone.
      const updated = await updateProblem(editingId, { name, grade, setter, notes });
      setProblems((prev) => prev.map((p) => (p.id === editingId ? updated : p)));
      setSelectedId(null);
      setEditingId(null);
      setView('list');
    } catch (err) {
      console.error(err);
      setError('Could not update that problem — check your connection and try again.');
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
    setTickIsFlash(false);
    setShowLogForm(true);
  };

  const handleAddTick = async (problemId) => {
    if (!tickDate) return;
    setLoggingTick(true);
    setError('');
    try {
      const created = await createTick(problemId, { sentOn: tickDate, notes: tickNotes, sentBy: currentClimber?.name, flash: tickIsFlash });
      setTicks((prev) => [created, ...prev]);
      setBoardTicks((prev) => [...prev, created]);
      setProblems((prev) => applySend(prev, problemId, created.sent_on));
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
      setBoardTicks((prev) => prev.filter((t) => t.id !== tickId));
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

  const handleSaveWarmup = async (rungs) => {
    setSavingWarmup(true);
    setError('');
    try {
      const updated = await saveWarmup(board.id, rungs);
      setBoard(updated);
      setView('warmup');
    } catch (err) {
      console.error(err);
      setError('Could not save the warm-up — check your connection and try again.');
    }
    setSavingWarmup(false);
  };

  const handleSaveVolumes = async (next) => {
    setSavingVolumes(true);
    setError('');
    let saved = false;
    try {
      setBoard(await saveVolumes(board.id, next));
      saved = true;
    } catch (err) {
      console.error(err);
      setError('Could not save the volumes — check your connection and try again.');
    }
    setSavingVolumes(false);
    return saved;
  };

  // A failed save leaves marking open with its points, so Done (or another
  // tap, for a pin) retries without starting over.
  const finishMarking = async (points) => {
    if (await handleSaveVolumes(setFace(volumes, marking.volumeId, marking.faceId, points, board.photo_url))) {
      setMarking(null);
    }
  };

  const handleWarmupSend = async (problemId) => {
    setError('');
    try {
      const created = await createTick(problemId, { sentOn: todayISO(), notes: '', sentBy: currentClimber?.name });
      setBoardTicks((prev) => [...prev, created]);
      setProblems((prev) => applySend(prev, problemId, created.sent_on));
      return true;
    } catch (err) {
      console.error(err);
      setError('Could not log that send — check your connection and try again.');
      return false;
    }
  };

  const handleFinishWarmup = async ({ feel, problemIds, sentIds }) => {
    setError('');
    try {
      const session = await createWarmupSession(board.id, {
        doneOn: todayISO(), climbedBy: currentClimber?.name, feel, problemIds, sentIds,
      });
      setWarmupSessions((prev) => [session, ...prev].slice(0, 10));
      setView('warmup');
      return true;
    } catch (err) {
      console.error(err);
      setError('Could not save that warm-up — check your connection and try again.');
      return false;
    }
  };

  const handleDeleteWarmupSession = async (id) => {
    setError('');
    try {
      await deleteWarmupSession(id);
      setWarmupSessions((prev) => prev.filter((s) => s.id !== id));
    } catch (err) {
      console.error(err);
      setError('Could not delete that warm-up — check your connection and try again.');
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

  const currentClimber = climbers.find((c) => c.id === currentClimberId) || null;
  // Re-shooting the board and marking volumes are Rob's jobs, so the buttons
  // stay out of everyone else's way. It's tidying, not a lock -- anyone can
  // pick Rob. A board with no photo yet still asks anyone for one.
  const canSetUpBoard = currentClimber?.name === BOARD_OWNER;
  const selected = problems.find((p) => p.id === selectedId);
  // With nobody picked, Unsent falls back to unsent by anyone.
  const visibleProblems = sortAndFilterProblems(problems, {
    sort, unsentOnly, sentIds: currentClimber ? sentProblemIds(boardTicks, currentClimber.name) : null,
  });
  const isWarmupView = view.startsWith('warmup');
  const warmupRungs = board?.warmup || [];
  const warmupFocus = isWarmupView && warmupFocusId ? problems.find((p) => p.id === warmupFocusId) || null : null;
  const lockedProblem = view === 'detail' || view === 'edit-details' ? selected : warmupFocus;
  const displayHolds = view === 'new' ? draftHolds : (lockedProblem ? lockedProblem.holds : []);
  const displayPhotoUrl = lockedProblem?.photo_url || activePhotoUrl;
  const lockedMaskUrl = lockedProblem?.mask_url;
  const detailPhotoStatus = lockedProblem ? photoStatus(lockedProblem, board) : null;
  const faceRows = view === 'new' ? facesOnPhoto(volumes, activePhotoUrl) : [];
  // The problem page's FA line: who got it, or that it's still up for grabs.
  // Nothing when the first send was logged before climber names existed.
  let faText = null;
  if (view === 'detail' && selected) {
    const fa = firstAscents(problems, boardTicks).get(selected.id);
    if (fa === undefined) faText = 'No FA yet · up for grabs';
    else if (fa) faText = `FA ${fa.climber} · ${formatShortDate(fa.date)} · ${repeatsLabel(fa.repeats)}`;
  }

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
          ) : view === 'warmup-run' ? (
            <h1 style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 32, letterSpacing: 1.5, margin: 0, color: '#EDEAE3' }}>WARM-UP</h1>
          ) : (
            <button onClick={() => { setSelectedId(null); setEditingId(null); setView(view === 'detail' ? backTo : 'list'); }} style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', color: '#C08552', fontFamily: "'Inter'", fontWeight: 600, fontSize: 15, cursor: 'pointer', padding: 0 }}>
              <ChevronLeft size={18} /> {view === 'detail' && backTo === 'logbook' ? 'Logbook' : view === 'detail' && backTo === 'stats' ? 'Stats' : 'Board'}
            </button>
          )}
          {view === 'list' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button onClick={() => { setWarmupFocusId(null); setView('warmup'); }} aria-label="Warm-up" title="Warm-up" style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', color: '#EDEAE3',
              border: '1px solid #3a3b3e', borderRadius: 8, width: 38, height: 38, padding: 0, cursor: 'pointer',
            }}>
              <Flame size={18} />
            </button>
            <button onClick={startNewProblem} disabled={!board?.photo_url} style={{
              display: 'flex', alignItems: 'center', gap: 6, background: board?.photo_url ? '#D9552B' : '#3a3b3e', color: '#17181A',
              border: 'none', borderRadius: 8, padding: '9px 14px', fontWeight: 700, fontSize: 14, cursor: board?.photo_url ? 'pointer' : 'not-allowed',
            }}>
              <Plus size={16} /> New problem
            </button>
            </div>
          )}
        </div>
      </div>

      {(pull > 0 || refreshing) && (
        <div aria-hidden="true" style={{ height: refreshing ? 44 : pull, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
          {refreshing ? (
            <Loader2 size={18} className="animate-spin" color="#8b8d91" />
          ) : (
            <RefreshCw size={18} color={pull >= PULL_THRESHOLD ? '#C08552' : '#8b8d91'} style={{ transform: `rotate(${pull * 4}deg)` }} />
          )}
        </div>
      )}

      <div style={{ padding: 20, maxWidth: 640, margin: '0 auto' }}>
        {view !== 'logbook' && view !== 'stats' && (
        <div
          ref={imgWrapRef}
          onClick={handleImageClick}
          style={{
            position: 'relative', width: '100%', borderRadius: 14, overflow: 'hidden',
            background: '#232427', border: '1px solid #2A2B2E',
            cursor: view === 'new' || (view === 'volumes' && marking) ? 'crosshair' : 'default', minHeight: displayPhotoUrl ? undefined : 220,
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
          {/* Faces go underneath, so a bolt-on highlighted on top of a face stays visible. */}
          {displayHolds.map((h, i) => (
            h.face && !isPinned(h.face) ? <FaceShape key={`face-${i}`} points={h.face.points} color={HOLD_COLORS[h.type]} /> : null
          ))}
          {lockedMaskUrl ? (
            <HoldHighlight src={lockedMaskUrl} />
          ) : (
            displayHolds.map((h, i) => (
              h.face ? null : h._maskUrl ? (
                <HoldHighlight key={i} src={h._maskUrl} />
              ) : (
                <ChalkRing key={i} x={h.x} y={h.y} color={HOLD_COLORS[h.type]} label={h.type === 'hold' ? String(i + 1) : ''} />
              )
            ))
          )}
          {displayHolds.map((h, i) => <PinnedFace key={`pin-${i}`} hold={h} color={HOLD_COLORS[h.type]} volumes={volumes} />)}
          {view === 'volumes' && <VolumeMarks volumes={volumes} photoUrl={board?.photo_url} marking={marking} />}
          {view === 'new' && !embeddingReady && !segmentUnavailable && (
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
        )}

        {view === 'list' && (canSetUpBoard || !board?.photo_url) && (
          <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
            <label style={{
              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              border: '1px dashed #3a3b3e', borderRadius: 10, padding: '10px 14px', fontSize: 13.5,
              color: '#a9abaf', cursor: 'pointer',
            }}>
              {uploading ? <Loader2 size={15} className="animate-spin" /> : <Camera size={15} />}
              {board?.photo_url ? 'Replace board photo' : 'Upload a photo of your board'}
              <input type="file" accept="image/*" onChange={handlePhotoUpload} style={{ display: 'none' }} />
            </label>
            {board?.photo_url && (
              <button onClick={() => { setMarking(null); setView('volumes'); }} style={{
                display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: '1px dashed #3a3b3e',
                borderRadius: 10, padding: '10px 14px', fontSize: 13.5, color: '#a9abaf', cursor: 'pointer',
              }}>
                <Triangle size={15} /> Volumes
              </button>
            )}
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

        {(view === 'new' || view === 'edit-details') && (
          <div style={{ marginTop: 16 }}>
            {view === 'new' && (
              <>
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
                <FaceButtons rows={faceRows} holds={draftHolds} volumes={volumes} colors={HOLD_COLORS} onTap={handleFaceTap} />
                <p style={{ fontSize: 12.5, color: '#8b8d91', marginTop: -6, marginBottom: 16 }}>
                  Pick a hold type, then tap the board photo above to place one — tap a placed hold to remove it.
                </p>
                {segmentUnavailable && (
                  <p style={{ fontSize: 12.5, color: '#8b8d91', marginTop: -10, marginBottom: 16 }}>
                    Highlight mode unavailable on this device — holds will show as markers instead.
                  </p>
                )}
              </>
            )}

            {!(view === 'new' && editingId) && (
              <>
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
              </>
            )}

            <button onClick={view === 'edit-details' ? saveDetails : saveProblem} disabled={saving} style={{
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
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {problems.length > 0 && (
                  <>
                    <select aria-label="Sort problems" value={sort} onChange={(e) => setSort(e.target.value)} style={{ ...inputStyle, marginTop: 0, marginBottom: 0, width: 'auto' }}>
                      {SORTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                    </select>
                    <button type="button" aria-pressed={unsentOnly} onClick={() => setUnsentOnly((prev) => !prev)} style={{
                      background: unsentOnly ? '#D9552B' : 'transparent',
                      border: `1px solid ${unsentOnly ? '#D9552B' : '#3a3b3e'}`,
                      color: unsentOnly ? '#fff' : '#b8babd',
                      borderRadius: 999, padding: '7px 12px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                    }}>Unsent</button>
                  </>
                )}
              </div>
              {/* Beside the climber, not in the header -- a third header button
                  wraps the title on phones narrower than ~390px. Slim buttons
                  and a name-only pill keep the row on one line at 360px. The group
                  takes the rest of the row and the pill gives way with … before
                  the row would wrap; only below ~330px does it drop a line. */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6, flex: '1 1 0', minWidth: 120 }}>
              <button onClick={() => setView('logbook')} aria-label="Logbook" title="Logbook" style={iconButton}>
                <CalendarDays size={14} />
              </button>
              <button onClick={() => setView('stats')} aria-label="Board stats" title="Board stats" style={iconButton}>
                <Trophy size={14} />
              </button>
              {/* Just the name, cut off with … if it's long, so the pill and
                  both buttons fit on one line on a 360px phone. */}
              <button
                onClick={() => setShowClimberPanel((prev) => !prev)}
                aria-label={currentClimber ? `Climbing as ${currentClimber.name}` : undefined}
                style={{
                  display: 'block', minWidth: 0, maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  background: 'none', border: '1px solid #3a3b3e', color: '#c7c8cb', borderRadius: 20,
                  padding: '5px 10px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
                }}
              >
                {currentClimber ? currentClimber.name : "Who's climbing?"}
              </button>
              </div>
            </div>
            {showClimberPanel && (
              <ClimberPanel
                climbers={climbers}
                newName={newClimberName}
                onNewNameChange={setNewClimberName}
                onAdd={handleAddClimber}
                onSelect={handleSelectClimber}
                adding={addingClimber}
              />
            )}
            {problems.length === 0 && (
              <div style={{ textAlign: 'center', padding: '30px 10px', color: '#6d6f73' }}>
                <CircleDot size={26} style={{ marginBottom: 8, opacity: 0.5 }} />
                <p style={{ fontSize: 14, margin: 0 }}>No problems set yet. Upload a photo and add your first one.</p>
              </div>
            )}
            {problems.length > 0 && visibleProblems.length === 0 && (
              <div style={{ textAlign: 'center', padding: '30px 10px', color: '#6d6f73' }}>
                <p style={{ fontSize: 14, margin: 0 }}>Nothing unsent — go set something new.</p>
              </div>
            )}
            {visibleProblems.map((p) => (
              <button key={p.id} onClick={() => openProblem(p.id, 'list')} style={{
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
                {faText && (
                  <p style={{ margin: '6px 0 0', fontSize: 13, color: '#c7c8cb', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Trophy size={13} color="#C9A227" aria-hidden="true" />{faText}
                  </p>
                )}
              </div>
              {selected.grade && (
                <span style={{ fontFamily: "'JetBrains Mono', monospace", background: '#232427', border: '1px solid #3a3b3e', color: '#D9552B', fontSize: 14, fontWeight: 700, padding: '5px 12px', borderRadius: 6 }}>{selected.grade}</span>
              )}
            </div>
            {/* The photo above is this problem's own snapshot, which may not be
                the board photo currently in use -- say so, since the two can
                look similar enough to mistake for each other at the wall. */}
            {detailPhotoStatus === 'stale' && (
              <p style={{ margin: '10px 0 0', fontSize: 13, color: '#8b8d91' }}>
                Set on an older board photo
              </p>
            )}
            {detailPhotoStatus === 'unknown' && (
              <p style={{ margin: '10px 0 0', fontSize: 13, color: '#D9552B' }}>
                Holds may not line up — this problem predates photo tracking
              </p>
            )}
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
            {faceListLines(selected.holds, volumes).length > 0 && (
              <div style={{ marginTop: 14 }}>
                <h3 style={sectionHeading}>Volumes</h3>
                {faceListLines(selected.holds, volumes).map((line) => (
                  <div key={line} style={{ fontSize: 14, color: '#c7c8cb', lineHeight: 1.6 }}>{line}</div>
                ))}
              </div>
            )}
            {selected.notes && <p style={{ marginTop: 12, fontSize: 14, color: '#c7c8cb', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{selected.notes}</p>}

            <div style={{ marginTop: 16 }}>
              {!currentClimber ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 13, color: '#8b8d91' }}>Select who you are to log a send</span>
                  <button onClick={() => { returnScrollRef.current = { view: 'list', y: 0 }; setView('list'); setShowClimberPanel(true); }} style={{
                    display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: '1px solid #3a3b3e',
                    color: '#8b8d91', borderRadius: 8, padding: '8px 12px', fontSize: 13, cursor: 'pointer',
                  }}>Pick a climber</button>
                </div>
              ) : !showLogForm ? (
                <button onClick={startLogTick} style={{
                  display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: '1px solid #3a3b3e',
                  color: '#8b8d91', borderRadius: 8, padding: '8px 12px', fontSize: 13, cursor: 'pointer',
                }}><Plus size={14} /> Log a send</button>
              ) : (
                <div style={{ background: '#232427', border: '1px solid #2A2B2E', borderRadius: 10, padding: 12 }}>
                  <Field label="Date">
                    {/* iOS draws a date input natively unless appearance is none, and
                        native forces box-sizing: content-box -- so width: 100% plus the
                        padding and border ran past the card. Without the native look an
                        empty date (Reset in the picker) has no text to hold the field
                        open, so minHeight keeps it the height it is with a date in. */}
                    <input aria-label="Send date" type="date" value={tickDate} onChange={(e) => setTickDate(e.target.value)} style={{ ...inputStyle, WebkitAppearance: 'none', appearance: 'none', minHeight: 41 }} />
                  </Field>
                  <Field label="Notes">
                    <textarea aria-label="Send notes" value={tickNotes} onChange={(e) => setTickNotes(e.target.value)} placeholder="Anything worth remembering" rows={2} style={{ ...inputStyle, resize: 'vertical' }} />
                  </Field>
                  {/* Only a first send can be a flash. */}
                  {!ticks.some((t) => t.sent_by === currentClimber.name) && (
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13.5, color: '#c7c8cb', marginBottom: 12, cursor: 'pointer' }}>
                      <input type="checkbox" checked={tickIsFlash} onChange={(e) => setTickIsFlash(e.target.checked)} style={{ accentColor: '#C9A227', width: 16, height: 16, margin: 0 }} />
                      <Zap size={14} color="#C9A227" /> Flashed it
                    </label>
                  )}
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
                const firstSendId = ticks.reduce((earliest, t) => {
                  if (!earliest) return t;
                  if (t.sent_on !== earliest.sent_on) return t.sent_on < earliest.sent_on ? t : earliest;
                  // Same date -- whoever logged it into the app first (by created_at)
                  // keeps the tag, so a same-day repeat can't bump the original logger.
                  return t.created_at < earliest.created_at ? t : earliest;
                }, null)?.id;
                // A flash only counts on the climber's own first send -- the
                // same rule the logbook uses -- so backdating an earlier send
                // quietly drops it.
                const flashableIds = firstSendIds(ticks);
                return (
                  <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {ticks.map((t) => (
                      <div key={t.id} style={{
                        display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8,
                        background: '#1d1e20', border: '1px solid #2A2B2E', borderRadius: 8, padding: '8px 10px',
                      }}>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: 13, fontWeight: 600 }}>
                              {t.sent_by ? `${t.sent_by} · ${formatSendDate(t.sent_on)}` : formatSendDate(t.sent_on)}
                            </span>
                            <span style={{
                              fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4,
                              color: t.id === firstSendId ? '#5C8A66' : '#8b8d91',
                            }}>{t.id === firstSendId ? 'First send' : 'Repeat'}</span>
                            {t.flash && flashableIds.has(t.id) && (
                              <span style={{
                                display: 'flex', alignItems: 'center', gap: 3, borderRadius: 999, padding: '2px 8px',
                                fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4,
                                background: '#C9A227', color: '#17181A',
                              }}><Zap size={11} />Flash</span>
                            )}
                          </div>
                          {t.notes && <p style={{ margin: '4px 0 0', fontSize: 12.5, color: '#c7c8cb', whiteSpace: 'pre-wrap' }}>{t.notes}</p>}
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
            <div style={{ marginTop: 18, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
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
                  <button onClick={() => startEditProblem(selected, 'holds')} style={{
                    display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: '1px solid #3a3b3e',
                    color: '#8b8d91', borderRadius: 8, padding: '8px 12px', fontSize: 13, cursor: 'pointer',
                  }}><CircleDot size={14} /> Edit holds</button>
                  <button onClick={() => startEditProblem(selected, 'details')} style={{
                    display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: '1px solid #3a3b3e',
                    color: '#8b8d91', borderRadius: 8, padding: '8px 12px', fontSize: 13, cursor: 'pointer',
                  }}><Pencil size={14} /> Edit details</button>
                  <button onClick={() => setConfirmingDelete(true)} style={{
                    display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: '1px solid #3a3b3e',
                    color: '#8b8d91', borderRadius: 8, padding: '8px 12px', fontSize: 13, cursor: 'pointer',
                  }}><Trash2 size={14} /> Delete problem</button>
                </>
              )}
            </div>
          </div>
        )}

        {view === 'logbook' && (
          <LogbookScreen
            problems={problems}
            ticks={boardTicks}
            climber={currentClimber}
            today={localDate()}
            tab={logbookTab}
            onTabChange={setLogbookTab}
            openDays={openLogbookDays}
            onToggleDay={toggleLogbookDay}
            onOpenProblem={(problemId) => openProblem(problemId, 'logbook')}
            onPickClimber={() => { returnScrollRef.current = { view: 'list', y: 0 }; setView('list'); setShowClimberPanel(true); }}
          />
        )}

        {view === 'stats' && (
          <BoardStatsScreen
            problems={problems}
            ticks={boardTicks}
            climberCount={climbers.length}
            today={localDate()}
            onOpenProblem={(problemId) => openProblem(problemId, 'stats')}
          />
        )}

        {view === 'warmup' && (
          <WarmupScreen
            rungs={warmupRungs}
            problems={problems}
            sessions={warmupSessions}
            climber={currentClimber}
            onFocus={setWarmupFocusId}
            onEdit={() => { setWarmupFocusId(null); setView('warmup-edit'); }}
            onStart={() => setView('warmup-run')}
            onDeleteSession={handleDeleteWarmupSession}
          />
        )}

        {view === 'warmup-edit' && (
          <WarmupEditor
            initialRungs={warmupRungs}
            problems={problems}
            saving={savingWarmup}
            onSave={handleSaveWarmup}
            onCancel={() => setView('warmup')}
          />
        )}

        {view === 'warmup-run' && (
          <WarmupRun
            rungs={warmupRungs}
            problems={problems}
            climberName={currentClimber?.name || ''}
            onFocus={setWarmupFocusId}
            onSend={handleWarmupSend}
            onFinish={handleFinishWarmup}
            onDiscard={() => setView('warmup')}
          />
        )}

        {view === 'volumes' && (
          <VolumesScreen
            volumes={volumes}
            photoUrl={board?.photo_url}
            marking={marking}
            saving={savingVolumes}
            onSave={handleSaveVolumes}
            onStartMarking={(m) => { window.scrollTo(0, 0); setMarking({ ...m, points: [] }); }}
            onUndoPoint={() => setMarking((m) => ({ ...m, points: m.points.slice(0, -1) }))}
            onFinishOutline={() => finishMarking(marking.points)}
            onCancelMarking={() => setMarking(null)}
          />
        )}
      </div>
    </div>
  );
}
