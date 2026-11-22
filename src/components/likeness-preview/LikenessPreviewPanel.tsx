import { retryHeadKit } from '../CandidateHeadKit';
import {
  type LikenessPreviewView,
  type LikenessPreviewWalk,
  setLikenessPreviewShowKit,
  setLikenessPreviewView,
  setLikenessPreviewWalk,
  useLikenessPreview,
} from './store';

// The overlay styles are loaded only in a dev server, so a production build
// emits no rule for them.
if (import.meta.env.DEV) {
  void import('./preview-overlay.css');
}

const VIEWS: Array<{ value: LikenessPreviewView; label: string }> = [
  { value: 'city', label: '城市視角' },
  { value: 'front', label: '正面' },
  { value: 'three-quarter-left', label: '左 3⁄4' },
  { value: 'three-quarter-right', label: '右 3⁄4' },
  { value: 'side', label: '側面' },
];

const WALKS: Array<{ value: LikenessPreviewWalk; label: string }> = [
  { value: 'auto', label: '跟隨模擬' },
  { value: 'walk', label: '走動' },
  { value: 'idle', label: '待機' },
];

type LikenessPreviewPanelProps = {
  /**
   * Whether the open profile belongs to the kit's candidate. A kit is only ever
   * installed on its own candidate, so on another profile the panel must not
   * pretend its controls drive what is on screen.
   */
  active?: boolean;
};

/**
 * Development-only control surface for the likeness preview. Mounted by
 * `CityExplorer` only when the page is opened with `?likenessPreview=1` on a dev
 * server, and the store refuses every mutation outside a dev build, so these
 * controls cannot exist in a production bundle.
 */
export default function LikenessPreviewPanel({
  active = true,
}: LikenessPreviewPanelProps) {
  const preview = useLikenessPreview();
  const kit = preview.kits.find((entry) => entry.slug === preview.activeSlug);

  if (preview.status === 'off') return null;

  const disabled = preview.status !== 'ready' || !active;

  return (
    <aside
      aria-label="未發表頭像預覽（僅限開發）"
      className="likeness-preview"
      data-testid="likeness-preview-panel"
      data-status={preview.status}
      data-active={active ? 'true' : 'false'}
      data-show-kit={preview.showKit ? 'true' : 'false'}
      data-view={preview.view}
      data-walk={preview.walk}
    >
      <header className="likeness-preview__header">
        <strong className="likeness-preview__title">
          LIKENESS PREVIEW · DEV
        </strong>
        <span
          className="likeness-preview__status"
          data-testid="likeness-preview-status"
        >
          {preview.status === 'loading' && '讀取未發表模型清單…'}
          {preview.status === 'error' &&
            `無法載入：${preview.error ?? '未知錯誤'}`}
          {preview.status === 'ready' &&
            `${kit?.displayName ?? preview.activeSlug} · 未經人工核可 · 不會發布`}
        </span>
      </header>

      {preview.status === 'ready' && !active && (
        <p
          className="likeness-preview__note"
          data-testid="likeness-preview-mismatch"
        >
          目前檔案不是此頭像模型的候選人；預覽只在
          {kit?.displayName ?? preview.activeSlug}
          的檔案顯示。
        </p>
      )}

      {preview.status === 'ready' && (
        <>
          <fieldset className="likeness-preview__group">
            <legend className="likeness-preview__legend">模型來源</legend>
            <button
              type="button"
              aria-pressed={!preview.showKit}
              className={`likeness-preview__button${preview.showKit ? '' : ' is-active'}`}
              data-testid="likeness-base"
              disabled={disabled}
              onClick={() => setLikenessPreviewShowKit(false)}
            >
              共用基礎頭像
            </button>
            <button
              type="button"
              aria-pressed={preview.showKit}
              className={`likeness-preview__button${preview.showKit ? ' is-active' : ''}`}
              data-testid="likeness-sculpted"
              disabled={disabled}
              onClick={() => setLikenessPreviewShowKit(true)}
            >
              雕塑頭像
            </button>
          </fieldset>

          <fieldset className="likeness-preview__group">
            <legend className="likeness-preview__legend">視角</legend>
            {VIEWS.map((view) => (
              <button
                key={view.value}
                type="button"
                aria-pressed={preview.view === view.value}
                className={`likeness-preview__button${preview.view === view.value ? ' is-active' : ''}`}
                data-testid={`likeness-view-${view.value}`}
                disabled={disabled}
                onClick={() => setLikenessPreviewView(view.value)}
              >
                {view.label}
              </button>
            ))}
          </fieldset>

          <fieldset className="likeness-preview__group">
            <legend className="likeness-preview__legend">動作</legend>
            {WALKS.map((walk) => (
              <button
                key={walk.value}
                type="button"
                aria-pressed={preview.walk === walk.value}
                className={`likeness-preview__button${preview.walk === walk.value ? ' is-active' : ''}`}
                data-testid={`likeness-walk-${walk.value}`}
                disabled={disabled}
                onClick={() => setLikenessPreviewWalk(walk.value)}
              >
                {walk.label}
              </button>
            ))}
          </fieldset>

          <button
            type="button"
            className="likeness-preview__button likeness-preview__button--retry"
            data-testid="likeness-retry"
            disabled={disabled}
            onClick={() => {
              // Evict the rejected loader entry first, otherwise the cached
              // failure replays and consumes the fresh retry budget.
              if (kit) retryHeadKit(kit.path);
            }}
          >
            重新載入頭像模型
          </button>

          <p className="likeness-preview__note">
            動作覆寫只改變姿勢；角色仍依模擬在城市中移動。模型尚未通過人工審核，正式站維持共用基礎頭像。
          </p>
        </>
      )}
    </aside>
  );
}
