// Utility function to format prices (legacy — prefer useCurrency().formatPrice)
export const formatPrice = (price: number): string => {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
  }).format(price);
};

export const COUNTRIES_ALLOWED = [
  { code: 'US', name: 'United States', dialCode: '+1' },
  { code: 'GB', name: 'United Kingdom', dialCode: '+44' },
  { code: 'CA', name: 'Canada', dialCode: '+1' },
  { code: 'AU', name: 'Australia', dialCode: '+61' },
  { code: 'AE', name: 'United Arab Emirates', dialCode: '+971' },
  { code: 'IN', name: 'India', dialCode: '+91' },
  { code: 'SG', name: 'Singapore', dialCode: '+65' },
  { code: 'DE', name: 'Germany', dialCode: '+49' },
  { code: 'FR', name: 'France', dialCode: '+33' },
  { code: 'NG', name: 'Nigeria', dialCode: '+234' },
];

export const BUSINESS_TYPES = [
  'Fashion & Apparel',
  'Electronics & Gadgets',
  'Beauty & Personal Care',
  'Home & Living',
  'Health & Wellness',
  'Sports & Outdoor',
  'Food & Grocery',
  'Automotive',
  'Jewelry & Accessories',
  'Other',
];
