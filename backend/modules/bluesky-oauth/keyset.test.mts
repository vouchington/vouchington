import { describe, expect, it } from 'vitest'
import { BLUESKY_JWT_PRIVATE_KEYS_ENV, getBlueskyKeyset } from './keyset.mts'
import testPrivateKey from './test-jwk-private-key.mts'

function toEnvValue(jwks: readonly unknown[]): string {
  return Buffer.from(JSON.stringify(jwks), 'utf-8').toString('base64')
}

function customJwk(kid: string): Record<string, string> {
  return {
    kty: 'EC',
    crv: 'P-256',
    x: 'H1FwSv4yvA9SeafPFsWo2a4x3tDpTmcqgNf372kN1Ic',
    y: 'AYaY41ezo-nNMB6Wft4LFAdvSby1QwrMZZKJzvnopUA',
    d: 'W56-dY_fQS9mIdMb2w7c4dcp5rRo4T8O_6GosXm0sNw',
    alg: 'ES256',
    kid,
  }
}

describe('getBlueskyKeyset', () => {
  it('falls back to the bundled test key outside production when unconfigured', async () => {
    const keyset = await getBlueskyKeyset({ mode: 'test', env: '' })
    expect(keyset.size).toBe(1)
    const [key] = keyset.publicJwks.keys
    expect(key?.kid).toBe(testPrivateKey.kid)
    expect(key?.kty).toBe('EC')
    expect((key as { crv?: string }).crv).toBe('P-256')
  })

  it('throws in production when unconfigured', async () => {
    await expect(getBlueskyKeyset({ mode: 'production', env: '' })).rejects.toThrow(
      new RegExp(`${BLUESKY_JWT_PRIVATE_KEYS_ENV} must be configured in production`),
    )
  })

  it('loads a configured single-key env value and derives the public JWKS', async () => {
    const env = toEnvValue([customJwk('custom-key-1')])
    const keyset = await getBlueskyKeyset({ mode: 'production', env })
    expect(keyset.size).toBe(1)
    const [key] = keyset.publicJwks.keys
    expect(key?.kid).toBe('custom-key-1')
    // publicJwk sets d: undefined rather than deleting the key, so 'd' in key stays true — assert
    // on the actual serialized shape (what anything reading this JWKS over the wire would see).
    expect(JSON.parse(JSON.stringify(key ?? {}))).not.toHaveProperty('d')
  })

  it('loads a configured multi-key env value', async () => {
    const env = toEnvValue([customJwk('custom-key-1'), customJwk('custom-key-2')])
    const keyset = await getBlueskyKeyset({ mode: 'production', env })
    expect(keyset.size).toBe(2)
    expect(keyset.publicJwks.keys.map(key => key.kid).sort()).toEqual([
      'custom-key-1',
      'custom-key-2',
    ])
  })

  it('accepts the {keys: [...]} JWKS-document wrapper shape', async () => {
    const env = Buffer.from(JSON.stringify({ keys: [customJwk('wrapped-key')] }), 'utf-8').toString(
      'base64',
    )
    const keyset = await getBlueskyKeyset({ mode: 'production', env })
    expect(keyset.publicJwks.keys[0]?.kid).toBe('wrapped-key')
  })

  it('rejects a non-EC-P-256 key', async () => {
    const env = toEnvValue([{ ...customJwk('bad'), kty: 'RSA' }])
    await expect(getBlueskyKeyset({ mode: 'production', env })).rejects.toThrow(
      /must be an EC P-256 JWK/,
    )
  })

  it('rejects a key with a mismatched alg', async () => {
    const env = toEnvValue([{ ...customJwk('bad'), alg: 'ES384' }])
    await expect(getBlueskyKeyset({ mode: 'production', env })).rejects.toThrow(/must use ES256/)
  })

  it('rejects a public-only key (missing d)', async () => {
    const jwk = customJwk('bad')
    delete (jwk as { d?: string }).d
    const env = toEnvValue([jwk])
    await expect(getBlueskyKeyset({ mode: 'production', env })).rejects.toThrow(
      /must be a private key \(missing d\)/,
    )
  })

  it('rejects a key missing kid', async () => {
    const jwk = customJwk('bad')
    delete (jwk as { kid?: string }).kid
    const env = toEnvValue([jwk])
    await expect(getBlueskyKeyset({ mode: 'production', env })).rejects.toThrow(/missing kid/)
  })

  it('rejects duplicate kid values', async () => {
    const env = toEnvValue([customJwk('dupe'), customJwk('dupe')])
    await expect(getBlueskyKeyset({ mode: 'production', env })).rejects.toThrow(
      /duplicate kid values/,
    )
  })

  it('rejects invalid base64/JSON', async () => {
    await expect(
      getBlueskyKeyset({ mode: 'production', env: 'not-valid-base64-json!!!' }),
    ).rejects.toThrow(
      new RegExp(`${BLUESKY_JWT_PRIVATE_KEYS_ENV} must be valid base64-encoded JSON`),
    )
  })

  it('memoizes the resolved keyset per mode+env value', async () => {
    const env = toEnvValue([customJwk('memo-key')])
    const first = getBlueskyKeyset({ mode: 'production', env })
    const second = getBlueskyKeyset({ mode: 'production', env })
    expect(first).toBe(second)
    expect(await first).toBe(await second)
  })
})
