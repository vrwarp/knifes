import { useEffect, useState, type ReactNode } from 'react';
import { api, errorText } from '../api';
import type { GameConfig, StageId } from '../types';
import { STAGE_NAME } from './panels';

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
  const [baseVersion, setBaseVersion] = useState(config.version);
  /** What the GM is typing into list and coordinate fields, before it parses. */
  const [raw, setRaw] = useState<Record<string, string>>({});
  const rawKey = (path: Path) => path.join('.');
  const conflict = dirty && config.version !== baseVersion;
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!dirty) {
      setDraft(structuredClone(config));
      setBaseVersion(config.version);
    }
  }, [config, dirty]);

  const up = (path: Path, value: unknown) => {
    setDraft((d) => setIn(d, path, value));
    setDirty(true);
  };

  const save = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await api<{ config: GameConfig }>('/api/gm/config', { method: 'PUT', json: draft });
      setDirty(false);
      setRaw({});
      setBaseVersion(r.config.version);
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
    setBaseVersion(config.version);
    setRaw({});
    setDirty(false);
    setMsg(null);
  };
  /** Phones upload 4 MB photos; the player loads them on cellular. Downscale to 1600px JPEG first. */
  const shrink = (file: File): Promise<Blob> =>
    new Promise((resolve) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        const scale = Math.min(1, 1600 / Math.max(img.width, img.height));
        if (scale === 1 && file.size < 600_000) return resolve(file);
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * scale);
        c.height = Math.round(img.height * scale);
        c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
        c.toBlob((b) => resolve(b ?? file), 'image/jpeg', 0.85);
      };
      img.onerror = () => resolve(file);
      img.src = url;
    });
  const upload = async (kind: 'audio' | 'photo', file: File) => {
    const fd = new FormData();
    if (kind === 'photo') {
      const blob = await shrink(file);
      fd.append('file', blob, blob === file ? file.name : file.name.replace(/\.[^.]+$/, '') + '.jpg');
    } else fd.append('file', file);
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
    if (!window.confirm('Delete this upload from the server? This cannot be undone.')) return;
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
  const CSV = (path: Path, label: string) => {
    const k = rawKey(path);
    const value = raw[k] ?? ((getIn(draft, path) as string[] | undefined) ?? []).join(', ');
    return (
      <label className="field">
        <span>{label} (comma separated)</span>
        <input
          value={value}
          onChange={(e) => {
            setRaw((r) => ({ ...r, [k]: e.target.value }));
            up(
              path,
              e.target.value
                .split(',')
                .map((x) => x.trim())
                .filter(Boolean),
            );
          }}
        />
      </label>
    );
  };
  const Lines = (path: Path, label: string) => {
    const k = rawKey(path);
    const value = raw[k] ?? ((getIn(draft, path) as string[] | undefined) ?? []).join('\n');
    return (
      <label className="field">
        <span>{label} (one per line)</span>
        <textarea
          rows={3}
          value={value}
          onChange={(e) => {
            setRaw((r) => ({ ...r, [k]: e.target.value }));
            up(
              path,
              e.target.value.split('\n').map((x) => x.trim()).filter(Boolean),
            );
          }}
        />
      </label>
    );
  };

  const target = draft.geo.target;
  return (
    <div className="panel config-wrap" style={{ marginTop: 16 }}>
      <h2>Game configuration {dirty ? <span className="amber">· unsaved changes</span> : null}</h2>
      {conflict ? <div className="error">Another GM saved a newer configuration while you were editing. Discard to load it, or your save will overwrite theirs.</div> : null}
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
        <label className="field">
          <span>Target coordinates as "lat, lng" (blank = any pin passes; copy from Google Maps)</span>
          <input
            value={raw['geo.target'] ?? (target ? `${target.lat}, ${target.lng}` : '')}
            placeholder="34.0522, -118.2437"
            onChange={(e) => {
              const v = e.target.value;
              setRaw((r) => ({ ...r, 'geo.target': v }));
              const m = /^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/.exec(v);
              if (v.trim() === '') up(['geo', 'target'], null);
              else if (m) up(['geo', 'target'], { lat: Number(m[1]), lng: Number(m[2]) });
              else setDirty(true);
            }}
          />
          {raw['geo.target'] !== undefined && raw['geo.target'].trim() !== '' && !/^\s*-?\d+(?:\.\d+)?\s*,\s*-?\d+(?:\.\d+)?\s*$/.test(raw['geo.target']) ? (
            <div className="small red">Not a "lat, lng" pair yet.</div>
          ) : !target ? (
            <div className="small amber">No target: the puzzle accepts any pin until this is set.</div>
          ) : null}
        </label>
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
                <img src={`/uploads/${p}`} alt="" className="thumb" />
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
        {S(['deduction', 'feedback'], 'Feedback on a wrong submission', [
          ['pass_fail', 'Pass or fail only'],
          ['count', 'Pass or fail plus how many fields verified'],
        ])}
        {N(['deduction', 'maxAttempts'], 'Max submissions', true)}
      </Section>
      <Section title="Quick hints per stage">
        {STAGES.map((s) => (
          <div key={s}>{Lines(['hints', 'quick', s], STAGE_NAME[s])}</div>
        ))}
      </Section>
      <div className="sticky-actions row">
        <button className="btn primary" onClick={() => void save()} disabled={busy || !dirty || conflict}>
          Save config
        </button>
        <button className="btn ghost" onClick={discard} disabled={busy || !dirty}>
          Discard
        </button>
        {dirty ? <span className="small muted">Saving pushes the change to his phone immediately.</span> : null}
        {msg ? <span className="small amber">{msg}</span> : null}
      </div>
    </div>
  );
}
