/**
 * Stage 2 of the likeness photo pipeline: download the photos a curator
 * selected in `tmp/avatar-pipeline/photo-selection.json`, verify the bytes,
 * and write the committed manifest `data/avatars/likeness/photos.json`.
 *
 * Only the manifest is committed. Image bytes stay in tmp/avatar-pipeline/,
 * because the repository never carries third-party image data; the manifest
 * carries the SHA-256 of the exact bytes that were measured so a later run can
 * prove it saw the same file.
 *
 * Every field that can be read from the Wikimedia Commons metadata recorded by
 * `research-commons.ts` is taken from there. The curator file only supplies
 * judgements that a machine cannot make: view, identity confidence, face box,
 * reviewer note.
 */

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import approvedInput from '../../../data/approved/2026/kaohsiung-election.json';
import {
  LIKENESS_SCHEMA_VERSION,
  LikenessPhotoFileSchema,
  LikenessPhotoSchema,
} from '../../../src/data/avatars/likeness/schema';
import { validateOfficialDataset } from '../../../src/data/official/schema';

const USER_AGENT =
  'KaohsiungCivicStoriesLikenessResearch/1.0 (https://github.com/r05323028/kaohsiung-2026-election; civic likeness reference; node tsx)';
const DOWNLOAD_TIMEOUT_MS = 30_000;
const MAX_BYTES = 60 * 1024 * 1024;
const STAGING_PATH = path.join(
  process.cwd(),
  'tmp/avatar-pipeline/commons-candidates.json',
);
const SELECTION_PATH = path.join(
  process.cwd(),
  'tmp/avatar-pipeline/photo-selection.json',
);
const CACHE_DIR = path.join(process.cwd(), 'tmp/avatar-pipeline/photos');
const MANIFEST_PATH = path.join(
  process.cwd(),
  'data/avatars/likeness/photos.json',
);

const StagedPhotoSchema = z.object({
  fileTitle: z.string(),
  descriptionUrl: z.string(),
  originalUrl: z.string(),
  mime: z.string(),
  width: z.number(),
  height: z.number(),
  license: z.object({
    licenseName: z.string(),
    licenseUrl: z.string().nullable(),
    author: z.string().nullable(),
    attributionRequired: z.boolean(),
    derivativeUse: LikenessPhotoSchema.shape.derivativeUse,
    reason: z.string(),
  }),
  screen: z.enum(['pursue', 'reject']),
  screenReason: z.string(),
});

const StagingFileSchema = z.object({
  retrievedAt: z.string(),
  candidates: z.array(
    z.object({
      candidateId: z.string(),
      displayName: z.string(),
      photos: z.array(StagedPhotoSchema),
    }),
  ),
});

const SelectionFileSchema = z.object({
  retrievedAt: z.string(),
  note: z.string(),
  selected: z.array(
    z.object({
      photoId: z.string().regex(/^[a-z0-9-]+$/u),
      candidateId: z.string(),
      fileTitle: z.string(),
      view: LikenessPhotoSchema.shape.view,
      faceBox: LikenessPhotoSchema.shape.faceBox,
      identityConfidence: LikenessPhotoSchema.shape.identityConfidence,
      identityEvidence: z.array(z.string()).min(1),
      usability: LikenessPhotoSchema.shape.usability,
      reviewerNote: z.string().min(1),
    }),
  ),
});

type StagedPhoto = z.infer<typeof StagedPhotoSchema>;
type Selection = z.infer<typeof SelectionFileSchema>;

function fail(message: string): never {
  throw new Error(message);
}

/**
 * Reads the intrinsic pixel size from PNG, JPEG, or WebP bytes so the manifest
 * records what the download actually contains rather than what the API said.
 */
export function readImageDimensions(bytes: Buffer): {
  width: number;
  height: number;
} {
  // PNG: 8-byte signature, then the IHDR chunk.
  if (
    bytes.length > 24 &&
    bytes
      .subarray(0, 8)
      .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  )
    return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };

  // WebP: RIFF container with a VP8/VP8L/VP8X chunk.
  if (
    bytes.length > 30 &&
    bytes.subarray(0, 4).toString('ascii') === 'RIFF' &&
    bytes.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    const chunk = bytes.subarray(12, 16).toString('ascii');
    if (chunk === 'VP8X')
      return {
        width: 1 + bytes.readUIntLE(24, 3),
        height: 1 + bytes.readUIntLE(27, 3),
      };
    if (chunk === 'VP8 ')
      return {
        width: bytes.readUInt16LE(26) & 0x3fff,
        height: bytes.readUInt16LE(28) & 0x3fff,
      };
    if (chunk === 'VP8L') {
      const bits = bytes.readUInt32LE(21);
      return {
        width: (bits & 0x3fff) + 1,
        height: ((bits >> 14) & 0x3fff) + 1,
      };
    }
  }

  if (bytes.length > 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < bytes.length) {
      if (bytes[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      const marker = bytes[offset + 1] ?? 0;
      const length = bytes.readUInt16BE(offset + 2);
      const isStartOfFrame =
        marker >= 0xc0 &&
        marker <= 0xcf &&
        marker !== 0xc4 &&
        marker !== 0xc8 &&
        marker !== 0xcc;
      if (isStartOfFrame)
        return {
          width: bytes.readUInt16BE(offset + 7),
          height: bytes.readUInt16BE(offset + 5),
        };
      offset += 2 + length;
    }
  }

  return fail('could not read image dimensions (unsupported container)');
}

function extensionFor(mime: string, fileTitle: string): string {
  if (mime === 'image/png') return 'png';
  if (mime === 'image/webp') return 'webp';
  if (mime === 'image/jpeg') return 'jpg';
  const fromTitle = /\.([a-z0-9]+)$/iu.exec(fileTitle)?.[1];
  return (fromTitle ?? 'bin').toLowerCase();
}

async function download(url: string): Promise<Buffer> {
  const response = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'image/jpeg,image/png,image/webp',
    },
    signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
  });
  if (!response.ok)
    throw new Error(`download failed (${response.status}): ${url}`);
  const declared = Number(response.headers.get('content-length') ?? '0');
  if (declared > MAX_BYTES)
    throw new Error(`refusing ${declared} byte download: ${url}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length === 0) throw new Error(`empty download: ${url}`);
  if (bytes.length > MAX_BYTES)
    throw new Error(`download exceeds ${MAX_BYTES} bytes: ${url}`);
  return bytes;
}

function findStagedPhoto(
  staging: z.infer<typeof StagingFileSchema>,
  selection: Selection['selected'][number],
): StagedPhoto {
  const candidate = staging.candidates.find(
    (entry) => entry.candidateId === selection.candidateId,
  );
  if (!candidate)
    fail(`selection names an unknown candidateId: ${selection.candidateId}`);
  const photo = candidate.photos.find(
    (entry) => entry.fileTitle === selection.fileTitle,
  );
  if (!photo)
    fail(
      `no staged Commons file "${selection.fileTitle}" for ${selection.candidateId}; re-run research-commons.ts`,
    );
  if (photo.screen === 'reject')
    fail(
      `staged file "${selection.fileTitle}" was rejected by screening: ${photo.screenReason}`,
    );
  return photo;
}

async function main(): Promise<void> {
  const staging = StagingFileSchema.parse(
    JSON.parse(await readFile(STAGING_PATH, 'utf8')),
  );
  const selection = SelectionFileSchema.parse(
    JSON.parse(await readFile(SELECTION_PATH, 'utf8')),
  );
  const roster = validateOfficialDataset(approvedInput);
  const candidateIds = new Set(roster.candidates.map((entry) => entry.id));

  const photoIds = new Set<string>();
  const perCandidate = new Map<string, number>();
  const photos: z.infer<typeof LikenessPhotoSchema>[] = [];

  await mkdir(CACHE_DIR, { recursive: true });

  for (const entry of selection.selected) {
    if (!candidateIds.has(entry.candidateId))
      fail(`candidateId not in the approved roster: ${entry.candidateId}`);
    if (photoIds.has(entry.photoId))
      fail(`duplicate photoId: ${entry.photoId}`);
    photoIds.add(entry.photoId);

    const count = (perCandidate.get(entry.candidateId) ?? 0) + 1;
    if (count > 2) fail(`more than two photos for ${entry.candidateId}`);
    perCandidate.set(entry.candidateId, count);

    const staged = findStagedPhoto(staging, entry);
    const bytes = await download(staged.originalUrl);
    const actual = readImageDimensions(bytes);
    if (actual.width !== staged.width || actual.height !== staged.height)
      fail(
        `dimension mismatch for ${staged.fileTitle}: API ${staged.width}x${staged.height}, bytes ${actual.width}x${actual.height}`,
      );

    const extension = extensionFor(staged.mime, staged.fileTitle);
    const cachePath = path.join(CACHE_DIR, `${entry.photoId}.${extension}`);
    await writeFile(cachePath, bytes);
    const bytesSha256 = createHash('sha256').update(bytes).digest('hex');

    photos.push({
      photoId: entry.photoId,
      candidateId: entry.candidateId,
      sourceUrl: staged.descriptionUrl,
      fileTitle: staged.fileTitle,
      sourceKind: 'wikimedia-commons',
      publisher: 'Wikimedia Commons',
      author: staged.license.author,
      licenseName: staged.license.licenseName,
      licenseUrl: staged.license.licenseUrl,
      derivativeUse: staged.license.derivativeUse,
      attributionRequired: staged.license.attributionRequired,
      retrievedAt: staging.retrievedAt,
      bytesSha256,
      width: actual.width,
      height: actual.height,
      view: entry.view,
      faceBox: entry.faceBox,
      identityConfidence: entry.identityConfidence,
      identityEvidence: entry.identityEvidence,
      usability: entry.usability,
      reviewerNote: entry.reviewerNote,
    });

    console.log(
      `cached ${entry.photoId} <- ${staged.fileTitle} (${actual.width}x${actual.height}, ${(bytes.length / 1024).toFixed(0)} KiB)`,
    );
  }

  const manifest = LikenessPhotoFileSchema.parse({
    schemaVersion: LIKENESS_SCHEMA_VERSION,
    retrievedAt: staging.retrievedAt,
    cacheNote:
      'Image bytes are never committed. Re-download from sourceUrl, verify bytesSha256, and unpack into tmp/avatar-pipeline/photos/<photoId>.<ext> as fetch.ts does.',
    photos,
  });

  await writeFile(
    MANIFEST_PATH,
    `${JSON.stringify(manifest, null, 2)}\n`,
    'utf8',
  );
  console.log(
    `wrote ${photos.length} photos to ${path.relative(process.cwd(), MANIFEST_PATH)}`,
  );
}

await main();
