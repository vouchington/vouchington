import { describe, expect, it } from 'vitest'

// Pure-function modules — no HTTP server needed for these imports
import { getRateLimitMessage } from '@/lib/api/rate-limit-error'

import { buildWorkerSecretHeader } from '@/lib/api/worker-secret'

import { ApiError } from '@vouchington/api-client'

describe('client-utilities', () => {
  describe('rate-limit-error (pure)', () => {
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
})
