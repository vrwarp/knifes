import { useCallback, useEffect, useState } from 'react';
import { api, errorText } from '../api';
import type { ArchiveMessage, GameEvent, Overview } from '../types';
import { useSocket } from '../ws';
import { ConfigEditor } from './ConfigEditor';
import { ArchivePanel, HintsPanel, LiveLog, PlayerStatus, ProgressPanel, ReportPanel } from './panels';

const CRED_LABEL: Record<Overview['ai']['credential'], string> = {
  auth_token: 'bearer token',
  api_key: 'API key',
  oauth_token: 'subscription token',
  login: 'subscription login',
  none: 'no credential',
};

export function GmApp() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [pw, setPw] = useState('');
  const [loginErr, setLoginErr] = useState<string | null>(null);
  const [data, setData] = useState<Overview | null>(null);
  const [events, setEvents] = useState<GameEvent[]>([]);
  const [archive, setArchive] = useState<ArchiveMessage[]>([]);
  const [err, setErr] = useState<string | null>(null);

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
      if (m.type === 'gm') setData((d) => (d ? { ...d, state: m.state, config: m.config } : d));
      else if (m.type === 'event') setEvents((ev) => (ev.some((x) => x.id === m.event.id) ? ev : [...ev.slice(-599), m.event]));
      else if (m.type === 'archive') setArchive((a) => (a.some((x) => x.id === m.message.id) ? a : [...a, m.message]));
    },
    authed === true,
  );
  useEffect(() => {
    if (connected && authed) void load();
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
  return (
    <div className="shell wide">
      <div className="topbar">
        <span>
          <span className={`dot ${connected ? 'on' : ''}`} />
          GM console · {config.title}
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
      <div className="panels">
        <ProgressPanel state={state} config={config} stages={data.stages} />
        <PlayerStatus state={state} config={config} />
        <HintsPanel state={state} config={config} />
        <LiveLog events={events} />
        <ArchivePanel archive={archive} state={state} />
        <ReportPanel state={state} />
      </div>
      <ConfigEditor config={config} onSaved={load} />
    </div>
  );
}
