import { describe, expect, it } from 'vitest'

// Pure-function modules — no HTTP server needed for these imports
import {
  assertEncodablePathSegmentIdentifier,
  assertPathIdentifier,
} from '@/lib/api/client/path-identifiers'

import { returnNullForMissingEntity } from '@/lib/api/return-null-for-missing-entity'

import { isRateLimitError, getRateLimitMessage } from '@/lib/api/rate-limit-error'

import { buildWorkerSecretHeader } from '@/lib/api/worker-secret'

import { ApiError } from '@/lib/api/error'

describe('client-utilities', () => {
  describe('path-identifiers (pure)', () => {
    describe('assertPathIdentifier', () => {
      it('accepts normal identifiers', () => {
        expect(assertPathIdentifier('post-123')).toBe('post-123')
        expect(assertPathIdentifier('some-id')).toBe('some-id')
      })

      it('rejects single dot', () => {
        expect(() => assertPathIdentifier('.')).toThrow('Invalid identifier')
      })

      it('rejects double dot', () => {
        expect(() => assertPathIdentifier('..')).toThrow('Invalid identifier')
      })

      it('rejects forward slash', () => {
        expect(() => assertPathIdentifier('feed/item')).toThrow('Invalid identifier')
      })

      it('rejects backslash', () => {
        expect(() => assertPathIdentifier('feed\\item')).toThrow('Invalid identifier')
      })
    })

    describe('assertEncodablePathSegmentIdentifier', () => {
      it('accepts identifiers with forward slashes (encodable)', () => {
        const id = 'feed-id:https://example.com/item/1'
        expect(assertEncodablePathSegmentIdentifier(id)).toBe(id)
      })

      it('accepts normal identifiers', () => {
        expect(assertEncodablePathSegmentIdentifier('post-123')).toBe('post-123')
      })

      it('rejects single dot', () => {
        expect(() => assertEncodablePathSegmentIdentifier('.')).toThrow('Invalid identifier')
      })

      it('rejects double dot', () => {
        expect(() => assertEncodablePathSegmentIdentifier('..')).toThrow('Invalid identifier')
      })

      it('rejects backslash', () => {
        expect(() => assertEncodablePathSegmentIdentifier('feed\\item')).toThrow(
          'Invalid identifier',
        )
      })
    })
  })

  describe('rate-limit-error (pure)', () => {
    it('isRateLimitError returns true for 429 ApiError', () => {
      const error = new ApiError('Too many requests', 429)
      expect(isRateLimitError(error)).toBe(true)
    })

    it('isRateLimitError returns false for non-429 ApiError', () => {
      const error = new ApiError('Not found', 404)
      expect(isRateLimitError(error)).toBe(false)
    })

    it('isRateLimitError returns false for non-ApiError', () => {
      expect(isRateLimitError(new Error('generic'))).toBe(false)
      expect(isRateLimitError(null)).toBe(false)
      expect(isRateLimitError('string')).toBe(false)
    })

    it('getRateLimitMessage returns seconds message when retry_after is 1', () => {
      const error = new ApiError('Too many requests', 429, { retry_after: 1 })
      expect(getRateLimitMessage(error)).toBe(
        'Too many requests. Please wait 1 second and try again.',
      )
    })

    it('getRateLimitMessage returns plural seconds message when retry_after > 1', () => {
      const error = new ApiError('Too many requests', 429, { retry_after: 30 })
      expect(getRateLimitMessage(error)).toBe(
        'Too many requests. Please wait 30 seconds and try again.',
      )
    })

    it('getRateLimitMessage returns fallback when retry_after is zero', () => {
      const error = new ApiError('Too many requests', 429, { retry_after: 0 })
      expect(getRateLimitMessage(error)).toBe('Too many requests. Please try again later.')
    })

    it('getRateLimitMessage returns fallback when retry_after is missing', () => {
      const error = new ApiError('Too many requests', 429, {})
      expect(getRateLimitMessage(error)).toBe('Too many requests. Please try again later.')
    })

    it('getRateLimitMessage returns fallback when data is null', () => {
      const error = new ApiError('Too many requests', 429)
      expect(getRateLimitMessage(error)).toBe('Too many requests. Please try again later.')
    })
  })

  describe('worker-secret (pure)', () => {
    it('returns empty object when CF_WORKER_SECRET is not set', () => {
      const prev = process.env.CF_WORKER_SECRET
      delete process.env.CF_WORKER_SECRET
      try {
        expect(buildWorkerSecretHeader()).toEqual({})
      } finally {
        if (prev !== undefined) process.env.CF_WORKER_SECRET = prev
      }
    })

    it('returns header object when CF_WORKER_SECRET is set', () => {
      const prev = process.env.CF_WORKER_SECRET
      process.env.CF_WORKER_SECRET = 'test-secret-value'
      try {
        expect(buildWorkerSecretHeader()).toEqual({ 'x-cf-worker-secret': 'test-secret-value' })
      } finally {
        if (prev !== undefined) {
          process.env.CF_WORKER_SECRET = prev
        } else {
          delete process.env.CF_WORKER_SECRET
        }
      }
    })
  })

  describe('return-null-for-missing-entity (pure)', () => {
    it('returns resolved value on success', async () => {
      const result = await returnNullForMissingEntity(Promise.resolve({ id: '1' }))
      expect(result).toEqual({ id: '1' })
    })

    it('returns null for 404 ApiError by default', async () => {
      const error = new ApiError('Not found', 404)
      const result = await returnNullForMissingEntity(Promise.reject(error))
      expect(result).toBeNull()
    })

    it('rethrows 403 ApiError by default', async () => {
      const error = new ApiError('Forbidden', 403)
      await expect(returnNullForMissingEntity(Promise.reject(error))).rejects.toBe(error)
    })

    it('rethrows non-matching ApiError status by default', async () => {
      const error = new ApiError('Server error', 500)
      await expect(returnNullForMissingEntity(Promise.reject(error))).rejects.toBe(error)
    })

    it('rethrows non-ApiError', async () => {
      const error = new Error('generic')
      await expect(returnNullForMissingEntity(Promise.reject(error))).rejects.toBe(error)
    })

    it('returns null for 403 with custom nullStatusCodes option', async () => {
      const error = new ApiError('Forbidden', 403)
      const result = await returnNullForMissingEntity(Promise.reject(error), {
        nullStatusCodes: [403, 404],
      })
      expect(result).toBeNull()
    })

    it('rethrows 404 when not in custom nullStatusCodes', async () => {
      const error = new ApiError('Not found', 404)
      await expect(
        returnNullForMissingEntity(Promise.reject(error), { nullStatusCodes: [410] }),
      ).rejects.toBe(error)
    })
  })
})
