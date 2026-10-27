import { randomUUID } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as httpDispatchers from '../../../modules/utils/http.mts'
import { createConfiguredMicrosoftStoreClient } from './configured-client.mts'

type ExternalFetch = ReturnType<typeof httpDispatchers.getExternalFetch>

describe('Microsoft Store verification throttling', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })
  it('preserves a provider throttle wait for the verification lane', async () => {
    vi.stubEnv('MICROSOFT_STORE_TENANT_ID', `tenant-${randomUUID()}`)
    vi.stubEnv('MICROSOFT_STORE_CLIENT_ID', `client-${randomUUID()}`)
    vi.stubEnv('MICROSOFT_STORE_CLIENT_SECRET', `secret-${randomUUID()}`)
    const fetch = vi
      .fn<ExternalFetch>()
      .mockResolvedValueOnce(Response.json({ access_token: 'synthetic-token', expires_in: 3600 }))
      .mockResolvedValueOnce(new Response(null, { status: 429, headers: { 'retry-after': '90' } }))
    vi.spyOn(httpDispatchers, 'getExternalFetch').mockReturnValue(fetch)
    await expect(
      createConfiguredMicrosoftStoreClient().queryRecurrences({
        key: 'synthetic',
        environment: 'test',
      }),
    ).rejects.toMatchObject({ name: 'RateLimitError', cause: { status: 429, retryAfterMs: 90000 } })
  })
})
