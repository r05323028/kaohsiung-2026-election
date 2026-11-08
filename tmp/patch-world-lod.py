
from pathlib import Path
p = Path('src/components/WorldLayer.tsx')
s = p.read_text()

s = s.replace("""function buildMassingGroups() {
  const groups = new Map<string, THREE.BufferGeometry[]>();
  for (const district of WORLD_ADMIN_DISTRICTS) {
    const count =
      district.terrain === 'urban'
        ? 30
        : district.terrain === 'coastal'
          ? 18
          : district.terrain === 'hill'
            ? 12
            : 5;
    const spread =
      district.terrain === 'urban'
        ? 2.1
        : district.terrain === 'coastal'
          ? 2.3
          : district.terrain === 'hill'
            ? 3.2
            : 5;""", """function buildMassingGroups(lod: 'overview' | 'detail') {
  const overview = lod === 'overview';
  const groups = new Map<string, THREE.BufferGeometry[]>();
  for (const district of WORLD_ADMIN_DISTRICTS) {
    const count =
      district.terrain === 'urban'
        ? overview
          ? 26
          : 48
        : district.terrain === 'coastal'
          ? overview
            ? 16
            : 26
          : district.terrain === 'hill'
            ? overview
              ? 10
              : 16
            : overview
              ? 4
              : 8;
    const spread =
      district.terrain === 'urban'
        ? overview
          ? 2.4
          : 1.2
        : district.terrain === 'coastal'
          ? overview
            ? 2.6
            : 1.4
          : district.terrain === 'hill'
            ? overview
              ? 3.6
              : 2
            : overview
              ? 5.5
              : 3;""")

s = s.replace("""      const tall = random() > 0.82;
      const height = tall
        ? district.terrain === 'urban'
          ? 0.35 + random() * 0.38
          : 0.12 + random() * 0.18
        : district.terrain === 'urban'
          ? 0.08 + random() * 0.26
          : 0.04 + random() * 0.15;
      const width = tall ? 0.18 + random() * 0.14 : 0.22 + random() * 0.46;
      const depth = tall ? 0.18 + random() * 0.14 : 0.2 + random() * 0.42;""", """      const tall = random() > 0.82;
      const height = tall
        ? district.terrain === 'urban'
          ? overview
            ? 0.35 + random() * 0.38
            : 0.09 + random() * 0.14
          : overview
            ? 0.12 + random() * 0.18
            : 0.035 + random() * 0.07
        : district.terrain === 'urban'
          ? overview
            ? 0.08 + random() * 0.26
            : 0.014 + random() * 0.06
          : overview
            ? 0.04 + random() * 0.15
            : 0.01 + random() * 0.035;
      const width = overview
        ? tall
          ? 0.3 + random() * 0.2
          : 0.3 + random() * 0.42
        : tall
          ? 0.07 + random() * 0.06
          : 0.06 + random() * 0.14;
      const depth = overview
        ? tall
          ? 0.3 + random() * 0.2
          : 0.28 + random() * 0.38
        : tall
          ? 0.07 + random() * 0.06
          : 0.06 + random() * 0.13;""")

s = s.replace("""    const mountain = terrain === 'mountain';
    const count = mountain ? 7 : 4;
    const spread = mountain ? 4.8 : 3.2;
    const anchor = lonLatToWorld(district.labelPoint[0], district.labelPoint[1]);""", """    const mountain = terrain === 'mountain';
    const count = mountain
      ? Math.min(18, Math.max(6, Math.round((district.areaKm2 ?? 20) / 6)))
      : Math.min(10, Math.max(3, Math.round((district.areaKm2 ?? 10) / 8)));
    const box = district.worldBbox;""")

s = s.replace("""      const angle = random() * Math.PI * 2;
      const radius = Math.sqrt(random()) * spread;
      const x = anchor.x + Math.cos(angle) * radius;
      const z = anchor.z + Math.sin(angle) * radius * 0.82;
      if (inHero(x, z) || !pointInWorldDistrict({ x, z }, district)) {
        continue;
      }
      const height = mountain
        ? 0.65 + random() * 1.75
        : 0.22 + random() * 0.52;
      const base = mountain ? 1.1 + random() * 1.8 : 0.8 + random() * 1.1;""", """      const x = box.minX + random() * (box.maxX - box.minX);
      const z = box.minZ + random() * (box.maxZ - box.minZ);
      if (inHero(x, z) || !pointInWorldDistrict({ x, z }, district)) {
        continue;
      }
      const height = mountain
        ? 0.55 + random() * 1.7
        : 0.2 + random() * 0.55;
      const base = mountain ? 1 + random() * 2.1 : 0.7 + random() * 1.3;""")

s = s.replace("""  const massingGroups = useMemo(() => buildMassingGroups(), []);""", """  const massingLod = focusRadius > 26 ? 'overview' : 'detail';
  const massingGroups = useMemo(
    () => buildMassingGroups(massingLod),
    [massingLod],
  );""")

s = s.replace("""              opacity={selected ? 0.52 : hovered ? 0.7 : districtsOpacity}""", """              opacity={selected ? 0.24 : hovered ? 0.38 : districtsOpacity}""")

p.write_text(s)
print('patched')
