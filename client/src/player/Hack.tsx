import { useCallback, useState } from 'react';
import { api, errorText } from '../api';
import type { PlayerView } from '../types';
import type { StageProps } from './PlayerApp';
import { Countdown, Frame } from './common';

export function Hack({ view, setView, refresh }: StageProps) {
  const h = view.hack;
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);
  const locked = h.lockedUntil !== null && h.lockedUntil > Date.now() && !expired;
  const lockPassed = h.lockedUntil !== null && (expired || h.lockedUntil <= Date.now());
  const onDone = useCallback(() => setExpired(true), []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const word = input.toUpperCase().replace(/[^A-Z]/g, '');
    if (word.length !== h.length) {
      setErr(`Key must be ${h.length} characters`);
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      await api('/api/player/hack/guess', { json: { word } });
      setInput('');
      await refresh();
    } catch (e2) {
      setErr(errorText(e2));
    } finally {
      setBusy(false);
    }
  };
  const retry = async () => {
    setBusy(true);
    try {
      setView(await api<PlayerView>('/api/player/hack/retry', { method: 'POST' }));
      setExpired(false);
    } catch (e2) {
      setErr(errorText(e2));
    } finally {
      setBusy(false);
    }
  };

  const rows = [];
  for (let i = 0; i < h.maxAttempts; i++) {
    const scored = h.rows[i];
    if (scored) {
      rows.push(
        <div className="trow" key={i}>
          {scored.map((s, j) => (
            <div key={j} className={`tile ${s.state}`}>
              {s.letter}
            </div>
          ))}
        </div>,
      );
    } else if (i === h.rows.length && !locked && !lockPassed) {
      const letters = input.toUpperCase().replace(/[^A-Z]/g, '').padEnd(h.length).split('');
      rows.push(
        <div className="trow" key={i}>
          {letters.map((l, j) => (
            <div key={j} className={`tile pending`}>
              {l.trim()}
            </div>
          ))}
        </div>,
      );
    } else {
      rows.push(
        <div className="trow" key={i}>
          {Array.from({ length: h.length }, (_, j) => (
            <div key={j} className="tile" />
          ))}
        </div>,
      );
    }
  }

  return (
    <Frame title="Mirror partition // brute-force key" className="accent">
      <pre className="typed small muted">{h.intro}</pre>
      <div className="grid">{rows}</div>
      <div className="legend">
        <span>
          <i style={{ background: '#19a85a' }} /> placed
        </span>
        <span>
          <i style={{ background: '#c98400' }} /> misplaced
        </span>
        <span>
          <i style={{ background: '#2a2d38' }} /> absent
        </span>
      </div>
      {locked && h.lockedUntil ? (
        <div className="center" style={{ marginTop: 16 }}>
          <div className="red">PARTITION LOCKED</div>
          <div className="tiny">
            Reset available in <Countdown until={h.lockedUntil} onDone={onDone} />
          </div>
        </div>
      ) : lockPassed ? (
        <button className="btn block" onClick={retry} disabled={busy} style={{ marginTop: 16 }}>
          Reset partition
        </button>
      ) : (
        <form onSubmit={submit} className="stack" style={{ marginTop: 16 }}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value.toUpperCase().replace(/[^A-Za-z]/g, '').slice(0, h.length))}
            placeholder={`${h.length}-CHARACTER KEY`}
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            maxLength={h.length}
            aria-label="Key attempt"
          />
          <button className="btn primary block" disabled={busy || input.length !== h.length}>
            Attempt key ({h.rows.length + 1}/{h.maxAttempts})
          </button>
        </form>
      )}
      {err ? <div className="error">{err}</div> : null}
      {h.rounds ? <div className="tiny center" style={{ marginTop: 8 }}>Partition resets: {h.rounds}</div> : null}
    </Frame>
  );
}
