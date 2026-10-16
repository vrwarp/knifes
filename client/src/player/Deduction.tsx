import { useEffect, useRef, useState } from 'react';
import { api, errorText } from '../api';
import type { SlotId } from '../types';
import type { StageProps } from './PlayerApp';
import { reduceMotion } from './common';

type Submit = { pass: boolean; title: string | null; body: string | null; failText: string; verified: number | null; total: number };

const DRAFT_KEY = 's30.deduction.draft';
const VERIFY_LINES = ['CROSS-REFERENCING ACCESS LOG', 'MATCHING INTERCEPT SIGNATURES', 'CHECKING TOXICOLOGY WINDOW', 'ARCHIVE VERIFYING'];

export function Deduction({ view, refresh }: StageProps) {
  const d = view.deduction;
  const [answers, setAnswers] = useState<Record<SlotId, string>>(() => {
    const base = { time: '', suspect: '', method: '', asset: '', motive: '', prop: '' };
    let saved: Partial<Record<SlotId, string>> = {};
    try {
      saved = JSON.parse(sessionStorage.getItem(DRAFT_KEY) ?? '{}') as Partial<Record<SlotId, string>>;
    } catch {
      saved = {};
    }
    return { ...base, ...(d.lastAnswers ?? {}), ...saved };
  });
  useEffect(() => {
    try {
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify(answers));
    } catch {
      /* private mode */
    }
  }, [answers]);
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState(0);
  const [failFlash, setFailFlash] = useState(false);
  useEffect(() => {
    if (!busy) return;
    const t = window.setInterval(() => setPhase((p) => (p + 1) % VERIFY_LINES.length), 800);
    return () => window.clearInterval(t);
  }, [busy]);
  const [result, setResult] = useState<Submit | null>(null);
  const verdictRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (result && !result.pass) verdictRef.current?.scrollIntoView({ block: 'nearest', behavior: reduceMotion() ? 'auto' : 'smooth' });
  }, [result]);
  const [err, setErr] = useState<string | null>(null);
  const exhausted = d.maxAttempts !== null && d.attempts >= d.maxAttempts && !d.passed;

  const parts = d.template.split(/(\[[A-Z ]+\])/g);
  const byLabel = new Map(d.slots.map((s) => [s.label, s]));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    setResult(null);
    const started = Date.now();
    try {
      const r = await api<Submit>('/api/player/deduction', { json: answers, timeoutMs: 150_000 });
      // The verdict should feel weighed, not instant.
      await new Promise((res) => window.setTimeout(res, Math.max(0, 2500 - (Date.now() - started))));
      setResult(r);
      if (!r.pass) {
        setFailFlash(true);
        window.setTimeout(() => setFailFlash(false), 600);
      } else {
        try {
          sessionStorage.removeItem(DRAFT_KEY);
        } catch {
          /* ignore */
        }
      }
      await refresh();
    } catch (e2) {
      setErr(errorText(e2));
    } finally {
      setBusy(false);
    }
  };

  if (d.passed) {
    return (
      <div className="frame success">
        <h1 className="green">{d.successTitle}</h1>
        <pre className="typed">{d.successBody}</pre>
      </div>
    );
  }

  return (
    <form className={`frame accent ${failFlash ? 'shake danger' : result && !result.pass ? 'danger' : ''}`} onSubmit={submit}>
      <h1>Master deduction</h1>
      <p className="muted small">{d.prompt}</p>
      <div className="sentence">
        {parts.map((p, i) => {
          const m = /^\[([A-Z ]+)\]$/.exec(p);
          if (!m) return <span key={i}>{p}</span>;
          const slot = byLabel.get(m[1]);
          if (!slot) return <span key={i}>{p}</span>;
          return (
            <input
              key={i}
              value={answers[slot.id]}
              onChange={(e) => setAnswers((a) => ({ ...a, [slot.id]: e.target.value }))}
              placeholder={slot.placeholder || slot.label}
              aria-label={slot.label}
              autoComplete="off"
              autoCorrect="off"
              size={Math.max(10, Math.min(28, Math.max(answers[slot.id].length, (slot.placeholder || slot.label).length) + 2))}
            />
          );
        })}
      </div>
      {busy ? (
        <p className="amber cursor verifying" style={{ marginTop: 12 }} role="status">
          {VERIFY_LINES[phase]}
        </p>
      ) : (
        <button className="btn primary block" disabled={exhausted || Object.values(answers).some((v) => !v.trim())} style={{ marginTop: 12 }}>
          Submit deduction
        </button>
      )}
      {result && !result.pass ? (
        <div className="error fail-text" role="alert" ref={verdictRef}>
          {result.failText}
          {result.verified !== null ? (
            <div className="amber" style={{ marginTop: 6 }}>
              FIELDS VERIFIED: {result.verified} / {result.total}
            </div>
          ) : null}
        </div>
      ) : null}
      {exhausted ? <div className="error">No submissions remain. Await command authority.</div> : null}
      {d.attempts ? (
        <div className="tiny" style={{ marginTop: 8 }}>
          Submissions: {d.attempts}
          {d.maxAttempts !== null ? ` / ${d.maxAttempts}` : ''}
        </div>
      ) : null}
      {err ? (
        <div className="error" role="alert">
          {err}
        </div>
      ) : null}
    </form>
  );
}
