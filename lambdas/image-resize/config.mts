export const CACHE_VERSION = 'v2'

export const OUTPUT_FORMATS = ['jpeg', 'png', 'webp', 'avif'] as const
export type OutputFormat = (typeof OUTPUT_FORMATS)[number]

export const DEFAULT_FORMAT: OutputFormat = 'jpeg'
export const DEFAULT_QUALITY = 75
export const DEFAULT_LOSSLESS = false
export const DEFAULT_PROGRESSIVE = false
export const DEFAULT_MAX_HEIGHT = 2400

// HTTP fetch timeout for sideload requests (30 seconds)
export const HTTP_FETCH_TIMEOUT = 30000

// Max compressed input size for origin S3 objects and sideload fetches (50MB)
export const MAX_INPUT_IMAGE_BYTES = 50 * 1024 * 1024

// Decoded pixel cap for Sharp. 24 MP is ~96 MB as RGBA; larger sources 413 rather
// than OOM the 512 MB Lambda. Raise together with memory_size if phone photos start failing.
export const MAX_INPUT_PIXELS = 24_000_000

export const SHARP_DECODE_OPTIONS = {
  sequentialRead: true,
  limitInputPixels: MAX_INPUT_PIXELS,
} as const

export interface S3BucketConfig {
  bucket: string
  region: string
}

export interface EnvironmentConfig {
  s3_bucket_origin: S3BucketConfig
  s3_bucket_cache: S3BucketConfig
  widths: number[]
  qualities: number[]
  maxHeight: number
}

export interface SideloadConfig {
  s3_bucket_cache: S3BucketConfig
  widths: number[]
  qualities: number[]
  maxHeight: number
}

export function getSourceBucket(): string {
  return requireRuntimeBucket('S3_BUCKET_IMAGES')
}

export function getCacheBucket(): string {
  return requireRuntimeBucket('S3_BUCKET_RENDERS')
}

export function getSideloadCacheBucket(): string {
  return requireRuntimeBucket('S3_BUCKET_RENDERS')
}

function requireRuntimeBucket(name: 'S3_BUCKET_IMAGES' | 'S3_BUCKET_RENDERS'): string {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`Missing ${name}`)
  return value
}
