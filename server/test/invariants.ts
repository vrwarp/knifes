import { STAGE_ORDER, type GameConfig, type GameState, type StageId } from '../src/types.js';

const at = (s: StageId) => STAGE_ORDER.indexOf(s);

/**
 * What must hold for any game state the server can reach, whatever the GMs and the phone did:
 * returns the violations, empty when the state is sound.
 */
export function violations(config: GameConfig, state: GameState): string[] {
  const out: string[] = [];
  const stage = at(state.stage);
  if (stage < 0) out.push(`unknown stage ${state.stage}`);
  for (const s of Object.keys(state.stageTimes) as StageId[]) if (at(s) > stage) out.push(`time recorded for ${s}, after the current stage ${state.stage}`);
  if (state.stageTimes[state.stage] === undefined && state.stage !== 'intro') out.push(`no time recorded for the current stage ${state.stage}`);
  if (state.stage !== 'intro' && state.startedAt === null) out.push('past the intro but never started');
  if (state.gate.passed !== stage >= at('hack')) out.push(`gate.passed is ${state.gate.passed} at ${state.stage}`);
  if (state.hack.solved !== stage >= at('reveal')) out.push(`hack.solved is ${state.hack.solved} at ${state.stage}`);
  if (config.geo.mode === 'puzzle' && stage >= at('gate') && !state.geo.solved) out.push(`past the location puzzle at ${state.stage} without solving it`);
  if (state.geo.solved && stage < at('geo')) out.push('location solved before it was reached');
  const h = state.hack;
  if (h.guesses.length !== h.guessAt.length) out.push(`${h.guesses.length} guesses but ${h.guessAt.length} timestamps`);
  if (h.ai.guesses.length !== h.ai.guessAt.length) out.push(`${h.ai.guesses.length} adversary guesses but ${h.ai.guessAt.length} timestamps`);
  if (config.hack.maxAttempts !== null && h.guesses.length > config.hack.maxAttempts) out.push(`${h.guesses.length} guesses over the cap ${config.hack.maxAttempts}`);
  if (config.hack.maxAttempts !== null && h.ai.guesses.length > config.hack.maxAttempts) out.push(`${h.ai.guesses.length} adversary guesses over the cap`);
  if (h.rounds < 0 || h.round < 0) out.push('negative round count');
  if (h.ai.solved && !h.roundResult && state.stage === 'hack' && config.hack.mode === 'race') out.push('adversary solved but the round never ended');
  if (state.ledger.layer2 && !state.ledger.layer2ReleasedAt) out.push('records out with no release time');
  if (!state.ledger.layer2 && state.ledger.layer2ReleasedAt) out.push('a release time with the records hidden');
  if (new Set(state.hints.map((x) => x.id)).size !== state.hints.length) out.push('two transmissions share an id');
  for (let i = 1; i < state.hints.length; i++) if (state.hints[i].id <= state.hints[i - 1].id) out.push('transmission ids out of order');
  if (state.archive.messageCount < 0) out.push('negative ARCHIVE count');
  return out;
}

/** Everything the player's browser must never receive, for this configuration and state. */
export function secretsFor(config: GameConfig, state: GameState): string[] {
  const s = new Set<string>();
  s.add(config.gate.code);
  if (config.hack.mode === 'solo' && !state.hack.solved) s.add(config.hack.secret.toUpperCase());
  const retired = new Set([state.hack.lastRound?.word, state.hack.roundResult && state.hack.roundResult !== 'player' ? state.hack.lastWord : null].filter(Boolean));
  // Words he typed himself are his to see, whether they are keys or not.
  const typed = new Set(state.hack.guesses);
  if (config.hack.mode === 'race') for (const w of config.hack.wordBank) if (!retired.has(w) && !typed.has(w) && !(state.hack.solved && w === state.hack.secret)) s.add(w);
  for (const v of [config.phil.part1, config.phil.part2, config.phil.response, config.archive.persona, config.report.prompt]) s.add(v);
  for (const list of Object.values(config.hints.quick)) for (const q of list ?? []) s.add(q);
  for (const a of config.ledger.content.agents) {
    for (const l of a.log) s.add(l.text);
    for (const e of a.evidence) s.add(e);
    s.add(a.findings);
    // The records' times stay off the state view even after the release; the Ledger itself comes over /api/player/ledger.
  }
  if (config.geo.mode === 'puzzle' && !state.geo.solved && config.geo.target) s.add(`"target":{"lat":${config.geo.target.lat}`);
  return [...s].filter((x) => x && x.length >= 4);
}
