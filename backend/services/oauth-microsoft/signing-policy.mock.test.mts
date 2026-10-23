import { randomUUID, generateKeyPairSync } from 'node:crypto'
import {
  createMicrosoftIdentitySigningFixture,
  getMicrosoftFixtureRequestUrl,
} from '@voucha/test-helpers/microsoft-identity-token'
import { afterAll, afterEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import type { fetch as undiciFetch } from 'undici'
import { createRandomEmailAddress } from '@voucha/test-helpers'
import { deleteTestOAuthAuthorizationFixtures } from '@voucha/test-helpers/entities/oauth-authorizations'

type FetchResponse = Awaited<ReturnType<typeof undiciFetch>>
const fetchSpy = vi.fn<typeof undiciFetch>()
vi.stubEnv('MICROSOFT_CLIENT_ID', 'test-microsoft-client')
vi.stubEnv('MICROSOFT_CLIENT_SECRET', 'test-microsoft-secret')
vi.stubEnv('MICROSOFT_TENANT_ID', 'common')
vi.resetModules()
vi.doMock<typeof import('undici')>(import('undici'), async importOriginal => ({
  ...(await importOriginal()),
  fetch: fetchSpy,
}))
const { privateKey, publicKey, keyId, signToken, signJsonToken } =
  createMicrosoftIdentitySigningFixture()
const { upsertMicrosoftAccount } = await import('./index.mts')

describe('Microsoft signing-key policy', () => {
  afterEach(() => fetchSpy.mockReset())
  afterAll(() => {
    vi.unstubAllEnvs()
    vi.doUnmock('undici')
  })

  it.each([
    { part: 'header', value: null },
    { part: 'header', value: [] },
    { part: 'claims', value: null },
    { part: 'claims', value: [] },
  ])('rejects non-object $part without a server error', async ({ part, value }) => {
    const providerUserId = randomUUID()
    const idToken = signJsonToken(
      part === 'header' ? value : { alg: 'RS256', kid: keyId },
      part === 'claims' ? value : { oid: providerUserId },
    )
    fetchSpy.mockImplementation(async url => {
      if (getMicrosoftFixtureRequestUrl(url).endsWith('/token'))
        return response({ access_token: 'access', id_token: idToken })
      if (getMicrosoftFixtureRequestUrl(url).endsWith('/keys'))
        return response({ keys: [{ ...publicKey.export({ format: 'jwk' }), kid: keyId }] })
      return response({ id: providerUserId })
    })
    await expect(
      upsertMicrosoftAccount('code', 'https://example.com/callback', 'verifier'),
    ).rejects.toMatchObject({
      status: 401,
      message:
        part === 'header'
          ? 'Invalid Microsoft identity token algorithm'
          : 'Microsoft identity token claims are invalid',
    })
  })

  it('rejects extra segments on an otherwise correctly signed identity token', async () => {
    const providerUserId = randomUUID()
    onTestFinished(() =>
      deleteTestOAuthAuthorizationFixtures({ microsoftUserIds: [providerUserId] }),
    )
    const idToken = `${signToken({ oid: providerUserId, email: createRandomEmailAddress(), xms_edov: true })}.extra`
    fetchSpy.mockImplementation(async url => {
      if (getMicrosoftFixtureRequestUrl(url).endsWith('/token'))
        return response({ access_token: 'access', id_token: idToken })
      if (getMicrosoftFixtureRequestUrl(url).endsWith('/keys'))
        return response({ keys: [{ ...publicKey.export({ format: 'jwk' }), kid: keyId }] })
      return response({ id: providerUserId })
    })
    await expect(
      upsertMicrosoftAccount('code', 'https://example.com/callback', 'verifier'),
    ).rejects.toMatchObject({ status: 401, message: 'Invalid Microsoft identity token' })
  })

  it.each(['malformed', 'a.b', 'a.b.c.d'])(
    'rejects malformed compact tokens (%s)',
    async idToken => {
      fetchSpy.mockImplementation(async url =>
        getMicrosoftFixtureRequestUrl(url).endsWith('/token')
          ? response({ access_token: 'access', id_token: idToken })
          : response({ id: randomUUID() }),
      )
      await expect(
        upsertMicrosoftAccount('code', 'https://example.com/callback', 'verifier'),
      ).rejects.toMatchObject({ status: 401, message: 'Invalid Microsoft identity token' })
    },
  )

  it.each([{ alg: 'HS256' }, { kid: undefined }])(
    'rejects unsupported identity headers (%j)',
    async header => {
      const providerUserId = randomUUID()
      const idToken = signToken({ oid: providerUserId }, privateKey, header)
      fetchSpy.mockImplementation(async url =>
        getMicrosoftFixtureRequestUrl(url).endsWith('/token')
          ? response({ access_token: 'access', id_token: idToken })
          : response({ id: providerUserId }),
      )
      await expect(
        upsertMicrosoftAccount('code', 'https://example.com/callback', 'verifier'),
      ).rejects.toMatchObject({
        status: 401,
        message: 'Invalid Microsoft identity token algorithm',
      })
    },
  )

  it('recovers from a failed signing-key fetch without poisoning the key cache', async () => {
    const providerUserId = randomUUID()
    const freshKid = randomUUID()
    const email = createRandomEmailAddress()
    const idToken = signToken({ oid: providerUserId, email, xms_edov: true }, privateKey, {
      kid: freshKid,
    })
    onTestFinished(() =>
      deleteTestOAuthAuthorizationFixtures({ microsoftUserIds: [providerUserId] }),
    )
    let available = false
    fetchSpy.mockImplementation(async url => {
      if (getMicrosoftFixtureRequestUrl(url).endsWith('/token'))
        return response({ access_token: 'access', id_token: idToken })
      if (getMicrosoftFixtureRequestUrl(url).endsWith('/keys'))
        return available
          ? response({ keys: [{ ...publicKey.export({ format: 'jwk' }), kid: freshKid }] })
          : response({}, 503)
      return response({ id: providerUserId })
    })
    await expect(
      upsertMicrosoftAccount('code', 'https://example.com/callback', 'verifier'),
    ).rejects.toMatchObject({ status: 502, message: 'Microsoft signing keys request failed' })
    available = true
    const recovered = await upsertMicrosoftAccount(
      'code',
      'https://example.com/callback',
      'verifier',
    )
    expect(recovered.provider_user_email_address).toBe(email)
    expect(
      fetchSpy.mock.calls.filter(([url]) => getMicrosoftFixtureRequestUrl(url).endsWith('/keys')),
    ).toHaveLength(2)
  })

  it('refreshes cached keys once when the provider rotates its signing key', async () => {
    const providerUserId = randomUUID()
    const rotated = generateKeyPairSync('rsa', { modulusLength: 2048 })
    const rotatedKid = randomUUID()
    const email = createRandomEmailAddress()
    let rotatedActive = false
    let keyFetches = 0
    onTestFinished(() =>
      deleteTestOAuthAuthorizationFixtures({ microsoftUserIds: [providerUserId] }),
    )
    fetchSpy.mockImplementation(async url => {
      if (getMicrosoftFixtureRequestUrl(url).endsWith('/token'))
        return response({
          access_token: 'access',
          id_token: signToken(
            { oid: providerUserId, email, xms_edov: true },
            rotatedActive ? rotated.privateKey : privateKey,
            { kid: rotatedActive ? rotatedKid : keyId },
          ),
        })
      if (getMicrosoftFixtureRequestUrl(url).endsWith('/keys')) {
        keyFetches++
        return response({
          keys: [
            {
              ...(rotatedActive ? rotated.publicKey : publicKey).export({ format: 'jwk' }),
              kid: rotatedActive ? rotatedKid : keyId,
            },
          ],
        })
      }
      return response({ id: providerUserId })
    })
    await upsertMicrosoftAccount('prime', 'https://example.com/callback', 'verifier')
    const initialFetches = keyFetches
    rotatedActive = true
    expect(
      (await upsertMicrosoftAccount('rotated', 'https://example.com/callback', 'verifier'))
        .provider_user_email_address,
    ).toBe(email)
    expect(keyFetches).toBe(initialFetches + 1)
  })

  it.each([{}, { kty: 'EC' }, { use: 'enc' }, { alg: 'RS512' }])(
    'rejects refreshed keys outside its signing policy (%j)',
    async metadata => {
      const providerUserId = randomUUID()
      const freshKid = randomUUID()
      const idToken = signToken({ oid: providerUserId }, privateKey, { kid: freshKid })
      fetchSpy.mockImplementation(async url => {
        if (getMicrosoftFixtureRequestUrl(url).endsWith('/token'))
          return response({ access_token: 'access', id_token: idToken })
        if (getMicrosoftFixtureRequestUrl(url).endsWith('/keys'))
          return response({
            keys:
              Object.keys(metadata).length === 0
                ? []
                : [{ ...publicKey.export({ format: 'jwk' }), kid: freshKid, ...metadata }],
          })
        return response({ id: providerUserId })
      })
      await expect(
        upsertMicrosoftAccount('code', 'https://example.com/callback', 'verifier'),
      ).rejects.toMatchObject({ status: 401, message: 'Microsoft identity token key not found' })
    },
  )
})

function response(value: unknown, status = 200): FetchResponse {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(value),
  } as FetchResponse
}
