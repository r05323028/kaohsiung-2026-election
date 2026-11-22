import { useGLTF } from '@react-three/drei';
import { useLayoutEffect } from 'react';
import type * as THREE from 'three';
import { withBase } from '../utils/paths';
import { installHeadKit } from './head-kit-install';

type CandidateHeadKitProps = {
  /** Approved head kit path, e.g. /assets/avatars/likeness/ke-zhi-en-2026-head.glb */
  path: string;
  /** HeadPivot of the cloned candidate model. */
  head: THREE.Object3D;
  /** Merged body meshes that carry the candidate's skin material. */
  skinMeshes: THREE.Object3D[];
};

/**
 * Installs an approved head kit on the candidate's HeadPivot. Rendering and
 * cleanup live in `installHeadKit`; this component only owns asset loading.
 */
export default function CandidateHeadKit({
  path,
  head,
  skinMeshes,
}: CandidateHeadKitProps) {
  const gltf = useGLTF(withBase(path));

  useLayoutEffect(
    () => installHeadKit(head, gltf.scene, skinMeshes),
    [gltf.scene, head, skinMeshes],
  );

  return null;
}
