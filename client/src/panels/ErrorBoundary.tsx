import React from "react";

/**
 * Catch render-phase errors so a crash in one panel doesn't blow the editor.
 * React error boundaries still require a class component.
 */
type Props = { label?: string; children: React.ReactNode };
type State = { error: Error | null };

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error("panel error", this.props.label, error, info);
  }

  reset = () => this.setState({ error: null });

  render() {
    if (this.state.error) {
      return (
        <div className="panel panel--error">
          <div className="panel__head">
            <h2>panel crashed</h2>
            <div className="panel__toolbar">
              <button onClick={this.reset}>retry</button>
            </div>
          </div>
          <pre className="panel__error">{this.state.error.message}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}
