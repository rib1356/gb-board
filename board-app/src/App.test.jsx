import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
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
  createTick: vi.fn(),
  deleteTick: vi.fn(),
  listClimbers: vi.fn(),
  createClimber: vi.fn(),
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

import { getOrCreateBoard, listProblems, uploadBoardPhoto, uploadProblemMask, createProblem, deleteProblem, rateProblem, updateProblem, restoreProblem, listTicks, createTick, deleteTick, listClimbers, createClimber } from './lib/board';
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
  listClimbers.mockResolvedValue([]);
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
    await user.click(await screen.findByRole('button', { name: 'Edit problem' }));

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
    await user.click(await screen.findByRole('button', { name: 'Edit problem' }));

    expect(await screen.findByAltText('Climbing board')).toHaveAttribute('src', 'https://cdn.example/old-board.jpg');
  });
});

describe('App (grade filter)', () => {
  it('filters the problem list by grade', async () => {
    listProblems.mockResolvedValue([
      { id: 'p1', name: 'Gaston Traverse', grade: 'V5', setter: 'Rob', notes: '', holds: [] },
      { id: 'p2', name: 'Crimpy Corner', grade: 'V3', setter: 'Rob', notes: '', holds: [] },
    ]);
    render(<App />);
    const user = userEvent.setup();

    await screen.findByText('Gaston Traverse');
    await user.selectOptions(screen.getByRole('combobox', { name: /filter by grade/i }), 'V5');

    expect(screen.getByText('Gaston Traverse')).toBeInTheDocument();
    expect(screen.queryByText('Crimpy Corner')).not.toBeInTheDocument();
  });

  it('shows all problems again when the filter is reset to All', async () => {
    listProblems.mockResolvedValue([
      { id: 'p1', name: 'Gaston Traverse', grade: 'V5', setter: 'Rob', notes: '', holds: [] },
      { id: 'p2', name: 'Crimpy Corner', grade: 'V3', setter: 'Rob', notes: '', holds: [] },
    ]);
    render(<App />);
    const user = userEvent.setup();

    await screen.findByText('Gaston Traverse');
    const filter = screen.getByRole('combobox', { name: /filter by grade/i });
    await user.selectOptions(filter, 'V5');
    await user.selectOptions(filter, '');

    expect(screen.getByText('Gaston Traverse')).toBeInTheDocument();
    expect(screen.getByText('Crimpy Corner')).toBeInTheDocument();
  });
});

describe('App (edit flow)', () => {
  it("edits a problem's fields and saves them, leaving holds untouched", async () => {
    listProblems.mockResolvedValue([
      {
        id: 'p1', name: 'Gaston Traverse', grade: 'V5', setter: 'Rob', notes: 'crimpy',
        holds: [{ x: 0.2, y: 0.3, type: 'start' }],
      },
    ]);
    updateProblem.mockResolvedValue({
      id: 'p1', name: 'Gaston Traverse v2', grade: 'V6', setter: 'Rob', notes: 'crimpy',
      holds: [{ x: 0.2, y: 0.3, type: 'start' }],
    });
    render(<App />);
    const user = userEvent.setup();

    await user.click(await screen.findByText('Gaston Traverse'));
    await user.click(await screen.findByRole('button', { name: 'Edit problem' }));

    const nameInput = await screen.findByDisplayValue('Gaston Traverse');
    await user.clear(nameInput);
    await user.type(nameInput, 'Gaston Traverse v2');
    await user.selectOptions(screen.getByRole('combobox', { name: /grade/i }), 'V6');
    await user.click(screen.getByText('Save changes'));

    await waitFor(() =>
      expect(updateProblem).toHaveBeenCalledWith('p1', {
        name: 'Gaston Traverse v2', grade: 'V6', setter: 'Rob', notes: 'crimpy',
        holds: [{ x: 0.2, y: 0.3, type: 'start' }],
      })
    );
    expect(await screen.findByText('Gaston Traverse v2')).toBeInTheDocument();
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
    await user.click(await screen.findByRole('button', { name: 'Edit problem' }));

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
    await user.click(await screen.findByRole('button', { name: 'Edit problem' }));

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
    await user.click(await screen.findByRole('button', { name: 'Edit problem' }));
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

  it('logs a send from the detail view', async () => {
    listProblems.mockResolvedValue([
      { id: 'p1', name: 'Gaston Traverse', grade: 'V5', setter: 'Rob', notes: '', holds: [], send_count: 0, last_sent_on: null },
    ]);
    createTick.mockResolvedValue({ id: 't1', problem_id: 'p1', sent_on: '2026-08-22', notes: 'felt easy' });
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByText('Gaston Traverse'));
    await user.click(await screen.findByText('Log a send'));
    fireEvent.change(screen.getByLabelText('Send date'), { target: { value: '2026-08-22' } });
    await user.type(screen.getByLabelText('Send notes'), 'felt easy');
    await user.click(screen.getByText('Save entry'));

    await waitFor(() =>
      expect(createTick).toHaveBeenCalledWith('p1', { sentOn: '2026-08-22', notes: 'felt easy' })
    );
    expect(await screen.findByText('Sent ×1')).toBeInTheDocument();
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
