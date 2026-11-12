import { supabase } from '../lib/supabase';

export interface ImageUploadOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
  maxSizeBytes?: number;
}

/**
 * Compress image using Canvas API
 */
export const compressImage = (
  file: File,
  options: ImageUploadOptions = {}
): Promise<Blob> => {
  return new Promise((resolve, reject) => {
    const {
      maxWidth = 500,
      maxHeight = 500,
      quality = 0.85,
      maxSizeBytes = 512000,
    } = options;

    if (file.size > maxSizeBytes) {
      reject(new Error(`File size ${(file.size / 1024).toFixed(2)}KB exceeds max ${(maxSizeBytes / 1024).toFixed(2)}KB`));
      return;
    }

    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (e) => {
      const img = new Image();
      img.src = e.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) { reject(new Error('Failed to get canvas context')); return; }
        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          (blob) => {
            if (blob) {
              if (blob.size > maxSizeBytes) {
                reject(new Error(`Compressed file ${(blob.size / 1024).toFixed(2)}KB still exceeds limit`));
              } else {
                resolve(blob);
              }
            } else {
              reject(new Error('Failed to compress image'));
            }
          },
          file.type,
          quality
        );
      };
      img.onerror = () => reject(new Error('Failed to load image'));
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
  });
};

/**
 * Upload image to Supabase Storage
 */
export const uploadImageToS3 = async (
  compressedBlob: Blob,
  categoryId: string,
  fileName: string
): Promise<string> => {
  const ext = fileName.split('.').pop() || 'jpg';
  const path = `categories/${categoryId}/${Date.now()}-${fileName.replace(/[^a-zA-Z0-9._-]/g, '_')}`;

  const { error } = await supabase.storage
    .from('product-images')
    .upload(path, compressedBlob, {
      contentType: `image/${ext === 'jpg' ? 'jpeg' : ext}`,
    });

  if (error) {
    console.error('Upload failed:', error.message);
    throw new Error(`Upload failed: ${error.message}`);
  }

  const { data } = supabase.storage.from('product-images').getPublicUrl(path);
  return data.publicUrl;
};

/**
 * Validate image file
 */
export const validateImageFile = (file: File): string | null => {
  const maxSizeBytes = 10 * 1024 * 1024;
  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

  if (!file) return 'No file selected';
  if (!allowedTypes.includes(file.type)) return 'Invalid image type. Allowed: JPEG, PNG, WebP, GIF';
  if (file.size > maxSizeBytes) return `File too large (${(file.size / 1024 / 1024).toFixed(2)}MB). Max: 10MB`;

  return null;
};

/**
 * Process image from file input
 */
export const processAndUploadImage = async (
  file: File,
  categoryId: string,
  onProgress?: (message: string) => void
): Promise<string> => {
  onProgress?.('Validating image...');
  const validationError = validateImageFile(file);
  if (validationError) throw new Error(validationError);

  onProgress?.('Compressing image...');
  const compressedBlob = await compressImage(file);
  onProgress?.(`Compressed: ${(file.size / 1024).toFixed(2)}KB → ${(compressedBlob.size / 1024).toFixed(2)}KB`);

  onProgress?.('Uploading...');
  const imageUrl = await uploadImageToS3(compressedBlob, categoryId, file.name);
  onProgress?.('Upload complete!');

  return imageUrl;
};
