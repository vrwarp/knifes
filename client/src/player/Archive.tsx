import { useEffect, useRef, useState } from 'react';
import { api, errorText } from '../api';
import type { ArchiveMessage, PlayerView } from '../types';
import { Typewriter } from './common';

export function Archive({ view, feed, busy, active = true }: { view: PlayerView; feed: ArchiveMessage[]; busy: boolean; active?: boolean }) {
  const [messages, setMessages] = useState<ArchiveMessage[]>([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [typingId, setTypingId] = useState<number | null>(null);
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

  // Integrity climbs as he opens files and asks questions, and reads 100 once the case is closed.
  const unlockedCount = Object.values(view.evidence.unlocked).filter(Boolean).length;
  const asked = messages.filter((m) => m.role === 'user').length;
  const integrity = view.stage === 'solved' ? 100 : Math.min(89, 41 + unlockedCount * 8 + Math.min(asked, 6) * 4);
  const disabled = !view.archive.enabled || view.archive.locked || busy || sending;
  return (
    <div className="frame" style={{ padding: 12 }}>
      <p className="tiny">ARCHIVE · integrity {integrity}%</p>
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
          <span className="who">ARCHIVE</span>
          {view.archive.welcome}
        </div>
        {messages.map((m) => (
          <div key={m.id} className={`msg ${m.role}`}>
            <span className="who">{m.role === 'user' ? 'Detective' : m.role === 'assistant' ? 'ARCHIVE' : 'LINK'}</span>
            {m.role === 'assistant' && m.id === typingId ? (
              <Typewriter text={m.text} speed={4} onProgress={scrollDown} onDone={scrollDown} />
            ) : (
              <span className="text">{m.text}</span>
            )}
          </div>
        ))}
        {busy || sending ? <div className="msg system cursor">ARCHIVE PROCESSING</div> : null}
        <div ref={bottom} />
      </div>
      {view.archive.locked ? <div className="error">ARCHIVE SEALED BY COMMAND AUTHORITY</div> : null}
      {!view.archive.enabled ? <div className="error">ARCHIVE OFFLINE</div> : null}
      <div className="chat-input">
        <form onSubmit={send} className="row">
          <input
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, view.archive.maxMessageChars))}
            placeholder="Query the ARCHIVE"
            disabled={!view.archive.enabled || view.archive.locked}
            aria-label="Query"
            autoComplete="off"
            style={{ flex: 1 }}
          />
          <button className="btn primary" disabled={disabled || !text.trim()}>
            Send
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
