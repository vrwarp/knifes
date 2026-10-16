import { useCallback, useEffect, useState } from 'react';
import { api, errorText } from '../api';
import { Markdown } from '../md';
import type { ArchiveMessage, GameConfig, GameEvent, GameState, Overview } from '../types';
import { useSocket } from '../ws';
import { ConfigEditor } from './ConfigEditor';
import { ArchivePanel, HintsPanel, LiveLog, PlayerStatus, ProgressPanel, ReportPanel, STAGE_NAME, elapsed, fmt, plural, useNow } from './panels';

const CRED_LABEL: Record<Overview['ai']['credential'], string> = {
  auth_token: 'bearer token',
  api_key: 'API key',
  oauth_token: 'subscription token',
  login: 'subscription login',
  none: 'no credential',
};

const PLAYER_TYPES = new Set(['game_start', 'stage', 'geo_guess', 'gate_attempt', 'hack_guess', 'hack_lockout', 'hack_solved', 'evidence_unlock', 'archive_user', 'deduction_submit']);
const PUZZLE_STAGES = new Set(['geo', 'gate', 'hack', 'investigation']);

/** The across-the-room strip: where he is, how long since he last did anything, what is happening. */
function NowStrip({ state, config, events, players }: { state: GameState; config: GameConfig; events: GameEvent[]; players: number | null }) {
  const now = useNow(1000);
  const since = state.stageTimes[state.stage] ?? state.startedAt;
  const inStage = since ? now - since : null;
  const lastPlayer = [...events].reverse().find((e) => PLAYER_TYPES.has(e.type))?.ts ?? null;
  const idleSince = Math.max(lastPlayer ?? 0, since ?? 0) || null;
  const idle = idleSince ? now - idleSince : null;
  const stuck = PUZZLE_STAGES.has(state.stage) && idle !== null && idle >= 5 * 60_000;
  const stuck2 = stuck && idle !== null && idle >= 10 * 60_000;
  const aiError = [...events].reverse().find((e) => e.type === 'ai_error' && now - e.ts < 3 * 60_000);
  const facts: string[] = [];
  switch (state.stage) {
    case 'intro':
      facts.push(state.startedAt ? 'waiting on the intro screen' : 'has not opened the link yet');
      break;
    case 'geo':
      facts.push(`${plural(state.geo.attempts, 'pin')}${state.geo.lastDistanceM !== null ? `, last ${Math.round(state.geo.lastDistanceM)} m off` : ''}${state.geo.solved ? ', CONFIRMED' : ''}`);
      break;
    case 'gate':
      facts.push(`${plural(state.gate.attempts, 'code attempt')} · code ${config.gate.code}`);
      break;
    case 'hack':
      facts.push(`${state.hack.guesses.length}/${config.hack.maxAttempts} guesses · ${plural(state.hack.rounds, 'reset')}${state.hack.lockedUntil && state.hack.lockedUntil > now ? ' · LOCKED' : ''} · secret ${config.hack.secret}`);
      break;
    case 'reveal':
      facts.push('reading the incident record');
      break;
    case 'investigation': {
      const open = Object.values(state.evidence.unlocked).filter(Boolean).length;
      facts.push(`evidence ${open}/4 open · ARCHIVE ${plural(state.archive.messageCount, 'query').replace('querys', 'queries')}${state.archive.busy ? ' (answering)' : ''}${state.archive.locked ? ' SEALED' : ''} · ${plural(state.deduction.attempts, 'deduction')}`);
      break;
    }
    case 'solved':
      facts.push(`verified on attempt ${state.deduction.attempts}${state.report.published ? ' · case file live' : ''}`);
      break;
  }
  const geoWarn = config.geo.mode === 'puzzle' && !config.geo.target && (state.stage === 'intro' || state.stage === 'geo');
  return (
    <div className={`now ${stuck2 ? 'stuck2' : stuck ? 'stuck' : ''}`} aria-live="polite">
      <span className="stage">{STAGE_NAME[state.stage]}</span>
      {stuck && idle !== null ? (
        <span className="elapsed" title="idle since his last action">idle {elapsed(idle)}</span>
      ) : inStage !== null ? (
        <span className="elapsed" title="time in this stage">{elapsed(inStage)}</span>
      ) : null}
      {!stuck && idle !== null && idle >= 60_000 && state.stage !== 'solved' ? <span className="fact">idle <b>{elapsed(idle)}</b></span> : null}
      {facts.map((f, i) => (
        <span key={i} className="fact">
          {f}
        </span>
      ))}
      {players !== null ? <span className={`fact ${players ? '' : 'red'}`}>{players ? `phone linked${players > 1 ? ` (${players})` : ''}` : 'NO PHONE LINKED'}</span> : null}
      {stuck ? (
        <span className="fact">
          <b>{stuck2 ? 'stuck, consider a strong hint or a skip' : 'quiet for a while, a nudge may help'}</b>
        </span>
      ) : null}
      {aiError ? <span className="warn red">AI error {fmt(aiError.ts)} · {String(aiError.payload.where ?? '')}: {String(aiError.payload.error ?? '').slice(0, 120)}</span> : null}
      {geoWarn ? <span className="warn">Location puzzle has no target set: any pin will pass. Set it in Game configuration → Location puzzle.</span> : null}
    </div>
  );
}

export function GmApp() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [pw, setPw] = useState('');
  const [loginErr, setLoginErr] = useState<string | null>(null);
  const [data, setData] = useState<Overview | null>(null);
  const [events, setEvents] = useState<GameEvent[]>([]);
  const [archive, setArchive] = useState<ArchiveMessage[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [everConnected, setEverConnected] = useState(false);
  const [players, setPlayers] = useState<number | null>(null);

  useEffect(() => {
    api('/api/gm/me')
      .then(() => setAuthed(true))
      .catch(() => setAuthed(false));
  }, []);

  const load = useCallback(async () => {
    try {
      const o = await api<Overview>('/api/gm/overview');
      setData(o);
      setEvents(o.events);
      setArchive(o.archive);
      setErr(null);
    } catch (e) {
      setErr(errorText(e));
    }
  }, []);

  useEffect(() => {
    if (authed) void load();
  }, [authed, load]);

  const connected = useSocket(
    'gm',
    (m) => {
      if (m.type === 'gm') {
        setData((d) => (d ? { ...d, state: m.state, config: m.config } : d));
        if (typeof m.players === 'number') setPlayers(m.players);
      }
      else if (m.type === 'event') setEvents((ev) => (ev.some((x) => x.id === m.event.id) ? ev : [...ev.slice(-599), m.event]));
      else if (m.type === 'archive') setArchive((a) => (a.some((x) => x.id === m.message.id) ? a : [...a, m.message]));
    },
    authed === true,
  );
  useEffect(() => {
    if (connected && authed) {
      setEverConnected(true);
      void load();
    }
  }, [connected, authed, load]);

  const login = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginErr(null);
    try {
      await api('/api/gm/login', { json: { password: pw } });
      setAuthed(true);
      setPw('');
    } catch (e2) {
      setLoginErr(errorText(e2));
    }
  };
  const logout = async () => {
    await api('/api/gm/logout', { method: 'POST' });
    setAuthed(false);
    setData(null);
  };

  if (authed === null) return <div className="shell muted">Checking credentials</div>;
  if (!authed) {
    return (
      <div className="shell">
        <form className="frame accent" onSubmit={login}>
          <h1>Section 30 // game master console</h1>
          <label className="field">
            <span>Password</span>
            <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoFocus />
          </label>
          <button className="btn primary block">Enter</button>
          {loginErr ? <div className="error">{loginErr}</div> : null}
        </form>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="shell">
        <p className="muted cursor">{err ?? 'Loading console'}</p>
      </div>
    );
  }

  const { state, config } = data;
  const running = state.startedAt !== null && state.stage !== 'solved';
  return (
    <div className="shell wide">
      <div className="no-print">
        {everConnected && !connected ? <div className="link-down">Link down · reconnecting · the player keeps playing, you are not seeing it</div> : null}
        <div className="topbar">
          <span>
            <span className={`dot ${connected ? 'on' : ''}`} aria-hidden="true" />
            GM console<span className="hide-narrow"> · {config.title}</span>
          </span>
          <span className="row">
            <span className={data.ai.mode !== 'live' ? 'amber' : data.ai.auth === 'ok' ? 'green' : 'red'} title={data.ai.credentialLabel}>
              AI{' '}
              {data.ai.mode === 'live'
                ? `live · ${data.ai.model} · ${CRED_LABEL[data.ai.credential]}${data.ai.auth === 'ok' ? '' : data.ai.auth === 'needs_login' ? ' · NO LOGIN FOUND' : ' · unverified'}`
                : 'mock'}
            </span>
            <a href="/" target="_blank" rel="noreferrer">
              player view
            </a>
            <button className="btn small ghost" onClick={logout}>
              Log out
            </button>
          </span>
        </div>
        {err ? <div className="error">{err}</div> : null}
        <NowStrip state={state} config={config} events={events} players={players} />
        <div className="cols">
          <div className="col">
            <ProgressPanel state={state} config={config} stages={data.stages} />
            <LiveLog events={events} />
          </div>
          <div className="col">
            <HintsPanel state={state} config={config} />
            <ArchivePanel archive={archive} state={state} />
          </div>
          <div className="col">
            <PlayerStatus state={state} config={config} events={events} />
            <ReportPanel state={state} />
          </div>
        </div>
        {running ? (
          <details className="section" style={{ marginTop: 16 }}>
            <summary>Game configuration (collapsed while a game is running)</summary>
            <ConfigEditor config={config} onSaved={load} />
          </details>
        ) : (
          <ConfigEditor config={config} onSaved={load} />
        )}
      </div>
      <div className="print-only">{state.report.markdown ? <Markdown text={state.report.markdown} /> : null}</div>
    </div>
  );
}
