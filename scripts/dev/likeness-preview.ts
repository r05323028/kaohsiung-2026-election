import { createHash } from 'node:crypto';
import { lstat, readFile, realpath } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import path from 'node:path';
import type { Plugin } from 'vite';

/**
 * Development-only route for inspectable but unpublished head kits.
 *
 * The likeness pipeline keeps unapproved GLBs in `data/avatars/likeness/kits`
 * and only copies human-approved files into `public/assets/avatars/likeness`.
 * That gate stays intact: this middleware streams the working set straight out
 * of `data/`, so nothing unpublished ever lands in `public/` or `dist/`.
 *
 * It exists only when the developer opts in with `LIKENESS_PREVIEW=1` on a dev
 * server (`apply: 'serve'`), and the client only shows the UI when the page is
 * opened with `?likenessPreview=1`.
 *
 * Every kit is served only when it is listed by the index and its bytes hash to
 * the manifest's `headKit.sha256`, so a human inspecting the city sees exactly
 * the artifact a later review decision would pin.
 */
const ROUTE_PREFIX = '/__dev/likeness/';
const KIT_DIR = 'data/avatars/likeness/kits';
const MANIFEST = 'data/avatars/likeness/manifest.json';
const LOADABLE = 'data/avatars/likeness/loadable.json';
const SLUG = /^[a-z0-9-]+$/;
const KIT_SUFFIX = '-head.glb';

export type LikenessPreviewIndexKit = {
  slug: string;
  candidateId: string;
  displayName: string;
  path: string;
  sha256: string;
  fileSizeBytes: number;
  triangleCount: number;
};

export type LikenessPreviewIndex = {
  schemaVersion: 1;
  origin: 'development-only';
  approval: 'unapproved';
  kits: LikenessPreviewIndexKit[];
};

type ManifestEntry = {
  slug?: string;
  candidateId?: string;
  displayName?: string;
  state?: string;
  headKit?: { sha256?: string; fileSizeBytes?: number; triangleCount?: number };
};

function digest(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

async function readJson(root: string, relative: string): Promise<unknown> {
  return JSON.parse(await readFile(path.join(root, relative), 'utf8'));
}

/**
 * Resolves a kit path that must stay inside the kit directory. `lstat` rejects
 * symlinks (they are not regular files) and `realpath` rejects anything that
 * still resolves elsewhere, so an attacker-controlled link cannot turn this
 * route into an arbitrary file reader.
 */
async function resolveKitFile(root: string, slug: string) {
  const dir = path.join(root, KIT_DIR);
  const file = path.join(dir, `${slug}${KIT_SUFFIX}`);
  const info = await lstat(file).catch(() => null);
  if (!info?.isFile()) return null;
  try {
    const [realFile, realDir] = await Promise.all([
      realpath(file),
      realpath(dir),
    ]);
    if (path.dirname(realFile) !== realDir) return null;
    return realFile;
  } catch {
    return null;
  }
}

/**
 * Lists generated-but-unapproved kits from the manifest. Approved kits are
 * skipped on purpose: those are served from `public/` by the normal runtime, so
 * a preview must not become a second source of truth for them. A kit whose
 * bytes no longer hash to the manifest is hidden: it is mid-regeneration, and
 * showing it would preview an artifact the manifest never described.
 */
export async function buildLikenessPreviewIndex(
  root: string,
): Promise<LikenessPreviewIndex> {
  const [manifest, loadable] = await Promise.all([
    readJson(root, MANIFEST) as Promise<{ candidates?: ManifestEntry[] }>,
    readJson(root, LOADABLE) as Promise<{ kits?: Array<{ slug?: string }> }>,
  ]);
  const approved = new Set(
    (loadable.kits ?? []).map((kit) => kit.slug).filter(Boolean),
  );
  const kits: LikenessPreviewIndexKit[] = [];
  for (const entry of manifest.candidates ?? []) {
    if (entry.state !== 'generated' || !entry.headKit) continue;
    const { slug, candidateId, displayName, headKit } = entry;
    if (!slug || !candidateId || !displayName) continue;
    if (!SLUG.test(slug)) continue;
    if (approved.has(slug)) continue;
    const { sha256, fileSizeBytes, triangleCount } = headKit;
    if (
      typeof sha256 !== 'string' ||
      typeof fileSizeBytes !== 'number' ||
      typeof triangleCount !== 'number'
    ) {
      continue;
    }
    const file = await resolveKitFile(root, slug);
    if (!file) continue;
    const bytes = await readFile(file).catch(() => null);
    if (!bytes) continue;
    if (bytes.byteLength !== fileSizeBytes || digest(bytes) !== sha256)
      continue;
    kits.push({
      slug,
      candidateId,
      displayName,
      path: `${ROUTE_PREFIX}${slug}${KIT_SUFFIX}`,
      sha256,
      fileSizeBytes,
      triangleCount,
    });
  }
  return {
    schemaVersion: 1,
    origin: 'development-only',
    approval: 'unapproved',
    kits,
  };
}

type PreviewResponse = Pick<
  ServerResponse,
  'end' | 'setHeader' | 'statusCode'
> & {
  statusCode: number;
};

function sendJson(res: PreviewResponse, status: number, body: unknown) {
  const payload = Buffer.from(JSON.stringify(body));
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('content-length', String(payload.byteLength));
  res.setHeader('cache-control', 'no-store');
  res.end(payload);
}

/** Returns the decoded request name, or null when the URL is malformed. */
function decodeRequestName(url: string): string | null {
  const raw = url.slice(ROUTE_PREFIX.length).split('?')[0] ?? '';
  try {
    return decodeURIComponent(raw);
  } catch {
    // A malformed escape (for example "/%") must not reject the middleware.
    return null;
  }
}

export function createLikenessPreviewMiddleware(root: string) {
  return async function likenessPreview(
    req: Pick<IncomingMessage, 'method' | 'url'>,
    res: PreviewResponse,
    next: () => void,
  ) {
    const url = req.url ?? '';
    if (!url.startsWith(ROUTE_PREFIX)) {
      next();
      return;
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.statusCode = 405;
      res.setHeader('allow', 'GET, HEAD');
      res.end();
      return;
    }
    res.setHeader('x-likeness-preview', 'development-only');
    res.setHeader('cache-control', 'no-store');
    const name = decodeRequestName(url);
    if (name === null) {
      sendJson(res, 400, { error: 'malformed preview URL' });
      return;
    }
    if (name === 'index.json' || name === '') {
      sendJson(res, 200, await buildLikenessPreviewIndex(root));
      return;
    }
    if (!name.endsWith(KIT_SUFFIX)) {
      sendJson(res, 404, { error: 'unknown preview asset' });
      return;
    }
    const slug = name.slice(0, -KIT_SUFFIX.length);
    if (!SLUG.test(slug)) {
      sendJson(res, 404, { error: 'unknown preview asset' });
      return;
    }
    // Serve only what the index vouches for: generated, unapproved, and hashed.
    const index = await buildLikenessPreviewIndex(root);
    const kit = index.kits.find((entry) => entry.slug === slug);
    if (!kit) {
      sendJson(res, 404, { error: 'kit is not listed for preview' });
      return;
    }
    const file = await resolveKitFile(root, slug);
    const bytes = file ? await readFile(file).catch(() => null) : null;
    if (!bytes || digest(bytes) !== kit.sha256) {
      sendJson(res, 404, { error: 'kit bytes do not match the manifest' });
      return;
    }
    res.statusCode = 200;
    res.setHeader('content-type', 'model/gltf-binary');
    res.setHeader('content-length', String(bytes.byteLength));
    res.end(req.method === 'HEAD' ? undefined : bytes);
  };
}

/** Vite plugin: serve the preview index and kits from `data/` while developing. */
export function likenessPreview(): Plugin {
  let root = process.cwd();
  return {
    name: 'likeness-preview',
    apply: 'serve',
    configResolved(config) {
      root = config.root;
    },
    configureServer(server) {
      if (process.env.LIKENESS_PREVIEW !== '1') return;
      server.middlewares.use(createLikenessPreviewMiddleware(root));
      server.config.logger.info(
        '[likeness-preview] unpublished head kits at /__dev/likeness/ (open any page with ?likenessPreview=1)',
      );
    },
  };
}
