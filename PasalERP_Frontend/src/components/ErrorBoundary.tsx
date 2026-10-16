import React from 'react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  message?: string;
}

/** Prevents a single render-time failure from leaving the whole SPA blank. */
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, message: error.message };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
      console.error('[AGS] Render error:', error, errorInfo);
    }
  }

  private handleReload = () => {
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <main className="min-h-screen bg-slate-100 flex items-center justify-center p-6">
        <section className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <h1 className="text-xl font-bold text-slate-900">Something went wrong</h1>
          <p className="mt-2 text-sm text-slate-600">
            The ERP could not render this screen safely. Your saved browser data has not been cleared.
          </p>
          {typeof window !== 'undefined' && window.location.hostname === 'localhost' && this.state.message && (
            <pre className="mt-4 max-h-32 overflow-auto rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
              {this.state.message}
            </pre>
          )}
          <button
            type="button"
            onClick={this.handleReload}
            className="mt-6 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
          >
            Reload ERP
          </button>
        </section>
      </main>
    );
  }
}
