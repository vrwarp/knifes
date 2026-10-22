import { useCallback, useEffect, type ReactNode } from 'react';

const LETTER_ROWS = ['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM'];
const DIGIT_ROW = '1234567890';

export interface KeyboardProps {
  /** The text typed so far; the keyboard appends, deletes and submits it. */
  value: string;
  onChange: (next: string) => void;
  onEnter: () => void;
  maxLength: number;
  /** Add a 1234567890 row above the letters, for codes and passcodes. */
  digits?: boolean;
  /** Whether ENTER is allowed right now (length reached, nothing in flight). */
  canEnter: boolean;
  /** Greys every key, for example while a request is in flight. */
  disabled?: boolean;
  /** Blocks hardware and on-screen keys without greying them, for example under a dialog. */
  paused?: boolean;
  /** Accessible name of the ENTER key, which tests and screen readers use to submit. */
  enterLabel: string;
  /** Contents of the dead key in the space-bar slot: a status line in the console's voice. */
  status: ReactNode;
  /** Fixed to the bottom of the screen (the race) or flowing with the page (inside a file). */
  fixed?: boolean;
  /** Also take key presses from a hardware keyboard. One keyboard per page should do this. */
  hardware?: boolean;
}

/** The console's on-screen keyboard: uniform keys, backspace flush right, ENTER beneath it. */
export function Keyboard({ value, onChange, onEnter, maxLength, digits = false, canEnter, disabled = false, paused = false, enterLabel, status, fixed = true, hardware = true }: KeyboardProps) {
  const allowed = digits ? /^[A-Z0-9]$/ : /^[A-Z]$/;
  const press = useCallback(
    (key: string) => {
      if (disabled || paused) return;
      if (key === 'ENTER') {
        if (canEnter) onEnter();
      } else if (key === 'BACK') onChange(value.slice(0, -1));
      else if (allowed.test(key) && value.length < maxLength) onChange(value + key);
    },
    [disabled, paused, canEnter, onEnter, onChange, value, maxLength, allowed],
  );

  useEffect(() => {
    if (!hardware) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || paused) return;
      // A dialog over the screen (a transmission, the list of them) owns the keys: Enter there presses its
      // button, and nothing typed lands in the field hidden behind it.
      if (document.querySelector('[aria-modal="true"]')) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      if (e.key === 'Enter') press('ENTER');
      else if (e.key === 'Backspace') press('BACK');
      else if (/^[a-zA-Z0-9]$/.test(e.key)) press(e.key.toUpperCase());
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [hardware, paused, press]);

  const rows = digits ? [DIGIT_ROW, ...LETTER_ROWS] : LETTER_ROWS;
  const last = rows.length - 1;
  return (
    <div className={`keyboard ${fixed ? 'fixed' : 'inline'}`} role="group" aria-label="Keyboard">
      <div className="keyboard-inner">
        {rows.map((row, r) => (
          <div className="krow" key={row}>
            {r === last ? <div className="key wide spacer" aria-hidden="true" /> : null}
            {row.split('').map((k) => (
              <button type="button" key={k} className="key" onClick={() => press(k)} disabled={disabled} aria-label={k}>
                {k}
              </button>
            ))}
            {r === last ? (
              <button type="button" className="key wide back" onClick={() => press('BACK')} disabled={disabled || !value} aria-label="Delete letter">
                ⌫
              </button>
            ) : null}
          </div>
        ))}
        <div className="krow">
          <div className="key filler" aria-hidden="true">
            {status}
          </div>
          <button type="button" className="key wide enter" onClick={() => press('ENTER')} disabled={disabled || !canEnter} aria-label={enterLabel}>
            ENTER
          </button>
        </div>
      </div>
    </div>
  );
}

/** The letters typed so far, then a block cursor on the insertion point, then the empty slots after it. */
export function PromptSlots({ value, maxLength }: { value: string; maxLength: number }) {
  const slots = Math.max(maxLength, value.length);
  const cells: ReactNode[] = [];
  for (let j = 0; j < slots; j++) {
    if (j < value.length)
      cells.push(
        <span key={j} className="typed">
          {value[j]}
        </span>,
      );
    else if (j === value.length) cells.push(<i key={j} className="caret cell" aria-hidden="true" />);
    else
      cells.push(
        <span key={j} className="slot">
          _
        </span>,
      );
  }
  // The code fills every slot: the cursor waits after the last letter.
  if (value.length >= slots) cells.push(<i key="end" className="caret cell" aria-hidden="true" />);
  return <>{cells}</>;
}

/** The prompt line a console shows while a code is being typed: `> MAGEN|____` with the cursor on the next slot. */
export function PromptLine({ value, maxLength, label, shake = false }: { value: string; maxLength: number; label: string; shake?: boolean }) {
  return (
    <div className={`tl you prompt-line ${shake ? 'shake' : ''}`} role="img" aria-label={label}>
      <span className="tl-n prompt">{'>'}</span>
      <span className="tl-word typing">
        <PromptSlots value={value} maxLength={maxLength} />
      </span>
    </div>
  );
}
