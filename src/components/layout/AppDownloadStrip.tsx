import { BUYER_APP_PLAY_STORE_URL } from '../../lib/appDownload';

/** Single-line web-only prompt: label + Google Play Store link. */
export function AppDownloadStrip() {
  return (
    <div className="border-y-2 border-amber-300 bg-[#FFFBEB]">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
        <p className="text-sm font-bold text-gray-900 sm:text-base">Download Android App</p>
        <a
          href={BUYER_APP_PLAY_STORE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-shrink-0 rounded-lg bg-amber-500 px-5 py-2 text-sm font-bold text-white shadow-sm transition-colors hover:bg-amber-600"
        >
          Download
        </a>
      </div>
    </div>
  );
}
