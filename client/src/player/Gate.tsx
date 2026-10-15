import { useState } from 'react';
import { api, errorText } from '../api';
import type { StageProps } from './PlayerApp';
import { Frame, Typewriter } from './common';

export function Gate({ view, refresh }: StageProps) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [rejected, setRejected] = useState(false);
  const [ok, setOk] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await api<{ ok: boolean }>('/api/player/gate', { json: { code } });
      if (r.ok) {
        setOk(true);
        window.setTimeout(() => void refresh(), 1200);
      } else {
        setRejected(true);
        window.setTimeout(() => setRejected(false), 500);
      }
    } catch (e2) {
      setErr(errorText(e2));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Frame title="Remote asset" className={rejected ? 'shake' : 'accent'}>
      <Typewriter text={view.gate.prompt} speed={3} />
      {ok ? (
        <div className="ok">{view.gate.successText}</div>
      ) : (
        <form onSubmit={submit} className="stack" style={{ marginTop: 12 }}>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="RECOVERY KEY"
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            inputMode="text"
            aria-label="Recovery key"
          />
          <button className="btn primary block" disabled={busy || !code.trim()}>
            Submit key
          </button>
          {rejected ? <div className="error">KEY REJECTED</div> : null}
          {view.gate.attempts ? <div className="tiny">Attempts: {view.gate.attempts}</div> : null}
        </form>
      )}
      {err ? <div className="error">{err}</div> : null}
    </Frame>
  );
}
