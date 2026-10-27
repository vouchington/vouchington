import { randomUUID } from 'node:crypto'
import { afterAll, afterEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import type { fetch as undiciFetch } from 'undici'
import { createRandomEmailAddress } from '@voucha/test-helpers'
import { deleteTestOAuthAccount } from '@voucha/test-helpers/entities/oauth-accounts'

type FetchResponse = Awaited<ReturnType<typeof undiciFetch>>
const fetchSpy = vi.fn<VitestLooseMock>()
vi.stubEnv('FACEBOOK_APP_ID', 'test-facebook-app')
vi.stubEnv('FACEBOOK_APP_SECRET', 'test-facebook-secret')
vi.resetModules()
vi.doMock<typeof import('undici')>(import('undici'), async importOriginal => ({
  ...(await importOriginal()),
  fetch: fetchSpy,
}))
const { prepareFacebookAccount } = await import('./index.mts')

describe('Facebook provider email handling', () => {
  afterEach(() => fetchSpy.mockReset())
  afterAll(() => {
    vi.unstubAllEnvs()
    vi.doUnmock('undici')
  })

  it('stores the provider identity without verifying the profile email', async () => {
    const providerUserId = `facebook-${randomUUID()}`
    onTestFinished(() => deleteTestOAuthAccount('facebook', providerUserId))
    fetchSpy
      .mockResolvedValueOnce(response({ access_token: 'facebook-access', expires_in: 3600 }))
      .mockResolvedValueOnce(
        response({ id: providerUserId, name: 'Member', email: createRandomEmailAddress() }),
      )

    const account = await (await prepareFacebookAccount('input-access')).persist()

    expect(account).toMatchObject({
      provider_user_id: providerUserId,
      provider_user_email_address: null,
      provider_user_data: { name: 'Member' },
    })
  })

  it('fails closed without app credentials', async () => {
    vi.stubEnv('FACEBOOK_APP_ID', '')
    vi.resetModules()
    const { upsertFacebookAuthorizationCodeAccount } = await import('./index.mts')

    await expect(
      upsertFacebookAuthorizationCodeAccount('code', 'https://example.com'),
    ).rejects.toThrow('FACEBOOK_APP_ID and FACEBOOK_APP_SECRET must be defined')
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})

function response(value: unknown): FetchResponse {
  return { ok: true, status: 200, json: () => Promise.resolve(value) } as FetchResponse
}
