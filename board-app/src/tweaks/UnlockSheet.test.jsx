import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import UnlockSheet from './UnlockSheet';

vi.mock('../lib/supabaseClient', () => ({ tweaksSupabase: {} }));

const type = (value) => fireEvent.change(screen.getByLabelText('Password'), { target: { value } });
const submit = () => fireEvent.submit(screen.getByLabelText('Password').closest('form'));

describe('UnlockSheet', () => {
  it('submits the password', async () => {
    const onUnlock = vi.fn().mockResolvedValue(true);
    render(<UnlockSheet onUnlock={onUnlock} onClose={() => {}} />);
    type('hunter22');
    submit();
    await waitFor(() => expect(onUnlock).toHaveBeenCalledWith('hunter22'));
  });

  it('keeps Unlock off until something is typed', () => {
    render(<UnlockSheet onUnlock={vi.fn()} onClose={() => {}} />);
    expect(screen.getByRole('button', { name: 'Unlock' })).toBeDisabled();
    type('x');
    expect(screen.getByRole('button', { name: 'Unlock' })).toBeEnabled();
  });

  it('says so on a wrong password', async () => {
    render(<UnlockSheet onUnlock={vi.fn().mockResolvedValue(false)} onClose={() => {}} />);
    type('nope');
    submit();
    expect(await screen.findByText("That's not it.")).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toHaveValue('nope');
  });

  it('says so when offline', async () => {
    render(<UnlockSheet onUnlock={vi.fn().mockRejectedValue(new Error('offline'))} onClose={() => {}} />);
    type('hunter22');
    submit();
    expect(await screen.findByText("Couldn't reach the server — try again.")).toBeInTheDocument();
  });

  it('names the account alongside the password, so iOS offers to save it', () => {
    render(<UnlockSheet onUnlock={vi.fn()} onClose={() => {}} />);
    const form = screen.getByLabelText('Password').closest('form');
    const username = form.querySelector('input[autocomplete="username"]');
    expect(username).toHaveValue('tweaks@example.com');
    expect(username).toHaveAttribute('readonly');
    expect(username).toHaveAttribute('tabindex', '-1');
    expect(username).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByLabelText('Password')).toHaveFocus();
  });

  it('closes on a tap outside', () => {
    const onClose = vi.fn();
    render(<UnlockSheet onUnlock={vi.fn()} onClose={onClose} />);
    fireEvent.click(screen.getByLabelText('Password'));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('dialog'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
