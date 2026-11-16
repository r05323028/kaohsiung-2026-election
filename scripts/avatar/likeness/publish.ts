import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { deriveLoadable, serializeLoadable } from './derive';

const MANIFEST_PATH = 'data/avatars/likeness/manifest.json';
const REVIEW_PATH = 'data/avatars/likeness/review.json';
const LOADABLE_PATH = 'data/avatars/likeness/loadable.json';
/** Generated kits live outside the published tree until a human approves them. */
const KIT_DIR = 'data/avatars/likeness/kits';
const PUBLIC_KIT_DIR = 'public/assets/avatars/likeness';

const check = process.argv.includes('--check');

/**
 * Mirrors approved kits into the served directory and removes everything else,
 * so unapproved likenesses never ship in the static build.
 */
async function syncPublicKits(kits: { path: string }[], problems: string[]) {
  await mkdir(PUBLIC_KIT_DIR, { recursive: true });
  const wanted = new Map(
    kits.map(
      (kit) =>
        [
          path.basename(kit.path),
          path.join(KIT_DIR, path.basename(kit.path)),
        ] as const,
    ),
  );
  const present = (await readdir(PUBLIC_KIT_DIR)).filter((name) =>
    name.endsWith('.glb'),
  );

  for (const [name, source] of wanted) {
    const bytes = await readFile(source).catch(() => null);
    const target = path.join(PUBLIC_KIT_DIR, name);
    if (!bytes) {
      problems.push(`${name}: approved kit is missing from ${KIT_DIR}`);
      continue;
    }
    if (check) {
      const published = await readFile(target).catch(() => null);
      if (!published) problems.push(`${name}: approved kit is not published`);
      else if (!published.equals(bytes))
        problems.push(`${name}: published bytes differ from the approved kit`);
    } else {
      await writeFile(target, bytes);
    }
  }

  for (const name of present) {
    if (wanted.has(name)) continue;
    if (check)
      problems.push(`${name}: unapproved kit present in ${PUBLIC_KIT_DIR}`);
    else await rm(path.join(PUBLIC_KIT_DIR, name));
  }
}

async function main() {
  const manifestBytes = await readFile(MANIFEST_PATH);
  const reviewBytes = await readFile(REVIEW_PATH);
  const { loadable, errors } = deriveLoadable(manifestBytes, reviewBytes);
  if (errors.length > 0) {
    console.error(`publish: ${errors.length} review problem(s):`);
    for (const error of errors) console.error(`  - ${error}`);
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

  await syncPublicKits(loadable.kits, problems);

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

  await writeFile(LOADABLE_PATH, serialized, 'utf8');
  console.log(
    `publish: wrote ${LOADABLE_PATH} and ${loadable.kits.length} kit(s) to ${PUBLIC_KIT_DIR}`,
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
