import React from "react";
import FailureSurface from "../errors/FailureSurface";
import { createFailureModel, type FailureModel, type RetryMode } from "../errors/failureModel";

interface ErrorBoundaryProps {
  children?: React.ReactNode;
  route?: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: unknown;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, error: null };

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return { hasError: true, error };
  }

  private retry = (mode: RetryMode) => {
    if (mode === "reload" && typeof window !== "undefined") {
      window.location.reload();
      return;
    }
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      const failure: FailureModel = createFailureModel({
        error: this.state.error,
        route: this.props.route,
        source: "component",
        phase: "render",
      });
      return <FailureSurface failure={failure} onRetry={() => this.retry(failure.retryMode)} />;
    }
    return this.props.children;
  }
}
