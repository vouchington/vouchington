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

  it('should handle unsupported MIME types gracefully', () => {
    expect(negotiateFormat('image/gif')).toBe('jpeg')
    expect(negotiateFormat('image/bmp')).toBe('jpeg')
    expect(negotiateFormat('text/html')).toBe('jpeg')
    expect(negotiateFormat('application/json')).toBe('jpeg')
  })
})
