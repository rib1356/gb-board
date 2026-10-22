import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import CheckinSheet from './CheckinSheet';
import { loadDraft } from '../lib/checkinDrafts';

const TODAY = '2026-10-21';
const injury = { id: 'i1', side: 'right', area: 'finger', finger: 'ring' };
const C = (id, checked_on, extra = {}) => ({
  id, injury_id: 'i1', checked_on, created_at: `${checked_on}T09:00:00Z`,
  pain_low: 1, pain_high: 2, pain_peak: null, activities: [], notes: null, ...extra,
});
const oct13 = C('c13', '2026-10-13', { notes: 'Bit stiff in the morning' });
const oct10 = C('c10', '2026-10-10', { pain_low: 2, pain_high: 3, notes: 'Sore after the session' });

function renderSheet(props = {}) {
  const handlers = {
    onSave: vi.fn().mockResolvedValue({}),
    onDelete: vi.fn().mockResolvedValue(undefined),
    onClose: vi.fn(),
  };
  const all = { injury, checkins: [oct13, oct10], boardDays: new Set(), today: TODAY, editing: null, ...handlers, ...props };
  const view = render(<CheckinSheet {...all} />);
  return { ...all, ...view };
}

const notes = () => screen.getByLabelText("How's it feeling?");
const type = (value) => fireEvent.change(notes(), { target: { value } });
const pickDate = (value) => fireEvent.change(screen.getByLabelText('Check-in date'), { target: { value } });
const readout = () => screen.getByTestId('pain-readout').textContent;
const button = (name) => screen.getByRole('button', { name });
const save = () => fireEvent.click(button('Save check-in'));
const nudge = (name, key = 'ArrowRight') => fireEvent.keyDown(screen.getByRole('slider', { name }), { key });

beforeEach(() => localStorage.clear());

describe('CheckinSheet', () => {
  it('starts a new check-in from the last pain score and saves it', async () => {
    const { onSave, onClose } = renderSheet();
    expect(screen.getByRole('dialog', { name: 'RH ring finger' })).toBeInTheDocument();
    expect(screen.getByText('Today, Wed 21 Oct')).toBeInTheDocument();
    expect(readout()).toBe('1 – 2');
    expect(button('Save check-in')).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Discard' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();

    type('Felt fine');
    save();

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(onSave).toHaveBeenCalledWith({
      action: 'create',
      fields: {
        injury_id: 'i1', checked_on: '2026-10-21', pain_low: 1, pain_high: 2, pain_peak: null, activities: [], notes: 'Felt fine',
      },
    });
    expect(loadDraft('i1')).toBeNull();
  });

  it('keeps Save off on a first ever check-in until the pain is set', () => {
    renderSheet({ checkins: [] });
    expect(readout()).toBe('0');
    expect(button('Save check-in')).toBeDisabled();
    type('Felt fine');
    expect(button('Save check-in')).toBeDisabled();
    nudge('Highest pain');
    expect(button('Save check-in')).toBeEnabled();
    expect(readout()).toBe('0 – 0.5');
  });

  it('pre-ticks Board on a board day', () => {
    renderSheet({ boardDays: new Set([TODAY]) });
    expect(button('Board')).toHaveAttribute('aria-pressed', 'true');
    expect(button('Rest day')).toHaveAttribute('aria-pressed', 'false');
  });

  it('toggles activity chips and saves them', async () => {
    const { onSave } = renderSheet({ boardDays: new Set([TODAY]) });
    fireEvent.click(button('Taped'));
    fireEvent.click(button('Board'));
    expect(button('Taped')).toHaveAttribute('aria-pressed', 'true');
    expect(button('Board')).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(button('Board'));
    save();
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0][0].fields.activities).toEqual(['board', 'taped']);
  });

  describe('date', () => {
    it('opens the check-in already on a date picked before anything is touched', () => {
      renderSheet();
      pickDate('2026-10-13');
      expect(notes()).toHaveValue('Bit stiff in the morning');
      expect(button('Delete')).toBeInTheDocument();
      expect(screen.getByText('Tue 13 Oct')).toBeInTheDocument();
      expect(screen.queryByText(/There's already a check-in/)).not.toBeInTheDocument();
    });

    it('re-ticks Board for an untouched new check-in moved onto a board day', () => {
      renderSheet({ boardDays: new Set(['2026-10-18']) });
      expect(button('Board')).toHaveAttribute('aria-pressed', 'false');
      pickDate('2026-10-18');
      expect(button('Board')).toHaveAttribute('aria-pressed', 'true');
      expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
    });

    it('adds to the check-in already on a date picked after typing', async () => {
      const { onSave } = renderSheet();
      type('Rested it');
      pickDate('2026-10-13');
      expect(screen.getByText("There's already a check-in on 13 Oct — saving adds to it.")).toBeInTheDocument();
      expect(notes()).toHaveValue('Rested it');
      expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
      save();
      await waitFor(() => expect(onSave).toHaveBeenCalled());
      const plan = onSave.mock.calls[0][0];
      expect(plan).toMatchObject({ action: 'update', id: 'c13' });
      expect(plan.fields.notes).toBe('Bit stiff in the morning\n\nRested it');
    });

    it('moves a check-in being edited to the picked date', async () => {
      const { onSave } = renderSheet({ editing: oct13 });
      pickDate('2026-10-12');
      save();
      await waitFor(() => expect(onSave).toHaveBeenCalled());
      const plan = onSave.mock.calls[0][0];
      expect(plan).toMatchObject({ action: 'update', id: 'c13' });
      expect(plan.fields.checked_on).toBe('2026-10-12');
    });

    describe('with a check-in already on today', () => {
      const oct21 = C('c21', TODAY, { pain_low: 2, pain_high: 3, notes: 'Fine this morning' });
      const withToday = { checkins: [oct21, oct13, oct10] };

      it('opens it, ready to add to the notes', async () => {
        const { onSave } = renderSheet(withToday);
        expect(notes()).toHaveValue('Fine this morning');
        expect(notes()).not.toHaveFocus();
        expect(button('Delete')).toBeInTheDocument();
        expect(screen.queryByText(/There's already a check-in/)).not.toBeInTheDocument();

        type('Fine this morning\nSore after the board');
        save();
        await waitFor(() => expect(onSave).toHaveBeenCalled());
        expect(onSave).toHaveBeenCalledWith({
          action: 'update',
          id: 'c21',
          fields: {
            injury_id: 'i1', checked_on: TODAY, pain_low: 2, pain_high: 3, pain_peak: null, activities: [],
            notes: 'Fine this morning\nSore after the board',
          },
        });
      });

      it('starts a fresh check-in, leaving it be, when an empty day is picked before anything is touched', async () => {
        const { onSave } = renderSheet(withToday);
        pickDate('2026-10-20');
        expect(screen.getByText('Yesterday, Tue 20 Oct')).toBeInTheDocument();
        expect(notes()).toHaveValue('');
        expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
        save();
        await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
        const plan = onSave.mock.calls[0][0];
        expect(plan.action).toBe('create');
        expect(plan.id).toBeUndefined();
        expect(plan.fields.checked_on).toBe('2026-10-20');
      });

      it('opens the check-in on another day picked before anything is touched', async () => {
        const { onSave } = renderSheet(withToday);
        pickDate('2026-10-13');
        expect(notes()).toHaveValue('Bit stiff in the morning');
        expect(button('Delete')).toBeInTheDocument();
        save();
        await waitFor(() => expect(onSave).toHaveBeenCalled());
        expect(onSave.mock.calls[0][0]).toMatchObject({ action: 'update', id: 'c13', fields: { checked_on: '2026-10-13' } });
      });
    });

    it('ignores a cleared date', () => {
      renderSheet();
      pickDate('');
      expect(screen.getByText('Today, Wed 21 Oct')).toBeInTheDocument();
    });
  });

  describe('editing', () => {
    // Focusing the notes on a phone throws the keyboard up over the slider.
    it("leaves the keyboard down until you tap the notes", () => {
      renderSheet({ editing: oct13 });
      expect(notes()).toHaveValue('Bit stiff in the morning');
      expect(notes()).not.toHaveFocus();
    });

    it('asks before deleting, and Keep backs out', () => {
      const { onDelete } = renderSheet({ editing: oct13 });
      fireEvent.click(button('Delete'));
      expect(screen.getByText('Delete this check-in?')).toBeInTheDocument();
      fireEvent.click(button('Keep'));
      expect(screen.queryByText('Delete this check-in?')).not.toBeInTheDocument();
      expect(onDelete).not.toHaveBeenCalled();
    });

    it('deletes the check-in once confirmed', async () => {
      const { onDelete, onClose } = renderSheet({ editing: oct13 });
      type('Bit stiff in the morning, easing off');
      fireEvent.click(button('Delete'));
      fireEvent.click(button('Delete'));
      await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
      expect(onDelete).toHaveBeenCalledWith('c13');
      expect(loadDraft('i1')).toBeNull();
    });

    it('stays open with an error when a delete fails', async () => {
      const { onClose } = renderSheet({ editing: oct13, onDelete: vi.fn().mockRejectedValue(new Error('offline')) });
      fireEvent.click(button('Delete'));
      fireEvent.click(button('Delete'));
      expect(await screen.findByText("Couldn't save — check your connection and try again.")).toBeInTheDocument();
      expect(onClose).not.toHaveBeenCalled();
    });
  });

  it('keeps everything when a save fails with no signal', async () => {
    const { onClose } = renderSheet({ onSave: vi.fn().mockRejectedValue(new Error('offline')) });
    type('Felt fine');
    save();
    expect(await screen.findByText("Couldn't save — check your connection and try again.")).toBeInTheDocument();
    expect(notes()).toHaveValue('Felt fine');
    expect(onClose).not.toHaveBeenCalled();
    expect(loadDraft('i1').draft.notes).toBe('Felt fine');
    expect(button('Save check-in')).toBeEnabled();
  });

  it("won't send a second save while one is on its way", () => {
    const { onSave } = renderSheet({ onSave: vi.fn(() => new Promise(() => {})) });
    save();
    expect(button('Save check-in')).toBeDisabled();
    save();
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  describe('closed while a save is on its way', () => {
    function slowSave() {
      let land;
      const onSave = vi.fn(() => new Promise((resolve) => { land = resolve; }));
      return { onSave, land: () => act(async () => { land({}); }) };
    }

    it('clears the draft once the save lands', async () => {
      const { onSave, land } = slowSave();
      const first = renderSheet({ onSave });
      type('Felt fine');
      save();
      fireEvent.click(screen.getByRole('dialog'));
      first.unmount();
      await land();
      expect(loadDraft('i1')).toBeNull();
      expect(first.onClose).toHaveBeenCalledTimes(1);
    });

    it('leaves a sheet opened again, and what was typed in it since, alone when the save lands', async () => {
      const { onSave, land } = slowSave();
      const first = renderSheet({ onSave });
      type('Felt fine');
      save();
      fireEvent.click(screen.getByRole('dialog'));
      first.unmount();

      const second = renderSheet();
      expect(notes()).toHaveValue('Felt fine');
      type('Felt fine, bit sore by the evening');
      await land();
      expect(loadDraft('i1')?.draft.notes).toBe('Felt fine, bit sore by the evening');
      expect(first.onClose).toHaveBeenCalledTimes(1);
      expect(second.onClose).not.toHaveBeenCalled();
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
  });

  it('keeps a draft after a tap outside, and Discard throws it away', () => {
    const first = renderSheet();
    type('Felt fine');
    fireEvent.click(screen.getByRole('dialog'));
    expect(first.onClose).toHaveBeenCalledTimes(1);
    first.unmount();

    const second = renderSheet();
    expect(notes()).toHaveValue('Felt fine');
    fireEvent.click(button('Discard'));
    expect(second.onClose).toHaveBeenCalledTimes(1);
    expect(loadDraft('i1')).toBeNull();
  });

  it('keeps a restored draft when a date with a check-in is picked', () => {
    const first = renderSheet();
    type('Felt fine');
    first.unmount();

    renderSheet();
    pickDate('2026-10-13');
    expect(notes()).toHaveValue('Felt fine');
    expect(screen.getByText("There's already a check-in on 13 Oct — saving adds to it.")).toBeInTheDocument();
  });

  it('adds and removes a spike', async () => {
    const { onSave } = renderSheet();
    fireEvent.click(button('+ Add a spike'));
    expect(screen.getByRole('slider', { name: 'Spike' })).toHaveAttribute('aria-valuenow', '2');
    nudge('Spike');
    expect(readout()).toBe('1 – 2 / 2.5');
    save();
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0][0].fields.pain_peak).toBe(2.5);

    fireEvent.click(button('Remove spike'));
    expect(screen.queryByRole('slider', { name: 'Spike' })).not.toBeInTheDocument();
    save();
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(2));
    expect(onSave.mock.calls[1][0].fields.pain_peak).toBeNull();
  });

  it('carries the spike up when the highest pain passes it', () => {
    renderSheet();
    fireEvent.click(button('+ Add a spike'));
    nudge('Highest pain');
    expect(screen.getByRole('slider', { name: 'Spike' })).toHaveAttribute('aria-valuenow', '2.5');
    expect(screen.getByRole('slider', { name: 'Spike' })).toHaveAttribute('aria-valuemin', '2.5');
  });

  it('grows the notes box with the lines typed, keeping them as written', () => {
    renderSheet();
    const before = Number(notes().getAttribute('rows'));
    type('One\n\nTwo\nThree\nFour\nFive\nSix');
    expect(Number(notes().getAttribute('rows'))).toBeGreaterThan(before);
    expect(notes().style.whiteSpace).toBe('pre-wrap');
  });
});
