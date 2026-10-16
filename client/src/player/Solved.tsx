import { useState } from 'react';
import { Markdown } from '../md';
import type { ArchiveMessage } from '../types';
import { Investigation } from './Investigation';
import type { StageProps } from './PlayerApp';
import { Frame, SkipHint, Typewriter, reduceMotion } from './common';

/** The verdict lands in beats: one paragraph per tap, the birthday line last and largest. */
export function Solved(props: StageProps & { feed: ArchiveMessage[]; busy: boolean }) {
  const d = props.view.deduction;
  const beats = (d.successBody ?? '')
    .split(/\n\s*\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  const [beat, setBeat] = useState(0);
  const [done, setDone] = useState(() => reduceMotion());
  const [review, setReview] = useState(false);
  const last = beats.length - 1;
  const finished = beat >= last && done;
  const report = props.view.report;

  return (
    <>
      <Frame title={d.successTitle ?? 'Deduction verified'} titleClassName="display green" className={`success ${beat === 0 ? 'pulse' : ''}`}>
        {beats.slice(0, beat).map((p, i) => (
          <pre key={i} className={`typed ${i === last ? 'display green' : ''}`} style={{ marginBottom: 14 }}>
            {p}
          </pre>
        ))}
        {beats.length ? (
          <Typewriter key={beat} text={beats[beat]} speed={beat === last ? 2 : 3} className={beat === last ? 'display green' : ''} onDone={() => setDone(true)} />
        ) : null}
        {!finished ? <SkipHint done={done} /> : null}
        {beat < last ? (
          <button
            className="btn primary block"
            disabled={!done}
            onClick={() => {
              setBeat((b) => b + 1);
              setDone(reduceMotion());
            }}
            style={{ marginTop: 12 }}
          >
            Continue
          </button>
        ) : null}
      </Frame>
      {finished && report ? (
        <Frame title={report.trimStart().startsWith('# ') ? undefined : 'Case file'}>
          <Markdown text={report} />
        </Frame>
      ) : null}
      {finished ? (
        <button className="btn ghost block no-print" onClick={() => setReview((r) => !r)}>
          {review ? 'Close case materials' : 'Review case materials'}
        </button>
      ) : null}
      {review ? (
        <div style={{ marginTop: 16 }}>
          <Investigation {...props} />
        </div>
      ) : null}
    </>
  );
}
