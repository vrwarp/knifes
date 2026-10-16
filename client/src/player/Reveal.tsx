import { useState } from 'react';
import { api, errorText } from '../api';
import type { PlayerView } from '../types';
import type { StageProps } from './PlayerApp';
import { Frame, SkipHint, Typewriter, useScrollWhenDone, useTyped } from './common';

export function Reveal({ view, setView }: StageProps) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, onDone] = useTyped();
  const cta = useScrollWhenDone<HTMLButtonElement>(done);
  const go = async () => {
    setBusy(true);
    try {
      setView(await api<PlayerView>('/api/player/reveal/continue', { method: 'POST' }));
    } catch (e) {
      setErr(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Frame title={view.reveal.title} className="accent">
      <Typewriter text={view.reveal.body} speed={3} onDone={onDone} />
      <SkipHint done={done} />
      <button ref={cta} className="btn primary block" onClick={go} disabled={busy || !done} style={{ marginTop: 12 }}>
        {view.reveal.buttonLabel}
      </button>
      {err ? <div className="error">{err}</div> : null}
    </Frame>
  );
}
