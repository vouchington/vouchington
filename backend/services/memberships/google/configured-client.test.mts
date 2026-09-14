import { createHash, generateKeyPairSync, verify } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createGooglePlaySubscriptionsV2Client,
  getGooglePlayServiceAccountConfig,
  GooglePlaySubscriptionLookupError,
} from './configured-client.mts'

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
const privateKeyPem = privateKey.export({ format: 'pem', type: 'pkcs8' }).toString()
const config = {
  clientEmail: 'play-tests@example.iam.gserviceaccount.com',
  privateKey: privateKeyPem,
}

describe('configured Google Play client', () => {
  afterEach(() => vi.unstubAllEnvs())
  it('requires a configured PEM service account', () => {
    vi.stubEnv('GOOGLE_PLAY_SERVICE_ACCOUNT_EMAIL', '')
    expect(() => getGooglePlayServiceAccountConfig()).toThrow(
      'GOOGLE_PLAY_SERVICE_ACCOUNT_EMAIL is required',
    )
    vi.stubEnv('GOOGLE_PLAY_SERVICE_ACCOUNT_EMAIL', config.clientEmail)
    vi.stubEnv('GOOGLE_PLAY_SERVICE_ACCOUNT_PRIVATE_KEY', '')
    expect(() => getGooglePlayServiceAccountConfig()).toThrow(
      'GOOGLE_PLAY_SERVICE_ACCOUNT_PRIVATE_KEY is required',
    )
    vi.stubEnv('GOOGLE_PLAY_SERVICE_ACCOUNT_PRIVATE_KEY', 'not a PEM key')
    expect(() => getGooglePlayServiceAccountConfig()).toThrow('must be a PEM private key')
    vi.stubEnv('GOOGLE_PLAY_SERVICE_ACCOUNT_PRIVATE_KEY', privateKeyPem.replaceAll('\n', '\\n'))
    expect(getGooglePlayServiceAccountConfig()).toEqual(config)
  })

  it('signs a scoped OAuth assertion, fetches and acknowledges encoded purchases, and caches the token', async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = []
    const providerFetch = vi.fn<
      (input: string | URL | Request, init?: RequestInit) => Promise<Response>
    >(async (input, init) => {
      const url = String(input)
      requests.push({ url, init })
      if (url.endsWith('/token'))
        return Response.json({ access_token: 'play-access-token', expires_in: 3600 })
      if (url.endsWith(':acknowledge')) return new Response(null, { status: 204 })
      return Response.json({ subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE' })
    })
    const client = createGooglePlaySubscriptionsV2Client(config, providerFetch)
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
      iss: config.clientEmail,
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
    const failingConfig = { ...config, clientEmail: 'failures@example.iam.gserviceaccount.com' }
    const failedToken = createGooglePlaySubscriptionsV2Client(
      failingConfig,
      async () => new Response(null, { status: 503 }),
    )
    await expect(
      failedToken.getSubscription({ packageName: 'ai.voucha', purchaseToken: 'purchase' }),
    ).rejects.toThrow('Google OAuth token exchange failed with 503')

    const malformedToken = createGooglePlaySubscriptionsV2Client(failingConfig, async () =>
      Response.json({ access_token: 7, expires_in: '3600' }),
    )
    await expect(
      malformedToken.getSubscription({ packageName: 'ai.voucha', purchaseToken: 'purchase' }),
    ).rejects.toThrow('Google OAuth token response is malformed')

    const failedApi = createGooglePlaySubscriptionsV2Client(failingConfig, async input =>
      String(input).endsWith('/token')
        ? Response.json({ access_token: 'short-lived', expires_in: 0 })
        : new Response(null, { status: 429 }),
    )
    await expect(
      failedApi.getSubscription({ packageName: 'ai.voucha', purchaseToken: 'purchase' }),
    ).rejects.toThrow('Google Play subscriptionsv2 fetch failed with 429')
    const invalidApi = createGooglePlaySubscriptionsV2Client(failingConfig, async input =>
      String(input).endsWith('/token')
        ? Response.json({ access_token: 'short-lived', expires_in: 0 })
        : new Response(null, { status: 404 }),
    )
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
      const badRequestApi = createGooglePlaySubscriptionsV2Client(failingConfig, async input =>
        String(input).endsWith('/token')
          ? Response.json({ access_token: 'short-lived', expires_in: 0 })
          : Response.json({ error: { errors: [{ reason }] } }, { status: 400 }),
      )
      await expect(
        badRequestApi.getSubscription({ packageName: 'ai.voucha', purchaseToken: 'purchase' }),
      ).rejects.toMatchObject({ status: 400, reason, invalidPurchaseToken })
    }
    await expect(
      failedApi.acknowledgeSubscription({
        packageName: 'ai.voucha',
        subscriptionId: 'plus',
        purchaseToken: 'purchase',
      }),
    ).rejects.toThrow('Google Play acknowledgement failed with 429')
  })
})
