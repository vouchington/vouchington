import type { OAuthSession } from '@modules/bluesky-oauth'
import { getBlueskyOAuthClient } from '@services/bluesky-accounts'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import {
  createRandomString,
  createTestUserDirect,
  insertTestBlueskyLinkedAccount,
} from '@voucha/test-helpers'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { disconnectAcceptedBlueskyAccountAndCleanupFollows } from './disconnect.mts'
import { requestBlueskyDisconnect } from './disconnect-request.mts'
import {
  getBlueskyFollowReceipt,
  listBlueskyFollowReceiptsForFollower,
  saveBlueskyFollowReceipt,
} from './receipts.mts'
import { blueskyFollowsWorkConfig } from './work-limits.mts'

describe('paged Bluesky disconnect', () => {
  it('attempts each remote record once even when a failed receipt remains', async () => {
    onTestFinished(
      overrideDynamicConfigFieldsForTest(blueskyFollowsWorkConfig, { backfill_batch_size: 1 }),
    )
    vi.stubEnv('SITE_ORIGIN', 'https://example.voucha.ai')
    onTestFinished(() => vi.unstubAllEnvs())
    const follower = await createTestUserDirect()
    const account = await insertTestBlueskyLinkedAccount({ userId: follower.id })
    const followees = await Promise.all([
      createTestUserDirect(),
      createTestUserDirect(),
      createTestUserDirect(),
    ])
    const records = followees.map(followee => ({
      followee,
      rkey: createRandomString(13),
    }))
    for (const { followee, rkey } of records) {
      await saveBlueskyFollowReceipt(
        follower.id,
        followee.id,
        account.bluesky_did,
        account.link_authorization_id,
        `at://${account.bluesky_did}/app.bsky.graph.follow/${rkey}`,
      )
    }

    const attempted: string[] = []
    const session = {
      did: account.bluesky_did,
      fetchHandler: async (_path: string, init: RequestInit) => {
        const body = (await new Response(init.body).json()) as { rkey: string }
        attempted.push(body.rkey)
        return attempted.length === 1
          ? new Response(JSON.stringify({ error: 'PdsError', message: 'unavailable' }), {
              status: 503,
              headers: { 'content-type': 'application/json' },
            })
          : new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } })
      },
    } as unknown as OAuthSession
    const client = await getBlueskyOAuthClient()
    const restore = vi.spyOn(client, 'restore').mockResolvedValue(session)
    // Keep the account after cleanup so the failed and successful local receipts can be inspected.
    const revoke = vi.spyOn(client, 'revoke').mockRejectedValue(new Error('revoke failed'))
    onTestFinished(() => {
      restore.mockRestore()
      revoke.mockRestore()
    })

    const request = await requestBlueskyDisconnect(follower.id)
    expect(
      await listBlueskyFollowReceiptsForFollower(
        follower.id,
        account.bluesky_did,
        account.link_authorization_id,
        null,
      ),
    ).toHaveLength(1)
    await expect(
      disconnectAcceptedBlueskyAccountAndCleanupFollows(follower.id, request),
    ).rejects.toThrow('revoke failed')

    expect(attempted).toHaveLength(records.length)
    expect(attempted.toSorted()).toEqual(records.map(record => record.rkey).toSorted())
    const receipts = await Promise.all(
      records.map(({ followee }) =>
        getBlueskyFollowReceipt(
          follower.id,
          followee.id,
          account.bluesky_did,
          account.link_authorization_id,
        ),
      ),
    )
    expect(receipts.filter(Boolean)).toEqual([
      expect.objectContaining({
        record_uri: `at://${account.bluesky_did}/app.bsky.graph.follow/${attempted[0]}`,
      }),
    ])
  })
})
