import { Component, type ErrorInfo, type ReactNode } from 'react';

type Props = {
  children: ReactNode;
  /** Called once per caught error; the parent decides whether to remount. */
  onError?: (error: unknown, info: ErrorInfo) => void;
};
type State = { failed: boolean };

/**
 * A head kit is optional decoration: if its GLB fails to load, the candidate
 * must keep the shared base head instead of losing the whole scene. Letting the
 * rejection reach the scene-wide boundary would latch that boundary and unmount
 * the city for the rest of the session, so it is caught here and rendered as
 * nothing.
 *
 * Recovery is the parent's job: it can clear the rejected loader cache entry and
 * remount this boundary with a new key. Key the boundary by kit path and retry
 * revision so switching candidates always starts clean.
 */
export default class HeadKitBoundary extends Component<Props, State> {
  override state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  override componentDidCatch(error: unknown, info: ErrorInfo) {
    this.props.onError?.(error, info);
  }

  override render() {
    return this.state.failed ? null : this.props.children;
  }
}
