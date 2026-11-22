import { useSyncExternalStore } from 'react';

/**
 * Bounded retry bookkeeping for optional head kits.
 *
 * A head kit is decoration: if its GLB fails to load the candidate must keep the
 * shared base head and the city must stay mounted. The loader cache remembers a
 * rejected URL, so recovery needs both a cache eviction (owned by
 * `CandidateHeadKit`, which knows the resolved URL) and a remount key. This
 * module owns only the deterministic part — counting failures and notifying
 * subscribers — so the retry policy is unit-testable without a WebGL context.
 *
 * Policy: the first failure triggers one automatic retry, a second failure falls
 * back to the base head for that path. Nothing retries forever, and a developer
 * can always ask for a fresh attempt from the development preview panel.
 */
export const MAX_HEAD_KIT_FAILURES = 2;

const failures = new Map<string, number>();
const listeners = new Set<() => void>();
let revision = 0;

function notify() {
  revision += 1;
  for (const listener of listeners) listener();
}

export function subscribeHeadKitRecovery(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Monotonic key: every successful retry request remounts the kit loader. */
export function headKitRecoveryRevision(): number {
  return revision;
}

export function headKitFailureCount(path: string): number {
  return failures.get(path) ?? 0;
}

/** Records a failure and returns the running count for this path. */
export function recordHeadKitFailure(path: string): number {
  const next = (failures.get(path) ?? 0) + 1;
  failures.set(path, next);
  return next;
}

/** Called after a successful load so a later failure gets its own retry budget. */
export function clearHeadKitFailure(path: string): void {
  failures.delete(path);
}

/**
 * Manual retry: forget the failure history and remount. The caller must evict
 * the rejected URL from the loader cache first; that is why the UI entry point
 * lives in `CandidateHeadKit` rather than here.
 */
export function requestHeadKitRetry(path: string): void {
  failures.delete(path);
  notify();
}

/** True when another automatic attempt is allowed. */
export function shouldRetryHeadKit(path: string): boolean {
  return headKitFailureCount(path) < MAX_HEAD_KIT_FAILURES;
}

/** Test helper. */
export function resetHeadKitRecovery(): void {
  failures.clear();
  notify();
}

export const useHeadKitRecovery = () =>
  useSyncExternalStore(
    subscribeHeadKitRecovery,
    headKitRecoveryRevision,
    headKitRecoveryRevision,
  );
