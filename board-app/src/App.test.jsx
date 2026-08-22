import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('./lib/board', () => ({
  getOrCreateBoard: vi.fn(),
  listProblems: vi.fn(),
  uploadBoardPhoto: vi.fn(),
  createProblem: vi.fn(),
  deleteProblem: vi.fn(),
  rateProblem: vi.fn(),
  updateProblem: vi.fn(),
}));
vi.mock('./lib/image', () => ({
  resizeFileToBlob: vi.fn(),
}));

import { getOrCreateBoard, listProblems, uploadBoardPhoto, createProblem, deleteProblem, rateProblem, updateProblem } from './lib/board';
import { resizeFileToBlob } from './lib/image';
import App from './App';

const BOARD = { id: 'b1', name: 'Home Board', photo_url: null };

beforeEach(() => {
  vi.clearAllMocks();
  getOrCreateBoard.mockResolvedValue(BOARD);
  listProblems.mockResolvedValue([]);
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
    expect(await screen.findByText('Gaston Traverse')).toBeInTheDocument();
    expect(screen.getByText('V5')).toBeInTheDocument();
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
      holds: [{ x: 0.5, y: 0.5, type: 'hold' }],
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
        holds: [{ x: 0.5, y: 0.5, type: 'hold' }],
        photoUrl: 'https://cdn.example/b1.jpg',
      })
    );
    expect(await screen.findByText('THE BOARD')).toBeInTheDocument();
  });

  it('lets the user pick a grade from the V-scale dropdown and saves it', async () => {
    getOrCreateBoard.mockResolvedValue({ id: 'b1', name: 'Home Board', photo_url: 'https://cdn.example/b1.jpg' });
    createProblem.mockResolvedValue({
      id: 'p1', name: 'Gaston Traverse', grade: 'V4', setter: '', notes: '',
      holds: [{ x: 0.5, y: 0.5, type: 'hold' }],
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
        holds: [{ x: 0.5, y: 0.5, type: 'hold' }],
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
      })
    );
    expect(await screen.findByText('Gaston Traverse v2')).toBeInTheDocument();
  });

  it('does not add a hold when tapping the photo while editing', async () => {
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

    expect(screen.getAllByTestId('hold-marker')).toHaveLength(1);
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
