import { useSyncExternalStore } from 'react';

/**
 * Development-only store for inspecting an unpublished likeness head kit in the
 * live city.
 *
 * The production gate lives in `src/data/avatars/likeness/runtime.ts`, which only
 * exposes human-approved kits. This store never writes that file, never copies
 * an asset into `public/`, and can only reach the `ready` state after the
 * dev-only route `/__dev/likeness/index.json` answered. Because the route is
 * registered by a Vite plugin with `apply: 'serve'` and the `DEV` gate below is
 * compiled to `false` in production, nothing here can publish or display an
 * unapproved kit in a built site.
 */

export type LikenessPreviewView =
  | 'city'
  | 'front'
  | 'three-quarter-left'
  | 'three-quarter-right'
  | 'side';

export type LikenessPreviewWalk = 'auto' | 'walk' | 'idle';

export type LikenessPreviewStatus = 'off' | 'loading' | 'ready' | 'error';

export type LikenessPreviewKit = {
  slug: string;
  candidateId: string;
  displayName: string;
  path: string;
  sha256: string;
  fileSizeBytes: number;
  triangleCount: number;
};

export type LikenessPreviewState = {
  status: LikenessPreviewStatus;
  kits: LikenessPreviewKit[];
  activeSlug: string | null;
  showKit: boolean;
  view: LikenessPreviewView;
  walk: LikenessPreviewWalk;
  error: string | null;
};

const DEV = import.meta.env.DEV;

const INITIAL: LikenessPreviewState = Object.freeze({
  status: 'off',
  kits: [],
  activeSlug: null,
  showKit: false,
  view: 'city',
  walk: 'auto',
  error: null,
}) as LikenessPreviewState;

let state: LikenessPreviewState = INITIAL;
const listeners = new Set<() => void>();

function publish(next: LikenessPreviewState) {
  state = next;
  for (const listener of listeners) listener();
}

export function subscribeLikenessPreview(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getLikenessPreviewState(): LikenessPreviewState {
  return state;
}

/** Server snapshot: the preview never renders during prerendering. */
function getServerSnapshot(): LikenessPreviewState {
  return INITIAL;
}

export function useLikenessPreview(): LikenessPreviewState {
  return useSyncExternalStore(
    subscribeLikenessPreview,
    getLikenessPreviewState,
    getServerSnapshot,
  );
}

function parseKits(body: unknown): LikenessPreviewKit[] {
  const kits = (body as { kits?: unknown }).kits;
  if (!Array.isArray(kits)) return [];
  return kits.flatMap((entry) => {
    const kit = entry as Partial<LikenessPreviewKit>;
    if (
      typeof kit.slug !== 'string' ||
      typeof kit.candidateId !== 'string' ||
      typeof kit.displayName !== 'string' ||
      typeof kit.path !== 'string' ||
      typeof kit.sha256 !== 'string' ||
      typeof kit.fileSizeBytes !== 'number' ||
      typeof kit.triangleCount !== 'number'
    ) {
      return [];
    }
    return [kit as LikenessPreviewKit];
  });
}

export const LIKENESS_PREVIEW_INDEX = `${import.meta.env.BASE_URL}__dev/likeness/index.json`;

/**
 * Asks the dev server for unpublished kits. A production build short-circuits on
 * `DEV`, so no fetch can turn the preview on there.
 */
export async function enableLikenessPreview(
  url: string = LIKENESS_PREVIEW_INDEX,
): Promise<LikenessPreviewState> {
  if (!DEV) return state;
  if (state.status === 'loading' || state.status === 'ready') return state;
  publish({ ...INITIAL, status: 'loading' });
  try {
    const response = await fetch(url, {
      headers: { accept: 'application/json' },
      cache: 'no-store',
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const kits = parseKits(await response.json());
    if (kits.length === 0) {
      publish({
        ...INITIAL,
        status: 'error',
        error: 'no unpublished kits to preview',
      });
      return state;
    }
    publish({
      ...INITIAL,
      status: 'ready',
      kits,
      activeSlug: kits[0]?.slug ?? null,
    });
  } catch (error) {
    publish({
      ...INITIAL,
      status: 'error',
      error: error instanceof Error ? error.message : String(error),
    });
  }
  return state;
}

export function setLikenessPreviewKit(slug: string | null): void {
  if (!DEV || state.status !== 'ready') return;
  if (slug !== null && !state.kits.some((kit) => kit.slug === slug)) return;
  publish({ ...state, activeSlug: slug });
}

export function setLikenessPreviewShowKit(showKit: boolean): void {
  if (!DEV || state.status !== 'ready') return;
  if (state.showKit === showKit) return;
  publish({ ...state, showKit });
}

export function setLikenessPreviewView(view: LikenessPreviewView): void {
  if (!DEV || state.status !== 'ready') return;
  if (state.view === view) return;
  publish({ ...state, view });
}

export function setLikenessPreviewWalk(walk: LikenessPreviewWalk): void {
  if (!DEV || state.status !== 'ready') return;
  if (state.walk === walk) return;
  publish({ ...state, walk });
}

/**
 * Kit to install for a slug, if the developer switched the preview on. Approval
 * is never implied: the kit only exists inside this dev-only store.
 */
export function previewHeadKitForSlug(
  slug: string,
  snapshot: LikenessPreviewState = state,
): LikenessPreviewKit | undefined {
  if (!DEV || snapshot.status !== 'ready' || !snapshot.showKit)
    return undefined;
  if (snapshot.activeSlug !== slug) return undefined;
  return snapshot.kits.find((kit) => kit.slug === slug);
}

/** Animation override for the previewed candidate only. */
export function previewWalkForSlug(
  slug: string,
  snapshot: LikenessPreviewState = state,
): LikenessPreviewWalk | null {
  if (!DEV || snapshot.status !== 'ready') return null;
  if (snapshot.activeSlug !== slug || snapshot.walk === 'auto') return null;
  return snapshot.walk;
}

/**
 * Whether the preview may take over the visible scene. A kit only ever installs
 * on its own candidate, so on another profile the controls would drive nothing
 * on screen; the panel disables itself and the scene keeps the ordinary camera.
 */
export function previewTargetsCandidate(
  snapshot: LikenessPreviewState = state,
  candidateSlug?: string | null,
): boolean {
  if (!DEV || snapshot.status !== 'ready' || snapshot.activeSlug === null) {
    return false;
  }
  // A citywide view has no profile to contradict: the pinned actor brings the
  // kit's candidate into the detailed set.
  return !candidateSlug || snapshot.activeSlug === candidateSlug;
}

/** Test/teardown helper: returns the store to its inert production state. */
export function resetLikenessPreview(): void {
  publish(INITIAL);
}
