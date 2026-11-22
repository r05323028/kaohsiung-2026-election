import { Component, type ReactNode } from 'react';

type Props = { children: ReactNode };
type State = { failed: boolean };

/**
 * A head kit is optional decoration: if its GLB fails to load, the candidate
 * must keep the shared base head instead of losing the whole scene. Letting the
 * rejection reach the scene-wide boundary would latch that boundary and unmount
 * the city for the rest of the session, so it is caught here and rendered as
 * nothing. The rejected URL stays in the loader cache, so recovery from a
 * transient failure needs a reload; key this boundary by kit path so switching
 * candidates starts clean.
 */
export default class HeadKitBoundary extends Component<Props, State> {
  override state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  override render() {
    return this.state.failed ? null : this.props.children;
  }
}
