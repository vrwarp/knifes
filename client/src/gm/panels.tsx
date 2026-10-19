import { useEffect, useRef, useState } from 'react';
import { api, errorText } from '../api';
import { Markdown } from '../md';
import type { ArchiveMessage, GameConfig, GameEvent, GameState, StageId } from '../types';

export const STAGE_NAME: Record<StageId, string> = {
  intro: 'Link 1 · intro',
  geo: 'Field transmission',
  gate: 'Secure line',
  hack: 'Ledger key',
  reveal: 'Ledger decrypted',
  investigation: 'Investigation',
};

export function useNow(ms: number): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), ms);
    return () => window.clearInterval(t);
  }, [ms]);
  return now;
}

export function fmt(ts: number | undefined | null): string {
  return ts ? new Date(ts).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '';
}

export function elapsed(ms: number): string {
  const m = Math.floor(ms / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  return m ? `${m}m${s ? ` ${s}s` : ''}` : `${s}s`;
}

export const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

function useAction() {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const run = async (fn: () => Promise<unknown>, okText?: string) => {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
      if (okText) setMsg(okText);
    } catch (e) {
      setMsg(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return { busy, msg, run };
}

const RESET_CONSEQUENCE: Partial<Record<StageId, string>> = {
  geo: 'clears his map attempts and shows the field transmission again',
  gate: 'clears his code attempts and shows the secure line again',
  hack: 'clears his guesses and any lockout, and sends his phone back to the key race',
  investigation: 'hides the surveillance records again; the ARCHIVE transcript is kept',
};

export function ProgressPanel({ state, config, stages }: { state: GameState; config: GameConfig; stages: StageId[] }) {
  const now = useNow(1000);
  const visible = stages.filter((s) => s !== 'geo' || config.geo.mode !== 'off');
  const idx = stages.indexOf(state.stage);
  const nextStage = visible[visible.indexOf(state.stage) + 1] ?? state.stage;
  const [jump, setJump] = useState<StageId>(nextStage);
  // Once a GM picks a target, the player advancing must not silently change it under them.
  const picked = useRef(false);
  const resettable: StageId[] = (['geo', 'gate', 'hack', 'investigation'] as StageId[]).filter((s) => s !== 'geo' || config.geo.mode !== 'off');
  const [resetScope, setResetScope] = useState<StageId>(resettable.includes(state.stage) ? state.stage : 'hack');
  const { busy, msg, run } = useAction();
  useEffect(() => {
    if (!picked.current) setJump(nextStage);
  }, [nextStage]);
  useEffect(() => {
    if (resettable.includes(state.stage)) setResetScope(state.stage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.stage]);

  const durationOf = (s: StageId): string | null => {
    const start = state.stageTimes[s];
    if (!start) return null;
    const after = visible.slice(visible.indexOf(s) + 1).map((x) => state.stageTimes[x]).find((t) => t);
    return elapsed((after ?? now) - start);
  };

  return (
    <div className="panel">
      <h2>Progress</h2>
      <div className="chips">
        {visible.map((s) => {
          const i = stages.indexOf(s);
          const cls = i < idx ? 'done' : i === idx ? 'now' : '';
          const dur = durationOf(s);
          return (
            <span key={s} className={`chip ${cls}`} title={fmt(state.stageTimes[s]) || 'not reached'}>
              {STAGE_NAME[s]}
              {dur ? ` · ${dur}` : ''}
            </span>
          );
        })}
      </div>
      <div className="row ctl-row" style={{ marginTop: 12 }}>
        <span className="tiny">Jump to</span>
        <select
          value={jump}
          onChange={(e) => {
            picked.current = true;
            setJump(e.target.value as StageId);
          }} style={{ width: 'auto' }} aria-label="Stage to jump to">
          {visible.map((s) => (
            <option key={s} value={s}>
              {STAGE_NAME[s]}
            </option>
          ))}
        </select>
        <button
          className="btn small"
          disabled={busy || jump === state.stage}
          onClick={() => {
            const back = stages.indexOf(jump) < idx;
            if (back && !window.confirm(`Jump BACK to ${STAGE_NAME[jump]}? His phone will show that screen again, and that puzzle and every one after it start over.`)) return;
            if (!back && !window.confirm(`Unlock ${STAGE_NAME[jump]} now? His phone moves to that screen and this cannot be undone from here.`)) return;
            picked.current = false;
            void run(() => api('/api/gm/stage', { json: { stage: jump } }), `${back ? 'Jumped back to' : 'Unlocked'} ${STAGE_NAME[jump]}`);
          }}
        >
          {stages.indexOf(jump) < idx ? 'Jump back' : 'Unlock / skip to'}
        </button>
      </div>
      <div className="row ctl-row" style={{ marginTop: 8 }}>
        <span className="tiny">Reset</span>
        <select value={resetScope} onChange={(e) => setResetScope(e.target.value as StageId)} style={{ width: 'auto' }} aria-label="Stage to reset">
          {resettable.map((s) => (
            <option key={s} value={s}>
              {STAGE_NAME[s]}
            </option>
          ))}
        </select>
        <button
          className="btn small danger"
          disabled={busy}
          onClick={() => {
            if (!window.confirm(`Reset ${STAGE_NAME[resetScope]}? This ${RESET_CONSEQUENCE[resetScope] ?? 'rewinds that stage'}.`)) return;
            void run(() => api('/api/gm/reset', { json: { scope: resetScope } }), `Reset ${STAGE_NAME[resetScope]}`);
          }}
        >
          Reset stage
        </button>
      </div>
      <div className="row" style={{ marginTop: 8 }}>
        <button className="btn small" disabled={busy} onClick={() => run(() => api('/api/gm/archive/lock', { json: { locked: !state.archive.locked } }))}>
          {state.archive.locked ? 'Unseal ARCHIVE' : 'Seal ARCHIVE'}
        </button>
        <button
          className="btn small ghost"
          disabled={busy}
          onClick={() => {
            if (!window.confirm('Clear the ARCHIVE transcript and start a fresh conversation?')) return;
            void run(() => api('/api/gm/archive/reset', { method: 'POST' }), 'ARCHIVE reset');
          }}
        >
          New ARCHIVE session
        </button>
      </div>
      <details className="section" style={{ marginTop: 12, marginBottom: 0, borderColor: 'var(--red)' }}>
        <summary className="red">Danger zone</summary>
        <p className="small muted">Wipes progress, the log and the ARCHIVE transcript. Configuration is kept. Use after the dry run.</p>
        <button
          className="btn small danger"
          disabled={busy}
          onClick={() => {
            if (window.prompt('Type RESET to wipe the whole game.') !== 'RESET') return;
            void run(() => api('/api/gm/reset', { json: { scope: 'game' } }), 'Whole game reset');
          }}
        >
          Reset whole game
        </button>
      </details>
      {msg ? <div className="small amber" style={{ marginTop: 8 }}>{msg}</div> : null}
    </div>
  );
}

/** The two calls for whoever makes them, with the codes in large type, and the surveillance-records release that goes with the second call. */
export function LedgerPanel({ state, config }: { state: GameState; config: GameConfig }) {
  const { busy, msg, run } = useAction();
  const [part, setPart] = useState<1 | 2>(state.ledger.layer2 ? 2 : 1);
  const canRelease = state.stage === 'investigation';
  const script = part === 1 ? config.phil.part1 : config.phil.part2;
  return (
    <div className="panel" data-testid="ledger-panel">
      <h2>The calls &amp; the Ledger</h2>
      <dl className="kv">
        <dt>Challenge</dt>
        <dd>
          <b>{config.phil.challenge}</b> <span className="muted">→</span> <b>{config.phil.response}</b>
        </dd>
        <dt>Call 1 · Phil</dt>
        <dd>
          <b className="amber" style={{ fontSize: 20, letterSpacing: '0.08em' }}>{config.gate.code}</b> <span className="tiny muted">the recovery authorization code he types at the gate</span>
        </dd>
        <dt>Call 2 · {config.phil.secondCaller}</dt>
        <dd>
          <span className="tiny muted">no code; press Release records below during this call</span>
        </dd>
        <dt>{config.ledger.layer2Label}</dt>
        <dd>
          {state.ledger.layer2 ? (
            <span className="green">RELEASED{state.ledger.layer2ReleasedAt ? ` at ${fmt(state.ledger.layer2ReleasedAt)}` : ''}</span>
          ) : (
            <span>hidden{canRelease ? '' : ' · can be released once he is investigating'}</span>
          )}
        </dd>
      </dl>
      <div className="row" style={{ marginTop: 8 }}>
        <button
          className={`btn small ${state.ledger.layer2 ? 'ghost' : 'primary'}`}
          disabled={busy || (!state.ledger.layer2 && !canRelease)}
          onClick={() => {
            if (!state.ledger.layer2 && !window.confirm(`Release the ${config.ledger.layer2Label.toLowerCase()} to his phone now? Do this during ${config.phil.secondCaller}'s call.`)) return;
            if (state.ledger.layer2 && !window.confirm('Hide the records again? Only for rehearsal: the section disappears from his phone.')) return;
            void run(() => api('/api/gm/ledger/release', { json: { released: !state.ledger.layer2 } }), state.ledger.layer2 ? 'Records hidden' : 'Records released');
          }}
        >
          {state.ledger.layer2 ? 'Hide records' : 'Release records'}
        </button>
        <span className="row" role="group" aria-label="Call script" style={{ gap: 4 }}>
          {([1, 2] as const).map((n) => (
            <button key={n} className={`btn small ${part === n ? '' : 'ghost'}`} onClick={() => setPart(n)} aria-pressed={part === n}>
              Call {n}
            </button>
          ))}
        </span>
        {msg ? <span className="small amber">{msg}</span> : null}
      </div>
      <details className="section" style={{ marginTop: 10, marginBottom: 0 }} open>
        <summary>Call {part} script · {part === 1 ? 'Phil' : config.phil.secondCaller}</summary>
        <pre className="typed small" style={{ whiteSpace: 'pre-wrap', maxHeight: 320, overflowY: 'auto' }}>
          {script}
        </pre>
      </details>
    </div>
  );
}

export function PlayerStatus({ state, config, events }: { state: GameState; config: GameConfig; events: GameEvent[] }) {
  const now = useNow(1000);
  const lockLeft = state.hack.lockedUntil && state.hack.lockedUntil > now ? Math.ceil((state.hack.lockedUntil - now) / 1000) : 0;
  const lastBadCode = [...events].reverse().find((e) => e.type === 'gate_attempt' && e.payload.ok === false)?.payload.code;
  const mode = useAction();
  /** Live switch between the race and the classic solo puzzle; the server redraws the round if he is mid-puzzle. */
  const setMode = (m: 'race' | 'solo') => {
    if (m === config.hack.mode) return;
    const inPuzzle = state.stage === 'hack' && !state.hack.solved;
    if (inPuzzle && !window.confirm(m === 'race' ? 'Switch to the race now? His board clears and a new key is drawn against the AI opponent.' : 'Switch to solo now? His board clears and the fixed secret word applies.')) return;
    void mode.run(() => api('/api/gm/config', { method: 'PUT', json: { ...config, hack: { ...config.hack, mode: m } } }), m === 'race' ? 'Race mode on' : 'Solo mode on');
  };
  return (
    <div className="panel">
      <h2>Player status</h2>
      <dl className="kv">
        <dt>Started</dt>
        <dd>{fmt(state.startedAt) || 'not yet'}</dd>
        <dt>Geo</dt>
        <dd>
          {plural(state.geo.attempts, 'attempt')}
          {state.geo.lastDistanceM !== null ? `, last ${Math.round(state.geo.lastDistanceM)} m` : ''}
          {state.geo.solved ? ', confirmed' : ''}
        </dd>
        <dt>Gate</dt>
        <dd>
          {plural(state.gate.attempts, 'attempt')}, code <b>{config.gate.code}</b>
          {lastBadCode ? <span className="muted"> · last wrong: {String(lastBadCode)}</span> : null}
        </dd>
        <dt>Word puzzle</dt>
        <dd>
          {config.hack.mode === 'race' ? (
            <>
              race {state.hack.round || '–'} · key <b>{state.hack.secret ?? 'not drawn yet'}</b> · Jimmy {state.hack.guesses.join(', ') || 'none'} · adversary{' '}
              {state.hack.ai.guesses.join(', ') || 'none'}
              {state.hack.ai.thinking ? ' (computing)' : ''}
              {state.hack.ai.plan ? ` · script ${state.hack.ai.guesses.length}/${state.hack.ai.plan.length} (${state.hack.ai.planSource})` : ''} · races lost {state.hack.rounds} · words left{' '}
              {Math.max(0, config.hack.wordBank.length - state.hack.used.length)}/{config.hack.wordBank.length}
              {state.hack.roundResult === 'ai' ? <span className="red"> · ADVERSARY WON</span> : state.hack.roundResult === 'exhausted' ? <span className="red"> · OUT OF ATTEMPTS</span> : ''}
            </>
          ) : (
            <>
              secret <b>{config.hack.secret}</b> · guesses {state.hack.guesses.join(', ') || 'none'} · resets {state.hack.rounds}
            </>
          )}
          {lockLeft ? <span className="red"> · LOCKED {lockLeft}s</span> : ''}
          {config.hack.mode === 'race' && config.hack.aiStyle === 'scripted' ? (
            <div className="row" style={{ marginTop: 6 }}>
              <span className="tiny" data-testid="scripts-ready">
                scripts {Object.keys(state.hackScripts.byWord).filter((w) => config.hack.wordBank.includes(w)).length}/{config.hack.wordBank.length}
                {state.hackScripts.busy ? ' · writing…' : ''}
                {Object.values(state.hackScripts.byWord).some((s) => s.source === 'generated') ? ' · some generated' : ''}
              </span>
              <button className="btn small ghost" disabled={state.hackScripts.busy || mode.busy} onClick={() => void mode.run(() => api('/api/gm/hack/scripts', { method: 'POST' }), 'Rewriting scripts')}>
                Rewrite scripts
              </button>
            </div>
          ) : null}
          <div className="row" style={{ marginTop: 6 }} role="group" aria-label="Word puzzle mode">
            <button className={`btn small ${config.hack.mode === 'race' ? 'primary' : 'ghost'}`} onClick={() => setMode('race')} disabled={mode.busy} aria-pressed={config.hack.mode === 'race'}>
              Race vs AI
            </button>
            <button className={`btn small ${config.hack.mode === 'solo' ? 'primary' : 'ghost'}`} onClick={() => setMode('solo')} disabled={mode.busy} aria-pressed={config.hack.mode === 'solo'}>
              Solo
            </button>
            <span className="tiny">
              {mode.msg ??
                (config.hack.mode === 'race'
                  ? `${config.hack.aiStyle === 'scripted' ? `scripted ${config.hack.aiPlanGuesses} ± ${config.hack.aiPlanJitter} guesses` : 'live guesses'} · every ${config.hack.aiIntervalSeconds}s ± ${config.hack.aiJitterSeconds}s, ×${config.hack.aiSlowdownPerRound} per lost round`
                  : `secret ${config.hack.secret}`)}
            </span>
          </div>
        </dd>
        <dt>Ledger</dt>
        <dd>
          personnel files {state.ledger.layer1 ? 'open' : 'closed'} · {config.ledger.layer2Label.toLowerCase()} {state.ledger.layer2 ? <b className="green">released{state.ledger.layer2ReleasedAt ? ` at ${fmt(state.ledger.layer2ReleasedAt)}` : ''}</b> : 'hidden'}
        </dd>
        <dt>ARCHIVE</dt>
        <dd>
          {plural(state.archive.messageCount, 'query').replace('querys', 'queries')}
          {state.archive.busy ? ', answering' : ''}
          {state.archive.locked ? ', SEALED' : ''}
        </dd>
      </dl>
    </div>
  );
}

export function HintsPanel({ state, config }: { state: GameState; config: GameConfig }) {
  const [text, setText] = useState('');
  const [strength, setStrength] = useState<'nudge' | 'clear' | 'strong'>('nudge');
  const [rationale, setRationale] = useState<string | null>(null);
  const { busy, msg, run } = useAction();
  const quick = config.hints.quick[state.stage] ?? [];
  const [drafting, setDrafting] = useState(false);
  const draftToken = useRef(0);
  const push = (t: string) =>
    run(async () => {
      await api('/api/gm/hint', { json: { text: t } });
      if (t === text) {
        setText('');
        setRationale(null);
      }
    }, 'Pushed to his screen');
  return (
    <div className="panel hints">
      <h2>Hints · {STAGE_NAME[state.stage]}</h2>
      {quick.length ? (
        <div style={{ marginBottom: 10 }}>
          {quick.map((q, i) => (
            <div key={i} className="quick-row">
              <span className="text">{q}</span>
              <button className="btn small ghost" disabled={busy} onClick={() => setText(q)} title="Load into the editor">
                Edit
              </button>
              <button className="btn small primary" disabled={busy} onClick={() => void push(q)}>
                Send
              </button>
            </div>
          ))}
        </div>
      ) : null}
      <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Write a transmission, or draft one with AI" aria-label="Transmission text" rows={3} />
      {rationale ? <div className="small muted">Copilot: {rationale}</div> : null}
      <button className="btn primary block" disabled={busy || !text.trim()} onClick={() => void push(text)} style={{ marginTop: 8 }}>
        Push to his screen
      </button>
      <div className="row" style={{ marginTop: 8 }}>
        <span className="tiny">AI draft</span>
        <select value={strength} onChange={(e) => setStrength(e.target.value as 'nudge' | 'clear' | 'strong')} style={{ width: 'auto', minHeight: 40 }} aria-label="Hint strength">
          <option value="nudge">nudge</option>
          <option value="clear">clear</option>
          <option value="strong">strong</option>
        </select>
        <button
          className="btn small"
          disabled={drafting}
          onClick={() => {
            // Drafting runs on its own flag so quick hints and pushes keep working while the model thinks.
            const token = ++draftToken.current;
            setDrafting(true);
            void api<{ hint: string; rationale: string; source: string }>('/api/gm/hint/draft', { json: { strength }, timeoutMs: 120_000 })
              .then((r) => {
                if (token !== draftToken.current) return;
                setText(r.hint);
                setRationale(`${r.rationale} [${r.source}]`);
              })
              .catch((e) => {
                if (token === draftToken.current) setRationale(`Draft failed: ${errorText(e)}`);
              })
              .finally(() => {
                if (token === draftToken.current) setDrafting(false);
              });
          }}
        >
          Draft
        </button>
        {drafting ? (
          <>
            <span className="small amber cursor">Drafting</span>
            <button
              className="btn small ghost"
              onClick={() => {
                draftToken.current++;
                setDrafting(false);
              }}
            >
              Cancel
            </button>
          </>
        ) : null}
      </div>
      {state.hints.length ? (
        <div style={{ marginTop: 10 }} className="pushed">
          <h3>Pushed</h3>
          {[...state.hints].reverse().map((h) => (
            <div key={h.id} className="small">
              <span className="muted">{fmt(h.ts)}</span> {h.text}
            </div>
          ))}
        </div>
      ) : null}
      {msg ? <div className="small amber" style={{ marginTop: 8 }}>{msg}</div> : null}
    </div>
  );
}

type Lane = 'all' | 'player' | 'gm' | 'ai';
const GM_TYPES = new Set(['gm_action', 'hint_pushed']);
const AI_TYPES = new Set(['archive_assistant', 'archive_tool', 'ai_error', 'report', 'hack_ai_guess', 'hack_ai_solved', 'hack_ai_plan', 'hack_scripts']);
const laneOf = (t: string): Lane => (GM_TYPES.has(t) ? 'gm' : AI_TYPES.has(t) ? 'ai' : 'player');

function describe(e: GameEvent): { text: string; cls: string } {
  const p = e.payload as Record<string, unknown>;
  const s = (k: string) => String(p[k] ?? '');
  switch (e.type) {
    case 'game_start':
      return { text: 'recovery protocol initiated', cls: 'ok' };
    case 'stage':
      return { text: `→ ${STAGE_NAME[s('stage') as StageId] ?? s('stage')}`, cls: 'ok' };
    case 'geo_guess':
      return { text: p.solved ? `pin CONFIRMED (${Math.round(Number(p.distanceM ?? 0))} m)` : `pin ${Math.round(Number(p.distanceM ?? 0))} m off`, cls: p.solved ? 'ok' : 'fail' };
    case 'gate_attempt':
      return { text: `"${s('code')}" ${p.ok ? 'ACCEPTED' : 'rejected'}`, cls: p.ok ? 'ok' : 'fail' };
    case 'hack_guess': {
      const scores = Array.isArray(p.scores) ? (p.scores as string[]).map((x) => (x === 'hit' ? '■' : x === 'near' ? '◪' : '□')).join('') : '';
      return { text: `${s('guess')} ${scores}${p.solved ? ' SOLVED' : ''}`, cls: p.solved ? 'ok' : '' };
    }
    case 'hack_lockout':
      return { text: `${p.reason === 'ai' ? 'adversary took the key' : 'partition locked'}${p.word ? ` (${s('word')})` : ''}, round ${s('rounds')}`, cls: 'fail' };
    case 'hack_solved':
      return { text: `solved in ${s('attempts')}${p.aiAttempts !== undefined ? `, adversary at ${s('aiAttempts')}` : ''}`, cls: 'ok' };
    case 'hack_round':
      return { text: `race ${s('round')}: key is ${s('word')} (${s('used')}/${s('bank')} words used${p.paceSeconds !== undefined ? `, opponent every ${Number(p.paceSeconds)}s ± ${Number(p.jitterSeconds)}s` : ''})`, cls: '' };
    case 'hack_ai_guess': {
      const scores = Array.isArray(p.scores) ? (p.scores as string[]).map((x) => (x === 'hit' ? '■' : x === 'near' ? '◪' : '□')).join('') : '';
      return { text: `adversary ${s('guess')} ${scores}${p.solved ? ' SOLVED' : ''}${p.source === 'solver' ? ' (solver)' : ''}`, cls: p.solved ? 'fail' : '' };
    }
    case 'hack_ai_plan':
      return { text: `adversary script (${s('source')}): ${Array.isArray(p.plan) ? (p.plan as string[]).join(' → ') : s('guesses') + ' guesses'}`, cls: '' };
    case 'hack_free_pass':
      return { text: `free pass after ${s('rounds')} lost races: "${s('text').slice(0, 80)}"`, cls: 'ok' };
    case 'hack_scripts':
      return { text: `adversary scripts ready ${s('ready')}/${s('total')}${p.live ? '' : ' (generated, no Claude credential)'}`, cls: '' };
    case 'hack_round_lost':
      return { text: `race lost (${s('reason') === 'ai' ? 'adversary took' : 'out of attempts on'} ${s('word')}), next key issued`, cls: 'fail' };
    case 'hack_ai_solved':
      return { text: `adversary solved in ${s('attempts')}, Jimmy was at ${s('playerAttempts')}`, cls: 'fail' };
    case 'ledger_release':
      return { text: `${s('layer') === '2' ? 'surveillance records' : 'personnel files'} released`, cls: 'ok' };
    case 'archive_user':
      return { text: `> ${s('text')}`, cls: '' };
    case 'archive_assistant':
      return { text: `${s('text').slice(0, 160)}${s('text').length > 160 ? '…' : ''}`, cls: '' };
    case 'archive_tool':
      return { text: `tool ${s('name')}`, cls: '' };
    case 'hint_pushed':
      return { text: `hint: ${s('text').slice(0, 100)}${s('text').length > 100 ? '…' : ''}`, cls: '' };
    case 'gm_action':
      return { text: `${s('action')}${p.stage ? ` ${s('stage')}` : ''}${p.kind ? ` ${s('kind')}` : ''}`, cls: '' };
    case 'ai_error':
      return { text: `${s('where')}: ${s('error').slice(0, 140)}`, cls: 'err' };
    case 'report':
      return { text: `case file generated (${s('source')}, ${s('chars')} chars)`, cls: 'ok' };
    default:
      return { text: JSON.stringify(p).slice(0, 160), cls: '' };
  }
}

export function LiveLog({ events }: { events: GameEvent[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  const [lane, setLane] = useState<Lane>('all');
  const shown = lane === 'all' ? events : events.filter((e) => laneOf(e.type) === lane);
  useEffect(() => {
    const el = ref.current;
    if (el && atBottom.current) el.scrollTop = el.scrollHeight;
  }, [shown.length]);
  return (
    <div className="panel">
      <h2>Live log ({events.length})</h2>
      <div className="log-filters" role="tablist">
        {(['all', 'player', 'gm', 'ai'] as Lane[]).map((l) => (
          <button key={l} className={lane === l ? 'active' : ''} onClick={() => setLane(l)} role="tab" aria-selected={lane === l}>
            {l}
          </button>
        ))}
      </div>
      <div
        className="log"
        ref={ref}
        onScroll={(e) => {
          const el = e.currentTarget;
          atBottom.current = el.scrollTop + el.clientHeight >= el.scrollHeight - 24;
        }}
      >
        {shown.map((e) => {
          const d = describe(e);
          return (
            <div key={e.id} className={`ev ${d.cls} ${laneOf(e.type) === 'gm' ? 'gm' : ''}`}>
              <span className="t">{fmt(e.ts)}</span>
              <span className="k">{e.type.replace(/_/g, ' ')}</span>
              <span className="p">{d.text}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function ArchivePanel({ archive, state }: { archive: ArchiveMessage[]; state: GameState }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [archive.length]);
  return (
    <div className="panel">
      <h2>
        ARCHIVE transcript {state.archive.busy ? <span className="amber">· answering</span> : null}
        {state.archive.sessionId ? <span className="muted small"> · session {state.archive.sessionId.slice(0, 8)}</span> : null}
      </h2>
      <div className="chat" ref={ref} style={{ maxHeight: 380, minHeight: 0 }}>
        {archive.length ? (
          archive.map((m) => (
            <div key={m.id} className={`msg ${m.role}`}>
              <span className="who">
                {m.role === 'user' ? 'Detective' : m.role === 'assistant' ? 'ARCHIVE' : 'LINK'} {fmt(m.ts)}
                {m.meta?.tools ? ` · tools: ${(m.meta.tools as string[]).join(', ')}` : ''}
                {typeof m.meta?.costUsd === 'number' ? ` · $${(m.meta.costUsd as number).toFixed(3)}` : ''}
              </span>
              <span className="text">{m.text}</span>
            </div>
          ))
        ) : (
          <p className="muted small">No queries yet.</p>
        )}
      </div>
    </div>
  );
}

export function ReportPanel({ state }: { state: GameState }) {
  const { busy, msg, run } = useAction();
  const [open, setOpen] = useState(false);
  return (
    <div className="panel">
      <h2>Case report</h2>
      <div className="row">
        <button
          className="btn small"
          disabled={busy}
          onClick={() => {
            void run(() => api('/api/gm/report/generate', { method: 'POST', timeoutMs: 240_000 }), 'Report generated');
          }}
        >
          {state.report.markdown ? 'Regenerate' : 'Generate'} with AI
        </button>
        <button className="btn small ghost" disabled={!state.report.markdown} onClick={() => setOpen((o) => !o)}>
          {open ? 'Hide' : 'Preview'}
        </button>
        <button className="btn small ghost" disabled={!state.report.markdown} onClick={() => window.print()}>
          Print
        </button>
      </div>
      {busy ? <div className="small amber cursor" style={{ marginTop: 8 }}>Working</div> : null}
      {msg ? <div className="small amber" style={{ marginTop: 8 }}>{msg}</div> : null}
      {state.report.generatedAt ? <div className="tiny" style={{ marginTop: 8 }}>Generated {fmt(state.report.generatedAt)}</div> : null}
      {open && state.report.markdown ? (
        <div className="frame" style={{ marginTop: 10 }}>
          <Markdown text={state.report.markdown} />
        </div>
      ) : null}
    </div>
  );
}
