import { Html } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { CandidateProfile } from '../data';
import { HERO_WORLD_BOUNDS, insideHero } from '../world/hero';
import {
  advanceSimulation,
  getActors,
  type WorldActor,
} from '../world/simulation';
import CharacterAvatar from './CharacterAvatar';

type ActorLayerProps = {
  candidates: CandidateProfile[];
  selectedCandidateSlug: string | null;
  focusRadius: number;
  heroVisible: boolean;
  reducedMotion: boolean;
  onSelectCandidate: (slug: string) => void;
};

const ACTOR_AVATAR_SCALE = 0.07;

function markerScaleFor(focusRadius: number): number {
  return Math.max(0.025, Math.min(0.18, focusRadius * 0.005));
}

function actorInHero(actor: WorldActor): boolean {
  return (
    insideHero(actor.position, 0.12) &&
    actor.position.x >= HERO_WORLD_BOUNDS.minX &&
    actor.position.x <= HERO_WORLD_BOUNDS.maxX &&
    actor.position.z >= HERO_WORLD_BOUNDS.minZ &&
    actor.position.z <= HERO_WORLD_BOUNDS.maxZ
  );
}

export default function ActorLayer({
  candidates,
  selectedCandidateSlug,
  focusRadius,
  heroVisible,
  reducedMotion,
  onSelectCandidate,
}: ActorLayerProps) {
  const actors = getActors();
  const markerRef = useRef<THREE.InstancedMesh>(null);
  const markerDummy = useRef(new THREE.Object3D());
  const lastMarkerUpdate = useRef(0);
  const selectedRing = useRef<THREE.Mesh>(null);
  const selectedTag = useRef<THREE.Group>(null);
  const avatarRefs = useRef(new Map<string, THREE.Group>());
  const drag = useRef<{ x: number; y: number } | null>(null);
  const candidateBySlug = useMemo(
    () =>
      new Map(
        candidates.map((candidate) => [candidate.candidacy.slug, candidate]),
      ),
    [candidates],
  );
  const actorBySlug = useMemo(
    () => new Map(actors.map((actor) => [actor.slug, actor])),
    [actors],
  );
  const selectedActor = selectedCandidateSlug
    ? actorBySlug.get(selectedCandidateSlug)
    : undefined;

  const avatarActors = useMemo(() => {
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
      if (selected && candidateBySlug.has(selected.slug))
        visible.push(selected);
    }
    return visible.sort(
      (a, b) =>
        Number(b.slug === selectedCandidateSlug) -
        Number(a.slug === selectedCandidateSlug),
    );
  }, [actors, candidateBySlug, heroVisible, selectedCandidateSlug]);

  // Full avatars are limited to actors inside the hero tile (12 council-04
  // actors in the first slice); actors elsewhere use one instanced marker pass.
  const avatarCandidates = useMemo(
    () =>
      avatarActors
        .map((actor) => candidateBySlug.get(actor.slug))
        .filter((candidate): candidate is CandidateProfile =>
          Boolean(candidate),
        ),
    [avatarActors, candidateBySlug],
  );

  useLayoutEffect(() => {
    const marker = markerRef.current;
    if (!marker) return;
    const dummy = new THREE.Object3D();
    const scale = markerScaleFor(focusRadius);
    actors.forEach((actor, index) => {
      const hide = heroVisible && actorInHero(actor);
      dummy.position.set(actor.position.x, 0.038, actor.position.z);
      dummy.rotation.set(-Math.PI / 2, 0, 0);
      dummy.scale.setScalar(hide ? 0 : scale);
      dummy.updateMatrix();
      marker.setMatrixAt(index, dummy.matrix);
      const candidate = candidateBySlug.get(actor.slug);
      marker.setColorAt(
        index,
        new THREE.Color(
          actor.slug === selectedCandidateSlug
            ? '#e99679'
            : (candidate?.visual.palette.top ?? '#4cafa8'),
        ),
      );
    });
    marker.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    marker.instanceMatrix.needsUpdate = true;
    if (marker.instanceColor) marker.instanceColor.needsUpdate = true;
    marker.frustumCulled = false;
  }, [
    actors,
    candidateBySlug,
    focusRadius,
    heroVisible,
    selectedCandidateSlug,
  ]);

  useFrame((state, delta) => {
    if (!reducedMotion) advanceSimulation(delta);
    const marker = markerRef.current;
    const selected = selectedCandidateSlug
      ? actorBySlug.get(selectedCandidateSlug)
      : undefined;
    const elapsed = state.clock.getElapsedTime();
    if (marker && elapsed - lastMarkerUpdate.current >= 1 / 12) {
      lastMarkerUpdate.current = elapsed;
      const scale = markerScaleFor(focusRadius);
      const dummy = markerDummy.current;
      actors.forEach((actor, index) => {
        const hide = heroVisible && actorInHero(actor);
        dummy.position.set(actor.position.x, 0.038, actor.position.z);
        dummy.rotation.set(-Math.PI / 2, 0, 0);
        dummy.scale.setScalar(hide ? 0 : scale);
        dummy.updateMatrix();
        marker.setMatrixAt(index, dummy.matrix);
      });
      marker.instanceMatrix.needsUpdate = true;
    }
    if (selectedRing.current && selected) {
      selectedRing.current.position.set(
        selected.position.x,
        0.04,
        selected.position.z,
      );
      selectedRing.current.scale.setScalar(
        Math.min(0.4, Math.max(0.07, focusRadius * 0.02)),
      );
      selectedRing.current.visible = focusRadius < 28;
    } else if (selectedRing.current) {
      selectedRing.current.visible = false;
    }

    if (selectedTag.current && selected) {
      selectedTag.current.position.set(
        selected.position.x,
        0.16,
        selected.position.z,
      );
    }

    for (const [slug, group] of avatarRefs.current) {
      const actor = actorBySlug.get(slug);
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
      );
      group.rotation.y = actor.heading;
    }
  });

  return (
    <group>
      {/* biome-ignore lint/a11y/noStaticElementInteractions: selection is mirrored by the HUD. */}
      <instancedMesh
        ref={markerRef}
        args={[
          new THREE.CircleGeometry(1, 24),
          new THREE.MeshBasicMaterial({
            transparent: true,
            opacity: 0.92,
            depthWrite: false,
            depthTest: false,
            side: THREE.DoubleSide,
          }),
          actors.length,
        ]}
        renderOrder={4}
        onPointerDown={(event) => {
          event.stopPropagation();
          drag.current = { x: event.clientX, y: event.clientY };
        }}
        onClick={(event) => {
          event.stopPropagation();
          const start = drag.current;
          drag.current = null;
          if (
            start &&
            Math.hypot(event.clientX - start.x, event.clientY - start.y) > 7
          ) {
            return;
          }
          if (event.instanceId === undefined) return;
          const actor = actors[event.instanceId];
          if (actor) onSelectCandidate(actor.slug);
        }}
      />
      <mesh ref={selectedRing} rotation={[-Math.PI / 2, 0, 0]} renderOrder={5}>
        <ringGeometry args={[0.55, 0.82, 36]} />
        <meshBasicMaterial
          color="#e99679"
          transparent
          opacity={0.85}
          depthWrite={false}
          depthTest={false}
          side={THREE.DoubleSide}
        />
      </mesh>

      {selectedActor && (
        <group ref={selectedTag}>
          <Html
            center
            position={[0, 0, 0]}
            style={{ pointerEvents: 'none' }}
            zIndexRange={[8, 0]}
          >
            <span className={`actor-name-tag${heroVisible ? '' : ' is-world'}`}>
              {selectedActor.displayName}
              <small>模擬移動</small>
            </span>
          </Html>
        </group>
      )}

      {avatarActors.map((actor, index) => {
        const candidate = avatarCandidates[index];
        if (!candidate) return null;
        return (
          <group
            key={actor.slug}
            ref={(node) => {
              if (node) avatarRefs.current.set(actor.slug, node);
              else avatarRefs.current.delete(actor.slug);
            }}
            position={[actor.position.x, 0.035, actor.position.z]}
            scale={ACTOR_AVATAR_SCALE}
          >
            <CharacterAvatar
              candidate={candidate}
              selected={actor.slug === selectedCandidateSlug}
              reducedMotion={reducedMotion}
              walking={actor.state === 'walking'}
              onSelect={onSelectCandidate}
              position={[0, 0, 0]}
              rotation={0}
            />
          </group>
        );
      })}
    </group>
  );
}
