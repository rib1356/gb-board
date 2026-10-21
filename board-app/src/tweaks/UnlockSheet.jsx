import { useState } from 'react';
import Sheet from './Sheet';
import { inputStyle, primaryButton } from '../ui';

export default function UnlockSheet({ onUnlock, onClose }) {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    if (!password || busy) return;
    setBusy(true);
    setError(null);
    try {
      const ok = await onUnlock(password);
      if (!ok) setError("That's not it.");
    } catch {
      setError("Couldn't reach the server — try again.");
    } finally {
      setBusy(false);
    }
  };

  const canSubmit = password !== '' && !busy;

  return (
    <Sheet label="Tweaks" onClose={onClose}>
      <form onSubmit={submit}>
        <h2 style={{ fontFamily: "'Bebas Neue'", fontSize: 24, letterSpacing: 1, margin: '0 0 8px', color: '#EDEAE3' }}>Tweaks</h2>
        <input
          type="password"
          aria-label="Password"
          autoComplete="current-password"
          autoFocus
          value={password}
          onChange={(e) => { setPassword(e.target.value); setError(null); }}
          style={inputStyle}
        />
        {error && <p role="alert" style={{ color: '#D9552B', fontSize: 13, margin: '8px 0 0' }}>{error}</p>}
        <button type="submit" disabled={!canSubmit} style={{ ...primaryButton(canSubmit), width: '100%', marginTop: 12 }}>Unlock</button>
      </form>
    </Sheet>
  );
}
