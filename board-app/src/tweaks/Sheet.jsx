import { useEffect } from 'react';

// Bottom sheet: the dialog is the dim overlay itself, so a click whose target is the
// overlay (not something inside the panel) closes it.
export default function Sheet({ label, onClose, children }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-label={label}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
    >
      <div style={{ background: '#1e1f22', borderTop: '1px solid #3a3b3e', borderRadius: '18px 18px 0 0', padding: 16, width: '100%', maxWidth: 640, boxSizing: 'border-box', maxHeight: '90vh', overflowY: 'auto' }}>
        {children}
      </div>
    </div>
  );
}
