import { useCallback, useEffect, useState } from 'react';
import { ApiError, api, errorText } from '../api';
import type { ArchiveMessage, HintPush, PlayerView } from '../types';
import { useSocket } from '../ws';
import { Frame } from './common';
import { Gate } from './Gate';
import { Geo } from './Geo';
import { Hack } from './Hack';
import { Intro } from './Intro';
import { Investigation } from './Investigation';
import { Reveal } from './Reveal';
import { Solved } from './Solved';

export interface StageProps {
  view: PlayerView;
  setView: (v: PlayerView) => void;
  refresh: () => Promise<void>;
}

const STAGE_LABEL: Record<PlayerView['stage'], string> = {
  intro: 'Recovery chain // link 1',
  geo: 'Recovery chain // field transmission',
  gate: 'Recovery chain // remote asset',
  hack: 'Recovery chain // mirror partition',
  reveal: 'Incident record',
  investigation: 'Investigation',
  solved: 'Case closed',
};

export function PlayerApp() {
  const [view, setView] = useState<PlayerView | null>(null);
  const [denied, setDenied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<HintPush | null>(null);
  const [showHints, setShowHints] = useState(false);
  const [archiveFeed, setArchiveFeed] = useState<ArchiveMessage[]>([]);
  const [archiveBusy, setArchiveBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const v = await api<PlayerView>('/api/player/state');
      setView(v);
      setDenied(false);
      setError(null);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) setDenied(true);
      else setError(errorText(e));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const connected = useSocket(
    'player',
    (m) => {
      if (m.type === 'state') setView(m.player);
      else if (m.type === 'hint') setToast(m.hint);
      else if (m.type === 'archive') setArchiveFeed((f) => (f.some((x) => x.id === m.message.id) ? f : [...f, m.message]));
      else if (m.type === 'archive_status') setArchiveBusy(m.busy);
    },
    !denied,
  );

  useEffect(() => {
    if (connected) void refresh();
  }, [connected, refresh]);

  if (denied) {
    return (
      <div className="shell">
        <Frame title="ACCESS DENIED" className="danger">
          <p>This terminal only answers to the recovery link. Scan the code again, or open the link exactly as it was given to you.</p>
        </Frame>
      </div>
    );
  }
  if (!view) {
    return (
      <div className="shell">
        <Frame title="SECTION 30">
          <p className="muted cursor">{error ?? 'Establishing link'}</p>
          {error ? (
            <button className="btn" onClick={() => void refresh()}>
              Retry
            </button>
          ) : null}
        </Frame>
      </div>
    );
  }

  const props: StageProps = { view, setView, refresh };
  let screen;
  switch (view.stage) {
    case 'intro':
      screen = <Intro {...props} />;
      break;
    case 'geo':
      screen = <Geo {...props} />;
      break;
    case 'gate':
      screen = <Gate {...props} />;
      break;
    case 'hack':
      screen = <Hack {...props} />;
      break;
    case 'reveal':
      screen = <Reveal {...props} />;
      break;
    case 'investigation':
      screen = <Investigation {...props} feed={archiveFeed} busy={archiveBusy} />;
      break;
    case 'solved':
      screen = <Solved {...props} feed={archiveFeed} busy={archiveBusy} />;
      break;
  }

  return (
    <div className="shell">
      <div className="topbar">
        <span>
          <span className={`dot ${connected ? 'on' : ''}`} />
          {STAGE_LABEL[view.stage]}
        </span>
        {view.hints.length ? (
          <button className="btn small ghost" onClick={() => setShowHints(true)}>
            Transmissions ({view.hints.length})
          </button>
        ) : null}
      </div>
      {screen}
      {toast ? (
        <div className="overlay" role="dialog">
          <div className="frame">
            <h1>Incoming transmission // magenta channel</h1>
            <pre className="typed">{toast.text}</pre>
            <button className="btn primary block" onClick={() => setToast(null)}>
              Acknowledge
            </button>
          </div>
        </div>
      ) : null}
      {showHints ? (
        <div className="overlay" role="dialog" onClick={() => setShowHints(false)}>
          <div className="frame" onClick={(e) => e.stopPropagation()}>
            <h1>Transmissions received</h1>
            <div className="stack">
              {[...view.hints].reverse().map((h) => (
                <div key={h.id}>
                  <div className="tiny">{new Date(h.ts).toLocaleTimeString()}</div>
                  <pre className="typed">{h.text}</pre>
                </div>
              ))}
            </div>
            <button className="btn block" onClick={() => setShowHints(false)}>
              Close
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
