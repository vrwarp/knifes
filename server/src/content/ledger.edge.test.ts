import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../defaultConfig.js';
import { DEFAULT_LEDGER, findEntries, formatEntry, formatHits, incidentLine, ledgerMinutes, ledgerRange, parseWindow, personnelEntries, searchLedger, surveillanceEntries, type SearchHit } from './ledger.js';

const L2 = { 1: false, 2: true } as const;
const BOTH = { 1: true, 2: true } as const;
const agent = (id: string) => DEFAULT_LEDGER.agents.find((a) => a.id === id)!;

describe('ledger times', () => {
  it.each([
    ['6:00 PM', 0],
    ['11:59 PM', 359],
    ['12:00 AM', 360],
    ['12:03 AM', 363],
    ['1:00 AM', 420],
    ['2:14 AM', 494],
    ['2:14 am', 494],
    ['2:14AM', 494],
    ['02:14 AM', 494],
    ['4:00 AM', 600],
    ['10:46 PM', 286],
    ['Badge at 2:11 AM, in', 491],
    ['2:00–2:30 AM', 480],
    ['2:00-2:30 AM', 480],
  ])('%s is %i minutes after 6 PM', (t, m) => expect(ledgerMinutes(t)).toBe(m));
  it.each(['2:14', 'late', '', '2 AM', '14:00', 'AM'])('"%s" is not a ledger time', (t) => expect(ledgerMinutes(t)).toBeNull());
  it('reads a span, and a span that ends before it starts as a moment', () => {
    expect(ledgerRange('2:00–2:30 AM')).toEqual([480, 510]);
    expect(ledgerRange('11:50 PM–12:10 AM')).toEqual([350, 370]);
    expect(ledgerRange('2:30–2:00 AM')).toEqual([510, 510]);
    expect(ledgerRange('2:14 AM')).toEqual([494, 494]);
    expect(ledgerRange('soon')).toBeNull();
  });
  // Minutes after 6 PM. A bare time is the night of the murder: "at 11" is 11 PM, "at 12" midnight, "at 2" 2 AM.
  it.each([
    ['2', 480],
    ['2 am', 480],
    ['2 PM', -240],
    ['14', -240],
    ['0', 360],
    ['12', 360],
    ['12:15', 375],
    ['12 AM', 360],
    ['12 PM', -360],
    ['11', 300],
    ['11:30', 330],
    ['10', 240],
    ['9:45', 225],
    ['6', 0],
    ['5', 660],
    ['4:59', 659],
    ['1', 420],
    ['13', -300],
    ['23', 300],
    ['22:30', 270],
    ['2:14pm', ledgerMinutes('2:14 PM')],
    ['  2:14  ', 494],
  ])('the ARCHIVE window "%s" is %i', (s, m) => expect(parseWindow(s)).toBe(m));
  it.each([undefined, '', '24', '99', 'noon', 'two', '2::14', '2:60', '11:99'])('the ARCHIVE window "%s" is not a time', (s) => expect(parseWindow(s)).toBeNull());
});

describe('searching the Ledger', () => {
  it('finds an agent by any part of the name, the id, or a prefix of a name', () => {
    const p = personnelEntries(DEFAULT_LEDGER);
    expect(findEntries(p, 'nin').map((e) => e.id)).toEqual(['S30-003']);
    expect(findEntries(p, 'CALDER').map((e) => e.id)).toEqual(['S30-003']);
    expect(findEntries(p, 's30-005').map((e) => e.id)).toEqual(['S30-005']);
    expect(findEntries(p, '  ')).toHaveLength(5);
    expect(findEntries(p, undefined)).toHaveLength(5);
    expect(findEntries(p, 'zzz')).toEqual([]);
  });
  it('widens a place to the records that belong to it', () => {
    const safehouse = searchLedger(DEFAULT_LEDGER, { text: 'safehouse', from: '1:30 AM', to: '2:30 AM', layers: L2 });
    expect(safehouse.some((h) => h.who === 'S30-003' && /Director's Office/.test(h.text))).toBe(true);
    const server = searchLedger(DEFAULT_LEDGER, { text: 'server', layers: L2 });
    expect(server.some((h) => /node/.test(h.text))).toBe(true);
    const perimeter = searchLedger(DEFAULT_LEDGER, { text: 'perimeter', layers: L2 });
    expect(perimeter.some((h) => /fence/.test(h.text))).toBe(true);
  });
  it('matches any of the words, ignores filler and quotes, and returns everything for no words', () => {
    const any = searchLedger(DEFAULT_LEDGER, { text: '"USB", radio', layers: L2 });
    expect(any.some((h) => /USB/.test(h.text))).toBe(true);
    expect(any.some((h) => /Radio/.test(h.text))).toBe(true);
    const filler = searchLedger(DEFAULT_LEDGER, { text: 'the and of at in to any all', from: '2:00 AM', to: '2:30 AM', layers: L2 });
    const window = searchLedger(DEFAULT_LEDGER, { from: '2:00 AM', to: '2:30 AM', layers: L2 });
    expect(filler).toEqual(window);
    expect(window.length).toBeGreaterThan(10);
  });
  it('keeps the window inclusive at both ends and sorted by time', () => {
    const hits = searchLedger(DEFAULT_LEDGER, { from: '2:14 AM', to: '2:14 AM', layers: L2 });
    expect(hits.map((h) => `${h.who} ${h.time}`)).toEqual(['S30-003 2:14 AM']);
    const all = searchLedger(DEFAULT_LEDGER, { layers: BOTH, text: 'badge' });
    const times = all.filter((h) => h.layer === 2).map((h) => ledgerMinutes(h.time)!);
    expect([...times].sort((a, b) => a - b)).toEqual(times);
  });
  it('answers nothing with both layers closed', () => {
    expect(searchLedger(DEFAULT_LEDGER, { text: 'badge', layers: { 1: false, 2: false } })).toEqual([]);
  });
  it('a window never draws on the personnel files, which have no times', () => {
    expect(searchLedger(DEFAULT_LEDGER, { from: '1 AM', text: 'keycard', layers: { 1: true, 2: false } })).toEqual([]);
    expect(searchLedger(DEFAULT_LEDGER, { text: 'keycard', layers: { 1: true, 2: false } }).every((h) => h.time === 'file')).toBe(true);
  });
  it('formats hits for a narrow screen and says how many more there are', () => {
    const hits = searchLedger(DEFAULT_LEDGER, { layers: L2 });
    const text = formatHits(hits, 5);
    expect(text.split('\n')).toHaveLength(6);
    expect(text).toMatch(/\[\d+ more records\. Narrow the query\.\]$/);
    expect(formatHits([] as SearchHit[])).toBe('No records match.');
  });
  it('formats each file the way the ARCHIVE reads it out', () => {
    const p = formatEntry(personnelEntries(DEFAULT_LEDGER)[2], 1);
    expect(p.split('\n')[0]).toBe('S30-003 :: Nina Calder :: Intelligence Analyst');
    expect(p).toContain('Profile: ');
    const s = formatEntry(surveillanceEntries(DEFAULT_LEDGER)[2], 2);
    expect(s).toContain('Recorded activity:\n10:31 PM Badge: archives B1, in.');
    expect(s).toContain('Recovered evidence: Leather-bound notebook; Encrypted flash drive; Silver letter opener; Photograph of her brother');
    expect(incidentLine(DEFAULT_LEDGER)).toBe("Incident: Murder of Arthur Pendelton. Confirmed time of death 2:14 AM. Location: Director's Office, secure safehouse. Found 4:15 AM, by duty officer Hale on the hourly round.");
  });
});

describe('the story the records tell', () => {
  it('supports every word of the canon the hint copilot steers towards', () => {
    const nina = agent('S30-003');
    expect(nina.name).toBe('Nina Calder');
    expect(DEFAULT_LEDGER.incident.timeOfDeath).toBe('2:14 AM');
    expect(DEFAULT_LEDGER.incident.location).toMatch(/Director's Office/);
    expect(nina.log.find((l) => l.time === '2:11 AM')?.text).toMatch(/Director's Office, in/);
    expect(nina.log.find((l) => l.time === '2:14 AM')?.text).toMatch(/inside the office/);
    expect(nina.log.find((l) => l.time === '2:19 AM')?.text).toMatch(/Director's Office, out/);
    expect(nina.evidence).toContain('Silver letter opener');
    expect(nina.findings).toMatch(/syndicate/);
    expect(nina.findings).toMatch(/hard copy/);
  });
  it('gives each innocent agent the one unrelated secret the briefs build on, at its time', () => {
    expect(agent('S30-001').log.find((l) => l.time === '2:09 AM')?.text).toMatch(/PF-0412/);
    expect(agent('S30-002').log.find((l) => l.time === '2:17 AM')?.text).toMatch(/USB/);
    expect(agent('S30-004').log.find((l) => l.time === '1:47 AM')?.text).toMatch(/storage facility/);
    expect(agent('S30-005').log.find((l) => l.time === '2:11 AM')?.text).toMatch(/meeting/);
  });
  it('places every other agent somewhere recorded, away from the office, at 2:14', () => {
    const near = (id: string) => agent(id).log.filter((l) => Math.abs(ledgerMinutes(l.time)! - 494) <= 6);
    for (const id of ['S30-001', 'S30-002', 'S30-004', 'S30-005']) {
      const lines = near(id);
      expect(lines.length, id).toBeGreaterThan(0);
      expect(lines.some((l) => /Director's Office/.test(l.text)), id).toBe(false);
    }
  });
  it('arms only the killer with the weapon, and never mentions the poison of the first draft', () => {
    const owners = DEFAULT_LEDGER.agents.filter((a) => a.evidence.some((e) => /letter opener/i.test(e))).map((a) => a.id);
    expect(owners).toEqual(['S30-003']);
    expect(JSON.stringify(DEFAULT_CONFIG).toLowerCase()).not.toContain('poison');
  });
  it('the index fragments name no suspect', () => {
    const text = JSON.stringify(DEFAULT_LEDGER.fragments).toLowerCase();
    for (const a of DEFAULT_LEDGER.agents) for (const part of a.name.toLowerCase().split(' ')) expect(text).not.toContain(part);
  });
  it('the personnel files give no time, so the night comes only from the actors', () => {
    for (const e of personnelEntries(DEFAULT_LEDGER)) expect(JSON.stringify(e)).not.toMatch(/\d{1,2}:\d{2}\s*(AM|PM)/i);
  });
  it('every recorded time reads as a clock time between 10 PM and 4:30 AM, so the window search can place it', () => {
    for (const a of DEFAULT_LEDGER.agents) for (const l of a.log) {
      const m = ledgerMinutes(l.time);
      expect(m, `${a.id} ${l.time}`).not.toBeNull();
      expect(m!).toBeGreaterThanOrEqual(4 * 60);
      expect(m!).toBeLessThanOrEqual(10 * 60 + 30);
    }
  });
});
