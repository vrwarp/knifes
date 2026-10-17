import { useCallback, useEffect, useState } from 'react';
import { api, errorText } from '../api';
import { fmt } from './panels';

type Source = 'gm' | 'assistant' | 'restore' | 'upload' | 'system';
type VersionMeta = { version: number; ts: number; source: Source; note: string; changes: string[] };
type History = { current: number; total: number; versions: VersionMeta[] };
type Detail = VersionMeta & { diff: { path: string; now: string; then: string }[] };

const SOURCE_LABEL: Record<Source, string> = { gm: 'GM', assistant: 'Assistant', restore: 'Restore', upload: 'Upload', system: 'System' };

/** The append-only configuration log: every version ever saved, and a one-click way back. */
export function HistoryPanel({ currentVersion, dirty }: { currentVersion: number; dirty: boolean }) {
  const [history, setHistory] = useState<History | null>(null);
  const [open, setOpen] = useState<Detail | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      setHistory(await api<History>('/api/gm/config/history'));
    } catch (e) {
      setMsg({ ok: false, text: errorText(e) });
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load, currentVersion]);

  const show = async (v: number) => {
    if (open?.version === v) return setOpen(null);
    try {
      setOpen(await api<Detail>(`/api/gm/config/history/${v}`));
    } catch (e) {
      setMsg({ ok: false, text: errorText(e) });
    }
  };
  const restore = async (v: number) => {
    const warn = dirty ? ' Your unsaved edits in the editor will be replaced.' : '';
    if (!window.confirm(`Make version ${v} the live configuration? This adds a new version, so you can undo it the same way.${warn}`)) return;
    setBusy(true);
    try {
      const r = await api<{ config: { version: number } }>('/api/gm/config/restore', { json: { version: v } });
      setMsg({ ok: true, text: `Restored version ${v} as version ${r.config.version}.` });
      setOpen(null);
      await load();
    } catch (e) {
      setMsg({ ok: false, text: errorText(e) });
    } finally {
      setBusy(false);
    }
  };

  if (!history) return <p className="small muted">Loading history</p>;
  return (
    <div className="history">
      <p className="small muted">
        Every change is kept: {history.total} version{history.total === 1 ? '' : 's'} so far. Restoring an old version adds it again as the newest one.
      </p>
      {msg ? (
        <div className={`small ${msg.ok ? 'green' : 'red'}`} role={msg.ok ? 'status' : 'alert'}>
          {msg.text}
        </div>
      ) : null}
      <ol className="versions">
        {history.versions.map((v) => (
          <li key={v.version} className={v.version === history.current ? 'current' : ''}>
            <button type="button" className="vrow" onClick={() => void show(v.version)} aria-expanded={open?.version === v.version}>
              <span className="vnum">v{v.version}</span>
              <span className={`vsrc ${v.source}`}>{SOURCE_LABEL[v.source]}</span>
              <span className="vnote">
                {v.note}
                {v.changes.length ? <span className="muted"> · {v.changes.slice(0, 3).join(', ')}{v.changes.length > 3 ? ` +${v.changes.length - 3}` : ''}</span> : null}
              </span>
              <span className="vtime">{v.version === history.current ? 'live' : fmt(v.ts)}</span>
            </button>
            {open?.version === v.version ? (
              <div className="vdetail">
                {open.diff.length ? (
                  <>
                    <p className="small">Restoring v{v.version} would change:</p>
                    <table className="diff">
                      <tbody>
                        {open.diff.map((d) => (
                          <tr key={d.path}>
                            <th>{d.path}</th>
                            <td>
                              <span className="red">{d.now}</span> → <span className="green">{d.then}</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <button className="btn small" disabled={busy} onClick={() => void restore(v.version)}>
                      Restore v{v.version}
                    </button>
                  </>
                ) : (
                  <p className="small muted">This version matches the live configuration.</p>
                )}
              </div>
            ) : null}
          </li>
        ))}
      </ol>
    </div>
  );
}
