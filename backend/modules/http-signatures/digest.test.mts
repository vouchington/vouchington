import { describe, expect, it } from 'vitest'
import { computeDigest, extractDigestHash, verifyDigest } from './digest.mts'

describe('HTTP Signature digest', () => {
  describe('computeDigest', () => {
    it('returns a SHA-256 prefixed digest for a string body', () => {
      expect(computeDigest('hello world')).toMatch(/^SHA-256=/)
    })

    it('returns a SHA-256 prefixed digest for a Buffer body', () => {
      expect(computeDigest(Buffer.from('hello world', 'utf-8'))).toMatch(/^SHA-256=/)
    })

    it('produces the same digest for a string and its equivalent Buffer', () => {
      const body = 'test body content'
      expect(computeDigest(body)).toBe(computeDigest(Buffer.from(body, 'utf-8')))
    })

    it('produces different digests for different bodies', () => {
      expect(computeDigest('body 1')).not.toBe(computeDigest('body 2'))
    })

    it('handles an empty body', () => {
      expect(computeDigest('')).toMatch(/^SHA-256=/)
    })
  })

  describe('extractDigestHash', () => {
    it('extracts the hash from a valid SHA-256 digest header', () => {
      expect(extractDigestHash('SHA-256=abc123def456')).toBe('abc123def456')
    })

    it('throws on a header without the SHA-256 prefix', () => {
      expect(() => extractDigestHash('MD5=abc123')).toThrow('Invalid Digest header format')
    })

    it('throws on an empty string', () => {
      expect(() => extractDigestHash('')).toThrow('Invalid Digest header format')
    })

    it('throws on SHA-256= with no hash value', () => {
      expect(() => extractDigestHash('SHA-256=')).toThrow('Invalid Digest header format')
    })

    it('extracts a hash containing base64 characters including + / =', () => {
      expect(extractDigestHash('SHA-256=abc+def/ghi=')).toBe('abc+def/ghi=')
    })
  })

  describe('verifyDigest', () => {
    it('returns true for a matching body and digest', () => {
      const body = 'test body'
      expect(verifyDigest(body, computeDigest(body))).toBe(true)
    })

    it('returns false for a mismatched body and digest', () => {
      expect(verifyDigest('different body', computeDigest('original body'))).toBe(false)
    })

    it('returns false for an invalid digest format', () => {
      expect(verifyDigest('body', 'not-a-valid-digest')).toBe(false)
    })

    it('returns false for an empty digest', () => {
      expect(verifyDigest('body', '')).toBe(false)
    })

    it('handles a Buffer body correctly', () => {
      const body = 'buffer test'
      expect(verifyDigest(Buffer.from(body, 'utf-8'), computeDigest(body))).toBe(true)
    })
  })
})
