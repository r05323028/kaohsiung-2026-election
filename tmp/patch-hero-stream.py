
from pathlib import Path

p = Path('src/components/ActorLayer.tsx')
s = p.read_text()
s = s.replace(
    "      const hide = heroVisible && actorInHero(actor);\n      dummy.position.set(actor.position.x, 0.08, actor.position.z);",
    "      const hide =\n        heroVisible &&\n        actorInHero(actor) &&\n        actor.slug === selectedCandidateSlug;\n      dummy.position.set(actor.position.x, 0.038, actor.position.z);",
)
s = s.replace(
    "      const hide = heroVisible && actorInHero(actor);\n      if (actor.slug === selectedCandidateSlug) selectedActor = actor;\n      dummy.position.set(actor.position.x, 0.08, actor.position.z);",
    "      const hide =\n        heroVisible &&\n        actorInHero(actor) &&\n        actor.slug === selectedCandidateSlug;\n      if (actor.slug === selectedCandidateSlug) selectedActor = actor;\n      dummy.position.set(actor.position.x, 0.038, actor.position.z);",
)
s = s.replace(
    "      selectedRing.current.position.set(\n        selectedActor.position.x,\n        0.095,\n        selectedActor.position.z,\n      );",
    "      selectedRing.current.position.set(\n        selectedActor.position.x,\n        0.04,\n        selectedActor.position.z,\n      );",
)
s = s.replace(
    "      selectedTag.current.position.set(\n        selectedActor.position.x,\n        0.16,\n        selectedActor.position.z,\n      );",
    "      selectedTag.current.position.set(\n        selectedActor.position.x,\n        0.22,\n        selectedActor.position.z,\n      );",
)
s = s.replace(
    "          <Html center position={[0, 0, 0]} zIndexRange={[8, 0]}>",
    "          <Html\n            center\n            position={[0, 0, 0]}\n            style={{ pointerEvents: 'none' }}\n            zIndexRange={[8, 0]}\n          >",
)
p.write_text(s)

p2 = Path('src/components/CityScene.tsx')
s = p2.read_text()
start = """      <group
        position={[HERO_ORIGIN.x, 0.03, HERO_ORIGIN.z]}
        scale={[HERO_KM_PER_UNIT, HERO_HEIGHT_SCALE, HERO_KM_PER_UNIT]}
      >"""
assert start in s
s = s.replace(start, """      {heroVisible && (
      <group
        position={[HERO_ORIGIN.x, 0.03, HERO_ORIGIN.z]}
        scale={[HERO_KM_PER_UNIT, HERO_HEIGHT_SCALE, HERO_KM_PER_UNIT]}
      >""")
end = """      </group>

      <ActorLayer"""
assert end in s
s = s.replace(end, """      </group>
      )}

      <ActorLayer""")
p2.write_text(s)
print('patched hero streaming and actors')
