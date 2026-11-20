import { describe, expect, it } from 'vitest';
import { politicalFamilyPublication } from '../data/political-family';
import {
  buildPoliticalFamilyGraphLayout,
  measureRelationshipLabel,
  rectanglesOverlap,
  wrapRelationshipLabel,
} from './PoliticalFamilyGraph';

function graphDataForCandidate(candidateId: string) {
  const candidate = politicalFamilyPublication.candidates.find(
    (entry) => entry.candidateId === candidateId,
  );
  if (!candidate) throw new Error(`Unknown candidate: ${candidateId}`);
  const relationships = politicalFamilyPublication.relationships.filter(
    (relationship) => candidate.relationshipIds.includes(relationship.id),
  );
  const personIds = new Set(
    relationships.flatMap((relationship) => [
      relationship.personAId,
      relationship.personBId,
    ]),
  );
  const people = politicalFamilyPublication.people.filter((person) =>
    personIds.has(person.id),
  );
  const candidatePerson = people.find(
    (person) => person.candidateId === candidateId,
  );
  if (!candidatePerson) {
    throw new Error(`Missing candidate person: ${candidateId}`);
  }
  return { people, relationships, candidatePerson };
}

function containsRect(
  outer: { x: number; y: number; width: number; height: number },
  inner: { x: number; y: number; width: number; height: number },
) {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.width <= outer.x + outer.width &&
    inner.y + inner.height <= outer.y + outer.height
  );
}

describe('political family graph label layout', () => {
  it('wraps long Chinese parenthetical labels without dropping characters', () => {
    const label = '外祖父（報導並用「祖父」與「外孫女」兩種稱謂）';
    const metrics = measureRelationshipLabel(label);

    expect(metrics.lines.length).toBeGreaterThan(1);
    expect(metrics.lines.join('')).toBe(label);
    expect(metrics.height).toBeGreaterThan(metrics.lineHeight);
    expect(metrics.width).toBeGreaterThan(52);
  });

  it('preserves explicit line breaks and measures all lines', () => {
    const lines = wrapRelationshipLabel('第一行\n第二行（補充說明）', 180);
    const metrics = measureRelationshipLabel('第一行\n第二行（補充說明）', 180);

    expect(lines[0]).toBe('第一行');
    expect(lines.join('')).toBe('第一行第二行（補充說明）');
    expect(metrics.lines).toEqual(lines);
    expect(metrics.height).toBe(lines.length * metrics.lineHeight + 12);
  });

  it('keeps every published label and bounding box clear at mobile and desktop widths', () => {
    for (const minimumWidth of [375, 390, 780]) {
      for (const candidate of politicalFamilyPublication.candidates) {
        if (candidate.relationshipIds.length === 0) continue;
        const { people, relationships, candidatePerson } =
          graphDataForCandidate(candidate.candidateId);
        const layout = buildPoliticalFamilyGraphLayout(
          people,
          relationships,
          candidatePerson.id,
          minimumWidth,
        );

        expect(layout.edges).toHaveLength(relationships.length);
        expect(containsRect(layout.contentBounds, layout.contentBounds)).toBe(
          true,
        );
        expect(layout.contentBounds.x).toBeGreaterThanOrEqual(0);
        expect(layout.contentBounds.y).toBeGreaterThanOrEqual(0);
        expect(
          layout.contentBounds.x + layout.contentBounds.width,
        ).toBeLessThanOrEqual(layout.width);
        expect(
          layout.contentBounds.y + layout.contentBounds.height,
        ).toBeLessThanOrEqual(layout.height);

        for (const edge of layout.edges) {
          expect(containsRect(layout.contentBounds, edge.labelBounds)).toBe(
            true,
          );
          for (const nodeBounds of layout.nodeBounds.values()) {
            expect(rectanglesOverlap(edge.labelBounds, nodeBounds)).toBe(false);
          }
        }
        for (let index = 0; index < layout.edges.length; index += 1) {
          for (
            let otherIndex = index + 1;
            otherIndex < layout.edges.length;
            otherIndex += 1
          ) {
            const first = layout.edges[index];
            const second = layout.edges[otherIndex];
            expect(first && second).toBeTruthy();
            if (first && second) {
              expect(
                rectanglesOverlap(first.labelBounds, second.labelBounds),
              ).toBe(false);
            }
          }
        }
      }
    }
  });
});
