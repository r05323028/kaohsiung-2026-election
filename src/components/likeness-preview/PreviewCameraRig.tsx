import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { getActor } from '../../world/simulation';
import type { LikenessPreviewView } from './store';

type PreviewView = Exclude<LikenessPreviewView, 'city'>;

/**
 * Development-only camera poses for inspecting a head kit inside the live city.
 *
 * Framing is measured from the previewed actor's actual geometry, not from
 * hard-coded offsets, so the rig survives generator changes to head size. Two
 * boxes are measured separately:
 *
 * - the base head meshes, which are still in the graph after a kit installs
 *   (the installer only sets `visible = false`), so they stay a stable size
 *   reference that does not change when the kit mounts or unmounts;
 * - the meshes under the `HeadKit` node, so a kit larger than the base head is
 *   never cropped.
 *
 * The frame is the union of both and the centre always comes from the base
 * head, which is what makes the framing identical whether the base head or the
 * kit is drawn. Hidden base geometry is therefore measured on purpose: it is
 * the reference, never something the viewer sees.
 */
const KIT_NAME = 'HeadKit';

// The `side` view shows the actor's +X profile. Blender's canonical side render
// uses -90 degrees, so the two are mirror images of one another; the preview
// keeps +90 because it matches the actor's own heading convention.
const YAW: Record<PreviewView, number> = {
  front: 0,
  'three-quarter-left': Math.PI / 4,
  'three-quarter-right': -Math.PI / 4,
  side: Math.PI / 2,
};

const CAMERA_DISTANCE = 8;
const ELEVATION = 0.22;
/** Padding around the measured head so ears and glasses never touch the edge. */
const FRAME_MARGIN = 1.35;
/** Used only before the candidate model has mounted. */
const FALLBACK_HEAD_CENTER_Y = 0.78;
const FALLBACK_HEAD_SIZE = 0.2;
const MIN_FRAME = 0.001;

type PreviewCameraRigProps = { slug: string; view: PreviewView };

function isUnderKit(node: THREE.Object3D, root: THREE.Object3D): boolean {
  let parent = node.parent;
  while (parent && parent !== root) {
    if (parent.name === KIT_NAME) return true;
    parent = parent.parent;
  }
  return false;
}

/**
 * Stores the world-space bounds of every mesh on one side of the `HeadKit`
 * boundary. Geometry bounds are transformed by `matrixWorld` instead of using
 * `Box3.setFromObject`, because that helper measures the whole subtree and
 * would fold the kit and the hidden base head into the same box.
 */
function measureMeshes(
  target: THREE.Box3,
  root: THREE.Object3D,
  wantKit: boolean,
  scratch: THREE.Box3,
) {
  root.traverse((node) => {
    if (isUnderKit(node, root) !== wantKit) return;
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;
    if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
    const bounds = mesh.geometry.boundingBox;
    if (!bounds) return;
    target.union(scratch.copy(bounds).applyMatrix4(mesh.matrixWorld));
  });
}

function PreviewCameraRig({ slug, view }: PreviewCameraRigProps) {
  const camera = useThree((state) => state.camera) as THREE.OrthographicCamera;
  const scene = useThree((state) => state.scene);
  const controls = useThree(
    (state) => state.controls,
  ) as OrbitControlsImpl | null;
  const centre = useRef(new THREE.Vector3());
  const baseBox = useRef(new THREE.Box3());
  const kitBox = useRef(new THREE.Box3());
  const frameBox = useRef(new THREE.Box3());
  const scratch = useRef(new THREE.Box3());
  const point = useRef(new THREE.Vector3());
  const direction = useRef(new THREE.Vector3());

  useFrame(() => {
    const actor = getActor(slug);
    if (!actor) return;

    const actorGroup = scene.getObjectByName(`actor-${slug}`) ?? null;
    const head = actorGroup?.getObjectByName('HeadPivot') ?? null;

    baseBox.current.makeEmpty();
    kitBox.current.makeEmpty();
    if (head) {
      measureMeshes(baseBox.current, head, false, scratch.current);
      measureMeshes(kitBox.current, head, true, scratch.current);
    }

    frameBox.current.makeEmpty();
    if (!baseBox.current.isEmpty()) frameBox.current.union(baseBox.current);
    if (!kitBox.current.isEmpty()) frameBox.current.union(kitBox.current);

    let frameWidth = FALLBACK_HEAD_SIZE;
    let frameHeight = FALLBACK_HEAD_SIZE;

    if (!frameBox.current.isEmpty()) {
      if (!baseBox.current.isEmpty()) baseBox.current.getCenter(centre.current);
      else kitBox.current.getCenter(centre.current);
    } else {
      centre.current.set(
        actor.position.x,
        FALLBACK_HEAD_CENTER_Y,
        actor.position.z,
      );
    }

    const yaw = actor.heading + YAW[view];
    direction.current.set(Math.sin(yaw), ELEVATION, Math.cos(yaw)).normalize();
    camera.position
      .copy(centre.current)
      .addScaledVector(direction.current, CAMERA_DISTANCE);
    camera.lookAt(centre.current);
    camera.updateMatrixWorld();
    camera.matrixWorldInverse.copy(camera.matrixWorld).invert();

    if (!frameBox.current.isEmpty()) {
      // Measure in camera space. A world-axis-aligned box would report the box
      // depth as screen width once the camera turns, so a margin applied to it
      // could still crop the head at side and three-quarter views.
      const { min, max } = frameBox.current;
      let left = Number.POSITIVE_INFINITY;
      let right = Number.NEGATIVE_INFINITY;
      let bottom = Number.POSITIVE_INFINITY;
      let top = Number.NEGATIVE_INFINITY;
      for (let index = 0; index < 8; index += 1) {
        point.current.set(
          index & 1 ? max.x : min.x,
          index & 2 ? max.y : min.y,
          index & 4 ? max.z : min.z,
        );
        point.current.applyMatrix4(camera.matrixWorldInverse);
        left = Math.min(left, point.current.x);
        right = Math.max(right, point.current.x);
        bottom = Math.min(bottom, point.current.y);
        top = Math.max(top, point.current.y);
      }
      frameWidth = Math.max(right - left, MIN_FRAME) * FRAME_MARGIN;
      frameHeight = Math.max(top - bottom, MIN_FRAME) * FRAME_MARGIN;
    }

    const frustumWidth = Math.abs(camera.right - camera.left);
    const frustumHeight = Math.abs(camera.top - camera.bottom);
    camera.zoom =
      frustumWidth > 0 && frustumHeight > 0
        ? Math.min(frustumWidth / frameWidth, frustumHeight / frameHeight)
        : 1;
    camera.updateProjectionMatrix();
    if (controls) controls.target.copy(centre.current);
  });

  useEffect(() => {
    // SAFETY: browser test bridge in the style of the other scene bridges.
    const bridge = window as unknown as {
      __likenessPreview?: () => {
        slug: string;
        view: PreviewView;
        kitAttached: boolean;
        kitCount: number;
      };
    };
    bridge.__likenessPreview = () => {
      let kitCount = 0;
      scene.traverse((node) => {
        if (node.name === KIT_NAME) kitCount += 1;
      });
      return {
        slug,
        view,
        kitAttached: Boolean(
          scene.getObjectByName(`actor-${slug}`)?.getObjectByName(KIT_NAME),
        ),
        // Any other candidate rendering a kit would mean the preview leaks past
        // its pinned actor.
        kitCount,
      };
    };
    return () => {
      delete bridge.__likenessPreview;
    };
  }, [scene, slug, view]);

  return null;
}

/**
 * Production builds never mount the preview camera: `import.meta.env.DEV` is
 * inlined as `false`, so the inner rig is unreachable dead code after bundling.
 */
export default function DevLikenessPreviewCamera(props: PreviewCameraRigProps) {
  if (!import.meta.env.DEV) return null;
  return <PreviewCameraRig {...props} />;
}
