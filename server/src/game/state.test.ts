import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../defaultConfig.js';
import type { GameConfig } from '../types.js';
import { mergeConfig } from '../service.js';
import { advanceTo, forceStage, initialState, nextStage, playerView, resetStage, streetViewForPlayer } from './state.js';

const cfg = (): GameConfig => structuredClone(DEFAULT_CONFIG);

describe('stage flow', () => {
  it('skips geo when the geo mode is off', () => {
    const c = cfg();
    expect(nextStage(c, 'intro')).toBe('geo');
    c.geo.mode = 'off';
    expect(nextStage(c, 'intro')).toBe('gate');
    expect(nextStage(c, 'solved')).toBeNull();
  });
  it('only advances forward', () => {
    const s = initialState();
    expect(advanceTo(s, 'gate', 1000)).toBe(true);
    expect(s.startedAt).toBe(1000);
    expect(advanceTo(s, 'intro')).toBe(false);
    expect(s.stage).toBe('gate');
  });
  it('force-unlocks earlier puzzles and evidence by gate mode', () => {
    const c = cfg();
    const s = initialState();
    forceStage(c, s, 'investigation');
    expect(s.gate.passed).toBe(true);
    expect(s.hack.solved).toBe(true);
    expect(s.evidence.unlocked).toEqual({ logs: true, audio: true, toxicology: true, manifest: true });
    const c2 = cfg();
    c2.evidence.gateMode = 'passcodes';
    const s2 = initialState();
    forceStage(c2, s2, 'investigation');
    expect(s2.evidence.unlocked).toEqual({ logs: true, audio: false, toxicology: false, manifest: true });
  });
  it('resetting a stage rewinds the pointer and clears that puzzle', () => {
    const c = cfg();
    const s = initialState();
    forceStage(c, s, 'reveal');
    s.hack.guesses = ['APPLE'];
    resetStage(c, s, 'hack');
    expect(s.stage).toBe('hack');
    expect(s.hack.guesses).toEqual([]);
    expect(s.stageTimes.reveal).toBeUndefined();
  });
});

describe('playerView', () => {
  it('never leaks secrets', () => {
    const c = cfg();
    const s = initialState();
    const json = JSON.stringify(playerView(c, s));
    expect(json).not.toContain(c.gate.code);
    expect(json).not.toContain('"secret"');
    expect(json).not.toContain('CANIS30');
    expect(json).not.toContain('canonical');
    expect(json).not.toContain('Agent Vector');
  });
  it('scores guesses for the client without exposing the secret', () => {
    const c = cfg();
    const s = initialState();
    s.hack.guesses = ['APPLE'];
    const v = playerView(c, s) as unknown as { hack: { rows: { state: string }[][] } };
    expect(v.hack.rows[0].map((x) => x.state)).toEqual(['hit', 'miss', 'hit', 'near', 'miss']);
  });
});

describe('streetViewForPlayer', () => {
  const live = () => {
    const c = cfg();
    c.geo.target = { lat: 1, lng: 2 };
    const s = initialState();
    s.stage = 'geo';
    return { c, s };
  };
  it('is off without a key, a location, or a live puzzle', () => {
    const { c, s } = live();
    expect(streetViewForPlayer(c, s, '')).toBeNull();
    c.geo.target = null;
    expect(streetViewForPlayer(c, s, 'k')).toBeNull();
    c.geo.target = { lat: 1, lng: 2 };
    s.geo.solved = true;
    expect(streetViewForPlayer(c, s, 'k')).toBeNull();
    s.geo.solved = false;
    s.stage = 'intro';
    expect(streetViewForPlayer(c, s, 'k')).toBeNull();
  });
  it('falls back to the target and honours an explicit start', () => {
    const { c, s } = live();
    expect(streetViewForPlayer(c, s, 'k')).toEqual({ apiKey: 'k', location: { lat: 1, lng: 2 }, heading: 0, pitch: 0, allowMoving: true });
    c.geo.streetView = { location: { lat: 3, lng: 4 }, heading: 90, pitch: -5, allowMoving: false };
    expect(streetViewForPlayer(c, s, 'k')?.location).toEqual({ lat: 3, lng: 4 });
    expect(streetViewForPlayer(c, s, 'k')?.allowMoving).toBe(false);
  });
  it('is filled in for configs saved before it existed', () => {
    const saved = structuredClone(DEFAULT_CONFIG) as unknown as { geo: Record<string, unknown> };
    delete saved.geo.streetView;
    expect(mergeConfig(saved).geo.streetView).toEqual(DEFAULT_CONFIG.geo.streetView);
  });
});
