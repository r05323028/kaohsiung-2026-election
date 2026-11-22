import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearHeadKitFailure,
  headKitFailureCount,
  headKitRecoveryRevision,
  MAX_HEAD_KIT_FAILURES,
  recordHeadKitFailure,
  requestHeadKitRetry,
  resetHeadKitRecovery,
  shouldRetryHeadKit,
  subscribeHeadKitRecovery,
} from './head-kit-recovery';

const PATH = '/assets/avatars/likeness/lai-rui-long-2026-head.glb';

beforeEach(() => {
  resetHeadKitRecovery();
});

describe('head kit recovery policy', () => {
  it('allows exactly one automatic retry after the first failure', () => {
    expect(shouldRetryHeadKit(PATH)).toBe(true);
    expect(recordHeadKitFailure(PATH)).toBe(1);
    expect(shouldRetryHeadKit(PATH)).toBe(true);
    expect(recordHeadKitFailure(PATH)).toBe(2);
    expect(shouldRetryHeadKit(PATH)).toBe(false);
    expect(MAX_HEAD_KIT_FAILURES).toBe(2);
  });

  it('keeps counters independent per kit path', () => {
    recordHeadKitFailure(PATH);
    recordHeadKitFailure(PATH);
    expect(shouldRetryHeadKit(PATH)).toBe(false);
    expect(shouldRetryHeadKit('/assets/avatars/likeness/other-head.glb')).toBe(
      true,
    );
  });

  it('gives a successfully loaded kit a fresh retry budget', () => {
    recordHeadKitFailure(PATH);
    recordHeadKitFailure(PATH);
    clearHeadKitFailure(PATH);
    expect(headKitFailureCount(PATH)).toBe(0);
    expect(shouldRetryHeadKit(PATH)).toBe(true);
  });

  it('does not notify subscribers on a silent clear', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeHeadKitRecovery(listener);

    recordHeadKitFailure(PATH);
    expect(listener).not.toHaveBeenCalled();

    clearHeadKitFailure(PATH);
    expect(listener).not.toHaveBeenCalled();

    unsubscribe();
  });

  it('bumps the revision and notifies on a manual retry', () => {
    recordHeadKitFailure(PATH);
    recordHeadKitFailure(PATH);
    const listener = vi.fn();
    const unsubscribe = subscribeHeadKitRecovery(listener);
    const before = headKitRecoveryRevision();

    requestHeadKitRetry(PATH);

    expect(headKitFailureCount(PATH)).toBe(0);
    expect(headKitRecoveryRevision()).toBeGreaterThan(before);
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    requestHeadKitRetry(PATH);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
