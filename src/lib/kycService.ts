/**
 * KYC Service — Supabase backend for seller KYC verification
 *
 * Handles:
 *  - Submitting / updating KYC form data to `seller_kyc` table
 *  - Uploading documents to `kyc-documents` storage bucket
 *  - Fetching existing KYC status
 *  - Fetching KYC requirements by country (from `countries` table)
 */

import { supabase } from './supabase';
import { logger } from '../utils/logger';
import { notifyAccountEvent, notifyAdminsOfEvent } from './notificationService';
import type { SellerKYC } from '../types';

// ─── Types ───────────────────────────────────────────────────────

export interface KYCSubmitResult {
  success: boolean;
  error: string | null;
  kycId?: string;
}

export interface KYCDocumentUploadResult {
  success: boolean;
  url: string | null;
  error: string | null;
}

export interface KYCRequirement {
  id: string;
  label: string;
  documentType: string;
  required: boolean;
}

// ─── File Upload ─────────────────────────────────────────────────

/** Allowed MIME types for KYC document uploads */
const ALLOWED_KYC_MIME_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

const MAX_KYC_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

/**
 * Upload a single file to the `kyc-documents` storage bucket.
 * Path: `<sellerId>/<docType>_<timestamp>.<ext>`
 *
 * Includes:
 *  - Pre-upload auth-session refresh (prevents stale-token aborts)
 *  - File validation (size + MIME type)
 *  - Automatic retry (up to 2 retries with back-off)
 */
export async function uploadKYCDocument(
  sellerId: string,
  file: File,
  docType: string
): Promise<KYCDocumentUploadResult> {
  try {
    // ── 1. Validate inputs ──────────────────────────────────────
    if (!sellerId) {
      return { success: false, url: null, error: 'Seller ID is missing — please log in again.' };
    }

    if (!file || file.size === 0) {
      return { success: false, url: null, error: 'No file selected or file is empty.' };
    }

    if (file.size > MAX_KYC_FILE_SIZE) {
      return {
        success: false,
        url: null,
        error: `File size (${(file.size / 1024 / 1024).toFixed(1)} MB) exceeds the 10 MB limit.`,
      };
    }

    const mimeType = file.type || 'application/octet-stream';
    if (!ALLOWED_KYC_MIME_TYPES.includes(mimeType)) {
      return {
        success: false,
        url: null,
        error: `File type "${mimeType}" is not supported. Please upload JPEG, PNG, PDF, or DOC/DOCX.`,
      };
    }

    // ── 2. Get the current access token ─────────────────────────
    // Use getSession() to grab the JWT. If the session is dead, fail fast.
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData?.session?.access_token;
    if (!accessToken) {
      return { success: false, url: null, error: 'Your session has expired — please log in again.' };
    }

    // ── 3. Build file path ──────────────────────────────────────
    const ext = file.name.split('.').pop() || 'pdf';
    const filePath = `${sellerId}/${docType}_${Date.now()}.${ext}`;

    // ── 4. Upload via direct fetch (bypasses Supabase SDK abort signals) ──
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
    const uploadUrl = `${supabaseUrl}/storage/v1/object/kyc-documents/${filePath}`;

    const MAX_RETRIES = 2;
    let lastError = '';

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      if (attempt > 0) {
        await new Promise((r) => setTimeout(r, attempt * 1000));
      }

      try {
        const res = await fetch(uploadUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'apikey': anonKey,
            'Content-Type': mimeType,
            'Cache-Control': '3600',
            'x-upsert': 'true',
          },
          body: file,
        });

        if (res.ok) {
          // Success — return the relative path within the bucket
          // (private bucket: consumers must use getKYCDocumentSignedUrl() to view)
          return { success: true, url: filePath, error: null };
        }

        const errBody = await res.json().catch(() => ({ message: res.statusText }));
        lastError = errBody.message || errBody.error || `Upload failed (HTTP ${res.status})`;
      } catch (fetchErr) {
        lastError = (fetchErr as Error).message || 'Network error during upload';
      }

      logger.error(new Error(lastError), {
        context: `KYC doc upload failed (attempt ${attempt + 1}): ${docType}`,
      });
    }

    return { success: false, url: null, error: lastError };
  } catch (err) {
    logger.error(err as Error, { context: 'uploadKYCDocument' });
    return { success: false, url: null, error: (err as Error).message };
  }
}

// ─── Submit Complete KYC ─────────────────────────────────────────

/**
 * Upload all attached files, then upsert the KYC record in Supabase.
 */
export async function submitCompleteKYC(
  kycData: SellerKYC,
  sellerId: string
): Promise<KYCSubmitResult> {
  try {
    // Ensure sellerId falls back to auth.uid() if not provided
    let resolvedSellerId = sellerId;
    if (!resolvedSellerId) {
      const { data: { user } } = await supabase.auth.getUser();
      resolvedSellerId = user?.id || '';
      if (!resolvedSellerId) {
        return { success: false, error: 'Not authenticated — please log in again.' };
      }
    }

    // 1. Upload documents if present
    let idDocUrl = kycData.id_document_url || '';
    let addressProofUrl = kycData.address_proof_url || '';
    let bankStatementUrl = kycData.bank_statement_url || '';

    if (kycData.id_document_file) {
      const res = await uploadKYCDocument(resolvedSellerId, kycData.id_document_file, 'id_document');
      if (!res.success) return { success: false, error: `ID document upload failed: ${res.error}` };
      idDocUrl = res.url || '';
    }

    if (kycData.address_proof_file) {
      const res = await uploadKYCDocument(resolvedSellerId, kycData.address_proof_file, 'address_proof');
      if (!res.success) return { success: false, error: `Address proof upload failed: ${res.error}` };
      addressProofUrl = res.url || '';
    }

    if (kycData.bank_statement_file) {
      const res = await uploadKYCDocument(resolvedSellerId, kycData.bank_statement_file, 'bank_statement');
      if (!res.success) return { success: false, error: `Bank statement upload failed: ${res.error}` };
      bankStatementUrl = res.url || '';
    }

    // 2. Prepare the row (strip File objects, they don't go into the DB)
    // Flatten business_address object into individual DB columns
    const addr = kycData.business_address || {} as Record<string, string>;
    const row = {
      seller_id: resolvedSellerId,
      email: kycData.email,
      phone: kycData.phone,
      full_name: kycData.full_name,
      country: kycData.country,
      pan: kycData.pan,
      gstin: kycData.gstin || null,
      id_type: kycData.id_type,
      id_number: kycData.id_number,
      id_document_url: idDocUrl,
      business_street_address_1: (addr as any).street_address_1 || (addr as any).streetAddress1 || '',
      business_street_address_2: (addr as any).street_address_2 || (addr as any).streetAddress2 || '',
      business_city: (addr as any).city || '',
      business_state: (addr as any).state || '',
      business_postal_code: (addr as any).postal_code || (addr as any).postalCode || '',
      business_country: (addr as any).country || kycData.country || '',
      address_proof_url: addressProofUrl,
      bank_holder_name: kycData.bank_holder_name,
      account_number: kycData.account_number,
      account_type: kycData.account_type,
      ifsc_code: kycData.ifsc_code,
      bank_statement_url: bankStatementUrl,
      pep_declaration: kycData.pep_declaration,
      sanctions_check: kycData.sanctions_check,
      aml_compliance: kycData.aml_compliance,
      tax_compliance: kycData.tax_compliance,
      terms_accepted: kycData.terms_accepted,
      kyc_status: 'pending' as const,
      kyc_tier: kycData.kyc_tier,
      submitted_at: new Date().toISOString(),
    };

    // 3. Upsert — if a row already exists for this seller, update it
    const { data, error } = await supabase
      .from('seller_kyc')
      .upsert(row, { onConflict: 'seller_id' })
      .select('id')
      .single();

    if (error) {
      logger.error(error as unknown as Error, { context: 'submitCompleteKYC upsert' });
      return { success: false, error: error.message };
    }

    return { success: true, error: null, kycId: data?.id };
  } catch (err) {
    logger.error(err as Error, { context: 'submitCompleteKYC' });
    return { success: false, error: (err as Error).message };
  }
}

// ─── Upload Verification Documents (Bulk) ────────────────────────

export interface BulkUploadItem {
  id: string;
  label: string;
  file: File;
}

export interface BulkUploadProgress {
  id: string;
  progress: number;
  status: 'uploading' | 'completed' | 'failed';
  url?: string;
  error?: string;
}

/**
 * Upload a single verification document and return the public URL.
 * Called from SellerVerifyUploads for each document slot.
 */
export async function uploadVerificationDocument(
  sellerId: string,
  docId: string,
  file: File,
  onProgress?: (progress: number) => void
): Promise<KYCDocumentUploadResult> {
  try {
    // Simulate a small progress tick (Supabase JS SDK doesn't expose upload progress)
    onProgress?.(10);

    const ALLOWED_KYC_TYPES = new Set([
      'image/jpeg', 'image/png', 'image/webp',
      'application/pdf',
    ]);
    const MAX_KYC_SIZE = 10 * 1024 * 1024; // 10 MB

    if (!ALLOWED_KYC_TYPES.has(file.type)) {
      return { success: false, url: null, error: 'Invalid file type. Allowed: JPEG, PNG, WebP, PDF' };
    }
    if (file.size > MAX_KYC_SIZE) {
      return { success: false, url: null, error: `File too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Max: 10MB` };
    }

    const ext = file.name.split('.').pop() || 'pdf';
    const filePath = `${sellerId}/verify_${docId}_${Date.now()}.${ext}`;

    onProgress?.(30);

    const { error: uploadError } = await supabase.storage
      .from('kyc-documents')
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: true,
      });

    if (uploadError) {
      logger.error(uploadError as unknown as Error, { context: `Verify doc upload: ${docId}` });
      return { success: false, url: null, error: uploadError.message };
    }

    onProgress?.(80);

    // Private bucket — return the relative path within the bucket.
    // Consumers must use getKYCDocumentSignedUrl() to generate a viewable URL.
    onProgress?.(100);

    return {
      success: true,
      url: filePath,
      error: null,
    };
  } catch (err) {
    logger.error(err as Error, { context: `uploadVerificationDocument ${docId}` });
    return { success: false, url: null, error: (err as Error).message };
  }
}

/**
 * After all verification docs are uploaded, update the KYC record
 * with the document URLs and mark submitted.
 */
export async function finalizeVerificationSubmission(
  sellerId: string,
  documentUrls: Record<string, string>
): Promise<KYCSubmitResult> {
  try {
    // Map uploaded doc IDs to the correct DB columns
    const urlMapping: Record<string, string> = {};
    if (documentUrls['tax-id']) urlMapping.id_document_url = documentUrls['tax-id'];
    if (documentUrls['addr-f'] || documentUrls['addr-b']) {
      urlMapping.address_proof_url = documentUrls['addr-f'] || documentUrls['addr-b'];
    }
    if (documentUrls['bank-stmt']) urlMapping.bank_statement_url = documentUrls['bank-stmt'];

    // Store all document URLs together in a JSONB-friendly object
    const verificationDocs = { ...documentUrls };

    // Check if KYC record exists; if not, create a minimal one
    const { data: existing } = await supabase
      .from('seller_kyc')
      .select('id, business_address')
      .eq('seller_id', sellerId)
      .single();

    if (existing) {
      // Merge verification doc URLs into business_address JSONB
      const currentAddress = (existing.business_address as Record<string, unknown>) || {};
      const updatedAddress = { ...currentAddress, verification_documents: verificationDocs };

      const { error } = await supabase
        .from('seller_kyc')
        .update({
          kyc_status: 'pending',
          submitted_at: new Date().toISOString(),
          business_address: updatedAddress,
          ...urlMapping,
        })
        .eq('seller_id', sellerId);

      if (error) {
        return { success: false, error: error.message };
      }
    } else {
      // Create a new record with document URLs
      // Fetch seller email from profiles to avoid storing empty string
      const { data: profile } = await supabase
        .from('profiles')
        .select('email')
        .eq('id', sellerId)
        .maybeSingle();

      const { error } = await supabase
        .from('seller_kyc')
        .insert({
          seller_id: sellerId,
          email: profile?.email || '',
          kyc_status: 'pending',
          submitted_at: new Date().toISOString(),
          business_address: { verification_documents: verificationDocs },
          ...urlMapping,
        });

      if (error) {
        return { success: false, error: error.message };
      }
    }

    // Also update profile verification status
    await supabase
      .from('profiles')
      .update({ is_verified: false }) // Will become true after admin approval
      .eq('id', sellerId);

    // Alert admins that a new KYC submission needs review (in-app + push + email)
    const { data: sellerProfile } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', sellerId)
      .maybeSingle();
    const sellerName = sellerProfile?.full_name || 'A seller';
    notifyAdminsOfEvent({
      type: 'identity_pending',
      title: 'New KYC Submission',
      message: `${sellerName} submitted KYC documents and is awaiting review.`,
      metadata: { seller_id: sellerId },
      email: {
        eventType: 'identity_pending',
        data: { order_id: sellerId, entity_name: sellerName },
      },
    }).catch((err) => logger.error(err as Error, { context: 'finalizeVerificationSubmission notify' }));

    return { success: true, error: null };
  } catch (err) {
    logger.error(err as Error, { context: 'finalizeVerificationSubmission' });
    return { success: false, error: (err as Error).message };
  }
}

// ─── Signed URL for Private Bucket ───────────────────────────────

/**
 * Generate a signed (time-limited) URL for a document in the private
 * `kyc-documents` storage bucket. The URL is valid for `expiresIn` seconds
 * (default 5 minutes). Returns `null` on error.
 *
 * @param storagePath  Relative path within the bucket, e.g. `sellerId/id_front_1234.pdf`
 *                     If the value is prefixed with `kyc-documents/`, the prefix is stripped.
 * @param expiresIn    Seconds until the URL expires (default 300 = 5 min)
 */
export async function getKYCDocumentSignedUrl(
  storagePath: string,
  expiresIn = 300
): Promise<string | null> {
  if (!storagePath) return null;

  // Strip legacy `kyc-documents/` prefix if present
  const cleanPath = storagePath.replace(/^kyc-documents\//, '');

  const { data, error } = await supabase.storage
    .from('kyc-documents')
    .createSignedUrl(cleanPath, expiresIn);

  if (error) {
    logger.error(error as unknown as Error, { context: `getKYCDocumentSignedUrl: ${cleanPath}` });
    return null;
  }

  return data?.signedUrl ?? null;
}

/** Normalize a storage path from seller_kyc columns / JSONB. */
export function normalizeKYCStoragePath(storagePath: string): string {
  return storagePath.replace(/^kyc-documents\//, '').trim();
}

export type KYCDocumentRef = {
  id: string;
  label: string;
  storagePath: string;
  fileName: string;
  kind: 'pdf' | 'image' | 'other';
};

const LEGACY_VERIFY_DOC_LABELS: Record<string, string> = {
  'seller-img': 'Seller Photo',
  'addr-f': 'Address Proof (Front)',
  'addr-b': 'Address Proof (Back)',
  'biz-addr-f': 'Business Address Proof (Front)',
  'biz-addr-b': 'Business Address Proof (Back)',
  'tax-id': 'Tax ID Proof',
  'bank-stmt': 'Bank Statement / Cancelled Cheque',
};

function inferKYCDocumentKind(path: string): KYCDocumentRef['kind'] {
  const lower = path.toLowerCase();
  if (lower.endsWith('.pdf') || lower.includes('.pdf?')) return 'pdf';
  if (/\.(jpe?g|png|webp|gif)$/.test(lower)) return 'image';
  return 'other';
}

function inferKYCDocumentMimeType(kind: KYCDocumentRef['kind'], storagePath: string): string {
  const lower = storagePath.toLowerCase();
  if (lower.endsWith('.pdf') || kind === 'pdf') return 'application/pdf';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (/\.jpe?g$/.test(lower) || kind === 'image') return 'image/jpeg';
  if (lower.endsWith('.doc')) return 'application/msword';
  if (lower.endsWith('.docx')) {
    return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  }
  return 'application/octet-stream';
}

function normalizeDownloadBlob(blob: Blob, mimeType: string): Blob {
  if (!mimeType || blob.type === mimeType) return blob;
  return new Blob([blob], { type: mimeType });
}

/** Collect every uploaded verification document for admin review (deduped by path). */
export function collectSellerKYCDocuments(row: Record<string, unknown>): KYCDocumentRef[] {
  const docs: KYCDocumentRef[] = [];
  const seen = new Set<string>();

  const add = (id: string, label: string, path: unknown) => {
    const storagePath = normalizeKYCStoragePath(String(path || ''));
    if (!storagePath || seen.has(storagePath)) return;
    seen.add(storagePath);
    docs.push({
      id,
      label,
      storagePath,
      fileName: storagePath.split('/').pop() || storagePath,
      kind: inferKYCDocumentKind(storagePath),
    });
  };

  add('id_front', 'Government ID (Front)', row.id_document_url);
  add('address_proof', 'Address Proof', row.address_proof_url);
  add('bank_statement', 'Bank Statement', row.bank_statement_url);

  const businessAddress = row.business_address as Record<string, unknown> | undefined;
  const nestedDocs = businessAddress?.documents as Record<string, string> | undefined;
  if (nestedDocs) {
    add('id_front', 'Government ID (Front)', nestedDocs.id_front);
    add('id_back', 'Government ID (Back)', nestedDocs.id_back);
    add('business_reg', 'Business Registration', nestedDocs.business_reg);
    add('tax_doc', 'Tax Document', nestedDocs.tax_doc);
    add('bank_proof', 'Bank Account Proof', nestedDocs.bank_proof);
  }

  const legacyDocs = businessAddress?.verification_documents as Record<string, string> | undefined;
  if (legacyDocs) {
    for (const [key, path] of Object.entries(legacyDocs)) {
      add(key, LEGACY_VERIFY_DOC_LABELS[key] || key.replace(/-/g, ' '), path);
    }
  }

  return docs;
}

export function kycDocumentDownloadFilename(
  sellerName: string,
  docId: string,
  storagePath: string,
  kind?: KYCDocumentRef['kind']
): string {
  const slug = sellerName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'seller';
  const base = `${slug}-${docId}`;
  if (storagePath.toLowerCase().includes('.')) {
    const ext = storagePath.split('.').pop() || 'bin';
    return `${base}.${ext}`;
  }
  if (kind === 'pdf') return `${base}.pdf`;
  if (kind === 'image') return `${base}.jpg`;
  return `${base}.bin`;
}

export function triggerKYCDocumentDownload(blob: Blob, filename: string, mimeType?: string) {
  const fileBlob = mimeType ? normalizeDownloadBlob(blob, mimeType) : blob;
  const url = URL.createObjectURL(fileBlob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 120_000);
}

function triggerSignedUrlDownload(signedUrl: string) {
  const anchor = document.createElement('a');
  anchor.href = signedUrl;
  anchor.rel = 'noopener';
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

/** Download a private KYC document with correct MIME type and .pdf filename when needed. */
export async function downloadKYCDocument(
  storagePath: string,
  downloadFilename: string,
  kind?: KYCDocumentRef['kind']
): Promise<{ success: boolean; error: string | null }> {
  const cleanPath = normalizeKYCStoragePath(storagePath);
  if (!cleanPath) {
    return { success: false, error: 'Document path is missing.' };
  }

  const resolvedKind = kind || inferKYCDocumentKind(cleanPath);
  const mimeType = inferKYCDocumentMimeType(resolvedKind, cleanPath);
  let filename = downloadFilename;
  if (resolvedKind === 'pdf' && !filename.toLowerCase().endsWith('.pdf')) {
    filename = filename.includes('.')
      ? `${filename.replace(/\.[^.]+$/, '')}.pdf`
      : `${filename}.pdf`;
  }

  const { data, error } = await supabase.storage.from('kyc-documents').download(cleanPath);
  if (!error && data) {
    triggerKYCDocumentDownload(normalizeDownloadBlob(data, mimeType), filename, mimeType);
    return { success: true, error: null };
  }

  const { data: signedData, error: signedError } = await supabase.storage
    .from('kyc-documents')
    .createSignedUrl(cleanPath, 600, { download: filename });

  if (!signedError && signedData?.signedUrl) {
    try {
      const response = await fetch(signedData.signedUrl);
      if (response.ok) {
        const blob = normalizeDownloadBlob(await response.blob(), mimeType);
        triggerKYCDocumentDownload(blob, filename, mimeType);
        return { success: true, error: null };
      }
    } catch {
      // Fall through to direct signed-URL navigation.
    }

    triggerSignedUrlDownload(signedData.signedUrl);
    return { success: true, error: null };
  }

  const signedUrl = await getKYCDocumentSignedUrl(cleanPath, 600);
  if (!signedUrl) {
    return {
      success: false,
      error: error?.message || signedError?.message || 'Could not download this document.',
    };
  }

  try {
    const response = await fetch(signedUrl);
    if (!response.ok) {
      return { success: false, error: `Download failed (${response.status}).` };
    }
    const blob = normalizeDownloadBlob(await response.blob(), mimeType);
    triggerKYCDocumentDownload(blob, filename, mimeType);
    return { success: true, error: null };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

// ─── Fetch KYC Status ────────────────────────────────────────────

export async function getSellerKYCStatus(
  sellerId: string
): Promise<{ kycData: Partial<SellerKYC> | null; error: string | null }> {
  try {
    const { data, error } = await supabase
      .from('seller_kyc')
      .select('*')
      .eq('seller_id', sellerId)
      .single();

    if (error && error.code !== 'PGRST116') {
      // PGRST116 = no rows — not really an error for first-time sellers
      return { kycData: null, error: error.message };
    }

    return { kycData: data as Partial<SellerKYC> | null, error: null };
  } catch (err) {
    return { kycData: null, error: (err as Error).message };
  }
}

// ─── KYC Requirements by Country ─────────────────────────────────

/**
 * Fetch country-specific KYC document requirements.
 * Currently returns a standard set; extend the `countries` table
 * with a `kyc_requirements` JSONB column for true per-country config.
 */
export async function getKYCRequirementsByCountry(
  countryCode: string
): Promise<KYCRequirement[]> {
  // Base requirements for every country
  const baseRequirements: KYCRequirement[] = [
    { id: 'seller-img',  label: 'Seller Image',                          documentType: 'photo',            required: true },
    { id: 'addr-f',      label: 'Seller Address Proof – Front Side',     documentType: 'address_front',    required: true },
    { id: 'addr-b',      label: 'Seller Address Proof – Back Side',      documentType: 'address_back',     required: true },
    { id: 'biz-addr-f',  label: 'Business Address Proof – Front Side',   documentType: 'biz_address_front',required: true },
    { id: 'biz-addr-b',  label: 'Business Address Proof – Back Side',    documentType: 'biz_address_back', required: true },
    { id: 'tax-id',      label: 'Tax ID Proof (Personal Or Business)',    documentType: 'tax_id',           required: true },
    { id: 'bank-stmt',   label: 'Bank Statement Or Cancelled Cheque',    documentType: 'bank_statement',   required: true },
  ];

  // Optionally query the countries table for overrides
  try {
    const { data: country } = await supabase
      .from('countries')
      .select('country_code')
      .eq('country_code', countryCode)
      .single();

    if (country) {
      // Country exists — you can extend the countries table with
      // a `kyc_requirements` JSONB column in the future and read it here.
      // For now, return the base set.
      return baseRequirements;
    }
  } catch {
    // Fallback silently
  }

  return baseRequirements;
}

// ─── Admin KYC Functions ─────────────────────────────────────────

/** Fetch all KYC submissions (admin only — RLS enforced) */
export async function fetchAllKYCSubmissions(): Promise<{
  data: Record<string, unknown>[];
  error: string | null;
}> {
  const { data, error } = await supabase
    .from('seller_kyc')
    .select('*')
    .order('submitted_at', { ascending: false });

  if (error) return { data: [], error: error.message };
  return { data: (data || []) as Record<string, unknown>[], error: null };
}

/** Admin approves a KYC submission */
export async function approveKYC(
  kycId: string,
  sellerId: string,
  adminId: string
): Promise<KYCSubmitResult> {
  const { error } = await supabase
    .from('seller_kyc')
    .update({
      kyc_status: 'approved',
      verified_by_admin: adminId,
      verified_at: new Date().toISOString(),
      rejection_reason: null,
    })
    .eq('id', kycId);

  if (error) return { success: false, error: error.message };

  // Mark profile as verified + approved
  await supabase
    .from('profiles')
    .update({ is_verified: true, approved: true })
    .eq('id', sellerId);

  // Notify seller (in-app + push + email)
  notifyAccountEvent({
    type: 'identity_approved',
    recipientUserIds: [sellerId],
    title: 'KYC Approved',
    message: 'Your KYC verification has been approved. You can now list products and start selling on BZEAD.',
    metadata: { kyc_id: kycId },
    email: {
      eventType: 'identity_approved',
      recipientType: 'seller',
      data: { order_id: kycId },
    },
  }).catch((err) => logger.error(err as Error, { context: 'approveKYC notify' }));

  return { success: true, error: null };
}

/** Admin rejects a KYC submission */
export async function rejectKYC(
  kycId: string,
  sellerId: string,
  reason: string
): Promise<KYCSubmitResult> {
  const { error } = await supabase
    .from('seller_kyc')
    .update({
      kyc_status: 'rejected',
      rejection_reason: reason,
      verified_at: new Date().toISOString(),
    })
    .eq('id', kycId);

  if (error) return { success: false, error: error.message };

  await supabase
    .from('profiles')
    .update({ is_verified: false, approved: false })
    .eq('id', sellerId);

  // Notify seller (in-app + push + email)
  notifyAccountEvent({
    type: 'identity_rejected',
    recipientUserIds: [sellerId],
    title: 'KYC Update',
    message: reason
      ? `Your KYC verification was not approved. Reason: ${reason}`
      : 'Your KYC verification was not approved. Please review and resubmit your documents.',
    metadata: { kyc_id: kycId, reason },
    email: {
      eventType: 'identity_rejected',
      recipientType: 'seller',
      data: { order_id: kycId, reason },
    },
  }).catch((err) => logger.error(err as Error, { context: 'rejectKYC notify' }));

  return { success: true, error: null };
}

/** Admin deletes a KYC submission */
export async function deleteKYC(kycId: string): Promise<KYCSubmitResult> {
  const { error } = await supabase
    .from('seller_kyc')
    .delete()
    .eq('id', kycId);

  if (error) return { success: false, error: error.message };
  return { success: true, error: null };
}

/** Admin updates a KYC record */
export async function updateKYC(
  kycId: string,
  updates: Record<string, unknown>
): Promise<KYCSubmitResult> {
  const { error } = await supabase
    .from('seller_kyc')
    .update(updates)
    .eq('id', kycId);

  if (error) return { success: false, error: error.message };
  return { success: true, error: null };
}
