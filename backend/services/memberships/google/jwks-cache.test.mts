import { describe, expect, it } from 'vitest'
import { cacheValkeyClient } from '@data-stores/valkey/clients'
import { ValkeyCache } from '@data-stores/valkey/cache'
import {
  getCachedGoogleOidcTrustMaterial,
  googleOidcValkeyTrustStore,
  refreshGoogleOidcTrustMaterial,
  type GoogleOidcCachedKeys,
  type GoogleOidcTrustStore,
} from './jwks-cache.mts'
import type { GoogleOidcPublicJwk } from './types.mts'

const trustStoreCache = new ValkeyCache<{ key: string }>({
  prefix: 'memberships-google-oidc-trust',
  ttlSeconds: 6 * 60 * 60,
  keySerializer: value => value.key,
})

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

  it('refreshes only RSA keys and persists the configured expiry', async () => {
    const store = makeTrustStore()
    const calls: Array<[string, number]> = []
    const beforeRefresh = Date.now()

    const refreshed = await refreshGoogleOidcTrustMaterial({
      jwksUrl: 'https://google.example.test/certs',
      store,
      cacheTtlMs: 1_234,
      async fetchJwks(url, timeoutMs) {
        calls.push([url, timeoutMs])
        return Response.json({
          keys: [makeJwk(), { kid: 'not-rsa', kty: 'EC', n: 'n', e: 'AQAB' }, { kty: 'RSA' }, null],
        })
      },
    })

    expect(calls).toEqual([['https://google.example.test/certs', 10_000]])
    expect(refreshed.keysById).toEqual({ 'synthetic-key': makeJwk() })
    expect(refreshed.expiresAt.getTime()).toBeGreaterThanOrEqual(beforeRefresh + 1_234)
    expect(refreshed.expiresAt.getTime()).toBeLessThanOrEqual(Date.now() + 1_234)
    expect(store.saved).toEqual(refreshed)
  })

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
    const store = makeTrustStore()

    await expect(
      refreshGoogleOidcTrustMaterial({
        jwksUrl: 'https://google.example.test/certs',
        store,
        async fetchJwks() {
          return response
        },
      }),
    ).rejects.toThrow(message)
    expect(store.saved).toBeNull()
  })

  it('returns configured material only from a present, unexpired snapshot', async () => {
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

    store.value = { ...makeCachedKeys(), expiresAt: new Date(Date.now() - 1) }
    await expect(getCachedGoogleOidcTrustMaterial(options)).resolves.toBeNull()
  })
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
