import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { sha256 } from '../avatar/likeness/derive';
import {
  buildLikenessPreviewIndex,
  createLikenessPreviewMiddleware,
} from './likeness-preview';

const SLUG = 'lai-rui-long-2026';
const KIT_BYTES = Buffer.from('generated-kit-bytes');
const KIT_SHA = sha256(KIT_BYTES);
const KIT_FILE = `${SLUG}-head.glb`;

let root = '';

type ManifestEntry = {
  slug: string;
  candidateId: string;
  displayName: string;
  state: string;
  headKit?:
    | { sha256: string; fileSizeBytes: number; triangleCount: number }
    | undefined;
};

async function writeFixtures(entries: ManifestEntry[], approved: string[]) {
  await mkdir(path.join(root, 'data/avatars/likeness/kits'), {
    recursive: true,
  });
  await writeFile(
    path.join(root, 'data/avatars/likeness/manifest.json'),
    JSON.stringify({ candidates: entries }),
  );
  await writeFile(
    path.join(root, 'data/avatars/likeness/loadable.json'),
    JSON.stringify({ kits: approved.map((slug) => ({ slug })) }),
  );
}

const generated = (overrides: Partial<ManifestEntry> = {}): ManifestEntry => ({
  slug: SLUG,
  candidateId: `official-mayor-${SLUG}`,
  displayName: '賴瑞隆',
  state: 'generated',
  headKit: {
    sha256: KIT_SHA,
    fileSizeBytes: KIT_BYTES.byteLength,
    triangleCount: 7890,
  },
  ...overrides,
});

const kitPath = () => path.join(root, 'data/avatars/likeness/kits', KIT_FILE);

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'likeness-preview-dev-'));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('buildLikenessPreviewIndex', () => {
  it('lists a generated kit that no human approved', async () => {
    await writeFixtures([generated()], []);
    await writeFile(kitPath(), KIT_BYTES);

    const index = await buildLikenessPreviewIndex(root);

    expect(index.approval).toBe('unapproved');
    expect(index.origin).toBe('development-only');
    expect(index.kits).toEqual([
      {
        slug: SLUG,
        candidateId: `official-mayor-${SLUG}`,
        displayName: '賴瑞隆',
        path: `/__dev/likeness/${KIT_FILE}`,
        sha256: KIT_SHA,
        fileSizeBytes: KIT_BYTES.byteLength,
        triangleCount: 7890,
      },
    ]);
  });

  it('never exposes an approved kit or one still awaiting generation', async () => {
    await writeFixtures(
      [
        generated(),
        generated({
          slug: 'other-2026',
          state: 'extracted',
          headKit: undefined,
        }),
      ],
      [SLUG],
    );
    await writeFile(kitPath(), KIT_BYTES);

    const index = await buildLikenessPreviewIndex(root);

    expect(index.kits).toEqual([]);
  });

  it('hides a larger file that no longer matches the manifest', async () => {
    await writeFixtures([generated()], []);
    await writeFile(
      kitPath(),
      Buffer.from('regenerated-and-longer-than-the-manifest-entry'),
    );

    const index = await buildLikenessPreviewIndex(root);

    expect(index.kits).toEqual([]);
  });

  it('hides same-length bytes whose digest differs from the manifest', async () => {
    await writeFixtures([generated()], []);
    const altered = Buffer.from(KIT_BYTES);
    altered[0] = (altered[0] ?? 0) ^ 0xff;
    expect(altered.byteLength).toBe(KIT_BYTES.byteLength);
    await writeFile(kitPath(), altered);

    const index = await buildLikenessPreviewIndex(root);

    expect(index.kits).toEqual([]);
  });

  it('ignores a manifest slug that would escape the kit directory', async () => {
    await writeFixtures([generated({ slug: '../manifest' })], []);

    const index = await buildLikenessPreviewIndex(root);

    expect(index.kits).toEqual([]);
  });

  it('ignores a kit file that is a symlink outside the kit directory', async () => {
    await writeFixtures([generated()], []);
    const outside = path.join(root, 'outside.glb');
    await writeFile(outside, KIT_BYTES);
    await symlink(outside, kitPath());

    const index = await buildLikenessPreviewIndex(root);

    expect(index.kits).toEqual([]);
  });
});

type Captured = {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
  ended: boolean;
};

function fakeResponse(): { res: Captured; end: (chunk?: unknown) => void } {
  const res: Captured = {
    statusCode: 200,
    headers: {},
    body: '',
    ended: false,
  };
  return {
    res,
    end: (chunk?: unknown) => {
      res.ended = true;
      if (chunk === undefined) return;
      res.body += Buffer.isBuffer(chunk) ? chunk.toString() : String(chunk);
    },
  };
}

function runMiddleware(
  url: string,
  method = 'GET',
): Promise<{ res: Captured; nextCalled: boolean }> {
  const middleware = createLikenessPreviewMiddleware(root);
  const { res, end } = fakeResponse();
  let nextCalled = false;
  const response = {
    set statusCode(value: number) {
      res.statusCode = value;
    },
    get statusCode() {
      return res.statusCode;
    },
    setHeader(name: string, value: string) {
      res.headers[name.toLowerCase()] = value;
    },
    end,
  };
  return Promise.resolve(
    middleware(
      { method, url },
      response as unknown as Parameters<typeof middleware>[1],
      () => {
        nextCalled = true;
      },
    ),
  ).then(() => ({ res, nextCalled }));
}

describe('createLikenessPreviewMiddleware', () => {
  it('passes unrelated requests through', async () => {
    const { nextCalled } = await runMiddleware('/candidates');
    expect(nextCalled).toBe(true);
  });

  it('serves the index with no-store caching', async () => {
    await writeFixtures([generated()], []);
    await writeFile(kitPath(), KIT_BYTES);

    const { res } = await runMiddleware('/__dev/likeness/index.json');

    expect(res.statusCode).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.headers['x-likeness-preview']).toBe('development-only');
    expect(JSON.parse(res.body).kits).toHaveLength(1);
  });

  it('serves kit bytes and answers HEAD without a body', async () => {
    await writeFixtures([generated()], []);
    await writeFile(kitPath(), KIT_BYTES);

    const get = await runMiddleware(`/__dev/likeness/${KIT_FILE}`);
    expect(get.res.statusCode).toBe(200);
    expect(get.res.headers['content-type']).toBe('model/gltf-binary');
    expect(get.res.body).toBe(KIT_BYTES.toString());

    const head = await runMiddleware(`/__dev/likeness/${KIT_FILE}`, 'HEAD');
    expect(head.res.statusCode).toBe(200);
    expect(head.res.body).toBe('');
  });

  it('refuses to serve bytes that no longer hash to the manifest', async () => {
    await writeFixtures([generated()], []);
    const altered = Buffer.from(KIT_BYTES);
    altered[0] = (altered[0] ?? 0) ^ 0xff;
    await writeFile(kitPath(), altered);

    const { res } = await runMiddleware(`/__dev/likeness/${KIT_FILE}`);

    expect(res.statusCode).toBe(404);
    expect(res.body).toContain('not listed for preview');
  });

  it('refuses an approved kit through the preview route', async () => {
    await writeFixtures([generated()], [SLUG]);
    await writeFile(kitPath(), KIT_BYTES);

    const { res } = await runMiddleware(`/__dev/likeness/${KIT_FILE}`);

    expect(res.statusCode).toBe(404);
  });

  it('rejects writes, malformed escapes, and path traversal attempts', async () => {
    const post = await runMiddleware('/__dev/likeness/index.json', 'POST');
    expect(post.res.statusCode).toBe(405);

    const malformed = await runMiddleware('/__dev/likeness/%');
    expect(malformed.res.statusCode).toBe(400);
    expect(malformed.nextCalled).toBe(false);

    const traversal = await runMiddleware(
      '/__dev/likeness/..%2F..%2Fmanifest.json-head.glb',
    );
    expect(traversal.res.statusCode).toBe(404);
    expect(traversal.res.body).not.toContain('candidates');
  });
});
