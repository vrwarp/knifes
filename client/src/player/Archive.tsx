import { useEffect, useRef, useState } from 'react';
import { api, errorText } from '../api';
import type { ArchiveMessage, PlayerView } from '../types';

export function Archive({ view, feed, busy }: { view: PlayerView; feed: ArchiveMessage[]; busy: boolean }) {
  const [messages, setMessages] = useState<ArchiveMessage[]>([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api<{ messages: ArchiveMessage[] }>('/api/player/archive')
      .then((r) => setMessages(r.messages))
      .catch((e) => setErr(errorText(e)));
  }, []);
  useEffect(() => {
    setMessages((m) => {
      const ids = new Set(m.map((x) => x.id));
      const add = feed.filter((f) => !ids.has(f.id));
      return add.length ? [...m, ...add].sort((a, b) => a.id - b.id) : m;
    });
  }, [feed]);
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'end' });
  }, [messages.length, busy]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    setSending(true);
    setErr(null);
    try {
      const r = await api<{ message: ArchiveMessage }>('/api/player/archive', { json: { text: t } });
      setMessages((m) => (m.some((x) => x.id === r.message.id) ? m : [...m, r.message]));
      setText('');
    } catch (e2) {
      setErr(errorText(e2));
    } finally {
      setSending(false);
    }
  };

  const disabled = !view.archive.enabled || view.archive.locked || busy || sending;
  return (
    <div className="frame" style={{ padding: 12 }}>
      <p className="tiny">ARCHIVE // records mainframe // integrity 41%</p>
      <div className="chat">
        <div className="msg assistant">
          <span className="who">ARCHIVE</span>
          {view.archive.welcome}
        </div>
        {messages.map((m) => (
          <div key={m.id} className={`msg ${m.role}`}>
            <span className="who">{m.role === 'user' ? 'Detective' : m.role === 'assistant' ? 'ARCHIVE' : 'LINK'}</span>
            {m.text}
          </div>
        ))}
        {busy ? <div className="msg system cursor">ARCHIVE PROCESSING</div> : null}
        <div ref={bottom} />
      </div>
      {view.archive.locked ? <div className="error">ARCHIVE SEALED BY COMMAND AUTHORITY</div> : null}
      {!view.archive.enabled ? <div className="error">ARCHIVE OFFLINE</div> : null}
      <form onSubmit={send} className="row" style={{ marginTop: 10 }}>
        <input
          value={text}
          onChange={(e) => setText(e.target.value.slice(0, view.archive.maxMessageChars))}
          placeholder="Query the ARCHIVE"
          disabled={!view.archive.enabled || view.archive.locked}
          aria-label="Query"
          style={{ flex: 1 }}
        />
        <button className="btn primary" disabled={disabled || !text.trim()}>
          Send
        </button>
      </form>
      {err ? <div className="error">{err}</div> : null}
    </div>
  );
}
