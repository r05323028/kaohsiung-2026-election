import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import {
  type LikenessDisposition,
  type LikenessManifest,
  parseLikenessAppearances,
  parseLikenessManifest,
  parseLikenessPhotos,
  parseLikenessReview,
  validateLikenessLoadable,
} from '../../../src/data/avatars/likeness/schema';
import { officialDataset } from '../../../src/data/official/index';
import { LIKENESS_BUDGETS } from './budgets';
import { deriveLoadable, serializeLoadable, sha256 } from './derive';
import { readGlbStats } from './glb-stats';
import { parseLikenessProfiles } from './profiles';

const ROOT = process.cwd();
/** Kits are generated outside the published tree; publish copies approved ones into public/. */
const KIT_DIR = path.join(ROOT, 'data/avatars/likeness/kits');
const MANIFEST_PATH = 'data/avatars/likeness/manifest.json';
const PHOTOS_PATH = 'data/avatars/likeness/photos.json';
const APPEARANCES_PATH = 'data/avatars/likeness/appearances.json';
const PROFILES_PATH = 'data/avatars/likeness/profiles.json';
const REVIEW_PATH = 'data/avatars/likeness/review.json';
const LOADABLE_PATH = 'data/avatars/likeness/loadable.json';
const ROSTER_SOURCE = 'data/approved/2026/kaohsiung-election.json';

const errors: string[] = [];
const notes: string[] = [];

function fail(message: string) {
  errors.push(message);
}

function kitFile(pathname: string) {
  return path.join(KIT_DIR, path.basename(pathname));
}

function checkGeneratedKit(entry: LikenessDisposition) {
  if (entry.state !== 'generated') return Promise.resolve();
  const headKit = entry.headKit;
  if (!headKit) {
    fail(`${entry.slug}: generated disposition without a head kit`);
    return Promise.resolve();
  }
  const filePath = kitFile(headKit.path);
  return stat(filePath)
    .then(async (fileStat) => {
      if (fileStat.size !== headKit.fileSizeBytes)
        fail(
          `${entry.slug}: manifest size ${headKit.fileSizeBytes} does not match file size ${fileStat.size}`,
        );
      const { stats } = await readGlbStats(filePath);
      if (stats.sha256 !== headKit.sha256)
        fail(
          `${entry.slug}: SHA-256 mismatch; manifest ${headKit.sha256}, actual ${stats.sha256}`,
        );
      if (stats.meshCount !== headKit.meshCount)
        fail(
          `${entry.slug}: mesh count ${headKit.meshCount} != GLB ${stats.meshCount}`,
        );
      if (stats.materialCount !== headKit.materialCount)
        fail(
          `${entry.slug}: material count ${headKit.materialCount} != GLB ${stats.materialCount}`,
        );
      if (stats.triangleCount !== headKit.triangleCount)
        fail(
          `${entry.slug}: triangle count ${headKit.triangleCount} != GLB ${stats.triangleCount}`,
        );
      for (const key of [
        'minX',
        'maxX',
        'minY',
        'maxY',
        'minZ',
        'maxZ',
      ] as const) {
        if (Math.abs(stats.bounds[key] - headKit.bounds[key]) > 1e-4)
          fail(
            `${entry.slug}: bounds.${key} ${headKit.bounds[key]} != GLB ${stats.bounds[key]}`,
          );
      }
      if (stats.hasSkins) fail(`${entry.slug}: head kit carries a skin`);
      if (stats.hasAnimations)
        fail(`${entry.slug}: head kit carries animations`);
      if (stats.hasImages) fail(`${entry.slug}: head kit carries textures`);
      if (
        stats.triangleCount < LIKENESS_BUDGETS.triangleCount.min ||
        stats.triangleCount > LIKENESS_BUDGETS.triangleCount.max
      )
        fail(`${entry.slug}: ${stats.triangleCount} triangles outside budget`);
      if (stats.fileSizeBytes > LIKENESS_BUDGETS.fileSizeBytes.max)
        fail(`${entry.slug}: ${stats.fileSizeBytes} bytes above budget`);
    })
    .catch((error: unknown) => {
      fail(
        `${entry.slug}: head kit unreadable at ${headKit.path}: ${error instanceof Error ? error.message : String(error)}`,
      );
    });
}

async function main() {
  const manifestBytes = await readFile(MANIFEST_PATH);
  const reviewBytes = await readFile(REVIEW_PATH);
  const manifest = parseLikenessManifest(
    JSON.parse(manifestBytes.toString('utf8')),
  ) as LikenessManifest;
  const review = parseLikenessReview(JSON.parse(reviewBytes.toString('utf8')));
  const photos = parseLikenessPhotos(
    JSON.parse(await readFile(PHOTOS_PATH, 'utf8')),
  );
  const appearances = parseLikenessAppearances(
    JSON.parse(await readFile(APPEARANCES_PATH, 'utf8')),
  );

  const rosterSha = sha256(await readFile(ROSTER_SOURCE));
  if (manifest.roster.sha256 !== rosterSha)
    fail(
      'manifest roster hash is stale; rerun npm run avatars:likeness:generate after the official roster changes',
    );
  if (manifest.roster.candidateCount !== officialDataset.candidates.length)
    fail(
      `manifest covers ${manifest.roster.candidateCount} candidates, roster has ${officialDataset.candidates.length}`,
    );

  const rosterById = new Map(
    officialDataset.candidates.map(
      (candidate) => [candidate.id, candidate] as const,
    ),
  );
  const photosById = new Map(
    photos.photos.map((photo) => [photo.photoId, photo] as const),
  );
  const profileIds = await readFile(PROFILES_PATH, 'utf8')
    .then((bytes) =>
      Object.keys(parseLikenessProfiles(JSON.parse(bytes)).profiles),
    )
    .catch((error: unknown) => {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw error;
    });
  for (const appearanceId of profileIds) {
    if (
      !appearances.appearances.some(
        (entry) => entry.appearanceId === appearanceId,
      )
    )
      fail(`${PROFILES_PATH}: unknown appearance ${appearanceId}`);
  }

  const appearanceByCandidate = new Map(
    appearances.appearances.map(
      (appearance) => [appearance.candidateId, appearance] as const,
    ),
  );
  const dispositions = new Map(
    manifest.candidates.map((entry) => [entry.candidateId, entry] as const),
  );

  for (const candidate of officialDataset.candidates) {
    const entry = dispositions.get(candidate.id);
    if (!entry) {
      fail(`${candidate.id}: missing disposition`);
      continue;
    }
    if (entry.slug !== candidate.slug)
      fail(
        `${candidate.id}: slug ${entry.slug} does not match roster slug ${candidate.slug}`,
      );
    if (entry.displayName !== candidate.displayName)
      fail(
        `${candidate.id}: display name drift (${entry.displayName} vs ${candidate.displayName})`,
      );
  }

  for (const entry of manifest.candidates) {
    for (const photoId of entry.photoIds) {
      const photo = photosById.get(photoId);
      if (!photo) {
        fail(`${entry.slug}: manifest references unknown photo ${photoId}`);
        continue;
      }
      if (photo.candidateId !== entry.candidateId)
        fail(
          `${entry.slug}: photo ${photoId} belongs to ${photo.candidateId}, not this candidate`,
        );
    }
    const appearance = appearanceByCandidate.get(entry.candidateId);
    if (appearance) {
      const expectedId = entry.candidateId.replace(/^official-/u, '');
      if (appearance.appearanceId !== expectedId)
        fail(
          `${entry.slug}: appearanceId ${appearance.appearanceId} must equal ${expectedId}`,
        );
      if (entry.appearanceSha256 !== sha256(JSON.stringify(appearance)))
        fail(`${entry.slug}: appearanceSha256 does not match appearances.json`);
      if (!entry.appearanceId)
        fail(
          `${entry.slug}: appearance exists but manifest has no appearanceId`,
        );
      for (const photoId of appearance.sourcePhotoIds) {
        const photo = photosById.get(photoId);
        if (!photo)
          fail(`${entry.slug}: appearance cites unknown photo ${photoId}`);
        else if (photo.candidateId !== entry.candidateId)
          fail(
            `${entry.slug}: appearance cites ${photoId} of another candidate`,
          );
      }
      const parameters: Array<[string, { basis: string; photoIds: string[] }]> =
        [];
      for (const [key, value] of Object.entries(appearance)) {
        if (typeof value !== 'object' || value === null) continue;
        if (!('basis' in value) || !('photoIds' in value)) continue;
        parameters.push([key, value as { basis: string; photoIds: string[] }]);
      }
      for (const [key, parameter] of parameters) {
        if (parameter.basis === 'default') continue;
        if (parameter.photoIds.length === 0)
          fail(
            `${entry.slug}: ${key} claims basis ${parameter.basis} without a photoId`,
          );
        for (const photoId of parameter.photoIds) {
          if (!appearance.sourcePhotoIds.includes(photoId))
            fail(
              `${entry.slug}: ${key} cites ${photoId} outside sourcePhotoIds`,
            );
        }
      }
    } else if (entry.state === 'generated' || entry.state === 'extracted') {
      fail(`${entry.slug}: state ${entry.state} requires an appearance record`);
    }
    await checkGeneratedKit(entry);
  }

  for (const appearance of appearances.appearances) {
    const entry = dispositions.get(appearance.candidateId);
    if (!entry)
      fail(`${appearance.appearanceId}: appearance for unknown candidate`);
    const usedPhotos = appearance.sourcePhotoIds.map((id) =>
      photosById.get(id),
    );
    for (const photo of usedPhotos) {
      if (!photo) continue;
      if (photo.derivativeUse === 'not-allowed')
        fail(
          `${appearance.appearanceId}: photo ${photo.photoId} does not license derivative works`,
        );
      if (photo.derivativeUse === 'unverified')
        fail(
          `${appearance.appearanceId}: photo ${photo.photoId} has unverified licensing`,
        );
      if (photo.identityConfidence === 'unverified')
        fail(
          `${appearance.appearanceId}: photo ${photo.photoId} identity is unverified`,
        );
      if (!rosterById.has(photo.candidateId))
        fail(`${photo.photoId}: unknown candidate ${photo.candidateId}`);
    }
  }

  for (const decision of review.decisions) {
    const entry = dispositions.get(decision.candidateId);
    if (!entry) continue;
    if (decision.decision !== 'approved') continue;
    if (!entry.headKit)
      fail(`${decision.candidateId}: approved without a head kit`);
    else if (decision.headKitSha256 !== entry.headKit.sha256)
      fail(
        `${decision.candidateId}: approval hash no longer matches the head kit`,
      );
    if (entry.photoIdentityConfidence !== 'source-linked')
      fail(
        `${decision.candidateId}: approved likeness with ${entry.photoIdentityConfidence ?? 'unknown'} photo identity`,
      );
  }

  const derived = deriveLoadable(manifestBytes, reviewBytes);
  for (const error of derived.errors) fail(error);
  const currentLoadable = await readFile(LOADABLE_PATH, 'utf8').catch(() => '');
  if (currentLoadable !== serializeLoadable(derived.loadable))
    fail('loadable.json is stale; run npm run avatars:likeness:publish');
  const loadable = validateLikenessLoadable(
    JSON.parse(currentLoadable || '{}'),
  );

  const counts = new Map<string, number>();
  for (const entry of manifest.candidates)
    counts.set(entry.state, (counts.get(entry.state) ?? 0) + 1);
  for (const entry of manifest.candidates) {
    if (
      entry.state === 'generated' &&
      entry.photoIdentityConfidence !== 'source-linked'
    )
      notes.push(
        `${entry.slug}: generated from ${entry.photoIdentityConfidence} photo identity; cannot be approved until identity is source-linked`,
      );
  }

  console.log(
    `likeness: ${manifest.candidates.length} candidates — ${[...counts].map(([state, count]) => `${state}=${count}`).join(', ')}`,
  );
  console.log(
    `likeness: ${review.decisions.length} review decision(s), ${loadable.kits.length} approved kit(s)`,
  );
  for (const note of notes) console.log(`note: ${note}`);
  if (errors.length > 0) {
    console.error(`likeness: ${errors.length} error(s)`);
    for (const error of errors) console.error(`  - ${error}`);
    process.exit(1);
  }
  console.log('likeness: OK');
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
