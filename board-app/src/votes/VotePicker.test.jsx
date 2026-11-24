import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import VotePicker from './VotePicker';

const choices = [
  { grade: 'V4', feel: null },
  { grade: 'V5', feel: 'soft' },
  { grade: 'V5', feel: null },
  { grade: 'V5', feel: 'hard' },
  { grade: 'V6', feel: null },
];
const grade = () => within(screen.getByRole('group', { name: 'Grade vote' }));

describe('VotePicker', () => {
  it('picks a grade, keeping the stars', async () => {
    const onChange = vi.fn();
    render(<VotePicker choices={choices} grade={null} feel={null} stars={3} onChange={onChange} />);
    await userEvent.click(grade().getByRole('button', { name: 'V6' }));
    expect(onChange).toHaveBeenCalledWith({ grade: 'V6', feel: null, stars: 3 });
  });
  it('picks a hard grade', async () => {
    const onChange = vi.fn();
    render(<VotePicker choices={choices} grade={null} feel={null} stars={3} onChange={onChange} />);
    await userEvent.click(grade().getByRole('button', { name: 'hard V5' }));
    expect(onChange).toHaveBeenCalledWith({ grade: 'V5', feel: 'hard', stars: 3 });
  });
  it('shows only the chip whose grade and feel both match as pressed', () => {
    render(<VotePicker choices={choices} grade="V5" feel="hard" stars={null} onChange={() => {}} />);
    expect(screen.getByRole('button', { name: 'hard V5' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'V5' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'soft V5' })).toHaveAttribute('aria-pressed', 'false');
  });
  it('unpicks the picked grade or star when tapped again', async () => {
    const onChange = vi.fn();
    render(<VotePicker choices={choices} grade="V5" feel="hard" stars={4} onChange={onChange} />);
    await userEvent.click(screen.getByRole('button', { name: 'hard V5' }));
    expect(onChange).toHaveBeenLastCalledWith({ grade: null, feel: null, stars: 4 });
    await userEvent.click(screen.getByRole('button', { name: '4 stars' }));
    expect(onChange).toHaveBeenLastCalledWith({ grade: 'V5', feel: 'hard', stars: null });
  });
  it('has no grade row for an ungraded problem', () => {
    render(<VotePicker choices={[]} grade={null} feel={null} stars={null} onChange={() => {}} />);
    expect(screen.queryByRole('group', { name: 'Grade vote' })).not.toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Star vote' })).toBeInTheDocument();
  });
  it('ignores taps while disabled', async () => {
    const onChange = vi.fn();
    render(<VotePicker choices={[{ grade: 'V5', feel: null }]} grade={null} feel={null} stars={null} onChange={onChange} disabled />);
    await userEvent.click(screen.getByRole('button', { name: '2 stars' }));
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('VotePicker for an ungraded problem', () => {
  const dropdown = () => screen.getByRole('combobox', { name: 'Grade vote' });
  it('shows a grade dropdown starting on No vote when anyGrade', () => {
    render(<VotePicker anyGrade choices={[]} grade={null} feel={null} stars={null} onChange={vi.fn()} />);
    expect(dropdown()).toHaveValue('');
    expect(within(dropdown()).getAllByRole('option')[0]).toHaveTextContent('No vote');
    expect(within(dropdown()).getAllByRole('option')).toHaveLength(20);
    expect(screen.queryByRole('group', { name: 'Grade vote' })).not.toBeInTheDocument();
  });
  it('picking from the dropdown reports a whole grade and keeps the stars', async () => {
    const onChange = vi.fn();
    render(<VotePicker anyGrade choices={[]} grade={null} feel={null} stars={4} onChange={onChange} />);
    await userEvent.selectOptions(dropdown(), 'V6');
    expect(onChange).toHaveBeenCalledWith({ grade: 'V6', feel: null, stars: 4 });
  });
  it('No vote clears just the grade', async () => {
    const onChange = vi.fn();
    render(<VotePicker anyGrade choices={[]} grade="V6" feel={null} stars={4} onChange={onChange} />);
    expect(dropdown()).toHaveValue('V6');
    await userEvent.selectOptions(dropdown(), '');
    expect(onChange).toHaveBeenCalledWith({ grade: null, feel: null, stars: 4 });
  });
});
