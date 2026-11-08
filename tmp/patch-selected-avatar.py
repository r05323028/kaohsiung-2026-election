
from pathlib import Path
p = Path('src/components/ActorLayer.tsx')
s = p.read_text()
s = s.replace(
    "              position={[actor.position.x, 0.035, actor.position.z]}\n              scale={ACTOR_AVATAR_SCALE}",
    "              position={[actor.position.x, 0.035, actor.position.z]}\n              scale={\n                actor.slug === selectedCandidateSlug\n                  ? ACTOR_AVATAR_SCALE * 1.7\n                  : ACTOR_AVATAR_SCALE\n              }",
)
p.write_text(s)
print('selected avatar emphasis')
