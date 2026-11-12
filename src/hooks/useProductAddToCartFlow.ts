import { useCallback, useEffect, useState } from 'react';
import type { RefObject } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Product } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { useCart } from '../contexts/CartContext';
import { fetchProductById } from '../lib/productService';
import { flyToCart, getCartTarget } from '../utils/flyToCart';
import { useToast } from './useToast';
import { useDestinationCountry } from './useDestinationCountry';
import {
  buildVariantSelectionState,
  resolveDirectCartVariantChoice,
  resolveVariantPrice,
} from '../lib/productVariantSelection';

interface UseProductAddToCartFlowOptions {
  product: Product;
  publicUnitPrice?: number;
  markupMrp?: number;
  imageRef?: RefObject<HTMLImageElement | null>;
}

export function useProductAddToCartFlow({
  product,
  publicUnitPrice,
  markupMrp,
  imageRef,
}: UseProductAddToCartFlowOptions) {
  const navigate = useNavigate();
  const { user, currentAuthUser } = useAuth();
  const { addToCart, items } = useCart();
  const toast = useToast();
  const selectedCountry = useDestinationCountry({
    userId: user?.id || currentAuthUser?.userId || null,
    userCountry: user?.country || '',
  });

  const [selectorOpen, setSelectorOpen] = useState(false);
  const [selectorProduct, setSelectorProduct] = useState<Product | null>(null);
  const [isResolvingAddToCart, setIsResolvingAddToCart] = useState(false);

  useEffect(() => {
    setSelectorOpen(false);
    setSelectorProduct(null);
  }, [product.id]);

  const animateToCart = useCallback(() => {
    const cartIcon = getCartTarget();
    if (imageRef?.current && cartIcon) {
      void flyToCart(imageRef.current, cartIcon);
    }
  }, [imageRef]);

  const addResolvedProductToCart = useCallback(async (
    productToAdd: Product,
    quantity: number,
    variantSelection?: { selectedSize?: string | null; selectedColor?: string | null; variant?: Record<string, any> | null },
  ) => {
    const resolvedPrice = await resolveVariantPrice(
      productToAdd,
      selectedCountry,
      publicUnitPrice,
      variantSelection?.variant?.price != null ? Number(variantSelection.variant.price) : null,
    );

    animateToCart();
    addToCart(productToAdd, quantity, {
      selectedSize: variantSelection?.selectedSize || null,
      selectedColor: variantSelection?.selectedColor || null,
      selectedVariantId: String(variantSelection?.variant?.id || '').trim() || null,
      selectedVariantSku: String(variantSelection?.variant?.sku || '').trim() || null,
      variantPrice: resolvedPrice.publicUnitPrice,
    });
    toast.success('Product added to cart');
  }, [addToCart, animateToCart, publicUnitPrice, selectedCountry, toast]);

  const loadProductWithVariants = useCallback(async () => {
    if (selectorProduct?.id === product.id) return selectorProduct;
    const { data } = await fetchProductById(product.id);
    if (!data) return null;
    return data as Product;
  }, [product.id, selectorProduct]);

  const handleAddToCart = useCallback(async () => {
    if (!user) {
      navigate('/login');
      return;
    }

    const alreadyInCart = items.some((item) => item.product.id === product.id);
    if (alreadyInCart || isResolvingAddToCart) return;

    setIsResolvingAddToCart(true);
    try {
      const localSelectionState = buildVariantSelectionState(product, {});
      const canDecideLocally = Array.isArray((product as any)?.product_variants);

      let resolvedProduct = product;
      let selectionState = localSelectionState;

      if (!canDecideLocally) {
        const fullProduct = await loadProductWithVariants();
        if (!fullProduct) {
          navigate(`/products/${product.slug || product.id}`);
          return;
        }
        resolvedProduct = fullProduct;
        selectionState = buildVariantSelectionState(fullProduct, {});
      }

      if (selectionState.variants.length === 0) {
        await addResolvedProductToCart(resolvedProduct, 1);
        return;
      }

      if (!selectionState.shouldOpenSelector) {
        const directChoice = resolveDirectCartVariantChoice(resolvedProduct);
        await addResolvedProductToCart(resolvedProduct, 1, directChoice);
        return;
      }

      if (selectionState.shouldOpenSelector && selectionState.variants.length > 0) {
        setSelectorProduct(resolvedProduct);
        setSelectorOpen(true);
        return;
      }

      if (!resolvedProduct) {
        navigate(`/products/${product.slug || product.id}`);
      }
    } finally {
      setIsResolvingAddToCart(false);
    }
  }, [
    addResolvedProductToCart,
    isResolvingAddToCart,
    items,
    loadProductWithVariants,
    navigate,
    product,
    user,
  ]);

  return {
    handleAddToCart,
    isResolvingAddToCart,
    selectorOpen,
    selectorProduct,
    selectorSelectedCountry: selectedCountry,
    selectorFallbackPublicUnitPrice: publicUnitPrice,
    selectorFallbackMarkupMrp: markupMrp,
    closeSelector: () => setSelectorOpen(false),
    handleSelectorAddSuccess: () => toast.success('Product added to cart'),
    toast,
  };
}