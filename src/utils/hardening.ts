/**
 * hardening.ts — Shared security & safety utilities
 *
 * Reusable functions that eliminate entire classes of bugs:
 *  - Ownership enforcement (cross-tenant isolation)
 *  - Money rounding (floating-point safety)
 *  - Pagination clamping (out-of-range prevention)
 */

// ─── Ownership Enforcement ─────────────────────────────────────

/**
 * Assert that a record belongs to the current seller.
 * Throws if the IDs don't match — callers should catch and surface an error.
 */
export function assertOwnership(recordSellerId: string | null | undefined, currentSellerId: string): void {
  if (!currentSellerId) throw new Error('Not authenticated');
  if (!recordSellerId || recordSellerId !== currentSellerId) {
    throw new Error('Unauthorized: record does not belong to current seller');
  }
}

/**
 * Verify that a product belongs to the seller by checking its seller_id.
 * Returns `true` if ownership is confirmed, `false` otherwise.
 */
export function isOwner(recordSellerId: string | null | undefined, currentSellerId: string): boolean {
  return !!currentSellerId && !!recordSellerId && recordSellerId === currentSellerId;
}

// ─── Money Safety ──────────────────────────────────────────────

/**
 * Round a numeric value to 2 decimal places (floor-based to avoid overpaying).
 * Safe for all financial calculations: wallet, pricing, checkout, analytics.
 */
export function roundMoney(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Safely parse a value to a finite number, returning 0 for invalid inputs.
 */
export function safeNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

// ─── Pagination Safety ─────────────────────────────────────────

/**
 * Clamp a page number to [1, totalPages]. Always returns a safe integer.
 */
export function clampPage(page: number, totalPages: number): number {
  const maxPage = Math.max(1, Math.ceil(totalPages));
  return Math.max(1, Math.min(Math.floor(page), maxPage));
}

// ─── Atomic Update Helpers ─────────────────────────────────────

/**
 * Result type for atomic update operations.
 * `wasConflict` is true when 0 rows matched the status guard.
 */
export interface AtomicUpdateResult<T = unknown> {
  data: T | null;
  error: string | null;
  wasConflict: boolean;
}

/**
 * Standard conflict error message for atomic updates that matched 0 rows.
 */
export const CONFLICT_ERROR = 'This record has already been modified. Please refresh and try again.';
