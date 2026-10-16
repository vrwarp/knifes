import { useState } from 'react';
import type { ArchiveMessage } from '../types';
import { Archive } from './Archive';
import { Deduction } from './Deduction';
import { Evidence } from './Evidence';
import type { StageProps } from './PlayerApp';

type Tab = 'evidence' | 'archive' | 'deduction';

export function Investigation({ view, setView, refresh, hold, feed, busy }: StageProps & { feed: ArchiveMessage[]; busy: boolean }) {
  const [tab, setTab] = useState<Tab>('evidence');
  return (
    <>
      <div className="tabs" role="tablist">
        {(['evidence', 'archive', 'deduction'] as Tab[]).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>
            {t}
          </button>
        ))}
      </div>
      {tab === 'evidence' ? <Evidence view={view} /> : null}
      {tab === 'archive' ? <Archive view={view} feed={feed} busy={busy} /> : null}
      {tab === 'deduction' ? <Deduction view={view} setView={setView} refresh={refresh} hold={hold} /> : null}
    </>
  );
}
