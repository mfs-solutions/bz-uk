import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Star, Upload, Send, Loader2, Package, AlertCircle } from 'lucide-react';
import logger from '../../utils/logger';
import { useAuth } from '../../contexts/AuthContext';
import { useCurrency } from '../../contexts/CurrencyContext';
import { fetchProductById } from '../../lib/productService';
import { Skeleton, FormSkeleton } from '../../components/common/Skeleton';
import { fetchPublicProductPrices } from '../../lib/pricingService';
import { createReview } from '../../lib/adminService';
import { supabase } from '../../lib/supabase';
import { useDestinationCountry } from '../../hooks/useDestinationCountry';
import { Header } from '../../components/layout/Header';
import { MobileNav } from '../../components/layout/MobileNav';

interface Product {
  id: string;
  slug?: string;
  name: string;
  image_url?: string;
  price: number;
  currency?: string;
  images?: string[];
}

export const WriteReview: React.FC = () => {
  const { productId } = useParams();
  const navigate = useNavigate();
  const { user, currentAuthUser } = useAuth();
  const { formatPrice } = useCurrency();
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [title, setTitle] = useState('');
  const [review, setReview] = useState('');
  const [images, setImages] = useState<File[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [product, setProduct] = useState<Product | null>(null);
  const [publicUnitPrice, setPublicUnitPrice] = useState<number | undefined>(undefined);
  const [benefits, setBenefits] = useState<string[]>([]);
  const [agreeToTerms, setAgreeToTerms] = useState(false);
  const [blobUrls, setBlobUrls] = useState<string[]>([]);

  const selectedCountry = useDestinationCountry({
    userId: user?.id || currentAuthUser?.userId || null,
    userCountry: user?.country || '',
  });

  // SL44: Revoke blob URLs on unmount to prevent memory leaks
  useEffect(() => {
    return () => {
      blobUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [blobUrls]);

  // Fetch product data on mount
  useEffect(() => {
    const fetchProduct = async () => {
      if (!productId) {
        setLoadError('Product ID is missing');
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const result = await fetchProductById(productId);
        const productData = result.data;

        if (productData) {
          setProduct(productData as Product);
        } else {
          setLoadError('Product not found');
        }
      } catch (error) {
        logger.error(error as Error, { context: 'Failed to fetch product for review' });
        setLoadError('Failed to load product details');
      } finally {
        setLoading(false);
      }
    };

    fetchProduct();
  }, [productId]);

  useEffect(() => {
    const loadPublicPrice = async () => {
      if (!product?.id || !selectedCountry) {
        setPublicUnitPrice(undefined);
        return;
      }

      const { data } = await fetchPublicProductPrices([product.id], selectedCountry);
      const resolvedPrice = data?.[0]?.publicUnitPrice;
      setPublicUnitPrice(typeof resolvedPrice === 'number' ? resolvedPrice : undefined);
    };

    void loadPublicPrice();
  }, [product?.id, selectedCountry]);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files);
      // Limit to 5 images
      if (files.length + images.length > 5) {
        setSubmitError('Maximum 5 images allowed');
        return;
      }
      // Check file size (max 5MB each)
      const oversizedFiles = files.filter(file => file.size > 5 * 1024 * 1024);
      if (oversizedFiles.length > 0) {
        setSubmitError('Some images exceed 5MB. Please choose smaller files.');
        return;
      }
      setImages([...images, ...files]);
      // Create blob URLs for preview and track them for cleanup
      const newBlobUrls = files.map((f) => URL.createObjectURL(f));
      setBlobUrls((prev) => [...prev, ...newBlobUrls]);
    }
  };

  const handleBenefitToggle = (benefit: string) => {
    setBenefits(prev => 
      prev.includes(benefit) 
        ? prev.filter(b => b !== benefit)
        : [...prev, benefit]
    );
  };

  const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
  const MAX_REVIEW_IMAGE_SIZE = 5 * 1024 * 1024; // 5 MB

  const uploadReviewImages = async (): Promise<string[]> => {
    if (images.length === 0) return [];

    for (const file of images) {
      if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
        throw new Error('Invalid image type. Allowed: JPEG, PNG, WebP, GIF');
      }
      if (file.size > MAX_REVIEW_IMAGE_SIZE) {
        throw new Error(`File too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Max: 5MB`);
      }
    }

    try {
      const uploadPromises = images.map(async (file, index) => {
        const timestamp = Date.now();
        const fileName = `${productId}-${timestamp}-${index}-${file.name}`;
        const path = `reviews/${fileName}`;

        const { error } = await supabase.storage
          .from('product-images')
          .upload(path, file, { contentType: file.type });
        
        if (error) throw error;

        const { data } = supabase.storage.from('product-images').getPublicUrl(path);
        return data.publicUrl;
      });

      return await Promise.all(uploadPromises);
    } catch (error) {
      logger.error(error as Error, { context: 'Failed to upload review images' });
      throw new Error('Failed to upload images');
    }
  };

  const handleSubmitReview = async () => {
    // Validation
    if (!rating || !title.trim() || !review.trim()) {
      setSubmitError('Please fill all required fields: Rating, Title, and Review');
      return;
    }

    if (!agreeToTerms) {
      setSubmitError('Please agree to the terms before submitting');
      return;
    }

    const userId = user?.id || currentAuthUser?.userId;
    if (!userId) {
      setSubmitError('You must be logged in to submit a review.');
      navigate('/login');
      return;
    }

    if (!productId) {
      setSubmitError('Product ID is missing');
      return;
    }

    if (!product) {
      setSubmitError('Product details not loaded');
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      // Check for duplicate review by this user
      const { data: existingReview } = await supabase
        .from('reviews')
        .select('id')
        .eq('product_id', product.id)
        .eq('user_id', userId)
        .maybeSingle();

      if (existingReview) {
        setSubmitError('You have already reviewed this product.');
        setIsSubmitting(false);
        return;
      }

      // Upload images first (if any)
      const uploadedImageUrls = await uploadReviewImages();

      // Submit review to Supabase
      const reviewInput = {
        product_id: product.id,
        user_id: userId,
        rating: rating,
        heading: title.trim(),
        comment: review.trim(),
        images: uploadedImageUrls,
        benefits: benefits.length > 0 ? benefits : undefined,
      };

      const result = await createReview(reviewInput);

      if (result.data) {
        logger.log('Review submitted successfully', {
          reviewId: result.data.id,
          productId: product.id,
          rating,
        });
        setSubmitError(null);
        // Navigate immediately — the product page will show the new review
        navigate(`/products/${product.slug || product.id}`, { replace: true });
      } else {
        throw new Error(result.error || 'Failed to create review');
      }
    } catch (error) {
      logger.error(error as Error, { context: 'Error submitting review' });
      setSubmitError('Failed to submit review. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 py-8">
        <div className="w-full max-w-2xl mx-auto px-4 space-y-6">
          <div className="flex items-center gap-4">
            <Skeleton rounded="lg" className="h-20 w-20" />
            <div className="flex-1 space-y-2">
              <Skeleton rounded="sm" className="h-4 w-3/4" />
              <Skeleton rounded="sm" className="h-3 w-1/2" />
            </div>
          </div>
          <FormSkeleton fields={3} />
        </div>
      </div>
    );
  }

  // Error state — only block rendering on load errors, not submission errors
  if (loadError || !product) {
    return (
      <div className="min-h-screen bg-gray-50 py-8 flex items-center justify-center">
        <div className="max-w-md w-full mx-4">
          <div className="bg-white rounded-lg shadow-md p-8 text-center">
            <AlertCircle className="h-12 w-12 text-red-600 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-gray-900 mb-2">Unable to Load Product</h2>
            <p className="text-gray-600 mb-6">{loadError || 'Product not found'}</p>
            <button
              onClick={() => navigate('/')}
              className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition"
            >
              Go to Home
            </button>
          </div>
        </div>
      </div>
    );
  }

  const displayUnitPrice = typeof publicUnitPrice === 'number' ? publicUnitPrice : product.price;
  const displayCurrency = (product.currency || 'INR').toUpperCase();

  return (
    <div className="min-h-screen bg-[#f3f4f6] flex flex-col">
      <Header />
      <div className="max-w-3xl mx-auto px-4 py-4 sm:py-5 w-full pb-24 md:pb-8">
        {/* Header */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 sm:p-5 mb-4">
          <h1 className="text-lg sm:text-xl font-bold text-gray-900">Write a Review</h1>
          <p className="text-sm text-gray-500 mt-1">Share your experience with this product</p>
        </div>

        {/* Product Card */}
        <div className="bg-gray-50 rounded-xl border border-gray-200 p-4 sm:p-5 mb-4">
          <div className="flex gap-3 sm:gap-4 items-start">
            {product.image_url || (product.images && product.images.length > 0) ? (
              <img
                src={product.image_url || product.images![0]}
                alt={product.name}
                className="w-20 h-20 sm:w-24 sm:h-24 object-cover rounded-lg border border-gray-200 shrink-0"
              />
            ) : (
              <div className="w-20 h-20 sm:w-24 sm:h-24 bg-gray-200 rounded-lg flex items-center justify-center shrink-0">
                <Package className="h-8 w-8 sm:h-10 sm:w-10 text-gray-500" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <h2
                className="text-[15px] sm:text-lg font-semibold text-gray-900 leading-snug line-clamp-3"
                title={product.name}
              >
                {product.name}
              </h2>
              <p className="text-base font-bold text-gray-900 mt-2">{formatPrice(displayUnitPrice, displayCurrency)}</p>
            </div>
          </div>
        </div>

        {/* Review Form */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 sm:p-5 space-y-5 sm:space-y-6">
          {/* Submission Error Banner */}
          {submitError && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
              {submitError}
            </div>
          )}
          {/* Rating */}
          <div>
            <label className="block text-sm font-semibold text-gray-900 mb-2.5">
              Rating <span className="text-red-500">*</span>
            </label>
            <div className="flex gap-1.5">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onClick={() => setRating(star)}
                  onMouseEnter={() => setHoverRating(star)}
                  onMouseLeave={() => setHoverRating(0)}
                  className="focus:outline-none transition-transform hover:scale-110"
                  aria-label={`Rate ${star} star${star > 1 ? 's' : ''}`}
                >
                  <Star
                    className={`w-8 h-8 sm:w-9 sm:h-9 ${
                      star <= (hoverRating || rating)
                        ? 'fill-[#f69931] text-[#f69931]'
                        : 'text-gray-300'
                    }`}
                  />
                </button>
              ))}
            </div>
            {rating > 0 && (
              <p className="mt-2 text-sm text-gray-500">
                {rating === 1 && 'Poor'}
                {rating === 2 && 'Fair'}
                {rating === 3 && 'Good'}
                {rating === 4 && 'Very Good'}
                {rating === 5 && 'Excellent'}
              </p>
            )}
          </div>

          {/* Title */}
          <div>
            <label className="block text-sm font-semibold text-gray-900 mb-2">
              Review Title <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Summarize your review in a few words"
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#6D28D9]/30 focus:border-[#6D28D9]"
              maxLength={100}
            />
            <p className="text-gray-400 text-xs mt-1">{title.length}/100 characters</p>
          </div>

          {/* Review Text */}
          <div>
            <label className="block text-sm font-semibold text-gray-900 mb-2">
              Your Review <span className="text-red-500">*</span>
            </label>
            <textarea
              value={review}
              onChange={(e) => setReview(e.target.value)}
              placeholder="Share your detailed experience with this product..."
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#6D28D9]/30 focus:border-[#6D28D9] resize-y min-h-[120px]"
              rows={5}
              maxLength={5000}
            />
            <p className="text-gray-400 text-xs mt-1">{review.length}/5000 characters</p>
          </div>

          {/* Image Upload */}
          <div>
            <label className="block text-sm font-semibold text-gray-900 mb-2">
              Add Photos (Optional)
            </label>
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 sm:p-5 text-center bg-gray-50/50">
              <Upload className="w-7 h-7 text-[#0B2A66] mx-auto mb-2" />
              <p className="text-sm text-gray-600 mb-1">
                Drag and drop your images here or click to select
              </p>
              <p className="text-xs text-gray-400 mb-3">
                Supported formats: JPG, PNG | Max 5 images | Max 5MB each
              </p>
              <input
                type="file"
                multiple
                accept="image/jpeg,image/png,image/webp,image/gif"
                onChange={handleImageUpload}
                className="hidden"
                id="image-upload"
              />
              <label
                htmlFor="image-upload"
                className="inline-block bg-[#2f6fe4] text-white px-5 py-2 rounded-lg hover:bg-[#235ec8] transition cursor-pointer text-sm font-semibold"
              >
                Select Images
              </label>
            </div>

            {/* Preview Images */}
            {images.length > 0 && (
              <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-3">
                {images.map((image, index) => (
                  <div key={index} className="relative">
                    <img
                      src={blobUrls[index] || URL.createObjectURL(image)}
                      alt={`Preview ${index}`}
                      className="w-full h-24 sm:h-32 object-cover rounded-lg"
                    />
                    <button
                      onClick={() => {
                        // SL44: Revoke the blob URL being removed
                        if (blobUrls[index]) URL.revokeObjectURL(blobUrls[index]);
                        setImages(images.filter((_, i) => i !== index));
                        setBlobUrls((prev) => prev.filter((_, i) => i !== index));
                      }}
                      className="absolute top-2 right-2 bg-red-600 text-white w-6 h-6 rounded-full flex items-center justify-center hover:bg-red-700 text-xs"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Benefits Checkboxes */}
          <div>
            <label className="block text-sm font-semibold text-gray-900 mb-3">
              What are the benefits? (Optional)
            </label>
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              {['Value for Money', 'Quality', 'Durability', 'Design', 'Performance'].map((benefit) => (
                <label key={benefit} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={benefits.includes(benefit)}
                    onChange={() => handleBenefitToggle(benefit)}
                    className="w-4 h-4 rounded border-gray-300 text-[#6D28D9] focus:ring-[#6D28D9]"
                  />
                  <span className="text-sm text-gray-700">{benefit}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Terms */}
          <div className="bg-gray-50 rounded-lg border border-gray-200 p-3 sm:p-4">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={agreeToTerms}
                onChange={(e) => setAgreeToTerms(e.target.checked)}
                className="w-4 h-4 mt-0.5 rounded border-gray-300 text-[#6D28D9] focus:ring-[#6D28D9]"
                required
              />
              <span className="text-xs sm:text-sm text-gray-600 leading-relaxed">
                I confirm that this review is based on my own experience and is my genuine opinion.
                I understand that false or misleading reviews may result in account suspension.
              </span>
            </label>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 pt-2 sm:pt-4">
            <button
              type="button"
              onClick={() => navigate(`/products/${product.slug || product.id}`)}
              disabled={isSubmitting}
              className="flex-1 bg-gray-200 text-gray-800 py-3 rounded-lg hover:bg-gray-300 transition font-semibold disabled:opacity-50 text-sm"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmitReview}
              disabled={isSubmitting || !agreeToTerms}
              className="flex-1 bg-[#0B2A66] text-white py-3 rounded-lg hover:bg-[#081F4D] transition font-semibold flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Submitting...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  Submit Review
                </>
              )}
            </button>
          </div>
        </div>
      </div>
      <MobileNav />
    </div>
  );
};

export default WriteReview;
