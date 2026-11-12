import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { artifactsDir } from './lib';

const url = process.argv[2];
if (!url || !/^https?:\/\//.test(url)) {
  console.error(
    'Usage: npx tsx scripts/basic-profile/fetch-source.ts <https-url>',
  );
  process.exit(2);
}
const dir = join(artifactsDir, 'fetched');
mkdirSync(dir, { recursive: true });
const safe = url
  .replace(/^https?:\/\//, '')
  .replace(/[^a-zA-Z0-9._-]+/g, '_')
  .slice(0, 120);
const file = join(dir, `${safe || 'source'}.html`);
try {
  execFileSync('curl', [
    '-fsSL',
    '--compressed',
    '--max-time',
    '45',
    '-A',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
    '-o',
    file,
    url,
  ]);
} catch (error) {
  console.log(`FETCH_FAILED ${(error as Error).message}`);
  process.exit(1);
}
const bytes = readFileSync(file);
const sha = createHash('sha256').update(bytes).digest('hex');
const raw = bytes.toString('utf8');
const title = /<title[^>]*>([^<]*)/i.exec(raw)?.[1]?.trim() ?? '';
const text = raw
  .replace(/<script[\s\S]*?<\/script>/gi, ' ')
  .replace(/<style[\s\S]*?<\/style>/gi, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/g, ' ')
  .replace(/&amp;/g, '&')
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"')
  .replace(/&#39;/g, "'")
  .replace(/\s+/g, ' ')
  .trim();
console.log(`URL: ${url}`);
console.log(`TITLE: ${title}`);
console.log(`SHA256: ${sha}`);
console.log(`SNAPSHOT: ${file}`);
console.log('TEXT:');
console.log(text.slice(0, 6000));
