
from pathlib import Path
p = Path('src/components/ActorLayer.tsx')
s = p.read_text()
s = s.replace(
    "  const avatarActors = useMemo(\n    () =>\n      heroVisible\n        ? actors.filter(\n            (actor) =>\n              actorInHero(actor) &&\n              candidateBySlug.has(actor.slug) &&\n              actor.slug === selectedCandidateSlug,\n          )\n        : [],\n    [actors, candidateBySlug, heroVisible, selectedCandidateSlug],\n  );",
    "  const avatarActors = useMemo(\n    () =>\n      heroVisible\n        ? actors\n            .filter(\n              (actor) =>\n                actorInHero(actor) && candidateBySlug.has(actor.slug),\n            )\n            .sort(\n              (a, b) =>\n                Number(b.slug === selectedCandidateSlug) -\n                Number(a.slug === selectedCandidateSlug),\n            )\n        : [],\n    [actors, candidateBySlug, heroVisible, selectedCandidateSlug],\n  );",
)
s = s.replace(
    "  // Full avatars are intentionally limited to the selected actor inside the\n  // hero tile; all other actors use a single instanced marker pass.",
    "  // Full avatars are limited to actors inside the hero tile (12 council-04\n  // actors in the first slice); actors elsewhere use one instanced marker pass.",
)
s = s.replace(
    "      const hide =\n        heroVisible &&\n        actorInHero(actor) &&\n        actor.slug === selectedCandidateSlug;\n      dummy.position.set(actor.position.x, 0.038, actor.position.z);",
    "      const hide = heroVisible && actorInHero(actor);\n      dummy.position.set(actor.position.x, 0.038, actor.position.z);",
)
s = s.replace(
    "      const hide =\n        heroVisible &&\n        actorInHero(actor) &&\n        actor.slug === selectedCandidateSlug;\n      if (actor.slug === selectedCandidateSlug) selectedActor = actor;\n      dummy.position.set(actor.position.x, 0.038, actor.position.z);",
    "      const hide = heroVisible && actorInHero(actor);\n      if (actor.slug === selectedCandidateSlug) selectedActor = actor;\n      dummy.position.set(actor.position.x, 0.038, actor.position.z);",
)
p.write_text(s)
print('all hero avatars')
