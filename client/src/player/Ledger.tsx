import { useEffect, useState, type ReactNode } from 'react';
import { api, errorText } from '../api';
import { fill, type LedgerEntry, type LedgerFiles, type PlayerView, type UiText } from '../types';

function Log({ lines }: { lines: { time: string; text: string }[] }) {
  return (
    <table className="log">
      <tbody>
        {lines.map((l, i) => (
          <tr key={i}>
            <td>{l.time}</td>
            <td>{l.text}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Agent({ e, layer, t, defaultOpen = false }: { e: LedgerEntry; layer: 1 | 2; t: UiText['ledger']; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={`agent ${layer === 2 ? 'l2' : ''} ${open ? 'open' : ''}`}>
      <header onClick={() => setOpen((o) => !o)} role="button" aria-expanded={open} tabIndex={0} onKeyDown={(k) => k.key === 'Enter' && setOpen((o) => !o)}>
        <span className="name">{e.name}</span>
        <span className="pos">{e.position}</span>
      </header>
      {open ? (
        <div className="body">
          <p className="tiny">{fill(t.idLine, { id: e.id })}</p>
          {layer === 1 ? (
            <>
              <dl className="facts">
                {(e.facts ?? []).map((f, i) => (
                  <div key={i}>
                    <dt>{f.label}</dt>
                    <dd>{f.value}</dd>
                  </div>
                ))}
              </dl>
              <h4>{t.profileHeading}</h4>
              <p className="notes">{e.notes}</p>
            </>
          ) : (
            <>
              <h4>{t.activityHeading}</h4>
              <Log lines={e.log ?? []} />
            </>
          )}
          {layer === 2 ? (
            <>
              <h4>{t.evidenceHeading}</h4>
              <ul className="items">
                {(e.evidence ?? []).map((x, i) => (
                  <li key={i}>{x}</li>
                ))}
              </ul>
              <h4>{t.findingsHeading}</h4>
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
        <span className="tiny">{open ? 'close' : locked ? 'locked' : 'open'}</span>
      </header>
      {open ? <div className="body">{children}</div> : null}
    </div>
  );
}

export function Ledger({ view, active, onSeenLayer2 }: { view: PlayerView; active: boolean; onSeenLayer2: () => void }) {
  const [files, setFiles] = useState<LedgerFiles | null>(null);
  const [err, setErr] = useState<string | null>(null);
  // The files come over HTTP, not with the state: fetch again when a layer opens or a GM edits them.
  const key = `${view.ledger.layer1}:${view.ledger.layer2}:${view.configVersion}`;
  const t = view.text.ledger;
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
  if (!files) return <p className="muted cursor">{t.mounting}</p>;
  const l1 = files.layer1;
  const l2 = files.layer2;

  return (
    <div>
      <p className="ledger-head">
        {view.ledger.headLine.split('{window}').map((part, i, all) => (
          <span key={i}>
            {part}
            {i < all.length - 1 ? <b>{files.interrogationWindow}</b> : null}
          </span>
        ))}
      </p>
      <Section name={view.ledger.layer1Label} locked={!l1} defaultOpen>
        {l1 ? (
          <>
            <p className="tiny">{l1.subtitle}</p>
            <p className="small muted">{l1.intro}</p>
            {l1.entries.map((e, i) => (
              <Agent key={e.id} e={e} layer={1} t={t} defaultOpen={i === 0} />
            ))}
          </>
        ) : (
          <p className="muted">{t.notDecrypted}</p>
        )}
      </Section>
      {l2 ? (
        <Section name={files.layer2Label} locked={false} defaultOpen>
          <>
            <p className="tiny">{l2.subtitle}</p>
            <p className="small muted">{l2.intro}</p>
            <div className="incident">
              <div>
                <b>{t.incidentLabel}</b> {l2.incident.incident}
              </div>
              <div>
                <b>{t.timeOfDeathLabel}</b> {l2.incident.timeOfDeath}
              </div>
              <div>
                <b>{t.locationLabel}</b> {l2.incident.location}
              </div>
              <div>
                <b>{t.foundLabel}</b> {l2.incident.found}
              </div>
            </div>
            {l2.entries.map((e) => (
              <Agent key={e.id} e={e} layer={2} t={t} />
            ))}
          </>
        </Section>
      ) : null}
      <Section name={view.ledger.recordLabel} locked={false}>
        <pre className="typed small">{view.reveal.body}</pre>
      </Section>
    </div>
  );
}
