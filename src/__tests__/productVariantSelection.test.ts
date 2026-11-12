import { describe, expect, it } from 'vitest';
import {
  buildVariantSelectionState,
  resolveDirectCartVariantChoice,
} from '../lib/productVariantSelection';

const baseProduct = {
  id: 'product-1',
  name: 'Sample Product',
  description: 'desc',
  price: 100,
  currency: 'INR',
  image_url: '/test.jpg',
  seller_id: 'seller-1',
  category: 'category-1',
  stock: 5,
  created_at: '2026-01-01T00:00:00Z',
};

describe('product variant selection', () => {
  it('requires a selector when multiple size options exist', () => {
    const product = {
      ...baseProduct,
      product_variants: [
        { id: 'v1', variant_type: 'combination', size: '64 GB', color: 'Black', stock: 3, sku: 'SKU-1', price: 110 },
        { id: 'v2', variant_type: 'combination', size: '128 GB', color: 'Black', stock: 4, sku: 'SKU-2', price: 130 },
      ],
    };

    const state = buildVariantSelectionState(product as any, {});

    expect(state.shouldOpenSelector).toBe(true);
    expect(state.requiresSizeSelection).toBe(true);
    expect(state.currentVariant).toBeNull();
  });

  it('resolves a direct cart choice for a single default variant', () => {
    const product = {
      ...baseProduct,
      product_variants: [
        { id: 'v1', variant_type: 'combination', size: '1 Pack', color: 'Default', stock: 8, sku: 'PACK-1', price: 120 },
      ],
    };

    const choice = resolveDirectCartVariantChoice(product as any);

    expect(choice.variant?.id).toBe('v1');
    expect(choice.selectedSize).toBe('1 Pack');
    expect(choice.selectedColor).toBeNull();
  });
});