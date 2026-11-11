import { useMemo } from 'react';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { HERO_ASSET_BY_FEATURE } from '../world/hero-landmarks';
import type { DedicatedFeature } from '../world/hex-landmarks';
import {
  makeArchRoofGeometry,
  makeFlowingRoofGeometry,
  makeFlowingRoofRimCurve,
  makeGableRoofGeometry,
  makePagodaRoofGeometry,
  makeStadiumBowlGeometry,
  makeStadiumRoofGeometry,
  makeStadiumRoofInnerRimCurve,
  makeStadiumRoofRimCurve,
} from './hero-geometry';

/* ------------------------------------------------------------------ */
/* Shared authored materials and geometry                              */
/* ------------------------------------------------------------------ */

const mat = (
  color: string,
  roughness: number,
  metalness = 0,
  extra: THREE.MeshStandardMaterialParameters = {},
) =>
  new THREE.MeshStandardMaterial({
    color,
    roughness,
    metalness,
    ...extra,
  });

const HERO_MAT = {
  cream: mat('#f3ead7', 0.88),
  paper: mat('#fffaf0', 0.76),
  white: mat('#fbf8ef', 0.58, 0.06),
  roof: mat('#f8f3e5', 0.46, 0.12),
  concrete: mat('#d9cfbc', 0.92),
  stone: mat('#a9a293', 0.9),
  darkStone: mat('#747d79', 0.86),
  steel: mat('#81969c', 0.38, 0.55),
  steelLight: mat('#c3d3d1', 0.42, 0.35),
  dark: mat('#364b50', 0.72),
  glass: mat('#88c9d5', 0.18, 0.28, {
    transparent: true,
    opacity: 0.86,
  }),
  glassDeep: mat('#4b8ea6', 0.16, 0.35),
  glassBlue: mat('#7aa9c5', 0.19, 0.3),
  glassGreen: mat('#9ed7d2', 0.2, 0.24),
  brick: mat('#b96f5b', 0.9),
  brickLight: mat('#cf9178', 0.9),
  terracotta: mat('#cf7a51', 0.83),
  red: mat('#c45145', 0.8),
  orange: mat('#eb955a', 0.78),
  yellow: mat('#f2c65d', 0.72),
  gold: mat('#e8b958', 0.34, 0.46),
  green: mat('#5c9f76', 0.84),
  greenDeep: mat('#3d795d', 0.86),
  sage: mat('#9ebd7f', 0.9),
  teal: mat('#4aa9a2', 0.76),
  tealDeep: mat('#2f7d7c', 0.72),
  water: mat('#65c0cf', 0.22, 0.08, {
    transparent: true,
    opacity: 0.92,
  }),
  waterDeep: mat('#3fa7bd', 0.2, 0.12),
  wood: mat('#8b654c', 0.9),
  pink: mat('#eda8b2', 0.84),
  track: mat('#59666a', 0.78, 0.2),
  roofGreen: mat('#6b9180', 0.72),
};

const G = {
  box: new THREE.BoxGeometry(1, 1, 1),
  rounded: new RoundedBoxGeometry(1, 1, 1, 3, 0.055),
  roundSmall: new RoundedBoxGeometry(1, 1, 1, 2, 0.025),
  cylinder: new THREE.CylinderGeometry(0.5, 0.5, 1, 16),
  cylinder8: new THREE.CylinderGeometry(0.5, 0.5, 1, 8),
  cone: new THREE.ConeGeometry(0.5, 1, 12),
  cone6: new THREE.ConeGeometry(0.5, 1, 6),
  cone4: new THREE.ConeGeometry(0.5, 1, 4),
  sphere: new THREE.SphereGeometry(0.5, 20, 14),
  sphereLow: new THREE.SphereGeometry(0.5, 12, 8),
  ico: new THREE.IcosahedronGeometry(0.5, 0),
  capsule: new THREE.CapsuleGeometry(0.5, 1, 5, 12),
  torus: new THREE.TorusGeometry(0.5, 0.06, 10, 40),
  torusThin: new THREE.TorusGeometry(0.5, 0.018, 6, 48),
  disc: new THREE.CylinderGeometry(1, 1, 1, 48),
  frustum: new THREE.CylinderGeometry(1, 1.22, 1, 4),
  frustumSlim: new THREE.CylinderGeometry(1, 1.12, 1, 4),
  gable: makeGableRoofGeometry(),
  flowRoof: makeFlowingRoofGeometry(),
  bowl: makeStadiumBowlGeometry(),
  canopy: makeStadiumRoofGeometry(),
  stadiumRim: new THREE.TubeGeometry(
    makeStadiumRoofRimCurve(),
    96,
    0.024,
    6,
    false,
  ),
  stadiumInnerRim: new THREE.TubeGeometry(
    makeStadiumRoofInnerRimCurve(),
    96,
    0.02,
    6,
    false,
  ),
  pagodaRoof: makePagodaRoofGeometry(),
  arch: makeArchRoofGeometry(),
  flowRim: new THREE.TubeGeometry(
    makeFlowingRoofRimCurve(),
    96,
    0.016,
    6,
    true,
  ),
};

const DOUBLE_ROOF = new THREE.MeshStandardMaterial({
  color: '#f8f3e5',
  roughness: 0.46,
  metalness: 0.12,
  side: THREE.DoubleSide,
});
const DOUBLE_CANOPY = new THREE.MeshStandardMaterial({
  color: '#fbf7ed',
  roughness: 0.4,
  metalness: 0.18,
  side: THREE.DoubleSide,
});

type HeroPartProps = {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  scale?: [number, number, number];
  position?: [number, number, number];
  rotation?: [number, number, number];
  receiveShadow?: boolean;
};

function HeroPart({
  geometry,
  material,
  scale = [1, 1, 1],
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  receiveShadow = true,
}: HeroPartProps) {
  return (
    <mesh
      geometry={geometry}
      material={material}
      position={position}
      rotation={rotation}
      scale={scale}
      castShadow
      receiveShadow={receiveShadow}
      raycast={() => {}}
    />
  );
}

function ContactShadow({ radius }: { radius: number }) {
  return (
    <mesh
      position={[0, 0.008, 0]}
      rotation={[-Math.PI / 2, 0, 0]}
      raycast={() => {}}
    >
      <circleGeometry args={[radius, 40]} />
      <meshBasicMaterial
        color="#52675f"
        transparent
        opacity={0.18}
        depthWrite={false}
      />
    </mesh>
  );
}

/* ------------------------------------------------------------------ */
/* HSR Zuoying Station                                                 */
/* ------------------------------------------------------------------ */

function HsrStation() {
  return (
    <group>
      <ContactShadow radius={0.98} />
      <HeroPart
        geometry={G.rounded}
        material={HERO_MAT.concrete}
        scale={[1.66, 0.07, 1.0]}
        position={[0, 0.045, 0]}
      />
      <HeroPart
        geometry={G.rounded}
        material={HERO_MAT.cream}
        scale={[1.34, 0.09, 0.66]}
        position={[-0.05, 0.12, -0.12]}
      />
      <HeroPart
        geometry={G.rounded}
        material={HERO_MAT.glass}
        scale={[1.16, 0.25, 0.5]}
        position={[-0.06, 0.27, -0.16]}
      />
      <HeroPart
        geometry={G.box}
        material={HERO_MAT.cream}
        scale={[1.22, 0.045, 0.55]}
        position={[-0.06, 0.395, -0.16]}
      />
      {Array.from({ length: 7 }, (_, index) => (
        <HeroPart
          key={`mullion-${(-0.52 + index * 0.155).toFixed(3)}`}
          geometry={G.box}
          material={HERO_MAT.steelLight}
          scale={[0.025, 0.24, 0.025]}
          position={[-0.52 + index * 0.155, 0.275, 0.095]}
        />
      ))}
      <HeroPart
        geometry={G.box}
        material={HERO_MAT.dark}
        scale={[0.18, 0.19, 0.025]}
        position={[-0.16, 0.24, 0.1]}
      />
      <HeroPart
        geometry={G.box}
        material={HERO_MAT.dark}
        scale={[0.18, 0.19, 0.025]}
        position={[0.08, 0.24, 0.1]}
      />
      <HeroPart
        geometry={G.arch}
        material={DOUBLE_ROOF}
        scale={[1.2, 0.36, 0.5]}
        position={[-0.04, 0.38, -0.17]}
      />
      <HeroPart
        geometry={G.arch}
        material={HERO_MAT.tealDeep}
        scale={[1.0, 0.375, 0.53]}
        position={[-0.04, 0.385, -0.17]}
      />
      <HeroPart
        geometry={G.arch}
        material={DOUBLE_ROOF}
        scale={[1.04, 0.39, 0.55]}
        position={[-0.04, 0.39, -0.17]}
      />
      {[-0.62, 0.54].map((x) => (
        <group key={`station-end-${x}`}>
          <HeroPart
            geometry={G.box}
            material={HERO_MAT.glassDeep}
            scale={[0.024, 0.24, 0.4]}
            position={[x, 0.48, -0.17]}
          />
          <HeroPart
            geometry={G.box}
            material={HERO_MAT.cream}
            scale={[0.05, 0.06, 0.55]}
            position={[x, 0.67, -0.17]}
          />
        </group>
      ))}
      {[-0.52, -0.26, 0, 0.26, 0.52].map((x) => (
        <HeroPart
          key={`platform-column-${x}`}
          geometry={G.cylinder8}
          material={HERO_MAT.steel}
          scale={[0.022, 0.4, 0.022]}
          position={[x, 0.35, 0.23]}
        />
      ))}
      <HeroPart
        geometry={G.box}
        material={HERO_MAT.steelLight}
        scale={[1.14, 0.018, 0.03]}
        position={[-0.04, 0.63, 0.23]}
      />
      <HeroPart
        geometry={G.rounded}
        material={HERO_MAT.cream}
        scale={[1.42, 0.14, 0.2]}
        position={[0, 0.13, 0.4]}
      />
      <HeroPart
        geometry={G.rounded}
        material={HERO_MAT.cream}
        scale={[1.42, 0.14, 0.16]}
        position={[0, 0.13, 0.22]}
      />
      {[-0.65, -0.52, -0.39, -0.26, -0.13, 0, 0.13, 0.26, 0.39, 0.52, 0.65].map(
        (x) => (
          <HeroPart
            key={`sleeper-${x}`}
            geometry={G.box}
            material={HERO_MAT.wood}
            scale={[0.045, 0.012, 0.19]}
            position={[x, 0.214, 0.42]}
          />
        ),
      )}
      <HeroPart
        geometry={G.box}
        material={HERO_MAT.yellow}
        scale={[1.3, 0.012, 0.025]}
        position={[0, 0.222, 0.27]}
      />
      {[0.31, 0.49].map((z) => (
        <HeroPart
          key={`rail-${z}`}
          geometry={G.box}
          material={HERO_MAT.track}
          scale={[1.3, 0.018, 0.025]}
          position={[0, 0.226, z]}
        />
      ))}
      <group position={[0.02, 0.28, 0.42]}>
        <HeroPart
          geometry={G.rounded}
          material={HERO_MAT.teal}
          scale={[1.02, 0.17, 0.15]}
          position={[0, 0, 0]}
        />
        <HeroPart
          geometry={G.rounded}
          material={HERO_MAT.paper}
          scale={[1.0, 0.055, 0.155]}
          position={[0, 0.105, 0]}
        />
        <HeroPart
          geometry={G.rounded}
          material={HERO_MAT.glassDeep}
          scale={[0.78, 0.065, 0.158]}
          position={[0.02, 0.025, 0]}
        />
        {[-0.32, 0.02, 0.36].map((x) => (
          <HeroPart
            key={`train-door-${x}`}
            geometry={G.box}
            material={HERO_MAT.dark}
            scale={[0.08, 0.11, 0.004]}
            position={[x, -0.005, 0.082]}
          />
        ))}
        <HeroPart
          geometry={G.cone}
          material={HERO_MAT.paper}
          scale={[0.16, 0.2, 0.15]}
          position={[0.57, 0, 0]}
          rotation={[0, 0, -Math.PI / 2]}
        />
        <HeroPart
          geometry={G.rounded}
          material={HERO_MAT.orange}
          scale={[0.9, 0.02, 0.158]}
          position={[-0.02, -0.088, 0]}
        />
        {[-0.32, 0.28].map((x) => (
          <HeroPart
            key={`train-wheel-${x}`}
            geometry={G.cylinder}
            material={HERO_MAT.dark}
            scale={[0.06, 0.03, 0.06]}
            position={[x, -0.105, 0]}
            rotation={[Math.PI / 2, 0, 0]}
          />
        ))}
      </group>
      <HeroPart
        geometry={G.rounded}
        material={HERO_MAT.orange}
        scale={[0.22, 0.19, 0.05]}
        position={[0.55, 0.31, 0.1]}
      />
      <HeroPart
        geometry={G.box}
        material={HERO_MAT.paper}
        scale={[0.16, 0.1, 0.055]}
        position={[0.55, 0.31, 0.108]}
      />
      <HeroPart
        geometry={G.box}
        material={HERO_MAT.teal}
        scale={[1.18, 0.03, 0.04]}
        position={[-0.06, 0.44, 0.115]}
      />
      {[-0.7, 0.53].map((x) => (
        <HeroPart
          key={`side-bench-${x}`}
          geometry={G.rounded}
          material={HERO_MAT.sage}
          scale={[0.16, 0.045, 0.12]}
          position={[x, 0.1, 0.46]}
        />
      ))}
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* World Games Stadium                                                 */
/* ------------------------------------------------------------------ */

function WorldGamesStadium() {
  const supportAngles = Array.from(
    { length: 9 },
    (_, index) => -Math.PI * 0.2 + (index / 8) * Math.PI * 1.52,
  );
  return (
    <group>
      <ContactShadow radius={1.04} />
      <HeroPart
        geometry={G.disc}
        material={HERO_MAT.concrete}
        scale={[1.06, 0.07, 0.82]}
        position={[0, 0.045, 0]}
      />
      <HeroPart
        geometry={G.bowl}
        material={HERO_MAT.cream}
        scale={[0.94, 0.82, 0.94]}
        position={[0, 0.03, 0]}
      />
      {[
        [0.72, 0.17, HERO_MAT.teal],
        [0.83, 0.26, HERO_MAT.orange],
        [0.92, 0.35, HERO_MAT.yellow],
      ].map(([radius, y, material]) => (
        <HeroPart
          key={`seat-band-${String(y)}`}
          geometry={G.torusThin}
          material={material as THREE.Material}
          scale={[radius as number, radius as number, 0.54]}
          position={[0, y as number, 0]}
          rotation={[Math.PI / 2, 0, 0]}
        />
      ))}
      <HeroPart
        geometry={G.disc}
        material={HERO_MAT.green}
        scale={[0.56, 0.024, 0.4]}
        position={[0, 0.086, 0]}
      />
      <HeroPart
        geometry={G.torusThin}
        material={HERO_MAT.paper}
        scale={[0.55, 0.55, 0.18]}
        position={[0, 0.1, 0]}
        rotation={[Math.PI / 2, 0, 0]}
      />
      <HeroPart
        geometry={G.disc}
        material={HERO_MAT.track}
        scale={[0.46, 0.012, 0.32]}
        position={[0, 0.099, 0]}
      />
      <HeroPart
        geometry={G.canopy}
        material={DOUBLE_CANOPY}
        scale={[1, 1, 1]}
        position={[0, 0.02, 0]}
      />
      <HeroPart
        geometry={G.stadiumRim}
        material={HERO_MAT.steelLight}
        scale={[1, 1, 1]}
        position={[0, 0.02, 0]}
      />
      <HeroPart
        geometry={G.stadiumInnerRim}
        material={HERO_MAT.paper}
        scale={[1, 1, 1]}
        position={[0, 0.02, 0]}
      />
      {supportAngles.map((angle) => (
        <group key={`support-${angle.toFixed(3)}`} rotation={[0, -angle, 0]}>
          <HeroPart
            geometry={G.cylinder8}
            material={HERO_MAT.steel}
            scale={[0.026, 0.34, 0.026]}
            position={[0.94, 0.3, 0]}
          />
          <HeroPart
            geometry={G.box}
            material={HERO_MAT.steelLight}
            scale={[0.3, 0.014, 0.016]}
            position={[0.8, 0.45, 0]}
            rotation={[0, 0, 0.35]}
          />
        </group>
      ))}
      <HeroPart
        geometry={G.rounded}
        material={HERO_MAT.concrete}
        scale={[0.42, 0.045, 0.24]}
        position={[0, 0.11, 0.67]}
      />
      <HeroPart
        geometry={G.rounded}
        material={HERO_MAT.terracotta}
        scale={[0.26, 0.075, 0.16]}
        position={[-0.34, 0.16, 0.64]}
      />
      <HeroPart
        geometry={G.box}
        material={HERO_MAT.paper}
        scale={[0.36, 0.24, 0.035]}
        position={[0.36, 0.25, 0.6]}
        rotation={[0, 0.48, 0]}
      />
      <HeroPart
        geometry={G.box}
        material={HERO_MAT.teal}
        scale={[0.26, 0.035, 0.012]}
        position={[0.36, 0.3, 0.62]}
        rotation={[0, 0.48, 0]}
      />
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Lotus Pond and Dragon/Tiger Pagodas                                 */
/* ------------------------------------------------------------------ */

function PagodaRoof({
  width,
  height,
  material,
}: {
  width: number;
  height: number;
  material: THREE.Material;
}) {
  return (
    <HeroPart
      geometry={G.pagodaRoof}
      material={material}
      scale={[width / 1.44, height / 0.9, width / 1.44]}
    />
  );
}

function PagodaHero({
  roofMaterial,
  accentMaterial,
}: {
  roofMaterial: THREE.Material;
  accentMaterial: THREE.Material;
}) {
  const levels = [0, 1, 2, 3, 4];
  let y = 0.06;
  return (
    <group>
      <HeroPart
        geometry={G.rounded}
        material={HERO_MAT.stone}
        scale={[0.34, 0.07, 0.34]}
        position={[0, 0.035, 0]}
      />
      {levels.map((level) => {
        const bodyWidth = 0.26 - level * 0.036;
        const bodyHeight = 0.115 - level * 0.008;
        const baseY = y;
        y += bodyHeight + 0.075;
        return (
          <group key={level} position={[0, baseY, 0]}>
            <HeroPart
              geometry={G.box}
              material={HERO_MAT.cream}
              scale={[bodyWidth, bodyHeight, bodyWidth]}
              position={[0, bodyHeight / 2, 0]}
            />
            {[-1, 1].flatMap((sx) =>
              [-1, 1].map((sz) => (
                <HeroPart
                  key={`column-${sx}-${sz}`}
                  geometry={G.box}
                  material={HERO_MAT.red}
                  scale={[0.018, bodyHeight, 0.018]}
                  position={[
                    sx * bodyWidth * 0.44,
                    bodyHeight / 2,
                    sz * bodyWidth * 0.44,
                  ]}
                />
              )),
            )}
            <HeroPart
              geometry={G.box}
              material={HERO_MAT.wood}
              scale={[bodyWidth + 0.02, 0.018, bodyWidth + 0.02]}
              position={[0, 0.008, 0]}
            />
            <group position={[0, bodyHeight, 0]}>
              <PagodaRoof
                width={bodyWidth * 1.72}
                height={0.1}
                material={level % 2 === 0 ? roofMaterial : accentMaterial}
              />
              {[-1, 1].flatMap((sx) =>
                [-1, 1].map((sz) => (
                  <HeroPart
                    key={`eave-tip-${sx}-${sz}`}
                    geometry={G.cone6}
                    material={HERO_MAT.gold}
                    scale={[0.024, 0.06, 0.024]}
                    position={[
                      sx * bodyWidth * 0.79,
                      0.105,
                      sz * bodyWidth * 0.79,
                    ]}
                    rotation={[sx * 0.3, 0, sz * 0.3]}
                  />
                )),
              )}
            </group>
          </group>
        );
      })}
      <HeroPart
        geometry={G.cylinder8}
        material={HERO_MAT.gold}
        scale={[0.018, 0.16, 0.018]}
        position={[0, y + 0.05, 0]}
      />
      <HeroPart
        geometry={G.cone6}
        material={HERO_MAT.gold}
        scale={[0.055, 0.13, 0.055]}
        position={[0, y + 0.16, 0]}
      />
    </group>
  );
}

function BeastHead({ kind }: { kind: 'dragon' | 'tiger' }) {
  const body = kind === 'dragon' ? HERO_MAT.greenDeep : HERO_MAT.orange;
  const mane = kind === 'dragon' ? HERO_MAT.gold : HERO_MAT.yellow;
  return (
    <group>
      <HeroPart
        geometry={G.rounded}
        material={body}
        scale={[0.19, 0.17, 0.18]}
        position={[0, 0.16, 0]}
      />
      <HeroPart
        geometry={G.rounded}
        material={body}
        scale={[0.16, 0.09, 0.2]}
        position={[0, 0.12, 0.12]}
      />
      <HeroPart
        geometry={G.sphereLow}
        material={HERO_MAT.paper}
        scale={[0.065, 0.065, 0.065]}
        position={[-0.07, 0.21, 0.12]}
      />
      <HeroPart
        geometry={G.sphereLow}
        material={HERO_MAT.paper}
        scale={[0.065, 0.065, 0.065]}
        position={[0.07, 0.21, 0.12]}
      />
      <HeroPart
        geometry={G.sphereLow}
        material={HERO_MAT.dark}
        scale={[0.028, 0.028, 0.02]}
        position={[-0.07, 0.21, 0.155]}
      />
      <HeroPart
        geometry={G.sphereLow}
        material={HERO_MAT.dark}
        scale={[0.028, 0.028, 0.02]}
        position={[0.07, 0.21, 0.155]}
      />
      <HeroPart
        geometry={G.cone6}
        material={mane}
        scale={[0.04, 0.15, 0.04]}
        position={[-0.09, 0.3, -0.02]}
        rotation={[0, 0, 0.4]}
      />
      <HeroPart
        geometry={G.cone6}
        material={mane}
        scale={[0.04, 0.15, 0.04]}
        position={[0.09, 0.3, -0.02]}
        rotation={[0, 0, -0.4]}
      />
      <HeroPart
        geometry={G.box}
        material={HERO_MAT.paper}
        scale={[0.13, 0.018, 0.04]}
        position={[0, 0.075, 0.2]}
      />
      {[-0.05, 0.05].map((x) => (
        <HeroPart
          key={`tooth-${x}`}
          geometry={G.cone4}
          material={HERO_MAT.paper}
          scale={[0.018, 0.05, 0.018]}
          position={[x, 0.065, 0.2]}
          rotation={[Math.PI, 0, 0]}
        />
      ))}
      <HeroPart
        geometry={G.rounded}
        material={body}
        scale={[0.07, 0.045, 0.09]}
        position={[0, 0.21, 0.18]}
      />
    </group>
  );
}

function LotusPagodas() {
  return (
    <group>
      <ContactShadow radius={1.02} />
      <HeroPart
        geometry={G.disc}
        material={HERO_MAT.water}
        scale={[1.0, 0.045, 0.78]}
        position={[0, 0.025, 0]}
      />
      <HeroPart
        geometry={G.disc}
        material={HERO_MAT.waterDeep}
        scale={[0.86, 0.038, 0.64]}
        position={[0, 0.034, 0]}
      />
      {[
        [-0.48, 0.25],
        [-0.24, 0.31],
        [0.02, 0.27],
        [0.3, 0.24],
        [0.47, -0.28],
        [0.19, -0.31],
        [-0.15, -0.28],
        [-0.42, -0.16],
        [0.62, 0.03],
        [-0.64, 0.06],
      ].map(([x, z], index) => (
        <group key={`leaf-${x}-${z}`} position={[x!, 0.058, z!]}>
          <HeroPart
            geometry={G.disc}
            material={HERO_MAT.green}
            scale={[0.11 + (index % 3) * 0.012, 0.012, 0.09]}
          />
          {index % 3 === 0 && (
            <HeroPart
              geometry={G.sphereLow}
              material={HERO_MAT.pink}
              scale={[0.06, 0.075, 0.06]}
              position={[0, 0.055, 0]}
            />
          )}
        </group>
      ))}
      <group position={[-0.48, 0.05, -0.1]} scale={0.9}>
        <PagodaHero
          roofMaterial={HERO_MAT.teal}
          accentMaterial={HERO_MAT.red}
        />
      </group>
      <group position={[0.5, 0.05, 0.04]} scale={0.9}>
        <PagodaHero
          roofMaterial={HERO_MAT.red}
          accentMaterial={HERO_MAT.teal}
        />
      </group>
      <group position={[0, 0.07, 0.46]}>
        {[-0.66, -0.44, -0.22, 0, 0.22, 0.44, 0.66].map((x, index) => (
          <group
            key={`bridge-${x}`}
            position={[x, 0, index % 2 === 0 ? -0.035 : 0.035]}
          >
            <HeroPart
              geometry={G.rounded}
              material={HERO_MAT.cream}
              scale={[0.25, 0.025, 0.1]}
            />
            <HeroPart
              geometry={G.box}
              material={HERO_MAT.red}
              scale={[0.018, 0.075, 0.018]}
              position={[-0.08, 0.05, 0.04]}
            />
            <HeroPart
              geometry={G.box}
              material={HERO_MAT.red}
              scale={[0.018, 0.075, 0.018]}
              position={[0.08, 0.05, 0.04]}
            />
          </group>
        ))}
      </group>
      <group position={[-0.86, 0.06, 0.46]} rotation={[0, Math.PI / 2, 0]}>
        <BeastHead kind="dragon" />
      </group>
      <group position={[0.86, 0.06, 0.46]} rotation={[0, -Math.PI / 2, 0]}>
        <BeastHead kind="tiger" />
      </group>
      <HeroPart
        geometry={G.rounded}
        material={HERO_MAT.concrete}
        scale={[1.34, 0.045, 0.13]}
        position={[0, 0.05, -0.52]}
      />
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Weiwuying                                                           */
/* ------------------------------------------------------------------ */

function Weiwuying() {
  return (
    <group>
      <ContactShadow radius={1.0} />
      <HeroPart
        geometry={G.disc}
        material={HERO_MAT.concrete}
        scale={[1.0, 0.06, 0.84]}
        position={[0, 0.04, 0]}
      />
      <HeroPart
        geometry={G.disc}
        material={HERO_MAT.sage}
        scale={[0.76, 0.05, 0.6]}
        position={[0, 0.065, 0.02]}
      />
      <group position={[0, 0.17, 0]}>
        <HeroPart
          geometry={G.rounded}
          material={HERO_MAT.glass}
          scale={[0.9, 0.2, 0.48]}
          position={[0, 0, -0.02]}
        />
        <HeroPart
          geometry={G.rounded}
          material={HERO_MAT.glassDeep}
          scale={[0.28, 0.17, 0.5]}
          position={[-0.34, 0, 0]}
        />
        <HeroPart
          geometry={G.rounded}
          material={HERO_MAT.glassGreen}
          scale={[0.22, 0.16, 0.44]}
          position={[0.36, 0.01, 0]}
        />
        <HeroPart
          geometry={G.rounded}
          material={HERO_MAT.glassGreen}
          scale={[0.7, 0.11, 0.26]}
          position={[0, 0.14, -0.02]}
        />
        {[-0.44, -0.22, 0, 0.22, 0.44].map((x) => (
          <HeroPart
            key={`facade-mullion-${x}`}
            geometry={G.box}
            material={HERO_MAT.steelLight}
            scale={[0.018, 0.21, 0.018]}
            position={[x, 0, 0.24]}
          />
        ))}
        <HeroPart
          geometry={G.box}
          material={HERO_MAT.cream}
          scale={[0.045, 0.24, 0.055]}
          position={[-0.56, 0.02, 0.12]}
          rotation={[0, 0, -0.16]}
        />
        <HeroPart
          geometry={G.box}
          material={HERO_MAT.cream}
          scale={[0.045, 0.22, 0.055]}
          position={[0.55, 0.02, -0.1]}
          rotation={[0, 0, 0.14]}
        />
      </group>
      <group position={[0, 0.16, 0]}>
        <HeroPart
          geometry={G.flowRoof}
          material={DOUBLE_ROOF}
          scale={[0.99, 0.97, 0.99]}
        />
        <HeroPart
          geometry={G.flowRim}
          material={HERO_MAT.steelLight}
          scale={[0.995, 0.985, 0.995]}
        />
        <HeroPart
          geometry={G.flowRim}
          material={HERO_MAT.cream}
          scale={[0.97, 0.96, 0.97]}
          position={[0, -0.018, 0]}
        />
      </group>
      {[
        [-0.46, -0.24],
        [0.46, -0.24],
        [-0.3, 0.26],
        [0.3, 0.26],
        [0, -0.32],
      ].map(([x, z]) => (
        <HeroPart
          key={`roof-column-${x}-${z}`}
          geometry={G.cylinder8}
          material={HERO_MAT.steel}
          scale={[0.03, 0.26, 0.03]}
          position={[x!, 0.27, z!]}
        />
      ))}
      <HeroPart
        geometry={G.rounded}
        material={HERO_MAT.cream}
        scale={[0.4, 0.05, 0.24]}
        position={[0, 0.15, 0.56]}
      />
      <HeroPart
        geometry={G.box}
        material={HERO_MAT.orange}
        scale={[0.23, 0.32, 0.035]}
        position={[-0.62, 0.32, 0.2]}
        rotation={[0, 0.4, 0.12]}
      />
      <HeroPart
        geometry={G.sphereLow}
        material={HERO_MAT.teal}
        scale={[0.07, 0.07, 0.07]}
        position={[0.72, 0.06, 0.46]}
      />
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Pier-2 Art Center                                                   */
/* ------------------------------------------------------------------ */

function Warehouse({
  position,
  width,
  depth,
  wall,
  roof,
  door,
}: {
  position: [number, number, number];
  width: number;
  depth: number;
  wall: THREE.Material;
  roof: THREE.Material;
  door: boolean;
}) {
  return (
    <group position={position}>
      <HeroPart
        geometry={G.box}
        material={wall}
        scale={[width, 0.3, depth]}
        position={[0, 0.15, 0]}
      />
      {[-0.42, -0.26, -0.1, 0.06, 0.22, 0.38].map((x) => (
        <HeroPart
          key={`wall-rib-${x}`}
          geometry={G.box}
          material={HERO_MAT.paper}
          scale={[0.012, 0.27, 0.012]}
          position={[x * width, 0.16, depth / 2 + 0.004]}
        />
      ))}
      <HeroPart
        geometry={G.gable}
        material={roof}
        scale={[width + 0.035, 0.17, depth + 0.035]}
        position={[0, 0.3, 0]}
      />
      <HeroPart
        geometry={G.box}
        material={HERO_MAT.steel}
        scale={[width + 0.05, 0.018, 0.022]}
        position={[0, 0.472, 0]}
      />
      {[-1, 1].map((side) => (
        <HeroPart
          key={`eave-${side}`}
          geometry={G.box}
          material={HERO_MAT.steelLight}
          scale={[width + 0.05, 0.02, 0.018]}
          position={[0, 0.299, side * (depth / 2 + 0.012)]}
        />
      ))}
      {[-0.23, 0, 0.23].map((x) => (
        <HeroPart
          key={`window-${x}`}
          geometry={G.rounded}
          material={HERO_MAT.glassDeep}
          scale={[0.1, 0.1, 0.025]}
          position={[x, 0.21, depth / 2 + 0.006]}
        />
      ))}
      {door && (
        <HeroPart
          geometry={G.rounded}
          material={HERO_MAT.dark}
          scale={[0.16, 0.19, 0.025]}
          position={[0, 0.105, depth / 2 + 0.009]}
        />
      )}
    </group>
  );
}

function Pier2() {
  return (
    <group>
      <ContactShadow radius={0.9} />
      <HeroPart
        geometry={G.rounded}
        material={HERO_MAT.concrete}
        scale={[1.52, 0.06, 0.92]}
        position={[0, 0.04, 0]}
      />
      <Warehouse
        position={[-0.42, 0.05, -0.08]}
        width={0.38}
        depth={0.5}
        wall={HERO_MAT.brickLight}
        roof={HERO_MAT.roofGreen}
        door
      />
      <Warehouse
        position={[0.04, 0.05, -0.04]}
        width={0.4}
        depth={0.52}
        wall={HERO_MAT.cream}
        roof={HERO_MAT.terracotta}
        door
      />
      <Warehouse
        position={[0.48, 0.05, -0.1]}
        width={0.34}
        depth={0.46}
        wall={HERO_MAT.brick}
        roof={HERO_MAT.steel}
        door={false}
      />
      <HeroPart
        geometry={G.box}
        material={HERO_MAT.track}
        scale={[1.38, 0.018, 0.028]}
        position={[0, 0.083, 0.56]}
      />
      {Array.from({ length: 11 }, (_, index) => (
        <HeroPart
          key={`rail-sleeper-${(-0.65 + index * 0.13).toFixed(2)}`}
          geometry={G.box}
          material={HERO_MAT.wood}
          scale={[0.035, 0.012, 0.12]}
          position={[-0.65 + index * 0.13, 0.08, 0.56]}
        />
      ))}
      <group position={[-0.66, 0.11, 0.24]}>
        <HeroPart
          geometry={G.rounded}
          material={HERO_MAT.orange}
          scale={[0.23, 0.15, 0.16]}
          position={[0, 0.075, 0]}
        />
        <HeroPart
          geometry={G.rounded}
          material={HERO_MAT.teal}
          scale={[0.23, 0.15, 0.16]}
          position={[0, 0.22, 0]}
        />
        <HeroPart
          geometry={G.rounded}
          material={HERO_MAT.red}
          scale={[0.23, 0.15, 0.16]}
          position={[0, 0.365, 0]}
        />
        <HeroPart
          geometry={G.box}
          material={HERO_MAT.steel}
          scale={[0.25, 0.012, 0.17]}
          position={[0, 0.16, 0]}
        />
        <HeroPart
          geometry={G.box}
          material={HERO_MAT.steel}
          scale={[0.25, 0.012, 0.17]}
          position={[0, 0.305, 0]}
        />
      </group>
      <HeroPart
        geometry={G.cylinder8}
        material={HERO_MAT.steel}
        scale={[0.045, 0.4, 0.045]}
        position={[0.74, 0.25, 0.24]}
      />
      <HeroPart
        geometry={G.sphere}
        material={HERO_MAT.orange}
        scale={[0.19, 0.19, 0.19]}
        position={[0.74, 0.49, 0.24]}
      />
      <HeroPart
        geometry={G.torus}
        material={HERO_MAT.gold}
        scale={[0.3, 0.3, 0.3]}
        position={[0.74, 0.49, 0.24]}
        rotation={[0, 0.35, 0]}
      />
      {[-0.15, 0.05].map((x) => (
        <group key={`tree-${x}`} position={[x, 0.1, 0.44]}>
          <HeroPart
            geometry={G.cylinder8}
            material={HERO_MAT.wood}
            scale={[0.045, 0.18, 0.045]}
            position={[0, 0.09, 0]}
          />
          <HeroPart
            geometry={G.ico}
            material={HERO_MAT.green}
            scale={[0.23, 0.25, 0.23]}
            position={[0, 0.29, 0]}
          />
        </group>
      ))}
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Dream Mall and Ferris wheel                                         */
/* ------------------------------------------------------------------ */

function FerrisWheel() {
  const cabins = Array.from({ length: 12 }, (_, index) => {
    const angle = (index / 12) * Math.PI * 2;
    const colors = [
      HERO_MAT.terracotta,
      HERO_MAT.teal,
      HERO_MAT.gold,
      HERO_MAT.red,
    ];
    return {
      angle,
      material: colors[index % colors.length]!,
    };
  });
  return (
    <group position={[0.38, 1.08, -0.04]} rotation={[0, Math.PI / 4, 0]}>
      <HeroPart
        geometry={G.torus}
        material={HERO_MAT.steelLight}
        scale={[0.76, 0.76, 0.88]}
      />
      <HeroPart
        geometry={G.torusThin}
        material={HERO_MAT.tealDeep}
        scale={[0.82, 0.82, 0.86]}
        position={[0, 0, 0.012]}
      />
      <HeroPart
        geometry={G.torusThin}
        material={HERO_MAT.steelLight}
        scale={[0.43, 0.43, 0.5]}
        position={[0, 0, 0.004]}
      />
      {Array.from({ length: 16 }, (_, index) => {
        const angle = (index / 16) * Math.PI * 2;
        return (
          <HeroPart
            key={`spoke-${angle.toFixed(3)}`}
            geometry={G.box}
            material={HERO_MAT.steelLight}
            scale={[0.39, 0.011, 0.011]}
            position={[Math.cos(angle) * 0.2, Math.sin(angle) * 0.2, 0.006]}
            rotation={[0, 0, angle]}
          />
        );
      })}
      {Array.from({ length: 12 }, (_, index) => {
        const angle = (index / 12) * Math.PI * 2 + Math.PI / 12;
        return (
          <HeroPart
            key={`brace-${angle.toFixed(3)}`}
            geometry={G.box}
            material={HERO_MAT.steel}
            scale={[0.2, 0.008, 0.008]}
            position={[Math.cos(angle) * 0.55, Math.sin(angle) * 0.55, 0.004]}
            rotation={[0, 0, angle + 0.9]}
          />
        );
      })}
      <HeroPart
        geometry={G.cylinder}
        material={HERO_MAT.gold}
        scale={[0.11, 0.1, 0.11]}
        position={[0, 0, 0.01]}
        rotation={[Math.PI / 2, 0, 0]}
      />
      {cabins.map(({ angle, material }) => (
        <group
          key={`cabin-${angle.toFixed(3)}`}
          position={[Math.cos(angle) * 0.79, Math.sin(angle) * 0.79, 0.048]}
        >
          <HeroPart
            geometry={G.box}
            material={HERO_MAT.dark}
            scale={[0.01, 0.055, 0.01]}
            position={[0, -0.027, 0]}
          />
          <HeroPart
            geometry={G.rounded}
            material={material}
            scale={[0.095, 0.105, 0.075]}
            position={[0, -0.09, 0]}
          />
          <HeroPart
            geometry={G.rounded}
            material={HERO_MAT.glassDeep}
            scale={[0.052, 0.036, 0.078]}
            position={[0, -0.088, 0.002]}
          />
          <HeroPart
            geometry={G.box}
            material={HERO_MAT.paper}
            scale={[0.1, 0.012, 0.078]}
            position={[0, -0.042, 0]}
          />
        </group>
      ))}
      <HeroPart
        geometry={G.box}
        material={HERO_MAT.steel}
        scale={[0.045, 0.62, 0.045]}
        position={[-0.16, -0.3, -0.03]}
        rotation={[0, 0, 0.25]}
      />
      <HeroPart
        geometry={G.box}
        material={HERO_MAT.steel}
        scale={[0.045, 0.62, 0.045]}
        position={[0.16, -0.3, -0.03]}
        rotation={[0, 0, -0.25]}
      />
      <HeroPart
        geometry={G.box}
        material={HERO_MAT.steelLight}
        scale={[0.32, 0.028, 0.04]}
        position={[0, -0.59, -0.03]}
      />
    </group>
  );
}

function DreamMall() {
  return (
    <group>
      <ContactShadow radius={1.02} />
      <HeroPart
        geometry={G.rounded}
        material={HERO_MAT.cream}
        scale={[1.56, 0.08, 0.9]}
        position={[0, 0.05, 0]}
      />
      <HeroPart
        geometry={G.rounded}
        material={HERO_MAT.cream}
        scale={[1.32, 0.23, 0.72]}
        position={[0, 0.19, 0]}
      />
      <HeroPart
        geometry={G.rounded}
        material={HERO_MAT.glassDeep}
        scale={[1.18, 0.1, 0.735]}
        position={[0, 0.24, 0]}
      />
      <HeroPart
        geometry={G.rounded}
        material={HERO_MAT.paper}
        scale={[1.06, 0.26, 0.6]}
        position={[0, 0.39, 0]}
      />
      <HeroPart
        geometry={G.rounded}
        material={HERO_MAT.glass}
        scale={[0.9, 0.07, 0.615]}
        position={[0, 0.41, 0]}
      />
      <HeroPart
        geometry={G.rounded}
        material={HERO_MAT.cream}
        scale={[1.13, 0.035, 0.66]}
        position={[0, 0.515, 0]}
      />
      <HeroPart
        geometry={G.rounded}
        material={HERO_MAT.terracotta}
        scale={[1.1, 0.055, 0.63]}
        position={[0, 0.555, 0]}
      />
      <HeroPart
        geometry={G.rounded}
        material={HERO_MAT.glassDeep}
        scale={[0.34, 0.17, 0.03]}
        position={[0.22, 0.2, 0.37]}
      />
      <HeroPart
        geometry={G.rounded}
        material={HERO_MAT.paper}
        scale={[0.16, 0.26, 0.03]}
        position={[-0.34, 0.24, 0.365]}
      />
      <HeroPart
        geometry={G.box}
        material={HERO_MAT.orange}
        scale={[0.13, 0.3, 0.03]}
        position={[-0.5, 0.38, 0.325]}
      />
      {[-0.7, -0.5, -0.3, -0.1, 0.1, 0.3, 0.5, 0.7].map((x) => (
        <HeroPart
          key={`mall-mullion-${x}`}
          geometry={G.box}
          material={HERO_MAT.steelLight}
          scale={[0.012, 0.22, 0.012]}
          position={[x, 0.23, 0.37]}
        />
      ))}
      <HeroPart
        geometry={G.rounded}
        material={HERO_MAT.cream}
        scale={[0.46, 0.06, 0.28]}
        position={[0, 0.15, 0.52]}
      />
      <HeroPart
        geometry={G.rounded}
        material={HERO_MAT.green}
        scale={[0.34, 0.025, 0.2]}
        position={[-0.3, 0.59, 0.04]}
      />
      <group position={[-0.64, 0.44, 0.16]}>
        <HeroPart
          geometry={G.sphere}
          material={HERO_MAT.glassBlue}
          scale={[0.46, 0.22, 0.3]}
        />
        <HeroPart
          geometry={G.sphere}
          material={HERO_MAT.paper}
          scale={[0.36, 0.095, 0.22]}
          position={[0.01, -0.075, 0.02]}
        />
        <HeroPart
          geometry={G.cone}
          material={HERO_MAT.glassBlue}
          scale={[0.14, 0.24, 0.1]}
          position={[-0.3, 0.02, 0]}
          rotation={[0, 0, Math.PI / 2]}
        />
        <HeroPart
          geometry={G.cone}
          material={HERO_MAT.glassBlue}
          scale={[0.1, 0.19, 0.07]}
          position={[-0.32, 0.12, 0]}
          rotation={[0, 0, Math.PI / 2.8]}
        />
        <HeroPart
          geometry={G.sphereLow}
          material={HERO_MAT.dark}
          scale={[0.022, 0.026, 0.022]}
          position={[0.14, 0.045, 0.135]}
        />
        {[-0.18, 0, 0.18].map((x) => (
          <HeroPart
            key={`whale-rib-${x}`}
            geometry={G.box}
            material={HERO_MAT.paper}
            scale={[0.012, 0.12, 0.22]}
            position={[x, 0.015, 0.1]}
            rotation={[0.18, 0, 0]}
          />
        ))}
      </group>
      <FerrisWheel />
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* 85 Sky Tower                                                        */
/* ------------------------------------------------------------------ */

function SkyTower85() {
  const bands = Array.from({ length: 9 }, (_, index) => 0.26 + index * 0.13);
  return (
    <group>
      <ContactShadow radius={0.58} />
      <HeroPart
        geometry={G.rounded}
        material={HERO_MAT.concrete}
        scale={[0.62, 0.07, 0.62]}
        position={[0, 0.045, 0]}
      />
      <HeroPart
        geometry={G.rounded}
        material={HERO_MAT.cream}
        scale={[0.52, 0.12, 0.46]}
        position={[0, 0.12, 0]}
      />
      <group position={[0, 0, 0]}>
        <HeroPart
          geometry={G.frustum}
          material={HERO_MAT.glassBlue}
          scale={[0.15, 0.66, 0.14]}
          position={[-0.16, 0.47, 0]}
          rotation={[0, Math.PI / 4, 0]}
        />
        <HeroPart
          geometry={G.frustum}
          material={HERO_MAT.glassBlue}
          scale={[0.15, 0.66, 0.14]}
          position={[0.16, 0.47, 0]}
          rotation={[0, Math.PI / 4, 0]}
        />
        <HeroPart
          geometry={G.rounded}
          material={HERO_MAT.steelLight}
          scale={[0.46, 0.035, 0.2]}
          position={[0, 0.62, 0]}
        />
        <HeroPart
          geometry={G.frustumSlim}
          material={HERO_MAT.glassDeep}
          scale={[0.17, 0.78, 0.16]}
          position={[0, 0.98, 0]}
          rotation={[0, Math.PI / 4, 0]}
        />
        <HeroPart
          geometry={G.frustumSlim}
          material={HERO_MAT.glassBlue}
          scale={[0.145, 0.42, 0.14]}
          position={[0, 1.48, 0]}
          rotation={[0, Math.PI / 4, 0]}
        />
        <HeroPart
          geometry={G.frustumSlim}
          material={HERO_MAT.glassDeep}
          scale={[0.11, 0.28, 0.105]}
          position={[0, 1.76, 0]}
          rotation={[0, Math.PI / 4, 0]}
        />
        {bands.map((y) => (
          <HeroPart
            key={`tower-band-${y}`}
            geometry={G.box}
            material={HERO_MAT.steelLight}
            scale={[
              0.31 - (y - 0.26) * 0.075,
              0.012,
              0.31 - (y - 0.26) * 0.075,
            ]}
            position={[0, y, 0]}
          />
        ))}
        {[-0.16, 0.16].map((x) => (
          <HeroPart
            key={`leg-window-${x}`}
            geometry={G.box}
            material={HERO_MAT.steelLight}
            scale={[0.012, 0.5, 0.014]}
            position={[x, 0.42, 0.075]}
          />
        ))}
        <HeroPart
          geometry={G.box}
          material={HERO_MAT.steelLight}
          scale={[0.28, 0.018, 0.018]}
          position={[0, 0.35, 0.08]}
        />
        <HeroPart
          geometry={G.rounded}
          material={HERO_MAT.cream}
          scale={[0.19, 0.045, 0.18]}
          position={[0, 1.93, 0]}
        />
        <HeroPart
          geometry={G.cylinder8}
          material={HERO_MAT.steelLight}
          scale={[0.012, 0.16, 0.012]}
          position={[0, 2.05, 0]}
        />
        <HeroPart
          geometry={G.sphereLow}
          material={HERO_MAT.orange}
          scale={[0.03, 0.03, 0.03]}
          position={[0, 2.14, 0]}
        />
      </group>
      {[-0.48, 0.48].map((x) => (
        <group key={`plaza-tree-${x}`} position={[x, 0.1, 0.36]}>
          <HeroPart
            geometry={G.cylinder8}
            material={HERO_MAT.wood}
            scale={[0.035, 0.14, 0.035]}
            position={[0, 0.07, 0]}
          />
          <HeroPart
            geometry={G.ico}
            material={HERO_MAT.green}
            scale={[0.17, 0.18, 0.17]}
            position={[0, 0.22, 0]}
          />
        </group>
      ))}
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Public component                                                    */
/* ------------------------------------------------------------------ */

export default function HeroLandmarkModel({
  feature,
}: {
  feature: DedicatedFeature;
}) {
  const spec = useMemo(() => HERO_ASSET_BY_FEATURE.get(feature), [feature]);
  const model = useMemo(() => {
    switch (feature) {
      case 'hsrStation':
        return <HsrStation />;
      case 'worldGamesStadium':
        return <WorldGamesStadium />;
      case 'lotusPagodas':
        return <LotusPagodas />;
      case 'weiwuying':
        return <Weiwuying />;
      case 'pier2':
        return <Pier2 />;
      case 'dreamMallFerris':
        return <DreamMall />;
      case 'skyTower85':
        return <SkyTower85 />;
      default:
        return null;
    }
  }, [feature]);
  return (
    <group
      name={`hero-${feature}`}
      userData={{ feature, label: spec?.label ?? feature }}
    >
      {model}
    </group>
  );
}
