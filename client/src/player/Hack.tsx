import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { api, errorText } from '../api';
import type { LetterScore, LetterState, PlayerView } from '../types';
import type { StageProps } from './PlayerApp';
import { Countdown, Frame } from './common';

const STATE_WORD = { hit: 'placed', near: 'misplaced', miss: 'absent' } as const;
const KEY_ROWS = ['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM'];
const RANK: Record<LetterState, number> = { miss: 1, near: 2, hit: 3 };

function describeRow(scored: LetterScore[]): string {
  return scored.map((s) => (s.letter ? `${s.letter} ${STATE_WORD[s.state]}` : STATE_WORD[s.state])).join(', ');
}

/** Best thing known about each letter from the rows given: placed beats misplaced beats absent. */
function letterKnowledge(rows: LetterScore[][]): Record<string, LetterState> {
  const out: Record<string, LetterState> = {};
  for (const row of rows) {
    for (const s of row) {
      if (!s.letter) continue;
      const cur = out[s.letter];
      if (!cur || RANK[s.state] > RANK[cur]) out[s.letter] = s.state;
    }
  }
  return out;
}

export function Hack({ view, setView, refresh }: StageProps) {
  const h = view.hack;
  const ai = h.ai;
  const race = h.mode === 'race' && ai !== null;
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [shake, setShake] = useState(false);
  const [expired, setExpired] = useState(false);
  const locked = h.lockedUntil !== null && h.lockedUntil > Date.now() && !expired;
  const lockPassed = h.lockedUntil !== null && (expired || h.lockedUntil <= Date.now());
  const onDone = useCallback(() => setExpired(true), []);
  const rowStyle = { '--n': h.length } as CSSProperties;
  const roundOpen = !locked && !lockPassed && !h.solved;
  // A fresh lockout arrives with a new lockedUntil; forget that the previous one ran out.
  useEffect(() => setExpired(false), [h.lockedUntil]);
  // A new key was issued (the adversary took the last one): whatever he was typing is for a dead word.
  const lastRoundSeen = useRef(h.round);
  useEffect(() => {
    if (lastRoundSeen.current !== h.round) {
      lastRoundSeen.current = h.round;
      setInput('');
      setErr(null);
    }
  }, [h.round]);

  const submit = useCallback(async () => {
    if (busy || !roundOpen) return;
    const word = input;
    if (word.length !== h.length) {
      setShake(true);
      window.setTimeout(() => setShake(false), 450);
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
  }, [busy, roundOpen, input, h.length, refresh]);

  const press = useCallback(
    (key: string) => {
      if (!roundOpen || busy) return;
      if (key === 'ENTER') void submit();
      else if (key === 'BACK') setInput((v) => v.slice(0, -1));
      else if (/^[A-Z]$/.test(key)) setInput((v) => (v.length < h.length ? v + key : v));
    },
    [roundOpen, busy, submit, h.length],
  );

  // A hardware keyboard (desktop, or a phone with one attached) works too.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      if (e.key === 'Enter') press('ENTER');
      else if (e.key === 'Backspace') press('BACK');
      else if (/^[a-zA-Z]$/.test(e.key)) press(e.key.toUpperCase());
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [press]);

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

  const cap = h.maxAttempts === null ? '' : `/${h.maxAttempts}`;
  // With no cap the board grows: at least six rows, always one empty row beyond the last guess.
  const playerRows = h.maxAttempts ?? Math.max(6, h.rows.length + (roundOpen ? 1 : 0));
  const rows = [];
  for (let i = 0; i < playerRows; i++) {
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
      const letters = input.padEnd(h.length).split('');
      rows.push(
        <div className={`trow ${shake ? 'shake' : ''}`} key={i} style={rowStyle} aria-label="Current attempt" role="img">
          {letters.map((l, j) => (
            <div key={j} className={`tile pending ${l.trim() ? 'filled' : ''}`}>
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

  // The opponent's board: one small row per attempt, letters included unless the GM hid them.
  const aiRows = [];
  if (ai) {
    const n = h.maxAttempts ?? Math.max(6, ai.rows.length + (roundOpen && !ai.solved ? 1 : 0));
    for (let i = 0; i < n; i++) {
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
              <div key={j} className={`tile ${i === ai.rows.length && roundOpen ? 'computing' : ''}`} />
            ))}
          </div>,
        );
      }
    }
  }

  // Jimmy never sees the clock: between attempts the adversary is simply thinking.
  let aiStatus: { text: string; cls: string } | null = null;
  if (ai) {
    if (h.solved) aiStatus = { text: `BEATEN AT ${ai.attempts}${cap} ATTEMPTS`, cls: 'green' };
    else if (ai.solved) aiStatus = { text: 'RECOVERED THE KEY', cls: 'red' };
    else if (ai.exhausted) aiStatus = { text: 'EXHAUSTED', cls: 'green' };
    else if (roundOpen) aiStatus = { text: 'THINKING...', cls: 'amber thinking' };
    else aiStatus = { text: 'STANDING BY', cls: 'muted' };
  }

  const known = letterKnowledge(h.rows);
  const last = h.lastRound;

  return (
    <Frame kicker="Partition 30-BETA" title="Brute-force key" className={`accent hack ${roundOpen ? 'with-keyboard' : ''} ${locked ? 'danger' : ''} ${h.solved ? 'success' : ''}`}>
      <p className="small muted hack-intro">
        {h.intro}
        {race ? ' A hostile process is attacking the same key. Beat it to the word or the key rotates.' : ''}
      </p>
      {last && race && !h.solved && !h.freePass ? (
        <div className="round-banner" role="status">
          <span className="red">RACE {last.round} LOST</span> · {last.result === 'ai' ? `adversary took ${last.word} in ${last.aiAttempts}` : `${last.word} survived ${last.playerAttempts}`} · <span className="amber">new key issued</span>
        </div>
      ) : null}
      <div className="boards">
        <div className="board you">
          <div className="board-head">
            <span className="tiny">You · {h.rows.length}{cap}</span>
          </div>
          <div className="grid" aria-label="Your attempts">
            {rows}
          </div>
        </div>
        {ai ? (
          <div className={`board adversary ${ai.solved ? 'won' : ''}`} aria-label="Adversary attempts">
            <div className="board-head">
              <span className="tiny">Adversary · {ai.attempts}{cap}</span>
              {aiStatus ? (
                <span className={`tiny ${aiStatus.cls}`} role="status" aria-live="polite">
                  {aiStatus.text}
                </span>
              ) : null}
            </div>
            <div className="grid mini">{aiRows}</div>
          </div>
        ) : null}
      </div>
      {h.solved ? (
        <div className={`${h.freePass ? 'amber' : 'ok'} center`} role="status" style={{ marginTop: 12, fontSize: 13 }}>
          {h.freePass ?? 'KEY ACCEPTED. DECRYPTING PARTITION'}
        </div>
      ) : locked && h.lockedUntil ? (
        <div className="center" style={{ marginTop: 12 }} role="status">
          <div className="red">PARTITION LOCKED</div>
          {h.lastWord ? (
            <div className="tiny">
              the key was <b className="amber">{h.lastWord}</b>
            </div>
          ) : null}
          <div className="tiny">
            Reset available in <Countdown until={h.lockedUntil} onDone={onDone} />
          </div>
        </div>
      ) : lockPassed ? (
        <button className="btn block" onClick={retry} disabled={busy} style={{ marginTop: 12 }}>
          Reset partition
        </button>
      ) : (
        <div className="keyboard" role="group" aria-label="Keyboard">
          <div className="keyboard-inner">
            {KEY_ROWS.map((row, r) => (
              <div className="krow" key={r}>
                {row.split('').map((k) => (
                  <button type="button" key={k} className={`key ${known[k] ?? ''}`} onClick={() => press(k)} disabled={busy} aria-label={`${k}${known[k] ? `, ${STATE_WORD[known[k]]}` : ''}`}>
                    {k}
                  </button>
                ))}
                {r === 2 ? (
                  <button type="button" className="key wide back" onClick={() => press('BACK')} disabled={busy || !input} aria-label="Delete letter">
                    ⌫
                  </button>
                ) : null}
              </div>
            ))}
            <div className="krow">
              {/* The space-bar slot: a dead key dressed as the console's status line. */}
              <div className="key filler" aria-hidden="true">
                <span>SEC-30 // 30-BETA</span>
                <span className="filler-mid">KEYSPACE 26^{h.length}</span>
                <span className="filler-right">
                  {input.length}/{h.length}
                  <i className="caret" />
                </span>
              </div>
              <button type="button" className="key wide enter" onClick={() => press('ENTER')} disabled={busy || input.length !== h.length} aria-label="Attempt key">
                ENTER
              </button>
            </div>
          </div>
        </div>
      )}
      {err ? <div className="error center">{err}</div> : null}
      {h.rounds && !race ? <div className="tiny center" style={{ marginTop: 8 }}>Partition resets: {h.rounds}</div> : null}
    </Frame>
  );
}
