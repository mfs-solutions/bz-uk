import { useState, useSyncExternalStore } from 'react';

// ── External store for navigator.onLine ──────────────────────────────
function subscribe(callback: () => void) {
  window.addEventListener('online', callback);
  window.addEventListener('offline', callback);
  return () => {
    window.removeEventListener('online', callback);
    window.removeEventListener('offline', callback);
  };
}
function getSnapshot() {
  return navigator.onLine;
}

export function useOnlineStatus() {
  return useSyncExternalStore(subscribe, getSnapshot, () => true);
}

// ── Offline fallback screen ──────────────────────────────────────────
export const OfflineScreen: React.FC = () => {
  const [retrying, setRetrying] = useState(false);

  const handleRetry = () => {
    setRetrying(true);
    // Small delay so user sees the spinner
    setTimeout(() => {
      window.location.reload();
    }, 500);
  };

  return (
    <div className="min-h-screen bg-[#1e293b] flex items-center justify-center p-4">
      <div className="max-w-sm w-full text-center">
        {/* Offline icon */}
        <svg
          className="mx-auto h-20 w-20 text-amber-400 mb-6"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M18.364 5.636a9 9 0 010 12.728M5.636 5.636a9 9 0 000 12.728M15.536 8.464a5 5 0 010 7.072M8.464 8.464a5 5 0 000 7.072"
          />
          {/* Diagonal strike-through line */}
          <line x1="4" y1="4" x2="20" y2="20" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
        </svg>

        <h1 className="text-2xl font-bold text-white mb-3">
          No Internet Connection
        </h1>
        <p className="text-gray-400 mb-8 text-sm">
          Please check your network settings and try again.
        </p>

        <button
          onClick={handleRetry}
          disabled={retrying}
          className="w-full bg-amber-400 text-black font-semibold py-3 px-6 rounded-lg hover:bg-amber-300 transition-colors disabled:opacity-60"
        >
          {retrying ? 'Retrying…' : 'Retry'}
        </button>
      </div>
    </div>
  );
};
