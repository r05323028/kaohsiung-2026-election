import { queueCandidates } from './lib';

const endpoint = 'https://zh.wikipedia.org/w/api.php';
const batches: string[][] = [];
for (let index = 0; index < queueCandidates.length; index += 20) {
  batches.push(
    queueCandidates
      .slice(index, index + 20)
      .map((candidate) => candidate.displayName),
  );
}
for (const names of batches) {
  const params = new URLSearchParams({
    action: 'query',
    prop: 'extracts',
    explaintext: '1',
    exlimit: '20',
    redirects: '1',
    titles: names.join('|'),
    format: 'json',
    formatversion: '2',
  });
  try {
    const response = await fetch(`${endpoint}?${params}`, {
      headers: { 'User-Agent': 'kaohsiung-2026-election-research/1.0' },
      signal: AbortSignal.timeout(25000),
    });
    const data = (await response.json()) as {
      query?: {
        pages?: Array<{ title: string; missing?: boolean; extract?: string }>;
        redirects?: Array<{ from: string; to: string }>;
      };
    };
    const pages = data.query?.pages ?? [];
    for (const name of names) {
      const page = pages.find((entry) => entry.title === name);
      if (page && !page.missing) {
        const extract = (page.extract ?? '').replace(/\s+/g, ' ').slice(0, 90);
        console.log(`${name}\tARTICLE\t${extract}`);
      } else {
        console.log(`${name}\tNONE`);
      }
    }
  } catch (error) {
    console.log(`BATCH_ERROR\t${(error as Error).message}`);
  }
}
