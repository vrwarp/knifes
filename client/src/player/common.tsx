import { useEffect, useState, type ReactNode } from 'react';

/** Reveals text a few characters at a time. Tap to show everything at once. */
export function Typewriter({ text, speed = 2, className = '' }: { text: string; speed?: number; className?: string }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    setN(0);
    let i = 0;
    const timer = window.setInterval(() => {
      i += speed;
      setN(i);
      if (i >= text.length) window.clearInterval(timer);
    }, 24);
    return () => window.clearInterval(timer);
  }, [text, speed]);
  const done = n >= text.length;
  return (
    <pre className={`typed ${done ? '' : 'cursor'} ${className}`} onClick={() => setN(text.length)}>
      {text.slice(0, n)}
    </pre>
  );
}

export function Frame({ title, children, className = '' }: { title?: string; children: ReactNode; className?: string }) {
  return (
    <section className={`frame ${className}`}>
      {title ? <h1>{title}</h1> : null}
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
