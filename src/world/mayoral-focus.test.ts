import { beforeEach, describe, expect, it } from 'vitest';
import { candidateProfiles } from '../data';
import {
  adminDistrictVisibilityScope,
  CITYWIDE_OVERVIEW_VISIBILITY,
  constituencyVisibilityScope,
  visibleCandidatesForFocus,
} from './candidate-visibility';
import { ADMIN_DISTRICTS } from './geography';
import { allowedEdge, HEX_ROAD_GRAPH } from './road-graph';
import {
  advanceSimulationSeconds,
  getActor,
  getActors,
  graphForActor,
  resetSimulation,
} from './simulation';

const official = candidateProfiles.filter(
  (candidate) => !candidate.candidacy.isDemo,
);
const scopes = [
  CITYWIDE_OVERVIEW_VISIBILITY,
  adminDistrictVisibilityScope(['E03']),
  adminDistrictVisibilityScope(['E04']),
  adminDistrictVisibilityScope(['E05']),
  constituencyVisibilityScope('kaohsiung-council-04'),
  constituencyVisibilityScope('kaohsiung-indigenous-flat-12'),
];

function mayors() {
  return getActors().filter((actor) => actor.role === 'mayor');
}

describe('mayoral movement under district focus', () => {
  beforeEach(() => {
    resetSimulation();
  });

  it('keeps every mayoral candidate on the complete citywide road graph', () => {
    const allDistricts = new Set(
      ADMIN_DISTRICTS.map((district) => district.id),
    );
    const list = mayors();
    expect(list.length).toBeGreaterThan(0);
    for (const actor of list) {
      expect(new Set(actor.allowedAdminIds)).toEqual(allDistricts);
      expect(graphForActor(actor).edges.size).toBe(HEX_ROAD_GRAPH.edges.size);
      const allowed = new Set(actor.allowedAdminIds);
      for (const edge of HEX_ROAD_GRAPH.edges.values()) {
        expect(allowedEdge(edge, allowed)).toBe(true);
      }
    }
  });

  it('continues movement and animation without teleporting across focus transitions', () => {
    const first = mayors()[0]!;
    let previousPhase = first.walkPhase;
    let previous = { ...first.position };

    for (const scope of scopes) {
      const visible = visibleCandidatesForFocus(official, scope);
      expect(
        visible.some((candidate) => candidate.candidacy.slug === first.slug),
      ).toBe(true);
      expect(getActor(first.slug)).toBe(first);
      expect(new Set(first.allowedAdminIds).size).toBe(38);

      advanceSimulationSeconds(2);
      const stepDistance = Math.hypot(
        first.position.x - previous.x,
        first.position.z - previous.z,
      );
      expect(stepDistance).toBeGreaterThan(0);
      // Two simulated seconds cover far less than a tile, so any focus-driven
      // reset or teleport would be immediately visible here.
      expect(stepDistance).toBeLessThan(0.4);
      expect(first.walkPhase).toBeGreaterThanOrEqual(previousPhase);
      previousPhase = first.walkPhase;
      previous = { ...first.position };
    }
  });
});
