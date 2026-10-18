/**
 * The setup assistant: Opus helping the organizers (not the player) get the game ready.
 * It reads the live configuration, the case files and the uploaded photos, runs the
 * readiness check, and proposes edits. It never edits anything itself: a proposal is
 * applied only when a GM presses Apply, and that appends a new configuration version.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import { ACCESS_LOG, CAMERA_NOTES, LEDGER_FRAGMENTS, MANIFEST, PENDELTON_NOTE, TOXICOLOGY_REPORT } from '../content/evidence.js';
import type { ConfigVersionMeta, Proposal, ProposalChange } from '../db.js';
import { env } from '../env.js';
import type { ReadinessItem } from '../service.js';
import type { GameConfig } from '../types.js';

export const SETUP_SYSTEM_PROMPT = `You are the setup assistant for "Section 30: The Director's Last File", a surprise murder-mystery party for Jimmy's 30th birthday on October 25. You talk with the game masters (Faith, Benji and Victor), never with Jimmy, so you may discuss the solution, the codes and the mechanics openly.

How the night runs: Jimmy scans a QR code at a deli, solves a location puzzle from field photos, phones a friend (Phil) for the code-gate key, cracks a seven-letter word puzzle against an AI opponent, reads the incident record, and is sent home to dinner where the suspects are gathered. There he works the evidence vault, questions the ARCHIVE terminal (an in-world AI), and submits a free-text master deduction. The GMs watch a live console and push hints.

Your job:
1. Find what is missing or risky. Start with readiness_check whenever someone asks what is left to do.
2. Ideate: clues, red herrings, hint wording at different strengths, puzzle words, flavour text, printable props (the drop-point card, dossiers, the director's note), and how to stage things on the night. Keep everything consistent with the case files and the configured solution; call get_case_files and get_config before inventing details.
3. Propose edits with propose_changes. Each change is a dotted path into the configuration (for example gate.code, geo.radiusMeters, hints.quick.investigation, deduction.slots.1.accept) and the complete new value for that path. Read get_config first so paths and value shapes are right. A proposal is not applied until a GM presses Apply; say so, and never claim a change is live.
4. Photos: you can look at uploaded photos with view_photo and judge whether they make the location puzzle too easy, too hard or unreadable on a phone. You cannot create images. When a picture is needed, describe exactly what to photograph or print instead.

Style: plain, direct, practical. Short paragraphs or tight lists. Lead with the answer. When you propose something, say in one line what it changes and why.`;

export const SETUP_ALLOWED_TOOLS = ['mcp__setup__*'];

export interface SetupContext {
  config: () => GameConfig;
  readiness: () => ReadinessItem[];
  history: () => ConfigVersionMeta[];
  propose: (summary: string, changes: ProposalChange[]) => Proposal;
}

const text = (t: string) => ({ content: [{ type: 'text' as const, text: t }] });

export function caseFilesText(): string {
  const log = ACCESS_LOG.map((r) => `${r.time} ${r.badge} ${r.name} ${r.door ? `${r.door} :: ` : ''}${r.event}`).join('\n');
  const dossiers = MANIFEST.map((d) => `${d.codename} (${d.badge}), ${d.role}, clearance ${d.clearance}. ${d.relationship} ${d.publicNotes}`).join('\n');
  const ledger = Object.entries(LEDGER_FRAGMENTS)
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n');
  return [
    '## Access log',
    log,
    '## Camera notes',
    CAMERA_NOTES.join('\n'),
    '## Toxicology',
    TOXICOLOGY_REPORT,
    '## Operative manifest',
    dossiers,
    "## Director's note",
    PENDELTON_NOTE,
    '## Ledger fragments',
    ledger,
  ].join('\n\n');
}

const MIME: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };

export function createSetupServer(ctx: SetupContext) {
  return createSdkMcpServer({
    name: 'setup',
    version: '1.0.0',
    alwaysLoad: true,
    tools: [
      tool('get_config', 'The live game configuration as JSON: every text, code, puzzle setting, hint and deduction answer.', {}, async () =>
        text(JSON.stringify(ctx.config(), null, 2)),
      { annotations: { readOnlyHint: true } }),
      tool(
        'readiness_check',
        'What is still missing or risky before the party, most urgent first (blocker, warn, info).',
        {},
        async () => {
          const items = ctx.readiness();
          return text(items.length ? items.map((i) => `[${i.level}] ${i.area}: ${i.text}`).join('\n') : 'Nothing missing.');
        },
        { annotations: { readOnlyHint: true } },
      ),
      tool('get_case_files', 'The full case files: access log, camera notes, toxicology, operative manifest, the director’s note and ledger fragments.', {}, async () =>
        text(caseFilesText()),
      { annotations: { readOnlyHint: true } }),
      tool(
        'list_versions',
        'Recent configuration versions: who changed what and when. Every change is kept and any version can be restored by a GM.',
        {},
        async () =>
          text(
            ctx
              .history()
              .map((v) => `v${v.version} ${new Date(v.ts).toISOString()} ${v.source}: ${v.note}${v.changes.length ? ` [${v.changes.slice(0, 8).join(', ')}]` : ''}`)
              .join('\n') || 'No versions.',
          ),
        { annotations: { readOnlyHint: true } },
      ),
      tool(
        'view_photo',
        'Look at an uploaded field photo by its id (the ids are in geo.photos in the configuration).',
        { id: z.string().describe('Upload id such as photo-1a2b3c.jpg') },
        async ({ id }) => {
          const name = path.basename(id);
          const ext = name.split('.').pop()?.toLowerCase() ?? '';
          const file = path.join(env.uploadsDir, name);
          if (!MIME[ext] || !fs.existsSync(file)) return { ...text(`No photo named ${name}.`), isError: true };
          return { content: [{ type: 'image' as const, data: fs.readFileSync(file).toString('base64'), mimeType: MIME[ext] }] };
        },
        { annotations: { readOnlyHint: true } },
      ),
      tool(
        'propose_changes',
        'Propose configuration edits for a GM to review. Nothing changes until a GM presses Apply in the console. Each change sets one dotted path to its complete new value.',
        {
          summary: z.string().describe('One line: what this changes and why'),
          changes: z
            .array(z.object({ path: z.string().describe('Dotted path, e.g. gate.code or deduction.slots.1.accept'), value: z.any().describe('Complete new value for that path') }))
            .min(1),
        },
        async ({ summary, changes }) => {
          try {
            const p = ctx.propose(summary, changes as ProposalChange[]);
            return text(`Proposal #${p.id} is waiting for a GM to press Apply. Nothing has changed yet.`);
          } catch (e) {
            return { ...text(`Not proposed: ${e instanceof Error ? e.message : String(e)}. Fix the path or value and try again.`), isError: true };
          }
        },
      ),
    ],
  });
}

/** Mock-mode stand-in: the readiness list, plus a literal "set PATH to VALUE" command for quick edits. */
export function mockSetupReply(message: string, ctx: SetupContext): string {
  const m = /^\s*set\s+([\w.]+)\s+to\s+([\s\S]+?)\s*$/i.exec(message);
  if (m) {
    let value: unknown = m[2];
    try {
      value = JSON.parse(m[2]);
    } catch {
      value = m[2].replace(/^["']|["']$/g, '');
    }
    try {
      const p = ctx.propose(`Set ${m[1]}`, [{ path: m[1], value }]);
      return `Proposal #${p.id} sets ${m[1]}. Press Apply to make it live.`;
    } catch (e) {
      return `Could not propose that: ${e instanceof Error ? e.message : String(e)}`;
    }
  }
  const items = ctx.readiness();
  const list = items.length ? items.map((i) => `- **${i.level}** · ${i.area}: ${i.text}`).join('\n') : 'Nothing is missing.';
  return `The AI is in mock mode, so I can only run the readiness check and simple edits such as: set gate.code to "MAGENTA31". Link Claude in the Claude link panel for ideas, photo reviews and drafted props.\n\n**Readiness**\n${list}`;
}
