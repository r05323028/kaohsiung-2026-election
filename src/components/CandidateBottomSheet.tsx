import {
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { PublicCandidateProfile, PublicDistrictView } from '../data';
import {
  ballotNumberText,
  compareBallotNumbers,
} from '../data/official/ballot';
import {
  type CandidateSheetBounds,
  resolveCandidateSheetBounds,
} from './candidate-sheet-geometry';

const NAVBAR_SELECTOR = '[data-testid="global-header"]';

function measureNavbarBottom(): number | null {
  const navbar = document.querySelector<HTMLElement>(NAVBAR_SELECTOR);
  if (!navbar) return null;
  const rect = navbar.getBoundingClientRect();
  return rect.height > 0 ? rect.bottom : null;
}

/**
 * The expanded sheet is anchored to the real masthead instead of a hard-coded
 * offset: the navbar height changes between breakpoints and with browser font
 * scaling, and its position shifts when mobile chrome collapses.
 */
function useCandidateSheetBounds(open: boolean): CandidateSheetBounds | null {
  const [bounds, setBounds] = useState<CandidateSheetBounds | null>(null);

  useEffect(() => {
    if (!open) return;

    let frame = 0;
    const sync = () => {
      frame = 0;
      const navBottom = measureNavbarBottom();
      if (navBottom === null) {
        setBounds(null);
        return;
      }
      const next = resolveCandidateSheetBounds({
        viewportHeight: window.innerHeight,
        navBottom,
      });
      setBounds((current) =>
        current &&
        current.top === next.top &&
        current.maxHeight === next.maxHeight
          ? current
          : next,
      );
    };
    const schedule = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(sync);
    };

    sync();
    const navbar = document.querySelector<HTMLElement>(NAVBAR_SELECTOR);
    const observer =
      navbar && typeof ResizeObserver === 'function'
        ? new ResizeObserver(schedule)
        : null;
    observer?.observe(navbar as HTMLElement);
    window.addEventListener('resize', schedule);
    window.addEventListener('orientationchange', schedule);
    window.visualViewport?.addEventListener('resize', schedule);

    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener('resize', schedule);
      window.removeEventListener('orientationchange', schedule);
      window.visualViewport?.removeEventListener('resize', schedule);
    };
  }, [open]);

  return bounds;
}

export type CandidateConstituencyGroup = {
  district: PublicDistrictView;
  candidates: PublicCandidateProfile[];
};

export function groupCandidatesByConstituency(
  candidates: PublicCandidateProfile[],
  districts: PublicDistrictView[],
): CandidateConstituencyGroup[] {
  const inputOrder = new Map(
    candidates.map((candidate, index) => [candidate.candidacy.id, index]),
  );
  const grouped = new Map<string, PublicCandidateProfile[]>();

  for (const candidate of candidates) {
    const current = grouped.get(candidate.candidacy.districtId) ?? [];
    current.push(candidate);
    grouped.set(candidate.candidacy.districtId, current);
  }

  const sortCandidates = (items: PublicCandidateProfile[]) =>
    [...items].sort((left, right) => {
      const ballotOrder = compareBallotNumbers(
        left.candidacy.candidateNumber,
        right.candidacy.candidateNumber,
      );
      if (ballotOrder !== 0) return ballotOrder;
      return (
        (inputOrder.get(left.candidacy.id) ?? Number.MAX_SAFE_INTEGER) -
        (inputOrder.get(right.candidacy.id) ?? Number.MAX_SAFE_INTEGER)
      );
    });

  const groups = districts.map((district) => ({
    district,
    candidates: sortCandidates(grouped.get(district.id) ?? []),
  }));
  const knownDistrictIds = new Set(districts.map((district) => district.id));

  for (const [districtId, districtCandidates] of grouped) {
    if (knownDistrictIds.has(districtId)) continue;
    const fallbackDistrict = districtCandidates[0]?.district;
    if (!fallbackDistrict) continue;
    groups.push({
      district: fallbackDistrict,
      candidates: sortCandidates(districtCandidates),
    });
  }

  return groups.filter((group) => group.candidates.length > 0);
}

type CandidateBottomSheetProps = {
  candidates: PublicCandidateProfile[];
  districts: PublicDistrictView[];
  open: boolean;
  reducedMotion: boolean;
  triggerRef?: RefObject<HTMLButtonElement | null>;
  onOpen: () => void;
  onClose: () => void;
  onSelectCandidate: (candidateId: string) => void;
};

type DragState = {
  pointerId: number;
  startY: number;
  dragging: boolean;
};

export default function CandidateBottomSheet({
  candidates,
  districts,
  open,
  reducedMotion,
  triggerRef,
  onOpen,
  onClose,
  onSelectCandidate,
}: CandidateBottomSheetProps) {
  const groups = useMemo(
    () => groupCandidatesByConstituency(candidates, districts),
    [candidates, districts],
  );
  const dragStateRef = useRef<DragState | null>(null);
  const suppressClickRef = useRef(false);
  const sheetBounds = useCandidateSheetBounds(open);

  const startDrag = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    dragStateRef.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      dragging: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const moveDrag = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = dragStateRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (Math.abs(event.clientY - drag.startY) < 8) return;
    drag.dragging = true;
    event.preventDefault();
  };

  const finishDrag = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = dragStateRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const deltaY = event.clientY - drag.startY;
    if (Math.abs(deltaY) >= 32) {
      suppressClickRef.current = true;
      if (deltaY < 0) onOpen();
      else onClose();
    }
    dragStateRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const cancelDrag = (event: ReactPointerEvent<HTMLElement>) => {
    dragStateRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const handleTriggerClick = () => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    onOpen();
  };

  if (!open) {
    return (
      <div
        className="candidate-sheet candidate-sheet--collapsed"
        data-testid="candidate-bottom-sheet"
      >
        <button
          aria-controls="city-people-tray"
          aria-expanded="false"
          className="candidate-sheet__handle"
          ref={triggerRef}
          type="button"
          onClick={handleTriggerClick}
          onPointerCancel={cancelDrag}
          onPointerDown={startDrag}
          onPointerMove={moveDrag}
          onPointerUp={finishDrag}
        >
          <span
            aria-hidden="true"
            className="candidate-sheet__drag-indicator"
          />
          <span className="candidate-sheet__handle-copy">
            <strong>查看候選人</strong>
            <small>{candidates.length} 位</small>
          </span>
          <span aria-hidden="true" className="candidate-sheet__chevron">
            ↑
          </span>
        </button>
      </div>
    );
  }

  return (
    <div
      className={
        'candidate-sheet candidate-sheet--open' +
        (reducedMotion ? ' prefers-reduced-motion' : '')
      }
      data-testid="candidate-bottom-sheet"
      style={
        sheetBounds
          ? ({
              '--candidate-sheet-top': `${sheetBounds.top}px`,
              '--candidate-sheet-max-height': `${sheetBounds.maxHeight}px`,
            } as CSSProperties)
          : undefined
      }
    >
      <section
        aria-labelledby="candidate-sheet-heading"
        aria-modal="true"
        className="candidate-sheet__surface"
        id="city-people-tray"
        role="dialog"
      >
        <div
          className="candidate-sheet__header"
          onPointerCancel={cancelDrag}
          onPointerDown={startDrag}
          onPointerMove={moveDrag}
          onPointerUp={finishDrag}
        >
          <span
            aria-hidden="true"
            className="candidate-sheet__drag-indicator"
          />
          <h2 id="candidate-sheet-heading">所有候選人</h2>
          <button
            aria-label="關閉所有候選人"
            className="candidate-sheet__close"
            type="button"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={onClose}
          >
            ×
          </button>
        </div>

        <div className="candidate-sheet__scroll">
          {groups.map((group) => (
            <section
              className="candidate-sheet__group"
              data-candidate-count={group.candidates.length}
              data-constituency-id={group.district.id}
              key={group.district.id}
            >
              <div className="candidate-sheet__group-heading">
                <h3>{group.district.name}</h3>
                <span>{group.candidates.length} 位</span>
              </div>
              <div className="candidate-sheet__grid">
                {group.candidates.map((candidate) => {
                  const party =
                    candidate.candidacy.politicalParty === '暫無資料'
                      ? null
                      : candidate.candidacy.politicalParty;
                  return (
                    <button
                      className="city-candidate candidate-sheet__card"
                      data-candidate-id={candidate.candidacy.id}
                      data-candidate-slug={candidate.candidacy.slug}
                      key={candidate.candidacy.id}
                      style={
                        {
                          '--candidate-avatar-color':
                            candidate.visual.palette.top,
                        } as CSSProperties
                      }
                      type="button"
                      onClick={() => onSelectCandidate(candidate.candidacy.id)}
                    >
                      <span
                        aria-hidden="true"
                        className="candidate-list__avatar candidate-sheet__avatar"
                      >
                        {candidate.person.shortName.slice(0, 1)}
                      </span>
                      <span className="candidate-list__copy candidate-sheet__copy">
                        <strong>{candidate.person.shortName}</strong>
                        {party && <small>{party}</small>}
                        <small className="candidate-list__ballot">
                          {ballotNumberText(candidate.candidacy)}
                        </small>
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </section>
    </div>
  );
}
