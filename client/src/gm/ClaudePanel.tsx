import { useCallback, useEffect, useState } from 'react';
import { api, errorText } from '../api';

type Account = { email?: string; organization?: string; subscriptionType?: string } | null;
type Status = {
  mode: 'live' | 'mock';
  forcedMock: boolean;
  credential: string;
  credentialLabel: string;
  shadowedByEnv: boolean;
  hasLoginFile: boolean;
  auth: 'ok' | 'needs_login' | 'unknown';
  inProgress: { id: string; url: string } | null;
  model: string;
  account?: Account;
};
type TestResult = { ok: boolean; reply?: string; error?: string; ms?: number };

/** Link the AI to a Claude subscription from the browser: open Claude's sign-in, paste the code back. */
export function ClaudePanel({ onChanged }: { onChanged: () => void }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [account, setAccount] = useState<Account | undefined>(undefined);
  const [pending, setPending] = useState<{ id: string; url: string } | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [test, setTest] = useState<TestResult | null>(null);

  const load = useCallback(async (withAccount = false) => {
    try {
      const s = await api<Status>(`/api/gm/claude${withAccount ? '?account=1' : ''}`);
      setStatus(s);
      setPending((p) => p ?? s.inProgress);
      if (withAccount) setAccount(s.account ?? null);
    } catch (e) {
      setMsg({ ok: false, text: errorText(e) });
    }
  }, []);
  useEffect(() => {
    void load(true);
  }, [load]);

  const start = async () => {
    setBusy('start');
    setMsg(null);
    setTest(null);
    try {
      const r = await api<{ id: string; url: string }>('/api/gm/claude/login/start', { method: 'POST', timeoutMs: 90_000 });
      setPending(r);
      setCode('');
    } catch (e) {
      setMsg({ ok: false, text: errorText(e) });
    } finally {
      setBusy(null);
    }
  };
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pending) return;
    setBusy('code');
    setMsg(null);
    try {
      const r = await api<{ ok: boolean; error?: string; account?: Account }>('/api/gm/claude/login/code', {
        json: { id: pending.id, code },
        timeoutMs: 150_000,
      });
      if (r.ok) {
        setPending(null);
        setCode('');
        setAccount(r.account ?? null);
        setMsg({ ok: true, text: `Linked${r.account?.email ? ` as ${r.account.email}` : ''}. The AI is live.` });
        onChanged();
      } else {
        setPending(null);
        setMsg({ ok: false, text: r.error ?? 'Sign-in failed. Start again.' });
      }
      await load();
    } catch (e2) {
      setMsg({ ok: false, text: errorText(e2) });
    } finally {
      setBusy(null);
    }
  };
  const cancel = async () => {
    setPending(null);
    setCode('');
    await api('/api/gm/claude/login/cancel', { method: 'POST' }).catch(() => undefined);
  };
  const signOut = async () => {
    if (!window.confirm('Sign this container out of Claude? The AI drops to mock mode until someone signs in again.')) return;
    setBusy('logout');
    try {
      await api('/api/gm/claude/logout', { method: 'POST' });
      setAccount(null);
      setTest(null);
      setMsg({ ok: true, text: 'Signed out. The AI is in mock mode.' });
      onChanged();
      await load();
    } catch (e) {
      setMsg({ ok: false, text: errorText(e) });
    } finally {
      setBusy(null);
    }
  };
  const runTest = async () => {
    setBusy('test');
    setTest(null);
    try {
      setTest(await api<TestResult>('/api/gm/claude/test', { method: 'POST', timeoutMs: 120_000 }));
    } catch (e) {
      setTest({ ok: false, error: errorText(e) });
    } finally {
      setBusy(null);
    }
  };

  if (!status) return null;
  const live = status.mode === 'live';
  const canWebSignIn = !status.shadowedByEnv;

  return (
    <div className="panel claude">
      <h2>Claude link</h2>
      <dl className="kv">
        <dt>AI</dt>
        <dd className={live ? 'green' : 'amber'}>{live ? `live · ${status.model}` : status.forcedMock ? 'mock (forced by AI_MODE)' : 'mock · not linked'}</dd>
        <dt>Credential</dt>
        <dd>{status.credential === 'none' ? 'none' : status.credentialLabel}</dd>
        {account?.email ? (
          <>
            <dt>Account</dt>
            <dd>
              {account.email}
              {account.subscriptionType ? ` · ${account.subscriptionType}` : ''}
            </dd>
          </>
        ) : null}
      </dl>

      {status.shadowedByEnv ? (
        <p className="small muted">This container gets its credential from its settings, which outrank a web sign-in. Clear that setting and restart to sign in here instead.</p>
      ) : null}

      {pending ? (
        <form className="stack claude-steps" onSubmit={submit}>
          <p className="small">
            <b>1.</b> Open Claude’s sign-in, approve access with the account that has the subscription.
          </p>
          <a className="btn primary block" href={pending.url} target="_blank" rel="noreferrer">
            Open Claude sign-in
          </a>
          <p className="small">
            <b>2.</b> Claude shows a code. Copy it and paste it here.
          </p>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Paste the code"
            aria-label="Claude sign-in code"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
          />
          <div className="row">
            <button className="btn primary" disabled={busy === 'code' || !code.trim()}>
              {busy === 'code' ? 'Linking' : 'Link Claude'}
            </button>
            <button type="button" className="btn ghost" onClick={() => void cancel()} disabled={busy === 'code'}>
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <div className="row" style={{ marginTop: 10 }}>
          {canWebSignIn ? (
            <button className={`btn small ${status.hasLoginFile ? '' : 'primary'}`} onClick={() => void start()} disabled={busy !== null}>
              {busy === 'start' ? 'Starting' : status.hasLoginFile ? 'Sign in again' : 'Sign in with Claude'}
            </button>
          ) : null}
          {live ? (
            <button className="btn small" onClick={() => void runTest()} disabled={busy !== null}>
              {busy === 'test' ? 'Testing' : 'Test connection'}
            </button>
          ) : null}
          {status.hasLoginFile && canWebSignIn ? (
            <button className="btn small ghost" onClick={() => void signOut()} disabled={busy !== null}>
              Sign out
            </button>
          ) : null}
        </div>
      )}

      {msg ? (
        <div className={`small ${msg.ok ? 'green' : 'red'}`} role={msg.ok ? 'status' : 'alert'} style={{ marginTop: 8 }}>
          {msg.text}
        </div>
      ) : null}
      {test ? (
        <div className={`small ${test.ok ? 'green' : 'red'}`} role="status" style={{ marginTop: 8 }}>
          {test.ok ? `Claude answered in ${((test.ms ?? 0) / 1000).toFixed(1)} s: “${test.reply}”` : `Test failed: ${test.error}`}
        </div>
      ) : null}
    </div>
  );
}
