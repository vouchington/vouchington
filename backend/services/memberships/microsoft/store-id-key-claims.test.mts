import { describe, expect, it } from 'vitest'
import { validateMicrosoftStoreIdKeyClaims } from './store-id-key-claims.mts'

const NOW = new Date('2026-09-12T12:00:00.000Z')
const NOW_SECONDS = Math.floor(NOW.getTime() / 1000)
const CLIENT_ID = 'microsoft-store-client'
const USER_ID = 'voucha-user-1'

describe('Microsoft Store ID key claims', () => {
  it('accepts Collections and Purchase keys with either documented claim URI variant', () => {
    const collections = validateMicrosoftStoreIdKeyClaims({
      key: storeIdKey({ kind: 'collections', claimUri: 'http' }),
      kind: 'collections',
      clientId: CLIENT_ID,
      userId: USER_ID,
      now: NOW,
    })
    const purchase = validateMicrosoftStoreIdKeyClaims({
      key: storeIdKey({ kind: 'purchase', claimUri: 'https' }),
      kind: 'purchase',
      clientId: CLIENT_ID,
      userId: USER_ID,
      now: NOW,
    })

    expect(collections).toEqual({
      issuedAt: new Date((NOW_SECONDS - 3600) * 1000),
      expiresAt: new Date((NOW_SECONDS + 3600) * 1000),
    })
    expect(purchase).toEqual({
      issuedAt: new Date((NOW_SECONDS - 3600) * 1000),
      expiresAt: new Date((NOW_SECONDS + 3600) * 1000),
    })
  })

  it('rejects malformed JWT shapes, headers, and required opaque claims', () => {
    expect(
      validateMicrosoftStoreIdKeyClaims({
        key: 'not-a-jwt',
        kind: 'collections',
        clientId: CLIENT_ID,
        userId: USER_ID,
        now: NOW,
      }),
    ).toBeNull()
    expect(
      validateMicrosoftStoreIdKeyClaims({
        key: storeIdKey({ header: { typ: 'JWT', alg: 'none', kid: 'key-id' } }),
        kind: 'collections',
        clientId: CLIENT_ID,
        userId: USER_ID,
        now: NOW,
      }),
    ).toBeNull()
    expect(
      validateMicrosoftStoreIdKeyClaims({
        key: storeIdKey({ payload: { [claim('http', 'payload')]: '' } }),
        kind: 'collections',
        clientId: CLIENT_ID,
        userId: USER_ID,
        now: NOW,
      }),
    ).toBeNull()
  })

  it('rejects the wrong Store service, configured client, publisher user, and undocumented claim suffixes', () => {
    for (const key of [
      storeIdKey({ kind: 'purchase' }),
      storeIdKey({ payload: { [claim('http', 'clientId')]: 'different-client' } }),
      storeIdKey({ payload: { [claim('http', 'userId')]: 'different-user' } }),
      storeIdKey({
        payload: {
          [claim('http', 'clientId')]: undefined,
          [claim('http', 'userId')]: undefined,
          'https://schemas.microsoft.com/marketplace/2015/08/claims/key/clientId/other': CLIENT_ID,
          'https://schemas.microsoft.com/marketplace/2015/08/claims/key/userId/other': USER_ID,
        },
      }),
    ]) {
      expect(
        validateMicrosoftStoreIdKeyClaims({
          key,
          kind: 'collections',
          clientId: CLIENT_ID,
          userId: USER_ID,
          now: NOW,
        }),
      ).toBeNull()
    }
  })

  it('allows bounded issue and not-before clock skew while keeping expiration strict', () => {
    for (const payload of [
      { iat: NOW_SECONDS + 300, nbf: NOW_SECONDS + 300 },
      { iat: NOW_SECONDS + 60 },
      { nbf: NOW_SECONDS + 60 },
    ]) {
      expect(
        validateMicrosoftStoreIdKeyClaims({
          key: storeIdKey({ payload }),
          kind: 'collections',
          clientId: CLIENT_ID,
          userId: USER_ID,
          now: NOW,
        }),
      ).toEqual({
        issuedAt: new Date((payload.iat ?? NOW_SECONDS - 3600) * 1000),
        expiresAt: new Date((NOW_SECONDS + 3600) * 1000),
      })
    }
  })

  it('requires a currently valid lifetime no longer than thirty days', () => {
    for (const payload of [
      { exp: NOW_SECONDS },
      { nbf: NOW_SECONDS + 301 },
      { iat: NOW_SECONDS + 301 },
      { exp: NOW_SECONDS - 1 },
      { exp: NOW_SECONDS + 31 * 86_400 },
      { iat: NOW_SECONDS + 3600, exp: NOW_SECONDS + 1800 },
      { nbf: NOW_SECONDS + 3600, exp: NOW_SECONDS + 1800 },
      { iat: 1.5 },
    ]) {
      expect(
        validateMicrosoftStoreIdKeyClaims({
          key: storeIdKey({ payload }),
          kind: 'collections',
          clientId: CLIENT_ID,
          userId: USER_ID,
          now: NOW,
        }),
      ).toBeNull()
    }
  })

  it('prechecks decoded claims but does not validate the opaque JWT signature', () => {
    const original = storeIdKey({ kind: 'collections' })
    const [header, , signature] = original.split('.')
    const tamperedPayload = JSON.stringify({
      ...payloadFor('collections'),
      [claim('http', 'userId')]: USER_ID,
    })
    const tampered = `${header}.${Buffer.from(tamperedPayload).toString('base64url')}.${signature}`

    expect(
      validateMicrosoftStoreIdKeyClaims({
        key: tampered,
        kind: 'collections',
        clientId: CLIENT_ID,
        userId: USER_ID,
        now: NOW,
      }),
    ).toEqual({
      issuedAt: new Date((NOW_SECONDS - 3600) * 1000),
      expiresAt: new Date((NOW_SECONDS + 3600) * 1000),
    })
  })
})

function storeIdKey(options: {
  kind?: 'collections' | 'purchase'
  claimUri?: 'http' | 'https'
  header?: Record<string, unknown>
  payload?: Record<string, unknown>
}): string {
  const header = options.header ?? { typ: 'JWT', alg: 'RS256', kid: 'key-id' }
  const payload = {
    ...payloadFor(options.kind ?? 'collections', options.claimUri),
    ...options.payload,
  }
  return `${encode(header)}.${encode(payload)}.opaque-signature`
}

function payloadFor(
  kind: 'collections' | 'purchase',
  scheme: 'http' | 'https' = 'http',
): Record<string, unknown> {
  const audience = `https://${kind}.mp.microsoft.com/v6.0/keys`
  return {
    iss: audience,
    aud: audience,
    iat: NOW_SECONDS - 3600,
    nbf: NOW_SECONDS - 3600,
    exp: NOW_SECONDS + 3600,
    [claim(scheme, 'clientId')]: CLIENT_ID,
    [claim(scheme, 'userId')]: USER_ID,
    [claim(scheme, 'payload')]: 'opaque-store-payload',
  }
}

function claim(scheme: 'http' | 'https', name: 'clientId' | 'userId' | 'payload'): string {
  return `${scheme}://schemas.microsoft.com/marketplace/2015/08/claims/key/${name}`
}

function encode(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url')
}
