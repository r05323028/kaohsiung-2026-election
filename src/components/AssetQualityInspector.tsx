import { OrbitControls } from '@react-three/drei';
import { Canvas, useThree } from '@react-three/fiber';
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import type { PublicCandidateProfile } from '../data';
import { HERO_LANDMARK_SPECS } from '../world/hero-landmarks';
import CandidateChibi from './CandidateChibi';
import { characterStyle } from './character-style';
import HeroLandmarkModel from './HeroLandmarks';

type View = 'front' | 'side' | 'three-quarter' | 'top';
type Mode = 'hero' | 'candidate';

const VIEW_OFFSETS: Record<View, [number, number, number]> = {
  front: [0, 0.9, 3.4],
  side: [3.4, 0.9, 0],
  'three-quarter': [2.4, 1.8, 2.4],
  top: [0.01, 3.6, 0.01],
};

function CameraView({
  view,
  zoom,
  targetY,
}: {
  view: View;
  zoom: number;
  targetY: number;
}) {
  const { camera } = useThree();
  useEffect(() => {
    const [x, y, z] = VIEW_OFFSETS[view];
    camera.position.set(x, y + targetY, z);
    camera.lookAt(0, targetY, 0);
    if (camera instanceof THREE.OrthographicCamera) {
      camera.zoom = zoom;
      camera.updateProjectionMatrix();
    }
  }, [camera, view, zoom, targetY]);
  return null;
}

function Stage({
  mode,
  heroFeature,
  candidate,
  view,
  walking,
}: {
  mode: Mode;
  heroFeature: string;
  candidate: PublicCandidateProfile | undefined;
  view: View;
  walking: boolean;
}) {
  const zoom = mode === 'hero' ? 190 : 400;
  const targetY = mode === 'hero' ? 1.0 : 0.55;
  return (
    <>
      <color attach="background" args={['#e9e3d8']} />
      <ambientLight intensity={1.5} />
      <hemisphereLight args={['#fff4de', '#b8b0a0', 0.9]} />
      <directionalLight
        castShadow
        position={[3.2, 6.4, 4.2]}
        intensity={2.6}
        color="#fff3dd"
      />
      <directionalLight
        position={[-3, 2, -2]}
        intensity={0.35}
        color="#cfe5ea"
      />
      <mesh
        position={[0, -0.025, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        receiveShadow
      >
        <circleGeometry args={[3.4, 64]} />
        <meshStandardMaterial color="#f2e9da" roughness={0.96} />
      </mesh>
      <gridHelper args={[6.8, 24, '#d6cbb9', '#ded4c5']} position={[0, 0, 0]} />
      <CameraView view={view} zoom={zoom} targetY={targetY} />
      <OrbitControls
        enablePan={false}
        enableDamping
        dampingFactor={0.08}
        minDistance={0.8}
        maxDistance={9}
        target={[0, targetY, 0]}
      />
      {mode === 'hero' ? (
        <group name="inspect-hero" userData={{ feature: heroFeature }}>
          <HeroLandmarkModel feature={heroFeature as never} />
        </group>
      ) : candidate ? (
        <group
          name="inspect-candidate"
          userData={{ slug: candidate.candidacy.slug }}
        >
          <Suspense fallback={null}>
            <CandidateChibi
              candidate={candidate}
              walking={walking}
              selected={false}
              reducedMotion={false}
            />
          </Suspense>
        </group>
      ) : null}
    </>
  );
}

export default function AssetQualityInspector({
  candidates,
}: {
  candidates: PublicCandidateProfile[];
}) {
  const [mode, setMode] = useState<Mode>('hero');
  const [feature, setFeature] = useState(HERO_LANDMARK_SPECS[0]?.feature ?? '');
  const [candidateSlug, setCandidateSlug] = useState(
    candidates[0]?.candidacy.slug ?? '',
  );
  const [view, setView] = useState<View>('three-quarter');
  const [walking, setWalking] = useState(true);
  const candidate = useMemo(
    () => candidates.find((item) => item.candidacy.slug === candidateSlug),
    [candidates, candidateSlug],
  );
  const spec = HERO_LANDMARK_SPECS.find((item) => item.feature === feature);
  const style = candidate ? characterStyle(candidate) : null;
  const canvasRef = useRef<HTMLDivElement>(null);
  return (
    <section className="asset-inspector" data-testid="asset-inspector">
      <div className="avatar-preview-app__toolbar">
        <label>
          檢查模式
          <select
            value={mode}
            onChange={(event) => setMode(event.target.value as Mode)}
          >
            <option value="hero">七座地標</option>
            <option value="candidate">候選人角色</option>
          </select>
        </label>
        {mode === 'hero' ? (
          <label>
            地標
            <select
              value={feature}
              onChange={(event) => setFeature(event.target.value)}
            >
              {HERO_LANDMARK_SPECS.map((item) => (
                <option key={item.feature} value={item.feature}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <label>
            候選人
            <select
              value={candidateSlug}
              onChange={(event) => setCandidateSlug(event.target.value)}
            >
              {candidates.map((item) => (
                <option key={item.candidacy.slug} value={item.candidacy.slug}>
                  {item.person.displayName}｜{item.district.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <fieldset className="avatar-preview-app__actions">
          <legend>視角</legend>
          {(['three-quarter', 'front', 'side', 'top'] as const).map((item) => (
            <button
              key={item}
              type="button"
              aria-pressed={view === item}
              onClick={() => setView(item)}
            >
              {item === 'three-quarter'
                ? '三視'
                : item === 'front'
                  ? '前視'
                  : item === 'side'
                    ? '側視'
                    : '俯視'}
            </button>
          ))}
        </fieldset>
        {mode === 'candidate' ? (
          <button
            type="button"
            aria-pressed={walking}
            onClick={() => setWalking((value) => !value)}
          >
            {walking ? '行走中' : '待機'}
          </button>
        ) : null}
      </div>
      <div
        ref={canvasRef}
        className="avatar-preview-app__canvas asset-inspector__canvas"
        data-testid="asset-inspector-canvas"
      >
        <Canvas
          orthographic
          shadows
          dpr={[1, 2]}
          camera={{ position: [2.4, 1.8, 2.4], zoom: 140, near: 0.05, far: 60 }}
          gl={{ antialias: true }}
        >
          <Stage
            mode={mode}
            heroFeature={feature}
            candidate={candidate}
            view={view}
            walking={walking}
          />
        </Canvas>
      </div>
      <dl className="avatar-preview-app__metadata">
        {mode === 'hero' && spec ? (
          <>
            <div>
              <dt>地標</dt>
              <dd>{spec.label}</dd>
            </div>
            <div>
              <dt>行政區</dt>
              <dd>
                {spec.districtId}／{spec.tileId}
              </dd>
            </div>
            <div>
              <dt>可用高度</dt>
              <dd>{spec.height.toFixed(2)} units</dd>
            </div>
            <div>
              <dt>製作方式</dt>
              <dd>{spec.pipeline}</dd>
            </div>
          </>
        ) : null}
        {mode === 'candidate' && candidate && style ? (
          <>
            <div>
              <dt>姓名</dt>
              <dd>{candidate.person.displayName}</dd>
            </div>
            <div>
              <dt>服裝</dt>
              <dd>
                {style.outfit}／{style.hairStyle}
              </dd>
            </div>
            <div>
              <dt>完整部件</dt>
              <dd>頭、臉、髮、軀幹、雙臂、雙手、雙腿、鞋</dd>
            </div>
            <div>
              <dt>骨架與動畫</dt>
              <dd>剛性節點：頭、肩、髖；Idle／Walk 程序動畫</dd>
            </div>
            <div>
              <dt>比例</dt>
              <dd>glTF 2.0・總高 1.10 units</dd>
            </div>
          </>
        ) : null}
      </dl>
    </section>
  );
}
