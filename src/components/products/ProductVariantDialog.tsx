import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Minus, Plus, ShoppingCart, X } from 'lucide-react';
import type { Product } from '../../types';
import { useCart } from '../../contexts/CartContext';
import { useCurrency } from '../../contexts/CurrencyContext';
import { flyToCart, getCartTarget } from '../../utils/flyToCart';
import { resolveProductDisplayImage, resolveProductImageUrl } from '../../lib/productService';
import {
  buildVariantSelectionState,
  resolveVariantPrice,
} from '../../lib/productVariantSelection';

interface ProductVariantDialogProps {
  open: boolean;
  product: Product;
  selectedCountry?: string | null;
  fallbackPublicUnitPrice?: number;
  fallbackMarkupMrp?: number;
  onClose: () => void;
  onAddSuccess?: () => void;
}

const getStockLabel = (stock: number) => {
  if (stock <= 0) return { text: 'Out of stock', className: 'text-red-600' };
  if (stock < 10) return { text: `Only ${stock} left`, className: 'text-amber-600' };
  return { text: 'In stock', className: 'text-green-600' };
};

export const ProductVariantDialog: React.FC<ProductVariantDialogProps> = ({
  open,
  product,
  selectedCountry,
  fallbackPublicUnitPrice,
  fallbackMarkupMrp,
  onClose,
  onAddSuccess,
}) => {
  const { addToCart } = useCart();
  const { formatPrice } = useCurrency();
  const imageRef = useRef<HTMLImageElement>(null);
  const [selectedSize, setSelectedSize] = useState('');
  const [selectedColor, setSelectedColor] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [adding, setAdding] = useState(false);
  const [priceLoading, setPriceLoading] = useState(false);
  const [resolvedPrice, setResolvedPrice] = useState<number | null>(fallbackPublicUnitPrice ?? product.price ?? null);
  const [resolvedMarkupMrp, setResolvedMarkupMrp] = useState<number | null>(fallbackMarkupMrp ?? product.mrp ?? null);

  const selectionState = useMemo(
    () => buildVariantSelectionState(product, { selectedSize, selectedColor }),
    [product, selectedSize, selectedColor],
  );

  useEffect(() => {
    if (!open) return;
    setSelectedSize(selectionState.requiresSizeSelection ? '' : (selectionState.preferredSize || ''));
    setSelectedColor(selectionState.requiresColorSelection ? '' : (selectionState.preferredColor || ''));
    setQuantity(1);
  }, [open, product.id]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setPriceLoading(true);
    void (async () => {
      try {
        const resolved = await resolveVariantPrice(
          product,
          selectedCountry,
          fallbackPublicUnitPrice,
          selectionState.currentVariant?.price != null ? Number(selectionState.currentVariant.price) : null,
        );
        if (cancelled) return;
        setResolvedPrice(resolved.publicUnitPrice);
        setResolvedMarkupMrp(resolved.markupMrp);
      } finally {
        if (!cancelled) setPriceLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    open,
    product,
    selectedCountry,
    fallbackPublicUnitPrice,
    selectionState.currentVariant?.id,
    selectionState.currentVariant?.price,
  ]);

  if (!open) return null;

  const currentVariantImage = Array.isArray(selectionState.currentVariant?.images) && selectionState.currentVariant.images.length > 0
    ? resolveProductImageUrl(String(selectionState.currentVariant.images[0] || ''))
    : resolveProductDisplayImage(product);
  const stockLabel = getStockLabel(selectionState.effectiveStock);
  const sourceCurrency = (product.currency || 'INR').toUpperCase();
  const isSelectionComplete = (!selectionState.requiresSizeSelection || Boolean(selectedSize))
    && (!selectionState.requiresColorSelection || Boolean(selectedColor));
  const canAddToCart = isSelectionComplete
    && Boolean(selectionState.currentVariant)
    && selectionState.inStock
    && !adding
    && !priceLoading
    && resolvedPrice != null;

  const handleAddToCart = async () => {
    if (!canAddToCart || !selectionState.currentVariant) return;
    setAdding(true);
    try {
      const cartIcon = getCartTarget();
      if (imageRef.current && cartIcon) {
        void flyToCart(imageRef.current, cartIcon);
      }
      addToCart(product, quantity, {
        selectedSize: selectedSize || null,
        selectedColor: selectedColor || null,
        selectedVariantId: String(selectionState.currentVariant.id || '').trim() || null,
        selectedVariantSku: String(selectionState.currentVariant.sku || '').trim() || null,
        variantPrice: resolvedPrice,
      });
      onAddSuccess?.();
      onClose();
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-start justify-center p-2 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label="Select product variant">
      <button type="button" className="absolute inset-0 bg-black/55 backdrop-blur-sm" aria-label="Close variant dialog" onClick={onClose} />
      <div className="relative z-[111] mt-2 w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-2xl max-h-[calc(100dvh-1rem)] sm:max-h-[calc(100dvh-2rem)]">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 z-10 rounded-full bg-white/90 p-2 text-gray-600 shadow-sm transition-colors hover:text-gray-900"
          aria-label="Close"
        >
          <X size={18} />
        </button>

        <div className="grid gap-0 md:grid-cols-[320px_1fr] max-h-[calc(100dvh-1rem)] sm:max-h-[calc(100dvh-2rem)] overflow-y-auto overscroll-contain">
          <div className="bg-gray-50 p-3 sm:p-4 md:p-5">
            <div className="aspect-[4/5] overflow-hidden rounded-2xl border border-gray-200 bg-white sm:aspect-square">
              <img
                ref={imageRef}
                src={currentVariantImage}
                alt={product.name}
                className="h-full w-full object-contain object-center sm:object-cover"
                onError={(event) => {
                  event.currentTarget.style.opacity = '0';
                }}
              />
            </div>
          </div>

          <div className="p-4 sm:p-5 md:p-6">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">Select options</p>
            <h2 className="pr-10 text-lg font-semibold leading-snug text-gray-900">{product.name}</h2>

            <div className="mt-3 flex items-end gap-3">
              {resolvedMarkupMrp != null && resolvedPrice != null && resolvedMarkupMrp > resolvedPrice && (
                <span className="text-sm text-gray-400 line-through">
                  {formatPrice(resolvedMarkupMrp, sourceCurrency)}
                </span>
              )}
              <span className="text-2xl font-bold text-gray-900">
                {priceLoading
                  ? 'Loading...'
                  : resolvedPrice != null
                  ? formatPrice(resolvedPrice, sourceCurrency)
                  : 'Unavailable'}
              </span>
            </div>

            <p className={`mt-2 text-sm font-semibold ${stockLabel.className}`}>{stockLabel.text}</p>

            <div className="mt-5 space-y-5">
              {selectionState.hasSizeOptions && (
                <div>
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-gray-900">{selectionState.sizeLabel}</p>
                    {selectionState.requiresSizeSelection && !selectedSize && (
                      <span className="text-xs font-medium text-amber-700">Required</span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {selectionState.availableSizes.map((size) => {
                      const isSelected = selectedSize === size || (!selectedSize && !selectionState.requiresSizeSelection && selectionState.preferredSize === size);
                      return (
                        <button
                          key={size}
                          type="button"
                          onClick={() => setSelectedSize(size)}
                          className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                            isSelected
                              ? 'border-gray-900 bg-gray-900 text-white'
                              : 'border-gray-300 bg-white text-gray-700 hover:border-gray-400'
                          }`}
                        >
                          {size}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {selectionState.hasColorOptions && (
                <div>
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-gray-900">{selectionState.colorLabel}</p>
                    {selectionState.requiresColorSelection && !selectedColor && (
                      <span className="text-xs font-medium text-amber-700">Required</span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {selectionState.availableColors.map((color) => {
                      const isSelected = selectedColor === color || (!selectedColor && !selectionState.requiresColorSelection && selectionState.preferredColor === color);
                      const colorHex = selectionState.colorHexByName.get(color.toLowerCase()) || '#9CA3AF';
                      return (
                        <button
                          key={color}
                          type="button"
                          onClick={() => setSelectedColor(color)}
                          className={`flex items-center gap-2 rounded-full border px-3 py-2 text-sm font-medium transition-colors ${
                            isSelected
                              ? 'border-gray-900 bg-gray-900 text-white'
                              : 'border-gray-300 bg-white text-gray-700 hover:border-gray-400'
                          }`}
                        >
                          <span className="h-4 w-4 rounded-full border border-black/10" style={{ backgroundColor: colorHex }} />
                          <span>{color}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div>
                <p className="mb-2 text-sm font-semibold text-gray-900">Quantity</p>
                <div className="inline-flex items-center overflow-hidden rounded-xl border border-gray-300 bg-white">
                  <button
                    type="button"
                    onClick={() => setQuantity((current) => Math.max(1, current - 1))}
                    className="p-3 text-gray-700 transition-colors hover:bg-gray-100"
                    aria-label="Decrease quantity"
                  >
                    <Minus size={16} />
                  </button>
                  <span className="min-w-12 px-3 text-center text-sm font-semibold text-gray-900">{quantity}</span>
                  <button
                    type="button"
                    onClick={() => setQuantity((current) => Math.min(selectionState.effectiveStock || 1, current + 1))}
                    className="p-3 text-gray-700 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40"
                    aria-label="Increase quantity"
                    disabled={selectionState.effectiveStock <= quantity}
                  >
                    <Plus size={16} />
                  </button>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => { void handleAddToCart(); }}
              disabled={!canAddToCart}
              className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-gray-900 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-black disabled:cursor-not-allowed disabled:bg-gray-300"
            >
              {adding ? <Loader2 size={18} className="animate-spin" /> : <ShoppingCart size={18} />}
              <span>{adding ? 'Adding...' : 'Add to Cart'}</span>
            </button>

            {!isSelectionComplete && (
              <p className="mt-3 text-xs font-medium text-amber-700">Select every required option before adding this item to your cart.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProductVariantDialog;