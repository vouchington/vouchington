import { describe, expect, it, vi } from 'vitest'

const fetchGoogleOidcJwks = vi.hoisted(() =>
  vi.fn<(url: string, timeoutMs: number) => Promise<Response>>(),
)
vi.mock<typeof import('@modules/utils')>(import('@modules/utils'), async () => {
  const actual = await vi.importActual<typeof import('@modules/utils')>('@modules/utils')
  return { ...actual, fetchWithTimeoutSimple: fetchGoogleOidcJwks }
})

import { cacheValkeyClient } from '@data-stores/valkey/clients'
import { ValkeyCache } from '@data-stores/valkey/cache'
import {
  getCachedGoogleOidcTrustMaterial,
  googleOidcValkeyTrustStore,
  refreshConfiguredGoogleOidcTrustMaterial,
} from './jwks-cache.mts'
import type { GoogleOidcPublicJwk } from './types.mts'

const GOOGLE_OIDC_JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs'
const GOOGLE_OIDC_TRUST_TTL_MS = 6 * 60 * 60 * 1000

type GoogleOidcCachedKeys = Awaited<ReturnType<typeof refreshConfiguredGoogleOidcTrustMaterial>>
type GoogleOidcTrustStore = Parameters<typeof getCachedGoogleOidcTrustMaterial>[0]['store']

const trustStoreCache = new ValkeyCache<{ key: string }>({
  prefix: 'memberships-google-oidc-trust',
  ttlSeconds: 6 * 60 * 60,
  keySerializer: value => value.key,
})

const utcBoundaries = [
  ['leap-day midnight', '2024-02-29T23:59:59.999Z'],
  ['March midnight', '2024-03-01T00:00:00.001Z'],
  ['year-end midnight', '2024-12-31T23:59:59.999Z'],
  ['New Year midnight', '2025-01-01T00:00:00.001Z'],
] as const

describe('Google OIDC JWKS cache', () => {
  it('persists and reloads the Valkey trust snapshot with its expiry', async () => {
    const key = trustStoreCache.getKey({ key: 'current' })
    const value = makeCachedKeys()
    try {
      await cacheValkeyClient.unlink([key])
      await expect(googleOidcValkeyTrustStore.load()).resolves.toBeNull()

      await googleOidcValkeyTrustStore.save(value)

      await expect(googleOidcValkeyTrustStore.load()).resolves.toEqual(value)
    } finally {
      await cacheValkeyClient.unlink([key])
    }
  })

  it.each(utcBoundaries)(
    'refreshes only RSA keys with exact expiry at %s',
    async (_name, instant) => {
      const key = trustStoreCache.getKey({ key: 'current' })
      const now = new Date(instant)
      vi.useFakeTimers({ toFake: ['Date'], now })
      fetchGoogleOidcJwks.mockResolvedValue(
        Response.json({
          keys: [makeJwk(), { kid: 'not-rsa', kty: 'EC', n: 'n', e: 'AQAB' }, { kty: 'RSA' }, null],
        }),
      )
      try {
        await cacheValkeyClient.unlink([key])
        const refreshed = await refreshConfiguredGoogleOidcTrustMaterial()

        expect(fetchGoogleOidcJwks).toHaveBeenCalledWith(GOOGLE_OIDC_JWKS_URL, 10_000)
        expect(refreshed.keysById).toEqual({ 'synthetic-key': makeJwk() })
        expect(refreshed.expiresAt).toEqual(new Date(now.getTime() + GOOGLE_OIDC_TRUST_TTL_MS))
        await expect(googleOidcValkeyTrustStore.load()).resolves.toEqual(refreshed)
      } finally {
        vi.useRealTimers()
        fetchGoogleOidcJwks.mockReset()
        await cacheValkeyClient.unlink([key])
      }
    },
  )

  it.each([
    [
      'an HTTP failure',
      new Response(null, { status: 503 }),
      'Google OIDC JWKS refresh failed with 503',
    ],
    ['a malformed response', Response.json({}), 'Google OIDC JWKS response is malformed'],
    [
      'a response without RSA signing keys',
      Response.json({ keys: [] }),
      'Google OIDC JWKS response has no RSA signing keys',
    ],
  ])('rejects %s', async (_description, response, message) => {
    const key = trustStoreCache.getKey({ key: 'current' })
    fetchGoogleOidcJwks.mockResolvedValue(response)
    try {
      await cacheValkeyClient.unlink([key])
      await expect(refreshConfiguredGoogleOidcTrustMaterial()).rejects.toThrow(message)
      await expect(googleOidcValkeyTrustStore.load()).resolves.toBeNull()
    } finally {
      fetchGoogleOidcJwks.mockReset()
      await cacheValkeyClient.unlink([key])
    }
  })

  it.each(utcBoundaries)(
    'returns configured material only before exact expiry at %s',
    async (_name, instant) => {
      const now = new Date(instant)
      vi.useFakeTimers({ toFake: ['Date'], now })
      try {
        const store = makeTrustStore(makeCachedKeys())
        const options = {
          store,
          issuer: 'https://accounts.google.com',
          audience: 'https://voucha.example/google-play-rtdn',
          serviceAccountEmail: 'google-pubsub@voucha.example',
        }

        await expect(getCachedGoogleOidcTrustMaterial(options)).resolves.toMatchObject({
          issuer: options.issuer,
          audience: options.audience,
          serviceAccountEmail: options.serviceAccountEmail,
          keysById: { 'synthetic-key': makeJwk() },
        })

        store.value = null
        await expect(getCachedGoogleOidcTrustMaterial(options)).resolves.toBeNull()

        store.value = { ...makeCachedKeys(), expiresAt: now }
        const expiresAt = store.value.expiresAt.getTime()
        vi.setSystemTime(new Date(expiresAt - 1))
        await expect(getCachedGoogleOidcTrustMaterial(options)).resolves.toMatchObject({
          issuer: options.issuer,
          audience: options.audience,
          serviceAccountEmail: options.serviceAccountEmail,
          keysById: { 'synthetic-key': makeJwk() },
        })
        vi.setSystemTime(new Date(expiresAt))
        await expect(getCachedGoogleOidcTrustMaterial(options)).resolves.toBeNull()
        vi.setSystemTime(new Date(expiresAt + 1))
        await expect(getCachedGoogleOidcTrustMaterial(options)).resolves.toBeNull()
      } finally {
        vi.useRealTimers()
      }
    },
  )
})

function makeJwk(): GoogleOidcPublicJwk {
  return { kid: 'synthetic-key', kty: 'RSA', n: 'synthetic-modulus', e: 'AQAB' }
}

function makeCachedKeys(): GoogleOidcCachedKeys {
  return {
    keysById: { 'synthetic-key': makeJwk() },
    expiresAt: new Date(Date.now() + 60_000),
  }
}

function makeTrustStore(value: GoogleOidcCachedKeys | null = null): GoogleOidcTrustStore & {
  saved: GoogleOidcCachedKeys | null
  value: GoogleOidcCachedKeys | null
} {
  return {
    value,
    saved: null,
    async load() {
      return this.value
    },
    async save(next) {
      this.saved = next
      this.value = next
    },
  }
}
