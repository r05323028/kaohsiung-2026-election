import { useFrame } from '@react-three/fiber';
import { useMemo } from 'react';
import * as THREE from 'three';
import { buildCityBuildingGeometry } from '../world/building-geometry';
import {
  type BuildingDetail,
  buildingDetailForZoom,
  generateCityBuildings,
} from '../world/buildings';

type HexBuildingsProps = {
  detail: BuildingDetail;
};

const BUILDINGS = buildCityBuildingGeometry(generateCityBuildings());

const BUCKET_MATERIALS = {
  wall: new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.88,
    metalness: 0,
  }),
  glass: new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.24,
    metalness: 0.2,
    envMapIntensity: 0.6,
  }),
  metal: new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.52,
    metalness: 0.35,
  }),
} as const;

const INDEX_COUNT: Record<BuildingDetail, (bucket: keyof typeof BUCKET_MATERIALS) => number> = {
  low: (bucket) => BUILDINGS.buckets[bucket].lowIndexCount,
  medium: (bucket) => BUILDINGS.buckets[bucket].mediumIndexCount,
  high: (bucket) => BUILDINGS.buckets[bucket].highIndexCount,
};

export default function HexBuildings({ detail }: HexBuildingsProps) {
  const meshes = useMemo(() => {
    const buckets = Object.keys(BUILDINGS.buckets) as Array<
      keyof typeof BUCKET_MATERIALS
    >;
    return buckets.map((bucket) => {
      const geometry = BUILDINGS.buckets[bucket].geometry;
      geometry.setDrawRange(0, BUILDINGS.buckets[bucket].lowIndexCount);
      return { bucket, geometry };
    });
  }, []);

  useFrame(({ camera }) => {
    const tier = buildingDetailForZoom(
      (camera as THREE.OrthographicCamera).zoom,
      detail,
    );
    for (const { bucket, geometry } of meshes) {
      const count = INDEX_COUNT[tier](bucket);
      if (geometry.drawRange.count !== count) {
        geometry.setDrawRange(0, count);
      }
    }
  });

  return (
    <group>
      {meshes.map(({ bucket, geometry }) => (
        <mesh
          key={bucket}
          geometry={geometry}
          material={BUCKET_MATERIALS[bucket]}
          castShadow
          receiveShadow
          frustumCulled={false}
          raycast={() => {}}
        />
      ))}
    </group>
  );
}
