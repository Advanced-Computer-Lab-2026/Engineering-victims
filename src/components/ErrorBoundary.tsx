import React from 'react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Without this, any render crash unmounts the whole tree and leaves the dark
 * body background — a "black page" with no hint of what happened. Crashes now
 * land here instead, with the message and a way back.
 */
class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 p-6">
        <div className="w-full max-w-lg rounded-2xl border border-rose-800/60 bg-rose-950/40 p-6 text-rose-200">
          <h1 className="text-lg font-bold">Something went wrong</h1>
          <p className="mt-2 text-sm text-rose-200/80">
            This screen hit an unexpected error. Reloading usually clears it — if it keeps
            happening, the message below says where.
          </p>
          <pre className="mt-3 max-h-40 overflow-auto whitespace-pre-wrap rounded-lg bg-black/40 p-3 text-xs text-rose-300">
            {error.message}
          </pre>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-4 rounded-lg bg-rose-500/20 px-4 py-2 text-sm font-semibold text-rose-100 transition-colors hover:bg-rose-500/30"
          >
            Reload page
          </button>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
