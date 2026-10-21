import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import InjuryForm from './InjuryForm';

const made = (id, extra = {}) => ({
  id, side: 'right', area: 'finger', finger: 'middle', area_other: null, what: 'Tweaky pulley',
  symptoms: null, started_on: '2026-07-26', started_roughly: false, how_it_happened: null,
  closed_on: '2026-08-20', created_at: '2026-07-26T09:00:00Z', ...extra,
});

function renderForm(props = {}) {
  const handlers = {
    onSubmit: vi.fn().mockResolvedValue({}),
    onReopenInstead: vi.fn(),
    onCheckInInstead: vi.fn(),
    onDelete: vi.fn().mockResolvedValue(undefined),
  };
  const all = { injury: null, injuries: [], checkins: [], ...handlers, ...props };
  render(<InjuryForm {...all} />);
  return all;
}

const tap = (name) => fireEvent.click(screen.getByRole('button', { name }));
const startButton = () => screen.getByRole('button', { name: 'Start log' });

describe('InjuryForm', () => {
  it('keeps Start log disabled until the spot is picked, then previews the title', () => {
    renderForm();
    expect(startButton()).toBeDisabled();
    tap('Right');
    tap('Finger');
    expect(startButton()).toBeDisabled();
    tap('Middle');
    expect(startButton()).toBeEnabled();
    expect(screen.getByText('RH middle finger')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Middle' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('needs text in Where? for Other', () => {
    renderForm();
    tap('Left');
    tap('Other');
    expect(startButton()).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Where?'), { target: { value: 'Ribs' } });
    expect(startButton()).toBeEnabled();
  });

  it('submits the normalised fields', async () => {
    const { onSubmit } = renderForm();
    tap('Right');
    tap('Finger');
    tap('Middle');
    fireEvent.change(screen.getByLabelText('What is it'), { target: { value: 'A2 pulley?' } });
    fireEvent.change(screen.getByLabelText('When did it start'), { target: { value: '2026-10-18' } });
    fireEvent.click(screen.getByLabelText('Roughly'));
    fireEvent.click(startButton());
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({
      side: 'right', area: 'finger', finger: 'middle', area_other: null, what: 'A2 pulley?', symptoms: null,
      started_on: '2026-10-18', started_roughly: true, how_it_happened: null,
    }));
  });

  it('drops the finger when the area changes away from Finger', async () => {
    const { onSubmit } = renderForm();
    tap('Right');
    tap('Finger');
    tap('Ring');
    tap('Wrist');
    fireEvent.click(startButton());
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ area: 'wrist', finger: null })));
  });

  it('shows an error and keeps the form when saving fails', async () => {
    renderForm({ onSubmit: vi.fn().mockRejectedValue(new Error('offline')) });
    tap('Right');
    tap('Wrist');
    fireEvent.change(screen.getByLabelText('What is it'), { target: { value: 'Sore' } });
    fireEvent.click(startButton());
    expect(await screen.findByText("Couldn't save — check your connection and try again.")).toBeInTheDocument();
    expect(screen.getByLabelText('What is it')).toHaveValue('Sore');
    expect(startButton()).toBeEnabled();
  });

  describe('same spot', () => {
    const pickSpot = () => { tap('Right'); tap('Finger'); tap('Middle'); };

    it('offers to reopen a closed log', () => {
      const { onReopenInstead } = renderForm({ injuries: [made('old')] });
      pickSpot();
      expect(screen.getByText(/You've logged this before:/)).toBeInTheDocument();
      expect(screen.getByText(/Tweaky pulley · Jul 26/)).toBeInTheDocument();
      tap('Reopen that log instead?');
      expect(onReopenInstead).toHaveBeenCalledWith('old');
    });

    it('offers to check in on an open log', () => {
      const { onCheckInInstead } = renderForm({ injuries: [made('open', { closed_on: null })] });
      pickSpot();
      expect(screen.queryByRole('button', { name: 'Reopen that log instead?' })).not.toBeInTheDocument();
      tap('Check in on that one instead?');
      expect(onCheckInInstead).toHaveBeenCalledWith('open');
    });

    it('has no doubled separator when an imported log has no what', () => {
      renderForm({ injuries: [made('old', { what: null })] });
      pickSpot();
      expect(screen.getByText(/Jul 26/).textContent).not.toMatch(/·\s*·/);
    });

    it('stays quiet when nothing matches', () => {
      renderForm({ injuries: [made('old', { side: 'left' })] });
      pickSpot();
      expect(screen.queryByText(/You've logged this before:/)).not.toBeInTheDocument();
    });
  });

  describe('editing', () => {
    it('prefills, says Save, has no hint and confirms before deleting', async () => {
      const injury = made('i1', { symptoms: 'Aches', closed_on: null });
      const { onDelete } = renderForm({ injury, injuries: [injury, made('old')] });
      expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
      expect(screen.getByLabelText('What is it')).toHaveValue('Tweaky pulley');
      expect(screen.getByLabelText('Symptoms')).toHaveValue('Aches');
      expect(screen.getByLabelText('When did it start')).toHaveValue('2026-07-26');
      expect(screen.getByRole('button', { name: 'Middle' })).toHaveAttribute('aria-pressed', 'true');
      expect(screen.queryByText(/You've logged this before:/)).not.toBeInTheDocument();
      tap('Delete this injury');
      expect(screen.getByText('Delete this injury and all its check-ins?')).toBeInTheDocument();
      expect(onDelete).not.toHaveBeenCalled();
      tap('Delete');
      await waitFor(() => expect(onDelete).toHaveBeenCalled());
    });
  });
});
