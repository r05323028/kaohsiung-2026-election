import { useFrame, useThree } from '@react-three/fiber';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { HERO_ASSET_BY_FEATURE } from '../world/hero-landmarks';
import type { DedicatedFeature } from '../world/hex-landmarks';
import type { BoxSpec, StrutSpec, Vec3 } from './hero-geometry';
import {
  HSR_CANOPY,
  hsrCanopyHeight,
  hsrCanopyUnderside,
  isInsideWeiwuyingWell,
  makeBoxClusterGeometry,
  makeCurvedFacadeGeometry,
  makeCurvedFacadeTopCurve,
  makeFlaredCrownGeometry,
  makeGableRoofGeometry,
  makePagodaTierRoofGeometry,
  makeRadialShellGeometry,
  makeRibbonRoofGeometry,
  makeStadiumBowlGeometry,
  makeStrutGeometry,
  STADIUM_ROOF_START,
  STADIUM_ROOF_SWEEP,
  STADIUM_SQUASH_Z,
  stadiumRibbonPoint,
  stadiumRoofInnerLift,
  stadiumRoofInnerRadius,
  stadiumRoofOuterLift,
  stadiumRoofOuterRadius,
  superellipseRadius,
  WEIWUYING_ROOF,
  WEIWUYING_WELLS,
  weiwuyingRadiusAt,
  weiwuyingRoofHeight,
  weiwuyingRoofUnderside,
  wheelCabinPose,
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
  maroon: mat('#7d4f47', 0.6, 0.2),
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
  trackBlue: mat('#5f93b8', 0.82),
  roofGreen: mat('#6b9180', 0.72),
  shell: mat('#f6f2e8', 0.5, 0.08, { side: THREE.DoubleSide }),
  shellEdge: mat('#ddd3c2', 0.62, 0.04, { side: THREE.DoubleSide }),
  lattice: mat('#eef1ec', 0.5, 0.15, { side: THREE.DoubleSide }),
  cabinWhite: mat('#ffffff', 0.65, 0.1),
  well: mat('#2f5560', 0.34, 0.22),
};

const DOUBLE_ROOF = new THREE.MeshStandardMaterial({
  color: '#c4644c',
  roughness: 0.78,
  metalness: 0.04,
  side: THREE.DoubleSide,
});

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
  ring: new THREE.RingGeometry(0.9, 1, 48),
  frustum: new THREE.CylinderGeometry(1, 1.22, 1, 4),
  frustumSlim: new THREE.CylinderGeometry(1, 1.12, 1, 4),
  octagon: new THREE.CylinderGeometry(1, 1, 1, 8),
  octagonTaper: new THREE.CylinderGeometry(1, 1.06, 1, 8),
  gable: makeGableRoofGeometry(),
  bowl: makeStadiumBowlGeometry(),
  stadiumRibbon: makeRibbonRoofGeometry({
    startAngle: STADIUM_ROOF_START,
    sweep: STADIUM_ROOF_SWEEP,
    segments: 72,
    thickness: 0.03,
    innerRadius: stadiumRoofInnerRadius,
    outerRadius: stadiumRoofOuterRadius,
    innerLift: stadiumRoofInnerLift,
    outerLift: stadiumRoofOuterLift,
    squashZ: STADIUM_SQUASH_Z,
  }),
  hsrCanopy: makeRadialShellGeometry({
    radiusX: HSR_CANOPY.radiusX,
    radiusZ: HSR_CANOPY.radiusZ,
    radiusAt: (angle) => superellipseRadius(angle, 6),
    heightAt: hsrCanopyHeight,
    thickness: HSR_CANOPY.thickness,
    segments: 48,
    rings: 6,
  }),
  weiwuyingShell: makeRadialShellGeometry({
    radiusX: WEIWUYING_ROOF.radiusX,
    radiusZ: WEIWUYING_ROOF.radiusZ,
    radiusAt: weiwuyingRadiusAt,
    heightAt: weiwuyingRoofHeight,
    thickness: WEIWUYING_ROOF.thickness,
    segments: 88,
    rings: 16,
    holeAt: isInsideWeiwuyingWell,
  }),
  crown: makeFlaredCrownGeometry({
    baseRadius: 0.134,
    topRadius: 0.178,
    height: 0.13,
    notch: 0.055,
  }),
};

/* ------------------------------------------------------------------ */
/* Detail level + reduced motion                                       */
/* ------------------------------------------------------------------ */

type Detail = 'near' | 'far';

/**
 * Hero models keep their full trim only when the camera is close enough to
 * resolve it. The city view stays at the silhouette-only budget.
 */
function useLandmarkDetail(): Detail {
  const camera = useThree((state) => state.camera);
  const [detail, setDetail] = useState<Detail>('far');
  useFrame(() => {
    const zoom = (camera as THREE.OrthographicCamera).zoom ?? 0;
    const next: Detail = zoom >= 55 ? 'near' : 'far';
    setDetail((current) => (current === next ? current : next));
  });
  return detail;
}

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(query.matches);
    const onChange = (event: MediaQueryListEvent) => setReduced(event.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);
  return reduced;
}

type HeroPartProps = {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  scale?: Vec3;
  position?: Vec3;
  rotation?: Vec3;
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

const HSR_HALL_TOP = 0.375;

const HSR_FRAME = (() => {
  const struts: StrutSpec[] = [];
  const columns = 9;
  for (let index = 0; index < columns; index += 1) {
    const x = -0.56 + (index / (columns - 1)) * 1.12;
    struts.push({
      from: [x, 0.06, 0.19],
      to: [x, HSR_HALL_TOP, 0.19],
      width: 0.03,
    });
    struts.push({
      from: [x, HSR_HALL_TOP, 0.19],
      to: [x, hsrCanopyUnderside(x, 0.33), 0.33],
      width: 0.016,
    });
    struts.push({
      from: [x, HSR_HALL_TOP, 0.19],
      to: [x, hsrCanopyUnderside(x, 0.03), 0.03],
      width: 0.016,
    });
  }
  struts.push({
    from: [-0.56, HSR_HALL_TOP, 0.19],
    to: [0.56, HSR_HALL_TOP, 0.19],
    width: 0.018,
  });
  return makeStrutGeometry(struts);
})();

const HSR_SLEEPERS = makeBoxClusterGeometry(
  Array.from({ length: 13 }, (_, index) => ({
    position: [-0.6 + index * 0.1, 0.062, 0.33] as Vec3,
    scale: [0.05, 0.014, 0.14] as Vec3,
  })),
);

function HsrStation() {
  const detail = useLandmarkDetail();
  return (
    <group>
      <ContactShadow radius={0.92} />
      <HeroPart
        geometry={G.rounded}
        material={HERO_MAT.concrete}
        scale={[1.72, 0.06, 0.98]}
        position={[0, 0.03, 0]}
      />
      <HeroPart
        geometry={G.rounded}
        material={HERO_MAT.cream}
        scale={[1.34, 0.28, 0.52]}
        position={[0, 0.2, -0.1]}
      />
      <HeroPart
        geometry={G.box}
        material={HERO_MAT.dark}
        scale={[1.36, 0.06, 0.53]}
        position={[0, 0.35, -0.1]}
      />
      <HeroPart
        geometry={G.box}
        material={HERO_MAT.glassGreen}
        scale={[1.2, 0.14, 0.02]}
        position={[0, 0.2, 0.165]}
      />
      {detail === 'near' ? (
        <HeroPart
          geometry={G.box}
          material={HERO_MAT.steelLight}
          scale={[1.24, 0.02, 0.03]}
          position={[0, 0.29, 0.166]}
        />
      ) : null}
      <HeroPart geometry={HSR_FRAME} material={HERO_MAT.white} />
      <HeroPart
        geometry={G.hsrCanopy}
        material={HERO_MAT.shell}
        position={[0, 0, -0.02]}
      />
      <HeroPart
        geometry={G.box}
        material={HERO_MAT.track}
        scale={[1.5, 0.02, 0.2]}
        position={[0, 0.068, 0.33]}
      />
      <HeroPart
        geometry={G.box}
        material={HERO_MAT.steel}
        scale={[1.5, 0.014, 0.02]}
        position={[0, 0.076, 0.29]}
      />
      <HeroPart
        geometry={G.box}
        material={HERO_MAT.steel}
        scale={[1.5, 0.014, 0.02]}
        position={[0, 0.076, 0.37]}
      />
      {detail === 'near' ? (
        <HeroPart geometry={HSR_SLEEPERS} material={HERO_MAT.wood} />
      ) : null}
      <HeroPart
        geometry={G.rounded}
        material={HERO_MAT.cream}
        scale={[1.42, 0.1, 0.16]}
        position={[0, 0.11, 0.13]}
      />
      <HeroPart
        geometry={G.rounded}
        material={HERO_MAT.teal}
        scale={[1.06, 0.15, 0.14]}
        position={[0, 0.2, 0.33]}
      />
      <HeroPart
        geometry={G.rounded}
        material={HERO_MAT.paper}
        scale={[1.04, 0.045, 0.145]}
        position={[0, 0.283, 0.33]}
      />
      <HeroPart
        geometry={G.box}
        material={HERO_MAT.glassDeep}
        scale={[0.98, 0.055, 0.146]}
        position={[0, 0.222, 0.33]}
      />
      <HeroPart
        geometry={G.cone}
        material={HERO_MAT.teal}
        scale={[0.14, 0.16, 0.14]}
        position={[0.6, 0.2, 0.33]}
        rotation={[0, 0, -Math.PI / 2]}
      />
      <HeroPart
        geometry={G.box}
        material={HERO_MAT.orange}
        scale={[1.02, 0.035, 0.15]}
        position={[0, 0.135, 0.33]}
      />
      <HeroPart
        geometry={G.rounded}
        material={HERO_MAT.orange}
        scale={[0.18, 0.16, 0.08]}
        position={[0.62, 0.19, 0.13]}
      />
      <HeroPart
        geometry={G.box}
        material={HERO_MAT.paper}
        scale={[0.16, 0.05, 0.012]}
        position={[0.62, 0.25, 0.172]}
      />
      {[-0.34, -0.1].map((x) => (
        <HeroPart
          key={x}
          geometry={G.rounded}
          material={HERO_MAT.sage}
          scale={[0.14, 0.035, 0.06]}
          position={[x, 0.178, 0.13]}
        />
      ))}
      {[-0.78, 0.78].map((x) => (
        <HeroPart
          key={x}
          geometry={G.cylinder8}
          material={HERO_MAT.concrete}
          scale={[0.12, 0.05, 0.12]}
          position={[x, 0.085, -0.36]}
        />
      ))}
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* World Games Stadium                                                 */
/* ------------------------------------------------------------------ */

const STADIUM_TRUSS = (() => {
  const struts: StrutSpec[] = [];
  const bays = 16;
  const angles = Array.from(
    { length: bays },
    (_, index) => STADIUM_ROOF_START + (index / bays) * STADIUM_ROOF_SWEEP,
  );
  const tops = angles.map((angle) => {
    const point = stadiumRibbonPoint(
      angle,
      stadiumRoofOuterRadius,
      stadiumRoofOuterLift,
    );
    return [point[0], point[1] - 0.032, point[2]] as Vec3;
  });
  angles.forEach((angle, index) => {
    const top = tops[index];
    if (!top) return;
    const base: Vec3 = [
      Math.cos(angle) * 1.0,
      0.05,
      Math.sin(angle) * 1.0 * STADIUM_SQUASH_Z,
    ];
    struts.push({ from: base, to: top, width: 0.024 });
    const next = tops[(index + 1) % bays];
    if (next) {
      struts.push({ from: top, to: next, width: 0.016 });
      struts.push({ from: base, to: next, width: 0.014 });
    }
  });
  return makeStrutGeometry(struts);
})();

const STADIUM_SEAT_BANDS = [
  { radius: 0.55, y: 0.105, material: HERO_MAT.teal },
  { radius: 0.67, y: 0.165, material: HERO_MAT.orange },
  { radius: 0.8, y: 0.225, material: HERO_MAT.yellow },
];

function WorldGamesStadium() {
  return (
    <group>
      <ContactShadow radius={1.02} />
      <HeroPart
        geometry={G.disc}
        material={HERO_MAT.concrete}
        scale={[1.0, 0.05, 0.72]}
        position={[0, 0.035, 0]}
      />
      <HeroPart geometry={G.bowl} material={HERO_MAT.cream} />
      <HeroPart
        geometry={G.disc}
        material={HERO_MAT.trackBlue}
        scale={[0.43, 0.012, 0.31]}
        position={[0, 0.068, 0]}
      />
      <HeroPart
        geometry={G.disc}
        material={HERO_MAT.green}
        scale={[0.28, 0.02, 0.2]}
        position={[0, 0.075, 0]}
      />
      <HeroPart
        geometry={G.ring}
        material={HERO_MAT.paper}
        scale={[0.33, 0.238, 1]}
        position={[0, 0.09, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
      />
      {STADIUM_SEAT_BANDS.map((band) => (
        <HeroPart
          key={band.radius}
          geometry={G.ring}
          material={band.material}
          scale={[band.radius, band.radius * STADIUM_SQUASH_Z, 1]}
          position={[0, band.y, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
        />
      ))}
      <HeroPart geometry={G.stadiumRibbon} material={HERO_MAT.shell} />
      <HeroPart geometry={STADIUM_TRUSS} material={HERO_MAT.lattice} />
      <HeroPart
        geometry={G.box}
        material={HERO_MAT.concrete}
        scale={[0.2, 0.12, 0.1]}
        position={[-0.2, 0.1, -0.66]}
      />
      <HeroPart
        geometry={G.box}
        material={HERO_MAT.dark}
        scale={[0.3, 0.14, 0.02]}
        position={[-0.2, 0.24, -0.66]}
      />
      <HeroPart
        geometry={G.box}
        material={HERO_MAT.paper}
        scale={[0.28, 0.03, 0.022]}
        position={[-0.2, 0.32, -0.66]}
      />
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Dragon and Tiger Pagodas                                            */
/* ------------------------------------------------------------------ */

const PAGODA_TIERS = 7;

type PagodaTier = {
  bodyHalf: number;
  bodyHeight: number;
  base: number;
  rise: number;
};

function pagodaTiers(): PagodaTier[] {
  const tiers: PagodaTier[] = [];
  let base = 0.15;
  for (let level = 0; level < PAGODA_TIERS; level += 1) {
    const bodyHalf = 0.115 - level * 0.008;
    const bodyHeight = 0.098 - level * 0.004;
    const rise = 0.058 - level * 0.002;
    tiers.push({ bodyHalf, bodyHeight, base, rise });
    base += bodyHeight + rise * 0.7;
  }
  return tiers;
}

const PAGODA_TIER_DATA = pagodaTiers();
const PAGODA_TOP_TIER = PAGODA_TIER_DATA[PAGODA_TIER_DATA.length - 1];
const PAGODA_FINIAL_Y = PAGODA_TOP_TIER
  ? PAGODA_TOP_TIER.base + PAGODA_TOP_TIER.bodyHeight + PAGODA_TOP_TIER.rise
  : 1.02;

const PAGODA_BODIES = makeBoxClusterGeometry(
  PAGODA_TIER_DATA.map((tier) => ({
    position: [0, tier.base + tier.bodyHeight / 2, 0] as Vec3,
    scale: [tier.bodyHalf * 2, tier.bodyHeight, tier.bodyHalf * 2] as Vec3,
  })),
);

const PAGODA_ROOFS = PAGODA_TIER_DATA.map((tier) =>
  makePagodaTierRoofGeometry({
    halfWidth: tier.bodyHalf * 1.45,
    rise: tier.rise,
    upturn: 0.022,
    thickness: 0.012,
    segments: 24,
    rings: 4,
  }),
);

const PAGODA_REDWORK = (() => {
  const boxes: BoxSpec[] = [];
  for (const tier of PAGODA_TIER_DATA) {
    const half = tier.bodyHalf;
    const top = tier.base + tier.bodyHeight;
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        boxes.push({
          position: [
            sx * half * 0.86,
            tier.base + tier.bodyHeight / 2,
            sz * half * 0.86,
          ] as Vec3,
          scale: [0.014, tier.bodyHeight, 0.014] as Vec3,
        });
      }
    }
    boxes.push({
      position: [0, tier.base + 0.004, 0] as Vec3,
      scale: [half * 2 + 0.03, 0.008, half * 2 + 0.03] as Vec3,
    });
    for (const side of [-1, 1]) {
      boxes.push({
        position: [0, tier.base + 0.026, side * (half + 0.012)] as Vec3,
        scale: [half * 2 + 0.03, 0.008, 0.008] as Vec3,
      });
      boxes.push({
        position: [side * (half + 0.012), tier.base + 0.026, 0] as Vec3,
        scale: [0.008, 0.008, half * 2 + 0.03] as Vec3,
      });
    }
    boxes.push({
      position: [0, top - 0.008, 0] as Vec3,
      scale: [half * 2 + 0.012, 0.012, half * 2 + 0.012] as Vec3,
    });
  }
  for (let index = 0; index < 8; index += 1) {
    const angle = (index / 8) * Math.PI * 2 + Math.PI / 8;
    boxes.push({
      position: [Math.cos(angle) * 0.13, 0.09, Math.sin(angle) * 0.13] as Vec3,
      scale: [0.014, 0.1, 0.014] as Vec3,
    });
  }
  return makeBoxClusterGeometry(boxes);
})();

function PagodaHero() {
  return (
    <group>
      <HeroPart
        geometry={G.rounded}
        material={HERO_MAT.stone}
        scale={[0.32, 0.05, 0.32]}
        position={[0, 0.05, 0]}
      />
      <HeroPart
        geometry={G.rounded}
        material={HERO_MAT.cream}
        scale={[0.3, 0.02, 0.3]}
        position={[0, 0.135, 0]}
      />
      <HeroPart geometry={PAGODA_BODIES} material={HERO_MAT.cream} />
      <HeroPart geometry={PAGODA_REDWORK} material={HERO_MAT.red} />
      {PAGODA_ROOFS.map((geometry, index) => {
        const tier = PAGODA_TIER_DATA[index];
        if (!tier) return null;
        return (
          <HeroPart
            key={tier.base}
            geometry={geometry}
            material={DOUBLE_ROOF}
            position={[0, tier.base + tier.bodyHeight - 0.004, 0]}
          />
        );
      })}
      <HeroPart
        geometry={G.cylinder8}
        material={HERO_MAT.gold}
        scale={[0.03, 0.03, 0.03]}
        position={[0, PAGODA_FINIAL_Y + 0.012, 0]}
      />
      <HeroPart
        geometry={G.sphereLow}
        material={HERO_MAT.gold}
        scale={[0.026, 0.05, 0.026]}
        position={[0, PAGODA_FINIAL_Y + 0.045, 0]}
      />
      <HeroPart
        geometry={G.cone6}
        material={HERO_MAT.gold}
        scale={[0.03, 0.05, 0.03]}
        position={[0, PAGODA_FINIAL_Y + 0.08, 0]}
      />
    </group>
  );
}

function BeastHead({ kind }: { kind: 'dragon' | 'tiger' }) {
  const isDragon = kind === 'dragon';
  const skin = isDragon ? HERO_MAT.greenDeep : HERO_MAT.orange;
  const stripe = isDragon ? HERO_MAT.green : HERO_MAT.dark;
  return (
    <group>
      <HeroPart
        geometry={G.rounded}
        material={skin}
        scale={[0.19, 0.17, 0.18]}
        position={[0, 0.13, 0]}
      />
      <HeroPart
        geometry={G.rounded}
        material={skin}
        scale={[0.13, 0.09, 0.13]}
        position={[0, 0.11, 0.13]}
      />
      <HeroPart
        geometry={G.box}
        material={HERO_MAT.paper}
        scale={[0.12, 0.045, 0.1]}
        position={[0, 0.075, 0.15]}
      />
      {[-0.045, 0.045].map((x) => (
        <group key={x}>
          <HeroPart
            geometry={G.sphereLow}
            material={HERO_MAT.paper}
            scale={[0.05, 0.05, 0.03]}
            position={[x, 0.2, 0.1]}
          />
          <HeroPart
            geometry={G.sphereLow}
            material={HERO_MAT.dark}
            scale={[0.022, 0.026, 0.016]}
            position={[x, 0.2, 0.118]}
          />
        </group>
      ))}
      <HeroPart
        geometry={G.cone6}
        material={skin}
        scale={[0.045, 0.1, 0.045]}
        position={[-0.06, 0.235, -0.04]}
        rotation={[0, 0, 0.35]}
      />
      <HeroPart
        geometry={G.cone6}
        material={skin}
        scale={[0.045, 0.1, 0.045]}
        position={[0.06, 0.235, -0.04]}
        rotation={[0, 0, -0.35]}
      />
      <HeroPart
        geometry={G.box}
        material={stripe}
        scale={[0.14, 0.012, 0.09]}
        position={[0, 0.155, 0.1]}
      />
      {[-0.035, 0.035].map((x) => (
        <HeroPart
          key={x}
          geometry={G.cone4}
          material={HERO_MAT.paper}
          scale={[0.018, 0.03, 0.018]}
          position={[x, 0.055, 0.16]}
          rotation={[Math.PI, 0, 0]}
        />
      ))}
    </group>
  );
}

const LOTUS_PADS = makeBoxClusterGeometry(
  Array.from({ length: 9 }, (_, index) => {
    const angle = (index / 9) * Math.PI * 2 + 0.4;
    const radius = 0.22 + (index % 3) * 0.09;
    return {
      position: [
        Math.cos(angle) * radius * 1.3,
        0.05,
        Math.sin(angle) * radius,
      ] as Vec3,
      scale: [0.11 + (index % 2) * 0.03, 0.012, 0.1] as Vec3,
      rotation: [0, angle, 0] as Vec3,
    };
  }),
);

const LOTUS_BRIDGE_DECKS = makeBoxClusterGeometry(
  [-0.46, 0.46].flatMap((x) =>
    Array.from({ length: 6 }, (_, index) => ({
      position: [x, 0.066, 0.17 + index * 0.07] as Vec3,
      scale: [0.12, 0.018, 0.074] as Vec3,
      rotation: [0, index % 2 === 0 ? 0.09 : -0.09, 0] as Vec3,
    })),
  ),
);

const LOTUS_BRIDGE_POSTS = makeBoxClusterGeometry(
  [-0.46, 0.46].flatMap((x) =>
    Array.from({ length: 6 }, (_, index) => ({
      position: [x, 0.05, 0.17 + index * 0.07] as Vec3,
      scale: [0.012, 0.05, 0.012] as Vec3,
    })),
  ),
);

function LotusPagodas() {
  const detail = useLandmarkDetail();
  return (
    <group>
      <ContactShadow radius={0.98} />
      <HeroPart
        geometry={G.disc}
        material={HERO_MAT.water}
        scale={[1.0, 0.045, 0.78]}
        position={[0, 0.02, 0]}
      />
      <HeroPart
        geometry={G.disc}
        material={HERO_MAT.waterDeep}
        scale={[0.86, 0.038, 0.64]}
        position={[0, 0.028, 0]}
      />
      <HeroPart geometry={LOTUS_PADS} material={HERO_MAT.sage} />
      {[-0.34, 0.28].map((x) => (
        <HeroPart
          key={x}
          geometry={G.sphereLow}
          material={HERO_MAT.pink}
          scale={[0.05, 0.09, 0.05]}
          position={[x, 0.075, 0.24]}
        />
      ))}
      <HeroPart
        geometry={G.rounded}
        material={HERO_MAT.stone}
        scale={[1.32, 0.05, 0.16]}
        position={[0, 0.045, 0.6]}
      />
      <HeroPart geometry={LOTUS_BRIDGE_DECKS} material={HERO_MAT.wood} />
      <HeroPart geometry={LOTUS_BRIDGE_POSTS} material={HERO_MAT.red} />
      {[-0.46, 0.46].map((x, index) => (
        <group key={x} position={[x, 0.06, -0.12]}>
          <group scale={0.92}>
            <PagodaHero />
          </group>
          <group position={[0, 0.005, 0.13]} scale={0.72}>
            <BeastHead kind={index === 0 ? 'dragon' : 'tiger'} />
          </group>
        </group>
      ))}
      {detail === 'near' ? (
        <HeroPart
          geometry={G.rounded}
          material={HERO_MAT.cream}
          scale={[1.26, 0.02, 0.1]}
          position={[0, 0.078, 0.6]}
        />
      ) : null}
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* National Kaohsiung Center for the Arts (Weiwuying)                  */
/* ------------------------------------------------------------------ */

/** Lowest point of the roof over a courtyard, so its floor always sits below. */
function wellRoofFloor(well: {
  x: number;
  z: number;
  width: number;
  depth: number;
}) {
  let height = Infinity;
  for (const dx of [-0.5, 0, 0.5]) {
    for (const dz of [-0.5, 0, 0.5]) {
      height = Math.min(
        height,
        weiwuyingRoofHeight(well.x + dx * well.width, well.z + dz * well.depth),
      );
    }
  }
  return height;
}

const WEIWUYING_COLUMNS = (() => {
  const struts: StrutSpec[] = [];
  const rings = [
    { rx: 0.8, rz: 0.58, count: 12 },
    { rx: 0.42, rz: 0.32, count: 6 },
  ];
  for (const ring of rings) {
    const points = Array.from({ length: ring.count }, (_, index) => {
      const angle = (index / ring.count) * Math.PI * 2;
      const x = Math.cos(angle) * ring.rx;
      const z = Math.sin(angle) * ring.rz;
      return [x, weiwuyingRoofUnderside(x, z) - 0.004, z] as Vec3;
    });
    points.forEach((point, index) => {
      struts.push({
        from: [point[0], 0.1, point[2]],
        to: point,
        width: 0.028,
      });
      const next = points[(index + 1) % ring.count];
      if (next) struts.push({ from: point, to: next, width: 0.02 });
    });
  }
  return makeStrutGeometry(struts);
})();

const WEIWUYING_RIM = makeStrutGeometry(
  Array.from({ length: 88 }, (_, index) => {
    const angle = (index / 88) * Math.PI * 2;
    const nextAngle = ((index + 1) / 88) * Math.PI * 2;
    const at = (a: number): Vec3 => {
      const radius = weiwuyingRadiusAt(a);
      const x = Math.cos(a) * radius * WEIWUYING_ROOF.radiusX;
      const z = Math.sin(a) * radius * WEIWUYING_ROOF.radiusZ;
      return [x, weiwuyingRoofHeight(x, z) - WEIWUYING_ROOF.thickness * 0.5, z];
    };
    return { from: at(angle), to: at(nextAngle), width: 0.022 };
  }),
);

const WEIWUYING_MULLIONS = makeBoxClusterGeometry([
  ...Array.from({ length: 11 }, (_, index) => {
    const x = -0.6 + index * 0.12;
    return [
      { position: [x, 0.2, 0.482] as Vec3, scale: [0.014, 0.26, 0.01] as Vec3 },
      {
        position: [x, 0.2, -0.482] as Vec3,
        scale: [0.014, 0.26, 0.01] as Vec3,
      },
    ];
  }).flat(),
  ...Array.from({ length: 9 }, (_, index) => {
    const z = -0.4 + index * 0.1;
    return [
      { position: [0.642, 0.2, z] as Vec3, scale: [0.01, 0.26, 0.014] as Vec3 },
      {
        position: [-0.642, 0.2, z] as Vec3,
        scale: [0.01, 0.26, 0.014] as Vec3,
      },
    ];
  }).flat(),
]);

function Weiwuying() {
  const detail = useLandmarkDetail();
  return (
    <group>
      <ContactShadow radius={1.0} />
      <HeroPart
        geometry={G.disc}
        material={HERO_MAT.concrete}
        scale={[1.04, 0.05, 0.84]}
        position={[0, 0.025, 0]}
      />
      <HeroPart
        geometry={G.disc}
        material={HERO_MAT.sage}
        scale={[0.94, 0.045, 0.74]}
        position={[0, 0.03, 0]}
      />
      <HeroPart
        geometry={G.disc}
        material={HERO_MAT.cream}
        scale={[0.88, 0.05, 0.72]}
        position={[0, 0.075, 0]}
      />
      <HeroPart
        geometry={G.rounded}
        material={HERO_MAT.glassDeep}
        scale={[1.28, 0.26, 0.96]}
        position={[0, 0.2, 0]}
      />
      {detail === 'near' ? (
        <HeroPart
          geometry={WEIWUYING_MULLIONS}
          material={HERO_MAT.steelLight}
        />
      ) : null}
      <HeroPart
        geometry={G.rounded}
        material={HERO_MAT.cream}
        scale={[1.34, 0.04, 1.02]}
        position={[0, 0.345, 0]}
      />
      <HeroPart geometry={G.weiwuyingShell} material={HERO_MAT.shell} />
      <HeroPart geometry={WEIWUYING_COLUMNS} material={HERO_MAT.white} />
      {WEIWUYING_WELLS.map((well) => (
        <HeroPart
          key={String(well.x) + '-' + String(well.z)}
          geometry={G.box}
          material={HERO_MAT.well}
          scale={[well.width + 0.05, 0.14, well.depth + 0.05]}
          position={[well.x, wellRoofFloor(well) - 0.085, well.z]}
        />
      ))}
      <HeroPart geometry={WEIWUYING_RIM} material={HERO_MAT.shellEdge} />
      {[
        [-0.86, -0.58],
        [0.88, -0.52],
        [0.92, 0.52],
        [-0.9, 0.54],
      ].map(([x, z]) => (
        <group
          key={String(x) + '-' + String(z)}
          position={[x ?? 0, 0.06, z ?? 0]}
        >
          <HeroPart
            geometry={G.cylinder8}
            material={HERO_MAT.concrete}
            scale={[0.14, 0.06, 0.14]}
          />
          <HeroPart
            geometry={G.ico}
            material={HERO_MAT.greenDeep}
            scale={[0.16, 0.18, 0.16]}
            position={[0, 0.11, 0]}
          />
        </group>
      ))}
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Pier-2 Warehouses                                                   */
/* ------------------------------------------------------------------ */

type WarehouseProps = {
  position: Vec3;
  width: number;
  depth: number;
  wall: THREE.Material;
  roof: THREE.Material;
  door?: boolean;
};

function Warehouse({
  position,
  width,
  depth,
  wall,
  roof,
  door,
}: WarehouseProps) {
  const detail = useLandmarkDetail();
  return (
    <group position={position}>
      <HeroPart
        geometry={G.box}
        material={wall}
        scale={[width, 0.3, depth]}
        position={[0, 0.15, 0]}
      />
      {Array.from({ length: 6 }, (_, index) => {
        const x = -width / 2 + 0.03 + index * ((width - 0.06) / 5);
        return (
          <HeroPart
            key={x}
            geometry={G.box}
            material={HERO_MAT.paper}
            scale={[0.012, 0.26, 0.014]}
            position={[x, 0.16, depth / 2 + 0.006]}
          />
        );
      })}
      <HeroPart
        geometry={G.gable}
        material={roof}
        scale={[width + 0.035, 0.17, depth + 0.035]}
        position={[0, 0.3, 0]}
      />
      <HeroPart
        geometry={G.box}
        material={HERO_MAT.steel}
        scale={[width + 0.04, 0.014, 0.03]}
        position={[0, 0.47, 0]}
      />
      <HeroPart
        geometry={G.box}
        material={roof}
        scale={[width + 0.05, 0.02, 0.05]}
        position={[0, 0.297, depth / 2 + 0.01]}
      />
      {Array.from({ length: 3 }, (_, index) => {
        const x = -width * 0.24 + index * width * 0.24;
        return (
          <HeroPart
            key={x}
            geometry={G.box}
            material={HERO_MAT.glass}
            scale={[0.1, 0.1, 0.025]}
            position={[x, 0.21, depth / 2 + 0.008]}
          />
        );
      })}
      {door ? (
        <HeroPart
          geometry={G.box}
          material={HERO_MAT.dark}
          scale={[0.12, 0.16, 0.025]}
          position={[width * 0.34, 0.1, depth / 2 + 0.008]}
        />
      ) : null}
      {detail === 'near' ? (
        <HeroPart
          geometry={G.box}
          material={HERO_MAT.steel}
          scale={[width + 0.02, 0.014, 0.02]}
          position={[0, 0.36, depth / 2 + 0.004]}
        />
      ) : null}
    </group>
  );
}

const PIER2_TRACK = makeBoxClusterGeometry(
  Array.from({ length: 13 }, (_, index) => ({
    position: [-0.56 + index * 0.095, 0.064, 0.56] as Vec3,
    scale: [0.05, 0.012, 0.12] as Vec3,
  })),
);

function Pier2() {
  return (
    <group>
      <ContactShadow radius={0.96} />
      <HeroPart
        geometry={G.rounded}
        material={HERO_MAT.concrete}
        scale={[1.52, 0.06, 0.92]}
        position={[0, 0.03, 0]}
      />
      <Warehouse
        position={[-0.42, 0.05, -0.08]}
        width={0.38}
        depth={0.5}
        wall={HERO_MAT.brickLight}
        roof={HERO_MAT.roofGreen}
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
      />
      <HeroPart
        geometry={G.box}
        material={HERO_MAT.steel}
        scale={[1.4, 0.012, 0.014]}
        position={[0, 0.062, 0.52]}
      />
      <HeroPart
        geometry={G.box}
        material={HERO_MAT.steel}
        scale={[1.4, 0.012, 0.014]}
        position={[0, 0.062, 0.6]}
      />
      <HeroPart geometry={PIER2_TRACK} material={HERO_MAT.wood} />
      {[
        {
          position: [-0.66, 0.11, 0.24] as Vec3,
          scale: [0.2, 0.1, 0.16] as Vec3,
          material: HERO_MAT.orange,
        },
        {
          position: [-0.66, 0.19, 0.24] as Vec3,
          scale: [0.16, 0.08, 0.14] as Vec3,
          material: HERO_MAT.teal,
        },
        {
          position: [-0.66, 0.25, 0.24] as Vec3,
          scale: [0.12, 0.06, 0.12] as Vec3,
          material: HERO_MAT.red,
        },
      ].map((crate) => (
        <HeroPart
          key={String(crate.position[1])}
          geometry={G.rounded}
          material={crate.material}
          position={crate.position}
          scale={crate.scale}
        />
      ))}
      <HeroPart
        geometry={G.box}
        material={HERO_MAT.steel}
        scale={[0.02, 0.12, 0.02]}
        position={[0.18, 0.53, 0.06]}
      />
      <HeroPart
        geometry={G.box}
        material={HERO_MAT.steel}
        scale={[0.02, 0.12, 0.02]}
        position={[0.3, 0.53, 0.06]}
      />
      <HeroPart
        geometry={G.box}
        material={HERO_MAT.paper}
        scale={[0.24, 0.06, 0.014]}
        position={[0.24, 0.6, 0.06]}
      />
      {[-0.28, 0.3].map((x) => (
        <group key={x} position={[x, 0.06, 0.34]}>
          <HeroPart
            geometry={G.cylinder8}
            material={HERO_MAT.wood}
            scale={[0.02, 0.1, 0.02]}
          />
          <HeroPart
            geometry={G.ico}
            material={HERO_MAT.green}
            scale={[0.13, 0.14, 0.13]}
            position={[0, 0.14, 0]}
          />
        </group>
      ))}
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Kaohsiung Eye: ferris wheel as one mechanical assembly               */
/* ------------------------------------------------------------------ */

const WHEEL_RADIUS = 0.4;
const WHEEL_CABINS = 16;
const WHEEL_HALF_DEPTH = 0.055;
const WHEEL_COLORS = ['#c98b6b', '#6fa8a0', '#d9b56a', '#b8726a'];

const WHEEL_RIM_GEOMETRY = new THREE.TorusGeometry(WHEEL_RADIUS, 0.016, 8, 72);

const WHEEL_SPOKES = (() => {
  const struts: StrutSpec[] = [];
  const spokes = 20;
  for (let index = 0; index < spokes; index += 1) {
    const angle = (index / spokes) * Math.PI * 2;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    for (const z of [-WHEEL_HALF_DEPTH, WHEEL_HALF_DEPTH]) {
      struts.push({
        from: [cos * 0.045, sin * 0.045, z],
        to: [cos * WHEEL_RADIUS, sin * WHEEL_RADIUS, z],
        width: 0.008,
      });
    }
    struts.push({
      from: [cos * WHEEL_RADIUS, sin * WHEEL_RADIUS, -WHEEL_HALF_DEPTH],
      to: [cos * WHEEL_RADIUS, sin * WHEEL_RADIUS, WHEEL_HALF_DEPTH],
      width: 0.007,
    });
  }
  return makeStrutGeometry(struts);
})();

const WHEEL_BRACKETS = makeBoxClusterGeometry(
  Array.from({ length: 20 }, (_, index) => {
    const angle = (index / 20) * Math.PI * 2;
    return {
      position: [
        Math.cos(angle) * WHEEL_RADIUS,
        Math.sin(angle) * WHEEL_RADIUS,
        0,
      ] as Vec3,
      scale: [0.03, 0.03, WHEEL_HALF_DEPTH * 2 + 0.02] as Vec3,
    };
  }),
);

const WHEEL_LEGS = (() => {
  const struts: StrutSpec[] = [];
  for (const z of [-0.075, 0.075]) {
    struts.push({ from: [-0.26, -0.44, z], to: [-0.03, 0, z], width: 0.026 });
    struts.push({ from: [0.26, -0.44, z], to: [0.03, 0, z], width: 0.026 });
    struts.push({ from: [-0.26, -0.44, z], to: [0.26, -0.44, z], width: 0.03 });
    struts.push({
      from: [-0.16, -0.24, z],
      to: [0.16, -0.24, z],
      width: 0.016,
    });
  }
  for (const x of [-0.26, 0.26]) {
    struts.push({
      from: [x, -0.44, -0.075],
      to: [x, -0.44, 0.075],
      width: 0.03,
    });
  }
  return makeStrutGeometry(struts);
})();

const WHEEL_CABIN_BODY = makeBoxClusterGeometry([
  { position: [0, -0.012, 0], scale: [0.012, 0.026, 0.012] },
  { position: [0, -0.03, 0], scale: [0.009, 0.036, 0.009] },
  { position: [0, -0.082, 0], scale: [0.078, 0.088, 0.075] },
  { position: [0, -0.031, 0], scale: [0.086, 0.014, 0.083] },
  { position: [0, -0.133, 0], scale: [0.07, 0.012, 0.068] },
]);

const WHEEL_CABIN_GLASS = makeBoxClusterGeometry([
  { position: [0, -0.082, 0], scale: [0.08, 0.04, 0.077] },
]);

function FerrisWheel() {
  const rotating = useRef<THREE.Group>(null);
  const bodies = useRef<THREE.InstancedMesh>(null);
  const glass = useRef<THREE.InstancedMesh>(null);
  const wheelAngle = useRef(0);
  const reducedMotion = usePrefersReducedMotion();
  const dummy = useMemo(() => new THREE.Object3D(), []);

  const applyPoses = useCallback(
    (angle: number) => {
      const bodyMesh = bodies.current;
      const glassMesh = glass.current;
      if (!bodyMesh || !glassMesh) return;
      for (let index = 0; index < WHEEL_CABINS; index += 1) {
        const pose = wheelCabinPose(index, WHEEL_CABINS, WHEEL_RADIUS, angle);
        dummy.position.set(pose.x, pose.y, 0);
        dummy.rotation.set(0, 0, pose.counterRotation);
        dummy.updateMatrix();
        bodyMesh.setMatrixAt(index, dummy.matrix);
        glassMesh.setMatrixAt(index, dummy.matrix);
      }
      bodyMesh.instanceMatrix.needsUpdate = true;
      glassMesh.instanceMatrix.needsUpdate = true;
    },
    [dummy],
  );

  useEffect(() => {
    const bodyMesh = bodies.current;
    if (!bodyMesh) return;
    bodyMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    glass.current?.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const color = new THREE.Color();
    for (let index = 0; index < WHEEL_CABINS; index += 1) {
      color.set(WHEEL_COLORS[index % WHEEL_COLORS.length] ?? '#cf7a51');
      bodyMesh.setColorAt(index, color);
    }
    if (bodyMesh.instanceColor) bodyMesh.instanceColor.needsUpdate = true;
    applyPoses(0);
  }, [applyPoses]);

  useFrame((_, delta) => {
    if (reducedMotion) return;
    wheelAngle.current = (wheelAngle.current + delta * 0.12) % (Math.PI * 2);
    if (rotating.current) rotating.current.rotation.z = wheelAngle.current;
    applyPoses(wheelAngle.current);
  });

  return (
    <group>
      <HeroPart geometry={WHEEL_LEGS} material={HERO_MAT.white} />
      <group ref={rotating}>
        <HeroPart
          geometry={WHEEL_RIM_GEOMETRY}
          material={HERO_MAT.white}
          position={[0, 0, WHEEL_HALF_DEPTH]}
        />
        <HeroPart
          geometry={WHEEL_RIM_GEOMETRY}
          material={HERO_MAT.white}
          position={[0, 0, -WHEEL_HALF_DEPTH]}
        />
        <HeroPart geometry={WHEEL_SPOKES} material={HERO_MAT.steelLight} />
        <HeroPart geometry={WHEEL_BRACKETS} material={HERO_MAT.steel} />
        <HeroPart
          geometry={G.cylinder}
          material={HERO_MAT.gold}
          scale={[0.1, 0.2, 0.1]}
          rotation={[Math.PI / 2, 0, 0]}
        />
        <instancedMesh
          ref={bodies}
          args={[WHEEL_CABIN_BODY, HERO_MAT.cabinWhite, WHEEL_CABINS]}
          castShadow
          frustumCulled={false}
        />
        <instancedMesh
          ref={glass}
          args={[WHEEL_CABIN_GLASS, HERO_MAT.glassDeep, WHEEL_CABINS]}
          frustumCulled={false}
        />
      </group>
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Dream Mall                                                          */
/* ------------------------------------------------------------------ */

const MALL_FACADE_START = Math.PI * 0.12;
const MALL_FACADE_LENGTH = Math.PI * 0.76;
const MALL_FACADE_RADIUS = 0.62;
const MALL_FACADE_SQUASH = 0.61;

const mallFacadeHeight = (angle: number) => {
  const progress = (angle - MALL_FACADE_START) / MALL_FACADE_LENGTH;
  return 0.34 + 0.2 * Math.max(0, Math.min(1, progress)) ** 0.85;
};

const MALL_FACADE = makeCurvedFacadeGeometry({
  radius: MALL_FACADE_RADIUS,
  heightAt: mallFacadeHeight,
  thetaStart: MALL_FACADE_START,
  thetaLength: MALL_FACADE_LENGTH,
  segments: 40,
  squashZ: MALL_FACADE_SQUASH,
});

const MALL_FASCIA = new THREE.TubeGeometry(
  makeCurvedFacadeTopCurve({
    radius: MALL_FACADE_RADIUS,
    heightAt: mallFacadeHeight,
    thetaStart: MALL_FACADE_START,
    thetaLength: MALL_FACADE_LENGTH,
    segments: 40,
    squashZ: MALL_FACADE_SQUASH,
  }),
  48,
  0.014,
  6,
  false,
);

const MALL_MULLIONS = makeBoxClusterGeometry(
  Array.from({ length: 11 }, (_, index) => {
    const angle = MALL_FACADE_START + (index / 10) * MALL_FACADE_LENGTH;
    const height = mallFacadeHeight(angle);
    return {
      position: [
        Math.cos(angle) * MALL_FACADE_RADIUS,
        0.1 + height / 2,
        Math.sin(angle) * MALL_FACADE_RADIUS * MALL_FACADE_SQUASH,
      ] as Vec3,
      scale: [0.012, height, 0.012] as Vec3,
    };
  }),
);

function DreamMall() {
  const detail = useLandmarkDetail();
  return (
    <group>
      <ContactShadow radius={1.0} />
      <HeroPart
        geometry={G.rounded}
        material={HERO_MAT.concrete}
        scale={[1.56, 0.07, 0.9]}
        position={[0, 0.035, 0]}
      />
      <HeroPart
        geometry={G.rounded}
        material={HERO_MAT.cream}
        scale={[1.32, 0.34, 0.6]}
        position={[0, 0.26, -0.2]}
      />
      <HeroPart
        geometry={G.rounded}
        material={HERO_MAT.cream}
        scale={[1.2, 0.18, 0.44]}
        position={[0, 0.52, -0.2]}
      />
      <HeroPart
        geometry={MALL_FACADE}
        material={HERO_MAT.glassGreen}
        position={[0, 0.07, 0]}
      />
      <HeroPart geometry={MALL_FASCIA} material={HERO_MAT.paper} />
      {detail === 'near' ? (
        <HeroPart geometry={MALL_MULLIONS} material={HERO_MAT.steelLight} />
      ) : null}
      <HeroPart
        geometry={G.rounded}
        material={HERO_MAT.steelLight}
        scale={[1.06, 0.03, 0.72]}
        position={[0, 0.625, -0.1]}
      />
      <HeroPart
        geometry={G.rounded}
        material={HERO_MAT.paper}
        scale={[0.34, 0.15, 0.022]}
        position={[0.1, 0.42, 0.39]}
      />
      <HeroPart
        geometry={G.rounded}
        material={HERO_MAT.glassBlue}
        scale={[0.16, 0.06, 0.014]}
        position={[0.1, 0.42, 0.4]}
      />
      <HeroPart
        geometry={G.cone4}
        material={HERO_MAT.glassBlue}
        scale={[0.05, 0.06, 0.014]}
        position={[0.02, 0.44, 0.41]}
        rotation={[0, 0, -0.5]}
      />
      <HeroPart
        geometry={G.rounded}
        material={HERO_MAT.paper}
        scale={[0.38, 0.05, 0.24]}
        position={[0, 0.22, 0.4]}
      />
      {[-0.12, 0.12].map((x) => (
        <HeroPart
          key={x}
          geometry={G.cylinder8}
          material={HERO_MAT.steelLight}
          scale={[0.02, 0.18, 0.02]}
          position={[x, 0.13, 0.46]}
        />
      ))}
      <group position={[0.34, 1.075, -0.1]} rotation={[0, 0.5, 0]}>
        <FerrisWheel />
      </group>
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* 85 Sky Tower                                                        */
/* ------------------------------------------------------------------ */

const TOWER_BANDS = makeBoxClusterGeometry(
  Array.from({ length: 9 }, (_, index) => {
    const y = 0.22 + index * 0.1;
    return [-1, 1].map((side) => ({
      position: [side * 0.072, y, 0] as Vec3,
      scale: [0.126, 0.007, 0.112] as Vec3,
    }));
  }).flat(),
);

// Fins stand just proud of the band boxes so they read as unbroken mullions.
const TOWER_FINS = makeBoxClusterGeometry([
  ...[-1, 1].map((side) => ({
    position: [side * 0.14, 0.63, 0] as Vec3,
    scale: [0.01, 0.98, 0.03] as Vec3,
  })),
  ...[-1, 1].flatMap((side) =>
    [-1, 1].map((depth) => ({
      position: [side * 0.072, 0.63, depth * 0.061] as Vec3,
      scale: [0.03, 0.98, 0.01] as Vec3,
    })),
  ),
]);

const SHAFT_BANDS = makeBoxClusterGeometry(
  Array.from({ length: 7 }, (_, index) => ({
    position: [0, 1.2 + index * 0.085, 0] as Vec3,
    scale: [0.272, 0.007, 0.238] as Vec3,
  })),
);

const SHAFT_FINS = makeBoxClusterGeometry([
  ...[-1, 1].map((side) => ({
    position: [side * 0.141, 1.44, 0] as Vec3,
    scale: [0.01, 0.62, 0.03] as Vec3,
  })),
  ...[-1, 1].map((side) => ({
    position: [0, 1.44, side * 0.124] as Vec3,
    scale: [0.03, 0.62, 0.01] as Vec3,
  })),
]);

function SkyTower85() {
  return (
    <group>
      <ContactShadow radius={0.44} />
      <HeroPart
        geometry={G.box}
        material={HERO_MAT.concrete}
        scale={[0.5, 0.06, 0.5]}
        position={[0, 0.03, 0]}
      />
      <HeroPart
        geometry={G.rounded}
        material={HERO_MAT.cream}
        scale={[0.42, 0.1, 0.4]}
        position={[0, 0.09, 0]}
      />
      {[-1, 1].map((side) => (
        <HeroPart
          key={side}
          geometry={G.octagon}
          material={HERO_MAT.glassBlue}
          scale={[0.062, 0.98, 0.054]}
          position={[side * 0.072, 0.63, 0]}
          rotation={[0, Math.PI / 8, 0]}
        />
      ))}
      <HeroPart
        geometry={G.box}
        material={HERO_MAT.dark}
        scale={[0.022, 0.96, 0.09]}
        position={[0, 0.62, -0.01]}
      />
      <HeroPart geometry={TOWER_BANDS} material={HERO_MAT.steelLight} />
      <HeroPart geometry={TOWER_FINS} material={HERO_MAT.maroon} />
      <HeroPart
        geometry={G.rounded}
        material={HERO_MAT.cream}
        scale={[0.31, 0.03, 0.14]}
        position={[0, 1.13, 0]}
      />
      <HeroPart
        geometry={G.octagonTaper}
        material={HERO_MAT.glassDeep}
        scale={[0.134, 0.62, 0.116]}
        position={[0, 1.44, 0]}
        rotation={[0, Math.PI / 8, 0]}
      />
      <HeroPart geometry={SHAFT_BANDS} material={HERO_MAT.steelLight} />
      <HeroPart geometry={SHAFT_FINS} material={HERO_MAT.maroon} />
      <HeroPart
        geometry={G.crown}
        material={HERO_MAT.glassBlue}
        position={[0, 1.75, 0]}
        rotation={[0, Math.PI / 8, 0]}
      />
      <HeroPart
        geometry={G.octagon}
        material={HERO_MAT.cream}
        scale={[0.09, 0.028, 0.078]}
        position={[0, 1.885, 0]}
        rotation={[0, Math.PI / 8, 0]}
      />
      <HeroPart
        geometry={G.octagonTaper}
        material={HERO_MAT.steelLight}
        scale={[0.056, 0.07, 0.05]}
        position={[0, 1.93, 0]}
        rotation={[0, Math.PI / 8, 0]}
      />
      <HeroPart
        geometry={G.cylinder8}
        material={HERO_MAT.steelLight}
        scale={[0.01, 0.1, 0.01]}
        position={[0, 1.99, 0]}
      />
      <HeroPart
        geometry={G.sphereLow}
        material={HERO_MAT.orange}
        scale={[0.02, 0.02, 0.02]}
        position={[0, 2.04, 0]}
      />
      <group position={[0.3, 0.06, 0.24]}>
        <HeroPart
          geometry={G.cylinder8}
          material={HERO_MAT.concrete}
          scale={[0.1, 0.05, 0.1]}
        />
        <HeroPart
          geometry={G.ico}
          material={HERO_MAT.green}
          scale={[0.12, 0.14, 0.12]}
          position={[0, 0.1, 0]}
        />
      </group>
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
      name={'hero-' + feature}
      userData={{ feature, label: spec?.label ?? feature }}
    >
      {model}
    </group>
  );
}
