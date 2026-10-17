import { useCallback, useEffect, useRef, useState } from 'react';
import { api, errorText } from '../api';
import { Markdown } from '../md';
import type { AssistantMessage, AssistantView, WsMessage } from '../types';
import { fmt } from './panels';

const STARTERS = [
  'What is still missing before the party?',
  'Look at the field photos. Is the location puzzle too easy?',
  'Give me three red herrings that fit the case files.',
  'Draft the drop-point card Jimmy finds at the deli.',
];

/** Opus helping the GMs get the game ready. It proposes edits; a GM applies them, and each becomes a new config version. */
export function AssistantPanel({ bus }: { bus: EventTarget }) {
  const [view, setView] = useState<AssistantView | null>(null);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [showReady, setShowReady] = useState(true);
  const bottom = useRef<HTMLDivElement>(null);
  const configVersion = useRef<number | null>(null);

  const load = useCallback(async () => {
    try {
      setView(await api<AssistantView>('/api/gm/assistant'));
      setErr(null);
    } catch (e) {
      setErr(errorText(e));
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  // Live updates from the GM socket, so every GM sees the same conversation.
  useEffect(() => {
    const on = (ev: Event) => {
      const m = (ev as CustomEvent<WsMessage>).detail;
      if (m.type === 'assistant') {
        setView((v) => (v && !v.messages.some((x) => x.id === m.message.id) ? { ...v, messages: [...v.messages, m.message] } : v));
        if (m.message.role !== 'user') void load();
      } else if (m.type === 'assistant_status') setView((v) => (v ? { ...v, busy: m.busy } : v));
      else if (m.type === 'assistant_proposal') void load();
      else if (m.type === 'gm' && m.config.version !== configVersion.current) {
        // Readiness and proposal previews depend on the configuration only.
        configVersion.current = m.config.version;
        void load();
      }
    };
    bus.addEventListener('m', on);
    return () => bus.removeEventListener('m', on);
  }, [bus, load]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'nearest' });
  }, [view?.messages.length, view?.busy]);

  const send = async (t: string) => {
    const clean = t.trim();
    if (!clean) return;
    setSending(true);
    setErr(null);
    setText('');
    try {
      await api<{ message: AssistantMessage }>('/api/gm/assistant', { json: { text: clean }, timeoutMs: 300_000 });
      await load();
    } catch (e) {
      setText(clean);
      setErr(errorText(e));
    } finally {
      setSending(false);
    }
  };
  const decide = async (id: number, action: 'apply' | 'dismiss') => {
    setErr(null);
    try {
      await api(`/api/gm/assistant/proposals/${id}/${action}`, { method: 'POST' });
      await load();
    } catch (e) {
      setErr(errorText(e));
    }
  };
  const reset = async () => {
    if (!window.confirm('Start a new conversation? The chat clears. Proposals and the configuration history are kept.')) return;
    try {
      await api('/api/gm/assistant/reset', { method: 'POST' });
      await load();
    } catch (e) {
      setErr(errorText(e));
    }
  };

  if (!view) return <div className="panel assistant">{err ? <div className="error">{err}</div> : <p className="muted small">Loading assistant</p>}</div>;
  const busy = view.busy || sending;
  const blockers = view.readiness.filter((r) => r.level === 'blocker').length;
  const pending = view.proposals.filter((p) => p.status === 'pending');
  const decided = view.proposals.filter((p) => p.status !== 'pending').slice(0, 5);

  return (
    <div className="panel assistant">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h2>Setup assistant {view.live ? <span className="green">· Opus</span> : <span className="amber">· mock</span>}</h2>
        {view.messages.length ? (
          <button className="btn small ghost" onClick={() => void reset()} disabled={busy}>
            New conversation
          </button>
        ) : null}
      </div>

      <details className="readiness" open={showReady} onToggle={(e) => setShowReady((e.target as HTMLDetailsElement).open)}>
        <summary>
          Readiness: {blockers ? <b className="red">{blockers} blocking</b> : <b className="green">nothing blocking</b>}
          {view.readiness.length - blockers ? ` · ${view.readiness.length - blockers} to review` : ''}
        </summary>
        <ul>
          {view.readiness.map((r, i) => (
            <li key={i} className={r.level}>
              <span className="lvl">{r.level}</span> <b>{r.area}:</b> {r.text}
            </li>
          ))}
        </ul>
      </details>

      {pending.length ? (
        <div className="proposals">
          {pending.map((p) => (
            <div className="proposal" key={p.id}>
              <div className="small">
                <b>Proposal #{p.id}</b> · {p.summary}
              </div>
              <table className="diff">
                <tbody>
                  {p.preview.map((c) => (
                    <tr key={c.path}>
                      <th>{c.path}</th>
                      <td>
                        <span className="red">{c.now}</span> → <span className="green">{c.next}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="row">
                <button className="btn small primary" onClick={() => void decide(p.id, 'apply')}>
                  Apply
                </button>
                <button className="btn small ghost" onClick={() => void decide(p.id, 'dismiss')}>
                  Dismiss
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      <div className="chat assistant-chat" aria-live="polite">
        {view.messages.length === 0 ? (
          <div className="starters">
            <p className="small muted">Ask about anything the game still needs. Edits come back as proposals for a GM to apply.</p>
            {STARTERS.map((s) => (
              <button key={s} className="btn small ghost" onClick={() => void send(s)} disabled={busy}>
                {s}
              </button>
            ))}
          </div>
        ) : null}
        {view.messages.map((m) => (
          <div key={m.id} className={`msg ${m.role === 'user' ? 'user' : m.role === 'system' ? 'system' : 'assistant'}`}>
            <div className="meta">
              {m.role === 'user' ? 'GM' : m.role === 'system' ? 'System' : 'Assistant'} {fmt(m.ts)}
            </div>
            {m.role === 'assistant' ? <Markdown text={m.text} /> : <div className="text">{m.text}</div>}
          </div>
        ))}
        {busy ? <div className="msg system cursor" role="status">Thinking</div> : null}
        <div ref={bottom} />
      </div>

      <form
        className="row chat-input"
        onSubmit={(e) => {
          e.preventDefault();
          void send(text);
        }}
      >
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              void send(text);
            }
          }}
          placeholder="Ask for ideas, missing pieces, or an edit"
          aria-label="Message the setup assistant"
          rows={2}
          style={{ flex: 1, minWidth: 0 }}
        />
        <button className="btn primary" disabled={busy || !text.trim()}>
          Send
        </button>
      </form>
      {err ? (
        <div className="error" role="alert">
          {err}
        </div>
      ) : null}
      {decided.length ? (
        <p className="tiny" style={{ marginTop: 8 }}>
          Recent: {decided.map((p) => `#${p.id} ${p.status}${p.appliedVersion ? ` as v${p.appliedVersion}` : ''}`).join(' · ')}
        </p>
      ) : null}
    </div>
  );
}
