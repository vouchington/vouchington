const SUPPORTED_IMAGE_TYPES = [
  'image/jpeg',
  'image/jpg', // non-standard but mirrors backend's 'jpg' extension support
  'image/png',
  'image/webp',
  'image/gif',
  'image/tiff',
  'image/avif',
  'image/heif',
  'image/heic',
]

export const SUPPORTED_IMAGE_ACCEPT = SUPPORTED_IMAGE_TYPES.join(',')

export function validateImageFile(file: File): string | null {
  if (!SUPPORTED_IMAGE_TYPES.includes(file.type)) {
    return 'Unsupported image format. Please use JPEG, PNG, WebP, GIF, TIFF, AVIF, HEIF, or HEIC.'
  }
  if (file.size > 50 * 1024 * 1024) {
    return 'Image is too large. Maximum size is 50MB.'
  }
  return null
}
