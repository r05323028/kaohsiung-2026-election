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
  CANDIDATE_ANCHOR,
  candidateMarkerPosition,
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
import type { CandidateProfile } from '../data';
import CharacterAvatar from './CharacterAvatar';

export type SceneFocus = Focus & { key: string };

type CitySceneProps = {
  candidates: CandidateProfile[];
  selectedCandidateSlug: string | null;
  selectedLandmark: LandmarkId | null;
  hoveredLandmark: LandmarkId | null;
  focus: SceneFocus;
  detail: DetailLevel;
  reducedMotion: boolean;
  onSelectCandidate: (slug: string) => void;
  onSelectLandmark: (id: LandmarkId | null) => void;
  onHoverLandmark: (id: LandmarkId | null) => void;
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

function SelectionRing({ id }: { id: LandmarkId }) {
  const spec = LANDMARKS.find((item) => item.id === id);
  const mesh = useRef<THREE.Mesh>(null);
  const radius = spec
    ? Math.min(2.5, Math.max(0.85, spec.focus.radius * 0.48))
    : 1;
  useFrame((state) => {
    if (!mesh.current) return;
    const pulse = 1 + Math.sin(state.clock.elapsedTime * 2.2) * 0.035;
    mesh.current.scale.setScalar(pulse);
  });
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

function CandidateMarkers({
  candidates,
  selectedSlug,
  reducedMotion,
  onSelect,
}: {
  candidates: CandidateProfile[];
  selectedSlug: string | null;
  reducedMotion: boolean;
  onSelect: (slug: string) => void;
}) {
  return (
    <group>
      <mesh
        position={[CANDIDATE_ANCHOR.x, 0.088, CANDIDATE_ANCHOR.z]}
        rotation={[-Math.PI / 2, 0, 0]}
        receiveShadow
      >
        <circleGeometry args={[2.35, 48]} />
        <meshStandardMaterial color="#efe3cd" roughness={0.95} />
      </mesh>
      {candidates.map((candidate, index) => {
        const position = candidateMarkerPosition(index, candidates.length);
        const selected = candidate.candidacy.slug === selectedSlug;
        return (
          <group key={candidate.candidacy.slug} position={position}>
            <mesh position={[0, 0.006, 0]} rotation={[-Math.PI / 2, 0, 0]}>
              <circleGeometry args={[selected ? 0.29 : 0.23, 24]} />
              <meshBasicMaterial
                color={selected ? '#e99679' : candidate.visual.palette.top}
                transparent
                opacity={selected ? 0.95 : 0.82}
                depthWrite={false}
              />
            </mesh>
            <mesh position={[0, 0.008, 0]} rotation={[-Math.PI / 2, 0, 0]}>
              <ringGeometry
                args={[selected ? 0.36 : 0.3, selected ? 0.4 : 0.33, 28]}
              />
              <meshBasicMaterial
                color="#fff9f0"
                transparent
                opacity={selected ? 0.9 : 0.55}
                depthWrite={false}
                side={THREE.DoubleSide}
              />
            </mesh>
            {selected && (
              <mesh position={[0, 1.28, 0]} rotation={[Math.PI / 2, 0, 0]}>
                <torusGeometry args={[0.2, 0.022, 8, 28]} />
                <meshBasicMaterial color="#e99679" />
              </mesh>
            )}
            <CharacterAvatar
              candidate={candidate}
              selected={selected}
              reducedMotion={reducedMotion}
              onSelect={onSelect}
              position={[0, 0.02, 0]}
              rotation={0.35}
            />
          </group>
        );
      })}
    </group>
  );
}

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

function CameraRig({
  focus,
  reducedMotion,
}: {
  focus: SceneFocus;
  reducedMotion: boolean;
}) {
  const { camera, size } = useThree();
  const controls = useRef<OrbitControlsImpl | null>(null);
  const [controlsReady, setControlsReady] = useState(false);
  const timeline = useRef<gsap.core.Timeline | null>(null);
  const focusKey = focus.key;
  const [targetX, targetY, targetZ] = focus.target;
  const [offsetX, offsetY, offsetZ] = focus.offset;
  const focusRadius = focus.radius;

  useLayoutEffect(() => {
    if (!controls.current) return;
    void focusKey;
    void controlsReady;
    const cam = camera as THREE.OrthographicCamera;
    const target = new THREE.Vector3(targetX, targetY, targetZ);
    const distance = 42;
    const portrait = size.height > size.width * 1.15;
    // A steeper portrait view turns the wide diorama into a legible map
    // instead of a thin strip floating in empty sky.
    const direction =
      portrait && focusRadius > 12
        ? new THREE.Vector3(0.62, 2.6, 0.62).normalize()
        : new THREE.Vector3(offsetX, offsetY, offsetZ).normalize();
    const endPosition = target
      .clone()
      .add(direction.clone().multiplyScalar(distance));
    // Portrait phones get a modest cover crop so the diorama reads as a
    // world to explore rather than a small island in a sea of empty sky.
    const portraitBoost = portrait ? (focusRadius > 12 ? 1.32 : 1.1) : 1;
    const endZoom = Math.max(
      10,
      Math.min(
        150,
        (Math.min(size.width, size.height) / (2.15 * focusRadius)) *
          portraitBoost,
      ),
    );

    timeline.current?.kill();
    controls.current.enabled = false;

    if (reducedMotion) {
      cam.position.copy(endPosition);
      cam.zoom = endZoom;
      cam.updateProjectionMatrix();
      controls.current.target.copy(target);
      controls.current.update();
      controls.current.enabled = true;
      return;
    }

    const state = {
      x: cam.position.x,
      y: cam.position.y,
      z: cam.position.z,
      zoom: cam.zoom,
      tx: controls.current.target.x,
      ty: controls.current.target.y,
      tz: controls.current.target.z,
    };

    const activeControls = controls.current;
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
        onComplete: () => {
          activeControls.enabled = true;
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
    targetX,
    targetY,
    targetZ,
    reducedMotion,
    size.height,
    size.width,
  ]);

  return (
    <OrbitControls
      ref={(node) => {
        controls.current = node;
        if (node) setControlsReady(true);
      }}
      makeDefault
      enableDamping
      dampingFactor={0.08}
      minZoom={9}
      maxZoom={170}
      minPolarAngle={0.32}
      maxPolarAngle={Math.PI / 2.25}
      enablePan
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
  focus,
  detail,
  reducedMotion,
  onSelectCandidate,
  onSelectLandmark,
  onHoverLandmark,
}: Omit<CitySceneProps, 'onReady'>) {
  const city = useMemo(() => staticCity(detail), [detail]);
  const landmarks = useMemo(() => landmarksFor(detail), [detail]);

  const shadowSize =
    detail === 'high' ? 2048 : detail === 'medium' ? 1024 : 512;

  return (
    <>
      <color attach="background" args={['#dfeff0']} />
      <fog attach="fog" args={['#dfeff0', 55, 105]} />

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

      <CameraRig focus={focus} reducedMotion={reducedMotion} />
      <SceneDiagnostics />

      <group>
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

        <CandidateMarkers
          candidates={candidates}
          selectedSlug={selectedCandidateSlug}
          reducedMotion={reducedMotion}
          onSelect={onSelectCandidate}
        />
      </group>
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
      camera={{ position: [30, 38, 30], zoom: 18, near: 0.1, far: 180 }}
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
