import type { PointerEvent as ReactPointerEvent } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
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
type DragState = { x: number; y: number; panX: number; panY: number };

const GRAPH_WIDTH = 780;
const GRAPH_HEIGHT = 500;

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
      <foreignObject x="-92" y="-42" width="184" height="84">
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
  const dragRef = useRef<DragState | null>(null);
  const familyResetKey = `${family?.people.map((person) => person.id).join(',') ?? ''}|${family?.relationships.map((relationship) => relationship.id).join(',') ?? ''}`;

  useEffect(() => {
    void familyResetKey;
    setSelectedId(candidate.person.id);
    setSelectedRelationshipId(null);
    setPan({ x: 0, y: 0 });
    dragRef.current = null;
  }, [candidate.person.id, familyResetKey]);

  const sourcesById = useMemo(
    () => new Map((family?.sources ?? []).map((source) => [source.id, source])),
    [family?.sources],
  );
  const layout = useMemo(() => {
    const people = family?.people ?? [];
    const candidatePerson = people.find(
      (person) => person.id === candidate.person.id,
    );
    const relatives = people.filter(
      (person) => person.id !== candidatePerson?.id,
    );
    const points = new Map<string, Point>();
    if (candidatePerson)
      points.set(candidatePerson.id, {
        x: GRAPH_WIDTH / 2,
        y: GRAPH_HEIGHT / 2,
      });
    const radiusX = Math.min(280, 150 + relatives.length * 18);
    const radiusY = Math.min(170, 115 + relatives.length * 10);
    relatives.forEach((person, index) => {
      const angle =
        -Math.PI / 2 + (index * 2 * Math.PI) / Math.max(relatives.length, 1);
      points.set(person.id, {
        x: GRAPH_WIDTH / 2 + Math.cos(angle) * radiusX,
        y: GRAPH_HEIGHT / 2 + Math.sin(angle) * radiusY,
      });
    });
    return { people, points, candidatePerson };
  }, [candidate.person.id, family?.people]);

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
    dragRef.current = {
      x: event.clientX,
      y: event.clientY,
      panX: pan.x,
      panY: pan.y,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onPointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    setPan({
      x: drag.panX + (event.clientX - drag.x),
      y: drag.panY + (event.clientY - drag.y),
    });
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
      <div className="political-family-canvas">
        <svg
          className="political-family-svg"
          viewBox={`0 0 ${GRAPH_WIDTH} ${GRAPH_HEIGHT}`}
          aria-labelledby="political-family-graph-title"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endPan}
          onPointerCancel={endPan}
        >
          <title id="political-family-graph-title">候選人家族政商關係圖</title>
          <g transform={`translate(${pan.x} ${pan.y})`}>
            {family.relationships.map((relationship) => {
              const pointA = layout.points.get(relationship.personAId);
              const pointB = layout.points.get(relationship.personBId);
              if (!pointA || !pointB) return null;
              const midpointX = (pointA.x + pointB.x) / 2;
              const midpointY = (pointA.y + pointB.y) / 2;
              const relationLabel = `${
                layout.people.find(
                  (person) => person.id === relationship.personAId,
                )?.displayName ?? relationship.personAId
              }・${relationship.relationshipLabel}・${
                layout.people.find(
                  (person) => person.id === relationship.personBId,
                )?.displayName ?? relationship.personBId
              }`;
              return (
                <g key={relationship.id} className="political-family-edge">
                  <line
                    x1={pointA.x}
                    y1={pointA.y}
                    x2={pointB.x}
                    y2={pointB.y}
                  />
                  <foreignObject
                    x={midpointX - 50}
                    y={midpointY - 16}
                    width="100"
                    height="32"
                  >
                    <button
                      className="political-family-edge__button"
                      type="button"
                      aria-label={relationLabel}
                      aria-pressed={selectedRelationshipId === relationship.id}
                      data-testid={`family-relationship-${relationship.id}`}
                      onPointerDown={(event) => event.stopPropagation()}
                      onClick={(event) => {
                        event.stopPropagation();
                        setSelectedId(relationship.personAId);
                        setSelectedRelationshipId(relationship.id);
                      }}
                    >
                      {relationship.relationshipLabel}
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
