import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import VotePicker from './VotePicker';

describe('VotePicker', () => {
  it('picks a grade, keeping the stars', async () => {
    const onChange = vi.fn();
    render(<VotePicker choices={['V4', 'V5', 'V6']} grade={null} stars={3} onChange={onChange} />);
    await userEvent.click(within(screen.getByRole('group', { name: 'Grade vote' })).getByRole('button', { name: 'V6' }));
    expect(onChange).toHaveBeenCalledWith({ grade: 'V6', stars: 3 });
  });
  it('unpicks the picked grade or star when tapped again', async () => {
    const onChange = vi.fn();
    render(<VotePicker choices={['V4', 'V5', 'V6']} grade="V5" stars={4} onChange={onChange} />);
    expect(screen.getByRole('button', { name: 'V5' })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(screen.getByRole('button', { name: 'V5' }));
    expect(onChange).toHaveBeenLastCalledWith({ grade: null, stars: 4 });
    await userEvent.click(screen.getByRole('button', { name: '4 stars' }));
    expect(onChange).toHaveBeenLastCalledWith({ grade: 'V5', stars: null });
  });
  it('has no grade row for an ungraded problem', () => {
    render(<VotePicker choices={[]} grade={null} stars={null} onChange={() => {}} />);
    expect(screen.queryByRole('group', { name: 'Grade vote' })).not.toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Star vote' })).toBeInTheDocument();
  });
  it('ignores taps while disabled', async () => {
    const onChange = vi.fn();
    render(<VotePicker choices={['V5']} grade={null} stars={null} onChange={onChange} disabled />);
    await userEvent.click(screen.getByRole('button', { name: '2 stars' }));
    expect(onChange).not.toHaveBeenCalled();
  });
});
