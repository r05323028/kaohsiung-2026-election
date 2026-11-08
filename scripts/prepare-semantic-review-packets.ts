import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { validateEnrichmentDataset } from '../src/data/enrichment/schema';
import { SemanticEvidencePacketSchema } from '../src/data/enrichment/semantic-review';

const ROOT = process.cwd();
const DATASET_PATH = resolve(
  ROOT,
  'data/enrichment/normalized/2026/zuoying-mayoral.json',
);
const REVIEW_PATH = resolve(
  ROOT,
  'data/enrichment/review/2026/zuoying-mayoral-review.json',
);
const OUTPUT_PATH = resolve(
  ROOT,
  'data/enrichment/semantic-review/2026/evidence-packets.json',
);
const generatedAt =
  process.env.SEMANTIC_PACKET_GENERATED_AT ?? '2026-11-07T18:00:00.000Z';

const sha256 = (bytes: Buffer): string =>
  createHash('sha256').update(bytes).digest('hex');
const compact = (value: string, max: number): string =>
  value.length <= max ? value : `${value.slice(0, max)}…`;
const stripHtml = (value: string): string =>
  value
    .replace(/<script[\s\S]*?<\/script>/giu, ' ')
    .replace(/<style[\s\S]*?<\/style>/giu, ' ')
    .replace(/<[^>]+>/gu, ' ')
    .replace(/&nbsp;/giu, ' ')
    .replace(/&amp;/giu, '&')
    .replace(/&#x([0-9a-f]+);/giu, (_, code: string) =>
      String.fromCodePoint(Number.parseInt(code, 16)),
    )
    .replace(/&#(\d+);/gu, (_, code: string) =>
      String.fromCodePoint(Number(code)),
    )
    .replace(/\s+/gu, ' ')
    .trim();
const excerptAround = (
  text: string,
  needles: string[],
  radius = 1800,
): string => {
  const index =
    needles
      .map((needle) => text.lastIndexOf(needle))
      .find((position) => position >= 0) ?? 0;
  const start = Math.max(0, index - Math.floor(radius / 3));
  return compact(text.slice(start, start + radius), radius);
};

const readJson = <T>(path: string): T => {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as T;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Unable to parse ${path}: ${detail}`);
  }
};

const dataset = validateEnrichmentDataset(readJson<unknown>(DATASET_PATH));
const review = readJson<{ candidates: Array<Record<string, string | null>> }>(
  REVIEW_PATH,
);
const candidateById = new Map(
  review.candidates.map((candidate) => [candidate.candidateId, candidate]),
);
const sourceById = new Map(
  dataset.sourceAttempts.map((source) => [source.sourceId, source]),
);
const evidenceById = new Map(
  dataset.evidence.map((evidence) => [evidence.evidenceId, evidence]),
);
const observationById = new Map(
  dataset.observations.map((observation) => [
    observation.observationId,
    observation,
  ]),
);

const packets = dataset.claims.map((claim) => {
  const candidate = candidateById.get(claim.candidateId);
  if (!candidate)
    throw new Error(`Missing candidate snapshot for ${claim.claimId}.`);
  const sourceId = claim.sourceIds[0];
  if (!sourceId)
    throw new Error(`Missing source reference for ${claim.claimId}.`);
  const source = sourceById.get(sourceId);
  if (!source)
    throw new Error(`Missing source ${sourceId} for ${claim.claimId}.`);
  if (!source.rawPath) throw new Error(`Missing raw path for ${sourceId}.`);
  const rawPath = resolve(ROOT, source.rawPath);
  const rawBytes = readFileSync(rawPath);
  const actualSha = sha256(rawBytes);
  if (actualSha !== source.sha256 || rawBytes.byteLength !== source.byteLength)
    throw new Error(
      `Source integrity mismatch for ${claim.claimId} (${sourceId}).`,
    );
  const rawText = rawBytes.toString('utf8');
  const plainText = stripHtml(rawText);
  const evidence = claim.evidenceIds.map((evidenceId) => {
    const item = evidenceById.get(evidenceId);
    if (!item)
      throw new Error(`Missing evidence ${evidenceId} for ${claim.claimId}.`);
    return {
      evidenceId: item.evidenceId,
      sourceId: item.sourceId,
      documentLocation: item.documentLocation,
      excerpt: item.excerpt,
      supportType: item.supportType,
      attribution: item.attribution,
    };
  });
  const identity = claim.identityObservationIds.map((observationId) => {
    const item = observationById.get(observationId);
    if (!item)
      throw new Error(
        `Missing observation ${observationId} for ${claim.claimId}.`,
      );
    return {
      observationId: item.observationId,
      observedName: item.observedName,
      jurisdiction: item.observedJurisdiction ?? 'unknown',
      observedOffice: item.observedOffice,
      matchBasis: item.matchBasis.join('; '),
      isNameOnlyMatch: item.isNameOnlyMatch,
    };
  });
  const candidateName = candidate.displayName ?? claim.candidateId;
  const rawNeedles = source.sourceId.startsWith('scope-ly-', 0)
    ? ['<h3 class="heading">', 'class="legislatorname"']
    : claim.category === 'news'
      ? ['<article', '<h1', '<title', candidateName]
      : ['學歷', '經歷', '服務政見', candidateName];
  const rawContext = excerptAround(rawText, rawNeedles, 5000);
  const sourceTextContext = excerptAround(
    plainText,
    [candidateName, claim.value.split(/[；。]/u)[0] ?? '', claim.title],
    3600,
  );
  const packetWithoutHash = {
    packetId: `semantic-packet-${claim.claimId}`,
    claimId: claim.claimId,
    candidateId: claim.candidateId,
    candidateName,
    personId: claim.personId,
    electionType: candidate.electionType ?? 'unknown',
    districtId: candidate.districtId ?? null,
    candidateStatus: candidate.candidateStatus ?? 'unknown',
    formalStatus: candidate.formalStatus ?? 'unknown',
    partyStatus: candidate.partyStatus ?? 'unknown',
    claim: {
      category: claim.category,
      claimType: claim.claimType,
      title: claim.title,
      organization: claim.organization,
      value: claim.value,
      sourcePublicationDate: claim.sourcePublicationDate,
      validFrom: claim.validFrom,
      validTo: claim.validTo,
      temporalPrecision: claim.temporalPrecision,
      currentStatus: claim.currentStatus,
      attribution: claim.attribution,
      sourceDependency: claim.sourceDependency,
    },
    source: {
      sourceId: source.sourceId,
      attemptId: source.attemptId,
      url: source.url,
      method: source.method,
      rawPath: source.rawPath,
      sha256: source.sha256,
      byteLength: source.byteLength,
      httpStatus: source.httpStatus,
      sourceRetrievedAt: source.sourceRetrievedAt,
      timestampQuality: source.timestampQuality,
      rawContext,
      sourceTextContext,
    },
    evidence,
    identity,
    packetNotes: [
      'Prepared from retained source bytes; no prior deterministic or editorial verdicts are included.',
      `Plain-text source context checksum: ${sha256(Buffer.from(plainText, 'utf8'))}.`,
    ],
  };
  const packetSha256 = sha256(
    Buffer.from(JSON.stringify(packetWithoutHash), 'utf8'),
  );
  return SemanticEvidencePacketSchema.parse({
    ...packetWithoutHash,
    packetSha256,
  });
});

mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
writeFileSync(
  OUTPUT_PATH,
  `${JSON.stringify({ schemaVersion: '1', datasetId: dataset.datasetId, snapshotDate: dataset.snapshotDate, generatedAt, packets }, null, 2)}\n`,
);
console.log(
  `Prepared ${packets.length} semantic evidence packets at ${OUTPUT_PATH}.`,
);
