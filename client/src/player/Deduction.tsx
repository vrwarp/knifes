import { useState } from 'react';
import { api, errorText } from '../api';
import type { PlayerView, SlotId } from '../types';
import type { StageProps } from './PlayerApp';

type Submit = { pass: boolean; title: string | null; body: string | null; failText: string };

export function Deduction({ view, refresh }: StageProps) {
  const d = view.deduction;
  const [answers, setAnswers] = useState<Record<SlotId, string>>(() => {
    const base = { time: '', suspect: '', method: '', asset: '', motive: '', prop: '' };
    return { ...base, ...(d.lastAnswers ?? {}) };
  });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Submit | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const exhausted = d.maxAttempts !== null && d.attempts >= d.maxAttempts && !d.passed;

  const parts = d.template.split(/(\[[A-Z ]+\])/g);
  const byLabel = new Map(d.slots.map((s) => [s.label, s]));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const r = await api<Submit>('/api/player/deduction', { json: answers });
      setResult(r);
      await refresh();
    } catch (e2) {
      setErr(errorText(e2));
    } finally {
      setBusy(false);
    }
  };

  if (d.passed) {
    return (
      <div className="frame accent">
        <h1 className="green">{d.successTitle}</h1>
        <pre className="typed">{d.successBody}</pre>
      </div>
    );
  }

  return (
    <form className="frame accent" onSubmit={submit}>
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
              placeholder={slot.label}
              aria-label={slot.label}
              autoComplete="off"
              size={Math.max(8, Math.min(28, answers[slot.id].length + 2))}
            />
          );
        })}
      </div>
      {busy ? (
        <p className="amber cursor" style={{ marginTop: 12 }}>
          ARCHIVE VERIFYING
        </p>
      ) : (
        <button className="btn primary block" disabled={exhausted || Object.values(answers).some((v) => !v.trim())} style={{ marginTop: 12 }}>
          Submit deduction
        </button>
      )}
      {result && !result.pass ? <div className="error">{result.failText}</div> : null}
      {exhausted ? <div className="error">No submissions remain. Await command authority.</div> : null}
      {d.attempts ? (
        <div className="tiny" style={{ marginTop: 8 }}>
          Submissions: {d.attempts}
          {d.maxAttempts !== null ? ` / ${d.maxAttempts}` : ''}
        </div>
      ) : null}
      {err ? <div className="error">{err}</div> : null}
    </form>
  );
}
