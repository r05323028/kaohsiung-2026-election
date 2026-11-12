import type { PointerEvent as ReactPointerEvent } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { PublicCandidateProfile } from '../data';
import type {
  PoliticalFamilyPublicRelationship,
  PoliticalFamilyPublicSource,
  PoliticalFamilyReadModel,
  PoliticalPerson,
} from '../data/political-family';

type Point = { x: number; y: number };
type DragState = { x: number; y: number; panX: number; panY: number };

const GRAPH_WIDTH = 780;
const GRAPH_HEIGHT = 500;

const CAREER_STATUS_LABELS: Record<string, string> = {
  'current-officeholder': '現任公職',
  'former-officeholder': '曾任公職',
  'current-candidate': '目前參選',
  'former-candidate': '曾參選',
  'political-appointee': '政治任命',
  'party-official': '政黨職務',
  'historical-status-unknown': '政治經歷時間未明',
};

function careerSummary(person: PoliticalPerson): string {
  if (person.politicalCareer.length === 0) return '政治經歷未列示';
  const first = person.politicalCareer[0];
  return (
    (person.politicalCareer.length > 1
      ? `${first?.officeTitle ?? ''}等 ${person.politicalCareer.length} 項經歷`
      : first?.officeTitle) ?? '政治經歷未列示'
  );
}

function careerPeriod(
  startDate: string | null,
  endDate: string | null,
): string {
  if (startDate && endDate) return `${startDate}–${endDate}`;
  if (startDate) return `${startDate}起`;
  if (endDate) return `至${endDate}`;
  return '日期未載明';
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
          aria-label={`${person.displayName}，${careerSummary(person)}`}
          onClick={(event) => {
            event.stopPropagation();
            onSelect();
          }}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <span className="political-family-node__name">
            {person.displayName}
          </span>
          <span className="political-family-node__career">
            {careerSummary(person)}
          </span>
          <span className="political-family-node__status">
            {isCandidate
              ? '2026 候選人'
              : person.politicalCareer[0]
                ? CAREER_STATUS_LABELS[person.politicalCareer[0].status]
                : '政治經歷'}
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
  const careerSourceIds = [
    ...new Set(person.politicalCareer.flatMap((career) => career.sourceIds)),
  ];
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
          <h4>政治經歷來源</h4>
          <SourceLinks
            sourceIds={selectedRelationship.careerSourceIds}
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
      {person.politicalCareer.length > 0 ? (
        <>
          <h4>從政經歷</h4>
          <ul className="political-family-careers">
            {person.politicalCareer.map((career) => (
              <li key={career.id}>
                <strong>{career.officeTitle}</strong>
                <span>{career.organization}</span>
                <span>
                  {CAREER_STATUS_LABELS[career.status] ?? career.status}・
                  {careerPeriod(career.startDate, career.endDate)}
                </span>
              </li>
            ))}
          </ul>
          <h4>政治經歷來源</h4>
          <SourceLinks sourceIds={careerSourceIds} sourcesById={sourcesById} />
        </>
      ) : null}
      {relationships.length > 0 ? (
        <>
          <h4>親屬關係來源</h4>
          <SourceLinks sourceIds={kinshipSourceIds} sourcesById={sourcesById} />
        </>
      ) : null}
    </aside>
  );
}

function EmptyFamilyState({ unresolved }: { unresolved: boolean }) {
  return (
    <div
      className="political-family-empty content-card"
      data-testid="political-family-empty"
    >
      <h4>家族從政關係</h4>
      <p>
        {unresolved
          ? '目前仍在查核家族從政資料，尚無可公開的已核實關係。'
          : '尚無可核實的公開家族從政資料。'}
      </p>
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
          <h4>家族從政關係</h4>
          <p>家族從政資料目前無法顯示。</p>
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
        <EmptyFamilyState
          unresolved={family?.researchStatus === 'unresolved'}
        />
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
  const selectedSourceIds = [
    ...new Set([
      ...selectedPerson.politicalCareer.flatMap((career) => career.sourceIds),
      ...selectedRelationships.flatMap((relationship) => [
        ...relationship.kinshipSourceIds,
        ...relationship.careerSourceIds,
      ]),
      ...(selectedRelationship?.careerSourceIds ?? []),
    ]),
  ];

  return (
    <section
      className="political-family-graph"
      data-testid="political-family-graph"
    >
      <div className="profile-section-heading">
        <h3>家族從政關係</h3>
        <p>
          僅呈現具公開來源支持的親屬關係與政治經歷，不推論未公開的家庭成員。
        </p>
      </div>
      <fieldset className="political-family-toolbar">
        <legend className="sr-only">家族關係圖控制項</legend>
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
          <title id="political-family-graph-title">候選人家族從政關係圖</title>
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
        <summary>以文字查看家族從政關係</summary>
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
                <span>
                  {careerSummary(personA)}；{careerSummary(personB)}
                </span>
              </li>
            );
          })}
        </ul>
      </details>
      {selectedSourceIds.length > 0 ? (
        <p className="info-note">本圖所選人物或關係的來源已列於人物資訊。</p>
      ) : null}
    </section>
  );
}
