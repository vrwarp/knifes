import { useState } from 'react';
import type { ArchiveMessage } from '../types';
import { Archive } from './Archive';
import { Ledger } from './Ledger';
import type { StageProps } from './PlayerApp';

type Tab = 'ledger' | 'archive';

export function Investigation({ view, feed, busy, resync }: StageProps & { feed: ArchiveMessage[]; busy: boolean; resync: number }) {
  const [tab, setTab] = useState<Tab>('ledger');
  // A dot on the Ledger tab from the moment the surveillance records are released until he looks at them.
  const [seenLayer2, setSeenLayer2] = useState(view.ledger.layer2);
  const fresh = view.ledger.layer2 && !seenLayer2;
  const pick = (t: Tab) => {
    setTab(t);
    if (t === 'ledger' && view.ledger.layer2) setSeenLayer2(true);
  };
  return (
    <>
      <div className="tabs" role="tablist">
        {(['ledger', 'archive'] as Tab[]).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} className={`${tab === t ? 'active' : ''} ${t === 'ledger' && fresh ? 'fresh' : ''}`} onClick={() => pick(t)}>
            {t}
            {t === 'ledger' && fresh ? <span className="fresh-dot" aria-label="new section" /> : null}
          </button>
        ))}
      </div>
      {/* Both stay mounted so flipping tabs keeps his query and his open files. */}
      <div hidden={tab !== 'ledger'}>
        <Ledger view={view} active={tab === 'ledger'} onSeenLayer2={() => setSeenLayer2(true)} />
      </div>
      <div hidden={tab !== 'archive'}>
        <Archive key={view.archive.epoch} view={view} feed={feed} busy={busy} active={tab === 'archive'} resync={resync} />
      </div>
    </>
  );
}
