import React, { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Heart, ShoppingCart, CheckCircle, Star, Eye } from 'lucide-react';
import type { Product } from '../../types';
import { useAuth } from '../../contexts/AuthContext';
import { useCart } from '../../contexts/CartContext';
import { useWishlist } from '../../contexts/WishlistContext';
import { useCurrency } from '../../contexts/CurrencyContext';
import { resolveProductDisplayImage } from '../../lib/productService';
import { QuickViewModal } from './QuickViewModal';
import { ProductVariantDialog } from './ProductVariantDialog';
import { ToastContainer } from '../common/ToastContainer';
import { useProductAddToCartFlow } from '../../hooks/useProductAddToCartFlow';

interface ProductCardProps {
  product: Product;
  publicUnitPrice?: number;
  priceLoading?: boolean;
  markupMrp?: number;
  imageLoading?: 'eager' | 'lazy';
}

export const ProductCard: React.FC<ProductCardProps> = ({
  product,
  publicUnitPrice,
  priceLoading = false,
  markupMrp,
  imageLoading,
}) => {
  const { user } = useAuth();
  const { items } = useCart();
  const { addToWishlist, removeFromWishlist, isInWishlist } = useWishlist();
  const { formatPrice } = useCurrency();
  const imageRef = useRef<HTMLImageElement>(null);
  const [quickViewOpen, setQuickViewOpen] = useState(false);
  const purchaseFlow = useProductAddToCartFlow({ product, publicUnitPrice, markupMrp, imageRef });
  const publicPriceSourceCurrency = (product.currency || 'INR').toUpperCase();
  const inWishlist = isInWishlist(product.id);
  // Only show "already in cart" for logged-in users — guests have no persistent cart
  const alreadyInCart = !!user && items.some((item) => item.product.id === product.id);

  const hasResolvedPublicPrice = typeof publicUnitPrice === 'number' && Number.isFinite(publicUnitPrice);
  const displayUnitPrice = hasResolvedPublicPrice
    ? publicUnitPrice
    : priceLoading
      ? undefined
      : product.price;
  const hasDisplayPrice = typeof displayUnitPrice === 'number' && Number.isFinite(displayUnitPrice);
  // Strikethrough MRP ONLY when markupMrp is available from the pricing service.
  // Never fall back to product.mrp (seller raw INR) — it must not be mixed with markup pricing.
  const hasDiscount = typeof publicUnitPrice === 'number' && !!markupMrp && markupMrp > publicUnitPrice;
  const discountPct = hasDiscount && markupMrp
    ? Math.round((1 - publicUnitPrice! / markupMrp) * 100)
    : 0;

  const handleWishlistToggle = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (inWishlist) {
      removeFromWishlist(product.id);
    } else {
      addToWishlist(product);
    }
  };

  const handleAddToCart = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    void purchaseFlow.handleAddToCart();
  };

  return (
    <>
    <Link
      to={`/products/${product.slug || product.id}`}
      className="relative bg-white border border-gray-100 rounded-xl overflow-hidden group cursor-pointer block hover:shadow-md transition-shadow duration-300"
    >
      {/* Badges */}
      <div className="absolute top-2 left-2 z-10 flex flex-col space-y-1">
        {product.isNew && (
          <span className="bg-amber-500 text-white text-xs font-bold px-2 py-1 rounded-md">
            NEW
          </span>
        )}
        {/* Condition Badge */}
        {product.item_condition && product.item_condition !== 'brand_new' && (
          <span
            className={
              product.item_condition.startsWith('used')
                ? 'bg-blue-600 text-white text-xs font-bold px-2 py-1 rounded-md'
                : product.item_condition === 'refurbished'
                ? 'bg-green-600 text-white text-xs font-bold px-2 py-1 rounded-md'
                : ''
            }
          >
            {(() => {
              switch (product.item_condition) {
                case 'used_open_box':
                  return 'Used - Open Box';
                case 'used_like_new':
                  return 'Used - Like New';
                case 'used_very_good':
                  return 'Used - Very Good';
                case 'used_good':
                  return 'Used - Good';
                case 'used_acceptable':
                  return 'Used - Acceptable';
                case 'refurbished':
                  return 'Refurbished';
                default:
                  return product.item_condition;
              }
            })()}
          </span>
        )}
        {/* Offer / discount badge */}
        {hasDiscount && discountPct > 0 && (
          <span className="bg-red-600 text-white text-[10px] md:text-xs font-bold px-2 py-1 rounded-md shadow-sm">
            {discountPct}% OFF
          </span>
        )}
      </div>

      {/* Wishlist + Quick View Buttons */}
      <div className="absolute top-2 right-2 z-10 flex flex-col items-center gap-1.5">
        <button
          onClick={handleWishlistToggle}
          className="p-2 bg-white/80 backdrop-blur-sm rounded-full hover:bg-white shadow-sm transition-all"
          aria-label={inWishlist ? 'Remove from wishlist' : 'Add to wishlist'}
        >
          <Heart
            className={`h-5 w-5 ${
              inWishlist ? 'fill-red-500 text-red-500' : 'text-gray-500'
            }`}
          />
        </button>
        <button
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); setQuickViewOpen(true); }}
          className="p-2 bg-white/80 backdrop-blur-sm rounded-full hover:bg-white shadow-sm transition-all"
          aria-label="Quick view"
          title="Quick view"
        >
          <Eye className="h-5 w-5 text-gray-700" />
        </button>
      </div>

      {/* Product Image */}
      <div className="relative aspect-square overflow-hidden bg-white">
        <img
          ref={imageRef}
          src={resolveProductDisplayImage(product)}
          alt={product.name}
          loading={imageLoading}
          className="w-full h-full object-cover object-center transition-transform duration-300 md:group-hover:scale-105"
          onError={(e) => {
            e.currentTarget.style.opacity = '0';
          }}
        />
      </div>

      {/* Product Details */}
      <div className="p-1.5 md:p-3">
        {/* Rating & Brand */}
        <div className="flex items-center justify-between mb-0.5 md:mb-1.5">
          {product.rating && (
            <div className="flex items-center space-x-1">
              <Star className="h-4 w-4 fill-amber-500 text-amber-600" />
              <span className="text-sm text-black font-medium">{product.rating}</span>
            </div>
          )}
          {product.brand && (
            <span className="text-xs font-bold uppercase" style={{ color: '#004aad' }}>{product.brand}</span>
          )}
        </div>

        {/* Product Title */}
        <h3 className="text-black font-medium text-xs md:text-base leading-tight mb-0 md:mb-0.5 line-clamp-2 min-h-[1.5rem] md:min-h-[2.25rem]">
          {product.name}
        </h3>

        {/* Category / Brand */}
        <p className="hidden md:block text-[10px] md:text-xs text-gray-500 mb-1.5">
          {(product as any).category_name || product.brand || ''}
        </p>

        {/* Price — struck MRP on the LEFT (smaller), selling price on the RIGHT (larger) */}
        <div className="flex items-baseline gap-1.5 md:gap-2 mb-0.5 md:mb-1.5">
          {hasDiscount && markupMrp && (
            <span className="text-gray-400 text-[10px] md:text-xs line-through">
              {formatPrice(markupMrp, publicPriceSourceCurrency)}
            </span>
          )}
          {hasDisplayPrice && (
            <span className="ml-auto font-bold text-base md:text-xl" style={{ color: '#FF0000' }}>
              {formatPrice(displayUnitPrice, publicPriceSourceCurrency)}
            </span>
          )}
          {!hasDisplayPrice && priceLoading && (
            <span className="ml-auto text-xs text-gray-400" aria-live="polite">
              Loading price…
            </span>
          )}
        </div>

        {/* Add to Cart Button - Slides up on hover */}
        <div className="transition-all duration-300 md:translate-y-3 md:opacity-0 md:group-hover:translate-y-0 md:group-hover:opacity-100">
          <button
            onClick={handleAddToCart}
            disabled={alreadyInCart || !hasDisplayPrice || purchaseFlow.isResolvingAddToCart}
            className={`w-full flex items-center justify-center gap-1 md:gap-2 py-0.5 md:py-1 text-[10px] md:text-sm ${
              alreadyInCart
                ? 'bg-green-100 text-green-700 border border-green-300 rounded-lg cursor-default'
                : !hasDisplayPrice || purchaseFlow.isResolvingAddToCart
                ? 'bg-gray-100 text-gray-500 border border-gray-200 rounded-lg cursor-not-allowed'
                : 'btn-primary'
            }`}
          >
            {alreadyInCart ? (
              <>
                <CheckCircle className="h-3 w-3 md:h-4 md:w-4" />
                <span className="truncate">Already In Cart</span>
              </>
            ) : (
              <>
                <ShoppingCart className="h-3 w-3 md:h-4 md:w-4" />
                <span>Add to Cart</span>
              </>
            )}
          </button>
        </div>
      </div>
    </Link>
    <QuickViewModal
      product={product}
      publicUnitPrice={publicUnitPrice}
      markupMrp={markupMrp}
      open={quickViewOpen}
      onClose={() => setQuickViewOpen(false)}
    />
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
    </>
  );
};
