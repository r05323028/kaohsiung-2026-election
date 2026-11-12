import {
  type DiscoveryFile,
  NEWS_PATHS,
  type RosterCandidate,
  discoveryPath,
  fetchDocument,
  loadRoster,
  pool,
  readJsonFile,
  sleep,
  writeJsonFile,
} from '../../src/data/news/pipeline';
import {
  NEWS_SOURCES,
  type NewsSourceKey,
  parseSearchResults,
} from '../../src/data/news/research';
import { normalizeUrl } from '../../src/data/news/schema';
import { parseNewsArgs } from './args';

const SOURCE_IDS: readonly NewsSourceKey[] = ['ltn', 'ettoday', 'cna'];
const MAX_HITS_PER_CANDIDATE = 18;

function queriesFor(candidate: RosterCandidate): string[] {
  const queries = [candidate.name];
  if (candidate.name.length <= 2) queries.push(candidate.name + ' 高雄');
  if (candidate.electionType === 'mayoral') queries.push(candidate.name + ' 高雄市長');
  return [...new Set(queries)];
}

function selectTargets(
  roster: readonly RosterCandidate[],
  candidateIds: ReadonlySet<string> | null,
  districtIds: ReadonlySet<string> | null,
): RosterCandidate[] {
  return roster.filter(
    (candidate) =>
      (!candidateIds || candidateIds.has(candidate.id) || candidateIds.has(candidate.slug)) &&
      (!districtIds || districtIds.has(candidate.districtId)),
  );
}

async function main(): Promise<void> {
  const options = parseNewsArgs(process.argv.slice(2));
  const roster = await loadRoster();
  const targets = selectTargets(roster, options.candidateIds, options.districtIds);
  if (targets.length === 0) throw new Error('No candidates matched the filter.');

  let skipped = 0;
  let researched = 0;
  let withResults = 0;
  let failures = 0;

  await pool(targets, options.concurrency, async (candidate) => {
    const existing = await readJsonFile<DiscoveryFile>(discoveryPath(candidate.id));
    if (existing && !options.refresh && existing.attempts.length >= SOURCE_IDS.length) {
      skipped += 1;
      return;
    }
    const attempts: DiscoveryFile['attempts'] = [];
    const hits = new Map<string, DiscoveryFile['hits'][number]>();
    for (const sourceId of SOURCE_IDS) {
      for (const query of queriesFor(candidate)) {
        const url = NEWS_SOURCES[sourceId].searchUrl(query);
        const response = await fetchDocument(url, { retries: options.retries });
        const parsed =
          response.status === 200 && response.text
            ? parseSearchResults(sourceId, response.text)
            : [];
        const relevant = parsed.filter(
          (hit) =>
            hit.headline.includes(candidate.name) ||
            hit.snippet.includes(candidate.name),
        );
        const attempt: DiscoveryFile['attempts'][number] = {
          sourceId,
          query,
          fetchedAt: response.fetchedAt,
          httpStatus: response.status,
          documentSha256: response.sha256,
          status:
            response.status !== 200 || !response.text
              ? 'source-error'
              : relevant.length > 0
                ? 'results'
                : 'no-results',
          resultCount: relevant.length,
          error: response.error,
        };
        attempts.push(attempt);
        for (const hit of relevant) {
          const key = normalizeUrl(hit.url);
          if (hits.has(key) || hits.size >= MAX_HITS_PER_CANDIDATE) continue;
          hits.set(key, {
            sourceId,
            url: hit.url,
            headline: hit.headline.slice(0, 300),
            publicationDate: hit.publicationDate,
            query,
          });
        }
        await sleep(350);
      }
    }

    if (attempts.every((attempt) => attempt.status === 'source-error')) failures += 1;
    researched += 1;
    if (hits.size > 0) withResults += 1;

    const file: DiscoveryFile = {
      candidateId: candidate.id,
      candidateName: candidate.name,
      researchedAt: new Date().toISOString(),
      attempts,
      hits: [...hits.values()],
    };
    if (options.dryRun) {
      console.log('[dry-run]', candidate.name, 'attempts=' + attempts.length, 'hits=' + hits.size);
      return;
    }
    await writeJsonFile(discoveryPath(candidate.id), file);
    if (options.verbose) {
      console.log(candidate.name, 'attempts=' + attempts.length, 'hits=' + hits.size);
    }
  });

  console.log(
    JSON.stringify(
      {
        dataset: NEWS_PATHS.rawDiscovery,
        targets: targets.length,
        researched,
        skippedExisting: skipped,
        candidatesWithHits: withResults,
        candidatesWithSourceErrors: failures,
      },
      null,
      2,
    ),
  );
}

await main();
