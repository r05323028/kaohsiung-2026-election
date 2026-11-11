import { OrbitControls } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import gsap from 'gsap';
import {
  Suspense,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import type { PublicCandidateProfile } from '../data';
import type { CandidateVisibilityScope } from '../world/candidate-visibility';
import { HEX_TILES, HEX_WORLD_BOUNDS, type HexFocus } from '../world/hex';
import { HEX_LANDMARKS } from '../world/hex-landmarks';
import { HEX_ROAD_GRAPH } from '../world/road-graph';
import {
  advanceSimulationSeconds,
  followActor,
  getActor,
  getActors,
  getSimulationSnapshot,
  selectActor,
  simulationStats,
} from '../world/simulation';
import ActorLayer from './ActorLayer';
import HexWorldLayer from './HexWorldLayer';

export type DetailLevel = 'low' | 'medium' | 'high';
export type SceneFocus = HexFocus & { key: string };

type CitySceneProps = {
  candidates: PublicCandidateProfile[];
  selectedCandidateSlug: string | null;
  selectedAdminId: string | null;
  hoveredAdminId: string | null;
  followActorSlug: string | null;
  visibilityScope: CandidateVisibilityScope;
  focus: SceneFocus;
  detail: DetailLevel;
  reducedMotion: boolean;
  onSelectCandidate: (slug: string) => void;
  onSelectAdmin: (id: string | null) => void;
  onHoverAdmin: (id: string | null) => void;
  onManualCamera?: () => void;
  onReady?: () => void;
};

/* ------------------------------------------------------------------ */
/* Camera rig                                                          */
/* ------------------------------------------------------------------ */

type CameraView = {
  position: THREE.Vector3;
  target: THREE.Vector3;
  zoom: number;
};

function CameraRig({
  focus,
  reducedMotion,
  followActorSlug,
  onManualCamera,
}: {
  focus: SceneFocus;
  reducedMotion: boolean;
  followActorSlug: string | null;
  onManualCamera: (() => void) | undefined;
}) {
  const { camera, size } = useThree();
  const controls = useRef<OrbitControlsImpl | null>(null);
  const [controlsReady, setControlsReady] = useState(false);
  const timeline = useRef<gsap.core.Timeline | null>(null);
  const followTarget = useRef(new THREE.Vector3());
  const followSlugRef = useRef(followActorSlug);
  const onManualRef = useRef(onManualCamera);
  const lastFocusKey = useRef<string | null>(null);
  const savedView = useRef<CameraView | null>(null);
  const manualSinceCandidate = useRef(false);
  const manualDuringCandidate = useRef(false);
  const interactionStart = useRef<CameraView | null>(null);
  const focusKey = focus.key;
  const [targetX, targetY, targetZ] = focus.target;
  const [offsetX, offsetY, offsetZ] = focus.offset;
  const focusRadius = focus.radius;
  followSlugRef.current = followActorSlug;
  onManualRef.current = onManualCamera;

  const worldBounds = HEX_WORLD_BOUNDS;

  // A real drag or wheel is a deliberate camera move: stop following so the
  // selected character does not fight the user for the viewport.
  useEffect(() => {
    const node = controls.current;
    if (!node || !controlsReady) return undefined;
    const cam = camera as THREE.OrthographicCamera;
    const begin = () => {
      interactionStart.current = {
        position: cam.position.clone(),
        target: node.target.clone(),
        zoom: cam.zoom,
      };
      timeline.current?.kill();
      timeline.current = null;
    };
    const end = () => {
      const start = interactionStart.current;
      interactionStart.current = null;
      if (!start) return;
      const moved =
        cam.position.distanceTo(start.position) > 0.015 ||
        Math.abs(cam.zoom - start.zoom) > 0.25;
      if (!moved) return;
      manualSinceCandidate.current = true;
      if (lastFocusKey.current?.startsWith('candidate-')) {
        manualDuringCandidate.current = true;
      }
      onManualRef.current?.();
    };
    node.addEventListener('start', begin);
    node.addEventListener('end', end);
    return () => {
      node.removeEventListener('start', begin);
      node.removeEventListener('end', end);
    };
  }, [camera, controlsReady]);

  useLayoutEffect(() => {
    const node = controls.current;
    if (!node || !controlsReady) return undefined;
    const cam = camera as THREE.OrthographicCamera;
    const key = focusKey;
    const candidateFocus = key.startsWith('candidate-');
    const wasCandidate =
      lastFocusKey.current?.startsWith('candidate-') ?? false;

    if (candidateFocus) {
      if (!wasCandidate) {
        savedView.current = {
          position: cam.position.clone(),
          target: node.target.clone(),
          zoom: cam.zoom,
        };
        manualSinceCandidate.current = false;
        manualDuringCandidate.current = false;
      } else if (manualSinceCandidate.current) {
        savedView.current = null;
        manualSinceCandidate.current = false;
      }
    }

    const manualExit =
      !candidateFocus && wasCandidate && manualDuringCandidate.current;
    const restore =
      !candidateFocus &&
      wasCandidate &&
      !manualSinceCandidate.current &&
      savedView.current
        ? savedView.current
        : null;
    if (!candidateFocus && wasCandidate) {
      savedView.current = null;
      manualSinceCandidate.current = false;
      manualDuringCandidate.current = false;
    }
    lastFocusKey.current = key;

    if (manualExit) return undefined;

    const followActor = followSlugRef.current
      ? getActor(followSlugRef.current)
      : null;
    const resolvedTargetX = followActor?.position.x ?? targetX;
    const resolvedTargetZ = followActor?.position.z ?? targetZ;
    const portrait = size.height > size.width * 1.15;

    let target: THREE.Vector3;
    let endPosition: THREE.Vector3;
    let endZoom: number;

    if (restore) {
      target = restore.target.clone();
      endPosition = restore.position.clone();
      endZoom = restore.zoom;
    } else if (candidateFocus) {
      // Keep the current map scale when a profile opens. Only the target moves,
      // so selecting a walking candidate never yanks the camera outward.
      target = new THREE.Vector3(resolvedTargetX, targetY, resolvedTargetZ);
      const direction = cam.position.clone().sub(node.target).normalize();
      if (direction.lengthSq() < 0.001) {
        direction.set(0.6, 1.4, 0.8).normalize();
      }
      endPosition = target.clone().add(direction.multiplyScalar(42));
      endZoom = Math.max(3.2, Math.min(cam.zoom, 760));
    } else {
      target = new THREE.Vector3(resolvedTargetX, targetY, resolvedTargetZ);
      const distance = 42;
      const portraitWorld = portrait && key.startsWith('world-overview');
      const direction = portraitWorld
        ? new THREE.Vector3(0.85, 1.7, -0.9).normalize()
        : new THREE.Vector3(offsetX, offsetY, offsetZ).normalize();
      endPosition = target
        .clone()
        .add(direction.clone().multiplyScalar(distance));
      const portraitBoost = portrait ? (focusRadius > 12 ? 1.55 : 1.08) : 1;
      endZoom = Math.max(
        3.2,
        Math.min(
          600,
          (Math.min(size.width, size.height) /
            (key.startsWith('world-overview') ? 1.65 : 2.15) /
            focusRadius) *
            portraitBoost,
        ),
      );
      if (portraitWorld) {
        endZoom = Math.min(endZoom, size.width / 66.5, size.height / 150);
      }
    }

    timeline.current?.kill();
    node.enabled = true;

    if (reducedMotion) {
      cam.position.copy(endPosition);
      cam.zoom = endZoom;
      cam.updateProjectionMatrix();
      node.target.copy(target);
      node.update();
      return undefined;
    }

    const state = {
      x: cam.position.x,
      y: cam.position.y,
      z: cam.position.z,
      zoom: cam.zoom,
      tx: node.target.x,
      ty: node.target.y,
      tz: node.target.z,
    };

    // A slow software renderer can drop below 1 fps. GSAP's default lag
    // smoothing advances only 33 ms per frame then, stretching a 1.15 s camera
    // move into a minute. Camera motion is wall-clock based, so opt out.
    gsap.ticker.lagSmoothing(0);
    const activeControls = node;
    timeline.current = gsap
      .timeline({
        defaults: { duration: 1.15, ease: 'power3.inOut' },
        onUpdate: () => {
          cam.position.set(state.x, state.y, state.z);
          cam.zoom = state.zoom;
          cam.updateProjectionMatrix();
          activeControls.target.set(state.tx, state.ty, state.tz);
          activeControls.update();
        },
      })
      .to(state, {
        x: endPosition.x,
        y: endPosition.y,
        z: endPosition.z,
        zoom: endZoom,
        tx: target.x,
        ty: target.y,
        tz: target.z,
      });

    return () => {
      timeline.current?.kill();
      activeControls.enabled = true;
    };
  }, [
    camera,
    controlsReady,
    focusKey,
    focusRadius,
    offsetX,
    offsetY,
    offsetZ,
    reducedMotion,
    size.height,
    size.width,
    targetX,
    targetY,
    targetZ,
  ]);

  useFrame((_, frameDelta) => {
    const node = controls.current;
    if (!node) return;
    if (!manualSinceCandidate.current && followSlugRef.current) {
      if (!timeline.current?.isActive()) {
        const actor = getActor(followSlugRef.current);
        if (actor) {
          const lookAhead = actor.state === 'walking' ? 0.22 : 0;
          followTarget.current.set(
            actor.position.x + Math.sin(actor.heading) * lookAhead,
            node.target.y,
            actor.position.z + Math.cos(actor.heading) * lookAhead,
          );
          const desired = followTarget.current.sub(node.target);
          const smoothing = 1 - Math.exp(-5.5 * Math.min(frameDelta, 0.1));
          const delta = desired.multiplyScalar(smoothing);
          if (delta.lengthSq() > 1e-8) {
            camera.position.add(delta);
            node.target.add(delta);
            node.update();
          }
        }
      }
    }

    // Keep the orbit target inside the hex world. Shift the camera by the same
    // delta so panning can never change the view angle.
    const current = node.target;
    const clampedX = Math.max(
      worldBounds.minX + 1,
      Math.min(worldBounds.maxX - 1, current.x),
    );
    const clampedZ = Math.max(
      worldBounds.minZ + 1,
      Math.min(worldBounds.maxZ - 1, current.z),
    );
    if (clampedX !== current.x || clampedZ !== current.z) {
      camera.position.x += clampedX - current.x;
      camera.position.z += clampedZ - current.z;
      current.x = clampedX;
      current.z = clampedZ;
      node.update();
    }
  });

  return (
    <OrbitControls
      ref={(node) => {
        controls.current = node;
        if (node) setControlsReady(true);
      }}
      makeDefault
      enableDamping
      dampingFactor={0.1}
      enableRotate={false}
      enablePan
      screenSpacePanning={false}
      mouseButtons={{
        LEFT: THREE.MOUSE.PAN,
        MIDDLE: THREE.MOUSE.DOLLY,
        RIGHT: THREE.MOUSE.PAN,
      }}
      touches={{
        ONE: THREE.TOUCH.PAN,
        TWO: THREE.TOUCH.DOLLY_PAN,
      }}
      zoomToCursor
      panSpeed={0.9}
      minZoom={3.2}
      maxZoom={760}
      minPolarAngle={0.32}
      maxPolarAngle={Math.PI / 2.25}
    />
  );
}

/**
 * Opt-in renderer telemetry for the performance verification script.
 * Enable with ?perf=1.
 */
function SceneDiagnostics() {
  const gl = useThree((state) => state.gl);
  const size = useThree((state) => state.size);
  const enabled = useMemo(
    () =>
      typeof window !== 'undefined' &&
      new URLSearchParams(window.location.search).get('perf') === '1',
    [],
  );
  const sample = useRef({ frames: 0, elapsed: 0 });

  useFrame((_, delta) => {
    if (!enabled) return;
    const value = sample.current;
    value.frames += 1;
    value.elapsed += delta;
    if (value.elapsed < 1) return;
    const diagnostics = {
      fps: Math.round((value.frames / value.elapsed) * 10) / 10,
      drawCalls: gl.info.render.calls,
      triangles: gl.info.render.triangles,
      geometries: gl.info.memory.geometries,
      textures: gl.info.memory.textures,
      programs: gl.info.programs?.length ?? 0,
      dpr: gl.getPixelRatio(),
      viewport: { width: size.width, height: size.height },
      sampledAt: new Date().toISOString(),
    };
    // SAFETY: the diagnostics object is an optional browser test hook.
    (
      window as unknown as { __cityDiagnostics?: typeof diagnostics }
    ).__cityDiagnostics = diagnostics;
    value.frames = 0;
    value.elapsed = 0;
  });

  return null;
}

/* ------------------------------------------------------------------ */
/* Scene composition                                                   */
/* ------------------------------------------------------------------ */

function CityWorld({
  candidates,
  selectedCandidateSlug,
  selectedAdminId,
  hoveredAdminId,
  followActorSlug,
  visibilityScope,
  focus,
  detail,
  reducedMotion,
  onSelectCandidate,
  onSelectAdmin,
  onHoverAdmin,
  onManualCamera,
}: Omit<CitySceneProps, 'onReady'>) {
  const { camera, controls } = useThree();
  useEffect(() => {
    selectActor(selectedCandidateSlug);
    followActor(followActorSlug);
  }, [followActorSlug, selectedCandidateSlug]);

  useEffect(() => {
    // SAFETY: the default OrbitControls instance exposes camera position state.
    const orbit = controls as unknown as {
      target: THREE.Vector3;
    } | null;
    const bridge = {
      advance: advanceSimulationSeconds,
      actors: getActors,
      snapshot: getSimulationSnapshot,
      stats: simulationStats,
      heroVisible: () => false,
      scene: () => ({
        district: null,
        landmarks: [] as string[],
        zuoying: false,
        nanzih: false,
      }),
      hoveredLandmark: () => null,
      hex: () => ({
        tiles: HEX_TILES.length,
        landmarks: HEX_LANDMARKS.length,
        roadNodes: HEX_ROAD_GRAPH.nodes.size,
        roadEdges: HEX_ROAD_GRAPH.edges.size,
        connectors: HEX_ROAD_GRAPH.connectorEdgeIds.length,
      }),
      camera: () => ({
        position: camera.position.toArray() as [number, number, number],
        target: orbit?.target.toArray() as [number, number, number] | undefined,
        zoom: (camera as THREE.OrthographicCamera).zoom,
      }),
    };
    // SAFETY: this is the documented browser test bridge, not app state.
    (
      window as unknown as { __kaohsiungWorld?: typeof bridge }
    ).__kaohsiungWorld = bridge;
    return () => {
      // SAFETY: remove only the optional bridge installed above.
      delete (window as unknown as { __kaohsiungWorld?: typeof bridge })
        .__kaohsiungWorld;
    };
  }, [camera, controls]);

  const shadowSize =
    detail === 'high' ? 2048 : detail === 'medium' ? 1024 : 512;
  const showLabels = detail !== 'low' && focus.radius > 13;

  return (
    <>
      <color attach="background" args={['#dff1f0']} />
      <fog attach="fog" args={['#dff1f0', 88, 270]} />

      <hemisphereLight args={['#fff4df', '#8cb3a1', 1.25]} />
      <ambientLight intensity={0.4} />
      <directionalLight
        position={[22, 34, 18]}
        intensity={2.05}
        color="#fff0d6"
        castShadow={detail !== 'low'}
        shadow-mapSize-width={shadowSize}
        shadow-mapSize-height={shadowSize}
        shadow-camera-left={-34}
        shadow-camera-right={34}
        shadow-camera-top={38}
        shadow-camera-bottom={-38}
        shadow-camera-near={1}
        shadow-camera-far={160}
        shadow-bias={-0.00035}
        shadow-radius={2.5}
        shadow-normalBias={0.025}
      />
      <directionalLight
        position={[-18, 12, -12]}
        intensity={0.4}
        color="#c3dded"
      />
      <directionalLight
        position={[4, 8, 24]}
        intensity={0.28}
        color="#ffe9cf"
      />

      <CameraRig
        focus={focus}
        followActorSlug={followActorSlug}
        reducedMotion={reducedMotion}
        onManualCamera={onManualCamera}
      />
      <SceneDiagnostics />

      <HexWorldLayer
        selectedAdminId={selectedAdminId}
        hoveredAdminId={hoveredAdminId}
        showLabels={showLabels}
        onSelectAdmin={onSelectAdmin}
        onHoverAdmin={onHoverAdmin}
      />

      <Suspense fallback={null}>
        <ActorLayer
          candidates={candidates}
          focus={focus}
          reducedMotion={reducedMotion}
          selectedCandidateSlug={selectedCandidateSlug}
          visibilityScope={visibilityScope}
          onSelectCandidate={onSelectCandidate}
        />
      </Suspense>
    </>
  );
}

export default function CityScene(props: CitySceneProps) {
  const { onReady, ...world } = props;
  return (
    <Canvas
      className="city-canvas"
      data-scene-mode="hex"
      orthographic
      shadows
      dpr={props.detail === 'low' ? 1 : [1, 1.7]}
      camera={{ position: [30, 31, 30], zoom: 18, near: 0.1, far: 520 }}
      gl={{
        antialias: props.detail !== 'low',
        alpha: false,
        powerPreference: 'high-performance',
      }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.06;
        gl.shadowMap.type = THREE.PCFShadowMap;
        onReady?.();
      }}
      onPointerMissed={() => world.onSelectAdmin(null)}
    >
      <CityWorld {...world} />
    </Canvas>
  );
}
