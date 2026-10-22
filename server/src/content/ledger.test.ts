import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../defaultConfig.js';
import { mockArchiveReply } from '../ai/archive.js';
import { initialState } from '../game/state.js';
import { DEFAULT_LEDGER, ledgerMinutes, ledgerRange, parseWindow, personnelEntries, searchLedger as search, surveillanceEntries } from './ledger.js';

const LAYER_01 = personnelEntries(DEFAULT_LEDGER);
const LAYER_02 = surveillanceEntries(DEFAULT_LEDGER);
const searchLedger = (opts: Parameters<typeof search>[1]) => search(DEFAULT_LEDGER, opts);

const both = { 1: true, 2: true } as const;
const l1 = { 1: true, 2: false } as const;

describe('ledger content', () => {
  it('has five agents in each file with the same ids: personnel files, then a full night of surveillance records', () => {
    expect(LAYER_01.map((e) => e.id)).toEqual(LAYER_02.map((e) => e.id));
    for (const e of LAYER_01) {
      expect(e.log ?? []).toEqual([]);
      expect(e.facts?.length).toBe(2);
      expect(JSON.stringify(e)).not.toMatch(/\b\d{1,2}:\d{2}\s*(AM|PM)/);
    }
    for (const e of LAYER_02) {
      expect(e.log!.length).toBeGreaterThanOrEqual(10);
      expect(ledgerMinutes(e.log![0].time)!).toBeGreaterThanOrEqual(4 * 60);
      expect(e.evidence).toHaveLength(4);
    }
  });
  it('keeps every surveillance log in time order from 10 PM to 4 AM', () => {
    for (const e of LAYER_02) {
      const mins = e.log!.map((l) => ledgerMinutes(l.time)!);
      expect(mins.every((m) => m !== null && m >= -5 && m <= 10 * 60 + 30)).toBe(true);
      expect([...mins].sort((a, b) => a - b)).toEqual(mins);
    }
  });
  it('gives only the killer a line at the exact time of death; the others are a few minutes off', () => {
    const at = LAYER_02.filter((e) => e.log!.some((l) => l.time === '2:14 AM')).map((e) => e.id);
    expect(at).toEqual(['S30-003']);
    for (const e of LAYER_02) expect(e.log!.some((l) => Math.abs(ledgerMinutes(l.time)! - (8 * 60 + 14)) <= 3)).toBe(true);
  });
  it('puts exactly one agent inside the Director’s Office at the time of death, with innocent traces nearby', () => {
    const hits = searchLedger({ from: '2:00 AM', to: '2:30 AM', text: 'safehouse office inner door', layers: { 1: false, 2: true } });
    const who = new Set(hits.map((h) => h.who));
    expect(who.has('S30-003')).toBe(true);
    expect(who.has('S30-004')).toBe(true);
    expect(hits.filter((h) => /Director's Office, in/.test(h.text)).map((h) => h.who)).toEqual(['S30-003']);
  });
  it('never says who did it in either layer', () => {
    const text = JSON.stringify([LAYER_01, LAYER_02]).toLowerCase();
    for (const w of ['killer', 'murder', 'stabbed', 'guilty', 'suspect']) expect(text).not.toContain(w);
  });
});

describe('time parsing', () => {
  it('maps the evening onto one axis', () => {
    expect(ledgerMinutes('6:00 PM')).toBe(0);
    expect(ledgerMinutes('12:00 AM')).toBe(6 * 60);
    expect(ledgerMinutes('2:14 AM')).toBe(8 * 60 + 14);
    expect(ledgerRange('2:00–2:30 AM')).toEqual([8 * 60, 8 * 60 + 30]);
    expect(ledgerMinutes('later')).toBeNull();
  });
  it('reads the ARCHIVE’s window bounds in several spellings', () => {
    expect(parseWindow('2:14')).toBe(8 * 60 + 14);
    expect(parseWindow('02:14')).toBe(8 * 60 + 14);
    expect(parseWindow('2:14 AM')).toBe(8 * 60 + 14);
    expect(parseWindow('23:00')).toBe(5 * 60);
    expect(parseWindow('11 PM')).toBe(5 * 60);
    expect(parseWindow('')).toBeNull();
  });
});

describe('searchLedger', () => {
  it('filters by agent, window and words, and a range overlaps the window', () => {
    const theo = searchLedger({ who: 'theo', from: '1:30 AM', to: '2:30 AM', layers: both });
    expect(theo.every((h) => h.who === 'S30-004' && h.layer === 2)).toBe(true);
    expect(theo.some((h) => h.text.includes('storage facility'))).toBe(true);
    // The personnel files answer word searches from the personnel fields, never a time window.
    const keycard = searchLedger({ text: 'keycard', layers: l1 });
    expect(keycard.map((h) => h.who)).toEqual(expect.arrayContaining(['S30-001', 'S30-002']));
    expect(searchLedger({ from: '2:00 AM', to: '2:30 AM', layers: l1 })).toEqual([]);
    expect(searchLedger({ text: 'unicorn', layers: both })).toEqual([]);
  });
  it('has no duty officer in the surveillance records', () => {
    expect(searchLedger({ text: 'Hale', layers: both })).toEqual([]);
  });
});

describe('mock ARCHIVE', () => {
  const ctx = (layer2: boolean) => {
    const state = initialState();
    state.ledger.layer1 = true;
    state.ledger.layer2 = layer2;
    return { config: DEFAULT_CONFIG, state };
  };
  it('answers a window question from the open records and never admits hidden ones exist', () => {
    const before = mockArchiveReply('where was everyone at 2:14', ctx(false));
    expect(before).toContain('[NO RECORD]');
    expect(before).not.toMatch(/sealed|layer|surveillance|released/i);
    expect(before).not.toContain('L2 ');
    expect(mockArchiveReply('tell me about Nina Calder', ctx(false))).toContain('Intelligence Analyst');
    const after = mockArchiveReply('who was at the safehouse between 2:00 and 2:30', ctx(true));
    expect(after).toContain("L2 2:11 AM       Nina Calder: Badge: Director's Office, in.");
    expect(after).not.toContain('Duty log');
    expect(after).not.toContain('[NO RECORD]');
    const summary = mockArchiveReply('read the surveillance records', ctx(true));
    expect(summary).toContain('2:14 AM Confirmed inside the office.');
    expect(summary).toContain('2:12 AM Surveillance system recorded');
  });
  it('still refuses to conclude', () => {
    expect(mockArchiveReply('who is the killer', ctx(true))).toContain('records, not conclusions');
  });
  it('reads a time without AM or PM as that night, the way the detective types it', () => {
    // "at 11:18" is 11:18 PM, when Nina badged into the office; "12" is midnight, not noon.
    expect(mockArchiveReply('where was nina at 11:18', ctx(true))).toContain("L2 11:18 PM      Nina Calder: Badge: Director's Office, in.");
    const midnight = mockArchiveReply('what happened between 12 and 1', ctx(true));
    expect(midnight).toContain('12:02 AM');
    expect(midnight).toContain('12:51 AM');
    expect(midnight).not.toContain('No records match');
    expect(mockArchiveReply('who was moving between 11 and 12', ctx(true))).toMatch(/11:\d\d PM/);
    expect(mockArchiveReply('where was everyone at 2:14', ctx(true))).toContain('2:14 AM');
  });
});
