
from pathlib import Path

p = Path('src/components/CityScene.tsx')
s = p.read_text()
old = """        150,\n        (Math.min(size.width, size.height) / (2.15 * focusRadius)) *"""
new = """        600,\n        (Math.min(size.width, size.height) / (2.15 * focusRadius)) *"""
assert old in s
s = s.replace(old, new)
p.write_text(s)

p2 = Path('src/components/ActorLayer.tsx')
s = p2.read_text()
s = s.replace(
    "import { useFrame } from '@react-three/fiber';",
    "import { Html } from '@react-three/drei';\nimport { useFrame } from '@react-three/fiber';",
)
s = s.replace("const ACTOR_AVATAR_SCALE = 0.055;", "const ACTOR_AVATAR_SCALE = 0.14;")
s = s.replace(
    "  const selectedRing = useRef<THREE.Mesh>(null);\n  const avatarRefs = useRef(new Map<string, THREE.Group>());",
    "  const selectedRing = useRef<THREE.Mesh>(null);\n  const selectedTag = useRef<THREE.Group>(null);\n  const avatarRefs = useRef(new Map<string, THREE.Group>());",
)
old_frame = """    if (selectedRing.current && selectedActor) {\n      selectedRing.current.position.set(\n        selectedActor.position.x,\n        0.095,\n        selectedActor.position.z,\n      );\n      selectedRing.current.scale.setScalar(scale * 2.2);\n      selectedRing.current.visible = !(\n        heroVisible && actorInHero(selectedActor)\n      );\n    } else if (selectedRing.current) {\n      selectedRing.current.visible = false;\n    }"""
new_frame = """    if (selectedRing.current && selectedActor) {\n      selectedRing.current.position.set(\n        selectedActor.position.x,\n        0.095,\n        selectedActor.position.z,\n      );\n      selectedRing.current.scale.setScalar(scale * 2.2);\n      selectedRing.current.visible = !(\n        heroVisible && actorInHero(selectedActor)\n      );\n    } else if (selectedRing.current) {\n      selectedRing.current.visible = false;\n    }\n\n    if (selectedTag.current && selectedActor) {\n      selectedTag.current.position.set(\n        selectedActor.position.x,\n        0.16,\n        selectedActor.position.z,\n      );\n    }"""
assert old_frame in s
s = s.replace(old_frame, new_frame)
s = s.replace(
    "  const candidateBySlug = useMemo(\n    () =>\n      new Map(\n        candidates.map((candidate) => [candidate.candidacy.slug, candidate]),\n      ),\n    [candidates],\n  );",
    "  const candidateBySlug = useMemo(\n    () =>\n      new Map(\n        candidates.map((candidate) => [candidate.candidacy.slug, candidate]),\n      ),\n    [candidates],\n  );\n  const selectedActor = actors.find(\n    (actor) => actor.slug === selectedCandidateSlug,\n  );",
)
old_render = """      {heroVisible &&\n        avatarActors.map((actor, index) => {"""
new_render = """      {selectedActor && (\n        <group ref={selectedTag}>\n          <Html center position={[0, 0, 0]} zIndexRange={[8, 0]}>\n            <span\n              className={\n                'actor-name-tag' + (heroVisible ? '' : ' is-world')\n              }\n            >\n              {selectedActor.displayName}\n              <small>模擬移動</small>\n            </span>\n          </Html>\n        </group>\n      )}\n\n      {heroVisible &&\n        avatarActors.map((actor, index) => {"""
assert old_render in s
s = s.replace(old_render, new_render)
p2.write_text(s)
print('patched camera and actor')
