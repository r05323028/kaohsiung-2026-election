import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { candidateProfiles } from '../data';
import {
  advanceSimulationSeconds,
  configureSimulation,
  getActors,
  resetSimulation,
  simulationStats,
} from './simulation';

const official = candidateProfiles.filter(
  (candidate) => !candidate.candidacy.isDemo,
);

function worldSnapshot() {
  return getActors().map((actor) => ({
    slug: actor.slug,
    role: actor.role,
    position: { ...actor.position },
    destination: { ...actor.destination },
    heading: actor.heading,
    walkPhase: actor.walkPhase,
    edgeId: actor.edgeId,
    edgeProgress: actor.edgeProgress,
    fromNodeId: actor.fromNodeId,
    spawnAdminId: actor.spawnAdminId,
    allowedAdminIds: [...actor.allowedAdminIds],
    rngState: actor.rngState,
    nextPauseKm: actor.nextPauseKm,
  }));
}

// Runs before any configureSimulation call in this file, so it observes the
// state a fresh module load starts from.
describe('unconfigured world', () => {
  it('starts empty and stays safe to read, advance and reset', () => {
    expect(getActors()).toEqual([]);
    expect(simulationStats().actors).toBe(0);
    advanceSimulationSeconds(1);
    expect(getActors()).toEqual([]);
    expect(() => resetSimulation()).not.toThrow();
    expect(getActors()).toEqual([]);
  });
});

describe('configured world', () => {
  beforeAll(() => {
    configureSimulation(official);
  });

  beforeEach(() => {
    resetSimulation();
  });

  it('spawns one actor per non-demo candidate in the injected order', () => {
    expect(getActors().map((actor) => actor.slug)).toEqual(
      official.map((candidate) => candidate.candidacy.slug),
    );
    expect(simulationStats().actors).toBe(official.length);
  });

  it('rebuilds identical state when configured again with the same list', () => {
    const fresh = worldSnapshot();
    advanceSimulationSeconds(120);
    expect(worldSnapshot()).not.toEqual(fresh);
    configureSimulation(official);
    expect(worldSnapshot()).toEqual(fresh);
  });

  it('keeps the last configured list as the reset baseline', () => {
    const fresh = worldSnapshot();
    advanceSimulationSeconds(75);
    expect(worldSnapshot()).not.toEqual(fresh);
    resetSimulation();
    expect(worldSnapshot()).toEqual(fresh);
  });
});
