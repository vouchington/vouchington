import { afterEach, describe, expect, it, vi } from 'vitest'
import { createMicrosoftStoreServiceTickets } from './service-tickets.mts'

type TicketFetch = NonNullable<Parameters<typeof createMicrosoftStoreServiceTickets>[0]['fetch']>

describe('Microsoft Store service tickets', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('issues separate audience-scoped tickets and retains only the publisher user identity', async () => {
    const resources: string[] = []
    const fetch = async (_url: string | URL | Request, init?: RequestInit) => {
      resources.push(new URLSearchParams(init?.body as string).get('scope') ?? '')
      return new Response(
        JSON.stringify({ access_token: `ticket-${resources.length}`, expires_in: 3600 }),
        { status: 200 },
      )
    }
    await expect(
      createMicrosoftStoreServiceTickets({
        userId: 'user-1',
        config: { tenantId: 'tenant', clientId: 'client', clientSecret: 'secret' },
        fetch,
      }),
    ).resolves.toMatchObject({
      publisher_user_id: 'user-1',
      collections_service_ticket: 'ticket-1',
      purchase_service_ticket: 'ticket-2',
    })
    expect(resources.sort()).toEqual([
      'https://onestore.microsoft.com/b2b/keys/create/collections/.default',
      'https://onestore.microsoft.com/b2b/keys/create/purchase/.default',
    ])
  })

  it('requires all service configuration before issuing tickets', async () => {
    const fetch = vi.fn<TicketFetch>()
    vi.stubEnv('MICROSOFT_STORE_TENANT_ID', '')
    await expect(createMicrosoftStoreServiceTickets({ userId: 'user', fetch })).rejects.toThrow(
      'MICROSOFT_STORE_TENANT_ID is required',
    )
    vi.stubEnv('MICROSOFT_STORE_TENANT_ID', 'tenant')
    vi.stubEnv('MICROSOFT_STORE_CLIENT_ID', '')
    await expect(createMicrosoftStoreServiceTickets({ userId: 'user', fetch })).rejects.toThrow(
      'MICROSOFT_STORE_CLIENT_ID is required',
    )
    vi.stubEnv('MICROSOFT_STORE_CLIENT_ID', 'client')
    vi.stubEnv('MICROSOFT_STORE_CLIENT_SECRET', '')
    await expect(createMicrosoftStoreServiceTickets({ userId: 'user', fetch })).rejects.toThrow(
      'MICROSOFT_STORE_CLIENT_SECRET is required',
    )
    expect(fetch).not.toHaveBeenCalled()
  })

  it('fails closed on OAuth errors and malformed or too-short tickets', async () => {
    const config = { tenantId: 'tenant/id', clientId: 'client', clientSecret: 'secret' }
    const failedFetch = vi.fn<TicketFetch>().mockResolvedValue(new Response(null, { status: 503 }))
    await expect(
      createMicrosoftStoreServiceTickets({ userId: 'user', config, fetch: failedFetch }),
    ).rejects.toThrow('Microsoft Store service-ticket request failed with 503')
    expect(failedFetch.mock.calls[0]?.[0]).toBe(
      'https://login.microsoftonline.com/tenant%2Fid/oauth2/v2.0/token',
    )

    for (const malformed of [
      { access_token: 7, expires_in: 3600 },
      { access_token: 'token', expires_in: '3600' },
      { access_token: 'token', expires_in: 60 },
    ]) {
      const fetch = vi.fn<TicketFetch>(async () => Response.json(malformed))
      await expect(
        createMicrosoftStoreServiceTickets({ userId: 'user', config, fetch }),
      ).rejects.toThrow('Microsoft Store service-ticket response is malformed')
    }
  })
})
