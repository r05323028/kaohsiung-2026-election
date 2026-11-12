import { queueCandidates } from './lib';

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error(
    'Usage: npx tsx scripts/basic-profile/wiki-lookup.ts <name...> | --batch <batch-XX>',
  );
  process.exit(2);
}
const names =
  args[0] === '--batch'
    ? queueCandidates
        .filter((candidate) => candidate.batchId === args[1])
        .map((candidate) => candidate.displayName)
    : args;

const endpoint = 'https://zh.wikipedia.org/w/api.php';
for (const name of names) {
  const params = new URLSearchParams({
    action: 'query',
    prop: 'extracts|extlinks',
    explaintext: '1',
    exlimit: '25',
    ellimit: '25',
    redirects: '1',
    titles: name,
    format: 'json',
    formatversion: '2',
  });
  try {
    const response = await fetch(`${endpoint}?${params}`, {
      headers: { 'User-Agent': 'kaohsiung-2026-election-research/1.0' },
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) {
      console.log(`## ${name}\nHTTP ${response.status}`);
      continue;
    }
    const data = (await response.json()) as {
      query?: {
        pages?: Array<{
          title: string;
          missing?: boolean;
          extract?: string;
          extlinks?: Array<{ '*': string }>;
        }>;
      };
    };
    const page = data.query?.pages?.[0];
    console.log(`\n## ${name}`);
    if (!page || page.missing) {
      console.log('NO_ARTICLE');
      continue;
    }
    console.log(`TITLE: ${page.title}`);
    console.log(
      `URL: https://zh.wikipedia.org/wiki/${encodeURIComponent(page.title.replace(/ /g, '_'))}`,
    );
    console.log('EXTRACT:');
    console.log((page.extract ?? '').slice(0, 2200));
    const links = (page.extlinks ?? [])
      .map((link) => link['*'])
      .filter(Boolean);
    console.log('EXTLINKS:');
    for (const link of links.slice(0, 25)) console.log(`- ${link}`);
  } catch (error) {
    console.log(`## ${name}\nERROR ${(error as Error).message}`);
  }
}
