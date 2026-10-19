import { useEffect, useState, type ReactNode } from 'react';
import { api, errorText } from '../api';
import type { LedgerEntry, LedgerFiles, PlayerView } from '../types';
import { Keyboard, PromptLine } from './Keyboard';

/** Minutes since 6 PM for "2:14 AM" or the start of "2:00–2:30 AM"; null when unreadable. */
function mins(time: string): number | null {
  const m = /(\d{1,2}):(\d{2})(?:\s*[–-]\s*\d{1,2}:\d{2})?\s*(AM|PM)/i.exec(time);
  if (!m) return null;
  let h = Number(m[1]) % 12;
  if (m[3].toUpperCase() === 'PM') h += 12;
  const abs = h * 60 + Number(m[2]);
  return abs < 12 * 60 ? abs + 24 * 60 - 18 * 60 : abs - 18 * 60;
}

const BANDS: { label: string; from: number }[] = [
  { label: 'Evening', from: -Infinity },
  { label: 'Before midnight', from: 4 * 60 },
  { label: 'After midnight', from: 6 * 60 },
  { label: 'After 2 AM', from: 8 * 60 },
];
const bandOf = (time: string) => {
  const t = mins(time);
  if (t === null) return BANDS[0].label;
  let b = BANDS[0].label;
  for (const x of BANDS) if (t >= x.from) b = x.label;
  return b;
};

/** A night's log grouped under four time bands so a long card still reads on a phone. */
function Log({ lines }: { lines: { time: string; text: string }[] }) {
  const rows: ReactNode[] = [];
  let last = '';
  lines.forEach((l, i) => {
    const b = bandOf(l.time);
    if (b !== last) {
      rows.push(
        <tr key={`b${i}`} className="band">
          <td colSpan={2}>{b}</td>
        </tr>,
      );
      last = b;
    }
    rows.push(
      <tr key={i}>
        <td>{l.time}</td>
        <td>{l.text}</td>
      </tr>,
    );
  });
  return (
    <table className="log">
      <tbody>{rows}</tbody>
    </table>
  );
}

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
              <dl className="facts">
                {(e.facts ?? []).map((f) => (
                  <div key={f.label}>
                    <dt>{f.label}</dt>
                    <dd>{f.value}</dd>
                  </div>
                ))}
              </dl>
              <h4>Personnel profile</h4>
              <p className="notes">{e.notes}</p>
            </>
          ) : (
            <>
              <h4>Recorded activity</h4>
              <Log lines={e.log ?? []} />
            </>
          )}
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
  const [shaking, setShaking] = useState(false);
  const submit = async () => {
    if (!code.trim() || busy) return;
    setBusy(true);
    setErr(null);
    try {
      await api('/api/player/ledger/unlock', { json: { passcode: code } });
      onUnlocked();
    } catch (e2) {
      setErr(errorText(e2));
      setShaking(true);
      window.setTimeout(() => setShaking(false), 500);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="stack passcode">
      <p className="muted small">[LAYER SEALED] {label} needs a second recovery authorization. It arrives by command release, or as a passcode read to you over the secure line.</p>
      <div className="con-line cmd" aria-hidden="true">
        <span className="prompt">$</span> unseal --layer 02 --passcode
      </div>
      <div className="transcript">
        <PromptLine value={code} maxLength={Math.max(8, code.length)} label="Passcode" shake={shaking} />
      </div>
      {err ? (
        <div className="con-line sys" role="alert">
          <span className="red">!</span> {err}
        </div>
      ) : null}
      <Keyboard
        value={code}
        onChange={(v) => {
          setCode(v);
          setErr(null);
        }}
        onEnter={() => void submit()}
        maxLength={16}
        digits
        canEnter={code.trim().length > 0}
        disabled={busy}
        enterLabel="Unlock"
        fixed={false}
        hardware={false}
        status={
          <>
            <span>SEALED</span>
            <span className="filler-right">
              {code.length}
              <i className="caret" />
            </span>
          </>
        }
      />
    </div>
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
        S30 Ledger · access level magenta · ask every agent where they were, <b>{files.interrogationWindow}</b>
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
              <div>
                <b>Found:</b> {l2.incident.found}
              </div>
            </div>
            {l2.entries.map((e) => (
              <Agent key={e.id} e={e} layer={2} />
            ))}
            <div className="agent l2">
              <header>
                <span>
                  <span className="tiny">DUTY · </span>
                  <span className="name">Duty officer Hale</span>
                </span>
                <span className="pos">Facility log</span>
              </header>
              <div className="body">
                <Log lines={l2.facilityLog} />
              </div>
            </div>
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
