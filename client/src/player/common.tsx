import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

export const reduceMotion = (): boolean =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Reveals text a few characters at a time. Tap to show everything at once. Honors reduced motion. */
export function Typewriter({
  text,
  speed = 2,
  className = '',
  onDone,
  onProgress,
}: {
  text: string;
  speed?: number;
  className?: string;
  onDone?: () => void;
  onProgress?: () => void;
}) {
  const [n, setN] = useState(() => (reduceMotion() ? text.length : 0));
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  const onProgressRef = useRef(onProgress);
  onProgressRef.current = onProgress;
  const fired = useRef(false);
  const timer = useRef<number | null>(null);
  const stop = () => {
    if (timer.current !== null) {
      window.clearInterval(timer.current);
      timer.current = null;
    }
  };
  useEffect(() => {
    fired.current = false;
    if (reduceMotion()) {
      setN(text.length);
      return;
    }
    setN(0);
    let i = 0;
    timer.current = window.setInterval(() => {
      i += speed;
      const next = Math.min(i, text.length);
      setN((c) => Math.max(c, next));
      onProgressRef.current?.();
      if (i >= text.length) stop();
    }, 24);
    return stop;
  }, [text, speed]);
  const done = n >= text.length;
  useEffect(() => {
    if (done && !fired.current) {
      fired.current = true;
      onDoneRef.current?.();
    }
  }, [done]);
  const skip = () => {
    stop();
    setN(text.length);
  };
  return (
    <div className="typed-stack" onClick={skip}>
      <pre className={`typed ghost ${className}`} aria-hidden="true">
        {text}
      </pre>
      <pre className={`typed ${done ? '' : 'cursor'} ${className}`}>{text.slice(0, n)}</pre>
    </div>
  );
}

/** Once the typewriter finishes, bring the element (usually the CTA) into view below the fold. */
export function useScrollWhenDone<T extends HTMLElement>(done: boolean) {
  const ref = useRef<T | null>(null);
  // Already done on first render means nothing was typed (reduced motion): leave the page at the top.
  const skip = useRef(done);
  useEffect(() => {
    if (!done || skip.current) return;
    const id = window.setTimeout(() => {
      ref.current?.scrollIntoView({ block: 'nearest', behavior: reduceMotion() ? 'auto' : 'smooth' });
    }, 50);
    return () => window.clearTimeout(id);
  }, [done]);
  return ref;
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
