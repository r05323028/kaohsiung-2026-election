import type { PointerEvent as ReactPointerEvent } from 'react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { PublicCandidateProfile } from '../data';
import type {
  PoliticalFamilyPublicRelationship,
  PoliticalFamilyPublicSource,
  PoliticalFamilyReadModel,
  PoliticalPerson,
} from '../data/political-family';
import type {
  Affiliation,
  ListingStatus,
  PoliticalCareerStatus,
  PositionCategory,
} from '../data/political-family/schema';

type Point = { x: number; y: number };
export type GraphRect = { x: number; y: number; width: number; height: number };
type DragState = {
  x: number;
  y: number;
  panX: number;
  panY: number;
  scaleX: number;
  scaleY: number;
};

const GRAPH_WIDTH = 780;
const GRAPH_HEIGHT = 500;
const GRAPH_PADDING = 28;
const NODE_WIDTH = 184;
const NODE_HEIGHT = 84;
const NODE_GAP = 18;
const EDGE_LABEL_GAP = 16;
const LABEL_LINE_HEIGHT = 16;
const LABEL_HORIZONTAL_PADDING = 20;
const LABEL_VERTICAL_PADDING = 12;
const LABEL_MAX_TEXT_WIDTH = 180;
const LABEL_MIN_WIDTH = 52;

export type RelationshipLabelMetrics = {
  width: number;
  height: number;
  lines: string[];
  lineHeight: number;
};

export type PoliticalFamilyGraphEdge = {
  relationship: PoliticalFamilyPublicRelationship;
  pointA: Point;
  pointB: Point;
  midpoint: Point;
  label: RelationshipLabelMetrics;
  labelBounds: GraphRect;
};

export type PoliticalFamilyGraphLayout = {
  people: PoliticalPerson[];
  candidatePerson: PoliticalPerson | undefined;
  points: Map<string, Point>;
  nodeBounds: Map<string, GraphRect>;
  edges: PoliticalFamilyGraphEdge[];
  contentBounds: GraphRect;
  width: number;
  height: number;
};

function estimatedCharacterWidth(character: string): number {
  if (/\s/u.test(character)) return 5;
  if ((character.codePointAt(0) ?? 0) <= 0xff) return 8;
  return 13;
}

function estimatedTextWidth(text: string): number {
  return Array.from(text).reduce(
    (width, character) => width + estimatedCharacterWidth(character),
    0,
  );
}

export function wrapRelationshipLabel(
  label: string,
  maxTextWidth = LABEL_MAX_TEXT_WIDTH,
): string[] {
  const lines: string[] = [];
  for (const paragraph of label.split(/\r?\n/u)) {
    if (paragraph.length === 0) {
      lines.push('');
      continue;
    }
    let line = '';
    for (const character of Array.from(paragraph)) {
      if (line && estimatedTextWidth(`${line}${character}`) > maxTextWidth) {
        lines.push(line);
        line = character;
      } else {
        line += character;
      }
    }
    if (line) lines.push(line);
  }
  return lines.length > 0 ? lines : [''];
}

export function measureRelationshipLabel(
  label: string,
  maxTextWidth = LABEL_MAX_TEXT_WIDTH,
): RelationshipLabelMetrics {
  const lines = wrapRelationshipLabel(label, maxTextWidth);
  const maxLineWidth = Math.max(
    ...lines.map((line) => estimatedTextWidth(line)),
  );
  return {
    width: Math.max(
      LABEL_MIN_WIDTH,
      Math.ceil(maxLineWidth + LABEL_HORIZONTAL_PADDING),
    ),
    height: lines.length * LABEL_LINE_HEIGHT + LABEL_VERTICAL_PADDING,
    lines,
    lineHeight: LABEL_LINE_HEIGHT,
  };
}

export function rectanglesOverlap(
  first: GraphRect,
  second: GraphRect,
  gap = 0,
): boolean {
  return (
    first.x < second.x + second.width + gap &&
    first.x + first.width + gap > second.x &&
    first.y < second.y + second.height + gap &&
    first.y + first.height + gap > second.y
  );
}

function rectForPoint(
  point: Point,
  width = NODE_WIDTH,
  height = NODE_HEIGHT,
): GraphRect {
  return {
    x: point.x - width / 2,
    y: point.y - height / 2,
    width,
    height,
  };
}

function expandRect(rect: GraphRect, other: GraphRect): GraphRect {
  const x = Math.min(rect.x, other.x);
  const y = Math.min(rect.y, other.y);
  const right = Math.max(rect.x + rect.width, other.x + other.width);
  const bottom = Math.max(rect.y + rect.height, other.y + other.height);
  return { x, y, width: right - x, height: bottom - y };
}

function translateRect(rect: GraphRect, x: number, y: number): GraphRect {
  return { ...rect, x: rect.x + x, y: rect.y + y };
}

function relationshipAngles(count: number, compact: boolean): number[] {
  if (!compact) {
    return Array.from(
      { length: count },
      (_, index) => -Math.PI / 2 + (index * 2 * Math.PI) / Math.max(count, 1),
    );
  }

  // Keep mobile spokes mostly vertical so the label box can remain readable
  // within a narrow viewport instead of forcing a wide, scaled-down graph.
  const compactAngles = [
    -Math.PI / 2,
    Math.PI / 2,
    -Math.PI / 2 - 0.52,
    -Math.PI / 2 + 0.52,
    Math.PI / 2 - 0.52,
    Math.PI / 2 + 0.52,
  ];
  return Array.from({ length: count }, (_, index) => {
    if (compactAngles[index] !== undefined) return compactAngles[index];
    const angle = -Math.PI / 2 + (index * 2 * Math.PI) / Math.max(count, 1);
    return Math.abs(Math.cos(angle)) > 0.92 ? angle + 0.22 : angle;
  });
}

function buildEdgeLayouts(
  points: Map<string, Point>,
  relationships: PoliticalFamilyPublicRelationship[],
): PoliticalFamilyGraphEdge[] {
  const pairCounts = new Map<string, number>();
  const pairIndexes = new Map<string, number>();
  for (const relationship of relationships) {
    const key = [relationship.personAId, relationship.personBId]
      .sort()
      .join('|');
    pairCounts.set(key, (pairCounts.get(key) ?? 0) + 1);
  }

  return relationships.flatMap((relationship) => {
    const pointA = points.get(relationship.personAId);
    const pointB = points.get(relationship.personBId);
    if (!pointA || !pointB) return [];
    const label = measureRelationshipLabel(relationship.relationshipLabel);
    const key = [relationship.personAId, relationship.personBId]
      .sort()
      .join('|');
    const pairIndex = pairIndexes.get(key) ?? 0;
    pairIndexes.set(key, pairIndex + 1);
    const pairCount = pairCounts.get(key) ?? 1;
    const midpoint = {
      x: (pointA.x + pointB.x) / 2,
      y: (pointA.y + pointB.y) / 2,
    };
    if (pairCount > 1) {
      const dx = pointB.x - pointA.x;
      const dy = pointB.y - pointA.y;
      const length = Math.hypot(dx, dy) || 1;
      const offset = (pairIndex - (pairCount - 1) / 2) * (label.height + 8);
      midpoint.x += (-dy / length) * offset;
      midpoint.y += (dx / length) * offset;
    }
    return [
      {
        relationship,
        pointA,
        pointB,
        midpoint,
        label,
        labelBounds: {
          x: midpoint.x - label.width / 2,
          y: midpoint.y - label.height / 2,
          width: label.width,
          height: label.height,
        },
      },
    ];
  });
}

function translateEdgeLabel(
  edge: PoliticalFamilyGraphEdge,
  x: number,
  y: number,
): PoliticalFamilyGraphEdge {
  const midpoint = {
    x: edge.midpoint.x + x,
    y: edge.midpoint.y + y,
  };
  return {
    ...edge,
    midpoint,
    labelBounds: {
      x: midpoint.x - edge.label.width / 2,
      y: midpoint.y - edge.label.height / 2,
      width: edge.label.width,
      height: edge.label.height,
    },
  };
}

function overlapShift(
  first: GraphRect,
  second: GraphRect,
  gap: number,
): Point | undefined {
  const firstCenter = {
    x: first.x + first.width / 2,
    y: first.y + first.height / 2,
  };
  const secondCenter = {
    x: second.x + second.width / 2,
    y: second.y + second.height / 2,
  };
  const overlapX =
    Math.min(first.x + first.width, second.x + second.width) -
    Math.max(first.x, second.x);
  const overlapY =
    Math.min(first.y + first.height, second.y + second.height) -
    Math.max(first.y, second.y);
  if (overlapX <= 0 || overlapY <= 0) return undefined;
  if (overlapX <= overlapY) {
    return {
      x: (firstCenter.x <= secondCenter.x ? -1 : 1) * (overlapX / 2 + gap),
      y: 0,
    };
  }
  return {
    x: 0,
    y: (firstCenter.y <= secondCenter.y ? -1 : 1) * (overlapY / 2 + gap),
  };
}

function resolveLabelCollisions(
  points: Map<string, Point>,
  initialEdges: PoliticalFamilyGraphEdge[],
): PoliticalFamilyGraphEdge[] {
  const edges = [...initialEdges];
  const nodeBounds = [...points.values()].map((point) => rectForPoint(point));

  for (let attempt = 0; attempt < 64; attempt += 1) {
    let moved = false;
    for (let index = 0; index < edges.length && !moved; index += 1) {
      for (
        let otherIndex = index + 1;
        otherIndex < edges.length;
        otherIndex += 1
      ) {
        const first = edges[index];
        const second = edges[otherIndex];
        if (!first || !second) continue;
        const shift = overlapShift(first.labelBounds, second.labelBounds, 8);
        if (!shift) continue;
        edges[index] = translateEdgeLabel(first, shift.x, shift.y);
        edges[otherIndex] = translateEdgeLabel(second, -shift.x, -shift.y);
        moved = true;
        break;
      }
    }
    if (moved) continue;

    for (let index = 0; index < edges.length && !moved; index += 1) {
      const edge = edges[index];
      if (!edge) continue;
      for (const nodeBoundsForId of nodeBounds) {
        const shift = overlapShift(
          edge.labelBounds,
          nodeBoundsForId,
          EDGE_LABEL_GAP,
        );
        if (!shift) continue;
        edges[index] = translateEdgeLabel(edge, shift.x * 2, shift.y * 2);
        moved = true;
        break;
      }
    }
    if (!moved) break;
  }
  return edges;
}

function hasLayoutCollision(
  points: Map<string, Point>,
  edges: PoliticalFamilyGraphEdge[],
): boolean {
  const nodeBounds = [...points.entries()].map(
    ([id, point]) => [id, rectForPoint(point)] as const,
  );
  for (let index = 0; index < nodeBounds.length; index += 1) {
    for (
      let otherIndex = index + 1;
      otherIndex < nodeBounds.length;
      otherIndex += 1
    ) {
      const firstNode = nodeBounds[index];
      const secondNode = nodeBounds[otherIndex];
      if (
        firstNode &&
        secondNode &&
        rectanglesOverlap(firstNode[1], secondNode[1], NODE_GAP)
      )
        return true;
    }
  }
  for (const edge of edges) {
    for (const [id, nodeBoundsForId] of nodeBounds) {
      const isEndpoint =
        id === edge.relationship.personAId ||
        id === edge.relationship.personBId;
      if (
        !isEndpoint &&
        rectanglesOverlap(edge.labelBounds, nodeBoundsForId, EDGE_LABEL_GAP)
      )
        return true;
    }
  }
  for (let index = 0; index < edges.length; index += 1) {
    for (
      let otherIndex = index + 1;
      otherIndex < edges.length;
      otherIndex += 1
    ) {
      const firstEdge = edges[index];
      const secondEdge = edges[otherIndex];
      if (
        firstEdge &&
        secondEdge &&
        rectanglesOverlap(firstEdge.labelBounds, secondEdge.labelBounds, 8)
      )
        return true;
    }
  }
  return edges.some((edge) =>
    [edge.relationship.personAId, edge.relationship.personBId].some((id) =>
      rectanglesOverlap(
        edge.labelBounds,
        rectForPoint(points.get(id) ?? { x: 0, y: 0 }),
        EDGE_LABEL_GAP,
      ),
    ),
  );
}

export function buildPoliticalFamilyGraphLayout(
  people: PoliticalPerson[],
  relationships: PoliticalFamilyPublicRelationship[],
  candidatePersonId: string,
  minimumWidth = GRAPH_WIDTH,
): PoliticalFamilyGraphLayout {
  const candidatePerson = people.find(
    (person) => person.id === candidatePersonId,
  );
  const relatives = people.filter((person) => person.id !== candidatePersonId);
  const compact = minimumWidth < 600;
  const safeMinimumWidth = Math.max(260, minimumWidth);
  if (!candidatePerson) {
    return {
      people,
      candidatePerson,
      points: new Map(),
      nodeBounds: new Map(),
      edges: [],
      contentBounds: { x: 0, y: 0, width: 0, height: 0 },
      width: safeMinimumWidth,
      height: compact ? 320 : GRAPH_HEIGHT,
    };
  }

  const angles = relationshipAngles(relatives.length, compact);
  const baseRadius = Math.max(
    compact ? 220 : 250,
    180 + relatives.length * (compact ? 28 : 24),
  );
  let radiusX = compact
    ? Math.max(18, (safeMinimumWidth - NODE_WIDTH - GRAPH_PADDING * 2) / 2)
    : baseRadius;
  let radiusY = compact
    ? Math.max(220, baseRadius * 0.9)
    : Math.max(190, baseRadius * 0.82);

  const createPoints = (): Map<string, Point> => {
    const points = new Map<string, Point>([
      [candidatePerson.id, { x: 0, y: 0 }],
    ]);
    relatives.forEach((person, index) => {
      const angle = angles[index] ?? -Math.PI / 2;
      points.set(person.id, {
        x: Math.cos(angle) * radiusX,
        y: Math.sin(angle) * radiusY,
      });
    });
    return points;
  };

  let points = createPoints();
  let edges = resolveLabelCollisions(
    points,
    buildEdgeLayouts(points, relationships),
  );
  for (
    let attempt = 0;
    attempt < 24 && hasLayoutCollision(points, edges);
    attempt += 1
  ) {
    radiusY += compact ? 32 : 20;
    if (!compact) radiusX += 20;
    points = createPoints();
    edges = resolveLabelCollisions(
      points,
      buildEdgeLayouts(points, relationships),
    );
  }

  const nodeBounds = new Map(
    [...points.entries()].map(([id, point]) => [id, rectForPoint(point)]),
  );
  let rawBounds: GraphRect | undefined;
  for (const bounds of nodeBounds.values())
    rawBounds = rawBounds ? expandRect(rawBounds, bounds) : bounds;
  for (const edge of edges)
    rawBounds = rawBounds
      ? expandRect(rawBounds, edge.labelBounds)
      : edge.labelBounds;
  const content = rawBounds ?? { x: 0, y: 0, width: 0, height: 0 };
  const paddedWidth = content.width + GRAPH_PADDING * 2;
  const paddedHeight = content.height + GRAPH_PADDING * 2;
  const width = Math.max(safeMinimumWidth, paddedWidth);
  const height = Math.max(compact ? 320 : GRAPH_HEIGHT, paddedHeight);
  const offsetX = GRAPH_PADDING - content.x + (width - paddedWidth) / 2;
  const offsetY = GRAPH_PADDING - content.y + (height - paddedHeight) / 2;
  const shiftPoint = (point: Point): Point => ({
    x: point.x + offsetX,
    y: point.y + offsetY,
  });
  const shiftedPoints = new Map(
    [...points.entries()].map(([id, point]) => [id, shiftPoint(point)]),
  );
  const shiftedNodeBounds = new Map(
    [...nodeBounds.entries()].map(([id, bounds]) => [
      id,
      translateRect(bounds, offsetX, offsetY),
    ]),
  );
  const shiftedEdges = edges.map((edge) => ({
    ...edge,
    pointA: shiftPoint(edge.pointA),
    pointB: shiftPoint(edge.pointB),
    midpoint: shiftPoint(edge.midpoint),
    labelBounds: translateRect(edge.labelBounds, offsetX, offsetY),
  }));
  return {
    people,
    candidatePerson,
    points: shiftedPoints,
    nodeBounds: shiftedNodeBounds,
    edges: shiftedEdges,
    contentBounds: translateRect(content, offsetX, offsetY),
    width,
    height,
  };
}

function clampPan(pan: Point, layout: PoliticalFamilyGraphLayout): Point {
  const minX = -layout.contentBounds.x;
  const maxX =
    layout.width - (layout.contentBounds.x + layout.contentBounds.width);
  const minY = -layout.contentBounds.y;
  const maxY =
    layout.height - (layout.contentBounds.y + layout.contentBounds.height);
  return {
    x: Math.min(maxX, Math.max(minX, pan.x)),
    y: Math.min(maxY, Math.max(minY, pan.y)),
  };
}

export const NEUTRAL_RELATION_NOTE =
  '家族與商業關係本身不代表不當或不當影響；未顯示的資料表示尚無已查證紀錄，不代表不存在關係。';

export type AffiliationGroupId =
  | 'political-government'
  | 'listed-company'
  | 'business'
  | 'foundation'
  | 'nonprofit';

type AffiliationGroupDefinition = {
  id: AffiliationGroupId;
  label: string;
  shortLabel: string;
  /** Shape marker so the group is never conveyed by colour alone. */
  marker: string;
  color: string;
};

export const AFFILIATION_GROUPS: readonly AffiliationGroupDefinition[] = [
  {
    id: 'political-government',
    label: '政治與政府',
    shortLabel: '政治',
    marker: '●',
    color: '#2f5d7c',
  },
  {
    id: 'listed-company',
    label: '上市櫃公司',
    shortLabel: '上市櫃',
    marker: '■',
    color: '#2f817e',
  },
  {
    id: 'business',
    label: '企業與集團',
    shortLabel: '企業',
    marker: '◆',
    color: '#b0673f',
  },
  {
    id: 'foundation',
    label: '基金會',
    shortLabel: '基金會',
    marker: '▲',
    color: '#7a5c9e',
  },
  {
    id: 'nonprofit',
    label: '非營利組織',
    shortLabel: '非營利',
    marker: '○',
    color: '#5f7a35',
  },
];

export const POSITION_CATEGORY_LABELS: Record<PositionCategory, string> = {
  political: '政治職務',
  public_office: '公職',
  executive: '經營團隊',
  board: '董事會',
  organizational_leadership: '組織領導',
};

export const LISTING_STATUS_LABELS: Record<ListingStatus, string> = {
  listed: '上市',
  otc: '上櫃',
  unlisted: '未上市櫃',
  unknown: '未確認',
};

export const AFFILIATION_STATUS_LABELS: Record<PoliticalCareerStatus, string> =
  {
    'current-officeholder': '現任',
    'former-officeholder': '曾任',
    'current-candidate': '目前參選',
    'former-candidate': '曾參選',
    'political-appointee': '政治任命',
    'party-official': '政黨職務',
    'historical-status-unknown': '期間未詳',
  };

function isCorporate(affiliation: Affiliation): boolean {
  return (
    affiliation.organizationType === 'corporation' ||
    affiliation.organizationType === 'business_group'
  );
}

export function affiliationGroupOf(
  affiliation: Affiliation,
): AffiliationGroupId {
  switch (affiliation.organizationType) {
    case 'government':
    case 'legislature':
    case 'political_organization':
      return 'political-government';
    case 'corporation':
      return affiliation.listingStatus === 'listed' ||
        affiliation.listingStatus === 'otc'
        ? 'listed-company'
        : 'business';
    case 'business_group':
      return 'business';
    case 'foundation':
      return 'foundation';
    case 'nonprofit':
      return 'nonprofit';
  }
}

export function groupAffiliations(
  affiliations: Affiliation[],
): Array<{ group: AffiliationGroupDefinition; affiliations: Affiliation[] }> {
  return AFFILIATION_GROUPS.map((group) => ({
    group,
    affiliations: affiliations.filter(
      (affiliation) => affiliationGroupOf(affiliation) === group.id,
    ),
  })).filter((entry) => entry.affiliations.length > 0);
}

export function affiliationSummary(affiliations: Affiliation[]): string {
  const groups = groupAffiliations(affiliations);
  if (groups.length === 0) return '尚無已查證職務';
  return groups
    .map((entry) => `${entry.group.shortLabel} ${entry.affiliations.length}`)
    .join(' · ');
}

export function affiliationPeriodLabel(
  startDate: string | null,
  endDate: string | null,
): string {
  if (startDate && endDate) return `${startDate} 至 ${endDate}`;
  if (startDate) return `${startDate} 起`;
  if (endDate) return `至 ${endDate}`;
  return '日期未詳';
}

export function affiliationRowMeta(affiliation: Affiliation): string[] {
  const meta = [POSITION_CATEGORY_LABELS[affiliation.positionCategory]];
  if (isCorporate(affiliation)) {
    meta.push(LISTING_STATUS_LABELS[affiliation.listingStatus ?? 'unknown']);
  }
  meta.push(AFFILIATION_STATUS_LABELS[affiliation.status]);
  meta.push(affiliationPeriodLabel(affiliation.startDate, affiliation.endDate));
  return meta;
}

function relationshipsForPerson(
  personId: string,
  relationships: PoliticalFamilyPublicRelationship[],
): PoliticalFamilyPublicRelationship[] {
  return relationships.filter(
    (relationship) =>
      relationship.personAId === personId ||
      relationship.personBId === personId,
  );
}

function personRelationshipLabel(
  personId: string,
  candidatePersonId: string,
  relationships: PoliticalFamilyPublicRelationship[],
): string {
  if (personId === candidatePersonId) return '候選人';
  const labels = relationships.map((relationship) =>
    relationship.personAId === personId
      ? relationship.personALabel
      : relationship.personBLabel,
  );
  return [...new Set(labels)].join('、') || '候選人親屬';
}

function sourceList(
  sourceIds: string[],
  sourcesById: Map<string, PoliticalFamilyPublicSource>,
): PoliticalFamilyPublicSource[] {
  return sourceIds
    .map((sourceId) => sourcesById.get(sourceId))
    .filter((source): source is PoliticalFamilyPublicSource => Boolean(source));
}

function FamilyNode({
  person,
  point,
  isCandidate,
  selected,
  onSelect,
}: {
  person: PoliticalPerson;
  point: Point;
  isCandidate: boolean;
  selected: boolean;
  onSelect: () => void;
}) {
  const hint = affiliationSummary(person.affiliations);
  const firstAffiliation = person.affiliations[0];
  return (
    <g
      className={`political-family-node ${isCandidate ? 'is-candidate' : ''} ${selected ? 'is-selected' : ''}`}
      data-family-node="true"
      data-testid={`family-node-${person.id}`}
      transform={`translate(${point.x} ${point.y})`}
    >
      <foreignObject
        x={-NODE_WIDTH / 2}
        y={-NODE_HEIGHT / 2}
        width={NODE_WIDTH}
        height={NODE_HEIGHT}
      >
        <button
          className="political-family-node__button"
          type="button"
          aria-label={`${person.displayName}，${hint}`}
          onClick={(event) => {
            event.stopPropagation();
            onSelect();
          }}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <span className="political-family-node__name">
            {person.displayName}
          </span>
          <span className="political-family-node__career">{hint}</span>
          <span className="political-family-node__status">
            {isCandidate
              ? '2026 候選人'
              : firstAffiliation
                ? AFFILIATION_STATUS_LABELS[firstAffiliation.status]
                : '職務資料'}
          </span>
        </button>
      </foreignObject>
    </g>
  );
}

function SourceLinks({
  sourceIds,
  sourcesById,
}: {
  sourceIds: string[];
  sourcesById: Map<string, PoliticalFamilyPublicSource>;
}) {
  const sources = sourceList(sourceIds, sourcesById);
  if (sources.length === 0)
    return <p className="info-note">來源連結未載明。</p>;
  return (
    <ul className="political-family-sources">
      {sources.map((source) => (
        <li key={source.id}>
          <a href={source.url} target="_blank" rel="noreferrer">
            {source.publisher}：{source.title}
          </a>
        </li>
      ))}
    </ul>
  );
}

function AffiliationGroups({
  affiliations,
  sourcesById,
  showSources,
}: {
  affiliations: Affiliation[];
  sourcesById: Map<string, PoliticalFamilyPublicSource>;
  showSources: boolean;
}) {
  const groups = groupAffiliations(affiliations);
  if (groups.length === 0) {
    return <p className="info-note">尚無已查證職務資料。</p>;
  }
  return (
    <div
      className="political-family-affiliation-groups"
      style={{ display: 'grid', gap: '0.5rem', minWidth: 0 }}
    >
      {groups.map(({ group, affiliations: rows }) => (
        <section
          key={group.id}
          className="political-family-affiliation-group"
          data-testid={`affiliation-group-${group.id}`}
          style={{ display: 'grid', gap: '0.3rem', minWidth: 0 }}
        >
          <h5
            className="political-family-affiliation-group__heading"
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              gap: '0.2rem 0.4rem',
              margin: 0,
              color: group.color,
              fontSize: '0.72rem',
              fontWeight: 950,
            }}
          >
            <span aria-hidden="true">{group.marker}</span>
            <span>{group.label}</span>
            <span
              className="political-family-affiliation-group__count"
              style={{ color: 'rgba(41, 72, 88, 0.62)', fontWeight: 800 }}
            >
              {rows.length} 項
            </span>
          </h5>
          <ul className="political-family-careers">
            {rows.map((affiliation) => (
              <li
                key={affiliation.id}
                data-testid={`affiliation-${affiliation.id}`}
                style={{
                  borderLeft: `3px solid ${group.color}`,
                  paddingLeft: '0.5rem',
                  minWidth: 0,
                  overflowWrap: 'anywhere',
                }}
              >
                <strong>{affiliation.positionTitle}</strong>
                <span>{affiliation.organization}</span>
                <span>{affiliationRowMeta(affiliation).join('・')}</span>
                {showSources ? (
                  <SourceLinks
                    sourceIds={affiliation.sourceIds}
                    sourcesById={sourcesById}
                  />
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function FamilyDetails({
  person,
  candidatePersonId,
  relationships,
  selectedRelationship,
  peopleById,
  sourcesById,
}: {
  person: PoliticalPerson;
  candidatePersonId: string;
  relationships: PoliticalFamilyPublicRelationship[];
  selectedRelationship: PoliticalFamilyPublicRelationship | undefined;
  peopleById: Map<string, PoliticalPerson>;
  sourcesById: Map<string, PoliticalFamilyPublicSource>;
}) {
  const kinshipSourceIds = [
    ...new Set(
      relationships.flatMap((relationship) => relationship.kinshipSourceIds),
    ),
  ];
  const relationshipPersonA = selectedRelationship
    ? peopleById.get(selectedRelationship.personAId)
    : undefined;
  const relationshipPersonB = selectedRelationship
    ? peopleById.get(selectedRelationship.personBId)
    : undefined;
  return (
    <aside
      className="political-family-details"
      aria-live="polite"
      data-testid="family-details"
    >
      {selectedRelationship && relationshipPersonA && relationshipPersonB ? (
        <>
          <h4>所選關係</h4>
          <p>
            <strong>關係：</strong>
            {relationshipPersonA.displayName}・
            {selectedRelationship.relationshipLabel}・
            {relationshipPersonB.displayName}
          </p>
          <h4>親屬關係來源</h4>
          <SourceLinks
            sourceIds={selectedRelationship.kinshipSourceIds}
            sourcesById={sourcesById}
          />
          <h4>職務來源</h4>
          <SourceLinks
            sourceIds={selectedRelationship.positionSourceIds}
            sourcesById={sourcesById}
          />
        </>
      ) : null}
      <h4>人物資訊</h4>
      <p>
        <strong>姓名：</strong>
        {person.displayName}
      </p>
      <p>
        <strong>與候選人關係：</strong>
        {personRelationshipLabel(person.id, candidatePersonId, relationships)}
      </p>
      <h4>職務與經歷</h4>
      <AffiliationGroups
        affiliations={person.affiliations}
        sourcesById={sourcesById}
        showSources
      />
      {relationships.length > 0 ? (
        <>
          <h4>親屬關係來源</h4>
          <SourceLinks sourceIds={kinshipSourceIds} sourcesById={sourcesById} />
        </>
      ) : null}
    </aside>
  );
}

function EmptyFamilyState({
  researchStatus,
}: {
  researchStatus: PoliticalFamilyReadModel['researchStatus'] | undefined;
}) {
  const unresolved = researchStatus === 'unresolved';
  return (
    <div
      className="political-family-empty content-card"
      data-testid="political-family-empty"
    >
      <h4>家族政商關係</h4>
      <p>
        {unresolved
          ? '家族關係資料仍在查核中，目前尚無已查證且符合收錄條件的親屬資料。'
          : '目前尚無已查證且符合收錄條件的親屬資料。'}
      </p>
      <p className="info-note">{NEUTRAL_RELATION_NOTE}</p>
    </div>
  );
}

export default function PoliticalFamilyGraph({
  candidate,
  politicalFamily,
}: {
  candidate: PublicCandidateProfile;
  politicalFamily?: PoliticalFamilyReadModel;
}) {
  const family = politicalFamily ?? candidate.politicalFamily;
  const [selectedId, setSelectedId] = useState(candidate.person.id);
  const [selectedRelationshipId, setSelectedRelationshipId] = useState<
    string | null
  >(null);
  const [pan, setPan] = useState<Point>({ x: 0, y: 0 });
  const [canvasWidth, setCanvasWidth] = useState(GRAPH_WIDTH);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const familyResetKey = `${family?.people.map((person) => person.id).join(',') ?? ''}|${family?.relationships.map((relationship) => relationship.id).join(',') ?? ''}`;

  useEffect(() => {
    void familyResetKey;
    setSelectedId(candidate.person.id);
    setSelectedRelationshipId(null);
    setPan({ x: 0, y: 0 });
    dragRef.current = null;
  }, [candidate.person.id, familyResetKey]);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const measure = () => {
      const width = Math.round(canvas.getBoundingClientRect().width);
      if (width > 0) {
        setCanvasWidth((currentWidth) =>
          currentWidth === width ? currentWidth : width,
        );
      }
    };
    measure();

    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);

  const sourcesById = useMemo(
    () => new Map((family?.sources ?? []).map((source) => [source.id, source])),
    [family?.sources],
  );
  const layout = useMemo(
    () =>
      buildPoliticalFamilyGraphLayout(
        family?.people ?? [],
        family?.relationships ?? [],
        candidate.person.id,
        canvasWidth,
      ),
    [candidate.person.id, canvasWidth, family?.people, family?.relationships],
  );
  const visiblePan = clampPan(pan, layout);

  const legendGroups = useMemo(
    () =>
      AFFILIATION_GROUPS.filter((group) =>
        layout.people.some((person) =>
          person.affiliations.some(
            (affiliation) => affiliationGroupOf(affiliation) === group.id,
          ),
        ),
      ),
    [layout.people],
  );

  const selectedPerson =
    layout.people.find((person) => person.id === selectedId) ??
    layout.candidatePerson ??
    layout.people[0];
  const selectedRelationships = selectedPerson
    ? relationshipsForPerson(selectedPerson.id, family?.relationships ?? [])
    : [];
  const selectedRelationship = family?.relationships.find(
    (relationship) => relationship.id === selectedRelationshipId,
  );
  const hasUnresolvedEndpoint = Boolean(
    family?.relationships.some(
      (relationship) =>
        !layout.points.has(relationship.personAId) ||
        !layout.points.has(relationship.personBId),
    ),
  );
  const hasGraph = Boolean(
    family &&
      !hasUnresolvedEndpoint &&
      layout.candidatePerson &&
      layout.people.length > 1 &&
      family.relationships.length > 0,
  );

  if (family && hasUnresolvedEndpoint) {
    return (
      <section
        className="political-family-graph"
        data-testid="political-family-graph"
      >
        <div className="political-family-empty content-card" role="alert">
          <h4>家族政商關係</h4>
          <p>家族關係資料目前無法顯示。</p>
        </div>
      </section>
    );
  }

  if (!family || !hasGraph || !selectedPerson) {
    return (
      <section
        className="political-family-graph"
        data-testid="political-family-graph"
      >
        <EmptyFamilyState researchStatus={family?.researchStatus} />
      </section>
    );
  }

  const onPointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    dragRef.current = {
      x: event.clientX,
      y: event.clientY,
      panX: visiblePan.x,
      panY: visiblePan.y,
      scaleX: layout.width / Math.max(bounds.width, 1),
      scaleY: layout.height / Math.max(bounds.height, 1),
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onPointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    setPan(
      clampPan(
        {
          x: drag.panX + (event.clientX - drag.x) * drag.scaleX,
          y: drag.panY + (event.clientY - drag.y) * drag.scaleY,
        },
        layout,
      ),
    );
  };
  const endPan = (event: ReactPointerEvent<SVGSVGElement>) => {
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  return (
    <section
      className="political-family-graph"
      data-testid="political-family-graph"
    >
      <div className="profile-section-heading">
        <h3>家族政商關係</h3>
        <p>
          僅呈現具公開來源支持的親屬關係，以及這些親屬的政治、企業、基金會與非營利組織職務，不推論未公開的家庭成員。
        </p>
      </div>
      <fieldset className="political-family-toolbar">
        <legend className="sr-only">家族政商關係圖控制項</legend>
        <button
          type="button"
          className="tab-button"
          onClick={() => {
            setPan({ x: 0, y: 0 });
          }}
        >
          符合視圖
        </button>
        <span className="info-note">可拖曳，選取節點查看資料。</span>
      </fieldset>
      {legendGroups.length > 0 ? (
        <ul
          className="political-family-legend"
          data-testid="political-family-legend"
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '0.3rem 0.7rem',
            margin: 0,
            padding: 0,
            listStyle: 'none',
            color: 'rgba(41, 72, 88, 0.78)',
            fontSize: '0.7rem',
            fontWeight: 800,
          }}
        >
          {legendGroups.map((group) => (
            <li key={group.id}>
              <span aria-hidden="true" style={{ color: group.color }}>
                {group.marker}
              </span>{' '}
              {group.label}
            </li>
          ))}
        </ul>
      ) : null}
      <div ref={canvasRef} className="political-family-canvas">
        <svg
          className="political-family-svg"
          viewBox={`0 0 ${layout.width} ${layout.height}`}
          aria-labelledby="political-family-graph-title"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endPan}
          onPointerCancel={endPan}
        >
          <title id="political-family-graph-title">候選人家族政商關係圖</title>
          <g transform={`translate(${visiblePan.x} ${visiblePan.y})`}>
            {layout.edges.map((edge) => {
              const { relationship } = edge;
              const personA = layout.people.find(
                (person) => person.id === relationship.personAId,
              );
              const personB = layout.people.find(
                (person) => person.id === relationship.personBId,
              );
              const relationLabel = [
                personA?.displayName ?? relationship.personAId,
                relationship.relationshipLabel,
                personB?.displayName ?? relationship.personBId,
              ].join('・');
              return (
                <g key={relationship.id} className="political-family-edge">
                  <line
                    x1={edge.pointA.x}
                    y1={edge.pointA.y}
                    x2={edge.pointB.x}
                    y2={edge.pointB.y}
                  />
                  <foreignObject
                    x={edge.labelBounds.x}
                    y={edge.labelBounds.y}
                    width={edge.labelBounds.width}
                    height={edge.labelBounds.height}
                  >
                    <button
                      className="political-family-edge__button"
                      type="button"
                      aria-label={relationLabel}
                      aria-pressed={selectedRelationshipId === relationship.id}
                      data-testid={`family-relationship-${relationship.id}`}
                      data-family-edge-label="true"
                      data-label-lines={edge.label.lines.length}
                      onPointerDown={(event) => event.stopPropagation()}
                      onClick={(event) => {
                        event.stopPropagation();
                        setSelectedId(relationship.personAId);
                        setSelectedRelationshipId(relationship.id);
                      }}
                    >
                      {edge.label.lines.map((line) => (
                        <span key={`${relationship.id}-label-${line}`}>
                          {line || '\u00a0'}
                        </span>
                      ))}
                    </button>
                  </foreignObject>
                </g>
              );
            })}
            {layout.people.map((person) => {
              const point = layout.points.get(person.id);
              if (!point) return null;
              return (
                <FamilyNode
                  key={person.id}
                  person={person}
                  point={point}
                  isCandidate={person.id === candidate.person.id}
                  selected={person.id === selectedPerson.id}
                  onSelect={() => {
                    setSelectedId(person.id);
                    setSelectedRelationshipId(null);
                  }}
                />
              );
            })}
          </g>
        </svg>
      </div>
      <div className="political-family-selection">
        <FamilyDetails
          person={selectedPerson}
          candidatePersonId={candidate.person.id}
          relationships={selectedRelationships}
          selectedRelationship={selectedRelationship}
          peopleById={
            new Map(layout.people.map((person) => [person.id, person]))
          }
          sourcesById={sourcesById}
        />
      </div>
      <details className="political-family-text" open>
        <summary>以文字查看家族政商關係</summary>
        <ul>
          {family.relationships.map((relationship) => {
            const personA = layout.people.find(
              (person) => person.id === relationship.personAId,
            );
            const personB = layout.people.find(
              (person) => person.id === relationship.personBId,
            );
            if (!personA || !personB) return null;
            return (
              <li key={relationship.id}>
                <strong>
                  {personA.displayName}－{relationship.relationshipLabel}－
                  {personB.displayName}
                </strong>
                {[personA, personB].map((person) => (
                  <div
                    key={person.id}
                    className="political-family-text__person"
                    style={{ display: 'grid', gap: '0.2rem', minWidth: 0 }}
                  >
                    <span>
                      {person.displayName}：
                      {affiliationSummary(person.affiliations)}
                    </span>
                    <AffiliationGroups
                      affiliations={person.affiliations}
                      sourcesById={sourcesById}
                      showSources={false}
                    />
                  </div>
                ))}
              </li>
            );
          })}
        </ul>
      </details>
      <p className="info-note">{NEUTRAL_RELATION_NOTE}</p>
    </section>
  );
}
