import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import TweaksHub from './TweaksHub';

const TODAY = '2026-10-21';
const made = (id, extra) => ({
  id, side: 'right', area: 'finger', finger: 'ring', area_other: null, what: 'Pulley strain',
  symptoms: null, started_on: '2026-10-04', started_roughly: false, how_it_happened: null,
  closed_on: null, created_at: '2026-10-04T09:00:00Z', ...extra,
});
const open = made('i1');
const wrist = made('i8', { side: 'left', area: 'wrist', finger: null, what: 'Sprain', started_on: '2025-03-04', closed_on: '2025-04-10' });
const shoulder = made('i9', { area: 'shoulder', finger: null, what: null, started_on: '2024-11-10', closed_on: '2025-01-05' });
const elbow = made('i7', { area: 'elbow', finger: null, what: 'Tendon ache', started_on: '2026-06-12', closed_on: '2026-08-01' });
const C = (id, checked_on) => ({
  id, injury_id: 'i1', checked_on, created_at: `${checked_on}T09:00:00Z`,
  pain_low: 1, pain_high: 2, pain_peak: null, activities: [], notes: null,
});

function renderHub(props = {}) {
  const all = {
    injuries: [], checkins: [], today: TODAY, loading: false, loadError: '',
    onOpenInjury: vi.fn(), onCheckIn: vi.fn(), onNewInjury: vi.fn(),
    hasPhoto: true, uploading: false, onPhotoUpload: vi.fn(), onVolumes: vi.fn(), onSignOut: vi.fn(),
    ...props,
  };
  render(<TweaksHub {...all} />);
  return all;
}

describe('TweaksHub', () => {
  it('says so when nothing is open', () => {
    renderHub({ injuries: [wrist] });
    expect(screen.getByText('Nothing tweaky. Long may it last.')).toBeInTheDocument();
  });

  it('shows an open injury as a card that checks in or opens it', () => {
    const { onCheckIn, onOpenInjury } = renderHub({
      injuries: [open], checkins: [C('c2', '2026-10-16'), C('c1', '2026-10-10')],
    });
    expect(screen.queryByText('Nothing tweaky. Long may it last.')).not.toBeInTheDocument();
    expect(screen.getByText('RH ring finger')).toBeInTheDocument();
    expect(screen.getByText('Pulley strain · open since 4 Oct')).toBeInTheDocument();
    expect(screen.getByText('Last check-in 16 Oct, 5 days ago')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Check in' }));
    expect(onCheckIn).toHaveBeenCalledWith('i1');
    expect(onOpenInjury).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /RH ring finger/ }));
    expect(onOpenInjury).toHaveBeenCalledWith('i1');
  });

  it("only counts the card's own injury's check-ins", () => {
    renderHub({ injuries: [open], checkins: [{ ...C('c9', '2026-10-21'), injury_id: 'i8' }] });
    expect(screen.getByText('No check-ins yet')).toBeInTheDocument();
  });

  it('lists the closed logs newest first, with their month', () => {
    const { onOpenInjury } = renderHub({ injuries: [wrist, open, shoulder, elbow] });
    expect(screen.getByText('Injury log')).toBeInTheDocument();
    const rows = [/R elbow · Tendon ache/, /L wrist · Sprain/, /R shoulder/].map((name) => screen.getByRole('button', { name }));
    expect(rows.map((row) => row.textContent)).toEqual(['R elbow · Tendon acheJun 26', 'L wrist · SprainMar 25', 'R shoulderNov 24']);
    expect(rows[0].compareDocumentPosition(rows[1]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(rows[1].compareDocumentPosition(rows[2]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    fireEvent.click(rows[1]);
    expect(onOpenInjury).toHaveBeenCalledWith('i8');
  });

  it('leaves out the separator when an injury has no what', () => {
    renderHub({ injuries: [{ ...open, what: null }] });
    expect(screen.getByText('open since 4 Oct')).toBeInTheDocument();
  });

  it('starts a new injury', () => {
    const { onNewInjury } = renderHub();
    fireEvent.click(screen.getByRole('button', { name: '+ New injury' }));
    expect(onNewInjury).toHaveBeenCalled();
  });

  it('holds back the empty line while the first load is on its way', () => {
    renderHub({ loading: true });
    expect(screen.queryByText('Nothing tweaky. Long may it last.')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '+ New injury' })).toBeInTheDocument();
  });

  it('keeps the empty line through a reload once the logs are in', () => {
    renderHub({ loading: true, injuries: [wrist] });
    expect(screen.getByText('Nothing tweaky. Long may it last.')).toBeInTheDocument();
  });

  it('shows a load error in place of the empty line', () => {
    renderHub({ loadError: "Couldn't load your tweaks — check your connection and try again." });
    expect(screen.getByText("Couldn't load your tweaks — check your connection and try again.")).toBeInTheDocument();
    expect(screen.queryByText('Nothing tweaky. Long may it last.')).not.toBeInTheDocument();
  });

  it('keeps board setup and sign out', () => {
    const { onSignOut } = renderHub();
    expect(screen.getByText('Board setup')).toBeInTheDocument();
    expect(screen.getByLabelText('New photo')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(onSignOut).toHaveBeenCalled();
  });
});
