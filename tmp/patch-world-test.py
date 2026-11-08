
from pathlib import Path
p = Path('src/world/world.test.ts')
s = p.read_text()
s = s.replace(
    "  WORLD_ADJACENCY,\n  WORLD_BOUNDS,\n  districtAtWorld,",
    "  WORLD_ADJACENCY,\n  WORLD_ADMIN_DISTRICTS,\n  districtAtWorld,",
)
s = s.replace(
    "    expect(lonLatToWorld(120.3, 22.7)).toEqual({ x: 0, z: 0 });\n    const point = lonLatToWorld(120.352, 22.641);\n    const back = worldToLonLat(point);\n    expect(back.lon).toBeCloseTo(120.352, 5);\n    expect(back.lat).toBeCloseTo(22.641, 5);",
    "    const origin = lonLatToWorld(120.3, 22.7);\n    expect(origin.x).toBe(0);\n    expect(origin.z).toBeCloseTo(0, 8);\n    const point = lonLatToWorld(120.352, 22.641);\n    const back = worldToLonLat(point.x, point.z);\n    expect(back[0]).toBeCloseTo(120.352, 5);\n    expect(back[1]).toBeCloseTo(22.641, 5);",
)
s = s.replace(
    "    expect(WORLD_ADJACENCY['左營區']).toContain('楠梓區');\n    expect(WORLD_ADJACENCY['楠梓區']).toContain('左營區');",
    "    expect(WORLD_ADJACENCY['左營']).toContain('楠梓');\n    expect(WORLD_ADJACENCY['楠梓']).toContain('左營');",
)
s = s.replace(
    "    const zuoying = ADMIN_DISTRICT_BY_NAME['左營區'];\n    const nanzih = ADMIN_DISTRICT_BY_NAME['楠梓區'];",
    "    const zuoying = ADMIN_DISTRICT_BY_NAME.get('左營');\n    const nanzih = ADMIN_DISTRICT_BY_NAME.get('楠梓');",
)
s = s.replace(
    "    expect(WORLD_BOUNDS.maxX).toBeGreaterThan(50);\n    expect(focusForWorldOverview().radius).toBeGreaterThan(40);",
    "    const maxX = Math.max(\n      ...WORLD_ADMIN_DISTRICTS.map((district) => district.worldBbox.maxX),\n    );\n    expect(maxX).toBeGreaterThan(50);\n    expect(focusForWorldOverview().radius).toBeGreaterThan(40);",
)
s = s.replace(
    "    const qijin = ADMIN_DISTRICT_BY_NAME['旗津區'];",
    "    const qijin = ADMIN_DISTRICT_BY_NAME.get('旗津');",
)
s = s.replace(
    "    expect(scope.allowedAdminNames).toEqual(\n      expect.arrayContaining(['左營區', '楠梓區']),\n    );\n    expect(scope.allowedAdminNames).toHaveLength(2);",
    "    expect(scope.allowedAdminNames).toEqual(\n      expect.arrayContaining(['左營', '楠梓']),\n    );\n    expect(scope.allowedAdminNames).toHaveLength(2);",
)
s = s.replace(
    "    expect(electoralDistrictSlugForAdminName('左營區')).toBe(\n      'kaohsiung-council-04',\n    );\n    expect(electoralDistrictSlugForAdminName('楠梓區')).toBe(\n      'kaohsiung-council-04',\n    );\n    expect(electoralDistrictSlugForAdminName('鳳山區')).toBe(\n      'kaohsiung-council-09',\n    );",
    "    expect(electoralDistrictSlugForAdminName('左營')).toBe(\n      'kaohsiung-council-04',\n    );\n    expect(electoralDistrictSlugForAdminName('楠梓')).toBe(\n      'kaohsiung-council-04',\n    );\n    expect(electoralDistrictSlugForAdminName('鳳山')).toBe(\n      'kaohsiung-council-09',\n    );",
)
s = s.replace(
    "    expect(scope.allowedAdminNames).toEqual(\n      expect.arrayContaining(['左營區', '楠梓區']),\n    );\n  });",
    "    expect(scope.allowedAdminNames).toEqual(\n      expect.arrayContaining(['左營', '楠梓']),\n    );\n  });",
)
s = s.replace(
    "    expect(COUNCIL_04_ROUTE.districtIds.sort()).toEqual(\n      ['左營區', '楠梓區'].sort(),\n    );",
    "    expect([...COUNCIL_04_ROUTE.districtIds].sort()).toEqual(\n      ['E03', 'E04'].sort(),\n    );",
)
s = s.replace(
    "      expect(districtAtWorld(point)?.name).toMatch(/左營區|楠梓區/);",
    "      expect(['左營區', '楠梓區']).toContain(districtAtWorld(point)?.name);",
)
s = s.replace(
    "    expect(MAYORAL_ROUTE.districtIds).toEqual(\n      expect.arrayContaining(['左營區', '楠梓區', '橋頭區', '岡山區']),\n    );",
    "    expect(MAYORAL_ROUTE.districtIds).toEqual(\n      expect.arrayContaining(['E03', 'E04', 'E20', 'E19']),\n    );",
)
s = s.replace(
    "    const fuoshan = ADMIN_DISTRICT_BY_NAME['鳳山區'];\n    const zuoying = ADMIN_DISTRICT_BY_NAME['左營區'];",
    "    const fuoshan = ADMIN_DISTRICT_BY_NAME.get('鳳山');\n    const zuoying = ADMIN_DISTRICT_BY_NAME.get('左營');",
)
s = s.replace(
    "  it('is deterministic after reset', () => {\n    const before = getActors().map((actor) => ({\n      slug: actor.slug,\n      x: actor.position.x,\n      z: actor.position.z,\n    }));\n    resetSimulation();\n    advanceSimulationSeconds(120);\n    const after = getActors().map((actor) => ({\n      slug: actor.slug,\n      x: actor.position.x,\n      z: actor.position.z,\n    }));\n    expect(after).toEqual(before);\n  });",
    "  it('is deterministic after reset', () => {\n    advanceSimulationSeconds(120);\n    const before = getActors().map((actor) => ({\n      slug: actor.slug,\n      x: actor.position.x,\n      z: actor.position.z,\n    }));\n    resetSimulation();\n    advanceSimulationSeconds(120);\n    const after = getActors().map((actor) => ({\n      slug: actor.slug,\n      x: actor.position.x,\n      z: actor.position.z,\n    }));\n    expect(after).toEqual(before);\n  });",
)
p.write_text(s)
print('test fixes')
