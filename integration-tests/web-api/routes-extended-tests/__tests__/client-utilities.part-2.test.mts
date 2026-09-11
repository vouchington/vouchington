import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import http from 'node:http'

import serverApp from '../../../../backend/entrypoints/api/index.mts'

import { createTestUser, createTestPost } from '../../../../backend/test-helpers/index.mts'

import { createWebApiTestCookieHeader, listenOnFetchSafeLoopback } from '../../routes.mts'

import type { CookieHeader } from '../../routes-extended.mts'

import { clientFetch } from '@/lib/api/client/raw-fetch'

import { getPaginatedPage } from '@/lib/api/client/paginated'

describe('client-utilities', () => {
  describe('raw-fetch and paginated (HTTP-backed)', () => {
    let backendServer: http.Server
    let previousApiBaseUrl: string | undefined
    let previousPublicApiBaseUrl: string | undefined
    let previousFetch: typeof globalThis.fetch
    let hadWindow: boolean
    let previousWindow: unknown
    let backendBaseUrl: string
    let clientRuntimeActive = false
    let clientCookieValue: string | undefined
    let userCookieHeader: CookieHeader

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

      const user = await createTestUser()
      userCookieHeader = await createWebApiTestCookieHeader(user.id)

      // getPaginatedPage passes searchParams (below) compares a limit:1 page against the
      // unlimited default page, so the feed must contain at least 2 posts regardless of
      // what else is already in the database.
      await createTestPost({ user })
      await createTestPost({ user })
    }, 20_000)

    afterAll(async () => {
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

    it('clientFetch without init calls fetch directly (success path)', async () => {
      const response = await withClientRuntime(() => clientFetch('/api/v1/posts'), userCookieHeader)
      expect(response.ok).toBe(true)
    })

    it('clientFetch with init forwards options', async () => {
      const response = await withClientRuntime(
        () =>
          clientFetch('/api/v1/posts', {
            method: 'GET',
            credentials: 'include',
          }),
        userCookieHeader,
      )
      expect(response.ok).toBe(true)
    })

    it('getPaginatedPage returns results', async () => {
      const result = await withClientRuntime(
        () =>
          getPaginatedPage<{ results: unknown[]; page_info: { has_next_page: boolean } }>(
            '/api/v1/posts',
          ),
        userCookieHeader,
      )
      expect(result).toMatchObject({
        results: expect.any(Array),
        page_info: expect.objectContaining({ has_next_page: expect.any(Boolean) }),
      })
    })

    it('getPaginatedPage passes searchParams', async () => {
      // A dropped/ignored searchParams bug would fall back to the default (larger) page
      // size for both calls; a bare "result is defined" check could never catch that.
      const unlimited = await withClientRuntime(
        () => getPaginatedPage<{ results: unknown[] }>('/api/v1/posts'),
        userCookieHeader,
      )
      const limited = await withClientRuntime(
        () => getPaginatedPage<{ results: unknown[] }>('/api/v1/posts', { limit: 1 }),
        userCookieHeader,
      )
      expect(limited.results.length).toBeLessThanOrEqual(1)
      expect(unlimited.results.length).toBeGreaterThan(limited.results.length)
    })
  })
})
