import { Html, useGLTF } from '@react-three/drei';
import { type ThreeEvent, useFrame } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import type { PublicCandidateProfile } from '../data';
import { withBase } from '../utils/paths';
import {
  type CandidateVisibilityScope,
  isCandidateVisibleInFocus,
} from '../world/candidate-visibility';
import { HEX_TILES, type HexFocus } from '../world/hex';
import {
  actorRenderPose,
  advanceSimulationFrame,
  getActors,
  type WorldActor,
} from '../world/simulation';
import CharacterAvatar from './CharacterAvatar';
import {
  CANDIDATE_ACTOR_SCALE,
  CANDIDATE_LOD,
  CANDIDATE_MODEL,
  CANDIDATE_MODEL_HEIGHT,
  type CandidateLod,
  candidateScreenHeight,
  colorForOverviewRole,
  type OverviewRole,
  overviewRole,
  resolveCandidateLod,
} from './candidate-model';
import { characterStyle } from './character-style';

type ActorLayerProps = {
  candidates: PublicCandidateProfile[];
  selectedCandidateSlug: string | null;
  focus: HexFocus;
  visibilityScope: CandidateVisibilityScope;
  reducedMotion: boolean;
  onSelectCandidate: (slug: string) => void;
};

/** World-space height of a full avatar (~0.46 units, toy scale). */
export const ACTOR_AVATAR_SCALE = CANDIDATE_ACTOR_SCALE;
const MARKER_GROUND_Y = 0.47;
// District focus can gather every candidate in a district. Ten full GLB
// bodies keep the scene inside the software-WebGL test budget while the
// overview GLB still renders a complete figure for everyone else.
const MAX_DETAILED_ACTORS = 10;
const SHADOW_GROUND_Y = 0.452;
const SHADOW_GEOMETRY = new THREE.CircleGeometry(1, 18);
SHADOW_GEOMETRY.rotateX(-Math.PI / 2);
const SHADOW_MATERIAL = new THREE.MeshBasicMaterial({
  color: '#20312f',
  transparent: true,
  opacity: 0.2,
  depthWrite: false,
});

type OverviewPart = {
  role: OverviewRole;
  geometry: THREE.BufferGeometry;
  material: THREE.MeshStandardMaterial;
};

function buildOverviewParts(source: THREE.Group): {
  parts: OverviewPart[];
  scale: number;
} {
  source.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(source);
  const height = Math.max(bounds.max.y - bounds.min.y, 0.0001);
  const parts: OverviewPart[] = [];
  source.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const role = overviewRole(object.name);
    if (!role) return;
    if (!object.geometry.attributes.normal) {
      object.geometry.computeVertexNormals();
    }
    const geometry = object.geometry.clone();
    geometry.applyMatrix4(object.matrixWorld);
    geometry.translate(0, -bounds.min.y, 0);
    geometry.computeBoundingSphere();
    const material = new THREE.MeshStandardMaterial({
      color: '#ffffff',
      roughness: 0.86,
      metalness: 0,
      side: THREE.DoubleSide,
    });
    parts.push({ role, geometry, material });
  });
  parts.sort((a, b) => {
    const order = (role: OverviewRole) =>
      [
        'skin',
        'shirt',
        'jacket',
        'shoeToe',
        'shoe',
        'sole',
        'trousers',
        'cuff',
        'eye',
        'hair',
      ].indexOf(role);
    return order(a.role) - order(b.role);
  });
  return {
    parts,
    scale: (CANDIDATE_MODEL_HEIGHT / height) * ACTOR_AVATAR_SCALE,
  };
}

function focusAdminIds(focus: HexFocus): Set<string> {
  if (focus.radius > 17) return new Set();
  const ids = new Set<string>();
  for (const tile of HEX_TILES) {
    const distance = Math.hypot(
      tile.center.x - focus.target[0],
      tile.center.z - focus.target[2],
    );
    if (distance <= focus.radius + 0.1) ids.add(tile.adminId);
  }
  return ids;
}

export default function ActorLayer({
  candidates,
  selectedCandidateSlug,
  focus,
  visibilityScope,
  reducedMotion,
  onSelectCandidate,
}: ActorLayerProps) {
  const actors = getActors();
  const overviewGltf = useGLTF(withBase(CANDIDATE_MODEL.overviewPath));
  const overview = useMemo(
    () => buildOverviewParts(overviewGltf.scene),
    [overviewGltf.scene],
  );
  const overviewRefs = useRef<Array<THREE.InstancedMesh | null>>([]);
  const dummy = useRef(new THREE.Object3D());
  const shadowDummy = useRef(new THREE.Object3D());
  const shadowRef = useRef<THREE.InstancedMesh>(null);
  const selectedRing = useRef<THREE.Mesh>(null);
  const selectedTag = useRef<THREE.Group>(null);
  const avatarRefs = useRef(new Map<string, THREE.Group>());
  const fullAvatarSlugs = useRef(new Set<string>());
  const drag = useRef<{ x: number; y: number } | null>(null);
  const lodRef = useRef<CandidateLod>('overview');
  const [lod, setLod] = useState<CandidateLod>('overview');
  const screenPxRef = useRef(0);
  const frameAlpha = useRef(0);
  const cameraRef = useRef<THREE.Camera | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const avatarMotion = useRef(
    new Map<string, { walkPhase: number; walking: boolean }>(),
  );

  const candidateBySlug = useMemo(
    () =>
      new Map(
        candidates.map((candidate) => [candidate.candidacy.slug, candidate]),
      ),
    [candidates],
  );
  const actorBySlug = useMemo(
    () => new Map(actors.map((actor) => [actor.slug, actor])),
    [actors],
  );
  const visibleActors = useMemo(() => {
    const list = actors.filter((actor) => {
      if (actor.slug === selectedCandidateSlug) return true;
      const candidate = candidateBySlug.get(actor.slug);
      return candidate
        ? isCandidateVisibleInFocus(candidate, visibilityScope)
        : false;
    });
    return list;
  }, [actors, candidateBySlug, selectedCandidateSlug, visibilityScope]);
  const actorStyles = useMemo(
    () =>
      new Map(
        actors.flatMap((actor) => {
          const candidate = candidateBySlug.get(actor.slug);
          return candidate
            ? ([[actor.slug, characterStyle(candidate)]] as const)
            : [];
        }),
      ),
    [actors, candidateBySlug],
  );
  const focusedAdminIds = useMemo(() => focusAdminIds(focus), [focus]);
  const showFocusedRegion = focusedAdminIds.size > 0;
  const visibleSlugSet = useMemo(
    () => new Set(visibleActors.map((actor) => actor.slug)),
    [visibleActors],
  );

  const avatarActors = useMemo(() => {
    const distance = (actor: WorldActor) =>
      Math.hypot(
        actor.position.x - focus.target[0],
        actor.position.z - focus.target[2],
      );
    const list =
      lod === 'detail'
        ? actors.filter((actor) => {
            if (!candidateBySlug.has(actor.slug)) return false;
            if (!visibleSlugSet.has(actor.slug)) return false;
            if (!showFocusedRegion) return true;
            return (
              actor.currentAdminId !== null &&
              focusedAdminIds.has(actor.currentAdminId)
            );
          })
        : [];
    const selected = selectedCandidateSlug
      ? actors.find((actor) => actor.slug === selectedCandidateSlug)
      : undefined;
    if (
      selected &&
      candidateBySlug.has(selected.slug) &&
      !list.includes(selected)
    ) {
      list.push(selected);
    }
    return list
      .sort(
        (a, b) =>
          Number(b.slug === selectedCandidateSlug) -
            Number(a.slug === selectedCandidateSlug) ||
          distance(a) - distance(b),
      )
      .slice(0, MAX_DETAILED_ACTORS);
  }, [
    actors,
    candidateBySlug,
    focus.target,
    focusedAdminIds,
    lod,
    selectedCandidateSlug,
    showFocusedRegion,
    visibleSlugSet,
  ]);

  useEffect(
    () => () => {
      for (const part of overview.parts) {
        part.geometry.dispose();
        part.material.dispose();
      }
    },
    [overview],
  );

  useEffect(() => {
    // SAFETY: these are the documented browser test bridges, not app state.
    const bridge = window as unknown as {
      __kaohsiungActorScale?: (slug: string) => number | null;
      __kaohsiungActorMarker?: () => { uuid: string; count: number } | null;
      __kaohsiungActorLod?: () => {
        mode: CandidateLod;
        detailCount: number;
        overviewCount: number;
        screenPx: number;
        enterPx: number;
        exitPx: number;
        model: 'glb';
      };
      __kaohsiungCandidateVisibility?: () => {
        scope: CandidateVisibilityScope['kind'];
        count: number;
        slugs: string[];
      };
      __kaohsiungActorPose?: (slug: string) => {
        x: number;
        z: number;
        heading: number;
        walkPhase: number;
        walking: boolean;
      } | null;
      __kaohsiungActorInstance?: (index: number) => string | null;
      __kaohsiungActorScreenPosition?: (
        slug: string,
      ) => { x: number; y: number } | null;
    };
    bridge.__kaohsiungActorScale = (slug: string) =>
      avatarRefs.current.get(slug)?.scale.x ?? null;
    bridge.__kaohsiungActorMarker = () => {
      const marker = overviewRefs.current[0];
      return marker ? { uuid: marker.uuid, count: marker.count } : null;
    };
    bridge.__kaohsiungActorLod = () => ({
      mode: lodRef.current,
      detailCount: fullAvatarSlugs.current.size,
      overviewCount: Math.max(
        0,
        visibleActors.length - fullAvatarSlugs.current.size,
      ),
      screenPx: Number(screenPxRef.current.toFixed(2)),
      enterPx: CANDIDATE_LOD.detailEnterPx,
      exitPx: CANDIDATE_LOD.detailExitPx,
      model: 'glb',
    });
    bridge.__kaohsiungCandidateVisibility = () => ({
      scope: visibilityScope.kind,
      count: visibleActors.length,
      slugs: visibleActors.map((actor) => actor.slug),
    });
    bridge.__kaohsiungActorPose = (slug: string) => {
      const actor = actorBySlug.get(slug);
      if (!actor) return null;
      const pose = actorRenderPose(actor, frameAlpha.current);
      return {
        x: pose.position.x,
        z: pose.position.z,
        heading: pose.heading,
        walkPhase: pose.walkPhase,
        walking: pose.walking,
      };
    };
    bridge.__kaohsiungActorInstance = (index: number) =>
      visibleActors[index]?.slug ?? null;
    bridge.__kaohsiungActorScreenPosition = (slug: string) => {
      if (!visibleSlugSet.has(slug)) return null;
      const actor = actorBySlug.get(slug);
      const camera = cameraRef.current;
      const canvas = canvasRef.current;
      if (!actor || !camera || !canvas) return null;
      const pose = actorRenderPose(actor, frameAlpha.current);
      const screen = new THREE.Vector3(
        pose.position.x,
        MARKER_GROUND_Y + CANDIDATE_MODEL_HEIGHT * CANDIDATE_ACTOR_SCALE * 0.55,
        pose.position.z,
      ).project(camera);
      const rect = canvas.getBoundingClientRect();
      return {
        x: rect.left + (screen.x * 0.5 + 0.5) * rect.width,
        y: rect.top + (-screen.y * 0.5 + 0.5) * rect.height,
      };
    };
    return () => {
      delete bridge.__kaohsiungActorScale;
      delete bridge.__kaohsiungActorMarker;
      delete bridge.__kaohsiungActorLod;
      delete bridge.__kaohsiungCandidateVisibility;
      delete bridge.__kaohsiungActorPose;
      delete bridge.__kaohsiungActorInstance;
      delete bridge.__kaohsiungActorScreenPosition;
    };
  }, [actorBySlug, visibleActors, visibleSlugSet, visibilityScope]);

  const selectedActor = selectedCandidateSlug
    ? actorBySlug.get(selectedCandidateSlug)
    : undefined;

  useLayoutEffect(() => {
    fullAvatarSlugs.current = new Set(avatarActors.map((actor) => actor.slug));
  }, [avatarActors]);

  useLayoutEffect(() => {
    if (overview.parts.length === 0) return;
    const meshes = overviewRefs.current;
    if (meshes.some((mesh) => !mesh)) return;
    visibleActors.forEach((actor, index) => {
      const style = actorStyles.get(actor.slug);
      if (!style) return;
      overview.parts.forEach((part, partIndex) => {
        const mesh = meshes[partIndex];
        if (!mesh) return;
        mesh.setColorAt(
          index,
          new THREE.Color(colorForOverviewRole(part.role, style)),
        );
      });
    });
    for (const mesh of meshes) {
      if (!mesh) continue;
      mesh.count = visibleActors.length;
      mesh.instanceColor?.setUsage(THREE.DynamicDrawUsage);
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }, [visibleActors, actorStyles, overview]);

  const motionFor = (
    actor: WorldActor,
  ): { walkPhase: number; walking: boolean } => {
    let motion = avatarMotion.current.get(actor.slug);
    if (!motion) {
      motion = {
        walkPhase: actor.walkPhase,
        walking: actor.state === 'walking',
      };
      avatarMotion.current.set(actor.slug, motion);
    }
    return motion;
  };

  useFrame((state, delta) => {
    cameraRef.current = state.camera;
    canvasRef.current = state.gl.domElement;
    const alpha = advanceSimulationFrame(delta);
    frameAlpha.current = alpha;
    const renderedPx = candidateScreenHeight(
      (state.camera as THREE.OrthographicCamera).zoom,
    );
    const nextLod = resolveCandidateLod(renderedPx, lodRef.current);
    if (nextLod !== lodRef.current) {
      lodRef.current = nextLod;
      setLod(nextLod);
    }
    screenPxRef.current = renderedPx;

    const helper = dummy.current;
    const avatars = fullAvatarSlugs.current;
    const meshes = overviewRefs.current;
    const shadows = shadowRef.current;
    const shadowHelper = shadowDummy.current;

    // The overview GLB is instanced but matrices are updated every rendered
    // frame. Pose interpolation is visual-only; actor.position stays
    // authoritative for navigation and electoral checks.
    visibleActors.forEach((actor, index) => {
      const pose = actorRenderPose(actor, alpha);
      const hidden = avatars.has(actor.slug);
      helper.position.set(pose.position.x, MARKER_GROUND_Y, pose.position.z);
      helper.rotation.set(0, pose.heading, 0);
      helper.scale.setScalar(hidden ? 0 : overview.scale);
      helper.updateMatrix();
      for (const mesh of meshes) mesh?.setMatrixAt(index, helper.matrix);

      shadowHelper.position.set(
        pose.position.x,
        SHADOW_GROUND_Y,
        pose.position.z,
      );
      const size = hidden ? 0.2 : 0.16;
      shadowHelper.scale.set(size, 1, size * 0.68);
      shadowHelper.updateMatrix();
      shadows?.setMatrixAt(index, shadowHelper.matrix);
    });
    for (const mesh of meshes) {
      if (!mesh) continue;
      mesh.count = visibleActors.length;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.instanceMatrix.needsUpdate = true;
    }
    if (shadows) {
      shadows.count = visibleActors.length;
      shadows.instanceMatrix.needsUpdate = true;
    }

    const selected = selectedCandidateSlug
      ? actorBySlug.get(selectedCandidateSlug)
      : undefined;
    const selectedPose = selected ? actorRenderPose(selected, alpha) : null;
    if (selectedRing.current && selectedPose) {
      selectedRing.current.position.set(
        selectedPose.position.x,
        0.478,
        selectedPose.position.z,
      );
      selectedRing.current.visible = true;
    } else if (selectedRing.current) {
      selectedRing.current.visible = false;
    }
    if (selectedTag.current && selectedPose) {
      selectedTag.current.position.set(
        selectedPose.position.x,
        0.8,
        selectedPose.position.z,
      );
    }

    for (const [slug, group] of avatarRefs.current) {
      const actor = actorBySlug.get(slug);
      if (!actor) {
        group.visible = false;
        continue;
      }
      const pose = actorRenderPose(actor, alpha);
      const motion = motionFor(actor);
      motion.walkPhase = pose.walkPhase;
      motion.walking = pose.walking;
      group.visible = true;
      group.position.set(pose.position.x, MARKER_GROUND_Y, pose.position.z);
      group.rotation.y = pose.heading;
    }
  });

  const markerHandlers = {
    onPointerDown: (event: ThreeEvent<PointerEvent>) => {
      event.stopPropagation();
      drag.current = { x: event.clientX, y: event.clientY };
    },
    onPointerUp: (event: ThreeEvent<PointerEvent>) => {
      event.stopPropagation();
      const start = drag.current;
      drag.current = null;
      if (
        !start ||
        Math.hypot(event.clientX - start.x, event.clientY - start.y) > 6
      )
        return;
      if (event.instanceId === undefined) return;
      const actor = visibleActors[event.instanceId];
      if (actor) onSelectCandidate(actor.slug);
    },
  };

  return (
    <group>
      <instancedMesh
        ref={shadowRef}
        args={[SHADOW_GEOMETRY, SHADOW_MATERIAL, actors.length]}
        frustumCulled={false}
        renderOrder={2}
        raycast={() => {}}
      />
      {overview.parts.map((part, index) => (
        <instancedMesh
          key={part.role}
          ref={(node) => {
            overviewRefs.current[index] = node;
          }}
          args={[part.geometry, part.material, actors.length]}
          frustumCulled={false}
          renderOrder={4}
          {...markerHandlers}
        />
      ))}
      <mesh ref={selectedRing} rotation={[-Math.PI / 2, 0, 0]} renderOrder={5}>
        <ringGeometry args={[0.24, 0.34, 28]} />
        <meshBasicMaterial
          color="#e99679"
          transparent
          opacity={0.9}
          depthWrite={false}
          depthTest={false}
          side={THREE.DoubleSide}
        />
      </mesh>

      {selectedActor && (
        <group ref={selectedTag}>
          <Html
            center
            position={[0, 0, 0]}
            style={{ pointerEvents: 'none' }}
            zIndexRange={[8, 0]}
          >
            <span className="actor-name-tag is-world">
              {selectedActor.displayName}
              <small>模擬移動</small>
            </span>
          </Html>
        </group>
      )}

      {avatarActors.map((actor) => {
        const candidate = candidateBySlug.get(actor.slug);
        if (!candidate) return null;
        return (
          <group
            key={actor.slug}
            ref={(node) => {
              if (node) avatarRefs.current.set(actor.slug, node);
              else avatarRefs.current.delete(actor.slug);
            }}
            position={[actor.position.x, MARKER_GROUND_Y, actor.position.z]}
            scale={ACTOR_AVATAR_SCALE}
          >
            <CharacterAvatar
              candidate={candidate}
              selected={actor.slug === selectedCandidateSlug}
              reducedMotion={reducedMotion}
              walking={actor.state === 'walking'}
              walkPhase={actor.walkPhase}
              motion={motionFor(actor)}
              onSelect={onSelectCandidate}
              position={[0, 0, 0]}
              rotation={0}
            />
          </group>
        );
      })}
    </group>
  );
}
