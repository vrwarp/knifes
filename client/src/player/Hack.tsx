import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { api, errorText } from '../api';
import type { LetterScore, PlayerView } from '../types';
import type { StageProps } from './PlayerApp';
import { Countdown, Frame } from './common';

const STATE_WORD = { hit: 'placed', near: 'misplaced', miss: 'absent' } as const;
const KEY_ROWS = ['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM'];

function describeRow(scored: LetterScore[]): string {
  return scored.map((s) => (s.letter ? `${s.letter} ${STATE_WORD[s.state]}` : STATE_WORD[s.state])).join(', ');
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
  const endRef = useRef<HTMLDivElement | null>(null);
  const lineCount = h.rows.length + (ai?.rows.length ?? 0);
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'nearest' });
  }, [lineCount]);
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
  const MASK = { hit: '█', near: '▒', miss: '·' } as const;

  // A CLI prints a transcript, not a grid: every attempt from either side is one line, in the
  // order it happened, with the letters coloured by their score and the pattern beside them.
  type Line = { who: 'you' | 'adv'; n: number; at: number; scored: LetterScore[]; win: boolean };
  const lines: Line[] = h.rows.map((scored, i) => ({ who: 'you', n: i + 1, at: h.guessAt[i] ?? i, scored, win: h.solved && i === h.rows.length - 1 }));
  if (ai) for (const [i, scored] of ai.rows.entries()) lines.push({ who: 'adv', n: i + 1, at: ai.guessAt[i] ?? i, scored, win: ai.solved && i === ai.rows.length - 1 });
  lines.sort((a, b) => a.at - b.at || (a.who === 'you' ? -1 : 1));
  const transcript = lines.map((l) => (
    <div
      className={`tl ${l.who} ${l.win ? 'win' : ''}`}
      key={`${l.who}${l.n}`}
      role="img"
      aria-label={`${l.who === 'adv' ? 'Adversary attempt' : 'Attempt'} ${l.n}: ${describeRow(l.scored)}`}
    >
      <span className="tl-who">{l.who}</span>
      <span className="tl-n">{String(l.n).padStart(2, '0')}</span>
      <span className="tl-word">
        {l.scored.map((c, j) => (
          <span key={j} className={c.state}>
            {c.letter || '#'}
          </span>
        ))}
      </span>
      <span className="tl-mask">{l.scored.map((c) => MASK[c.state]).join('')}</span>
    </div>
  ));

  // Jimmy never sees the clock: between attempts the adversary is simply thinking.
  let aiStatus: { text: string; cls: string } | null = null;
  if (ai) {
    if (h.solved) aiStatus = { text: `beaten at ${ai.attempts}${cap}`, cls: 'green' };
    else if (ai.solved) aiStatus = { text: 'recovered the key', cls: 'red' };
    else if (ai.exhausted) aiStatus = { text: 'exhausted', cls: 'green' };
    else if (roundOpen) aiStatus = { text: 'thinking...', cls: 'amber thinking' };
    else aiStatus = { text: 'standing by', cls: 'muted' };
  }

  const last = h.lastRound;
  const typed = input.padEnd(h.length).split('');

  return (
    <Frame kicker="SEC-30 TERMINAL // TTY1" title="Brute-force key" className={`console hack ${roundOpen ? 'with-keyboard' : ''} ${locked ? 'danger' : ''} ${h.solved ? 'success' : ''}`}>
      <div className="con-line cmd" aria-hidden="true">
        <span className="prompt">$</span> breach --partition 30-BETA --key {h.length}
        {race ? ' --adversary on' : ''}
      </div>
      <div className="con-line sys hack-intro">
        <span className="tag">[sys]</span> {h.intro}
        {race ? ' A hostile process is on the same key. Beat it or the key rotates.' : ''}
      </div>
      {race ? (
        <div className="con-line sys" aria-hidden="true">
          <span className="tag">[sys]</span> keyspace 26^{h.length} · adversary process attached · {h.wordsLeft ?? 0} keys left
        </div>
      ) : null}
      {last && race && !h.solved && !h.freePass ? (
        <div className="con-line sys round-banner" role="status">
          <span className="tag red">[sys]</span> <span className="red">race {last.round} lost</span>: {last.result === 'ai' ? `adversary took ${last.word} in ${last.aiAttempts}` : `${last.word} survived ${last.playerAttempts}`}. <span className="amber">new key issued.</span>
        </div>
      ) : null}
      <div className="con-head">
        <span>
          You · {h.rows.length}
          {cap}
        </span>
        {ai ? (
          <span>
            Adversary · {ai.attempts}
            {cap}
            {aiStatus ? (
              <>
                {' '}
                <span className={aiStatus.cls} role="status" aria-live="polite">
                  [{aiStatus.text}]
                </span>
              </>
            ) : null}
          </span>
        ) : null}
      </div>
      <div className="transcript" aria-label="Attempts">
        {transcript}
        {ai && roundOpen && !ai.solved && !ai.exhausted ? (
          <div className="tl adv pending" aria-hidden="true">
            <span className="tl-who">adv</span>
            <span className="tl-n">{String(ai.attempts + 1).padStart(2, '0')}</span>
            <span className="tl-word dim">
              computing<i className="caret amber" />
            </span>
          </div>
        ) : null}
        {roundOpen ? (
          <div className={`tl you prompt-line ${shake ? 'shake' : ''}`} role="img" aria-label="Current attempt">
            <span className="tl-who">you</span>
            <span className="tl-n">{'>'}</span>
            <span className="tl-word typing">
              {typed.map((l, j) => (
                <span key={j} className={l.trim() ? 'typed' : 'slot'}>
                  {l.trim() || '_'}
                </span>
              ))}
              <i className="caret" />
            </span>
            <span className="tl-mask">
              {input.length}/{h.length}
            </span>
          </div>
        ) : null}
      </div>
      <div ref={endRef} />
      {h.solved ? (
        <div className={`con-line sys result ${h.freePass ? 'amber' : 'green'}`} role="status">
          <span className="tag">[sys]</span> {h.freePass ?? 'KEY ACCEPTED. DECRYPTING PARTITION'}
        </div>
      ) : locked && h.lockedUntil ? (
        <div className="con-line sys result" role="status">
          <span className="tag red">[sys]</span> <span className="red">PARTITION LOCKED</span>
          {h.lastWord ? (
            <>
              {' '}
              · the key was <b className="amber">{h.lastWord}</b>
            </>
          ) : null}{' '}
          · reset in <Countdown until={h.lockedUntil} onDone={onDone} />
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
                {r === 2 ? <div className="key wide spacer" aria-hidden="true" /> : null}
                {row.split('').map((k) => (
                  <button type="button" key={k} className="key" onClick={() => press(k)} disabled={busy} aria-label={k}>
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
