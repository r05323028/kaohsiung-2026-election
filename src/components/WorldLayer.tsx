import { Html } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  districtShapeGeometry,
  worldDistrictOutline,
} from '../world/district-geometry';
import {
  districtAtWorld,
  GEOGRAPHY,
  pointInWorldDistrict,
  WORLD_ADMIN_DISTRICTS,
  type WorldDistrict,
} from '../world/geography';
import { HERO_WORLD_BOUNDS } from '../world/hero';
import { lonLatToWorld } from '../world/projection';
import { ADMIN_WORLD_CENTER } from '../world/summary';
import { WORLD_WALK_GRAPH } from '../world/walk-graph';

type WorldLayerProps = {
  focusRadius: number;
  selectedAdminId: string | null;
  hoveredAdminId: string | null;
  heroVisible: boolean;
  boundaryDebug: boolean;
  onSelectAdmin: (id: string | null) => void;
  onHoverAdmin: (id: string | null) => void;
  reducedMotion: boolean;
};

const TERRAIN_FILL: Record<string, string> = {
  urban: '#d7c6a4',
  coastal: '#d5c59f',
  hill: '#a9bf88',
  mountain: '#7f9f6d',
};
const TERRAIN_BUILDING: Record<string, string[]> = {
  urban: ['#dbc7a2', '#c9b48f', '#b7c4a5', '#d8b48e', '#c7c0ae'],
  coastal: ['#d2c3a4', '#bfb9a3', '#b8c6b8', '#c9ad94'],
  hill: ['#c3c4a9', '#b1bfa0', '#c9bda2'],
  mountain: ['#a8b797', '#b5c0a0'],
};
const RELIEF_COLOR: Record<string, string[]> = {
  hill: ['#91ad7c', '#7f9f72', '#a3b88c'],
  mountain: ['#6f9367', '#7f9f6d', '#5f8459', '#88a578'],
};

function makeRandom(seed: number) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

function buildBoundaries(): THREE.BufferGeometry {
  const positions: number[] = [];
  for (const district of WORLD_ADMIN_DISTRICTS) {
    for (const ring of district.worldPolygons) {
      for (let index = 0; index < ring.length; index += 1) {
        const a = ring[index];
        const b = ring[(index + 1) % ring.length];
        if (!a || !b) continue;
        positions.push(a.x, 0.065, a.z, b.x, 0.065, b.z);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(positions, 3),
  );
  return geometry;
}

function inHero(x: number, z: number) {
  return (
    x > HERO_WORLD_BOUNDS.minX - 0.25 &&
    x < HERO_WORLD_BOUNDS.maxX + 0.25 &&
    z > HERO_WORLD_BOUNDS.minZ - 0.25 &&
    z < HERO_WORLD_BOUNDS.maxZ + 0.25
  );
}

function mergeGroups(
  groups: Map<string, THREE.BufferGeometry[]>,
): Array<{ color: string; geometry: THREE.BufferGeometry }> {
  const out: Array<{ color: string; geometry: THREE.BufferGeometry }> = [];
  for (const [color, parts] of groups) {
    if (parts.length === 0) continue;
    const geometry = mergeGeometries(parts, false);
    for (const part of parts) part.dispose();
    if (geometry) out.push({ color, geometry });
  }
  return out;
}

/**
 * Low-detail urban massing. These are deliberately chunky miniature blocks:
 * they are only visible as city texture at citywide zoom and are replaced by
 * the hand-built hero diorama in Zuoying / Nanzih.
 */
function buildMassingGroups(lod: 'overview' | 'detail') {
  const overview = lod === 'overview';
  const groups = new Map<string, THREE.BufferGeometry[]>();
  for (const district of WORLD_ADMIN_DISTRICTS) {
    const terrain = district.terrain;
    const palette = TERRAIN_BUILDING[terrain] ??
      TERRAIN_BUILDING.urban ?? ['#e6d8bf'];
    const random = makeRandom(
      district.id
        .split('')
        .reduce((value, char) => value * 31 + char.charCodeAt(0), 7),
    );
    const anchor = lonLatToWorld(
      district.labelPoint[0],
      district.labelPoint[1],
    );
    const box = district.worldBbox;
    const clusterCount =
      terrain === 'urban'
        ? overview
          ? 10
          : 14
        : terrain === 'coastal'
          ? overview
            ? 7
            : 11
          : terrain === 'hill'
            ? overview
              ? 4
              : 7
            : overview
              ? 2
              : 3;
    const spread =
      terrain === 'urban'
        ? overview
          ? 2.6
          : 1.9
        : terrain === 'coastal'
          ? overview
            ? 2.8
            : 2.1
          : terrain === 'hill'
            ? overview
              ? 3.6
              : 2.6
            : overview
              ? 5
              : 3.4;
    let placedClusters = 0;
    let guard = 0;
    while (placedClusters < clusterCount && guard < clusterCount * 36) {
      guard += 1;
      const useBbox = random() > 0.78;
      const angle = random() * Math.PI * 2;
      const radius = Math.sqrt(random()) * spread;
      const centerX = useBbox
        ? box.minX + random() * (box.maxX - box.minX)
        : anchor.x + Math.cos(angle) * radius;
      const centerZ = useBbox
        ? box.minZ + random() * (box.maxZ - box.minZ)
        : anchor.z + Math.sin(angle) * radius * 0.85;
      if (!pointInWorldDistrict({ x: centerX, z: centerZ }, district)) {
        continue;
      }
      const cols = 3 + Math.floor(random() * 3);
      const rows = 2 + Math.floor(random() * 3);
      const step = overview ? 0.42 + random() * 0.24 : 0.14 + random() * 0.1;
      const originX = centerX - ((cols - 1) * step) / 2;
      const originZ = centerZ - ((rows - 1) * step) / 2;
      let placedAny = false;
      for (let col = 0; col < cols; col += 1) {
        for (let row = 0; row < rows; row += 1) {
          if (random() < 0.09) continue;
          const x = originX + col * step + (random() - 0.5) * step * 0.12;
          const z = originZ + row * step + (random() - 0.5) * step * 0.12;
          if (inHero(x, z) || !pointInWorldDistrict({ x, z }, district)) {
            continue;
          }
          const color =
            palette[Math.floor(random() * palette.length)] ?? '#e6d8bf';
          const tall = random() > 0.86;
          const height = tall
            ? terrain === 'urban'
              ? overview
                ? 0.24 + random() * 0.34
                : 0.07 + random() * 0.12
              : overview
                ? 0.1 + random() * 0.16
                : 0.03 + random() * 0.06
            : terrain === 'urban'
              ? overview
                ? 0.07 + random() * 0.2
                : 0.014 + random() * 0.055
              : overview
                ? 0.035 + random() * 0.12
                : 0.01 + random() * 0.03;
          const width = step * (0.42 + random() * 0.22) * (tall ? 0.82 : 1);
          const depth = step * (0.38 + random() * 0.22);
          const geometry = new THREE.BoxGeometry(width, height, depth);
          geometry.translate(x, 0.025 + height / 2, z);
          const bucket = groups.get(color) ?? [];
          bucket.push(geometry);
          groups.set(color, bucket);
          placedAny = true;
        }
      }
      if (placedAny) placedClusters += 1;
    }
  }
  return mergeGroups(groups);
}

/** Low-poly mountain and hill relief for a legible citywide silhouette. */
function buildHeroApron(lod: 'overview' | 'detail') {
  const overview = lod === 'overview';
  const groups = new Map<string, THREE.BufferGeometry[]>();
  const random = makeRandom(48271);
  const margin = overview ? 3.0 : 2.5;
  const step = overview ? 0.5 : 0.26;
  const minX = HERO_WORLD_BOUNDS.minX - margin;
  const maxX = HERO_WORLD_BOUNDS.maxX + margin;
  const minZ = HERO_WORLD_BOUNDS.minZ - margin;
  const maxZ = HERO_WORLD_BOUNDS.maxZ + margin;
  const palette = TERRAIN_BUILDING.urban ?? ['#f0e2c6'];

  // A sparse street grid fills the hero's surroundings with the same kind of
  // clustered urban fabric as the rest of Nanzih, instead of confetti boxes.
  for (let gridX = minX; gridX <= maxX; gridX += step) {
    for (let gridZ = minZ; gridZ <= maxZ; gridZ += step) {
      if (random() < 0.55) continue;
      const x = gridX + (random() - 0.5) * step * 0.22;
      const z = gridZ + (random() - 0.5) * step * 0.22;
      if (inHero(x, z) || !districtAtWorld({ x, z })) continue;
      const color = palette[Math.floor(random() * palette.length)] ?? '#f0e2c6';
      const height = overview
        ? 0.035 + random() * 0.13
        : 0.012 + random() * 0.055;
      const width = step * (0.42 + random() * 0.24);
      const depth = step * (0.38 + random() * 0.24);
      const geometry = new THREE.BoxGeometry(width, height, depth);
      geometry.translate(x, 0.025 + height / 2, z);
      const bucket = groups.get(color) ?? [];
      bucket.push(geometry);
      groups.set(color, bucket);
    }
  }
  return mergeGroups(groups);
}

function buildReliefGroups() {
  const groups = new Map<string, THREE.BufferGeometry[]>();
  for (const district of WORLD_ADMIN_DISTRICTS) {
    const terrain = district.terrain;
    if (terrain !== 'mountain' && terrain !== 'hill') continue;
    const mountain = terrain === 'mountain';
    const count = mountain
      ? Math.min(18, Math.max(6, Math.round((district.areaKm2 ?? 20) / 6)))
      : Math.min(10, Math.max(3, Math.round((district.areaKm2 ?? 10) / 8)));
    const box = district.worldBbox;
    const random = makeRandom(
      district.id
        .split('')
        .reduce((value, char) => value * 37 + char.charCodeAt(0), 11),
    );
    let placed = 0;
    let guard = 0;
    while (placed < count && guard < count * 24) {
      guard += 1;
      const x = box.minX + random() * (box.maxX - box.minX);
      const z = box.minZ + random() * (box.maxZ - box.minZ);
      if (inHero(x, z) || !pointInWorldDistrict({ x, z }, district)) {
        continue;
      }
      const height = mountain ? 0.55 + random() * 1.7 : 0.2 + random() * 0.55;
      const base = mountain ? 1 + random() * 2.1 : 0.7 + random() * 1.3;
      const palette = RELIEF_COLOR[terrain] ??
        RELIEF_COLOR.mountain ?? ['#7f9f6d'];
      const color = palette[Math.floor(random() * palette.length)] ?? '#7f9f6d';
      const geometry = new THREE.ConeGeometry(base, height, 7, 1, false);
      geometry.rotateY(random() * Math.PI);
      geometry.translate(x, 0.02 + height / 2, z);
      geometry.computeVertexNormals();
      const bucket = groups.get(color) ?? [];
      bucket.push(geometry);
      groups.set(color, bucket);
      placed += 1;
    }
  }
  return mergeGroups(groups);
}

function debugLineGeometry(): THREE.BufferGeometry {
  const positions: number[] = [];
  for (const edge of WORLD_WALK_GRAPH.edges) {
    const from = WORLD_WALK_GRAPH.nodeById.get(edge.from);
    const to = WORLD_WALK_GRAPH.nodeById.get(edge.to);
    if (!from || !to) continue;
    positions.push(
      from.point.x,
      0.12,
      from.point.z,
      to.point.x,
      0.12,
      to.point.z,
    );
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(positions, 3),
  );
  return geometry;
}

function BoundaryDebugLayer({
  selectedAdminId,
}: {
  selectedAdminId: string | null;
}) {
  const lines = useMemo(() => debugLineGeometry(), []);
  useEffect(() => () => lines.dispose(), [lines]);
  const gatePoints = useMemo(
    () =>
      GEOGRAPHY.gates.map((gate) => {
        const world = lonLatToWorld(gate.point[0], gate.point[1]);
        return { id: `${gate.a}-${gate.b}`, x: world.x, z: world.z };
      }),
    [],
  );

  return (
    <group>
      <lineSegments geometry={lines}>
        <lineBasicMaterial color="#b45309" transparent opacity={0.8} />
      </lineSegments>
      {gatePoints.map((gate) => (
        <mesh key={gate.id} position={[gate.x, 0.125, gate.z]}>
          <sphereGeometry args={[0.028, 6, 6]} />
          <meshBasicMaterial color="#b45309" />
        </mesh>
      ))}
      {WORLD_ADMIN_DISTRICTS.map((district) => {
        const point = lonLatToWorld(
          district.labelPoint[0],
          district.labelPoint[1],
        );
        return (
          <Html
            center
            key={`debug-${district.id}`}
            position={[point.x, 0.16, point.z]}
            style={{ pointerEvents: 'none' }}
            zIndexRange={[6, 0]}
          >
            <span
              className={
                'world-debug-label' +
                (district.id === selectedAdminId ? ' is-active' : '')
              }
            >
              {district.id}·{district.shortName}
            </span>
          </Html>
        );
      })}
      <lineSegments
        geometry={
          new THREE.EdgesGeometry(
            new THREE.BoxGeometry(
              HERO_WORLD_BOUNDS.maxX - HERO_WORLD_BOUNDS.minX,
              0.08,
              HERO_WORLD_BOUNDS.maxZ - HERO_WORLD_BOUNDS.minZ,
            ),
          )
        }
        position={[
          (HERO_WORLD_BOUNDS.minX + HERO_WORLD_BOUNDS.maxX) / 2,
          0.14,
          (HERO_WORLD_BOUNDS.minZ + HERO_WORLD_BOUNDS.maxZ) / 2,
        ]}
      >
        <lineBasicMaterial color="#d9775b" transparent opacity={0.9} />
      </lineSegments>
    </group>
  );
}

const OVERVIEW_LABELS = new Set([
  '左營',
  '楠梓',
  '鼓山',
  '三民',
  '鳳山',
  '小港',
  '岡山',
  '旗山',
  '美濃',
]);

function WorldLabels({
  selectedAdminId,
  hoveredAdminId,
  focusRadius,
}: {
  selectedAdminId: string | null;
  hoveredAdminId: string | null;
  focusRadius: number;
}) {
  const { size } = useThree();
  if (size.width < 600 || focusRadius < 8) return null;
  const overview = focusRadius > 34;
  return (
    <group>
      {WORLD_ADMIN_DISTRICTS.map((district) => {
        const active =
          district.id === selectedAdminId || district.id === hoveredAdminId;
        if (overview && !active && !OVERVIEW_LABELS.has(district.shortName)) {
          return null;
        }
        if (!active && focusRadius > 10 && (district.areaKm2 ?? 0) < 6) {
          return null;
        }
        const point = lonLatToWorld(
          district.labelPoint[0],
          district.labelPoint[1],
        );
        return (
          <Html
            center
            key={district.id}
            position={[point.x, 0.09, point.z]}
            style={{ pointerEvents: 'none' }}
            zIndexRange={[4, 0]}
          >
            <span
              className={`world-district-label${active ? ' is-active' : ''}`}
            >
              {district.shortName}
            </span>
          </Html>
        );
      })}
    </group>
  );
}

export default function WorldLayer({
  focusRadius,
  selectedAdminId,
  hoveredAdminId,
  heroVisible,
  boundaryDebug,
  onSelectAdmin,
  onHoverAdmin,
  reducedMotion,
}: WorldLayerProps) {
  const cursor = useRef(false);
  const drag = useRef<{ x: number; y: number } | null>(null);

  const districtMeshes = useMemo(
    () =>
      WORLD_ADMIN_DISTRICTS.map((district) => ({
        district,
        geometry: districtShapeGeometry(district),
      })).filter(
        (
          item,
        ): item is {
          district: WorldDistrict;
          geometry: THREE.BufferGeometry;
        } => Boolean(item.geometry),
      ),
    [],
  );
  const boundaryGeometry = useMemo(() => buildBoundaries(), []);
  const massingLod = focusRadius > 26 ? 'overview' : 'detail';
  const massingGroups = useMemo(
    () => buildMassingGroups(massingLod),
    [massingLod],
  );
  const apronGroups = useMemo(() => buildHeroApron(massingLod), [massingLod]);
  const reliefGroups = useMemo(() => buildReliefGroups(), []);
  const selectedDistrict = selectedAdminId
    ? WORLD_ADMIN_DISTRICTS.find((district) => district.id === selectedAdminId)
    : null;
  const selectedOutline = useMemo(
    () => (selectedDistrict ? worldDistrictOutline(selectedDistrict) : null),
    [selectedDistrict],
  );

  useEffect(
    () => () => {
      // District geometries are cached by district-geometry.ts and shared
      // across WorldLayer mounts; do not dispose them here.
      boundaryGeometry.dispose();
      selectedOutline?.dispose();
      for (const group of massingGroups) group.geometry.dispose();
      for (const group of apronGroups) group.geometry.dispose();
      for (const group of reliefGroups) group.geometry.dispose();
    },
    [
      apronGroups,
      boundaryGeometry,
      massingGroups,
      reliefGroups,
      selectedOutline,
    ],
  );

  useEffect(
    () => () => {
      document.body.style.cursor = '';
    },
    [],
  );

  const districtsOpacity = heroVisible ? 0.9 : 0.96;
  const worldShadows = !reducedMotion && focusRadius < 10;

  return (
    <group>
      <mesh
        position={[ADMIN_WORLD_CENTER.x, -0.012, ADMIN_WORLD_CENTER.z]}
        rotation={[-Math.PI / 2, 0, 0]}
        receiveShadow
      >
        <planeGeometry args={[260, 260]} />
        <meshStandardMaterial
          color="#8cc3c1"
          roughness={0.66}
          metalness={0.02}
        />
      </mesh>

      {districtMeshes.map(({ district, geometry }) => {
        const selected = district.id === selectedAdminId;
        const hovered = district.id === hoveredAdminId;
        return (
          // biome-ignore lint/a11y/noStaticElementInteractions: 3D district selection is mirrored by HUD controls.
          <mesh
            key={district.id}
            geometry={geometry}
            position={[0, 0.03, 0]}
            receiveShadow
            onClick={(event) => {
              event.stopPropagation();
              const start = drag.current;
              drag.current = null;
              if (
                start &&
                Math.hypot(event.clientX - start.x, event.clientY - start.y) > 7
              ) {
                return;
              }
              onSelectAdmin(district.id);
            }}
            onPointerDown={(event) => {
              drag.current = { x: event.clientX, y: event.clientY };
            }}
            onPointerOver={(event) => {
              event.stopPropagation();
              onHoverAdmin(district.id);
              if (!cursor.current) {
                cursor.current = true;
                document.body.style.cursor = 'pointer';
              }
            }}
            onPointerOut={() => {
              onHoverAdmin(null);
              if (cursor.current) {
                cursor.current = false;
                document.body.style.cursor = '';
              }
            }}
          >
            <meshStandardMaterial
              color={
                selected
                  ? '#f1d5b0'
                  : hovered
                    ? '#f0c4a8'
                    : (TERRAIN_FILL[district.terrain] ??
                      TERRAIN_FILL.urban ??
                      '#d7c6a4')
              }
              roughness={0.95}
              metalness={0.01}
              transparent={!selected}
              opacity={selected ? 1 : hovered ? 0.82 : districtsOpacity}
              side={THREE.DoubleSide}
            />
          </mesh>
        );
      })}

      {selectedOutline && (
        <lineSegments geometry={selectedOutline}>
          <lineBasicMaterial color="#d9775b" transparent opacity={0.9} />
        </lineSegments>
      )}

      <lineSegments geometry={boundaryGeometry}>
        <lineBasicMaterial color="#5b7a6e" transparent opacity={0.5} />
      </lineSegments>

      {apronGroups.map((group) => (
        <mesh
          key={`apron-${group.color}`}
          geometry={group.geometry}
          castShadow={worldShadows}
          receiveShadow
          raycast={() => null}
        >
          <meshStandardMaterial
            color={group.color}
            roughness={0.9}
            metalness={0.02}
          />
        </mesh>
      ))}

      {massingGroups.map((group) => (
        <mesh
          key={`massing-${group.color}`}
          geometry={group.geometry}
          castShadow={worldShadows}
          receiveShadow
          raycast={() => null}
        >
          <meshStandardMaterial
            color={group.color}
            roughness={0.9}
            metalness={0.02}
          />
        </mesh>
      ))}

      {reliefGroups.map((group) => (
        <mesh
          key={`relief-${group.color}`}
          geometry={group.geometry}
          castShadow={false}
          receiveShadow
          raycast={() => null}
        >
          <meshStandardMaterial
            color={group.color}
            roughness={0.98}
            metalness={0}
            flatShading
          />
        </mesh>
      ))}

      {boundaryDebug && (
        <BoundaryDebugLayer selectedAdminId={selectedAdminId} />
      )}

      <WorldLabels
        hoveredAdminId={hoveredAdminId}
        selectedAdminId={selectedAdminId}
        focusRadius={focusRadius}
      />
    </group>
  );
}
