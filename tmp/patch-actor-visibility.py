
from pathlib import Path
p=Path('src/components/ActorLayer.tsx')
s=p.read_text()
s=s.replace("""function markerScaleFor(focusRadius: number): number {
  return Math.max(0.03, Math.min(0.32, focusRadius * 0.008));
}""","""function markerScaleFor(focusRadius: number): number {
  return Math.max(0.025, Math.min(0.18, focusRadius * 0.005));
}""")
s=s.replace("""  const avatarActors = useMemo(
    () =>
      heroVisible
        ? actors
            .filter(
              (actor) => actorInHero(actor) && candidateBySlug.has(actor.slug),
            )
            .sort(
              (a, b) =>
                Number(b.slug === selectedCandidateSlug) -
                Number(a.slug === selectedCandidateSlug),
            )
        : [],
    [actors, candidateBySlug, heroVisible, selectedCandidateSlug],
  );""","""  const avatarActors = useMemo(() => {
    const visible = heroVisible
      ? actors.filter(
          (actor) => actorInHero(actor) && candidateBySlug.has(actor.slug),
        )
      : [];
    // The selected actor keeps a full avatar even outside the hero so a
    // followed mayoral candidate remains readable on the low-detail map.
    if (
      selectedCandidateSlug &&
      !visible.some((actor) => actor.slug === selectedCandidateSlug)
    ) {
      const selected = actors.find(
        (actor) => actor.slug === selectedCandidateSlug,
      );
      if (selected && candidateBySlug.has(selected.slug)) visible.push(selected);
    }
    return visible.sort(
      (a, b) =>
        Number(b.slug === selectedCandidateSlug) -
        Number(a.slug === selectedCandidateSlug),
    );
  }, [actors, candidateBySlug, heroVisible, selectedCandidateSlug]);""")
s=s.replace("""    for (const [slug, group] of avatarRefs.current) {
      const actor = actors.find((item) => item.slug === slug);
      if (!actor || !heroVisible || !actorInHero(actor)) {
        group.visible = false;
        continue;
      }
      group.visible = true;
      group.position.set(actor.position.x, 0.035, actor.position.z);""","""    for (const [slug, group] of avatarRefs.current) {
      const actor = actors.find((item) => item.slug === slug);
      const isSelected = slug === selectedCandidateSlug;
      if (!actor || (!isSelected && (!heroVisible || !actorInHero(actor)))) {
        group.visible = false;
        continue;
      }
      group.visible = true;
      group.position.set(
        actor.position.x,
        isSelected && !heroVisible ? 0.05 : 0.035,
        actor.position.z,
      );""")
s=s.replace("""      {heroVisible &&
        avatarActors.map((actor, index) => {""","""      {avatarActors.map((actor, index) => {""")
s=s.replace("""          );
        })}
    </group>""","""          );
        })}
    </group>""")
# instance material: render over low-detail massing so walking markers stay visible
s=s.replace("""          new THREE.MeshBasicMaterial({
            transparent: true,
            opacity: 0.92,
            depthWrite: false,
            side: THREE.DoubleSide,
          }),""","""          new THREE.MeshBasicMaterial({
            transparent: true,
            opacity: 0.92,
            depthWrite: false,
            depthTest: false,
            side: THREE.DoubleSide,
          }),""")
s=s.replace("""      <mesh ref={selectedRing} rotation={[-Math.PI / 2, 0, 0]} renderOrder={3}>
        <ringGeometry args={[0.55, 0.82, 36]} />
        <meshBasicMaterial
          color="#e99679"
          transparent
          opacity={0.85}
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>""","""      <mesh
        ref={selectedRing}
        rotation={[-Math.PI / 2, 0, 0]}
        renderOrder={5}
      >
        <ringGeometry args={[0.55, 0.82, 36]} />
        <meshBasicMaterial
          color="#e99679"
          transparent
          opacity={0.85}
          depthWrite={false}
          depthTest={false}
          side={THREE.DoubleSide}
        />
      </mesh>""")
s=s.replace("""        ]}
        onPointerDown={(event) => {""","""        ]}
        renderOrder={4}
        onPointerDown={(event) => {""",1)
p.write_text(s)
print('actor layer patched')
