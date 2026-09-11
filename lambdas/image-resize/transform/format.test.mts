import { describe, it, expect } from 'vitest'
import { negotiateFormat } from './format.mts'

describe('negotiateFormat', () => {
  it('should return explicitly requested format', () => {
    expect(negotiateFormat('image/webp', 'jpeg')).toBe('jpeg')
    expect(negotiateFormat('image/webp', 'png')).toBe('png')
    expect(negotiateFormat('image/webp', 'webp')).toBe('webp')
    expect(negotiateFormat('image/webp', 'avif')).toBe('avif')
  })

  it('should return default format when no Accept header and no requested format', () => {
    expect(negotiateFormat()).toBe('jpeg')
    expect(negotiateFormat()).toBe('jpeg')
  })

  it('should negotiate AVIF when explicitly accepted', () => {
    expect(negotiateFormat('image/avif')).toBe('avif')
  })

  it('should negotiate WebP when explicitly accepted', () => {
    expect(negotiateFormat('image/webp')).toBe('webp')
  })

  it('should negotiate PNG when explicitly accepted', () => {
    expect(negotiateFormat('image/png')).toBe('png')
  })

  it('should negotiate JPEG when explicitly accepted', () => {
    expect(negotiateFormat('image/jpeg')).toBe('jpeg')
  })

  it('should respect quality factors (q-values)', () => {
    // PNG with higher quality should win
    expect(negotiateFormat('image/png;q=0.9, image/jpeg;q=0.5')).toBe('png')

    // JPEG with higher quality should win
    expect(negotiateFormat('image/png;q=0.3, image/jpeg;q=0.8')).toBe('jpeg')

    // WebP with higher quality should win
    expect(negotiateFormat('image/webp;q=1.0, image/avif;q=0.5')).toBe('webp')
  })

  it('should handle multiple formats without quality factors', () => {
    // Should return first supported format in order of preference
    expect(negotiateFormat('image/avif, image/webp, image/png')).toBe('avif')
    expect(negotiateFormat('image/webp, image/png, image/jpeg')).toBe('webp')
  })

  it('should handle wildcard Accept headers', () => {
    // image/* should match and return first supported format (avif)
    expect(negotiateFormat('image/*')).toBe('avif')

    // */* should match and return first supported format (avif)
    expect(negotiateFormat('*/*')).toBe('avif')
  })

  it('should handle unsupported MIME types gracefully', () => {
    expect(negotiateFormat('image/gif')).toBe('jpeg')
    expect(negotiateFormat('image/bmp')).toBe('jpeg')
    expect(negotiateFormat('text/html')).toBe('jpeg')
    expect(negotiateFormat('application/json')).toBe('jpeg')
  })

  it('should handle malformed Accept headers', () => {
    expect(negotiateFormat('')).toBe('jpeg')
    expect(negotiateFormat('invalid')).toBe('jpeg')
    expect(negotiateFormat(';;;')).toBe('jpeg')
  })

  it('should handle complex Accept headers from browsers', () => {
    // Chrome-like Accept header
    expect(
      negotiateFormat('image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'),
    ).toBe('avif')

    // Firefox-like Accept header
    expect(negotiateFormat('image/webp,*/*')).toBe('webp')

    // Safari-like Accept header (no AVIF/WebP support)
    expect(negotiateFormat('image/png,image/svg+xml,image/*;q=0.8,video/*;q=0.8,*/*;q=0.5')).toBe(
      'png',
    )
  })

  it('should handle case sensitivity', () => {
    expect(negotiateFormat('IMAGE/JPEG')).toBe('jpeg')
    expect(negotiateFormat('Image/WebP')).toBe('webp')
    expect(negotiateFormat('image/PNG')).toBe('png')
  })

  it('should prioritize AVIF over WebP when both have same quality', () => {
    expect(negotiateFormat('image/avif, image/webp')).toBe('avif')
  })

  it('should handle whitespace in Accept header', () => {
    expect(negotiateFormat('  image/jpeg  ')).toBe('jpeg')
    expect(negotiateFormat('image/webp  ,  image/png')).toBe('webp')
  })
})
