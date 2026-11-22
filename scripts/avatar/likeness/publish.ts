import { randomUUID } from 'node:crypto';
import { readFile, rename, rm, writeFile } from 'node:fs/promises';
import { deriveLoadable, serializeLoadable } from './derive';
import { syncPublicKits } from './sync-public-kits';

const MANIFEST_PATH = 'data/avatars/likeness/manifest.json';
const REVIEW_PATH = 'data/avatars/likeness/review.json';
const LOADABLE_PATH = 'data/avatars/likeness/loadable.json';
const PUBLIC_KIT_DIR = 'public/assets/avatars/likeness';

/** Same temp-then-rename rule as the GLBs: never expose a truncated manifest. */
async function writeAtomic(target: string, contents: string) {
  const temp = `${target}.tmp-${randomUUID()}`;
  try {
    await writeFile(temp, contents, 'utf8');
    await rename(temp, target);
  } catch (error) {
    await rm(temp, { force: true });
    throw error;
  }
}

const check = process.argv.includes('--check');

async function main() {
  const manifestBytes = await readFile(MANIFEST_PATH);
  const reviewBytes = await readFile(REVIEW_PATH);
  const { loadable, errors } = deriveLoadable(manifestBytes, reviewBytes);
  if (errors.length > 0) {
    console.error(`publish: ${errors.length} review problem(s):`);
    for (const error of errors) console.error(`  - ${error}`);
    // Fail closed: an invalidated approval must not keep its old asset served.
    const purge: string[] = [];
    await syncPublicKits([], purge, { check });
    for (const problem of purge) console.error(`  - ${problem}`);
    process.exit(1);
  }

  const serialized = serializeLoadable(loadable);
  const problems: string[] = [];

  if (check) {
    const current = await readFile(LOADABLE_PATH, 'utf8').catch(() => '');
    if (current !== serialized)
      problems.push(
        'loadable.json is stale; run npm run avatars:likeness:publish',
      );
  }

  await syncPublicKits(loadable.kits, problems, { check });

  if (problems.length > 0) {
    console.error(`publish: ${problems.length} problem(s):`);
    for (const problem of problems) console.error(`  - ${problem}`);
    console.error(
      'publish: run npm run avatars:likeness:publish to rebuild the published set',
    );
    process.exit(1);
  }

  if (check) {
    console.log(
      `publish: loadable.json and ${loadable.kits.length} published kit(s) are up to date`,
    );
    return;
  }

  // Kits are mirrored first: `syncPublicKits` has already hashed every source,
  // so the runtime only reads a kit path that loadable.json advertises once the
  // exact approved bytes are in place. Both writes are atomic.
  await writeAtomic(LOADABLE_PATH, serialized);
  console.log(
    `publish: wrote ${LOADABLE_PATH} and ${loadable.kits.length} kit(s) to ${PUBLIC_KIT_DIR}`,
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
