import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { sha256 } from './derive';

/** Generated kits live outside the published tree until a human approves them. */
export const DEFAULT_KIT_DIR = 'data/avatars/likeness/kits';
export const PUBLIC_KIT_DIR = 'public/assets/avatars/likeness';

/** The approved subset of a loadable entry that publication actually needs. */
export type ApprovedKit = { path: string; sha256: string };

export type SyncOptions = {
  kitDir?: string;
  publicDir?: string;
  /** Report problems instead of writing, for `--check`. */
  check?: boolean;
};

/**
 * Mirrors approved kits into the served directory and removes everything else,
 * so unapproved likenesses never ship in the static build. The bytes are hashed
 * before copying: an approval covers one exact GLB, so a regenerated or edited
 * file must not reach `public/` on the strength of an older decision.
 */
export async function syncPublicKits(
  kits: ApprovedKit[],
  problems: string[],
  options: SyncOptions = {},
) {
  const kitDir = options.kitDir ?? DEFAULT_KIT_DIR;
  const publicDir = options.publicDir ?? PUBLIC_KIT_DIR;
  const check = options.check ?? false;

  await mkdir(publicDir, { recursive: true });
  const wanted = new Map(
    kits.map((kit) => {
      const name = path.basename(kit.path);
      return [
        name,
        { source: path.join(kitDir, name), sha256: kit.sha256 },
      ] as const;
    }),
  );
  const present = (await readdir(publicDir)).filter((name) =>
    name.endsWith('.glb'),
  );

  for (const [name, kit] of wanted) {
    const bytes = await readFile(kit.source).catch(() => null);
    const target = path.join(publicDir, name);
    if (!bytes) {
      problems.push(`${name}: approved kit is missing from ${kitDir}`);
      continue;
    }
    if (sha256(bytes) !== kit.sha256) {
      // Fail closed: never ship bytes that no human approved.
      problems.push(
        `${name}: approved kit bytes do not match the approved sha256`,
      );
      if (!check) await rm(target, { force: true });
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
    if (check) problems.push(`${name}: unapproved kit present in ${publicDir}`);
    else await rm(path.join(publicDir, name));
  }
}
