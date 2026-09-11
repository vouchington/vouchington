import { describe, it, expect, afterEach } from 'vitest'
import {
  CACHE_VERSION,
  getCacheBucket,
  getSideloadCacheBucket,
  getSourceBucket,
  MAX_INPUT_PIXELS,
} from './config.mts'

describe('resize cache and decode constants', () => {
  it('bumps CACHE_VERSION when resize semantics change', () => {
    expect(CACHE_VERSION).toBe('v2')
  })

  it('caps decoded Sharp input at 24 megapixels', () => {
    expect(MAX_INPUT_PIXELS).toBe(24_000_000)
  })
})

describe('getSideloadCacheBucket', () => {
  const originalRendersBucket = process.env.S3_BUCKET_RENDERS

  afterEach(() => {
    if (originalRendersBucket === undefined) {
      delete process.env.S3_BUCKET_RENDERS
    } else {
      process.env.S3_BUCKET_RENDERS = originalRendersBucket
    }
  })

  it('uses injected S3_BUCKET_RENDERS', () => {
    process.env.S3_BUCKET_RENDERS = 'custom-renders-bucket'
    expect(getSideloadCacheBucket()).toBe('custom-renders-bucket')
  })

  it('fails when S3_BUCKET_RENDERS is absent or blank', () => {
    delete process.env.S3_BUCKET_RENDERS
    expect(() => getSideloadCacheBucket()).toThrow('Missing S3_BUCKET_RENDERS')
    process.env.S3_BUCKET_RENDERS = '  '
    expect(() => getSideloadCacheBucket()).toThrow('Missing S3_BUCKET_RENDERS')
  })
})

describe('getSourceBucket', () => {
  const originalImagesBucket = process.env.S3_BUCKET_IMAGES

  afterEach(() => {
    if (originalImagesBucket === undefined) {
      delete process.env.S3_BUCKET_IMAGES
    } else {
      process.env.S3_BUCKET_IMAGES = originalImagesBucket
    }
  })

  it('uses injected S3_BUCKET_IMAGES', () => {
    process.env.S3_BUCKET_IMAGES = 'custom-images-bucket'
    expect(getSourceBucket()).toBe('custom-images-bucket')
  })

  it('fails when S3_BUCKET_IMAGES is absent or blank', () => {
    delete process.env.S3_BUCKET_IMAGES
    expect(() => getSourceBucket()).toThrow('Missing S3_BUCKET_IMAGES')
    process.env.S3_BUCKET_IMAGES = '  '
    expect(() => getSourceBucket()).toThrow('Missing S3_BUCKET_IMAGES')
  })
})

describe('getCacheBucket', () => {
  const originalRendersBucket = process.env.S3_BUCKET_RENDERS

  afterEach(() => {
    if (originalRendersBucket === undefined) {
      delete process.env.S3_BUCKET_RENDERS
    } else {
      process.env.S3_BUCKET_RENDERS = originalRendersBucket
    }
  })

  it('uses injected S3_BUCKET_RENDERS', () => {
    process.env.S3_BUCKET_RENDERS = 'custom-renders-bucket'
    expect(getCacheBucket()).toBe('custom-renders-bucket')
  })

  it('fails when S3_BUCKET_RENDERS is absent or blank', () => {
    delete process.env.S3_BUCKET_RENDERS
    expect(() => getCacheBucket()).toThrow('Missing S3_BUCKET_RENDERS')
    process.env.S3_BUCKET_RENDERS = '  '
    expect(() => getCacheBucket()).toThrow('Missing S3_BUCKET_RENDERS')
  })
})
