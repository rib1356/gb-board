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

  const feelRow = () => within(screen.getByRole('group', { name: 'Grade feel' }));
  it('shows no feel chips until a grade is picked', () => {
    render(<VotePicker anyGrade choices={[]} grade={null} feel={null} stars={null} onChange={vi.fn()} />);
    expect(screen.queryByRole('group', { name: 'Grade feel' })).not.toBeInTheDocument();
  });
  it('shows soft, plain and hard of the picked grade, plain pressed by default', () => {
    render(<VotePicker anyGrade choices={[]} grade="V5" feel={undefined} stars={null} onChange={vi.fn()} />);
    expect(feelRow().getAllByRole('button').map((b) => b.textContent)).toEqual(['soft V5', 'V5', 'hard V5']);
    expect(feelRow().getByRole('button', { name: 'V5' })).toHaveAttribute('aria-pressed', 'true');
    expect(feelRow().getByRole('button', { name: 'hard V5' })).toHaveAttribute('aria-pressed', 'false');
  });
  it('shows the saved feel as pressed', () => {
    render(<VotePicker anyGrade choices={[]} grade="V5" feel="hard" stars={null} onChange={vi.fn()} />);
    expect(feelRow().getByRole('button', { name: 'hard V5' })).toHaveAttribute('aria-pressed', 'true');
    expect(feelRow().getByRole('button', { name: 'V5' })).toHaveAttribute('aria-pressed', 'false');
  });
  it('picking soft or hard reports the feel and keeps the stars', async () => {
    const onChange = vi.fn();
    render(<VotePicker anyGrade choices={[]} grade="V5" feel={null} stars={4} onChange={onChange} />);
    await userEvent.click(feelRow().getByRole('button', { name: 'hard V5' }));
    expect(onChange).toHaveBeenCalledWith({ grade: 'V5', feel: 'hard', stars: 4 });
  });
  it('tapping the picked soft or hard goes back to plain', async () => {
    const onChange = vi.fn();
    render(<VotePicker anyGrade choices={[]} grade="V5" feel="soft" stars={4} onChange={onChange} />);
    await userEvent.click(feelRow().getByRole('button', { name: 'soft V5' }));
    expect(onChange).toHaveBeenCalledWith({ grade: 'V5', feel: null, stars: 4 });
  });
  it('tapping plain when plain is picked does nothing', async () => {
    const onChange = vi.fn();
    render(<VotePicker anyGrade choices={[]} grade="V5" feel={null} stars={4} onChange={onChange} />);
    await userEvent.click(feelRow().getByRole('button', { name: 'V5' }));
    expect(onChange).not.toHaveBeenCalled();
  });
  it('changing the grade after picking hard resets the feel', async () => {
    const onChange = vi.fn();
    render(<VotePicker anyGrade choices={[]} grade="V5" feel="hard" stars={4} onChange={onChange} />);
    await userEvent.selectOptions(dropdown(), 'V6');
    expect(onChange).toHaveBeenCalledWith({ grade: 'V6', feel: null, stars: 4 });
  });
  it('feel chips ignore taps while disabled', async () => {
    const onChange = vi.fn();
    render(<VotePicker anyGrade disabled choices={[]} grade="V5" feel={null} stars={4} onChange={onChange} />);
    await userEvent.click(feelRow().getByRole('button', { name: 'hard V5' }));
    expect(onChange).not.toHaveBeenCalled();
  });
});
