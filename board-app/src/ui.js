export const inputStyle = {
  width: '100%', boxSizing: 'border-box', background: '#232427', border: '1px solid #3a3b3e',
  borderRadius: 8, padding: '10px 12px', color: '#EDEAE3', fontSize: 14.5, fontFamily: "'Inter'", marginTop: 4,
};

export const gradeBadgeStyle = {
  fontFamily: "'JetBrains Mono', monospace", background: '#17181A', border: '1px solid #3a3b3e',
  color: '#D9552B', fontSize: 13, fontWeight: 700, padding: '4px 10px', borderRadius: 6,
};

export function formatShortDate(dateStr) {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

export const sectionHeading = { fontSize: 12, color: '#8b8d91', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4, margin: '0 0 8px' };

export const linkButton = { display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', color: '#C08552', fontWeight: 600, fontSize: 14, cursor: 'pointer', padding: 0 };

export function primaryButton(enabled) {
  return {
    background: enabled ? '#D9552B' : '#3a3b3e', color: '#17181A', border: 'none', borderRadius: 8,
    padding: '11px 16px', fontWeight: 700, fontSize: 14.5, cursor: enabled ? 'pointer' : 'not-allowed',
  };
}

export function rungRow(active, muted) {
  return {
    width: '100%', display: 'flex', alignItems: 'center', gap: 10, background: active ? '#2b2c30' : '#232427',
    border: `1px solid ${active ? '#D9552B' : '#2A2B2E'}`, borderRadius: 10, padding: '10px 12px', marginBottom: 8,
    color: muted ? '#6d6f73' : '#EDEAE3', fontSize: 14.5, cursor: 'pointer', fontFamily: "'Inter'",
  };
}
