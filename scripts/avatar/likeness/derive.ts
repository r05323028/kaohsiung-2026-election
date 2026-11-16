import { createHash } from 'node:crypto';
import {
  LIKENESS_SCHEMA_VERSION,
  type LikenessLoadableFile,
  type LikenessManifest,
  parseLikenessManifest,
  parseLikenessReview,
  validateLikenessLoadable,
} from '../../../src/data/avatars/likeness/schema';

export function sha256(input: Buffer | string) {
  return createHash('sha256').update(input).digest('hex');
}

/**
 * Derives the runtime kit list (approved only) from generation facts plus
 * hand-authored human review decisions. Pure: it never approves anything by
 * itself and it never writes files.
 */
export function deriveLoadable(
  manifestBytes: Buffer,
  reviewBytes: Buffer,
): { loadable: LikenessLoadableFile; errors: string[] } {
  const manifest = parseLikenessManifest(
    JSON.parse(manifestBytes.toString('utf8')),
  ) as LikenessManifest;
  const review = parseLikenessReview(JSON.parse(reviewBytes.toString('utf8')));
  const byCandidate = new Map(
    manifest.candidates.map((entry) => [entry.candidateId, entry] as const),
  );
  const errors: string[] = [];
  const kits: LikenessLoadableFile['kits'] = [];

  for (const decision of review.decisions) {
    const entry = byCandidate.get(decision.candidateId);
    if (!entry) {
      errors.push(
        `${decision.candidateId}: review decision for a candidate outside the roster`,
      );
      continue;
    }
    if (decision.decision === 'rejected') continue;
    if (
      entry.state !== 'generated' ||
      !entry.headKit ||
      !entry.appearanceSha256
    ) {
      errors.push(
        `${decision.candidateId}: approved but no generated head kit`,
      );
      continue;
    }
    if (decision.headKitSha256 !== entry.headKit.sha256) {
      errors.push(
        `${decision.candidateId}: approval is pinned to a different head kit; re-review after regeneration`,
      );
      continue;
    }
    if (decision.appearanceSha256 !== entry.appearanceSha256) {
      errors.push(
        `${decision.candidateId}: approval is pinned to a different appearance record; re-review after re-extraction`,
      );
      continue;
    }
    if (entry.photoIdentityConfidence !== 'source-linked') {
      errors.push(
        `${decision.candidateId}: cannot approve a likeness whose photo identity is ${entry.photoIdentityConfidence ?? 'unknown'}`,
      );
      continue;
    }
    kits.push({
      candidateId: entry.candidateId,
      slug: entry.slug,
      path: entry.headKit.path,
      sha256: entry.headKit.sha256,
    });
  }

  kits.sort((a, b) => a.candidateId.localeCompare(b.candidateId));
  const loadable = validateLikenessLoadable({
    schemaVersion: LIKENESS_SCHEMA_VERSION,
    note: 'Derived from manifest.json + review.json. Only human-approved kits are listed; everything else keeps the shared base avatar.',
    manifestSha256: sha256(manifestBytes),
    reviewSha256: sha256(reviewBytes),
    kits,
  });
  return { loadable, errors };
}

export function serializeLoadable(loadable: LikenessLoadableFile) {
  return `${JSON.stringify(loadable, null, 2)}\n`;
}
