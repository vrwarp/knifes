import { useEffect, useRef, useState } from 'react';
import { api, errorText } from '../api';
import { fill, type ArchiveMessage, type PlayerView } from '../types';
import { Typewriter } from './common';

type Flight = { asked: string; after: number; stop: AbortController };

/** Whether the transcript holds this question, newer than anything on screen when it was sent, and a reply after it. */
function answered(list: ArchiveMessage[], fly: Flight): boolean {
  const q = list.filter((m) => m.role === 'user' && m.id > fly.after && m.text === fly.asked).at(-1);
  return !!q && list.some((m) => m.id > q.id && m.role !== 'user');
}

export function Archive({ view, feed, busy, active = true, resync = 0 }: { view: PlayerView; feed: ArchiveMessage[]; busy: boolean; active?: boolean; resync?: number }) {
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
  /** The question on its way: its text as the server keeps it, the newest line on screen when it was sent, and a way to stop waiting. */
  const inflight = useRef<Flight | null>(null);

  const [loadErr, setLoadErr] = useState<string | null>(null);
  /**
   * Folds in the transcript the server holds. Merged, never replaced: a line that came over the live link while
   * this was on its way is newer than this copy. Resolves to the lines, or null when the server could not be reached;
   * `quiet` checks leave saying so to whatever already does (the failed question, the link-lost banner).
   */
  const load = (quiet = false) =>
    api<{ messages: ArchiveMessage[] }>('/api/player/archive')
      .then((r) => {
        const seen = (loadedIds.current ??= new Set());
        for (const m of r.messages) seen.add(m.id);
        const fly = inflight.current;
        // The reply to the question in flight is already here (it came another way); stop waiting for its own.
        if (fly && answered(r.messages, fly)) fly.stop.abort();
        setMessages((m) => {
          const ids = new Set(m.map((x) => x.id));
          const add = r.messages.filter((x) => !ids.has(x.id));
          if (!add.length) return m;
          if (add.some((a) => a.role !== 'user')) setErr(null);
          return [...m, ...add].sort((a, b) => a.id - b.id);
        });
        setLoadErr(null);
        return r.messages;
      })
      .catch((e) => {
        if (!quiet) setLoadErr(errorText(e));
        return null;
      });
  useEffect(() => {
    void load();
  }, []);
  // The live link came back, or the screen woke: lines pushed while it was gone never arrive on their own.
  const firstResync = useRef(resync);
  useEffect(() => {
    if (resync !== firstResync.current) void load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resync]);
  const absorb = (incoming: ArchiveMessage[]) => {
    setMessages((m) => {
      const ids = new Set(m.map((x) => x.id));
      const add = incoming.filter((f) => !ids.has(f.id));
      if (!add.length) return m;
      const fresh = add.filter((a) => a.role === 'assistant' && !(loadedIds.current?.has(a.id) ?? false));
      if (fresh.length) setTypingId(fresh[fresh.length - 1].id);
      // An answer that arrives over the live link after the request itself gave up clears that error.
      if (add.some((a) => a.role !== 'user')) setErr(null);
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
    const fly: Flight = { asked: t.replace(/\s+/g, ' '), after: messages.reduce((n, m) => Math.max(n, m.id), 0), stop: new AbortController() };
    // Empty the box only if it still holds this question: he may be typing the next one while the answer comes in.
    const sent = () => setText((cur) => (cur.trim() === t ? '' : cur));
    inflight.current = fly;
    setSending(true);
    setErr(null);
    try {
      const r = await api<{ message: ArchiveMessage; question?: ArchiveMessage }>('/api/player/archive', { json: { text: t }, timeoutMs: 150_000, signal: fly.stop.signal });
      // The question as well: with the live link down, it would otherwise never appear above the answer.
      absorb(r.question ? [r.question, r.message] : [r.message]);
      sent();
    } catch (e2) {
      // The reply may be lost on the way back while the question was answered all the same: look before saying it failed.
      const held = await load(true);
      if (held && answered(held, fly)) sent();
      else setErr(errorText(e2));
    } finally {
      if (inflight.current === fly) inflight.current = null;
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
