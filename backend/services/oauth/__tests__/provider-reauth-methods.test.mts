import { randomUUID } from 'node:crypto'
import { afterAll, describe, expect, it, vi } from 'vitest'
import {
  connectTestOAuthAccount,
  createTestUserDirect,
  insertTestOAuthAccount,
} from '@voucha/test-helpers'

vi.stubEnv('GOOGLE_CLIENT_ID', 'synthetic-reauth-client')
vi.resetModules()
const { getProviderReAuthMethods } = await import('../provider-reauth-methods.mts')

describe('getProviderReAuthMethods', () => {
  afterAll(() => {
    vi.unstubAllEnvs()
    // isolate: false keeps the config evaluated with the stubbed client ID cached for later files.
    vi.resetModules()
  })

  it('returns a configured provider linked to the user and omits unlinked ones', async () => {
    const linkedUser = await createTestUserDirect()
    const unlinkedUser = await createTestUserDirect()
    const providerUserId = randomUUID()
    await insertTestOAuthAccount('google', providerUserId, `tests+${providerUserId}@voucha.ai`)
    await connectTestOAuthAccount('google', linkedUser.id, providerUserId)

    expect(await getProviderReAuthMethods(linkedUser.id)).toEqual(['google'])
    expect(await getProviderReAuthMethods(unlinkedUser.id)).toEqual([])
  })
})
