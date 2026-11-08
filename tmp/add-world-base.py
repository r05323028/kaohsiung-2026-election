
from pathlib import Path
p = Path('src/world/summary.ts')
s = p.read_text().replace("    radius: Math.max(width, height) * 0.28,", "    radius: Math.max(width, height) * 0.33,")
p.write_text(s)

p = Path('src/components/WorldLayer.tsx')
s = p.read_text()
s = s.replace(
"import { HERO_WORLD_BOUNDS } from '../world/hero';\nimport { lonLatToWorld } from '../world/projection';",
"import { HERO_WORLD_BOUNDS } from '../world/hero';\nimport { lonLatToWorld } from '../world/projection';\nimport { ADMIN_WORLD_BOUNDS, ADMIN_WORLD_CENTER } from '../world/summary';",
)
s = s.replace(
"const TERRAIN_FILL: Record<string, string> = {",
"const BASE_WIDTH =\n  ADMIN_WORLD_BOUNDS.maxX - ADMIN_WORLD_BOUNDS.minX + 20;\nconst BASE_DEPTH =\n  ADMIN_WORLD_BOUNDS.maxZ - ADMIN_WORLD_BOUNDS.minZ + 20;\n\nconst TERRAIN_FILL: Record<string, string> = {",
)
s = s.replace(
"      <mesh\n        position={[31, -0.12, -24]}\n        rotation={[-Math.PI / 2, 0, 0]}\n        receiveShadow\n      >\n        <planeGeometry args={[260, 260]} />\n        <meshStandardMaterial\n          color=\"#8cc3c1\"\n          roughness={0.66}\n          metalness={0.02}\n        />\n      </mesh>",
"      <mesh\n        position={[ADMIN_WORLD_CENTER.x, -0.95, ADMIN_WORLD_CENTER.z]}\n        receiveShadow\n      >\n        <boxGeometry args={[BASE_WIDTH, 1.5, BASE_DEPTH]} />\n        <meshStandardMaterial color=\"#a8895f\" roughness={0.88} />\n      </mesh>\n      <mesh\n        position={[ADMIN_WORLD_CENTER.x, -0.11, ADMIN_WORLD_CENTER.z]}\n        receiveShadow\n      >\n        <boxGeometry args={[BASE_WIDTH - 3, 0.18, BASE_DEPTH - 3]} />\n        <meshStandardMaterial color=\"#d7c3a0\" roughness={0.82} />\n      </mesh>\n      <mesh\n        position={[ADMIN_WORLD_CENTER.x, -0.012, ADMIN_WORLD_CENTER.z]}\n        rotation={[-Math.PI / 2, 0, 0]}\n        receiveShadow\n      >\n        <planeGeometry args={[BASE_WIDTH - 7, BASE_DEPTH - 7]} />\n        <meshStandardMaterial\n          color=\"#8cc3c1\"\n          roughness={0.66}\n          metalness={0.02}\n        />\n      </mesh>",
)
p.write_text(s)
print('base and framing')
