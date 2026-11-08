import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import approvedElectionInput from '../data/approved/2026/kaohsiung-election.json';
import approvedPublicRecordsInput from '../data/approved/2026/kaohsiung-public-records.json';
import manifestInput from '../data/official-source-manifest.json';
import { validateOfficialDataset } from '../src/data/official/schema';
import { sourceChangeStatus } from '../src/data/public-records/adapters';
import {
  buildCoverageDataset,
  buildCoverageReport,
  buildReviewPacket,
  type CoverageBatchOptions,
  type CoverageCategory,
  CoverageCategorySchema,
  type CoverageCheckpoint,
  CoverageDatasetSchema,
  type CoverageSourceCheck,
  coverageMarkdown,
  FullRosterReviewPacketSchema,
  validateCoverageDataset,
} from '../src/data/public-records/coverage';
import { validatePublicRecordsDataset } from '../src/data/public-records/schema';

const root = process.cwd();
const snapshotDate = String(manifestInput.retrievedAt);
const checkedAt = `${snapshotDate}T00:00:00Z`;
const normalizedPath = path.join(
  root,
  'data/normalized/2026/full-roster-public-record-coverage.json',
);
const discoveryPath = path.join(
  root,
  'data/discovery/2026/full-roster-public-record-coverage.json',
);
const checkpointPath = path.join(
  root,
  'data/checkpoints/2026/full-roster-public-records.json',
);
const reviewPath = path.join(
  root,
  'data/review/2026/full-roster-public-records-review.json',
);

type ManifestSource = {
  id: string;
  rawPath?: string | null;
  sha256?: string | null;
  role?: string;
};
const manifestSources = manifestInput.sources as ManifestSource[];
const manifestSourceIds = new Set(manifestSources.map((source) => source.id));
const officialDataset = validateOfficialDataset(approvedElectionInput);
const publicRecordsDataset = validatePublicRecordsDataset(
  approvedPublicRecordsInput,
  manifestSourceIds,
);

type Command = CoverageCheckpoint['command'];
type CliOptions = {
  command: Command;
  candidateIds: string[];
  districtIds: string[];
  category: CoverageCategory | null;
  dryRun: boolean;
  resume: boolean;
  retryLimit: number;
  concurrency: number;
};

function parseList(value: string): string[] {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function valueAfter(args: string[], index: number, flag: string): string {
  const value = args[index + 1];
  if (!value || value.startsWith('--'))
    throw new Error(`${flag} requires a value.`);
  return value;
}

function parseInteger(
  value: string,
  flag: string,
  min: number,
  max: number,
): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max)
    throw new Error(`${flag} must be an integer between ${min} and ${max}.`);
  return parsed;
}

export function parseCoverageArgs(argv: readonly string[]): CliOptions {
  const command = argv[0] as Command | undefined;
  const commands: Command[] = [
    'discover',
    'ingest',
    'validate',
    'review-report',
    'coverage',
  ];
  if (!command || !commands.includes(command))
    throw new Error(
      `Usage: <${commands.join('|')}> [--candidate ID] [--district ID] [--category CATEGORY] [--dry-run] [--resume] [--retries N] [--concurrency N]`,
    );
  const options: CliOptions = {
    command,
    candidateIds: [],
    districtIds: [],
    category: null,
    dryRun: false,
    resume: false,
    retryLimit: 0,
    concurrency: 1,
  };
  for (let index = 1; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg) continue;
    if (arg === '--dry-run') {
      options.dryRun = true;
      continue;
    }
    if (arg === '--resume') {
      options.resume = true;
      continue;
    }
    if (arg === '--candidate' || arg === '--candidates') {
      options.candidateIds.push(
        ...parseList(valueAfter(argv as string[], index, arg)),
      );
      index += 1;
      continue;
    }
    if (arg === '--district' || arg === '--districts') {
      options.districtIds.push(
        ...parseList(valueAfter(argv as string[], index, arg)),
      );
      index += 1;
      continue;
    }
    if (arg === '--category') {
      const value = valueAfter(argv as string[], index, arg);
      const parsed = CoverageCategorySchema.safeParse(value);
      if (!parsed.success)
        throw new Error(`Unknown coverage category: ${value}.`);
      options.category = parsed.data;
      index += 1;
      continue;
    }
    if (arg === '--retries') {
      options.retryLimit = parseInteger(
        valueAfter(argv as string[], index, arg),
        arg,
        0,
        5,
      );
      index += 1;
      continue;
    }
    if (arg === '--concurrency') {
      options.concurrency = parseInteger(
        valueAfter(argv as string[], index, arg),
        arg,
        1,
        8,
      );
      index += 1;
      continue;
    }
    throw new Error(`Unknown option: ${arg}.`);
  }
  return options;
}

function sha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

async function exists(file: string): Promise<boolean> {
  try {
    await readFile(file);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}

async function readJson<T>(file: string): Promise<T> {
  const text = await readFile(file, 'utf8');
  try {
    return JSON.parse(text) as T;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid JSON in ${path.relative(root, file)}: ${detail}`);
  }
}

async function writeAtomic(file: string, value: string): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.tmp`;
  await writeFile(temporary, value, 'utf8');
  await rename(temporary, file);
}

async function buildSourceChecks(): Promise<CoverageSourceCheck[]> {
  const checks: CoverageSourceCheck[] = [];
  for (const source of manifestSources) {
    if (!source.rawPath || !source.sha256) {
      checks.push({
        sourceId: source.id,
        expectedSha256: source.sha256 ?? null,
        actualSha256: null,
        status: 'missing-snapshot',
        rawPath: source.rawPath ?? null,
        role: source.role ?? 'unspecified',
        checkedAt,
      });
      continue;
    }
    const file = path.join(root, source.rawPath);
    if (!(await exists(file))) {
      checks.push({
        sourceId: source.id,
        expectedSha256: source.sha256,
        actualSha256: null,
        status: 'missing-snapshot',
        rawPath: source.rawPath,
        role: source.role ?? 'unspecified',
        checkedAt,
      });
      continue;
    }
    const bytes = await readFile(file);
    const actualSha256 = sha256(bytes);
    checks.push({
      sourceId: source.id,
      expectedSha256: source.sha256,
      actualSha256,
      status: sourceChangeStatus(source.sha256, actualSha256),
      rawPath: source.rawPath,
      role: source.role ?? 'unspecified',
      checkedAt,
    });
  }
  return checks;
}

function assertNoChangedSources(checks: readonly CoverageSourceCheck[]): void {
  const changed = checks.filter((check) => check.status === 'changed');
  const missingExpected = checks.filter(
    (check) => check.expectedSha256 !== null && check.actualSha256 === null,
  );
  if (changed.length > 0)
    throw new Error(
      `Full-roster source checksum mismatch: ${changed.map((check) => check.sourceId).join(', ')}.`,
    );
  if (missingExpected.length > 0)
    throw new Error(
      `Full-roster source snapshot missing: ${missingExpected.map((check) => check.sourceId).join(', ')}.`,
    );
}

async function readPreviousCoverage(): Promise<
  ReturnType<typeof validateCoverageDataset> | undefined
> {
  if (!(await exists(normalizedPath))) return undefined;
  const parsed = await readJson<unknown>(normalizedPath);
  return validateCoverageDataset(parsed, officialDataset, manifestSourceIds);
}

function toBatchOptions(
  options: CliOptions,
  command: Command,
): CoverageBatchOptions {
  const batch: CoverageBatchOptions = {
    snapshotDate,
    runId:
      [
        command,
        snapshotDate,
        options.candidateIds.join(','),
        options.districtIds.join(','),
        options.category ?? 'all',
      ].join(':') || command,
    command,
    dryRun: options.dryRun,
    retryLimit: options.retryLimit,
    concurrency: options.concurrency,
    resumedFromRunId: null,
  };
  if (options.candidateIds.length > 0)
    batch.candidateIds = new Set(options.candidateIds);
  if (options.districtIds.length > 0)
    batch.districtIds = new Set(options.districtIds);
  if (options.category !== null) batch.category = options.category;
  return batch;
}

function buildCheckpoint(
  coverage: ReturnType<typeof validateCoverageDataset>,
  options: CliOptions,
  command: Command,
): CoverageCheckpoint {
  const batch = coverage.batch;
  const checkpointRunId =
    command === batch.command
      ? batch.runId
      : toBatchOptions(options, command).runId;
  return {
    checkpointId: `checkpoint-${checkpointRunId}`,
    datasetId: coverage.datasetId,
    snapshotDate: coverage.snapshotDate,
    runId: checkpointRunId,
    command,
    candidateIds: [...batch.candidateIds],
    districtIds: [...batch.districtIds],
    category: batch.category,
    completedAuditIds: coverage.audits.map((audit) => audit.auditId),
    failedAuditIds: [],
    retryLimit: options.retryLimit,
    concurrency: options.concurrency,
    resumedFromRunId:
      command === batch.command ? batch.resumedFromRunId : batch.runId,
    dryRun: options.dryRun,
    updatedAt: checkedAt,
  };
}

async function loadOrBuildCoverage(
  options: CliOptions,
  sourceChecks: readonly CoverageSourceCheck[],
): Promise<ReturnType<typeof validateCoverageDataset>> {
  const previous = options.resume ? await readPreviousCoverage() : undefined;
  const batchOptions = toBatchOptions(options, options.command);
  if (options.resume && previous)
    batchOptions.resumedFromRunId = previous.batch.runId;
  const coverage = buildCoverageDataset(
    officialDataset,
    publicRecordsDataset,
    manifestSources,
    sourceChecks,
    batchOptions,
    previous,
  );
  return validateCoverageDataset(coverage, officialDataset, manifestSourceIds);
}

async function loadNormalizedOrDiscovery(
  options: CliOptions,
  sourceChecks: readonly CoverageSourceCheck[],
): Promise<ReturnType<typeof validateCoverageDataset>> {
  const source = (await exists(normalizedPath))
    ? normalizedPath
    : (await exists(discoveryPath))
      ? discoveryPath
      : null;
  if (source) {
    const parsed = await readJson<unknown>(source);
    const validated = validateCoverageDataset(
      parsed,
      officialDataset,
      manifestSourceIds,
    );
    if (options.command === 'ingest') {
      const batchOptions = toBatchOptions(options, 'ingest');
      if (options.resume) batchOptions.resumedFromRunId = validated.batch.runId;
      return validateCoverageDataset(
        buildCoverageDataset(
          officialDataset,
          publicRecordsDataset,
          manifestSources,
          sourceChecks,
          batchOptions,
          validated,
        ),
        officialDataset,
        manifestSourceIds,
      );
    }
    return validated;
  }
  return loadOrBuildCoverage(options, sourceChecks);
}

async function writeReview(
  coverage: ReturnType<typeof validateCoverageDataset>,
): Promise<void> {
  const review = buildReviewPacket(coverage, publicRecordsDataset);
  const parsed = FullRosterReviewPacketSchema.safeParse(review);
  if (!parsed.success)
    throw new Error(
      `Full-roster review packet validation failed: ${parsed.error.message}`,
    );
  await writeAtomic(reviewPath, `${JSON.stringify(parsed.data, null, 2)}\n`);
}

async function writeReports(
  coverage: ReturnType<typeof validateCoverageDataset>,
): Promise<void> {
  const report = buildCoverageReport(coverage, officialDataset);
  await writeAtomic(
    path.join(root, 'reports/full-roster-coverage.json'),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  await writeAtomic(
    path.join(root, 'reports/full-roster-coverage.md'),
    coverageMarkdown(report),
  );
}

async function main(): Promise<void> {
  const options = parseCoverageArgs(process.argv.slice(2));
  const sourceChecks = await buildSourceChecks();
  assertNoChangedSources(sourceChecks);
  let coverage: ReturnType<typeof validateCoverageDataset>;
  if (options.command === 'discover') {
    coverage = await loadOrBuildCoverage(options, sourceChecks);
    if (!options.dryRun) {
      await writeAtomic(
        discoveryPath,
        `${JSON.stringify(coverage, null, 2)}\n`,
      );
      await writeAtomic(
        checkpointPath,
        `${JSON.stringify(buildCheckpoint(coverage, options, 'discover'), null, 2)}\n`,
      );
    }
    console.log(
      `${options.dryRun ? 'Dry-run' : 'Discovered'} ${coverage.audits.length} candidate/category coverage slots (${coverage.candidateCount} candidates).`,
    );
    return;
  }
  if (options.command === 'ingest') {
    coverage = await loadNormalizedOrDiscovery(options, sourceChecks);
    if (!options.dryRun) {
      await writeAtomic(
        normalizedPath,
        `${JSON.stringify(coverage, null, 2)}\n`,
      );
      await writeAtomic(
        checkpointPath,
        `${JSON.stringify(buildCheckpoint(coverage, options, 'ingest'), null, 2)}\n`,
      );
    }
    console.log(
      `Ingested offline coverage audit with ${coverage.audits.length} slots.`,
    );
    return;
  }
  coverage = await loadNormalizedOrDiscovery(options, sourceChecks);
  CoverageDatasetSchema.parse(coverage);
  if (options.command === 'review-report') {
    if (!options.dryRun) await writeReview(coverage);
    console.log(
      `Generated review queue for ${coverage.audits.length} coverage slots.`,
    );
    return;
  }
  if (options.command === 'coverage') {
    if (!options.dryRun) await writeReports(coverage);
    console.log(
      `Generated full-roster coverage report for ${coverage.candidateCount} candidates.`,
    );
    return;
  }
  if (!options.dryRun) {
    await writeReports(coverage);
    await writeReview(coverage);
    await writeAtomic(
      checkpointPath,
      `${JSON.stringify(buildCheckpoint(coverage, options, 'validate'), null, 2)}\n`,
    );
  }
  console.log(
    `Validated full-roster coverage: ${coverage.candidateCount} candidates, ${coverage.audits.length} category audits, ${coverage.claimRevisions.length} claim revisions.`,
  );
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
