import { OrbitControls } from '@react-three/drei';
import { Canvas, useThree } from '@react-three/fiber';
import gsap from 'gsap';
import { useEffect } from 'react';
import * as THREE from 'three';
import type { CandidateProfile } from '../data';
import CharacterAvatar from './CharacterAvatar';

type SceneProps = {
  candidates: CandidateProfile[];
  selectedCandidateSlug: string | null;
  zoom: number;
  reducedMotion: boolean;
  onSelect: (slug: string) => void;
  onReady: () => void;
};

const buildingPalette = ['#f4bc86', '#e99679', '#8bcac1', '#ffd895'];
const buildingData: Array<[number, number, number, number, number, number]> = [
  [-4.4, 1.15, -1.9, 1.2, 2.3, 1.15],
  [-3.1, 0.8, -2.6, 1.05, 1.6, 1.1],
  [2.9, 1.3, -2.1, 1.2, 2.6, 1.2],
  [4.25, 0.9, -1.4, 1.15, 1.8, 1.15],
  [-4.4, 0.7, 2.1, 1.3, 1.4, 1.2],
  [3.9, 1.05, 1.8, 1.4, 2.1, 1.25],
];
const palmData: Array<[number, number, number]> = [
  [-5, 0, 0.4],
  [5, 0, 0.7],
  [-4.5, 0, 3.1],
  [4.7, 0, 3.1],
];

function LowPolyBuilding({
  data,
  index,
}: {
  data: [number, number, number, number, number, number];
  index: number;
}) {
  const [x, y, z, width, height, depth] = data;
  return (
    <group position={[x, y / 2, z]}>
      <mesh castShadow receiveShadow>
        <boxGeometry args={[width, height, depth]} />
        <meshStandardMaterial
          color={buildingPalette[index % buildingPalette.length] ?? '#f4bc86'}
          roughness={0.82}
        />
      </mesh>
      <mesh position={[0, height / 2 + 0.08, 0]} castShadow>
        <boxGeometry args={[width * 0.82, 0.16, depth * 0.82]} />
        <meshStandardMaterial color="#294858" roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.15, depth / 2 + 0.012]}>
        <boxGeometry args={[width * 0.5, 0.18, 0.03]} />
        <meshBasicMaterial color="#fff9f0" />
      </mesh>
    </group>
  );
}

function PalmTree({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.8, 0]} castShadow>
        <cylinderGeometry args={[0.11, 0.16, 1.6, 7]} />
        <meshStandardMaterial color="#b87856" roughness={0.9} />
      </mesh>
      <mesh position={[0, 1.65, 0]} castShadow>
        <sphereGeometry args={[0.62, 8, 5]} />
        <meshStandardMaterial color="#4cafa8" roughness={0.85} flatShading />
      </mesh>
    </group>
  );
}

function CivicHall() {
  return (
    <group position={[0, 0, 2.1]}>
      <mesh position={[0, 0.65, 0]} castShadow receiveShadow>
        <boxGeometry args={[2.2, 1.3, 1.1]} />
        <meshStandardMaterial color="#fff9f0" roughness={0.75} />
      </mesh>
      <mesh position={[0, 1.45, 0]} castShadow>
        <cylinderGeometry args={[0.92, 0.92, 0.18, 6]} />
        <meshStandardMaterial color="#e99679" roughness={0.78} />
      </mesh>
      <mesh position={[0, 0.8, 0.57]}>
        <boxGeometry args={[1.1, 0.38, 0.04]} />
        <meshBasicMaterial color="#4cafa8" />
      </mesh>
    </group>
  );
}

function RailLine() {
  return (
    <group position={[0, 0.04, -0.1]} rotation={[0, -0.06, -0.05]}>
      <mesh receiveShadow>
        <boxGeometry args={[10, 0.08, 0.48]} />
        <meshStandardMaterial color="#294858" roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.06, 0]}>
        <boxGeometry args={[9.7, 0.04, 0.12]} />
        <meshBasicMaterial color="#e99679" />
      </mesh>
    </group>
  );
}

function Harbor() {
  return (
    <group position={[0, -0.02, -3.35]}>
      <mesh receiveShadow>
        <boxGeometry args={[12, 0.12, 1.8]} />
        <meshStandardMaterial color="#73c6bf" roughness={0.65} />
      </mesh>
      <mesh position={[0, 0.08, 0]}>
        <boxGeometry args={[8.8, 0.03, 0.08]} />
        <meshBasicMaterial color="#fff9f0" />
      </mesh>
      <mesh position={[-2.4, 0.08, 0.42]}>
        <boxGeometry args={[3.2, 0.03, 0.06]} />
        <meshBasicMaterial color="#fff9f0" />
      </mesh>
    </group>
  );
}

function CityGround() {
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[13, 9]} />
        <meshStandardMaterial color="#f5e8d4" roughness={0.96} />
      </mesh>
      <mesh position={[0, 0.015, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[8.5, 5.8]} />
        <meshStandardMaterial color="#d9e8c5" roughness={0.96} />
      </mesh>
      <Harbor />
      <RailLine />
      <CivicHall />
      {buildingData.map((data, index) => (
        <LowPolyBuilding
          data={data}
          index={index}
          key={`${data[0]}-${data[2]}`}
        />
      ))}
      {palmData.map((position) => (
        <PalmTree key={position.join('-')} position={position} />
      ))}
    </group>
  );
}

function CameraFocus({
  selectedCandidateSlug,
  candidates,
  reducedMotion,
}: {
  selectedCandidateSlug: string | null;
  candidates: CandidateProfile[];
  reducedMotion: boolean;
}) {
  const { camera, invalidate } = useThree();
  useEffect(() => {
    const selected = candidates.find(
      (candidate) => candidate.candidacy.slug === selectedCandidateSlug,
    );
    const target = selected
      ? new THREE.Vector3(...selected.visual.position)
      : new THREE.Vector3(0, 0.5, 0);
    const fromPosition = camera.position.clone();
    const toPosition = selected
      ? target.clone().add(new THREE.Vector3(3.3, 3.5, 3.3))
      : new THREE.Vector3(8.5, 8.5, 8.5);
    const progress = { value: 0 };
    const tween = gsap.to(progress, {
      value: 1,
      duration: reducedMotion ? 0.01 : 0.72,
      ease: 'power2.out',
      onUpdate: () => {
        camera.position.lerpVectors(fromPosition, toPosition, progress.value);
        camera.lookAt(target);
        invalidate();
      },
    });
    return () => {
      tween.kill();
    };
  }, [camera, candidates, invalidate, reducedMotion, selectedCandidateSlug]);
  return null;
}

export default function MiniCityScene({
  candidates,
  selectedCandidateSlug,
  zoom,
  reducedMotion,
  onSelect,
  onReady,
}: SceneProps) {
  return (
    <Canvas
      orthographic
      shadows
      frameloop="demand"
      dpr={[1, 1.5]}
      camera={{ position: [8.5, 8.5, 8.5], zoom, near: 0.1, far: 100 }}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      fallback={<div className="fallback-city" />}
      onCreated={({ camera }) => {
        camera.lookAt(0, 0, 0);
        onReady();
      }}
    >
      <color attach="background" args={['#bde4dd']} />
      <ambientLight intensity={2.1} />
      <directionalLight
        castShadow
        position={[4, 8, 5]}
        intensity={3.2}
        color="#fff4dc"
        shadow-mapSize={[1024, 1024]}
      />
      <CityGround />
      <CameraFocus
        selectedCandidateSlug={selectedCandidateSlug}
        candidates={candidates}
        reducedMotion={reducedMotion}
      />
      <OrbitControls
        makeDefault
        enablePan={false}
        enableDamping
        dampingFactor={0.08}
        minPolarAngle={Math.PI / 3.1}
        maxPolarAngle={Math.PI / 2.1}
        minAzimuthAngle={-0.85}
        maxAzimuthAngle={0.85}
        minZoom={48}
        maxZoom={92}
      />
      {candidates.map((candidate) => (
        <CharacterAvatar
          candidate={candidate}
          key={candidate.candidacy.id}
          selected={candidate.candidacy.slug === selectedCandidateSlug}
          reducedMotion={reducedMotion}
          onSelect={onSelect}
        />
      ))}
    </Canvas>
  );
}
