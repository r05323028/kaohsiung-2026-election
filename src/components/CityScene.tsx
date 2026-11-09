import { OrbitControls } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import gsap from 'gsap';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import type { DetailLevel } from '../city/builder';
import {
  buildLandmarks,
  buildLotus,
  buildPondReeds,
  buildStaticCity,
  buildTrees,
  type Focus,
  LANDMARKS,
  type LandmarkId,
  type MergedParts,
  POND_OUTLINE,
  RIVER_POINTS,
} from '../city/layout';
import {
  createRippleTexture,
  MATERIALS,
  type MaterialKey,
} from '../city/materials';
import {
  type TreeKind,
  type TreeSpec,
  treeTemplates,
} from '../city/vegetation';
import {
  createWaterMaterial,
  lotusFlowerGeometry,
  lotusLeafGeometry,
  makeHarbour,
  makeLake,
  makePond,
  makeRiver,
} from '../city/water';
import type { PublicCandidateProfile } from '../data';
import { WORLD_BOUNDS } from '../world/geography';
import {
  HERO_HEIGHT_SCALE,
  HERO_KM_PER_UNIT,
  HERO_ORIGIN,
} from '../world/hero';
import { lonLatToWorld } from '../world/projection';
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
import WorldLayer from './WorldLayer';

export type SceneFocus = Focus & { key: string };

type CitySceneProps = {
  candidates: PublicCandidateProfile[];
  selectedCandidateSlug: string | null;
  selectedLandmark: LandmarkId | null;
  hoveredLandmark: LandmarkId | null;
  selectedAdminId: string | null;
  hoveredAdminId: string | null;
  followActorSlug: string | null;
  focus: SceneFocus;
  detail: DetailLevel;
  boundaryDebug?: boolean;
  reducedMotion: boolean;
  onSelectCandidate: (slug: string) => void;
  onSelectLandmark: (id: LandmarkId | null) => void;
  onHoverLandmark: (id: LandmarkId | null) => void;
  onSelectAdmin: (id: string | null) => void;
  onHoverAdmin: (id: string | null) => void;
  onManualCamera?: () => void;
  onReady?: () => void;
};

/* ------------------------------------------------------------------ */
/* Cached merged geometry: rebuilding is only needed when detail tier  */
/* changes, so orbiting and selecting stay cheap.                      */
/* ------------------------------------------------------------------ */

const cityCache = new Map<DetailLevel, MergedParts>();
const treeCache = new Map<DetailLevel, TreeSpec[]>();
const lotusCache = new Map<DetailLevel, ReturnType<typeof buildLotus>>();
const landmarkCache = new Map<
  DetailLevel,
  Array<{ id: LandmarkId; parts: MergedParts }>
>();

function staticCity(detail: DetailLevel) {
  let parts = cityCache.get(detail);
  if (!parts) {
    parts = buildStaticCity(detail);
    cityCache.set(detail, parts);
  }
  return parts;
}

function treeSpecs(detail: DetailLevel) {
  let specs = treeCache.get(detail);
  if (!specs) {
    const ratio = detail === 'high' ? 1 : detail === 'medium' ? 0.72 : 0.45;
    const all = [...buildTrees(), ...buildPondReeds()];
    specs = all.filter((_, index) => index % 100 < ratio * 100);
    treeCache.set(detail, specs);
  }
  return specs;
}

function lotusSpecs(detail: DetailLevel) {
  let specs = lotusCache.get(detail);
  if (!specs) {
    specs = buildLotus();
    if (detail !== 'high') {
      specs = {
        leaves: specs.leaves.filter((_, index) => index % 2 === 0),
        flowers: specs.flowers.filter((_, index) => index % 2 === 0),
      };
    }
    lotusCache.set(detail, specs);
  }
  return specs;
}

function landmarksFor(detail: DetailLevel) {
  let parts = landmarkCache.get(detail);
  if (!parts) {
    parts = buildLandmarks(detail);
    landmarkCache.set(detail, parts);
  }
  return parts;
}

/* ------------------------------------------------------------------ */
/* Small helpers                                                       */
/* ------------------------------------------------------------------ */

function MeshParts({ parts }: { parts: MergedParts }) {
  return (
    <>
      {parts.map((part) => (
        <mesh
          key={part.key}
          geometry={part.geometry}
          material={MATERIALS[part.key as MaterialKey]}
          castShadow
          receiveShadow
        />
      ))}
    </>
  );
}

function useCursor() {
  const active = useRef(false);
  useEffect(
    () => () => {
      if (active.current) document.body.style.cursor = '';
    },
    [],
  );
  return {
    enter() {
      active.current = true;
      document.body.style.cursor = 'pointer';
    },
    leave() {
      active.current = false;
      document.body.style.cursor = '';
    },
  };
}

/* ------------------------------------------------------------------ */
/* Instanced vegetation                                                */
/* ------------------------------------------------------------------ */

const canopyMaterial = new THREE.MeshStandardMaterial({
  color: '#ffffff',
  roughness: 0.95,
  flatShading: true,
});
const trunkMaterial = new THREE.MeshStandardMaterial({
  color: '#ffffff',
  roughness: 0.94,
});
const leafMaterial = new THREE.MeshStandardMaterial({
  color: '#86b571',
  roughness: 0.82,
  side: THREE.DoubleSide,
});
const flowerMaterial = new THREE.MeshStandardMaterial({
  color: '#f2a7bd',
  roughness: 0.7,
  emissive: '#c25c78',
  emissiveIntensity: 0.08,
});

function InstancedKind({ kind, specs }: { kind: TreeKind; specs: TreeSpec[] }) {
  const template = treeTemplates()[kind];
  const canopy = useRef<THREE.InstancedMesh>(null);
  const trunk = useRef<THREE.InstancedMesh>(null);

  useEffect(() => {
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    const colour = new THREE.Color();

    specs.forEach((spec, index) => {
      position.set(spec.x, 0.075, spec.z);
      quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), spec.rotY);
      scale.setScalar(spec.scale);
      matrix.compose(position, quaternion, scale);

      if (canopy.current) {
        canopy.current.setMatrixAt(index, matrix);
        canopy.current.setColorAt(index, colour.set(spec.tint));
      }
      if (trunk.current) {
        trunk.current.setMatrixAt(index, matrix);
        trunk.current.setColorAt(index, colour.set(template.trunkColor));
      }
    });

    if (canopy.current) {
      canopy.current.instanceMatrix.needsUpdate = true;
      if (canopy.current.instanceColor)
        canopy.current.instanceColor.needsUpdate = true;
      canopy.current.computeBoundingSphere();
    }
    if (trunk.current) {
      trunk.current.instanceMatrix.needsUpdate = true;
      if (trunk.current.instanceColor)
        trunk.current.instanceColor.needsUpdate = true;
      trunk.current.computeBoundingSphere();
    }
  }, [specs, template.trunkColor]);

  if (specs.length === 0) return null;

  return (
    <group>
      {template.trunk && (
        <instancedMesh
          ref={trunk}
          args={[template.trunk, trunkMaterial, specs.length]}
          castShadow
          receiveShadow
        />
      )}
      <instancedMesh
        ref={canopy}
        args={[template.canopy, canopyMaterial, specs.length]}
        castShadow
        receiveShadow
      />
    </group>
  );
}

function Trees({ detail }: { detail: DetailLevel }) {
  const specs = useMemo(() => treeSpecs(detail), [detail]);
  const groups = useMemo(() => {
    const map = new Map<TreeKind, TreeSpec[]>();
    for (const spec of specs) {
      const list = map.get(spec.kind) ?? [];
      list.push(spec);
      map.set(spec.kind, list);
    }
    return [...map.entries()];
  }, [specs]);

  return (
    <group>
      {groups.map(([kind, list]) => (
        <InstancedKind key={kind} kind={kind} specs={list} />
      ))}
    </group>
  );
}

function Lotus({ detail }: { detail: DetailLevel }) {
  const specs = useMemo(() => lotusSpecs(detail), [detail]);
  const leaves = useRef<THREE.InstancedMesh>(null);
  const flowers = useRef<THREE.InstancedMesh>(null);
  const leafGeometry = useMemo(() => lotusLeafGeometry(), []);
  const flowerGeometry = useMemo(() => lotusFlowerGeometry(), []);

  useEffect(() => {
    const dummy = new THREE.Object3D();
    specs.leaves.forEach((leaf, index) => {
      if (!leaves.current) return;
      dummy.position.set(leaf.x, 0.115, leaf.z);
      dummy.rotation.set(0, leaf.rotY, 0);
      dummy.scale.setScalar(leaf.scale);
      dummy.updateMatrix();
      leaves.current.setMatrixAt(index, dummy.matrix);
    });
    if (leaves.current) {
      leaves.current.instanceMatrix.needsUpdate = true;
      leaves.current.computeBoundingSphere();
    }
    specs.flowers.forEach((flower, index) => {
      if (!flowers.current) return;
      dummy.position.set(flower.x, 0.13, flower.z);
      dummy.rotation.set(0, index * 0.7, 0);
      dummy.scale.setScalar(flower.scale);
      dummy.updateMatrix();
      flowers.current.setMatrixAt(index, dummy.matrix);
    });
    if (flowers.current) {
      flowers.current.instanceMatrix.needsUpdate = true;
      flowers.current.computeBoundingSphere();
    }
  }, [specs]);

  return (
    <group>
      <instancedMesh
        ref={leaves}
        args={[leafGeometry, leafMaterial, specs.leaves.length]}
        receiveShadow
      />
      <instancedMesh
        ref={flowers}
        args={[flowerGeometry, flowerMaterial, specs.flowers.length]}
        castShadow
      />
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Water                                                               */
/* ------------------------------------------------------------------ */

function WaterLayer({
  detail,
  reducedMotion,
  onSelectLandmark,
  onHoverLandmark,
}: {
  detail: DetailLevel;
  reducedMotion: boolean;
  onSelectLandmark: (id: LandmarkId | null) => void;
  onHoverLandmark: (id: LandmarkId | null) => void;
}) {
  const ripple = useMemo(() => createRippleTexture(128), []);
  const cursor = useCursor();
  const water = useMemo(
    () => createWaterMaterial({ colour: '#69b9b4', opacity: 0.9, ripple }),
    [ripple],
  );
  const harbourWater = useMemo(
    () =>
      createWaterMaterial({
        colour: '#4f9da6',
        opacity: 0.94,
        ripple: detail === 'low' ? null : ripple,
      }),
    [detail, ripple],
  );

  const pond = useMemo(() => makePond(POND_OUTLINE, 0.1), []);
  const river = useMemo(() => makeRiver(RIVER_POINTS, 1.25, 0.095), []);
  const lake = useMemo(() => makeLake(11.6, -7.4, 1.9, 1.25, 0.095), []);
  const harbour = useMemo(() => makeHarbour(0, 13.75, 35, 4.3), []);

  useEffect(
    () => () => {
      water.dispose();
      harbourWater.dispose();
      ripple?.dispose();
      pond.water.dispose();
      pond.shore.dispose();
      river.water.dispose();
      river.bank.dispose();
      lake.water.dispose();
      lake.shore.dispose();
      harbour.dispose();
    },
    [water, harbourWater, ripple, pond, river, lake, harbour],
  );

  useFrame((state) => {
    if (reducedMotion || !ripple) return;
    const time = state.clock.elapsedTime;
    ripple.offset.set(time * 0.007, time * 0.0045);
  });

  const pondHandlers = {
    onClick: (event: { stopPropagation: () => void }) => {
      event.stopPropagation();
      onSelectLandmark('lotus-pond');
    },
    onPointerOver: (event: { stopPropagation: () => void }) => {
      event.stopPropagation();
      onHoverLandmark('lotus-pond');
      cursor.enter();
    },
    onPointerOut: () => {
      onHoverLandmark(null);
      cursor.leave();
    },
  };

  const riverHandlers = {
    onClick: (event: { stopPropagation: () => void }) => {
      event.stopPropagation();
      onSelectLandmark('houjing-river');
    },
    onPointerOver: (event: { stopPropagation: () => void }) => {
      event.stopPropagation();
      onHoverLandmark('houjing-river');
      cursor.enter();
    },
    onPointerOut: () => {
      onHoverLandmark(null);
      cursor.leave();
    },
  };

  return (
    <group>
      <mesh geometry={pond.shore} material={MATERIALS.sand} receiveShadow />
      <mesh geometry={pond.water} material={water} {...pondHandlers} />
      <mesh
        geometry={river.bank}
        material={MATERIALS.grassDark}
        receiveShadow
      />
      <mesh geometry={river.water} material={water} {...riverHandlers} />
      <mesh geometry={lake.shore} material={MATERIALS.sand} receiveShadow />
      <mesh geometry={lake.water} material={water} />
      <mesh geometry={harbour} material={harbourWater} />
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Landmarks                                                           */
/* ------------------------------------------------------------------ */

function LandmarkGroup({
  id,
  parts,
  active,
  selected,
  onSelect,
  onHover,
}: {
  id: LandmarkId;
  parts: MergedParts;
  active: boolean;
  selected: boolean;
  onSelect: (id: LandmarkId) => void;
  onHover: (id: LandmarkId | null) => void;
}) {
  const group = useRef<THREE.Group>(null);
  const pointerStart = useRef<{ x: number; y: number } | null>(null);
  const cursor = useCursor();

  useEffect(() => {
    if (!group.current) return undefined;
    const tween = gsap.to(group.current.position, {
      y: active ? 0.1 : 0,
      duration: 0.28,
      ease: 'power2.out',
    });
    return () => {
      tween.kill();
    };
  }, [active]);

  if (parts.length === 0) return null;

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: 3D selection is mirrored by HUD controls.
    <group
      ref={group}
      onPointerDown={(event) => {
        pointerStart.current = { x: event.clientX, y: event.clientY };
      }}
      onClick={(event) => {
        event.stopPropagation();
        const start = pointerStart.current;
        pointerStart.current = null;
        if (
          start &&
          Math.hypot(event.clientX - start.x, event.clientY - start.y) > 6
        ) {
          return;
        }
        onSelect(id);
      }}
      onPointerOver={(event) => {
        event.stopPropagation();
        onHover(id);
        cursor.enter();
      }}
      onPointerOut={() => {
        onHover(null);
        cursor.leave();
      }}
    >
      {selected && <SelectionRing id={id} />}
      <MeshParts parts={parts} />
    </group>
  );
}

const RINGED_LANDMARKS: LandmarkId[] = [
  'dragon-tiger-pagodas',
  'spring-autumn-pavilions',
  'old-city-gate',
];

function SelectionRing({ id }: { id: LandmarkId }) {
  const spec = LANDMARKS.find((item) => item.id === id);
  const mesh = useRef<THREE.Mesh>(null);
  useFrame((state) => {
    if (!mesh.current) return;
    const pulse = 1 + Math.sin(state.clock.elapsedTime * 2.2) * 0.035;
    mesh.current.scale.setScalar(pulse);
  });
  if (!spec || !RINGED_LANDMARKS.includes(id)) return null;
  const radius = Math.min(0.9, Math.max(0.55, spec.focus.radius * 0.22));
  return (
    <mesh
      ref={mesh}
      position={[spec?.x ?? 0, 0.145, spec?.z ?? 0]}
      rotation={[-Math.PI / 2, 0, 0]}
      renderOrder={2}
    >
      <ringGeometry args={[radius * 0.88, radius, 48]} />
      <meshBasicMaterial
        color="#e99679"
        transparent
        opacity={0.7}
        depthWrite={false}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}

function LandmarkHotspot({
  id,
  x,
  z,
  width,
  depth,
  onSelect,
  onHover,
}: {
  id: LandmarkId;
  x: number;
  z: number;
  width: number;
  depth: number;
  onSelect: (id: LandmarkId) => void;
  onHover: (id: LandmarkId | null) => void;
}) {
  const cursor = useCursor();
  const pointerStart = useRef<{ x: number; y: number } | null>(null);
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: mirrored by HUD controls.
    <mesh
      position={[x, 0.14, z]}
      onPointerDown={(event) => {
        pointerStart.current = { x: event.clientX, y: event.clientY };
      }}
      onClick={(event) => {
        event.stopPropagation();
        const start = pointerStart.current;
        pointerStart.current = null;
        if (
          start &&
          Math.hypot(event.clientX - start.x, event.clientY - start.y) > 6
        ) {
          return;
        }
        onSelect(id);
      }}
      onPointerOver={(event) => {
        event.stopPropagation();
        onHover(id);
        cursor.enter();
      }}
      onPointerOut={() => {
        onHover(null);
        cursor.leave();
      }}
    >
      <boxGeometry args={[width, 0.02, depth]} />
      <meshBasicMaterial
        transparent
        opacity={0}
        depthWrite={false}
        colorWrite={false}
      />
    </mesh>
  );
}

/* ------------------------------------------------------------------ */
/* Candidate markers                                                   */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/* Camera rig                                                          */
/* ------------------------------------------------------------------ */

/**
 * Opt-in renderer telemetry for the performance verification script.
 * Enable with ?perf=1. It reports frame rate and Three.js renderer totals
 * without affecting normal visits.
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
    (
      window as unknown as { __cityDiagnostics?: typeof diagnostics }
    ).__cityDiagnostics = diagnostics;
    value.frames = 0;
    value.elapsed = 0;
  });

  return null;
}

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

  const worldBounds = useMemo(() => {
    const southWest = lonLatToWorld(WORLD_BOUNDS.minLon, WORLD_BOUNDS.minLat);
    const northEast = lonLatToWorld(WORLD_BOUNDS.maxLon, WORLD_BOUNDS.maxLat);
    return {
      minX: Math.min(southWest.x, northEast.x),
      maxX: Math.max(southWest.x, northEast.x),
      minZ: Math.min(southWest.z, northEast.z),
      maxZ: Math.max(southWest.z, northEast.z),
    };
  }, []);

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
    if (!node || !controlsReady) return;
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
        // The user already moved the camera; do not pretend a later close can
        // restore the omitted pre-selection view.
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

    // Keep the viewpoint the user chose. Re-running the district focus here
    // would yank the camera back after they had taken manual control.
    if (manualExit) return;

    const followActor = followSlugRef.current
      ? getActor(followSlugRef.current)
      : null;
    const resolvedTargetX = followActor?.position.x ?? targetX;
    const resolvedTargetZ = followActor?.position.z ?? targetZ;
    const portrait = size.height > size.width * 1.15;
    const portraitShift =
      portrait && key.startsWith('zone-') && focusRadius > 12 ? 2.6 : 0;

    let target: THREE.Vector3;
    let endPosition: THREE.Vector3;
    let endZoom: number;

    if (restore) {
      target = restore.target.clone();
      endPosition = restore.position.clone();
      endZoom = restore.zoom;
    } else if (candidateFocus) {
      // Keep the map at its current scale and rotate only the target. The
      // old code recomputed zoom from a radius, which made a mayoral selection
      // jump from a district view out to the whole city.
      target = new THREE.Vector3(resolvedTargetX, targetY, resolvedTargetZ);
      const direction = cam.position.clone().sub(node.target).normalize();
      if (direction.lengthSq() < 0.001)
        direction.set(0.6, 1.4, 0.8).normalize();
      endPosition = target.clone().add(direction.multiplyScalar(42));
      endZoom = Math.max(3.2, Math.min(cam.zoom, 760));
    } else {
      target = new THREE.Vector3(
        resolvedTargetX,
        targetY,
        resolvedTargetZ + portraitShift,
      );
      const distance = 42;
      const portraitWorld = portrait && key.startsWith('world-overview');
      const direction = portraitWorld
        ? new THREE.Vector3(0.85, 1.7, -0.9).normalize()
        : portrait && focusRadius > 12
          ? new THREE.Vector3(0.62, 2.6, 0.62).normalize()
          : new THREE.Vector3(offsetX, offsetY, offsetZ).normalize();
      endPosition = target
        .clone()
        .add(direction.clone().multiplyScalar(distance));
      const portraitBoost = portrait ? (focusRadius > 12 ? 1.55 : 1.08) : 1;
      endZoom = Math.max(
        3.2,
        Math.min(
          600,
          (Math.min(size.width, size.height) / (2.15 * focusRadius)) *
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
      return;
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

    // Keep the orbit target inside the authoritative city bounds. Shift the
    // camera by the same delta so a pan cannot silently change the view angle.
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

/* ------------------------------------------------------------------ */
/* Scene composition                                                   */
/* ------------------------------------------------------------------ */

function CityWorld({
  candidates,
  selectedCandidateSlug,
  selectedLandmark,
  hoveredLandmark,
  selectedAdminId,
  hoveredAdminId,
  followActorSlug,
  focus,
  detail,
  boundaryDebug = false,
  reducedMotion,
  onSelectCandidate,
  onSelectLandmark,
  onHoverLandmark,
  onSelectAdmin,
  onHoverAdmin,
  onManualCamera,
}: Omit<CitySceneProps, 'onReady'>) {
  const city = useMemo(() => staticCity(detail), [detail]);
  const landmarks = useMemo(() => landmarksFor(detail), [detail]);
  const { camera, controls } = useThree();
  useEffect(() => {
    selectActor(selectedCandidateSlug);
    followActor(followActorSlug);
  }, [followActorSlug, selectedCandidateSlug]);
  const followedActor = followActorSlug ? getActor(followActorSlug) : null;
  const heroCenterX = followedActor?.position.x ?? focus.target[0];
  const heroCenterZ = followedActor?.position.z ?? focus.target[2];
  const heroDistance = Math.hypot(
    heroCenterX - HERO_ORIGIN.x,
    heroCenterZ - HERO_ORIGIN.z,
  );
  // Scene streaming follows the camera target's geography, not a candidate
  // movement role. A mayoral candidate standing in the hero tile must still
  // see the detailed district; only distance should decide whether it loads.
  const heroVisible = heroDistance < 3.2;
  useEffect(() => {
    const orbit = controls as unknown as {
      target: THREE.Vector3;
    } | null;
    const bridge = {
      advance: advanceSimulationSeconds,
      actors: getActors,
      snapshot: getSimulationSnapshot,
      stats: simulationStats,
      camera: () => ({
        position: camera.position.toArray() as [number, number, number],
        target: orbit?.target.toArray() as [number, number, number] | undefined,
        zoom: (camera as THREE.OrthographicCamera).zoom,
      }),
    };
    (
      window as unknown as { __kaohsiungWorld?: typeof bridge }
    ).__kaohsiungWorld = bridge;
    return () => {
      delete (window as unknown as { __kaohsiungWorld?: typeof bridge })
        .__kaohsiungWorld;
    };
  }, [camera, controls]);

  const shadowSize =
    detail === 'high' ? 2048 : detail === 'medium' ? 1024 : 512;

  return (
    <>
      <color attach="background" args={['#dfeff0']} />
      <fog
        attach="fog"
        args={['#dfeff0', heroVisible ? 55 : 110, heroVisible ? 105 : 340]}
      />

      <hemisphereLight args={['#fff4df', '#8cb3a1', 1.25]} />
      <ambientLight intensity={0.32} />
      <directionalLight
        position={[16, 26, 13]}
        intensity={2.15}
        color="#fff0d6"
        castShadow={detail !== 'low'}
        shadow-mapSize-width={shadowSize}
        shadow-mapSize-height={shadowSize}
        shadow-camera-left={-23}
        shadow-camera-right={23}
        shadow-camera-top={23}
        shadow-camera-bottom={-23}
        shadow-camera-near={1}
        shadow-camera-far={80}
        shadow-bias={-0.00035}
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

      <WorldLayer
        boundaryDebug={boundaryDebug}
        focusRadius={focus.radius}
        heroVisible={heroVisible}
        hoveredAdminId={hoveredAdminId}
        reducedMotion={reducedMotion}
        selectedAdminId={selectedAdminId}
        onHoverAdmin={onHoverAdmin}
        onSelectAdmin={onSelectAdmin}
      />

      {heroVisible && (
        <group
          position={[HERO_ORIGIN.x, 0.03, HERO_ORIGIN.z]}
          scale={[HERO_KM_PER_UNIT, HERO_HEIGHT_SCALE, HERO_KM_PER_UNIT]}
        >
          <MeshParts parts={city} />
          <Trees detail={detail} />
          <Lotus detail={detail} />
          <WaterLayer
            detail={detail}
            reducedMotion={reducedMotion}
            onSelectLandmark={onSelectLandmark}
            onHoverLandmark={onHoverLandmark}
          />

          {landmarks.map((landmark) => (
            <LandmarkGroup
              key={landmark.id}
              id={landmark.id}
              parts={landmark.parts}
              active={hoveredLandmark === landmark.id}
              selected={selectedLandmark === landmark.id}
              onSelect={onSelectLandmark}
              onHover={onHoverLandmark}
            />
          ))}

          <LandmarkHotspot
            id="zuoying-old-street"
            x={-8.7}
            z={3.8}
            width={10.4}
            depth={7.1}
            onSelect={onSelectLandmark}
            onHover={onHoverLandmark}
          />
          <LandmarkHotspot
            id="metropolitan-park"
            x={12.6}
            z={-9.2}
            width={6}
            depth={1.9}
            onSelect={onSelectLandmark}
            onHover={onHoverLandmark}
          />
          <LandmarkHotspot
            id="metropolitan-park"
            x={12.6}
            z={-4.2}
            width={6}
            depth={1.8}
            onSelect={onSelectLandmark}
            onHover={onHoverLandmark}
          />
          <LandmarkHotspot
            id="metropolitan-park"
            x={10.5}
            z={-6.4}
            width={1.6}
            depth={2.6}
            onSelect={onSelectLandmark}
            onHover={onHoverLandmark}
          />
          <LandmarkHotspot
            id="metropolitan-park"
            x={14.6}
            z={-6.4}
            width={1.6}
            depth={2.6}
            onSelect={onSelectLandmark}
            onHover={onHoverLandmark}
          />
          <LandmarkHotspot
            id="nanzih-neighborhood"
            x={5.2}
            z={4.5}
            width={3.3}
            depth={8.3}
            onSelect={onSelectLandmark}
            onHover={onHoverLandmark}
          />
          <LandmarkHotspot
            id="nanzih-neighborhood"
            x={12.6}
            z={4.5}
            width={5.8}
            depth={8.3}
            onSelect={onSelectLandmark}
            onHover={onHoverLandmark}
          />
        </group>
      )}

      <ActorLayer
        candidates={candidates}
        focusRadius={focus.radius}
        heroVisible={heroVisible}
        reducedMotion={reducedMotion}
        selectedCandidateSlug={selectedCandidateSlug}
        onSelectCandidate={onSelectCandidate}
      />
    </>
  );
}

export default function CityScene(props: CitySceneProps) {
  const { onReady, ...world } = props;
  return (
    <Canvas
      className="city-canvas"
      orthographic
      shadows
      dpr={props.detail === 'low' ? 1 : [1, 1.7]}
      camera={{ position: [30, 38, 30], zoom: 18, near: 0.1, far: 520 }}
      gl={{
        antialias: props.detail !== 'low',
        alpha: false,
        powerPreference: 'high-performance',
      }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.02;
        gl.shadowMap.type = THREE.PCFShadowMap;
        onReady?.();
      }}
      onPointerMissed={() => world.onSelectLandmark(null)}
    >
      <CityWorld {...world} />
    </Canvas>
  );
}
