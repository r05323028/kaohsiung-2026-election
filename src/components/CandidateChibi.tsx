import { useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { PublicCandidateProfile } from '../data';
import { withBase } from '../utils/paths';
import { buildCandidateModel } from './candidate-geometry';
import { CANDIDATE_MODEL } from './candidate-model';
import { characterStyle } from './character-style';

useGLTF.preload(withBase(CANDIDATE_MODEL.basePath));

type CandidateChibiProps = {
  candidate: PublicCandidateProfile;
  walking: boolean;
  selected: boolean;
  reducedMotion: boolean;
  /** Distance-derived phase from the road simulation, in radians / 3.4. */
  walkPhase?: number | undefined;
  /** Live pose updated by the actor layer every rendered frame. */
  motion?: { walkPhase: number; walking: boolean } | undefined;
};

export default function CandidateChibi({
  candidate,
  walking,
  selected,
  reducedMotion,
  walkPhase,
  motion: renderMotion,
}: CandidateChibiProps) {
  const gltf = useGLTF(withBase(CANDIDATE_MODEL.basePath));
  const style = useMemo(() => characterStyle(candidate), [candidate]);
  const model = useMemo(
    () => buildCandidateModel(gltf.scene, style),
    [gltf.scene, style],
  );
  const group = useRef<THREE.Group>(null);
  const motion = useRef({
    blend: 0,
    phase: 0,
    selectedTime: 0,
    wasSelected: false,
    greeting: 0,
  });

  useEffect(
    () => () => {
      for (const material of model.ownedMaterials) material.dispose();
      for (const geometry of model.ownedGeometries) geometry.dispose();
    },
    [model],
  );

  useFrame((state, delta) => {
    const clock = state.clock.getElapsedTime();
    const current = motion.current;
    const liveWalking = renderMotion?.walking ?? walking;
    const livePhase = renderMotion?.walkPhase ?? walkPhase;
    const targetBlend = liveWalking && !reducedMotion ? 1 : 0;
    current.blend = THREE.MathUtils.damp(
      current.blend,
      targetBlend,
      9,
      Math.min(delta, 0.1),
    );
    if (livePhase === undefined) {
      current.phase += liveWalking && !reducedMotion ? delta * 3.6 : 0;
    } else {
      // Simulation advances walkPhase by 3.4 per world unit. A 4π factor
      // gives roughly one leg cycle per body-length walked, so planted feet do
      // not slide over the road at the world's slow toy scale.
      current.phase = livePhase * Math.PI * 4;
    }
    if (selected && !current.wasSelected) current.selectedTime = 0;
    if (selected || current.greeting > 0.001) {
      current.selectedTime += Math.min(delta, 0.1);
    }
    current.wasSelected = selected;
    const greetingTarget =
      selected && !reducedMotion && current.selectedTime < 1.55 ? 1 : 0;
    current.greeting = THREE.MathUtils.damp(
      current.greeting,
      greetingTarget,
      10,
      Math.min(delta, 0.1),
    );

    const { pivots, rest } = model;
    const phase = current.phase;
    const stride = Math.sin(phase) * 0.5 * current.blend;
    const armSwing = Math.cos(phase) * 0.34 * current.blend;
    const idle = 1 - current.blend;
    const wave =
      (Math.sin(current.selectedTime * 13) * 0.16 + 1.85) * current.greeting;

    if (pivots.head) {
      pivots.head.rotation.set(
        rest.head.x + Math.sin(clock * 0.8) * 0.025 * idle,
        rest.head.y + Math.sin(clock * 0.55) * 0.05 * idle,
        rest.head.z,
      );
    }
    if (pivots.leftArm) {
      pivots.leftArm.rotation.set(
        rest.leftArm.x - armSwing,
        rest.leftArm.y,
        rest.leftArm.z,
      );
    }
    if (pivots.rightArm) {
      pivots.rightArm.rotation.set(
        rest.rightArm.x + armSwing - (wave ? 0.12 : 0),
        rest.rightArm.y,
        rest.rightArm.z + wave,
      );
    }
    if (pivots.leftLeg) {
      pivots.leftLeg.rotation.set(
        rest.leftLeg.x + stride,
        rest.leftLeg.y,
        rest.leftLeg.z,
      );
    }
    if (pivots.rightLeg) {
      pivots.rightLeg.rotation.set(
        rest.rightLeg.x - stride,
        rest.rightLeg.y,
        rest.rightLeg.z,
      );
    }

    if (group.current) {
      group.current.position.y = model.groundOffset;
    }
  });

  return (
    <group
      ref={group}
      name="candidate-chibi"
      userData={{ model: 'glb', lod: 'base' }}
      scale={model.scale}
      position={[0, model.groundOffset, 0]}
    >
      <primitive object={model.root} />
    </group>
  );
}
