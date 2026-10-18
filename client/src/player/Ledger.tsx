import { useEffect, useState, type ReactNode } from 'react';
import { api, errorText } from '../api';
import type { LedgerEntry, LedgerFiles, PlayerView } from '../types';

function Agent({ e, layer, defaultOpen = false }: { e: LedgerEntry; layer: 1 | 2; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={`agent ${layer === 2 ? 'l2' : ''} ${open ? 'open' : ''}`}>
      <header onClick={() => setOpen((o) => !o)} role="button" aria-expanded={open} tabIndex={0} onKeyDown={(k) => k.key === 'Enter' && setOpen((o) => !o)}>
        <span>
          <span className="tiny">{e.id} · </span>
          <span className="name">{e.name}</span>
        </span>
        <span className="pos">{e.position}</span>
      </header>
      {open ? (
        <div className="body">
          {layer === 1 ? (
            <>
              <h4>Personnel profile</h4>
              <p className="notes">{e.notes}</p>
              <h4>Activity log (self-reported)</h4>
            </>
          ) : (
            <h4>Verified activity</h4>
          )}
          <table className="log">
            <tbody>
              {e.log.map((l, i) => (
                <tr key={i}>
                  <td>{l.time}</td>
                  <td>{l.text}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {layer === 2 ? (
            <>
              <h4>Recovered evidence</h4>
              <ul className="items">
                {(e.evidence ?? []).map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
              <h4>Additional findings</h4>
              <p className="notes">{e.notes}</p>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function Section({ name, locked, children, defaultOpen = false }: { name: string; locked: boolean; children: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={`file ${locked ? 'locked' : ''} ${open ? 'open' : ''}`}>
      <header onClick={() => setOpen((o) => !o)} role="button" aria-expanded={open} tabIndex={0} onKeyDown={(k) => k.key === 'Enter' && setOpen((o) => !o)}>
        <span className="name">{name}</span>
        <span className="tiny">{open ? 'close' : locked ? 'sealed' : 'open'}</span>
      </header>
      {open ? <div className="body">{children}</div> : null}
    </div>
  );
}

function Passcode({ label, onUnlocked }: { label: string; onUnlocked: () => void }) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await api('/api/player/ledger/unlock', { json: { passcode: code } });
      onUnlocked();
    } catch (e2) {
      setErr(errorText(e2));
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={submit} className="stack">
      <p className="muted small">[LAYER SEALED] {label} needs a second recovery authorization. It arrives by command release, or as a passcode read to you over the secure line.</p>
      <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="PASSCODE" aria-label="Passcode" autoCapitalize="characters" autoComplete="off" autoCorrect="off" />
      <button className="btn block" disabled={busy || !code.trim()}>
        Unlock
      </button>
      {err ? (
        <div className="error" role="alert">
          {err}
        </div>
      ) : null}
    </form>
  );
}

export function Ledger({ view, active, onSeenLayer2 }: { view: PlayerView; active: boolean; onSeenLayer2: () => void }) {
  const [files, setFiles] = useState<LedgerFiles | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const key = `${view.ledger.layer1}:${view.ledger.layer2}`;
  const load = async () => {
    try {
      setFiles(await api<LedgerFiles>('/api/player/ledger'));
      setErr(null);
    } catch (e) {
      setErr(errorText(e));
    }
  };
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  useEffect(() => {
    if (active && view.ledger.layer2) onSeenLayer2();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, view.ledger.layer2]);

  if (err)
    return (
      <div className="error" role="alert">
        {err}{' '}
        <button className="btn small" onClick={() => void load()}>
          Retry
        </button>
      </div>
    );
  if (!files) return <p className="muted cursor">Mounting Ledger</p>;
  const l1 = files.layer1;
  const l2 = files.layer2;

  return (
    <div>
      <p className="ledger-head">
        S30 Ledger · access level magenta · establish every agent&rsquo;s movements, <b>{files.interrogationWindow}</b>
      </p>
      <Section name="LAYER 01 // PERSONNEL RECORDS" locked={!l1} defaultOpen>
        {l1 ? (
          <>
            <p className="tiny">{l1.subtitle}</p>
            <p className="small muted">{l1.intro}</p>
            {l1.entries.map((e, i) => (
              <Agent key={e.id} e={e} layer={1} defaultOpen={i === 0} />
            ))}
          </>
        ) : (
          <p className="muted">Sealed.</p>
        )}
      </Section>
      <Section key={l2 ? 'l2-open' : 'l2-sealed'} name={`LAYER 02 // ${files.layer2Label}`} locked={!l2} defaultOpen={Boolean(l2)}>
        {l2 ? (
          <>
            <p className="tiny">{l2.subtitle}</p>
            <p className="small muted">{l2.intro}</p>
            <div className="incident">
              <div>
                <b>Incident:</b> {l2.incident.incident}
              </div>
              <div>
                <b>Confirmed time of death:</b> {l2.incident.timeOfDeath}
              </div>
              <div>
                <b>Location:</b> {l2.incident.location}
              </div>
            </div>
            {l2.entries.map((e) => (
              <Agent key={e.id} e={e} layer={2} />
            ))}
          </>
        ) : (
          <Passcode label={`Layer 02, ${files.layer2Label},`} onUnlocked={load} />
        )}
      </Section>
      <Section name="LEDGER DECRYPTION RECORD" locked={false}>
        <pre className="typed small">{view.reveal.body}</pre>
      </Section>
    </div>
  );
}
