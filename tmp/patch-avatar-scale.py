
from pathlib import Path
p = Path('src/components/ActorLayer.tsx')
s = p.read_text()
s = s.replace('const ACTOR_AVATAR_SCALE = 0.2;', 'const ACTOR_AVATAR_SCALE = 0.07;')
s = s.replace('        0.22,\n        selectedActor.position.z,', '        0.16,\n        selectedActor.position.z,')
p.write_text(s)
print('scaled avatars')
