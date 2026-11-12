import { describe, expect, it } from 'vitest';
import { orderShippingDocPath, SHIPPING_LABELS_BUCKET, SHIPPING_MANIFESTS_BUCKET } from '../lib/shippingDocumentsService';

describe('shippingDocumentsService', () => {
  it('builds stable storage paths from order id', () => {
    const orderId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
    expect(orderShippingDocPath(orderId)).toBe(`${orderId}.pdf`);
  });

  it('uses dedicated buckets for labels and manifests', () => {
    expect(SHIPPING_LABELS_BUCKET).toBe('shipping-labels');
    expect(SHIPPING_MANIFESTS_BUCKET).toBe('shipping-manifests');
  });
});
