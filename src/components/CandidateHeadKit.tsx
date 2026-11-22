import { useGLTF } from '@react-three/drei';
import {
  Suspense,
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import type * as THREE from 'three';
import { withBase } from '../utils/paths';
import HeadKitBoundary from './HeadKitBoundary';
import { installHeadKit } from './head-kit-install';
import {
  clearHeadKitFailure,
  headKitFailureCount,
  MAX_HEAD_KIT_FAILURES,
  recordHeadKitFailure,
  requestHeadKitRetry,
  useHeadKitRecovery,
} from './head-kit-recovery';

type CandidateHeadKitProps = {
  /** Approved (or development-preview) head kit path. */
  path: string;
  /** HeadPivot of the cloned candidate model. */
  head: THREE.Object3D;
  /** Merged body meshes that carry the candidate's skin material. */
  skinMeshes: THREE.Object3D[];
};

/**
 * Evicts a rejected kit URL from drei's loader cache and remounts every kit
 * that uses it. Safe to call when nothing failed: the next load simply refetches.
 */
export function retryHeadKit(path: string): void {
  useGLTF.clear(withBase(path));
  requestHeadKitRetry(path);
}

function HeadKitScene({ path, head, skinMeshes }: CandidateHeadKitProps) {
  const gltf = useGLTF(withBase(path));
  const mounted = useRef(false);

  useLayoutEffect(() => {
    const uninstall = installHeadKit(head, gltf.scene, skinMeshes);
    return () => {
      uninstall();
    };
  }, [gltf.scene, head, skinMeshes]);

  // A kit that rendered is healthy again: give a later failure its own budget.
  useLayoutEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      clearHeadKitFailure(path);
    }
  }, [path]);

  return null;
}

/**
 * Loads and installs a head kit without ever risking the city.
 *
 * Failures stay inside `HeadKitBoundary`, the rejected cache entry is evicted
 * and one automatic remount is attempted before falling back to the shared base
 * head. The remount key includes the kit path so a slow failure for candidate A
 * can never install itself over candidate B, and the retry revision so a
 * developer can force a fresh load from the preview panel.
 */
export default function CandidateHeadKit({
  path,
  head,
  skinMeshes,
}: CandidateHeadKitProps) {
  const revision = useHeadKitRecovery();
  const [attempt, setAttempt] = useState(0);
  const failuresRef = useRef(0);

  const handleError = useCallback(() => {
    const failures = recordHeadKitFailure(path);
    failuresRef.current = failures;
    if (failures >= MAX_HEAD_KIT_FAILURES) return;
    // Evict before remounting so the retry issues a real request instead of
    // replaying the rejected promise from the loader cache.
    useGLTF.clear(withBase(path));
    setAttempt((value) => value + 1);
  }, [path]);

  return (
    <HeadKitBoundary
      key={`${path}#${attempt}#${revision}#${head.uuid}`}
      onError={handleError}
    >
      <Suspense fallback={null}>
        <HeadKitScene head={head} path={path} skinMeshes={skinMeshes} />
      </Suspense>
    </HeadKitBoundary>
  );
}

/** Test/telemetry helper: how many failures this path has seen. */
export function headKitFailures(path: string): number {
  return headKitFailureCount(path);
}
