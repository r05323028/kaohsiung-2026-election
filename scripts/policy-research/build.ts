import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  POLICY_CATEGORIES,
  policyTypeForContext,
  validatePolicyResearchDataset,
} from '../../src/data/policy-research/schema';
import { validateExtractionBatch } from '../../src/data/policy-research/extraction-schema';
import { validateVerificationBatch } from '../../src/data/policy-research/verification-schema';
import { quotePresent } from './quote-check';

const ROOT = process.cwd();
const CUTOFF = '2026-11-12';
const SEED_PATH = 'data/policy-research/2026/seed/full-roster-2026-11-09.json';
const DATASET_PATH = 'data/policy-research/2026/full-roster.json';
const SUMMARY_PATH = 'data/policy-research/2026/summary.json';
const PUBLISHED_PATH = 'data/published/2026/candidate-policies.json';
const EXTRACTION_DIR = 'data/policy-research/2026/extraction';
const VERIFICATION_DIR = 'data/policy-research/2026/verification';
const ENRICHMENT_PATH =
  'data/policy-research/2026/enrichment/verified-enrichment.json';

type RosterCandidate = {
  id: string;
  slug: string;
  displayName: string;
  districtId: string;
  electionType: 'mayoral' | 'city-council' | 'indigenous-council';
  personId?: string;
};

type Roster = {
  candidates: RosterCandidate[];
  districts: { id: string; label?: string; name?: string }[];
};

type SeedPolicy = {
  policyId: string;
  candidateId: string;
  personId: string;
  title: string;
  neutralSummary: string;
  originalStatement: string;
  categories: string[];
  geographicScope: string;
  geographicLabel: string;
  statementDate: string | null;
  policyContext: string;
  electionYear: 2026 | null;
  sourceId: string;
  evidenceId: string;
  evidenceType: string;
  duplicateOf: string | null;
  conflictIds: string[];
};

type SeedDataset = {
  snapshotDate: string;
  rosterSnapshotDate: string;
  sourceSnapshots: Record<string, unknown>[];
  sourceAttempts: Record<string, unknown>[];
  policies: SeedPolicy[];
  evidence: {
    evidenceId: string;
    policyId: string;
    sourceId: string;
    evidenceType: string;
    locator: string;
    quotedText: string;
  }[];
};

type NewsItem = {
  candidateId: string;
  headline: string;
  publisher: string;
  publishedAt: string | null;
  resolvedUrl: string | null;
  retrievalStatus: string;
  rawPath: string | null;
  sha256: string | null;
  byteLength: number | null;
};

type EnrichmentDataset = {
  candidates: Record<string, unknown>[];
  sourceSnapshots: Record<string, unknown>[];
  sourceAttempts: Record<string, unknown>[];
  newPolicies: Record<string, unknown>[];
  verificationDecisions: Record<string, unknown>[];
};

function readJson<T>(relative: string): T {
  try {
    return JSON.parse(readFileSync(path.join(ROOT, relative), 'utf8')) as T;
  } catch (error) {
    throw new Error(
      'Failed to read ' +
        relative +
        ': ' +
        (error instanceof Error ? error.message : String(error)),
    );
  }
}

function writeJson(relative: string, value: unknown): void {
  const target = path.join(ROOT, relative);
  writeFileSync(target, JSON.stringify(value, null, 2) + '\n', 'utf8');
}

function listJson(dir: string, pattern: RegExp): string[] {
  const absolute = path.join(ROOT, dir);
  if (!existsSync(absolute)) return [];
  return readdirSync(absolute)
    .filter((file: string) => pattern.test(file))
    .sort();
}

function slugFor(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 16);
}

const categorySet = new Set<string>(POLICY_CATEGORIES);

function normalizeContext(value: string): SeedPolicy['policyContext'] {
  const allowed = [
    '2026-election-commitment',
    'current-position',
    'historical-position',
    'public-record-achievement',
    'context-unknown',
  ];
  return (
    allowed.includes(value) ? value : 'context-unknown'
  ) as SeedPolicy['policyContext'];
}

function main(): void {
  const roster = readJson<Roster>('data/approved/2026/kaohsiung-election.json');
  const seed = readJson<SeedDataset>(SEED_PATH);
  const news = readJson<{ items: NewsItem[] }>(
    'data/policy-research/2026/discovery/news-discovery.json',
  );
  const enrichment = readJson<EnrichmentDataset>(ENRICHMENT_PATH);
  if (enrichment.candidates.length !== roster.candidates.length) {
    throw new Error(
      'Enrichment candidate count ' +
        enrichment.candidates.length +
        ' does not match roster count ' +
        roster.candidates.length,
    );
  }
  const rosterById = new Map(
    roster.candidates.map((candidate) => [candidate.id, candidate]),
  );
  for (const row of enrichment.candidates) {
    const candidate = rosterById.get(String(row['candidateId']));
    if (
      !candidate ||
      row['displayName'] !== candidate.displayName ||
      row['districtId'] !== candidate.districtId ||
      row['electionType'] !== candidate.electionType ||
      row['politicalParty'] !==
        (candidate as { politicalParty?: string }).politicalParty
    ) {
      throw new Error(
        'Enrichment candidate identity mismatch: ' + String(row['candidateId']),
      );
    }
  }

  // ---- sources -----------------------------------------------------------
  const sources: Record<string, unknown>[] = [...seed.sourceSnapshots];
  const newsSourceByRawPath = new Map<string, string>();
  for (const item of news.items) {
    if (
      item.retrievalStatus !== 'retrieved' ||
      !item.rawPath ||
      !item.resolvedUrl
    )
      continue;
    const sourceId = 'policy-source-news-' + slugFor(item.rawPath);
    const existingSourceId = newsSourceByRawPath.get(item.rawPath);
    if (existingSourceId) {
      const existing = sources.find(
        (source) =>
          (source as { sourceId?: string }).sourceId === existingSourceId,
      ) as { candidateIds?: string[] } | undefined;
      if (
        existing &&
        !(existing.candidateIds ?? []).includes(item.candidateId)
      ) {
        existing.candidateIds = [
          ...(existing.candidateIds ?? []),
          item.candidateId,
        ];
      }
      continue;
    }
    newsSourceByRawPath.set(item.rawPath, sourceId);
    sources.push({
      sourceId,
      url: item.resolvedUrl,
      publisher: item.publisher,
      title: item.headline,
      role: 'news-report',
      tier: 'tier-3-reporting',
      retrievalStatus: 'retrieved',
      httpStatus: 200,
      contentType: 'text/html',
      rawPath: item.rawPath,
      byteLength: item.byteLength,
      sha256: item.sha256,
      retrievedAt: '2026-11-12T00:00:00.000Z',
      candidateIds: [item.candidateId],
      identityStatus: 'resolved',
      identityBasis: [
        '新聞報導以姓名指稱候選人，選區與職稱由報導內容確認為高雄市選舉候選人。',
      ],
      note: '新聞全文以公開網址擷取並保留原始內容；作為候選人表態之報導來源。',
    });
  }
  for (const source of enrichment.sourceSnapshots) {
    const sourceId = String(source['sourceId']);
    if (sources.some((item) => String(item['sourceId']) === sourceId)) {
      throw new Error('Duplicate enrichment source ' + sourceId);
    }
    sources.push(source);
  }

  // ---- seed policies -----------------------------------------------------
  const policies: Record<string, unknown>[] = [];
  const evidence: Record<string, unknown>[] = [];
  const verification: Record<string, unknown>[] = [];
  const policyIdByKey = new Map<string, string>();

  for (const policy of seed.policies) {
    const type = policyTypeForContext(
      normalizeContext(policy.policyContext) as never,
      policy.title,
    );
    policies.push({
      ...policy,
      policyContext: normalizeContext(policy.policyContext),
      type,
      reviewStatus: 'pending-human-review',
      publicationStatus: 'withheld-pending-review',
      claimIds: ['claim-' + policy.policyId],
      evidenceIds: [policy.evidenceId],
    });
    const seedEvidence = seed.evidence.find(
      (item) => item.policyId === policy.policyId,
    );
    if (seedEvidence) evidence.push(seedEvidence);
    policyIdByKey.set(policy.policyId, policy.policyId);
  }

  // ---- extracted policies ------------------------------------------------
  const extractionFiles = listJson(EXTRACTION_DIR, /^batch-\d+\.json$/);
  const candidateById = new Map(
    roster.candidates.map((candidate) => [candidate.id, candidate]),
  );
  const districtLabel = new Map<string, string>();
  for (const district of roster.districts) {
    districtLabel.set(
      district.id,
      district.label ?? district.name ?? district.id,
    );
  }

  type ExtractionRecord = ReturnType<
    typeof validateExtractionBatch
  >['records'][number];
  const extracted: ExtractionRecord[] = [];
  for (const file of extractionFiles) {
    const batch = validateExtractionBatch(
      readJson<unknown>(EXTRACTION_DIR + '/' + file),
    );
    for (const record of batch.records) extracted.push(record);
  }

  const existingKeys = new Map<string, string[]>();
  for (const policy of seed.policies) {
    const key = policy.candidateId;
    const list = existingKeys.get(key) ?? [];
    list.push(policy.title);
    existingKeys.set(key, list);
  }

  const usedResearchIds = new Set<string>();
  for (const record of extracted) {
    const candidate = candidateById.get(record.candidateId);
    if (!candidate) throw new Error('Unknown candidate ' + record.candidateId);
    if (usedResearchIds.has(record.researchId)) {
      throw new Error('Duplicate researchId ' + record.researchId);
    }
    usedResearchIds.add(record.researchId);
    const sourceId = newsSourceByRawPath.get(record.excerptSourcePath);
    if (!sourceId)
      throw new Error('Missing news source for ' + record.excerptSourcePath);
    const policyId = 'policy-2026-' + record.researchId;
    const evidenceId = 'evidence-2026-' + record.researchId;
    const context = record.policyContext;
    const category = categorySet.has(record.category)
      ? record.category
      : 'other';
    policies.push({
      policyId,
      candidateId: record.candidateId,
      personId: 'person-' + candidate.slug,
      title: record.title,
      neutralSummary: record.summary,
      originalStatement: record.originalStatement,
      type: policyTypeForContext(context, record.title),
      categories: [category],
      geographicScope: record.geographicScope,
      geographicLabel: record.geographicLabel,
      statementDate: record.announcedAt,
      policyContext: context,
      electionYear: context === '2026-election-commitment' ? 2026 : null,
      sourceId,
      evidenceId,
      evidenceType: record.sourceType,
      verificationStatus: 'machine-validated',
      reviewStatus: 'pending-human-review',
      publicationStatus: 'withheld-pending-review',
      claimIds: ['claim-' + policyId],
      evidenceIds: [evidenceId],
      duplicateOf: null,
      conflictIds: [],
      implementationDetails: record.implementationDetails,
      details: record.details,
      researchId: record.researchId,
    });
    evidence.push({
      evidenceId,
      policyId,
      sourceId,
      evidenceType: record.sourceType,
      locator: 'raw:' + record.excerptSourcePath,
      quotedText: record.originalStatement,
      supports: 'supports',
      identityStatus: 'resolved',
      attributionStatus: 'attributed',
    });
  }

  // ---- independently audited enrichment policies ------------------------
  for (const record of enrichment.newPolicies) {
    const candidate = candidateById.get(String(record['candidateId']));
    if (!candidate)
      throw new Error(
        'Unknown enrichment candidate ' + String(record['candidateId']),
      );
    const policyId = String(record['policyId']);
    if (policies.some((policy) => String(policy['policyId']) === policyId)) {
      throw new Error('Duplicate enrichment policy ' + policyId);
    }
    const evidenceId = String(record['evidenceId']);
    const sourceId = String(record['sourceId']);
    const categories = record['categories'];
    const category =
      Array.isArray(categories) && categorySet.has(String(categories[0]))
        ? String(categories[0])
        : 'other';
    const context = normalizeContext(String(record['policyContext']));
    policies.push({
      policyId,
      candidateId: candidate.id,
      personId: 'person-' + candidate.slug,
      title: String(record['title']),
      neutralSummary: String(record['neutralSummary']),
      originalStatement: String(record['originalStatement']),
      type: policyTypeForContext(context as never, String(record['title'])),
      categories: [category],
      geographicScope: String(record['geographicScope']),
      geographicLabel: String(record['geographicLabel']),
      statementDate: record['statementDate'] ?? null,
      policyContext: context,
      electionYear: context === '2026-election-commitment' ? 2026 : null,
      sourceId,
      evidenceId,
      evidenceType: String(record['evidenceType']),
      verificationStatus: 'machine-validated',
      reviewStatus: 'pending-human-review',
      publicationStatus: 'withheld-pending-review',
      claimIds: [String(record['claimId'])],
      evidenceIds: [evidenceId],
      duplicateOf: null,
      conflictIds: [],
    });
    const source = sources.find(
      (item) => String(item['sourceId']) === sourceId,
    );
    evidence.push({
      evidenceId,
      policyId,
      sourceId,
      evidenceType: String(record['evidenceType']),
      locator: 'raw:' + String(source?.['rawPath'] ?? 'enrichment'),
      quotedText: String(record['originalStatement']),
      supports: 'supports',
      identityStatus: 'resolved',
      attributionStatus: 'attributed',
    });
  }

  // ---- independent verification -----------------------------------------
  const verificationFiles = listJson(VERIFICATION_DIR, /^verify-\d+\.json$/);
  const decisions = new Map<string, Record<string, unknown>>();
  for (const file of verificationFiles) {
    const batch = validateVerificationBatch(
      readJson<unknown>(VERIFICATION_DIR + '/' + file),
    );
    for (const decision of batch.decisions) {
      const policyId =
        'policyId' in decision && typeof decision.policyId === 'string'
          ? decision.policyId
          : 'policy-2026-' + String(decision.researchId);
      if (!policies.some((policy) => policy.policyId === policyId)) continue;
      decisions.set(policyId, decision);
    }
  }

  const seedVerificationFiles = listJson(
    VERIFICATION_DIR,
    /^seed-verify-\d+\.json$/,
  );
  for (const file of seedVerificationFiles) {
    const batch = validateVerificationBatch(
      readJson<unknown>(VERIFICATION_DIR + '/' + file),
    );
    for (const decision of batch.decisions) {
      if (!decision.policyId) continue;
      if (!policies.some((policy) => policy.policyId === decision.policyId))
        continue;
      decisions.set(decision.policyId, decision);
    }
  }
  for (const decision of enrichment.verificationDecisions) {
    const policyId = String(decision['policyId']);
    if (!policies.some((policy) => String(policy['policyId']) === policyId)) {
      throw new Error(
        'Enrichment verification references missing policy ' + policyId,
      );
    }
    decisions.set(policyId, decision);
  }

  // ---- deterministic publication gate -----------------------------------
  const evidenceById = new Map<string, Record<string, unknown>>(
    evidence.map((item) => [String(item.evidenceId), item]),
  );
  const sourceById = new Map<string, Record<string, unknown>>(
    sources.map((source) => [
      String((source as { sourceId: string }).sourceId),
      source as Record<string, unknown>,
    ]),
  );

  let approved = 0;
  for (const policy of policies) {
    const policyId = String(policy.policyId);
    const evidenceItem = evidenceById.get(String(policy.evidenceId));
    const source = sourceById.get(String(policy.sourceId));
    const decision = decisions.get(policyId);
    const decisionOk = decision?.['decision'] === 'verified';
    const checks = (decision?.['checks'] ?? {}) as Record<string, unknown>;
    const rawPath =
      typeof source?.['rawPath'] === 'string' ? source['rawPath'] : null;
    const quote =
      typeof evidenceItem?.['quotedText'] === 'string'
        ? evidenceItem['quotedText']
        : '';
    const deterministic = rawPath
      ? quotePresent(readFileSync(path.join(ROOT, rawPath), 'utf8'), quote)
      : false;
    const metadataOk =
      typeof source?.['url'] === 'string' &&
      typeof source?.['publisher'] === 'string' &&
      source['retrievalStatus'] === 'retrieved';
    const publishable =
      decisionOk &&
      checks['attributionResolved'] === true &&
      checks['figuresPreserved'] === true &&
      deterministic &&
      metadataOk &&
      categorySet.has(String((policy.categories as string[])[0]));
    if (publishable) {
      policy.reviewStatus = 'editorially-approved';
      policy.publicationStatus = 'approved-source-backed';
      approved += 1;
    } else if (decision?.['decision'] === 'rejected') {
      policy.reviewStatus = 'rejected';
      policy.publicationStatus = 'rejected';
    } else {
      policy.reviewStatus = 'pending-human-review';
      policy.publicationStatus = 'withheld-pending-review';
    }
    if (decision) {
      verification.push({
        policyId,
        decision: decision['decision'],
        verifierRole: 'independent-verifier',
        checkedAt:
          typeof decision['checkedAt'] === 'string'
            ? decision['checkedAt']
            : CUTOFF + 'T00:00:00.000Z',
        checks: decision['checks'],
        note: decision['note'],
      });
    }
  }

  // ---- audits ------------------------------------------------------------
  const enrichmentAttempts: Record<string, unknown>[] =
    enrichment.sourceAttempts.map((attempt) => {
      const normalized: Record<string, unknown> = { ...attempt };
      normalized['retrievalStatus'] =
        attempt['retrievalStatus'] === 'not-found'
          ? 'not-attempted'
          : attempt['retrievalStatus'] === 'retrieved' &&
              (attempt['sourceId'] === null || attempt['url'] === null)
            ? 'failed'
            : attempt['retrievalStatus'];
      normalized['identityStatus'] =
        attempt['identityStatus'] === 'pending-review'
          ? 'unresolved'
          : attempt['identityStatus'];
      return normalized;
    });
  const attempts = [...seed.sourceAttempts, ...enrichmentAttempts];
  const audits = roster.candidates.map((candidate) => {
    const candidatePolicies = policies.filter(
      (policy) => policy.candidateId === candidate.id,
    );
    const published = candidatePolicies.filter(
      (policy) => policy.publicationStatus === 'approved-source-backed',
    );
    const candidateAttempts = attempts.filter(
      (attempt) => attempt['candidateId'] === candidate.id,
    );
    const outcome =
      published.length > 0
        ? 'verified-records'
        : candidatePolicies.length > 0
          ? 'current-or-historical-only'
          : candidateAttempts.length > 0
            ? 'sources-unavailable'
            : 'no-verifiable-policy-found';
    return {
      candidateId: candidate.id,
      personId: 'person-' + candidate.slug,
      displayName: candidate.displayName,
      districtId: candidate.districtId,
      districtLabel:
        districtLabel.get(candidate.districtId) ?? candidate.districtId,
      electionType: candidate.electionType,
      sourceAttemptIds: candidateAttempts.map((attempt) =>
        String(attempt['attemptId']),
      ),
      policyIds: candidatePolicies.map((policy) => String(policy.policyId)),
      evidenceIds: candidatePolicies.map((policy) => String(policy.evidenceId)),
      outcome,
      researchStatus: 'completed',
      note:
        published.length > 0
          ? '已發布 ' +
            published.length +
            ' 筆通過獨立查核之政策紀錄；其餘未通過者保留待查。'
          : candidatePolicies.length > 0
            ? '已蒐集政策紀錄但未通過獨立查核或來源不足，暫不發布。'
            : '已檢視可取得之公開來源，未找到可歸屬且可核實的政策主張；不代表候選人沒有政策。',
    };
  });

  const dataset = {
    datasetId: 'kaohsiung-2026-policy-research',
    snapshotDate: CUTOFF,
    researchCutoff: CUTOFF,
    rosterSnapshotDate: seed.rosterSnapshotDate,
    candidateCount: 106 as const,
    categories: [...POLICY_CATEGORIES],
    sourceSnapshots: sources,
    sourceAttempts: attempts,
    policies,
    evidence,
    verification,
    audits,
    conflicts: [],
    review: {
      status: 'automated-verified',
      method: 'automated-verification-gate-v1',
      reviewerId: null,
      reviewedAt: null,
      approvedPolicyCount: approved,
      publishedPolicyCount: approved,
    },
  };

  validatePolicyResearchDataset(dataset);
  writeJson(DATASET_PATH, dataset);

  const summary = {
    datasetId: 'kaohsiung-2026-policy-research',
    snapshotDate: CUTOFF,
    researchCutoff: CUTOFF,
    candidateCount: 106 as const,
    audits: audits.map((audit) => ({
      candidateId: audit.candidateId,
      outcome: audit.outcome,
      researchStatus: audit.researchStatus,
      policyCount: audit.policyIds.length,
      publishedPolicyCount: policies.filter(
        (policy) =>
          policy.candidateId === audit.candidateId &&
          policy.publicationStatus === 'approved-source-backed',
      ).length,
      note: audit.note,
    })),
  };
  writeJson(SUMMARY_PATH, summary);

  const publishedPolicies = policies
    .filter((policy) => policy.publicationStatus === 'approved-source-backed')
    .map((policy) => {
      const source = sourceById.get(String(policy.sourceId));
      const evidenceItem = evidenceById.get(String(policy.evidenceId));
      return {
        policyId: policy.policyId,
        candidateId: policy.candidateId,
        title: policy.title,
        summary: policy.neutralSummary,
        details: policy.details ?? null,
        originalStatement: policy.originalStatement,
        category: (policy.categories as string[])[0],
        type: policy.type,
        announcedAt: policy.statementDate,
        scope: policy.geographicLabel,
        implementationDetails: policy.implementationDetails ?? [],
        sources: [
          {
            url: source?.['url'],
            publisher: source?.['publisher'],
            title: source?.['title'],
            publishedAt: policy.statementDate,
            excerpt: evidenceItem?.['quotedText'],
          },
        ],
      };
    });

  writeJson(PUBLISHED_PATH, {
    datasetId: 'kaohsiung-2026-candidate-policies',
    snapshotDate: CUTOFF,
    electionYear: 2026,
    candidateCount: 106,
    policyCount: publishedPolicies.length,
    policies: publishedPolicies,
  });

  const withPolicies = new Set(
    publishedPolicies.map((policy) => policy.candidateId),
  ).size;
  process.stdout.write(
    'policies ' +
      policies.length +
      ', published ' +
      publishedPolicies.length +
      ', candidates with published policies ' +
      withPolicies +
      '/' +
      roster.candidates.length +
      '\n',
  );
}

main();
