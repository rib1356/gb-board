import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('./lib/board', () => ({
  getOrCreateBoard: vi.fn(),
  listProblems: vi.fn(),
  uploadBoardPhoto: vi.fn(),
  uploadProblemMask: vi.fn(),
  createProblem: vi.fn(),
  deleteProblem: vi.fn(),
  updateProblem: vi.fn(),
  restoreProblem: vi.fn(),
  listTicks: vi.fn(),
  listBoardTicks: vi.fn(),
  listBoardVotes: vi.fn(),
  saveVote: vi.fn(),
  createTick: vi.fn(),
  deleteTick: vi.fn(),
  listClimbers: vi.fn(),
  createClimber: vi.fn(),
  saveWarmup: vi.fn(),
  saveVolumes: vi.fn(),
  listWarmupSessions: vi.fn(),
  createWarmupSession: vi.fn(),
  deleteWarmupSession: vi.fn(),
}));
vi.mock('./lib/image', () => ({
  resizeFileToBlob: vi.fn(),
}));
vi.mock('./lib/tweaks', () => ({
  TWEAKS_EMAIL: 'tweaks@example.com',
  getTweaksSession: vi.fn(),
  signInToTweaks: vi.fn(),
  signOutOfTweaks: vi.fn(),
  listInjuries: vi.fn(),
  listCheckins: vi.fn(),
  createInjury: vi.fn(),
  updateInjury: vi.fn(),
  deleteInjury: vi.fn(),
  createCheckin: vi.fn(),
  updateCheckin: vi.fn(),
  deleteCheckin: vi.fn(),
  isSignedOutError: (e) => e?.code === '42501' || e?.code === 'PGRST301' || e?.code === 'PGRST303' || e?.status === 401,
}));
vi.mock('./lib/segment', () => ({
  loadSegmenter: vi.fn(),
  computeEmbedding: vi.fn(),
  maskAtPoint: vi.fn(),
  maskToDataUrl: vi.fn(() => 'data:image/png;base64,FAKE'),
  compositeMaskBlob: vi.fn(),
}));

import { getOrCreateBoard, listProblems, uploadBoardPhoto, uploadProblemMask, createProblem, deleteProblem, updateProblem, restoreProblem, listTicks, listBoardTicks, listBoardVotes, saveVote, createTick, deleteTick, listClimbers, createClimber, saveWarmup, saveVolumes, listWarmupSessions, createWarmupSession, deleteWarmupSession } from './lib/board';
import { resizeFileToBlob } from './lib/image';
import { loadSegmenter, computeEmbedding, maskAtPoint, maskToDataUrl, compositeMaskBlob } from './lib/segment';
import { getTweaksSession, signInToTweaks, signOutOfTweaks, listInjuries, listCheckins, createInjury, updateInjury, createCheckin } from './lib/tweaks';
import { LONG_PRESS_MS } from './tweaks/useLongPress';
import { addDays, localDate } from './lib/dates';
import App from './App';

const BOARD = { id: 'b1', name: 'Home Board', photo_url: null };

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  getOrCreateBoard.mockResolvedValue(BOARD);
  listProblems.mockResolvedValue([]);
  listTicks.mockResolvedValue([]);
  listBoardTicks.mockResolvedValue([]);
  listBoardVotes.mockResolvedValue([]);
  listClimbers.mockResolvedValue([]);
  listWarmupSessions.mockResolvedValue([]);
  getTweaksSession.mockResolvedValue(null);
  listInjuries.mockResolvedValue([]);
  listCheckins.mockResolvedValue([]);
  loadSegmenter.mockRejectedValue(new Error('segmentation unavailable in tests'));
});

// Holds the title and lets go. iOS then sends a click where the finger was,
// landing on whatever the hold opened there (ghostClickOn picks it).
async function holdTitle(ghostClickOn = () => document.body) {
  const title = await screen.findByText('THE BOARD');
  fireEvent.pointerDown(title, { clientX: 5, clientY: 5, pointerId: 1 });
  await act(() => new Promise((resolve) => setTimeout(resolve, LONG_PRESS_MS + 20)));
  fireEvent.pointerUp(title, { clientX: 5, clientY: 5, pointerId: 1 });
  fireEvent.click(ghostClickOn());
}

describe('App (read paths)', () => {
  it('loads the board and shows the empty state when there are no problems', async () => {
    render(<App />);
    expect(await screen.findByText('THE BOARD')).toBeInTheDocument();
    expect(
      screen.getByText('No problems set yet. Upload a photo and add your first one.')
    ).toBeInTheDocument();
    expect(getOrCreateBoard).toHaveBeenCalled();
    expect(listProblems).toHaveBeenCalledWith('b1');
  });

  it('lists problems returned from the server', async () => {
    listProblems.mockResolvedValue([
      { id: 'p1', name: 'Gaston Traverse', grade: 'V5', setter: 'Rob', notes: '', holds: [] },
    ]);
    render(<App />);
    const nameEl = await screen.findByText('Gaston Traverse');
    expect(nameEl.closest('button')).toHaveTextContent('V5');
  });

  it('opens a problem detail view with its holds overlaid', async () => {
    listProblems.mockResolvedValue([
      {
        id: 'p1',
        name: 'Gaston Traverse',
        grade: 'V5',
        setter: 'Rob',
        notes: 'Match on the sloper',
        holds: [{ x: 0.2, y: 0.3, type: 'start' }],
      },
    ]);
    render(<App />);
    const user = userEvent.setup();
    await user.click(await screen.findByText('Gaston Traverse'));
    expect(await screen.findByText('Match on the sloper')).toBeInTheDocument();
  });

  it("keeps the line breaks in a problem's notes and its sends' notes", async () => {
    listProblems.mockResolvedValue([
      { id: 'p1', name: 'Gaston Traverse', grade: 'V5', setter: 'Rob', notes: 'Match the sloper\nbump left\nflag right', holds: [] },
    ]);
    listTicks.mockResolvedValue([{ id: 't1', problem_id: 'p1', sent_on: '2026-08-01', notes: 'Flashed it\nfoot cut on the bump' }]);
    render(<App />);
    const user = userEvent.setup();
    await user.click(await screen.findByText('Gaston Traverse'));

    const notes = await screen.findByText(/Match the sloper/);
    expect(notes.textContent).toBe('Match the sloper\nbump left\nflag right');
    expect(notes).toHaveStyle({ whiteSpace: 'pre-wrap' });

    const sendNotes = await screen.findByText(/Flashed it/);
    expect(sendNotes.textContent).toBe('Flashed it\nfoot cut on the bump');
    expect(sendNotes).toHaveStyle({ whiteSpace: 'pre-wrap' });
  });

  it('clears the stale hold overlay after navigating back from detail view', async () => {
    getOrCreateBoard.mockResolvedValue({ id: 'b1', name: 'Home Board', photo_url: 'https://cdn.example/b1.jpg' });
    listProblems.mockResolvedValue([
      {
        id: 'p1',
        name: 'Gaston Traverse',
        grade: 'V5',
        setter: 'Rob',
        notes: 'Match on the sloper',
        holds: [{ x: 0.2, y: 0.3, type: 'start' }],
      },
    ]);
    render(<App />);
    const user = userEvent.setup();

    await user.click(await screen.findByText('Gaston Traverse'));
    expect(await screen.findByText('Match on the sloper')).toBeInTheDocument();
    expect(
      screen.getByAltText('Climbing board').parentElement.querySelectorAll('svg circle')
    ).toHaveLength(1);

    await user.click(screen.getByRole('button', { name: /board/i }));

    expect(await screen.findByText('THE BOARD')).toBeInTheDocument();
    expect(
      screen.getByAltText('Climbing board').parentElement.querySelectorAll('svg circle')
    ).toHaveLength(0);
  });

  it('shows an error if the board fails to load', async () => {
    getOrCreateBoard.mockRejectedValue(new Error('network down'));
    render(<App />);
    expect(await screen.findByText(/Could not load the board/)).toBeInTheDocument();
  });

  it('uploads a resized photo and displays the returned url', async () => {
    const file = new File(['fake'], 'board.jpg', { type: 'image/jpeg' });
    const blob = new Blob(['resized'], { type: 'image/jpeg' });
    resizeFileToBlob.mockResolvedValue(blob);
    uploadBoardPhoto.mockResolvedValue({ ...BOARD, photo_url: 'https://cdn.example/b1.jpg' });

    render(<App />);
    const input = await screen.findByLabelText(/Upload a photo of your board/i);
    const user = userEvent.setup();
    await user.upload(input, file);

    expect(await screen.findByAltText('Climbing board')).toHaveAttribute(
      'src',
      'https://cdn.example/b1.jpg'
    );
    expect(uploadBoardPhoto).toHaveBeenCalledWith('b1', blob);
  });
});

describe('App (create flow)', () => {
  it('places a hold on tap and saves a new problem', async () => {
    getOrCreateBoard.mockResolvedValue({ id: 'b1', name: 'Home Board', photo_url: 'https://cdn.example/b1.jpg' });
    createProblem.mockResolvedValue({
      id: 'p1', name: 'Gaston Traverse', grade: '', setter: '', notes: '',
      holds: [{ x: 0.5, y: 0.5, type: 'start' }],
    });
    render(<App />);
    const user = userEvent.setup();

    await user.click(await screen.findByText('New problem'));
    const photo = await screen.findByAltText('Climbing board');
    vi.spyOn(photo.parentElement, 'getBoundingClientRect').mockReturnValue({
      left: 0, top: 0, width: 200, height: 100, right: 200, bottom: 100,
    });
    fireEvent.click(photo.parentElement, { clientX: 100, clientY: 50 });

    await user.type(await screen.findByPlaceholderText('e.g. Gaston Traverse'), 'Gaston Traverse');
    await user.click(screen.getByText('Save problem'));

    await waitFor(() =>
      expect(createProblem).toHaveBeenCalledWith('b1', {
        name: 'Gaston Traverse', grade: '', setter: '', notes: '',
        holds: [{ x: 0.5, y: 0.5, type: 'start' }],
        photoUrl: 'https://cdn.example/b1.jpg',
      })
    );
    expect(await screen.findByText('THE BOARD')).toBeInTheDocument();
  });

  it('lets the user pick a grade from the V-scale dropdown and saves it', async () => {
    getOrCreateBoard.mockResolvedValue({ id: 'b1', name: 'Home Board', photo_url: 'https://cdn.example/b1.jpg' });
    createProblem.mockResolvedValue({
      id: 'p1', name: 'Gaston Traverse', grade: 'V4', setter: '', notes: '',
      holds: [{ x: 0.5, y: 0.5, type: 'start' }],
    });
    render(<App />);
    const user = userEvent.setup();

    await user.click(await screen.findByText('New problem'));
    const photo = await screen.findByAltText('Climbing board');
    vi.spyOn(photo.parentElement, 'getBoundingClientRect').mockReturnValue({
      left: 0, top: 0, width: 200, height: 100, right: 200, bottom: 100,
    });
    fireEvent.click(photo.parentElement, { clientX: 100, clientY: 50 });

    await user.type(await screen.findByPlaceholderText('e.g. Gaston Traverse'), 'Gaston Traverse');
    await user.selectOptions(screen.getByRole('combobox', { name: /grade/i }), 'V4');
    await user.click(screen.getByText('Save problem'));

    await waitFor(() =>
      expect(createProblem).toHaveBeenCalledWith('b1', {
        name: 'Gaston Traverse', grade: 'V4', setter: '', notes: '',
        holds: [{ x: 0.5, y: 0.5, type: 'start' }],
        photoUrl: 'https://cdn.example/b1.jpg',
      })
    );
  });

  it('places a foothold on tap after selecting the foot type', async () => {
    getOrCreateBoard.mockResolvedValue({ id: 'b1', name: 'Home Board', photo_url: 'https://cdn.example/b1.jpg' });
    createProblem.mockResolvedValue({
      id: 'p1', name: 'Gaston Traverse', grade: '', setter: '', notes: '',
      holds: [{ x: 0.5, y: 0.5, type: 'foot' }],
    });
    render(<App />);
    const user = userEvent.setup();

    await user.click(await screen.findByText('New problem'));
    await user.click(screen.getByText('foot'));
    const photo = await screen.findByAltText('Climbing board');
    vi.spyOn(photo.parentElement, 'getBoundingClientRect').mockReturnValue({
      left: 0, top: 0, width: 200, height: 100, right: 200, bottom: 100,
    });
    fireEvent.click(photo.parentElement, { clientX: 100, clientY: 50 });

    await user.type(await screen.findByPlaceholderText('e.g. Gaston Traverse'), 'Gaston Traverse');
    await user.click(screen.getByText('Save problem'));

    await waitFor(() =>
      expect(createProblem).toHaveBeenCalledWith('b1', {
        name: 'Gaston Traverse', grade: '', setter: '', notes: '',
        holds: [{ x: 0.5, y: 0.5, type: 'foot' }],
        photoUrl: 'https://cdn.example/b1.jpg',
      })
    );
  });

  it('shows a validation error and does not save when no holds were placed', async () => {
    getOrCreateBoard.mockResolvedValue({ id: 'b1', name: 'Home Board', photo_url: 'https://cdn.example/b1.jpg' });
    render(<App />);
    const user = userEvent.setup();

    await user.click(await screen.findByText('New problem'));
    await user.type(await screen.findByPlaceholderText('e.g. Gaston Traverse'), 'Gaston Traverse');
    await user.click(screen.getByText('Save problem'));

    expect(await screen.findByText('Tap the board to mark at least one hold.')).toBeInTheDocument();
    expect(createProblem).not.toHaveBeenCalled();
  });

  it('prefills the setter field with the current climber on a new problem', async () => {
    getOrCreateBoard.mockResolvedValue({ id: 'b1', name: 'Home Board', photo_url: 'https://cdn.example/b1.jpg' });
    localStorage.setItem('board-app:currentClimberId', 'c1');
    listClimbers.mockResolvedValue([{ id: 'c1', name: 'Rob' }]);
    const user = userEvent.setup();
    render(<App />);

    await screen.findByRole('button', { name: 'Climbing as Rob' });
    await user.click(screen.getByText('New problem'));

    expect(screen.getByPlaceholderText('Your name')).toHaveValue('Rob');
  });
});

describe('App (hold highlighting)', () => {
  it('highlights a tapped hold instead of a circle when segmentation succeeds, and saves the composited mask', async () => {
    getOrCreateBoard.mockResolvedValue({ id: 'b1', name: 'Home Board', photo_url: 'https://cdn.example/b1.jpg' });
    loadSegmenter.mockResolvedValue({ device: 'webgpu' });
    computeEmbedding.mockResolvedValue({ width: 400, height: 200 });
    const mask = { width: 400, height: 200, data: new Uint8Array(400 * 200) };
    maskAtPoint.mockResolvedValue(mask);
    const blob = new Blob(['mask'], { type: 'image/png' });
    compositeMaskBlob.mockResolvedValue(blob);
    createProblem.mockResolvedValue({
      id: 'p1', name: 'Gaston Traverse', grade: '', setter: '', notes: '',
      holds: [{ x: 0.5, y: 0.5, type: 'hold' }],
    });
    uploadProblemMask.mockResolvedValue({
      id: 'p1', name: 'Gaston Traverse', grade: '', setter: '', notes: '',
      holds: [{ x: 0.5, y: 0.5, type: 'hold' }], mask_url: 'https://cdn.example/board-photos/masks/p1.png',
    });

    render(<App />);
    const user = userEvent.setup();

    await user.click(await screen.findByText('New problem'));
    const photo = await screen.findByAltText('Climbing board');
    vi.spyOn(photo.parentElement, 'getBoundingClientRect').mockReturnValue({
      left: 0, top: 0, width: 400, height: 200, right: 400, bottom: 200,
    });

    await waitFor(() => expect(computeEmbedding).toHaveBeenCalled());
    fireEvent.click(photo.parentElement, { clientX: 200, clientY: 100 });

    await waitFor(() => expect(screen.getByTestId('hold-highlight')).toBeInTheDocument());
    expect(screen.queryByTestId('hold-marker')).not.toBeInTheDocument();

    await user.type(await screen.findByPlaceholderText('e.g. Gaston Traverse'), 'Gaston Traverse');
    await user.click(screen.getByText('Save problem'));

    await waitFor(() => expect(uploadProblemMask).toHaveBeenCalledWith('p1', blob));
  });

  it('removes a highlighted hold when tapping it again, instead of placing a new one', async () => {
    getOrCreateBoard.mockResolvedValue({ id: 'b1', name: 'Home Board', photo_url: 'https://cdn.example/b1.jpg' });
    loadSegmenter.mockResolvedValue({ device: 'webgpu' });
    computeEmbedding.mockResolvedValue({ width: 400, height: 200 });
    const mask = { width: 400, height: 200, data: new Uint8Array(400 * 200).fill(1) };
    maskAtPoint.mockResolvedValue(mask);

    render(<App />);
    const user = userEvent.setup();

    await user.click(await screen.findByText('New problem'));
    const photo = await screen.findByAltText('Climbing board');
    vi.spyOn(photo.parentElement, 'getBoundingClientRect').mockReturnValue({
      left: 0, top: 0, width: 400, height: 200, right: 400, bottom: 200,
    });

    await waitFor(() => expect(computeEmbedding).toHaveBeenCalled());
    fireEvent.click(photo.parentElement, { clientX: 200, clientY: 100 });
    await waitFor(() => expect(screen.getByTestId('hold-highlight')).toBeInTheDocument());

    fireEvent.click(photo.parentElement, { clientX: 210, clientY: 110 });

    expect(screen.queryByTestId('hold-highlight')).not.toBeInTheDocument();
    expect(screen.queryByTestId('hold-marker')).not.toBeInTheDocument();
  });

  it('falls back to circle markers and skips the mask upload when segmentation is unavailable', async () => {
    getOrCreateBoard.mockResolvedValue({ id: 'b1', name: 'Home Board', photo_url: 'https://cdn.example/b1.jpg' });
    createProblem.mockResolvedValue({
      id: 'p1', name: 'Gaston Traverse', grade: '', setter: '', notes: '',
      holds: [{ x: 0.5, y: 0.5, type: 'hold' }],
    });

    render(<App />);
    const user = userEvent.setup();

    await user.click(await screen.findByText('New problem'));
    const photo = await screen.findByAltText('Climbing board');
    vi.spyOn(photo.parentElement, 'getBoundingClientRect').mockReturnValue({
      left: 0, top: 0, width: 400, height: 200, right: 400, bottom: 200,
    });

    await waitFor(() => expect(loadSegmenter).toHaveBeenCalled());
    fireEvent.click(photo.parentElement, { clientX: 200, clientY: 100 });

    expect(screen.getAllByTestId('hold-marker')).toHaveLength(1);
    expect(screen.queryByTestId('hold-highlight')).not.toBeInTheDocument();

    await user.type(await screen.findByPlaceholderText('e.g. Gaston Traverse'), 'Gaston Traverse');
    await user.click(screen.getByText('Save problem'));

    await waitFor(() => expect(createProblem).toHaveBeenCalled());
    expect(uploadProblemMask).not.toHaveBeenCalled();
  });

  it("shows a saved problem's composited highlight instead of circle markers in the detail view", async () => {
    listProblems.mockResolvedValue([
      {
        id: 'p1', name: 'Gaston Traverse', grade: 'V5', setter: 'Rob', notes: '',
        holds: [{ x: 0.5, y: 0.5, type: 'hold' }],
        mask_url: 'https://cdn.example/board-photos/masks/p1.png',
      },
    ]);
    render(<App />);
    const user = userEvent.setup();

    await user.click(await screen.findByText('Gaston Traverse'));

    const highlight = await screen.findByTestId('hold-highlight');
    expect(highlight).toHaveAttribute('src', 'https://cdn.example/board-photos/masks/p1.png');
    expect(screen.queryByTestId('hold-marker')).not.toBeInTheDocument();
  });

  it('shows a loading indicator while highlight mode is preparing, then hides it once ready', async () => {
    getOrCreateBoard.mockResolvedValue({ id: 'b1', name: 'Home Board', photo_url: 'https://cdn.example/b1.jpg' });
    let resolveLoad;
    loadSegmenter.mockReturnValue(new Promise((resolve) => { resolveLoad = resolve; }));
    computeEmbedding.mockResolvedValue({ width: 400, height: 200 });

    render(<App />);
    const user = userEvent.setup();
    await user.click(await screen.findByText('New problem'));

    const photo = await screen.findByAltText('Climbing board');
    const banner = await screen.findByText(/Preparing highlight/i);
    expect(photo.parentElement.contains(banner)).toBe(true);

    resolveLoad({ device: 'webgpu' });

    await waitFor(() => expect(screen.queryByText(/Preparing highlight/i)).not.toBeInTheDocument());
  });

  it('ignores a tap while highlight mode is still loading, so it never leaves a permanent circle marker', async () => {
    getOrCreateBoard.mockResolvedValue({ id: 'b1', name: 'Home Board', photo_url: 'https://cdn.example/b1.jpg' });
    let resolveLoad;
    loadSegmenter.mockReturnValue(new Promise((resolve) => { resolveLoad = resolve; }));
    computeEmbedding.mockResolvedValue({ width: 400, height: 200 });
    maskAtPoint.mockResolvedValue({ width: 400, height: 200, data: new Uint8Array(400 * 200) });

    render(<App />);
    const user = userEvent.setup();
    await user.click(await screen.findByText('New problem'));
    const photo = await screen.findByAltText('Climbing board');
    vi.spyOn(photo.parentElement, 'getBoundingClientRect').mockReturnValue({
      left: 0, top: 0, width: 400, height: 200, right: 400, bottom: 200,
    });

    expect(await screen.findByText(/Preparing highlight/i)).toBeInTheDocument();
    fireEvent.click(photo.parentElement, { clientX: 200, clientY: 100 });

    expect(screen.queryByTestId('hold-marker')).not.toBeInTheDocument();
    expect(screen.queryByTestId('hold-highlight')).not.toBeInTheDocument();

    resolveLoad({ device: 'webgpu' });
    await waitFor(() => expect(screen.queryByText(/Preparing highlight/i)).not.toBeInTheDocument());

    fireEvent.click(photo.parentElement, { clientX: 200, clientY: 100 });
    await waitFor(() => expect(screen.getByTestId('hold-highlight')).toBeInTheDocument());
  });

  it('shows an unavailable notice instead of the loading indicator when highlight mode fails to load', async () => {
    getOrCreateBoard.mockResolvedValue({ id: 'b1', name: 'Home Board', photo_url: 'https://cdn.example/b1.jpg' });
    loadSegmenter.mockRejectedValue(new Error('no webgpu'));

    render(<App />);
    const user = userEvent.setup();
    await user.click(await screen.findByText('New problem'));

    expect(await screen.findByText(/Highlight mode unavailable/i)).toBeInTheDocument();
    expect(screen.queryByText(/Preparing highlight/i)).not.toBeInTheDocument();
    // The raw error stays in the console -- the notice itself is plain English.
    expect(screen.queryByText(/no webgpu/i)).not.toBeInTheDocument();
  });

  it('shows the loading indicator again for a later editing session, even though highlight mode already loaded once', async () => {
    listProblems.mockResolvedValue([
      { id: 'p1', name: 'Gaston Traverse', grade: 'V5', setter: 'Rob', notes: '', holds: [{ x: 0.2, y: 0.3, type: 'start' }] },
    ]);
    getOrCreateBoard.mockResolvedValue({ id: 'b1', name: 'Home Board', photo_url: 'https://cdn.example/b1.jpg' });
    loadSegmenter.mockResolvedValue({ device: 'webgpu' });
    computeEmbedding.mockResolvedValueOnce({ width: 400, height: 200 });
    let resolveSecond;
    computeEmbedding.mockImplementation(() => new Promise((resolve) => { resolveSecond = resolve; }));

    render(<App />);
    const user = userEvent.setup();

    // First session -- loads and settles normally.
    await user.click(await screen.findByText('New problem'));
    await waitFor(() => expect(screen.queryByText(/Preparing highlight/i)).not.toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /board/i }));

    // A later session (editing) needs its own embedding for its own photo --
    // the banner shouldn't skip itself just because the model is cached.
    await user.click(await screen.findByText('Gaston Traverse'));
    await user.click(await screen.findByRole('button', { name: 'Edit holds' }));

    expect(await screen.findByText(/Preparing highlight/i)).toBeInTheDocument();

    resolveSecond({ width: 400, height: 200 });
    await waitFor(() => expect(screen.queryByText(/Preparing highlight/i)).not.toBeInTheDocument());
  });

  it("computes a hold's highlight image once, instead of recomputing it on every re-render", async () => {
    getOrCreateBoard.mockResolvedValue({ id: 'b1', name: 'Home Board', photo_url: 'https://cdn.example/b1.jpg' });
    loadSegmenter.mockResolvedValue({ device: 'webgpu' });
    computeEmbedding.mockResolvedValue({ width: 400, height: 200 });
    maskAtPoint.mockResolvedValue({ width: 400, height: 200, data: new Uint8Array(400 * 200) });

    render(<App />);
    const user = userEvent.setup();

    await user.click(await screen.findByText('New problem'));
    const photo = await screen.findByAltText('Climbing board');
    vi.spyOn(photo.parentElement, 'getBoundingClientRect').mockReturnValue({
      left: 0, top: 0, width: 400, height: 200, right: 400, bottom: 200,
    });

    await waitFor(() => expect(computeEmbedding).toHaveBeenCalled());
    fireEvent.click(photo.parentElement, { clientX: 200, clientY: 100 });
    await waitFor(() => expect(screen.getByTestId('hold-highlight')).toBeInTheDocument());

    expect(maskToDataUrl).toHaveBeenCalledTimes(1);

    await user.type(await screen.findByPlaceholderText('e.g. Gaston Traverse'), 'Gaston');

    expect(maskToDataUrl).toHaveBeenCalledTimes(1);
  });
});

describe('App (delete flow)', () => {
  it('asks for confirmation before deleting, then deletes on confirm', async () => {
    listProblems.mockResolvedValue([
      { id: 'p1', name: 'Gaston Traverse', grade: 'V5', setter: 'Rob', notes: '', holds: [] },
    ]);
    deleteProblem.mockResolvedValue(undefined);
    render(<App />);
    const user = userEvent.setup();

    await user.click(await screen.findByText('Gaston Traverse'));
    await user.click(await screen.findByText('Delete problem'));
    expect(deleteProblem).not.toHaveBeenCalled();

    await user.click(await screen.findByText('Yes, delete'));

    await waitFor(() => expect(deleteProblem).toHaveBeenCalledWith('p1'));
    expect(
      await screen.findByText('No problems set yet. Upload a photo and add your first one.')
    ).toBeInTheDocument();
  });

  it('cancels the delete confirmation without deleting', async () => {
    listProblems.mockResolvedValue([
      { id: 'p1', name: 'Gaston Traverse', grade: 'V5', setter: 'Rob', notes: '', holds: [] },
    ]);
    render(<App />);
    const user = userEvent.setup();

    await user.click(await screen.findByText('Gaston Traverse'));
    await user.click(await screen.findByText('Delete problem'));
    await user.click(await screen.findByText('Cancel'));

    expect(deleteProblem).not.toHaveBeenCalled();
    expect(await screen.findByText('Delete problem')).toBeInTheDocument();
  });

  it('shows an undo banner after deleting, and restores the problem on undo', async () => {
    listProblems.mockResolvedValue([
      { id: 'p1', name: 'Gaston Traverse', grade: 'V5', setter: 'Rob', notes: '', holds: [] },
    ]);
    deleteProblem.mockResolvedValue(undefined);
    restoreProblem.mockResolvedValue({
      id: 'p1', name: 'Gaston Traverse', grade: 'V5', setter: 'Rob', notes: '', holds: [],
    });
    render(<App />);
    const user = userEvent.setup();

    await user.click(await screen.findByText('Gaston Traverse'));
    await user.click(await screen.findByText('Delete problem'));
    await user.click(await screen.findByText('Yes, delete'));

    await user.click(await screen.findByText('Undo'));

    await waitFor(() => expect(restoreProblem).toHaveBeenCalledWith('p1'));
    expect(await screen.findByText('Gaston Traverse')).toBeInTheDocument();
  });
});

describe('App (photo snapshot)', () => {
  it("shows a problem's own photo snapshot in the detail view, not the current board photo", async () => {
    getOrCreateBoard.mockResolvedValue({ id: 'b1', name: 'Home Board', photo_url: 'https://cdn.example/new-board.jpg' });
    listProblems.mockResolvedValue([
      {
        id: 'p1', name: 'Gaston Traverse', grade: 'V5', setter: 'Rob', notes: '',
        holds: [{ x: 0.2, y: 0.3, type: 'start' }], photo_url: 'https://cdn.example/old-board.jpg',
      },
    ]);
    render(<App />);
    const user = userEvent.setup();

    await user.click(await screen.findByText('Gaston Traverse'));

    expect(await screen.findByAltText('Climbing board')).toHaveAttribute('src', 'https://cdn.example/old-board.jpg');
  });

  it("keeps showing the problem's own photo snapshot while editing it", async () => {
    getOrCreateBoard.mockResolvedValue({ id: 'b1', name: 'Home Board', photo_url: 'https://cdn.example/new-board.jpg' });
    listProblems.mockResolvedValue([
      {
        id: 'p1', name: 'Gaston Traverse', grade: 'V5', setter: 'Rob', notes: '',
        holds: [{ x: 0.2, y: 0.3, type: 'start' }], photo_url: 'https://cdn.example/old-board.jpg',
      },
    ]);
    render(<App />);
    const user = userEvent.setup();

    await user.click(await screen.findByText('Gaston Traverse'));
    await user.click(await screen.findByRole('button', { name: 'Edit holds' }));

    expect(await screen.findByAltText('Climbing board')).toHaveAttribute('src', 'https://cdn.example/old-board.jpg');
  });

  it('warns on the detail view when the board has been re-shot since the problem was set', async () => {
    getOrCreateBoard.mockResolvedValue({ id: 'b1', name: 'Home Board', photo_url: 'https://cdn.example/new-board.jpg' });
    listProblems.mockResolvedValue([
      {
        id: 'p1', name: 'Gaston Traverse', grade: 'V5', setter: 'Rob', notes: '',
        holds: [{ x: 0.2, y: 0.3, type: 'start' }], photo_url: 'https://cdn.example/old-board.jpg',
      },
    ]);
    render(<App />);
    const user = userEvent.setup();

    await user.click(await screen.findByText('Gaston Traverse'));

    expect(await screen.findByText(/Set on an older board photo/i)).toBeInTheDocument();
  });

  it('shows no photo warning when the problem was set on the photo still in use', async () => {
    getOrCreateBoard.mockResolvedValue({ id: 'b1', name: 'Home Board', photo_url: 'https://cdn.example/current.jpg' });
    listProblems.mockResolvedValue([
      {
        id: 'p1', name: 'Gaston Traverse', grade: 'V5', setter: 'Rob', notes: '',
        holds: [{ x: 0.2, y: 0.3, type: 'start' }], photo_url: 'https://cdn.example/current.jpg',
      },
    ]);
    render(<App />);
    const user = userEvent.setup();

    await user.click(await screen.findByText('Gaston Traverse'));

    expect(await screen.findByAltText('Climbing board')).toBeInTheDocument();
    expect(screen.queryByText(/older board photo/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/may not line up/i)).not.toBeInTheDocument();
  });

  // Pre-dates photo snapshots, so the detail view falls back to the CURRENT
  // board photo -- the holds are drawn over a photo they were never placed on.
  it('warns more strongly when the problem never recorded a photo of its own', async () => {
    getOrCreateBoard.mockResolvedValue({ id: 'b1', name: 'Home Board', photo_url: 'https://cdn.example/current.jpg' });
    listProblems.mockResolvedValue([
      {
        id: 'p1', name: 'Gaston Traverse', grade: 'V5', setter: 'Rob', notes: '',
        holds: [{ x: 0.2, y: 0.3, type: 'start' }], photo_url: null,
      },
    ]);
    render(<App />);
    const user = userEvent.setup();

    await user.click(await screen.findByText('Gaston Traverse'));

    expect(await screen.findByText(/may not line up/i)).toBeInTheDocument();
    expect(screen.queryByText(/older board photo/i)).not.toBeInTheDocument();
  });
});

describe('App (list sort and unsent filter)', () => {
  const PROBLEMS = [
    { id: 'p1', name: 'Gaston Traverse', grade: 'V5', setter: 'Rob', notes: '', holds: [], send_count: 3 },
    { id: 'p2', name: 'Crimpy Corner', grade: 'V3', setter: 'Rob', notes: '', holds: [], send_count: 0 },
    { id: 'p3', name: 'Tension Sucks', grade: 'V7', setter: 'Rob', notes: '', holds: [], send_count: 0 },
  ];
  const listedNames = () =>
    screen.getAllByText(/Gaston Traverse|Crimpy Corner|Tension Sucks/).map((el) => el.textContent);

  it('sorts the list easiest first and hardest first', async () => {
    listProblems.mockResolvedValue(PROBLEMS);
    render(<App />);
    const user = userEvent.setup();

    await screen.findByText('Gaston Traverse');
    const sort = screen.getByRole('combobox', { name: /sort problems/i });
    await user.selectOptions(sort, 'grade-asc');
    expect(listedNames()).toEqual(['Crimpy Corner', 'Gaston Traverse', 'Tension Sucks']);
    await user.selectOptions(sort, 'grade-desc');
    expect(listedNames()).toEqual(['Tension Sucks', 'Gaston Traverse', 'Crimpy Corner']);
  });

  it('shows only problems nobody has sent when Unsent is toggled on, and all again when off', async () => {
    listProblems.mockResolvedValue(PROBLEMS);
    render(<App />);
    const user = userEvent.setup();

    await screen.findByText('Gaston Traverse');
    const unsent = screen.getByRole('button', { name: /unsent/i });
    await user.click(unsent);
    expect(unsent).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByText('Gaston Traverse')).not.toBeInTheDocument();
    expect(screen.getByText('Crimpy Corner')).toBeInTheDocument();
    expect(screen.getByText('Tension Sucks')).toBeInTheDocument();

    await user.click(unsent);
    expect(screen.getByText('Gaston Traverse')).toBeInTheDocument();
  });

  it('says so when every problem has been sent', async () => {
    listProblems.mockResolvedValue([PROBLEMS[0]]);
    render(<App />);
    const user = userEvent.setup();

    await screen.findByText('Gaston Traverse');
    await user.click(screen.getByRole('button', { name: /unsent/i }));
    expect(screen.getByText(/nothing unsent/i)).toBeInTheDocument();
  });
});

describe('App (unsent by the current climber)', () => {
  const GASTON = { id: 'p1', name: 'Gaston Traverse', grade: 'V5', setter: 'Rob', notes: '', holds: [], send_count: 1, last_sent_on: '2026-09-01' };
  const CRIMPY = { id: 'p2', name: 'Crimpy Corner', grade: 'V3', setter: 'Rob', notes: '', holds: [], send_count: 1, last_sent_on: '2026-09-02' };
  const TENSION = { id: 'p3', name: 'Tension Sucks', grade: 'V7', setter: 'Rob', notes: '', holds: [], send_count: 0, last_sent_on: null };
  const ROB_ON_GASTON = { id: 't1', problem_id: 'p1', sent_by: 'Rob', sent_on: '2026-09-01', created_at: '2026-09-01T10:00:00Z' };
  const SHAWN_ON_CRIMPY = { id: 't2', problem_id: 'p2', sent_by: 'Shawn', sent_on: '2026-09-02', created_at: '2026-09-02T10:00:00Z' };

  const asRob = () => {
    localStorage.setItem('board-app:currentClimberId', 'c1');
    listClimbers.mockResolvedValue([{ id: 'c1', name: 'Rob' }]);
  };

  it("hides only what you've sent, keeping problems only someone else has sent", async () => {
    asRob();
    listProblems.mockResolvedValue([GASTON, CRIMPY, TENSION]);
    listBoardTicks.mockResolvedValue([ROB_ON_GASTON, SHAWN_ON_CRIMPY]);
    render(<App />);
    const user = userEvent.setup();

    await screen.findByRole('button', { name: 'Climbing as Rob' });
    await user.click(screen.getByRole('button', { name: /unsent/i }));

    expect(listBoardTicks).toHaveBeenCalledWith('b1');
    expect(screen.queryByText('Gaston Traverse')).not.toBeInTheDocument();
    expect(screen.getByText('Crimpy Corner')).toBeInTheDocument();
    expect(screen.getByText('Tension Sucks')).toBeInTheDocument();
  });

  it('drops a problem from Unsent as soon as you log a send on it', async () => {
    asRob();
    listProblems.mockResolvedValue([CRIMPY, TENSION]);
    listBoardTicks.mockResolvedValue([SHAWN_ON_CRIMPY]);
    listTicks.mockResolvedValue([SHAWN_ON_CRIMPY]);
    createTick.mockResolvedValue({ id: 't3', problem_id: 'p2', sent_by: 'Rob', sent_on: '2026-10-13', notes: '', created_at: '2026-10-13T10:00:00Z' });
    render(<App />);
    const user = userEvent.setup();

    await screen.findByRole('button', { name: 'Climbing as Rob' });
    await user.click(screen.getByRole('button', { name: /unsent/i }));
    await user.click(screen.getByText('Crimpy Corner'));
    await user.click(await screen.findByText('Log a send'));
    await user.click(screen.getByText('Save entry'));
    await screen.findByText('Rob · 13 Oct 2026');
    await user.click(screen.getByRole('button', { name: /board/i }));

    expect(await screen.findByText('Tension Sucks')).toBeInTheDocument();
    expect(screen.queryByText('Crimpy Corner')).not.toBeInTheDocument();
  });

  it("puts a problem back in Unsent when you delete your only send, even though someone else's still stands", async () => {
    asRob();
    const shawnOnGaston = { id: 't9', problem_id: 'p1', sent_by: 'Shawn', sent_on: '2026-09-03', created_at: '2026-09-03T10:00:00Z' };
    listProblems.mockResolvedValue([{ ...GASTON, send_count: 2 }, TENSION]);
    listBoardTicks.mockResolvedValue([ROB_ON_GASTON, shawnOnGaston]);
    listTicks.mockResolvedValue([shawnOnGaston, ROB_ON_GASTON]);
    render(<App />);
    const user = userEvent.setup();

    await user.click(await screen.findByText('Gaston Traverse'));
    await screen.findByText(/Rob · 1 Sept? 2026/);
    await user.click(screen.getAllByLabelText('Delete entry')[1]);
    await waitFor(() => expect(deleteTick).toHaveBeenCalledWith('t1'));
    await user.click(screen.getByRole('button', { name: /board/i }));
    await user.click(await screen.findByRole('button', { name: /unsent/i }));

    expect(screen.getByText('Gaston Traverse')).toBeInTheDocument();
  });

  it('picks up sends logged on another phone when the list refreshes', async () => {
    asRob();
    listProblems.mockResolvedValue([GASTON, TENSION]);
    listBoardTicks.mockResolvedValueOnce([]).mockResolvedValue([ROB_ON_GASTON]);
    render(<App />);
    const user = userEvent.setup();

    await screen.findByRole('button', { name: 'Climbing as Rob' });
    await user.click(screen.getByRole('button', { name: /unsent/i }));
    expect(screen.getByText('Gaston Traverse')).toBeInTheDocument();

    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));

    await waitFor(() => expect(screen.queryByText('Gaston Traverse')).not.toBeInTheDocument());
    delete document.visibilityState;
  });
});

describe('App (edit flow)', () => {
  it("edits a problem's details without touching its holds or loading highlight mode", async () => {
    listProblems.mockResolvedValue([
      {
        id: 'p1', name: 'Gaston Traverse', grade: 'V5', setter: 'Rob', notes: 'crimpy',
        holds: [{ x: 0.2, y: 0.3, type: 'start' }],
      },
    ]);
    getOrCreateBoard.mockResolvedValue({ id: 'b1', name: 'Home Board', photo_url: 'https://cdn.example/b1.jpg' });
    updateProblem.mockResolvedValue({
      id: 'p1', name: 'Gaston Traverse v2', grade: 'V6', setter: 'Rob', notes: 'crimpy',
      holds: [{ x: 0.2, y: 0.3, type: 'start' }],
    });
    render(<App />);
    const user = userEvent.setup();

    await user.click(await screen.findByText('Gaston Traverse'));
    await user.click(await screen.findByRole('button', { name: 'Edit details' }));

    expect(screen.queryByRole('button', { name: 'start' })).not.toBeInTheDocument();
    const nameInput = await screen.findByDisplayValue('Gaston Traverse');
    await user.clear(nameInput);
    await user.type(nameInput, 'Gaston Traverse v2');
    await user.selectOptions(screen.getByRole('combobox', { name: /grade/i }), 'V6');
    await user.click(screen.getByText('Save changes'));

    await waitFor(() =>
      expect(updateProblem).toHaveBeenCalledWith('p1', {
        name: 'Gaston Traverse v2', grade: 'V6', setter: 'Rob', notes: 'crimpy',
      })
    );
    expect(loadSegmenter).not.toHaveBeenCalled();
    expect(uploadProblemMask).not.toHaveBeenCalled();
    expect(await screen.findByText('Gaston Traverse v2')).toBeInTheDocument();
  });

  it("edits a problem's holds without showing its details form, keeping the details as they were", async () => {
    listProblems.mockResolvedValue([
      {
        id: 'p1', name: 'Gaston Traverse', grade: 'V5', setter: 'Rob', notes: 'crimpy',
        holds: [{ x: 0.2, y: 0.3, type: 'start' }],
      },
    ]);
    getOrCreateBoard.mockResolvedValue({ id: 'b1', name: 'Home Board', photo_url: 'https://cdn.example/b1.jpg' });
    updateProblem.mockResolvedValue({
      id: 'p1', name: 'Gaston Traverse', grade: 'V5', setter: 'Rob', notes: 'crimpy',
      holds: [{ x: 0.2, y: 0.3, type: 'start' }, { x: 0.75, y: 0.8, type: 'start' }],
    });
    render(<App />);
    const user = userEvent.setup();

    await user.click(await screen.findByText('Gaston Traverse'));
    await user.click(await screen.findByRole('button', { name: 'Edit holds' }));

    expect(screen.queryByPlaceholderText('e.g. Gaston Traverse')).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: /grade/i })).not.toBeInTheDocument();

    const photo = await screen.findByAltText('Climbing board');
    vi.spyOn(photo.parentElement, 'getBoundingClientRect').mockReturnValue({
      left: 0, top: 0, width: 200, height: 100, right: 200, bottom: 100,
    });
    fireEvent.click(photo.parentElement, { clientX: 150, clientY: 80 });
    await user.click(screen.getByText('Save changes'));

    await waitFor(() =>
      expect(updateProblem).toHaveBeenCalledWith('p1', {
        name: 'Gaston Traverse', grade: 'V5', setter: 'Rob', notes: 'crimpy',
        holds: [{ x: 0.2, y: 0.3, type: 'start' }, { x: 0.75, y: 0.8, type: 'start' }],
      })
    );
  });

  it('adds a hold when tapping empty space on the photo while editing', async () => {
    listProblems.mockResolvedValue([
      {
        id: 'p1', name: 'Gaston Traverse', grade: 'V5', setter: 'Rob', notes: '',
        holds: [{ x: 0.2, y: 0.3, type: 'start' }],
      },
    ]);
    getOrCreateBoard.mockResolvedValue({ id: 'b1', name: 'Home Board', photo_url: 'https://cdn.example/b1.jpg' });
    render(<App />);
    const user = userEvent.setup();

    await user.click(await screen.findByText('Gaston Traverse'));
    await user.click(await screen.findByRole('button', { name: 'Edit holds' }));

    const photo = await screen.findByAltText('Climbing board');
    vi.spyOn(photo.parentElement, 'getBoundingClientRect').mockReturnValue({
      left: 0, top: 0, width: 200, height: 100, right: 200, bottom: 100,
    });
    expect(screen.getAllByTestId('hold-marker')).toHaveLength(1);

    fireEvent.click(photo.parentElement, { clientX: 150, clientY: 80 });

    expect(screen.getAllByTestId('hold-marker')).toHaveLength(2);
  });

  it('removes a hold when tapping directly on it while editing, instead of adding a new one', async () => {
    listProblems.mockResolvedValue([
      {
        id: 'p1', name: 'Gaston Traverse', grade: 'V5', setter: 'Rob', notes: '',
        holds: [{ x: 0.2, y: 0.3, type: 'start' }],
      },
    ]);
    getOrCreateBoard.mockResolvedValue({ id: 'b1', name: 'Home Board', photo_url: 'https://cdn.example/b1.jpg' });
    render(<App />);
    const user = userEvent.setup();

    await user.click(await screen.findByText('Gaston Traverse'));
    await user.click(await screen.findByRole('button', { name: 'Edit holds' }));

    const photo = await screen.findByAltText('Climbing board');
    vi.spyOn(photo.parentElement, 'getBoundingClientRect').mockReturnValue({
      left: 0, top: 0, width: 200, height: 100, right: 200, bottom: 100,
    });
    expect(screen.getAllByTestId('hold-marker')).toHaveLength(1);

    fireEvent.click(photo.parentElement, { clientX: 40, clientY: 30 });

    expect(screen.queryByTestId('hold-marker')).not.toBeInTheDocument();
  });

  it('clears the stale hold overlay after finishing an edit and returning to the list', async () => {
    listProblems.mockResolvedValue([
      {
        id: 'p1', name: 'Gaston Traverse', grade: 'V5', setter: 'Rob', notes: 'crimpy',
        holds: [{ x: 0.2, y: 0.3, type: 'start' }],
      },
    ]);
    getOrCreateBoard.mockResolvedValue({ id: 'b1', name: 'Home Board', photo_url: 'https://cdn.example/b1.jpg' });
    updateProblem.mockResolvedValue({
      id: 'p1', name: 'Gaston Traverse', grade: 'V5', setter: 'Rob', notes: 'crimpy',
      holds: [{ x: 0.2, y: 0.3, type: 'start' }],
    });
    render(<App />);
    const user = userEvent.setup();

    await user.click(await screen.findByText('Gaston Traverse'));
    await user.click(await screen.findByRole('button', { name: 'Edit holds' }));
    await user.click(screen.getByText('Save changes'));

    expect(await screen.findByText('THE BOARD')).toBeInTheDocument();
    expect(
      screen.getByAltText('Climbing board').parentElement.querySelectorAll('svg circle')
    ).toHaveLength(0);
  });
});

describe('App (tick log flow)', () => {
  it('shows "Not sent yet" for a problem with no log entries', async () => {
    listProblems.mockResolvedValue([
      { id: 'p1', name: 'Gaston Traverse', grade: 'V5', setter: 'Rob', notes: '', holds: [], send_count: 0, last_sent_on: null },
    ]);
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByText('Gaston Traverse'));

    expect(await screen.findByText('Not sent yet')).toBeInTheDocument();
  });

  it('gates logging a send behind selecting a climber first', async () => {
    listProblems.mockResolvedValue([
      { id: 'p1', name: 'Gaston Traverse', grade: 'V5', setter: '', notes: '', holds: [], send_count: 0, last_sent_on: null },
    ]);
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByText('Gaston Traverse'));

    expect(await screen.findByText('Select who you are to log a send')).toBeInTheDocument();
    expect(screen.queryByText('Log a send')).not.toBeInTheDocument();
  });

  it('logs a send attributed to the current climber', async () => {
    localStorage.setItem('board-app:currentClimberId', 'c1');
    listClimbers.mockResolvedValue([{ id: 'c1', name: 'Rob' }]);
    listProblems.mockResolvedValue([
      { id: 'p1', name: 'Gaston Traverse', grade: 'V5', setter: '', notes: '', holds: [], send_count: 0, last_sent_on: null },
    ]);
    createTick.mockResolvedValue({ id: 't1', problem_id: 'p1', sent_on: '2026-08-22', notes: 'felt easy', sent_by: 'Rob' });
    const user = userEvent.setup();
    render(<App />);

    await screen.findByRole('button', { name: 'Climbing as Rob' });
    await user.click(await screen.findByText('Gaston Traverse'));
    await user.click(await screen.findByText('Log a send'));
    fireEvent.change(screen.getByLabelText('Send date'), { target: { value: '2026-08-22' } });
    await user.type(screen.getByLabelText('Send notes'), 'felt easy');
    await user.click(screen.getByText('Save entry'));

    await waitFor(() =>
      expect(createTick).toHaveBeenCalledWith('p1', { sentOn: '2026-08-22', notes: 'felt easy', sentBy: 'Rob', flash: false })
    );
    expect(await screen.findByText('Sent ×1')).toBeInTheDocument();
    expect(screen.getByText('Rob · 22 Aug 2026')).toBeInTheDocument();
  });

  it('shows a log entry with no name when sent_by is absent', async () => {
    listProblems.mockResolvedValue([
      { id: 'p1', name: 'Gaston Traverse', grade: 'V5', setter: '', notes: '', holds: [], send_count: 1, last_sent_on: '2026-08-01' },
    ]);
    listTicks.mockResolvedValue([{ id: 't1', problem_id: 'p1', sent_on: '2026-08-01', notes: '' }]);
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByText('Gaston Traverse'));

    expect(await screen.findByText('1 Aug 2026')).toBeInTheDocument();
  });

  it('attributes sends correctly after switching to a different climber', async () => {
    listClimbers.mockResolvedValue([{ id: 'c1', name: 'Rob' }, { id: 'c2', name: 'Alex' }]);
    listProblems.mockResolvedValue([
      { id: 'p1', name: 'Gaston Traverse', grade: 'V5', setter: '', notes: '', holds: [], send_count: 0, last_sent_on: null },
    ]);
    createTick
      .mockResolvedValueOnce({ id: 't1', problem_id: 'p1', sent_on: '2026-08-22', notes: '', sent_by: 'Rob' })
      .mockResolvedValueOnce({ id: 't2', problem_id: 'p1', sent_on: '2026-08-23', notes: '', sent_by: 'Alex' });
    listTicks
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 't1', problem_id: 'p1', sent_on: '2026-08-22', notes: '', sent_by: 'Rob' }]);
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByText("Who's climbing?"));
    await user.click(await screen.findByText('Rob'));
    await user.click(await screen.findByText('Gaston Traverse'));
    await user.click(await screen.findByText('Log a send'));
    fireEvent.change(screen.getByLabelText('Send date'), { target: { value: '2026-08-22' } });
    await user.click(screen.getByText('Save entry'));
    await waitFor(() =>
      expect(createTick).toHaveBeenCalledWith('p1', { sentOn: '2026-08-22', notes: '', sentBy: 'Rob', flash: false })
    );

    await user.click(screen.getByText('Board'));
    await user.click(screen.getByRole('button', { name: 'Climbing as Rob' }));
    await user.click(await screen.findByText('Alex'));
    await user.click(await screen.findByText('Gaston Traverse'));
    await user.click(await screen.findByText('Log a send'));
    fireEvent.change(screen.getByLabelText('Send date'), { target: { value: '2026-08-23' } });
    await user.click(screen.getByText('Save entry'));
    await waitFor(() =>
      expect(createTick).toHaveBeenCalledWith('p1', { sentOn: '2026-08-23', notes: '', sentBy: 'Alex', flash: false })
    );

    expect(screen.getByText('Rob · 22 Aug 2026')).toBeInTheDocument();
    expect(screen.getByText('Alex · 23 Aug 2026')).toBeInTheDocument();
  });

  it('marks the earliest logged entry as the first send and later ones as repeats', async () => {
    listProblems.mockResolvedValue([
      { id: 'p1', name: 'Gaston Traverse', grade: 'V5', setter: 'Rob', notes: '', holds: [], send_count: 2, last_sent_on: '2026-08-20' },
    ]);
    listTicks.mockResolvedValue([
      { id: 't2', problem_id: 'p1', sent_on: '2026-08-20', notes: '' },
      { id: 't1', problem_id: 'p1', sent_on: '2026-08-01', notes: '' },
    ]);
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByText('Gaston Traverse'));

    const firstEntry = (await screen.findByText('1 Aug 2026')).closest('div');
    const repeatEntry = screen.getByText('20 Aug 2026').closest('div');
    expect(firstEntry).toHaveTextContent('First send');
    expect(repeatEntry).toHaveTextContent('Repeat');
  });

  it('keeps first send on whoever logged first when two sends share the same date', async () => {
    listProblems.mockResolvedValue([
      { id: 'p1', name: 'Gaston Traverse', grade: 'V5', setter: 'Rob', notes: '', holds: [], send_count: 2, last_sent_on: '2026-08-20' },
    ]);
    // Same sent_on date for both -- order here deliberately puts the later
    // logger (Alex) first, mirroring how Postgres/local state can return
    // same-date ticks in either order. Rob logged it into the app first
    // (earlier created_at) and should keep the "First send" tag.
    listTicks.mockResolvedValue([
      { id: 't2', problem_id: 'p1', sent_on: '2026-08-20', notes: '', sent_by: 'Alex', created_at: '2026-08-20T15:00:00Z' },
      { id: 't1', problem_id: 'p1', sent_on: '2026-08-20', notes: '', sent_by: 'Rob', created_at: '2026-08-20T09:00:00Z' },
    ]);
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByText('Gaston Traverse'));

    const robEntry = (await screen.findByText('Rob · 20 Aug 2026')).closest('div');
    const alexEntry = screen.getByText('Alex · 20 Aug 2026').closest('div');
    expect(robEntry).toHaveTextContent('First send');
    expect(alexEntry).toHaveTextContent('Repeat');
  });

  it('deletes a log entry from the detail view', async () => {
    listProblems.mockResolvedValue([
      { id: 'p1', name: 'Gaston Traverse', grade: 'V5', setter: 'Rob', notes: '', holds: [], send_count: 1, last_sent_on: '2026-08-01' },
    ]);
    listTicks.mockResolvedValue([{ id: 't1', problem_id: 'p1', sent_on: '2026-08-01', notes: 'beta' }]);
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByText('Gaston Traverse'));
    expect(await screen.findByText('1 Aug 2026')).toBeInTheDocument();
    await user.click(screen.getByLabelText('Delete entry'));

    await waitFor(() => expect(deleteTick).toHaveBeenCalledWith('t1'));
    expect(screen.queryByText('1 Aug 2026')).not.toBeInTheDocument();
  });

  it('shows a sent count badge in the problem list', async () => {
    listProblems.mockResolvedValue([
      { id: 'p1', name: 'Gaston Traverse', grade: 'V5', setter: 'Rob', notes: '', holds: [], send_count: 3, last_sent_on: '2026-08-20' },
    ]);
    render(<App />);

    expect(await screen.findByText('Sent ×3')).toBeInTheDocument();
  });
});

describe('App (rating flow)', () => {
  it('shows a saved rating in the problem list', async () => {
    listProblems.mockResolvedValue([
      { id: 'p1', name: 'Gaston Traverse', grade: 'V5', setter: 'Rob', notes: '', holds: [], rating: 4 },
    ]);
    render(<App />);

    expect(await screen.findByLabelText('Rating: 4 out of 5')).toBeInTheDocument();
  });
});

describe('App (votes)', () => {
  const GASTON = { id: 'p1', name: 'Gaston Traverse', grade: 'V5', setter: 'Rob', notes: '', holds: [], rating: null, send_count: 2, last_sent_on: '2026-10-02' };
  const ROB_SEND = { id: 't1', problem_id: 'p1', sent_by: 'Rob', sent_on: '2026-10-01', notes: '', created_at: '2026-10-01T18:00:00Z', flash: false };
  const SHAWN_SEND = { id: 't2', problem_id: 'p1', sent_by: 'Shawn', sent_on: '2026-10-02', notes: '', created_at: '2026-10-02T18:00:00Z', flash: false };
  const ROB_VOTE = { id: 'v1', problem_id: 'p1', climber: 'Rob', grade: 'V4', stars: 4, created_at: '2026-10-01T18:00:00Z' };
  const SHAWN_VOTE = { id: 'v2', problem_id: 'p1', climber: 'Shawn', grade: 'V5', stars: 5, created_at: '2026-10-02T18:00:00Z' };
  const asRob = () => {
    localStorage.setItem('board-app:currentClimberId', 'c1');
    listClimbers.mockResolvedValue([{ id: 'c1', name: 'Rob' }, { id: 'c2', name: 'Shawn' }]);
  };

  const openGaston = async ({ ticks = [ROB_SEND, SHAWN_SEND], votes = [ROB_VOTE, SHAWN_VOTE] } = {}) => {
    asRob();
    listProblems.mockResolvedValue([GASTON]);
    listBoardTicks.mockResolvedValue(ticks);
    listTicks.mockResolvedValue(ticks);
    listBoardVotes.mockResolvedValue(votes);
    render(<App />);
    const user = userEvent.setup();
    await screen.findByRole('button', { name: 'Climbing as Rob' });
    await user.click(await screen.findByText('Gaston Traverse'));
    await screen.findByText('Log a send');
    return user;
  };

  it('shows the average and how many votes, with the grade votes beside the grade', async () => {
    await openGaston();
    expect(screen.getByText('4.5 · 2 votes')).toBeInTheDocument();
    expect(screen.getByText('Grade votes: V4 ×1 · V5 ×1')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Rate \d star/ })).not.toBeInTheDocument();
  });

  it('shows an old rating with no vote count', async () => {
    listProblems.mockResolvedValue([{ ...GASTON, rating: 3 }]);
    render(<App />);
    const user = userEvent.setup();
    await user.click(await screen.findByText('Gaston Traverse'));
    expect(await screen.findAllByLabelText('Rating: 3 out of 5')).not.toHaveLength(0);
    expect(screen.queryByText(/votes?$/)).not.toBeInTheDocument();
  });

  it("doesn't offer Your vote to a climber who hasn't sent it", async () => {
    await openGaston({ ticks: [SHAWN_SEND] });
    expect(screen.queryByRole('heading', { name: 'Your vote' })).not.toBeInTheDocument();
  });

  it('saves a vote change straight away and updates the grade votes', async () => {
    const user = await openGaston();
    expect(screen.getByRole('heading', { name: 'Your vote' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'V4' })).toHaveAttribute('aria-pressed', 'true');
    saveVote.mockResolvedValue({ ...ROB_VOTE, grade: 'V5' });
    await user.click(screen.getByRole('button', { name: 'V5' }));
    expect(saveVote).toHaveBeenCalledWith('p1', 'Rob', { grade: 'V5', stars: 4 });
    expect(await screen.findByText('Grade votes: V5 ×2')).toBeInTheDocument();
  });

  it('removes the vote when both are unpicked', async () => {
    const user = await openGaston({ votes: [{ ...ROB_VOTE, stars: null }, SHAWN_VOTE] });
    saveVote.mockResolvedValue(null);
    await user.click(screen.getByRole('button', { name: 'V4' }));
    expect(saveVote).toHaveBeenCalledWith('p1', 'Rob', { grade: null, stars: null });
    expect(await screen.findByText('Grade votes: V5 ×1')).toBeInTheDocument();
  });

  it('disables the vote while a save is in flight, so a double tap sends one save', async () => {
    const user = await openGaston();
    let finish;
    saveVote.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    await user.click(screen.getByRole('button', { name: 'V6' }));
    expect(screen.getByRole('button', { name: 'V5' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'V5' }));
    expect(saveVote).toHaveBeenCalledTimes(1);
    await act(async () => finish({ ...ROB_VOTE, grade: 'V6' }));
    expect(screen.getByRole('button', { name: 'V5' })).toBeEnabled();
  });

  it('says so when a vote fails to save', async () => {
    const user = await openGaston();
    saveVote.mockRejectedValue(new Error('down'));
    await user.click(screen.getByRole('button', { name: '1 star' }));
    expect(await screen.findByText('Could not save your vote — check your connection and try again.')).toBeInTheDocument();
  });

  it('stops counting your vote as soon as you delete your only send', async () => {
    const user = await openGaston();
    deleteTick.mockResolvedValue();
    let robEntry = screen.getByText(/^Rob · /);
    while (!within(robEntry).queryByRole('button', { name: 'Delete entry' })) robEntry = robEntry.parentElement;
    await user.click(within(robEntry).getByRole('button', { name: 'Delete entry' }));
    expect(await screen.findByText('5.0 · 1 vote')).toBeInTheDocument();
    expect(screen.getByText('Grade votes: V5 ×1')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Your vote' })).not.toBeInTheDocument();
  });

  it('shows the average of the votes in the list, to the nearest half star', async () => {
    listProblems.mockResolvedValue([GASTON]);
    listBoardTicks.mockResolvedValue([ROB_SEND, SHAWN_SEND]);
    listBoardVotes.mockResolvedValue([ROB_VOTE, SHAWN_VOTE]);
    render(<App />);
    expect(await screen.findByLabelText('Rating: 4.5 out of 5')).toBeInTheDocument();
  });

  it('ignores a vote from someone with no send logged, keeping the old rating', async () => {
    listProblems.mockResolvedValue([{ ...GASTON, rating: 2 }]);
    listBoardTicks.mockResolvedValue([ROB_SEND]);
    listBoardVotes.mockResolvedValue([SHAWN_VOTE]);
    render(<App />);
    expect(await screen.findByLabelText('Rating: 2 out of 5')).toBeInTheDocument();
  });

  it("fails the load when the votes can't be read", async () => {
    listBoardVotes.mockRejectedValue(new Error('down'));
    render(<App />);
    expect(await screen.findByText('Could not load the board — check your connection and try again.')).toBeInTheDocument();
  });

  it('picks up votes cast on another phone when the list refreshes', async () => {
    asRob();
    listProblems.mockResolvedValue([GASTON]);
    listBoardTicks.mockResolvedValue([ROB_SEND, SHAWN_SEND]);
    listBoardVotes.mockResolvedValueOnce([]).mockResolvedValue([SHAWN_VOTE]);
    render(<App />);
    await screen.findByRole('button', { name: 'Climbing as Rob' });
    expect(screen.queryByLabelText(/^Rating:/)).not.toBeInTheDocument();

    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));

    expect(await screen.findByLabelText('Rating: 5 out of 5')).toBeInTheDocument();
    delete document.visibilityState;
  });
});

describe('App (climber picker)', () => {
  it('shows a prompt to pick a climber when none is selected', async () => {
    render(<App />);
    expect(await screen.findByText("Who's climbing?")).toBeInTheDocument();
  });

  it('lists fetched climbers in the panel and selects one', async () => {
    listClimbers.mockResolvedValue([{ id: 'c1', name: 'Alice' }, { id: 'c2', name: 'Bob' }]);
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByText("Who's climbing?"));
    await user.click(await screen.findByText('Bob'));

    expect(await screen.findByRole('button', { name: 'Climbing as Bob' })).toBeInTheDocument();
    expect(localStorage.getItem('board-app:currentClimberId')).toBe('c2');
  });

  it('adds a new climber and selects it immediately', async () => {
    createClimber.mockResolvedValue({ id: 'c3', name: 'Charlie' });
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByText("Who's climbing?"));
    await user.type(screen.getByLabelText('New climber name'), 'Charlie');
    await user.click(screen.getByText('Add'));

    await waitFor(() => expect(createClimber).toHaveBeenCalledWith('Charlie'));
    expect(await screen.findByRole('button', { name: 'Climbing as Charlie' })).toBeInTheDocument();
  });

  it('restores a previously selected climber from localStorage on load', async () => {
    localStorage.setItem('board-app:currentClimberId', 'c1');
    listClimbers.mockResolvedValue([{ id: 'c1', name: 'Alice' }]);
    render(<App />);

    expect(await screen.findByRole('button', { name: 'Climbing as Alice' })).toBeInTheDocument();
  });

  it('ignores a stored climber id that no longer matches any fetched climber', async () => {
    localStorage.setItem('board-app:currentClimberId', 'ghost');
    listClimbers.mockResolvedValue([{ id: 'c1', name: 'Alice' }]);
    render(<App />);

    expect(await screen.findByText("Who's climbing?")).toBeInTheDocument();
  });
  it('shows just your name on the pill, beside the logbook and board stats buttons', async () => {
    localStorage.setItem('board-app:currentClimberId', 'c1');
    listClimbers.mockResolvedValue([{ id: 'c1', name: 'Rob' }]);
    render(<App />);
    const pill = await screen.findByRole('button', { name: 'Climbing as Rob' });
    expect(pill.textContent).toBe('Rob');
    expect(screen.getByRole('button', { name: 'Logbook' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Board stats' })).toBeInTheDocument();
  });
  it("never cuts off Who's climbing?, so it can still be read and tapped", async () => {
    render(<App />);
    const prompt = await screen.findByText("Who's climbing?");
    expect(prompt).not.toHaveStyle({ maxWidth: '120px' });
    expect(prompt).not.toHaveStyle({ textOverflow: 'ellipsis' });
  });

  // Too wide for the row beside the filters, the group drops a line. Sized to
  // its content, it then starts on the left under the filters instead of being
  // stretched across and pushed to the right.
  it("drops the buttons under the filters on the left when Who's climbing? doesn't fit", async () => {
    render(<App />);
    await screen.findByText("Who's climbing?");
    const group = screen.getByRole('button', { name: 'Logbook' }).parentElement;
    expect(group).toHaveStyle({ flexGrow: '0', flexShrink: '0', flexBasis: 'auto' });
  });

  it('keeps a picked climber beside the filters, the group taking the rest of the row', async () => {
    localStorage.setItem('board-app:currentClimberId', 'c1');
    listClimbers.mockResolvedValue([{ id: 'c1', name: 'Rob' }]);
    render(<App />);
    await screen.findByRole('button', { name: 'Climbing as Rob' });
    const group = screen.getByRole('button', { name: 'Logbook' }).parentElement;
    expect(group).toHaveStyle({ flexGrow: '1', flexShrink: '1', flexBasis: '0px' });
  });

  it('cuts off only a long climber name, which gives way before the row would wrap', async () => {
    localStorage.setItem('board-app:currentClimberId', 'c1');
    listClimbers.mockResolvedValue([{ id: 'c1', name: 'Bartholomew-Smythe' }]);
    render(<App />);
    const pill = await screen.findByRole('button', { name: 'Climbing as Bartholomew-Smythe' });
    expect(pill).toHaveStyle({ maxWidth: '120px', textOverflow: 'ellipsis' });
  });
});

describe('App (flash)', () => {
  const GASTON = { id: 'p1', name: 'Gaston Traverse', grade: 'V5', setter: 'Rob', notes: '', holds: [], send_count: 0, last_sent_on: null };
  const SHAWN_FIRST = { id: 't2', problem_id: 'p1', sent_by: 'Shawn', sent_on: '2026-08-05', notes: '', created_at: '2026-08-05T10:00:00Z', flash: false };
  const ROB_FIRST = { id: 't1', problem_id: 'p1', sent_by: 'Rob', sent_on: '2026-08-01', notes: '', created_at: '2026-08-01T10:00:00Z', flash: false };
  const ROB_REPEAT = { id: 't3', problem_id: 'p1', sent_by: 'Rob', sent_on: '2026-08-10', notes: '', created_at: '2026-08-10T10:00:00Z', flash: false };

  const asRob = () => {
    localStorage.setItem('board-app:currentClimberId', 'c1');
    listClimbers.mockResolvedValue([{ id: 'c1', name: 'Rob' }]);
  };
  const entry = (text) => screen.getByText(text).closest('div');

  it("offers Flashed it on your first go, even after someone else's send, and it shows in your logbook", async () => {
    asRob();
    listProblems.mockResolvedValue([{ ...GASTON, send_count: 1 }]);
    listBoardTicks.mockResolvedValue([SHAWN_FIRST]);
    listTicks.mockResolvedValue([SHAWN_FIRST]);
    createTick.mockImplementation(async (problemId, { sentOn, notes, sentBy, flash }) => ({
      id: 't9', problem_id: problemId, sent_on: sentOn, notes, sent_by: sentBy, flash, created_at: '2026-10-13T10:00:00Z',
    }));
    render(<App />);
    const user = userEvent.setup();

    await user.click(await screen.findByText('Gaston Traverse'));
    await user.click(await screen.findByText('Log a send'));
    fireEvent.change(screen.getByLabelText('Send date'), { target: { value: '2026-08-22' } });
    await user.click(screen.getByLabelText('Flashed it'));
    await user.click(screen.getByText('Save entry'));

    await waitFor(() =>
      expect(createTick).toHaveBeenCalledWith('p1', { sentOn: '2026-08-22', notes: '', sentBy: 'Rob', flash: true })
    );
    expect(within(entry('Rob · 22 Aug 2026')).getByText('Flash')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /board/i }));
    await user.click(await screen.findByRole('button', { name: 'Logbook' }));
    await user.click(screen.getByRole('button', { name: /Sat 22 Aug.*1 problem · 1 new · 1 flash/ }));
    expect(within(screen.getByRole('listitem')).getByText('Flash')).toBeInTheDocument();
  });

  it("doesn't offer Flashed it once you've already sent the problem", async () => {
    asRob();
    listProblems.mockResolvedValue([{ ...GASTON, send_count: 1 }]);
    listTicks.mockResolvedValue([ROB_FIRST]);
    render(<App />);
    const user = userEvent.setup();

    await user.click(await screen.findByText('Gaston Traverse'));
    await user.click(await screen.findByText('Log a send'));
    expect(screen.getByLabelText('Send date')).toBeInTheDocument();
    expect(screen.queryByLabelText('Flashed it')).not.toBeInTheDocument();
  });

  it('shows a Flash badge only on sends that were flashed, with nothing to toggle', async () => {
    asRob();
    listProblems.mockResolvedValue([{ ...GASTON, send_count: 3 }]);
    listTicks.mockResolvedValue([ROB_REPEAT, SHAWN_FIRST, { ...ROB_FIRST, flash: true }]);
    render(<App />);
    const user = userEvent.setup();

    await user.click(await screen.findByText('Gaston Traverse'));
    await screen.findByText('Rob · 1 Aug 2026');
    expect(screen.getAllByText('Flash')).toHaveLength(1);
    expect(within(entry('Rob · 1 Aug 2026')).getByText('Flash')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /flash/i })).not.toBeInTheDocument();
  });

  it("doesn't call a send a flash once an earlier send by the same climber is logged", async () => {
    asRob();
    listProblems.mockResolvedValue([{ ...GASTON, send_count: 2 }]);
    listTicks.mockResolvedValue([{ ...ROB_REPEAT, flash: true }, ROB_FIRST]);
    render(<App />);
    const user = userEvent.setup();

    await user.click(await screen.findByText('Gaston Traverse'));
    await screen.findByText('Rob · 10 Aug 2026');
    expect(screen.queryByText('Flash')).not.toBeInTheDocument();
  });
});

describe('App (logbook)', () => {
  const PROBLEMS = [
    { id: 'p1', name: 'Gaston Traverse', grade: 'V5', setter: 'Rob', notes: '', holds: [], send_count: 1, last_sent_on: '2026-09-01' },
    { id: 'p2', name: 'Crimpy Corner', grade: 'V3', setter: 'Rob', notes: '', holds: [], send_count: 2, last_sent_on: '2026-09-08' },
    { id: 'p3', name: 'Jug Haul', grade: 'V2', setter: 'Rob', notes: '', holds: [], send_count: 1, last_sent_on: '2026-09-08' },
  ];
  const TICKS = [
    { id: 't1', problem_id: 'p2', sent_by: 'Rob', sent_on: '2026-09-01', created_at: '2026-09-01T10:00:00Z', flash: true },
    { id: 't2', problem_id: 'p1', sent_by: 'Rob', sent_on: '2026-09-01', created_at: '2026-09-01T10:30:00Z', flash: false },
    { id: 't3', problem_id: 'p2', sent_by: 'Rob', sent_on: '2026-09-08', created_at: '2026-09-08T10:00:00Z', flash: false },
    { id: 't4', problem_id: 'p3', sent_by: 'Shawn', sent_on: '2026-09-08', created_at: '2026-09-08T11:00:00Z', flash: false },
  ];

  const openAs = async (name) => {
    localStorage.setItem('board-app:currentClimberId', 'c1');
    listClimbers.mockResolvedValue([{ id: 'c1', name }]);
    listProblems.mockResolvedValue(PROBLEMS);
    listBoardTicks.mockResolvedValue(TICKS);
    render(<App />);
    const user = userEvent.setup();
    await screen.findByRole("button", { name: `Climbing as ${name}` });
    await user.click(screen.getByRole('button', { name: 'Logbook' }));
    return user;
  };
  const day = (label) => screen.getByRole('button', { name: new RegExp(label) });
  const DAY_ROW = /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun) \d/;

  it('opens from beside the climber pill with every day collapsed, newest first', async () => {
    await openAs('Rob');

    expect(screen.getByText("Rob's logbook")).toBeInTheDocument();
    expect(screen.getByText('2 sessions · 3 sends')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'September 2026' })).toBeInTheDocument();
    const days = screen.getAllByRole('button', { name: DAY_ROW });
    expect(days.map((d) => d.textContent)).toEqual([
      'Tue 8 Sept1 problem',
      'Tue 1 Sept2 problems · 2 new · 1 flash',
    ]);
    days.forEach((d) => expect(d).toHaveAttribute('aria-expanded', 'false'));
    expect(screen.queryByText('Gaston Traverse')).not.toBeInTheDocument();
    expect(screen.queryByText('No board photo yet')).not.toBeInTheDocument();
  });

  it('puts a heading above each month, newest first, and shows flashes as a bolt and a count', async () => {
    listBoardTicks.mockResolvedValue([
      ...TICKS,
      { id: 't9', problem_id: 'p3', sent_by: 'Rob', sent_on: '2026-10-02', created_at: '2026-10-02T10:00:00Z', flash: true },
    ]);
    localStorage.setItem('board-app:currentClimberId', 'c1');
    listClimbers.mockResolvedValue([{ id: 'c1', name: 'Rob' }]);
    listProblems.mockResolvedValue(PROBLEMS);
    render(<App />);
    const user = userEvent.setup();
    await screen.findByRole('button', { name: 'Climbing as Rob' });
    await user.click(screen.getByRole('button', { name: 'Logbook' }));

    expect(screen.getAllByRole('heading', { name: /^(October|September) 2026$/ }).map((h) => h.textContent))
      .toEqual(['October 2026', 'September 2026']);
    const october = screen.getByRole('button', { name: /^Fri 2 Oct/ });
    expect(october.textContent).toBe('Fri 2 Oct1 problem · 1 new · 1 flash');
    expect(october.querySelector('svg')).not.toBeNull();
  });

  it('opens a day to show what you logged that session, marking first sends and flashes', async () => {
    const user = await openAs('Rob');

    await user.click(day('Tue 1 Sept'));
    expect(day('Tue 1 Sept')).toHaveAttribute('aria-expanded', 'true');
    const rows = screen.getAllByRole('listitem');
    expect(rows).toHaveLength(2);
    expect(within(rows[0]).getByText('Crimpy Corner')).toBeInTheDocument();
    expect(within(rows[0]).getByText('V3')).toBeInTheDocument();
    expect(within(rows[0]).getByText('New')).toBeInTheDocument();
    expect(within(rows[0]).getByText('Flash')).toBeInTheDocument();
    expect(within(rows[1]).getByText('Gaston Traverse')).toBeInTheDocument();
    expect(within(rows[1]).getByText('New')).toBeInTheDocument();
    expect(within(rows[1]).queryByText('Flash')).not.toBeInTheDocument();
    expect(day('Tue 8 Sept')).toHaveAttribute('aria-expanded', 'false');

    await user.click(day('Tue 1 Sept'));
    expect(screen.queryAllByRole('listitem')).toHaveLength(0);
  });

  it("doesn't mark a repeat as new", async () => {
    const user = await openAs('Rob');

    await user.click(day('Tue 8 Sept'));
    const row = screen.getByRole('listitem');
    expect(within(row).getByText('Crimpy Corner')).toBeInTheDocument();
    expect(within(row).queryByText('New')).not.toBeInTheDocument();
  });

  it('opens a problem from a day, and comes back to the logbook with the same days open', async () => {
    listTicks.mockResolvedValue([TICKS[1]]);
    const user = await openAs('Rob');

    await user.click(day('Tue 8 Sept'));
    await user.click(day('Tue 1 Sept'));
    await user.click(screen.getByRole('button', { name: /Gaston Traverse/ }));
    expect(await screen.findByText('Log a send')).toBeInTheDocument();
    expect(listTicks).toHaveBeenCalledWith('p1');

    await user.click(screen.getByRole('button', { name: /logbook/i }));
    expect(screen.getByText("Rob's logbook")).toBeInTheDocument();
    expect(day('Tue 8 Sept')).toHaveAttribute('aria-expanded', 'true');
    expect(day('Tue 1 Sept')).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
  });

  it('goes back to the board from a problem opened in the list, even after visiting the logbook', async () => {
    const user = await openAs('Rob');

    await user.click(screen.getByRole('button', { name: /board/i }));
    await user.click(await screen.findByText('Jug Haul'));
    await user.click(screen.getByRole('button', { name: /board/i }));
    expect(await screen.findByText('THE BOARD')).toBeInTheDocument();
  });

  it('asks who you are first, and takes you to the climber picker', async () => {
    listProblems.mockResolvedValue(PROBLEMS);
    render(<App />);
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Logbook' }));
    expect(screen.getByText('Select who you are to see your logbook')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Pick a climber' }));
    expect(await screen.findByLabelText('New climber name')).toBeInTheDocument();
  });

  it("says so when you haven't logged anything yet", async () => {
    await openAs('Tom');
    expect(screen.getByText('Nothing logged yet')).toBeInTheDocument();
    expect(screen.queryAllByRole('button', { name: DAY_ROW })).toHaveLength(0);
  });
  describe('Progress tab', () => {
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date(2026, 8, 10, 12)); // Thu 10 Sept 2026
    });
    afterEach(() => vi.useRealTimers());

    const tile = (label) => screen.getByText(label).parentElement;
    const readout = () => screen.getByText(/^Week of/).closest('p');

    it('switches to Progress, with your headline numbers and the latest week picked', async () => {
      const user = await openAs('Rob');
      await user.click(screen.getByRole('tab', { name: 'Progress' }));

      expect(screen.getByRole('tab', { name: 'Progress' })).toHaveAttribute('aria-selected', 'true');
      expect(tile('Hardest send')).toHaveTextContent('V5');
      expect(tile('Sessions a week, last 4 weeks')).toHaveTextContent('0.5');
      expect(tile('Problems ticked')).toHaveTextContent('2/3');
      expect(readout().textContent).toBe('Week of 7 Sept · 1 session · top V3 · 1 problem');
      expect(screen.queryAllByRole('button', { name: DAY_ROW })).toHaveLength(0);
      expect(screen.getByText('Board ticklist')).toBeInTheDocument();
    });

    it('picks an earlier week with the arrow keys', async () => {
      const user = await openAs('Rob');
      await user.click(screen.getByRole('tab', { name: 'Progress' }));
      fireEvent.keyDown(screen.getByRole('group', { name: /^Weekly charts/ }), { key: 'ArrowLeft' });
      expect(readout().textContent).toBe('Week of 31 Aug · 1 session · top V5 · 2 problems');
    });

    it("reads 'no sessions' for a week you didn't climb", async () => {
      vi.setSystemTime(new Date(2026, 8, 16, 12)); // Wed 16 Sept: this week is empty so far
      const user = await openAs('Rob');
      await user.click(screen.getByRole('tab', { name: 'Progress' }));
      expect(readout().textContent).toBe('Week of 14 Sept · no sessions');
    });

    it('opens one of your most-climbed, and comes back to the Progress tab', async () => {
      const user = await openAs('Rob');
      await user.click(screen.getByRole('tab', { name: 'Progress' }));
      expect(screen.getByRole('button', { name: /Crimpy Corner/ })).toHaveTextContent('×2');

      await user.click(screen.getByRole('button', { name: /Crimpy Corner/ }));
      expect(await screen.findByText('Log a send')).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: /logbook/i }));
      expect(screen.getByRole('tab', { name: 'Progress' })).toHaveAttribute('aria-selected', 'true');
    });

    it("prompts you to log a send when you haven't yet", async () => {
      const user = await openAs('Tom');
      await user.click(screen.getByRole('tab', { name: 'Progress' }));
      expect(screen.getByText('Log a send to start your progress')).toBeInTheDocument();
    });
  });
});

describe('App (board stats)', () => {
  const PROBLEMS = [
    { id: 'p1', name: 'Gaston Traverse', grade: 'V5', setter: 'Rob', notes: '', holds: [], rating: 5, created_at: '2026-09-01T12:00:00Z', send_count: 2 },
    { id: 'p2', name: 'Crimpy Corner', grade: 'V3', setter: 'Shawn', notes: '', holds: [], rating: 4, created_at: '2026-09-01T12:00:00Z', send_count: 1 },
    { id: 'p3', name: 'Pinchin', grade: 'V6', setter: 'Rob', notes: '', holds: [], rating: null, created_at: '2026-09-17T12:00:00Z', send_count: 0 },
  ];
  const TICKS = [
    { id: 't1', problem_id: 'p1', sent_by: 'Rob', sent_on: '2026-10-02', created_at: '2026-10-02T18:00:00Z', flash: false },
    { id: 't2', problem_id: 'p1', sent_by: 'Shawn', sent_on: '2026-10-06', created_at: '2026-10-06T18:00:00Z', flash: true },
    { id: 't3', problem_id: 'p2', sent_by: 'Shawn', sent_on: '2026-10-08', created_at: '2026-10-08T18:00:00Z', flash: false },
  ];

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 21, 12)); // Wed 21 Oct 2026
    listProblems.mockResolvedValue(PROBLEMS);
    listBoardTicks.mockResolvedValue(TICKS);
    listClimbers.mockResolvedValue([{ id: 'c1', name: 'Rob' }, { id: 'c2', name: 'Shawn' }]);
  });
  afterEach(() => vi.useRealTimers());

  const openStats = async () => {
    render(<App />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Board stats' }));
    return user;
  };

  it("opens from the trophy button with this month's crew board, sorted by new ticks", async () => {
    await openStats();
    expect(screen.getByRole('heading', { name: 'Board stats' })).toBeInTheDocument();
    expect(screen.getByText('3 problems · 2 climbers')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'October crew board' })).toBeInTheDocument();
    const rows = within(screen.getByRole('table')).getAllByRole('row');
    expect(rows.map((r) => r.textContent)).toEqual(['ClimberProblemsNewFlashesTop', 'Shawn221V5', 'Rob110V5']);
    expect(screen.queryByText('No board photo yet')).not.toBeInTheDocument();
  });

  it('shows the latest FAs, classics, popular lately and every open project with how long it has been open', async () => {
    await openStats();
    expect(screen.getByText('Most FAs')).toBeInTheDocument();
    expect(within(screen.getByRole('button', { name: /Crimpy Corner.*Shawn · 8 Oct/ })).getByText('V3')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Classics' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Popular lately' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Pinchin.*set by Rob.*open 34 days/ })).toBeInTheDocument();
  });

  it('opens a problem from a row, and Back returns to Stats', async () => {
    const user = await openStats();
    await user.click(screen.getByRole('button', { name: /Pinchin/ }));
    expect(await screen.findByRole('heading', { name: 'Pinchin' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /stats/i }));
    expect(screen.getByRole('heading', { name: 'Board stats' })).toBeInTheDocument();
  });

  it("says when nobody has sent anything yet this month, naming last month's top ticker", async () => {
    vi.setSystemTime(new Date(2026, 10, 2, 12)); // 2 Nov
    await openStats();
    expect(screen.getByText('No sends yet in November')).toBeInTheDocument();
    expect(screen.getByText('Last month: Shawn ticked the most new problems (2)')).toBeInTheDocument();
  });
  it('shows who got the FA on a problem, and when', async () => {
    render(<App />);
    const user = userEvent.setup();
    await user.click(await screen.findByText('Gaston Traverse'));
    expect(await screen.findByText('FA Rob · 2 Oct')).toBeInTheDocument();
  });

  it("says a problem nobody has sent is up for grabs", async () => {
    render(<App />);
    const user = userEvent.setup();
    await user.click(await screen.findByText('Pinchin'));
    expect(await screen.findByText('No FA yet · up for grabs')).toBeInTheDocument();
  });

  it('shows no FA when the first send was logged before climber names', async () => {
    listBoardTicks.mockResolvedValue([
      { id: 't0', problem_id: 'p2', sent_by: null, sent_on: '2026-08-30', created_at: '2026-08-30T18:00:00Z', flash: false },
      ...TICKS,
    ]);
    render(<App />);
    const user = userEvent.setup();
    await user.click(await screen.findByText('Crimpy Corner'));
    await screen.findByRole('heading', { name: 'Crimpy Corner' });
    expect(screen.queryByText(/^FA /)).not.toBeInTheDocument();
    expect(screen.queryByText(/up for grabs/)).not.toBeInTheDocument();
  });
});

describe('App (warm-up screen)', () => {
  const PROBLEMS = [
    { id: 'p1', name: 'Jug Haul', grade: 'V1', setter: 'Rob', notes: '', holds: [{ x: 0.2, y: 0.3, type: 'start' }], send_count: 2, last_sent_on: '2026-09-01' },
    { id: 'p2', name: 'Crimp City', grade: 'V3', setter: 'Rob', notes: '', holds: [], send_count: 1, last_sent_on: '2026-09-10' },
  ];

  it('opens from the header and shows the empty state when there is no ladder', async () => {
    listProblems.mockResolvedValue(PROBLEMS);
    render(<App />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /warm-up/i }));
    expect(await screen.findByText('No warm-up yet')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Build your ladder' })).toBeInTheDocument();
    expect(listWarmupSessions).toHaveBeenCalledWith('b1');
  });

  it('keeps New problem in the header alongside Warm-up', async () => {
    render(<App />);
    expect(await screen.findByRole('button', { name: /new problem/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /warm-up/i })).toBeInTheDocument();
  });

  it('lists fixed, random and removed rungs, plus past sessions', async () => {
    getOrCreateBoard.mockResolvedValue({
      ...BOARD,
      warmup: [{ grade: 'V1', problemId: 'p1' }, { grade: 'V2', problemId: null }, { grade: 'V3', problemId: 'deleted' }],
    });
    listProblems.mockResolvedValue(PROBLEMS);
    listWarmupSessions.mockResolvedValue([
      { id: 's1', done_on: '2026-09-27', climbed_by: 'Rob', feel: 'strong', problem_ids: ['p1', 'p2'], sent_ids: ['p1', 'p2'] },
    ]);
    render(<App />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /warm-up/i }));
    expect(await screen.findByText('Jug Haul')).toBeInTheDocument();
    expect(screen.getByText('random V2')).toBeInTheDocument();
    expect(screen.getByText('Problem removed')).toBeInTheDocument();
    const rows = await screen.findAllByRole('listitem');
    expect(rows.map((r) => r.textContent)).toContainEqual(expect.stringMatching(/27 Sept? · Rob · Good · 2\/2/));
  });

  it('disables Start until a climber is selected', async () => {
    getOrCreateBoard.mockResolvedValue({ ...BOARD, warmup: [{ grade: 'V1', problemId: 'p1' }] });
    listProblems.mockResolvedValue(PROBLEMS);
    render(<App />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /warm-up/i }));
    expect(await screen.findByRole('button', { name: 'Select who you are first' })).toBeDisabled();
  });

  it('enables Start when a climber is selected', async () => {
    getOrCreateBoard.mockResolvedValue({ ...BOARD, warmup: [{ grade: 'V1', problemId: 'p1' }] });
    listProblems.mockResolvedValue(PROBLEMS);
    listClimbers.mockResolvedValue([{ id: 'c1', name: 'Rob' }]);
    localStorage.setItem('board-app:currentClimberId', 'c1');
    render(<App />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /warm-up/i }));
    expect(await screen.findByRole('button', { name: 'Start warm-up' })).toBeEnabled();
  });

  it('goes back to the list from the header', async () => {
    listProblems.mockResolvedValue(PROBLEMS);
    render(<App />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /warm-up/i }));
    await user.click(await screen.findByRole('button', { name: /board/i }));
    expect(await screen.findByText('THE BOARD')).toBeInTheDocument();
  });
});

describe('App (warm-up editor)', () => {
  const PROBLEMS = [
    { id: 'p1', name: 'Jug Haul', grade: 'V1', setter: 'Rob', notes: '', holds: [], send_count: 2 },
    { id: 'p2', name: 'Crimp City', grade: 'V3', setter: 'Rob', notes: '', holds: [], send_count: 1 },
  ];

  const openEditor = async (user) => {
    await user.click(await screen.findByRole('button', { name: /warm-up/i }));
    await user.click(await screen.findByRole('button', { name: 'Build your ladder' }));
  };

  it('builds a ladder of fixed and random rungs and saves it in order', async () => {
    listProblems.mockResolvedValue(PROBLEMS);
    saveWarmup.mockImplementation(async (id, rungs) => ({ ...BOARD, warmup: rungs }));
    render(<App />);
    const user = userEvent.setup();
    await openEditor(user);

    await user.click(screen.getByRole('button', { name: '+ Add a problem' }));
    await user.click(screen.getByRole('button', { name: /Jug Haul/ }));
    await user.click(screen.getByRole('button', { name: '+ Add random slot' }));
    await user.click(screen.getByRole('button', { name: 'V2' }));
    await user.click(screen.getByRole('button', { name: 'Done' }));

    await waitFor(() => expect(saveWarmup).toHaveBeenCalledWith('b1', [
      { grade: 'V1', problemId: 'p1' },
      { grade: 'V2', problemId: null },
    ]));
    expect(await screen.findByText('random V2')).toBeInTheDocument();
  });

  it('reorders and removes rungs', async () => {
    getOrCreateBoard.mockResolvedValue({ ...BOARD, warmup: [{ grade: 'V1', problemId: 'p1' }, { grade: 'V3', problemId: 'p2' }, { grade: 'V2', problemId: null }] });
    listProblems.mockResolvedValue(PROBLEMS);
    saveWarmup.mockImplementation(async (id, rungs) => ({ ...BOARD, warmup: rungs }));
    render(<App />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /warm-up/i }));
    await user.click(await screen.findByRole('button', { name: /edit/i }));

    await user.click(screen.getByRole('button', { name: 'Move rung 3 up' }));
    await user.click(screen.getByRole('button', { name: 'Remove rung 1' }));
    await user.click(screen.getByRole('button', { name: 'Done' }));

    await waitFor(() => expect(saveWarmup).toHaveBeenCalledWith('b1', [
      { grade: 'V2', problemId: null },
      { grade: 'V3', problemId: 'p2' },
    ]));
  });

  it('changes a fixed rung into a random slot at the same grade', async () => {
    getOrCreateBoard.mockResolvedValue({ ...BOARD, warmup: [{ grade: 'V1', problemId: 'p1' }] });
    listProblems.mockResolvedValue(PROBLEMS);
    saveWarmup.mockImplementation(async (id, rungs) => ({ ...BOARD, warmup: rungs }));
    render(<App />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /warm-up/i }));
    await user.click(await screen.findByRole('button', { name: /edit/i }));

    await user.click(screen.getByRole('button', { name: 'Change rung 1' }));
    await user.click(screen.getByRole('button', { name: 'Make this a random V1' }));
    await user.click(screen.getByRole('button', { name: 'Done' }));

    await waitFor(() => expect(saveWarmup).toHaveBeenCalledWith('b1', [{ grade: 'V1', problemId: null }]));
  });

  it('filters the problem picker by name', async () => {
    listProblems.mockResolvedValue(PROBLEMS);
    render(<App />);
    const user = userEvent.setup();
    await openEditor(user);
    await user.click(screen.getByRole('button', { name: '+ Add a problem' }));
    await user.type(screen.getByRole('textbox', { name: 'Search problems' }), 'crimp');
    expect(screen.getByRole('button', { name: /Crimp City/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Jug Haul/ })).not.toBeInTheDocument();
  });

  it('stays in the editor and shows an error when saving fails', async () => {
    listProblems.mockResolvedValue(PROBLEMS);
    saveWarmup.mockRejectedValue(new Error('offline'));
    render(<App />);
    const user = userEvent.setup();
    await openEditor(user);
    await user.click(screen.getByRole('button', { name: '+ Add random slot' }));
    await user.click(screen.getByRole('button', { name: 'V2' }));
    await user.click(screen.getByRole('button', { name: 'Done' }));
    expect(await screen.findByText(/could not save the warm-up/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Done' })).toBeInTheDocument();
  });
});

describe('App (warm-up session)', () => {
  const PROBLEMS = [
    { id: 'p1', name: 'Jug Haul', grade: 'V1', setter: 'Rob', notes: '', holds: [], send_count: 2, last_sent_on: '2026-09-01' },
    { id: 'p2', name: 'Pinch Party', grade: 'V2', setter: 'Rob', notes: '', holds: [], send_count: 1, last_sent_on: '2026-08-01' },
    { id: 'p3', name: 'Slab Dance', grade: 'V2', setter: 'Rob', notes: '', holds: [], send_count: 1, last_sent_on: '2026-08-01' },
  ];

  const CLIMBER_KEY = 'board-app:currentClimberId';

  const startSession = async (warmup) => {
    getOrCreateBoard.mockResolvedValue({ ...BOARD, warmup });
    listProblems.mockResolvedValue(PROBLEMS);
    listClimbers.mockResolvedValue([{ id: 'c1', name: 'Rob' }]);
    localStorage.setItem(CLIMBER_KEY, 'c1');
    createTick.mockImplementation(async (problemId, { sentOn }) => ({ id: `t-${problemId}`, problem_id: problemId, sent_on: sentOn }));
    // Model the table: the Warm-up screen refetches sessions when it reopens.
    const saved = [];
    createWarmupSession.mockImplementation(async (boardId, s) => {
      const row = { id: `s${saved.length + 1}`, done_on: s.doneOn, climbed_by: s.climbedBy, feel: s.feel, problem_ids: s.problemIds, sent_ids: s.sentIds };
      saved.unshift(row);
      return row;
    });
    listWarmupSessions.mockImplementation(async () => [...saved]);
    render(<App />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /warm-up/i }));
    await user.click(await screen.findByRole('button', { name: 'Start warm-up' }));
    return user;
  };

  it('logs a normal send for the current rung and moves to the next', async () => {
    const user = await startSession([{ grade: 'V1', problemId: 'p1' }, { grade: 'V2', problemId: 'p2' }]);
    expect(screen.getByText('Rob · 0/2')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Sent Jug Haul' }));
    expect(createTick).toHaveBeenCalledWith('p1', expect.objectContaining({ sentBy: 'Rob', notes: '' }));
    expect(await screen.findByText('Rob · 1/2')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sent Pinch Party' })).toBeInTheDocument();
  });

  it('asks for a feel when the last rung is sent and saves the session', async () => {
    const user = await startSession([{ grade: 'V1', problemId: 'p1' }]);
    await user.click(screen.getByRole('button', { name: 'Sent Jug Haul' }));
    await user.click(await screen.findByRole('button', { name: 'Good' }));
    await waitFor(() => expect(createWarmupSession).toHaveBeenCalledWith('b1', expect.objectContaining({
      climbedBy: 'Rob', feel: 'strong', problemIds: ['p1'], sentIds: ['p1'],
    })));
    const rows = await screen.findAllByRole('listitem');
    expect(rows.map((r) => r.textContent)).toContainEqual(expect.stringMatching(/Rob · Good · 1\/1/));
  });

  it('counts a warm-up send towards Unsent, so the problem drops off your list', async () => {
    const user = await startSession([{ grade: 'V1', problemId: 'p1' }]);
    createTick.mockImplementation(async (problemId, { sentOn, sentBy }) => ({ id: `t-${problemId}`, problem_id: problemId, sent_on: sentOn, sent_by: sentBy }));
    await user.click(screen.getByRole('button', { name: 'Sent Jug Haul' }));
    await user.click(await screen.findByRole('button', { name: 'Good' }));
    await user.click(await screen.findByRole('button', { name: /board/i }));
    await user.click(await screen.findByRole('button', { name: /unsent/i }));

    expect(screen.queryByText('Jug Haul')).not.toBeInTheDocument();
    expect(screen.getByText('Pinch Party')).toBeInTheDocument();
  });

  it('ending part-way still asks for a feel and saves partial progress', async () => {
    const user = await startSession([{ grade: 'V1', problemId: 'p1' }, { grade: 'V2', problemId: 'p2' }]);
    await user.click(screen.getByRole('button', { name: 'End' }));
    await user.click(await screen.findByRole('button', { name: 'Weak' }));
    await waitFor(() => expect(createWarmupSession).toHaveBeenCalledWith('b1', expect.objectContaining({
      feel: 'heavy', problemIds: ['p1', 'p2'], sentIds: [],
    })));
  });

  it('discarding saves no session', async () => {
    const user = await startSession([{ grade: 'V1', problemId: 'p1' }]);
    await user.click(screen.getByRole('button', { name: 'End' }));
    await user.click(await screen.findByRole('button', { name: 'Discard' }));
    expect(createWarmupSession).not.toHaveBeenCalled();
    expect(await screen.findByRole('button', { name: 'Start warm-up' })).toBeInTheDocument();
  });

  it('re-rolls a random rung to another problem at that grade', async () => {
    const user = await startSession([{ grade: 'V2', problemId: null }]);
    const before = screen.getByText(/Pinch Party|Slab Dance/).textContent;
    await user.click(screen.getByRole('button', { name: 'Re-roll rung 1' }));
    const after = screen.getByText(/Pinch Party|Slab Dance/).textContent;
    expect(after).not.toBe(before);
  });

  it('keeps the rung unsent and shows an error when the send fails', async () => {
    const user = await startSession([{ grade: 'V1', problemId: 'p1' }]);
    createTick.mockRejectedValueOnce(new Error('offline'));
    await user.click(screen.getByRole('button', { name: 'Sent Jug Haul' }));
    expect(await screen.findByText(/could not log that send/i)).toBeInTheDocument();
    expect(screen.getByText('Rob · 0/1')).toBeInTheDocument();
  });

  it('skips removed rungs', async () => {
    await startSession([{ grade: 'V1', problemId: 'gone' }, { grade: 'V1', problemId: 'p1' }]);
    expect(screen.getByText('Rob · 0/1')).toBeInTheDocument();
    expect(screen.getByText('Problem removed')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sent Jug Haul' })).toBeInTheDocument();
  });
});

describe('App (warm-up review fixes)', () => {
  const PROBLEMS = [
    { id: 'p1', name: 'Jug Haul', grade: 'V1', setter: 'Rob', notes: '', holds: [], send_count: 2, last_sent_on: '2026-09-01' },
    { id: 'p2', name: 'Pinch Party', grade: 'V2', setter: 'Rob', notes: '', holds: [], send_count: 1, last_sent_on: '2026-08-01' },
    { id: 'p3', name: 'Slab Dance', grade: 'V2', setter: 'Rob', notes: '', holds: [], send_count: 1, last_sent_on: '2026-08-01' },
  ];

  const startSession = async (warmup) => {
    getOrCreateBoard.mockResolvedValue({ ...BOARD, warmup });
    listProblems.mockResolvedValue(PROBLEMS);
    listClimbers.mockResolvedValue([{ id: 'c1', name: 'Rob' }]);
    localStorage.setItem('board-app:currentClimberId', 'c1');
    render(<App />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /warm-up/i }));
    await user.click(await screen.findByRole('button', { name: 'Start warm-up' }));
    return user;
  };

  it('does not offer a problem that is already in the ladder', async () => {
    getOrCreateBoard.mockResolvedValue({ ...BOARD, warmup: [{ grade: 'V1', problemId: 'p1' }] });
    listProblems.mockResolvedValue(PROBLEMS);
    render(<App />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /warm-up/i }));
    await user.click(await screen.findByRole('button', { name: /edit/i }));
    await user.click(screen.getByRole('button', { name: '+ Add a problem' }));
    expect(screen.getByRole('button', { name: /Pinch Party/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Jug Haul/ })).not.toBeInTheDocument();
  });

  it('locks re-roll while a send is still saving', async () => {
    const user = await startSession([{ grade: 'V2', problemId: null }, { grade: 'V1', problemId: 'p1' }]);
    createTick.mockReturnValue(new Promise(() => {}));
    await user.click(screen.getByRole('button', { name: /^Sent (Pinch Party|Slab Dance)$/ }));
    expect(screen.getByRole('button', { name: 'Re-roll rung 1' })).toBeDisabled();
  });

  it('shows a failed send right on the rung, not just at the top of the page', async () => {
    const user = await startSession([{ grade: 'V1', problemId: 'p1' }]);
    createTick.mockRejectedValueOnce(new Error('offline'));
    await user.click(screen.getByRole('button', { name: 'Sent Jug Haul' }));
    expect(await screen.findByText("Didn't save — tap Sent again")).toBeInTheDocument();
  });
});

describe('App (scroll position)', () => {
  const PROBLEMS = [
    { id: 'p1', name: 'Gaston Traverse', grade: 'V5', setter: 'Rob', notes: '', holds: [] },
    { id: 'p2', name: 'Crimpy Corner', grade: 'V3', setter: 'Rob', notes: '', holds: [] },
  ];
  let scrollTo;

  beforeEach(() => {
    scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    Object.defineProperty(window, 'scrollY', { value: 640, configurable: true, writable: true });
  });

  afterEach(() => {
    scrollTo.mockRestore();
    window.scrollY = 0;
  });

  it('opens a problem at the top of the page', async () => {
    listProblems.mockResolvedValue(PROBLEMS);
    render(<App />);
    const user = userEvent.setup();
    await user.click(await screen.findByText('Crimpy Corner'));
    expect(scrollTo).toHaveBeenLastCalledWith(0, 0);
  });

  it('opens the logbook at the top of the page', async () => {
    listProblems.mockResolvedValue(PROBLEMS);
    render(<App />);
    const user = userEvent.setup();
    await screen.findByText('Crimpy Corner');
    scrollTo.mockClear();
    await user.click(screen.getByRole('button', { name: 'Logbook' }));
    expect(scrollTo).toHaveBeenLastCalledWith(0, 0);
  });

  it('opens board stats at the top of the page', async () => {
    listProblems.mockResolvedValue(PROBLEMS);
    render(<App />);
    const user = userEvent.setup();
    await screen.findByText('Crimpy Corner');
    scrollTo.mockClear();
    await user.click(screen.getByRole('button', { name: 'Board stats' }));
    expect(scrollTo).toHaveBeenLastCalledWith(0, 0);
  });

  it('starts a new problem at the top of the page', async () => {
    getOrCreateBoard.mockResolvedValue({ ...BOARD, photo_url: 'https://cdn.example/b1.jpg' });
    listProblems.mockResolvedValue(PROBLEMS);
    render(<App />);
    const user = userEvent.setup();
    await screen.findByText('Crimpy Corner');
    scrollTo.mockClear();
    await user.click(screen.getByText('New problem'));
    expect(scrollTo).toHaveBeenLastCalledWith(0, 0);
  });

  it('puts you back where you were in the list after the logbook', async () => {
    listProblems.mockResolvedValue(PROBLEMS);
    render(<App />);
    const user = userEvent.setup();
    await screen.findByText('Crimpy Corner');
    await user.click(screen.getByRole('button', { name: 'Logbook' }));
    window.scrollY = 1200;
    await user.click(screen.getByRole('button', { name: 'Board' }));
    await screen.findByText('THE BOARD');
    expect(scrollTo).toHaveBeenLastCalledWith(0, 640);
  });

  it('puts you back where you were in the list after board stats', async () => {
    listProblems.mockResolvedValue(PROBLEMS);
    render(<App />);
    const user = userEvent.setup();
    await screen.findByText('Crimpy Corner');
    await user.click(screen.getByRole('button', { name: 'Board stats' }));
    window.scrollY = 1200;
    await user.click(screen.getByRole('button', { name: 'Board' }));
    await screen.findByText('THE BOARD');
    expect(scrollTo).toHaveBeenLastCalledWith(0, 640);
  });

  it('backs out of a problem, then the logbook, to each spot in turn', async () => {
    localStorage.setItem('board-app:currentClimberId', 'c1');
    listClimbers.mockResolvedValue([{ id: 'c1', name: 'Rob' }]);
    listProblems.mockResolvedValue(PROBLEMS);
    listBoardTicks.mockResolvedValue([
      { id: 't1', problem_id: 'p2', sent_by: 'Rob', sent_on: '2026-09-01', created_at: '2026-09-01T10:00:00Z', flash: false },
    ]);
    render(<App />);
    const user = userEvent.setup();
    await screen.findByRole('button', { name: 'Climbing as Rob' });
    await user.click(screen.getByRole('button', { name: 'Logbook' }));
    window.scrollY = 300;
    await user.click(screen.getByRole('button', { name: /Tue 1 Sept/ }));
    await user.click(screen.getByRole('button', { name: /Crimpy Corner/ }));
    window.scrollY = 0;
    await user.click(await screen.findByRole('button', { name: 'Logbook' }));
    await screen.findByText("Rob's logbook");
    expect(scrollTo).toHaveBeenLastCalledWith(0, 300);
    await user.click(screen.getByRole('button', { name: 'Board' }));
    await screen.findByText('THE BOARD');
    expect(scrollTo).toHaveBeenLastCalledWith(0, 640);
  });

  it('puts you back where you were in the list when you go back', async () => {
    listProblems.mockResolvedValue(PROBLEMS);
    render(<App />);
    const user = userEvent.setup();
    await user.click(await screen.findByText('Crimpy Corner'));
    window.scrollY = 0;
    await user.click(await screen.findByRole('button', { name: /board/i }));
    await screen.findByText('THE BOARD');
    expect(scrollTo).toHaveBeenLastCalledWith(0, 640);
  });

  it('puts you back where you were in board stats when you go back', async () => {
    listProblems.mockResolvedValue(PROBLEMS);
    render(<App />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Board stats' }));
    await user.click(screen.getByRole('button', { name: /Crimpy Corner/ }));
    expect(scrollTo).toHaveBeenLastCalledWith(0, 0);
    window.scrollY = 0;
    await user.click(await screen.findByRole('button', { name: /stats/i }));
    await screen.findByRole('heading', { name: 'Board stats' });
    expect(scrollTo).toHaveBeenLastCalledWith(0, 640);
  });

  it('puts you back where you were in the logbook when you go back', async () => {
    localStorage.setItem('board-app:currentClimberId', 'c1');
    listClimbers.mockResolvedValue([{ id: 'c1', name: 'Rob' }]);
    listProblems.mockResolvedValue(PROBLEMS);
    listBoardTicks.mockResolvedValue([
      { id: 't1', problem_id: 'p2', sent_by: 'Rob', sent_on: '2026-09-01', created_at: '2026-09-01T10:00:00Z', flash: false },
    ]);
    render(<App />);
    const user = userEvent.setup();
    await screen.findByRole('button', { name: 'Climbing as Rob' });
    await user.click(screen.getByRole('button', { name: 'Logbook' }));
    await user.click(screen.getByRole('button', { name: /Tue 1 Sept/ }));
    await user.click(screen.getByRole('button', { name: /Crimpy Corner/ }));
    expect(scrollTo).toHaveBeenLastCalledWith(0, 0);
    window.scrollY = 0;
    await user.click(await screen.findByRole('button', { name: /logbook/i }));
    await screen.findByText("Rob's logbook");
    expect(scrollTo).toHaveBeenLastCalledWith(0, 640);
  });

  it("doesn't carry the logbook's scroll spot over once you've left a problem some other way", async () => {
    localStorage.setItem('board-app:currentClimberId', 'c1');
    listClimbers.mockResolvedValue([{ id: 'c1', name: 'Rob' }]);
    listProblems.mockResolvedValue(PROBLEMS);
    listBoardTicks.mockResolvedValue([
      { id: 't1', problem_id: 'p2', sent_by: 'Rob', sent_on: '2026-09-01', created_at: '2026-09-01T10:00:00Z', flash: false },
    ]);
    updateProblem.mockResolvedValue({ ...PROBLEMS[1], name: 'Crimpy Corner v2' });
    render(<App />);
    const user = userEvent.setup();
    await screen.findByRole('button', { name: 'Climbing as Rob' });
    window.scrollY = 0;
    await user.click(screen.getByRole('button', { name: 'Logbook' }));
    window.scrollY = 640;
    await user.click(screen.getByRole('button', { name: /Tue 1 Sept/ }));
    await user.click(screen.getByRole('button', { name: /Crimpy Corner/ }));
    await user.click(await screen.findByRole('button', { name: 'Edit details' }));
    await user.click(screen.getByText('Save changes'));
    await screen.findByText('THE BOARD');

    await user.click(screen.getByRole('button', { name: 'Logbook' }));
    await screen.findByText("Rob's logbook");
    expect(scrollTo).not.toHaveBeenCalledWith(0, 640);
  });

  it('keeps the climber picker in view when a problem sends you to pick who you are', async () => {
    listProblems.mockResolvedValue(PROBLEMS);
    render(<App />);
    const user = userEvent.setup();
    await user.click(await screen.findByText('Crimpy Corner'));
    await user.click(await screen.findByRole('button', { name: 'Pick a climber' }));
    await screen.findByText('THE BOARD');
    expect(scrollTo).not.toHaveBeenCalledWith(0, 640);
  });

  it('opens the warm-up at the top and puts you back where you were in the list after', async () => {
    listProblems.mockResolvedValue(PROBLEMS);
    render(<App />);
    const user = userEvent.setup();
    await screen.findByText('Crimpy Corner');
    scrollTo.mockClear();
    await user.click(screen.getByRole('button', { name: /warm-up/i }));
    expect(scrollTo).toHaveBeenLastCalledWith(0, 0);
    window.scrollY = 1200;
    await user.click(await screen.findByRole('button', { name: /board/i }));
    await screen.findByText('THE BOARD');
    expect(scrollTo).toHaveBeenLastCalledWith(0, 640);
  });

  it('lands at the top of the board after a new photo from Tweaks, with the photo in view', async () => {
    getTweaksSession.mockResolvedValue({ user: { id: 'u1' } });
    getOrCreateBoard.mockResolvedValue({ ...BOARD, photo_url: 'https://cdn.example/b1.jpg' });
    resizeFileToBlob.mockResolvedValue(new Blob(['x']));
    uploadBoardPhoto.mockResolvedValue({ ...BOARD, photo_url: 'https://cdn.example/new.jpg' });
    listProblems.mockResolvedValue(PROBLEMS);
    render(<App />);
    const user = userEvent.setup();
    await screen.findByText('Crimpy Corner');
    await holdTitle();
    scrollTo.mockClear();
    await user.upload(screen.getByLabelText('New photo'), new File(['x'], 'b.jpg', { type: 'image/jpeg' }));
    await screen.findByText('THE BOARD');
    expect(scrollTo).toHaveBeenLastCalledWith(0, 0);
  });
});

describe('App (deleting a warm-up session)', () => {
  const SESSIONS = [
    { id: 's1', done_on: '2026-09-29', climbed_by: 'Rob', feel: 'strong', problem_ids: ['p1'], sent_ids: [] },
    { id: 's2', done_on: '2026-09-27', climbed_by: 'Tom', feel: 'heavy', problem_ids: ['p1'], sent_ids: ['p1'] },
  ];
  const openWarmup = async () => {
    getOrCreateBoard.mockResolvedValue({ ...BOARD, warmup: [{ grade: 'V1', problemId: 'p1' }] });
    listProblems.mockResolvedValue([{ id: 'p1', name: 'Jug Haul', grade: 'V1', setter: '', notes: '', holds: [], send_count: 1 }]);
    listWarmupSessions.mockResolvedValue(SESSIONS);
    render(<App />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /warm-up/i }));
    await screen.findAllByRole('listitem');
    return user;
  };

  it('removes a session from Last sessions with one tap', async () => {
    deleteWarmupSession.mockResolvedValue();
    const user = await openWarmup();
    await user.click(screen.getByRole('button', { name: 'Delete session from 29 Sept by Rob' }));
    expect(deleteWarmupSession).toHaveBeenCalledWith('s1');
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(1));
    expect(screen.getByRole('listitem').textContent).toMatch(/Tom/);
  });

  it('keeps the session and shows an error when the delete fails', async () => {
    deleteWarmupSession.mockRejectedValue(new Error('offline'));
    const user = await openWarmup();
    await user.click(screen.getByRole('button', { name: 'Delete session from 29 Sept by Rob' }));
    expect(await screen.findByText(/could not delete that warm-up/i)).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });
});

describe('App (refreshing the list)', () => {
  const GASTON = { id: 'p1', name: 'Gaston Traverse', grade: 'V5', setter: 'Rob', notes: '', holds: [] };
  const CRIMPY = { id: 'p2', name: 'Crimpy Corner', grade: 'V3', setter: 'Rob', notes: '', holds: [] };

  const touch = (type, clientY) => {
    const event = new Event(type, { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'touches', { value: type === 'touchend' ? [] : [{ clientY }] });
    window.dispatchEvent(event);
    return event;
  };

  afterEach(() => {
    delete document.visibilityState;
  });

  it('picks up newly added problems when the app comes back into view', async () => {
    listProblems.mockResolvedValueOnce([GASTON]).mockResolvedValue([CRIMPY, GASTON]);
    render(<App />);
    expect(await screen.findByText('Gaston Traverse')).toBeInTheDocument();

    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));

    expect(await screen.findByText('Crimpy Corner')).toBeInTheDocument();
  });

  it('does not refresh while the app is hidden', async () => {
    listProblems.mockResolvedValue([GASTON]);
    render(<App />);
    await screen.findByText('Gaston Traverse');

    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));

    expect(listProblems).toHaveBeenCalledTimes(1);
  });

  it('refreshes the list when pulled down from the top', async () => {
    listProblems.mockResolvedValueOnce([GASTON]).mockResolvedValue([CRIMPY, GASTON]);
    render(<App />);
    await screen.findByText('Gaston Traverse');

    act(() => { touch('touchstart', 100); });
    let move;
    act(() => { move = touch('touchmove', 300); });
    expect(move.defaultPrevented).toBe(true);
    act(() => { touch('touchend'); });

    expect(await screen.findByText('Crimpy Corner')).toBeInTheDocument();
  });

  it('does not refresh on a short pull', async () => {
    listProblems.mockResolvedValue([GASTON]);
    render(<App />);
    await screen.findByText('Gaston Traverse');

    act(() => { touch('touchstart', 100); });
    act(() => { touch('touchmove', 130); });
    act(() => { touch('touchend'); });

    expect(listProblems).toHaveBeenCalledTimes(1);
  });

  it('leaves an upward scroll alone', async () => {
    listProblems.mockResolvedValue([GASTON]);
    render(<App />);
    await screen.findByText('Gaston Traverse');

    act(() => { touch('touchstart', 300); });
    let move;
    act(() => { move = touch('touchmove', 100); });
    act(() => { touch('touchend'); });

    expect(move.defaultPrevented).toBe(false);
    expect(listProblems).toHaveBeenCalledTimes(1);
  });
});

describe('App (volume faces on a problem)', () => {
  it("draws a problem's faces and pins from its own copy, and lists its faces", async () => {
    // The board has no volumes at all -- the problem's snapshot is enough.
    listProblems.mockResolvedValue([{
      id: 'p1', name: 'Volume Line', grade: 'V3', setter: 'Rob', notes: '',
      holds: [
        { x: 0.5, y: 0.25, type: 'start', face: { volumeId: 'v1', faceId: 'f1', label: 'Vol1 Top', points: [{ x: 0.25, y: 0.125 }, { x: 0.75, y: 0.125 }, { x: 0.5, y: 0.5 }] } },
        { x: 0.6, y: 0.7, type: 'hold', face: { volumeId: 'v2', faceId: 'f2', label: 'Vol2 Under', points: [{ x: 0.6, y: 0.7 }] } },
        { x: 0.2, y: 0.8, type: 'hold' },
      ],
    }]);
    render(<App />);
    const user = userEvent.setup();
    await user.click(await screen.findByText('Volume Line'));

    expect(await screen.findAllByTestId('face-shape')).toHaveLength(1);
    // One ring for the plain hold, one for the pinned face -- the outlined face gets none.
    expect(screen.getAllByTestId('hold-marker')).toHaveLength(2);
    expect(screen.getByTestId('tag-pill')).toHaveTextContent('Vol2 Under');
    expect(screen.getByText('Vol1 Top — start')).toBeInTheDocument();
    expect(screen.getByText('Vol2 Under — hold')).toBeInTheDocument();
  });

  it("shows a side's current name after it's been renamed", async () => {
    const TRI = [{ x: 0.25, y: 0.125 }, { x: 0.75, y: 0.125 }, { x: 0.5, y: 0.5 }];
    getOrCreateBoard.mockResolvedValue({ id: 'b1', name: 'Home Board', photo_url: null, volumes: [
      { id: 'v1', name: 'Green', sidesListed: true, faces: [{ id: 'f1', name: 'Pinch side', points: TRI, photoUrl: 'https://cdn.example/b1.jpg' }] },
      { id: 'v2', name: 'Vol2', sidesListed: true, faces: [{ id: 'f2', name: 'Belly', points: [{ x: 0.6, y: 0.7 }], photoUrl: 'https://cdn.example/b1.jpg' }] },
    ] });
    listProblems.mockResolvedValue([{
      id: 'p1', name: 'Volume Line', grade: 'V3', setter: 'Rob', notes: '',
      holds: [
        { x: 0.5, y: 0.25, type: 'start', face: { volumeId: 'v1', faceId: 'f1', label: 'Vol1 Top', points: TRI } },
        { x: 0.6, y: 0.7, type: 'hold', face: { volumeId: 'v2', faceId: 'f2', label: 'Vol2 Under', points: [{ x: 0.6, y: 0.7 }] } },
      ],
    }]);
    render(<App />);
    const user = userEvent.setup();
    await user.click(await screen.findByText('Volume Line'));

    expect(await screen.findByText('Green Pinch side — start')).toBeInTheDocument();
    expect(screen.getByText('Vol2 Belly — hold')).toBeInTheDocument();
    expect(screen.getByTestId('tag-pill')).toHaveTextContent('Vol2 Belly');
  });

  it('shows no Volumes section for a problem without faces', async () => {
    listProblems.mockResolvedValue([{
      id: 'p1', name: 'Plain Line', grade: 'V3', setter: 'Rob', notes: '', holds: [{ x: 0.2, y: 0.8, type: 'hold' }],
    }]);
    render(<App />);
    const user = userEvent.setup();
    await user.click(await screen.findByText('Plain Line'));

    expect(await screen.findByText('Not sent yet')).toBeInTheDocument();
    expect(screen.queryByText('Volumes')).not.toBeInTheDocument();
    expect(screen.queryByTestId('tag-pill')).not.toBeInTheDocument();
  });
});

describe('App (Tweaks door and board setup)', () => {
  const WITH_PHOTO = { ...BOARD, photo_url: 'https://cdn.example/b1.jpg' };
  const climbAs = (name) => {
    localStorage.setItem('board-app:currentClimberId', 'c1');
    listClimbers.mockResolvedValue([{ id: 'c1', name }]);
  };
  const signedIn = () => getTweaksSession.mockResolvedValue({ user: { id: 'u1' } });

  it('asks for the password on a long press when signed out', async () => {
    render(<App />);
    await holdTitle();
    expect(screen.getByRole('dialog', { name: 'Tweaks' })).toBeInTheDocument();
  });

  it("keeps the password sheet open through the click iOS sends as the finger lifts", async () => {
    render(<App />);
    await holdTitle(() => screen.getByRole('dialog', { name: 'Tweaks' }));
    expect(screen.getByRole('dialog', { name: 'Tweaks' })).toBeInTheDocument();
  });

  it("stays in Tweaks through the click iOS sends as the finger lifts", async () => {
    signedIn();
    render(<App />);
    await holdTitle(() => screen.getByRole('button', { name: /board/i }));
    expect(screen.getByText('TWEAKS')).toBeInTheDocument();
  });

  it('does nothing on a quick tap', async () => {
    render(<App />);
    const title = await screen.findByText('THE BOARD');
    fireEvent.pointerDown(title, { clientX: 5, clientY: 5, pointerId: 1 });
    fireEvent.pointerUp(title, { clientX: 5, clientY: 5, pointerId: 1 });
    await act(() => new Promise((resolve) => setTimeout(resolve, LONG_PRESS_MS + 20)));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('opens Tweaks with the right password', async () => {
    signInToTweaks.mockResolvedValue(true);
    render(<App />);
    const user = userEvent.setup();
    await holdTitle();
    await user.type(screen.getByLabelText('Password'), 'hunter2');
    await user.click(screen.getByRole('button', { name: 'Unlock' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByText('TWEAKS')).toBeInTheDocument();
    expect(screen.getByText('Board setup')).toBeInTheDocument();
  });

  it('goes straight in when already signed in', async () => {
    signedIn();
    render(<App />);
    await holdTitle();
    expect(screen.getByText('TWEAKS')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('no longer shows the setup buttons on the board list, even for Rob', async () => {
    climbAs('Rob');
    getOrCreateBoard.mockResolvedValue(WITH_PHOTO);
    render(<App />);
    await screen.findByRole('button', { name: 'Climbing as Rob' });
    expect(screen.queryByLabelText('Replace board photo')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Volumes' })).not.toBeInTheDocument();
  });

  it('still lets anyone upload the first photo of a board that has none', async () => {
    climbAs('Shawn');
    render(<App />);
    await screen.findByRole('button', { name: 'Climbing as Shawn' });
    expect(screen.getByLabelText('Upload a photo of your board')).toBeInTheDocument();
  });

  it('opens Volumes from Tweaks, and its back link returns to Tweaks', async () => {
    signedIn();
    getOrCreateBoard.mockResolvedValue(WITH_PHOTO);
    render(<App />);
    const user = userEvent.setup();
    await holdTitle();
    await user.click(screen.getByRole('button', { name: 'Volumes' }));
    expect(await screen.findByText(/No volumes yet/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /tweaks/i }));
    expect(screen.getByText('TWEAKS')).toBeInTheDocument();
  });

  it('goes back to the board after a new photo from Tweaks', async () => {
    signedIn();
    getOrCreateBoard.mockResolvedValue(WITH_PHOTO);
    resizeFileToBlob.mockResolvedValue(new Blob(['x']));
    uploadBoardPhoto.mockResolvedValue({ ...WITH_PHOTO, photo_url: 'https://cdn.example/new.jpg' });
    render(<App />);
    const user = userEvent.setup();
    await holdTitle();
    await user.upload(screen.getByLabelText('New photo'), new File(['x'], 'b.jpg', { type: 'image/jpeg' }));
    expect(await screen.findByText('THE BOARD')).toBeInTheDocument();
    expect(uploadBoardPhoto).toHaveBeenCalledWith('b1', expect.anything());
  });

  it('signs out back to the board, and the next long press asks again', async () => {
    signedIn();
    signOutOfTweaks.mockResolvedValue();
    render(<App />);
    const user = userEvent.setup();
    await holdTitle();
    await user.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(await screen.findByText('THE BOARD')).toBeInTheDocument();
    expect(signOutOfTweaks).toHaveBeenCalled();
    await holdTitle();
    expect(screen.getByRole('dialog', { name: 'Tweaks' })).toBeInTheDocument();
  });

  it('signs out back to the board straight away, even with the server slow to answer', async () => {
    signedIn();
    signOutOfTweaks.mockReturnValue(new Promise(() => {}));
    render(<App />);
    const user = userEvent.setup();
    await holdTitle();
    await user.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(screen.getByText('THE BOARD')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('goes from Tweaks back to the board', async () => {
    signedIn();
    render(<App />);
    const user = userEvent.setup();
    await holdTitle();
    await user.click(screen.getByRole('button', { name: /board/i }));
    expect(await screen.findByText('THE BOARD')).toBeInTheDocument();
  });
});

describe('App (injury log)', () => {
  const today = localDate();
  const daysAgo = (n) => addDays(today, -n);
  const INJURY = {
    id: 'i1', side: 'right', area: 'finger', finger: 'ring', area_other: null, what: 'Pulley strain',
    symptoms: null, started_on: daysAgo(20), started_roughly: false, how_it_happened: null,
    closed_on: null, created_at: `${daysAgo(20)}T09:00:00Z`,
  };
  const checkin = (id, n, extra = {}) => ({
    id, injury_id: 'i1', checked_on: daysAgo(n), created_at: `${daysAgo(n)}T09:00:00Z`,
    pain_low: 1, pain_high: 2, pain_peak: null, activities: [], notes: null, ...extra,
  });
  // Neither is today's, so Check in starts a new one rather than opening it.
  const CHECKINS = [checkin('c1', 9, { pain_low: 2, pain_high: 3 }), checkin('c2', 4)];

  beforeEach(() => {
    getTweaksSession.mockResolvedValue({ user: { id: 'u1' } });
    listInjuries.mockResolvedValue([INJURY]);
    listCheckins.mockResolvedValue(CHECKINS);
  });

  async function openTheInjury(user) {
    await holdTitle();
    await user.click(await screen.findByRole('button', { name: /RH ring finger/ }));
    await screen.findByText('RH RING FINGER');
  }

  it('shows the open injury in Tweaks', async () => {
    render(<App />);
    await holdTitle();
    expect(await screen.findByText('RH ring finger')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Check in' })).toBeInTheDocument();
  });

  it('logs a check-in from the hub', async () => {
    createCheckin.mockImplementation(async (fields) => ({ id: 'c3', created_at: `${today}T10:00:00Z`, ...fields }));
    render(<App />);
    const user = userEvent.setup();
    await holdTitle();
    await user.click(await screen.findByRole('button', { name: 'Check in' }));
    const sheet = screen.getByRole('dialog', { name: 'RH ring finger' });
    await user.type(within(sheet).getByLabelText("How's it feeling?"), 'Bit stiff');
    await user.click(within(sheet).getByRole('button', { name: 'Save check-in' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(createCheckin).toHaveBeenCalledWith(expect.objectContaining({ injury_id: 'i1', checked_on: today, notes: 'Bit stiff' }));
  });

  it('opens an injury and comes back', async () => {
    render(<App />);
    const user = userEvent.setup();
    await openTheInjury(user);
    expect(screen.getByText('Check-ins')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /tweaks/i }));
    expect(await screen.findByText('TWEAKS')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /board/i }));
    expect(await screen.findByText('THE BOARD')).toBeInTheDocument();
  });

  it('starts a new log and lands on its check-in', async () => {
    createInjury.mockImplementation(async (fields) => ({ id: 'i2', closed_on: null, created_at: `${today}T10:00:00Z`, ...fields }));
    render(<App />);
    const user = userEvent.setup();
    await holdTitle();
    await user.click(await screen.findByRole('button', { name: '+ New injury' }));
    await user.click(screen.getByRole('button', { name: 'Left' }));
    await user.click(screen.getByRole('button', { name: 'Wrist' }));
    await user.click(screen.getByRole('button', { name: 'Start log' }));
    expect(await screen.findByText('L WRIST')).toBeInTheDocument();
    expect(createInjury).toHaveBeenCalledWith(expect.objectContaining({ side: 'left', area: 'wrist' }));
    expect(screen.getByRole('dialog', { name: 'L wrist' })).toBeInTheDocument();
  });

  it('closes a log', async () => {
    updateInjury.mockImplementation(async (id, fields) => ({ ...INJURY, ...fields }));
    render(<App />);
    const user = userEvent.setup();
    await openTheInjury(user);
    await user.click(screen.getByRole('button', { name: 'Close this log' }));
    expect(updateInjury).toHaveBeenCalledWith('i1', { closed_on: today });
    expect(await screen.findByRole('button', { name: 'Reopen' })).toBeInTheDocument();
  });

  it("says so when closing a log doesn't save", async () => {
    updateInjury.mockRejectedValue(new Error('offline'));
    render(<App />);
    const user = userEvent.setup();
    await openTheInjury(user);
    await user.click(screen.getByRole('button', { name: 'Close this log' }));
    expect(await screen.findByText("Couldn't save — check your connection and try again.")).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close this log' })).toBeInTheDocument();
  });

  it('asks for the password again when the session has gone', async () => {
    listInjuries.mockRejectedValue({ code: '42501' });
    render(<App />);
    await holdTitle();
    expect(await screen.findByRole('dialog', { name: 'Tweaks' })).toBeInTheDocument();
  });

  it('goes back to the board if the password sheet is closed instead', async () => {
    listInjuries.mockRejectedValue({ code: '42501' });
    render(<App />);
    await holdTitle();
    fireEvent.click(await screen.findByRole('dialog', { name: 'Tweaks' }));
    expect(await screen.findByText('THE BOARD')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('stays in Tweaks and reloads after unlocking again', async () => {
    listInjuries.mockRejectedValueOnce({ code: '42501' });
    signInToTweaks.mockResolvedValue(true);
    render(<App />);
    const user = userEvent.setup();
    await holdTitle();
    await user.type(await screen.findByLabelText('Password'), 'hunter2');
    await user.click(screen.getByRole('button', { name: 'Unlock' }));
    expect(await screen.findByText('RH ring finger')).toBeInTheDocument();
    expect(screen.getByText('TWEAKS')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('keeps a check-in being written when the session has gone', async () => {
    createCheckin
      .mockRejectedValueOnce({ code: '42501' })
      .mockImplementation(async (fields) => ({ id: 'c3', created_at: `${today}T10:00:00Z`, ...fields }));
    signInToTweaks.mockResolvedValue(true);
    render(<App />);
    const user = userEvent.setup();
    await holdTitle();
    await user.click(await screen.findByRole('button', { name: 'Check in' }));
    await user.type(screen.getByLabelText("How's it feeling?"), 'Bit stiff');
    await user.click(screen.getByRole('button', { name: 'Save check-in' }));
    await user.type(await screen.findByLabelText('Password'), 'hunter2');
    await user.click(screen.getByRole('button', { name: 'Unlock' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Tweaks' })).not.toBeInTheDocument());
    expect(screen.getByLabelText("How's it feeling?")).toHaveValue('Bit stiff');
    await user.click(screen.getByRole('button', { name: 'Save check-in' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(createCheckin).toHaveBeenLastCalledWith(expect.objectContaining({ injury_id: 'i1', notes: 'Bit stiff' }));
  });

  it('stays on the injury page after unlocking from it, and reloads', async () => {
    updateInjury.mockRejectedValue({ code: '42501' });
    signInToTweaks.mockResolvedValue(true);
    render(<App />);
    const user = userEvent.setup();
    await openTheInjury(user);
    await user.click(screen.getByRole('button', { name: 'Close this log' }));
    await user.type(await screen.findByLabelText('Password'), 'hunter2');
    listInjuries.mockClear();
    await user.click(screen.getByRole('button', { name: 'Unlock' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByText('RH RING FINGER')).toBeInTheDocument();
    expect(listInjuries).toHaveBeenCalledTimes(1);
  });
});

describe('App (volumes setup)', () => {
  const PHOTO = 'https://cdn.example/b1.jpg';
  const OLD = 'https://cdn.example/old.jpg';
  const boardWith = (volumes) => ({ id: 'b1', name: 'Home Board', photo_url: PHOTO, volumes });
  const unmarked = (id, name) => ({ id, name, points: [], photoUrl: null });
  // A volume saved before sides were listed: Top / Left / Right were implied.
  const LEGACY_VOL1 = { id: 'v1', name: 'Vol1', faces: [] };
  const upgraded = (id, name, faces) => ({ id, name, sidesListed: true, faces });

  beforeEach(() => {
    getTweaksSession.mockResolvedValue({ user: { id: 'u1' } });
    saveVolumes.mockImplementation(async (id, volumes) => boardWith(volumes));
  });

  async function openVolumes(user) {
    await holdTitle();
    await user.click(await screen.findByRole('button', { name: 'Volumes' }));
    const photo = await screen.findByAltText('Climbing board');
    vi.spyOn(photo.parentElement, 'getBoundingClientRect').mockReturnValue({
      left: 0, top: 0, width: 200, height: 100, right: 200, bottom: 100,
    });
    return photo.parentElement;
  }

  it('has no Volumes button until the board has a photo', async () => {
    render(<App />);
    await holdTitle();
    expect(screen.getByText('TWEAKS')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Volumes' })).not.toBeInTheDocument();
  });

  it('adds a volume with Top, Left and Right sides to a board that has never had any', async () => {
    getOrCreateBoard.mockResolvedValue({ id: 'b1', name: 'Home Board', photo_url: PHOTO });
    render(<App />);
    const user = userEvent.setup();
    await openVolumes(user);

    expect(screen.getByText(/No volumes yet/)).toBeInTheDocument();
    expect(screen.getByText(/press Outline or Pin next to one of its sides/)).toBeInTheDocument();
    await user.type(screen.getByPlaceholderText('e.g. Vol1'), 'Vol1');
    await user.click(screen.getByRole('button', { name: 'Add volume' }));

    const sideId = expect.stringMatching(/^f-/);
    await waitFor(() => expect(saveVolumes).toHaveBeenCalledWith('b1', [
      upgraded(expect.stringMatching(/^v-/), 'Vol1', [unmarked(sideId, 'Top'), unmarked(sideId, 'Left'), unmarked(sideId, 'Right')]),
    ]));
    expect(await screen.findByRole('button', { name: 'Rename Vol1' })).toBeInTheDocument();
    expect(screen.getAllByText('Not marked')).toHaveLength(3);
  });

  it("won't add a second volume with the same name", async () => {
    getOrCreateBoard.mockResolvedValue(boardWith([LEGACY_VOL1]));
    render(<App />);
    const user = userEvent.setup();
    await openVolumes(user);

    await user.type(screen.getByPlaceholderText('e.g. Vol1'), 'vol1');
    expect(screen.getByRole('button', { name: 'Add volume' })).toBeDisabled();
  });

  it('outlines a side by tapping its corners, with undo', async () => {
    getOrCreateBoard.mockResolvedValue(boardWith([LEGACY_VOL1]));
    render(<App />);
    const user = userEvent.setup();
    const panel = await openVolumes(user);

    await user.click(screen.getByRole('button', { name: 'Outline Vol1 Top' }));
    expect(screen.getByText('Tap the corners of Vol1 Top')).toBeInTheDocument();
    fireEvent.click(panel, { clientX: 20, clientY: 10 });
    fireEvent.click(panel, { clientX: 60, clientY: 10 });
    fireEvent.click(panel, { clientX: 190, clientY: 90 });
    await user.click(screen.getByRole('button', { name: 'Undo point' }));
    expect(screen.getByRole('button', { name: 'Done' })).toBeDisabled();
    fireEvent.click(panel, { clientX: 40, clientY: 40 });
    await user.click(screen.getByRole('button', { name: 'Done' }));

    await waitFor(() => expect(saveVolumes).toHaveBeenCalledWith('b1', [upgraded('v1', 'Vol1', [
      { id: 'v1-top', name: 'Top', points: [{ x: 0.1, y: 0.1 }, { x: 0.3, y: 0.1 }, { x: 0.2, y: 0.4 }], photoUrl: PHOTO },
      unmarked('v1-left', 'Left'),
      unmarked('v1-right', 'Right'),
    ])]));
    expect(await screen.findByText('Outlined')).toBeInTheDocument();
    expect(screen.getByTestId('face-shape')).toBeInTheDocument();
  });

  it('pins a side you cannot see with a single tap', async () => {
    getOrCreateBoard.mockResolvedValue(boardWith([{ id: 'v2', name: 'Vol2', faces: [] }]));
    render(<App />);
    const user = userEvent.setup();
    const panel = await openVolumes(user);

    await user.click(screen.getByRole('button', { name: 'Pin Vol2 Left' }));
    expect(screen.getByText('Tap where Vol2 Left is')).toBeInTheDocument();
    fireEvent.click(panel, { clientX: 100, clientY: 80 });

    await waitFor(() => expect(saveVolumes).toHaveBeenCalledWith('b1', [upgraded('v2', 'Vol2', [
      unmarked('v2-top', 'Top'),
      { id: 'v2-left', name: 'Left', points: [{ x: 0.5, y: 0.8 }], photoUrl: PHOTO },
      unmarked('v2-right', 'Right'),
    ])]));
    expect(await screen.findByText('Pinned')).toBeInTheDocument();
  });

  it('keeps the outline open to retry when saving fails', async () => {
    getOrCreateBoard.mockResolvedValue(boardWith([LEGACY_VOL1]));
    saveVolumes.mockRejectedValueOnce(new Error('offline'));
    render(<App />);
    const user = userEvent.setup();
    const panel = await openVolumes(user);

    await user.click(screen.getByRole('button', { name: 'Outline Vol1 Top' }));
    fireEvent.click(panel, { clientX: 20, clientY: 10 });
    fireEvent.click(panel, { clientX: 60, clientY: 10 });
    fireEvent.click(panel, { clientX: 40, clientY: 40 });
    await user.click(screen.getByRole('button', { name: 'Done' }));

    expect(await screen.findByText('Could not save the volumes — check your connection and try again.')).toBeInTheDocument();
    expect(screen.getByText('Tap the corners of Vol1 Top')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Done' }));
    expect(await screen.findByText('Outlined')).toBeInTheDocument();
  });

  it('keeps sides marked before sides were listed, flags an old photo, and removes a side', async () => {
    getOrCreateBoard.mockResolvedValue(boardWith([{ id: 'v1', name: 'Vol1', faces: [
      { id: 'f1', name: 'Top', points: [{ x: 0.5, y: 0.5 }], photoUrl: OLD },
      { id: 'f2', name: 'Left', points: [{ x: 0.5, y: 0.5 }], photoUrl: PHOTO },
      { id: 'f3', name: 'Under', points: [{ x: 0.6, y: 0.9 }], photoUrl: PHOTO },
    ] }]));
    render(<App />);
    const user = userEvent.setup();
    await openVolumes(user);

    expect(screen.getByText('Old photo — re-mark')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Rename Vol1 Under' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Remove Vol1 Left' }));
    await waitFor(() => expect(saveVolumes).toHaveBeenCalledWith('b1', [upgraded('v1', 'Vol1', [
      { id: 'f1', name: 'Top', points: [{ x: 0.5, y: 0.5 }], photoUrl: OLD },
      unmarked('v1-right', 'Right'),
      { id: 'f3', name: 'Under', points: [{ x: 0.6, y: 0.9 }], photoUrl: PHOTO },
    ])]));
  });

  it('adds a side, but not one whose name the volume already has', async () => {
    getOrCreateBoard.mockResolvedValue(boardWith([LEGACY_VOL1]));
    render(<App />);
    const user = userEvent.setup();
    await openVolumes(user);

    await user.click(screen.getByRole('button', { name: '+ Add side' }));
    await user.type(screen.getByPlaceholderText('Side name'), 'top');
    expect(screen.getByRole('button', { name: 'Add side' })).toBeDisabled();
    await user.clear(screen.getByPlaceholderText('Side name'));
    await user.type(screen.getByPlaceholderText('Side name'), 'Under');
    await user.click(screen.getByRole('button', { name: 'Add side' }));

    await waitFor(() => expect(saveVolumes).toHaveBeenCalledWith('b1', [upgraded('v1', 'Vol1', [
      unmarked('v1-top', 'Top'), unmarked('v1-left', 'Left'), unmarked('v1-right', 'Right'),
      unmarked(expect.stringMatching(/^f-/), 'Under'),
    ])]));
    expect(await screen.findByRole('button', { name: 'Pin Vol1 Under' })).toBeInTheDocument();
  });

  it('renames a side, keeping its marking', async () => {
    getOrCreateBoard.mockResolvedValue(boardWith([upgraded('v1', 'Vol1', [
      { id: 'f1', name: 'Top', points: [{ x: 0.5, y: 0.5 }], photoUrl: PHOTO },
      unmarked('f2', 'Left'),
    ])]));
    render(<App />);
    const user = userEvent.setup();
    await openVolumes(user);

    await user.click(screen.getByRole('button', { name: 'Rename Vol1 Top' }));
    const input = screen.getByRole('textbox', { name: 'New name' });
    await user.clear(input);
    await user.type(input, 'left');
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    await user.clear(input);
    await user.type(input, 'Pinch side');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(saveVolumes).toHaveBeenCalledWith('b1', [upgraded('v1', 'Vol1', [
      { id: 'f1', name: 'Pinch side', points: [{ x: 0.5, y: 0.5 }], photoUrl: PHOTO },
      unmarked('f2', 'Left'),
    ])]));
    expect(await screen.findByRole('button', { name: 'Outline Vol1 Pinch side' })).toBeInTheDocument();
  });

  it('renames a volume', async () => {
    getOrCreateBoard.mockResolvedValue(boardWith([upgraded('v1', 'Vol1', [unmarked('f1', 'Top')])]));
    render(<App />);
    const user = userEvent.setup();
    await openVolumes(user);

    await user.click(screen.getByRole('button', { name: 'Rename Vol1' }));
    const input = screen.getByRole('textbox', { name: 'New name' });
    await user.clear(input);
    await user.type(input, 'Green');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(saveVolumes).toHaveBeenCalledWith('b1', [upgraded('v1', 'Green', [unmarked('f1', 'Top')])]));
    expect(await screen.findByRole('button', { name: 'Rename Green' })).toBeInTheDocument();
  });

  it('deletes a volume after confirming', async () => {
    getOrCreateBoard.mockResolvedValue(boardWith([LEGACY_VOL1]));
    render(<App />);
    const user = userEvent.setup();
    await openVolumes(user);

    await user.click(screen.getByRole('button', { name: 'Delete Vol1' }));
    await user.click(screen.getByRole('button', { name: 'Yes, delete' }));
    await waitFor(() => expect(saveVolumes).toHaveBeenCalledWith('b1', []));
  });
});

describe('App (faces and tags in the hold editor)', () => {
  const PHOTO = 'https://cdn.example/b1.jpg';
  const OLD = 'https://cdn.example/old.jpg';
  const TOP = [{ x: 0.25, y: 0.125 }, { x: 0.75, y: 0.125 }, { x: 0.5, y: 0.5 }];
  const VOLUMES = [{ id: 'v1', name: 'Vol1', faces: [
    { id: 'f1', name: 'Top', points: TOP, photoUrl: PHOTO },
    { id: 'f9', name: 'Left', points: [{ x: 0.1, y: 0.9 }], photoUrl: OLD },
  ] }];
  const TOP_FACE = { volumeId: 'v1', faceId: 'f1', label: 'Vol1 Top', points: TOP };

  beforeEach(() => {
    getOrCreateBoard.mockResolvedValue({ id: 'b1', name: 'Home Board', photo_url: PHOTO, volumes: VOLUMES });
  });

  function mockPhotoRect(photo, width = 200, height = 100) {
    vi.spyOn(photo.parentElement, 'getBoundingClientRect').mockReturnValue({
      left: 0, top: 0, width, height, right: width, bottom: height,
    });
  }

  it('adds a face from its button and saves a faces-only problem without a highlight image', async () => {
    createProblem.mockResolvedValue({ id: 'p1', name: 'Vol Line', grade: '', setter: '', notes: '', holds: [] });
    render(<App />);
    const user = userEvent.setup();
    await user.click(await screen.findByText('New problem'));

    expect(screen.queryByRole('button', { name: 'Vol1 Left' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Vol1 Top' }));
    expect(screen.getByRole('button', { name: 'Vol1 Top' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('face-shape')).toBeInTheDocument();

    await user.type(screen.getByPlaceholderText('e.g. Gaston Traverse'), 'Vol Line');
    await user.click(screen.getByText('Save problem'));

    await waitFor(() => expect(createProblem).toHaveBeenCalledWith('b1', {
      name: 'Vol Line', grade: '', setter: '', notes: '',
      holds: [{ x: 0.5, y: 0.25, type: 'start', face: TOP_FACE }],
      photoUrl: PHOTO,
    }));
    expect(uploadProblemMask).not.toHaveBeenCalled();
  });

  it('takes a face back off the problem when its button is tapped again', async () => {
    render(<App />);
    const user = userEvent.setup();
    await user.click(await screen.findByText('New problem'));

    await user.click(screen.getByRole('button', { name: 'Vol1 Top' }));
    expect(screen.getByTestId('face-shape')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Vol1 Top' }));

    expect(screen.getByRole('button', { name: 'Vol1 Top' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByTestId('face-shape')).not.toBeInTheDocument();
  });

  it('places a hold on a lit face instead of removing the face', async () => {
    render(<App />);
    const user = userEvent.setup();
    await user.click(await screen.findByText('New problem'));
    const photo = await screen.findByAltText('Climbing board');
    mockPhotoRect(photo);

    await user.click(screen.getByRole('button', { name: 'Vol1 Top' }));
    // Centre of the Top face.
    fireEvent.click(photo.parentElement, { clientX: 100, clientY: 25 });

    expect(screen.getAllByTestId('hold-marker')).toHaveLength(1);
    expect(screen.getByTestId('face-shape')).toBeInTheDocument();
  });

  it("lands a hold's highlight on the right hold when another is removed before it finishes", async () => {
    loadSegmenter.mockResolvedValue({ device: 'webgpu' });
    computeEmbedding.mockResolvedValue({ width: 400, height: 200 });
    let resolveMask;
    maskAtPoint.mockReturnValue(new Promise((resolve) => { resolveMask = resolve; }));
    render(<App />);
    const user = userEvent.setup();
    await user.click(await screen.findByText('New problem'));
    const photo = await screen.findByAltText('Climbing board');
    mockPhotoRect(photo, 400, 200);
    await waitFor(() => expect(computeEmbedding).toHaveBeenCalled());

    fireEvent.click(photo.parentElement, { clientX: 40, clientY: 180 });
    fireEvent.click(photo.parentElement, { clientX: 360, clientY: 180 });
    fireEvent.click(photo.parentElement, { clientX: 40, clientY: 180 });
    expect(screen.getAllByTestId('hold-marker')).toHaveLength(1);

    await act(async () => resolveMask({ width: 400, height: 200, data: new Uint8Array(400 * 200).fill(1) }));
    expect(screen.getAllByTestId('hold-highlight')).toHaveLength(1);
    expect(screen.queryByTestId('hold-marker')).not.toBeInTheDocument();
  });

  it('saves the highlight image from the segmented holds only when a face is in the problem', async () => {
    loadSegmenter.mockResolvedValue({ device: 'webgpu' });
    computeEmbedding.mockResolvedValue({ width: 400, height: 200 });
    const mask = { width: 400, height: 200, data: new Uint8Array(400 * 200) };
    maskAtPoint.mockResolvedValue(mask);
    const blob = new Blob(['mask'], { type: 'image/png' });
    compositeMaskBlob.mockResolvedValue(blob);
    createProblem.mockResolvedValue({ id: 'p1', name: 'Vol Line', grade: '', setter: '', notes: '', holds: [] });
    uploadProblemMask.mockResolvedValue({ id: 'p1', name: 'Vol Line', grade: '', setter: '', notes: '', holds: [], mask_url: 'https://cdn.example/m.png' });
    render(<App />);
    const user = userEvent.setup();
    await user.click(await screen.findByText('New problem'));
    const photo = await screen.findByAltText('Climbing board');
    mockPhotoRect(photo, 400, 200);

    await user.click(screen.getByRole('button', { name: 'Vol1 Top' }));
    await waitFor(() => expect(computeEmbedding).toHaveBeenCalled());
    fireEvent.click(photo.parentElement, { clientX: 200, clientY: 180 });
    await waitFor(() => expect(screen.getByTestId('hold-highlight')).toBeInTheDocument());

    await user.type(screen.getByPlaceholderText('e.g. Gaston Traverse'), 'Vol Line');
    await user.click(screen.getByText('Save problem'));

    await waitFor(() => expect(uploadProblemMask).toHaveBeenCalledWith('p1', blob));
    expect(compositeMaskBlob).toHaveBeenCalledWith([{ mask, color: '#2E6B3E' }], 400, 200);
  });

  it("lets a face that's no longer marked on the board still be removed from a problem", async () => {
    getOrCreateBoard.mockResolvedValue({ id: 'b1', name: 'Home Board', photo_url: PHOTO, volumes: [] });
    listProblems.mockResolvedValue([{
      id: 'p1', name: 'Vol Line', grade: 'V2', setter: 'Rob', notes: '', photo_url: PHOTO,
      holds: [{ x: 0.2, y: 0.3, type: 'start' }, { x: 0.5, y: 0.25, type: 'hold', face: TOP_FACE }],
    }]);
    updateProblem.mockResolvedValue({ id: 'p1', name: 'Vol Line', grade: 'V2', setter: 'Rob', notes: '', photo_url: PHOTO, holds: [] });
    render(<App />);
    const user = userEvent.setup();
    await user.click(await screen.findByText('Vol Line'));
    await user.click(await screen.findByRole('button', { name: 'Edit holds' }));

    const chip = screen.getByRole('button', { name: 'Vol1 Top' });
    expect(chip).toHaveAttribute('aria-pressed', 'true');
    await user.click(chip);
    expect(screen.queryByRole('button', { name: 'Vol1 Top' })).not.toBeInTheDocument();
    await user.click(screen.getByText('Save changes'));

    await waitFor(() => expect(updateProblem).toHaveBeenCalledWith('p1', expect.objectContaining({
      holds: [{ x: 0.2, y: 0.3, type: 'start' }],
    })));
  });

  it('treats a face that was deleted and marked again as the same face, so it is never added twice', async () => {
    listProblems.mockResolvedValue([{
      id: 'p1', name: 'Vol Line', grade: 'V2', setter: 'Rob', notes: '', photo_url: PHOTO,
      holds: [{ x: 0.2, y: 0.3, type: 'start' }, { x: 0.5, y: 0.25, type: 'hold', face: { ...TOP_FACE, volumeId: 'v-old', faceId: 'f-old' } }],
    }]);
    updateProblem.mockResolvedValue({ id: 'p1', name: 'Vol Line', grade: 'V2', setter: 'Rob', notes: '', photo_url: PHOTO, holds: [] });
    render(<App />);
    const user = userEvent.setup();
    await user.click(await screen.findByText('Vol Line'));
    await user.click(await screen.findByRole('button', { name: 'Edit holds' }));

    expect(screen.getAllByRole('button', { name: 'Vol1 Top' })).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Vol1 Top' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByRole('button', { name: 'Vol1 Top' }));
    expect(screen.getByRole('button', { name: 'Vol1 Top' })).toHaveAttribute('aria-pressed', 'false');
    await user.click(screen.getByText('Save changes'));

    await waitFor(() => expect(updateProblem).toHaveBeenCalled());
    expect(updateProblem.mock.calls[0][1].holds).toEqual([{ x: 0.2, y: 0.3, type: 'start' }]);
  });

  it("names a renamed side by its new name, and doesn't mistake a new side with its old name for it", async () => {
    getOrCreateBoard.mockResolvedValue({ id: 'b1', name: 'Home Board', photo_url: PHOTO, volumes: [
      { id: 'v1', name: 'Vol1', sidesListed: true, faces: [
        { id: 'f1', name: 'Upper', points: TOP, photoUrl: PHOTO },
        { id: 'f9', name: 'Top', points: [{ x: 0.1, y: 0.9 }], photoUrl: PHOTO },
      ] },
    ] });
    listProblems.mockResolvedValue([{
      id: 'p1', name: 'Vol Line', grade: 'V2', setter: 'Rob', notes: '', photo_url: PHOTO,
      holds: [{ x: 0.5, y: 0.25, type: 'start', face: TOP_FACE }],
    }]);
    render(<App />);
    const user = userEvent.setup();
    await user.click(await screen.findByText('Vol Line'));
    await user.click(await screen.findByRole('button', { name: 'Edit holds' }));

    expect(screen.getByRole('button', { name: 'Vol1 Upper' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Vol1 Top' })).toHaveAttribute('aria-pressed', 'false');
    await user.click(screen.getByRole('button', { name: 'Vol1 Upper' }));
    expect(screen.getByRole('button', { name: 'Vol1 Upper' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('only offers faces marked on the photo of the problem being edited', async () => {
    listProblems.mockResolvedValue([{
      id: 'p1', name: 'Old Line', grade: 'V2', setter: 'Rob', notes: '', photo_url: OLD,
      holds: [{ x: 0.2, y: 0.3, type: 'start' }],
    }]);
    render(<App />);
    const user = userEvent.setup();
    await user.click(await screen.findByText('Old Line'));
    await user.click(await screen.findByRole('button', { name: 'Edit holds' }));

    expect(screen.getByRole('button', { name: 'Vol1 Left' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Vol1 Top' })).not.toBeInTheDocument();
  });
});
