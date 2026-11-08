
from pathlib import Path
p = Path('src/components/WorldLayer.tsx')
s = p.read_text()
old = """      <mesh
        position={[ADMIN_WORLD_CENTER.x, -0.95, ADMIN_WORLD_CENTER.z]}
        receiveShadow
      >
        <boxGeometry args={[BASE_WIDTH, 1.5, BASE_DEPTH]} />
        <meshStandardMaterial color="#a8895f" roughness={0.88} />
      </mesh>
      <mesh
        position={[ADMIN_WORLD_CENTER.x, -0.11, ADMIN_WORLD_CENTER.z]}
        receiveShadow
      >
        <boxGeometry args={[BASE_WIDTH - 3, 0.18, BASE_DEPTH - 3]} />
        <meshStandardMaterial color="#d7c3a0" roughness={0.82} />
      </mesh>
      <mesh
        position={[ADMIN_WORLD_CENTER.x, -0.012, ADMIN_WORLD_CENTER.z]}
        rotation={[-Math.PI / 2, 0, 0]}
        receiveShadow
      >
        <planeGeometry args={[BASE_WIDTH - 7, BASE_DEPTH - 7]} />
        <meshStandardMaterial
          color="#8cc3c1"
          roughness={0.66}
          metalness={0.02}
        />
      </mesh>"""
new = """      <mesh
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
      </mesh>"""
if old not in s:
    raise SystemExit('base block not found')
s = s.replace(old, new)
s = s.replace("const BASE_WIDTH =\n  ADMIN_WORLD_BOUNDS.maxX - ADMIN_WORLD_BOUNDS.minX + 20;\nconst BASE_DEPTH =\n  ADMIN_WORLD_BOUNDS.maxZ - ADMIN_WORLD_BOUNDS.minZ + 20;\n\n", "")
s = s.replace("import { ADMIN_WORLD_BOUNDS, ADMIN_WORLD_CENTER } from '../world/summary';", "import { ADMIN_WORLD_CENTER } from '../world/summary';")
p.write_text(s)
print('base removed')
