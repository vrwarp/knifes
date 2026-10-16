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
      {/* All three stay mounted so flipping tabs keeps his draft, his query and his open files. */}
      <div hidden={tab !== 'evidence'}>
        <Evidence view={view} />
      </div>
      <div hidden={tab !== 'archive'}>
        <Archive view={view} feed={feed} busy={busy} active={tab === 'archive'} />
      </div>
      <div hidden={tab !== 'deduction'}>
        <Deduction view={view} setView={setView} refresh={refresh} hold={hold} />
      </div>
    </>
  );
}
