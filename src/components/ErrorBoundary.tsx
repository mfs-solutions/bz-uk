import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/** Detect chunk-load / dynamic-import failures (new deploy invalidated old chunks). */
function isChunkLoadError(error: Error): boolean {
  const msg = (error.message || '').toLowerCase();
  return (
    msg.includes('loading chunk') ||
    msg.includes('loading css chunk') ||
    msg.includes('dynamically imported module') ||
    msg.includes('failed to fetch') ||
    msg.includes('importing a module script failed') ||
    error.name === 'ChunkLoadError'
  );
}

/**
 * Error Boundary Component
 * Catches JavaScript errors anywhere in the child component tree,
 * logs those errors, and displays a fallback UI
 */
class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Chunk load errors → auto-reload the page once so the browser fetches fresh chunks
    if (isChunkLoadError(error)) {
      const reloadKey = 'bzead_chunk_reload';
      const lastReload = sessionStorage.getItem(reloadKey);
      // Only auto-reload once per session to prevent infinite loops
      if (!lastReload) {
        sessionStorage.setItem(reloadKey, Date.now().toString());
        window.location.reload();
        return;
      }
    }

    // Log error — console.error is NOT stripped in production
    console.error('[BZEAD] React crash caught by ErrorBoundary:', error);
    console.error('[BZEAD] Component stack:', errorInfo.componentStack);
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleGoHome = () => {
    this.setState({ hasError: false, error: null });
    window.location.href = '/';
  };

  public render() {
    if (this.state.hasError) {
      // Custom fallback UI
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Default fallback UI
      return (
        <div className="min-h-screen bg-[#1e293b] flex items-center justify-center p-4">
          <div className="max-w-sm w-full text-center">
            <svg
              className="mx-auto h-20 w-20 text-red-400 mb-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
            <h1 className="text-2xl font-bold text-white mb-3">
              Something went wrong
            </h1>
            <p className="text-gray-400 mb-8 text-sm">
              An unexpected error occurred. Please try reloading the app.
            </p>
            <div className="flex flex-col gap-3">
              <button
                onClick={this.handleReload}
                className="w-full bg-amber-400 text-black font-semibold py-3 px-6 rounded-lg hover:bg-amber-300 transition-colors"
              >
                Reload App
              </button>
              <button
                onClick={this.handleGoHome}
                className="w-full bg-transparent text-gray-400 font-medium py-2 px-6 rounded-lg hover:text-white transition-colors"
              >
                Go to Home
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
