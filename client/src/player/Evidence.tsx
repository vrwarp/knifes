import { useEffect, useState, type ReactNode } from 'react';
import { api, errorText } from '../api';
import { Markdown } from '../md';
import type { EvidenceFiles, PlayerView } from '../types';
import { Keyboard, PromptLine } from './Keyboard';

function File({ name, locked, children, defaultOpen = false }: { name: string; locked: boolean; children: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={`file ${locked ? 'locked' : ''} ${open ? 'open' : ''}`}>
      <header onClick={() => setOpen((o) => !o)} role="button" aria-expanded={open} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && setOpen((o) => !o)}>
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
      await api('/api/player/evidence/unlock', { json: { passcode: code } });
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
      <p className="muted small">[PARTITION SEALED] {label} requires a recovery passcode. An out-of-town contact may be able to supply it.</p>
      <div className="con-line cmd" aria-hidden="true">
        <span className="prompt">$</span> unseal --passcode
      </div>
      <div className="transcript">
        <PromptLine value={code} maxLength={Math.max(6, code.length)} label="Passcode" shake={shaking} />
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

const inWindow = (t: string) => t >= '03:30' && t <= '04:00';

function Manifest({ files }: { files: EvidenceFiles }) {
  return (
    <>
      {(files.manifest ?? []).map((d) => (
        <div className="dossier" key={d.badge}>
          <b>{d.codename}</b> · {d.badge} · {d.role} · clearance {d.clearance}
          <div className="muted">{d.relationship}</div>
          <div>{d.publicNotes}</div>
        </div>
      ))}
    </>
  );
}

export function Evidence({ view }: { view: PlayerView }) {
  const [files, setFiles] = useState<EvidenceFiles | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const key = JSON.stringify(view.evidence.unlocked);
  const load = async () => {
    try {
      setFiles(await api<EvidenceFiles>('/api/player/evidence'));
      setErr(null);
    } catch (e) {
      setErr(errorText(e));
    }
  };
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  if (err)
    return (
      <div className="error" role="alert">
        {err}{' '}
        <button className="btn small" onClick={() => void load()}>
          Retry
        </button>
      </div>
    );
  if (!files) return <p className="muted cursor">Opening vault</p>;
  const highlight = files.toxicology !== null;

  return (
    <div>
      <p className="tiny">{'Evidence vault · Drive 30\u2011BETA'}</p>
      <File name="00_Directors_Note.txt" locked={false} defaultOpen>
        <pre className="typed small">{files.note}</pre>
      </File>
      <File name="01_Vault_Access_Logs.csv" locked={files.locked.logs}>
        {files.logs ? (
          <>
            {highlight ? <p className="tiny amber">Rows from 03:30 to 04:00 are marked.</p> : null}
            <table className="log">
              <tbody>
                {files.logs.rows.map((r, i) => (
                  <tr key={i} className={highlight && inWindow(r.time) ? 'window' : ''}>
                    <td>{r.time}</td>
                    <td>
                      {r.name ? <b>{r.name}</b> : null}
                      <span className="muted">
                        {r.name ? ' · ' : ''}
                        {r.badge}
                        {r.door ? ` · ${r.door}` : ''}
                      </span>
                      <div>{r.event}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <h3 style={{ marginTop: 12 }}>Camera notes</h3>
            {files.logs.cameras.map((c, i) => (
              <p key={i} className="small">
                {c}
              </p>
            ))}
          </>
        ) : (
          <p className="muted">Sealed.</p>
        )}
      </File>
      <File name="02_Audio_Intercept.wav" locked={files.locked.audio}>
        {files.intercept ? (
          <>
            {files.intercept.hasAudio ? (
              <audio controls preload="none" src="/api/player/audio" style={{ width: '100%' }} />
            ) : (
              <p className="muted small">[WAVEFORM FILE NOT RECOVERED] Analysis notes survive.</p>
            )}
            <pre className="typed small" style={{ marginTop: 8 }}>
              {files.intercept.notes}
            </pre>
          </>
        ) : (
          <Passcode label="The ambient intercept" onUnlocked={load} />
        )}
      </File>
      <File name="03_Toxicology_Manifest.pdf" locked={files.locked.toxicology}>
        {files.toxicology ? (
          <>
            <Markdown text={files.toxicology} />
            <h3 style={{ marginTop: 16 }}>Operative manifest</h3>
            <Manifest files={files} />
          </>
        ) : (
          <Passcode label="The toxicology report" onUnlocked={load} />
        )}
      </File>
      {files.locked.toxicology && files.manifest ? (
        <File name="03b_Operative_Manifest.txt" locked={false}>
          <Manifest files={files} />
        </File>
      ) : null}
      <File name="04_Incident_Record.txt" locked={false}>
        <pre className="typed small">{view.reveal.body}</pre>
      </File>
    </div>
  );
}
