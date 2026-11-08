import { OrbitControls, useAnimations, useGLTF } from '@react-three/drei';
import { Canvas, useThree } from '@react-three/fiber';
import {
  Component,
  type ReactNode,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type * as THREE from 'three';
import type { AvatarAsset, AvatarManifest } from '../data/avatars';
import { withBase } from '../utils/paths';

type PreviewMode = 'Idle' | 'Greeting' | 'Selected';

type Props = { manifest: AvatarManifest };

type BoundaryProps = { children: ReactNode; fallback: ReactNode };
type BoundaryState = { hasError: boolean };

class PreviewAssetBoundary extends Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { hasError: false };

  static getDerivedStateFromError(): BoundaryState {
    return { hasError: true };
  }

  render() {
    return this.state.hasError ? this.props.fallback : this.props.children;
  }
}

function PreviewModel({
  asset,
  mode,
  reducedMotion,
}: {
  asset: AvatarAsset;
  mode: PreviewMode;
  reducedMotion: boolean;
}) {
  const root = useRef<THREE.Group>(null);
  const { invalidate } = useThree();
  const gltf = useGLTF(withBase(asset.modelPath));
  const scene = useMemo(() => gltf.scene.clone(true), [gltf.scene]);
  const { actions } = useAnimations(gltf.animations, root);

  useEffect(() => {
    for (const action of Object.values(actions)) action?.stop();
    if (reducedMotion) {
      invalidate();
      return undefined;
    }
    const action = actions[mode];
    action?.reset().fadeIn(0.12).play();
    let frame = 0;
    const endAt = performance.now() + (mode === 'Idle' ? 1800 : 1000);
    const requestFrame = () => {
      invalidate();
      if (performance.now() < endAt)
        frame = requestAnimationFrame(requestFrame);
    };
    frame = requestAnimationFrame(requestFrame);
    return () => {
      cancelAnimationFrame(frame);
      action?.stop();
    };
  }, [actions, invalidate, mode, reducedMotion]);

  return (
    <group ref={root} scale={0.42}>
      <primitive object={scene} />
    </group>
  );
}

function PreviewCanvas({
  asset,
  mode,
  reducedMotion,
}: {
  asset: AvatarAsset;
  mode: PreviewMode;
  reducedMotion: boolean;
}) {
  return (
    <Canvas
      orthographic
      shadows
      frameloop="demand"
      dpr={[1, 1.5]}
      camera={{ position: [3.2, 2.8, 3.2], zoom: 68, near: 0.1, far: 100 }}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      onCreated={({ camera }) => camera.lookAt(0, 0.55, 0)}
    >
      <color attach="background" args={['#bde4dd']} />
      <ambientLight intensity={2.1} />
      <directionalLight
        castShadow
        position={[4, 8, 5]}
        intensity={3.2}
        color="#fff4dc"
      />
      <mesh
        position={[0, -0.02, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        receiveShadow
      >
        <circleGeometry args={[0.75, 32]} />
        <meshStandardMaterial color="#f5e8d4" roughness={0.96} />
      </mesh>
      <OrbitControls
        enablePan={false}
        enableDamping
        dampingFactor={0.08}
        minPolarAngle={Math.PI / 3.1}
        maxPolarAngle={Math.PI / 2.1}
      />
      <Suspense fallback={null}>
        <PreviewModel asset={asset} mode={mode} reducedMotion={reducedMotion} />
      </Suspense>
    </Canvas>
  );
}

export default function AvatarPreviewApp({ manifest }: Props) {
  const firstAsset = manifest.assets[0];
  const [assetId, setAssetId] = useState(firstAsset?.avatarId ?? '');
  const [mode, setMode] = useState<PreviewMode>('Idle');
  const [reducedMotion, setReducedMotion] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const asset =
    manifest.assets.find((item) => item.avatarId === assetId) ?? firstAsset;

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const updateMotion = () => setReducedMotion(mediaQuery.matches);
    updateMotion();
    setHydrated(true);
    mediaQuery.addEventListener('change', updateMotion);
    return () => mediaQuery.removeEventListener('change', updateMotion);
  }, []);

  if (!asset) return <p role="alert">找不到可預覽的角色資產。</p>;

  return (
    <section
      className="avatar-preview-app"
      data-testid="avatar-preview-app"
      data-hydrated={hydrated ? 'true' : 'false'}
    >
      <div className="avatar-preview-app__toolbar">
        <label>
          角色資產
          <select
            value={asset.avatarId}
            onChange={(event) => setAssetId(event.target.value)}
          >
            {manifest.assets.map((item) => (
              <option key={item.avatarId} value={item.avatarId}>
                {item.avatarId}
              </option>
            ))}
          </select>
        </label>
        <fieldset className="avatar-preview-app__actions">
          <legend className="sr-only">動畫預覽</legend>
          {(['Idle', 'Greeting', 'Selected'] as const).map((item) => (
            <button
              key={item}
              type="button"
              aria-pressed={mode === item}
              onClick={() => setMode(item)}
            >
              {item}
            </button>
          ))}
        </fieldset>
      </div>
      <div
        className="avatar-preview-app__canvas"
        data-testid="avatar-preview-canvas"
      >
        <PreviewAssetBoundary
          fallback={
            <div className="avatar-preview-app__error" role="alert">
              此 GLB 無法載入，請檢查本地資產驗證結果。
            </div>
          }
        >
          <PreviewCanvas
            asset={asset}
            mode={mode}
            reducedMotion={reducedMotion}
          />
        </PreviewAssetBoundary>
      </div>
      <dl className="avatar-preview-app__metadata">
        <div>
          <dt>資產狀態</dt>
          <dd>{asset.state}</dd>
        </div>
        <div>
          <dt>檔案大小</dt>
          <dd>{asset.fileSizeBytes.toLocaleString()} bytes</dd>
        </div>
        <div>
          <dt>網格／三角形</dt>
          <dd>
            {asset.meshCount}／{asset.triangleCount}
          </dd>
        </div>
        <div>
          <dt>動畫</dt>
          <dd>{asset.animationClips.join(' · ')}</dd>
        </div>
        <div>
          <dt>視覺審查</dt>
          <dd>虛構原創資產，不代表真實人物 likeness 核准</dd>
        </div>
      </dl>
    </section>
  );
}
