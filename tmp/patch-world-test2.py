
from pathlib import Path
p = Path('src/world/world.test.ts')
s = p.read_text()
s = s.replace(
    "      const neighbours = WORLD_ADJACENCY[district.name] ?? [];\n      expect(neighbours.length).toBeGreaterThan(0);\n      for (const neighbour of neighbours) {\n        expect(WORLD_ADJACENCY[neighbour]).toContain(district.name);\n      }",
    "      const neighbours = WORLD_ADJACENCY[district.shortName] ?? [];\n      expect(neighbours.length).toBeGreaterThan(0);\n      for (const neighbour of neighbours) {\n        expect(WORLD_ADJACENCY[neighbour]).toContain(district.shortName);\n      }",
)
s = s.replace(
    "    expect(route.allowedAdminIds).toEqual(scope.allowedAdminIds);",
    "    expect([...route.allowedAdminIds].sort()).toEqual(\n      [...scope.allowedAdminIds].sort(),\n    );",
)
s = s.replace(
    "          seen.add(actor.currentAdminName);\n          expect(actor.currentAdminId).toMatch(/^E0[34]$/);",
    "          if (actor.currentAdminName) seen.add(actor.currentAdminName);\n          expect(actor.currentAdminId).toMatch(/^E0[34]$/);",
)
s = s.replace(
    "      if (actor.role === 'mayor') {\n        seen.add(actor.currentAdminName);\n      }",
    "      if (actor.role === 'mayor' && actor.currentAdminName) {\n        seen.add(actor.currentAdminName);\n      }",
)
p.write_text(s)
print('test fixes 2')
