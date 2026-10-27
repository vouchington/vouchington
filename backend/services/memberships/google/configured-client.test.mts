import { createHash, generateKeyPairSync, randomUUID, verify } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as httpDispatchers from '../../../modules/utils/http.mts'
import {
  createConfiguredGooglePlaySubscriptionsV2Client,
  GooglePlaySubscriptionLookupError,
} from './configured-client.mts'
import { stringFromUnknown } from '@ts-shared/utils/string-from-unknown'

type ExternalFetch = ReturnType<typeof httpDispatchers.getExternalFetch>
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
const privateKeyPem = privateKey.export({ format: 'pem', type: 'pkcs8' })
const clientEmail = 'play-tests@example.iam.gserviceaccount.com'

function configure(fetch: ExternalFetch, email = clientEmail): void {
  vi.stubEnv('GOOGLE_PLAY_SERVICE_ACCOUNT_EMAIL', email)
  vi.stubEnv('GOOGLE_PLAY_SERVICE_ACCOUNT_PRIVATE_KEY', privateKeyPem.replaceAll('\n', '\\n'))
  vi.spyOn(httpDispatchers, 'getExternalFetch').mockReturnValue(fetch)
}

describe('configured Google Play client', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })
  it('requires a configured PEM service account', () => {
    vi.stubEnv('GOOGLE_PLAY_SERVICE_ACCOUNT_EMAIL', '')
    expect(() => createConfiguredGooglePlaySubscriptionsV2Client()).toThrow(
      'GOOGLE_PLAY_SERVICE_ACCOUNT_EMAIL is required',
    )
    vi.stubEnv('GOOGLE_PLAY_SERVICE_ACCOUNT_EMAIL', clientEmail)
    vi.stubEnv('GOOGLE_PLAY_SERVICE_ACCOUNT_PRIVATE_KEY', '')
    expect(() => createConfiguredGooglePlaySubscriptionsV2Client()).toThrow(
      'GOOGLE_PLAY_SERVICE_ACCOUNT_PRIVATE_KEY is required',
    )
    vi.stubEnv('GOOGLE_PLAY_SERVICE_ACCOUNT_PRIVATE_KEY', 'not a PEM key')
    expect(() => createConfiguredGooglePlaySubscriptionsV2Client()).toThrow(
      'must be a PEM private key',
    )
    vi.stubEnv('GOOGLE_PLAY_SERVICE_ACCOUNT_PRIVATE_KEY', privateKeyPem.replaceAll('\n', '\\n'))
    expect(() => createConfiguredGooglePlaySubscriptionsV2Client()).not.toThrow()
  })

  it('preserves a provider throttle wait for the verification lane', async () => {
    const email = `tests+${randomUUID()}@voucha.ai`
    configure(
      async input =>
        stringFromUnknown(input).endsWith('/token')
          ? Response.json({ access_token: 'synthetic-token', expires_in: 3600 })
          : new Response(null, { status: 429, headers: { 'retry-after': '120' } }),
      email,
    )
    const client = createConfiguredGooglePlaySubscriptionsV2Client()
    await expect(
      client.getSubscription({ packageName: 'ai.voucha.test', purchaseToken: 'synthetic' }),
    ).rejects.toMatchObject({
      name: 'RateLimitError',
      cause: { status: 429, retryAfterMs: 120000 },
    })
  })

  it('signs a scoped OAuth assertion, fetches and acknowledges encoded purchases, and caches the token', async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = []
    const providerFetch = vi.fn<
      (input: string | URL | Request, init?: RequestInit) => Promise<Response>
    >(async (input, init) => {
      const url = stringFromUnknown(input)
      requests.push({ url, init })
      if (url.endsWith('/token'))
        return Response.json({ access_token: 'play-access-token', expires_in: 3600 })
      if (url.endsWith(':acknowledge')) return new Response(null, { status: 204 })
      return Response.json({ subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE' })
    })
    configure(providerFetch)
    const client = createConfiguredGooglePlaySubscriptionsV2Client()
    await expect(
      client.getSubscription({ packageName: 'ai.voucha/test', purchaseToken: 'purchase/one' }),
    ).resolves.toMatchObject({ subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE' })
    await client.acknowledgeSubscription({
      packageName: 'ai.voucha/test',
      subscriptionId: 'plus/monthly',
      purchaseToken: 'purchase/one',
    })

    expect(requests).toHaveLength(3)
    const assertion = new URLSearchParams(requests[0]?.init?.body as string).get('assertion')
    expect(assertion).toBeTruthy()
    const [header, claims, signature] = assertion!.split('.')
    expect(JSON.parse(Buffer.from(header!, 'base64url').toString())).toEqual({
      alg: 'RS256',
      typ: 'JWT',
    })
    expect(JSON.parse(Buffer.from(claims!, 'base64url').toString())).toMatchObject({
      iss: clientEmail,
      aud: 'https://oauth2.googleapis.com/token',
      scope: 'https://www.googleapis.com/auth/androidpublisher',
    })
    expect(
      verify(
        'RSA-SHA256',
        Buffer.from(`${header}.${claims}`),
        publicKey,
        Buffer.from(signature!, 'base64url'),
      ),
    ).toBe(true)
    expect(requests[1]).toMatchObject({
      url: expect.stringContaining(
        '/applications/ai.voucha%2Ftest/purchases/subscriptionsv2/tokens/purchase%2Fone',
      ),
      init: { headers: { authorization: 'Bearer play-access-token' } },
    })
    expect(requests[2]).toMatchObject({
      url: expect.stringContaining(
        '/subscriptions/plus%2Fmonthly/tokens/purchase%2Fone:acknowledge',
      ),
      init: { method: 'POST', headers: { authorization: 'Bearer play-access-token' } },
    })
  })

  it('rejects OAuth, subscription, and acknowledgement failures', async () => {
    const failingEmail = 'failures@example.iam.gserviceaccount.com'
    const failedFetch = vi
      .fn<ExternalFetch>()
      .mockResolvedValue(new Response(null, { status: 503 }))
    configure(failedFetch, failingEmail)
    const failedToken = createConfiguredGooglePlaySubscriptionsV2Client()
    await expect(
      failedToken.getSubscription({ packageName: 'ai.voucha', purchaseToken: 'purchase' }),
    ).rejects.toThrow('Google OAuth token exchange failed with 503')

    vi.restoreAllMocks()
    const malformedFetch = vi
      .fn<ExternalFetch>()
      .mockResolvedValue(Response.json({ access_token: 7, expires_in: '3600' }))
    configure(malformedFetch, failingEmail)
    const malformedToken = createConfiguredGooglePlaySubscriptionsV2Client()
    await expect(
      malformedToken.getSubscription({ packageName: 'ai.voucha', purchaseToken: 'purchase' }),
    ).rejects.toThrow('Google OAuth token response is malformed')

    vi.restoreAllMocks()
    const failedApiFetch = vi.fn<ExternalFetch>(async input =>
      stringFromUnknown(input).endsWith('/token')
        ? Response.json({ access_token: 'short-lived', expires_in: 0 })
        : new Response(null, { status: 429 }),
    )
    configure(failedApiFetch, failingEmail)
    const failedApi = createConfiguredGooglePlaySubscriptionsV2Client()
    await expect(
      failedApi.getSubscription({ packageName: 'ai.voucha', purchaseToken: 'purchase' }),
    ).rejects.toMatchObject({ name: 'RateLimitError', cause: { status: 429 } })
    vi.restoreAllMocks()
    const invalidApiFetch = vi.fn<ExternalFetch>(async input =>
      stringFromUnknown(input).endsWith('/token')
        ? Response.json({ access_token: 'short-lived', expires_in: 0 })
        : new Response(null, { status: 404 }),
    )
    configure(invalidApiFetch, failingEmail)
    const invalidApi = createConfiguredGooglePlaySubscriptionsV2Client()
    await expect(
      invalidApi.getSubscription({ packageName: 'ai.voucha', purchaseToken: 'purchase' }),
    ).rejects.toMatchObject({
      name: 'GooglePlaySubscriptionLookupError',
      status: 404,
      purchaseTokenDigest: createHash('sha256').update('purchase').digest('hex'),
      invalidPurchaseToken: true,
    } satisfies Partial<GooglePlaySubscriptionLookupError>)
    for (const [reason, invalidPurchaseToken] of [
      ['invalidValue', true],
      ['required', false],
    ] as const) {
      vi.restoreAllMocks()
      const badRequestApiFetch = vi.fn<ExternalFetch>(async input =>
        stringFromUnknown(input).endsWith('/token')
          ? Response.json({ access_token: 'short-lived', expires_in: 0 })
          : Response.json({ error: { errors: [{ reason }] } }, { status: 400 }),
      )
      configure(badRequestApiFetch, failingEmail)
      const badRequestApi = createConfiguredGooglePlaySubscriptionsV2Client()
      await expect(
        badRequestApi.getSubscription({ packageName: 'ai.voucha', purchaseToken: 'purchase' }),
      ).rejects.toMatchObject({ status: 400, reason, invalidPurchaseToken })
    }
    vi.restoreAllMocks()
    const failedAckFetch = vi.fn<ExternalFetch>(async input =>
      stringFromUnknown(input).endsWith('/token')
        ? Response.json({ access_token: 'short-lived', expires_in: 0 })
        : new Response(null, { status: 429 }),
    )
    configure(failedAckFetch, failingEmail)
    await expect(
      createConfiguredGooglePlaySubscriptionsV2Client().acknowledgeSubscription({
        packageName: 'ai.voucha',
        subscriptionId: 'plus',
        purchaseToken: 'purchase',
      }),
    ).rejects.toThrow('Google Play acknowledgement failed with 429')
  })
})
