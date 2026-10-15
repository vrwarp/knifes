import { useEffect, useState, type ReactNode } from 'react';
import { api, errorText } from '../api';
import type { GameConfig, StageId } from '../types';

type Path = (string | number)[];

function getIn(obj: unknown, path: Path): unknown {
  let cur: unknown = obj;
  for (const k of path) {
    if (cur === null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string | number, unknown>)[k];
  }
  return cur;
}

function setIn<T>(obj: T, path: Path, value: unknown): T {
  if (!path.length) return value as T;
  const [head, ...rest] = path;
  const copy: Record<string | number, unknown> = Array.isArray(obj) ? [...(obj as unknown[])] as never : { ...(obj as Record<string, unknown>) };
  copy[head] = setIn((obj as Record<string | number, unknown>)[head], rest, value);
  return copy as T;
}

function Section({ title, children, open = false }: { title: string; children: ReactNode; open?: boolean }) {
  return (
    <details className="section" open={open}>
      <summary>{title}</summary>
      <div style={{ paddingTop: 8 }}>{children}</div>
    </details>
  );
}

const STAGES: StageId[] = ['geo', 'gate', 'hack', 'reveal', 'investigation', 'solved'];

export function ConfigEditor({ config, onSaved }: { config: GameConfig; onSaved: () => Promise<void> }) {
  const [draft, setDraft] = useState<GameConfig>(() => structuredClone(config));
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!dirty) setDraft(structuredClone(config));
  }, [config, dirty]);

  const up = (path: Path, value: unknown) => {
    setDraft((d) => setIn(d, path, value));
    setDirty(true);
  };

  const save = async () => {
    setBusy(true);
    setMsg(null);
    try {
      await api('/api/gm/config', { method: 'PUT', json: draft });
      setDirty(false);
      setMsg('Saved and pushed to the player');
      await onSaved();
    } catch (e) {
      setMsg(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const discard = () => {
    setDraft(structuredClone(config));
    setDirty(false);
    setMsg(null);
  };
  const upload = async (kind: 'audio' | 'photo', file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    setBusy(true);
    setMsg(null);
    try {
      const r = await api<{ id: string }>(`/api/gm/upload?kind=${kind}`, { method: 'POST', body: fd });
      setDraft((d) =>
        kind === 'photo'
          ? { ...d, geo: { ...d.geo, photos: d.geo.photos.includes(r.id) ? d.geo.photos : [...d.geo.photos, r.id] } }
          : { ...d, evidence: { ...d.evidence, audioUploadId: r.id } },
      );
      setMsg(`Uploaded ${r.id}`);
    } catch (e) {
      setMsg(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const removeUpload = async (id: string) => {
    setBusy(true);
    try {
      await api(`/api/gm/upload/${encodeURIComponent(id)}`, { method: 'DELETE' });
      setDraft((d) => ({
        ...d,
        geo: { ...d.geo, photos: d.geo.photos.filter((p) => p !== id) },
        evidence: { ...d.evidence, audioUploadId: d.evidence.audioUploadId === id ? null : d.evidence.audioUploadId },
      }));
    } catch (e) {
      setMsg(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const T = (path: Path, label: string) => (
    <label className="field">
      <span>{label}</span>
      <input value={String(getIn(draft, path) ?? '')} onChange={(e) => up(path, e.target.value)} />
    </label>
  );
  const A = (path: Path, label: string, rows = 5) => (
    <label className="field">
      <span>{label}</span>
      <textarea rows={rows} value={String(getIn(draft, path) ?? '')} onChange={(e) => up(path, e.target.value)} />
    </label>
  );
  const N = (path: Path, label: string, nullable = false) => (
    <label className="field">
      <span>{label}{nullable ? ' (blank = none)' : ''}</span>
      <input
        type="number"
        step="any"
        value={getIn(draft, path) === null || getIn(draft, path) === undefined ? '' : String(getIn(draft, path))}
        onChange={(e) => up(path, e.target.value === '' ? (nullable ? null : 0) : Number(e.target.value))}
      />
    </label>
  );
  const S = (path: Path, label: string, options: [string, string][]) => (
    <label className="field">
      <span>{label}</span>
      <select value={String(getIn(draft, path) ?? '')} onChange={(e) => up(path, e.target.value)}>
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );
  const B = (path: Path, label: string) => (
    <label className="field row" style={{ gap: 8 }}>
      <input type="checkbox" style={{ width: 'auto' }} checked={Boolean(getIn(draft, path))} onChange={(e) => up(path, e.target.checked)} />
      <span style={{ margin: 0 }}>{label}</span>
    </label>
  );
  const CSV = (path: Path, label: string) => (
    <label className="field">
      <span>{label} (comma separated)</span>
      <input
        value={((getIn(draft, path) as string[] | undefined) ?? []).join(', ')}
        onChange={(e) =>
          up(
            path,
            e.target.value
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean),
          )
        }
      />
    </label>
  );
  const Lines = (path: Path, label: string) => (
    <label className="field">
      <span>{label} (one per line)</span>
      <textarea rows={3} value={((getIn(draft, path) as string[] | undefined) ?? []).join('\n')} onChange={(e) => up(path, e.target.value.split('\n').filter((s) => s.trim()))} />
    </label>
  );

  const target = draft.geo.target;
  return (
    <div className="panel" style={{ marginTop: 16 }}>
      <h2>Game configuration {dirty ? <span className="amber">· unsaved changes</span> : null}</h2>
      {T(['title'], 'Title')}
      <Section title="Intro (QR landing)">
        {T(['intro', 'headline'], 'Headline')}
        {A(['intro', 'body'], 'Body', 8)}
        {T(['intro', 'buttonLabel'], 'Button label')}
      </Section>
      <Section title="Location puzzle (geo)">
        {S(['geo', 'mode'], 'Mode', [
          ['puzzle', 'Puzzle: photos + map pin'],
          ['reveal', 'Reveal only: show the briefing and next location, no puzzle'],
          ['off', 'Off: skip straight to the code gate'],
        ])}
        {A(['geo', 'briefing'], 'Briefing', 4)}
        <div className="two">
          <label className="field">
            <span>Target latitude (blank = any guess passes)</span>
            <input
              type="number"
              step="any"
              value={target ? target.lat : ''}
              onChange={(e) => up(['geo', 'target'], e.target.value === '' ? null : { lat: Number(e.target.value), lng: target?.lng ?? 0 })}
            />
          </label>
          <label className="field">
            <span>Target longitude</span>
            <input
              type="number"
              step="any"
              value={target ? target.lng : ''}
              onChange={(e) => up(['geo', 'target'], e.target.value === '' ? null : { lat: target?.lat ?? 0, lng: Number(e.target.value) })}
            />
          </label>
        </div>
        {N(['geo', 'radiusMeters'], 'Accept radius (metres)')}
        <div className="two">
          {N(['geo', 'mapCenter', 'lat'], 'Map start latitude')}
          {N(['geo', 'mapCenter', 'lng'], 'Map start longitude')}
        </div>
        {N(['geo', 'mapZoom'], 'Map start zoom (1 to 19)')}
        <div className="field">
          <span className="tiny">Field photos</span>
          <div className="row">
            {draft.geo.photos.map((p) => (
              <span key={p} className="row" style={{ gap: 4 }}>
                <img src={`/uploads/${p}`} alt="" style={{ height: 48, border: '1px solid var(--line)' }} />
                <button className="btn small danger" onClick={() => void removeUpload(p)} disabled={busy}>
                  ×
                </button>
              </span>
            ))}
            <input type="file" accept="image/jpeg,image/png,image/webp" style={{ width: 'auto' }} disabled={busy} onChange={(e) => e.target.files?.[0] && void upload('photo', e.target.files[0])} />
          </div>
        </div>
        {T(['geo', 'revealTitle'], 'Reveal title')}
        {A(['geo', 'revealBody'], 'Reveal body (tell him where to go)', 4)}
      </Section>
      <Section title="Code gate (Phil's code)">
        {A(['gate', 'prompt'], 'Prompt', 3)}
        {T(['gate', 'code'], 'Unlock code (letters/digits, case and dashes ignored)')}
        {T(['gate', 'successText'], 'Success text')}
      </Section>
      <Section title="Word puzzle (mirror partition)">
        {T(['hack', 'secret'], 'Secret word (3 to 8 letters)')}
        <div className="two">
          {N(['hack', 'maxAttempts'], 'Attempts per round')}
          {N(['hack', 'lockoutSeconds'], 'Lockout seconds after a failed round')}
        </div>
        {A(['hack', 'intro'], 'Intro text', 4)}
      </Section>
      <Section title="Incident reveal (after the puzzle)">
        {T(['reveal', 'title'], 'Title')}
        {A(['reveal', 'body'], 'Body', 10)}
        {T(['reveal', 'buttonLabel'], 'Button label')}
      </Section>
      <Section title="Evidence vault">
        {S(['evidence', 'gateMode'], 'Unlock mode', [
          ['after_hack', 'Everything opens after the word puzzle'],
          ['passcodes', 'Audio and toxicology need passcodes (hotline calls)'],
        ])}
        <div className="two">
          {T(['evidence', 'passcodes', 'audio'], 'Audio intercept passcode')}
          {T(['evidence', 'passcodes', 'toxicology'], 'Toxicology passcode')}
        </div>
        <div className="field">
          <span className="tiny">Audio intercept file</span>
          <div className="row">
            {draft.evidence.audioUploadId ? (
              <>
                <span className="small green">{draft.evidence.audioUploadId}</span>
                <button className="btn small danger" onClick={() => void removeUpload(draft.evidence.audioUploadId!)} disabled={busy}>
                  remove
                </button>
              </>
            ) : (
              <span className="small muted">none uploaded</span>
            )}
            <input type="file" accept="audio/*" style={{ width: 'auto' }} disabled={busy} onChange={(e) => e.target.files?.[0] && void upload('audio', e.target.files[0])} />
          </div>
        </div>
        {A(['evidence', 'audioNotes'], 'Waveform analysis notes', 4)}
      </Section>
      <Section title="ARCHIVE terminal">
        {B(['archive', 'enabled'], 'ARCHIVE enabled')}
        {N(['archive', 'maxMessageChars'], 'Max characters per query')}
        {A(['archive', 'welcome'], 'Welcome line', 3)}
      </Section>
      <Section title="Deduction grid">
        {A(['deduction', 'prompt'], 'Prompt', 2)}
        {A(['deduction', 'template'], 'Sentence template (keep the [BRACKETED] labels)', 3)}
        {draft.deduction.slots.map((s, i) => (
          <details className="section" key={s.id}>
            <summary>
              {s.id}: {s.canonical}
            </summary>
            <div className="two">
              {T(['deduction', 'slots', i, 'label'], 'Label (must match the template)')}
              {T(['deduction', 'slots', i, 'placeholder'], 'Placeholder')}
            </div>
            {T(['deduction', 'slots', i, 'canonical'], 'Canonical answer')}
            {CSV(['deduction', 'slots', i, 'accept'], 'Accepted phrasings')}
            {CSV(['deduction', 'slots', i, 'reject'], 'Rejected phrasings')}
            {A(['deduction', 'slots', i, 'guidance'], 'Guidance for the AI grader', 2)}
          </details>
        ))}
        {T(['deduction', 'successTitle'], 'Success title')}
        {A(['deduction', 'successBody'], 'Success body (the big reveal)', 8)}
        {A(['deduction', 'failText'], 'Fail text', 2)}
        {N(['deduction', 'maxAttempts'], 'Max submissions', true)}
      </Section>
      <Section title="Quick hints per stage">
        {STAGES.map((s) => (
          <div key={s}>{Lines(['hints', 'quick', s], s)}</div>
        ))}
      </Section>
      <div className="sticky-actions row">
        <button className="btn primary" onClick={() => void save()} disabled={busy || !dirty}>
          Save config
        </button>
        <button className="btn ghost" onClick={discard} disabled={busy || !dirty}>
          Discard
        </button>
        {msg ? <span className="small amber">{msg}</span> : null}
      </div>
    </div>
  );
}
