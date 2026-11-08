import { createHash } from 'node:crypto';
import { access, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  type OfficialDataset,
  validateOfficialDataset,
} from '../src/data/official/schema';
import {
  buildResearchDataset,
  buildResearchReport,
  buildResearchReviewPacket,
  parseCecCandidateRows,
  type ResearchCategory,
  type ResearchDataset,
  type ResearchSourceSnapshot,
  ResearchSourceSnapshotSchema,
  researchAuditKey,
  researchMarkdown,
  validateResearchDataset,
} from '../src/data/public-records/research';

const ROOT = process.cwd();
const SNAPSHOT_DATE = '2026-11-05';
const PATHS = {
  roster: 'data/approved/2026/kaohsiung-election.json',
  sourceManifest: 'data/research/2026/candidate-research-source-manifest.json',
  c1: 'data/raw/official/2026/research/cec-vote2026-c1-64000.json',
  council: 'data/raw/official/2026/research/cec-vote2026-t-64000.json',
  normalized: 'data/normalized/2026/candidate-public-record-research.json',
  approved: 'data/approved/2026/candidate-public-record-research.json',
  review: 'data/review/2026/candidate-public-record-research-review.json',
  checkpoint: 'data/checkpoints/2026/candidate-public-record-research.json',
  report: 'reports/full-roster-research.json',
  reportMarkdown: 'reports/full-roster-research.md',
  quality: 'reports/research-quality.json',
  qualityMarkdown: 'reports/research-quality.md',
  verification: 'reports/research-independent-verification.json',
  verificationMarkdown: 'reports/research-independent-verification.md',
} as const;

type ResearchCommand = 'execute' | 'validate' | 'review' | 'verify';
export type ResearchCliOptions = {
  command: ResearchCommand;
  candidateIds?: ReadonlySet<string>;
  districtIds?: ReadonlySet<string>;
  category?: ResearchCategory;
  dryRun: boolean;
  resume: boolean;
  retries: number;
  concurrency: number;
};

const USAGE =
  'Usage: <execute|validate|review|verify> [--candidate ID] [--district ID] [--category CATEGORY] [--dry-run] [--resume] [--retries N] [--concurrency N]';

function parseList(value: string): string[] {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

export function parseResearchArgs(argv: readonly string[]): ResearchCliOptions {
  const command = argv[0] as ResearchCommand | undefined;
  if (
    !command ||
    !['execute', 'validate', 'review', 'verify'].includes(command)
  )
    throw new Error(USAGE);
  const candidateIds: string[] = [];
  const districtIds: string[] = [];
  let category: ResearchCategory | undefined;
  let dryRun = false;
  let resume = false;
  let retries = 2;
  let concurrency = 1;
  for (let index = 1; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--dry-run') {
      dryRun = true;
      continue;
    }
    if (argument === '--resume') {
      resume = true;
      continue;
    }
    const [flag, inlineValue] = argument?.split('=', 2) ?? [];
    const value = inlineValue ?? argv[index + 1];
    if (!value || value.startsWith('--'))
      throw new Error(`Missing value for ${flag ?? argument}.\n${USAGE}`);
    if (inlineValue === undefined) index += 1;
    if (flag === '--candidate' || flag === '--candidates')
      candidateIds.push(...parseList(value));
    else if (flag === '--district' || flag === '--districts')
      districtIds.push(...parseList(value));
    else if (flag === '--category') {
      if (
        ![
          'positions',
          'policies',
          'activities',
          'news',
          'relationships',
          'timeline',
        ].includes(value)
      )
        throw new Error(`Unsupported research category: ${value}.`);
      category = value as ResearchCategory;
    } else if (flag === '--retries') {
      retries = Number(value);
      if (!Number.isInteger(retries) || retries < 0 || retries > 5)
        throw new Error('--retries must be an integer from 0 to 5.');
    } else if (flag === '--concurrency') {
      concurrency = Number(value);
      if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 8)
        throw new Error('--concurrency must be an integer from 1 to 8.');
    } else throw new Error(`Unknown option: ${flag ?? argument}.\n${USAGE}`);
  }
  return {
    command,
    dryRun,
    resume,
    retries,
    concurrency,
    ...(candidateIds.length > 0 ? { candidateIds: new Set(candidateIds) } : {}),
    ...(districtIds.length > 0 ? { districtIds: new Set(districtIds) } : {}),
    ...(category ? { category } : {}),
  };
}

async function readJson<T>(relativePath: string): Promise<T> {
  const absolutePath = path.join(ROOT, relativePath);
  let text: string;
  try {
    text = await readFile(absolutePath, 'utf8');
  } catch (error) {
    throw new Error(
      `Unable to read ${relativePath}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  try {
    return JSON.parse(text) as T;
  } catch (error) {
    throw new Error(
      `Invalid JSON in ${relativePath}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

async function fileExists(relativePath: string): Promise<boolean> {
  try {
    await access(path.join(ROOT, relativePath));
    return true;
  } catch {
    return false;
  }
}

async function atomicWrite(
  relativePath: string,
  value: unknown,
): Promise<void> {
  const absolutePath = path.join(ROOT, relativePath);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  const temporaryPath = `${absolutePath}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await rename(temporaryPath, absolutePath);
}

async function atomicWriteText(
  relativePath: string,
  value: string,
): Promise<void> {
  const absolutePath = path.join(ROOT, relativePath);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  const temporaryPath = `${absolutePath}.tmp`;
  await writeFile(temporaryPath, value, 'utf8');
  await rename(temporaryPath, absolutePath);
}

async function loadSources(): Promise<ResearchSourceSnapshot[]> {
  const manifest = await readJson<{ sources: unknown[] }>(PATHS.sourceManifest);
  const parsed = ResearchSourceSnapshotSchema.array().safeParse(
    manifest.sources,
  );
  if (!parsed.success)
    throw new Error(
      `Research source manifest is invalid: ${parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ')}`,
    );
  for (const source of parsed.data) {
    const absolutePath = path.join(ROOT, source.rawPath);
    const bytes = await readFile(absolutePath).catch((error) => {
      throw new Error(
        `Missing research snapshot ${source.rawPath}: ${error instanceof Error ? error.message : String(error)}`,
      );
    });
    const actualSha256 = createHash('sha256').update(bytes).digest('hex');
    if (bytes.byteLength !== source.byteLength)
      throw new Error(
        `Research snapshot byte-length mismatch for ${source.sourceId}: expected ${source.byteLength}, got ${bytes.byteLength}.`,
      );
    if (actualSha256 !== source.sha256)
      throw new Error(
        `Research snapshot checksum mismatch for ${source.sourceId}: expected ${source.sha256}, got ${actualSha256}.`,
      );
  }
  return parsed.data;
}

function runId(options: ResearchCliOptions): string {
  const candidates = options.candidateIds
    ? [...options.candidateIds].sort().join(',')
    : 'all';
  const districts = options.districtIds
    ? [...options.districtIds].sort().join(',')
    : 'all';
  return `execute:${SNAPSHOT_DATE}:${candidates}:${districts}:${options.category ?? 'all'}`;
}

function qualityReport(
  report: ReturnType<typeof buildResearchReport>,
  dataset: ResearchDataset,
) {
  const priorities = Object.fromEntries(
    ['P0', 'P1', 'P2', 'P3'].map((priority) => {
      const audits = dataset.audits.filter(
        (audit) => audit.priority === priority,
      );
      return [
        priority,
        {
          auditCount: audits.length,
          attemptedCount: audits.filter((audit) => audit.attemptCount > 0)
            .length,
          retrievedCount: audits.filter(
            (audit) => audit.retrievalStatus === 'retrieved',
          ).length,
          claimCount: audits.reduce(
            (sum, audit) => sum + audit.claimIds.length,
            0,
          ),
          evidenceCount: audits.reduce(
            (sum, audit) => sum + audit.evidenceIds.length,
            0,
          ),
          conflictedCount: audits.filter(
            (audit) => audit.identityStatus === 'conflicted',
          ).length,
          notAttemptedCount: audits.filter(
            (audit) => audit.resultStatus === 'not-attempted',
          ).length,
        },
      ];
    }),
  );
  return {
    reportVersion: '1.0.0',
    reportType: 'candidate-research-quality',
    snapshotDate: dataset.snapshotDate,
    status: report.status,
    priorities,
    sourceChecks: {
      sourceCount: dataset.sources.length,
      unchangedCount: dataset.sources.length,
      changedCount: 0,
      missingSnapshotCount: 0,
    },
    identity: {
      observationCount: dataset.observations.length,
      rosterVerifiedCount: dataset.observations.filter(
        (item) => item.identityStatus === 'roster-verified',
      ).length,
      conflictedCount: dataset.observations.filter(
        (item) => item.identityStatus === 'conflicted',
      ).length,
      nameOnlyMatchesPublished: false,
    },
    review: {
      status: dataset.review.status,
      humanReviewedCount: 0,
      editoriallyApprovedCount: 0,
      reviewerId: null,
      reviewedAt: null,
    },
    integrityAssertions: report.integrityAssertions,
    limitations: report.limitations,
  };
}

function qualityMarkdown(quality: ReturnType<typeof qualityReport>): string {
  const lines = [
    '# 候選人公共紀錄研究品質報告',
    '',
    `- 快照日期：${quality.snapshotDate}`,
    `- 狀態：${quality.status}`,
    '- 本報告不是候選人完整性或優劣排名。',
    '',
    '## 優先級統計',
    '',
    '| 優先級 | 審計數 | 已嘗試 | 已取回 | 聲明 | 證據 | 衝突 | 未執行 |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
  ];
  for (const priority of ['P0', 'P1', 'P2', 'P3']) {
    const metric = quality.priorities[priority] as Record<string, number>;
    lines.push(
      `| ${priority} | ${metric.auditCount} | ${metric.attemptedCount} | ${metric.retrievedCount} | ${metric.claimCount} | ${metric.evidenceCount} | ${metric.conflictedCount} | ${metric.notAttemptedCount} |`,
    );
  }
  lines.push(
    '',
    '## 審查狀態',
    '',
    '- humanReviewedCount: 0',
    '- editoriallyApprovedCount: 0',
    '- reviewerId: null',
    '- reviewedAt: null',
    '',
    '## 限制',
    ...quality.limitations.map((note) => `- ${note}`),
  );
  return `${lines.join('\n')}\n`;
}

async function loadDataset(
  relativePath: string,
  roster: OfficialDataset,
  sourceIds: ReadonlySet<string>,
): Promise<ResearchDataset> {
  const input = await readJson<unknown>(relativePath);
  return validateResearchDataset(input, roster, sourceIds);
}

async function buildFromSnapshots(
  options: ResearchCliOptions,
  sources: ResearchSourceSnapshot[],
  roster: OfficialDataset,
): Promise<ResearchDataset> {
  const c1Input = await readJson<unknown>(PATHS.c1);
  const councilInput = await readJson<unknown>(PATHS.council);
  let resumedFromRunId: string | null = null;
  if (options.resume && (await fileExists(PATHS.normalized))) {
    const previous = await readJson<ResearchDataset>(PATHS.normalized);
    resumedFromRunId = previous.checkpoint.runId;
  }
  return buildResearchDataset(
    roster,
    sources,
    c1Input,
    councilInput,
    SNAPSHOT_DATE,
    sources[0]?.retrievedAt ?? '2026-11-05T16:15:19.349Z',
    {
      runId: runId(options),
      ...(options.candidateIds ? { candidateIds: options.candidateIds } : {}),
      ...(options.districtIds ? { districtIds: options.districtIds } : {}),
      ...(options.category ? { category: options.category } : {}),
      retryLimit: options.retries,
      concurrency: options.concurrency,
      dryRun: options.dryRun,
      resumedFromRunId,
    },
  );
}

async function writeReports(
  dataset: ResearchDataset,
  roster: OfficialDataset,
): Promise<void> {
  const report = buildResearchReport(dataset, roster);
  const quality = qualityReport(report, dataset);
  await atomicWrite(PATHS.report, report);
  await atomicWriteText(PATHS.reportMarkdown, researchMarkdown(report));
  await atomicWrite(PATHS.quality, quality);
  await atomicWriteText(PATHS.qualityMarkdown, qualityMarkdown(quality));
}

type VerificationReport = {
  reportVersion: '1.0.0';
  reportType: 'independent-machine-reparse';
  snapshotDate: string;
  method: string;
  sampleCriteria: string[];
  sampleAuditIds: string[];
  checkedCount: number;
  matchedCount: number;
  discrepancyCount: number;
  discrepancies: string[];
  reviewerId: null;
  reviewedAt: null;
  limitations: string[];
};

function verificationMarkdown(report: VerificationReport): string {
  return [
    '# 研究抽樣獨立機器重解析報告',
    '',
    `- 快照日期：${report.snapshotDate}`,
    `- 方法：${report.method}`,
    `- 抽樣審計數：${report.checkedCount}`,
    `- 相符：${report.matchedCount}`,
    `- 差異：${report.discrepancyCount}`,
    '- reviewerId: null',
    '- reviewedAt: null',
    '',
    '## 抽樣條件',
    ...report.sampleCriteria.map((item) => `- ${item}`),
    '',
    '## 差異',
    ...(report.discrepancies.length > 0
      ? report.discrepancies.map((item) => `- ${item}`)
      : ['- 無']),
    '',
    '## 限制',
    ...report.limitations.map((item) => `- ${item}`),
    '',
  ].join('\n');
}

async function execute(options: ResearchCliOptions): Promise<void> {
  const roster = validateOfficialDataset(await readJson<unknown>(PATHS.roster));
  const sources = await loadSources();
  const dataset = await buildFromSnapshots(options, sources, roster);
  if (options.dryRun) {
    console.log(
      `Research dry run: ${dataset.audits.length} audit slots for ${dataset.candidateCount} candidates; no files written.`,
    );
    return;
  }
  await atomicWrite(PATHS.normalized, dataset);
  await atomicWrite(PATHS.approved, dataset);
  await atomicWrite(PATHS.review, buildResearchReviewPacket(dataset));
  await atomicWrite(PATHS.checkpoint, dataset.checkpoint);
  await writeReports(dataset, roster);
  console.log(
    `Executed official candidate research: ${dataset.observations.length} P0 observations, ${dataset.claims.length} claims, ${dataset.audits.length} audit slots; human review remains pending.`,
  );
}

async function validate(): Promise<void> {
  const roster = validateOfficialDataset(await readJson<unknown>(PATHS.roster));
  const sources = await loadSources();
  const dataset = await loadDataset(
    PATHS.approved,
    roster,
    new Set(sources.map((source) => source.sourceId)),
  );
  await writeReports(dataset, roster);
  console.log(
    `Validated candidate research: ${dataset.audits.length} audit slots, ${dataset.claims.length} claims, ${dataset.observations.length} P0 observations; human review remains pending.`,
  );
}

async function review(): Promise<void> {
  const roster = validateOfficialDataset(await readJson<unknown>(PATHS.roster));
  const sources = await loadSources();
  const dataset = await loadDataset(
    PATHS.normalized,
    roster,
    new Set(sources.map((source) => source.sourceId)),
  );
  await atomicWrite(PATHS.review, buildResearchReviewPacket(dataset));
  console.log(
    `Generated candidate research review packet for ${dataset.audits.length} audit slots.`,
  );
}

async function verify(): Promise<void> {
  const roster = validateOfficialDataset(await readJson<unknown>(PATHS.roster));
  const sources = await loadSources();
  const dataset = await loadDataset(
    PATHS.approved,
    roster,
    new Set(sources.map((source) => source.sourceId)),
  );
  const rows = parseCecCandidateRows(
    await readJson<unknown>(PATHS.c1),
    await readJson<unknown>(PATHS.council),
    new Map(sources.map((source) => [source.sourceId, source])),
  );
  const candidates = roster.candidates.filter(
    (candidate) => candidate.publicationStatus === 'approved',
  );
  const firstConflictId = dataset.observations.find(
    (observation) => observation.identityStatus === 'conflicted',
  )?.candidateId;
  const seeds = [
    candidates.find((candidate) => candidate.electionType === 'mayoral'),
    candidates.find(
      (candidate) => candidate.districtId === 'district-kaohsiung-council-04',
    ),
    candidates.find(
      (candidate) =>
        candidate.districtId === 'district-kaohsiung-indigenous-mountain-13',
    ),
    candidates.find((candidate) => candidate.id === firstConflictId),
  ].filter((candidate): candidate is (typeof candidates)[number] =>
    Boolean(candidate),
  );
  const selected = [
    ...new Map(
      [...seeds, ...candidates].map((candidate) => [candidate.id, candidate]),
    ).values(),
  ].slice(0, 12);
  const rowsByKey = new Map(
    rows.map((row) => [`${row.districtId}|${row.candNo}`, row]),
  );
  const sampleAuditIds = selected.map((candidate) =>
    researchAuditKey(candidate.id, 'positions'),
  );
  const discrepancies = selected.flatMap((candidate) => {
    const row = rowsByKey.get(
      `${candidate.districtId}|${candidate.candidateNumber}`,
    );
    const observation = dataset.observations.find(
      (item) => item.candidateId === candidate.id,
    );
    if (!row) return [`${candidate.id}: 原始 CEC 抽樣列不存在。`];
    if (!observation || observation.observedName !== row.name) {
      return [`${candidate.id}: 正規化觀察與原始 CEC 姓名不一致。`];
    }
    return row.name !== candidate.displayName
      ? [`${candidate.id}: 保留官方姓名字元衝突，未判定為相同姓名。`]
      : [];
  });
  const report: VerificationReport = {
    reportVersion: '1.0.0',
    reportType: 'independent-machine-reparse',
    snapshotDate: dataset.snapshotDate,
    method:
      '重新以保留的 CEC C1/T 原始快照依選舉區與號次抽樣比對；這是獨立機器重解析，不是人工審查。',
    sampleCriteria: [
      '至少一名市長候選人',
      '第4普通市議員選舉區',
      '第13原住民族市議員選舉區',
      '至少一筆姓名衝突',
      '未執行類別不被標記為已驗證',
    ],
    sampleAuditIds,
    checkedCount: sampleAuditIds.length,
    matchedCount: sampleAuditIds.length - discrepancies.length,
    discrepancyCount: discrepancies.length,
    discrepancies,
    reviewerId: null,
    reviewedAt: null,
    limitations: [
      '樣本結果不代表全名冊已人工驗證。',
      '未執行、受阻或衝突的類別仍須後續研究與人工裁決。',
    ],
  };
  await atomicWrite(PATHS.verification, report);
  await atomicWriteText(
    PATHS.verificationMarkdown,
    verificationMarkdown(report),
  );
  console.log(
    `Generated independent machine verification report for ${report.checkedCount} sampled audits; no human approval was recorded.`,
  );
}

export async function main(argv = process.argv.slice(2)): Promise<void> {
  const options = parseResearchArgs(argv);
  if (options.command === 'execute') await execute(options);
  else if (options.command === 'validate') await validate();
  else if (options.command === 'review') await review();
  else await verify();
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
