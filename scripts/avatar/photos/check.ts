/**
 * Gate for the likeness photo manifest. Fails when the committed manifest and
 * the surrounding evidence stop agreeing:
 *
 * - `data/avatars/likeness/photos.json` must satisfy LikenessPhotoFileSchema.
 * - photoId values are unique and every candidateId exists in the approved
 *   roster for 2026.
 * - licences allow derivative use with a resolvable licence URL.
 * - 'verified' identity claims carry office evidence, not just a name.
 * - cached bytes in tmp/avatar-pipeline/photos/ still hash to bytesSha256 and
 *   still decode to the recorded pixel size (skipped when no cache exists,
 *   because image bytes are never committed).
 * - reports/avatar/photo-availability.md documents all 106 candidates, and
 *   every candidate without a photo carries a written reason.
 */

import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import approvedInput from '../../../data/approved/2026/kaohsiung-election.json';
import {
  LikenessPhotoFileSchema,
  type LikenessPhoto,
} from '../../../src/data/avatars/likeness/schema';
import { validateOfficialDataset } from '../../../src/data/official/schema';
import { readImageDimensions } from './fetch';

const MANIFEST_PATH = path.join(
  process.cwd(),
  'data/avatars/likeness/photos.json',
);
const CACHE_DIR = path.join(process.cwd(), 'tmp/avatar-pipeline/photos');
const REPORT_PATH = path.join(
  process.cwd(),
  'reports/avatar/photo-availability.md',
);
const MAX_PHOTOS_PER_CANDIDATE = 2;

const DERIVATIVE_OK = new Set([
  'allowed-with-attribution',
  'allowed-with-attribution-share-alike',
]);
const OFFICE_EVIDENCE =
  /(議員|議長|副議長|市長|立法委員|市議員|Council|council|Mayor|mayor|councillor|Legislative Yuan)/u;
const REJECTED_LICENSE_NAME =
  /(fair ?use|non-?free|all rights reserved|版權所有)/iu;

const errors: string[] = [];
const notes: string[] = [];

function checkLicence(photo: LikenessPhoto): void {
  if (!DERIVATIVE_OK.has(photo.derivativeUse))
    errors.push(
      `${photo.photoId}: derivativeUse '${photo.derivativeUse}' does not allow derivative work`,
    );
  if (REJECTED_LICENSE_NAME.test(photo.licenseName))
    errors.push(
      `${photo.photoId}: licenseName '${photo.licenseName}' is not reusable`,
    );
  if (photo.attributionRequired && !photo.licenseUrl)
    errors.push(
      `${photo.photoId}: attribution is required but licenseUrl is null`,
    );
  if (photo.attributionRequired && !photo.author)
    notes.push(
      `${photo.photoId}: attribution required with no recorded author; the licence must be credited to the publisher`,
    );
}

function checkIdentityClaim(photo: LikenessPhoto): void {
  if (photo.identityConfidence !== 'source-linked') return;
  if (!photo.identityEvidence.some((entry) => OFFICE_EVIDENCE.test(entry)))
    errors.push(
      `${photo.photoId}: identityConfidence 'source-linked' needs at least one identityEvidence string naming the office or candidacy`,
    );
}

async function checkCachedBytes(
  photo: LikenessPhoto,
  cacheFiles: string[],
): Promise<void> {
  const cached = cacheFiles.find(
    (name) =>
      name.startsWith(`${photo.photoId}.`) &&
      !name.startsWith(`${photo.photoId}.tmp`),
  );
  if (!cached) {
    errors.push(
      `${photo.photoId}: no cached file in tmp/avatar-pipeline/photos (expected ${photo.photoId}.<ext>)`,
    );
    return;
  }
  const bytes = await readFile(path.join(CACHE_DIR, cached));
  const digest = createHash('sha256').update(bytes).digest('hex');
  if (digest !== photo.bytesSha256)
    errors.push(
      `${photo.photoId}: bytesSha256 mismatch for ${cached} (manifest ${photo.bytesSha256.slice(0, 12)}…, file ${digest.slice(0, 12)}…)`,
    );
  const dimensions = readImageDimensions(bytes);
  if (dimensions.width !== photo.width || dimensions.height !== photo.height)
    errors.push(
      `${photo.photoId}: cached ${cached} is ${dimensions.width}x${dimensions.height}, manifest says ${photo.width}x${photo.height}`,
    );
}

type ReportRow = { photoCell: string; reasonCell: string };

function parseReport(markdown: string): Map<string, ReportRow> {
  const rows = new Map<string, ReportRow>();
  for (const line of markdown.split('\n')) {
    const cells = line
      .split('|')
      .slice(1, -1)
      .map((cell) => cell.trim());
    if (cells.length < 4) continue;
    const candidateId = cells[0] ?? '';
    if (!/^official-/u.test(candidateId)) continue;
    rows.set(candidateId, {
      photoCell: cells[3] ?? '',
      reasonCell: cells[cells.length - 1] ?? '',
    });
  }
  return rows;
}

async function main(): Promise<void> {
  const roster = validateOfficialDataset(approvedInput);
  const rosterIds = new Set(roster.candidates.map((entry) => entry.id));

  const raw = await readFile(MANIFEST_PATH, 'utf8').catch(() => null);
  if (raw === null) {
    console.error(`missing ${path.relative(process.cwd(), MANIFEST_PATH)}`);
    process.exitCode = 1;
    return;
  }

  const parsed = LikenessPhotoFileSchema.safeParse(JSON.parse(raw));
  if (!parsed.success) {
    console.error('photos.json does not satisfy LikenessPhotoFileSchema:');
    console.error(z.prettifyError(parsed.error));
    process.exitCode = 1;
    return;
  }
  const manifest = parsed.data;

  const seenPhotoIds = new Set<string>();
  const photosByCandidate = new Map<string, LikenessPhoto[]>();
  for (const photo of manifest.photos) {
    if (seenPhotoIds.has(photo.photoId))
      errors.push(`${photo.photoId}: duplicate photoId`);
    seenPhotoIds.add(photo.photoId);

    if (!rosterIds.has(photo.candidateId)) {
      errors.push(
        `${photo.photoId}: candidateId '${photo.candidateId}' is not in the approved 2026 roster`,
      );
      continue;
    }
    const list = photosByCandidate.get(photo.candidateId) ?? [];
    list.push(photo);
    photosByCandidate.set(photo.candidateId, list);

    checkLicence(photo);
    checkIdentityClaim(photo);

    if (photo.view === 'unusable' && photo.usability === 'usable')
      errors.push(
        `${photo.photoId}: view is 'unusable' but usability is 'usable'`,
      );
  }

  for (const [candidateId, photos] of photosByCandidate) {
    if (photos.length > MAX_PHOTOS_PER_CANDIDATE)
      errors.push(
        `${candidateId}: ${photos.length} photos recorded, the pipeline allows ${MAX_PHOTOS_PER_CANDIDATE}`,
      );
  }

  const cacheFiles = await readdir(CACHE_DIR).catch(() => null);
  if (cacheFiles === null)
    notes.push(
      'no tmp/avatar-pipeline/photos cache: image bytes are never committed, so byte hashes were not re-verified in this run',
    );
  else
    for (const photo of manifest.photos)
      await checkCachedBytes(photo, cacheFiles);

  const reportMarkdown = await readFile(REPORT_PATH, 'utf8').catch(() => null);
  if (reportMarkdown === null)
    errors.push(
      `missing ${path.relative(process.cwd(), REPORT_PATH)}: every candidate needs a photo entry or a documented gap`,
    );
  else {
    const rows = parseReport(reportMarkdown);
    for (const candidateId of rosterIds) {
      const row = rows.get(candidateId);
      if (!row) {
        errors.push(
          `${candidateId}: not listed in reports/avatar/photo-availability.md`,
        );
        continue;
      }
      const photos = photosByCandidate.get(candidateId) ?? [];
      if (photos.length === 0) {
        if (!/暫無資料/u.test(row.photoCell))
          errors.push(
            `${candidateId}: has no photo in photos.json but the report does not mark 暫無資料`,
          );
        if (row.reasonCell.length < 4)
          errors.push(
            `${candidateId}: missing photo without a documented reason`,
          );
      } else if (
        !photos.some((photo) => row.photoCell.includes(photo.photoId))
      ) {
        errors.push(
          `${candidateId}: report photo column does not name any recorded photoId (${photos.map((photo) => photo.photoId).join(', ')})`,
        );
      }
    }
    for (const candidateId of rows.keys())
      if (!rosterIds.has(candidateId))
        errors.push(
          `${candidateId}: report lists a candidate outside the roster`,
        );
  }

  const usabilityCounts = new Map<string, number>();
  for (const photo of manifest.photos)
    usabilityCounts.set(
      photo.usability,
      (usabilityCounts.get(photo.usability) ?? 0) + 1,
    );

  const covered = manifest.photos.length
    ? [...photosByCandidate.keys()].filter((id) => rosterIds.has(id)).length
    : 0;

  console.log(
    `photos: ${manifest.photos.length} across ${covered}/${rosterIds.size} candidates`,
  );
  console.log(
    `usability: ${[...usabilityCounts].map(([key, value]) => `${key}=${value}`).join(', ') || 'none'}`,
  );
  console.log(
    `documented gaps: ${rosterIds.size - covered} candidates without a photo`,
  );
  for (const note of notes) console.log(`note: ${note}`);

  if (errors.length > 0) {
    console.error(`\n${errors.length} problem(s):`);
    for (const error of errors) console.error(`- ${error}`);
    process.exitCode = 1;
    return;
  }
  console.log('likeness photo manifest OK');
}

await main();
