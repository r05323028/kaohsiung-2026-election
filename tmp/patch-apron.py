
from pathlib import Path
p = Path('src/components/WorldLayer.tsx')
s = p.read_text()
s = s.replace(
    "import {\n  pointInWorldDistrict,\n  WORLD_ADMIN_DISTRICTS,\n  type WorldDistrict,\n} from '../world/geography';",
    "import {\n  districtAtWorld,\n  pointInWorldDistrict,\n  WORLD_ADMIN_DISTRICTS,\n  type WorldDistrict,\n} from '../world/geography';",
)
s = s.replace(
    "      const angle = random() * Math.PI * 2;\n      const radius = Math.sqrt(random()) * spread;\n      const x = anchor.x + Math.cos(angle) * radius;\n      const z = anchor.z + Math.sin(angle) * radius * 0.86;",
    "      const angle = random() * Math.PI * 2;\n      const radius = Math.sqrt(random()) * spread;\n      const useBbox = random() > 0.72;\n      const box = district.worldBbox;\n      const x = useBbox\n        ? box.minX + random() * (box.maxX - box.minX)\n        : anchor.x + Math.cos(angle) * radius;\n      const z = useBbox\n        ? box.minZ + random() * (box.maxZ - box.minZ)\n        : anchor.z + Math.sin(angle) * radius * 0.86;",
)
insert_after = """function buildReliefGroups() {"""
apron = """function buildHeroApron(lod: 'overview' | 'detail') {
  const overview = lod === 'overview';
  const groups = new Map<string, THREE.BufferGeometry[]>();
  const random = makeRandom(48271);
  const margin = overview ? 2.4 : 1.7;
  const attempts = overview ? 620 : 760;
  const minX = HERO_WORLD_BOUNDS.minX - margin;
  const maxX = HERO_WORLD_BOUNDS.maxX + margin;
  const minZ = HERO_WORLD_BOUNDS.minZ - margin;
  const maxZ = HERO_WORLD_BOUNDS.maxZ + margin;
  for (let index = 0; index < attempts; index += 1) {
    const x = minX + random() * (maxX - minX);
    const z = minZ + random() * (maxZ - minZ);
    if (inHero(x, z) || !districtAtWorld({ x, z })) continue;
    const palette =
      TERRAIN_BUILDING.urban ??
      ['#f0e2c6'];
    const color = palette[Math.floor(random() * palette.length)] ?? '#f0e2c6';
    const width = overview ? 0.22 + random() * 0.34 : 0.08 + random() * 0.12;
    const depth = overview ? 0.2 + random() * 0.3 : 0.08 + random() * 0.11;
    const height = overview ? 0.035 + random() * 0.14 : 0.012 + random() * 0.055;
    const geometry = new THREE.BoxGeometry(width, height, depth);
    geometry.rotateY(random() * Math.PI * 2);
    geometry.translate(x, 0.025 + height / 2, z);
    const bucket = groups.get(color) ?? [];
    bucket.push(geometry);
    groups.set(color, bucket);
  }
  return mergeGroups(groups);
}

"""
assert insert_after in s
s = s.replace(insert_after, apron + insert_after)
s = s.replace(
    "  const massingGroups = useMemo(\n    () => buildMassingGroups(massingLod),\n    [massingLod],\n  );",
    "  const massingGroups = useMemo(\n    () => buildMassingGroups(massingLod),\n    [massingLod],\n  );\n  const apronGroups = useMemo(\n    () => buildHeroApron(massingLod),\n    [massingLod],\n  );",
)
s = s.replace(
    "      for (const group of massingGroups) group.geometry.dispose();\n      for (const group of reliefGroups) group.geometry.dispose();",
    "      for (const group of massingGroups) group.geometry.dispose();\n      for (const group of apronGroups) group.geometry.dispose();\n      for (const group of reliefGroups) group.geometry.dispose();",
)
s = s.replace(
    "      boundaryGeometry,\n      districtMeshes,\n      massingGroups,",
    "      apronGroups,\n      boundaryGeometry,\n      districtMeshes,\n      massingGroups,",
)
render_after = """      {massingGroups.map((group) => ("""
render = """      {apronGroups.map((group) => (
        <mesh
          key={'apron-' + group.color}
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

      {massingGroups.map((group) => ("""
assert render_after in s
s = s.replace(render_after, render)
p.write_text(s)
print('patched apron')
