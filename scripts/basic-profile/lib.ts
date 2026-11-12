import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import approvedRoster from '../../data/approved/2026/kaohsiung-election.json';

export const root = process.cwd();
export const basicRoot = join(root, 'data/research/2026/basic-profiles');
export const queuePath = join(basicRoot, 'queue.json');
export const seedDir = join(basicRoot, 'seed');
export const researcherDir = join(basicRoot, 'researcher');
export const verifierDir = join(basicRoot, 'verifier');
export const artifactsDir = join(basicRoot, 'artifacts');
export const normalizedPath = join(
  root,
  'data/normalized/2026/basic-profiles.json',
);
export const publicationPath = join(
  root,
  'data/published/2026/candidate-basic-profiles.json',
);

export type RosterCandidate = {
  id: string;
  slug: string;
  displayName: string;
  shortName: string;
  districtId: string;
  electionType: 'mayoral' | 'city-council' | 'indigenous-council';
  candidateNumber: string;
  candidateNumberStatus: 'drawn' | 'final' | 'not-published';
  birthDate?: string;
  politicalParty?: string;
  currentPosition?: string;
  partyStatus?: string;
  publicationStatus?: string;
};

export type QueueEntry = {
  candidateId: string;
  displayName: string;
  districtId: string;
  districtLabel: string;
  electionType: 'mayoral' | 'city-council' | 'indigenous-council';
  candidateNumber: string;
  politicalParty?: string;
  birthDate?: string;
  batchId: string;
  status: string;
  identityStatus: string;
  fieldStatus: Record<string, string>;
  verificationStatus?: string;
  finalStatus?: string;
};

export type RosterDistrict = {
  id: string;
  name: string;
  districtLabel: string;
  electionType: 'mayoral' | 'city-council' | 'indigenous-council';
};

type ApprovedRoster = {
  candidates: RosterCandidate[];
  districts: RosterDistrict[];
};

export const roster = approvedRoster as ApprovedRoster;

export const candidates = roster.candidates;
export const districts = roster.districts;
export const queue = readJson<{
  candidates: QueueEntry[];
}>(queuePath);
export const queueCandidates = queue.candidates;

export const candidateById = new Map(
  candidates.map((candidate) => [candidate.id, candidate]),
);
export const districtById = new Map(
  districts.map((district) => [district.id, district]),
);

export function normalizeName(value: string): string {
  return value
    .normalize('NFKC')
    .replaceAll('　', '')
    .replaceAll(/\s+/g, '')
    .replaceAll('．', '·')
    .replaceAll('‧', '·');
}

export const candidateByName = new Map(
  candidates.map((candidate) => [
    normalizeName(candidate.displayName),
    candidate,
  ]),
);

export function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

export function readJson<T>(path: string): T {
  const text = readFileSync(path, 'utf8');
  try {
    return JSON.parse(text) as T;
  } catch (error) {
    throw new Error(`Invalid JSON at ${path}: ${(error as Error).message}`);
  }
}

export function sha256(value: Buffer | string): string {
  return createHash('sha256').update(value).digest('hex');
}

export const BATCH_SIZE = 12;

export function batchIdForIndex(index: number): string {
  return `batch-${String(Math.floor(index / BATCH_SIZE) + 1).padStart(2, '0')}`;
}

export function sortedCandidates(): RosterCandidate[] {
  const districtOrder = new Map(
    districts.map((district, index) => [district.id, index]),
  );
  return [...candidates].sort((left, right) => {
    const leftDistrict =
      districtOrder.get(left.districtId) ?? Number.MAX_SAFE_INTEGER;
    const rightDistrict =
      districtOrder.get(right.districtId) ?? Number.MAX_SAFE_INTEGER;
    if (leftDistrict !== rightDistrict) return leftDistrict - rightDistrict;
    return left.candidateNumber.localeCompare(
      right.candidateNumber,
      'zh-Hant',
      {
        numeric: true,
      },
    );
  });
}

export function districtLabelFor(candidate: RosterCandidate): string {
  const district = districtById.get(candidate.districtId);
  if (!district) {
    throw new Error(`Unknown district: ${candidate.districtId}`);
  }
  return district.name;
}

export function isoNow(): string {
  return new Date().toISOString();
}

export function readSeed<T = Record<string, unknown>>(
  name: string,
  key: string,
): T[] {
  const path = join(seedDir, `${name}.json`);
  const payload = readJson<Record<string, unknown>>(path);
  const value = payload[key];
  if (!Array.isArray(value)) {
    throw new Error(`Seed ${name}.${key} is not an array.`);
  }
  return value as T[];
}
