import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mintUuidv7 as mintUUIDv7 } from '@vouchington/session-jwt'
import worker from '../index.mts'
import { createSignedDeviceJwt, createSignedSessionJwt } from '../../test-helpers/jwt-fixtures.mts'
import {
  createContext,
  restoreGlobals,
  setupMemoryCaches,
} from '../../test-helpers/src/mock-env.mts'
import { requiredMockCall } from '../../test-helpers/src/required-mock-call.mts'
import type { Env } from '../types.mts'

describe('worker fetch handler — embedded thread route caching', () => {
  beforeEach(() => {
    setupMemoryCaches()
  })

  afterEach(() => {
    restoreGlobals()
    vi.restoreAllMocks()
  })

  it.each(['/api/v1/posts/comment-abc/ancestors', '/api/v1/posts/comment-abc/descendants'])(
    'caches anonymous %s responses and bypasses authenticated requests',
    async pathname => {
      const fetchSpy = vi.fn<VitestLooseMock>((request: Request) =>
        Promise.resolve(
          new Response('origin', {
            headers: {
              'cache-control': request.headers.get('cookie') ? 'private, no-store' : 'public',
            },
          }),
        ),
      )
      globalThis.fetch = fetchSpy as unknown as typeof fetch

      const env: Env = {
        BACKEND_ORIGIN: 'https://backend.example.com',
        ANON_CACHE_TTL_SECONDS: '30',
      }
      const anonymousContext = createContext(env)
      const anonymousDispatch = vi.spyOn(anonymousContext.exports.CachedOrigin, 'fetch')
      const anonymousDid = mintUUIDv7()
      const anonymousDeviceToken = await createSignedDeviceJwt({ did: anonymousDid })
      const anonymousSessionToken = await createSignedSessionJwt({
        did: anonymousDid,
        uid: null,
        sid: mintUUIDv7(),
      })
      const anonymousResponse = await worker.fetch(
        new Request(`https://voucha.ai${pathname}`, {
          headers: { cookie: `dt=${anonymousDeviceToken}; st=${anonymousSessionToken}` },
        }),
        env,
        anonymousContext,
      )

      expect(anonymousResponse.headers.get('x-voucha-cache')).toBe('DISPATCHED')
      expect(anonymousResponse.headers.get('set-cookie')).toBeNull()
      expect(anonymousResponse.headers.get('cache-control')).toBe(
        'public, max-age=30, stale-while-revalidate=60, stale-if-error=86400',
      )
      const [, anonymousInit] = requiredMockCall(anonymousDispatch.mock.calls, 0)
      expect(anonymousInit.props.audience).toBe('anon')

      const did = mintUUIDv7()
      const deviceToken = await createSignedDeviceJwt({ did })
      const sessionToken = await createSignedSessionJwt({
        did,
        uid: mintUUIDv7(),
        sid: mintUUIDv7(),
      })
      const authenticatedContext = createContext(env)
      const authenticatedDispatch = vi.spyOn(authenticatedContext.exports.CachedOrigin, 'fetch')
      const authenticatedResponse = await worker.fetch(
        new Request(`https://voucha.ai${pathname}`, {
          headers: { cookie: `st=${sessionToken}; dt=${deviceToken}` },
        }),
        env,
        authenticatedContext,
      )

      expect(authenticatedResponse.headers.get('x-voucha-cache')).toBe('BYPASS')
      expect(authenticatedResponse.headers.get('cache-control')).toBe('private, no-store')
      expect(authenticatedDispatch).not.toHaveBeenCalled()
    },
  )
})
