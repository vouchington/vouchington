import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import http from 'node:http'
import serverApp from '../../backend/entrypoints/api/index.mts'
import { listenOnFetchSafeLoopback } from './routes.mts'
import { ApiError } from '@/lib/api/error'
import { isRateLimitError, getRateLimitMessage } from '@/lib/api/rate-limit-error'
import { returnNullForMissingEntity } from '@/lib/api/return-null-for-missing-entity'
import { buildWorkerSecretHeader } from '@/lib/api/worker-secret'
import { clientFetch } from '@/lib/api/client/raw-fetch'
import { recordCommunityAutomodFeedback } from '@/lib/api/client/community-automod'
import { getCommunityAutomodRecentActions } from '@/lib/api/server/community-automod'

describe('web/lib/api utility helpers — integration', () => {
  let backendServer: http.Server
  let backendBaseUrl: string
  let previousApiBaseUrl: string | undefined
  let previousPublicApiBaseUrl: string | undefined
  let previousFetch: typeof globalThis.fetch
  let hadWindow: boolean
  let previousWindow: unknown
  let clientRuntimeActive = false
  let clientCookieValue: string | undefined

  beforeAll(async () => {
    previousApiBaseUrl = process.env.API_BASE_URL
    previousPublicApiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL

    backendServer = http.createServer(serverApp.callback())
    backendBaseUrl = await listenOnFetchSafeLoopback(backendServer)
    process.env.API_BASE_URL = backendBaseUrl
    process.env.NEXT_PUBLIC_API_BASE_URL = backendBaseUrl

    previousFetch = globalThis.fetch
    hadWindow = Object.hasOwn(globalThis, 'window')
    previousWindow = (globalThis as { window?: unknown }).window

    globalThis.fetch = (input, init) => {
      if (!clientRuntimeActive || typeof input !== 'string' || !input.startsWith('/')) {
        return previousFetch(input, init)
      }

      const headers = new Headers(init?.headers)
      if (process.env.CF_WORKER_SECRET) {
        headers.set('X-CF-Worker-Secret', process.env.CF_WORKER_SECRET)
      }
      if (clientCookieValue) {
        headers.set('Cookie', clientCookieValue)
        if ((init?.method ?? 'GET').toUpperCase() !== 'GET') {
          headers.set('Origin', backendBaseUrl)
        }
      }

      return previousFetch(`${backendBaseUrl}${input}`, { ...init, headers })
    }
  }, 15_000)

  afterAll(async () => {
    backendServer.closeAllConnections()
    await new Promise<void>(resolve => {
      backendServer.close(() => resolve())
    })

    if (previousApiBaseUrl === undefined) {
      delete process.env.API_BASE_URL
    } else {
      process.env.API_BASE_URL = previousApiBaseUrl
    }

    if (previousPublicApiBaseUrl === undefined) {
      delete process.env.NEXT_PUBLIC_API_BASE_URL
    } else {
      process.env.NEXT_PUBLIC_API_BASE_URL = previousPublicApiBaseUrl
    }

    globalThis.fetch = previousFetch
    if (hadWindow) {
      ;(globalThis as { window?: unknown }).window = previousWindow
    } else {
      delete (globalThis as { window?: unknown }).window
    }
  }, 15_000)

  async function withClientRuntime<T>(
    run: () => Promise<T>,
    cookieHeader?: Record<string, string>,
  ): Promise<T> {
    clientRuntimeActive = true
    clientCookieValue = cookieHeader?.Cookie
    ;(globalThis as { window?: unknown }).window = {}

    try {
      return await run()
    } finally {
      clientRuntimeActive = false
      clientCookieValue = undefined

      if (hadWindow) {
        ;(globalThis as { window?: unknown }).window = previousWindow
      } else {
        delete (globalThis as { window?: unknown }).window
      }
    }
  }

  // ─── rate-limit-error.ts ─────────────────────────────────────────────────

  describe('isRateLimitError', () => {
    it('returns true for a 429 ApiError', () => {
      const error = new ApiError('Too many requests', 429, null)
      expect(isRateLimitError(error)).toBe(true)
    })

    it('returns false for a non-429 ApiError', () => {
      const error = new ApiError('Not found', 404, null)
      expect(isRateLimitError(error)).toBe(false)
    })

    it('returns false for a plain Error', () => {
      const error = new Error('not an ApiError')
      expect(isRateLimitError(error)).toBe(false)
    })

    it('returns false for null', () => {
      expect(isRateLimitError(null)).toBe(false)
    })
  })

  describe('getRateLimitMessage', () => {
    it('returns singular "second" when retry_after is 1', () => {
      const error = new ApiError('Too many requests', 429, { retry_after: 1 })
      expect(getRateLimitMessage(error)).toBe(
        'Too many requests. Please wait 1 second and try again.',
      )
    })

    it('returns plural "seconds" when retry_after is greater than 1', () => {
      const error = new ApiError('Too many requests', 429, { retry_after: 5 })
      expect(getRateLimitMessage(error)).toBe(
        'Too many requests. Please wait 5 seconds and try again.',
      )
    })

    it('returns generic message when retry_after is 0', () => {
      const error = new ApiError('Too many requests', 429, { retry_after: 0 })
      expect(getRateLimitMessage(error)).toBe('Too many requests. Please try again later.')
    })

    it('returns generic message when retry_after is negative', () => {
      const error = new ApiError('Too many requests', 429, { retry_after: -1 })
      expect(getRateLimitMessage(error)).toBe('Too many requests. Please try again later.')
    })

    it('returns generic message when retry_after is not a number', () => {
      const error = new ApiError('Too many requests', 429, { retry_after: 'soon' })
      expect(getRateLimitMessage(error)).toBe('Too many requests. Please try again later.')
    })

    it('returns generic message when data is null', () => {
      const error = new ApiError('Too many requests', 429, null)
      expect(getRateLimitMessage(error)).toBe('Too many requests. Please try again later.')
    })

    it('returns generic message when data has no retry_after field', () => {
      const error = new ApiError('Too many requests', 429, { message: 'rate limited' })
      expect(getRateLimitMessage(error)).toBe('Too many requests. Please try again later.')
    })
  })

  // ─── return-null-for-missing-entity.ts ───────────────────────────────────

  describe('returnNullForMissingEntity', () => {
    it('passes through a resolved value unchanged', async () => {
      const value = { id: 'abc', name: 'test' }
      const result = await returnNullForMissingEntity(Promise.resolve(value))
      expect(result).toEqual(value)
    })

    it('returns null for a 404 ApiError (default nullStatusCodes)', async () => {
      const error = new ApiError('Not found', 404, null)
      expect(await returnNullForMissingEntity(Promise.reject(error))).toBeNull()
    })

    it('rethrows a 403 ApiError by default', async () => {
      const error = new ApiError('Forbidden', 403, null)
      await expect(returnNullForMissingEntity(Promise.reject(error))).rejects.toThrow(error)
    })

    it('rethrows an ApiError whose status is not in the default nullStatusCodes', async () => {
      const error = new ApiError('Unauthorized', 401, null)
      await expect(returnNullForMissingEntity(Promise.reject(error))).rejects.toThrow(error)
    })

    it('rethrows a non-ApiError', async () => {
      const error = new Error('network error')
      await expect(returnNullForMissingEntity(Promise.reject(error))).rejects.toThrow(error)
    })

    it('returns null for a 403 status in custom nullStatusCodes', async () => {
      const error = new ApiError('Forbidden', 403, null)
      expect(
        await returnNullForMissingEntity(Promise.reject(error), { nullStatusCodes: [403, 404] }),
      ).toBeNull()
    })

    it('rethrows when status is not in custom nullStatusCodes', async () => {
      const error = new ApiError('Not found', 404, null)
      await expect(
        returnNullForMissingEntity(Promise.reject(error), { nullStatusCodes: [403] }),
      ).rejects.toThrow(error)
    })

    it('returns null for a real 404 from the backend (missing entity)', async () => {
      // getPost internally uses returnNullForMissingEntity; this confirms the
      // real error shape from the backend flows through correctly.
      const { getPost } = await import('@/lib/api/server/posts')
      const result = await getPost(`missing-entity-${randomUUID()}`)
      expect(result).toBeNull()
    })
  })

  // ─── worker-secret.ts ────────────────────────────────────────────────────

  describe('buildWorkerSecretHeader', () => {
    it('returns an empty object when CF_WORKER_SECRET is not set', () => {
      const original = process.env.CF_WORKER_SECRET
      try {
        delete process.env.CF_WORKER_SECRET
        expect(buildWorkerSecretHeader()).toEqual({})
      } finally {
        if (original !== undefined) {
          process.env.CF_WORKER_SECRET = original
        }
      }
    })

    it('returns the x-cf-worker-secret header when CF_WORKER_SECRET is set', () => {
      const original = process.env.CF_WORKER_SECRET
      const secret = `test-secret-${randomUUID()}`
      try {
        process.env.CF_WORKER_SECRET = secret
        expect(buildWorkerSecretHeader()).toEqual({ 'x-cf-worker-secret': secret })
      } finally {
        if (original === undefined) {
          delete process.env.CF_WORKER_SECRET
        } else {
          process.env.CF_WORKER_SECRET = original
        }
      }
    })
  })

  // ─── client/raw-fetch.ts ─────────────────────────────────────────────────

  describe('clientFetch', () => {
    it('fetches without an init argument', async () => {
      const response = await withClientRuntime(() => clientFetch('/api/v1/topics'))
      expect(response.ok).toBe(true)
    })

    it('fetches with an init argument', async () => {
      const response = await withClientRuntime(() =>
        clientFetch('/api/v1/topics', { method: 'GET' }),
      )
      expect(response.ok).toBe(true)
    })
  })

  describe('community automod helpers', () => {
    it('passes recent-action search options to the server API helper', async () => {
      await expect(
        getCommunityAutomodRecentActions('missing-community', {
          searchParams: { source: 'openai_omni', limit: 10 },
        }),
      ).rejects.toMatchObject({ status: 401 })
    })

    it('posts automod feedback through the client API helper', async () => {
      await expect(
        withClientRuntime(() =>
          recordCommunityAutomodFeedback('missing-community', 'openai_omni:post-id', {
            outcome: 'false_positive',
            action: 'reinstate',
          }),
        ),
      ).rejects.toMatchObject({ status: 401 })
    })
  })
})
