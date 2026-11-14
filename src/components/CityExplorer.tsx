import {
  Component,
  type CSSProperties,
  lazy,
  type ReactNode,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  coverageCompactSummary,
  coveragesForAdminDistrictId,
  coverageTypeLabel,
  type PublicCandidateProfile,
  type PublicDistrictView,
} from '../data';
import { withBase } from '../utils/paths';
import {
  type CandidateVisibilityScope,
  CITYWIDE_OVERVIEW_VISIBILITY,
  visibilityScopeForFocus,
  visibleCandidatesForFocus,
} from '../world/candidate-visibility';
import { electoralDistrictSlugForAdminName } from '../world/constituencies';
import { ADMIN_DISTRICT_BY_ID } from '../world/geography';
import { HEX_WORLD_FOCUS, hexFocusForDistrictIds } from '../world/hex';
import { getActor } from '../world/simulation';
import { ADMIN_ADJACENCY, ADMIN_SUMMARY_BY_ID } from '../world/summary';
import CandidateBottomSheet from './CandidateBottomSheet';
import type { DetailLevel, SceneFocus } from './CityScene';

const CityScene = lazy(() => import('./CityScene'));
const ProfileTabs = lazy(() => import('./ProfileTabs'));

type Props = {
  districts: PublicDistrictView[];
  candidates: PublicCandidateProfile[];
};

type ErrorBoundaryProps = { children: ReactNode; fallback: ReactNode };
type ErrorBoundaryState = { hasError: boolean };

class SceneErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  render() {
    return this.state.hasError ? this.props.fallback : this.props.children;
  }
}

const TERRAIN_LABELS: Record<string, string> = {
  urban: '都市',
  coastal: '海岸',
  hill: '丘陵',
  mountain: '山林',
};

const QUALITY_LABELS: Array<{ value: DetailLevel; label: string }> = [
  { value: 'high', label: '精緻' },
  { value: 'medium', label: '平衡' },
  { value: 'low', label: '流暢' },
];

function supportsWebGL() {
  try {
    const canvas = document.createElement('canvas');
    return Boolean(canvas.getContext('webgl2') ?? canvas.getContext('webgl'));
  } catch {
    return false;
  }
}

function StaticCityFallback({
  candidates,
  onSelect,
}: {
  candidates: PublicCandidateProfile[];
  onSelect: (slug: string) => void;
}) {
  return (
    <section
      className="fallback-city"
      data-testid="static-city-fallback"
      aria-label="不使用 WebGL 的靜態城市預覽"
    >
      <div className="fallback-city__sun" />
      <div className="fallback-city__harbor" />
      <div className="fallback-city__blocks">
        <div
          className="fallback-city__building"
          style={
            {
              '--building-height': '76%',
              '--building-color': '#f4bc86',
            } as CSSProperties
          }
        />
        <div
          className="fallback-city__building"
          style={
            {
              '--building-height': '52%',
              '--building-color': '#8bcac1',
            } as CSSProperties
          }
        />
        <div
          className="fallback-city__building"
          style={
            {
              '--building-height': '68%',
              '--building-color': '#e99679',
            } as CSSProperties
          }
        />
        <div
          className="fallback-city__building"
          style={
            {
              '--building-height': '44%',
              '--building-color': '#ffd895',
            } as CSSProperties
          }
        />
      </div>
      <div className="fallback-city__rail" />
      <div className="fallback-city__avatars">
        {candidates.map((candidate) => (
          <button
            className="fallback-avatar"
            key={candidate.candidacy.id}
            type="button"
            style={
              {
                '--avatar-color': candidate.visual.palette.top,
              } as CSSProperties
            }
            onClick={() => onSelect(candidate.candidacy.slug)}
          >
            <span>{candidate.person.shortName.slice(0, 1)}</span>
            <span>{candidate.person.shortName}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

export default function CityExplorer({ districts, candidates }: Props) {
  const firstDistrict = districts[0];
  const [selectedDistrictSlug, setSelectedDistrictSlug] = useState(
    firstDistrict?.slug ?? '',
  );
  const [selectedCandidateSlug, setSelectedCandidateSlug] = useState<
    string | null
  >(null);
  const [selectedAdminId, setSelectedAdminId] = useState<string | null>(null);
  const [hoveredAdminId, setHoveredAdminId] = useState<string | null>(null);
  const [followActorSlug, setFollowActorSlug] = useState<string | null>(null);
  const [overview, setOverview] = useState(true);
  const [viewNonce, setViewNonce] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [detail, setDetail] = useState<DetailLevel>('medium');
  const [webglSupported, setWebglSupported] = useState<boolean | null>(null);
  const [sceneReady, setSceneReady] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const profileCloseRef = useRef<HTMLButtonElement>(null);
  const peopleToggleRef = useRef<HTMLButtonElement>(null);
  const lastFocusedRef = useRef<HTMLElement | null>(null);
  const restoreFocusPendingRef = useRef(false);
  const returnFocusRef = useRef<{
    districtSlug: string;
    adminId: string | null;
    overview: boolean;
  } | null>(null);

  useEffect(() => {
    setWebglSupported(supportsWebGL());
    if (window.matchMedia('(min-width: 1024px)').matches) setDetail('high');

    const params = new URLSearchParams(window.location.search);
    const districtFromUrl = params.get('district');
    const validDistrictSlug =
      districtFromUrl &&
      districts.some((district) => district.slug === districtFromUrl)
        ? districtFromUrl
        : null;
    const adminFromUrl = params.get('admin');
    const admin = adminFromUrl
      ? ADMIN_SUMMARY_BY_ID.get(adminFromUrl)
      : undefined;
    const candidateFromUrl = params.get('candidate');
    const candidate = candidateFromUrl
      ? candidates.find((item) => item.candidacy.slug === candidateFromUrl)
      : undefined;

    if (candidate) {
      // A candidate route is the most specific focus: it defines the electoral
      // district and must not inherit an unrelated administrative focus from a
      // hand-edited URL. Closing the profile then keeps one consistent scope.
      setOverview(false);
      setSelectedCandidateSlug(candidate.candidacy.slug);
      setFollowActorSlug(candidate.candidacy.slug);
      setSelectedDistrictSlug(candidate.district.slug);
      setSelectedAdminId(null);
    } else if (admin) {
      // An administrative focus resolves to exactly one ordinary constituency.
      // Always synchronize the electoral district, so ?admin=&district= cannot
      // initialize contradictory administrative and constituency focus.
      setSelectedAdminId(admin.id);
      setOverview(false);
      const electoral = electoralDistrictSlugForAdminName(admin.shortName);
      if (electoral && districts.some((item) => item.slug === electoral)) {
        setSelectedDistrictSlug(electoral);
      }
    } else if (validDistrictSlug) {
      setSelectedDistrictSlug(validDistrictSlug);
      setOverview(false);
    }

    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const updateMotion = () => setReducedMotion(mediaQuery.matches);
    updateMotion();
    mediaQuery.addEventListener('change', updateMotion);
    return () => mediaQuery.removeEventListener('change', updateMotion);
  }, [candidates, districts]);

  useEffect(() => {
    if (webglSupported === null) return;
    const params = new URLSearchParams(window.location.search);
    if (selectedDistrictSlug) params.set('district', selectedDistrictSlug);
    else params.delete('district');
    params.delete('focus');
    if (selectedCandidateSlug) params.set('candidate', selectedCandidateSlug);
    else params.delete('candidate');
    if (selectedAdminId) params.set('admin', selectedAdminId);
    else params.delete('admin');
    const queryString = params.toString();
    const nextUrl = `${window.location.pathname}${queryString ? `?${queryString}` : ''}`;
    window.history.replaceState(null, '', nextUrl);
  }, [
    selectedAdminId,
    selectedCandidateSlug,
    selectedDistrictSlug,
    webglSupported,
  ]);

  useEffect(() => {
    if (!selectedCandidateSlug) return undefined;
    const frame = window.requestAnimationFrame(() => {
      profileCloseRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [selectedCandidateSlug]);

  const closeCandidate = useCallback(() => {
    restoreFocusPendingRef.current = true;
    setSelectedCandidateSlug(null);
    setFollowActorSlug(null);
    const origin = returnFocusRef.current;
    returnFocusRef.current = null;
    if (origin) {
      setSelectedDistrictSlug(origin.districtSlug);
      setSelectedAdminId(origin.adminId);
      setOverview(origin.overview);
    }
  }, []);

  useEffect(() => {
    if (selectedCandidateSlug || !restoreFocusPendingRef.current) return;
    restoreFocusPendingRef.current = false;
    // Restore after the panel has committed its unmount. Focusing inside the
    // same animation frame can be undone when the focused close button leaves
    // the DOM, which drops focus back to <body>.
    const returnTarget = lastFocusedRef.current;
    lastFocusedRef.current = null;
    if (returnTarget?.isConnected) returnTarget.focus();
    else peopleToggleRef.current?.focus();
  }, [selectedCandidateSlug]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (settingsOpen) {
        setSettingsOpen(false);
        window.dispatchEvent(new CustomEvent('kaohsiung:settings-closed'));
        return;
      }
      if (selectedCandidateSlug) {
        closeCandidate();
        return;
      }
      if (sheetOpen) {
        setSheetOpen(false);
        return;
      }
      if (selectedAdminId) {
        setSelectedAdminId(null);
        setOverview(true);
        return;
      }
      if (!overview) setOverview(true);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    closeCandidate,
    selectedAdminId,
    selectedCandidateSlug,
    overview,
    settingsOpen,
    sheetOpen,
  ]);

  const selectedDistrict =
    districts.find((district) => district.slug === selectedDistrictSlug) ??
    firstDistrict;

  const selectedCandidate = candidates.find(
    (candidate) => candidate.candidacy.slug === selectedCandidateSlug,
  );
  const selectedAdmin = selectedAdminId
    ? (ADMIN_SUMMARY_BY_ID.get(selectedAdminId) ?? null)
    : null;
  const selectedAdminNeighbours = selectedAdmin
    ? (ADMIN_ADJACENCY[selectedAdmin.shortName] ?? [])
    : [];
  const selectedAdminCoverages = selectedAdmin
    ? coveragesForAdminDistrictId(selectedAdmin.id)
    : [];
  const selectedCoverage = selectedDistrict?.constituencyCoverage;
  const candidateVisibilityScope = useMemo<CandidateVisibilityScope>(() => {
    if (selectedCandidate) {
      return visibilityScopeForFocus({
        kind: 'candidate',
        candidate: selectedCandidate,
      });
    }
    if (selectedAdminId) {
      return visibilityScopeForFocus({
        kind: 'administrative',
        adminDistrictId: selectedAdminId,
      });
    }
    if (!overview && selectedDistrict?.constituencyCoverage) {
      return visibilityScopeForFocus({
        kind: 'constituency',
        districtSlug: selectedDistrict.slug,
      });
    }
    return CITYWIDE_OVERVIEW_VISIBILITY;
  }, [
    overview,
    selectedAdminId,
    selectedCandidate,
    selectedDistrict?.constituencyCoverage,
    selectedDistrict?.slug,
  ]);
  const visibleCandidates = useMemo(
    () => visibleCandidatesForFocus(candidates, candidateVisibilityScope),
    [candidates, candidateVisibilityScope],
  );
  const candidateActor = selectedCandidate
    ? getActor(selectedCandidate.candidacy.slug)
    : null;

  const sceneFocus: SceneFocus = (() => {
    if (selectedCandidate) {
      return {
        key: `candidate-${selectedCandidate.candidacy.slug}`,
        target: candidateActor
          ? [candidateActor.position.x, 0, candidateActor.position.z]
          : HEX_WORLD_FOCUS.target,
        offset: [4.6, 6.2, 4.6],
        // Candidate framing preserves the current zoom; this radius only
        // decides which nearby avatars get their full character model.
        radius: 4.0,
      };
    }
    if (selectedAdmin) {
      const adminFocus =
        hexFocusForDistrictIds([selectedAdmin.id], 1.25) ?? HEX_WORLD_FOCUS;
      return {
        key: `admin-${selectedAdmin.id}-${String(viewNonce)}`,
        ...adminFocus,
      };
    }
    if (!overview) {
      const ids = selectedCoverage?.adminDistrictIds ?? [];
      const scopeFocus =
        (ids.length ? hexFocusForDistrictIds(ids, 1.12) : null) ??
        HEX_WORLD_FOCUS;
      return {
        key:
          'scope-' +
          (selectedDistrict?.slug ?? 'none') +
          '-' +
          String(viewNonce),
        ...scopeFocus,
      };
    }
    return {
      key: `world-overview-${String(viewNonce)}`,
      ...HEX_WORLD_FOCUS,
    };
  })();

  const selectCandidate = useCallback(
    (slug: string) => {
      const candidate = candidates.find((item) => item.candidacy.slug === slug);
      if (!candidate) return;
      const active = document.activeElement;
      lastFocusedRef.current =
        active instanceof HTMLElement && active !== document.body
          ? active
          : null;
      returnFocusRef.current = {
        districtSlug: selectedDistrictSlug,
        adminId: selectedAdminId,
        overview,
      };
      setSelectedDistrictSlug(candidate.district.slug);
      setSelectedCandidateSlug(slug);
      setFollowActorSlug(slug);
      setOverview(false);
      setSheetOpen(false);
    },
    [candidates, overview, selectedAdminId, selectedDistrictSlug],
  );

  const selectCandidateById = useCallback(
    (candidateId: string) => {
      const candidate = candidates.find(
        (item) => item.candidacy.id === candidateId,
      );
      if (candidate) selectCandidate(candidate.candidacy.slug);
    },
    [candidates, selectCandidate],
  );

  useEffect(() => {
    const onHeaderCandidateSelect = (event: Event) => {
      selectCandidate((event as CustomEvent<string>).detail);
    };
    window.addEventListener(
      'kaohsiung:select-candidate',
      onHeaderCandidateSelect,
    );
    return () =>
      window.removeEventListener(
        'kaohsiung:select-candidate',
        onHeaderCandidateSelect,
      );
  }, [selectCandidate]);

  useEffect(() => {
    const onSettingsOpenChange = (event: Event) => {
      setSettingsOpen((event as CustomEvent<boolean>).detail);
    };
    window.addEventListener(
      'kaohsiung:settings-open-change',
      onSettingsOpenChange,
    );
    return () =>
      window.removeEventListener(
        'kaohsiung:settings-open-change',
        onSettingsOpenChange,
      );
  }, []);

  const selectDistrict = useCallback((slug: string) => {
    returnFocusRef.current = null;
    setSelectedDistrictSlug(slug);
    setSelectedCandidateSlug(null);
    setFollowActorSlug(null);
    setSelectedAdminId(null);
    setOverview(false);
    setViewNonce((value) => value + 1);
  }, []);

  useEffect(() => {
    const bridge = window as unknown as {
      __kaohsiungSelectDistrict?: (slug: string) => void;
    };
    bridge.__kaohsiungSelectDistrict = selectDistrict;
    return () => {
      delete bridge.__kaohsiungSelectDistrict;
    };
  }, [selectDistrict]);

  useEffect(() => {
    if (!selectedCandidateSlug) return;
    const stillVisible = visibleCandidates.some(
      (candidate) => candidate.candidacy.slug === selectedCandidateSlug,
    );
    if (stillVisible) return;
    setSelectedCandidateSlug(null);
    setFollowActorSlug(null);
  }, [selectedCandidateSlug, visibleCandidates]);

  const selectAdmin = (
    id: string | null,
    options: { syncConstituency?: boolean } = {},
  ) => {
    if (!id) {
      setSelectedAdminId(null);
      setOverview(true);
      setViewNonce((value) => value + 1);
      return;
    }
    const district = ADMIN_SUMMARY_BY_ID.get(id);
    if (!district) return;
    returnFocusRef.current = null;
    setSelectedAdminId(id);
    setSelectedCandidateSlug(null);
    setFollowActorSlug(null);
    setSheetOpen(false);
    setOverview(false);
    if (options.syncConstituency !== false) {
      const electoral = electoralDistrictSlugForAdminName(district.shortName);
      if (electoral && districts.some((item) => item.slug === electoral)) {
        setSelectedDistrictSlug(electoral);
      }
    }
    setViewNonce((value) => value + 1);
  };

  const coverageAdminButtons = selectedCoverage
    ? selectedCoverage.adminDistrictIds.map((id) => {
        const district = ADMIN_DISTRICT_BY_ID.get(id);
        if (!district) return null;
        return (
          <button
            className="city-coverage-card__chip"
            data-admin-id={id}
            key={id}
            type="button"
            onClick={() => selectAdmin(id, { syncConstituency: false })}
          >
            {district.name}
          </button>
        );
      })
    : null;

  const backToWorld = () => {
    returnFocusRef.current = null;
    setSelectedAdminId(null);
    setSelectedCandidateSlug(null);
    setFollowActorSlug(null);
    setOverview(true);
    setViewNonce((value) => value + 1);
  };

  const resetView = () => {
    setSelectedCandidateSlug(null);
    setFollowActorSlug(null);
    setSelectedAdminId(null);
    setOverview(true);
    setViewNonce((value) => value + 1);
    setSettingsOpen(false);
    window.dispatchEvent(new CustomEvent('kaohsiung:settings-closed'));
  };

  const sceneFallback = (
    <StaticCityFallback
      candidates={visibleCandidates}
      onSelect={selectCandidate}
    />
  );

  return (
    <div
      className={`city-app${selectedCandidate ? ' is-profile-open' : ''}`}
      data-testid="city-explorer"
      data-scene-focus={sceneFocus.key}
      data-candidate-scope={candidateVisibilityScope.kind}
      data-candidate-count={visibleCandidates.length}
      data-hydrated={webglSupported === null ? 'false' : 'true'}
    >
      <div className="city-stage" data-testid="scene-frame">
        {webglSupported === true ? (
          <div className="scene-canvas city-canvas">
            <SceneErrorBoundary fallback={sceneFallback}>
              <Suspense
                fallback={
                  <p aria-live="polite" className="city-loading" role="status">
                    正在建造城市模型…
                  </p>
                }
              >
                <CityScene
                  candidates={candidates}
                  detail={detail}
                  focus={sceneFocus}
                  followActorSlug={followActorSlug}
                  hoveredAdminId={hoveredAdminId}
                  reducedMotion={reducedMotion}
                  selectedAdminId={selectedAdminId}
                  selectedCandidateSlug={selectedCandidateSlug}
                  visibilityScope={candidateVisibilityScope}
                  onHoverAdmin={setHoveredAdminId}
                  onManualCamera={() => setFollowActorSlug(null)}
                  onReady={() => setSceneReady(true)}
                  onSelectAdmin={selectAdmin}
                  onSelectCandidate={selectCandidate}
                />
              </Suspense>
            </SceneErrorBoundary>
            {!sceneReady && (
              <div className="scene-loading city-loading" role="status">
                正在準備高雄六角迷你城市…
              </div>
            )}
          </div>
        ) : webglSupported === false ? (
          sceneFallback
        ) : (
          <div className="scene-loading city-loading" role="status">
            正在檢查裝置繪圖能力…
          </div>
        )}

        <div className="city-vignette" aria-hidden="true" />

        {selectedAdmin && !selectedCandidate && (
          <article
            className="city-admin-card"
            aria-label={`${selectedAdmin.name} 行政區資訊`}
          >
            <header className="city-admin-card__header">
              <h2>{selectedAdmin.name}</h2>
              <span className="city-admin-card__english">
                {selectedAdmin.nameEn}
              </span>
            </header>
            <div className="city-admin-card__stats">
              <span>
                {TERRAIN_LABELS[selectedAdmin.terrain] ?? selectedAdmin.terrain}
              </span>
              <span>{selectedAdmin.areaKm2.toFixed(1)} km²</span>
              {selectedAdmin.remoteCount > 0 && (
                <span>含 {selectedAdmin.remoteCount} 處遠端轄區</span>
              )}
            </div>
            <section
              className="city-admin-card__neighbors"
              aria-labelledby="city-admin-neighbors-title"
            >
              <h3 id="city-admin-neighbors-title">相鄰行政區</h3>
              <p>
                {selectedAdminNeighbours.length
                  ? selectedAdminNeighbours.join('、')
                  : '無資料'}
              </p>
            </section>
            {selectedAdminCoverages.length > 0 && (
              <section
                className="city-admin-card__constituencies"
                aria-labelledby="city-admin-constituencies-title"
              >
                <h3 id="city-admin-constituencies-title">所屬選舉區</h3>
                <ul>
                  {selectedAdminCoverages.map((coverage) => (
                    <li key={coverage.number}>
                      <button
                        type="button"
                        onClick={() => selectDistrict(coverage.slug)}
                      >
                        <span className="city-admin-card__constituency-number">
                          第{coverage.number}選舉區
                        </span>
                        <span className="city-admin-card__constituency-kind">
                          {coverageTypeLabel(coverage.kind)}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            <div className="city-landmark-card__actions">
              <button type="button" onClick={backToWorld}>
                回到全市
              </button>
            </div>
          </article>
        )}

        {selectedCoverage && !selectedCandidate && !selectedAdmin && (
          <article
            aria-label={`${selectedDistrict?.name ?? ''} 選區範圍`}
            className="city-coverage-card"
            data-testid="city-coverage-card"
          >
            <span className="city-card__kicker">CONSTITUENCY COVERAGE</span>
            <h2>{selectedDistrict?.name}</h2>
            <p className="city-coverage-card__type">
              {selectedCoverage.coverageLabel}
            </p>
            {selectedCoverage.coverageKind === 'citywide-indigenous' ? (
              <details className="city-coverage-card__details">
                <summary>全市 38 個行政區（互動移動範圍）</summary>
                <div className="city-coverage-card__chips">
                  {coverageAdminButtons}
                </div>
              </details>
            ) : (
              <div className="city-coverage-card__chips">
                {coverageAdminButtons}
              </div>
            )}
            <p className="city-coverage-card__note">
              {selectedCoverage.coverageKind === 'citywide-indigenous'
                ? '平地原住民選舉區依身分與選舉資格認定；行政區僅作互動移動範圍。'
                : selectedCoverage.coverageKind ===
                    'indigenous-eligible-districts'
                  ? '上述行政區為山地原住民選舉區的設籍範圍，不是一般地理選區。'
                  : '點選行政區可聚焦該區，不會切換目前選舉區。'}
            </p>
            <a
              className="secondary-link"
              href={withBase(`/districts/${selectedCoverage.slug}/`)}
            >
              查看選區頁 →
            </a>
          </article>
        )}
      </div>

      <div className="city-hud">
        <div className="city-scene-label">
          <span className="city-scene-label__kicker">選舉區・CURRENT RACE</span>
          <strong id="scene-heading">
            {selectedDistrict?.name ?? '港都城市'}
          </strong>
          <span className="city-scene-label__zone">
            {selectedAdmin
              ? `行政區：${selectedAdmin.name}・六角迷你模型`
              : selectedCandidate
                ? '追蹤人物：' +
                  selectedCandidate.person.displayName +
                  '・沿道路行走'
                : !overview && selectedDistrict
                  ? `選區：${selectedDistrict.name}・道路移動範圍`
                  : '高雄市 38 行政區・六角迷你城市'}
          </span>
          {selectedCoverage && (
            <span className="city-scene-label__coverage">
              {coverageCompactSummary(selectedCoverage)}
            </span>
          )}
        </div>

        {settingsOpen && (
          <section className="city-settings" aria-label="顯示與體驗設定">
            <div className="city-settings__head">
              <strong>顯示與體驗</strong>
              <button
                aria-label="關閉設定"
                type="button"
                onClick={() => {
                  setSettingsOpen(false);
                  window.dispatchEvent(
                    new CustomEvent('kaohsiung:settings-closed'),
                  );
                }}
              >
                ×
              </button>
            </div>
            <span className="city-settings__label">城市細節</span>
            <div className="city-settings__quality">
              {QUALITY_LABELS.map((option) => (
                <button
                  aria-pressed={detail === option.value}
                  className={detail === option.value ? 'is-active' : ''}
                  key={option.value}
                  type="button"
                  onClick={() => setDetail(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <label className="city-settings__toggle">
              <input
                checked={reducedMotion}
                type="checkbox"
                onChange={(event) => setReducedMotion(event.target.checked)}
              />
              <span>減少動態效果</span>
            </label>
            <button
              className="city-settings__reset"
              type="button"
              onClick={resetView}
            >
              重設城市視角
            </button>
            <p className="city-settings__note">
              精緻模式保留完整六角平台、地標與樹木；較低階模式會減少裝飾物件以維持流暢度。
            </p>
          </section>
        )}

        <CandidateBottomSheet
          candidates={visibleCandidates}
          districts={districts}
          open={sheetOpen}
          reducedMotion={reducedMotion}
          triggerRef={peopleToggleRef}
          onClose={() => setSheetOpen(false)}
          onOpen={() => setSheetOpen(true)}
          onSelectCandidate={selectCandidateById}
        />
      </div>

      {selectedCandidate && (
        <aside
          aria-label="候選人資料面板"
          aria-live="polite"
          className="profile-panel city-profile is-open"
          data-testid="profile-panel"
        >
          <div className="profile-panel__top">
            <div className="profile-panel__identity">
              <span className="profile-badge">官方資料</span>
              <h2>{selectedCandidate.person.displayName}</h2>
              <p>
                {selectedCandidate.candidacy.currentPosition}・
                {selectedCandidate.district.name}
              </p>
            </div>
            <button
              aria-label="關閉人物資料"
              ref={profileCloseRef}
              className="profile-panel__close"
              type="button"
              onClick={closeCandidate}
            >
              ×
            </button>
          </div>
          <Suspense fallback={<p className="profile-loading">載入人物資料…</p>}>
            <ProfileTabs
              candidate={selectedCandidate}
              key={selectedCandidate.candidacy.slug}
            />
          </Suspense>
        </aside>
      )}
    </div>
  );
}
