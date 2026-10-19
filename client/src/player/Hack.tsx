import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { api, errorText } from '../api';
import type { LetterScore, PlayerView } from '../types';
import type { StageProps } from './PlayerApp';
import { Countdown, Frame } from './common';
import { Keyboard } from './Keyboard';

const STATE_WORD = { hit: 'placed', near: 'misplaced', miss: 'absent' } as const;

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
  const BRIEFED_KEY = 's30.hackBriefed';
  const [briefing, setBriefing] = useState<boolean>(() => {
    try {
      return localStorage.getItem(BRIEFED_KEY) !== '1';
    } catch {
      return true;
    }
  });
  const dismissBriefing = useCallback(() => {
    setBriefing(false);
    try {
      localStorage.setItem(BRIEFED_KEY, '1');
    } catch {
      /* private mode */
    }
  }, []);
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

  // While the briefing is up, Enter or Escape dismisses it; the keyboard itself is paused.
  useEffect(() => {
    if (!briefing) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === 'Escape') dismissBriefing();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [briefing, dismissBriefing]);

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
  const MASK = { hit: '#', near: '+', miss: '.' } as const;

  // A CLI prints a transcript: every attempt from either side is one line, in the order it happened,
  // with the letters coloured by score and the pattern in plain ASCII (# placed, + misplaced, . absent).
  type Line = { who: 'you' | 'adv'; n: number; at: number; scored: LetterScore[]; win: boolean };
  const lines: Line[] = h.rows.map((scored, i) => ({ who: 'you', n: i + 1, at: h.guessAt[i] ?? i, scored, win: h.solved && i === h.rows.length - 1 }));
  if (ai) for (const [i, scored] of ai.rows.entries()) lines.push({ who: 'adv', n: i + 1, at: ai.guessAt[i] ?? i, scored, win: ai.solved && i === ai.rows.length - 1 });
  lines.sort((a, b) => a.at - b.at || (a.who === 'you' ? -1 : 1));
  const transcript = lines.map((l) => (
    <div className={`tl ${l.who} ${l.win ? 'win' : ''}`} key={`${l.who}${l.n}`} role="img" aria-label={`${l.who === 'adv' ? 'Adversary attempt' : 'Attempt'} ${l.n}: ${describeRow(l.scored)}`}>
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
    <Frame kicker="sec-30 terminal // tty1" title="Brute-force key" className={`console hack ${roundOpen ? 'with-keyboard' : ''} ${locked ? 'danger' : ''} ${h.solved ? 'success' : ''}`}>
      {briefing ? (
        <div className="briefing" role="dialog" aria-modal="true" aria-labelledby="briefing-title">
          <div className="briefing-box">
            <div className="tl-n">partition 30-beta</div>
            <h2 id="briefing-title">Brute-force the {h.length}-character key</h2>
            <p>{h.intro}</p>
            {race ? <p>An adversary process is working the same key. Find it first or the key rotates.</p> : null}
            <p className="legend-line">
              <span className="hit">A</span> placed <span className="near">B</span> misplaced <span className="miss">C</span> absent
            </p>
            <button type="button" className="btn primary block" onClick={dismissBriefing} autoFocus>
              Engage
            </button>
          </div>
        </div>
      ) : null}
      <div className="con-line cmd">
        <span className="prompt">$</span> breach --key {h.length}
        {race ? ' --adversary' : ''}
        <button type="button" className="help" onClick={() => setBriefing(true)} aria-label="Show the briefing">
          ?
        </button>
      </div>
      {last && race && !h.solved && !h.freePass ? (
        <div className="con-line sys" role="status">
          <span className="red">!</span> race {last.round} lost: {last.result === 'ai' ? `adversary took ${last.word} in ${last.aiAttempts}` : `${last.word} survived ${last.playerAttempts}`}. <span className="amber">new key issued.</span>
        </div>
      ) : null}
      <div className="pane-head">
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
              ...<i className="caret amber" />
            </span>
          </div>
        ) : null}
        {roundOpen ? (
          <div className={`tl you prompt-line ${shake ? 'shake' : ''}`} role="img" aria-label="Current attempt">
            <span className="tl-who">you</span>
            <span className="tl-n prompt">{'>'}</span>
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
        {!lines.length && !roundOpen ? <div className="tl dim">no attempts</div> : null}
      </div>
      <div ref={endRef} />
      {h.solved ? (
        <div className={`con-line sys result ${h.freePass ? 'amber' : 'green'}`} role="status">
          <span className="prompt">$</span> {h.freePass ?? 'KEY ACCEPTED. DECRYPTING PARTITION'}
        </div>
      ) : locked && h.lockedUntil ? (
        <div className="con-line sys result" role="status">
          <span className="red">PARTITION LOCKED</span>
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
        <Keyboard
          value={input}
          onChange={setInput}
          onEnter={() => void submit()}
          maxLength={h.length}
          canEnter={input.length === h.length}
          disabled={busy}
          paused={briefing}
          enterLabel="Attempt key"
          status={
            <>
              <span>SEC-30 // 30-BETA</span>
              <span className="filler-mid">KEYSPACE 26^{h.length}</span>
              <span className="filler-right">
                {input.length}/{h.length}
                <i className="caret" />
              </span>
            </>
          }
        />
      )}
      {err ? <div className="error center">{err}</div> : null}
      {h.rounds && !race ? <div className="tiny center" style={{ marginTop: 8 }}>Partition resets: {h.rounds}</div> : null}
    </Frame>
  );
}
