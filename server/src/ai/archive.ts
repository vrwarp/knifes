import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import { findEntries, formatEntry, formatHits, incidentLine, ledgerMinutes, parseWindow, personnelEntries, searchLedger, surveillanceEntries } from '../content/ledger.js';
import type { GameConfig, GameState } from '../types.js';

export { ARCHIVE_SYSTEM_PROMPT } from '../content/prompts.js';

export interface ArchiveContext {
  config: GameConfig;
  state: GameState;
}


export function createArchiveServer(getCtx: () => ArchiveContext) {
  const ledger = () => getCtx().state.ledger;
  const content = () => getCtx().config.ledger.content;
  const notOnFile = () => getCtx().config.archive.notOnFile;

  const readPersonnel = tool(
    'read_personnel',
    'The Personnel Files: each agent’s id, name, position, service, posting and profile. Nothing about the night. Optionally filter by name or id.',
    { who: z.string().optional().describe('Agent name, part of a name, or Ledger id such as S30-003. Omit for all five.') },
    async (args) => {
      if (!ledger().layer1) return { content: [{ type: 'text', text: notOnFile() }] };
      const list = findEntries(personnelEntries(content()), args.who);
      if (!list.length) return { content: [{ type: 'text', text: 'No agent matches.' }] };
      return { content: [{ type: 'text', text: list.map((e) => formatEntry(e, 1)).join('\n\n') }] };
    },
    { annotations: { readOnlyHint: true } },
  );

  const readClassified = tool(
    'read_classified',
    'The Surveillance Records, once mounted: recorded activity per agent, the belongings confiscated from each, and additional findings. Returns [NO RECORD] while they are not mounted. Optionally filter by name or id.',
    { who: z.string().optional().describe('Agent name, part of a name, or Ledger id. Omit for all five.') },
    async (args) => {
      if (!ledger().layer2) return { content: [{ type: 'text', text: notOnFile() }] };
      const list = findEntries(surveillanceEntries(content()), args.who);
      if (!list.length) return { content: [{ type: 'text', text: 'No agent matches.' }] };
      const head = incidentLine(content());
      return { content: [{ type: 'text', text: [head, ...list.map((e) => formatEntry(e, 2))].join('\n\n') }] };
    },
    { annotations: { readOnlyHint: true } },
  );

  const searchActivity = tool(
    'search_activity',
    'Search the Ledger. Filter by agent, by a time window, and by free text (a place such as safehouse, archives, server room, perimeter, control room, mess; an object such as radio, pouch, keycard; an event type such as badge, camera, GPS). Layer 1 is the Personnel Files and answers word searches only; layer 2 is the Surveillance Records, timed, and returns [NO RECORD] until they are mounted. Times are 12-hour, e.g. 1:50 AM.',
    {
      who: z.string().optional().describe('Agent name or id; omit for everyone'),
      from: z.string().optional().describe('Start of window, e.g. 1:00 AM'),
      to: z.string().optional().describe('End of window, e.g. 2:30 AM'),
      text: z.string().optional().describe('Words to match in the record text: places, objects, event types. Any word matches.'),
      layer: z.enum(['1', '2', 'both']).optional().describe('Which layer to search; default both'),
    },
    async (args) => {
      const layer = args.layer ?? 'both';
      const l = ledger();
      const notices: string[] = [];
      if ((layer !== '2' && !l.layer1) || (layer !== '1' && !l.layer2)) notices.push(notOnFile());
      const hits = searchLedger(content(), { who: args.who, from: args.from, to: args.to, text: args.text, layers: { 1: layer !== '2' && l.layer1, 2: layer !== '1' && l.layer2 } });
      const body = hits.length || !notices.length ? formatHits(hits) : '';
      return { content: [{ type: 'text', text: [body, ...notices].filter(Boolean).join('\n') }] };
    },
    { annotations: { readOnlyHint: true } },
  );

  const ledgerLookup = tool(
    'ledger_lookup',
    'Look up a term in the surviving fragments of the Ledger index (Section 30, the Ledger and its hard copy, the Director, the failsafe, the syndicate, the layers).',
    { term: z.string().describe('Search term') },
    async (args) => {
      const q = args.term.toLowerCase();
      const hits = content().fragments.filter((f) => f.key.toLowerCase().includes(q) || f.text.toLowerCase().includes(q));
      const text = hits.length
        ? hits.map((f) => `[${f.key.toUpperCase()}] ${f.text}`).join('\n')
        : `[SEGMENT LOST] No surviving fragment matches "${args.term}".`;
      return { content: [{ type: 'text', text }] };
    },
    { annotations: { readOnlyHint: true } },
  );

  return createSdkMcpServer({
    name: 'archive',
    version: '2.0.0',
    alwaysLoad: true,
    tools: [readPersonnel, readClassified, searchActivity, ledgerLookup],
  });
}

export const ARCHIVE_ALLOWED_TOOLS = ['mcp__archive__*'];

/** Deterministic stand-in used when no API key is configured. Enough to rehearse the flow. */
/** The log line closest to a clock time, for the mock's one-line-per-agent summary. */
function nearestLine(log: { time: string; text: string }[], at: string): string {
  const t = ledgerMinutes(at);
  if (t === null) return '';
  let best: { time: string; text: string } | undefined;
  let gap = Infinity;
  for (const l of log) {
    const m = ledgerMinutes(l.time);
    if (m === null) continue;
    const d = Math.abs(m - t);
    if (d < gap) {
      gap = d;
      best = l;
    }
  }
  return best ? `${best.time} ${best.text}` : '';
}

export function mockArchiveReply(text: string, ctx: ArchiveContext): string {
  const q = text.toLowerCase();
  const l = ctx.state.ledger;
  const layer2Name = ctx.config.ledger.layer2Label;
  const c = ctx.config.ledger.content;
  const NOT_ON_FILE = ctx.config.archive.notOnFile;
  const INCIDENT = c.incident;
  const LAYER_01 = personnelEntries(c);
  const LAYER_02 = surveillanceEntries(c);
  // Whole words for alphabetic terms so "log" never matches "catalogue"; plain substring for tokens with digits or punctuation.
  const has = (...words: string[]) =>
    words.some((w) => (/^[a-z ]+$/.test(w) ? new RegExp(`\\b${w.replace(/ /g, '\\s+')}\\b`).test(q) : q.includes(w)));
  // Any part of the name: the GMs may give an agent one name, or three, or a stray double space.
  const nameParts = (name: string) => name.toLowerCase().split(/\s+/).filter(Boolean);
  const agent = LAYER_01.find((e) => nameParts(e.name).some((p) => q.includes(p)) || q.includes(e.id.toLowerCase()));
  const wantsL2 = has('classified', 'evidence', 'belongings', 'pockets', 'surveillance', 'cctv', 'camera', 'cameras', 'verified', 'recovered', 'layer 02', 'layer 2', 'confiscated', 'actually', 'really');
  // A window ("between 2:00 and 2:30", "at 2:14", "after 1 am") and any place or object words become a search.
  const times = [...q.replace(/layer 0?2|layer 0?1/g, '').matchAll(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/g)].map((m) => `${m[1]}:${m[2] ?? '00'}${m[3] ? ' ' + m[3] : ''}`);
  const placeWords = ['safehouse', 'office', 'archives', 'archive', 'server', 'perimeter', 'control room', 'mess', 'gym', 'armoury', 'gate', 'storage', 'radio', 'pouch', 'badge', 'camera', 'gps', 'terminal', 'residence', 'motor pool', 'fence'];
  const place = placeWords.filter((w) => has(w)).join(' ');

  if (has('who did', 'killer', 'murderer', 'who killed', 'guilty', 'who stabbed', 'who lied', 'lying')) {
    return `ARCHIVE holds records, not conclusions.\n${l.layer2 ? `The ${layer2Name} hold what the systems recorded.\nAsk for an agent, a place or a time.` : 'The personnel files hold who each agent is.\nWhere they were tonight is theirs to tell you.'}`;
  }
  if (has('time of death', 'when did he die', 'died', 'death')) {
    return l.layer2
      ? `Incident: ${INCIDENT.incident}.\nConfirmed time of death ${INCIDENT.timeOfDeath}.\nLocation: ${INCIDENT.location}.`
      : 'Director found 04:15, Director’s Office.\nNo confirmed time of death on file.';
  }
  if (agent && wantsL2) {
    if (!l.layer2) return NOT_ON_FILE;
    const e = LAYER_02.find((x) => x.id === agent.id)!;
    return `${e.id} ${e.name}. Recorded activity:\n${(e.log ?? []).map((x) => `${x.time} ${x.text}`).join('\n')}\nRecovered: ${e.evidence!.join(', ')}.\n${e.notes}`;
  }
  if (agent && !times.length && !place) {
    if (!l.layer1) return NOT_ON_FILE;
    return `${agent.id} ${agent.name}. ${agent.position}.\n${(agent.facts ?? []).map((f) => `${f.label}: ${f.value}`).join('\n')}\n${agent.notes}`;
  }
  if (wantsL2) {
    if (!l.layer2) return NOT_ON_FILE;
    return `${layer2Name} mounted. Confirmed time of death ${INCIDENT.timeOfDeath}, ${INCIDENT.location}.\n${LAYER_02.map((e) => `${e.id} ${e.name} :: ${nearestLine(e.log ?? [], INCIDENT.timeOfDeath)}`).join('\n')}\nAsk for an agent by name for the full record.`;
  }
  if (times.length || place) {
    let from: string | undefined = times[0];
    let to: string | undefined = times[1];
    if (times.length === 1 && has('at')) {
      const t = parseWindow(times[0]);
      from = to = times[0];
      if (t !== null) {
        // "at 2:14" reads as the ten minutes around it.
        const f = (m: number) => `${Math.floor(((m + 18 * 60) % (24 * 60)) / 60) % 12 || 12}:${String(m % 60).padStart(2, '0')} ${((m + 18 * 60) % (24 * 60)) / 60 >= 12 ? 'PM' : 'AM'}`;
        from = f(Math.max(0, t - 5));
        to = f(t + 5);
      }
    }
    if (times.length === 1 && has('after')) to = undefined;
    if (times.length === 1 && has('before')) {
      to = from;
      from = undefined;
    }
    const hits = searchLedger(c, { who: agent?.name, from, to, text: place, layers: { 1: l.layer1, 2: l.layer2 } });
    const notice = l.layer2 ? '' : `\n${NOT_ON_FILE}`;
    return `${formatHits(hits, 24)}${notice}`;
  }
  if (has('log', 'logs', 'activity', 'where was', 'where were', 'office', 'who was', 'alibi', 'alibis', 'timeline', 'movements')) {
    if (!l.layer2) return NOT_ON_FILE;
    return `${formatHits(searchLedger(c, { from: '1:30 AM', to: '2:45 AM', layers: { 1: false, 2: true } }), 24)}\n[SEGMENT INTACT] Narrow by agent, place or window.`;
  }
  if (has('agents', 'everyone', 'personnel', 'suspects', 'dossier', 'dossiers', 'who is held', 'list')) {
    if (!l.layer1) return NOT_ON_FILE;
    return `Personnel files, five agents held at headquarters:\n${LAYER_01.map((e) => `${e.id} ${e.name} :: ${e.position}`).join('\n')}`;
  }
  for (const f of c.fragments) {
    if (q.includes(f.key.toLowerCase())) return `[${f.key.toUpperCase()}] ${f.text}`;
  }
  return `Query parsed. No partition answers it directly.\nI hold the personnel files${l.layer2 ? ` and the ${layer2Name}` : ''}.\nName an agent${l.layer2 ? ', a place or a time' : ''}.`;
}
