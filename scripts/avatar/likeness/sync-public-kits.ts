import { randomUUID } from 'node:crypto';
import {
  mkdir,
  readdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import { sha256 } from './derive';

/** Generated kits live outside the published tree until a human approves them. */
export const DEFAULT_KIT_DIR = 'data/avatars/likeness/kits';
export const PUBLIC_KIT_DIR = 'public/assets/avatars/likeness';

/** Temp files from an interrupted atomic write share this marker. */
const TEMP_INFIX = '.glb.tmp-';
/** A temp younger than this may belong to a concurrently running publisher. */
const STALE_TEMP_MS = 5 * 60_000;

/** The approved subset of a loadable entry that publication actually needs. */
export type ApprovedKit = { path: string; sha256: string };

/**
 * Writes through an exclusive sibling temp file and renames, so an interrupted
 * build can never leave a half-written GLB in the served directory. A partial
 * file would otherwise be cached by a browser and served in place of the
 * approved bytes. The temp name carries a random nonce because a bare PID can
 * be reused (and collides for two calls in one process).
 */
async function writeAtomic(target: string, bytes: Buffer) {
  const temp = `${target}${TEMP_INFIX}${randomUUID()}`;
  try {
    await writeFile(temp, bytes, { flag: 'wx' });
    await rename(temp, target);
  } catch (error) {
    await rm(temp, { force: true });
    throw error;
  }
}

type PublicListing = { entries: string[]; missing: boolean };

async function listPublic(publicDir: string): Promise<PublicListing> {
  try {
    return { entries: await readdir(publicDir), missing: false };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return { entries: [], missing: true };
    }
    throw error;
  }
}

/** A fresh temp file may be another publisher's in-flight write. */
async function isLiveTemp(publicDir: string, name: string) {
  if (!name.includes(TEMP_INFIX)) return false;
  try {
    const info = await stat(path.join(publicDir, name));
    return Date.now() - info.mtimeMs < STALE_TEMP_MS;
  } catch {
    return false;
  }
}

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
 *
 * Fail-closed rules:
 * - every source is read and hashed before the published set is touched, so a
 *   bad source cannot leave a half-updated directory;
 * - a missing or mismatched source also drops any previously published copy;
 * - a failed replacement drops the target rather than leaving old bytes behind;
 * - every entry that is not an approved kit is removed, whatever its name.
 */
export async function syncPublicKits(
  kits: ApprovedKit[],
  problems: string[],
  options: SyncOptions = {},
) {
  const kitDir = options.kitDir ?? DEFAULT_KIT_DIR;
  const publicDir = options.publicDir ?? PUBLIC_KIT_DIR;
  const check = options.check ?? false;

  const wanted = new Map(
    kits.map((kit) => {
      const name = path.basename(kit.path);
      return [
        name,
        { source: path.join(kitDir, name), sha256: kit.sha256 },
      ] as const;
    }),
  );

  // Phase 1 — verify every approved source before touching the published set.
  const ready = new Map<string, Buffer>();
  for (const [name, kit] of wanted) {
    const bytes = await readFile(kit.source).catch(() => null);
    if (!bytes) {
      problems.push(`${name}: approved kit is missing from ${kitDir}`);
      continue;
    }
    if (sha256(bytes) !== kit.sha256) {
      // Fail closed: never ship bytes that no human approved.
      problems.push(
        `${name}: approved kit bytes do not match the approved sha256`,
      );
      continue;
    }
    ready.set(name, bytes);
  }

  const { entries, missing } = await listPublic(publicDir);
  const unapproved = entries.filter((name) => !ready.has(name));

  if (check) {
    if (!missing) {
      for (const [name, bytes] of ready) {
        const published = await readFile(path.join(publicDir, name)).catch(
          () => null,
        );
        if (!published) problems.push(`${name}: approved kit is not published`);
        else if (!published.equals(bytes)) {
          problems.push(
            `${name}: published bytes differ from the approved kit`,
          );
        }
      }
      for (const name of unapproved) {
        problems.push(`${name}: unapproved file present in ${publicDir}`);
      }
    } else if (ready.size > 0) {
      for (const name of ready.keys()) {
        problems.push(`${name}: approved kit is not published`);
      }
    }
    return;
  }

  await mkdir(publicDir, { recursive: true });

  for (const [name, bytes] of ready) {
    const target = path.join(publicDir, name);
    try {
      await writeAtomic(target, bytes);
    } catch (error) {
      // Never keep bytes that no longer match the approval.
      await rm(target, { force: true });
      problems.push(
        `${name}: could not publish (${error instanceof Error ? error.message : String(error)})`,
      );
    }
  }

  // Fail-closed cleanup, including published copies of kits whose source went
  // missing and any stray asset that is not part of the approved set.
  for (const name of unapproved) {
    if (await isLiveTemp(publicDir, name)) continue;
    await rm(path.join(publicDir, name), { recursive: true, force: true });
  }
}
