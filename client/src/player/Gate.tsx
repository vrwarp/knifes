import { useState } from 'react';
import { api, errorText } from '../api';
import { fill } from '../types';
import type { StageProps } from './PlayerApp';
import { Frame, Typewriter } from './common';
import { Keyboard, PromptLine } from './Keyboard';

const MAX = 16;

export function Gate({ view }: StageProps) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [rejected, setRejected] = useState(false);
  const [shaking, setShaking] = useState(false);
  const ok = view.gate.passed;
  const t = view.text.gate;
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    if (!code.trim() || busy) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await api<{ ok: boolean }>('/api/player/gate', { json: { code } });
      if (!r.ok) {
        setRejected(true);
        setShaking(true);
        window.setTimeout(() => setShaking(false), 500);
      }
    } catch (e2) {
      setErr(errorText(e2));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Frame kicker={t.kicker} title={t.title} className={`console ${!ok ? 'with-keyboard' : ''} ${ok ? 'success' : ''}`}>
      <Typewriter text={view.gate.prompt} speed={3} />
      {ok ? (
        <div className="con-line sys result green" role="status">
          <span className="prompt">$</span> {view.gate.successText}
        </div>
      ) : (
        <>
          <div className="con-line cmd" aria-hidden="true">
            <span className="prompt">$</span> {t.command}
          </div>
          <div className="transcript">
            <PromptLine value={code} maxLength={Math.max(8, code.length)} label={t.keyLabel} shake={shaking} />
          </div>
          {rejected ? (
            <div className="con-line sys" role="alert">
              <span className="red">!</span> {t.rejected}
            </div>
          ) : null}
          {view.gate.attempts ? <div className="con-line sys">{fill(t.attempts, { n: view.gate.attempts })}</div> : null}
          <Keyboard
            value={code}
            onChange={(v) => {
              setCode(v);
              setRejected(false);
            }}
            onEnter={() => void submit()}
            maxLength={MAX}
            digits
            canEnter={code.trim().length > 0}
            disabled={busy}
            enterLabel={t.submit}
            status={
              <>
                <span>{t.statusLeft}</span>
                <span className="filler-mid">{t.statusMid}</span>
                <span className="filler-right">
                  {code.length}
                  <i className="caret" />
                </span>
              </>
            }
          />
        </>
      )}
      {err ? <div className="error">{err}</div> : null}
    </Frame>
  );
}
