/**
 * QuickViewModal — Compact PDP preview shown in a centred dialog.
 *
 * Triggered from a product card's "Quick View" icon. Shows the main image,
 * title, brand, price (markup-aware), short description, and Add-to-Cart.
 * A "View Full Details" link routes to the full PDP for the rest.
 */
import React, { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { X, ShoppingCart, CheckCircle, Star, Heart } from 'lucide-react';
import type { Product } from '../../types';
import { useAuth } from '../../contexts/AuthContext';
import { useCart } from '../../contexts/CartContext';
import { useWishlist } from '../../contexts/WishlistContext';
import { useCurrency } from '../../contexts/CurrencyContext';
import { resolveProductDisplayImage } from '../../lib/productService';
import { ProductVariantDialog } from './ProductVariantDialog';
import { ToastContainer } from '../common/ToastContainer';
import { useProductAddToCartFlow } from '../../hooks/useProductAddToCartFlow';

interface Props {
  product: Product;
  publicUnitPrice?: number;
  markupMrp?: number;
  open: boolean;
  onClose: () => void;
}

export const QuickViewModal: React.FC<Props> = ({
  product,
  publicUnitPrice,
  markupMrp,
  open,
  onClose,
}) => {
  const { user } = useAuth();
  const { items } = useCart();
  const { addToWishlist, removeFromWishlist, isInWishlist } = useWishlist();
  const { formatPrice } = useCurrency();
  const imageRef = useRef<HTMLImageElement>(null);
  const purchaseFlow = useProductAddToCartFlow({ product, publicUnitPrice, markupMrp, imageRef });

  const sourceCurrency = (product.currency || 'INR').toUpperCase();
  const hasResolvedPrice = typeof publicUnitPrice === 'number' && Number.isFinite(publicUnitPrice);
  const displayPrice = hasResolvedPrice ? publicUnitPrice! : product.price;
  const hasDisplayPrice = typeof displayPrice === 'number' && Number.isFinite(displayPrice);
  const hasDiscount = typeof publicUnitPrice === 'number' && !!markupMrp && markupMrp > publicUnitPrice;
  const discountPct = hasDiscount && markupMrp
    ? Math.round((1 - publicUnitPrice! / markupMrp) * 100)
    : 0;

  const alreadyInCart = !!user && items.some((i) => i.product.id === product.id);
  const inWishlist = isInWishlist(product.id);

  // Close on Escape + body scroll lock
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  const handleAddToCart = () => {
    void purchaseFlow.handleAddToCart();
  };

  const toggleWishlist = () => {
    if (inWishlist) removeFromWishlist(product.id);
    else addToWishlist(product);
  };

  const shortDesc = product.short_description || product.description || '';

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label="Quick view"
    >
      <button
        type="button"
        aria-label="Close quick view"
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
        {/* Close */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-3 right-3 z-10 p-2 bg-white/90 hover:bg-white rounded-full shadow-md transition-colors"
          aria-label="Close"
        >
          <X size={18} className="text-gray-700" />
        </button>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-0">
          {/* Image */}
          <div className="relative aspect-square bg-gray-50">
            {hasDiscount && (
              <span className="absolute top-3 left-3 bg-red-600 text-white text-[11px] font-bold px-2 py-1 rounded-md shadow-md z-10">
                {discountPct}% OFF
              </span>
            )}
            <img
              ref={imageRef}
              src={resolveProductDisplayImage(product)}
              alt={product.name}
              className="w-full h-full object-cover object-center"
              onError={(e) => { e.currentTarget.style.opacity = '0'; }}
            />
          </div>

          {/* Details */}
          <div className="p-4 sm:p-6 flex flex-col">
            {product.brand && (
              <span className="text-[11px] sm:text-xs text-gray-500 uppercase tracking-wide mb-1">{product.brand}</span>
            )}
            <h2 className="text-base sm:text-lg font-semibold text-gray-900 leading-snug mb-2 pr-6">
              {product.name}
            </h2>

            {product.rating && (
              <div className="flex items-center gap-1 mb-3">
                <Star className="h-4 w-4 fill-amber-500 text-amber-600" />
                <span className="text-sm text-gray-700 font-medium">{product.rating}</span>
                {product.review_count !== undefined && (
                  <span className="text-xs text-gray-500">({product.review_count})</span>
                )}
              </div>
            )}

            {/* Price: struck MRP on the left (smaller), selling price on the right (larger) */}
            <div className="flex items-baseline gap-3 mb-4">
              {hasDiscount && markupMrp && (
                <span className="text-gray-400 text-sm line-through">
                  {formatPrice(markupMrp, sourceCurrency)}
                </span>
              )}
              {hasDisplayPrice && (
                <span className="ml-auto text-gray-900 font-bold text-2xl">
                  {formatPrice(displayPrice, sourceCurrency)}
                </span>
              )}
            </div>

            {shortDesc && (
              <p className="text-sm text-gray-600 leading-relaxed mb-4 line-clamp-4">
                {shortDesc}
              </p>
            )}

            <div className="mt-auto flex items-center gap-2">
              <button
                onClick={handleAddToCart}
                disabled={alreadyInCart || !hasDisplayPrice || purchaseFlow.isResolvingAddToCart}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold transition-colors ${
                  alreadyInCart
                    ? 'bg-green-100 text-green-700 border border-green-300 cursor-default'
                    : !hasDisplayPrice || purchaseFlow.isResolvingAddToCart
                    ? 'bg-gray-100 text-gray-500 border border-gray-200 cursor-not-allowed'
                    : 'btn-primary'
                }`}
              >
                {alreadyInCart ? (
                  <>
                    <CheckCircle size={16} />
                    Already In Cart
                  </>
                ) : (
                  <>
                    <ShoppingCart size={16} />
                    Add to Cart
                  </>
                )}
              </button>
              <button
                onClick={toggleWishlist}
                className="p-2.5 bg-white border border-gray-200 hover:border-gray-300 rounded-lg transition-colors"
                aria-label={inWishlist ? 'Remove from wishlist' : 'Add to wishlist'}
              >
                <Heart className={`h-5 w-5 ${inWishlist ? 'fill-red-500 text-red-500' : 'text-gray-500'}`} />
              </button>
            </div>

            <Link
              to={`/products/${product.slug || product.id}`}
              onClick={onClose}
              className="mt-3 text-center text-sm text-blue-700 hover:text-blue-800 font-medium"
            >
              View Full Details →
            </Link>
          </div>
        </div>
      </div>
      {purchaseFlow.selectorProduct && (
        <ProductVariantDialog
          open={purchaseFlow.selectorOpen}
          product={purchaseFlow.selectorProduct}
          selectedCountry={purchaseFlow.selectorSelectedCountry}
          fallbackPublicUnitPrice={purchaseFlow.selectorFallbackPublicUnitPrice}
          fallbackMarkupMrp={purchaseFlow.selectorFallbackMarkupMrp}
          onClose={purchaseFlow.closeSelector}
          onAddSuccess={purchaseFlow.handleSelectorAddSuccess}
        />
      )}
      <ToastContainer toasts={purchaseFlow.toast.toasts} dismiss={purchaseFlow.toast.dismiss} />
    </div>
  );
};

export default QuickViewModal;
