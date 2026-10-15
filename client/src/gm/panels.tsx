import { useEffect, useRef, useState } from 'react';
import { api, errorText } from '../api';
import { Markdown } from '../md';
import type { ArchiveMessage, GameConfig, GameEvent, GameState, StageId } from '../types';

function fmt(ts: number | undefined | null): string {
  return ts ? new Date(ts).toLocaleTimeString([], { hour12: false }) : '';
}

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

export function ProgressPanel({ state, config, stages }: { state: GameState; config: GameConfig; stages: StageId[] }) {
  const [jump, setJump] = useState<StageId>('investigation');
  const [resetScope, setResetScope] = useState<'game' | StageId>('hack');
  const { busy, msg, run } = useAction();
  const idx = stages.indexOf(state.stage);
  const visible = stages.filter((s) => s !== 'geo' || config.geo.mode !== 'off');
  return (
    <div className="panel">
      <h2>Progress</h2>
      <div className="chips">
        {visible.map((s) => {
          const i = stages.indexOf(s);
          const cls = i < idx ? 'done' : i === idx ? 'now' : '';
          return (
            <span key={s} className={`chip ${cls}`} title={fmt(state.stageTimes[s])}>
              {s}
              {state.stageTimes[s] ? ` ${fmt(state.stageTimes[s])}` : ''}
            </span>
          );
        })}
      </div>
      <div className="row" style={{ marginTop: 12 }}>
        <select value={jump} onChange={(e) => setJump(e.target.value as StageId)} style={{ width: 'auto' }}>
          {visible.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <button className="btn small" disabled={busy} onClick={() => run(() => api('/api/gm/stage', { json: { stage: jump } }), `Jumped to ${jump}`)}>
          Jump / unlock
        </button>
      </div>
      <div className="row" style={{ marginTop: 8 }}>
        <select value={resetScope} onChange={(e) => setResetScope(e.target.value as 'game' | StageId)} style={{ width: 'auto' }}>
          {(['geo', 'gate', 'hack', 'investigation'] as StageId[]).map((s) => (
            <option key={s} value={s}>
              reset {s}
            </option>
          ))}
          <option value="game">reset WHOLE GAME</option>
        </select>
        <button
          className="btn small danger"
          disabled={busy}
          onClick={() => {
            if (resetScope === 'game' && !window.confirm('Reset the whole game? Progress, log and ARCHIVE transcript are wiped. Config is kept.')) return;
            void run(() => api('/api/gm/reset', { json: { scope: resetScope } }), `Reset ${resetScope}`);
          }}
        >
          Reset
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
      {msg ? <div className="small amber" style={{ marginTop: 8 }}>{msg}</div> : null}
    </div>
  );
}

export function PlayerStatus({ state, config }: { state: GameState; config: GameConfig }) {
  const r = state.deduction.lastResult;
  return (
    <div className="panel">
      <h2>Player status</h2>
      <dl className="kv">
        <dt>Started</dt>
        <dd>{fmt(state.startedAt) || 'not yet'}</dd>
        <dt>Geo</dt>
        <dd>
          {state.geo.attempts} attempts{state.geo.lastDistanceM !== null ? `, last ${Math.round(state.geo.lastDistanceM)} m` : ''}
          {state.geo.solved ? ', confirmed' : ''}
        </dd>
        <dt>Gate</dt>
        <dd>
          {state.gate.attempts} attempts, code <b>{config.gate.code}</b>
        </dd>
        <dt>Word puzzle</dt>
        <dd>
          secret <b>{config.hack.secret}</b> · guesses {state.hack.guesses.join(', ') || 'none'} · resets {state.hack.rounds}
          {state.hack.lockedUntil && state.hack.lockedUntil > Date.now() ? ' · LOCKED' : ''}
        </dd>
        <dt>Evidence</dt>
        <dd>
          {Object.entries(state.evidence.unlocked)
            .map(([k, v]) => `${k}:${v ? 'open' : 'sealed'}`)
            .join(' ')}
        </dd>
        <dt>ARCHIVE</dt>
        <dd>
          {state.archive.messageCount} queries{state.archive.busy ? ', answering' : ''}
          {state.archive.locked ? ', SEALED' : ''}
        </dd>
        <dt>Deduction</dt>
        <dd>
          {state.deduction.attempts} submissions{state.deduction.passed ? ', VERIFIED' : ''}
        </dd>
      </dl>
      {state.deduction.lastAnswers ? (
        <div style={{ marginTop: 10 }}>
          <h3>Last submission {r ? `(${r.source}${r.pass ? ', pass' : ', fail'})` : ''}</h3>
          <dl className="kv">
            {Object.entries(state.deduction.lastAnswers).map(([k, v]) => {
              const g = r?.slots.find((s) => s.id === k);
              return (
                <div key={k} style={{ display: 'contents' }}>
                  <dt className={g ? (g.pass ? 'green' : 'red') : ''}>{k}</dt>
                  <dd>
                    {v || <span className="muted">(empty)</span>}
                    {g ? <div className="muted small">{g.reason}</div> : null}
                  </dd>
                </div>
              );
            })}
          </dl>
          {r?.note ? <div className="small amber">{r.note}</div> : null}
        </div>
      ) : null}
    </div>
  );
}

export function HintsPanel({ state, config }: { state: GameState; config: GameConfig }) {
  const [text, setText] = useState('');
  const [strength, setStrength] = useState<'nudge' | 'clear' | 'strong'>('nudge');
  const [rationale, setRationale] = useState<string | null>(null);
  const { busy, msg, run } = useAction();
  const quick = config.hints.quick[state.stage] ?? [];
  return (
    <div className="panel">
      <h2>Hints</h2>
      <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Incoming transmission text" />
      {rationale ? <div className="small muted">Copilot: {rationale}</div> : null}
      <div className="row" style={{ marginTop: 8 }}>
        <select value={strength} onChange={(e) => setStrength(e.target.value as 'nudge' | 'clear' | 'strong')} style={{ width: 'auto' }}>
          <option value="nudge">nudge</option>
          <option value="clear">clear</option>
          <option value="strong">strong</option>
        </select>
        <button
          className="btn small"
          disabled={busy}
          onClick={() =>
            run(async () => {
              const r = await api<{ hint: string; rationale: string; source: string }>('/api/gm/hint/draft', { json: { strength } });
              setText(r.hint);
              setRationale(`${r.rationale} [${r.source}]`);
            })
          }
        >
          Draft with AI
        </button>
        <button
          className="btn small primary"
          disabled={busy || !text.trim()}
          onClick={() =>
            run(async () => {
              await api('/api/gm/hint', { json: { text } });
              setText('');
              setRationale(null);
            }, 'Pushed to player')
          }
        >
          Push to player
        </button>
      </div>
      {quick.length ? (
        <div style={{ marginTop: 10 }}>
          <h3>Quick hints for {state.stage}</h3>
          {quick.map((q, i) => (
            <button key={i} className="btn small ghost" style={{ marginRight: 6, marginBottom: 6, textTransform: 'none', letterSpacing: 0 }} onClick={() => setText(q)}>
              {q.slice(0, 70)}
              {q.length > 70 ? '…' : ''}
            </button>
          ))}
        </div>
      ) : null}
      {state.hints.length ? (
        <div style={{ marginTop: 10 }}>
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

function payloadText(e: GameEvent): string {
  const p = { ...e.payload };
  return Object.entries(p)
    .map(([k, v]) => `${k}=${typeof v === 'string' ? v : JSON.stringify(v)}`)
    .join('  ');
}

export function LiveLog({ events }: { events: GameEvent[] }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [events.length]);
  return (
    <div className="panel">
      <h2>Live log ({events.length})</h2>
      <div className="log" ref={ref}>
        {events.map((e) => (
          <div key={e.id} className={`ev ${e.type === 'ai_error' ? 'err' : ''}`}>
            <span className="t">{fmt(e.ts)}</span>
            <span className="k">{e.type}</span>
            <span className="p">{payloadText(e)}</span>
          </div>
        ))}
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
      <div className="chat" ref={ref} style={{ maxHeight: 380 }}>
        {archive.length ? (
          archive.map((m) => (
            <div key={m.id} className={`msg ${m.role}`}>
              <span className="who">
                {m.role === 'user' ? 'Detective' : m.role === 'assistant' ? 'ARCHIVE' : 'LINK'} {fmt(m.ts)}
                {m.meta?.tools ? ` · tools: ${(m.meta.tools as string[]).join(', ')}` : ''}
                {typeof m.meta?.costUsd === 'number' ? ` · $${(m.meta.costUsd as number).toFixed(3)}` : ''}
              </span>
              {m.text}
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
        <button className="btn small" disabled={busy} onClick={() => run(() => api('/api/gm/report/generate', { method: 'POST' }), 'Report generated')}>
          {state.report.markdown ? 'Regenerate' : 'Generate'} with AI
        </button>
        <button className="btn small" disabled={busy || !state.report.markdown} onClick={() => run(() => api('/api/gm/report/publish', { json: { published: !state.report.published } }))}>
          {state.report.published ? 'Unpublish from player' : 'Publish to player'}
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
      {state.report.generatedAt ? <div className="tiny" style={{ marginTop: 8 }}>Generated {fmt(state.report.generatedAt)}{state.report.published ? ' · published' : ''}</div> : null}
      {open && state.report.markdown ? (
        <div className="frame" style={{ marginTop: 10 }}>
          <Markdown text={state.report.markdown} />
        </div>
      ) : null}
    </div>
  );
}
