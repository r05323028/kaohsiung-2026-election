
from pathlib import Path

p = Path('src/components/CityExplorer.tsx')
s = p.read_text()
s = s.replace("        radius: 0.55,", "        radius: 1.8,")
p.write_text(s)

p2 = Path('src/components/ActorLayer.tsx')
s = p2.read_text()
s = s.replace("const ACTOR_AVATAR_SCALE = 0.14;", "const ACTOR_AVATAR_SCALE = 0.2;")
s = s.replace(
    "      selectedRing.current.scale.setScalar(scale * 2.2);\n      selectedRing.current.visible = !(\n        heroVisible && actorInHero(selectedActor)\n      );",
    "      selectedRing.current.scale.setScalar(\n        Math.min(0.4, Math.max(0.07, focusRadius * 0.02)),\n      );\n      selectedRing.current.visible = focusRadius < 28;",
)
p2.write_text(s)
print('patched candidate framing')
