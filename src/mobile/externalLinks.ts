// External link / file helpers for Capacitor Android (and web fallback).
//
// In the Capacitor WebView, `window.open(url, '_blank')` and anchors with
// `target="_blank"` are silently blocked — they neither open the system
// browser nor an in-app tab. We must call the Capacitor Browser plugin
// explicitly on native, and fall back to `window.open` on the web build.
import logger from '../utils/logger';
import { isNativePlatform } from './nativePlatform';

/**
 * Open an external URL.
 * - Native (Android/iOS): opens an in-app Chrome Custom Tab / SFSafariViewController.
 * - Web: opens a new tab with `noopener,noreferrer`.
 */
export async function openExternalUrl(url: string): Promise<void> {
  if (!url) return;

  if (!isNativePlatform) {
    window.open(url, '_blank', 'noopener,noreferrer');
    return;
  }

  try {
    const { Browser } = await import('@capacitor/browser');
    await Browser.open({ url, presentationStyle: 'popover' });
  } catch (error) {
    logger.error('Capacitor Browser.open failed, falling back to location.href', { error, url });
    // Last-resort fallback inside the WebView so the user still gets *somewhere*.
    window.location.href = url;
  }
}

/**
 * Click handler factory for `<a>` tags that previously used `target="_blank"`.
 * Use as: `onClick={openExternalLinkHandler('https://...')}` and remove `target`/`rel`.
 */
export function openExternalLinkHandler(url: string) {
  return (event: React.MouseEvent) => {
    event.preventDefault();
    void openExternalUrl(url);
  };
}

/**
 * Save a generated file (e.g. PDF) to the device.
 * - Native: writes to the Documents directory and offers a Share sheet so the
 *   user can save to Downloads / send via email / open in another app.
 * - Web: triggers a normal browser download via a blob URL + `<a download>`.
 *
 * @param fileName  Base file name, e.g. `INV-1234.pdf`
 * @param data      File contents as a `Blob` (web) or `Uint8Array`/base64 (native)
 */
export async function saveAndShareFile(
  fileName: string,
  data: Blob | Uint8Array | ArrayBuffer,
  mimeType = 'application/pdf',
): Promise<void> {
  if (!isNativePlatform) {
    let blob: Blob;
    if (data instanceof Blob) {
      blob = data;
    } else if (data instanceof ArrayBuffer) {
      blob = new Blob([data], { type: mimeType });
    } else {
      // Uint8Array — copy underlying bytes into a fresh ArrayBuffer to satisfy
      // BlobPart typing (avoids ArrayBufferLike/SharedArrayBuffer mismatch).
      const copy = new Uint8Array(data.byteLength);
      copy.set(data);
      blob = new Blob([copy.buffer], { type: mimeType });
    }
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 5_000);
    return;
  }

  // Native — write to Documents and present the system share sheet.
  try {
    const [{ Filesystem, Directory, Encoding }, { Share }] = await Promise.all([
      import('@capacitor/filesystem'),
      import('@capacitor/share'),
    ]);

    // Convert to base64 (Filesystem.writeFile expects string for binary data).
    const base64 = await toBase64(data);

    const { uri } = await Filesystem.writeFile({
      path: fileName,
      data: base64,
      directory: Directory.Documents,
      // `Encoding.UTF8` would corrupt binary; omit encoding for base64 binary write.
    });

    try {
      await Share.share({
        title: fileName,
        url: uri,
        dialogTitle: 'Save or share file',
      });
    } catch {
      // User cancelled the share sheet — file is still saved on disk.
    }

    // Suppress unused-import warning when Encoding is not used at runtime.
    void Encoding;
  } catch (error) {
    logger.error('saveAndShareFile failed on native', { error, fileName });
    throw error;
  }
}

async function toBase64(data: Blob | Uint8Array | ArrayBuffer): Promise<string> {
  if (data instanceof Blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = String(reader.result || '');
        // strip data URL prefix "data:...;base64,"
        const idx = result.indexOf(',');
        resolve(idx >= 0 ? result.slice(idx + 1) : result);
      };
      reader.onerror = reject;
      reader.readAsDataURL(data);
    });
  }
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}
