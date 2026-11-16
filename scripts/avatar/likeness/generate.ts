import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { officialDataset } from '../../../src/data/official/index';
import {
  LIKENESS_SCHEMA_VERSION,
  type LikenessAppearance,
  type LikenessDisposition,
  type LikenessPhoto,
  type LikenessManifest,
  parseLikenessAppearances,
  parseLikenessManifest,
  parseLikenessPhotos,
} from '../../../src/data/avatars/likeness/schema';
import { LIKENESS_BUDGETS } from './budgets';
import { readGlbStats } from './glb-stats';
import { headKitParamsFor } from './params';

const run = promisify(execFile);

const ROOT = process.cwd();
const ROSTER_SOURCE = 'data/approved/2026/kaohsiung-election.json';
const PHOTOS_PATH = 'data/avatars/likeness/photos.json';
const APPEARANCES_PATH = 'data/avatars/likeness/appearances.json';
const MANIFEST_PATH = 'data/avatars/likeness/manifest.json';
/** Kits stay out of the published tree until publish copies approved ones in. */
const OUT_DIR = 'data/avatars/likeness/kits';
const PARAMS_DIR = 'tmp/avatar-pipeline/params';
const RENDER_DIR = 'reports/avatar/heads';
const PIPELINE_VERSION = 'likeness-1';
const BLENDER = process.env.BLENDER_BIN ?? 'blender';
const HEAD_SCRIPT = 'scripts/avatar/blender/head_kit.py';
const VIEWS = 'front,three-quarter';

type Options = {
  candidates: string[];
  render: boolean;
  skipBlender: boolean;
  manifestOnly: boolean;
};

function parseArgs(argv: string[]): Options {
  const options: Options = {
    candidates: [],
    render: false,
    skipBlender: false,
    manifestOnly: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--candidate') {
      const value = argv[index + 1];
      if (!value) throw new Error('--candidate needs a candidate id');
      options.candidates.push(value);
      index += 1;
    } else if (arg === '--all') {
      // default behaviour; accepted for symmetry with other scripts
    } else if (arg === '--render') {
      options.render = true;
    } else if (arg === '--skip-blender') {
      options.skipBlender = true;
    } else if (arg === '--manifest-only') {
      options.manifestOnly = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return options;
}

function sha256(input: string | Buffer) {
  return createHash('sha256').update(input).digest('hex');
}

function timestamp() {
  const epoch = process.env.SOURCE_DATE_EPOCH;
  if (epoch) return new Date(Number(epoch) * 1000).toISOString();
  return new Date().toISOString();
}

function assertBudgets(
  stats: Awaited<ReturnType<typeof readGlbStats>>['stats'],
  label: string,
) {
  const problems: string[] = [];
  const budgets = LIKENESS_BUDGETS;
  if (
    stats.triangleCount < budgets.triangleCount.min ||
    stats.triangleCount > budgets.triangleCount.max
  )
    problems.push(
      `triangles ${stats.triangleCount} outside ${budgets.triangleCount.min}-${budgets.triangleCount.max}`,
    );
  if (
    stats.meshCount < budgets.meshCount.min ||
    stats.meshCount > budgets.meshCount.max
  )
    problems.push(
      `meshes ${stats.meshCount} outside ${budgets.meshCount.min}-${budgets.meshCount.max}`,
    );
  if (
    stats.materialCount < budgets.materialCount.min ||
    stats.materialCount > budgets.materialCount.max
  )
    problems.push(
      `materials ${stats.materialCount} outside ${budgets.materialCount.min}-${budgets.materialCount.max}`,
    );
  if (stats.fileSizeBytes > budgets.fileSizeBytes.max)
    problems.push(
      `file size ${stats.fileSizeBytes} above ${budgets.fileSizeBytes.max}`,
    );
  if (stats.hasSkins) problems.push('head kit must not carry a skin');
  if (stats.hasAnimations) problems.push('head kit must not carry animations');
  if (stats.hasImages) problems.push('head kit must not carry textures');
  const { bounds } = stats;
  if (bounds.minY < budgets.bounds.minY || bounds.maxY > budgets.bounds.maxY)
    problems.push(
      `Y bounds ${bounds.minY.toFixed(3)}..${bounds.maxY.toFixed(3)} outside ${budgets.bounds.minY}..${budgets.bounds.maxY}`,
    );
  const maxAbsX = Math.max(Math.abs(bounds.minX), Math.abs(bounds.maxX));
  if (maxAbsX > budgets.bounds.maxAbsX)
    problems.push(
      `X extent ${maxAbsX.toFixed(3)} exceeds ${budgets.bounds.maxAbsX}`,
    );
  if (bounds.minZ < budgets.bounds.minZ || bounds.maxZ > budgets.bounds.maxZ)
    problems.push(
      `Z bounds ${bounds.minZ.toFixed(3)}..${bounds.maxZ.toFixed(3)} outside ${budgets.bounds.minZ}..${budgets.bounds.maxZ}`,
    );
  if (problems.length > 0)
    throw new Error(
      `${label}: head kit failed budgets:\n  - ${problems.join('\n  - ')}`,
    );
}

async function runBlender(
  appearance: LikenessAppearance,
  slug: string,
  options: Options,
) {
  const params = headKitParamsFor(appearance);
  const paramsPath = path.join(PARAMS_DIR, `${slug}.json`);
  await mkdir(PARAMS_DIR, { recursive: true });
  await writeFile(paramsPath, `${JSON.stringify(params, null, 2)}\n`, 'utf8');

  const glbPath = path.join(OUT_DIR, `${slug}-head.glb`);
  await mkdir(OUT_DIR, { recursive: true });
  const args = [
    '-b',
    '--factory-startup',
    '-P',
    HEAD_SCRIPT,
    '--',
    '--params',
    paramsPath,
    '--out',
    glbPath,
  ];
  if (options.render) {
    await mkdir(RENDER_DIR, { recursive: true });
    args.push(
      '--render',
      path.join(RENDER_DIR, `${slug}.png`),
      '--views',
      VIEWS,
    );
  }
  try {
    await run(BLENDER, args, {
      cwd: ROOT,
      timeout: 180_000,
      maxBuffer: 8 * 1024 * 1024,
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`${slug}: blender failed (${BLENDER}): ${detail}`);
  }
  return glbPath;
}

type IdentityConfidence = LikenessPhoto['identityConfidence'];

const IDENTITY_RANK: Record<IdentityConfidence, number> = {
  unverified: 0,
  probable: 1,
  'source-linked': 2,
};

/** Weakest identity link among the photos that back an appearance. */
export function worstConfidence(
  photos: LikenessPhoto[],
): IdentityConfidence | null {
  let worst: IdentityConfidence | null = null;
  for (const photo of photos) {
    if (
      !worst ||
      IDENTITY_RANK[photo.identityConfidence] < IDENTITY_RANK[worst]
    )
      worst = photo.identityConfidence;
  }
  return worst;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const photosFile = parseLikenessPhotos(
    JSON.parse(await readFile(PHOTOS_PATH, 'utf8')),
  );
  const appearances = parseLikenessAppearances(
    JSON.parse(await readFile(APPEARANCES_PATH, 'utf8')),
  ).appearances;

  const roster = officialDataset.candidates;
  const rosterById = new Map(
    roster.map((candidate) => [candidate.id, candidate] as const),
  );
  const photosByCandidate = new Map<string, LikenessPhoto[]>();
  for (const photo of photosFile.photos) {
    const list = photosByCandidate.get(photo.candidateId) ?? [];
    list.push(photo);
    photosByCandidate.set(photo.candidateId, list);
  }

  const selected =
    options.candidates.length > 0 ? new Set(options.candidates) : null;
  const appearancesByCandidate = new Map<string, LikenessAppearance>();
  for (const appearance of appearances) {
    const candidate = rosterById.get(appearance.candidateId);
    if (!candidate)
      throw new Error(
        `${appearance.appearanceId}: unknown candidate ${appearance.candidateId}`,
      );
    const photos = photosByCandidate.get(appearance.candidateId) ?? [];
    if (photos.length === 0)
      throw new Error(
        `${appearance.appearanceId}: no photo record for this candidate`,
      );
    for (const photoId of appearance.sourcePhotoIds) {
      if (!photos.some((photo) => photo.photoId === photoId))
        throw new Error(
          `${appearance.appearanceId}: sourcePhotoId ${photoId} does not belong to the candidate`,
        );
    }
    if (appearancesByCandidate.has(appearance.candidateId))
      throw new Error(`${appearance.candidateId}: duplicate appearance`);
    appearancesByCandidate.set(appearance.candidateId, appearance);
  }

  const generated = new Map<string, LikenessDisposition['headKit']>();
  const generatedFiles = new Set<string>();

  for (const [candidateId, appearance] of [...appearancesByCandidate].sort(
    ([a], [b]) => a.localeCompare(b),
  )) {
    if (selected && !selected.has(candidateId)) continue;
    const candidate = rosterById.get(candidateId);
    if (!candidate) throw new Error(`${candidateId}: missing from roster`);
    if (options.manifestOnly) continue;
    const glbPath = options.skipBlender
      ? path.join(OUT_DIR, `${candidate.slug}-head.glb`)
      : await runBlender(appearance, candidate.slug, options);
    const { stats } = await readGlbStats(glbPath);
    assertBudgets(stats, candidate.slug);
    generated.set(candidateId, {
      path: `/assets/avatars/likeness/${candidate.slug}-head.glb`,
      sha256: stats.sha256,
      fileSizeBytes: stats.fileSizeBytes,
      meshCount: stats.meshCount,
      materialCount: stats.materialCount,
      triangleCount: stats.triangleCount,
      bounds: {
        minX: stats.bounds.minX,
        maxX: stats.bounds.maxX,
        minY: stats.bounds.minY,
        maxY: stats.bounds.maxY,
        minZ: stats.bounds.minZ,
        maxZ: stats.bounds.maxZ,
      },
      generator: stats.generator,
      blenderVersion: process.env.BLENDER_VERSION ?? '4.5',
    });
    generatedFiles.add(candidate.slug);
    console.log(
      `generated ${candidate.slug} (${stats.triangleCount} tris, ${(stats.fileSizeBytes / 1024).toFixed(1)} KB)`,
    );
  }

  const dispositions: LikenessDisposition[] = [];
  for (const candidate of [...roster].sort((a, b) =>
    a.id.localeCompare(b.id),
  )) {
    const photos = photosByCandidate.get(candidate.id) ?? [];
    const appearance = appearancesByCandidate.get(candidate.id);
    const headKit = generated.get(candidate.id) ?? null;
    const photoIds = photos.map((photo) => photo.photoId);
    if (appearance && headKit) {
      dispositions.push({
        candidateId: candidate.id,
        slug: candidate.slug,
        displayName: candidate.displayName,
        photoIds,
        photoIdentityConfidence: worstConfidence(photos),
        appearanceId: appearance.appearanceId,
        appearanceSha256: sha256(JSON.stringify(appearance)),
        state: 'generated',
        headKit,
        blockedReason: null,
      });
    } else if (appearance) {
      dispositions.push({
        candidateId: candidate.id,
        slug: candidate.slug,
        displayName: candidate.displayName,
        photoIds,
        photoIdentityConfidence: worstConfidence(photos),
        appearanceId: appearance.appearanceId,
        appearanceSha256: sha256(JSON.stringify(appearance)),
        state: 'extracted',
        headKit: null,
        blockedReason: null,
      });
    } else if (photos.length > 0) {
      dispositions.push({
        candidateId: candidate.id,
        slug: candidate.slug,
        displayName: candidate.displayName,
        photoIds,
        photoIdentityConfidence: worstConfidence(photos),
        appearanceId: null,
        appearanceSha256: null,
        state: 'research-pending',
        headKit: null,
        blockedReason: null,
      });
    } else {
      dispositions.push({
        candidateId: candidate.id,
        slug: candidate.slug,
        displayName: candidate.displayName,
        photoIds: [],
        photoIdentityConfidence: null,
        appearanceId: null,
        appearanceSha256: null,
        state: 'blocked-no-photo',
        headKit: null,
        blockedReason:
          'No licensed, identity-linked portrait found; the shared neutral avatar is retained.',
      });
    }
  }

  const manifest: LikenessManifest = parseLikenessManifest({
    schemaVersion: LIKENESS_SCHEMA_VERSION,
    pipelineVersion: PIPELINE_VERSION,
    generatedAt: timestamp(),
    roster: {
      source: ROSTER_SOURCE,
      candidateCount: roster.length,
      sha256: sha256(await readFile(ROSTER_SOURCE)),
    },
    candidates: dispositions,
  });
  await writeFile(
    MANIFEST_PATH,
    `${JSON.stringify(manifest, null, 2)}\n`,
    'utf8',
  );

  const counts = new Map<string, number>();
  for (const entry of dispositions)
    counts.set(entry.state, (counts.get(entry.state) ?? 0) + 1);
  console.log(
    `manifest: ${dispositions.length} candidates (${[...counts].map(([state, count]) => `${state}=${count}`).join(', ')})`,
  );
  if (!options.manifestOnly && generatedFiles.size === 0)
    console.log(
      'note: no head kit was generated; pass --candidate <id> or run without --manifest-only',
    );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
