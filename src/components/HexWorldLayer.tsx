import { Html } from '@react-three/drei';
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { landmarkFootprints, TREE_RING_RADIUS } from '../world/buildings';
import {
  HEX_PLAZA_RADIUS,
  HEX_RADIUS,
  HEX_TILES,
  type HexTile,
} from '../world/hex';
import {
  HEX_LANDMARKS,
  type HexLandmark,
  LANDMARKS_BY_TILE,
  type LandmarkKind,
  landmarkWorldPosition,
} from '../world/hex-landmarks';
import { HEX_ROAD_GRAPH, ROAD_EDGES, roadNode } from '../world/road-graph';
import HeroLandmarkModel from './HeroLandmarks';
import HexBuildings from './HexBuildings';

type HexWorldLayerProps = {
  selectedAdminId: string | null;
  hoveredAdminId: string | null;
  showLabels: boolean;
  detail: 'low' | 'medium' | 'high';
  onSelectAdmin: (adminId: string | null) => void;
  onHoverAdmin: (adminId: string | null) => void;
};

const TOP_Y = 0.26;
const ROAD_Y = 0.445;
const ACTOR_Y = ROAD_Y + 0.02;

const TERRAIN_COLORS: Record<string, string[]> = {
  urban: ['#efd9ba', '#ecd1b2', '#f2dfc2', '#e8c9a9'],
  coastal: ['#e4d7b2', '#dfd0a8', '#ebdcb9', '#d9caa2'],
  hill: ['#cfd9ae', '#c4d1a3', '#d8dfb8', '#bccb9f'],
  mountain: ['#b6c7a1', '#adbf98', '#c0cfaa', '#a6ba93'],
};

function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function districtColor(tile: HexTile): string {
  const palette =
    TERRAIN_COLORS[tile.district.terrain] ?? TERRAIN_COLORS.urban!;
  return palette[hashString(tile.districtId) % palette.length]!;
}

function makeHexShape(radius: number): THREE.Shape {
  const shape = new THREE.Shape();
  for (let index = 0; index < 6; index += 1) {
    const angle = (Math.PI / 3) * index;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    if (index === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();
  return shape;
}

function makeHexPlateGeometry(): THREE.BufferGeometry {
  const geometry = new THREE.ExtrudeGeometry(makeHexShape(HEX_RADIUS * 0.975), {
    depth: 0.12,
    bevelEnabled: true,
    bevelThickness: 0.055,
    bevelSize: 0.075,
    bevelSegments: 2,
    steps: 1,
    curveSegments: 1,
  });
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, TOP_Y, 0);
  geometry.computeVertexNormals();
  return geometry;
}

function makeHexRingGeometry(): THREE.BufferGeometry {
  const shape = makeHexShape(HEX_RADIUS * 0.955);
  const hole = new THREE.Path();
  for (let index = 0; index < 6; index += 1) {
    const angle = (Math.PI / 3) * index;
    const x = Math.cos(angle) * HEX_RADIUS * 0.9;
    const y = Math.sin(angle) * HEX_RADIUS * 0.9;
    if (index === 0) hole.moveTo(x, y);
    else hole.lineTo(x, y);
  }
  hole.closePath();
  shape.holes.push(hole);
  const geometry = new THREE.ShapeGeometry(shape);
  geometry.rotateX(-Math.PI / 2);
  return geometry;
}

function makeRoadGeometry(width: number): THREE.BufferGeometry {
  const positions: number[] = [];
  const indices: number[] = [];
  const pushVertex = (x: number, z: number) => {
    positions.push(x, 0, z);
    return positions.length / 3 - 1;
  };

  for (const edge of ROAD_EDGES) {
    const dx = edge.b.x - edge.a.x;
    const dz = edge.b.z - edge.a.z;
    const length = Math.hypot(dx, dz) || 1;
    const nx = (-dz / length) * (width / 2);
    const nz = (dx / length) * (width / 2);
    const a1 = pushVertex(edge.a.x + nx, edge.a.z + nz);
    const a2 = pushVertex(edge.a.x - nx, edge.a.z - nz);
    const b1 = pushVertex(edge.b.x + nx, edge.b.z + nz);
    const b2 = pushVertex(edge.b.x - nx, edge.b.z - nz);
    indices.push(a1, b1, a2, a2, b1, b2);
  }

  for (const node of HEX_ROAD_GRAPH.nodes.values()) {
    const segments = 10;
    const center = pushVertex(node.point.x, node.point.z);
    const start = positions.length / 3;
    for (let index = 0; index < segments; index += 1) {
      const angle = (index / segments) * Math.PI * 2;
      pushVertex(
        node.point.x + Math.cos(angle) * (width / 2),
        node.point.z + Math.sin(angle) * (width / 2),
      );
    }
    for (let index = 0; index < segments; index += 1) {
      indices.push(center, start + ((index + 1) % segments), start + index);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

const plateGeometry = makeHexPlateGeometry();
const ringGeometry = makeHexRingGeometry();
const curbGeometry = makeRoadGeometry(0.6);
const roadGeometry = makeRoadGeometry(0.48);

const PLATFORM_MATERIAL = new THREE.MeshStandardMaterial({
  color: '#d8c4a4',
  roughness: 0.96,
  metalness: 0,
  flatShading: true,
});

const TOP_MATERIAL = new THREE.MeshStandardMaterial({
  color: '#ffffff',
  roughness: 0.94,
  metalness: 0,
  flatShading: true,
  vertexColors: false,
});

const CURB_MATERIAL = new THREE.MeshStandardMaterial({
  color: '#e5d8c0',
  roughness: 0.98,
  metalness: 0,
});

const ROAD_MATERIAL = new THREE.MeshStandardMaterial({
  color: '#89918d',
  roughness: 0.92,
  metalness: 0.02,
});

const PLAZA_MATERIAL = new THREE.MeshStandardMaterial({
  color: '#cdd9aa',
  roughness: 0.98,
  metalness: 0,
});

const RING_MATERIAL = new THREE.MeshBasicMaterial({
  color: '#e58e70',
  transparent: true,
  opacity: 0.9,
  depthWrite: false,
  side: THREE.DoubleSide,
});

const HOVER_MATERIAL = new THREE.MeshBasicMaterial({
  color: '#3e9d96',
  transparent: true,
  opacity: 0.72,
  depthWrite: false,
  side: THREE.DoubleSide,
});

const MAT = {
  cream: new THREE.MeshStandardMaterial({
    color: '#f4e8cf',
    roughness: 0.93,
    flatShading: true,
  }),
  sand: new THREE.MeshStandardMaterial({
    color: '#e8d3a8',
    roughness: 0.98,
    flatShading: true,
  }),
  terracotta: new THREE.MeshStandardMaterial({
    color: '#d98562',
    roughness: 0.9,
    flatShading: true,
  }),
  orange: new THREE.MeshStandardMaterial({
    color: '#e6a463',
    roughness: 0.9,
    flatShading: true,
  }),
  red: new THREE.MeshStandardMaterial({
    color: '#c96a57',
    roughness: 0.9,
    flatShading: true,
  }),
  teal: new THREE.MeshStandardMaterial({
    color: '#63b6b4',
    roughness: 0.82,
    flatShading: true,
  }),
  deepTeal: new THREE.MeshStandardMaterial({
    color: '#3f8f92',
    roughness: 0.8,
    flatShading: true,
  }),
  sage: new THREE.MeshStandardMaterial({
    color: '#94b47e',
    roughness: 0.95,
    flatShading: true,
  }),
  forest: new THREE.MeshStandardMaterial({
    color: '#6f9a6b',
    roughness: 0.95,
    flatShading: true,
  }),
  stone: new THREE.MeshStandardMaterial({
    color: '#c8bca6',
    roughness: 0.98,
    flatShading: true,
  }),
  darkStone: new THREE.MeshStandardMaterial({
    color: '#8d8577',
    roughness: 0.98,
    flatShading: true,
  }),
  gold: new THREE.MeshStandardMaterial({
    color: '#d9ad62',
    roughness: 0.7,
    metalness: 0.12,
    flatShading: true,
  }),
  white: new THREE.MeshStandardMaterial({
    color: '#f7f0e2',
    roughness: 0.9,
    flatShading: true,
  }),
  glass: new THREE.MeshStandardMaterial({
    color: '#9fd0cf',
    roughness: 0.35,
    metalness: 0.08,
    flatShading: true,
  }),
  wood: new THREE.MeshStandardMaterial({
    color: '#a67854',
    roughness: 0.95,
    flatShading: true,
  }),
  pink: new THREE.MeshStandardMaterial({
    color: '#e7b4a2',
    roughness: 0.9,
    flatShading: true,
  }),
  water: new THREE.MeshStandardMaterial({
    color: '#79c8c7',
    roughness: 0.55,
    metalness: 0.04,
    flatShading: true,
  }),
};

const GEO = {
  box: new THREE.BoxGeometry(1, 1, 1),
  cylinder: new THREE.CylinderGeometry(0.5, 0.5, 1, 10),
  cylinder6: new THREE.CylinderGeometry(0.5, 0.58, 1, 6),
  cone: new THREE.ConeGeometry(0.5, 1, 8),
  cone4: new THREE.ConeGeometry(0.5, 1, 4),
  sphere: new THREE.SphereGeometry(0.5, 10, 8),
  ico: new THREE.IcosahedronGeometry(0.5, 0),
  torus: new THREE.TorusGeometry(0.5, 0.12, 6, 18),
  disc: new THREE.CylinderGeometry(0.5, 0.5, 1, 18),
};

type PrimitiveProps = {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  scale: [number, number, number];
  position: [number, number, number];
  rotation?: [number, number, number];
};

function Part({
  geometry,
  material,
  scale,
  position,
  rotation,
}: PrimitiveProps) {
  return (
    <mesh
      geometry={geometry}
      material={material}
      scale={scale}
      position={position}
      {...(rotation ? { rotation } : {})}
      castShadow
      receiveShadow
      raycast={() => {}}
    />
  );
}

function TreeCluster({ seed }: { seed: number }) {
  return (
    <group>
      <Part
        geometry={GEO.cylinder}
        material={MAT.wood}
        scale={[0.075, 0.26, 0.075]}
        position={[0, 0.13, 0]}
      />
      <Part
        geometry={GEO.ico}
        material={MAT.forest}
        scale={[0.4, 0.42, 0.4]}
        position={[0, 0.42, 0]}
      />
      <Part
        geometry={GEO.ico}
        material={MAT.sage}
        scale={[0.28, 0.3, 0.28]}
        position={[0.18 * Math.cos(seed), 0.55, 0.18 * Math.sin(seed)]}
      />
    </group>
  );
}

function PagodaTower() {
  return (
    <group>
      <Part
        geometry={GEO.cylinder6}
        material={MAT.stone}
        scale={[0.68, 0.1, 0.68]}
        position={[0, 0.05, 0]}
      />
      {[0, 0.22, 0.44, 0.66].map((height, index) => (
        <group key={height} position={[0, height, 0]}>
          <Part
            geometry={GEO.cylinder6}
            material={index % 2 === 0 ? MAT.cream : MAT.red}
            scale={[0.4 - index * 0.06, 0.2, 0.4 - index * 0.06]}
            position={[0, 0.1, 0]}
          />
          <Part
            geometry={GEO.cone4}
            material={MAT.terracotta}
            scale={[0.46 - index * 0.07, 0.12, 0.46 - index * 0.07]}
            position={[0, 0.25, 0]}
            rotation={[0, Math.PI / 4, 0]}
          />
        </group>
      ))}
      <Part
        geometry={GEO.cone}
        material={MAT.gold}
        scale={[0.12, 0.22, 0.12]}
        position={[0, 0.96, 0]}
      />
    </group>
  );
}

function LandmarkModel({ landmark }: { landmark: HexLandmark }) {
  if (landmark.feature) return <HeroLandmarkModel feature={landmark.feature} />;
  const kind = landmark.kind;
  if (
    kind === 'lake' ||
    kind === 'wetland' ||
    kind === 'harbor' ||
    kind === 'beach'
  ) {
    return (
      <group>
        <Part
          geometry={GEO.disc}
          material={MAT.water}
          scale={[1.05, 0.035, 0.95]}
          position={[0, 0.02, 0]}
        />
        <Part
          geometry={GEO.ico}
          material={MAT.sage}
          scale={[0.3, 0.18, 0.26]}
          position={[-0.24, 0.09, 0.18]}
        />
        {kind === 'harbor' && (
          <group position={[0.16, 0.08, -0.12]} rotation={[0, 0.5, 0]}>
            <Part
              geometry={GEO.box}
              material={MAT.cream}
              scale={[0.38, 0.11, 0.18]}
              position={[0, 0.06, 0]}
            />
            <Part
              geometry={GEO.box}
              material={MAT.teal}
              scale={[0.12, 0.18, 0.14]}
              position={[-0.04, 0.2, 0]}
            />
            <Part
              geometry={GEO.cylinder}
              material={MAT.wood}
              scale={[0.025, 0.38, 0.025]}
              position={[0, 0.28, 0]}
            />
          </group>
        )}
        {kind === 'beach' && (
          <group position={[0.28, 0.12, 0.2]}>
            <Part
              geometry={GEO.cylinder}
              material={MAT.wood}
              scale={[0.04, 0.52, 0.04]}
              position={[0, 0.26, 0]}
              rotation={[0, 0, 0.2]}
            />
            <Part
              geometry={GEO.cone}
              material={MAT.sage}
              scale={[0.42, 0.16, 0.42]}
              position={[0.08, 0.54, 0]}
            />
          </group>
        )}
        {kind === 'wetland' && (
          <group position={[0.22, 0.14, 0.1]}>
            {[0, 0.18, 0.36].map((offset) => (
              <Part
                key={offset}
                geometry={GEO.cylinder}
                material={MAT.forest}
                scale={[0.022, 0.34, 0.022]}
                position={[offset, 0.17, offset * 0.4]}
              />
            ))}
          </group>
        )}
      </group>
    );
  }

  if (kind === 'mountain' || kind === 'forest' || kind === 'waterfall') {
    return (
      <group>
        <Part
          geometry={GEO.cylinder6}
          material={MAT.sage}
          scale={[1.1, 0.12, 1.0]}
          position={[0, 0.06, 0]}
        />
        <Part
          geometry={GEO.cone}
          material={MAT.forest}
          scale={[0.95, 0.85, 0.9]}
          position={[-0.12, 0.48, 0.06]}
        />
        <Part
          geometry={GEO.cone}
          material={MAT.sage}
          scale={[0.62, 0.62, 0.6]}
          position={[0.3, 0.33, -0.18]}
        />
        {kind === 'forest' && (
          <>
            <TreeCluster seed={1} />
            <group position={[0.48, 0, 0.32]} scale={0.8}>
              <TreeCluster seed={2} />
            </group>
          </>
        )}
        {kind === 'waterfall' && (
          <Part
            geometry={GEO.box}
            material={MAT.water}
            scale={[0.16, 0.62, 0.045]}
            position={[-0.12, 0.52, -0.32]}
          />
        )}
      </group>
    );
  }

  if (kind === 'pagoda') return <PagodaTower />;

  if (kind === 'temple' || kind === 'museum' || kind === 'fort') {
    return (
      <group>
        <Part
          geometry={GEO.box}
          material={MAT.stone}
          scale={[1.0, 0.1, 0.78]}
          position={[0, 0.05, 0]}
        />
        <Part
          geometry={GEO.box}
          material={MAT.cream}
          scale={[0.74, 0.3, 0.52]}
          position={[0, 0.24, 0]}
        />
        <Part
          geometry={GEO.cone4}
          material={kind === 'temple' ? MAT.terracotta : MAT.darkStone}
          scale={[0.92, 0.26, 0.68]}
          position={[0, 0.5, 0]}
          rotation={[0, Math.PI / 4, 0]}
        />
        <Part
          geometry={GEO.box}
          material={MAT.wood}
          scale={[0.18, 0.18, 0.03]}
          position={[0, 0.24, 0.27]}
        />
        {kind === 'museum' && (
          <>
            <Part
              geometry={GEO.cylinder}
              material={MAT.white}
              scale={[0.08, 0.34, 0.08]}
              position={[-0.26, 0.28, 0.24]}
            />
            <Part
              geometry={GEO.cylinder}
              material={MAT.white}
              scale={[0.08, 0.34, 0.08]}
              position={[0.26, 0.28, 0.24]}
            />
          </>
        )}
        {kind === 'fort' && (
          <>
            <Part
              geometry={GEO.box}
              material={MAT.stone}
              scale={[0.92, 0.16, 0.16]}
              position={[0, 0.34, 0.4]}
            />
            <Part
              geometry={GEO.cylinder}
              material={MAT.darkStone}
              scale={[0.08, 0.16, 0.08]}
              position={[-0.3, 0.28, 0.4]}
            />
          </>
        )}
      </group>
    );
  }

  if (kind === 'tower' || kind === 'monument' || kind === 'lighthouse') {
    const height = kind === 'tower' ? 1.0 : 0.78;
    return (
      <group>
        <Part
          geometry={GEO.cylinder6}
          material={MAT.stone}
          scale={[0.7, 0.1, 0.7]}
          position={[0, 0.05, 0]}
        />
        {kind === 'lighthouse' ? (
          <>
            <Part
              geometry={GEO.cylinder}
              material={MAT.white}
              scale={[0.22, height, 0.22]}
              position={[0, height / 2 + 0.08, 0]}
            />
            <Part
              geometry={GEO.cylinder}
              material={MAT.red}
              scale={[0.24, 0.2, 0.24]}
              position={[0, height + 0.02, 0]}
            />
            <Part
              geometry={GEO.cylinder}
              material={MAT.gold}
              scale={[0.14, 0.14, 0.14]}
              position={[0, height + 0.2, 0]}
            />
            <Part
              geometry={GEO.cone}
              material={MAT.terracotta}
              scale={[0.3, 0.16, 0.3]}
              position={[0, height + 0.3, 0]}
            />
          </>
        ) : (
          <>
            <Part
              geometry={GEO.box}
              material={MAT.glass}
              scale={[0.4, height, 0.4]}
              position={[0, height / 2 + 0.08, 0]}
            />
            {[0.16, 0.34, 0.52, 0.7].map((heightStep) => (
              <Part
                key={heightStep}
                geometry={GEO.box}
                material={MAT.cream}
                scale={[0.44, 0.03, 0.44]}
                position={[0, heightStep + 0.08, 0]}
              />
            ))}
            {kind === 'tower' && (
              <Part
                geometry={GEO.cone}
                material={MAT.cream}
                scale={[0.22, 0.26, 0.22]}
                position={[0, height + 0.22, 0]}
              />
            )}
            {kind === 'monument' && (
              <Part
                geometry={GEO.cone4}
                material={MAT.gold}
                scale={[0.24, 0.3, 0.24]}
                position={[0, height + 0.1, 0]}
                rotation={[0, Math.PI / 4, 0]}
              />
            )}
          </>
        )}
      </group>
    );
  }

  if (kind === 'bridge') {
    return (
      <group>
        <Part
          geometry={GEO.box}
          material={MAT.water}
          scale={[1.1, 0.05, 0.5]}
          position={[0, 0.02, 0]}
        />
        <Part
          geometry={GEO.box}
          material={MAT.terracotta}
          scale={[0.95, 0.08, 0.24]}
          position={[0, 0.32, 0]}
        />
        <Part
          geometry={GEO.box}
          material={MAT.stone}
          scale={[0.1, 0.34, 0.08]}
          position={[-0.36, 0.18, 0.08]}
        />
        <Part
          geometry={GEO.box}
          material={MAT.stone}
          scale={[0.1, 0.34, 0.08]}
          position={[0.36, 0.18, 0.08]}
        />
        <Part
          geometry={GEO.box}
          material={MAT.stone}
          scale={[0.08, 0.34, 0.08]}
          position={[-0.36, 0.18, -0.08]}
        />
        <Part
          geometry={GEO.box}
          material={MAT.stone}
          scale={[0.08, 0.34, 0.08]}
          position={[0.36, 0.18, -0.08]}
        />
        <Part
          geometry={GEO.cylinder}
          material={MAT.gold}
          scale={[0.03, 0.42, 0.03]}
          position={[-0.36, 0.5, 0]}
        />
        <Part
          geometry={GEO.cylinder}
          material={MAT.gold}
          scale={[0.03, 0.42, 0.03]}
          position={[0.36, 0.5, 0]}
        />
      </group>
    );
  }

  if (
    kind === 'artCenter' ||
    kind === 'exhibition' ||
    kind === 'convention' ||
    kind === 'airport'
  ) {
    return (
      <group>
        <Part
          geometry={GEO.box}
          material={MAT.stone}
          scale={[1.04, 0.08, 0.8]}
          position={[0, 0.04, 0]}
        />
        <Part
          geometry={GEO.box}
          material={MAT.glass}
          scale={[0.66, 0.28, 0.54]}
          position={[-0.16, 0.25, 0]}
          rotation={[0, 0.18, 0]}
        />
        <Part
          geometry={GEO.box}
          material={MAT.cream}
          scale={[0.36, 0.18, 0.42]}
          position={[0.28, 0.2, 0.08]}
          rotation={[0, -0.2, 0]}
        />
        {kind === 'convention' && (
          <Part
            geometry={GEO.sphere}
            material={MAT.cream}
            scale={[0.48, 0.3, 0.48]}
            position={[0.1, 0.36, 0]}
          />
        )}
        {kind === 'airport' && (
          <>
            <Part
              geometry={GEO.box}
              material={MAT.darkStone}
              scale={[1.18, 0.02, 0.16]}
              position={[0, 0.1, 0.32]}
            />
            <Part
              geometry={GEO.box}
              material={MAT.white}
              scale={[0.34, 0.06, 0.08]}
              position={[0, 0.15, 0.32]}
            />
            <Part
              geometry={GEO.box}
              material={MAT.terracotta}
              scale={[0.16, 0.1, 0.06]}
              position={[0.0, 0.2, 0.32]}
            />
          </>
        )}
        {kind === 'artCenter' && (
          <Part
            geometry={GEO.cylinder}
            material={MAT.terracotta}
            scale={[0.1, 0.32, 0.1]}
            position={[-0.32, 0.25, -0.2]}
          />
        )}
      </group>
    );
  }

  if (kind === 'stadium') {
    return (
      <group>
        <Part
          geometry={GEO.disc}
          material={MAT.stone}
          scale={[0.95, 0.08, 0.7]}
          position={[0, 0.05, 0]}
        />
        <Part
          geometry={GEO.torus}
          material={MAT.white}
          scale={[1.3, 1.3, 1.2]}
          position={[0, 0.18, 0]}
          rotation={[Math.PI / 2, 0, 0]}
        />
        <Part
          geometry={GEO.disc}
          material={MAT.sage}
          scale={[0.58, 0.08, 0.42]}
          position={[0, 0.13, 0]}
        />
      </group>
    );
  }

  if (kind === 'sugarMill') {
    return (
      <group>
        <Part
          geometry={GEO.box}
          material={MAT.cream}
          scale={[0.9, 0.24, 0.52]}
          position={[0, 0.16, 0]}
        />
        <Part
          geometry={GEO.box}
          material={MAT.terracotta}
          scale={[0.94, 0.08, 0.58]}
          position={[0, 0.32, 0]}
        />
        <Part
          geometry={GEO.cylinder6}
          material={MAT.red}
          scale={[0.16, 0.78, 0.16]}
          position={[0.26, 0.42, 0]}
        />
        <Part
          geometry={GEO.cylinder6}
          material={MAT.stone}
          scale={[0.12, 0.52, 0.12]}
          position={[-0.28, 0.28, 0.12]}
        />
        <TreeCluster seed={0.4} />
      </group>
    );
  }

  if (kind === 'oldStreet' || kind === 'nightMarket') {
    return (
      <group>
        {[-0.34, 0, 0.34].map((x, index) => (
          <group key={x} position={[x, 0, index === 1 ? 0.08 : -0.02]}>
            <Part
              geometry={GEO.box}
              material={MAT.cream}
              scale={[0.26, 0.28, 0.34]}
              position={[0, 0.18, 0]}
            />
            <Part
              geometry={GEO.cone4}
              material={index === 1 ? MAT.terracotta : MAT.orange}
              scale={[0.38, 0.14, 0.42]}
              position={[0, 0.4, 0]}
              rotation={[0, Math.PI / 4, 0]}
            />
            {kind === 'nightMarket' && (
              <Part
                geometry={GEO.box}
                material={index === 1 ? MAT.gold : MAT.red}
                scale={[0.18, 0.03, 0.4]}
                position={[0, 0.12, 0.2]}
              />
            )}
          </group>
        ))}
        <Part
          geometry={GEO.cylinder}
          material={MAT.wood}
          scale={[0.03, 0.34, 0.03]}
          position={[-0.52, 0.2, 0.18]}
        />
        <Part
          geometry={GEO.sphere}
          material={MAT.gold}
          scale={[0.12, 0.12, 0.12]}
          position={[-0.52, 0.4, 0.18]}
        />
      </group>
    );
  }

  if (kind === 'dam') {
    return (
      <group>
        <Part
          geometry={GEO.box}
          material={MAT.water}
          scale={[1.0, 0.06, 0.6]}
          position={[0, 0.02, 0]}
        />
        <Part
          geometry={GEO.box}
          material={MAT.stone}
          scale={[0.9, 0.32, 0.16]}
          position={[0, 0.18, 0.12]}
        />
        <Part
          geometry={GEO.box}
          material={MAT.teal}
          scale={[0.12, 0.24, 0.04]}
          position={[-0.18, 0.2, 0.02]}
        />
        <Part
          geometry={GEO.cone}
          material={MAT.sage}
          scale={[0.7, 0.42, 0.6]}
          position={[-0.34, 0.22, -0.24]}
        />
      </group>
    );
  }

  if (kind === 'hotSpring') {
    return (
      <group>
        <Part
          geometry={GEO.disc}
          material={MAT.stone}
          scale={[0.92, 0.1, 0.72]}
          position={[0, 0.05, 0]}
        />
        <Part
          geometry={GEO.disc}
          material={MAT.water}
          scale={[0.56, 0.04, 0.42]}
          position={[0, 0.12, 0]}
        />
        <Part
          geometry={GEO.ico}
          material={MAT.sage}
          scale={[0.4, 0.24, 0.34]}
          position={[-0.44, 0.14, 0.22]}
        />
        {[0, 0.18, 0.34].map((offset, index) => (
          <Part
            key={offset}
            geometry={GEO.sphere}
            material={MAT.white}
            scale={[0.16, 0.12, 0.16]}
            position={[offset - 0.1, 0.32 + index * 0.08, 0.04]}
          />
        ))}
      </group>
    );
  }

  if (kind === 'farm') {
    return (
      <group>
        <Part
          geometry={GEO.box}
          material={MAT.sage}
          scale={[1.05, 0.06, 0.85]}
          position={[0, 0.03, 0]}
        />
        {[-0.3, 0, 0.3].map((z) => (
          <Part
            key={z}
            geometry={GEO.box}
            material={MAT.gold}
            scale={[0.9, 0.03, 0.1]}
            position={[0, 0.08, z]}
          />
        ))}
        <Part
          geometry={GEO.box}
          material={MAT.terracotta}
          scale={[0.28, 0.22, 0.24]}
          position={[0.28, 0.18, 0.28]}
        />
        <Part
          geometry={GEO.cone4}
          material={MAT.red}
          scale={[0.4, 0.16, 0.36]}
          position={[0.28, 0.34, 0.28]}
          rotation={[0, Math.PI / 4, 0]}
        />
      </group>
    );
  }

  if (kind === 'park') {
    return (
      <group>
        <Part
          geometry={GEO.disc}
          material={MAT.sage}
          scale={[1.05, 0.04, 0.9]}
          position={[0, 0.03, 0]}
        />
        <Part
          geometry={GEO.disc}
          material={MAT.water}
          scale={[0.42, 0.03, 0.34]}
          position={[0.16, 0.08, -0.16]}
        />
        <group position={[-0.3, 0, 0.18]}>
          <TreeCluster seed={0.8} />
        </group>
        <group position={[0.36, 0, 0.26]} scale={0.8}>
          <TreeCluster seed={2.1} />
        </group>
        <Part
          geometry={GEO.box}
          material={MAT.cream}
          scale={[0.4, 0.03, 0.18]}
          position={[-0.1, 0.08, 0.28]}
          rotation={[0, 0.4, 0]}
        />
      </group>
    );
  }

  return <TreeCluster seed={landmark.rotation} />;
}

function Landmarks() {
  return (
    <group>
      {HEX_LANDMARKS.map((landmark) => {
        const position = landmarkWorldPosition(landmark);
        return (
          <group
            key={landmark.id}
            position={[position.x, ROAD_Y - 0.005, position.z]}
            rotation={[0, landmark.rotation, 0]}
            scale={landmark.scale}
          >
            <LandmarkModel landmark={landmark} />
          </group>
        );
      })}
    </group>
  );
}

const treePositions = HEX_TILES.flatMap((tile, tileIndex) => {
  const count = 2 + (tileIndex % 2);
  const footprints = landmarkFootprints(tile);
  return Array.from({ length: count }, (_, index) => {
    const angle = tileIndex * 0.7 + index * 2.1 + 0.5;
    const radius = TREE_RING_RADIUS + 0.04 + (index % 3) * 0.05;
    return {
      id: `${tile.id}-tree-${index}`,
      angle,
      radius,
      x: tile.center.x + Math.cos(angle) * radius,
      z: tile.center.z + Math.sin(angle) * radius,
      footprints,
      scale: 0.44 + ((tileIndex + index) % 3) * 0.07,
      hue: (tileIndex + index) % 2,
    };
  });
}).filter((tree) =>
  tree.footprints.every(
    (footprint) =>
      Math.hypot(tree.x - footprint.x, tree.z - footprint.z) >
      footprint.radius + 0.16,
  ),
);

const TREE_CROWN_GEOMETRY = new THREE.IcosahedronGeometry(0.42, 0);
const TREE_TRUNK_GEOMETRY = new THREE.CylinderGeometry(0.055, 0.07, 0.24, 6);
const TREE_CROWN_MATERIAL = new THREE.MeshStandardMaterial({
  color: '#7fa174',
  roughness: 0.95,
  flatShading: true,
});
const TREE_CROWN_LIGHT_MATERIAL = new THREE.MeshStandardMaterial({
  color: '#9dbb83',
  roughness: 0.95,
  flatShading: true,
});
const TREE_TRUNK_MATERIAL = new THREE.MeshStandardMaterial({
  color: '#9a7754',
  roughness: 0.95,
});

function Trees() {
  const crownRef = useRef<THREE.InstancedMesh>(null);
  const lightCrownRef = useRef<THREE.InstancedMesh>(null);
  const trunkRef = useRef<THREE.InstancedMesh>(null);
  const dark = useMemo(
    () => treePositions.filter((tree) => tree.hue === 0),
    [],
  );
  const light = useMemo(
    () => treePositions.filter((tree) => tree.hue === 1),
    [],
  );

  useLayoutEffect(() => {
    const dummy = new THREE.Object3D();
    const place = (
      mesh: THREE.InstancedMesh | null,
      list: typeof treePositions,
    ) => {
      if (!mesh) return;
      list.forEach((tree, index) => {
        dummy.position.set(tree.x, 0.52 + 0.3 * tree.scale, tree.z);
        dummy.scale.setScalar(tree.scale);
        dummy.rotation.set(0, tree.x + tree.z, 0);
        dummy.updateMatrix();
        mesh.setMatrixAt(index, dummy.matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
    };
    place(crownRef.current, dark);
    place(lightCrownRef.current, light);
    if (trunkRef.current) {
      treePositions.forEach((tree, index) => {
        dummy.position.set(tree.x, 0.42 + 0.12 * tree.scale, tree.z);
        dummy.scale.setScalar(tree.scale);
        dummy.rotation.set(0, 0, 0);
        dummy.updateMatrix();
        trunkRef.current!.setMatrixAt(index, dummy.matrix);
      });
      trunkRef.current.instanceMatrix.needsUpdate = true;
    }
  }, [dark, light]);

  return (
    <group>
      <instancedMesh
        ref={crownRef}
        args={[TREE_CROWN_GEOMETRY, TREE_CROWN_MATERIAL, dark.length]}
        castShadow
        raycast={() => {}}
      />
      <instancedMesh
        ref={lightCrownRef}
        args={[TREE_CROWN_GEOMETRY, TREE_CROWN_LIGHT_MATERIAL, light.length]}
        castShadow
        raycast={() => {}}
      />
      <instancedMesh
        ref={trunkRef}
        args={[TREE_TRUNK_GEOMETRY, TREE_TRUNK_MATERIAL, treePositions.length]}
        castShadow
        raycast={() => {}}
      />
    </group>
  );
}

export default function HexWorldLayer({
  selectedAdminId,
  hoveredAdminId,
  showLabels,
  detail,
  onSelectAdmin,
  onHoverAdmin,
}: HexWorldLayerProps) {
  const platformRef = useRef<THREE.InstancedMesh>(null);
  const topRef = useRef<THREE.InstancedMesh>(null);
  const plazaRef = useRef<THREE.InstancedMesh>(null);
  const pointerStart = useRef<{ x: number; y: number } | null>(null);

  const selectedTiles = useMemo(
    () => HEX_TILES.filter((tile) => tile.adminId === selectedAdminId),
    [selectedAdminId],
  );
  const hoveredTiles = useMemo(
    () => HEX_TILES.filter((tile) => tile.adminId === hoveredAdminId),
    [hoveredAdminId],
  );
  const selectedLabelPosition = useMemo(() => {
    if (selectedTiles.length === 0) return null;
    return {
      x:
        selectedTiles.reduce((sum, tile) => sum + tile.center.x, 0) /
        selectedTiles.length,
      z:
        selectedTiles.reduce((sum, tile) => sum + tile.center.z, 0) /
        selectedTiles.length,
    };
  }, [selectedTiles]);

  useLayoutEffect(() => {
    const dummy = new THREE.Object3D();
    const platform = platformRef.current;
    const top = topRef.current;
    const plaza = plazaRef.current;
    if (!platform || !top || !plaza) return;

    HEX_TILES.forEach((tile, index) => {
      dummy.position.set(tile.center.x, -0.02, tile.center.z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      platform.setMatrixAt(index, dummy.matrix);

      dummy.position.set(tile.center.x, 0, tile.center.z);
      dummy.updateMatrix();
      top.setMatrixAt(index, dummy.matrix);
      top.setColorAt(index, new THREE.Color(districtColor(tile)));

      dummy.position.set(tile.center.x, ROAD_Y - 0.01, tile.center.z);
      dummy.scale.set(HEX_PLAZA_RADIUS * 2, 0.04, HEX_PLAZA_RADIUS * 2);
      dummy.updateMatrix();
      plaza.setMatrixAt(index, dummy.matrix);
    });
    platform.instanceMatrix.needsUpdate = true;
    top.instanceMatrix.needsUpdate = true;
    top.instanceColor!.needsUpdate = true;
    plaza.instanceMatrix.needsUpdate = true;
  }, []);

  useEffect(() => {
    if (hoveredTiles.length === 0) {
      document.body.style.cursor = '';
      return undefined;
    }
    document.body.style.cursor = 'pointer';
    return () => {
      document.body.style.cursor = '';
    };
  }, [hoveredTiles.length]);

  return (
    <group>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -0.36, 0]}
        receiveShadow
        raycast={() => {}}
      >
        <planeGeometry args={[260, 260]} />
        <meshStandardMaterial
          color="#79c6c7"
          roughness={0.92}
          metalness={0.02}
        />
      </mesh>

      <instancedMesh
        ref={platformRef}
        args={[plateGeometry, PLATFORM_MATERIAL, HEX_TILES.length]}
        receiveShadow
        castShadow
      />
      <instancedMesh
        ref={topRef}
        args={[plateGeometry, TOP_MATERIAL, HEX_TILES.length]}
        receiveShadow
        castShadow
        onPointerDown={(event) => {
          event.stopPropagation();
          pointerStart.current = { x: event.clientX, y: event.clientY };
        }}
        onPointerUp={(event) => {
          const start = pointerStart.current;
          pointerStart.current = null;
          if (
            !start ||
            Math.hypot(event.clientX - start.x, event.clientY - start.y) > 6
          )
            return;
          if (event.instanceId === undefined) return;
          const tile = HEX_TILES[event.instanceId];
          onSelectAdmin(tile?.adminId ?? null);
        }}
        onPointerMove={(event) => {
          if (event.instanceId === undefined) return;
          onHoverAdmin(HEX_TILES[event.instanceId]?.adminId ?? null);
        }}
        onPointerOut={() => onHoverAdmin(null)}
      />
      <instancedMesh
        ref={plazaRef}
        args={[GEO.disc, PLAZA_MATERIAL, HEX_TILES.length]}
        receiveShadow
        raycast={() => {}}
      />

      <mesh
        geometry={curbGeometry}
        material={CURB_MATERIAL}
        position={[0, ROAD_Y - 0.012, 0]}
        receiveShadow
        raycast={() => {}}
      />
      <mesh
        geometry={roadGeometry}
        material={ROAD_MATERIAL}
        position={[0, ROAD_Y, 0]}
        receiveShadow
        raycast={() => {}}
      />

      <HexBuildings detail={detail} />
      <Trees />
      <Landmarks />

      {selectedTiles.map((tile) => (
        <mesh
          key={`selected-${tile.id}`}
          geometry={ringGeometry}
          material={RING_MATERIAL}
          position={[tile.center.x, ROAD_Y + 0.03, tile.center.z]}
          renderOrder={3}
        />
      ))}
      {selectedLabelPosition && selectedTiles[0] && (
        <Html
          center
          position={[selectedLabelPosition.x, 2.15, selectedLabelPosition.z]}
          style={{ pointerEvents: 'none' }}
          zIndexRange={[6, 0]}
        >
          <span className="hex-district-label is-selected">
            {selectedTiles[0].district.name}
          </span>
        </Html>
      )}
      {hoveredTiles
        .filter(
          (tile) => !selectedTiles.some((selected) => selected.id === tile.id),
        )
        .map((tile) => (
          <mesh
            key={`hover-${tile.id}`}
            geometry={ringGeometry}
            material={HOVER_MATERIAL}
            position={[tile.center.x, ROAD_Y + 0.028, tile.center.z]}
            renderOrder={2}
          />
        ))}

      {showLabels &&
        HEX_TILES.filter((tile) => tile.districtTileIndex === 0).map((tile) => (
          <Html
            key={tile.id}
            center
            position={[tile.center.x, 1.7, tile.center.z]}
            style={{ pointerEvents: 'none' }}
            zIndexRange={[4, 0]}
          >
            <span
              className={`hex-district-label${tile.adminId === selectedAdminId ? ' is-selected' : ''}`}
            >
              {tile.district.shortName}
            </span>
          </Html>
        ))}
    </group>
  );
}

export { ACTOR_Y as HEX_ACTOR_Y };
export const HEX_WORLD_RING_COUNT = HEX_LANDMARKS.length;
export const HEX_ROAD_NODE_COUNT = HEX_ROAD_GRAPH.nodes.size;
export const HEX_LANDMARK_TILES = [...LANDMARKS_BY_TILE.keys()];
export const HEX_ACTOR_GROUND_Y = ACTOR_Y;
export type { LandmarkKind };
export { roadNode };
