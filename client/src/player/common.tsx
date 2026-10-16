import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

export const reduceMotion = (): boolean =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Reveals text a few characters at a time. Tap to show everything at once. Honors reduced motion. */
export function Typewriter({ text, speed = 2, className = '', onDone }: { text: string; speed?: number; className?: string; onDone?: () => void }) {
  const [n, setN] = useState(() => (reduceMotion() ? text.length : 0));
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  const fired = useRef(false);
  useEffect(() => {
    fired.current = false;
    if (reduceMotion()) {
      setN(text.length);
      return;
    }
    setN(0);
    let i = 0;
    const timer = window.setInterval(() => {
      i += speed;
      setN(Math.min(i, text.length));
      if (i >= text.length) window.clearInterval(timer);
    }, 24);
    return () => window.clearInterval(timer);
  }, [text, speed]);
  const done = n >= text.length;
  useEffect(() => {
    if (done && !fired.current) {
      fired.current = true;
      onDoneRef.current?.();
    }
  }, [done]);
  return (
    <pre className={`typed ${done ? '' : 'cursor'} ${className}`} onClick={() => setN(text.length)}>
      {text.slice(0, n)}
    </pre>
  );
}

/** [done, onDone] for gating a button behind a Typewriter. */
export function useTyped(): [boolean, () => void] {
  const [done, setDone] = useState(() => reduceMotion());
  const onDone = useCallback(() => setDone(true), []);
  return [done, onDone];
}

export function SkipHint({ done }: { done: boolean }) {
  return <div className="skip-hint">{done ? '' : 'tap the text to skip'}</div>;
}

export function Frame({
  title,
  kicker,
  titleClassName = '',
  children,
  className = '',
}: {
  title?: string;
  kicker?: string;
  titleClassName?: string;
  children: ReactNode;
  className?: string;
}) {
  let k = kicker;
  let t = title;
  if (t && !k && t.includes(' // ')) {
    const i = t.indexOf(' // ');
    k = t.slice(0, i);
    t = t.slice(i + 4);
  }
  return (
    <section className={`frame ${className}`}>
      {k ? <div className="kicker">{k}</div> : null}
      {t ? <h1 className={titleClassName}>{t}</h1> : null}
      {children}
    </section>
  );
}

export function Countdown({ until, onDone }: { until: number; onDone: () => void }) {
  const [left, setLeft] = useState(Math.max(0, until - Date.now()));
  useEffect(() => {
    const t = window.setInterval(() => {
      const l = Math.max(0, until - Date.now());
      setLeft(l);
      if (l === 0) {
        window.clearInterval(t);
        onDone();
      }
    }, 250);
    return () => window.clearInterval(t);
  }, [until, onDone]);
  return <span className="amber">{Math.ceil(left / 1000)}s</span>;
}

export function formatDistance(m: number): string {
  if (m < 1000) return `${Math.round(m)} m`;
  return `${(m / 1000).toFixed(m < 10_000 ? 1 : 0)} km`;
}

export function clock(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit' });
}
