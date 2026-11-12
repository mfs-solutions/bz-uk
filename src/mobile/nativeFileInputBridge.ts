import {
  Camera,
  CameraResultType,
  CameraSource,
  type PermissionStatus,
  type Photo,
} from '@capacitor/camera';
import { isNativePlatform } from './nativePlatform';

declare global {
  interface Window {
    __bzeadNativeImageBridgeInstalled?: boolean;
  }
}

function isLikelyImageInput(input: HTMLInputElement): boolean {
  const accept = (input.accept || '').toLowerCase();
  if (!accept) return false;

  if (accept.includes('video') || accept.includes('pdf') || accept.includes('doc')) {
    return false;
  }

  return accept.includes('image');
}

function isPermissionGranted(status: PermissionStatus): boolean {
  const cameraGranted = status.camera === 'granted' || status.camera === 'limited';
  const photosGranted = status.photos === 'granted' || status.photos === 'limited';
  return cameraGranted && photosGranted;
}

async function ensureCameraPermissions(): Promise<boolean> {
  const existing = await Camera.checkPermissions();
  if (isPermissionGranted(existing)) return true;

  const requested = await Camera.requestPermissions({ permissions: ['camera', 'photos'] });
  return isPermissionGranted(requested);
}

function normalizeImageExtension(format?: string): string {
  const cleaned = String(format || '').toLowerCase();
  if (cleaned === 'jpg') return 'jpeg';
  if (cleaned === 'heic' || cleaned === 'heif') return 'jpeg';
  if (cleaned === 'png' || cleaned === 'jpeg' || cleaned === 'webp' || cleaned === 'gif') return cleaned;
  return 'jpeg';
}

async function photoToFile(photo: Photo): Promise<File | null> {
  if (!photo.webPath) return null;

  const response = await fetch(photo.webPath);
  const blob = await response.blob();
  const extension = normalizeImageExtension(photo.format);
  const mimeType = blob.type || `image/${extension}`;

  return new File([blob], `bzead-${Date.now()}.${extension}`, {
    type: mimeType,
    lastModified: Date.now(),
  });
}

function isCancelledCameraError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return message.includes('cancel') || message.includes('user cancelled');
}

async function getImageFromNativePrompt(): Promise<File | null> {
  const permitted = await ensureCameraPermissions();
  if (!permitted) return null;

  const photo = await Camera.getPhoto({
    quality: 90,
    allowEditing: false,
    resultType: CameraResultType.Uri,
    source: CameraSource.Prompt,
    correctOrientation: true,
    saveToGallery: false,
  });

  return photoToFile(photo);
}

function resolveLabelTargetInput(label: HTMLLabelElement): HTMLInputElement | null {
  const nestedInput = label.querySelector('input[type="file"]');
  if (nestedInput instanceof HTMLInputElement) {
    return nestedInput;
  }

  const targetId = (label.htmlFor || '').trim();
  if (!targetId) return null;

  const target = document.getElementById(targetId);
  if (target instanceof HTMLInputElement && target.type === 'file') {
    return target;
  }

  return null;
}

function toImageInput(eventTarget: EventTarget | null): HTMLInputElement | null {
  if (!(eventTarget instanceof Element)) return null;

  if (eventTarget instanceof HTMLInputElement && eventTarget.type === 'file') {
    return eventTarget;
  }

  if (eventTarget instanceof HTMLLabelElement) {
    return resolveLabelTargetInput(eventTarget);
  }

  const closestLabel = eventTarget.closest('label');
  if (closestLabel instanceof HTMLLabelElement) {
    const labelInput = resolveLabelTargetInput(closestLabel);
    if (labelInput) return labelInput;
  }

  const closestInput = eventTarget.closest('input[type="file"]');
  return closestInput instanceof HTMLInputElement ? closestInput : null;
}

export function initializeNativeImageInputBridge() {
  if (!isNativePlatform || typeof document === 'undefined') return;
  if (window.__bzeadNativeImageBridgeInstalled) return;

  window.__bzeadNativeImageBridgeInstalled = true;

  const handleClickCapture = (event: Event) => {
    const input = toImageInput(event.target);
    if (!input || input.disabled || !isLikelyImageInput(input)) return;

    event.preventDefault();
    event.stopPropagation();

    void (async () => {
      try {
        const file = await getImageFromNativePrompt();
        if (!file) return;

        const transfer = new DataTransfer();
        transfer.items.add(file);
        input.files = transfer.files;
        input.dispatchEvent(new Event('change', { bubbles: true }));
      } catch (error) {
        if (!isCancelledCameraError(error)) {
          console.error('[native-image-input] Failed to pick image', error);
        }
      }
    })();
  };

  document.addEventListener('click', handleClickCapture, true);
}

export async function pickNativeImage(source: 'camera' | 'photos' | 'prompt' = 'prompt'): Promise<File | null> {
  if (!isNativePlatform) return null;

  const permitted = await ensureCameraPermissions();
  if (!permitted) return null;

  try {
    const mappedSource =
      source === 'camera'
        ? CameraSource.Camera
        : source === 'photos'
        ? CameraSource.Photos
        : CameraSource.Prompt;

    const photo = await Camera.getPhoto({
      quality: 90,
      allowEditing: false,
      resultType: CameraResultType.Uri,
      source: mappedSource,
      correctOrientation: true,
      saveToGallery: false,
    });

    return photoToFile(photo);
  } catch (error) {
    if (!isCancelledCameraError(error)) {
      console.error('[native-image-input] Failed to pick image', error);
    }
    return null;
  }
}
