import { afterEach, describe, expect, it, vi } from 'vitest'
import * as httpDispatchers from '../../../modules/utils/http-dispatchers.mts'
import {
  createConfiguredMicrosoftStoreClient,
  getMicrosoftStoreServiceConfig,
} from './configured-client.mts'

type ExternalFetch = ReturnType<typeof httpDispatchers.getExternalFetch>

describe('configured Microsoft Store client', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it('uses the documented endpoints, bodies, service scope, and continuation tokens', async () => {
    vi.stubEnv('MICROSOFT_STORE_TENANT_ID', 'tenant-id')
    vi.stubEnv('MICROSOFT_STORE_CLIENT_ID', 'client-id')
    vi.stubEnv('MICROSOFT_STORE_CLIENT_SECRET', 'client-secret')
    const fetch = vi.fn<ExternalFetch>()
    fetch
      .mockResolvedValueOnce(Response.json({ access_token: 'service-token', expires_in: 3600 }))
      .mockResolvedValueOnce(Response.json({ items: [{ id: 'first' }], continuationToken: 'next' }))
      .mockResolvedValueOnce(
        Response.json({ items: [{ id: 'second' }], continuationToken: 'last' }),
      )
      .mockResolvedValueOnce(Response.json({ items: [{ id: 'third' }] }))
      .mockResolvedValueOnce(
        Response.json({ items: [{ id: 'recurrence-one' }], continuationToken: 'r2' }),
      )
      .mockResolvedValueOnce(Response.json({ items: [{ id: 'recurrence-two' }] }))
    vi.spyOn(httpDispatchers, 'getExternalFetch').mockReturnValue(fetch)
    const client = createConfiguredMicrosoftStoreClient()

    await expect(
      client.queryCollections({
        key: 'collection-key',
        publisherUserId: 'publisher-user',
        productId: 'product-id',
        skuId: 'sku-id',
        environment: 'test',
      }),
    ).resolves.toEqual([{ id: 'first' }, { id: 'second' }, { id: 'third' }])
    await expect(
      client.queryRecurrences({ key: 'purchase-key', environment: 'test' }),
    ).resolves.toEqual([{ id: 'recurrence-one' }, { id: 'recurrence-two' }])

    expect(fetch).toHaveBeenNthCalledWith(
      1,
      'https://login.microsoftonline.com/tenant-id/oauth2/v2.0/token',
      expect.objectContaining({
        body: expect.stringContaining('scope=https%3A%2F%2Fonestore.microsoft.com%2F.default'),
      }),
    )
    const collectionBody = {
      beneficiaries: [
        {
          identityType: 'b2b',
          identityValue: 'collection-key',
          localTicketReference: 'publisher-user',
        },
      ],
      excludeDuplicates: false,
      maxPageSize: 200,
      productSkuIds: [{ productId: 'product-id', skuId: 'sku-id' }],
      sbx: 'XDKS.1',
      validityType: 'All',
    }
    expectRequests(
      fetch,
      2,
      'https://collections.mp.microsoft.com/v9.0/collections/publisherQuery',
      [
        collectionBody,
        { ...collectionBody, continuationToken: 'next' },
        { ...collectionBody, continuationToken: 'last' },
      ],
    )
    expectRequests(fetch, 5, 'https://purchase.mp.microsoft.com/v8.0/b2b/recurrences/query', [
      { b2bKey: 'purchase-key', sbx: 'XDKS.1' },
      { b2bKey: 'purchase-key', sbx: 'XDKS.1', continuationToken: 'r2' },
    ])
  })

  it('fails closed on malformed pages and unsafe continuation tokens', async () => {
    vi.stubEnv('MICROSOFT_STORE_TENANT_ID', 'malformed-tenant')
    vi.stubEnv('MICROSOFT_STORE_CLIENT_ID', 'client-id')
    vi.stubEnv('MICROSOFT_STORE_CLIENT_SECRET', 'client-secret')
    const fetch = vi.fn<ExternalFetch>()
    fetch
      .mockResolvedValueOnce(Response.json({ access_token: 'malformed-token', expires_in: 3600 }))
      .mockResolvedValueOnce(Response.json({ continuationToken: 'missing-items' }))
      .mockResolvedValueOnce(Response.json({ items: [], continuationToken: 'cycle' }))
      .mockResolvedValueOnce(Response.json({ items: [], continuationToken: 'cycle' }))
    vi.spyOn(httpDispatchers, 'getExternalFetch').mockReturnValue(fetch)
    const client = createConfiguredMicrosoftStoreClient()

    await expect(
      client.queryCollections({
        key: 'collection-key',
        publisherUserId: 'publisher-user',
        productId: 'product-id',
        skuId: null,
        environment: 'production',
      }),
    ).rejects.toThrow('Microsoft Store collections response is malformed')
    await expect(
      client.queryRecurrences({ key: 'purchase-key', environment: 'production' }),
    ).rejects.toThrow('Microsoft Store recurrences continuation token repeated')

    vi.stubEnv('MICROSOFT_STORE_TENANT_ID', 'overflow-tenant')
    vi.restoreAllMocks()
    let overflowCalls = 0
    const overflowFetch = vi.fn<ExternalFetch>(async () => {
      overflowCalls += 1
      return overflowCalls === 1
        ? Response.json({ access_token: 'overflow-token', expires_in: 3600 })
        : Response.json({
            items: [],
            continuationToken: `page-${overflowCalls}`,
          })
    })
    vi.spyOn(httpDispatchers, 'getExternalFetch').mockReturnValue(overflowFetch)
    await expect(
      createConfiguredMicrosoftStoreClient().queryRecurrences({
        key: 'purchase-key',
        environment: 'production',
      }),
    ).rejects.toThrow('Microsoft Store recurrences query exceeded 10 pages')
    expect(overflowFetch).toHaveBeenCalledTimes(11)
  })

  it('rejects a non-string Store continuation token', async () => {
    vi.stubEnv('MICROSOFT_STORE_TENANT_ID', 'invalid-continuation-tenant')
    vi.stubEnv('MICROSOFT_STORE_CLIENT_ID', 'client-id')
    vi.stubEnv('MICROSOFT_STORE_CLIENT_SECRET', 'client-secret')
    const fetch = vi
      .fn<ExternalFetch>()
      .mockResolvedValueOnce(Response.json({ access_token: 'service-token', expires_in: 3600 }))
      .mockResolvedValueOnce(Response.json({ items: [], continuationToken: 7 }))
    vi.spyOn(httpDispatchers, 'getExternalFetch').mockReturnValue(fetch)

    await expect(
      createConfiguredMicrosoftStoreClient().queryRecurrences({ key: 'key', environment: 'test' }),
    ).rejects.toThrow('Microsoft Store recurrences response is malformed')
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('requires all service credentials before creating a client', () => {
    vi.stubEnv('MICROSOFT_STORE_TENANT_ID', '')
    expect(() => getMicrosoftStoreServiceConfig()).toThrow('MICROSOFT_STORE_TENANT_ID is required')
    vi.stubEnv('MICROSOFT_STORE_TENANT_ID', 'tenant')
    vi.stubEnv('MICROSOFT_STORE_CLIENT_ID', '')
    expect(() => getMicrosoftStoreServiceConfig()).toThrow('MICROSOFT_STORE_CLIENT_ID is required')
    vi.stubEnv('MICROSOFT_STORE_CLIENT_ID', 'client')
    vi.stubEnv('MICROSOFT_STORE_CLIENT_SECRET', '')
    expect(() => getMicrosoftStoreServiceConfig()).toThrow(
      'MICROSOFT_STORE_CLIENT_SECRET is required',
    )
  })

  it('rejects failed or malformed OAuth tokens before querying Store APIs', async () => {
    vi.stubEnv('MICROSOFT_STORE_TENANT_ID', 'failed-token-tenant')
    vi.stubEnv('MICROSOFT_STORE_CLIENT_ID', 'client-id')
    vi.stubEnv('MICROSOFT_STORE_CLIENT_SECRET', 'client-secret')
    const failedFetch = vi
      .fn<ExternalFetch>()
      .mockResolvedValue(new Response(null, { status: 503 }))
    vi.spyOn(httpDispatchers, 'getExternalFetch').mockReturnValue(failedFetch)
    await expect(
      createConfiguredMicrosoftStoreClient().queryRecurrences({ key: 'key', environment: 'test' }),
    ).rejects.toThrow('Microsoft Store service token request failed with 503')
    expect(failedFetch).toHaveBeenCalledTimes(1)

    vi.restoreAllMocks()
    vi.stubEnv('MICROSOFT_STORE_TENANT_ID', 'malformed-token-tenant')
    const malformedFetch = vi
      .fn<ExternalFetch>()
      .mockResolvedValue(Response.json({ access_token: 7, expires_in: '3600' }))
    vi.spyOn(httpDispatchers, 'getExternalFetch').mockReturnValue(malformedFetch)
    await expect(
      createConfiguredMicrosoftStoreClient().queryRecurrences({ key: 'key', environment: 'test' }),
    ).rejects.toThrow('Microsoft Store service token response is malformed')
    expect(malformedFetch).toHaveBeenCalledTimes(1)
  })

  it('rejects non-OK Store API responses and refreshes expired tokens', async () => {
    vi.stubEnv('MICROSOFT_STORE_TENANT_ID', 'short-lived-token-tenant')
    vi.stubEnv('MICROSOFT_STORE_CLIENT_ID', 'client-id')
    vi.stubEnv('MICROSOFT_STORE_CLIENT_SECRET', 'client-secret')
    const fetch = vi.fn<ExternalFetch>()
    fetch
      .mockResolvedValueOnce(Response.json({ access_token: 'expired-token', expires_in: 0 }))
      .mockResolvedValueOnce(new Response(null, { status: 429 }))
      .mockResolvedValueOnce(Response.json({ access_token: 'fresh-token', expires_in: 3600 }))
      .mockResolvedValueOnce(Response.json({ items: [] }))
    vi.spyOn(httpDispatchers, 'getExternalFetch').mockReturnValue(fetch)
    const client = createConfiguredMicrosoftStoreClient()
    await expect(client.queryRecurrences({ key: 'key', environment: 'test' })).rejects.toThrow(
      'Microsoft Store API request failed with 429',
    )
    await expect(client.queryRecurrences({ key: 'key', environment: 'test' })).resolves.toEqual([])
    expect(fetch).toHaveBeenCalledTimes(4)
    expect(fetch.mock.calls[3]?.[1]?.headers).toMatchObject({
      authorization: 'Bearer fresh-token',
    })
  })

  it('coalesces a cold service-token refresh across parallel Store API calls', async () => {
    vi.stubEnv('MICROSOFT_STORE_TENANT_ID', 'coalesced-token-tenant')
    vi.stubEnv('MICROSOFT_STORE_CLIENT_ID', 'client-id')
    vi.stubEnv('MICROSOFT_STORE_CLIENT_SECRET', 'client-secret')
    let resolveToken: (response: Response) => void
    const tokenResponse = new Promise<Response>(resolve => {
      resolveToken = resolve
    })
    const fetch = vi.fn<ExternalFetch>(url =>
      String(url).includes('/oauth2/v2.0/token')
        ? tokenResponse
        : Promise.resolve(Response.json({ items: [] })),
    )
    vi.spyOn(httpDispatchers, 'getExternalFetch').mockReturnValue(fetch)
    const client = createConfiguredMicrosoftStoreClient()
    const collections = client.queryCollections({
      key: 'collection-key',
      publisherUserId: 'publisher-user',
      productId: 'product-id',
      skuId: 'sku-id',
      environment: 'test',
    })
    const recurrences = client.queryRecurrences({ key: 'purchase-key', environment: 'test' })

    expect(fetch).toHaveBeenCalledTimes(1)
    resolveToken!(Response.json({ access_token: 'service-token', expires_in: 3600 }))
    await expect(Promise.all([collections, recurrences])).resolves.toEqual([[], []])
    expect(
      fetch.mock.calls.filter(([url]) => String(url).includes('/oauth2/v2.0/token')),
    ).toHaveLength(1)
  })

  it('marks confirmed Store ID key error payloads as terminal evidence failures', async () => {
    vi.stubEnv('MICROSOFT_STORE_TENANT_ID', 'invalid-key-tenant')
    vi.stubEnv('MICROSOFT_STORE_CLIENT_ID', 'client-id')
    vi.stubEnv('MICROSOFT_STORE_CLIENT_SECRET', 'client-secret')
    const fetch = vi
      .fn<ExternalFetch>()
      .mockResolvedValueOnce(Response.json({ access_token: 'service-token', expires_in: 3600 }))
      .mockResolvedValueOnce(
        Response.json({ error: { code: 'InvalidUserStoreIdKey' } }, { status: 401 }),
      )
    vi.spyOn(httpDispatchers, 'getExternalFetch').mockReturnValue(fetch)

    await expect(
      createConfiguredMicrosoftStoreClient().queryCollections({
        key: 'collection-key',
        publisherUserId: 'publisher-user',
        productId: 'product-id',
        skuId: 'sku-id',
        environment: 'test',
      }),
    ).rejects.toMatchObject({ invalidStoreIdKey: true, status: 401 })
  })

  it('keeps a server failure retryable even if its payload names a key error', async () => {
    vi.stubEnv('MICROSOFT_STORE_TENANT_ID', 'server-error-tenant')
    vi.stubEnv('MICROSOFT_STORE_CLIENT_ID', 'client-id')
    vi.stubEnv('MICROSOFT_STORE_CLIENT_SECRET', 'client-secret')
    const fetch = vi
      .fn<ExternalFetch>()
      .mockResolvedValueOnce(Response.json({ access_token: 'service-token', expires_in: 3600 }))
      .mockResolvedValueOnce(
        Response.json({ error: { code: 'InvalidUserStoreIdKey' } }, { status: 503 }),
      )
    vi.spyOn(httpDispatchers, 'getExternalFetch').mockReturnValue(fetch)

    await expect(
      createConfiguredMicrosoftStoreClient().queryCollections({
        key: 'collection-key',
        publisherUserId: 'publisher-user',
        productId: 'product-id',
        skuId: 'sku-id',
        environment: 'test',
      }),
    ).rejects.toMatchObject({ invalidStoreIdKey: false, status: 503 })
  })
})

function expectRequests(
  fetch: ReturnType<typeof vi.fn<ExternalFetch>>,
  start: number,
  url: string,
  bodies: unknown[],
): void {
  for (const [offset, body] of bodies.entries()) {
    const [calledUrl, options] = fetch.mock.calls[start + offset - 1]!
    expect(calledUrl).toBe(url)
    expect(JSON.parse(String(options?.body))).toEqual(body)
  }
}
