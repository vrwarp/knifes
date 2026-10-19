import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { api, errorText } from '../api';
import { fill, type LetterScore, type PlayerView } from '../types';
import type { StageProps } from './PlayerApp';
import { Countdown, Frame } from './common';
import { Keyboard, PromptSlots } from './Keyboard';

const STATE_WORD = { hit: 'placed', near: 'misplaced', miss: 'absent' } as const;

function describeRow(scored: LetterScore[]): string {
  return scored.map((s) => (s.letter ? `${s.letter} ${STATE_WORD[s.state]}` : STATE_WORD[s.state])).join(', ');
}

export function Hack({ view, setView, refresh }: StageProps) {
  const h = view.hack;
  const t = view.text.hack;
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
    if (h.solved) aiStatus = { text: `${fill(t.advBeaten, { n: ai.attempts })}${cap}`, cls: 'green' };
    else if (ai.solved) aiStatus = { text: t.advRecovered, cls: 'red' };
    else if (ai.exhausted) aiStatus = { text: t.advExhausted, cls: 'green' };
    else if (roundOpen) aiStatus = { text: t.advThinking, cls: 'amber thinking' };
    else aiStatus = { text: t.advStandby, cls: 'muted' };
  }

  const last = h.lastRound;

  return (
    <Frame kicker={t.kicker} title={t.title} className={`console hack ${roundOpen ? 'with-keyboard' : ''} ${locked ? 'danger' : ''} ${h.solved ? 'success' : ''}`}>
      {briefing ? (
        <div className="briefing" role="dialog" aria-modal="true" aria-labelledby="briefing-title">
          <div className="briefing-box">
            <div className="tl-n">{t.partition}</div>
            <h2 id="briefing-title">{fill(t.heading, { n: h.length })}</h2>
            <p>{h.intro}</p>
            {race ? <p>{t.adversaryWarning}</p> : null}
            <p className="legend-line">
              <span className="hit">A</span> {t.legendPlaced} <span className="near">B</span> {t.legendMisplaced} <span className="miss">C</span> {t.legendAbsent}
            </p>
            <button type="button" className="btn primary block" onClick={dismissBriefing} autoFocus>
              {t.engage}
            </button>
          </div>
        </div>
      ) : null}
      <div className="con-line cmd">
        <span className="prompt">$</span> {fill(t.command, { n: h.length })}
        {race ? ` ${t.adversaryFlag}` : ''}
        <button type="button" className="help" onClick={() => setBriefing(true)} aria-label="Show the briefing">
          ?
        </button>
      </div>
      {last && race && !h.solved && !h.freePass ? (
        <div className="con-line sys" role="status">
          <span className="red">!</span> {last.result === 'ai' ? fill(t.raceLostToAdversary, { round: last.round, word: last.word, n: last.aiAttempts }) : fill(t.raceLostSurvived, { round: last.round, word: last.word, n: last.playerAttempts })} <span className="amber">{t.newKey}</span>
        </div>
      ) : null}
      <div className="pane-head">
        <span>
          {t.you} · {h.rows.length}
          {cap}
        </span>
        {ai ? (
          <span>
            {t.adversary} · {ai.attempts}
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
              <PromptSlots value={input} maxLength={h.length} />
            </span>
            <span className="tl-mask">
              {input.length}/{h.length}
            </span>
          </div>
        ) : null}
        {!lines.length && !roundOpen ? <div className="tl dim">{t.noAttempts}</div> : null}
      </div>
      <div ref={endRef} />
      {h.solved ? (
        <div className={`con-line sys result ${h.freePass ? 'amber' : 'green'}`} role="status">
          <span className="prompt">$</span> {h.freePass ?? t.accepted}
        </div>
      ) : locked && h.lockedUntil ? (
        <div className="con-line sys result" role="status">
          <span className="red">{t.locked}</span>
          {h.lastWord ? (
            <>
              {' '}
              · {t.keyWas.split('{word}')[0]}<b className="amber">{h.lastWord}</b>{t.keyWas.split('{word}')[1] ?? ''}
            </>
          ) : null}{' '}
          · {t.resetIn} <Countdown until={h.lockedUntil} onDone={onDone} />
        </div>
      ) : lockPassed ? (
        <button className="btn block" onClick={retry} disabled={busy} style={{ marginTop: 12 }}>
          {t.reset}
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
          enterLabel={t.attempt}
          status={
            <>
              <span>{t.statusLeft}</span>
              <span className="filler-mid">{fill(t.keyspace, { n: h.length })}</span>
              <span className="filler-right">
                {input.length}/{h.length}
                <i className="caret" />
              </span>
            </>
          }
        />
      )}
      {err ? <div className="error center">{err}</div> : null}
      {h.rounds && !race ? <div className="tiny center" style={{ marginTop: 8 }}>{fill(t.resets, { n: h.rounds })}</div> : null}
    </Frame>
  );
}
