import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./App.css";

type ErrorBoundaryState = {
  errorMessage: string | null;
};

class ErrorBoundary extends React.Component<
  React.PropsWithChildren,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = {
    errorMessage: null,
  };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      errorMessage: error.message,
    };
  }

  componentDidCatch(error: Error) {
    console.error("Subnotify runtime error:", error);
  }

  render() {
    if (this.state.errorMessage) {
      return (
        <main className="crash-shell">
          <section className="crash-card">
            <p className="eyebrow">Runtime Error</p>
            <h1>画面でエラーが発生しました</h1>
            <p className="panel-text">
              起動直後に落ちても、この画面のメッセージが分かればすぐ直しやすいです。
            </p>
            <pre className="crash-message">{this.state.errorMessage}</pre>
          </section>
        </main>
      );
    }

    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);
