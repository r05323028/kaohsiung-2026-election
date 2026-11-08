import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  cleanHtml,
  parseKccDirectory,
  parseKccProfile,
  readHtml,
} from '../src/data/biographies/adapters';
import {
  assertClaimEvidence,
  type BiographyClaim,
  type BiographyDataset,
  type BiographyEvidence,
  type BiographyIdentityObservation,
  type BiographySourceAttempt,
  validateBiographyDataset,
} from '../src/data/biographies/schema';

type PilotRosterCandidate = {
  id: string;
  slug: string;
  displayName: string;
  shortName: string;
  districtId: string;
  electionYear: number;
  electionType: 'mayoral' | 'city-council' | 'indigenous-council';
  candidateNumber: string | null;
  candidateNumberStatus: string;
  currentPosition: string;
  sourceIds: string[];
};

type OfficialRoster = {
  snapshotDate: string;
  candidates: PilotRosterCandidate[];
};

type OfficialManifestSource = {
  id: string;
  publisher: string;
  title: string;
  canonicalUrl: string;
  rawPath: string;
  sha256: string;
  byteLength?: number;
};

type OfficialManifest = {
  sources: OfficialManifestSource[];
};

type ClaimCheck = {
  claimId: string;
  claimType: BiographyClaim['claimType'];
  title: string;
  value: string;
  currentStatus: BiographyClaim['currentStatus'];
  temporalPrecision: BiographyClaim['temporalPrecision'];
  validFrom: string | null;
  validTo: string | null;
  attribution: BiographyClaim['attribution'];
  auditedAttribution: BiographyClaim['attribution'];
  attributionCaveat: string | null;
  sourceDependency: BiographyClaim['sourceDependency'];
  sourceIds: string[];
  evidenceIds: string[];
  evidenceLinked: boolean;
  evidenceHasContradiction: boolean;
  sourceSupported: boolean;
  verification: 'direct-source-supported' | 'requires-additional-evidence';
  verificationMethod: string;
  blocker: string | null;
};

type SourceInspection = {
  sourceId: string;
  sourceClass: string;
  url: string;
  rawPath: string;
  sha256: string;
  byteLength: number;
  expectedSha256: string | null;
  sha256Matches: boolean;
  byteLengthMatches: boolean | null;
  httpStatus: number | null;
  timestampQuality: string;
  sourceRetrievedAt: string | null;
  publicationDate: string | null;
  role: 'identity-anchor' | 'profile-evidence' | 'directory-corroboration';
};

type CandidateAudit = {
  candidateId: string;
  displayName: string;
  slug: string;
  districtId: string;
  candidateNumber: string | null;
  profileMsn: string;
  claimsPrepared: number;
  machineIdentityStatus:
    | 'confirmed'
    | 'pending-additional-evidence'
    | 'ambiguous'
    | 'rejected';
  humanIdentityStatus: 'pending-human-review';
  identityObservationIds: string[];
  identityBasis: string[];
  identityNameOnly: boolean;
  selectedConflictIds: string[];
  profileSourceId: string;
  profileSha256: string;
  directorySourceIds: string[];
  claimChecks: ClaimCheck[];
  sourceInspections: SourceInspection[];
};

type PilotAudit = {
  snapshotDate: string;
  rosterSnapshotDate: string;
  selectedCandidates: PilotRosterCandidate[];
  candidateAudits: CandidateAudit[];
  sourceInspections: SourceInspection[];
  totals: {
    claimsPrepared: number;
    directSourceSupported: number;
    additionalEvidenceRequired: number;
    evidenceLinked: number;
    evidenceContradictions: number;
    verifiedDates: number;
    unknownDates: number;
    candidateStatements: number;
    institutionalClaims: number;
    attributionReviewRequired: number;
    machineIdentityConfirmed: number;
    selectedConflicts: number;
  };
};

const ROOT = resolve(process.cwd());
const NORMALIZED_PATH = 'data/normalized/2026/biographies.json';
const ROSTER_PATH = 'data/approved/2026/kaohsiung-election.json';
const MANIFEST_PATH = 'data/official-source-manifest.json';
const PILOT_CANDIDATE_IDS = [
  'official-candidate-2026-district-kaohsiung-council-10-8aa5784f',
  'official-candidate-2026-district-kaohsiung-council-10-ec2af867',
  'official-candidate-2026-district-kaohsiung-council-11-a4e7a38d',
  'official-candidate-2026-district-kaohsiung-council-11-aa063da4',
] as const;
function readJson<T>(relativePath: string): T {
  const text = readFileSync(join(ROOT, relativePath), 'utf8');
  try {
    return JSON.parse(text) as T;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid JSON in ${relativePath}: ${message}`);
  }
}

function writeJson(relativePath: string, value: unknown): void {
  writeFileSync(
    join(ROOT, relativePath),
    `${JSON.stringify(value, null, 2)}\n`,
    'utf8',
  );
}

function sha256File(relativePath: string): {
  sha256: string;
  byteLength: number;
} {
  const bytes = readFileSync(join(ROOT, relativePath));
  return {
    sha256: createHash('sha256').update(bytes).digest('hex'),
    byteLength: bytes.byteLength,
  };
}

function normalizeText(value: string): string {
  return value.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
}

function containsNormalized(haystack: string, needle: string): boolean {
  const normalizedNeedle = normalizeText(needle);
  return (
    normalizedNeedle.length > 0 &&
    normalizeText(haystack).includes(normalizedNeedle)
  );
}

function classifyAttribution(
  claim: BiographyClaim,
  evidence: Array<BiographyEvidence | undefined>,
): {
  auditedAttribution: BiographyClaim['attribution'];
  attributionCaveat: string | null;
} {
  const isPolicyStatement =
    claim.attribution === 'candidate-statement' &&
    claim.sourceDependency === 'self-reported' &&
    evidence.some((item) => item?.excerpt.includes('服務政見'));
  if (isPolicyStatement) {
    return {
      auditedAttribution: 'candidate-statement',
      attributionCaveat:
        'KCC labels this material 「服務政見」. The retained source supports that a statement was published, not that the proposed policy was implemented or achieved.',
    };
  }
  return {
    auditedAttribution: claim.attribution,
    attributionCaveat: null,
  };
}

function oneLine(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function markdownValue(value: string): string {
  return oneLine(value).replace(/\|/g, '\\|');
}

function excerpt(value: string, limit = 720): string {
  const line = oneLine(value);
  return line.length > limit ? `${line.slice(0, limit - 1)}…` : line;
}

function loadDataset(): BiographyDataset {
  const dataset = validateBiographyDataset(readJson<unknown>(NORMALIZED_PATH));
  assertClaimEvidence(dataset);
  return dataset;
}

function loadRoster(): OfficialRoster {
  const raw = readJson<{
    snapshotDate: string;
    candidates: PilotRosterCandidate[];
  }>(ROSTER_PATH);
  if (!raw.snapshotDate || !Array.isArray(raw.candidates)) {
    throw new Error(`Invalid official roster shape: ${ROSTER_PATH}`);
  }
  return raw;
}

function loadManifest(): OfficialManifest {
  const raw = readJson<OfficialManifest>(MANIFEST_PATH);
  if (!Array.isArray(raw.sources))
    throw new Error(`Invalid source manifest: ${MANIFEST_PATH}`);
  return raw;
}

function findPilotCandidates(roster: OfficialRoster): PilotRosterCandidate[] {
  const byId = new Map(
    roster.candidates.map((candidate) => [candidate.id, candidate]),
  );
  const candidates = PILOT_CANDIDATE_IDS.map((candidateId) =>
    byId.get(candidateId),
  );
  if (candidates.some((candidate) => !candidate)) {
    throw new Error(`Pilot candidate is missing from ${ROSTER_PATH}`);
  }
  return candidates.filter((candidate): candidate is PilotRosterCandidate =>
    Boolean(candidate),
  );
}

function sourceInspection(
  source: BiographySourceAttempt,
  role: SourceInspection['role'],
  publicationDate: string | null = null,
): SourceInspection {
  if (!source.rawPath)
    throw new Error(`Source ${source.sourceId} has no retained raw path`);
  const path = source.rawPath;
  if (!existsSync(join(ROOT, path)))
    throw new Error(`Missing retained source ${path}`);
  const actual = sha256File(path);
  return {
    sourceId: source.sourceId,
    sourceClass: source.sourceClass,
    url: source.url,
    rawPath: path,
    sha256: actual.sha256,
    byteLength: actual.byteLength,
    expectedSha256: source.sha256,
    sha256Matches: source.sha256 === null || actual.sha256 === source.sha256,
    byteLengthMatches:
      source.byteLength === null
        ? null
        : actual.byteLength === source.byteLength,
    httpStatus: source.httpStatus,
    timestampQuality: source.timestampQuality,
    sourceRetrievedAt: source.sourceRetrievedAt,
    publicationDate,
    role,
  };
}

function profileMsn(sourceId: string): string {
  const match = sourceId.match(/biography-kcc-profile-(\d+)$/);
  if (!match?.[1]) throw new Error(`Cannot derive KCC msn from ${sourceId}`);
  return match[1];
}

function claimSourceText(
  claim: BiographyClaim,
  sourceById: Map<string, BiographySourceAttempt>,
): string {
  const parts: string[] = [];
  for (const sourceId of claim.sourceIds) {
    const source = sourceById.get(sourceId);
    if (!source?.rawPath || !existsSync(join(ROOT, source.rawPath))) continue;
    parts.push(readFileSync(join(ROOT, source.rawPath), 'utf8'));
  }
  return cleanHtml(parts.join('\n'));
}

function verifyClaim(
  claim: BiographyClaim,
  candidate: PilotRosterCandidate,
  profile: ReturnType<typeof parseKccProfile>,
  sourceById: Map<string, BiographySourceAttempt>,
  evidenceById: Map<string, BiographyEvidence>,
): ClaimCheck {
  const evidence = claim.evidenceIds.map((evidenceId) =>
    evidenceById.get(evidenceId),
  );
  const evidenceLinked = evidence.every(
    (item) =>
      Boolean(item) &&
      item?.claimId === claim.claimId &&
      claim.sourceIds.includes(item.sourceId),
  );
  const evidenceHasContradiction = evidence.some(
    (item) => item?.supportType === 'contradicts',
  );
  const attributionAudit = classifyAttribution(claim, evidence);
  const sourceText = claimSourceText(claim, sourceById);
  let sourceSupported = containsNormalized(sourceText, claim.value);
  let verificationMethod = 'normalized-claim-value-in-retained-source';
  if (claim.claimType === 'current-position') {
    sourceSupported =
      containsNormalized(sourceText, candidate.displayName) &&
      sourceText.includes('本屆議員');
    verificationMethod = 'KCC-current-member-heading-plus-roster-name';
  } else if (!sourceSupported && profile) {
    const parsedValues = [...profile.education, ...profile.experience];
    sourceSupported = parsedValues.some((value) =>
      containsNormalized(value, claim.value),
    );
    verificationMethod = 'KCC-profile-parsed-education-or-experience-item';
  }
  const supported =
    evidenceLinked && !evidenceHasContradiction && sourceSupported;
  let blocker: string | null = null;
  if (!evidenceLinked)
    blocker =
      'Linked evidence is missing, mismatched, or points outside the claim source set.';
  else if (evidenceHasContradiction)
    blocker = 'Evidence contains a contradictory support item.';
  else if (!sourceSupported)
    blocker =
      'The retained original source did not support the normalized wording under the bounded audit; obtain additional evidence.';
  return {
    claimId: claim.claimId,
    claimType: claim.claimType,
    title: claim.title,
    value: claim.value,
    currentStatus: claim.currentStatus,
    temporalPrecision: claim.temporalPrecision,
    validFrom: claim.validFrom,
    validTo: claim.validTo,
    attribution: claim.attribution,
    auditedAttribution: attributionAudit.auditedAttribution,
    attributionCaveat: attributionAudit.attributionCaveat,
    sourceDependency: claim.sourceDependency,
    sourceIds: claim.sourceIds,
    evidenceIds: claim.evidenceIds,
    evidenceLinked,
    evidenceHasContradiction,
    sourceSupported,
    verification: supported
      ? 'direct-source-supported'
      : 'requires-additional-evidence',
    verificationMethod,
    blocker,
  };
}

function buildAudit(): PilotAudit {
  const dataset = loadDataset();
  const roster = loadRoster();
  const manifest = loadManifest();
  const selectedCandidates = findPilotCandidates(roster);
  const sourceById = new Map(
    dataset.sources.map((source) => [source.sourceId, source]),
  );
  const evidenceById = new Map(
    dataset.evidence.map((evidence) => [evidence.evidenceId, evidence]),
  );
  const observationsByCandidate = new Map<
    string,
    BiographyIdentityObservation[]
  >();
  for (const observation of dataset.observations) {
    for (const candidateId of observation.candidateIds) {
      const existing = observationsByCandidate.get(candidateId) ?? [];
      existing.push(observation);
      observationsByCandidate.set(candidateId, existing);
    }
  }
  const directorySources = dataset.sources.filter(
    (source) =>
      source.sourceClass === 'kcc-current-member-directory' && source.rawPath,
  );
  const directoryObservations = directorySources.flatMap((source) =>
    parseKccDirectory(readHtml(join(ROOT, source.rawPath ?? ''))).map(
      (observation) => ({ source, observation }),
    ),
  );
  const candidateAudits: CandidateAudit[] = [];
  const allSourceInspections: SourceInspection[] = [];
  for (const candidate of selectedCandidates) {
    const claims = dataset.claims.filter(
      (claim) => claim.candidateId === candidate.id,
    );
    const profileSource = dataset.sources.find(
      (source) =>
        source.sourceClass === 'kcc-member-profile' &&
        claims.some((claim) => claim.sourceIds.includes(source.sourceId)),
    );
    if (!profileSource?.rawPath)
      throw new Error(
        `No KCC profile source found for ${candidate.displayName}`,
      );
    const msn = profileMsn(profileSource.sourceId);
    const profileHtml = readHtml(join(ROOT, profileSource.rawPath));
    const profile = parseKccProfile(profileHtml, msn);
    if (!profile)
      throw new Error(
        `KCC profile ${profileSource.rawPath} could not be reparsed`,
      );
    const profileCheck = sourceInspection(profileSource, 'profile-evidence');
    if (
      !profileCheck.sha256Matches ||
      profileCheck.byteLengthMatches === false
    ) {
      throw new Error(
        `KCC profile checksum mismatch for ${profileSource.sourceId}`,
      );
    }
    const matchingDirectories = directoryObservations.filter(
      ({ observation }) =>
        observation.msn === msn &&
        observation.observedName === candidate.displayName,
    );
    const directoryChecks = matchingDirectories.map(({ source }) =>
      sourceInspection(source, 'directory-corroboration'),
    );
    if (matchingDirectories.length === 0) {
      throw new Error(
        `KCC directory did not corroborate ${candidate.displayName} msn ${msn}`,
      );
    }
    const observations = observationsByCandidate.get(candidate.id) ?? [];
    const identityObservationIds = observations.map(
      (observation) => observation.observationId,
    );
    const identityBasis = [
      ...new Set(observations.flatMap((observation) => observation.matchBasis)),
    ];
    const identityNameOnly = observations.some(
      (observation) => observation.isNameOnlyMatch,
    );
    const identityResolved =
      observations.length > 0 &&
      observations.every(
        (observation) =>
          observation.identityStatus === 'resolved' &&
          !observation.isNameOnlyMatch &&
          observation.candidateIds.length === 1 &&
          observation.observedName === candidate.displayName,
      );
    const selectedConflicts = dataset.conflicts
      .filter((conflict) => conflict.candidateId === candidate.id)
      .map((conflict) => conflict.conflictId);
    const claimChecks = claims.map((claim) =>
      verifyClaim(claim, candidate, profile, sourceById, evidenceById),
    );
    const inspections = [profileCheck, ...directoryChecks];
    allSourceInspections.push(...inspections);
    candidateAudits.push({
      candidateId: candidate.id,
      displayName: candidate.displayName,
      slug: candidate.slug,
      districtId: candidate.districtId,
      candidateNumber: candidate.candidateNumber,
      profileMsn: msn,
      claimsPrepared: claims.length,
      machineIdentityStatus: identityResolved
        ? 'confirmed'
        : 'pending-additional-evidence',
      humanIdentityStatus: 'pending-human-review',
      identityObservationIds,
      identityBasis,
      identityNameOnly,
      selectedConflictIds: selectedConflicts,
      profileSourceId: profileSource.sourceId,
      profileSha256: profileCheck.sha256,
      directorySourceIds: matchingDirectories.map(
        ({ source }) => source.sourceId,
      ),
      claimChecks,
      sourceInspections: inspections,
    });
  }
  const rosterSource = manifest.sources.find(
    (source) => source.id === 'source-khec-65366',
  );
  if (!rosterSource)
    throw new Error(
      'Official roster source-khec-65366 is missing from the manifest',
    );
  const rosterActual = sha256File(rosterSource.rawPath);
  if (rosterActual.sha256 !== rosterSource.sha256) {
    throw new Error(
      `Official roster source checksum mismatch for ${rosterSource.rawPath}`,
    );
  }
  const rosterInspection: SourceInspection = {
    sourceId: rosterSource.id,
    sourceClass: 'official-election-roster',
    url: rosterSource.canonicalUrl,
    rawPath: rosterSource.rawPath,
    sha256: rosterActual.sha256,
    byteLength: rosterActual.byteLength,
    expectedSha256: rosterSource.sha256,
    sha256Matches: true,
    byteLengthMatches:
      rosterSource.byteLength === undefined
        ? null
        : rosterActual.byteLength === rosterSource.byteLength,
    httpStatus: 200,
    timestampQuality: 'source-manifest-retrieval-date',
    sourceRetrievedAt: null,
    publicationDate: '2026-10-27',
    role: 'identity-anchor',
  };
  allSourceInspections.push(rosterInspection);
  const checks = candidateAudits.flatMap((audit) => audit.claimChecks);
  const policyStatementClaimIds = checks
    .filter((check) => check.attributionCaveat !== null)
    .map((check) => check.claimId)
    .sort();
  if (policyStatementClaimIds.length !== 4) {
    throw new Error(
      `Expected exactly four selected KCC 服務政見 claims, found ${policyStatementClaimIds.join(', ') || 'none'}.`,
    );
  }
  return {
    snapshotDate: dataset.snapshotDate,
    rosterSnapshotDate: roster.snapshotDate,
    selectedCandidates,
    candidateAudits,
    sourceInspections: allSourceInspections.filter(
      (source, index, all) =>
        all.findIndex((item) => item.sourceId === source.sourceId) === index,
    ),
    totals: {
      claimsPrepared: checks.length,
      directSourceSupported: checks.filter(
        (check) => check.verification === 'direct-source-supported',
      ).length,
      additionalEvidenceRequired: checks.filter(
        (check) => check.verification === 'requires-additional-evidence',
      ).length,
      evidenceLinked: checks.filter((check) => check.evidenceLinked).length,
      evidenceContradictions: checks.filter(
        (check) => check.evidenceHasContradiction,
      ).length,
      verifiedDates: checks.filter(
        (check) => check.temporalPrecision !== 'unknown',
      ).length,
      unknownDates: checks.filter(
        (check) => check.temporalPrecision === 'unknown',
      ).length,
      candidateStatements: checks.filter(
        (check) => check.auditedAttribution === 'candidate-statement',
      ).length,
      institutionalClaims: checks.filter(
        (check) => check.auditedAttribution === 'institutional-record',
      ).length,
      attributionReviewRequired: checks.filter(
        (check) => check.attributionCaveat !== null,
      ).length,
      machineIdentityConfirmed: candidateAudits.filter(
        (candidateAudit) =>
          candidateAudit.machineIdentityStatus === 'confirmed',
      ).length,
      selectedConflicts: candidateAudits.reduce(
        (count, candidateAudit) =>
          count + candidateAudit.selectedConflictIds.length,
        0,
      ),
    },
  };
}

function summaryJson(audit: PilotAudit): Record<string, unknown> {
  return {
    datasetId: 'kaohsiung-2026-candidate-biographies',
    snapshotDate: audit.snapshotDate,
    rosterSnapshotDate: audit.rosterSnapshotDate,
    pilotCandidateIds: audit.selectedCandidates.map(
      (candidate) => candidate.id,
    ),
    pilotCandidates: audit.candidateAudits.map((candidate) => ({
      candidateId: candidate.candidateId,
      displayName: candidate.displayName,
      slug: candidate.slug,
      districtId: candidate.districtId,
      candidateNumber: candidate.candidateNumber,
      profileMsn: candidate.profileMsn,
      claimsPrepared: candidate.claimsPrepared,
      machineIdentityStatus: candidate.machineIdentityStatus,
      humanIdentityStatus: candidate.humanIdentityStatus,
      selectedConflictIds: candidate.selectedConflictIds,
    })),
    claimsPrepared: audit.totals.claimsPrepared,
    sourcesInspected: audit.sourceInspections.length,
    directSourceSupportedClaims: audit.totals.directSourceSupported,
    claimsRequiringAdditionalEvidence: audit.totals.additionalEvidenceRequired,
    claimsWithLinkedEvidence: audit.totals.evidenceLinked,
    claimsWithContradictoryEvidence: audit.totals.evidenceContradictions,
    claimsWithVerifiedDates: audit.totals.verifiedDates,
    claimsWithUnknownDates: audit.totals.unknownDates,
    candidateStatementClaims: audit.totals.candidateStatements,
    institutionalClaims: audit.totals.institutionalClaims,
    attributionReviewRequiredClaims: audit.totals.attributionReviewRequired,
    machineIdentityConfirmedCandidates: audit.totals.machineIdentityConfirmed,
    humanIdentityConfirmedCandidates: 0,
    selectedIdentityConflicts: audit.totals.selectedConflicts,
    awaitingHumanReviewClaims: audit.totals.claimsPrepared,
    humanReviewedClaims: 0,
    humanApprovedClaims: 0,
    rejectedClaims: 0,
    disputedClaims: 0,
    publishedClaims: 0,
    reviewerIds: [],
    publicationEligibleClaims: 0,
    completion: {
      engineeringPreparation: 'complete-after-verification',
      humanEditorialReview: 'incomplete-no-authorized-reviewer-decisions',
      staticPublication: 'incomplete-no-approved-claims',
    },
    note: 'Machine source reopening is not human editorial approval. No reviewer, decision, date, identity confirmation, or publication record was fabricated.',
  };
}

function claimMix(claims: ClaimCheck[]): string {
  const counts = new Map<string, number>();
  for (const claim of claims)
    counts.set(claim.claimType, (counts.get(claim.claimType) ?? 0) + 1);
  return [...counts.entries()]
    .map(([type, count]) => `${type} ${count}`)
    .join(', ');
}

function selectionMarkdown(audit: PilotAudit): string {
  const lines = [
    '# Editorial pilot candidate selection',
    '',
    `- Dataset snapshot: \`${audit.snapshotDate}\``,
    `- Roster snapshot: \`${audit.rosterSnapshotDate}\``,
    '- Selection method: four non-conflicted KCC-profile matches chosen from the retained source-backed set using stable source coverage and claim coverage; party, popularity, and subjective importance were not used.',
    '- This is a preliminary 2026 roster snapshot, not the final statutory candidate announcement.',
    '',
  ];
  for (const candidate of audit.candidateAudits) {
    lines.push(`## ${candidate.displayName}`);
    lines.push('');
    lines.push(`- Canonical candidate ID: \`${candidate.candidateId}\``);
    lines.push(`- Static route: \`/candidates/${candidate.slug}/\``);
    lines.push(
      `- Constituency: \`${candidate.districtId}\`; candidate number: \`${candidate.candidateNumber ?? 'not published'}\``,
    );
    lines.push(
      `- KCC profile identifier: msn \`${candidate.profileMsn}\`; profile source: \`${candidate.profileSourceId}\``,
    );
    lines.push(`- Existing claims prepared: ${candidate.claimsPrepared}`);
    lines.push(`- Claim mix: ${claimMix(candidate.claimChecks)}`);
    lines.push(
      `- Machine identity status: **${candidate.machineIdentityStatus}**; human identity status: **pending-human-review**.`,
    );
    lines.push(
      `- Identity observations: ${candidate.identityObservationIds.map((id) => `\`${id}\``).join(', ') || 'none'}.`,
    );
    lines.push(
      `- Identity basis: ${candidate.identityBasis.join('；') || 'none recorded'}. Name-only match: ${candidate.identityNameOnly ? 'yes' : 'no'}.`,
    );
    lines.push(
      `- Selected conflicts: ${candidate.selectedConflictIds.length === 0 ? 'none in the existing nine-conflict report' : candidate.selectedConflictIds.map((id) => `\`${id}\``).join(', ')}.`,
    );
    lines.push(
      '- Available evidence: retained KCC current-member profile, independently reparsed KCC directory identifier/name card, and official KHEC candidate-number roster anchor.',
    );
    lines.push(
      '- Inclusion rationale: this candidate has a stable institutional profile identifier, a non-name-only candidate-specific observation, retained original education/experience material, and no currently reported identity conflict; the four-person sample spans districts 10 and 11 and remains small enough for claim-level human review.',
    );
    lines.push('');
  }
  return `${lines.join('\n')}\n`;
}

function packetsMarkdown(audit: PilotAudit): string {
  const dataset = loadDataset();
  const evidenceById = new Map(
    dataset.evidence.map((evidence) => [evidence.evidenceId, evidence]),
  );
  const sourceById = new Map(
    dataset.sources.map((source) => [source.sourceId, source]),
  );
  const lines = [
    '# Editorial pilot human review packets',
    '',
    `Dataset snapshot: \`${audit.snapshotDate}\`. These packets contain machine-prepared evidence only; every claim remains pending authorized human review.`,
    '',
    '## Review instructions',
    '',
    '1. Confirm the person using the roster, KCC msn, constituency, and original source—not name alone.',
    '2. Reopen each linked source URL/path and compare the wording with the excerpt.',
    '3. Check whether the item is current, historical, or unknown and whether the source supplies a date.',
    '4. Record a genuine decision only through the configured local reviewer workflow; the agent has not approved any item.',
    '',
  ];
  for (const candidate of audit.candidateAudits) {
    lines.push(`## Candidate: ${candidate.displayName}`);
    lines.push('');
    lines.push(
      `- ID: \`${candidate.candidateId}\`; district: \`${candidate.districtId}\`; route: \`/candidates/${candidate.slug}/\``,
    );
    lines.push(
      `- KCC profile: msn \`${candidate.profileMsn}\`, source \`${candidate.profileSourceId}\``,
    );
    lines.push(
      `- Machine identity: **${candidate.machineIdentityStatus}**; human identity: **pending-human-review**; conflicts: ${candidate.selectedConflictIds.length}.`,
    );
    lines.push(
      `- Source inspections: ${candidate.sourceInspections.map((source) => `\`${source.sourceId}\``).join(', ')}.`,
    );
    lines.push('');
    lines.push('### Identity evidence');
    lines.push('');
    lines.push(
      `- Observation IDs: ${candidate.identityObservationIds.map((id) => `\`${id}\``).join(', ') || 'none'}`,
    );
    lines.push(
      `- Match basis: ${candidate.identityBasis.join('；') || 'none recorded'}`,
    );
    lines.push(
      `- Name-only matching: ${candidate.identityNameOnly ? 'blocked' : 'not used'}`,
    );
    lines.push(
      '- Publication identity blocker: human confirmation and all gate conditions remain required.',
    );
    lines.push('');
    lines.push('### Claims');
    lines.push('');
    for (const check of candidate.claimChecks) {
      const evidence = check.evidenceIds
        .map((id) => evidenceById.get(id))
        .filter((item): item is BiographyEvidence => Boolean(item));
      const sources = check.sourceIds
        .map((id) => sourceById.get(id))
        .filter((item): item is BiographySourceAttempt => Boolean(item));
      lines.push(`#### ${check.claimId} — ${check.claimType}`);
      lines.push('');
      lines.push(
        `- **${markdownValue(check.title)}**: ${markdownValue(check.value)}`,
      );
      lines.push(
        `- Temporal status: ${check.currentStatus}; precision: ${check.temporalPrecision}; valid from: ${check.validFrom ?? 'unknown'}; valid to: ${check.validTo ?? 'unknown'}.`,
      );
      lines.push(
        `- Attribution/dependency: original ${check.attribution} / ${check.sourceDependency}; audited ${check.auditedAttribution}.`,
      );
      if (check.attributionCaveat)
        lines.push(`- Attribution caution: ${check.attributionCaveat}`);
      lines.push(
        `- Machine source result: **${check.verification}** via ${check.verificationMethod}.`,
      );
      lines.push(
        `- Evidence linked: ${check.evidenceLinked ? 'yes' : 'no'}; contradictory evidence: ${check.evidenceHasContradiction ? 'yes' : 'no'}.`,
      );
      lines.push(
        `- Source IDs: ${sources.map((source) => `\`${source.sourceId}\``).join(', ') || 'none'}.`,
      );
      for (const source of sources)
        lines.push(
          `  - Source: [${markdownValue(source.url)}](${source.url}) — \`${source.rawPath}\`; HTTP ${source.httpStatus ?? 'unknown'}; timestamp quality ${source.timestampQuality}; source retrieved at ${source.sourceRetrievedAt ?? 'unknown'}.`,
        );
      for (const item of evidence) {
        lines.push(
          `  - Evidence \`${item.evidenceId}\` at \`${markdownValue(item.documentLocation)}\` (${item.supportType}, ${item.attribution}, ${item.verificationStatus}): “${excerpt(item.excerpt)}”`,
        );
      }
      lines.push(
        `- Publication blockers: ${check.blocker ?? 'authorized reviewer decision, identity confirmation, and the existing publication gate are still required.'}`,
      );
      lines.push('');
    }
    lines.push('---');
    lines.push('');
  }
  return `${lines.join('\n')}\n`;
}

function evidenceQualityJson(audit: PilotAudit): Record<string, unknown> {
  return {
    datasetId: 'kaohsiung-2026-candidate-biographies',
    snapshotDate: audit.snapshotDate,
    rosterSnapshotDate: audit.rosterSnapshotDate,
    method:
      'Offline reopening of retained source bytes, SHA-256/byte-length verification, existing KCC parser reparse, and claim/evidence/source-text comparison. No network refresh or human decision was performed.',
    sourceInspections: audit.sourceInspections,
    candidates: audit.candidateAudits.map((candidate) => ({
      candidateId: candidate.candidateId,
      displayName: candidate.displayName,
      profileMsn: candidate.profileMsn,
      identity: {
        machineStatus: candidate.machineIdentityStatus,
        humanStatus: candidate.humanIdentityStatus,
        observationIds: candidate.identityObservationIds,
        basis: candidate.identityBasis,
        nameOnlyMatch: candidate.identityNameOnly,
        conflictIds: candidate.selectedConflictIds,
      },
      claimChecks: candidate.claimChecks,
    })),
    totals: audit.totals,
  };
}

function summaryMarkdown(audit: PilotAudit): string {
  return `# Editorial pilot summary\n\n- Snapshot: \`${audit.snapshotDate}\`; roster snapshot: \`${audit.rosterSnapshotDate}\`\n- Candidates selected: ${audit.selectedCandidates.length}\n- Claims prepared: ${audit.totals.claimsPrepared}\n- Sources inspected: ${audit.sourceInspections.length}\n- Claims directly supported by retained source text: ${audit.totals.directSourceSupported}\n- Claims requiring additional evidence: ${audit.totals.additionalEvidenceRequired}\n- Claims with linked evidence: ${audit.totals.evidenceLinked}\n- Claims with contradictory evidence: ${audit.totals.evidenceContradictions}\n- Claims with verified dates: ${audit.totals.verifiedDates}\n- Claims with unknown dates: ${audit.totals.unknownDates}\n- Candidate-statement claims after the bounded attribution audit: ${audit.totals.candidateStatements}; institutional-record claims: ${audit.totals.institutionalClaims}\n- Claims requiring attribution wording review: ${audit.totals.attributionReviewRequired}\n- Machine-resolved candidate identities: ${audit.totals.machineIdentityConfirmed}; human-confirmed identities: 0\n- Selected identity conflicts: ${audit.totals.selectedConflicts}\n- Awaiting human review: ${audit.totals.claimsPrepared}\n- Human-reviewed/approved/rejected/disputed claims: 0/0/0/0\n- Publication-eligible/published claims: 0/0\n\n## Completion boundaries\n\n- **Engineering preparation:** complete after \`npm run pilot:verify\` and the full verification suite pass.\n- **Human editorial review:** incomplete. The reviewer registry is empty and no genuine decision export exists.\n- **Static publication:** incomplete. The production publication snapshot remains empty and the existing gate is unchanged.\n\nMachine source reopening is not human editorial approval. Unknown dates remain unknown; KCC capture-file mtime is not used as an event date.\n`;
}

function blockersMarkdown(audit: PilotAudit): string {
  const additional = audit.candidateAudits.flatMap((candidate) =>
    candidate.claimChecks
      .filter((check) => check.verification === 'requires-additional-evidence')
      .map((check) => `${candidate.displayName}: ${check.claimId}`),
  );
  return `# Editorial pilot blockers and next actions\n\n## Blocking conditions\n\n- The production reviewer registry has zero configured authorized reviewers; no reviewer identity may be invented or inferred from the agent, OS user, or Git metadata.\n- The production decision set is empty, so all ${audit.totals.claimsPrepared} pilot claims remain awaiting genuine human review.\n- The publication snapshot is intentionally empty; no claim may bypass identity confirmation, evidence/version checks, explicit confirmation, reviewer authorization, and the existing publication gate.\n- Machine identity is resolved for ${audit.totals.machineIdentityConfirmed} selected candidates, but this does not constitute human identity confirmation.\n- ${audit.totals.unknownDates} claims have unknown temporal precision. No source capture timestamp was converted to a political event date.
- KCC retained snapshots record \`capture-file-mtime\` quality and no \`sourceRetrievedAt\`; a reviewer should confirm currentness against a current authoritative source before approving current-position claims.
- ${audit.totals.attributionReviewRequired} claims are explicitly labeled \`服務政見\` in KCC pages. Review their wording as candidate statements; source presence does not establish implementation, outcome, or achievement.
${additional.length > 0 ? `- ${additional.length} claims require additional evidence under the bounded source-text audit: ${additional.join(', ')}.` : '- No selected claim failed the bounded retained-source/evidence support check; this still does not remove the human review requirement.'}\n\n## Exact next human action\n\n1. Configure a real human reviewer in \`data/editorial/reviewer-registry.json\` with an explicit reviewer ID and authorized actions; the local registry is not authentication.\n2. Run \`EDITORIAL_REVIEW=true npm run editorial:review\`, open \`/editorial-review/\`, filter each selected candidate, and reopen every linked source in the packet.\n3. For each claim the reviewer can substantiate, enter a rationale and explicit confirmation, export the JSON decision set, and have the CLI validate/apply it.\n4. Resolve or explicitly withhold any identity/date conflict; do not approve unsupported or stale claims.\n5. Run \`npm run editorial:publish\` and inspect the gate report. Only then can a non-empty static publication snapshot be considered.\n`;
}

function outputPaths(): string[] {
  return [
    'reports/editorial-pilot-candidate-selection.md',
    'reports/editorial-pilot-review-packets.md',
    'reports/editorial-pilot-evidence-quality.json',
    'reports/editorial-pilot-summary.json',
    'reports/editorial-pilot-summary.md',
    'reports/editorial-pilot-blockers.md',
  ];
}

function prepare(): PilotAudit {
  const audit = buildAudit();
  writeFileSync(
    join(ROOT, 'reports/editorial-pilot-candidate-selection.md'),
    selectionMarkdown(audit),
    'utf8',
  );
  writeFileSync(
    join(ROOT, 'reports/editorial-pilot-review-packets.md'),
    packetsMarkdown(audit),
    'utf8',
  );
  writeJson(
    'reports/editorial-pilot-evidence-quality.json',
    evidenceQualityJson(audit),
  );
  writeJson('reports/editorial-pilot-summary.json', summaryJson(audit));
  writeFileSync(
    join(ROOT, 'reports/editorial-pilot-summary.md'),
    summaryMarkdown(audit),
    'utf8',
  );
  writeFileSync(
    join(ROOT, 'reports/editorial-pilot-blockers.md'),
    blockersMarkdown(audit),
    'utf8',
  );
  return audit;
}

function verify(): PilotAudit {
  const audit = buildAudit();
  for (const path of outputPaths()) {
    if (!existsSync(join(ROOT, path)))
      throw new Error(`Missing generated pilot report: ${path}`);
  }
  const summary = readJson<{
    pilotCandidateIds: string[];
    claimsPrepared: number;
    sourcesInspected: number;
    candidateStatementClaims: number;
    attributionReviewRequiredClaims: number;
    humanReviewedClaims: number;
    humanApprovedClaims: number;
    publishedClaims: number;
  }>('reports/editorial-pilot-summary.json');
  const expectedIds = audit.selectedCandidates.map((candidate) => candidate.id);
  if (JSON.stringify(summary.pilotCandidateIds) !== JSON.stringify(expectedIds))
    throw new Error(
      'Pilot summary candidate IDs do not match the deterministic sample',
    );
  if (summary.claimsPrepared !== audit.totals.claimsPrepared)
    throw new Error('Pilot summary claim count is stale');
  if (summary.sourcesInspected !== audit.sourceInspections.length)
    throw new Error('Pilot summary source count is stale');
  if (summary.candidateStatementClaims !== audit.totals.candidateStatements)
    throw new Error('Pilot summary candidate-statement count is stale');
  if (
    summary.attributionReviewRequiredClaims !==
    audit.totals.attributionReviewRequired
  )
    throw new Error('Pilot summary attribution-review count is stale');
  if (
    summary.humanReviewedClaims !== 0 ||
    summary.humanApprovedClaims !== 0 ||
    summary.publishedClaims !== 0
  )
    throw new Error(
      'Pilot reports claim human/publication state that this machine-only command cannot establish',
    );
  const quality = readJson<{ sourceInspections: SourceInspection[] }>(
    'reports/editorial-pilot-evidence-quality.json',
  );
  for (const source of quality.sourceInspections) {
    const current = audit.sourceInspections.find(
      (item) => item.sourceId === source.sourceId,
    );
    if (
      !current ||
      current.sha256 !== source.sha256 ||
      current.byteLength !== source.byteLength ||
      !current.sha256Matches
    )
      throw new Error(`Pilot evidence report is stale for ${source.sourceId}`);
  }
  return audit;
}

function printResult(command: string, audit: PilotAudit): void {
  console.log(
    `${command}: ${audit.selectedCandidates.length} candidates, ${audit.totals.claimsPrepared} claims, ${audit.sourceInspections.length} sources inspected, ${audit.totals.directSourceSupported} direct-source-supported, ${audit.totals.additionalEvidenceRequired} requiring additional evidence; human-reviewed 0, published 0.`,
  );
}

const command = process.argv[2] ?? 'verify';
if (command === 'prepare' || command === 'report') {
  printResult(command, prepare());
} else if (command === 'verify') {
  printResult(command, verify());
} else {
  throw new Error(
    `Unknown command ${command}. Use prepare, verify, or report.`,
  );
}
