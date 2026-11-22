import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  enableLikenessPreview,
  getLikenessPreviewState,
  previewHeadKitForSlug,
  previewTargetsCandidate,
  previewWalkForSlug,
  resetLikenessPreview,
  setLikenessPreviewKit,
  setLikenessPreviewShowKit,
  setLikenessPreviewView,
  setLikenessPreviewWalk,
  subscribeLikenessPreview,
} from './store';

const KIT = {
  slug: 'lai-rui-long-2026',
  candidateId: 'official-mayor-lai-rui-long-2026',
  displayName: '賴瑞隆',
  path: '/__dev/likeness/lai-rui-long-2026-head.glb',
  sha256: 'a'.repeat(64),
  fileSizeBytes: 180012,
  triangleCount: 7890,
};

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  resetLikenessPreview();
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('likeness preview store', () => {
  it('starts inert so nothing renders without an opt-in', () => {
    expect(getLikenessPreviewState().status).toBe('off');
    expect(previewHeadKitForSlug(KIT.slug)).toBeUndefined();
    expect(previewWalkForSlug(KIT.slug)).toBeNull();
  });

  it('loads the unpublished kit list and activates the first kit', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ kits: [KIT] }));

    const state = await enableLikenessPreview('/__dev/likeness/index.json');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ cache: 'no-store' });
    expect(state.status).toBe('ready');
    expect(state.activeSlug).toBe(KIT.slug);
    // Listing kits never installs one: the developer still has to choose it.
    expect(previewHeadKitForSlug(KIT.slug)).toBeUndefined();
  });

  it('drops malformed kit entries instead of trusting the dev route', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        kits: [KIT, { ...KIT, slug: 'mismatch', fileSizeBytes: 'big' }],
      }),
    );

    const state = await enableLikenessPreview();

    expect(state.kits.map((kit) => kit.slug)).toEqual([KIT.slug]);
  });

  it('reports an error when no unpublished kit exists', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ kits: [] }));

    const state = await enableLikenessPreview();

    expect(state.status).toBe('error');
    expect(state.error).toBe('no unpublished kits to preview');
    expect(state.kits).toEqual([]);
  });

  it('reports a transport failure without leaving the store loading', async () => {
    fetchMock.mockResolvedValue(jsonResponse({}, 500));

    const state = await enableLikenessPreview();

    expect(state.status).toBe('error');
    expect(state.error).toBe('HTTP 500');
  });

  it('does not refetch once the preview is ready', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ kits: [KIT] }));
    await enableLikenessPreview();
    await enableLikenessPreview();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('gates every control on a ready preview', async () => {
    setLikenessPreviewShowKit(true);
    setLikenessPreviewView('front');
    setLikenessPreviewWalk('walk');
    setLikenessPreviewKit(KIT.slug);

    const off = getLikenessPreviewState();
    expect(off.showKit).toBe(false);
    expect(off.view).toBe('city');
    expect(off.walk).toBe('auto');
    expect(off.activeSlug).toBeNull();
  });

  it('installs a kit only for the active candidate when switched on', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ kits: [KIT] }));
    await enableLikenessPreview();

    setLikenessPreviewShowKit(true);
    expect(previewHeadKitForSlug(KIT.slug)?.path).toBe(KIT.path);
    expect(previewHeadKitForSlug('someone-else-2026')).toBeUndefined();

    setLikenessPreviewShowKit(false);
    expect(previewHeadKitForSlug(KIT.slug)).toBeUndefined();
  });

  it('applies a walk override only to the previewed candidate', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ kits: [KIT] }));
    await enableLikenessPreview();

    setLikenessPreviewWalk('walk');
    expect(previewWalkForSlug(KIT.slug)).toBe('walk');
    expect(previewWalkForSlug('someone-else-2026')).toBeNull();

    setLikenessPreviewWalk('auto');
    expect(previewWalkForSlug(KIT.slug)).toBeNull();
  });

  it('only claims the scene for the kit candidate profile', async () => {
    expect(previewTargetsCandidate()).toBe(false);

    fetchMock.mockResolvedValue(jsonResponse({ kits: [KIT] }));
    await enableLikenessPreview();

    expect(previewTargetsCandidate()).toBe(true);
    expect(previewTargetsCandidate(undefined, '')).toBe(true);
    expect(previewTargetsCandidate(undefined, KIT.slug)).toBe(true);
    expect(previewTargetsCandidate(undefined, 'ke-zhi-en-2026')).toBe(false);
  });

  it('notifies subscribers and resets to the inert state', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ kits: [KIT] }));
    const listener = vi.fn();
    const unsubscribe = subscribeLikenessPreview(listener);

    await enableLikenessPreview();
    expect(listener).toHaveBeenCalled();

    resetLikenessPreview();
    expect(getLikenessPreviewState().status).toBe('off');
    unsubscribe();
  });
});
