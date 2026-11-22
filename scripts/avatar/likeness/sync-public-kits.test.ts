import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  utimes,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { sha256 } from './derive';
import { syncPublicKits } from './sync-public-kits';

const APPROVED = Buffer.from('approved-glb-bytes');
const NAME = 'a-2026-head.glb';

let root = '';
let kitDir = '';
let publicDir = '';

const kit = {
  path: `/assets/avatars/likeness/${NAME}`,
  sha256: sha256(APPROVED),
};

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'likeness-sync-'));
  kitDir = path.join(root, 'kits');
  publicDir = path.join(root, 'public');
  await writeFile(path.join(root, '.keep'), '');
  await mkdir(kitDir, { recursive: true });
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

async function exists(file: string) {
  const { access } = await import('node:fs/promises');
  return access(file).then(
    () => true,
    () => false,
  );
}

describe('syncPublicKits', () => {
  it('publishes a kit whose bytes match the approved sha256', async () => {
    await writeFile(path.join(kitDir, NAME), APPROVED);
    const problems: string[] = [];
    await syncPublicKits([kit], problems, { kitDir, publicDir });

    expect(problems).toEqual([]);
    expect(await readFile(path.join(publicDir, NAME))).toEqual(APPROVED);
  });

  it('refuses bytes that no longer match the approval and drops a stale copy', async () => {
    await writeFile(
      path.join(kitDir, NAME),
      Buffer.from('edited-after-review'),
    );
    await mkdir(publicDir, { recursive: true });
    await writeFile(path.join(publicDir, NAME), APPROVED);

    const problems: string[] = [];
    await syncPublicKits([kit], problems, { kitDir, publicDir });

    expect(problems).toEqual([
      `${NAME}: approved kit bytes do not match the approved sha256`,
    ]);
    expect(await exists(path.join(publicDir, NAME))).toBe(false);
  });

  it('reports a missing approved kit, never writes it, and drops an old copy', async () => {
    await mkdir(publicDir, { recursive: true });
    await writeFile(path.join(publicDir, NAME), APPROVED);

    const problems: string[] = [];
    await syncPublicKits([kit], problems, { kitDir, publicDir });

    expect(problems).toEqual([
      `${NAME}: approved kit is missing from ${kitDir}`,
    ]);
    expect(await exists(path.join(publicDir, NAME))).toBe(false);
  });

  it('removes a published kit that is not in the approved set', async () => {
    await mkdir(publicDir, { recursive: true });
    await writeFile(path.join(publicDir, 'old-2026-head.glb'), APPROVED);

    const problems: string[] = [];
    await syncPublicKits([], problems, { kitDir, publicDir });

    expect(problems).toEqual([]);
    expect(await exists(path.join(publicDir, 'old-2026-head.glb'))).toBe(false);
  });

  it('removes every unapproved entry, not only lowercase .glb files', async () => {
    await mkdir(path.join(publicDir, 'stray-dir'), { recursive: true });
    await writeFile(path.join(publicDir, 'stray-dir', 'notes.txt'), 'x');
    await writeFile(path.join(publicDir, 'UPPER.GLB'), APPROVED);
    await writeFile(path.join(publicDir, 'kit.gltf'), APPROVED);
    await writeFile(path.join(publicDir, '.DS_Store'), '');

    const problems: string[] = [];
    await syncPublicKits([], problems, { kitDir, publicDir });

    expect(problems).toEqual([]);
    expect(await readdir(publicDir)).toEqual([]);
  });

  it('checks without writing in --check mode', async () => {
    await writeFile(path.join(kitDir, NAME), APPROVED);
    const problems: string[] = [];
    await syncPublicKits([kit], problems, { kitDir, publicDir, check: true });

    expect(problems).toEqual([`${NAME}: approved kit is not published`]);
    expect(await exists(publicDir)).toBe(false);
  });

  it('reports published bytes that drifted, in --check mode', async () => {
    await writeFile(path.join(kitDir, NAME), APPROVED);
    await mkdir(publicDir, { recursive: true });
    await writeFile(path.join(publicDir, NAME), Buffer.from('drifted'));

    const problems: string[] = [];
    await syncPublicKits([kit], problems, { kitDir, publicDir, check: true });

    expect(problems).toEqual([
      `${NAME}: published bytes differ from the approved kit`,
    ]);
    expect(await readFile(path.join(publicDir, NAME))).toEqual(
      Buffer.from('drifted'),
    );
  });

  it('publishes atomically and leaves no temp file behind', async () => {
    await writeFile(path.join(kitDir, NAME), APPROVED);
    const problems: string[] = [];
    await syncPublicKits([kit], problems, { kitDir, publicDir });

    expect(problems).toEqual([]);
    expect(await readdir(publicDir)).toEqual([NAME]);
  });

  it('sweeps a stale temp file from an interrupted write', async () => {
    await mkdir(publicDir, { recursive: true });
    const leftover = `${NAME}.tmp-999`;
    await writeFile(path.join(publicDir, leftover), Buffer.from('half'));
    const old = new Date(Date.now() - 60 * 60_000);
    await utimes(path.join(publicDir, leftover), old, old);

    const problems: string[] = [];
    await syncPublicKits([], problems, { kitDir, publicDir });

    expect(problems).toEqual([]);
    expect(await exists(path.join(publicDir, leftover))).toBe(false);
  });

  it('leaves a fresh temp file alone because another publisher may own it', async () => {
    await mkdir(publicDir, { recursive: true });
    const inFlight = `${NAME}.tmp-live`;
    await writeFile(path.join(publicDir, inFlight), Buffer.from('half'));

    const problems: string[] = [];
    await syncPublicKits([], problems, { kitDir, publicDir });

    expect(problems).toEqual([]);
    expect(await exists(path.join(publicDir, inFlight))).toBe(true);
  });
});
