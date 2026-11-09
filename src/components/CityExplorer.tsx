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
import type { DetailLevel } from '../city/builder';
import type { LandmarkId } from '../city/layout';
import type { PublicCandidateProfile, PublicDistrictView } from '../data';
import {
  electoralDistrictSlugForAdminName,
  movementScopeForCandidate,
  movementScopeForDistrictSlug,
} from '../world/constituencies';
import { worldDistrictFocus } from '../world/district-geometry';
import { WORLD_DISTRICT_BY_ID } from '../world/geography';
import { heroFocusToWorld } from '../world/hero';
import {
  ADMIN_ADJACENCY,
  ADMIN_SUMMARY,
  ADMIN_SUMMARY_BY_ID,
  focusForWorldSummary,
  summaryFocusForNames,
  summaryWorldFocus,
} from '../world/summary';
import type { SceneFocus } from './CityScene';

const CityScene = lazy(() => import('./CityScene'));
const ProfileTabs = lazy(() => import('./ProfileTabs'));

type FocusView = {
  target: [number, number, number];
  offset: [number, number, number];
  radius: number;
};

export type LandmarkView = {
  id: LandmarkId;
  label: string;
  english: string;
  blurb: string;
  x: number;
  z: number;
  focus: FocusView;
};

type SceneZone = 'overview' | 'zuoying' | 'nanzih';
type DistrictFocusView = Record<SceneZone, FocusView>;

type Props = {
  districts: PublicDistrictView[];
  candidates: PublicCandidateProfile[];
  landmarks: LandmarkView[];
  districtFocus: DistrictFocusView;
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

const ZONE_LABELS: Record<SceneZone, string> = {
  overview: '全城',
  zuoying: '左營',
  nanzih: '楠梓',
};

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

function CandidateButton({
  candidate,
  active,
  onSelect,
  result = false,
}: {
  candidate: PublicCandidateProfile;
  active: boolean;
  onSelect: (slug: string) => void;
  result?: boolean;
}) {
  return (
    <button
      aria-current={active ? 'true' : undefined}
      className={`candidate-list__item city-candidate${active ? ' is-active' : ''}${result ? ' city-candidate--result' : ''}`}
      type="button"
      onClick={() => onSelect(candidate.candidacy.slug)}
    >
      <span
        className="candidate-list__avatar"
        style={
          {
            '--avatar-color': candidate.visual.palette.top,
          } as CSSProperties
        }
      >
        {candidate.person.shortName.slice(0, 1)}
      </span>
      <span className="candidate-list__copy">
        <strong>{candidate.person.displayName}</strong>
        <small>
          {result
            ? candidate.district.name
            : candidate.candidacy.currentPosition}
        </small>
      </span>
    </button>
  );
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

export default function CityExplorer({
  districts,
  candidates,
  landmarks,
  districtFocus,
}: Props) {
  const firstDistrict =
    districts.find((district) => district.isDemo === true) ?? districts[0];
  const [selectedDistrictSlug, setSelectedDistrictSlug] = useState(
    firstDistrict?.slug ?? '',
  );
  const [electionFilter, setElectionFilter] = useState<
    'all' | 'mayoral' | 'city-council' | 'indigenous-council' | 'demo'
  >('all');
  const [selectedCandidateSlug, setSelectedCandidateSlug] = useState<
    string | null
  >(null);
  const [selectedLandmark, setSelectedLandmark] = useState<LandmarkId | null>(
    null,
  );
  const [hoveredLandmark, setHoveredLandmark] = useState<LandmarkId | null>(
    null,
  );
  const [selectedAdminId, setSelectedAdminId] = useState<string | null>(null);
  const [hoveredAdminId, setHoveredAdminId] = useState<string | null>(null);
  const [followActorSlug, setFollowActorSlug] = useState<string | null>(null);
  const [worldMode, setWorldMode] = useState(true);
  const [activeZone, setActiveZone] = useState<SceneZone>('overview');
  const [viewNonce, setViewNonce] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [boundaryDebug, setBoundaryDebug] = useState(false);
  const [dockPanel, setDockPanel] = useState<
    'districts' | 'people' | 'admin' | null
  >(null);
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
    zone: SceneZone;
    landmark: LandmarkId | null;
    adminId: string | null;
    worldMode: boolean;
  } | null>(null);

  useEffect(() => {
    setWebglSupported(supportsWebGL());
    if (window.matchMedia('(min-width: 1024px)').matches) setDetail('high');

    const params = new URLSearchParams(window.location.search);
    if (params.get('debug') === 'boundaries') setBoundaryDebug(true);
    let hasUrlFocus = false;
    const districtFromUrl = params.get('district');
    if (
      districtFromUrl &&
      districts.some((district) => district.slug === districtFromUrl)
    ) {
      setSelectedDistrictSlug(districtFromUrl);
      setWorldMode(false);
      hasUrlFocus = true;
    }

    const adminFromUrl = params.get('admin');
    const admin = adminFromUrl
      ? ADMIN_SUMMARY_BY_ID.get(adminFromUrl)
      : undefined;
    if (admin) {
      hasUrlFocus = true;
      setSelectedAdminId(admin.id);
      setWorldMode(true);
      setActiveZone(
        admin.shortName === '左營'
          ? 'zuoying'
          : admin.shortName === '楠梓'
            ? 'nanzih'
            : 'overview',
      );
      const electoral = electoralDistrictSlugForAdminName(admin.shortName);
      if (electoral && districts.some((item) => item.slug === electoral)) {
        setSelectedDistrictSlug(electoral);
      }
    }

    const focusFromUrl = params.get('focus');
    const landmarkFromUrl = landmarks.find(
      (landmark) => landmark.id === focusFromUrl,
    );
    if (landmarkFromUrl) {
      hasUrlFocus = true;
      setWorldMode(false);
      setSelectedLandmark(landmarkFromUrl.id);
      setActiveZone(
        landmarkFromUrl.id === 'harbor-front'
          ? 'overview'
          : landmarkFromUrl.x > 4
            ? 'nanzih'
            : 'zuoying',
      );
    }

    const candidateFromUrl = params.get('candidate');
    if (candidateFromUrl) {
      const candidate = candidates.find(
        (item) => item.candidacy.slug === candidateFromUrl,
      );
      if (candidate) {
        hasUrlFocus = true;
        setWorldMode(false);
        setSelectedCandidateSlug(candidateFromUrl);
        setFollowActorSlug(candidateFromUrl);
        setSelectedDistrictSlug(candidate.district.slug);
        setSelectedLandmark(null);
        setActiveZone('overview');
      }
    }

    // On a portrait phone an all-district overview is too small to explore,
    // so open on the Zuoying side of the diorama unless a URL names a focus.
    if (!hasUrlFocus && window.matchMedia('(max-width: 760px)').matches) {
      setWorldMode(false);
      setActiveZone('zuoying');
    }

    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const updateMotion = () => setReducedMotion(mediaQuery.matches);
    updateMotion();
    mediaQuery.addEventListener('change', updateMotion);
    return () => mediaQuery.removeEventListener('change', updateMotion);
  }, [candidates, districts, landmarks]);

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

  useEffect(() => {
    if (webglSupported === null) return;
    const params = new URLSearchParams(window.location.search);
    if (selectedDistrictSlug) params.set('district', selectedDistrictSlug);
    else params.delete('district');
    if (selectedLandmark) params.set('focus', selectedLandmark);
    else params.delete('focus');
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
    selectedLandmark,
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
      setActiveZone(origin.zone);
      setSelectedLandmark(origin.landmark);
      setSelectedAdminId(origin.adminId);
      setWorldMode(origin.worldMode);
      if (origin.landmark) setHoveredLandmark(null);
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
        window.dispatchEvent(
          new CustomEvent('kaohsiung:settings-open-change', { detail: false }),
        );
        return;
      }
      if (selectedCandidateSlug) {
        closeCandidate();
        return;
      }
      if (dockPanel) {
        setDockPanel(null);
        return;
      }
      if (selectedLandmark) {
        setSelectedLandmark(null);
        return;
      }
      if (selectedAdminId) {
        setSelectedAdminId(null);
        setWorldMode(true);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    closeCandidate,
    dockPanel,
    selectedAdminId,
    selectedCandidateSlug,
    selectedLandmark,
    settingsOpen,
  ]);

  const filteredDistricts = useMemo(() => {
    if (electionFilter === 'all') return districts;
    if (electionFilter === 'demo')
      return districts.filter((district) => district.isDemo === true);
    return districts.filter(
      (district) => district.electionType === electionFilter,
    );
  }, [districts, electionFilter]);

  useEffect(() => {
    if (dockPanel !== 'districts') return;
    // On narrow screens the tray itself scrolls; scrollIntoView would push the
    // election tabs and close control out of view. Desktop can scroll the
    // horizontal district rail instead.
    if (window.matchMedia('(max-width: 760px)').matches) return;
    const active = document.querySelector<HTMLElement>(
      '#city-district-tray .city-district[aria-current="true"]',
    );
    active?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [dockPanel]);

  const selectedDistrict =
    filteredDistricts.find(
      (district) => district.slug === selectedDistrictSlug,
    ) ??
    filteredDistricts[0] ??
    firstDistrict;

  const visibleCandidates = useMemo(
    () =>
      candidates.filter(
        (candidate) => candidate.district.slug === selectedDistrict?.slug,
      ),
    [candidates, selectedDistrict?.slug],
  );

  const selectedCandidate = candidates.find(
    (candidate) => candidate.candidacy.slug === selectedCandidateSlug,
  );
  const selectedLandmarkSpec = landmarks.find(
    (landmark) => landmark.id === selectedLandmark,
  );
  const hoveredLandmarkSpec = landmarks.find(
    (landmark) => landmark.id === hoveredLandmark,
  );
  const selectedAdmin = selectedAdminId
    ? (ADMIN_SUMMARY_BY_ID.get(selectedAdminId) ?? null)
    : null;
  const selectedAdminWorld = selectedAdminId
    ? (WORLD_DISTRICT_BY_ID.get(selectedAdminId) ?? null)
    : null;
  const selectedAdminNeighbours = selectedAdmin
    ? (ADMIN_ADJACENCY[selectedAdmin.shortName] ?? [])
    : [];

  const sceneFocus: SceneFocus = (() => {
    if (selectedCandidate) {
      const scope = movementScopeForCandidate(selectedCandidate);
      const heroConstituency =
        scope.allowedAdminNames.includes('左營') &&
        scope.allowedAdminNames.includes('楠梓');
      const base = heroConstituency
        ? heroFocusToWorld(districtFocus.overview)
        : (summaryFocusForNames(scope.allowedAdminNames) ??
          focusForWorldSummary());
      // A citywide candidate needs district context; a council candidate
      // moving inside the hero diorama needs the plaza and streets.
      const followRadius =
        scope.kind === 'mayoral' || scope.kind === 'indigenous' ? 8.4 : 1.8;
      return {
        key: `candidate-${selectedCandidate.candidacy.slug}`,
        target: base.target,
        offset: [4.6, 6.2, 4.6] as [number, number, number],
        radius: followRadius,
      };
    }
    if (selectedLandmarkSpec) {
      return {
        key: `landmark-${selectedLandmarkSpec.id}`,
        ...heroFocusToWorld(selectedLandmarkSpec.focus),
      };
    }
    if (selectedAdmin) {
      return {
        key: `admin-${selectedAdmin.id}-${viewNonce}`,
        ...(selectedAdminWorld
          ? worldDistrictFocus(selectedAdminWorld)
          : summaryWorldFocus(selectedAdmin)),
      };
    }
    if (worldMode) {
      return {
        key: `world-overview-${viewNonce}`,
        ...focusForWorldSummary(),
      };
    }
    if (activeZone === 'zuoying' || activeZone === 'nanzih') {
      return {
        key: `zone-${activeZone}-${viewNonce}`,
        ...heroFocusToWorld(districtFocus[activeZone]),
      };
    }
    const scope = movementScopeForDistrictSlug(selectedDistrict?.slug ?? '');
    if (scope.kind !== 'mayoral' && scope.kind !== 'indigenous') {
      if (
        scope.allowedAdminNames.includes('左營') &&
        scope.allowedAdminNames.includes('楠梓')
      ) {
        return {
          key: `hero-overview-${viewNonce}`,
          ...heroFocusToWorld(districtFocus.overview),
        };
      }
      const scopeFocus = summaryFocusForNames(scope.allowedAdminNames);
      if (scopeFocus) {
        return {
          key: `scope-${selectedDistrict?.slug ?? 'none'}-${viewNonce}`,
          ...scopeFocus,
        };
      }
    }
    return {
      key: `world-overview-${viewNonce}`,
      ...focusForWorldSummary(),
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
        zone: activeZone,
        landmark: selectedLandmark,
        adminId: selectedAdminId,
        worldMode,
      };
      setSelectedDistrictSlug(candidate.district.slug);
      setSelectedCandidateSlug(slug);
      setFollowActorSlug(slug);
      setWorldMode(false);
      setDockPanel(null);
      setSelectedLandmark(null);
      setHoveredLandmark(null);
      setActiveZone('overview');
      if (electionFilter !== 'all') {
        const matchesFilter =
          electionFilter === 'demo'
            ? candidate.district.isDemo === true
            : candidate.district.electionType === electionFilter;
        if (!matchesFilter) setElectionFilter('all');
      }
    },
    [
      activeZone,
      candidates,
      electionFilter,
      selectedAdminId,
      selectedDistrictSlug,
      selectedLandmark,
      worldMode,
    ],
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

  const selectDistrict = (slug: string) => {
    returnFocusRef.current = null;
    setSelectedDistrictSlug(slug);
    setSelectedCandidateSlug(null);
    setFollowActorSlug(null);
    setSelectedLandmark(null);
    setHoveredLandmark(null);
    setSelectedAdminId(null);
    setWorldMode(false);
    setActiveZone('overview');
    setViewNonce((value) => value + 1);
  };

  const selectLandmark = (id: LandmarkId | null) => {
    returnFocusRef.current = null;
    if (!id) {
      setSelectedLandmark(null);
      return;
    }
    const spec = landmarks.find((landmark) => landmark.id === id);
    if (!spec) return;
    if (selectedLandmark === id) {
      setSelectedLandmark(null);
      return;
    }
    setSelectedLandmark(id);
    setSelectedCandidateSlug(null);
    setSelectedAdminId(null);
    setFollowActorSlug(null);
    setWorldMode(false);
    setHoveredLandmark(null);
    setActiveZone(
      id === 'harbor-front' ? 'overview' : spec.x > 4 ? 'nanzih' : 'zuoying',
    );
  };

  const changeZone = (zone: SceneZone) => {
    returnFocusRef.current = null;
    setActiveZone(zone);
    setSelectedCandidateSlug(null);
    setFollowActorSlug(null);
    setSelectedLandmark(null);
    setHoveredLandmark(null);
    setSelectedAdminId(null);
    setWorldMode(zone === 'overview');
    if (zone !== 'overview') {
      const council04 = districts.find(
        (district) => district.slug === 'kaohsiung-council-04',
      );
      if (council04) setSelectedDistrictSlug(council04.slug);
    }
    setViewNonce((value) => value + 1);
  };

  const selectAdmin = (id: string | null) => {
    if (!id) {
      setSelectedAdminId(null);
      setWorldMode(true);
      setViewNonce((value) => value + 1);
      return;
    }
    const district = ADMIN_SUMMARY_BY_ID.get(id);
    if (!district) return;
    returnFocusRef.current = null;
    setSelectedAdminId(id);
    setSelectedCandidateSlug(null);
    setFollowActorSlug(null);
    setSelectedLandmark(null);
    setHoveredLandmark(null);
    setWorldMode(true);
    setDockPanel(null);
    setActiveZone(
      district.shortName === '左營'
        ? 'zuoying'
        : district.shortName === '楠梓'
          ? 'nanzih'
          : 'overview',
    );
    const electoral = electoralDistrictSlugForAdminName(district.shortName);
    if (electoral && districts.some((item) => item.slug === electoral)) {
      setSelectedDistrictSlug(electoral);
    }
    setViewNonce((value) => value + 1);
  };

  const backToWorld = () => {
    setSelectedAdminId(null);
    setWorldMode(true);
    setViewNonce((value) => value + 1);
  };

  const resetView = () => {
    setSelectedCandidateSlug(null);
    setFollowActorSlug(null);
    setSelectedLandmark(null);
    setHoveredLandmark(null);
    setSelectedAdminId(null);
    setWorldMode(true);
    setActiveZone('overview');
    setViewNonce((value) => value + 1);
    setSettingsOpen(false);
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
                  hoveredLandmark={hoveredLandmark}
                  boundaryDebug={boundaryDebug}
                  reducedMotion={reducedMotion}
                  selectedAdminId={selectedAdminId}
                  selectedCandidateSlug={selectedCandidateSlug}
                  selectedLandmark={selectedLandmark}
                  onHoverAdmin={setHoveredAdminId}
                  onHoverLandmark={setHoveredLandmark}
                  onManualCamera={() => setFollowActorSlug(null)}
                  onReady={() => setSceneReady(true)}
                  onSelectAdmin={selectAdmin}
                  onSelectCandidate={selectCandidate}
                  onSelectLandmark={selectLandmark}
                />
              </Suspense>
            </SceneErrorBoundary>
            {!sceneReady && (
              <div className="scene-loading city-loading" role="status">
                正在準備左營・楠梓迷你城市…
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

        {hoveredLandmarkSpec && hoveredLandmark !== selectedLandmark && (
          <div className="city-hover-card" aria-hidden="true">
            <strong>{hoveredLandmarkSpec.label}</strong>
            <span>{hoveredLandmarkSpec.english}</span>
          </div>
        )}

        {selectedLandmarkSpec && !selectedCandidate && (
          <article
            className="city-landmark-card"
            aria-label={`${selectedLandmarkSpec.label} 地標資訊`}
          >
            <span className="city-card__kicker">LANDMARK</span>
            <h2>{selectedLandmarkSpec.label}</h2>
            <span className="city-landmark-card__english">
              {selectedLandmarkSpec.english}
            </span>
            <p>{selectedLandmarkSpec.blurb}</p>
            <div className="city-landmark-card__actions">
              <button type="button" onClick={() => selectLandmark(null)}>
                返回城市
              </button>
            </div>
          </article>
        )}

        {selectedAdmin && !selectedCandidate && !selectedLandmarkSpec && (
          <article
            className="city-admin-card"
            aria-label={`${selectedAdmin.name} 行政區資訊`}
          >
            <span className="city-card__kicker">ADMIN DISTRICT</span>
            <h2>{selectedAdmin.name}</h2>
            <span className="city-admin-card__english">
              {selectedAdmin.nameEn}
            </span>
            <div className="city-admin-card__stats">
              <span>
                {TERRAIN_LABELS[selectedAdmin.terrain] ?? selectedAdmin.terrain}
              </span>
              <span>{selectedAdmin.areaKm2.toFixed(1)} km²</span>
              {selectedAdmin.remoteCount > 0 && (
                <span>含 {selectedAdmin.remoteCount} 處遠端轄區</span>
              )}
            </div>
            <p>
              相鄰行政區：
              {selectedAdminNeighbours.length
                ? selectedAdminNeighbours.join('、')
                : '無資料'}
            </p>
            <p className="city-admin-card__note">
              邊界依官方圖資簡化；城市量體與街景為藝術化示意。
            </p>
            <div className="city-landmark-card__actions">
              <button type="button" onClick={backToWorld}>
                回到全市
              </button>
            </div>
          </article>
        )}
      </div>

      <div className="city-hud">
        <div className="city-scene-label">
          <span className="city-scene-label__kicker">CURRENT DISTRICT</span>
          <strong id="scene-heading">
            {selectedDistrict?.name ?? '港都示範城市'}
          </strong>
          <span className="city-scene-label__zone">
            {worldMode
              ? selectedAdmin
                ? `行政區・${selectedAdmin.name}・藝術化量體`
                : '高雄市 38 行政區・全市視角'
              : activeZone === 'overview'
                ? '左營 × 楠梓・高細節區'
                : `${ZONE_LABELS[activeZone]}視角・藝術化城市模型`}
          </span>
        </div>

        {settingsOpen && (
          <section
            aria-label="顯示與體驗設定"
            className="city-settings"
            id="city-settings-panel"
          >
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
              精緻模式保留完整街道細節與樹木；較低階模式會減少裝飾物件以維持流暢度。
            </p>
          </section>
        )}

        <div className="city-dock">
          <div className="city-dock__bar">
            <fieldset className="city-zones">
              <legend className="sr-only">城市視角</legend>
              {(Object.keys(ZONE_LABELS) as SceneZone[]).map((zone) => (
                <button
                  aria-pressed={activeZone === zone}
                  className={activeZone === zone ? 'is-active' : ''}
                  key={zone}
                  type="button"
                  onClick={() => changeZone(zone)}
                >
                  {ZONE_LABELS[zone]}
                </button>
              ))}
            </fieldset>

            <button
              aria-controls="city-admin-tray"
              aria-expanded={dockPanel === 'admin'}
              className="city-dock__toggle"
              type="button"
              onClick={() =>
                setDockPanel((current) =>
                  current === 'admin' ? null : 'admin',
                )
              }
            >
              <span className="city-dock__toggle-kicker">行政區</span>
              <strong>{selectedAdmin?.shortName ?? '38 區'}</strong>
            </button>

            <button
              aria-controls="city-district-tray"
              aria-expanded={dockPanel === 'districts'}
              className="city-dock__toggle"
              type="button"
              onClick={() =>
                setDockPanel((current) =>
                  current === 'districts' ? null : 'districts',
                )
              }
            >
              <span className="city-dock__toggle-kicker">選區</span>
              <strong>{selectedDistrict?.name ?? '選擇選舉區'}</strong>
            </button>

            <button
              aria-controls="city-people-tray"
              ref={peopleToggleRef}
              aria-expanded={dockPanel === 'people'}
              className="city-dock__toggle"
              type="button"
              onClick={() =>
                setDockPanel((current) =>
                  current === 'people' ? null : 'people',
                )
              }
            >
              <span className="city-dock__toggle-kicker">人物</span>
              <strong>{visibleCandidates.length} 位</strong>
            </button>
          </div>

          {dockPanel === 'districts' && (
            <section
              aria-label="選舉區與選舉類型"
              className="city-tray city-tray--districts"
              id="city-district-tray"
            >
              <div className="city-tray__head">
                <div
                  aria-label="選舉類型"
                  className="segmented-control city-tabs"
                  role="tablist"
                >
                  {[
                    ['all', '全部'],
                    ['mayoral', '市長選'],
                    ['city-council', '市議選'],
                    ['indigenous-council', '原住民族'],
                    ['demo', '示範資料'],
                  ].map(([value, label]) => (
                    <button
                      aria-selected={electionFilter === value}
                      key={value}
                      role="tab"
                      type="button"
                      onClick={() => {
                        setElectionFilter(value as typeof electionFilter);
                        setSelectedCandidateSlug(null);
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <button
                  aria-label="關閉選區列表"
                  className="city-tray__close"
                  type="button"
                  onClick={() => setDockPanel(null)}
                >
                  ×
                </button>
              </div>
              <fieldset className="city-districts">
                <legend className="sr-only">選舉區</legend>
                {filteredDistricts.map((district) => (
                  <button
                    aria-current={
                      selectedDistrict?.slug === district.slug
                        ? 'true'
                        : undefined
                    }
                    className={
                      'district-button city-district' +
                      (selectedDistrict?.slug === district.slug
                        ? ' is-active'
                        : '')
                    }
                    key={district.id}
                    type="button"
                    onClick={() => selectDistrict(district.slug)}
                  >
                    <strong>{district.name}</strong>
                    <small>
                      {district.districtLabel}・
                      {district.isDemo ? '示範' : '官方切片'}
                    </small>
                  </button>
                ))}
              </fieldset>
            </section>
          )}

          {dockPanel === 'admin' && (
            <section
              aria-label="高雄市行政區"
              className="city-tray city-tray--admin"
              id="city-admin-tray"
            >
              <div className="city-tray__head">
                <h3>高雄市 38 行政區</h3>
                <span>官方界線・藝術化量體</span>
                <button
                  aria-label="關閉行政區列表"
                  className="city-tray__close"
                  type="button"
                  onClick={() => setDockPanel(null)}
                >
                  ×
                </button>
              </div>
              <div className="city-admin-grid">
                {ADMIN_SUMMARY.map((district) => (
                  <button
                    aria-current={
                      selectedAdminId === district.id ? 'true' : undefined
                    }
                    className={
                      'city-admin-chip' +
                      (selectedAdminId === district.id ? ' is-active' : '')
                    }
                    key={district.id}
                    type="button"
                    onClick={() => selectAdmin(district.id)}
                  >
                    <strong>{district.shortName}</strong>
                    <small>
                      {TERRAIN_LABELS[district.terrain] ?? district.terrain}
                    </small>
                  </button>
                ))}
              </div>
            </section>
          )}

          {dockPanel === 'people' && (
            <section
              aria-labelledby="accessible-candidates-heading"
              className="city-tray city-tray--people"
              id="city-people-tray"
            >
              <div className="city-tray__head city-candidates__head">
                <h3 id="accessible-candidates-heading">不用 3D 也能選擇人物</h3>
                <span>{visibleCandidates.length} 位</span>
                <button
                  aria-label="關閉人物列表"
                  className="city-tray__close"
                  type="button"
                  onClick={() => setDockPanel(null)}
                >
                  ×
                </button>
              </div>
              <div className="accessible-candidates__list city-candidates__list">
                {visibleCandidates.map((candidate) => (
                  <CandidateButton
                    active={candidate.candidacy.slug === selectedCandidateSlug}
                    candidate={candidate}
                    key={candidate.candidacy.id}
                    onSelect={selectCandidate}
                  />
                ))}
              </div>
            </section>
          )}
        </div>
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
              <span className="profile-badge">
                {selectedCandidate.person.isDemo === true
                  ? '虛構示範人物'
                  : '官方資料'}
              </span>
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
