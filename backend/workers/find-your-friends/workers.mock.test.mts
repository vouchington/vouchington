import { randomInt, randomUUID } from 'node:crypto'
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest'
import { closeAndUnregisterGlideMQInstance } from '@data-stores/valkey-glide-mq'
import {
  connectTestOAuthAccount,
  createTestUser,
  deleteTestOAuthAccount,
  getTestOAuthAccountFriendsSyncedAt,
  insertTestOAuthAccount,
  setTestOAuthAccountTokens,
} from '@voucha/test-helpers'
import { getOAuthAccountByProviderUserId } from '@services/oauth-accounts/connect'
import { connectPersistedOAuthAccountFlow } from '@services/oauth/flows'
import {
  enqueueSyncFacebookFriends,
  enqueueSyncGithubFriends,
  enqueueSyncXFriends,
} from '@queues/find-your-friends/enqueues'
import { findYourFriendsQueue } from '@queues/find-your-friends/queues'
import { findYourFriends } from './workers.mts'

const fetchSpy = vi.hoisted(() => vi.fn<VitestLooseMock>())
vi.mock<typeof import('undici')>(import('undici'), async importOriginal => ({
  ...(await importOriginal<typeof import('undici')>()),
  fetch: fetchSpy,
}))

const providers = [
  {
    provider: 'facebook',
    jobName: 'syncFacebookFriends',
    accountIdKey: 'facebookAccountId',
    orderingKey: 'sync_facebook',
    enqueue: enqueueSyncFacebookFriends,
    response: { data: [] },
    endpoint: 'https://graph.facebook.com/',
  },
  {
    provider: 'x',
    jobName: 'syncXFriends',
    accountIdKey: 'xAccountId',
    orderingKey: 'sync_x',
    enqueue: enqueueSyncXFriends,
    response: { data: [] },
    endpoint: 'https://api.x.com/2/users/',
  },
  {
    provider: 'github',
    jobName: 'syncGithubFriends',
    accountIdKey: 'githubAccountId',
    orderingKey: 'sync_github',
    enqueue: enqueueSyncGithubFriends,
    response: [],
    endpoint: 'https://api.github.com/user/following',
  },
] as const

describe('friend sync worker account identities', () => {
  afterEach(() => {
    fetchSpy.mockReset()
    vi.restoreAllMocks()
  })
  afterAll(() => closeAndUnregisterGlideMQInstance(findYourFriends))

  it('enqueues an internal X account UUID when an external X identity connects', async () => {
    const owner = await createTestUser()
    const providerUserId = String(randomInt(1_000_000_000, 2_000_000_000))
    const account = await insertTestOAuthAccount('x', providerUserId)
    if (!account.account_id) throw new Error('Expected an X account UUID')
    const add = vi.spyOn(findYourFriendsQueue, 'add')

    await connectPersistedOAuthAccountFlow({
      provider: 'x',
      currentUserId: owner.id,
      account,
    })

    expect(await getOAuthAccountByProviderUserId('x', providerUserId)).toMatchObject({
      account_id: account.account_id,
      user_id: owner.id,
    })
    expect(add).toHaveBeenCalledWith(
      'syncXFriends',
      { xAccountId: account.account_id },
      expect.objectContaining({ ordering: expect.objectContaining({ key: 'sync_x' }) }),
    )
  })

  for (const config of providers) {
    it(`resolves a ${config.provider} UUID to its external identity before syncing`, async () => {
      const owner = await createTestUser()
      const providerUserId =
        config.provider === 'facebook'
          ? `fb-${randomUUID()}`
          : String(randomInt(1_000_000_000, 2_000_000_000))
      const account = await insertTestOAuthAccount(config.provider, providerUserId)
      if (!account.account_id) throw new Error(`Expected a ${config.provider} account UUID`)
      await connectTestOAuthAccount(config.provider, owner.id, providerUserId)
      await setTestOAuthAccountTokens(config.provider, providerUserId, {
        accessToken: `test-${config.provider}-${randomUUID()}`,
      })
      fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify(config.response)))

      await config.enqueue(account.account_id)

      expect(fetchSpy).toHaveBeenCalledTimes(1)
      const expectedUrl =
        config.provider === 'x' ? `/users/${providerUserId}/following` : config.endpoint
      expect(String(fetchSpy.mock.calls[0]?.[0])).toContain(expectedUrl)
      expect(await getTestOAuthAccountFriendsSyncedAt(config.provider, providerUserId)).toBeTruthy()
    })

    it(`rejects a ${config.provider} sync job without an account UUID`, async () => {
      await expect(
        findYourFriendsQueue.add(config.jobName, {} as never, {
          attempts: 1,
          removeOnComplete: true,
          removeOnFail: true,
          ordering: { key: config.orderingKey },
        }),
      ).rejects.toThrow(`${config.jobName}: ${config.accountIdKey} is required`)
      expect(fetchSpy).not.toHaveBeenCalled()
    })
  }

  it('ignores a deleted account generation instead of calling the provider', async () => {
    const owner = await createTestUser()
    const providerUserId = String(randomInt(1_000_000_000, 2_000_000_000))
    const account = await insertTestOAuthAccount('github', providerUserId)
    if (!account.account_id) throw new Error('Expected a GitHub account UUID')
    await connectTestOAuthAccount('github', owner.id, providerUserId)
    await setTestOAuthAccountTokens('github', providerUserId, {
      accessToken: `test-github-${randomUUID()}`,
    })
    await deleteTestOAuthAccount('github', providerUserId)

    await enqueueSyncGithubFriends(account.account_id)
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
