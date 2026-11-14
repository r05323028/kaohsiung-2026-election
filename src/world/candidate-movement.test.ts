import { beforeEach, describe, expect, it } from 'vitest';
import { candidateProfiles } from '../data';
import { COUNCIL_CONSTITUENCIES } from '../data/constituencies';
import { movementScopeForCandidate } from './constituencies';
import { ADMIN_DISTRICTS } from './geography';
import { HEX_TILES } from './hex';
import {
  adminDistrictConnectivity,
  allowedEdge,
  nearestRoadNode,
  ringNodeIdsForTile,
  roadEdge,
  roadNode,
  shortestRoadPath,
} from './road-graph';
import {
  actorIsOnRoad,
  advanceSimulationSeconds,
  followActor,
  getActor,
  getActors,
  graphForActor,
  resetSimulation,
  selectActor,
} from './simulation';

const official = candidateProfiles.filter(
  (candidate) => !candidate.candidacy.isDemo,
);
const adminIds = new Set(ADMIN_DISTRICTS.map((district) => district.id));

function coverageFor(slug: string) {
  return COUNCIL_CONSTITUENCIES.find((item) => item.slug === slug);
}

function tileForAdmin(adminId: string) {
  return HEX_TILES.find((tile) => tile.adminId === adminId);
}

beforeEach(() => {
  resetSimulation();
});

describe('candidate movement scopes', () => {
  it('gives every official candidate an explicit, valid territory', () => {
    const actors = getActors();
    expect(actors).toHaveLength(official.length);

    for (const candidate of official) {
      const slug = candidate.candidacy.slug;
      const actor = getActor(slug);
      expect(actor, slug).toBeDefined();
      if (!actor) continue;

      const scope = movementScopeForCandidate(candidate);
      const allowed = new Set(actor.allowedAdminIds);
      expect(new Set(scope.allowedAdminIds), slug).toEqual(allowed);
      expect(scope.allowedAdminIds.length, slug).toBeGreaterThan(0);
      expect(new Set(scope.allowedAdminIds).size, slug).toBe(
        scope.allowedAdminIds.length,
      );
      for (const id of scope.allowedAdminIds) {
        expect(adminIds.has(id), `${slug} scope ${id}`).toBe(true);
      }

      expect(actor.spawnAdminId, slug).not.toBeNull();
      expect(allowed.has(actor.spawnAdminId!), slug).toBe(true);
      expect(allowed.has(actor.currentAdminId!), slug).toBe(true);
      expect(actor.routeValid, slug).toBe(true);
      expect(actor.edgeId.length, slug).toBeGreaterThan(0);
      expect(actor.speedKmPerSec, slug).toBeGreaterThan(0);
      expect(actorIsOnRoad(actor), slug).toBe(true);

      const edge = roadEdge(actor.edgeId);
      expect(allowedEdge(edge, allowed), slug).toBe(true);
      for (const nodeId of [edge.from, edge.to]) {
        expect(allowed.has(roadNode(nodeId).adminId), slug).toBe(true);
      }
      for (const graphEdge of graphForActor(actor).edges.values()) {
        expect(allowedEdge(graphEdge, allowed), `${slug} ${graphEdge.id}`).toBe(
          true,
        );
      }
    }
  });

  it('derives ordinary council territories exactly from the canonical mapping', () => {
    for (const candidate of official.filter(
      (item) => item.candidacy.electionType === 'city-council',
    )) {
      const coverage = coverageFor(candidate.district.slug);
      expect(coverage?.kind, candidate.candidacy.slug).toBe('ordinary');
      const actor = getActor(candidate.candidacy.slug)!;
      expect(new Set(actor.allowedAdminIds), candidate.candidacy.slug).toEqual(
        new Set(coverage!.adminDistrictIds),
      );
      expect(actor.allowedAdminIds.length).toBeLessThan(38);
    }

    // The canonical examples called out by the product requirements.
    expect(
      new Set(
        movementScopeForCandidate(
          official.find(
            (item) => item.district.slug === 'kaohsiung-council-04',
          )!,
        ).allowedAdminIds,
      ),
    ).toEqual(new Set(['E03', 'E04']));
    expect(
      movementScopeForCandidate(
        official.find((item) => item.district.slug === 'kaohsiung-council-07')!,
      ).allowedAdminIds,
    ).toEqual(['E05']);
  });

  it('keeps mayors citywide and documents every indigenous territory', () => {
    for (const candidate of official.filter(
      (item) => item.candidacy.electionType === 'mayoral',
    )) {
      const scope = movementScopeForCandidate(candidate);
      expect(scope.kind).toBe('mayoral');
      expect(scope.allowedAdminIds).toHaveLength(38);
    }

    const indigenous = official.filter((candidate) =>
      candidate.district.slug.includes('-indigenous-'),
    );
    expect(indigenous.length).toBeGreaterThan(0);
    for (const candidate of indigenous) {
      const coverage = coverageFor(candidate.district.slug)!;
      const scope = movementScopeForCandidate(candidate);
      expect(scope.kind).toBe('indigenous');
      expect(scope.eligibilityNote?.length ?? 0).toBeGreaterThan(0);
      if (coverage.kind === 'plains-indigenous') {
        expect(scope.allowedAdminIds).toHaveLength(38);
        expect(coverage.adminDistrictIds).toHaveLength(38);
        continue;
      }
      const connectivity = adminDistrictConnectivity(coverage.adminDistrictIds);
      expect(scope.allowedAdminIds).toEqual(connectivity.largestComponent);
      for (const id of scope.allowedAdminIds) {
        expect(coverage.adminDistrictIds).toContain(id);
      }
      for (const detached of connectivity.detached) {
        expect(scope.allowedAdminIds).not.toContain(detached);
      }
      expect(scope.allowedAdminIds.length).toBeLessThan(38);
    }
  });
});

describe('simulated movement boundaries', () => {
  it('keeps every candidate inside its territory with continuous motion for 900 simulated seconds', () => {
    const actors = getActors();
    const allowedBySlug = new Map(
      actors.map((actor) => [actor.slug, new Set(actor.allowedAdminIds)]),
    );
    const stats = new Map(
      actors.map((actor) => {
        const coverage = coverageFor(actor.electoralDistrictSlug);
        return [
          actor.slug,
          {
            visited: new Set<string>(),
            connectors: new Set<string>(),
            moved: false,
            sawIdle: false,
            resumedFromIdle: false,
            last: { ...actor.position },
            lastState: actor.state,
            coverage,
          },
        ];
      }),
    );

    for (const actor of actors) {
      const allowed = allowedBySlug.get(actor.slug)!;
      expect(allowed.has(actor.currentAdminId!), actor.slug).toBe(true);
    }

    for (let second = 0; second < 900; second += 1) {
      advanceSimulationSeconds(1);

      for (const actor of actors) {
        const allowed = allowedBySlug.get(actor.slug)!;
        const entry = stats.get(actor.slug)!;

        if (actor.currentAdminId) {
          expect(
            allowed.has(actor.currentAdminId),
            `${actor.slug} entered ${actor.currentAdminId}`,
          ).toBe(true);
          entry.visited.add(actor.currentAdminId);
        }

        const edge = roadEdge(actor.edgeId);
        expect(allowedEdge(edge, allowed), `${actor.slug} on ${edge.id}`).toBe(
          true,
        );
        for (const nodeId of [edge.from, edge.to]) {
          expect(
            allowed.has(roadNode(nodeId).adminId),
            `${actor.slug} node ${nodeId}`,
          ).toBe(true);
        }
        expect(actorIsOnRoad(actor), actor.slug).toBe(true);

        const delta = Math.hypot(
          actor.position.x - entry.last.x,
          actor.position.z - entry.last.z,
        );
        expect(Number.isFinite(delta), actor.slug).toBe(true);
        // One simulated second covers at most ~0.17 world units at the
        // fastest role speed. A larger jump would be a teleport.
        expect(delta, actor.slug).toBeLessThan(0.5);
        if (delta > 0.0001) entry.moved = true;

        if (edge.kind === 'connector') entry.connectors.add(edge.id);
        if (actor.state === 'idle') entry.sawIdle = true;
        else if (entry.sawIdle) entry.resumedFromIdle = true;

        entry.last = { ...actor.position };
        entry.lastState = actor.state;
      }
    }

    for (const actor of actors) {
      const entry = stats.get(actor.slug)!;
      expect(entry.moved, `${actor.slug} never moved`).toBe(true);
      expect(actor.territoryRejections, actor.slug).toBe(0);
      expect(actor.allowedAdminIds, actor.slug).toContain(actor.currentAdminId);
      // Time spent paused must be followed by normal movement again.
      expect(entry.sawIdle, `${actor.slug} never paused`).toBe(true);
      expect(
        entry.resumedFromIdle || entry.lastState === 'idle',
        `${actor.slug} never resumed`,
      ).toBe(true);
    }

    for (const coverage of COUNCIL_CONSTITUENCIES.filter(
      (item) => item.kind === 'ordinary' && item.adminDistrictIds.length > 1,
    )) {
      const members = actors.filter(
        (actor) => actor.electoralDistrictSlug === coverage.slug,
      );
      expect(members.length, coverage.slug).toBeGreaterThan(0);
      const crossed = members.some((actor) => {
        const entry = stats.get(actor.slug)!;
        return entry.visited.size > 1 && entry.connectors.size > 0;
      });
      expect(crossed, coverage.slug).toBe(true);
    }
  }, 120_000);

  it('keeps graph reachability across every district inside a multi-district constituency', () => {
    for (const coverage of COUNCIL_CONSTITUENCIES.filter(
      (item) => item.kind === 'ordinary' && item.adminDistrictIds.length > 1,
    )) {
      for (const candidate of official.filter(
        (item) => item.district.slug === coverage.slug,
      )) {
        const actor = getActor(candidate.candidacy.slug)!;
        const allowed = new Set(actor.allowedAdminIds);
        const start = nearestRoadNode(actor.position, allowed)!;
        for (const adminId of coverage.adminDistrictIds) {
          const tile = tileForAdmin(adminId);
          expect(tile, adminId).toBeDefined();
          expect(
            shortestRoadPath(
              start.id,
              ringNodeIdsForTile(tile!.id)[0]!,
              allowed,
            ),
            `${candidate.candidacy.slug} -> ${adminId}`,
          ).not.toBeNull();
        }
      }
    }
  });

  it('keeps scope, identity and position through selection, following and reset', () => {
    const candidate = official.find(
      (item) => item.district.slug === 'kaohsiung-council-04',
    )!;
    const actor = getActor(candidate.candidacy.slug)!;
    const allowedBefore = [...actor.allowedAdminIds].sort();
    const before = { ...actor.position };

    selectActor(actor.slug);
    followActor(actor.slug);
    advanceSimulationSeconds(20);

    expect(getActor(actor.slug)).toBe(actor);
    expect([...actor.allowedAdminIds].sort()).toEqual(allowedBefore);
    expect(actorIsOnRoad(actor)).toBe(true);
    const distance = Math.hypot(
      actor.position.x - before.x,
      actor.position.z - before.z,
    );
    expect(distance).toBeGreaterThan(0);
    expect(distance).toBeLessThan(3.5);

    resetSimulation();
    const restored = getActor(candidate.candidacy.slug)!;
    expect([...restored.allowedAdminIds].sort()).toEqual(allowedBefore);
    expect(restored.allowedAdminIds).toContain(restored.currentAdminId);
    expect(restored.allowedAdminIds).toContain(restored.spawnAdminId);
    expect(actorIsOnRoad(restored)).toBe(true);
  });
});
