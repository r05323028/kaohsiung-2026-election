export type NewsCliOptions = {
  candidateIds: ReadonlySet<string> | null;
  districtIds: ReadonlySet<string> | null;
  limit: number | null;
  concurrency: number;
  retries: number;
  refresh: boolean;
  dryRun: boolean;
  verbose: boolean;
};

const USAGE =
  'Usage: tsx scripts/news/<command>.ts [--candidate ID[,ID]] [--district ID[,ID]] [--limit N] [--concurrency N] [--retries N] [--refresh] [--dry-run] [--verbose]';

export function parseNewsArgs(argv: readonly string[]): NewsCliOptions {
  const options: NewsCliOptions = {
    candidateIds: null,
    districtIds: null,
    limit: null,
    concurrency: 4,
    retries: 1,
    refresh: false,
    dryRun: false,
    verbose: false,
  };
  const candidates: string[] = [];
  const districts: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index] ?? '';
    const [flag, inline] = argument.split('=', 2);
    if (flag === '--refresh') {
      options.refresh = true;
      continue;
    }
    if (flag === '--dry-run') {
      options.dryRun = true;
      continue;
    }
    if (flag === '--verbose') {
      options.verbose = true;
      continue;
    }
    const value = inline ?? argv[index + 1];
    if (!value || value.startsWith('--')) throw new Error('Missing value for ' + flag + '.\n' + USAGE);
    if (!inline) index += 1;
    if (flag === '--candidate') candidates.push(...value.split(',').map((item) => item.trim()).filter(Boolean));
    else if (flag === '--district') districts.push(...value.split(',').map((item) => item.trim()).filter(Boolean));
    else if (flag === '--limit') options.limit = Number.parseInt(value, 10);
    else if (flag === '--concurrency') options.concurrency = Math.max(1, Number.parseInt(value, 10));
    else if (flag === '--retries') options.retries = Math.max(0, Number.parseInt(value, 10));
    else throw new Error('Unknown flag ' + flag + '.\n' + USAGE);
  }
  if (candidates.length > 0) options.candidateIds = new Set(candidates);
  if (districts.length > 0) options.districtIds = new Set(districts);
  return options;
}
