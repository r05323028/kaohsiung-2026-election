import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import approvedRoster from '../data/approved/2026/kaohsiung-election.json';
import policyResearchInput from '../data/policy-research/2026/full-roster.json';
import { cleanHtml, parseKccProfile } from '../src/data/biographies/adapters';
import {
  type OfficialCandidate,
  type OfficialDataset,
  validateOfficialDataset,
} from '../src/data/official/schema';
import {
  type PolicyResearchDataset,
  type PolicySourceSnapshot,
  validatePolicyResearchDataset,
} from '../src/data/policy-research/schema';
import {
  type EnrichmentCandidateAudit,
  type EnrichmentCareerRecord,
  type EnrichmentClaim,
  type EnrichmentEvidence,
  type EnrichmentPolicyReference,
  type EnrichmentPositionRecord,
  type PublicRecordsEnrichmentDataset,
  validatePublicRecordsEnrichmentDataset,
} from '../src/data/public-records/enrichment-schema';

const ROOT = process.cwd();
const SNAPSHOT_DATE = '2026-11-10';
const RESEARCH_CUTOFF = '2026-11-09';
const ROSTER_SNAPSHOT_DATE = '2026-11-05';
const KCC_SNAPSHOT_DATE = '2026-11-06';
const POLICY_DATASET_PATH = 'data/policy-research/2026/full-roster.json';
const OUTPUT_PATH =
  'data/public-records/research-enrichment/2026/full-roster.json';
const SUMMARY_PATH =
  'data/public-records/research-enrichment/2026/summary.json';

const STATUS = {
  verificationStatus: 'machine-validated' as const,
  reviewStatus: 'pending-human-review' as const,
  publicationStatus: 'withheld-pending-review' as const,
};

type Candidate = OfficialCandidate;
type KccProfile = {
  source: PolicySourceSnapshot;
  candidate: Candidate;
  observedName: string;
  education: string[];
  experience: string[];
};

function absolute(path: string): string {
  return join(ROOT, path);
}

function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function hashFile(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function validateRetainedUpstreamSources(dataset: PolicyResearchDataset): void {
  for (const source of dataset.sourceSnapshots) {
    if (source.retrievalStatus !== 'retrieved') continue;
    if (
      !source.rawPath ||
      source.sha256 === null ||
      source.byteLength === null
    ) {
      throw new Error(
        `Retrieved upstream source lacks retention metadata: ${source.sourceId}`,
      );
    }
    const path = absolute(source.rawPath);
    if (!existsSync(path))
      throw new Error(`Missing upstream source bytes: ${path}`);
    const actualSize = statSync(path).size;
    const actualHash = hashFile(path);
    if (actualSize !== source.byteLength) {
      throw new Error(
        `Upstream source byte length mismatch for ${source.sourceId}: expected ${source.byteLength}, got ${actualSize}`,
      );
    }
    if (actualHash !== source.sha256) {
      throw new Error(
        `Upstream source SHA-256 mismatch for ${source.sourceId}`,
      );
    }
  }
}

function cleanItem(value: string): string {
  return cleanHtml(value).replace(/\\s+/g, ' ').trim();
}

function stopBeforeServicePolicies(items: string[]): string[] {
  const serviceIndex = items.findIndex((item) => item.includes('服務政見'));
  return (serviceIndex >= 0 ? items.slice(0, serviceIndex) : items)
    .map(cleanItem)
    .filter(Boolean);
}

function classifyCareerCategory(
  value: string,
): EnrichmentCareerRecord['category'] {
  if (/(議員|立法委員|市長|里長|區長|局長|代表|公職)/.test(value)) {
    return 'public-office';
  }
  if (
    /(黨團|競選總部|委員會|協會|基金會|理事|主任委員|副主任委員)/.test(value)
  ) {
    return 'organizational-role';
  }
  if (/(大學|大專|高中|高職|國中|國小|碩士|博士|學士)/.test(value)) {
    return 'education';
  }
  return 'professional';
}

function readKccProfiles(
  roster: OfficialDataset,
  policyDataset: PolicyResearchDataset,
): KccProfile[] {
  const candidateById = new Map(
    roster.candidates.map((candidate) => [candidate.id, candidate]),
  );
  const profiles: KccProfile[] = [];
  for (const source of policyDataset.sourceSnapshots) {
    if (
      !source.url.includes('kcc.gov.tw/MemberInfo_New.aspx') ||
      source.identityStatus !== 'resolved' ||
      source.candidateIds.length !== 1 ||
      source.rawPath === null
    ) {
      continue;
    }
    const candidateId = source.candidateIds[0];
    if (!candidateId) continue;
    const candidate = candidateById.get(candidateId);
    if (!candidate)
      throw new Error(
        `KCC source references unknown roster candidate: ${candidateId}`,
      );
    const html = readFileSync(absolute(source.rawPath), 'utf8');
    const parsed = parseKccProfile(
      html,
      source.sourceId.replace('policy-kcc-profile-', ''),
    );
    if (!parsed)
      throw new Error(
        `Unable to parse retained KCC profile: ${source.sourceId}`,
      );
    if (parsed.observedName !== candidate.displayName) {
      throw new Error(
        `KCC identity mismatch for ${source.sourceId}: ${parsed.observedName} vs ${candidate.displayName}`,
      );
    }
    profiles.push({
      source,
      candidate,
      observedName: parsed.observedName,
      education: parsed.education.map(cleanItem).filter(Boolean),
      experience: stopBeforeServicePolicies(parsed.experience),
    });
  }
  return profiles.sort((left, right) =>
    left.candidate.id.localeCompare(right.candidate.id),
  );
}

function makeClaim(
  candidate: Candidate,
  claimId: string,
  predicate: string,
  objectValue: string,
  originalStatement: string,
  evidenceId: string,
): EnrichmentClaim {
  return {
    claimId,
    candidateId: candidate.id,
    personId: `person-${candidate.slug}`,
    claimType:
      predicate === 'current-office' ? 'position-held' : 'career-event',
    predicate,
    objectValue,
    originalStatement,
    assertedAt: KCC_SNAPSHOT_DATE,
    attribution: 'institutional-profile',
    ...STATUS,
    evidenceIds: [evidenceId],
  };
}

function makeEvidence(
  candidate: Candidate,
  source: PolicySourceSnapshot,
  evidenceId: string,
  claimId: string,
  location: string,
  quotedText: string,
): EnrichmentEvidence {
  return {
    evidenceId,
    claimId,
    candidateId: candidate.id,
    personId: `person-${candidate.slug}`,
    sourceId: source.sourceId,
    evidenceType: 'institutional-profile',
    supportType: 'supports',
    documentLocation: location,
    quotedText,
    retrievedAt: KCC_SNAPSHOT_DATE,
    identityBasis: source.identityBasis,
  };
}

function createKccRecords(profiles: KccProfile[]): {
  claims: EnrichmentClaim[];
  evidence: EnrichmentEvidence[];
  positions: EnrichmentPositionRecord[];
  careerRecords: EnrichmentCareerRecord[];
} {
  const claims: EnrichmentClaim[] = [];
  const evidence: EnrichmentEvidence[] = [];
  const positions: EnrichmentPositionRecord[] = [];
  const careerRecords: EnrichmentCareerRecord[] = [];

  for (const profile of profiles) {
    const { candidate, source, observedName } = profile;
    const personId = `person-${candidate.slug}`;
    const positionClaimId = `enrichment-claim-${candidate.slug}-current-office`;
    const positionEvidenceId = `enrichment-evidence-${candidate.slug}-current-office`;
    const positionQuote = `本屆議員-${observedName}`;
    claims.push(
      makeClaim(
        candidate,
        positionClaimId,
        'current-office',
        '本屆議員',
        positionQuote,
        positionEvidenceId,
      ),
    );
    evidence.push(
      makeEvidence(
        candidate,
        source,
        positionEvidenceId,
        positionClaimId,
        '頁面標題「本屆議員-姓名」',
        positionQuote,
      ),
    );
    const positionId = `enrichment-position-${candidate.slug}-current-council-member`;
    positions.push({
      id: positionId,
      candidateId: candidate.id,
      personId,
      title: '本屆議員',
      organization: '高雄市議會',
      currentStatus: 'current',
      description:
        '來源頁面將此人列為「本屆議員」；本紀錄不推定任期起訖、個別表決或政策成果。',
      sourceId: source.sourceId,
      claimIds: [positionClaimId],
      evidenceIds: [positionEvidenceId],
      ...STATUS,
    });

    const items = [
      ...profile.education.map((value, index) => ({
        category: 'education' as const,
        prefix: '學歷',
        value,
        index,
      })),
      ...profile.experience.map((value, index) => ({
        category: classifyCareerCategory(value),
        prefix: '經歷',
        value,
        index,
      })),
    ];
    for (const item of items) {
      const safeIndex = item.index + 1;
      const slug = item.prefix === '學歷' ? 'education' : 'experience';
      const claimId = `enrichment-claim-${candidate.slug}-${slug}-${safeIndex}`;
      const evidenceId = `enrichment-evidence-${candidate.slug}-${slug}-${safeIndex}`;
      const recordId = `enrichment-career-${candidate.slug}-${slug}-${safeIndex}`;
      const location = `「學經歷與政見」／${item.prefix}第${safeIndex}項`;
      claims.push(
        makeClaim(
          candidate,
          claimId,
          item.prefix === '學歷' ? 'education-record' : 'prior-role',
          item.value,
          item.value,
          evidenceId,
        ),
      );
      evidence.push(
        makeEvidence(
          candidate,
          source,
          evidenceId,
          claimId,
          location,
          item.value,
        ),
      );
      careerRecords.push({
        id: recordId,
        candidateId: candidate.id,
        personId,
        category: item.category,
        title: `${item.prefix}：${item.value}`,
        originalStatement: item.value,
        neutralSummary:
          item.prefix === '學歷'
            ? `高雄市議會個人頁列出的學歷項目：「${item.value}」。本紀錄僅反映來源頁面文字，未推定學位或就讀期間。`
            : `高雄市議會個人頁列出的經歷項目：「${item.value}」。本紀錄保留來源文字，未推定任職期間或工作成果。`,
        recordedDate: null,
        sourceId: source.sourceId,
        claimIds: [claimId],
        evidenceIds: [evidenceId],
        ...STATUS,
      });
    }
  }
  return { claims, evidence, positions, careerRecords };
}

function policyReferences(
  policyDataset: PolicyResearchDataset,
  candidates: Map<string, Candidate>,
): EnrichmentPolicyReference[] {
  return policyDataset.policies.flatMap((policy) => {
    const candidate = candidates.get(policy.candidateId);
    if (!candidate) return [];
    return [
      {
        policyId: policy.policyId,
        candidateId: candidate.id,
        personId: `person-${candidate.slug}`,
        sourceId: policy.sourceId,
        evidenceId: policy.evidenceId,
        policyContext: policy.policyContext,
        verificationStatus: 'machine-validated' as const,
        reviewStatus: policy.reviewStatus,
        publicationStatus: policy.publicationStatus,
      },
    ];
  });
}

function makeAudits(
  roster: OfficialDataset,
  policyDataset: PolicyResearchDataset,
  references: EnrichmentPolicyReference[],
  positions: EnrichmentPositionRecord[],
  careerRecords: EnrichmentCareerRecord[],
): EnrichmentCandidateAudit[] {
  const policyReferencesByCandidate = new Map<
    string,
    EnrichmentPolicyReference[]
  >();
  for (const reference of references) {
    const list = policyReferencesByCandidate.get(reference.candidateId) ?? [];
    list.push(reference);
    policyReferencesByCandidate.set(reference.candidateId, list);
  }
  const positionsByCandidate = new Map<string, EnrichmentPositionRecord[]>();
  for (const record of positions) {
    const list = positionsByCandidate.get(record.candidateId) ?? [];
    list.push(record);
    positionsByCandidate.set(record.candidateId, list);
  }
  const careersByCandidate = new Map<string, EnrichmentCareerRecord[]>();
  for (const record of careerRecords) {
    const list = careersByCandidate.get(record.candidateId) ?? [];
    list.push(record);
    careersByCandidate.set(record.candidateId, list);
  }
  const attemptsByCandidate = new Map<
    string,
    typeof policyDataset.sourceAttempts
  >();
  for (const attempt of policyDataset.sourceAttempts) {
    const list = attemptsByCandidate.get(attempt.candidateId) ?? [];
    list.push(attempt);
    attemptsByCandidate.set(attempt.candidateId, list);
  }
  return roster.candidates.map((candidate) => {
    const attempts = attemptsByCandidate.get(candidate.id) ?? [];
    const refs = policyReferencesByCandidate.get(candidate.id) ?? [];
    const candidatePositions = positionsByCandidate.get(candidate.id) ?? [];
    const candidateCareers = careersByCandidate.get(candidate.id) ?? [];
    const identityConflict = attempts.some((attempt) =>
      ['unresolved', 'ambiguous', 'conflicted'].includes(
        attempt.identityStatus,
      ),
    );
    const hasRetrievedSource = attempts.some(
      (attempt) => attempt.retrievalStatus === 'retrieved',
    );
    const sourceAttemptIds = attempts.map((attempt) => attempt.attemptId);
    const sourceSnapshotIds = Array.from(
      new Set(
        attempts
          .map((attempt) => attempt.sourceId)
          .filter((sourceId): sourceId is string => sourceId !== null),
      ),
    );
    let outcome: EnrichmentCandidateAudit['outcome'];
    let note: string;
    if (identityConflict) {
      outcome = 'identity-conflict';
      note =
        '候選人相關來源存在未解決的身份或歸屬狀態；本次不將其轉為新的個人紀錄。';
    } else if (candidatePositions.length > 0 || candidateCareers.length > 0) {
      outcome = 'records-found';
      note = `已由保留的高雄市議會個人頁取得 ${candidatePositions.length + candidateCareers.length} 筆待人工審查的基本／從政歷程紀錄；不含個別表決推論。`;
    } else if (refs.length > 0) {
      outcome = 'policy-references-only';
      note = `已保留 ${refs.length} 筆上游政策研究參照；公開狀態沿用上游政策研究發布閘門。`;
    } else if (hasRetrievedSource) {
      outcome = 'sources-attempted-no-additional-records';
      note =
        '已完成有界來源檢索，但目前保留來源未提供可機器驗證的新增基本／從政歷程紀錄；此結果不表示候選人沒有相關資料。';
    } else {
      outcome = 'sources-unavailable';
      note =
        '截至研究截止日，候選人專屬來源未能在保留檔案中取得；這不是候選人沒有相關資料的證據。';
    }
    return {
      candidateId: candidate.id,
      personId: `person-${candidate.slug}`,
      displayName: candidate.displayName,
      districtId: candidate.districtId,
      electionType: candidate.electionType,
      sourceSnapshotIds,
      sourceAttemptIds,
      policyReferenceCount: refs.length,
      positionRecordIds: candidatePositions.map((record) => record.id),
      careerRecordIds: candidateCareers.map((record) => record.id),
      newsRecordCount: 0,
      proposalRecordCount: 0,
      individualVoteRecordCount: 0,
      executiveInitiativeRecordCount: 0,
      outcome,
      researchStatus: 'completed' as const,
      note,
      isNegativeEvidence: false as const,
      ...STATUS,
    };
  });
}

function buildDataset(
  roster: OfficialDataset,
  policyDataset: PolicyResearchDataset,
): PublicRecordsEnrichmentDataset {
  validateRetainedUpstreamSources(policyDataset);
  const profiles = readKccProfiles(roster, policyDataset);
  const records = createKccRecords(profiles);
  const candidateMap = new Map(
    roster.candidates.map((candidate) => [candidate.id, candidate]),
  );
  const references = policyReferences(policyDataset, candidateMap);
  const audits = makeAudits(
    roster,
    policyDataset,
    references,
    records.positions,
    records.careerRecords,
  );
  const sourceSnapshots = policyDataset.sourceSnapshots.map((source) => ({
    ...source,
  }));
  const sourceAttempts = policyDataset.sourceAttempts.map((attempt) => ({
    ...attempt,
  }));
  const dataset = {
    datasetId: 'kaohsiung-2026-public-records-enrichment',
    snapshotDate: SNAPSHOT_DATE,
    researchCutoff: RESEARCH_CUTOFF,
    rosterSnapshotDate: ROSTER_SNAPSHOT_DATE,
    candidateCount: roster.candidates.length,
    upstreamPolicyResearch: {
      datasetId: policyDataset.datasetId,
      datasetPath: POLICY_DATASET_PATH,
      sourceSnapshotCount: policyDataset.sourceSnapshots.length,
      sourceAttemptCount: policyDataset.sourceAttempts.length,
      policyCount: policyDataset.policies.length,
      sourceSnapshots,
      sourceAttempts,
    },
    sourceSnapshots,
    sourceAttempts,
    claims: records.claims,
    evidence: records.evidence,
    positions: records.positions,
    careerRecords: records.careerRecords,
    policyReferences: references,
    audits,
    coverageAssertions: {
      individualVoteRecords: 0,
      executiveInitiativeRecords: 0,
      relationshipRecords: 0,
      newsRecordsAdded: 0,
      proposalsAdded: 0,
      publishedRecords: 0,
    },
    review: {
      status: 'pending-human-review' as const,
      reviewerId: null,
      reviewedAt: null,
      approvedRecordCount: 0,
      publishedRecordCount: 0,
      note: '本資料集僅保存機器驗證、待人工審查的研究結果；未取得人工審查或編輯核准，不得進入公開靜態資料。',
    },
  };
  return validatePublicRecordsEnrichmentDataset(dataset);
}

function buildSummary(dataset: PublicRecordsEnrichmentDataset) {
  const sourceById = new Map(
    dataset.sourceSnapshots.map((source) => [source.sourceId, source]),
  );
  const attemptById = new Map(
    dataset.sourceAttempts.map((attempt) => [attempt.attemptId, attempt]),
  );
  const claimCountByCandidate = new Map<string, number>();
  for (const claim of dataset.claims) {
    claimCountByCandidate.set(
      claim.candidateId,
      (claimCountByCandidate.get(claim.candidateId) ?? 0) + 1,
    );
  }
  const evidenceCountByCandidate = new Map<string, number>();
  for (const evidence of dataset.evidence) {
    evidenceCountByCandidate.set(
      evidence.candidateId,
      (evidenceCountByCandidate.get(evidence.candidateId) ?? 0) + 1,
    );
  }

  return {
    datasetId: dataset.datasetId,
    snapshotDate: dataset.snapshotDate,
    researchCutoff: dataset.researchCutoff,
    candidateCount: dataset.candidateCount,
    audits: dataset.audits.map((audit) => {
      const attempts = audit.sourceAttemptIds
        .map((attemptId) => attemptById.get(attemptId))
        .filter((attempt) => attempt !== undefined);
      const sources = audit.sourceSnapshotIds
        .map((sourceId) => sourceById.get(sourceId))
        .filter((source) => source !== undefined);
      const pendingPositionCount = audit.positionRecordIds.length;
      const pendingCareerRecordCount = audit.careerRecordIds.length;
      const pendingPolicyReferenceCount = audit.policyReferenceCount;
      return {
        candidateId: audit.candidateId,
        outcome: audit.outcome,
        researchStatus: audit.researchStatus,
        sourceAttemptCount: attempts.length,
        retrievedSourceAttemptCount: attempts.filter(
          (attempt) => attempt.retrievalStatus === 'retrieved',
        ).length,
        retainedSourceCount: sources.filter(
          (source) => source.retrievalStatus === 'retrieved',
        ).length,
        resolvedSourceCount: sources.filter(
          (source) => source.identityStatus === 'resolved',
        ).length,
        pendingClaimCount: claimCountByCandidate.get(audit.candidateId) ?? 0,
        pendingEvidenceCount:
          evidenceCountByCandidate.get(audit.candidateId) ?? 0,
        pendingPositionCount,
        pendingCareerRecordCount,
        pendingPolicyReferenceCount,
        pendingRecordCount:
          pendingPositionCount +
          pendingCareerRecordCount +
          pendingPolicyReferenceCount,
        publishedRecordCount: 0,
        note: audit.note,
      };
    }),
  };
}

function main(): void {
  const roster = validateOfficialDataset(approvedRoster);
  const policyDataset = validatePolicyResearchDataset(policyResearchInput);
  if (roster.candidates.length !== 106) {
    throw new Error(
      `Expected 106 roster candidates, got ${roster.candidates.length}`,
    );
  }
  const dataset = buildDataset(roster, policyDataset);
  writeJson(absolute(OUTPUT_PATH), dataset);
  writeJson(absolute(SUMMARY_PATH), buildSummary(dataset));
  console.log(
    `Generated public-record enrichment: ${dataset.audits.length} candidates, ${dataset.claims.length} claims, ${dataset.positions.length} positions, ${dataset.careerRecords.length} career records, ${dataset.policyReferences.length} policy references, ${dataset.sourceSnapshots.length} sources, 0 published.`,
  );
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
