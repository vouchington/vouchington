import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import {
  closeWebApiClientRuntime,
  createLoopbackClientFetch,
  listenOnFetchSafeLoopback,
  withWebApiClientRuntime,
} from 'vouchington-tooling/integration-test-helpers'

import http from 'node:http'

import serverApp from '../../../../backend/entrypoints/api/index.mts'

import { createTestUser, createTestPost } from '../../../../backend/test-helpers/index.mts'

import {
  createWebApiTestServer,
  buildWebApiTestProxyHeaders,
  createWebApiTestCookieHeader,
} from '../../routes.mts'

import type { CookieHeader } from '../../routes-extended.mts'

import { clientFetch } from '@/test-helpers/api-fixture-fetch'

import { getPaginatedPage } from '@/lib/api/client/paginated'

describe('client-utilities', () => {
  describe('raw-fetch and paginated (HTTP-backed)', () => {
    let backendServer: http.Server
    let previousFetch: typeof globalThis.fetch
    let backendBaseUrl: string
    let clientRuntimeActive = false
    let clientCookieValue: string | undefined
    let userCookieHeader: CookieHeader

    beforeAll(async () => {
      backendServer = createWebApiTestServer(serverApp.callback())
      backendBaseUrl = await listenOnFetchSafeLoopback(backendServer)
      vi.stubEnv('API_BASE_URL', backendBaseUrl)
      vi.stubEnv('NEXT_PUBLIC_API_BASE_URL', backendBaseUrl)

      previousFetch = globalThis.fetch
      globalThis.fetch = createLoopbackClientFetch({
        baseUrl: backendBaseUrl,
        previousFetch,
        isActive: () => clientRuntimeActive,
        getCookie: () => clientCookieValue,
        buildHeaders: buildWebApiTestProxyHeaders,
        extraHeader: {
          name: 'X-CF-Worker-Secret',
          value: process.env.CF_WORKER_SECRET,
          mode: 'always',
        },
      })

      const user = await createTestUser()
      userCookieHeader = await createWebApiTestCookieHeader(user.id)

      // getPaginatedPage passes searchParams (below) compares a limit:1 page against the
      // unlimited default page, so the feed must contain at least 2 posts regardless of
      // what else is already in the database.
      await createTestPost({ user })
      await createTestPost({ user })
    })

    afterAll(() =>
      closeWebApiClientRuntime({
        backendServer,
        previousFetch,
      }),
    )

    function withClientRuntime<T>(
      run: () => Promise<T>,
      cookieHeader?: Record<string, string>,
    ): Promise<T> {
      return withWebApiClientRuntime({
        cookieHeader,
        setActive: (active, cookie) => {
          clientRuntimeActive = active
          clientCookieValue = cookie
        },
        run,
      })
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
