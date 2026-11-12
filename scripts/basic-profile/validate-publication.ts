import { BasicProfilePublicationSchema } from '../../src/data/basic-profiles/schema';
import { candidates, publicationPath, readJson, sha256 } from './lib';

const raw = readJson<Record<string, unknown>>(publicationPath);
const parsed = BasicProfilePublicationSchema.safeParse(raw);
if (!parsed.success) {
  console.error('Publication schema errors:');
  for (const issue of parsed.error.issues)
    console.error(`  ${issue.path.join('.')}: ${issue.message}`);
  process.exit(1);
}
const publication = parsed.data;
const { checksum, ...input } = publication;
if (sha256(JSON.stringify(input)) !== checksum) {
  console.error('Checksum mismatch.');
  process.exit(1);
}
const rosterIds = new Map(
  candidates.map((candidate) => [candidate.id, candidate]),
);
if (publication.candidates.length !== 106) {
  console.error(
    `Expected 106 candidate coverage rows, found ${publication.candidates.length}.`,
  );
  process.exit(1);
}
if (
  new Set(publication.candidates.map((candidate) => candidate.candidateId))
    .size !== 106
) {
  console.error('Duplicate candidate coverage rows.');
  process.exit(1);
}
const seenClaims = new Set<string>();
const privatePattern =
  /(09\d{8}|\d{2,4}-\d{6,8}|身分證|護照|電子郵件|@[a-z0-9.-]+\.[a-z]{2,})/iu;
for (const claim of publication.claims) {
  if (!rosterIds.has(claim.candidateId)) {
    console.error(`Unknown candidate on claim: ${claim.candidateId}`);
    process.exit(1);
  }
  if (seenClaims.has(claim.claimId)) {
    console.error(`Duplicate claim id: ${claim.claimId}`);
    process.exit(1);
  }
  seenClaims.add(claim.claimId);
  if (claim.verification.verdict !== 'verified') {
    console.error(`Unverified claim published: ${claim.claimId}`);
    process.exit(1);
  }
  if (claim.evidence.sourceClass === 'wikipedia-reference') {
    console.error(`Wikipedia-only claim published: ${claim.claimId}`);
    process.exit(1);
  }
  if (!claim.evidence.url.startsWith('https://')) {
    console.error(`Non-https source: ${claim.claimId}`);
    process.exit(1);
  }
  if (
    privatePattern.test(claim.value) ||
    privatePattern.test(claim.detail ?? '') ||
    privatePattern.test(claim.evidence.excerpt)
  ) {
    console.error(`Possible private data: ${claim.claimId}`);
    process.exit(1);
  }
}
const perCandidate = new Map(
  publication.candidates.map((candidate) => [candidate.candidateId, 0]),
);
for (const claim of publication.claims) {
  perCandidate.set(
    claim.candidateId,
    (perCandidate.get(claim.candidateId) ?? 0) + 1,
  );
}
for (const coverage of publication.candidates) {
  if (coverage.claimCount !== (perCandidate.get(coverage.candidateId) ?? 0)) {
    console.error(`Coverage count mismatch: ${coverage.candidateId}`);
    process.exit(1);
  }
}
if (publication.summary.publishedClaimCount !== publication.claims.length) {
  console.error('Summary claim count mismatch.');
  process.exit(1);
}
if (
  publication.summary.candidatesWithPublishedClaims !==
  publication.candidates.filter((candidate) => candidate.claimCount > 0).length
) {
  console.error('Summary candidate coverage mismatch.');
  process.exit(1);
}
console.log(
  `OK: ${publication.claims.length} independently verified claims across ${publication.summary.candidatesWithPublishedClaims} candidates; checksum verified.`,
);
