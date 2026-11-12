/**
 * Share a product link via Web Share API or clipboard fallback.
 *
 * We intentionally share the URL only (not a raw image file). Attaching large PNG
 * blobs makes Windows show a generic document icon instead of a product preview;
 * messaging apps fetch og:image from /share/ URLs for rich link previews.
 */
export type ShareProductResult = 'shared' | 'copied' | 'cancelled';

export interface ShareProductOptions {
  title: string;
  text?: string;
  shareUrl: string;
}

export async function shareProduct(options: ShareProductOptions): Promise<ShareProductResult> {
  const { title, text = '', shareUrl } = options;
  const message = text.trim() ? `${text.trim()}\n\n${shareUrl}` : shareUrl;

  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      await navigator.share({ title, text: message, url: shareUrl });
      return 'shared';
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return 'cancelled';
      // fall through to clipboard
    }
  }

  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(message);
    return 'copied';
  }

  throw new Error('Share is not supported on this device');
}
