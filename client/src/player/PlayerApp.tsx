import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, api, errorText } from '../api';
import { fill, type ArchiveMessage, type HintPush, type PlayerView, type StageId } from '../types';
import { useSocket } from '../ws';
import { Frame, Typewriter, clock } from './common';
import { Gate } from './Gate';
import { Geo } from './Geo';
import { Hack } from './Hack';
import { Intro } from './Intro';
import { Investigation } from './Investigation';
import { Reveal } from './Reveal';

export interface StageProps {
  view: PlayerView;
  setView: (v: PlayerView) => void;
  refresh: () => Promise<void>;
  /** Keep showing `stage` for `ms` even if the server already moved on, so a win can be seen. */
  hold: (stage: StageId, ms: number) => void;
}

/** Shown before the first view arrives, when no configuration has reached the phone yet. */
const DEFAULT_APP_TEXT = {
  loadingTitle: 'Section 30',
  loading: 'Establishing link',
  accessDeniedTitle: 'Access denied',
  accessDeniedBody: 'This terminal only answers to the recovery link. Scan the code again, or open the link exactly as it was given to you.',
};

const SEEN_KEY = 's30.lastHintId';
function readSeen(): number {
  try {
    return Number(localStorage.getItem(SEEN_KEY)) || 0;
  } catch {
    return 0;
  }
}
function writeSeen(id: number): void {
  try {
    localStorage.setItem(SEEN_KEY, String(id));
  } catch {
    /* private mode */
  }
}

export function PlayerApp() {
  const [view, setView] = useState<PlayerView | null>(null);
  const [denied, setDenied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<HintPush | null>(null);
  const [showHints, setShowHints] = useState(false);
  const [archiveFeed, setArchiveFeed] = useState<ArchiveMessage[]>([]);
  const [archiveBusy, setArchiveBusy] = useState(false);
  const [pin, setPin] = useState<{ stage: StageId; until: number } | null>(null);
  const [everConnected, setEverConnected] = useState(false);
  const [offline, setOffline] = useState(false);
  const [seen, setSeen] = useState(readSeen);

  const shownStage = useRef<StageId>('intro');
  const archiveEpoch = useRef<number | null>(null);
  const lastRev = useRef(0);
  const ackRef = useRef<HTMLButtonElement | null>(null);

  const hold = useCallback((stage: StageId, ms: number) => {
    const until = Date.now() + ms;
    setPin({ stage, until });
    window.setTimeout(() => setPin((p) => (p && p.until === until ? null : p)), ms);
  }, []);

  /** Accept a new view; when it moves past a puzzle he just solved, keep the solved screen up for a beat. */
  const applyView = useCallback(
    (v: PlayerView) => {
      // An HTTP reply can land after a newer socket push; never step back to an older view.
      if (v.rev < lastRev.current) return;
      lastRev.current = v.rev;
      const cur = shownStage.current;
      if (cur === 'gate' && v.stage === 'hack') hold('gate', 1700);
      else if (cur === 'hack' && v.stage === 'reveal') hold('hack', v.hack.freePass ? 5000 : 2000);
      setView(v);
      setArchiveBusy(v.archive.busy);
      if (archiveEpoch.current !== v.archive.epoch) {
        if (archiveEpoch.current !== null) setArchiveFeed([]);
        archiveEpoch.current = v.archive.epoch;
      }
    },
    [hold],
  );

  const refresh = useCallback(async () => {
    try {
      const v = await api<PlayerView>('/api/player/state');
      applyView(v);
      setDenied(false);
      setError(null);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) setDenied(true);
      else setError(errorText(e));
    }
  }, [applyView]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const connected = useSocket(
    'player',
    (m) => {
      if (m.type === 'state') applyView(m.player);
      else if (m.type === 'hint') setToast(m.hint);
      else if (m.type === 'archive') setArchiveFeed((f) => (f.some((x) => x.id === m.message.id) ? f : [...f, m.message]));
      else if (m.type === 'archive_status') setArchiveBusy(m.busy);
    },
    !denied,
  );

  useEffect(() => {
    if (connected) {
      setEverConnected(true);
      void refresh();
    }
  }, [connected, refresh]);

  // Without the socket, nothing from the GMs would arrive: poll instead, and say so after five seconds.
  useEffect(() => {
    if (connected) {
      setOffline(false);
      return;
    }
    const banner = window.setTimeout(() => setOffline(true), 5000);
    const poll = window.setInterval(() => void refresh(), 10_000);
    return () => {
      window.clearTimeout(banner);
      window.clearInterval(poll);
    };
  }, [connected, refresh]);

  // A transmission takes over the screen: drop the keyboard and put focus on Acknowledge.
  useEffect(() => {
    if (!toast) return;
    const active = document.activeElement as HTMLElement | null;
    if (active && active !== ackRef.current) active.blur?.();
    ackRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') acknowledge();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toast]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [refresh]);

  // A transmission that arrived while he was on the phone pops up when he comes back.
  const hintCount = view?.hints.length ?? 0;
  useEffect(() => {
    if (!view || toast) return;
    const unseen = view.hints.filter((h) => h.id > seen);
    if (unseen.length) setToast(unseen[unseen.length - 1]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hintCount]);

  const markSeen = (id: number) => {
    const next = Math.max(seen, id);
    setSeen(next);
    writeSeen(next);
  };
  const acknowledge = () => {
    if (toast) markSeen(toast.id);
    setToast(null);
  };
  const openList = () => {
    if (view?.hints.length) markSeen(Math.max(...view.hints.map((h) => h.id)));
    setShowHints(true);
  };

  if (denied) {
    return (
      <div className="shell">
        <Frame title={DEFAULT_APP_TEXT.accessDeniedTitle} className="danger">
          <p>{DEFAULT_APP_TEXT.accessDeniedBody}</p>
        </Frame>
      </div>
    );
  }
  if (!view) {
    return (
      <div className="shell">
        <Frame title={DEFAULT_APP_TEXT.loadingTitle}>
          <p className="muted cursor">{error ?? DEFAULT_APP_TEXT.loading}</p>
          {error ? (
            <button className="btn" onClick={() => void refresh()}>
              Retry
            </button>
          ) : null}
        </Frame>
      </div>
    );
  }

  const props: StageProps = { view, setView: applyView, refresh, hold };
  const stage: StageId = pin && Date.now() < pin.until ? pin.stage : view.stage;
  shownStage.current = stage;
  const unread = view.hints.filter((h) => h.id > seen).length;
  const t = view.text.app;
  let screen;
  switch (stage) {
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
  }

  return (
    <div className="shell">
      {(everConnected && !connected) || offline ? <div className="link-down">{t.linkLost}</div> : null}
      <div className="topbar">
        <span>
          <span className={`dot ${connected ? 'on' : ''}`} aria-hidden="true" />
          {view.text.stageLabels[stage]}
        </span>
        {view.hints.length ? (
          <button className={`btn small ${unread ? 'unread' : 'ghost'}`} onClick={openList}>
            {fill(t.transmissions, { n: view.hints.length })}
          </button>
        ) : null}
      </div>
      {screen}
      {toast ? (
        <div className="overlay" role="dialog" aria-modal="true" aria-label={t.transmissionKicker}>
          <div className="frame accent">
            <div className="kicker">{t.transmissionKicker}</div>
            <h1>{t.transmissionTitle}</h1>
            <Typewriter text={toast.text} speed={3} />
            <button ref={ackRef} className="btn primary block" onClick={acknowledge} autoFocus>
              {t.acknowledge}
            </button>
          </div>
        </div>
      ) : null}
      {showHints ? (
        <div className="overlay" role="dialog" aria-modal="true" aria-label={t.transmissionsReceived} onClick={() => setShowHints(false)}>
          <div className="frame" onClick={(e) => e.stopPropagation()}>
            <h1>{t.transmissionsReceived}</h1>
            <div className="stack">
              {[...view.hints].reverse().map((h) => (
                <div key={h.id}>
                  <div className="tiny">{clock(h.ts)}</div>
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
