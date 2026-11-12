import { supabase } from './supabase';

export const SHIPPING_LABELS_BUCKET = 'shipping-labels';
export const SHIPPING_MANIFESTS_BUCKET = 'shipping-manifests';

/** Storage object name for an order's PDF (one label + one manifest per order). */
export function orderShippingDocPath(orderId: string): string {
  return `${String(orderId).trim()}.pdf`;
}

export async function uploadOrderShippingLabel(orderId: string, file: File) {
  const path = orderShippingDocPath(orderId);
  const { error: uploadError } = await supabase.storage
    .from(SHIPPING_LABELS_BUCKET)
    .upload(path, file, { upsert: true, contentType: 'application/pdf' });

  if (uploadError) {
    return { success: false as const, path: null, error: uploadError.message };
  }

  const { error: updateError } = await supabase
    .from('orders')
    .update({ admin_label_path: path, updated_at: new Date().toISOString() })
    .eq('id', orderId);

  if (updateError) {
    return { success: false as const, path: null, error: updateError.message };
  }

  return { success: true as const, path, error: null };
}

export async function uploadOrderShippingManifest(orderId: string, file: File) {
  const path = orderShippingDocPath(orderId);
  const { error: uploadError } = await supabase.storage
    .from(SHIPPING_MANIFESTS_BUCKET)
    .upload(path, file, { upsert: true, contentType: 'application/pdf' });

  if (uploadError) {
    return { success: false as const, path: null, error: uploadError.message };
  }

  const { error: updateError } = await supabase
    .from('orders')
    .update({ admin_manifest_path: path, updated_at: new Date().toISOString() })
    .eq('id', orderId);

  if (updateError) {
    return { success: false as const, path: null, error: updateError.message };
  }

  return { success: true as const, path, error: null };
}

export async function downloadShippingDocument(bucket: string, path: string) {
  return supabase.storage.from(bucket).download(path);
}

export function triggerPdfDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.open(url, '_blank');
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
