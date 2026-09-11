import { describe, it, expect } from 'vitest'
import { sha256 } from './hash.mts'

describe('sha256', () => {
  it('should generate SHA256 hash', () => {
    const input = 'https://example.com/image.jpg'
    const hash = sha256(input)

    expect(hash).toBeDefined()
    expect(typeof hash).toBe('string')
    expect(hash.length).toBe(64) // SHA256 hex is 64 characters
  })

  it('should generate consistent hashes for same input', () => {
    const input = 'https://example.com/image.jpg'
    const hash1 = sha256(input)
    const hash2 = sha256(input)

    expect(hash1).toBe(hash2)
  })

  it('should generate different hashes for different inputs', () => {
    const input1 = 'https://example.com/image1.jpg'
    const input2 = 'https://example.com/image2.jpg'
    const hash1 = sha256(input1)
    const hash2 = sha256(input2)

    expect(hash1).not.toBe(hash2)
  })

  it('should handle empty string', () => {
    const hash = sha256('')

    expect(hash).toBeDefined()
    expect(typeof hash).toBe('string')
    expect(hash.length).toBe(64)
  })

  it('should handle URLs with query parameters', () => {
    const input = 'https://example.com/image.jpg?v=123&quality=high'
    const hash = sha256(input)

    expect(hash).toBeDefined()
    expect(hash.length).toBe(64)
  })

  it('should handle URLs with special characters', () => {
    const input = 'https://example.com/path/to/image-file_v2.0.jpg'
    const hash = sha256(input)

    expect(hash).toBeDefined()
    expect(hash.length).toBe(64)
  })

  it('should be case-sensitive', () => {
    const input1 = 'https://example.com/Image.jpg'
    const input2 = 'https://example.com/image.jpg'
    const hash1 = sha256(input1)
    const hash2 = sha256(input2)

    expect(hash1).not.toBe(hash2)
  })

  it('should return hex-encoded string', () => {
    const input = 'test'
    const hash = sha256(input)

    // Should only contain hex characters (0-9, a-f)
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
  })
})
