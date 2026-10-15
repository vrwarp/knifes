import { useState } from 'react';
import { Markdown } from '../md';
import type { ArchiveMessage } from '../types';
import { Investigation } from './Investigation';
import type { StageProps } from './PlayerApp';
import { Frame, Typewriter } from './common';

export function Solved(props: StageProps & { feed: ArchiveMessage[]; busy: boolean }) {
  const d = props.view.deduction;
  const [review, setReview] = useState(false);
  return (
    <>
      <Frame title={d.successTitle ?? 'Deduction verified'} className="accent">
        <Typewriter text={d.successBody ?? ''} speed={3} />
      </Frame>
      {props.view.report ? (
        <Frame title="Case file">
          <Markdown text={props.view.report} />
        </Frame>
      ) : null}
      <button className="btn ghost block no-print" onClick={() => setReview((r) => !r)}>
        {review ? 'Close case materials' : 'Review case materials'}
      </button>
      {review ? (
        <div style={{ marginTop: 16 }}>
          <Investigation {...props} />
        </div>
      ) : null}
    </>
  );
}
