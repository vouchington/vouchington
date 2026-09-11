import { describe, it, expect } from 'vitest'
import { signPath, verifyPathSignature, parseSigningKeys, buildSideloadImageUrl } from './index.mts'
import { signPathWithKey, verifyPathWithKey } from './hmac.mts'
import { TEST_SIDELOAD_SIGNING_KEY } from './test-key.mts'

const KEY_A = TEST_SIDELOAD_SIGNING_KEY
const KEY_B = 'cafecafecafecafecafecafecafecafecafecafecafecafecafecafecafecafe'

describe('@ts-shared/url-signing', () => {
  it('signPath produces a 64-char hex string', () => {
    const sig = signPath('/sideload/abc123', [KEY_A])
    expect(sig).toMatch(/^[0-9a-f]{64}$/)
  })

  it('verifyPathSignature returns true for valid signature', () => {
    const path = '/sideload/abc123'
    const sig = signPath(path, [KEY_A])
    expect(verifyPathSignature(path, sig, [KEY_A])).toBe(true)
  })

  it('verifyPathSignature returns false for tampered path', () => {
    const sig = signPath('/sideload/abc123', [KEY_A])
    expect(verifyPathSignature('/sideload/different', sig, [KEY_A])).toBe(false)
  })

  it('verifyPathSignature returns false for wrong key', () => {
    const sig = signPath('/sideload/abc123', [KEY_A])
    expect(verifyPathSignature('/sideload/abc123', sig, [KEY_B])).toBe(false)
  })

  it('key rotation: sign with A, verify with [B, A] succeeds', () => {
    const path = '/sideload/abc123'
    const sig = signPath(path, [KEY_A])
    expect(verifyPathSignature(path, sig, [KEY_B, KEY_A])).toBe(true)
  })

  it('key rotation: sign with A, verify with [B] only fails', () => {
    const path = '/sideload/abc123'
    const sig = signPath(path, [KEY_A])
    expect(verifyPathSignature(path, sig, [KEY_B])).toBe(false)
  })

  it('signature is deterministic', () => {
    const path = '/sideload/abc123'
    expect(signPath(path, [KEY_A])).toBe(signPath(path, [KEY_A]))
  })

  it('different paths produce different signatures', () => {
    expect(signPath('/sideload/abc', [KEY_A])).not.toBe(signPath('/sideload/def', [KEY_A]))
  })

  it('different keys produce different signatures', () => {
    const path = '/sideload/abc123'
    expect(signPath(path, [KEY_A])).not.toBe(signPath(path, [KEY_B]))
  })

  it('parseSigningKeys parses comma-separated keys', () => {
    expect(parseSigningKeys(`${KEY_A},${KEY_B}`)).toEqual([KEY_A, KEY_B])
  })

  it('parseSigningKeys trims whitespace', () => {
    expect(parseSigningKeys(` ${KEY_A} , ${KEY_B} `)).toEqual([KEY_A, KEY_B])
  })

  it('parseSigningKeys skips empty entries', () => {
    expect(parseSigningKeys(`${KEY_A},,${KEY_B}`)).toEqual([KEY_A, KEY_B])
  })

  it('parseSigningKeys returns [] for undefined', () => {
    expect(parseSigningKeys(undefined)).toEqual([])
  })

  it('parseSigningKeys treats placeholder values as missing', () => {
    expect(parseSigningKeys('PLACEHOLDER')).toEqual([])
    expect(parseSigningKeys(`${KEY_A}, PLACEHOLDER, ${KEY_B}`)).toEqual([KEY_A, KEY_B])
  })

  it('dev mode: no keys → signPath returns empty string', () => {
    expect(signPath('/sideload/abc123', [])).toBe('')
  })

  it('dev mode: no keys → verifyPathSignature with empty sig returns true', () => {
    expect(verifyPathSignature('/sideload/abc123', '', [])).toBe(true)
  })

  describe('buildSideloadImageUrl', () => {
    const imageOrigin = 'https://images.example.com'

    it('returns a /sideload/ path for an http URL', () => {
      const result = buildSideloadImageUrl('http://example.com/img.jpg', {
        imageOrigin,
        width: 400,
        signingKeys: [],
      })
      expect(result).toMatch(/^https:\/\/images\.example\.com\/sideload\//)
    })

    it('returns a /sideload/ path for an https URL', () => {
      const result = buildSideloadImageUrl('https://example.com/img.jpg', {
        imageOrigin,
        width: 400,
        signingKeys: [],
      })
      expect(result).toMatch(/^https:\/\/images\.example\.com\/sideload\//)
    })

    it('includes ?w= query param with given width', () => {
      const result = buildSideloadImageUrl('https://example.com/img.jpg', {
        imageOrigin,
        width: 400,
        signingKeys: [],
      })
      expect(result).toContain('w=400')
    })

    it('includes &q= query param when quality is provided', () => {
      const result = buildSideloadImageUrl('https://example.com/img.jpg', {
        imageOrigin,
        width: 400,
        signingKeys: [],
        quality: 75,
      })
      expect(result).toContain('q=75')
    })

    it('omits q param when quality is not provided', () => {
      const result = buildSideloadImageUrl('https://example.com/img.jpg', {
        imageOrigin,
        width: 400,
        signingKeys: [],
      })
      expect(result).not.toContain('q=')
    })

    it('includes &sig= when signing keys are provided', () => {
      const result = buildSideloadImageUrl('https://example.com/img.jpg', {
        imageOrigin,
        width: 400,
        signingKeys: [TEST_SIDELOAD_SIGNING_KEY],
      })
      expect(result).toMatch(/&sig=[0-9a-f]{64}$/)
    })

    it('omits &sig= when no signing keys', () => {
      const result = buildSideloadImageUrl('https://example.com/img.jpg', {
        imageOrigin,
        width: 400,
        signingKeys: [],
      })
      expect(result).not.toContain('sig=')
    })

    it('base64url-encodes the original URL in the path', () => {
      const url = 'https://example.com/img.jpg'
      const encoded = Buffer.from(url, 'utf8').toString('base64url')
      const result = buildSideloadImageUrl(url, { imageOrigin, width: 400, signingKeys: [] })
      expect(result).toContain(`/sideload/${encoded}`)
    })

    it('returns null for empty string', () => {
      expect(buildSideloadImageUrl('', { imageOrigin, width: 400, signingKeys: [] })).toBeNull()
    })

    it('returns null for whitespace-only string', () => {
      expect(buildSideloadImageUrl('   ', { imageOrigin, width: 400, signingKeys: [] })).toBeNull()
    })

    it('returns null for protocol-relative URL (//)', () => {
      expect(
        buildSideloadImageUrl('//example.com/img.jpg', {
          imageOrigin,
          width: 400,
          signingKeys: [],
        }),
      ).toBeNull()
    })

    it('returns null for a malformed absolute HTTP URL', () => {
      const malformed = 'https://[invalid'
      const result = buildSideloadImageUrl(malformed, {
        imageOrigin,
        width: 400,
        signingKeys: [],
      })
      expect(result).toBeNull()
    })

    it('returns null for already-proxied /sideload/ URL', () => {
      expect(
        buildSideloadImageUrl('/sideload/abc123?w=400', {
          imageOrigin,
          width: 400,
          signingKeys: [],
        }),
      ).toBeNull()
    })

    it('returns null for an absolute sideload URL on the exact normalized image origin', () => {
      expect(
        buildSideloadImageUrl('https://images.example.com/sideload/abc123?w=400', {
          imageOrigin: 'https://images.example.com/',
          width: 400,
          signingKeys: [],
        }),
      ).toBeNull()
      expect(
        buildSideloadImageUrl('https://images.example.com/sideload', {
          imageOrigin: 'https://images.example.com/',
          width: 400,
          signingKeys: [],
        }),
      ).toBeNull()
    })

    it('does not treat a hostile lookalike image origin as already proxied', () => {
      const hostile = 'https://images.example.com.evil.test/sideload/abc123?w=400'
      const result = buildSideloadImageUrl(hostile, {
        imageOrigin: 'https://images.example.com/',
        width: 400,
        signingKeys: [],
      })
      expect(result).not.toBeNull()
      expect(result).toContain(Buffer.from(hostile).toString('base64url'))
    })

    it('normalizes a trailing slash when building a new proxy URL', () => {
      const result = buildSideloadImageUrl('https://source.example/image.jpg', {
        imageOrigin: 'https://images.example.com/',
        width: 400,
        signingKeys: [],
      })
      expect(result).toMatch(/^https:\/\/images\.example\.com\/sideload\//)
    })

    it('returns null for relative URL', () => {
      expect(
        buildSideloadImageUrl('/img.jpg', { imageOrigin, width: 400, signingKeys: [] }),
      ).toBeNull()
    })

    it('returns null for data: URL', () => {
      expect(
        buildSideloadImageUrl('data:image/png;base64,abc', {
          imageOrigin,
          width: 400,
          signingKeys: [],
        }),
      ).toBeNull()
    })

    it('trims surrounding whitespace before checking', () => {
      const result = buildSideloadImageUrl('  https://example.com/img.jpg  ', {
        imageOrigin,
        width: 400,
        signingKeys: [],
      })
      expect(result).toMatch(/^https:\/\/images\.example\.com\/sideload\//)
    })

    it('handles exceptions when signingKeys is not iterable', () => {
      const result = buildSideloadImageUrl('https://example.com/img.jpg', {
        imageOrigin,
        width: 400,
        signingKeys: null as any,
      })
      expect(result).not.toContain('sig=')
      expect(result).toMatch(/^https:\/\/images\.example\.com\/sideload\//)
    })
  })

  describe('hmac direct tests', () => {
    it('signPathWithKey throws error on invalid key format', () => {
      expect(() => signPathWithKey('/path', 'invalid-key')).toThrow(
        'BUG: VOUCHA_SIDELOAD_SIGNING_KEYS must be 64 hex characters (32 bytes)',
      )
    })

    it('verifyPathWithKey returns false when signature contains invalid hex characters', () => {
      const invalidSig = 'g'.repeat(64)
      expect(verifyPathWithKey('/path', invalidSig, KEY_A)).toBe(false)
    })

    it.each(['', 'a', 'a'.repeat(63), 'a'.repeat(65), 'not-hex'])(
      'verifyPathWithKey returns false for malformed signature %j',
      signature => {
        expect(verifyPathWithKey('/path', signature, KEY_A)).toBe(false)
      },
    )

    it('preserves the local invalid-key error contract while delegating HMAC mechanics', () => {
      expect(() => verifyPathWithKey('/path', 'a'.repeat(64), 'invalid-key')).toThrow(
        'BUG: VOUCHA_SIDELOAD_SIGNING_KEYS must be 64 hex characters (32 bytes)',
      )
    })
  })
})
