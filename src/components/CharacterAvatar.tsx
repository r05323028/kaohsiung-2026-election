import { useAnimations, useGLTF } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { Component, type ReactNode, useEffect, useMemo, useRef } from 'react';
import type * as THREE from 'three';
import type { PublicCandidateProfile } from '../data';
import { resolveAvatar } from '../data/avatars';
import { withBase } from '../utils/paths';

type CharacterAvatarProps = {
  candidate: PublicCandidateProfile;
  selected: boolean;
  walking?: boolean;
  reducedMotion: boolean;
  onSelect: (slug: string) => void;
  position?: [number, number, number];
  rotation?: number;
};

type AssetErrorBoundaryProps = {
  children: ReactNode;
  fallback: ReactNode;
};

type AssetErrorBoundaryState = { hasError: boolean };

class AssetErrorBoundary extends Component<
  AssetErrorBoundaryProps,
  AssetErrorBoundaryState
> {
  state: AssetErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): AssetErrorBoundaryState {
    return { hasError: true };
  }

  render() {
    return this.state.hasError ? this.props.fallback : this.props.children;
  }
}

function ProceduralAvatarModel({
  candidate,
  walking,
  reducedMotion,
}: {
  candidate: PublicCandidateProfile;
  walking: boolean;
  reducedMotion: boolean;
}) {
  const { visual } = candidate;
  const leftLeg = useRef<THREE.Group>(null);
  const rightLeg = useRef<THREE.Group>(null);
  const leftArm = useRef<THREE.Group>(null);
  const rightArm = useRef<THREE.Group>(null);
  useFrame((state) => {
    const phase =
      walking && !reducedMotion ? Math.sin(state.clock.elapsedTime * 7.5) : 0;
    if (leftLeg.current) leftLeg.current.rotation.x = phase * 0.55;
    if (rightLeg.current) rightLeg.current.rotation.x = -phase * 0.55;
    if (leftArm.current) leftArm.current.rotation.x = -phase * 0.42;
    if (rightArm.current) rightArm.current.rotation.x = phase * 0.42;
  });
  return (
    <>
      <mesh position={[0, 0.36, 0]} castShadow>
        <cylinderGeometry args={[0.2, 0.27, 0.58, 10]} />
        <meshStandardMaterial color={visual.palette.top} roughness={0.82} />
      </mesh>
      <mesh position={[0, 0.72, 0]} castShadow>
        <sphereGeometry args={[0.26, 12, 10]} />
        <meshStandardMaterial color={visual.palette.skin} roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.91, -0.01]} castShadow>
        <sphereGeometry args={[0.27, 10, 7]} />
        <meshStandardMaterial
          color={visual.palette.hair}
          roughness={0.95}
          flatShading
        />
      </mesh>
      <mesh position={[-0.09, 0.74, 0.235]}>
        <sphereGeometry args={[0.027, 8, 8]} />
        <meshBasicMaterial color="#294858" />
      </mesh>
      <mesh position={[0.09, 0.74, 0.235]}>
        <sphereGeometry args={[0.027, 8, 8]} />
        <meshBasicMaterial color="#294858" />
      </mesh>
      <group ref={leftLeg} position={[-0.12, 0.23, 0]}>
        <mesh position={[0, -0.15, 0]} castShadow>
          <cylinderGeometry args={[0.07, 0.09, 0.24, 8]} />
          <meshStandardMaterial color={visual.palette.bottom} roughness={0.9} />
        </mesh>
      </group>
      <group ref={rightLeg} position={[0.12, 0.23, 0]}>
        <mesh position={[0, -0.15, 0]} castShadow>
          <cylinderGeometry args={[0.07, 0.09, 0.24, 8]} />
          <meshStandardMaterial color={visual.palette.bottom} roughness={0.9} />
        </mesh>
      </group>
      <group ref={leftArm} position={[-0.24, 0.57, 0]}>
        <mesh position={[0, -0.15, 0]} castShadow>
          <cylinderGeometry args={[0.045, 0.055, 0.3, 8]} />
          <meshStandardMaterial color={visual.palette.top} roughness={0.85} />
        </mesh>
      </group>
      <group ref={rightArm} position={[0.24, 0.57, 0]}>
        <mesh position={[0, -0.15, 0]} castShadow>
          <cylinderGeometry args={[0.045, 0.055, 0.3, 8]} />
          <meshStandardMaterial color={visual.palette.top} roughness={0.85} />
        </mesh>
      </group>
      {visual.accessory === 'glasses' && (
        <group position={[0, 0.75, 0.26]}>
          <mesh position={[-0.1, 0, 0]}>
            <torusGeometry args={[0.07, 0.014, 6, 12]} />
            <meshBasicMaterial color="#294858" />
          </mesh>
          <mesh position={[0.1, 0, 0]}>
            <torusGeometry args={[0.07, 0.014, 6, 12]} />
            <meshBasicMaterial color="#294858" />
          </mesh>
          <mesh position={[0, 0, 0]}>
            <boxGeometry args={[0.09, 0.014, 0.014]} />
            <meshBasicMaterial color="#294858" />
          </mesh>
        </group>
      )}
      {visual.accessory === 'scarf' && (
        <mesh position={[0, 0.56, 0.24]} rotation={[0.2, 0, 0]}>
          <boxGeometry args={[0.32, 0.08, 0.05]} />
          <meshStandardMaterial
            color={visual.palette.accessory}
            roughness={0.82}
          />
        </mesh>
      )}
      {visual.accessory === 'hat' && (
        <group position={[0, 1.02, 0]}>
          <mesh>
            <cylinderGeometry args={[0.3, 0.3, 0.1, 10]} />
            <meshStandardMaterial
              color={visual.palette.accessory}
              roughness={0.88}
            />
          </mesh>
          <mesh position={[0, 0.1, 0]}>
            <cylinderGeometry args={[0.2, 0.23, 0.18, 10]} />
            <meshStandardMaterial
              color={visual.palette.accessory}
              roughness={0.88}
            />
          </mesh>
        </group>
      )}
    </>
  );
}

function GlbAvatarModel({
  modelPath,
  selected,
  walking,
  reducedMotion,
}: {
  modelPath: string;
  selected: boolean;
  walking: boolean;
  reducedMotion: boolean;
}) {
  const root = useRef<THREE.Group>(null);
  const { invalidate } = useThree();
  const gltf = useGLTF(withBase(modelPath));
  const scene = useMemo(() => gltf.scene.clone(true), [gltf.scene]);
  const { actions } = useAnimations(gltf.animations, root);

  useEffect(() => {
    const idle = actions.Idle;
    const walk = actions.Walk;
    const selectedAction = actions.Selected;
    const greeting = actions.Greeting;
    if (reducedMotion) {
      idle?.stop();
      walk?.stop();
      selectedAction?.stop();
      greeting?.stop();
      return undefined;
    }
    if (walking && walk) walk.reset().fadeIn(0.12).play();
    else idle?.reset().fadeIn(0.12).play();
    if (selected) {
      selectedAction?.reset().play();
      greeting?.reset().play();
    }
    let frame = 0;
    const endAt = performance.now() + (selected ? 1000 : 220);
    const requestFrame = () => {
      invalidate();
      if (performance.now() < endAt)
        frame = requestAnimationFrame(requestFrame);
    };
    frame = requestAnimationFrame(requestFrame);
    return () => {
      cancelAnimationFrame(frame);
      idle?.stop();
      walk?.stop();
      selectedAction?.stop();
      greeting?.stop();
    };
  }, [actions, invalidate, reducedMotion, selected, walking]);

  return (
    <group ref={root} scale={0.42}>
      <primitive object={scene} />
    </group>
  );
}

function AvatarModel({
  candidate,
  selected,
  walking,
  reducedMotion,
}: {
  candidate: PublicCandidateProfile;
  selected: boolean;
  walking: boolean;
  reducedMotion: boolean;
}) {
  const resolved = resolveAvatar(candidate.candidacy.id);
  const fallback = (
    <ProceduralAvatarModel
      candidate={candidate}
      reducedMotion={reducedMotion}
      walking={walking}
    />
  );
  if (resolved.kind !== 'glb') return fallback;
  return (
    <AssetErrorBoundary
      fallback={fallback}
      key={`${resolved.asset.avatarId}:${resolved.asset.sha256}`}
    >
      <GlbAvatarModel
        modelPath={resolved.asset.modelPath}
        reducedMotion={reducedMotion}
        selected={selected}
        walking={walking}
      />
    </AssetErrorBoundary>
  );
}

export default function CharacterAvatar({
  candidate,
  selected,
  walking = false,
  reducedMotion,
  onSelect,
  position,
  rotation,
}: CharacterAvatarProps) {
  const group = useRef<THREE.Group>(null);
  const pointerStart = useRef<{ x: number; y: number } | null>(null);
  const { invalidate } = useThree();
  const { visual } = candidate;
  const basePosition = position ?? visual.position;
  const baseRotation = rotation ?? visual.rotation;
  const baseY = basePosition[1];

  useEffect(() => {
    if (!selected || reducedMotion) return undefined;
    let frame = 0;
    const endAt = performance.now() + 760;
    const requestFrame = () => {
      invalidate();
      if (performance.now() < endAt)
        frame = requestAnimationFrame(requestFrame);
    };
    frame = requestAnimationFrame(requestFrame);
    return () => cancelAnimationFrame(frame);
  }, [invalidate, reducedMotion, selected]);

  useFrame((state) => {
    if (!group.current || reducedMotion) return;
    const time = state.clock.getElapsedTime();
    if (walking) {
      group.current.position.y = baseY + Math.abs(Math.sin(time * 7.5)) * 0.022;
      group.current.rotation.z = Math.sin(time * 7.5) * 0.018;
      return;
    }
    if (selected) {
      group.current.position.y = baseY + Math.sin(time * 4) * 0.012;
      group.current.rotation.z = 0;
      return;
    }
    group.current.position.y = baseY;
    group.current.rotation.z = 0;
  });

  return (
    <>
      {/* biome-ignore lint/a11y/noStaticElementInteractions: 3D selection is mirrored by accessible HTML controls. */}
      <group
        ref={group}
        position={basePosition}
        rotation={[0, baseRotation, 0]}
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
          onSelect(candidate.candidacy.slug);
        }}
        onPointerOver={() => {
          document.body.style.cursor = 'pointer';
        }}
        onPointerOut={() => {
          document.body.style.cursor = '';
        }}
      >
        {selected && (
          <mesh position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.43, 0.045, 8, 24]} />
            <meshBasicMaterial color="#e99679" />
          </mesh>
        )}
        <AvatarModel
          candidate={candidate}
          reducedMotion={reducedMotion}
          selected={selected}
          walking={walking}
        />
      </group>
    </>
  );
}
