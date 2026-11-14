import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
  referenceId: string;
}

/**
 * Catches render crashes so the app does not become a blank dark page.
 * The user sees a calm 500 screen with a reference ID; the raw error goes to
 * the console, never to the interface.
 */
class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null, referenceId: '' };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      error,
      referenceId: `ERR-${Date.now().toString(36).toUpperCase()}`,
    };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('Unhandled render error', this.state.referenceId, error, info);
  }

  render() {
    const { error, referenceId } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="flex min-h-dvh items-center justify-center bg-surface p-6">
        <div
          role="alert"
          className="w-full max-w-lg rounded-xl border border-error bg-surface-container-lowest p-6 text-on-surface shadow-elevation-3"
        >
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-error-container text-error">
            <AlertTriangle className="h-6 w-6" aria-hidden />
          </span>
          <h1 className="mt-4 text-h2 font-bold">Something broke on our side</h1>
          <p className="mt-2 text-body text-on-surface-variant">
            This screen could not finish loading. Reloading usually clears it. If it keeps
            happening, contact your Coordinator or Administrator and quote the reference below.
          </p>
          <p className="mt-4 rounded-lg bg-surface-container px-3 py-2 font-mono text-caption text-on-surface-variant">
            Reference: {referenceId}
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-body font-semibold text-on-primary transition-colors hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
            >
              <RotateCcw className="h-4 w-4" aria-hidden />
              Reload page
            </button>
            <a
              href="/dashboard"
              className="inline-flex min-h-11 items-center justify-center rounded-lg bg-surface-container px-4 py-2 text-body font-semibold text-on-surface ring-1 ring-inset ring-outline-variant transition-colors hover:bg-surface-container-high focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
            >
              Go to dashboard
            </a>
          </div>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
