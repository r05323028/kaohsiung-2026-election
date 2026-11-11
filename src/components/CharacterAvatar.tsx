import { useRef } from 'react';
import type { PublicCandidateProfile } from '../data';
import CandidateChibi from './CandidateChibi';

export type CandidateAnimator = {
  walkPhase: number;
  walking: boolean;
};

type CharacterAvatarProps = {
  candidate: PublicCandidateProfile;
  selected: boolean;
  walking?: boolean;
  reducedMotion: boolean;
  onSelect: (slug: string) => void;
  position?: [number, number, number];
  rotation?: number;
  walkPhase?: number;
  /** Live render pose, updated outside React every frame. */
  motion?: CandidateAnimator;
};

export default function CharacterAvatar({
  candidate,
  selected,
  walking = false,
  reducedMotion,
  onSelect,
  position,
  rotation,
  walkPhase,
  motion,
}: CharacterAvatarProps) {
  const pointerStart = useRef<{ x: number; y: number } | null>(null);
  const { visual } = candidate;
  const basePosition = position ?? visual.position;
  const baseRotation = rotation ?? visual.rotation;

  return (
    <>
      {/* biome-ignore lint/a11y/noStaticElementInteractions: 3D selection is mirrored by accessible HTML controls. */}
      <group
        position={basePosition}
        rotation={[0, baseRotation, 0]}
        onPointerDown={(event) => {
          pointerStart.current = { x: event.clientX, y: event.clientY };
        }}
        onClick={(event) => {
          event.stopPropagation();
          const start = pointerStart.current;
          pointerStart.current = null;
          if (
            start &&
            Math.hypot(event.clientX - start.x, event.clientY - start.y) > 6
          ) {
            return;
          }
          onSelect(candidate.candidacy.slug);
        }}
        onPointerOver={() => {
          document.body.style.cursor = 'pointer';
        }}
        onPointerOut={() => {
          document.body.style.cursor = '';
        }}
      >
        <CandidateChibi
          candidate={candidate}
          reducedMotion={reducedMotion}
          selected={selected}
          walkPhase={walkPhase}
          walking={walking}
          motion={motion}
        />
      </group>
    </>
  );
}
