import { Component, Fragment, type ReactNode } from 'react';

type Props = { children: ReactNode; title: string; body: string };
type State = { error: Error | null; attempt: number };

/**
 * Without this, one screen that fails to render leaves a blank page, and a reload shows the same
 * blank page for as long as the state that broke it lasts. Instead it says so, offers a reload, and
 * tries the screen again every few seconds, so a fix from the console brings the phone back by itself.
 */
export class Recover extends Component<Props, State> {
  state: State = { error: null, attempt: 0 };
  private timer: number | undefined;

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error): void {
    console.error('[section30] a screen failed to render', error);
    window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => this.setState((s) => ({ error: null, attempt: s.attempt + 1 })), 4000);
  }

  componentWillUnmount(): void {
    window.clearTimeout(this.timer);
  }

  render() {
    if (!this.state.error) return <Fragment key={this.state.attempt}>{this.props.children}</Fragment>;
    return (
      <div className="shell">
        <section className="frame danger" role="alert">
          <h1>{this.props.title}</h1>
          <p>{this.props.body}</p>
          <button className="btn primary block" onClick={() => window.location.reload()}>
            Reload
          </button>
        </section>
      </div>
    );
  }
}
