import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import { api, errorText } from '../api';
import type { LetterScore, PlayerView } from '../types';
import type { StageProps } from './PlayerApp';
import { Countdown, Frame } from './common';

const STATE_WORD = { hit: 'placed', near: 'misplaced', miss: 'absent' } as const;

function describeRow(scored: LetterScore[]): string {
  return scored.map((s) => (s.letter ? `${s.letter} ${STATE_WORD[s.state]}` : STATE_WORD[s.state])).join(', ');
}

/** Ticks a few times a second while the opponent's next guess is pending, for the progress bar. */
function useTick(active: boolean): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) return;
    const t = window.setInterval(() => setNow(Date.now()), 200);
    return () => window.clearInterval(t);
  }, [active]);
  return now;
}

export function Hack({ view, setView, refresh }: StageProps) {
  const h = view.hack;
  const ai = h.ai;
  const race = h.mode === 'race' && ai !== null;
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);
  const locked = h.lockedUntil !== null && h.lockedUntil > Date.now() && !expired;
  const lockPassed = h.lockedUntil !== null && (expired || h.lockedUntil <= Date.now());
  const onDone = useCallback(() => setExpired(true), []);
  const rowStyle = { '--n': h.length } as CSSProperties;
  const roundOpen = !locked && !lockPassed && !h.solved;
  const now = useTick(race && roundOpen && !!ai && !ai.solved && !ai.exhausted);
  // A fresh lockout arrives with a new lockedUntil; forget that the previous one ran out.
  useEffect(() => setExpired(false), [h.lockedUntil]);

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
      await api<{ solved: boolean }>('/api/player/hack/guess', { json: { word } });
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
      setInput('');
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
      const win = h.solved && i === h.rows.length - 1;
      rows.push(
        <div className={`trow ${win ? 'win' : ''}`} key={i} style={rowStyle} role="img" aria-label={`Attempt ${i + 1}: ${describeRow(scored)}`}>
          {scored.map((s, j) => (
            <div key={j} className={`tile ${s.state}`} style={{ '--i': j } as CSSProperties} aria-hidden="true">
              {s.letter}
            </div>
          ))}
        </div>,
      );
    } else if (i === h.rows.length && roundOpen) {
      const letters = input.toUpperCase().replace(/[^A-Z]/g, '').padEnd(h.length).split('');
      rows.push(
        <div className="trow" key={i} style={rowStyle} aria-hidden="true">
          {letters.map((l, j) => (
            <div key={j} className="tile pending">
              {l.trim()}
            </div>
          ))}
        </div>,
      );
    } else {
      rows.push(
        <div className="trow" key={i} style={rowStyle} aria-hidden="true">
          {Array.from({ length: h.length }, (_, j) => (
            <div key={j} className="tile" />
          ))}
        </div>,
      );
    }
  }

  // The opponent's board: one small row per attempt, colours only unless the GM shows letters.
  const aiRows = [];
  if (ai) {
    for (let i = 0; i < h.maxAttempts; i++) {
      const scored = ai.rows[i];
      if (scored) {
        const win = ai.solved && i === ai.rows.length - 1;
        aiRows.push(
          <div className={`trow mini ${win ? 'lost' : ''}`} key={i} style={rowStyle} role="img" aria-label={`Adversary attempt ${i + 1}: ${describeRow(scored)}`}>
            {scored.map((s, j) => (
              <div key={j} className={`tile ${s.state}`} aria-hidden="true">
                {s.letter}
              </div>
            ))}
          </div>,
        );
      } else {
        aiRows.push(
          <div className="trow mini" key={i} style={rowStyle} aria-hidden="true">
            {Array.from({ length: h.length }, (_, j) => (
              <div key={j} className={`tile ${i === ai.rows.length && roundOpen && ai.thinking ? 'computing' : ''}`} />
            ))}
          </div>,
        );
      }
    }
  }

  let aiStatus: { text: string; cls: string } | null = null;
  let aiProgress: number | null = null;
  if (ai) {
    if (h.solved) aiStatus = { text: `ADVERSARY BEATEN · ${ai.attempts}/${h.maxAttempts} ATTEMPTS USED`, cls: 'green' };
    else if (ai.solved) aiStatus = { text: 'ADVERSARY RECOVERED THE KEY', cls: 'red' };
    else if (h.roundResult === 'exhausted') aiStatus = { text: 'ROUND LOST · KEY ROTATED', cls: 'red' };
    else if (ai.exhausted) aiStatus = { text: 'ADVERSARY EXHAUSTED · THE KEY IS YOURS TO FIND', cls: 'green' };
    else if (ai.thinking) aiStatus = { text: 'ADVERSARY COMPUTING', cls: 'amber' };
    else if (ai.nextAt !== null) {
      const left = Math.max(0, ai.nextAt - now);
      aiStatus = { text: `ADVERSARY NEXT ATTEMPT IN ${Math.ceil(left / 1000)}s`, cls: 'amber' };
      const span = Math.max(1000, ai.nextAt - (ai.sinceAt ?? ai.nextAt - 5000));
      aiProgress = 1 - Math.min(1, left / span);
    } else aiStatus = { text: 'ADVERSARY STANDING BY', cls: 'muted' };
  }

  return (
    <Frame kicker="Partition 30-BETA" title="Brute-force key" className={`accent ${locked ? 'danger' : ''} ${h.solved ? 'success' : ''}`}>
      <p className="small muted">{h.intro}</p>
      {race ? (
        <p className="small muted">
          A hostile process is brute-forcing the same key from the other side of the partition. It sees only its own results; you can see its progress below. Recover the key before it does, or the key rotates.
        </p>
      ) : null}
      <div className="grid" aria-label="Your attempts">
        {rows}
      </div>
      {ai ? (
        <div className={`adversary ${ai.solved ? 'won' : ''}`} aria-label="Adversary attempts">
          <div className="adv-head">
            <span className="tiny">Adversary · {ai.attempts}/{h.maxAttempts}</span>
            {aiStatus ? (
              <span className={`tiny ${aiStatus.cls}`} role="status" aria-live="polite">
                {aiStatus.text}
              </span>
            ) : null}
          </div>
          {aiProgress !== null ? (
            <div className="adv-bar" aria-hidden="true">
              <i style={{ width: `${Math.round(aiProgress * 100)}%` }} />
            </div>
          ) : null}
          <div className="grid mini">{aiRows}</div>
        </div>
      ) : null}
      <div className="legend" aria-hidden="true">
        <span>
          <i className="hit" /> placed
        </span>
        <span>
          <i className="near" /> misplaced
        </span>
        <span>
          <i className="miss" /> absent
        </span>
      </div>
      {h.solved ? (
        <div className="ok center" role="status" style={{ marginTop: 16 }}>
          KEY ACCEPTED. DECRYPTING PARTITION
        </div>
      ) : locked && h.lockedUntil ? (
        <div className="center" style={{ marginTop: 16 }} role="status">
          <div className="red">{h.roundResult === 'ai' ? 'ADVERSARY RECOVERED THE KEY FIRST' : 'PARTITION LOCKED'}</div>
          {h.lastWord ? (
            <div className="tiny">
              the key was <b className="amber">{h.lastWord}</b>
              {race ? ' · a new key is being issued' : ''}
            </div>
          ) : null}
          <div className="tiny">
            {race ? 'Next race in' : 'Reset available in'} <Countdown until={h.lockedUntil} onDone={onDone} />
          </div>
        </div>
      ) : lockPassed ? (
        <button className="btn block" onClick={retry} disabled={busy} style={{ marginTop: 16 }}>
          {race ? 'Start next race' : 'Reset partition'}
        </button>
      ) : (
        <form onSubmit={submit} className="stack" style={{ marginTop: 16 }}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value.toUpperCase().replace(/[^A-Za-z]/g, '').slice(0, h.length))}
            placeholder={`${h.length}-CHARACTER KEY`}
            autoCapitalize="characters"
            autoComplete="off"
            autoCorrect="off"
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
      {h.rounds ? (
        <div className="tiny center" style={{ marginTop: 8 }}>
          {race ? 'Races lost' : 'Partition resets'}: {h.rounds}
        </div>
      ) : null}
    </Frame>
  );
}
