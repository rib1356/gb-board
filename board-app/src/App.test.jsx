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
  rateProblem: vi.fn(),
  updateProblem: vi.fn(),
  restoreProblem: vi.fn(),
  listTicks: vi.fn(),
  listBoardTicks: vi.fn(),
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
vi.mock('./lib/segment', () => ({
  loadSegmenter: vi.fn(),
  computeEmbedding: vi.fn(),
  maskAtPoint: vi.fn(),
  maskToDataUrl: vi.fn(() => 'data:image/png;base64,FAKE'),
  compositeMaskBlob: vi.fn(),
}));

import { getOrCreateBoard, listProblems, uploadBoardPhoto, uploadProblemMask, createProblem, deleteProblem, rateProblem, updateProblem, restoreProblem, listTicks, listBoardTicks, createTick, deleteTick, listClimbers, createClimber, saveWarmup, saveVolumes, listWarmupSessions, createWarmupSession, deleteWarmupSession } from './lib/board';
import { resizeFileToBlob } from './lib/image';
import { loadSegmenter, computeEmbedding, maskAtPoint, maskToDataUrl, compositeMaskBlob } from './lib/segment';
import App from './App';

const BOARD = { id: 'b1', name: 'Home Board', photo_url: null };

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  getOrCreateBoard.mockResolvedValue(BOARD);
  listProblems.mockResolvedValue([]);
  listTicks.mockResolvedValue([]);
  listBoardTicks.mockResolvedValue([]);
  listClimbers.mockResolvedValue([]);
  listWarmupSessions.mockResolvedValue([]);
  loadSegmenter.mockRejectedValue(new Error('segmentation unavailable in tests'));
});

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

    await screen.findByText('You: Rob');
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

    await screen.findByText('You: Rob');
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

    await screen.findByText('You: Rob');
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

    await screen.findByText('You: Rob');
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

    await screen.findByText('You: Rob');
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
    await user.click(screen.getByText('You: Rob'));
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
  it('sets a rating from the detail view', async () => {
    listProblems.mockResolvedValue([
      { id: 'p1', name: 'Gaston Traverse', grade: 'V5', setter: 'Rob', notes: '', holds: [], rating: null },
    ]);
    rateProblem.mockResolvedValue({
      id: 'p1', name: 'Gaston Traverse', grade: 'V5', setter: 'Rob', notes: '', holds: [], rating: 3,
    });
    render(<App />);
    const user = userEvent.setup();

    await user.click(await screen.findByText('Gaston Traverse'));
    await user.click(await screen.findByRole('button', { name: 'Rate 3 stars' }));

    await waitFor(() => expect(rateProblem).toHaveBeenCalledWith('p1', 3));
  });

  it('clears a rating when tapping the already-selected star', async () => {
    listProblems.mockResolvedValue([
      { id: 'p1', name: 'Gaston Traverse', grade: 'V5', setter: 'Rob', notes: '', holds: [], rating: 3 },
    ]);
    rateProblem.mockResolvedValue({
      id: 'p1', name: 'Gaston Traverse', grade: 'V5', setter: 'Rob', notes: '', holds: [], rating: null,
    });
    render(<App />);
    const user = userEvent.setup();

    await user.click(await screen.findByText('Gaston Traverse'));
    await user.click(await screen.findByRole('button', { name: 'Rate 3 stars' }));

    await waitFor(() => expect(rateProblem).toHaveBeenCalledWith('p1', null));
  });

  it('shows a saved rating in the problem list', async () => {
    listProblems.mockResolvedValue([
      { id: 'p1', name: 'Gaston Traverse', grade: 'V5', setter: 'Rob', notes: '', holds: [], rating: 4 },
    ]);
    render(<App />);

    expect(await screen.findByLabelText('Rating: 4 out of 5')).toBeInTheDocument();
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

    expect(await screen.findByText('You: Bob')).toBeInTheDocument();
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
    expect(await screen.findByText('You: Charlie')).toBeInTheDocument();
  });

  it('restores a previously selected climber from localStorage on load', async () => {
    localStorage.setItem('board-app:currentClimberId', 'c1');
    listClimbers.mockResolvedValue([{ id: 'c1', name: 'Alice' }]);
    render(<App />);

    expect(await screen.findByText('You: Alice')).toBeInTheDocument();
  });

  it('ignores a stored climber id that no longer matches any fetched climber', async () => {
    localStorage.setItem('board-app:currentClimberId', 'ghost');
    listClimbers.mockResolvedValue([{ id: 'c1', name: 'Alice' }]);
    render(<App />);

    expect(await screen.findByText("Who's climbing?")).toBeInTheDocument();
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
    await user.click(screen.getByRole('button', { name: /Sat 22 Aug 2026.*1 problem · 1 new · 1 flash/ }));
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
    await screen.findByText(`You: ${name}`);
    await user.click(screen.getByRole('button', { name: 'Logbook' }));
    return user;
  };
  const day = (label) => screen.getByRole('button', { name: new RegExp(label) });

  it('opens from beside the climber pill with every day collapsed, newest first', async () => {
    await openAs('Rob');

    expect(screen.getByText("Rob's logbook")).toBeInTheDocument();
    expect(screen.getByText('2 sessions · 3 sends')).toBeInTheDocument();
    const days = screen.getAllByRole('button', { name: /Sept 2026/ });
    expect(days.map((d) => d.textContent)).toEqual([
      'Tue 8 Sept 20261 problem',
      'Tue 1 Sept 20262 problems · 2 new · 1 flash',
    ]);
    days.forEach((d) => expect(d).toHaveAttribute('aria-expanded', 'false'));
    expect(screen.queryByText('Gaston Traverse')).not.toBeInTheDocument();
    expect(screen.queryByText('No board photo yet')).not.toBeInTheDocument();
  });

  it('opens a day to show what you logged that session, marking first sends and flashes', async () => {
    const user = await openAs('Rob');

    await user.click(day('Tue 1 Sept 2026'));
    expect(day('Tue 1 Sept 2026')).toHaveAttribute('aria-expanded', 'true');
    const rows = screen.getAllByRole('listitem');
    expect(rows).toHaveLength(2);
    expect(within(rows[0]).getByText('Crimpy Corner')).toBeInTheDocument();
    expect(within(rows[0]).getByText('V3')).toBeInTheDocument();
    expect(within(rows[0]).getByText('New')).toBeInTheDocument();
    expect(within(rows[0]).getByText('Flash')).toBeInTheDocument();
    expect(within(rows[1]).getByText('Gaston Traverse')).toBeInTheDocument();
    expect(within(rows[1]).getByText('New')).toBeInTheDocument();
    expect(within(rows[1]).queryByText('Flash')).not.toBeInTheDocument();
    expect(day('Tue 8 Sept 2026')).toHaveAttribute('aria-expanded', 'false');

    await user.click(day('Tue 1 Sept 2026'));
    expect(screen.queryAllByRole('listitem')).toHaveLength(0);
  });

  it("doesn't mark a repeat as new", async () => {
    const user = await openAs('Rob');

    await user.click(day('Tue 8 Sept 2026'));
    const row = screen.getByRole('listitem');
    expect(within(row).getByText('Crimpy Corner')).toBeInTheDocument();
    expect(within(row).queryByText('New')).not.toBeInTheDocument();
  });

  it('opens a problem from a day, and comes back to the logbook with the same days open', async () => {
    listTicks.mockResolvedValue([TICKS[1]]);
    const user = await openAs('Rob');

    await user.click(day('Tue 8 Sept 2026'));
    await user.click(day('Tue 1 Sept 2026'));
    await user.click(screen.getByRole('button', { name: /Gaston Traverse/ }));
    expect(await screen.findByText('Log a send')).toBeInTheDocument();
    expect(listTicks).toHaveBeenCalledWith('p1');

    await user.click(screen.getByRole('button', { name: /logbook/i }));
    expect(screen.getByText("Rob's logbook")).toBeInTheDocument();
    expect(day('Tue 8 Sept 2026')).toHaveAttribute('aria-expanded', 'true');
    expect(day('Tue 1 Sept 2026')).toHaveAttribute('aria-expanded', 'true');
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
    expect(screen.queryAllByRole('button', { name: /Sept 2026/ })).toHaveLength(0);
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

describe('App (list scroll position)', () => {
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

  it('puts you back where you were in the logbook when you go back', async () => {
    localStorage.setItem('board-app:currentClimberId', 'c1');
    listClimbers.mockResolvedValue([{ id: 'c1', name: 'Rob' }]);
    listProblems.mockResolvedValue(PROBLEMS);
    listBoardTicks.mockResolvedValue([
      { id: 't1', problem_id: 'p2', sent_by: 'Rob', sent_on: '2026-09-01', created_at: '2026-09-01T10:00:00Z', flash: false },
    ]);
    render(<App />);
    const user = userEvent.setup();
    await screen.findByText('You: Rob');
    await user.click(screen.getByRole('button', { name: 'Logbook' }));
    await user.click(screen.getByRole('button', { name: /Tue 1 Sept 2026/ }));
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
    await screen.findByText('You: Rob');
    await user.click(screen.getByRole('button', { name: 'Logbook' }));
    await user.click(screen.getByRole('button', { name: /Tue 1 Sept 2026/ }));
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

  it('does not jump the list when coming back from somewhere other than a problem', async () => {
    listProblems.mockResolvedValue(PROBLEMS);
    render(<App />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /warm-up/i }));
    await user.click(await screen.findByRole('button', { name: /board/i }));
    await screen.findByText('THE BOARD');
    expect(scrollTo).not.toHaveBeenCalledWith(0, 640);
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

describe('App (board setup is just for Rob)', () => {
  const WITH_PHOTO = { ...BOARD, photo_url: 'https://cdn.example/b1.jpg' };
  const climbAs = (name) => {
    localStorage.setItem('board-app:currentClimberId', 'c1');
    listClimbers.mockResolvedValue([{ id: 'c1', name }]);
  };

  it('shows Replace board photo and Volumes when Rob is climbing', async () => {
    climbAs('Rob');
    getOrCreateBoard.mockResolvedValue(WITH_PHOTO);
    render(<App />);
    await screen.findByText('You: Rob');
    expect(screen.getByLabelText('Replace board photo')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Volumes' })).toBeInTheDocument();
  });

  it('hides them from anyone else', async () => {
    climbAs('Shawn');
    getOrCreateBoard.mockResolvedValue(WITH_PHOTO);
    render(<App />);
    await screen.findByText('You: Shawn');
    expect(screen.queryByLabelText('Replace board photo')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Volumes' })).not.toBeInTheDocument();
  });

  it('hides them when nobody is picked', async () => {
    getOrCreateBoard.mockResolvedValue(WITH_PHOTO);
    render(<App />);
    await screen.findByAltText('Climbing board');
    expect(screen.queryByLabelText('Replace board photo')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Volumes' })).not.toBeInTheDocument();
  });

  it('still lets anyone upload the first photo of a board that has none', async () => {
    climbAs('Shawn');
    render(<App />);
    await screen.findByText('You: Shawn');
    expect(screen.getByLabelText('Upload a photo of your board')).toBeInTheDocument();
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
    localStorage.setItem('board-app:currentClimberId', 'c1');
    listClimbers.mockResolvedValue([{ id: 'c1', name: 'Rob' }]);
    saveVolumes.mockImplementation(async (id, volumes) => boardWith(volumes));
  });

  async function openVolumes(user) {
    await user.click(await screen.findByRole('button', { name: 'Volumes' }));
    const photo = await screen.findByAltText('Climbing board');
    vi.spyOn(photo.parentElement, 'getBoundingClientRect').mockReturnValue({
      left: 0, top: 0, width: 200, height: 100, right: 200, bottom: 100,
    });
    return photo.parentElement;
  }

  it('has no Volumes button until the board has a photo', async () => {
    render(<App />);
    await screen.findByText('THE BOARD');
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
