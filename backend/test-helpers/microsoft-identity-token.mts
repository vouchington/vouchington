import type { fetch as undiciFetch } from 'undici'
import { createSign, generateKeyPairSync, randomUUID, type KeyObject } from 'node:crypto'

/** Disposable provider signing material; no network keys or persistent credentials. */
export function createMicrosoftIdentitySigningFixture() {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
  const keyId = randomUUID()
  const tenantId = randomUUID()
  function signJsonToken(
    headerValue: unknown,
    payloadValue: unknown,
    signingKey: KeyObject = privateKey,
  ): string {
    const headerJson = JSON.stringify(headerValue)
    const payloadJson = JSON.stringify(payloadValue)
    if (headerJson === undefined || payloadJson === undefined)
      throw new Error('Fixture token values must be JSON')
    const header = Buffer.from(headerJson).toString('base64url')
    const payload = Buffer.from(payloadJson).toString('base64url')
    const signer = createSign('SHA256')
    signer.update(`${header}.${payload}`)
    return `${header}.${payload}.${signer.sign(signingKey).toString('base64url')}`
  }
  function signToken(
    override: Record<string, unknown>,
    signingKey = privateKey,
    headerOverride: Record<string, unknown> = {},
  ): string {
    return signJsonToken(
      { alg: 'RS256', kid: keyId, ...headerOverride },
      {
        aud: 'test-microsoft-client',
        iss: `https://login.microsoftonline.com/${tenantId}/v2.0`,
        tid: tenantId,
        sub: 'fixture-pairwise-subject',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 300,
        ...override,
      },
      signingKey,
    )
  }
  return { privateKey, publicKey, keyId, tenantId, signToken }
}

/** Normalize the actual undici request argument while keeping provider mocks typed. */
export function getMicrosoftFixtureRequestUrl(url: Parameters<typeof undiciFetch>[0]): string {
  return typeof url === 'string' ? url : url instanceof URL ? url.href : url.url
}
