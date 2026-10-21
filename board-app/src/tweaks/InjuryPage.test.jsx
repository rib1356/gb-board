import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import InjuryPage from './InjuryPage';

const TODAY = '2026-10-21';
const injury = {
  id: 'i1', side: 'right', area: 'finger', finger: 'ring', area_other: null, what: 'Pulley strain',
  symptoms: 'Ache when crimping', started_on: '2026-09-20', started_roughly: false,
  how_it_happened: 'Dropped off a sloper', closed_on: null, created_at: '2026-09-20T09:00:00Z',
};
const earlier = {
  id: 'i0', side: 'right', area: 'finger', finger: 'ring', area_other: null, what: 'Tweaked tendon',
  symptoms: null, started_on: '2025-03-04', started_roughly: false, how_it_happened: null,
  closed_on: '2025-04-01', created_at: '2025-03-04T09:00:00Z',
};
const C = (id, checked_on, extra = {}) => ({
  id, injury_id: 'i1', checked_on, created_at: `${checked_on}T09:00:00Z`,
  pain_low: 1, pain_high: 2, pain_peak: null, activities: [], notes: null, ...extra,
});
const oct10 = C('c10', '2026-10-10', { pain_low: 3, pain_high: 4, pain_peak: 7, activities: ['board', 'taped'], notes: 'First line\n\nSecond paragraph' });
const oct13 = C('c13', '2026-10-13');

function renderPage(props = {}) {
  const handlers = {
    onCheckIn: vi.fn(), onEditCheckin: vi.fn(), onEdit: vi.fn(), onClose: vi.fn(),
    onReopen: vi.fn(), onOpenInjury: vi.fn(),
  };
  const all = {
    injury, injuries: [injury, earlier], checkins: [oct10, oct13], boardDays: new Set(), today: TODAY, ...handlers, ...props,
  };
  return { ...all, ...render(<InjuryPage {...all} />) };
}
const button = (name) => screen.getByRole('button', { name });

describe('InjuryPage', () => {
  it('shows the title, Open and the start line', () => {
    renderPage();
    expect(screen.getByText('RH RING FINGER')).toBeTruthy();
    expect(screen.getByText('Open')).toBeTruthy();
    expect(screen.getByText('Pulley strain')).toBeTruthy();
    expect(screen.getByText('Started 20 Sept 2026')).toBeTruthy();
  });

  it('renders notes exactly as stored, line breaks kept', () => {
    renderPage();
    const el = screen.getByText((_, node) => node.textContent === 'First line\n\nSecond paragraph' && node.children.length === 0);
    expect(el.style.whiteSpace).toBe('pre-wrap');
  });

  it('lists check-ins newest first with their pain', () => {
    renderPage();
    const text = screen.getByText('Check-ins').parentElement.textContent;
    expect(text.indexOf('1–2')).toBeGreaterThan(-1);
    expect(text.indexOf('3–4 / 7')).toBeGreaterThan(text.indexOf('1–2'));
    expect(text).toContain('Board');
    expect(text).toContain('Taped');
  });

  it('draws the chart only with two or more dates', () => {
    const { container, rerender, ...rest } = renderPage({ checkins: [oct13] });
    expect(container.querySelector('svg[data-chart="pain"]')).toBeNull();
    rerender(<InjuryPage {...rest} checkins={[oct10, oct13]} />);
    expect(container.querySelector('svg[data-chart="pain"]')).not.toBeNull();
  });

  it('says so when there are no check-ins', () => {
    renderPage({ checkins: [] });
    expect(screen.getByText('No check-ins yet.')).toBeTruthy();
  });

  it('shows symptoms and how it happened under more', () => {
    renderPage();
    expect(screen.queryByText('Ache when crimping')).toBeNull();
    fireEvent.click(button('more'));
    expect(screen.getByText('Symptoms')).toBeTruthy();
    expect(screen.getByText('Ache when crimping')).toBeTruthy();
    expect(screen.getByText('Dropped off a sloper')).toBeTruthy();
    fireEvent.click(button('less'));
    expect(screen.queryByText('Ache when crimping')).toBeNull();
  });

  it('only shows a heading that has text', () => {
    renderPage({ injury: { ...injury, how_it_happened: null } });
    fireEvent.click(button('more'));
    expect(screen.queryByText('How it happened')).toBeNull();
  });

  it('lists earlier logs of the same spot and opens one', () => {
    const { onOpenInjury } = renderPage();
    expect(screen.getByText('Same spot before')).toBeTruthy();
    fireEvent.click(button('RH ring finger · Tweaked tendon · Mar 25'));
    expect(onOpenInjury).toHaveBeenCalledWith('i0');
  });

  it('hides Same spot before with no match', () => {
    renderPage({ injuries: [injury] });
    expect(screen.queryByText('Same spot before')).toBeNull();
  });

  it('opens a check-in to edit', () => {
    const { onEditCheckin } = renderPage();
    fireEvent.click(screen.getByText('3–4 / 7').closest('button'));
    expect(onEditCheckin).toHaveBeenCalledWith(oct10);
  });

  it('wires Edit, Check in and Close this log', () => {
    const { onEdit, onCheckIn, onClose } = renderPage();
    fireEvent.click(button('Edit'));
    fireEvent.click(button('Check in'));
    fireEvent.click(button('Close this log'));
    expect(onEdit).toHaveBeenCalled();
    expect(onCheckIn).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('a closed injury offers only Reopen', () => {
    const { onReopen } = renderPage({ injury: { ...injury, closed_on: '2026-10-15' } });
    expect(screen.getByText('Closed')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Close this log' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Check in' })).toBeNull();
    fireEvent.click(button('Reopen'));
    expect(onReopen).toHaveBeenCalled();
  });
});
