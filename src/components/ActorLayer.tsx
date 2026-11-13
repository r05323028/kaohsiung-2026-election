import { Html, useGLTF } from '@react-three/drei';
import { type ThreeEvent, useFrame } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
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
  CANDIDATE_HEAD_TOP_WORLD,
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
/**
 * Anchor for the selected candidate's name badge: the crown of the normalized
 * chibi. The badge itself is lifted off this point in CSS pixels so the gap
 * stays constant at every orthographic zoom level.
 */
const MARKER_HEAD_TOP_Y = MARKER_GROUND_Y + CANDIDATE_HEAD_TOP_WORLD;
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

type OverviewPivot =
  | 'body'
  | 'head'
  | 'leftArm'
  | 'rightArm'
  | 'leftLeg'
  | 'rightLeg';

type OverviewPart = {
  pivot: OverviewPivot;
  role: OverviewRole;
  geometry: THREE.BufferGeometry;
  material: THREE.MeshStandardMaterial;
};

type ArticulatedOverview = {
  parts: OverviewPart[];
  scale: number;
  pivots: Record<OverviewPivot, THREE.Vector3>;
};

const OVERVIEW_PIVOT_ORDER: readonly OverviewPivot[] = [
  'body',
  'head',
  'leftArm',
  'rightArm',
  'leftLeg',
  'rightLeg',
];
const OVERVIEW_ROLE_ORDER: readonly OverviewRole[] = [
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
];

type GeometryComponent = {
  geometry: THREE.BufferGeometry;
  center: THREE.Vector3;
};

function positionKey(attribute: THREE.BufferAttribute, index: number): string {
  const scale = 1000;
  return (
    Math.round(attribute.getX(index) * scale) +
    '|' +
    Math.round(attribute.getY(index) * scale) +
    '|' +
    Math.round(attribute.getZ(index) * scale)
  );
}

/**
 * The overview asset was authored as merged material meshes. To animate the
 * limbs without regenerating the GLB, split each material mesh into connected
 * components and group them by the matching detailed-model pivot.
 */
function splitGeometryComponents(
  source: THREE.BufferGeometry,
): GeometryComponent[] {
  const geometry = source.index ? source.toNonIndexed() : source.clone();
  if (!geometry.attributes.normal) geometry.computeVertexNormals();
  const position = geometry.getAttribute('position') as THREE.BufferAttribute;
  const normal = geometry.getAttribute('normal') as THREE.BufferAttribute;
  const triangleCount = Math.floor(position.count / 3);
  const parent = Array.from({ length: triangleCount }, (_, index) => index);

  const find = (index: number): number => {
    let current = index;
    while (parent[current] !== current) {
      parent[current] = parent[parent[current]!]!;
      current = parent[current]!;
    }
    return current;
  };
  const union = (left: number, right: number) => {
    const a = find(left);
    const b = find(right);
    if (a !== b) parent[b] = a;
  };

  const firstTriangleByPosition = new Map<string, number>();
  for (let triangle = 0; triangle < triangleCount; triangle += 1) {
    for (let corner = 0; corner < 3; corner += 1) {
      const key = positionKey(position, triangle * 3 + corner);
      const owner = firstTriangleByPosition.get(key);
      if (owner === undefined) firstTriangleByPosition.set(key, triangle);
      else union(triangle, owner);
    }
  }

  const trianglesByComponent = new Map<number, number[]>();
  for (let triangle = 0; triangle < triangleCount; triangle += 1) {
    const root = find(triangle);
    const list = trianglesByComponent.get(root);
    if (list) list.push(triangle);
    else trianglesByComponent.set(root, [triangle]);
  }

  const components: GeometryComponent[] = [];
  for (const triangles of trianglesByComponent.values()) {
    const positions: number[] = [];
    const normals: number[] = [];
    const min = new THREE.Vector3(
      Number.POSITIVE_INFINITY,
      Number.POSITIVE_INFINITY,
      Number.POSITIVE_INFINITY,
    );
    const max = new THREE.Vector3(
      Number.NEGATIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
    );
    for (const triangle of triangles) {
      for (let corner = 0; corner < 3; corner += 1) {
        const index = triangle * 3 + corner;
        const x = position.getX(index);
        const y = position.getY(index);
        const z = position.getZ(index);
        positions.push(x, y, z);
        normals.push(
          normal.getX(index),
          normal.getY(index),
          normal.getZ(index),
        );
        min.min(new THREE.Vector3(x, y, z));
        max.max(new THREE.Vector3(x, y, z));
      }
    }
    const component = new THREE.BufferGeometry();
    component.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(positions, 3),
    );
    component.setAttribute(
      'normal',
      new THREE.Float32BufferAttribute(normals, 3),
    );
    component.computeBoundingSphere();
    components.push({
      geometry: component,
      center: min.clone().add(max).multiplyScalar(0.5),
    });
  }
  geometry.dispose();
  return components;
}

function classifyOverviewPivot(
  role: OverviewRole,
  center: THREE.Vector3,
  height: number,
  width: number,
): OverviewPivot {
  if (role === 'hair' || role === 'eye') return 'head';
  if (center.y > height * 0.6) {
    const isNeck =
      role === 'skin' &&
      center.y < height * 0.66 &&
      Math.abs(center.x) < width * 0.08;
    if (!isNeck) return 'head';
  }
  if (center.y > height * 0.36 && Math.abs(center.x) > width * 0.25) {
    return center.x < 0 ? 'leftArm' : 'rightArm';
  }
  if (center.y <= height * 0.36 && Math.abs(center.x) > width * 0.05) {
    return center.x < 0 ? 'leftLeg' : 'rightLeg';
  }
  return 'body';
}

function overviewPivots(minY: number): Record<OverviewPivot, THREE.Vector3> {
  return {
    body: new THREE.Vector3(0, 0, 0),
    head: new THREE.Vector3(0, 2.035 - minY, 0),
    leftArm: new THREE.Vector3(-0.373, 1.788 - minY, 0),
    rightArm: new THREE.Vector3(0.373, 1.788 - minY, 0),
    leftLeg: new THREE.Vector3(-0.152, 1.084 - minY, 0),
    rightLeg: new THREE.Vector3(0.152, 1.084 - minY, 0),
  };
}

function buildArticulatedOverview(source: THREE.Group): ArticulatedOverview {
  source.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(source);
  const height = Math.max(bounds.max.y - bounds.min.y, 0.0001);
  const width = Math.max(bounds.max.x - bounds.min.x, 0.0001);
  const pivots = overviewPivots(bounds.min.y);
  const groups = new Map<
    string,
    {
      pivot: OverviewPivot;
      role: OverviewRole;
      geometries: THREE.BufferGeometry[];
    }
  >();

  source.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const role = overviewRole(object.name);
    if (!role) return;
    const geometry = object.geometry.clone();
    geometry.applyMatrix4(object.matrixWorld);
    geometry.translate(0, -bounds.min.y, 0);
    for (const component of splitGeometryComponents(geometry)) {
      const pivot = classifyOverviewPivot(
        role,
        component.center,
        height,
        width,
      );
      const pivotPosition = pivots[pivot];
      component.geometry.translate(
        -pivotPosition.x,
        -pivotPosition.y,
        -pivotPosition.z,
      );
      const key = pivot + '|' + role;
      const group = groups.get(key);
      if (group) group.geometries.push(component.geometry);
      else groups.set(key, { pivot, role, geometries: [component.geometry] });
    }
    geometry.dispose();
  });

  const parts: OverviewPart[] = [];
  for (const { pivot, role, geometries } of groups.values()) {
    const geometry = mergeGeometries(geometries, false);
    if (!geometry) throw new Error('Unable to merge overview geometry');
    geometry.computeBoundingSphere();
    for (const item of geometries) item.dispose();
    parts.push({
      pivot,
      role,
      geometry,
      material: new THREE.MeshStandardMaterial({
        color: '#ffffff',
        roughness: 0.86,
        metalness: 0,
        side: THREE.DoubleSide,
      }),
    });
  }
  parts.sort(
    (a, b) =>
      OVERVIEW_PIVOT_ORDER.indexOf(a.pivot) -
        OVERVIEW_PIVOT_ORDER.indexOf(b.pivot) ||
      OVERVIEW_ROLE_ORDER.indexOf(a.role) - OVERVIEW_ROLE_ORDER.indexOf(b.role),
  );

  return {
    parts,
    scale: (CANDIDATE_MODEL_HEIGHT / height) * ACTOR_AVATAR_SCALE,
    pivots,
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
    () => buildArticulatedOverview(overviewGltf.scene),
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
  const overviewBlend = useRef(new Map<string, number>());
  const pivotMatrices = useMemo(() => {
    const matrices = {} as Record<OverviewPivot, THREE.Matrix4>;
    for (const pivot of OVERVIEW_PIVOT_ORDER) {
      const position = overview.pivots[pivot];
      matrices[pivot] = new THREE.Matrix4().makeTranslation(
        position.x,
        position.y,
        position.z,
      );
    }
    return matrices;
  }, [overview.pivots]);
  const partMatrix = useRef(new THREE.Matrix4());
  const pivotRotation = useRef(new THREE.Matrix4());
  const partEuler = useRef(new THREE.Euler());

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
      const candidate = candidateBySlug.get(actor.slug);
      return candidate
        ? isCandidateVisibleInFocus(candidate, visibilityScope)
        : false;
    });
    return list;
  }, [actors, candidateBySlug, visibilityScope]);
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
      visibleSlugSet.has(selected.slug) &&
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
        anchor?: 'center' | 'head',
      ) => { x: number; y: number } | null;
      __kaohsiungActorOverviewLimb?: (
        pivot: OverviewPivot,
        slug: string,
      ) => number[] | null;
      __kaohsiungActorDetailLimb?: (
        pivot: Exclude<OverviewPivot, 'body'>,
        slug: string,
      ) => number[] | null;
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
    bridge.__kaohsiungActorOverviewLimb = (
      pivot: OverviewPivot,
      slug: string,
    ) => {
      if (fullAvatarSlugs.current.has(slug)) return null;
      const index = visibleActors.findIndex((actor) => actor.slug === slug);
      const partIndex = overview.parts.findIndex(
        (part) => part.pivot === pivot,
      );
      const bodyIndex = overview.parts.findIndex(
        (part) => part.pivot === 'body',
      );
      const mesh = overviewRefs.current[partIndex];
      const bodyMesh = overviewRefs.current[bodyIndex];
      if (index < 0 || partIndex < 0 || !mesh || !bodyMesh) return null;
      const matrix = new THREE.Matrix4();
      const body = new THREE.Matrix4();
      mesh.getMatrixAt(index, matrix);
      bodyMesh.getMatrixAt(index, body);
      return [...body.invert().multiply(matrix).elements];
    };
    bridge.__kaohsiungActorDetailLimb = (
      pivot: Exclude<OverviewPivot, 'body'>,
      slug: string,
    ) => {
      const group = avatarRefs.current.get(slug);
      if (!group) return null;
      const nodeName =
        pivot === 'head'
          ? 'HeadPivot'
          : pivot === 'leftArm'
            ? 'LeftArmPivot'
            : pivot === 'rightArm'
              ? 'RightArmPivot'
              : pivot === 'leftLeg'
                ? 'LeftLegPivot'
                : 'RightLegPivot';
      const node = group.getObjectByName(nodeName);
      if (!node) return null;
      return [node.rotation.x, node.rotation.y, node.rotation.z];
    };
    bridge.__kaohsiungActorScreenPosition = (
      slug: string,
      anchor: 'center' | 'head' = 'center',
    ) => {
      if (!visibleSlugSet.has(slug)) return null;
      const actor = actorBySlug.get(slug);
      const camera = cameraRef.current;
      const canvas = canvasRef.current;
      if (!actor || !camera || !canvas) return null;
      const pose = actorRenderPose(actor, frameAlpha.current);
      const y =
        anchor === 'head'
          ? MARKER_HEAD_TOP_Y
          : MARKER_GROUND_Y +
            CANDIDATE_MODEL_HEIGHT * CANDIDATE_ACTOR_SCALE * 0.55;
      const screen = new THREE.Vector3(
        pose.position.x,
        y,
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
      delete bridge.__kaohsiungActorOverviewLimb;
      delete bridge.__kaohsiungActorDetailLimb;
    };
  }, [actorBySlug, overview, visibleActors, visibleSlugSet, visibilityScope]);

  const selectedActor =
    selectedCandidateSlug && visibleSlugSet.has(selectedCandidateSlug)
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
    // authoritative for navigation and electoral checks. The overview asset
    // has no pivots, so each connected component is rotated around the
    // matching detailed-model pivot.
    const blendSpeed = Math.min(1, delta * 9);
    visibleActors.forEach((actor, index) => {
      const pose = actorRenderPose(actor, alpha);
      const hidden = avatars.has(actor.slug);
      const targetBlend = pose.walking && !reducedMotion ? 1 : 0;
      const currentBlend = overviewBlend.current.get(actor.slug) ?? 0;
      const blend = currentBlend + (targetBlend - currentBlend) * blendSpeed;
      overviewBlend.current.set(actor.slug, blend);

      helper.position.set(pose.position.x, MARKER_GROUND_Y, pose.position.z);
      helper.rotation.set(0, pose.heading, 0);
      helper.scale.setScalar(hidden ? 0 : overview.scale);
      helper.updateMatrix();

      const phase = pose.walkPhase * Math.PI * 4;
      const stride = Math.sin(phase) * 0.5 * blend;
      const armSwing = Math.cos(phase) * 0.34 * blend;
      const idle = 1 - blend;
      const headYaw = Math.sin(state.clock.elapsedTime * 0.55) * 0.05 * idle;
      const headPitch = Math.sin(state.clock.elapsedTime * 0.8) * 0.025 * idle;

      for (
        let partIndex = 0;
        partIndex < overview.parts.length;
        partIndex += 1
      ) {
        const part = overview.parts[partIndex]!;
        let rotationX = 0;
        let rotationY = 0;
        if (part.pivot === 'leftArm') rotationX = -armSwing;
        else if (part.pivot === 'rightArm') rotationX = armSwing;
        else if (part.pivot === 'leftLeg') rotationX = stride;
        else if (part.pivot === 'rightLeg') rotationX = -stride;
        else if (part.pivot === 'head') {
          rotationX = headPitch;
          rotationY = headYaw;
        }
        partMatrix.current
          .copy(helper.matrix)
          .multiply(pivotMatrices[part.pivot]);
        if (rotationX !== 0 || rotationY !== 0) {
          pivotRotation.current.makeRotationFromEuler(
            partEuler.current.set(rotationX, rotationY, 0),
          );
          partMatrix.current.multiply(pivotRotation.current);
        }
        meshes[partIndex]?.setMatrixAt(index, partMatrix.current);
      }

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

    const selected =
      selectedCandidateSlug && visibleSlugSet.has(selectedCandidateSlug)
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
        MARKER_HEAD_TOP_Y,
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
          key={part.pivot + '-' + part.role}
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
            position={[0, 0, 0]}
            style={{ pointerEvents: 'none', display: 'flex' }}
            zIndexRange={[8, 0]}
          >
            <span className="actor-name-tag is-world">
              {selectedActor.displayName}
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
