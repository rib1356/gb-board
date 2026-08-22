import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('./lib/board', () => ({
  getOrCreateBoard: vi.fn(),
  listProblems: vi.fn(),
  uploadBoardPhoto: vi.fn(),
  createProblem: vi.fn(),
}));
vi.mock('./lib/image', () => ({
  resizeFileToBlob: vi.fn(),
}));

import { getOrCreateBoard, listProblems, uploadBoardPhoto, createProblem } from './lib/board';
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
      })
    );
    expect(await screen.findByText('THE BOARD')).toBeInTheDocument();
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
