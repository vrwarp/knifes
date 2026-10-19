import { useEffect, useRef, useState } from 'react';
import { api, errorText } from '../api';
import { fill, type ArchiveMessage, type PlayerView } from '../types';
import { Typewriter } from './common';

export function Archive({ view, feed, busy, active = true }: { view: PlayerView; feed: ArchiveMessage[]; busy: boolean; active?: boolean }) {
  const t = view.text.archive;
  const PROCESSING_LINES = t.processingLines;
  const [messages, setMessages] = useState<ArchiveMessage[]>([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [typingId, setTypingId] = useState<number | null>(null);
  const working = busy || sending;
  const [phase, setPhase] = useState(0);
  useEffect(() => {
    if (!working) {
      setPhase(0);
      return;
    }
    const t = window.setInterval(() => setPhase((p) => (p + 1) % PROCESSING_LINES.length), 2500);
    return () => window.clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [working, PROCESSING_LINES.length]);
  const loadedIds = useRef<Set<number> | null>(null);
  const bottom = useRef<HTMLDivElement>(null);

  const [loadErr, setLoadErr] = useState<string | null>(null);
  const load = () =>
    api<{ messages: ArchiveMessage[] }>('/api/player/archive')
      .then((r) => {
        setMessages(r.messages);
        loadedIds.current = new Set(r.messages.map((m) => m.id));
        setLoadErr(null);
      })
      .catch((e) => setLoadErr(errorText(e)));
  useEffect(() => {
    void load();
  }, []);
  const absorb = (incoming: ArchiveMessage[]) => {
    setMessages((m) => {
      const ids = new Set(m.map((x) => x.id));
      const add = incoming.filter((f) => !ids.has(f.id));
      if (!add.length) return m;
      const fresh = add.filter((a) => a.role === 'assistant' && !(loadedIds.current?.has(a.id) ?? false));
      if (fresh.length) setTypingId(fresh[fresh.length - 1].id);
      return [...m, ...add].sort((a, b) => a.id - b.id);
    });
  };
  useEffect(() => {
    absorb(feed);
  }, [feed]);
  const scrollDown = () => {
    if (active) bottom.current?.scrollIntoView({ block: 'end' });
  };
  useEffect(scrollDown, [messages.length, busy, active]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    setSending(true);
    setErr(null);
    try {
      const r = await api<{ message: ArchiveMessage }>('/api/player/archive', { json: { text: t }, timeoutMs: 150_000 });
      absorb([r.message]);
      setText('');
    } catch (e2) {
      setErr(errorText(e2));
    } finally {
      setSending(false);
    }
  };

  // Integrity climbs as Ledger layers open and he asks questions, and reads 100 once the case is closed.
  const layers = (view.ledger.layer1 ? 1 : 0) + (view.ledger.layer2 ? 1 : 0);
  const asked = messages.filter((m) => m.role === 'user').length;
  const integrity = Math.min(89, 41 + layers * 12 + Math.min(asked, 6) * 4);
  const disabled = !view.archive.enabled || view.archive.locked || busy || sending;
  return (
    <div className="frame" style={{ padding: 12 }}>
      <p className="tiny">{fill(t.integrity, { n: integrity })}</p>
      {loadErr ? (
        <div className="error" role="alert">
          {loadErr}{' '}
          <button className="btn small" onClick={() => void load()}>
            Retry
          </button>
        </div>
      ) : null}
      <div className="chat" role="log" aria-live="polite">
        <div className="msg assistant">
          <span className="who">{t.speakerArchive}</span>
          {view.archive.welcome}
        </div>
        {messages.map((m) => (
          <div key={m.id} className={`msg ${m.role}`}>
            <span className="who">{m.role === 'user' ? t.speakerPlayer : m.role === 'assistant' ? t.speakerArchive : t.speakerLink}</span>
            {m.role === 'assistant' && m.id === typingId ? (
              <Typewriter text={m.text} speed={4} onProgress={scrollDown} onDone={scrollDown} />
            ) : (
              <span className="text">{m.text}</span>
            )}
          </div>
        ))}
        {working ? <div className="msg system cursor" role="status">{PROCESSING_LINES[phase % PROCESSING_LINES.length]}</div> : null}
        <div ref={bottom} />
      </div>
      {view.archive.locked ? <div className="error">{t.sealed}</div> : null}
      {!view.archive.enabled ? <div className="error">{t.offline}</div> : null}
      <div className="chat-input">
        <form onSubmit={send} className="row">
          <input
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, view.archive.maxMessageChars))}
            placeholder={t.placeholder}
            disabled={!view.archive.enabled || view.archive.locked}
            aria-label="Query"
            autoComplete="off"
            style={{ flex: 1 }}
          />
          <button className="btn primary" disabled={disabled || !text.trim()}>
            {t.send}
          </button>
        </form>
      </div>
      {err ? (
        <div className="error" role="alert">
          {err}
        </div>
      ) : null}
    </div>
  );
}
