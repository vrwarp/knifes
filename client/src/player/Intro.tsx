import { useState } from 'react';
import { api, errorText } from '../api';
import type { PlayerView } from '../types';
import type { StageProps } from './PlayerApp';
import { Frame, SkipHint, Typewriter, useScrollWhenDone, useTyped } from './common';

export function Intro({ view, setView }: StageProps) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, onDone] = useTyped();
  const cta = useScrollWhenDone<HTMLButtonElement>(done);
  const start = async () => {
    setBusy(true);
    try {
      setView(await api<PlayerView>('/api/player/start', { method: 'POST' }));
    } catch (e) {
      setErr(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Frame title={view.intro.headline} className="accent">
      <Typewriter text={view.intro.body} onDone={onDone} />
      <SkipHint done={done} />
      <button ref={cta} className="btn primary block" onClick={start} disabled={busy || !done} style={{ marginTop: 12 }}>
        {view.intro.buttonLabel}
      </button>
      {err ? <div className="error">{err}</div> : null}
    </Frame>
  );
}
